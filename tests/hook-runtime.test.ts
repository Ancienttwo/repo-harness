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
  const aiHooksDir = join(cwd, ".ai", "hooks");
  mkdirSync(aiHooksDir, { recursive: true });
  for (const f of readdirSync(ASSETS_HOOKS_DIR, { withFileTypes: true })) {
    const src = join(ASSETS_HOOKS_DIR, f.name);
    if (f.isDirectory()) {
      cpSync(src, join(aiHooksDir, f.name), { recursive: true });
      continue;
    } else {
      copyFileSync(src, join(aiHooksDir, f.name));
    }
  }
  for (const dir of [aiHooksDir]) {
    const res = spawnSync("sh", ["-c", `find "${dir}" -type f -name '*.sh' -exec chmod +x {} +`], {
      encoding: "utf-8",
    });
    expect(res.status).toBe(0);
  }
  return aiHooksDir;
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

function planEvidenceContract(): string {
  return [
    "## Evidence Contract",
    "",
    "- **State/progress path**: tasks/todo.md and tasks/notes/demo.notes.md",
    "- **Verification evidence**: .ai/harness/checks/latest.json and verify-sprint",
    "- **Evaluator rubric**: sprint review must recommend pass",
    "- **Stop condition**: stop on failing contract verification",
    "- **Rollback surface**: revert generated task files and changed source files",
  ].join("\n");
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
  const hooksDir = join(cwd, ".ai", "hooks");
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

function installArchitectureHelpers(cwd: string) {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  for (const fileName of ["architecture-drift.sh", "archive-architecture-request.sh", "context-contract-sync.sh", "workstream-sync.sh", "select-agent-context-blocks.sh", "capability-resolver.ts", "architecture-event.ts"]) {
    copyFileSync(join(ROOT, "assets/templates/helpers", fileName), join(cwd, "scripts", fileName));
  }
  expect(run("chmod", ["+x", "scripts/architecture-drift.sh", "scripts/archive-architecture-request.sh", "scripts/context-contract-sync.sh", "scripts/workstream-sync.sh", "scripts/select-agent-context-blocks.sh"], cwd).status).toBe(0);
}

function installPlanWorkflowHelpers(cwd: string) {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  for (const fileName of ["ensure-task-workflow.sh", "new-plan.sh"]) {
    copyFileSync(join(ROOT, "assets/templates/helpers", fileName), join(cwd, "scripts", fileName));
  }
  expect(run("chmod", ["+x", "scripts/ensure-task-workflow.sh", "scripts/new-plan.sh"], cwd).status).toBe(0);
}

function gitCommitCount(cwd: string): number {
  const out = run("git", ["rev-list", "--count", "HEAD"], cwd);
  expect(out.status).toBe(0);
  return Number(out.stdout.trim());
}

describe("Hook runtime behavior", () => {
  test("prompt-guard: emits advisory Waza route hints without blocking", () => {
    const cwd = tmpWorkspace("waza-route-hint");
    try {
      installHooks(cwd);

      const bugRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这个登录 bug 报错了，帮我修复" }),
      });
      expect(bugRes.status).toBe(0);
      expect(bugRes.stdout).not.toContain("[WazaRoute]");
      expect(bugRes.stdout).toContain("[TDD] Bug-fix intent detected");

      const healthRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "检查一下 Codex hook 和 AGENTS.md 配置健康度" }),
      });
      expect(healthRes.status).toBe(0);
      expect(healthRes.stdout).toContain("[WazaRoute] Agent workflow/tooling intent detected");
      expect(healthRes.stdout).toContain("Waza /health");

      const reviewRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "验收一下当前改动，然后提交推送" }),
      });
      expect(reviewRes.status).toBe(0);
      expect(reviewRes.stdout).toContain("[WazaRoute] Review/release intent detected");
      expect(reviewRes.stdout).toContain("Waza /check");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: suggests agentic-dev-autoplan for reusable workflow packaging only after authorization", () => {
    const cwd = tmpWorkspace("agentic-packaging-route-hint");
    try {
      installHooks(cwd);

      const packagingRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这个重复工作适合做成 skill 或 automation 吗" }),
      });
      expect(packagingRes.status).toBe(0);
      expect(packagingRes.stdout).toContain("[AgenticDevRoute] Reusable workflow packaging intent detected");
      expect(packagingRes.stdout).toContain("agentic-dev-autoplan after user authorization");
      expect(packagingRes.stdout).toContain("hook will not plan or create assets");
      expect(packagingRes.stdout).not.toContain("[WazaRoute]");

      const hookTriggerRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这是不是适合做成 hook 来触发用户授权去 plan 一个改进方案" }),
      });
      expect(hookTriggerRes.status).toBe(0);
      expect(hookTriggerRes.stdout).toContain("[AgenticDevRoute]");
      expect(hookTriggerRes.stdout).toContain("agentic-dev-autoplan");
      expect(hookTriggerRes.stdout).not.toContain("[WazaRoute]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

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

  test("post-edit-guard: records architecture drift and syncs local context contract blocks", () => {
    const cwd = tmpWorkspace("architecture-drift-hook");
    try {
      installHooks(cwd);
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, "apps/web/src/routes"), { recursive: true });
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      writeFileSync(join(cwd, ".ai/context/agent-context-blocks.txt"), "apps/web\n");
      writeFileSync(join(cwd, ".ai/context/context-map.json"), JSON.stringify({
        version: 1,
        profile: "stable-root-progressive-subdir",
        lsp_profiles: { default: "typescript-lsp" },
        root_context_files: ["CLAUDE.md", "AGENTS.md"],
        discoverable_contexts: [],
      }, null, 2));
      writeFileSync(join(cwd, "apps/web/AGENTS.md"), "# Existing Web Contract\n\n- Keep manual rule.\n");

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/routes/account.tsx" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ArchitectureDrift] Request:");
      expect(res.stdout).toContain("[ContextContractSync] Updated apps/web/AGENTS.md and apps/web/CLAUDE.md.");
      expect(existsSync(join(cwd, ".ai/harness/architecture/events.jsonl"))).toBe(true);

      const requestFiles = readdirSync(join(cwd, "docs/architecture/requests")).filter((name) => name.endsWith(".md"));
      expect(requestFiles.length).toBe(1);
      const request = readFileSync(join(cwd, "docs/architecture/requests", requestFiles[0]), "utf-8");
      expect(request).toContain("**Functional Block**: `apps/web`");
      expect(request).toContain("**Capability ID**: `apps-web`");
      expect(request).toContain("**Contract Sync Required**: true");

      const agents = readFileSync(join(cwd, "apps/web/AGENTS.md"), "utf-8");
      const claude = readFileSync(join(cwd, "apps/web/CLAUDE.md"), "utf-8");
      expect(agents).toBe(claude);
      expect(agents).toContain("Keep manual rule.");
      expect(agents).toContain("<!-- BEGIN ARCHITECTURE CONTRACT -->");
      expect(agents).toContain("Pending architecture request: `docs/architecture/requests/");

      const contextMap = JSON.parse(readFileSync(join(cwd, ".ai/context/context-map.json"), "utf-8"));
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("apps/web/AGENTS.md");
      expect(contextMap.discoverable_contexts.map((entry: { path: string }) => entry.path)).toContain("apps/web/CLAUDE.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("architecture drift uses the most specific domain/capability functional block", () => {
    const cwd = tmpWorkspace("architecture-nested-block");
    try {
      installHooks(cwd);
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, "apps/web/src/routes/account"), { recursive: true });
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      writeFileSync(join(cwd, ".ai/context/agent-context-blocks.txt"), [
        "apps/web",
        "apps/web/src/routes/account",
        "",
      ].join("\n"));
      writeFileSync(join(cwd, "apps/web/src/routes/account/AGENTS.md"), "# Account Contract\n\nManual account rule.\n");

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/routes/account/page.tsx" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContextContractSync] Updated apps/web/src/routes/account/AGENTS.md and apps/web/src/routes/account/CLAUDE.md.");

      const requestFiles = readdirSync(join(cwd, "docs/architecture/requests")).filter((name) => name.endsWith(".md"));
      expect(requestFiles.length).toBe(1);
      const request = readFileSync(join(cwd, "docs/architecture/requests", requestFiles[0]), "utf-8");
      expect(request).toContain("**Functional Block**: `apps/web/src/routes/account`");
      expect(request).toContain("**Capability ID**: `apps-web-account`");
      expect(request).toContain("**Matched Prefix**: `apps/web/src/routes/account`");
      expect(request).toContain("**Architecture Domain**: `apps-web`");
      expect(request).toContain("**Architecture Capability**: `account`");
      expect(request).toContain("**Workstream Directory**: `tasks/workstreams/apps-web/account`");

      const agents = readFileSync(join(cwd, "apps/web/src/routes/account/AGENTS.md"), "utf-8");
      const claude = readFileSync(join(cwd, "apps/web/src/routes/account/CLAUDE.md"), "utf-8");
      expect(agents).toBe(claude);
      expect(agents).toContain("Manual account rule.");
      expect(agents).toContain("Architecture domain: `apps-web`");
      expect(agents).toContain("Architecture capability: `account`");
      expect(agents).toContain("Durable progress lives under `tasks/workstreams/apps-web/account`.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workstream-sync creates capability ledger and projects pointers into local contract", () => {
    const cwd = tmpWorkspace("workstream-sync");
    try {
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, "apps/web/src/routes/account"), { recursive: true });
      writeFileSync(join(cwd, "apps/web/src/routes/account/AGENTS.md"), "# Account Contract\n\nManual account rule.\n");

      const res = run("bash", [
        "scripts/workstream-sync.sh",
        "ensure",
        "--block",
        "apps/web/src/routes/account",
        "--slug",
        "account-rebuild",
        "--title",
        "Account Rebuild",
        "--plan",
        "plans/plan-20260520-account.md",
        "--slice",
        "todo-03",
      ], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[WorkstreamSync] Ensured tasks/workstreams/apps-web/account/account-rebuild.md");
      expect(existsSync(join(cwd, "tasks/workstreams/apps-web/account/account-rebuild.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/domains/apps-web.md"))).toBe(true);
      expect(existsSync(join(cwd, "docs/architecture/modules/apps-web/account.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/events.jsonl"))).toBe(true);

      const workstream = readFileSync(join(cwd, "tasks/workstreams/apps-web/account/account-rebuild.md"), "utf-8");
      expect(workstream).toContain("> **Capability ID**: `apps-web-account`");
      expect(workstream).toContain("> **Functional Block**: `apps/web/src/routes/account`");
      expect(workstream).toContain("> **Current Slice**: todo-03");

      const agents = readFileSync(join(cwd, "apps/web/src/routes/account/AGENTS.md"), "utf-8");
      const claude = readFileSync(join(cwd, "apps/web/src/routes/account/CLAUDE.md"), "utf-8");
      expect(agents).toBe(claude);
      expect(agents).toContain("Active Workstreams");
      expect(agents).toContain("`tasks/workstreams/apps-web/account/account-rebuild.md`");
      expect(agents).toContain("current_slice: todo-03");
      expect(agents).toContain("tasks/todo.md` is the current session slice");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("architecture-drift helper marks workflow-surface changes as spawn recommended", () => {
    const cwd = tmpWorkspace("architecture-drift-high");
    try {
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });

      const res = run("bash", ["scripts/architecture-drift.sh", "record", "--file", ".ai/hooks/pre-edit-guard.sh"], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("severity=high");
      expect(res.stdout).toContain("spawn_recommended=true");
      const event = readFileSync(join(cwd, ".ai/harness/architecture/events.jsonl"), "utf-8");
      expect(event).toContain('"severity":"high"');
      expect(event).toContain('"spawn_recommended":true');
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
        [join(workspace, ".ai/hooks/atomic-pending.sh")],
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

  test("installHooks copies nested lib helpers", () => {
    const cwd = tmpWorkspace("hook-lib-copy");
    try {
      const hooksDir = installHooks(cwd);
      expect(existsSync(join(cwd, ".ai/hooks/lib/workflow-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/lib/session-state.sh"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/hooks/hook-input.sh"))).toBe(true);
      expect(existsSync(join(hooksDir, "lib", "skill-factory.sh"))).toBe(false);
      expect(existsSync(join(hooksDir, "lib", "memory-state.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/run-hook.sh"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/hooks/lib/workflow-state.sh"))).toBe(false);
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

  test("prompt-guard: blocks implement intent when approved plan lacks evidence contract", () => {
    const cwd = tmpWorkspace("prompt-guard-evidence-contract");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      writeFileSync(
        join(cwd, "plans/plan-20260304-1310-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );

      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "seed approved plan"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "implement it all now" }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("[EvidenceContractGuard]");
      expect(res.stdout).toContain('"guard":"EvidenceContractGuard"');
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

  test("prompt-guard: starts a Draft plan workflow when Waza think planning begins", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-start");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "plan this hook capture flow with $think" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStartGate]");
      expect(res.stdout).toContain("Created plan:");
      const plans = readdirSync(join(cwd, "plans")).filter((name) =>
        /^plan-\d{8}-\d{4}-plan-this-hook-capture-flow-with-think\.md$/.test(name)
      );
      expect(plans).toHaveLength(1);
      expect(readFileSync(join(cwd, "plans", plans[0]), "utf-8")).toContain("> **Status**: Draft");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: does not start plan workflow for bug-hunt language", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-start-bug");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "plan this bug fix after reading the error" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("[PlanStartGate]");
      expect(existsSync(join(cwd, "plans"))).toBe(false);
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
      expect(res.stdout).toContain("capture-plan.sh");
      expect(res.stdout).toContain("ensure-task-workflow.sh");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: lets terse approval reach approved-plan capture when no active plan exists", () => {
    const cwd = tmpWorkspace("prompt-guard-approval-capture");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      for (const prompt of ["GO", "go ahead with it", "please proceed", "可以干", "可以干了"]) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });

        expect(res.status).toBe(0);
        expect(res.stdout).toContain("[PlanCaptureGate]");
        expect(res.stdout).toContain("capture-plan.sh");
        expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: lets approved plan projection run on terse approval", () => {
    const cwd = tmpWorkspace("prompt-guard-approval-plan-to-todo");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      const planPath = "plans/plan-20260304-1400-demo.md";
      writeFileSync(join(cwd, ".claude/.active-plan"), planPath);
      writeFileSync(
        join(cwd, planPath),
        ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
      );

      for (const prompt of ["GO", "go ahead with it", "可以干了"]) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });

        expect(res.status).toBe(0);
        expect(res.stdout).toContain("[PlanExecutionGate]");
        expect(res.stdout).toContain("plan-to-todo.sh --plan plans/plan-20260304-1400-demo.md");
        expect(res.stdout).not.toContain("[ContractGuard]");
        expect(res.stdout).not.toContain("[TodoGuard]");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: does not treat unrelated go phrases as implementation approval", () => {
    const cwd = tmpWorkspace("prompt-guard-go-over");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "go over the docs first" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("[PlanStatusGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: keeps broad bug-fix wording out of approval capture", () => {
    const cwd = tmpWorkspace("prompt-guard-go-ahead-bug-fix");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "go ahead with the bug fix" }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("[PlanStatusGuard]");
      expect(res.stdout).not.toContain("[PlanCaptureGate]");
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
        ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
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

  test("prompt-guard: blocks done intent when approved plan lacks evidence contract", () => {
    const cwd = tmpWorkspace("prompt-guard-done-evidence-contract");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "scripts"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1415-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );
      writeFileSync(
        join(cwd, "tasks/todo.md"),
        "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1415-demo.md\n"
      );
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# contract\n");
      writeFileSync(
        join(cwd, "scripts/verify-contract.sh"),
        "#!/bin/bash\nset -euo pipefail\necho \"[verify] ok\"\n"
      );
      expect(run("chmod", ["+x", "scripts/verify-contract.sh"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "done" }),
      });

      expect(res.status).toBe(1);
      expect(res.stdout).toContain("[EvidenceContractGuard]");
      expect(res.stdout).toContain('"guard":"EvidenceContractGuard"');
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
          ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
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
        ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
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
      mkdirSync(join(cwd, "interfaces"), { recursive: true });
      mkdirSync(join(cwd, "src"), { recursive: true });
      writeFileSync(join(cwd, "interfaces/types.ts"), "export type RuntimeInterface = {};\n");
      writeFileSync(join(cwd, "src/widget.ts"), "export function widget() { return 1; }\n");

      const assetRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "interfaces/types.ts" } }),
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

  test("pre-edit-guard: protects _ref and private _ops paths while allowing deploy assets", () => {
    const cwd = tmpWorkspace("ops-ref-guard");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const refRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "_ref/upstream/README.md" } }),
      });
      expect(refRes.status).toBe(1);
      expect(refRes.stdout).toContain("[ExternalReferenceGuard]");
      expect(refRes.stdout).toContain('"guard":"ExternalReferenceGuard"');

      const secretRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "_ops/env/.env.production" } }),
      });
      expect(secretRes.status).toBe(1);
      expect(secretRes.stdout).toContain("[OpsPrivateGuard]");
      expect(secretRes.stdout).toContain('"guard":"OpsPrivateGuard"');

      const opsRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "deploy/scripts/release.sh" } }),
      });
      expect(opsRes.status).toBe(0);
      expect(opsRes.stdout).toContain("[DeployAsset]");

      const exampleRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "deploy/env/.env.example" } }),
      });
      expect(exampleRes.status).toBe(0);
      expect(exampleRes.stdout).toContain("[DeployAsset]");
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

  test("post-edit-guard: syncs opted-in repo docs to the default brain vault", () => {
    const cwd = tmpWorkspace("post-edit-brain-sync");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      const brainRoot = join(cwd, "brain");
      mkdirSync(brainRoot, { recursive: true });
      copyFileSync(join(ROOT, "assets/templates/helpers/sync-brain-docs.sh"), join(cwd, "scripts/sync-brain-docs.sh"));
      expect(run("chmod", ["+x", "scripts/sync-brain-docs.sh"], cwd).status).toBe(0);

      writeFileSync(join(cwd, "docs/valuable.md"), "# Valuable Doc\n\nHook mirrored knowledge.\n");
      writeFileSync(
        join(cwd, ".ai/harness/brain-manifest.json"),
        JSON.stringify(
          {
            version: 1,
            project: "demo",
            mode: "repo-contract-external-knowledge",
            default_brain_path: "icloud/brain/demo/*",
            entries: [
              {
                id: "valuable",
                role: "repo-authored",
                repo_path: "docs/valuable.md",
                brain_path: "icloud/brain/demo/references/valuable.md",
                gbrain_slug: "references/valuable",
                sync: { direction: "repo-to-brain" },
              },
            ],
          },
          null,
          2
        ) + "\n"
      );

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "docs/valuable.md" } }),
        env: { ICLOUD_BRAIN_ROOT: brainRoot },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[BrainSync] synced docs/valuable.md");
      expect(readFileSync(join(brainRoot, "demo/references/valuable.md"), "utf-8")).toContain("Hook mirrored knowledge.");
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
