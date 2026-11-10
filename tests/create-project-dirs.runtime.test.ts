import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";
import { defaultPolicy } from "../src/effects/adoption/standard-plan";
import { planAdoption } from "../src/effects/adoption/plan";
import { adoptionTemplateFile } from "../src/effects/adoption/manifest-templates";
import { parseExternalSourcesPolicy } from "../src/effects/github/policy";
import { ARCHCTX_REQUIRED_VERSION, readArchitectureProjectionPolicy } from "../src/core/architecture/projection";

const ROOT = join(import.meta.dir, "..");
const REFERENCE_STUB_MARKER = "<!-- repo-harness: reference-config-stub v1 -->";
const RUNTIME_SMOKE_TIMEOUT_MS = 15000;

function expectReferenceConfigStub(cwd: string, docId: string): void {
  const content = readFileSync(join(cwd, "docs/reference-configs", `${docId}.md`), "utf-8");
  expect(content).toContain(REFERENCE_STUB_MARKER);
  expect(content).toContain(`> **Doc ID**: ${docId}`);
  expect(content).toContain(`repo-harness docs path ${docId}`);
  expect(content).toContain(`repo-harness docs show ${docId}`);
}

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
      const deployReadme = readFileSync(join(cwd, "deploy/README.md"), "utf-8");
      expect(deployReadme).toContain("operations.deploy_sql");
      expect(deployReadme).toContain("direct children of `deploy/sql/`");
      expect(existsSync(join(cwd, "tasks/contracts"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/notes"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/todos.md"))).toBe(false);
      expect(readFileSync(join(cwd, "tasks/lessons.md"), "utf-8")).toBe(adoptionTemplateFile(cwd, "lessonsLog").content);
      expect(existsSync(join(cwd, ".claude/templates/contract.template.md"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/templates/spec.template.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/templates/implementation-notes.template.md"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/templates/review.template.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/spa-day-protocol.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/handoff-protocol.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/harness-overview.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/hook-operations.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/evaluator-rubric.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/agentic-development-flow.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/external-tooling.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/sprint-contracts.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/heartbeat-triage.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/document-generation.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/global-working-rules.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/minimal-change-hooks.md"))).toBe(true);
      expectReferenceConfigStub(cwd, "harness-overview");
      expectReferenceConfigStub(cwd, "agentic-development-flow");
      expectReferenceConfigStub(cwd, "external-tooling");
      expect(existsSync(join(cwd, "docs/brief.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/tech-stack.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/decisions.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/architecture/index.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/domains"))).toBe(false);
      expect(existsSync(join(cwd, "docs/architecture/modules/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/requests"))).toBe(false);
      expect(existsSync(join(cwd, "docs/architecture/snapshots"))).toBe(false);
      expect(existsSync(join(cwd, "docs/architecture/diagrams/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/api"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/verify-contract.sh"))).toBe(false);
      expect(existsSync(join(cwd, "docs/spec.md"))).toBe(true);
      expect(existsSync(join(cwd, "plans"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/reviews"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/workstreams"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/current.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/prds/prd.template.md"))).toBe(true);
      // repo-harness init (standard-plan.ts) is the only writer of root CLAUDE.md and AGENTS.md.
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
      const gitignore = readFileSync(join(cwd, ".gitignore"), "utf-8");
      expect(gitignore).not.toContain("tasks/.current.md.tmp.*");
      expect(gitignore).not.toContain("tasks/current.md");
      expect(gitignore).not.toContain(".claude/.plan-state/");
      expect(gitignore).toContain(".ai/harness/checks/*.latest.json");
      expect(gitignore).toContain(".ai/harness/checks/*.latest.md");
      expect(gitignore).toContain(".ai/harness/state/");
      expect(gitignore).toContain(".archcontext/");
      expect(gitignore).not.toContain(".ai/harness/chatgpt/bridge-extension/");
      expect(gitignore).toContain(".repo-harness/");
      expect(gitignore).not.toContain(".repo-harness/chatgpt-browser.local.json");
      expect(gitignore).not.toContain("# repo-harness generated helper wrappers");
      expect(gitignore).not.toContain("scripts/check-task-workflow.sh");
      expect(gitignore).not.toContain("scripts/prepare-codex-handoff.sh");
      expect(gitignore).not.toContain("scripts/repo-harness/");
      expect(gitignore).not.toContain("tasks/notes");
      expect(gitignore).not.toContain("docs/researches");
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/context/capabilities.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/checks/latest.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/workflow-contract.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/brain-manifest.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/events.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/architecture"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/workstreams/events.jsonl"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/failures/latest.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/handoff"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/handoff/current.md"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/planning"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/runs/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/sprint-backlog.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/check-task-workflow.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/capability-resolver.ts"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/worktrees/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/triage/.gitkeep"))).toBe(true);
      for (const helper of [
        "new-spec.sh",
        "new-sprint.sh",
        "prepare-handoff.sh",
        "summarize-failures.sh",
        "verify-sprint.sh",
        "check-agent-tooling.sh",
        "check-task-sync.sh",
        "check-deploy-sql-order.sh",
        "check-architecture-sync.sh",
        "check-brain-manifest.sh",
        "sync-brain-docs.sh",
        "check-context-files.sh",
        "select-agent-context-blocks.sh",
        "capability-resolver.ts",
        "architecture-event.ts",
        "capability-config.ts",
        "architecture-queue.sh",
        "archive-architecture-request.sh",
        "workstream-sync.sh",
        "ensure-task-workflow.sh",
        "check-task-workflow.sh",
        "maintenance-triage.sh",
        "heartbeat-triage.sh",
        "sprint-backlog.sh",
      ]) {
        expect(existsSync(join(cwd, ".ai/harness/scripts", helper))).toBe(false);
        expect(existsSync(join(cwd, "scripts", helper))).toBe(false);
      }

      expect(existsSync(join(cwd, "scripts/architecture-drift.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/architecture-drift.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/templates/sprint.template.md"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/templates/plan.template.md"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/context-budget.ts"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/prepare-codex-handoff.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/codex-handoff-resume.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/skill-factory-create.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/skill-factory-check.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/README.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".codex/hooks.json"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/settings.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/post-edit-guard.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/session-start-context.sh"))).toBe(false);
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

      expect(existsSync(join(cwd, ".ai/hooks/post-tool-observer.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/session-start-context.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/post-edit-guard.sh"))).toBe(false);
      for (const retired of [
        ".ai/hooks/anti-simplification.sh",
        ".ai/hooks/changelog-guard.sh",
        ".ai/hooks/codex-delegation-advisor.sh",
        ".ai/hooks/first-principles-guard.sh",
        ".ai/hooks/hook-input.sh",
        ".ai/hooks/post-bash.sh",
        ".ai/hooks/post-tool-observer.sh",
        ".ai/hooks/prompt-guard.sh",
        ".ai/hooks/run-hook.sh",
        ".ai/hooks/subagent-return-channel-guard.sh",
        ".ai/hooks/subagent-start-context.sh",
        ".ai/hooks/subagent-stop-quality.sh",
        ".ai/hooks/lib/minimal-change.sh",
        ".ai/hooks/lib/session-state.sh",
        "scripts/hook-shim.sh",
        "scripts/repo-harness.sh",
      ]) {
        expect(existsSync(join(cwd, retired))).toBe(false);
      }
      expect(readFileSync(join(cwd, ".ai/hooks/README.md"), "utf-8")).toContain("repo-harness-hook");

      const architectureIndex = readFileSync(join(cwd, "docs/architecture/index.md"), "utf-8");
      expect(architectureIndex).toContain("## Architecture Flow");
      expect(architectureIndex).not.toContain("Latest snapshot");
      expect(architectureIndex).not.toContain("ARCHITECTURE PENDING REQUESTS");

      expect(existsSync(join(cwd, "docs/PROGRESS.md"))).toBe(false);
      const workflowContract = JSON.parse(readFileSync(join(ROOT, "assets/workflow-contract.v1.json"), "utf-8"));
      expect(workflowContract.helpers.runtimeDirectory).toBe("package:scripts");
      expect(workflowContract.helpers.runtimeSource).toBe("package");
      expect(Object.hasOwn(workflowContract.helpers, "compatibilityDirectory")).toBe(false);
      expect(workflowContract.documentation.referenceConfigs.source).toBe("user-level-runtime-docs");
      expect(workflowContract.documentation.referenceConfigs.repoStubDirectory).toBe("docs/reference-configs");
      expect(workflowContract.documentation.referenceConfigs.resolverCommand).toBe("repo-harness docs path <doc-id>");
      expect(workflowContract.documentation.referenceConfigs.stubMarker).toBe(REFERENCE_STUB_MARKER);
      expect(workflowContract.helpers.scripts).toContain("check-agent-tooling.sh");
      expect(workflowContract.helpers.scripts).not.toContain("check-brain-manifest.sh");
      expect(workflowContract.helpers.scripts).not.toContain("sync-brain-docs.sh");
      expect(workflowContract.helpers.scripts).toContain("check-deploy-sql-order.sh");
      expect(workflowContract.helpers.scripts).not.toContain("check-architecture-sync.sh");
      expect(workflowContract.helpers.scripts).not.toContain("check-task-workflow.sh");
      expect(workflowContract.helpers.scripts).toContain("contract-worktree.sh");
      expect(workflowContract.helpers.scripts).toContain("ship-worktrees.sh");
      expect(workflowContract.helpers.scripts).not.toContain("refresh-current-status.sh");
      expect(workflowContract.helpers.scripts).toContain("select-agent-context-blocks.sh");
      expect(workflowContract.helpers.scripts).not.toContain("context-budget.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-resolver.ts");
      expect(workflowContract.helpers.scripts).not.toContain("architecture-event.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-config.ts");
      expect(workflowContract.helpers.scripts).not.toContain("architecture-queue.sh");
      expect(workflowContract.helpers.scripts).not.toContain("archive-architecture-request.sh");
      expect(workflowContract.helpers.scripts).not.toContain("context-contract-sync.sh");
      expect(workflowContract.helpers.scripts).not.toContain("workstream-sync.sh");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".claude/settings.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/handoff/current.md");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/planning/");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/architecture/events.jsonl");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/active-plan");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/triage/inbox.md");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/architecture/index.md");
      expect(workflowContract.artifacts.requiredFiles).not.toContain("tasks/current.md");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain("tasks/current.md");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("plans/prds");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("plans/sprints");
      expect(workflowContract.artifacts.requiredDirectories).toContain("docs/prds");
      expect(workflowContract.artifacts.requiredFiles).not.toContain("scripts/refresh-current-status.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain("scripts/capability-resolver.ts");
      expect(workflowContract.artifacts.requiredFiles).not.toContain("scripts/architecture-event.ts");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/external-tooling.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/heartbeat-triage.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/minimal-change-hooks.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("deploy/README.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("deploy/scripts");
      expect(workflowContract.artifacts.requiredDirectories).toContain("deploy/sql");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".claude/templates/implementation-notes.template.md");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("tasks/notes");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("tasks/workstreams");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/planning");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain(".ai/harness/scripts");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("scripts");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("docs/architecture/domains");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("docs/architecture/snapshots");
      expect(workflowContract.artifacts.requiredDirectories).toContain("docs/architecture/modules");
      expect(workflowContract.agenticDevelopment.routing.productDiscovery).toBe("parent-agent:geju");
      expect(workflowContract.agenticDevelopment.routing.complexEngineeringPlan).toBe("parent-agent:geju");
      expect(workflowContract.agenticDevelopment.routing.designPlan).toBe("parent-agent:geju");
      expect(workflowContract.agenticDevelopment.routing.smallOrMediumPlan).toBe("waza:think");
      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      expect(contextMap.root_context_files).not.toContain("docs/researches/");
      expect(contextMap.root_context_files).toContain(".ai/context/capabilities.json");
      expect(contextMap.functional_block_selector.script).toBe("repo-harness run select-agent-context-blocks");
      expect(contextMap.lsp_profiles.default).toBe("typescript-lsp");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).not.toContain("apps/*/AGENTS.md");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).not.toContain("tasks/workstreams/**/*.md");
      const tsDefaultPolicy = defaultPolicy("minimal-agentic", "en") as Record<string, any>;
      expect(tsDefaultPolicy.harness.helper_source).toBe("package");
      expect(tsDefaultPolicy.harness.helper_runtime_dir).toBe("package:scripts");
      expect(tsDefaultPolicy.harness.helper_compat_dir).toBeUndefined();
      expect(tsDefaultPolicy.external_tooling.routing).toEqual({
        simple: "waza",
      });
      expect(tsDefaultPolicy.external_tooling).not.toHaveProperty("gbrain");
      // archctx is an external optional CLI, never a runtime dependency: the entry
      // must stay advisory and identical across every seeder that emits it.
      const archctxEntry = {
        cli_package: "archctx",
        contracts_package: "archctx-contracts",
        contracts_scope: "release-gated-packed-schema-authority",
        install_mode: "release-gated-runtime-dependency-when-projection-enabled",
        readiness: "advisory",
        hook_policy: "do-not-block-hooks",
        vendoring_policy: "do-not-vendor",
        model_dir: ".archcontext/model",
        nodes_dir: ".archcontext/model/nodes",
        capability_source_key: ".ai/harness/policy.json#context.capability_source",
      };
      expect(
        JSON.parse(readFileSync(join(ROOT, ".ai/harness/policy.json"), "utf-8")).external_tooling.archctx
      ).toEqual(archctxEntry);
      expect(tsDefaultPolicy.external_tooling.fable_agents).toBeUndefined();
      expect(tsDefaultPolicy.tasks.contracts_dir).toBeUndefined();
      expect(tsDefaultPolicy.active_plan).toBeUndefined();
      expect(tsDefaultPolicy.sprints).toBeUndefined();
      expect(tsDefaultPolicy.tasks.current_status_file).toBeUndefined();
      expect(tsDefaultPolicy.tasks.workstreams_dir).toBeUndefined();
      expect(tsDefaultPolicy.workstreams).toBeUndefined();
      expect(tsDefaultPolicy.operations.dir).toBe("deploy");
      expect(tsDefaultPolicy.operations.private_dir).toBe("_ops");
      expect(tsDefaultPolicy.operations.deploy_sql).toBeUndefined();
      expect(tsDefaultPolicy.tasks.todo_file).toBeUndefined();
      expect(tsDefaultPolicy.agentic_development.routing).toEqual({
        product_discovery: "parent-agent:geju",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "parent-agent:geju",
        design_options_choice: "convention:design-options",
        small_or_medium_plan: "waza:think",
        bug_or_regression: "waza:hunt",
        post_implementation_review: "waza:check",
      });
      expect(tsDefaultPolicy.agentic_development.due_diligence.levels).toEqual([
        "P1_GLOBAL_ARCHITECTURE",
        "P2_DATA_FLOW_TRACE",
        "P3_DESIGN_DECISION",
      ]);
      expect(tsDefaultPolicy.agentic_development.due_diligence.explicit_report_required_for).toContain(
        "complex_engineering_plan",
      );
      expect(tsDefaultPolicy.context.capability_registry_file).toBe(".ai/context/capabilities.json");
      // A new policy uses the JSON capability registry by default.
      // ensure-task-workflow only prepares runtime directories; it does not seed policy.
      const repoPolicy = JSON.parse(readFileSync(join(ROOT, ".ai/harness/policy.json"), "utf-8"));
      expect(tsDefaultPolicy.context.capability_source).toBe("registry");
      // External source intake is disabled by absence in every policy
      // surface. A generated repository must never infer provider access from
      // a URL, CLI installation, or registry grant.
      expect(parseExternalSourcesPolicy(tsDefaultPolicy.external_sources).mode).toBe("off");
      expect(parseExternalSourcesPolicy(repoPolicy.external_sources).mode).toBe("off");
      // This repo cut its own authority over to archcontext nodes (Stage 2); the
      // seeded default above is what a newly generated repo gets, not what this repo
      // runs on. Both shapes share the one selector and the one rule string.
      expect(repoPolicy.context.capability_source).toBe("archcontext");
      expect(existsSync(join(ROOT, ".archcontext/model/nodes"))).toBe(true);
      expect(existsSync(join(ROOT, ".ai/context/capabilities.json"))).toBe(false);
      for (const seeded of [tsDefaultPolicy, repoPolicy]) {
        expect(seeded.context.capability_source_rule).toBe(tsDefaultPolicy.context.capability_source_rule);
        expect(seeded.context.capability_source_rule).toContain("no dual-read and no fallback");
      }
      // standard-plan.ts does not carry capability_config.
      expect(repoPolicy.context.capability_config).toBe("repo-harness run capability-config");
      expect(tsDefaultPolicy.documentation.profile).toBe("minimal-agentic");
      expect(tsDefaultPolicy.documentation.reference_source).toBe("user-level-runtime-docs");
      expect(tsDefaultPolicy.documentation.reference_stub_marker).toBe(REFERENCE_STUB_MARKER);
      expect(tsDefaultPolicy.documentation.reference_resolver).toBe("repo-harness docs path <doc-id>");
      expect(tsDefaultPolicy.architecture).toBeUndefined();
      expect(tsDefaultPolicy.harness.architecture_events_file).toBeUndefined();
      expect(tsDefaultPolicy.harness.workstream_events_file).toBeUndefined();
      expect(tsDefaultPolicy.worktree_strategy.worktree_dir_template).toBe('{{system_tmp}}/{{repo}}-wt-{{slug}}');
      expect(tsDefaultPolicy.context_budget).toBeUndefined();
      expect(tsDefaultPolicy.handoff_resume).toBeUndefined();
      expect(tsDefaultPolicy.upgrade.strategy_version).toBe(1);

      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      expect(pkg.scripts["check:context-files"]).toBe("repo-harness run check-context-files");
      expect(pkg.scripts["check:deploy-sql"]).toBe("repo-harness run check-deploy-sql-order");
      expect(pkg.scripts["check:architecture-sync"]).toBeUndefined();
      expect(pkg.scripts["check:task-sync"]).toBeUndefined();
      expect(pkg.scripts["check:task-workflow"]).toBeUndefined();
      expect(pkg.scripts["check:brain"]).toBe("repo-harness brain check");
      expect(pkg.scripts["sync:brain"]).toBe("repo-harness brain sync");
      expect(pkg.scripts["check:brain-manifest"]).toBeUndefined();
      expect(pkg.scripts["sync:brain-docs"]).toBeUndefined();
      expect(existsSync(join(cwd, "scripts/contract-worktree.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/ship-worktrees.sh"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

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
            "REPO_HARNESS_PLAN_TYPE=K",
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
      expect(contextMap.functional_block_selector.script).toBe("repo-harness run select-agent-context-blocks");
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
  }, RUNTIME_SMOKE_TIMEOUT_MS);

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
            "REPO_HARNESS_PLAN_TYPE=K",
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
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("should ignore external reference context files during capability discovery", () => {
    const cwd = mkdtempSync(join(tmpdir(), "ignored-reference-context-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      mkdirSync(join(cwd, "_ref/external-tool"), { recursive: true });
      mkdirSync(join(cwd, "_ops/scratch"), { recursive: true });
      mkdirSync(join(cwd, ".worktrees/codex/old"), { recursive: true });
      writeFileSync(join(cwd, "_ref/external-tool/AGENTS.md"), "# External Reference\n");
      writeFileSync(join(cwd, "_ops/scratch/CLAUDE.md"), "# Local Operations\n");
      writeFileSync(join(cwd, ".worktrees/codex/old/AGENTS.md"), "# Old Worktree\n");

      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            `source '${libPath}'`,
            "REPO_HARNESS_PLAN_TYPE=K",
            'pi_ensure_harness_state_surface "$PWD" apply',
          ].join("\n"),
        ],
        { cwd, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "_ref/external-tool/CLAUDE.md"))).toBe(false);
      const capabilities = JSON.parse(readFileSync(join(cwd, ".ai/context/capabilities.json"), "utf-8"));
      expect(capabilities.capabilities).toEqual([]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

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
            "REPO_HARNESS_PLAN_TYPE=K",
            'pi_ensure_harness_state_surface "$PWD" apply',
          ].join("\n"),
        ],
        { cwd, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "apps/web/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "apps/web/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "packages/ui/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/api/AGENTS.md"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("should ignore retired hook_source and use package operator libraries", () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-project-dirs-hook-pin-"));
    try {
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/policy.json"), '{ "hook_source": "repo" }\n');

      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/post-tool-observer.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/post-bash.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/projection.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/codex.hooks.template.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("should preserve existing repo-local hooks and host adapter config outside canonical adoption", () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-project-dirs-hook-prune-"));
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      mkdirSync(join(cwd, ".codex"), { recursive: true });
      const staleRuntime = "#!/bin/bash\necho user-modified-stale\n";
      const customHook = "#!/bin/bash\necho custom-owner\n";
      const claudeConfig = '{"hooks":{"UserPromptSubmit":[{"hooks":[{"type":"command","command":"custom-claude-hook"}]}]},"ownerField":true}\n';
      const codexConfig = '{"hooks":{"UserPromptSubmit":[{"command":"custom-codex-hook"}]},"ownerField":true}\n';
      writeFileSync(join(cwd, ".ai/hooks/run-hook.sh"), staleRuntime);
      writeFileSync(join(cwd, ".ai/hooks/prompt-guard.sh"), staleRuntime);
      writeFileSync(join(cwd, ".ai/hooks/custom-owner-hook.sh"), customHook);
      writeFileSync(join(cwd, ".ai/hooks/AGENTS.md"), "# Stale hook docs\n");
      writeFileSync(join(cwd, ".ai/hooks/settings.template.json"), "{}\n");
      writeFileSync(join(cwd, ".claude/settings.json"), claudeConfig);
      writeFileSync(join(cwd, ".codex/hooks.json"), codexConfig);

      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/hooks/README.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(false);
      expect(readFileSync(join(cwd, ".ai/hooks/run-hook.sh"), "utf-8")).toBe(staleRuntime);
      expect(readFileSync(join(cwd, ".ai/hooks/prompt-guard.sh"), "utf-8")).toBe(staleRuntime);
      expect(readFileSync(join(cwd, ".ai/hooks/custom-owner-hook.sh"), "utf-8")).toBe(customHook);
      expect(readFileSync(join(cwd, ".ai/hooks/AGENTS.md"), "utf-8")).toBe("# Stale hook docs\n");
      expect(readFileSync(join(cwd, ".ai/hooks/settings.template.json"), "utf-8")).toBe("{}\n");
      expect(readFileSync(join(cwd, ".claude/settings.json"), "utf-8")).toBe(claudeConfig);
      expect(readFileSync(join(cwd, ".codex/hooks.json"), "utf-8")).toBe(codexConfig);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

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
            "REPO_HARNESS_PLAN_TYPE=K",
            'pi_ensure_harness_state_surface "$PWD" apply',
          ].join("\n"),
        ],
        { cwd, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, "apps"))).toBe(false);
      expect(existsSync(join(cwd, "packages"))).toBe(false);
      expect(existsSync(join(cwd, "services"))).toBe(false);
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("should allow full documentation profile when explicitly requested", () => {
    const cwd = mkdtempSync(join(tmpdir(), "full-doc-profile-"));
    try {
      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
        env: {
          ...process.env,
          REPO_HARNESS_DOCUMENTATION_PROFILE: "full",
        },
      });
      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, "docs/brief.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/tech-stack.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/decisions.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/api"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/spa-day-protocol.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/reference-configs/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "docs/reference-configs/CLAUDE.md"))).toBe(false);
      expectReferenceConfigStub(cwd, "spa-day-protocol");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  /**
   * The archctx pin lives in the package (`ARCHCTX_REQUIRED_VERSION`). Repository
   * seeders must not author archctx execution or refactor settings, because no
   * runtime reader consumes them.
   */
  test("policy seeders author no repository archctx execution or refactor settings", () => {
    const seeders: Array<[string, Record<string, any>]> = [
      ["src/effects/adoption/standard-plan.ts", defaultPolicy("minimal-agentic", "en")],
      [".ai/harness/policy.json", JSON.parse(readFileSync(join(ROOT, ".ai/harness/policy.json"), "utf-8"))],
    ];

    for (const [source, seeded] of seeders) {
      expect([source, seeded.refactor]).toEqual([source, undefined]);
      for (const key of ['projection_provider', 'projection_apply', 'projection_version', 'projection_failure_gate', 'projection_timeout_ms']) {
        expect([source, seeded.architecture?.[key]]).toEqual([source, undefined]);
      }
      expect(readArchitectureProjectionPolicy({}).requiredVersion).toBe(ARCHCTX_REQUIRED_VERSION);
    }
  });

  test("a scaffold has no policy until repo-harness init writes every branch key from git", () => {
    const cwd = mkdtempSync(join(tmpdir(), "scaffold-then-init-"));
    try {
      expect(spawnSync("git", ["init", "-q", "-b", "master"], { cwd }).status).toBe(0);
      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], { cwd, encoding: "utf-8" });
      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(false);

      const operation = planAdoption({ repoRoot: cwd, mode: "standard" }).operations.find((entry) => entry.path === ".ai/harness/policy.json");
      if (!operation || operation.kind !== "writeFile") throw new Error("policy operation missing");
      expect(JSON.parse(operation.content).worktree_strategy).toMatchObject({ base_branch: "master", review_base: "master", merge_back: { target: "master" } });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("pi_maybe_install_agent_fleet prints an advisory tip and never touches HOME when install_mode is advisory", () => {
    const cwd = mkdtempSync(join(tmpdir(), "fleet-install-advisory-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");
    const installerPath = join(ROOT, "scripts/install-agent-fleet.sh");
    const home = join(cwd, "fakehome");
    const repoDir = join(cwd, "repo");
    try {
      mkdirSync(join(repoDir, ".ai", "harness"), { recursive: true });
      mkdirSync(home, { recursive: true });
      writeFileSync(
        join(repoDir, ".ai", "harness", "policy.json"),
        JSON.stringify({ external_tooling: { agent_fleet: { install_mode: "advisory" } } }, null, 2)
      );

      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            `source '${libPath}'`,
            `pi_maybe_install_agent_fleet '${repoDir}' apply '${installerPath}'`,
          ].join("\n"),
        ],
        { cwd, encoding: "utf-8", env: { ...process.env, HOME: home } }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("repo-harness run install-agent-fleet");
      expect(existsSync(join(home, ".claude", "agents"))).toBe(false);
      expect(existsSync(join(home, ".codex", "agents"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("pi_maybe_install_agent_fleet installs the managed agent fleet into HOME when install_mode is auto-install-on-init and mode is apply", () => {
    const cwd = mkdtempSync(join(tmpdir(), "fleet-install-auto-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");
    const installerPath = join(ROOT, "scripts/install-agent-fleet.sh");
    const home = join(cwd, "fakehome");
    const repoDir = join(cwd, "repo");
    const managedAgents = ["explorer", "deep-reasoner", "fast-worker", "gatekeeper", "root-cause-prover", "harness-evaluator"];
    try {
      mkdirSync(join(repoDir, ".ai", "harness"), { recursive: true });
      mkdirSync(home, { recursive: true });
      writeFileSync(
        join(repoDir, ".ai", "harness", "policy.json"),
        JSON.stringify(
          {
            external_tooling: {
              agent_fleet: {
                install_mode: "auto-install-on-init",
                managed_agents: managedAgents,
              },
            },
          },
          null,
          2
        )
      );
      const res = spawnSync(
        "bash",
        [
          "-lc",
          [
            `source '${libPath}'`,
            `pi_maybe_install_agent_fleet '${repoDir}' apply '${installerPath}'`,
          ].join("\n"),
        ],
        {
          cwd,
          encoding: "utf-8",
          env: { ...process.env, HOME: home },
        }
      );

      expect(res.status).toBe(0);
      for (const agent of managedAgents) {
        expect(existsSync(join(home, ".claude", "agents", `${agent}.md`))).toBe(true);
        expect(existsSync(join(home, ".codex", "agents", `${agent}.toml`))).toBe(true);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);
});
