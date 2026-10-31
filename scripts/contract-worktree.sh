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
  repo-harness run contract-worktree start --issue <number> [--type <branch-type>] [--path <worktree-path>] [--branch <branch-name>] [--fresh] [--json] [--herdr-endpoint <json-file>]
  repo-harness run contract-worktree cleanup --slug <slug> [--target <branch>] [--dry-run]
  repo-harness run contract-worktree notify-merged --worktree <path> --branch <branch> --owner <pane-id> --pr <number> --merge <sha>
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
  local worktree_path="$1" branch_name="$2" issue_number="$3" issue_url="$4" disposition="$5"
  printf '{"protocol":2,"kind":"repo-harness-contract-worktree-start","worktree_path":"%s","branch":"%s","issue":%s,"issue_url":"%s","disposition":"%s"}\n' \
    "$(json_escape "$worktree_path")" \
    "$(json_escape "$branch_name")" \
    "$issue_number" \
    "$(json_escape "$issue_url")" \
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

# Start records the branch in the primary checkout. Cleanup reads that file only
# and never derives a branch from policy or the Git worktree list.
read_metadata_branch() {
  local metadata_file="$1"
  [[ -f "$metadata_file" ]] || return 1
  sed -nE 's/^.*"branch"[[:space:]]*:[[:space:]]*"([^"]*)".*$/\1/p' "$metadata_file" | head -1
}

read_start_branch() {
  local metadata_file="$1" slug="$2" branch=""
  branch="$(read_metadata_branch "$metadata_file" || true)"
  if [[ -z "$branch" ]]; then
    echo "contract-worktree: no start metadata for $slug" >&2
    return 2
  fi
  if ! git show-ref --verify --quiet "refs/heads/$branch"; then
    echo "contract-worktree: branch $branch not found" >&2
    return 2
  fi
  printf '%s' "$branch"
}

derive_issue_slug() {
  local issue_number="$1"
  local title="$2"
  local words slug
  words="$(printf '%s' "$title" | awk '{ for (i = 1; i <= 5 && i <= NF; i++) printf "%s%s", (i > 1 ? " " : ""), $i }')"
  slug="$(normalize_slug "${issue_number}-${words}")"
  [[ -n "$slug" ]] || slug="$issue_number"
  printf '%s' "$slug"
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
  local issue_number="$2"
  local issue_url="$3"
  local branch_name="$4"
  local worktree_path="$5"
  local base_branch="$6"
  local base_commit="$7"
  local metadata_dir=".ai/harness/worktrees"
  local metadata_file="${metadata_dir}/${slug}.json"
  local existing_base_commit=""

  mkdir -p "$metadata_dir"
  # A retry keeps the base recorded by the first start, but always refreshes the
  # branch and worktree fields so cleanup reads current start metadata.
  if [[ -f "$metadata_file" ]]; then
    existing_base_commit="$(sed -nE 's/^.*"base_commit"[[:space:]]*:[[:space:]]*"([0-9a-f]{40,64})".*$/\1/p' "$metadata_file" | head -1)"
  fi
  [[ -z "$existing_base_commit" ]] || base_commit="$existing_base_commit"
  cat > "$metadata_file" <<EOF_METADATA
{
  "slug": "$(json_escape "$slug")",
  "issue": $issue_number,
  "issue_url": "$(json_escape "$issue_url")",
  "branch": "$(json_escape "$branch_name")",
  "worktree": "$(json_escape "$worktree_path")",
  "source_repo": "$(json_escape "$REPO_ROOT")",
  "base_branch": "$(json_escape "$base_branch")",
  "base_commit": "$(json_escape "$base_commit")"
}
EOF_METADATA
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
  local issue_number=""
  local issue_title=""
  local issue_state=""
  local issue_url=""
  local worktree_path=""
  local branch_name=""
  local branch_type="feat"
  local require_fresh=0
  local output_json=0
  local herdr_endpoint=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --issue)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --issue requires a value" >&2; exit 2; }
        issue_number="$2"
        shift 2
        ;;
      --type)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: --type requires a value" >&2; exit 2; }
        branch_type="$2"
        shift 2
        ;;
      --plan|--plan=*)
        echo "contract-worktree: unknown option --plan; use --issue <n>" >&2
        exit 2
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

  [[ -n "$issue_number" ]] || { echo "contract-worktree: start requires --issue <number>" >&2; exit 2; }
  [[ "$issue_number" =~ ^[1-9][0-9]*$ ]] || { echo "contract-worktree: --issue requires a positive integer: $issue_number" >&2; exit 2; }
  [[ -n "$branch_type" ]] || { echo "contract-worktree: --type requires a value" >&2; exit 2; }

  local gh_bin="${REPO_HARNESS_GH_BIN:-gh}"
  if ! command -v "$gh_bin" >/dev/null 2>&1; then
    echo "contract-worktree: gh is required for --issue" >&2
    exit 2
  fi

  local gh_error gh_output issue_fields=() field gh_first_line
  gh_error="$(mktemp "${TMPDIR:-/tmp}/contract-worktree-gh.XXXXXX")"
  if ! gh_output="$("$gh_bin" issue view "$issue_number" --json number,title,state,url 2>"$gh_error")"; then
    gh_first_line=""
    IFS= read -r gh_first_line < "$gh_error" || true
    rm -f "$gh_error"
    echo "contract-worktree: cannot read issue $issue_number: $gh_first_line" >&2
    exit 2
  fi
  rm -f "$gh_error"
  while IFS= read -r -d '' field; do
    issue_fields+=("$field")
  done < <(run_contract_runtime issue-fields --json "$gh_output")
  if [[ "${#issue_fields[@]}" -ne 4 ]]; then
    echo "contract-worktree: cannot read issue $issue_number: invalid gh output" >&2
    exit 2
  fi
  issue_number="${issue_fields[0]}"
  issue_title="${issue_fields[1]}"
  issue_state="${issue_fields[2]}"
  issue_url="${issue_fields[3]}"
  [[ "$issue_number" =~ ^[1-9][0-9]*$ ]] || { echo "contract-worktree: cannot read issue $issue_number: invalid issue number" >&2; exit 2; }
  if [[ "$issue_state" != "OPEN" ]]; then
    echo "contract-worktree: issue $issue_number is $issue_state" >&2
    exit 2
  fi

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
        "$issue_number" "$issue_url" "already_linked"
    else
      echo "[ContractWorktree] Already in a linked worktree: $REPO_ROOT"
    fi
    return 0
  fi

  local slug base_branch existing_worktree base_commit source_commit new_branch=0 disposition metadata_file
  slug="$(derive_issue_slug "$issue_number" "$issue_title")"
  base_branch="$(policy_get '.worktree_strategy.base_branch' 'main')"
  source_commit="$(git rev-parse HEAD)"
  branch_name="${branch_name:-${branch_type}/${slug}}"
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
  run_contract_runtime record --repo "$REPO_ROOT" --worktree "$worktree_path" --creator contract --purpose "$issue_url" --task "$slug" >&2
  if [[ -n "$herdr_endpoint" ]]; then
    if ! run_contract_runtime register --worktree "$worktree_path" --endpoint "$herdr_endpoint" >&2; then
      echo "contract-worktree: Herdr registration incomplete; checkout preserved; register its runtime with the supplied endpoint before continuing" >&2
      return 1
    fi
  fi

  bootstrap_worktree_runtime "$worktree_path"
  if [[ "$new_branch" -eq 1 ]]; then
    base_commit="$source_commit"
  else
    base_commit="$(git -C "$worktree_path" merge-base HEAD "$base_branch" 2>/dev/null || git -C "$worktree_path" rev-parse HEAD)"
  fi

  write_start_metadata "$slug" "$issue_number" "$issue_url" "$branch_name" "$worktree_path" "$base_branch" "$base_commit"

  if [[ "$output_json" -eq 1 ]]; then
    write_start_json "$worktree_path" "$branch_name" "$issue_number" "$issue_url" "$disposition"
  else
    echo "[ContractWorktree] Branch: $branch_name"
    echo "[ContractWorktree] Issue: $issue_url"
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

  local target_worktree current_root branch_name worktree_path metadata_file
  local worktree_status repair_needed=0 merge_mode=""
  metadata_file=".ai/harness/worktrees/${slug}.json"
  branch_name="$(read_start_branch "$metadata_file" "$slug")" || exit $?
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

  local cleanup_head="" cleanup_target=""
  cleanup_target="$(git rev-parse "$target_branch^{commit}")"
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
  notify-merged)
    run_contract_runtime notify-merged --repo "$REPO_ROOT" "$@"
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
