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
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

const ROOT = join(import.meta.dir, "..");
const ASSETS_HOOKS_DIR = join(ROOT, "assets/hooks");
const THINK_SKILL_BODY = [
  "---",
  "name: think",
  "description: Not for bug fixes or small edits.",
  "---",
  "",
  "# Think",
  "Turn a rough idea into an approved implementation plan.",
  "Use lightweight mode when the user wants to fix something.",
  "Do not route error/bug context into evaluation mode.",
].join("\n");

function tmpWorkspace(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
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

function writeActivePlan(cwd: string, planPath: string) {
  mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
  mkdirSync(join(cwd, ".claude"), { recursive: true });
  writeFileSync(join(cwd, ".ai/harness/active-plan"), planPath);
  writeFileSync(join(cwd, ".claude/.active-plan"), planPath);
  writeFileSync(join(cwd, ".ai/harness/active-worktree"), `${realpathSync(cwd)}\n`);
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
  for (const fileName of ["ensure-task-workflow.sh", "new-plan.sh", "capture-plan.sh", "plan-to-todo.sh"]) {
    copyFileSync(join(ROOT, "assets/templates/helpers", fileName), join(cwd, "scripts", fileName));
  }
  expect(run("chmod", ["+x", "scripts/ensure-task-workflow.sh", "scripts/new-plan.sh", "scripts/capture-plan.sh", "scripts/plan-to-todo.sh"], cwd).status).toBe(0);
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

  test("prompt-guard: emits host-neutral Codegraph route hints for structural code navigation", () => {
    const cwd = tmpWorkspace("codegraph-route-hint");
    try {
      installHooks(cwd);

      const structuralRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "谁调用了 runHook？影响面是什么？" }),
      });
      expect(structuralRes.status).toBe(0);
      expect(structuralRes.stdout).toContain("[CodegraphRoute] Structural code-navigation intent detected");
      expect(structuralRes.stdout).toContain("Prefer CodeGraph context/search/callers/impact");
      expect(structuralRes.stdout).not.toContain("mcp__codegraph__");
      expect(structuralRes.stdout).not.toContain("ToolSearch");

      const literalReadRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "读一下 README 第一段" }),
      });
      expect(literalReadRes.status).toBe(0);
      expect(literalReadRes.stdout).not.toContain("[CodegraphRoute]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("trace-event records host attribution metadata", () => {
    const cwd = tmpWorkspace("trace-host-metadata");
    try {
      installHooks(cwd);

      const res = runHook("trace-event.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "PostToolUse",
          tool_name: "Read",
          source: "claude-code",
          session_id: "session-1",
        }),
        env: {
          CLAUDE_AGENT_NAME: "main-claude",
          CLAUDE_SESSION_ID: "session-1",
          CLAUDE_SESSION_SOURCE: "claude-code",
        },
      });
      expect(res.status).toBe(0);

      const trace = readFileSync(join(cwd, ".claude", ".trace.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(trace[0].host).toBe("claude");
      expect(trace[0].agent_name).toBe("main-claude");
      expect(trace[0].session_source).toBe("claude-code");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("run-hook dispatches from HOOK_REPO_ROOT even when caller cwd differs", () => {
    const cwd = tmpWorkspace("run-hook-root-cwd");
    try {
      const hooksDir = installHooks(cwd);
      writeFileSync(
        join(hooksDir, "cwd-probe.sh"),
        [
          "#!/bin/bash",
          "set -euo pipefail",
          "printf 'pwd=%s\\n' \"$(pwd)\"",
          "printf 'root=%s\\n' \"${HOOK_REPO_ROOT:-}\"",
        ].join("\n")
      );
      expect(run("chmod", ["+x", ".ai/hooks/cwd-probe.sh"], cwd).status).toBe(0);

      const res = spawnSync("bash", [join(hooksDir, "run-hook.sh"), "cwd-probe.sh"], {
        cwd: ROOT,
        encoding: "utf-8",
        env: {
          ...process.env,
          HOOK_REPO_ROOT: cwd,
        },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain(`pwd=${cwd}`);
      expect(res.stdout).toContain(`root=${cwd}`);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: suggests repo-harness-autoplan for reusable workflow packaging only after authorization", () => {
    const cwd = tmpWorkspace("agentic-packaging-route-hint");
    try {
      installHooks(cwd);

      const packagingRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这个重复工作适合做成 skill 或 automation 吗" }),
      });
      expect(packagingRes.status).toBe(0);
      expect(packagingRes.stdout).toContain("[AgenticDevRoute] Reusable workflow packaging intent detected");
      expect(packagingRes.stdout).toContain("repo-harness-autoplan after user authorization");
      expect(packagingRes.stdout).toContain("hook will not plan or create assets");
      expect(packagingRes.stdout).not.toContain("[WazaRoute]");

      const hookTriggerRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这是不是适合做成 hook 来触发用户授权去 plan 一个改进方案" }),
      });
      expect(hookTriggerRes.status).toBe(0);
      expect(hookTriggerRes.stdout).toContain("[AgenticDevRoute]");
      expect(hookTriggerRes.stdout).toContain("repo-harness-autoplan");
      expect(hookTriggerRes.stdout).not.toContain("[WazaRoute]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("self-host autoresearch-advisory: routes optimization intent without background mutation", () => {
    const cwd = tmpWorkspace("autoresearch-advisory");
    try {
      installHooks(cwd);
      copyFileSync(
        join(ROOT, ".ai/hooks/autoresearch-advisory.sh"),
        join(cwd, ".ai/hooks/autoresearch-advisory.sh")
      );
      const sessionDir = join(cwd, "autoresearch", "autoresearch-demo-20260528-010203");
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(
        join(sessionDir, "session.json"),
        JSON.stringify({ status: "running", target_skill_path: join(cwd, "SKILL.md") }, null, 2) + "\n"
      );
      writeFileSync(
        join(sessionDir, "results.tsv"),
        "experiment\tscore\tmax_score\tpass_rate\tstatus\tdescription\n0\t12\t25\t48.0%\tbaseline\toriginal\n"
      );

      const promptRes = runHook("autoresearch-advisory.sh", cwd, {
        stdin: JSON.stringify({ prompt: "请跑 autoresearch 优化 SKILL.md 的 hook workflow" }),
      });
      expect(promptRes.status).toBe(0);
      expect(promptRes.stdout).toContain("[AutoresearchAdvisory]");
      expect(promptRes.stdout).toContain("agent-run loop");
      expect(promptRes.stdout).toContain("baseline -> candidate copy -> binary evals -> record_experiment -> promote only winners");
      expect(promptRes.stdout).toContain("hooks must not mutate SKILL.md");
      expect(promptRes.stdout).toContain("autoresearch/autoresearch-demo-20260528-010203/session.json");
      expect(promptRes.stdout).toContain("0\t12\t25\t48.0%\tbaseline\toriginal");

      const candidateRes = runHook("autoresearch-advisory.sh", cwd, {
        stdin: JSON.stringify({ file_path: "autoresearch/autoresearch-demo-20260528-010203/candidates/exp-2/SKILL.md" }),
      });
      expect(candidateRes.status).toBe(0);
      expect(candidateRes.stdout).toContain("candidate SKILL.md edited");
      expect(candidateRes.stdout).toContain("record the experiment");
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
      expect(blockRes.status).toBe(2);
      expect(blockRes.stdout).toContain("Mutation blocked");
      expect(blockRes.stdout).toContain('"failure_class":"state_violation"');
      expect(blockRes.stderr).toContain("[WorktreeGuard]");
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
      writeFileSync(join(cwd, ".ai/context/capabilities.json"), JSON.stringify({
        version: 1,
        capabilities: [
          {
            id: "apps-web",
            domain: "apps-web",
            name: "web",
            prefixes: ["apps/web"],
            contract_files: {
              agents: "apps/web/AGENTS.md",
              claude: "apps/web/CLAUDE.md",
            },
            architecture_module: "docs/architecture/modules/apps-web/web.md",
            workstream_dir: "tasks/workstreams/apps-web/web",
            lsp_profile: "typescript-lsp",
            verification_hints: ["web checks"],
          },
        ],
      }, null, 2) + "\n");
      writeFileSync(join(cwd, ".ai/context/agent-context-blocks.txt"), "apps/web\n");
      writeFileSync(join(cwd, ".ai/context/context-map.json"), JSON.stringify({
        version: 1,
        profile: "stable-root-progressive-subdir",
        lsp_profiles: { default: "typescript-lsp" },
        root_context_files: ["CLAUDE.md", "AGENTS.md"],
        discoverable_contexts: [],
      }, null, 2));
      writeFileSync(join(cwd, "apps/web/AGENTS.md"), "# Existing Web Contract\n\n- Keep manual rule.\n");
      const fakeBin = join(cwd, "bin");
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(fakeBin, "repo-harness"), `#!/bin/bash\nexec bun "${join(ROOT, "src/cli/index.ts")}" "$@"\n`);
      expect(run("chmod", ["+x", join(fakeBin, "repo-harness")], cwd).status).toBe(0);

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/routes/account.tsx" } }),
        env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ArchitectureDrift] Request:");
      expect(res.stdout).toContain("[ContextContractSync] Updated apps/web/AGENTS.md and apps/web/CLAUDE.md.");
      expect(res.stdout).toContain("[CapabilityContext] Queued apps-web");
      expect(existsSync(join(cwd, ".ai/harness/architecture/events.jsonl"))).toBe(true);
      expect(readFileSync(join(cwd, ".ai/harness/capability-context/requests.jsonl"), "utf-8")).toContain('"capability_id":"apps-web"');

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
      expect(agents).toContain("tasks/todo.md` is the deferred-goal ledger");
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
      const requestFile = readdirSync(join(cwd, "docs/architecture/requests")).find((name) =>
        name.endsWith(".md")
      );
      expect(requestFile).toBeDefined();
      const request = readFileSync(join(cwd, "docs/architecture/requests", requestFile || ""), "utf-8");
      expect(request).toContain("Mermaid fenced block");
      expect(request).toContain("Markdown semantic source");
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

  test("context-pressure: Codex apply_patch warns on dirty plan annotations", () => {
    const cwd = tmpWorkspace("context-pressure-plan-guard");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1200-test.md"),
        "# Plan: test\n\n> **Status**: Draft\n"
      );
      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "seed plan"], cwd).status).toBe(0);

      appendFileSync(join(cwd, "plans/plan-20260304-1200-test.md"), "- [NOTE]: codex annotation\n");

      const applyPatchRes = runHook("context-pressure-hook.sh", cwd, {
        stdin: JSON.stringify({ tool_name: "apply_patch" }),
      });
      expect(applyPatchRes.status).toBe(0);
      expect(applyPatchRes.stdout).toContain("[AnnotationGuard]");
      expect(applyPatchRes.stdout).toContain("plans/plan-20260304-1200-test.md");

      const bashRes = runHook("context-pressure-hook.sh", cwd, {
        stdin: JSON.stringify({ tool_name: "Bash" }),
      });
      expect(bashRes.status).toBe(0);
      expect(bashRes.stdout).not.toContain("[AnnotationGuard]");
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

  test("session-start-context injects capability-context queue reminders without a resume packet", () => {
    const cwd = tmpWorkspace("session-start-capability-context");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/capability-context"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/capability-context/requests.jsonl"),
        `${JSON.stringify({
          status: "pending",
          request_id: "apps-web:apps/web/page.tsx:manual",
          capability_id: "apps-web",
          path: "apps/web/page.tsx",
          matched_prefix: "apps/web",
          ts: "2026-05-29T00:00:00.000Z",
          source: "cli",
        })}\n`,
      );

      const res = runHook("session-start-context.sh", cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("SessionStart");
      expect(res.stdout).toContain("Capability Context Queue");
      expect(res.stdout).toContain("repo-harness capability-context sync --pending --apply");
      expect(res.stdout).toContain("apps-web");
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
      writeActivePlan(cwd, "plans/plan-20260304-1300-demo.md");

      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "seed plan"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "implement it all now" }),
      });

      expect(res.status).toBe(2);
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
      writeActivePlan(cwd, "plans/plan-20260304-1310-demo.md");

      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "seed approved plan"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "implement it all now" }),
      });

      expect(res.status).toBe(2);
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

  test("prompt-guard: starts a Draft plan workflow for plain new-feature requests", () => {
    const cwd = tmpWorkspace("prompt-guard-feature-plan-start");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "我要开发新功能：做一个设置页" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStartGate]");
      expect(res.stdout).toContain("Created plan:");
      expect(res.stdout).toContain("[BDD] Feature intent detected");
      const plans = readdirSync(join(cwd, "plans")).filter((name) =>
        /^plan-\d{8}-\d{4}-feature-plan-\d{6}\.md$/.test(name)
      );
      expect(plans).toHaveLength(1);
      const plan = readFileSync(join(cwd, "plans", plans[0]), "utf-8");
      expect(plan).toContain("# Plan: 我要开发新功能：做一个设置页");
      expect(plan).toContain("> **Status**: Draft");
      const todo = readFileSync(join(cwd, "tasks/todo.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("> **Status**: Backlog");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: starts a Draft plan workflow when Waza think prompt includes expanded skill context", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-start-expanded-skill");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message: [
            "plan this hook capture flow with [$think](/Users/ancienttwo/.agents/skills/think/SKILL.md)",
            "",
            "<skill>",
            THINK_SKILL_BODY,
            "</skill>",
          ].join("\n"),
        }),
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

  test("prompt-guard: starts a new Draft plan even when an older Draft plan exists", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-start-existing-draft");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(
        join(cwd, "plans/plan-20260304-0900-old-draft.md"),
        "# Plan: old draft\n\n> **Status**: Draft\n"
      );
      expect(run("touch", ["-t", "202001010000", "plans/plan-20260304-0900-old-draft.md"], cwd).status).toBe(0);
      writeFileSync(join(cwd, "tasks/research.md"), "# Research\n\nFresh enough for a new planning slice.\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "plan this independent hook capture repair with $think" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStartGate]");
      expect(res.stdout).toContain("Starting independent file-backed Draft plan workflow");
      expect(res.stdout).not.toContain("Active plan already exists");
      const plans = readdirSync(join(cwd, "plans")).filter((name) =>
        /^plan-\d{8}-\d{4}-plan-this-independent-hook-capture-repair-with-think\.md$/.test(name)
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

  test("prompt-guard: does not start plan workflow for explanatory mentions of Waza think", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-start-think-mention");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message: "我一直在开发都有使用 plan 或 [$think](/Users/ancienttwo/.agents/skills/think/SKILL.md)，脚本应该自动激活吗",
        }),
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

  test("prompt-guard: captures embedded approved plan and projects todo before implementation", () => {
    const cwd = tmpWorkspace("prompt-guard-embedded-approved-plan");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "plans/plan-20260304-0900-stale-draft.md"),
        "# Plan: stale draft\n\n> **Status**: Draft\n"
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message: [
            "PLEASE IMPLEMENT THIS PLAN:",
            "# Plan: Hook Capture Repair",
            "",
            "## Task Breakdown",
            "- [ ] Capture approved prompt plan",
            "- [ ] Project todo before implementation",
          ].join("\n"),
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanCaptureGate] Embedded approved plan detected");
      expect(res.stdout).toContain("Captured plan:");
      expect(res.stdout).toContain("Prepared sprint artifacts");
      const plans = readdirSync(join(cwd, "plans")).filter((name) =>
        /^plan-\d{8}-\d{4}-hook-capture-repair\.md$/.test(name)
      );
      expect(plans).toHaveLength(1);
      expect(readFileSync(join(cwd, ".ai/harness/active-plan"), "utf-8")).toBe(`plans/${plans[0]}`);
      expect(readFileSync(join(cwd, ".claude/.active-plan"), "utf-8")).toBe(`plans/${plans[0]}`);
      expect(readFileSync(join(cwd, ".ai/harness/active-worktree"), "utf-8").trim()).toBe(cwd);
      const todo = readFileSync(join(cwd, "tasks/todo.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).toContain("> **Status**: Backlog");
      expect(todo).not.toContain("- [ ] Capture approved prompt plan");
      const plan = readFileSync(join(cwd, "plans", plans[0]), "utf-8");
      expect(plan).toContain("- [ ] Capture approved prompt plan");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: captures pure plan-shaped markdown without implementation prefix", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-shaped-markdown");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message: [
            "# Enterprise Brain Semantic Index Plan",
            "",
            "## Summary",
            "",
            "P1 map: keep Postgres as the fact layer.",
            "P2 path: publish queues semantic projection.",
            "P3 decision: gbrain stays a rebuildable working layer.",
            "",
            "## Key Changes",
            "",
            "- Add semantic index projection state.",
            "- Add agent search gateway.",
            "",
            "## Tests",
            "",
            "- [ ] Projection excludes Markdown body",
            "- [ ] Agent search filters unauthorized domains",
          ].join("\n"),
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanCaptureGate] Embedded approved plan detected");
      expect(res.stdout).toContain("Captured plan:");
      expect(res.stdout).toContain("Prepared sprint artifacts");
      const plans = readdirSync(join(cwd, "plans")).filter((name) =>
        /^plan-\d{8}-\d{4}-enterprise-brain-semantic-index-plan\.md$/.test(name)
      );
      expect(plans).toHaveLength(1);
      const todo = readFileSync(join(cwd, "tasks/todo.md"), "utf-8");
      expect(todo).toContain("# Deferred Goal Ledger");
      expect(todo).not.toContain("- [ ] Projection excludes Markdown body");
      const plan = readFileSync(join(cwd, "plans", plans[0]), "utf-8");
      expect(plan).toContain("- [ ] Projection excludes Markdown body");
      expect(plan).toContain("- [ ] Agent search filters unauthorized domains");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats trigger questions with plan examples as questions, not approval", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-example-question");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message: [
            "比如我贴已生成的方案，例如这样，会触发吗：",
            "# Enterprise Brain Semantic Index Plan",
            "",
            "## Summary",
            "",
            "P1 map: keep Postgres as the fact layer.",
            "P2 path: publish queues semantic projection.",
            "P3 decision: execute through a rebuildable working layer.",
            "",
            "## Key Changes",
            "",
            "- Add semantic index projection state.",
            "",
            "## Tests",
            "",
            "- [ ] Projection excludes Markdown body",
          ].join("\n"),
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("[PlanCaptureGate]");
      expect(existsSync(join(cwd, "plans"))).toBe(false);
      expect(existsSync(join(cwd, "tasks/todo.md"))).toBe(false);
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

      expect(res.status).toBe(2);
      expect(res.stdout).toContain("No active plan found in plans/");
      expect(res.stdout).toContain("capture-plan.sh");
      expect(res.stdout).toContain("ensure-task-workflow.sh");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats diagnostic questions mentioning execution as questions", () => {
    const cwd = tmpWorkspace("prompt-guard-diagnostic-execute");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeActivePlan(cwd, "plans/plan-20260529-0006-missing.md");

      for (const prompt of ["为什么 hook 没开 wt 去执行？", "为什么 hook 没开 worktree？"]) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });

        expect(res.status).toBe(0);
        expect(res.stdout).not.toContain("[PlanStatusGuard]");
        expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
      }

      rmSync(join(cwd, ".ai/harness/active-plan"), { force: true });
      rmSync(join(cwd, ".claude/.active-plan"), { force: true });
      rmSync(join(cwd, ".ai/harness/active-worktree"), { force: true });
      const executeRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始执行" }),
      });
      expect(executeRes.status).toBe(2);
      expect(executeRes.stdout).toContain("[PlanStatusGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats stale active-plan marker as advisory and self-heals", () => {
    const cwd = tmpWorkspace("prompt-guard-stale-marker");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      // Marker points at a plan file that no longer exists (stale).
      writeActivePlan(cwd, "plans/plan-20260529-0006-deleted.md");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
      });

      // Stale marker must NOT hard-block. Hook should emit an advisory and
      // self-heal the marker so the next prompt is not blocked again.
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStatusGuard]");
      expect(res.stdout).toMatch(/stale|self-heal|cleared/i);
      expect(res.stdout).not.toContain("No active plan found in plans/");
      expect(existsSync(join(cwd, ".ai/harness/active-plan"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/.active-plan"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/active-worktree"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: ignores active-plan marker owned by a different worktree", () => {
    const cwd = tmpWorkspace("prompt-guard-cross-worktree");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      // Plan/contract/notes intentionally not provisioned here. The key signal
      // is the marker pointing at /tmp/other-owner instead of cwd. The hook
      // must treat that as foreign and refuse to hard-block this worktree.
      const planPath = "plans/plan-20260304-1400-cross-worktree.md";
      writeFileSync(join(cwd, ".ai/harness/active-plan"), planPath);
      writeFileSync(join(cwd, ".claude/.active-plan"), planPath);
      writeFileSync(join(cwd, ".ai/harness/active-worktree"), "/tmp/some-other-worktree-owner\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
      });

      // Cross-worktree marker must self-heal: hook emits advisory, clears the
      // foreign markers, and exits cleanly so the next prompt is not blocked.
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStatusGuard]");
      expect(res.stdout).toMatch(/different worktree|other worktree|foreign|not owned|stale|self-heal|cleared/i);
      expect(res.stdout).not.toContain("No active plan found in plans/");
      // The foreign marker should be wiped so subsequent prompts start fresh.
      expect(existsSync(join(cwd, ".ai/harness/active-plan"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/.active-plan"))).toBe(false);
      expect(existsSync(join(cwd, ".ai/harness/active-worktree"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: stale marker does not block embedded approved plan capture", () => {
    const cwd = tmpWorkspace("prompt-guard-stale-marker-embedded");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      // Dirty marker before the user pastes an explicit approved plan body.
      writeActivePlan(cwd, "plans/plan-20260529-0006-deleted.md");

      const body = [
        "PLEASE IMPLEMENT THIS PLAN:",
        "# Plan: explicit-capture",
        "",
        "> **Status**: Approved",
        "",
        planEvidenceContract(),
        "",
      ].join("\n");
      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: body }),
      });

      // Stale marker must not preempt the embedded approved-plan capture.
      expect(res.stdout).toContain("[PlanCaptureGate]");
      expect(res.stdout).not.toMatch(/\[PlanStatusGuard\] No active plan found/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats discussion-style implementation questions as questions", () => {
    const cwd = tmpWorkspace("prompt-guard-discussion-implement");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      // No marker at all - only the implement_intent path is under test.
      // Each prompt is a question form that happens to contain
      // 实现/执行/implement/execute tokens. is_diagnostic_question_intent
      // must recognize them as questions and not as imperative implement
      // requests, regardless of marker state.
      const discussionPrompts = [
        "怎么实现这个功能？",
        "如何实现这个 plan？",
        "为什么这个方案的执行流程会被拦？",
        "how should we implement the plan?",
      ];

      for (const prompt of discussionPrompts) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });

        // Pure discussion questions must not trigger PlanStatusGuard hard-block,
        // even though they contain "实现/执行/implement/execute" tokens.
        expect(res.status).toBe(0);
        expect(res.stdout).not.toContain("[PlanStatusGuard] No active plan found");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats Claude plan refinement as planning review despite pasted execution metadata", () => {
    const cwd = tmpWorkspace("prompt-guard-claude-plan-review");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, "plans/plan-20260529-0105-existing.md"),
        "# Plan: existing\n\n> **Status**: Draft\n"
      );

      const prompts = [
        [
          "你来完善一下Claude这个方案：",
          "",
          "/think 现在的hook我记得是在完成一个任务的时候，推荐下一个相关连的任务（下一刀）。",
          "我想加一个功能就是，当任务基本开发完成，则推荐使用 /check 进行 checkout 提交合并到main，并清理掉分支。",
          "ExitPlanMode",
        ].join("\n"),
        [
          "你来review一下Claude这个plan：",
          "",
          "我来分析这个需求。",
          "- Done",
          "- execute the implementation",
          "ExitPlanMode",
        ].join("\n"),
      ];

      for (const prompt of prompts) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });

        expect(res.status).toBe(0);
        expect(res.stdout).not.toContain("[ResearchGate]");
        expect(res.stdout).not.toContain("[PlanStatusGuard]");
        expect(res.stdout).not.toContain("[ContractGuard]");
        expect(existsSync(join(cwd, ".ai/harness/active-plan"))).toBe(false);
      }
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
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      const planPath = "plans/plan-20260304-1400-demo.md";
      writeActivePlan(cwd, planPath);
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

      expect(res.status).toBe(2);
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
      writeActivePlan(cwd, "plans/plan-20260304-1400-demo.md");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "mark done now" }),
      });

      expect(res.status).toBe(2);
      expect(res.stdout).toContain("[ContractGuard]");
      expect(res.stdout).toContain("Missing task contract");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: long plan-style prompt with literal Completed token does not trigger done", () => {
    const cwd = tmpWorkspace("prompt-guard-done-noisefilter");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1400-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );
      writeActivePlan(cwd, "plans/plan-20260304-1400-demo.md");

      // Mirrors the brain-promotion-cli regression: a long markdown body where
      // `Completed` only appears as a state-enum value in a description, never
      // as a user declaration that the task is done.
      const longPlanPrompt = [
        "Continuing the brain-promotion CLI work after a context compact event.",
        "Plan body for reference (not a fresh approved plan, just describing state):",
        "- archive-workflow.sh emits BrainPromote only for the Completed enum value",
        "- update tests for BrainPromote pass/Completed-only behavior across hooks",
        "- migrate path defaults to ~/brain and accept legacy icloud/brain with warning",
        "- ensure CLI surface is tested under tests/cli/brain.test.ts before merge",
        "The point of this paragraph is to push the prompt above the 280 byte",
        "threshold so the long-prompt branch of is_done_intent activates.",
      ].join("\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: longPlanPrompt }),
      });

      expect(res.stdout).not.toContain("[ContractGuard]");
      expect(res.status).not.toBe(2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: short prompt with completionToken substring does not trigger done", () => {
    const cwd = tmpWorkspace("prompt-guard-done-substring");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1401-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );
      writeActivePlan(cwd, "plans/plan-20260304-1401-demo.md");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "refresh the completionToken cache" }),
      });

      expect(res.stdout).not.toContain("[ContractGuard]");
      expect(res.status).not.toBe(2);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: short Chinese future-completion wording does not trigger done", () => {
    const cwd = tmpWorkspace("prompt-guard-done-chinese-future");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1402-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );
      writeActivePlan(cwd, "plans/plan-20260304-1402-demo.md");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "完成后验证这段 CLI 行为" }),
      });

      expect(res.stdout).not.toContain("[ContractGuard]");
      expect(res.status).not.toBe(2);
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
      writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");
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
      writeFileSync(
        join(cwd, "scripts/archive-workflow.sh"),
        "#!/bin/bash\nset -euo pipefail\necho \"[archive] mocked $*\"\n"
      );
      expect(run("chmod", ["+x", "scripts/archive-workflow.sh"], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[verify] ok");
      expect(res.stdout).toContain("[AutoArchive] All quality gates passed");
      expect(res.stdout).toContain("[archive] mocked");
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
      writeActivePlan(cwd, "plans/plan-20260304-1415-demo.md");
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

      expect(res.status).toBe(2);
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
        writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");
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

        expect(res.status).toBe(2);
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
      writeActivePlan(cwd, "plans/plan-20260304-1420-demo.md");
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

      expect(res.status).toBe(2);
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
      expect(refRes.status).toBe(2);
      expect(refRes.stdout).toContain("[ExternalReferenceGuard]");
      expect(refRes.stdout).toContain('"guard":"ExternalReferenceGuard"');
      expect(refRes.stderr).toContain("[ExternalReferenceGuard]");

      const secretRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "_ops/env/.env.production" } }),
      });
      expect(secretRes.status).toBe(2);
      expect(secretRes.stdout).toContain("[OpsPrivateGuard]");
      expect(secretRes.stdout).toContain('"guard":"OpsPrivateGuard"');
      expect(secretRes.stderr).toContain("[OpsPrivateGuard]");

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

      expect(res.status).toBe(2);
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
      writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");

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
      writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");

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
      writeActivePlan(cwd, "plans/plan-20260304-1600-demo.md");
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

  test("post-bash: preserves verify-sprint evidence in checks latest", () => {
    const cwd = tmpWorkspace("post-bash-preserve-verify-sprint");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      writeValidSprintChecks(cwd);

      const res = runHook("post-bash.sh", cwd, {
        stdin: JSON.stringify({
          tool_input: { command: "git status --short" },
          tool_output: "",
          exit_code: 0,
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Preserved .ai/harness/checks/latest.json");
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
      const postBash = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/post-bash-latest.json"), "utf-8"));
      expect(latest.source).toBe("verify-sprint");
      expect(postBash.source).toBe("post-bash");
      expect(postBash.command).toBe("git status --short");
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
