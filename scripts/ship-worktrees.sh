#!/bin/bash
set -euo pipefail

unset GH_TOKEN GITHUB_TOKEN ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN SSH_AUTH_SOCK HTTP_PROXY HTTPS_PROXY NO_PROXY

GIT_BIN="${REPO_HARNESS_GIT_BIN:-/usr/bin/git}"
BASH_BIN="${REPO_HARNESS_BASH_BIN:-/bin/bash}"
BUN_BIN="${REPO_HARNESS_BUN_BIN:-}"
WORKFLOW_STATE_LIB="${REPO_HARNESS_WORKFLOW_STATE_LIB:-.ai/hooks/lib/workflow-state.sh}"
if [[ "${OS:-}" == "Windows_NT" ]]; then
  GIT_BIN="${GIT_BIN//\\//}"
  BASH_BIN="${BASH_BIN//\\//}"
  BUN_BIN="${BUN_BIN//\\//}"
  WORKFLOW_STATE_LIB="${WORKFLOW_STATE_LIB//\\//}"
  REPO_HARNESS_TARGET_REPO_ROOT="${REPO_HARNESS_TARGET_REPO_ROOT:-}"
  REPO_HARNESS_TARGET_REPO_ROOT="${REPO_HARNESS_TARGET_REPO_ROOT//\\//}"
  REPO_HARNESS_HELPER_SOURCE_PATH="${REPO_HARNESS_HELPER_SOURCE_PATH:-}"
  REPO_HARNESS_HELPER_SOURCE_PATH="${REPO_HARNESS_HELPER_SOURCE_PATH//\\//}"
fi
is_absolute_host_path() {
  case "$1" in
    /*) return 0 ;;
    [A-Za-z]:/*|[A-Za-z]:\\*) [[ "${OS:-}" == "Windows_NT" ]] && return 0 ;;
  esac
  return 1
}
is_trusted_executable() { is_absolute_host_path "$1" && [[ -f "$1" && ! -L "$1" && -x "$1" ]]; }
is_trusted_regular_file() { is_absolute_host_path "$1" && [[ -f "$1" && ! -L "$1" ]]; }
is_trusted_executable "$GIT_BIN" || { echo "ship-worktrees: trusted git executable is unavailable" >&2; exit 1; }
is_trusted_executable "$BASH_BIN" || { echo "ship-worktrees: trusted bash executable is unavailable" >&2; exit 1; }
if [[ -n "$BUN_BIN" ]] && ! is_trusted_regular_file "$WORKFLOW_STATE_LIB"; then
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
helper_source="$0"
if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
      && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
  helper_source="$REPO_HARNESS_HELPER_SOURCE_PATH"
fi
helper_dir="$(cd "$(dirname "$helper_source")" && pwd)"

worktree_merge_lib="$helper_dir/worktree-merge-lib.sh"
[[ -f "$worktree_merge_lib" ]] || { echo "ship-worktrees: worktree merge library is unavailable: $worktree_merge_lib" >&2; exit 1; }
# shellcheck source=worktree-merge-lib.sh
. "$worktree_merge_lib"

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/ship-worktrees.sh [--target <branch>] [--remote <name>] [--slug <slug>] [--ready] [--dry-run]
  scripts/ship-worktrees.sh --local-merge [--target <branch>] [--slug <slug>] [--dry-run]
  scripts/ship-worktrees.sh --cleanup-merged [--target <branch>] [--slug <slug>] [--discard-scaffold-only] [--dry-run]
  scripts/ship-worktrees.sh --recover <inspect|abort|reconcile> [--key <transaction-key>]

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

# --- CloseoutJournalV1 -------------------------------------------------------
# A closeout mutates plans/, tasks/, three .ai/harness pointers, .claude/.plan-state
# and HEAD, and (for ship) pushes before the PR exists. Before this journal the
# pre-closeout snapshot lived in `mktemp -d` and the original HEAD only in a shell
# variable, recoverable solely from an EXIT trap -- so SIGKILL, power loss, or a
# closed terminal left a half-applied closeout with no discoverable, verifiable
# recovery entry. The journal keeps both under the git common dir: outside every
# working tree, surviving worktree removal, and structurally unreadable as
# workflow state. It records operation progress only -- Effective State and its
# collectors must never read it.
#
# Phases: prepared -> implementation_committed -> gate_sealed -> lifecycle_applied
#      -> lifecycle_committed -> merged|pushed -> pr_observed -> complete
# Each phase is persisted via temp file + fsync + atomic rename before the caller
# may treat that phase's effect as committed. There is no auto-resume: re-entry
# fails closed and recovery is the explicit `recover inspect|abort|reconcile`
# surface.
closeout_journal_operation=""
closeout_journal_key_value=""
closeout_journal_dir=""
closeout_journal_conflict_dir=""
closeout_journal_worktree="$(cd "$REPO_ROOT" && pwd -P)"
closeout_claim_dir=""
closeout_claim_mode=""
closeout_claim_operation=""
closeout_claim_conflict_dir=""

closeout_journal_root() {
  local common_dir
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || return 1
  common_dir="$(cd "$common_dir" 2>/dev/null && pwd -P)" || return 1
  printf '%s/repo-harness/transactions' "$common_dir"
}

# Deterministic transaction key over repo identity, worktree, operation,
# plan/contract, original HEAD, and the frozen target/base SHA. git is the only
# binary these helpers already hard-require and validate, so deriving the key
# with its content digest keeps the derivation dependency-free and reproducible
# from a fresh recovery process.
closeout_journal_derive_key() {
  printf '%s\n' "$@" | git hash-object --stdin
}

# One worktree may have at most one live closeout for a given operation. The
# stable claim directory is elected with one atomic mkdir before any journal
# temp file, lifecycle mutation, merge, or push. Its owner record is operation
# evidence only and lives beside (never inside) workflow state.
closeout_claim_path() {
  local operation="$1" root key
  root="$(closeout_journal_root)" || return 1
  key="$(closeout_journal_derive_key "operation=$operation" "worktree=$closeout_journal_worktree")"
  printf '%s/claims/%s/%s.lock' "$root" "$operation" "$key"
}

closeout_claim_write_owner() {
  local target="$1" operation="$2" journal_key="${3:-}"
  {
    printf '{\n'
    printf '  "version": 1,\n'
    printf '  "operation": "%s",\n' "$(json_escape "$operation")"
    printf '  "worktree": "%s",\n' "$(json_escape "$closeout_journal_worktree")"
    printf '  "pid": "%s",\n' "$$"
    printf '  "journal_key": "%s"\n' "$(json_escape "$journal_key")"
    printf '}\n'
  } | closeout_journal_write "$target"
}

closeout_claim_acquire() {
  local operation="$1" claim
  claim="$(closeout_claim_path "$operation")" || return 1
  mkdir -p "$(dirname "$claim")"
  if ! mkdir "$claim" 2>/dev/null; then
    closeout_claim_conflict_dir="$claim"
    return 1
  fi
  closeout_claim_dir="$claim"
  closeout_claim_mode="normal"
  closeout_claim_operation="$operation"
  if ! closeout_claim_write_owner "$claim/owner.json" "$operation"; then
    rm -rf "$claim"
    closeout_claim_dir=""
    closeout_claim_mode=""
    closeout_claim_operation=""
    return 1
  fi
  trap closeout_claim_on_exit EXIT
}

closeout_claim_bind_journal() {
  local key="$1"
  [[ "$closeout_claim_mode" == "normal" && -n "$closeout_claim_dir" ]] || return 1
  closeout_claim_write_owner "$closeout_claim_dir/owner.json" "$closeout_claim_operation" "$key"
}

closeout_claim_owner_live() {
  local owner_file="$1" owner_pid
  owner_pid="$(closeout_journal_field "$owner_file" pid)"
  [[ "$owner_pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$owner_pid" 2>/dev/null
}

closeout_claim_release() {
  local owner_file owner_pid
  [[ -n "$closeout_claim_dir" && -d "$closeout_claim_dir" ]] || return 1
  if [[ "$closeout_claim_mode" == "recovery" ]]; then
    owner_file="$closeout_claim_dir/recovery.lock/owner.json"
  else
    owner_file="$closeout_claim_dir/owner.json"
  fi
  owner_pid="$(closeout_journal_field "$owner_file" pid)"
  [[ "$owner_pid" == "$$" ]] || return 1
  rm -rf "$closeout_claim_dir"
  closeout_claim_dir=""
  closeout_claim_mode=""
  closeout_claim_operation=""
  trap - EXIT
}

closeout_claim_on_exit() {
  local exit_code=$?
  trap - EXIT
  closeout_claim_release || exit_code=1
  exit "$exit_code"
}

# Recovery is explicit, never automatic. A mutating recover first proves the
# recorded closeout owner is gone, then atomically owns a nested recovery lane.
# A killed recovery lane may be reclaimed only by another explicit recover call
# after its own recorded PID is also gone.
closeout_claim_takeover_for_recovery() {
  local operation="$1" claim recovery owner_pid
  claim="$(closeout_claim_path "$operation")" || return 1
  [[ -d "$claim" ]] || return 1
  closeout_claim_owner_live "$claim/owner.json" && return 2
  recovery="$claim/recovery.lock"
  if [[ -d "$recovery" ]]; then
    if closeout_claim_owner_live "$recovery/owner.json"; then
      return 3
    fi
    rm -rf "$recovery"
  fi
  mkdir "$recovery" 2>/dev/null || return 3
  closeout_claim_dir="$claim"
  closeout_claim_mode="recovery"
  closeout_claim_operation="$operation"
  if ! closeout_claim_write_owner "$recovery/owner.json" "$operation"; then
    rm -rf "$recovery"
    closeout_claim_dir=""
    closeout_claim_mode=""
    closeout_claim_operation=""
    return 1
  fi
  trap closeout_claim_recovery_on_exit EXIT
}

closeout_claim_cancel_recovery() {
  local owner_file owner_pid
  [[ "$closeout_claim_mode" == "recovery" && -n "$closeout_claim_dir" ]] || return 0
  owner_file="$closeout_claim_dir/recovery.lock/owner.json"
  owner_pid="$(closeout_journal_field "$owner_file" pid)"
  if [[ "$owner_pid" == "$$" ]]; then
    rm -rf "$closeout_claim_dir/recovery.lock"
  fi
  closeout_claim_dir=""
  closeout_claim_mode=""
  closeout_claim_operation=""
  trap - EXIT
}

closeout_claim_recovery_on_exit() {
  local exit_code=$?
  trap - EXIT
  closeout_claim_cancel_recovery || exit_code=1
  exit "$exit_code"
}

closeout_claim_report() {
  local operation="$1" label="$2" claim owner_pid journal_key owner_state="unknown"
  claim="$(closeout_claim_path "$operation")" || return 1
  [[ -d "$claim" ]] || return 1
  owner_pid="$(closeout_journal_field "$claim/owner.json" pid)"
  journal_key="$(closeout_journal_field "$claim/owner.json" journal_key)"
  if closeout_claim_owner_live "$claim/owner.json"; then owner_state="live"; else owner_state="not_live"; fi
  printf '%s ownership claim: %s\n' "$label" "$claim"
  printf '%s owner pid: %s (%s)\n' "$label" "${owner_pid:-unknown}" "$owner_state"
  printf '%s journal key: %s\n' "$label" "${journal_key:-none}"
}

# A process can die after the atomic owner claim but before `prepared` exists.
# No closeout effect is possible in that window, so explicit `recover abort`
# may remove only that orphan claim and any status-less journal directory.
closeout_claim_abort_orphan() {
  local operation="$1" claim journal_key journal_dir takeover_result=0
  claim="$(closeout_claim_path "$operation")" || return 1
  [[ -d "$claim" ]] || return 1
  journal_key="$(closeout_journal_field "$claim/owner.json" journal_key)"
  if [[ -n "$journal_key" ]]; then
    journal_dir="$(closeout_journal_root)/$operation/$journal_key"
    [[ ! -f "$journal_dir/status.json" ]] || return 4
  fi
  closeout_claim_takeover_for_recovery "$operation" || takeover_result=$?
  [[ "$takeover_result" -eq 0 ]] || return "$takeover_result"
  if [[ -n "${journal_dir:-}" && -d "$journal_dir" ]]; then
    rm -rf "$journal_dir"
  fi
  closeout_claim_release
}

# temp file + fsync + atomic rename. Content arrives on stdin.
closeout_journal_write() {
  local target="$1"
  local tmp="${target}.tmp"
  dd of="$tmp" conv=fsync 2>/dev/null
  mv -f "$tmp" "$target"
}

closeout_journal_field() {
  local file="$1" name="$2"
  [[ -f "$file" ]] || return 1
  sed -n "s/^  \"${name}\": \"\(.*\)\",\{0,1\}\$/\1/p" "$file" | head -1
}

closeout_journal_status() {
  closeout_journal_field "$1/status.json" "status"
}

closeout_journal_last_phase() {
  local file="$1/status.json"
  [[ -f "$file" ]] || return 1
  sed -n 's/^    {"phase": "\([^"]*\)".*$/\1/p' "$file" | tail -1
}

closeout_journal_has_phase() {
  local file="$1/status.json" name="$2"
  [[ -f "$file" ]] || return 1
  grep -q "^    {\"phase\": \"${name}\", " "$file"
}

closeout_journal_phase_ref() {
  local file="$1/status.json" name="$2"
  [[ -f "$file" ]] || return 1
  sed -n "s/^    {\"phase\": \"${name}\", \"at\": \"[^\"]*\", \"ref\": \"\([^\"]*\)\"}.*\$/\1/p" "$file" | tail -1
}

# Rewrites the whole status document so the phase list has exactly one authority
# and lands in one atomic rename. An empty phase name only flips the status.
closeout_journal_record() {
  local dir="$1" status_value="$2" name="$3" ref="${4:-}"
  local file="$dir/status.json"
  local -a lines=()
  local line stamp index
  if [[ -f "$file" ]]; then
    while IFS= read -r line; do
      [[ -n "$line" ]] || continue
      lines+=("${line%,}")
    done < <(sed -n 's/^    \({"phase": .*\)$/\1/p' "$file")
  fi
  stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  if [[ -n "$name" ]]; then
    lines+=("{\"phase\": \"$(json_escape "$name")\", \"at\": \"$stamp\", \"ref\": \"$(json_escape "$ref")\"}")
  fi
  {
    printf '{\n'
    printf '  "version": 1,\n'
    printf '  "operation": "%s",\n' "$(json_escape "$closeout_journal_operation")"
    printf '  "key": "%s",\n' "$(json_escape "$closeout_journal_key_value")"
    printf '  "status": "%s",\n' "$(json_escape "$status_value")"
    printf '  "updated_at": "%s",\n' "$stamp"
    printf '  "phases": [\n'
    for ((index = 0; index < ${#lines[@]}; index++)); do
      if (( index + 1 < ${#lines[@]} )); then
        printf '    %s,\n' "${lines[$index]}"
      else
        printf '    %s\n' "${lines[$index]}"
      fi
    done
    printf '  ]\n'
    printf '}\n'
  } | closeout_journal_write "$file"
}

closeout_journal_list() {
  local operation="$1" want_status="$2"
  local root candidate
  root="$(closeout_journal_root)" || return 1
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    [[ -f "$candidate/status.json" ]] || continue
    [[ -z "$want_status" || "$(closeout_journal_status "$candidate")" == "$want_status" ]] || continue
    [[ "$(closeout_journal_field "$candidate/meta.json" worktree)" == "$closeout_journal_worktree" ]] || continue
    printf '%s\n' "$candidate"
  done < <(find "$root/$operation" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)
}

# Early re-entry guard. A crashed closeout can leave the repo unable to resolve
# its own contract/plan (the lifecycle step already archived them), so the
# operator must hit this message rather than a confusing downstream failure.
# Key-scoped checks belong in closeout_journal_begin; this one is worktree-wide
# because the key binds the original HEAD and a crashed run that already
# committed can never reproduce its own key.
closeout_journal_guard_reentry() {
  local operation="$1" conflict
  conflict="$(closeout_journal_list "$operation" "in_progress" | head -1)"
  [[ -n "$conflict" ]] || return 0
  closeout_journal_conflict_dir="$conflict"
  return 1
}

# 0 started, 2 no-op replay of an already-complete transaction, 3 blocked by an
# unfinished closeout (dir in closeout_journal_conflict_dir), 1 unusable journal.
closeout_journal_begin() {
  local operation="$1" key="$2"
  shift 2
  local root dir status conflict pair name value stamp
  root="$(closeout_journal_root)" || return 1
  dir="$root/$operation/$key"
  closeout_journal_operation="$operation"
  closeout_journal_key_value="$key"
  closeout_journal_conflict_dir=""

  if [[ -f "$dir/status.json" ]]; then
    status="$(closeout_journal_status "$dir")"
    if [[ "$status" == "complete" ]]; then
      # A replay is only a no-op while the completed effect is still in place.
      # If HEAD has moved off the recorded completion the transaction was undone
      # afterwards (an outer rollback), so the same key must start fresh instead
      # of reporting success for work that no longer exists.
      if [[ "$(git rev-parse HEAD)" == "$(closeout_journal_phase_ref "$dir" complete)" ]]; then
        closeout_journal_dir="$dir"
        return 2
      fi
      rm -rf "$dir"
    fi
    # An aborted transaction already restored the pre-closeout state, so the
    # identical key is a legitimate retry rather than a blocked re-entry.
    [[ "$status" != "aborted" ]] || rm -rf "$dir"
  fi

  # Fail closed on any unfinished closeout of this operation for this worktree.
  # The key binds the original HEAD, so a crashed run that already committed can
  # never reproduce its own key on retry -- scoping the guard to the worktree is
  # what makes it cover the interrupt it exists for. Journals belonging to other
  # worktrees are ignored.
  conflict="$(closeout_journal_list "$operation" "in_progress" | head -1)"
  if [[ -n "$conflict" ]]; then
    closeout_journal_conflict_dir="$conflict"
    return 3
  fi

  mkdir -p "$dir/snapshot"
  closeout_journal_dir="$dir"
  stamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  {
    printf '{\n'
    printf '  "version": 1,\n'
    printf '  "operation": "%s",\n' "$(json_escape "$operation")"
    printf '  "key": "%s",\n' "$(json_escape "$key")"
    printf '  "repo": "%s",\n' "$(json_escape "$root")"
    printf '  "worktree": "%s",\n' "$(json_escape "$closeout_journal_worktree")"
    for pair in "$@"; do
      name="${pair%%=*}"
      value="${pair#*=}"
      printf '  "%s": "%s",\n' "$(json_escape "$name")" "$(json_escape "$value")"
    done
    printf '  "started_at": "%s"\n' "$stamp"
    printf '}\n'
  } | closeout_journal_write "$dir/meta.json"
  return 0
}

closeout_journal_report() {
  local dir="$1" label="$2"
  printf '%s journal: %s\n' "$label" "$dir"
  printf '%s status: %s\n' "$label" "$(closeout_journal_status "$dir")"
  printf '%s last phase: %s\n' "$label" "$(closeout_journal_last_phase "$dir")"
  printf '%s original HEAD: %s\n' "$label" "$(closeout_journal_field "$dir/meta.json" original_head)"
  printf '%s snapshot: %s\n' "$label" "$dir/snapshot"
  printf '%s snapshot present: %s\n' "$label" "$([[ -f "$dir/snapshot/paths.tsv" ]] && printf 'yes' || printf 'no')"
  printf '%s plan: %s\n' "$label" "$(closeout_journal_field "$dir/meta.json" plan)"
  printf '%s contract: %s\n' "$label" "$(closeout_journal_field "$dir/meta.json" contract)"
  printf '%s branch: %s\n' "$label" "$(closeout_journal_field "$dir/meta.json" branch)"
  printf '%s base: %s %s\n' "$label" "$(closeout_journal_field "$dir/meta.json" base_ref)" "$(closeout_journal_field "$dir/meta.json" base_sha)"
  sed -n 's/^    {"phase": "\([^"]*\)", "at": "\([^"]*\)", "ref": "\([^"]*\)".*$/'"$label"' phase: \1 \2 \3/p' "$dir/status.json"
}

# Restores the pre-closeout snapshot recorded in the journal. Safe from a fresh
# process: the path index and the original HEAD both live on disk.
closeout_journal_restore_snapshot() {
  local dir="$1"
  local index_file="$dir/snapshot/paths.tsv"
  local -a rows=()
  local row index path existed original_head count
  [[ -f "$index_file" ]] || return 1
  while IFS= read -r row; do
    [[ -n "$row" ]] || continue
    rows+=("$row")
  done < "$index_file"
  for ((count = ${#rows[@]} - 1; count >= 0; count--)); do
    row="${rows[$count]}"
    index="${row%%$'\t'*}"
    path="${row#*$'\t'}"
    existed="${path#*$'\t'}"
    path="${path%%$'\t'*}"
    rm -rf "$path"
    if [[ "$existed" == "1" ]]; then
      mkdir -p "$(dirname "$path")"
      cp -Rp "$dir/snapshot/$index/value" "$path"
    fi
  done
  original_head="$(closeout_journal_field "$dir/meta.json" original_head)"
  if [[ -n "$original_head" ]] && [[ "$(git rev-parse HEAD)" != "$original_head" ]]; then
    git reset --mixed "$original_head"
  fi
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

# The snapshot path index is persisted next to the copies so a fresh recovery
# process can restore without the in-memory arrays that died with the crash.
ship_transaction_write_index() {
  local index
  {
    for ((index = 0; index < ${#ship_transaction_paths[@]}; index++)); do
      printf '%s\t%s\t%s\n' "$index" "${ship_transaction_paths[$index]}" "${ship_transaction_existed[$index]}"
    done
  } | closeout_journal_write "$ship_transaction_dir/paths.tsv"
}

ship_active_contract_or_empty() {
  if declare -F workflow_active_contract >/dev/null 2>&1; then
    workflow_active_contract 2>/dev/null || true
  fi
}

ship_transaction_begin() {
  [[ "$DRY_RUN" -eq 0 ]] || return 0
  local branch gate_base_ref base_sha original_head plan contract key begin_status=0
  if ! closeout_journal_guard_reentry "ship"; then
    echo "ship-worktrees: an unfinished ship journal blocks this ship: $closeout_journal_conflict_dir" >&2
    fail "run 'ship-worktrees --recover inspect', then '--recover abort' or '--recover reconcile'"
  fi
  if ! closeout_claim_acquire "ship"; then
    echo "ship-worktrees: closeout already owned for this worktree and operation: $closeout_claim_conflict_dir" >&2
    fail "run 'ship-worktrees --recover inspect', then '--recover abort' or '--recover reconcile'; '--recover abort' also clears a claim with no recorded journal phase"
  fi
  branch="$(current_branch)"
  gate_base_ref="refs/remotes/$REMOTE_NAME/$TARGET_BRANCH"
  base_sha="$(git rev-parse "$gate_base_ref^{commit}")"
  original_head="$(git rev-parse HEAD)"
  plan="$(active_plan_or_empty)"
  contract="$(ship_active_contract_or_empty)"
  key="$(closeout_journal_derive_key \
    "repo=$(closeout_journal_root)" \
    "worktree=$closeout_journal_worktree" \
    "operation=ship" \
    "plan=$plan" \
    "contract=$contract" \
    "original_head=$original_head" \
    "target_branch=$TARGET_BRANCH" \
    "base_sha=$base_sha")"
  closeout_claim_bind_journal "$key"
  closeout_journal_begin "ship" "$key" \
    "branch=$branch" \
    "plan=$plan" \
    "contract=$contract" \
    "original_head=$original_head" \
    "target_branch=$TARGET_BRANCH" \
    "base_ref=$gate_base_ref" \
    "base_sha=$base_sha" \
    "remote=$REMOTE_NAME" || begin_status=$?
  case "$begin_status" in
    0) ;;
    2)
      echo "[Ship] Ship transaction already complete; replay is a no-op: $closeout_journal_dir"
      closeout_claim_release
      return 2
      ;;
    3)
      echo "ship-worktrees: an unfinished ship journal blocks this ship: $closeout_journal_conflict_dir" >&2
      closeout_claim_release
      fail "run 'ship-worktrees --recover inspect', then '--recover abort' or '--recover reconcile'"
      ;;
    *)
      fail "cannot open the ship transaction journal"
      ;;
  esac

  ship_transaction_dir="$closeout_journal_dir/snapshot"
  mkdir -p "$ship_transaction_dir"
  ship_transaction_active=1
  ship_transaction_original_head="$original_head"
  ship_transaction_paths=()
  ship_transaction_existed=()
  trap ship_transaction_on_exit EXIT
  ship_transaction_snapshot "plans"
  ship_transaction_snapshot "tasks"
  ship_transaction_snapshot ".ai/harness/active-plan"
  ship_transaction_snapshot ".ai/harness/active-worktree"
  ship_transaction_snapshot ".ai/harness/sprint"
  ship_transaction_snapshot ".claude/.plan-state"
  ship_transaction_write_index
  closeout_journal_record "$closeout_journal_dir" in_progress prepared "$original_head"
}

# Guarded on the journal handle rather than the transaction flag: `pr_observed`
# and `complete` are recorded after ship_transaction_commit released the local
# rollback, because by then the push is already an external effect.
ship_transaction_phase() {
  [[ -n "$closeout_journal_dir" ]] || return 0
  closeout_journal_record "$closeout_journal_dir" in_progress "$1" "${2:-}"
}

ship_transaction_complete() {
  [[ -n "$closeout_journal_dir" ]] || return 0
  closeout_journal_record "$closeout_journal_dir" complete complete "${1:-}"
  closeout_claim_release
  closeout_journal_dir=""
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
  ship_transaction_active=0
  ship_transaction_original_head=""
  trap - EXIT
  # Status first, payload second: a crash between the two must leave a journal
  # that still has its snapshot, never one that claims progress it cannot undo.
  closeout_journal_record "$closeout_journal_dir" aborted "" ""
  rm -rf "$ship_transaction_dir"
  ship_transaction_dir=""
  closeout_journal_dir=""
  closeout_claim_release
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

  for path in ${untracked_paths[@]+"${untracked_paths[@]}"}; do
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

  [[ -f "$helper_dir/acceptance-receipt.ts" ]] || fail "AcceptanceReceipt helper is missing: $helper_dir/acceptance-receipt.ts"
  is_trusted_executable "$BUN_BIN" || fail "AcceptanceReceipt requires the trusted Bun runtime injected by repo-harness run"
  REPO_HARNESS_TARGET_REPO_ROOT="$(pwd -P)" "$BUN_BIN" "$helper_dir/acceptance-receipt.ts" verify \
    --contract "$contract_file" --verification ".ai/harness/checks/latest.json" >/dev/null \
    || fail "active AcceptanceReceipt is missing, rejected, or stale"

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
  is_trusted_executable "$BUN_BIN" || fail "merge gate requires the trusted Bun runtime injected by repo-harness run"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    git rev-parse HEAD
    return 0
  fi
  "$BUN_BIN" "$helper_dir/merge-gate.ts" verify --base "$base_ref" --format sha
}

seal_merge_gate_before_ship() {
  local base_ref="$1"
  [[ -f "$helper_dir/merge-gate.ts" ]] || fail "merge-gate helper is missing: $helper_dir/merge-gate.ts"
  is_trusted_executable "$BUN_BIN" || fail "merge gate requires the trusted Bun runtime injected by repo-harness run"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    git rev-parse HEAD
    return 0
  fi
  "$BUN_BIN" "$helper_dir/merge-gate.ts" run --base "$base_ref" --format sha
}

merge_gate_required() {
  local base_ref="$1" result
  is_trusted_executable "$BUN_BIN" || fail "merge gate requires the trusted Bun runtime injected by repo-harness run"
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
- A typed AcceptanceReceipt records external pass or the contract-authorized user waiver.
- \`contract-worktree finish --no-merge\` ran the sole sprint verification.
- \`merge-gate\` sealed the exact base/head/full diff locally without another provider call.

This PR intentionally does not merge \`${TARGET_BRANCH}\` locally.
EOF_BODY
}

push_branch() {
  local branch="$1" verified_sha="$2" current_sha
  git remote get-url "$REMOTE_NAME" >/dev/null 2>&1 || fail "remote not found: $REMOTE_NAME"
  current_sha="$(git rev-parse "$branch^{commit}")"
  [[ "$current_sha" == "$verified_sha" ]] || fail "branch $branch moved after the local merge seal"
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
  local begin_status=0
  ship_transaction_begin || begin_status=$?
  [[ "$begin_status" -ne 2 ]] || return 0
  finish_contract_worktree "pr" "$gate_base_ref"
  refresh_target_base
  verified_sha="$(seal_merge_gate_before_ship "$gate_base_ref")"
  verified_sha="$(verify_merge_gate_before_ship "$gate_base_ref")"
  ship_transaction_phase gate_sealed "$verified_sha"
  push_branch "$branch" "$verified_sha"
  ship_transaction_phase pushed "$verified_sha"
  ship_transaction_commit
  create_or_report_pr "$branch"
  ship_transaction_phase pr_observed "$verified_sha"
  ship_transaction_complete "$verified_sha"
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
    refresh_target_base
    verified_sha="$(seal_merge_gate_before_ship "$gate_base_ref")"
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
    (cd "$path" && REPO_HARNESS_TARGET_REPO_ROOT="$path" bash "$helper_dir/ship-worktrees.sh" --target "$TARGET_BRANCH" --remote "$REMOTE_NAME" ${child_args[@]+"${child_args[@]}"})
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
    (cd "$path" && REPO_HARNESS_TARGET_REPO_ROOT="$path" bash "$helper_dir/ship-worktrees.sh" --local-merge --target "$TARGET_BRANCH" ${child_args[@]+"${child_args[@]}"})
    run_cmd bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$TARGET_BRANCH"
    shipped=1
  done < <(list_contract_worktrees "$BRANCH_PREFIX")

  if [[ "$shipped" -eq 0 ]]; then
    echo "[Ship] No linked contract worktrees found for local merge."
  fi
}

cleanup_merged() {
  local branch path slug merge_mode cleaned=0
  ! is_linked_worktree || fail "--cleanup-merged must run from the target primary worktree"

  while IFS=$'\t' read -r branch path; do
    [[ -n "$branch" && -n "$path" ]] || continue
    slug="${branch#${BRANCH_PREFIX}}"
    if [[ -n "$SLUG_OVERRIDE" && "$slug" != "$SLUG_OVERRIDE" ]]; then
      continue
    fi
    # Same authority as contract-worktree cleanup --slug. An ancestry-only
    # filter here reported every squash-merged worktree as unmerged, which
    # under this project's squash ship flow means every worktree (issue #196).
    # Dirtiness is still a separate refusal below: merged-but-dirty must stay
    # distinguishable from unmerged.
    #
    # Enumerate the accepting modes rather than negating `unmerged`. This
    # branch reaches guard_dirty_merged_worktree below, which under
    # --discard-scaffold-only performs an irreversible write (git checkout --
    # on tracked scaffold, rm -f on untracked) BEFORE cleanup is delegated.
    # A value this function does not recognize must therefore land on the
    # refusing side, and negation would put it on the accepting side.
    merge_mode="$(worktree_merge_mode "$branch" "$TARGET_BRANCH")"
    if [[ "$merge_mode" == "ancestor" || "$merge_mode" == "absorbed" ]]; then
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

# True once ship's external effect -- the branch push -- is observable, whether
# or not the `pushed` phase was reached before the interrupt. `--recover abort`
# refuses on true, `--recover reconcile` refuses on false, so the window between
# the push and its phase record cannot defeat either rule.
closeout_ship_effect_landed() {
  local dir="$1" verified remote branch
  closeout_journal_has_phase "$dir" pushed && return 0
  verified="$(closeout_journal_phase_ref "$dir" gate_sealed)"
  [[ -n "$verified" ]] || return 1
  remote="$(closeout_journal_field "$dir/meta.json" remote)"
  branch="$(closeout_journal_field "$dir/meta.json" branch)"
  [[ -n "$remote" && -n "$branch" ]] || return 1
  [[ "$(git ls-remote "$remote" "refs/heads/$branch" 2>/dev/null | awk 'NR==1{print $1}')" == "$verified" ]]
}

closeout_ship_select() {
  local key="$1" dir
  local -a found=()
  if [[ -n "$key" ]]; then
    dir="$(closeout_journal_root)/ship/$key"
    [[ -f "$dir/status.json" ]] || fail "no ship journal for key: $key"
    printf '%s' "$dir"
    return 0
  fi
  while IFS= read -r dir; do
    [[ -n "$dir" ]] || continue
    found+=("$dir")
  done < <(closeout_journal_list "ship" "in_progress")
  [[ "${#found[@]}" -ne 0 ]] || fail "no unfinished ship journal for this worktree"
  if [[ "${#found[@]}" -gt 1 ]]; then
    printf '%s\n' "${found[@]}" >&2
    fail "multiple unfinished ship journals; pass --key"
  fi
  printf '%s' "${found[0]}"
}

recover_ship() {
  local action="$RECOVER_ACTION" key="$RECOVER_KEY" dir status last_phase branch verified reported=0 claim claim_result=0

  case "$action" in
    inspect|abort|reconcile) ;;
    *) fail "--recover requires inspect, abort, or reconcile" ;;
  esac

  if [[ "$action" == "inspect" && -z "$key" ]]; then
    while IFS= read -r dir; do
      [[ -n "$dir" ]] || continue
      closeout_journal_report "$dir" "[Ship]"
      reported=1
    done < <(closeout_journal_list "ship" "in_progress")
    if closeout_claim_report "ship" "[Ship]"; then
      reported=1
    fi
    if [[ "$reported" -eq 0 ]]; then
      echo "[Ship] No unfinished ship journal for this worktree."
    fi
    return 0
  fi

  if [[ "$action" == "abort" && -z "$key" ]]; then
    claim="$(closeout_claim_path "ship")" || fail "cannot resolve ship ownership claim"
    if [[ -d "$claim" && -z "$(closeout_journal_list "ship" "in_progress" | head -1)" ]]; then
      closeout_claim_abort_orphan "ship" || claim_result=$?
      case "$claim_result" in
        0) echo "[Ship] Aborted orphan ship ownership claim before journal preparation: $claim"; return 0 ;;
        2) fail "ship closeout is still owned by a live process" ;;
        3) fail "another recovery already owns this ship closeout" ;;
        *) fail "ship ownership claim is not an abortable pre-journal orphan" ;;
      esac
    fi
  fi

  dir="$(closeout_ship_select "$key")"
  [[ "$(closeout_journal_field "$dir/meta.json" worktree)" == "$closeout_journal_worktree" ]] \
    || fail "ship journal belongs to another worktree: $(closeout_journal_field "$dir/meta.json" worktree)"
  closeout_journal_operation="ship"
  closeout_journal_key_value="$(closeout_journal_field "$dir/meta.json" key)"
  status="$(closeout_journal_status "$dir")"
  last_phase="$(closeout_journal_last_phase "$dir")"
  branch="$(closeout_journal_field "$dir/meta.json" branch)"

  case "$action" in
    inspect)
      closeout_journal_report "$dir" "[Ship]"
      ;;
    abort)
      [[ "$status" == "in_progress" ]] || fail "refusing abort of a $status ship journal: $dir"
      claim_result=0
      closeout_claim_takeover_for_recovery "ship" || claim_result=$?
      case "$claim_result" in
        0) ;;
        2) fail "ship closeout is still owned by a live process" ;;
        3) fail "another recovery already owns this ship closeout" ;;
        *) fail "ship closeout ownership claim is missing or unreadable" ;;
      esac
      ! closeout_ship_effect_landed "$dir" \
        || fail "refusing abort after the push landed; run '--recover reconcile' instead: $dir"
      closeout_journal_restore_snapshot "$dir" || fail "ship journal has no restorable snapshot: $dir"
      closeout_journal_record "$dir" aborted "" ""
      rm -rf "$dir/snapshot"
      closeout_claim_release
      echo "[Ship] Aborted ship transaction and restored the pre-ship state: $dir"
      ;;
    reconcile)
      [[ "$status" == "in_progress" ]] || fail "refusing reconcile of a $status ship journal: $dir"
      claim_result=0
      closeout_claim_takeover_for_recovery "ship" || claim_result=$?
      case "$claim_result" in
        0) ;;
        2) fail "ship closeout is still owned by a live process" ;;
        3) fail "another recovery already owns this ship closeout" ;;
        *) fail "ship closeout ownership claim is missing or unreadable" ;;
      esac
      # Reconcile exists for an already-landed external effect. Without one the
      # correct recovery is a local rollback, so it refuses instead of guessing
      # -- and it never rolls the remote back.
      closeout_ship_effect_landed "$dir" \
        || fail "no landed push to reconcile (last phase: $last_phase); run '--recover abort' instead"
      verified="$(closeout_journal_phase_ref "$dir" gate_sealed)"
      closeout_journal_has_phase "$dir" pushed || closeout_journal_record "$dir" in_progress pushed "$verified"
      if ! closeout_journal_has_phase "$dir" pr_observed; then
        create_or_report_pr "$branch"
        closeout_journal_record "$dir" in_progress pr_observed "$verified"
      fi
      closeout_journal_record "$dir" complete complete "$verified"
      rm -rf "$dir/snapshot"
      closeout_claim_release
      echo "[Ship] Reconciled ship transaction; the push was already applied: $dir"
      ;;
  esac
}

MODE="pr"
RECOVER_ACTION=""
RECOVER_KEY=""
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
    --recover)
      [[ -n "${2:-}" ]] || fail "--recover requires inspect, abort, or reconcile"
      MODE="recover"
      RECOVER_ACTION="$2"
      shift 2
      ;;
    --key)
      [[ -n "${2:-}" ]] || fail "--key requires a value"
      RECOVER_KEY="$2"
      shift 2
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
  recover)
    recover_ship
    ;;
  *)
    fail "unsupported mode: $MODE"
    ;;
esac
