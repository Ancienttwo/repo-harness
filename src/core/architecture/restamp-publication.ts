/**
 * Pure classifier and gate for digest-only projection-manifest restamps.
 *
 * Classification authority is archctx's own `ProjectionResultV1`: a restamp is
 * a projection whose entire applied ChangeSet is one `update` to the manifest
 * with no human actions. A semantic delta necessarily lists its rendered
 * documents too, so it can never reach the publishable branch. Nothing here
 * re-derives that judgement from manifest bytes -- the provider result is the
 * single source of truth and anything else fails closed to today's behavior.
 *
 * The git-side gate takes pre-collected facts so the decision matrix stays
 * testable without a repository; `src/effects/architecture/restamp-publication.ts`
 * owns fact collection and the commit synthesis.
 */
import type { ProjectionResultV1 } from './projection';

export const ARCHITECTURE_PROJECTION_MANIFEST_PATH = 'docs/architecture/.projection-manifest.json';
export const RESTAMP_COMMIT_SUBJECT = 'chore(architecture): restamp projection manifest provenance';
export const RESTAMP_COMMIT_TRAILER_KEY = 'Architecture-Projection-Restamp';
export const RESTAMP_REFLOG_MESSAGE = 'repo-harness: restamp projection manifest provenance';

const RECEIPT_DIGEST = /^sha256:[a-f0-9]{64}$/;
const BRANCH_REF = /^refs\/heads\/[^\s^:?*[\\]+$/;
const HEAD_SHA = /^[a-f0-9]{40}$/;

/**
 * Frozen classifier: `status === 'applied'`, exactly one file, that file is the
 * manifest, the action is `update`, and no human action is pending.
 */
export function isManifestRestampOnly(result: ProjectionResultV1): boolean {
  if (result.status !== 'applied') return false;
  if (result.humanActions.length !== 0) return false;
  if (result.files.length !== 1) return false;
  const file = result.files[0]!;
  return file.path === ARCHITECTURE_PROJECTION_MANIFEST_PATH && file.action === 'update';
}

export type RestampGateSkipReason =
  | 'linked-worktree'
  | 'detached-head'
  | 'head-unresolvable'
  | 'index-dirty'
  | 'manifest-not-dirty'
  | 'other-tracked-paths-dirty'
  | 'commit-gpgsign-enabled';

export interface RestampGitFacts {
  /** `--git-dir` equals `--git-common-dir`; linked worktrees never publish. */
  readonly primaryWorktree: boolean;
  /** Full ref of an attached local branch, `null` when HEAD is detached. */
  readonly branchRef: string | null;
  readonly headSha: string | null;
  /** Any staged change relative to HEAD, including unmerged entries. */
  readonly indexDirty: boolean;
  /** Tracked paths reported dirty by `git status --porcelain=v1 -uall`. */
  readonly dirtyTrackedPaths: readonly string[];
  readonly commitGpgSign: boolean;
}

export type RestampGateDecision =
  | { readonly publish: true; readonly branchRef: string; readonly headSha: string }
  | { readonly publish: false; readonly reason: RestampGateSkipReason };

/**
 * Every clause is a hard skip, never a warning: the synthesis below it commits
 * a real ref, so an unproven precondition must not reach it. Untracked files
 * are deliberately absent -- `commit-tree` cannot read them.
 */
export function evaluateRestampGate(facts: RestampGitFacts): RestampGateDecision {
  if (!facts.primaryWorktree) return { publish: false, reason: 'linked-worktree' };
  if (facts.branchRef === null || !BRANCH_REF.test(facts.branchRef)) return { publish: false, reason: 'detached-head' };
  if (facts.headSha === null || !HEAD_SHA.test(facts.headSha)) return { publish: false, reason: 'head-unresolvable' };
  if (facts.indexDirty) return { publish: false, reason: 'index-dirty' };
  const dirty = [...new Set(facts.dirtyTrackedPaths)];
  if (!dirty.includes(ARCHITECTURE_PROJECTION_MANIFEST_PATH)) return { publish: false, reason: 'manifest-not-dirty' };
  if (dirty.length !== 1) return { publish: false, reason: 'other-tracked-paths-dirty' };
  if (facts.commitGpgSign) return { publish: false, reason: 'commit-gpgsign-enabled' };
  return { publish: true, branchRef: facts.branchRef, headSha: facts.headSha };
}

/** Exact commit message bytes; `commit-tree` performs no message cleanup. */
export function restampCommitMessage(receiptDigest: string): string {
  if (!RECEIPT_DIGEST.test(receiptDigest)) throw new Error('architecture projection restamp receipt digest is invalid');
  return `${RESTAMP_COMMIT_SUBJECT}\n\n${RESTAMP_COMMIT_TRAILER_KEY}: ${receiptDigest}\n`;
}

export function restampBranchName(branchRef: string): string {
  if (!BRANCH_REF.test(branchRef)) throw new Error('architecture projection restamp branch ref is invalid');
  return branchRef.slice('refs/heads/'.length);
}
