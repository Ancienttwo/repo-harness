import { describe, test, expect, setDefaultTimeout } from "bun:test";
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
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { platform, tmpdir } from "os";
import { dirname, join } from "path";
import { spawnSync } from "child_process";

const HOOK_RUNTIME_TIMEOUT_MS = 60000;
const HOOK_RUNTIME_SPAWN_BUFFER_BYTES = 16 * 1024 * 1024;

// Every test here spawns bash hook scripts (each forking git/jq/bun
// subprocesses) several times; one invocation can exceed 2s under parallel
// session load, so the 5s bun default flakes on multi-invocation tests.
setDefaultTimeout(HOOK_RUNTIME_TIMEOUT_MS);

const ROOT = join(import.meta.dir, "..");
const ASSETS_HOOKS_DIR = join(ROOT, "assets/hooks");
const TEST_NODE_PATH = resolveTestNodePath();
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
  writeFileSync(join(cwd, ".ai/harness/active-plan"), planPath);
  writeFileSync(join(cwd, ".ai/harness/active-worktree"), `${realpathSync(cwd)}\n`);
}

function planEvidenceContract(): string {
  return [
    "## Evidence Contract",
    "",
    "- **State/progress path**: tasks/todos.md and tasks/notes/demo.notes.md",
    "- **Verification evidence**: .ai/harness/checks/latest.json and verify-sprint",
    "- **Evaluator rubric**: sprint review must recommend pass",
    "- **Stop condition**: stop on failing contract verification",
    "- **Rollback surface**: revert generated task files and changed source files",
    "",
    "## Promotion Gate",
    "",
    "- **Merge/PR unit**: demo branch is the reviewed merge unit",
    "- **Rollback surface**: revert generated task files and changed source files",
    "- **Verification boundary**: verify-sprint and hook runtime checks",
    "- **Review/acceptance boundary**: sprint review must recommend pass",
    "- **High-risk surface**: hook guard workflow state",
    "- **Why not checklist row**: fixture exercises approved-plan gating",
  ].join("\n");
}

function passingContractFixture(status = "Pending"): string {
  return [
    "# Task Contract: demo",
    "",
    `> **Status**: ${status}`,
    "",
    "```yaml",
    "exit_criteria:",
    "  files_exist:",
    "    - tracked.txt",
    "```",
    "",
  ].join("\n");
}

function writeAccountCapabilityRegistry(cwd: string): void {
  mkdirSync(join(cwd, ".ai/context"), { recursive: true });
  writeFileSync(join(cwd, ".ai/context/capabilities.json"), JSON.stringify({
    version: 1,
    capabilities: [
      {
        id: "apps-web-account",
        domain: "apps-web",
        name: "account",
        prefixes: ["apps/web/src/routes/account"],
        contract_files: {
          agents: "apps/web/src/routes/account/AGENTS.md",
          claude: "apps/web/src/routes/account/CLAUDE.md",
        },
        architecture_module: "docs/architecture/modules/apps-web/account.md",
        workstream_dir: "tasks/workstreams/apps-web/account",
        lsp_profile: "typescript-lsp",
        verification_hints: ["account checks"],
      },
    ],
  }, null, 2) + "\n");
}

function writeDoneCapabilityRegistry(cwd: string): void {
  mkdirSync(join(cwd, ".ai/context"), { recursive: true });
  mkdirSync(join(cwd, "docs/architecture/requests"), { recursive: true });
  writeFileSync(join(cwd, ".ai/context/capabilities.json"), JSON.stringify({
    version: 1,
    capabilities: [
      {
        id: "fixture-tracked-file",
        domain: "fixture",
        name: "tracked-file",
        prefixes: ["tracked.txt"],
        contract_files: { agents: "AGENTS.md", claude: "CLAUDE.md" },
        architecture_module: "docs/architecture/modules/fixture/tracked-file.md",
        workstream_dir: "tasks/workstreams/fixture/tracked-file",
        lsp_profile: "typescript-lsp",
        verification_hints: ["fixture checks"],
      },
    ],
  }, null, 2) + "\n");
  writeFileSync(join(cwd, "docs/architecture/index.md"), [
    "# Architecture Index",
    "",
    "## Pending Requests",
    "",
    "<!-- BEGIN ARCHITECTURE PENDING REQUESTS -->",
    "- (none)",
    "<!-- END ARCHITECTURE PENDING REQUESTS -->",
    "",
  ].join("\n"));
}

function externalAcceptanceAdvice(reviewer = "Codex", source = "codex-review", fingerprint?: string): string {
  return [
    "## External Acceptance Advice",
    "",
    "> **External Acceptance**: pass",
    `> **External Reviewer**: ${reviewer}`,
    `> **External Source**: ${source}`,
    "> **External Started**: 2026-03-04T14:05:00+0800",
    "> **External Completed**: 2026-03-04T14:06:00+0800",
    // Under rubric v1 the peer must bind acceptance to the exact diff reviewed.
    ...(fingerprint
      ? [
          "> **Review Rubric Version**: 1",
          `> **Reviewed Diff Fingerprint**: ${fingerprint}`,
          "> **Reviewed Scope**: branch+staged+unstaged+untracked",
        ]
      : []),
    "",
    "- P1 blockers: none",
    "- P2 advisories: none",
    "- Acceptance checklist: pass",
  ].join("\n");
}

function humanReviewCard(verdict = "pass", externalAcceptance = "pass"): string {
  return [
    "## Human Review Card",
    "",
    `- Verdict: ${verdict}`,
    "- Change type: code-change",
    "- Intended files changed: fixture",
    "- Actual files changed: fixture",
    "- Commands passed: fixture",
    `- External acceptance: ${externalAcceptance}`,
    "- Residual risks: (none)",
    "- Reviewer action required: approve fixture closeout",
    "- Rollback: revert fixture branch",
  ].join("\n");
}

function run(cmd: string, args: string[], cwd: string) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: HOOK_RUNTIME_SPAWN_BUFFER_BYTES,
  });
}

function resolveTestNodePath(): string | undefined {
  const candidates = [join(ROOT, "node_modules")];
  const commonDir = spawnSync(
    "git",
    ["-C", ROOT, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf-8" }
  );
  if (commonDir.status === 0) {
    candidates.push(join(dirname(commonDir.stdout.trim()), "node_modules"));
  }

  return candidates.find((candidate) => existsSync(candidate));
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
    maxBuffer: HOOK_RUNTIME_SPAWN_BUFFER_BYTES,
    env: {
      ...process.env,
      REPO_HARNESS_CLI: join(ROOT, "src/cli/index.ts"),
      REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
      ...(TEST_NODE_PATH ? { NODE_PATH: TEST_NODE_PATH } : {}),
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
  // Align the working branch with the default target (workflow_target_branch
  // resolves to `main`) so the review-fingerprint CLI can bind --base main.
  expect(run("git", ["branch", "-M", "main"], cwd).status).toBe(0);
}

function currentReviewFingerprint(cwd: string): string {
  const res = spawnSync("bun", [join(ROOT, "src/cli/hook-entry.ts"), "review-fingerprint", "--base", "main", "--format", "json"], {
    cwd,
    encoding: "utf-8",
    maxBuffer: HOOK_RUNTIME_SPAWN_BUFFER_BYTES,
    env: {
      ...process.env,
      ...(TEST_NODE_PATH ? { NODE_PATH: TEST_NODE_PATH } : {}),
    },
  });
  expect(res.status).toBe(0);
  const parsed = JSON.parse(res.stdout);
  expect(parsed.status).toBe("ok");
  expect(parsed.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  return parsed.fingerprint;
}

function reviewFingerprintMetadata(fingerprint: string): string {
  return [
    "> **Review Rubric Version**: 1",
    `> **Reviewed Diff Fingerprint**: ${fingerprint}`,
    "> **Reviewed Scope**: branch+staged+unstaged+untracked",
  ].join("\n");
}

function writeDoneGateBase(cwd: string, options: { archive?: boolean } = {}) {
  mkdirSync(join(cwd, "plans"), { recursive: true });
  mkdirSync(join(cwd, "tasks"), { recursive: true });
  mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
  mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
  mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });

  writeFileSync(
    join(cwd, "plans/plan-20260304-1410-demo.md"),
    ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
  );
  writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");
  writeFileSync(
    join(cwd, "tasks/todos.md"),
      "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1410-demo.md\n"
  );
  writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), passingContractFixture(options.archive ? "Fulfilled" : "Pending"));
  if (options.archive) writeDoneCapabilityRegistry(cwd);
  writeValidSprintChecks(cwd);
  void options;
}

function writePassingReview(cwd: string, fingerprint?: string) {
  writeFileSync(
    join(cwd, "tasks/reviews/demo.review.md"),
    [
      "# Task Review: demo",
      "",
      "> **Recommendation**: pass",
      ...(fingerprint ? ["", reviewFingerprintMetadata(fingerprint)] : []),
      "",
      humanReviewCard(),
      "",
      // Bind the External Acceptance section to the same fingerprint so the
      // peer's acceptance is for the current diff, not a stale earlier one.
      externalAcceptanceAdvice("Codex", "codex-review", fingerprint),
      "",
    ].join("\n")
  );
}

function installArchitectureHelpers(cwd: string) {
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  for (const fileName of ["architecture-queue.sh", "archive-architecture-request.sh", "context-contract-sync.sh", "workstream-sync.sh", "select-agent-context-blocks.sh", "capability-resolver.ts", "architecture-event.ts"]) {
    copyFileSync(join(ROOT, "assets/templates/helpers", fileName), join(cwd, "scripts", fileName));
  }
  expect(run("chmod", ["+x", "scripts/architecture-queue.sh", "scripts/archive-architecture-request.sh", "scripts/context-contract-sync.sh", "scripts/workstream-sync.sh", "scripts/select-agent-context-blocks.sh"], cwd).status).toBe(0);
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
  test("prompt-guard: ordinary, review, debug, workflow-discussion, and quoted prompts bypass the classifier", () => {
    const cwd = tmpWorkspace("explicit-first-bypass");
    try {
      installHooks(cwd);
      for (const prompt of [
        "这个登录 bug 报错了，帮我修复",
        "这是我的一个自动化hook framework，请review整个flow",
        "谁调用了 runHook？影响面是什么？",
        "这个重复工作适合做成 skill 或 automation 吗",
        "旧报告里写着“implement everything now”，你怎么看？",
      ]) {
        const result = runHook("prompt-guard.sh", cwd, { stdin: JSON.stringify({ prompt }) });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe("");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("trace-event records host attribution metadata", () => {
    const cwd = tmpWorkspace("trace-host-metadata");
    try {
      installHooks(cwd);

      const res = runHook("post-tool-observer.sh", cwd, {
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

  test("prompt-guard: workflow packaging discussion bypasses automatic routing", () => {
    const cwd = tmpWorkspace("agentic-packaging-route-hint");
    try {
      installHooks(cwd);

      const packagingRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这个重复工作适合做成 skill 或 automation 吗" }),
      });
      expect(packagingRes.status).toBe(0);
      expect(packagingRes.stdout).toBe("");

      const hookTriggerRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这是不是适合做成 hook 来触发用户授权去 plan 一个改进方案" }),
      });
      expect(hookTriggerRes.status).toBe(0);
      expect(hookTriggerRes.stdout).toBe("");
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

  test("subagent-return-channel-guard: appends spawn contract and blocks subagent SendUserMessage", () => {
    const cwd = tmpWorkspace("subagent-return-channel-guard");
    try {
      installHooks(cwd);

      const spawnRes = runHook("subagent-return-channel-guard.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "Task",
          tool_input: {
            description: "Explore repo",
            prompt: "Write the report.",
          },
        }),
      });
      expect(spawnRes.status).toBe(0);
      const spawnOutput = JSON.parse(spawnRes.stdout);
      expect(spawnOutput.hookSpecificOutput.permissionDecision).toBe("allow");
      expect(spawnOutput.hookSpecificOutput.updatedInput.prompt).toContain("[repo-harness:return-channel]");
      expect(spawnOutput.hookSpecificOutput.updatedInput.prompt).toContain("final text");
      expect(spawnOutput.hookSpecificOutput.updatedInput.description).toBe("Explore repo");

      const idempotentRes = runHook("subagent-return-channel-guard.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "Agent",
          tool_input: {
            prompt: `${spawnOutput.hookSpecificOutput.updatedInput.prompt}`,
          },
        }),
      });
      expect(idempotentRes.status).toBe(0);
      expect(idempotentRes.stdout).toBe("");

      const subagentSendRes = runHook("subagent-return-channel-guard.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "SendUserMessage",
          agent_id: "agent-a76667329ee54b65a",
          tool_input: {
            message: "## Full report",
          },
        }),
      });
      expect(subagentSendRes.status).toBe(0);
      const denyOutput = JSON.parse(subagentSendRes.stdout);
      expect(denyOutput.hookSpecificOutput.permissionDecision).toBe("deny");
      expect(denyOutput.hookSpecificOutput.permissionDecisionReason).toContain("does not reach the caller Agent tool result");

      const mainLoopSendRes = runHook("subagent-return-channel-guard.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "SendUserMessage",
          tool_input: {
            message: "Main loop delivery",
          },
        }),
      });
      expect(mainLoopSendRes.status).toBe(0);
      expect(mainLoopSendRes.stdout).toBe("");
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

  test("first-principles guard: reports overengineering advisories without blocking", () => {
    const cwd = tmpWorkspace("first-principles-guard");
    try {
      installHooks(cwd);
      initGitRepo(cwd);

      const noDiff = runHook("first-principles-guard.sh", cwd, { args: ["tracked.txt"] });
      expect(noDiff.status).toBe(0);
      expect(noDiff.stdout).toBe("");

      writeFileSync(
        join(cwd, "tracked.txt"),
        [
          "base",
          "import leftPad from 'left-pad';",
          "interface DemoAdapter {}",
          "// legacy shim branch",
          "if (a) {}",
          "} else if (b) {}",
          "switch (mode) {",
          "case 'x': break;",
          "}",
          "const settings = process.env.NEW_SETTING;",
          "const config = { featureFlag: true };",
        ].join("\n") + "\n"
      );

      const direct = runHook("first-principles-guard.sh", cwd, { args: ["tracked.txt"] });
      expect(direct.status).toBe(0);
      expect(direct.stdout).toContain("[FirstPrinciples] Compatibility debt additions detected");
      expect(direct.stdout).toContain("[FirstPrinciples] Branch-heavy additions detected");
      expect(direct.stdout).toContain("[FirstPrinciples] Abstraction-heavy additions detected");
      expect(direct.stdout).toContain("[FirstPrinciples] Dependency-surface additions detected");
      expect(direct.stdout).toContain("trust-boundary validation");

      const wrapper = runHook("anti-simplification.sh", cwd, { args: ["tracked.txt"] });
      expect(wrapper.status).toBe(0);
      expect(wrapper.stdout).toContain("[FirstPrinciples]");

      const postEdit = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "tracked.txt" } }),
      });
      expect(postEdit.status).toBe(0);
      expect(postEdit.stdout).toContain("[FirstPrinciples]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-edit-guard: ignores repo-local fake drift helpers under global-only helper runtime", () => {
    const cwd = tmpWorkspace("post-edit-sync-chain-warning");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      writeFileSync(
        join(cwd, "scripts/architecture-queue.sh"),
        "#!/bin/bash\necho drift blew up >&2\nexit 7\n"
      );
      expect(run("chmod", ["+x", "scripts/architecture-queue.sh"], cwd).status).toBe(0);

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/main.tsx" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("drift blew up");
      expect(res.stdout).toContain("[ArchitectureDrift] No architecture drift request for apps/web/src/main.tsx");
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

  test("post-edit-guard: skips unmatched low source-change root requests", () => {
    const cwd = tmpWorkspace("architecture-drift-unmatched-source");
    try {
      installHooks(cwd);
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, "apps/landing/src/pages"), { recursive: true });
      mkdirSync(join(cwd, "packages/landing-video"), { recursive: true });
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      writeFileSync(join(cwd, ".ai/context/capabilities.json"), JSON.stringify({
        version: 1,
        capabilities: [
          {
            id: "packages-landing-video",
            domain: "packages-landing-video",
            name: "landing-video",
            prefixes: ["packages/landing-video"],
            contract_files: {
              agents: "packages/landing-video/AGENTS.md",
              claude: "packages/landing-video/CLAUDE.md",
            },
            architecture_module: "docs/architecture/modules/packages-landing-video/landing-video.md",
            workstream_dir: "tasks/workstreams/packages-landing-video/landing-video",
            lsp_profile: "typescript-lsp",
            verification_hints: ["landing video checks"],
          },
        ],
      }, null, 2) + "\n");

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/landing/src/pages/about.astro" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[DocDrift] App source changed");
      expect(res.stdout).toContain("[ArchitectureDrift] No architecture drift request for apps/landing/src/pages/about.astro (unmatched source-change).");
      expect(res.stdout).not.toContain("[ArchitectureDrift] Request:");
      const requestsDir = join(cwd, "docs/architecture/requests");
      const requestFiles = existsSync(requestsDir)
        ? readdirSync(requestsDir).filter((name) => name.endsWith(".md"))
        : [];
      expect(requestFiles).toHaveLength(0);
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
      writeAccountCapabilityRegistry(cwd);
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
  }, HOOK_RUNTIME_TIMEOUT_MS);

  test("workstream-sync creates capability ledger and projects pointers into local contract", () => {
    const cwd = tmpWorkspace("workstream-sync");
    try {
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, "apps/web/src/routes/account"), { recursive: true });
      writeAccountCapabilityRegistry(cwd);
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
      expect(agents).toContain("tasks/todos.md` is the deferred-goal ledger");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("workstream-sync accepts file capability prefixes", () => {
    const cwd = tmpWorkspace("workstream-sync-file-prefix");
    try {
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, ".ai/context"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/policy.json"), "{}\n");
      writeFileSync(join(cwd, ".ai/context/capabilities.json"), JSON.stringify({
        version: 1,
        capabilities: [
          {
            id: "workflow-engine-contract-assets",
            domain: "workflow-engine",
            name: "contract-assets",
            prefixes: [".ai/harness/policy.json"],
            contract_files: {
              agents: ".ai/harness/AGENTS.md",
              claude: ".ai/harness/CLAUDE.md",
            },
            architecture_module: "docs/architecture/modules/workflow-engine/contract-assets.md",
            workstream_dir: "tasks/workstreams/workflow-engine/contract-assets",
            lsp_profile: "typescript-lsp",
            verification_hints: ["policy checks"],
          },
        ],
      }, null, 2) + "\n");

      const res = run("bash", [
        "scripts/workstream-sync.sh",
        "ensure",
        "--block",
        ".ai/harness/policy.json",
        "--slug",
        "cleanup-script-policy",
        "--title",
        "Cleanup Script Policy",
      ], cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[WorkstreamSync] Ensured tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md");
      expect(existsSync(join(cwd, "tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md"))).toBe(true);

      const workstream = readFileSync(join(cwd, "tasks/workstreams/workflow-engine/contract-assets/cleanup-script-policy.md"), "utf-8");
      expect(workstream).toContain("> **Functional Block**: `.ai/harness/policy.json`");
      expect(workstream).toContain("> **Matched Prefix**: `.ai/harness/policy.json`");

      const agents = readFileSync(join(cwd, ".ai/harness/AGENTS.md"), "utf-8");
      expect(agents).toContain("Functional block: `.ai/harness/policy.json`");
      expect(agents).toContain("Durable progress lives under `tasks/workstreams/workflow-engine/contract-assets`.");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("architecture-drift helper marks workflow-surface changes as spawn recommended", () => {
    const cwd = tmpWorkspace("architecture-drift-high");
    try {
      installArchitectureHelpers(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });

      const res = run("bash", ["scripts/architecture-queue.sh", "record", "--file", ".ai/hooks/pre-edit-guard.sh"], cwd);

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


  test("post-tool observer records trace without context budget side effects", () => {
    const cwd = tmpWorkspace("post-tool-no-budget");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const s1a = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-a" },
      });
      expect(s1a.status).toBe(0);

      const s1b = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-a" },
      });
      expect(s1b.status).toBe(0);

      const s2 = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-b" },
      });
      expect(s2.status).toBe(0);

      const followup = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "warnsession" },
      });
      expect(followup.status).toBe(0);
      expect(followup.stdout).not.toContain("ContextMonitor");
      expect(followup.stdout).not.toContain("Yellow zone");
      expect(followup.stdout).not.toContain("/compact");
      expect(existsSync(join(cwd, ".claude/.trace.jsonl"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/.tool-call-count"))).toBe(false);
      expect(existsSync(join(cwd, ".claude/.context-pressure"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-tool observer: Codex apply_patch warns on dirty plan annotations", () => {
    const cwd = tmpWorkspace("post-tool-plan-guard");
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

      const applyPatchRes = runHook("post-tool-observer.sh", cwd, {
        stdin: JSON.stringify({ tool_name: "apply_patch" }),
      });
      expect(applyPatchRes.status).toBe(0);
      expect(applyPatchRes.stdout).toContain("[AnnotationGuard]");
      expect(applyPatchRes.stdout).toContain("plans/plan-20260304-1200-test.md");

      const bashRes = runHook("post-tool-observer.sh", cwd, {
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

      // Run trace-event from /tmp — hook-input should resolve the workspace via
      // SCRIPT_DIR fallback, cd there, and write trace state inside the workspace.
      const res = spawnSync(
        "bash",
        [join(workspace, ".ai/hooks/post-tool-observer.sh")],
        {
          cwd: tmpdir(),
          input: "",
          encoding: "utf-8",
        }
      );
      expect(res.status).toBe(0);
      expect(existsSync(join(workspace, ".claude/.trace.jsonl"))).toBe(true);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("session-start-context injects only active generated Codex resume packets", () => {
    const cwd = tmpWorkspace("session-start-context");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });

      writeFileSync(join(cwd, ".ai/harness/handoff/resume.md"), "# Codex Resume Packet\n\n> **Reason**: bootstrap\n");
      const bootstrapRes = runHook("session-start-context.sh", cwd);
      expect(bootstrapRes.status).toBe(0);
      expect(bootstrapRes.stdout.trim()).toBe("");

      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        [
          "# Codex Resume Packet",
          "<!-- generated-by: repo-harness codex-handoff-resume v1 -->",
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

      const idleCodexRes = runHook("session-start-context.sh", cwd, { env: { HOOK_HOST: "codex" } });
      expect(idleCodexRes.status).toBe(0);
      expect(idleCodexRes.stdout.trim()).toBe("");

      writeFileSync(
        join(cwd, ".ai/harness/handoff/current.md"),
        [
          "# Harness Handoff",
          "",
          "## Changed Files",
          "",
          "```",
          "src/example.ts",
          "```",
        ].join("\n")
      );
      appendFileSync(join(cwd, ".ai/harness/handoff/resume.md"), "\n");

      const res = runHook("session-start-context.sh", cwd, { env: { HOOK_HOST: "codex" } });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("SessionStart");
      expect(res.stdout).toContain("additionalContext");
      expect(res.stdout).toContain("fresh Codex session");
      expect(res.stdout).toContain("Input Priority");
      expect(res.stdout).toContain("# Files mentioned by the user");
      expect(res.stdout).toContain("pasted-text.txt");
      expect(res.stdout.indexOf("Input Priority") >= 0).toBe(true);
      expect(res.stdout.indexOf("Input Priority") < res.stdout.indexOf("fresh Codex session")).toBe(true);
      expect(res.stdout).not.toContain("[CrossReview]");
      expect(res.stdout).not.toContain("/claude-review");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("session-start-context skips resume packets older than current handoff", () => {
    const cwd = tmpWorkspace("session-start-stale-resume");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });

      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        [
          "# Codex Resume Packet",
          "<!-- generated-by: repo-harness codex-handoff-resume v1 -->",
          "",
          "> **Reason**: manual",
          "",
          "## Resume Prompt",
          "",
          "Old resume packet that must not be injected.",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n\n## Changed Files\n\n```\nsrc/newer.ts\n```\n");

      const oldTime = new Date("2026-05-25T09:00:00Z");
      const newTime = new Date("2026-05-29T09:00:00Z");
      utimesSync(join(cwd, ".ai/harness/handoff/resume.md"), oldTime, oldTime);
      utimesSync(join(cwd, ".ai/harness/handoff/current.md"), newTime, newTime);

      const res = runHook("session-start-context.sh", cwd);
      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("session-start-context ignores resume packets with the retired project-initializer marker", () => {
    const cwd = tmpWorkspace("session-start-retired-marker");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });

      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        [
          "# Codex Resume Packet",
          "<!-- generated-by: project-initializer codex-handoff-resume v1 -->",
          "",
          "> **Reason**: manual",
          "",
          "## Resume Prompt",
          "",
          "Retired-marker resume packet that must not be injected.",
        ].join("\n")
      );

      const res = runHook("session-start-context.sh", cwd, { env: { HOOK_HOST: "codex" } });
      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("");
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
      expect(res.stdout).not.toContain("[CrossReview]");

      const codexRes = runHook("session-start-context.sh", cwd, { env: { HOOK_HOST: "codex" } });
      expect(codexRes.status).toBe(0);
      expect(codexRes.stdout).toContain("Capability Context Queue");
      expect(codexRes.stdout).not.toContain("[CrossReview]");
      expect(codexRes.stdout).not.toContain("/claude-review");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("session-start-context injects architecture queue reminders without a resume packet", () => {
    const cwd = tmpWorkspace("session-start-architecture-queue");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "docs/architecture/requests"), { recursive: true });
      writeFileSync(
        join(cwd, "docs/architecture/requests/apps-web.md"),
        [
          "# Architecture Drift Request: apps-web",
          "",
          "> **Status**: Pending",
          "> **Detected**: 2026-06-01T12:00:00+0800",
          "> **Severity**: high",
          "> **Capability ID**: `apps-web`",
          "",
        ].join("\n"),
      );

      const res = runHook("session-start-context.sh", cwd);
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("SessionStart");
      expect(res.stdout).toContain("Architecture Queue");
      expect(res.stdout).toContain("1 capabilities have pending architecture drift");
      expect(res.stdout).toContain("repo-harness run architecture-queue status");
      expect(res.stdout).not.toContain("[CrossReview]");

      const codexRes = runHook("session-start-context.sh", cwd, { env: { HOOK_HOST: "codex" } });
      expect(codexRes.status).toBe(0);
      expect(codexRes.stdout).toContain("Architecture Queue");
      expect(codexRes.stdout).not.toContain("[CrossReview]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("session-start-context injects pending plan capture reminder without a resume packet", () => {
    const cwd = tmpWorkspace("session-start-pending-plan-capture");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/planning/pending.json"),
        JSON.stringify(
          {
            version: 1,
            kind: "dynamic-workflow",
            host: "codex",
            prompt_slug: "dynamic-workflow-plan",
            draft_plan_path: "plans/plan-20260530-0016-dynamic-workflow-plan.md",
            source_ref: "dynamic workflow plan discussion",
            expected_artifact: "plans/plan-*.md",
            cwd,
            created_at: "2026-05-30T00:16:00+0800",
          },
          null,
          2
        ) + "\n"
      );

      const res = runHook("session-start-context.sh", cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Pending Plan Capture");
      expect(res.stdout).toContain("Input Priority");
      expect(res.stdout.indexOf("Input Priority") < res.stdout.indexOf("Pending Plan Capture")).toBe(true);
      expect(res.stdout).toContain("dynamic-workflow");
      expect(res.stdout).toContain("repo-harness run capture-plan");
      expect(res.stdout).toContain("do not edit implementation files");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("session-start-context points non-target worktrees at target current status snapshot", () => {
    const cwd = tmpWorkspace("session-start-current-status");
    try {
      installHooks(cwd);
      initGitRepo(cwd);
      expect(run("git", ["branch", "-M", "main"], cwd).status).toBe(0);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(
        join(cwd, "tasks/current.md"),
        [
          "# Current Status Snapshot",
          "",
          "> **Status**: Active",
          "> **Updated At**: 2026-03-04T16:00:00+0000",
          "> **Source Commit**: base",
          "",
        ].join("\n")
      );
      expect(run("git", ["add", "tasks/current.md"], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "add current status"], cwd).status).toBe(0);
      expect(run("git", ["checkout", "-b", "feature/current-status"], cwd).status).toBe(0);

      const res = runHook("session-start-context.sh", cwd);

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Current Status Snapshot");
      expect(res.stdout).toContain("Input Priority");
      expect(res.stdout.indexOf("Input Priority") < res.stdout.indexOf("Current Status Snapshot")).toBe(true);
      expect(res.stdout).toContain("git show main:tasks/current.md");
      expect(res.stdout).toContain("Target snapshot metadata: status=Active");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("session-start-context emits tooling update agent actions once per cached report", () => {
    const cwd = tmpWorkspace("session-start-tooling-update");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/workflow-contract.json"), "{}\n");

      const fakeBin = join(cwd, "fake-bin");
      const logFile = join(cwd, "tooling-check.log");
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        join(fakeBin, "repo-harness"),
        [
          "#!/bin/bash",
          `printf '%s\\n' "$*" >> '${logFile}'`,
          "cat <<'JSON'",
          JSON.stringify(
            {
              version: 1,
              status: "attention",
              target: "codex",
              checkUpdates: true,
              agent_actions: [
                {
                  id: "tooling.codegraph.update",
                  status: "needs_agent",
                  reason: "codegraph reports update-available.",
                  command: "bun update @colbymchenry/codegraph && bash scripts/ensure-codegraph.sh --sync",
                  verification: "repo-harness setup check --target codex --check-updates --json",
                },
              ],
            },
            null,
            2,
          ),
          "JSON",
        ].join("\n") + "\n",
        { mode: 0o755 },
      );

      const env = {
        HOOK_HOST: "codex",
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        REPO_HARNESS_CLI: "",
        REPO_HARNESS_TOOLING_ADVISORY_SYNC: "1",
      };
      const first = runHook("session-start-context.sh", cwd, { env });
      expect(first.status).toBe(0);
      expect(first.stdout).toContain("Tooling Update Advisory");
      expect(first.stdout).toContain("tooling.codegraph.update");
      expect(first.stdout).toContain("bun update @colbymchenry/codegraph");
      expect(first.stdout).toContain("repo-harness setup check --target codex --check-updates --json");
      expect(readFileSync(logFile, "utf-8").trim().split("\n")).toEqual([
        "setup check --target codex --check-updates --json",
      ]);

      const reportFile = join(cwd, ".ai/harness/security/tooling-update-advisory-codex.json");
      const renderedMarkerFile = join(cwd, ".ai/harness/security/tooling-update-advisory-codex.rendered");
      const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      utimesSync(reportFile, sixDaysAgo, sixDaysAgo);
      writeFileSync(renderedMarkerFile, `${Math.floor(sixDaysAgo.getTime() / 1000)}\n`);

      const second = runHook("session-start-context.sh", cwd, { env });
      expect(second.status).toBe(0);
      expect(second.stdout).not.toContain("Tooling Update Advisory");
      expect(second.stdout).not.toContain("tooling.codegraph.update");
      expect(readFileSync(logFile, "utf-8").trim().split("\n")).toEqual([
        "setup check --target codex --check-updates --json",
      ]);

      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      utimesSync(reportFile, eightDaysAgo, eightDaysAgo);

      const third = runHook("session-start-context.sh", cwd, { env });
      expect(third.status).toBe(0);
      expect(third.stdout).toContain("Tooling Update Advisory");
      expect(readFileSync(logFile, "utf-8").trim().split("\n")).toEqual([
        "setup check --target codex --check-updates --json",
        "setup check --target codex --check-updates --json",
      ]);
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

  test("run-hook keeps Codex non-SessionStart stdout empty", () => {
    const cwd = tmpWorkspace("run-hook-codex-stdout");
    try {
      installHooks(cwd);
      writeFileSync(join(cwd, ".ai/hooks/stdout-probe.sh"), "#!/bin/bash\necho codex-noise\n");

      const res = spawnSync("bash", [join(cwd, ".ai/hooks/run-hook.sh"), "stdout-probe.sh"], {
        cwd,
        encoding: "utf-8",
        env: { ...process.env, HOOK_HOST: "codex", HOOK_REPO_ROOT: cwd },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("run-hook suppresses Codex Stop decision JSON and handoff noise", () => {
    const cwd = tmpWorkspace("run-hook-codex-stop-decision");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/planning/pending.json"),
        JSON.stringify({
          version: 1,
          kind: "codex-plan",
          host: "codex",
          prompt_slug: "codex-stop-decision",
          source_ref: "thread://codex-stop-decision",
          expected_artifact: "plans/plan-*.md",
          cwd,
          created_at: "2026-06-01T09:00:00+0800",
        }) + "\n"
      );

      const lastAssistantMessage =
        "## Approved design summary\n" +
        "Building a Codex Stop block contract with P1 map, P2 trace, P3 decision rationale, tests, rollback, and risk handling. ".repeat(4);
      const res = spawnSync("bash", [join(cwd, ".ai/hooks/run-hook.sh"), "stop-orchestrator.sh"], {
        cwd,
        input: JSON.stringify({
          hook_event_name: "Stop",
          stop_hook_active: false,
          last_assistant_message: lastAssistantMessage,
        }),
        encoding: "utf-8",
        env: { ...process.env, HOOK_HOST: "codex", HOOK_REPO_ROOT: cwd },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("run-hook preserves Codex failure status without surfacing telemetry JSON", () => {
    const cwd = tmpWorkspace("run-hook-codex-failure");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const blockRes = spawnSync("bash", [join(cwd, ".ai/hooks/run-hook.sh"), "pre-edit-guard.sh"], {
        cwd,
        input: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
        encoding: "utf-8",
        env: { ...process.env, HOOK_HOST: "codex", HOOK_REPO_ROOT: cwd },
      });

      expect(blockRes.status).toBe(2);
      expect(blockRes.stdout).toBe("");
      expect(blockRes.stderr).toContain("[WorkflowProfileGuard]");
      expect(blockRes.stderr).not.toContain('{"guard":');
      expect(blockRes.stderr).not.toContain('"guard":"PlanStatusGuard"');

      const reviewRes = spawnSync("bash", [join(cwd, ".ai/hooks/run-hook.sh"), "prompt-guard.sh"], {
        cwd,
        input: JSON.stringify({
          prompt: "验收开始：基于 active plan 执行 checklist，告诉对方模型验收什么。",
        }),
        encoding: "utf-8",
        env: { ...process.env, HOOK_HOST: "codex", HOOK_REPO_ROOT: cwd },
      });

      expect(reviewRes.status).toBe(0);
      expect(reviewRes.stdout).toBe("");
      expect(reviewRes.stderr).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: missing explicit router bypasses instead of reviving the retired classifier", () => {
    const cwd = tmpWorkspace("prompt-guard-shell-fallback");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const res = spawnSync("bash", [join(cwd, ".ai/hooks/prompt-guard.sh")], {
        cwd,
        input: "",
        encoding: "utf-8",
        env: {
          HOME: process.env.HOME ?? "",
          HOOK_REPO_ROOT: cwd,
          PATH: "/bin:/usr/bin:/usr/sbin",
          PROMPT: "同意，执行吧",
        },
      });

      // Without bun/CLI the prompt layer bypasses. The edit layer still blocks.
      expect(res.status).toBe(0);
      expect(res.stdout).toBe("");
      expect(res.stderr).toBe("");

      const editRes = spawnSync("bash", [join(cwd, ".ai/hooks/pre-edit-guard.sh")], {
        cwd,
        input: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
        encoding: "utf-8",
        env: {
          HOME: process.env.HOME ?? "",
          HOOK_REPO_ROOT: cwd,
          PATH: "/bin:/usr/bin:/usr/sbin",
        },
      });
      expect(editRes.status).toBe(2);
      expect(editRes.stderr).toContain("[WorkflowProfileGuard]");
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

  test("minimal-change-observer: writes objective report and stays stdout-silent", () => {
    const cwd = tmpWorkspace("minimal-change-observer");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ minimal_change: { mode: "advice", post_edit_observer: true } }, null, 2)
      );
      mkdirSync(join(cwd, "src"), { recursive: true });
      writeFileSync(
        join(cwd, "src/payment-wrapper.ts"),
        [
          "export interface PaymentAdapter {",
          "  charge(amount: number): Promise<void>;",
          "}",
        ].join("\n")
      );

      const res = runHook("minimal-change-observer.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/payment-wrapper.ts" } }),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toBe("");

      const report = JSON.parse(
        readFileSync(join(cwd, ".ai/harness/checks/minimal-change.latest.json"), "utf-8")
      );
      expect(report.scope.paths).toEqual(["src/payment-wrapper.ts"]);
      expect(report.signals.new_file_paths).toEqual(["src/payment-wrapper.ts"]);
      expect(report.signals.abstraction_candidates.length).toBeGreaterThan(0);
      expect(report.verdict).toBe("review");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: appends minimal-change advice only on allowed execution prompts", () => {
    const cwd = tmpWorkspace("minimal-change-prompt");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ minimal_change: { mode: "advice" } }, null, 2)
      );
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const planPath = "plans/plan-20260621-1200-demo.md";
      const contractPath = "tasks/contracts/20260621-1200-demo.contract.md";
      writeFileSync(
        join(cwd, planPath),
        [
          "# Plan: Demo",
          "",
          "> **Status**: Executing",
          `> **Task Contract**: ${contractPath}`,
          "",
          planEvidenceContract(),
        ].join("\n")
      );
      writeFileSync(join(cwd, contractPath), "# Contract\n\n> **Capability ID**: runtime-harness-hook-adapters\n");
      writeActivePlan(cwd, planPath);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "/execute" }),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("Minimal-change execution advice");

      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ minimal_change: { mode: "off" } }, null, 2)
      );
      const disabled = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "/execute" }),
      });
      expect(disabled.status).toBe(0);
      expect(disabled.stdout).not.toContain("Minimal-change execution advice");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("stop-orchestrator: records minimal-change review evidence in handoff", () => {
    const cwd = tmpWorkspace("minimal-change-stop");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/policy.json"),
        JSON.stringify({ minimal_change: { mode: "advice" } }, null, 2)
      );
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/checks/minimal-change.latest.json"),
        JSON.stringify(
          {
            version: 1,
            policy_version: 1,
            mode: "advice",
            generated_at: "2026-06-21T00:00:00.000Z",
            repo_root: ".",
            base_ref: "HEAD",
            fingerprint: "sha256:test",
            scope: { paths: ["package.json"], manifest_paths: ["package.json"] },
            signals: {
              files_changed: 1,
              files_added: 0,
              files_deleted: 0,
              loc_added: 1,
              loc_deleted: 0,
              binary_files: [],
              dependency_manifests_changed: ["package.json"],
              new_dependencies: [{ name: "chalk", type: "dependencies", version: "^5.0.0" }],
              removed_dependencies: [],
              new_file_paths: [],
              abstraction_candidates: [],
            },
            protected_changes: [],
            findings: [
              {
                tag: "dependency",
                path: "package.json",
                severity: "advice",
                evidence: "dependency chalk was added to dependencies",
                question: "Can an existing dependency cover this?",
              },
            ],
            verdict: "review",
            report_path: ".ai/harness/checks/minimal-change.latest.json",
          },
          null,
          2
        )
      );

      const res = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toBe("");

      const handoff = readFileSync(join(cwd, ".ai/harness/handoff/current.md"), "utf-8");
      expect(handoff).toContain("<!-- repo-harness:minimal-change-review begin -->");
      expect(handoff).toContain("## Minimal Change Review");
      expect(handoff).toContain("Verdict: `review`");
      expect(handoff).toContain("package.json");
      expect(handoff).toContain("Can an existing dependency cover this?");

      // workflow_write_handoff must refresh the resume packet alongside
      // current.md on every Stop, or check-task-workflow --strict's
      // check_handoff_resume_pair / check_current_resume_freshness flag a
      // stale resume.md (Phase 3 A3).
      const resumePath = join(cwd, ".ai/harness/handoff/resume.md");
      expect(existsSync(resumePath)).toBe(true);
      const resumeContent = readFileSync(resumePath, "utf-8");
      expect(resumeContent).toContain("# Codex Resume Packet");
      expect(resumeContent).toContain("## Resume Prompt");
      expect(resumeContent).toContain("## Source Artifacts");
      expect(statSync(resumePath).mtimeMs).toBeGreaterThanOrEqual(
        statSync(join(cwd, ".ai/harness/handoff/current.md")).mtimeMs
      );

      const second = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
      });
      expect(second.status).toBe(0);
      const updated = readFileSync(join(cwd, ".ai/harness/handoff/current.md"), "utf-8");
      expect(updated.match(/## Minimal Change Review/g)?.length).toBe(1);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("stop-orchestrator: Lite refreshes compact handoff without review orchestration", () => {
    const cwd = tmpWorkspace("lite-stop");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/state"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/state/effective.json"), JSON.stringify({
        workflow_profile: "lite",
        state_version: 1,
      }));
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });
      writeFileSync(join(cwd, ".ai/harness/checks/minimal-change.latest.json"), JSON.stringify({
        version: 1,
        mode: "advice",
        verdict: "review",
        findings: [{ tag: "review", path: "src/a.ts", question: "review me" }],
        report_path: ".ai/harness/checks/minimal-change.latest.json",
      }));

      const res = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({ hook_event_name: "Stop", stop_hook_active: false }),
      });
      expect(res.status).toBe(0);
      expect(res.stdout).toBe("");
      expect(res.stderr).toContain("[FinalizeHandoff]");
      const handoff = readFileSync(join(cwd, ".ai/harness/handoff/current.md"), "utf-8");
      expect(handoff).not.toContain("Minimal Change Review");
      expect(existsSync(join(cwd, ".ai/harness/handoff/resume.md"))).toBe(true);
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
        "- migrate path defaults to ~/brain",
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

      writeFileSync(
        join(cwd, "plans/plan-20260304-1410-demo.md"),
        ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
      );
      writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");
      writeFileSync(
        join(cwd, "tasks/todos.md"),
          "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1410-demo.md\n"
      );
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), passingContractFixture("Fulfilled"));
      writeDoneCapabilityRegistry(cwd);
      writeValidSprintChecks(cwd);
      // A valid rubric-v1 review bound to the current implementation fingerprint:
      // the gate clears freshness + external on the fresh path. (The legacy
      // warn-only path for a rubric-less review was removed.)
      const fingerprint = currentReviewFingerprint(cwd);
      writePassingReview(cwd, fingerprint);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContractVerify]");
      expect(res.stdout).not.toContain("[ReviewFreshness] WARN");
      expect(res.stdout).not.toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("[AutoArchive] All quality gates passed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: allows done intent when review fingerprint is fresh", () => {
    const cwd = tmpWorkspace("prompt-guard-review-fresh");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd, { archive: true });
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\n");
      const fingerprint = currentReviewFingerprint(cwd);
      writePassingReview(cwd, fingerprint);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ContractVerify]");
      expect(res.stdout).not.toContain("[ReviewFreshness] WARN");
      expect(res.stdout).not.toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("[AutoArchive] All quality gates passed");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when review fingerprint is stale", () => {
    const cwd = tmpWorkspace("prompt-guard-review-stale");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\n");
      const fingerprint = currentReviewFingerprint(cwd);
      writePassingReview(cwd, fingerprint);
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\nchanged after review\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(2);
      expect(res.stdout).toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("Review is stale for current implementation diff fingerprint");
      expect(res.stdout).toContain('"guard":"ReviewFreshnessGuard"');
      expect(res.stdout).not.toContain("[ExternalAcceptanceGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when review fingerprint is malformed", () => {
    const cwd = tmpWorkspace("prompt-guard-review-malformed");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      writePassingReview(cwd, "sha256:not-a-valid-fingerprint");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(2);
      expect(res.stdout).toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("Review fingerprint is malformed");
      expect(res.stdout).toContain('"guard":"ReviewFreshnessGuard"');
      expect(res.stdout).not.toContain("[ExternalAcceptanceGuard]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when a rubric v1 review fingerprint is still pending", () => {
    const cwd = tmpWorkspace("prompt-guard-review-pending");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      // Rubric v1 metadata that was never filled in: fail closed, not legacy warn.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "> **Review Rubric Version**: 1",
          "> **Reviewed Diff Fingerprint**: pending",
          "> **Reviewed Scope**: branch+staged+unstaged+untracked",
          "",
          humanReviewCard(),
          "",
          externalAcceptanceAdvice(),
          "",
        ].join("\n")
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(2);
      expect(res.stdout).not.toContain("[ReviewFreshness] WARN");
      expect(res.stdout).toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("Review fingerprint is missing for rubric v1");
      expect(res.stdout).toContain('"guard":"ReviewFreshnessGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when the review rubric version is malformed or unsupported", () => {
    const cwd = tmpWorkspace("prompt-guard-review-rubric-malformed");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\n");
      const fp = currentReviewFingerprint(cwd);
      // The top fingerprint is fresh (F2), but the rubric version is garbage.
      // A malformed/unsupported rubric must fail closed, not fall through to the
      // lenient legacy path — that path also disabled the external-acceptance
      // binding check, letting a stale peer acceptance satisfy the gate.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          "> **Review Rubric Version**: invalid",
          `> **Reviewed Diff Fingerprint**: ${fp}`,
          "> **Reviewed Scope**: branch+staged+unstaged+untracked",
          "",
          humanReviewCard(),
          "",
          externalAcceptanceAdvice("Codex", "codex-review", fp),
          "",
        ].join("\n")
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(2);
      expect(res.stdout).not.toContain("[ReviewFreshness] WARN");
      expect(res.stdout).toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("malformed or unsupported");
      expect(res.stdout).toContain('"guard":"ReviewFreshnessGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when the top-of-file review rubric version is absent", () => {
    const cwd = tmpWorkspace("prompt-guard-review-rubric-absent");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\n");
      const fp = currentReviewFingerprint(cwd);
      // No rubric line in the top-of-file header (stripped, or a pre-rubric
      // artifact). It cannot be proven legacy, so it must fail closed. Note the
      // External Acceptance section below DOES carry a rubric — this also proves
      // the top-of-file parser does not read a section-level field as top-level.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          `> **Reviewed Diff Fingerprint**: ${fp}`,
          "> **Reviewed Scope**: branch+staged+unstaged+untracked",
          "",
          humanReviewCard(),
          "",
          externalAcceptanceAdvice("Codex", "codex-review", fp),
          "",
        ].join("\n")
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(2);
      // The top fingerprint is fresh, so freshness passes; external acceptance is
      // the authority that requires a supported rubric and rejects the absent one.
      expect(res.stdout).not.toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("[ExternalAcceptanceGuard]");
      expect(res.stdout).toContain("Review Rubric Version is missing");
      expect(res.stdout).toContain('"guard":"ExternalAcceptanceGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when external acceptance fingerprint is stale even though the top fingerprint is fresh", () => {
    const cwd = tmpWorkspace("prompt-guard-external-stale-fp");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      writeFileSync(join(cwd, "tracked.txt"), "base\nfirst reviewed change\n");
      const f1 = currentReviewFingerprint(cwd);
      // Implementation moves on to F2; the peer only ever reviewed F1.
      writeFileSync(join(cwd, "tracked.txt"), "base\nfirst reviewed change\nsecond change\n");
      const f2 = currentReviewFingerprint(cwd);
      expect(f2).not.toBe(f1);
      // Top fingerprint refreshed to F2 (freshness passes) but the External
      // Acceptance section still carries the stale F1.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          reviewFingerprintMetadata(f2),
          "",
          humanReviewCard(),
          "",
          externalAcceptanceAdvice("Codex", "codex-review", f1),
          "",
        ].join("\n")
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(2);
      expect(res.stdout).not.toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("[ExternalAcceptanceGuard]");
      expect(res.stdout).toContain("External acceptance fingerprint");
      expect(res.stdout).toContain("is stale for current implementation diff");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when a rubric v1 external acceptance omits its fingerprint", () => {
    const cwd = tmpWorkspace("prompt-guard-external-missing-fp");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\n");
      const fp = currentReviewFingerprint(cwd);
      // Top fingerprint is fresh, but the peer section omits the binding — the
      // original fail-open shape the gate must now reject.
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        [
          "# Task Review: demo",
          "",
          "> **Recommendation**: pass",
          "",
          reviewFingerprintMetadata(fp),
          "",
          humanReviewCard(),
          "",
          externalAcceptanceAdvice(),
          "",
        ].join("\n")
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(2);
      expect(res.stdout).not.toContain("[ReviewFreshnessGuard]");
      expect(res.stdout).toContain("[ExternalAcceptanceGuard]");
      expect(res.stdout).toContain("missing a valid Reviewed Diff Fingerprint");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: blocks done intent when external acceptance advice is missing", () => {
    const cwd = tmpWorkspace("prompt-guard-external-acceptance-missing");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });
      mkdirSync(join(cwd, "tasks/reviews"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/checks"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1410-demo.md"),
        ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
      );
      writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");
      writeFileSync(
        join(cwd, "tasks/todos.md"),
          "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1410-demo.md\n"
      );
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), passingContractFixture());
      writeValidSprintChecks(cwd);
      // Valid rubric-v1 header bound to the current fingerprint (freshness passes)
      // but NO External Acceptance section, so the gate reaches and trips the
      // external-acceptance guard this test asserts.
      const fingerprint = currentReviewFingerprint(cwd);
      writeFileSync(
        join(cwd, "tasks/reviews/demo.review.md"),
        ["# Task Review: demo", "", "> **Recommendation**: pass", "", reviewFingerprintMetadata(fingerprint), "", humanReviewCard("pass", "unavailable"), ""].join("\n")
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "任务完成了，结束吧" }),
      });

      expect(res.status).toBe(2);
      expect(res.stdout).toContain("[ExternalAcceptanceGuard]");
      expect(res.stdout).toContain("External acceptance section is missing");
      expect(res.stdout).not.toContain("[EvidenceGuard]");
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

      writeFileSync(
        join(cwd, "plans/plan-20260304-1415-demo.md"),
        "# Plan: demo\n\n> **Status**: Approved\n"
      );
      writeActivePlan(cwd, "plans/plan-20260304-1415-demo.md");
      writeFileSync(
        join(cwd, "tasks/todos.md"),
          "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1415-demo.md\n"
      );
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), passingContractFixture());

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

        writeFileSync(
          join(cwd, "plans/plan-20260304-1410-demo.md"),
          ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
        );
        writeActivePlan(cwd, "plans/plan-20260304-1410-demo.md");
        writeFileSync(
          join(cwd, "tasks/todos.md"),
            "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1410-demo.md\n"
        );
        writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), passingContractFixture());
        writeFileSync(join(cwd, ".ai/harness/checks/latest.json"), checks);
        // A valid rubric-v1 review bound to the current fingerprint clears
        // freshness + external so the gate reaches the structured-checks
        // (EvidenceGuard) stage that this case exercises.
        const fingerprint = currentReviewFingerprint(cwd);
        writePassingReview(cwd, fingerprint);

        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: "done" }),
          env: { HOOK_HOST: "claude" },
        });

        expect(res.status).toBe(2);
        expect(res.stdout).toContain("[EvidenceGuard]");
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    }
  }, HOOK_RUNTIME_TIMEOUT_MS);

  test("prompt-guard: blocks done intent when contract verification fails", () => {
    const cwd = tmpWorkspace("prompt-guard-contract-fail");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "plans"), { recursive: true });
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "tasks/contracts"), { recursive: true });

      writeFileSync(
        join(cwd, "plans/plan-20260304-1420-demo.md"),
        ["# Plan: demo", "", "> **Status**: Approved", "", planEvidenceContract(), ""].join("\n")
      );
      writeActivePlan(cwd, "plans/plan-20260304-1420-demo.md");
      writeFileSync(
        join(cwd, "tasks/todos.md"),
          "# Task Execution Checklist (Primary)\n\n> **Source Plan**: plans/plan-20260304-1420-demo.md\n"
      );
      writeFileSync(join(cwd, "tasks/contracts/demo.contract.md"), "# contract\n");

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

  test("stop-orchestrator: nudges stale review freshness without blocking stop", () => {
    const cwd = tmpWorkspace("stop-review-freshness-stale");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      writeDoneGateBase(cwd);
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\n");
      const fingerprint = currentReviewFingerprint(cwd);
      writePassingReview(cwd, fingerprint);
      writeFileSync(join(cwd, "tracked.txt"), "base\nreviewed change\nchanged after review\n");

      const res = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({ stop_hook_active: false, last_assistant_message: "Done." }),
      });

      expect(res.status).toBe(0);
      expect(res.stderr).toContain("[FinalizeHandoff] Refreshed .ai/harness/handoff/current.md.");
      expect(res.stderr).toContain("[ReviewFreshness] Review is stale for current implementation diff fingerprint");
      expect(res.stdout).toBe("");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("pre-edit-guard: protects private paths and upgrades deploy assets to Strict", () => {
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
      expect(opsRes.status).toBe(2);
      expect(opsRes.stdout).toContain("[DeployAsset]");
      expect(opsRes.stderr).toMatch(/SpecGuard|PlanStatusGuard|StrictContractGuard/);

      const exampleRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "deploy/env/.env.example" } }),
      });
      expect(exampleRes.status).toBe(2);
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
        join(cwd, "tasks/todos.md"),
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
        stdin: JSON.stringify({ tool_input: { file_path: "tasks/todos.md" } }),
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
            default_brain_path: "brain/demo/*",
            entries: [
              {
                id: "valuable",
                role: "repo-authored",
                repo_path: "docs/valuable.md",
                brain_path: "brain/demo/references/valuable.md",
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
        env: { REPO_HARNESS_BRAIN_ROOT: brainRoot },
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
        join(cwd, "tasks/todos.md"),
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
        stdin: JSON.stringify({ tool_input: { file_path: "tasks/todos.md" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[TaskHandoff]");
      expect(existsSync(join(cwd, ".claude/.task-handoff.md"))).toBe(true);
      expect(existsSync(join(cwd, ".claude/.task-state.json"))).toBe(true);
      const handoff = readFileSync(join(cwd, ".claude/.task-handoff.md"), "utf-8");
      expect(handoff).toContain("second task");
      expect(handoff).toContain("stage its coherent diff first");
      expect(handoff).toContain("Stage: task");
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
      expect(postBash.verbosity_class).toBe("inline");
      expect(postBash.suggested_runner).toBe("inline");
      expect(postBash.raw_output_path).toBeNull();
      expect(postBash.raw_output_bytes).toBe(0);
      expect(postBash.raw_output_sha256).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-bash: records broad Bash command metadata without blocking", () => {
    const cwd = tmpWorkspace("post-bash-broad-command");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const broad = runHook("post-bash.sh", cwd, {
        stdin: JSON.stringify({
          tool_input: { command: "rg foo" },
          tool_output: "src/a.ts:foo\nsrc/b.ts:foo\n",
          exit_code: 0,
        }),
      });
      expect(broad.status).toBe(0);
      const broadJson = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/post-bash-latest.json"), "utf-8"));
      expect(broadJson.broad_command).toBe(true);
      expect(broadJson.output_line_count).toBe(2);
      expect(broadJson.recommended_next_tool).toBe("codegraph_context");
      expect(broadJson.verbosity_class).toBe("inline");
      expect(broadJson.suggested_runner).toBe("inline");
      expect(broadJson.raw_output_path).toBeNull();
      expect(broadJson.raw_output_bytes).toBe(Buffer.byteLength("src/a.ts:foo\nsrc/b.ts:foo\n"));
      expect(broadJson.raw_output_sha256).toBeNull();
      expect(typeof broadJson.rtk_available).toBe("boolean");

      const precise = runHook("post-bash.sh", cwd, {
        stdin: JSON.stringify({
          tool_input: { command: "rg foo src/" },
          tool_output: "src/a.ts:foo\n",
          exit_code: 0,
        }),
      });
      expect(precise.status).toBe(0);
      const preciseJson = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/post-bash-latest.json"), "utf-8"));
      expect(preciseJson.broad_command).toBe(false);
      expect(preciseJson.output_line_count).toBe(1);
      expect(preciseJson.recommended_next_tool).toBe("");
      expect(preciseJson.verbosity_class).toBe("inline");
      expect(preciseJson.suggested_runner).toBe("inline");
      expect(preciseJson.failure_signal).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-bash: stores long output evidence and suggests RTK only as advisory", () => {
    const cwd = tmpWorkspace("post-bash-long-output");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      const fakeBin = join(cwd, "fake-bin");
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(join(fakeBin, "rtk"), "#!/bin/sh\necho rtk-stub\n");
      expect(run("chmod", ["+x", join(fakeBin, "rtk")], cwd).status).toBe(0);

      const output = Array.from({ length: 201 }, (_, i) => `src/file${i}.ts:foo`).join("\n");
      const res = runHook("post-bash.sh", cwd, {
        stdin: JSON.stringify({
          tool_input: { command: "rg foo" },
          tool_output: output,
          exit_code: 0,
        }),
        env: { PATH: `${fakeBin}:${process.env.PATH ?? ""}` },
      });

      expect(res.status).toBe(0);
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/post-bash-latest.json"), "utf-8"));
      expect(latest.broad_command).toBe(true);
      expect(latest.output_line_count).toBe(201);
      expect(latest.verbosity_class).toBe("long");
      expect(latest.suggested_runner).toBe("rtk");
      expect(latest.rtk_available).toBe(true);
      expect(latest.raw_output_bytes).toBe(Buffer.byteLength(output));
      expect(latest.raw_output_path).toMatch(/^\.ai\/harness\/runs\/bash-output\/post-bash-.+\.log$/);
      expect(latest.raw_output_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(readFileSync(join(cwd, latest.raw_output_path), "utf-8")).toBe(output);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-bash: preserves failed command output as raw evidence", () => {
    const cwd = tmpWorkspace("post-bash-failure-output");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const output = "FAIL tests/hook-runtime.test.ts\nexpected pass\n";
      const res = runHook("post-bash.sh", cwd, {
        stdin: JSON.stringify({
          tool_input: { command: "bun test tests/hook-runtime.test.ts" },
          tool_output: output,
          exit_code: 1,
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PostBash] Tests failed");
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/post-bash-latest.json"), "utf-8"));
      expect(latest.status).toBe("fail");
      expect(latest.verbosity_class).toBe("failure");
      expect(latest.suggested_runner).toBe("raw");
      expect(latest.failure_signal).toBe(true);
      expect(latest.raw_output_path).toMatch(/^\.ai\/harness\/runs\/bash-output\/post-bash-.+\.log$/);
      expect(readFileSync(join(cwd, latest.raw_output_path), "utf-8")).toBe(output);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("post-bash: failure signals do not turn successful commands into failures", () => {
    const cwd = tmpWorkspace("post-bash-failure-signal");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const res = runHook("post-bash.sh", cwd, {
        stdin: JSON.stringify({
          tool_input: { command: "rg Traceback" },
          tool_output: "docs/debug.md:Traceback appears in this example\n",
          exit_code: 0,
        }),
        env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
      });

      expect(res.status).toBe(0);
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/post-bash-latest.json"), "utf-8"));
      expect(latest.status).toBe("pass");
      expect(latest.verbosity_class).toBe("inline");
      expect(latest.failure_signal).toBe(true);
      expect(latest.suggested_runner).toBe("inline");
      expect(latest.raw_output_path).toBeNull();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("trace-event hook writes structured JSONL output", () => {
    const cwd = tmpWorkspace("trace-hook");
    try {
      initGitRepo(cwd);
      installHooks(cwd);

      const res = runHook("post-tool-observer.sh", cwd, {
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
