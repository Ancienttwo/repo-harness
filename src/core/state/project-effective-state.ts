import { createHash } from 'crypto';
import type {
  WorkflowProfile,
  WorkflowProfileResult,
} from '../workflow/profile';
import {
  capabilityOwnershipNextAction,
  type CapabilityOwnershipBlocker,
} from '../capabilities/ownership-blocker';
import type {
  CapabilityOwnership,
  EffectiveState,
} from './types';

const CEREMONY_GUIDANCE: Readonly<Record<WorkflowProfile, string>> = {
  routine: 'Implement the authorized scope; verify typecheck and affected tests once; record goal/change/verification/risk/rollback in the PR',
  high: 'Use the same verification evidence; consult a reviewer for large changes, security/permissions, or uncertainty',
};

export interface EffectiveStateInputs {
  readonly nowMs: number;
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
  /** The branch's GitHub issue as the next unit; Git state only, never a local handoff file. */
  readonly branchNextAction: string | null;
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

/** Pure projection over already-read repository content and effect observations. */
export function projectEffectiveState(input: EffectiveStateInputs): EffectiveState {
  const staleSources = [...input.staleSources];
  const conflictingSources = [...input.conflictingSources];
  const workflowProfile = input.riskResolution.ok ? input.riskResolution.profile : null;

  const blockers = conflictingSources.map((source) => `conflict:${source}`);
  if (!input.riskResolution.ok) {
    blockers.push(`workflow_profile:${input.riskResolution.code.toLowerCase()}`);
  }
  if (input.capabilityBlocker) blockers.push(input.capabilityBlocker.key);

  // Progress token: one deterministic content hash over exactly the audit's
  // recipe. It composes revisions and values the resolver/projector already
  // computed -- no re-hashing of source content, no projection, time, or PID
  // input -- so projection-only churn can never move it, only real subject or
  // blocker progress can.
  const progressToken = `sha256:${createHash('sha256').update(JSON.stringify({
    subject_revision: input.subjectRevision,
    hard_blockers: blockers,
  })).digest('hex')}`;

  const phase = blockers.length > 0 ? 'blocked' : 'idle';
  const nextAction = blockers.length > 0
    ? input.capabilityBlocker ? capabilityOwnershipNextAction(input.capabilityBlocker) : 'resolve blockers'
    : input.branchNextAction;

  return {
    protocol: 2,
    kind: 'repo-harness-effective-state',
    task_id: null,
    phase,
    state_version: input.stateVersion,
    state_revision: input.stateRevision,
    authority_revision: input.authorityRevision,
    subject_revision: input.subjectRevision,
    projection_revision: input.projectionRevision,
    progress_token: progressToken,
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
  };
}
