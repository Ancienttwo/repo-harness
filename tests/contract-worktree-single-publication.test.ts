import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const REAL_GIT = Bun.which("git");
if (!REAL_GIT) throw new Error("git executable is required for contract-worktree publication tests");
const PLAN = "plans/plan-20260814-1629-demo.md";
const CONTRACT = "tasks/contracts/20260814-1629-demo.contract.md";
const REVIEW = "tasks/reviews/20260814-1629-demo.review.md";
const NOTES = "tasks/notes/20260814-1629-demo.notes.md";

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  const isolated = { ...process.env };
  for (const key of [
    "REPO_HARNESS_TARGET_REPO_ROOT",
    "REPO_HARNESS_HELPER_SOURCE_PATH",
    "REPO_HARNESS_SOURCE_ROOT",
    "REPO_HARNESS_GIT_BIN",
  ]) delete isolated[key];
  return spawnSync(command, args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...isolated,
      REPO_HARNESS_BUN_BIN: process.execPath,
      REPO_HARNESS_WORKFLOW_STATE_LIB: join(cwd, ".ai/hooks/lib/workflow-state.sh"),
      ...env,
    },
  });
}

function writeExecutable(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

function commitAll(cwd: string, message: string): string {
  expect(run("git", ["add", "-A"], cwd).status).toBe(0);
  const committed = run("git", ["commit", "-m", message], cwd);
  expect(committed.status, `${committed.stdout}\n${committed.stderr}`).toBe(0);
  return run("git", ["rev-parse", "HEAD"], cwd).stdout.trim();
}

function installFixture(container: string): { primary: string; linked: string } {
  const primary = join(container, "primary");
  const linked = join(container, "linked");
  mkdirSync(primary, { recursive: true });
  expect(run("git", ["init", "-b", "main"], primary).status).toBe(0);
  expect(run("git", ["config", "user.name", "Publication Test"], primary).status).toBe(0);
  expect(run("git", ["config", "user.email", "publication@test.local"], primary).status).toBe(0);

  for (const dir of [
    "scripts",
    ".ai/hooks/lib",
    ".ai/harness/checks",
    "docs/architecture",
    "plans/archive",
    "tasks/archive",
    "tasks/contracts",
    "tasks/reviews",
    "tasks/notes",
  ]) mkdirSync(join(primary, dir), { recursive: true });

  for (const helper of ["contract-worktree.sh", "archive-workflow.sh"]) {
    copyFileSync(join(ROOT, "scripts", helper), join(primary, "scripts", helper));
    chmodSync(join(primary, "scripts", helper), 0o755);
  }
  copyFileSync(join(ROOT, "assets/hooks/lib/workflow-state.sh"), join(primary, ".ai/hooks/lib/workflow-state.sh"));
  writeFileSync(join(primary, "scripts/acceptance-receipt.ts"), "process.exit(0);\n");
  writeFileSync(
    join(primary, "scripts/merge-gate.ts"),
    [
      'import { readFileSync, writeFileSync } from "fs";',
      'import { spawnSync } from "child_process";',
      'const counterFile = process.env.MERGE_GATE_COUNTER_FILE;',
      'const count = counterFile ? Number(readFileSync(counterFile, "utf-8") || "0") + 1 : 0;',
      'if (counterFile) writeFileSync(counterFile, String(count));',
      'if (process.env.MOVE_TARGET_ON_SECOND_GATE === "1" && count === 2) {',
      '  const moved = spawnSync("git", ["-C", process.env.PUBLICATION_TARGET_WORKTREE!, "commit", "--allow-empty", "-m", "concurrent target movement"], { encoding: "utf-8" });',
      '  if (moved.status !== 0) process.exit(moved.status ?? 1);',
      '}',
      'const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim();',
      'process.stdout.write(`${head}\\n`);',
      "",
    ].join("\n"),
  );
  writeExecutable(join(primary, "scripts/check-architecture-sync.sh"), "#!/bin/bash\nexit 0\n");
  writeExecutable(join(primary, "scripts/verify-sprint.sh"), "#!/bin/bash\nexit 0\n");
  writeExecutable(
    join(primary, "scripts/refresh-current-status.sh"),
    "#!/bin/bash\nprintf '# Current Status Snapshot\\n\\n> **Status**: Idle\\n' > tasks/current.md\n",
  );
  writeFileSync(
    join(primary, ".ai/harness/policy.json"),
    `${JSON.stringify({ worktree_strategy: { review_base: "main", merge_back: { target: "main" } } }, null, 2)}\n`,
  );
  writeFileSync(join(primary, "docs/architecture/index.md"), "# Architecture Index\n\n## Pending Requests\n\n- (none)\n");
  writeFileSync(
    join(primary, PLAN),
    ["# Plan: demo", "", "> **Status**: Executing", "", "## Task Breakdown", "", "- [x] demo", ""].join("\n"),
  );
  writeFileSync(
    join(primary, CONTRACT),
    [
      "# Task Contract: demo",
      "",
      "> **Status**: Fulfilled",
      `> **Review File**: \`${REVIEW}\``,
      `> **Notes File**: \`${NOTES}\``,
      "",
      "```yaml",
      "allowed_paths:",
      "  - plans/",
      "  - tasks/",
      "  - src/",
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
  writeFileSync(join(primary, REVIEW), "# Task Review: demo\n\n> **Recommendation**: pass\n");
  writeFileSync(join(primary, NOTES), "# Implementation Notes: demo\n");
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
  writeFileSync(join(primary, ".ai/harness/active-plan"), PLAN);
  writeFileSync(
    join(primary, ".ai/harness/checks/latest.json"),
    `{"status":"pass","source":"verify-sprint","exit_code":0,"contract":{"file":"${CONTRACT}"},"review":{"file":"${REVIEW}"},"benchmark_evidence":{"status":"not_applicable","report_sha256":"","benchmark_subject_sha256":""}}\n`,
  );
  writeFileSync(join(primary, ".acceptance-pass"), "pass\n");

  commitAll(primary, "fixture base");
  expect(run("git", ["worktree", "add", "-b", "codex/demo", linked], primary).status).toBe(0);
  return { primary, linked };
}

describe("contract-worktree single publication commit", () => {
  test("finish --merge publishes all checkpoints and lifecycle output as one target commit", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-single-publication-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();

      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/first.ts"), "export const first = 1;\n");
      commitAll(linked, "checkpoint one");
      writeFileSync(join(linked, "src/second.ts"), "export const second = 2;\n");
      commitAll(linked, "checkpoint two");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked);
      expect(finish.status, `${finish.stdout}\n${finish.stderr}`).toBe(0);

      const published = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const sourceHead = run("git", ["rev-parse", "HEAD"], linked).stdout.trim();
      const commitCount = Number(run("git", ["rev-list", "--count", `${base}..main`], primary).stdout.trim());
      const parent = run("git", ["rev-parse", "main^"], primary).stdout.trim();
      const publishedTree = run("git", ["rev-parse", "main^{tree}"], primary).stdout.trim();
      const sourceTree = run("git", ["rev-parse", `${sourceHead}^{tree}`], linked).stdout.trim();

      expect(commitCount).toBe(1);
      expect(parent).toBe(base);
      expect(publishedTree).toBe(sourceTree);
      expect(published).not.toBe(sourceHead);
      expect(run("git", ["merge-base", "--is-ancestor", sourceHead, "main"], primary).status).not.toBe(0);
      expect(readFileSync(join(primary, "src/first.ts"), "utf-8")).toBe("export const first = 1;\n");
      expect(readFileSync(join(primary, "src/second.ts"), "utf-8")).toBe("export const second = 2;\n");
      expect(existsSync(join(primary, "plans/archive"))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("finish fails closed when the target moves after the gate freezes its base", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-target-move-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const counterFile = join(container, "merge-gate-count");
      writeFileSync(counterFile, "0");
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before target movement");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        MERGE_GATE_COUNTER_FILE: counterFile,
        MOVE_TARGET_ON_SECOND_GATE: "1",
        PUBLICATION_TARGET_WORKTREE: primary,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("target branch moved after merge-gate review");
      expect(run("git", ["rev-list", "--count", `${base}..main`], primary).stdout.trim()).toBe("1");
      expect(run("git", ["log", "-1", "--format=%s", "main"], primary).stdout.trim()).toBe("concurrent target movement");
      expect(existsSync(join(linked, PLAN))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("finish rejects a synthesized commit whose tree differs from the verified lifecycle tree", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-tree-mismatch-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const wrongTree = run("git", ["rev-parse", `${base}^{tree}`], primary).stdout.trim();
      const fakeGit = join(container, "fake-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "commit-tree" && -n "${WRONG_PUBLICATION_TREE:-}" ]]; then',
          "  shift 2",
          `  exec ${JSON.stringify(REAL_GIT)} commit-tree "$WRONG_PUBLICATION_TREE" "$@"`,
          "fi",
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before tree mismatch");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
        WRONG_PUBLICATION_TREE: wrongTree,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("synthesized publication tree does not match verified lifecycle tree");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
      expect(existsSync(join(linked, PLAN))).toBe(true);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("finish refuses an empty publication when lifecycle and frozen target trees match", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-empty-publication-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const fixedTree = run("git", ["rev-parse", "main^{tree}"], primary).stdout.trim();
      const fakeGit = join(container, "equal-tree-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "rev-parse" && "${2:-}" == *"^{tree}" ]]; then',
          '  printf "%s\\n" "$FIXED_PUBLICATION_TREE"',
          "  exit 0",
          "fi",
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before empty publication");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
        FIXED_PUBLICATION_TREE: fixedTree,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("refusing empty publication");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("commit.gpgsign requires the signed commit-tree path and fails before target mutation", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-signed-publication-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const fakeGit = join(container, "signed-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "config" && "${2:-}" == "--get" && "${3:-}" == "commit.gpgsign" ]]; then printf "true\\n"; exit 0; fi',
          'if [[ "${1:-}" == "config" && "${2:-}" == "--bool" && "${3:-}" == "--get" && "${4:-}" == "commit.gpgsign" ]]; then printf "true\\n"; exit 0; fi',
          'if [[ "${1:-}" == "commit-tree" ]]; then',
          '  for arg in "$@"; do',
          '    if [[ "$arg" == "-S" ]]; then echo "injected signing failure" >&2; exit 55; fi',
          "  done",
          "  echo 'commit-tree omitted -S' >&2",
          "  exit 56",
          "fi",
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before signing failure");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("injected signing failure");
      expect(finish.stderr).not.toContain("commit-tree omitted -S");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);

  test("an invalid commit.gpgsign value fails closed before commit-tree", () => {
    const container = realpathSync(mkdtempSync(join(tmpdir(), "contract-worktree-invalid-signing-")));
    try {
      const { primary, linked } = installFixture(container);
      const base = run("git", ["rev-parse", "main"], primary).stdout.trim();
      const fakeGit = join(container, "invalid-signing-git.sh");
      writeExecutable(
        fakeGit,
        [
          "#!/bin/bash",
          'if [[ "${1:-}" == "config" && "${2:-}" == "--get" && "${3:-}" == "commit.gpgsign" ]]; then printf "sometimes\\n"; exit 0; fi',
          'if [[ "${1:-}" == "config" && "${2:-}" == "--bool" && "${3:-}" == "--get" && "${4:-}" == "commit.gpgsign" ]]; then exit 3; fi',
          'if [[ "${1:-}" == "commit-tree" ]]; then echo "commit-tree must not run" >&2; exit 57; fi',
          `exec ${JSON.stringify(REAL_GIT)} "$@"`,
          "",
        ].join("\n"),
      );
      mkdirSync(join(linked, "src"), { recursive: true });
      writeFileSync(join(linked, "src/change.ts"), "export const changed = true;\n");
      commitAll(linked, "checkpoint before invalid signing config");

      const finish = run("bash", ["scripts/contract-worktree.sh", "finish", "--merge"], linked, {
        REPO_HARNESS_GIT_BIN: fakeGit,
      });

      expect(finish.status).not.toBe(0);
      expect(finish.stderr).toContain("commit.gpgsign is configured but is not a valid boolean");
      expect(finish.stderr).not.toContain("commit-tree must not run");
      expect(run("git", ["rev-parse", "main"], primary).stdout.trim()).toBe(base);
    } finally {
      rmSync(container, { recursive: true, force: true });
    }
  }, 30_000);
});
