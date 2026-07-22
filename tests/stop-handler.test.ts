import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import type { EffectiveState } from '../src/core/state/types';
import { runStopHandler, type StopProjectionTarget } from '../src/cli/hook/stop-handler';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

function fixture(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-stop-handler-'));
  fixtures.push(cwd);
  mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
  writeFileSync(join(cwd, '.ai/harness/policy.json'), '{}\n');
  return cwd;
}

function canonicalState(options: {
  profile?: 'lite' | 'standard' | 'strict';
  stop?: 'allow' | 'block';
  stopReasons?: readonly string[];
  ship?: 'allow' | 'block';
  shipReasons?: readonly string[];
} = {}): EffectiveState {
  const stop = options.stop ?? 'allow';
  const ship = options.ship ?? 'allow';
  return {
    workflow_profile: options.profile ?? 'standard',
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

function seedDelegation(cwd: string, scope = 'turn-ordered'): string {
  const dir = join(cwd, '.ai/harness/delegation');
  mkdirSync(join(dir, 'turns'), { recursive: true });
  const state = {
    scope_id: scope,
    state_file: `turns/${scope}.json`,
    eligible: true,
    explicit: true,
    spawned: false,
    fallback_used: false,
    stop_fallback: true,
    created_at_epoch: Math.floor(Date.now() / 1000),
  };
  writeFileSync(join(dir, 'latest.json'), `${JSON.stringify(state, null, 2)}\n`);
  const statePath = join(dir, 'turns', `${scope}.json`);
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return statePath;
}

describe('runStopHandler', () => {
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

  test('readiness wins over plan completeness and delegation without a minimal-change suffix', () => {
    const cwd = fixture();
    seedMinimalChange(cwd);
    const delegation = seedDelegation(cwd);
    mkdirSync(join(cwd, '.ai/harness/planning'), { recursive: true });
    writeFileSync(join(cwd, '.ai/harness/planning/pending.json'), `${JSON.stringify({ kind: 'codex-plan', prompt_slug: 'ordered', created_at: 'now' })}\n`);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState({ stop: 'block' })),
      input: JSON.stringify({
        turn_id: 'ordered',
        last_assistant_message: `Approach ${'decision-complete '.repeat(20)}`,
      }),
      env: { HOOK_RUN_ID: 'stop-readiness-first' },
    });

    expect(result.stdout).toContain('[ReadinessGate]');
    expect(result.stdout).not.toContain('[MinimalChange]');
    expect(existsSync(join(cwd, '.ai/harness/planning/plan-completeness.json'))).toBe(false);
    expect(JSON.parse(readFileSync(delegation, 'utf8')).fallback_used).toBe(false);
  });

  test('plan completeness wins over delegation and carries the minimal-change suffix', () => {
    const cwd = fixture();
    seedMinimalChange(cwd);
    const delegation = seedDelegation(cwd);
    mkdirSync(join(cwd, '.ai/harness/planning'), { recursive: true });
    writeFileSync(join(cwd, '.ai/harness/planning/pending.json'), `${JSON.stringify({ kind: 'codex-plan', prompt_slug: 'ordered', created_at: 'now' })}\n`);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({
        turn_id: 'ordered',
        last_assistant_message: `Approach ${'decision-complete '.repeat(20)}`,
      }),
      env: { HOOK_RUN_ID: 'stop-plan-first' },
    });

    expect(result.stdout).toContain('[PlanCompletenessGate]');
    expect(result.stdout).toContain('[MinimalChange]');
    expect(result.stdout).not.toContain('[DelegationFallback]');
    expect(JSON.parse(readFileSync(delegation, 'utf8')).fallback_used).toBe(false);
  });

  test('delegation fallback is last, carries the suffix, and lite skips it', () => {
    const cwd = fixture();
    seedMinimalChange(cwd);
    const delegation = seedDelegation(cwd);
    const standard = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: 'ordered' }),
      env: { HOOK_RUN_ID: 'stop-delegation-last' },
    });
    expect(standard.stdout).toContain('[DelegationFallback]');
    expect(standard.stdout).toContain('[MinimalChange]');
    expect(JSON.parse(readFileSync(delegation, 'utf8')).fallback_used).toBe(true);

    const liteCwd = fixture();
    const liteDelegation = seedDelegation(liteCwd);
    const lite = runStopHandler({
      collector: collector(liteCwd, () => canonicalState({ profile: 'lite' })),
      input: JSON.stringify({ turn_id: 'ordered' }),
      env: { HOOK_RUN_ID: 'stop-lite' },
    });
    expect(lite.stdout).toBe('');
    expect(JSON.parse(readFileSync(liteDelegation, 'utf8')).fallback_used).toBe(false);
  });
});
