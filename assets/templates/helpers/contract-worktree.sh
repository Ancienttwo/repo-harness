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

worktree_merge_lib="$helper_dir/worktree-merge-lib.sh"
[[ -f "$worktree_merge_lib" ]] || { echo "contract-worktree: worktree merge library is unavailable: $worktree_merge_lib" >&2; exit 1; }
# shellcheck source=worktree-merge-lib.sh
. "$worktree_merge_lib"

usage() {
  cat <<'USAGE_EOF'
Usage:
  repo-harness run contract-worktree start --plan <plan-file> [--path <worktree-path>] [--branch <branch-name>]
  repo-harness run contract-worktree finish [--merge|--no-merge] [--target <branch>] [--gate-base <ref>] [--message <commit-message>]
  repo-harness run contract-worktree cleanup --slug <slug> [--target <branch>] [--dry-run]
  repo-harness run contract-worktree status
  repo-harness run contract-worktree recover <inspect|abort|reconcile> [--key <transaction-key>]
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

# The projection manifest is the one architecture artifact with no human-authored
# region: it is byte-derivable from the architecture model plus the provenance stamp,
# and the hook cascade re-stamps it whenever a declared source footprint moves. The
# target worktree is therefore routinely dirty in this one path through no decision of
# the operator's, and the closeout then refuses a merge that has nothing to do with it.
# The capability documents are `mixed` ownership (human-authored §3/§4) and are never
# touched here — discarding those could destroy work no projection can regenerate.
#
# This restores the file to HEAD rather than exempting it from the dirty check, because
# an exemption does not actually unblock the merge: `git merge --ff-only` refuses to
# overwrite local modifications to a file the publication tree also changes, so the
# refusal would just move past `publication_prepared`, mid-transaction.
#
# Bounded on purpose: only a plain unstaged modification is restored. A staged change or
# an untracked file still refuses, because those carry an intent this cannot read.
MACHINE_OWNED_PROJECTION_PATH="docs/architecture/.projection-manifest.json"

restore_machine_owned_projection_output() {
  local worktree="$1" porcelain
  porcelain="$(git -C "$worktree" status --porcelain=v1 --untracked-files=all -- "$MACHINE_OWNED_PROJECTION_PATH")"
  [[ "$porcelain" == " M $MACHINE_OWNED_PROJECTION_PATH" ]] || return 0
  git -C "$worktree" checkout -- "$MACHINE_OWNED_PROJECTION_PATH"
  echo "[ContractWorktree] restored machine-owned projection output to HEAD: $MACHINE_OWNED_PROJECTION_PATH" >&2
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

bootstrap_worktree_runtime() {
  # A fresh linked worktree starts without the gitignored runtime artifacts the
  # verification gates depend on, and both resulting failures name neither cause.
  # A missing dependency tree surfaces as `state=missing`, because
  # check-architecture-sync resolves the provider through the candidate build,
  # which requires archctx package-locally, while the globally installed CLI
  # resolves it elsewhere and cheerfully reports ready. A missing code index
  # surfaces as `unresolved-major-change` listing every capability, because
  # archctx cannot prove a single flow without code facts. Seeding both here
  # keeps that diagnosis from being re-derived once per worktree.
  local worktree_path="$1"

  if [[ -f "$worktree_path/package.json" ]] \
    && { [[ -f "$worktree_path/bun.lock" ]] || [[ -f "$worktree_path/bun.lockb" ]]; } \
    && command -v bun >/dev/null 2>&1 \
    && [[ ! -d "$worktree_path/node_modules" ]]; then
    echo "[ContractWorktree] Installing dependencies (gates resolve archctx package-locally)"
    if ! (cd "$worktree_path" && bun install --frozen-lockfile >/dev/null); then
      echo "[ContractWorktree] bun install --frozen-lockfile failed; no verification gate can run in this worktree" >&2
      return 1
    fi
  fi

  # Mirror only an adoption the primary worktree already made. No .codegraph
  # directory means the operator did not opt into indexing, and start has no
  # business opting in on their behalf.
  if [[ -d "$REPO_ROOT/.codegraph" ]] \
    && command -v codegraph >/dev/null 2>&1 \
    && [[ ! -f "$worktree_path/.codegraph/codegraph.db" ]]; then
    echo "[ContractWorktree] Indexing CodeGraph (architecture projection requires code facts)"
    if ! (cd "$worktree_path" && codegraph init >/dev/null 2>&1); then
      echo "[ContractWorktree] codegraph init failed; architecture projection will report unresolved-major-change for every capability" >&2
      return 1
    fi
  fi

  return 0
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

  bootstrap_worktree_runtime "$worktree_path"
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

# A complete ref identifies the durable external effect, not necessarily the
# current source-worktree HEAD. Local/no-merge and ship transactions complete at
# the source HEAD; single-publication finish completes at the synthesized target
# commit, so replay must prove that exact target ref is still installed.
closeout_journal_complete_effect_present() {
  local dir="$1" complete_ref operation merge_back target_branch
  complete_ref="$(closeout_journal_phase_ref "$dir" complete)"
  [[ -n "$complete_ref" ]] || return 1
  operation="$(closeout_journal_field "$dir/meta.json" operation)"
  merge_back="$(closeout_journal_field "$dir/meta.json" merge_back)"
  if [[ "$operation" == "finish" && "$merge_back" == "1" ]]; then
    target_branch="$(closeout_journal_field "$dir/meta.json" target_branch)"
    [[ -n "$target_branch" ]] || return 1
    git merge-base --is-ancestor "$complete_ref" "refs/heads/$target_branch" >/dev/null 2>&1
    return
  fi
  [[ "$(git rev-parse HEAD)" == "$complete_ref" ]]
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
      if closeout_journal_complete_effect_present "$dir"; then
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

# The snapshot path index is persisted next to the copies so a fresh recovery
# process can restore without the in-memory arrays that died with the crash.
finish_transaction_write_index() {
  local index
  {
    for ((index = 0; index < ${#finish_transaction_paths[@]}; index++)); do
      printf '%s\t%s\t%s\n' "$index" "${finish_transaction_paths[$index]}" "${finish_transaction_existed[$index]}"
    done
  } | closeout_journal_write "$finish_transaction_dir/paths.tsv"
}

# Requires an open journal (closeout_journal_begin). The snapshot lands inside
# the journal directory and `prepared` is only recorded once both the copies and
# their index are durable.
finish_transaction_begin() {
  finish_transaction_dir="$closeout_journal_dir/snapshot"
  mkdir -p "$finish_transaction_dir"
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
  finish_transaction_write_index
  closeout_journal_record "$closeout_journal_dir" in_progress prepared "$finish_transaction_original_head"
}

finish_transaction_phase() {
  [[ "$finish_transaction_active" -eq 1 ]] || return 0
  closeout_journal_record "$closeout_journal_dir" in_progress "$1" "${2:-}"
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
  finish_transaction_active=0
  finish_transaction_original_head=""
  trap - EXIT
  # Status first, payload second: a crash between the two must leave a journal
  # that still has its snapshot, never one that claims progress it cannot undo.
  closeout_journal_record "$closeout_journal_dir" aborted "" ""
  rm -rf "$finish_transaction_dir"
  finish_transaction_dir=""
  closeout_claim_release
  echo "contract-worktree: finish failed; restored live workflow artifacts and the pre-finish branch" >&2
}

finish_transaction_commit() {
  local head="${1:-}"
  head="${head:-$(git rev-parse HEAD)}"
  finish_transaction_active=0
  trap - EXIT
  closeout_journal_record "$closeout_journal_dir" complete complete "$head"
  rm -rf "$finish_transaction_dir"
  finish_transaction_dir=""
  finish_transaction_original_head=""
  closeout_claim_release
}

finish_transaction_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$finish_transaction_active" -eq 1 && "$status" -ne 0 ]]; then
    if closeout_finish_effect_landed "$closeout_journal_dir"; then
      echo "contract-worktree: finish failed after target publication landed; journal retained for 'recover reconcile'" >&2
    else
      finish_transaction_abort || status=1
    fi
  fi
  exit "$status"
}

# True once finish's only external effect -- publication on the target branch --
# is observable, whether or not the `merged` phase was reached before the
# interrupt. `abort` refuses on true, `reconcile` refuses on false, so the window
# between the target update and its phase record cannot defeat either rule.
closeout_finish_effect_landed() {
  local dir="$1" head target_branch base_sha
  closeout_journal_has_phase "$dir" merged && return 0
  [[ "$(closeout_journal_field "$dir/meta.json" merge_back)" == "1" ]] || return 1
  head="$(closeout_journal_phase_ref "$dir" publication_prepared)"
  if [[ -z "$head" ]]; then
    # Journals opened before single-publication cutover recorded the source
    # branch head instead. Retain that exact landed-effect probe so an already
    # applied legacy fast-forward can never be mistaken for an abortable local
    # transaction.
    head="$(closeout_journal_phase_ref "$dir" lifecycle_committed)"
    [[ -n "$head" ]] || head="$(closeout_journal_phase_ref "$dir" implementation_committed)"
  fi
  [[ -n "$head" ]] || return 1
  base_sha="$(closeout_journal_field "$dir/meta.json" base_sha)"
  [[ "$head" != "$base_sha" ]] || return 1
  target_branch="$(closeout_journal_field "$dir/meta.json" target_branch)"
  [[ -n "$target_branch" ]] || return 1
  git show-ref --verify --quiet "refs/heads/$target_branch" || return 1
  git merge-base --is-ancestor "$head" "refs/heads/$target_branch" >/dev/null 2>&1
}

closeout_recover_select() {
  local key="$1" dir
  local -a found=()
  if [[ -n "$key" ]]; then
    dir="$(closeout_journal_root)/finish/$key"
    [[ -f "$dir/status.json" ]] || { echo "contract-worktree: no closeout journal for key: $key" >&2; return 1; }
    printf '%s' "$dir"
    return 0
  fi
  while IFS= read -r dir; do
    [[ -n "$dir" ]] || continue
    found+=("$dir")
  done < <(closeout_journal_list "finish" "in_progress")
  if [[ "${#found[@]}" -eq 0 ]]; then
    echo "contract-worktree: no unfinished closeout journal for this worktree" >&2
    return 1
  fi
  if [[ "${#found[@]}" -gt 1 ]]; then
    echo "contract-worktree: multiple unfinished closeout journals; pass --key" >&2
    printf '%s\n' "${found[@]}" >&2
    return 1
  fi
  printf '%s' "${found[0]}"
}

recover_worktree() {
  local action="${1:-}" key="" dir status last_phase head claim claim_result=0
  shift || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --key)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --key requires a value" >&2; exit 2; }
        key="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        echo "contract-worktree: unknown recover argument: $1" >&2
        usage
        exit 2
        ;;
    esac
  done

  case "$action" in
    inspect|abort|reconcile) ;;
    *)
      echo "contract-worktree: recover requires inspect, abort, or reconcile" >&2
      usage
      exit 2
      ;;
  esac

  if [[ "$action" == "inspect" && -z "$key" ]]; then
    local reported=0
    while IFS= read -r dir; do
      [[ -n "$dir" ]] || continue
      closeout_journal_report "$dir" "[ContractWorktree]"
      reported=1
    done < <(closeout_journal_list "finish" "in_progress")
    if closeout_claim_report "finish" "[ContractWorktree]"; then
      reported=1
    fi
    if [[ "$reported" -eq 0 ]]; then
      echo "[ContractWorktree] No unfinished closeout journal for this worktree."
    fi
    return 0
  fi

  if [[ "$action" == "abort" && -z "$key" ]]; then
    claim="$(closeout_claim_path "finish")" || return 1
    if [[ -d "$claim" && -z "$(closeout_journal_list "finish" "in_progress" | head -1)" ]]; then
      closeout_claim_abort_orphan "finish" || claim_result=$?
      case "$claim_result" in
        0) echo "[ContractWorktree] Aborted orphan closeout ownership claim before journal preparation: $claim"; return 0 ;;
        2) echo "contract-worktree: closeout is still owned by a live process" >&2; return 1 ;;
        3) echo "contract-worktree: another recovery already owns this closeout" >&2; return 1 ;;
        *) echo "contract-worktree: ownership claim is not an abortable pre-journal orphan" >&2; return 1 ;;
      esac
    fi
  fi

  dir="$(closeout_recover_select "$key")" || return 1
  [[ "$(closeout_journal_field "$dir/meta.json" worktree)" == "$closeout_journal_worktree" ]] || {
    echo "contract-worktree: closeout journal belongs to another worktree: $(closeout_journal_field "$dir/meta.json" worktree)" >&2
    return 1
  }
  closeout_journal_operation="finish"
  closeout_journal_key_value="$(closeout_journal_field "$dir/meta.json" key)"
  status="$(closeout_journal_status "$dir")"
  last_phase="$(closeout_journal_last_phase "$dir")"

  case "$action" in
    inspect)
      closeout_journal_report "$dir" "[ContractWorktree]"
      return 0
      ;;
    abort)
      [[ "$status" == "in_progress" ]] || {
        echo "contract-worktree: refusing abort of a $status closeout journal: $dir" >&2
        return 1
      }
      claim_result=0
      closeout_claim_takeover_for_recovery "finish" || claim_result=$?
      case "$claim_result" in
        0) ;;
        2) echo "contract-worktree: closeout is still owned by a live process" >&2; return 1 ;;
        3) echo "contract-worktree: another recovery already owns this closeout" >&2; return 1 ;;
        *) echo "contract-worktree: closeout ownership claim is missing or unreadable" >&2; return 1 ;;
      esac
      if closeout_finish_effect_landed "$dir"; then
        echo "contract-worktree: refusing abort after the merge landed; run 'recover reconcile' instead: $dir" >&2
        return 1
      fi
      closeout_journal_restore_snapshot "$dir" || {
        echo "contract-worktree: closeout journal has no restorable snapshot: $dir" >&2
        return 1
      }
      closeout_journal_record "$dir" aborted "" ""
      rm -rf "$dir/snapshot"
      closeout_claim_release
      echo "[ContractWorktree] Aborted closeout transaction and restored the pre-closeout state: $dir"
      return 0
      ;;
    reconcile)
      [[ "$status" == "in_progress" ]] || {
        echo "contract-worktree: refusing reconcile of a $status closeout journal: $dir" >&2
        return 1
      }
      claim_result=0
      closeout_claim_takeover_for_recovery "finish" || claim_result=$?
      case "$claim_result" in
        0) ;;
        2) echo "contract-worktree: closeout is still owned by a live process" >&2; return 1 ;;
        3) echo "contract-worktree: another recovery already owns this closeout" >&2; return 1 ;;
        *) echo "contract-worktree: closeout ownership claim is missing or unreadable" >&2; return 1 ;;
      esac
      # Reconcile exists for an already-landed external effect. Without one the
      # correct recovery is a local rollback, so it refuses instead of guessing
      # -- and it never rolls anything back itself.
      closeout_finish_effect_landed "$dir" || {
        echo "contract-worktree: no landed merge to reconcile (last phase: $last_phase); run 'recover abort' instead" >&2
        return 1
      }
      head="$(closeout_journal_phase_ref "$dir" publication_prepared)"
      [[ -n "$head" ]] || head="$(closeout_journal_phase_ref "$dir" lifecycle_committed)"
      [[ -n "$head" ]] || head="$(closeout_journal_phase_ref "$dir" implementation_committed)"
      closeout_journal_has_phase "$dir" merged || closeout_journal_record "$dir" in_progress merged "$head"
      closeout_journal_record "$dir" complete complete "$head"
      rm -rf "$dir/snapshot"
      closeout_claim_release
      echo "[ContractWorktree] Reconciled closeout transaction; the merge was already applied: $dir"
      return 0
      ;;
  esac
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

# --- shared sprint lease gate ------------------------------------------------
# A contract worktree that holds a sprint claim token may publish only while it
# still owns that lease. The gate is the real enforcement boundary for `steal`:
# a stolen-from agent cannot publish, with or without any hook.
#
# A worktree holding no token is not executing a claimed sprint row (a plan
# captured outside the sprint flow), so there is no ownership to compare and
# nothing to gate.
sprint_lease_claim_id=""
sprint_lease_task_id=""
sprint_lease_token_file=""
SPRINT_CLI_RESOLVED=0
SPRINT_CLI_CMD=()

resolve_sprint_cli() {
  [[ "$SPRINT_CLI_RESOLVED" -eq 0 ]] || return 0
  if [[ -n "${REPO_HARNESS_CLI_BIN:-}" ]]; then
    if [[ "$REPO_HARNESS_CLI_BIN" != /* || ! -x "$REPO_HARNESS_CLI_BIN" ]]; then
      echo "contract-worktree: REPO_HARNESS_CLI_BIN is not an executable absolute path: $REPO_HARNESS_CLI_BIN" >&2
      return 1
    fi
    SPRINT_CLI_CMD=("$REPO_HARNESS_CLI_BIN")
  elif command -v repo-harness >/dev/null 2>&1; then
    SPRINT_CLI_CMD=(repo-harness)
  elif [[ -f "src/cli/index.ts" ]] && command -v bun >/dev/null 2>&1; then
    SPRINT_CLI_CMD=(bun "src/cli/index.ts")
  else
    echo "contract-worktree: the repo-harness CLI is unavailable; the sprint lease cannot be verified" >&2
    return 1
  fi
  SPRINT_CLI_RESOLVED=1
}

sprint_lease() {
  resolve_sprint_cli || return 1
  "${SPRINT_CLI_CMD[@]}" sprint "$@"
}

sprint_claim_dir() {
  local marker
  marker="$(policy_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
  printf '%s/claims' "$(dirname "$marker")"
}

# One worktree executes one claimed row, so more than one token here is an
# impossible state and fails closed instead of selecting one.
resolve_sprint_claim_token() {
  local dir token
  sprint_lease_claim_id=""
  sprint_lease_task_id=""
  sprint_lease_token_file=""
  dir="$(sprint_claim_dir)"
  [[ -d "$dir" ]] || return 0
  for token in "$dir"/*.claim; do
    [[ -f "$token" ]] || continue
    if [[ -n "$sprint_lease_token_file" ]]; then
      echo "contract-worktree: more than one sprint claim token in this worktree: $dir" >&2
      return 1
    fi
    sprint_lease_token_file="$token"
  done
  [[ -n "$sprint_lease_token_file" ]] || return 0
  sprint_lease_claim_id="$(sed -n 's/^claim_id=//p' "$sprint_lease_token_file" | head -1)"
  if [[ -z "$sprint_lease_claim_id" ]]; then
    echo "contract-worktree: sprint claim token carries no claim id: $sprint_lease_token_file" >&2
    return 1
  fi
  # The task id addresses the lease directly, which is what post-publication
  # reconcile needs: by then the fencing token no longer resolves through a
  # lease scan in every shape reconcile has to handle.
  sprint_lease_task_id="$(sed -n 's/^task_id=//p' "$sprint_lease_token_file" | head -1)"
  if [[ -z "$sprint_lease_task_id" ]]; then
    echo "contract-worktree: sprint claim token carries no task id: $sprint_lease_token_file" >&2
    return 1
  fi
  return 0
}

# Claim id, worktree binding, and task revision, all inside the per-task lock,
# before the publication tree is built.
sprint_lease_begin_completion() {
  local target_branch="$1" output
  [[ -n "$sprint_lease_claim_id" ]] || return 0
  if ! output="$(sprint_lease begin-completion \
    --claim-id "$sprint_lease_claim_id" \
    --worktree "$closeout_journal_worktree" \
    --target-ref "$target_branch" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "contract-worktree: this worktree no longer owns the sprint lease it claimed (claim $sprint_lease_claim_id); refusing to publish" >&2
    return 1
  fi
  echo "[ContractWorktree] Sprint lease verified for claim $sprint_lease_claim_id"
  return 0
}

# Stamp the closeout journal key onto the lease, so a crash inside the
# publication window names the journal that has to be resolved.
#
# This is deliberately a second call rather than an argument to the gate above:
# the journal key is derived from the frozen target base, and the ownership
# gate runs before the base is frozen so a displaced agent stops before running
# a verification pass it may not publish. `bound -> completing` is re-runnable
# by the same token from the same worktree by design, so this is that same
# transition, now carrying the key.
sprint_lease_record_finish_transaction() {
  local target_branch="$1" journal_key="$2" output
  [[ -n "$sprint_lease_claim_id" ]] || return 0
  if ! output="$(sprint_lease begin-completion \
    --claim-id "$sprint_lease_claim_id" \
    --worktree "$closeout_journal_worktree" \
    --target-ref "$target_branch" \
    --finish-transaction-key "$journal_key" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "contract-worktree: could not record the closeout journal key on the sprint lease (claim $sprint_lease_claim_id); refusing to publish" >&2
    return 1
  fi
  echo "[ContractWorktree] Sprint lease carries closeout journal key $journal_key"
  return 0
}

# Clear the lease after publication, never before: no single atomic operation
# spans a git publication and a filesystem lease.
#
# `reconcile`, not `release`. The lease is `completing` here, and release
# refuses that state precisely because it cannot tell whether the publication
# landed. Reconcile can: it reads the canonical row on the target ref, and a
# row that already reads `[x]` is the proof that no execution ownership remains
# to hold. A cleanup that does not land is reported, never fatal -- the
# publication is already published, so a residual lease is a legal state a
# later reconcile clears rather than a failed finish.
sprint_lease_reconcile_after_publication() {
  local target_branch="$1" output
  [[ -n "$sprint_lease_claim_id" ]] || return 0
  if ! output="$(sprint_lease reconcile \
    --task-id "$sprint_lease_task_id" \
    --expected-claim-id "$sprint_lease_claim_id" \
    --target-ref "$target_branch" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "[ContractWorktree] Warning: the sprint lease survived publication (claim $sprint_lease_claim_id); run 'repo-harness sprint reconcile --task-id $sprint_lease_task_id --target-ref $target_branch' to clear it" >&2
    return 0
  fi
  if ! printf '%s' "$output" | grep -q '"action": "cleared_completed_lease"'; then
    printf '%s\n' "$output" >&2
    echo "[ContractWorktree] Warning: reconcile left the sprint lease in place (claim $sprint_lease_claim_id); the canonical row on $target_branch does not read [x] yet" >&2
    return 0
  fi
  rm -f "$sprint_lease_token_file"
  echo "[ContractWorktree] Reconciled sprint lease after publication (claim $sprint_lease_claim_id)"
  return 0
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

  if ! closeout_journal_guard_reentry "finish"; then
    echo "contract-worktree: an unfinished closeout journal blocks this finish: $closeout_journal_conflict_dir" >&2
    echo "contract-worktree: run 'repo-harness run contract-worktree recover inspect', then 'recover abort' or 'recover reconcile'" >&2
    return 1
  fi
  if ! closeout_claim_acquire "finish"; then
    echo "contract-worktree: closeout already owned for this worktree and operation: $closeout_claim_conflict_dir" >&2
    echo "contract-worktree: run 'repo-harness run contract-worktree recover inspect', then 'recover abort' or 'recover reconcile'; 'recover abort' also clears a claim with no recorded journal phase" >&2
    return 1
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

  # Sprint lease gate, before any verification or publication work: ownership
  # is checked first so a displaced agent stops here rather than after running
  # a full verification pass it may not publish.
  resolve_sprint_claim_token || { closeout_claim_release; return 1; }
  sprint_lease_begin_completion "$target_branch" || { closeout_claim_release; return 1; }

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
    restore_machine_owned_projection_output "$target_worktree"
    if [[ -n "$(git -C "$target_worktree" status --porcelain=v1 --untracked-files=all)" ]]; then
      echo "contract-worktree: target worktree is dirty, refusing merge: $target_worktree" >&2
      exit 1
    fi
    # The publication commit parents the frozen target base and carries this
    # branch's tree verbatim. If the frozen base is not reachable from this
    # branch, that tree never saw the target's newer commits, so publishing it
    # would fast-forward the target onto content that silently reverts them.
    if ! git merge-base --is-ancestor "$frozen_base_sha" "$current_branch"; then
      echo "contract-worktree: target branch advanced past this worktree's fork point; refusing merge" >&2
      echo "contract-worktree: frozen target base $frozen_base_sha ($target_branch) is not an ancestor of $current_branch" >&2
      echo "contract-worktree: rebase this worktree onto $target_branch (or restart the contract worktree from the refreshed base), then re-run the closeout gates" >&2
      exit 1
    fi
  fi
  local closeout_key closeout_original_head closeout_begin_status=0
  closeout_original_head="$(git rev-parse HEAD)"
  closeout_key="$(closeout_journal_derive_key \
    "repo=$(closeout_journal_root)" \
    "worktree=$closeout_journal_worktree" \
    "operation=finish" \
    "plan=${active_plan:-}" \
    "contract=$contract_file" \
    "original_head=$closeout_original_head" \
    "target_branch=$target_branch" \
    "base_sha=$frozen_base_sha")"
  closeout_claim_bind_journal "$closeout_key"
  sprint_lease_record_finish_transaction "$target_branch" "$closeout_key" \
    || { closeout_claim_release; return 1; }
  closeout_journal_begin "finish" "$closeout_key" \
    "branch=$current_branch" \
    "plan=${active_plan:-}" \
    "contract=$contract_file" \
    "original_head=$closeout_original_head" \
    "target_branch=$target_branch" \
    "base_ref=$gate_base_ref" \
    "base_sha=$frozen_base_sha" \
    "merge_back=$merge_back" || closeout_begin_status=$?
  case "$closeout_begin_status" in
    0) ;;
    2)
      echo "[ContractWorktree] Closeout transaction already complete; replay is a no-op: $closeout_journal_dir"
      closeout_claim_release
      return 0
      ;;
    3)
      echo "contract-worktree: an unfinished closeout journal blocks this finish: $closeout_journal_conflict_dir" >&2
      echo "contract-worktree: run 'repo-harness run contract-worktree recover inspect', then 'recover abort' or 'recover reconcile'" >&2
      closeout_claim_release
      return 1
      ;;
    *)
      echo "contract-worktree: cannot open the closeout transaction journal" >&2
      return 1
      ;;
  esac
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
  finish_transaction_phase implementation_committed "$(git rev-parse HEAD)"

  local run_gate=0
  if [[ "$merge_back" -eq 1 || "$gate_base_explicit" -eq 1 ]]; then
    run_gate=1
  fi

  local verified_sha current_head publication_sha publication_tree frozen_base_tree commit_gpgsign_raw commit_gpgsign config_status
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
    finish_transaction_phase gate_sealed "$verified_sha"
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
  finish_transaction_phase lifecycle_applied "$(git rev-parse HEAD)"

  # Step 5: lifecycle changes land as a separate, deterministic commit L. If
  # archiving produced no tracked change, L is simply F.
  if ! git diff --quiet || ! git diff --cached --quiet || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    git add -A
    git commit -m "chore(workflow): archive ${slug} closeout"
  else
    echo "[ContractWorktree] No lifecycle changes to commit."
  fi
  finish_transaction_phase lifecycle_committed "$(git rev-parse HEAD)"

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

  # Step 7: re-validate the receipt against L (F plus only allowlisted drift),
  # then synthesize one publication commit P whose sole parent is the frozen
  # target base and whose tree is byte-identical to L. Checkpoint and lifecycle
  # commits remain on the source branch for recovery/audit but never become
  # target first-parent history.
  restore_machine_owned_projection_output "$target_worktree"
  if [[ -n "$(git -C "$target_worktree" status --porcelain=v1 --untracked-files=all)" ]]; then
    echo "contract-worktree: target worktree is dirty, refusing merge: $target_worktree" >&2
    exit 1
  fi

  verified_sha="$(verify_merge_gate_seal "$gate_base_ref")"
  current_head="$(git rev-parse "$current_branch^{commit}")"
  [[ "$verified_sha" == "$current_head" ]] || { echo "contract-worktree: branch moved after merge-gate review" >&2; exit 1; }
  [[ "$(git -C "$target_worktree" rev-parse "refs/heads/$target_branch^{commit}")" == "$frozen_base_sha" ]] || {
    echo "contract-worktree: target branch moved after merge-gate review" >&2
    exit 1
  }
  if ! git merge-base --is-ancestor "$frozen_base_sha" "$current_branch"; then
    echo "contract-worktree: target branch advanced past this worktree's fork point; refusing merge" >&2
    echo "contract-worktree: frozen target base $frozen_base_sha ($target_branch) is not an ancestor of $current_branch" >&2
    echo "contract-worktree: rebase this worktree onto $target_branch (or restart the contract worktree from the refreshed base), then re-run the closeout gates" >&2
    finish_transaction_abort
    return 1
  fi
  publication_tree="$(git rev-parse "$verified_sha^{tree}")"
  frozen_base_tree="$(git rev-parse "$frozen_base_sha^{tree}")"
  [[ "$publication_tree" != "$frozen_base_tree" ]] || {
    echo "contract-worktree: verified lifecycle tree already equals frozen target; refusing empty publication" >&2
    exit 1
  }
  config_status=0
  commit_gpgsign_raw="$(git config --get commit.gpgsign 2>/dev/null)" || config_status=$?
  case "$config_status" in
    0)
      if ! commit_gpgsign="$(git config --bool --get commit.gpgsign 2>/dev/null)"; then
        echo "contract-worktree: commit.gpgsign is configured but is not a valid boolean" >&2
        exit 1
      fi
      ;;
    1) commit_gpgsign="false" ;;
    *)
      echo "contract-worktree: cannot read commit.gpgsign configuration" >&2
      exit 1
      ;;
  esac
  if [[ "$commit_gpgsign" == "true" ]]; then
    publication_sha="$(git commit-tree "$publication_tree" -p "$frozen_base_sha" \
      -m "$commit_message" \
      -m "Source-Worktree-Head: $verified_sha" -S)"
  else
    publication_sha="$(git commit-tree "$publication_tree" -p "$frozen_base_sha" \
      -m "$commit_message" \
      -m "Source-Worktree-Head: $verified_sha")"
  fi
  [[ "$(git rev-parse "$publication_sha^")" == "$frozen_base_sha" ]] || {
    echo "contract-worktree: synthesized publication parent does not match frozen target base" >&2
    exit 1
  }
  [[ "$(git rev-parse "$publication_sha^{tree}")" == "$publication_tree" ]] || {
    echo "contract-worktree: synthesized publication tree does not match verified lifecycle tree" >&2
    exit 1
  }
  finish_transaction_phase publication_prepared "$publication_sha"
  git -C "$target_worktree" merge --ff-only "$publication_sha"
  [[ "$(git -C "$target_worktree" rev-parse "refs/heads/$target_branch^{commit}")" == "$publication_sha" ]] || {
    echo "contract-worktree: target branch does not resolve to synthesized publication commit" >&2
    exit 1
  }
  [[ "$(git -C "$target_worktree" rev-parse "refs/heads/$target_branch^{tree}")" == "$publication_tree" ]] || {
    echo "contract-worktree: published target tree does not match verified lifecycle tree" >&2
    exit 1
  }
  finish_transaction_phase merged "$publication_sha"
  finish_transaction_commit "$publication_sha"
  sprint_lease_reconcile_after_publication "$target_branch"
  echo "[ContractWorktree] Merged $current_branch into $target_branch as single publication commit $publication_sha at $target_worktree"

  # Cleanup runs after the transaction is committed and its EXIT trap disarmed,
  # so a refusal here cannot reach finish_transaction_abort and unwind a
  # publication that already landed. Nothing runs after this block, so deleting
  # this process's own cwd is safe.
  #
  # cleanup_worktree is fail-closed and must run from the target primary
  # worktree. The child needs the repo-root override as well as the cwd: this
  # process exported REPO_HARNESS_TARGET_REPO_ROOT as the linked worktree, and
  # the child would otherwise cd straight back here and refuse.
  if (cd "$target_worktree" \
    && REPO_HARNESS_TARGET_REPO_ROOT="$target_worktree" \
      bash "$helper_dir/contract-worktree.sh" cleanup --slug "$slug" --target "$target_branch"); then
    echo "[ContractWorktree] Worktree removed after merge; this shell's directory is gone -- cd $target_worktree"
  else
    echo "[ContractWorktree] Warning: automatic worktree cleanup refused; the worktree and branch remain on disk" >&2
    echo "[ContractWorktree] run from $target_worktree: repo-harness run contract-worktree cleanup --slug $slug --target $target_branch" >&2
  fi
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

  # --defer-lease-release: this back-fill only builds the publication tree. The
  # lease is released after the publication commit lands, so the crash window
  # in between stays a named, reconcilable state instead of a lease that was
  # dropped before the work was published.
  if REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" bash "$helper_dir/sprint-backlog.sh" complete-task --sprint "$sprint_path" --task "$task_ref" --plan "$archived_plan" --defer-lease-release; then
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
  local worktree_status repair_needed=0 merge_mode=""
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
    # Merge state comes from the shared authority in worktree-merge-lib.sh --
    # scripts/ship-worktrees.sh consumes the same function, so the batch and
    # single-slug entrypoints cannot drift apart again. The lib is
    # fail-closed: anything it cannot prove merged comes back `unmerged`.
    merge_mode="$(worktree_merge_mode "$branch_name" "$target_branch")"
    case "$merge_mode" in
      ancestor)
        echo "[ContractWorktree] Merge check for $branch_name: ancestor of $target_branch"
        ;;
      absorbed)
        echo "[ContractWorktree] Merge check for $branch_name: absorbed into $target_branch (squash-equivalent tree)"
        ;;
      *)
        echo "contract-worktree: branch $branch_name is not fully merged into $target_branch; refusing cleanup" >&2
        exit 1
        ;;
    esac
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
    if [[ "$merge_mode" == "absorbed" ]]; then
      # The absorption check above already proved this branch's tree is
      # identical to target's -- git's own ancestry-based `-d` safety check
      # is a guaranteed false positive here (squash-merge never makes the
      # branch tip an ancestor of target), so force delete on this
      # predicate only. Every other path (ancestor, or merge_mode unset
      # because the branch was already absent at gate time -- which can't
      # reach here since show-ref above would then be false) keeps the
      # safer `-d`.
      git branch -D "$branch_name"
      echo "[ContractWorktree] Deleted branch: $branch_name (-D, absorbed)"
    else
      git branch -d "$branch_name"
      echo "[ContractWorktree] Deleted branch: $branch_name (-d, ancestor)"
    fi
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
  recover)
    recover_worktree "$@"
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
