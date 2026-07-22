/**
 * PostBash observed importer (EPC-03).
 *
 * Imports one PostBash command observation into the EPC-01 ledger as
 * exactly one `observed` trust-class event. Trust class is hard-coded --
 * there is no parameter, override, or code path in this module that can
 * emit any other `TrustClass`. `observed` never satisfies a machine gate
 * (D4), so the `UNBOUND_SENTINEL` used below for contract- and repo-state-
 * derived identity fields is safe by construction: legal ONLY here,
 * illegal for every other trust class (frozen D3/D4,
 * `### Frozen decisions (EPC-00, 2026-07-22)`).
 *
 * `src/effects/evidence/verify-producer.ts` (EPC-02) is a pattern
 * reference only -- this module does not import from it and keeps its own
 * private git/contract helpers. Per the sprint's R4 wave-qualification
 * rule, parallel evidence producers share no store writer, projection
 * writer, or barrel/export file.
 */
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import type { EvidenceEventRecord, GenesisRecord, SubjectIdentity } from "../../core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord } from "./event-log";
import { LEDGER_EPOCH_START_SHA } from "./epoch";
import { ensureRepoRelativePath } from "../path-safety";
import { uniqueSorted } from "../review/diff-fingerprint";

const PRODUCER_ID = "post-bash-importer";
const EVENT_TYPE = "post_bash.command_observed";

/** Legal ONLY for `observed` events (see module doc); never used by any other trust class. */
export const UNBOUND_SENTINEL = "unbound";

/**
 * Length of the display-only command-hash prefix carried in the payload.
 * EPC-01's D6 redaction replaces any 32+ char run of `[A-Za-z0-9+/_-]` (no
 * dot or colon breaks it) with a freshly computed `sha256:<hash>` -- a
 * full 64-char hex digest is exactly such a run, so storing it verbatim in
 * the payload would come back double-hashed and useless. 16 hex chars
 * stays well under the 32-char threshold and stays legible; the full,
 * collision-safe hash lives in `subject_identity.command_hash`.
 */
const PAYLOAD_HASH_PREFIX_LENGTH = 16;

/**
 * Length of the payload's raw-output reference. `/` is inside the D6
 * redaction charset (`[A-Za-z0-9+/_-]`), so a realistic repo-relative raw-
 * output path (e.g. this repo's own
 * `.ai/harness/runs/bash-output/post-bash-<ts>-<pid>-<hash12>.log`
 * convention) is one long dot-free run once its directory separators are
 * counted -- storing it verbatim trips the same D6 over-redaction as an
 * unshortened hash. A fixed-length suffix keeps the most distinguishing
 * tail (timestamp/pid/hash fragment) while staying unconditionally under
 * the 32-char threshold regardless of caller.
 */
const RAW_OUTPUT_REF_LENGTH = 24;

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(MODULE_DIR, "../../..");

export type PostBashImportFailureReason = "malformed_input" | "genesis_epoch_conflict";

export interface PostBashImportFailure {
  readonly ok: false;
  readonly reason: PostBashImportFailureReason;
  readonly message: string;
}

export interface PostBashImportSuccess {
  readonly ok: true;
  readonly event: EvidenceEventRecord;
  readonly genesis: GenesisRecord;
}

export type PostBashImportResult = PostBashImportSuccess | PostBashImportFailure;

export interface PostBashObservationInput {
  /** Repo root the observation was captured in. */
  readonly repoRoot: string;
  /** The exact observed command line; hashed, never interpreted or executed. */
  readonly command: string;
  readonly exitCode: number;
  readonly durationMs: number;
  /**
   * Repo-relative path to the captured raw-output log, or null/undefined
   * when no raw output was captured for this observation. Never the raw
   * output bytes themselves (D6: structured summary only).
   */
  readonly rawOutputPath?: string | null;
  readonly correlationRunId?: string;
  /**
   * Repo-relative path to the contract already resolved by the caller.
   * Falls back to `.ai/harness/active-plan` resolution when omitted (same
   * convention as `src/effects/evidence/verify-producer.ts`).
   */
  readonly contractPath?: string;
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

/** Full 40-char commit sha for `ref`, or null when it cannot be resolved (e.g. not a git repo, bad ref). */
function gitRevParseCommit(repoRoot: string, ref: string): string | null {
  const result = gitOutput(repoRoot, ["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!result.ok) return null;
  const sha = result.text.trim();
  return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
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

/** Non-empty `git status --porcelain` for the path means dirty (modified/staged) or untracked ("??"), or not a git repo at all. */
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

/** `.ai/harness/policy.json#worktree_strategy.review_base` (pattern reference: `verify-producer.ts`'s `resolveReviewBaseRef`). Defaults to `HEAD` so a fixture/standalone repo without a policy file still resolves. */
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

/** This module's own `package.json` version -- the repo-harness tool's version, independent of whichever `repoRoot` the observation came from. */
function providerCliVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf-8")) as { readonly version?: unknown };
    return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Isolated workspace/home id: a short hash of the target repo root's real
 * path (or its plain resolved path when git is unavailable). Doubles as
 * the genesis `worktree_id` fallback: deterministic per repo root, so two
 * producers racing to write the first genesis record in the same worktree
 * agree on the same value without coordinating.
 */
function workspaceId(repoRoot: string): string {
  const result = gitOutput(repoRoot, ["rev-parse", "--show-toplevel"]);
  const real = result.ok && result.text.trim() ? result.text.trim() : resolve(repoRoot);
  return `ws-${sha256Hex(real).slice(0, 12)}`;
}

/** Extract the `allowed_paths:` list from the contract's fenced ```yaml block (pattern reference: `verify-producer.ts`'s `parseContractAllowedPaths`). */
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

function validationError(input: PostBashObservationInput): string | null {
  if (typeof input.command !== "string") {
    return "command must be a string";
  }
  if (!Number.isInteger(input.exitCode)) {
    return "exitCode must be an integer";
  }
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0) {
    return "durationMs must be a non-negative finite number";
  }
  if (input.rawOutputPath !== undefined && input.rawOutputPath !== null) {
    const check = ensureRepoRelativePath(input.rawOutputPath);
    if (!check.ok) {
      return `rawOutputPath failed repo-relative validation: ${check.error}`;
    }
  }
  return null;
}

/**
 * Resolves contract-derived identity: `authority_commit`/`scope_hash`/
 * `contract_hash` bound to the active contract when one exists and is
 * committed-clean, else `UNBOUND_SENTINEL` for all three (P3: PostBash
 * telemetry must not vanish outside contract execution -- refusing would
 * silently drop the observation; the sentinel is honest labeling,
 * restricted to `observed`, which never satisfies a gate).
 */
function resolveContractIdentity(
  repoRoot: string,
  explicitContractPath: string | undefined,
): { readonly authorityCommit: string; readonly scopeHash: string; readonly contractHash: string } {
  const unbound = { authorityCommit: UNBOUND_SENTINEL, scopeHash: UNBOUND_SENTINEL, contractHash: UNBOUND_SENTINEL };

  const contractRelative = resolveContractPath(repoRoot, explicitContractPath);
  if (!contractRelative || !isContractCommittedClean(repoRoot, contractRelative)) return unbound;

  const authorityCommit = lastCommitTouching(repoRoot, contractRelative);
  if (!authorityCommit) return unbound;

  const contractBytes = readFileSync(join(repoRoot, contractRelative));
  const contractHash = `sha256:${sha256Hex(contractBytes)}`;
  const allowedPaths = parseContractAllowedPaths(contractBytes.toString("utf-8"));
  const scopeHash = `sha256:${sha256Hex(JSON.stringify(uniqueSorted(allowedPaths)))}`;
  return { authorityCommit, scopeHash, contractHash };
}

/**
 * Single entry point: imports one PostBash command observation as exactly
 * one `observed` EvidenceEvent. Fails closed (no emission, nothing
 * appended) only on malformed input or a genesis epoch conflict; never
 * refuses for a missing/dirty contract or unresolvable repo state (P3) --
 * those degrade to `UNBOUND_SENTINEL` identity fields instead, because an
 * `observed` event can never satisfy a machine gate regardless of its
 * identity fields (D4).
 */
export function importPostBashObservation(input: PostBashObservationInput): PostBashImportResult {
  const badInput = validationError(input);
  if (badInput) {
    return { ok: false, reason: "malformed_input", message: badInput };
  }

  const { repoRoot } = input;
  const reviewBaseRef = resolveReviewBaseRef(repoRoot);
  const baseCommit = gitRevParseCommit(repoRoot, reviewBaseRef) ?? UNBOUND_SENTINEL;
  const targetCommit = gitRevParseCommit(repoRoot, "HEAD") ?? UNBOUND_SENTINEL;

  const { authorityCommit, scopeHash, contractHash } = resolveContractIdentity(repoRoot, input.contractPath);
  const commandHashHex = sha256Hex(input.command);
  const commandHash = `sha256:${commandHashHex}`;
  const envProviderId = `repo-harness/${providerCliVersion()}/${workspaceId(repoRoot)}`;

  const subjectIdentity: SubjectIdentity = {
    authority_commit: authorityCommit,
    base_commit: baseCommit,
    target_commit: targetCommit,
    scope_hash: scopeHash,
    // No independent verification subject exists for an observed command;
    // the subject being observed IS the command itself. D3's field list is
    // frozen and shared across every producer -- each supplies its own
    // meaning for `subject_hash`; the value has no functional consequence
    // for gate satisfaction since `observed` never satisfies one (D4).
    subject_hash: commandHash,
    contract_hash: contractHash,
    command_hash: commandHash,
    env_provider_id: envProviderId,
  };

  let genesis: GenesisRecord;
  try {
    genesis = appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId: workspaceId(repoRoot) });
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
    trustClass: "observed",
    producer: PRODUCER_ID,
    correlationRunId: input.correlationRunId ?? `run-${Date.now()}`,
    subjectIdentity,
    payload: {
      kind: "json",
      value: {
        command_hash: commandHashHex.slice(0, PAYLOAD_HASH_PREFIX_LENGTH),
        exit_code: input.exitCode,
        duration_ms: input.durationMs,
        raw_output_ref: input.rawOutputPath == null ? null : input.rawOutputPath.slice(-RAW_OUTPUT_REF_LENGTH),
      },
    },
  });

  return { ok: true, event, genesis };
}
