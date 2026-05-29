import { describe, test, expect } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const MIGRATION_INTEGRATION_TIMEOUT = 60000;

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Migration script contract", () => {
  test("should provide dry-run and apply modes", () => {
    const script = read("scripts/migrate-project-template.sh");
    expect(script).toContain("--dry-run");
    expect(script).toContain("--apply");
    expect(script).toContain("--repo");
  });

  test("should retire project hook adapters through user-level hosts", () => {
    const script = read("scripts/migrate-project-template.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    expect(script).toContain(".claude/settings.json");
    expect(script).toContain(".codex/hooks.json");
    expect(sharedLib).toContain("settings.local.json");
    expect(script).toContain("Host hook config target: user-level");
    expect(script).toContain("migrate_workflow");
  });

  test("should route legacy docs through the dedicated migrator", () => {
    const script = read("scripts/migrate-project-template.sh");
    const migrator = read("scripts/migrate-workflow-docs.ts");
    expect(script).toContain("migrate-workflow-docs.ts");
    expect(migrator).toContain("docs/TODO.md");
    expect(migrator).toContain("docs/plan.md");
    expect(migrator).toContain("docs/PROGRESS.md");
  });

  test("generated migration wrapper should support repo-harness roots without retired project-initializer paths", () => {
    const wrapper = read("assets/templates/helpers/migrate-project-template.sh");
    expect(wrapper).toContain("AGENTIC_DEV_ROOT");
    expect(wrapper).toContain("AGENTIC_DEV_SKILL_ROOT");
    expect(wrapper).toContain("Projects/repo-harness");
    expect(wrapper).toContain(".codex/skills/repo-harness");
    expect(wrapper).toContain(".codex/skills/repo-harness-skill");
    expect(wrapper).toContain(".claude/skills/repo-harness");
    expect(wrapper).toContain(".claude/skills/repo-harness-skill");
    expect(wrapper).not.toContain("PROJECT_INITIALIZER_ROOT");
    expect(wrapper).not.toContain(".codex/skills/project-initializer");
    expect(wrapper).not.toContain(".claude/skills/project-initializer");
  });

  test("should migrate workflow files and runtime ignore block", () => {
    const script = read("scripts/migrate-project-template.sh");
    const sharedLib = read("scripts/lib/project-init-lib.sh");
    const workflowContract = read("assets/workflow-contract.v1.json");
    expect(script).toContain("docs/spec.md");
    expect(script).toContain("plans/archive");
    expect(script).toContain("tasks/archive");
    expect(script).toContain("tasks/research.md");
    expect(script).toContain("tasks/todo.md");
    expect(script).toContain("tasks/lessons.md");
    expect(script).toContain("tasks/reviews");
    expect(script).toContain("tasks/notes");
    expect(script).toContain(".ai/context");
    expect(script).toContain(".ai/harness/checks/latest.json");
    expect(script).toContain(".ai/harness/policy.json");
    expect(script).toContain(".ai/harness/brain-manifest.json");
    expect(script).toContain(".ai/harness/events.jsonl");
    expect(script).toContain(".ai/harness/handoff/current.md");
    expect(script).toContain(".ai/harness/context-budget");
    expect(script).toContain(".ai/harness/workflow-contract.json");
    expect(workflowContract).toContain("new-spec.sh");
    expect(workflowContract).toContain("new-sprint.sh");
    expect(workflowContract).toContain("new-plan.sh");
    expect(workflowContract).toContain("capture-plan.sh");
    expect(workflowContract).toContain("plan-to-todo.sh");
    expect(workflowContract).toContain("contract-worktree.sh");
    expect(workflowContract).toContain("archive-workflow.sh");
    expect(workflowContract).toContain("prepare-handoff.sh");
    expect(workflowContract).toContain("verify-contract.sh");
    expect(workflowContract).toContain("summarize-failures.sh");
    expect(workflowContract).toContain("verify-sprint.sh");
    expect(workflowContract).toContain("check-task-sync.sh");
    expect(workflowContract).toContain("check-deploy-sql-order.sh");
    expect(workflowContract).toContain("check-agent-tooling.sh");
    expect(workflowContract).toContain("check-context-files.sh");
    expect(workflowContract).toContain("check-brain-manifest.sh");
    expect(workflowContract).toContain("sync-brain-docs.sh");
    expect(workflowContract).toContain("ensure-task-workflow.sh");
    expect(workflowContract).toContain("check-task-workflow.sh");
    expect(workflowContract).toContain("maintenance-triage.sh");
    expect(workflowContract).toContain("context-budget.ts");
    expect(workflowContract).toContain("capability-resolver.ts");
    expect(workflowContract).toContain("architecture-event.ts");
    expect(workflowContract).toContain("capability-config.ts");
    expect(workflowContract).toContain("architecture-drift.sh");
    expect(workflowContract).toContain("archive-architecture-request.sh");
    expect(workflowContract).toContain("context-contract-sync.sh");
    expect(workflowContract).toContain("workstream-sync.sh");
    expect(workflowContract).toContain("prepare-codex-handoff.sh");
    expect(workflowContract).toContain("codex-handoff-resume.sh");
    expect(workflowContract).toContain("implementation-notes.template.md");
    expect(workflowContract).toContain("deploy/README.md");
    expect(script).toContain("pi_ensure_task_sync");
    expect(sharedLib).toContain("check:task-sync");
    expect(sharedLib).toContain("check:task-workflow");
    expect(sharedLib).toContain(".claude/.trace.jsonl");
    expect(sharedLib).toContain(".codex/*");
    expect(sharedLib).not.toContain("!.codex/hooks.json");
    expect(sharedLib).toContain("pi_print_codex_hook_trust_notice");
    expect(sharedLib).toContain("_ref/");
    expect(sharedLib).toContain("_ops/");
    expect(script).toContain("tasks/contracts");
    expect(workflowContract).toContain("docs/architecture/index.md");
    expect(workflowContract).toContain(".ai/context/capabilities.json");
    expect(workflowContract).toContain(".ai/harness/architecture/events.jsonl");
    expect(workflowContract).toContain(".ai/harness/worktrees/");
    expect(workflowContract).not.toContain(".ai/harness/workstreams/events.jsonl");
    expect(script).toContain("pi_install_reference_configs");
    expect(workflowContract).toContain("document-generation.md");
    expect(sharedLib).toContain("claude-runtime-temp");
    expect(script).toContain("docs/reference-configs");
    expect(script).toContain("Existing external_tooling overrides are preserved");
    expect(script).toContain("pi_workflow_contract_upgrade_action_paths");
    expect(script).not.toContain("EOF_REMOVED");
    expect(read("assets/workflow-contract.v1.json")).toContain('"runtimeManifest": ".ai/harness/workflow-contract.json"');
    expect(read("assets/workflow-contract.v1.json")).toContain('"upgrade"');
    expect(read("assets/workflow-contract.v1.json")).toContain('"known_generated"');
  });

  test("should include external tooling defaults and advisory output in dry-run reports", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-dry-run-"));
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--dry-run"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("--- External Tooling ---");
      expect(res.stdout).toContain("routing complex->gstack, simple->waza, knowledge->gbrain");
      expect(res.stdout).toContain("Hosts: claude-code, codex");
      expect(res.stdout).toContain("Advisory report (dry-run snapshot)");
      expect(res.stdout).toContain("upgrade_plan:");
      expect(res.stdout).toContain("Upgrade/reconfigure/cleanup plan");
      expect(res.stdout).toContain("Host hook adapters are user-level:");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30000);

  test("should apply migration and create workflow artifacts with single-source plan workflow", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-apply-"));
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      mkdirSync(join(repo, "plans"), { recursive: true });
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));

      writeFileSync(join(repo, "docs/TODO.md"), "legacy todo\n");
      writeFileSync(join(repo, "docs/plan.md"), "legacy pointer\n");
      writeFileSync(join(repo, ".gitignore"), "# base\n");
      writeFileSync(
        join(repo, ".claude/settings.local.json"),
        JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Bash", hooks: [] }] } }, null, 2)
      );

      writeFileSync(join(repo, "plans/plan-20260304-0900-alpha.md"), "# Plan alpha\n\n> **Status**: Draft\n");
      writeFileSync(join(repo, "plans/plan-20260304-1000-beta.md"), "# Plan beta\n\n> **Status**: Draft\n");

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "plans/archive"))).toBe(true);
      expect(existsSync(join(repo, "tasks/archive"))).toBe(true);
      expect(existsSync(join(repo, ".claude/templates/research.template.md"))).toBe(true);
      expect(existsSync(join(repo, ".claude/templates/spec.template.md"))).toBe(true);
      expect(existsSync(join(repo, ".claude/templates/plan.template.md"))).toBe(true);
      expect(existsSync(join(repo, ".claude/templates/contract.template.md"))).toBe(true);
      expect(existsSync(join(repo, ".claude/templates/review.template.md"))).toBe(true);
      expect(existsSync(join(repo, ".claude/templates/implementation-notes.template.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/spec.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/reviews"))).toBe(true);
      expect(existsSync(join(repo, "tasks/notes"))).toBe(true);
      expect(existsSync(join(repo, ".ai/context/context-map.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/checks/latest.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/policy.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/events.jsonl"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/failures/latest.jsonl"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/handoff/current.md"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/handoff/resume.md"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/context-budget/latest.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/workflow-contract.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/brain-manifest.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/runs/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/worktrees/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "deploy/README.md"))).toBe(true);
      expect(existsSync(join(repo, "deploy/scripts/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "deploy/submissions/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "deploy/runbooks/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "deploy/release-checklists/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "deploy/sql/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "scripts/new-spec.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/new-sprint.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/new-plan.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/capture-plan.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/plan-to-todo.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/contract-worktree.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/archive-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/prepare-handoff.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/verify-contract.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/summarize-failures.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/verify-sprint.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-task-sync.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-deploy-sql-order.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-agent-tooling.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-context-files.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-brain-manifest.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/sync-brain-docs.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/ensure-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/maintenance-triage.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/workflow-contract.ts"))).toBe(true);
      expect(existsSync(join(repo, "scripts/inspect-project-state.ts"))).toBe(true);
      expect(existsSync(join(repo, "scripts/migrate-workflow-docs.ts"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-skill-version.ts"))).toBe(true);
      expect(existsSync(join(repo, "scripts/migrate-project-template.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/context-budget.ts"))).toBe(true);
      expect(existsSync(join(repo, "scripts/capability-config.ts"))).toBe(true);
      expect(existsSync(join(repo, "scripts/prepare-codex-handoff.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/codex-handoff-resume.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/skill-factory-create.sh"))).toBe(false);
      expect(existsSync(join(repo, "scripts/skill-factory-check.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/run-hook.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/finalize-handoff.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/session-start-context.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/lib/memory-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/memory-intake.sh"))).toBe(false);
      expect(existsSync(join(repo, ".codex/hooks.json"))).toBe(false);
      expect(existsSync(join(repo, ".claude/settings.json"))).toBe(false);
      expect(existsSync(join(repo, ".claude/settings.local.json"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/finalize-handoff.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/session-start-context.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/hook-input.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(repo, "tasks/research.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/todo.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/lessons.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/contracts"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/handoff-protocol.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/harness-overview.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/document-generation.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/agentic-development-flow.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/external-tooling.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/sprint-contracts.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/global-working-rules.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/spa-day-protocol.md"))).toBe(false);
      expect(existsSync(join(repo, "docs/reference-configs/hook-operations.md"))).toBe(false);
      expect(existsSync(join(repo, "docs/reference-configs/evaluator-rubric.md"))).toBe(false);
      expect(existsSync(join(repo, ".claude/skill-factory/rubric.template.json"))).toBe(false);
      expect(existsSync(join(repo, ".claude/skill-factory/registry.json"))).toBe(false);

      expect(existsSync(join(repo, "docs/TODO.md"))).toBe(false);
      expect(existsSync(join(repo, "docs/plan.md"))).toBe(false);
      expect(existsSync(join(repo, "docs/TODO.md.migrated.bak"))).toBe(true);
      expect(existsSync(join(repo, "docs/plan.md.migrated.bak"))).toBe(true);
      expect(existsSync(join(repo, "tasks/archive/legacy-docs-TODO.md"))).toBe(true);
      expect(existsSync(join(repo, "plans/archive/legacy-docs-plan.md"))).toBe(true);

      expect(existsSync(join(repo, "docs/PROGRESS.md"))).toBe(false);
      expect(existsSync(join(repo, "docs/PROGRESS.md.migrated.bak"))).toBe(false);
      expect(existsSync(join(repo, "tasks/archive/legacy-docs-PROGRESS.md"))).toBe(false);
      const spec = readFileSync(join(repo, "docs/spec.md"), "utf-8");
      expect(spec).toContain("# Product Spec:");

      const handoff = readFileSync(join(repo, ".ai/harness/handoff/current.md"), "utf-8");
      expect(handoff).toContain("# Harness Handoff");
      const inspectRes = spawnSync(
        "bun",
        ["scripts/inspect-project-state.ts", "--repo", repo, "--format", "text"],
        { cwd: repo, encoding: "utf-8", env: { ...process.env, AGENTIC_DEV_ROOT: ROOT } }
      );
      expect(inspectRes.status).toBe(0);
      expect(inspectRes.stdout).toContain("mode: audit");
      const versionRes = spawnSync("bun", ["scripts/check-skill-version.ts", "--project", "."], {
        cwd: repo,
        encoding: "utf-8",
        env: { ...process.env, AGENTIC_DEV_ROOT: ROOT },
      });
      expect(versionRes.status).toBe(0);
      expect(versionRes.stdout).toContain("Project at . is up to date");
      const policy = JSON.parse(readFileSync(join(repo, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({
        complex: "gstack",
        simple: "waza",
        knowledge: "gbrain",
      });
      expect(policy.external_tooling.hosts).toEqual(["claude-code", "codex"]);
      expect(policy.external_tooling.mode).toBe("agent-readiness-required");
      expect(policy.external_tooling.readiness_gate).toBe("scripts/check-agent-tooling.sh --host codex --strict-readiness");
      expect(policy.external_tooling.waza.primary_host).toBe("codex");
      expect(policy.external_tooling.waza.sync_mode).toBe("stage-upstream-then-copy-to-codex");
      expect(policy.external_tooling.codex_automation_profile.required_skills).toEqual(["health", "check", "diagram-design"]);
      expect(policy.external_tooling.codex_automation_profile.mode).toBe("codex-runtime-reference");
      expect(policy.external_tooling.codex_automation_profile.routes.architecture_diagram).toBe("diagram-design");
      expect(policy.external_tooling.codex_automation_profile.vendoring_policy).toBe("do-not-vendor-skill-body");
      expect(policy.external_tooling.gbrain.mcp).toBe("candidate-disabled");
      expect(policy.external_tooling.codegraph.primary_host).toBe("both");
      expect(policy.external_tooling.codegraph.index_dir).toBe(".codegraph");
      expect(policy.external_tooling.codegraph.readiness).toBe("required-for-agent-code-navigation");
      expect(policy.external_tooling.codegraph.hook_policy).toBe("do-not-block-hooks");
      expect(policy.external_tooling.codegraph.vendoring_policy).toBe("do-not-add-package-dependency");
      expect(policy.agentic_development.routing).toEqual({
        product_discovery: "gstack:office-hours",
        complex_engineering_plan: "gstack:plan-eng-review",
        design_plan: "gstack:plan-design-review",
        small_or_medium_plan: "waza:think",
        bug_or_regression: "waza:hunt",
        post_implementation_review: "waza:check",
      });
      expect(policy.context_budget.status_file).toBe(".ai/harness/context-budget/latest.json");
      expect(policy.handoff_resume.resume_packet_file).toBe(".ai/harness/handoff/resume.md");
      expect(policy.tasks.notes_dir).toBe("tasks/notes");
      expect(policy.tasks.workstreams_dir).toBe("tasks/workstreams");
      expect(policy.reference_material.dir).toBe("_ref");
      expect(policy.reference_material.commit_policy).toContain("never commit");
      expect(policy.reference_material.rule).toContain("occasional ignored external reference checkout cache");
      expect(policy.reference_material.rule).toContain("commit/tag and path");
      expect(policy.operations.dir).toBe("deploy");
      expect(policy.operations.private_dir).toBe("_ops");
      expect(policy.operations.tracked).toContain("deploy/submissions/");
      expect(policy.operations.tracked).toContain("deploy/sql/");
      expect(policy.operations.ignored).toContain("_ops/");
      expect(policy.workstreams.scope).toBe("capability");
      expect(policy.information_lifecycle.notes.dir).toBe("tasks/notes");
      expect(policy.information_lifecycle.evidence.snapshots_dir).toBe(".ai/harness/runs");
      expect(policy.information_lifecycle.external_knowledge.manifest_file).toBe(".ai/harness/brain-manifest.json");
      expect(policy.information_lifecycle.external_knowledge.drift_check).toBe("scripts/check-brain-manifest.sh");
      expect(policy.information_lifecycle.external_knowledge.sync_script).toBe("scripts/sync-brain-docs.sh");
      expect(policy.information_lifecycle.assets.promotion_rule).toContain("verified reuse across tasks");
      expect(policy.documentation.profile).toBe("minimal-agentic");
      expect(policy.lsp_profiles.default).toBe("typescript-lsp");
      expect(policy.worktree_strategy.auto_for_contract_tasks).toBe(true);
      expect(policy.worktree_strategy.start_script).toBe("scripts/contract-worktree.sh start --plan <plan-file>");
      expect(policy.worktree_strategy.finish_script).toBe("scripts/contract-worktree.sh finish");
      expect(policy.worktree_strategy.cleanup_script).toBe("scripts/contract-worktree.sh cleanup --slug <slug>");
      expect(policy.worktree_strategy.validation_route).toBe("waza:check");
      expect(policy.sidecar_research.preferred_runners).toEqual([
        "subagent",
        "codex exec --json",
        "main-thread trace",
      ]);
      expect(policy.sidecar_research.spawn_decision).toContain("callable runner availability");
      expect(policy.sidecar_research.spawn_decision).toContain("do not ask the user");
      expect(policy.sidecar_research.fallback_runner).toBe("main-thread trace");
      expect(policy.sidecar_research.main_thread_policy).toContain("consume conclusions");
      expect(policy.upgrade.strategy_version).toBe(1);
      expect(policy.upgrade.cleanup.remove_only_ownership).toBe("known_generated");
      expect(policy.upgrade.action_classes.preserve).toContain("user-authored hooks");
      const workflowContract = JSON.parse(readFileSync(join(repo, ".ai/harness/workflow-contract.json"), "utf-8"));
      expect(workflowContract.helpers.scripts).toContain("check-agent-tooling.sh");
      expect(workflowContract.helpers.scripts).toContain("check-brain-manifest.sh");
      expect(workflowContract.helpers.scripts).toContain("sync-brain-docs.sh");
      expect(workflowContract.helpers.scripts).toContain("check-deploy-sql-order.sh");
      expect(workflowContract.helpers.scripts).toContain("switch-plan.sh");
      expect(workflowContract.helpers.scripts).toContain("contract-worktree.sh");
      expect(workflowContract.helpers.scripts).toContain("check-context-files.sh");
      expect(workflowContract.helpers.scripts).toContain("maintenance-triage.sh");
      expect(workflowContract.helpers.scripts).toContain("context-budget.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-resolver.ts");
      expect(workflowContract.helpers.scripts).toContain("architecture-event.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-config.ts");
      expect(workflowContract.helpers.scripts).toContain("archive-architecture-request.sh");
      expect(workflowContract.helpers.scripts).toContain("workstream-sync.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/contract-worktree.sh");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
      expect(workflowContract.artifacts.requiredDirectories).toContain("deploy/sql");
      expect(workflowContract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
      expect(workflowContract.artifacts.requiredFiles).toContain(".ai/harness/brain-manifest.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".claude/settings.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/sync-brain-docs.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
      expect(workflowContract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/notes");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/workstreams");
      expect(workflowContract.agenticDevelopment.routing.designPlan).toBe("gstack:plan-design-review");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/checks/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/checks/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-plan");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");

      const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf-8"));
      expect(pkg.scripts["check:brain-manifest"]).toBe("bash scripts/check-brain-manifest.sh");
      expect(pkg.scripts["check:context-files"]).toBe("bash scripts/check-context-files.sh");
      expect(pkg.scripts["check:deploy-sql"]).toBe("bash scripts/check-deploy-sql-order.sh");
      expect(pkg.scripts["check:task-sync"]).toBe("bash scripts/check-task-sync.sh");
      expect(pkg.scripts["check:task-workflow"]).toBe("bash scripts/check-task-workflow.sh --strict");
      expect(pkg.scripts["sync:brain-docs"]).toBe("bash scripts/sync-brain-docs.sh --all");

      const gitignore = readFileSync(join(repo, ".gitignore"), "utf-8");
      expect(gitignore).toContain("# BEGIN: claude-runtime-temp (managed by project-initializer)");
      expect(gitignore).toContain(".ai/harness/active-plan");
      expect(gitignore).toContain(".ai/harness/active-worktree");
      expect(gitignore).toContain(".claude/.active-plan");
      expect(gitignore).toContain(".claude/.trace.jsonl");
      expect(gitignore).toContain(".codex/*");
      expect(gitignore).not.toContain("!.codex/hooks.json");
      expect(gitignore).toContain("_ref/");
      expect(gitignore).toContain(".codegraph/");
      expect(gitignore).toContain("_ops/");
      expect(gitignore).not.toContain("_ops/secrets/");
      expect(gitignore).not.toContain("!_ops/env/.env.example");
      expect(res.stdout).toContain("--- External Tooling ---");
      expect(res.stdout).toContain("External Tooling Report");
      expect(res.stdout).toContain("Host hook adapters are user-level:");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30000);

  test("should migrate legacy trackable _ops assets into deploy while preserving private _ops state", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-ops-deploy-"));
    try {
      mkdirSync(join(repo, "_ops/scripts"), { recursive: true });
      mkdirSync(join(repo, "_ops/submissions"), { recursive: true });
      mkdirSync(join(repo, "_ops/sql"), { recursive: true });
      mkdirSync(join(repo, "_ops/env"), { recursive: true });
      mkdirSync(join(repo, "_ops/secrets"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "_ops/scripts/deploy.sh"), "#!/bin/bash\n");
      writeFileSync(join(repo, "_ops/submissions/review.md"), "# Review\n");
      writeFileSync(join(repo, "_ops/sql/0001_create_users.sql"), "create table users(id integer);\n");
      writeFileSync(join(repo, "_ops/env/.env.example"), "API_URL=\n");
      writeFileSync(join(repo, "_ops/0002_add_orders.sql"), "create table orders(id integer);\n");
      writeFileSync(join(repo, "_ops/runbook.md"), "# Runbook\n");
      writeFileSync(join(repo, "_ops/env/.env.local"), "SECRET=value\n");
      writeFileSync(join(repo, "_ops/secrets/token.txt"), "secret\n");

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "deploy/scripts/deploy.sh"))).toBe(true);
      expect(existsSync(join(repo, "deploy/submissions/review.md"))).toBe(true);
      expect(existsSync(join(repo, "deploy/sql/0001_create_users.sql"))).toBe(true);
      expect(existsSync(join(repo, "deploy/sql/0002_add_orders.sql"))).toBe(true);
      expect(existsSync(join(repo, "deploy/env/.env.example"))).toBe(true);
      expect(existsSync(join(repo, "deploy/runbook.md"))).toBe(true);
      expect(existsSync(join(repo, "_ops/env/.env.local"))).toBe(true);
      expect(existsSync(join(repo, "_ops/secrets/token.txt"))).toBe(true);
      const gitignore = readFileSync(join(repo, ".gitignore"), "utf-8");
      expect(gitignore).toContain("_ops/");
      expect(gitignore).not.toContain("!_ops/env/.env.example");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should be idempotent after a clean migration commit", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-idempotent-"));
    try {
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", private: true }, null, 2));
      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["add", "package.json"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["commit", "-qm", "initial"], { cwd: repo }).status).toBe(0);

      const firstApply = spawnSync("bash", ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"], {
        cwd: ROOT,
        encoding: "utf-8",
      });
      expect(firstApply.status).toBe(0);
      const firstStamp = readFileSync(join(repo, ".claude/.skill-version"), "utf-8");
      expect(spawnSync("git", ["add", "-A"], { cwd: repo }).status).toBe(0);
      expect(spawnSync("git", ["commit", "-qm", "after migration"], { cwd: repo }).status).toBe(0);

      const secondApply = spawnSync("bash", ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"], {
        cwd: ROOT,
        encoding: "utf-8",
      });
      expect(secondApply.status).toBe(0);
      expect(readFileSync(join(repo, ".claude/.skill-version"), "utf-8")).toBe(firstStamp);

      const status = spawnSync("git", ["status", "--short"], { cwd: repo, encoding: "utf-8" });
      expect(status.status).toBe(0);
      expect(status.stdout.trim()).toBe("");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30000);

  test("should remove repo-local legacy skill factory assets during migration", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-self-"));
    try {
      mkdirSync(join(repo, ".ai/hooks/lib"), { recursive: true });
      mkdirSync(join(repo, ".claude/hooks/lib"), { recursive: true });
      mkdirSync(join(repo, ".claude/skill-factory"), { recursive: true });
      mkdirSync(join(repo, "scripts"), { recursive: true });
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "scripts/skill-factory-create.sh"), "#!/bin/bash\necho create\n");
      writeFileSync(join(repo, "scripts/skill-factory-check.sh"), "#!/bin/bash\necho check\n");
      writeFileSync(join(repo, ".ai/hooks/lib/skill-factory.sh"), "#!/bin/bash\necho legacy\n");
      writeFileSync(join(repo, ".ai/hooks/memory-intake.sh"), "#!/bin/bash\necho legacy\n");
      writeFileSync(join(repo, ".claude/hooks/run-hook.sh"), "#!/bin/bash\necho generated shim\n");
      writeFileSync(join(repo, ".claude/hooks/finalize-handoff.sh"), "#!/bin/bash\necho generated shim\n");
      writeFileSync(join(repo, ".claude/hooks/session-start-context.sh"), "#!/bin/bash\necho generated shim\n");
      writeFileSync(join(repo, ".claude/hooks/custom-bash.sh"), "#!/bin/bash\necho custom\n");
      writeFileSync(join(repo, ".claude/hooks/hook-input.sh"), "#!/bin/bash\necho legacy\n");
      writeFileSync(join(repo, ".claude/hooks/lib/workflow-state.sh"), "#!/bin/bash\necho legacy\n");
      writeFileSync(join(repo, ".claude/hooks/lib/session-state.sh"), "#!/bin/bash\necho legacy\n");
      writeFileSync(join(repo, ".claude/hooks/lib/skill-factory.sh"), "#!/bin/bash\necho legacy\n");
      writeFileSync(join(repo, ".claude/hooks/memory-intake.sh"), "#!/bin/bash\necho legacy\n");
      writeFileSync(join(repo, ".claude/skill-factory/registry.json"), "{}\n");
      writeFileSync(
        join(repo, ".claude/settings.json"),
        JSON.stringify(
          {
            hooks: {
              Stop: [
                {
                  hooks: [
                    {
                      type: "command",
                      command: "bash .ai/hooks/run-hook.sh skill-factory-session-end.sh",
                    },
                  ],
                },
              ],
            },
          },
          null,
          2
        )
      );

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "scripts/skill-factory-create.sh"))).toBe(false);
      expect(existsSync(join(repo, "scripts/skill-factory-check.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/memory-intake.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/finalize-handoff.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/session-start-context.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/custom-bash.sh"))).toBe(true);
      expect(existsSync(join(repo, ".claude/hooks/hook-input.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/session-state.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/lib/skill-factory.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/hooks/memory-intake.sh"))).toBe(false);
      expect(existsSync(join(repo, ".claude/skill-factory"))).toBe(false);
      expect(existsSync(join(repo, ".claude/settings.json"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should preserve explicit external_tooling overrides while merging defaults", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-policy-merge-"));
    try {
      mkdirSync(join(repo, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(repo, ".ai/harness/policy.json"),
        JSON.stringify(
          {
            version: 1,
            external_tooling: {
              hosts: ["codex"],
              mode: "strict-local",
              gbrain: { mcp: "configured" },
            },
          },
          null,
          2
        )
      );

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      const policy = JSON.parse(readFileSync(join(repo, ".ai/harness/policy.json"), "utf-8"));
      expect(policy.external_tooling.routing).toEqual({
        complex: "gstack",
        simple: "waza",
        knowledge: "gbrain",
      });
      expect(policy.external_tooling.hosts).toEqual(["codex"]);
      expect(policy.external_tooling.mode).toBe("strict-local");
      expect(policy.external_tooling.waza.primary_host).toBe("codex");
      expect(policy.external_tooling.waza.staging_cache_path).toBe("~/.agents/skills");
      expect(policy.external_tooling.codex_automation_profile.required_skills).toEqual(["health", "check", "diagram-design"]);
      expect(policy.external_tooling.codex_automation_profile.source).toBe("~/.codex/skills");
      expect(policy.external_tooling.gbrain.mcp).toBe("configured");
      expect(policy.external_tooling.codegraph.primary_host).toBe("both");
      expect(policy.external_tooling.codegraph.index_dir).toBe(".codegraph");
      expect(policy.agentic_development.routing.complex_engineering_plan).toBe("gstack:plan-eng-review");
      expect(policy.upgrade.strategy_version).toBe(1);
      expect(policy.upgrade.cleanup.custom_hooks).toBe("preserve");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should normalize partial tasks-first repos that still have a legacy tasks/todo.md", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-partial-tasks-"));
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      mkdirSync(join(repo, "tasks"), { recursive: true });
      writeFileSync(join(repo, "tasks/todo.md"), "# Old Todo\n\n- [ ] existing task\n");
      writeFileSync(join(repo, "docs/TODO.md"), "- [ ] docs task\n");
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "tasks/archive/legacy-tasks-todo.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/archive/legacy-docs-TODO.md"))).toBe(true);

      const todo = readFileSync(join(repo, "tasks/todo.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("**Status**: Backlog");
      expect(todo).toContain("Review archived legacy checklist");
      expect(todo).not.toContain("existing task");
      expect(todo).not.toContain("docs task");

      const legacyTasksTodo = readFileSync(join(repo, "tasks/archive/legacy-tasks-todo.md"), "utf-8");
      expect(legacyTasksTodo).toContain("existing task");
      const legacyDocsTodo = readFileSync(join(repo, "tasks/archive/legacy-docs-TODO.md"), "utf-8");
      expect(legacyDocsTodo).toContain("docs task");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should reapply migration when .gitignore already contains a managed runtime block", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-gitignore-"));
    try {
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(
        join(repo, ".gitignore"),
        [
          "# base",
          "# BEGIN: claude-runtime-temp (managed by project-initializer)",
          ".claude/settings.local.json",
          "# END: claude-runtime-temp",
        ].join("\n") + "\n"
      );

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      const gitignore = readFileSync(join(repo, ".gitignore"), "utf-8");
      expect(gitignore).toContain("# BEGIN: claude-runtime-temp (managed by project-initializer)");
      expect(gitignore).toContain(".claude/.task-state.json");
      expect(gitignore).toContain(".ai/harness/active-plan");
      expect(gitignore).toContain(".ai/harness/active-worktree");
      expect(gitignore).toContain(".claude/.active-plan");
      expect(gitignore).toContain(".claude/.trace.jsonl");
      expect(gitignore).toContain(".codex/*");
      expect(gitignore).not.toContain("!.codex/hooks.json");
      expect(gitignore).toContain("_ref/");
      expect(gitignore).toContain("_ops/");
      expect(gitignore).not.toContain(".claude/.memory-context.json");
      expect(gitignore).toContain("# END: claude-runtime-temp");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should migrate legacy active-plan marker to the host-neutral marker", () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), "migration-active-marker-")));
    try {
      mkdirSync(join(repo, ".claude"), { recursive: true });
      mkdirSync(join(repo, "plans"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "plans/plan-20260327-2200-alpha.md"), "# Plan: alpha\n\n> **Status**: Draft\n");
      writeFileSync(join(repo, ".claude/.active-plan"), "plans/plan-20260327-2200-alpha.md");

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(readFileSync(join(repo, ".ai/harness/active-plan"), "utf-8")).toBe("plans/plan-20260327-2200-alpha.md");
      expect(readFileSync(join(repo, ".ai/harness/active-worktree"), "utf-8").trim()).toBe(repo);
      expect(readFileSync(join(repo, ".claude/.active-plan"), "utf-8")).toBe("plans/plan-20260327-2200-alpha.md");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should preserve non-hook settings while retiring project hooks", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-merge-"));
    try {
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(
        join(repo, ".claude/settings.json"),
        JSON.stringify(
          {
            permissions: { allow: ["Bash(git status)"] },
            hooks: {
              PostToolUse: [
                {
                  matcher: "Bash",
                  hooks: [{ type: "command", command: "bash .claude/hooks/custom-bash.sh" }],
                },
              ],
            },
          },
          null,
          2
        )
      );

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      const settings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf-8"));
      expect(settings.permissions.allow).toContain("Bash(git status)");
      expect(settings.hooks).toBeUndefined();
      expect(existsSync(join(repo, ".codex/hooks.json"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should remove hooks from settings.local.json without overwriting local settings", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-local-hooks-"));
    try {
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(
        join(repo, ".claude/settings.json"),
        JSON.stringify(
          {
            hooks: {
              PostToolUse: [
                {
                  matcher: "Bash",
                  hooks: [{ type: "command", command: "bash .claude/hooks/custom-existing.sh" }],
                },
              ],
            },
          },
          null,
          2
        )
      );
      writeFileSync(
        join(repo, ".claude/settings.local.json"),
        JSON.stringify(
          {
            theme: "local-only",
            hooks: {
              PostToolUse: [
                {
                  matcher: "Bash",
                  hooks: [{ type: "command", command: "bash .claude/hooks/local-only.sh" }],
                },
              ],
            },
          },
          null,
          2
        )
      );

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, ".claude/settings.json"))).toBe(false);

      const settingsLocal = JSON.parse(readFileSync(join(repo, ".claude/settings.local.json"), "utf-8"));
      expect(settingsLocal.hooks).toBeUndefined();
      expect(settingsLocal.theme).toBe("local-only");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should retire hooks and preserve non-hook settings when jq is unavailable", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-no-jq-"));
    try {
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      const originalSettings = JSON.stringify(
        {
          permissions: { allow: ["Bash(git status)"] },
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [{ type: "command", command: "bash .claude/hooks/custom-only.sh" }],
              },
            ],
          },
        },
        null,
        2
      );
      writeFileSync(join(repo, ".claude/settings.json"), originalSettings + "\n");

      const res = spawnSync(
        "/bin/bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        {
          cwd: ROOT,
          encoding: "utf-8",
          env: {
            ...process.env,
            PROJECT_INITIALIZER_JQ_BIN: "/nonexistent/jq",
          },
        }
      );

      expect(res.status).toBe(0);
      const settings = JSON.parse(readFileSync(join(repo, ".claude/settings.json"), "utf-8"));
      expect(settings.permissions.allow).toContain("Bash(git status)");
      expect(settings.hooks).toBeUndefined();
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);
});
