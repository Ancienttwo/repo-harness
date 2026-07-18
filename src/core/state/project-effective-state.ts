import type {
  WorkflowProfile,
  WorkflowProfileResult,
} from '../workflow/profile';
import { resolve as resolveArtifactRequirement } from '../workflow/artifact-requirement-policy';
import {
  firstOpenTask,
  markdownBullet,
  markdownHeader,
  markdownSectionHeader,
  parseAllowedPaths,
  parseIsoOrLocalTimestamp,
} from './artifact-parsers';
import type {
  EffectiveState,
  FreshnessState,
  SnapshotPlanState,
} from './types';

const CEREMONY_GUIDANCE: Readonly<Record<WorkflowProfile, string>> = {
  lite: 'brief -> edit -> targeted test; do not author plan, contract, notes, todos, or checks files (zero ceremony)',
  standard: 'at most one active plan artifact; no contract, notes, or todos scaffolding beyond it',
  strict: 'full envelope: plan, contract, notes, and checks as required',
};

export interface EffectiveStateReviewSubject {
  readonly available: boolean;
  readonly reviewSubjectSha256: string | null;
  readonly targetRevision: string | null;
  readonly targetOverlapCount: number;
}

export interface EffectiveStateInputs {
  readonly nowMs: number;
  readonly taskId: string | null;
  readonly planPath: string | null;
  readonly planStatus: SnapshotPlanState;
  readonly planText: string | null;
  readonly contractPath: string | null;
  readonly contractText: string | null;
  readonly riskResolution: WorkflowProfileResult;
  readonly contractOverride: string | null;
  readonly capabilityReasons: readonly string[];
  readonly capabilityRegistryInvalid: boolean;
  readonly staleSources: readonly string[];
  readonly conflictingSources: readonly string[];
  readonly reviewPath: string | null;
  readonly reviewText: string | null;
  readonly reviewSubject: EffectiveStateReviewSubject;
  readonly checksPath: string;
  readonly checksText: string | null;
  readonly sprintPath: string | null;
  readonly sprintExists: boolean;
  readonly activeWorktreePath: string;
  readonly currentWorktree: string;
  readonly worktreeOwner: string | null;
  readonly worktreeOwnerIsCurrent: boolean;
  readonly handoffPath: string;
  readonly handoffText: string | null;
  readonly resumePath: string;
  readonly resumeText: string | null;
  readonly currentSnapshotPath: string;
  readonly currentSnapshotText: string | null;
  readonly authorityRevision: string;
  readonly stateVersion: number;
  readonly stateRevision: string;
  readonly sourceHashes: Readonly<Record<string, string>>;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** Pure projection over already-read repository content and effect observations. */
export function projectEffectiveState(input: EffectiveStateInputs): EffectiveState {
  const staleSources = [...input.staleSources];
  const conflictingSources = [...input.conflictingSources];

  const recommendation = input.reviewText
    ? markdownHeader(input.reviewText, 'Recommendation')
    : null;
  const recordedSubject = input.reviewText
    ? markdownHeader(input.reviewText, 'Reviewed Subject SHA256')
    : null;
  const recordedTarget = input.reviewText
    ? markdownHeader(input.reviewText, 'Reviewed Target Revision')
    : null;
  const externalStatus = input.reviewText
    ? markdownHeader(input.reviewText, 'External Acceptance')
    : null;
  const externalSubject = input.reviewText
    ? markdownSectionHeader(input.reviewText, 'External Acceptance Advice', 'Reviewed Subject SHA256')
    : null;
  const externalTarget = input.reviewText
    ? markdownSectionHeader(input.reviewText, 'External Acceptance Advice', 'Reviewed Target Revision')
    : null;

  let reviewFreshness: FreshnessState = input.reviewPath ? 'missing' : 'not_applicable';
  if (input.reviewText) {
    if (
      !recordedSubject ||
      recordedSubject === 'pending' ||
      !/^sha256:[0-9a-f]{64}$/.test(recordedSubject) ||
      !recordedTarget ||
      !/^[0-9a-f]{40,64}$/.test(recordedTarget)
    ) {
      reviewFreshness = 'stale';
    } else if (input.reviewSubject.available) {
      reviewFreshness = input.reviewSubject.reviewSubjectSha256 === recordedSubject &&
        (input.reviewSubject.targetRevision === recordedTarget || input.reviewSubject.targetOverlapCount === 0)
        ? 'fresh'
        : 'stale';
    } else {
      reviewFreshness = 'unavailable';
    }
  }
  if (reviewFreshness === 'stale') staleSources.push('review');
  if (input.reviewText && externalStatus !== 'pass') staleSources.push('external_acceptance');

  const externalFreshness: FreshnessState = !input.reviewText
    ? reviewFreshness
    : externalStatus === 'pass' &&
        input.reviewSubject.available &&
        externalSubject === input.reviewSubject.reviewSubjectSha256 &&
        (externalTarget === input.reviewSubject.targetRevision || input.reviewSubject.targetOverlapCount === 0)
      ? 'fresh'
      : 'stale';
  if (externalFreshness === 'stale' && !staleSources.includes('external_acceptance')) {
    staleSources.push('external_acceptance');
  }

  let checksStatus: string | null = null;
  let checksPlan: string | null = null;
  let checksFingerprint: string | null = null;
  if (input.checksText) {
    try {
      const checks = JSON.parse(input.checksText) as {
        status?: unknown;
        active_plan?: unknown;
        review_subject_sha256?: unknown;
      };
      checksStatus = typeof checks.status === 'string' ? checks.status : null;
      checksPlan = typeof checks.active_plan === 'string' ? checks.active_plan : null;
      checksFingerprint = typeof checks.review_subject_sha256 === 'string'
        ? checks.review_subject_sha256
        : null;
    } catch {
      staleSources.push('checks');
    }
  }
  const checksFreshness: FreshnessState = !input.checksText
    ? 'missing'
    : checksPlan &&
        input.planPath &&
        checksPlan === input.planPath &&
        input.reviewSubject.available &&
        checksFingerprint === input.reviewSubject.reviewSubjectSha256
      ? 'fresh'
      : 'stale';
  if (checksFreshness === 'stale' && !staleSources.includes('checks')) staleSources.push('checks');

  const sprintFreshness: FreshnessState = !input.sprintPath
    ? 'not_applicable'
    : input.sprintExists ? 'fresh' : 'stale';
  if (sprintFreshness === 'stale') staleSources.push('active_sprint');

  const handoffTaskId = input.handoffText
    ? markdownHeader(input.handoffText, 'Task ID') ?? markdownBullet(input.handoffText, 'Task ID')
    : null;
  const handoffRevision = input.handoffText
    ? markdownHeader(input.handoffText, 'Source State Revision') ?? markdownBullet(input.handoffText, 'Source State Revision')
    : null;
  const handoffFreshness: FreshnessState = !input.handoffText
    ? 'missing'
    : input.taskId && handoffTaskId === input.taskId && handoffRevision === input.authorityRevision
      ? 'fresh'
      : 'stale';
  if (handoffFreshness === 'stale') staleSources.push('handoff');

  const resumeTaskId = input.resumeText
    ? markdownHeader(input.resumeText, 'Task ID') ?? markdownBullet(input.resumeText, 'Task ID')
    : null;
  const resumeRevision = input.resumeText
    ? markdownHeader(input.resumeText, 'Source State Revision') ?? markdownBullet(input.resumeText, 'Source State Revision')
    : null;
  const resumeHandoffHash = input.resumeText
    ? markdownHeader(input.resumeText, 'Handoff Hash') ?? markdownBullet(input.resumeText, 'Handoff Hash')
    : null;
  const resumeFreshness: FreshnessState = !input.resumeText
    ? 'missing'
    : input.taskId &&
        resumeTaskId === input.taskId &&
        resumeRevision === input.authorityRevision &&
        resumeHandoffHash === input.sourceHashes[input.handoffPath]
      ? 'fresh'
      : 'stale';
  if (resumeFreshness === 'stale') staleSources.push('resume');

  const currentPlan = input.currentSnapshotText
    ? markdownBullet(input.currentSnapshotText, 'Active Plan')
    : null;
  const currentUpdated = input.currentSnapshotText
    ? parseIsoOrLocalTimestamp(markdownHeader(input.currentSnapshotText, 'Updated At'))
    : null;
  const currentFreshness: FreshnessState = !input.currentSnapshotText
    ? 'missing'
    : currentUpdated !== null &&
        input.nowMs - currentUpdated <= 24 * 60 * 60 * 1000 &&
        ((!input.planPath && (!currentPlan || currentPlan === '(none)')) || currentPlan === input.planPath)
      ? 'fresh'
      : 'stale';
  if (currentFreshness === 'stale') staleSources.push('current_snapshot');

  const workflowProfile = input.riskResolution.ok ? input.riskResolution.profile : null;

  const blockers = conflictingSources.map((source) => `conflict:${source}`);
  if (
    input.planPath &&
    (input.planStatus === 'approved' || input.planStatus === 'executing') &&
    !input.contractText
  ) {
    // Fail closed by default (unresolvable profile keeps blocking); only a
    // resolved cell that marks `separate_contract` required overrides that.
    // Standard's not_required cell and Lite's absent entry both leave this
    // false, which is how the Standard collapse into missing_contract
    // disappears without any consumer-specific branch here or in the policy
    // module itself.
    let separateContractRequired = true;
    if (workflowProfile) {
      const contractPolicy = resolveArtifactRequirement({ profile: workflowProfile, operation: 'edit' });
      separateContractRequired = contractPolicy.ok
        ? contractPolicy.requirements.some(
            (requirement) => requirement.key === 'separate_contract' && requirement.status === 'required',
          )
        : true;
    }
    if (separateContractRequired) {
      blockers.push('missing_contract');
    }
  }
  if (checksFreshness === 'fresh' && checksStatus && checksStatus !== 'pass') {
    blockers.push('checks_failed');
  }
  if (!input.riskResolution.ok) {
    blockers.push(`workflow_profile:${input.riskResolution.code.toLowerCase()}`);
  }
  if (input.capabilityRegistryInvalid) blockers.push('capability_registry:invalid');

  const phase = blockers.length > 0
    ? 'blocked'
    : input.planPath ? input.planStatus : 'idle';
  const nextAction = blockers.length > 0
    ? 'resolve blockers'
    : firstOpenTask(input.planText) ?? (
      handoffFreshness === 'fresh' && input.handoffText
        ? markdownBullet(input.handoffText, 'Exact Next Step')
        : null
    );

  return {
    protocol: 1,
    kind: 'repo-harness-effective-state',
    task_id: input.taskId,
    phase,
    state_version: input.stateVersion,
    state_revision: input.stateRevision,
    authoritative_plan: input.planPath
      ? { path: input.planPath, status: input.planStatus }
      : null,
    contract: input.contractPath && input.contractText
      ? {
          path: input.contractPath,
          status: markdownHeader(input.contractText, 'Status'),
          plan: markdownHeader(input.contractText, 'Plan'),
        }
      : null,
    task_profile: input.contractText ? markdownHeader(input.contractText, 'Task Profile') : null,
    workflow_profile: workflowProfile,
    requested_workflow_profile: input.contractOverride,
    risk_floor: input.riskResolution.riskFloor,
    profile_reasons: [...input.riskResolution.reasons, ...input.capabilityReasons],
    profile_signals: input.riskResolution.ok ? input.riskResolution.signals : null,
    allowed_paths: parseAllowedPaths(input.contractText),
    next_action: nextAction,
    guidance: workflowProfile ? CEREMONY_GUIDANCE[workflowProfile] : null,
    blockers,
    stale_sources: uniqueSorted(staleSources),
    conflicting_sources: uniqueSorted(conflictingSources),
    source_hashes: input.sourceHashes,
    review: {
      path: input.reviewPath,
      freshness: reviewFreshness,
      recommendation,
      recorded_subject_sha256: recordedSubject,
      recorded_target_revision: recordedTarget,
    },
    external_acceptance: {
      path: input.reviewPath,
      freshness: externalFreshness,
      status: externalStatus,
    },
    checks: { path: input.checksPath, freshness: checksFreshness, status: checksStatus },
    active_sprint: { path: input.sprintPath, freshness: sprintFreshness },
    worktree: {
      path: input.activeWorktreePath,
      freshness: input.worktreeOwner
        ? input.worktreeOwnerIsCurrent ? 'fresh' : 'stale'
        : 'missing',
      current: input.currentWorktree,
      owner: input.worktreeOwner,
    },
    handoff: { path: input.handoffPath, freshness: handoffFreshness },
    resume: { path: input.resumePath, freshness: resumeFreshness },
    current_snapshot: { path: input.currentSnapshotPath, freshness: currentFreshness },
  };
}
