import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "fs";
import { join } from "path";

import { copyHelpers, evidenceContract, HELPER_DIR, installCanonicalContractTemplate, promotionGate, TEMPLATE_DIR, writeActivePlan, writeWorkflowRequiredSurface } from "./helpers/helper-script-fixture";
import { initGitRepo, run, tmpWorkspace } from "./helpers/repo-fixture";

setDefaultTimeout(30000);

describe("check-task-workflow helper integration", () => {
  test("check-task-workflow should fail strict mode for legacy todo content", () => {
    const cwd = tmpWorkspace("helper-check-workflow");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, ".claude/templates"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });

      copyFileSync(join(TEMPLATE_DIR, "plan.template.md"), join(cwd, ".claude/templates/plan.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "research.template.md"), join(cwd, ".claude/templates/research.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "contract.template.md"), join(cwd, ".claude/templates/contract.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "spec.template.md"), join(cwd, ".claude/templates/spec.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "review.template.md"), join(cwd, ".claude/templates/review.template.md"));

      writeFileSync(join(cwd, "tasks/todos.md"), "# Legacy Todo\n\n- [ ] old item\n");
      writeFileSync(join(cwd, "tasks/lessons.md"), "# Lessons\n");
      mkdirSync(join(cwd, "docs/researches"), { recursive: true });
      writeFileSync(join(cwd, "docs/researches/research.md"), "# Research\n");
      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Legacy tasks/todos.md detected");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should fail strict mode for legacy task artifact terminology in generation surfaces", () => {
    const cwd = tmpWorkspace("helper-check-workflow-legacy-terminology");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "terminology", "--title", "Terminology"], cwd)
          .status
      ).toBe(0);

      writeFileSync(
        join(cwd, ".claude/templates/plan.template.md"),
        [
          "# Plan: {{TITLE}}",
          "",
          "> **Status**: Draft",
          "> **Sprint Contract**: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`",
          "> **Sprint Review**: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`",
          "",
          "## Evidence Contract",
          "- State/progress path: fixture",
          "- Verification evidence: fixture",
          "- Evaluator rubric: fixture",
          "- Stop condition: fixture",
          "- Rollback surface: fixture",
        ].join("\n")
      );

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Legacy task artifact terminology in generation surface");
      expect(res.stdout).toContain("Use Task Contract / Task Review");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should fail strict mode when plan template lacks a promotion gate", () => {
    const cwd = tmpWorkspace("helper-check-workflow-promotion-template");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "promotion-template", "--title", "Promotion Template"], cwd)
          .status
      ).toBe(0);

      writeFileSync(
        join(cwd, ".claude/templates/plan.template.md"),
        [
          "# Plan: {{TITLE}}",
          "",
          "> **Status**: Draft",
          "> **Task Contract**: `tasks/contracts/{{ARTIFACT_STEM}}.contract.md`",
          "> **Task Review**: `tasks/reviews/{{ARTIFACT_STEM}}.review.md`",
          "",
          "## Evidence Contract",
          "- State/progress path: fixture",
          "- Verification evidence: fixture",
          "- Evaluator rubric: fixture",
          "- Stop condition: fixture",
          "- Rollback surface: fixture",
        ].join("\n")
      );

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Plan template is missing ## Promotion Gate");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should fail strict mode for legacy sprint directory", () => {
    const cwd = tmpWorkspace("helper-check-workflow-legacy-sprint-dir");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "sprint-dir", "--title", "Sprint Dir"], cwd)
          .status
      ).toBe(0);
      mkdirSync(join(cwd, "tasks/sprints"), { recursive: true });
      writeFileSync(join(cwd, "tasks/sprints/demo.sprint.md"), "# Sprint: Demo\n\n> **Status**: Draft\n");

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Legacy sprint directory detected");
      expect(res.stdout).toContain("migrate tasks/sprints/*.sprint.md into plans/sprints/*.sprint.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should fail strict mode when no-active handoff has a historical resume plan", () => {
    const cwd = tmpWorkspace("helper-check-workflow-handoff-resume");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "handoff-check", "--title", "Handoff Check"], cwd)
          .status
      ).toBe(0);

      rmSync(join(cwd, ".ai/harness/active-plan"), { force: true });
      rmSync(join(cwd, ".ai/harness/active-worktree"), { force: true });
      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n\nNo active plan.\n");
      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        "# Codex Resume Packet\n\n## Source Artifacts\n\n- Plan: plans/plan-20260602-0034-old-work.md\n"
      );

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("resume packet references a historical plan");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should fail strict mode when current snapshot is newer than resume packet", () => {
    const cwd = tmpWorkspace("helper-check-workflow-current-newer-than-resume");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "resume-freshness", "--title", "Resume Freshness"], cwd)
          .status
      ).toBe(0);
      writeWorkflowRequiredSurface(cwd);

      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n\n## Exact Next Step\n- Continue.\n");
      writeFileSync(join(cwd, ".ai/harness/handoff/resume.md"), "# Codex Resume Packet\n\n## Source Artifacts\n\n- Plan: (none)\n");
      writeFileSync(join(cwd, "tasks/current.md"), "# Current Status Snapshot\n");
      expect(run("touch", ["-t", "202601010000.00", join(cwd, ".ai/harness/handoff/current.md")], cwd).status).toBe(0);
      expect(run("touch", ["-t", "202601010000.00", join(cwd, ".ai/harness/handoff/resume.md")], cwd).status).toBe(0);
      expect(run("touch", ["-t", "202601010001.00", join(cwd, "tasks/current.md")], cwd).status).toBe(0);

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Resume packet is older than current status snapshot");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow strict tolerates an absent tasks/current.md and still validates it when present", () => {
    const cwd = tmpWorkspace("helper-check-workflow-current-absent");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      const initialized = run(
        "bash",
        ["scripts/ensure-task-workflow.sh", "--slug", "current-absent", "--title", "Current Absent"],
        cwd,
      );
      expect(initialized.status, `${initialized.stdout}\n${initialized.stderr}`).toBe(0);
      writeWorkflowRequiredSurface(cwd);

      // Present: strict passes and the read-model content checks still apply.
      expect(existsSync(join(cwd, "tasks/current.md"))).toBe(true);
      const present = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);
      expect(present.status).toBe(0);

      // Absent: an ignored local read model may legitimately be missing (fresh CI checkout).
      rmSync(join(cwd, "tasks/current.md"), { force: true });
      const absent = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);
      expect(absent.stdout).not.toContain("Missing required file: tasks/current.md");
      expect(absent.status).toBe(0);

      // Present but malformed: still reported, so presence is validated exactly as before.
      writeFileSync(join(cwd, "tasks/current.md"), "# Wrong Heading\n");
      const malformed = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);
      expect(malformed.status).toBe(1);
      expect(malformed.stdout).toContain("missing '# Current Status Snapshot' heading");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should not treat Todo Source Plan none as no active plan", () => {
    const cwd = tmpWorkspace("helper-check-workflow-todo-source-plan");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "handoff-check", "--title", "Handoff Check"], cwd)
          .status
      ).toBe(0);
      writeWorkflowRequiredSurface(cwd);

      writeFileSync(
        join(cwd, ".ai/harness/handoff/current.md"),
        "# Harness Handoff\n\n## Source Artifacts\n\n- Plan: plans/plan-20260602-0034-live-work.md\n- Todo Source Plan: (none)\n"
      );
      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        "# Codex Resume Packet\n\n## Source Artifacts\n\n- Plan: plans/plan-20260602-0034-live-work.md\n"
      );

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("resume packet references a historical plan");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow delegates missing-contract admission to canonical state", () => {
    const cwd = tmpWorkspace("helper-check-workflow-contract-admission");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "admission", "--title", "Admission"], cwd).status).toBe(0);
      writeWorkflowRequiredSurface(cwd);
      const plan = "plans/plan-20260905-1446-admission.md";
      writeFileSync(join(cwd, plan), `# Plan\n\n> **Status**: Approved\n\n${promotionGate()}\n\n${evidenceContract()}\n`);
      writeActivePlan(cwd, plan);
      const bin = join(cwd, "fixture-bin");
      mkdirSync(bin);
      const cli = join(bin, "repo-harness");
      writeFileSync(cli, '#!/bin/bash\n[[ "$*" == "state resolve --json --field workflow_profile" ]] || exit 9\n[[ "$FIXTURE_STATE" == standard ]] || exit 1\nprintf "standard\\n"\n');
      chmodSync(cli, 0o755);
      const env = { PATH: `${bin}:${process.env.PATH}` };
      const allowed = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd, { ...env, FIXTURE_STATE: "standard" });
      expect(allowed.status).toBe(0);
      const denied = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd, { ...env, FIXTURE_STATE: "blocked" });
      expect(denied.status).toBe(1);
      expect(denied.stdout).toContain("canonical state resolution did not admit");
      writeFileSync(cli, '#!/bin/bash\nexit 127\n');
      const unavailable = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd, env);
      expect(unavailable.status).toBe(1);
      expect(unavailable.stdout).toContain("canonical state resolution did not admit");
      writeFileSync(join(cwd, "tasks/contracts/20260905-1446-admission.contract.md"), "# Contract\n");
      const malformed = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd, env);
      expect(malformed.status).toBe(1);
      expect(malformed.stdout).toContain("missing a capability binding");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should fail strict mode when active plan is terminal", () => {
    const cwd = tmpWorkspace("helper-check-workflow-terminal-active");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "terminal-active", "--title", "Terminal Active"], cwd)
          .status
      ).toBe(0);
      writeWorkflowRequiredSurface(cwd);

      const activePlanName = readdirSync(join(cwd, "plans")).find((name) => name.endsWith("-terminal-active.md"));
      expect(activePlanName).toBeDefined();
      const activePlan = `plans/${activePlanName}`;
      writeActivePlan(cwd, activePlan);
      const activePlanPath = join(cwd, activePlan);
      writeFileSync(
        activePlanPath,
        readFileSync(activePlanPath, "utf-8").replace("> **Status**: Draft", "> **Status**: Completed")
      );

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Active plan has terminal status 'Completed'");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow projects terminal statuses from the policy lifecycle anchor", () => {
    const cwd = tmpWorkspace("helper-check-workflow-terminal-policy");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "terminal-policy", "--title", "Terminal Policy"], cwd)
          .status
      ).toBe(0);
      writeWorkflowRequiredSurface(cwd);

      const policyPath = join(cwd, ".ai/harness/policy.json");
      const policy = JSON.parse(readFileSync(policyPath, "utf8"));
      policy.active_plan.lifecycle.terminal_start = "Archived";
      writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);

      const activePlanName = readdirSync(join(cwd, "plans")).find((name) => name.endsWith("-terminal-policy.md"));
      expect(activePlanName).toBeDefined();
      const activePlan = `plans/${activePlanName}`;
      writeActivePlan(cwd, activePlan);
      const activePlanPath = join(cwd, activePlan);
      writeFileSync(
        activePlanPath,
        readFileSync(activePlanPath, "utf-8").replace("> **Status**: Draft", "> **Status**: Completed")
      );

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status, res.stdout + res.stderr).toBe(0);
      expect(res.stdout).not.toContain("Active plan has terminal status 'Completed'");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should fail strict mode when ignored runtime cache remains tracked", () => {
    const cwd = tmpWorkspace("helper-check-workflow-tracked-runtime-cache");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "tracked-runtime", "--title", "Tracked Runtime"], cwd)
          .status
      ).toBe(0);
      writeWorkflowRequiredSurface(cwd);
      writeFileSync(
        join(cwd, ".gitignore"),
        [
          ".ai/harness/checks/latest.json",
          ".ai/harness/checks/*.latest.json",
          ".ai/harness/checks/*.latest.md",
          ".ai/harness/handoff/current.md",
          ".ai/harness/security/*",
          "!.ai/harness/security/.gitkeep",
        ].join("\n") + "\n"
      );
      initGitRepo(cwd);

      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/security"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/checks/minimal-change.latest.json"), "{}\n");
      writeFileSync(join(cwd, ".ai/harness/checks/minimal-change.latest.md"), "# local\n");
      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n");
      writeFileSync(join(cwd, ".ai/harness/security/state.sha256"), "abc123\n");
      expect(
        run(
          "git",
          [
            "add",
            "-f",
            ".ai/harness/checks/minimal-change.latest.json",
            ".ai/harness/checks/minimal-change.latest.md",
            ".ai/harness/handoff/current.md",
            ".ai/harness/security/state.sha256",
          ],
          cwd
        ).status
      ).toBe(0);

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Runtime cache is ignored but still tracked: .ai/harness/checks/minimal-change.latest.json");
      expect(res.stdout).toContain("Runtime cache is ignored but still tracked: .ai/harness/checks/minimal-change.latest.md");
      expect(res.stdout).toContain("Runtime cache is ignored but still tracked: .ai/harness/handoff/current.md");
      expect(res.stdout).toContain("Runtime cache is ignored but still tracked: .ai/harness/security/state.sha256");
      expect(res.stdout).toContain("git rm --cached");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should materialize ignored runtime delegation dir", () => {
    const cwd = tmpWorkspace("helper-check-workflow-delegation-dir");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "delegation-dir", "--title", "Delegation Dir"], cwd)
          .status
      ).toBe(0);
      writeWorkflowRequiredSurface(cwd);
      expect(
        run(
          "touch",
          ["-t", "202601010000.00", "tasks/current.md", ".ai/harness/handoff/current.md"],
          cwd
        ).status
      ).toBe(0);
      expect(run("touch", ["-t", "202601010001.00", ".ai/harness/handoff/resume.md"], cwd).status).toBe(0);
      rmSync(join(cwd, ".ai/harness/delegation"), { recursive: true, force: true });
      expect(existsSync(join(cwd, ".ai/harness/delegation"))).toBe(false);

      const res = run("bash", ["scripts/check-task-workflow.sh", "--strict"], cwd);

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/delegation"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);

  test("check-task-workflow should accept packaged helpers without root helper scripts", () => {
    const cwd = tmpWorkspace("helper-check-workflow-package-helpers");
    try {
      copyHelpers(cwd);
      installCanonicalContractTemplate(cwd);
      expect(
        run("bash", ["scripts/ensure-task-workflow.sh", "--slug", "package-helpers", "--title", "Package Helpers"], cwd)
          .status
      ).toBe(0);
      const policyPath = join(cwd, ".ai/harness/policy.json");
      const policy = JSON.parse(readFileSync(policyPath, "utf-8"));
      policy.harness.helper_runtime_dir = "package:assets/templates/helpers";
      delete policy.harness.helper_compat_dir;
      policy.harness.helper_source = "package";
      writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
      writeWorkflowRequiredSurface(cwd);
      expect(
        run(
          "touch",
          ["-t", "202601010000.00", "tasks/current.md", ".ai/harness/handoff/current.md"],
          cwd
        ).status
      ).toBe(0);
      expect(run("touch", ["-t", "202601010001.00", ".ai/harness/handoff/resume.md"], cwd).status).toBe(0);

      rmSync(join(cwd, "scripts"), { recursive: true, force: true });
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      rmSync(join(cwd, ".ai/harness/scripts"), { recursive: true, force: true });

      const helperPath = join(HELPER_DIR, "check-task-workflow.sh");
      const res = run("bash", [helperPath, "--strict"], cwd, {
        REPO_HARNESS_HELPER_SOURCE_PATH: helperPath,
      });

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("Missing required file: scripts/check-task-workflow.sh");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 10000);

  test("check-task-workflow should fail strict mode when no JSON runtime is available", () => {
    const cwd = tmpWorkspace("helper-check-workflow-runtime");
    try {
      copyHelpers(cwd);
      mkdirSync(join(cwd, "plans/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/archive"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, ".claude/templates"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });
      mkdirSync(join(cwd, "docs/reference-configs"), { recursive: true });

      copyFileSync(join(TEMPLATE_DIR, "plan.template.md"), join(cwd, ".claude/templates/plan.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "research.template.md"), join(cwd, ".claude/templates/research.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "contract.template.md"), join(cwd, ".claude/templates/contract.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "spec.template.md"), join(cwd, ".claude/templates/spec.template.md"));
      copyFileSync(join(TEMPLATE_DIR, "review.template.md"), join(cwd, ".claude/templates/review.template.md"));

      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "tasks/todos.md"),
        "# Deferred Goal Ledger\n\n> **Status**: Backlog\n> **Updated**: test\n> **Scope**: Medium/long-term goals deferred from active plan execution\n\n## Deferred Goals\n\n| Goal | Why Deferred | Tradeoff | Revisit Trigger |\n|------|--------------|----------|-----------------|\n"
      );
      writeFileSync(join(cwd, "tasks/lessons.md"), "# Lessons\n");
      mkdirSync(join(cwd, "docs/researches"), { recursive: true });
      writeFileSync(join(cwd, "docs/researches/research.md"), "# Research\n");
      writeFileSync(join(cwd, ".ai/harness/checks/latest.json"), "{}\n");
      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n");

      const fakeBin = join(cwd, "fakebin");
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(fakeBin, "bash"), '#!/bin/bash\nexec /bin/bash "$@"\n');
      expect(run("chmod", ["+x", join(fakeBin, "bash")], cwd).status).toBe(0);

      const res = run("/bin/bash", ["scripts/check-task-workflow.sh", "--strict"], cwd, {
        PATH: fakeBin,
      });
      expect(res.status).toBe(1);
      expect(res.stdout).toContain("Missing node, bun, or python3");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
