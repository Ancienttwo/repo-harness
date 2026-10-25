import { parseVerificationPlanFromContractText } from '../src/core/evidence/verification-plan';
import { seedReviewAdmissionFixture } from './helpers/review-admission-fixture';
import { fixtureReviewResult } from './helpers/repo-fixture';
import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { withTempRepo } from "./helpers/repo-fixture";

import { runAcceptanceReceiptCli } from "../scripts/acceptance-receipt";
import { importAttestedEvidence, type AttestedReceiptInput } from "../src/effects/evidence/attested-import";
import { LEDGER_EPOCH_START_SHA } from "../src/effects/evidence/epoch";
import { appendGenesisRecord, readAcceptedEvents, readGenesisRecord } from "../src/effects/evidence/event-log";
import { prepareChangeAssessment } from "../src/effects/review/change-assessment";
import { buildReviewSubject } from "../src/effects/review/diff-fingerprint";
import { executeAdmittedVerification } from "../src/effects/evidence/verification-execution";

const fixtureHomes: string[] = [];
afterEach(() => { for (const home of fixtureHomes.splice(0)) rmSync(home, {recursive:true,force:true}); admissions.clear(); });
const admissions = new Map<string, ReturnType<typeof seedReviewAdmissionFixture>>();
const authorityFor = (root: string) => admissions.get(root)!.source;
function git(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf-8" });
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

  const home = mkdtempSync(join(tmpdir(), 'attested-admission-')); fixtureHomes.push(home);
  admissions.set(repoRoot, seedReviewAdmissionFixture(repoRoot, home, { allowedPaths: [...allowedPaths], reviewer: 'Claude', userWaiver: 'allowed', actor: 'kito' }));
  return { contractRelative };
}

function baseReceipt(root: string, overrides: Partial<AttestedReceiptInput> = {}): AttestedReceiptInput {
  return {
    disposition: "external_pass",
    reviewer: "Claude",
    source: "generic-review",
    actor: null,
    summary: "candidate accepted",
    findings: [],
    subject_sha256: `sha256:${"a".repeat(64)}`,
    target_revision: "0".repeat(40),
    campaign_sha256: admissions.get(root)!.admission.campaign_sha256,
    admission_sha256: admissions.get(root)!.admission.admission_sha256, grant_sha256: admissions.get(root)!.grant,
    issued_at: "2026-07-22T18:10:00.000Z",
    ...overrides,
  };
}

describe("importAttestedEvidence: trust mapping", () => {
  test("external_pass maps to external_attested", () => {
    withTempRepo("attested-import-external-pass", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt: baseReceipt(repoRoot) });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.event.trust_class).toBe("external_attested");
      expect(result.event.event_type).toBe("acceptance_receipt.attested_import");
      expect(result.event.event_id).toMatch(/^evt-/);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(1);
      expect(accepted[0]!.event_id).toBe(result.event.event_id);
    });
  }, 30_000);

  test("user_waiver maps to human_acceptance", () => {
    withTempRepo("attested-import-user-waiver", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, {
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
  }, 30_000);

  test("emits the complete D3 field set and a redaction-safe short payload", () => {
    withTempRepo("attested-import-d3-fields", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { allowedPaths: ["src/a.ts", "src/b.ts"] });
      const receipt = baseReceipt(repoRoot);
      const result = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const identity = result.event.subject_identity;
      expect(identity.subject_hash).toBe(receipt.subject_sha256);
      expect(identity.base_commit).toBe(receipt.target_revision);
      expect(identity.target_commit).toMatch(/^[0-9a-f]{40}$/);
      expect(identity.authority_commit).toMatch(/^[0-9a-f]{40}$/);
      expect('admission_sha256' in identity && identity.admission_sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.scope_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.command_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(identity.env_provider_id.length).toBeGreaterThan(0);

      // Payload must never carry a raw 32+ char dot-free run (EPC-01 D6
      // redaction would silently re-hash it into a useless value) -- assert
      // directly on the accepted event's own payload, not a pre-redaction copy.
      const payload = result.event.payload as Record<string, unknown>;
      expect(payload.disposition).toBe("external_pass");
      expect(payload.reviewer).toBe("Claude");
      expect(payload.source).toBe("generic-review");
      expect(payload.actor).toBeNull();
      expect(payload.summary).toBe("candidate accepted");
      expect(payload.findings_count).toBe(0);
      expect(typeof payload.receipt_ref).toBe("string");
      expect((payload.receipt_ref as string).length).toBeLessThan(32);
      expect(payload.receipt_ref).not.toContain("sha256:");
    });
  }, 30_000);
});

describe("importAttestedEvidence: fail-closed paths", () => {
  test("unknown disposition fails closed and appends nothing", () => {
    withTempRepo("attested-import-unknown-disposition", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { disposition: "reject" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unsupported_disposition");
      expect(readGenesisRecord(repoRoot)).toBeNull();
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  }, 30_000);

  test("a completely bogus disposition also fails closed", () => {
    withTempRepo("attested-import-bogus-disposition", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { disposition: "totally-invented" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("unsupported_disposition");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  }, 30_000);

  test("missing actor (empty reviewer) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-actor", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { reviewer: "" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_actor");
      expect(readGenesisRecord(repoRoot)).toBeNull();
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  }, 30_000);

  test("missing reason (blank summary) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-reason", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { summary: "   " }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_reason");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  }, 30_000);

  test("missing subject (empty subject_sha256) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-subject-hash", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { subject_sha256: "" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_subject");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  }, 30_000);

  test("missing subject (empty target_revision) fails closed and appends nothing", () => {
    withTempRepo("attested-import-missing-target-revision", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { target_revision: "" }),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_subject");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  }, 30_000);

  test("a revoked admission fails closed despite a contract file and appends nothing", () => {
    withTempRepo("attested-import-uncommitted-contract", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot, { commitContract: false });
      writeFileSync(join(admissions.get(repoRoot)!.directory, 'active.json'), JSON.stringify({ protocol: 1, revision: 2, grant_sha256: null }));
      const result = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt: baseReceipt(repoRoot) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("missing_subject");
      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(0);
    });
  }, 30_000);
});

describe("importAttestedEvidence: default-deny at trust level", () => {
  test("an attested-only ledger leaves the authoritative filter empty", () => {
    withTempRepo("attested-import-default-deny", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const first = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt: baseReceipt(repoRoot) });
      const second = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, {
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
  }, 30_000);
});

describe("importAttestedEvidence: idempotency and genesis", () => {
  test("identical re-import dedups to one accepted event (two physical appends)", () => {
    withTempRepo("attested-import-idempotent", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const receipt = baseReceipt(repoRoot);

      const first = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt, correlationRunId: "run-a" });
      const second = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt, correlationRunId: "run-b" });
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
  }, 30_000);

  test("re-importing a receipt with a different subject is not deduped", () => {
    withTempRepo("attested-import-distinct-subject", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      const first = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt: baseReceipt(repoRoot) });
      const second = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { subject_sha256: `sha256:${"c".repeat(64)}` }),
      });
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(first.event.idempotency_key).not.toBe(second.event.idempotency_key);

      const { accepted } = readAcceptedEvents(repoRoot);
      expect(accepted.length).toBe(2);
    });
  }, 30_000);

  test("genesis is written once with LEDGER_EPOCH_START_SHA across repeated imports", () => {
    withTempRepo("attested-import-genesis-once", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      expect(readGenesisRecord(repoRoot)).toBeNull();

      const receipt = baseReceipt(repoRoot);
      const first = importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.genesis.ledger_epoch_start_sha).toBe(LEDGER_EPOCH_START_SHA);

      const second = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { subject_sha256: `sha256:${"d".repeat(64)}` }),
      });
      expect(second.ok).toBe(true);

      const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
      const lines = readFileSync(logPath, "utf-8").split("\n").filter((line) => line.length > 0);
      const genesisLines = lines.filter((line) => JSON.parse(line).kind === "evidence_genesis");
      expect(genesisLines.length).toBe(1);
      expect(JSON.parse(genesisLines[0]!).ledger_epoch_start_sha).toBe(LEDGER_EPOCH_START_SHA);
    });
  }, 30_000);
});

describe("importAttestedEvidence: unterminated log tail", () => {
  for (const tail of ["sole genesis", "event"] as const) {
    test(`an unterminated ${tail} record fails closed as unterminated_log_tail, not genesis_epoch_conflict`, () => {
      withTempRepo("attested-import-unterminated-tail", (repoRoot) => {
        const { contractRelative } = setupFixtureRepo(repoRoot);
        if (tail === "sole genesis") {
          appendGenesisRecord(repoRoot, LEDGER_EPOCH_START_SHA, { worktreeId: "attested-import-unterminated-tail" });
        } else {
          expect(importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt: baseReceipt(repoRoot) }).ok).toBe(true);
        }
        const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
        const terminated = readFileSync(logPath);
        writeFileSync(logPath, terminated.subarray(0, terminated.length - 1));
        const unterminated = readFileSync(logPath);

        const result = importAttestedEvidence({
          repoRoot,
          authority: authorityFor(repoRoot),
          receipt: baseReceipt(repoRoot, { subject_sha256: `sha256:${"e".repeat(64)}` }),
        });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe("unterminated_log_tail");
        expect(result.message).toContain("ends with an unterminated record; run a recovery read first");
        expect(readFileSync(logPath).equals(unterminated)).toBe(true);
      });
    }, 30_000);
  }
});

describe("importAttestedEvidence: corrupt terminated log line", () => {
  test("a terminated line that does not parse fails closed as corrupt_log_tail and does not append", () => {
    withTempRepo("attested-import-corrupt-line", (repoRoot) => {
      const { contractRelative } = setupFixtureRepo(repoRoot);
      expect(importAttestedEvidence({ repoRoot, authority: authorityFor(repoRoot), receipt: baseReceipt(repoRoot) }).ok).toBe(true);
      const logPath = join(repoRoot, ".ai", "harness", "evidence", "events", "log.jsonl");
      writeFileSync(logPath, Buffer.concat([readFileSync(logPath), Buffer.from("{\"kind\":\"evidence_event\"}{\n")]));
      const corrupt = readFileSync(logPath);

      const result = importAttestedEvidence({
        repoRoot,
        authority: authorityFor(repoRoot),
        receipt: baseReceipt(repoRoot, { subject_sha256: `sha256:${"e".repeat(64)}` }),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe("corrupt_log_tail");
      expect(result.message).toContain("has a corrupt record at line 3; run a recovery read first");
      expect(readFileSync(logPath).equals(corrupt)).toBe(true);
    });
  }, 30_000);
});

describe("scripts/acceptance-receipt.ts record: attested-import wiring", () => {
  const cwdStack: string[] = [];
  const cleanupDirs: string[] = [];
  const verificationReport = ".ai/harness/runs/attested-import.report.json";

  afterEach(() => {
    while (cwdStack.length > 0) process.chdir(cwdStack.pop()!);
    while (cleanupDirs.length > 0) rmSync(cleanupDirs.pop()!, { recursive: true, force: true });
  });

  function stableJson(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }

  function changeAssessmentEvidence(root: string): Record<string, unknown> {
    const prepared = prepareChangeAssessment({ repoRoot: root, authority: authorityFor(root) });
    if (prepared.assessment.status !== "ready" || !prepared.packet || prepared.packet.status !== "ready") {
      throw new Error("fixture Change Assessment must be ready");
    }
    const basis = {
      schema: "repo-harness-change-assessment-evidence.v1",
      status: "pass",
      assessment: prepared.assessment,
      selection_packet: prepared.packet,
    };
    return { ...basis, evidence_sha256: `sha256:${createHash("sha256").update(stableJson(basis)).digest("hex")}` };
  }

  function writeNativeVerification(root: string): void {
    const subject = buildReviewSubject(root, { targetRef: "main" });
    expect(subject.status).toBe("ok");
    const report = executeAdmittedVerification({
      repoRoot: root,
      authority: authorityFor(root),
      reportFile: verificationReport,
    });
    if (report.kind !== "verification_execution_report" || !report.passed) {
      throw new Error("fixture tracked feature check must execute successfully");
    }
    writeFileSync(
      join(root, ".ai/harness/checks/change-assessment.latest.json"),
      JSON.stringify(changeAssessmentEvidence(root), null, 2) + "\n",
    );
  }

  function ledgerState(root: string) {
    return {
      bytes: readFileSync(join(root, ".ai/harness/evidence/events/log.jsonl")),
      accepted: readAcceptedEvents(root).accepted,
      genesis: readGenesisRecord(root),
    };
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
    writeFileSync(join(root, ".gitignore"), ".ai/harness/checks/\n.ai/harness/evidence/\n.ai/harness/runs/\n");
    writeFileSync(
      join(root, ".ai", "harness", "policy.json"),
      JSON.stringify({ worktree_strategy: { review_base: "main" } }, null, 2) + "\n",
    );
    writeFileSync(join(root, "base.txt"), "base\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "base"]);

    git(root, ["checkout", "-q", "-b", "codex/fixture-cli"]);
    writeFileSync(join(root, "feature.txt"), "candidate\n");
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
        "## Allowed Paths",
        "",
        "```yaml",
        "allowed_paths:",
        "  - feature.txt",
        "  - plans/",
        "  - tasks/",
        "```",
        "",
        "## Evidence Requirements",
        "",
        "```yaml",
        "evidence_requirements:",
        "  benchmark: not_applicable",
        "```",
        "",
        "## Verification Plan",
        "",
        "```json",
        JSON.stringify({ protocol: 1, checks: [{
          id: "feature-content",
          kind: "command",
          command: 'test "$(cat feature.txt)" = candidate',
          cwd: ".",
          phase: "verification",
          cost: "normal",
          evidence_policy: "current_exact",
          necessity: "Read and validate the tracked candidate file.",
          inputs: { env: [] },
        }] }),
        "```",
        "",
        "## Acceptance Policy",
        "",
        "```json",
        '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}',
        "```",
        "",
        "## Change Assessment",
        "",
        "```json",
        '{"protocol":1,"oracles":[]}',
        "```",
        "",
      ].join("\n"),
    );
    writeFileSync(join(root, "tasks", "reviews", "fixture-cli.review.md"), "# Review\n\n> **Recommendation**: pass\n");
    git(root, ["add", "-A"]);
    git(root, ["commit", "-q", "-m", "candidate"]);
    admissions.set(root, seedReviewAdmissionFixture(root, home, { reviewer: 'Claude', userWaiver: 'allowed', actor: 'fixture-owner',
      allowedPaths: ['*'], oracles: [], plan: parseVerificationPlanFromContractText(readFileSync(join(root, 'tasks/contracts/fixture-cli.contract.md'), 'utf8')) }));
    writeNativeVerification(root);

    return { root, home };
  }

  test("real record --disposition external_pass appends one accepted external_attested event", async () => {
    const { root, home } = setupCliFixture();
    cwdStack.push(process.cwd());
    process.chdir(root);

    const reviewResultFile = join(home, 'fixture-review-result.json');
    writeFileSync(reviewResultFile, JSON.stringify(await fixtureReviewResult({ root, authority: authorityFor(root), verification: verificationReport, reviewer: 'Claude', disposition: 'external_pass', summary: 'cli wiring dogfood fixture', findings: [] })));
    const before = ledgerState(root);
    const exitCode = await runAcceptanceReceiptCli(
      [
        "record", "--review-result", reviewResultFile,
        "--verification", verificationReport,
        "--disposition", "external_pass",
        "--reviewer", "Claude",
        "--source", "generic-review",
        "--summary", "cli wiring dogfood fixture",
      ],
      { authorityHome: home, admissionSource: () => authorityFor(root) },
    );
    expect(exitCode).toBe(0);

    const after = ledgerState(root);
    expect(after.accepted.slice(0, before.accepted.length)).toEqual(Array.from(before.accepted));
    expect(after.bytes.subarray(0, before.bytes.length)).toEqual(before.bytes);
    expect(after.genesis).toEqual(before.genesis);
    const accepted = after.accepted.slice(before.accepted.length);
    expect(after.accepted.length).toBe(before.accepted.length + 1);
    expect(accepted.length).toBe(1);
    expect(accepted[0]!.trust_class).toBe("external_attested");
    expect(accepted[0]!.event_type).toBe("acceptance_receipt.attested_import");
  }, 30_000);

  test("real record --disposition reject does not touch the ledger", async () => {
    const { root, home } = setupCliFixture();
    cwdStack.push(process.cwd());
    process.chdir(root);

    const reviewResultFile = join(home, 'fixture-review-result.json');
    writeFileSync(reviewResultFile, JSON.stringify(await fixtureReviewResult({ root, authority: authorityFor(root), verification: verificationReport, reviewer: 'Claude', disposition: 'reject', summary: 'rejected in cli wiring fixture', findings: [{ severity: 'P1', message: 'blocking issue' }] })));
    const before = ledgerState(root);
    const exitCode = await runAcceptanceReceiptCli(
      [
        "record", "--review-result", reviewResultFile,
        "--verification", verificationReport,
        "--disposition", "reject",
        "--reviewer", "Claude",
        "--source", "generic-review",
        "--summary", "rejected in cli wiring fixture",
        "--findings-json", '[{"severity":"P1","message":"blocking issue"}]',
      ],
      { authorityHome: home, admissionSource: () => authorityFor(root) },
    );
    // Existing, pre-EPC-04 behavior: reject still exits 1 (unaffected by this package's wiring).
    expect(exitCode).toBe(1);
    const after = ledgerState(root);
    expect(after.genesis).toEqual(before.genesis);
    expect(after.bytes).toEqual(before.bytes);
    expect(Array.from(after.accepted)).toEqual(Array.from(before.accepted));
    expect(after.accepted.slice(before.accepted.length)).toHaveLength(0);
    expect(after.accepted.filter(event => event.event_type === "acceptance_receipt.attested_import")).toHaveLength(0);
  }, 30_000);

});
