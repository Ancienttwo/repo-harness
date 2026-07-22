/**
 * Pure fold / accepted-set / corrupt-tail-detection logic (D5). No IO: the
 * effects layer (`src/effects/evidence/event-log.ts`) supplies raw lines
 * read from disk and performs the quarantine write; everything here is a
 * deterministic function of its inputs so replay is provably reproducible.
 */
import type { EvidenceEventRecord, EvidenceLogRecord, GenesisRecord, SubjectIdentity, TrustClass } from "./types";

export type ParsedLogLine =
  | { readonly ok: true; readonly record: EvidenceLogRecord }
  | { readonly ok: false; readonly error: string };

const TRUST_CLASSES: ReadonlySet<string> = new Set<TrustClass>([
  "authoritative_machine",
  "observed",
  "human_acceptance",
  "external_attested",
]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidGenesis(value: unknown): value is GenesisRecord {
  if (!isRecord(value)) return false;
  return value.kind === "evidence_genesis"
    && value.schema_version === 1
    && isNonEmptyString(value.worktree_id)
    && isNonEmptyString(value.ledger_epoch_start_sha)
    && isNonEmptyString(value.created_at);
}

function isValidSubjectIdentity(value: unknown): value is SubjectIdentity {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.authority_commit)
    && isNonEmptyString(value.base_commit)
    && isNonEmptyString(value.target_commit)
    && isNonEmptyString(value.scope_hash)
    && isNonEmptyString(value.subject_hash)
    && isNonEmptyString(value.contract_hash)
    && isNonEmptyString(value.command_hash)
    && isNonEmptyString(value.env_provider_id);
}

function isValidEvidenceEvent(value: unknown): value is EvidenceEventRecord {
  if (!isRecord(value)) return false;
  if (value.kind !== "evidence_event" || value.schema_version !== 1) return false;
  if (!isNonEmptyString(value.worktree_id)) return false;
  if (!isNonEmptyString(value.event_id)) return false;
  if (!isNonEmptyString(value.correlation_run_id)) return false;
  if (!isNonEmptyString(value.event_type)) return false;
  if (typeof value.trust_class !== "string" || !TRUST_CLASSES.has(value.trust_class)) return false;
  if (!isNonEmptyString(value.producer)) return false;
  if (!isValidSubjectIdentity(value.subject_identity)) return false;
  if (!isNonEmptyString(value.idempotency_key)) return false;
  if (!isNonEmptyString(value.payload_hash)) return false;
  if (!isNonEmptyString(value.created_at)) return false;
  if (value.supersedes !== undefined && !Array.isArray(value.supersedes)) return false;
  const hasPayload = value.payload !== undefined;
  const hasBlob = isNonEmptyString(value.blob_sha256);
  if (hasPayload === hasBlob) return false; // exactly one of payload/blob_sha256 must be present
  return true;
}

/** Parse one JSONL line into a typed record, or a typed parse failure -- never throws. */
export function parseLogLine(line: string): ParsedLogLine {
  if (line.length === 0) {
    return { ok: false, error: "empty line" };
  }
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (isValidGenesis(value)) return { ok: true, record: value };
  if (isValidEvidenceEvent(value)) return { ok: true, record: value };
  return { ok: false, error: "record does not match a known EvidenceLogRecord shape" };
}

export interface CorruptTailResult {
  /** Count of leading lines (from index 0) that parsed as valid records. */
  readonly validLineCount: number;
  /** Index of the first unparseable/truncated line, or null if none found. */
  readonly corruptStartIndex: number | null;
}

/**
 * D5 corrupt-tail policy: the first unparseable/truncated record truncates
 * the accepted log at the last valid offset. Never skip a corrupt middle
 * record and resume -- everything from the first bad line onward, including
 * any later well-formed-looking line, is corrupt tail.
 */
export function findCorruptTail(parsedLines: readonly ParsedLogLine[]): CorruptTailResult {
  for (let i = 0; i < parsedLines.length; i++) {
    if (!parsedLines[i]!.ok) {
      return { validLineCount: i, corruptStartIndex: i };
    }
  }
  return { validLineCount: parsedLines.length, corruptStartIndex: null };
}

export interface FoldResult {
  readonly accepted: readonly EvidenceEventRecord[];
  readonly acceptedIdempotencyKeys: readonly string[];
}

/**
 * D5/D7-adjacent accepted-set fold: total order = append position (the
 * array's given order, never re-sorted); dedup by idempotency key (a later
 * duplicate is a no-op, the first occurrence wins); exclude every event_id
 * appearing in the union of all supersedes lists. Pure: identical input
 * always yields an identical, byte-serializable result.
 */
export function foldAcceptedEvents(events: readonly EvidenceEventRecord[]): FoldResult {
  const seenIdempotencyKeys = new Set<string>();
  const deduped: EvidenceEventRecord[] = [];
  for (const event of events) {
    if (seenIdempotencyKeys.has(event.idempotency_key)) continue;
    seenIdempotencyKeys.add(event.idempotency_key);
    deduped.push(event);
  }

  const supersededIds = new Set<string>();
  for (const event of deduped) {
    for (const id of event.supersedes ?? []) supersededIds.add(id);
  }

  const accepted = deduped.filter((event) => !supersededIds.has(event.event_id));
  return { accepted, acceptedIdempotencyKeys: accepted.map((event) => event.idempotency_key) };
}
