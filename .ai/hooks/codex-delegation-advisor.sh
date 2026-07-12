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

  function readGlobalDelegationMode() {
    try {
      const home = process.env.HOME;
      if (!home) return null;
      const raw = fs.readFileSync(path.join(home, ".repo-harness", "config.json"), "utf8");
      const parsed = JSON.parse(raw);
      const mode = parsed && parsed.delegation && parsed.delegation.mode;
      return mode === "auto" || mode === "explicit" ? mode : null;
    } catch {
      return null;
    }
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
    if (/^\s*(please\s+)?(spawn|use|run)\s+(bounded\s+)?subagents?\s+(to|for)\b/i.test(text)) return false;
    return [
      /[?？]/,
      /\b(should|need|necessary)\b/i,
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

  const repoRoot = process.env.REPO_ROOT || process.cwd();

  let policyDelegation = {};
  try {
    policyDelegation =
      JSON.parse(fs.readFileSync(path.join(repoRoot, ".ai", "harness", "policy.json"), "utf8")).delegation || {};
  } catch {
    policyDelegation = {};
  }

  const globalDelegationMode = readGlobalDelegationMode();
  const effectiveDelegationMode = globalDelegationMode || (policyDelegation.mode === "auto" ? "auto" : "explicit");

  const explicit = Boolean(trigger);
  if (!explicit) {
    if (effectiveDelegationMode !== "auto") process.exit(0);
    if (isDelegationDiscussion(prompt)) process.exit(0);
  }

  let strictContract = false;
  try {
    const plan = fs.readFileSync(path.join(repoRoot, ".ai", "harness", "active-plan"), "utf8").trim();
    const match = /^plans\/plan-(.+)\.md$/.exec(plan);
    if (match) {
      const contract = fs.readFileSync(path.join(repoRoot, "tasks", "contracts", `${match[1]}.contract.md`), "utf8");
      strictContract = /^> \*\*Workflow Profile\*\*:\s*strict\s*$/mi.test(contract);
    }
  } catch { strictContract = false; }
  const defaultMax = Number.isInteger(policyDelegation.max_agents) ? policyDelegation.max_agents : 2;
  const strictMax = Number.isInteger(policyDelegation.strict_max_agents) ? policyDelegation.strict_max_agents : 3;
  const maxAgents = strictContract ? Math.min(strictMax, 3) : Math.min(defaultMax, 2);
  const maxDepth = Number.isInteger(policyDelegation.max_depth) ? policyDelegation.max_depth : 1;
  const preferredRunners =
    Array.isArray(policyDelegation.preferred_runners) && policyDelegation.preferred_runners.length
      ? policyDelegation.preferred_runners
      : ["subagent"];
  const fallbackRunner =
    typeof policyDelegation.fallback_runner === "string" && policyDelegation.fallback_runner
      ? policyDelegation.fallback_runner
      : null;

  const stateDir = path.join(repoRoot, ".ai", "harness", "delegation");
  fs.mkdirSync(stateDir, { recursive: true });

  const now = new Date();
  const scope = delegationScope(input);
  const relativeStateFile = scope ? path.join("turns", `${scope.id}.json`) : "latest.json";
  const state = {
    version: 1,
    eligible: true,
    explicit,
    spawned: false,
    fallback_used: false,
    mode: explicit ? "explicit" : "auto",
    max_agents: maxAgents,
    max_depth: maxDepth,
    allow_parallel_writers: false,
    stop_fallback: explicit,
    preferred_runners: preferredRunners,
    fallback_runner: fallbackRunner,
    trigger: explicit ? trigger.name : "auto-mode",
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
    explicit
      ? "The current user prompt explicitly enabled bounded delegation."
      : "Repo policy delegation.mode=auto is standing user authorization for bounded delegation, selected by the user at install time. This satisfies the user-authorization requirement for native subagents (spawn_agent) when the dispatch conditions below are met.",
    "",
    "Treat the active task contract (tasks/contracts/<active-plan-stem>.contract.md) as the authoritative execution brief: Goal, Scope, Allowed Paths, and Exit Criteria. Do not re-derive scope from this conversation.",
    "",
    `Runner preference (policy delegation.preferred_runners): ${preferredRunners.join(", ")}. Native subagent (spawn_agent) is the preferred parallelism accelerator that consumes the contract brief. When spawn_agent is unavailable, sandboxed, or unreliable, degrade to ${fallbackRunner || "main-thread"} on the SAME contract via contract-run. Runner-availability degradation MUST be recorded in the contract-run manifest and MUST NOT silently succeed; it is a runner-availability fallback, not a product-semantics change.`,
    "",
    "If this task contains at least two independent, bounded workstreams, dispatch per the contract before doing the corresponding work in the parent; otherwise run it sequentially.",
    "",
    "Rules:",
    `- Spawn no more than ${maxAgents} agents.`,
    "- Use explorer for read-only code mapping.",
    "- Use worker only for an isolated implementation slice.",
    "- Use reviewer for correctness, regression, security, and missing-test review.",
    "- Never give two agents overlapping write ownership.",
    `- Keep max spawn depth at ${maxDepth}.`,
    "- Give every agent a precise scope and required return format.",
    "- Wait for all requested agents.",
    "- Reconcile contradictory findings in the parent.",
    "- Close completed agent threads.",
    "- Do not spawn for a trivial or strictly sequential task.",
    "",
    "Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.",
    "",
    "Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.",
    "",
    "If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.",
    "",
    "If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.",
  ].join("\n");

  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  })}\n`);
'
