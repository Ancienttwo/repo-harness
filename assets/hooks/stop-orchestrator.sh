#!/bin/bash
# Stop Orchestrator Hook - Stop
# Refreshes handoff state and, for pending planning discussions, forces one
# self-review pass before the agent stops.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

plan_completeness_state_file() {
  workflow_repo_relative_path \
    "$(workflow_policy_get '.planning.completeness_state_file' '.ai/harness/planning/plan-completeness.json')" \
    '.ai/harness/planning/plan-completeness.json' \
    '.ai/harness/'
}

plan_completeness_signature() {
  local kind prompt_slug draft_path source_ref created_at

  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  created_at="$(workflow_pending_orchestration_field created_at 2>/dev/null || true)"

  printf '%s|%s|%s|%s|%s' \
    "${kind:-unknown}" \
    "${prompt_slug:-planning}" \
    "${draft_path:-none}" \
    "${source_ref:-none}" \
    "${created_at:-unknown}"
}

plan_completeness_last_signature() {
  local state_file value
  state_file="$(plan_completeness_state_file)"
  [[ -f "$state_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    value="$(jq -r '.last_signature // empty' "$state_file" 2>/dev/null || true)"
  else
    value="$(
      awk '
        /"last_signature"/ {
          line = $0
          sub(/^[^:]*:[[:space:]]*"/, "", line)
          sub(/"[[:space:]]*,?[[:space:]]*$/, "", line)
          print line
          exit
        }
      ' "$state_file"
    )"
  fi

  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

plan_completeness_record_signature() {
  local signature="$1"
  local state_file
  state_file="$(plan_completeness_state_file)"
  mkdir -p "$(dirname "$state_file")"

  if command -v jq >/dev/null 2>&1; then
    jq -nc \
      --arg signature "$signature" \
      --arg updated_at "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
      '{version:1,last_signature:$signature,updated_at:$updated_at}' > "$state_file"
    return 0
  fi

  cat > "$state_file" <<EOF_STATE
{"version":1,"last_signature":"$(workflow_json_escape "$signature")","updated_at":"$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")"}
EOF_STATE
}

plan_completeness_shell_quote() {
  printf '%q' "$1"
}

plan_completeness_capture_guidance() {
  local kind prompt_slug source_ref title source_arg

  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"

  kind="${kind:-host-plan}"
  prompt_slug="${prompt_slug:-planning}"
  title="${source_ref:-$prompt_slug}"
  source_arg=""
  if [[ -n "$source_ref" ]]; then
    source_arg=" --source-ref $(plan_completeness_shell_quote "$source_ref")"
  fi

  cat <<EOF_GUIDANCE
If the planning answer is decision-complete, capture the final plan body before stopping:
  printf '%s\n' '<decision-complete plan body>' | bash scripts/capture-plan.sh --slug $(plan_completeness_shell_quote "$prompt_slug") --title $(plan_completeness_shell_quote "$title") --status Draft --source $(plan_completeness_shell_quote "$kind") --orchestration-kind $(plan_completeness_shell_quote "$kind") --route planning${source_arg}

If the user already approved implementation, use:
  printf '%s\n' '<approved plan body>' | bash scripts/capture-plan.sh --slug $(plan_completeness_shell_quote "$prompt_slug") --title $(plan_completeness_shell_quote "$title") --status Approved --source $(plan_completeness_shell_quote "$kind") --orchestration-kind $(plan_completeness_shell_quote "$kind") --route planning --execute${source_arg}

If the plan is not decision-complete, revise once for: goal/success criteria, scope/non-scope, constraints, P1/P2/P3, fragile assumption, rejected alternative, public API/config/file-interface changes, external dependency/API key requirements, tests, rollback/failure handling, phase independence, and no placeholders. Do not implement until capture succeeds.
EOF_GUIDANCE
}

assistant_message_looks_like_plan() {
  local message="$1"
  local length

  length="$(printf '%s' "$message" | wc -c | tr -d ' ')"
  [[ "${length:-0}" -ge 240 ]] || return 1

  printf '%s\n' "$message" | grep -qEi \
    '(Approved design summary|Building|Not building|Approach|Key decisions|Unknowns|Task Breakdown|Evidence Contract|P1|P2|P3|plan|design|方案|计划|设计)'
}

emit_stop_block_json() {
  local reason="$1"

  if command -v jq >/dev/null 2>&1; then
    jq -nc --arg reason "$reason" '{decision:"block",reason:$reason}'
    return 0
  fi

  printf '{"decision":"block","reason":"%s"}\n' "$(workflow_json_escape "$reason")"
}

delegation_state_paths_json() {
  local state_dir

  state_dir="${HOOK_REPO_ROOT:-$(pwd)}/.ai/harness/delegation"
  [[ -f "$state_dir/latest.json" ]] || return 1
  command -v bun >/dev/null 2>&1 || return 1

  JSON_INPUT="${HOOK_STDIN_JSON:-}" DELEGATION_STATE_DIR="$state_dir" bun -e '
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

    const stateDir = process.env.DELEGATION_STATE_DIR;
    const latestPath = path.join(stateDir, "latest.json");
    const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    const scope = delegationScope(parseInput());
    if (latest.scope_id) {
      if (!scope || latest.scope_id !== scope.id) process.exit(1);
      const statePath = path.resolve(stateDir, latest.state_file || path.join("turns", `${latest.scope_id}.json`));
      const stateRoot = path.resolve(stateDir) + path.sep;
      if (!statePath.startsWith(stateRoot)) process.exit(1);
      process.stdout.write(JSON.stringify({ latestPath, statePath }));
      process.exit(0);
    }
    process.stdout.write(JSON.stringify({ latestPath, statePath: latestPath }));
  ' 2>/dev/null
}

delegation_should_block() {
  local stop_active="$1"
  local state_paths

  [[ "$stop_active" != "true" ]] || return 1
  state_paths="$(delegation_state_paths_json)" || return 1
  command -v bun >/dev/null 2>&1 || return 1

  DELEGATION_STATE_PATHS="$state_paths" bun -e '
    const fs = require("fs");
    const paths = JSON.parse(process.env.DELEGATION_STATE_PATHS || "{}");
    const state = JSON.parse(fs.readFileSync(paths.statePath, "utf8"));
    const now = Math.floor(Date.now() / 1000);
    const age = Number.isFinite(Number(state.created_at_epoch)) ? now - Number(state.created_at_epoch) : 0;
    const fresh = age >= 0 && age <= 24 * 60 * 60;
    process.exit(state.eligible === true && state.explicit === true && state.spawned !== true && state.fallback_used !== true && state.stop_fallback !== false && fresh ? 0 : 1);
  ' >/dev/null 2>&1
}

delegation_mark_fallback_used() {
  local state_paths

  state_paths="$(delegation_state_paths_json)" || return 0
  command -v bun >/dev/null 2>&1 || return 0

  DELEGATION_STATE_PATHS="$state_paths" bun -e '
    const fs = require("fs");
    const paths = JSON.parse(process.env.DELEGATION_STATE_PATHS || "{}");
    const state = JSON.parse(fs.readFileSync(paths.statePath, "utf8"));
    state.fallback_used = true;
    state.fallback_used_at = new Date().toISOString();
    state.updated_at = state.fallback_used_at;
    fs.writeFileSync(paths.statePath, `${JSON.stringify(state, null, 2)}\n`);
    fs.writeFileSync(paths.latestPath, `${JSON.stringify(state, null, 2)}\n`);
  ' >/dev/null 2>&1 || true
}

refresh_handoff() {
  workflow_write_handoff "session-stop"
  echo "[FinalizeHandoff] Refreshed $(workflow_handoff_file)." >&2
}

should_run_plan_completeness_gate() {
  local stop_active="$1"
  local last_message="$2"
  local active_plan

  [[ "$stop_active" != "true" ]] || return 1
  workflow_pending_orchestration_is_fresh || return 1

  # If a repo plan is already active, the normal plan status gates own the next
  # transition. This gate only covers host planning output that still needs
  # capture.
  active_plan="$(get_active_plan || true)"
  [[ -z "$active_plan" || ! -f "$active_plan" ]] || return 1

  assistant_message_looks_like_plan "$last_message"
}

refresh_handoff

stop_hook_active="$(hook_json_get '.stop_hook_active' 'false')"
last_assistant_message="$(hook_json_get '.last_assistant_message' '')"

if should_run_plan_completeness_gate "$stop_hook_active" "$last_assistant_message"; then
  signature="$(plan_completeness_signature)"
  if [[ "$(plan_completeness_last_signature 2>/dev/null || true)" != "$signature" ]]; then
    plan_completeness_record_signature "$signature"
    summary="$(workflow_pending_orchestration_summary)"
    guidance="$(plan_completeness_capture_guidance)"
    emit_stop_block_json "[PlanCompletenessGate] A first planning answer was produced while pending orchestration is still open: ${summary}

${guidance}"
    exit 0
  fi
fi

if delegation_should_block "$stop_hook_active"; then
  delegation_mark_fallback_used
  emit_stop_block_json "[DelegationFallback] This turn explicitly requested bounded delegation, but no SubagentStart event was observed. Continue the task now by spawning the independent explorer/reviewer or isolated worker workstreams first when at least two independent workstreams exist, wait for them, reconcile their findings in the parent, then complete the response. Do not spawn for a trivial or strictly sequential task."
fi
