#!/bin/bash
set -euo pipefail

unset GH_TOKEN GITHUB_TOKEN ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN SSH_AUTH_SOCK HTTP_PROXY HTTPS_PROXY NO_PROXY

GIT_BIN="${REPO_HARNESS_GIT_BIN:-/usr/bin/git}"
BASH_BIN="${REPO_HARNESS_BASH_BIN:-/bin/bash}"
BUN_BIN="${REPO_HARNESS_BUN_BIN:-}"
WORKFLOW_STATE_LIB="${REPO_HARNESS_WORKFLOW_STATE_LIB:-.ai/hooks/lib/workflow-state.sh}"
[[ "$GIT_BIN" == /* && -x "$GIT_BIN" ]] || { echo "ship-worktrees: trusted git executable is unavailable" >&2; exit 1; }
[[ "$BASH_BIN" == /* && -x "$BASH_BIN" ]] || { echo "ship-worktrees: trusted bash executable is unavailable" >&2; exit 1; }
if [[ -n "$BUN_BIN" ]] && [[ "$WORKFLOW_STATE_LIB" != /* || ! -f "$WORKFLOW_STATE_LIB" || -L "$WORKFLOW_STATE_LIB" ]]; then
  echo "ship-worktrees: trusted workflow-state library is unavailable" >&2
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
helper_dir="$(cd "$(dirname "${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}")" && pwd)"

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/ship-worktrees.sh [--target <branch>] [--remote <name>] [--slug <slug>] [--ready] [--dry-run]
  scripts/ship-worktrees.sh --local-merge [--target <branch>] [--slug <slug>] [--dry-run]
  scripts/ship-worktrees.sh --cleanup-merged [--target <branch>] [--slug <slug>] [--discard-scaffold-only] [--dry-run]

Default mode validates finished contract worktrees, commits them through
contract-worktree finish --no-merge, pushes their codex/* branches, and opens
draft PRs. It does not fast-forward main by default.
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

plan_slug_from_path() {
  local plan_file="$1"
  local base slug
  base="$(basename "$plan_file")"
  slug="$(printf '%s' "$base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
  normalize_slug "${slug:-contract-task}"
}

is_linked_worktree() {
  local git_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null || true)"
  [[ "$git_dir" == *".git/worktrees/"* ]]
}

current_branch() {
  git branch --show-current 2>/dev/null || true
}

load_workflow_state() {
  if [[ -f "$WORKFLOW_STATE_LIB" ]]; then
    # shellcheck source=/dev/null
    . "$WORKFLOW_STATE_LIB"
  fi
}

run_cmd() {
  echo "[Ship] $*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  "$@"
}

fail() {
  echo "ship-worktrees: $*" >&2
  exit 1
}

ship_transaction_dir=""
ship_transaction_active=0
ship_transaction_original_head=""
ship_transaction_paths=()
ship_transaction_existed=()

ship_transaction_snapshot() {
  local path="$1"
  local index="${#ship_transaction_paths[@]}"
  ship_transaction_paths+=("$path")
  if [[ -e "$path" || -L "$path" ]]; then
    ship_transaction_existed+=("1")
    mkdir -p "$ship_transaction_dir/$index"
    cp -Rp "$path" "$ship_transaction_dir/$index/value"
  else
    ship_transaction_existed+=("0")
  fi
}

ship_transaction_begin() {
  [[ "$DRY_RUN" -eq 0 ]] || return 0
  ship_transaction_dir="$(mktemp -d)"
  ship_transaction_active=1
  ship_transaction_original_head="$(git rev-parse HEAD)"
  ship_transaction_paths=()
  ship_transaction_existed=()
  trap ship_transaction_on_exit EXIT
  ship_transaction_snapshot "plans"
  ship_transaction_snapshot "tasks"
  ship_transaction_snapshot ".ai/harness/active-plan"
  ship_transaction_snapshot ".ai/harness/active-worktree"
  ship_transaction_snapshot ".ai/harness/sprint"
  ship_transaction_snapshot ".claude/.plan-state"
}

ship_transaction_abort() {
  local index path
  [[ "$ship_transaction_active" -eq 1 ]] || return 0
  if [[ -n "$ship_transaction_original_head" ]] && [[ "$(git rev-parse HEAD)" != "$ship_transaction_original_head" ]]; then
    git reset --mixed "$ship_transaction_original_head"
  fi
  for ((index = ${#ship_transaction_paths[@]} - 1; index >= 0; index--)); do
    path="${ship_transaction_paths[$index]}"
    rm -rf "$path"
    if [[ "${ship_transaction_existed[$index]}" == "1" ]]; then
      mkdir -p "$(dirname "$path")"
      cp -Rp "$ship_transaction_dir/$index/value" "$path"
    fi
  done
  rm -rf "$ship_transaction_dir"
  ship_transaction_dir=""
  ship_transaction_active=0
  ship_transaction_original_head=""
  trap - EXIT
  echo "ship-worktrees: ship failed; restored live workflow artifacts and the pre-ship branch" >&2
}

ship_transaction_commit() {
  [[ "$ship_transaction_active" -eq 1 ]] || return 0
  ship_transaction_active=0
  trap - EXIT
  rm -rf "$ship_transaction_dir"
  ship_transaction_dir=""
  ship_transaction_original_head=""
}

ship_transaction_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$ship_transaction_active" -eq 1 && "$status" -ne 0 ]]; then
    ship_transaction_abort || status=1
  fi
  exit "$status"
}

list_contract_worktrees() {
  local branch_prefix="$1"
  git worktree list --porcelain | awk -v prefix="refs/heads/${branch_prefix}" '
    $1 == "worktree" { path = $2; next }
    $1 == "branch" && index($2, prefix) == 1 {
      branch = $2
      sub(/^refs\/heads\//, "", branch)
      print branch "\t" path
    }
  '
}

dirty_paths_for_worktree() {
  local worktree="$1"
  {
    git -C "$worktree" diff --name-only
    git -C "$worktree" diff --cached --name-only
    git -C "$worktree" ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
}

ensure_worktree_status_for_cleanup() {
  local worktree="$1"

  if git -C "$worktree" status --porcelain=v1 --untracked-files=all >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[Ship] would repair stale worktree gitdir before dirty check: $worktree"
    return 1
  fi

  git worktree repair "$worktree" >/dev/null 2>&1 || true
  if git -C "$worktree" status --porcelain=v1 --untracked-files=all >/dev/null 2>&1; then
    echo "[Ship] Repaired stale worktree gitdir: $worktree" >&2
    return 0
  fi

  fail "linked worktree status unavailable after repair attempt: $worktree"
}

is_scaffold_path() {
  local path="$1"
  case "$path" in
    tasks/todos.md|plans/plan-*.md|tasks/contracts/*.contract.md|tasks/reviews/*.review.md|tasks/notes/*.notes.md|.ai/harness/active-plan|.ai/harness/active-worktree|.ai/harness/worktrees/*.json)
      return 0
      ;;
  esac
  return 1
}

non_scaffold_dirty_paths() {
  local worktree="$1" path
  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    is_scaffold_path "$path" || printf '%s\n' "$path"
  done < <(dirty_paths_for_worktree "$worktree")
}

print_dirty_paths() {
  local worktree="$1"
  dirty_paths_for_worktree "$worktree" | sed 's/^/  - /' >&2
}

fail_dirty_merged_worktree() {
  local branch="$1" path="$2" non_scaffold
  echo "ship-worktrees: dirty merged linked worktree: $branch at $path" >&2
  echo "ship-worktrees: branch ancestry only proves committed changes are in $TARGET_BRANCH; these worktree changes are still outside $TARGET_BRANCH." >&2
  echo "ship-worktrees: pick/apply/commit useful changes before cleanup; do not use tgz, reset --hard, git clean, or stash as closeout." >&2
  echo "ship-worktrees: dirty paths:" >&2
  print_dirty_paths "$path"

  non_scaffold="$(non_scaffold_dirty_paths "$path")"
  if [[ -z "$non_scaffold" ]]; then
    echo "ship-worktrees: if these are generated plan/contract/review/notes scaffold only, rerun with --discard-scaffold-only." >&2
  else
    echo "ship-worktrees: --discard-scaffold-only is blocked by non-scaffold paths:" >&2
    printf '%s\n' "$non_scaffold" | sed 's/^/  - /' >&2
  fi
  return 1
}

discard_scaffold_dirty_paths() {
  local worktree="$1" path
  local tracked_paths=()
  local untracked_paths=()

  while IFS= read -r path; do
    [[ -n "$path" ]] || continue
    if git -C "$worktree" ls-files --error-unmatch -- "$path" >/dev/null 2>&1; then
      tracked_paths+=("$path")
    else
      untracked_paths+=("$path")
    fi
  done < <(dirty_paths_for_worktree "$worktree")

  if [[ "${#tracked_paths[@]}" -gt 0 ]]; then
    run_cmd git -C "$worktree" reset -- "${tracked_paths[@]}"
    run_cmd git -C "$worktree" checkout -- "${tracked_paths[@]}"
  fi

  for path in "${untracked_paths[@]}"; do
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[Ship] would remove scaffold file: $worktree/$path"
    else
      rm -f "$worktree/$path"
    fi
  done

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[Ship] Would discard scaffold-only changes in $worktree"
  else
    echo "[Ship] Discarded scaffold-only changes in $worktree"
  fi
}

guard_dirty_merged_worktree() {
  local branch="$1" path="$2" non_scaffold
  [[ -z "$(git -C "$path" status --porcelain=v1 --untracked-files=all)" ]] && return 0

  if [[ "$DISCARD_SCAFFOLD_ONLY" -eq 0 ]]; then
    fail_dirty_merged_worktree "$branch" "$path"
    return 1
  fi

  non_scaffold="$(non_scaffold_dirty_paths "$path")"
  if [[ -n "$non_scaffold" ]]; then
    echo "ship-worktrees: refusing --discard-scaffold-only for dirty merged linked worktree with non-scaffold paths: $branch at $path" >&2
    printf '%s\n' "$non_scaffold" | sed 's/^/  - /' >&2
    return 1
  fi

  discard_scaffold_dirty_paths "$path"
}

active_plan_or_empty() {
  local active_plan=""
  if declare -F get_active_plan >/dev/null 2>&1; then
    active_plan="$(get_active_plan 2>/dev/null || true)"
  elif [[ -f ".ai/harness/active-plan" ]]; then
    active_plan="$(cat ".ai/harness/active-plan" 2>/dev/null | xargs)"
  fi
  printf '%s' "$active_plan"
}

active_slug_or_empty() {
  local active_plan
  active_plan="$(active_plan_or_empty)"
  [[ -n "$active_plan" ]] || return 0
  plan_slug_from_path "$active_plan"
}

review_recommends_pass_fallback() {
  local review_file="$1"
  grep -Eq '^> \*\*Recommendation\*\*:[[:space:]]*pass([[:space:]]*)$' "$review_file"
}

external_acceptance_pass_fallback() {
  local review_file="$1"
  grep -Eq '^> \*\*External Acceptance\*\*:[[:space:]]*pass([[:space:]]*)$' "$review_file" \
    && grep -Eq '^-?[[:space:]]*P1 blockers:[[:space:]]*none([[:space:]]*)$' "$review_file"
}

require_finish_ready() {
  local contract_file="" review_file=""

  [[ -x "$helper_dir/contract-worktree.sh" ]] || fail "packaged contract-worktree helper is missing or not executable"

  load_workflow_state
  if declare -F workflow_active_contract >/dev/null 2>&1; then
    contract_file="$(workflow_active_contract 2>/dev/null || true)"
  fi
  if declare -F workflow_active_review >/dev/null 2>&1; then
    review_file="$(workflow_active_review 2>/dev/null || true)"
  fi
  [[ -n "$contract_file" && -f "$contract_file" ]] || fail "active sprint contract is missing"
  [[ -n "$review_file" && -f "$review_file" ]] || fail "active sprint review is missing"

  if declare -F workflow_review_recommends_pass >/dev/null 2>&1; then
    workflow_review_recommends_pass "$review_file" || fail "$review_file does not recommend pass"
  else
    review_recommends_pass_fallback "$review_file" || fail "$review_file does not recommend pass"
  fi

  if declare -F workflow_external_acceptance_pass >/dev/null 2>&1; then
    workflow_external_acceptance_pass "$review_file" || fail "$review_file has no passing external acceptance"
  else
    external_acceptance_pass_fallback "$review_file" || fail "$review_file has no passing external acceptance"
  fi

}

finish_contract_worktree() {
  local merge_mode="$1" gate_base_ref="${2:-$TARGET_BRANCH}"
  require_finish_ready
  if [[ "$merge_mode" == "local" ]]; then
    run_cmd bash "$helper_dir/contract-worktree.sh" finish --target "$TARGET_BRANCH"
  else
    run_cmd bash "$helper_dir/contract-worktree.sh" finish --no-merge --target "$TARGET_BRANCH" --gate-base "$gate_base_ref"
  fi
}

verify_merge_gate_before_ship() {
  local base_ref="$1"
  [[ -f "$helper_dir/merge-gate.ts" ]] || fail "merge-gate helper is missing: $helper_dir/merge-gate.ts"
  [[ "$BUN_BIN" == /* && -x "$BUN_BIN" ]] || fail "merge gate requires the trusted Bun runtime injected by repo-harness run"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    git rev-parse HEAD
    return 0
  fi
  "$BUN_BIN" "$helper_dir/merge-gate.ts" verify --base "$base_ref" --format sha
}

merge_gate_required() {
  local base_ref="$1" result
  [[ "$BUN_BIN" == /* && -x "$BUN_BIN" ]] || fail "merge gate requires the trusted Bun runtime injected by repo-harness run"
  command -v jq >/dev/null 2>&1 || fail "merge gate preflight requires jq"
  result="$("$BUN_BIN" "$helper_dir/merge-gate.ts" fingerprint --base "$base_ref" --format json)" || fail "cannot read merge-gate requirement from $base_ref"
  printf '%s' "$result" | jq -er '.required == true' >/dev/null 2>&1
}

refresh_target_base() {
  git remote get-url "$REMOTE_NAME" >/dev/null 2>&1 || fail "remote not found: $REMOTE_NAME"
  run_cmd git fetch --no-tags "$REMOTE_NAME" "+refs/heads/$TARGET_BRANCH:refs/remotes/$REMOTE_NAME/$TARGET_BRANCH"
}

pr_title_for_branch() {
  local branch="$1"
  local active_plan title
  active_plan="$(active_plan_or_empty)"
  if [[ -n "$active_plan" && -f "$active_plan" ]]; then
    title="$(awk '/^# / { sub(/^# /, ""); print; exit }' "$active_plan" | sed -E 's/^Plan:[[:space:]]*//')"
  fi
  title="${title:-Ship ${branch}}"
  printf '%s' "$title"
}

pr_body_for_branch() {
  local branch="$1"
  cat <<EOF_BODY
Automated repo-harness ship for \`${branch}\`.

Checks:
- Waza /check review artifact recommends pass.
- External acceptance is recorded in the sprint review.
- \`contract-worktree finish --no-merge\` ran the sole sprint verification.

This PR intentionally does not merge \`${TARGET_BRANCH}\` locally.
EOF_BODY
}

push_branch() {
  local branch="$1" verified_sha="$2" current_sha
  git remote get-url "$REMOTE_NAME" >/dev/null 2>&1 || fail "remote not found: $REMOTE_NAME"
  current_sha="$(git rev-parse "$branch^{commit}")"
  [[ "$current_sha" == "$verified_sha" ]] || fail "branch $branch moved after merge-gate review"
  run_cmd git push "$REMOTE_NAME" "$verified_sha:refs/heads/$branch"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    git branch --set-upstream-to="$REMOTE_NAME/$branch" "$branch" >/dev/null
  fi
}

create_or_report_pr() {
  local branch="$1"
  local gh_bin existing title body output status
  local args=()
  gh_bin="${REPO_HARNESS_GH_BIN:-gh}"
  command -v "$gh_bin" >/dev/null 2>&1 || fail "gh is required for default PR ship mode"

  existing="$("$gh_bin" pr list --base "$TARGET_BRANCH" --head "$branch" --json url --jq '.[0].url // ""' 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    echo "[Ship] PR already exists for $branch: $existing"
    return 0
  fi

  title="$(pr_title_for_branch "$branch")"
  body="$(pr_body_for_branch "$branch")"
  args=(pr create --base "$TARGET_BRANCH" --head "$branch" --title "$title" --body "$body")
  if [[ "$DRAFT_PR" -eq 1 ]]; then
    args+=(--draft)
  fi

  echo "[Ship] $gh_bin ${args[*]}"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi

  if output="$("$gh_bin" "${args[@]}" 2>&1)"; then
    [[ -z "$output" ]] || printf '%s\n' "$output"
    return 0
  fi

  status=$?
  existing="$("$gh_bin" pr list --base "$TARGET_BRANCH" --head "$branch" --json url --jq '.[0].url // ""' 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    echo "[Ship] PR already exists for $branch after create failure: $existing"
    return 0
  fi

  [[ -z "$output" ]] || printf '%s\n' "$output" >&2
  fail "gh pr create failed for $branch (exit $status)"
}

ship_linked_pr() {
  local branch gate_base_ref verified_sha
  branch="$(current_branch)"
  [[ -n "$branch" ]] || fail "detached HEAD is not supported"
  [[ "$branch" != "$TARGET_BRANCH" ]] || fail "refusing to ship target branch as linked worktree"
  case "$branch" in
    "$BRANCH_PREFIX"*) ;;
    *) fail "linked ship expects branch prefix $BRANCH_PREFIX, got $branch" ;;
  esac

  refresh_target_base
  gate_base_ref="refs/remotes/$REMOTE_NAME/$TARGET_BRANCH"
  ship_transaction_begin
  finish_contract_worktree "pr" "$gate_base_ref"
  refresh_target_base
  verified_sha="$(verify_merge_gate_before_ship "$gate_base_ref")"
  push_branch "$branch" "$verified_sha"
  ship_transaction_commit
  create_or_report_pr "$branch"
}

ship_linked_local_merge() {
  local branch
  branch="$(current_branch)"
  [[ -n "$branch" ]] || fail "detached HEAD is not supported"
  [[ "$branch" != "$TARGET_BRANCH" ]] || fail "refusing to local-merge target branch as linked worktree"
  finish_contract_worktree "local"
}

ship_primary_dirty_pr() {
  local status active_slug active_plan base_slug branch message gate_base_ref verified_sha
  local gate_args=()
  status="$(git status --porcelain=v1 --untracked-files=all)"
  [[ -n "$status" ]] || return 0

  [[ "$(current_branch)" == "$TARGET_BRANCH" ]] || fail "main closeout must start from $TARGET_BRANCH"
  active_slug="$(active_slug_or_empty)"
  base_slug="${SLUG_OVERRIDE:-$active_slug}"
  [[ -n "$base_slug" ]] || fail "main worktree has changes; pass --slug or keep an active plan so ship can name the closeout branch"
  base_slug="$(normalize_slug "$base_slug")"
  branch="${BRANCH_PREFIX}${base_slug}-main-closeout"
  message="chore(ship): close out ${base_slug}"
  active_plan="$(active_plan_or_empty)"

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    fail "closeout branch already exists: $branch"
  fi

  refresh_target_base
  gate_base_ref="refs/remotes/$REMOTE_NAME/$TARGET_BRANCH"
  if merge_gate_required "$gate_base_ref" && [[ -z "$active_plan" || ! -f "$active_plan" ]]; then
    fail "target base requires merge gate but dirty-main closeout has no active goal plan; use a contract worktree"
  fi
  run_cmd git switch -c "$branch"
  run_cmd git add -A
  run_cmd git commit -m "$message"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    verified_sha="$(git rev-parse HEAD)"
  else
    gate_args=(run --base "$gate_base_ref" --format sha)
    if [[ -n "$active_plan" && -f "$active_plan" ]]; then
      gate_args+=(--goal "$active_plan")
    fi
    [[ "$BUN_BIN" == /* && -x "$BUN_BIN" ]] || fail "merge gate requires the trusted Bun runtime injected by repo-harness run"
    verified_sha="$("$BUN_BIN" "$helper_dir/merge-gate.ts" "${gate_args[@]}")"
    refresh_target_base
    verified_sha="$(verify_merge_gate_before_ship "$gate_base_ref")"
  fi
  push_branch "$branch" "$verified_sha"
  create_or_report_pr "$branch"
}

ship_primary_pr() {
  local branch path shipped=0
  local child_args=()
  [[ "$DRY_RUN" -eq 1 ]] && child_args+=(--dry-run)
  [[ "$DRAFT_PR" -eq 0 ]] && child_args+=(--ready)
  while IFS=$'\t' read -r branch path; do
    [[ -n "$branch" && -n "$path" ]] || continue
    [[ "$(cd "$path" && pwd -P)" != "$(pwd -P)" ]] || continue
    echo "[Ship] Shipping linked worktree $branch at $path with PR mode"
    (cd "$path" && REPO_HARNESS_TARGET_REPO_ROOT="$path" bash "$helper_dir/ship-worktrees.sh" --target "$TARGET_BRANCH" --remote "$REMOTE_NAME" "${child_args[@]}")
    shipped=1
  done < <(list_contract_worktrees "$BRANCH_PREFIX")

  ship_primary_dirty_pr

  if [[ "$shipped" -eq 0 && -z "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
    echo "[Ship] Nothing to ship."
  fi
}

ship_primary_local_merge() {
  local branch path slug shipped=0
  local child_args=()
  [[ "$DRY_RUN" -eq 1 ]] && child_args+=(--dry-run)
  while IFS=$'\t' read -r branch path; do
    [[ -n "$branch" && -n "$path" ]] || continue
    [[ "$(cd "$path" && pwd -P)" != "$(pwd -P)" ]] || continue
    slug="${branch#${BRANCH_PREFIX}}"
    echo "[Ship] Shipping linked worktree $branch at $path with local merge mode"
    (cd "$path" && REPO_HARNESS_TARGET_REPO_ROOT="$path" bash "$helper_dir/ship-worktrees.sh" --local-merge --target "$TARGET_BRANCH" "${child_args[@]}")
    run_cmd bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$TARGET_BRANCH"
    shipped=1
  done < <(list_contract_worktrees "$BRANCH_PREFIX")

  if [[ "$shipped" -eq 0 ]]; then
    echo "[Ship] No linked contract worktrees found for local merge."
  fi
}

cleanup_merged() {
  local branch path slug cleaned=0
  ! is_linked_worktree || fail "--cleanup-merged must run from the target primary worktree"

  while IFS=$'\t' read -r branch path; do
    [[ -n "$branch" && -n "$path" ]] || continue
    slug="${branch#${BRANCH_PREFIX}}"
    if [[ -n "$SLUG_OVERRIDE" && "$slug" != "$SLUG_OVERRIDE" ]]; then
      continue
    fi
    if git merge-base --is-ancestor "$branch" "$TARGET_BRANCH" >/dev/null 2>&1; then
      if ! ensure_worktree_status_for_cleanup "$path"; then
        if [[ "$DRY_RUN" -eq 1 ]]; then
          run_cmd bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$TARGET_BRANCH" --dry-run
          cleaned=1
          continue
        fi
      fi
      guard_dirty_merged_worktree "$branch" "$path" || exit 1
      if [[ "$DRY_RUN" -eq 1 ]]; then
        run_cmd bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$TARGET_BRANCH" --dry-run
      else
        run_cmd bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$TARGET_BRANCH"
      fi
      cleaned=1
    else
      echo "[Ship] Skipped unmerged branch: $branch"
    fi
  done < <(list_contract_worktrees "$BRANCH_PREFIX")

  if [[ "$cleaned" -eq 0 ]]; then
    if [[ -n "$SLUG_OVERRIDE" ]]; then
      echo "[Ship] No merged contract worktree to clean for slug: $SLUG_OVERRIDE"
    else
      echo "[Ship] No merged contract worktrees to clean."
    fi
  fi
}

MODE="pr"
TARGET_BRANCH=""
REMOTE_NAME="origin"
SLUG_OVERRIDE=""
DRAFT_PR=1
DRY_RUN=0
DISCARD_SCAFFOLD_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      [[ -n "${2:-}" ]] || fail "--target requires a value"
      TARGET_BRANCH="$2"
      shift 2
      ;;
    --remote)
      [[ -n "${2:-}" ]] || fail "--remote requires a value"
      REMOTE_NAME="$2"
      shift 2
      ;;
    --slug)
      [[ -n "${2:-}" ]] || fail "--slug requires a value"
      SLUG_OVERRIDE="$(normalize_slug "$2")"
      shift 2
      ;;
    --ready)
      DRAFT_PR=0
      shift
      ;;
    --draft)
      DRAFT_PR=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --local-merge)
      MODE="local-merge"
      shift
      ;;
    --cleanup-merged)
      MODE="cleanup-merged"
      shift
      ;;
    --discard-scaffold-only)
      DISCARD_SCAFFOLD_ONLY=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not inside a git repository"
TARGET_BRANCH="${TARGET_BRANCH:-$(policy_get '.worktree_strategy.merge_back.target' 'main')}"
BRANCH_PREFIX="$(policy_get '.worktree_strategy.branch_prefix' 'codex/')"

case "$MODE" in
  pr)
    if is_linked_worktree; then
      ship_linked_pr
    else
      ship_primary_pr
    fi
    ;;
  local-merge)
    if is_linked_worktree; then
      ship_linked_local_merge
    else
      ship_primary_local_merge
    fi
    ;;
  cleanup-merged)
    cleanup_merged
    ;;
  *)
    fail "unsupported mode: $MODE"
    ;;
esac
