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
  scripts/ship-worktrees.sh --cleanup-merged [--target <branch>] [--slug <slug>] [--dry-run]
  scripts/ship-worktrees.sh --recover <inspect|abort|reconcile> [--key <transaction-key>]

Default mode commits the authorized branch diff, scans it for private data,
pushes its frozen head and opens a Draft PR. Workflow artifacts are optional.
Existing managed lease writers retain their exact ownership fencing. It does not fast-forward main by default.
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
# Phases: prepared -> implementation_committed -> candidate_frozen -> lifecycle_applied
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
  sed -n "s/^    {\"phase\": \"${name}\", \"at\": \"[^\"]*\", \"ref\": \"\([^\"]*\)\".*\$/\1/p" "$file" | tail -1
}

# Publication payloads are emitted as one canonical JSON line by the trusted
# CLI. This reads only that durable carrier; validation happens in the CLI
# before any retry is allowed to reuse it.
closeout_journal_phase_publication() {
  local file="$1/status.json" name="$2"
  [[ -f "$file" ]] || return 1
  sed -n "/^    {\"phase\": \"${name}\", / { s/^.*\"publication\": //; s/,$//; s/}$//; p; }" "$file" | tail -1
}

# Rewrites the whole status document so the phase list has exactly one authority
# and lands in one atomic rename. An empty phase name only flips the status.
closeout_journal_record() {
  local dir="$1" status_value="$2" name="$3" ref="${4:-}" publication="${5:-}"
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
    if [[ -n "$publication" ]]; then
      # The trusted publication CLI emits this canonical JSON object. It is
      # journal evidence, not workflow state, and supports crash convergence.
      lines+=("{\"phase\": \"$(json_escape "$name")\", \"at\": \"$stamp\", \"ref\": \"$(json_escape "$ref")\", \"publication\": $publication}")
    else
      lines+=("{\"phase\": \"$(json_escape "$name")\", \"at\": \"$stamp\", \"ref\": \"$(json_escape "$ref")\"}")
    fi
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
  local dir="$1" index_file="$1/snapshot/paths.tsv"
  local original_head owned_head expected_branch current_branch current_head
  [[ -f "$index_file" && ! -L "$index_file" ]] || { echo "recovery: snapshot index unavailable; work preserved" >&2; return 1; }
  [[ ! -s "$index_file" ]] || { echo "recovery: legacy artifact snapshot requires explicit migration; work preserved" >&2; return 1; }
  expected_branch="$(closeout_journal_field "$dir/meta.json" branch)"
  current_branch="$(git symbolic-ref -q HEAD)" || { echo "recovery: detached or unknown branch; work preserved" >&2; return 1; }
  [[ -n "$expected_branch" && "$current_branch" == "refs/heads/$expected_branch" ]] || { echo "recovery: branch differs from journal; work preserved" >&2; return 1; }
  original_head="$(closeout_journal_field "$dir/meta.json" original_head)"
  [[ "$original_head" =~ ^[a-f0-9]{40,64}$ ]] || { echo "recovery: original head unavailable; work preserved" >&2; return 1; }
  current_head="$(git rev-parse HEAD)"
  [[ "$current_head" != "$original_head" ]] || return 0
  owned_head="$(closeout_journal_phase_ref "$dir" implementation_committed)"
  [[ "$owned_head" =~ ^[a-f0-9]{40,64}$ && "$current_head" == "$owned_head" ]] || { echo "recovery: head differs from owned commit; work preserved" >&2; return 1; }
  [[ -z "$(git status --porcelain=v1 --untracked-files=all)" ]] || { echo "recovery: new dirty or untracked work requires a user decision; work preserved" >&2; return 1; }
  git update-ref "$current_branch" "$original_head" "$owned_head" || return 1
  # Change only the index/ref. The authorized implementation contents survive
  # as an uncommitted diff; user files are never restored from a folder snapshot.
  git read-tree "$original_head"
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
  plan=""
  contract=""
  key="$("$BUN_BIN" -e '
const p=require("path"),{pathToFileURL}=require("url");
const {deriveShipJournalKey}=await import(pathToFileURL(p.join(process.argv[1],"..","src","effects","publication","publication-lifecycle.ts")).href);
const [,dir,root,repo,worktree,branch,remote,publication_mode,claim_id,claim_task_id,claim_generation,claim_task_revision,original_head,target_branch,base_sha,git]=process.argv;
process.stdout.write(deriveShipJournalKey(root,{repo,worktree,branch,remote,publication_mode,claim_id,claim_task_id,claim_generation,claim_task_revision,original_head,target_branch,base_sha},git));
' "$helper_dir" "$REPO_ROOT" "$(closeout_journal_root)" "$closeout_journal_worktree" "$branch" "$REMOTE_NAME" "$publication_mode" "$publication_claim_id" "$publication_task_id" "$publication_generation" "$publication_task_revision" "$original_head" "$TARGET_BRANCH" "$base_sha" "$GIT_BIN")"
  closeout_claim_bind_journal "$key"
  closeout_journal_begin "ship" "$key" \
    "branch=$branch" \
    "plan=$plan" \
    "contract=$contract" \
    "original_head=$original_head" \
    "target_branch=$TARGET_BRANCH" \
    "base_ref=$gate_base_ref" \
    "base_sha=$base_sha" \
    "remote=$REMOTE_NAME" \
    "publication_mode=$publication_mode" \
    "claim_id=$publication_claim_id" \
    "claim_task_id=$publication_task_id" \
    "claim_generation=$publication_generation" \
    "claim_task_revision=$publication_task_revision" || begin_status=$?
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
  ship_transaction_write_index
  closeout_journal_record "$closeout_journal_dir" in_progress prepared "$original_head"
}

# Guarded on the journal handle rather than the transaction flag: `pr_observed`
# and `complete` are recorded after ship_transaction_commit released the local
# rollback, because by then the push is already an external effect.
ship_transaction_phase() {
  [[ -n "$closeout_journal_dir" ]] || return 0
  closeout_journal_record "$closeout_journal_dir" in_progress "$1" "${2:-}" "${3:-}"
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
    local current_head owned_head branch_ref
    current_head="$(git rev-parse HEAD)"
    owned_head="$(closeout_journal_phase_ref "$closeout_journal_dir" implementation_committed)"
    [[ "$current_head" == "$owned_head" ]] || { echo "ship: branch moved outside this transaction; preserve work and journal" >&2; return 1; }
    branch_ref="$(git symbolic-ref HEAD)"
    git update-ref "$branch_ref" "$ship_transaction_original_head" "$owned_head" || return 1
    git read-tree "$ship_transaction_original_head" || return 1
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
    if closeout_ship_effect_landed "$closeout_journal_dir"; then
      echo "ship-worktrees: push already landed; retain journal and reconcile without pushing again" >&2
    else
      ship_transaction_abort || status=1
    fi
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

  echo "ship-worktrees: work is preserved; deletion requires the user decision." >&2
  return 1
}

guard_dirty_merged_worktree() {
  local branch="$1" path="$2"
  [[ -z "$(git -C "$path" status --porcelain=v1 --untracked-files=all)" ]] && return 0
  fail_dirty_merged_worktree "$branch" "$path"
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

finish_contract_worktree() {
  local merge_mode="$1"
  [[ "$merge_mode" == "local" ]] || fail "PR preparation does not use contract-worktree finish"
  run_cmd bash "$helper_dir/contract-worktree.sh" finish --target "$TARGET_BRANCH"
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
  result="$("$BUN_BIN" "$helper_dir/merge-gate.ts" fingerprint --base "$base_ref" --format required)" || fail "cannot read merge-gate requirement from $base_ref"
  [[ "$result" == "true" ]]
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
Goal: prepare \`$branch\` for review and automated main checks.
Change: publish the current branch without workflow-stage artifacts.
Verification: not claimed by this PR preparation; main consumes Required / CI on the exact head/base.
Risk: assess the actual diff; request review for large/security/permission changes or uncertainty.
Rollback: revert the squash merge commit after integration.
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

  existing="$("$gh_bin" pr list --base "$TARGET_BRANCH" --head "$branch" --json url --jq '.[0].url // ""')" || fail "PR observation unavailable; no create was attempted"
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
  else
    status=$?
  fi

  existing="$("$gh_bin" pr list --base "$TARGET_BRANCH" --head "$branch" --json url --jq '.[0].url // ""')" || fail "PR observation unavailable; no create was attempted"
  if [[ -n "$existing" ]]; then
    echo "[Ship] PR already exists for $branch after create failure: $existing"
    return 0
  fi

  [[ -z "$output" ]] || printf '%s\n' "$output" >&2
  fail "gh pr create failed for $branch (exit $status)"
}

# A claim token is only a locator. The publication CLI re-reads the shared
# common-dir lease owner record before it reads task_revision or generation.
publication_claim_id=""
publication_task_id=""
publication_generation=""
publication_task_revision=""
publication_journal_payload=""
publication_create_intent=""
publication_create_intent_journal=""
publication_cli_stdout=""
publication_cli_stderr=""

resolve_publication_claim_token() {
  local marker dir token
  publication_claim_id=""
  publication_task_id=""
  publication_token_file=""
  marker="$(policy_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
  dir="$(dirname "$marker")/claims"
  [[ ! -L "$dir" ]] || return 1
  if [[ ! -e "$dir" ]]; then return 2; fi
  [[ -d "$dir" && -r "$dir" && -x "$dir" ]] || return 1
  for token in "$dir"/*.claim; do
    [[ ! -L "$token" ]] || return 1
    [[ -f "$token" ]] || continue
    [[ -z "$publication_token_file" ]] || return 1
    publication_token_file="$token"
  done
  [[ -n "$publication_token_file" ]] || return 2
  publication_claim_id="$(sed -n 's/^claim_id=//p' "$publication_token_file" | head -1)"
  publication_task_id="$(sed -n 's/^task_id=//p' "$publication_token_file" | head -1)"
  [[ -n "$publication_claim_id" && -n "$publication_task_id" ]]
}

read_publication_claim_identity() {
  local identity
  identity="$("$BUN_BIN" -e '
const p=require("path"),{pathToFileURL}=require("url");
const {readShipClaimIdentity}=await import(pathToFileURL(p.join(process.argv[1],"..","src","effects","publication","publication-lifecycle.ts")).href);
process.stdout.write(JSON.stringify(readShipClaimIdentity({repo_root:process.argv[2],task_id:process.argv[3],claim_id:process.argv[4],branch:process.argv[5],target_ref:process.argv[6]})));
' "$helper_dir" "$REPO_ROOT" "$publication_task_id" "$publication_claim_id" "$(current_branch)" "$TARGET_BRANCH")" || fail "live claim identity/binding unavailable"
  publication_generation="$(printf '%s' "$identity" | jq -r '.generation | tostring')"
  publication_task_revision="$(printf '%s' "$identity" | jq -r '.task_revision')"
}

publication_cli() {
  publication_command_cli receipt "$@"
}

publication_command_cli() {
  if [[ -n "${REPO_HARNESS_CLI_BIN:-}" ]]; then
    is_trusted_executable "$REPO_HARNESS_CLI_BIN" || return 1
    "$REPO_HARNESS_CLI_BIN" publication "$@"
  elif [[ -n "$BUN_BIN" ]] && is_trusted_executable "$BUN_BIN" && [[ -f "src/cli/index.ts" ]]; then
    "$BUN_BIN" "src/cli/index.ts" publication "$@"
  elif command -v repo-harness >/dev/null 2>&1; then
    repo-harness publication "$@"
  else
    return 1
  fi
}

# Keep trusted CLI stdout separate from diagnostics. The journal consumes only
# a revalidated single JSON envelope; provider/tool log noise is never embedded.
publication_cli_capture() {
  local stdout_file stderr_file status
  publication_cli_stdout=""
  publication_cli_stderr=""
  stdout_file="$(mktemp "${TMPDIR:-/tmp}/repo-harness-publication.stdout.XXXXXX")" || return 1
  stderr_file="$(mktemp "${TMPDIR:-/tmp}/repo-harness-publication.stderr.XXXXXX")" || {
    rm -f "$stdout_file"
    return 1
  }
  if publication_cli "$@" >"$stdout_file" 2>"$stderr_file"; then
    status=0
  else
    status=$?
  fi
  publication_cli_stdout="$(<"$stdout_file")"
  publication_cli_stderr="$(<"$stderr_file")"
  rm -f "$stdout_file" "$stderr_file"
  return "$status"
}

validate_publication_journal_envelope() {
  local kind="$1" payload="$2"
  [[ -n "$payload" ]] || return 1
  if ! publication_cli_capture validate-journal-envelope --kind "$kind" --json "$payload"; then
    [[ -z "$publication_cli_stderr" ]] || printf '%s\n' "$publication_cli_stderr" >&2
    return 1
  fi
  [[ -z "$publication_cli_stderr" ]] || printf '%s\n' "$publication_cli_stderr" >&2
  [[ -n "$publication_cli_stdout" ]] || return 1
  printf '%s' "$publication_cli_stdout"
}

prepare_publication_receipt() {
  local branch="$1" output validated
  publication_create_intent=""
  publication_create_intent_journal=""
  if ! resolve_publication_claim_token; then
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"no unique local claim token can locate publication authority"}' >&2
    return 1
  fi
  if ! publication_cli_capture prepare \
    --task-id "$publication_task_id" \
    --claim-id "$publication_claim_id" \
    --branch "$branch" \
    --target "$TARGET_BRANCH"; then
    [[ -z "$publication_cli_stderr" ]] || printf '%s\n' "$publication_cli_stderr" >&2
    return 1
  fi
  [[ -z "$publication_cli_stderr" ]] || printf '%s\n' "$publication_cli_stderr" >&2
  output="$publication_cli_stdout"
  if ! validated="$(validate_publication_journal_envelope prepare "$output")"; then
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"publication prepare output is not one canonical journal envelope"}' >&2
    return 1
  fi
  case "$validated" in
    '{"action":"create","create_intent":{'*) publication_create_intent="$validated" ;;
    '{"action":"existing","create_intent":null,'*) ;;
    *)
      printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"publication prepare envelope action is invalid"}' >&2
      return 1
      ;;
  esac
}

load_publication_create_intent() {
  local dir="$1" payload validated
  publication_create_intent=""
  publication_create_intent_journal=""
  payload="$(closeout_journal_phase_publication "$dir" publication_create_intent)" || return 1
  if ! validated="$(validate_publication_journal_envelope prepare "$payload")"; then
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"journal publication create intent is malformed"}' >&2
    return 1
  fi
  case "$validated" in
    '{"action":"create","create_intent":{'*)
      publication_create_intent="$validated"
      publication_create_intent_journal="$dir/status.json"
      ;;
    *)
      printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"journal publication create intent does not authorize creation"}' >&2
      return 1
      ;;
  esac
}

# Cache first, then marker. Any failure after the PR exists stays an explicit,
# non-zero publication_incomplete outcome; recover reconcile retries this path.
ensure_publication_receipt() {
  local branch="$1" output validated
  local -a args
  publication_journal_payload=""
  if ! resolve_publication_claim_token; then
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"no unique local claim token can locate publication authority"}' >&2
    return 1
  fi
  args=(ensure --task-id "$publication_task_id" --claim-id "$publication_claim_id" --branch "$branch" --target "$TARGET_BRANCH")
  if [[ -n "$publication_create_intent" ]]; then
    [[ -n "$publication_create_intent_journal" ]] || {
      printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"publication create intent lacks its durable journal"}' >&2
      return 1
    }
    args+=(--create-intent "$publication_create_intent" --create-intent-journal "$publication_create_intent_journal")
  fi
  if ! publication_cli_capture "${args[@]}"; then
    [[ -z "$publication_cli_stderr" ]] || printf '%s\n' "$publication_cli_stderr" >&2
    return 1
  fi
  [[ -z "$publication_cli_stderr" ]] || printf '%s\n' "$publication_cli_stderr" >&2
  output="$publication_cli_stdout"
  [[ -n "$output" ]] || {
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"publication CLI returned no journal evidence"}' >&2
    return 1
  }
  if ! validated="$(validate_publication_journal_envelope evidence "$output")"; then
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"publication ensure output is not one canonical journal envelope"}' >&2
    return 1
  fi
  publication_journal_payload="$validated"
}

# This is deliberately after durable pr_observed and before complete. The raw
# finish command runs before provider facts exist and remains completing.
enter_publication_reviewing() {
  local output key
  [[ -n "$publication_task_id" && -n "$publication_claim_id" ]] || {
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"publication claim token is unavailable for review entry"}' >&2
    return 1
  }
  [[ -n "$closeout_journal_dir" && -f "$closeout_journal_dir/status.json" ]] || {
    printf '%s\n' '{"ok":false,"error":"publication_incomplete","message":"ship journal is unavailable for review entry"}' >&2
    return 1
  }
  key="$(basename "$closeout_journal_dir")"
  if ! output="$(publication_command_cli mark-reviewing \
    --task-id "$publication_task_id" \
    --claim-id "$publication_claim_id" \
    --ship-transaction-key "$key" \
    --ship-journal "$closeout_journal_dir/status.json")"; then
    return 1
  fi
  [[ -n "$output" ]] || return 1
  printf '%s\n' "$output"
}

observe_plain_pr() {
  local branch="$1" expected_head="$2" expected_base="$3" result
  result="$("${REPO_HARNESS_GH_BIN:-gh}" pr view "$branch" --json number,url,headRefName,baseRefName,headRefOid,baseRefOid)" || fail "PR readback unavailable; push may have landed, retain journal"
  printf '%s' "$result" | jq -e --arg branch "$branch" --arg target "$TARGET_BRANCH" --arg head "$expected_head" --arg base "$expected_base" '
    type == "object" and (.number | type == "number") and .number > 0 and (.url | type == "string")
    and .headRefName == $branch and .baseRefName == $target and .headRefOid == $head and .baseRefOid == $base
  ' >/dev/null || fail "PR identity/head/base changed; retain journal for recovery"
  publication_journal_payload="$(printf '%s' "$result" | jq -c '{kind:"branch-pr-observation",pr_number:.number,url,head_sha:.headRefOid,base_sha:.baseRefOid}')"
}

ship_linked_pr() {
  local branch gate_base_ref verified_sha
  branch="$(current_branch)"
  [[ -n "$branch" ]] || fail "detached HEAD is not supported"
  [[ "$branch" != "$TARGET_BRANCH" ]] || fail "refusing to ship target branch as linked worktree"

  refresh_target_base
  gate_base_ref="refs/remotes/$REMOTE_NAME/$TARGET_BRANCH"
  local claim_status=0
  resolve_publication_claim_token || claim_status=$?
  [[ "$claim_status" -eq 0 || "$claim_status" -eq 2 ]] || fail "invalid or ambiguous claim token; publication refused"
  if [[ "$claim_status" -eq 0 ]]; then
    read_publication_claim_identity
    # A managed lease owns this writer, so use its existing fenced closeout.
    # The same finish implementation has no planning/acceptance ceremony.
    run_cmd bash "$helper_dir/contract-worktree.sh" finish --no-merge --target "$TARGET_BRANCH"
  fi
  publication_mode=branch
  [[ "$claim_status" -ne 0 ]] || publication_mode=lease
  local begin_status=0
  ship_transaction_begin || begin_status=$?
  [[ "$begin_status" -ne 2 ]] || return 0
  if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
    run_cmd git add -A
    run_cmd git commit -m "feat: prepare ${branch}"
  fi
  verified_sha="$(git rev-parse HEAD)"
  ship_transaction_phase implementation_committed "$verified_sha"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    [[ "$(git rev-parse "$gate_base_ref^{commit}")" == "$(closeout_journal_field "$closeout_journal_dir/meta.json" base_sha)" ]] || fail "base changed before push"
    local scanned_head
    scanned_head="$("$BUN_BIN" "$helper_dir/merge-gate.ts" fingerprint --base "$gate_base_ref" --format sha)" || fail "candidate security scan failed"
    [[ "$scanned_head" == "$verified_sha" ]] || fail "candidate changed during security scan"
  fi
  ship_transaction_phase candidate_frozen "$verified_sha"
  if [[ "$DRY_RUN" -eq 0 && "$claim_status" -eq 0 ]]; then
    prepare_publication_receipt "$branch" || fail "publication receipt preparation failed (publication_incomplete)"
    if [[ -n "$publication_create_intent" ]]; then
      ship_transaction_phase publication_create_intent "$verified_sha" "$publication_create_intent"
      publication_create_intent_journal="$closeout_journal_dir/status.json"
    fi
  fi
  ship_transaction_phase push_started "$verified_sha"
  push_branch "$branch" "$verified_sha"
  ship_transaction_phase pushed "$verified_sha"
  ship_transaction_commit
  ship_transaction_phase pr_create_started "$verified_sha"
  create_or_report_pr "$branch"
  if [[ "$DRY_RUN" -eq 0 && "$claim_status" -eq 0 ]]; then
    ensure_publication_receipt "$branch" || fail "publication receipt persistence failed (publication_incomplete)"
    ship_transaction_phase pr_observed "$verified_sha" "$publication_journal_payload"
    enter_publication_reviewing || fail "publication review entry failed (publication_incomplete)"
  elif [[ "$DRY_RUN" -eq 0 ]]; then
    observe_plain_pr "$branch" "$verified_sha" "$(closeout_journal_field "$closeout_journal_dir/meta.json" base_sha)"
    ship_transaction_phase pr_observed "$verified_sha" "$publication_journal_payload"
  fi
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
  local status branch
  status="$(git status --porcelain=v1 --untracked-files=all)"
  [[ -n "$status" ]] || return 0
  [[ "$(current_branch)" == "$TARGET_BRANCH" ]] || fail "main closeout must start from $TARGET_BRANCH"
  [[ -n "$SLUG_OVERRIDE" ]] || fail "dirty main needs --slug to name its PR branch; work is preserved"
  branch="${BRANCH_PREFIX}${SLUG_OVERRIDE}-main-closeout"
  ! git show-ref --verify --quiet "refs/heads/$branch" || fail "closeout branch already exists: $branch"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[Ship] Would create $branch, commit the authorized diff, push and open a Draft PR; no check result claimed."
    return 0
  fi
  run_cmd git switch -c "$branch"
  ship_linked_pr
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
  local branch path slug merge_mode item_status cleaned=0 blocked=0 skipped=0
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
      # Keep errexit active inside the item, including scaffold discard helpers.
      # Calling this subshell in an if/|| condition would disable that protection.
      set +e
      (
        set -e
        ensure_worktree_status_for_cleanup "$path"
        lock_path="$(git -C "$path" rev-parse --git-path locked)"
        if [[ -e "$lock_path" ]]; then
          fail "linked worktree is locked, refusing cleanup: $path"
        fi
        guard_dirty_merged_worktree "$branch" "$path"
        if [[ "$DRY_RUN" -eq 1 ]]; then
          # run_cmd deliberately skips execution in dry-run; the guard above
          # is therefore the read-only safety check for this preview.
          run_cmd bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$TARGET_BRANCH" --dry-run
        else
          run_cmd bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$TARGET_BRANCH"
        fi
      )
      item_status=$?
      set -e
      if [[ "$item_status" -eq 0 ]]; then
        cleaned=$((cleaned + 1))
      else
        blocked=$((blocked + 1))
        echo "[Ship] Cleanup blocked: $branch at $path (exit $item_status)" >&2
      fi
    else
      echo "[Ship] Skipped unmerged branch: $branch"
      skipped=$((skipped + 1))
    fi
  done < <(list_contract_worktrees "$BRANCH_PREFIX")

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[Ship] Cleanup summary: would-clean=$cleaned blocked=$blocked skipped=$skipped"
  else
    echo "[Ship] Cleanup summary: cleaned=$cleaned blocked=$blocked skipped=$skipped"
  fi
  [[ "$blocked" -eq 0 ]] || return 1
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
  local dir="$1" verified remote branch observed
  closeout_journal_has_phase "$dir" pushed && return 0
  closeout_journal_has_phase "$dir" push_started || return 1
  verified="$(closeout_journal_phase_ref "$dir" candidate_frozen)"
  [[ "$verified" =~ ^[a-f0-9]{40,64}$ ]] || fail "push intent has no exact candidate; journal retained"
  remote="$(closeout_journal_field "$dir/meta.json" remote)"
  branch="$(closeout_journal_field "$dir/meta.json" branch)"
  [[ -n "$remote" && -n "$branch" ]] || fail "push intent metadata incomplete; journal retained"
  observed="$(git ls-remote "$remote" "refs/heads/$branch")" || fail "push result unavailable; journal retained for reconciliation"
  [[ -n "$observed" ]] || return 1
  [[ "${observed%%[[:space:]]*}" == "$verified" ]] || fail "remote branch differs from push intent; journal retained without replay"
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
  if [[ "$action" != "inspect" ]]; then
    local known_mode
    known_mode="$(closeout_journal_field "$dir/meta.json" publication_mode)"
    [[ "$known_mode" == "branch" || "$known_mode" == "lease" ]] || fail "legacy/unknown journal requires explicit migration; no publication mode inferred"
  fi
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
      verified="$(closeout_journal_phase_ref "$dir" candidate_frozen)"
      closeout_journal_has_phase "$dir" pushed || closeout_journal_record "$dir" in_progress pushed "$verified"
      local recorded_mode
      recorded_mode="$(closeout_journal_field "$dir/meta.json" publication_mode)"
      if [[ "$recorded_mode" == "branch" ]]; then
        local current_claim_status=0
        resolve_publication_claim_token || current_claim_status=$?
        [[ "$current_claim_status" -eq 2 ]] || fail "branch recovery found a managed or invalid claim; retain journal"
        create_or_report_pr "$branch"
        observe_plain_pr "$branch" "$verified" "$(closeout_journal_field "$dir/meta.json" base_sha)"
        if ! closeout_journal_has_phase "$dir" pr_observed; then
          closeout_journal_record "$dir" in_progress pr_observed "$verified" "$publication_journal_payload"
        fi
        closeout_journal_record "$dir" complete complete "$verified"
        rm -rf "$dir/snapshot"
        closeout_claim_release
        echo "[Ship] Reconciled ordinary PR from existing push; no push or receipt was replayed: $dir"
        return 0
      fi
      [[ "$recorded_mode" == "lease" ]] || fail "legacy or unknown publication mode requires explicit journal migration; no identity inferred"
      resolve_publication_claim_token || fail "live claim token unavailable during recovery"
      read_publication_claim_identity
      [[ "$(closeout_journal_field "$dir/meta.json" claim_id)" == "$publication_claim_id"
        && "$(closeout_journal_field "$dir/meta.json" claim_task_id)" == "$publication_task_id"
        && "$(closeout_journal_field "$dir/meta.json" claim_generation)" == "$publication_generation"
        && "$(closeout_journal_field "$dir/meta.json" claim_task_revision)" == "$publication_task_revision" ]] || fail "claim identity changed; refusing wrong-claim journal replay"
      if ! closeout_journal_has_phase "$dir" pr_observed; then
        if closeout_journal_has_phase "$dir" publication_create_intent; then
          load_publication_create_intent "$dir" || fail "journal publication create intent is invalid (publication_incomplete)"
        else
          prepare_publication_receipt "$branch" || fail "publication receipt preparation failed (publication_incomplete)"
          if [[ -n "$publication_create_intent" ]]; then
            closeout_journal_record "$dir" in_progress publication_create_intent "$verified" "$publication_create_intent"
            publication_create_intent_journal="$dir/status.json"
          fi
        fi
        create_or_report_pr "$branch"
        ensure_publication_receipt "$branch" || fail "publication receipt persistence failed (publication_incomplete)"
        closeout_journal_record "$dir" in_progress pr_observed "$verified" "$publication_journal_payload"
      fi
      # Once pr_observed exists the lease may already be reviewing: replay the
      # lifecycle proof directly instead of calling the completing-only receipt
      # writer again. The transition is idempotent for the same pointer/key.
      resolve_publication_claim_token || fail "publication claim token is unavailable for review recovery (publication_incomplete)"
      closeout_journal_dir="$dir"
      enter_publication_reviewing || fail "publication review entry failed (publication_incomplete)"
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
      fail "--discard-scaffold-only was removed; dirty work requires a user decision"
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
    if [[ "$(current_branch)" != "$TARGET_BRANCH" ]]; then
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
