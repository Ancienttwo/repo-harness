#!/bin/bash
set -euo pipefail

unset GH_TOKEN GITHUB_TOKEN ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN SSH_AUTH_SOCK HTTP_PROXY HTTPS_PROXY NO_PROXY

GIT_BIN="${REPO_HARNESS_GIT_BIN:-/usr/bin/git}"
BASH_BIN="${REPO_HARNESS_BASH_BIN:-/bin/bash}"
BUN_BIN="${REPO_HARNESS_BUN_BIN:-}"
WORKFLOW_STATE_LIB="${REPO_HARNESS_WORKFLOW_STATE_LIB:-.ai/hooks/lib/workflow-state.sh}"
[[ "$GIT_BIN" == /* && -x "$GIT_BIN" ]] || { echo "contract-worktree: trusted git executable is unavailable" >&2; exit 1; }
[[ "$BASH_BIN" == /* && -x "$BASH_BIN" ]] || { echo "contract-worktree: trusted bash executable is unavailable" >&2; exit 1; }
if [[ -n "$BUN_BIN" ]] && [[ "$WORKFLOW_STATE_LIB" != /* || ! -f "$WORKFLOW_STATE_LIB" || -L "$WORKFLOW_STATE_LIB" ]]; then
  echo "contract-worktree: trusted workflow-state library is unavailable" >&2
  exit 1
fi
git() { "$GIT_BIN" "$@"; }
bash() { "$BASH_BIN" "$@"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  REPO_ROOT="$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
cd "$REPO_ROOT"
export REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT"
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"

usage() {
  cat <<'USAGE_EOF'
Usage:
  repo-harness run contract-worktree start --plan <plan-file> [--path <worktree-path>] [--branch <branch-name>]
  repo-harness run contract-worktree finish [--merge|--no-merge] [--target <branch>] [--gate-base <ref>] [--message <commit-message>]
  repo-harness run contract-worktree cleanup --slug <slug> [--target <branch>] [--dry-run]
  repo-harness run contract-worktree status
USAGE_EOF
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

policy_get() {
  local jq_path="$1"
  local default_value="${2:-}"
  local value=""

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    value="$(jq -r "$jq_path // empty" ".ai/harness/policy.json" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

check_architecture_freshness() {
  local target_branch="$1"
  local mode

  if [[ -f "$helper_dir/check-architecture-sync.sh" ]]; then
    bash "$helper_dir/check-architecture-sync.sh" --target "$target_branch"
    return $?
  fi

  mode="$(policy_get '.architecture.freshness_gate' 'advisory')"
  if [[ "$mode" == "strict" ]]; then
    echo "contract-worktree: strict architecture freshness gate failed: missing packaged check-architecture-sync helper" >&2
    return 1
  fi

  echo "contract-worktree: WARN missing packaged check-architecture-sync helper; skipping advisory architecture freshness gate" >&2
  return 0
}

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

derive_slug_from_plan() {
  local plan_file="$1"
  local plan_base slug
  plan_base="$(basename "$plan_file")"
  slug="$(printf '%s' "$plan_base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  normalize_slug "${slug:-contract-task}"
}

derive_original_artifact_stem_from_plan() {
  local plan_file="$1"
  local plan_base stem
  plan_base="$(basename "$plan_file")"
  stem="$(printf '%s' "$plan_base" | sed -E 's/^plan-//; s/\.md$//')"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    printf '%s' "$stem"
  else
    derive_slug_from_plan "$plan_file"
  fi
}

derive_raw_slug_from_plan() {
  local plan_file="$1"
  local plan_base
  plan_base="$(basename "$plan_file")"
  printf '%s' "$plan_base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//'
}

is_transient_plan_slug() {
  case "$1" in
    think-plan-[0-9]*|codex-plan-[0-9]*|approved-plan-[0-9]*)
      return 0
      ;;
  esac
  return 1
}

derive_title_slug_from_plan() {
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
  slug="$(normalize_slug "$title")"
  [[ -n "$slug" ]] || return 1
  printf '%s' "$slug"
}

derive_artifact_stem_from_plan() {
  local plan_file="$1"
  local stem stamp slug title_slug
  stem="$(derive_original_artifact_stem_from_plan "$plan_file")"
  if [[ "$stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    slug="$(printf '%s' "$stem" | sed -E 's/^[0-9]{8}-[0-9]{4}-//')"
    if is_transient_plan_slug "$slug"; then
      title_slug="$(derive_title_slug_from_plan "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$stem"
  else
    derive_slug_from_plan "$plan_file"
  fi
}

is_linked_worktree() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  [[ "$git_dir" == *".git/worktrees/"* ]]
}

find_worktree_for_branch() {
  local branch="$1"
  git worktree list --porcelain | awk -v branch_ref="refs/heads/${branch}" '
    $1 == "worktree" { path = $2; next }
    $1 == "branch" && $2 == branch_ref { print path; exit }
  '
}

worktree_status_for_cleanup() {
  local worktree_path="$1"
  local allow_repair="${2:-0}"
  local status

  if status="$(git -C "$worktree_path" status --porcelain=v1 --untracked-files=all 2>/dev/null)"; then
    printf '%s' "$status"
    return 0
  fi

  if [[ "$allow_repair" -eq 1 ]]; then
    git worktree repair "$worktree_path" >/dev/null 2>&1 || true
    if status="$(git -C "$worktree_path" status --porcelain=v1 --untracked-files=all 2>/dev/null)"; then
      echo "[ContractWorktree] Repaired stale worktree gitdir: $worktree_path" >&2
      printf '%s' "$status"
      return 0
    fi
  fi

  return 1
}

default_worktree_path() {
  local slug="$1"
  local parent repo_name
  parent="$(dirname "$REPO_ROOT")"
  repo_name="$(basename "$REPO_ROOT")"
  printf '%s/%s-wt-%s' "$parent" "$repo_name" "$slug"
}

write_start_metadata() {
  local slug="$1"
  local plan_file="$2"
  local branch_name="$3"
  local worktree_path="$4"
  local base_branch="$5"
  local base_commit="$6"
  local metadata_dir=".ai/harness/worktrees"
  local metadata_file="${metadata_dir}/${slug}.json"

  mkdir -p "$metadata_dir"
  if [[ -f "$metadata_file" ]] && grep -Eq '"base_commit"[[:space:]]*:[[:space:]]*"[0-9a-f]{40,64}"' "$metadata_file"; then
    return 0
  fi
  cat > "$metadata_file" <<EOF_METADATA
{
  "slug": "$(json_escape "$slug")",
  "plan": "$(json_escape "$plan_file")",
  "branch": "$(json_escape "$branch_name")",
  "worktree": "$(json_escape "$worktree_path")",
  "source_repo": "$(json_escape "$REPO_ROOT")",
  "base_branch": "$(json_escape "$base_branch")",
  "base_commit": "$(json_escape "$base_commit")",
  "started_at": "$(date '+%Y-%m-%dT%H:%M:%S%z')"
}
EOF_METADATA
}

copy_plan_into_worktree() {
  local plan_file="$1"
  local worktree_path="$2"
  local target_plan="$worktree_path/$plan_file"

  mkdir -p "$(dirname "$target_plan")"
  cp "$plan_file" "$target_plan"
}

remove_copied_untracked_source_plan() {
  local plan_file="$1"
  local worktree_path="$2"

  if git ls-files --others --exclude-standard -- "$plan_file" | grep -Fxq "$plan_file" \
    && cmp -s "$plan_file" "$worktree_path/$plan_file"; then
    rm -f "$plan_file"
    echo "[ContractWorktree] Moved untracked source plan into contract worktree: $plan_file"
  fi
}

marker_points_to_plan() {
  local marker_file="$1"
  local plan_file="$2"
  local marker_plan

  [[ -f "$marker_file" ]] || return 1
  marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
  [[ "$marker_plan" == "$plan_file" || "$marker_plan" == "./$plan_file" ]]
}

clear_primary_markers_for_transferred_plan() {
  local plan_file="$1"

  if marker_points_to_plan "$ACTIVE_PLAN_MARKER" "$plan_file"; then
    rm -f "$ACTIVE_PLAN_MARKER" "$ACTIVE_WORKTREE_MARKER"
    echo "[ContractWorktree] Cleared primary active markers for transferred plan: $plan_file"
  fi
}

start_worktree() {
  local plan_file=""
  local worktree_path=""
  local branch_name=""
  local run_plan_to_todo=1

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --plan)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --plan requires a value" >&2; exit 2; }
        plan_file="${2#./}"
        shift 2
        ;;
      --path)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --path requires a value" >&2; exit 2; }
        worktree_path="$2"
        shift 2
        ;;
      --branch)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --branch requires a value" >&2; exit 2; }
        branch_name="$2"
        shift 2
        ;;
      --no-plan-to-todo)
        run_plan_to_todo=0
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "contract-worktree: unknown start argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done

  [[ -n "$plan_file" ]] || { echo "contract-worktree: start requires --plan" >&2; exit 2; }
  [[ -f "$plan_file" ]] || { echo "contract-worktree: plan file not found: $plan_file" >&2; exit 2; }

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "contract-worktree: not inside a git repository" >&2
    exit 2
  fi

  if is_linked_worktree; then
    echo "[ContractWorktree] Already in a linked worktree: $REPO_ROOT"
    return 0
  fi

  local slug branch_prefix base_branch existing_worktree base_commit source_commit new_branch=0
  slug="$(derive_slug_from_plan "$plan_file")"
  branch_prefix="$(policy_get '.worktree_strategy.branch_prefix' 'codex/')"
  base_branch="$(policy_get '.worktree_strategy.base_branch' 'main')"
  source_commit="$(git rev-parse HEAD)"
  branch_name="${branch_name:-${branch_prefix}${slug}}"
  worktree_path="${worktree_path:-$(default_worktree_path "$slug")}"

  existing_worktree="$(find_worktree_for_branch "$branch_name" || true)"
  if [[ -n "$existing_worktree" ]]; then
    worktree_path="$existing_worktree"
    echo "[ContractWorktree] Reusing existing worktree: $worktree_path"
  elif git show-ref --verify --quiet "refs/heads/$branch_name"; then
    git worktree add "$worktree_path" "$branch_name"
    echo "[ContractWorktree] Added worktree for existing branch: $worktree_path"
  else
    git worktree add "$worktree_path" -b "$branch_name" HEAD
    new_branch=1
    echo "[ContractWorktree] Created worktree: $worktree_path"
  fi

  copy_plan_into_worktree "$plan_file" "$worktree_path"
  remove_copied_untracked_source_plan "$plan_file" "$worktree_path"
  clear_primary_markers_for_transferred_plan "$plan_file"
  if [[ "$new_branch" -eq 1 ]]; then
    base_commit="$source_commit"
  else
    base_commit="$(git -C "$worktree_path" merge-base HEAD "$base_branch" 2>/dev/null || git -C "$worktree_path" rev-parse HEAD)"
  fi

  mkdir -p "$worktree_path/.ai/harness/worktrees"
  (
    cd "$worktree_path"
    write_start_metadata "$slug" "$plan_file" "$branch_name" "$worktree_path" "$base_branch" "$base_commit"
    if [[ "$run_plan_to_todo" -eq 1 && -f "$helper_dir/plan-to-todo.sh" ]]; then
      REPO_HARNESS_TARGET_REPO_ROOT="$worktree_path" REPO_HARNESS_CONTRACT_WORKTREE=1 bash "$helper_dir/plan-to-todo.sh" --plan "$plan_file"
    fi
  )

  echo "[ContractWorktree] Branch: $branch_name"
  echo "[ContractWorktree] Plan: $worktree_path/$plan_file"
}

status_worktree() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[ContractWorktree] Not in a git repository"
    return 0
  fi

  if is_linked_worktree; then
    echo "[ContractWorktree] linked worktree"
  else
    echo "[ContractWorktree] primary worktree"
  fi

  echo "branch: $(git branch --show-current 2>/dev/null || true)"
  echo "root: $REPO_ROOT"
}

is_local_runtime_marker_path() {
  case "$1" in
    .ai/harness/active-plan|.ai/harness/active-worktree)
      return 0
      ;;
  esac
  return 1
}

check_scope_against_contract() {
  local contract_file="$1"
  local changed_paths path blocked=0

  [[ -f "$contract_file" ]] || return 0
  if [[ ! -f "$WORKFLOW_STATE_LIB" ]]; then
    return 0
  fi

  # shellcheck source=/dev/null
  . "$WORKFLOW_STATE_LIB"

  changed_paths="$(
    {
      git -c core.quotePath=false diff --name-only
      git -c core.quotePath=false diff --cached --name-only
      git -c core.quotePath=false ls-files --others --exclude-standard
    } | awk 'NF && !seen[$0]++'
  )"

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if is_local_runtime_marker_path "$path"; then
      continue
    fi
    if ! workflow_contract_allows_path "$contract_file" "$path"; then
      echo "[ContractWorktree] Changed path is outside active contract allowed_paths: $path" >&2
      blocked=1
    fi
  done <<< "$changed_paths"

  [[ "$blocked" -eq 0 ]]
}

clean_local_runtime_markers() {
  rm -f .ai/harness/active-plan .ai/harness/active-worktree
}

finish_transaction_dir=""
finish_transaction_active=0
finish_transaction_original_head=""
finish_transaction_paths=()
finish_transaction_existed=()

finish_transaction_snapshot() {
  local path="$1"
  local index="${#finish_transaction_paths[@]}"
  finish_transaction_paths+=("$path")
  if [[ -e "$path" || -L "$path" ]]; then
    finish_transaction_existed+=("1")
    mkdir -p "$finish_transaction_dir/$index"
    cp -Rp "$path" "$finish_transaction_dir/$index/value"
  else
    finish_transaction_existed+=("0")
  fi
}

finish_transaction_begin() {
  finish_transaction_dir="$(mktemp -d)"
  finish_transaction_active=1
  finish_transaction_original_head="$(git rev-parse HEAD)"
  finish_transaction_paths=()
  finish_transaction_existed=()
  trap finish_transaction_on_exit EXIT
  finish_transaction_snapshot "plans"
  finish_transaction_snapshot "tasks"
  finish_transaction_snapshot ".ai/harness/active-plan"
  finish_transaction_snapshot ".ai/harness/active-worktree"
  finish_transaction_snapshot ".ai/harness/sprint"
  finish_transaction_snapshot ".claude/.plan-state"
}

finish_transaction_abort() {
  local index path
  if [[ -n "$finish_transaction_original_head" ]] && [[ "$(git rev-parse HEAD)" != "$finish_transaction_original_head" ]]; then
    git reset --mixed "$finish_transaction_original_head"
  fi
  for ((index = ${#finish_transaction_paths[@]} - 1; index >= 0; index--)); do
    path="${finish_transaction_paths[$index]}"
    rm -rf "$path"
    if [[ "${finish_transaction_existed[$index]}" == "1" ]]; then
      mkdir -p "$(dirname "$path")"
      cp -Rp "$finish_transaction_dir/$index/value" "$path"
    fi
  done
  rm -rf "$finish_transaction_dir"
  finish_transaction_dir=""
  finish_transaction_active=0
  finish_transaction_original_head=""
  trap - EXIT
  echo "contract-worktree: finish failed; restored live workflow artifacts and the pre-finish branch" >&2
}

finish_transaction_commit() {
  finish_transaction_active=0
  trap - EXIT
  rm -rf "$finish_transaction_dir"
  finish_transaction_dir=""
  finish_transaction_original_head=""
}

finish_transaction_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$finish_transaction_active" -eq 1 && "$status" -ne 0 ]]; then
    finish_transaction_abort || status=1
  fi
  exit "$status"
}

latest_plan_for_slug() {
  local slug="$1"
  local latest
  latest="$(find plans -maxdepth 1 -type f -name "plan-*-${slug}.md" 2>/dev/null | sort | tail -1)"
  [[ -n "$latest" ]] || return 1
  printf '%s' "$latest"
}

archive_finished_workflow() {
  local plan_file="$1" timestamp="$2" timestamp_human="$3" parent_run_id="$4"

  [[ -n "$plan_file" ]] || { echo "contract-worktree: no active plan found to archive" >&2; exit 1; }
  [[ -f "$plan_file" ]] || { echo "contract-worktree: active plan not found for archive: $plan_file" >&2; exit 1; }
  [[ -n "$timestamp" ]] || { echo "contract-worktree: no timestamp provided for archive" >&2; exit 1; }
  [[ -x "$helper_dir/archive-workflow.sh" ]] || { echo "contract-worktree: archive-workflow helper is missing or not executable" >&2; exit 1; }

  echo "[ContractWorktree] Archiving completed workflow before merge: $plan_file"
  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" bash "$helper_dir/archive-workflow.sh" \
    --plan "$plan_file" --outcome Completed --timestamp "$timestamp" \
    --timestamp-human "$timestamp_human" --parent-run-id "$parent_run_id"
}

predict_post_freeze_manifest() {
  local plan_file="$1" timestamp="$2" timestamp_human="$3" parent_run_id="$4" output="$5"
  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" bash "$helper_dir/archive-workflow.sh" \
    --plan "$plan_file" --outcome Completed --timestamp "$timestamp" \
    --timestamp-human "$timestamp_human" --parent-run-id "$parent_run_id" \
    --predict-manifest "$output"
}


# Post-freeze allowlist: the exact repo-relative paths finish's own lifecycle step
# (archive + local-marker cleanup + sprint backfill) is expected to touch after the
# merge gate reviews frozen candidate F. Computed BEFORE archiving so the gate can
# bind the allowlist to F. The archive-family timestamp is supplied by the caller
# (a single `date` call in finish_worktree, shared with archive_finished_workflow's
# own --timestamp argument below) rather than computed here, so the allowlist
# prediction and archive-workflow.sh's actual output cannot disagree across a
# minute boundary. Under-enumeration must fail closed at verify time, never
# silently pass -- so this only ever predicts exact paths, never a directory or
# wildcard.
compute_post_freeze_allowlist() {
  local plan_file="$1" contract_file="$2" review_file="$3" timestamp="$4"
  local plan_base raw_slug artifact_stem notes_file source_ref sprint_path
  local -a paths=()

  plan_base="$(basename "$plan_file")"
  raw_slug="$(derive_raw_slug_from_plan "$plan_file")"
  artifact_stem="$(derive_artifact_stem_from_plan "$plan_file")"

  paths+=("plans/${plan_base}")
  paths+=("plans/archive/${plan_base}")
  paths+=("$contract_file")
  paths+=("$review_file")
  paths+=("tasks/current.md")
  paths+=("tasks/todos.md")
  # clean_local_runtime_markers deletes these two unconditionally. They are
  # gitignored in a normal install (never appear in a diff, so listing them here
  # is a no-op), but a repo/fixture that tracks them still needs the allowlist
  # entry for the delete to verify.
  paths+=(".ai/harness/active-plan")
  paths+=(".ai/harness/active-worktree")

  notes_file="tasks/notes/${artifact_stem}.notes.md"
  if [[ ! -f "$notes_file" && -f "tasks/notes/${raw_slug}.notes.md" ]]; then
    notes_file="tasks/notes/${raw_slug}.notes.md"
  fi

  paths+=("tasks/archive/contract-${timestamp}-${raw_slug}.md")
  paths+=("tasks/archive/review-${timestamp}-${raw_slug}.md")
  if [[ -f "$notes_file" ]]; then
    paths+=("$notes_file")
    paths+=("tasks/archive/notes-${timestamp}-${raw_slug}.md")
  fi
  if [[ -f tasks/todos.md ]] && grep -q '[^[:space:]]' tasks/todos.md; then
    paths+=("tasks/archive/todo-${timestamp}-${raw_slug}.md")
  fi

  source_ref="$(awk '/^> \*\*Source Ref\*\*:/ {sub(/^> \*\*Source Ref\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$plan_file" 2>/dev/null | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  case "$source_ref" in
    sprint:*#*)
      sprint_path="${source_ref#sprint:}"
      sprint_path="${sprint_path%%#*}"
      paths+=("$sprint_path")
      ;;
  esac

  printf '%s\n' "${paths[@]}" | awk 'NF && !seen[$0]++'
}

run_merge_gate() {
  local base_ref="$1" manifest_file="$2"
  shift 2
  local -a allow_args=() destination_args=()
  local allow_path destination_path destination_sha extra
  for allow_path in "$@"; do
    allow_args+=(--allow-post-freeze "$allow_path")
  done
  while IFS=$'\t' read -r destination_path destination_sha extra; do
    [[ -n "$destination_path" && -n "$destination_sha" && -z "$extra" ]] || {
      echo "contract-worktree: invalid post-freeze destination manifest row" >&2
      exit 1
    }
    destination_args+=(--expect-post-freeze-destination "${destination_path}=${destination_sha}")
  done < "$manifest_file"
  [[ -f "$helper_dir/merge-gate.ts" ]] || {
    echo "contract-worktree: merge-gate helper is missing: $helper_dir/merge-gate.ts" >&2
    exit 1
  }
  [[ "$BUN_BIN" == /* && -x "$BUN_BIN" ]] || {
    echo "contract-worktree: merge gate requires the trusted Bun runtime injected by repo-harness run" >&2
    exit 1
  }
  echo "[ContractWorktree] Sealing the exact local candidate against $base_ref" >&2
  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" "$BUN_BIN" "$helper_dir/merge-gate.ts" run --base "$base_ref" "${allow_args[@]}" "${destination_args[@]}" --format sha
}

verify_merge_gate_seal() {
  local base_ref="$1"
  echo "[ContractWorktree] Revalidating local merge seal against $base_ref" >&2
  [[ "$BUN_BIN" == /* && -x "$BUN_BIN" ]] || {
    echo "contract-worktree: merge gate requires the trusted Bun runtime injected by repo-harness run" >&2
    exit 1
  }
  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" "$BUN_BIN" "$helper_dir/merge-gate.ts" verify --base "$base_ref" --format sha
}

verify_acceptance_receipt() {
  local contract_file="$1"
  [[ -f "$helper_dir/acceptance-receipt.ts" ]] || {
    echo "contract-worktree: AcceptanceReceipt helper is missing: $helper_dir/acceptance-receipt.ts" >&2
    exit 1
  }
  [[ "$BUN_BIN" == /* && -x "$BUN_BIN" ]] || {
    echo "contract-worktree: AcceptanceReceipt requires the trusted Bun runtime injected by repo-harness run" >&2
    exit 1
  }
  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" "$BUN_BIN" "$helper_dir/acceptance-receipt.ts" verify \
    --contract "$contract_file" --verification ".ai/harness/checks/latest.json" >/dev/null
}

refresh_and_freeze_base() {
  local base_ref="$1" target_branch="$2" remote="" branch=""
  case "$base_ref" in
    refs/remotes/*/*)
      remote="${base_ref#refs/remotes/}"
      branch="${remote#*/}"
      remote="${remote%%/*}"
      git fetch --no-tags "$remote" "+refs/heads/$branch:$base_ref" >/dev/null
      ;;
    "$target_branch")
      if git remote get-url origin >/dev/null 2>&1; then
        git fetch --no-tags origin "+refs/heads/$target_branch:refs/remotes/origin/$target_branch" >/dev/null
        if [[ "$(git rev-parse "$target_branch^{commit}")" != "$(git rev-parse "refs/remotes/origin/$target_branch^{commit}")" ]]; then
          echo "contract-worktree: local $target_branch is not synchronized with origin/$target_branch" >&2
          return 1
        fi
      fi
      ;;
  esac
  git rev-parse "$base_ref^{commit}"
}

finish_worktree() {
  local merge_back=1
  local target_branch
  local gate_base_ref
  local gate_base_explicit=0
  local commit_message=""

  target_branch="$(policy_get '.worktree_strategy.merge_back.target' 'main')"
  gate_base_ref=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --merge)
        merge_back=1
        shift
        ;;
      --no-merge)
        merge_back=0
        shift
        ;;
      --target)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --target requires a value" >&2; exit 2; }
        target_branch="$2"
        shift 2
        ;;
      --gate-base)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --gate-base requires a value" >&2; exit 2; }
        gate_base_ref="$2"
        gate_base_explicit=1
        shift 2
        ;;
      --message|-m)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --message requires a value" >&2; exit 2; }
        commit_message="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "contract-worktree: unknown finish argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done
  gate_base_ref="${gate_base_ref:-$target_branch}"
  if [[ "$merge_back" -eq 1 && "$gate_base_ref" != "$target_branch" ]]; then
    echo "contract-worktree: local merge gate base must equal target branch $target_branch" >&2
    exit 2
  fi

  if ! is_linked_worktree; then
    echo "contract-worktree: finish must run from the linked contract worktree" >&2
    exit 1
  fi

  local current_branch slug active_plan contract_file review_file target_worktree artifact_stem
  local frozen_base_sha
  current_branch="$(git branch --show-current)"
  [[ -n "$current_branch" ]] || { echo "contract-worktree: detached HEAD is not supported" >&2; exit 1; }
  [[ "$current_branch" != "$target_branch" ]] || { echo "contract-worktree: already on target branch $target_branch" >&2; exit 1; }
  slug="$(normalize_slug "${current_branch##*/}")"
  commit_message="${commit_message:-feat(contract): complete ${slug}}"

  if [[ -f "$WORKFLOW_STATE_LIB" ]]; then
    # shellcheck source=/dev/null
    . "$WORKFLOW_STATE_LIB"
    active_plan="$(get_active_plan || true)"
    if [[ -n "$active_plan" ]]; then
      contract_file="$(workflow_active_contract || true)"
      review_file="$(workflow_active_review || true)"
    fi
  fi

  if [[ -z "${active_plan:-}" ]]; then
    active_plan="$(latest_plan_for_slug "$slug" || true)"
  fi
  if [[ -n "${active_plan:-}" && -z "${contract_file:-}" ]]; then
    artifact_stem="$(derive_artifact_stem_from_plan "$active_plan")"
    if [[ -f "tasks/contracts/${artifact_stem}.contract.md" ]] || [[ ! -f "tasks/contracts/${slug}.contract.md" ]]; then
      contract_file="tasks/contracts/${artifact_stem}.contract.md"
    fi
  fi
  if [[ -n "${active_plan:-}" && -z "${review_file:-}" ]]; then
    artifact_stem="${artifact_stem:-$(derive_artifact_stem_from_plan "$active_plan")}"
    if [[ -f "tasks/reviews/${artifact_stem}.review.md" ]] || [[ ! -f "tasks/reviews/${slug}.review.md" ]]; then
      review_file="tasks/reviews/${artifact_stem}.review.md"
    fi
  fi
  contract_file="${contract_file:-tasks/contracts/${slug}.contract.md}"
  review_file="${review_file:-tasks/reviews/${slug}.review.md}"

  [[ -n "$contract_file" && -f "$contract_file" ]] || { echo "contract-worktree: no active sprint contract found" >&2; exit 1; }
  [[ -n "$review_file" && -f "$review_file" ]] || { echo "contract-worktree: no active sprint review found" >&2; exit 1; }

  frozen_base_sha="$(refresh_and_freeze_base "$gate_base_ref" "$target_branch")"
  verify_acceptance_receipt "$contract_file"
  check_architecture_freshness "$target_branch"
  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" bash "$helper_dir/verify-sprint.sh"
  [[ "$(git rev-parse "$gate_base_ref^{commit}")" == "$frozen_base_sha" ]] || {
    echo "contract-worktree: target base moved during final verification; restart closeout from the refreshed base" >&2
    exit 1
  }
  check_scope_against_contract "$contract_file"
  if [[ "$merge_back" -eq 1 ]]; then
    target_worktree="$(find_worktree_for_branch "$target_branch" || true)"
    [[ -n "$target_worktree" ]] || { echo "contract-worktree: target branch has no checked-out worktree: $target_branch" >&2; exit 1; }
    if [[ -n "$(git -C "$target_worktree" status --porcelain=v1 --untracked-files=all)" ]]; then
      echo "contract-worktree: target worktree is dirty, refusing merge: $target_worktree" >&2
      exit 1
    fi
  fi
  finish_transaction_begin

  # Step 1/2: freeze the implementation candidate F before any lifecycle mutation
  # touches it. If there is nothing outstanding to commit, F is simply the current
  # HEAD (which may itself already be the branch's tip from a prior finish attempt).
  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "$commit_message"
  else
    echo "[ContractWorktree] No tracked changes to commit."
  fi

  local run_gate=0
  if [[ "$merge_back" -eq 1 || "$gate_base_explicit" -eq 1 ]]; then
    run_gate=1
  fi

  local verified_sha current_head
  # Single timestamp authority: one `date` call for this whole finish run, shared
  # by the post-freeze allowlist prediction (Step 3, when a gate runs) and the
  # archive step's actual output (Step 4, unconditional), so the two cannot
  # disagree across a minute boundary.
  local finish_timestamp finish_timestamp_human finish_parent_run_id
  finish_timestamp="$(date +%Y%m%d-%H%M)"
  finish_timestamp_human="$(date '+%Y-%m-%d %H:%M')"
  finish_parent_run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${finish_timestamp}}}}"
  if [[ "$run_gate" -eq 1 ]]; then
    # Step 3: review F while the goal plan is still live at its pre-archive path,
    # binding the receipt to F plus the exact set of paths the lifecycle step below
    # is expected to touch.
    local -a post_freeze_allowlist=()
    local allow_path
    while IFS= read -r allow_path; do
      [[ -n "$allow_path" ]] && post_freeze_allowlist+=("$allow_path")
    done < <(compute_post_freeze_allowlist "$active_plan" "$contract_file" "$review_file" "$finish_timestamp")

    local post_freeze_manifest
    post_freeze_manifest="$(mktemp)"
    if ! predict_post_freeze_manifest "$active_plan" "$finish_timestamp" "$finish_timestamp_human" "$finish_parent_run_id" "$post_freeze_manifest"; then
      rm -f "$post_freeze_manifest"
      finish_transaction_abort
      return 1
    fi
    if ! verified_sha="$(run_merge_gate "$gate_base_ref" "$post_freeze_manifest" "${post_freeze_allowlist[@]}")"; then
      rm -f "$post_freeze_manifest"
      finish_transaction_abort
      return 1
    fi
    rm -f "$post_freeze_manifest"
    current_head="$(git rev-parse HEAD)"
    if [[ "$verified_sha" != "$current_head" ]]; then
      echo "contract-worktree: merge gate verified $verified_sha but branch HEAD is $current_head" >&2
      finish_transaction_abort
      return 1
    fi
  fi

  # Step 4: lifecycle mutation now that the gate (if any) has already reviewed F.
  if ! archive_finished_workflow "$active_plan" "$finish_timestamp" "$finish_timestamp_human" "$finish_parent_run_id"; then
    finish_transaction_abort
    return 1
  fi
  if ! clean_local_runtime_markers; then
    finish_transaction_abort
    return 1
  fi
  if ! backfill_sprint_backlog "$active_plan"; then
    finish_transaction_abort
    return 1
  fi

  # Step 5: lifecycle changes land as a separate, deterministic commit L. If
  # archiving produced no tracked change, L is simply F.
  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "chore(workflow): archive ${slug} closeout"
  else
    echo "[ContractWorktree] No lifecycle changes to commit."
  fi

  # Step 6: no gate ran at all (plain --no-merge) -- nothing further to verify.
  if [[ "$run_gate" -eq 0 ]]; then
    finish_transaction_commit
    echo "[ContractWorktree] Merge skipped by --no-merge."
    return 0
  fi

  if [[ "$merge_back" -eq 0 ]]; then
    # A gate ran against F above; verify the receipt against the post-lifecycle
    # HEAD (L) before this transaction is allowed to commit, so an
    # out-of-allowlist lifecycle mutation (or any other post-freeze drift) is
    # caught and rolled back here instead of being handed to the caller as a
    # silently-unverified success.
    if ! verified_sha="$(verify_merge_gate_seal "$gate_base_ref")"; then
      finish_transaction_abort
      return 1
    fi
    current_head="$(git rev-parse HEAD)"
    if [[ "$verified_sha" != "$current_head" ]]; then
      echo "contract-worktree: merge gate receipt does not verify against post-archive HEAD $current_head (got $verified_sha)" >&2
      finish_transaction_abort
      return 1
    fi
    finish_transaction_commit
    echo "[ContractWorktree] Merge skipped by --no-merge."
    return 0
  fi

  # Step 7: re-validate the receipt against L (F plus only allowlisted drift) before
  # the fast-forward merge; ff-merge uses the SHA this verify prints.
  if [[ -n "$(git -C "$target_worktree" status --porcelain=v1 --untracked-files=all)" ]]; then
    echo "contract-worktree: target worktree is dirty, refusing merge: $target_worktree" >&2
    exit 1
  fi

  verified_sha="$(verify_merge_gate_seal "$gate_base_ref")"
  current_head="$(git rev-parse "$current_branch^{commit}")"
  [[ "$verified_sha" == "$current_head" ]] || { echo "contract-worktree: branch moved after merge-gate review" >&2; exit 1; }
  git -C "$target_worktree" merge --ff-only "$verified_sha"
  finish_transaction_commit
  echo "[ContractWorktree] Merged $current_branch into $target_branch at $target_worktree"
}

# Plans captured via sprint-backlog start-task carry
# "> **Source Ref**: sprint:<file>#<task>". After the workflow archives,
# flip that backlog row so tracked program state cannot silently lag the
# completed contract.
backfill_sprint_backlog() {
  local plan_file="$1"
  local archived_plan source_ref sprint_path task_ref

  [[ -f "$helper_dir/sprint-backlog.sh" ]] || return 0

  archived_plan="plans/archive/$(basename "$plan_file")"
  if [[ ! -f "$archived_plan" ]]; then
    # Archive may have renamed on collision (-vN suffix); fall back to the
    # newest archived file sharing the stem, then to the original path.
    archived_plan="$(find plans/archive -maxdepth 1 -type f -name "$(basename "$plan_file" .md)*.md" 2>/dev/null | sort | tail -1)"
  fi
  [[ -n "$archived_plan" && -f "$archived_plan" ]] || archived_plan="$plan_file"
  if [[ ! -f "$archived_plan" ]]; then
    echo "[ContractWorktree] Warning: cannot resolve archived plan for sprint back-fill: $plan_file" >&2
    return 1
  fi

  source_ref="$(awk '/^> \*\*Source Ref\*\*:/ {sub(/^> \*\*Source Ref\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$archived_plan" 2>/dev/null | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  case "$source_ref" in
    sprint:*#*)
      ;;
    *)
      return 0
      ;;
  esac

  # Split on the FIRST '#': the sprint path is slug-generated and cannot
  # contain '#', while the task name is free text and may.
  sprint_path="${source_ref#sprint:}"
  task_ref="${sprint_path#*#}"
  sprint_path="${sprint_path%%#*}"

  if REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" bash "$helper_dir/sprint-backlog.sh" complete-task --sprint "$sprint_path" --task "$task_ref" --plan "$archived_plan"; then
    echo "[ContractWorktree] Sprint backlog updated: $sprint_path ($task_ref)"
  else
    echo "[ContractWorktree] Sprint backlog back-fill failed for $sprint_path ($task_ref); finish is incomplete." >&2
    return 1
  fi
  return 0
}

cleanup_worktree() {
  local slug=""
  local target_branch
  local dry_run=0

  target_branch="$(policy_get '.worktree_strategy.merge_back.target' 'main')"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --slug)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --slug requires a value" >&2; exit 2; }
        slug="$2"
        shift 2
        ;;
      --target)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --target requires a value" >&2; exit 2; }
        target_branch="$2"
        shift 2
        ;;
      --dry-run)
        dry_run=1
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "contract-worktree: unknown cleanup argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done

  [[ -n "$slug" ]] || { echo "contract-worktree: cleanup requires --slug" >&2; exit 2; }
  slug="${slug#codex/}"
  slug="$(normalize_slug "$slug")"
  [[ -n "$slug" ]] || { echo "contract-worktree: slug is empty after normalization" >&2; exit 2; }

  if is_linked_worktree; then
    echo "contract-worktree: cleanup must run from the target primary worktree, not a linked contract worktree" >&2
    exit 1
  fi

  local target_worktree current_root branch_prefix branch_name worktree_path metadata_file
  local worktree_status repair_needed=0
  branch_prefix="$(policy_get '.worktree_strategy.branch_prefix' 'codex/')"
  branch_name="${branch_prefix}${slug}"
  metadata_file=".ai/harness/worktrees/${slug}.json"
  target_worktree="$(find_worktree_for_branch "$target_branch" || true)"
  [[ -n "$target_worktree" ]] || { echo "contract-worktree: target branch has no checked-out worktree: $target_branch" >&2; exit 1; }

  current_root="$(pwd -P)"
  target_worktree="$(cd "$target_worktree" && pwd -P)"
  if [[ "$current_root" != "$target_worktree" ]]; then
    echo "contract-worktree: cleanup must run from target worktree $target_worktree" >&2
    exit 1
  fi

  worktree_path="$(find_worktree_for_branch "$branch_name" || true)"
  if [[ -n "$worktree_path" ]]; then
    worktree_path="$(cd "$worktree_path" && pwd -P)"
    case "$current_root" in
      "$worktree_path"|"$worktree_path"/*)
        echo "contract-worktree: refusing to remove current working directory: $worktree_path" >&2
        exit 1
        ;;
    esac
  fi

  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    if ! git merge-base --is-ancestor "$branch_name" "$target_branch" >/dev/null 2>&1; then
      echo "contract-worktree: branch $branch_name is not fully merged into $target_branch; refusing cleanup" >&2
      exit 1
    fi
  else
    echo "[ContractWorktree] Branch already absent, skipping: $branch_name"
  fi

  if [[ -n "$worktree_path" ]]; then
    if ! worktree_status="$(worktree_status_for_cleanup "$worktree_path" "$((1 - dry_run))")"; then
      if [[ "$dry_run" -eq 1 ]]; then
        repair_needed=1
      else
        echo "contract-worktree: linked worktree status unavailable after repair attempt, refusing cleanup: $worktree_path" >&2
        echo "contract-worktree: run git worktree repair '$worktree_path' and retry, or inspect the directory manually before removing it" >&2
        exit 1
      fi
    fi
    if [[ -n "$worktree_status" ]]; then
      echo "contract-worktree: linked worktree is dirty, refusing cleanup: $worktree_path" >&2
      echo "contract-worktree: pick/apply/commit useful changes first; scaffold-only discard belongs in repo-harness run ship-worktrees --cleanup-merged --discard-scaffold-only" >&2
      exit 1
    fi
  else
    echo "[ContractWorktree] Worktree already absent, skipping: $branch_name"
  fi

  if [[ "$dry_run" -eq 1 ]]; then
    echo "[ContractWorktree] dry-run cleanup slug=$slug target=$target_branch"
    if [[ "$repair_needed" -eq 1 ]]; then
      echo "[ContractWorktree] would repair stale worktree gitdir before dirty check: $worktree_path"
    fi
    echo "[ContractWorktree] would remove worktree: ${worktree_path:-"(absent)"}"
    echo "[ContractWorktree] would delete branch: $branch_name"
    echo "[ContractWorktree] would remove metadata: $metadata_file"
    return 0
  fi

  if [[ -n "$worktree_path" ]]; then
    git worktree remove "$worktree_path"
    echo "[ContractWorktree] Removed worktree: $worktree_path"
  fi

  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    git branch -d "$branch_name"
    echo "[ContractWorktree] Deleted branch: $branch_name"
  fi

  if [[ -e "$metadata_file" ]]; then
    rm -f "$metadata_file"
    echo "[ContractWorktree] Removed metadata: $metadata_file"
  else
    echo "[ContractWorktree] Metadata already absent, skipping: $metadata_file"
  fi
}

command_name="${1:-status}"
shift || true

case "$command_name" in
  start)
    start_worktree "$@"
    ;;
  finish)
    finish_worktree "$@"
    ;;
  cleanup)
    cleanup_worktree "$@"
    ;;
  status)
    status_worktree
    ;;
  --help|-h|help)
    usage
    ;;
  *)
    echo "contract-worktree: unknown command: $command_name" >&2
    usage
    exit 2
    ;;
esac
