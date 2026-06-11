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
  utimesSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { spawnSync } from "child_process";

// Every test here spawns bash hook scripts (each forking git/jq/bun
// subprocesses) several times; one invocation can exceed 2s under parallel
// session load, so the 5s bun default flakes on multi-invocation tests.
setDefaultTimeout(20000);

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

function externalAcceptanceAdvice(reviewer = "Codex", source = "codex-review"): string {
  return [
    "## External Acceptance Advice",
    "",
    "> **External Acceptance**: pass",
    `> **External Reviewer**: ${reviewer}`,
    `> **External Source**: ${source}`,
    "> **External Started**: 2026-03-04T14:05:00+0800",
    "> **External Completed**: 2026-03-04T14:06:00+0800",
    "",
    "- P1 blockers: none",
    "- P2 advisories: none",
    "- Acceptance checklist: pass",
  ].join("\n");
}

function writeLoopEngineG1GoSummary(cwd: string) {
  mkdirSync(join(cwd, ".ai/harness/runs"), { recursive: true });
  writeFileSync(
    join(cwd, ".ai/harness/runs/loop-engine-02-routing-ab-eval.json"),
    JSON.stringify(
      {
        protocol: "loop-engine-02-routing-ab-eval/summary/v1",
        codex: {
          report: {
            go_no_go: "go",
          },
        },
        claude: {
          status: "skipped_by_owner_override",
          graderStatus: "skipped",
        },
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
  const hooksDir = join(cwd, ".ai", "hooks");
  return spawnSync("bash", [join(hooksDir, script), ...(options?.args ?? [])], {
    cwd,
    input: options?.stdin ?? "",
    encoding: "utf-8",
    env: {
      ...process.env,
      REPO_HARNESS_CLI: join(ROOT, "src/cli/index.ts"),
      REPO_HARNESS_HOOK_CLI: join(ROOT, "src/cli/hook-entry.ts"),
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

      for (const prompt of [
        "验收开始：基于 active plan 执行 checklist，告诉对方模型验收什么。",
        "请执行 Waza /check 验收当前改动。",
      ]) {
        const reviewExecuteRes = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ prompt }),
        });
        expect(reviewExecuteRes.status).toBe(0);
        expect(reviewExecuteRes.stdout).toContain("[WazaRoute] Review/release intent detected");
        expect(reviewExecuteRes.stdout).not.toContain("[PlanStatusGuard]");
        expect(reviewExecuteRes.stdout).not.toContain("[BDD] Feature intent detected");
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 10000);

  test("prompt-guard: review/audit prompts that mention bugs or hooks do not misfire TDD or /health (regression)", () => {
    const cwd = tmpWorkspace("intent-precision");
    try {
      installHooks(cwd);

      // The exact prompt that produced three false advisories in a live session:
      // a framework review request must not trigger bug-fix TDD advice, the
      // debug cross-review hint, or the /health route.
      const auditRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          prompt: "这是我的一个自动化hook vibe coding framework，请review整个flow，找出Bug并提出优化方案",
        }),
        env: { HOOK_HOST: "claude" },
      });
      expect(auditRes.status).toBe(0);
      expect(auditRes.stdout).not.toContain("[TDD] Bug-fix intent detected");
      expect(auditRes.stdout).not.toContain("Hard bug");
      expect(auditRes.stdout).not.toContain("Waza /health");
      expect(auditRes.stdout).toContain("Waza /check");

      // Bare bug nouns in find/diagnose requests stay silent on TDD.
      const findBugs = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "找出这个模块里的Bug" }),
      });
      expect(findBugs.status).toBe(0);
      expect(findBugs.stdout).not.toContain("[TDD] Bug-fix intent detected");

      // English substrings (prefix/fixture) must not count as fix verbs.
      const substringRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "rename the route prefix and update the test fixture naming" }),
      });
      expect(substringRes.status).toBe(0);
      expect(substringRes.stdout).not.toContain("[TDD] Bug-fix intent detected");

      // Genuine fix requests still get the TDD advisory + debug cross-review.
      const fixRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "fix the login crash on submit" }),
        env: { HOOK_HOST: "claude" },
      });
      expect(fixRes.status).toBe(0);
      expect(fixRes.stdout).toContain("[TDD] Bug-fix intent detected");
      expect(fixRes.stdout).toContain("[CrossReview]");

      // Genuine health asks still route to /health.
      const healthRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "审计一下 agent hook 配置环境健康度" }),
      });
      expect(healthRes.status).toBe(0);
      expect(healthRes.stdout).toContain("Waza /health");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("prompt-guard: initializes missing CodeGraph index before first structural route hint", () => {
    const cwd = tmpWorkspace("codegraph-route-init");
    const logFile = join(cwd, "codegraph-init.log");
    const fakeBin = join(cwd, "fakebin");
    const fakeCodegraph = join(fakeBin, "codegraph");
    try {
      installHooks(cwd);
      mkdirSync(fakeBin, { recursive: true });
      writeFileSync(
        fakeCodegraph,
        [
          "#!/bin/bash",
          "set -euo pipefail",
          'printf "%s\\n" "$*" >> "$CODEGRAPH_INIT_LOG"',
          'if [[ "${1:-}" == "init" ]]; then',
          '  mkdir -p ".codegraph"',
          '  printf "%s" "fake-index" > ".codegraph/codegraph.db"',
          '  mkdir -p ".cursor/rules"',
          '  printf "%s" "cursor-rule" > ".cursor/rules/codegraph.mdc"',
          "fi",
          '',
        ].join("\n")
      );
      expect(run("chmod", ["+x", fakeCodegraph], cwd).status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "trace flow from runInit to ensureCodegraph" }),
        env: {
          CODEGRAPH_INIT_LOG: logFile,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[CodegraphRoute] Initialized missing CodeGraph index before routing hint.");
      expect(res.stdout).toContain("[CodegraphRoute] Structural code-navigation intent detected.");
      expect(existsSync(join(cwd, ".codegraph/codegraph.db"))).toBe(true);
      expect(existsSync(join(cwd, ".cursor/rules/codegraph.mdc"))).toBe(false);
      expect(readFileSync(logFile, "utf-8")).toContain("init -i .");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("prompt-guard: emits host-aware [ExternalAcceptance] prompt at merge and [CrossReview] at debug moments", () => {
    const cwd = tmpWorkspace("cross-review-hint");
    try {
      installHooks(cwd);

      // Pre-merge / review intent on the Claude host suggests codex-review.
      const mergeClaude = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "验收一下当前改动，然后提交推送" }),
        env: { HOOK_HOST: "claude" },
      });
      expect(mergeClaude.status).toBe(0);
      expect(mergeClaude.stdout).toContain("[ExternalAcceptance]");
      expect(mergeClaude.stdout).toContain("Peer reviewer: Codex via codex-review");
      expect(mergeClaude.stdout).toContain("Do not run /check");
      expect(mergeClaude.stdout).toContain("## External Acceptance Advice");
      expect(mergeClaude.stdout).toContain("[CrossReview]");
      expect(mergeClaude.stdout).toContain("codex-review");
      expect(mergeClaude.stdout).not.toContain("claude-review");

      // The same intent on the Codex host suggests claude-review instead.
      const mergeCodex = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "验收一下当前改动，然后提交推送" }),
        env: { HOOK_HOST: "codex" },
      });
      expect(mergeCodex.status).toBe(0);
      expect(mergeCodex.stdout).toContain("[ExternalAcceptance]");
      expect(mergeCodex.stdout).toContain("Peer reviewer: Claude via /claude-review");
      expect(mergeCodex.stdout).toContain("> **External Reviewer**: Claude");
      expect(mergeCodex.stdout).toContain("[CrossReview]");
      expect(mergeCodex.stdout).toContain("claude-review");

      // Bug-fix intent gets the debug-flavored cross-review hint.
      const bug = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "这个登录 bug 报错了，帮我修复" }),
        env: { HOOK_HOST: "claude" },
      });
      expect(bug.status).toBe(0);
      expect(bug.stdout).toContain("[CrossReview]");
      expect(bug.stdout).toContain("codex-review");

      // A neutral prompt must not nag for a cross-review.
      const neutral = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "现在几点了" }),
        env: { HOOK_HOST: "claude" },
      });
      expect(neutral.status).toBe(0);
      expect(neutral.stdout).not.toContain("[CrossReview]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: shadow injection records dual-route divergence without changing the TS verdict", () => {
    const cwd = tmpWorkspace("loop-engine-shadow");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeLoopEngineG1GoSummary(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "只是问个问题" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[LoopEngineShadow] TS verdict remains authoritative");
      expect(res.stdout).toContain("state_snapshot=");
      expect(res.stdout).toContain("docs/reference-configs/loop-engine-nl-decision-table.md");
      expect(res.stdout).not.toContain("[PlanStatusGuard]");

      const trace = readFileSync(join(cwd, ".claude/.trace.jsonl"), "utf-8")
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line));
      const event = trace.find((entry) => entry.loop_engine_shadow);
      expect(event.loop_engine_shadow.enabled).toBe(true);
      expect(event.loop_engine_shadow.g1).toBe("go");
      expect(event.loop_engine_shadow.authoritative).toBe("ts_verdict");
      expect(event.loop_engine_shadow.state_snapshot.states.spec).toBe("present");
      expect(event.loop_engine_shadow.ts_verdict.action).toBe("allow");
      expect(event.loop_engine_shadow.nl_decision.action).toBe("allow");
      expect(event.loop_engine_shadow.divergence).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: shadow trace exposes divergence when the NL shadow route differs", () => {
    const cwd = tmpWorkspace("loop-engine-shadow-divergence");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeLoopEngineG1GoSummary(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "只是问个问题" }),
        env: {
          LOOP_ENGINE_SHADOW_NL_ACTION: "done_gate",
          LOOP_ENGINE_SHADOW_NL_SOURCE: "unit-test",
        },
      });

      expect(res.status).toBe(0);
      const event = readFileSync(join(cwd, ".claude/.trace.jsonl"), "utf-8")
        .trim()
        .split(/\r?\n/)
        .map((line) => JSON.parse(line))
        .find((entry) => entry.loop_engine_shadow);
      expect(event.loop_engine_shadow.ts_verdict.action).toBe("allow");
      expect(event.loop_engine_shadow.nl_decision.action).toBe("done_gate");
      expect(event.loop_engine_shadow.nl_decision.source).toBe("unit-test");
      expect(event.loop_engine_shadow.divergence).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: emits host-neutral Codegraph route hints for structural code navigation", () => {
    const cwd = tmpWorkspace("codegraph-route-hint");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".codegraph"), { recursive: true });
      writeFileSync(join(cwd, ".codegraph/codegraph.db"), "test-index\n");

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

  test("prompt-guard: Codegraph nudge is one-shot and silenced after observed CodeGraph use", () => {
    const cwd = tmpWorkspace("codegraph-route-state");
    try {
      installHooks(cwd);

      const first = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "帮我排查这个 hook 为什么不触发，跨多个文件" }),
        env: { SESSION_KEY: "codegraph-session" },
      });
      expect(first.status).toBe(0);
      expect(first.stdout).toContain("[CodegraphRoute]");

      const second = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ prompt: "帮我排查这个 hook 为什么不触发，跨多个文件" }),
        env: { SESSION_KEY: "codegraph-session" },
      });
      expect(second.status).toBe(0);
      expect(second.stdout).not.toContain("[CodegraphRoute]");

      const usedCwd = tmpWorkspace("codegraph-route-used");
      try {
        installHooks(usedCwd);
        const trace = runHook("post-tool-observer.sh", usedCwd, {
          stdin: JSON.stringify({
            hook_event_name: "PostToolUse",
            tool_name: "mcp__codegraph__codegraph_context",
          }),
          env: { SESSION_KEY: "used-session" },
        });
        expect(trace.status).toBe(0);
        const markers = readdirSync(join(usedCwd, ".claude/.codegraph-state"));
        expect(markers.some((name) => name.endsWith(".used"))).toBe(true);

        const afterUse = runHook("prompt-guard.sh", usedCwd, {
          stdin: JSON.stringify({ prompt: "谁调用了 runHook？影响面是什么？" }),
          env: { SESSION_KEY: "used-session" },
        });
        expect(afterUse.status).toBe(0);
        expect(afterUse.stdout).not.toContain("[CodegraphRoute]");
      } finally {
        rmSync(usedCwd, { recursive: true, force: true });
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

  test("post-edit-guard: reports sync-chain warnings without blocking when drift helpers fail", () => {
    const cwd = tmpWorkspace("post-edit-sync-chain-warning");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, "scripts"), { recursive: true });
      writeFileSync(
        join(cwd, "scripts/architecture-drift.sh"),
        "#!/bin/bash\necho drift blew up >&2\nexit 7\n"
      );
      expect(run("chmod", ["+x", "scripts/architecture-drift.sh"], cwd).status).toBe(0);

      const res = runHook("post-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "apps/web/src/main.tsx" } }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("drift blew up");
      expect(res.stdout).toContain("[SyncChain] WARN: architecture-drift failed for apps/web/src/main.tsx (exit 7)");
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
  }, 15000);

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


  test("context-pressure: same-session increments, cross-session resets, warning once", () => {
    const cwd = tmpWorkspace("context-pressure");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".claude/.context-pressure"), { recursive: true });

      const s1a = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-a" },
      });
      expect(s1a.status).toBe(0);

      const s1b = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-a" },
      });
      expect(s1b.status).toBe(0);
      expect(readFileSync(join(cwd, ".claude/.tool-call-count"), "utf-8").trim()).toBe("2");

      const s2 = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "session-b" },
      });
      expect(s2.status).toBe(0);
      expect(readFileSync(join(cwd, ".claude/.tool-call-count"), "utf-8").trim()).toBe("1");

      writeFileSync(join(cwd, ".claude/.context-pressure/warnsession_.count"), "29\n");

      const warn1 = runHook("post-tool-observer.sh", cwd, {
        env: { CLAUDE_SESSION_ID: "warnsession" },
      });
      expect(warn1.status).toBe(0);
      expect(warn1.stdout).toContain("Yellow zone");
      expect(warn1.stdout).toContain("Persist research/todo/handoff");
      expect(warn1.stdout).not.toContain("/compact");

      const warn2 = runHook("post-tool-observer.sh", cwd, {
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
      mkdirSync(join(cwd, ".ai/harness/context-budget"), { recursive: true });

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

      writeFileSync(join(cwd, ".ai/harness/context-budget/latest.json"), JSON.stringify({ zone: "red" }) + "\n");

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
      expect(res.stdout).toContain("[CrossReview]");
      expect(res.stdout).toContain("/claude-review");
      expect(res.stdout).toContain("worth the tokens");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("session-start-context skips resume packets older than current handoff", () => {
    const cwd = tmpWorkspace("session-start-stale-resume");
    try {
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/handoff"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/context-budget"), { recursive: true });

      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        [
          "# Codex Resume Packet",
          "<!-- generated-by: repo-harness codex-handoff-resume v1 -->",
          "",
          "> **Reason**: context-red-zone",
          "",
          "## Resume Prompt",
          "",
          "Old resume packet that must not be injected.",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/harness/context-budget/latest.json"), JSON.stringify({ zone: "red" }) + "\n");
      writeFileSync(join(cwd, ".ai/harness/handoff/current.md"), "# Harness Handoff\n\nnewer handoff\n");

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
      mkdirSync(join(cwd, ".ai/harness/context-budget"), { recursive: true });

      writeFileSync(
        join(cwd, ".ai/harness/handoff/resume.md"),
        [
          "# Codex Resume Packet",
          "<!-- generated-by: project-initializer codex-handoff-resume v1 -->",
          "",
          "> **Reason**: context-red-zone",
          "",
          "## Resume Prompt",
          "",
          "Retired-marker resume packet that must not be injected.",
        ].join("\n")
      );
      writeFileSync(join(cwd, ".ai/harness/context-budget/latest.json"), JSON.stringify({ zone: "red" }) + "\n");

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
      expect(codexRes.stdout).toContain("[CrossReview]");
      expect(codexRes.stdout).toContain("/claude-review");
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
      expect(res.stdout).toContain("capture-plan.sh");
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

  test("run-hook forwards Codex Stop decision JSON while suppressing handoff noise", () => {
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
      const decision = JSON.parse(res.stdout);
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("[PlanCompletenessGate]");
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
      expect(blockRes.stderr).toContain("[PlanStatusGuard]");
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

  test("prompt-guard: degrades to advisory when copied hooks cannot reach the TypeScript decision engine", () => {
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

      // Without bun/CLI the prompt layer cannot classify; it must degrade to
      // a one-shot advisory instead of guessing. The edit layer still blocks.
      expect(res.status).toBe(0);
      expect(res.stdout).toContain("degraded to advisory");
      expect(res.stdout).not.toContain("[PromptGuard] Decision engine unavailable or failed.");
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
      expect(editRes.stderr).toContain("[PlanStatusGuard]");
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

  test("prompt-guard: advises (not blocks) implement intent when plan status is Draft", () => {
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

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStatusGuard]");
      expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: routes explicit plan execution on Draft plan to capture gate", () => {
    const cwd = tmpWorkspace("prompt-guard-draft-plan-execution-approval");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const planPath = "plans/plan-20260304-1300-demo.md";
      writeFileSync(
        join(cwd, planPath),
        "# Plan: demo\n\n> **Status**: Draft\n"
      );
      writeActivePlan(cwd, planPath);

      expect(run("git", ["add", "."], cwd).status).toBe(0);
      expect(run("git", ["commit", "-m", "seed draft plan"], cwd).status).toBe(0);

      for (const prompt of ["implement this plan", "执行这个方案"]) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });

        expect(res.status).toBe(0);
        expect(res.stdout).toContain(`[PlanCaptureGate] Approval detected for Draft plan: ${planPath}`);
        expect(res.stdout).toContain(`bash scripts/plan-to-todo.sh --plan ${planPath}`);
        expect(res.stdout).not.toContain("[PlanStatusGuard]");
        expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: advises (not blocks) implement intent when approved plan lacks evidence contract", () => {
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

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[EvidenceContractGuard]");
      expect(res.stdout).not.toContain('"guard":"EvidenceContractGuard"');
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

  test("prompt-guard: stale research does not block discussion or auto-create a plan", () => {
    const cwd = tmpWorkspace("prompt-guard-research-advisory");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "tasks/research.md"), "# Research\n\nOlder finding.\n");
      writeFileSync(
        join(cwd, "plans/plan-20260530-0016-existing.md"),
        "# Plan: existing\n\n> **Status**: Draft\n"
      );
      const oldTime = new Date("2026-05-30T00:00:00Z");
      const newTime = new Date("2026-05-30T00:16:00Z");
      utimesSync(join(cwd, "tasks/research.md"), oldTime, oldTime);
      utimesSync(join(cwd, "plans/plan-20260530-0016-existing.md"), newTime, newTime);

      const beforePlans = readdirSync(join(cwd, "plans"));
      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message: "plan this hook interruption recovery flow with $think",
        }),
      });
      const afterPlans = readdirSync(join(cwd, "plans"));

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[ResearchGate] Advisory");
      expect(res.stdout).toContain("[PlanStartGate] Skipping automatic Draft plan workflow");
      expect(res.stdout).not.toContain('"guard":"ResearchGate"');
      expect(afterPlans).toEqual(beforePlans);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: continuation diagnostics do not start plan workflow", () => {
    const cwd = tmpWorkspace("prompt-guard-diagnostic-discussion");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "tasks/research.md"), "# Research\n\nFresh finding.\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message:
            "中断了，继续讨论：Codex Plan 状态丢了以后，hook 为什么以为到了下一步？这个 plan 逻辑怎么设计？",
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[WazaRoute] Agent workflow/tooling intent detected");
      expect(res.stdout).not.toContain("[ResearchGate]");
      expect(res.stdout).not.toContain("[PlanStartGate]");
      expect(existsSync(join(cwd, "plans"))).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats plan creation questions as consultation, not plan workflow", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-consultation");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "tasks"), { recursive: true });
      writeFileSync(join(cwd, "tasks/research.md"), "# Research\n\nFresh finding.\n");

      for (const prompt of [
        "怎么创建一个 new plan？",
        "why does create a new plan trigger Hook?",
        "这是咨询性问题，你Hook拦什么",
      ]) {
        const beforePlans = existsSync(join(cwd, "plans")) ? readdirSync(join(cwd, "plans")) : [];
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });
        const afterPlans = existsSync(join(cwd, "plans")) ? readdirSync(join(cwd, "plans")) : [];

        expect(res.status).toBe(0);
        expect(res.stdout).not.toContain("[PlanStartGate]");
        expect(res.stdout).not.toContain("[PlanStatusGuard]");
        expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
        expect(afterPlans).toEqual(beforePlans);
      }
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
      const pending = JSON.parse(readFileSync(join(cwd, ".ai/harness/planning/pending.json"), "utf-8"));
      expect(pending.kind).toBe("waza-think");
      expect(pending.prompt_slug).toBe("plan-this-hook-capture-flow-with-think");
      expect(pending.draft_plan_path).toBe(`plans/${plans[0]}`);
      expect(pending.expected_artifact).toBe("plans/plan-*.md");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: keeps multi-turn pending plan discussion out of implementation gates", () => {
    const cwd = tmpWorkspace("prompt-guard-pending-plan-discussion");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const start = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "plan this hook capture flow with $think" }),
      });
      expect(start.status).toBe(0);
      const beforePlans = readdirSync(join(cwd, "plans")).filter((name) => name.startsWith("plan-"));

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message:
            "同意，要解决用户可能需要多轮讨论才能落实plan的情况，否则一追问就被hook判死型。这里的处理不能过于机械",
        }),
      });
      const afterPlans = readdirSync(join(cwd, "plans")).filter((name) => name.startsWith("plan-"));

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanDiscussionGate]");
      expect(res.stdout).toContain("continuing discussion, not implementation");
      expect(res.stdout).not.toContain("[PlanStartGate]");
      expect(res.stdout).not.toContain("[PlanStatusGuard]");
      expect(afterPlans).toEqual(beforePlans);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: explicit execution with fresh pending plan asks for capture instead of hard-blocking", () => {
    const cwd = tmpWorkspace("prompt-guard-pending-plan-execute");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const start = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "plan this hook capture flow with $think" }),
      });
      expect(start.status).toBe(0);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanCaptureGate] Implementation requested while a pending plan/orchestration discussion has not been captured.");
      expect(res.stdout).toContain("capture-plan.sh");
      expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("stop-orchestrator: blocks once to force pending plan completeness review", () => {
    const cwd = tmpWorkspace("stop-orchestrator-plan-completeness");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/planning/pending.json"),
        JSON.stringify(
          {
            version: 1,
            kind: "waza-think",
            host: "claude",
            prompt_slug: "plan-completeness",
            draft_plan_path: "",
            source_ref: "thread://plan-completeness",
            expected_artifact: "plans/plan-*.md",
            cwd,
            created_at: "2026-06-01T09:00:00+0800",
          },
          null,
          2
        ) + "\n"
      );

      const lastAssistantMessage = [
        "## Approved design summary",
        "- Building: add a Stop hook planning completeness pass for pending orchestration.",
        "- Not building: implementation execution or plan capture.",
        "- Approach: route Stop through an orchestrator and block once with a review instruction.",
        "- Key decisions: keep plans/ authority, do not alter UserPromptSubmit, keep the gate one-shot.",
        "- Unknowns: host support is verified through the Stop JSON contract.",
      ].join("\n");

      const first = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "Stop",
          stop_hook_active: false,
          last_assistant_message: lastAssistantMessage,
        }),
        env: { HOOK_HOST: "claude" },
      });

      expect(first.status).toBe(0);
      expect(first.stderr).toContain("[FinalizeHandoff]");
      const decision = JSON.parse(first.stdout);
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("[PlanCompletenessGate]");
      expect(decision.reason).toContain("Do not implement");
      expect(decision.reason).toContain("external dependency/API key requirements");
      expect(decision.reason).toContain("phase independence");
      expect(existsSync(join(cwd, ".ai/harness/handoff/current.md"))).toBe(true);
      expect(existsSync(join(cwd, ".ai/harness/planning/plan-completeness.json"))).toBe(true);

      const second = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "Stop",
          stop_hook_active: false,
          last_assistant_message: lastAssistantMessage,
        }),
        env: { HOOK_HOST: "claude" },
      });

      expect(second.status).toBe(0);
      expect(second.stdout).toBe("");
      expect(second.stderr).toContain("[FinalizeHandoff]");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("stop-orchestrator: skips recursive Stop continuations and supports Codex block JSON", () => {
    const cwd = tmpWorkspace("stop-orchestrator-no-recursion");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      writeFileSync(
        join(cwd, ".ai/harness/planning/pending.json"),
        JSON.stringify({
          version: 1,
          kind: "waza-think",
          prompt_slug: "plan-completeness",
          created_at: "2026-06-01T09:00:00+0800",
        }) + "\n"
      );

      const lastAssistantMessage =
        "## Approved design summary\n" +
        "Building a plan completeness gate with P1 map, P2 trace, P3 decision rationale, tests, rollback, and risk handling. ".repeat(4);

      const recursive = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "Stop",
          stop_hook_active: true,
          last_assistant_message: lastAssistantMessage,
        }),
        env: { HOOK_HOST: "claude" },
      });
      expect(recursive.status).toBe(0);
      expect(recursive.stdout).toBe("");

      const codex = runHook("stop-orchestrator.sh", cwd, {
        stdin: JSON.stringify({
          hook_event_name: "Stop",
          stop_hook_active: false,
          last_assistant_message: lastAssistantMessage,
        }),
        env: { HOOK_HOST: "codex" },
      });
      expect(codex.status).toBe(0);
      const decision = JSON.parse(codex.stdout);
      expect(decision.decision).toBe("block");
      expect(decision.reason).toContain("[PlanCompletenessGate]");
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

  test("prompt-guard: does not include leading Waza think skill link paths in plan slugs", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-start-leading-skill-link");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message: "[$think](/Users/ancienttwo/.agents/skills/think/SKILL.md) 你来出一个详细方案吧",
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStartGate]");
      expect(res.stdout).toContain("Created plan:");
      const plans = readdirSync(join(cwd, "plans")).filter((name) => name.startsWith("plan-"));
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatch(/^plan-\d{8}-\d{4}-think-plan-\d{6}\.md$/);
      expect(plans[0]).not.toContain("users-ancienttwo");
      const pending = JSON.parse(readFileSync(join(cwd, ".ai/harness/planning/pending.json"), "utf-8"));
      expect(pending.kind).toBe("waza-think");
      expect(pending.prompt_slug).toMatch(/^think-plan-\d{6}$/);
      expect(pending.prompt_slug).not.toContain("users-ancienttwo");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: routes explicit Waza think planning before generic workflow health", () => {
    const cwd = tmpWorkspace("prompt-guard-think-before-health");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({
          user_message:
            "[$think](/Users/ancienttwo/.agents/skills/think/SKILL.md) 你看一下怎么加入到目前的hook workflow之中",
        }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[WazaRoute] Planning intent detected. Default route: Waza /think.");
      expect(res.stdout).not.toContain("Default route: Waza /health");
      expect(res.stdout).toContain("[PlanStartGate]");
      expect(res.stdout).not.toContain("[PlanStatusGuard]");
      const pending = JSON.parse(readFileSync(join(cwd, ".ai/harness/planning/pending.json"), "utf-8"));
      expect(pending.kind).toBe("waza-think");
      expect(pending.prompt_slug).toBe("think-hook-workflow");
      expect(pending.prompt_slug).not.toContain("users-ancienttwo");
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

  test("prompt-guard: advises (not blocks) implement intent when no active plan exists", () => {
    const cwd = tmpWorkspace("prompt-guard-missing-plan");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("No active plan found in plans/");
      expect(res.stdout).toContain("capture-plan.sh");
      expect(res.stdout).toContain("ensure-task-workflow.sh");
      expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: routes explicit plan execution approval to capture gate without active plan", () => {
    const cwd = tmpWorkspace("prompt-guard-missing-plan-execution-approval");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      for (const prompt of ["implement this plan", "implement the plan", "execute this plan"]) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
        });

        expect(res.status).toBe(0);
        expect(res.stdout).toContain("[PlanCaptureGate] Approval detected before an active plan artifact exists.");
        expect(res.stdout).toContain("capture-plan.sh");
        expect(res.stdout).not.toContain("[PlanStatusGuard] No active plan found");
        expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: stale pending plan marker does not bypass missing active-plan guard", () => {
    const cwd = tmpWorkspace("prompt-guard-stale-pending-plan");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, ".ai/harness/planning/pending.json"),
        JSON.stringify(
          {
            version: 1,
            kind: "codex-plan",
            host: "codex",
            prompt_slug: "old-plan",
            draft_plan_path: "",
            source_ref: "old",
            expected_artifact: "plans/plan-*.md",
            cwd,
            created_at: "2026-01-01T00:00:00+0000",
          },
          null,
          2
        ) + "\n"
      );
      const oldTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      utimesSync(join(cwd, ".ai/harness/planning/pending.json"), oldTime, oldTime);

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStatusGuard]");
      expect(res.stdout).not.toContain("[PlanCaptureGate] Implementation requested while a pending plan");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: bug-fix execution wording stays on hard plan gate even with pending plan marker", () => {
    const cwd = tmpWorkspace("prompt-guard-pending-bug-fix");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, ".ai/harness/planning"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");
      writeFileSync(
        join(cwd, ".ai/harness/planning/pending.json"),
        JSON.stringify({ version: 1, kind: "codex-plan", host: "codex", prompt_slug: "pending", expected_artifact: "plans/plan-*.md" }) + "\n"
      );

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "go ahead with the bug fix" }),
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[PlanStatusGuard]");
      expect(res.stdout).not.toContain("[PlanCaptureGate] Implementation requested while a pending plan");
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
      expect(executeRes.status).toBe(0);
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

  test("prompt-guard: treats plan consultation prompts as advisory", () => {
    const cwd = tmpWorkspace("prompt-guard-plan-consultation-status");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      installPlanWorkflowHelpers(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const planFiles = () =>
        existsSync(join(cwd, "plans"))
          ? readdirSync(join(cwd, "plans")).filter((name) => name.startsWith("plan-"))
          : [];

      const consultationPrompts = [
        "我应该创建计划还是继续咨询？",
        "Should I create a new plan or keep discussing the hook behavior?",
        [
          "Think 应该选择哪个方案：",
          "DOM/SVG 精修 vs 真 Three.js 重写——没分清之前我不动手。先把现有渲染器读透,这样无论走哪条我都能给出精确范围。",
          "",
          "Graph renderer 下一刀",
          "Read",
          "GraphCanvas.tsx",
          "渲染器读透了。关键判断已成形:这个 GraphCanvas 在数学上已经是真 3D。",
          "",
          "Ran a command, read a file",
          "图谱 CSS 也读透了,F-11/F-12 确认是外科手术级改动。现在把我答应\"由你拍\"的渲染器分路收掉。",
        ].join("\n"),
      ];

      for (const prompt of consultationPrompts) {
        const beforePlans = planFiles();
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
          env: { HOOK_HOST: "codex" },
        });
        const afterPlans = planFiles();

        expect(res.status).toBe(0);
        expect(res.stdout).not.toContain("[PlanStatusGuard] No active plan found");
        expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
        expect(res.stdout).not.toContain("[PlanStartGate]");
        expect(res.stdout).not.toContain("[BDD] Feature intent detected");
        expect(afterPlans).toEqual(beforePlans);
      }

      const explicitExecution = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
        env: { HOOK_HOST: "codex" },
      });

      expect(explicitExecution.status).toBe(0);
      expect(explicitExecution.stdout).toContain("[PlanStatusGuard] Advisory: No active plan found");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats copied worktree status as passive context", () => {
    const cwd = tmpWorkspace("prompt-guard-passive-worktree-status");
    const worktreePath = `${cwd}-wt-demo`;
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const passiveStatus = [
        "plan-to-todo 已按项目规则开了隔离 worktree：/Users/ancienttwo/Projects/agentic-dev-wt-demo，分支 codex/demo。",
        "实现会在这个 worktree 里完成。",
      ].join("\n");
      const passiveRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: passiveStatus }),
      });

      expect(passiveRes.status).toBe(0);
      expect(passiveRes.stdout).not.toContain("[PlanStatusGuard] No active plan found");
      expect(passiveRes.stdout).not.toContain("[BDD] Feature intent detected");

      const explicitRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "开始实现" }),
      });

      expect(explicitRes.status).toBe(0);
      expect(explicitRes.stdout).toContain("[PlanStatusGuard] Advisory: No active plan found");

      expect(run("git", ["worktree", "add", worktreePath, "-b", "codex/demo"], cwd).status).toBe(0);
      mkdirSync(join(worktreePath, "plans"), { recursive: true });
      writeActivePlan(worktreePath, "plans/plan-20260304-1400-demo.md");
      writeFileSync(join(worktreePath, "plans/plan-20260304-1400-demo.md"), "# Plan: demo\n\n> **Status**: Executing\n");

      const linkedWorktreePrompt = [
        "下一刀",
        `建议切 linked worktree 的计划实现。入口是 ${worktreePath}。`,
        "",
        "执行这个方案",
      ].join("\n");
      const linkedRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: linkedWorktreePrompt }),
      });

      expect(linkedRes.status).toBe(0);
      expect(linkedRes.stdout).toContain("[WorktreeExecutionGate]");
      expect(linkedRes.stdout).toContain(worktreePath);
      expect(linkedRes.stdout).not.toContain("[PlanStatusGuard] No active plan found");
    } finally {
      run("git", ["worktree", "remove", "--force", worktreePath], cwd);
      rmSync(worktreePath, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 15000);

  test("prompt-guard: treats retrospective completion reports as passive evidence", () => {
    const cwd = tmpWorkspace("prompt-guard-retrospective-completion-report");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const report = [
        "项目是用BUN，为什么使用了NPM？",
        "你问得对，是我漏了。",
        "原因不是技术限制，是流程收口没做完：第一次 PRD 产出时还在 Plan Mode，我只返回了 <proposed_plan>；后面实现时我补了代码和 README，但没有把 PRD 单独归档成文档。",
        "现在已补：",
        "Repo 内归档：docs/PRD.md",
        "gstack 本地归档：/Users/ancienttwo/.gstack/projects/loan-agent/ancienttwo-unknown-prd-20260531-archived.md",
        "并已复跑：",
        "npm run build 通过",
        "npm run lint 通过",
      ].join("\n");

      const res = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: report }),
        env: { HOOK_HOST: "codex" },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).not.toContain("[PlanStatusGuard] No active plan found");
      expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
      expect(res.stdout).not.toContain("[BDD] Feature intent detected");

      const explicitRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: "实现这个功能，README 已经有了" }),
        env: { HOOK_HOST: "codex" },
      });

      expect(explicitRes.status).toBe(0);
      expect(explicitRes.stdout).toContain("[PlanStatusGuard] Advisory: No active plan found");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("prompt-guard: treats next-slice reports as planning context", () => {
    const cwd = tmpWorkspace("prompt-guard-next-slice-plan-context");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      const prompts = [
        [
          "继续下一刀的方案",
          "下一刀",
          "建议切 external acceptance + contract-worktree finish。理由是实现和 sprint verification 已过，但 linked worktree 仍未 commit/merge，scripts/contract-worktree.sh finish 会被 external acceptance gate 拦住。入口是 tasks/reviews/ai-native-scaffold-architecture-profile.review.md (line 1) 和 bash scripts/contract-worktree.sh finish。",
        ].join("\n"),
        [
          "继续下一刀 Think",
          "已在 linked worktree 完成实现，未提交、未 merge。",
          "P1",
          "范围落在 scaffold 权威链路。",
          "P2",
          "已验证路径：AI_NATIVE_PROFILE=runtime-console -> assembleTemplate() -> getAiNativeTemplateVariables()。",
          "P3",
          "没有新增 Plan code。AI-native 是 overlay 轴。",
          "验证结果：",
          "bun test：514 pass, 6 skip, 0 fail",
        ].join("\n"),
        "下一刀，明显就是Plan呀",
      ];

      for (const prompt of prompts) {
        const res = runHook("prompt-guard.sh", cwd, {
          stdin: JSON.stringify({ user_message: prompt }),
          env: { HOOK_HOST: "codex" },
        });

        expect(res.status).toBe(0);
        expect(res.stdout).not.toContain("[PlanStatusGuard] No active plan found");
        expect(res.stdout).not.toContain('"guard":"PlanStatusGuard"');
        expect(res.stdout).not.toContain("[BDD] Feature intent detected");
      }

      const explicitRes = runHook("prompt-guard.sh", cwd, {
        stdin: JSON.stringify({ user_message: ["下一刀", "执行这个方案"].join("\n") }),
        env: { HOOK_HOST: "codex" },
      });

      expect(explicitRes.status).toBe(0);
      expect(explicitRes.stdout).toContain("[PlanStatusGuard] Advisory: No active plan found");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 10000);

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

      for (const prompt of ["GO", "go ahead with it", "please proceed", "可以干", "可以干了", "同意，执行吧"]) {
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
  }, 15000);

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

      for (const prompt of ["GO", "go ahead with it", "implement this plan", "implement the plan", "执行这个方案", "可以干了", "同意，执行吧"]) {
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
  }, 15000);

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

      expect(res.status).toBe(0);
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
        ["# Sprint Review: demo", "", "> **Recommendation**: pass", "", externalAcceptanceAdvice(), ""].join("\n")
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
        env: { HOOK_HOST: "claude" },
      });

      expect(res.status).toBe(0);
      expect(res.stdout).toContain("[verify] ok");
      expect(res.stdout).toContain("[AutoArchive] All quality gates passed");
      expect(res.stdout).toContain("[archive] mocked");
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
      writeFileSync(join(cwd, "tasks/reviews/demo.review.md"), "# Sprint Review: demo\n\n> **Recommendation**: pass\n");
      writeValidSprintChecks(cwd);
      writeFileSync(join(cwd, "scripts/verify-contract.sh"), "#!/bin/bash\nset -euo pipefail\necho \"[verify] ok\"\n");
      expect(run("chmod", ["+x", "scripts/verify-contract.sh"], cwd).status).toBe(0);

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
          ["# Sprint Review: demo", "", "> **Recommendation**: pass", "", externalAcceptanceAdvice(), ""].join("\n")
        );
        writeFileSync(join(cwd, ".ai/harness/checks/latest.json"), checks);
        writeFileSync(
          join(cwd, "scripts/verify-contract.sh"),
          "#!/bin/bash\nset -euo pipefail\necho \"[verify] ok\"\n"
        );
        expect(run("chmod", ["+x", "scripts/verify-contract.sh"], cwd).status).toBe(0);

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
  }, 15000);

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
        env: { REPO_HARNESS_EDIT_PLAN_GATE: "off" },
      });
      expect(assetRes.status).toBe(0);
      expect(assetRes.stdout).toContain("[AssetLayer]");

      const tddRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/widget.ts" } }),
        env: { REPO_HARNESS_EDIT_PLAN_GATE: "off" },
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

  test("pre-edit-guard: edit plan gate blocks implementation edits by plan state", () => {
    const cwd = tmpWorkspace("pre-edit-plan-gate");
    try {
      initGitRepo(cwd);
      installHooks(cwd);
      mkdirSync(join(cwd, "docs"), { recursive: true });
      mkdirSync(join(cwd, "plans"), { recursive: true });
      writeFileSync(join(cwd, "docs/spec.md"), "# Product Spec\n");

      // No active plan: implementation paths block, workflow surfaces pass.
      const noPlanRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
      });
      expect(noPlanRes.status).toBe(2);
      expect(noPlanRes.stderr).toContain("[PlanStatusGuard]");

      const workflowRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "tasks/todo.md" } }),
      });
      expect(workflowRes.status).toBe(0);

      // Advice mode warns without blocking.
      const adviceRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
        env: { REPO_HARNESS_EDIT_PLAN_GATE: "advice" },
      });
      expect(adviceRes.status).toBe(0);
      expect(adviceRes.stdout).toContain("[PlanStatusGuard] Advisory");

      // Draft plan still blocks; Approved plan passes.
      const planPath = "plans/plan-20260610-1000-gate.md";
      writeFileSync(join(cwd, planPath), "# Plan: gate\n\n> **Status**: Draft\n");
      writeActivePlan(cwd, planPath);
      const draftRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
      });
      expect(draftRes.status).toBe(2);
      expect(draftRes.stderr).toContain("[PlanStatusGuard]");

      writeFileSync(join(cwd, planPath), "# Plan: gate\n\n> **Status**: Approved\n");
      const approvedRes = runHook("pre-edit-guard.sh", cwd, {
        stdin: JSON.stringify({ tool_input: { file_path: "src/app.ts" } }),
      });
      expect(approvedRes.status).toBe(0);
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
      expect(handoff).toContain("second task");
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
      const broadJson = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
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
      const preciseJson = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
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
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
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
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
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
      const latest = JSON.parse(readFileSync(join(cwd, ".ai/harness/checks/latest.json"), "utf-8"));
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
