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

  test("router should advertise scaffold plus existing-repo maintenance paths", () => {
    const skill = read("SKILL.md");
    expect(skill).toContain("1. **Scaffold**");
    expect(skill).toContain("2. **Initialize**");
    expect(skill).toContain("3. **Migrate**");
    expect(skill).toContain("4. **Audit**");
    expect(skill).toContain("5. **Repair**");
    expect(skill).not.toContain("5. **Skill Factory**");
    expect(skill).not.toContain("references/skill-factory-guide.md");
    expect(existsSync(join(ROOT, "references/skill-factory-guide.md"))).toBe(false);
  });

  test("Codex agent metadata should exist for user-level installation", () => {
    const metadata = read("agents/openai.yaml");
    expect(metadata).toContain("interface:");
    expect(metadata).toContain('display_name: "repo-harness"');
    expect(metadata).toContain("short_description:");
    expect(metadata).toContain("default_prompt:");
  });

  test("repo root should include routing docs and self-host hook implementation", () => {
    expect(existsSync(join(ROOT, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(ROOT, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(ROOT, ".claude/settings.json"))).toBe(false);
    expect(existsSync(join(ROOT, ".codex/hooks.json"))).toBe(false);
    expect(existsSync(join(ROOT, ".ai/hooks/run-hook.sh"))).toBe(true);

    const claude = read("CLAUDE.md");
    const agents = read("AGENTS.md");

    expect(claude).toContain("tasks/todos.md");
    expect(claude).toContain(".ai/hooks/");
    expect(claude).toContain("agentic-development-flow.md");
    expect(claude).toContain("external-tooling.md");
    expect(claude).toContain("gstack");
    expect(agents).toContain("tasks/todos.md");
    expect(agents).toContain("check-task-workflow.sh --strict");
    expect(agents).toContain("check-agent-tooling.sh --host both --check-updates");
  });

  test("repo package should expose workflow verification scripts", () => {
    const pkg = JSON.parse(read("package.json"));
    const cliEntry = read("src/cli/index.ts");
    expect(pkg.name).toBe("repo-harness");
    expect(pkg.version).toBe("0.7.2");
    expect(pkg.private).toBeUndefined();
    expect(pkg.bin["repo-harness"]).toBe("src/cli/index.ts");
    expect(pkg.bin["repo-harness-hook"]).toBe("src/cli/hook-entry.ts");
    expect(pkg.files).toContain("assets/");
    expect(pkg.files).not.toContain("docs/reference-configs/");
    expect(cliEntry).toContain("CLI_VERSION");
    expect(cliEntry).toContain("buildDocsCommand");
    expect(cliEntry).not.toMatch(/\\.version\\(['\"][0-9]+\\.[0-9]+\\.[0-9]+['\"]\\)/);
    expect(pkg.scripts["check:ci"]).toBe("bash scripts/check-ci.sh");
    expect(pkg.scripts["check:brain-manifest"]).toBe("bash scripts/check-brain-manifest.sh");
    expect(pkg.scripts["check:task-sync"]).toBe("bash scripts/check-task-sync.sh");
    expect(pkg.scripts["check:deploy-sql"]).toBe("bash scripts/check-deploy-sql-order.sh");
    expect(pkg.scripts["check:architecture-sync"]).toBe("bash scripts/check-architecture-sync.sh");
    expect(pkg.scripts["check:task-workflow"]).toBe("bash scripts/check-task-workflow.sh --strict");
    expect(pkg.scripts["check:context-files"]).toBe("bash scripts/check-context-files.sh");
    expect(pkg.scripts["sync:brain-docs"]).toBe("bash scripts/sync-brain-docs.sh --all");
  });

  test("ci gate should refresh handoff current before resume packet", () => {
    const ciGate = read("scripts/check-ci.sh");
    const bunfig = read("bunfig.toml");
    const prepare = 'REPO_HARNESS_SKIP_RESUME_REFRESH=1 bash scripts/prepare-handoff.sh "ci gate"';
    const resume = 'bash scripts/codex-handoff-resume.sh --cwd . --reason "ci gate"';

    expect(bunfig).toContain("maxConcurrency = 4");
    expect(ciGate).toContain(prepare);
    expect(ciGate).toContain(resume);
    expect(ciGate.indexOf(prepare)).toBeLessThan(ciGate.indexOf(resume));
    expect(ciGate.indexOf(resume)).toBeLessThan(ciGate.indexOf("bash scripts/check-task-workflow.sh --strict"));
  });

  test("release gate should delegate owned checks to the ci gate", () => {
    const releaseGate = read("scripts/check-npm-release.sh");
    const ciGate = read("scripts/check-ci.sh");
    const pkg = JSON.parse(read("package.json"));
    expect(releaseGate).toContain('npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}"');
    expect(releaseGate).toContain("bash scripts/check-ci.sh");
    expect(releaseGate.indexOf("bash scripts/check-ci.sh")).toBeGreaterThan(
      releaseGate.indexOf('npm view "${PACKAGE_NAME}@${PACKAGE_VERSION}"')
    );
    expect(ciGate).toContain("bash scripts/check-tarball-install-smoke.sh");
    expect(pkg.scripts["check:release-published"]).toBe("bash scripts/check-release-published.sh");
    expect(pkg.scripts["smoke:tarball-install"]).toBe("bash scripts/check-tarball-install-smoke.sh");
  });

  test("create-project-dirs should create tasks primary files", () => {
    const content = read("scripts/create-project-dirs.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    const contract = JSON.parse(read("assets/workflow-contract.v1.json"));

    expect(content).toContain("create_contract_directories");
    expect(content).toContain("cat > tasks/todos.md");
    expect(content).toContain("cat > tasks/lessons.md");
    expect(content).toContain("cat > docs/researches/README.md");
    expect(content).not.toContain("docs/TODO.md");
    expect(sharedLib).toContain("new-plan.sh");
    expect(sharedLib).toContain("capture-plan.sh");
    expect(sharedLib).toContain("plan-to-todo.sh");
    expect(sharedLib).toContain("contract-worktree.sh");
    expect(sharedLib).toContain("archive-workflow.sh");
    expect(sharedLib).toContain("verify-contract.sh");
    expect(sharedLib).toContain("summarize-failures.sh");
    expect(sharedLib).toContain("check:context-files");
    expect(sharedLib).toContain("check:deploy-sql");
    expect(sharedLib).toContain("check:brain-manifest");
    expect(sharedLib).toContain("sync:brain-docs");
    expect(sharedLib).toContain("spawn_decision");
    expect(sharedLib).toContain("fallback_runner");
    expect(sharedLib).toContain("if spawning is not worthwhile");
    expect(sharedLib).toContain("pi_print_external_tooling_report");
    expect(sharedLib).toContain("check-task-sync.sh");
    expect(content).toContain("mkdir -p .ai/context");
    expect(content).toContain(".ai/harness/policy.json");
    expect(content).toContain(".ai/context/context-map.json");
    expect(contract.helpers.scripts).toContain("maintenance-triage.sh");
    expect(contract.helpers.scripts).toContain("heartbeat-triage.sh");
    expect(contract.helpers.scripts).toContain("capture-plan.sh");
    expect(contract.helpers.scripts).toContain("refresh-current-status.sh");
    expect(contract.helpers.scripts).not.toContain("context-budget.ts");
    expect(contract.helpers.scripts).toContain("architecture-queue.sh");
    expect(contract.helpers.scripts).toContain("archive-architecture-request.sh");
    expect(contract.helpers.scripts).toContain("context-contract-sync.sh");
    expect(contract.helpers.scripts).toContain("workstream-sync.sh");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.helpers.scripts).toContain("contract-run.ts");
    expect(contract.helpers.scripts).toContain("ship-worktrees.sh");
    expect(contract.externalTooling.codexAutomationProfile.requiredSkills).toEqual(["health", "check", "mermaid"]);
    expect(contract.externalTooling.codexAutomationProfile.vendoringPolicy).toBe("do-not-vendor-skill-body");
    expect(contract.externalTooling.diagramDesign.vendoringPolicy).toBe("do-not-vendor");
    expect(contract.documentation.referenceConfigs.source).toBe("user-level-runtime-docs");
    expect(contract.documentation.referenceConfigs.repoStubDirectory).toBe("docs/reference-configs");
    expect(contract.documentation.referenceConfigs.packageDirectory).toBe("assets/reference-configs");
    expect(contract.documentation.referenceConfigs.resolverCommand).toBe("repo-harness docs path <doc-id>");
    expect(contract.documentation.referenceConfigs.stubMarker).toBe("<!-- repo-harness: reference-config-stub v1 -->");
    expect(contract.helpers.scripts).toContain("prepare-codex-handoff.sh");
    expect(contract.helpers.scripts).toContain("codex-handoff-resume.sh");
    expect(contract.helpers.scripts).toContain("check-agent-tooling.sh");
    expect(contract.helpers.scripts).toContain("check-architecture-sync.sh");
    expect(contract.helpers.scripts).toContain("check-brain-manifest.sh");
    expect(contract.helpers.scripts).toContain("sync-brain-docs.sh");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(contract.helpers.scripts).toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(sharedLib).toContain("ensure-task-workflow.sh");
    expect(sharedLib).toContain("check-task-workflow.sh");
    expect(sharedLib).not.toContain("skill-factory-create.sh");
    expect(sharedLib).not.toContain("skill-factory-check.sh");
    expect(sharedLib).toContain("pi_install_workflow_contract");
    expect(sharedLib).toContain("check:task-sync");
    expect(sharedLib).toContain("check:architecture-sync");
    expect(sharedLib).toContain("check:task-workflow");
    expect(sharedLib).toContain("contract.template.md");
    expect(sharedLib).toContain("implementation-notes.template.md");
    expect(content).toContain("pi_install_reference_configs");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/heartbeat-triage.md");
    expect(contract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
    expect(content).toContain("install_workflow_contract");
    expect(content).toContain("pi_install_hook_assets");
    expect(content).toContain('pi_install_hook_adapters "$PWD" "$ASSETS_HOOKS_DIR" "apply"');
    expect(content).toContain("pi_print_codex_hook_trust_notice");
    expect(sharedLib).toContain('local hooks_dir="$target_dir/.ai/hooks"');
    expect(content).not.toContain("mkdir -p .codex");
    expect(sharedLib).toContain("pi_retire_project_hook_adapter");
    expect(sharedLib).toContain(".claude/settings.json");
    expect(sharedLib).toContain(".codex/hooks.json");
    expect(contract.helpers.scripts).toContain("switch-plan.sh");
    expect(contract.helpers.scripts).toContain("capability-resolver.ts");
    expect(contract.helpers.scripts).toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/contract-worktree.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/contract-run.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/ship-worktrees.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/heartbeat-triage.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/capture-plan.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/refresh-current-status.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/sync-brain-docs.sh");
    expect(contract.artifacts.requiredFiles).toContain("tasks/current.md");
    expect(contract.artifacts.requiredFiles).toContain("scripts/capability-config.ts");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/workflow-contract.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/brain-manifest.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capability-source-map.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(read("assets/templates/review.template.md")).toContain("## External Acceptance Advice");
    expect(sharedLib).toContain("## External Acceptance Advice");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/capability-context/");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/planning/");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/active-plan");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/triage/inbox.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/architecture/index.md");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/architecture/events.jsonl");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/external-tooling.md");
    expect(contract.migrations.upgrade.strategyVersion).toBe(1);
    expect(contract.migrations.upgrade.safety.removeOnlyOwnership).toBe("known_generated");
    const retiredDrift = contract.migrations.upgrade.actions.find(
      (action: { id?: string; paths?: string[] }) => action.id === "legacy-architecture-drift-helper"
    );
    expect(retiredDrift?.paths).toContain("assets/templates/helpers/architecture-drift.sh");
    const legacyRootHelpers = contract.migrations.upgrade.actions.find(
      (action: { id?: string; cleanupMode?: string; paths?: string[] }) => action.id === "legacy-root-helper-runtime"
    );
    expect(legacyRootHelpers?.cleanupMode).toBe("generated_helper");
    expect(legacyRootHelpers?.paths).toContain("scripts/architecture-drift.sh");
    expect(legacyRootHelpers?.paths).toContain("scripts/check-task-workflow.sh");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/workstreams");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
    expect(contract.agenticDevelopment.routing.productDiscovery).toBe("gstack:office-hours");
    expect(sharedLib).not.toContain(".skill-factory-state.json");
    expect(sharedLib).not.toContain(".memory-context.json");
    expect(sharedLib).not.toContain(".memory-snapshot.json");
    expect(content).not.toContain("install_skill_factory_files");
    expect(content).toContain("create_contract_directories");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/contracts");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/reviews");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(content).toContain("# Deferred Goal Ledger");
    expect(content).not.toContain("PROJECT_SETTINGS_EOF");
    expect(content).not.toContain("\"$TOOL_INPUT\"");
    expect(content).not.toContain("\"$PROMPT\"");
  });

  test("init-project should scaffold tasks primary workflow", () => {
    const content = read("scripts/init-project.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    const contract = JSON.parse(read("assets/workflow-contract.v1.json"));

    expect(content).toContain("create_contract_directories");
    expect(content).toContain("cat > tasks/todos.md");
    expect(content).toContain("cat > tasks/lessons.md");
    expect(content).toContain("docs/researches/README.md");
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
    expect(sharedLib).toContain("capture-plan.sh");
    expect(sharedLib).toContain("check-task-workflow.sh");
    expect(content).toContain(".ai/context");
    expect(content).toContain(".ai/harness/policy.json");
    expect(content).toContain(".ai/context/context-map.json");
    expect(contract.helpers.scripts).toContain("maintenance-triage.sh");
    expect(contract.helpers.scripts).toContain("heartbeat-triage.sh");
    expect(contract.helpers.scripts).toContain("capture-plan.sh");
    expect(contract.helpers.scripts).toContain("refresh-current-status.sh");
    expect(contract.helpers.scripts).not.toContain("context-budget.ts");
    expect(contract.helpers.scripts).toContain("prepare-codex-handoff.sh");
    expect(contract.helpers.scripts).toContain("codex-handoff-resume.sh");
    expect(contract.helpers.scripts).toContain("check-agent-tooling.sh");
    expect(contract.helpers.scripts).toContain("check-architecture-sync.sh");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-context-files.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(contract.helpers.scripts).toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(contract.helpers.scripts).toContain("workstream-sync.sh");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.helpers.scripts).toContain("contract-run.ts");
    expect(contract.helpers.scripts).toContain("heartbeat-triage.sh");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(contract.artifacts.requiredFiles).toContain("scripts/capture-plan.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/contract-run.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/heartbeat-triage.sh");
    expect(contract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/workstreams");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/planning");
    expect(contract.agenticDevelopment.routing.postImplementationReview).toBe("waza:check");
    expect(contract.externalTooling.codexAutomationProfile.routes.architectureDiagram).toBe("mermaid");
    expect(content).not.toContain("pi_install_skill_factory");
    expect(sharedLib).not.toContain("skill-factory-create.sh");
    expect(sharedLib).not.toContain("skill-factory-check.sh");
    expect(sharedLib).toContain("pi_workflow_contract_query_lines");
    expect(sharedLib).toContain("check:task-sync");
    expect(sharedLib).toContain("check:architecture-sync");
    expect(sharedLib).toContain("check:task-workflow");
    expect(content).toContain("pi_install_reference_configs");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/heartbeat-triage.md");
    expect(content).toContain('pi_install_hook_adapters "$PWD" "$ASSETS_HOOKS_DIR" "apply"');
    expect(content).toContain("pi_print_codex_hook_trust_notice");
    expect(content).toContain("pi_install_hook_assets");
    expect(sharedLib).toContain("pi_retire_project_hook_adapter");
    expect(sharedLib).toContain("pi_repo_pins_hook_source");
    expect(sharedLib).toContain("pi_write_hook_runtime_readme");
    expect(sharedLib).toContain("pi_install_hook_assets");
    expect(sharedLib).toContain(".claude/settings.json");
    expect(sharedLib).toContain(".codex/hooks.json");
    expect(sharedLib).toContain('local hooks_dir="$target_dir/.ai/hooks"');
    expect(content).not.toContain("mkdir -p .codex");
    expect(sharedLib).not.toContain(".skill-factory-state.json");
    expect(sharedLib).not.toContain(".memory-context.json");
    expect(sharedLib).not.toContain(".memory-snapshot.json");
    expect(content).toContain("create_contract_directories");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/contracts");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/reviews");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(content).toContain("# Deferred Goal Ledger");
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

    expect(content).toContain("tasks/todos.md");
    expect(content).toContain("tasks/lessons.md");
    expect(content).toContain("docs/researches/");
    expect(workflowState).toContain("git status --porcelain=v1");
    expect(content).toContain("has_changes_glob");
    expect(content).toContain("PlanStatusGuard");
    expect(content).toContain("ensure-task-workflow.sh");
    // Block-path guards must use exit 2 so Claude Code's hook protocol treats
    // them as blocking and surfaces stderr to the model (exit 1 is reported as
    // "non-blocking status code: No stderr output").
    expect(content).toContain("exit 2");
  });

  test("cross-review skills should include dirty working tree scope", () => {
    const claudeReview = read("assets/skills/claude-review/SKILL.md");
    const codexReview = read("assets/skills/codex-review/SKILL.md");

    expect(claudeReview).toContain("BRANCH_DIFF=$(git diff");
    expect(claudeReview).toContain("STAGED_DIFF=$(git diff --cached");
    expect(claudeReview).toContain("UNSTAGED_DIFF=$(git diff");
    expect(claudeReview).toContain("git ls-files --others --exclude-standard -z");
    expect(claudeReview).toContain("git diff --no-index -- /dev/null");
    expect(claudeReview).toContain("BASE=origin/main");
    expect(claudeReview).toContain("else BASE=HEAD");
    expect(claudeReview).toContain("Review the combined branch, staged, unstaged, and untracked changes");
    expect(claudeReview).toContain("run_with_optional_timeout claude -p");
    expect(claudeReview).toContain("recover_claude_review_from_transcript");
    expect(claudeReview).toContain("~/.claude/projects/<project>/<session-id>.jsonl");
    expect(claudeReview).toContain("CLAUDE_CONFIG_DIR");
    expect(claudeReview).toContain("stdout was empty; output above was recovered from the session transcript");
    expect(claudeReview).toContain("intentionally does not pass `--no-session-persistence`");
    expect(claudeReview).not.toContain("${TO:+$TO 330}");

    expect(codexReview).toContain("committed branch diff");
    expect(codexReview).toContain("git diff --cached");
    expect(codexReview).toContain("unstaged tracked changes");
    expect(codexReview).toContain("git ls-files --others --exclude-standard");
    expect(codexReview).toContain("git diff --no-index -- /dev/null <file>");
    expect(codexReview).toContain("BASE=origin/main");
    expect(codexReview).toContain("else BASE=HEAD");
    expect(codexReview).toContain("run_with_optional_timeout codex exec");
    expect(codexReview).not.toContain("${TO:+$TO 330}");
  });

  test("hook template should reference existing local hook scripts", () => {
    const settings = read("assets/hooks/settings.template.json");
    const codexHooks = read("assets/hooks/codex.hooks.template.json");
    const hookCommands = [...`${settings}\n${codexHooks}`.matchAll(/\.ai\/hooks\/([A-Za-z0-9.-]+\.sh)/g)].map((m) => m[1]);

    expect(hookCommands.length).toBeGreaterThan(0);
    for (const fileName of hookCommands) {
      expect(existsSync(join(ROOT, "assets/hooks", fileName))).toBe(true);
    }

    expect(hookCommands).toContain("run-hook.sh");
    expect(settings).toContain(".ai/hooks/run-hook.sh");
    expect(codexHooks).toContain(".ai/hooks/run-hook.sh");
    expect(settings).toContain("worktree-guard.sh");
    expect(settings).toContain("pre-edit-guard.sh");
    expect(settings).toContain("subagent-return-channel-guard.sh");
    expect(settings).toContain("post-edit-guard.sh");
    expect(settings).toContain("prompt-guard.sh");
    expect(settings).not.toContain("autoresearch-advisory.sh");
    expect(codexHooks).not.toContain("autoresearch-advisory.sh");
    expect(settings).toContain("stop-orchestrator.sh");
    expect(settings).toContain("post-bash.sh");
    expect(settings).toContain("post-tool-observer.sh");
    expect(settings).not.toContain("trace-event.sh");
    expect(settings).not.toContain("context-pressure-hook.sh");
    expect(settings).toContain("session-start-context.sh");
    expect(settings).not.toContain("codex-delegation-advisor.sh");
    expect(settings).not.toContain("subagent-start-context.sh");
    expect(settings).not.toContain("subagent-stop-quality.sh");
    expect(codexHooks).toContain("codex-delegation-advisor.sh");
    expect(codexHooks).toContain("subagent-start-context.sh");
    expect(codexHooks).toContain("subagent-stop-quality.sh");
    expect(settings).not.toContain("memory-intake.sh");
    expect(settings).not.toContain("skill-factory-session-end.sh");
    expect(settings).not.toContain("bash -lc");
    expect(settings).not.toContain("atomic-pending.sh");
    expect(settings).not.toContain("atomic-commit.sh");
    expect(settings).not.toContain("\"$TOOL_INPUT\"");
    expect(settings).not.toContain("\"$PROMPT\"");
  });

  test("setup script should delegate to the typed global init path", () => {
    const setup = read("scripts/setup-plugins.sh");
    expect(setup).toContain("repo-harness init");
    expect(setup).toContain('bun "$ROOT_DIR/src/cli/index.ts" init');
    expect(setup).not.toContain("ESSENTIAL_PLUGINS");
    expect(setup).not.toContain("feature-dev");
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
