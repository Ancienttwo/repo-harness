import { createHash } from "crypto";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import type {
  EvidenceEventRecord,
  GenesisRecord,
  JsonValue,
  AdmittedReviewSubjectIdentity,
  TrustClass,
} from "../../core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord, CorruptEvidenceLogError, UnterminatedEvidenceLogError } from "./event-log";
import { LEDGER_EPOCH_START_SHA } from "./epoch";
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import type { ReviewAdmissionSource } from '../admission/admission-source';
import type { AcceptanceReceipt } from '../../core/review/acceptance-receipt';
import { hashVerificationPlan } from '../../core/evidence/verification-plan';
import { gitExecFileSync } from '../git/runner';

const PRODUCER_ID = "acceptance-receipt";
const EVENT_TYPE = "acceptance_receipt.attested_import";

// No verification command runs for an import (this evidence is imported,
// not freshly produced by a verification run); D3's command_hash still
// requires a non-empty value, so a fixed label identifies "the operation
// that always produces this event_type" -- constant across every import, so
// it never breaks idempotency for a repeated import of the same receipt.
const IMPORT_COMMAND_LABEL = "repo-harness acceptance-receipt record (attested-import)";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(MODULE_DIR, "../../..");

/** D4: closed two-entry table. Any disposition not listed here fails closed -- never a default branch (plan P3). */
const DISPOSITION_TRUST_MAP: Readonly<Record<string, TrustClass>> = Object.freeze({
  external_pass: "external_attested",
  user_waiver: "human_acceptance",
});

export type AttestedImportFailureReason =
  | "unsupported_disposition"
  | "missing_actor"
  | "missing_reason"
  | "missing_subject"
  | "genesis_epoch_conflict"
  | "unterminated_log_tail"
  | "corrupt_log_tail";

export interface AttestedImportFailure {
  readonly ok: false;
  readonly reason: AttestedImportFailureReason;
  readonly message: string;
}

export interface AttestedImportSuccess {
  readonly ok: true;
  readonly event: EvidenceEventRecord;
  readonly genesis: GenesisRecord;
}

export type AttestedImportResult = AttestedImportSuccess | AttestedImportFailure;

/**
 * The minimal, structural shape of an AcceptanceReceipt this module needs.
 * Deliberately not imported from `scripts/acceptance-receipt.ts` -- `src/`
 * must not depend on `scripts/`. Any object with this shape, including a
 * real `AcceptanceReceipt`, satisfies it structurally.
 */
export type AttestedReceiptInput = Pick<AcceptanceReceipt, 'actor' | 'summary' | 'findings'
  | 'subject_sha256' | 'target_revision' | 'issued_at' | 'campaign_sha256' | 'admission_sha256' | 'grant_sha256'> & { readonly disposition: string; readonly reviewer: string; readonly source: string };


export interface AttestedImportInput {
  /** Repo root the receipt was recorded against. */
  readonly repoRoot: string;
  readonly receipt: AttestedReceiptInput;
  /** Exact protected admission selected and validated by the recording command. */
  readonly authority: ReviewAdmissionSource;
  readonly correlationRunId?: string;
}

function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function gitOutput(repoRoot: string, args: readonly string[]): { readonly ok: boolean; readonly text: string } {
  try {
    const text = gitExecFileSync(["-C", repoRoot, "--literal-pathspecs", ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { ok: true, text };
  } catch {
    return { ok: false, text: "" };
  }
}

function resolveHead(repoRoot: string): string | null {
  const result = gitOutput(repoRoot, ["rev-parse", "--verify", "HEAD"]);
  const sha = result.text.trim();
  return result.ok && sha.length > 0 ? sha : null;
}

/**
 * This module's own `package.json` version -- the repo-harness tool's own
 * version, independent of whichever `repoRoot` is being imported into
 * (pattern reference: the retired verify producer's private `providerCliVersion`;
 * necessarily duplicated, not imported -- see module doc).
 */
function providerCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8")) as { readonly version?: unknown };
    return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Isolated workspace id (pattern reference: the retired verify producer's private `workspaceId`; necessarily duplicated). */
function workspaceId(repoRoot: string): string {
  const result = gitOutput(repoRoot, ["rev-parse", "--show-toplevel"]);
  const real = result.ok && result.text.trim() ? result.text.trim() : repoRoot;
  return `ws-${sha256Hex(real).slice(0, 12)}`;
}

/**
 * D6 redaction hashes any 32+ char dot-free alnum run; a full
 * `sha256:<64-hex>` reference stored verbatim would come back uselessly
 * re-hashed (the exact bug EPC-02's dogfood run caught), so only a short
 * prefix travels in the payload (pattern reference: the retired verify producer's
 * `shortRunSnapshotId`).
 */
function shortHashRef(hash: string): string {
  const hex = hash.startsWith("sha256:") ? hash.slice("sha256:".length) : hash;
  return hex.slice(0, 16);
}

/**
 * Single entry point: maps disposition to a trust class through the closed
 * D4 table, validates every required field fails closed when absent/empty,
 * builds the full D3 subject identity (receipt binding + computed repo
 * state), ensures genesis, and appends exactly one attested EvidenceEvent.
 * Every failure below returns before any genesis/append side effect runs.
 */
export function importAttestedEvidence(input: AttestedImportInput): AttestedImportResult {
  const { repoRoot, receipt } = input;

  const trustClass = DISPOSITION_TRUST_MAP[receipt.disposition];
  if (!trustClass) {
    return {
      ok: false,
      reason: "unsupported_disposition",
      message: `disposition "${receipt.disposition}" has no attested trust mapping; only external_pass and user_waiver may be imported`,
    };
  }

  const reviewer = receipt.reviewer?.trim();
  if (!reviewer) {
    return { ok: false, reason: "missing_actor", message: "receipt reviewer is required to import an attested event" };
  }

  const summary = receipt.summary?.trim();
  if (!summary) {
    return { ok: false, reason: "missing_reason", message: "receipt summary is required to import an attested event" };
  }

  const subjectSha256 = receipt.subject_sha256?.trim();
  const targetRevision = receipt.target_revision?.trim();
  if (!subjectSha256 || !targetRevision) {
    return {
      ok: false,
      reason: "missing_subject",
      message: "receipt subject_sha256 and target_revision are required to import an attested event",
    };
  }

  let active: ReturnType<typeof observeActiveReviewAdmission>;
  try { active = observeActiveReviewAdmission(input.authority); } catch (error) {
    return { ok: false, reason: 'missing_subject', message: error instanceof Error ? error.message : String(error) };
  }
  if (input.authority.repoRoot !== repoRoot || receipt.campaign_sha256 !== active.admission.campaign_sha256
    || receipt.admission_sha256 !== active.admission.admission_sha256 || receipt.grant_sha256 !== active.grant_sha256) {
    return { ok: false, reason: 'missing_subject', message: 'receipt admission is not the active protected authority' };
  }
  const targetCommit = resolveHead(repoRoot);
  if (!targetCommit) {
    return { ok: false, reason: "missing_subject", message: "worktree HEAD could not be resolved" };
  }

  const scopeHash = `sha256:${sha256Hex(JSON.stringify(active.admission.allowed_paths))}`;
  const envProviderId = `repo-harness/${providerCliVersion()}/${workspaceId(repoRoot)}`;

  const subjectIdentity: AdmittedReviewSubjectIdentity = {
    authority_commit: targetCommit,
    base_commit: targetRevision,
    target_commit: targetCommit,
    scope_hash: scopeHash,
    subject_hash: subjectSha256,
    authority_kind: 'review-admission', campaign_sha256: active.admission.campaign_sha256,
    admission_sha256: active.admission.admission_sha256, grant_sha256: active.grant_sha256,
    plan_hash: hashVerificationPlan(active.admission.verification_plan),
    command_hash: `sha256:${sha256Hex(IMPORT_COMMAND_LABEL)}`,
    env_provider_id: envProviderId,
  };

  const worktreeId = workspaceId(repoRoot);
  let genesis: GenesisRecord;
  try {
    genesis = appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId });
  } catch (error) {
    if (error instanceof UnterminatedEvidenceLogError) {
      return { ok: false, reason: "unterminated_log_tail", message: error.message };
    }
    if (error instanceof CorruptEvidenceLogError) {
      return { ok: false, reason: "corrupt_log_tail", message: error.message };
    }
    return {
      ok: false,
      reason: "genesis_epoch_conflict",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const payload: JsonValue = {
    disposition: receipt.disposition,
    reviewer: receipt.reviewer,
    source: receipt.source,
    actor: receipt.actor,
    summary: receipt.summary,
    findings_count: receipt.findings.length,
    receipt_ref: shortHashRef(subjectSha256),
  };

  const event = appendEvidenceEvent(repoRoot, {
    worktreeId: genesis.worktree_id,
    eventType: EVENT_TYPE,
    trustClass,
    producer: PRODUCER_ID,
    correlationRunId: input.correlationRunId ?? `run-${Date.now()}`,
    subjectIdentity,
    payload: { kind: "json", value: payload },
  });

  return { ok: true, event, genesis };
}
