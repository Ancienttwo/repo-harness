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

function git(cwd: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
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
  } catch {
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
 * Report every reason an install or upgrade must refuse. Read-only and total:
 * it never repairs, migrates, or deletes what it finds.
 */
export function inspectCutoverQuiescence(repoRoot: string): CutoverQuiescence {
  const worktrees = listWorktreePaths(repoRoot);
  const legacyRelative = legacyInFlightRelativePath(repoRoot);
  const blockers: CutoverBlocker[] = [];

  const scanned = worktrees.length > 0 ? worktrees : [repoRoot];
  for (const [index, worktree] of scanned.entries()) {
    const legacyDir = join(worktree, legacyRelative);
    const markers = directoryEntries(legacyDir);
    if (markers.length > 0) {
      blockers.push({
        kind: 'legacy_in_flight_marker',
        path: legacyDir,
        detail: `retired per-worktree in-flight markers: ${markers.sort().join(', ')}`,
      });
    }
    // The main worktree keeps its own metadata records for the worktrees it
    // started, so only linked worktrees prove an execution is open here.
    if (index === 0) continue;
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
 */
export function cutoverMarkerPath(repoRoot: string): string | null {
  let commonDir: string;
  try {
    commonDir = resolveGitCommonDirectory(repoRoot);
  } catch {
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

export function formatCutoverBlockers(quiescence: CutoverQuiescence): string {
  return quiescence.blockers
    .map((blocker) => `${blocker.kind}: ${blocker.path} (${blocker.detail})`)
    .join('; ');
}
