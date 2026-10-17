/**
 * Checkpoint materialization store (Sprint C backlog row 10 / D1 compaction
 * anchor). One transaction: stage the machine projection + derived human
 * view into a temp staging directory, validate the staged bytes
 * (schema-complete, content_hash self-consistent, human view re-derivable
 * byte-identically from the staged machine file), then atomically rename
 * into a content-addressed location and update a `last-published` marker
 * that always points at the newest complete checkpoint. Any validation
 * failure rejects the whole stage -- nothing is published, the marker is
 * never touched, and any prior published checkpoint stays exactly as it
 * was. The marker itself is updated via the `session-context-budget.ts`
 * temp-file+rename precedent; the fold this module publishes comes from
 * EPC-01's `readAcceptedEvents` (read-only import, never modified here).
 *
 * Reader discipline: `resolveLastPublishedCheckpoint` resolves the marker,
 * then loads + validates the checkpoint it names. It never scans this
 * directory for "the newest" checkpoint by mtime or filename -- the marker
 * is the sole authority (the same append-position-not-mtime discipline D7
 * already applies to event selection, applied here to checkpoint
 * resolution). A missing marker is a benign "nothing published yet"; a
 * marker naming a checkpoint that fails validation is a dangling pointer
 * and fails closed with a typed `CheckpointResolutionError`.
 *
 * Redaction note: this module's machine JSON is a projection this store
 * writes directly -- it is NOT an `EvidenceEvent` payload and never goes
 * through `event-writer.ts`'s `buildEvidenceEvent` construction path, so it
 * never passes through D6's redaction pass. This is safe because a
 * checkpoint contains event metadata and decision payloads that the event
 * writer already redacted. Blob payloads pass an integrity check before use.
 */
import { createHash, randomBytes } from "crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  mkdirSync,
  lstatSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { resolveInsideRepo } from "../path-safety";
import { readAcceptedEvents } from "./event-log";
import { resolveBlobsDir, resolveLogPath } from "./paths";
import type { EvidenceEventRecord } from "../../core/evidence/types";
import { readCheckpointSnapshot } from "./checkpoint-snapshot";
import { acquireExclusiveDirectoryLock } from "../locking/exclusive-directory-lock";
import { canonicalize } from "../../core/evidence/canonical-json";
import {
  buildCheckpointProjection,
  checkpointBodyHashHex,
  renderCheckpointMarkdown,
  CHECKPOINT_ID_PREFIX,
  CHECKPOINT_SCHEMA_NAME,
  CHECKPOINT_DECISION_LIMIT,
  isDecisionPayload,
  type CheckpointProjection,
} from "../../core/evidence/checkpoint";

export const CHECKPOINTS_DIR_RELATIVE = ".ai/harness/evidence/checkpoints";
/** The human-view filename. Referenced ONLY here (this store's own write
 * path) and in the reader below -- `tests/evidence-checkpoint.test.ts` greps
 * `src/` + `scripts/` for this exact literal to prove nothing else ever
 * reads it back. */
export const CHECKPOINT_HUMAN_FILENAME = "checkpoint.md";
export const CHECKPOINT_MACHINE_FILENAME = "checkpoint.json";
export const CHECKPOINT_MARKER_RELATIVE = `${CHECKPOINTS_DIR_RELATIVE}/last-published.json`;

/** The one naming rule for a published checkpoint directory. Exported so a
 * reporter cannot drift from the selection this store's own retention makes. */
export function isCheckpointDirectoryName(name: string): boolean {
  return /^chk-[0-9a-f]{64}$/.test(name);
}
const STAGING_DIR_NAME = ".staging";
const CHECKPOINT_LOCK = `${CHECKPOINTS_DIR_RELATIVE}/.publish.lock`;

function withCheckpointLock<T>(repoRoot: string, operation: (assertOwned: () => void) => T): T {
  const lock = acquireExclusiveDirectoryLock(realpathSync(repoRoot), CHECKPOINT_LOCK, {
    reclaimStaleEmptyDirectory: true,
  });
  try {
    lock.assertOwned();
    return operation(() => lock.assertOwned());
  } finally { lock.release(); }
}

export interface CheckpointRetentionResult {
  readonly removed: number;
  readonly skipped: readonly string[];
}

export interface CheckpointSyncPlan {
  readonly fileOpenFlags: number;
  readonly syncDirectories: boolean;
}

/**
 * Durability is the same policy on every platform -- flush the published
 * bytes before anything may collect the previous copy -- but the syscall
 * boundary differs. On win32 fsync is `FlushFileBuffers`, which needs a
 * handle opened with write access (a read-only handle fails EPERM) and
 * cannot flush a directory handle at all; NTFS journals the rename metadata
 * a POSIX directory fsync would cover, so Windows durability is "flush the
 * file, skip the directory". `O_NOFOLLOW` does not exist on win32. Kept a
 * pure function of the platform string so both branches stay asserted from
 * any host; the failure it prevents is a thrown EPERM that Stop swallows,
 * which would silently stop checkpoint publication on Windows.
 */
export function checkpointSyncPlan(platform: string): CheckpointSyncPlan {
  if (platform === "win32") return { fileOpenFlags: constants.O_RDWR, syncDirectories: false };
  return { fileOpenFlags: constants.O_RDONLY | constants.O_NOFOLLOW, syncDirectories: true };
}

const CHECKPOINT_SYNC = checkpointSyncPlan(process.platform);

function syncCheckpointFile(path: string): void {
  const fd = openSync(path, CHECKPOINT_SYNC.fileOpenFlags);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function syncCheckpointDirectory(path: string): void {
  if (!CHECKPOINT_SYNC.syncDirectories) return;
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function persistCheckpointDirectory(repoRoot: string, checkpointId: string): void {
  const directory = join(resolveCheckpointsDir(repoRoot), checkpointId);
  syncCheckpointFile(join(directory, CHECKPOINT_MACHINE_FILENAME));
  syncCheckpointFile(join(directory, CHECKPOINT_HUMAN_FILENAME));
  syncCheckpointDirectory(directory);
  syncCheckpointDirectory(resolveCheckpointsDir(repoRoot));
}

function persistCheckpointMarker(repoRoot: string): void {
  syncCheckpointFile(resolveCheckpointMarkerPath(repoRoot));
  syncCheckpointDirectory(resolveCheckpointsDir(repoRoot));
}

/** Only the current marker is live. The append-only ledger owns audit history. */
function collectObsoleteCheckpoints(repoRoot: string, currentId: string, assertOwned: () => void): CheckpointRetentionResult {
  const directory = resolveCheckpointsDir(repoRoot);
  let removed = 0;
  const skipped: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === currentId || !isCheckpointDirectoryName(entry.name)) continue;
    const path = join(directory, entry.name);
    try {
      if (!entry.isDirectory()) { skipped.push(entry.name); continue; }
      const children = readdirSync(path).sort();
      const owned = [CHECKPOINT_MACHINE_FILENAME, CHECKPOINT_HUMAN_FILENAME].sort();
      // A killed collector may have already unlinked one or both owned files.
      if (children.some(name => !owned.includes(name))
        || children.some(name => !lstatSync(join(path, name)).isFile())) {
        skipped.push(entry.name);
        continue;
      }
      assertOwned();
      // Unlink only the two owned files: an unexpected child is never recursively deleted.
      for (const name of children) unlinkSync(join(path, name));
      rmdirSync(path);
      removed++;
    } catch (error) {
      skipped.push(`${entry.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { removed, skipped };
}

/** Explicit maintenance uses the same validated marker and lock as publication. */
export function pruneCheckpointCache(repoRoot: string): CheckpointRetentionResult {
  return withCheckpointLock(repoRoot, assertOwned => {
    const current = resolveLastPublishedCheckpoint(repoRoot);
    if (!current.found) return { removed: 0, skipped: [] };
    persistCheckpointDirectory(repoRoot, current.resolved.checkpointId);
    persistCheckpointMarker(repoRoot);
    return collectObsoleteCheckpoints(repoRoot, current.resolved.checkpointId, assertOwned);
  });
}

function resolveOrThrow(repoRoot: string, relativePath: string): string {
  const result = resolveInsideRepo(repoRoot, relativePath);
  if (!result.ok || !result.path) throw new Error(result.error ?? `invalid checkpoint store path: ${relativePath}`);
  return result.path;
}

export function resolveCheckpointsDir(repoRoot: string): string {
  return resolveOrThrow(repoRoot, CHECKPOINTS_DIR_RELATIVE);
}

export function resolveCheckpointMarkerPath(repoRoot: string): string {
  return resolveOrThrow(repoRoot, CHECKPOINT_MARKER_RELATIVE);
}

interface CheckpointMarker {
  readonly schema_version: 1;
  readonly checkpoint_id: string;
  readonly checkpoint_dir: string;
  readonly machine_path: string;
  readonly human_path: string;
  readonly content_hash: string;
  readonly published_at: string;
}

export class CheckpointResolutionError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = "CheckpointResolutionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTextOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return null;
  }
}

/** Schema-completeness check on a parsed staged/published machine
 * projection -- every D8 provenance field plus the checkpoint's own
 * required top-level fields must be present with the right shape before
 * anything gets published or resolved. Deliberately shallow (does not
 * deep-validate every array element), matching this repo's existing
 * pragmatic validation style (`fold.ts`'s `isValidEvidenceEvent`). */
function isSchemaCompleteCheckpoint(value: unknown): value is CheckpointProjection {
  if (!isRecord(value)) return false;
  if (value.schema !== CHECKPOINT_SCHEMA_NAME) return false;
  if (typeof value.checkpoint_id !== "string" || value.checkpoint_id.length === 0) return false;
  if (typeof value.worktree_id !== "string" || value.worktree_id.length === 0) return false;
  if (typeof value.covered_event_count !== "number") return false;
  if (!Array.isArray(value.covered_events)) return false;
  if (!Array.isArray(value.latest_by_event_type)) return false;
  if (value.decisions !== undefined) {
    if (!Array.isArray(value.decisions) || value.decisions.length > CHECKPOINT_DECISION_LIMIT) return false;
    if (!value.decisions.every(row => isRecord(row) && isDecisionPayload(row)
      && typeof row.event_id === "string" && /^evt-[0-9A-HJKMNP-TV-Z]{26}$/.test(row.event_id)
      && typeof row.created_at === "string" && Number.isFinite(Date.parse(row.created_at))
      && Array.isArray(row.supersedes) && row.supersedes.every(id => typeof id === "string" && /^evt-[0-9A-HJKMNP-TV-Z]{26}$/.test(id)))) return false;
  }
  const provenance = value.provenance;
  if (!isRecord(provenance)) return false;
  const requiredProvenanceFields = [
    "schema_version",
    "generated_at",
    "materializer_version",
    "source_event_ids",
    "source_checkpoint_id",
    "subject_hash",
    "content_hash",
    "worktree_id",
    "contract_id",
  ] as const;
  for (const field of requiredProvenanceFields) {
    if (!(field in provenance)) return false;
  }
  if (!Array.isArray(provenance.source_event_ids)) return false;
  if (typeof provenance.content_hash !== "string" || !provenance.content_hash.startsWith("sha256:")) return false;
  return true;
}

type ValidationResult =
  | { readonly ok: true; readonly projection: CheckpointProjection }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

/**
 * Re-reads staged (or published) bytes and validates them from scratch --
 * never trusts the in-memory object that produced them. This is what lets
 * the atomicity tests exercise the gate directly with deliberately corrupt
 * or mismatched bytes, and what makes a hand-edited human view detectable
 * (its re-derived Markdown will not byte-match the tampered file).
 */
function validateStagedCheckpoint(
  expectedCheckpointId: string,
  machineJsonText: string,
  humanMarkdownText: string,
): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(machineJsonText);
  } catch (error) {
    return {
      ok: false,
      reason: "machine-json-unparseable",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  if (!isSchemaCompleteCheckpoint(parsed)) {
    return { ok: false, reason: "schema-incomplete", detail: "staged machine projection is missing a required field" };
  }
  if (parsed.checkpoint_id !== expectedCheckpointId) {
    return {
      ok: false,
      reason: "checkpoint-id-mismatch",
      detail: `staged checkpoint_id ${parsed.checkpoint_id} does not match expected ${expectedCheckpointId}`,
    };
  }
  if (parsed.provenance.source_checkpoint_id !== parsed.checkpoint_id) {
    return {
      ok: false,
      reason: "provenance-self-reference-broken",
      detail: "provenance.source_checkpoint_id must equal checkpoint_id",
    };
  }
  const recomputedHashHex = checkpointBodyHashHex({
    worktree_id: parsed.worktree_id,
    covered_event_count: parsed.covered_event_count,
    covered_events: parsed.covered_events,
    latest_by_event_type: parsed.latest_by_event_type,
    decisions: parsed.decisions,
  });
  const recomputedContentHash = `sha256:${recomputedHashHex}`;
  if (parsed.provenance.content_hash !== recomputedContentHash) {
    return {
      ok: false,
      reason: "content-hash-mismatch",
      detail: `staged content_hash ${parsed.provenance.content_hash} does not match recomputed ${recomputedContentHash}`,
    };
  }
  if (parsed.checkpoint_id !== `${CHECKPOINT_ID_PREFIX}${recomputedHashHex}`) {
    return {
      ok: false,
      reason: "checkpoint-id-not-content-addressed",
      detail: "checkpoint_id does not match the content-addressed id derived from its own body",
    };
  }
  const rederivedMarkdown = renderCheckpointMarkdown(parsed);
  if (rederivedMarkdown !== humanMarkdownText) {
    return {
      ok: false,
      reason: "human-view-mismatch",
      detail: "staged human view does not byte-match the machine projection's own rendering",
    };
  }
  return { ok: true, projection: parsed };
}

function rmDirSafe(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; a failed removal never blocks the caller's own
    // success/failure result, and never leaves the marker pointed at
    // unvalidated content (the marker update happens strictly after this).
  }
}

function isCompleteCheckpointDir(dir: string, checkpointId: string): boolean {
  const machineText = readTextOrNull(join(dir, CHECKPOINT_MACHINE_FILENAME));
  const humanText = readTextOrNull(join(dir, CHECKPOINT_HUMAN_FILENAME));
  if (machineText === null || humanText === null) return false;
  return validateStagedCheckpoint(checkpointId, machineText, humanText).ok;
}

function writeMarker(repoRoot: string, marker: CheckpointMarker): void {
  const target = resolveCheckpointMarkerPath(repoRoot);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  writeFileSync(temp, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
}

// ---------------------------------------------------------------------------
// Low-level: publish exact bytes under an exact checkpoint id.
// ---------------------------------------------------------------------------

export interface PublishCheckpointBytesInput {
  readonly repoRoot: string;
  readonly checkpointId: string;
  readonly machineJson: string;
  readonly humanMarkdown: string;
}

export type PublishCheckpointResult =
  | { readonly status: "published"; readonly checkpointId: string; readonly idempotent: boolean; readonly contentHash: string; readonly retention: CheckpointRetentionResult }
  | { readonly status: "rejected"; readonly reason: string; readonly detail: string };

/**
 * The store's one disk-writing publish transaction, over exact given bytes.
 * `publishCheckpointFromLedger` below is the convenience wrapper real
 * callers (Stop wiring) use; this lower-level function exists so tests can
 * exercise the staging/validation/atomicity gate directly with deliberately
 * corrupt or mismatched bytes.
 */
export function publishCheckpoint(input: PublishCheckpointBytesInput): PublishCheckpointResult {
  return withCheckpointLock(input.repoRoot, assertOwned => publishCheckpointLocked(input, assertOwned));
}

function publishCheckpointLocked(input: PublishCheckpointBytesInput, assertOwned: () => void): PublishCheckpointResult {
  const validation = validateStagedCheckpoint(input.checkpointId, input.machineJson, input.humanMarkdown);
  if (!validation.ok) return { status: "rejected", reason: validation.reason, detail: validation.detail };
  const checkpointsDir = resolveCheckpointsDir(input.repoRoot);
  const targetDir = join(checkpointsDir, input.checkpointId);
  const idempotent = isCompleteCheckpointDir(targetDir, input.checkpointId);
  let stagingDir: string | null = null;
  try {
    if (!idempotent) {
      const stagingRoot = join(checkpointsDir, STAGING_DIR_NAME);
      mkdirSync(stagingRoot, { recursive: true });
      stagingDir = mkdtempSync(join(stagingRoot, "stage-"));
      writeFileSync(join(stagingDir, CHECKPOINT_MACHINE_FILENAME), input.machineJson, { mode: 0o600 });
      writeFileSync(join(stagingDir, CHECKPOINT_HUMAN_FILENAME), input.humanMarkdown, { mode: 0o600 });
      assertOwned();
      if (existsSync(targetDir)) rmDirSafe(targetDir);
      renameSync(stagingDir, targetDir);
      stagingDir = null;
    }
    // Atomic visibility alone cannot authorize deleting the last durable copy.
    // Also seals an existing directory created by an older publisher.
    persistCheckpointDirectory(input.repoRoot, input.checkpointId);
    const markerText = readTextOrNull(resolveCheckpointMarkerPath(input.repoRoot));
    let alreadyCurrent = false;
    try {
      const marker = JSON.parse(markerText ?? "null") as CheckpointMarker | null;
      alreadyCurrent = marker?.checkpoint_id === input.checkpointId
        && marker.machine_path === `${CHECKPOINTS_DIR_RELATIVE}/${input.checkpointId}/${CHECKPOINT_MACHINE_FILENAME}`
        && marker.human_path === `${CHECKPOINTS_DIR_RELATIVE}/${input.checkpointId}/${CHECKPOINT_HUMAN_FILENAME}`
        && marker.content_hash === validation.projection.provenance.content_hash;
    } catch { /* A validated publication repairs a malformed marker. */ }
    assertOwned();
    if (!alreadyCurrent) writeMarker(input.repoRoot, {
      schema_version: 1,
      checkpoint_id: input.checkpointId,
      checkpoint_dir: `${CHECKPOINTS_DIR_RELATIVE}/${input.checkpointId}`,
      machine_path: `${CHECKPOINTS_DIR_RELATIVE}/${input.checkpointId}/${CHECKPOINT_MACHINE_FILENAME}`,
      human_path: `${CHECKPOINTS_DIR_RELATIVE}/${input.checkpointId}/${CHECKPOINT_HUMAN_FILENAME}`,
      content_hash: validation.projection.provenance.content_hash,
      published_at: new Date().toISOString(),
    });
    persistCheckpointMarker(input.repoRoot);
    const retention = collectObsoleteCheckpoints(input.repoRoot, input.checkpointId, assertOwned);
    return { status: "published", checkpointId: input.checkpointId, idempotent,
      contentHash: validation.projection.provenance.content_hash, retention };
  } finally {
    if (stagingDir) rmDirSafe(stagingDir);
  }
}

// ---------------------------------------------------------------------------
// High-level: fold the current ledger and publish it. Stop wiring calls
// this; it never throws for the ordinary "no ledger yet" case.
// ---------------------------------------------------------------------------

export type PublishCheckpointFromLedgerResult =
  | { readonly status: "skipped"; readonly reason: "no-ledger" }
  | PublishCheckpointResult;

/**
 * Convenience wrapper real producers (Stop wiring) call: reads the
 * per-worktree accepted event set (EPC-01, read-only), skips quietly when
 * the worktree has no ledger yet (cannot-bind discipline -- a fresh
 * worktree with no genesis record has nothing to checkpoint), otherwise
 * builds the pure projection and publishes it through the same
 * stage/validate/rename/marker transaction as `publishCheckpoint`.
 */
/** Resolve the same redacted payload for the CLI and the checkpoint. */
export function readDecisionPayload(repoRoot: string, event: EvidenceEventRecord): unknown {
  if (event.payload !== undefined) return event.payload;
  const digest = event.blob_sha256;
  if (!digest || !/^[0-9a-f]{64}$/.test(digest) || event.content_type !== "application/json") {
    throw new Error(`invalid decision blob reference: ${event.event_id}`);
  }
  const bytes = readFileSync(join(resolveBlobsDir(repoRoot), digest));
  if (createHash("sha256").update(bytes).digest("hex") !== digest
    || event.payload_hash !== `sha256:${digest}` || event.blob_bytes !== bytes.length) {
    throw new Error(`decision blob integrity check failed: ${event.event_id}`);
  }
  return JSON.parse(bytes.toString("utf8"));
}

export function publishCheckpointFromLedger(
  repoRoot: string,
  now?: () => Date,
): PublishCheckpointFromLedgerResult {
  if (!existsSync(resolveLogPath(repoRoot))) return { status: "skipped", reason: "no-ledger" };
  return withCheckpointLock(repoRoot, assertOwned => {
    const { genesis, accepted } = readAcceptedEvents(repoRoot);
    if (!genesis) return { status: "skipped", reason: "no-ledger" };
    const projection = buildCheckpointProjection({
      worktreeId: genesis.worktree_id, now, decisionPayloadOf: event => readDecisionPayload(repoRoot, event),
    }, accepted);
    return publishCheckpointLocked({
      repoRoot,
      checkpointId: projection.checkpoint_id,
      machineJson: `${JSON.stringify(projection, null, 2)}\n`,
      humanMarkdown: renderCheckpointMarkdown(projection),
    }, assertOwned);
  });
}

// ---------------------------------------------------------------------------
// Reader API.
// ---------------------------------------------------------------------------

export interface ResolvedCheckpoint {
  readonly checkpointId: string;
  readonly projection: CheckpointProjection;
  readonly humanView: string;
  readonly machinePath: string;
  readonly humanPath: string;
}

export type ResolveLastPublishedCheckpointResult =
  | { readonly found: false }
  | { readonly found: true; readonly resolved: ResolvedCheckpoint };

/**
 * Reader API: resolve the marker, then load + validate the checkpoint it
 * names. Never scans the checkpoints directory for "the newest" -- see
 * module doc. A missing marker is a benign "nothing published yet"
 * (`found: false`, e.g. a brand-new worktree before its first Stop). A
 * marker that names a checkpoint failing validation (missing files,
 * unparseable JSON, incomplete schema, or a content_hash mismatch) is a
 * dangling pointer and fails closed with a typed `CheckpointResolutionError`
 * -- never a fallback scan, never a stale/partial result.
 */
export function resolveLastPublishedCheckpoint(repoRoot: string): ResolveLastPublishedCheckpointResult {
  const markerPath = resolveCheckpointMarkerPath(repoRoot);
  const snapshot = readCheckpointSnapshot(
    () => readTextOrNull(markerPath),
    markerText => {
      let marker: unknown;
      try {
        marker = JSON.parse(markerText);
      } catch (error) {
        throw new CheckpointResolutionError(
          "marker-malformed",
          `checkpoint marker at ${CHECKPOINT_MARKER_RELATIVE} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (
        !isRecord(marker) ||
        typeof marker.checkpoint_id !== "string" ||
        typeof marker.machine_path !== "string" ||
        typeof marker.human_path !== "string"
      ) {
        throw new CheckpointResolutionError(
          "marker-malformed",
          `checkpoint marker at ${CHECKPOINT_MARKER_RELATIVE} is missing a required field`,
        );
      }

      let machinePath: string;
      let humanPath: string;
      try {
        machinePath = resolveOrThrow(repoRoot, marker.machine_path);
        humanPath = resolveOrThrow(repoRoot, marker.human_path);
      } catch (error) {
        throw new CheckpointResolutionError(
          "marker-malformed",
          `checkpoint marker at ${CHECKPOINT_MARKER_RELATIVE} names an unsafe path: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const machineText = readTextOrNull(machinePath);
      const humanText = readTextOrNull(humanPath);
      if (machineText === null || humanText === null) {
        throw new CheckpointResolutionError(
          "checkpoint-missing",
          `checkpoint marker points at ${marker.checkpoint_id}, but its files are missing on disk`,
        );
      }

      return { marker: marker as { checkpoint_id: string; machine_path: string; human_path: string }, machineText, humanText };
    },
  );
  if (snapshot === null) return { found: false };
  const { marker, machineText, humanText } = snapshot;
  const validation = validateStagedCheckpoint(marker.checkpoint_id, machineText, humanText);
  if (!validation.ok) {
    throw new CheckpointResolutionError(
      "checkpoint-invalid",
      `checkpoint marker points at ${marker.checkpoint_id}, but it fails validation: ${validation.reason} (${validation.detail})`,
    );
  }

  return {
    found: true,
    resolved: {
      checkpointId: marker.checkpoint_id,
      projection: validation.projection,
      humanView: humanText,
      machinePath: marker.machine_path,
      humanPath: marker.human_path,
    },
  };
}
