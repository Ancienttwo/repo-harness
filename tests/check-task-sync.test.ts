import { describe, test, expect } from "bun:test";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const HELPER = join(ROOT, "assets", "templates", "helpers", "check-task-sync.sh");

function run(cwd: string, args: string[]) {
  return spawnSync(args[0], args.slice(1), { cwd, encoding: "utf-8" });
}

function setupRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "task-sync-"));
  mkdirSync(join(cwd, "src"), { recursive: true });
  mkdirSync(join(cwd, "tasks", "archive"), { recursive: true });
  mkdirSync(join(cwd, "docs", "researches"), { recursive: true });
  mkdirSync(join(cwd, "evals", "harness", "reports"), { recursive: true });
  mkdirSync(join(cwd, "scripts"), { recursive: true });

  copyFileSync(HELPER, join(cwd, "scripts", "check-task-sync.sh"));
  expect(run(cwd, ["chmod", "+x", "scripts/check-task-sync.sh"]).status).toBe(0);
  expect(run(cwd, ["git", "init"]).status).toBe(0);
  expect(run(cwd, ["git", "config", "user.email", "test@example.com"]).status).toBe(0);
  expect(run(cwd, ["git", "config", "user.name", "Test User"]).status).toBe(0);

  writeFileSync(join(cwd, "src", "app.ts"), "export const value = 1;\n");
  writeFileSync(join(cwd, "tasks", "todos.md"), "# Task Execution Checklist (Primary)\n");
  writeFileSync(join(cwd, "tasks", "lessons.md"), "# Lessons Learned (Self-Improvement Loop)\n");
  writeFileSync(join(cwd, "docs", "researches", "README.md"), "# Research Reports\n");
  writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.json"), "{}\n");
  writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.md"), "# Report\n");

  expect(run(cwd, ["git", "add", "."]).status).toBe(0);
  expect(run(cwd, ["git", "commit", "-m", "init"]).status).toBe(0);
  return cwd;
}

describe("check-task-sync helper", () => {
  test("fails when working tree has code changes without task updates", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("without tasks/ synchronization");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("fails when only an untracked source file is added", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "new-file.ts"), "export const created = true;\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("without tasks/ synchronization");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("passes when code changes include tasks/todos.md updates", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "tasks", "todos.md"), "# Task Execution Checklist (Primary)\n- [x] updated\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("passes when untracked repo changes include an untracked tasks file", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "tasks", "contracts"), { recursive: true });
      writeFileSync(join(cwd, "src", "new-file.ts"), "export const created = true;\n");
      writeFileSync(join(cwd, "tasks", "contracts", "new-file.contract.md"), "# Task Contract\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("synchronized tasks/ updates");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("passes when code changes include tasks/lessons.md updates", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "tasks", "lessons.md"), "# Lessons Learned (Self-Improvement Loop)\n- rule\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("passes when only tasks files changed", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "docs", "researches", "20260612-finding.md"), "# Finding\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Only task/research sync files changed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("passes when code changes include docs/researches updates", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "docs", "researches", "20260612-finding.md"), "# Finding\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("synchronized tasks/ updates");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("ignores regenerated harness benchmark evidence as operational output", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.json"), '{"authoritative":true}\n');
      writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.md"), "# Fresh Report\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("No substantive repo changes detected");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("does not let regenerated harness evidence hide an unsynchronized source change", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.json"), '{"authoritative":true}\n');
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("without tasks/ synchronization");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("does not broaden the operational exclusion to sibling report files", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "evals", "harness", "reports", "other.json"), "{}\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("without tasks/ synchronization");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("fails when only legacy docs/PROGRESS.md changed", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs", "PROGRESS.md"), "# Project Milestones\n- [x] milestone\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("fails when code changes only update docs/PROGRESS.md", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "docs", "PROGRESS.md"), "# Project Milestones\n- [x] milestone\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prefers staged changes over working tree changes", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "tasks", "todos.md"), "# Task Execution Checklist (Primary)\n- [x] staged\n");
      expect(run(cwd, ["git", "add", "tasks/todos.md"]).status).toBe(0);

      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Only task/research sync files changed.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
