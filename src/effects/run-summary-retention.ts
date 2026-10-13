/**
 * One-release operator cleanup of the run summaries Stop used to write under
 * the policy `harness.runs_dir`. Stop no longer writes them; only
 * `scripts/evidence-gc.ts` calls this module, and both go away one release
 * after the Stop change.
 *
 * The non-obvious rule is which files this removes. Several writers share the
 * directory, and two of them produce durable evidence that a filename rule
 * cannot tell apart from the old Stop records:
 *
 * - `workflow_write_run_summary` in `assets/hooks/lib/workflow-state.sh`
 *   writes `${runId}.json` in the same shape as the retired Stop record --
 *   disposable session history with free-form `reason` values.
 * - `scripts/verify-sprint.sh` freezes an acceptance snapshot whose exact path a
 *   checks projection records in `.run_file` and reads back at finalization.
 *   Its `runId` prefix is the same as Stop's.
 * - `evidence/verification-execution.ts` writes an immutable
 *   `verification-${executionId}.json` that the evidence ledger binds by
 *   sha256; `readValidRunResult` treats a missing file as an absent baseline,
 *   which fails a `baseline_with_delta` criterion permanently, because a rerun
 *   only ever mints a new execution id.
 *
 * Deleting either evidence class strands an acceptance with no operator exit,
 * so this cleanup deletes only files whose content is the run-summary record: a
 * `run_id` plus the three resolved projection paths. Every field in that record
 * is a pointer that no code reads. Anything else in the directory belongs to
 * its own owner and is left alone.
 *
 * The discriminator is the shape, not `reason`. `reason` is free-form operator
 * text, so matching on one value would leave every other run summary in place.
 */
import { lstatSync, readdirSync, readFileSync, statSync, unlinkSync, type Dirent } from 'fs';
import { join } from 'path';
import { resolveInsideRepo } from './path-safety';

/** The resolved projection paths every run summary carries; see
 * `workflow_write_run_summary`. Present together only in that record. */
const RUN_SUMMARY_PATH_FIELDS = ['handoff_file', 'policy_file', 'context_map_file'] as const;

export interface RunSummaryRetentionInput {
  readonly repoRoot: string;
  /** Repo-relative, as resolved by the single `harness.runs_dir` reader. */
  readonly runsDir: string;
  readonly dryRun?: boolean;
}

export interface RunSummaryRetentionResult {
  /** Files positively identified as run summaries. */
  readonly scanned: number;
  /** Files left alone because they are not run summaries. */
  readonly foreign: number;
  /** Repo-relative paths removed, or that a dry run would remove. */
  readonly removed: readonly string[];
  readonly reclaimedBytes: number;
  /** Entries a fault prevented this sweep from classifying or removing. */
  readonly skipped: readonly string[];
}

const EMPTY: RunSummaryRetentionResult = {
  scanned: 0, foreign: 0, removed: [], reclaimedBytes: 0, skipped: [],
};

function resolveOrThrow(repoRoot: string, relativePath: string): string {
  const result = resolveInsideRepo(repoRoot, relativePath);
  if (!result.ok || !result.path) {
    throw new Error(result.error ?? `invalid run-summary path: ${relativePath}`);
  }
  return result.path;
}

/** True only for a record with the run-summary shape. */
function isRunSummary(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  if (typeof record.run_id !== 'string' || record.run_id === '') return false;
  return RUN_SUMMARY_PATH_FIELDS.every((field) => typeof record[field] === 'string');
}

/**
 * Removes every run summary. Only regular `*.json` files directly inside
 * `runsDir` are ever read: subdirectories (coordination state), the rotated
 * hook telemetry log, and verification failure `.log` diagnostics own their
 * own lifecycles.
 */
export function sweepRunSummaries(input: RunSummaryRetentionInput): RunSummaryRetentionResult {
  const runsDir = resolveOrThrow(input.repoRoot, input.runsDir);

  let names: readonly string[];
  try {
    names = readdirSync(runsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY;
    throw error;
  }

  const skipped: string[] = [];
  const removed: string[] = [];
  let scanned = 0;
  let foreign = 0;
  let reclaimedBytes = 0;
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const absolute = join(runsDir, name);
    let entry;
    try {
      entry = lstatSync(absolute);
    } catch {
      // Another writer removed it between readdir and stat; nothing to reclaim.
      continue;
    }
    if (!entry.isFile()) {
      skipped.push(`${name}: not a regular file`);
      continue;
    }
    let text: string;
    try {
      text = readFileSync(absolute, 'utf8');
    } catch (error) {
      skipped.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!isRunSummary(text)) { foreign++; continue; }
    scanned++;
    if (!input.dryRun) {
      try {
        unlinkSync(absolute);
      } catch (error) {
        skipped.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }
    removed.push(`${input.runsDir}/${name}`);
    reclaimedBytes += entry.size;
  }

  return { scanned, foreign, removed, reclaimedBytes, skipped };
}

/** Bytes currently held by a checkpoint directory, for gc reporting only. */
export function directoryBytes(path: string): number {
  let total = 0;
  let entries: readonly Dirent[];
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) { total += directoryBytes(child); continue; }
    if (!entry.isFile()) continue;
    try { total += statSync(child).size; } catch { /* removed mid-scan */ }
  }
  return total;
}
