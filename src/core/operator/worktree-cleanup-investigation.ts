import type { CleanupLossEvidence } from './worktree-cleanup-observation';
import { decodeCleanupAdvice, decodeCleanupPlan, type CleanupAdvice, type CleanupPlan } from './worktree-cleanup-plan';

/**
 * Agent investigation of one cleanup plan session (#1721, owner decision M69).
 * The server gives the agent its own observation as a manifest. The agent's
 * answer is advice for a new plan version; it never authorizes an item.
 */

/** Most plan items in one investigation. A larger plan is refused; the user splits it. */
export const WORKTREE_CLEANUP_INVESTIGATION_MAX_ITEMS = 8;
export const CLEANUP_INVESTIGATION_MANIFEST = 'manifest.json';

export const CLEANUP_INVESTIGATION_FAILURES = ['advice_invalid', 'plan_changed', 'isolation_unproven', 'host_failed', 'timeout', 'interrupted'] as const;
export type CleanupInvestigationFailure = typeof CLEANUP_INVESTIGATION_FAILURES[number];

export interface CleanupInvestigationJob {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_investigation';
  readonly session_id: string;
  readonly job_id: string;
  readonly state: 'running' | 'succeeded' | 'failed';
  readonly started_at: string;
  readonly deadline_at: string;
  readonly failure: CleanupInvestigationFailure | null;
}
/** The status route body. `plan` is the session plan after a job that succeeded, otherwise null. */
export interface CleanupInvestigationStatus extends CleanupInvestigationJob { readonly plan: CleanupPlan | null }

export interface CleanupInvestigationManifestItem {
  readonly id: string;
  readonly worktree: CleanupPlan['items'][number]['worktree'];
  readonly loss: CleanupPlan['items'][number]['loss'];
  /** The server's private loss observation. Null means that the server could not observe the loss. */
  readonly evidence: CleanupLossEvidence | null;
}
export interface CleanupInvestigationManifest {
  readonly protocol: 1;
  readonly kind: 'operator_worktree_cleanup_investigation_manifest';
  readonly session_id: string;
  readonly items: readonly CleanupInvestigationManifestItem[];
}

const SESSION = /^[a-f0-9]{32}$/u;
function fail(): never { throw new Error('worktree_cleanup_investigation_invalid'); }
function exact(value: unknown, keys: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys) return fail();
  return value as Record<string, unknown>;
}
const isoTime = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;

export function decodeCleanupInvestigationJob(value: unknown): CleanupInvestigationJob {
  const job = exact(value, 'deadline_at,failure,job_id,kind,protocol,session_id,started_at,state');
  if (job.protocol !== 1 || job.kind !== 'operator_worktree_cleanup_investigation' || typeof job.session_id !== 'string' || !SESSION.test(job.session_id)
    || typeof job.job_id !== 'string' || !SESSION.test(job.job_id) || !isoTime(job.started_at) || !isoTime(job.deadline_at)
    || !['running', 'succeeded', 'failed'].includes(job.state as string)
    || (job.state === 'failed' ? !CLEANUP_INVESTIGATION_FAILURES.includes(job.failure as CleanupInvestigationFailure) : job.failure !== null)) fail();
  return value as CleanupInvestigationJob;
}

export function decodeCleanupInvestigationStatus(value: unknown): CleanupInvestigationStatus {
  const { plan, ...job } = exact(value, 'deadline_at,failure,job_id,kind,plan,protocol,session_id,started_at,state');
  const decoded = decodeCleanupInvestigationJob(job);
  if ((decoded.state === 'succeeded') !== (plan !== null) || (plan !== null && decodeCleanupPlan(plan).session_id !== decoded.session_id)) fail();
  return value as CleanupInvestigationStatus;
}

export function cleanupInvestigationManifest(plan: CleanupPlan, evidence: (id: string) => CleanupLossEvidence | null): CleanupInvestigationManifest {
  return { protocol: 1, kind: 'operator_worktree_cleanup_investigation_manifest', session_id: plan.session_id,
    items: plan.items.map(item => ({ id: item.worktree.id, worktree: item.worktree, loss: item.loss, evidence: evidence(item.worktree.id) })) };
}

/** The request text after the host's TASK REQUEST line. The archive rules repeat the plan validator, so a careful answer passes it. */
export function cleanupInvestigationInstructions(): string {
  return [
    'You advise the user on the cleanup of local Git worktrees. You do not clean anything.',
    `Read ${CLEANUP_INVESTIGATION_MANIFEST} in your working directory. It is the server observation of each worktree in the plan.`,
    'You cannot read the worktrees or their Git directories. Judge from the manifest only.',
    'For each manifest item, choose keep, delete or archive_then_delete. Give a reason and 1 to 32 evidence lines taken from the manifest.',
    'Your advice authorizes nothing. The user reads it, then chooses and approves each item.',
    'When the manifest does not prove that nothing of value is lost, choose keep.',
    'Rules:',
    '- An item with loss null: keep.',
    '- An item with commits in loss.commits cannot be delete. Use keep, or archive_then_delete with archive.git.include_commits true.',
    '- delete and keep have archive {"git": null, "private": null}. archive_then_delete has at least one of git or private.',
    '- Archive paths come only from loss.archivable, each path at most once in the item.',
    '- A path in loss.private_only goes only to archive.private. A path in loss.no_destination goes nowhere.',
    '- archive.git is {"directory": "docs/archive/YYYY-MM-DD-<slug>", "branch": "docs/archive-<slug>", "paths": [...], "include_commits": <boolean>}; <slug> is lower-case letters, digits and hyphens.',
    '- archive.private is {"directory": <the item worktree.repository_id>, "paths": [...]}.',
    '- Do not copy secret values into reason or evidence.',
    'Write the JSON below once to the result_ref of the TASK REQUEST, with its request_id and context_sha256, and one entry for each manifest item:',
    '{"request_id": "...", "context_sha256": "...", "value": {"items": [{"id": "<item id>", "advice": {"recommendation": "keep", "reason": "...", "evidence": ["..."], "archive": {"git": null, "private": null}}}]}}',
  ].join('\n');
}

/**
 * The agent's result file. It must answer this request, name each plan item
 * once and carry advice that the closed advice decoder accepts.
 * `createCleanupPlan` then checks each advice against the server observation.
 */
export function decodeCleanupInvestigationResult(value: unknown, request: { readonly request_id: string; readonly context_sha256: string },
  ids: readonly string[]): ReadonlyMap<string, CleanupAdvice> {
  const result = exact(value, 'context_sha256,request_id,value');
  if (result.request_id !== request.request_id || result.context_sha256 !== request.context_sha256) fail();
  const items = exact(result.value, 'items').items;
  if (!Array.isArray(items) || items.length !== ids.length) fail();
  const advice = new Map<string, CleanupAdvice>();
  for (const raw of items as unknown[]) {
    const item = exact(raw, 'advice,id');
    if (typeof item.id !== 'string' || !ids.includes(item.id) || advice.has(item.id)) fail();
    advice.set(item.id, decodeCleanupAdvice(item.advice));
  }
  return advice;
}
