/**
 * The quiescent, fail-closed cutover gate for the shared lease protocol.
 *
 * Relocating sprint execution ownership onto the coordination plane moves
 * runtime state: the in-flight marker location, the owner record schema, the
 * backlog lock location, and the retirement of `--force`. On an upgrade with
 * live worktrees the old per-worktree markers still exist, the new system does
 * not read them, and a fresh agent can re-claim a task that is actively being
 * worked.
 *
 * Cutover is therefore quiescent rather than migrating. Mapping a legacy marker
 * to a canonical task requires exactly the identity derivation this system is
 * introducing, applied to unverified legacy state -- the kind of semantic
 * re-derivation the repo rules forbid. The operator finishes or releases
 * outstanding work first; nothing here rewrites, moves, or deletes legacy state.
 *
 * Every signal below is read from its existing authority: `git worktree list
 * --porcelain` owns whether a worktree exists, the worktree-local metadata file
 * owns whether it is executing a contract, and the closeout journal under the
 * git common dir owns whether a closeout is unfinished.
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { writeFileDurably } from '../evidence/atomic-append';
import { COORDINATION_ROOT_RELATIVE_PATH } from './coordination-lease-store';

/** The retired per-worktree marker directory, relative to a worktree root. */
const LEGACY_IN_FLIGHT_DIR_NAME = 'in-flight';
const DEFAULT_ACTIVE_SPRINT_MARKER = '.ai/harness/sprint/active-sprint';
const WORKTREE_METADATA_DIR = '.ai/harness/worktrees';
const TRANSACTIONS_RELATIVE_PATH = 'repo-harness/transactions';

export type CutoverBlockerKind =
  | 'legacy_in_flight_marker'
  | 'executing_contract_worktree'
  | 'unfinished_closeout_journal';

export interface CutoverBlocker {
  readonly kind: CutoverBlockerKind;
  /** The exact path the operator has to resolve. */
  readonly path: string;
  readonly detail: string;
}

export interface CutoverQuiescence {
  readonly quiescent: boolean;
  readonly blockers: readonly CutoverBlocker[];
}

/**
 * The git binary itself is missing, as opposed to the target simply not being
 * a git clone. The two are indistinguishable through a thrown `execFileSync`
 * unless they are separated here, and collapsing them makes the quiescence gate
 * fail open on exactly the environment that can prove nothing about the repo.
 */
export class GitBinaryUnavailableError extends Error {
  readonly kind = 'git_binary_unavailable';

  constructor(cause: unknown) {
    super(
      'the git binary is unavailable, so the coordination cutover gate cannot be evaluated: '
      + (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = 'GitBinaryUnavailableError';
  }
}

/** Re-raise a missing binary; every other git failure is the caller's to classify. */
function rethrowIfGitBinaryMissing(error: unknown): void {
  if (error instanceof GitBinaryUnavailableError) throw error;
  if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') {
    throw new GitBinaryUnavailableError(error);
  }
}

function git(cwd: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    rethrowIfGitBinaryMissing(error);
    return null;
  }
}

/** Worktree paths in `git worktree list --porcelain` order; the main tree first. */
export function listWorktreePaths(repoRoot: string): string[] {
  const output = git(repoRoot, ['worktree', 'list', '--porcelain']);
  if (output === null) return [];
  const paths: string[] = [];
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length).trim());
  }
  return paths;
}

/**
 * The legacy marker directory, resolved through the same policy key
 * `sprint-backlog.sh` reads. A repo that moved its active-sprint marker moved
 * its in-flight markers with it, and a gate that only knew the default would
 * fail open on exactly that repo.
 */
function legacyInFlightRelativePath(repoRoot: string): string {
  let marker = DEFAULT_ACTIVE_SPRINT_MARKER;
  const policyPath = join(repoRoot, '.ai/harness/policy.json');
  try {
    const policy = JSON.parse(readFileSync(policyPath, 'utf-8')) as {
      sprints?: { active_marker_file?: unknown };
    };
    const configured = policy.sprints?.active_marker_file;
    if (typeof configured === 'string' && configured.length > 0) marker = configured;
  } catch {
    // An absent or unreadable policy leaves the documented default in place;
    // the marker path is not a semantic value this gate may invent.
  }
  return join(dirname(marker), LEGACY_IN_FLIGHT_DIR_NAME);
}

function directoryEntries(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** `status.json` documents under the closeout journal that are still open. */
function unfinishedCloseoutJournals(repoRoot: string): CutoverBlocker[] {
  let resolvedRoot: string;
  try {
    resolvedRoot = join(resolveGitCommonDirectory(repoRoot), TRANSACTIONS_RELATIVE_PATH);
  } catch (error) {
    rethrowIfGitBinaryMissing(error);
    return [];
  }
  const blockers: CutoverBlocker[] = [];
  for (const operation of directoryEntries(resolvedRoot)) {
    const operationDir = join(resolvedRoot, operation);
    if (operation === 'claims' || !isDirectory(operationDir)) continue;
    for (const key of directoryEntries(operationDir)) {
      const statusPath = join(operationDir, key, 'status.json');
      if (!existsSync(statusPath)) continue;
      let status: string;
      try {
        status = readFileSync(statusPath, 'utf-8');
      } catch {
        continue;
      }
      if (/"status":\s*"in_progress"/.test(status)) {
        blockers.push({
          kind: 'unfinished_closeout_journal',
          path: join(operationDir, key),
          detail: `closeout transaction ${operation}/${key} is still in_progress`,
        });
      }
    }
  }
  return blockers;
}

/**
 * Every registered worktree still carrying retired per-worktree markers. Split
 * out because the v1 entrypoint gate is interested in exactly this blocker and
 * nothing else: a live contract worktree or an open closeout is the normal
 * steady state of an adopted repo, while a legacy marker means the clone never
 * crossed over.
 */
export function inspectLegacyInFlightMarkers(repoRoot: string): CutoverBlocker[] {
  const worktrees = listWorktreePaths(repoRoot);
  const legacyRelative = legacyInFlightRelativePath(repoRoot);
  const blockers: CutoverBlocker[] = [];
  for (const worktree of worktrees.length > 0 ? worktrees : [repoRoot]) {
    const legacyDir = join(worktree, legacyRelative);
    const markers = directoryEntries(legacyDir);
    if (markers.length > 0) {
      blockers.push({
        kind: 'legacy_in_flight_marker',
        path: legacyDir,
        detail: `retired per-worktree in-flight markers: ${markers.sort().join(', ')}`,
      });
    }
  }
  return blockers;
}

/**
 * Report every reason an install or upgrade must refuse. Read-only and total:
 * it never repairs, migrates, or deletes what it finds.
 */
export function inspectCutoverQuiescence(repoRoot: string): CutoverQuiescence {
  const worktrees = listWorktreePaths(repoRoot);
  const blockers: CutoverBlocker[] = [...inspectLegacyInFlightMarkers(repoRoot)];

  // The main worktree keeps its own metadata records for the worktrees it
  // started, so only linked worktrees prove an execution is open here.
  for (const worktree of (worktrees.length > 0 ? worktrees : [repoRoot]).slice(1)) {
    const metadata = directoryEntries(join(worktree, WORKTREE_METADATA_DIR))
      .filter((entry) => entry.endsWith('.json'));
    if (metadata.length > 0) {
      blockers.push({
        kind: 'executing_contract_worktree',
        path: worktree,
        detail: `contract worktree metadata present: ${metadata.sort().join(', ')}`,
      });
    }
  }

  blockers.push(...unfinishedCloseoutJournals(repoRoot));
  return { quiescent: blockers.length === 0, blockers };
}

/**
 * The installed-protocol marker, under the same git common directory the
 * coordination plane itself lives in -- one clone, one cutover.
 *
 * It is a versioned file, not a directory: a lease sweep or an interrupted
 * lock can leave an empty directory behind, and an empty directory must never
 * read as "the protocol is installed".
 */
const CUTOVER_MARKER_RELATIVE_PATH = `${COORDINATION_ROOT_RELATIVE_PATH}/protocol.json`;
const CUTOVER_PROTOCOL_VERSION = 1;

/**
 * `null` when the target is not a git clone. The coordination plane is rooted
 * at the git common directory, so a non-git adoption target has no plane to
 * cross over to and no sprint execution state to be quiescent about; the gate
 * is inapplicable there rather than failing.
 *
 * A missing git binary is not that case and throws: it proves nothing about
 * the target, and returning `null` there disarms the gate on the one
 * environment that cannot evaluate it.
 */
export function cutoverMarkerPath(repoRoot: string): string | null {
  let commonDir: string;
  try {
    commonDir = resolveGitCommonDirectory(repoRoot);
  } catch (error) {
    rethrowIfGitBinaryMissing(error);
    return null;
  }
  return join(commonDir, CUTOVER_MARKER_RELATIVE_PATH);
}

/**
 * Whether this clone already crossed over. Anything unreadable, unparseable,
 * or carrying a different protocol version is "not installed": the gate is a
 * one-shot transition, and re-running it is safe while skipping it is not.
 */
export function isCutoverInstalled(repoRoot: string): boolean {
  const markerPath = cutoverMarkerPath(repoRoot);
  if (markerPath === null) return false;
  let raw: string;
  try {
    raw = readFileSync(markerPath, 'utf-8');
  } catch {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as { protocol?: unknown };
    return parsed.protocol === CUTOVER_PROTOCOL_VERSION;
  } catch {
    return false;
  }
}

/** Record the crossing, so the quiescence gate never fires for this clone again. */
export function recordCutoverInstalled(markerPath: string): void {
  writeFileDurably(markerPath, `${JSON.stringify({ protocol: CUTOVER_PROTOCOL_VERSION })}\n`);
}

/**
 * The fail-closed gate every v1 ownership entrypoint runs, not just `init`.
 *
 * `init` is the only place the crossing is recorded, but it is not the only
 * way to reach the plane: a claim taken directly against a clone that still
 * carries retired per-worktree markers would run the new protocol beside the
 * old one, and the old markers are invisible to it -- precisely the duplicate
 * claim the cutover exists to prevent. Returns the refusal text, or `null` when
 * the entrypoint may proceed.
 */
export function legacyCutoverRefusal(repoRoot: string): string | null {
  if (isCutoverInstalled(repoRoot)) return null;
  const blockers = inspectLegacyInFlightMarkers(repoRoot);
  if (blockers.length === 0) return null;
  return 'this clone has not crossed over to the v1 coordination plane and still carries retired '
    + `sprint execution markers: ${blockers.map((blocker) => `${blocker.path} (${blocker.detail})`).join('; ')}`
    + '; finish or release that work, then run the init cutover (repo-harness init --repo <path>)';
}

export function formatCutoverBlockers(quiescence: CutoverQuiescence): string {
  return quiescence.blockers
    .map((blocker) => `${blocker.kind}: ${blocker.path} (${blocker.detail})`)
    .join('; ');
}
