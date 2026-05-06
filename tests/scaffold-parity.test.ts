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
        "./.ai/context/context-map.json",
        "./.ai/harness/checks/latest.json",
        "./.ai/harness/context-budget/latest.json",
        "./.ai/harness/events.jsonl",
        "./.ai/harness/failures/latest.jsonl",
        "./.ai/harness/handoff/current.md",
        "./.ai/harness/handoff/resume.md",
        "./.ai/harness/policy.json",
        "./.ai/harness/runs/.gitkeep",
        "./.ai/harness/workflow-contract.json",
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
        "./.claude/hooks/anti-simplification.sh",
        "./.claude/hooks/atomic-commit.sh",
        "./.claude/hooks/atomic-pending.sh",
        "./.claude/hooks/changelog-guard.sh",
        "./.claude/hooks/context-pressure-hook.sh",
        "./.claude/hooks/finalize-handoff.sh",
        "./.claude/hooks/post-bash.sh",
        "./.claude/hooks/post-edit-guard.sh",
        "./.claude/hooks/pre-code-change.sh",
        "./.claude/hooks/pre-edit-guard.sh",
        "./.claude/hooks/prompt-guard.sh",
        "./.claude/hooks/run-hook.sh",
        "./.claude/hooks/session-start-context.sh",
        "./.claude/hooks/tdd-guard-hook.sh",
        "./.claude/hooks/trace-event.sh",
        "./.claude/hooks/worktree-guard.sh",
        "./.claude/settings.json",
        "./.claude/templates/contract.template.md",
        "./.claude/templates/plan.template.md",
        "./.claude/templates/research.template.md",
        "./.claude/templates/review.template.md",
        "./.claude/templates/spec.template.md",
        "./.gitignore",
        "./.ops/.gitkeep",
        "./.ops/README.md",
        "./contracts/types.ts",
        "./docs/CHANGELOG.md",
        "./docs/PROGRESS.md",
        "./docs/brief.md",
        "./docs/decisions.md",
        "./docs/reference-configs/ai-workflows.md",
        "./docs/reference-configs/changelog-versioning.md",
        "./docs/reference-configs/coding-standards.md",
        "./docs/reference-configs/development-protocol.md",
        "./docs/reference-configs/evaluator-rubric.md",
        "./docs/reference-configs/external-tooling.md",
        "./docs/reference-configs/git-strategy.md",
        "./docs/reference-configs/handoff-protocol.md",
        "./docs/reference-configs/harness-overview.md",
        "./docs/reference-configs/hook-operations.md",
        "./docs/reference-configs/release-deploy.md",
        "./docs/reference-configs/spa-day-protocol.md",
        "./docs/reference-configs/sprint-contracts.md",
        "./docs/reference-configs/workflow-orchestration.md",
        "./docs/spec.md",
        "./docs/tech-stack.md",
        "./package.json",
        "./scripts/archive-workflow.sh",
        "./scripts/check-agent-tooling.sh",
        "./scripts/check-context-files.sh",
        "./scripts/check-task-sync.sh",
        "./scripts/check-task-workflow.sh",
        "./scripts/codex-handoff-resume.sh",
        "./scripts/context-budget.ts",
        "./scripts/ensure-task-workflow.sh",
        "./scripts/maintenance-triage.sh",
        "./scripts/new-plan.sh",
        "./scripts/new-spec.sh",
        "./scripts/new-sprint.sh",
        "./scripts/plan-to-todo.sh",
        "./scripts/prepare-codex-handoff.sh",
        "./scripts/prepare-handoff.sh",
        "./scripts/regenerate.sh",
        "./scripts/summarize-failures.sh",
        "./scripts/switch-plan.sh",
        "./scripts/verify-contract.sh",
        "./scripts/verify-sprint.sh",
        "./specs/overview.md",
        "./tasks/lessons.md",
        "./tasks/research.md",
        "./tasks/todo.md",
        "./tests/README.md",
      ]);

      const gitignore = readFileSync(join(cwd, ".gitignore"), "utf-8");
      expect(gitignore).toContain("# BEGIN: claude-runtime-temp (managed by project-initializer)");

      const template = readFileSync(join(cwd, ".claude/templates/plan.template.md"), "utf-8");
      expect(template).toContain("Active plan rule: the latest non-archived `plans/plan-*.md` file is the current plan");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
