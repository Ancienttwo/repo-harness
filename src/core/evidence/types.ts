/**
 * EvidenceEvent protocol types (EPC-01).
 *
 * Frozen by sprint `### Frozen decisions (EPC-00, 2026-07-22)` D3-D6. This
 * module defines the shape only; it performs no IO and imports neither `fs`
 * nor `process`.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** D4 trust matrix. Default is deny: absent an explicit allow, `external_attested` is `observed` for a gate. */
export type TrustClass =
  | "authoritative_machine"
  | "observed"
  | "human_acceptance"
  | "external_attested";

/** D3 subject identity, exact field list frozen by EPC-00. */
export interface SubjectIdentity {
  readonly authority_commit: string;
  readonly base_commit: string;
  readonly target_commit: string;
  readonly scope_hash: string;
  readonly subject_hash: string;
  readonly contract_hash: string;
  readonly command_hash: string;
  readonly env_provider_id: string;
}

/** First record of a fresh per-worktree store; hard precondition of the first append (D2). */
export interface GenesisRecord {
  readonly kind: "evidence_genesis";
  readonly schema_version: 1;
  readonly worktree_id: string;
  readonly ledger_epoch_start_sha: string;
  readonly created_at: string;
}

/**
 * A single EvidenceEvent (D3-D6). Exactly one of `payload` or `blob_sha256`
 * is present, never both and never neither -- enforced by the writer
 * construction path in `src/effects/evidence/event-writer.ts`.
 */
export interface EvidenceEventRecord {
  readonly kind: "evidence_event";
  readonly schema_version: 1;
  readonly worktree_id: string;
  readonly event_id: string;
  readonly correlation_run_id: string;
  readonly event_type: string;
  readonly trust_class: TrustClass;
  readonly producer: string;
  readonly subject_identity: SubjectIdentity;
  readonly idempotency_key: string;
  readonly supersedes?: readonly string[];
  readonly payload_hash: string;
  readonly payload?: JsonValue;
  readonly blob_sha256?: string;
  readonly blob_bytes?: number;
  readonly content_type?: string;
  readonly created_at: string;
}

export type EvidenceLogRecord = GenesisRecord | EvidenceEventRecord;

export function isGenesisRecord(record: EvidenceLogRecord): record is GenesisRecord {
  return record.kind === "evidence_genesis";
}

export function isEvidenceEventRecord(record: EvidenceLogRecord): record is EvidenceEventRecord {
  return record.kind === "evidence_event";
}
