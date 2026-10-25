/** Read historical publication receipts and live provider merge proof. */
import { spawnSync } from 'child_process';
import { gitSpawnSync } from '../git/runner';
import { existsSync, lstatSync, readFileSync } from 'fs';
import { join } from 'path';
import { validatePublicationReceipt, type PublicationReceiptV3 } from '../../core/publication/publication-receipt';
import { resolveProtectedGitRuntime } from '../review/acceptance-receipt';
import { resolveGitCommonDirectory } from '../git/common-directory';

export const PUBLICATION_RECEIPTS_RELATIVE_PATH = 'repo-harness/publications/v1';
export type PublicationErrorCode = 'publication_incomplete' | 'publication_claim_mismatch';
export class PublicationReceiptError extends Error {
  constructor(readonly code: PublicationErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PublicationReceiptError';
  }
}

function incomplete(message: string, cause?: unknown): PublicationReceiptError {
  return new PublicationReceiptError('publication_incomplete', message, cause);
}

function mismatch(message: string, cause?: unknown): PublicationReceiptError {
  return new PublicationReceiptError('publication_claim_mismatch', message, cause);
}

function readRegular(path: string, label: string): Buffer {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw incomplete(`${label} is unavailable: ${path}`, error);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw incomplete(`${label} must be a regular file: ${path}`);
  try {
    return readFileSync(path);
  } catch (error) {
    throw incomplete(`${label} is unreadable: ${path}`, error);
  }
}

function receiptDirectory(repoRoot: string, gitBin: string): string {
  return join(resolveGitCommonDirectory(repoRoot, gitBin), PUBLICATION_RECEIPTS_RELATIVE_PATH);
}

export function publicationReceiptPath(repoRoot: string, publicationId: string, gitBin = 'git'): string {
  if (!/^sha256:[0-9a-f]{64}$/.test(publicationId)) throw incomplete('publication id is invalid');
  return join(receiptDirectory(repoRoot, gitBin), `${publicationId.slice('sha256:'.length)}.json`);
}

export function readPublicationReceiptCache(repoRoot: string, publicationId: string, gitBin = 'git'): PublicationReceiptV3 | null {
  const path = publicationReceiptPath(repoRoot, publicationId, gitBin);
  if (!existsSync(path)) return null;
  try {
    return validatePublicationReceipt(JSON.parse(readRegular(path, 'publication receipt cache').toString('utf-8')));
  } catch (error) {
    throw mismatch(`cached publication receipt is invalid: ${path}: ${error instanceof Error ? error.message : String(error)}`, error);
  }
}

export function observeProviderBranchMergeCommit(input: {
  readonly repoRoot: string;
  readonly ghBin: string;
  readonly gitBin: string;
  readonly headSha: string;
  readonly baseRef: string;
  readonly targetOid: string;
  readonly timeoutMs: number;
}): string | null {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(input.headSha)) return null;
  const deadline = Date.now() + input.timeoutMs;
  // The protected env is built fresh, so caller GH_REPO and GH_HOST never reach gh.
  // The repository and host come from this clone's remotes.
  let env: NodeJS.ProcessEnv;
  try { env = { ...resolveProtectedGitRuntime().env }; } catch { return null; }
  const result = spawnSync(input.ghBin, ['api', `repos/{owner}/{repo}/commits/${input.headSha}/pulls`], {
    cwd: input.repoRoot, env, encoding: 'utf-8', timeout: input.timeoutMs, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) return null;
  let pulls: unknown;
  try { pulls = JSON.parse(result.stdout); } catch { return null; }
  if (!Array.isArray(pulls)) return null;
  for (const pull of pulls) {
    if (!pull || typeof pull !== 'object' || Array.isArray(pull)) continue;
    const { merged_at: mergedAt, base, merge_commit_sha: merge } = pull as Record<string, unknown>;
    if (typeof mergedAt !== 'string' || !Number.isFinite(Date.parse(mergedAt))) continue;
    if (!base || typeof base !== 'object' || (base as Record<string, unknown>).ref !== input.baseRef) continue;
    if (typeof merge !== 'string' || !/^[a-f0-9]{40}$/u.test(merge)) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const ancestor = gitSpawnSync(['merge-base', '--is-ancestor', merge, input.targetOid], {
      gitBin: input.gitBin,
      cwd: input.repoRoot, timeout: remaining, stdio: 'ignore',
    });
    if (!ancestor.error && ancestor.status === 0) return merge;
  }
  return null;
}
