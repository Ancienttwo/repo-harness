/**
 * Local retention for closed harness artifacts (#697).
 *
 * A consumer repository that keeps `plans/` and `tasks/` out of Git still
 * accumulates every closed plan, task record and check log on disk. This
 * module moves those artifacts into a gitignored local archive root once they
 * are older than the retention window. It never deletes anything: the operator
 * cleans the archive root.
 *
 * "Closed" is not inferred from file content. `archive-workflow.sh` is the only
 * writer that closes a plan and its task records, and it writes them as new
 * files under `plans/archive/` and `tasks/archive/`, so membership there is the
 * closed signal and the file time is the close time. A check log under
 * `.ai/harness/checks/` is finished once nothing has written to it for the
 * window. Open work lives elsewhere and is never scanned.
 *
 * Run snapshots under `.ai/harness/runs/` are out of scope: acceptance
 * snapshots and verification records there are bound by sha256 and read back
 * at finalization (see `run-summary-retention.ts`), so moving them by age
 * could strand an acceptance.
 *
 * An entry with any Git-tracked file is skipped. Moving it into an ignored
 * root would turn a local cleanup into a staged deletion.
 */
import { execFileSync } from 'child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, type Stats } from 'fs';
import { dirname, join } from 'path';
import { ensureRepoRelativePath, resolveInsideRepo } from './path-safety';

export const DEFAULT_RETENTION_DAYS = 30;
export const DEFAULT_ARCHIVE_ROOT = '.ai/harness/archive/retention';
const POLICY_FILE = '.ai/harness/policy.json';
const CONFIG_KEYS = new Set(['days', 'archive_root', 'keep']);
const DAY_MS = 24 * 60 * 60 * 1000;

export type RetentionClassId = 'closed-plans' | 'closed-task-records' | 'check-logs';

interface RetentionClass {
  readonly id: RetentionClassId;
  readonly dir: string;
  /** Which direct children of `dir` belong to the class. */
  readonly accepts: (name: string, entry: Stats) => boolean;
}

const CLASSES: readonly RetentionClass[] = [
  { id: 'closed-plans', dir: 'plans/archive', accepts: (_, entry) => entry.isFile() || entry.isDirectory() },
  { id: 'closed-task-records', dir: 'tasks/archive', accepts: (_, entry) => entry.isFile() || entry.isDirectory() },
  { id: 'check-logs', dir: '.ai/harness/checks', accepts: (name, entry) => entry.isFile() && name.endsWith('.log') },
];

export interface RetentionConfig {
  readonly days: number;
  /** Repo-relative; must be gitignored. */
  readonly archiveRoot: string;
  /** Repo-relative paths; an entry at, under or containing one is never moved. */
  readonly keep: readonly string[];
}

export type RetentionSkipReason = 'recent' | 'tracked' | 'kept' | 'destination-exists';

export interface RetentionEntry {
  readonly class: RetentionClassId;
  /** Repo-relative source path. */
  readonly path: string;
  /** Repo-relative destination under the archive root. */
  readonly destination: string;
  /** Whole days since the newest file in the entry was written. */
  readonly ageDays: number;
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

function repoRelative(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${POLICY_FILE}: information_lifecycle.retention.${field} must be a string`);
  const result = ensureRepoRelativePath(value.replace(/\/+$/, ''));
  if (!result.ok || !result.path) throw new Error(`${POLICY_FILE}: information_lifecycle.retention.${field}: ${result.error}`);
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

  const days = record.days ?? DEFAULT_RETENTION_DAYS;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
    throw new Error(`${POLICY_FILE}: information_lifecycle.retention.days must be a positive integer`);
  }
  const archiveRoot = record.archive_root === undefined ? DEFAULT_ARCHIVE_ROOT : repoRelative(record.archive_root, 'archive_root');
  for (const retentionClass of CLASSES) {
    if (overlaps(archiveRoot, retentionClass.dir)) {
      throw new Error(`${POLICY_FILE}: information_lifecycle.retention.archive_root overlaps scanned directory ${retentionClass.dir}`);
    }
  }
  const keepValue = record.keep ?? [];
  if (!Array.isArray(keepValue)) throw new Error(`${POLICY_FILE}: information_lifecycle.retention.keep must be an array`);
  const keep = keepValue.map((value, index) => repoRelative(value, `keep[${index}]`));
  return { days, archiveRoot, keep };
}

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function assertArchiveRootIgnored(repoRoot: string, archiveRoot: string): void {
  try {
    git(repoRoot, ['check-ignore', '-q', '--', `${archiveRoot}/.retention-probe`]);
  } catch {
    throw new Error(`archive root ${archiveRoot} is not gitignored; add it to .gitignore before running retention`);
  }
}

/** Newest mtime of any file or directory in the entry, without following links. */
function newestMtimeMs(path: string, entry: Stats): number {
  let newest = entry.mtimeMs;
  if (!entry.isDirectory()) return newest;
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    newest = Math.max(newest, newestMtimeMs(child, lstatSync(child)));
  }
  return newest;
}

function isTracked(tracked: ReadonlySet<string>, path: string): boolean {
  if (tracked.has(path)) return true;
  for (const file of tracked) if (file.startsWith(`${path}/`)) return true;
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
  assertArchiveRootIgnored(repoRoot, config.archiveRoot);
  const tracked = new Set(git(repoRoot, ['ls-files', '-z', '--', ...CLASSES.map((c) => c.dir)]).split('\0').filter(Boolean));

  const archived: RetentionEntry[] = [];
  const skipped: (RetentionEntry & { reason: RetentionSkipReason })[] = [];
  const failed: (RetentionEntry & { error: string })[] = [];
  for (const retentionClass of CLASSES) {
    const dir = resolveInsideRepo(repoRoot, retentionClass.dir).path!;
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const absolute = join(dir, name);
      const stats = lstatSync(absolute);
      if (!retentionClass.accepts(name, stats)) continue;
      const path = `${retentionClass.dir}/${name}`;
      const destination = `${config.archiveRoot}/${path}`;
      const ageDays = Math.floor((now - newestMtimeMs(absolute, stats)) / DAY_MS);
      const entry: RetentionEntry = { class: retentionClass.id, path, destination, ageDays };

      if (config.keep.some((kept) => overlaps(path, kept))) { skipped.push({ ...entry, reason: 'kept' }); continue; }
      if (isTracked(tracked, path)) { skipped.push({ ...entry, reason: 'tracked' }); continue; }
      if (ageDays < config.days) { skipped.push({ ...entry, reason: 'recent' }); continue; }
      const target = resolveInsideRepo(repoRoot, destination).path!;
      if (existsSync(target)) { skipped.push({ ...entry, reason: 'destination-exists' }); continue; }

      if (apply) {
        try {
          mkdirSync(dirname(target), { recursive: true });
          renameSync(absolute, target);
        } catch (error) {
          failed.push({ ...entry, error: error instanceof Error ? error.message : String(error) });
          continue;
        }
      }
      archived.push(entry);
    }
  }
  return { mode: apply ? 'apply' : 'dry-run', config, archived, skipped, failed };
}
