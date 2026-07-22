/**
 * The authoritative verify producer (Sprint C backlog row 6). The
 * `verify-sprint` chain is the only surface entitled to emit
 * `authoritative_machine` EvidenceEvents (D4); this module is the single
 * entry point that does so, binding emission to a complete D3 subject
 * identity by construction -- there is no API path that emits with a
 * partial subject. Callers cannot inject identity fields (subject_hash,
 * scope_hash, contract_hash, command_hash, env_provider_id,
 * authority_commit, base_commit, target_commit); this module computes every
 * one of them from repo state. Callers may only supply raw inputs the
 * function cannot itself observe (the exact command line string, an
 * optional expected subject hash used for verification only, and the small
 * structured result payload) plus an optional explicit contract path (see
 * "Active contract resolution" below).
 *
 * EPC-01 read-only imports only: `../../core/evidence/types`,
 * `./event-log`. No EPC-01 file is modified by this package.
 *
 * Active contract resolution: `verify-sprint.sh` already resolves "which
 * contract is active for this run" through its own chain (`--contract`
 * override, `workflow_active_contract`, or a sorted fallback) before this
 * producer is ever invoked. Re-deriving that resolution independently here
 * would be a second, potentially divergent authority for the same datum, so
 * `contractPath` is accepted as an optional input: when the wiring in
 * `scripts/verify-sprint.sh` supplies it, that is the single source of
 * truth for this run. It falls back to the repo's own
 * `.ai/harness/active-plan` convention (`plans/plan-<slug>.md` ->
 * `tasks/contracts/<slug>.contract.md`, the same convention
 * `src/cli/hook/subagent-handler.ts`'s `activeContractPath` uses) only for
 * direct/standalone callers that never resolved a contract themselves.
 */
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import type { EvidenceEventRecord, GenesisRecord, JsonValue, SubjectIdentity } from "../../core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord } from "./event-log";
import { buildReviewSubject, uniqueSorted } from "../review/diff-fingerprint";
import { LEDGER_EPOCH_START_SHA } from "./epoch";

const PRODUCER_ID = "verify-sprint";
const EVENT_TYPE = "verify_sprint.result";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(MODULE_DIR, "../../..");

export type VerifyProducerFailureReason =
  | "no_active_contract"
  | "contract_not_committed"
  | "subject_mismatch"
  | "genesis_epoch_conflict";

export interface VerifyProducerFailure {
  readonly ok: false;
  readonly reason: VerifyProducerFailureReason;
  readonly message: string;
}

export interface VerifyProducerSuccess {
  readonly ok: true;
  readonly event: EvidenceEventRecord;
  readonly genesis: GenesisRecord;
  readonly contractPath: string;
}

export type VerifyProducerResult = VerifyProducerSuccess | VerifyProducerFailure;

export interface VerifyProducerInput {
  /** Repo root the verification ran against. */
  readonly repoRoot: string;
  /** The exact verification command line invoked; hashed, never interpreted. */
  readonly commandLine: string;
  /** Small structured verdict for the payload (D6: payloads stay small and structured). */
  readonly status: "pass" | "fail";
  /** Repo-relative path to the run snapshot; validated as a payload path field by the EPC-01 writer. */
  readonly runSnapshotPath: string;
  /** Small structured counts for the payload; kept flat and numeric so no long strings can leak into it. */
  readonly counts?: Readonly<Record<string, number>>;
  /** Frozen subject hash the caller expects; emission fails closed if the recomputed hash differs. */
  readonly expectedSubjectSha256?: string;
  readonly correlationRunId?: string;
  /**
   * Repo-relative path to the contract already resolved by the caller (see
   * module doc). Falls back to `.ai/harness/active-plan` resolution when
   * omitted.
   */
  readonly contractPath?: string;
  /**
   * EPC-05 payload upgrade: the full finalized run-trace object (everything
   * `scripts/verify-sprint.sh`'s own `checks_report` already computed), so
   * the checks/latest.json materializer can reconstruct the consumer-facing
   * projection from the ledger alone. Optional and purely additive -- when
   * omitted, the emitted payload is byte-identical to the pre-EPC-05 shape
   * (this keeps every existing direct caller of this function, including
   * tests/evidence-verify-producer.test.ts, unaffected). D6's existing
   * "json" payload construction (path-safety + redaction, then inline-or-blob
   * by size) applies to this field exactly as it does to every other
   * payload value -- no new bypass of that construction invariant.
   */
  readonly runTrace?: JsonValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

/** `.ai/harness/active-plan` -> `plans/plan-<slug>.md` -> `tasks/contracts/<slug>.contract.md` (fallback only). */
function resolveActiveContractPathFromMarker(repoRoot: string): string | null {
  const markerPath = join(repoRoot, ".ai/harness/active-plan");
  if (!existsSync(markerPath)) return null;
  let marker: string;
  try {
    marker = readFileSync(markerPath, "utf-8").trim();
  } catch {
    return null;
  }
  const match = /^plans\/plan-([A-Za-z0-9][A-Za-z0-9._-]*)\.md$/.exec(marker);
  if (!match) return null;
  const contractRelative = `tasks/contracts/${match[1]}.contract.md`;
  return existsSync(join(repoRoot, contractRelative)) ? contractRelative : null;
}

function resolveContractPath(repoRoot: string, explicit: string | undefined): string | null {
  if (explicit !== undefined) {
    const absolute = join(repoRoot, explicit);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) return null;
    return explicit;
  }
  return resolveActiveContractPathFromMarker(repoRoot);
}

/** Non-empty `git status --porcelain` for the path means dirty (modified/staged) or untracked ("??"). */
function isContractCommittedClean(repoRoot: string, contractRelative: string): boolean {
  const result = gitOutput(repoRoot, ["status", "--porcelain", "--", contractRelative]);
  return result.ok && result.text.trim().length === 0;
}

function lastCommitTouching(repoRoot: string, relativePath: string): string | null {
  const result = gitOutput(repoRoot, ["log", "-1", "--format=%H", "--", relativePath]);
  if (!result.ok) return null;
  const sha = result.text.trim();
  return sha.length > 0 ? sha : null;
}

/** `.ai/harness/policy.json#worktree_strategy.review_base` (pattern reference: `scripts/acceptance-receipt.ts`'s `reviewBase`). Defaults to `HEAD` so a fixture/standalone repo without a policy file still resolves. */
function resolveReviewBaseRef(repoRoot: string): string {
  const policyPath = join(repoRoot, ".ai/harness/policy.json");
  if (!existsSync(policyPath)) return "HEAD";
  try {
    const policy = JSON.parse(readFileSync(policyPath, "utf-8")) as unknown;
    const value = isRecord(policy) && isRecord(policy.worktree_strategy) ? policy.worktree_strategy.review_base : undefined;
    return typeof value === "string" && value.trim() !== "" ? value : "HEAD";
  } catch {
    return "HEAD";
  }
}

/** This module's own `package.json` version -- the repo-harness tool's version, independent of whichever `repoRoot` is being verified. */
function providerCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8")) as { readonly version?: unknown };
    return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Isolated workspace/home id: a short hash of the target repo root's real path, so two parallel worktrees never collide. */
function workspaceId(repoRoot: string): string {
  const result = gitOutput(repoRoot, ["rev-parse", "--show-toplevel"]);
  const real = result.ok && result.text.trim() ? result.text.trim() : resolve(repoRoot);
  return `ws-${sha256Hex(real).slice(0, 12)}`;
}

/**
 * `worktree_id` (the ledger's own field) is populated with the active
 * contract's own slug -- this system's actual reduction of D7's
 * "worktree_id == current AND contract_id == active contract" into one
 * filterable field. Exported so `checks-materializer.ts` (owned by this
 * same package) derives the identical value rather than re-implementing it;
 * this is not a re-opening of the EPC-02/03/04 "no shared private helper"
 * wave qualification, which concerned proving independence across DIFFERENT
 * parallel packages, not sharing within one serial package's own two files.
 */
export function worktreeIdFor(contractRelative: string): string {
  const base = contractRelative.split("/").pop() ?? contractRelative;
  return base.replace(/\.contract\.md$/, "");
}

/**
 * EPC-01's D6 redaction replaces any 32+ char run of `[A-Za-z0-9+/_-]` (no
 * dot breaks it) with `sha256:<hash>` -- construction-invariant, cannot be
 * bypassed or modified here (read-only import). The real run-snapshot
 * filename (`<run-id>-<contract-slug>.json`, `scripts/verify-sprint.sh`'s
 * `run_file`) is always such a run for any realistic contract slug, so
 * storing it verbatim in the payload would always come back as a useless
 * hash. The contract-slug suffix is redundant with `worktree_id` (same
 * string, already in the event envelope, never redacted since redaction
 * only walks the payload) -- so only the short run-id prefix needs to be
 * in the payload; a reader reconstructs the real path as
 * `.ai/harness/runs/<run_snapshot_id>-<worktree_id>.json`.
 */
function shortRunSnapshotId(runSnapshotPath: string, worktreeId: string): string {
  const withoutExtension = basename(runSnapshotPath).replace(/\.json$/, "");
  const worktreeSuffix = `-${worktreeId}`;
  return withoutExtension.endsWith(worktreeSuffix)
    ? withoutExtension.slice(0, -worktreeSuffix.length)
    : withoutExtension;
}

/** Extract the `allowed_paths:` list from the contract's fenced ```yaml block (pattern reference: `scripts/verify-sprint.sh`'s `contract_allowed_paths`). */
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

/**
 * Single entry point: resolves the active contract, recomputes the review
 * subject, builds the complete D3 identity, ensures genesis, and appends
 * exactly one `authoritative_machine` event. Fails closed (no emission)
 * without touching the store on every named condition below.
 */
export function emitAuthoritativeVerifyEvidence(input: VerifyProducerInput): VerifyProducerResult {
  const { repoRoot } = input;

  const contractRelative = resolveContractPath(repoRoot, input.contractPath);
  if (!contractRelative) {
    return {
      ok: false,
      reason: "no_active_contract",
      message: "no active contract could be resolved (no explicit contractPath and .ai/harness/active-plan did not resolve to an existing contract file)",
    };
  }

  if (!isContractCommittedClean(repoRoot, contractRelative)) {
    return {
      ok: false,
      reason: "contract_not_committed",
      message: `active contract ${contractRelative} is dirty or untracked; authority must be committed before evidence can bind to it`,
    };
  }

  const authorityCommit = lastCommitTouching(repoRoot, contractRelative);
  if (!authorityCommit) {
    return {
      ok: false,
      reason: "contract_not_committed",
      message: `no commit touches ${contractRelative}; authority must be committed before evidence can bind to it`,
    };
  }

  const reviewBaseRef = resolveReviewBaseRef(repoRoot);
  const subject = buildReviewSubject(repoRoot, { targetRef: reviewBaseRef });
  if (subject.status !== "ok") {
    return {
      ok: false,
      reason: "subject_mismatch",
      message: `review subject could not be computed: ${subject.reason ?? "unknown"}`,
    };
  }
  if (input.expectedSubjectSha256 !== undefined && input.expectedSubjectSha256 !== subject.review_subject_sha256) {
    return {
      ok: false,
      reason: "subject_mismatch",
      message: `expected subject ${input.expectedSubjectSha256} does not match the recomputed subject ${subject.review_subject_sha256}`,
    };
  }

  const contractAbsolute = join(repoRoot, contractRelative);
  const contractBytes = readFileSync(contractAbsolute);
  const contractHash = `sha256:${sha256Hex(contractBytes)}`;
  const allowedPaths = parseContractAllowedPaths(contractBytes.toString("utf-8"));
  const scopeHash = `sha256:${sha256Hex(JSON.stringify(uniqueSorted(allowedPaths)))}`;
  const commandHash = `sha256:${sha256Hex(input.commandLine)}`;
  const envProviderId = `repo-harness/${providerCliVersion()}/${workspaceId(repoRoot)}`;

  const subjectIdentity: SubjectIdentity = {
    authority_commit: authorityCommit,
    base_commit: subject.target_rev,
    target_commit: subject.head_rev,
    scope_hash: scopeHash,
    subject_hash: subject.review_subject_sha256,
    contract_hash: contractHash,
    command_hash: commandHash,
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

  const event = appendEvidenceEvent(repoRoot, {
    worktreeId: genesis.worktree_id,
    eventType: EVENT_TYPE,
    trustClass: "authoritative_machine",
    producer: PRODUCER_ID,
    correlationRunId: input.correlationRunId ?? `run-${Date.now()}`,
    subjectIdentity,
    payload: {
      kind: "json",
      value: {
        status: input.status,
        counts: input.counts ?? {},
        // Short id, not the full path -- see shortRunSnapshotId's doc comment.
        // Reconstruct with: `.ai/harness/runs/${run_snapshot_id}-${worktree_id}.json`.
        run_snapshot_id: shortRunSnapshotId(input.runSnapshotPath, worktreeId),
        // EPC-05: additive only -- omitted entirely (not even as an explicit
        // `undefined`) when the caller supplies no runTrace, so this object's
        // own shape is byte-identical to the pre-EPC-05 payload in that case.
        ...(input.runTrace !== undefined ? { run_trace: input.runTrace } : {}),
      },
    },
  });

  return { ok: true, event, genesis, contractPath: contractRelative };
}
