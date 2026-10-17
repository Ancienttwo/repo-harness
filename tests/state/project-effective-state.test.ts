import { describe, expect, test } from 'bun:test';
import {
  projectEffectiveState,
  type EffectiveStateInputs,
} from '../../src/core/state/project-effective-state';
import { projectStateSnapshot } from '../../src/core/state/project-state-snapshot';
import { capabilityOwnershipBlocker } from '../../src/core/capabilities/ownership-blocker';

const NOW = Date.parse('2026-07-15T12:00:00Z');
const PLAN = 'plans/plan-20260715-1200-fixture.md';
const CONTRACT = 'tasks/contracts/20260715-1200-fixture.contract.md';
const AUTHORITY = 'sha256:authority';
const SUBJECT_REVISION = 'sha256:subject';
const PROJECTION_REVISION = 'sha256:projection';
const INVALID_REGISTRY = capabilityOwnershipBlocker(
  { code: 'INVALID_JSON', path: '$', message: 'invalid JSON: Unexpected token' },
  'registry',
);
const UNAVAILABLE_OWNERSHIP = capabilityOwnershipBlocker(
  { code: 'ARCHCONTEXT_RESOLVE_FAILED', path: '.archcontext/model/nodes', message: 'package-local archctx@0.7.2 is missing\n  from the consumer dependency tree' },
  'archcontext',
);

function input(overrides: Partial<EffectiveStateInputs> = {}): EffectiveStateInputs {
  return {
    nowMs: NOW,
    taskId: '20260715-1200-fixture',
    planPath: PLAN,
    planStatus: 'executing',
    planText: '# Plan\n\n- [ ] run parity tests\n',
    riskResolution: {
      ok: true,
      profile: 'routine',
      riskFloor: 'routine',
      reasons: ['risk-floor:standard:feature'],
      signals: {
        targetPathCount: 1,
        capabilityCount: 1,
        operationKind: 'edit',
        strictCategories: [],
        mediumScope: false,
        crossCapability: false,
      },
    },
    requestedWorkflowProfile: 'routine',
    capabilityReasons: [],
    capabilityBlocker: null,
    capabilityOwnership: null,
    staleSources: [],
    conflictingSources: [],
    activeWorktreePath: '.ai/harness/active-worktree',
    currentWorktree: '/repo',
    worktreeOwner: '/repo',
    worktreeOwnerIsCurrent: true,
    handoffPath: '.ai/harness/handoff/current.md',
    handoffText: null,
    resumePath: '.ai/harness/handoff/resume.md',
    resumeText: null,
    currentSnapshotPath: 'tasks/current.md',
    currentSnapshotText: null,
    authorityRevision: AUTHORITY,
    subjectRevision: SUBJECT_REVISION,
    projectionRevision: PROJECTION_REVISION,
    stateVersion: 7,
    stateRevision: 'sha256:state',
    sourceHashes: { '.ai/harness/handoff/current.md': 'sha256:handoff' },
    ...overrides,
  };
}

describe('pure Effective State projection', () => {
  test('snapshot age changes freshness without changing workflow admission authority', () => {
    const snapshot = `> **Updated At**: 2026-07-15T12:00:00Z\n- Active Plan: ${PLAN}\n`;
    const before = projectEffectiveState(input({ currentSnapshotText: snapshot, nowMs: NOW + 24 * 60 * 60 * 1000 }));
    const after = projectEffectiveState(input({ currentSnapshotText: snapshot, nowMs: NOW + 24 * 60 * 60 * 1000 + 1 }));
    expect(before.current_snapshot.freshness).toBe('fresh');
    expect(after.current_snapshot.freshness).toBe('stale');
    expect(before.stale_sources).not.toContain('current_snapshot');
    expect(after.stale_sources).toContain('current_snapshot');
    expect(after.blockers).toEqual(before.blockers);

    expect(after.progress_token).toBe(before.progress_token);
    expect(after.phase).toBe(before.phase);

    const invalidAuthority = projectEffectiveState(input({ currentSnapshotText: snapshot, nowMs: NOW, capabilityBlocker: INVALID_REGISTRY }));
    expect(invalidAuthority.blockers).toContain('capability_registry:invalid');

  });

  test('projects phase, profile, and first open task without I/O', () => {
    const state = projectEffectiveState(input());
    expect(state.phase).toBe('executing');
    expect(state.next_action).toBe('run parity tests');
    expect(state.workflow_profile).toBe('routine');
    expect(state.guidance).toContain('verify typecheck and affected tests once');

  });

  test('projects fresh handoff/resume/current branches and handoff next action', () => {
    const handoff = [
      '> **Task ID**: 20260715-1200-fixture',
      `> **Source State Revision**: ${AUTHORITY}`,
      '- Exact Next Step: resume adapter parity',
    ].join('\n');
    const state = projectEffectiveState(input({
      planText: '# Plan\n',
      handoffText: handoff,
      resumeText: [
        '> **Task ID**: 20260715-1200-fixture',
        `> **Source State Revision**: ${AUTHORITY}`,
        '> **Handoff Hash**: sha256:handoff',
      ].join('\n'),
      currentSnapshotText: `> **Updated At**: 2026-07-15T11:30:00Z\n- Active Plan: ${PLAN}\n`,
    }));
    expect(state.next_action).toBe('resume adapter parity');

    expect(state.handoff.freshness).toBe('fresh');
    expect(state.resume.freshness).toBe('fresh');
    expect(state.current_snapshot.freshness).toBe('fresh');
    expect(state.stale_sources).toEqual([]);
  });

  test('projects conflicts, invalid risk, and invalid registry as blockers', () => {
    const state = projectEffectiveState(input({
      riskResolution: {
        ok: false,
        code: 'INVALID_RISK_INPUT',
        message: 'missing signals',
        requestedProfile: null,
        riskFloor: 'high',
        reasons: ['risk-floor:strict:signals-unavailable'],
      },
      capabilityBlocker: INVALID_REGISTRY,
      staleSources: ['active_plan_marker', 'active_plan_marker'],
      conflictingSources: ['worktree_owner', 'worktree_owner'],
    }));
    expect(state.phase).toBe('blocked');
    // The capability blocker keeps its cause and fix in next_action (#676 finding 1).
    expect(state.next_action).toBe(
      'resolve blockers: capability_registry:invalid INVALID_JSON: invalid JSON: Unexpected token; fix: repo-harness run capability-resolver validate',
    );
    expect(state.blockers).toEqual([
      'conflict:worktree_owner',
      'conflict:worktree_owner',
      'workflow_profile:invalid_risk_input',
      'capability_registry:invalid',
    ]);
    expect(state.stale_sources).toEqual(['active_plan_marker']);
    expect(state.conflicting_sources).toEqual(['worktree_owner']);
    expect(state.guidance).toBeNull();
  });

  test('an archctx failure projects the unavailable key with a one-line cause and the update command', () => {
    const state = projectEffectiveState(input({ capabilityBlocker: UNAVAILABLE_OWNERSHIP }));
    expect(state.blockers).toEqual(['capability_ownership:unavailable']);
    expect(state.blockers).not.toContain('capability_registry:invalid');
    expect(state.phase).toBe('blocked');
    expect(state.next_action).toBe(
      'resolve blockers: capability_ownership:unavailable ARCHCONTEXT_RESOLVE_FAILED: package-local archctx@0.7.2 is missing from the consumer dependency tree; fix: repo-harness update',
    );
  });

  test('an archctx error envelope is a registry fault, not an unavailable runtime', () => {
    const rejected = capabilityOwnershipBlocker(
      { code: 'ARCHCONTEXT_MODEL_REJECTED', path: '.archcontext/model/nodes', message: 'archctx resolve rejected the model: AC_X: boom' },
      'archcontext',
    );
    const state = projectEffectiveState(input({ capabilityBlocker: rejected }));
    expect(state.blockers).toEqual(['capability_registry:invalid']);
    expect(state.next_action).toStartWith('resolve blockers: capability_registry:invalid ARCHCONTEXT_MODEL_REJECTED: archctx resolve rejected the model: AC_X: boom; fix: ');
    expect(state.next_action).not.toContain('repo-harness update');
  });

  test('ordinary blockers keep the plain next action', () => {
    const state = projectEffectiveState(input({ conflictingSources: ['worktree_owner'] }));
    expect(state.blockers).toEqual(['conflict:worktree_owner']);
    expect(state.next_action).toBe('resolve blockers');
  });

  test('binds resume independently to task id, authority revision, and handoff hash', () => {
    const taskId = '20260715-1200-fixture';
    const resume = (candidateTaskId: string, revision: string, handoffHash: string) => [
      `> **Task ID**: ${candidateTaskId}`,
      `> **Source State Revision**: ${revision}`,
      `> **Handoff Hash**: ${handoffHash}`,
    ].join('\n');
    const fresh = resume(taskId, AUTHORITY, 'sha256:handoff');
    expect(projectEffectiveState(input({ resumeText: fresh })).resume.freshness).toBe('fresh');

    for (const stale of [
      resume('other-task', AUTHORITY, 'sha256:handoff'),
      resume(taskId, 'sha256:other-authority', 'sha256:handoff'),
      resume(taskId, AUTHORITY, 'sha256:other-handoff'),
    ]) {
      expect(projectEffectiveState(input({ resumeText: stale })).resume.freshness).toBe('stale');
    }
  });

  test('covers every non-blocked phase and the null next-action branch', () => {
    expect(projectEffectiveState(input({
      taskId: null,
      planPath: null,
      planStatus: 'none',
      planText: null,
      worktreeOwner: null,
      worktreeOwnerIsCurrent: false,
    })).phase).toBe('idle');
    for (const status of ['draft', 'annotating', 'approved', 'executing', 'unknown'] as const) {
      const state = projectEffectiveState(input({
        planStatus: status,
      }));
      expect(state.phase).toBe(status);
    }
    expect(projectEffectiveState(input({ planText: '# Plan\n', handoffText: null })).next_action).toBeNull();
  });

  test('covers missing, unavailable, stale, and not-applicable freshness branches', () => {
    const missing = projectEffectiveState(input());

    expect(missing.handoff.freshness).toBe('missing');
    expect(missing.resume.freshness).toBe('missing');
    expect(missing.current_snapshot.freshness).toBe('missing');

    const stale = projectEffectiveState(input({
      worktreeOwner: '/other',
      worktreeOwnerIsCurrent: false,
      handoffText: '> **Task ID**: other\n',
      resumeText: '> **Task ID**: other\n',
      currentSnapshotText: '> **Updated At**: 2000-01-01T00:00:00Z\n',
    }));

    expect(stale.worktree.freshness).toBe('stale');
    expect(stale.handoff.freshness).toBe('stale');
    expect(stale.resume.freshness).toBe('stale');
    expect(stale.current_snapshot.freshness).toBe('stale');

    expect(projectEffectiveState(input({ worktreeOwner: null })).worktree.freshness).toBe('missing');
  });

  test('covers lite and strict profile guidance branches', () => {
    for (const profile of ['routine', 'high'] as const) {
      const base = input().riskResolution;
      if (!base.ok) throw new Error('fixture risk resolution must be valid');
      const state = projectEffectiveState(input({
        riskResolution: { ...base, profile, riskFloor: profile },
        requestedWorkflowProfile: profile,
      }));
      expect(state.workflow_profile).toBe(profile);
      expect(state.guidance).toContain(profile === 'routine'
        ? 'Implement the authorized scope'
        : 'consult a reviewer');
      expect(state.guidance).toContain('Current edit-time requirements supersede earlier snapshot guidance');
    }
  });

  test('exposes the three revisions verbatim and derives progress_token as a pure content hash', () => {
    const state = projectEffectiveState(input());
    expect(state.authority_revision).toBe(AUTHORITY);
    expect(state.subject_revision).toBe(SUBJECT_REVISION);

    expect(state.projection_revision).toBe(PROJECTION_REVISION);
    expect(state.progress_token).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('progress_token depends only on subject revision, completed tasks and blockers -- never projection text, time, or state version', () => {
    const base = projectEffectiveState(input());

    // Projection-only churn (handoff/resume/current-snapshot text, plus the
    // clock and the untouched state_version/state_revision) must never move
    // it: none of those are in the recipe.
    const projectionChurned = projectEffectiveState(input({
      handoffText: '> **Task ID**: other\n',
      resumeText: '> **Task ID**: other\n',
      currentSnapshotText: '> **Updated At**: 2000-01-01T00:00:00Z\n',
      nowMs: NOW + 999_999,
      stateVersion: 999,
      stateRevision: 'sha256:different',
    }));
    expect(projectionChurned.progress_token).toBe(base.progress_token);

    // Checking off a task is real progress: the completed-task marker set
    // changes, so the token moves.
    const taskCompleted = projectEffectiveState(input({
      planText: '# Plan\n\n- [x] run parity tests\n',
    }));
    expect(taskCompleted.progress_token).not.toBe(base.progress_token);

    // A new hard blocker is real (regressive) progress: the token moves.
    const blocked = projectEffectiveState(input({
      riskResolution: {
        ok: false,
        code: 'INVALID_RISK_INPUT',
        message: 'missing signals',
        requestedProfile: null,
        riskFloor: 'high',
        reasons: ['risk-floor:strict:signals-unavailable'],
      },
    }));
    expect(blocked.progress_token).not.toBe(base.progress_token);

    // A changed subject is progress.
    expect(projectEffectiveState(input({ subjectRevision: 'sha256:moved-subject' })).progress_token)
      .not.toBe(base.progress_token);
  });

  test('preserves the protocol v1 JSON field order', () => {
    const keys = Object.keys(projectEffectiveState(input()));
    expect(keys.slice(0, 6)).toEqual([
      'protocol',
      'kind',
      'task_id',
      'phase',
      'state_version',
      'state_revision',
    ]);
    expect(keys.slice(6, 10)).toEqual([
      'authority_revision',
      'subject_revision',
      'projection_revision',
      'progress_token',
    ]);
    expect(keys.indexOf('next_action')).toBeLessThan(keys.indexOf('source_hashes'));
  });
});

describe('state-snapshot compatibility projection', () => {
  test('owns draft, approved, and stale-marker branch mapping', () => {
    const facts = {
      spec: 'present',
      pending: 'none',
      activePlanMarker: PLAN,
      contractPath: CONTRACT,
      contractPresent: true,
      evidence: 'complete',
    } as const;
    const activeCases = [
      { status: 'draft', expected: 'draft' },
      { status: 'approved', expected: 'approved' },
    ] as const;

    for (const entry of activeCases) {
      const snapshot = projectStateSnapshot(
        projectEffectiveState(input({ planStatus: entry.status })),
        facts,
      );
      expect(snapshot.states.plan).toBe(entry.expected);
      expect(snapshot.paths.active_plan).toBe(PLAN);
      expect(snapshot.marker.problem).toBe('none');
    }

    const stale = projectStateSnapshot(projectEffectiveState(input({
      planPath: null,
      planStatus: 'none',
      planText: null,
      staleSources: ['active_plan_marker'],
    })), facts);
    expect(stale.states.plan).toBe('stale_marker');
    expect(stale.paths).toEqual({ active_plan: PLAN, contract: null });
    expect(stale.marker.problem).toBe('deleted');
  });
});
