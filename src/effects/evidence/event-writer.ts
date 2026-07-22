/**
 * The single construction path for a real `EvidenceEventRecord`. D6
 * invariants (path-field safety, secret redaction, inline/blob decision)
 * run unconditionally here -- there is no other way to produce a record, so
 * there is no skippable "sanitize" step a caller could bypass.
 */
import { createHash } from "crypto";
import type { EvidenceEventRecord, JsonValue, SubjectIdentity, TrustClass } from "../../core/evidence/types";
import { canonicalize } from "../../core/evidence/canonical-json";
import { generateEventId } from "../../core/evidence/ulid";
import { computeIdempotencyKey } from "../../core/evidence/idempotency";
import { redactPayloadStrings } from "../../core/evidence/redaction";
import { collectStringLeaves } from "../../core/evidence/json-walk";
import { exceedsInlineCap } from "../../core/evidence/payload-cap";
import { ensureRepoRelativePath } from "../path-safety";
import { collectDenylistSecretValues } from "./secret-env";
import { writeBlob } from "./blob-store";

export type EvidencePayloadInput =
  | { readonly kind: "json"; readonly value: JsonValue }
  | { readonly kind: "binary"; readonly content: Buffer; readonly contentType?: string };

export interface EvidenceEventConstructionInput {
  readonly worktreeId: string;
  readonly eventType: string;
  readonly trustClass: TrustClass;
  readonly producer: string;
  readonly correlationRunId: string;
  readonly subjectIdentity: SubjectIdentity;
  readonly supersedes?: readonly string[];
  readonly payload: EvidencePayloadInput;
}

/** Path-field convention: any object key named `path`, or ending `_path`/`Path`. */
function isPathFieldKey(key: string): boolean {
  return key === "path" || key.endsWith("_path") || key.endsWith("Path");
}

function assertPayloadPathFieldsAreSafe(value: JsonValue): void {
  for (const leaf of collectStringLeaves(value)) {
    const key = leaf.path[leaf.path.length - 1];
    if (key === undefined || !isPathFieldKey(key)) continue;
    const result = ensureRepoRelativePath(leaf.value);
    if (!result.ok) {
      throw new Error(
        `evidence payload path field "${leaf.path.join(".")}" failed repo-relative validation: ${result.error}`,
      );
    }
  }
}

function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

interface ConstructedPayload {
  readonly payload?: JsonValue;
  readonly blobSha256?: string;
  readonly blobBytes?: number;
  readonly contentType?: string;
  readonly payloadHash: string;
}

function constructPayload(repoRoot: string, input: EvidencePayloadInput): ConstructedPayload {
  if (input.kind === "binary") {
    // D6: binary payloads are always offloaded to a blob, never inline.
    const write = writeBlob(repoRoot, input.content);
    return {
      blobSha256: write.sha256,
      blobBytes: write.bytes,
      contentType: input.contentType,
      payloadHash: `sha256:${write.sha256}`,
    };
  }

  assertPayloadPathFieldsAreSafe(input.value);
  const knownSecretValues = collectDenylistSecretValues();
  const redacted = redactPayloadStrings(input.value, knownSecretValues);
  const serialized = canonicalize(redacted);
  const payloadHash = `sha256:${sha256Hex(serialized)}`;

  if (!exceedsInlineCap(serialized)) {
    return { payload: redacted, payloadHash };
  }

  const write = writeBlob(repoRoot, Buffer.from(serialized, "utf-8"));
  return {
    blobSha256: write.sha256,
    blobBytes: write.bytes,
    contentType: "application/json",
    payloadHash,
  };
}

export function buildEvidenceEvent(repoRoot: string, input: EvidenceEventConstructionInput): EvidenceEventRecord {
  const constructed = constructPayload(repoRoot, input.payload);
  const idempotencyKey = computeIdempotencyKey({
    subjectIdentity: input.subjectIdentity,
    eventType: input.eventType,
    trustClass: input.trustClass,
    payloadHash: constructed.payloadHash,
    producer: input.producer,
  });

  return {
    kind: "evidence_event",
    schema_version: 1,
    worktree_id: input.worktreeId,
    event_id: generateEventId(),
    correlation_run_id: input.correlationRunId,
    event_type: input.eventType,
    trust_class: input.trustClass,
    producer: input.producer,
    subject_identity: input.subjectIdentity,
    idempotency_key: idempotencyKey,
    ...(input.supersedes && input.supersedes.length > 0 ? { supersedes: input.supersedes } : {}),
    payload_hash: constructed.payloadHash,
    ...(constructed.payload !== undefined ? { payload: constructed.payload } : {}),
    ...(constructed.blobSha256 !== undefined
      ? { blob_sha256: constructed.blobSha256, blob_bytes: constructed.blobBytes, content_type: constructed.contentType }
      : {}),
    created_at: new Date().toISOString(),
  };
}
