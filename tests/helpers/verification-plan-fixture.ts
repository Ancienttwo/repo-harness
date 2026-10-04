import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { canonicalize } from "../../src/core/evidence/canonical-json";
import type { JsonValue } from "../../src/core/evidence/types";
import { prepareChangeAssessment } from "../../src/effects/review/change-assessment";
import { executeVerificationContract, type VerificationContractOutcome } from "../../src/effects/evidence/verification-execution";

export const EMPTY_VERIFICATION_PLAN_SECTION = [
  "## Verification Plan",
  "",
  "```json",
  '{"protocol":1,"checks":[]}',
  "```",
  "",
].join("\n");

export function withEmptyVerificationPlan(contractText: string): string {
  return `${contractText.replace(/\s*$/, "\n\n")}${EMPTY_VERIFICATION_PLAN_SECTION}`;
}

/** Produce receipt-consumable evidence through the real execution authority. */
export function emptyVerificationEvaluation(repoRoot: string, contractPath: string): VerificationContractOutcome {
  return executeVerificationContract({ repoRoot, contractPath });
}

/** A genuine acceptance input shared by archive and receipt boundary tests. */
export function seedAcceptanceFixture(prefix = "repo-harness-native-acceptance") {
  const root = mkdtempSync(join(tmpdir(), prefix + "-repo-"));
  const home = mkdtempSync(join(tmpdir(), prefix + "-home-"));
  const contract = "tasks/contracts/demo.contract.md";
  const verification = ".ai/harness/runs/acceptance.report.json";
  const git = (...args: string[]) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Acceptance fixture");
  git("config", "user.email", "acceptance@fixture.local");
  mkdirSync(join(root, ".ai/harness/checks"), { recursive: true });
  mkdirSync(join(root, ".ai/harness/runs"), { recursive: true });
  mkdirSync(join(root, "tasks/contracts"), { recursive: true });
  mkdirSync(join(root, "tasks/reviews"), { recursive: true });
  mkdirSync(join(root, "plans"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".ai/harness/checks/\n.ai/harness/runs/\n.ai/harness/evidence/\n");
  writeFileSync(join(root, ".ai/harness/policy.json"), JSON.stringify({ worktree_strategy: { review_base: "main" }, merge_gate: { enabled: true, rule: "fixture" } }));
  writeFileSync(join(root, "base.txt"), "base\n");
  git("add", "-A"); git("commit", "-q", "-m", "fixture base");
  git("checkout", "-qb", "codex/demo");
  writeFileSync(join(root, "feature.txt"), "candidate\n");
  writeFileSync(join(root, "plans/plan-demo.md"), "# Plan: demo\n\n> **Status**: Executing\n");
  writeFileSync(join(root, "tasks/reviews/demo.review.md"), "# Review\n\n> **Recommendation**: pass\n");
  const fence = String.fromCharCode(96).repeat(3);
  writeFileSync(join(root, contract), [
    "# Task Contract: demo", "", "> **Status**: Active", "> **Plan**: plans/plan-demo.md", "> **Owner**: kito", "",
    "## Allowed Paths", "", fence + "yaml", "allowed_paths:", "  - feature.txt", "  - plans/", "  - tasks/", "  - .ai/harness/policy.json", fence, "",
    "## Evidence Requirements", "", fence + "yaml", "evidence_requirements:", "  benchmark: not_applicable", fence, "",
    "## Acceptance Policy", "", fence + "json", '{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}', fence, "",
    "## Change Assessment", "", fence + "json", '{"protocol":1,"oracles":[]}', fence, "",
    "## Verification Plan", "", fence + "json", JSON.stringify({ protocol: 1, checks: [
      { id: "feature-content", kind: "command", command: 'test "$(cat feature.txt)" = candidate', cwd: ".", phase: "verification", cost: "normal",
        evidence_policy: "current_exact", necessity: "Validate the tracked candidate file.", inputs: { env: [] } },
    ] }), fence, "",
  ].join("\n"));
  git("add", "-A"); git("commit", "-q", "-m", "fixture candidate");
  const report = executeVerificationContract({ repoRoot: root, contractPath: contract, reportFile: verification });
  if (!report.passed) throw new Error("genuine feature check did not pass");
  const prepared = prepareChangeAssessment({ repoRoot: root, contractPath: contract });
  const basis = { schema: "repo-harness-change-assessment-evidence.v1", status: "pass", assessment: prepared.assessment, selection_packet: prepared.packet };
  writeFileSync(join(root, ".ai/harness/checks/change-assessment.latest.json"), JSON.stringify({ ...basis,
    evidence_sha256: "sha256:" + createHash("sha256").update(canonicalize(basis as unknown as JsonValue)).digest("hex"),
  }, null, 2) + "\n");
  return { root, home, contract, verification };
}
