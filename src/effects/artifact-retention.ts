/**
 * Local retention for finished harness artifacts (#697).
 *
 * Check logs, run records and finished fs-transaction backups accumulate on
 * disk. This module moves them into a gitignored local archive root once they
 * are older than the window. An archived entry is deleted once its newest file
 * is older than the archive window; nothing outside the archive root is ever
 * deleted.
 *
 * A check log under `.ai/harness/checks/` is finished once nothing has written
 * to it for the window. Open work lives elsewhere and is never scanned.
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
 * Every class is local-only: an entry with any tracked file is skipped, because
 * a move would be an unexpected deletion. The command does not stage or commit.
 *
 * An fs-transaction backup is a rollback source only while its transaction can
 * still be rolled back by manifest. After the window the operator restores an
 * archived backup by hand.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, type Stats } from 'fs';
import { dirname, join } from 'path';
import { FS_TRANSACTION_BACKUP_ROOT } from './fs-transaction';
import { ensureRepoRelativePath, resolveInsideRepo } from './path-safety';
import { gitExecFileSync, gitSpawnSync } from './git/runner';

export const DEFAULT_RETENTION_DAYS = 30;
/** Default time an archived entry stays in the archive root before it is deleted. */
const ARCHIVE_GRACE_DAYS = 60;
export const DEFAULT_ARCHIVE_DAYS = DEFAULT_RETENTION_DAYS + ARCHIVE_GRACE_DAYS;
export const DEFAULT_ARCHIVE_ROOT = '.ai/harness/archive/retention';
const POLICY_FILE = '.ai/harness/policy.json';
const CONFIG_KEYS = new Set(['days', 'archive_days', 'archive_root', 'keep']);
const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionClassId = 'check-logs' | 'run-records' | 'transaction-backups';

interface RetentionClass {
  readonly id: RetentionClassId;
  readonly dir: string;
  /** Which direct children of `dir` belong to the class. */
  readonly accepts: (name: string, entry: Stats, absolute: string) => boolean;
}

function isRunRecord(name: string, entry: Stats, absolute: string): boolean {
  if (entry.isFile()) return /^verification-vx-[0-9a-f]{20}\.log$/.test(name) || name.endsWith('-heartbeat-triage.json');
  return entry.isDirectory() && name.startsWith('contract-run-') && existsSync(join(absolute, 'manifest.json'));
}

export const RETENTION_CLASSES: readonly RetentionClass[] = [
  { id: 'check-logs', dir: '.ai/harness/checks', accepts: (name, entry) => entry.isFile() && name.endsWith('.log') },
  // The writers hard-code this directory, so `harness.runs_dir` does not apply.
  { id: 'run-records', dir: '.ai/harness/runs', accepts: isRunRecord },
  // A transaction directory, or a `.bak` written by a single atomic write.
  { id: 'transaction-backups', dir: FS_TRANSACTION_BACKUP_ROOT, accepts: (_name, entry) => entry.isFile() || entry.isDirectory() },
];

export interface RetentionConfig {
  readonly days: number;
  /** Days since the newest write after which an archived entry is deleted; greater than `days`. */
  readonly archiveDays: number;
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
  /** Whole days since the newest file in the entry was written. */
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
  /** Archived entries deleted, or that a dry run would delete. */
  readonly purged: readonly RetentionPurgeEntry[];
  /** Archived entries a delete failed for. */
  readonly purgeFailed: readonly (RetentionPurgeEntry & { readonly error: string })[];
}

export interface RetentionPurgeEntry {
  readonly class: RetentionClassId;
  /** Repo-relative path under the archive root. */
  readonly path: string;
  /** Whole days since the newest file in the entry was written. */
  readonly ageDays: number;
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
  if (section === undefined) {
    return { days: DEFAULT_RETENTION_DAYS, archiveDays: DEFAULT_ARCHIVE_DAYS, archiveRoot: DEFAULT_ARCHIVE_ROOT, keep: [] };
  }
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
  const archiveDays = record.archive_days === undefined ? days + ARCHIVE_GRACE_DAYS : record.archive_days;
  if (typeof archiveDays !== 'number' || !Number.isInteger(archiveDays) || archiveDays <= days) {
    throw new Error(`${POLICY_FILE}: information_lifecycle.retention.archive_days must be an integer greater than days`);
  }
  const archiveRoot = record.archive_root === undefined ? DEFAULT_ARCHIVE_ROOT : repoRelative(record.archive_root, 'archive_root');
  for (const retentionClass of RETENTION_CLASSES) {
    if (overlaps(archiveRoot, retentionClass.dir)) {
      throw new Error(`${POLICY_FILE}: information_lifecycle.retention.archive_root overlaps scanned directory ${retentionClass.dir}`);
    }
  }
  const keepValue = record.keep === undefined ? [] : record.keep;
  if (!Array.isArray(keepValue)) throw new Error(`${POLICY_FILE}: information_lifecycle.retention.keep must be an array`);
  const keep = keepValue.map((value, index) => repoRelative(value, `keep[${index}]`));
  return { days, archiveDays, archiveRoot, keep };
}

function git(repoRoot: string, args: readonly string[]): string {
  return gitExecFileSync(['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Paths among `paths` that Git ignores. */
function ignoredPaths(repoRoot: string, paths: readonly string[]): Set<string> {
  if (paths.length === 0) return new Set();
  // check-ignore exits 1 when it ignores none of the paths.
  const result = gitSpawnSync(['-C', repoRoot, 'check-ignore', '-z', '--stdin'], { input: paths.join('\0'), encoding: 'utf8' });
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

/**
 * Newest time of any file in the entry, without following links. An empty
 * directory counts by its own mtime.
 */
function newestTimeMs(absolute: string, entry: Stats): number {
  if (!entry.isDirectory()) return entry.mtimeMs;
  const names = readdirSync(absolute);
  if (names.length === 0) return entry.mtimeMs;
  let newest = 0;
  for (const name of names) {
    newest = Math.max(newest, newestTimeMs(join(absolute, name), lstatSync(join(absolute, name))));
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
 * Archived entries past the archive window. An entry is a direct child of a
 * class directory mirrored under the archive root, the unit a move created.
 * Selection reads the archive before any move, so a dry run and an apply agree.
 */
function selectPurges(repoRoot: string, config: RetentionConfig, now: number): RetentionPurgeEntry[] {
  const purges: RetentionPurgeEntry[] = [];
  for (const retentionClass of RETENTION_CLASSES) {
    const archived = `${config.archiveRoot}/${retentionClass.dir}`;
    assertNoSymlink(repoRoot, archived);
    const dir = resolveInsideRepo(repoRoot, archived).path!;
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const absolute = join(dir, name);
      const path = `${archived}/${name}`;
      if (config.keep.some((kept) => overlaps(`${retentionClass.dir}/${name}`, kept))) continue;
      const ageDays = Math.floor((now - newestTimeMs(absolute, lstatSync(absolute))) / DAY_MS);
      if (ageDays >= config.archiveDays) purges.push({ class: retentionClass.id, path, ageDays });
    }
  }
  const ignored = ignoredPaths(repoRoot, purges.map((entry) => entry.path));
  const visible = purges.filter((entry) => !ignored.has(entry.path));
  if (visible.length > 0) {
    throw new Error(`archived entries are not gitignored: ${visible.map((entry) => entry.path).join(', ')}`);
  }
  return purges;
}

/**
 * Selects closed artifacts older than the window and, with `apply`, moves each
 * to the same relative path under the archive root. It also selects archived
 * entries past the archive window and, with `apply`, deletes them. A dry run
 * reads only.
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
  const purges = selectPurges(repoRoot, config, now);
  const dirs = RETENTION_CLASSES.map((c) => c.dir);
  for (const dir of dirs) assertNoSymlink(repoRoot, dir);
  const tracked = new Set(git(repoRoot, ['ls-files', '-z', '--', ...dirs]).split('\0').filter(Boolean));
  // Staged, modified and deleted tracked paths; untracked files do not count.
  const changed = new Set(git(repoRoot, ['status', '--porcelain', '-z', '--no-renames', '--untracked-files=no', '--', ...dirs])
    .split('\0').filter(Boolean).map((record) => record.slice(3)));

  const selected: RetentionEntry[] = [];
  const skipped: (RetentionEntry & { reason: RetentionSkipReason })[] = [];
  for (const retentionClass of RETENTION_CLASSES) {
    const dir = resolveInsideRepo(repoRoot, retentionClass.dir).path!;
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const absolute = join(dir, name);
      const stats = lstatSync(absolute);
      if (!retentionClass.accepts(name, stats, absolute)) continue;
      const path = `${retentionClass.dir}/${name}`;
      const destination = `${config.archiveRoot}/${path}`;
      const ageDays = Math.floor((now - newestTimeMs(absolute, stats)) / DAY_MS);
      const entry: RetentionEntry = { class: retentionClass.id, path, destination, ageDays, tracked: touches(tracked, path) };

      if (config.keep.some((kept) => overlaps(path, kept))) { skipped.push({ ...entry, reason: 'kept' }); continue; }
      if (entry.tracked) { skipped.push({ ...entry, reason: 'tracked' }); continue; }
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

  const purged: RetentionPurgeEntry[] = [];
  const purgeFailed: (RetentionPurgeEntry & { error: string })[] = [];
  for (const entry of purges) {
    if (apply) {
      try {
        assertNoSymlink(repoRoot, dirname(entry.path));
        // rmSync removes a symlink itself and never follows one inside a directory.
        rmSync(resolveInsideRepo(repoRoot, entry.path).path!, { recursive: true });
      } catch (error) {
        purgeFailed.push({ ...entry, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
    }
    purged.push(entry);
  }
  return { mode: apply ? 'apply' : 'dry-run', config, archived, skipped, failed, purged, purgeFailed };
}
