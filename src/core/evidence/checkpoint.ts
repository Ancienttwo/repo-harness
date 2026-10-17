/**
 * Checkpoint materialization (Sprint C backlog row 10 / D1 compaction anchor
 * / D8 provenance). Pure projection logic only: no `fs`, no `process`, no
 * wall clock other than an explicitly injected `now`. The IO transaction
 * (stage/validate/rename/marker) lives in
 * `src/effects/evidence/checkpoint-store.ts`.
 *
 * A checkpoint is the canonical machine snapshot of an entire per-worktree
 * accepted event set (D1's compaction anchor, and the substrate EPC-07/08's
 * recovery-view/context-packet materializers will read from). Unlike
 * the retired checks projection's D7 selection, it is NOT filtered to one
 * subject/contract -- it covers every accepted event in the ledger at
 * publish time. `provenance.subject_hash` and `provenance.contract_id` are
 * therefore `null` by construction: D8's field list is frozen program-wide,
 * but a whole-ledger snapshot has no single frozen-subject/contract to
 * report. `null` here is the same "not applicable" idiom
 * the retired checks projection already uses for `source_checkpoint_id: null`.
 *
 * `checkpoint_id` is deliberately content-addressed (`chk-<sha256 hex>` of
 * the deterministic body), NOT a random/time ULID like `event_id` (D5).
 * `event_id` must be distinct per occurrence even when payloads coincide; a
 * checkpoint's identity should instead be a pure function of the accepted
 * set it covers, so that (a) "same accepted events => byte-identical
 * projection" holds by construction, and (b) republishing an unchanged
 * accepted set naturally resolves to the same checkpoint_id -- an
 * idempotent, self-evident no-op for the store -- rather than manufacturing
 * a spurious new identity for unchanged content. `content_hash` (inside
 * provenance) and `checkpoint_id` share the same underlying hash, so
 * "content_hash self-consistent" is trivially true by construction; the
 * store independently recomputes it from staged bytes as a corruption gate
 * (see `checkpoint-store.ts`), not merely trusting the in-memory value.
 */
import { createHash } from "crypto";
import type { EvidenceEventRecord, JsonValue, TrustClass } from "./types";
import { canonicalize } from "./canonical-json";

/** Bumped only when this module's own projection shape changes. */
export const CHECKPOINT_SCHEMA_VERSION = 1;
export const CHECKPOINT_MATERIALIZER_VERSION = "2";
export const CHECKPOINT_ID_PREFIX = "chk-";
export const CHECKPOINT_SCHEMA_NAME = "repo-harness-checkpoint.v1";

export const DECISION_EVENT_TYPE = "decision.recorded";
export const CHECKPOINT_DECISION_LIMIT = 20;

export interface DecisionPayload {
  readonly phase: string;
  readonly decision: string;
  readonly why: string;
  readonly evidence: readonly string[];
  readonly result: string;
  readonly run_id?: string;
}

export interface CheckpointDecision extends DecisionPayload {
  readonly event_id: string;
  readonly created_at: string;
  readonly supersedes: readonly string[];
}

export function normalizeDecisionCell(value: string): string {
  return value.replace(/[\t\r\n\u0085\u2028\u2029]+/g, " ").trim();
}

export function isDecisionPayload(value: unknown): value is DecisionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const cell = (item: unknown): item is string => typeof item === "string"
    && item.length > 0 && normalizeDecisionCell(item) === item && !/[\x00-\x1f\x7f]/.test(item);
  return [row.phase, row.decision, row.why, row.result].every(cell)
    && Array.isArray(row.evidence) && row.evidence.length > 0 && row.evidence.every(cell)
    && (row.run_id === undefined || cell(row.run_id));
}

/** Accepted events already exclude replaced rows. Equal times keep append order. */
export function projectDecisions(
  accepted: readonly EvidenceEventRecord[],
  payloadOf: (event: EvidenceEventRecord) => unknown = event => event.payload,
): CheckpointDecision[] {
  return accepted.filter(event => event.event_type === DECISION_EVENT_TYPE)
    .map(event => {
      const payload = payloadOf(event);
      if (!isDecisionPayload(payload)) throw new Error(`invalid decision payload: ${event.event_id}`);
      return {
        event_id: event.event_id,
        created_at: event.created_at,
        phase: payload.phase,
        decision: payload.decision,
        why: payload.why,
        evidence: payload.evidence,
        result: payload.result,
        ...(payload.run_id === undefined ? {} : { run_id: payload.run_id }),
        supersedes: event.supersedes ?? [],
      };
    })
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
}

export function escapeDecisionMarkdown(value: string): string {
  return normalizeDecisionCell(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/[\\`*_[\]{}()|]/g, "\\$&");
}

export function renderDecisionTable(decisions: readonly CheckpointDecision[], format: "tsv" | "markdown"): string {
  const header = ["ts", "phase", "decision", "why", "evidence", "result", "event_id", "supersedes"];
  const cells = decisions.map(row => [row.created_at, row.phase, row.decision, row.why,
    row.evidence.join("; "), row.result, row.event_id, row.supersedes.join("; ")]);
  if (format === "tsv") {
    const safeCell = (value: string): string => {
      const cell = normalizeDecisionCell(value);
      return /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
    };
    return [header, ...cells].map(row => row.map(safeCell).join("\t")).join("\n") + "\n";
  }
  return [header, header.map(() => "---"), ...cells.map(row => row.map(escapeDecisionMarkdown))]
    .map(row => `| ${row.join(" | ")} |`).join("\n") + "\n";
}

/**
 * One accepted event's contribution to the checkpoint (Goal 1: "covered
 * event ids ... subject identities + trust classes"). Ordered by append
 * position, exactly as the accepted set was folded -- never re-sorted.
 */
export interface CheckpointCoveredEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly trust_class: TrustClass;
  readonly subject_hash: string;
  readonly worktree_id: string;
  readonly created_at: string;
}

/**
 * Latest accepted event per distinct `event_type` (Goal 1: "per-event-type
 * latest accepted summaries"). Sorted by `event_type` ascending -- an
 * explicit, engine-independent deterministic order, not reliant on Map
 * iteration semantics.
 */
export interface CheckpointEventTypeSummary {
  readonly event_type: string;
  readonly event_id: string;
  readonly trust_class: TrustClass;
  readonly subject_hash: string;
  readonly created_at: string;
}

/**
 * D8 provenance, exact frozen field list. `subject_hash`/`contract_id` are
 * `null` (see module doc: a checkpoint is a whole-ledger snapshot, not
 * filtered to one subject/contract). `source_checkpoint_id` is
 * self-referential -- a checkpoint's own natural provenance is itself, not a
 * prior checkpoint.
 */
export interface CheckpointProvenance {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly materializer_version: string;
  readonly source_event_ids: readonly string[];
  readonly source_checkpoint_id: string;
  readonly subject_hash: string | null;
  readonly content_hash: string;
  readonly worktree_id: string;
  readonly contract_id: string | null;
}

export interface CheckpointProjection {
  readonly checkpoint_id: string;
  readonly schema: typeof CHECKPOINT_SCHEMA_NAME;
  readonly worktree_id: string;
  readonly covered_event_count: number;
  readonly covered_events: readonly CheckpointCoveredEvent[];
  readonly latest_by_event_type: readonly CheckpointEventTypeSummary[];
  readonly decisions?: readonly CheckpointDecision[];
  readonly provenance: CheckpointProvenance;
}

export interface BuildCheckpointInput {
  /**
   * The ledger's own declared worktree identity (the genesis record's
   * `worktree_id`); every accepted event in a per-worktree ledger carries
   * this same value by construction (D1), so the checkpoint reports it once
   * at the top level rather than re-deriving it from a contract path (unlike
   * the retired checks projection's `worktreeIdFor`, which is specific to that
   * module's single-contract D7 scope).
   */
  readonly worktreeId: string;
  /** Injectable for deterministic tests; defaults to the real clock. */
  readonly now?: () => Date;
  /** The effects layer resolves redacted JSON blobs before projection. */
  readonly decisionPayloadOf?: (event: EvidenceEventRecord) => unknown;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex");
}

function coveredEventsOf(accepted: readonly EvidenceEventRecord[]): readonly CheckpointCoveredEvent[] {
  return accepted.map((event) => ({
    event_id: event.event_id,
    event_type: event.event_type,
    trust_class: event.trust_class,
    subject_hash: event.subject_identity.subject_hash,
    worktree_id: event.worktree_id,
    created_at: event.created_at,
  }));
}

function latestByEventTypeOf(accepted: readonly EvidenceEventRecord[]): readonly CheckpointEventTypeSummary[] {
  // Map.set on an existing key does not reposition it in iteration order, so
  // this already deterministically keeps "first-seen key order, last-seen
  // value" -- the explicit sort below makes that invariant obvious in code
  // rather than relying on the reader recalling Map iteration semantics.
  const latest = new Map<string, EvidenceEventRecord>();
  for (const event of accepted) latest.set(event.event_type, event);
  return [...latest.values()]
    .map((event) => ({
      event_type: event.event_type,
      event_id: event.event_id,
      trust_class: event.trust_class,
      subject_hash: event.subject_identity.subject_hash,
      created_at: event.created_at,
    }))
    .sort((left, right) => (left.event_type < right.event_type ? -1 : left.event_type > right.event_type ? 1 : 0));
}

interface CheckpointBody {
  readonly worktree_id: string;
  readonly covered_event_count: number;
  readonly covered_events: readonly CheckpointCoveredEvent[];
  readonly latest_by_event_type: readonly CheckpointEventTypeSummary[];
  readonly decisions?: readonly CheckpointDecision[];
}

/**
 * The deterministic body both `checkpoint_id` and `provenance.content_hash`
 * hash -- everything about the projection except the provenance block
 * itself (mirrors the retired checks projection's `contentHashOf`: excluding
 * provenance, including the volatile `generated_at`, keeps the hash stable
 * on replay).
 */
function bodyAsJson(body: CheckpointBody): JsonValue {
  return {
    schema: CHECKPOINT_SCHEMA_NAME,
    worktree_id: body.worktree_id,
    covered_event_count: body.covered_event_count,
    covered_events: body.covered_events as unknown as JsonValue,
    latest_by_event_type: body.latest_by_event_type as unknown as JsonValue,
    ...(body.decisions === undefined ? {} : { decisions: body.decisions as unknown as JsonValue }),
  };
}

/**
 * Recomputes the raw (unprefixed) content hash of a checkpoint's
 * deterministic body. Exported so `checkpoint-store.ts` can independently
 * recompute the SAME hash from a freshly-parsed staged/published projection
 * as a corruption gate, rather than re-deriving its own copy of this
 * formula (one source of truth for the datum).
 */
export function checkpointBodyHashHex(body: CheckpointBody): string {
  return sha256Hex(canonicalize(bodyAsJson(body)));
}

/**
 * Pure projection builder. `accepted` must already be the D5-folded accepted
 * set (see `src/effects/evidence/event-log.ts#readAcceptedEvents`) -- this
 * function derives event summaries and the latest 20 decision rows.
 */
export function buildCheckpointProjection(
  input: BuildCheckpointInput,
  accepted: readonly EvidenceEventRecord[],
): CheckpointProjection {
  const now = input.now ?? (() => new Date());
  const coveredEvents = coveredEventsOf(accepted);
  const latestByType = latestByEventTypeOf(accepted);
  const sourceEventIds = accepted.map((event) => event.event_id);
  const decisions = projectDecisions(accepted, input.decisionPayloadOf).slice(-CHECKPOINT_DECISION_LIMIT);

  const hashHex = checkpointBodyHashHex({
    worktree_id: input.worktreeId,
    covered_event_count: accepted.length,
    covered_events: coveredEvents,
    latest_by_event_type: latestByType,
    decisions,
  });
  const checkpointId = `${CHECKPOINT_ID_PREFIX}${hashHex}`;

  return {
    checkpoint_id: checkpointId,
    schema: CHECKPOINT_SCHEMA_NAME,
    worktree_id: input.worktreeId,
    covered_event_count: accepted.length,
    covered_events: coveredEvents,
    latest_by_event_type: latestByType,
    decisions,
    provenance: {
      schema_version: CHECKPOINT_SCHEMA_VERSION,
      generated_at: now().toISOString(),
      materializer_version: CHECKPOINT_MATERIALIZER_VERSION,
      source_event_ids: sourceEventIds,
      source_checkpoint_id: checkpointId,
      subject_hash: null,
      content_hash: `sha256:${hashHex}`,
      worktree_id: input.worktreeId,
      contract_id: null,
    },
  };
}

/**
 * Pure human-view renderer: Markdown derived ONLY from the machine
 * projection object, never from repo state directly, and never parsed back
 * by any reader (see `checkpoint-store.ts`'s module doc and
 * `tests/evidence-checkpoint.test.ts`'s never-read-back sweep).
 * Byte-deterministic: an identical projection object always renders
 * identical Markdown bytes.
 */
export function renderCheckpointMarkdown(projection: CheckpointProjection): string {
  const lines: string[] = [];
  lines.push(`# Evidence Checkpoint: ${projection.checkpoint_id}`);
  lines.push("");
  lines.push("> Generated view only. This file is never read back by any code path --");
  lines.push("> the machine projection alongside this file is the sole authority. Hand");
  lines.push("> edits here are silently discarded on the next publish.");
  lines.push("");
  lines.push("## Provenance");
  lines.push("");
  lines.push(`- Schema version: ${projection.provenance.schema_version}`);
  lines.push(`- Generated at: ${projection.provenance.generated_at}`);
  lines.push(`- Materializer version: ${projection.provenance.materializer_version}`);
  lines.push(`- Worktree: ${projection.provenance.worktree_id}`);
  lines.push(`- Contract: ${projection.provenance.contract_id ?? "(none -- whole-ledger snapshot)"}`);
  lines.push(`- Subject hash: ${projection.provenance.subject_hash ?? "(none -- whole-ledger snapshot)"}`);
  lines.push(`- Content hash: ${projection.provenance.content_hash}`);
  lines.push(`- Source checkpoint id: ${projection.provenance.source_checkpoint_id}`);
  lines.push("");
  lines.push(`## Covered Events (${projection.covered_event_count})`);
  lines.push("");
  if (projection.covered_events.length === 0) {
    lines.push("(none -- empty accepted set)");
  } else {
    lines.push("| event_id | event_type | trust_class | subject_hash |");
    lines.push("|---|---|---|---|");
    for (const event of projection.covered_events) {
      lines.push(`| ${event.event_id} | ${event.event_type} | ${event.trust_class} | ${event.subject_hash} |`);
    }
  }
  lines.push("");
  lines.push("## Latest By Event Type");
  lines.push("");
  if (projection.latest_by_event_type.length === 0) {
    lines.push("(none)");
  } else {
    lines.push("| event_type | latest_event_id | trust_class |");
    lines.push("|---|---|---|");
    for (const summary of projection.latest_by_event_type) {
      lines.push(`| ${summary.event_type} | ${summary.event_id} | ${summary.trust_class} |`);
    }
  }
  lines.push("");
  if (projection.decisions !== undefined) {
    lines.push("## Decisions", "");
    lines.push(projection.decisions.length === 0 ? "- (none recorded)" : renderDecisionTable(projection.decisions, "markdown").trimEnd());
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
