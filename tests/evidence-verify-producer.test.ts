import { describe, expect, test } from "bun:test";
import { createHash } from "crypto";
import { execFileSync, spawnSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { emitAuthoritativeVerifyEvidence, type VerifyProducerInput } from "../src/effects/evidence/verify-producer";
import { readAcceptedEvents, readGenesisRecord } from "../src/effects/evidence/event-log";
import { buildReviewSubject } from "../src/effects/review/diff-fingerprint";

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf-8" });
}

const REPO_ROOT = join(import.meta.dir, "..");
const WRAPPER_PATH = join(REPO_ROOT, "scripts/emit-verify-evidence.ts");

function runWrapper(args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync("bun", [WRAPPER_PATH, ...args], { encoding: "utf-8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const RUN_SNAPSHOT_ARG = ".ai/harness/runs/run-20260722T170215-94226-fixture.json";

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

/**
 * Builds a minimal but real git fixture repo: one base commit (tagged
 * `base-tag`, used as `review_base` since a fixture has no `origin` remote)
 * plus one implementation commit on top, and a committed contract file
 * declaring `allowed_paths`. Mirrors the EPC-01 evidence test fixtures
 * (`tests/evidence-event-store.test.ts`) but adds real git history, which
 * this producer -- unlike EPC-01's store -- actually reads.
 */
function setupFixtureRepo(
  repoRoot: string,
  opts: { readonly allowedPaths?: readonly string[]; readonly commitContract?: boolean } = {},
): { readonly contractRelative: string } {
  mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ["init", "-q", "-b", "main"]);
  git(repoRoot, ["config", "user.email", "verify-producer-test@example.com"]);
  git(repoRoot, ["config", "user.name", "verify-producer-test"]);

  // The real target repo gitignores the evidence store (D1); mirror that here
  // so the producer's own writes never show up as untracked churn in the next
  // call's review-subject scan -- otherwise emitting evidence would itself
  // change the very subject surface being measured, breaking idempotency in
  // the fixture only (production is unaffected because it is gitignored).
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

  const allowedPaths = opts.allowedPaths ?? ["src/example.ts", "tests/example.test.ts"];
  const contractRelative = "tasks/contracts/fixture.contract.md";
  mkdirSync(join(repoRoot, "tasks", "contracts"), { recursive: true });
  const contractBody = [
    "# Task Contract: fixture",
    "",
    "## Allowed Paths",
    "",
    "```yaml",
    "allowed_paths:",
    ...allowedPaths.map((path) => `  - ${path}`),
    "```",
    "",
  ].join("\n");
  writeFileSync(join(repoRoot, contractRelative), contractBody);

  git(repoRoot, ["add", ".ai/harness/policy.json"]);
  if (opts.commitContract ?? true) {
    git(repoRoot, ["add", contractRelative]);
  }
  git(repoRoot, ["commit", "-q", "-m", "policy" + ((opts.commitContract ?? true) ? " and contract" : "")]);

  mkdirSync(join(repoRoot, "src"), { recursive: true });
  writeFileSync(join(repoRoot, "src", "example.ts"), "export const value = 1;\n");
  git(repoRoot, ["add", "src/example.ts"]);
  git(repoRoot, ["commit", "-q", "-m", "implement"]);

  return { contractRelative };
}

function baseInput(repoRoot: string, contractRelative: string, overrides: Partial<VerifyProducerInput> = {}): VerifyProducerInput {
  return {
    repoRoot,
    contractPath: contractRelative,
    commandLine: "repo-harness run verify-sprint --prepare-acceptance",
    status: "pass",
    runSnapshotPath: ".ai/harness/runs/run-20260722T170215-94226-fixture.json",
    ...overrides,
  };
}

function recomputeExpectedSubject(repoRoot: string): string {
  const subject = buildReviewSubject(repoRoot, { targetRef: "base-tag" });
  expect(subject.status).toBe("ok");
  return subject.review_subject_sha256;
}

describe("emitAuthoritativeVerifyEvidence: fail-closed paths", () => {
  test("subject mismatch fails closed and appends nothing", () => {
    withTempRepo("verify-producer-subject-mismatch", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = emitAuthoritativeVerifyEvidence(
        baseInput(repoRoot, contractRelative, { expectedSubjectSha256: "sha256:" + "0".repeat(64) }),
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("subject_mismatch");

      expect(readGenesisRecord(repoRoot)).toBeNull();
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("a dirty (uncommitted) contract fails closed and appends nothing", () => {
    withTempRepo("verify-producer-contract-dirty", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      // Modify the already-committed contract without committing the change.
      writeFileSync(join(repoRoot, contractRelative), readFileSync(join(repoRoot, contractRelative), "utf-8") + "\n<!-- dirty -->\n");

      const result = emitAuthoritativeVerifyEvidence(baseInput(repoRoot, contractRelative));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("contract_not_committed");

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("an untracked (never committed) contract fails closed and appends nothing", () => {
    withTempRepo("verify-producer-contract-untracked", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { commitContract: false });

      const result = emitAuthoritativeVerifyEvidence(baseInput(repoRoot, contractRelative));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("contract_not_committed");

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });
});

describe("emitAuthoritativeVerifyEvidence: success path", () => {
  test("emits exactly one authoritative_machine event with the complete D3 field set, accepted by the fold", () => {
    withTempRepo("verify-producer-success", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const expectedSubject = recomputeExpectedSubject(repoRoot);

      const result = emitAuthoritativeVerifyEvidence(
        baseInput(repoRoot, contractRelative, { expectedSubjectSha256: expectedSubject }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.event.event_type).toBe("verify_sprint.result");
      expect(result.event.trust_class).toBe("authoritative_machine");
      expect(result.event.event_id).toMatch(/^evt-/);

      const identity = result.event.subject_identity;
      expect(identity.subject_hash).toBe(expectedSubject);
      expect(identity.base_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.target_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.scope_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.contract_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.command_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.env_provider_id.length).toBeGreaterThan(0);
      expect(identity.authority_commit).toMatch(/^[0-9a-f]{40}$/);

      // run_snapshot_id, not the full path: EPC-01's D6 redaction replaces any
      // 32+ char dot-free run with a hash, and the real run-snapshot filename
      // (<run-id>-<contract-slug>.json) is always such a run for a realistic
      // slug, so the payload carries only the short id (see
      // shortRunSnapshotId in verify-producer.ts).
      expect(result.event.payload).toEqual({
        status: "pass",
        counts: {},
        run_snapshot_id: "run-20260722T170215-94226", // stripped the redundant "-fixture" (worktree_id) suffix
      });

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(1);
      expect(accepted[0]!.event_id).toBe(result.event.event_id);
    });
  });

  test("scope_hash reflects the contract's own allowed_paths, not the caller's", () => {
    withTempRepo("verify-producer-scope-hash", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { allowedPaths: ["src/a.ts", "src/b.ts"] });
      const result = emitAuthoritativeVerifyEvidence(baseInput(repoRoot, contractRelative));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const expectedScopeHash = `sha256:${createHash("sha256").update(JSON.stringify(["src/a.ts", "src/b.ts"])).digest("hex")}`;
      expect(result.event.subject_identity.scope_hash).toBe(expectedScopeHash);
    });
  });
});

describe("emitAuthoritativeVerifyEvidence: idempotency and genesis", () => {
  test("re-emission with identical inputs dedups to one accepted event", () => {
    withTempRepo("verify-producer-idempotent", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const input = baseInput(repoRoot, contractRelative, { correlationRunId: "run-a" });

      const first = emitAuthoritativeVerifyEvidence(input);
      const second = emitAuthoritativeVerifyEvidence({ ...input, correlationRunId: "run-b" });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(first.event.idempotency_key).toBe(second.event.idempotency_key);

      // Both calls physically appended (dedup happens at fold time, D5/D7 --
      // the append layer never skips a write; only the accepted projection
      // collapses duplicates, first occurrence wins).
      const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
      const eventLines = readFileSync(logPath, "utf-8")
        .split("\n")
        .filter((line) => line.length > 0)
        .filter((line) => JSON.parse(line).kind === "evidence_event");
      expect(eventLines.length).toBe(2);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(1);
      expect(accepted[0]!.event_id).toBe(first.event.event_id);
    });
  });

  test("genesis is written once with LEDGER_EPOCH_START_SHA across repeated emissions", () => {
    withTempRepo("verify-producer-genesis-once", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const input = baseInput(repoRoot, contractRelative);

      expect(readGenesisRecord(repoRoot)).toBeNull();

      const first = emitAuthoritativeVerifyEvidence(input);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.genesis.ledger_epoch_start_sha).toBe(LEDGER_EPOCH_START_SHA);

      const afterFirst = readGenesisRecord(repoRoot);
      expect(afterFirst).not.toBeNull();

      const second = emitAuthoritativeVerifyEvidence({ ...input, correlationRunId: "run-genesis-2" });
      expect(second.ok).toBe(true);

      const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
      const lines = readFileSync(logPath, "utf-8").split("\n").filter((line) => line.length > 0);
      const genesisLines = lines.filter((line) => JSON.parse(line).kind === "evidence_genesis");
      expect(genesisLines.length).toBe(1);
      expect(JSON.parse(genesisLines[0]!).ledger_epoch_start_sha).toBe(LEDGER_EPOCH_START_SHA);
    });
  });
});


// Cannot-bind => skip, not fail (ruling: sprint row 6 requires only that
// non-subject-bound emission is impossible and subject mismatch fails
// closed, not that every verify run emit). This wrapper is the layer that
// carries that distinction as an exit code; the producer module itself is
// unchanged (still one typed refusal for every fail-closed condition -- see
// the fail-closed describe block above, still asserting nothing appended).
describe("scripts/emit-verify-evidence.ts: exit code contract", () => {
  test("exit 0 on successful emission", () => {
    withTempRepo("wrapper-exit-success", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const res = runWrapper([
        "--repo-root", repoRoot,
        "--contract", contractRelative,
        "--command", "repo-harness run verify-sprint --prepare-acceptance",
        "--status", "pass",
        "--run-snapshot", RUN_SNAPSHOT_ARG,
      ]);
      expect(res.status, `${res.stdout}\n${res.stderr}`).toBe(0);
      expect(res.stdout).toContain("appended evt-");
    });
  });

  test("exit 3 (cannot-bind), not 1, when the contract is dirty", () => {
    withTempRepo("wrapper-exit-dirty", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      writeFileSync(
        join(repoRoot, contractRelative),
        readFileSync(join(repoRoot, contractRelative), "utf-8") + "\n<!-- dirty -->\n",
      );
      const res = runWrapper([
        "--repo-root", repoRoot,
        "--contract", contractRelative,
        "--command", "repo-harness run verify-sprint --prepare-acceptance",
        "--status", "pass",
        "--run-snapshot", RUN_SNAPSHOT_ARG,
      ]);
      expect(res.status).toBe(3);
      expect(res.stderr).toContain("cannot-bind");
      expect(res.stderr).toContain("contract_not_committed");
    });
  });

  test("exit 3 (cannot-bind), not 1, when no active contract resolves", () => {
    withTempRepo("wrapper-exit-no-contract", (repoRoot) => {
      setupFixtureRepo(repoRoot); // a real contract exists but is never named
      const res = runWrapper([
        "--repo-root", repoRoot,
        "--command", "repo-harness run verify-sprint --prepare-acceptance",
        "--status", "pass",
        "--run-snapshot", RUN_SNAPSHOT_ARG,
      ]);
      expect(res.status).toBe(3);
      expect(res.stderr).toContain("cannot-bind");
      expect(res.stderr).toContain("no_active_contract");
    });
  });

  test("exit 1 (hard fail), not 3, on subject mismatch -- must not be classified as cannot-bind", () => {
    withTempRepo("wrapper-exit-mismatch", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const res = runWrapper([
        "--repo-root", repoRoot,
        "--contract", contractRelative,
        "--command", "repo-harness run verify-sprint --prepare-acceptance",
        "--status", "pass",
        "--run-snapshot", RUN_SNAPSHOT_ARG,
        "--subject-sha256", "sha256:" + "0".repeat(64),
      ]);
      expect(res.status).toBe(1);
      expect(res.stderr).toContain("fail-closed");
      expect(res.stderr).toContain("subject_mismatch");
    });
  });
});
