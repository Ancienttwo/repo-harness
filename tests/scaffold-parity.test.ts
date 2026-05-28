import { describe, test, expect } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, relative } from "path";
import { spawnSync } from "child_process";

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

describe("create-project-dirs scaffold parity", () => {
  test("matches the known-good file tree snapshot", () => {
    const cwd = mkdtempSync(join(tmpdir(), "scaffold-parity-"));

    try {
      const res = spawnSync("bash", [join(ROOT, "scripts/create-project-dirs.sh")], {
        cwd,
        encoding: "utf-8",
      });

      expect(res.status).toBe(0);
      expect(collectFiles(cwd)).toEqual([
        "./.ai/context/capabilities.json",
        "./.ai/context/context-map.json",
        "./.ai/harness/architecture/.gitkeep",
        "./.ai/harness/architecture/events.jsonl",
        "./.ai/harness/brain-manifest.json",
        "./.ai/harness/checks/latest.json",
        "./.ai/harness/context-budget/latest.json",
        "./.ai/harness/events.jsonl",
        "./.ai/harness/failures/latest.jsonl",
        "./.ai/harness/handoff/current.md",
        "./.ai/harness/handoff/resume.md",
        "./.ai/harness/policy.json",
        "./.ai/harness/runs/.gitkeep",
        "./.ai/harness/workflow-contract.json",
        "./.ai/harness/worktrees/.gitkeep",
        "./.ai/hooks/anti-simplification.sh",
        "./.ai/hooks/atomic-commit.sh",
        "./.ai/hooks/atomic-pending.sh",
        "./.ai/hooks/changelog-guard.sh",
        "./.ai/hooks/context-pressure-hook.sh",
        "./.ai/hooks/finalize-handoff.sh",
        "./.ai/hooks/hook-input.sh",
        "./.ai/hooks/lib/session-state.sh",
        "./.ai/hooks/lib/workflow-state.sh",
        "./.ai/hooks/post-bash.sh",
        "./.ai/hooks/post-edit-guard.sh",
        "./.ai/hooks/pre-code-change.sh",
        "./.ai/hooks/pre-edit-guard.sh",
        "./.ai/hooks/prompt-guard.sh",
        "./.ai/hooks/run-hook.sh",
        "./.ai/hooks/session-start-context.sh",
        "./.ai/hooks/tdd-guard-hook.sh",
        "./.ai/hooks/trace-event.sh",
        "./.ai/hooks/worktree-guard.sh",
        "./.claude/settings.json",
        "./.claude/templates/contract.template.md",
        "./.claude/templates/implementation-notes.template.md",
        "./.claude/templates/plan.template.md",
        "./.claude/templates/research.template.md",
        "./.claude/templates/review.template.md",
        "./.claude/templates/spec.template.md",
        "./.codex/hooks.json",
        "./.gitignore",
        "./AGENTS.md",
        "./CLAUDE.md",
        "./deploy/README.md",
        "./deploy/env/.gitkeep",
        "./deploy/release-checklists/.gitkeep",
        "./deploy/runbooks/.gitkeep",
        "./deploy/scripts/.gitkeep",
        "./deploy/sql/.gitkeep",
        "./deploy/submissions/.gitkeep",
        "./docs/CHANGELOG.md",
        "./docs/architecture/diagrams/.gitkeep",
        "./docs/architecture/domains/.gitkeep",
        "./docs/architecture/index.md",
        "./docs/architecture/modules/.gitkeep",
        "./docs/architecture/requests/.gitkeep",
        "./docs/architecture/snapshots/.gitkeep",
        "./docs/reference-configs/agentic-development-flow.md",
        "./docs/reference-configs/document-generation.md",
        "./docs/reference-configs/external-tooling.md",
        "./docs/reference-configs/global-working-rules.md",
        "./docs/reference-configs/handoff-protocol.md",
        "./docs/reference-configs/harness-overview.md",
        "./docs/reference-configs/sprint-contracts.md",
        "./docs/spec.md",
        "./interfaces/types.ts",
        "./package.json",
        "./scripts/architecture-drift.sh",
        "./scripts/architecture-event.ts",
        "./scripts/archive-architecture-request.sh",
        "./scripts/archive-workflow.sh",
        "./scripts/capability-config.ts",
        "./scripts/capability-resolver.ts",
        "./scripts/capture-plan.sh",
        "./scripts/check-agent-tooling.sh",
        "./scripts/check-brain-manifest.sh",
        "./scripts/check-context-files.sh",
        "./scripts/check-deploy-sql-order.sh",
        "./scripts/check-skill-version.ts",
        "./scripts/check-task-sync.sh",
        "./scripts/check-task-workflow.sh",
        "./scripts/codex-handoff-resume.sh",
        "./scripts/context-budget.ts",
        "./scripts/context-contract-sync.sh",
        "./scripts/contract-worktree.sh",
        "./scripts/ensure-task-workflow.sh",
        "./scripts/inspect-project-state.ts",
        "./scripts/maintenance-triage.sh",
        "./scripts/migrate-project-template.sh",
        "./scripts/migrate-workflow-docs.ts",
        "./scripts/new-plan.sh",
        "./scripts/new-spec.sh",
        "./scripts/new-sprint.sh",
        "./scripts/plan-to-todo.sh",
        "./scripts/prepare-codex-handoff.sh",
        "./scripts/prepare-handoff.sh",
        "./scripts/regenerate.sh",
        "./scripts/select-agent-context-blocks.sh",
        "./scripts/summarize-failures.sh",
        "./scripts/switch-plan.sh",
        "./scripts/sync-brain-docs.sh",
        "./scripts/verify-contract.sh",
        "./scripts/verify-sprint.sh",
        "./scripts/workflow-contract.ts",
        "./scripts/workstream-sync.sh",
        "./tasks/lessons.md",
        "./tasks/research.md",
        "./tasks/todo.md",
        "./tasks/workstreams/.gitkeep",
        "./tests/README.md",
      ]);

      const gitignore = readFileSync(join(cwd, ".gitignore"), "utf-8");
      expect(gitignore).toContain("# BEGIN: claude-runtime-temp (managed by project-initializer)");
      expect(gitignore).toContain(".codex/*");
      expect(gitignore).toContain("!.codex/hooks.json");
      expect(gitignore).toContain("_ref/");
      expect(gitignore).toContain(".codegraph/");
      expect(gitignore).toContain("_ops/");
      expect(gitignore).not.toContain("_ops/secrets/");
      expect(gitignore).not.toContain("!_ops/env/.env.example");

      const agents = readFileSync(join(cwd, "AGENTS.md"), "utf-8");
      expect(agents).toContain("Repo Agent Context");
      expect(agents).toBe(readFileSync(join(cwd, "CLAUDE.md"), "utf-8"));

      const template = readFileSync(join(cwd, ".claude/templates/plan.template.md"), "utf-8");
      expect(template).toContain("## Agentic Routing");
      expect(template).toContain("## Workflow Inventory");
      expect(template).toContain("Active plan rule: `.claude/.active-plan` is authoritative when present");
      expect(template).toContain("## Evidence Contract");
      expect(template).toContain("**State/progress path**");

      const contractTemplate = readFileSync(join(cwd, ".claude/templates/contract.template.md"), "utf-8");
      expect(contractTemplate).toContain("## Workflow Inventory");
      expect(contractTemplate).toContain("Completion gate: `scripts/verify-sprint.sh` must see this contract pass");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
