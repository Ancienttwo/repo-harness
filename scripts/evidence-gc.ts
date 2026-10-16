#!/usr/bin/env bun
/**
 * Reclaim obsolete harness evidence in a repository the Stop path can no longer
 * heal on its own.
 *
 * `checkpoint-store.ts` prunes superseded checkpoints inside every successful
 * publish. This command applies the same policy for the repositories that owner
 * never reaches -- a worktree whose ledger is gone (publication quietly skips),
 * a repository that stopped running the harness, or an operator who wants the
 * space back now rather than at the next Stop.
 *
 * Two one-release cleanups follow the hook wave that retired Stop run
 * summaries and the circuit kinds `guard`, `review`, `subagent`,
 * `cross-model-consult` and `minimal-change`. Both are deleted one release
 * later: nothing writes those records any more.
 */
import { readdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

type CheckpointStoreModule = typeof import("../src/effects/evidence/checkpoint-store");
type RunSummaryRetentionModule = typeof import("../src/effects/run-summary-retention");
type HarnessPathsModule = typeof import("../src/effects/state/resolve-effective-state");
type ExclusiveDirectoryLockModule = typeof import("../src/effects/locking/exclusive-directory-lock");

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = basename(SCRIPT_DIR) === "helpers"
  && basename(dirname(SCRIPT_DIR)) === "templates"
  && basename(dirname(dirname(SCRIPT_DIR))) === "assets"
  ? resolve(SCRIPT_DIR, "../../..")
  : resolve(SCRIPT_DIR, "..");

async function load<T>(...segments: readonly string[]): Promise<T> {
  return await import(pathToFileURL(join(PACKAGE_ROOT, ...segments)).href) as T;
}

function usage(): string {
  return [
    "usage: evidence-gc.ts [--repo <path>] [--dry-run] [--format text|json]",
    "",
    "Removes superseded evidence checkpoints.",
    "",
    "One-release cleanups (removed in the next release):",
    "  - deletes the run summaries nothing writes now; acceptance snapshots",
    "    and verification execution records are left to their owners;",
    "  - removes circuit-breaker entries of the retired kinds guard, review,",
    "    subagent, cross-model-consult and minimal-change, and deletes a",
    "    protocol-1 circuit-breaker state file.",
  ].join("\n");
}

function parseArgs(argv: readonly string[]): { repo: string; dryRun: boolean; format: "text" | "json" } {
  let repo = process.cwd();
  let dryRun = false;
  let format: "text" | "json" = "text";
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--dry-run") { dryRun = true; continue; }
    if (arg === "--repo" || arg === "--format") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      if (arg === "--repo") repo = value;
      else {
        if (value !== "text" && value !== "json") throw new Error("--format accepts text or json");
        format = value;
      }
      index++;
      continue;
    }
    throw new Error(`unexpected argument: ${arg}`);
  }
  return { repo: resolve(repo), dryRun, format };
}

/**
 * Bytes held by checkpoint directories the current marker does not name. The
 * naming rule comes from the store itself; only the "how much" is local. This
 * remains a reporting upper bound: the store additionally leaves any directory
 * holding an unexpected child, so a dry run may name more than a prune reclaims.
 */
function supersededCheckpoints(
  checkpointsDir: string,
  currentId: string | null,
  isCheckpointDirectoryName: (name: string) => boolean,
  sizeOf: (path: string) => number,
): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  let entries: readonly string[];
  try {
    entries = readdirSync(checkpointsDir);
  } catch {
    return { count, bytes };
  }
  for (const name of entries) {
    if (name === currentId || !isCheckpointDirectoryName(name)) continue;
    count++;
    bytes += sizeOf(join(checkpointsDir, name));
  }
  return { count, bytes };
}

const CIRCUIT_STATE_PATH = ".ai/harness/state/circuit-breaker.json";
/** The circuit breaker's own lock, so a hook write cannot interleave with this rewrite. */
const CIRCUIT_LOCK_PATH = `${CIRCUIT_STATE_PATH}.lock`;
const LIVE_CIRCUIT_KINDS: ReadonlySet<string> = new Set(["semantic-review"]);
const RETIRED_CIRCUIT_KINDS: ReadonlySet<string> = new Set(["guard", "review", "subagent", "cross-model-consult", "minimal-change", "repair"]);

interface CircuitCleanup {
  readonly action: "none" | "removed-retired-kinds" | "deleted-protocol-1";
  readonly removed_kinds: readonly string[];
}

/**
 * Reads the circuit-breaker JSON shape directly. An entry kind that is neither
 * live nor retired, or an envelope this cleanup does not know, stops the
 * cleanup with an error and leaves the file unchanged.
 */
function planCircuitCleanup(statePath: string): { cleanup: CircuitCleanup; next: Record<string, unknown> | null } {
  let raw: string;
  try {
    raw = readFileSync(statePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { cleanup: { action: "none", removed_kinds: [] }, next: null };
    throw error;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid state envelope");
  const envelope = parsed as Record<string, unknown>;
  if (envelope.protocol === 1) return { cleanup: { action: "deleted-protocol-1", removed_kinds: [] }, next: null };
  if (envelope.protocol !== 2) throw new Error(`unsupported state protocol: ${String(envelope.protocol)}`);
  const entries = envelope.entries;
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("invalid protocol-2 entries");
  const kept: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const [kind, entry] of Object.entries(entries)) {
    if (RETIRED_CIRCUIT_KINDS.has(kind)) removed.push(kind);
    else if (LIVE_CIRCUIT_KINDS.has(kind)) kept[kind] = entry;
    else throw new Error(`unknown circuit kind: ${kind}`);
  }
  if (removed.length === 0) return { cleanup: { action: "none", removed_kinds: [] }, next: null };
  return { cleanup: { action: "removed-retired-kinds", removed_kinds: removed.sort() }, next: { ...envelope, entries: kept } };
}

function cleanCircuitState(repo: string, dryRun: boolean, locking: ExclusiveDirectoryLockModule): CircuitCleanup {
  const root = realpathSync(repo);
  const statePath = join(root, CIRCUIT_STATE_PATH);
  const planned = planCircuitCleanup(statePath).cleanup;
  if (dryRun || planned.action === "none") return planned;
  // Plan again under the lock: a hook may have written the file in between.
  return locking.withExclusiveDirectoryLock(root, CIRCUIT_LOCK_PATH, () => {
    const { cleanup, next } = planCircuitCleanup(statePath);
    if (cleanup.action === "deleted-protocol-1") unlinkSync(statePath);
    if (cleanup.action === "removed-retired-kinds") {
      const temporary = `${statePath}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      renameSync(temporary, statePath);
    }
    return cleanup;
  });
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function circuitLine(circuit: CircuitCleanup | null, dryRun: boolean): string {
  if (!circuit) return "not cleaned";
  const prefix = dryRun ? "would " : "";
  if (circuit.action === "deleted-protocol-1") return `${prefix}delete the protocol-1 state file`;
  if (circuit.action === "removed-retired-kinds") return `${prefix}remove retired kinds ${circuit.removed_kinds.join(", ")}`;
  return "no retired state";
}

async function main(argv: readonly string[]): Promise<number> {
  let options: ReturnType<typeof parseArgs>;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`evidence-gc: ${error instanceof Error ? error.message : String(error)}\n${usage()}\n`);
    return 2;
  }

  const checkpointStore = await load<CheckpointStoreModule>("src", "effects", "evidence", "checkpoint-store.ts");
  const retention = await load<RunSummaryRetentionModule>("src", "effects", "run-summary-retention.ts");
  const harness = await load<HarnessPathsModule>("src", "effects", "state", "resolve-effective-state.ts");
  const locking = await load<ExclusiveDirectoryLockModule>("src", "effects", "locking", "exclusive-directory-lock.ts");

  const errors: string[] = [];

  // Reuse the single `harness.runs_dir` reader rather than adding a second
  // policy reading of the same datum.
  const paths = harness.resolveHarnessPaths(options.repo);

  const checkpointsDir = checkpointStore.resolveCheckpointsDir(options.repo);
  const before = retention.directoryBytes(checkpointsDir);
  let checkpointsRemoved = 0;
  let checkpointBytes = 0;
  try {
    if (options.dryRun) {
      const current = checkpointStore.resolveLastPublishedCheckpoint(options.repo);
      // A missing marker keeps every checkpoint: the store refuses to delete the
      // last durable copy when it cannot prove which one is live.
      if (current.found) {
        const superseded = supersededCheckpoints(
          checkpointsDir,
          current.resolved.checkpointId,
          checkpointStore.isCheckpointDirectoryName,
          retention.directoryBytes,
        );
        checkpointsRemoved = superseded.count;
        checkpointBytes = superseded.bytes;
      }
    } else {
      const result = checkpointStore.pruneCheckpointCache(options.repo);
      checkpointsRemoved = result.removed;
      checkpointBytes = Math.max(0, before - retention.directoryBytes(checkpointsDir));
      for (const entry of result.skipped) errors.push(`checkpoint ${entry}`);
    }
  } catch (error) {
    errors.push(`checkpoints: ${error instanceof Error ? error.message : String(error)}`);
  }

  let summaries: Awaited<ReturnType<RunSummaryRetentionModule["sweepRunSummaries"]>> | null = null;
  try {
    summaries = retention.sweepRunSummaries({
      repoRoot: options.repo,
      runsDir: paths.runsDir,
      dryRun: options.dryRun,
    });
    for (const entry of summaries.skipped) errors.push(`run summary ${entry}`);
  } catch (error) {
    errors.push(`run summaries: ${error instanceof Error ? error.message : String(error)}`);
  }

  let circuit: CircuitCleanup | null = null;
  try {
    circuit = cleanCircuitState(options.repo, options.dryRun, locking);
  } catch (error) {
    errors.push(`circuit breaker ${CIRCUIT_STATE_PATH}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const reclaimed = checkpointBytes + (summaries?.reclaimedBytes ?? 0);
  const report = {
    repo: options.repo,
    dry_run: options.dryRun,
    checkpoints: { removed: checkpointsRemoved, reclaimed_bytes: checkpointBytes },
    run_summaries: {
      scanned: summaries?.scanned ?? 0,
      foreign: summaries?.foreign ?? 0,
      removed: summaries?.removed.length ?? 0,
      reclaimed_bytes: summaries?.reclaimedBytes ?? 0,
    },
    circuit_breaker: circuit,
    reclaimed_bytes: reclaimed,
    errors,
  };

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    const verb = options.dryRun ? "reclaimable" : "reclaimed";
    process.stdout.write([
      `evidence-gc ${options.repo}${options.dryRun ? " (dry run)" : ""}`,
      `  checkpoints:   ${checkpointsRemoved} ${options.dryRun ? "superseded" : "removed"}, ${human(checkpointBytes)} ${verb}`,
      `  run summaries: ${summaries?.removed.length ?? 0} of ${summaries?.scanned ?? 0} ${options.dryRun ? "removable" : "removed"} `
        + `(${summaries?.foreign ?? 0} other records left to their own owners), `
        + `${human(summaries?.reclaimedBytes ?? 0)} ${verb}`,
      `  circuit breaker: ${circuitLine(circuit, options.dryRun)}`,
      `  total:         ${human(reclaimed)} ${verb}`,
      ...errors.map((entry) => `  ! ${entry}`),
    ].join("\n") + "\n");
  }

  return errors.length > 0 ? 1 : 0;
}

process.exit(await main(process.argv.slice(2)));
