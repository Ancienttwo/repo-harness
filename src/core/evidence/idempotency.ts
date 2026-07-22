/**
 * D5 idempotency key: identical key implies no-op dedup on replay (e.g.
 * re-importing the same external attestation twice yields exactly one
 * accepted event).
 */
import { createHash } from "crypto";
import { canonicalize } from "./canonical-json";
import type { JsonValue, SubjectIdentity, TrustClass } from "./types";

export interface IdempotencyInput {
  readonly subjectIdentity: SubjectIdentity;
  readonly eventType: string;
  readonly trustClass: TrustClass;
  readonly payloadHash: string;
  readonly producer: string;
}

function subjectIdentityAsJson(subject: SubjectIdentity): JsonValue {
  return {
    authority_commit: subject.authority_commit,
    base_commit: subject.base_commit,
    target_commit: subject.target_commit,
    scope_hash: subject.scope_hash,
    subject_hash: subject.subject_hash,
    contract_hash: subject.contract_hash,
    command_hash: subject.command_hash,
    env_provider_id: subject.env_provider_id,
  };
}

/** sha256(canonical(subject_identity . event_type . trust_class . payload_hash . producer)). */
export function computeIdempotencyKey(input: IdempotencyInput): string {
  const composite: JsonValue = {
    subject_identity: subjectIdentityAsJson(input.subjectIdentity),
    event_type: input.eventType,
    trust_class: input.trustClass,
    payload_hash: input.payloadHash,
    producer: input.producer,
  };
  const digest = createHash("sha256").update(canonicalize(composite)).digest("hex");
  return `sha256:${digest}`;
}
