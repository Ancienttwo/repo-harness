import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Bootstrap Script Contracts", () => {
  test("SKILL.md should stay within 500-line budget", () => {
    const skill = read("SKILL.md");
    expect(skill.split("\n").length).toBeLessThanOrEqual(500);
  });

  test("router should only advertise initialize, migrate, audit, and repair paths", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("1. **Initialize**");
    expect(skill).toContain("2. **Migrate**");
    expect(skill).toContain("3. **Audit**");
    expect(skill).toContain("4. **Repair**");
    expect(skill).not.toContain("5. **Skill Factory**");
    expect(skill).not.toContain("references/skill-factory-guide.md");
    expect(existsSync(join(ROOT, "references/skill-factory-guide.md"))).toBe(false);
  });

  test("Codex agent metadata should exist for user-level installation", () => {
    const metadata = read("agents/openai.yaml");
    expect(metadata).toContain("interface:");
    expect(metadata).toContain('display_name: "agentic-dev"');
    expect(metadata).toContain("short_description:");
    expect(metadata).toContain("default_prompt:");
  });

  test("repo root should include Claude and Codex routing docs", () => {
    expect(existsSync(join(ROOT, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(ROOT, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(ROOT, ".claude/settings.json"))).toBe(true);

    const claude = read("CLAUDE.md");
    const agents = read("AGENTS.md");

    expect(claude).toContain("tasks/todo.md");
    expect(claude).toContain(".ai/hooks/");
    expect(claude).toContain("agentic-development-flow.md");
    expect(claude).toContain("external-tooling.md");
    expect(claude).toContain("gstack");
    expect(agents).toContain("tasks/todo.md");
    expect(agents).toContain("check-task-workflow.sh --strict");
    expect(agents).toContain("check-agent-tooling.sh --host both --check-updates");
  });

  test("repo package should expose workflow verification scripts", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["check:brain-manifest"]).toBe("bash scripts/check-brain-manifest.sh");
    expect(pkg.scripts["check:task-sync"]).toBe("bash scripts/check-task-sync.sh");
    expect(pkg.scripts["check:deploy-sql"]).toBe("bash scripts/check-deploy-sql-order.sh");
    expect(pkg.scripts["check:task-workflow"]).toBe("bash scripts/check-task-workflow.sh --strict");
    expect(pkg.scripts["check:context-files"]).toBe("bash scripts/check-context-files.sh");
  });

  test("create-project-dirs should create tasks primary files", () => {
    const content = read("scripts/create-project-dirs.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    const contract = JSON.parse(read("assets/workflow-contract.v1.json"));

    expect(content).toContain("create_contract_directories");
    expect(content).toContain("cat > tasks/todo.md");
    expect(content).toContain("cat > tasks/lessons.md");
    expect(content).toContain("cat > tasks/research.md");
    expect(content).not.toContain("docs/TODO.md");
    expect(sharedLib).toContain("new-plan.sh");
    expect(sharedLib).toContain("plan-to-todo.sh");
    expect(sharedLib).toContain("contract-worktree.sh");
    expect(sharedLib).toContain("archive-workflow.sh");
    expect(sharedLib).toContain("verify-contract.sh");
    expect(sharedLib).toContain("summarize-failures.sh");
    expect(sharedLib).toContain("check:context-files");
    expect(sharedLib).toContain("check:deploy-sql");
    expect(sharedLib).toContain("check:brain-manifest");
    expect(sharedLib).toContain("spawn_decision");
    expect(sharedLib).toContain("fallback_runner");
    expect(sharedLib).toContain("if spawning is not worthwhile");
    expect(sharedLib).toContain("pi_print_external_tooling_report");
    expect(sharedLib).toContain("check-task-sync.sh");
    expect(content).toContain("mkdir -p .ai/context");
    expect(content).toContain(".ai/harness/policy.json");
    expect(content).toContain(".ai/context/context-map.json");
    expect(contract.helpers.scripts).toContain("maintenance-triage.sh");
    expect(contract.helpers.scripts).toContain("context-budget.ts");
    expect(contract.helpers.scripts).toContain("architecture-drift.sh");
    expect(contract.helpers.scripts).toContain("archive-architecture-request.sh");
    expect(contract.helpers.scripts).toContain("context-contract-sync.sh");
    expect(contract.helpers.scripts).toContain("workstream-sync.sh");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.externalTooling.codexAutomationProfile.requiredSkills).toEqual(["health", "check", "diagram-design"]);
    expect(contract.externalTooling.codexAutomationProfile.vendoringPolicy).toBe("do-not-vendor-skill-body");
    expect(contract.externalTooling.diagramDesign.vendoringPolicy).toBe("do-not-vendor");
    expect(contract.helpers.scripts).toContain("prepare-codex-handoff.sh");
    expect(contract.helpers.scripts).toContain("codex-handoff-resume.sh");
    expect(contract.helpers.scripts).toContain("check-agent-tooling.sh");
    expect(contract.helpers.scripts).toContain("check-brain-manifest.sh");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(sharedLib).toContain("ensure-task-workflow.sh");
    expect(sharedLib).toContain("check-task-workflow.sh");
    expect(sharedLib).not.toContain("skill-factory-create.sh");
    expect(sharedLib).not.toContain("skill-factory-check.sh");
    expect(sharedLib).toContain("pi_install_workflow_contract");
    expect(sharedLib).toContain("check:task-sync");
    expect(sharedLib).toContain("check:task-workflow");
    expect(sharedLib).toContain("contract.template.md");
    expect(sharedLib).toContain("implementation-notes.template.md");
    expect(content).toContain("pi_install_reference_configs");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
    expect(contract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
    expect(content).toContain("install_workflow_contract");
    expect(content).toContain('cp "$ASSETS_HOOKS_DIR/settings.template.json" .claude/settings.json');
    expect(content).toContain("mkdir -p .ai/hooks");
    expect(content).toContain("settings.template.json");
    expect(contract.helpers.scripts).toContain("switch-plan.sh");
    expect(contract.helpers.scripts).toContain("capability-resolver.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/contract-worktree.sh");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/workflow-contract.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/brain-manifest.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/context-budget/latest.json");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/architecture/index.md");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/architecture/events.jsonl");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/external-tooling.md");
    expect(contract.migrations.upgrade.strategyVersion).toBe(1);
    expect(contract.migrations.upgrade.safety.removeOnlyOwnership).toBe("known_generated");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/workstreams");
    expect(contract.agenticDevelopment.routing.productDiscovery).toBe("gstack:office-hours");
    expect(sharedLib).not.toContain(".skill-factory-state.json");
    expect(sharedLib).not.toContain(".memory-context.json");
    expect(sharedLib).not.toContain(".memory-snapshot.json");
    expect(content).not.toContain("install_skill_factory_files");
    expect(content).toContain("create_contract_directories");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/contracts");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/reviews");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(content).toContain("**Source Plan**: (none)");
    expect(content).not.toContain("PROJECT_SETTINGS_EOF");
    expect(content).not.toContain("\"$TOOL_INPUT\"");
    expect(content).not.toContain("\"$PROMPT\"");
  });

  test("init-project should scaffold tasks primary workflow", () => {
    const content = read("scripts/init-project.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    const contract = JSON.parse(read("assets/workflow-contract.v1.json"));

    expect(content).toContain("create_contract_directories");
    expect(content).toContain("cat > tasks/todo.md");
    expect(content).toContain("cat > tasks/lessons.md");
    expect(content).toContain("tasks/research.md");
    expect(content).not.toContain("docs/TODO.md");
    expect(content).toContain("pi_install_helpers");
    expect(content).toContain("pi_install_templates");
    expect(content).toContain("install_workflow_contract");
    expect(sharedLib).toContain("contract.template.md");
    expect(sharedLib).toContain("implementation-notes.template.md");
    expect(sharedLib).toContain("verify-contract.sh");
    expect(sharedLib).toContain("summarize-failures.sh");
    expect(sharedLib).toContain("check:context-files");
    expect(sharedLib).toContain("check:deploy-sql");
    expect(sharedLib).toContain("pi_print_external_tooling_report");
    expect(sharedLib).toContain("check-task-sync.sh");
    expect(sharedLib).toContain("ensure-task-workflow.sh");
    expect(sharedLib).toContain("check-task-workflow.sh");
    expect(content).toContain(".ai/context");
    expect(content).toContain(".ai/harness/policy.json");
    expect(content).toContain(".ai/context/context-map.json");
    expect(contract.helpers.scripts).toContain("maintenance-triage.sh");
    expect(contract.helpers.scripts).toContain("context-budget.ts");
    expect(contract.helpers.scripts).toContain("prepare-codex-handoff.sh");
    expect(contract.helpers.scripts).toContain("codex-handoff-resume.sh");
    expect(contract.helpers.scripts).toContain("check-agent-tooling.sh");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(contract.helpers.scripts).toContain("workstream-sync.sh");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(contract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/workstreams");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
    expect(contract.agenticDevelopment.routing.postImplementationReview).toBe("waza:check");
    expect(contract.externalTooling.codexAutomationProfile.routes.architectureDiagram).toBe("diagram-design");
    expect(content).not.toContain("pi_install_skill_factory");
    expect(sharedLib).not.toContain("skill-factory-create.sh");
    expect(sharedLib).not.toContain("skill-factory-check.sh");
    expect(sharedLib).toContain("pi_workflow_contract_query_lines");
    expect(sharedLib).toContain("check:task-sync");
    expect(sharedLib).toContain("check:task-workflow");
    expect(content).toContain("pi_install_reference_configs");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
    expect(content).toContain('cp "$ASSETS_HOOKS_DIR/settings.template.json" .claude/settings.json');
    expect(content).toContain("settings.template.json");
    expect(content).toContain("mkdir -p .ai/hooks");
    expect(sharedLib).not.toContain(".skill-factory-state.json");
    expect(sharedLib).not.toContain(".memory-context.json");
    expect(sharedLib).not.toContain(".memory-snapshot.json");
    expect(content).toContain("create_contract_directories");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/contracts");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/reviews");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(content).toContain("**Source Plan**: (none)");
    expect(content).not.toContain(".*/");
    expect(content).toContain("ensure_runtime_gitignore_block");
    expect(content).toContain("install_hook_settings_template");
    expect(content).not.toContain("\"$TOOL_INPUT\"");
    expect(content).not.toContain("\"$PROMPT\"");
    expect(content).toContain("pi_install_reference_configs");
    expect(content).not.toContain("cp \"$ASSETS_REF_DIR\"/*.md docs/reference-configs/");
    expect(content).toContain("pi_print_external_tooling_report");
  });

  test("prompt-guard should monitor tasks-first files", () => {
    const content = read("assets/hooks/prompt-guard.sh");
    const workflowState = read("assets/hooks/lib/workflow-state.sh");

    expect(content).toContain("tasks/todo.md");
    expect(content).toContain("tasks/lessons.md");
    expect(content).toContain("tasks/research.md");
    expect(workflowState).toContain("git status --porcelain=v1");
    expect(content).toContain("has_changes_glob");
    expect(content).toContain("PlanStatusGuard");
    expect(content).toContain("ensure-task-workflow.sh");
    expect(content).toContain("exit 1");
  });

  test("hook template should reference existing local hook scripts", () => {
    const settings = read("assets/hooks/settings.template.json");
    const hookCommands = [...settings.matchAll(/\.ai\/hooks\/([A-Za-z0-9.-]+\.sh)/g)].map((m) => m[1]);

    expect(hookCommands.length).toBeGreaterThan(0);
    for (const fileName of hookCommands) {
      expect(existsSync(join(ROOT, "assets/hooks", fileName))).toBe(true);
    }

    expect(hookCommands).toContain("run-hook.sh");
    expect(settings).toContain(".ai/hooks/run-hook.sh");
    expect(settings).toContain("worktree-guard.sh");
    expect(settings).toContain("pre-edit-guard.sh");
    expect(settings).toContain("post-edit-guard.sh");
    expect(settings).toContain("prompt-guard.sh");
    expect(settings).toContain("finalize-handoff.sh");
    expect(settings).toContain("post-bash.sh");
    expect(settings).toContain("trace-event.sh");
    expect(settings).toContain("context-pressure-hook.sh");
    expect(settings).toContain("session-start-context.sh");
    expect(settings).not.toContain("memory-intake.sh");
    expect(settings).not.toContain("skill-factory-session-end.sh");
    expect(settings).not.toContain("bash -lc");
    expect(settings).not.toContain("atomic-pending.sh");
    expect(settings).not.toContain("atomic-commit.sh");
    expect(settings).not.toContain("\"$TOOL_INPUT\"");
    expect(settings).not.toContain("\"$PROMPT\"");
  });

  test("setup script should install global policy hooks", () => {
    const setup = read("scripts/setup-plugins.sh");
    expect(setup).toContain("install_permissionless_policy_hooks");
    expect(setup).toContain("worktree-guard.sh");
    expect(setup).toContain("atomic-pending.sh");
    expect(setup).toContain("hook-input.sh");
    expect(setup).toContain("atomic-commit.sh");
  });

  test("hook docs and scripts should use ToolUse event names", () => {
    const skill = read("SKILL.md");
    const plugins = read("references/plugins-core.md");
    const setup = read("scripts/setup-plugins.sh");
    const legacyPre = `PreTool${"Call"}`;
    const legacyPost = `PostTool${"Call"}`;

    expect(skill).not.toContain(legacyPre);
    expect(skill).not.toContain(legacyPost);
    expect(plugins).not.toContain(legacyPre);
    expect(plugins).not.toContain(legacyPost);
    expect(setup).not.toContain(legacyPre);
    expect(setup).not.toContain(legacyPost);
  });
});
