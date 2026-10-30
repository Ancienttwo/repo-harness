import { describe, expect, test } from 'bun:test';
import {
  projectEffectiveState,
  type EffectiveStateInputs,
} from '../../src/core/state/project-effective-state';
import { projectStateSnapshot } from '../../src/core/state/project-state-snapshot';
import { capabilityOwnershipBlocker } from '../../src/core/capabilities/ownership-blocker';

const NOW = Date.parse('2026-07-15T12:00:00Z');
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

function freshHandoff(nextStep = 'resume adapter parity'): string {
  return [
    `> **Source State Revision**: ${AUTHORITY}`,
    `- Exact Next Step: ${nextStep}`,
  ].join('\n');
}

function freshResume(): string {
  return [
    `> **Source State Revision**: ${AUTHORITY}`,
    '> **Handoff Hash**: sha256:handoff',
  ].join('\n');
}

describe('pure Effective State projection', () => {
  test('snapshot age changes freshness without changing workflow admission authority', () => {
    const snapshot = '> **Updated At**: 2026-07-15T12:00:00Z\n';
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

  test('projects idle phase, profile, and only the handoff next action without I/O', () => {
    const state = projectEffectiveState(input({ handoffText: freshHandoff() }));
    expect(state.protocol).toBe(2);
    expect(state.phase).toBe('idle');
    expect(state.next_action).toBe('resume adapter parity');
    expect(state.workflow_profile).toBe('routine');
    expect(state.guidance).toContain('verify typecheck and affected tests once');
  });

  test('projects fresh handoff/resume/current branches and handoff next action', () => {
    const state = projectEffectiveState(input({
      handoffText: freshHandoff(),
      resumeText: freshResume(),
      currentSnapshotText: '> **Updated At**: 2026-07-15T11:30:00Z\n',
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
      staleSources: ['handoff', 'handoff'],
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
    expect(state.stale_sources).toEqual(['handoff']);
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

  test('binds resume independently to authority revision and handoff hash', () => {
    const resume = (revision: string, handoffHash: string) => [
      `> **Source State Revision**: ${revision}`,
      `> **Handoff Hash**: ${handoffHash}`,
    ].join('\n');
    expect(projectEffectiveState(input({ resumeText: resume(AUTHORITY, 'sha256:handoff') })).resume.freshness)
      .toBe('fresh');

    for (const stale of [
      resume('sha256:other-authority', 'sha256:handoff'),
      resume(AUTHORITY, 'sha256:other-handoff'),
    ]) {
      expect(projectEffectiveState(input({ resumeText: stale })).resume.freshness).toBe('stale');
    }
  });

  test('covers the blocked and idle phase branches and the null next-action branch', () => {
    expect(projectEffectiveState(input()).phase).toBe('idle');
    expect(projectEffectiveState(input({ conflictingSources: ['worktree_owner'] })).phase).toBe('blocked');
    expect(projectEffectiveState(input({ handoffText: null })).next_action).toBeNull();
  });

  test('covers missing, unavailable, stale, and not-applicable freshness branches', () => {
    const missing = projectEffectiveState(input());

    expect(missing.handoff.freshness).toBe('missing');
    expect(missing.resume.freshness).toBe('missing');
    expect(missing.current_snapshot.freshness).toBe('missing');

    const stale = projectEffectiveState(input({
      worktreeOwner: '/other',
      worktreeOwnerIsCurrent: false,
      handoffText: '> **Source State Revision**: sha256:other\n',
      resumeText: '> **Source State Revision**: sha256:other\n',
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

  test('progress_token depends only on subject revision and blockers -- never projection text, time, or state version', () => {
    const base = projectEffectiveState(input());

    const projectionChurned = projectEffectiveState(input({
      handoffText: '> **Source State Revision**: other\n',
      resumeText: '> **Source State Revision**: other\n',
      currentSnapshotText: '> **Updated At**: 2000-01-01T00:00:00Z\n',
      nowMs: NOW + 999_999,
      stateVersion: 999,
      stateRevision: 'sha256:different',
    }));
    expect(projectionChurned.progress_token).toBe(base.progress_token);

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

    expect(projectEffectiveState(input({ subjectRevision: 'sha256:moved-subject' })).progress_token)
      .not.toBe(base.progress_token);
  });

  test('preserves the protocol v2 JSON field order', () => {
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
  test('keeps a plan-free protocol-1 snapshot shape', () => {
    const snapshot = projectStateSnapshot(projectEffectiveState(input()), {
      spec: 'present',
      pending: 'none',
    });
    expect(snapshot).toEqual({
      protocol: 1,
      kind: 'repo-harness-state-snapshot',
      states: {
        spec: 'present',
        plan: 'none',
        pending: 'none',
        worktree: 'current',
        evidence: 'unchecked',
      },
      paths: { active_plan: null },
      marker: { problem: 'none' },
    });

    const foreign = projectStateSnapshot(projectEffectiveState(input({
      worktreeOwner: '/other',
      worktreeOwnerIsCurrent: false,
    })), { spec: 'missing', pending: 'stale' });
    expect(foreign.states.worktree).toBe('foreign_marker');
    expect(foreign.marker.problem).toBe('foreign_worktree');
  });
});
