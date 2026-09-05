import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdirSync, symlinkSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import type { EffectiveState } from '../src/core/state/types';
import { runStopHandler, type StopProjectionTarget } from '../src/cli/hook/stop-handler';
import { consumePendingPostEditEvents, readPendingPostEditEvents } from '../src/cli/hook/mutation-observed';
import { advanceArchitectureDriftCursor, computeArchitectureDriftChangedSet, readArchitectureDriftCursor } from '../src/cli/hook/architecture-drift';

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

describe('runStopHandler', () => {
  test('surfaces projection retry advisory and blocks only under the independent projection failure gate', () => {
    const failedDrain = () => ({
      schemaVersion: 'repo-harness.architecture-projection-drain/v1' as const,
      status: 'retry-pending' as const,
      jobId: 'job-test', sourceEventIds: ['event-test'], resultStatus: null,
      error: 'archctx projection failed: exit 1', acknowledgeSourceEvents: false,
      queue: { schemaVersion: 'repo-harness.architecture-projection-queue-state/v1' as const, pending: 1, running: 0, receipts: 0, deadLetters: 0, oldestPendingJobId: 'job-test', oldestDeadLetterJobId: null },
    });
    const advisoryRoot = fixture();
    writeFileSync(join(advisoryRoot, '.ai/harness/policy.json'), '{"architecture":{"projection_failure_gate":"advisory"}}\n');
    const advisory = runStopHandler({ collector: collector(advisoryRoot, () => canonicalState()), dependencies: { drainArchitectureProjection: failedDrain } });
    expect(advisory.exitCode).toBe(0);
    expect(advisory.stderr).toContain('[ArchitectureProjection] retry-pending');

    const freshnessRoot = fixture();
    writeFileSync(join(freshnessRoot, '.ai/harness/policy.json'), '{"architecture":{"freshness_gate":"strict"}}\n');
    const freshnessOnly = runStopHandler({ collector: collector(freshnessRoot, () => canonicalState()), dependencies: { drainArchitectureProjection: failedDrain } });
    expect(freshnessOnly.stdout).not.toContain('Strict projection failure gate blocked Stop');

    const strictRoot = fixture();
    writeFileSync(join(strictRoot, '.ai/harness/policy.json'), '{"architecture":{"projection_provider":"archctx","projection_apply":"automatic","projection_version":"0.5.7","projection_failure_gate":"strict"}}\n');
    const strict = runStopHandler({ collector: collector(strictRoot, () => canonicalState()), dependencies: { drainArchitectureProjection: failedDrain } });
    expect(strict.exitCode).toBe(0);
    expect(JSON.parse(strict.stdout).decision).toBe('block');
    expect(strict.stdout).toContain('Strict projection failure gate blocked Stop');

    const deadLetter = runStopHandler({
      collector: collector(strictRoot, () => canonicalState()),
      dependencies: { drainArchitectureProjection: () => ({ ...failedDrain(), status: 'dead-letter' as const }) },
    });
    expect(deadLetter.stdout).toContain('retry-dead-letter --job-id job-test --json');

    const invalidGateRoot = fixture();
    writeFileSync(join(invalidGateRoot, '.ai/harness/policy.json'), '{"architecture":{"projection_provider":"archctx","projection_apply":"automatic","projection_version":"0.5.7","projection_failure_gate":"block"}}\n');
    const invalidGate = runStopHandler({ collector: collector(invalidGateRoot, () => canonicalState()), dependencies: { drainArchitectureProjection: failedDrain } });
    expect(invalidGate.stdout).toContain('Strict projection failure gate blocked Stop');
    expect(invalidGate.stdout).toContain('projection policy invalid');

    const disabledRoot = fixture();
    writeFileSync(join(disabledRoot, '.ai/harness/policy.json'), '{"architecture":{"projection_provider":"disabled","projection_apply":"disabled","projection_failure_gate":"strict"}}\n');
    const disabled = runStopHandler({ collector: collector(disabledRoot, () => canonicalState()), dependencies: { drainArchitectureProjection: failedDrain } });
    expect(disabled.exitCode).toBe(0);
    expect(disabled.stdout).not.toContain('Strict projection failure gate blocked Stop');

    const malformedInactiveRoot = fixture();
    writeFileSync(join(malformedInactiveRoot, '.ai/harness/policy.json'), '{not-json\n');
    const malformedInactive = runStopHandler({ collector: collector(malformedInactiveRoot, () => canonicalState()) });
    expect(malformedInactive.exitCode).toBe(0);
    expect(malformedInactive.stdout).not.toContain('Strict projection failure gate blocked Stop');
    expect(malformedInactive.stderr).toContain('JSON Parse error');
  });

  test('consumes journal trigger effects independently of the projection drain outcome', () => {
    const cwd = fixture();
    const pending = join(cwd, '.ai/harness/journal/post-edit/pending');
    mkdirSync(pending, { recursive: true });
    const eventId = 'event-consumed';
    writeFileSync(join(pending, '0123456789abcdefabcd.json'), `${JSON.stringify({
      schema: 'change_observed',
      schema_version: 2,
      source_key: '0123456789abcdefabcd',
      event_id: eventId,
      session_id: 'session-consumed',
      created_at: '2026-08-09T00:00:00.000Z',
      updated_at: '2026-08-09T00:00:00.000Z',
      changed_paths: ['src/example.ts'],
      subject_revision: null,
      dirty: { 'contract-verification': true, context: true, capability: true, 'minimal-change': true, checkpoint: false },
      payload: {
        contract_verification: { contract_file: 'tasks/contracts/example.contract.md', checks_file: '.ai/harness/checks/latest.json' },
        minimal_change: { path: 'src/example.ts', base_ref: 'HEAD' },
      },
    }, null, 2)}\n`);
    const failedDrain = () => ({
      schemaVersion: 'repo-harness.architecture-projection-drain/v1' as const,
      status: 'retry-pending' as const,
      jobId: 'job-retained', sourceEventIds: ['drift-unrelated'], resultStatus: null,
      error: 'projection failed', acknowledgeSourceEvents: false,
      queue: { schemaVersion: 'repo-harness.architecture-projection-queue-state/v1' as const, pending: 1, running: 0, receipts: 0, deadLetters: 0, oldestPendingJobId: 'job-retained', oldestDeadLetterJobId: null },
    });

    runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { ...process.env, PATH: '' },
      dependencies: { drainArchitectureProjection: failedDrain },
    });

    // The journal no longer carries any architecture datum, so its trigger
    // effects are never held back by the architecture lane's outcome.
    expect(readPendingPostEditEvents(cwd)).toEqual([]);
  });

  test('advances past a contract verification timeout instead of retrying the queue head forever', () => {
    const cwd = fixture();
    const pending = join(cwd, '.ai/harness/journal/post-edit/pending');
    mkdirSync(pending, { recursive: true });
    writeFileSync(join(pending, '0123456789abcdefabcd.json'), `${JSON.stringify({
      schema: 'change_observed',
      schema_version: 2,
      source_key: '0123456789abcdefabcd',
      event_id: 'event-timeout',
      session_id: 'session-timeout',
      created_at: '2026-09-03T00:00:00.000Z',
      updated_at: '2026-09-03T00:00:00.000Z',
      changed_paths: ['src/slow-contract.ts'],
      subject_revision: null,
      dirty: { 'contract-verification': true, context: false, capability: false, 'minimal-change': false, checkpoint: false },
      payload: {
        contract_verification: { contract_file: 'tasks/contracts/slow.contract.md', checks_file: '.ai/harness/checks/latest.json' },
      },
    }, null, 2)}\n`);

    const stubCli = join(cwd, 'slow-cli.ts');
    writeFileSync(stubCli, 'await Bun.sleep(10_000);\n');
    const originalWrite = process.stderr.write.bind(process.stderr);
    const captured: string[] = [];
    process.stderr.write = (chunk: string) => {
      captured.push(String(chunk));
      return true;
    };
    let summary;
    const startedAt = Date.now();
    try {
      summary = consumePendingPostEditEvents(
        cwd,
        { ...process.env, REPO_HARNESS_CLI: stubCli },
        { deadlineMs: Date.now() + 5_000, helperTimeoutMs: 100 },
      );
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(summary).toMatchObject({ consumed: 1, pending: 0, errors: 1 });
    expect(summary.warnings).toHaveLength(1);
    expect(summary.warnings[0]).toContain('contract verification timed out');
    expect(captured.join('')).toContain('removed pending event event-timeout');
    expect(readPendingPostEditEvents(cwd)).toEqual([]);
  });

  test('acknowledges a minimal-change event when its remaining journal budget is exhausted', () => {
    const cwd = fixture();
    writeFileSync(join(cwd, '.ai/harness/policy.json'), JSON.stringify({
      minimal_change: { mode: 'advice', post_edit_observer: true },
    }));
    const pending = join(cwd, '.ai/harness/journal/post-edit/pending');
    mkdirSync(pending, { recursive: true });
    writeFileSync(join(pending, 'fedcba9876543210abcd.json'), `${JSON.stringify({
      schema: 'change_observed',
      schema_version: 2,
      source_key: 'fedcba9876543210abcd',
      event_id: 'event-minimal-change-timeout',
      session_id: 'session-minimal-change-timeout',
      created_at: '2026-09-03T00:00:00.000Z',
      updated_at: '2026-09-03T00:00:00.000Z',
      changed_paths: ['src/minimal-change.ts'],
      subject_revision: null,
      dirty: { 'contract-verification': false, context: false, capability: false, 'minimal-change': true, checkpoint: false },
      payload: { minimal_change: { path: 'src/minimal-change.ts', base_ref: 'HEAD' } },
    }, null, 2)}\n`);

    let clock = 0;
    const summary = consumePendingPostEditEvents(
      cwd,
      process.env,
      { deadlineMs: 5, nowMs: () => (clock += 3) },
    );

    expect(summary).toMatchObject({ consumed: 1, pending: 0, errors: 1 });
    expect(summary.warnings[0]).toContain('minimal-change signals reached the journal deadline');
    expect(readPendingPostEditEvents(cwd)).toEqual([]);
  });

  test('uses the Stop-entry deadline and acknowledges the queue head after preceding work exhausts it', () => {
    const cwd = fixture();
    const pending = join(cwd, '.ai/harness/journal/post-edit/pending');
    mkdirSync(pending, { recursive: true });
    writeFileSync(join(pending, 'aaaaaaaaaaaaaaaaaaaa.json'), `${JSON.stringify({
      schema: 'change_observed',
      schema_version: 2,
      source_key: 'aaaaaaaaaaaaaaaaaaaa',
      event_id: 'event-preceding-work-timeout',
      session_id: 'session-preceding-work-timeout',
      created_at: '2026-09-03T00:00:00.000Z',
      updated_at: '2026-09-03T00:00:00.000Z',
      changed_paths: ['src/preceding-work.ts'],
      subject_revision: null,
      dirty: { 'contract-verification': true, context: false, capability: false, 'minimal-change': false, checkpoint: false },
      payload: {
        contract_verification: { contract_file: 'tasks/contracts/slow.contract.md', checks_file: '.ai/harness/checks/latest.json' },
      },
    }, null, 2)}\n`);
    const sentinel = join(cwd, 'verification-started');
    const stubCli = join(cwd, 'sentinel-cli.ts');
    writeFileSync(stubCli, `await Bun.write(${JSON.stringify(sentinel)}, 'started\\n');\n`);
    let wallClock = 0;
    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { ...process.env, REPO_HARNESS_CLI: stubCli },
      dependencies: {
        wallClockMs: () => wallClock,
        drainArchitectureProjection: () => {
          wallClock = 25_000;
          return {
            schemaVersion: 'repo-harness.architecture-projection-drain/v1',
            status: 'idle', jobId: null, sourceEventIds: [], resultStatus: null,
            error: null, acknowledgeSourceEvents: true,
            queue: { schemaVersion: 'repo-harness.architecture-projection-queue-state/v1', pending: 0, running: 0, receipts: 0, deadLetters: 0, oldestPendingJobId: null, oldestDeadLetterJobId: null },
          };
        },
      },
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(sentinel)).toBe(false);
    expect(readPendingPostEditEvents(cwd)).toEqual([]);
  });

  test('advances the drift cursor only for an acknowledged architecture delivery', () => {
    const held = gitFixture();
    writeFileSync(join(held.cwd, 'src-shell-write.ts'), 'export const written = 1;\n');
    const drainResult = (acknowledgeSourceEvents: boolean) => () => ({
      schemaVersion: 'repo-harness.architecture-projection-drain/v1' as const,
      status: acknowledgeSourceEvents ? 'succeeded' as const : 'retry-pending' as const,
      jobId: 'job-cursor', sourceEventIds: [], resultStatus: null,
      error: acknowledgeSourceEvents ? null : 'projection failed',
      acknowledgeSourceEvents,
      queue: { schemaVersion: 'repo-harness.architecture-projection-queue-state/v1' as const, pending: 0, running: 0, receipts: 0, deadLetters: 0, oldestPendingJobId: null, oldestDeadLetterJobId: null },
    });

    const heldResult = runStopHandler({
      collector: collector(held.cwd, () => canonicalState()),
      env: { ...process.env, PATH: '', HOOK_RUN_ID: 'cursor-held' },
      dependencies: { drainArchitectureProjection: drainResult(false) },
    });
    expect(readArchitectureDriftCursor(held.cwd)).toBeNull();
    expect(heldResult.stderr).toContain('drift cursor (missing) is unresolvable');

    const advanced = gitFixture();
    runStopHandler({
      collector: collector(advanced.cwd, () => canonicalState()),
      env: { ...process.env, PATH: '', HOOK_RUN_ID: 'cursor-advanced' },
      dependencies: { drainArchitectureProjection: drainResult(true) },
    });
    expect(readArchitectureDriftCursor(advanced.cwd)?.head_sha).toBe(advanced.head);
  });

  test('retains a committed drift range when the disabled-provider cascade runner is unavailable', () => {
    const { cwd, head: anchor } = gitFixture();
    writeFileSync(join(cwd, '.ai/harness/policy.json'), '{"architecture":{"projection_provider":"disabled","projection_apply":"disabled"}}\n');
    advanceArchitectureDriftCursor(cwd, anchor);
    writeFileSync(join(cwd, 'committed-only.ts'), 'export const committed = true;\n');
    git(cwd, ['add', 'committed-only.ts']);
    git(cwd, ['commit', '-m', 'committed drift']);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { PATH: '', HOOK_RUN_ID: 'cascade-runner-unavailable' },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('[ArchitectureProjection] orchestration failed:');
    expect(result.stderr).toContain('legacy architecture cascade runner is unavailable');
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(anchor);
    expect(computeArchitectureDriftChangedSet(cwd).paths).toContain('committed-only.ts');
  });

  test('retains a committed drift range when a request-triggered cascade follow-up fails', () => {
    const { cwd, head: anchor } = gitFixture();
    writeFileSync(join(cwd, '.ai/harness/policy.json'), '{"architecture":{"projection_provider":"disabled","projection_apply":"disabled"}}\n');
    advanceArchitectureDriftCursor(cwd, anchor);
    writeFileSync(join(cwd, 'follow-up-failure.ts'), 'export const followUp = true;\n');
    git(cwd, ['add', 'follow-up-failure.ts']);
    git(cwd, ['commit', '-m', 'follow-up drift']);

    const stubRoot = mkdtempSync(join(tmpdir(), 'repo-harness-stop-follow-up-'));
    fixtures.push(stubRoot);
    const stateFile = join(stubRoot, 'state.txt');
    const stubCli = join(stubRoot, 'stub-cli.ts');
    writeFileSync(stubCli, [
      "import { existsSync, writeFileSync } from 'fs';",
      "const args = process.argv.slice(2);",
      "if (args[0] === 'run' && args[1] === 'architecture-queue') {",
      "  if (existsSync(process.env.STOP_FOLLOWUP_STATE!)) process.stdout.write('[ArchitectureDrift] No architecture drift update for follow-up-failure.ts (unchanged request).\\n');",
      "  process.stdout.write('[ArchitectureDrift] Request: docs/architecture/requests/root.md\\n');",
      "  process.exit(0);",
      "}",
      "if (args[0] === 'run' && args[1] === 'context-contract-sync') {",
      "  if (!existsSync(process.env.STOP_FOLLOWUP_STATE!)) { writeFileSync(process.env.STOP_FOLLOWUP_STATE!, 'failed-once\\n'); process.exit(9); }",
      "  process.exit(0);",
      "}",
      "process.exit(0);",
      '',
    ].join('\n'));

    const env = { ...process.env, HOOK_RUN_ID: 'cascade-follow-up-failure', REPO_HARNESS_CLI: stubCli, STOP_FOLLOWUP_STATE: stateFile };
    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('context-contract-sync exited 9');
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(anchor);
    expect(computeArchitectureDriftChangedSet(cwd).paths).toContain('follow-up-failure.ts');

    const retried = runStopHandler({ collector: collector(cwd, () => canonicalState()), env });
    expect(retried.exitCode).toBe(0);
    expect(retried.stderr).not.toContain('legacy architecture cascade failed');
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(git(cwd, ['rev-parse', 'HEAD']));
  });

  test('feeds every shell-written path of a codex fleet session to the architecture cascade', () => {
    // The reported failure: a Codex worktree session writes exclusively
    // through shell, so no post-edit journal event exists and drift recording
    // saw nothing. Every mutation below is a plain fs/git write -- no hook
    // payload is ever handed to the journal writer.
    const { cwd } = gitFixture();
    writeFileSync(join(cwd, '.ai/harness/policy.json'), '{"architecture":{"projection_provider":"disabled","projection_apply":"disabled"}}\n');
    const anchor = git(cwd, ['rev-parse', 'HEAD']);

    const stubRoot = mkdtempSync(join(tmpdir(), 'repo-harness-stop-cascade-'));
    fixtures.push(stubRoot);
    const calls = join(stubRoot, 'calls.txt');
    const stubCli = join(stubRoot, 'stub-cli.ts');
    writeFileSync(stubCli, [
      "import { appendFileSync } from 'fs';",
      "appendFileSync(process.env.STOP_CASCADE_CALLS!, `${process.argv.slice(2).join(' ')}\\n`);",
      '',
    ].join('\n'));

    mkdirSync(join(cwd, 'src'), { recursive: true });
    writeFileSync(join(cwd, 'src/committed-change.ts'), 'export const committed = 1;\n');
    git(cwd, ['add', '-A']);
    git(cwd, ['commit', '-m', 'shell commit']);
    const head = git(cwd, ['rev-parse', 'HEAD']);
    writeFileSync(join(cwd, 'src/shell-write.ts'), 'export const shellWritten = 1;\n');
    mkdirSync(join(cwd, 'packages/new-pkg/src'), { recursive: true });
    writeFileSync(join(cwd, 'packages/new-pkg/src/index.ts'), 'export const added = 1;\n');
    rmSync(join(cwd, 'README.md'));

    // The commit above already landed, so only a cursor at the earlier anchor
    // proves the commit range is part of the changed set.
    advanceArchitectureDriftCursor(cwd, anchor);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { ...process.env, HOOK_RUN_ID: 'fleet-shell-writes', REPO_HARNESS_CLI: stubCli, STOP_CASCADE_CALLS: calls },
    });

    expect(result.exitCode).toBe(0);
    expect(readPendingPostEditEvents(cwd)).toEqual([]);
    expect(readFileSync(calls, 'utf8').trim().split('\n').sort()).toEqual([
      'run architecture-queue record --file README.md',
      'run architecture-queue record --file packages/new-pkg/src/index.ts',
      'run architecture-queue record --file src/committed-change.ts',
      'run architecture-queue record --file src/shell-write.ts',
    ]);
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(head);
  }, 30_000);

  test('bounds a slow cascade child and retains the unacknowledged drift range', () => {
    const { cwd, head } = gitFixture();
    advanceArchitectureDriftCursor(cwd, head);
    writeFileSync(join(cwd, 'slow.ts'), 'export const slow = true;\n');
    git(cwd, ['add', 'slow.ts']);
    git(cwd, ['commit', '-m', 'change']);
    const stubRoot = mkdtempSync(join(tmpdir(), 'repo-harness-slow-cascade-'));
    fixtures.push(stubRoot);
    const stubCli = join(stubRoot, 'stub.ts');
    writeFileSync(stubCli, 'await Bun.sleep(1500);\n');
    let calls = 0;
    const start = Date.now();
    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      env: { ...process.env, REPO_HARNESS_CLI: stubCli, HOOK_RUN_ID: 'bounded-cascade' },
      dependencies: { wallClockMs: () => calls++ === 0 ? 0 : 19_900 },
    });
    expect(Date.now() - start).toBeLessThan(1400);
    expect(result.stderr).toContain('architecture cascade');
    expect(readArchitectureDriftCursor(cwd)?.head_sha).toBe(head);
  }, 10_000);

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

  test('readiness wins over plan completeness without a minimal-change suffix', () => {
    const cwd = fixture();
    seedMinimalChange(cwd);
    seedDelegation(cwd);
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
  });

  test('plan completeness carries the minimal-change suffix', () => {
    const cwd = fixture();
    seedMinimalChange(cwd);
    seedDelegation(cwd);
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
  });

  test('enforce mode blocks a review verdict that carries no audit receipt', () => {
    const cwd = fixture();
    seedMinimalChangeEnforce(cwd);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: 'enforce-block' }),
      env: { HOOK_RUN_ID: 'stop-minimal-enforce-block' },
    });

    expect(result.stdout).toContain('[MinimalChange] Enforce gate blocked Stop');
    expect(JSON.parse(result.stdout).decision).toBe('block');
    expect(result.stdout).toContain('.ai/harness/checks/minimal-change-audit.latest.json');
    expect(result.stdout).toContain(ENFORCE_FINGERPRINT);
    expect(result.stdout).toContain('[dependency] package.json');
    // The reason is self-contained: it names the methodology without making
    // the gate depend on that skill being installed.
    expect(result.stdout).toContain('reclaim-code-entropy');
    expect(result.stderr).toContain('[MinimalChange] Enforced review');
  });

  test('a lite profile does not swallow the enforce gate', () => {
    // The lite risk floor is reachable with exactly the change shapes that
    // produce a `review` verdict: a single dependency-manifest edit is one
    // implementation path (src/effects/review/diff-fingerprint.ts:399-401),
    // one capability, and carries no strict path token
    // (src/core/workflow/profile.ts:104-113), so the deterministic floor stays
    // lite (profile.ts:256-273) while the report carries a dependency finding
    // (src/cli/hook/minimal-change-signals.ts:398-408,589). The enforce gate
    // must therefore run before Stop's lite early return, not after it.
    const cwd = fixture();
    seedMinimalChangeEnforce(cwd);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState({ profile: 'lite' })),
      input: JSON.stringify({ turn_id: 'lite-enforce-block' }),
      env: { HOOK_RUN_ID: 'stop-minimal-lite-enforce-block' },
    });

    expect(JSON.parse(result.stdout).decision).toBe('block');
    expect(result.stdout).toContain('[MinimalChange] Enforce gate blocked Stop');
    expect(result.stdout).toContain(ENFORCE_FINGERPRINT);
  });

  test('a lite profile with nothing to audit keeps its zero-ceremony silence', () => {
    const cwd = fixture();
    // Enforce mode is ON; only the report is absent. Without this policy the
    // test would pass on a disabled gate and prove nothing about the hoist --
    // what it must pin is that the gate itself stays lazy when there is no
    // `review` verdict to act on.
    writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({
      minimal_change: { mode: 'enforce', stop_review: true },
    })}\n`);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState({ profile: 'lite' })),
      input: JSON.stringify({ turn_id: 'lite-enforce-quiet' }),
      env: { HOOK_RUN_ID: 'stop-minimal-lite-enforce-quiet' },
    });

    expect(result.stdout).toBe('');
    expect(result.stderr).not.toContain('[MinimalChange]');
  });

  test('a lite profile still gets the advice-mode review hint', () => {
    // Intended consequence of the hoist, not collateral: advice mode means
    // "surface the hint on every profile", and lite's previous silence was
    // the other face of the same swallow this slice closes. Advice still
    // never blocks.
    const cwd = fixture();
    seedMinimalChange(cwd);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState({ profile: 'lite' })),
      input: JSON.stringify({ turn_id: 'lite-advice-hint' }),
      env: { HOOK_RUN_ID: 'stop-minimal-lite-advice-hint' },
    });

    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[MinimalChange] Non-blocking review');
  });

  test('advice mode keeps the same review non-blocking end to end', () => {
    const cwd = fixture();
    seedMinimalChangeEnforce(cwd);
    writeFileSync(join(cwd, '.ai/harness/policy.json'), `${JSON.stringify({
      minimal_change: { mode: 'advice', stop_review: true, report_path: '.ai/harness/checks/minimal-change.latest.json' },
    })}\n`);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: 'advice-release' }),
      env: { HOOK_RUN_ID: 'stop-minimal-advice-release' },
    });

    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[MinimalChange] Non-blocking review');
    expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json'))).toBe(false);
  });

  test('a matching audit receipt releases Stop, and only a matching one does', () => {
    const cwd = fixture();
    seedMinimalChangeEnforce(cwd);
    const valid = {
      version: 1,
      fingerprint: ENFORCE_FINGERPRINT,
      decisions: ['package.json dependency is required by the approved contract'],
      generated_at: '2026-08-17T21:30:00.000Z',
    };

    writeAuditReceipt(cwd, valid);
    const released = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: 'receipt-release' }),
      env: { HOOK_RUN_ID: 'stop-minimal-receipt-release' },
    });
    expect(released.stdout).toBe('');
    expect(released.stderr).toContain('[MinimalChange] Audit receipt accepted');
    expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json'))).toBe(false);

    // Every rejected receipt shape keeps the gate closed (fail closed).
    const rejected: readonly unknown[] = [
      { ...valid, fingerprint: `${ENFORCE_FINGERPRINT.slice(0, -1)}1` },
      { ...valid, version: 2 },
      { ...valid, decisions: [] },
      { ...valid, decisions: ['  '] },
      { ...valid, decisions: [{ decision: 'structured entries are not the receipt shape' }] },
      { ...valid, generated_at: 'not-a-timestamp' },
      { fingerprint: ENFORCE_FINGERPRINT, decisions: valid.decisions, generated_at: valid.generated_at },
    ];
    rejected.forEach((receipt, index) => {
      rmSync(join(cwd, '.ai/harness/state'), { recursive: true, force: true });
      writeAuditReceipt(cwd, receipt);
      const blocked = runStopHandler({
        collector: collector(cwd, () => canonicalState()),
        input: JSON.stringify({ turn_id: `receipt-reject-${index}` }),
        env: { HOOK_RUN_ID: `stop-minimal-receipt-reject-${index}` },
      });
      expect(blocked.stdout).toContain('[MinimalChange] Enforce gate blocked Stop');
    });

    // A malformed receipt file is not a release either.
    rmSync(join(cwd, '.ai/harness/state'), { recursive: true, force: true });
    writeFileSync(join(cwd, '.ai/harness/checks/minimal-change-audit.latest.json'), '{not-json');
    const malformed = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: 'receipt-malformed' }),
      env: { HOOK_RUN_ID: 'stop-minimal-receipt-malformed' },
    });
    expect(malformed.stdout).toContain('[MinimalChange] Enforce gate blocked Stop');
  });

  test('a review report without a fingerprint releases Stop instead of deadlocking it', () => {
    const cwd = fixture();
    seedMinimalChangeEnforce(cwd);
    // Neither release path can act on a fingerprint-less report: no receipt can
    // match it and the breaker cannot key on it, so the gate must stay out.
    writeFileSync(join(cwd, '.ai/harness/checks/minimal-change.latest.json'), `${JSON.stringify({
      version: 1,
      verdict: 'review',
      report_path: '.ai/harness/checks/minimal-change.latest.json',
      findings: [{ tag: 'dependency', path: 'package.json', question: 'Is the new dependency required?' }],
    })}\n`);

    const result = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: 'missing-fingerprint' }),
      env: { HOOK_RUN_ID: 'stop-minimal-missing-fingerprint' },
    });

    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[MinimalChange] Enforce gate skipped');
    expect(result.stderr).toContain('carries no fingerprint');
    expect(existsSync(join(cwd, '.ai/harness/state/circuit-breaker.json'))).toBe(false);
  });

  test('the circuit breaker releases Stop after two blocks on the same fingerprint', () => {
    const cwd = fixture();
    seedMinimalChangeEnforce(cwd);
    const run = (turn: string) => runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: turn }),
      env: { HOOK_RUN_ID: `stop-minimal-breaker-${turn}` },
    });

    expect(run('one').stdout).toContain('[MinimalChange] Enforce gate blocked Stop');
    expect(run('two').stdout).toContain('[MinimalChange] Enforce gate blocked Stop');
    const third = run('three');
    expect(third.stdout).toBe('');
    expect(third.stderr).toContain('[MinimalChange] Circuit breaker tripped after 2 enforce blocks');

    // A different report fingerprint is real progress: the gate blocks again.
    seedMinimalChangeEnforce(cwd, `${ENFORCE_FINGERPRINT.slice(0, -1)}a`);
    expect(run('four').stdout).toContain('[MinimalChange] Enforce gate blocked Stop');
  });

  test('explicit delegation state never authorizes a Stop-time alternate runner', () => {
    const cwd = fixture();
    seedMinimalChange(cwd);
    const delegation = seedDelegation(cwd);
    const standard = runStopHandler({
      collector: collector(cwd, () => canonicalState()),
      input: JSON.stringify({ turn_id: 'ordered' }),
      env: { HOOK_RUN_ID: 'stop-delegation-last' },
    });
    expect(standard.stdout).toBe('');
    expect(JSON.parse(readFileSync(delegation, 'utf8'))).toMatchObject({
      explicit: true,
      spawned: false,
    });
    expect(readFileSync(delegation, 'utf8')).not.toContain('fallback_used');

    const liteCwd = fixture();
    const liteDelegation = seedDelegation(liteCwd);
    const lite = runStopHandler({
      collector: collector(liteCwd, () => canonicalState({ profile: 'lite' })),
      input: JSON.stringify({ turn_id: 'ordered' }),
      env: { HOOK_RUN_ID: 'stop-lite' },
    });
    expect(lite.stdout).toBe('');
    expect(readFileSync(liteDelegation, 'utf8')).not.toContain('fallback_used');
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
