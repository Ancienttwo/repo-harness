import { describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";

import type { EvidenceEventRecord, SubjectIdentity, TrustClass } from "../src/core/evidence/types";
import { appendEvidenceEvent, appendGenesisRecord, readAcceptedEvents } from "../src/effects/evidence/event-log";
import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { emitAuthoritativeVerifyEvidence } from "../src/effects/evidence/verify-producer";
import { buildReviewSubject } from "../src/effects/review/diff-fingerprint";
import {
  buildChecksLatestProjection,
  parseAcceptancePolicySummary,
  writeChecksLatest,
  type ChecksLatestProjection,
} from "../src/effects/evidence/checks-materializer";
import { canonicalize } from "../src/core/evidence/canonical-json";
import { createHash } from "crypto";
import {
  runMutationObserved,
  readPendingPostEditEvents,
  type MutationObservedCollector,
} from "../src/cli/hook/mutation-observed";

const REPO_ROOT = join(import.meta.dir, "..");
const CONTRACT_RELATIVE = "tasks/contracts/fixture.contract.md";
const SUBJECT_A = `sha256:${"a".repeat(64)}`;
const SUBJECT_B = `sha256:${"b".repeat(64)}`;
// Gatekeeper CRITICAL regression fixture: a realistic-length contract slug
// (this package's own actual slug) -- short slugs like "fixture" never
// tripped the D6 entropy pattern's 32-char threshold, which is exactly how
// the bug slipped past every other test in this file.
const LONG_SLUG = "20260722-1929-epc-05-checks-latest-materializer";
const LONG_SLUG_CONTRACT_RELATIVE = `tasks/contracts/${LONG_SLUG}.contract.md`;
const LONG_SLUG_RUN_FILE = `.ai/harness/runs/run-20260722T210100-77777-${LONG_SLUG}.json`;
const LONG_SLUG_ACTIVE_PLAN = `plans/plan-${LONG_SLUG}.md`;

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

function contractWithPolicy(policyJson: string | null): string {
  const lines = ["# Task Contract: fixture", "", "## Allowed Paths", "", "```yaml", "allowed_paths:", "  - src/example.ts", "```", ""];
  if (policyJson !== null) {
    lines.push("## Acceptance Policy", "", "```json", policyJson, "```", "");
  }
  return lines.join("\n");
}

function seedGenesis(repoRoot: string): void {
  mkdirSync(join(repoRoot, "tasks", "contracts"), { recursive: true });
  appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId: "fixture" });
}

function baseIdentity(overrides: Partial<SubjectIdentity> = {}): SubjectIdentity {
  return {
    authority_commit: "a".repeat(40),
    base_commit: "b".repeat(40),
    target_commit: "c".repeat(40),
    scope_hash: `sha256:${"d".repeat(64)}`,
    subject_hash: SUBJECT_A,
    contract_hash: `sha256:${"f".repeat(64)}`,
    command_hash: `sha256:${"0".repeat(64)}`,
    env_provider_id: "repo-harness/0.0.0/ws-test",
    ...overrides,
  };
}

/**
 * Directly appends a real event via the EPC-01 writer (not the verify
 * producer) so tests can hold precise, independent control over
 * worktree_id / trust_class / subject_hash / supersedes / run_trace --
 * mirroring EPC-03/EPC-04's own low-level ledger fixture style
 * (tests/evidence-post-bash-importer.test.ts, tests/evidence-attested-import.test.ts).
 */
function seedEvent(
  repoRoot: string,
  opts: {
    readonly worktreeId?: string;
    readonly trustClass?: TrustClass;
    readonly subjectHash?: string;
    readonly supersedes?: readonly string[];
    readonly runTraceMarker?: string;
    readonly correlationRunId?: string;
  } = {},
): EvidenceEventRecord {
  return appendEvidenceEvent(repoRoot, {
    worktreeId: opts.worktreeId ?? "fixture",
    eventType: "verify_sprint.result",
    trustClass: opts.trustClass ?? "authoritative_machine",
    producer: "verify-sprint",
    correlationRunId: opts.correlationRunId ?? `run-${Math.random().toString(36).slice(2)}`,
    subjectIdentity: baseIdentity({ subject_hash: opts.subjectHash ?? SUBJECT_A }),
    supersedes: opts.supersedes,
    payload: {
      kind: "json",
      value: {
        status: "pass",
        counts: {},
        run_snapshot_id: "run-fixture",
        run_trace: {
          schema: "repo-harness-run-trace.v1",
          status: "pass",
          marker: opts.runTraceMarker ?? "default",
        },
      },
    },
  });
}

describe("checks-materializer: D7 selection predicate", () => {
  test("exact subject match only -- a stale/different subject never satisfies", () => {
    withTempRepo("materializer-stale-subject", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { subjectHash: SUBJECT_A, runTraceMarker: "v1" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_B },
        accepted,
        contractWithPolicy(null),
      );

      expect(projection.status).toBe("unsatisfied");
      expect(projection.provenance.source_event_ids).toEqual([]);
      expect(projection.provenance.subject_hash).toBe(SUBJECT_B);
    });
  });

  test("append-position winner -- never mtime/created_at, never filename recency", () => {
    withTempRepo("materializer-append-order", (repoRoot) => {
      seedGenesis(repoRoot);
      const first = seedEvent(repoRoot, { subjectHash: SUBJECT_A, runTraceMarker: "v1", correlationRunId: "run-1" });
      const second = seedEvent(repoRoot, { subjectHash: SUBJECT_A, runTraceMarker: "v2", correlationRunId: "run-2" });
      expect(first.created_at <= second.created_at).toBe(true);

      const { accepted } = readAcceptedEvents(repoRoot);
      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy(null),
      );

      expect(projection.status).toBe("pass");
      expect((projection as Record<string, unknown>).marker).toBe("v2");
      expect(projection.provenance.source_event_ids).toEqual([first.event_id, second.event_id]);
    });
  });

  test("a superseded event is excluded from the winner even though it matches subject/trust", () => {
    withTempRepo("materializer-supersedes", (repoRoot) => {
      seedGenesis(repoRoot);
      const superseded = seedEvent(repoRoot, { subjectHash: SUBJECT_A, runTraceMarker: "superseded" });
      const winnerEvent = seedEvent(repoRoot, {
        subjectHash: SUBJECT_A,
        runTraceMarker: "superseding",
        supersedes: [superseded.event_id],
      });

      const { accepted } = readAcceptedEvents(repoRoot);
      // fold.ts's D5 accepted-set already excludes the superseded event.
      expect(accepted.find((event) => event.event_id === superseded.event_id)).toBeUndefined();

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy(null),
      );

      expect(projection.status).toBe("pass");
      expect((projection as Record<string, unknown>).marker).toBe("superseding");
      expect(projection.provenance.source_event_ids).toEqual([winnerEvent.event_id]);
    });
  });

  test("observed trust class never satisfies the gate, policy or not", () => {
    withTempRepo("materializer-observed-excluded", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { subjectHash: SUBJECT_A, trustClass: "observed", runTraceMarker: "observed-only" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy('{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}'),
      );

      expect(projection.status).toBe("unsatisfied");
      expect(projection.provenance.source_event_ids).toEqual([]);
    });
  });

  test("external_attested is admitted when the contract carries a valid Acceptance Policy block", () => {
    withTempRepo("materializer-external-attested-admitted", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { subjectHash: SUBJECT_A, trustClass: "external_attested", runTraceMarker: "attested" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy('{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}'),
      );

      expect(projection.status).toBe("pass");
      expect((projection as Record<string, unknown>).marker).toBe("attested");
    });
  });

  test("external_attested is excluded (default-deny) when the contract has no Acceptance Policy block at all", () => {
    withTempRepo("materializer-external-attested-denied", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { subjectHash: SUBJECT_A, trustClass: "external_attested", runTraceMarker: "attested" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy(null),
      );

      expect(projection.status).toBe("unsatisfied");
    });
  });

  test("human_acceptance is admitted only when the policy's user_waiver is allowed, excluded when forbidden", () => {
    withTempRepo("materializer-human-acceptance-policy-gated", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { subjectHash: SUBJECT_A, trustClass: "human_acceptance", runTraceMarker: "waived" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const allowed = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy('{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}'),
      );
      expect(allowed.status).toBe("pass");
      expect((allowed as Record<string, unknown>).marker).toBe("waived");

      const forbidden = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy('{"protocol":1,"reviewer":"Claude","user_waiver":"forbidden"}'),
      );
      expect(forbidden.status).toBe("unsatisfied");
    });
  });

  test("a different worktree_id (a different contract slug) never matches, even with an identical subject_hash", () => {
    withTempRepo("materializer-worktree-mismatch", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { worktreeId: "other-contract-slug", subjectHash: SUBJECT_A, runTraceMarker: "other" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: "tasks/contracts/fixture.contract.md", subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy(null),
      );

      expect(projection.status).toBe("unsatisfied");
    });
  });
});

describe("checks-materializer: D8 provenance", () => {
  test("provenance block carries the complete frozen field list and a self-consistent content_hash", () => {
    withTempRepo("materializer-provenance", (repoRoot) => {
      seedGenesis(repoRoot);
      const event = seedEvent(repoRoot, { subjectHash: SUBJECT_A, runTraceMarker: "provenance-check" });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: CONTRACT_RELATIVE, subjectHash: SUBJECT_A, now: () => new Date("2026-07-22T12:00:00.000Z") },
        accepted,
        contractWithPolicy(null),
      );

      const { provenance, ...consumerFacing } = projection as ChecksLatestProjection & Record<string, unknown>;
      expect(provenance.schema_version).toBe(1);
      expect(provenance.generated_at).toBe("2026-07-22T12:00:00.000Z");
      expect(typeof provenance.materializer_version).toBe("string");
      expect(provenance.materializer_version.length).toBeGreaterThan(0);
      expect(provenance.source_event_ids).toEqual([event.event_id]);
      expect(provenance.source_checkpoint_id).toBeNull();
      expect(provenance.subject_hash).toBe(SUBJECT_A);
      expect(provenance.worktree_id).toBe("fixture");
      expect(provenance.contract_id).toBe(CONTRACT_RELATIVE);

      const recomputed = `sha256:${createHash("sha256").update(canonicalize(consumerFacing as never)).digest("hex")}`;
      expect(provenance.content_hash).toBe(recomputed);
      expect(provenance.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });
  });

  test("content_hash is a pure function of the resolved event content -- identical replay reproduces identical bytes", () => {
    withTempRepo("materializer-replay-determinism", (repoRoot) => {
      seedGenesis(repoRoot);
      seedEvent(repoRoot, { subjectHash: SUBJECT_A, runTraceMarker: "replay" });
      const { accepted } = readAcceptedEvents(repoRoot);
      const input = { repoRoot, contractPath: CONTRACT_RELATIVE, subjectHash: SUBJECT_A };

      const first = buildChecksLatestProjection(input, accepted, contractWithPolicy(null));
      const second = buildChecksLatestProjection(input, accepted, contractWithPolicy(null));
      expect(first.provenance.content_hash).toBe(second.provenance.content_hash);
    });
  });

  test("an event carrying no run_trace field renders unsatisfied rather than fabricating content", () => {
    withTempRepo("materializer-no-run-trace", (repoRoot) => {
      seedGenesis(repoRoot);
      appendEvidenceEvent(repoRoot, {
        worktreeId: "fixture",
        eventType: "verify_sprint.result",
        trustClass: "authoritative_machine",
        producer: "verify-sprint",
        correlationRunId: "run-no-trace",
        subjectIdentity: baseIdentity({ subject_hash: SUBJECT_A }),
        payload: { kind: "json", value: { status: "pass", counts: {}, run_snapshot_id: "run-x" } },
      });
      const { accepted } = readAcceptedEvents(repoRoot);

      const projection = buildChecksLatestProjection(
        { repoRoot, contractPath: CONTRACT_RELATIVE, subjectHash: SUBJECT_A },
        accepted,
        contractWithPolicy(null),
      );
      expect(projection.status).toBe("unsatisfied");
    });
  });
});

describe("checks-materializer: writeChecksLatest overwrite semantics", () => {
  test("a hand-edited checks/latest.json is fully overwritten by the next materialization and carries provenance", () => {
    withTempRepo("materializer-hand-edit-overwrite", (repoRoot) => {
      seedGenesis(repoRoot);
      mkdirSync(join(repoRoot, "tasks", "contracts"), { recursive: true });
      writeFileSync(join(repoRoot, CONTRACT_RELATIVE), contractWithPolicy(null));
      seedEvent(repoRoot, { subjectHash: SUBJECT_A, runTraceMarker: "authoritative" });

      const checksFilePath = ".ai/harness/checks/latest.json";
      mkdirSync(join(repoRoot, ".ai/harness/checks"), { recursive: true });
      writeFileSync(
        join(repoRoot, checksFilePath),
        JSON.stringify({ schema: "repo-harness-run-trace.v1", status: "pass", hand_edited_marker: "do-not-trust-me" }, null, 2),
      );

      const projection = writeChecksLatest({
        repoRoot,
        contractPath: CONTRACT_RELATIVE,
        subjectHash: SUBJECT_A,
        checksFilePath,
      });

      const onDisk = JSON.parse(readFileSync(join(repoRoot, checksFilePath), "utf-8"));
      expect(onDisk.hand_edited_marker).toBeUndefined();
      expect(onDisk.marker).toBe("authoritative");
      expect(onDisk.provenance).toBeDefined();
      expect(onDisk.provenance.content_hash).toBe(projection.provenance.content_hash);
    });
  });

  test("end-to-end (gatekeeper CRITICAL regression): a realistic-length contract slug + real sha256:-prefixed review_subject_sha256 survives materialization byte-identical, D8-provenanced", () => {
    withTempRepo("materializer-end-to-end-pass", (repoRoot) => {
      setupGitFixtureRepo(repoRoot, LONG_SLUG_CONTRACT_RELATIVE);
      const expectedSubject = recomputeExpectedSubject(repoRoot);
      const runTrace = {
        schema: "repo-harness-run-trace.v1",
        status: "pass",
        source: "verify-sprint",
        exit_code: 0,
        review_subject_sha256: expectedSubject,
        run_file: LONG_SLUG_RUN_FILE,
        lifecycle: { snapshot: LONG_SLUG_RUN_FILE, evidence_tier: "harness-trace-v1" },
        contract: { file: LONG_SLUG_CONTRACT_RELATIVE, status: "pass" },
        review: { file: "tasks/reviews/fixture.review.md", status: "pass" },
        active_plan: LONG_SLUG_ACTIVE_PLAN,
        guards: [{ name: "contract", status: "pass" }],
      };
      const emitResult = emitAuthoritativeVerifyEvidence({
        repoRoot,
        contractPath: LONG_SLUG_CONTRACT_RELATIVE,
        commandLine: "repo-harness run verify-sprint --prepare-acceptance",
        status: "pass",
        runSnapshotPath: LONG_SLUG_RUN_FILE,
        expectedSubjectSha256: expectedSubject,
        runTrace,
      });
      expect(emitResult.ok).toBe(true);
      if (!emitResult.ok) return;
      expect(emitResult.event.subject_identity.subject_hash).toBe(expectedSubject);

      const projection = writeChecksLatest({
        repoRoot,
        contractPath: emitResult.contractPath,
        subjectHash: emitResult.event.subject_identity.subject_hash,
        checksFilePath: ".ai/harness/checks/latest.json",
      });

      const { provenance, ...consumerFacing } = projection as typeof projection & Record<string, unknown>;
      // Byte-equality (deep-equal) against the exact input run_trace -- the
      // exact regression that slipped through: pre-fix, review_subject_sha256
      // came back double-prefixed and every long-slug path field came back
      // partially hashed, so this assertion alone would have caught it.
      expect(consumerFacing).toEqual(runTrace);
      expect(projection.provenance.source_event_ids).toEqual([emitResult.event.event_id]);
      expect(projection.provenance.worktree_id).toBe(emitResult.genesis.worktree_id);

      // Direct, named field-level proof of the CRITICAL finding.
      expect((consumerFacing as typeof runTrace).review_subject_sha256).toBe(expectedSubject);
      expect((consumerFacing as typeof runTrace).review_subject_sha256).not.toMatch(/^sha256:sha256:/);
      expect((consumerFacing as typeof runTrace).run_file).toBe(LONG_SLUG_RUN_FILE);
      expect((consumerFacing as typeof runTrace).run_file.startsWith(".ai/harness/runs/")).toBe(true);
      expect((consumerFacing as typeof runTrace).contract.file).toBe(LONG_SLUG_CONTRACT_RELATIVE);
      expect((consumerFacing as typeof runTrace).active_plan).toBe(LONG_SLUG_ACTIVE_PLAN);
    });
  });

  test("end-to-end (gatekeeper CRITICAL regression, fail path): a realistic-length contract slug survives materialization byte-identical on a failing verify result too", () => {
    withTempRepo("materializer-end-to-end-fail", (repoRoot) => {
      setupGitFixtureRepo(repoRoot, LONG_SLUG_CONTRACT_RELATIVE);
      const expectedSubject = recomputeExpectedSubject(repoRoot);
      const runTrace = {
        schema: "repo-harness-run-trace.v1",
        status: "fail",
        source: "verify-sprint",
        exit_code: 1,
        review_subject_sha256: expectedSubject,
        run_file: LONG_SLUG_RUN_FILE,
        lifecycle: { snapshot: LONG_SLUG_RUN_FILE },
        contract: { file: LONG_SLUG_CONTRACT_RELATIVE, status: "fail" },
        active_plan: LONG_SLUG_ACTIVE_PLAN,
      };
      const emitResult = emitAuthoritativeVerifyEvidence({
        repoRoot,
        contractPath: LONG_SLUG_CONTRACT_RELATIVE,
        commandLine: "repo-harness run verify-sprint --prepare-acceptance",
        status: "fail",
        runSnapshotPath: LONG_SLUG_RUN_FILE,
        expectedSubjectSha256: expectedSubject,
        runTrace,
      });
      expect(emitResult.ok).toBe(true);
      if (!emitResult.ok) return;

      const projection = writeChecksLatest({
        repoRoot,
        contractPath: emitResult.contractPath,
        subjectHash: emitResult.event.subject_identity.subject_hash,
        checksFilePath: ".ai/harness/checks/latest.json",
      });

      const { provenance, ...consumerFacing } = projection as typeof projection & Record<string, unknown>;
      expect(consumerFacing).toEqual(runTrace);
      expect((consumerFacing as typeof runTrace).review_subject_sha256).not.toMatch(/^sha256:sha256:/);
      expect((consumerFacing as typeof runTrace).run_file).toBe(LONG_SLUG_RUN_FILE);
      expect(projection.status).toBe("fail");
      expect((projection as Record<string, unknown>).exit_code).toBe(1);
    });
  });
});

describe("checks-materializer: parseAcceptancePolicySummary", () => {
  test("mirrors acceptance-receipt.ts's own closed schema validation", () => {
    expect(parseAcceptancePolicySummary(contractWithPolicy('{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}'))).toEqual({
      present: true,
      userWaiverAllowed: true,
    });
    expect(parseAcceptancePolicySummary(contractWithPolicy('{"protocol":1,"reviewer":"Codex","user_waiver":"forbidden"}'))).toEqual({
      present: true,
      userWaiverAllowed: false,
    });
    expect(parseAcceptancePolicySummary(contractWithPolicy(null))).toEqual({ present: false, userWaiverAllowed: false });
    expect(parseAcceptancePolicySummary(contractWithPolicy('{"protocol":1,"reviewer":"Claude","user_waiver":"maybe"}'))).toEqual({
      present: false,
      userWaiverAllowed: false,
    });
  });
});

// ---------------------------------------------------------------------------
// git fixture helper (mirrors tests/evidence-verify-producer.test.ts's
// setupFixtureRepo) for the two end-to-end producer+materializer tests above.
// ---------------------------------------------------------------------------
function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf-8" });
}

function setupGitFixtureRepo(repoRoot: string, contractPath: string = CONTRACT_RELATIVE): void {
  mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ["init", "-q", "-b", "main"]);
  git(repoRoot, ["config", "user.email", "checks-materializer-test@example.com"]);
  git(repoRoot, ["config", "user.name", "checks-materializer-test"]);
  writeFileSync(join(repoRoot, ".gitignore"), ".ai/harness/evidence/\n");
  writeFileSync(join(repoRoot, "README.md"), "base\n");
  git(repoRoot, ["add", ".gitignore", "README.md"]);
  git(repoRoot, ["commit", "-q", "-m", "base"]);
  git(repoRoot, ["tag", "base-tag"]);

  mkdirSync(join(repoRoot, ".ai", "harness"), { recursive: true });
  writeFileSync(
    join(repoRoot, ".ai", "harness", "policy.json"),
    JSON.stringify({ worktree_strategy: { review_base: "base-tag" } }),
  );

  mkdirSync(join(repoRoot, dirname(contractPath)), { recursive: true });
  mkdirSync(join(repoRoot, "tasks", "reviews"), { recursive: true });
  writeFileSync(join(repoRoot, contractPath), contractWithPolicy(null));
  writeFileSync(join(repoRoot, "tasks/reviews/fixture.review.md"), "# Task Review: fixture\n");

  git(repoRoot, ["add", ".ai/harness/policy.json", contractPath, "tasks/reviews/fixture.review.md"]);
  git(repoRoot, ["commit", "-q", "-m", "policy and contract"]);

  mkdirSync(join(repoRoot, "src"), { recursive: true });
  writeFileSync(join(repoRoot, "src", "example.ts"), "export const value = 1;\n");
  git(repoRoot, ["add", "src/example.ts"]);
  git(repoRoot, ["commit", "-q", "-m", "implement"]);
}

function recomputeExpectedSubject(repoRoot: string): string {
  const subject = buildReviewSubject(repoRoot, { targetRef: "base-tag" });
  expect(subject.status).toBe("ok");
  return subject.review_subject_sha256;
}

// ---------------------------------------------------------------------------
// No-independent-authoring: proves this row's own claim -- the only writer
// of checks/latest.json anywhere in this repository is this materializer
// module plus its single call site (scripts/emit-verify-evidence.ts).
//
// Scope: this sweep covers the operating repo's own live authority surfaces
// -- the exact two sites EPC-00 froze as row 9's complete enumeration
// (scripts/verify-sprint.sh's former `cp`, .ai/hooks/lib/workflow-state.sh's
// former `{}` bootstrap) plus every other scripts/src/.ai/hooks file. It
// EXCLUDES a small, closed, named allowlist of pre-existing
// project-initialization/adoption scaffolding that seeds a DIFFERENT,
// brand-new downstream repo's genesis placeholder files (a distinct
// lifecycle: those files have no ledger yet by definition, and are
// unrelated to this worktree's own D7/D8 authority) -- confirmed unchanged
// by this package's own diff. Any writer OUTSIDE the materializer, its call
// site, and this exact allowlist fails the test.
//
// src/cli/hook/mutation-observed.ts needs NO exclusion (orchestrator ruling,
// residual finding 2b, closed in this same package): its continuous
// contract-verification cascade was a third, previously-unnamed
// direct-authoring path (`verify-contract.sh --report-file` defaulting to
// the acceptance checks_file); the fix redirects it to a dedicated
// `.ai/harness/checks/contract-verify.latest.json`, proven directly below
// rather than by exclusion.
// ---------------------------------------------------------------------------
describe("checks-materializer: no-independent-authoring", () => {
  const MATERIALIZER_MODULE = "src/effects/evidence/checks-materializer.ts";
  const MATERIALIZER_CALL_SITE = "scripts/emit-verify-evidence.ts";
  // Project-initialization / adoption scaffolding for a brand-new downstream
  // repo (never this worktree's own checks/latest.json authority); a
  // distinct, out-of-scope lifecycle per this package's Scope/Non-goals.
  const OUT_OF_SCOPE_INIT_SCAFFOLDING = new Set([
    "scripts/plan-to-todo.sh",
    "scripts/ensure-task-workflow.sh",
    "scripts/lib/project-init-lib.sh",
  ]);

  function listFiles(dir: string, exts: readonly string[]): string[] {
    const out: string[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const entry of entries) {
      const abs = join(dir, entry);
      const stat = statSync(abs);
      if (stat.isDirectory()) {
        out.push(...listFiles(abs, exts));
      } else if (exts.some((ext) => entry.endsWith(ext))) {
        out.push(abs);
      }
    }
    return out;
  }

  // Matches actual WRITE syntax targeting checks/latest.json -- not mere
  // reads (`jq -r '.status' "$checks_file"`, `readText(...)`, TS references
  // to the path string in doc/comment/gitignore-pattern contexts).
  const BASH_WRITE_PATTERNS: RegExp[] = [
    /\bcp\s+\S+\s+"?\$checks_file"?/,
    />\s*"?\$\(workflow_checks_file\)"?/,
    />\s*"?\.ai\/harness\/checks\/latest\.json"?(?!\S)/,
    />\s*"\$target_dir\/\.ai\/harness\/checks\/latest\.json"/,
  ];
  const TS_WRITE_PATTERNS: RegExp[] = [
    /writeFileSync\([^)]*checks[^)]*latest\.json/i,
    /writeFileDurably\([^)]*checks[^)]*latest\.json/i,
    /Bun\.write\([^)]*checks[^)]*latest\.json/i,
  ];

  test("grep sweep over scripts/, src/, .ai/hooks/ finds no writer outside the materializer, its call site, and the documented allowlist", () => {
    const roots = [
      { dir: join(REPO_ROOT, "scripts"), exts: [".sh"], patterns: BASH_WRITE_PATTERNS, relPrefix: "scripts/" },
      { dir: join(REPO_ROOT, ".ai/hooks"), exts: [".sh"], patterns: BASH_WRITE_PATTERNS, relPrefix: ".ai/hooks/" },
      { dir: join(REPO_ROOT, "src"), exts: [".ts"], patterns: TS_WRITE_PATTERNS, relPrefix: "src/" },
      { dir: join(REPO_ROOT, "scripts"), exts: [".ts"], patterns: TS_WRITE_PATTERNS, relPrefix: "scripts/" },
    ];

    const unexpectedWriters: string[] = [];
    for (const root of roots) {
      for (const absPath of listFiles(root.dir, root.exts)) {
        const relPath = absPath.slice(REPO_ROOT.length + 1);
        if (relPath === MATERIALIZER_MODULE || relPath === MATERIALIZER_CALL_SITE) continue;
        if (OUT_OF_SCOPE_INIT_SCAFFOLDING.has(relPath)) continue;
        const content = readFileSync(absPath, "utf-8");
        if (root.patterns.some((pattern) => pattern.test(content))) {
          unexpectedWriters.push(relPath);
        }
      }
    }

    expect(unexpectedWriters).toEqual([]);
  });

  test("the two EPC-00-named direct-authoring sites are actually gone", () => {
    const verifySprint = readFileSync(join(REPO_ROOT, "scripts/verify-sprint.sh"), "utf-8");
    expect(verifySprint).not.toMatch(/cp\s+"\$checks_report"\s+"\$checks_file"/);
    expect(verifySprint).not.toMatch(/cp\s+"\$finalized_checks"\s+"\$checks_file"/);

    const workflowState = readFileSync(join(REPO_ROOT, ".ai/hooks/lib/workflow-state.sh"), "utf-8");
    expect(workflowState).not.toMatch(/printf "\{\}\\n" > "\$\(workflow_checks_file\)"/);

    const mirror = readFileSync(join(REPO_ROOT, "assets/templates/helpers/verify-sprint.sh"), "utf-8");
    expect(mirror).toBe(verifySprint);
  });

  // Residual finding 2b (orchestrator ruling): mutation-observed.ts's own
  // continuous contract-verification cascade was a THIRD, previously
  // unnamed direct-authoring path for checks/latest.json (verify-contract.sh
  // --report-file defaulted to the acceptance checks_file). Proven directly
  // here -- not by exclusion from the grep sweep above -- that a real
  // qualifying edit's contract-verification target never resolves to the
  // acceptance-evidence path.
  test("mutation-observed.ts's continuous-verification report target is never the acceptance checks_file", () => {
    const cwd = mkdtempSync(join(tmpdir(), "materializer-mutation-observed-redirect-"));
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd });
      execFileSync("git", ["config", "user.email", "mutation-observed-redirect@example.com"], { cwd });
      execFileSync("git", ["config", "user.name", "mutation-observed-redirect"], { cwd });
      writeFileSync(join(cwd, "README.md"), "# fixture\n");
      execFileSync("git", ["add", "."], { cwd });
      execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd });

      const contractPath = "tasks/contracts/redirect-fixture.contract.md";
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      writeFileSync(
        join(cwd, contractPath),
        [
          "# Contract",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/target.ts",
          "```",
          "",
        ].join("\n"),
      );
      const planPath = "plans/plan-20260722-0000-mutation-observed-redirect-fixture.md";
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, planPath),
        ["# Plan: fixture", "", "> **Status**: Executing", `> **Task Contract**: ${contractPath}`, ""].join("\n"),
      );
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/active-plan"), planPath);
      writeFileSync(join(cwd, ".ai/harness/active-worktree"), `${cwd}\n`);

      const collector: MutationObservedCollector = {
        getRepoRoot: () => cwd,
        getWorktreeOwnership: () => ({ current: cwd, owner: null, ownedByCurrent: false }),
        getActivePlanMarker: () => planPath,
      };
      const result = runMutationObserved({
        collector,
        input: JSON.stringify({ tool_input: { file_path: "src/target.ts" } }),
      });
      expect(result.exitCode).toBe(0);

      const events = readPendingPostEditEvents(cwd);
      expect(events.length).toBe(1);
      expect(events[0]!.dirty["contract-verification"]).toBe(true);
      const target = events[0]!.payload.contract_verification;
      expect(target).toBeDefined();
      expect(target!.checks_file).not.toBe(".ai/harness/checks/latest.json");
      expect(target!.checks_file).toBe(".ai/harness/checks/contract-verify.latest.json");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
