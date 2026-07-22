import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { importAttestedEvidence, type AttestedReceiptInput } from "../src/effects/evidence/attested-import";
import { readAcceptedEvents, readGenesisRecord } from "../src/effects/evidence/event-log";
import { buildReviewSubject } from "../src/effects/review/diff-fingerprint";
import { runAcceptanceReceiptCli } from "../scripts/acceptance-receipt";

function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf-8" });
}

function withTempRepo(prefix: string, fn: (repoRoot: string) => void): void {
  const repoRoot = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(repoRoot);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}

/**
 * Minimal real git fixture: one base commit plus a committed contract file
 * declaring `allowed_paths`. `importAttestedEvidence` only reads HEAD and
 * the contract's own commit history -- unlike `verify-producer.ts`'s
 * fixtures it never scans working-tree diff/status, so no `.gitignore`
 * dance for the evidence store is needed for idempotency here.
 */
function setupFixtureRepo(
  repoRoot: string,
  opts: { readonly allowedPaths?: readonly string[]; readonly commitContract?: boolean } = {},
): { readonly contractRelative: string } {
  mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ["init", "-q", "-b", "main"]);
  git(repoRoot, ["config", "user.email", "attested-import-test@example.com"]);
  git(repoRoot, ["config", "user.name", "attested-import-test"]);

  writeFileSync(join(repoRoot, ".gitignore"), ".ai/harness/evidence/\n");
  writeFileSync(join(repoRoot, "README.md"), "base\n");
  git(repoRoot, ["add", ".gitignore", "README.md"]);
  git(repoRoot, ["commit", "-q", "-m", "base"]);

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

  if (opts.commitContract ?? true) {
    git(repoRoot, ["add", contractRelative]);
    git(repoRoot, ["commit", "-q", "-m", "contract"]);
  }

  return { contractRelative };
}

function baseReceipt(contractRelative: string, overrides: Partial<AttestedReceiptInput> = {}): AttestedReceiptInput {
  return {
    disposition: "external_pass",
    reviewer: "Claude",
    source: "claude-review",
    actor: null,
    summary: "candidate accepted",
    findings: [],
    subject_sha256: `sha256:${"a".repeat(64)}`,
    target_revision: "0".repeat(40),
    contract_file: contractRelative,
    issued_at: "2026-07-22T18:10:00.000Z",
    ...overrides,
  };
}

describe("importAttestedEvidence: trust mapping", () => {
  test("external_pass maps to external_attested", () => {
    withTempRepo("attested-import-external-pass", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({ repoRoot, receipt: baseReceipt(contractRelative) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.trust_class).toBe("external_attested");
      expect(result.event.event_type).toBe("acceptance_receipt.attested_import");
      expect(result.event.event_id).toMatch(/^evt-/);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(1);
      expect(accepted[0]!.event_id).toBe(result.event.event_id);
    });
  });

  test("user_waiver maps to human_acceptance", () => {
    withTempRepo("attested-import-user-waiver", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, {
          disposition: "user_waiver",
          reviewer: "User",
          source: "user-waiver",
          actor: "kito",
        }),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.trust_class).toBe("human_acceptance");
    });
  });

  test("emits the complete D3 field set and a redaction-safe short payload", () => {
    withTempRepo("attested-import-d3-fields", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { allowedPaths: ["src/a.ts", "src/b.ts"] });
      const receipt = baseReceipt(contractRelative);
      const result = importAttestedEvidence({ repoRoot, receipt });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const identity = result.event.subject_identity;
      expect(identity.subject_hash).toBe(receipt.subject_sha256);
      expect(identity.base_commit).toBe(receipt.target_revision);
      expect(identity.target_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.authority_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.contract_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.scope_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.command_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.env_provider_id.length).toBeGreaterThan(0);

      // Payload must never carry a raw 32+ char dot-free run (EPC-01 D6
      // redaction would silently re-hash it into a useless value) -- assert
      // directly on the accepted event's own payload, not a pre-redaction copy.
      const payload = result.event.payload as Record<string, unknown>;
      expect(payload.disposition).toBe("external_pass");
      expect(payload.reviewer).toBe("Claude");
      expect(payload.source).toBe("claude-review");
      expect(payload.actor).toBeNull();
      expect(payload.summary).toBe("candidate accepted");
      expect(payload.findings_count).toBe(0);
      expect(typeof payload.receipt_ref).toBe("string");
      expect((payload.receipt_ref as string).length).toBeLessThan(32);
      expect(payload.receipt_ref).not.toContain("sha256:");
    });
  });
});

describe("importAttestedEvidence: fail-closed paths", () => {
  test("unknown disposition fails closed and appends nothing", () => {
    withTempRepo("attested-import-unknown-disposition", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { disposition: "reject" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unsupported_disposition");
      expect(readGenesisRecord(repoRoot)).toBeNull();
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("a completely bogus disposition also fails closed", () => {
    withTempRepo("attested-import-bogus-disposition", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { disposition: "totally-invented" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unsupported_disposition");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("missing actor (empty reviewer) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-actor", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { reviewer: "" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_actor");
      expect(readGenesisRecord(repoRoot)).toBeNull();
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("missing reason (blank summary) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-reason", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { summary: "   " }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_reason");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("missing subject (empty subject_sha256) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-subject-hash", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { subject_sha256: "" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_subject");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("missing subject (empty target_revision) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-target-revision", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { target_revision: "" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_subject");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });

  test("an uncommitted contract file fails closed (no authority commit) and appends nothing", () => {
    withTempRepo("attested-import-uncommitted-contract", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { commitContract: false });
      const result = importAttestedEvidence({ repoRoot, receipt: baseReceipt(contractRelative) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_subject");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  });
});

describe("importAttestedEvidence: default-deny at trust level", () => {
  test("an attested-only ledger leaves the authoritative filter empty", () => {
    withTempRepo("attested-import-default-deny", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const first = importAttestedEvidence({ repoRoot, receipt: baseReceipt(contractRelative) });
      const second = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, {
          disposition: "user_waiver",
          reviewer: "User",
          source: "user-waiver",
          actor: "kito",
          subject_sha256: `sha256:${"b".repeat(64)}`,
        }),
      });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(2);
      expect(accepted.every((event) => event.trust_class !== "authoritative_machine")).toBe(true);
      expect(accepted.every((event) => event.trust_class !== "observed")).toBe(true);

      // The D7 selection predicate admits only authoritative_machine by
      // default; an attested-only ledger must therefore filter to empty --
      // this is the default-deny property this package proves at fold level.
      const authoritative = accepted.filter((event) => event.trust_class === "authoritative_machine");
      expect(authoritative.length).toBe(0);
    });
  });
});

describe("importAttestedEvidence: idempotency and genesis", () => {
  test("identical re-import dedups to one accepted event (two physical appends)", () => {
    withTempRepo("attested-import-idempotent", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const receipt = baseReceipt(contractRelative);

      const first = importAttestedEvidence({ repoRoot, receipt, correlationRunId: "run-a" });
      const second = importAttestedEvidence({ repoRoot, receipt, correlationRunId: "run-b" });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;

      expect(first.event.idempotency_key).toBe(second.event.idempotency_key);

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

  test("re-importing a receipt with a different subject is not deduped", () => {
    withTempRepo("attested-import-distinct-subject", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const first = importAttestedEvidence({ repoRoot, receipt: baseReceipt(contractRelative) });
      const second = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { subject_sha256: `sha256:${"c".repeat(64)}` }),
      });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.event.idempotency_key).not.toBe(second.event.idempotency_key);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(2);
    });
  });

  test("genesis is written once with LEDGER_EPOCH_START_SHA across repeated imports", () => {
    withTempRepo("attested-import-genesis-once", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      expect(readGenesisRecord(repoRoot)).toBeNull();

      const receipt = baseReceipt(contractRelative);
      const first = importAttestedEvidence({ repoRoot, receipt });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.genesis.ledger_epoch_start_sha).toBe(LEDGER_EPOCH_START_SHA);

      const second = importAttestedEvidence({
        repoRoot,
        receipt: baseReceipt(contractRelative, { subject_sha256: `sha256:${"d".repeat(64)}` }),
      });
      expect(second.ok).toBe(true);

      const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
      const lines = readFileSync(logPath, "utf-8").split("\n").filter((line) => line.length > 0);
      const genesisLines = lines.filter((line) => JSON.parse(line).kind === "evidence_genesis");
      expect(genesisLines.length).toBe(1);
      expect(JSON.parse(genesisLines[0]!).ledger_epoch_start_sha).toBe(LEDGER_EPOCH_START_SHA);
    });
  });
});

describe("scripts/acceptance-receipt.ts record: attested-import wiring", () => {
  const cwdStack: string[] = [];
  const cleanupDirs: string[] = [];

  afterEach(() => {
    while (cwdStack.length > 0) process.chdir(cwdStack.pop()!);
    while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  });

  function writePassingChecks(root: string): void {
    const subject = buildReviewSubject(root, { targetRef: "main" });
    expect(subject.status).toBe("ok");
    writeFileSync(
      join(root, ".ai", "harness", "checks", "latest.json"),
      JSON.stringify(
        {
          schema: "repo-harness-run-trace.v1",
          source: "verify-sprint",
          status: "pass",
          exit_code: 0,
          active_plan: "plans/plan-fixture.md",
          review_subject_sha256: subject.review_subject_sha256,
          benchmark_evidence: { status: "not_applicable", report_sha256: "not-applicable" },
          commands: [{ name: "verify-sprint", status: "pass", exit_code: 0 }],
          guards: [
            { name: "contract", status: "pass" },
            { name: "review", status: "pass" },
            { name: "allowed_paths", status: "pass" },
          ],
          contract: { file: "tasks/contracts/fixture-cli.contract.md" },
          review: { file: "tasks/reviews/fixture-cli.review.md" },
        },
        null,
        2,
      ) + "\n",
    );
  }

  /** Real git fixture mirroring tests/acceptance-receipt.test.ts's makeFixture, self-contained here since that file is out of this package's allowed_paths. */
  function setupCliFixture(): { root: string; home: string } {
    const root = mkdtempSync(join(tmpdir(), "attested-import-cli-repo-"));
    const home = mkdtempSync(join(tmpdir(), "attested-import-cli-home-"));
    cleanupDirs.push(root, home);

    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "attested-import-cli-test@example.com"]);
    git(root, ["config", "user.name", "attested-import-cli-test"]);
    mkdirSync(join(root, ".ai", "harness", "checks"), { recursive: true });
    mkdirSync(join(root, "plans"), { recursive: true });
    mkdirSync(join(root, "tasks", "contracts"), { recursive: true });
    mkdirSync(join(root, "tasks", "reviews"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), ".ai/harness/checks/\n.ai/harness/evidence/\n");
    writeFileSync(
      join(root, ".ai", "harness", "policy.json"),
      JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2) + "\n",
    );
    writeFileSync(join(root, "base.txt"), "base\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "base"]);

    git(root, ["checkout", "-q", "-b", "codex/fixture-cli"]);
    writeFileSync(join(root, "plans", "plan-fixture.md"), "# Plan: fixture-cli\n\n> **Status**: Executing\n");
    writeFileSync(
      join(root, "tasks", "contracts", "fixture-cli.contract.md"),
      [
        "# Task Contract: fixture-cli",
        "",
        "> **Status**: Active",
        "> **Plan**: plans/plan-fixture.md",
        "> **Owner**: fixture-owner",
        "",
        "## Acceptance Policy",
        "",
        "```json",
        '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
        "```",
        "",
      ].join("\n"),
    );
    writeFileSync(join(root, "tasks", "reviews", "fixture-cli.review.md"), "# Review\n\n> **Recommendation**: pass\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "candidate"]);
    writePassingChecks(root);

    return { root, home };
  }

  test("real record --disposition external_pass appends one accepted external_attested event", async () => {
    const { root, home } = setupCliFixture();
    cwdStack.push(process.cwd());
    process.chdir(root);

    const exitCode = await runAcceptanceReceiptCli(
      [
        "record",
        "--contract", "tasks/contracts/fixture-cli.contract.md",
        "--verification", ".ai/harness/checks/latest.json",
        "--disposition", "external_pass",
        "--reviewer", "Claude",
        "--source", "claude-review",
        "--summary", "cli wiring dogfood fixture",
      ],
      { authorityHome: home },
    );
    expect(exitCode).toBe(0);

    const { accepted } = readAcceptedEvents(root);
    expect(accepted.length).toBe(1);
    expect(accepted[0]!.trust_class).toBe("external_attested");
    expect(accepted[0]!.event_type).toBe("acceptance_receipt.attested_import");
  });

  test("real record --disposition reject does not touch the ledger", async () => {
    const { root, home } = setupCliFixture();
    cwdStack.push(process.cwd());
    process.chdir(root);

    const exitCode = await runAcceptanceReceiptCli(
      [
        "record",
        "--contract", "tasks/contracts/fixture-cli.contract.md",
        "--verification", ".ai/harness/checks/latest.json",
        "--disposition", "reject",
        "--reviewer", "Claude",
        "--source", "claude-review",
        "--summary", "rejected in cli wiring fixture",
        "--findings-json", '[{"severity":"P1","message":"blocking issue"}]',
      ],
      { authorityHome: home },
    );
    // Existing, pre-EPC-04 behavior: reject still exits 1 (unaffected by this package's wiring).
    expect(exitCode).toBe(1);
    expect(readGenesisRecord(root)).toBeNull();
  });
});
