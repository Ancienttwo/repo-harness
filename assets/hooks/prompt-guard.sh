#!/bin/bash
# Prompt Guard Hook — UserPromptSubmit
# Shell layer: filesystem authority (plan/contract/worktree state), capture
# side effects, and host-safe rendering. All prompt-text intent classification
# lives in the TypeScript engine behind `prompt-guard-decide`, which receives
# {"prompt": ...} on stdin plus PROMPT_GUARD_*_STATE env vars and returns a
# single-line verdict JSON (action + intent facts + derived strings).
#
# Prompt-layer plan/spec/contract gates are advisory: they explain the next
# workflow step and exit 0. Hard enforcement lives in the PreToolUse edit
# layer (pre-edit-guard.sh), which blocks implementation edits determinist-
# ically by path + plan state instead of guessing at natural language.
# Done-claim gates stay blocking: they verify file-backed evidence, not
# language.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/session-state.sh"
if [[ -f "$SCRIPT_DIR/lib/minimal-change.sh" ]]; then
  # shellcheck source=/dev/null
  . "$SCRIPT_DIR/lib/minimal-change.sh"
fi

repo_harness_runner_available() {
  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "$REPO_HARNESS_CLI" ]] && command -v bun >/dev/null 2>&1; then
    return 0
  fi
  command -v repo-harness >/dev/null 2>&1
}

run_repo_harness_helper() {
  local helper="$1"
  shift
  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "$REPO_HARNESS_CLI" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_CLI" run "$helper" "$@"
    return $?
  fi
  repo-harness run "$helper" "$@"
}

# --- Filesystem/worktree helpers (shell-owned authority) ---

prompt_matches_worktree_record() {
  local worktree_path="$1"
  local branch_name="$2"
  local path_base

  [[ -n "$worktree_path" ]] || return 1
  if printf '%s' "$PROMPT_INTENT_TEXT" | grep -Fq "$worktree_path"; then
    return 0
  fi

  path_base="$(basename "$worktree_path")"
  if [[ -n "$path_base" ]] && printf '%s' "$PROMPT_INTENT_TEXT" | grep -Fq "$path_base"; then
    return 0
  fi

  if [[ -n "$branch_name" ]] && printf '%s' "$PROMPT_INTENT_TEXT" | grep -Fq "$branch_name"; then
    return 0
  fi

  return 1
}

prompt_linked_worktree_target() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  git worktree list --porcelain >/dev/null 2>&1 || return 1

  local current worktree_path branch_name line real_path active_plan
  current="$(pwd -P)"
  worktree_path=""
  branch_name=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -z "$line" ]]; then
      if [[ -n "$worktree_path" ]]; then
        real_path="$(cd "$worktree_path" 2>/dev/null && pwd -P || true)"
        active_plan="$(cat "$worktree_path/.ai/harness/active-plan" 2>/dev/null | xargs || true)"
        if [[ -n "$real_path" && "$real_path" != "$current" ]] \
          && [[ -n "$active_plan" && -f "$worktree_path/$active_plan" ]] \
          && prompt_matches_worktree_record "$worktree_path" "$branch_name"; then
          printf '%s' "$worktree_path"
          return 0
        fi
      fi
      worktree_path=""
      branch_name=""
      continue
    fi

    case "$line" in
      worktree\ *)
        worktree_path="${line#worktree }"
        ;;
      branch\ *)
        branch_name="${line#branch }"
        branch_name="${branch_name#refs/heads/}"
        ;;
    esac
  done < <(git worktree list --porcelain 2>/dev/null || true)

  if [[ -n "$worktree_path" ]]; then
    real_path="$(cd "$worktree_path" 2>/dev/null && pwd -P || true)"
    active_plan="$(cat "$worktree_path/.ai/harness/active-plan" 2>/dev/null | xargs || true)"
    if [[ -n "$real_path" && "$real_path" != "$current" ]] \
      && [[ -n "$active_plan" && -f "$worktree_path/$active_plan" ]] \
      && prompt_matches_worktree_record "$worktree_path" "$branch_name"; then
      printf '%s' "$worktree_path"
      return 0
    fi
  fi

  return 1
}

active_plan_marker_problem() {
  local marker_file marker_plan owner current

  current="$(pwd -P)"
  if [[ -f "$ACTIVE_WORKTREE_MARKER" ]]; then
    owner="$(cat "$ACTIVE_WORKTREE_MARKER" 2>/dev/null | xargs)"
    if [[ -n "$owner" && "$owner" != "$current" ]]; then
      printf 'active plan marker belongs to a different worktree: %s' "$owner"
      return 0
    fi
  fi

  for marker_file in "$ACTIVE_PLAN_MARKER"; do
    [[ -f "$marker_file" ]] || continue
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && ! -f "$marker_plan" ]]; then
      printf 'stale active plan marker points to missing plan: %s' "$marker_plan"
      return 0
    fi
  done

  return 1
}

plan_evidence_contract_error() {
  local file="$1"
  local section=""
  local missing=0

  section="$(awk '
    BEGIN { in_section = 0 }
    /^## Evidence Contract[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section { print }
  ' "$file")"

  if [[ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]]; then
    echo "missing ## Evidence Contract section"
    return 1
  fi

  local label line value
  for label in "State/progress path" "Verification evidence" "Evaluator rubric" "Stop condition" "Rollback surface"; do
    line="$(printf '%s\n' "$section" | grep -Ei "^[[:space:]]*-[[:space:]]*(\\*\\*)?${label}(\\*\\*)?[[:space:]]*:" | head -1 || true)"
    if [[ -z "$line" ]]; then
      echo "missing field: ${label}"
      missing=1
      continue
    fi

    value="${line#*:}"
    value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [[ -z "$value" ]] || printf '%s' "$value" | grep -Eiq '^(tbd|todo|n/a|none|unknown|\.\.\.)$'; then
      echo "field has no concrete value: ${label}"
      missing=1
    fi
  done

  [[ "$missing" -eq 0 ]]
}

# Strip host-injected context blocks so worktree matching sees the user's
# words. The TypeScript engine performs the same strip for classification.
strip_prompt_context_blocks() {
  awk '
    /^[[:space:]]*<(skill|environment_context|INSTRUCTIONS|system|developer|app-context|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions)[^>]*>[[:space:]]*$/ {
      skip = 1
      next
    }
    /^[[:space:]]*<\/(skill|environment_context|INSTRUCTIONS|system|developer|app-context|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions)>[[:space:]]*$/ {
      skip = 0
      next
    }
    skip { next }
    { print }
  '
}

prompt_intent_text() {
  local stripped
  stripped="$(printf '%s\n' "$PROMPT_TEXT" | strip_prompt_context_blocks | sed -E '/^[[:space:]]*$/d')"
  if [[ -n "$(printf '%s' "$stripped" | tr -d '[:space:]')" ]]; then
    printf '%s' "$stripped"
  else
    printf '%s' "$PROMPT_TEXT"
  fi
}

prompt_nearest_existing_path() {
  local path="$1"
  while [[ "$path" != "/" && ! -e "$path" && ! -L "$path" ]]; do
    path="$(dirname "$path")"
  done
  [[ -e "$path" || -L "$path" ]] || return 1
  printf '%s' "$path"
}

prompt_resolve_probe_path() {
  local path="$1"
  local base target hops followed state
  hops=0
  followed=0

  while true; do
    path="$(prompt_nearest_existing_path "$path")" || {
      printf 'SKIP\t%s' "$1"
      return 0
    }
    if [[ ! -L "$path" ]]; then
      state="OK"
      [[ "$followed" -eq 1 ]] && state="OK_SYMLINK"
      printf '%s\t%s' "$state" "$path"
      return 0
    fi

    hops=$((hops + 1))
    if [[ "$hops" -gt 20 ]]; then
      printf 'FAIL\t%s' "$path"
      return 0
    fi
    target="$(readlink "$path" 2>/dev/null || true)"
    if [[ -z "$target" ]]; then
      printf 'FAIL\t%s' "$path"
      return 0
    fi
    followed=1

    if [[ "$target" == /* ]]; then
      path="$target"
    else
      base="$(dirname "$path")"
      path="$base/$target"
    fi
  done
}

prompt_foreign_repo_root() {
  local current_root current_real candidates raw candidate probe_record probe_state probe dir dir_real root root_real
  current_root="${HOOK_REPO_ROOT:-$(pwd)}"
  current_real="$(cd "$current_root" 2>/dev/null && pwd -P || true)"
  [[ -n "$current_real" ]] || current_real="$current_root"

  candidates="$(printf '%s\n' "$PROMPT_INTENT_TEXT" | awk '
    {
      line = $0
      while (match(line, /\/[^[:space:]<>"`]+/)) {
        print substr(line, RSTART, RLENGTH)
        line = substr(line, RSTART + RLENGTH)
      }
    }
  ' | sed -E 's/[][),.;:]+$//' | sort -u)"

  while IFS= read -r raw || [[ -n "$raw" ]]; do
    [[ -n "$raw" ]] || continue
    candidate="$raw"

    probe_record="$(prompt_resolve_probe_path "$candidate")"
    probe_state="${probe_record%%$'\t'*}"
    probe="${probe_record#*$'\t'}"
    if [[ "$probe_state" == "FAIL" ]]; then
      printf '%s' "$probe"
      return 0
    fi
    [[ "$probe_state" == "OK" || "$probe_state" == "OK_SYMLINK" ]] || continue
    [[ -n "$probe" ]] || continue
    if [[ -d "$probe" ]]; then
      dir="$probe"
    else
      dir="$(dirname "$probe")"
    fi
    dir_real="$(cd "$dir" 2>/dev/null && pwd -P || true)"
    [[ -n "$dir_real" ]] || continue

    root="$(git -C "$dir_real" rev-parse --show-toplevel 2>/dev/null || true)"
    if [[ -z "$root" ]]; then
      if [[ "$probe_state" == "OK_SYMLINK" && "$dir_real" != "$current_real" && "$dir_real" != "$current_real"/* ]]; then
        printf '%s' "$dir_real"
        return 0
      fi
      continue
    fi
    root_real="$(cd "$root" 2>/dev/null && pwd -P || true)"
    [[ -n "$root_real" ]] || root_real="$root"

    if [[ "$root_real" != "$current_real" ]]; then
      printf '%s' "$root"
      return 0
    fi
  done <<< "$candidates"

  return 1
}

# --- Decision engine invocation ---

prompt_route_command() {
  local source_cli source_hook_cli
  source_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/index.ts"
  source_hook_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/hook-entry.ts"
  if [[ -n "${REPO_HARNESS_HOOK_CLI:-}" && -f "${REPO_HARNESS_HOOK_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_HOOK_CLI" prompt-route; return $?
  fi
  if [[ -f "$source_hook_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_hook_cli" prompt-route; return $?
  fi
  if command -v repo-harness-hook >/dev/null 2>&1; then
    repo-harness-hook prompt-route; return $?
  fi
  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_CLI" prompt-route; return $?
  fi
  if command -v repo-harness >/dev/null 2>&1; then
    repo-harness prompt-route; return $?
  fi
  if [[ -f "$source_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_cli" prompt-route; return $?
  fi
  return 127
}

prompt_route_explicit_first() {
  local payload output
  if command -v jq >/dev/null 2>&1; then
    payload="$(jq -nc --arg prompt "$PROMPT_TEXT" '{prompt:$prompt}')"
  else
    payload="{\"prompt\":\"$(hook_json_escape "$PROMPT_TEXT")\"}"
  fi
  output="$(printf '%s' "$payload" | PROMPT_ROUTE_ACTIVE_TASK="$PROMPT_ROUTE_ACTIVE_TASK" prompt_route_command 2>/dev/null || true)"
  output="$(printf '%s\n' "$output" | head -n1)"
  if [[ "$output" != \{* ]]; then
    # Missing router fails advisory-open; deterministic PreToolUse guards keep
    # edit safety. Do not fall back to the retired all-prompt classifier.
    PROMPT_ROUTE_KIND="bypass"
    PROMPT_ROUTE_ACTION=""
    return 0
  fi
  if command -v jq >/dev/null 2>&1; then
    PROMPT_ROUTE_KIND="$(printf '%s' "$output" | jq -r '.kind // "bypass"')"
    PROMPT_ROUTE_ACTION="$(printf '%s' "$output" | jq -r '.action // ""')"
  else
    PROMPT_ROUTE_JSON="$output" read -r PROMPT_ROUTE_KIND PROMPT_ROUTE_ACTION < <(
      PROMPT_ROUTE_JSON="$output" bun -e 'const v=JSON.parse(process.env.PROMPT_ROUTE_JSON); console.log(`${v.kind ?? "bypass"} ${v.action ?? ""}`)'
    )
  fi
}

prompt_guard_decision_command() {
  local source_cli source_hook_cli
  source_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/index.ts"
  source_hook_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/hook-entry.ts"

  if [[ -n "${REPO_HARNESS_HOOK_CLI:-}" && -f "${REPO_HARNESS_HOOK_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_HOOK_CLI" prompt-guard-decide
    return $?
  fi

  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_CLI" prompt-guard-decide
    return $?
  fi

  if [[ -f "$source_hook_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_hook_cli" prompt-guard-decide
    return $?
  fi

  if [[ -n "${HOOK_REPO_ROOT:-}" && -f "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" ]] && command -v bun >/dev/null 2>&1; then
    bun "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" prompt-guard-decide
    return $?
  fi

  if command -v repo-harness-hook >/dev/null 2>&1; then
    repo-harness-hook prompt-guard-decide
    return $?
  fi

  if command -v repo-harness >/dev/null 2>&1; then
    repo-harness prompt-guard-decide
    return $?
  fi

  if [[ -f "$source_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_cli" prompt-guard-decide
    return $?
  fi

  return 127
}

prompt_guard_refresh_state() {
  prompt_guard_spec_state="missing"
  prompt_guard_plan_state="none"
  prompt_guard_pending_state="none"
  prompt_guard_worktree_state="current"
  prompt_guard_contract_state="missing"
  prompt_guard_contract_path_state="missing"
  prompt_guard_evidence_state="unchecked"

  active_plan=""
  plan_status=""
  marker_problem=""
  linked_worktree=""
  contract_file=""
  evidence_error=""

  if [ -f "docs/spec.md" ]; then
    prompt_guard_spec_state="present"
  fi

  active_plan="$(get_active_plan || true)"
  if [ -n "$active_plan" ] && [ -f "$active_plan" ]; then
    plan_status="$(get_plan_status "$active_plan")"
    case "$plan_status" in
      Draft) prompt_guard_plan_state="draft" ;;
      Annotating) prompt_guard_plan_state="annotating" ;;
      Approved) prompt_guard_plan_state="approved" ;;
      Executing) prompt_guard_plan_state="executing" ;;
      *) prompt_guard_plan_state="unknown" ;;
    esac

    if [ -n "$(derive_contract_path "$active_plan" || true)" ]; then
      prompt_guard_contract_path_state="present"
    fi

    if ! evidence_error="$(plan_evidence_contract_error "$active_plan")"; then
      prompt_guard_evidence_state="incomplete"
    else
      prompt_guard_evidence_state="complete"
    fi
  else
    marker_problem="$(active_plan_marker_problem || true)"
    if [[ "$marker_problem" == *"different worktree"* ]]; then
      prompt_guard_plan_state="foreign_worktree"
      prompt_guard_worktree_state="foreign_marker"
    elif [[ -n "$marker_problem" ]]; then
      prompt_guard_plan_state="stale_marker"
    fi
  fi

  if workflow_pending_orchestration_is_fresh; then
    prompt_guard_pending_state="fresh"
  elif [ -s "$(workflow_pending_orchestration_file)" ]; then
    prompt_guard_pending_state="stale"
  fi

  linked_worktree="$(prompt_linked_worktree_target || true)"
  if [[ -n "$linked_worktree" ]]; then
    prompt_guard_worktree_state="linked_target"
  fi

  contract_file="$(workflow_active_contract || true)"
  if [[ -n "$contract_file" && -f "$contract_file" ]]; then
    prompt_guard_contract_state="present"
  fi

  export PROMPT_GUARD_SPEC_STATE="$prompt_guard_spec_state"
  export PROMPT_GUARD_PLAN_STATE="$prompt_guard_plan_state"
  export PROMPT_GUARD_PENDING_STATE="$prompt_guard_pending_state"
  export PROMPT_GUARD_WORKTREE_STATE="$prompt_guard_worktree_state"
  export PROMPT_GUARD_CONTRACT_STATE="$prompt_guard_contract_state"
  export PROMPT_GUARD_CONTRACT_PATH_STATE="$prompt_guard_contract_path_state"
  export PROMPT_GUARD_EVIDENCE_STATE="$prompt_guard_evidence_state"
}

# PG_ENGINE_STATE: ok | unavailable (no runtime) | legacy (CLI predates the
# prompt protocol). Both degraded states fall back to advisory-only handling.
PG_ENGINE_STATE="ok"

prompt_guard_engine_parse() {
  local verdict="$1"
  local key value tsv

  # Values are tab-free by construction (the engine collapses title
  # whitespace), so KEY<TAB>VALUE lines assign safely without eval.
  if command -v jq >/dev/null 2>&1; then
    tsv="$(printf '%s' "$verdict" | jq -r '
      ["PG_ACTION", .action],
      ["PG_INTENT", .intent],
      ["PG_DONE_OUTCOME", .derived.done_outcome],
      ["PG_PLAN_START_TITLE", .derived.plan_start_title],
      ["PG_PLAN_START_SLUG", .derived.plan_start_slug],
      ["PG_PENDING_KIND", .derived.pending_kind],
      (.facts | to_entries[] | ["PG_FACT_" + (.key|ascii_upcase), (.value|tostring)])
      | @tsv
    ')"
  else
    # The verdict only exists when a bun-backed CLI ran, so bun is available.
    tsv="$(VERDICT_JSON="$verdict" bun -e '
      const v = JSON.parse(process.env.VERDICT_JSON ?? "{}");
      const rows = [
        ["PG_ACTION", v.action],
        ["PG_INTENT", v.intent],
        ["PG_DONE_OUTCOME", v.derived.done_outcome],
        ["PG_PLAN_START_TITLE", v.derived.plan_start_title],
        ["PG_PLAN_START_SLUG", v.derived.plan_start_slug],
        ["PG_PENDING_KIND", v.derived.pending_kind],
      ];
      for (const [k, val] of Object.entries(v.facts)) {
        rows.push(["PG_FACT_" + k.toUpperCase(), String(val)]);
      }
      console.log(rows.map((r) => r.join("\t")).join("\n"));
    ')"
  fi

  while IFS=$'\t' read -r key value; do
    [[ "$key" =~ ^PG_[A-Z_]+$ ]] || continue
    printf -v "$key" '%s' "$value"
  done <<< "$tsv"
}

prompt_guard_engine_call() {
  local payload output status

  if command -v jq >/dev/null 2>&1; then
    payload="$(jq -nc --arg prompt "$PROMPT_TEXT" '{prompt:$prompt}')"
  else
    payload="{\"prompt\":\"$(hook_json_escape "$PROMPT_TEXT")\"}"
  fi

  if output="$(printf '%s' "$payload" | prompt_guard_decision_command)"; then
    :
  else
    status=$?
    if [[ "$status" -eq 127 ]]; then
      PG_ENGINE_STATE="unavailable"
      return 0
    fi
    echo "[PromptGuard] Decision engine unavailable or failed."
    hook_structured_error \
      "PromptGuard" \
      "Prompt guard decision engine failed." \
      "Install repo-harness or run from the source checkout so the TypeScript decision engine is available." \
      "missing_artifact"
    exit 2
  fi

  output="$(printf '%s\n' "$output" | head -n1)"
  if [[ "$output" != \{* ]] || ! printf '%s' "$output" | grep -q '"protocol"'; then
    PG_ENGINE_STATE="legacy"
    return 0
  fi

  prompt_guard_engine_parse "$output"
}

pg_fact() {
  local name="$1"
  local var="PG_FACT_${name}"
  [[ "${!var:-0}" == "1" ]]
}

# --- Side effects and hints (driven by engine facts) ---

emit_pending_orchestration_discussion() {
  local active_plan_local kind source_ref source_arg
  workflow_pending_orchestration_is_fresh || return 0
  active_plan_local="$(get_active_plan || true)"
  [[ -z "$active_plan_local" || ! -f "$active_plan_local" ]] || return 0
  pg_fact PLAN_DISCUSSION_CONTINUATION || return 0
  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  source_arg=""
  [[ -n "$source_ref" ]] && source_arg=" --source-ref <source-ref>"

  echo "[PlanDiscussionGate] Pending plan/orchestration discussion is still open; continuing discussion, not implementation."
  echo "[PlanDiscussionGate] $(workflow_pending_orchestration_summary)"
  echo "[PlanDiscussionGate] When the decision is complete, capture the final plan body before editing implementation files:"
  echo "  printf '%s\n' '<decision-complete plan body>' | repo-harness run capture-plan --slug <slug> --title <title> --status Draft --source ${kind:-host-plan} --orchestration-kind ${kind:-host-plan} --route planning${source_arg}"
}

emit_pending_orchestration_capture_gate() {
  local kind source_ref source_arg
  workflow_pending_orchestration_is_fresh || return 1
  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  source_arg=""
  [[ -n "$source_ref" ]] && source_arg=" --source-ref <source-ref>"
  echo "[PlanCaptureGate] Implementation requested while a pending plan/orchestration discussion has not been captured."
  echo "[PlanCaptureGate] $(workflow_pending_orchestration_summary)"
  echo "[PlanCaptureGate] Capture the final plan body first; if implementation is already approved, use --status Approved --execute with a work-package promotion reason:"
  echo "  printf '%s\n' '<approved plan body>' | repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --source ${kind:-host-plan} --orchestration-kind ${kind:-host-plan} --route planning --execute${source_arg}"
  return 0
}

maybe_start_plan_workflow() {
  pg_fact THINK_PLAN_START || return 0

  local foreign_repo
  foreign_repo="$(prompt_foreign_repo_root || true)"
  if [[ -n "$foreign_repo" ]]; then
    echo "[RepoIsolationGate] Think/plan intent references a different git repo: $foreign_repo"
    echo "[RepoIsolationGate] Skipping automatic Draft plan workflow in ${HOOK_REPO_ROOT:-$(pwd)}. Continue from the referenced repo before creating repo-local workflow files."
    return 0
  fi

  if ! repo_harness_runner_available; then
    echo "[PlanStartGate] Think/plan intent detected, but repo-harness run is unavailable. Continue with planning and capture manually."
    return 0
  fi

  local slug title before_latest after_latest draft_plan kind source_ref start_output
  slug="${PG_PLAN_START_SLUG:-think-plan-$(date +%H%M%S)}"
  title="${PG_PLAN_START_TITLE:-Planning Session}"
  before_latest="$(get_latest_plan || true)"
  kind="${PG_PENDING_KIND:-repo-harness-plan}"
  source_ref="$title"
  echo "[PlanStartGate] Think/plan intent detected. Starting independent file-backed Draft plan workflow."
  if ! start_output="$(run_repo_harness_helper ensure-task-workflow --new-plan --slug "$slug" --title "$title" 2>&1)"; then
    printf '%s\n' "$start_output"
    return 0
  fi
  printf '%s\n' "$start_output"
  after_latest="$(get_latest_plan || true)"
  draft_plan=""
  if [[ -n "$after_latest" && "$after_latest" != "$before_latest" ]]; then
    draft_plan="$after_latest"
  fi
  workflow_write_pending_orchestration "$kind" "${HOOK_HOST:-unknown}" "$slug" "$draft_plan" "$source_ref" "plans/plan-*.md"
}

extract_embedded_approved_plan_body() {
  if ! pg_fact EMBEDDED_APPROVED_PLAN && pg_fact PLAN_SHAPED_MARKDOWN; then
    printf '%s\n' "$PROMPT_INTENT_TEXT"
    return 0
  fi

  printf '%s\n' "$PROMPT_INTENT_TEXT" | awk '
    BEGIN { found = 0 }
    !found {
      line = $0
      lower = tolower(line)
      if (lower ~ /^[[:space:]]*(please[[:space:]]+)?implement[[:space:]]+this[[:space:]]+plan[[:space:]]*:/) {
        found = 1
        colon = index(line, ":")
        rest = substr(line, colon + 1)
        sub(/^[[:space:]]+/, "", rest)
        if (length(rest) > 0) {
          print rest
        }
        next
      }
    }
    found { print }
  '
}

derive_embedded_approved_plan_title() {
  local body="$1"
  local title
  title="$(printf '%s\n' "$body" | awk '
    /^#[[:space:]]*Plan:[[:space:]]*/ {
      sub(/^#[[:space:]]*Plan:[[:space:]]*/, "")
      print
      exit
    }
    /^#[[:space:]]+/ {
      sub(/^#[[:space:]]+/, "")
      print
      exit
    }
  ' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | head -1)"
  if [[ -z "$title" ]]; then
    title="Approved Plan"
  fi
  printf '%s' "$title" | cut -c 1-96
}

normalize_plan_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

maybe_capture_embedded_approved_plan() {
  pg_fact EMBEDDED_APPROVED_PLAN || pg_fact PLAN_SHAPED_MARKDOWN || return 0

  local foreign_repo
  foreign_repo="$(prompt_foreign_repo_root || true)"
  if [[ -n "$foreign_repo" ]]; then
    echo "[RepoIsolationGate] Embedded plan references a different git repo: $foreign_repo"
    echo "[RepoIsolationGate] Skipping capture-plan in ${HOOK_REPO_ROOT:-$(pwd)}. Re-run the prompt from the referenced repo before projecting workflow files."
    return 0
  fi

  if ! repo_harness_runner_available; then
    echo "[PlanCaptureGate] Embedded approved plan detected, but repo-harness run is unavailable."
    hook_structured_error \
      "PlanCaptureGate" \
      "Embedded approved plan detected but repo-harness run is unavailable." \
      "Install the repo-harness global runtime before executing an embedded approved plan." \
      "missing_artifact"
    exit 2
  fi

  local body title slug capture_output
  body="$(extract_embedded_approved_plan_body)"
  if [[ -z "$(printf '%s' "$body" | tr -d '[:space:]')" ]]; then
    echo "[PlanCaptureGate] Embedded approved plan marker has no plan body."
    hook_structured_error \
      "PlanCaptureGate" \
      "PLEASE IMPLEMENT THIS PLAN was provided without a plan body." \
      "Paste the approved plan body after the marker so repo-harness run capture-plan can store and project it." \
      "missing_artifact"
    exit 2
  fi

  title="$(derive_embedded_approved_plan_title "$body")"
  slug="$(normalize_plan_slug "$title")"
  if [[ -z "$slug" ]]; then
    slug="approved-plan-$(date +%H%M%S)"
  fi

  echo "[PlanCaptureGate] Embedded approved plan detected. Capturing and projecting before implementation."
  if ! capture_output="$(printf '%s\n' "$body" | run_repo_harness_helper capture-plan --slug "$slug" --title "$title" --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --source user-approved-plan --route planning --execute 2>&1)"; then
    printf '%s\n' "$capture_output"
    hook_structured_error \
      "PlanCaptureGate" \
      "Embedded approved plan capture failed." \
      "Fix the repo-harness run capture-plan or plan-to-todo error before editing implementation files." \
      "state_violation"
    exit 2
  fi
  printf '%s\n' "$capture_output"
  exit 0
}

emit_agentic_packaging_hint() {
  if pg_fact AGENTIC_PACKAGING; then
    echo "[AgenticDevRoute] Reusable workflow packaging intent detected."
    echo "[AgenticDevRoute] Suggested route: repo-harness-autoplan after user authorization; hook will not plan or create assets."
  fi
}

resolve_codegraph_bin() {
  if [[ -x "node_modules/.bin/codegraph" ]]; then
    printf '%s\n' "node_modules/.bin/codegraph"
    return 0
  fi

  command -v codegraph 2>/dev/null || return 1
}

run_codegraph_init_command() {
  local codegraph_bin status cursor_dir_existed cursor_rules_dir_existed cursor_rule_existed
  codegraph_bin="$(resolve_codegraph_bin)" || return 127

  cursor_dir_existed=false
  cursor_rules_dir_existed=false
  cursor_rule_existed=false
  [[ -d ".cursor" ]] && cursor_dir_existed=true
  [[ -d ".cursor/rules" ]] && cursor_rules_dir_existed=true
  [[ -e ".cursor/rules/codegraph.mdc" ]] && cursor_rule_existed=true

  set +e
  CODEGRAPH_NO_DAEMON=1 "$codegraph_bin" init -i .
  status=$?
  set -e

  if [[ "$cursor_rule_existed" == "false" && -f ".cursor/rules/codegraph.mdc" ]]; then
    rm -f ".cursor/rules/codegraph.mdc"
    [[ "$cursor_rules_dir_existed" == "false" ]] && rmdir ".cursor/rules" 2>/dev/null || true
    [[ "$cursor_dir_existed" == "false" ]] && rmdir ".cursor" 2>/dev/null || true
  fi

  return "$status"
}

ensure_codegraph_index_for_route() {
  local output status

  [[ -f ".codegraph/codegraph.db" ]] && return 0

  output="$(run_codegraph_init_command 2>&1)"
  status=$?

  if [[ "$status" -eq 0 && -f ".codegraph/codegraph.db" ]]; then
    echo "[CodegraphRoute] Initialized missing CodeGraph index before routing hint."
  elif [[ "$status" -ne 127 ]]; then
    echo "[CodegraphRoute] CodeGraph index init skipped or failed; run codegraph init -i . if structural tools are unavailable."
  fi
}

emit_codegraph_route_hint() {
  local session_key session_file=".claude/.session-id"

  mkdir -p .claude
  session_key="$(session_state_resolve_key "$session_file" "${1:-}")"

  if session_state_codegraph_used "$session_key" || session_state_codegraph_nudged "$session_key"; then
    return 0
  fi

  if pg_fact CODEGRAPH_ROUTE; then
    ensure_codegraph_index_for_route || true
    echo "[CodegraphRoute] Structural code-navigation intent detected. Prefer CodeGraph context/search/callers/impact before grep/read when available."
    session_state_mark_codegraph_nudged "$session_key" || true
  elif pg_fact NONTRIVIAL_CODE_TASK; then
    echo "[CodegraphRoute] Structural code-navigation intent detected. Prefer CodeGraph context/search/callers/impact before grep/read when available."
    session_state_mark_codegraph_nudged "$session_key" || true
  fi
}

emit_waza_route_hint() {
  if pg_fact AGENTIC_PACKAGING; then
    return
  fi

  if pg_fact THINK_PLAN_START; then
    echo "[WazaRoute] Planning intent detected. Default route: Waza /think."
    return
  fi

  # /health needs a health/audit/diagnostic verb plus a tooling noun (joint
  # condition lives in the TypeScript classifier); reviews fall to /check.
  if pg_fact HEALTH_ROUTE; then
    echo "[WazaRoute] Agent workflow/tooling intent detected. Default route: Waza /health."
    return
  fi

  if pg_fact REVIEW_RELEASE; then
    local review_circuit review_profile="standard"
    prompt_strict_workflow && review_profile="strict"
    if ! review_circuit="$(hook_circuit_record review ReviewLimit 'automatic review routing cap' /check review-route "$review_profile")"; then
      [[ -n "$review_circuit" ]] && printf '%s\n' "$review_circuit" >&2
      return 0
    fi
    echo "[WazaRoute] Review/release intent detected. Default route: Waza /check."
    emit_review_rubric_prompt
    emit_review_subject_prompt
    if prompt_strict_workflow; then
      emit_external_acceptance_prompt review
    fi
    emit_cross_review_hint merge
  fi
}

prompt_strict_workflow() {
  local file
  file="$(workflow_active_contract || true)"
  [[ -n "$file" && -f "$file" ]] || return 1
  grep -Eiq '^> \*\*Workflow Profile\*\*:[[:space:]]*strict[[:space:]]*$' "$file"
}

emit_review_rubric_prompt() {
  local rubric
  rubric="$(review_rubric_prompt || true)"
  [[ -n "$rubric" ]] || return 0
  printf '%s\n' "$rubric"
}

emit_review_subject_prompt() {
  local subject target_rev
  subject="$(workflow_current_review_subject_value || true)"
  target_rev="$(workflow_current_review_target_revision || true)"
  echo "[AcceptanceSubject] The typed AcceptanceReceipt will bind normalized subject ${subject:-unknown} at target ${target_rev:-unknown}."
}

# Cross-review advisory: nudge the agent to consider an independent second
# opinion from a different-vendor model. Advisory only (echo, exit 0); the agent
# decides whether to act. Host-aware: in Codex suggest claude-review, otherwise
# (Claude) suggest codex-review. On Codex the dispatcher swallows success stdout,
# so this primarily surfaces on the Claude host; the Codex-side availability note
# is delivered once by session-start-context.sh.
emit_cross_review_hint() {
  local skill peer consult_circuit risk="false" user="${REPO_HARNESS_USER_REQUESTED_CROSS_MODEL:-false}" consult_profile="standard"
  if prompt_strict_workflow; then risk="true"; consult_profile="strict"; fi
  if ! consult_circuit="$(hook_circuit_record cross-model-consult CrossModelLimit 'cross-model consultation cap' "${1:-review}" cross-model-consult "$consult_profile" false "$risk" "$user" false)"; then
    [[ -n "$consult_circuit" ]] && printf '%s\n' "$consult_circuit" >&2
    return 0
  fi
  if [ "${HOOK_HOST:-claude}" = "codex" ]; then
    skill="claude-review"; peer="Claude"
  else
    skill="codex-review"; peer="Codex"
  fi
  case "${1:-}" in
    merge)
      echo "[CrossReview] Pre-merge moment — consider an independent ${peer} review of the diff via ${skill}: a different training distribution has non-overlapping blind spots. Skip if the change is trivial."
      ;;
    debug)
      echo "[CrossReview] Hard bug — ${skill} can give an independent ${peer} root-cause diagnosis. Agreeing diagnoses raise confidence; divergence shows where to dig."
      ;;
  esac
}

emit_external_acceptance_prompt() {
  local mode="${1:-review}"
  local expected_reviewer expected_source command active_plan_local contract_file_local review_file checks_file rubric subject target_rev benchmark_evidence

  expected_reviewer="$(workflow_acceptance_expected_reviewer 2>/dev/null || true)"
  if [ -z "$expected_reviewer" ]; then
    echo "[ExternalAcceptance] Active contract has no valid Acceptance Policy; fix the contract before acceptance."
    return 0
  fi
  expected_source="$(workflow_acceptance_expected_source "$expected_reviewer")"
  if [ "$expected_source" = "claude-review" ]; then
    command="/claude-review"
  else
    command="codex-review"
  fi

  active_plan_local="$(get_active_plan || true)"
  contract_file_local="$(workflow_active_contract || true)"
  review_file="$(workflow_active_review || true)"
  checks_file="$(workflow_checks_file)"
  rubric="$(review_rubric_prompt || true)"
  subject="$(workflow_current_review_subject_value || true)"
  target_rev="$(workflow_current_review_target_revision || true)"
  benchmark_evidence="$(workflow_benchmark_evidence_fingerprint 2>/dev/null || true)"
  benchmark_evidence="${benchmark_evidence:-not-applicable}"

  echo "[ExternalAcceptance] Review/release intent detected. Start peer acceptance in parallel with local /check."
  echo "[ExternalAcceptance] Mode: $mode"
  echo "[ExternalAcceptance] Current active plan: ${active_plan_local:-"(none)"}"
  echo "[ExternalAcceptance] Current contract: ${contract_file_local:-"(none)"}"
  echo "[ExternalAcceptance] Current review: ${review_file:-tasks/reviews/<slug>.review.md}"
  echo "[ExternalAcceptance] Current checks: $checks_file"
  echo "[ExternalAcceptance] Current review subject: ${subject:-unknown}"
  echo "[ExternalAcceptance] Peer reviewer: $expected_reviewer via $command"
  echo "[ExternalAcceptance] Subject scope for peer: normalized final content for implementation paths; target revision is overlap metadata."
  cat <<EOF_EXTERNAL_ACCEPTANCE
[ExternalAcceptance] Prompt to send with $command:
Review the current sprint for acceptance only. Do not run /check. Do not edit files. Do not write files. Inspect the diff scope, contract, review evidence, checks evidence, and Review Rubric v2, then return only one JSON object for the orchestrator to record as the typed AcceptanceReceipt.

${rubric:-[ReviewRubric] Deep Diff Review Rubric v2 unavailable; use severity order P0/P1/P2/P3 and report no style-only nits.}

{"disposition":"external_pass","reviewer":"$expected_reviewer","source":"$expected_source","actor":null,"summary":"<concise acceptance conclusion>","findings":[]}

Use disposition "reject" with at least one P0/P1/P2/P3 finding when acceptance fails. Provider unavailability produces no receipt and fails closed. After receiving the JSON, record it with acceptance-receipt.ts; the Markdown review section is generated projection only.
EOF_EXTERNAL_ACCEPTANCE

  cat <<EOF_USER_WAIVER
[ExternalAcceptance] If the contract owner chooses the allowed user-waiver path:
1. Obtain one explicit owner decision for this contract/goal authority. Do not ask the owner to quote or track a subject hash; the helper binds the verified subject.
2. Record that decision once:
   repo-harness run acceptance-receipt grant-waiver --contract "$contract_file_local" --actor "<contract owner>" --summary "<accepted bounded risk>"
3. After each fresh passing verify-sprint evidence bundle, materialize the exact receipt:
   repo-harness run acceptance-receipt record --contract "$contract_file_local" --verification "$checks_file" --review "$review_file" --disposition user_waiver

A semantic correction still invalidates the old receipt and requires fresh verification. The same grant may rematerialize the new exact receipt while contract/goal authority is unchanged, without asking the owner again. This grant never authorizes provider disclosure or merge.
EOF_USER_WAIVER
}

# --- Action rendering ---
# Plan/spec/contract prompt gates are advisory (exit 0): pre-edit-guard.sh
# enforces the same state deterministically at the edit boundary. Done-claim
# gates keep blocking because they verify file-backed completion evidence.

render_prompt_guard_action() {
  local action="$1"

  case "$action" in
    allow|done_gate)
      return 0
      ;;
    spec_block)
      echo "[SpecGuard] Advisory: docs/spec.md is missing. Create stable product truth before implementation."
      echo "[SpecGuard] Run repo-harness run new-spec and capture stable product intent; implementation edits without a spec are blocked at the edit layer."
      exit 0
      ;;
    stale_active_plan_advice)
      clear_active_plan
      echo "[PlanStatusGuard] Advisory: ${marker_problem}; cleared stale active markers. Capture or switch to an approved plan before editing implementation files."
      exit 0
      ;;
    plan_capture_pending_advice)
      emit_pending_orchestration_capture_gate || true
      exit 0
      ;;
    worktree_execution_advice)
      echo "[WorktreeExecutionGate] Active plan is in linked worktree: $linked_worktree"
      echo "[WorktreeExecutionGate] Continue from that worktree instead of recapturing a plan:"
      echo "  cd \"$linked_worktree\""
      exit 0
      ;;
    plan_capture_missing_active_advice)
      echo "[PlanCaptureGate] Approval detected before an active plan artifact exists."
      echo "[PlanCaptureGate] Let the agent run the approved-plan capture path now:"
      echo "  git status --short --branch -uall"
      echo "  printf '%s\n' '<approved plan body>' | repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --source waza-think --route planning --execute"
      exit 0
      ;;
    plan_status_no_active_block)
      echo "[PlanStatusGuard] Advisory: No active plan found in plans/. Implementation edits will be blocked at the edit layer until a plan is captured."
      echo "[PlanStatusGuard] Capture the approved planning output with: repo-harness run capture-plan --slug <slug> --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --execute"
      echo "[PlanStatusGuard] If there is no captured planning output yet, run: repo-harness run ensure-task-workflow --slug <slug> --title <title>"
      exit 0
      ;;
    plan_capture_draft_advice)
      echo "[PlanCaptureGate] Approval detected for $plan_status plan: $active_plan"
      echo "[PlanCaptureGate] Recapture the exact approved plan body with --artifact-level work-package --promotion-reason <reason> --status Approved --execute, or mark this plan Approved and run:"
      echo "  repo-harness run plan-to-todo --plan $active_plan"
      exit 0
      ;;
    plan_status_not_approved_block)
      echo "[PlanStatusGuard] Advisory: plan status is '$plan_status' in $active_plan. Complete the annotation cycle and move the plan to Approved; implementation edits are blocked at the edit layer until then."
      exit 0
      ;;
    evidence_contract_block)
      echo "[EvidenceContractGuard] Advisory: plan Evidence Contract is incomplete in $active_plan:"
      printf '%s\n' "$evidence_error"
      echo "[EvidenceContractGuard] Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before implementation."
      exit 0
      ;;
    plan_execution_scaffold_advice)
      echo "[PlanExecutionGate] Approval detected for approved plan: $active_plan"
      echo "[PlanExecutionGate] Create the sprint contract/review/notes before implementation:"
      echo "  repo-harness run plan-to-todo --plan $active_plan"
      exit 0
      ;;
    contract_missing_block)
      echo "[ContractGuard] Advisory: missing active sprint contract for $active_plan."
      echo "[ContractGuard] Run repo-harness run plan-to-todo --plan $active_plan to create the contract/review/notes scaffold before implementation."
      exit 0
      ;;
    done_missing_active_plan)
      echo "[ContractGuard] Done intent detected, but no active plan found. Complete plan workflow first."
      hook_structured_error \
        "ContractGuard" \
        "Done intent detected without an active plan." \
        "Finish the plan workflow and ensure plans/ contains the active plan before marking work done." \
        "state_violation"
      exit 2
      ;;
    done_contract_path_missing)
      echo "[ContractGuard] Could not derive contract path from plan: $active_plan"
      hook_structured_error \
        "ContractGuard" \
        "Could not derive a contract path from $active_plan." \
        "Rename the plan to plan-<timestamp>-<slug>.md so the matching contract can be resolved." \
        "missing_artifact"
      exit 2
      ;;
    done_missing_contract)
      echo "[ContractGuard] Missing task contract: $contract_file"
      hook_structured_error \
        "ContractGuard" \
        "Missing task contract $contract_file." \
        "Create the contract or regenerate tasks from the active plan before marking work done." \
        "missing_artifact"
      exit 2
      ;;
    done_evidence_contract_block)
      echo "[EvidenceContractGuard] Plan Evidence Contract is incomplete in $active_plan:"
      printf '%s\n' "$evidence_error"
      hook_structured_error \
        "EvidenceContractGuard" \
        "Done intent detected without a complete plan Evidence Contract." \
        "Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before marking work done." \
        "quality_gate"
      exit 2
      ;;
    *)
      echo "[PromptGuard] Unknown decision action: $action"
      hook_structured_error \
        "PromptGuard" \
        "Unknown prompt guard decision action: $action." \
        "Fix the TypeScript prompt guard decision table before continuing." \
        "state_violation"
      exit 2
      ;;
  esac
}

emit_workflow_file_guards() {
  if [ -f "tasks/todos.md" ] && has_changes "tasks/todos.md"; then
    echo "[PlanGuard] tasks/todos.md has been modified. Read annotations and update the plan. Do not implement yet."
  fi

  if [ -f "tasks/lessons.md" ] && has_changes "tasks/lessons.md"; then
    echo "[LessonGuard] tasks/lessons.md has updates. Review prevention rules before coding."
  fi

  local changed_research
  changed_research="$(has_changes_glob '^docs/researches/.*\.md$' || true)"
  if [ -n "$changed_research" ]; then
    echo "[ResearchGuard] ${changed_research} updated. Review research deeply before planning or implementation."
  fi

  local changed_plan
  changed_plan="$(has_changes_glob '^plans/plan-.*\.md$' || true)"
  if [ -n "$changed_plan" ]; then
    echo "[AnnotationGuard] ${changed_plan} has annotations. Process all notes and revise. Do not implement yet."
  fi
}

emit_minimal_change_prompt_advice() {
  local output

  [[ "${PG_ACTION:-}" == "allow" ]] || return 0
  [[ -n "${PG_INTENT:-}" ]] || return 0
  declare -F minimal_change_hook_entry >/dev/null 2>&1 || return 0

  if output="$(minimal_change_hook_entry context --phase prompt --intent "$PG_INTENT" 2>/dev/null)"; then
    [[ -n "$output" ]] && printf '%s\n' "$output"
  fi
  return 0
}

# --- Main flow ---

PROMPT_TEXT="$(hook_get_prompt "${1:-}")"
PROMPT_INTENT_TEXT="$(prompt_intent_text)"

prompt_guard_refresh_state
PROMPT_ROUTE_ACTIVE_TASK=0
case "$prompt_guard_plan_state" in
  approved|executing) PROMPT_ROUTE_ACTIVE_TASK=1 ;;
esac
export PROMPT_ROUTE_ACTIVE_TASK
PROMPT_ROUTE_KIND="bypass"
PROMPT_ROUTE_ACTION=""
prompt_route_explicit_first
if [[ "$PROMPT_ROUTE_KIND" == "bypass" ]]; then
  exit 0
fi
# setup/handoff are explicit host/CLI actions with no prompt-text policy
# decision. Their command handlers own behavior; deterministic edit guards
# remain active if tools run afterward.
if [[ "$PROMPT_ROUTE_KIND" == "explicit" && ( "$PROMPT_ROUTE_ACTION" == "setup" || "$PROMPT_ROUTE_ACTION" == "handoff" ) ]]; then
  exit 0
fi
prompt_guard_engine_call

if [[ "$PG_ENGINE_STATE" != "ok" ]]; then
  if [[ "$PG_ENGINE_STATE" == "legacy" ]]; then
    echo "[PromptGuard] Advisory: the installed repo-harness CLI predates the prompt-verdict protocol; prompt intent gates are degraded to advisory for this prompt."
    echo "[PromptGuard] Refresh the CLI with: bun add -g repo-harness@latest && repo-harness install. Fallback: npx -y repo-harness@latest install."
  else
    echo "[PromptGuard] Advisory: prompt-guard decision engine is unavailable (repo-harness CLI or bun not found); prompt intent gates are degraded to advisory for this prompt."
    echo "[PromptGuard] Edit-layer guards still enforce plan and contract scope. Install the repo-harness CLI to restore prompt decisions."
  fi
  emit_workflow_file_guards
  exit 0
fi

emit_agentic_packaging_hint
emit_waza_route_hint
emit_codegraph_route_hint
emit_pending_orchestration_discussion

implement_intent=0
pg_fact IMPLEMENT && implement_intent=1
done_intent=0
pg_fact DONE && done_intent=1
plan_start_intent=0
pg_fact PLAN_START && plan_start_intent=1

plan_research_ready=1
plan_repo_isolation_skip=0
if [ "$plan_start_intent" -eq 1 ]; then
  foreign_repo="$(prompt_foreign_repo_root || true)"
  if [[ -n "$foreign_repo" ]]; then
    plan_repo_isolation_skip=1
    echo "[RepoIsolationGate] Think/plan intent references a different git repo: $foreign_repo"
    echo "[RepoIsolationGate] Skipping automatic Draft plan workflow in ${HOOK_REPO_ROOT:-$(pwd)}. Continue from the referenced repo before creating repo-local workflow files."
  elif ! has_research_for_new_plan; then
    latest_plan="$(get_latest_plan || true)"
    if [[ -n "$latest_plan" ]]; then
      plan_research_ready=0
      echo "[ResearchGate] Advisory: docs/researches/*.md is missing or older than $latest_plan; skipping automatic Draft plan creation."
      echo "[ResearchGate] Add or update a docs/researches/ report with fresh findings before creating the next plan."
    else
      echo "[ResearchGate] WARNING: no docs/researches/*.md report exists yet. Consider creating one with current findings before drafting the plan."
      echo "  首次创建计划：建议先写 docs/researches/<date-topic>.md，但不阻塞。"
    fi
  fi
fi

if [ "$implement_intent" -eq 0 ] && [ "$done_intent" -eq 0 ]; then
  if [ "$plan_start_intent" -eq 1 ] && [ "$plan_repo_isolation_skip" -eq 1 ]; then
    :
  elif [ "$plan_start_intent" -eq 1 ] && [ "$plan_research_ready" -eq 0 ]; then
    echo "[PlanStartGate] Skipping automatic Draft plan workflow until research is refreshed."
  else
    maybe_start_plan_workflow
  fi
fi

if [ "$implement_intent" -eq 0 ]; then
  emit_workflow_file_guards
fi

if [ "$implement_intent" -eq 1 ]; then
  if [ "$PG_ACTION" = "spec_block" ]; then
    render_prompt_guard_action "$PG_ACTION"
  fi

  maybe_capture_embedded_approved_plan

  prompt_guard_refresh_state
  prompt_guard_engine_call
  render_prompt_guard_action "$PG_ACTION"
  emit_minimal_change_prompt_advice
fi

if [ "$done_intent" -eq 1 ]; then
  render_prompt_guard_action "$PG_ACTION"

  if repo_harness_runner_available; then
    # --read-only: hook-driven verification must not rewrite the contract Status
    # header, otherwise a transient failure (e.g. flaky `bun test`) dirties the
    # worktree and chains into worktree-guard on the next prompt.
    if ! run_repo_harness_helper verify-contract --contract "$contract_file" --strict --read-only; then
      echo "[ContractGuard] Contract verification failed: $contract_file"
      hook_structured_error \
        "ContractGuard" \
        "Contract verification failed for $contract_file." \
        "Resolve the failing exit criteria in the contract before marking work done." \
        "contract_failure"
      exit 2
    fi
  else
    echo "[ContractGuard] repo-harness run verify-contract is unavailable (degraded mode: skipping strict verification)."
  fi

  review_file="$(workflow_active_review || true)"
  checks_file="$(workflow_checks_file)"
  if [ ! -f "$checks_file" ]; then
    echo "[EvidenceGuard] Missing structured checks file: $checks_file"
    hook_structured_error \
      "EvidenceGuard" \
      "Done intent detected without structured verification evidence." \
      "Run the relevant checks so .ai/harness/checks/latest.json exists before marking work done." \
      "quality_gate"
    exit 2
  fi

  if ! checks_error="$(workflow_checks_pass "$checks_file" "$contract_file" "$review_file")"; then
    echo "[EvidenceGuard] $checks_error"
    hook_structured_error \
      "EvidenceGuard" \
      "$checks_error" \
      "Run repo-harness run verify-sprint so .ai/harness/checks/latest.json records a passing current sprint verification." \
      "quality_gate"
    exit 2
  fi

  set +e
  external_status="$(run_repo_harness_helper acceptance-receipt verify --contract "$contract_file" --verification "$checks_file" --format row 2>&1)"
  external_exit=$?
  set -e
  IFS=$'\t' read -r external_state external_reviewer external_source external_disposition external_message <<< "$external_status"
  if [ "$external_exit" -ne 0 ] || [ "$external_state" != "pass" ]; then
    echo "[AcceptanceReceiptGuard] ${external_message:-AcceptanceReceipt is missing.}"
    hook_structured_error \
      "AcceptanceReceiptGuard" \
      "${external_message:-A valid AcceptanceReceipt is missing.}" \
      "Run verify-sprint --prepare-acceptance, then record external acceptance or materialize user_waiver from one valid contract-bound UserWaiverGrant; do not ask the owner to repeat a subject hash." \
      "quality_gate"
    exit 2
  fi

  task_state="$(workflow_plan_task_state "$active_plan")"
  IFS=$'\t' read -r total_tasks done_tasks next_task <<< "$task_state"
  remaining_tasks=$(( ${total_tasks:-0} - ${done_tasks:-0} ))
  if [ "${remaining_tasks:-0}" -gt 0 ]; then
    echo "[ArchiveGuard] Done intent detected but active plan still has $remaining_tasks unchecked item(s). Refusing to auto-archive."
    hook_structured_error \
      "ArchiveGuard" \
      "Done intent with $remaining_tasks unchecked active-plan task(s)." \
      "Finish the remaining Task Breakdown item: ${next_task:-see $active_plan}." \
      "state_violation"
    exit 2
  fi

  if workflow_is_linked_worktree; then
    next_action="$(workflow_next_action)"
    next_stage="$(printf '%s\n' "$next_action" | cut -f1)"
    next_command="$(printf '%s\n' "$next_action" | cut -f2)"
    next_message="$(printf '%s\n' "$next_action" | cut -f3-)"
    [[ "${next_command:-}" == "-" ]] && next_command=""
    echo "[WorkflowNextAction] Done quality gates passed for $active_plan."
    echo "[WorkflowNextAction] ${next_message:-Finish this contract worktree.}"
    if [ -n "${next_command:-}" ]; then
      echo "[WorkflowNextAction] ${next_command}"
    fi
    exit 0
  fi

  if ! repo_harness_runner_available; then
    echo "[AutoArchive] repo-harness run archive-workflow is unavailable. Skipping auto-archive."
    hook_structured_error \
      "AutoArchive" \
      "repo-harness run archive-workflow is unavailable." \
      "Install the repo-harness global runtime before relying on auto-archive." \
      "missing_artifact"
    exit 1
  fi

  outcome="${PG_DONE_OUTCOME:-Completed}"
  echo "[AutoArchive] All quality gates passed. Archiving $active_plan as outcome=$outcome"
  if ! archive_output="$(run_repo_harness_helper archive-workflow --plan "$active_plan" --outcome "$outcome" 2>&1)"; then
    printf '%s\n' "$archive_output"
    hook_structured_error \
      "AutoArchive" \
      "Automatic archive failed for $active_plan." \
      "Run repo-harness run archive-workflow --plan $active_plan --outcome $outcome and resolve the error." \
      "contract_failure"
    exit 1
  fi
  printf '%s\n' "$archive_output"
fi

if pg_fact SPA_DAY; then
  if [ -f "docs/reference-configs/handoff-protocol.md" ]; then
    echo "[HarnessMaintenance] Follow docs/reference-configs/handoff-protocol.md and sprint-contracts.md when consolidating workflow rules."
  else
    echo "[HarnessMaintenance] harness protocol docs missing. Add docs/reference-configs/handoff-protocol.md."
  fi
fi

# --- TDD/BDD Context Injection ---
# Exclusion logic (diagnostic/review/consultation prompts that merely mention
# bugs must not trigger fix advice) lives in the TypeScript classifier.
if pg_fact TDD_BUG_FIX_ADVICE; then
  echo "[TDD] Bug-fix intent detected. Reproduce with a failing test first."
  echo "  检测到修复请求：先写失败测试复现问题，再重写实现。"
  emit_cross_review_hint debug
fi
if pg_fact BDD_FEATURE_ADVICE; then
  echo "[BDD] Feature intent detected. Define Given-When-Then acceptance scenarios first."
  echo "  检测到新功能请求：先定义 Given-When-Then 验收场景。"
  echo "[UXFeatureGuard] For user-visible behavior, first freeze rules/non-goals, separate instruction from payload, and inventory existing UI/domain reuse targets."
  echo "  Read: repo-harness docs show ux-feature-guard (fail loudly; no parallel authority or compatibility fallback)."
fi
