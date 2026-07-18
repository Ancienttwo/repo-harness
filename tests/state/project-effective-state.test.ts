import { describe, expect, test } from 'bun:test';
import {
  projectEffectiveState,
  type EffectiveStateInputs,
} from '../../src/core/state/project-effective-state';
import { projectStateSnapshot } from '../../src/core/state/project-state-snapshot';

const NOW = Date.parse('2026-07-15T12:00:00Z');
const PLAN = 'plans/plan-20260715-1200-fixture.md';
const CONTRACT = 'tasks/contracts/20260715-1200-fixture.contract.md';
const AUTHORITY = 'sha256:authority';
const SUBJECT_REVISION = 'sha256:subject';
const EVIDENCE_REVISION = 'sha256:evidence';
const PROJECTION_REVISION = 'sha256:projection';
const SUBJECT = `sha256:${'a'.repeat(64)}`;
const TARGET = 'b'.repeat(40);

function input(overrides: Partial<EffectiveStateInputs> = {}): EffectiveStateInputs {
  return {
    nowMs: NOW,
    taskId: '20260715-1200-fixture',
    planPath: PLAN,
    planStatus: 'executing',
    planText: '# Plan\n\n- [ ] run parity tests\n',
    contractPath: CONTRACT,
    contractText: [
      '# Contract',
      '> **Status**: Active',
      `> **Plan**: ${PLAN}`,
      '> **Task Profile**: code-change',
      '> **Workflow Profile**: standard',
      '## Allowed Paths',
      '```yaml',
      'allowed_paths:',
      '  - src/',
      '```',
    ].join('\n'),
    riskResolution: {
      ok: true,
      profile: 'standard',
      riskFloor: 'standard',
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
    contractOverride: 'standard',
    capabilityReasons: [],
    capabilityRegistryInvalid: false,
    staleSources: [],
    conflictingSources: [],
    reviewPath: null,
    reviewText: null,
    reviewSubject: {
      available: false,
      reviewSubjectSha256: null,
      targetRevision: null,
      targetOverlapCount: 0,
    },
    checksPath: '.ai/harness/checks/latest.json',
    checksText: null,
    sprintPath: null,
    sprintExists: false,
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
    evidenceRevision: EVIDENCE_REVISION,
    projectionRevision: PROJECTION_REVISION,
    stateVersion: 7,
    stateRevision: 'sha256:state',
    sourceHashes: { '.ai/harness/handoff/current.md': 'sha256:handoff' },
    ...overrides,
  };
}

describe('pure Effective State projection', () => {
  test('projects phase, profile, contract, and first open task without I/O', () => {
    const state = projectEffectiveState(input());
    expect(state.phase).toBe('executing');
    expect(state.next_action).toBe('run parity tests');
    expect(state.workflow_profile).toBe('standard');
    expect(state.guidance).toContain('at most one active plan artifact');
    expect(state.contract).toEqual({ path: CONTRACT, status: 'Active', plan: PLAN });
    expect(state.allowed_paths).toEqual(['src/']);
  });

  test('projects fresh review/check/handoff/resume/current branches and handoff next action', () => {
    const reviewText = [
      '> **Recommendation**: pass',
      `> **Reviewed Subject SHA256**: ${SUBJECT}`,
      `> **Reviewed Target Revision**: ${TARGET}`,
      '> **External Acceptance**: pass',
      '## External Acceptance Advice',
      `> **Reviewed Subject SHA256**: ${SUBJECT}`,
      `> **Reviewed Target Revision**: ${TARGET}`,
    ].join('\n');
    const handoff = [
      '> **Task ID**: 20260715-1200-fixture',
      `> **Source State Revision**: ${AUTHORITY}`,
      '- Exact Next Step: resume adapter parity',
    ].join('\n');
    const state = projectEffectiveState(input({
      planText: '# Plan\n',
      reviewPath: 'tasks/reviews/fixture.review.md',
      reviewText,
      reviewSubject: {
        available: true,
        reviewSubjectSha256: SUBJECT,
        targetRevision: TARGET,
        targetOverlapCount: 1,
      },
      checksText: JSON.stringify({ status: 'pass', active_plan: PLAN, review_subject_sha256: SUBJECT }),
      sprintPath: 'plans/sprints/fixture.sprint.md',
      sprintExists: true,
      handoffText: handoff,
      resumeText: [
        '> **Task ID**: 20260715-1200-fixture',
        `> **Source State Revision**: ${AUTHORITY}`,
        '> **Handoff Hash**: sha256:handoff',
      ].join('\n'),
      currentSnapshotText: `> **Updated At**: 2026-07-15T11:30:00Z\n- Active Plan: ${PLAN}\n`,
    }));
    expect(state.next_action).toBe('resume adapter parity');
    expect(state.review.freshness).toBe('fresh');
    expect(state.external_acceptance.freshness).toBe('fresh');
    expect(state.checks.freshness).toBe('fresh');
    expect(state.active_sprint.freshness).toBe('fresh');
    expect(state.handoff.freshness).toBe('fresh');
    expect(state.resume.freshness).toBe('fresh');
    expect(state.current_snapshot.freshness).toBe('fresh');
    expect(state.stale_sources).toEqual([]);
  });

  test('projects conflicts, failed checks, invalid risk, and invalid registry as blockers', () => {
    const state = projectEffectiveState(input({
      contractText: null,
      riskResolution: {
        ok: false,
        code: 'INVALID_RISK_INPUT',
        message: 'missing signals',
        requestedProfile: null,
        riskFloor: 'strict',
        reasons: ['risk-floor:strict:signals-unavailable'],
      },
      capabilityRegistryInvalid: true,
      staleSources: ['active_plan_marker', 'active_plan_marker'],
      conflictingSources: ['worktree_owner', 'worktree_owner'],
    }));
    expect(state.phase).toBe('blocked');
    expect(state.next_action).toBe('resolve blockers');
    expect(state.blockers).toEqual([
      'conflict:worktree_owner',
      'conflict:worktree_owner',
      'missing_contract',
      'workflow_profile:invalid_risk_input',
      'capability_registry:invalid',
    ]);
    expect(state.stale_sources).toEqual(['active_plan_marker']);
    expect(state.conflicting_sources).toEqual(['worktree_owner']);
    expect(state.guidance).toBeNull();
  });

  test('projects checks_failed only from a fresh subject-bound failed check', () => {
    const state = projectEffectiveState(input({
      reviewSubject: {
        available: true,
        reviewSubjectSha256: SUBJECT,
        targetRevision: TARGET,
        targetOverlapCount: 0,
      },
      checksText: JSON.stringify({ status: 'fail', active_plan: PLAN, review_subject_sha256: SUBJECT }),
    }));
    expect(state.checks.freshness).toBe('fresh');
    expect(state.blockers).toContain('checks_failed');

    const mismatched = projectEffectiveState(input({
      reviewSubject: {
        available: true,
        reviewSubjectSha256: SUBJECT,
        targetRevision: TARGET,
        targetOverlapCount: 0,
      },
      checksText: JSON.stringify({
        status: 'pass',
        active_plan: PLAN,
        review_subject_sha256: `sha256:${'0'.repeat(64)}`,
      }),
    }));
    expect(mismatched.checks.freshness).toBe('stale');
    expect(mismatched.stale_sources).toContain('checks');
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
      contractPath: null,
      contractText: null,
      worktreeOwner: null,
      worktreeOwnerIsCurrent: false,
    })).phase).toBe('idle');
    for (const status of ['draft', 'annotating', 'approved', 'executing', 'unknown'] as const) {
      const state = projectEffectiveState(input({
        planStatus: status,
        contractText: status === 'approved' || status === 'executing' ? input().contractText : null,
      }));
      expect(state.phase).toBe(status);
    }
    expect(projectEffectiveState(input({ planText: '# Plan\n', handoffText: null })).next_action).toBeNull();
  });

  test('covers missing, unavailable, stale, and not-applicable freshness branches', () => {
    const missing = projectEffectiveState(input({ reviewPath: 'tasks/reviews/missing.review.md' }));
    expect(missing.review.freshness).toBe('missing');
    expect(missing.external_acceptance.freshness).toBe('missing');
    expect(missing.checks.freshness).toBe('missing');
    expect(missing.active_sprint.freshness).toBe('not_applicable');
    expect(missing.handoff.freshness).toBe('missing');
    expect(missing.resume.freshness).toBe('missing');
    expect(missing.current_snapshot.freshness).toBe('missing');

    const unavailable = projectEffectiveState(input({
      reviewPath: 'tasks/reviews/unavailable.review.md',
      reviewText: [
        '> **Recommendation**: pass',
        `> **Reviewed Subject SHA256**: ${SUBJECT}`,
        `> **Reviewed Target Revision**: ${TARGET}`,
        '> **External Acceptance**: unavailable',
      ].join('\n'),
    }));
    expect(unavailable.review.freshness).toBe('unavailable');
    expect(unavailable.external_acceptance.freshness).toBe('stale');

    const stale = projectEffectiveState(input({
      reviewPath: 'tasks/reviews/stale.review.md',
      reviewText: '> **Reviewed Subject SHA256**: pending\n',
      checksText: '{invalid',
      sprintPath: 'plans/sprints/missing.sprint.md',
      sprintExists: false,
      worktreeOwner: '/other',
      worktreeOwnerIsCurrent: false,
      handoffText: '> **Task ID**: other\n',
      resumeText: '> **Task ID**: other\n',
      currentSnapshotText: '> **Updated At**: 2000-01-01T00:00:00Z\n',
    }));
    expect(stale.review.freshness).toBe('stale');
    expect(stale.checks.freshness).toBe('stale');
    expect(stale.active_sprint.freshness).toBe('stale');
    expect(stale.worktree.freshness).toBe('stale');
    expect(stale.handoff.freshness).toBe('stale');
    expect(stale.resume.freshness).toBe('stale');
    expect(stale.current_snapshot.freshness).toBe('stale');

    const notApplicable = projectEffectiveState(input({ reviewPath: null, reviewText: null }));
    expect(notApplicable.review.freshness).toBe('not_applicable');
    expect(notApplicable.external_acceptance.freshness).toBe('not_applicable');
    expect(projectEffectiveState(input({ worktreeOwner: null })).worktree.freshness).toBe('missing');
  });

  test('covers lite and strict profile guidance branches', () => {
    for (const profile of ['lite', 'strict'] as const) {
      const base = input().riskResolution;
      if (!base.ok) throw new Error('fixture risk resolution must be valid');
      const state = projectEffectiveState(input({
        riskResolution: { ...base, profile, riskFloor: profile },
        contractOverride: profile,
      }));
      expect(state.workflow_profile).toBe(profile);
      expect(state.guidance).toBe(profile === 'lite'
        ? 'brief -> edit -> targeted test; do not author plan, contract, notes, todos, or checks files (zero ceremony)'
        : 'full envelope: plan, contract, notes, and checks as required');
    }
  });

  test('exposes the four additive revisions verbatim and derives progress_token as a pure content hash', () => {
    const state = projectEffectiveState(input());
    expect(state.authority_revision).toBe(AUTHORITY);
    expect(state.subject_revision).toBe(SUBJECT_REVISION);
    expect(state.evidence_revision).toBe(EVIDENCE_REVISION);
    expect(state.projection_revision).toBe(PROJECTION_REVISION);
    expect(state.progress_token).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('progress_token depends only on subject/evidence revisions, completed tasks, blockers, and allowed_paths -- never projection text, time, or state version', () => {
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
      contractText: null,
      riskResolution: {
        ok: false,
        code: 'INVALID_RISK_INPUT',
        message: 'missing signals',
        requestedProfile: null,
        riskFloor: 'strict',
        reasons: ['risk-floor:strict:signals-unavailable'],
      },
    }));
    expect(blocked.progress_token).not.toBe(base.progress_token);

    // The subject or evidence bucket advancing is also real progress.
    expect(projectEffectiveState(input({ subjectRevision: 'sha256:moved-subject' })).progress_token)
      .not.toBe(base.progress_token);
    expect(projectEffectiveState(input({ evidenceRevision: 'sha256:moved-evidence' })).progress_token)
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
    expect(keys.slice(6, 11)).toEqual([
      'authority_revision',
      'subject_revision',
      'evidence_revision',
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
      contractPath: null,
      contractText: null,
      staleSources: ['active_plan_marker'],
    })), facts);
    expect(stale.states.plan).toBe('stale_marker');
    expect(stale.paths).toEqual({ active_plan: PLAN, contract: null });
    expect(stale.marker.problem).toBe('deleted');
  });
});
