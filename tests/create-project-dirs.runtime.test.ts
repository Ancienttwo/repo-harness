import { describe, test, expect } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

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
      expect(existsSync(join(cwd, "docs/architecture/domains/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/modules/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/requests/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/snapshots/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/diagrams/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "docs/api"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/verify-contract.sh"))).toBe(false);
      expect(existsSync(join(cwd, "docs/spec.md"))).toBe(true);
      expect(existsSync(join(cwd, "plans/prds"))).toBe(true);
      expect(existsSync(join(cwd, "plans/sprints"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/reviews"))).toBe(true);
      expect(existsSync(join(cwd, "tasks/workstreams/.gitkeep"))).toBe(true);
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
      expect(readFileSync(join(cwd, "CLAUDE.md"), "utf-8")).toBe(
        readFileSync(join(cwd, "AGENTS.md"), "utf-8")
      );
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Repo Agent Context");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Rule 0: You may spend as much time as needed thinking.");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("tasks/todos.md");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain(".ai/context/context-map.json");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("## Agent Context Scaffolding");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Treat scanners as leads, not authority");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Choose the smallest instruction stack that changes behavior");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("## Decision Protocol");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("complete P1/P2/P3 before design decisions or code edits");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("do not implement until the user approves");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("If the user says `implement this plan`");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("re-derives an authority's semantics");
      const gitignore = readFileSync(join(cwd, ".gitignore"), "utf-8");
      expect(gitignore).toContain("tasks/.current.md.tmp.*");
      expect(gitignore).toContain(".claude/.plan-state/");
      expect(gitignore).toContain(".ai/harness/checks/*.latest.json");
      expect(gitignore).toContain(".ai/harness/checks/*.latest.md");
      expect(gitignore).toContain(".ai/harness/state/");
      expect(gitignore).toContain(".archcontext/");
      expect(gitignore).not.toContain(".ai/harness/chatgpt/bridge-extension/");
      expect(gitignore).toContain(".repo-harness/chatgpt-browser.local.json");
      expect(gitignore).not.toContain("# repo-harness generated helper wrappers");
      expect(gitignore).not.toContain("scripts/check-task-workflow.sh");
      expect(gitignore).not.toContain("scripts/prepare-codex-handoff.sh");
      expect(gitignore).not.toContain("scripts/repo-harness/");
      expect(gitignore).not.toContain("tasks/notes");
      expect(gitignore).not.toContain("docs/researches");
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
        "context-contract-sync.sh",
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
      expect(existsSync(join(cwd, ".claude/templates/sprint.template.md"))).toBe(true);
      expect(existsSync(join(cwd, "scripts/context-budget.ts"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/prepare-codex-handoff.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/codex-handoff-resume.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/skill-factory-create.sh"))).toBe(false);
      expect(existsSync(join(cwd, "scripts/skill-factory-check.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/README.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(true);
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

      const architectureIndex = readFileSync(join(cwd, "docs/architecture/index.md"), "utf-8");
      expect(architectureIndex).toContain("<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->");
      expect(architectureIndex).toContain("- (none)");
      expect(architectureIndex).toContain("<!-- END ARCHITECTURE PENDING REQUESTS -->");

      expect(existsSync(join(cwd, "docs/PROGRESS.md"))).toBe(false);
      const workflowContract = JSON.parse(readFileSync(join(cwd, ".ai/harness/workflow-contract.json"), "utf-8"));
      expect(workflowContract.helpers.runtimeDirectory).toBe("package:assets/templates/helpers");
      expect(workflowContract.helpers.runtimeSource).toBe("package");
      expect(Object.hasOwn(workflowContract.helpers, "compatibilityDirectory")).toBe(false);
      expect(workflowContract.documentation.referenceConfigs.source).toBe("user-level-runtime-docs");
      expect(workflowContract.documentation.referenceConfigs.repoStubDirectory).toBe("docs/reference-configs");
      expect(workflowContract.documentation.referenceConfigs.resolverCommand).toBe("repo-harness docs path <doc-id>");
      expect(workflowContract.documentation.referenceConfigs.stubMarker).toBe(REFERENCE_STUB_MARKER);
      expect(workflowContract.helpers.scripts).toContain("check-agent-tooling.sh");
      expect(workflowContract.helpers.scripts).toContain("check-brain-manifest.sh");
      expect(workflowContract.helpers.scripts).toContain("sync-brain-docs.sh");
      expect(workflowContract.helpers.scripts).toContain("check-deploy-sql-order.sh");
      expect(workflowContract.helpers.scripts).toContain("check-architecture-sync.sh");
      expect(workflowContract.helpers.scripts).toContain("check-task-workflow.sh");
      expect(workflowContract.helpers.scripts).toContain("sprint-backlog.sh");
      expect(workflowContract.helpers.scripts).toContain("contract-worktree.sh");
      expect(workflowContract.helpers.scripts).toContain("ship-worktrees.sh");
      expect(workflowContract.helpers.scripts).toContain("refresh-current-status.sh");
      expect(workflowContract.helpers.scripts).toContain("select-agent-context-blocks.sh");
      expect(workflowContract.helpers.scripts).not.toContain("context-budget.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-resolver.ts");
      expect(workflowContract.helpers.scripts).toContain("architecture-event.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-config.ts");
      expect(workflowContract.helpers.scripts).toContain("architecture-queue.sh");
      expect(workflowContract.helpers.scripts).toContain("archive-architecture-request.sh");
      expect(workflowContract.helpers.scripts).toContain("context-contract-sync.sh");
      expect(workflowContract.helpers.scripts).toContain("workstream-sync.sh");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".claude/settings.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/context-budget/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/handoff/resume.md");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/planning/");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/architecture/events.jsonl");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-plan");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/triage/inbox.md");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/architecture/index.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("tasks/current.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("plans/prds");
      expect(workflowContract.artifacts.requiredDirectories).toContain("plans/sprints");
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
      expect(workflowContract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/notes");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/workstreams");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/planning");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain(".ai/harness/scripts");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain("scripts");
      expect(workflowContract.artifacts.requiredDirectories).toContain("docs/architecture/domains");
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
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("tasks/workstreams/**/*.md");
      expect(contextMap.discoverable_contexts.find((entry: { path: string }) => entry.path === "tasks/workstreams/**/*.md").purpose).toBe("capability-workstream");
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.harness.helper_source).toBe("package");
      expect(policy.harness.helper_runtime_dir).toBe("package:assets/templates/helpers");
      expect(policy.harness.helper_compat_dir).toBeUndefined();
      expect(policy.sprints.helper_script).toBe("repo-harness run sprint-backlog");
      expect(policy.external_tooling.routing).toEqual({
        simple: "waza",
        knowledge: "gbrain",
      });
      expect(policy.external_tooling.hosts).toEqual(["claude-code", "codex"]);
      expect(policy.external_tooling.mode).toBe("agent-readiness-required");
      expect(policy.external_tooling.readiness_gate).toBe("repo-harness run check-agent-tooling --host codex --strict-readiness");
      expect(policy.external_tooling.waza.primary_host).toBe("codex");
      expect(policy.external_tooling.waza.managed_skills).toEqual(["think", "hunt", "check", "health"]);
      expect(policy.external_tooling.waza.codex_primary_path).toBe("~/.codex/skills");
      expect(policy.external_tooling.hai_stack.source_repo).toBe("hylarucoder/hai-stack");
      expect(policy.external_tooling.hai_stack.source_url).toBe("https://github.com/hylarucoder/hai-stack.git");
      expect(policy.external_tooling.hai_stack.managed_skills).toEqual(["geju"]);
      expect(policy.external_tooling.hai_stack.primary_host).toBe("codex");
      expect(policy.external_tooling.hai_stack.codex_primary_path).toBe("~/.codex/skills");
      expect(policy.external_tooling.hai_stack.staging_cache_path).toBe("~/.agents/skills");
      expect(policy.external_tooling.hai_stack.sync_mode).toBe("stage-upstream-then-copy-to-codex");
      expect(policy.external_tooling.hai_stack.host_drift_policy).toBe("report-per-host-version-staging-and-upstream-drift");
      expect(policy.external_tooling.codex_automation_profile.required_skills).toEqual(["health", "check", "mermaid"]);
      expect(policy.external_tooling.codex_automation_profile.mode).toBe("codex-runtime-reference");
      expect(policy.external_tooling.codex_automation_profile.source).toBe("~/.codex/skills");
      expect(policy.external_tooling.codex_automation_profile.routes).toEqual({
        workflow_health: "waza:health",
        review_gate: "waza:check",
        architecture_diagram: "mermaid",
      });
      expect(policy.external_tooling.codex_automation_profile.vendoring_policy).toBe("do-not-vendor-skill-body");
      expect(policy.external_tooling.gbrain.mcp).toBe("candidate-disabled");
      expect(policy.external_tooling.codegraph.primary_host).toBe("both");
      expect(policy.external_tooling.codegraph.index_dir).toBe(".codegraph");
      expect(policy.external_tooling.codegraph.readiness).toBe("required-for-agent-code-navigation");
      expect(policy.external_tooling.codegraph.hook_policy).toBe("do-not-block-hooks");
      expect(policy.external_tooling.codegraph.vendoring_policy).toBe("do-not-add-package-dependency");
      expect(policy.external_tooling.agent_fleet.source).toBe("package:agents/fleet");
      expect(policy.external_tooling.agent_fleet.managed_agents).toEqual([
        "explorer",
        "deep-reasoner",
        "fast-worker",
        "gatekeeper",
        "root-cause-prover",
        "harness-evaluator",
      ]);
      expect(policy.external_tooling.agent_fleet.claude_target).toBe("~/.claude/agents");
      expect(policy.external_tooling.agent_fleet.codex_target).toBe("~/.codex/agents");
      expect(policy.external_tooling.agent_fleet.codex_generation).toBe("derive-toml-from-md");
      expect(policy.external_tooling.agent_fleet.install_mode).toBe("advisory");
      expect(policy.external_tooling.agent_fleet.conflict_policy).toBe("never-clobber-without-force");
      expect(policy.external_tooling.agent_fleet.install_command).toBe("repo-harness run install-agent-fleet");
      expect(policy.external_tooling.agent_fleet.source_policy).toBe("repo-owned-single-authority");
      expect(policy.external_tooling.fable_agents).toBeUndefined();
      expect(policy.minimal_change).toMatchObject({
        version: 1,
        mode: "advice",
        session_context: true,
        prompt_advice: true,
        post_edit_observer: false,
        stop_review: true,
        max_findings: 5,
        max_context_words: 180,
        new_dependency: "warn",
        new_file: "observe",
        new_abstraction: "warn",
        report_path: ".ai/harness/checks/minimal-change.latest.json",
        event_dedupe: true,
      });
      expect(policy.minimal_change.protected_concerns).toContain("security");
      expect(policy.minimal_change.protected_concerns).toContain("tests");
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
      expect(policy.information_lifecycle.external_knowledge.drift_check).toBe("repo-harness run check-brain-manifest");
      expect(policy.information_lifecycle.external_knowledge.sync_script).toBe("repo-harness run sync-brain-docs");
      expect(policy.agentic_development.routing).toEqual({
        product_discovery: "parent-agent:geju",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "parent-agent:geju",
        small_or_medium_plan: "waza:think",
        bug_or_regression: "waza:hunt",
        post_implementation_review: "waza:check",
      });
      expect(policy.agentic_development.due_diligence.levels).toEqual([
        "P1_GLOBAL_ARCHITECTURE",
        "P2_DATA_FLOW_TRACE",
        "P3_DESIGN_DECISION",
      ]);
      expect(policy.agentic_development.due_diligence.explicit_report_required_for).toContain(
        "complex_engineering_plan",
      );
      expect(policy.context.functional_block_selector.script).toBe("repo-harness run select-agent-context-blocks");
      expect(policy.context.capability_registry_file).toBe(".ai/context/capabilities.json");
      expect(policy.context.capability_resolver).toBe("repo-harness run capability-resolver");
      expect(policy.context.capability_config).toBe("repo-harness run capability-config");
      expect(policy.documentation.profile).toBe("minimal-agentic");
      expect(policy.documentation.reference_source).toBe("user-level-runtime-docs");
      expect(policy.documentation.reference_stub_marker).toBe(REFERENCE_STUB_MARKER);
      expect(policy.documentation.reference_resolver).toBe("repo-harness docs path <doc-id>");
      expect(policy.documentation.required).toContain("docs/architecture/index.md");
      expect(policy.architecture.diagram_skill).toBe("mermaid");
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
      expect(policy.worktree_strategy.start_script).toBe("repo-harness run contract-worktree start --plan <plan-file>");
      expect(policy.worktree_strategy.finish_script).toBe("repo-harness run contract-worktree finish");
      expect(policy.worktree_strategy.cleanup_script).toBe("repo-harness run contract-worktree cleanup --slug <slug>");
      expect(policy.worktree_strategy.validation_route).toBe("waza:check");
      expect(policy.context_budget).toBeUndefined();
      expect(policy.handoff_resume.auto_start_new_session).toBe(false);
      expect(policy.planning.pending_orchestration_file).toBe(".ai/harness/planning/pending.json");
      expect(policy.planning.source_of_truth).toContain("transient host planning bridge");
      expect(policy.sidecar_research.output_dir).toBe("docs/researches");
      expect(policy.sidecar_research.preferred_runners).toEqual([
        "subagent",
        "codex exec --json",
        "main-thread trace",
      ]);
      expect(policy.sidecar_research.spawn_decision).toContain("context impact");
      expect(policy.sidecar_research.spawn_decision).toContain("do not ask the user");
      expect(policy.sidecar_research.fallback_runner).toBe("main-thread trace");
      expect(policy.sidecar_research.main_thread_policy).toContain("if spawning is not worthwhile");
      expect(policy.delegation.preferred_runners).toEqual([
        "subagent",
        "codex-subagent",
        "codex-exec",
        "main-thread",
      ]);
      expect(policy.delegation.fallback_runner).toBe("main-thread");
      expect(policy.delegation.brief_source).toBe("tasks/contracts/<stem>.contract.md");
      expect(policy.delegation.runner_rule).toContain("codex-subagent (Codex's own native subagent)");
      expect(policy.delegation.runner_rule).toContain("MUST NOT silently succeed");
      expect(policy.documentation.reference_configs).toContain("global-working-rules.md");
      expect(policy.documentation.reference_configs).toContain("minimal-change-hooks.md");
      expect(policy.upgrade.strategy_version).toBe(1);
      expect(policy.upgrade.cleanup.remove_only_ownership).toBe("known_generated");

      const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
      expect(pkg.scripts["check:context-files"]).toBe("repo-harness run check-context-files");
      expect(pkg.scripts["check:deploy-sql"]).toBe("repo-harness run check-deploy-sql-order");
      expect(pkg.scripts["check:architecture-sync"]).toBe("repo-harness run check-architecture-sync");
      expect(pkg.scripts["check:task-sync"]).toBe("repo-harness run check-task-sync");
      expect(pkg.scripts["check:task-workflow"]).toBe("repo-harness run check-task-workflow --strict");
      expect(pkg.scripts["sync:brain-docs"]).toBe("repo-harness run sync-brain-docs --all");
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
            "REPO_HARNESS_PLAN_TYPE=K",
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
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
      expect(readFileSync(join(cwd, "CLAUDE.md"), "utf-8")).toBe(
        readFileSync(join(cwd, "AGENTS.md"), "utf-8")
      );
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Repo Agent Context");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Rule 0: You may spend as much time as needed thinking.");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("## Agent Context Scaffolding");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("Choose the smallest instruction stack that changes behavior");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("## Decision Protocol");
      expect(readFileSync(join(cwd, "AGENTS.md"), "utf-8")).toContain("do not implement until the user approves");
      expect(existsSync(join(cwd, "apps/web/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "apps/web/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "packages/ui/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "services/api/AGENTS.md"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("should scaffold full hook runtime when hook_source repo is pinned", () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-project-dirs-hook-pin-"));
    try {
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/policy.json"), '{ "hook_source": "repo" }\n');

      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/hooks/run-hook.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/post-edit-guard.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/post-tool-observer.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/session-start-context.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/projection.json"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/codex.hooks.template.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("should prune stale repo-local hook runtime when hook_source repo is not pinned", () => {
    const cwd = mkdtempSync(join(tmpdir(), "create-project-dirs-hook-prune-"));
    try {
      mkdirSync(join(cwd, ".ai/hooks/lib"), { recursive: true });
      writeFileSync(join(cwd, ".ai/hooks/run-hook.sh"), "#!/bin/bash\necho stale\n");
      writeFileSync(join(cwd, ".ai/hooks/prompt-guard.sh"), "#!/bin/bash\necho stale\n");
      writeFileSync(join(cwd, ".ai/hooks/AGENTS.md"), "# Stale hook docs\n");
      writeFileSync(join(cwd, ".ai/hooks/settings.template.json"), "{}\n");

      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(existsSync(join(cwd, ".ai/hooks/README.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/prompt-guard.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/hooks/settings.template.json"))).toBe(false);
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
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(true);
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/policy.json"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/context-budget/latest.json"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("project init directly replaces managed planning routes in an existing policy", () => {
    const cwd = mkdtempSync(join(tmpdir(), "stale-planning-policy-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify(
          {
            external_tooling: {
              routing: { complex: "gstack", simple: "waza", knowledge: "gbrain" },
            },
            agentic_development: {
              routing: {
                product_discovery: "gstack:office-hours",
                complex_engineering_plan: "gstack:plan-eng-review",
                design_plan: "gstack:plan-design-review",
              },
              due_diligence: {
                explicit_report_required_for: ["plan-eng-review", "shared_contract"],
              },
            },
          },
          null,
          2,
        ),
      );

      const res = spawnSync(
        "bash",
        ["-lc", [`source '${libPath}'`, 'pi_write_harness_policy "$PWD" apply'].join("\n")],
        { cwd, encoding: "utf-8" },
      );

      expect(res.status).toBe(0);
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({ simple: "waza", knowledge: "gbrain" });
      expect(policy.agentic_development.routing).toMatchObject({
        product_discovery: "parent-agent:geju",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "parent-agent:geju",
      });
      expect(policy.agentic_development.due_diligence.explicit_report_required_for).toEqual([
        "complex_engineering_plan",
        "shared_contract",
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("project init preserves mixed custom routes while cutting the declared legacy provider", () => {
    const cwd = mkdtempSync(join(tmpdir(), "custom-planning-policy-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");

    try {
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify(
          {
            external_tooling: {
              routing: { complex: "retired-provider", simple: "waza", knowledge: "gbrain" },
            },
            agentic_development: {
              routing: {
                product_discovery: "custom:product-discovery",
                complex_engineering_plan: "retired-provider:architecture-review",
                design_plan: "custom:design-review",
              },
              due_diligence: {
                explicit_report_required_for: ["architecture-review", "shared_contract", "database_migration"],
              },
            },
          },
          null,
          2,
        ),
      );

      const res = spawnSync(
        "bash",
        ["-lc", [`source '${libPath}'`, 'pi_write_harness_policy "$PWD" apply'].join("\n")],
        { cwd, encoding: "utf-8" },
      );

      expect(res.status).toBe(0);
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({ simple: "waza", knowledge: "gbrain" });
      expect(policy.agentic_development.routing).toMatchObject({
        product_discovery: "custom:product-discovery",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "custom:design-review",
      });
      expect(policy.agentic_development.due_diligence.explicit_report_required_for).toEqual([
        "complex_engineering_plan",
        "shared_contract",
        "database_migration",
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, RUNTIME_SMOKE_TIMEOUT_MS);

  test("Python-only policy merge matches the primary runtime migration", () => {
    const cwd = mkdtempSync(join(tmpdir(), "python-policy-merge-"));
    const libPath = join(ROOT, "scripts/lib/project-init-lib.sh");
    const fakeBin = join(cwd, "bin");
    const defaultsPath = join(cwd, "defaults.json");
    const currentPath = join(cwd, "current.json");
    const primaryOutput = join(cwd, "primary.json");
    const pythonOutput = join(cwd, "python.json");

    try {
      const python = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf-8" });
      expect(python.status).toBe(0);
      expect(python.stdout.trim()).not.toBe("");
      mkdirSync(fakeBin, { recursive: true });
      symlinkSync(python.stdout.trim(), join(fakeBin, "python3"));

      writeFileSync(
        defaultsPath,
        JSON.stringify({
          external_tooling: { routing: { simple: "waza", knowledge: "gbrain" } },
          agentic_development: {
            routing: {
              product_discovery: "parent-agent:geju",
              complex_engineering_plan: "parent-agent:geju",
              design_plan: "parent-agent:geju",
            },
            due_diligence: { explicit_report_required_for: ["complex_engineering_plan"] },
          },
        }),
      );
      writeFileSync(
        currentPath,
        JSON.stringify({
          external_tooling: {
            routing: { complex: "retired-provider", simple: "waza", knowledge: "gbrain" },
          },
          agentic_development: {
            routing: {
              product_discovery: "retired-provider:discovery-review",
              complex_engineering_plan: "retired-provider:architecture-review",
              design_plan: "custom:design-review",
            },
            due_diligence: {
              explicit_report_required_for: ["discovery-review", "architecture-review", "database_migration"],
            },
          },
        }),
      );

      const primary = spawnSync(
        "/bin/bash",
        ["--noprofile", "--norc", "-c", `source '${libPath}'\npi_merge_json_defaults '${defaultsPath}' '${currentPath}' '${primaryOutput}'`],
        { cwd, encoding: "utf-8" },
      );
      expect(primary.status).toBe(0);

      const pythonOnly = spawnSync(
        "/bin/bash",
        ["--noprofile", "--norc", "-c", `source '${libPath}'\npi_merge_json_defaults '${defaultsPath}' '${currentPath}' '${pythonOutput}'`],
        {
          cwd,
          encoding: "utf-8",
          env: { HOME: cwd, PATH: fakeBin },
        },
      );
      expect(pythonOnly.status).toBe(0);
      expect(readFileSync(pythonOutput, "utf-8")).toBe(readFileSync(primaryOutput, "utf-8"));

      const policy = JSON.parse(readFileSync(pythonOutput, "utf-8"));
      expect(policy.external_tooling.routing).toEqual({ simple: "waza", knowledge: "gbrain" });
      expect(policy.agentic_development.routing).toMatchObject({
        product_discovery: "parent-agent:geju",
        complex_engineering_plan: "parent-agent:geju",
        design_plan: "custom:design-review",
      });
      expect(policy.agentic_development.due_diligence.explicit_report_required_for).toEqual([
        "product_discovery",
        "complex_engineering_plan",
        "database_migration",
      ]);
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
      const policy = JSON.parse(readFileSync(join(cwd, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.documentation.profile).toBe("full");
      expect(policy.documentation.reference_source).toBe("user-level-runtime-docs");
      expect(policy.documentation.reference_configs).toContain("spa-day-protocol.md");
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
