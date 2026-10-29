import { createHash } from 'node:crypto';
import { cleanupPlanDigestInput, cleanupSelection, decodeCleanupPlan, type CleanupPlanItem } from '../../core/operator/worktree-cleanup-plan';
import type { CleanupLossEvidence } from '../../core/operator/worktree-cleanup-observation';
import { cleanupExactWorktree, inspectWorktree, readAuthorizedCleanupState, type AuthorizedCleanupOptions } from '../state/coordination-worktree-topology';
import type { AuthorizedWorktreeCleanup } from '../state/worktree-trash';
import { cleanupLossSha256, type CleanupReconciliation } from './worktree-cleanup-plan';
import { observeCleanupLoss, type CleanupObservationTarget } from './worktree-cleanup-observation';

/** Persist with the server plan. These private fields never come from the browser. */
export interface CleanupRemovalInput {
  readonly session_id: string;
  readonly target: CleanupObservationTarget;
  readonly item: CleanupPlanItem;
  readonly loss: CleanupLossEvidence;
  readonly archive: { readonly manifest_sha256: string; readonly pr: string | null } | null;
}
export interface CleanupRemovalOptions extends AuthorizedCleanupOptions {
  /** Read actual private artifacts and exact pushed archive/PR, and verify remote preservation for excluded commits.
   * Must fail closed on stale refs, changed archives or unavailable provider evidence. This is the #1023/server adapter. */
  readonly verifyPreservation: (input: CleanupRemovalInput) => Promise<void>;
}
function identity(input: CleanupRemovalInput): AuthorizedWorktreeCleanup {
  const { session_id: session, target, item, loss, archive } = input;
  decodeCleanupPlan({ protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: session, items: [item] });
  if (createHash('sha256').update(cleanupPlanDigestInput(session, item)).digest('hex') !== item.plan_sha256
    || target.id !== item.worktree.id || target.kind !== loss.kind || !cleanupSelection(item).selectable
    || cleanupLossSha256({ worktree: item.worktree, loss }) !== item.loss_sha256 || item.loss_sha256 === null) throw new Error('cleanup removal identity changed');
  if (item.advice.recommendation === 'archive_then_delete') {
    if (!archive || !/^[a-f0-9]{64}$/u.test(archive.manifest_sha256)
      || (item.advice.archive.git === null ? archive.pr !== null : typeof archive.pr !== 'string'
        || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u.test(archive.pr))) throw new Error('cleanup archive readback missing');
  } else if (archive !== null) throw new Error('unexpected cleanup archive');
  return { key: `${session}:${target.id}:${item.plan_sha256}`, id: target.id, plan_sha256: item.plan_sha256, loss_sha256: item.loss_sha256,
    worktree: target.worktree, source_dev: loss.identity.dev, source_ino: loss.identity.ino, source_birthtime_ms: loss.identity.birthtime_ms,
    branch: loss.branch?.replace(/^refs\/heads\//u, '') ?? null, head_sha: loss.head_commit,
    archive_pr: archive?.pr ?? null, archive_manifest_sha256: archive?.manifest_sha256 ?? null };
}
export function reconcileCleanupWorktree(input: CleanupRemovalInput, deadline: number): CleanupReconciliation {
  const expected = identity(input), state = readAuthorizedCleanupState(input.target.repository, expected, deadline);
  return state === 'absent' ? { state } : { state, key: expected.key, id: expected.id, loss_sha256: expected.loss_sha256,
    plan_sha256: expected.plan_sha256, archive_pr: expected.archive_pr };
}
/** The same operation also resumes an exact pending receipt. It never renames a different source incarnation. */
export async function removeCleanupWorktree(input: CleanupRemovalInput, options: CleanupRemovalOptions): Promise<void> {
  const expected = identity(input);
  await cleanupExactWorktree(input.target.repository, expected, { ...options, verify: async () => {
    await options.verify();
    await options.verifyPreservation(input);
    const view = { ...input.item.worktree, ...inspectWorktree(input.target.repository, input.target.worktree, options.caller_cwd,
      { env: options.env, deadline: options.deadline, processes: options.processes?.(options.deadline) }) };
    if (view.judgment === 'red' || view.process_count === null || view.reasons.some(reason => ['primary', 'probe_failed', 'runtime_unknown', 'process_unknown'].includes(reason))) throw new Error('cleanup target in use or unknown');
    const loss = observeCleanupLoss(input.target, options);
    if (cleanupLossSha256({ worktree: view, loss }) !== expected.loss_sha256) throw new Error('cleanup loss changed');
  } });
}
