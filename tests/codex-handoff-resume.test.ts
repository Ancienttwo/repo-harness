import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers } from "./helpers/helper-script-fixture";
import { run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("codex-handoff-resume helper integration", () => {
  test("codex-handoff-resume should write resume packet and print bootstrap prompt", () => {
    const cwd = tmpWorkspace("helper-codex-resume");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n\n## Exact Next Step\n- Continue.\n");
      writeFileSync(join(cwd, ".ai/harness/checks/latest.json"), "{}\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n");
      mkdirSync(join(cwd, "docs/researches"), { recursive: true });
      writeFileSync(join(cwd, "docs/researches/research.md"), "# Research\n");

      const res = run(
        "bash",
        ["scripts/codex-handoff-resume.sh", "--cwd", cwd, "--reason", "unit-test", "--print-prompt"],
        cwd,
        { CODEX_HOME: join(cwd, ".codex") }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("fresh Codex session");
      expect(res.stdout).toContain("Current prompt files first:");
      expect(res.stdout).toContain("# Files mentioned by the user");
      expect(res.stdout).toContain("pasted-text.txt");
      expect(res.stdout).toContain("Required first reads:");
      expect(res.stdout.indexOf("Current prompt files first:") < res.stdout.indexOf("Required first reads:")).toBe(true);
      const resume = readFileSync(join(cwd, ".ai/harness/handoff/resume.md"), "utf-8");
      expect(resume).toContain("**Reason**: unit-test");
      expect(resume).toContain(`**Working Directory**: ${cwd}`);
      expect(resume).toContain("generated-by: repo-harness codex-handoff-resume v1");
      expect(resume).toContain("Current prompt files first:");
      expect(resume.indexOf("Current prompt files first:") < resume.indexOf("Required first reads:")).toBe(true);
      expect(resume).not.toContain(".ai/harness/context-budget/latest.json");
      expect(resume).not.toContain("Context budget");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("codex-handoff-resume should not restore historical plans without an active marker", () => {
    const cwd = tmpWorkspace("helper-codex-resume-no-active-plan");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "plans/plan-20260602-0034-old-work.md"), "# Plan: Old Work\n");
      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n\nNo active plan.\n");
      writeFileSync(join(cwd, ".ai/harness/checks/latest.json"), "{}\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goal Ledger\n");
      mkdirSync(join(cwd, "docs/researches"), { recursive: true });
      writeFileSync(join(cwd, "docs/researches/research.md"), "# Research\n");

      const res = run(
        "bash",
        ["scripts/codex-handoff-resume.sh", "--cwd", cwd, "--reason", "no-active"],
        cwd,
        { CODEX_HOME: join(cwd, ".codex") }
      );

      expect(res.status).toBe(0);
      const resume = readFileSync(join(cwd, ".ai/harness/handoff/resume.md"), "utf-8");
      expect(resume).toContain("Active plan: (none)");
      expect(resume).toContain("Plan: (none)");
      expect(resume).not.toContain("plans/plan-20260602-0034-old-work.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("codex-handoff-resume should reject policy paths outside the repo", () => {
    const cwd = tmpWorkspace("helper-codex-resume-safe-path");
    const outsideName = `${cwd.split("/").pop()}-resume.md`;
    const outsidePath = join(cwd, "..", outsideName);
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ handoff_resume: { resume_packet_file: `../${outsideName}` } }, null, 2) + "\n"
      );

      const res = run("bash", ["scripts/codex-handoff-resume.sh", "--cwd", cwd, "--reason", "safe-path"], cwd);

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(true);
      expect(existsSync(outsidePath)).toBe(false);
    } finally {
      rmSync(outsidePath, { force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("codex-handoff-resume should reject policy paths outside the harness surface", () => {
    const cwd = tmpWorkspace("helper-codex-resume-harness-surface");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(cwd, ".git"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ handoff_resume: { resume_packet_file: ".git/config" } }, null, 2) + "\n"
      );

      const res = run("bash", ["scripts/codex-handoff-resume.sh", "--cwd", cwd, "--reason", "safe-surface"], cwd);

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(true);
      expect(existsSync(join(cwd, ".git/config"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
