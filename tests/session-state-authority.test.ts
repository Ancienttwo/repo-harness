import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import type { EffectiveState, EffectiveStateRiskInput } from '../src/core/state/types';
import {
  projectEffectiveStateSessionSection,
  projectUnavailableStateSessionSection,
  resolveSessionEffectiveState,
} from '../src/cli/hook/runtime';

const STABILITY_ERROR = 'workflow authority changed repeatedly while resolving effective state';
const LOCK_ERROR = 'timed out waiting for exclusive lock /private/fixture/state.lock';
type StateResolver = (
  repoRoot: string,
  nowMs: number,
  risk?: EffectiveStateRiskInput,
) => EffectiveState;

function fixtureState(overrides: Partial<EffectiveState> = {}): EffectiveState {
  return {
    task_id: 'T-session-state',
    phase: 'executing',
    state_version: 7,
    state_revision: `sha256:${'a'.repeat(64)}`,
    workflow_profile: 'strict',
    next_action: 'continue',
    guidance: null,
    blockers: [],
    allowed_paths: ['src/fixture.ts'],
    checks: { path: '.ai/harness/checks/latest.json', freshness: 'fresh', status: 'pass' },
    authoritative_plan: { path: 'plans/plan-fixture.md', status: 'executing' },
    contract: { path: 'tasks/contracts/fixture.contract.md', status: 'Active', plan: 'plans/plan-fixture.md' },
    active_sprint: { path: null, freshness: 'missing' },
    handoff: { path: '.ai/harness/handoff/current.md', freshness: 'fresh' },
    resume: { path: '.ai/harness/handoff/resume.md', freshness: 'fresh' },
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
      '> **Workflow Profile**: standard', `> **Review File**: \`${review}\``,
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
    const hook = spawnSync(
      process.execPath,
      [resolve(import.meta.dir, '../src/cli/hook-entry.ts'), 'SessionStart', '--route', 'default'],
      {
        cwd: root,
        encoding: 'utf8',
        input: '',
        env: {
          ...gitEnv,
          HOOK_REPO_ROOT: root,
          HOOK_HOST: 'claude',
          HOOK_SESSION_ID: 'session-state-authority-baseline',
          HOOK_RUN_ID: 'session-state-authority-baseline-run',
        },
      },
    );
    if (hook.status !== 0) throw new Error(hook.stderr);
    const envelope = JSON.parse(hook.stdout);
    const context = envelope.hookSpecificOutput.additionalContext as string;
    const evidence = JSON.parse(readFileSync(join(root, '.ai/harness/state/session-context-budget.json'), 'utf8'));
    const event = JSON.parse(readFileSync(join(root, '.ai/harness/runs/hook-events.jsonl'), 'utf8').trim());
    return {
      protocol: 1,
      fixture_root: '(temporary)',
      context,
      output_bytes: Buffer.byteLength(context, 'utf8'),
      estimated_tokens: Math.ceil(Buffer.byteLength(context, 'utf8') / 4),
      evidence,
      telemetry: {
        child_processes: event.metrics.child_processes,
        state_resolutions: event.metrics.state_resolutions,
        runtime_entries: event.runtime_entries,
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
  readonly evidence: Record<string, unknown>;
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
      mock.module(process.env.RESOLVER_MODULE, () => ({
        resolveEffectiveState() {
          attempts += 1;
          throw new Error(process.env.FAILURE_KIND === 'transient'
            ? '${STABILITY_ERROR}'
            : 'injected state failure /private/secret/worktree');
        },
      }));
      const { runHook } = await import(process.env.RUNTIME_MODULE + '?isolated-failure=' + process.env.FAILURE_KIND);
      const result = runHook({
        event: 'SessionStart',
        routeId: 'default',
        cwd: process.env.FIXTURE_ROOT,
        env: {
          ...process.env,
          HOOK_REPO_ROOT: process.env.FIXTURE_ROOT,
          HOOK_HOST: 'claude',
          HOOK_SESSION_ID: 'failure-session',
          HOOK_RUN_ID: 'failure-run',
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
    const [envelopeText, resultText] = child.stdout.split('@@RESULT@@');
    const resultPayload = JSON.parse(resultText.trim());
    return {
      envelope: JSON.parse(envelopeText.trim()),
      result: resultPayload.result,
      attempts: resultPayload.attempts,
      evidence: JSON.parse(readFileSync(join(root, '.ai/harness/state/session-context-budget.json'), 'utf8')),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
      mock.module(process.env.RESOLVER_MODULE, () => ({
        resolveEffectiveState() {
          attempts += 1;
          throw new Error(process.env.FAILURE_KIND === 'transient'
            ? '${STABILITY_ERROR}'
            : 'injected non-transient pre-edit failure');
        },
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
          HOOK_SESSION_ID: 'preedit-failure-session',
          HOOK_RUN_ID: 'preedit-failure-run',
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
  });

  test('preserves exact healthy context, budget evidence, and route-runtime metrics', () => {
    const expected = JSON.parse(readFileSync(
      join(import.meta.dir, 'fixtures/session-start/state-authority-baseline.json'),
      'utf8',
    ));
    expect(captureHealthyBaseline()).toEqual(expected);
  });

  test('distinguishes actionable, non-actionable, and blocked-but-resolved state', () => {
    const actionable = fixtureState();
    const nonActionable = fixtureState({
      task_id: null,
      blockers: [],
      active_sprint: { path: null, freshness: 'missing' },
    });
    const blocked = fixtureState({ task_id: null, blockers: ['contract:missing'] });
    expect(resolveSessionEffectiveState('/repo-b', 123, (() => actionable) as StateResolver).kind)
      .toBe('resolved_actionable');
    expect(resolveSessionEffectiveState('/repo-b', 123, (() => nonActionable) as StateResolver).kind)
      .toBe('resolved_non_actionable');
    const blockedOutcome = resolveSessionEffectiveState('/repo-b', 123, (() => blocked) as StateResolver);
    expect(blockedOutcome.kind).toBe('resolved_actionable');
    expect(projectEffectiveStateSessionSection(blocked)?.content).toStartWith('[HarnessState] ');
    expect(projectEffectiveStateSessionSection(blocked)?.content).not.toContain('[HarnessStateUnavailable]');
  });

  test('uses the explicit repo root and freezes one timestamp across transient retry', () => {
    const calls: Array<{ root: string; nowMs: number; risk: unknown }> = [];
    const resolveAttempt = ((root: string, nowMs: number, risk: unknown) => {
      calls.push({ root, nowMs, risk });
      if (calls.length === 1) throw new Error(LOCK_ERROR);
      return fixtureState();
    }) as StateResolver;
    const outcome = resolveSessionEffectiveState('/repo-b', 123456, resolveAttempt);
    expect(outcome.kind).toBe('resolved_actionable');
    expect(calls).toHaveLength(2);
    expect(calls.map(({ root }) => root)).toEqual(['/repo-b', '/repo-b']);
    expect(calls.map(({ nowMs }) => nowMs)).toEqual([123456, 123456]);
    expect(calls[0].risk).toEqual({});
  });

  test('bounds transient retries at three and hashes unavailable evidence without raw errors', () => {
    let attempts = 0;
    const outcome = resolveSessionEffectiveState('/private/repo-b', 123, (() => {
      attempts += 1;
      throw new Error(LOCK_ERROR);
    }) as StateResolver);
    expect(attempts).toBe(3);
    expect(outcome.kind).toBe('unavailable');
    if (outcome.kind !== 'unavailable') throw new Error('expected unavailable');
    expect(outcome.diagnostic.reason_code).toBe('state_resolution_unstable');
    expect(outcome.diagnostic.error_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const section = projectUnavailableStateSessionSection(outcome.diagnostic);
    expect(section.mandatory).toBe(true);
    expect(section.actionable).toBe(true);
    expect(section.content).toStartWith('[HarnessStateUnavailable] ');
    expect(section.content).not.toContain('[HarnessState] ');
    expect(section.content).not.toContain('/private/repo-b');
    expect(section.content).not.toContain('/private/fixture');
    expect(section.content).not.toContain('timed out');
  });

  test('does not retry a non-transient resolver failure', () => {
    let attempts = 0;
    const outcome = resolveSessionEffectiveState('/repo-b', 123, (() => {
      attempts += 1;
      throw new TypeError('bad state /private/secret');
    }) as StateResolver);
    expect(attempts).toBe(1);
    expect(outcome.kind).toBe('unavailable');
    if (outcome.kind === 'unavailable') {
      expect(outcome.diagnostic.reason_code).toBe('state_resolution_failed');
    }
  });

  test('keeps the host hook successful for transient exhaustion and non-transient failure', () => {
    for (const [kind, attempts, reason] of [
      ['transient', 3, 'state_resolution_unstable'],
      ['non-transient', 1, 'state_resolution_failed'],
    ] as const) {
      const captured = runMockedFailure(kind);
      expect(captured.result).toMatchObject({ exitCode: 0, reason: 'ok', handler: 'session-context' });
      expect(captured.attempts).toBe(attempts);
      const context = ((captured.envelope.hookSpecificOutput as Record<string, unknown>).additionalContext as string);
      expect(context).toStartWith('[HarnessStateUnavailable] ');
      expect(context).not.toContain('/private/secret');
      expect(captured.evidence.provider_diagnostics).toEqual([expect.objectContaining({
        provider_id: 'effective-state',
        reason_code: reason,
        error_hash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      })]);
      expect(JSON.stringify(captured.evidence)).not.toContain('/private/secret');
    }
  }, 20000);

  test('preserves PreEdit non-transient and residual-transient adapter semantics', () => {
    const nonTransient = runMockedPreEdit('non-transient');
    expect(nonTransient.attempts).toBe(1);
    expect(nonTransient.result).toMatchObject({ exitCode: 2, reason: 'handler-failed' });
    expect(nonTransient.output).toContain('[WorkflowProfileGuard]');
    expect(nonTransient.output).not.toContain('[WorkflowResolutionUnstableGuard]');

    const transient = runMockedPreEdit('transient');
    expect(transient.attempts).toBe(3);
    expect(transient.result).toMatchObject({ exitCode: 2, reason: 'handler-failed' });
    expect(transient.output).toContain('[WorkflowResolutionUnstableGuard]');
  }, 20000);
});
