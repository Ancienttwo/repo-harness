import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";
import { fixtureTaskId } from './helpers/sprint-fixture';

import { copyHelpers, HELPER_DIR } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("prepare-handoff helper integration", () => {
  test("prepare-handoff should write the harness handoff through the recovery materializer", () => {
    const cwd = tmpWorkspace("helper-prepare-handoff");
    try {
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      copyHelpers(cwd);

      writeFileSync(
        join(cwd, "plans/plan-20260327-2200-alpha.md"),
        [
          "# Plan: alpha",
          "",
          "> **Status**: Executing",
          "",
          "## Task Breakdown",
          "- [ ] Finish handoff",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/harness/active-plan"), "plans/plan-20260327-2200-alpha.md");
      writeFileSync(join(cwd, ".ai/harness/active-worktree"), `${realpathSync(cwd)}\n`);
      writeFileSync(
        join(cwd, "plans/sprints/20260327-alpha.sprint.md"),
        [
          "# Sprint: Alpha",
          "",
          "> **Status**: Executing",
          "> **Backlog Schema**: 2",
          "",
          "## Backlog",
          "",
          "| # | ID | Status | Task | Mode | Acceptance | Plan |",
          "|---:|----|:---:|---|---|---|---|",
          `| 1 | ${fixtureTaskId('Alpha handoff')} | [ ] | Alpha handoff | contract | handoff includes active artifacts | \`plans/plan-20260327-2200-alpha.md\` |`,
          "",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/harness/sprint/active-sprint"), "plans/sprints/20260327-alpha.sprint.md");
      writeFileSync(join(cwd, "tasks/contracts/alpha.contract.md"), "# Task Contract: alpha\n");
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n\n- [ ] Finish handoff\n");

      const status = run("bash", ["scripts/prepare-handoff.sh", "--status"], cwd);
      expect(status.status).toBe(0);
      expect(status.stdout).toContain("Active plan: plans/plan-20260327-2200-alpha.md");
      expect(status.stdout).toContain("Active contract: tasks/contracts/alpha.contract.md");

      const res = run("bash", ["scripts/prepare-handoff.sh", "--reason", "manual-checkpoint"], cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Updated .ai/harness/handoff/current.md");

      const handoff = readFileSync(join(cwd, ".ai/harness/handoff/current.md"), "utf-8");
      expect(handoff).toContain("**Reason**: manual-checkpoint");
      expect(handoff).toContain("Plan: plans/plan-20260327-2200-alpha.md");
      expect(handoff).toContain("Contract: tasks/contracts/alpha.contract.md");
      expect(handoff).not.toContain(".ai/harness/checks/latest.json");
      // The recovery materializer's "## Evidence" section
      // sources only from the checkpoint, rendering a typed minimal state when
      // none is published yet (this fixture seeds no ledger/checkpoint).
      expect(handoff).toContain("- Checkpoint: (none published yet -- no ledger evidence recorded in this worktree)");
      expect(handoff).toContain("## Active Artifacts");
      expect(handoff).toContain("Active sprint row:");
      expect(handoff).toContain("Alpha handoff");
      expect(handoff).toContain("Next recommended action:");
      expect(handoff).toContain("Finish handoff");
      expect(handoff).toContain("## Exact Next Step");
      expect(handoff).toContain("## Resume Prompt");
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("packaged prepare-handoff should resolve recovery materializer from its selected helper runtime", () => {
    const cwd = tmpWorkspace("helper-packaged-prepare-handoff");
    try {
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "tasks/todos.md"), "# Deferred Goals\n");
      initGitRepo(cwd);
      commitAll(cwd, "fixture");

      expect(existsSync(join(cwd, "scripts/recovery-view-cli.ts"))).toBe(false);
      const helperSource = join(HELPER_DIR, "prepare-handoff.sh");
      const res = run(
        "bash",
        [helperSource, "--reason", "package-runtime"],
        cwd,
        {
          REPO_HARNESS_TARGET_REPO_ROOT: cwd,
          REPO_HARNESS_HELPER_SOURCE_PATH: helperSource,
        }
      );

      expect(res.status).toBe(0);
      expect(res.stderr).toBe("");
      expect(readFileSync(join(cwd, ".ai/harness/handoff/current.md"), "utf-8")).toContain(
        "**Reason**: package-runtime"
      );
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("prepare-handoff should include untracked files in changed-file context", () => {
    const cwd = tmpWorkspace("helper-prepare-handoff-untracked");
    try {
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      copyHelpers(cwd);
      writeFileSync(join(cwd, "tasks/todos.md"), "# Task Execution Checklist (Primary)\n\n- [ ] Continue\n");

      initGitRepo(cwd);
      commitAll(cwd, "init");

      writeFileSync(join(cwd, "scripts/untracked-helper.ts"), "export {}\n");

      const res = run("bash", ["scripts/prepare-handoff.sh", "manual-checkpoint"], cwd);
      expect(res.status).toBe(0);

      const handoff = readFileSync(join(cwd, ".ai/harness/handoff/current.md"), "utf-8");
      expect(handoff).toContain("scripts/untracked-helper.ts");
      expect(handoff).toContain("untracked files");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});

test('prepare-handoff fails closed when its recovery materializer is missing', () => {
  const cwd = tmpWorkspace('helper-prepare-handoff-missing');
  try {
    mkdirSync(join(cwd, 'helper'), { recursive: true });
    copyFileSync(join(HELPER_DIR, 'prepare-handoff.sh'), join(cwd, 'helper/prepare-handoff.sh'));
    const result = run('bash', [join(cwd, 'helper/prepare-handoff.sh'), '--status'], cwd, {
      REPO_HARNESS_TARGET_REPO_ROOT: cwd,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('recovery materializer is missing');
    expect(result.stdout).not.toContain('Active plan: (none)');
    expect(existsSync(join(cwd, '.ai/harness/handoff/current.md'))).toBe(false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('prepare-handoff names the title contract of a transient plan and no plan of another worktree', () => {
  const cwd = tmpWorkspace('helper-prepare-handoff-transient');
  try {
    mkdirSync(join(cwd, 'plans'), { recursive: true });
    mkdirSync(join(cwd, 'tasks/contracts'), { recursive: true });
    copyHelpers(cwd);
    const plan = 'plans/plan-20260101-1200-think-plan-123.md';
    writeFileSync(join(cwd, plan), '# Plan: Real Title\n\n> **Status**: Executing\n');
    writeFileSync(join(cwd, 'tasks/contracts/20260101-1200-real-title.contract.md'), '# Task Contract: real title\n');
    writeFileSync(join(cwd, '.ai/harness/active-plan'), `${plan}\n`);

    const owned = run('bash', ['scripts/prepare-handoff.sh', '--status'], cwd);
    expect(owned.status, owned.stderr).toBe(0);
    expect(owned.stdout).toContain(`Active plan: ${plan}`);
    expect(owned.stdout).toContain('Active contract: tasks/contracts/20260101-1200-real-title.contract.md');

    writeFileSync(join(cwd, '.ai/harness/active-worktree'), `${join(cwd, 'other-worktree')}\n`);
    const foreign = run('bash', ['scripts/prepare-handoff.sh', '--status'], cwd);
    expect(foreign.status, foreign.stderr).toBe(0);
    expect(foreign.stdout).toContain('Active plan: (none)');
    expect(foreign.stdout).toContain('Active contract: (none)');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
