/**
 * The `checks/latest.json` materializer (Sprint C backlog row 9 / D7 + D8).
 * This module is the sole authority that renders `checks/latest.json`; the
 * only writer of that file anywhere in this repository is this module plus
 * its single call site in `scripts/emit-verify-evidence.ts` (see
 * `tests/evidence-checks-materializer.test.ts`'s no-independent-authoring
 * test). Every previously-direct authoring path (`scripts/verify-sprint.sh`'s
 * `cp`, `.ai/hooks/lib/workflow-state.sh`'s `{}` bootstrap) is deleted in
 * this same package (R5).
 *
 * D7 selection predicate (frozen, sprint `### Frozen decisions (EPC-00,
 * 2026-07-22)`):
 *
 *   accepted := events WHERE
 *        worktree_id   == current worktree
 *    AND contract_id   == active contract
 *    AND subject_hash  == frozen-subject hash        (exact equality)
 *    AND trust_class ∈ {authoritative_machine}       (human_acceptance /
 *                       external_attested admitted only where the contract's
 *                       Acceptance Policy enumerates them -- D4)
 *    AND event_id NOT ∈ (union of supersedes[])
 *   winner := last(accepted ORDER BY append_position ASC)
 *             -- never mtime / filename recency / last-writer-wins
 *
 * `contract_id == active contract` and `worktree_id == current` collapse to
 * one filter in this system's actual schema: `EvidenceEventRecord.worktree_id`
 * is already populated with the active contract's own slug at emission time
 * (`worktreeIdFor()` in `verify-producer.ts`, exported and reused here rather
 * than re-implemented -- both this module and `verify-producer.ts` are owned
 * by this SAME package, so sharing this one small pure helper does not
 * revisit the EPC-02/03/04 wave's "no shared private helper" qualification,
 * which was specifically about proving independence across DIFFERENT
 * parallel packages).
 *
 * `readAcceptedEvents` (EPC-01, read-only) already applies D5's fold: total
 * order by append position, idempotency-key dedup, and supersedes exclusion.
 * This module applies exactly one more filter on top of that already-accepted
 * set: worktree_id + subject_hash + trust-class-admission.
 *
 * No exact subject_hash match -> `status: "unsatisfied"` (fail-closed; never
 * a stale or different-subject event, per D7's closing sentence).
 */
import { readFileSync } from "fs";
import { join } from "path";
import type { EvidenceEventRecord, JsonValue } from "../../core/evidence/types";
import { canonicalize } from "../../core/evidence/canonical-json";
import { createHash } from "crypto";
import { readAcceptedEvents } from "./event-log";
import { resolveBlobsDir } from "./paths";
import { writeFileDurably } from "./atomic-append";
import { worktreeIdFor } from "./verify-producer";

/** Bumped only when this module's own rendering logic changes shape. */
export const MATERIALIZER_VERSION = "1";
export const CHECKS_SCHEMA_VERSION = 1;

export interface AcceptancePolicySummary {
  /** true when a syntactically valid Acceptance Policy JSON block was found. */
  readonly present: boolean;
  readonly userWaiverAllowed: boolean;
}

/**
 * Local, structural re-parse of the contract's `## Acceptance Policy` fenced
 * JSON block -- the same block `scripts/acceptance-receipt.ts`'s
 * `parseAcceptancePolicy` reads. Duplicated here (not imported) because
 * `src/` must not depend on `scripts/` (R4/EPC-04 precedent); this is a
 * small, closed, read-only structural parse, not a second authority over
 * the policy's meaning -- D4's two-entry admission table is what this
 * module derives from the result, unchanged from EPC-04's trust mapping
 * (`external_pass` -> `external_attested`, `user_waiver` -> `human_acceptance`).
 */
export function parseAcceptancePolicySummary(contractText: string): AcceptancePolicySummary {
  const section = contractText.match(/^## Acceptance Policy[ \t]*\r?\n+```json[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*$/m);
  if (!section) return { present: false, userWaiverAllowed: false };
  let value: unknown;
  try {
    value = JSON.parse(section[1]!);
  } catch {
    return { present: false, userWaiverAllowed: false };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { present: false, userWaiverAllowed: false };
  }
  const record = value as Record<string, unknown>;
  if (record.protocol !== 1) return { present: false, userWaiverAllowed: false };
  if (record.reviewer !== "Claude" && record.reviewer !== "Codex") return { present: false, userWaiverAllowed: false };
  if (record.user_waiver !== "allowed" && record.user_waiver !== "forbidden") {
    return { present: false, userWaiverAllowed: false };
  }
  return { present: true, userWaiverAllowed: record.user_waiver === "allowed" };
}

/**
 * D4 admission gate: `authoritative_machine` is always admitted by the
 * caller (this function is only consulted for the other two trust classes).
 * Default is deny -- an absent/invalid Acceptance Policy admits neither.
 */
function isTrustClassAdmitted(trustClass: EvidenceEventRecord["trust_class"], policy: AcceptancePolicySummary): boolean {
  if (trustClass === "authoritative_machine") return true;
  if (trustClass === "observed") return false;
  if (!policy.present) return false;
  if (trustClass === "external_attested") return true;
  if (trustClass === "human_acceptance") return policy.userWaiverAllowed;
  return false;
}

export interface MaterializeChecksLatestInput {
  readonly repoRoot: string;
  /** Repo-relative path to the active contract, e.g. `tasks/contracts/<slug>.contract.md`. */
  readonly contractPath: string;
  /** Exact-equality target for D7's `subject_hash` filter. */
  readonly subjectHash: string;
  /** Injectable for deterministic tests; defaults to the real clock. */
  readonly now?: () => Date;
}

export interface ChecksLatestProvenance {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly materializer_version: string;
  readonly source_event_ids: readonly string[];
  readonly source_checkpoint_id: null;
  readonly subject_hash: string;
  readonly content_hash: string;
  readonly worktree_id: string;
  readonly contract_id: string;
}

export type ChecksLatestProjection = Readonly<Record<string, JsonValue>> & {
  readonly provenance: ChecksLatestProvenance;
};

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** sha256 of the consumer-facing content only -- excludes the provenance
 * block itself (which embeds this hash and a volatile `generated_at`), so
 * replaying the same accepted events always reproduces the same
 * `content_hash` (EPC-09's drift check depends on this). */
function contentHashOf(consumerFacing: Readonly<Record<string, JsonValue>>): string {
  return `sha256:${sha256Hex(canonicalize(consumerFacing as JsonValue))}`;
}

function readBlobJson(repoRoot: string, blobSha256: string): unknown {
  const blobPath = join(resolveBlobsDir(repoRoot), blobSha256);
  const raw = readFileSync(blobPath, "utf-8");
  return JSON.parse(raw);
}

/** Extracts the full run-trace object a matching event carries, whether
 * inline or blob-offloaded (D6 overflow discipline, transparent to readers).
 * Returns undefined when the event carries no `run_trace` field at all (an
 * older/smaller caller that never supplied one) -- treated the same as "no
 * match" by the caller, since there is nothing to project from. */
function extractRunTrace(repoRoot: string, event: EvidenceEventRecord): Record<string, JsonValue> | undefined {
  let value: unknown;
  if (event.payload !== undefined) {
    value = event.payload;
  } else if (event.blob_sha256) {
    try {
      value = readBlobJson(repoRoot, event.blob_sha256);
    } catch {
      return undefined;
    }
  } else {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const runTrace = (value as Record<string, unknown>).run_trace;
  if (typeof runTrace !== "object" || runTrace === null || Array.isArray(runTrace)) return undefined;
  return runTrace as Record<string, JsonValue>;
}

function isoNow(now: () => Date): string {
  return now().toISOString();
}

/**
 * Pure projection builder: no IO beyond reading already-loaded accepted
 * events and (for a blob-backed winner) one blob file. Callers that need the
 * write should use `writeChecksLatest` below.
 */
export function buildChecksLatestProjection(
  input: MaterializeChecksLatestInput,
  accepted: readonly EvidenceEventRecord[],
  contractText: string,
): ChecksLatestProjection {
  const now = input.now ?? (() => new Date());
  const worktreeId = worktreeIdFor(input.contractPath);
  const policy = parseAcceptancePolicySummary(contractText);

  const matching = accepted.filter(
    (event) =>
      event.worktree_id === worktreeId &&
      event.subject_identity.subject_hash === input.subjectHash &&
      isTrustClassAdmitted(event.trust_class, policy),
  );

  const sourceEventIds = matching.map((event) => event.event_id);

  if (matching.length === 0) {
    const consumerFacing: Record<string, JsonValue> = { schema: "repo-harness-run-trace.v1", status: "unsatisfied" };
    return {
      ...consumerFacing,
      provenance: {
        schema_version: CHECKS_SCHEMA_VERSION,
        generated_at: isoNow(now),
        materializer_version: MATERIALIZER_VERSION,
        source_event_ids: sourceEventIds,
        source_checkpoint_id: null,
        subject_hash: input.subjectHash,
        content_hash: contentHashOf(consumerFacing),
        worktree_id: worktreeId,
        contract_id: input.contractPath,
      },
    };
  }

  // D7 winner: last accepted event matching the predicate, in append order
  // (never mtime/filename recency).
  const winner = matching[matching.length - 1]!;
  const runTrace = extractRunTrace(input.repoRoot, winner);

  if (runTrace === undefined) {
    const consumerFacing: Record<string, JsonValue> = { schema: "repo-harness-run-trace.v1", status: "unsatisfied" };
    return {
      ...consumerFacing,
      provenance: {
        schema_version: CHECKS_SCHEMA_VERSION,
        generated_at: isoNow(now),
        materializer_version: MATERIALIZER_VERSION,
        source_event_ids: sourceEventIds,
        source_checkpoint_id: null,
        subject_hash: input.subjectHash,
        content_hash: contentHashOf(consumerFacing),
        worktree_id: worktreeId,
        contract_id: input.contractPath,
      },
    };
  }

  return {
    ...runTrace,
    provenance: {
      schema_version: CHECKS_SCHEMA_VERSION,
      generated_at: isoNow(now),
      materializer_version: MATERIALIZER_VERSION,
      source_event_ids: sourceEventIds,
      source_checkpoint_id: null,
      subject_hash: input.subjectHash,
      content_hash: contentHashOf(runTrace),
      worktree_id: worktreeId,
      contract_id: input.contractPath,
    },
  };
}

export interface WriteChecksLatestInput extends MaterializeChecksLatestInput {
  /** Repo-relative path to write to, e.g. `.ai/harness/checks/latest.json`. */
  readonly checksFilePath: string;
}

/**
 * The materializer's one disk-writing entry point. `scripts/emit-verify-evidence.ts`
 * is this function's single call site (see module doc + the
 * no-independent-authoring test).
 */
export function writeChecksLatest(input: WriteChecksLatestInput): ChecksLatestProjection {
  const contractText = readFileSync(join(input.repoRoot, input.contractPath), "utf-8");
  const { accepted } = readAcceptedEvents(input.repoRoot);
  const projection = buildChecksLatestProjection(input, accepted, contractText);
  const absolutePath = join(input.repoRoot, input.checksFilePath);
  writeFileDurably(absolutePath, `${JSON.stringify(projection, null, 2)}\n`);
  return projection;
}
