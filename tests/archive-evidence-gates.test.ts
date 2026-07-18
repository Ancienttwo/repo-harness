import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

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
    env: fixtureEnv(env),
  });
}

function runProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: fixtureEnv(env),
  });
}

function withTempRepo(prefix: string, fn: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), `${prefix}-`));
  try {
    fn(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function installWorkflowArchiveFixture(cwd: string): void {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
  mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
  mkdirSync(join(cwd, "plans"), { recursive: true });
  mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
  mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
  copyFileSync(join(ROOT, "scripts/archive-workflow.sh"), join(cwd, "scripts/archive-workflow.sh"));
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
}

function writeWorkflowChecks(cwd: string): void {
  writeFileSync(
    join(cwd, ".ai/harness/checks/latest.json"),
    '{"status":"pass","source":"verify-sprint","exit_code":0,"contract":{"file":"tasks/contracts/20260711-1200-demo.contract.md"},"review":{"file":"tasks/reviews/20260711-1200-demo.review.md"},"benchmark_evidence":{"status":"not_applicable","report_sha256":"","benchmark_subject_sha256":""}}\n',
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
      for (const helper of ["contract-worktree.sh", "archive-workflow.sh"]) {
        copyFileSync(join(ROOT, "scripts", helper), join(primary, "scripts", helper));
        chmodSync(join(primary, "scripts", helper), 0o755);
      }
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
      expect(runProcess("git", ["add", review], primary).status).toBe(0);
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
      expect(result.stderr).toContain("Recommendation: pass");

      writeWorkflowReview(cwd, "pass");
      result = archiveWorkflow(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("current passing verify-sprint evidence");

      writeWorkflowChecks(cwd);
      result = archiveWorkflow(cwd);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("external acceptance gate failed");

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
  });

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
  });

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
  });

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
  });

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
  });
});
