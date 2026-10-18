#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

unset GH_TOKEN GITHUB_TOKEN ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN SSH_AUTH_SOCK HTTP_PROXY HTTPS_PROXY NO_PROXY

GIT_BIN="${REPO_HARNESS_GIT_BIN:-/usr/bin/git}"
BASH_BIN="${REPO_HARNESS_BASH_BIN:-/bin/bash}"
BUN_BIN="${REPO_HARNESS_BUN_BIN:-}"
if [[ "${OS:-}" == "Windows_NT" ]]; then
  GIT_BIN="${GIT_BIN//\\//}"
  BASH_BIN="${BASH_BIN//\\//}"
  BUN_BIN="${BUN_BIN//\\//}"
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
is_trusted_executable "$GIT_BIN" || { echo "contract-worktree: trusted git executable is unavailable" >&2; exit 1; }
is_trusted_executable "$BASH_BIN" || { echo "contract-worktree: trusted bash executable is unavailable" >&2; exit 1; }
export REPO_HARNESS_GIT_BIN="$GIT_BIN"
git() { "$GIT_BIN" "$@"; }
bash() { "$BASH_BIN" "$@"; }

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
  repo-harness run contract-worktree start --plan <plan-file> [--path <worktree-path>] [--branch <branch-name>] [--fresh] [--json] [--herdr-endpoint <json-file>]
  repo-harness run contract-worktree cleanup --slug <slug> [--target <branch>] [--dry-run]
  repo-harness run contract-worktree sweep
  repo-harness run contract-worktree status

  --herdr-endpoint JSON: {"endpoint":{"session":"<name>","home":"<path>","configPath":"<path>"},"parent_pane":"<pane-id>"}
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

start_notice() {
  [[ "${contract_worktree_start_json:-0}" -eq 1 ]] || printf '%s\n' "$*"
}

write_start_json() {
  local worktree_path="$1" branch_name="$2" plan_file="$3" disposition="$4"
  printf '{"protocol":1,"kind":"repo-harness-contract-worktree-start","worktree_path":"%s","branch":"%s","plan_path":"%s","disposition":"%s"}\n' \
    "$(json_escape "$worktree_path")" \
    "$(json_escape "$branch_name")" \
    "$(json_escape "$plan_file")" \
    "$(json_escape "$disposition")"
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
  local repo_name template default_template
  default_template="$(run_contract_runtime default-template)" || return $?
  repo_name="$(basename "$REPO_ROOT")"
  template="$(policy_get '.worktree_strategy.worktree_dir_template' "$default_template")"
  template="$(run_contract_runtime resolve-template --template "$template")" || return $?
  if [[ -n "${REPO_HARNESS_WORKTREE_ROOT:-}" && "$template" == "$default_template" ]]; then
    template="${REPO_HARNESS_WORKTREE_ROOT}/{{repo}}-wt-{{slug}}"
  fi
  template="${template//\{\{repo\}\}/$repo_name}"
  template="${template//\{\{slug\}\}/$slug}"
  printf '%s' "$template"
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
    start_notice "[ContractWorktree] Moved untracked source plan into contract worktree: $plan_file"
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
    start_notice "[ContractWorktree] Cleared primary active markers for transferred plan: $plan_file"
  fi
}

bootstrap_worktree_runtime() {
  # A fresh linked worktree starts without the gitignored runtime artifacts the
  # verification gates depend on, and both resulting failures name neither cause.
  # A missing dependency tree surfaces as `state=missing`, because the
  # projection provider resolves archctx package-locally from the candidate
  # build, while the globally installed CLI resolves it elsewhere and reports
  # ready. A missing code index
  # surfaces as `unresolved-major-change` listing every capability, because
  # archctx cannot prove a single flow without code facts. Seeding both here
  # keeps that diagnosis from being re-derived once per worktree.
  local worktree_path="$1"

  if [[ -f "$worktree_path/package.json" ]] \
    && { [[ -f "$worktree_path/bun.lock" ]] || [[ -f "$worktree_path/bun.lockb" ]]; } \
    && command -v bun >/dev/null 2>&1 \
    && [[ ! -d "$worktree_path/node_modules" ]]; then
    [[ "${contract_worktree_start_json:-0}" -eq 1 ]] \
      || printf '%s\n' "[ContractWorktree] Installing dependencies (gates resolve archctx package-locally)"
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
    [[ "${contract_worktree_start_json:-0}" -eq 1 ]] \
      || printf '%s\n' "[ContractWorktree] Indexing CodeGraph (architecture projection requires code facts)"
    if ! (cd "$worktree_path" && codegraph init >/dev/null 2>&1); then
      echo "[ContractWorktree] codegraph init failed; architecture projection will report unresolved-major-change for every capability" >&2
      return 1
    fi
  fi

  return 0
}

run_contract_runtime() {
  if [[ -n "$BUN_BIN" ]]; then
    "$BUN_BIN" "$helper_dir/contract-worktree-runtime.ts" "$@"
  else
    command bun "$helper_dir/contract-worktree-runtime.ts" "$@"
  fi
}

start_worktree() {
  local plan_file=""
  local worktree_path=""
  local branch_name=""
  local run_plan_to_todo=1
  local require_fresh=0
  local output_json=0
  local herdr_endpoint=""

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
      --herdr-endpoint)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --herdr-endpoint requires a file" >&2; exit 2; }
        herdr_endpoint="$(cd "$(dirname "$2")" && pwd -P)/$(basename "$2")"
        shift 2
        ;;
      --no-plan-to-todo)
        run_plan_to_todo=0
        shift
        ;;
      --fresh)
        require_fresh=1
        shift
        ;;
      --json)
        output_json=1
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

  contract_worktree_start_json="$output_json"

  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "contract-worktree: not inside a git repository" >&2
    exit 2
  fi

  if is_linked_worktree; then
    if [[ "$require_fresh" -eq 1 ]]; then
      echo "contract-worktree: --fresh refuses to reuse the current linked worktree: $REPO_ROOT" >&2
      return 1
    fi
    if [[ "$output_json" -eq 1 ]]; then
      write_start_json "$(pwd -P)" "$(git branch --show-current 2>/dev/null || true)" \
        "$(pwd -P)/$plan_file" "already_linked"
    else
      echo "[ContractWorktree] Already in a linked worktree: $REPO_ROOT"
    fi
    return 0
  fi

  local slug branch_prefix base_branch existing_worktree base_commit source_commit new_branch=0 disposition metadata_file
  slug="$(derive_slug_from_plan "$plan_file")"
  branch_prefix="$(policy_get '.worktree_strategy.branch_prefix' 'codex/')"
  base_branch="$(policy_get '.worktree_strategy.base_branch' 'main')"
  source_commit="$(git rev-parse HEAD)"
  branch_name="${branch_name:-${branch_prefix}${slug}}"
  worktree_path="${worktree_path:-$(default_worktree_path "$slug")}"
  metadata_file="$REPO_ROOT/.ai/harness/worktrees/${slug}.json"

  if [[ "$require_fresh" -eq 1 && ( -e "$metadata_file" || -L "$metadata_file" ) ]]; then
    echo "contract-worktree: --fresh refuses residual worktree metadata: $metadata_file" >&2
    return 1
  fi
  # The existing Bun adapter uses lstat. It never follows the target leaf.
  local freshness_args=()
  [[ "$require_fresh" -eq 0 ]] || freshness_args+=(--fresh)
  if ! run_contract_runtime check-start-path --repo "$REPO_ROOT" --worktree "$worktree_path" --branch "$branch_name" ${freshness_args[@]+"${freshness_args[@]}"}; then
    if [[ "$require_fresh" -eq 1 ]]; then
      echo "contract-worktree: --fresh refuses residual worktree path: $worktree_path" >&2
    else
      echo "contract-worktree: target worktree path already exists: $worktree_path" >&2
    fi
    return 1
  fi

  existing_worktree="$(find_worktree_for_branch "$branch_name" || true)"
  if [[ -n "$existing_worktree" ]]; then
    if [[ "$require_fresh" -eq 1 ]]; then
      echo "contract-worktree: --fresh refuses existing worktree for branch $branch_name: $existing_worktree" >&2
      return 1
    fi
    worktree_path="$existing_worktree"
    run_contract_runtime mark-active --repo "$REPO_ROOT" --worktree "$worktree_path" --branch "$branch_name"
    disposition="reused_existing_worktree"
    start_notice "[ContractWorktree] Reusing existing worktree: $worktree_path"
  elif git show-ref --verify --quiet "refs/heads/$branch_name"; then
    if [[ "$require_fresh" -eq 1 ]]; then
      echo "contract-worktree: --fresh refuses existing branch: $branch_name" >&2
      return 1
    fi
    if [[ "$output_json" -eq 1 ]]; then
      run_contract_runtime add-worktree --repo "$REPO_ROOT" --worktree "$worktree_path" --branch "$branch_name" --base "$source_commit" >&2
    else
      run_contract_runtime add-worktree --repo "$REPO_ROOT" --worktree "$worktree_path" --branch "$branch_name" --base "$source_commit"
    fi
    disposition="attached_existing_branch"
    start_notice "[ContractWorktree] Added worktree for existing branch: $worktree_path"
  else
    if [[ "$output_json" -eq 1 ]]; then
      run_contract_runtime add-worktree --repo "$REPO_ROOT" --worktree "$worktree_path" --branch "$branch_name" --base "$source_commit" --new-branch >&2
    else
      run_contract_runtime add-worktree --repo "$REPO_ROOT" --worktree "$worktree_path" --branch "$branch_name" --base "$source_commit" --new-branch
    fi
    new_branch=1
    disposition="created"
    start_notice "[ContractWorktree] Created worktree: $worktree_path"
  fi

  worktree_path="$(cd "$worktree_path" && pwd -P)"
  if [[ -n "$herdr_endpoint" ]]; then
    if ! run_contract_runtime register --worktree "$worktree_path" --endpoint "$herdr_endpoint" >&2; then
      echo "contract-worktree: Herdr registration incomplete; checkout preserved; register its runtime with the supplied endpoint before continuing" >&2
      return 1
    fi
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
      if [[ "$output_json" -eq 1 ]]; then
        REPO_HARNESS_TARGET_REPO_ROOT="$worktree_path" REPO_HARNESS_CONTRACT_WORKTREE=1 bash "$helper_dir/plan-to-todo.sh" --plan "$plan_file" >&2
      else
        REPO_HARNESS_TARGET_REPO_ROOT="$worktree_path" REPO_HARNESS_CONTRACT_WORKTREE=1 bash "$helper_dir/plan-to-todo.sh" --plan "$plan_file"
      fi
    fi
  )

  if [[ "$output_json" -eq 1 ]]; then
    write_start_json "$worktree_path" "$branch_name" "$worktree_path/$plan_file" "$disposition"
  else
    echo "[ContractWorktree] Branch: $branch_name"
    echo "[ContractWorktree] Plan: $worktree_path/$plan_file"
  fi
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

  if [[ -n "$worktree_path" ]] && ! git show-ref --verify --quiet "refs/heads/$branch_name"; then
    echo "contract-worktree: registered worktree branch is missing; refusing unproven cleanup" >&2
    return 1
  fi

  local cleanup_head="" cleanup_target=""
  cleanup_target="$(git rev-parse "$target_branch^{commit}")"
  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    cleanup_head="$(git rev-parse "refs/heads/$branch_name")"
    # Merge state comes from the shared authority in worktree-merge-lib.sh.
    # The lib is fail-closed: anything it cannot prove merged comes back
    # `unmerged`.
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
    if [[ "$repair_needed" -eq 0 ]]; then
      local lock_path
      lock_path="$(git -C "$worktree_path" rev-parse --git-path locked)"
      if [[ -e "$lock_path" ]]; then
        echo "contract-worktree: linked worktree is locked, refusing cleanup: $worktree_path" >&2
        exit 1
      fi
    fi
    if [[ -n "$worktree_status" ]]; then
      echo "contract-worktree: linked worktree is dirty, refusing cleanup: $worktree_path" >&2
      echo "contract-worktree: preserve the dirty worktree and ask the user before any deletion" >&2
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
    # No runtime record means no managed agent was launched. Recorded runtime
    # must close before Git deletion; unknown/attached objects block cleanup.
    if ! run_contract_runtime cleanup --repo "$current_root" --worktree "$worktree_path"; then
      echo "contract-worktree: runtime cleanup incomplete; preserve worktree and retry cleanup only" >&2
      return 1
    fi
  fi

  # Bind the observations before runtime shutdown to the existing exact authority.
  local daemon_stop_failed=0
  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    if [[ -n "$worktree_path" ]]; then
      # Stop this checkout's architecture daemons while it still exists and
      # stays registered: start cannot put another checkout at this path, and
      # the helpers that finish runs from this checkout are still present.
      # archctx runs outside the topology lock. A failure is reported and
      # never blocks or reorders the removal.
      if ! run_contract_runtime stop-architecture-daemons --repo "$current_root" --worktree "$worktree_path"; then
        daemon_stop_failed=1
      fi
    fi
    run_contract_runtime remove-exact --repo "$current_root" \
      --worktree "${worktree_path:-(absent)}" \
      --branch "$branch_name" --head "$cleanup_head" --target "$target_branch" \
      --target-oid "$cleanup_target" --merge "$cleanup_target"
    echo "[ContractWorktree] Removed worktree: ${worktree_path:-(absent)}"
    echo "[ContractWorktree] Deleted branch: $branch_name (update-ref, $merge_mode)"
  fi

  if [[ -e "$metadata_file" ]]; then
    rm -f "$metadata_file"
    echo "[ContractWorktree] Removed metadata: $metadata_file"
  else
    echo "[ContractWorktree] Metadata already absent, skipping: $metadata_file"
  fi

  if [[ "$daemon_stop_failed" -eq 1 ]]; then
    echo "contract-worktree: worktree removed, but its architecture daemon stop failed; the report above names each state directory" >&2
    return 1
  fi
}

command_name="${1:-status}"
shift || true

case "$command_name" in
  start)
    start_worktree "$@"
    ;;
  cleanup)
    cleanup_worktree "$@"
    ;;
  sweep)
    [[ $# -eq 0 ]] || { echo "contract-worktree: sweep takes no arguments" >&2; usage; exit 2; }
    run_contract_runtime sweep --repo "$REPO_ROOT"
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
