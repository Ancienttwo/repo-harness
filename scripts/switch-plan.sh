#!/bin/bash
# Select the current plan for this worktree.
# Other worktrees may hold different active-plan markers concurrently.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/switch-plan.sh --plan <plan-file>
       scripts/switch-plan.sh --list

Options:
  --plan <path>   Switch to the specified plan (saves current state, restores target)
  --list          List all non-archived plans with active marker
USAGE_EOF
}

extract_status() {
  local file="$1"
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
LEGACY_ACTIVE_PLAN_MARKER=".claude/.active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

read_active_plan_marker() {
  local marker_file="$1"
  local marker_plan

  if [[ -f "$marker_file" ]]; then
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && -f "$marker_plan" ]]; then
      printf '%s' "$marker_plan"
      return 0
    fi
  fi

  return 1
}

get_active_plan() {
  read_active_plan_marker "$ACTIVE_PLAN_MARKER" \
    || read_active_plan_marker "$LEGACY_ACTIVE_PLAN_MARKER"
}

write_active_plan_marker() {
  local plan_file="$1"
  mkdir -p "$(dirname "$ACTIVE_PLAN_MARKER")" "$(dirname "$LEGACY_ACTIVE_PLAN_MARKER")" "$(dirname "$ACTIVE_WORKTREE_MARKER")"
  printf '%s' "$plan_file" > "$ACTIVE_PLAN_MARKER"
  printf '%s' "$plan_file" > "$LEGACY_ACTIVE_PLAN_MARKER"
  pwd -P > "$ACTIVE_WORKTREE_MARKER"
}

do_list() {
  local active
  active="$(get_active_plan || true)"

  if [[ ! -d "plans" ]]; then
    echo "No plans/ directory found."
    return
  fi

  local found=0
  while IFS= read -r plan; do
    [[ -n "$plan" ]] || continue
    found=1
    local status marker
    status="$(extract_status "$plan")"
    status="${status:-(unknown)}"
    if [[ "$plan" == "$active" ]]; then
      marker="[*]"
    else
      marker="   "
    fi
    printf '%s %s  Status: %s\n' "$marker" "$plan" "$status"
  done < <(find plans -maxdepth 1 -type f -name 'plan-*.md' 2>/dev/null | sort)

  if [[ "$found" -eq 0 ]]; then
    echo "No plans found in plans/"
  fi
}

do_switch() {
  local target_plan="$1"

  if [[ ! -f "$target_plan" ]]; then
    echo "Error: plan file not found: $target_plan" >&2
    exit 1
  fi

  local current_plan
  current_plan="$(get_active_plan || true)"

  if [[ "$current_plan" == "$target_plan" ]]; then
    echo "[PlanSwitch] Already on $target_plan"
    return 0
  fi

  write_active_plan_marker "$target_plan"
  echo "[PlanSwitch] Selected $target_plan for worktree $(pwd -P)"
  echo "[PlanSwitch] tasks/todo.md is a deferred-goal ledger and was left unchanged."
}

# --- Main ---
target_plan=""
mode=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      [[ -n "${2:-}" ]] || { echo "Error: --plan requires a value" >&2; usage; exit 2; }
      target_plan="$2"
      mode="switch"
      shift 2
      ;;
    --list)
      mode="list"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

case "$mode" in
  list)
    do_list
    ;;
  switch)
    do_switch "$target_plan"
    ;;
  *)
    usage
    exit 2
    ;;
esac
