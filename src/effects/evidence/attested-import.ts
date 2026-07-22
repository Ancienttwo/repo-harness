/**
 * Manual/external attested import (Sprint C backlog row 8). Imports one
 * recorded AcceptanceReceipt into the EPC-01 ledger as ONE attested
 * EvidenceEvent, binding a closed two-entry trust mapping by construction
 * (D4): `external_pass` -> `external_attested`; `user_waiver` ->
 * `human_acceptance`. Any other disposition fails closed -- there is no API
 * path in this module that emits `authoritative_machine` or `observed`.
 *
 * EPC-01/EPC-02 read-only imports only: `../../core/evidence/types`,
 * `./event-log`, `./epoch`. No EPC-01/EPC-02 file is modified by this
 * package.
 *
 * D3 subject identity: `subject_sha256`/`target_revision` come straight from
 * the receipt's own binding -- the receipt already froze these at record
 * time, so recomputing them fresh here could silently diverge from what the
 * reviewer actually accepted (plan P3). The remaining identity fields
 * (`target_commit`, `contract_hash`, `scope_hash`, `authority_commit`,
 * `env_provider_id`) are not carried by the receipt at all, so they are
 * computed from current repo state the same way
 * `src/effects/evidence/verify-producer.ts` computes them (read-only
 * pattern reference). That module's equivalent helpers are private and
 * unexported and the file itself is read-only, so the small git/parsing
 * helpers below are necessarily local, independent copies -- see
 * tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md.
 */
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import type {
  EvidenceEventRecord,
  GenesisRecord,
  JsonValue,
  SubjectIdentity,
  TrustClass,
} from "../../core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord } from "./event-log";
import { LEDGER_EPOCH_START_SHA } from "./epoch";

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
  | "genesis_epoch_conflict";

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
export interface AttestedReceiptInput {
  readonly disposition: string;
  readonly reviewer: string;
  readonly source: string;
  readonly actor: string | null;
  readonly summary: string;
  readonly findings: readonly { readonly severity: string; readonly message: string }[];
  readonly subject_sha256: string;
  readonly target_revision: string;
  readonly contract_file: string;
  readonly issued_at: string;
}

export interface AttestedImportInput {
  /** Repo root the receipt was recorded against. */
  readonly repoRoot: string;
  readonly receipt: AttestedReceiptInput;
  readonly correlationRunId?: string;
}

function sha256Hex(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function gitOutput(repoRoot: string, args: readonly string[]): { readonly ok: boolean; readonly text: string } {
  try {
    const text = execFileSync("git", ["-C", repoRoot, "--literal-pathspecs", ...args], {
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

function lastCommitTouching(repoRoot: string, relativePath: string): string | null {
  const result = gitOutput(repoRoot, ["log", "-1", "--format=%H", "--", relativePath]);
  if (!result.ok) return null;
  const sha = result.text.trim();
  return sha.length > 0 ? sha : null;
}

/**
 * This module's own `package.json` version -- the repo-harness tool's own
 * version, independent of whichever `repoRoot` is being imported into
 * (pattern reference: `verify-producer.ts`'s private `providerCliVersion`;
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

/** Isolated workspace id (pattern reference: `verify-producer.ts`'s private `workspaceId`; necessarily duplicated). */
function workspaceId(repoRoot: string): string {
  const result = gitOutput(repoRoot, ["rev-parse", "--show-toplevel"]);
  const real = result.ok && result.text.trim() ? result.text.trim() : repoRoot;
  return `ws-${sha256Hex(real).slice(0, 12)}`;
}

/**
 * Extract the `allowed_paths:` list from the contract's fenced ```yaml block
 * (pattern reference: `verify-producer.ts`'s private `parseContractAllowedPaths`;
 * necessarily duplicated -- see module doc).
 */
function parseContractAllowedPaths(contractText: string): readonly string[] {
  const yamlBlockPattern = /```yaml\r?\n([\s\S]*?)\r?\n```/g;
  let match: RegExpExecArray | null;
  while ((match = yamlBlockPattern.exec(contractText)) !== null) {
    const block = match[1] ?? "";
    if (!/(^|\s)allowed_paths:/m.test(block)) continue;
    const lines = block.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => /^\s*allowed_paths:\s*$/.test(line));
    if (startIndex === -1) continue;
    const paths: string[] = [];
    for (let i = startIndex + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (/^\S/.test(line)) break;
      const itemMatch = line.match(/^\s*-\s*(.+?)\s*$/);
      if (!itemMatch) continue;
      const value = (itemMatch[1] ?? "").replace(/^["'`]+|["'`]+$/g, "");
      if (value.length > 0) paths.push(value);
    }
    return paths;
  }
  return [];
}

function uniqueSortedPaths(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

function worktreeIdFor(contractRelative: string): string {
  const base = contractRelative.split("/").pop() ?? contractRelative;
  return base.replace(/\.contract\.md$/, "");
}

/**
 * D6 redaction hashes any 32+ char dot-free alnum run; a full
 * `sha256:<64-hex>` reference stored verbatim would come back uselessly
 * re-hashed (the exact bug EPC-02's dogfood run caught), so only a short
 * prefix travels in the payload (pattern reference: `verify-producer.ts`'s
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

  const contractRelative = receipt.contract_file?.trim();
  if (!contractRelative || !existsSync(join(repoRoot, contractRelative))) {
    return {
      ok: false,
      reason: "missing_subject",
      message: `receipt contract_file is missing or unreadable: ${receipt.contract_file}`,
    };
  }

  const targetCommit = resolveHead(repoRoot);
  if (!targetCommit) {
    return { ok: false, reason: "missing_subject", message: "worktree HEAD could not be resolved" };
  }

  const authorityCommit = lastCommitTouching(repoRoot, contractRelative);
  if (!authorityCommit) {
    return {
      ok: false,
      reason: "missing_subject",
      message: `no commit touches ${contractRelative}; authority commit is unavailable`,
    };
  }

  const contractBytes = readFileSync(join(repoRoot, contractRelative));
  const contractHash = `sha256:${sha256Hex(contractBytes)}`;
  const allowedPaths = parseContractAllowedPaths(contractBytes.toString("utf-8"));
  const scopeHash = `sha256:${sha256Hex(JSON.stringify(uniqueSortedPaths(allowedPaths)))}`;
  const envProviderId = `repo-harness/${providerCliVersion()}/${workspaceId(repoRoot)}`;

  const subjectIdentity: SubjectIdentity = {
    authority_commit: authorityCommit,
    base_commit: targetRevision,
    target_commit: targetCommit,
    scope_hash: scopeHash,
    subject_hash: subjectSha256,
    contract_hash: contractHash,
    command_hash: `sha256:${sha256Hex(IMPORT_COMMAND_LABEL)}`,
    env_provider_id: envProviderId,
  };

  const worktreeId = worktreeIdFor(contractRelative);
  let genesis: GenesisRecord;
  try {
    genesis = appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId });
  } catch (error) {
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
