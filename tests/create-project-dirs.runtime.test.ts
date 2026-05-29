import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
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
      expect(res.stdout).toContain("Host hook adapters are user-level:");

      expect(existsSync(join(cwd, "interfaces/types.ts"))).toBe(true);
      expect(existsSync(join(cwd, "contracts"))).toBe(false);
      expect(existsSync(join(cwd, "specs"))).toBe(false);
      expect(existsSync(join(cwd, ".ops"))).toBe(false);
      expect(existsSync(join(cwd, "deploy/README.md"))).toBe(true);
      expect(existsSync(join(cwd, "deploy/env/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "deploy/scripts/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "deploy/submissions/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "deploy/runbooks/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "deploy/release-checklists/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "deploy/sql/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/contracts"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/notes"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/contract.template.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/spec.template.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/review.template.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/implementation-notes.template.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/spa-day-protocol.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/handoff-protocol.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/harness-overview.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/hook-operations.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/evaluator-rubric.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/agentic-development-flow.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/external-tooling.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/sprint-contracts.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/document-generation.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/global-working-rules.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/brief.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/tech-stack.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/decisions.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/architecture/index.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/domains/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/modules/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/requests/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/snapshots/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/diagrams/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/api"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/verify-contract.sh"))).toBe(true);
      expect(existsSync(join(cwd, "docs/spec.md"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/reviews"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/workstreams/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
      expect(readFileSync(join(cwd, "CLAUDE.md"), "utf-8")).toBe(
        readFileSync(join(cwd, "AGENTS.md"), "utf-8")
      );
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Repo Agent Context");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("tasks/todo.md");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain(".ai/context/context-map.json");
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/context/capabilities.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/checks/latest.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/workflow-contract.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/brain-manifest.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/events.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/architecture/events.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/workstreams/events.jsonl"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/failures/latest.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/handoff/current.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/planning"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/runs/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/new-spec.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/new-sprint.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/prepare-handoff.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/summarize-failures.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/verify-sprint.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-agent-tooling.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-task-sync.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-deploy-sql-order.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-brain-manifest.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/sync-brain-docs.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-context-files.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/select-agent-context-blocks.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/capability-resolver.ts"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/architecture-event.ts"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/capability-config.ts"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/architecture-drift.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/archive-architecture-request.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/context-contract-sync.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/workstream-sync.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/ensure-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/maintenance-triage.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/context-budget.ts"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/prepare-codex-handoff.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/codex-handoff-resume.sh"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/skill-factory-create.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/skill-factory-check.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/run-hook.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".codex/hooks.json"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/settings.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/finalize-handoff.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/session-start-context.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/lib/memory-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/memory-intake.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/finalize-handoff.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/session-start-context.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/hook-input.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/memory-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/memory-intake.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/skill-factory/rubric.template.json"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/skill-factory/registry.json"))).toBe(false);

      expect(existsSync(join(cwd, ".ai/hooks/trace-event.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/session-start-context.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/finalize-handoff.sh"))).toBe(true);

      expect(existsSync(join(cwd, "docs/PROGRESS.md"))).toBe(false);
      const workflowContract = JSON.parse(readFileSync(join(cwd, ".ai/harness/workflow-contract.json"), "utf-8"));
      expect(workflowContract.helpers.scripts).toContain("check-agent-tooling.sh");
      expect(workflowContract.helpers.scripts).toContain("check-brain-manifest.sh");
      expect(workflowContract.helpers.scripts).toContain("sync-brain-docs.sh");
      expect(workflowContract.helpers.scripts).toContain("check-deploy-sql-order.sh");
      expect(workflowContract.helpers.scripts).toContain("check-task-workflow.sh");
      expect(workflowContract.helpers.scripts).toContain("contract-worktree.sh");
      expect(workflowContract.helpers.scripts).toContain("select-agent-context-blocks.sh");
      expect(workflowContract.helpers.scripts).toContain("context-budget.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-resolver.ts");
      expect(workflowContract.helpers.scripts).toContain("architecture-event.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-config.ts");
      expect(workflowContract.helpers.scripts).toContain("architecture-drift.sh");
      expect(workflowContract.helpers.scripts).toContain("archive-architecture-request.sh");
      expect(workflowContract.helpers.scripts).toContain("context-contract-sync.sh");
      expect(workflowContract.helpers.scripts).toContain("workstream-sync.sh");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".claude/settings.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/planning/");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/architecture/events.jsonl");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-plan");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/architecture/index.md");
      expect(workflowContract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/capability-resolver.ts");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/architecture-event.ts");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/external-tooling.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("deploy/README.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("deploy/scripts");
      expect(workflowContract.artifacts.requiredDirectories).toContain("deploy/sql");
      expect(workflowContract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/notes");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/workstreams");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/planning");
      expect(workflowContract.artifacts.requiredDirectories).toContain("docs/architecture/domains");
      expect(workflowContract.artifacts.requiredDirectories).toContain("docs/architecture/modules");
      expect(workflowContract.agenticDevelopment.routing.complexEngineeringPlan).toBe("gstack:plan-eng-review");
      expect(workflowContract.agenticDevelopment.routing.smallOrMediumPlan).toBe("waza:think");
      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      expect(contextMap.root_context_files).not.toContain("tasks/research.md");
      expect(contextMap.root_context_files).toContain(".ai/context/capabilities.json");
      expect(contextMap.functional_block_selector.script).toBe("scripts/select-agent-context-blocks.sh");
      expect(contextMap.lsp_profiles.default).toBe("typescript-lsp");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).not.toContain("apps/*/AGENTS.md");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("tasks/workstreams/**/*.md");
      expect(contextMap.discoverable_contexts.find((entry: { path: string }) => entry.path === "tasks/workstreams/**/*.md").purpose).toBe("capability-workstream");
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({
        complex: "gstack",
        simple: "waza",
        knowledge: "gbrain",
      });
      expect(policy.external_tooling.hosts).toEqual(["claude-code", "codex"]);
      expect(policy.external_tooling.mode).toBe("agent-readiness-required");
      expect(policy.external_tooling.readiness_gate).toBe("scripts/check-agent-tooling.sh --host codex --strict-readiness");
      expect(policy.external_tooling.waza.primary_host).toBe("codex");
      expect(policy.external_tooling.waza.managed_skills).toEqual(["check", "design", "health", "hunt", "learn", "read", "think", "write"]);
      expect(policy.external_tooling.waza.codex_primary_path).toBe("~/.codex/skills");
      expect(policy.external_tooling.codex_automation_profile.required_skills).toEqual(["health", "check", "diagram-design"]);
      expect(policy.external_tooling.codex_automation_profile.mode).toBe("codex-runtime-reference");
      expect(policy.external_tooling.codex_automation_profile.source).toBe("~/.codex/skills");
      expect(policy.external_tooling.codex_automation_profile.routes).toEqual({
        workflow_health: "waza:health",
        review_gate: "waza:check",
        architecture_diagram: "diagram-design",
      });
      expect(policy.external_tooling.codex_automation_profile.vendoring_policy).toBe("do-not-vendor-skill-body");
      expect(policy.external_tooling.gbrain.mcp).toBe("candidate-disabled");
      expect(policy.external_tooling.codegraph.primary_host).toBe("both");
      expect(policy.external_tooling.codegraph.index_dir).toBe(".codegraph");
      expect(policy.external_tooling.codegraph.readiness).toBe("required-for-agent-code-navigation");
      expect(policy.external_tooling.codegraph.hook_policy).toBe("do-not-block-hooks");
      expect(policy.external_tooling.codegraph.vendoring_policy).toBe("do-not-add-package-dependency");
      expect(policy.tasks.notes_dir).toBe("tasks/notes");
      expect(policy.tasks.workstreams_dir).toBe("tasks/workstreams");
      expect(policy.reference_material.dir).toBe("_ref");
      expect(policy.reference_material.commit_policy).toContain("never commit");
      expect(policy.reference_material.rule).toContain("occasional ignored external reference checkout cache");
      expect(policy.reference_material.rule).toContain("commit/tag and path");
      expect(policy.operations.dir).toBe("deploy");
      expect(policy.operations.private_dir).toBe("_ops");
      expect(policy.operations.tracked).toContain("deploy/scripts/");
      expect(policy.operations.tracked).toContain("deploy/sql/");
      expect(policy.operations.ignored).toContain("_ops/");
      expect(policy.information_lifecycle.notes.dir).toBe("tasks/notes");
      expect(policy.information_lifecycle.evidence.snapshots_dir).toBe(".ai/harness/runs");
      expect(policy.information_lifecycle.external_knowledge.manifest_file).toBe(".ai/harness/brain-manifest.json");
      expect(policy.information_lifecycle.external_knowledge.drift_check).toBe("scripts/check-brain-manifest.sh");
      expect(policy.information_lifecycle.external_knowledge.sync_script).toBe("scripts/sync-brain-docs.sh");
      expect(policy.agentic_development.routing).toEqual({
        product_discovery: "gstack:office-hours",
        complex_engineering_plan: "gstack:plan-eng-review",
        design_plan: "gstack:plan-design-review",
        small_or_medium_plan: "waza:think",
        bug_or_regression: "waza:hunt",
        post_implementation_review: "waza:check",
      });
      expect(policy.agentic_development.due_diligence.levels).toEqual([
        "P1_GLOBAL_ARCHITECTURE",
        "P2_DATA_FLOW_TRACE",
        "P3_DESIGN_DECISION",
      ]);
      expect(policy.context.functional_block_selector.script).toBe("scripts/select-agent-context-blocks.sh");
      expect(policy.context.capability_registry_file).toBe(".ai/context/capabilities.json");
      expect(policy.context.capability_resolver).toBe("scripts/capability-resolver.ts");
      expect(policy.context.capability_config).toBe("scripts/capability-config.ts");
      expect(policy.documentation.profile).toBe("minimal-agentic");
      expect(policy.documentation.required).toContain("docs/architecture/index.md");
      expect(policy.architecture.diagram_skill).toBe("diagram-design");
      expect(policy.architecture.vendoring_policy).toBe("do-not-vendor-diagram-skill-assets");
      expect(policy.external_tooling.diagram_design.sync_mode).toBe("external-installed-skill");
      expect(policy.harness.architecture_events_file).toBe(".ai/harness/architecture/events.jsonl");
      expect(policy.harness.workstream_events_file).toBeUndefined();
      expect(policy.workstreams.scope).toBe("capability");
      expect(policy.workstreams.projection).toBe("local-contract-active-pointer-and-current-slice");
      expect(policy.documentation.on_demand).toContain("docs/architecture.md");
      expect(policy.lsp_profiles.selection).toBe("functional-block-first");
      expect(policy.worktree_strategy.auto_on_conflict).toBe(true);
      expect(policy.worktree_strategy.auto_for_contract_tasks).toBe(true);
      expect(policy.worktree_strategy.start_script).toBe("scripts/contract-worktree.sh start --plan <plan-file>");
      expect(policy.worktree_strategy.finish_script).toBe("scripts/contract-worktree.sh finish");
      expect(policy.worktree_strategy.cleanup_script).toBe("scripts/contract-worktree.sh cleanup --slug <slug>");
      expect(policy.worktree_strategy.validation_route).toBe("waza:check");
      expect(policy.context_budget.zones).toEqual({ yellow: 0.55, orange: 0.7, red: 0.8 });
      expect(policy.handoff_resume.auto_start_new_session).toBe(false);
      expect(policy.planning.pending_orchestration_file).toBe(".ai/harness/planning/pending.json");
      expect(policy.planning.source_of_truth).toContain("transient host planning bridge");
      expect(policy.sidecar_research.output_file).toBe("tasks/research.md");
      expect(policy.sidecar_research.preferred_runners).toEqual([
        "subagent",
        "codex exec --json",
        "main-thread trace",
      ]);
      expect(policy.sidecar_research.spawn_decision).toContain("context impact");
      expect(policy.sidecar_research.spawn_decision).toContain("do not ask the user");
      expect(policy.sidecar_research.fallback_runner).toBe("main-thread trace");
      expect(policy.sidecar_research.main_thread_policy).toContain("if spawning is not worthwhile");
      expect(policy.documentation.reference_configs).toContain("global-working-rules.md");
      expect(policy.upgrade.strategy_version).toBe(1);
      expect(policy.upgrade.cleanup.remove_only_ownership).toBe("known_generated");

      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      expect(pkg.scripts["check:context-files"]).toBe("bash scripts/check-context-files.sh");
      expect(pkg.scripts["check:deploy-sql"]).toBe("bash scripts/check-deploy-sql-order.sh");
      expect(pkg.scripts["check:task-sync"]).toBe("bash scripts/check-task-sync.sh");
      expect(pkg.scripts["check:task-workflow"]).toBe("bash scripts/check-task-workflow.sh --strict");
      expect(pkg.scripts["sync:brain-docs"]).toBe("bash scripts/sync-brain-docs.sh --all");
      expect(existsSync(join(cwd, "scripts/contract-worktree.sh"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("should write paired CLAUDE.md and AGENTS.md files only for selected functional blocks", () => {
    const cwd = mkdtempSync(join(tmpdir(), "nested-agents-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      mkdirSync(join(cwd, "apps/web"), { recursive: true });
      mkdirSync(join(cwd, "apps/web/components"), { recursive: true });
      mkdirSync(join(cwd, "packages/ui"), { recursive: true });
      mkdirSync(join(cwd, "services/api"), { recursive: true });
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      writeFileSync(join(cwd, ".ai/context/agent-context-blocks.txt"), "apps/web\n");

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
      expect(existsSync(join(cwd, "apps/web/CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "apps/web/AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, "packages/ui/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "packages/ui/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/api/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/api/AGENTS.md"))).toBe(false);
      expect(readFileSync(join(cwd, "apps/web/CLAUDE.md"), "utf-8")).toBe(
        readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8")
      );
      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      const capabilities = JSON.parse(readFileSync(join(cwd, ".ai/context/capabilities.json"), "utf-8"));
      expect(capabilities.capabilities.map((entry: { id: string }) => entry.id)).toContain("apps-web");
      expect(contextMap.functional_block_selector.script).toBe("scripts/select-agent-context-blocks.sh");
      const webClaudeEntry = contextMap.discoverable_contexts.find((entry: { path: string }) => entry.path === "apps/web/CLAUDE.md");
      expect(webClaudeEntry.lsp_profile).toBe("typescript-lsp");
      expect(webClaudeEntry.doc_scope).toBe("capability-contract");
      expect(webClaudeEntry.capability_id).toBe("apps-web");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("apps/web/CLAUDE.md");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("apps/web/AGENTS.md");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).not.toContain("packages/ui/CLAUDE.md");
      expect(existsSync(join(cwd, "apps/web/components/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "apps/web/components/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "apps/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "apps/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "packages/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "packages/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/AGENTS.md"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("should mirror an existing single agent context file to the sibling format", () => {
    const cwd = mkdtempSync(join(tmpdir(), "paired-agent-context-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      mkdirSync(join(cwd, "apps/web"), { recursive: true });
      const existingAgents = "# Existing Web Contract\n\n- Keep this custom local rule.\n";
      writeFileSync(join(cwd, "apps/web/AGENTS.md"), existingAgents);

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
      expect(readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8")).toBe(existingAgents);
      expect(readFileSync(join(cwd, "apps/web/CLAUDE.md"), "utf-8")).toBe(existingAgents);
      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("apps/web/CLAUDE.md");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("apps/web/AGENTS.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("should ignore external reference context files during capability discovery", () => {
    const cwd = mkdtempSync(join(tmpdir(), "ignored-reference-context-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      mkdirSync(join(cwd, "_ref/gbrain"), { recursive: true });
      mkdirSync(join(cwd, "_ops/scratch"), { recursive: true });
      mkdirSync(join(cwd, ".worktrees/codex/old"), { recursive: true });
      writeFileSync(join(cwd, "_ref/gbrain/AGENTS.md"), "# External Reference\n");
      writeFileSync(join(cwd, "_ops/scratch/CLAUDE.md"), "# Local Operations\n");
      writeFileSync(join(cwd, ".worktrees/codex/old/AGENTS.md"), "# Old Worktree\n");

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
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, "_ref/gbrain/CLAUDE.md"))).toBe(false);
      const capabilities = JSON.parse(readFileSync(join(cwd, ".ai/context/capabilities.json"), "utf-8"));
      expect(capabilities.capabilities).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("should not infer agent context files from physical apps packages services layout", () => {
    const cwd = mkdtempSync(join(tmpdir(), "no-implicit-agent-context-"));
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
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
      expect(readFileSync(join(cwd, "CLAUDE.md"), "utf-8")).toBe(
        readFileSync(join(cwd, "AGENTS.md"), "utf-8")
      );
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Repo Agent Context");
      expect(existsSync(join(cwd, "apps/web/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "apps/web/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "packages/ui/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/api/AGENTS.md"))).toBe(false);
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
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("should allow full documentation profile when explicitly requested", () => {
    const cwd = mkdtempSync(join(tmpdir(), "full-doc-profile-"));
    try {
      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
        env: {
          ...process.env,
          PROJECT_INITIALIZER_DOCUMENTATION_PROFILE: "full",
        },
      });
      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, "docs/brief.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/tech-stack.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/decisions.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/api"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/spa-day-protocol.md"))).toBe(true);
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.documentation.profile).toBe("full");
      expect(policy.documentation.reference_configs).toContain("spa-day-protocol.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
