import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");

describe("create-project-dirs runtime smoke", () => {
  test("should scaffold 3.1 harness artifacts", () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-project-dirs-"));
    try {
      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
      });
      expect(res.status).toBe(0);

      expect(existsSync(join(cwd, "tasks/contracts"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/contract.template.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/spec.template.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/review.template.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/spa-day-protocol.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/handoff-protocol.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/harness-overview.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/hook-operations.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/evaluator-rubric.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/external-tooling.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/sprint-contracts.md"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/verify-contract.sh"))).toBe(true);
      expect(existsSync(join(cwd, "docs/spec.md"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/reviews"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/checks/latest.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/workflow-contract.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/events.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/failures/latest.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/handoff/current.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/runs/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/new-spec.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/new-sprint.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/prepare-handoff.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/summarize-failures.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/verify-sprint.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-agent-tooling.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-task-sync.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-context-files.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/ensure-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/maintenance-triage.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/context-budget.ts"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/prepare-codex-handoff.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/codex-handoff-resume.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/skill-factory-create.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/skill-factory-check.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/run-hook.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/finalize-handoff.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/session-start-context.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/lib/memory-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/memory-intake.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/run-hook.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/hooks/finalize-handoff.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/hooks/session-start-context.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/hooks/hook-input.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/memory-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/memory-intake.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/skill-factory/rubric.template.json"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/skill-factory/registry.json"))).toBe(false);

      const settings = readFileSync(join(cwd, ".claude/settings.json"), "utf-8");
      const settingsTemplate = readFileSync(join(ROOT, "assets/hooks/settings.template.json"), "utf-8");
      expect(settings).toBe(settingsTemplate);
      expect(settings).toContain("trace-event.sh");
      expect(settings).toContain("session-start-context.sh");
      expect(settings).toContain("finalize-handoff.sh");
      expect(settings).not.toContain("memory-intake.sh");
      expect(settings).not.toContain("skill-factory-session-end.sh");

      const progress = readFileSync(join(cwd, "docs/PROGRESS.md"), "utf-8");
      expect(progress).toContain("milestone checkpoints only");
      expect(progress).toContain("tasks/contracts/");
      expect(progress).toContain("tasks/reviews/");
      const workflowContract = JSON.parse(readFileSync(join(cwd, ".ai/harness/workflow-contract.json"), "utf-8"));
      expect(workflowContract.helpers.scripts).toContain("check-agent-tooling.sh");
      expect(workflowContract.helpers.scripts).toContain("check-task-workflow.sh");
      expect(workflowContract.helpers.scripts).toContain("context-budget.ts");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/external-tooling.md");
      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      expect(contextMap.root_context_files).not.toContain("tasks/research.md");
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({
        complex: "gstack",
        simple: "waza",
        knowledge: "gbrain",
      });
      expect(policy.external_tooling.hosts).toEqual(["claude-code", "codex"]);
      expect(policy.external_tooling.mode).toBe("guidance-only");
      expect(policy.external_tooling.gbrain.mcp).toBe("candidate-disabled");
      expect(policy.context_budget.zones).toEqual({ yellow: 0.55, orange: 0.7, red: 0.8 });
      expect(policy.handoff_resume.auto_start_new_session).toBe(false);
      expect(policy.sidecar_research.output_file).toBe("tasks/research.md");

      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      expect(pkg.scripts["check:context-files"]).toBe("bash scripts/check-context-files.sh");
      expect(pkg.scripts["check:task-sync"]).toBe("bash scripts/check-task-sync.sh");
      expect(pkg.scripts["check:task-workflow"]).toBe("bash scripts/check-task-workflow.sh --strict");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("should write discoverable nested AGENTS.md files for existing module directories", () => {
    const cwd = mkdtempSync(join(tmpdir(), "nested-agents-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      mkdirSync(join(cwd, "apps/web"), { recursive: true });
      mkdirSync(join(cwd, "packages/ui"), { recursive: true });
      mkdirSync(join(cwd, "services/api"), { recursive: true });

      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            `source '${libPath}'`,
            "PROJECT_INITIALIZER_PLAN_TYPE=K",
            'pi_ensure_harness_state_surface "$PWD" apply',
          ].join("\n"),
        ],
        { cwd, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, "apps/web/AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, "packages/ui/AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, "services/api/AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, "apps/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "packages/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/AGENTS.md"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("should not create monorepo roots for custom plans without modules", () => {
    const cwd = mkdtempSync(join(tmpdir(), "custom-layout-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            `source '${libPath}'`,
            "PROJECT_INITIALIZER_PLAN_TYPE=K",
            'pi_ensure_harness_state_surface "$PWD" apply',
          ].join("\n"),
        ],
        { cwd, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, "apps"))).toBe(false);
      expect(existsSync(join(cwd, "packages"))).toBe(false);
      expect(existsSync(join(cwd, "services"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
