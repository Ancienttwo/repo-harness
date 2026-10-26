import { describe, expect, test } from 'bun:test';
import type { EffectiveState } from '../../src/core/state/types';
import {
  resolveStateCommand,
  boardStateCommand,
  buildStateCommand,
  type ResolveEffectiveState,
} from '../../src/cli/commands/state';

function effectiveState(overrides: Partial<EffectiveState> = {}): EffectiveState {
  return {
    protocol: 1,
    kind: 'repo-harness-effective-state',
    task_id: '20260715-adapter-parity',
    phase: 'executing',
    state_version: 7,
    state_revision: `sha256:${'1'.repeat(64)}`,
    authority_revision: `sha256:${'2'.repeat(64)}`,
    subject_revision: `sha256:${'3'.repeat(64)}`,
    projection_revision: `sha256:${'5'.repeat(64)}`,
    progress_token: `sha256:${'6'.repeat(64)}`,
    authoritative_plan: { path: 'plans/plan-example.md', status: 'executing' },
    workflow_profile: 'high',
    requested_workflow_profile: 'high',
    risk_floor: 'routine',
    profile_reasons: ['explicit-override:raise:high'],
    profile_signals: null,
    capability_ownership: null,
    next_action: 'implement adapter convergence',
    guidance: 'full envelope',
    blockers: [],
    stale_sources: [],
    conflicting_sources: [],
    source_hashes: { authority_revision: `sha256:${'2'.repeat(64)}` },
    worktree: {
      path: '.ai/harness/active-worktree',
      freshness: 'fresh',
      current: '/repo',
      owner: '/repo',
    },
    handoff: { path: null, freshness: 'missing' },
    resume: { path: null, freshness: 'missing' },
    current_snapshot: { path: 'tasks/current.md', freshness: 'stale' },
    ...overrides,
  };
}

function run(
  state: EffectiveState,
  options: Parameters<typeof resolveStateCommand>[0] = {},
) {
  return resolveStateCommand(options, {
    repoRoot: '/repo',
    nowMs: 1234,
    resolve: () => state,
  });
}

describe('resolveStateCommand', () => {
  test('renders the unchanged JSON protocol without touching process.exit', () => {
    const state = effectiveState();
    const originalExitCode = process.exitCode;
    const outcome = run(state);

    expect(outcome).toEqual({
      exitCode: 0,
      stdout: `${JSON.stringify(state, null, 2)}\n`,
      stderr: '',
    });
    expect(process.exitCode).toBe(originalExitCode);
  });

  test('passes the deterministic risk input and injected repo root/clock to the resolver', () => {
    let called = false;
    const resolve: ResolveEffectiveState = (repoRoot, nowMs, risk) => {
      called = true;
      expect(repoRoot).toBe('/fixture');
      expect(nowMs).toBe(42);
      expect(risk).toEqual({
        targetPaths: ['src/feature.ts'],
        operationKind: 'feature',
        explicitOverride: 'high',
      });
      return effectiveState();
    };
    const outcome = resolveStateCommand({
      targetPath: ['src/feature.ts'],
      operation: 'feature',
      profile: 'high',
    }, { repoRoot: '/fixture', nowMs: 42, resolve });

    expect(outcome.exitCode).toBe(0);
    expect(called).toBe(true);
  });

  test('keeps field output, blocker suppression, and unknown-field exit semantics', () => {
    expect(run(effectiveState(), { field: 'workflow_profile' })).toEqual({
      exitCode: 0,
      stdout: 'high\n',
      stderr: '',
    });
    expect(run(effectiveState(), { field: 'blockers' })).toEqual({
      exitCode: 0,
      stdout: '[]\n',
      stderr: '',
    });
    expect(run(effectiveState({ workflow_profile: null }), { field: 'workflow_profile' })).toEqual({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    expect(run(effectiveState({ blockers: ['missing_contract'] }), { field: 'workflow_profile' })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '',
    });

    const unknown = run(effectiveState(), { field: 'not_a_real_field' });
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stdout).toBe('');
    expect(unknown.stderr).toContain("unknown --field 'not_a_real_field'");
    expect(unknown.stderr).toContain('workflow_profile');
  });

  test('returns operational failures as exit 1 outcomes', () => {
    const outcome = resolveStateCommand({}, {
      repoRoot: '/repo',
      nowMs: 1234,
      resolve: () => { throw new Error('state lock unavailable'); },
    });
    expect(outcome).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'state lock unavailable\n',
    });
  });
});

describe('provider state board command', () => {
  test('requires exact registry selection and preserves the complete provider observation', () => {
    const board = { protocol: 2 as const, kind: 'repo-harness-provider-board' as const, registered_repository_id: 'repo_1',
      revision: `sha256:${'a'.repeat(64)}`, snapshot_consistency: 'changed_during_read' as const, source_status: 'unavailable' as const, cards: [] };
    const calls: unknown[] = [];
    const result = boardStateCommand({ repositoryId: 'repo_1', json: true }, { resolveBoard: input => { calls.push(input); return board; } });
    expect(calls).toEqual([{ repository_id: 'repo_1' }]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(board);
  });
  test('refuses absent and retired authority selectors before any observation', () => {
    const deps = { resolveBoard: () => { throw new Error('must not observe'); } };
    expect(boardStateCommand({}, deps).exitCode).toBe(2);
    expect(boardStateCommand({ repositoryId: 'repo_1', ...{ sprint: 'plans/old.md' } }, deps).exitCode).toBe(2);
    expect(boardStateCommand({ repositoryId: 'repo_1', ...{ targetRef: 'main' } }, deps).exitCode).toBe(2);
    const board = buildStateCommand().commands.find(command => command.name() === 'board')!;
    expect(board.options.map(option => option.long)).toEqual(['--json', '--repository-id']);
    board.exitOverride().configureOutput({ writeErr: () => undefined });
    expect(() => board.parse(['--json', '--repository-id', 'repo_1', '--sprint', 'plans/old.md'], { from: 'user' })).toThrow();
  });
  test('does not replace an unavailable provider observation with legacy board state', () => {
    expect(boardStateCommand({ repositoryId: 'repo_1' }, { resolveBoard: () => { throw new Error('provider unavailable'); } })).toEqual({
      exitCode: 1, stdout: '', stderr: 'provider unavailable\n',
    });
  });
});
