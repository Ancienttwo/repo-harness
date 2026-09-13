import { chmodSync } from "fs";
import { ROOT as scriptROOT } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run as scriptRun, tmpWorkspace } from "./helpers/repo-fixture";

import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const HELPER = join(ROOT, "assets", "templates", "helpers", "check-task-sync.sh");

function run(cwd: string, args: string[], env?: Record<string, string>) {
  const processEnv = { ...process.env };
  delete processEnv.REPO_HARNESS_DIFF_BASE;
  delete processEnv.REPO_HARNESS_DIFF_MODE;
  return spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf-8",
    env: { ...processEnv, PATH: `${join(cwd, ".git", "task-sync-bin")}:${processEnv.PATH}`, ...env },
  });
}

function reportedDigest(output: string): string {
  const match = output.match(/sha256:[0-9a-f]{64}/u);
  expect(match).not.toBeNull();
  return match![0];
}

function setupRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), "task-sync-"));
  mkdirSync(join(cwd, "src"), { recursive: true });
  mkdirSync(join(cwd, "tasks", "archive"), { recursive: true });
  mkdirSync(join(cwd, "docs", "researches"), { recursive: true });
  mkdirSync(join(cwd, "docs", "architecture"), { recursive: true });
  mkdirSync(join(cwd, "evals", "harness", "reports"), { recursive: true });
  mkdirSync(join(cwd, "scripts"), { recursive: true });

  copyFileSync(HELPER, join(cwd, "scripts", "check-task-sync.sh"));
  expect(run(cwd, ["chmod", "+x", "scripts/check-task-sync.sh"]).status).toBe(0);
  expect(run(cwd, ["git", "init"]).status).toBe(0);
  mkdirSync(join(cwd, ".git", "task-sync-bin"));
  writeFileSync(join(cwd, ".git", "task-sync-bin", "repo-harness"), "#!/bin/sh\nprintf 'standard\\n'\n", { mode: 0o755 });
  expect(run(cwd, ["git", "config", "user.email", "test@example.com"]).status).toBe(0);
  expect(run(cwd, ["git", "config", "user.name", "Test User"]).status).toBe(0);

  writeFileSync(join(cwd, "src", "app.ts"), "export const value = 1;\n");
  writeFileSync(join(cwd, "tasks", "todos.md"), "# Task Execution Checklist (Primary)\n");
  writeFileSync(join(cwd, "tasks", "lessons.md"), "# Lessons Learned (Self-Improvement Loop)\n");
  writeFileSync(join(cwd, "docs", "researches", "README.md"), "# Research Reports\n");
  writeFileSync(join(cwd, "docs", "architecture", ".projection-manifest.json"), "{}\n");
  writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.json"), "{}\n");
  writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.md"), "# Report\n");

  expect(run(cwd, ["git", "add", "."]).status).toBe(0);
  expect(run(cwd, ["git", "commit", "-m", "init"]).status).toBe(0);
  return cwd;
}

describe("check-task-sync helper", () => {
  test("a blocked resolver exposes exact evidence binding and the next run recovers without ignoring its exit code", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, ".git", "task-sync-bin", "repo-harness"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
      const failed = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain("resolution failed");
      const digest = reportedDigest(failed.stdout + failed.stderr);
      expect(failed.stderr).toContain("> **Substantive Change SHA256**: `" + digest + "`");
      mkdirSync(join(cwd, "tasks", "notes"), { recursive: true });
      writeFileSync(join(cwd, "tasks", "notes", "recovery.notes.md"), `# Recovery evidence\n> **Substantive Change SHA256**: \`${digest}\`\n`);
      const recovered = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(recovered.status).toBe(0);
      expect(recovered.stdout).toContain("Bound canonical workflow evidence");
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 3;\n");
      expect(run(cwd, ["bash", "scripts/check-task-sync.sh"]).status).toBe(1);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }, 30_000);

  test("admits a real lite template edit without creating workflow artifacts", () => {
    const cwd = setupRepo();
    try {
      const cli = join(cwd, ".git", "task-sync-bin", "repo-harness");
      rmSync(cli);
      symlinkSync(join(ROOT, "src", "cli", "index.ts"), cli);
      mkdirSync(join(cwd, "assets", "reference-configs"), { recursive: true });
      writeFileSync(join(cwd, "assets", "reference-configs", "rules.md"), "# Concise global rules\n");
      const resolved = run(cwd, ["repo-harness", "state", "resolve", "--json", "--field", "workflow_profile", "--target-path", "./assets/reference-configs/rules.md"]);
      expect(resolved.status).toBe(0);
      expect(resolved.stdout.trim()).toBe("lite");
      const before = run(cwd, ["git", "status", "--porcelain"]).stdout;
      const result = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Resolved lite profile");
      expect(run(cwd, ["git", "status", "--porcelain"]).stdout).toBe(before);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("includes base-range strict paths even when HEAD is clean", () => {
    const cwd = setupRepo();
    try {
      const cli = join(cwd, ".git", "task-sync-bin", "repo-harness");
      rmSync(cli);
      symlinkSync(join(ROOT, "src", "cli", "index.ts"), cli);
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      mkdirSync(join(cwd, "docs", "auth"), { recursive: true });
      writeFileSync(join(cwd, "docs", "auth", "runbook.md"), "# Auth boundary\n");
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      expect(run(cwd, ["git", "add", "."]).status).toBe(0);
      expect(run(cwd, ["git", "commit", "-m", "change"]).status).toBe(0);
      const result = run(cwd, ["bash", "scripts/check-task-sync.sh"], { REPO_HARNESS_DIFF_BASE: base });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Resolved strict profile");
      expect(result.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test.each([
    ["printf 'lite\\n'; exit 1", "resolution failed"],
    ["exit 0", "Invalid workflow profile"],
    ["printf 'unknown\\n'", "Invalid workflow profile"],
  ])("fails closed for an unusable resolver: %s", (body, diagnostic) => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, ".git", "task-sync-bin", "repo-harness"), `#!/bin/sh\n${body}\n`);
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      const result = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(diagnostic);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("validates waivers with no substantive paths under bash 3.2 set -u", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "tasks", "waivers"), { recursive: true });
      writeFileSync(
        join(cwd, "tasks", "waivers", "x.json"),
        JSON.stringify({
          protocol: 1,
          kind: "repo-harness-substantive-change-waiver",
          substantive_change_sha256: `sha256:${"a".repeat(64)}`,
          reason: "Fixture waiver for schema-only validation.",
          owner: "test-owner",
          scope: ["src/**"],
          revisit_trigger: "Remove when the fixture no longer exercises schema-only validation.",
        }),
      );

      const res = run(cwd, ["bash", "scripts/check-task-sync.sh", "--validate-waivers-only"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Machine-readable substantive-change waivers are valid.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("fails when working tree has code changes without task updates", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("fails when only an untracked source file is added", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "new-file.ts"), "export const created = true;\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("does not treat tasks/todos.md as diff-bound evidence", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "tasks", "todos.md"), "# Task Execution Checklist (Primary)\n- [x] updated\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("passes only when a canonical artifact binds the exact substantive digest", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "tasks", "contracts"), { recursive: true });
      writeFileSync(join(cwd, "src", "new-file.ts"), "export const created = true;\n");
      writeFileSync(join(cwd, "tasks", "contracts", "new-file.contract.md"), "# Task Contract\n");
      const unbound = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(unbound.status).toBe(1);
      const digest = reportedDigest(unbound.stdout);
      writeFileSync(
        join(cwd, "tasks", "contracts", "new-file.contract.md"),
        `# Task Contract\n\n> **Substantive Change SHA256**: \`${digest}\`\n`,
      );
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Bound canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("base mode accepts exact-digest evidence archived in the same publication", () => {
    const cwd = setupRepo();
    try {
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      const env = { REPO_HARNESS_DIFF_BASE: base };
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");

      const unbound = run(cwd, ["bash", "scripts/check-task-sync.sh"], env);
      expect(unbound.status).toBe(1);
      const digest = reportedDigest(unbound.stdout);
      writeFileSync(
        join(cwd, "tasks", "archive", "notes-20260905-task-sync.md"),
        `# Archived notes\n\n> **Substantive Change SHA256**: \`${digest}\`\n`,
      );
      expect(run(cwd, ["git", "add", "src/app.ts", "tasks/archive/notes-20260905-task-sync.md"]).status).toBe(0);
      expect(run(cwd, ["git", "commit", "-m", "publish-closed-workflow"]).status).toBe(0);

      const bound = run(cwd, ["bash", "scripts/check-task-sync.sh"], env);
      expect(bound.status).toBe(0);
      expect(bound.stdout).toContain("Bound canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("base mode rejects digest laundering through a pre-existing archive", () => {
    const cwd = setupRepo();
    try {
      const archive = join(cwd, "tasks", "archive", "notes-20260905-historical.md");
      writeFileSync(archive, "# Historical notes\n");
      expect(run(cwd, ["git", "add", "tasks/archive/notes-20260905-historical.md"]).status).toBe(0);
      expect(run(cwd, ["git", "commit", "-m", "historical-archive"]).status).toBe(0);
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      const env = { REPO_HARNESS_DIFF_BASE: base };
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");

      const unbound = run(cwd, ["bash", "scripts/check-task-sync.sh"], env);
      expect(unbound.status).toBe(1);
      const digest = reportedDigest(unbound.stdout);
      writeFileSync(archive, `# Historical notes\n\n> **Substantive Change SHA256**: \`${digest}\`\n`);

      const laundered = run(cwd, ["bash", "scripts/check-task-sync.sh"], env);
      expect(laundered.status).toBe(1);
      expect(laundered.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("binds multiple untracked substantive files as separate NUL-delimited records", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "tasks", "contracts"), { recursive: true });
      writeFileSync(join(cwd, "src", "new-a.ts"), "export const a = true;\n");
      writeFileSync(join(cwd, "src", "new-b.ts"), "export const b = true;\n");
      const contract = join(cwd, "tasks", "contracts", "multiple-untracked.contract.md");
      writeFileSync(contract, "# Task Contract\n");

      const unbound = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(unbound.status).toBe(1);
      expect(unbound.stderr).toBe("");
      const digest = reportedDigest(unbound.stdout);
      writeFileSync(contract, `# Task Contract\n\n> **Substantive Change SHA256**: \`${digest}\`\n`);

      const bound = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(bound.status).toBe(0);
      expect(bound.stdout).toContain("Bound canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("binds a newline-tab-backslash path without accepting a split pseudo-path", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "real"), "export const sentinel = true;\n");
      expect(run(cwd, ["git", "add", "src/real"]).status).toBe(0);
      expect(run(cwd, ["git", "commit", "-m", "pseudo-path-sentinel"]).status).toBe(0);
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      const baseEnv = { REPO_HARNESS_DIFF_BASE: base };
      const weirdPath = join("src", "real\npath\t\\tail.ts");
      const weirdFile = join(cwd, weirdPath);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      const evidence = join(cwd, "plans", "plan-weird-path.md");
      writeFileSync(weirdFile, "export const value = 1;\n");
      writeFileSync(evidence, "# Plan: weird path\n");

      const dirtyDefault = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      const dirtyBase = run(cwd, ["bash", "scripts/check-task-sync.sh"], baseEnv);
      expect(dirtyDefault.status).toBe(1);
      expect(dirtyBase.status).toBe(1);
      const digest = reportedDigest(dirtyDefault.stdout);
      expect(reportedDigest(dirtyBase.stdout)).toBe(digest);

      writeFileSync(evidence, `# Plan: weird path\n\n> **Substantive Change SHA256**: \`${digest}\`\n`);
      expect(run(cwd, ["bash", "scripts/check-task-sync.sh"]).status).toBe(0);
      expect(run(cwd, ["bash", "scripts/check-task-sync.sh"], baseEnv).status).toBe(0);

      writeFileSync(weirdFile, "export const value = 2;\n");
      const staleDefault = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      const staleBase = run(cwd, ["bash", "scripts/check-task-sync.sh"], baseEnv);
      expect(staleDefault.status).toBe(1);
      expect(staleBase.status).toBe(1);
      expect(reportedDigest(staleDefault.stdout)).not.toBe(digest);
      expect(reportedDigest(staleBase.stdout)).toBe(reportedDigest(staleDefault.stdout));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("does not treat tasks/lessons.md as diff-bound evidence", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "tasks", "lessons.md"), "# Lessons Learned (Self-Improvement Loop)\n- rule\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("passes when only research documentation changed", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "docs", "researches", "20260612-finding.md"), "# Finding\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("No substantive repo changes detected");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("does not treat research documentation as diff-bound evidence", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "docs", "researches", "20260612-finding.md"), "# Finding\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

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
  }, 30_000);

  test("ignores the automatic architecture projection manifest as workflow-owned output", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "docs", "architecture", ".projection-manifest.json"), '{"restamped":true}\n');
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("No substantive repo changes detected");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("does not broaden the architecture projection exclusion to sibling docs", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "docs", "architecture", "index.md"), "# Changed architecture\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("does not let regenerated harness evidence hide an unsynchronized source change", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "evals", "harness", "reports", "profile-comparison.json"), '{"authoritative":true}\n');
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("does not broaden the operational exclusion to sibling report files", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "evals", "harness", "reports", "other.json"), "{}\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Substantive diff lacks canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("fails when only legacy docs/PROGRESS.md changed", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs", "PROGRESS.md"), "# Project Milestones\n- [x] milestone\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("docs/PROGRESS.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("fails when code changes only update docs/PROGRESS.md", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "docs", "PROGRESS.md"), "# Project Milestones\n- [x] milestone\n");
      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("docs/PROGRESS.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("unions staged and working-tree changes", () => {
    const cwd = setupRepo();
    try {
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(join(cwd, "tasks", "todos.md"), "# Task Execution Checklist (Primary)\n- [x] staged\n");
      expect(run(cwd, ["git", "add", "tasks/todos.md"]).status).toBe(0);

      const res = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("src/app.ts");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("fails closed when one substantive path has staged and working-tree divergence", () => {
    const cwd = setupRepo();
    try {
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      const env = { REPO_HARNESS_DIFF_BASE: base };

      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      expect(run(cwd, ["git", "add", "src/app.ts"]).status).toBe(0);
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 1;\n");
      const first = run(cwd, ["bash", "scripts/check-task-sync.sh"], env);
      expect(first.status).toBe(1);
      expect(first.stderr).toContain("Cannot form stable diff identity");
      expect(first.stderr).toContain("src/app.ts");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("base mode changes identity when the resolved base changes despite identical final contents", () => {
    const cwd = setupRepo();
    try {
      const firstBase = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      expect(run(cwd, ["git", "add", "src/app.ts"]).status).toBe(0);
      expect(run(cwd, ["git", "commit", "-m", "second-base"]).status).toBe(0);
      const secondBase = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 3;\n");

      const fromFirstBase = run(cwd, ["bash", "scripts/check-task-sync.sh"], { REPO_HARNESS_DIFF_BASE: firstBase });
      const fromSecondBase = run(cwd, ["bash", "scripts/check-task-sync.sh"], { REPO_HARNESS_DIFF_BASE: secondBase });
      expect(fromFirstBase.status).toBe(1);
      expect(fromSecondBase.status).toBe(1);
      expect(reportedDigest(fromFirstBase.stdout)).not.toBe(reportedDigest(fromSecondBase.stdout));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("virtual-tree identity distinguishes deletion from a modified final file", () => {
    const cwd = setupRepo();
    try {
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      const env = { REPO_HARNESS_DIFF_BASE: base };

      rmSync(join(cwd, "src", "app.ts"));
      const deleted = run(cwd, ["bash", "scripts/check-task-sync.sh"], env);
      expect(deleted.status).toBe(1);

      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      const modified = run(cwd, ["bash", "scripts/check-task-sync.sh"], env);
      expect(modified.status).toBe(1);
      expect(reportedDigest(modified.stdout)).not.toBe(reportedDigest(deleted.stdout));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("keeps a committed deletion in a base-range virtual-tree identity", () => {
    const cwd = setupRepo();
    try {
      mkdirSync(join(cwd, "plans"), { recursive: true });
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      rmSync(join(cwd, "src", "app.ts"));
      expect(run(cwd, ["git", "add", "src/app.ts"]).status).toBe(0);
      expect(run(cwd, ["git", "commit", "-m", "delete-source"]).status).toBe(0);

      const unbound = run(cwd, ["bash", "scripts/check-task-sync.sh"], { REPO_HARNESS_DIFF_BASE: base });
      expect(unbound.status).toBe(1);
      expect(unbound.stderr).toBe("");
      const digest = reportedDigest(unbound.stdout);
      writeFileSync(
        join(cwd, "plans", "plan-delete.md"),
        `# Plan: delete\n\n> **Substantive Change SHA256**: \`${digest}\`\n`,
      );

      const bound = run(cwd, ["bash", "scripts/check-task-sync.sh"], { REPO_HARNESS_DIFF_BASE: base });
      expect(bound.status).toBe(0);
      expect(bound.stdout).toContain("Bound canonical workflow evidence");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("keeps the same identity from a dirty prepared state through a committed base range", () => {
    const cwd = setupRepo();
    try {
      const base = run(cwd, ["git", "rev-parse", "HEAD"]).stdout.trim();
      const direct = { REPO_HARNESS_DIFF_BASE: base };
      const mergeBase = { REPO_HARNESS_DIFF_BASE: base, REPO_HARNESS_DIFF_MODE: "merge-base" };
      mkdirSync(join(cwd, "plans"), { recursive: true });
      const evidence = join(cwd, "plans", "plan-change.md");
      writeFileSync(join(cwd, "src", "app.ts"), "export const value = 2;\n");
      writeFileSync(evidence, "# Plan: change\n");

      const dirtyDefault = run(cwd, ["bash", "scripts/check-task-sync.sh"]);
      const dirtyDirect = run(cwd, ["bash", "scripts/check-task-sync.sh"], direct);
      const dirtyMergeBase = run(cwd, ["bash", "scripts/check-task-sync.sh"], mergeBase);
      expect(dirtyDefault.status).toBe(1);
      expect(dirtyDirect.status).toBe(1);
      expect(dirtyMergeBase.status).toBe(1);
      const digest = reportedDigest(dirtyDefault.stdout);
      expect(reportedDigest(dirtyDirect.stdout)).toBe(digest);
      expect(reportedDigest(dirtyMergeBase.stdout)).toBe(digest);

      writeFileSync(evidence, `# Plan: change\n\n> **Substantive Change SHA256**: \`${digest}\`\n`);
      expect(run(cwd, ["bash", "scripts/check-task-sync.sh"]).status).toBe(0);

      expect(run(cwd, ["git", "add", "src/app.ts", "plans/plan-change.md"]).status).toBe(0);
      expect(run(cwd, ["git", "commit", "-m", "prepared-change"]).status).toBe(0);
      expect(run(cwd, ["bash", "scripts/check-task-sync.sh"], direct).status).toBe(0);
      expect(run(cwd, ["bash", "scripts/check-task-sync.sh"], mergeBase).status).toBe(0);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

describe("diff-bound task synchronization", () => {
  function taskSyncFixture(prefix: string): { cwd: string; base: string } {
    const cwd = tmpWorkspace(prefix);
    mkdirSync(join(cwd, "scripts"), { recursive: true });
    mkdirSync(join(cwd, "src"), { recursive: true });
    mkdirSync(join(cwd, "tasks"), { recursive: true });
    copyFileSync(join(scriptROOT, "scripts/check-task-sync.sh"), join(cwd, "scripts/check-task-sync.sh"));
    chmodSync(join(cwd, "scripts/check-task-sync.sh"), 0o755);
    writeFileSync(join(cwd, "src/app.ts"), "export const value = 1;\n");
    writeFileSync(join(cwd, "tasks/current.md"), "# Current Status Snapshot\n\nUnrelated existing state.\n");
    initGitRepo(cwd);
    commitAll(cwd, "seed");
    const profileBin = join(cwd, ".git", "task-sync-bin");
    mkdirSync(profileBin);
    writeFileSync(join(profileBin, "repo-harness"), "#!/bin/sh\nprintf 'standard\\n'\n", { mode: 0o755 });
    return { cwd, base: scriptRun("git", ["rev-parse", "HEAD"], cwd).stdout.trim() };
  }

  function taskSync(cwd: string, base: string, mode = "direct") {
    return scriptRun("bash", ["scripts/check-task-sync.sh"], cwd, {
      REPO_HARNESS_DIFF_BASE: base,
      REPO_HARNESS_DIFF_MODE: mode,
      PATH: `${join(cwd, ".git", "task-sync-bin")}:${process.env.PATH}`,
    });
  }

  function reportedDigest(output: string): string {
    const match = output.match(/sha256:[0-9a-f]{64}/);
    expect(match).not.toBeNull();
    return match![0]!;
  }

  test("a standard-profile push-parent diff requires an exact identity-bound canonical artifact", () => {
    const { cwd, base } = taskSyncFixture("helper-task-sync-bound-artifact");
    try {
      writeFileSync(join(cwd, "src/app.ts"), "export const value = 2;\n");
      // Touching the unrelated read model is deliberately insufficient.
      writeFileSync(join(cwd, "tasks/current.md"), "# Current Status Snapshot\n\nStill unrelated.\n");

      const missing = taskSync(cwd, base);
      expect(missing.status).toBe(1);
      expect(missing.stdout, missing.stderr).toContain("Substantive diff lacks canonical workflow evidence");
      expect(missing.stdout).toContain("src/app.ts");
      const digest = reportedDigest(missing.stdout);

      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/plan-change.md"),
        `# Plan: change\n\n> **Substantive Change SHA256**: \`${digest}\`\n`,
      );
      const admitted = taskSync(cwd, base);
      expect(admitted.status, `${admitted.stdout}\n${admitted.stderr}`).toBe(0);
      expect(admitted.stdout).toContain("Bound canonical workflow evidence: plans/plan-change.md");
      const pullRequest = taskSync(cwd, "main", "merge-base");
      expect(pullRequest.status, `${pullRequest.stdout}\n${pullRequest.stderr}`).toBe(0);

      writeFileSync(
        join(cwd, "plans/plan-change.md"),
        `# Plan: change\n\n> **Substantive Change SHA256**: \`sha256:${"0".repeat(64)}\`\n`,
      );
      expect(taskSync(cwd, base).status).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("a machine-readable waiver must bind the digest and cover every substantive path", () => {
    const { cwd, base } = taskSyncFixture("helper-task-sync-waiver");
    try {
      writeFileSync(join(cwd, "src/app.ts"), "export const value = 3;\n");
      const digest = reportedDigest(taskSync(cwd, base).stdout);
      mkdirSync(join(cwd, "tasks/waivers"), { recursive: true });
      const waiverPath = join(cwd, "tasks/waivers/hotfix.json");
      const waiver = {
        protocol: 1,
        kind: "repo-harness-substantive-change-waiver",
        substantive_change_sha256: digest,
        reason: "Production recovery cannot wait for the normal review artifact.",
        owner: "release-engineer",
        scope: ["tests/**"],
        expires_at: "2999-01-01T00:00:00.000Z",
      };
      writeFileSync(waiverPath, `${JSON.stringify(waiver, null, 2)}\n`);
      const uncovered = taskSync(cwd, base);
      expect(uncovered.status).toBe(1);
      expect(uncovered.stderr).toContain("does not cover: src/app.ts");

      waiver.scope = ["src/**"];
      writeFileSync(waiverPath, `${JSON.stringify(waiver, null, 2)}\n`);
      const admitted = taskSync(cwd, base);
      expect(admitted.status, `${admitted.stdout}\n${admitted.stderr}`).toBe(0);
      expect(admitted.stdout).toContain("Bound machine-readable waiver admitted");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("docs-only changes remain an explicit non-substantive exception", () => {
    const { cwd, base } = taskSyncFixture("helper-task-sync-docs-only");
    try {
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/guide.md"), "# Guide\n");
      const result = taskSync(cwd, base);
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain("No substantive repo changes detected");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
