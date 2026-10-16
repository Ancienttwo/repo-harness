import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';
import { runStopHandler as runStopHandlerRuntime, type StopProjectionTarget } from '../src/cli/hook/stop-handler';
import { hookIdentity } from './helpers/hook-identity';

const fixtures: string[] = [];

afterEach(() => {
  while (fixtures.length > 0) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

type StopRuntimeInput = Parameters<typeof runStopHandlerRuntime>[0];

/** Defaults an empty payload and a run-less Claude identity; isolates HOME. */
function runStopHandler(options: Omit<StopRuntimeInput, 'payload' | 'identity'> & Partial<Pick<StopRuntimeInput, 'payload' | 'identity'>>) {
  return runStopHandlerRuntime({
    payload: {},
    identity: hookIdentity(),
    ...options,
    env: { ...process.env, ...options.env, HOME: join(options.collector.getRepoRoot(), '.ai/harness/test-home') },
  });
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

/** A committed repository with a real HEAD. */
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

/** Stop reads ownership and the active plan only; it never resolves the effective state. */
function collector(cwd: string, activePlan: string | null = null) {
  return {
    getRepoRoot: () => cwd,
    getWorktreeOwnership: () => ({ current: cwd, owner: null, ownedByCurrent: false }),
    getActivePlanMarker: () => activePlan,
    getEffectiveState: () => { throw new Error('Stop must not resolve the effective state'); },
  };
}

function stopArtifacts(cwd: string): Record<string, string> {
  const paths = {
    handoff: join(cwd, '.ai/harness/handoff/current.md'),
    resume: join(cwd, '.ai/harness/handoff/resume.md'),
  };
  return Object.fromEntries(Object.entries(paths).map(([key, path]) => [
    key,
    existsSync(path) ? readFileSync(path, 'utf8').replaceAll(cwd, '<repo>') : '(missing)',
  ]));
}

describe('Stop recovery and safety invariants', () => {
  test('writes handoff then resume and nothing else', () => {
    const cwd = fixture();
    const observed: StopProjectionTarget[] = [];
    const result = runStopHandler({
      collector: collector(cwd),
      payload: { stop_hook_active: false },
      identity: hookIdentity({ runId: 'stop-write-count' }),
      dependencies: { observeProjectionWrite: (target) => observed.push(target) },
    });

    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(observed).toEqual([
      { kind: 'handoff', path: '.ai/harness/handoff/current.md' },
      { kind: 'resume', path: '.ai/harness/handoff/resume.md' },
    ]);
    expect(existsSync(join(cwd, '.ai/harness/events.jsonl'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/runs'))).toBe(false);
  });

  test('two identical Stops write identical handoff and resume files and no events.jsonl line', () => {
    const cwd = fixture();
    const now = new Date('2026-08-14T08:00:00.000Z');
    const stop = () => runStopHandler({ collector: collector(cwd), dependencies: { now: () => now } });

    expect(stop().exitCode).toBe(0);
    const first = stopArtifacts(cwd);
    expect(stop().exitCode).toBe(0);

    expect(stopArtifacts(cwd)).toEqual(first);
    expect(first.handoff).not.toBe('(missing)');
    expect(first.resume).not.toBe('(missing)');
    expect(existsSync(join(cwd, '.ai/harness/events.jsonl'))).toBe(false);
  });

  test('renders the payload run identity and mints none when the host sends no run', () => {
    const named = fixture();
    runStopHandler({ collector: collector(named), identity: hookIdentity({ runId: 'host-run-7' }) });
    expect(readFileSync(join(named, '.ai/harness/handoff/current.md'), 'utf8')).toContain('- Parent Run ID: host-run-7');

    const runless = fixture();
    runStopHandler({ collector: collector(runless), identity: hookIdentity({ runId: null }) });
    const handoff = readFileSync(join(runless, '.ai/harness/handoff/current.md'), 'utf8');
    expect(handoff).toContain('- Parent Run ID: (unresolved)');
    expect(handoff).not.toMatch(/Parent Run ID: run-/);
  });

  test('preserves the recovery projection workflow-context fields', () => {
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
    writeFileSync(join(cwd, '.claude/.task-state.json'), '{"source_plan":"plans/superseded.md"}\n');
    writeFileSync(join(cwd, '.ai/harness/checks/latest.json'), '{"run_file":".ai/harness/runs/verified.json"}\n');

    const result = runStopHandler({
      collector: collector(cwd, plan),
      identity: hookIdentity({ runId: 'projection-parity' }),
    });

    expect(result.exitCode).toBe(0);
    const handoff = readFileSync(join(cwd, '.ai/harness/handoff/current.md'), 'utf8');
    expect(handoff).toContain('Continue task checklist sourced from plans/source-plan.md.');
    expect(handoff).toContain(`- Active sprint row: | 6 | hrd-06 | ${plan} |`);
    expect(handoff).not.toContain('## Commands Run');
    // The "## Evidence" section sources only from the checkpoint and renders a
    // typed minimal state when none is published (this fixture seeds no ledger).
    expect(handoff).toContain('- Checkpoint: (none published yet -- no ledger evidence recorded in this worktree)');
    expect(handoff).toContain('continue the next Task Breakdown item: preserve the real next action');
    expect(handoff).toContain('- Next action stage: task');
    expect(handoff).toContain('- Supersedes: plans/superseded.md');
    expect(handoff).toContain('- Todo Source Plan: plans/source-plan.md');
    const resume = readFileSync(join(cwd, '.ai/harness/handoff/resume.md'), 'utf8');
    // The legacy marker is the stable external contract that session-context's
    // resume check reads.
    expect(resume).toContain('<!-- generated-by: repo-harness codex-handoff-resume v1 -->');
    expect(resume).toContain('## Provenance');
  });

  test('does not shadow canonical finish authority when the active plan is complete', () => {
    const cwd = fixture();
    const plan = 'plans/plan-20260720-0001-complete.md';
    mkdirSync(join(cwd, 'plans'), { recursive: true });
    writeFileSync(join(cwd, plan), '# Complete\n## Task Breakdown\n- [x] done\n');

    runStopHandler({
      collector: collector(cwd, plan),
      identity: hookIdentity({ runId: 'projection-complete-plan' }),
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
      ...collector(cwd, plan),
      getWorktreeOwnership: () => ({ current: cwd, owner: '/tmp/other-worktree', ownedByCurrent: false }),
    };

    runStopHandler({ collector: foreignCollector, identity: hookIdentity({ runId: 'projection-foreign-owner' }) });

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
      collector: collector(cwd),
      identity: hookIdentity({ runId: 'symlink-run' }),
    })).toThrow('symlinked write path is forbidden');
    expect(existsSync(join(outside, 'current.md'))).toBe(false);
  });

  test('each Stop write phase converges on a fresh retry', () => {
    const phases: StopProjectionTarget['kind'][] = ['handoff', 'resume'];
    const faultNow = new Date('2026-08-14T08:00:00.000Z');
    const retryNow = new Date('2026-08-14T08:01:00.000Z');

    const baselineRoot = fixture();
    runStopHandler({ collector: collector(baselineRoot), dependencies: { now: () => retryNow } });
    const baseline = stopArtifacts(baselineRoot);

    for (const phase of phases) {
      const retryRoot = fixture();
      expect(() => runStopHandler({
        collector: collector(retryRoot),
        dependencies: {
          now: () => faultNow,
          afterProjectionWrite: (target) => {
            if (target.kind === phase) throw new Error(`fault after ${phase}`);
          },
        },
      })).toThrow(`fault after ${phase}`);

      runStopHandler({ collector: collector(retryRoot), dependencies: { now: () => retryNow } });
      const normalize = (artifacts: Record<string, string>) => Object.fromEntries(Object.entries(artifacts)
        .map(([key, value]) => [key, value.replaceAll(retryRoot, '<repo>').replaceAll(baselineRoot, '<repo>')
          .replace(/Content hash: sha256:[0-9a-f]+/g, 'Content hash: <normalized>')]));
      expect(normalize(stopArtifacts(retryRoot))).toEqual(normalize(baseline));
    }
  }, 60_000);
});


describe('Stop reports owed architecture updates on Claude only (#678)', () => {
  /** Registry-mode repo: `main` holds the manifest; `feature` changed the owned file after it. */
  function owedFixture(): string {
    const { cwd, head } = gitFixture();
    writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({ context: { capability_registry_file: '.ai/context/capabilities.json' } })}\n`);
    mkdirSync(join(cwd, '.ai/context'), { recursive: true });
    writeFileSync(join(cwd, '.ai/context/capabilities.json'), `${JSON.stringify({
      version: 1,
      capabilities: [{
        id: 'core-owned', domain: 'core', name: 'owned', prefixes: ['src/owned'],
        contract_files: { agents: 'AGENTS.md', claude: 'CLAUDE.md' },
        architecture_module: 'docs/architecture/modules/core/owned.md',
        workstream_dir: 'tasks/workstreams/core/owned', lsp_profile: 'typescript-lsp', verification_hints: [],
      }],
    })}\n`);
    mkdirSync(join(cwd, 'docs/architecture'), { recursive: true });
    mkdirSync(join(cwd, 'src/owned'), { recursive: true });
    writeFileSync(join(cwd, 'docs/architecture/.projection-manifest.json'), '{}\n');
    writeFileSync(join(cwd, 'src/owned/a.ts'), 'export const a = 1;\n');
    git(cwd, ['add', '-A']); git(cwd, ['commit', '-m', 'projected']);
    expect(git(cwd, ['rev-parse', 'HEAD'])).not.toBe(head);
    git(cwd, ['checkout', '-b', 'feature']);
    writeFileSync(join(cwd, 'src/owned/a.ts'), 'export const a = 2;\n');
    git(cwd, ['commit', '-am', 'change owned code']);
    return cwd;
  }

  test('Claude Stop names the owed capability once per branch and owed set', () => {
    const cwd = owedFixture();
    const first = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) });
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain('[ArchitectureOwed]');
    expect(first.stdout).toContain('core-owned (docs/architecture/modules/core/owned.md)');
    expect(first.stdout).toContain('repo-harness architecture-projection check --json');
    expect(first.stdout.trimEnd().split('\n').length).toBeLessThanOrEqual(3);
    expect(first.stderr).toBe('');

    const repeated = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) });
    expect(repeated.stdout).toBe('');
    expect(git(cwd, ['status', '--porcelain'])).toBe('');
  });

  test('a new obligation for the same capability after a manifest refresh is reported again', () => {
    const cwd = owedFixture();
    expect(runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) }).stdout).toContain('[ArchitectureOwed]');
    writeFileSync(join(cwd, 'docs/architecture/.projection-manifest.json'), '{"refreshed":true}\n');
    git(cwd, ['commit', '-am', 'refresh the projection']);
    expect(runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) }).stdout).toBe('');

    writeFileSync(join(cwd, 'src/owned/a.ts'), 'export const a = 3;\n');
    git(cwd, ['commit', '-am', 'change owned code again']);
    const renewed = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) });
    expect(renewed.stdout).toContain('core-owned (docs/architecture/modules/core/owned.md)');
    expect(runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) }).stdout).toBe('');
  });

  test('a Stop continued by a Stop hook and Codex add nothing', () => {
    const cwd = owedFixture();
    const continued = runStopHandler({
      collector: collector(cwd),
      identity: hookIdentity({ host: 'claude' }),
      payload: { stop_hook_active: true },
    });
    expect(continued.stdout).toBe('');
    expect(runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'codex' }) }).stdout).toBe('');
    // The once-per-set marker was never written, so Claude still gets the line.
    expect(runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) }).stdout).toContain('[ArchitectureOwed]');
  });

  test('a broken capability registry drops the line only', () => {
    const cwd = owedFixture();
    writeFileSync(join(cwd, '.ai/context/capabilities.json'), '{not json');
    git(cwd, ['commit', '-am', 'break the registry']);
    const result = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) });
    expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(true);
  });
});

describe('Stop observes workflow gaps without permission gates', () => {
  test('Stop is silent on every host and never resolves workflow state', () => {
    for (const host of ['claude', 'codex'] as const) {
      const cwd = fixture();
      const result = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host }) });
      expect(result).toEqual({ exitCode: 0, stdout: '', stderr: '' });
      expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(true);
    }
  });
  test('Stop writes no architecture or capability runtime state', () => {
    const { cwd } = gitFixture();
    mkdirSync(join(cwd, 'src'), { recursive: true }); writeFileSync(join(cwd, 'src/change.ts'), 'export const x = 1;');
    // #678: stdout is the Claude Stop channel for owed architecture updates.
    // This repository declares no capability registry, so the channel stays
    // empty; Stop never starts projection or records drift.
    const result = runStopHandler({ collector: collector(cwd), identity: hookIdentity({ host: 'claude' }) });
    expect(result.stdout).toBe('');
    expect(existsSync(join(cwd, '.ai/harness/architecture-projection'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/state/architecture-drift-cursor.json'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/runs/unplanned-implementation.jsonl'))).toBe(false);
    expect(existsSync(join(cwd, '.ai/harness/capability-context/requests.jsonl'))).toBe(false);
  });
});
