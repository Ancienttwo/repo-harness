import { describe, test, expect } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { spawnSync } from "child_process";
import { inspectRepo } from "../scripts/inspect-project-state";
import { migrate } from "../scripts/migrate-workflow-docs";
import { loadWorkflowContract } from "../scripts/workflow-contract";

const ROOT = join(import.meta.dir, "..");

function collectFiles(root: string, current = root): string[] {
  const entries = readdirSync(current).sort();
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(current, entry);
    const relPath = `./${relative(root, fullPath)}`.replaceAll("\\", "/");
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectFiles(root, fullPath));
      continue;
    }
    files.push(relPath);
  }

  return files;
}

describe("workflow contract manifest", () => {
  test("self-hosted runtime manifest should match the asset contract", () => {
    const asset = readFileSync(join(ROOT, "assets/workflow-contract.v1.json"), "utf-8");
    const runtime = readFileSync(join(ROOT, ".ai/harness/workflow-contract.json"), "utf-8");
    expect(runtime).toBe(asset);
  });

  test("hook asset files should stay in parity with self-hosted .ai/hooks", () => {
    const assetFiles = collectFiles(join(ROOT, "assets/hooks")).filter((file) => !["./settings.template.json", "./codex.hooks.template.json"].includes(file));
    const allRuntimeFiles = collectFiles(join(ROOT, ".ai/hooks"));

    expect(allRuntimeFiles).toEqual(assetFiles);

    for (const relPath of allRuntimeFiles) {
      const assetContent = readFileSync(join(ROOT, "assets/hooks", relPath.slice(2)), "utf-8");
      const runtimeContent = readFileSync(join(ROOT, ".ai/hooks", relPath.slice(2)), "utf-8");
      expect(runtimeContent).toBe(assetContent);
    }
  });

  test("helper inventory should come from the workflow contract", () => {
    const contract = loadWorkflowContract(join(ROOT, "assets/workflow-contract.v1.json"));
    expect(contract.helpers.runtimeDirectory).toBe("package:assets/templates/helpers");
    expect(contract.helpers.runtimeSource).toBe("package");
    expect(contract.helpers.compatibilityDirectory).toBe("scripts");
    expect(contract.helpers.scripts).toContain("contract-worktree.sh");
    expect(contract.helpers.scripts).toContain("contract-run.ts");
    expect(contract.helpers.scripts).toContain("ship-worktrees.sh");
    expect(contract.helpers.scripts).toContain("heartbeat-triage.sh");
    expect(contract.helpers.scripts).toContain("capture-plan.sh");
    expect(contract.helpers.scripts).toContain("switch-plan.sh");
    expect(contract.helpers.scripts).not.toContain("context-budget.ts");
    expect(contract.helpers.scripts).toContain("capability-resolver.ts");
    expect(contract.helpers.scripts).toContain("architecture-event.ts");
    expect(contract.helpers.scripts).toContain("capability-config.ts");
    expect(contract.helpers.scripts).toContain("architecture-queue.sh");
    expect(contract.helpers.scripts).toContain("archive-architecture-request.sh");
    expect(contract.helpers.scripts).toContain("context-contract-sync.sh");
    expect(contract.helpers.scripts).toContain("workstream-sync.sh");
    expect(contract.helpers.scripts).toContain("refresh-current-status.sh");
    expect(contract.helpers.scripts).toContain("prepare-codex-handoff.sh");
    expect(contract.helpers.scripts).toContain("codex-handoff-resume.sh");
    expect(contract.helpers.scripts).toContain("select-agent-context-blocks.sh");
    expect(contract.helpers.scripts).toContain("check-brain-manifest.sh");
    expect(contract.helpers.scripts).toContain("sync-brain-docs.sh");
    expect(contract.helpers.scripts).toContain("check-deploy-sql-order.sh");
    expect(contract.helpers.scripts).toContain("check-architecture-sync.sh");
    expect(contract.externalTooling?.waza?.primaryHost).toBe("codex");
    expect(contract.externalTooling?.waza?.managedSkills).toContain("think");
    expect(contract.externalTooling?.codexAutomationProfile?.requiredSkills).toEqual(["health", "check", "mermaid"]);
    expect(contract.externalTooling?.codexAutomationProfile?.routes.architectureDiagram).toBe("mermaid");
    expect(contract.externalTooling?.codexAutomationProfile?.vendoringPolicy).toBe("do-not-vendor-skill-body");
    expect(contract.externalTooling?.diagramDesign?.skillName).toBe("mermaid");
    expect(contract.externalTooling?.diagramDesign?.vendoringPolicy).toBe("do-not-vendor");
    expect(contract.documentation?.referenceConfigs?.source).toBe("user-level-runtime-docs");
    expect(contract.documentation?.referenceConfigs?.repoStubDirectory).toBe("docs/reference-configs");
    expect(contract.documentation?.referenceConfigs?.packageDirectory).toBe("assets/reference-configs");
    expect(contract.documentation?.referenceConfigs?.resolverCommand).toBe("repo-harness docs path <doc-id>");
    expect(contract.documentation?.referenceConfigs?.stubMarker).toBe("<!-- repo-harness: reference-config-stub v1 -->");
    expect(contract.agenticDevelopment?.routing.complexEngineeringPlan).toBe("gstack:plan-eng-review");
    expect(contract.agenticDevelopment?.routing.bugOrRegression).toBe("waza:hunt");
    expect(contract.agenticDevelopment?.dueDiligence.levels).toContain("P2_DATA_FLOW_TRACE");
    expect(contract.documents.currentStatus).toBe("tasks/current.md");
    expect(contract.adoptionTemplates?.files?.spec.document).toBe("spec");
    expect(contract.adoptionTemplates?.files?.spec.lines.join("\n")).toContain("{{repoName}}");
    expect(contract.adoptionTemplates?.files?.currentStatus.document).toBe("currentStatus");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/workflow-contract.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/harness/brain-manifest.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capabilities.json");
    expect(contract.artifacts.requiredFiles).toContain(".ai/context/capability-source-map.json");
    expect(contract.artifacts.requiredFiles).toContain("scripts/capability-resolver.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/architecture-event.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/capability-config.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/contract-worktree.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/contract-run.ts");
    expect(contract.artifacts.requiredFiles).toContain("scripts/ship-worktrees.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/heartbeat-triage.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/capture-plan.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/refresh-current-status.sh");
    expect(contract.artifacts.requiredFiles).toContain("scripts/sync-brain-docs.sh");
    expect(contract.artifacts.requiredFiles).toContain("tasks/current.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/architecture/index.md");
    expect(contract.artifacts.requiredFiles).toContain(".claude/templates/implementation-notes.template.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".claude/settings.json");
    expect(contract.artifacts.requiredFiles).not.toContain(".codex/hooks.json");
    expect(contract.artifacts.requiredDirectories).not.toContain(".codex");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/notes");
    expect(contract.artifacts.requiredDirectories).toContain("tasks/workstreams");
    expect(contract.artifacts.requiredDirectories).toContain("docs/architecture/domains");
    expect(contract.artifacts.requiredDirectories).toContain("docs/architecture/modules");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/worktrees");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/triage");
    expect(contract.artifacts.requiredDirectories).toContain(".ai/harness/planning");
    expect(contract.artifacts.requiredDirectories).not.toContain(".ai/harness/scripts");
    expect(contract.artifacts.requiredDirectories).toContain("scripts");
    expect(contract.artifacts.requiredDirectories).toContain("deploy/scripts");
    expect(contract.artifacts.requiredDirectories).toContain("deploy/submissions");
    expect(contract.artifacts.requiredDirectories).toContain("deploy/sql");
    expect(contract.artifacts.requiredFiles).toContain("deploy/README.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/agentic-development-flow.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/global-working-rules.md");
    expect(contract.artifacts.requiredFiles).toContain("docs/reference-configs/heartbeat-triage.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.requiredFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/handoff/resume.md");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/context-budget/latest.json");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/capability-context/");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/planning/");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/checks/latest.json");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/architecture/events.jsonl");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/active-plan");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/active-worktree");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/worktrees/");
    expect(contract.artifacts.runtimeFiles).toContain(".ai/harness/triage/inbox.md");
    expect(contract.artifacts.runtimeFiles).not.toContain(".ai/harness/workstreams/events.jsonl");
    expect(contract.migrations.upgrade?.strategyVersion).toBe(1);
    expect(contract.migrations.upgrade?.actionClasses).toContain("reconfigure");
    expect(contract.migrations.upgrade?.safety.removeOnlyOwnership).toBe("known_generated");
    expect(contract.migrations.upgrade?.actions.some((action) => action.action === "remove" && action.ownership === "known_generated")).toBe(true);
    const retiredDrift = contract.migrations.upgrade?.actions.find((action) => action.id === "legacy-architecture-drift-helper");
    expect(retiredDrift?.action).toBe("remove");
    expect(retiredDrift?.ownership).toBe("known_generated");
    expect(retiredDrift?.paths).toContain("assets/templates/helpers/architecture-drift.sh");
    const legacyRootHelpers = contract.migrations.upgrade?.actions.find((action) => action.id === "legacy-root-helper-runtime");
    expect(legacyRootHelpers?.action).toBe("remove");
    expect(legacyRootHelpers?.ownership).toBe("known_generated");
    expect(legacyRootHelpers?.cleanupMode).toBe("generated_helper");
    expect(legacyRootHelpers?.paths).toContain("scripts/architecture-drift.sh");
    expect(legacyRootHelpers?.paths).toContain("scripts/check-task-workflow.sh");
  });

  test("upstream skill root resolver prefers the canonical env var without retired alias surfaces", () => {
    const code = [
      'import { resolveAgenticDevRoot, resolveAgenticDevSkillRoot } from "./scripts/workflow-contract.ts";',
      'console.log(resolveAgenticDevRoot());',
      'console.log(resolveAgenticDevSkillRoot());',
    ].join("\n");
    const preferred = spawnSync("bun", ["-e", code], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        AGENTIC_DEV_ROOT: "/tmp/repo-harness-root",
        AGENTIC_DEV_SKILL_ROOT: "/tmp/agentic-dev-skill-root",
      },
    });
    expect(preferred.status).toBe(0);
    expect(preferred.stdout.trim().split("\n")).toEqual([
      "/tmp/repo-harness-root",
      "/tmp/repo-harness-root",
    ]);

    const skillRootOnly = spawnSync("bun", ["-e", code], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        AGENTIC_DEV_ROOT: "",
        AGENTIC_DEV_SKILL_ROOT: "/tmp/agentic-dev-skill-root",
      },
    });
    expect(skillRootOnly.status).toBe(0);
    expect(skillRootOnly.stdout.trim().split("\n")).toEqual([
      "/tmp/agentic-dev-skill-root",
      "/tmp/agentic-dev-skill-root",
    ]);

    const retiredLegacy = spawnSync("bun", ["-e", code], {
      cwd: ROOT,
      encoding: "utf-8",
      env: {
        ...process.env,
        AGENTIC_DEV_ROOT: "",
        AGENTIC_DEV_SKILL_ROOT: "",
        PROJECT_INITIALIZER_ROOT: "/tmp/project-initializer-root",
      },
    });
    expect(retiredLegacy.status).toBe(0);
    expect(retiredLegacy.stdout).not.toContain("/tmp/project-initializer-root");

    const resolverSource = readFileSync(join(ROOT, "scripts/workflow-contract.ts"), "utf-8");
    expect(resolverSource).not.toContain("repo-harness-skill");
    expect(resolverSource).not.toContain("resolveProjectInitializerRoot");
  });

  test("runtime harness artifacts should be ignored local state, not tracked deliverables", () => {
    const contract = loadWorkflowContract(join(ROOT, "assets/workflow-contract.v1.json"));
    const runtimeFiles = contract.artifacts.runtimeFiles ?? [];
    expect(runtimeFiles).toContain(".ai/harness/checks/latest.json");
    expect(runtimeFiles).toContain(".ai/harness/active-plan");
    expect(runtimeFiles).toContain(".ai/harness/active-worktree");
    expect(runtimeFiles).toContain(".ai/harness/archive/");
    expect(runtimeFiles).toContain(".ai/harness/planning/");
    const placeholderBackedRuntime = new Set([
      ".ai/harness/runs/.gitkeep",
      ".ai/harness/security/.gitkeep",
      ".ai/harness/triage/.gitkeep",
      ".ai/harness/worktrees/",
      ".ai/harness/planning/",
    ]);

    for (const file of runtimeFiles.filter((name) => !placeholderBackedRuntime.has(name))) {
      const tracked = spawnSync("git", ["ls-files", "--error-unmatch", file], {
        cwd: ROOT,
        encoding: "utf-8",
      });
      if (existsSync(join(ROOT, file))) {
        expect(tracked.status).not.toBe(0);
      } else {
        expect(existsSync(join(ROOT, file))).toBe(false);
      }
    }

    const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf-8");
    expect(gitignore).toContain("tasks/.current.md.tmp.*");
    expect(gitignore).toContain(".claude/.plan-state/");
    expect(gitignore).toContain(".ai/harness/checks/latest.json");
    expect(gitignore).toContain(".ai/harness/archive/");
    expect(gitignore).toContain(".ai/harness/handoff/current.md");
    expect(gitignore).toContain(".ai/harness/planning/");
    expect(gitignore).toContain("!.ai/harness/planning/.gitkeep");
    expect(gitignore).toContain(".ai/harness/worktrees/");
    expect(gitignore).toContain(".ai/harness/chatgpt/bridge-extension/");
    expect(gitignore).toContain(".repo-harness/chatgpt-browser.local.json");
    expect(gitignore).toContain(".ai/harness/triage/*");
    expect(gitignore).toContain("!.ai/harness/triage/.gitkeep");
  });
});

describe("state inspection and legacy doc migration", () => {
  test("inspector should classify pre-tasks-first drift", () => {
    const repo = mkdtempSync(join(tmpdir(), "inspect-project-state-"));

    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      writeFileSync(join(repo, "docs/TODO.md"), "- [ ] legacy task\n");
      writeFileSync(join(repo, "docs/plan.md"), "# legacy plan\n");
      writeFileSync(join(repo, "docs/PROGRESS.md"), "# Session Notes\n- [ ] ship it\n");

      const result = inspectRepo(repo);
      expect(result.mode).toBe("migrate");
      expect(result.legacy_contract_version).toBe("pre-tasks-first");
      expect(result.drift_signals).toContain("legacy-docs-plan");
      expect(result.drift_signals).toContain("legacy-docs-todo");
      expect(result.drift_signals).toContain("legacy-docs-progress");
      expect(result.upgrade_plan.map((item) => item.id)).toContain("legacy-docs-plan");
      expect(result.upgrade_plan.map((item) => item.action)).toContain("archive");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("inspector should produce an upgrade plan for current-v1 repos with stale managed config", () => {
    const repo = mkdtempSync(join(tmpdir(), "inspect-project-state-current-stale-"));

    try {
      mkdirSync(join(repo, "plans"), { recursive: true });
      mkdirSync(join(repo, "tasks"), { recursive: true });
      mkdirSync(join(repo, ".ai", "harness"), { recursive: true });
      mkdirSync(join(repo, ".claude", "hooks"), { recursive: true });
      const staleContract = JSON.parse(readFileSync(join(ROOT, "assets/workflow-contract.v1.json"), "utf-8"));
      delete staleContract.migrations.upgrade;
      writeFileSync(join(repo, ".ai", "harness", "workflow-contract.json"), JSON.stringify(staleContract, null, 2) + "\n");
      writeFileSync(join(repo, ".ai", "harness", "policy.json"), JSON.stringify({ version: 1 }, null, 2));
      writeFileSync(join(repo, ".claude", "hooks", "run-hook.sh"), "#!/bin/bash\necho generated\n");
      writeFileSync(join(repo, ".claude", "hooks", "custom-bash.sh"), "#!/bin/bash\necho custom\n");

      const result = inspectRepo(repo);
      expect(result.mode).toBe("audit");
      expect(result.legacy_contract_version).toBe("current-v1");
      expect(result.drift_signals).toContain("policy-missing-upgrade-strategy");
      expect(result.drift_signals).toContain("stale-generated-claude-hook-shims");
      expect(result.upgrade_plan.map((item) => item.id)).toContain("policy-upgrade-strategy-refresh");
      expect(result.upgrade_plan.map((item) => item.id)).toContain("legacy-claude-hook-shims");
      expect(result.upgrade_plan.map((item) => item.id)).toContain("custom-claude-hooks-preserve");
      expect(result.upgrade_plan.find((item) => item.id === "legacy-claude-hook-shims")?.ownership).toBe("known_generated");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("inspector should prefer audit over skill-factory for initialized repos", () => {
    const repo = mkdtempSync(join(tmpdir(), "inspect-project-state-audit-"));

    try {
      mkdirSync(join(repo, "plans"), { recursive: true });
      mkdirSync(join(repo, "tasks"), { recursive: true });
      mkdirSync(join(repo, ".claude", "skill-factory"), { recursive: true });

      const result = inspectRepo(repo);
      expect(result.mode).toBe("audit");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("legacy doc migrator should preserve content while normalizing workflow files", () => {
    const repo = mkdtempSync(join(tmpdir(), "migrate-workflow-docs-"));

    try {
      mkdirSync(join(repo, "docs"), { recursive: true });
      writeFileSync(join(repo, "docs/TODO.md"), "- [ ] port old checklist\n");
      writeFileSync(join(repo, "docs/plan.md"), "# Old Plan\n\nKeep the useful parts.\n");
      writeFileSync(join(repo, "docs/PROGRESS.md"), "# Session Notes\n\n- [ ] investigate drift\n");

      const summary = migrate(repo, "apply");
      expect(summary.migrated.length).toBeGreaterThanOrEqual(3);
      expect(existsSync(join(repo, "tasks/todos.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/researches/README.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/archive/legacy-docs-TODO.md"))).toBe(true);
      expect(existsSync(join(repo, "plans/archive/legacy-docs-plan.md"))).toBe(true);
      expect(existsSync(join(repo, "docs/TODO.md.migrated.bak"))).toBe(true);
      expect(existsSync(join(repo, "docs/plan.md.migrated.bak"))).toBe(true);

      const todo = readFileSync(join(repo, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("**Status**: Backlog");
      expect(todo).toContain("Revisit Trigger");

      const research = readFileSync(join(repo, "docs/researches/legacy-progress-import.md"), "utf-8");
      expect(research).toContain("Legacy Progress Import");
      expect(research).toContain("investigate drift");

      expect(existsSync(join(repo, "docs/PROGRESS.md"))).toBe(false);
      expect(existsSync(join(repo, "docs/PROGRESS.md.migrated.bak"))).toBe(true);
      expect(existsSync(join(repo, "tasks/archive/legacy-docs-PROGRESS.md"))).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("legacy doc migrator should normalize pre-existing tasks/todos.md", () => {
    const repo = mkdtempSync(join(tmpdir(), "migrate-workflow-docs-partial-"));

    try {
      mkdirSync(join(repo, "tasks"), { recursive: true });
      writeFileSync(join(repo, "tasks/todos.md"), "# Old Todo\n\n- [ ] existing task\n");

      const summary = migrate(repo, "apply");
      expect(summary.migrated.some((item) => item.source === "tasks/todos.md" && item.action === "rewrite")).toBe(true);
      expect(existsSync(join(repo, "tasks/archive/legacy-tasks-todo.md"))).toBe(true);

      const todo = readFileSync(join(repo, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("Review archived legacy checklist");
      expect(todo).not.toContain("existing task");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("legacy doc migrator should migrate pre-existing singular tasks/todo.md", () => {
    const repo = mkdtempSync(join(tmpdir(), "migrate-workflow-docs-singular-todo-"));

    try {
      mkdirSync(join(repo, "tasks"), { recursive: true });
      writeFileSync(join(repo, "tasks/todo.md"), "# Old Todo\n\n- [ ] existing task\n");

      const summary = migrate(repo, "apply");
      expect(summary.migrated.some((item) => item.source === "tasks/todo.md" && item.target === "tasks/todos.md")).toBe(true);
      expect(existsSync(join(repo, "tasks/archive/legacy-tasks-todo.md"))).toBe(true);
      expect(existsSync(join(repo, "tasks/todo.md.migrated.bak"))).toBe(true);

      const todo = readFileSync(join(repo, "tasks/todos.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("Review archived legacy checklist");
      expect(todo).not.toContain("existing task");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
