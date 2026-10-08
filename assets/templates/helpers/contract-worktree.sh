#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

unset GH_TOKEN GITHUB_TOKEN ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN SSH_AUTH_SOCK HTTP_PROXY HTTPS_PROXY NO_PROXY

GIT_BIN="${REPO_HARNESS_GIT_BIN:-/usr/bin/git}"
BASH_BIN="${REPO_HARNESS_BASH_BIN:-/bin/bash}"
BUN_BIN="${REPO_HARNESS_BUN_BIN:-}"
WORKFLOW_STATE_LIB="${REPO_HARNESS_WORKFLOW_STATE_LIB:-$SCRIPT_DIR/../assets/hooks/lib/workflow-state.sh}"
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
is_trusted_executable "$GIT_BIN" || { echo "contract-worktree: trusted git executable is unavailable" >&2; exit 1; }
is_trusted_executable "$BASH_BIN" || { echo "contract-worktree: trusted bash executable is unavailable" >&2; exit 1; }
if [[ -n "$BUN_BIN" ]] && ! is_trusted_regular_file "$WORKFLOW_STATE_LIB"; then
  echo "contract-worktree: trusted workflow-state library is unavailable" >&2
  exit 1
fi
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
  repo-harness run contract-worktree finish [--merge|--no-merge] [--target <branch>] [--gate-base <ref>] [--message <commit-message>]
  repo-harness run contract-worktree cleanup --slug <slug> [--target <branch>] [--dry-run]
  repo-harness run contract-worktree status
  repo-harness run contract-worktree recover <inspect|abort|reconcile> [--key <transaction-key>]

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

now_ms() {
  if command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(String(Date.now()))'
  elif command -v bun >/dev/null 2>&1; then
    bun -e 'process.stdout.write(String(Date.now()))'
  else
    printf '%s000' "$(date +%s)"
  fi
}

# Coordination wait metrics sink. Rooted at the primary worktree (the parent of
# the git common directory), not at this worktree: `finish` deletes its own
# worktree on the success path, so a per-worktree ledger would lose exactly the
# `merged` record it just wrote, and scatter the rest across linked worktrees.
coordination_waits_file() {
  local common_dir
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null)" || return 1
  common_dir="$(cd "$common_dir" 2>/dev/null && pwd -P)" || return 1
  printf '%s/.ai/harness/runs/coordination/waits.jsonl' "$(dirname "$common_dir")"
}

# Append-only, single-line, no lock file: the same idiom the workstream-sync
# event log uses. Interleaved writes from concurrent agents are the accepted
# tradeoff; a torn record loses one measurement, never a host command. Every
# failure path returns 0 so instrumentation can never change an exit status.
coordination_wait_emit() {
  local record="$1" file
  file="$(coordination_waits_file 2>/dev/null)" || return 0
  [[ -n "$file" ]] || return 0
  mkdir -p "$(dirname "$file")" 2>/dev/null || return 0
  printf '%s\n' "$record" >> "$file" 2>/dev/null || return 0
  return 0
}

# One `finish_attempt` record per finish attempt. `finish_attempt_started_ms`
# is set at finish entry and cleared by the emission, so the refusal sites that
# call `finish_transaction_abort` right after emitting cannot double-count, and
# an abort reached outside a finish attempt emits nothing.
finish_attempt_started_ms=""
finish_attempt_slug=""
finish_attempt_frozen_base=""

emit_finish_attempt() {
  local outcome="$1" frozen_base="${2:-}" publication="${3:-}" publication_field
  local ended_ms
  [[ -n "$finish_attempt_started_ms" ]] || return 0
  # A polluted `now_ms` stdout (a bare word instead of a millisecond timestamp)
  # makes the elapsed arithmetic fail under `set -u`, which a trailing `|| true`
  # cannot catch. The `merged` emission runs after publication is durable and
  # after the abort trap is disarmed, so a crash here would orphan the worktree.
  # Measurement is best effort: drop the record, keep the finish. No fallback
  # timestamp is synthesized.
  ended_ms="$(now_ms || true)"
  if [[ ! "$ended_ms" =~ ^[0-9]+$ || ! "$finish_attempt_started_ms" =~ ^[0-9]+$ ]]; then
    finish_attempt_started_ms=""
    return 0
  fi
  if [[ -n "$publication" ]]; then
    publication_field="\"$(json_escape "$publication")\""
  else
    publication_field="null"
  fi
  coordination_wait_emit "{\"protocol\":1,\"kind\":\"finish_attempt\",\"at\":\"$(json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")\",\"slug\":\"$(json_escape "$finish_attempt_slug")\",\"ms\":$((ended_ms - finish_attempt_started_ms)),\"outcome\":\"$(json_escape "$outcome")\",\"frozen_base\":\"$(json_escape "$frozen_base")\",\"publication\":${publication_field}}" || true
  finish_attempt_started_ms=""
  return 0
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
  if ! run_contract_runtime check-start-path --repo "$REPO_ROOT" --worktree "$worktree_path" --branch "$branch_name" "${freshness_args[@]}"; then
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

is_local_runtime_marker_path() {
  case "$1" in
    .ai/harness/active-plan|.ai/harness/active-worktree)
      return 0
      ;;
  esac
  return 1
}

is_workflow_owned_projection_output() {
  [[ "$1" == "docs/architecture/.projection-manifest.json" ]]
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
    if is_local_runtime_marker_path "$path" || is_workflow_owned_projection_output "$path"; then
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
closeout_claim_target_ref=""

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
    printf '  "journal_key": "%s",\n' "$(json_escape "$journal_key")"
    printf '  "target_ref": "%s"\n' "$(json_escape "$closeout_claim_target_ref")"
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
  closeout_claim_target_ref=""
  trap - EXIT
}

closeout_claim_on_exit() {
  local exit_code=$?
  trap - EXIT
  if [[ "$exit_code" -ne 0 && "$sprint_lease_completion_open" -eq 1 ]]; then
    if ! sprint_lease_abort_completion "$sprint_lease_target_ref"; then
      echo "contract-worktree: sprint completion abort failed; retaining the closeout ownership claim for explicit recovery" >&2
      exit 1
    fi
  fi
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
  local operation="$1" claim journal_key journal_dir target_ref takeover_result=0
  claim="$(closeout_claim_path "$operation")" || return 1
  [[ -d "$claim" ]] || return 1
  journal_key="$(closeout_journal_field "$claim/owner.json" journal_key)"
  target_ref="$(closeout_journal_field "$claim/owner.json" target_ref)"
  if [[ -n "$journal_key" ]]; then
    journal_dir="$(closeout_journal_root)/$operation/$journal_key"
    [[ ! -f "$journal_dir/status.json" ]] || return 4
  fi
  closeout_claim_takeover_for_recovery "$operation" || takeover_result=$?
  [[ "$takeover_result" -eq 0 ]] || return "$takeover_result"
  resolve_sprint_claim_token || return 1
  sprint_lease_abort_completion "$target_ref" || return 5
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
  finish_transaction_write_index
  closeout_journal_record "$closeout_journal_dir" in_progress prepared "$finish_transaction_original_head"
}

finish_transaction_phase() {
  [[ "$finish_transaction_active" -eq 1 ]] || return 0
  closeout_journal_record "$closeout_journal_dir" in_progress "$1" "${2:-}"
}

finish_transaction_abort() {
  local index path
  emit_finish_attempt aborted "$finish_attempt_frozen_base" ""
  if [[ -n "$finish_transaction_original_head" ]] && [[ "$(git rev-parse HEAD)" != "$finish_transaction_original_head" ]]; then
    local current_head owned_head branch_ref
    current_head="$(git rev-parse HEAD)"
    owned_head="$(closeout_journal_phase_ref "$closeout_journal_dir" implementation_committed)"
    [[ "$current_head" == "$owned_head" ]] || { echo "finish: branch moved outside this transaction; preserve work and journal" >&2; return 1; }
    branch_ref="$(git symbolic-ref HEAD)"
    git update-ref "$branch_ref" "$finish_transaction_original_head" "$owned_head" || return 1
    git read-tree "$finish_transaction_original_head" || return 1
  fi
  for ((index = ${#finish_transaction_paths[@]} - 1; index >= 0; index--)); do
    path="${finish_transaction_paths[$index]}"
    rm -rf "$path"
    if [[ "${finish_transaction_existed[$index]}" == "1" ]]; then
      mkdir -p "$(dirname "$path")"
      cp -Rp "$finish_transaction_dir/$index/value" "$path"
    fi
  done
  if ! sprint_lease_abort_completion "$sprint_lease_target_ref"; then
    echo "contract-worktree: sprint completion abort failed; closeout journal retained for explicit recovery" >&2
    return 1
  fi
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
  local action="${1:-}" key="" dir status last_phase head claim claim_result=0 target_ref="" target_worktree=""
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
      resolve_sprint_claim_token || return 1
      target_ref="$(closeout_journal_field "$dir/meta.json" target_branch)"
      sprint_lease_abort_completion "$target_ref" || return 1
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

run_merge_gate() {
  local base_ref="$1"
  [[ -f "$helper_dir/merge-gate.ts" ]] || { echo "contract-worktree: merge-gate helper missing" >&2; return 1; }
  is_trusted_executable "$BUN_BIN" || { echo "contract-worktree: trusted Bun runtime required" >&2; return 1; }
  REPO_HARNESS_TARGET_REPO_ROOT="$REPO_ROOT" "$BUN_BIN" "$helper_dir/merge-gate.ts" run --base "$base_ref" --format sha
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
sprint_lease_completion_open=0
sprint_lease_target_ref=""
SPRINT_CLI_RESOLVED=0
SPRINT_CLI_CMD=()

resolve_sprint_cli() {
  [[ "$SPRINT_CLI_RESOLVED" -eq 0 ]] || return 0
  if [[ -n "${REPO_HARNESS_CLI_BIN:-}" ]]; then
    if ! is_trusted_executable "$REPO_HARNESS_CLI_BIN"; then
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
  sprint_lease_completion_open=1
  sprint_lease_target_ref="$target_branch"
  echo "[ContractWorktree] Sprint lease verified for claim $sprint_lease_claim_id"
  return 0
}

# Restore an unpublished completion window to `bound`. The caller must first
# prove that publication did not land; the CLI then independently checks the
# same fencing token, worktree binding, target ref, and canonical pending row.
# The CLI transition is idempotent so recovery can be retried after a crash
# between the lease write and the closeout journal update.
sprint_lease_abort_completion() {
  local target_ref="$1" output
  [[ -n "$sprint_lease_claim_id" ]] || return 0
  if [[ -z "$target_ref" ]]; then
    echo "contract-worktree: sprint completion abort has no recorded target ref" >&2
    return 1
  fi
  if ! output="$(sprint_lease abort-completion \
    --claim-id "$sprint_lease_claim_id" \
    --worktree "$closeout_journal_worktree" \
    --target-ref "$target_ref" 2>&1)"; then
    printf '%s\n' "$output" >&2
    echo "contract-worktree: could not restore sprint lease $sprint_lease_claim_id to bound" >&2
    return 1
  fi
  sprint_lease_completion_open=0
  sprint_lease_target_ref=""
  echo "[ContractWorktree] Restored sprint lease to bound after aborted completion (claim $sprint_lease_claim_id)"
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
  # The opening sample is measurement-only, and a polluted `now_ms` stdout must
  # not abort the finish. An unusable sample is cleared here so `emit_finish_attempt`
  # drops the record instead of the finish.
  finish_attempt_started_ms="$(now_ms || true)"
  [[ "$finish_attempt_started_ms" =~ ^[0-9]+$ ]] || finish_attempt_started_ms=""
  finish_attempt_slug=""
  finish_attempt_frozen_base=""
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
  closeout_claim_target_ref="$target_branch"
  if ! closeout_claim_acquire "finish"; then
    echo "contract-worktree: closeout already owned for this worktree and operation: $closeout_claim_conflict_dir" >&2
    echo "contract-worktree: run 'repo-harness run contract-worktree recover inspect', then 'recover abort' or 'recover reconcile'; 'recover abort' also clears a claim with no recorded journal phase" >&2
    return 1
  fi

  local current_branch slug active_plan="" contract_file="" target_worktree
  local frozen_base_sha
  current_branch="$(git branch --show-current)"
  [[ -n "$current_branch" ]] || { echo "contract-worktree: detached HEAD is not supported" >&2; exit 1; }
  [[ "$current_branch" != "$target_branch" ]] || { echo "contract-worktree: already on target branch $target_branch" >&2; exit 1; }
  slug="$(normalize_slug "${current_branch##*/}")"
  finish_attempt_slug="$slug"
  commit_message="${commit_message:-feat: complete ${slug}}"

  resolve_sprint_claim_token || { closeout_claim_release; return 1; }
  if [[ "$merge_back" -eq 0 && -z "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
    local completed_dir completed_head
    completed_head="$(git rev-parse HEAD)"
    while IFS= read -r completed_dir; do
      [[ -n "$completed_dir" ]] || continue
      if [[ "$(closeout_journal_field "$completed_dir/meta.json" merge_back)" == "0"          && "$(closeout_journal_field "$completed_dir/meta.json" branch)" == "$current_branch"          && "$(closeout_journal_field "$completed_dir/meta.json" target_branch)" == "$target_branch"
         && "$(closeout_journal_field "$completed_dir/meta.json" claim_id)" == "$sprint_lease_claim_id"          && "$(closeout_journal_phase_ref "$completed_dir" complete)" == "$completed_head" ]]; then
        closeout_claim_release
        echo "[ContractWorktree] Candidate already committed; completed transaction replay is a no-op."
        return 0
      fi
    done < <(closeout_journal_list "finish" "complete")
  fi

  # Sprint lease gate, before any verification or publication work: ownership
  # is checked first so a displaced agent stops here rather than after running
  # a full verification pass it may not publish.
  resolve_sprint_claim_token || { closeout_claim_release; return 1; }
  sprint_lease_begin_completion "$target_branch" || { closeout_claim_release; return 1; }

  frozen_base_sha="$(refresh_and_freeze_base "$gate_base_ref" "$target_branch")"
  finish_attempt_frozen_base="$frozen_base_sha"
  if [[ "$merge_back" -eq 1 ]]; then
    target_worktree="$(find_worktree_for_branch "$target_branch" || true)"
    [[ -n "$target_worktree" ]] || { echo "contract-worktree: target branch has no checked-out worktree: $target_branch" >&2; exit 1; }
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
      emit_finish_attempt refused_stale_fork "$frozen_base_sha" ""
      exit 1
    fi
  fi
  local closeout_key closeout_original_head closeout_begin_status=0
  closeout_original_head="$(git rev-parse HEAD)"
  closeout_key="$(closeout_journal_derive_key \
    "repo=$(closeout_journal_root)" \
    "worktree=$closeout_journal_worktree" \
    "operation=finish" \
    "merge_back=$merge_back" \
    "claim_id=$sprint_lease_claim_id" \
    "task_id=$sprint_lease_task_id" \
    "plan=${active_plan:-}" \
    "contract=$contract_file" \
    "original_head=$closeout_original_head" \
    "target_branch=$target_branch" \
    "base_sha=$frozen_base_sha")"
  closeout_claim_bind_journal "$closeout_key"
  if ! sprint_lease_record_finish_transaction "$target_branch" "$closeout_key"; then
    # The first begin-completion already opened the lease window. A target-ref
    # drift or other second-gate refusal is still pre-publication here, so close
    # that window before giving up the closeout claim.
    sprint_lease_abort_completion "$target_branch" || return 1
    closeout_claim_release
    return 1
  fi
  closeout_journal_begin "finish" "$closeout_key" \
    "branch=$current_branch" \
    "plan=${active_plan:-}" \
    "contract=$contract_file" \
    "original_head=$closeout_original_head" \
    "target_branch=$target_branch" \
    "base_ref=$gate_base_ref" \
    "base_sha=$frozen_base_sha" \
    "merge_back=$merge_back" \
    "claim_id=$sprint_lease_claim_id" \
    "task_id=$sprint_lease_task_id" || closeout_begin_status=$?
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

  local verified_sha current_head publication_sha publication_tree frozen_base_tree commit_gpgsign_raw commit_gpgsign config_status
  verified_sha="$(git rev-parse HEAD)"
  if [[ "$merge_back" -eq 0 ]]; then
    finish_transaction_commit "$verified_sha"
    echo "[ContractWorktree] Candidate committed; no main merge or additional verification was performed."
    return 0
  fi
  # Only the actual main effect consumes trusted checks. No archive mutation
  # or second verification can change the candidate after this observation.
  verified_sha="$(run_merge_gate "$gate_base_ref")" || { finish_transaction_abort; return 1; }
  finish_transaction_phase gate_sealed "$verified_sha"

  # Step 7: re-validate the receipt against L (F plus only allowlisted drift),
  # then synthesize one publication commit P whose sole parent is the frozen
  # target base and whose tree is byte-identical to L. Checkpoint and lifecycle
  # commits remain on the source branch for recovery/audit but never become
  # target first-parent history.
  if [[ -n "$(git -C "$target_worktree" status --porcelain=v1 --untracked-files=all)" ]]; then
    echo "contract-worktree: target worktree is dirty, refusing merge: $target_worktree" >&2
    exit 1
  fi

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
    emit_finish_attempt refused_stale_fork "$frozen_base_sha" ""
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
  emit_finish_attempt merged "$frozen_base_sha" "$publication_sha"
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
    echo "[ContractWorktree] merged; cleanup incomplete: publication=$publication_sha worktree=$REPO_ROOT branch=$current_branch" >&2
    echo "[ContractWorktree] Do not repeat merge; run from $target_worktree: repo-harness run contract-worktree cleanup --slug $slug --target $target_branch" >&2
    return 1
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
  local expected_worktree="" expected_head="" expected_target="" expected_merge=""

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
      --expected-worktree|--expected-head|--expected-target|--expected-merge)
        [[ -n "${2:-}" ]] || { echo "contract-worktree: $1 requires a value" >&2; exit 2; }
        case "$1" in
          --expected-worktree) expected_worktree="$2" ;;
          --expected-head) expected_head="$2" ;;
          --expected-target) expected_target="$2" ;;
          --expected-merge) expected_merge="$2" ;;
        esac
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

  if [[ -n "$expected_worktree$expected_head$expected_target$expected_merge" ]]; then
    [[ -n "$expected_worktree" && "$expected_head" =~ ^[a-f0-9]{40,64}$ && "$expected_target" =~ ^[a-f0-9]{40,64}$ && "$expected_merge" =~ ^[a-f0-9]{40,64}$ ]] || { echo "contract-worktree: incomplete exact cleanup identity" >&2; exit 1; }
    [[ "$(git rev-parse "$target_branch^{commit}")" == "$expected_target" ]] || { echo "contract-worktree: cleanup target changed" >&2; exit 1; }
    git merge-base --is-ancestor "$expected_merge" "$expected_target" || { echo "contract-worktree: actual merge is unreachable" >&2; exit 1; }
    if [[ -n "$worktree_path" ]]; then
      [[ "$worktree_path" == "$expected_worktree" && "$(git -C "$worktree_path" rev-parse HEAD)" == "$expected_head" ]] || { echo "contract-worktree: cleanup worktree identity changed" >&2; exit 1; }
    elif [[ -e "$expected_worktree" || -L "$expected_worktree" ]]; then
      echo "contract-worktree: unregistered execution directory remains" >&2; exit 1
    fi
    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
      [[ "$(git rev-parse "refs/heads/$branch_name")" == "$expected_head" ]] || { echo "contract-worktree: cleanup branch moved" >&2; exit 1; }
    fi
  fi

  if [[ -n "$worktree_path" ]] && ! git show-ref --verify --quiet "refs/heads/$branch_name"; then
    echo "contract-worktree: registered worktree branch is missing; refusing unproven cleanup" >&2
    return 1
  fi

  local cleanup_head="" cleanup_target=""
  cleanup_target="$(git rev-parse "$target_branch^{commit}")"
  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    cleanup_head="$(git rev-parse "refs/heads/$branch_name")"
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

  if [[ -n "$worktree_path" ]]; then
    # The current cleanup owner cannot retain the native ledger, runs, and
    # virtual-tree objects. Keep the worktree until that retention is proven.
    if [[ -s "$worktree_path/.ai/harness/evidence/events/log.jsonl" ]] \
      || [[ -n "$(find "$worktree_path/.ai/harness/runs" -maxdepth 1 -type f -name 'verification-*.json' -print -quit 2>/dev/null)" ]]; then
      echo "contract-worktree: native verification evidence retention is unavailable; preserve worktree before cleanup" >&2
      return 1
    fi
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
  if git show-ref --verify --quiet "refs/heads/$branch_name"; then
    run_contract_runtime remove-exact --repo "$current_root" \
      --worktree "${worktree_path:-${expected_worktree:-(absent)}}" \
      --branch "$branch_name" --head "${expected_head:-$cleanup_head}" --target "$target_branch" \
      --target-oid "${expected_target:-$cleanup_target}" --merge "${expected_merge:-$cleanup_target}"
    echo "[ContractWorktree] Removed worktree: ${worktree_path:-(absent)}"
    echo "[ContractWorktree] Deleted branch: $branch_name (update-ref, $merge_mode)"
  fi

  if [[ -n "$expected_worktree" ]]; then
    jq -cn --arg worktree "$expected_worktree" --arg branch "$branch_name" --arg head "$expected_head" --arg target "$expected_target" --arg merge "$expected_merge" '{protocol:1,kind:"repo-harness-exact-local-cleanup",worktree:$worktree,branch:$branch,head_sha:$head,target_oid:$target,merge_commit_sha:$merge,worktree_removed:true,branch_deleted:true}'
    return 0
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
