/**
 * The one owed-capability rule. A capability is owed when one of its owned
 * implementation paths in the review subject changed after the last change to
 * the architecture projection manifest. ArchContext stamps are content
 * digests, so an owed capability is always stale.
 *
 * The rule reuses the ownership result that state resolution already
 * computed. It starts no archctx process and runs at most two Git commands:
 * one `git log` over the branch and one `git status` for the working tree.
 * It never writes, queues or projects; it is evidence for the agent and CI.
 */
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { CapabilityOwnership } from '../../core/state/types';

export const PROJECTION_MANIFEST_PATH = 'docs/architecture/.projection-manifest.json';
export const OWED_NEXT_COMMAND = 'repo-harness architecture-projection check --json';
export const OWED_WORKER_FLOW = 'assets/skill-commands/repo-harness-architecture/references/worker.md';

export interface OwedCapability {
  readonly id: string;
  readonly module_document: string;
  /** Owned paths that changed after the last manifest change, sorted. */
  readonly paths: readonly string[];
}

export interface OwedCapabilities {
  /**
   * `not_projected`: the checkout has no projection manifest, so the rule does
   * not apply. `clear`: no owned path changed after the last manifest change.
   */
  readonly status: 'owed' | 'clear' | 'not_projected';
  readonly review_base: string;
  /**
   * The newest branch commit that changed the manifest, `working-tree` when the
   * manifest has an uncommitted change, or null when the branch never changed it.
   */
  readonly manifest_change: string | null;
  readonly capabilities: readonly OwedCapability[];
  /** Unowned implementation paths added after the last manifest change. */
  readonly new_unowned_paths: readonly string[];
}

interface ChangedAfterManifest {
  readonly manifestChange: string | null;
  readonly changed: ReadonlySet<string>;
  readonly added: ReadonlySet<string>;
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, '-c', 'core.quotepath=false', ...args], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
    timeout: 10_000,
  });
}

/**
 * Paths changed after the last manifest change. Commits are walked newest
 * first and stop at the newest commit that changed the manifest; that commit's
 * own paths are not "after". The working tree is one change unit after every
 * commit. When it holds a manifest change, nothing is after the manifest.
 */
function changedAfterManifest(repoRoot: string, reviewBase: string): ChangedAfterManifest {
  const status = git(repoRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']).split('\0');
  const dirty = new Set<string>();
  const dirtyAdded = new Set<string>();
  for (const entry of status) {
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    dirty.add(path);
    if (xy === '??' || xy[0] === 'A') dirtyAdded.add(path);
  }
  if (dirty.has(PROJECTION_MANIFEST_PATH)) {
    return { manifestChange: 'working-tree', changed: new Set(), added: new Set() };
  }

  const changed = new Set(dirty);
  const added = new Set(dirtyAdded);
  let manifestChange: string | null = null;
  const log = git(repoRoot, ['log', '--format=%x01%H', '--name-status', '-z', '--no-renames', `${reviewBase}..HEAD`]);
  for (const chunk of log.split('\x01').slice(1)) {
    const [sha = '', ...rest] = chunk.split('\0');
    const tokens = rest.map((token) => token.replace(/^\n/, '')).filter(Boolean);
    const commitPaths: Array<{ readonly status: string; readonly path: string }> = [];
    for (let index = 0; index + 1 < tokens.length; index += 2) {
      commitPaths.push({ status: tokens[index]!, path: tokens[index + 1]! });
    }
    if (commitPaths.some((entry) => entry.path === PROJECTION_MANIFEST_PATH)) {
      manifestChange = sha;
      break;
    }
    for (const entry of commitPaths) {
      changed.add(entry.path);
      if (entry.status === 'A') added.add(entry.path);
    }
  }
  return { manifestChange, changed, added };
}

/** Applies the owed rule to one ownership result. Git failures throw. */
export function owedCapabilities(repoRoot: string, ownership: CapabilityOwnership): OwedCapabilities | null {
  if (ownership.review_base === null) return null;
  if (!existsSync(join(repoRoot, PROJECTION_MANIFEST_PATH))) {
    return { status: 'not_projected', review_base: ownership.review_base, manifest_change: null, capabilities: [], new_unowned_paths: [] };
  }
  const after = changedAfterManifest(repoRoot, ownership.review_base);
  const capabilities = ownership.capabilities
    .map((capability) => ({
      id: capability.id,
      module_document: capability.module_document,
      paths: capability.paths.filter((path) => after.changed.has(path)),
    }))
    .filter((capability) => capability.paths.length > 0);
  return {
    status: capabilities.length > 0 ? 'owed' : 'clear',
    review_base: ownership.review_base,
    manifest_change: after.manifestChange,
    capabilities,
    new_unowned_paths: ownership.unowned_paths.filter((path) => after.added.has(path)),
  };
}

const LISTED_CAPABILITIES = 3;
const LISTED_UNOWNED_PATHS = 5;

function listed(items: readonly string[], limit: number): string {
  const shown = items.slice(0, limit).join(', ');
  return items.length > limit ? `${shown} (+${items.length - limit} more)` : shown;
}

/** At most three model-facing lines, or null when nothing is owed. */
export function renderOwedCapabilities(owed: OwedCapabilities | null): string | null {
  if (!owed || owed.status !== 'owed') return null;
  const lines = [
    `[ArchitectureOwed] Changed after the last projection manifest update: ${listed(
      owed.capabilities.map((capability) => `${capability.id} (${capability.module_document})`),
      LISTED_CAPABILITIES,
    )}.`,
  ];
  if (owed.new_unowned_paths.length > 0) {
    lines.push(`  New unowned source paths: ${listed(owed.new_unowned_paths, LISTED_UNOWNED_PATHS)}.`);
  }
  lines.push(`  Next: ${OWED_NEXT_COMMAND}, then the worker flow in ${OWED_WORKER_FLOW}.`);
  return lines.join('\n');
}
