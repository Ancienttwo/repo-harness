import { createHash } from 'crypto';
import type {
  WorkflowProfile,
  WorkflowProfileResult,
} from '../workflow/profile';
import {
  capabilityOwnershipNextAction,
  type CapabilityOwnershipBlocker,
} from '../capabilities/ownership-blocker';
import {
  firstOpenTask,
  markdownBullet,
  markdownHeader,
  parseIsoOrLocalTimestamp,
} from './artifact-parsers';
import type {
  CapabilityOwnership,
  EffectiveState,
  FreshnessState,
  SnapshotPlanState,
} from './types';

const CEREMONY_GUIDANCE: Readonly<Record<WorkflowProfile, string>> = {
  routine: 'Implement the authorized scope; verify typecheck and affected tests once; record goal/change/verification/risk/rollback in the PR',
  high: 'Use the same verification evidence; consult a reviewer for large changes, security/permissions, or uncertainty',
};

export interface EffectiveStateInputs {
  readonly nowMs: number;
  readonly taskId: string | null;
  readonly planPath: string | null;
  readonly planStatus: SnapshotPlanState;
  readonly planText: string | null;
  readonly riskResolution: WorkflowProfileResult;
  readonly requestedWorkflowProfile: string | null;
  readonly capabilityReasons: readonly string[];
  /** Capability ownership failure: its key becomes a blocker; its cause and fix reach next_action. */
  readonly capabilityBlocker: CapabilityOwnershipBlocker | null;
  readonly capabilityOwnership: CapabilityOwnership | null;
  readonly staleSources: readonly string[];
  readonly conflictingSources: readonly string[];
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
  if (!input.riskResolution.ok) {
    blockers.push(`workflow_profile:${input.riskResolution.code.toLowerCase()}`);
  }
  if (input.capabilityBlocker) blockers.push(input.capabilityBlocker.key);

  // Progress token: one deterministic content hash over exactly the audit's
  // recipe. It composes revisions and values the resolver/projector already
  // computed -- no re-hashing of source content, no projection, time, or PID
  // input -- so rendering-only churn (handoff/resume/current-snapshot) can
  // never move it, only real subject/task/blocker progress can.
  const progressToken = `sha256:${createHash('sha256').update(JSON.stringify({
    subject_revision: input.subjectRevision,
    completed_task_markers: completedTaskMarkers(input.planText),
    hard_blockers: blockers,
  })).digest('hex')}`;

  const phase = blockers.length > 0
    ? 'blocked'
    : input.planPath ? input.planStatus : 'idle';
  const nextAction = blockers.length > 0
    ? input.capabilityBlocker ? capabilityOwnershipNextAction(input.capabilityBlocker) : 'resolve blockers'
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
    authority_revision: input.authorityRevision,
    subject_revision: input.subjectRevision,
    projection_revision: input.projectionRevision,
    progress_token: progressToken,
    authoritative_plan: input.planPath
      ? { path: input.planPath, status: input.planStatus }
      : null,
    workflow_profile: workflowProfile,
    requested_workflow_profile: input.requestedWorkflowProfile,
    risk_floor: input.riskResolution.riskFloor,
    profile_reasons: [...input.riskResolution.reasons, ...input.capabilityReasons],
    profile_signals: input.riskResolution.ok ? input.riskResolution.signals : null,
    capability_ownership: input.capabilityOwnership,
    next_action: nextAction,
    guidance: workflowProfile
      ? `${CEREMONY_GUIDANCE[workflowProfile]}. This is a state snapshot, not a session-wide restriction; re-resolve for the proposed edit and current diff when scope changes. Current edit-time requirements supersede earlier snapshot guidance.`
      : null,
    blockers,
    stale_sources: uniqueSorted(staleSources),
    conflicting_sources: uniqueSorted(conflictingSources),
    source_hashes: input.sourceHashes,
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
