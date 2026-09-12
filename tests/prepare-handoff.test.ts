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

import { copyHelpers, HELPER_DIR, ROOT } from "./helpers/helper-script-fixture";
import { commitAll, initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("prepare-handoff helper integration", () => {
  test("prepare-handoff should write harness handoff using workflow-state helpers", () => {
    const cwd = tmpWorkspace("helper-prepare-handoff");
    try {
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/sprint"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "plans/sprints"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      copyHelpers(cwd);

      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );

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
      expect(handoff).toContain("Checks: .ai/harness/checks/latest.json");
      // EPC-07: the old "Latest trace/checks file:" line re-derived evidence
      // directly from checks/latest.json content (a single-hop violation this
      // package fixes); the recovery materializer's "## Evidence" section now
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
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
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
          REPO_HARNESS_WORKFLOW_STATE_LIB: join(ROOT, "assets/hooks/lib/workflow-state.sh"),
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
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      copyHelpers(cwd);
      copyFileSync(
        join(ROOT, "assets/hooks/lib/workflow-state.sh"),
        join(cwd, ".ai/hooks/lib/workflow-state.sh")
      );
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
