import { useMemo, useState } from 'react';
import { DOC_SESSION_POLL_MS } from '../core/operator/doc-session-events';
import { WORKTREE_CLEANUP_MAX_IDS } from '../core/operator/worktree-cleanup';
import {
  decodeOperatorCleanupPlan,
  decodeOperatorCleanupSessionCreated,
  decodeOperatorCleanupSessionResult,
  type CleanupApprovalV1,
  type CleanupSessionRequestV1,
  type OperatorCleanupPlanV1,
  type OperatorCleanupSessionCreatedV1,
  type OperatorCleanupSessionResultV1,
} from '../core/operator/worktree-cleanup-plan';
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
 * Browser side of the worktree cleanup session (5.2): its plan read, its
 * creation, and the approved cleanup. The browser sends stable ids and the
 * digests the plan gave it; the server re-checks each item before it archives
 * or deletes anything.
 */
export type CleanupPlanReader = (sessionId: string, signal: AbortSignal) => Promise<DocSessionRead<OperatorCleanupPlanV1>>;

export function fetchCleanupPlan(sessionId: string, signal: AbortSignal): Promise<DocSessionRead<OperatorCleanupPlanV1>> {
  return readSession(sessionPath(sessionId, '/plan'), value => decodeOperatorCleanupPlan(value, sessionId), signal);
}

export interface CleanupSessionCreateRequest { readonly kind: 'worktree_cleanup'; readonly runtime: string }
export type CleanupSessionCreateWriter = (body: CleanupSessionCreateRequest & RequestId) => Promise<DocSessionWrite<OperatorCleanupSessionCreatedV1>>;

export function postCleanupSessionCreate(body: CleanupSessionCreateRequest & RequestId): Promise<DocSessionWrite<OperatorCleanupSessionCreatedV1>> {
  return postSession('/api/v1/sessions', body, decodeOperatorCleanupSessionCreated);
}

export type CleanupSessionWriter = (body: CleanupSessionRequestV1 & RequestId) => Promise<DocSessionWrite<OperatorCleanupSessionResultV1>>;

export function postCleanupSession(body: CleanupSessionRequestV1 & RequestId): Promise<DocSessionWrite<OperatorCleanupSessionResultV1>> {
  return postSession('/api/v1/worktrees/cleanup', body, value => decodeOperatorCleanupSessionResult(value, body.session_id));
}

/**
 * The request for the checked plan items. Green ids carry no approval; a
 * yellow id carries the loss and plan digests the user saw; a red id has no
 * delete entry and is refused here. The live collector row must exist and
 * carry the judgment the plan gave; a row that turned red or changed otherwise
 * is refused, so the plan never overrides the collector. `expected_digest`
 * binds the current collector rows of the same ids, as the green cleanup does.
 */
export async function cleanupSessionRequest(plan: OperatorCleanupPlanV1, ids: readonly string[], snapshot: WorktreesSnapshot): Promise<CleanupSessionRequestV1> {
  const planSha = plan.plan_sha256;
  if (planSha === null) throw new Error('cleanup plan not handed in');
  const selected = [...new Set(ids)].sort();
  if (selected.length === 0 || selected.length > WORKTREE_CLEANUP_MAX_IDS) throw new Error('cleanup selection size');
  const items = new Map(plan.items.map(item => [item.id, item]));
  const rows = new Map(allWorktrees(snapshot).map(row => [row.id, row]));
  const approvals: CleanupApprovalV1[] = [];
  for (const id of selected) {
    const item = items.get(id);
    if (item === undefined) throw new Error(`cleanup item ${id} is not in the plan`);
    if (item.judgment === 'red') throw new Error(`cleanup item ${id} is red`);
    const row = rows.get(id);
    if (row === undefined) throw new Error(`cleanup item ${id} is not in the worktree list`);
    if (row.judgment === 'red' || row.judgment !== item.judgment) throw new Error(`cleanup item ${id} is ${row.judgment} in the worktree list, not ${item.judgment}`);
    if (item.judgment === 'yellow') approvals.push({ id, loss_sha256: item.loss_sha256, plan_sha256: planSha });
  }
  return { session_id: plan.session_id, ids: selected, expected_digest: await selectionDigest(selected.map(id => rows.get(id)!)), approvals };
}

/** A failed refresh keeps the last plan and says so. */
export type CleanupPlanView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reason: DocSessionReadReason }
  | { readonly kind: 'ready'; readonly plan: OperatorCleanupPlanV1; readonly refreshFailed: boolean };

/** Polled each 1 s while the agent or the cleanup works, each 30 s otherwise. */
export function cleanupPlanDelay(plan: OperatorCleanupPlanV1): number {
  const working = plan.agent === 'starting' || plan.agent === 'running' || plan.state === 'investigating' || plan.state === 'executing';
  return working ? DOC_SESSION_POLL_MS.running : DOC_SESSION_POLL_MS.idle;
}

export function cleanupPlanStep(read: CleanupPlanReader, sessionId: string, publish: (change: (view: CleanupPlanView) => CleanupPlanView) => void): PollStep {
  return async (signal) => {
    const result = await read(sessionId, signal);
    if (signal.aborted) return 0;
    if (result.state === 'ok') {
      publish(() => ({ kind: 'ready', plan: result.value, refreshFailed: false }));
      return cleanupPlanDelay(result.value);
    }
    publish(view => view.kind === 'ready' ? { ...view, refreshFailed: true } : { kind: 'unavailable', reason: result.reason });
    return DOC_SESSION_POLL_MS.idle;
  };
}

/** `reload` reads at once, for example after the approved cleanup answered. */
export function useCleanupPlan(read: CleanupPlanReader, sessionId: string | null, generation: number): { readonly view: CleanupPlanView; readonly reload: () => void } {
  const [state, setState] = useState<{ readonly id: string; readonly view: CleanupPlanView } | null>(null);
  const step = useMemo(() => sessionId === null ? null : cleanupPlanStep(read, sessionId, change => setState(current => ({
    id: sessionId, view: change(current !== null && current.id === sessionId ? current.view : { kind: 'loading' }),
  }))), [read, sessionId, generation]); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = usePoll(step);
  return { view: state !== null && state.id === sessionId ? state.view : { kind: 'loading' }, reload };
}
