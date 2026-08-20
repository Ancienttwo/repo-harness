/**
 * Architecture drift changed-set authority.
 *
 * The architecture cascade and the archctx projection lane used to read the
 * post-edit journal, which only ever sees Claude Edit/Write tool events: a
 * Codex worktree session that writes through shell produced no journal event
 * at all, so drift recording never fired there. This module replaces that
 * feed with a git-derived changed set computed at Stop, which observes every
 * mutation regardless of the tool that made it.
 *
 * The changed set is `git diff <cursor> HEAD` (the commits landed since the
 * last acknowledged Stop) unioned with the current working tree, where
 * `<cursor>` is a repo-level single-slot state file following the
 * `session-run-identity.json` pattern. The cursor advances to HEAD only when
 * the consumer acknowledges the delivery, so a failed drain replays the same
 * range on the next Stop instead of losing it.
 *
 * The datum split is explicit: this module owns the "architecture changed
 * set"; the post-edit journal owns edit-time trigger payloads
 * (contract-verification target, minimal-change base ref, checkpoint). They
 * are different data, not two authorities for one.
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { canonicalRepoRelativePath } from '../../effects/state/collect-state-inputs';
import type { ArchitectureProjectionSourceEvent } from '../../effects/architecture/projection-orchestrator';

const CURSOR_RELATIVE_PATH = '.ai/harness/state/architecture-drift-cursor.json';

/**
 * One slot per repository, so a dead-lettered range keeps blocking the lane
 * (`architectureProjectionDeadLetterForSourceKeys`) until an operator retries
 * it -- a per-range key would let the next commit silently route around the
 * failed range.
 */
const DRIFT_SOURCE_KEY = 'architecture-drift-cursor';

interface ArchitectureDriftCursorState {
  readonly version: 1;
  readonly head_sha: string;
  readonly updated_at: string;
}

export interface ArchitectureDriftChangedSet {
  /** Commit the cursor advances to once the delivery is acknowledged. */
  readonly headSha: string | null;
  readonly cursorSha: string | null;
  /** Deduped, sorted, repo-relative, canonicalized changed paths. */
  readonly paths: readonly string[];
  /** Advisory lines for the caller's existing stderr channel. */
  readonly warnings: readonly string[];
}

export interface ArchitectureProjectionPublicationAcknowledgement {
  readonly schemaVersion: 'repo-harness.architecture-projection-publication-ack/v1';
  readonly publicationSha: string;
  readonly manifestDigest: `sha256:${string}`;
  readonly cursorSha: string;
}

function git(repoRoot: string, args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

function isCursorState(value: unknown): value is ArchitectureDriftCursorState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ArchitectureDriftCursorState>;
  return state.version === 1
    && typeof state.head_sha === 'string' && /^[0-9a-f]{40,64}$/.test(state.head_sha)
    && typeof state.updated_at === 'string';
}

export function readArchitectureDriftCursor(repoRoot: string): ArchitectureDriftCursorState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(repoRoot, CURSOR_RELATIVE_PATH), 'utf-8'));
    return isCursorState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Called only on an acknowledged drain/cascade outcome -- see module doc. */
export function advanceArchitectureDriftCursor(repoRoot: string, headSha: string, now: Date = new Date()): void {
  const target = join(repoRoot, CURSOR_RELATIVE_PATH);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  const state: ArchitectureDriftCursorState = { version: 1, head_sha: headSha, updated_at: now.toISOString() };
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
}

/**
 * A synthesized contract publication whose exact accepted tree already carries
 * the projection manifest is the delivery acknowledgement for that source
 * delta. Advancing the Stop cursor here prevents the same publication from
 * being delivered again merely because its commit SHA changed after the
 * provider stamped `verifiedAgainst.commit` in the source worktree.
 *
 * Every proof is local and fail-closed: the requested SHA must be the clean
 * checked-out HEAD, must be a synthesized contract publication, and must have
 * changed the tracked manifest in that commit. No caller can acknowledge an
 * arbitrary range or a manifest that differs from the published blob.
 */
export function acknowledgeArchitectureProjectionPublication(
  repoRoot: string,
  publicationSha: string,
  now: Date = new Date(),
): ArchitectureProjectionPublicationAcknowledgement {
  if (!/^[0-9a-f]{40,64}$/.test(publicationSha)) throw new Error('architecture projection publication SHA is invalid');

  const headSha = git(repoRoot, ['rev-parse', 'HEAD'])?.trim() ?? '';
  if (headSha !== publicationSha) throw new Error(`architecture projection publication is not checked-out HEAD: expected ${publicationSha}, got ${headSha || '(unavailable)'}`);

  const status = git(repoRoot, ['status', '--porcelain=v1', '--untracked-files=no']);
  if (status === null) throw new Error('architecture projection publication worktree status is unavailable');
  if (status.trim() !== '') throw new Error('architecture projection publication worktree has tracked changes');

  const message = git(repoRoot, ['log', '-1', '--format=%B', publicationSha]);
  if (message === null || !/^Source-Worktree-Head: [0-9a-f]{40,64}$/m.test(message)) {
    throw new Error('architecture projection publication lacks the Source-Worktree-Head proof');
  }

  const manifestPath = 'docs/architecture/.projection-manifest.json';
  const changedPaths = git(repoRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', `${publicationSha}^`, publicationSha]);
  if (changedPaths === null || !changedPaths.split('\n').includes(manifestPath)) {
    throw new Error('architecture projection publication did not change the projection manifest');
  }

  let worktreeManifest: string;
  try {
    worktreeManifest = readFileSync(join(repoRoot, manifestPath), 'utf8');
  } catch {
    throw new Error('architecture projection publication manifest is unavailable');
  }
  const publishedManifest = git(repoRoot, ['show', `${publicationSha}:${manifestPath}`]);
  if (publishedManifest === null || publishedManifest !== worktreeManifest) {
    throw new Error('architecture projection publication manifest differs from the published blob');
  }

  advanceArchitectureDriftCursor(repoRoot, publicationSha, now);
  return {
    schemaVersion: 'repo-harness.architecture-projection-publication-ack/v1',
    publicationSha,
    manifestDigest: `sha256:${createHash('sha256').update(worktreeManifest).digest('hex')}`,
    cursorSha: publicationSha,
  };
}

/**
 * `git status --porcelain -z` rows. `-uall` (not the default collapsed
 * `dir/` row) because a newly added package directory is exactly the drift
 * the cascade has to classify per file. Rename and copy rows carry the origin
 * path in the next NUL field; both sides are changed paths.
 */
function parseStatusPaths(output: string): string[] {
  const fields = output.split('\0');
  const paths: string[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (!entry || entry.length < 4) continue;
    paths.push(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      const origin = fields[index + 1];
      if (origin) {
        paths.push(origin);
        index += 1;
      }
    }
  }
  return paths;
}

function canonicalPaths(repoRoot: string, candidates: readonly string[]): string[] {
  const canonical = new Set<string>();
  for (const candidate of candidates) {
    const resolved = canonicalRepoRelativePath(repoRoot, candidate);
    if (resolved !== null) canonical.add(resolved);
  }
  return [...canonical].sort();
}

export function computeArchitectureDriftChangedSet(repoRoot: string): ArchitectureDriftChangedSet {
  const status = git(repoRoot, ['status', '--porcelain', '--untracked-files=all', '-z']);
  if (status === null) {
    return {
      headSha: null,
      cursorSha: null,
      paths: [],
      warnings: ['[ArchitectureDrift] git changed set unavailable; no architecture changed set for this run'],
    };
  }

  const cursorSha = readArchitectureDriftCursor(repoRoot)?.head_sha ?? null;
  const headSha = git(repoRoot, ['rev-parse', 'HEAD'])?.trim() || null;
  const observed = parseStatusPaths(status);
  const warnings: string[] = [];

  if (headSha !== null) {
    // A missing or unresolvable cursor (first run, rebase, gc) re-anchors at
    // HEAD instead of replaying history: fail closed on the range, keep the
    // working tree.
    const diff = cursorSha === null ? null : git(repoRoot, ['diff', '--name-only', '--no-renames', '-z', cursorSha, headSha]);
    if (diff === null) {
      warnings.push(`[ArchitectureDrift] drift cursor ${cursorSha ?? '(missing)'} is unresolvable; re-anchoring to ${headSha} and processing working-tree entries only`);
    } else {
      observed.push(...diff.split('\0').filter((path) => path.length > 0));
    }
  }

  return { headSha, cursorSha, paths: canonicalPaths(repoRoot, observed), warnings };
}

/**
 * One synthetic source event per changed set. `event_id` is a deterministic
 * digest of the range and its paths, so a repeated Stop over unchanged state
 * rebuilds the same projection job identity and settles on the existing
 * receipt instead of reprojecting.
 */
export function architectureDriftSourceEvent(
  changedSet: ArchitectureDriftChangedSet,
): ArchitectureProjectionSourceEvent | null {
  if (changedSet.paths.length === 0) return null;
  const identity = createHash('sha256')
    .update([changedSet.cursorSha ?? '(none)', changedSet.headSha ?? '(none)', ...changedSet.paths].join('\0'))
    .digest('hex')
    .slice(0, 24);
  return { source_key: DRIFT_SOURCE_KEY, event_id: `drift-${identity}`, changed_paths: changedSet.paths };
}
