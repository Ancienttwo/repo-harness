#!/bin/bash
# Shared workflow state helpers for plan/todo/contract-aware hooks.

workflow_strip_quotes() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

workflow_json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

workflow_policy_file() {
  printf '.ai/harness/policy.json'
}

workflow_policy_get() {
  local jq_path="$1"
  local default_value="${2:-}"
  local policy_file value

  policy_file="$(workflow_policy_file)"
  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    value="$(jq -r "$jq_path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

workflow_repo_relative_path() {
  local value="$1"
  local default_value="$2"
  local allowed_prefix="${3:-}"

  if [[ -z "$value" || "$value" == /* || "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    printf '%s' "$default_value"
    return 0
  fi

  case "$value" in
    ..|../*|*/..|*/../*)
      printf '%s' "$default_value"
      ;;
    *)
      if [[ -n "$allowed_prefix" && "$value" != "$allowed_prefix"* ]]; then
        printf '%s' "$default_value"
        return 0
      fi
      printf '%s' "$value"
      ;;
  esac
}

workflow_context_map_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.context.map_file' '.ai/context/context-map.json')" '.ai/context/context-map.json' '.ai/context/'
}

workflow_failure_log_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.failure_log_file' '.ai/harness/failures/latest.jsonl')" '.ai/harness/failures/latest.jsonl' '.ai/harness/'
}

workflow_events_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.events_file' '.ai/harness/events.jsonl')" '.ai/harness/events.jsonl' '.ai/harness/'
}

workflow_runs_dir() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.runs_dir' '.ai/harness/runs')" '.ai/harness/runs' '.ai/harness/'
}

workflow_resume_packet_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.handoff_resume.resume_packet_file' '.ai/harness/handoff/resume.md')" '.ai/harness/handoff/resume.md' '.ai/harness/'
}

workflow_pending_orchestration_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.planning.pending_orchestration_file' '.ai/harness/planning/pending.json')" '.ai/harness/planning/pending.json' '.ai/harness/'
}

workflow_ensure_harness_surface() {
  mkdir -p \
    "tasks/notes" \
    "$(dirname "$(workflow_context_map_file)")" \
    "$(dirname "$(workflow_policy_file)")" \
    "$(dirname "$(workflow_handoff_file)")" \
    "$(dirname "$(workflow_resume_packet_file)")" \
    "$(dirname "$(workflow_failure_log_file)")" \
    "$(dirname "$(workflow_pending_orchestration_file)")" \
    "$(workflow_runs_dir)"

  # Recovery materialization owns handoff and resume files. Missing files stay absent.
  [[ -f "$(workflow_failure_log_file)" ]] || : > "$(workflow_failure_log_file)"
  [[ -f "$(workflow_events_file)" ]] || : > "$(workflow_events_file)"
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

# Records why get_active_plan returned empty. Empty string means the marker
# state was clean. Possible values:
#   "deleted" - marker exists but points at a plan file that no longer exists
#   "foreign" - active-worktree marker is owned by a different worktree
# Hooks can inspect this to differentiate "no marker at all" (hard error,
# user has not started a plan) from "marker is stale" (advisory + self-heal,
# the marker rotted underneath the user).
ACTIVE_PLAN_MARKER_STALE_REASON=""

read_active_plan_marker() {
  local marker_file="$1"
  local marker_plan

  if [[ -f "$marker_file" ]]; then
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" ]]; then
      if [[ -f "$marker_plan" ]]; then
        printf '%s' "$marker_plan"
        return 0
      fi
      ACTIVE_PLAN_MARKER_STALE_REASON="deleted"
    fi
  fi

  return 1
}

active_plan_marker_matches_cwd() {
  local owner current

  [[ -f "$ACTIVE_WORKTREE_MARKER" ]] || return 0
  owner="$(cat "$ACTIVE_WORKTREE_MARKER" 2>/dev/null | head -n 1 | xargs)"
  [[ -n "$owner" ]] || return 0

  current="$(pwd -P 2>/dev/null)"
  [[ -n "$current" ]] || return 0

  if [[ "$owner" != "$current" ]]; then
    ACTIVE_PLAN_MARKER_STALE_REASON="foreign"
    return 1
  fi
  return 0
}

get_active_plan() {
  ACTIVE_PLAN_MARKER_STALE_REASON=""

  if ! active_plan_marker_matches_cwd; then
    return 1
  fi

  read_active_plan_marker "$ACTIVE_PLAN_MARKER"
}

get_todo_source_plan() {
  if [[ ! -f "tasks/todos.md" ]]; then
    return 1
  fi

  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todos.md | xargs
}

workflow_plan_slug_from_path() {
  local plan_file="$1"
  local base slug

  base="$(basename "$plan_file")"
  slug="$(printf '%s' "$base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"

  if [[ -z "$slug" ]] || [[ "$slug" == "$base" ]]; then
    return 1
  fi

  printf '%s' "$slug"
}

workflow_plan_original_artifact_stem_from_path() {
  local plan_file="$1"
  local base stem

  base="$(basename "$plan_file")"
  stem="$(printf '%s' "$base" | sed -E 's/^plan-//; s/\.md$//')"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    printf '%s' "$stem"
    return 0
  fi

  workflow_plan_slug_from_path "$plan_file"
}

workflow_is_transient_plan_slug() {
  case "$1" in
    think-plan-[0-9]*|codex-plan-[0-9]*|approved-plan-[0-9]*)
      return 0
      ;;
  esac
  return 1
}

workflow_plan_title_slug_from_file() {
  local plan_file="$1"
  local title slug

  [[ -f "$plan_file" ]] || return 1
  title="$(awk '
    /^# Plan:[[:space:]]*/ {
      sub(/^# Plan:[[:space:]]*/, "")
      print
      exit
    }
  ' "$plan_file" | xargs)"
  [[ -n "$title" ]] || return 1

  slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

workflow_plan_artifact_stem_from_path() {
  local plan_file="$1"
  local stem stamp slug title_slug

  stem="$(workflow_plan_original_artifact_stem_from_path "$plan_file" || true)"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    slug="$(printf '%s' "$stem" | sed -E 's/^[0-9]{8}-[0-9]{4}-//')"
    if workflow_is_transient_plan_slug "$slug"; then
      title_slug="$(workflow_plan_title_slug_from_file "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$stem"
    return 0
  fi

  workflow_plan_slug_from_path "$plan_file"
}

workflow_preferred_or_legacy_path() {
  local preferred="$1"
  local legacy="$2"

  if [[ -f "$preferred" ]] || [[ ! -f "$legacy" ]]; then
    printf '%s' "$preferred"
  else
    printf '%s' "$legacy"
  fi
}

workflow_plan_declared_path() {
  local plan_file="$1"
  local label="$2"
  [[ -f "$plan_file" ]] || return 1
  awk -v label="$label" '
    BEGIN { pattern = "^> \\*\\*" label "\\*\\*:" }
    $0 ~ pattern {
      sub(pattern "[[:space:]]*", "")
      gsub(/`/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$plan_file" | xargs
}

derive_contract_path() {
  local plan_file="$1"
  local stem slug explicit

  explicit="$(workflow_plan_declared_path "$plan_file" "Task Contract" || workflow_plan_declared_path "$plan_file" "Sprint Contract" || true)"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi

  stem="$(workflow_plan_artifact_stem_from_path "$plan_file" || true)"
  slug="$(workflow_plan_slug_from_path "$plan_file" || true)"
  [[ -n "$stem" && -n "$slug" ]] || return 1

  workflow_preferred_or_legacy_path "tasks/contracts/${stem}.contract.md" "tasks/contracts/${slug}.contract.md"
}

workflow_active_contract() {
  local active_plan contract_file
  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" ]] || return 1
  contract_file="$(derive_contract_path "$active_plan" || true)"
  [[ -n "$contract_file" ]] || return 1
  printf '%s' "$contract_file"
}

workflow_active_review() {
  local active_plan stem slug reviews_dir explicit
  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" ]] || return 1
  explicit="$(workflow_plan_declared_path "$active_plan" "Task Review" || workflow_plan_declared_path "$active_plan" "Sprint Review" || true)"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi
  stem="$(workflow_plan_artifact_stem_from_path "$active_plan" || true)"
  slug="$(workflow_plan_slug_from_path "$active_plan" || true)"
  [[ -n "$stem" && -n "$slug" ]] || return 1
  reviews_dir="$(workflow_repo_relative_path "$(workflow_policy_get '.tasks.reviews_dir' 'tasks/reviews')" 'tasks/reviews' 'tasks/')"
  workflow_preferred_or_legacy_path "${reviews_dir}/${stem}.review.md" "${reviews_dir}/${slug}.review.md"
}

workflow_active_notes() {
  local active_plan stem slug notes_dir explicit
  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" ]] || return 1
  explicit="$(workflow_plan_declared_path "$active_plan" "Implementation Notes" || workflow_plan_declared_path "$active_plan" "Notes File" || true)"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi
  stem="$(workflow_plan_artifact_stem_from_path "$active_plan" || true)"
  slug="$(workflow_plan_slug_from_path "$active_plan" || true)"
  [[ -n "$stem" && -n "$slug" ]] || return 1
  notes_dir="$(workflow_repo_relative_path "$(workflow_policy_get '.tasks.notes_dir' 'tasks/notes')" 'tasks/notes' 'tasks/')"
  workflow_preferred_or_legacy_path "${notes_dir}/${stem}.notes.md" "${notes_dir}/${slug}.notes.md"
}

workflow_handoff_file() {
  workflow_repo_relative_path "$(workflow_policy_get '.harness.handoff_file' '.ai/harness/handoff/current.md')" '.ai/harness/handoff/current.md' '.ai/harness/'
}

# mkdir-based mutual exclusion (macOS ships no flock). Spins ~2s, breaks locks
# older than 60s (crashed holder), and as a last resort runs the command
# unlocked rather than wedging an advisory hook.
workflow_with_lock() {
  local name="$1"
  shift
  local lock_root lock_dir waited=0 now mtime status=0
  lock_root="$(dirname "$(workflow_events_file)")/.locks"
  lock_dir="$lock_root/${name}.lock"
  if ! mkdir -p "$lock_root" 2>/dev/null; then
    "$@" || status=$?
    return "$status"
  fi

  while ! mkdir "$lock_dir" 2>/dev/null; do
    if [[ "$waited" -ge 40 ]]; then
      now="$(date +%s)"
      mtime="$(stat -c '%Y' "$lock_dir" 2>/dev/null || stat -f '%m' "$lock_dir" 2>/dev/null || echo 0)"
      if [[ "${mtime:-0}" =~ ^[0-9]+$ && "${mtime:-0}" -gt 0 && $((now - mtime)) -ge 60 ]]; then
        rmdir "$lock_dir" 2>/dev/null || true
        waited=0
        continue
      fi
      "$@" || status=$?
      return "$status"
    fi
    sleep 0.05
    waited=$((waited + 1))
  done

  "$@" || status=$?
  rmdir "$lock_dir" 2>/dev/null || true
  return "$status"
}

workflow_locked_append_line() {
  printf '%s\n' "$2" >> "$1"
}

workflow_append_event() {
  local event_type="$1"
  local reason="${2:-}"
  local extra_json="${3:-{}}"
  local events_file run_id line=""

  workflow_ensure_harness_surface
  events_file="$(workflow_events_file)"
  run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"

  if command -v jq >/dev/null 2>&1; then
    line="$(jq -nc \
      --arg ts "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
      --arg event_type "$event_type" \
      --arg reason "$reason" \
      --arg run_id "$run_id" \
      --arg extra_json "$extra_json" \
      '{
        ts: $ts,
        event_type: $event_type,
        reason: $reason,
        run_id: $run_id,
        extra: (try ($extra_json | fromjson) catch {})
      }')"
  else
    line="$(printf '{"ts":"%s","event_type":"%s","reason":"%s","run_id":"%s"}' \
      "$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")" \
      "$(workflow_json_escape "$event_type")" \
      "$(workflow_json_escape "$reason")" \
      "$(workflow_json_escape "$run_id")")"
  fi

  [[ -n "$line" ]] || return 0
  workflow_with_lock "evt-$(basename "$events_file")" workflow_locked_append_line "$events_file" "$line"
}

workflow_write_run_summary() {
  local reason="${1:-state-update}"
  local run_id active_plan active_contract active_review active_notes output_file

  workflow_ensure_harness_surface
  run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"
  active_plan="$(get_active_plan || true)"
  active_contract="$(workflow_active_contract || true)"
  active_review="$(workflow_active_review || true)"
  active_notes="$(workflow_active_notes || true)"
  output_file="$(workflow_runs_dir)/${run_id}.json"

  if command -v jq >/dev/null 2>&1; then
    jq -nc \
      --arg generated_at "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
      --arg run_id "$run_id" \
      --arg reason "$reason" \
      --arg active_plan "${active_plan:-}" \
      --arg active_contract "${active_contract:-}" \
      --arg active_review "${active_review:-}" \
      --arg active_notes "${active_notes:-}" \
      --arg handoff_file "$(workflow_handoff_file)" \
      --arg policy_file "$(workflow_policy_file)" \
      --arg context_map_file "$(workflow_context_map_file)" \
      '{
        generated_at: $generated_at,
        run_id: $run_id,
        reason: $reason,
        active_plan: $active_plan,
        active_contract: $active_contract,
        active_review: $active_review,
        active_notes: $active_notes,
        handoff_file: $handoff_file,
        policy_file: $policy_file,
        context_map_file: $context_map_file
      }' > "$output_file"
    return 0
  fi

  # Same field set as the jq branch above: run-summary retention identifies this
  # record by its shape, so a short fallback would make every jq-less host's
  # summaries permanently unreclaimable.
  cat > "$output_file" <<EOF_RUN
{"generated_at":"$(workflow_json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")","run_id":"$(workflow_json_escape "$run_id")","reason":"$(workflow_json_escape "$reason")","active_plan":"$(workflow_json_escape "${active_plan:-}")","active_contract":"$(workflow_json_escape "${active_contract:-}")","active_review":"$(workflow_json_escape "${active_review:-}")","active_notes":"$(workflow_json_escape "${active_notes:-}")","handoff_file":"$(workflow_json_escape "$(workflow_handoff_file)")","policy_file":"$(workflow_json_escape "$(workflow_policy_file)")","context_map_file":"$(workflow_json_escape "$(workflow_context_map_file)")"}
EOF_RUN
}

workflow_contract_allows_path() {
  local contract_file="$1"
  local file_path="$2"
  local yaml_block section trimmed item pattern

  [[ -f "$contract_file" ]] || return 1
  [[ "$file_path" == "$contract_file" ]] && return 0

  yaml_block="$(
    awk '
      BEGIN { in_block = 0; printed = 0 }
      /^```yaml[[:space:]]*$/ && printed == 0 { in_block = 1; next }
      /^```[[:space:]]*$/ && in_block == 1 { printed = 1; in_block = 0; exit }
      in_block == 1 { print }
    ' "$contract_file"
  )"

  section=""
  while IFS= read -r line; do
    trimmed="$(printf '%s' "$line" | sed -E 's/[[:space:]]+$//; s/^[[:space:]]+//')"
    [[ -z "$trimmed" ]] && continue

    case "$trimmed" in
      allowed_paths:)
        section="allowed_paths"
        continue
        ;;
      exit_criteria:|files_exist:|tests_pass:|commands_succeed:|files_contain:|artifacts_exist:|qa_scores:|manual_checks:)
        section=""
        continue
        ;;
    esac

    if [[ "$section" == "allowed_paths" && "$trimmed" =~ ^-[[:space:]]*(.+)$ ]]; then
      item="${BASH_REMATCH[1]}"
      # Drop a YAML inline comment: `#` at the start or after whitespace, outside a leading quoted scalar.
      case "$item" in
        \"*\"*) item="\"$(printf '%s' "${item:1}" | cut -d'"' -f1)\"" ;;
        \'*\'*) item="'$(printf '%s' "${item:1}" | cut -d"'" -f1)'" ;;
        *) item="$(printf '%s' "$item" | sed -E 's/^#.*$//; s/[[:space:]]+#.*$//')" ;;
      esac
      item="$(workflow_strip_quotes "$item")"
      [[ -n "$item" ]] || continue
      pattern="$item"
      if [[ "$pattern" == */ ]]; then
        [[ "$file_path" == "$pattern"* ]] && return 0
      elif [[ "$file_path" == $pattern ]]; then
        return 0
      fi
    fi
  done <<< "$yaml_block"

  return 1
}

workflow_write_handoff() {
  local reason="${1:-session-stop}"
  local source_plan parent_run_id bun_bin helper_source recovery_view_cli

  # EPC-07: independent handoff/resume content assembly retired same-package
  # (Phase A/B: tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md).
  # Rendering now lives in the single standalone materializer,
  # scripts/recovery-view-cli.ts (generated into
  # assets/templates/helpers/recovery-view-cli.ts with a generated prefix),
  # kept consistent by inspection with src/effects/evidence/recovery-materializer.ts -- the
  # authoritative in-process implementation the TS Stop handler imports
  # directly at real Stop time. This function still owns the
  # event-journal/run-summary bookkeeping below: those are not among
  # EPC-07's four named recovery views.
  workflow_ensure_harness_surface
  bun_bin="${REPO_HARNESS_BUN_BIN:-bun}"
  helper_source="${REPO_HARNESS_HELPER_SOURCE_PATH:-}"
  if [[ -n "$helper_source" ]]; then
    if [[ ! -f "$helper_source" || "$(basename "$helper_source")" != "prepare-handoff.sh" ]]; then
      echo "workflow_write_handoff: invalid REPO_HARNESS_HELPER_SOURCE_PATH for prepare-handoff" >&2
      return 1
    fi
    recovery_view_cli="$(cd "$(dirname "$helper_source")" && pwd)/recovery-view-cli.ts"
  else
    recovery_view_cli="scripts/recovery-view-cli.ts"
  fi
  if [[ ! -f "$recovery_view_cli" ]]; then
    echo "workflow_write_handoff: recovery materializer is missing: $recovery_view_cli" >&2
    return 1
  fi
  "$bun_bin" "$recovery_view_cli" --reason "$reason" --quiet

  source_plan="$(get_todo_source_plan || true)"
  if [[ "$source_plan" == "(none)" ]]; then
    source_plan=""
  fi
  parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-$(date '+%Y%m%dT%H%M%S')-$$}}}"

  workflow_append_event "handoff_refresh" "$reason" "{\"source_plan\":\"$(workflow_json_escape "${source_plan:-}")\",\"parent_run_id\":\"$(workflow_json_escape "$parent_run_id")\"}"
  workflow_write_run_summary "$reason"
}
