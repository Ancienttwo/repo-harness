import { canonicalize } from '../evidence/canonical-json';
import type { JsonValue } from '../evidence/types';
import { isRepositoryRelativePath } from './doc-session-events';
import { containsSecret } from '../security/secret-patterns';
import { decodeWorktreeCleanupRequest, WORKTREE_CLEANUP_MAX_IDS, type WorktreeCleanupRequest } from './worktree-cleanup';
import { decodeWorktrees, isPublicWorktreeDirectory, isPublicWorktreeText, type WorktreeView } from './worktrees';

/** G25 contract. The server owns plans; the client sends only ids and fingerprints. */
export interface CleanupArchivePlan {
  readonly git: { readonly directory: string; readonly branch: string; readonly paths: readonly string[]; readonly include_commits: boolean } | null;
  /** Only a directory name crosses the public boundary, never its host path. */
  readonly private: { readonly directory: string; readonly paths: readonly string[] } | null;
}
export interface CleanupAdvice {
  readonly recommendation: 'delete' | 'archive_then_delete' | 'keep';
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly archive: CleanupArchivePlan;
}
export interface CleanupLossSummary {
  readonly files: readonly string[];
  readonly ignored: readonly string[];
  readonly commits: readonly string[];
}
export interface CleanupPlanItem {
  readonly worktree: WorktreeView;
  readonly advice: CleanupAdvice;
  readonly loss: CleanupLossSummary | null;
  readonly loss_sha256: string | null;
  readonly plan_sha256: string;
}
export interface CleanupPlan {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_plan';
  readonly session_id: string;
  readonly items: readonly CleanupPlanItem[];
}
export interface CleanupApproval { readonly id: string; readonly loss_sha256: string; readonly plan_sha256: string }
export interface AuthorizedCleanupRequest extends WorktreeCleanupRequest {
  readonly session_id: string;
  readonly approvals: readonly CleanupApproval[];
}
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const session = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value);
function fail(): never { throw new Error('worktree_cleanup_plan_invalid'); }
function exact(value: unknown, keys: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys) return fail();
  return value as Record<string, unknown>;
}
const publicText = (value: unknown) => isPublicWorktreeText(value) && !containsSecret(value);
function paths(value: unknown, directory = false): void {
  if (!Array.isArray(value) || value.length > 1000 || new Set(value).size !== value.length
    || !value.every(path => typeof path === 'string' && isRepositoryRelativePath(directory && path.endsWith('/') ? path.slice(0, -1) : path) && !containsSecret(path))) fail();
}
export function decodeCleanupAdvice(value: unknown): CleanupAdvice {
  const advice = exact(value, 'archive,evidence,reason,recommendation');
  if (!['delete', 'archive_then_delete', 'keep'].includes(advice.recommendation as string) || !publicText(advice.reason)
    || !Array.isArray(advice.evidence) || advice.evidence.length === 0 || advice.evidence.length > 32 || !advice.evidence.every(publicText)) fail();
  const archive = exact(advice.archive, 'git,private');
  if (archive.git !== null) {
    const git = exact(archive.git, 'branch,directory,include_commits,paths');
    if (typeof git.directory !== 'string' || !/^docs\/archive\/[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9][a-z0-9-]{0,79}$/u.test(git.directory)
      || typeof git.branch !== 'string' || !/^docs\/archive-[a-z0-9][a-z0-9-]{0,79}$/u.test(git.branch) || typeof git.include_commits !== 'boolean') fail();
    paths(git.paths);
  }
  if (archive.private !== null) {
    const local = exact(archive.private, 'directory,paths');
    if (!isPublicWorktreeDirectory(local.directory) || !publicText(local.directory)) fail();
    paths(local.paths);
  }
  const hasArchive = archive.git !== null || archive.private !== null;
  if ((advice.recommendation === 'archive_then_delete') !== hasArchive) fail();
  return value as CleanupAdvice;
}

export function decodeCleanupPlan(value: unknown): CleanupPlan {
  const plan = exact(value, 'items,kind,protocol,session_id');
  if (plan.protocol !== 1 || plan.kind !== 'operator_worktree_cleanup_plan' || !session(plan.session_id)
    || !Array.isArray(plan.items) || plan.items.length === 0 || plan.items.length > WORKTREE_CLEANUP_MAX_IDS) fail();
  const ids = new Set<string>();
  for (const raw of plan.items as unknown[]) {
    const item = exact(raw, 'advice,loss,loss_sha256,plan_sha256,worktree');
    const row = item.worktree as WorktreeView;
    // Reuse the public worktree decoder rather than weakening its invariants.
    decodeWorktrees({ version: 1, status: 'ready', collected_at: null,
      repositories: row?.repository_id === null ? [] : [{ repository_id: row?.repository_id, display_name: 'Repository', status: 'ready', worktrees: [row] }],
      unassigned: row?.repository_id === null ? [row] : [] });
    if (ids.has(row.id) || !digest(item.plan_sha256) || !(item.loss_sha256 === null || digest(item.loss_sha256))) fail();
    ids.add(row.id);
    decodeCleanupAdvice(item.advice);
    if ((item.loss === null) !== (item.loss_sha256 === null)) fail();
    if (item.loss !== null) {
      const loss = exact(item.loss, 'commits,files,ignored');
      paths(loss.files); paths(loss.ignored, true);
      if (!Array.isArray(loss.commits) || loss.commits.length > 1000 || new Set(loss.commits).size !== loss.commits.length
        || !loss.commits.every(oid => typeof oid === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(oid))) fail();
    }
  }
  return value as CleanupPlan;
}

/** Closed request after the shared write channel removes request_id. No paths or advice are accepted. */
export function decodeAuthorizedCleanupRequest(value: unknown): AuthorizedCleanupRequest {
  const request = exact(value, 'approvals,expected_digest,ids,session_id');
  const selection = decodeWorktreeCleanupRequest({ ids: request.ids, expected_digest: request.expected_digest });
  if (!session(request.session_id) || !Array.isArray(request.approvals) || request.approvals.length > selection.ids.length) fail();
  const ids = new Set<string>();
  for (const raw of request.approvals as unknown[]) {
    const approval = exact(raw, 'id,loss_sha256,plan_sha256');
    if (typeof approval.id !== 'string' || !selection.ids.includes(approval.id) || ids.has(approval.id)
      || !digest(approval.loss_sha256) || !digest(approval.plan_sha256)) fail();
    ids.add(approval.id);
  }
  return { ...selection, session_id: request.session_id as string, approvals: [...request.approvals as CleanupApproval[]].sort((a, b) => a.id.localeCompare(b.id)) };
}

/** Browser selection policy; lack of an observation never becomes permission. */
export function cleanupSelection(item: CleanupPlanItem): { selectable: boolean; selected_by_default: boolean } {
  const selectable = item.worktree.judgment !== 'red' && item.worktree.repository_id !== null && item.worktree.process_count === 0 && item.loss !== null && item.advice.recommendation !== 'keep'
    && !item.worktree.reasons.some(reason => ['primary', 'process_unknown', 'runtime_unknown', 'probe_failed'].includes(reason));
  return { selectable, selected_by_default: selectable && item.worktree.judgment === 'green' };
}

export function cleanupPlanDigestInput(sessionId: string, item: Omit<CleanupPlanItem, 'plan_sha256'>): string {
  // Sizes and collection times change without changing the authorization.
  const { id, repository_id, directory, branch, judgment, reasons } = item.worktree;
  return canonicalize({ version: 1, session_id: sessionId, worktree: { id, repository_id, directory, branch, judgment, reasons },
    advice: item.advice as unknown as JsonValue, loss: item.loss as unknown as JsonValue, loss_sha256: item.loss_sha256 });
}
