#!/bin/bash
# SessionStart context injector for compact-independent Codex resumes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

# Cold-path housekeeping: both event logs grow unbounded otherwise.
workflow_rotate_events_file "$(workflow_events_file)" 2>/dev/null || true
workflow_rotate_events_file ".ai/harness/architecture/events.jsonl" 2>/dev/null || true

resume_file="$(workflow_resume_packet_file)"

helper_command() {
  local helper_name="$1"
  helper_name="${helper_name%.sh}"
  printf 'repo-harness run %s' "$helper_name"
}

resume_available() {
  [[ -f "$resume_file" ]] || return 1
  grep -Fq "<!-- generated-by: repo-harness codex-handoff-resume v1 -->" "$resume_file" || return 1
  grep -Fq "## Resume Prompt" "$resume_file"
}

resume_reason() {
  resume_available || return 1
  awk '/^\> \*\*Reason\*\*:/ {sub(/^.*\> \*\*Reason\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$resume_file" | xargs
}

file_mtime() {
  local file="$1"
  [[ -f "$file" ]] || return 1

  if stat -f '%m' "$file" >/dev/null 2>&1; then
    stat -f '%m' "$file"
    return 0
  fi

  stat -c '%Y' "$file" 2>/dev/null
}

resume_current_for_handoff() {
  local handoff_file resume_mtime handoff_mtime
  resume_available || return 1

  handoff_file="$(workflow_handoff_file)"
  [[ -f "$handoff_file" ]] || return 0

  resume_mtime="$(file_mtime "$resume_file" || true)"
  handoff_mtime="$(file_mtime "$handoff_file" || true)"
  [[ -n "$resume_mtime" && -n "$handoff_mtime" ]] || return 0

  [[ "$resume_mtime" -ge "$handoff_mtime" ]]
}

active_plan_exists() {
  local plan_file status
  plan_file="$(get_active_plan || true)"
  [[ -n "$plan_file" && -f "$plan_file" ]] || return 1
  status="$(get_plan_status "$plan_file" | tr '[:upper:]' '[:lower:]')"
  case "$status" in
    approved|executing|review|reviewing|active|in-progress|in\ progress)
      return 0
      ;;
  esac
  return 1
}

active_todo_exists() {
  [[ -f "tasks/todos.md" ]] || return 1

  if grep -Eq '^\> \*\*Status\*\*:[[:space:]]*(Executing|Active|Review|Reviewing|In Progress)[[:space:]]*$' tasks/todos.md; then
    return 0
  fi

  if grep -Eq '^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+' tasks/todos.md \
    && ! grep -Fq "No active execution checklist" tasks/todos.md; then
    return 0
  fi

  return 1
}

tooling_update_target() {
  case "${HOOK_HOST:-}" in
    codex|claude)
      printf '%s' "$HOOK_HOST"
      ;;
    *)
      printf '%s' "both"
      ;;
  esac
}

repo_harness_setup_check() {
  local target="$1"

  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_CLI" setup check --target "$target" --check-updates --json
    return $?
  fi

  if command -v repo-harness >/dev/null 2>&1; then
    repo-harness setup check --target "$target" --check-updates --json
    return $?
  fi

  return 127
}

tooling_update_cache_is_fresh() {
  local report_file="$1"
  local ttl="${REPO_HARNESS_TOOLING_ADVISORY_TTL_SECONDS:-604800}"
  local now mtime age

  [[ -f "$report_file" ]] || return 1
  [[ "$ttl" =~ ^[0-9]+$ ]] || ttl="86400"
  [[ "$ttl" -gt 0 ]] || return 1
  [[ "${REPO_HARNESS_TOOLING_ADVISORY_FORCE:-}" != "1" ]] || return 1

  now="$(date '+%s' 2>/dev/null || true)"
  mtime="$(file_mtime "$report_file" 2>/dev/null || true)"
  [[ -n "$now" && -n "$mtime" && "$now" -ge "$mtime" ]] || return 1

  age="$((now - mtime))"
  [[ "$age" -lt "$ttl" ]]
}

render_tooling_update_context() {
  local report_file="$1"
  local js='
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const actions = Array.isArray(report.agent_actions) ? report.agent_actions : [];
const updateActions = actions.filter((action) => {
  const id = typeof action?.id === "string" ? action.id : "";
  return id === "cli.update" || /^tooling\.[^.]+\.update$/.test(id);
});
if (updateActions.length === 0) process.exit(0);
console.log("# Tooling Update Advisory");
console.log("");
console.log("repo-harness setup check found version updates. Agent should run the bounded update command(s), then verify.");
for (const action of updateActions.slice(0, 5)) {
  const id = action.id ?? "unknown";
  const reason = action.reason ?? "update available";
  console.log(`- ${id}: ${reason}`);
  if (action.command) console.log(`  command: \`${action.command}\``);
  if (action.verification) console.log(`  verify: \`${action.verification}\``);
}
if (updateActions.length > 5) {
  console.log(`- ${updateActions.length - 5} more update action(s): run \`repo-harness setup check --check-updates --json\`.`);
}
'

  if command -v node >/dev/null 2>&1; then
    node -e "$js" "$report_file"
  elif command -v bun >/dev/null 2>&1; then
    bun -e "$js" "$report_file"
  fi
}

tooling_update_report_was_rendered() {
  local report_file="$1"
  local marker_file="$2"
  local report_mtime marker_mtime

  [[ -f "$report_file" && -f "$marker_file" ]] || return 1
  report_mtime="$(file_mtime "$report_file" 2>/dev/null || true)"
  marker_mtime="$(cat "$marker_file" 2>/dev/null | tr -d "[:space:]" || true)"
  [[ -n "$report_mtime" && "$marker_mtime" == "$report_mtime" ]]
}

tooling_update_mark_report_rendered() {
  local report_file="$1"
  local marker_file="$2"
  local report_mtime

  report_mtime="$(file_mtime "$report_file" 2>/dev/null || true)"
  [[ -n "$report_mtime" ]] || return 0
  printf '%s\n' "$report_mtime" > "$marker_file"
}

render_tooling_update_context_once() {
  local report_file="$1"
  local marker_file="$2"

  tooling_update_report_was_rendered "$report_file" "$marker_file" && return 0
  render_tooling_update_context "$report_file" || true
  tooling_update_mark_report_rendered "$report_file" "$marker_file" || true
}

tooling_update_advisory_context() {
  local target state_dir report_file marker_file lock_dir tmp_report

  [[ -f ".ai/harness/workflow-contract.json" ]] || return 1
  [[ "${REPO_HARNESS_TOOLING_ADVISORY:-1}" != "0" ]] || return 1

  target="$(tooling_update_target)"
  state_dir=".ai/harness/security"
  report_file="$state_dir/tooling-update-advisory-${target}.json"
  marker_file="$state_dir/tooling-update-advisory-${target}.rendered"
  lock_dir="$state_dir/tooling-update-advisory-${target}.lock"

  if tooling_update_cache_is_fresh "$report_file"; then
    render_tooling_update_context_once "$report_file" "$marker_file" || true
    return 0
  fi

  mkdir -p "$state_dir"
  if [[ "${REPO_HARNESS_TOOLING_ADVISORY_SYNC:-}" == "1" ]]; then
    tmp_report="$(mktemp "${TMPDIR:-/tmp}/repo-harness-tooling-update.XXXXXX")"
    if repo_harness_setup_check "$target" >"$tmp_report" 2>/dev/null; then
      cp "$tmp_report" "$report_file"
      render_tooling_update_context_once "$report_file" "$marker_file" || true
    fi
    rm -f "$tmp_report"
    return 0
  fi

  if mkdir "$lock_dir" 2>/dev/null; then
    (
      tmp_report="$(mktemp "${TMPDIR:-/tmp}/repo-harness-tooling-update.XXXXXX")"
      if repo_harness_setup_check "$target" >"$tmp_report" 2>/dev/null; then
        cp "$tmp_report" "$report_file"
      fi
      rm -f "$tmp_report"
      rmdir "$lock_dir" 2>/dev/null || true
    ) >/dev/null 2>&1 &
  fi
}

handoff_section_has_signal() {
  local header="$1"
  local handoff_file
  handoff_file="$(workflow_handoff_file)"
  [[ -f "$handoff_file" ]] || return 1

  awk -v header="$header" '
    $0 == header { in_section = 1; next }
    /^## / && in_section { exit }
    in_section {
      line = $0
      gsub(/^[[:space:]-]+/, "", line)
      gsub(/[[:space:]]+$/, "", line)
      if (line == "" || line == "```" || line == "(none)" || line == "(none recorded)") {
        next
      }
      found = 1
    }
    END { exit found ? 0 : 1 }
  ' "$handoff_file"
}

capability_context_pending() {
  local queue_file=".ai/harness/capability-context/requests.jsonl"
  local pending_lines=""
  local pending_count="0"

  [[ -s "$queue_file" ]] || return 1

  if command -v jq >/dev/null 2>&1; then
    pending_count="$(jq -r 'select(.status == "pending") | .request_id' "$queue_file" 2>/dev/null | wc -l | xargs)"
    pending_lines="$(jq -r 'select(.status == "pending") | "- " + .capability_id + " <- `" + .path + "`"' "$queue_file" 2>/dev/null | sort -u | head -10 || true)"
  else
    pending_count="$(grep -c '"status":"pending"' "$queue_file" 2>/dev/null || true)"
    pending_lines="$(grep '"status":"pending"' "$queue_file" 2>/dev/null | head -10 | sed -E 's/^/- /' || true)"
  fi

  [[ "${pending_count:-0}" != "0" && -n "$pending_lines" ]] || return 1

  cat <<EOF_CONTEXT
# Capability Context Queue

Pending capability context requests detected (${pending_count}). Run:

\`\`\`bash
repo-harness capability-context sync --pending --apply
\`\`\`

Queued capabilities:
${pending_lines}
EOF_CONTEXT
}

architecture_queue_pending() {
  local requests_dir="docs/architecture/requests"
  local pending_count="0"
  local oldest_epoch="" oldest_days="unknown"
  local now_epoch request detected detected_date detected_epoch
  local queue_cmd

  [[ -d "$requests_dir" ]] || return 1
  queue_cmd="$(helper_command "architecture-queue.sh")"

  now_epoch="$(date '+%s' 2>/dev/null || true)"
  while IFS= read -r request; do
    [[ -f "$request" ]] || continue
    grep -Eq '^> \*\*Status\*\*:[[:space:]]*Pending[[:space:]]*$' "$request" || continue
    pending_count=$((pending_count + 1))
    detected="$(awk '/^> \*\*Detected\*\*:/ {sub(/^.*> \*\*Detected\*\*:[[:space:]]*/, ""); print; exit}' "$request" | xargs || true)"
    detected_date="${detected%%T*}"
    detected_epoch=""
    if [[ "$detected_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      detected_epoch="$(date -j -f '%Y-%m-%d' "$detected_date" '+%s' 2>/dev/null || date -d "$detected_date" '+%s' 2>/dev/null || true)"
    fi
    if [[ -n "$detected_epoch" && ( -z "$oldest_epoch" || "$detected_epoch" -lt "$oldest_epoch" ) ]]; then
      oldest_epoch="$detected_epoch"
    fi
  done < <(find "$requests_dir" -maxdepth 1 -type f -name '*.md' | sort)

  [[ "$pending_count" -gt 0 ]] || return 1
  if [[ -n "$now_epoch" && -n "$oldest_epoch" && "$now_epoch" -ge "$oldest_epoch" ]]; then
    oldest_days="$(( (now_epoch - oldest_epoch) / 86400 ))d"
  fi

  cat <<EOF_CONTEXT
# Architecture Queue

${pending_count} capabilities have pending architecture drift (oldest ${oldest_days}). Run:

\`\`\`bash
${queue_cmd} status
\`\`\`
EOF_CONTEXT
}

pending_plan_capture_context() {
  local active_plan summary draft_path prompt_slug kind source_ref capture_source source_arg capture_cmd

  workflow_pending_orchestration_is_fresh || return 1
  active_plan="$(get_active_plan || true)"
  [[ -z "$active_plan" || ! -f "$active_plan" ]] || return 1

  summary="$(workflow_pending_orchestration_summary)"
  draft_path="$(workflow_pending_orchestration_field draft_plan_path 2>/dev/null || true)"
  prompt_slug="$(workflow_pending_orchestration_field prompt_slug 2>/dev/null || true)"
  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  capture_source="${kind:-host-plan}"
  source_arg=""
  if [[ -n "$source_ref" ]]; then
    source_arg=" --source-ref <source-ref>"
  fi
  capture_cmd="$(helper_command "capture-plan.sh")"

  cat <<EOF_CONTEXT
# Pending Plan Capture

A host/thread planning discussion is pending capture and no active repo plan is selected.

- State: ${summary}
- Draft plan: ${draft_path:-"(none captured yet)"}
- Rule: continue discussion freely, but do not edit implementation files until the final plan body is captured into \`plans/\`.

Capture the decision-complete plan body:

\`\`\`bash
printf '%s\n' '<decision-complete plan body>' | ${capture_cmd} --slug ${prompt_slug:-<slug>} --title <title> --status Draft --source ${capture_source} --orchestration-kind ${capture_source} --route planning${source_arg}
\`\`\`

If the user has already approved implementation:

\`\`\`bash
printf '%s\n' '<approved plan body>' | ${capture_cmd} --slug ${prompt_slug:-<slug>} --title <title> --artifact-level work-package --promotion-reason human_decision_boundary --status Approved --source ${capture_source} --orchestration-kind ${capture_source} --route planning --execute${source_arg}
\`\`\`
EOF_CONTEXT
}

current_status_field() {
  local file="$1"
  local label="$2"
  [[ -f "$file" ]] || return 1
  awk -v label="$label" '
    $0 ~ "^> \\*\\*" label "\\*\\*:" {
      sub("^> \\*\\*" label "\\*\\*: *", "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$file" | xargs
}

current_status_snapshot_context() {
  local current_file="tasks/current.md"
  local target branch status updated source_commit target_status target_updated

  target="$(workflow_target_branch)"
  branch="$(workflow_current_branch)"
  status="$(current_status_field "$current_file" "Status" 2>/dev/null || true)"
  updated="$(current_status_field "$current_file" "Updated At" 2>/dev/null || true)"
  source_commit="$(current_status_field "$current_file" "Source Commit" 2>/dev/null || true)"

  if [[ -z "$status" ]]; then
    if [[ "$branch" != "$target" ]] && git rev-parse --verify --quiet "$target" >/dev/null 2>&1 \
      && git show "${target}:tasks/current.md" >/dev/null 2>&1; then
      :
    else
      return 1
    fi
  fi

  if [[ -z "$status" && "$branch" == "$target" ]]; then
    return 1
  fi
  if [[ "$status" == "Idle" && "$branch" == "$target" ]]; then
    return 1
  fi

  cat <<EOF_CONTEXT
# Current Status Snapshot

- Local snapshot: \`${current_file}\` status=${status:-"(missing)"} updated=${updated:-"(unknown)"} source_commit=${source_commit:-"(unknown)"}
- Target branch snapshot: \`git show ${target}:tasks/current.md\`
- Rule: this is a tracked read model only; verify stale or surprising state against plans, workstreams, handoff, and checks before acting.
EOF_CONTEXT

  if [[ "$branch" != "$target" ]] && git rev-parse --verify --quiet "$target" >/dev/null 2>&1; then
    target_status="$(git show "${target}:tasks/current.md" 2>/dev/null | awk '/^> \*\*Status\*\*:/ {sub(/^> \*\*Status\*\*: */, ""); print; exit}' | xargs || true)"
    target_updated="$(git show "${target}:tasks/current.md" 2>/dev/null | awk '/^> \*\*Updated At\*\*:/ {sub(/^> \*\*Updated At\*\*: */, ""); print; exit}' | xargs || true)"
    if [[ -n "$target_status" ]]; then
      cat <<EOF_CONTEXT
- Target snapshot metadata: status=${target_status} updated=${target_updated:-"(unknown)"}
EOF_CONTEXT
    fi
  fi
}

active_sprint_context() {
  local marker=".ai/harness/sprint/active-sprint"
  local sprint_file status progress next_task
  local sprint_cmd capture_cmd

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    marker="$(jq -r '.sprints.active_marker_file // empty' .ai/harness/policy.json 2>/dev/null || true)"
    [[ -n "$marker" ]] || marker=".ai/harness/sprint/active-sprint"
  fi

  [[ -f "$marker" ]] || return 1
  sprint_file="$(cat "$marker" 2>/dev/null | xargs || true)"
  [[ -n "$sprint_file" && -f "$sprint_file" ]] || return 1

  status="$(awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$sprint_file" | xargs)"
  progress="$(awk -F '|' '
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      total++
      cell = $3
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", cell)
      if (cell ~ /^\[[xX]\]$/) done++
    }
    END { printf "%d/%d", done + 0, total + 0 }
  ' "$sprint_file")"
  next_task="$(awk -F '|' '
    /^## Backlog[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
      status = $3; task = $4
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", task)
      if (status == "[ ]") { print task; found = 1; exit }
    }
    END { if (!found) print "(none)" }
  ' "$sprint_file")"
  sprint_cmd="$(helper_command "sprint-backlog.sh")"
  capture_cmd="$(helper_command "capture-plan.sh")"

  cat <<EOF_CONTEXT
# Active Sprint

- Sprint: \`${sprint_file}\` status=${status:-unknown} backlog=${progress}
- Next sprint task: ${next_task}
- Rule: a Sprint is a long-task container. Use \`\$think\` to expand the next sprint task into a detailed \`plans/plan-*.md\`, then run the existing plan -> contract -> worktree flow. \`tasks/todos.md\` stays the deferred-goal ledger.
- Entrypoint: inspect with \`${sprint_cmd} next\`; after \`\$think\` produces an approved plan, capture it with \`${capture_cmd} --source waza-think --source-ref sprint:${sprint_file}#${next_task}\`.
EOF_CONTEXT
}

input_priority_context() {
  cat <<'EOF_CONTEXT'
# Input Priority

If the current user message mentions `# Files mentioned by the user`, `pasted-text.txt`, or an explicit attachment/file path, read those current-input files first. Treat handoff, resume, and `tasks/current.md` as recovery context only.
EOF_CONTEXT
}

context=""
if resume_current_for_handoff; then
  if active_plan_exists \
    || active_todo_exists \
    || handoff_section_has_signal "## Blockers" \
    || handoff_section_has_signal "## Changed Files"; then
    context="$(awk 'length(total) < 12000 { total = total $0 "\n" } END { printf "%s", total }' "$resume_file")"
  fi
fi

pending_context="$(capability_context_pending || true)"
if [[ -n "$pending_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${pending_context}"
  else
    context="$pending_context"
  fi
fi

architecture_context="$(architecture_queue_pending || true)"
if [[ -n "$architecture_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${architecture_context}"
  else
    context="$architecture_context"
  fi
fi

pending_capture_context="$(pending_plan_capture_context || true)"
if [[ -n "$pending_capture_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${pending_capture_context}"
  else
    context="$pending_capture_context"
  fi
fi

current_status_context="$(current_status_snapshot_context || true)"
if [[ -n "$current_status_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${current_status_context}"
  else
    context="$current_status_context"
  fi
fi

sprint_context="$(active_sprint_context || true)"
if [[ -n "$sprint_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${sprint_context}"
  else
    context="$sprint_context"
  fi
fi

tooling_update_context="$(tooling_update_advisory_context || true)"
if [[ -n "$tooling_update_context" ]]; then
  if [[ -n "$context" ]]; then
    context="${context}"$'\n'"${tooling_update_context}"
  else
    context="$tooling_update_context"
  fi
fi

if [[ -n "$context" ]]; then
  context="$(input_priority_context)"$'\n'"${context}"
fi

# Cross-review availability for Codex. The dispatcher swallows prompt-guard's
# success stdout on Codex, so attach a short reminder only when SessionStart is
# already injecting actionable context.
if [[ "${HOOK_HOST:-}" == "codex" && -n "$context" ]]; then
  cross_review_note="[CrossReview] High-risk diff/spec/test/debug only: run /claude-review when a second model view is worth the tokens."
  context="${context}"$'\n'"${cross_review_note}"
fi

[[ -n "$context" ]] || exit 0

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg context "$context" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $context
    }
  }'
  exit 0
fi

printf '%s\n' "$context"
