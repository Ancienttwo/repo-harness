/**
 * Retention for Stop's per-run summaries under the policy `harness.runs_dir`.
 *
 * `src/cli/hook/stop-handler.ts` writes one `${runId}.json` per Stop and, until
 * this module existed, nothing ever removed it. Its sibling
 * `hook-event-log.ts` already bounds the other unbounded file in the same
 * directory (the rotated hook telemetry log); this bounds the summaries.
 *
 * The bound is a count, not a byte budget: summaries are fixed-shape ~4 KB
 * records, so "how many runs of history" is the honest unit, and it mirrors
 * `HOOK_LOG_ARCHIVE_SEGMENTS` rather than adding a policy surface no second
 * consumer has asked for.
 *
 * The non-obvious rule is which files the count applies to. Several writers
 * share this directory, and two of them produce durable evidence that a
 * filename rule cannot tell apart from Stop churn:
 *
 * - `stop-handler.ts` and `workflow_write_run_summary` in
 *   `assets/hooks/lib/workflow-state.sh` both write `${runId}.json` in the same
 *   shape -- disposable session history. The shell writer is the larger
 *   producer by volume and supplies the free-form `reason` values.
 * - `scripts/verify-sprint.sh` freezes an acceptance snapshot whose exact path a
 *   checks projection records in `.run_file` and reads back at finalization.
 *   Its `runId` prefix is the same as Stop's.
 * - `evidence/verification-execution.ts` writes an immutable
 *   `verification-${executionId}.json` that the evidence ledger binds by
 *   sha256; `readValidRunResult` treats a missing file as an absent baseline,
 *   which fails a `baseline_with_delta` criterion permanently, because a rerun
 *   only ever mints a new execution id.
 *
 * Deleting either evidence class strands an acceptance with no operator exit, so
 * this sweep never reasons about what to keep. It deletes only files whose
 * content is the run-summary record `stop-handler.ts` itself writes: a `run_id`
 * plus the three resolved projection paths. Every field in that record is a
 * pointer recomputed from live policy on the next Stop, which is what makes the
 * record disposable; the other two shapes carry results. Anything else in the
 * directory -- including a shape a fourth writer adds later -- belongs to its
 * own owner and is left alone.
 *
 * The discriminator is the shape, not `reason`. `reason` is free-form operator
 * text (this repository's own history holds ~190 distinct values), so matching
 * on one value would leave every other run summary unreclaimable forever.
 */
import { lstatSync, readdirSync, readFileSync, statSync, unlinkSync, type Dirent } from 'fs';
import { join } from 'path';
import { resolveInsideRepo } from './path-safety';

/** Runs of Stop history retained. */
export const RUN_SUMMARY_RETENTION_COUNT = 200;

/** The resolved projection paths every run summary carries; see
 * `stop-handler.ts`'s `runSummaryContent` and `workflow_write_run_summary`.
 * Present together only in that record. */
const STOP_SUMMARY_PATH_FIELDS = ['handoff_file', 'policy_file', 'context_map_file'] as const;

export interface RunSummaryRetentionInput {
  readonly repoRoot: string;
  /** Repo-relative, as resolved by the single `harness.runs_dir` reader. */
  readonly runsDir: string;
  readonly retain?: number;
  readonly dryRun?: boolean;
}

export interface RunSummaryRetentionResult {
  /** Files positively identified as Stop summaries. */
  readonly scanned: number;
  /** Files left alone because they are not Stop summaries. */
  readonly foreign: number;
  readonly retained: number;
  /** Repo-relative paths removed, or that a dry run would remove. */
  readonly removed: readonly string[];
  readonly reclaimedBytes: number;
  /** Entries a fault prevented this sweep from classifying or removing. */
  readonly skipped: readonly string[];
}

const EMPTY: RunSummaryRetentionResult = {
  scanned: 0, foreign: 0, retained: 0, removed: [], reclaimedBytes: 0, skipped: [],
};

function resolveOrThrow(repoRoot: string, relativePath: string): string {
  const result = resolveInsideRepo(repoRoot, relativePath);
  if (!result.ok || !result.path) {
    throw new Error(result.error ?? `invalid run-summary retention path: ${relativePath}`);
  }
  return result.path;
}

/** True only for a record with Stop's own run-summary shape. */
function isStopSummary(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const record = parsed as Record<string, unknown>;
  if (typeof record.run_id !== 'string' || record.run_id === '') return false;
  return STOP_SUMMARY_PATH_FIELDS.every((field) => typeof record[field] === 'string');
}

interface Candidate {
  readonly name: string;
  readonly relative: string;
  readonly absolute: string;
  readonly mtimeMs: number;
  readonly size: number;
}

/**
 * Removes Stop run summaries beyond the newest `retain`. Only regular `*.json`
 * files directly inside `runsDir` are ever read: subdirectories
 * (`bash-output/`, coordination state), the rotated hook telemetry log, and
 * verification failure `.log` diagnostics own their own lifecycles.
 */
export function sweepRunSummaries(input: RunSummaryRetentionInput): RunSummaryRetentionResult {
  const retain = input.retain ?? RUN_SUMMARY_RETENTION_COUNT;
  if (retain < 0) throw new Error('run summary retention count must not be negative');
  const runsDir = resolveOrThrow(input.repoRoot, input.runsDir);

  let names: readonly string[];
  try {
    names = readdirSync(runsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY;
    throw error;
  }

  const skipped: string[] = [];
  const candidates: Candidate[] = [];
  let foreign = 0;
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
    if (!isStopSummary(text)) { foreign++; continue; }
    candidates.push({ name, relative: `${input.runsDir}/${name}`, absolute, mtimeMs: entry.mtimeMs, size: entry.size });
  }

  const obsolete = candidates
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(retain);
  const removed: string[] = [];
  let reclaimedBytes = 0;
  for (const candidate of obsolete) {
    if (input.dryRun) {
      removed.push(candidate.relative);
      reclaimedBytes += candidate.size;
      continue;
    }
    try {
      unlinkSync(candidate.absolute);
      removed.push(candidate.relative);
      reclaimedBytes += candidate.size;
    } catch (error) {
      skipped.push(`${candidate.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    scanned: candidates.length,
    foreign,
    retained: candidates.length - removed.length,
    removed,
    reclaimedBytes,
    skipped,
  };
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
