#!/bin/bash
# Subagent Start Context - SubagentStart.context
# Marks explicit delegation as spawned and injects the repo-harness subagent
# return contract into Codex-created subagents.

set -euo pipefail

[[ "${HOOK_HOST:-}" == "codex" ]] || exit 0
command -v bun >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

hook_read_stdin_once

subagent_profile=""
explicit_high_risk="false"
if [[ -f .ai/harness/state/effective.json ]] && command -v jq >/dev/null 2>&1; then
  subagent_profile="$(jq -r '.workflow_profile // empty' .ai/harness/state/effective.json 2>/dev/null || true)"
fi
active_contract="$(cat .ai/harness/active-plan 2>/dev/null | sed 's#plans/plan-#tasks/contracts/#; s#\.md$#.contract.md#' || true)"
if [[ -f "$active_contract" ]] && grep -Eiq '^> \*\*(Workflow Profile|Risk)\*\*:[[:space:]]*(strict|high)[[:space:]]*$' "$active_contract"; then
  subagent_profile="strict"
  explicit_high_risk="true"
fi
if ! subagent_circuit="$(hook_circuit_record subagent SubagentLimit 'bounded subagent spawn cap' spawn-subagent subagent-spawn "$subagent_profile" "$explicit_high_risk" false false false)"; then
  [[ -n "$subagent_circuit" ]] && printf '%s\n' "$subagent_circuit" >&2
  exit 2
fi

JSON_INPUT="$HOOK_STDIN_JSON" REPO_ROOT="${HOOK_REPO_ROOT:-$(pwd)}" bun -e '
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

  function parseInput() {
    try {
      return JSON.parse(process.env.JSON_INPUT || "{}");
    } catch {
      return {};
    }
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

  function resolveStatePath(stateDir, scope) {
    const latestPath = path.join(stateDir, "latest.json");
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    if (latest.scope_id) {
      if (!scope || latest.scope_id !== scope.id) return null;
      const statePath = path.resolve(stateDir, latest.state_file || path.join("turns", `${latest.scope_id}.json`));
      const stateRoot = path.resolve(stateDir) + path.sep;
      if (!statePath.startsWith(stateRoot)) return null;
      return {
        latestPath,
        statePath,
      };
    }
    return { latestPath, statePath: latestPath };
  }

  const repoRoot = process.env.REPO_ROOT || process.cwd();
  const stateDir = path.join(repoRoot, ".ai", "harness", "delegation");
  try {
    const paths = resolveStatePath(stateDir, delegationScope(parseInput()));
    if (!paths) throw new Error("delegation state belongs to a different scope");
    const state = JSON.parse(fs.readFileSync(paths.statePath, "utf8"));
    if (state && state.eligible && state.explicit && !state.spawned) {
      const now = new Date().toISOString();
      state.spawned = true;
      state.spawned_at = now;
      state.updated_at = now;
      fs.writeFileSync(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
      fs.writeFileSync(paths.latestPath, `${JSON.stringify(state, null, 2)}\n`);
    }
  } catch {
    // SubagentStart context is still useful without delegation state.
  }

  const context = [
    "[repo-harness:subagent-context]",
    "",
    "Read the active repo-harness contract before working.",
    "Stay within the assigned role and permission scope.",
    "Do not broaden the task.",
    "Explorer and reviewer roles are read-only unless the parent prompt explicitly assigns a writable worker scope.",
    "",
    "Return complete findings in your final response, including:",
    "- files and symbols inspected",
    "- evidence",
    "- risks or uncertainty",
    "- tests or commands run when relevant",
    "- recommended parent action",
    "",
    "Do not claim overall task completion.",
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
      hookEventName: "SubagentStart",
      additionalContext: context,
    },
  })}\n`);
'
