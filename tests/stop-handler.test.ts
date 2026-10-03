import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import type { EffectiveState } from '../src/core/state/types';
import { runStopHandler as runStopHandlerRuntime, type StopProjectionTarget } from '../src/cli/hook/stop-handler';
import { observeRefactorRecommendations } from '../src/effects/refactor/recommendations';
import { RUN_SUMMARY_RETENTION_COUNT } from '../src/effects/run-summary-retention';
import { consumePendingPostEditEvents, readPendingPostEditEvents } from '../src/cli/hook/mutation-observed';
import { advanceArchitectureDriftCursor, computeArchitectureDriftChangedSet, readArchitectureDriftCursor } from '../src/cli/hook/architecture-drift';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

function runStopHandler(options: Parameters<typeof runStopHandlerRuntime>[0]) {
  return runStopHandlerRuntime({ ...options, env: { ...process.env, ...options.env, HOME: join(options.collector.getRepoRoot(), '.ai/harness/test-home') } });
}

function fixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-stop-handler-'));
  fixtures.push(cwd);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  mkdirSync(join(cwd, '.ai/harness/test-home/.repo-harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/policy.json'), '{}\n');
  return cwd;
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

/** A repository the drift cursor can actually anchor to. */
function gitFixture(): { cwd: string; head: string } {
  const cwd = realpathSync(fixture());
  git(cwd, ['init', '-b', 'main']);
  git(cwd, ['config', 'user.email', 'stop-handler@example.com']);
  git(cwd, ['config', 'user.name', 'Stop Handler Test']);
  writeFileSync(join(cwd, '.gitignore'), '.ai/harness/\n');
  writeFileSync(join(cwd, 'README.md'), '# fixture\n');
  git(cwd, ['add', '-A']);
  git(cwd, ['commit', '-m', 'seed']);
  return { cwd, head: git(cwd, ['rev-parse', 'HEAD']) };
}

function canonicalState(options: {
  profile?: 'routine' | 'high';
  stop?: 'allow' | 'block';
  stopReasons?: readonly string[];
  ship?: 'allow' | 'block';
  shipReasons?: readonly string[];
} = {}): EffectiveState {
  const stop = options.stop ?? 'allow';
  const ship = options.ship ?? 'allow';
  return {
    workflow_profile: options.profile ?? 'routine',
    review: { path: null, freshness: 'missing', recommendation: null, recorded_subject_sha256: null, recorded_target_revision: null },
    readiness: {
      ok: true,
      allowedToEdit: { decision: 'allow' },
      allowedToStop: stop === 'block' ? { decision: 'block', reasons: options.stopReasons ?? ['required_recovery_state_missing'] } : { decision: 'allow' },
      readyToShip: ship === 'block' ? { decision: 'block', reasons: options.shipReasons ?? ['required_review_missing'] } : { decision: 'allow' },
      requirements: { edit: [], stop: [], ship: [] },
      nextAction: null,
    },
  } as unknown as EffectiveState;
}

function collector(cwd: string, resolveState: () => EffectiveState, activePlan: string | null = null) {
  return {
    getRepoRoot: () => cwd,
    getWorktreeOwnership: () => ({ owner: null, ownedByCurrent: false }),
    getActivePlanMarker: () => activePlan,
    getStopEffectiveState: resolveState,
  };
}

function seedMinimalChange(cwd: string): void {
  mkdirSync(join(cwd, '.ai/harness/checks'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/checks/minimal-change.latest.json'), `${JSON.stringify({
    version: 1,
    verdict: 'review',
    report_path: '.ai/harness/checks/minimal-change.latest.json',
    findings: [{ tag: 'scope', path: 'src/example.ts', question: 'Is this required?' }],
  })}\n`);
  writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({
    minimal_change: { mode: 'advice', stop_review: true, report_path: '.ai/harness/checks/minimal-change.latest.json' },
  })}\n`);
}

const ENFORCE_FINGERPRINT = 'sha256:0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0';

/** minimal_change enforce fixture: a `review` verdict with a stable fingerprint. */
function seedMinimalChangeEnforce(cwd: string, fingerprint = ENFORCE_FINGERPRINT): void {
  mkdirSync(join(cwd, '.ai/harness/checks'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/checks/minimal-change.latest.json'), `${JSON.stringify({
    version: 1,
    verdict: 'review',
    fingerprint,
    report_path: '.ai/harness/checks/minimal-change.latest.json',
    findings: [{ tag: 'dependency', path: 'package.json', question: 'Is the new dependency required?' }],
  })}\n`);
  writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({
    minimal_change: { mode: 'enforce', stop_review: true, report_path: '.ai/harness/checks/minimal-change.latest.json' },
  })}\n`);
}

function writeAuditReceipt(cwd: string, receipt: unknown): void {
  writeFileSync(
    join(cwd, '.ai/harness/checks/minimal-change-audit.latest.json'),
    `${JSON.stringify(receipt)}\n`,
  );
}

function seedDelegation(cwd: string, scope = 'turn-ordered'): string {
  const dir = join(cwd, '.ai/harness/delegation');
  mkdirSync(join(dir, 'turns'), { recursive: true });
  const state = {
    scope_id: scope,
    state_file: `turns/${scope}.json`,
    eligible: true,
    explicit: true,
    spawned: false,
    created_at_epoch: Math.floor(Date.now() / 1000),
  };
  writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(state, null, 2)}\n`);
  const statePath = join(dir, 'turns', `${scope}.json`);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return statePath;
}

function normalizedStopArtifacts(cwd: string, runId: string): Record<string, string> {
  const paths = {
    handoff: join(cwd, '.ai/harness/handoff/current.md'),
    resume: join(cwd, '.ai/harness/handoff/resume.md'),
    events: join(cwd, '.ai/harness/events.jsonl'),
    runSummary: join(cwd, '.ai/harness/runs', `${runId}.json`),
  };
  const normalize = (value: string): string => value
    .replaceAll(cwd, '<repo>')
    .replace(/^> \*\*Working Directory\*\*: .*$/gm, '> **Working Directory**: <repo>')
    .replace(/Content hash: sha256:[0-9a-f]+/g, 'Content hash: <normalized>');
  return Object.fromEntries(Object.entries(paths).map(([key, path]) => [
    key,
    existsSync(path)
      ? key === 'events'
        ? readFileSync(path, 'utf8').split('\n').filter(Boolean).map((line) => {
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            delete event.ts;
            return JSON.stringify(event);
          } catch {
            return line;
          }
        }).join('\n') + '\n'
        : normalize(readFileSync(path, 'utf8'))
      : '(missing)',
  ]));
}

describe('Stop recovery and safety invariants', () => {
  test('commits the exact four-target projection once before the single state resolution', () => {
    const cwd = fixture();
    const observed: StopProjectionTarget[] = [];
    let resolutions = 0;
    const result = runStopHandler({
      collector: collector(cwd, () => {
        resolutions += 1;
        expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(true);
        expect(existsSync(join(cwd, '.ai/harness/handoff/resume.md'))).toBe(true);
        expect(observed.map((item) => item.kind)).toEqual(['handoff', 'resume', 'event', 'run-summary']);
        return canonicalState();
      }),
      input: JSON.stringify({ stop_hook_active: false }),
      env: { HOOK_RUN_ID: 'stop-write-count' },
      dependencies: { observeProjectionWrite: (target) => observed.push(target) },
    });

    expect(result.exitCode).toBe(0);
    expect(resolutions).toBe(1);
    expect(observed).toHaveLength(4);
    expect(new Set(observed.map((item) => item.path)).size).toBe(4);
    expect(readFileSync(join(cwd, '.ai/harness/handoff/current.md'), 'utf8')).not.toContain('Minimal Change Review');
  });

  test('preserves the recovery projection workflow-context fields (EPC-07: content source moved to the recovery materializer; two evidence-shaped assertions below updated -- see contract Phase A)', () => {
    const cwd = fixture();
    const plan = 'plans/plan-20260720-0000-projection.md';
    const contract = 'tasks/contracts/20260720-0000-projection.contract.md';
    const review = 'tasks/reviews/20260720-0000-projection.review.md';
    const notes = 'tasks/notes/20260720-0000-projection.notes.md';
    const sprint = 'plans/sprints/20260720-projection.sprint.md';
    for (const directory of ['plans', 'plans/sprints', 'tasks', 'tasks/contracts', 'tasks/reviews', 'tasks/notes', '.claude', '.ai/harness/sprint', '.ai/harness/checks']) {
      mkdirSync(join(cwd, directory), { recursive: true });
    }
    writeFileSync(join(cwd, plan), [
      '# Projection plan',
      `> **Task Contract**: ${contract}`,
      `> **Task Review**: ${review}`,
      `> **Implementation Notes**: ${notes}`,
      '## Task Breakdown',
      '- [x] completed item',
      '- [ ] preserve the real next action',
      '## Evidence',
      '',
    ].join('\n'));
    writeFileSync(join(cwd, 'tasks/todos.md'), '# Deferred\n> **Source Plan**: plans/source-plan.md\n');
    writeFileSync(join(cwd, sprint), `| 6 | hrd-06 | ${plan} |\n`);
    writeFileSync(join(cwd, '.ai/harness/sprint/active-sprint'), `${sprint}\n`);
    writeFileSync(join(cwd, '.claude/.trace.jsonl'), '{"command":"one"}\n{"command":"two"}\n');
    writeFileSync(join(cwd, '.claude/.task-state.json'), '{"source_plan":"plans/superseded.md"}\n');
    writeFileSync(join(cwd, '.ai/harness/checks/latest.json'), '{"run_file":".ai/harness/runs/verified.json"}\n');

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState(), plan),
      env: { HOOK_RUN_ID: 'projection-parity' },
    });

    expect(result.exitCode).toBe(0);
    const handoff = readFileSync(join(cwd, '.ai/harness/handoff/current.md'), 'utf8');
    expect(handoff).toContain('Continue task checklist sourced from plans/source-plan.md.');
    expect(handoff).toContain(`- Active sprint row: | 6 | hrd-06 | ${plan} |`);
    expect(handoff).toContain('- {"command":"one"}\n- {"command":"two"}');
    // EPC-07: the old "Latest trace" line re-derived evidence directly from
    // checks/latest.json content (a single-hop violation this package fixes);
    // the recovery materializer's "## Evidence" section now sources only from
    // the checkpoint, rendering a typed minimal state when none is published
    // yet (this fixture seeds no ledger/checkpoint).
    expect(handoff).toContain('- Checkpoint: (none published yet -- no ledger evidence recorded in this worktree)');
    expect(handoff).toContain('continue the next Task Breakdown item: preserve the real next action');
    expect(handoff).toContain('- Next action stage: task');
    expect(handoff).toContain('- Supersedes: plans/superseded.md');
    expect(handoff).toContain('- Todo Source Plan: plans/source-plan.md');
    const resume = readFileSync(join(cwd, '.ai/harness/handoff/resume.md'), 'utf8');
    // EPC-07: resume.md is now the single merged materializer output (the
    // two-tier minimal/elaborate split is retired); the legacy elaborate-resume
    // marker is preserved verbatim as the stable external-observable contract
    // session-context.ts's resumeAvailable() already depends on (see contract).
    expect(resume).toContain('<!-- generated-by: repo-harness codex-handoff-resume v1 -->');
    expect(resume).toContain('## Provenance');
    const event = JSON.parse(readFileSync(join(cwd, '.ai/harness/events.jsonl'), 'utf8'));
    expect(event.extra.source_plan).toBe('plans/source-plan.md');
  });

  test('does not shadow canonical finish authority when the active plan is complete', () => {
    const cwd = fixture();
    const plan = 'plans/plan-20260720-0001-complete.md';
    mkdirSync(join(cwd, 'plans'), { recursive: true });
    writeFileSync(join(cwd, plan), '# Complete\n## Task Breakdown\n- [x] done\n');

    runStopHandler({
      collector: collector(cwd, () => canonicalState(), plan),
      env: { HOOK_RUN_ID: 'projection-complete-plan' },
    });

    const handoff = readFileSync(join(cwd, '.ai/harness/handoff/current.md'), 'utf8');
    expect(handoff).toContain('- Next action stage: check');
    expect(handoff).toContain('let canonical workflow gates determine whether review, external acceptance, verification, or worktree finish is next. Command: /check');
    expect(handoff).not.toContain('finish and fast-forward merge');
  });

  test('ignores an active-plan marker owned by a foreign worktree', () => {
    const cwd = fixture();
    const plan = 'plans/plan-20260720-0002-foreign.md';
    mkdirSync(join(cwd, 'plans'), { recursive: true });
    writeFileSync(join(cwd, plan), '# Foreign plan\n## Task Breakdown\n- [ ] must not leak\n');
    const foreignCollector = {
      ...collector(cwd, () => canonicalState(), plan),
      getWorktreeOwnership: () => ({ owner: '/tmp/other-worktree', ownedByCurrent: false }),
    };

    runStopHandler({ collector: foreignCollector, env: { HOOK_RUN_ID: 'projection-foreign-owner' } });

    const handoff = readFileSync(join(cwd, '.ai/harness/handoff/current.md'), 'utf8');
    expect(handoff).toContain('- Active plan: (none)');
    expect(handoff).not.toContain('must not leak');
  });

  test('fails closed before a policy-controlled projection can follow a symlink outside the repo', () => {
    const cwd = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'repo-harness-stop-outside-'));
    fixtures.push(outside);
    symlinkSync(outside, join(cwd, '.ai/harness/link'));
    writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({
      harness: { handoff_file: '.ai/harness/link/current.md' },
    })}\n`);

    expect(() => runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { HOOK_RUN_ID: 'symlink-run' },
    })).toThrow('symlinked write path is forbidden');
    expect(existsSync(join(outside, 'current.md'))).toBe(false);
  });

  test('fails closed before the event lock can follow a sibling .locks symlink', () => {
    const cwd = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'repo-harness-stop-lock-outside-'));
    fixtures.push(outside);
    symlinkSync(outside, join(cwd, '.ai/harness/.locks'));

    expect(() => runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { HOOK_RUN_ID: 'event-lock-symlink' },
    })).toThrow('symlinked write path is forbidden');
    expect(existsSync(join(outside, 'evt-events.jsonl.lock'))).toBe(false);
  });

  test('fails closed when a run id would move the run summary outside the repo', () => {
    const cwd = fixture();
    const outside = join(dirname(cwd), 'outside-run.json');
    expect(() => runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { HOOK_RUN_ID: '../../../../outside-run' },
    })).toThrow('write path escapes repository');
    expect(existsSync(outside)).toBe(false);
  });

  test('each named Stop commit phase converges on a fresh retry without duplicate events', () => {
    const phases: StopProjectionTarget['kind'][] = ['handoff', 'resume', 'event', 'run-summary'];
    const runId = 'effect-matrix-run';
    const faultNow = new Date('2026-08-14T08:00:00.000Z');
    const retryNow = new Date('2026-08-14T08:01:00.000Z');

    const baselineRoot = fixture();
    runStopHandler({
      collector: collector(baselineRoot, () => canonicalState()),
      env: { HOOK_RUN_ID: runId },
      dependencies: { now: () => retryNow },
    });
    const baseline = normalizedStopArtifacts(baselineRoot, runId);

    for (const phase of phases) {
      const retryRoot = fixture();
      expect(() => runStopHandler({
        collector: collector(retryRoot, () => canonicalState()),
        env: { HOOK_RUN_ID: runId },
        dependencies: {
          now: () => faultNow,
          afterProjectionWrite: (target) => {
            if (target.kind === phase) throw new Error(`fault after ${phase}`);
          },
        },
      })).toThrow(`fault after ${phase}`);

      runStopHandler({
        collector: collector(retryRoot, () => canonicalState()),
        env: { HOOK_RUN_ID: runId },
        dependencies: { now: () => retryNow },
      });
      expect(normalizedStopArtifacts(retryRoot, runId)).toEqual(baseline);
      const events = readFileSync(join(retryRoot, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
      expect(events).toHaveLength(1);
    }
  }, 60_000);

  test('event retry finds its semantic key beyond 64KiB of legal shared-log inserts', () => {
    const cwd = fixture();
    const runId = 'interleaved-event-run';
    expect(() => runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { HOOK_RUN_ID: runId },
      dependencies: {
        now: () => new Date('2026-08-14T08:00:00.000Z'),
        afterProjectionWrite: (target) => {
          if (target.kind === 'event') throw new Error('fault after event');
        },
      },
    })).toThrow('fault after event');
    const eventsPath = join(cwd, '.ai/harness/events.jsonl');
    const inserted = `${JSON.stringify({
      ts: '2026-08-14T08:00:30+0800',
      event_type: 'operator-event',
      reason: 'legal shared writer',
      run_id: 'operator-run',
      extra: { payload: 'x'.repeat(70 * 1024) },
    })}\n`;
    writeFileSync(eventsPath, `${readFileSync(eventsPath, 'utf8')}${inserted}`);

    runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { HOOK_RUN_ID: runId },
      dependencies: { now: () => new Date('2026-08-14T08:01:00.000Z') },
    });
    const events = readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean);
    expect(events).toHaveLength(2);
    expect(events.filter((line) => JSON.parse(line).event_type === 'handoff_refresh')).toHaveLength(1);
  });

  test('event reconciliation is latest-Stop only and fails closed beyond its bounded window', () => {
    const cwd = fixture();
    const runId = 'latest-stop-run';
    const run = (minute: number) => runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { HOOK_RUN_ID: runId },
      dependencies: { now: () => new Date(`2026-08-14T08:0${minute}:00.000Z`) },
    });
    run(0);
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(join(cwd, '.claude/.trace.jsonl'), '{"command":"B"}\n');
    run(1);
    writeFileSync(join(cwd, '.claude/.trace.jsonl'), '');
    run(2);
    let events = readFileSync(join(cwd, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
    expect(events).toHaveLength(3);

    const overflowRoot = fixture();
    expect(() => runStopHandler({
      collector: collector(overflowRoot, () => canonicalState()),
      env: { HOOK_RUN_ID: 'overflow-run' },
      dependencies: {
        now: () => new Date('2026-08-14T08:00:00.000Z'),
        afterProjectionWrite: (target) => {
          if (target.kind === 'event') throw new Error('fault after event');
        },
      },
    })).toThrow('fault after event');
    const overflowEvents = join(overflowRoot, '.ai/harness/events.jsonl');
    writeFileSync(overflowEvents, `${readFileSync(overflowEvents, 'utf8')}${JSON.stringify({
      ts: '2026-08-14T08:00:30+0800', event_type: 'operator-event', reason: 'overflow', run_id: 'operator',
      extra: { payload: 'x'.repeat(2 * 1024 * 1024) },
    })}\n`);
    expect(() => runStopHandler({
      collector: collector(overflowRoot, () => canonicalState()),
      env: { HOOK_RUN_ID: 'overflow-run' },
      dependencies: { now: () => new Date('2026-08-14T08:01:00.000Z') },
    })).toThrow('latest Stop event is outside the 1048576-byte reconciliation window');
    events = readFileSync(overflowEvents, 'utf8').trim().split('\n').filter(Boolean);
    expect(events.filter((line) => JSON.parse(line).event_type === 'handoff_refresh')).toHaveLength(1);
  });

  test('the same run can append a later Stop when projection semantics change', () => {
    const cwd = fixture();
    mkdirSync(join(cwd, 'plans'), { recursive: true });
    writeFileSync(join(cwd, 'plans/one.md'), '# one\n');
    writeFileSync(join(cwd, 'plans/two.md'), '# two\n');
    mkdirSync(join(cwd, 'tasks'), { recursive: true });
    writeFileSync(join(cwd, 'tasks/todos.md'), '# Deferred\n> **Source Plan**: plans/one.md\n');
    const now = new Date('2026-08-14T08:00:00.000Z');
    runStopHandler({
      collector: collector(cwd, () => canonicalState(), 'plans/one.md'),
      env: { HOOK_RUN_ID: 'semantic-run' },
      dependencies: { now: () => now },
    });
    writeFileSync(join(cwd, 'tasks/todos.md'), '# Deferred\n> **Source Plan**: plans/two.md\n');
    runStopHandler({
      collector: collector(cwd, () => canonicalState(), 'plans/two.md'),
      env: { HOOK_RUN_ID: 'semantic-run' },
      dependencies: { now: () => new Date('2026-08-14T08:01:00.000Z') },
    });

    const events = readFileSync(join(cwd, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[0]!).extra.source_plan).toBe('plans/one.md');
    expect(JSON.parse(events[1]!).extra.source_plan).toBe('plans/two.md');
  });

  test('the same run and plan append a later Stop when the live changed set changes', () => {
    const { cwd } = gitFixture();
    const firstNow = new Date('2026-08-14T08:00:00.000Z');
    runStopHandler({
      collector: collector(cwd, () => canonicalState(), null),
      env: { HOOK_RUN_ID: 'changed-set-run' },
      dependencies: { now: () => firstNow },
    });
    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src/new-change.ts'), 'export const changed = true;\n');
    runStopHandler({
      collector: collector(cwd, () => canonicalState(), null),
      env: { HOOK_RUN_ID: 'changed-set-run' },
      dependencies: { now: () => new Date('2026-08-14T08:01:00.000Z') },
    });
    const events = readFileSync(join(cwd, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
    expect(events).toHaveLength(2);
  });

  test('the same run appends when recovery-only rendered inputs change', () => {
    const mutations: readonly ((cwd: string) => void)[] = [
      (cwd) => {
        mkdirSync(join(cwd, '.claude'), { recursive: true });
        writeFileSync(join(cwd, '.claude/.trace.jsonl'), '{"command":"bun test"}\n');
      },
      (cwd) => {
        mkdirSync(join(cwd, '.claude'), { recursive: true });
        writeFileSync(join(cwd, '.claude/.task-state.json'), '{"source_plan":"plans/superseded.md"}\n');
      },
      (cwd) => {
        mkdirSync(join(cwd, 'plans/sprints'), { recursive: true });
        writeFileSync(join(cwd, 'plans/sprints/sprint.md'), '# Sprint\n\n## Backlog\n\n| ID | Task | Status |\n|---|---|---|\n| S1 | Changed row | pending |\n');
        mkdirSync(join(cwd, '.ai/harness/sprint'), { recursive: true });
        writeFileSync(join(cwd, '.ai/harness/sprint/active-sprint'), 'plans/sprints/sprint.md\n');
      },
    ];

    for (const [index, mutate] of mutations.entries()) {
      const cwd = fixture();
      const runId = `recovery-input-run-${index}`;
      const codexHome = join(cwd, 'codex-home');
      runStopHandler({
        collector: collector(cwd, () => canonicalState()),
        env: { HOOK_RUN_ID: runId, CODEX_HOME: codexHome },
        dependencies: { now: () => new Date('2026-08-14T08:00:00.000Z') },
      });
      mutate(cwd);
      runStopHandler({
        collector: collector(cwd, () => canonicalState()),
        env: { HOOK_RUN_ID: runId, CODEX_HOME: codexHome },
        dependencies: { now: () => new Date('2026-08-14T08:01:00.000Z') },
      });
      const events = readFileSync(join(cwd, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
      expect(events, `recovery input mutation ${index}`).toHaveLength(2);
    }

    const cwd = fixture();
    const codexHome = join(cwd, 'codex-home');
    const env = { HOOK_RUN_ID: 'global-handoff-run', CODEX_HOME: codexHome };
    runStopHandler({
      collector: collector(cwd, () => canonicalState()), env,
      dependencies: { now: () => new Date('2026-08-14T08:00:00.000Z') },
    });
    mkdirSync(join(codexHome, 'handoffs'), { recursive: true });
    writeFileSync(join(codexHome, 'handoffs/handoff-20260814.md'), '# global\n');
    runStopHandler({
      collector: collector(cwd, () => canonicalState()), env,
      dependencies: { now: () => new Date('2026-08-14T08:01:00.000Z') },
    });
    const events = readFileSync(join(cwd, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n').filter(Boolean);
    expect(events).toHaveLength(2);
  });

  test('the same run appends when artifact or policy-derived recovery paths change', () => {
    const plan = 'plans/plan-20260814-0000-key-inputs.md';
    const planBody = (review: string, notes: string) => [
      '# Projection key inputs',
      `> **Task Review**: ${review}`,
      `> **Implementation Notes**: ${notes}`,
      '## Task Breakdown',
      '- [ ] continue',
      '',
    ].join('\n');

    const artifactRoot = fixture();
    mkdirSync(join(artifactRoot, 'plans'), { recursive: true });
    writeFileSync(join(artifactRoot, plan), planBody('tasks/reviews/one.review.md', 'tasks/notes/one.notes.md'));
    const artifactRun = (minute: number) => runStopHandler({
      collector: collector(artifactRoot, () => canonicalState(), plan),
      env: { HOOK_RUN_ID: 'artifact-key-run' },
      dependencies: { now: () => new Date(`2026-08-14T08:0${minute}:00.000Z`) },
    });
    artifactRun(0);
    writeFileSync(join(artifactRoot, plan), planBody('tasks/reviews/two.review.md', 'tasks/notes/two.notes.md'));
    artifactRun(1);
    expect(readFileSync(join(artifactRoot, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);

    const policyRoot = fixture();
    const policyRun = (minute: number) => runStopHandler({
      collector: collector(policyRoot, () => canonicalState()),
      env: { HOOK_RUN_ID: 'policy-path-key-run' },
      dependencies: { now: () => new Date(`2026-08-14T08:0${minute}:00.000Z`) },
    });
    policyRun(0);
    writeFileSync(join(policyRoot, '.ai/harness/policy.json'), `${JSON.stringify({
      harness: { checks_file: '.ai/harness/checks/alternate.json' },
      context: { map_file: '.ai/harness/context/alternate.json' },
      tasks: { todo_file: '.ai/harness/tasks/alternate.md', research_dir: 'docs/alternate-research' },
    })}\n`);
    policyRun(1);
    expect(readFileSync(join(policyRoot, '.ai/harness/events.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
  });
});


describe('Stop observes workflow gaps without permission gates', () => {
  test('missing recovery/readiness/review receipts do not prevent stopping', () => {
    const cwd = fixture(); seedMinimalChangeEnforce(cwd);
    const result = runStopHandler({ collector: collector(cwd, () => canonicalState({ profile: 'high', stop: 'block', ship: 'block' })) });
    expect(result.exitCode).toBe(0); expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Publication not verified');
    expect(result.stderr).toContain('Non-blocking review');
    expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(true);
  });
  test('Stop does not start architecture provider, create a drift cursor or enqueue capability work', () => {
    const { cwd } = gitFixture();
    mkdirSync(join(cwd, 'src'), { recursive: true }); writeFileSync(join(cwd, 'src/change.ts'), 'export const x = 1;');
    const result = runStopHandler({ collector: collector(cwd, () => canonicalState()), env: {
      REPO_HARNESS_ARCHITECTURE_PROJECTION_FAILURE_GATE: 'strict',
    } });
    expect(result.stdout).toBe(''); expect(readArchitectureDriftCursor(cwd)).toBeNull();
    expect(existsSync(join(cwd, '.ai/harness/capability-context/requests.jsonl'))).toBe(false);
  });
});
