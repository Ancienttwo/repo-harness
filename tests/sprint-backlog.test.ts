import { describe, test, expect, setDefaultTimeout } from "bun:test";

// This file exercises .ai/hooks/*.sh via spawnSync; hook fork/exec chains
// exceed bun's 5s default under parallel load (see tasks/lessons.md 2026-06-10).
setDefaultTimeout(20000);
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { sessionStartMainContent } from "../src/cli/hook/session-context";
import { createStateInputCollector } from "../src/effects/loop/state-input-collector";

const ROOT = join(import.meta.dir, "..");
const HELPER_DIR = join(ROOT, "assets/templates/helpers");

function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
}

// Strip vars that would let sprint-backlog.sh's REPO_HARNESS_TARGET_REPO_ROOT
// branch redirect it out of the tmp workspace: bun test runs files in one
// process (bunfig maxConcurrency=4), so an inherited/leaked value from any
// concurrently-running test would otherwise silently repoint cwd at the real repo.
const SANDBOX_ENV_BLOCKLIST = ["REPO_HARNESS_TARGET_REPO_ROOT", "REPO_HARNESS_HELPER_SOURCE", "REPO_HARNESS_HELPER_SOURCE_PATH"];

function run(cmd: string, args: string[], cwd: string, env?: Record<string, string>) {
  const base = { ...process.env };
  for (const key of SANDBOX_ENV_BLOCKLIST) delete base[key];
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    env: { ...base, ...env },
  });
}

const LOCK_TEST_ENV = {
  REPO_HARNESS_BACKLOG_LOCK_ATTEMPTS: "5",
  REPO_HARNESS_BACKLOG_LOCK_SLEEP_SECONDS: "0.02",
};

function copySprintHelpers(cwd: string, files: string[]) {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  for (const file of files) {
    copyFileSync(join(HELPER_DIR, file), join(cwd, "scripts", file));
  }
  expect(run("bash", ["-lc", "chmod +x scripts/*.sh"], cwd).status).toBe(0);
}

function writeActiveSprintFixture(cwd: string, sprintRelPath: string) {
  mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
  mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
  writeFileSync(
    join(cwd, sprintRelPath),
    [
      "# Sprint: Fixture Sprint",
      "",
      "> **Status**: Approved",
      "> **Slug**: fixture-sprint",
      "> **Created**: 2026-06-10 00:00",
      "> **Updated**: 2026-06-10 00:00",
      "> **Source Spec**: `docs/spec.md`",
      "> **Goal Mode**: incremental",
      "",
      "## PRD",
      "",
      "Real problem statement with concrete user outcomes.",
      "",
      "## Backlog",
      "",
      "| # | Status | Task | Mode | Acceptance | Plan |",
      "|---|--------|------|------|------------|------|",
      "| 1 | [ ] | task-a | contract | unit tests pass | (pending) |",
      "| 2 | [ ] | task-b | inline | doc section updated | (pending) |",
      "",
      "## Execution Log",
      "",
      "| When | Task | Plan | Result |",
      "|------|------|------|--------|",
      "",
    ].join("\n")
  );
  writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), sprintRelPath);
}

describe("sprint-backlog helper", () => {
  test("rejects ambient target repo root that does not match the helper cwd", () => {
    const cwd = tmpWorkspace("sprint-env-cwd");
    const poisonRepo = tmpWorkspace("sprint-env-poison");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const result = spawnSync("bash", ["scripts/sprint-backlog.sh", "status"], {
        cwd,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_TARGET_REPO_ROOT: poisonRepo,
        },
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("REPO_HARNESS_TARGET_REPO_ROOT must match");
      expect(existsSync(join(poisonRepo, "plans"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(poisonRepo, { recursive: true, force: true });
    }
  });

  test("accepts target repo root when it matches the helper cwd", () => {
    const cwd = tmpWorkspace("sprint-env-match");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);

      const init = run(
        "bash",
        ["scripts/sprint-backlog.sh", "init", "--slug", "Root Match", "--title", "Root Match"],
        cwd,
        { REPO_HARNESS_TARGET_REPO_ROOT: cwd }
      );

      expect(init.status).toBe(0);
      expect(init.stdout).toContain("Created draft sprint: plans/sprints/");
      expect(existsSync(join(cwd, ".ai/harness/sprint/active-sprint"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("init creates a draft sprint, sets the marker, and refuses a second active sprint", () => {
    const cwd = tmpWorkspace("sprint-backlog-init");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);

      const init = run("bash", ["scripts/sprint-backlog.sh", "init", "--slug", "Auth Overhaul", "--title", "Auth Overhaul"], cwd);
      expect(init.status).toBe(0);
      expect(init.stdout).toContain("Created draft sprint: plans/sprints/");

      const marker = readFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), "utf-8").trim();
      expect(marker).toMatch(/^plans\/sprints\/\d{8}-\d{4}-auth-overhaul\.sprint\.md$/);
      expect(existsSync(join(cwd, marker))).toBe(true);

      const sprint = readFileSync(join(cwd, marker), "utf-8");
      expect(sprint).toContain("# Sprint: Auth Overhaul");
      expect(sprint).toContain("> **Status**: Draft");
      expect(sprint).toContain("| # | Status | Task | Mode | Acceptance | Plan |");

      const again = run("bash", ["scripts/sprint-backlog.sh", "init", "--slug", "another"], cwd);
      expect(again.status).toBe(1);
      expect(again.stderr).toContain("active sprint already exists");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("status, next, and complete-task drive the backlog lifecycle", () => {
    const cwd = tmpWorkspace("sprint-backlog-lifecycle");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);

      const status = run("bash", ["scripts/sprint-backlog.sh", "status"], cwd);
      expect(status.status).toBe(0);
      expect(status.stdout).toContain(`sprint: ${sprintPath}`);
      expect(status.stdout).toContain("status: Approved");
      expect(status.stdout).toContain("tasks_done: 0");
      expect(status.stdout).toContain("tasks_total: 2");
      expect(status.stdout).toContain("next_task: task-a");

      const next = run("bash", ["scripts/sprint-backlog.sh", "next"], cwd);
      expect(next.status).toBe(0);
      expect(next.stdout).toContain("index: 1");
      expect(next.stdout).toContain("task: task-a");
      expect(next.stdout).toContain("mode: contract");
      expect(next.stdout).toContain("acceptance: unit tests pass");

      const completeBySlug = run(
        "bash",
        ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a", "--plan", "plans/plan-20260610-0001-task-a.md"],
        cwd
      );
      expect(completeBySlug.status).toBe(0);
      expect(completeBySlug.stdout).toContain("Completed backlog task 'task-a' (row 1)");
      expect(completeBySlug.stdout).toContain("Backlog progress: 1/2");

      const afterFirst = readFileSync(join(cwd, sprintPath), "utf-8");
      expect(afterFirst).toContain("| 1 | [x] | task-a | contract | unit tests pass | `plans/plan-20260610-0001-task-a.md` |");
      expect(afterFirst).toContain("| task-a | `plans/plan-20260610-0001-task-a.md` | done |");

      const nextAfterFirst = run("bash", ["scripts/sprint-backlog.sh", "next"], cwd);
      expect(nextAfterFirst.status).toBe(0);
      expect(nextAfterFirst.stdout).toContain("task: task-b");

      const completeByIndex = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "2"], cwd);
      expect(completeByIndex.status).toBe(0);
      expect(completeByIndex.stdout).toContain("All backlog tasks complete.");

      const exhausted = run("bash", ["scripts/sprint-backlog.sh", "next"], cwd);
      expect(exhausted.status).toBe(3);
      expect(exhausted.stdout).toContain("next_task: (none)");

      const repeat = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "2"], cwd);
      expect(repeat.status).toBe(1);
      expect(repeat.stderr).toContain("already complete");

      const unknown = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-z"], cwd);
      expect(unknown.status).toBe(1);
      expect(unknown.stderr).toContain("no backlog row matches");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("init renders titles with sed/awk metacharacters literally", () => {
    const cwd = tmpWorkspace("sprint-backlog-metachar");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);

      const init = run(
        "bash",
        ["scripts/sprint-backlog.sh", "init", "--slug", "meta", "--title", "A | B & C \\ D"],
        cwd
      );
      expect(init.status).toBe(0);

      const marker = readFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), "utf-8").trim();
      const sprint = readFileSync(join(cwd, marker), "utf-8");
      expect(sprint).toContain("# Sprint: A | B & C \\ D");
      expect(sprint).toContain("> **Status**: Draft");
      expect(sprint.length).toBeGreaterThan(100);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("complete-task rejects ambiguous refs, resolves duplicates by unique slug, and preserves backslashes", () => {
    const cwd = tmpWorkspace("sprint-backlog-plan-escape");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);
      // Inject a duplicate index 1 row after the real one.
      const original = readFileSync(join(cwd, sprintPath), "utf-8");
      writeFileSync(
        join(cwd, sprintPath),
        original.replace(
          "| 2 | [ ] | task-b | inline | doc section updated | (pending) |",
          "| 1 | [ ] | task-dup | inline | duplicate index row | (pending) |\n| 2 | [ ] | task-b | inline | doc section updated | (pending) |"
        )
      );

      const ambiguous = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "1"], cwd);
      expect(ambiguous.status).toBe(1);
      expect(ambiguous.stderr).toContain("ambiguous");

      const complete = run(
        "bash",
        ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a", "--plan", "plans\\windows\\plan-a.md"],
        cwd
      );
      expect(complete.status).toBe(0);

      const after = readFileSync(join(cwd, sprintPath), "utf-8");
      expect(after).toContain("| 1 | [x] | task-a | contract | unit tests pass | `plans\\windows\\plan-a.md` |");
      expect(after).toContain("| 1 | [ ] | task-dup | inline | duplicate index row | (pending) |");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("markers pointing outside plans/sprints are treated as no active sprint", () => {
    const cwd = tmpWorkspace("sprint-backlog-containment");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
      mkdirSync(join(cwd, "outside"), { recursive: true });
      writeFileSync(join(cwd, "outside/victim.sprint.md"), "# Sprint: Victim\n\n> **Status**: Approved\n");
      writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), "outside/victim.sprint.md");

      const status = run("bash", ["scripts/sprint-backlog.sh", "status"], cwd);
      expect(status.status).toBe(0);
      expect(status.stdout).toContain("sprint: (none)");

      const next = run("bash", ["scripts/sprint-backlog.sh", "next"], cwd);
      expect(next.status).toBe(1);
      expect(next.stderr).toContain("no active sprint");

      expect(readFileSync(join(cwd, "outside/victim.sprint.md"), "utf-8")).toContain("> **Status**: Approved");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("next and complete-task fail without an active sprint", () => {
    const cwd = tmpWorkspace("sprint-backlog-no-active");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);

      const next = run("bash", ["scripts/sprint-backlog.sh", "next"], cwd);
      expect(next.status).toBe(1);
      expect(next.stderr).toContain("no active sprint");

      const status = run("bash", ["scripts/sprint-backlog.sh", "status"], cwd);
      expect(status.status).toBe(0);
      expect(status.stdout).toContain("sprint: (none)");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("start-task captures a thin sprint-task plan seed; contract rows leave the Plan cell to finish back-fill", () => {
    const cwd = tmpWorkspace("sprint-backlog-start-task");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh", "capture-plan.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);

      // Row 1 (task-a) is contract mode: the plan is captured but the primary
      // tree's sprint file must stay untouched so the worktree merge-back
      // stays fast-forwardable; finish back-fills the row.
      const start = run("bash", ["scripts/sprint-backlog.sh", "start-task"], cwd);
      expect(start.status).toBe(0);
      const planPath = start.stdout.match(/Captured plan: (plans\/plan-[^\s]+\.md)/)?.[1] ?? "";
      expect(planPath).toMatch(/^plans\/plan-\d{8}-\d{4}-task-a\.md$/);
      expect(start.stdout).toContain("stays (pending)");

      const plan = readFileSync(join(cwd, planPath), "utf-8");
      expect(plan).toContain("> **Status**: Approved");
      expect(plan).toContain("> **Planning Source**: repo-harness-sprint");
      expect(plan).toContain(`> **Source Ref**: sprint:${sprintPath}#task-a`);
      expect(plan).toContain("use `$think` to expand this sprint row");
      expect(plan).toContain("Run `$think` for backlog task `task-a`");
      expect(plan).toContain("Verify acceptance: unit tests pass");

      const sprintAfterContract = readFileSync(join(cwd, sprintPath), "utf-8");
      expect(sprintAfterContract).toContain("| 1 | [ ] | task-a | contract | unit tests pass | (pending) |");

      // Row 2 (task-b) is inline mode: it appends checklist rows to the active
      // plan and does not create a new top-level plan or task artifacts.
      const inline = run("bash", ["scripts/sprint-backlog.sh", "start-task", "--task", "task-b"], cwd);
      expect(inline.status).toBe(0);
      expect(inline.stdout).toContain("Appended checklist row(s) to");
      expect(inline.stdout).toContain("is inline; appended checklist row(s) to the active plan");
      expect(inline.stdout).not.toContain("Captured plan:");
      const sprintAfterInline = readFileSync(join(cwd, sprintPath), "utf-8");
      expect(sprintAfterInline).toContain("| 2 | [ ] | task-b | inline | doc section updated | (pending) |");
      expect(readdirSync(join(cwd, "plans")).filter((name) => name.includes("task-b")).length).toBe(0);
      const activePlan = readFileSync(join(cwd, ".ai/harness/active-plan"), "utf-8").trim();
      const activePlanBody = readFileSync(join(cwd, activePlan), "utf-8");
      expect(activePlanBody).toContain("- [ ] Complete sprint row `task-b`: doc section updated");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("duplicate start-task is refused, auto-select skips in-flight rows, --force restarts", () => {
    const cwd = tmpWorkspace("sprint-backlog-in-flight");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh", "capture-plan.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);

      const first = run("bash", ["scripts/sprint-backlog.sh", "start-task"], cwd);
      expect(first.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/sprint/in-flight/task-a"))).toBe(true);

      const dup = run("bash", ["scripts/sprint-backlog.sh", "start-task", "--task", "task-a"], cwd);
      expect(dup.status).toBe(1);
      expect(dup.stderr).toContain("already in flight");

      const auto = run("bash", ["scripts/sprint-backlog.sh", "start-task"], cwd);
      expect(auto.status).toBe(0);
      expect(auto.stdout).toContain("task-b");
      expect(auto.stdout).toContain("appended checklist row(s) to the active plan");

      const exhausted = run("bash", ["scripts/sprint-backlog.sh", "start-task"], cwd);
      expect(exhausted.status).toBe(3);
      expect(exhausted.stderr).toContain("already in flight");

      const forced = run("bash", ["scripts/sprint-backlog.sh", "start-task", "--task", "task-a", "--force"], cwd);
      expect(forced.status).toBe(0);

      const complete = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a"], cwd);
      expect(complete.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/sprint/in-flight/task-a"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a non-empty stale lock times out instead of hot-looping", () => {
    const cwd = tmpWorkspace("sprint-backlog-lock-timeout");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);
      const lockDir = join(cwd, ".ai/harness/sprint/.backlog-lock");
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(join(lockDir, "holder"), "still here");
      expect(run("bash", ["-lc", `touch -t 202001010000 '${lockDir}'`], cwd).status).toBe(0);

      const complete = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a"], cwd, LOCK_TEST_ENV);
      expect(complete.status).toBe(1);
      expect(complete.stderr).toContain("timed out acquiring backlog lock");
      expect(readFileSync(join(cwd, sprintPath), "utf-8")).toContain("| 1 | [ ] | task-a |");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("start-task refuses draft sprints and missing capture helper", () => {
    const cwd = tmpWorkspace("sprint-backlog-start-task-gates");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh", "capture-plan.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);
      writeFileSync(
        join(cwd, sprintPath),
        readFileSync(join(cwd, sprintPath), "utf-8").replace("> **Status**: Approved", "> **Status**: Draft")
      );

      const draft = run("bash", ["scripts/sprint-backlog.sh", "start-task"], cwd);
      expect(draft.status).toBe(1);
      expect(draft.stderr).toContain("approve the sprint before starting tasks");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("inline start-task requires an active plan for checklist-row capture", () => {
    const cwd = tmpWorkspace("sprint-backlog-inline-no-active-plan");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh", "capture-plan.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);

      const inline = run("bash", ["scripts/sprint-backlog.sh", "start-task", "--task", "task-b"], cwd);

      expect(inline.status).toBe(1);
      expect(inline.stderr).toContain("No active plan marker resolves to a plan");
      expect(inline.stderr).toContain("checklist-row capture failed for inline task 'task-b'");
      expect(existsSync(join(cwd, ".ai/harness/sprint/in-flight/task-b"))).toBe(false);
      expect(readdirSync(join(cwd, "plans")).filter((name) => name.includes("task-b"))).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("complete-task --sprint override works without the runtime marker", () => {
    const cwd = tmpWorkspace("sprint-backlog-sprint-override");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);
      rmSync(join(cwd, ".ai/harness/sprint/active-sprint"));

      const complete = run(
        "bash",
        ["scripts/sprint-backlog.sh", "complete-task", "--sprint", sprintPath, "--task", "task-a", "--plan", "plans/archive/plan-x.md"],
        cwd
      );
      expect(complete.status).toBe(0);
      expect(readFileSync(join(cwd, sprintPath), "utf-8")).toContain(
        "| 1 | [x] | task-a | contract | unit tests pass | `plans/archive/plan-x.md` |"
      );

      const outside = run(
        "bash",
        ["scripts/sprint-backlog.sh", "complete-task", "--sprint", "outside/x.sprint.md", "--task", "task-b"],
        cwd
      );
      expect(outside.status).toBe(1);
      expect(outside.stderr).toContain("does not resolve to a sprint file under plans/sprints");

      writeFileSync(join(cwd, "outside.sprint.md"), readFileSync(join(cwd, sprintPath), "utf-8"));
      symlinkSync("../../outside.sprint.md", join(cwd, "plans/sprints/link.sprint.md"));
      const symlinkEscape = run(
        "bash",
        ["scripts/sprint-backlog.sh", "complete-task", "--sprint", "plans/sprints/link.sprint.md", "--task", "task-b"],
        cwd
      );
      expect(symlinkEscape.status).toBe(1);
      expect(symlinkEscape.stderr).toContain("does not resolve to a sprint file under plans/sprints");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("mutations reclaim a stale backlog lock instead of deadlocking", () => {
    const cwd = tmpWorkspace("sprint-backlog-stale-lock");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);
      const lockDir = join(cwd, ".ai/harness/sprint/.backlog-lock");
      mkdirSync(lockDir, { recursive: true });
      // Backdate the lock past the 1-minute stale threshold.
      expect(run("bash", ["-lc", `touch -t 202001010000 '${lockDir}'`], cwd).status).toBe(0);

      const complete = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a"], cwd, LOCK_TEST_ENV);
      expect(complete.status).toBe(0);
      expect(complete.stderr).toContain("reclaiming stale backlog lock");
      expect(existsSync(lockDir)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("check-task-workflow sprint validation", () => {
  test("flags non-ready approved sprints, unknown statuses, and stale markers in strict mode", () => {
    const cwd = tmpWorkspace("sprint-check-bad");
    try {
      copySprintHelpers(cwd, ["check-task-workflow.sh"]);
      mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/sprints/20260610-0000-bad.sprint.md"),
        [
          "# Sprint: Bad",
          "",
          "> **Status**: Approved",
          "",
          "## PRD",
          "",
          "- ...",
          "",
          "## Backlog",
          "",
          "| # | Status | Task | Mode | Acceptance | Plan |",
          "|---|--------|------|------|------------|------|",
          "| 1 | [ ] | task-a | warp | tbd | (pending) |",
          "| 1 | [ ] | task-a | inline | Replace with a machine-checkable acceptance line | (pending) |",
          "",
        ].join("\n")
      );
      writeFileSync(join(cwd, "plans/sprints/20260610-0001-weird.sprint.md"), "# Sprint: Weird\n\n> **Status**: Cooking\n");
      writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), "plans/sprints/missing.sprint.md");

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("PRD section is empty or placeholder-only");
      expect(res.stdout).toContain("row 1 has an invalid mode (expected contract or inline)");
      expect(res.stdout).toContain("row 1 is missing a concrete acceptance line");
      expect(res.stdout).toContain("still has the template placeholder acceptance");
      expect(res.stdout).toContain("duplicate backlog index 1");
      expect(res.stdout).toContain("duplicate backlog task task-a");
      expect(res.stdout).toContain("Sprint has unknown status 'Cooking'");
      expect(res.stdout).toContain("Active sprint marker does not resolve to a sprint file");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("reports unknown status instead of crashing on quotes in sprint status", () => {
    const cwd = tmpWorkspace("sprint-check-quote");
    try {
      copySprintHelpers(cwd, ["check-task-workflow.sh"]);
      mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/sprints/20260610-0000-quote.sprint.md"),
        "# Sprint: Quote\n\n> **Status**: Don't ship\n"
      );

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Sprint has unknown status 'Don't ship'");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("flags markers pointing outside the sprints dir", () => {
    const cwd = tmpWorkspace("sprint-check-outside-marker");
    try {
      copySprintHelpers(cwd, ["check-task-workflow.sh"]);
      mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
      mkdirSync(join(cwd, "outside"), { recursive: true });
      writeFileSync(join(cwd, "outside/victim.sprint.md"), "# Sprint: Victim\n\n> **Status**: Draft\n");
      writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), "outside/victim.sprint.md");

      const res = run("bash", ["scripts/check-task-workflow.sh"], cwd);
      expect(res.stdout).toContain("Active sprint marker points outside plans/sprints");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("draft skeletons and execution-ready sprints emit no sprint issues", () => {
    const cwd = tmpWorkspace("sprint-check-ok");
    try {
      copySprintHelpers(cwd, ["check-task-workflow.sh"]);
      mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/sprints/20260610-0000-draft.sprint.md"),
        "# Sprint: Draft Skeleton\n\n> **Status**: Draft\n\n## PRD\n\n- ...\n"
      );
      writeActiveSprintFixture(cwd, "plans/sprints/20260610-0001-ready.sprint.md");

      const res = run("bash", ["scripts/check-task-workflow.sh"], cwd);
      expect(res.stdout).not.toContain("[workflow] Sprint ");
      expect(res.stdout).not.toContain("Active sprint marker");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("sprint projection", () => {
  test("refresh-current-status renders the active sprint section", () => {
    const cwd = tmpWorkspace("sprint-refresh-status");
    try {
      copySprintHelpers(cwd, ["refresh-current-status.sh"]);
      writeActiveSprintFixture(cwd, "plans/sprints/20260610-0000-fixture-sprint.sprint.md");

      const res = run("bash", ["scripts/refresh-current-status.sh"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("## Active Sprint");
      expect(res.stdout).toContain("- Sprint: `plans/sprints/20260610-0000-fixture-sprint.sprint.md`");
      expect(res.stdout).toContain("- Sprint Status: Approved");
      expect(res.stdout).toContain("- Backlog: 0/2");
      expect(res.stdout).toContain("- Next Sprint Task: task-a");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("refresh-current-status reports no sprint when the marker is absent", () => {
    const cwd = tmpWorkspace("sprint-refresh-none");
    try {
      copySprintHelpers(cwd, ["refresh-current-status.sh"]);

      const res = run("bash", ["scripts/refresh-current-status.sh"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("- Sprint: (none)");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  // HRD-04 retired session-start-context.sh; the direct-spawn vehicle
  // retargets through the in-process session-context builder with identical
  // Active Sprint assertions (installHooks() is no longer needed -- the
  // builder reads repo facts directly, not a vendored script).
  test("session-start hook injects active sprint context and stays inert without a marker", () => {
    const cwd = tmpWorkspace("sprint-session-start");
    try {
      const freshCollector = () => createStateInputCollector({
        event: "SessionStart",
        repoRoot: cwd,
        resolveSessionEffectiveState: () => null,
      });

      const inert = sessionStartMainContent(freshCollector(), process.env, Date.now());
      expect(inert === null || !inert.includes("Active Sprint")).toBe(true);

      writeActiveSprintFixture(cwd, "plans/sprints/20260610-0000-fixture-sprint.sprint.md");
      const active = sessionStartMainContent(freshCollector(), process.env, Date.now());
      expect(active).not.toBeNull();
      expect(active).toContain("Active Sprint");
      expect(active).toContain("backlog=0/2");
      expect(active).toContain("task-a");
      expect(active).toContain("Use `$think` to expand the next sprint task");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe("sprint asset parity", () => {
  test("self-host scripts match the distributed template helpers", () => {
    expect(readFileSync(join(ROOT, "scripts/sprint-backlog.sh"), "utf-8")).toBe(
      readFileSync(join(HELPER_DIR, "sprint-backlog.sh"), "utf-8")
    );
    expect(readFileSync(join(ROOT, ".claude/templates/sprint.template.md"), "utf-8")).toBe(
      readFileSync(join(ROOT, "assets/templates/sprint.template.md"), "utf-8")
    );
    expect(readFileSync(join(ROOT, ".claude/templates/prd.template.md"), "utf-8")).toBe(
      readFileSync(join(ROOT, "assets/templates/prd.template.md"), "utf-8")
    );
    expect(readFileSync(join(ROOT, "scripts/check-task-workflow.sh"), "utf-8")).toBe(
      readFileSync(join(HELPER_DIR, "check-task-workflow.sh"), "utf-8")
    );
    expect(readFileSync(join(ROOT, "scripts/refresh-current-status.sh"), "utf-8")).toBe(
      readFileSync(join(HELPER_DIR, "refresh-current-status.sh"), "utf-8")
    );
    expect(readFileSync(join(ROOT, "docs/reference-configs/sprint-contracts.md"), "utf-8")).toBe(
      readFileSync(join(ROOT, "assets/reference-configs/sprint-contracts.md"), "utf-8")
    );
  });
});
