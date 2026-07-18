import { describe, expect, test } from 'bun:test';
import type { EffectiveState } from '../../src/core/state/types';
import {
  resolveStateCommand,
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
    evidence_revision: `sha256:${'4'.repeat(64)}`,
    projection_revision: `sha256:${'5'.repeat(64)}`,
    progress_token: `sha256:${'6'.repeat(64)}`,
    authoritative_plan: { path: 'plans/plan-example.md', status: 'executing' },
    contract: {
      path: 'tasks/contracts/example.contract.md',
      status: 'Active',
      plan: 'plans/plan-example.md',
    },
    task_profile: 'code-change',
    workflow_profile: 'strict',
    requested_workflow_profile: 'strict',
    risk_floor: 'standard',
    profile_reasons: ['explicit-override:raise:strict'],
    profile_signals: null,
    allowed_paths: ['src/'],
    next_action: 'implement adapter convergence',
    guidance: 'full envelope',
    blockers: [],
    stale_sources: [],
    conflicting_sources: [],
    source_hashes: { authority_revision: `sha256:${'2'.repeat(64)}` },
    review: {
      path: null,
      freshness: 'missing',
      recommendation: null,
      recorded_subject_sha256: null,
      recorded_target_revision: null,
    },
    external_acceptance: { path: null, freshness: 'missing', status: null },
    checks: { path: null, freshness: 'missing', status: null },
    active_sprint: { path: null, freshness: 'not_applicable' },
    worktree: {
      path: '.ai/harness/active-worktree',
      freshness: 'fresh',
      current: '/repo',
      owner: '/repo',
    },
    handoff: { path: null, freshness: 'missing' },
    resume: { path: null, freshness: 'missing' },
    current_snapshot: { path: 'tasks/current.md', freshness: 'stale' },
    readiness: null,
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
        explicitOverride: 'strict',
      });
      return effectiveState();
    };
    const outcome = resolveStateCommand({
      targetPath: ['src/feature.ts'],
      operation: 'feature',
      profile: 'strict',
    }, { repoRoot: '/fixture', nowMs: 42, resolve });

    expect(outcome.exitCode).toBe(0);
    expect(called).toBe(true);
  });

  test('keeps field output, blocker suppression, and unknown-field exit semantics', () => {
    expect(run(effectiveState(), { field: 'workflow_profile' })).toEqual({
      exitCode: 0,
      stdout: 'strict\n',
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
