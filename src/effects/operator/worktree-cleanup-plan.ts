import { createHash } from 'node:crypto';
import { canonicalize } from '../../core/evidence/canonical-json';
import { containsSecret } from '../../core/security/secret-patterns';
import { cleanupContentsDigestInput, type CleanupLossEvidence } from '../../core/operator/worktree-cleanup-observation';
import {
  cleanupPlanDigestInput, cleanupSelection, decodeAuthorizedCleanupRequest, decodeCleanupAdvice, decodeCleanupPlan,
  type AuthorizedCleanupRequest, type CleanupAdvice, type CleanupPlan, type CleanupPlanItem,
} from '../../core/operator/worktree-cleanup-plan';
import { selectionDigestInput, worktreeDigestRow } from '../../core/operator/worktree-cleanup';
import type { WorktreeView } from '../../core/operator/worktrees';

/** Server-only observation. Use observeCleanupLoss and the existing worktree classifier. */
export interface CleanupObservation {
  readonly worktree: WorktreeView;
  /** Null means incomplete evidence, including an unsupported orphan or path. */
  readonly loss: CleanupLossEvidence | null;
}
const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

/** Bind complete raw contents, directory incarnation, index and all unpublished commits. */
export function cleanupLossSha256(observed: CleanupObservation): string | null {
  return observed.loss === null ? null : sha256(canonicalize({ version: 1,
    selection: selectionDigestInput([worktreeDigestRow(observed.worktree)]),
    loss: cleanupContentsDigestInput(observed.loss),
  }));
}

/** Called only on server observations. Agent text is advice, never an authorization. */
export function createCleanupPlan(sessionId: string, inputs: readonly { observation: CleanupObservation; advice: CleanupAdvice }[]): CleanupPlan {
  const items = inputs.map(({ observation, advice }) => {
    advice = decodeCleanupAdvice(advice);
    const loss = observation.loss;
    if (loss !== null) {
      const available = new Set([...loss.files.filter(file => file.kind !== 'directory' && file.path !== '.git'), ...loss.index].map(file => file.path));
      const selected = [...(advice.archive.git?.paths ?? []), ...(advice.archive.private?.paths ?? [])];
      if (new Set(selected).size !== selected.length || selected.some(path => !available.has(path))) throw new Error('worktree_cleanup_archive_paths_invalid');
      if (loss.commits.length && advice.recommendation !== 'keep' && !advice.archive.git?.include_commits) throw new Error('worktree_cleanup_commits_need_archive');
    }
    const item: Omit<CleanupPlanItem, 'plan_sha256'> = {
      worktree: observation.worktree, advice,
      loss: loss === null ? null : {
        files: [...loss.changed_paths],
        ignored: [...loss.ignored].sort(), commits: [...loss.commits],
      },
      loss_sha256: cleanupLossSha256(observation),
    };
    return { ...item, plan_sha256: sha256(cleanupPlanDigestInput(sessionId, item)) };
  });
  return structuredClone(decodeCleanupPlan({ protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: sessionId, items }));
}

/** The digest covers the selected rows, just as the existing green cleanup route does. */
export function cleanupPlanSelectionDigest(plan: CleanupPlan, ids: readonly string[]): string {
  const selected = plan.items.filter(item => ids.includes(item.worktree.id));
  if (selected.length !== ids.length || new Set(ids).size !== ids.length) throw new Error('worktree_cleanup_selection_invalid');
  return sha256(selectionDigestInput(selected.map(item => worktreeDigestRow(item.worktree))));
}

export type CleanupStage = 'reconcile' | 'observe' | 'archive_commit' | 'archive_push' | 'archive_pr' | 'remove';
export type CleanupReason = 'in_use' | 'not_approved' | 'loss_changed' | 'plan_changed' | 'unavailable' | 'archive_failed' | 'removal_unproven';
export interface CleanupExecutionItem {
  readonly id: string;
  readonly outcome: 'removed' | 'skipped' | 'reconcile_required';
  readonly reason: CleanupReason | null;
  readonly stage: CleanupStage;
  readonly archive_pr: string | null;
}
export interface CleanupExecutionResult {
  readonly protocol: 1;
  readonly kind: 'operator_authorized_worktree_cleanup';
  readonly session_id: string;
  readonly items: readonly CleanupExecutionItem[];
}

/** A readback result, not a receipt supplied by the caller. The adapter verifies the durable receipt. */
export type CleanupReconciliation = { readonly state: 'absent' } | {
  readonly state: 'pending' | 'completed';
  readonly key: string;
  readonly id: string;
  readonly loss_sha256: string;
  readonly plan_sha256: string;
  readonly archive_pr: string | null;
};

const isArchivePr = (value: unknown): value is string => typeof value === 'string' && !containsSecret(value)
  && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/u.test(value);

function reconciliation(value: unknown, key: string, item: CleanupPlanItem): CleanupReconciliation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cleanup reconciliation invalid');
  const record = value as Record<string, unknown>;
  const fields = Object.keys(record).sort().join(',');
  if (record.state === 'absent' && fields === 'state') return { state: 'absent' };
  if (fields !== 'archive_pr,id,key,loss_sha256,plan_sha256,state' || !['pending', 'completed'].includes(record.state as string)
    || record.key !== key || record.id !== item.worktree.id || record.loss_sha256 !== item.loss_sha256 || record.plan_sha256 !== item.plan_sha256
    || (item.advice.archive.git === null ? record.archive_pr !== null : !isArchivePr(record.archive_pr))) throw new Error('cleanup reconciliation identity invalid');
  return value as CleanupReconciliation;
}

/**
 * Integration ports, not browser inputs. No production actuator is installed by this module.
 * The host owns loadPlan and observe. #1023 owns archive publication. The deletion
 * adapter must call verify at the exact cleanup topology barrier, before the first
 * mutation, and use the existing trash receipts for readback/recovery. Each archive
 * method must reconcile the stable key before retrying an uncertain provider write.
 */
export interface CleanupExecutionPorts {
  readonly loadPlan: (sessionId: string) => Promise<CleanupPlan>;
  readonly observe: (id: string) => Promise<CleanupObservation>;
  /** Read only, before live observation. absent means no durable intent exists. pending never means success.
   * completed requires the exact key/plan/loss-bound receipt plus registration and local-branch removal
   * readback. A missing source alone is not proof. Do not synthesize an old observation on retry. */
  readonly reconcile: (key: string, item: CleanupPlanItem) => Promise<CleanupReconciliation>;
  /** Stage private files (0600), SOURCE.md, all selected worktree/index versions and format-patches, then commit.
   * Re-observe and verify the bound loss while capturing bytes; never publish credential files to Git. */
  readonly archiveCommit: (key: string, item: CleanupPlanItem) => Promise<void>;
  /** Return only after the pushed archive commit is read back from the remote. */
  readonly archivePush: (key: string, item: CleanupPlanItem) => Promise<void>;
  /** Return only after the exact Draft PR is read back. Not called for private-only archives. */
  readonly archivePr: (key: string, item: CleanupPlanItem) => Promise<string | null>;
  /** verify must run within the topology lock; the adapter returns only after removal readback. */
  readonly remove: (key: string, item: CleanupPlanItem, verify: () => Promise<void>) => Promise<void>;
}

class CleanupRefusal extends Error {
  constructor(readonly reason: CleanupReason) { super(reason); }
}
function refuse(reason: CleanupReason): never { throw new CleanupRefusal(reason); }
const unsafeObservation = (view: WorktreeView) => view.repository_id === null || view.process_count === null || view.reasons.some(reason =>
  ['primary', 'process_unknown', 'runtime_unknown', 'probe_failed'].includes(reason));

function approved(request: AuthorizedCleanupRequest, item: CleanupPlanItem): void {
  if (item.worktree.judgment === 'red' || item.worktree.process_count! > 0) refuse('in_use');
  if (unsafeObservation(item.worktree) || item.loss_sha256 === null) refuse('unavailable');
  if (!cleanupSelection(item).selectable) refuse('not_approved');
  if (item.worktree.judgment === 'yellow') {
    const approval = request.approvals.find(row => row.id === item.worktree.id);
    if (!approval) refuse('not_approved');
    if (approval.plan_sha256 !== item.plan_sha256) refuse('plan_changed');
    if (approval.loss_sha256 !== item.loss_sha256) refuse('loss_changed');
  }
}

async function executeItem(request: AuthorizedCleanupRequest, item: CleanupPlanItem, ports: CleanupExecutionPorts): Promise<CleanupExecutionItem> {
  let stage: CleanupStage = 'observe', archivePr: string | null = null;
  const key = `${request.session_id}:${item.worktree.id}:${item.plan_sha256}`;
  const result = (outcome: CleanupExecutionItem['outcome'], reason: CleanupReason | null): CleanupExecutionItem =>
    ({ id: item.worktree.id, outcome, reason, stage, archive_pr: archivePr });
  const verify = async () => {
    const fresh = await ports.observe(item.worktree.id);
    if (fresh.worktree.judgment === 'red' || (fresh.worktree.process_count ?? 0) > 0) refuse('in_use');
    if (unsafeObservation(fresh.worktree)) refuse('unavailable');
    if (fresh.worktree.id !== item.worktree.id || cleanupLossSha256(fresh) !== item.loss_sha256) refuse('loss_changed');
  };
  try {
    approved(request, item);
    stage = 'reconcile';
    const prior = reconciliation(await ports.reconcile(key, structuredClone(item)), key, item);
    if (prior.state !== 'absent') {
      archivePr = prior.archive_pr;
      return prior.state === 'completed' ? result('removed', null) : result('reconcile_required', 'removal_unproven');
    }
    stage = 'observe';
    await verify();
    if (item.advice.recommendation === 'archive_then_delete') {
      // Hashes bind the plan and loss. Publication adapters use the same key on retry.
      stage = 'archive_commit'; await ports.archiveCommit(key, structuredClone(item));
      if (item.advice.archive.git !== null) {
        stage = 'archive_push'; await ports.archivePush(key, structuredClone(item));
        stage = 'archive_pr';
        const published = await ports.archivePr(key, structuredClone(item));
        if (!isArchivePr(published)) {
          throw new Error('archive PR readback missing');
        }
        archivePr = published;
      }
    }
    stage = 'remove';
    // An archive can take minutes. Recheck inside the deletion adapter's topology barrier.
    let checked = false;
    await ports.remove(key, structuredClone(item), async () => { await verify(); checked = true; });
    if (!checked) throw new Error('removal barrier did not verify');
    return result('removed', null);
  } catch (error) {
    if (error instanceof CleanupRefusal) return result('skipped', error.reason);
    if (stage === 'observe') return result('skipped', 'unavailable');
    // A thrown provider write or removal may already have taken effect. Do not auto-retry it.
    return result('reconcile_required', stage === 'remove' || stage === 'reconcile' ? 'removal_unproven' : 'archive_failed');
  }
}

/** Shared effect entry; the write channel supplies serialization, audit and request-id replay. */
export async function executeCleanupPlan(input: unknown, ports: CleanupExecutionPorts): Promise<CleanupExecutionResult> {
  const request = decodeAuthorizedCleanupRequest(input);
  const plan = structuredClone(decodeCleanupPlan(await ports.loadPlan(request.session_id)));
  if (plan.session_id !== request.session_id) throw new Error('worktree_cleanup_session_changed');
  // A persisted plan fingerprint is checked again; a hash is freshness, not authority.
  for (const item of plan.items) {
    if (sha256(cleanupPlanDigestInput(plan.session_id, item)) !== item.plan_sha256) throw new Error('worktree_cleanup_plan_changed');
  }
  if (cleanupPlanSelectionDigest(plan, request.ids) !== request.expected_digest) throw new Error('worktree_cleanup_digest_changed');
  const items: CleanupExecutionItem[] = [];
  for (const id of request.ids) items.push(await executeItem(request, plan.items.find(item => item.worktree.id === id)!, ports));
  return { protocol: 1, kind: 'operator_authorized_worktree_cleanup', session_id: request.session_id, items };
}
