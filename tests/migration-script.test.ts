import { describe, test, expect } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const MIGRATION_INTEGRATION_TIMEOUT = 60000;
const REFERENCE_STUB_MARKER = "<!-- repo-harness: reference-config-stub v1 -->";

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

function expectReferenceConfigStub(repo: string, docId: string): void {
  const content = readFileSync(join(repo, "docs/reference-configs", `${docId}.md`), "utf-8");
  expect(content).toContain(REFERENCE_STUB_MARKER);
  expect(content).toContain(`> **Doc ID**: ${docId}`);
  expect(content).toContain(`repo-harness docs path ${docId}`);
  expect(content).toContain(`repo-harness docs show ${docId}`);
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

  test("generated migration wrapper should support repo-harness roots without retired alias paths", () => {
    const wrapper = read("assets/templates/helpers/migrate-project-template.sh");
    expect(wrapper).toContain("AGENTIC_DEV_ROOT");
    expect(wrapper).toContain("AGENTIC_DEV_SKILL_ROOT");
    expect(wrapper).toContain("Projects/repo-harness");
    expect(wrapper).toContain(".codex/skills/repo-harness");
    expect(wrapper).toContain(".claude/skills/repo-harness");
    expect(wrapper).not.toContain(".codex/skills/repo-harness-skill");
    expect(wrapper).not.toContain(".claude/skills/repo-harness-skill");
    expect(wrapper).not.toContain(".agents/skills/repo-harness-skill");
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
    expect(script).toContain("docs/researches");
    expect(script).toContain("tasks/todos.md");
    expect(script).toContain("tasks/lessons.md");
    expect(script).toContain("tasks/reviews");
    expect(script).toContain("tasks/notes");
    expect(script).toContain(".ai/context");
    expect(script).toContain(".ai/harness/checks/latest.json");
    expect(script).toContain(".ai/harness/policy.json");
    expect(script).toContain(".ai/harness/brain-manifest.json");
    expect(script).toContain(".ai/harness/events.jsonl");
    expect(script).toContain(".ai/harness/handoff/current.md");
    expect(script).not.toContain(".ai/harness/context-budget");
    expect(sharedLib).toContain(".ai/harness/planning/");
    expect(script).toContain(".ai/harness/workflow-contract.json");
    expect(workflowContract).toContain("new-spec.sh");
    expect(workflowContract).toContain("new-sprint.sh");
    expect(workflowContract).toContain("new-plan.sh");
    expect(workflowContract).toContain("capture-plan.sh");
    expect(workflowContract).toContain("plan-to-todo.sh");
    expect(workflowContract).toContain("contract-run.ts");
    expect(workflowContract).toContain("contract-worktree.sh");
    expect(workflowContract).toContain("archive-workflow.sh");
    expect(workflowContract).toContain("refresh-current-status.sh");
    expect(workflowContract).toContain("prepare-handoff.sh");
    expect(workflowContract).toContain("verify-contract.sh");
    expect(workflowContract).toContain("summarize-failures.sh");
    expect(workflowContract).toContain("verify-sprint.sh");
    expect(workflowContract).toContain("check-task-sync.sh");
    expect(workflowContract).toContain("check-deploy-sql-order.sh");
    expect(workflowContract).toContain("check-agent-tooling.sh");
    expect(workflowContract).toContain("check-context-files.sh");
    expect(workflowContract).toContain("check-brain-manifest.sh");
    expect(workflowContract).toContain("check-architecture-sync.sh");
    expect(workflowContract).toContain("sync-brain-docs.sh");
    expect(workflowContract).toContain("ensure-task-workflow.sh");
    expect(workflowContract).toContain("check-task-workflow.sh");
    expect(workflowContract).toContain("maintenance-triage.sh");
    expect(workflowContract).toContain("heartbeat-triage.sh");
    expect(workflowContract).not.toContain("context-budget.ts");
    expect(workflowContract).toContain("capability-resolver.ts");
    expect(workflowContract).toContain("architecture-event.ts");
    expect(workflowContract).toContain("capability-config.ts");
    expect(workflowContract).toContain("architecture-queue.sh");
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
    expect(script).toContain("pi_workflow_contract_upgrade_action_entries");
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
      expect(
        res.stdout.includes("Advisory report (dry-run snapshot)") ||
          res.stdout.includes("Advisory report: detector failed (non-fatal)")
      ).toBe(true);
      expect(res.stdout).toContain("upgrade_plan:");
      expect(res.stdout).toContain("Upgrade/reconfigure/cleanup plan");
      expect(res.stdout).toContain("Host hook adapters are user-level:");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30000);

  test("should refuse to migrate HOME as a repo target", () => {
    const tmp = mkdtempSync(join(tmpdir(), "migration-home-guard-"));
    const home = join(tmp, "home");
    try {
      mkdirSync(home, { recursive: true });
      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", home, "--dry-run"],
        { cwd: ROOT, encoding: "utf-8", env: { ...process.env, HOME: home } }
      );

      expect(res.status).toBe(2);
      expect(res.stderr).toContain("Refusing to migrate HOME as a repo target");
      expect(existsSync(join(home, ".ai"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("apply mode treats repo paths as argv and does not evaluate shell metacharacters", () => {
    const tmp = mkdtempSync(join(tmpdir(), "migration-shell-safe-"));
    const marker = join(tmp, "pwned");
    const repo = join(tmp, `repo-\$(touch ${marker})`);
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(marker)).toBe(false);
      expect(existsSync(join(repo, ".ai", "harness", "workflow-contract.json"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("apply mode refreshes Codex handoff before strict workflow verification", () => {
    const tmp = mkdtempSync(join(tmpdir(), "migration-handoff-refresh-"));
    const repo = join(tmp, "repo");
    const home = join(tmp, "home");
    const codexHome = join(tmp, "codex-home");
    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      mkdirSync(join(repo, ".ai", "harness", "handoff"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, ".ai", "harness", "handoff", "current.md"), "# Harness Handoff\n\nnewer\n");
      writeFileSync(join(repo, ".ai", "harness", "handoff", "resume.md"), "# Codex Resume Packet\n\nolder\n");
      utimesSync(
        join(repo, ".ai", "harness", "handoff", "resume.md"),
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-01-01T00:00:00Z"),
      );
      utimesSync(
        join(repo, ".ai", "harness", "handoff", "current.md"),
        new Date("2026-01-02T00:00:00Z"),
        new Date("2026-01-02T00:00:00Z"),
      );

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        {
          cwd: ROOT,
          encoding: "utf-8",
          env: { ...process.env, HOME: home, CODEX_HOME: codexHome },
        },
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Refreshed Codex handoff before workflow verify");
      expect(res.stdout).toContain("[workflow] OK");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

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
      expect(existsSync(join(repo, ".ai/harness/context-budget/latest.json"))).toBe(false);
      expect(existsSync(join(repo, ".ai/harness/planning"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/workflow-contract.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/brain-manifest.json"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/runs/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "scripts/sprint-backlog.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/capability-resolver.ts"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/worktrees/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, ".ai/harness/triage/.gitkeep"))).toBe(true);
      expect(existsSync(join(repo, "plans/prds"))).toBe(true);
      expect(existsSync(join(repo, "plans/sprints"))).toBe(true);
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
      expect(existsSync(join(repo, "scripts/contract-run.ts"))).toBe(true);
      expect(existsSync(join(repo, "scripts/contract-worktree.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/archive-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/refresh-current-status.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/prepare-handoff.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/verify-contract.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/summarize-failures.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/verify-sprint.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-task-sync.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-deploy-sql-order.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/check-architecture-sync.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/architecture-queue.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/architecture-drift.sh"))).toBe(false);
      for (const helper of [
        "check-agent-tooling.sh",
        "check-context-files.sh",
        "check-brain-manifest.sh",
        "sync-brain-docs.sh",
        "ensure-task-workflow.sh",
        "check-task-workflow.sh",
        "maintenance-triage.sh",
        "heartbeat-triage.sh",
        "workflow-contract.ts",
        "inspect-project-state.ts",
        "migrate-workflow-docs.ts",
        "check-skill-version.ts",
        "migrate-project-template.sh",
        "capability-config.ts",
        "prepare-codex-handoff.sh",
        "codex-handoff-resume.sh",
      ]) {
        expect(existsSync(join(repo, ".ai/harness/scripts", helper))).toBe(false);
        expect(existsSync(join(repo, "scripts", helper))).toBe(true);
      }

      expect(existsSync(join(repo, "scripts/context-budget.ts"))).toBe(false);
      expect(existsSync(join(repo, "scripts/context-budget.ts"))).toBe(false);
      expect(readFileSync(join(repo, "scripts/sprint-backlog.sh"), "utf-8")).toContain(
        "repo-harness run sprint-backlog"
      );
      expect(existsSync(join(repo, "scripts/skill-factory-create.sh"))).toBe(false);
      expect(existsSync(join(repo, "scripts/skill-factory-check.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/README.md"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/post-edit-guard.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/session-start-context.sh"))).toBe(false);
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
      expect(existsSync(join(repo, "docs/researches/README.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/todos.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/lessons.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/contracts"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/handoff-protocol.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/harness-overview.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/document-generation.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/agentic-development-flow.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/external-tooling.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/sprint-contracts.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/heartbeat-triage.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/reference-configs/global-working-rules.md"))).toBe(true);
      expectReferenceConfigStub(repo, "harness-overview");
      expectReferenceConfigStub(repo, "agentic-development-flow");
      expectReferenceConfigStub(repo, "external-tooling");
      expect(existsSync(join(repo, "docs/reference-configs/spa-day-protocol.md"))).toBe(false);
      expect(existsSync(join(repo, "docs/reference-configs/hook-operations.md"))).toBe(false);
      const architectureIndex = readFileSync(join(repo, "docs/architecture/index.md"), "utf-8");
      expect(architectureIndex).toContain("<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->");
      expect(architectureIndex).toContain("- (none)");
      expect(architectureIndex).toContain("<!-- END ARCHITECTURE PENDING REQUESTS -->");
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
      expect(policy.external_tooling.readiness_gate).toBe("repo-harness run check-agent-tooling --host codex --strict-readiness");
      expect(policy.external_tooling.waza.primary_host).toBe("codex");
      expect(policy.external_tooling.waza.sync_mode).toBe("stage-upstream-then-copy-to-codex");
      expect(policy.external_tooling.codex_automation_profile.required_skills).toEqual(["health", "check", "mermaid"]);
      expect(policy.external_tooling.codex_automation_profile.mode).toBe("codex-runtime-reference");
      expect(policy.external_tooling.codex_automation_profile.routes.architecture_diagram).toBe("mermaid");
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
      expect(policy.context_budget).toBeUndefined();
      expect(policy.handoff_resume.resume_packet_file).toBe(".ai/harness/handoff/resume.md");
      expect(policy.planning.pending_orchestration_file).toBe(".ai/harness/planning/pending.json");
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
      expect(policy.documentation.reference_source).toBe("user-level-runtime-docs");
      expect(policy.documentation.reference_stub_marker).toBe(REFERENCE_STUB_MARKER);
      expect(policy.documentation.reference_resolver).toBe("repo-harness docs path <doc-id>");
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
      expect(policy.harness.helper_runtime_dir).toBe(".ai/harness/scripts");
      expect(policy.harness.helper_compat_dir).toBe("scripts");
      expect(policy.harness.helper_source).toBe("package");
      expect(policy.sprints.helper_script).toBe("scripts/sprint-backlog.sh");
      expect(policy.upgrade.cleanup.remove_only_ownership).toBe("known_generated");
      expect(policy.upgrade.action_classes.preserve).toContain("user-authored hooks");
      const workflowContract = JSON.parse(readFileSync(join(repo, ".ai/harness/workflow-contract.json"), "utf-8"));
      expect(workflowContract.helpers.runtimeDirectory).toBe("package:assets/templates/helpers");
      expect(workflowContract.helpers.runtimeSource).toBe("package");
      expect(workflowContract.helpers.compatibilityDirectory).toBe("scripts");
      expect(workflowContract.documentation.referenceConfigs.source).toBe("user-level-runtime-docs");
      expect(workflowContract.documentation.referenceConfigs.repoStubDirectory).toBe("docs/reference-configs");
      expect(workflowContract.documentation.referenceConfigs.resolverCommand).toBe("repo-harness docs path <doc-id>");
      expect(workflowContract.documentation.referenceConfigs.stubMarker).toBe(REFERENCE_STUB_MARKER);
      expect(workflowContract.helpers.scripts).toContain("check-agent-tooling.sh");
      expect(workflowContract.helpers.scripts).toContain("check-brain-manifest.sh");
      expect(workflowContract.helpers.scripts).toContain("sync-brain-docs.sh");
      expect(workflowContract.helpers.scripts).toContain("check-deploy-sql-order.sh");
      expect(workflowContract.helpers.scripts).toContain("check-architecture-sync.sh");
      expect(workflowContract.helpers.scripts).toContain("switch-plan.sh");
      expect(workflowContract.helpers.scripts).toContain("contract-worktree.sh");
      expect(workflowContract.helpers.scripts).toContain("contract-run.ts");
      expect(workflowContract.helpers.scripts).toContain("ship-worktrees.sh");
      expect(workflowContract.helpers.scripts).toContain("refresh-current-status.sh");
      expect(workflowContract.helpers.scripts).toContain("check-context-files.sh");
      expect(workflowContract.helpers.scripts).toContain("maintenance-triage.sh");
      expect(workflowContract.helpers.scripts).toContain("heartbeat-triage.sh");
      expect(workflowContract.helpers.scripts).not.toContain("context-budget.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-resolver.ts");
      expect(workflowContract.helpers.scripts).toContain("architecture-event.ts");
      expect(workflowContract.helpers.scripts).toContain("capability-config.ts");
      expect(workflowContract.helpers.scripts).toContain("archive-architecture-request.sh");
      expect(workflowContract.helpers.scripts).toContain("workstream-sync.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/contract-worktree.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/contract-run.ts");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/ship-worktrees.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/heartbeat-triage.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/refresh-current-status.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("tasks/current.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("plans/prds");
      expect(workflowContract.artifacts.requiredDirectories).toContain("plans/sprints");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
      expect(workflowContract.artifacts.requiredDirectories).toContain(".ai/harness/planning");
      expect(workflowContract.artifacts.requiredDirectories).not.toContain(".ai/harness/scripts");
      expect(workflowContract.artifacts.requiredDirectories).toContain("scripts");
      expect(workflowContract.artifacts.requiredDirectories).toContain("deploy/sql");
      expect(workflowContract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
      expect(workflowContract.artifacts.requiredFiles).toContain(".ai/harness/brain-manifest.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".claude/settings.json");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
      expect(workflowContract.artifacts.requiredFiles).toContain("scripts/sync-brain-docs.sh");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/document-generation.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
      expect(workflowContract.artifacts.requiredFiles).toContain("docs/reference-configs/heartbeat-triage.md");
      expect(workflowContract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/notes");
      expect(workflowContract.artifacts.requiredDirectories).toContain("tasks/workstreams");
      expect(workflowContract.agenticDevelopment.routing.designPlan).toBe("gstack:plan-design-review");
      expect(workflowContract.artifacts.requiredFiles).not.toContain(".ai/harness/checks/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/checks/latest.json");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-plan");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/planning/");
      expect(workflowContract.artifacts.runtimeFiles).toContain(".ai/harness/triage/inbox.md");
      expect(workflowContract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");

      const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf-8"));
      expect(pkg.scripts["check:brain-manifest"]).toBe("repo-harness run check-brain-manifest");
      expect(pkg.scripts["check:context-files"]).toBe("repo-harness run check-context-files");
      expect(pkg.scripts["check:deploy-sql"]).toBe("repo-harness run check-deploy-sql-order");
      expect(pkg.scripts["check:architecture-sync"]).toBe("repo-harness run check-architecture-sync");
      expect(pkg.scripts["check:task-sync"]).toBe("repo-harness run check-task-sync");
      expect(pkg.scripts["check:task-workflow"]).toBe("repo-harness run check-task-workflow --strict");
      expect(pkg.scripts["sync:brain-docs"]).toBe("repo-harness run sync-brain-docs --all");

      const gitignore = readFileSync(join(repo, ".gitignore"), "utf-8");
      expect(gitignore).toContain("# BEGIN: claude-runtime-temp (managed by repo-harness)");
      expect(gitignore).toContain(".ai/harness/active-plan");
      expect(gitignore).toContain(".ai/harness/active-worktree");
      expect(gitignore).toContain("tasks/.current.md.tmp.*");
      expect(gitignore).toContain(".ai/harness/planning/");
      expect(gitignore).toContain("!.ai/harness/planning/.gitkeep");
      expect(gitignore).toContain(".claude/.active-plan");
      expect(gitignore).toContain(".claude/.plan-state/");
      expect(gitignore).toContain(".claude/.trace.jsonl");
      expect(gitignore).toContain(".claude/.codegraph-state/");
      expect(gitignore).toContain(".ai/harness/chatgpt/bridge-extension/");
      expect(gitignore).toContain(".repo-harness/chatgpt-browser.local.json");
      expect(gitignore).toContain(".codex/*");
      expect(gitignore).not.toContain("!.codex/hooks.json");
      expect(gitignore).toContain("_ref/");
      expect(gitignore).toContain(".codegraph/");
      expect(gitignore).toContain("_ops/");
      expect(gitignore).not.toContain("_ops/secrets/");
      expect(gitignore).not.toContain("!_ops/env/.env.example");
      expect(gitignore).toContain("# repo-harness generated helper wrappers");
      expect(gitignore).toContain("scripts/check-task-workflow.sh");
      expect(gitignore).toContain("scripts/prepare-codex-handoff.sh");
      expect(gitignore).toContain("scripts/repo-harness/");
      expect(gitignore).not.toContain("tasks/notes");
      expect(gitignore).not.toContain("docs/researches");
      expect(res.stdout).toContain("--- External Tooling ---");
      expect(res.stdout).toContain("External Tooling Report");
      expect(res.stdout).toContain("Host hook adapters are user-level:");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30000);

  test("should ignore and untrack generated helper wrappers while preserving app-owned scripts", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-helper-ignore-"));
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "scripts/check-task-workflow.sh"), "#!/bin/bash\nexit 0\n");
      writeFileSync(
        join(repo, "scripts/prepare-codex-handoff.sh"),
        "#!/bin/bash\n# repo-harness generated Codex handoff helper\nexit 0\n"
      );

      expect(spawnSync("git", ["init", "-q"], { cwd: repo }).status).toBe(0);
      expect(
        spawnSync("git", ["add", "package.json", "scripts/check-task-workflow.sh", "scripts/prepare-codex-handoff.sh"], {
          cwd: repo,
        }).status
      ).toBe(0);

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "scripts/check-task-workflow.sh"))).toBe(true);
      expect(existsSync(join(repo, "scripts/prepare-codex-handoff.sh"))).toBe(true);
      expect(
        spawnSync("git", ["ls-files", "--error-unmatch", "scripts/check-task-workflow.sh"], { cwd: repo }).status
      ).toBe(0);
      expect(
        spawnSync("git", ["ls-files", "--error-unmatch", "scripts/prepare-codex-handoff.sh"], { cwd: repo }).status
      ).not.toBe(0);
      expect(spawnSync("git", ["check-ignore", "scripts/prepare-codex-handoff.sh"], { cwd: repo }).status).toBe(0);

      const gitignore = readFileSync(join(repo, ".gitignore"), "utf-8");
      expect(gitignore).toContain("scripts/prepare-codex-handoff.sh");
      expect(gitignore).toContain("scripts/repo-harness/");
      expect(gitignore).not.toContain("tasks/notes");
      expect(gitignore).not.toContain("docs/researches");
      expect(res.stdout).toContain("Preserved tracked app-owned script: scripts/check-task-workflow.sh");
      expect(res.stdout).toContain("Untracked generated helper wrapper: scripts/prepare-codex-handoff.sh");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should replace managed reference docs with stubs while preserving custom docs", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-reference-stubs-"));
    try {
      mkdirSync(join(repo, "docs/reference-configs"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "docs/reference-configs/harness-overview.md"), "# Harness Overview\n\nOld copied prose.\n");
      writeFileSync(join(repo, "docs/reference-configs/external-tooling.md"), "# Project Tooling\n\nKeep this project-specific tooling note.\n");

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expectReferenceConfigStub(repo, "harness-overview");
      const customDoc = readFileSync(join(repo, "docs/reference-configs/external-tooling.md"), "utf-8");
      expect(customDoc).toContain("# Project Tooling");
      expect(customDoc).not.toContain(REFERENCE_STUB_MARKER);
      expect(res.stdout).toContain("preserved user-authored reference config: docs/reference-configs/external-tooling.md");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30000);

  test("should prune vendored context files and mirror only project-owned context blocks", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-context-prune-"));
    const readOnlyModule = join(repo, "go/pkg/mod/github.com/clipperhouse/displaywidth@v0.6.1");
    try {
      mkdirSync(join(repo, "apps/web"), { recursive: true });
      mkdirSync(readOnlyModule, { recursive: true });
      mkdirSync(join(repo, "packages/api/vendor/tooling"), { recursive: true });
      mkdirSync(join(repo, "node_modules/fixture"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "apps/web/AGENTS.md"), "# Web App\n");
      writeFileSync(join(readOnlyModule, "AGENTS.md"), "# Vendored Go Module\n");
      writeFileSync(join(repo, "packages/api/vendor/tooling/AGENTS.md"), "# Vendored Tool\n");
      writeFileSync(join(repo, "node_modules/fixture/AGENTS.md"), "# Node Module\n");
      chmodSync(readOnlyModule, 0o555);

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(readFileSync(join(repo, "apps/web/CLAUDE.md"), "utf-8")).toContain("# Web App");
      expect(existsSync(join(readOnlyModule, "CLAUDE.md"))).toBe(false);
      expect(existsSync(join(repo, "packages/api/vendor/tooling/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(repo, "node_modules/fixture/CLAUDE.md"))).toBe(false);
    } finally {
      if (existsSync(readOnlyModule)) chmodSync(readOnlyModule, 0o755);
      rmSync(repo, { recursive: true, force: true });
    }
  }, 30000);

  test("should keep full vendored hook runtime for repos that pin hook_source repo", () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-harness-migrate-hooks-"));
    try {
      mkdirSync(join(repo, ".ai/harness"), { recursive: true });
      writeFileSync(join(repo, ".ai/harness/policy.json"), '{ "hook_source": "repo" }\n');

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, ".ai/hooks/run-hook.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/post-edit-guard.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/post-tool-observer.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should prune stale repo-local hook runtime for non-pinned repos during migration", () => {
    const repo = mkdtempSync(join(tmpdir(), "repo-harness-migrate-hook-prune-"));
    try {
      mkdirSync(join(repo, ".ai/hooks/lib"), { recursive: true });
      writeFileSync(join(repo, ".ai/hooks/run-hook.sh"), "#!/bin/bash\necho stale\n");
      writeFileSync(join(repo, ".ai/hooks/prompt-guard.sh"), "#!/bin/bash\necho stale\n");
      writeFileSync(join(repo, ".ai/hooks/post-edit-guard.sh"), "#!/bin/bash\necho stale\n");
      writeFileSync(join(repo, ".ai/hooks/CLAUDE.md"), "# Stale hook docs\n");
      writeFileSync(join(repo, ".ai/hooks/codex.hooks.template.json"), "{}\n");

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, ".ai/hooks/README.md"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(repo, ".ai/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/prompt-guard.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/post-edit-guard.sh"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/CLAUDE.md"))).toBe(false);
      expect(existsSync(join(repo, ".ai/hooks/codex.hooks.template.json"))).toBe(false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

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
      mkdirSync(join(repo, "assets/templates/helpers"), { recursive: true });
      mkdirSync(join(repo, ".claude"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "scripts/skill-factory-create.sh"), "#!/bin/bash\n# repo-harness legacy skill-factory helper\necho create\n");
      writeFileSync(join(repo, "scripts/skill-factory-check.sh"), "#!/bin/bash\n# repo-harness legacy skill-factory helper\necho check\n");
      writeFileSync(join(repo, "scripts/architecture-drift.sh"), "#!/bin/bash\n# repo-harness legacy ArchitectureDrift helper\necho drift\n");
      writeFileSync(join(repo, "assets/templates/helpers/architecture-drift.sh"), "#!/bin/bash\necho drift\n");
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
      expect(existsSync(join(repo, "scripts/architecture-drift.sh"))).toBe(false);
      expect(existsSync(join(repo, "assets/templates/helpers/architecture-drift.sh"))).toBe(false);
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

  test("should remove generated legacy root helpers while preserving app-owned scripts", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-root-helper-cleanup-"));
    try {
      mkdirSync(join(repo, "scripts"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));
      writeFileSync(join(repo, "scripts/new-plan.sh"), readFileSync(join(ROOT, "assets/templates/helpers/new-plan.sh"), "utf-8"));
      writeFileSync(join(repo, "scripts/check-task-workflow.sh"), "#!/bin/bash\necho app-owned workflow check\n");

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "scripts/new-plan.sh"))).toBe(true);
      expect(readFileSync(join(repo, "scripts/new-plan.sh"), "utf-8")).toContain(
        "repo-harness run new-plan"
      );
      expect(existsSync(join(repo, "scripts/check-task-workflow.sh"))).toBe(true);
      expect(readFileSync(join(repo, "scripts/check-task-workflow.sh"), "utf-8")).toContain("app-owned workflow check");
      expect(res.stdout).toContain("Removed generated legacy root helper: scripts/new-plan.sh");
      expect(res.stdout).toContain("Preserved possible app-owned script: scripts/check-task-workflow.sh");
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
      expect(policy.external_tooling.codex_automation_profile.required_skills).toEqual(["health", "check", "mermaid"]);
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

  test("should migrate partial tasks-first repos that still have a legacy tasks/todo.md", () => {
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
      expect(existsSync(join(repo, "tasks/todo.md.migrated.bak"))).toBe(true);

      const todo = readFileSync(join(repo, "tasks/todos.md"), "utf-8");
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

  test("should migrate legacy sprint files into the sprint catalog", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-sprint-prds-"));
    try {
      mkdirSync(join(repo, "tasks/sprints"), { recursive: true });
      mkdirSync(join(repo, ".ai/harness/sprint"), { recursive: true });
      writeFileSync(join(repo, "tasks/sprints/demo.sprint.md"), "# Sprint: Demo\n\n> **Status**: Draft\n");
      writeFileSync(join(repo, ".ai/harness/sprint/active-sprint"), "tasks/sprints/demo.sprint.md\n");
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "plans/sprints/demo.sprint.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/sprints/demo.sprint.md"))).toBe(false);
      expect(readFileSync(join(repo, ".ai/harness/sprint/active-sprint"), "utf-8").trim()).toBe(
        "plans/sprints/demo.sprint.md"
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }, MIGRATION_INTEGRATION_TIMEOUT);

  test("should migrate sprint-shaped files out of the PRD catalog", () => {
    const repo = mkdtempSync(join(tmpdir(), "migration-sprint-catalog-"));
    try {
      mkdirSync(join(repo, "plans/prds"), { recursive: true });
      mkdirSync(join(repo, ".ai/harness/sprint"), { recursive: true });
      writeFileSync(
        join(repo, "plans/prds/remaining-work.prd.md"),
        "# Sprint: Remaining Work\n\n> **Status**: Draft\n\n## PRD\n\n- Real sprint source.\n\n## Backlog\n\n| # | Status | Task | Mode | Acceptance | Plan |\n|---|--------|------|------|------------|------|\n| 1 | [ ] | task-a | contract | Checkable acceptance | (pending) |\n"
      );
      writeFileSync(
        join(repo, "plans/prds/20260101-0000-product.prd.md"),
        "# PRD: Product\n\n> **Status**: Draft\n\nProduct direction only.\n"
      );
      writeFileSync(join(repo, ".ai/harness/sprint/active-sprint"), "plans/prds/remaining-work.prd.md\n");
      writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "demo", scripts: {} }, null, 2));

      const res = spawnSync(
        "bash",
        ["scripts/migrate-project-template.sh", "--repo", repo, "--apply"],
        { cwd: ROOT, encoding: "utf-8" }
      );

      expect(res.status).toBe(0);
      expect(existsSync(join(repo, "plans/sprints/remaining-work.sprint.md"))).toBe(true);
      expect(existsSync(join(repo, "plans/prds/remaining-work.prd.md"))).toBe(false);
      expect(existsSync(join(repo, "plans/prds/20260101-0000-product.prd.md"))).toBe(true);
      expect(readFileSync(join(repo, ".ai/harness/sprint/active-sprint"), "utf-8").trim()).toBe(
        "plans/sprints/remaining-work.sprint.md"
      );
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
          "# BEGIN: claude-runtime-temp (managed by repo-harness)",
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
      expect(gitignore).toContain("# BEGIN: claude-runtime-temp (managed by repo-harness)");
      expect(gitignore).toContain(".claude/.task-state.json");
      expect(gitignore).toContain(".ai/harness/active-plan");
      expect(gitignore).toContain(".ai/harness/active-worktree");
      expect(gitignore).toContain("tasks/.current.md.tmp.*");
      expect(gitignore).toContain(".ai/harness/planning/");
      expect(gitignore).toContain("!.ai/harness/planning/.gitkeep");
      expect(gitignore).toContain(".claude/.active-plan");
      expect(gitignore).toContain(".claude/.plan-state/");
      expect(gitignore).toContain(".claude/.trace.jsonl");
      expect(gitignore).toContain(".claude/.codegraph-state/");
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
            REPO_HARNESS_JQ_BIN: "/nonexistent/jq",
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
