/**
 * Single-path commit synthesis for digest-only projection-manifest restamps.
 *
 * The recipe is deliberately plumbing-only: `add` -> `write-tree` ->
 * `commit-tree` -> a `diff-tree` single-path proof -> `update-ref` with an
 * old-value compare-and-swap. `commit-tree` and `update-ref` run no user hooks,
 * so this stays re-entrancy-safe inside a Stop hook, and the CAS is the only
 * durable mutation: every abort before it restores the index with
 * `git reset -- <manifest>`. `commit-tree` also never reads untracked or
 * unstaged state, so user WIP cannot be swept into a machine commit.
 *
 * Concurrency uses git's native ref CAS, not a new lock: a competing writer
 * simply loses the `update-ref` and the manifest stays dirty for the next Stop.
 *
 * Nothing here throws outward -- Stop must never be blocked by publication.
 */
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { ProjectionResultV1 } from '../../core/architecture/projection';
import { assertProjectionResult } from '../../core/architecture/projection';
import {
  ARCHITECTURE_PROJECTION_MANIFEST_PATH,
  RESTAMP_REFLOG_MESSAGE,
  evaluateRestampGate,
  isManifestRestampOnly,
  restampBranchName,
  restampCommitMessage,
  type RestampGateSkipReason,
  type RestampGitFacts,
} from '../../core/architecture/restamp-publication';
import { latestArchitectureProjectionReceipt, readArchitectureProjectionReceipt } from './projection-jobs';
import type { ArchitectureProjectionDrainResultV1 } from './projection-orchestrator';

export const ARCHITECTURE_PROJECTION_RESTAMP_VERSION = 'repo-harness.architecture-projection-restamp/v1' as const;

export type RestampNotApplicableReason = 'no-applied-drain' | 'no-receipt' | 'not-a-restamp';
export type RestampSkipReason = RestampGateSkipReason | 'single-path-proof-failed' | 'ref-update-refused';

export interface ArchitectureProjectionRestampOutcomeV1 {
  readonly schemaVersion: typeof ARCHITECTURE_PROJECTION_RESTAMP_VERSION;
  readonly status: 'published' | 'skipped' | 'not-applicable' | 'failed';
  readonly reason: RestampNotApplicableReason | RestampSkipReason | 'git-failure' | null;
  readonly detail: string | null;
  readonly commitSha: string | null;
  readonly branch: string | null;
  readonly receiptDigest: string | null;
  readonly aheadOfOrigin: boolean;
  /** Exactly one stderr line for the caller, or `null` when the lane did not apply. */
  readonly advisory: string | null;
}

interface GitRun {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function git(repoRoot: string, args: readonly string[]): GitRun {
  const result = spawnSync('git', [...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) throw result.error;
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function gitOut(repoRoot: string, args: readonly string[], label: string): string {
  const run = git(repoRoot, args);
  if (run.status !== 0) throw new Error(`${label} failed: ${(run.stderr || run.stdout).trim().slice(0, 300) || `exit ${run.status}`}`);
  return run.stdout.trim();
}

function absoluteGitPath(repoRoot: string, raw: string): string {
  const path = isAbsolute(raw) ? raw : resolve(repoRoot, raw);
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

/**
 * `git status --porcelain=v1 -uall -z` rows. Untracked (`??`) rows are dropped
 * outright: they can never enter a `commit-tree` synthesis, so they must not
 * block one either. Rename/copy origins are dirty tracked paths too.
 */
function statusFacts(output: string): { indexDirty: boolean; dirtyTrackedPaths: string[] } {
  const fields = output.split('\0');
  const dirty: string[] = [];
  let indexDirty = false;
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (!entry || entry.length < 4) continue;
    const x = entry[0]!;
    const y = entry[1]!;
    if (x === '?' || y === '?') continue;
    if (x !== ' ') indexDirty = true;
    dirty.push(entry.slice(3));
    if (/[RC]/.test(x + y)) {
      const origin = fields[index + 1];
      if (origin) {
        dirty.push(origin);
        index += 1;
      }
    }
  }
  return { indexDirty, dirtyTrackedPaths: [...new Set(dirty)].sort() };
}

export function collectRestampGitFacts(repoRoot: string): RestampGitFacts {
  const gitDir = absoluteGitPath(repoRoot, gitOut(repoRoot, ['rev-parse', '--git-dir'], 'git rev-parse --git-dir'));
  const commonDir = absoluteGitPath(repoRoot, gitOut(repoRoot, ['rev-parse', '--git-common-dir'], 'git rev-parse --git-common-dir'));
  const branch = git(repoRoot, ['symbolic-ref', '--quiet', 'HEAD']);
  const head = git(repoRoot, ['rev-parse', 'HEAD']);
  const status = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all', '-z']);
  if (status.status !== 0) throw new Error(`git status failed: ${status.stderr.trim().slice(0, 300)}`);
  const gpgsign = git(repoRoot, ['config', '--get', '--type=bool', 'commit.gpgsign']);
  const { indexDirty, dirtyTrackedPaths } = statusFacts(status.stdout);
  return {
    primaryWorktree: gitDir === commonDir,
    branchRef: branch.status === 0 ? branch.stdout.trim() : null,
    headSha: head.status === 0 ? head.stdout.trim() : null,
    indexDirty,
    dirtyTrackedPaths,
    commitGpgSign: gpgsign.status === 0 && gpgsign.stdout.trim() === 'true',
  };
}

function outcome(value: Partial<ArchitectureProjectionRestampOutcomeV1> & Pick<ArchitectureProjectionRestampOutcomeV1, 'status'>): ArchitectureProjectionRestampOutcomeV1 {
  return {
    schemaVersion: ARCHITECTURE_PROJECTION_RESTAMP_VERSION,
    reason: null,
    detail: null,
    commitSha: null,
    branch: null,
    receiptDigest: null,
    aheadOfOrigin: false,
    advisory: null,
    ...value,
  };
}

function notApplicable(reason: RestampNotApplicableReason): ArchitectureProjectionRestampOutcomeV1 {
  return outcome({ status: 'not-applicable', reason });
}

function skipped(reason: RestampSkipReason, detail: string | null = null): ArchitectureProjectionRestampOutcomeV1 {
  return outcome({
    status: 'skipped',
    reason,
    detail,
    advisory: `[ArchitectureProjection] restamp publication skipped: ${reason}${detail ? ` (${detail})` : ''}.`,
  });
}

function failed(detail: string): ArchitectureProjectionRestampOutcomeV1 {
  return outcome({
    status: 'failed',
    reason: 'git-failure',
    detail,
    advisory: `[ArchitectureProjection] restamp publication failed: ${detail}.`,
  });
}

/** Best effort: the index restore itself must never mask the original abort. */
function restoreIndex(repoRoot: string): void {
  try {
    git(repoRoot, ['reset', '-q', '--', ARCHITECTURE_PROJECTION_MANIFEST_PATH]);
  } catch {
    // The caller already reports the abort that led here.
  }
}

function aheadOfOrigin(repoRoot: string, branch: string, commitSha: string): boolean {
  const remoteRef = `refs/remotes/origin/${branch}`;
  const remote = git(repoRoot, ['rev-parse', '--verify', '--quiet', remoteRef]);
  if (remote.status !== 0 || remote.stdout.trim() === '') return false;
  const count = git(repoRoot, ['rev-list', '--count', `${remoteRef}..${commitSha}`]);
  return count.status === 0 && Number.parseInt(count.stdout.trim(), 10) > 0;
}

/**
 * Publishes one restamp using `result` as the sole classification authority.
 * Returns a structured outcome for every path, including faults.
 */
export function publishArchitectureProjectionRestamp(
  repoRoot: string,
  result: ProjectionResultV1,
): ArchitectureProjectionRestampOutcomeV1 {
  try {
    if (!isManifestRestampOnly(result)) return notApplicable('not-a-restamp');
    const gate = evaluateRestampGate(collectRestampGitFacts(repoRoot));
    if (!gate.publish) return skipped(gate.reason);
    const branch = restampBranchName(gate.branchRef);
    const message = restampCommitMessage(result.receiptDigest);
    const staged = git(repoRoot, ['add', '--', ARCHITECTURE_PROJECTION_MANIFEST_PATH]);
    if (staged.status !== 0) {
      restoreIndex(repoRoot);
      return failed(`git add: ${staged.stderr.trim().slice(0, 300) || `exit ${staged.status}`}`);
    }
    try {
      const tree = gitOut(repoRoot, ['write-tree'], 'git write-tree');
      const commitSha = gitOut(repoRoot, ['commit-tree', tree, '-p', gate.headSha, '-m', message], 'git commit-tree');
      const published = gitOut(repoRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', gate.headSha, commitSha], 'git diff-tree')
        .split('\0')
        .filter((path) => path.length > 0);
      if (published.length !== 1 || published[0] !== ARCHITECTURE_PROJECTION_MANIFEST_PATH) {
        restoreIndex(repoRoot);
        return skipped('single-path-proof-failed', published.join(', ') || 'empty diff');
      }
      const updated = git(repoRoot, ['update-ref', '-m', RESTAMP_REFLOG_MESSAGE, gate.branchRef, commitSha, gate.headSha]);
      if (updated.status !== 0) {
        restoreIndex(repoRoot);
        return skipped('ref-update-refused', updated.stderr.trim().slice(0, 300) || `exit ${updated.status}`);
      }
      const ahead = aheadOfOrigin(repoRoot, branch, commitSha);
      return outcome({
        status: 'published',
        commitSha,
        branch,
        receiptDigest: result.receiptDigest,
        aheadOfOrigin: ahead,
        advisory: ahead
          ? `[ArchitectureProjection] published restamp ${commitSha}; ${branch} is ahead of origin/${branch} — push before running acceptance gates.`
          : `[ArchitectureProjection] published restamp ${commitSha}.`,
      });
    } catch (error) {
      restoreIndex(repoRoot);
      return failed(error instanceof Error ? error.message : String(error));
    }
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}

/** Stop-side entry: only a succeeded drain that applied a projection can publish. */
export function publishArchitectureProjectionRestampForDrain(
  repoRoot: string,
  drain: ArchitectureProjectionDrainResultV1,
): ArchitectureProjectionRestampOutcomeV1 {
  try {
    if (drain.status !== 'succeeded' || drain.resultStatus !== 'applied' || drain.jobId === null) {
      return notApplicable('no-applied-drain');
    }
    const receipt = readArchitectureProjectionReceipt(repoRoot, drain.jobId);
    if (!receipt) return notApplicable('no-receipt');
    return publishArchitectureProjectionRestamp(repoRoot, assertProjectionResult(receipt.result));
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}

/** Manual recovery entry: the newest durable receipt is the classification authority. */
export function publishLatestArchitectureProjectionRestamp(repoRoot: string): ArchitectureProjectionRestampOutcomeV1 {
  try {
    const receipt = latestArchitectureProjectionReceipt(repoRoot);
    if (!receipt) return notApplicable('no-receipt');
    return publishArchitectureProjectionRestamp(repoRoot, assertProjectionResult(receipt.result));
  } catch (error) {
    return failed(error instanceof Error ? error.message : String(error));
  }
}
