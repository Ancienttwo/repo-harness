/**
 * Local retention for closed harness artifacts (#697).
 *
 * Closed plans stay committed for the retention window and then leave Git.
 * Task records, check logs and run records are local-only and accumulate on
 * disk. This module moves all of them into a gitignored local archive root once
 * they are older than the window. It never deletes anything: the operator
 * cleans the archive root.
 *
 * "Closed" is not inferred from file content. `archive-workflow.sh` is the only
 * writer that closes a plan and its task records, and it writes them as new
 * files under `plans/archive/` and `tasks/archive/`, so membership there is the
 * closed signal. For an untracked file the file time is the close time. For a
 * tracked plan it is the last commit time, because a checkout resets file
 * times. A check log under
 * `.ai/harness/checks/` is finished once nothing has written to it for the
 * window. Open work lives elsewhere and is never scanned.
 *
 * Most of `.ai/harness/runs/` must stay in place. Verification records
 * (`verification-vx-*.json`) are bound by sha256 in the evidence ledger, and a
 * missing one fails a baseline or a receipt check permanently. Report files are
 * named by acceptance receipts. Task-agent, task-workspace and review session
 * directories keep a `closed.json` tombstone that blocks a restart. Ledgers and
 * hook telemetry are live and rotate on their own. Run summaries belong to
 * `evidence-gc.ts`. Only terminal records that no code reads back are taken:
 * failure logs of verification records, heartbeat triage snapshots, and
 * `contract-run-*` output directories that finished (`manifest.json` is the
 * last write of a run).
 *
 * Closed plans are the only class that leaves Git. The move removes a tracked
 * plan from the working tree. The command does not stage or commit; the
 * operator commits the removal. A plan with uncommitted changes is skipped, so
 * the move never hides work that Git does not hold. In every other class an
 * entry with any tracked file is skipped, because those classes are local-only
 * and a move would be an unexpected deletion.
 */
import { execFileSync, spawnSync } from 'child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, type Stats } from 'fs';
import { dirname, join } from 'path';
import { ensureRepoRelativePath, resolveInsideRepo } from './path-safety';

export const DEFAULT_RETENTION_DAYS = 30;
export const DEFAULT_ARCHIVE_ROOT = '.ai/harness/archive/retention';
const POLICY_FILE = '.ai/harness/policy.json';
const CONFIG_KEYS = new Set(['days', 'archive_root', 'keep']);
const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionClassId = 'closed-plans' | 'closed-task-records' | 'check-logs' | 'run-records';

interface RetentionClass {
  readonly id: RetentionClassId;
  readonly dir: string;
  /** Which direct children of `dir` belong to the class. */
  readonly accepts: (name: string, entry: Stats, absolute: string) => boolean;
  /** True when a tracked entry leaves Git once it is past the window. */
  readonly leavesGit?: true;
}

function isRunRecord(name: string, entry: Stats, absolute: string): boolean {
  if (entry.isFile()) return /^verification-vx-[0-9a-f]{20}\.log$/.test(name) || name.endsWith('-heartbeat-triage.json');
  return entry.isDirectory() && name.startsWith('contract-run-') && existsSync(join(absolute, 'manifest.json'));
}

/** Any closed record; the `.gitkeep` scaffold keeps the directory and is not one. */
function isClosedRecord(name: string, entry: Stats): boolean {
  return name !== '.gitkeep' && (entry.isFile() || entry.isDirectory());
}

const CLASSES: readonly RetentionClass[] = [
  { id: 'closed-plans', dir: 'plans/archive', accepts: isClosedRecord, leavesGit: true },
  { id: 'closed-task-records', dir: 'tasks/archive', accepts: isClosedRecord },
  { id: 'check-logs', dir: '.ai/harness/checks', accepts: (name, entry) => entry.isFile() && name.endsWith('.log') },
  // The writers hard-code this directory, so `harness.runs_dir` does not apply.
  { id: 'run-records', dir: '.ai/harness/runs', accepts: isRunRecord },
];

export interface RetentionConfig {
  readonly days: number;
  /** Repo-relative; must be gitignored. */
  readonly archiveRoot: string;
  /** Repo-relative paths; an entry at, under or containing one is never moved. */
  readonly keep: readonly string[];
}

export type RetentionSkipReason = 'recent' | 'tracked' | 'modified' | 'kept' | 'destination-exists';

export interface RetentionEntry {
  readonly class: RetentionClassId;
  /** Repo-relative source path. */
  readonly path: string;
  /** Repo-relative destination under the archive root. */
  readonly destination: string;
  /** Whole days since the newest file in the entry was written or committed. */
  readonly ageDays: number;
  /** The entry holds a Git-tracked file; an apply leaves its removal to commit. */
  readonly tracked: boolean;
}

export interface RetentionReport {
  readonly mode: 'dry-run' | 'apply';
  readonly config: RetentionConfig;
  /** Entries moved, or that a dry run would move. */
  readonly archived: readonly RetentionEntry[];
  readonly skipped: readonly (RetentionEntry & { readonly reason: RetentionSkipReason })[];
  /** Entries a move failed for; the entry stays in place. */
  readonly failed: readonly (RetentionEntry & { readonly error: string })[];
}

/** One canonical spelling per path, so string overlap equals filesystem overlap. */
function repoRelative(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${POLICY_FILE}: information_lifecycle.retention.${field} must be a string`);
  const result = ensureRepoRelativePath(value.replace(/\/+$/, ''));
  if (!result.ok || !result.path) throw new Error(`${POLICY_FILE}: information_lifecycle.retention.${field}: ${result.error}`);
  if (result.path.split('/').some((segment) => segment === '' || segment === '.')) {
    throw new Error(`${POLICY_FILE}: information_lifecycle.retention.${field} must be a canonical path: ${value}`);
  }
  return result.path;
}

function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/**
 * Reads `information_lifecycle.retention` from the repo policy. Every field is
 * optional; a present field with the wrong shape is an error, not a default.
 */
export function readRetentionConfig(repoRoot: string): RetentionConfig {
  const policyPath = join(repoRoot, POLICY_FILE);
  let section: unknown;
  if (existsSync(policyPath)) {
    const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as { information_lifecycle?: { retention?: unknown } };
    section = policy?.information_lifecycle?.retention;
  }
  if (section === undefined) return { days: DEFAULT_RETENTION_DAYS, archiveRoot: DEFAULT_ARCHIVE_ROOT, keep: [] };
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    throw new Error(`${POLICY_FILE}: information_lifecycle.retention must be an object`);
  }
  const record = section as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!CONFIG_KEYS.has(key)) throw new Error(`${POLICY_FILE}: unknown information_lifecycle.retention key: ${key}`);
  }

  const days = record.days === undefined ? DEFAULT_RETENTION_DAYS : record.days;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
    throw new Error(`${POLICY_FILE}: information_lifecycle.retention.days must be a positive integer`);
  }
  const archiveRoot = record.archive_root === undefined ? DEFAULT_ARCHIVE_ROOT : repoRelative(record.archive_root, 'archive_root');
  for (const retentionClass of CLASSES) {
    if (overlaps(archiveRoot, retentionClass.dir)) {
      throw new Error(`${POLICY_FILE}: information_lifecycle.retention.archive_root overlaps scanned directory ${retentionClass.dir}`);
    }
  }
  const keepValue = record.keep === undefined ? [] : record.keep;
  if (!Array.isArray(keepValue)) throw new Error(`${POLICY_FILE}: information_lifecycle.retention.keep must be an array`);
  const keep = keepValue.map((value, index) => repoRelative(value, `keep[${index}]`));
  return { days, archiveRoot, keep };
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Paths among `paths` that Git ignores. */
function ignoredPaths(repoRoot: string, paths: readonly string[]): Set<string> {
  if (paths.length === 0) return new Set();
  // check-ignore exits 1 when it ignores none of the paths.
  const result = spawnSync('git', ['-C', repoRoot, 'check-ignore', '-z', '--stdin'], { input: paths.join('\0'), encoding: 'utf8' });
  if (result.status !== 0 && result.status !== 1) throw new Error(`git check-ignore failed: ${result.stderr.trim()}`);
  return new Set(result.stdout.split('\0').filter(Boolean));
}

/**
 * A symlink anywhere on a scanned or destination path could make a move act
 * on a file outside the class, such as an open tracked plan. Existing
 * components must be real directories.
 */
function assertNoSymlink(repoRoot: string, path: string): void {
  let current = repoRoot;
  for (const segment of path.split('/')) {
    current = join(current, segment);
    let stats: Stats;
    try {
      stats = lstatSync(current);
    } catch {
      return;
    }
    if (stats.isSymbolicLink()) throw new Error(`retention refuses a path through a symlink: ${path}`);
  }
}

/** True when a directory entry exists at `path`, a dangling symlink included. */
function occupied(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Last commit time in ms of every path under `dir`, newest commit first wins. */
function commitTimes(repoRoot: string, dir: string): Map<string, number> {
  const times = new Map<string, number>();
  // A repository without commits has no commit times; git log would fail.
  if (spawnSync('git', ['-C', repoRoot, 'rev-parse', '--verify', '--quiet', 'HEAD']).status !== 0) return times;
  let current = 0;
  const log = git(repoRoot, ['-c', 'core.quotePath=false', 'log', '--format=@%ct', '--name-only', '--', dir]);
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) current = Number(line.slice(1)) * 1000;
    else if (line !== '' && !times.has(line)) times.set(line, current);
  }
  return times;
}

/**
 * Newest time of any file in the entry, without following links. A tracked
 * file counts by its last commit; an untracked file by its mtime. An empty
 * directory counts by its own mtime.
 */
function newestTimeMs(absolute: string, path: string, entry: Stats, committed: ReadonlyMap<string, number>): number {
  if (!entry.isDirectory()) return committed.get(path) ?? entry.mtimeMs;
  const names = readdirSync(absolute);
  if (names.length === 0) return entry.mtimeMs;
  let newest = 0;
  for (const name of names) {
    const child = join(absolute, name);
    newest = Math.max(newest, newestTimeMs(child, `${path}/${name}`, lstatSync(child), committed));
  }
  return newest;
}

function touches(paths: ReadonlySet<string>, path: string): boolean {
  if (paths.has(path)) return true;
  for (const file of paths) if (file.startsWith(`${path}/`)) return true;
  return false;
}

export interface RetentionInput {
  readonly repoRoot: string;
  readonly apply: boolean;
  readonly now?: number;
}

/**
 * Selects closed artifacts older than the window and, with `apply`, moves each
 * to the same relative path under the archive root. A dry run reads only.
 */
export function runArtifactRetention(input: RetentionInput): RetentionReport {
  const { repoRoot, apply } = input;
  const now = input.now ?? Date.now();
  const config = readRetentionConfig(repoRoot);
  assertNoSymlink(repoRoot, config.archiveRoot);
  // The trailing slash lets a directory-only rule match a root that does not exist yet.
  if (!ignoredPaths(repoRoot, [`${config.archiveRoot}/`]).has(`${config.archiveRoot}/`)) {
    throw new Error(`archive root ${config.archiveRoot} is not gitignored; add it to .gitignore before running retention`);
  }
  const dirs = CLASSES.map((c) => c.dir);
  for (const dir of dirs) assertNoSymlink(repoRoot, dir);
  const tracked = new Set(git(repoRoot, ['ls-files', '-z', '--', ...dirs]).split('\0').filter(Boolean));
  // Staged, modified and deleted tracked paths; untracked files do not count.
  const changed = new Set(git(repoRoot, ['status', '--porcelain', '-z', '--no-renames', '--untracked-files=no', '--', ...dirs])
    .split('\0').filter(Boolean).map((record) => record.slice(3)));

  const selected: RetentionEntry[] = [];
  const skipped: (RetentionEntry & { reason: RetentionSkipReason })[] = [];
  for (const retentionClass of CLASSES) {
    const dir = resolveInsideRepo(repoRoot, retentionClass.dir).path!;
    if (!existsSync(dir)) continue;
    const committed = retentionClass.leavesGit ? commitTimes(repoRoot, retentionClass.dir) : new Map<string, number>();
    for (const name of readdirSync(dir).sort()) {
      const absolute = join(dir, name);
      const stats = lstatSync(absolute);
      if (!retentionClass.accepts(name, stats, absolute)) continue;
      const path = `${retentionClass.dir}/${name}`;
      const destination = `${config.archiveRoot}/${path}`;
      const ageDays = Math.floor((now - newestTimeMs(absolute, path, stats, committed)) / DAY_MS);
      const entry: RetentionEntry = { class: retentionClass.id, path, destination, ageDays, tracked: touches(tracked, path) };

      if (config.keep.some((kept) => overlaps(path, kept))) { skipped.push({ ...entry, reason: 'kept' }); continue; }
      if (entry.tracked && !retentionClass.leavesGit) { skipped.push({ ...entry, reason: 'tracked' }); continue; }
      if (touches(changed, path)) { skipped.push({ ...entry, reason: 'modified' }); continue; }
      if (ageDays < config.days) { skipped.push({ ...entry, reason: 'recent' }); continue; }
      if (occupied(resolveInsideRepo(repoRoot, destination).path!)) { skipped.push({ ...entry, reason: 'destination-exists' }); continue; }
      selected.push(entry);
    }
  }

  // An ignore exception below the root can expose one destination; check each before any move.
  const ignored = ignoredPaths(repoRoot, selected.map((entry) => entry.destination));
  const visible = selected.filter((entry) => !ignored.has(entry.destination));
  if (visible.length > 0) {
    throw new Error(`archive destinations are not gitignored: ${visible.map((entry) => entry.destination).join(', ')}`);
  }

  const archived: RetentionEntry[] = [];
  const failed: (RetentionEntry & { error: string })[] = [];
  for (const entry of selected) {
    if (apply) {
      const target = resolveInsideRepo(repoRoot, entry.destination).path!;
      try {
        assertNoSymlink(repoRoot, dirname(entry.destination));
        mkdirSync(dirname(target), { recursive: true });
        if (occupied(target)) throw new Error('destination appeared during the run');
        renameSync(resolveInsideRepo(repoRoot, entry.path).path!, target);
      } catch (error) {
        failed.push({ ...entry, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }
    archived.push(entry);
  }
  return { mode: apply ? 'apply' : 'dry-run', config, archived, skipped, failed };
}
