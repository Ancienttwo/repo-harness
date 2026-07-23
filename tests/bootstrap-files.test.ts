import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");

const RETIRED_HOOK_RUNTIME_FILES = [
  "assets/hooks/anti-simplification.sh",
  "assets/hooks/changelog-guard.sh",
  "assets/hooks/codex-delegation-advisor.sh",
  "assets/hooks/first-principles-guard.sh",
  "assets/hooks/hook-input.sh",
  "assets/hooks/post-bash.sh",
  "assets/hooks/post-tool-observer.sh",
  "assets/hooks/prompt-guard.sh",
  "assets/hooks/run-hook.sh",
  "assets/hooks/subagent-return-channel-guard.sh",
  "assets/hooks/subagent-start-context.sh",
  "assets/hooks/subagent-stop-quality.sh",
  "assets/hooks/lib/minimal-change.sh",
  "assets/hooks/lib/session-state.sh",
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
];

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Bootstrap Script Contracts", () => {
  test("root SKILL stays a compact five-action router", () => {
    const skill = read("SKILL.md");
    const body = skill.replace(/^---\n[\s\S]*?\n---\n/u, "");
    expect(Buffer.byteLength(body, "utf-8")).toBeLessThanOrEqual(2048);
    expect(skill.split("\n").length).toBeLessThanOrEqual(80);
  });

  test("router exposes only the five default semantic actions", () => {
    const skill = read("SKILL.md");
    for (const [index, action] of ["setup", "plan", "execute", "verify", "handoff"].entries()) {
      expect(skill).toContain(`${index + 1}. **${action}**`);
    }
    expect(skill).not.toContain("Core Plans (A-F)");
    expect(skill).not.toContain("Custom Presets (G-K)");
    expect(skill).not.toContain("## Hook");
  });

  test("Codex agent metadata should exist for user-level installation", () => {
    const metadata = read("agents/openai.yaml");
    expect(metadata).toContain("interface:");
    expect(metadata).toContain('display_name: "repo-harness"');
    expect(metadata).toContain("short_description:");
    expect(metadata).toContain("default_prompt:");
  });

  test("Codex fleet subagent TOML definitions should exist with required keys", () => {
    const packageManifest = JSON.parse(read("package.json"));
    expect(packageManifest.files).toContain("agents/");
    const specs: Array<{ name: string; model: string; effort: string; sandboxMode?: string }> = [
      { name: "explorer", model: "gpt-5.6-luna", effort: "high", sandboxMode: "read-only" },
      { name: "deep-reasoner", model: "gpt-5.6-sol", effort: "xhigh", sandboxMode: "read-only" },
      { name: "fast-worker", model: "gpt-5.6-luna", effort: "max", sandboxMode: "workspace-write" },
      { name: "gatekeeper", model: "gpt-5.6-sol", effort: "xhigh", sandboxMode: "read-only" },
      { name: "root-cause-prover", model: "gpt-5.6-sol", effort: "high", sandboxMode: "workspace-write" },
      { name: "harness-evaluator", model: "gpt-5.6-sol", effort: "high", sandboxMode: "workspace-write" },
    ];

    for (const spec of specs) {
      const path = `.codex/agents/${spec.name}.toml`;
      expect(existsSync(join(ROOT, path))).toBe(true);

      const toml = read(path);
      expect(toml).toContain(`name = "${spec.name}"`);
      expect(toml).toContain("description = ");
      expect(toml).toContain(`model = "${spec.model}"`);
      expect(toml).toContain(`model_reasoning_effort = "${spec.effort}"`);
      expect(toml).not.toContain("Opus 4.8 at max effort");
      expect(toml).not.toContain("Sonnet 5 at max effort");
      expect(toml).toContain("developer_instructions = '''");
      expect(toml).toContain(
        "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief."
      );
      expect(read(`agents/fleet/${spec.name}.md`)).toContain(`name: ${spec.name}`);
      if (spec.sandboxMode) {
        expect(toml).toContain(`sandbox_mode = "${spec.sandboxMode}"`);
      }
    }

    expect(existsSync(join(ROOT, "agents/fleet/explore.md"))).toBe(false);
    const rootCause = read("agents/fleet/root-cause-prover.md");
    for (const field of ["root_cause", "repro", "regression_guard", "pre_fix_failure_artifact"]) {
      expect(rootCause).toContain(field);
    }
    expect(rootCause).toContain("DIAGNOSIS: CONFIRMED");
    expect(rootCause).toContain("Never edit production source");
    expect(rootCause).toContain("pipeline is forbidden");

    const evaluator = read("agents/fleet/harness-evaluator.md");
    expect(evaluator).toContain("EVAL: PASS");
    expect(evaluator).toContain("evals/bdd2/**");
    expect(evaluator).toContain("scripts/run-bdd2-evals.ts");
    expect(evaluator).toContain("fail closed");
    expect(evaluator).toContain("disposable clone/worktree");
    expect(evaluator).toContain("--run-adoption-profile");
    expect(evaluator).toContain("Workspace-write is disposable-only");

    const routing = read("docs/reference-configs/agentic-development-flow.md");
    expect(routing).toContain("host-native Explore");
    expect(routing).toContain("Formal contract");
    expect(routing).toContain("prompt inheritance");
  });

  test("repo root should include routing docs and one typed hook implementation", () => {
    expect(existsSync(join(ROOT, "CLAUDE.md"))).toBe(true);
    expect(existsSync(join(ROOT, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(ROOT, ".claude/settings.json"))).toBe(false);
    expect(existsSync(join(ROOT, ".codex/hooks.json"))).toBe(false);
    expect(existsSync(join(ROOT, "src/cli/hook-entry.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/cli/hook/runtime.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "src/cli/hook/hook-input.ts"))).toBe(true);
    expect(existsSync(join(ROOT, "assets/hooks/lib/workflow-state.sh"))).toBe(true);
    for (const retired of RETIRED_HOOK_RUNTIME_FILES) {
      expect(existsSync(join(ROOT, retired))).toBe(false);
    }

    const claude = read("CLAUDE.md");
    const agents = read("AGENTS.md");

    expect(claude).toContain("tasks/todos.md");
    expect(claude).toContain(".ai/hooks/");
    expect(claude).toContain("agentic-development-flow.md");
    expect(claude).toContain("external-tooling.md");
    expect(claude).toContain("geju");
    expect(claude).not.toContain("gstack");
    expect(claude).toContain("operations.deploy_sql");
    expect(agents).toContain("tasks/todos.md");
    expect(agents).toContain("repo-harness run check-task-workflow --strict");
    expect(agents).toContain("check-agent-tooling.sh --host both --check-updates");
    expect(agents).toContain("operations.deploy_sql");
    expect(agents).toContain("operations.deploy_sql");
  });

  test("repo package should expose workflow verification scripts", () => {
    const pkg = JSON.parse(read("package.json"));
    const cliEntry = read("src/cli/index.ts");
    expect(pkg.name).toBe("repo-harness");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.private).toBeUndefined();
    expect(pkg.bin["repo-harness"]).toBe("src/cli/index.ts");
    expect(pkg.bin["repo-harness-hook"]).toBe("src/cli/hook-entry.ts");
    expect(pkg.files).toContain("assets/");
    expect(pkg.files).not.toContain("docs/reference-configs/");
    expect(cliEntry).toContain("CLI_VERSION");
    expect(cliEntry).toContain("buildDocsCommand");
    expect(cliEntry).not.toMatch(/\\.version\\(['\"][0-9]+\\.[0-9]+\\.[0-9]+['\"]\\)/);
    expect(pkg.scripts["check:ci"]).toBe("bash scripts/check-ci.sh");
    expect(pkg.scripts["check:brain-manifest"]).toBe("repo-harness run check-brain-manifest");
    expect(pkg.scripts["check:task-sync"]).toBe("repo-harness run check-task-sync");
    expect(pkg.scripts["check:deploy-sql"]).toBe("repo-harness run check-deploy-sql-order");
    expect(pkg.scripts["check:architecture-sync"]).toBe("repo-harness run check-architecture-sync");
    expect(pkg.scripts["check:task-workflow"]).toBe("repo-harness run check-task-workflow --strict");
    expect(pkg.scripts["check:context-files"]).toBe("repo-harness run check-context-files");
    expect(pkg.scripts["sync:brain-docs"]).toBe("repo-harness run sync-brain-docs --all");
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

  test("ci workflow should run MCP path matrix across hosted operating systems", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("mcp-path-matrix:");
    expect(workflow).toContain("MCP path matrix (${{ matrix.os }})");
    expect(workflow).toContain("ubuntu-latest");
    expect(workflow).toContain("macos-latest");
    expect(workflow).toContain("windows-latest");
    expect(workflow).toContain("tests/cli/mcp-workspaces.test.ts");
    expect(workflow).toContain("tests/cli/mcp-reader-tools.test.ts");
    expect(workflow).toContain("tests/cli/mcp-policy.test.ts");
    expect(workflow).toContain("tests/cli/mcp-http.test.ts");
    expect(workflow).toContain("tests/cli/mcp-oauth.test.ts");
    expect(workflow).toContain("tests/cli/mcp-stdio.test.ts");
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
    expect(sharedLib).toContain("pi_install_helpers requires contract helper inventory");
    expect(contract.helpers.scripts).toContain("new-plan.sh");
    expect(contract.helpers.scripts).toContain("capture-plan.sh");
    expect(contract.helpers.scripts).toContain("plan-to-todo.sh");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.helpers.scripts).toContain("archive-workflow.sh");
    expect(contract.helpers.scripts).toContain("verify-contract.sh");
    expect(contract.helpers.scripts).toContain("summarize-failures.sh");
    expect(sharedLib).toContain("check:context-files");
    expect(sharedLib).toContain("check:deploy-sql");
    expect(sharedLib).toContain("check:brain-manifest");
    expect(sharedLib).toContain("sync:brain-docs");
    expect(sharedLib).toContain("spawn_decision");
    expect(sharedLib).toContain("fallback_runner");
    expect(sharedLib).toContain("if spawning is not worthwhile");
    expect(sharedLib).toContain("pi_print_external_tooling_report");
    expect(contract.helpers.scripts).toContain("check-task-sync.sh");
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
    expect(contract.helpers.scripts).toContain("ensure-task-workflow.sh");
    expect(contract.helpers.scripts).toContain("check-task-workflow.sh");
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
    expect(content).not.toContain("pi_install_hook_adapters");
    expect(content).toContain("pi_print_codex_hook_trust_notice");
    expect(sharedLib).toContain('local hooks_dir="$target_dir/.ai/hooks"');
    expect(content).not.toContain("mkdir -p .codex");
    expect(sharedLib).not.toContain("pi_retire_project_hook_adapter");
    expect(sharedLib).not.toContain("pi_prune_repo_local_hook_runtime");
    expect(contract.helpers.scripts).toContain("switch-plan.sh");
    expect(contract.helpers.scripts).toContain("capability-resolver.ts");
    expect(contract.helpers.scripts).toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/contract-worktree.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/contract-run.ts");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/ship-worktrees.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/heartbeat-triage.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/capture-plan.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/refresh-current-status.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/sync-brain-docs.sh");
    expect(contract.artifacts.requiredFiles).toContain("tasks/current.md");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/capability-config.ts");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/workflow-contract.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/brain-manifest.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capability-source-map.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(read("assets/templates/review.template.md")).toContain("## Acceptance Receipt Projection");
    expect(sharedLib).toContain("AcceptanceReceipt");
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
    expect(contract.agenticDevelopment.routing.productDiscovery).toBe("parent-agent:geju");
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
    expect(sharedLib).toContain("pi_install_helpers requires contract helper inventory");
    expect(contract.helpers.scripts).toContain("verify-contract.sh");
    expect(contract.helpers.scripts).toContain("summarize-failures.sh");
    expect(sharedLib).toContain("check:context-files");
    expect(sharedLib).toContain("check:deploy-sql");
    expect(sharedLib).toContain("pi_print_external_tooling_report");
    expect(contract.helpers.scripts).toContain("check-task-sync.sh");
    expect(contract.helpers.scripts).toContain("ensure-task-workflow.sh");
    expect(contract.helpers.scripts).toContain("capture-plan.sh");
    expect(contract.helpers.scripts).toContain("check-task-workflow.sh");
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
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/capture-plan.sh");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/contract-run.ts");
    expect(contract.artifacts.requiredFiles).not.toContain("scripts/heartbeat-triage.sh");
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
    expect(content).not.toContain("pi_install_hook_adapters");
    expect(content).toContain("pi_print_codex_hook_trust_notice");
    expect(content).toContain("pi_install_hook_assets");
    expect(sharedLib).not.toContain("pi_retire_project_hook_adapter");
    expect(sharedLib).not.toContain("pi_prune_repo_local_hook_runtime");
    expect(sharedLib).not.toContain("pi_repo_pins_hook_source");
    expect(sharedLib).toContain("pi_write_hook_runtime_readme");
    expect(sharedLib).toContain("pi_install_hook_assets");
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

  test("typed hook runtime owns host events while workflow-state remains an operator helper", () => {
    const runtime = read("src/cli/hook/runtime.ts");
    const hookInput = read("src/cli/hook/hook-input.ts");
    const workflowState = read("assets/hooks/lib/workflow-state.sh");

    expect(runtime).toContain("getHandlerForRoute");
    expect(runtime).toContain("runHook");
    expect(runtime).not.toContain("route.scripts");
    expect(hookInput).toContain("export function parseHookInput");
    expect(hookInput).toContain("getApplyPatchPaths");
    expect(workflowState).toContain("git status --porcelain=v1");
    expect(workflowState).toContain("tasks/todos.md");
    expect(workflowState).toContain("workflow_hook_cli_json");
  });

  // SSD-06 migration: the two live shell-embedded provider skills
  // (assets/skills/{claude-review,codex-review}) are deleted; their
  // deterministic scope-capture mechanics (branch/staged/unstaged/untracked
  // diff, exact-base binding) moved to code
  // (src/effects/review/cross-review-runner.ts#captureCrossReviewScope,
  // reused via diff-fingerprint.ts's buildReviewSubject) and are covered by
  // tests/cli/cross-review.test.ts, not by scanning Skill Markdown for
  // embedded shell variable assignments. This test now checks the one
  // canonical repo-harness-cross-review package's own prose properties:
  // read-only provider boundaries, model/timeout budgets, transcript
  // recovery, and the no-merge-gate guarantee.
  test("repo-harness-cross-review documents read-only scope, timeouts, transcript recovery, and no-merge-gate boundaries", () => {
    const claudeMode = read("assets/skills/repo-harness-cross-review/references/claude-mode.md");
    const codexMode = read("assets/skills/repo-harness-cross-review/references/codex-mode.md");

    expect(claudeMode).toContain("read-only reviewer");
    expect(claudeMode).toContain("no `Bash`/`Edit`/`Write`");
    expect(claudeMode).toContain("Pinned to the `fable` alias");
    expect(claudeMode).toContain("retries exactly once on `opus`");
    expect(claudeMode).toContain("330 seconds");
    expect(claudeMode).toContain("~/.claude/projects/<project>/<session-id>.jsonl");
    expect(claudeMode).toContain("malformed_transcript");
    expect(claudeMode).toContain("repo-harness cross-review --provider claude");
    expect(claudeMode).toContain("No merge-gate");
    expect(claudeMode).toContain("silently retried against Codex");

    expect(codexMode).toContain("read-only reviewer");
    expect(codexMode).toContain("read-only Bash access");
    expect(codexMode).toContain("resolved commit SHA");
    expect(codexMode).toContain('model_reasoning_effort="high"');
    expect(codexMode).toContain("1800 seconds");
    expect(codexMode).toContain("repo-harness cross-review --provider codex");
    expect(codexMode).toContain("No merge-gate");
    expect(codexMode).toContain("retried against Claude");
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
