import { useMemo, useState } from 'react';
import {
  decodeCleanupPlanPreview,
  decodeOperatorCleanupSessionCreated,
  type CleanupPlanPreview,
  type CleanupSessionCreateV1,
  type OperatorCleanupSessionCreatedV1,
} from '../core/operator/doc-session-api';
import { DOC_SESSION_POLL_MS } from '../core/operator/doc-session-events';
import { WORKTREE_CLEANUP_MAX_IDS } from '../core/operator/worktree-cleanup';
import type { AuthorizedCleanupRequest, CleanupApproval, CleanupPlan } from '../core/operator/worktree-cleanup-plan';
import type { WorktreesSnapshot } from '../core/operator/worktrees';
import {
  postSession,
  readSession,
  sessionPath,
  usePoll,
  type DocSessionRead,
  type DocSessionReadReason,
  type DocSessionWrite,
  type PollStep,
  type RequestId,
} from './doc-sessions';
import { allWorktrees, selectionDigest } from './worktrees';

/**
 * Browser side of the worktree cleanup session (5.2): its creation and its
 * plan read. The server shows the plan and declares whether it can run a
 * cleanup from it; the approval request below is what the page sends once it can.
 */
export type CleanupPlanReader = (sessionId: string, signal: AbortSignal) => Promise<DocSessionRead<CleanupPlanPreview>>;

export function fetchCleanupPlan(sessionId: string, signal: AbortSignal): Promise<DocSessionRead<CleanupPlanPreview>> {
  return readSession(sessionPath(sessionId, '/plan'), value => decodeCleanupPlanPreview(value, { session_id: sessionId }), signal);
}

export type CleanupSessionCreateWriter = (body: CleanupSessionCreateV1 & RequestId) => Promise<DocSessionWrite<OperatorCleanupSessionCreatedV1>>;

export function postCleanupSessionCreate(body: CleanupSessionCreateV1 & RequestId): Promise<DocSessionWrite<OperatorCleanupSessionCreatedV1>> {
  return postSession('/api/v1/sessions', body, decodeOperatorCleanupSessionCreated);
}

/**
 * The approval request for the checked plan items. Green ids carry no
 * approval; a yellow id carries the loss and plan digests of its item; a red id
 * is refused here. The live collector row of each id must exist and carry the
 * judgment the plan gave it, so the plan never overrides the collector.
 * `expected_digest` is the selection digest of the plan rows, which the server
 * checks against the plan it saved.
 */
export async function cleanupSessionRequest(plan: CleanupPlan, ids: readonly string[], snapshot: WorktreesSnapshot): Promise<AuthorizedCleanupRequest> {
  const selected = [...new Set(ids)].sort();
  if (selected.length === 0 || selected.length > WORKTREE_CLEANUP_MAX_IDS) throw new Error('cleanup selection size');
  const items = new Map(plan.items.map(item => [item.worktree.id, item]));
  const rows = new Map(allWorktrees(snapshot).map(row => [row.id, row]));
  const approvals: CleanupApproval[] = [];
  for (const id of selected) {
    const item = items.get(id);
    if (item === undefined) throw new Error(`cleanup item ${id} is not in the plan`);
    const judgment = item.worktree.judgment;
    if (judgment === 'red') throw new Error(`cleanup item ${id} is red`);
    const row = rows.get(id);
    if (row === undefined) throw new Error(`cleanup item ${id} is not in the worktree list`);
    if (row.judgment === 'red' || row.judgment !== judgment) throw new Error(`cleanup item ${id} is ${row.judgment} in the worktree list, not ${judgment}`);
    if (judgment === 'yellow') {
      if (item.loss_sha256 === null) throw new Error(`cleanup item ${id} has no observed loss`);
      approvals.push({ id, loss_sha256: item.loss_sha256, plan_sha256: item.plan_sha256 });
    }
  }
  return {
    session_id: plan.session_id, ids: selected, approvals,
    expected_digest: await selectionDigest(selected.map(id => items.get(id)!.worktree)),
  };
}

/** A failed refresh keeps the last preview and says so. */
export type CleanupPlanView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reason: DocSessionReadReason }
  | { readonly kind: 'ready'; readonly preview: CleanupPlanPreview; readonly refreshFailed: boolean };

/** Polled each 1 s while the agent investigates, each 30 s otherwise. */
export function cleanupPlanDelay(preview: CleanupPlanPreview): number {
  const working = preview.agent === 'starting' || preview.agent === 'running' || preview.state === 'investigating';
  return working ? DOC_SESSION_POLL_MS.running : DOC_SESSION_POLL_MS.idle;
}

export function cleanupPlanStep(read: CleanupPlanReader, sessionId: string, publish: (change: (view: CleanupPlanView) => CleanupPlanView) => void): PollStep {
  return async (signal) => {
    const result = await read(sessionId, signal);
    if (signal.aborted) return 0;
    if (result.state === 'ok') {
      publish(() => ({ kind: 'ready', preview: result.value, refreshFailed: false }));
      return cleanupPlanDelay(result.value);
    }
    publish(view => view.kind === 'ready' ? { ...view, refreshFailed: true } : { kind: 'unavailable', reason: result.reason });
    return DOC_SESSION_POLL_MS.idle;
  };
}

export function useCleanupPlan(read: CleanupPlanReader, sessionId: string | null, generation: number): CleanupPlanView {
  const [state, setState] = useState<{ readonly id: string; readonly view: CleanupPlanView } | null>(null);
  const step = useMemo(() => sessionId === null ? null : cleanupPlanStep(read, sessionId, change => setState(current => ({
    id: sessionId, view: change(current !== null && current.id === sessionId ? current.view : { kind: 'loading' }),
  }))), [read, sessionId, generation]); // eslint-disable-line react-hooks/exhaustive-deps
  usePoll(step);
  return state !== null && state.id === sessionId ? state.view : { kind: 'loading' };
}
