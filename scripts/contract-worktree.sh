#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR/.." rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
cd "$REPO_ROOT"

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/contract-worktree.sh start --plan <plan-file> [--path <worktree-path>] [--branch <branch-name>]
  scripts/contract-worktree.sh finish [--merge|--no-merge] [--target <branch>] [--message <commit-message>]
  scripts/contract-worktree.sh status
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

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

derive_slug_from_plan() {
  local plan_file="$1"
  local plan_base slug
  plan_base="$(basename "$plan_file")"
  slug="$(printf '%s' "$plan_base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  normalize_slug "${slug:-contract-task}"
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
  local metadata_dir=".ai/harness/worktrees"
  local metadata_file="${metadata_dir}/${slug}.json"

  mkdir -p "$metadata_dir"
  cat > "$metadata_file" <<EOF_METADATA
{
  "slug": "$(json_escape "$slug")",
  "plan": "$(json_escape "$plan_file")",
  "branch": "$(json_escape "$branch_name")",
  "worktree": "$(json_escape "$worktree_path")",
  "source_repo": "$(json_escape "$REPO_ROOT")",
  "base_branch": "$(json_escape "$base_branch")",
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

  local slug branch_prefix base_branch existing_worktree
  slug="$(derive_slug_from_plan "$plan_file")"
  branch_prefix="$(policy_get '.worktree_strategy.branch_prefix' 'codex/')"
  base_branch="$(policy_get '.worktree_strategy.base_branch' 'main')"
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
    echo "[ContractWorktree] Created worktree: $worktree_path"
  fi

  copy_plan_into_worktree "$plan_file" "$worktree_path"
  remove_copied_untracked_source_plan "$plan_file" "$worktree_path"

  mkdir -p "$worktree_path/.ai/harness/worktrees"
  (
    cd "$worktree_path"
    write_start_metadata "$slug" "$plan_file" "$branch_name" "$worktree_path" "$base_branch"
    if [[ "$run_plan_to_todo" -eq 1 && -f "scripts/plan-to-todo.sh" ]]; then
      PROJECT_INITIALIZER_CONTRACT_WORKTREE=1 bash "scripts/plan-to-todo.sh" --plan "$plan_file"
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

check_scope_against_contract() {
  local contract_file="$1"
  local changed_paths path blocked=0

  [[ -f "$contract_file" ]] || return 0
  if [[ ! -f ".ai/hooks/lib/workflow-state.sh" ]]; then
    return 0
  fi

  # shellcheck source=/dev/null
  . ".ai/hooks/lib/workflow-state.sh"

  changed_paths="$(
    git status --porcelain=v1 --untracked-files=all \
      | awk '{
          path = substr($0, 4)
          rename_idx = index(path, " -> ")
          if (rename_idx > 0) {
            path = substr(path, rename_idx + 4)
          }
          print path
        }'
  )"

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if ! workflow_contract_allows_path "$contract_file" "$path"; then
      echo "[ContractWorktree] Changed path is outside active contract allowed_paths: $path" >&2
      blocked=1
    fi
  done <<< "$changed_paths"

  [[ "$blocked" -eq 0 ]]
}

clean_matching_untracked_target_files() {
  local target_worktree="$1"
  local source_branch="$2"
  local path tmp_file

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    tmp_file="$(mktemp)"
    if git -C "$target_worktree" show "${source_branch}:${path}" > "$tmp_file" 2>/dev/null \
      && cmp -s "$tmp_file" "$target_worktree/$path"; then
      rm -f "$target_worktree/$path"
      echo "[ContractWorktree] Removed matching untracked target file before merge: $path"
    fi
    rm -f "$tmp_file"
  done < <(git -C "$target_worktree" ls-files --others --exclude-standard)
}

clean_local_runtime_markers() {
  rm -f .ai/harness/active-plan .ai/harness/active-worktree .claude/.active-plan
}

finish_worktree() {
  local merge_back=1
  local target_branch
  local commit_message=""

  target_branch="$(policy_get '.worktree_strategy.merge_back.target' 'main')"

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

  if ! is_linked_worktree; then
    echo "contract-worktree: finish must run from the linked contract worktree" >&2
    exit 1
  fi

  local current_branch slug contract_file review_file target_worktree
  current_branch="$(git branch --show-current)"
  [[ -n "$current_branch" ]] || { echo "contract-worktree: detached HEAD is not supported" >&2; exit 1; }
  [[ "$current_branch" != "$target_branch" ]] || { echo "contract-worktree: already on target branch $target_branch" >&2; exit 1; }
  slug="$(normalize_slug "${current_branch##*/}")"
  commit_message="${commit_message:-feat(contract): complete ${slug}}"

  if [[ -f ".ai/hooks/lib/workflow-state.sh" ]]; then
    # shellcheck source=/dev/null
    . ".ai/hooks/lib/workflow-state.sh"
    contract_file="$(workflow_active_contract || true)"
    review_file="$(workflow_active_review || true)"
  else
    contract_file="tasks/contracts/${slug}.contract.md"
    review_file="tasks/reviews/${slug}.review.md"
  fi

  [[ -n "$contract_file" && -f "$contract_file" ]] || { echo "contract-worktree: no active sprint contract found" >&2; exit 1; }
  [[ -n "$review_file" && -f "$review_file" ]] || { echo "contract-worktree: no active sprint review found" >&2; exit 1; }

  bash "scripts/verify-sprint.sh"
  clean_local_runtime_markers
  check_scope_against_contract "$contract_file"

  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "$commit_message"
  else
    echo "[ContractWorktree] No tracked changes to commit."
  fi

  if [[ "$merge_back" -eq 0 ]]; then
    echo "[ContractWorktree] Merge skipped by --no-merge."
    return 0
  fi

  target_worktree="$(find_worktree_for_branch "$target_branch" || true)"
  [[ -n "$target_worktree" ]] || { echo "contract-worktree: target branch has no checked-out worktree: $target_branch" >&2; exit 1; }

  clean_matching_untracked_target_files "$target_worktree" "$current_branch"

  if [[ -n "$(git -C "$target_worktree" status --porcelain=v1 --untracked-files=all)" ]]; then
    echo "contract-worktree: target worktree is dirty, refusing merge: $target_worktree" >&2
    exit 1
  fi

  git -C "$target_worktree" merge --ff-only "$current_branch"
  echo "[ContractWorktree] Merged $current_branch into $target_branch at $target_worktree"
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
