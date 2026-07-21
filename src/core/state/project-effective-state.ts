import { createHash } from 'crypto';
import type {
  WorkflowProfile,
  WorkflowProfileResult,
} from '../workflow/profile';
import {
  resolve as resolveArtifactRequirement,
  type ArtifactRequirementKey,
} from '../workflow/artifact-requirement-policy';
import { evaluateReadiness, type EvaluateReadinessResult } from '../workflow/operation-readiness';
import {
  firstOpenTask,
  markdownBullet,
  markdownHeader,
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
  readonly subjectRevision: string;
  readonly evidenceRevision: string;
  readonly projectionRevision: string;
  readonly stateVersion: number;
  readonly stateRevision: string;
  readonly sourceHashes: Readonly<Record<string, string>>;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

// The audit's progress-token recipe wants "completed task markers derived
// from the plan text" (plans/sprints/20260715-harness-loop-audit-and-optimization.md:834-844).
// This repo's plans have no formal task-id scheme, so each completed
// checkbox line stands in as its own stable marker: it changes only when a
// task is actually checked off (or its recorded line changes), never when an
// open task's wording changes or projection files are rewritten.
function completedTaskMarkers(planText: string | null): string[] {
  if (!planText) return [];
  return (planText.match(/^\s*- \[[xX]\]\s+.+$/gm) ?? []).map((line) => line.trim());
}

/** Pure projection over already-read repository content and effect observations. */
export function projectEffectiveState(input: EffectiveStateInputs): EffectiveState {
  const staleSources = [...input.staleSources];
  const conflictingSources = [...input.conflictingSources];
  const allowedPaths = parseAllowedPaths(input.contractText);

  const recommendation = input.reviewText
    ? markdownHeader(input.reviewText, 'Recommendation')
    : null;
  const recordedSubject = input.reviewText
    ? markdownHeader(input.reviewText, 'Reviewed Subject SHA256')
    : null;
  const recordedTarget = input.reviewText
    ? markdownHeader(input.reviewText, 'Reviewed Target Revision')
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

  let checksStatus: string | null = null;
  let checksPlan: string | null = null;
  let checksFingerprint: string | null = null;
  let acceptanceStatus: string | null = null;
  let acceptanceDisposition: string | null = null;
  if (input.checksText) {
    try {
      const checks = JSON.parse(input.checksText) as {
        status?: unknown;
        active_plan?: unknown;
        review_subject_sha256?: unknown;
        acceptance_receipt?: { status?: unknown; disposition?: unknown };
      };
      checksStatus = typeof checks.status === 'string' ? checks.status : null;
      checksPlan = typeof checks.active_plan === 'string' ? checks.active_plan : null;
      checksFingerprint = typeof checks.review_subject_sha256 === 'string'
        ? checks.review_subject_sha256
        : null;
      acceptanceStatus = typeof checks.acceptance_receipt?.status === 'string'
        ? checks.acceptance_receipt.status
        : null;
      acceptanceDisposition = typeof checks.acceptance_receipt?.disposition === 'string'
        ? checks.acceptance_receipt.disposition
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

  const acceptanceApplicable = Boolean(input.planPath && input.contractText);
  const externalFreshness: FreshnessState = !acceptanceApplicable
    ? 'not_applicable'
    : !input.checksText
      ? 'missing'
    : checksFreshness === 'fresh' && acceptanceStatus === 'pass' &&
        (acceptanceDisposition === 'external_pass' || acceptanceDisposition === 'user_waiver')
      ? 'fresh'
      : 'stale';
  if (externalFreshness === 'stale') staleSources.push('external_acceptance');
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

  // Progress token: one deterministic content hash over exactly the audit's
  // recipe. It composes revisions and values the resolver/projector already
  // computed -- no re-hashing of source content, no projection, time, or PID
  // input -- so rendering-only churn (handoff/resume/current-snapshot) can
  // never move it, only real subject/evidence/task/blocker/scope progress can.
  const progressToken = `sha256:${createHash('sha256').update(JSON.stringify({
    subject_revision: input.subjectRevision,
    completed_task_markers: completedTaskMarkers(input.planText),
    evidence_revision: input.evidenceRevision,
    hard_blockers: blockers,
    allowed_paths: allowedPaths,
  })).digest('hex')}`;

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

  // LSC-07: additive readiness projection, computed purely from inputs this
  // projector already has -- contract presence, worktree ownership,
  // review/external/checks freshness, and the blockers just derived above.
  // `operation: 'stop'` scopes only `nextAction`'s remediation lookup (see
  // operation-readiness.ts's module docstring); allowedToEdit/allowedToStop/
  // readyToShip/requirements are always all three computed together. Null
  // only when no workflow profile resolved at all -- every other existing
  // field above keeps its untouched, byte-identical formula.
  const readiness: EvaluateReadinessResult | null = workflowProfile
    ? (() => {
        const satisfiedRequirements: ArtifactRequirementKey[] = [];
        if (input.contractText) satisfiedRequirements.push('separate_contract');
        if (input.worktreeOwnerIsCurrent) {
          satisfiedRequirements.push('isolated_contract_worktree', 'worktree_boundary');
        }
        if (reviewFreshness === 'fresh') satisfiedRequirements.push('fresh_review');
        if (externalFreshness === 'fresh') satisfiedRequirements.push('external_acceptance');
        if (checksFreshness === 'fresh') {
          satisfiedRequirements.push('fresh_checks', 'subject_bound_targeted_evidence');
        }
        if (input.reviewSubject.available) satisfiedRequirements.push('candidate_revision_precondition');
        if (
          input.planPath &&
          (input.planStatus === 'approved' || input.planStatus === 'executing') &&
          firstOpenTask(input.planText) === null
        ) {
          satisfiedRequirements.push('complete_approved_work_package');
        }
        // The handoff/resume checkpoint pair is the durable recovery state
        // Stop always (re)writes before ever consulting readiness; "missing"
        // (never written) is the only unsatisfied case here -- a "stale"
        // pair per this projector's own task-id/revision match (the bash
        // handoff writer does not populate those fields) still proves a
        // checkpoint exists on disk.
        if (handoffFreshness !== 'missing' && resumeFreshness !== 'missing') {
          satisfiedRequirements.push('durable_recovery_state');
        }
        return evaluateReadiness({
          profile: workflowProfile,
          operation: 'stop',
          requirements: {
            edit: resolveArtifactRequirement({ profile: workflowProfile, operation: 'edit' }),
            stop: resolveArtifactRequirement({ profile: workflowProfile, operation: 'stop' }),
            ship: resolveArtifactRequirement({ profile: workflowProfile, operation: 'ship' }),
          },
          evidence: { satisfiedRequirements, hardBlockers: blockers },
        });
      })()
    : null;

  return {
    protocol: 1,
    kind: 'repo-harness-effective-state',
    task_id: input.taskId,
    phase,
    state_version: input.stateVersion,
    state_revision: input.stateRevision,
    authority_revision: input.authorityRevision,
    subject_revision: input.subjectRevision,
    evidence_revision: input.evidenceRevision,
    projection_revision: input.projectionRevision,
    progress_token: progressToken,
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
    allowed_paths: allowedPaths,
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
      path: acceptanceApplicable ? input.checksPath : null,
      freshness: externalFreshness,
      status: acceptanceDisposition,
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
    readiness,
  };
}
