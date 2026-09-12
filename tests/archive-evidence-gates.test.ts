import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "fs";
import { join } from "path";
import { copyHelpers } from "./helpers/helper-script-fixture";
import { run as scriptRun, tmpWorkspace, withTempRepo } from "./helpers/repo-fixture";

const ROOT = join(import.meta.dir, "..");

const FIXTURE_AUTHORITY_ENV_KEYS = [
  "REPO_HARNESS_TARGET_REPO_ROOT",
  "REPO_HARNESS_HELPER_SOURCE_PATH",
  "REPO_HARNESS_SOURCE_ROOT",
] as const;

function fixtureEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const isolated = { ...process.env };
  for (const key of FIXTURE_AUTHORITY_ENV_KEYS) delete isolated[key];
  return {
    ...isolated,
    HOOK_HOST: "codex",
    REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
    ...env,
  };
}

function run(script: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync("bash", [script, ...args], {
    cwd,
    encoding: "utf-8",
    env: fixtureEnv({
      REPO_HARNESS_BUN_BIN: process.execPath,
      REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, ".ai/hooks/lib/workflow-state.sh"),
      ...env,
    }),
  });
}

function runProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: fixtureEnv(env),
  });
}


function installWorkflowArchiveFixture(cwd: string): void {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
  mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
  mkdirSync(join(cwd, "plans"), { recursive: true });
  mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
  mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
  copyFileSync(join(ROOT, "scripts/archive-workflow.sh"), join(cwd, "scripts/archive-workflow.sh"));
  copyFileSync(join(ROOT, "scripts/classify-historical-plans.ts"), join(cwd, "scripts/classify-historical-plans.ts"));
  writeFileSync(
    join(cwd, ".ai/harness/policy.json"),
    `${JSON.stringify({
      worktree_strategy: {
        review_base: "main",
        merge_back: { target: "main" },
      },
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(cwd, "scripts/acceptance-receipt.ts"),
    [
      "import { existsSync, realpathSync } from 'fs';",
      "export function parseAcceptancePolicy(text: string) {",
      "  const body = text.match(/^## Acceptance Policy[ \\t]*\\r?\\n+```json[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```[ \\t]*$/m)?.[1];",
      "  if (!body) throw new Error('contract Acceptance Policy JSON block is missing');",
      "  return JSON.parse(body);",
      "}",
      "export function acceptancePolicySource(policy: { protocol: number; reviewer: string; source?: string }) {",
      "  if (policy.protocol === 2) return policy.source;",
      "  return policy.reviewer === 'Claude' ? 'claude-review' : 'codex-review';",
      "}",
      "const expected = process.env.EXPECT_ACCEPTANCE_CWD;",
      "const cwdMatches = !expected || realpathSync(process.cwd()) === realpathSync(expected);",
      "if (import.meta.main) process.exit(existsSync('.acceptance-pass') && cwdMatches ? 0 : 1);",
      "",
    ].join("\n"),
  );
  copyFileSync(
    join(ROOT, "assets/hooks/lib/workflow-state.sh"),
    join(cwd, ".ai/hooks/lib/workflow-state.sh"),
  );
  writeFileSync(
    join(cwd, "scripts/check-architecture-sync.sh"),
    [
      "#!/bin/bash",
      "if [[ \"${ARCH_FRESHNESS_FAIL:-0}\" == \"1\" ]]; then",
      "  echo 'architecture freshness failed' >&2",
      "  exit 19",
      "fi",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(cwd, "scripts/refresh-current-status.sh"),
    [
      "#!/bin/bash",
      "if [[ \"${ARCHIVE_REFRESH_FAIL:-0}\" == \"1\" ]]; then",
      "  echo 'current status refresh failed' >&2",
      "  exit 23",
      "fi",
      "mkdir -p tasks",
      "printf '# Current Status Snapshot\\n\\n> **Status**: Idle\\n' > tasks/current.md",
      "",
    ].join("\n"),
  );
  chmodSync(join(cwd, "scripts/archive-workflow.sh"), 0o755);
  chmodSync(join(cwd, "scripts/check-architecture-sync.sh"), 0o755);
  chmodSync(join(cwd, "scripts/refresh-current-status.sh"), 0o755);
  writeFileSync(
    join(cwd, "plans/plan-20260711-1200-demo.md"),
    "# Plan: demo\n\n> **Status**: Executing\n\n## Unique Plan Body\n\nKeep this content.\n",
  );
  writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n\nPreserve this ledger body.\n");
}

function writeWorkflowContract(cwd: string, status: string): void {
  writeFileSync(
    join(cwd, "tasks/contracts/20260711-1200-demo.contract.md"),
    // writeWorkflowChecks below records benchmark_evidence.status as
    // not_applicable, so the contract's own declaration must match or the new
    // contract-scoped evidence_requirements gate fails closed before any of
    // this file's injected-failure scenarios are ever reached.
    [
      "# Task Contract: demo",
      "",
      `> **Status**: ${status}`,
      "",
      "## Evidence Requirements",
      "",
      "```yaml",
      "evidence_requirements:",
      "  benchmark: not_applicable",
      "```",
      "",
      "## Acceptance Policy",
      "",
      "```json",
      '{"protocol":2,"reviewer":"Codex","source":"codex-plugin","user_waiver":"allowed"}',
      "```",
      "",
    ].join("\n"),
  );
}

function ensureReviewBaseline(cwd: string): void {
  if (runProcess("git", ["rev-parse", "--verify", "HEAD"], cwd).status === 0) return;
  expect(runProcess("git", ["init", "-b", "main"], cwd).status).toBe(0);
  expect(runProcess("git", ["config", "user.name", "Archive Test"], cwd).status).toBe(0);
  expect(runProcess("git", ["config", "user.email", "archive@test.local"], cwd).status).toBe(0);
  expect(runProcess("git", ["add", "."], cwd).status).toBe(0);
  expect(runProcess("git", ["commit", "-m", "fixture review baseline"], cwd).status).toBe(0);
}

function currentReviewBinding(cwd: string): { subject: string; targetRevision: string } {
  ensureReviewBaseline(cwd);
  const result = runProcess(
    "bun",
    [join(ROOT, "src/cli/hook-entry.ts"), "review-subject", "--target", "main", "--format", "json"],
    cwd,
  );
  expect(result.status).toBe(0);
  const parsed = JSON.parse(result.stdout);
  expect(parsed.status).toBe("ok");
  return {
    subject: parsed.review_subject_sha256,
    targetRevision: parsed.target_rev,
  };
}

function writeWorkflowReview(cwd: string, recommendation: string, external = "unavailable"): void {
  const binding = currentReviewBinding(cwd);
  writeFileSync(
    join(cwd, "tasks/reviews/20260711-1200-demo.review.md"),
    [
      "# Task Review: demo",
      "",
      `> **Recommendation**: ${recommendation}`,
      "> **Review Rubric Version**: 2",
      `> **Reviewed Subject SHA256**: ${binding.subject}`,
      "> **Reviewed Subject Scope**: normalized-final-content",
      `> **Reviewed Target Revision**: ${binding.targetRevision}`,
      "",
      "## External Acceptance Advice",
      "",
      `> **External Acceptance**: ${external}`,
      ...(external === "pass" ? [
        "> **External Reviewer**: Claude",
        "> **External Source**: claude-review",
        "> **External Started**: 2026-07-14T04:00:00+0800",
        "> **External Completed**: 2026-07-14T04:01:00+0800",
        "> **Review Rubric Version**: 2",
        `> **Reviewed Subject SHA256**: ${binding.subject}`,
        "> **Reviewed Subject Scope**: normalized-final-content",
        `> **Reviewed Target Revision**: ${binding.targetRevision}`,
        "> **Benchmark Evidence SHA256**: not-applicable",
        "",
        "- P1 blockers: none",
        "- P2 advisories: none",
        "- Acceptance checklist: pass",
      ] : []),
      "",
    ].join("\n"),
  );
  if (external === "pass") writeFileSync(join(cwd, ".acceptance-pass"), "fixture typed receipt\n");
}

function writeWorkflowChecks(cwd: string): void {
  writeFileSync(
    join(cwd, ".ai/harness/checks/latest.json"),
    '{"status":"pass","source":"verify-sprint","exit_code":0,"contract":{"file":"tasks/contracts/20260711-1200-demo.contract.md"},"review":{"file":"tasks/reviews/20260711-1200-demo.review.md"},"benchmark_evidence":{"status":"not_applicable","report_sha256":"","benchmark_subject_sha256":""}}\n',
  );
}

function writeSealedWorkflowReview(cwd: string): void {
  writeFileSync(
    join(cwd, "tasks/reviews/20260711-1200-demo.review.md"),
    [
      "# Task Review: demo",
      "",
      "> **Recommendation**: pass",
      "",
      "## Acceptance Receipt Projection",
      "",
      "> **Disposition**: external_pass",
      "> **Reviewer**: Codex",
      "> **Source**: codex-plugin",
      "> **Actor**: not-applicable",
      `> **Reviewed Subject SHA256**: sha256:${"a".repeat(64)}`,
      "> **Reviewed Subject Scope**: normalized-final-content",
      `> **Reviewed Target Revision**: ${"b".repeat(40)}`,
      `> **Verification Evidence SHA256**: sha256:${"c".repeat(64)}`,
      "> **Issued At**: 2026-07-24T00:00:00.000Z",
      "",
      "- Summary: accepted",
      "- Findings: none",
      "",
    ].join("\n"),
  );
}

function archiveWorkflow(cwd: string, outcome = "Completed", env: NodeJS.ProcessEnv = {}) {
  return run(
    "scripts/archive-workflow.sh",
    ["--plan", "plans/plan-20260711-1200-demo.md", "--outcome", outcome],
    cwd,
    env,
  );
}

function installArchitectureArchiveFixture(cwd: string): void {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  mkdirSync(join(cwd, "docs/architecture/requests"), { recursive: true });
  mkdirSync(join(cwd, "docs/architecture/modules/runtime"), { recursive: true });
  copyFileSync(
    join(ROOT, "scripts/archive-architecture-request.sh"),
    join(cwd, "scripts/archive-architecture-request.sh"),
  );
  copyFileSync(
    join(ROOT, "scripts/architecture-event.ts"),
    join(cwd, "scripts/architecture-event.ts"),
  );
  mkdirSync(join(cwd, ".ai/harness/architecture"), { recursive: true });
  writeFileSync(
    join(cwd, "scripts/architecture-queue.sh"),
    [
      "#!/bin/bash",
      "printf '%s\\n' \"$*\" >> .queue-calls",
      "if [[ \"${ARCH_QUEUE_FAIL_ON_CHECK:-0}\" == \"1\" && \"$*\" == \"reindex --check\" ]]; then",
      "  echo 'pre-archive reindex check failed' >&2",
      "  exit 31",
      "fi",
      "if [[ \"${ARCH_QUEUE_FAIL_ON_POST:-0}\" == \"1\" && \"$*\" == \"reindex\" ]]; then",
      "  echo 'post-archive reindex failed' >&2",
      "  exit 29",
      "fi",
      "",
    ].join("\n"),
  );
  chmodSync(join(cwd, "scripts/archive-architecture-request.sh"), 0o755);
  chmodSync(join(cwd, "scripts/architecture-queue.sh"), 0o755);
  writeFileSync(join(cwd, "docs/architecture/index.md"), "# Architecture Index\n");
  writeFileSync(
    join(cwd, "docs/architecture/modules/runtime/demo.md"),
    "# Architecture Module: runtime/demo\n\nUpdated durable truth.\n",
  );
}

function writeArchitectureRequest(cwd: string, status = "Pending"): void {
  writeFileSync(
    join(cwd, "docs/architecture/requests/runtime-demo.md"),
    [
      "# Architecture Drift Request: runtime-demo",
      "",
      `> **Status**: ${status}`,
      "> **Architecture Module**: `docs/architecture/modules/runtime/demo.md`",
      "",
      "## Human Decision Context",
      "",
      "Preserve this exact request rationale.",
      "",
    ].join("\n"),
  );
}

function archiveArchitecture(cwd: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return run(
    "scripts/archive-architecture-request.sh",
    ["--request", "docs/architecture/requests/runtime-demo.md", "--status", "resolved", ...args],
    cwd,
    env,
  );
}

describe("archive evidence gates", () => {
  test("one-shot historical closeouts are truthfully marked Superseded", () => {
    for (const slug of ["no-fallback-distribution", "archcontext-boundary-bridge"]) {
      const planName = slug === "no-fallback-distribution"
        ? "plan-20260703-1405-no-fallback-distribution.md"
        : "plan-20260706-0211-archcontext-boundary-bridge.md";
      expect(readFileSync(join(ROOT, "plans/archive", planName), "utf-8")).toContain("> **Status**: Superseded");
      for (const lifecycle of ["contract", "notes", "review"]) {
        const archive = readFileSync(
          join(ROOT, "tasks/archive", `${lifecycle}-20260711-0240-${slug}.md`),
          "utf-8",
        );
        expect(archive).toContain("> **Outcome**: Superseded");
        expect(archive).not.toContain("> **Outcome**: Completed");
        if (lifecycle === "notes") {
          expect(archive).toContain("## 2026-07-11 Archive Migration Correction");
          expect(archive).toContain("without producing completion evidence current to that archive");
        }
      }
    }
  });

  test("contract-worktree does not mask Sprint backlog projection failures", () => {
    const source = readFileSync(join(ROOT, "scripts/contract-worktree.sh"), "utf-8");
    expect(source).toContain('backfill_sprint_backlog "$active_plan"');
    expect(source).not.toContain('backfill_sprint_backlog "$active_plan" || true');
    expect(source).toContain("Sprint backlog back-fill failed");
    expect(source).toContain("finish is incomplete");
    expect(source).toContain("finish_transaction_begin");
    expect(source).toContain("finish_transaction_abort");
    expect(source).toContain("restored live workflow artifacts");
  });

  test("contract-worktree restores live workflow state after backfill failure and a retry succeeds", () => {
    withTempRepo("contract-worktree-transaction", (container) => {
      const primary = join(container, "primary");
      const linked = join(container, "linked");
      mkdirSync(primary, { recursive: true });
      expect(runProcess("git", ["init", "-b", "main"], primary).status).toBe(0);
      expect(runProcess("git", ["config", "user.name", "Archive Test"], primary).status).toBe(0);
      expect(runProcess("git", ["config", "user.email", "archive@test.local"], primary).status).toBe(0);

      for (const dir of [
        "scripts",
        ".ai/hooks/lib",
        ".ai/harness/checks",
        "plans/archive",
        "plans/sprints",
        "tasks/archive",
        "tasks/contracts",
        "tasks/reviews",
        "tasks/notes",
      ]) {
        mkdirSync(join(primary, dir), { recursive: true });
      }
      for (const helper of ["contract-worktree.sh", "worktree-merge-lib.sh", "archive-workflow.sh"]) {
        copyFileSync(join(ROOT, "scripts", helper), join(primary, "scripts", helper));
        chmodSync(join(primary, "scripts", helper), 0o755);
      }
      writeFileSync(join(primary, "scripts/acceptance-receipt.ts"), "process.exit(0);\n");
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(primary, ".ai/hooks/lib/workflow-state.sh"),
      );
      writeFileSync(
        join(primary, "scripts/check-architecture-sync.sh"),
        "#!/bin/bash\nexit 0\n",
      );
      writeFileSync(join(primary, "scripts/verify-sprint.sh"), "#!/bin/bash\nexit 0\n");
      writeFileSync(
        join(primary, "scripts/refresh-current-status.sh"),
        "#!/bin/bash\nprintf '# Current Status Snapshot\\n\\n> **Status**: Idle\\n' > tasks/current.md\n",
      );
      writeFileSync(
        join(primary, "scripts/sprint-backlog.sh"),
        [
          "#!/bin/bash",
          "if [[ \"${SPRINT_BACKFILL_FAIL:-0}\" == \"1\" ]]; then",
          "  echo 'injected sprint backfill failure' >&2",
          "  exit 47",
          "fi",
          "sprint=''",
          "while [[ $# -gt 0 ]]; do",
          "  if [[ \"$1\" == '--sprint' ]]; then sprint=\"$2\"; shift 2; else shift; fi",
          "done",
          "printf '\\n| retry | passed |\\n' >> \"$sprint\"",
          "",
        ].join("\n"),
      );
      for (const helper of [
        "check-architecture-sync.sh",
        "verify-sprint.sh",
        "refresh-current-status.sh",
        "sprint-backlog.sh",
      ]) {
        chmodSync(join(primary, "scripts", helper), 0o755);
      }

      const plan = "plans/plan-20260711-1200-demo.md";
      const contract = "tasks/contracts/20260711-1200-demo.contract.md";
      const review = "tasks/reviews/20260711-1200-demo.review.md";
      const notes = "tasks/notes/20260711-1200-demo.notes.md";
      const sprint = "plans/sprints/demo.sprint.md";
      writeFileSync(
        join(primary, plan),
        [
          "# Plan: demo",
          "",
          "> **Status**: Executing",
          `> **Source Ref**: sprint:${sprint}#demo`,
          "",
          "## Task Breakdown",
          "",
          "- [x] demo",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(primary, contract),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Fulfilled",
          `> **Review File**: \`${review}\``,
          `> **Notes File**: \`${notes}\``,
          "",
          "```yaml",
          "allowed_paths:",
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
        ].join("\n"),
      );
      writeFileSync(
        join(primary, review),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "## External Acceptance Advice",
          "",
          "> **External Acceptance**: unavailable",
          "",
        ].join("\n"),
      );
      writeFileSync(join(primary, notes), "# Implementation Notes: demo\n");
      writeFileSync(
        join(primary, "tasks/todos.md"),
        [
          "# Deferred Goal Ledger",
          "",
          "> **Status**: Backlog",
          "> **Updated**: fixture",
          "",
          "## Deferred Goals",
          "",
          "| Goal | Why Deferred | Tradeoff | Revisit Trigger |",
          "|------|--------------|----------|-----------------|",
          "| (none) | none | none | none |",
          "",
        ].join("\n"),
      );
      writeFileSync(join(primary, "tasks/current.md"), "# Current Status Snapshot\n\n> **Status**: Active\n");
      writeFileSync(join(primary, sprint), "# Sprint: demo\n\n| 1 | [ ] | demo | contract | done | (pending) |\n");
      writeFileSync(join(primary, ".ai/harness/active-plan"), plan);
      writeFileSync(
        join(primary, ".ai/harness/checks/latest.json"),
        `{"status":"pass","source":"verify-sprint","exit_code":0,"contract":{"file":"${contract}"},"review":{"file":"${review}"},"benchmark_evidence":{"status":"not_applicable","report_sha256":"","benchmark_subject_sha256":""}}\n`,
      );

      expect(runProcess("git", ["add", "."], primary).status).toBe(0);
      expect(runProcess("git", ["commit", "-m", "fixture"], primary).status).toBe(0);
      writeWorkflowReview(primary, "pass", "pass");
      expect(runProcess("git", ["add", review, ".acceptance-pass"], primary).status).toBe(0);
      expect(runProcess("git", ["commit", "-m", "record canonical acceptance"], primary).status).toBe(0);
      expect(runProcess("git", ["worktree", "add", "-b", "codex/demo", linked], primary).status).toBe(0);

      const planBefore = readFileSync(join(linked, plan), "utf-8");
      const tasksBefore = readFileSync(join(linked, "tasks/current.md"), "utf-8");
      const sprintBefore = readFileSync(join(linked, sprint), "utf-8");
      const failed = run("scripts/contract-worktree.sh", ["finish", "--no-merge"], linked, {
        SPRINT_BACKFILL_FAIL: "1",
      });
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain("injected sprint backfill failure");
      expect(failed.stderr).toContain("restored live workflow artifacts");
      expect(readFileSync(join(linked, plan), "utf-8")).toBe(planBefore);
      expect(readFileSync(join(linked, "tasks/current.md"), "utf-8")).toBe(tasksBefore);
      expect(readFileSync(join(linked, sprint), "utf-8")).toBe(sprintBefore);
      expect(existsSync(join(linked, "plans/archive/plan-20260711-1200-demo.md"))).toBe(false);

      const retry = run("scripts/contract-worktree.sh", ["finish", "--no-merge"], linked);
      expect(retry.status).toBe(0);
      expect(existsSync(join(linked, plan))).toBe(false);
      expect(existsSync(join(linked, "plans/archive/plan-20260711-1200-demo.md"))).toBe(true);
      expect(readFileSync(join(linked, sprint), "utf-8")).toContain("| retry | passed |");
    });
  }, 15_000);

  test("Completed workflow archive fails closed until every evidence authority passes", () => {
    withTempRepo("archive-workflow-gates", (cwd) => {
      installWorkflowArchiveFixture(cwd);

      let result = archiveWorkflow(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("requires an active contract");

      writeWorkflowContract(cwd, "Partial");
      writeWorkflowReview(cwd, "fail");
      result = archiveWorkflow(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("verified Active or Fulfilled contract");

      writeWorkflowContract(cwd, "Fulfilled");
      result = archiveWorkflow(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("current passing verify-sprint evidence");

      writeWorkflowReview(cwd, "pass");
      result = archiveWorkflow(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("current passing verify-sprint evidence");

      writeWorkflowChecks(cwd);
      result = archiveWorkflow(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("AcceptanceReceipt gate failed");

      writeWorkflowReview(cwd, "pass", "pass");
      result = archiveWorkflow(cwd, "Completed", { ARCH_FRESHNESS_FAIL: "1" });
      expect(result.status).toBe(19);
      expect(result.stderr).toContain("architecture freshness failed");
      expect(existsSync(join(cwd, "plans/plan-20260711-1200-demo.md"))).toBe(true);

      result = archiveWorkflow(cwd);
      expect(result.status).toBe(0);
      expect(existsSync(join(cwd, "plans/archive/plan-20260711-1200-demo.md"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/contracts/20260711-1200-demo.contract.md"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/reviews/20260711-1200-demo.review.md"))).toBe(false);
    });
  }, 30_000);

  test("sealed-terminal mode accepts only a Fulfilled contract, pass review, and typed receipt projection", () => {
    withTempRepo("sealed-terminal-archive", (cwd) => {
      installWorkflowArchiveFixture(cwd);
      writeWorkflowContract(cwd, "Fulfilled");
      writeSealedWorkflowReview(cwd);

      const archived = run(
        "scripts/archive-workflow.sh",
        ["--plan", "plans/plan-20260711-1200-demo.md", "--outcome", "Completed", "--evidence-mode", "sealed-terminal"],
        cwd,
      );
      expect(archived.status, archived.stderr).toBe(0);
      expect(existsSync(join(cwd, "plans/archive/plan-20260711-1200-demo.md"))).toBe(true);
      expect(readdirSync(join(cwd, "tasks/archive")).some((name) => name.startsWith("contract-") && name.endsWith("-demo.md"))).toBe(true);
    });

    for (const [name, contractStatus, reviewText, expected] of [
      ["active-contract", "Active", null, "contract status is Active, not Fulfilled"],
      ["missing-receipt", "Fulfilled", "# Review\n\n> **Recommendation**: pass\n", "typed Acceptance Receipt Projection missing or incomplete"],
      ["failed-review", "Fulfilled", writeSealedWorkflowReview, "review recommendation is fail, not pass"],
    ] as const) {
      withTempRepo(`sealed-terminal-${name}`, (cwd) => {
        installWorkflowArchiveFixture(cwd);
        writeWorkflowContract(cwd, contractStatus);
        if (typeof reviewText === "function") {
          reviewText(cwd);
          const file = join(cwd, "tasks/reviews/20260711-1200-demo.review.md");
          writeFileSync(file, readFileSync(file, "utf8").replace("> **Recommendation**: pass", "> **Recommendation**: fail"));
        } else if (reviewText === null) {
          writeSealedWorkflowReview(cwd);
        } else {
          writeFileSync(join(cwd, "tasks/reviews/20260711-1200-demo.review.md"), reviewText);
        }
        const rejected = run(
          "scripts/archive-workflow.sh",
          ["--plan", "plans/plan-20260711-1200-demo.md", "--outcome", "Completed", "--evidence-mode", "sealed-terminal"],
          cwd,
        );
        expect(rejected.status).toBe(1);
        expect(rejected.stderr).toContain(expected);
        expect(existsSync(join(cwd, "plans/plan-20260711-1200-demo.md"))).toBe(true);
      });
    }
  }, 30_000);

  test.each(["main", "origin/main"])("predict-manifest preserves live evidence and exact review base %s", (reviewBase) => {
    withTempRepo("archive-workflow-predict-manifest", (cwd) => {
      installWorkflowArchiveFixture(cwd);
      // The real repo gitignores the structured checks payload and tracks only
      // a .gitkeep placeholder (see .gitignore:36 and `git ls-files
      // .ai/harness/checks/`). A predicted scratch clone therefore always
      // starts with a pre-existing `.ai/harness/checks/` directory from the
      // tracked .gitkeep, before the live evidence is compensated in.
      writeFileSync(
        join(cwd, ".gitignore"),
        ["node_modules/", ".ai/harness/checks/latest.json", ""].join("\n"),
      );
      mkdirSync(join(cwd, "node_modules"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/checks/.gitkeep"), "");
      writeWorkflowContract(cwd, "Fulfilled");
      writeWorkflowReview(cwd, "pass", "pass");
      expect(runProcess("git", ["add", "."], cwd).status).toBe(0);
      expect(runProcess("git", ["commit", "-m", "commit tracked workflow evidence"], cwd).status).toBe(0);
      // Written after the commit and matched by .gitignore above: untracked,
      // valid, passing evidence — exactly what a live interactive worktree
      // has sitting in .ai/harness/checks/latest.json when finish predicts.
      writeWorkflowChecks(cwd);

      if (reviewBase === "origin/main") {
        const policyFile = join(cwd, ".ai/harness/policy.json");
        const policy = JSON.parse(readFileSync(policyFile, "utf8"));
        policy.worktree_strategy.review_base = reviewBase;
        expect(runProcess("git", ["checkout", "-b", "candidate"], cwd).status).toBe(0);
        writeFileSync(policyFile, JSON.stringify(policy));
        expect(runProcess("git", ["add", policyFile], cwd).status).toBe(0);
        expect(runProcess("git", ["commit", "-m", "candidate with newer remote target"], cwd).status).toBe(0);
        expect(runProcess("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], cwd).status).toBe(0);
      }
      const originalMain = runProcess("git", ["rev-parse", "main"], cwd).stdout;
      const output = join(cwd, "predicted-manifest.txt");
      const result = run(
        "scripts/archive-workflow.sh",
        [
          "--plan", "plans/plan-20260711-1200-demo.md",
          "--outcome", "Completed",
          "--timestamp", "20260721-2256",
          "--timestamp-human", "2026-07-21 22:56",
          "--parent-run-id", "predict-manifest-test",
          "--predict-manifest", output,
        ],
        cwd,
        { EXPECT_ACCEPTANCE_CWD: cwd },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(runProcess("git", ["rev-parse", "main"], cwd).stdout).toBe(originalMain);
      expect(existsSync(output)).toBe(true);
      const manifest = readFileSync(output, "utf-8");
      expect(manifest).toContain("plans/archive/plan-20260711-1200-demo.md");
      expect(manifest).toContain("tasks/archive/contract-20260721-2256-demo.md");
      expect(manifest).toContain("tasks/archive/review-20260721-2256-demo.md");
    });
  }, 30_000);

  test("ordinary Completed archive cannot reuse a same-HEAD local origin receipt", () => {
    withTempRepo("archive-workflow-root-bound-receipt", (container) => {
      const source = join(container, "source");
      const clone = join(container, "clone");
      mkdirSync(source, { recursive: true });
      installWorkflowArchiveFixture(source);
      writeFileSync(
        join(source, ".gitignore"),
        [".acceptance-pass", ".ai/harness/checks/latest.json", ""].join("\n"),
      );
      writeWorkflowContract(source, "Fulfilled");
      writeWorkflowReview(source, "pass", "pass");
      writeWorkflowChecks(source);
      expect(runProcess("git", ["add", "."], source).status).toBe(0);
      expect(runProcess("git", ["commit", "-m", "root-bound receipt fixture"], source).status).toBe(0);
      expect(runProcess("git", ["clone", "--quiet", source, clone], container).status).toBe(0);
      mkdirSync(join(clone, ".ai/harness/checks"), { recursive: true });
      copyFileSync(
        join(source, ".ai/harness/checks/latest.json"),
        join(clone, ".ai/harness/checks/latest.json"),
      );
      writeFileSync(
        join(clone, ".git/repo-harness-prediction-source"),
        `${source}\n`,
      );

      const result = run(
        "scripts/archive-workflow.sh",
        [
          "--plan", "plans/plan-20260711-1200-demo.md",
          "--outcome", "Completed",
        ],
        clone,
        { REPO_HARNESS_PREDICTION_SOURCE_ROOT: source },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("AcceptanceReceipt gate failed");
      expect(existsSync(join(clone, "plans/plan-20260711-1200-demo.md"))).toBe(true);
    });
  }, 30_000);

  test("current-status refresh failures are returned instead of being ignored", () => {
    withTempRepo("archive-workflow-refresh", (cwd) => {
      installWorkflowArchiveFixture(cwd);
      writeWorkflowContract(cwd, "Fulfilled");
      writeWorkflowReview(cwd, "pass", "pass");
      writeWorkflowChecks(cwd);

      const planBefore = readFileSync(join(cwd, "plans/plan-20260711-1200-demo.md"), "utf-8");
      const contractBefore = readFileSync(join(cwd, "tasks/contracts/20260711-1200-demo.contract.md"), "utf-8");
      const reviewBefore = readFileSync(join(cwd, "tasks/reviews/20260711-1200-demo.review.md"), "utf-8");
      const todosBefore = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");

      const result = archiveWorkflow(cwd, "Completed", { ARCHIVE_REFRESH_FAIL: "1" });
      expect(result.status).toBe(23);
      expect(result.stderr).toContain("current status refresh failed");
      expect(result.stderr).toContain("restored live workflow artifacts");
      expect(readFileSync(join(cwd, "plans/plan-20260711-1200-demo.md"), "utf-8")).toBe(planBefore);
      expect(readFileSync(join(cwd, "tasks/contracts/20260711-1200-demo.contract.md"), "utf-8")).toBe(contractBefore);
      expect(readFileSync(join(cwd, "tasks/reviews/20260711-1200-demo.review.md"), "utf-8")).toBe(reviewBefore);
      expect(readFileSync(join(cwd, "tasks/todos.md"), "utf-8")).toBe(todosBefore);
      expect(existsSync(join(cwd, "plans/archive/plan-20260711-1200-demo.md"))).toBe(false);

      const retry = archiveWorkflow(cwd);
      expect(retry.status).toBe(0);
      expect(existsSync(join(cwd, "plans/archive/plan-20260711-1200-demo.md"))).toBe(true);
    });
  }, 30_000);

  test("Abandoned and Superseded archives preserve the full plan body without completion evidence", () => {
    for (const outcome of ["Abandoned", "Superseded"]) {
      withTempRepo(`archive-workflow-${outcome.toLowerCase()}`, (cwd) => {
        installWorkflowArchiveFixture(cwd);
        const result = archiveWorkflow(cwd, outcome);
        expect(result.status).toBe(0);
        const archived = readFileSync(join(cwd, "plans/archive/plan-20260711-1200-demo.md"), "utf-8");
        expect(archived).toContain("## Unique Plan Body");
        expect(archived).toContain("Keep this content.");
      });
    }
  }, 30_000);

  test("Resolved architecture archive requires a live Pending request and its existing module artifact", () => {
    withTempRepo("archive-architecture-gates", (cwd) => {
      installArchitectureArchiveFixture(cwd);
      writeArchitectureRequest(cwd, "Resolved");

      let result = archiveArchitecture(cwd, ["--artifact", "docs/architecture/modules/runtime/demo.md"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("request status must be Pending");

      writeArchitectureRequest(cwd);
      result = archiveArchitecture(cwd, []);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("requires the architecture module as a durable --artifact");

      result = archiveArchitecture(cwd, ["--artifact", "docs/architecture/modules/runtime/missing.md"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("artifact does not exist");

      writeFileSync(join(cwd, "docs/architecture/modules/runtime/other.md"), "# Other\n");
      result = archiveArchitecture(cwd, ["--artifact", "docs/architecture/modules/runtime/other.md"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("requires the architecture module as a durable --artifact");

      result = archiveArchitecture(cwd, ["--artifact", "docs/architecture/modules/runtime/demo.md"]);
      expect(result.status).toBe(0);
      expect(existsSync(join(cwd, "docs/architecture/requests/runtime-demo.md"))).toBe(false);
      const archiveDir = join(cwd, "docs/architecture/requests/archive", String(new Date().getFullYear()));
      const archiveFile = readdirSync(archiveDir).find((name) => name.endsWith("runtime-demo.md"));
      expect(archiveFile).toBeDefined();
      const archived = readFileSync(join(archiveDir, archiveFile!), "utf-8");
      expect(archived).toContain("> **Status**: Resolved");
      expect(archived).toContain("Preserve this exact request rationale.");
      expect(archived).toContain("- `docs/architecture/modules/runtime/demo.md`");
      expect(readFileSync(join(cwd, ".queue-calls"), "utf-8")).toContain("reindex --check");
    });
  }, 30_000);

  test("unsafe artifact symlinks and post-archive reindex failures fail visibly", () => {
    withTempRepo("archive-architecture-failure", (cwd) => {
      installArchitectureArchiveFixture(cwd);
      writeArchitectureRequest(cwd);
      const outside = join(cwd, "..", `outside-${Date.now()}.md`);
      writeFileSync(outside, "outside\n");
      symlinkSync(outside, join(cwd, "docs/architecture/modules/runtime/linked.md"));

      let result = archiveArchitecture(cwd, ["--artifact", "docs/architecture/modules/runtime/linked.md"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("artifact must not be a symlink");
      rmSync(outside, { force: true });

      const requestPath = join(cwd, "docs/architecture/requests/runtime-demo.md");
      const requestBefore = readFileSync(requestPath, "utf-8");

      result = archiveArchitecture(
        cwd,
        ["--artifact", "docs/architecture/modules/runtime/demo.md"],
        { ARCH_QUEUE_FAIL_ON_CHECK: "1" },
      );
      expect(result.status).toBe(31);
      expect(result.stderr).toContain("pre-archive reindex check failed");
      expect(readFileSync(requestPath, "utf-8")).toBe(requestBefore);

      result = archiveArchitecture(
        cwd,
        ["--artifact", "docs/architecture/modules/runtime/demo.md"],
        { ARCH_QUEUE_FAIL_ON_POST: "1" },
      );
      expect(result.status).toBe(29);
      expect(result.stderr).toContain("post-archive reindex failed");
      expect(result.stderr).toContain("restored live architecture artifacts");
      expect(readFileSync(requestPath, "utf-8")).toBe(requestBefore);

      const retry = archiveArchitecture(cwd, ["--artifact", "docs/architecture/modules/runtime/demo.md"]);
      expect(retry.status).toBe(0);
      expect(existsSync(requestPath)).toBe(false);
    });
  }, 30_000);
});



describe("archive-workflow helper integration", () => {
  test("archive-workflow should archive plan and todo with non-completion outcome metadata", () => {
    const cwd = tmpWorkspace("helper-archive");
    try {
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1500-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );
      mkdirSync(join(cwd, "tasks/notes"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      writeFileSync(join(cwd, "tasks/notes/demo.notes.md"), "# Implementation Notes: demo\n");
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# Task Contract: demo\n");
      writeFileSync(join(cwd, "tasks/reviews/demo.review.md"), "# Task Review: demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n\n- [ ] task\n");

      const res = scriptRun(
        "bash",
        ["scripts/archive-workflow.sh", "--plan", "plans/plan-20260304-1500-demo.md", "--outcome", "Abandoned"],
        cwd
      );
      expect(res.status).toBe(0);

      const archivedPlan = join(cwd, "plans/archive/plan-20260304-1500-demo.md");
      expect(existsSync(archivedPlan)).toBe(true);
      expect(readFileSync(archivedPlan, "utf-8")).toContain("**Status**: Abandoned");

      const archivedTodos = readdirSync(join(cwd, "tasks/archive")).filter((name) => name.startsWith("todo-"));
      expect(archivedTodos.length).toBeGreaterThanOrEqual(1);
      const todoArchiveContent = readFileSync(join(cwd, "tasks/archive", archivedTodos[0]), "utf-8");
      expect(todoArchiveContent).toContain("**Outcome**: Abandoned");
      const archivedNotes = readdirSync(join(cwd, "tasks/archive")).filter((name) => name.startsWith("notes-"));
      expect(archivedNotes.length).toBeGreaterThanOrEqual(1);
      expect(readFileSync(join(cwd, "tasks/archive", archivedNotes[0]), "utf-8")).toContain("**Lifecycle**: notes");
      expect(existsSync(join(cwd, "tasks/notes/demo.notes.md"))).toBe(false);
      const archivedContracts = readdirSync(join(cwd, "tasks/archive")).filter((name) => name.startsWith("contract-"));
      expect(archivedContracts.length).toBeGreaterThanOrEqual(1);
      expect(readFileSync(join(cwd, "tasks/archive", archivedContracts[0]), "utf-8")).toContain("**Lifecycle**: contract");
      expect(existsSync(join(cwd, "tasks/contracts/demo.contract.md"))).toBe(false);
      const archivedReviews = readdirSync(join(cwd, "tasks/archive")).filter((name) => name.startsWith("review-"));
      expect(archivedReviews.length).toBeGreaterThanOrEqual(1);
      expect(readFileSync(join(cwd, "tasks/archive", archivedReviews[0]), "utf-8")).toContain("**Lifecycle**: review");
      expect(existsSync(join(cwd, "tasks/reviews/demo.review.md"))).toBe(false);

      const resetTodo = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");
      expect(resetTodo).toContain("# Deferred Goal Ledger");
      expect(resetTodo).toContain("**Status**: Backlog");
      expect(resetTodo).toContain("## Deferred Goals");
      expect(resetTodo).toContain("Revisit Trigger");
      expect(resetTodo).not.toContain("## Review Section");

      const current = readFileSync(join(cwd, "tasks/current.md"), "utf-8");
      expect(current).toContain("# Current Status Snapshot");
      expect(current).toContain("> **Status**: Idle");
      expect(current).toContain("> **Reason**: archive-workflow");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("archive-workflow rewrites one exact workflow family to collision-safe archive pointers", () => {
    const cwd = tmpWorkspace("helper-archive-path-projection");
    try {
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/notes"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      copyHelpers(cwd);

      const plan = "plans/plan-20260304-1502-demo.md";
      const contract = "tasks/contracts/20260304-1502-demo.contract.md";
      const review = "tasks/reviews/20260304-1502-demo.review.md";
      const notes = "tasks/notes/20260304-1502-demo.notes.md";
      writeFileSync(
        join(cwd, plan),
        [
          "# Plan: demo",
          "",
          "> **Status**: Executing",
          `> **Task Contract**: \`${contract}\``,
          `> **Task Review**: \`${review}\``,
          `> **Implementation Notes**: \`${notes}\``,
          "",
          `Contract pointer: ${contract}`,
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(cwd, contract),
        [
          "# Task Contract: demo",
          "",
          "> **Status**: Active",
          `> **Plan**: ${plan}`,
          `> **Review File**: \`${review}\``,
          `> **Notes File**: \`${notes}\``,
          "",
          "## Allowed Paths",
          "",
          "```yaml",
          "allowed_paths:",
          `  - ${contract}`,
          `  - ${review}`,
          `  - ${notes}`,
          "```",
          "",
          "## Exit Criteria (Machine Verifiable)",
          "",
          "```yaml",
          "exit_criteria:",
          "  artifacts_exist:",
          `    - ${notes}`,
          "```",
          "",
        ].join("\n"),
      );
      writeFileSync(join(cwd, review), `# Task Review: demo\n\n> **Plan**: ${plan}\n> **Contract**: ${contract}\n> **Notes File**: ${notes}\n`);
      writeFileSync(join(cwd, notes), `# Implementation Notes: demo\n\n> **Plan**: ${plan}\n> **Contract**: ${contract}\n> **Review**: ${review}\n`);
      writeFileSync(join(cwd, "tasks/todos.md"), `# Deferred Goal Ledger\n\n> **Status**: Backlog\n> **Updated**: now\n\n## Deferred Goals\n\n${plan}\n`);

      const collision = "tasks/archive/review-20990101-0101-demo.md";
      writeFileSync(join(cwd, collision), "pre-existing review archive\n");
      const res = scriptRun(
        "bash",
        [
          "scripts/archive-workflow.sh",
          "--plan", plan,
          "--outcome", "Abandoned",
          "--timestamp", "20990101-0101",
        ],
        cwd,
      );
      expect(res.status, res.stderr).toBe(0);

      const destinations = {
        plan: "plans/archive/plan-20260304-1502-demo.md",
        contract: "tasks/archive/contract-20990101-0101-demo.md",
        review: "tasks/archive/review-20990101-0101-demo-v2.md",
        notes: "tasks/archive/notes-20990101-0101-demo.md",
      };
      for (const destination of Object.values(destinations)) {
        expect(existsSync(join(cwd, destination))).toBe(true);
      }
      const expectedPairs = [
        [plan, destinations.plan],
        [notes, destinations.notes],
        [contract, destinations.contract],
        [review, destinations.review],
      ];
      for (const destination of Object.values(destinations)) {
        const content = readFileSync(join(cwd, destination), "utf-8");
        for (const [source, archived] of expectedPairs) {
          expect(content).toContain(`> **Archive Projection V1**: \`${source}\` => \`${archived}\``);
          expect(content.split("\n\n").slice(1).join("\n\n")).not.toContain(source);
        }
      }
      expect(readFileSync(join(cwd, destinations.plan), "utf-8")).toContain(`> **Task Contract**: \`${destinations.contract}\``);
      const archivedContract = readFileSync(join(cwd, destinations.contract), "utf-8");
      expect(archivedContract).toContain(`> **Plan**: ${destinations.plan}`);
      expect(archivedContract).toContain(`  - ${destinations.review}`);
      expect(archivedContract).toContain(`    - ${destinations.notes}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  // R-E (fix 5): a --timestamp value passed to archive-workflow.sh is used
  // verbatim for every archive-family filename instead of a fresh internal
  // `date` call (the seam contract-worktree.sh finish now relies on so its
  // allowlist predictions and archive's actual output cannot disagree across
  // a minute boundary); a standalone invocation without --timestamp keeps
  // making its own single `date` call, unchanged.

  test("archive-workflow uses a caller-supplied --timestamp for every archive filename; a standalone run keeps its own date call", () => {
    const cwd = tmpWorkspace("helper-archive-timestamp-seam");
    try {
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1500-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );
      mkdirSync(join(cwd, "tasks/notes"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      writeFileSync(join(cwd, "tasks/notes/demo.notes.md"), "# Implementation Notes: demo\n");
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# Task Contract: demo\n");
      writeFileSync(join(cwd, "tasks/reviews/demo.review.md"), "# Task Review: demo\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n\n- [ ] task\n");

      // A deliberately implausible value: a real `date +%Y%m%d-%H%M` call can
      // never produce this, so finding it in the archived filenames is proof
      // the seam is wired, not a coincidence.
      const markerTimestamp = "20990101-0000";
      const marked = scriptRun(
        "bash",
        [
          "scripts/archive-workflow.sh",
          "--plan", "plans/plan-20260304-1500-demo.md",
          "--outcome", "Abandoned",
          "--timestamp", markerTimestamp,
        ],
        cwd
      );
      expect(marked.status, marked.stderr).toBe(0);

      const markedEntries = readdirSync(join(cwd, "tasks/archive"));
      expect(markedEntries).toContain(`contract-${markerTimestamp}-demo.md`);
      expect(markedEntries).toContain(`review-${markerTimestamp}-demo.md`);
      expect(markedEntries).toContain(`notes-${markerTimestamp}-demo.md`);
      expect(markedEntries).toContain(`todo-${markerTimestamp}-demo.md`);

      // Standalone invocation (no --timestamp): unchanged behavior, its own
      // fresh `date` call, never the marker from the previous invocation.
      writeFileSync(
        join(cwd, "plans/plan-20260304-1501-demo2.md"),
        "# Plan: demo2\n\n> **Status**: Executing\n"
      );
      writeFileSync(join(cwd, "tasks/notes/demo2.notes.md"), "# Implementation Notes: demo2\n");
      writeFileSync(join(cwd, "tasks/contracts/demo2.contract.md"), "# Task Contract: demo2\n");
      writeFileSync(join(cwd, "tasks/reviews/demo2.review.md"), "# Task Review: demo2\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n\n- [ ] task\n");

      const standalone = scriptRun(
        "bash",
        ["scripts/archive-workflow.sh", "--plan", "plans/plan-20260304-1501-demo2.md", "--outcome", "Abandoned"],
        cwd
      );
      expect(standalone.status, standalone.stderr).toBe(0);

      const standaloneContracts = readdirSync(join(cwd, "tasks/archive")).filter(
        (name) => name.startsWith("contract-") && name.endsWith("-demo2.md")
      );
      expect(standaloneContracts.length).toBe(1);
      expect(standaloneContracts[0]).toMatch(/^contract-\d{8}-\d{4}-demo2\.md$/);
      expect(standaloneContracts[0]).not.toContain(markerTimestamp);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  // R-E hardening (third external review round): --timestamp is interpolated
  // directly into archive filenames, so a malformed value must fail closed
  // rather than produce a garbage or unexpected archive path.

  test("archive-workflow rejects a --timestamp value that does not match YYYYMMDD-HHMM", () => {
    const cwd = tmpWorkspace("helper-archive-timestamp-format-guard");
    try {
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1502-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );

      const malformed = scriptRun(
        "bash",
        [
          "scripts/archive-workflow.sh",
          "--plan", "plans/plan-20260304-1502-demo.md",
          "--outcome", "Abandoned",
          "--timestamp", "not-a-timestamp",
        ],
        cwd
      );
      expect(malformed.status).not.toBe(0);
      expect(malformed.stderr).toContain("--timestamp must match YYYYMMDD-HHMM");
      expect(readdirSync(join(cwd, "plans")).some((name) => name.startsWith("plan-20260304-1502-demo"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("archive-workflow should preserve existing deferred ledger rows", () => {
    const cwd = tmpWorkspace("helper-archive-deferred-ledger");
    try {
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1505-demo.md"),
        "# Plan: demo\n\n> **Status**: Complete\n"
      );
      writeFileSync(
        join(cwd, "tasks/todos.md"),
        [
          "# Deferred Goal Ledger",
          "",
          "> **Status**: Backlog",
          "> **Updated**: (migration)",
          "> **Scope**: Medium/long-term goals deferred from active plan execution",
          "",
          "Current plan tasks live in the active plan's `## Task Breakdown`.",
          "Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.",
          "",
          "## Deferred Goals",
          "",
          "| Goal | Why Deferred | Tradeoff | Revisit Trigger |",
          "|------|--------------|----------|-----------------|",
          "| Review archived legacy checklist | Legacy checklist was preserved during migration. | Keep user-authored task text. | Promote real follow-up work into a new plan. |",
          "",
        ].join("\n")
      );

      const res = scriptRun(
        "bash",
        ["scripts/archive-workflow.sh", "--plan", "plans/plan-20260304-1505-demo.md", "--outcome", "Superseded"],
        cwd
      );
      expect(res.status).toBe(0);

      const todo = readFileSync(join(cwd, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("> **Updated**: (archive-workflow)");
      expect(todo).toContain("Review archived legacy checklist");
      expect(todo).not.toContain("Archived workflow did not leave a deferred medium/long-term goal");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  // Sixth external review round: plan/notes/contract/review archive
  // destinations all go through unique_archive_path (collision -> -v2
  // suffix), but the todo destination was written with a direct `>`
  // redirect, silently overwriting an existing archived todo snapshot on a
  // same-timestamp-and-slug collision instead of suffixing like its three
  // siblings.

  test("archive-workflow suffixes a colliding todo archive destination instead of overwriting it", () => {
    const cwd = tmpWorkspace("helper-archive-todo-collision");
    try {
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      copyHelpers(cwd);

      const collidingTimestamp = "20990101-0000";
      writeFileSync(
        join(cwd, "tasks/archive/todo-20990101-0000-demo.md"),
        "> **Archived**: 2099-01-01 00:00\n\npre-existing archived todo content\n"
      );

      writeFileSync(
        join(cwd, "plans/plan-20260304-1506-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n\n- [ ] fresh todo row\n");

      const res = scriptRun(
        "bash",
        [
          "scripts/archive-workflow.sh",
          "--plan", "plans/plan-20260304-1506-demo.md",
          "--outcome", "Abandoned",
          "--timestamp", collidingTimestamp,
        ],
        cwd
      );
      expect(res.status, res.stderr).toBe(0);

      const preserved = readFileSync(join(cwd, "tasks/archive/todo-20990101-0000-demo.md"), "utf-8");
      expect(preserved).toContain("pre-existing archived todo content");

      const suffixed = readdirSync(join(cwd, "tasks/archive")).filter(
        (name) => name.startsWith("todo-20990101-0000-demo-v") && name.endsWith(".md")
      );
      expect(suffixed.length).toBe(1);
      const suffixedContent = readFileSync(join(cwd, "tasks/archive", suffixed[0]), "utf-8");
      expect(suffixedContent).toContain("fresh todo row");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("archive-workflow should set plan status to Abandoned for abandoned outcome", () => {
    const cwd = tmpWorkspace("helper-archive-abandoned");
    try {
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260304-1510-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n\n- [ ] task\n");

      const res = scriptRun(
        "bash",
        ["scripts/archive-workflow.sh", "--plan", "plans/plan-20260304-1510-demo.md", "--outcome", "Abandoned"],
        cwd
      );
      expect(res.status).toBe(0);

      const archivedPlan = join(cwd, "plans/archive/plan-20260304-1510-demo.md");
      expect(existsSync(archivedPlan)).toBe(true);
      expect(readFileSync(archivedPlan, "utf-8")).toContain("**Status**: Abandoned");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
