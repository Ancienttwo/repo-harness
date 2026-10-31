import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import type { EffectiveState, EffectiveStateRiskInput } from '../src/core/state/types';
import { resolveHookEffectiveState } from '../src/cli/hook/runtime';
import {
  EDIT_GUARD_SCOPE_SECTION,
  projectEffectiveStateSessionSection,
  projectUnavailableStateSessionSection,
} from '../src/cli/hook/session-context';
import { resolveEffectiveState, StateResolutionUnstableError } from '../src/effects/state/resolve-effective-state';
import { stateVersionOwnerPath } from '../src/effects/state/git-state-version-store';
import { PLAN, createEffectiveStateFixture } from './state/effective-state-fixture';


type StateResolver = (
  repoRoot: string,
  nowMs: number,
  risk?: EffectiveStateRiskInput,
) => EffectiveState;

function fixtureState(overrides: Partial<EffectiveState> = {}): EffectiveState {
  return {
    task_id: null,
    phase: 'idle',
    state_version: 7,
    state_revision: `sha256:${'a'.repeat(64)}`,
    workflow_profile: 'high',
    next_action: 'continue',
    guidance: null,
    blockers: [],
    ...overrides,
  } as EffectiveState;
}

function initGitFixture(root: string): void {
  const run = (args: readonly string[], env = process.env): void => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.name', 'Fixture']);
  run(['config', 'user.email', 'fixture@example.com']);
}

function writeAt(root: string, relativePath: string, content: string): void {
  mkdirSync(join(root, relativePath, '..'), { recursive: true });
  writeFileSync(join(root, relativePath), content);
}

function captureHealthyBaseline(): Record<string, unknown> {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-session-state-authority-baseline-'));
  const home = join(root, 'home');
  const plan = 'plans/plan-20260726-0000-baseline.md';
  const contract = 'tasks/contracts/20260726-0000-baseline.contract.md';
  const review = 'tasks/reviews/20260726-0000-baseline.review.md';
  mkdirSync(home, { recursive: true });
  try {
    writeAt(root, '.ai/harness/workflow-contract.json', '{}\n');
    writeAt(root, '.ai/harness/policy.json', '{}\n');
    writeAt(root, '.ai/harness/active-plan', `${plan}\n`);
    writeAt(root, plan, [
      '# Plan: Session State Baseline', '', '> **Status**: Executing',
      `> **Task Contract**: \`${contract}\``, '', '## Task Breakdown',
      '- [ ] preserve SessionStart state', '', '## Evidence Contract',
      '- **State/progress path**: plan', '- **Verification evidence**: fixture',
      '- **Evaluator rubric**: parity', '- **Stop condition**: pass',
      '- **Rollback surface**: revert', '',
    ].join('\n'));
    writeAt(root, contract, [
      '# Task Contract: session-state-baseline', '', '> **Status**: Active',
      `> **Plan**: ${plan}`, '> **Task Profile**: code-change',
      '> **Workflow Profile**: routine', `> **Review File**: \`${review}\``,
      '', '## Allowed Paths', '', '```yaml', 'allowed_paths:',
      '  - src/baseline.ts', '```', '',
    ].join('\n'));
    writeAt(root, review, [
      '# Task Review: session-state-baseline', '> **Recommendation**: fail',
      '> **Reviewed Subject SHA256**: pending', '> **Reviewed Target Revision**: pending', '',
    ].join('\n'));
    writeAt(root, 'tasks/current.md', [
      '# Current', '> **Status**: Idle', '> **Updated At**: 2026-07-26T00:00:00.000Z', '',
    ].join('\n'));
    writeAt(root, '.gitignore', [
      '.ai/harness/state/', '.ai/harness/checks/', '.ai/harness/runs/',
      '.ai/harness/active-worktree', 'home/', '',
    ].join('\n'));
    initGitFixture(root);
    const gitEnv = {
      ...process.env,
      HOME: home,
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
    };
    for (const args of [['add', '.'], ['commit', '-q', '-m', 'fixture']]) {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: gitEnv });
      if (result.status !== 0) throw new Error(result.stderr);
    }
    const state = resolveEffectiveState(realpathSync(root), Date.now());
    const hook = spawnSync(
      process.execPath,
      [resolve(import.meta.dir, '../src/cli/hook-entry.ts'), 'SessionStart', '--route', 'default'],
      {
        cwd: root,
        encoding: 'utf8',
        input: JSON.stringify({ session_id: 'session-state-authority-baseline' }),
        env: {
          ...gitEnv,
          HOOK_REPO_ROOT: root,
          HOOK_HOST: 'claude',
          REPO_HARNESS_MAIN_LOOP_EDIT_GUARD: undefined,
        },
      },
    );
    if (hook.status !== 0) throw new Error(hook.stderr);
    const envelope = JSON.parse(hook.stdout);
    const context = envelope.hookSpecificOutput.additionalContext as string;
    const observed = JSON.parse(context.split('\n')[0]!.slice('[HarnessState] '.length));
    expect(observed.state_revision).toBe(state.state_revision);
    expect(observed.blockers).toEqual(state.blockers);
    const event = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim());
    return {
      protocol: 1,
      fixture_root: '(temporary)',
      context,
      output_bytes: Buffer.byteLength(context, 'utf8'),
      estimated_tokens: Math.ceil(Buffer.byteLength(context, 'utf8') / 4),
      telemetry: {
        session_id: event.session_id,
        exit_code: event.exit_code,
        blocked: event.blocked,
        reason: event.reason,
      },
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function runMockedFailure(kind: 'transient' | 'non-transient'): {
  readonly envelope: Record<string, unknown>;
  readonly result: Record<string, unknown>;
  readonly attempts: number;
  readonly writes: number;
} {
  const root = mkdtempSync(join(tmpdir(), 'session-state-authority-failure-'));
  try {
    initGitFixture(root);
    writeAt(root, '.ai/harness/workflow-contract.json', '{}\n');
    writeAt(root, '.ai/harness/policy.json', '{}\n');
    const add = spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
    if (add.status !== 0) throw new Error(add.stderr);
    const commit = spawnSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root, encoding: 'utf8' });
    if (commit.status !== 0) throw new Error(commit.stderr);

    const worker = `
      import { mock } from 'bun:test';
      let attempts = 0;
      let writes = 0;
      const resolverModule = await import(process.env.RESOLVER_MODULE);
      mock.module(process.env.RESOLVER_MODULE, () => ({
        ...resolverModule,
        resolveEffectiveState() {
          writes += 1;
          throw new Error('SessionStart ran the write path');
        },
        resolveEffectiveStateReadOnly() {
          attempts += 1;
          if (process.env.FAILURE_KIND === 'transient') {
            throw new resolverModule.StateResolutionUnstableError();
          }
          throw new Error('injected state failure /private/secret/worktree');
        },
      }));
      const { runHook } = await import(process.env.RUNTIME_MODULE + '?isolated-failure=' + process.env.FAILURE_KIND);
      const result = runHook({
        event: 'SessionStart',
        routeId: 'default',
        cwd: process.env.FIXTURE_ROOT,
        input: JSON.stringify({ session_id: 'failure-session' }),
        env: {
          ...process.env,
          HOOK_REPO_ROOT: process.env.FIXTURE_ROOT,
          HOOK_HOST: 'claude',
          REPO_HARNESS_MAIN_LOOP_EDIT_GUARD: undefined,
        },
      });
      process.stdout.write('@@RESULT@@' + JSON.stringify({ result, attempts, writes }) + '\\n');
    `;
    const child = spawnSync(process.execPath, ['-e', worker], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        FIXTURE_ROOT: root,
        FAILURE_KIND: kind,
        RESOLVER_MODULE: resolve(import.meta.dir, '../src/effects/state/resolve-effective-state.ts'),
        RUNTIME_MODULE: resolve(import.meta.dir, '../src/cli/hook/runtime.ts'),
      },
    });
    if (child.status !== 0) throw new Error(child.stderr || child.stdout);
    const [envelopeText, resultText] = child.stdout.split('@@RESULT@@');
    const resultPayload = JSON.parse(resultText.trim());
    return {
      envelope: JSON.parse(envelopeText.trim()),
      result: resultPayload.result,
      attempts: resultPayload.attempts,
      writes: resultPayload.writes,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

interface CountedHookRun {
  readonly result: Record<string, unknown>;
  readonly hostStdout: string;
  /** Full resolution passes during the hook: each pass calls the pure projector once. */
  readonly passes: number;
  /** Passes of one `resolveEffectiveState` call made after the hook, when requested. */
  readonly writePathPasses: number | null;
  readonly stateDirectoryCreated: boolean;
  readonly versionOwnerDirectoryCreated: boolean;
}

/**
 * Run one real hook event against a real fixture and count resolution passes.
 * With `mutateAuthorityEachPass`, every pass appends whitespace to the policy,
 * so the stability loop never sees two equal authority snapshots.
 */
function runCountedHook(root: string, options: {
  readonly event: 'SessionStart' | 'SubagentStart';
  readonly mutateAuthorityEachPass?: boolean;
  readonly compareWritePath?: boolean;
}): CountedHookRun {
  const worker = `
    import { mock } from 'bun:test';
    import { appendFileSync, existsSync } from 'fs';
    import { join } from 'path';
    const projector = await import(process.env.PROJECTOR_MODULE);
    const project = projector.projectEffectiveState;
    let passes = 0;
    mock.module(process.env.PROJECTOR_MODULE, () => ({
      ...projector,
      projectEffectiveState(input) {
        passes += 1;
        if (process.env.MUTATE_AUTHORITY) appendFileSync(process.env.MUTATE_AUTHORITY, ' ');
        return project(input);
      },
    }));
    const { runHook } = await import(process.env.RUNTIME_MODULE);
    const root = process.env.FIXTURE_ROOT;
    const session = process.env.HOOK_EVENT === 'SessionStart';
    const result = runHook({
      event: process.env.HOOK_EVENT,
      routeId: session ? 'default' : 'context',
      cwd: root,
      input: JSON.stringify({ session_id: 'counted-session' }),
      env: {
        ...process.env,
        HOOK_REPO_ROOT: root,
        HOOK_HOST: session ? 'claude' : 'codex',
        REPO_HARNESS_MAIN_LOOP_EDIT_GUARD: undefined,
      },
    });
    const hookPasses = passes;
    const stateDirectoryCreated = existsSync(join(root, '.ai/harness/state'));
    const versionOwnerDirectoryCreated = existsSync(process.env.VERSION_OWNER_DIRECTORY);
    let writePathPasses = null;
    if (process.env.COMPARE_WRITE_PATH) {
      const resolver = await import(process.env.RESOLVER_MODULE);
      passes = 0;
      resolver.resolveEffectiveState(root, Date.now());
      writePathPasses = passes;
    }
    process.stdout.write('@@RESULT@@' + JSON.stringify({
      result, passes: hookPasses, writePathPasses, stateDirectoryCreated, versionOwnerDirectoryCreated,
    }) + '\\n');
  `;
  if (options.mutateAuthorityEachPass) writeAt(root, '.ai/harness/policy.json', '{}\n');
  const child = spawnSync(process.execPath, ['-e', worker], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      FIXTURE_ROOT: root,
      HOOK_EVENT: options.event,
      MUTATE_AUTHORITY: options.mutateAuthorityEachPass ? join(root, '.ai/harness/policy.json') : '',
      COMPARE_WRITE_PATH: options.compareWritePath ? '1' : '',
      VERSION_OWNER_DIRECTORY: dirname(stateVersionOwnerPath(root)),
      PROJECTOR_MODULE: resolve(import.meta.dir, '../src/core/state/project-effective-state.ts'),
      RESOLVER_MODULE: resolve(import.meta.dir, '../src/effects/state/resolve-effective-state.ts'),
      RUNTIME_MODULE: resolve(import.meta.dir, '../src/cli/hook/runtime.ts'),
    },
  });
  if (child.status !== 0) throw new Error(child.stderr || child.stdout);
  const [hostStdout, resultText] = child.stdout.split('@@RESULT@@');
  return { ...JSON.parse(resultText!.trim()), hostStdout: hostStdout! };
}

function sessionContextOf(run: CountedHookRun): string {
  return JSON.parse(run.hostStdout.trim()).hookSpecificOutput.additionalContext as string;
}

function optedInFixture(): ReturnType<typeof createEffectiveStateFixture> {
  const fixture = createEffectiveStateFixture();
  writeFileSync(join(fixture.cwd, '.ai/harness/workflow-contract.json'), '{}\n');
  return fixture;
}

function runMockedPreEdit(kind: 'transient' | 'non-transient'): {
  readonly attempts: number;
  readonly output: string;
  readonly result: Record<string, unknown>;
} {
  const root = mkdtempSync(join(tmpdir(), 'session-state-preedit-failure-'));
  try {
    initGitFixture(root);
    writeAt(root, '.ai/harness/workflow-contract.json', '{}\n');
    writeAt(root, '.ai/harness/policy.json', '{}\n');
    const add = spawnSync('git', ['add', '.'], { cwd: root, encoding: 'utf8' });
    if (add.status !== 0) throw new Error(add.stderr);
    const commit = spawnSync('git', ['commit', '-q', '-m', 'fixture'], { cwd: root, encoding: 'utf8' });
    if (commit.status !== 0) throw new Error(commit.stderr);

    const worker = `
      import { mock } from 'bun:test';
      let attempts = 0;
      const resolverModule = await import(process.env.RESOLVER_MODULE);
      const fail = () => {
        attempts += 1;
        if (process.env.FAILURE_KIND === 'transient') {
          throw new resolverModule.StateResolutionUnstableError();
        }
        throw new Error('injected non-transient pre-edit failure');
      };
      mock.module(process.env.RESOLVER_MODULE, () => ({
        ...resolverModule,
        resolveEffectiveState: fail,
        resolveEffectiveStateReadOnly: fail,
      }));
      const { runHook } = await import(process.env.RUNTIME_MODULE + '?isolated-preedit=' + process.env.FAILURE_KIND);
      const result = runHook({
        event: 'PreToolUse',
        routeId: 'edit',
        cwd: process.env.FIXTURE_ROOT,
        input: JSON.stringify({ tool_input: { file_path: 'src/fixture.ts' } }),
        env: {
          ...process.env,
          HOOK_REPO_ROOT: process.env.FIXTURE_ROOT,
          HOOK_HOST: 'claude',
          REPO_HARNESS_MAIN_LOOP_EDIT_GUARD: undefined,
        },
      });
      process.stdout.write('@@RESULT@@' + JSON.stringify({ result, attempts }) + '\\n');
    `;
    const child = spawnSync(process.execPath, ['-e', worker], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        FIXTURE_ROOT: root,
        FAILURE_KIND: kind,
        RESOLVER_MODULE: resolve(import.meta.dir, '../src/effects/state/resolve-effective-state.ts'),
        RUNTIME_MODULE: resolve(import.meta.dir, '../src/cli/hook/runtime.ts'),
      },
    });
    if (child.status !== 0) throw new Error(child.stderr || child.stdout);
    const [hostStdout, resultText] = child.stdout.split('@@RESULT@@');
    const resultPayload = JSON.parse(resultText.trim());
    return {
      attempts: resultPayload.attempts,
      output: `${hostStdout}\n${child.stderr}`,
      result: resultPayload.result,
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('SessionStart Effective State authority', () => {
  test('does not resolve state through a self-CLI subprocess', () => {
    const runtime = readFileSync(join(import.meta.dir, '../src/cli/hook/runtime.ts'), 'utf8');
    expect(runtime).not.toContain('spawnSync');
    expect(runtime).not.toContain('PACKAGE_ROOT');
    expect(runtime).not.toContain("'state', 'resolve', '--json'");
  }, 30_000);

  test('preserves exact healthy context and the telemetry record', () => {
    const expected = JSON.parse(readFileSync(
      join(import.meta.dir, 'fixtures/session-start/state-authority-baseline.json'),
      'utf8',
    ));
    const actual = captureHealthyBaseline();
    const stateLine = (actual.context as string).split('\n')[0]!;
    const payload = JSON.parse(stateLine.slice('[HarnessState] '.length));
    expect(payload.state_revision).toMatch(/^sha256:[0-9a-f]{64}$/);
    // Profile vocabulary changes the authority bytes and therefore the revision;
    // preserve the complete context/telemetry comparison apart from that derived hash.
    const [expectedState, ...expectedSections] = (expected.context as string).split('\n');
    const previous = JSON.parse(expectedState!.slice('[HarnessState] '.length));
    expected.context = ['[HarnessState] ' + JSON.stringify({ ...previous, state_revision: payload.state_revision }), ...expectedSections].join('\n');
    expect(actual).toEqual(expected);
  }, 30_000);

  test('projects idle, active and blocked-but-resolved state, and never hides the state section', () => {
    const actionable = fixtureState();
    const nonActionable = fixtureState({ blockers: [] });
    const blocked = fixtureState({ blockers: ['capability_registry:invalid'] });
    const resolveSession = (state: EffectiveState) =>
      resolveHookEffectiveState('/repo-b', 123, (() => state) as StateResolver);
    expect(resolveSession(actionable)).toEqual({ ok: true, state: actionable });
    expect(projectEffectiveStateSessionSection(actionable)?.content).toStartWith('[HarnessState] ');
    expect(resolveSession(nonActionable)).toEqual({ ok: true, state: nonActionable });
    expect(projectEffectiveStateSessionSection(nonActionable).content).toStartWith('[HarnessState] ');
    expect(resolveSession(blocked)).toEqual({ ok: true, state: blocked });
    expect(projectEffectiveStateSessionSection(blocked)?.content).toStartWith('[HarnessState] ');
    expect(projectEffectiveStateSessionSection(blocked)?.content).not.toContain('[HarnessStateUnavailable]');
  });

  test('uses the explicit repo root and freezes one timestamp across transient retry', () => {
    const calls: Array<{ root: string; nowMs: number; risk: unknown }> = [];
    const resolveAttempt = ((root: string, nowMs: number, risk: unknown) => {
      calls.push({ root, nowMs, risk });
      if (calls.length === 1) throw new StateResolutionUnstableError();
      return fixtureState();
    }) as StateResolver;
    const outcome = resolveHookEffectiveState('/repo-b', 123456, resolveAttempt);
    expect(outcome.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls.map(({ root }) => root)).toEqual(['/repo-b', '/repo-b']);
    expect(calls.map(({ nowMs }) => nowMs)).toEqual([123456, 123456]);
    // No risk input: every hook resolves what `state resolve --json` resolves.
    expect(calls[0].risk).toBeUndefined();
  });

  test('bounds transient retries at three and hashes unavailable evidence without raw errors', () => {
    let attempts = 0;
    const outcome = resolveHookEffectiveState('/private/repo-b', 123, (() => {
      attempts += 1;
      throw new StateResolutionUnstableError();
    }) as StateResolver);
    expect(attempts).toBe(3);
    if (outcome.ok) throw new Error('expected unavailable');
    expect(outcome.reason_code).toBe('state_resolution_unstable');
    expect(outcome.error_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const section = projectUnavailableStateSessionSection(outcome);
    expect(section.mandatory).toBe(true);
    expect(section.content).toStartWith('[HarnessStateUnavailable] ');
    expect(section.content).not.toContain('[HarnessState] ');
    expect(section.content).not.toContain('/private/repo-b');
    expect(section.content).not.toContain('workflow authority changed');
  });

  test('does not retry a non-transient resolver failure', () => {
    let attempts = 0;
    const outcome = resolveHookEffectiveState('/repo-b', 123, (() => {
      attempts += 1;
      throw new TypeError('bad state /private/secret');
    }) as StateResolver);
    expect(attempts).toBe(1);
    if (outcome.ok) throw new Error('expected unavailable');
    expect(outcome.reason_code).toBe('state_resolution_failed');
  });

  test('keeps the host hook exit 0 and names context-unavailable for transient exhaustion and non-transient failure', () => {
    for (const [kind, attempts, reason] of [
      ['transient', 3, 'state_resolution_unstable'],
      ['non-transient', 1, 'state_resolution_failed'],
    ] as const) {
      const captured = runMockedFailure(kind);
      expect(captured.result).toMatchObject({ exitCode: 0, reason: 'context-unavailable', handler: 'session-context' });
      expect(captured.attempts).toBe(attempts);
      expect(captured.writes).toBe(0);
      const context = ((captured.envelope.hookSpecificOutput as Record<string, unknown>).additionalContext as string);
      expect(context).toStartWith('[HarnessStateUnavailable] ');
      const [unavailableLine, ...rest] = context.split('\n');
      expect(rest).toEqual([EDIT_GUARD_SCOPE_SECTION.content]);
      expect(JSON.parse(unavailableLine!.slice('[HarnessStateUnavailable] '.length))).toMatchObject({
        reason_code: reason,
        error_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      });
      expect(context).not.toContain('/private/secret');
    }
  }, 20000);

  test('SessionStart resolves read-only: two passes where state resolve takes three, and no state write', () => {
    const fixture = optedInFixture();
    try {
      const run = runCountedHook(fixture.cwd, { event: 'SessionStart', compareWritePath: true });
      expect(run.result).toMatchObject({ exitCode: 0, reason: 'ok', handler: 'session-context' });
      expect(run.passes).toBe(2);
      expect(run.writePathPasses).toBe(3);
      expect(run.stateDirectoryCreated).toBe(false);
      expect(run.versionOwnerDirectoryCreated).toBe(false);
      const stateLine = sessionContextOf(run).split('\n')[0]!;
      expect(stateLine).toStartWith('[HarnessState] ');
      // Nothing was published before the hook, so it reports version 0.
      expect(JSON.parse(stateLine.slice('[HarnessState] '.length)).state_version).toBe(0);
    } finally {
      fixture.cleanup();
    }
  }, 30_000);

  test('SubagentStart resolves read-only in two passes and writes no state', () => {
    const fixture = optedInFixture();
    try {
      const run = runCountedHook(fixture.cwd, { event: 'SubagentStart' });
      expect(run.result).toMatchObject({ exitCode: 0, handler: 'subagent-context' });
      expect(run.passes).toBe(2);
      expect(run.stateDirectoryCreated).toBe(false);
      expect(run.versionOwnerDirectoryCreated).toBe(false);
    } finally {
      fixture.cleanup();
    }
  }, 30_000);

  test('SessionStart retries stability exhaustion three times, four passes each, without a state write', () => {
    const fixture = optedInFixture();
    try {
      const run = runCountedHook(fixture.cwd, { event: 'SessionStart', mutateAuthorityEachPass: true });
      expect(run.result).toMatchObject({ exitCode: 0, reason: 'context-unavailable', handler: 'session-context' });
      expect(run.passes).toBe(12);
      expect(run.stateDirectoryCreated).toBe(false);
      expect(run.versionOwnerDirectoryCreated).toBe(false);
      const [unavailableLine] = sessionContextOf(run).split('\n');
      expect(unavailableLine).toStartWith('[HarnessStateUnavailable] ');
      expect(JSON.parse(unavailableLine!.slice('[HarnessStateUnavailable] '.length)).reason_code)
        .toBe('state_resolution_unstable');
    } finally {
      fixture.cleanup();
    }
  }, 30_000);

  test('a corrupt version owner fails SessionStart closed after one attempt and stays unchanged', () => {
    const fixture = optedInFixture();
    try {
      const ownerPath = stateVersionOwnerPath(fixture.cwd);
      const corrupt = '{"version":0,"revision":"invalid"}\n';
      mkdirSync(dirname(ownerPath), { recursive: true });
      writeFileSync(ownerPath, corrupt);
      const run = runCountedHook(fixture.cwd, { event: 'SessionStart' });
      expect(run.result).toMatchObject({ exitCode: 0, reason: 'context-unavailable', handler: 'session-context' });
      expect(run.passes).toBe(2);
      expect(run.stateDirectoryCreated).toBe(false);
      expect(readFileSync(ownerPath, 'utf8')).toBe(corrupt);
      expect(existsSync(`${ownerPath}.lock`)).toBe(false);
      const [unavailableLine] = sessionContextOf(run).split('\n');
      expect(JSON.parse(unavailableLine!.slice('[HarnessStateUnavailable] '.length)).reason_code)
        .toBe('state_resolution_failed');
    } finally {
      fixture.cleanup();
    }
  }, 30_000);

  test('PreEdit never calls the Effective State resolver, even when it would fail', () => {
    for (const kind of ['non-transient', 'transient'] as const) {
      const run = runMockedPreEdit(kind);
      expect(run.attempts).toBe(0);
      expect(run.result).toMatchObject({ exitCode: 0, reason: 'ok' });
      expect(run.output).not.toContain('[WorkflowObservation]');
    }
  }, 20000);
});
