#!/bin/bash
# Codex Delegation Advisor - UserPromptSubmit.delegation
# Converts explicit user delegation requests into bounded Codex subagent context.

set -euo pipefail

[[ "${HOOK_HOST:-}" == "codex" ]] || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

hook_read_stdin_once
input="$HOOK_STDIN_JSON"
[[ -n "$input" ]] || exit 0
command -v bun >/dev/null 2>&1 || exit 0

JSON_INPUT="$input" REPO_ROOT="${HOOK_REPO_ROOT:-$(pwd)}" bun -e '
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");

  function sanitize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 120);
  }

  function firstString(input, keys) {
    for (const key of keys) {
      const value = input?.[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return "";
  }

  function delegationScope(input) {
    const runId = firstString(input, ["run_id"]);
    if (runId) return { source: "run_id", id: `run-${sanitize(runId)}` };

    const sessionId = firstString(input, ["session_id"]);
    if (sessionId) return { source: "session_id", id: `session-${sanitize(sessionId)}` };

    const transcriptPath = firstString(input, ["transcript_path"]);
    if (transcriptPath) {
      const digest = crypto.createHash("sha1").update(transcriptPath).digest("hex").slice(0, 16);
      return { source: "transcript_path", id: `transcript-${digest}` };
    }

    const envSession = process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || "";
    if (envSession) return { source: "env_session", id: `session-${sanitize(envSession)}` };

    return null;
  }

  let input;
  try {
    input = JSON.parse(process.env.JSON_INPUT || "");
  } catch {
    process.exit(0);
  }

  const prompt = firstString(input, [
    "prompt",
    "user_prompt",
    "user_message",
    "message",
    "input",
  ]);
  if (!prompt) process.exit(0);

  function isDelegationDiscussion(text) {
    if (!/\b(spawn|use|run)\s+(bounded\s+)?subagents?\b/i.test(text)) return false;
    return [
      /[?？]/,
      /\b(should|need|necessary|why|how|what)\b/i,
      /(机制|有必要|必要|是否|为什么|怎么|如何|架构|设计|注册|路由|本来就有)/i,
      /\b(mechanism|architecture|design|registration|route|routing|adapter|hook)\b/i,
    ].some((pattern) => pattern.test(text));
  }

  const triggers = [
    { name: "slash-delegate", pattern: /(^|\s)\/(delegate|parallel)\b/i },
    { name: "spawn-subagents", pattern: /\b(spawn|use|run)\s+(bounded\s+)?subagents?\b/i, skipDiscussion: true },
    { name: "multiple-agents", pattern: /\buse\s+multiple\s+agents?\b/i },
    { name: "parallel-agents", pattern: /\bparallel\s+(agents?|workstreams?|investigation|research)\b/i },
    { name: "chinese-subagent", pattern: /交给\s*子代理|使用多个\s*(agent|代理)|并行(调查|研究|处理|执行|agent|代理)/i },
  ];
  const trigger = triggers.find((entry) => entry.pattern.test(prompt) && !(entry.skipDiscussion && isDelegationDiscussion(prompt)));
  if (!trigger) process.exit(0);

  const repoRoot = process.env.REPO_ROOT || process.cwd();
  const stateDir = path.join(repoRoot, ".ai", "harness", "delegation");
  fs.mkdirSync(stateDir, { recursive: true });

  const now = new Date();
  const scope = delegationScope(input);
  const relativeStateFile = scope ? path.join("turns", `${scope.id}.json`) : "latest.json";
  const state = {
    version: 1,
    eligible: true,
    explicit: true,
    spawned: false,
    fallback_used: false,
    mode: "explicit",
    max_agents: 3,
    max_depth: 1,
    allow_parallel_writers: false,
    stop_fallback: true,
    trigger: trigger.name,
    prompt_hash: crypto.createHash("sha1").update(prompt).digest("hex"),
    scope_source: scope?.source || "unscoped",
    scope_id: scope?.id || "",
    state_file: relativeStateFile,
    created_at: now.toISOString(),
    created_at_epoch: Math.floor(now.getTime() / 1000),
    updated_at: now.toISOString(),
  };
  if (scope) {
    const statePath = path.join(stateDir, relativeStateFile);
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }
  fs.writeFileSync(path.join(stateDir, "latest.json"), `${JSON.stringify(state, null, 2)}\n`);

  const context = [
    "[repo-harness:delegation]",
    "",
    "The current user prompt explicitly enabled bounded delegation.",
    "",
    "If this task contains at least two independent, bounded workstreams, call spawn_agent before doing the corresponding work in the parent.",
    "",
    "Rules:",
    "- Spawn no more than 3 agents.",
    "- Use explorer for read-only code mapping.",
    "- Use worker only for an isolated implementation slice.",
    "- Use reviewer for correctness, regression, security, and missing-test review.",
    "- Never give two agents overlapping write ownership.",
    "- Keep max spawn depth at 1.",
    "- Give every agent a precise scope and required return format.",
    "- Wait for all requested agents.",
    "- Reconcile contradictory findings in the parent.",
    "- Close completed agent threads.",
    "- Do not spawn for a trivial or strictly sequential task.",
  ].join("\n");

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  })}\n`);
'
