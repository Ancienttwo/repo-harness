import { buildLeaseOwnerRecord, bindLeaseRecord, projectCanonicalTasks } from '../src/core/state/coordination-identity';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../src/effects/state/coordination-lease-store';
import { describe, test, expect, setDefaultTimeout } from "bun:test";

// This file exercises .ai/hooks/*.sh via spawnSync; hook fork/exec chains
// exceed bun's 5s default under parallel load (see tasks/lessons.md 2026-06-10).
setDefaultTimeout(20000);
import {
  chmodSync,
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
import { spawn, spawnSync } from "child_process";
import { backlogRows, sprintBacklogSchema } from '../src/core/state/sprint-backlog-rows';
import { readCanonicalSprint } from '../src/effects/state/coordination-canonical-source';
import { fixtureTaskId } from './helpers/sprint-fixture';

const ROOT = join(import.meta.dir, "..");
const HELPER_DIR = join(ROOT, "scripts");
const CLI = join(ROOT, "src/cli/index.ts");

// sprint-backlog.sh now reaches the shared coordination plane under the git
// common directory, so every workspace is a real repository. An ambient
// `repo-harness` on PATH would be a different build, so the helper is pointed
// at this checkout through REPO_HARNESS_CLI_BIN.
const CLI_WRAPPER = (() => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sprint-backlog-cli-")));
  const wrapper = join(dir, "repo-harness");
  writeFileSync(wrapper, `#!/bin/bash\nexec ${process.execPath} ${CLI} "$@"\n`);
  chmodSync(wrapper, 0o755);
  return wrapper;
})();

const BACKLOG_LOCK_RELATIVE = ".git/repo-harness/coordination/v1/locks/backlog.lock";
// Coordination wait metrics land in the primary worktree (the parent of the git
// common directory), so a plain fixture repo sees them at its own root.
const WAITS_LEDGER_RELATIVE = ".ai/harness/runs/coordination/waits.jsonl";

function readJsonl(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function tmpWorkspace(prefix: string): string {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  for (const args of [
    ["init", "--quiet", "--initial-branch", "main"],
    ["config", "user.email", "sprint@example.com"],
    ["config", "user.name", "Sprint Fixture"],
  ]) {
    expect(spawnSync("git", args, { cwd, encoding: "utf-8" }).status).toBe(0);
  }
  return cwd;
}

/** Commit the fixture so the canonical target ref carries the backlog row. */
function commitFixture(cwd: string): void {
  expect(spawnSync("git", ["add", "-A"], { cwd, encoding: "utf-8" }).status).toBe(0);
  expect(spawnSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd, encoding: "utf-8" }).status).toBe(0);
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
    env: { ...base, REPO_HARNESS_CLI_BIN: CLI_WRAPPER, ...env },
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
      "> **Backlog Schema**: 2",
      "",
      "## PRD",
      "",
      "Real problem statement with concrete user outcomes.",
      "",
      "## Backlog",
      "",
      "| # | ID | Status | Task | Mode | Acceptance | Plan |",
      "|---|----|--------|------|------|------------|------|",
      `| 1 | ${fixtureTaskId('task-a')} | [ ] | task-a | contract | unit tests pass | (pending) |`,
      `| 2 | ${fixtureTaskId('task-b')} | [ ] | task-b | inline | doc section updated | (pending) |`,
      "",
      "## Execution Log",
      "",
      "| When | Task | Plan | Result |",
      "|------|------|------|--------|",
      "",
    ].join("\n")
  );
  writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), sprintRelPath);
  const plan = 'plans/plan-task-a.md';
  const contract = 'tasks/contracts/task-a.contract.md';
  mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
  writeFileSync(join(cwd, plan), [
    '# Supplied execution plan', '', '> **Status**: Approved',
    `> **Source Ref**: sprint:${sprintRelPath}#task-a`,
    `> **Task Contract**: ${contract}`, '', '## Task Breakdown', '',
    '- [ ] Implement the bounded task-a behavior and verify unit tests pass.', '',
  ].join('\n'));
  writeFileSync(join(cwd, contract), [
    '# Supplied task-a brief', '', '## Goal', '', 'Implement task-a so the named unit tests pass.',
    '', '## Why', '', 'Task-a is the bounded sprint outcome that this execution input authorizes.',
    '', '## Scope', '', '- In scope: the task-a implementation in src/.' ,
    '- Out of scope: unrelated sprint rows and repository configuration.',
    '', '## Allowed Paths', '', '```yaml', 'allowed_paths:', '  - src/', '```',
    '', '## Exit Criteria', '', '```yaml', 'exit_criteria:', '  files_exist:', '    - src/task-a.ts', '```', '',
  ].join('\n'));
  const sprintFile = join(cwd, sprintRelPath);
  writeFileSync(sprintFile, readFileSync(sprintFile, 'utf8').replace('unit tests pass | (pending)', `unit tests pass | \`${plan}\``));
  commitFixture(cwd);
}

function seedBoundRow(cwd: string, sprintPath: string, taskCell: string): void {
  const task = projectCanonicalTasks({ repoIdentity: cwd, sprintPath,
    sprintText: readFileSync(join(cwd, sprintPath), 'utf8') }).find(item => item.row.task === taskCell);
  if (!task) throw new Error('fixture task is missing');
  const claimId = '44444444-4444-4444-8444-444444444444';
  const unitRef = `inline:${sprintPath}#${task.row.index}`;
  const record = buildLeaseOwnerRecord({ claimId, taskId: task.task_id, taskRevision: task.task_revision,
    sprintPath, targetRef: 'main', generation: 1, sessionId: 'fixture', sourceWorktree: cwd });
  const bound = bindLeaseRecord(record, { claimId, executionWorktree: cwd, branch: 'main', unitRef });
  if (!bound.ok) throw new Error(bound.error);
  createLeaseDirectory(cwd, task.task_id);
  writeLeaseOwnerDurably(cwd, task.task_id, bound.record);
  const dir = join(cwd, '.ai/harness/sprint/claims');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${task.task_id}.claim`),
    `claim_id=${claimId}\ntask_id=${task.task_id}\nsprint=${sprintPath}\ntask=${taskCell}\nunit_ref=${unitRef}\n`);
}

describe("sprint-backlog helper", () => {
  // Path existence is not identity: a downstream application can have its own
  // src/cli/index.ts. Only the repo-harness package itself runs its source CLI.
  for (const packageName of ["downstream-app", "repo-harness"]) {
    test(`complete-task with package ${packageName} picks ${packageName === "repo-harness" ? "the source CLI" : "the CLI on PATH"}`, () => {
      const cwd = tmpWorkspace("sprint-backlog-cli-identity");
      const bin = realpathSync(mkdtempSync(join(tmpdir(), "sprint-backlog-path-cli-")));
      try {
        copySprintHelpers(cwd, ["sprint-backlog.sh"]);
        writeActiveSprintFixture(cwd, "plans/sprints/20260610-0000-fixture-sprint.sprint.md");
        const sourceLog = join(cwd, "source-cli.log");
        const pathLog = join(bin, "path-cli.log");
        mkdirSync(join(cwd, "src/cli"), { recursive: true });
        writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: packageName, private: true }));
        writeFileSync(join(cwd, "src/cli/index.ts"), `require("fs").appendFileSync(${JSON.stringify(sourceLog)}, process.argv.slice(2).join(" ") + "\\n"); process.exit(7);\n`);
        writeFileSync(join(bin, "repo-harness"), `#!/bin/bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(pathLog)}\nexit 7\n`);
        chmodSync(join(bin, "repo-harness"), 0o755);
        commitFixture(cwd);
        const start = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a"], cwd, {
          REPO_HARNESS_CLI_BIN: "",
          PATH: `${bin}:${process.env.PATH}`,
        });
        expect(start.status).not.toBe(0);
        const [chosen, other] = packageName === "repo-harness" ? [sourceLog, pathLog] : [pathLog, sourceLog];
        expect(readFileSync(chosen, "utf-8")).toStartWith("sprint complete-row --sprint");
        expect(existsSync(other)).toBe(false);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
        rmSync(bin, { recursive: true, force: true });
      }
    });
  }

  for (const command of ["status", "next"]) {
    for (const pending of [true, false]) {
      test(`${command} consumes a long backlog with ${pending ? "pending" : "completed"} rows`, () => {
        const cwd = tmpWorkspace("sprint-backlog-long");
        try {
          copySprintHelpers(cwd, ["sprint-backlog.sh"]);
          const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
          writeActiveSprintFixture(cwd, sprintPath);
          const sprint = readFileSync(join(cwd, sprintPath), "utf-8");
          // Exceed the pipe buffer so an early-exiting selector cannot hide
          // behind the producer finishing before the reader closes its end.
          const rows = Array.from({ length: 4096 }, (_, index) =>
            `| ${index + 1} | ${fixtureTaskId(`long-${index}`)} | ${pending && index > 0 ? "[ ]" : "[x]"} | task-${index + 1} | inline | ${"acceptance ".repeat(20)} | (pending) |`
          ).join("\n");
          writeFileSync(join(cwd, sprintPath), sprint.replace(/^\| 1 \|[\s\S]*?(?=\n## Execution Log)/m, `${rows}\n`));

          const result = run("bash", ["scripts/sprint-backlog.sh", command], cwd);
          expect(result.status).toBe(command === "next" && !pending ? 3 : 0);
          expect(result.stderr).toBe("");
          if (command === "status") {
            expect(result.stdout).toContain("tasks_total: 4096");
            expect(result.stdout).toContain(`tasks_done: ${pending ? 1 : 4096}\n`);
            expect(result.stdout).toContain(`next_task: ${pending ? "task-2" : "(none)"}\n`);
          } else if (pending) {
            expect(result.stdout).toContain("index: 2\ntask: task-2\n");
            expect(result.stdout.match(/^task:/gm)).toHaveLength(1);
          } else {
            expect(result.stdout).toBe("next_task: (none)\n");
          }
        } finally {
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    }
  }

  test("next_pending_row preserves an upstream failure after a matching row", () => {
    // The script dispatches on $1, so lift the live function as the grammar
    // differential tests do; replace only the producer to inject its failure.
    const source = readFileSync(join(ROOT, "scripts/sprint-backlog.sh"), "utf-8");
    const definition = source.match(/^next_pending_row\(\) \{\n[\s\S]*?\n\}$/m)?.[0];
    expect(definition).toBeDefined();
    const result = spawnSync("bash", ["-c", [
      "set -euo pipefail",
      "backlog_rows() { printf '1\\t[ ]\\ttask-a\\n'; return 17; }",
      definition!,
      "next_pending_row unused",
    ].join("\n")], { encoding: "utf-8" });
    expect(result.status).toBe(17);
    expect(result.stdout).toBe("1\t[ ]\ttask-a\n");
  });

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
  }, 30_000);

  test("accepts target repo root when it matches the helper cwd", () => {
    const cwd = tmpWorkspace("sprint-env-match");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);

      writeActiveSprintFixture(cwd, "plans/sprints/existing.sprint.md");
      const init = run(
        "bash",
        ["scripts/sprint-backlog.sh", "status"],
        cwd,
        { REPO_HARNESS_TARGET_REPO_ROOT: cwd }
      );

      expect(init.status).toBe(0);
      expect(init.stdout).toContain("tasks_total: 2");
      expect(existsSync(join(cwd, ".ai/harness/sprint/active-sprint"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

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
      expect(afterFirst).toContain(`| 1 | ${fixtureTaskId('task-a')} | [x] | task-a | contract | unit tests pass | \`plans/plan-20260610-0001-task-a.md\` |`);
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
  }, 30_000);

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
          `| 2 | ${fixtureTaskId('task-b')} | [ ] | task-b | inline | doc section updated | (pending) |`,
          `| 1 | ${fixtureTaskId('task-dup')} | [ ] | task-dup | inline | duplicate index row | (pending) |\n| 2 | ${fixtureTaskId('task-b')} | [ ] | task-b | inline | doc section updated | (pending) |`
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
      expect(after).toContain(`| 1 | ${fixtureTaskId('task-a')} | [x] | task-a | contract | unit tests pass | \`plans\\windows\\plan-a.md\` |`);
      expect(after).toContain(`| 1 | ${fixtureTaskId('task-dup')} | [ ] | task-dup | inline | duplicate index row | (pending) |`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

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
  }, 30_000);

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
  }, 30_000);

  test("the inline completion gate refuses a claimed row without the owning token", () => {
    // The false-completion this protocol exists to close: flipping a row to [x]
    // is what publishes "this task is done", so a tree that does not hold the
    // owning fencing token must not be able to do it.
    const cwd = tmpWorkspace("sprint-backlog-completion-gate");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);

      // Zero coordination: with no lease store the gate never reaches the
      // plane, which is what keeps the single-agent flow unchanged.
      expect(existsSync(join(cwd, ".git/repo-harness/coordination/v1/leases"))).toBe(false);

      seedBoundRow(cwd, sprintPath, 'task-b');
      const claimsDir = join(cwd, ".ai/harness/sprint/claims");
      const token = join(claimsDir, readdirSync(claimsDir)[0]);
      const ownerToken = readFileSync(token, "utf-8");
      const claimId = ownerToken.match(/^claim_id=(.+)$/m)?.[1] ?? "";
      expect(claimId).not.toBe("");

      // A tree holding no token for the row is refused, and the refusal names
      // the claim that owns it rather than reporting a generic conflict.
      rmSync(token);
      const foreign = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-b"], cwd);
      expect(foreign.status).toBe(1);
      expect(foreign.stderr).toContain(`is claimed by ${claimId}`);
      expect(foreign.stderr).toContain("holds no claim token");
      expect(readFileSync(join(cwd, sprintPath), "utf-8")).toContain(`| 2 | ${fixtureTaskId('task-b')} | [ ] | task-b |`);

      // A stolen-from tree keeps its old token; the comparison is against the
      // owner record, so the stale token is refused too.
      writeFileSync(token, ownerToken.replace(claimId, "claim-that-was-stolen-from"));
      const stale = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-b"], cwd);
      expect(stale.status).toBe(1);
      expect(stale.stderr).toContain("the claim moved");
      expect(readFileSync(join(cwd, sprintPath), "utf-8")).toContain(`| 2 | ${fixtureTaskId('task-b')} | [ ] | task-b |`);

      // A row with no lease of its own completes unchanged, even though the
      // lease store is live for a sibling row.
      const unclaimed = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a"], cwd);
      expect(unclaimed.status, `${unclaimed.stdout}\n${unclaimed.stderr}`).toBe(0);
      expect(readFileSync(join(cwd, sprintPath), "utf-8")).toMatch(/\|\s*1\s*\|\s*[0-9a-f]{64}\s*\|\s*\[x\]\s*\|\s*task-a/);

      // And the owning token still completes its own row and releases it.
      writeFileSync(token, ownerToken);
      const owner = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-b"], cwd);
      expect(owner.status, `${owner.stdout}\n${owner.stderr}`).toBe(0);
      expect(owner.stdout).toContain("Released lease for 'task-b'");
      expect(readdirSync(claimsDir)).toHaveLength(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);

  test("a title edit keeps identity and stales the lease: completion fails on task revision", () => {
    // The two halves of the contract, in one flow. Identity survives a rename,
    // so the claim token is still found -- it is named `<task_id>.claim`, not
    // by the Task cell. But the revision moved, so the lease this tree holds
    // was taken against a definition that no longer exists, and completing on
    // it would publish "done" for work nobody agreed to. The contract path
    // already fences this in `sprint begin-completion`; the inline path did
    // not, and silently completed and released instead.
    const cwd = tmpWorkspace("sprint-backlog-rename-revision");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);

      seedBoundRow(cwd, sprintPath, 'task-b');
      const claimsDir = join(cwd, ".ai/harness/sprint/claims");
      const taskId = fixtureTaskId("task-b");
      // The token is addressed by identity, not by title.
      expect(readdirSync(claimsDir).filter((name) => name.endsWith(".claim"))).toEqual([`${taskId}.claim`]);
      const leaseDir = join(cwd, ".git/repo-harness/coordination/v1/leases", taskId);
      expect(existsSync(leaseDir)).toBe(true);

      // Rename the row: the persisted ID cell is untouched, only the Task text
      // moves, so identity survives and the revision drifts.
      const before = readFileSync(join(cwd, sprintPath), "utf-8");
      const renamed = before.replace(
        `| ${taskId} | [ ] | task-b |`,
        `| ${taskId} | [ ] | task-b (clarified) |`,
      );
      expect(renamed).not.toBe(before);
      writeFileSync(join(cwd, sprintPath), renamed);
      run("git", ["add", "-A"], cwd);
      run("git", ["commit", "-q", "-m", "rename the row"], cwd);

      // The token is found -- identity held -- and the revision fence refuses.
      const stale = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-b (clarified)"], cwd);
      expect(stale.status).toBe(1);
      expect(stale.stderr).not.toContain("holds no claim token");
      expect(stale.stderr).toContain("drifted since it was claimed");
      expect(stale.stderr).toContain("repo-harness sprint release --claim-id");
      // Nothing moved: the row is still pending and the lease still stands.
      expect(readFileSync(join(cwd, sprintPath), "utf-8"))
        .toContain(`| 2 | ${taskId} | [ ] | task-b (clarified) |`);
      expect(existsSync(leaseDir)).toBe(true);
      expect(readdirSync(claimsDir).filter((name) => name.endsWith(".claim"))).toEqual([`${taskId}.claim`]);

      // The retained cleanup releases the stale claim.
      expect(run(CLI_WRAPPER, ["sprint", "release", "--claim-id", "44444444-4444-4444-8444-444444444444"], cwd).status).toBe(0);
      expect(existsSync(leaseDir)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 60_000);

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
        `| 1 | ${fixtureTaskId('task-a')} | [x] | task-a | contract | unit tests pass | \`plans/archive/plan-x.md\` |`
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
  }, 30_000);

  test("mutations reclaim a stale backlog lock instead of deadlocking", () => {
    const cwd = tmpWorkspace("sprint-backlog-stale-lock");
    try {
      copySprintHelpers(cwd, ["sprint-backlog.sh"]);
      const sprintPath = "plans/sprints/20260610-0000-fixture-sprint.sprint.md";
      writeActiveSprintFixture(cwd, sprintPath);
      const lockDir = join(cwd, BACKLOG_LOCK_RELATIVE);
      mkdirSync(lockDir, { recursive: true });
      // Backdate the lock past the 1-minute stale threshold.
      expect(run("bash", ["-lc", `touch -t 202001010000 '${lockDir}'`], cwd).status).toBe(0);

      // Completion owns the retained TypeScript backlog lock.
      const start = run("bash", ["scripts/sprint-backlog.sh", "complete-task", "--task", "task-a"], cwd, LOCK_TEST_ENV);
      expect(start.status, `${start.stdout}\n${start.stderr}`).toBe(0);
      expect(start.stderr).toContain("reclaiming stale backlog lock");
      expect(existsSync(lockDir)).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

});

describe("explicit canonical sprint validation", () => {
  // check-task-workflow is advisory JSON observation. Execution identity safety
  // belongs to canonical sprint reads; PRD placeholders and local markers are
  // no longer workflow permission inputs.
  for (const [label, change, diagnostic] of [
    ['duplicate schema', (text: string) => text.replace('> **Backlog Schema**: 2', '> **Backlog Schema**: 2\n> **Backlog Schema**: 2'), '2 times'],
    ['unknown status', (text: string) => text.replace('> **Status**: Approved', "> **Status**: Don't ship"), "unknown status 'Don't ship'"],
  ] as const) {
    test(`canonical admission refuses ${label}`, () => {
      const cwd = tmpWorkspace('canonical-sprint-validation');
      try {
        const sprintPath = 'plans/sprints/fixture.sprint.md';
        writeActiveSprintFixture(cwd, sprintPath);
        writeFileSync(join(cwd, sprintPath), change(readFileSync(join(cwd, sprintPath), 'utf8')));
        commitFixture(cwd);
        const identified = readCanonicalSprint(cwd, { targetRef: 'main', sprintPath });
        expect(identified.ok).toBe(false);
        if (identified.ok) throw new Error('expected a canonical reader refusal');
        expect(identified.error).toContain(diagnostic);
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  }
  test('canonical schema ignores quoted markers below the Backlog heading', () => {
    const cwd = tmpWorkspace('canonical-sprint-schema-prose');
    try {
      const sprintPath = 'plans/sprints/fixture.sprint.md';
      writeActiveSprintFixture(cwd, sprintPath);
      writeFileSync(join(cwd, sprintPath), readFileSync(join(cwd, sprintPath), 'utf8') + '\n## Notes\n\n> **Backlog Schema**: 2\n');
      commitFixture(cwd);
      expect(readCanonicalSprint(cwd, { targetRef: 'main', sprintPath }).ok).toBe(true);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
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
  }, 30_000);

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
  }, 30_000);
});

describe("sprint template boundaries", () => {
  test("self-host optional templates retain executable schema and inline defaults", () => {
    const sprint = readFileSync(join(ROOT, '.claude/templates/sprint.template.md'), 'utf8');
    expect(sprintBacklogSchema(sprint)).toBe(2);
    expect(sprint).toContain('| # | ID | Status | Task | Mode | Acceptance | Plan |');
    expect(sprint).toContain('persisted, immutable task identity');
    expect(sprint).toContain('editing the Task text is a rename');
    expect(backlogRows(sprint)).toHaveLength(1);
    expect(backlogRows(sprint)[0]!.mode).toBe('inline');
    expect(backlogRows(sprint)[0]!.id).toBe('{{TASK_ID_1}}');
    expect(sprint).toContain('Optional document:');
    expect(sprint).toContain('contract rows only for an explicitly requested contract workflow');
    const prd = readFileSync(join(ROOT, '.claude/templates/prd.template.md'), 'utf8');
    expect(prd).toContain('Optional document:');
    expect(prd).toContain('This document is not a merge permit.');
  });
});
