import { describe, test, expect } from "bun:test";
import {
  appendFileSync,
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const ASSETS_HOOKS_DIR = join(ROOT, "assets/hooks");

function tmpWorkspace(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `${prefix}-`));
}

function installHooks(cwd: string): string {
  const hooksDir = join(cwd, ".claude", "hooks");
  const aiHooksDir = join(cwd, ".ai", "hooks");
  mkdirSync(hooksDir, { recursive: true });
  mkdirSync(aiHooksDir, { recursive: true });
  for (const f of readdirSync(ASSETS_HOOKS_DIR, { withFileTypes: true })) {
    const src = join(ASSETS_HOOKS_DIR, f.name);
    if (f.isDirectory()) {
      cpSync(src, join(aiHooksDir, f.name), { recursive: true });
      continue;
    } else {
      copyFileSync(src, join(aiHooksDir, f.name));
      if (f.name === "hook-input.sh") {
        continue;
      }

      writeFileSync(
        join(hooksDir, f.name),
        [
          "#!/bin/bash",
          "set -euo pipefail",
          "",
          'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
          'REPO_ROOT="${HOOK_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"',
          `TARGET="$REPO_ROOT/.ai/hooks/${f.name}"`,
          "",
          'if [[ ! -f "$TARGET" ]]; then',
          '  echo "[HookShim] Shared hook not found: $TARGET" >&2',
          "  exit 1",
          "fi",
          "",
          'export HOOK_REPO_ROOT="$REPO_ROOT"',
          'exec bash "$TARGET" "$@"',
          "",
        ].join("\n"),
        "utf-8"
      );
    }
  }
  for (const dir of [hooksDir, aiHooksDir]) {
    const res = spawnSync("sh", ["-c", `find "${dir}" -type f -name '*.sh' -exec chmod +x {} +`], {
      encoding: "utf-8",
    });
    expect(res.status).toBe(0);
  }
  return hooksDir;
}

function writeValidSprintChecks(cwd: string) {
  writeFileSync(
    join(cwd, ".ai/harness/checks/latest.json"),
    JSON.stringify(
      {
        status: "pass",
        source: "verify-sprint",
        command: "bash scripts/verify-sprint.sh",
        exit_code: 0,
        generated_at: "2026-03-04T14:10:00+0000",
        contract: { file: "tasks/contracts/demo.contract.md", status: "pass", exit_code: 0 },
        review: { file: "tasks/reviews/demo.review.md", status: "pass" },
      },
      null,
      2
    ) + "\n"
  );
}

function run(cmd: string, args: string[], cwd: string) {
  return spawnSync(cmd, args, { cwd, encoding: "utf-8" });
}

function runHook(
  script: string,
  cwd: string,
  options?: {
    stdin?: string;
    env?: Record<string, string>;
    args?: string[];
  }
) {
  const hooksDir = join(cwd, ".claude", "hooks");
  return spawnSync("bash", [join(hooksDir, script), ...(options?.args ?? [])], {
    cwd,
    input: options?.stdin ?? "",
    encoding: "utf-8",
    env: {
      ...process.env,
      ...(options?.env ?? {}),
    },
  });
}

function initGitRepo(cwd: string) {
  expect(run("git", ["init"], cwd).status).toBe(0);
  expect(run("git", ["config", "user.name", "Hook Test"], cwd).status).toBe(0);
  expect(run("git", ["config", "user.email", "hook@test.local"], cwd).status).toBe(0);

  writeFileSync(join(cwd, "tracked.txt"), "base\n");
  expect(run("git", ["add", "tracked.txt"], cwd).status).toBe(0);
  expect(run("git", ["commit", "-m", "init"], cwd).status).toBe(0);
}

function gitCommitCount(cwd: string): number {
  const out = run("git", ["rev-list", "--count", "HEAD"], cwd);
  expect(out.status).toBe(0);
  return Number(out.stdout.trim());
}

describe("Hook runtime behavior", () => {
  test("worktree-guard: warning by default, block when marker exists", () => {
    const cwd = tmpWorkspace("worktree-guard");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const warnRes = runHook("worktree-guard.sh", cwd);
      expect(warnRes.status).toBe(0);
      expect(warnRes.stdout).toContain("Warning: primary working tree detected");

      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(join(cwd, ".claude/.require-worktree"), "1\n");

      const blockRes = runHook("worktree-guard.sh", cwd);
      expect(blockRes.status).toBe(1);
      expect(blockRes.stdout).toContain("Mutation blocked");
      expect(blockRes.stdout).toContain('"failure_class":"state_violation"');
      const failureLog = readFileSync(join(cwd, ".ai/harness/failures/latest.jsonl"), "utf-8");
      expect(failureLog).toContain('"guard":"WorktreeGuard"');
      expect(failureLog).toContain('"run_id":"run-');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("atomic-commit: commits only after validation command", () => {
    const cwd = tmpWorkspace("atomic-commit");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".claude"), { recursive: true });

      appendFileSync(join(cwd, "tracked.txt"), "change-1\n");
      writeFileSync(join(cwd, ".claude/.atomic_pending"), "pending\n");
      const before = gitCommitCount(cwd);

      const passRes = runHook("atomic-commit.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { command: "bun run test" } }),
        env: { EXIT_CODE: "0" },
      });

      expect(passRes.status).toBe(0);
      expect(passRes.stdout).toContain("[AtomicCommit] Checkpoint committed");
      expect(existsSync(join(cwd, ".claude/.atomic_pending"))).toBe(false);
      expect(gitCommitCount(cwd)).toBe(before + 1);

      appendFileSync(join(cwd, "tracked.txt"), "change-2\n");
      writeFileSync(join(cwd, ".claude/.atomic_pending"), "pending\n");
      const beforeSkip = gitCommitCount(cwd);

      const skipRes = runHook("atomic-commit.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { command: "echo hello" } }),
        env: { EXIT_CODE: "0" },
      });

      expect(skipRes.status).toBe(0);
      expect(skipRes.stdout).not.toContain("Checkpoint committed");
      expect(existsSync(join(cwd, ".claude/.atomic_pending"))).toBe(true);
      expect(gitCommitCount(cwd)).toBe(beforeSkip);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-edit-guard: detects apps/*/src direct files and wrangler variants", () => {
    const cwd = tmpWorkspace("doc-drift");
    try {
      installHooks(cwd);

      const srcRes = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/main.tsx" } }),
      });
      expect(srcRes.status).toBe(0);
      expect(srcRes.stdout).toContain("[DocDrift] App source changed");

      const routeRes = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/routes/index.tsx" } }),
      });
      expect(routeRes.status).toBe(0);
      expect(routeRes.stdout).toContain("[DocDrift] App source changed");

      const wranglerRes = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/api/wrangler.production.toml" } }),
      });
      expect(wranglerRes.status).toBe(0);
      expect(wranglerRes.stdout).toContain("Wrangler config changed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("tdd-guard: extension heuristic + barrel-only skip behavior", () => {
    const cwd = tmpWorkspace("tdd-guard");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "apps/web/src/components"), { recursive: true });
      mkdirSync(join(cwd, "apps/api/src"), { recursive: true });

      writeFileSync(join(cwd, "apps/web/src/components/Button.tsx"), "export function Button() { return <button /> }\n");
      const bddRes = runHook("tdd-guard-hook.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/components/Button.tsx" } }),
      });
      expect(bddRes.status).toBe(0);
      expect(bddRes.stdout).toContain("[BDD Guard]");

      writeFileSync(join(cwd, "apps/api/src/utils.ts"), "export const sum = (a: number, b: number) => a + b\n");
      const tddRes = runHook("tdd-guard-hook.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/api/src/utils.ts" } }),
      });
      expect(tddRes.status).toBe(0);
      expect(tddRes.stdout).toContain("[TDD Guard]");

      writeFileSync(
        join(cwd, "apps/api/src/index.ts"),
        "export * from './utils'\nexport { sum } from './utils'\n"
      );
      const barrelRes = runHook("tdd-guard-hook.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/api/src/index.ts" } }),
      });
      expect(barrelRes.status).toBe(0);
      expect(barrelRes.stdout.trim()).toBe("");

      writeFileSync(join(cwd, "apps/api/src/index.ts"), "const x = 1\nexport { x }\n");
      const logicIndexRes = runHook("tdd-guard-hook.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/api/src/index.ts" } }),
      });
      expect(logicIndexRes.status).toBe(0);
      expect(logicIndexRes.stdout).toContain("[TDD Guard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("context-pressure: same-session increments, cross-session resets, warning once", () => {
    const cwd = tmpWorkspace("context-pressure");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".claude/.context-pressure"), { recursive: true });

      const s1a = runHook("context-pressure-hook.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-a" },
      });
      expect(s1a.status).toBe(0);

      const s1b = runHook("context-pressure-hook.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-a" },
      });
      expect(s1b.status).toBe(0);
      expect(readFileSync(join(cwd, ".claude/.tool-call-count"), "utf-8").trim()).toBe("2");

      const s2 = runHook("context-pressure-hook.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-b" },
      });
      expect(s2.status).toBe(0);
      expect(readFileSync(join(cwd, ".claude/.tool-call-count"), "utf-8").trim()).toBe("1");

      writeFileSync(join(cwd, ".claude/.context-pressure/warnsession_.count"), "29\n");

      const warn1 = runHook("context-pressure-hook.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "warnsession" },
      });
      expect(warn1.status).toBe(0);
      expect(warn1.stdout).toContain("Yellow zone");
      expect(warn1.stdout).toContain("Persist research/todo/handoff");
      expect(warn1.stdout).not.toContain("/compact");

      const warn2 = runHook("context-pressure-hook.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "warnsession" },
      });
      expect(warn2.status).toBe(0);
      expect(warn2.stdout).not.toContain("Yellow zone");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("hooks resolve repo root when cwd drifts", () => {
    const workspace = tmpWorkspace("cwd-drift");
    try {
      initGitRepo(workspace);
      installHooks(workspace);

      // Run atomic-pending from /tmp — hook should resolve to workspace via SCRIPT_DIR fallback
      const res = spawnSync(
        "bash",
        [join(workspace, ".claude/hooks/atomic-pending.sh")],
        {
          cwd: tmpdir(),
          input: "",
          encoding: "utf-8",
        }
      );
      expect(res.status).toBe(0);
      expect(existsSync(join(workspace, ".claude/.atomic_pending"))).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("session-start-context injects only active generated Codex resume packets", () => {
    const cwd = tmpWorkspace("session-start-context");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/context-budget"), { recursive: true });

      writeFileSync(join(cwd, ".ai/harness/handoff/resume.md"), "# Codex Resume Packet\n\n> **Reason**: bootstrap\n");
      const bootstrapRes = runHook("session-start-context.sh", cwd);
      expect(bootstrapRes.status).toBe(0);
      expect(bootstrapRes.stdout.trim()).toBe("");

      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        [
          "# Codex Resume Packet",
          "<!-- generated-by: project-initializer codex-handoff-resume v1 -->",
          "",
          "> **Reason**: acceptance-complete",
          "",
          "## Resume Prompt",
          "",
          "You are starting a fresh Codex session.",
          "",
          "Required first reads:",
          "- AGENTS.md",
        ].join("\n")
      );

      const staleRes = runHook("session-start-context.sh", cwd);
      expect(staleRes.status).toBe(0);
      expect(staleRes.stdout.trim()).toBe("");

      writeFileSync(join(cwd, ".ai/harness/context-budget/latest.json"), JSON.stringify({ zone: "red" }) + "\n");

      const res = runHook("session-start-context.sh", cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("SessionStart");
      expect(res.stdout).toContain("additionalContext");
      expect(res.stdout).toContain("fresh Codex session");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("run-hook dispatcher resolves repo root from nested cwd", () => {
    const cwd = tmpWorkspace("run-hook-dispatch");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "apps/api"), { recursive: true });

      const res = spawnSync(
        "sh",
        [
          "-c",
          'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT="$repo" bash "$repo/.ai/hooks/run-hook.sh" worktree-guard.sh',
        ],
        {
          cwd: join(cwd, "apps/api"),
          encoding: "utf-8",
        }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[WorktreeGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("claude run-hook shim forwards to shared .ai hook dispatcher", () => {
    const cwd = tmpWorkspace("run-hook-compat");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "apps/web"), { recursive: true });

      const res = spawnSync(
        "sh",
        [
          "-c",
          'repo=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; HOOK_REPO_ROOT="$repo" bash "$repo/.claude/hooks/run-hook.sh" worktree-guard.sh',
        ],
        {
          cwd: join(cwd, "apps/web"),
          encoding: "utf-8",
        }
      );

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[WorktreeGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("installHooks keeps Claude hooks as shims and .ai as implementation", () => {
    const cwd = tmpWorkspace("hook-lib-copy");
    try {
      const hooksDir = installHooks(cwd);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/hook-input.sh"))).toBe(true);
      expect(existsSync(join(hooksDir, "lib", "workflow-state.sh"))).toBe(false);
      expect(existsSync(join(hooksDir, "lib", "session-state.sh"))).toBe(false);
      expect(existsSync(join(hooksDir, "hook-input.sh"))).toBe(false);
      expect(existsSync(join(hooksDir, "lib", "skill-factory.sh"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("changelog-guard: warns when unreleased section is empty on release command", () => {
    const cwd = tmpWorkspace("changelog-guard");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });

      // Create a changelog with empty [Unreleased] section
      writeFileSync(
        join(cwd, "docs/CHANGELOG.md"),
        [
          "# Changelog",
          "",
          "## [Unreleased]",
          "",
          "---",
          "*Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)*",
          "",
        ].join("\n")
      );

      // Simulate npm version command — should warn
      const warnRes = runHook("changelog-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { command: "npm version patch" } }),
      });
      expect(warnRes.status).toBe(0);
      expect(warnRes.stdout).toContain("[ChangelogGuard]");
      expect(warnRes.stdout).toContain("appears empty");

      // Non-release command — should be silent
      const silentRes = runHook("changelog-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { command: "bun run test" } }),
      });
      expect(silentRes.status).toBe(0);
      expect(silentRes.stdout).not.toContain("[ChangelogGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("changelog-guard: silent when unreleased section has content", () => {
    const cwd = tmpWorkspace("changelog-guard-content");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });

      writeFileSync(
        join(cwd, "docs/CHANGELOG.md"),
        [
          "# Changelog",
          "",
          "## [Unreleased]",
          "",
          "### Added",
          "- New changelog guard hook",
          "",
          "---",
        ].join("\n")
      );

      const res = runHook("changelog-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { command: "npm version minor" } }),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("[ChangelogGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("changelog-guard: detects git tag and other version commands", () => {
    const cwd = tmpWorkspace("changelog-guard-variants");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });

      writeFileSync(
        join(cwd, "docs/CHANGELOG.md"),
        ["# Changelog", "", "## [Unreleased]", "", "---"].join("\n")
      );

      for (const cmd of ["git tag v1.0.0", "bun version patch", "pnpm version major", "yarn version --minor"]) {
        const res = runHook("changelog-guard.sh", cwd, {
          stdin: JSON.stringify({ tool_input: { command: cmd } }),
        });
        expect(res.status).toBe(0);
        expect(res.stdout).toContain("[ChangelogGuard]");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: research and annotation warnings on non-implement prompts", () => {
    const cwd = tmpWorkspace("prompt-guard-annotation");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });

      writeFileSync(
        join(cwd, "tasks/research.md"),
        "# Research\n\nInitial notes\n"
      );
      writeFileSync(
        join(cwd, "plans/plan-20260304-1200-test.md"),
        "# Plan: test\n\n> **Status**: Draft\n"
      );

      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "seed workflow files"], cwd).status).toBe(0);

      appendFileSync(join(cwd, "tasks/research.md"), "Updated insight\n");
      appendFileSync(join(cwd, "plans/plan-20260304-1200-test.md"), "- [NOTE]: update\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "我更新了注释，请先分析" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ResearchGuard]");
      expect(res.stdout).toContain("[AnnotationGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks implement intent when plan status is Draft", () => {
    const cwd = tmpWorkspace("prompt-guard-status");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      writeFileSync(
        join(cwd, "plans/plan-20260304-1300-demo.md"),
        "# Plan: demo\n\n> **Status**: Draft\n"
      );

      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "seed plan"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "implement it all now" }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("[PlanStatusGuard]");
      expect(res.stdout).toContain('"guard":"PlanStatusGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: warns on first plan creation when research is missing (no existing plans)", () => {
    const cwd = tmpWorkspace("prompt-guard-research-gate");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "请创建计划" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ResearchGate] WARNING");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: ignores stale repo-local memory cache files", () => {
    const cwd = tmpWorkspace("prompt-guard-memory");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(
        join(cwd, ".claude/.memory-context.json"),
        JSON.stringify({ themes: [{ slug: "bug-fix", label: "Bug Fix" }] }, null, 2)
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "please analyze the bug fix workflow first" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("[Memory]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks implement intent when no active plan exists", () => {
    const cwd = tmpWorkspace("prompt-guard-missing-plan");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("No active plan found in plans/");
      expect(res.stdout).toContain("ensure-task-workflow.sh");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when task contract is missing", () => {
    const cwd = tmpWorkspace("prompt-guard-contract-missing");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1400-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "mark done now" }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("[ContractGuard]");
      expect(res.stdout).toContain("Missing task contract");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: allows done intent when contract verification passes", () => {
    const cwd = tmpWorkspace("prompt-guard-contract-pass");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      mkdirSync(join(cwd, "scripts"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1410-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );
      writeFileSync(
        join(cwd, "tasks/todo.md"),
        "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1410-demo.md\n"
      );
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# contract\n");
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        "# Sprint Review: demo\n\n> **Recommendation**: pass\n"
      );
      writeValidSprintChecks(cwd);
      writeFileSync(
        join(cwd, "scripts/verify-contract.sh"),
        "#!/bin/bash\nset -euo pipefail\necho \"[verify] ok\"\n"
      );
      expect(run("chmod", ["+x", "scripts/verify-contract.sh"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[verify] ok");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when structured checks are empty, failing, or stale", () => {
    for (const [name, checks] of [
      ["empty", "{}\n"],
      [
        "fail",
        JSON.stringify(
          {
            status: "fail",
            source: "verify-sprint",
            exit_code: 1,
            contract: { file: "tasks/contracts/demo.contract.md" },
            review: { file: "tasks/reviews/demo.review.md" },
          },
          null,
          2
        ) + "\n",
      ],
      [
        "stale",
        JSON.stringify(
          {
            status: "pass",
            source: "verify-sprint",
            exit_code: 0,
            contract: { file: "tasks/contracts/old.contract.md" },
            review: { file: "tasks/reviews/demo.review.md" },
          },
          null,
          2
        ) + "\n",
      ],
    ] as const) {
      const cwd = tmpWorkspace(`prompt-guard-checks-${name}`);
      try {
        initGitRepo(cwd);
        installHooks(cwd);
        mkdirSync(join(cwd, "plans"), { recursive: true });
        mkdirSync(join(cwd, "tasks"), { recursive: true });
        mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
        mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
        mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
        mkdirSync(join(cwd, "scripts"), { recursive: true });

        writeFileSync(
          join(cwd, "plans/plan-20260304-1410-demo.md"),
          "# Plan: demo\n\n> **Status**: Approved\n"
        );
        writeFileSync(
          join(cwd, "tasks/todo.md"),
          "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1410-demo.md\n"
        );
        writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# contract\n");
        writeFileSync(
          join(cwd, "tasks/reviews/demo.review.md"),
          "# Sprint Review: demo\n\n> **Recommendation**: pass\n"
        );
        writeFileSync(join(cwd, ".ai/harness/checks/latest.json"), checks);
        writeFileSync(
          join(cwd, "scripts/verify-contract.sh"),
          "#!/bin/bash\nset -euo pipefail\necho \"[verify] ok\"\n"
        );
        expect(run("chmod", ["+x", "scripts/verify-contract.sh"], cwd).status).toBe(0);

        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: "done" }),
        });

        expect(res.status).toBe(1);
        expect(res.stdout).toContain("[EvidenceGuard]");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  });

  test("prompt-guard: blocks done intent when contract verification fails", () => {
    const cwd = tmpWorkspace("prompt-guard-contract-fail");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "scripts"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1420-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );
      writeFileSync(
        join(cwd, "tasks/todo.md"),
        "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1420-demo.md\n"
      );
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# contract\n");
      writeFileSync(
        join(cwd, "scripts/verify-contract.sh"),
        "#!/bin/bash\nset -euo pipefail\necho \"[verify] fail\"\nexit 1\n"
      );
      expect(run("chmod", ["+x", "scripts/verify-contract.sh"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "done" }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("[ContractGuard]");
      expect(res.stdout).toContain("Contract verification failed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: combines asset-layer and test reminders", () => {
    const cwd = tmpWorkspace("pre-edit-guard");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "contracts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      writeFileSync(join(cwd, "contracts/types.ts"), "export type Contract = {};\n");
      writeFileSync(join(cwd, "src/widget.ts"), "export function widget() { return 1; }\n");

      const assetRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "contracts/types.ts" } }),
      });
      expect(assetRes.status).toBe(0);
      expect(assetRes.stdout).toContain("[AssetLayer]");

      const tddRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/widget.ts" } }),
      });
      expect(tddRes.status).toBe(0);
      expect(tddRes.stdout).toContain("[TDD Guard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: blocks invalid plan status jumps", () => {
    const cwd = tmpWorkspace("pre-edit-plan-transition");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/plan-20260304-1500-demo.md"),
        "# Plan: demo\n\n> **Status**: Draft\n\n## Annotations\n<!-- [NOTE]: add detail -->\n"
      );

      const res = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({
          tool_input: {
            file_path: "plans/plan-20260304-1500-demo.md",
            content: "# Plan: demo\n\n> **Status**: Approved\n\n## Annotations\n<!-- [NOTE]: add detail -->\n",
          },
        }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("[PlanTransitionGuard]");
      expect(res.stdout).toContain('"guard":"PlanTransitionGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-edit-guard: combines doc drift and task handoff", () => {
    const cwd = tmpWorkspace("post-edit-guard");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "apps/web/src"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(join(cwd, "apps/web/src/index.ts"), "export const x = 1;\n");
      const docRes = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/index.ts" } }),
      });
      expect(docRes.status).toBe(0);
      expect(docRes.stdout).toContain("[DocDrift]");

      writeFileSync(
        join(cwd, "tasks/todo.md"),
        [
          "# Task Execution Checklist (Primary)",
          "",
          "> **Source Plan**: plans/plan-20260304-1410-demo.md",
          "",
          "- [x] finish first task",
          "- [ ] second task",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "plans/plan-20260304-1410-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );

      const handoffRes = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "tasks/todo.md" } }),
      });
      expect(handoffRes.status).toBe(0);
      expect(handoffRes.stdout).toContain("[TaskHandoff]");
      expect(existsSync(join(cwd, ".claude/.task-handoff.md"))).toBe(true);
      expect(readFileSync(join(cwd, ".claude/.task-state.json"), "utf-8")).toContain('"status":"in_progress"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-edit-guard: creates handoff summary when completed tasks increase", () => {
    const cwd = tmpWorkspace("task-handoff");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(
        join(cwd, "tasks/todo.md"),
        [
          "# Task Execution Checklist (Primary)",
          "",
          "> **Source Plan**: plans/plan-20260304-1410-demo.md",
          "",
          "- [x] finish first task",
          "- [ ] second task",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "plans/plan-20260304-1410-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "tasks/todo.md" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[TaskHandoff]");
      expect(existsSync(join(cwd, ".claude/.task-handoff.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/.task-state.json"))).toBe(true);
      const handoff = readFileSync(join(cwd, ".claude/.task-handoff.md"), "utf-8");
      expect(handoff).toContain("finish first task");
      expect(handoff).toContain("Progress");
      expect(handoff).toContain("plans/plan-20260304-1410-demo.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-edit-guard: runs continuous contract verification for referenced files", () => {
    const cwd = tmpWorkspace("post-edit-contract-verify");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1600-demo.md"),
        "# Plan: demo\n\n> **Status**: Executing\n"
      );
      writeFileSync(
        join(cwd, "tasks/contracts/demo.contract.md"),
        [
          "# Contract",
          "",
          "> **Status**: Pending",
          "",
          "```yaml",
          "exit_criteria:",
          "  files_exist:",
          "    - src/demo.ts",
          "```",
          "",
        ].join("\n")
      );
      writeFileSync(
        join(cwd, "scripts/verify-contract.sh"),
        "#!/bin/bash\nset -euo pipefail\necho \"[ContractVerify] total=1 failed=1 status=Pending->Partial\"\nexit 1\n"
      );
      expect(run("chmod", ["+x", "scripts/verify-contract.sh"], cwd).status).toBe(0);
      writeFileSync(join(cwd, "src/demo.ts"), "export const demo = true;\n");

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/demo.ts" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContractVerify]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("trace-event hook writes structured JSONL output", () => {
    const cwd = tmpWorkspace("trace-hook");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const res = runHook("trace-event.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "PostToolUse",
          tool_name: "Edit",
          duration_ms: 42,
          tool_input: { file_path: "src/demo.ts" },
          tool_response: { exit_code: 0 },
        }),
      });

      expect(res.status).toBe(0);
      const trace = readFileSync(join(cwd, ".claude/.trace.jsonl"), "utf-8");
      expect(trace).toContain('"event_type":"PostToolUse"');
      expect(trace).toContain('"tool_name":"Edit"');
      expect(trace).toContain('"file_path":"src/demo.ts"');
      expect(trace).toContain('"duration_ms":42');
      expect(trace).toContain('"run_id":"run-');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
