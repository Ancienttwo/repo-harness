#!/bin/bash
set -euo pipefail

prepare_acceptance=0
contract_override=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prepare-acceptance)
      prepare_acceptance=1
      shift
      ;;
    --contract)
      [[ -n "${2:-}" ]] || { echo "verify-sprint: --contract requires a value" >&2; exit 2; }
      contract_override="$2"
      shift 2
      ;;
    *)
      echo "verify-sprint: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

WORKFLOW_STATE_LIB="${REPO_HARNESS_WORKFLOW_STATE_LIB:-.ai/hooks/lib/workflow-state.sh}"
if [[ -n "${REPO_HARNESS_BUN_BIN:-}" ]] && [[ "$WORKFLOW_STATE_LIB" != /* || ! -f "$WORKFLOW_STATE_LIB" || -L "$WORKFLOW_STATE_LIB" ]]; then
  echo "verify-sprint: trusted workflow-state library is unavailable" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  cd "$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
else
  cd "$SCRIPT_DIR/.."
fi
helper_dir="$SCRIPT_DIR"
BUN_BIN="${REPO_HARNESS_BUN_BIN:-$(command -v bun || true)}"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

# Advisory only (Phase 3 C1): true when the notes file's "## Promotion
# Candidates" section has at least one bullet beyond the three fixed
# boilerplate lines shipped by implementation-notes.template.md. Never
# gates verify-sprint's exit code; callers must guard with `|| true`.
notes_has_promotion_candidates() {
  local file="$1"
  [[ -n "$file" && -f "$file" ]] || return 1
  local in_section=0 line trimmed has_entry=0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$in_section" -eq 0 && "$line" =~ ^##[[:space:]]+Promotion\ Candidates[[:space:]]*$ ]]; then
      in_section=1
      continue
    fi
    if [[ "$in_section" -eq 1 && "$line" =~ ^##[[:space:]] ]]; then
      break
    fi
    [[ "$in_section" -eq 1 ]] || continue
    trimmed="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    [[ -z "$trimmed" ]] && continue
    case "$trimmed" in
      "- Promote to \`tasks/lessons.md\` only after a repeated correction or failure pattern.")
        continue
        ;;
      "- Promote to \`docs/researches/\` only when it is durable repo knowledge with evidence.")
        continue
        ;;
      "- Promote to harness asset files only after verification across more than one task or fixture.")
        continue
        ;;
    esac
    has_entry=1
    break
  done < "$file"
  [[ "$has_entry" -eq 1 ]]
}

# Advisory only (Phase 3 C1): print finish-time memory nudges to stderr.
# Never mutates tasks/lessons.md or tasks/todos.md (no --write), and never
# changes verify-sprint's exit code; the caller guards with `|| true`.
print_maintenance_advisories() {
  local notes_file="$1"

  if notes_has_promotion_candidates "$notes_file"; then
    echo "[Maintenance] Notes list promotion candidates — review before archive: $notes_file" >&2
  fi

  if command -v jq >/dev/null 2>&1 && [[ -f "$helper_dir/maintenance-triage.sh" ]]; then
    local triage_json guard_count eval_count skill_count
    triage_json="$(bash "$helper_dir/maintenance-triage.sh" --json 2>/dev/null || true)"
    if [[ -n "$triage_json" ]] && printf '%s' "$triage_json" | jq -e . >/dev/null 2>&1; then
      guard_count="$(printf '%s' "$triage_json" | jq '.guard | length' 2>/dev/null || echo 0)"
      eval_count="$(printf '%s' "$triage_json" | jq '.eval | length' 2>/dev/null || echo 0)"
      skill_count="$(printf '%s' "$triage_json" | jq '.skill_proposal | length' 2>/dev/null || echo 0)"
      if [[ "${guard_count:-0}" -gt 0 || "${eval_count:-0}" -gt 0 || "${skill_count:-0}" -gt 0 ]]; then
        echo "[Maintenance] Repeated lessons ready to promote: guard=${guard_count} eval=${eval_count} skill_proposal=${skill_count} (see tasks/lessons.md)" >&2
      fi
    fi
  fi
}

read_contract_task_profile() {
  local file="$1"
  awk '/^> \*\*Task Profile\*\*:/ {sub(/^.*> \*\*Task Profile\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

contract_allowed_paths() {
  local file="$1"
  awk '
    BEGIN { in_block = 0; block = ""; found = 0 }
    /^```yaml[[:space:]]*$/ {
      in_block = 1
      block = ""
      next
    }
    /^```[[:space:]]*$/ && in_block == 1 {
      if (!found && block ~ /(^|[[:space:]])allowed_paths:/) {
        printf "%s", block
        found = 1
      }
      in_block = 0
      block = ""
      next
    }
    in_block == 1 {
      block = block $0 ORS
    }
  ' "$file" | awk '
    function trim(s) {
      gsub(/^[[:space:]]+/, "", s)
      gsub(/[[:space:]]+$/, "", s)
      return s
    }
    /^[[:space:]]*allowed_paths:[[:space:]]*$/ { in_paths = 1; next }
    in_paths && /^[^[:space:]]/ { exit }
    in_paths && /^[[:space:]]*-[[:space:]]*/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/^["'\''`]+|["'\''`]+$/, "", line)
      print trim(line)
    }
  '
}

read_active_plan() {
  local marker plan
  if declare -F workflow_active_plan >/dev/null 2>&1; then
    workflow_active_plan || true
    return 0
  fi
  for marker in ".ai/harness/active-plan"; do
    if [[ -f "$marker" ]]; then
      plan="$(cat "$marker" 2>/dev/null | xargs)"
      if [[ -n "$plan" ]]; then
        printf '%s' "$plan"
        return 0
      fi
    fi
  done
}

active_plan_declared_path() {
  local label="$1"
  local active_plan
  active_plan="$(read_active_plan || true)"
  [[ -n "$active_plan" && -f "$active_plan" ]] || return 1
  awk -v label="$label" '
    BEGIN { pattern = "^> \\*\\*" label "\\*\\*:" }
    $0 ~ pattern {
      sub(pattern "[[:space:]]*", "")
      gsub(/`/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$active_plan" | xargs
}

# Same field-declaration parser as active_plan_declared_path, but reads an
# explicit file instead of the active-plan marker. Used by the --contract
# override so a historical/non-active contract's own Review File / Notes
# File header fields resolve without touching active-plan state.
contract_declared_path() {
  local file="$1"
  local label="$2"
  [[ -n "$file" && -f "$file" ]] || return 1
  awk -v label="$label" '
    BEGIN { pattern = "^> \\*\\*" label "\\*\\*:" }
    $0 ~ pattern {
      sub(pattern "[[:space:]]*", "")
      gsub(/`/, "")
      gsub(/\r/, "")
      print
      exit
    }
  ' "$file" | xargs
}

git_changed_files_json() {
  local changed_file
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    printf '[]'
    return 0
  fi
  while IFS= read -r changed_file; do
    if [[ -n "$changed_file" ]] && ! ignore_changed_file_for_scope "$changed_file"; then
      printf '%s\n' "$changed_file"
    fi
  done < <(git_changed_files_list | awk 'NF && !seen[$0]++') | jq -R -s 'split("\n") | map(select(length > 0))'
}

# Selects exactly one contract-worktree metadata record for this worktree and
# emits it as a `\x1f`-joined
# `<source_file> <match_kind> <base_commit> <base_branch> <started_at>` line.
#
# Sole selection authority. The diff-base resolver and the staleness guard below
# both read this one record, so they cannot disagree about which file describes
# this worktree. An earlier version emitted every matching row and let each
# caller pick, which let an all-empty record satisfy the guard while the
# resolver walked past it to a stale one.
#
# Exit codes: 0 with a record, 1 when nothing matches (the only silent path),
# 2 when metadata exists but cannot be trusted, with the reason on stderr.
contract_worktree_metadata_select() {
  local current_worktree current_branch metadata_file parsed
  local -a exact=() branch_only=()
  local any_file=0

  current_worktree="$(pwd -P)"
  current_branch="$(git branch --show-current 2>/dev/null || true)"

  for metadata_file in .ai/harness/worktrees/*.json; do
    [[ -f "$metadata_file" ]] || continue
    any_file=1
    if ! command -v jq >/dev/null 2>&1; then
      echo "verify-sprint: contract worktree metadata is present but jq is unavailable: $metadata_file" >&2
      echo "verify-sprint: reason=parser_unavailable" >&2
      echo "verify-sprint: the scope-base guard cannot run without a JSON parser; install jq or remove the metadata" >&2
      return 2
    fi
    if ! parsed="$(jq -er \
      --arg worktree "$current_worktree" \
      --arg branch "$current_branch" \
      '
      def kind:
        if ((.worktree // "") != "" and (.worktree // "") == $worktree) then "exact_worktree"
        elif ($branch != "" and (.branch // "") == $branch) then "branch"
        else "none" end;
      [kind, (.base_commit // ""), (.base_branch // ""), (.started_at // "")] | join("\u001f")
      ' "$metadata_file" 2>/dev/null)"; then
      echo "verify-sprint: contract worktree metadata is not valid JSON: $metadata_file" >&2
      echo "verify-sprint: reason=metadata_unparseable" >&2
      return 2
    fi
    case "$parsed" in
      exact_worktree*) exact+=("$metadata_file"$'\x1f'"$parsed") ;;
      branch*) branch_only+=("$metadata_file"$'\x1f'"$parsed") ;;
    esac
  done

  [[ "$any_file" -eq 1 ]] || return 1

  if ((${#exact[@]} > 1)); then
    echo "verify-sprint: more than one metadata record claims this worktree path" >&2
    echo "verify-sprint: reason=duplicate_exact_worktree_metadata" >&2
    printf 'verify-sprint:   %s\n' "${exact[@]%%$'\x1f'*}" >&2
    return 2
  fi
  if ((${#exact[@]} == 1)); then
    printf '%s' "${exact[0]}"
    return 0
  fi
  if ((${#branch_only[@]} > 1)); then
    echo "verify-sprint: more than one metadata record claims branch '$current_branch'" >&2
    echo "verify-sprint: reason=duplicate_branch_metadata" >&2
    printf 'verify-sprint:   %s\n' "${branch_only[@]%%$'\x1f'*}" >&2
    return 2
  fi
  if ((${#branch_only[@]} == 1)); then
    printf '%s' "${branch_only[0]}"
    return 0
  fi
  return 1
}

# Splits a selected record into the caller's named variables.
contract_worktree_metadata_fields() {
  local record="$1"
  IFS=$'\x1f' read -r META_SOURCE_FILE META_MATCH_KIND META_BASE_COMMIT META_BASE_BRANCH META_STARTED_AT <<< "$record"
}

contract_worktree_base_commit() {
  local record base_commit
  record="$(contract_worktree_metadata_select)" || return 1
  contract_worktree_metadata_fields "$record"
  base_commit="$META_BASE_COMMIT"

  if [[ -n "$base_commit" ]]; then
    git rev-parse --verify "$base_commit^{commit}" >/dev/null 2>&1 || return 1
    printf '%s' "$base_commit"
    return 0
  fi
  if [[ -n "$META_STARTED_AT" ]]; then
    base_commit="$(git rev-list -1 --before="$META_STARTED_AT" HEAD 2>/dev/null || true)"
    if [[ -n "$base_commit" ]]; then
      printf '%s' "$base_commit"
      return 0
    fi
  fi
  if [[ -n "$META_BASE_BRANCH" ]] && git rev-parse --verify "$META_BASE_BRANCH^{commit}" >/dev/null 2>&1; then
    base_commit="$(git merge-base HEAD "$META_BASE_BRANCH" 2>/dev/null || true)"
    if [[ -n "$base_commit" ]]; then
      printf '%s' "$base_commit"
      return 0
    fi
  fi

  return 1
}

git_diff_base_ref() {
  local branch task_base_commit
  if [[ -n "${REPO_HARNESS_DIFF_BASE:-}" ]]; then
    printf '%s' "$REPO_HARNESS_DIFF_BASE"
    return 0
  fi
  if [[ -n "${HARNESS_DIFF_BASE:-}" ]]; then
    printf '%s' "$HARNESS_DIFF_BASE"
    return 0
  fi
  if [[ -n "${GITHUB_BASE_REF:-}" ]]; then
    if git rev-parse --verify "origin/${GITHUB_BASE_REF}^{commit}" >/dev/null 2>&1; then
      printf 'origin/%s' "$GITHUB_BASE_REF"
    else
      printf '%s' "$GITHUB_BASE_REF"
    fi
    return 0
  fi

  task_base_commit="$(contract_worktree_base_commit || true)"
  if [[ -n "$task_base_commit" ]]; then
    printf '%s' "$task_base_commit"
    return 0
  fi

  branch="$(git branch --show-current 2>/dev/null || true)"
  if [[ "$branch" != "main" ]] && git rev-parse --verify "origin/main^{commit}" >/dev/null 2>&1; then
    printf 'origin/main'
    return 0
  fi
  if [[ "$branch" != "main" ]] && git rev-parse --verify "main^{commit}" >/dev/null 2>&1; then
    printf 'main'
    return 0
  fi

  return 1
}

git_diff_merge_base() {
  local base_ref
  base_ref="$(git_diff_base_ref || true)"
  [[ -n "$base_ref" ]] || return 1
  git rev-parse --verify "$base_ref^{commit}" >/dev/null 2>&1 || return 1
  git merge-base HEAD "$base_ref" 2>/dev/null
}

# `base_commit` in .ai/harness/worktrees/<slug>.json is stored state, not
# derived: `write_start_metadata` returns early once the file exists, so
# rebasing a contract worktree moves the branch and leaves that value at the
# pre-rebase base. Every scope gate afterwards then diffs from a base that is no
# longer this branch's fork point and charges the target's own commits to this
# contract's allowed_paths.
#
# The predicate is equality with the current fork point, NOT ancestry. Ancestry
# is satisfied trivially in the case that was actually observed: rebasing onto a
# target that grew from the recorded base leaves that base reachable from HEAD,
# so `merge-base --is-ancestor` passes while the diff still spans the target's
# own commits.
#
# Every state that is neither "no matching metadata" nor "verified current"
# fails closed and names its own cause. A single "was rebased" message for all
# of them sends the reader looking for a rebase that may never have happened.
assert_contract_worktree_base_is_current_fork_point() {
  local record select_status fork_point base_upstream
  local -a bases=()

  # An explicit override outranks metadata in `git_diff_base_ref`, so the
  # recorded base is not the diff base and this guard has no claim.
  [[ -z "${REPO_HARNESS_DIFF_BASE:-}${HARNESS_DIFF_BASE:-}" ]] || return 0

  select_status=0
  record="$(contract_worktree_metadata_select)" || select_status=$?
  case "$select_status" in
    0) ;;
    1) return 0 ;;
    *) exit 1 ;;
  esac

  contract_worktree_metadata_fields "$record"

  # A record that claims this worktree but supplies no base at all is malformed:
  # the resolver has nothing to derive from either, so the selection is
  # meaningless rather than merely unverifiable.
  if [[ -z "$META_BASE_COMMIT" && -z "$META_STARTED_AT" && -z "$META_BASE_BRANCH" ]]; then
    echo "verify-sprint: contract worktree metadata carries no base at all: $META_SOURCE_FILE" >&2
    echo "verify-sprint: reason=metadata_malformed" >&2
    echo "verify-sprint:   missing: base_commit, started_at, base_branch" >&2
    echo "verify-sprint: repair or remove the record" >&2
    exit 1
  fi

  # No recorded base, but a usable fallback: the resolver derives one from
  # started_at or base_branch on every run, so nothing stored can have gone
  # stale. This is the documented legacy shape, not a malformed record.
  [[ -n "$META_BASE_COMMIT" ]] || return 0

  if [[ -z "$META_BASE_BRANCH" ]]; then
    echo "verify-sprint: contract worktree metadata records a base_commit with no base_branch: $META_SOURCE_FILE" >&2
    echo "verify-sprint: reason=metadata_malformed" >&2
    echo "verify-sprint:   missing: base_branch" >&2
    echo "verify-sprint: a stored base cannot be checked against a fork point without its branch; repair or remove the record" >&2
    exit 1
  fi

  if ! git rev-parse --verify "$META_BASE_BRANCH^{commit}" >/dev/null 2>&1; then
    echo "verify-sprint: recorded base_branch does not resolve: $META_BASE_BRANCH" >&2
    echo "verify-sprint: reason=base_ref_unresolvable" >&2
    echo "verify-sprint: source: $META_SOURCE_FILE" >&2
    exit 1
  fi

  # A target ref that lags its own remote-tracking ref makes the local fork
  # point look current while the real integration target has moved. Compared
  # against an already-present tracking ref only; this guard never fetches.
  base_upstream="$(git rev-parse --verify --symbolic-full-name "$META_BASE_BRANCH@{upstream}" 2>/dev/null || true)"
  if [[ -n "$base_upstream" ]]; then
    if [[ "$(git rev-parse "$META_BASE_BRANCH^{commit}")" != "$(git rev-parse "$base_upstream^{commit}")" ]]; then
      echo "verify-sprint: recorded base_branch is not synchronized with its upstream" >&2
      echo "verify-sprint: reason=base_ref_unsynchronized" >&2
      echo "verify-sprint:   $META_BASE_BRANCH: $(git rev-parse "$META_BASE_BRANCH^{commit}")" >&2
      echo "verify-sprint:   $base_upstream: $(git rev-parse "$base_upstream^{commit}")" >&2
      echo "verify-sprint: fetch and reconcile $META_BASE_BRANCH before running the gate" >&2
      exit 1
    fi
  fi

  while IFS= read -r fork_point; do
    [[ -n "$fork_point" ]] && bases+=("$fork_point")
  done < <(git merge-base --all HEAD "$META_BASE_BRANCH" 2>/dev/null || true)

  if ((${#bases[@]} == 0)); then
    echo "verify-sprint: HEAD and $META_BASE_BRANCH share no common ancestor" >&2
    echo "verify-sprint: reason=no_common_ancestor" >&2
    echo "verify-sprint: source: $META_SOURCE_FILE" >&2
    exit 1
  fi

  # Criss-cross history can leave several equally-best merge bases, and plain
  # `git merge-base` picks one without guaranteeing which. Scope computed from
  # different bases is a different changed set, so this is its own class -- not
  # a stale base, and not something to resolve by accepting any member.
  if ((${#bases[@]} > 1)); then
    echo "verify-sprint: HEAD and $META_BASE_BRANCH have more than one best merge base" >&2
    echo "verify-sprint: reason=ambiguous_merge_base" >&2
    printf 'verify-sprint:   %s\n' "${bases[@]}" >&2
    echo "verify-sprint: pick the intended diff base explicitly via REPO_HARNESS_DIFF_BASE" >&2
    exit 1
  fi

  fork_point="${bases[0]}"
  [[ "$META_BASE_COMMIT" != "$fork_point" ]] || return 0

  # Two different failures share this comparison. A base that is an ancestor of
  # the target is a target that moved under the worktree -- the rebase case. A
  # base that is not is a worktree started from a source ahead of the target,
  # which `contract-worktree start` records as the source HEAD; publishing that
  # tree would carry the parent's commits into the target without them ever
  # appearing in this contract's own scope.
  if git merge-base --is-ancestor "$META_BASE_COMMIT" "$META_BASE_BRANCH" 2>/dev/null; then
    echo "verify-sprint: contract worktree base_commit is stale" >&2
    echo "verify-sprint: reason=stale_base_commit" >&2
    echo "verify-sprint:   recorded base:                 $META_BASE_COMMIT" >&2
    echo "verify-sprint:   current fork point ($META_BASE_BRANCH): $fork_point" >&2
    echo "verify-sprint: this worktree was rebased after start; $META_SOURCE_FILE still records the pre-rebase base" >&2
    echo "verify-sprint: refresh base_commit to $fork_point before re-running the gate, or rebuild the worktree" >&2
    exit 1
  fi

  echo "verify-sprint: contract worktree started from a source ahead of its base_branch" >&2
  echo "verify-sprint: reason=stacked_source_start" >&2
  echo "verify-sprint:   recorded base:                 $META_BASE_COMMIT" >&2
  echo "verify-sprint:   current fork point ($META_BASE_BRANCH): $fork_point" >&2
  echo "verify-sprint: no rebase happened; the recorded base is not reachable from $META_BASE_BRANCH" >&2
  echo "verify-sprint: publication would carry the parent work into $META_BASE_BRANCH outside this contract's scope" >&2
  echo "verify-sprint: land the parent work first, or restart this contract from $META_BASE_BRANCH" >&2
  exit 1
}

git_changed_files_list() {
  local merge_base
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  merge_base="$(git_diff_merge_base || true)"
  if [[ -n "$merge_base" ]]; then
    git -c core.quotePath=false diff --name-only "$merge_base" HEAD 2>/dev/null || true
  fi
  git -c core.quotePath=false diff --name-only HEAD 2>/dev/null || true
  git -c core.quotePath=false ls-files --others --exclude-standard 2>/dev/null || true
}

allowed_paths_json() {
  local file="$1"
  if ! command -v jq >/dev/null 2>&1; then
    printf '[]'
    return 0
  fi
  contract_allowed_paths "$file" | jq -R -s 'split("\n") | map(select(length > 0))'
}

path_under_allowed_prefix() {
  local path="$1"
  local prefix="$2"
  prefix="${prefix%/}"
  [[ -n "$prefix" ]] || return 1
  [[ "$path" == "$prefix" || "$path" == "$prefix/"* ]]
}

ignore_changed_file_for_scope() {
  case "$1" in
    .ai/harness/active-plan|.ai/harness/active-worktree)
      return 0
      ;;
  esac
  return 1
}

allowed_paths_check_json() {
  local file="$1"
  shift
  local changed_file allowed_path outside=0 checked=0
  local outside_file=""
  local allowed_paths=()
  local changed_files=("$@")

  if ! command -v jq >/dev/null 2>&1; then
    printf '{"status":"unavailable","message":"jq unavailable"}'
    return 0
  fi

  while IFS= read -r allowed_path; do
    [[ -n "$allowed_path" ]] && allowed_paths+=("$allowed_path")
  done < <(contract_allowed_paths "$file")

  if ((${#allowed_paths[@]} == 0)); then
    if ((${#changed_files[@]} == 0)); then
      jq -n '{status:"unavailable", checked:false, message:"contract has no allowed_paths and no changed files were detected", allowed_paths: [], outside: []}'
    else
      jq -n \
        --argjson outside "$(printf '%s\n' "${changed_files[@]+"${changed_files[@]}"}" | jq -R -s 'split("\n") | map(select(length > 0))')" \
        '{status:"fail", checked:true, message:"contract has no allowed_paths", allowed_paths: [], outside:$outside}'
    fi
    return 0
  fi

  for changed_file in "${changed_files[@]+"${changed_files[@]}"}"; do
    [[ -n "$changed_file" ]] || continue
    if ignore_changed_file_for_scope "$changed_file"; then
      continue
    fi
    checked=1
    local matched=0
    for allowed_path in "${allowed_paths[@]+"${allowed_paths[@]}"}"; do
      if path_under_allowed_prefix "$changed_file" "$allowed_path"; then
        matched=1
        break
      fi
    done
    if [[ "$matched" -eq 0 ]]; then
      outside=1
      outside_file="${outside_file}${changed_file}"$'\n'
    fi
  done

  if [[ "$outside" -eq 0 ]]; then
    contract_allowed_paths "$file" | jq -R -s --arg checked "$checked" '{
      status: "pass",
      checked: ($checked == "1"),
      allowed_paths: (split("\n") | map(select(length > 0))),
      outside: []
    }'
  else
    jq -n \
      --argjson allowed "$(allowed_paths_json "$file")" \
      --argjson outside "$(printf '%s' "$outside_file" | jq -R -s 'split("\n") | map(select(length > 0))')" \
      '{status:"fail", checked:true, allowed_paths:$allowed, outside:$outside}'
  fi
}

# EPC-02: after a successful verification (both the --prepare-acceptance
# freeze path and the finalize path), append one authoritative_machine
# EvidenceEvent bound to the frozen review subject (D3/D4). Reads the subject,
# run snapshot, and guard counts back out of $checks_file rather than any
# in-scope bash variable, so the emitted evidence is always bound to exactly
# what that file already asserts passed -- never a second, possibly-stale
# notion of "the subject" computed independently in this script. Additive
# only.
#
# Exit code contract (matches emit-verify-evidence.ts): 0 = emitted; 3 =
# cannot-bind refusal (no active contract, dirty/untracked contract, or --
# the case handled here -- the TS entry itself unresolvable in this
# deployed-helper context); any other non-zero = a real failure (subject
# mismatch, store/genesis error) and must fail the caller's verify run. A
# cannot-bind refusal is refusal-to-fabricate, not a fallback: no gate reads
# the ledger yet, so skipping emission here satisfies nothing and changes no
# verify-run semantics.
#
# The package runner executes this helper from assets/templates/helpers while
# the authoritative emitter ships under scripts/. Direct source-helper runs
# already find the emitter as a sibling. REPO_HARNESS_SOURCE_ROOT remains the
# explicit source-checkout override used by the other source-authority calls.
# When none resolves, emission still fails closed as "cannot bind".
emit_verify_evidence() {
  local command_line="$1"
  local run_trace_file="$2"
  local status="${3:-pass}"
  local emit_script="$helper_dir/emit-verify-evidence.ts"
  local package_emit_script="$helper_dir/../../../scripts/emit-verify-evidence.ts"
  if [[ ! -f "$emit_script" ]]; then
    if [[ -f "$package_emit_script" ]]; then
      emit_script="$package_emit_script"
    elif [[ -n "${REPO_HARNESS_SOURCE_ROOT:-}" && -f "${REPO_HARNESS_SOURCE_ROOT}/scripts/emit-verify-evidence.ts" ]]; then
      emit_script="${REPO_HARNESS_SOURCE_ROOT}/scripts/emit-verify-evidence.ts"
    else
      echo "verify-sprint: evidence emission cannot bind: no $helper_dir/emit-verify-evidence.ts, no $package_emit_script, and no usable REPO_HARNESS_SOURCE_ROOT override; skipping emission, verify result unchanged" >&2
      return 3
    fi
  fi
  [[ -n "$BUN_BIN" && -x "$BUN_BIN" ]] || { echo "verify-sprint: trusted Bun runtime is unavailable for evidence emission" >&2; return 1; }
  command -v jq >/dev/null 2>&1 || { echo "verify-sprint: jq is required for evidence emission" >&2; return 1; }
  [[ -n "$run_trace_file" && -s "$run_trace_file" ]] || { echo "verify-sprint: run-trace file is missing for evidence emission: $run_trace_file" >&2; return 1; }
  local subject_sha256 run_snapshot counts_json
  subject_sha256="$(jq -r '.review_subject_sha256 // empty' "$run_trace_file" 2>/dev/null)"
  run_snapshot="$(jq -r '.lifecycle.snapshot // empty' "$run_trace_file" 2>/dev/null)"
  counts_json="$(jq -c '{guards_total: (.guards | length), guards_passed: ([.guards[] | select(.status=="pass")] | length)}' "$run_trace_file" 2>/dev/null)"
  [[ -n "$subject_sha256" && -n "$run_snapshot" ]] || { echo "verify-sprint: prepared evidence is missing subject or run snapshot; evidence emission needs a frozen --prepare-acceptance run" >&2; return 1; }
  "$BUN_BIN" "$emit_script" \
    --repo-root "$(pwd -P)" \
    --contract "$contract_file" \
    --subject-sha256 "$subject_sha256" \
    --command "$command_line" \
    --status "$status" \
    --run-snapshot "$run_snapshot" \
    --counts-json "$counts_json" \
    --run-trace-file "$run_trace_file" \
    --checks-file "$checks_file"
  return $?
}

# Runs before contract resolution: a stale base is a property of the worktree,
# not of the contract, and diagnosing it first is the whole point -- the failure
# this replaces surfaced as an allowed_paths violation listing unrelated files.
assert_contract_worktree_base_is_current_fork_point

if [[ -f "$WORKFLOW_STATE_LIB" ]]; then
  # shellcheck source=/dev/null
  . "$WORKFLOW_STATE_LIB"
  checks_file="$(workflow_checks_file)"
else
  checks_file=".ai/harness/checks/latest.json"
fi

if [[ -n "$contract_override" ]]; then
  # Explicit binding consulted before the active-marker/fallback chain below:
  # lets verify-sprint (and the completed_archive_gate evidence it produces)
  # bind to a historical/non-active contract without touching active-plan
  # state. Every downstream evidence/receipt/gate check still runs against
  # whatever contract_file resolves to here — no gate is relaxed.
  [[ -f "$contract_override" ]] || { echo "verify-sprint: --contract path does not exist: $contract_override" >&2; exit 1; }
  grep -q '^# Task Contract:' "$contract_override" || { echo "verify-sprint: --contract path is not a task contract file: $contract_override" >&2; exit 1; }
  contract_file="$contract_override"
  review_file="$(contract_declared_path "$contract_file" "Review File" || true)"
  notes_file="$(contract_declared_path "$contract_file" "Notes File" || true)"
elif [[ -f "$WORKFLOW_STATE_LIB" ]]; then
  contract_file="$(workflow_active_contract || true)"
  review_file="$(workflow_active_review || true)"
  notes_file="$(workflow_active_notes || true)"
else
  contract_file="$(find tasks/contracts -maxdepth 1 -name '*.contract.md' -type f 2>/dev/null | sort | head -n 1)"
  if [[ -n "$contract_file" ]]; then
    contract_slug="$(basename "$contract_file" | sed -E 's/\.contract\.md$//')"
    review_file="tasks/reviews/${contract_slug}.review.md"
    notes_file="tasks/notes/${contract_slug}.notes.md"
  else
    review_file=""
    notes_file=""
  fi
fi
if [[ -z "$contract_override" ]]; then
  if [[ -z "$contract_file" || ! -f "$contract_file" ]]; then
    contract_file="$(active_plan_declared_path "Task Contract" || active_plan_declared_path "Sprint Contract" || true)"
  fi
  if [[ -z "$review_file" || ! -f "$review_file" ]]; then
    review_file="$(active_plan_declared_path "Task Review" || active_plan_declared_path "Sprint Review" || true)"
  fi
  if [[ -z "$notes_file" || ! -f "$notes_file" ]]; then
    notes_file="$(active_plan_declared_path "Implementation Notes" || active_plan_declared_path "Notes File" || true)"
  fi
fi

[[ -n "$contract_file" && -f "$contract_file" ]] || { echo "No active sprint contract found" >&2; exit 1; }

finalize_prepared_acceptance() {
  local acceptance_row acceptance_exit acceptance_status acceptance_reviewer acceptance_source acceptance_disposition acceptance_message
  local finalized_checks change_assessment_file=".ai/harness/checks/change-assessment.latest.json"

  [[ -n "$BUN_BIN" && -x "$BUN_BIN" ]] || { echo "verify-sprint: trusted Bun runtime is unavailable" >&2; return 1; }
  [[ -f "$helper_dir/acceptance-receipt.ts" ]] || { echo "verify-sprint: AcceptanceReceipt helper is missing: $helper_dir/acceptance-receipt.ts" >&2; return 1; }
  [[ -n "$review_file" && -f "$review_file" ]] || { echo "verify-sprint: task review projection file is missing" >&2; return 1; }
  [[ -s "$checks_file" ]] || { echo "verify-sprint: prepared verification evidence is missing; run with --prepare-acceptance first" >&2; return 1; }
  [[ -s "$change_assessment_file" ]] || { echo "verify-sprint: current Change Assessment packet is missing; rerun --prepare-acceptance first" >&2; return 1; }
  command -v jq >/dev/null 2>&1 || { echo "verify-sprint: jq is required to finalize AcceptanceReceipt evidence" >&2; return 1; }
  jq -e '.source == "verify-sprint" and .status == "pass" and .exit_code == 0 and (.change_assessment.status == "pass") and ([.guards[] | select(.name == "change_assessment" and .status == "pass")] | length == 1)' "$checks_file" >/dev/null 2>&1 || {
    echo "verify-sprint: prepared verification evidence is not passing; run with --prepare-acceptance first" >&2
    return 1
  }
  jq -e --slurpfile current_assessment "$change_assessment_file" '.change_assessment == $current_assessment[0]' "$checks_file" >/dev/null 2>&1 || {
    echo "verify-sprint: Change Assessment packet changed after prepared evidence; rerun --prepare-acceptance before recording/finalizing AcceptanceReceipt" >&2
    return 1
  }

  set +e
  acceptance_row="$(REPO_HARNESS_TARGET_REPO_ROOT="$(pwd -P)" "$BUN_BIN" "$helper_dir/acceptance-receipt.ts" verify \
    --contract "$contract_file" --verification "$checks_file" --format row 2>&1)"
  acceptance_exit=$?
  set -e
  [[ "$acceptance_exit" -eq 0 ]] || { printf '%s\n' "$acceptance_row" >&2; return 1; }
  IFS=$'\t' read -r acceptance_status acceptance_reviewer acceptance_source acceptance_disposition acceptance_message <<< "$acceptance_row"
  [[ "$acceptance_status" == "pass" ]] || { echo "verify-sprint: AcceptanceReceipt did not verify: $acceptance_message" >&2; return 1; }
  case "$acceptance_disposition" in
    external_pass|user_waiver) ;;
    *) echo "verify-sprint: AcceptanceReceipt disposition is not a closeout state: $acceptance_disposition" >&2; return 1 ;;
  esac

  REPO_HARNESS_TARGET_REPO_ROOT="$(pwd -P)" "$BUN_BIN" "$helper_dir/acceptance-receipt.ts" project \
    --contract "$contract_file" --verification "$checks_file" --review "$review_file" >/dev/null

  finalized_checks="$(mktemp)"
  # `$checks_file` is a materialized projection, not a run trace: the
  # materializer (src/effects/evidence/checks-materializer.ts) appends its own
  # `provenance` block to whatever run trace it projects. Re-emitting that
  # block as payload would make the next materialization record
  # `content_hash = sha256(run_trace including the previous provenance)` while
  # publishing a file whose consumer-facing content excludes it, so the
  # published projection could no longer be recomputed from its own bytes
  # (tests/evidence-projection-drift.test.ts's live self-consistency check).
  # `provenance` is materializer-owned derived metadata; strip it here so the
  # emitted run trace is a run trace again and the next projection is
  # self-consistent by construction -- no second hash implementation.
  jq \
    --arg reviewer "$acceptance_reviewer" \
    --arg source "$acceptance_source" \
    --arg disposition "$acceptance_disposition" \
    --arg message "$acceptance_message" \
    '
      del(.provenance)
      | .acceptance_receipt = {
        status: "pass",
        disposition: $disposition,
        reviewer: $reviewer,
        source: $source,
        message: $message
      }
      | .guards = [.guards[] | if .name == "acceptance_receipt" then .status = "pass" else . end]
      | .next_step = "finish contract worktree or archive completed task"
    ' "$checks_file" > "$finalized_checks"
  echo "Sprint acceptance finalized without rerunning verification"
  echo "Prepared evidence: $checks_file"
  set +e
  emit_verify_evidence "repo-harness run verify-sprint" "$finalized_checks" "pass"
  local emit_exit=$?
  set -e
  rm -f "$finalized_checks"
  case "$emit_exit" in
    0) : ;;
    3) : ;;
    *) echo "verify-sprint: evidence emission failed" >&2; return 1 ;;
  esac
}

if [[ "$prepare_acceptance" -eq 0 ]]; then
  finalize_prepared_acceptance
  exit $?
fi

generated_at="$(date '+%Y-%m-%dT%H:%M:%S%z')"
run_stamp="$(date '+%Y%m%dT%H%M%S')"
run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${run_stamp}-$$}}}"
safe_run_id="$(printf '%s' "$run_id" | sed -E 's/[^A-Za-z0-9._-]+/-/g')"
contract_slug="$(basename "$contract_file" | sed -E 's/\.contract\.md$//')"
safe_contract_slug="$(printf '%s' "$contract_slug" | sed -E 's/[^A-Za-z0-9._-]+/-/g')"
runs_dir=".ai/harness/runs"
if declare -F workflow_runs_dir >/dev/null 2>&1; then
  runs_dir="$(workflow_runs_dir)"
fi
run_file="${runs_dir}/${safe_run_id}-${safe_contract_slug}.json"

mkdir -p "$(dirname "$checks_file")"
mkdir -p "$runs_dir"
contract_report="$(mktemp)"
checks_report="$(mktemp)"
trap 'rm -f "$contract_report" "$checks_report"' EXIT
task_profile="$(read_contract_task_profile "$contract_file" || true)"
active_plan="$(read_active_plan || true)"
worktree_path="$(pwd -P)"
branch_name="$(git branch --show-current 2>/dev/null || true)"
diff_base_ref="$(git_diff_base_ref || true)"
diff_base_commit="$(git_diff_merge_base || true)"
workflow_source_authority_call() {
  local callback="$1"
  shift
  if [[ -n "${REPO_HARNESS_SOURCE_ROOT:-}" && -f "${REPO_HARNESS_SOURCE_ROOT}/src/cli/hook-entry.ts" ]]; then
    HOOK_REPO_ROOT="$REPO_HARNESS_SOURCE_ROOT" "$callback" "$@"
  else
    "$callback" "$@"
  fi
}
# Source-authority verification must use the same checkout's hook CLI for every
# freshness lookup. Each caller below runs in command substitution, so contract
# commands and fixture subprocesses never inherit the temporary HOOK_REPO_ROOT.
review_subject_sha256="$(workflow_source_authority_call workflow_current_review_subject_value 2>/dev/null || true)"
changed_files=()
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  while IFS= read -r changed_file; do
    if [[ -n "$changed_file" ]] && ! ignore_changed_file_for_scope "$changed_file"; then
      changed_files+=("$changed_file")
    fi
  done < <(git_changed_files_list | awk 'NF && !seen[$0]++')
fi
allowed_paths_check="$(allowed_paths_check_json "$contract_file" "${changed_files[@]+"${changed_files[@]}"}")"
allowed_paths_status="unavailable"
if command -v jq >/dev/null 2>&1; then
  allowed_paths_status="$(printf '%s' "$allowed_paths_check" | jq -r '.status // "unavailable"' 2>/dev/null || printf 'unavailable')"
fi

contract_command="repo-harness run verify-contract --contract $contract_file --strict --read-only --report-file <temp>"
if [[ -f "$helper_dir/prepare-codex-handoff.sh" && ( -f ".ai/harness/handoff/current.md" || -f ".ai/harness/handoff/resume.md" ) ]]; then
  bash "$helper_dir/prepare-codex-handoff.sh" --reason "repo-harness-verify-sprint" >/dev/null || true
fi
set +e
contract_output="$(bash "$helper_dir/verify-contract.sh" --contract "$contract_file" --strict --read-only --report-file "$contract_report" 2>&1)"
contract_exit=$?
set -e

if [[ -n "$contract_output" ]]; then
  printf '%s\n' "$contract_output"
fi

benchmark_evidence_fingerprint=""
benchmark_subject_sha256=""
benchmark_evidence_status="not_applicable"
benchmark_evidence_requirement=""
if declare -F workflow_contract_evidence_requirement >/dev/null 2>&1; then
  benchmark_evidence_requirement="$(workflow_contract_evidence_requirement "$contract_file" 2>/dev/null || true)"
fi
case "$benchmark_evidence_requirement" in
  required)
    if declare -F workflow_benchmark_evidence_fingerprint >/dev/null 2>&1; then
      benchmark_evidence_fingerprint="$(workflow_benchmark_evidence_fingerprint 2>/dev/null || true)"
      benchmark_subject_sha256="$(workflow_benchmark_subject_sha256 2>/dev/null || true)"
    fi
    if [[ -n "$benchmark_evidence_fingerprint" && -n "$benchmark_subject_sha256" ]]; then
      benchmark_evidence_status="present"
    else
      benchmark_evidence_status="invalid"
      contract_exit=1
    fi
    ;;
  not_applicable)
    benchmark_evidence_status="not_applicable"
    ;;
  *)
    benchmark_evidence_status="invalid"
    contract_exit=1
    ;;
esac

review_status="pass"
review_message="Review artifact is available for deterministic AcceptanceReceipt projection."
if [[ -z "$review_file" || ! -f "$review_file" ]]; then
  review_status="fail"
  review_message="Missing task review file."
  echo "Missing task review file" >&2
fi

# Change Assessment v1 owns review selection at the same final-subject
# boundary as prepared verification. Hooks may have emitted advisory reports,
# but this recomputation reads only policy, contract, and final repository
# state; a missing/degraded assessment is therefore a fail-closed verification
# fact, never a Hook-journal fallback.
change_assessment_file=".ai/harness/checks/change-assessment.latest.json"
change_assessment_status="fail"
change_assessment_message="Change Assessment is unavailable."
if [[ -z "$BUN_BIN" || ! -x "$BUN_BIN" ]]; then
  change_assessment_message="Trusted Bun runtime is unavailable for Change Assessment."
elif [[ ! -f "$helper_dir/change-assessment.ts" ]]; then
  change_assessment_message="Change Assessment helper is missing: $helper_dir/change-assessment.ts"
else
  change_assessment_packet_args=()
  if [[ -s "$change_assessment_file" ]] && command -v jq >/dev/null 2>&1 \
    && jq -e '.schema == "repo-harness-change-assessment-evidence.v1" and .status == "pass" and ([.selection_packet.reasons[]? | select(.code == "reviewer_disagreement")] | length == 1)' "$change_assessment_file" >/dev/null 2>&1; then
    # Preserve only the closed reviewer-disagreement overlay. A previous base
    # packet is always recomputed; a stale overlay instead fails closed in the
    # helper's exact-subject/base validator.
    change_assessment_packet_args=(--packet "$change_assessment_file")
  fi
  set +e
  if [[ ${#change_assessment_packet_args[@]} -gt 0 ]]; then
    change_assessment_output="$(REPO_HARNESS_TARGET_REPO_ROOT="$(pwd -P)" "$BUN_BIN" "$helper_dir/change-assessment.ts" prepare --contract "$contract_file" --output "$change_assessment_file" "${change_assessment_packet_args[@]}" 2>&1)"
  else
    change_assessment_output="$(REPO_HARNESS_TARGET_REPO_ROOT="$(pwd -P)" "$BUN_BIN" "$helper_dir/change-assessment.ts" prepare --contract "$contract_file" --output "$change_assessment_file" 2>&1)"
  fi
  change_assessment_exit=$?
  set -e
  if [[ "$change_assessment_exit" -eq 0 ]] \
    && [[ -s "$change_assessment_file" ]] \
    && command -v jq >/dev/null 2>&1 \
    && jq -e '.schema == "repo-harness-change-assessment-evidence.v1" and .status == "pass" and (.selection_packet.status == "ready")' "$change_assessment_file" >/dev/null 2>&1; then
    change_assessment_status="pass"
    change_assessment_message="Change Assessment selected a final-subject review packet."
  else
    change_assessment_message="${change_assessment_output:-Change Assessment did not produce a passing packet.}"
  fi
fi
if [[ "$change_assessment_status" != "pass" ]]; then
  mkdir -p "$(dirname "$change_assessment_file")"
  change_assessment_failure_file="${change_assessment_file}.$$.tmp"
  printf '%s\n' "{\"schema\":\"repo-harness-change-assessment-evidence.v1\",\"status\":\"fail\",\"message\":\"$(json_escape "$change_assessment_message")\"}" > "$change_assessment_failure_file"
  mv "$change_assessment_failure_file" "$change_assessment_file"
fi
if [[ "$change_assessment_status" == "pass" ]] && command -v jq >/dev/null 2>&1; then
  review_subject_sha256="$(jq -r '.selection_packet.review_subject_sha256 // empty' "$change_assessment_file" 2>/dev/null || true)"
fi

acceptance_status="missing"
acceptance_reviewer=""
acceptance_source=""
acceptance_disposition=""
acceptance_message="AcceptanceReceipt is unavailable."
if [[ "$prepare_acceptance" -eq 1 ]]; then
  acceptance_status="pending"
  acceptance_message="Verification evidence is frozen and ready for semantic acceptance."
elif [[ -z "$BUN_BIN" || ! -x "$BUN_BIN" ]]; then
  acceptance_message="Trusted Bun runtime is unavailable for AcceptanceReceipt verification."
elif [[ ! -f "$helper_dir/acceptance-receipt.ts" ]]; then
  acceptance_message="AcceptanceReceipt helper is missing: $helper_dir/acceptance-receipt.ts"
elif [[ ! -s "$checks_file" ]]; then
  acceptance_message="Prepared verification evidence is missing: $checks_file"
else
  set +e
  acceptance_row="$(REPO_HARNESS_TARGET_REPO_ROOT="$(pwd -P)" "$BUN_BIN" "$helper_dir/acceptance-receipt.ts" verify --contract "$contract_file" --verification "$checks_file" --format row 2>&1)"
  acceptance_exit=$?
  set -e
  if [[ "$acceptance_exit" -eq 0 ]]; then
    IFS=$'\t' read -r acceptance_status acceptance_reviewer acceptance_source acceptance_disposition acceptance_message <<< "$acceptance_row"
    set +e
    REPO_HARNESS_TARGET_REPO_ROOT="$(pwd -P)" "$BUN_BIN" "$helper_dir/acceptance-receipt.ts" project \
      --contract "$contract_file" --verification "$checks_file" --review "$review_file" >/dev/null 2>&1
    projection_exit=$?
    set -e
    if [[ "$projection_exit" -ne 0 ]]; then
      acceptance_status="fail"
      acceptance_message="AcceptanceReceipt is valid but its review projection could not be written."
    fi
  else
    acceptance_status="fail"
    acceptance_message="$acceptance_row"
  fi
fi
status="fail"
exit_code=1
case "$acceptance_status" in
  pass|pending)
    acceptance_gate="pass"
    ;;
  *)
    acceptance_gate="fail"
    ;;
esac
if [[ "$contract_exit" -eq 0 && "$review_status" == "pass" && "$change_assessment_status" == "pass" && "$acceptance_gate" == "pass" && "$allowed_paths_status" == "pass" ]]; then
  status="pass"
  exit_code=0
fi
failure_class=""
if command -v jq >/dev/null 2>&1 && jq -e . "$contract_report" >/dev/null 2>&1; then
  failure_class="$(jq -r '.failure_class // empty' "$contract_report" 2>/dev/null || true)"
fi
if [[ -z "$failure_class" && "$status" != "pass" ]]; then
  if [[ "$contract_exit" -ne 0 ]]; then
    failure_class="contract"
  elif [[ "$review_status" != "pass" ]]; then
    failure_class="review"
  elif [[ "$change_assessment_status" != "pass" ]]; then
    failure_class="change_assessment"
  elif [[ "$acceptance_gate" != "pass" ]]; then
    failure_class="acceptance_receipt"
  elif [[ "$allowed_paths_status" != "pass" ]]; then
    failure_class="allowed_paths"
  else
    failure_class="unknown"
  fi
fi
if [[ "$status" == "pass" ]]; then
  next_step="finish contract worktree or archive completed task"
else
  next_step="resolve failing contract, Change Assessment, review, AcceptanceReceipt, or allowed_paths gate"
fi
handoff_current_exists=false
handoff_resume_exists=false
[[ -f ".ai/harness/handoff/current.md" ]] && handoff_current_exists=true
[[ -f ".ai/harness/handoff/resume.md" ]] && handoff_resume_exists=true

if command -v jq >/dev/null 2>&1 && jq -e . "$contract_report" >/dev/null 2>&1; then
  jq -n \
    --slurpfile contract_report "$contract_report" \
    --arg schema "repo-harness-run-trace.v1" \
    --arg status "$status" \
    --arg source "verify-sprint" \
    --arg command "repo-harness run verify-sprint" \
    --arg generated_at "$generated_at" \
    --arg run_id "$run_id" \
    --arg run_file "$run_file" \
    --arg task_profile "$task_profile" \
    --arg active_plan "$active_plan" \
    --arg contract_file "$contract_file" \
    --arg contract_status "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)" \
    --arg contract_command "$contract_command" \
    --argjson contract_exit "$contract_exit" \
    --arg review_file "${review_file:-}" \
    --arg review_status "$review_status" \
    --arg review_message "$review_message" \
    --arg change_assessment_status "$change_assessment_status" \
    --arg change_assessment_message "$change_assessment_message" \
    --arg acceptance_status "$acceptance_status" \
    --arg acceptance_reviewer "$acceptance_reviewer" \
    --arg acceptance_source "$acceptance_source" \
    --arg acceptance_disposition "$acceptance_disposition" \
    --arg acceptance_message "$acceptance_message" \
    --arg worktree "$worktree_path" \
    --arg branch "$branch_name" \
    --arg diff_base_ref "$diff_base_ref" \
    --arg diff_base_commit "$diff_base_commit" \
    --arg review_subject_sha256 "$review_subject_sha256" \
    --arg benchmark_evidence_status "$benchmark_evidence_status" \
    --arg benchmark_evidence_fingerprint "$benchmark_evidence_fingerprint" \
    --arg benchmark_subject_sha256 "$benchmark_subject_sha256" \
    --argjson files_changed "$(git_changed_files_json)" \
    --argjson allowed_paths_check "$allowed_paths_check" \
    --slurpfile change_assessment "$change_assessment_file" \
    --argjson allowed_paths "$(allowed_paths_json "$contract_file")" \
    --argjson handoff_current_exists "$handoff_current_exists" \
    --argjson handoff_resume_exists "$handoff_resume_exists" \
    --arg failure_class "$failure_class" \
    --arg next_step "$next_step" \
    --argjson exit_code "$exit_code" \
    '{
      schema: $schema,
      status: $status,
      source: $source,
      command: $command,
      exit_code: $exit_code,
      generated_at: $generated_at,
      run_id: $run_id,
      run_file: $run_file,
      task_profile: $task_profile,
      active_plan: $active_plan,
      worktree: $worktree,
      branch: $branch,
      diff_base: {
        ref: $diff_base_ref,
        merge_base: $diff_base_commit
      },
      review_subject_sha256: $review_subject_sha256,
      benchmark_evidence: {
        status: $benchmark_evidence_status,
        report_sha256: $benchmark_evidence_fingerprint,
        benchmark_subject_sha256: $benchmark_subject_sha256
      },
      commands: [
        {name: "verify-sprint", command: $command, status: $status, exit_code: $exit_code},
        {name: "verify-contract", command: $contract_command, status: $contract_status, exit_code: $contract_exit}
      ],
      guards: [
        {name: "contract", status: $contract_status},
        {name: "review", status: $review_status},
        {name: "change_assessment", status: $change_assessment_status},
        {name: "acceptance_receipt", status: $acceptance_status},
        {name: "allowed_paths", status: ($allowed_paths_check.status // "unavailable")}
      ],
      handoffs: [
        {file: ".ai/harness/handoff/current.md", exists: $handoff_current_exists},
        {file: ".ai/harness/handoff/resume.md", exists: $handoff_resume_exists}
      ],
      files_changed: $files_changed,
      allowed_paths_check: $allowed_paths_check,
      failure_class: $failure_class,
      next_step: $next_step,
      lifecycle: {
        latest: ".ai/harness/checks/latest.json",
        snapshot: $run_file,
        evidence_tier: "harness-trace-v1"
      },
      contract: {
        file: $contract_file,
        status: $contract_status,
        command: $contract_command,
        exit_code: $contract_exit,
        report: ($contract_report[0] // {}),
        task_profile: $task_profile,
        allowed_paths: $allowed_paths
      },
      review: {
        file: $review_file,
        status: $review_status,
        message: $review_message
      },
      change_assessment: ($change_assessment[0] // {
        schema: "repo-harness-change-assessment-evidence.v1",
        status: "fail",
        message: $change_assessment_message
      }),
      acceptance_receipt: {
        status: $acceptance_status,
        disposition: $acceptance_disposition,
        reviewer: $acceptance_reviewer,
        source: $acceptance_source,
        message: $acceptance_message
      }
    }' > "$checks_report"
else
  cat > "$checks_report" <<EOF_CHECKS
{
  "schema": "repo-harness-run-trace.v1",
  "status": "$(json_escape "$status")",
  "source": "verify-sprint",
  "command": "repo-harness run verify-sprint",
  "exit_code": $exit_code,
  "generated_at": "$(json_escape "$generated_at")",
  "run_id": "$(json_escape "$run_id")",
  "run_file": "$(json_escape "$run_file")",
  "task_profile": "$(json_escape "$task_profile")",
  "active_plan": "$(json_escape "$active_plan")",
  "worktree": "$(json_escape "$worktree_path")",
  "branch": "$(json_escape "$branch_name")",
  "diff_base": {
    "ref": "$(json_escape "$diff_base_ref")",
    "merge_base": "$(json_escape "$diff_base_commit")"
  },
  "review_subject_sha256": "$(json_escape "$review_subject_sha256")",
  "benchmark_evidence": {
    "status": "$(json_escape "$benchmark_evidence_status")",
    "report_sha256": "$(json_escape "$benchmark_evidence_fingerprint")",
    "benchmark_subject_sha256": "$(json_escape "$benchmark_subject_sha256")"
  },
  "commands": [
    {
      "name": "verify-sprint",
      "command": "repo-harness run verify-sprint",
      "status": "$(json_escape "$status")",
      "exit_code": $exit_code
    },
    {
      "name": "verify-contract",
      "command": "$(json_escape "$contract_command")",
      "status": "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)",
      "exit_code": $contract_exit
    }
  ],
  "guards": [
    {"name": "contract", "status": "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)"},
    {"name": "review", "status": "$(json_escape "$review_status")"},
    {"name": "change_assessment", "status": "$(json_escape "$change_assessment_status")"},
    {"name": "acceptance_receipt", "status": "$(json_escape "$acceptance_status")"},
    {"name": "allowed_paths", "status": "$(json_escape "$allowed_paths_status")"}
  ],
  "handoffs": [
    {"file": ".ai/harness/handoff/current.md", "exists": $handoff_current_exists},
    {"file": ".ai/harness/handoff/resume.md", "exists": $handoff_resume_exists}
  ],
  "files_changed": [],
  "allowed_paths_check": {
    "status": "unavailable",
    "message": "jq unavailable"
  },
  "failure_class": "$(json_escape "$failure_class")",
  "next_step": "$(json_escape "$next_step")",
  "lifecycle": {
    "latest": ".ai/harness/checks/latest.json",
    "snapshot": "$(json_escape "$run_file")",
    "evidence_tier": "harness-trace-v1"
  },
  "contract": {
    "file": "$(json_escape "$contract_file")",
    "status": "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)",
    "command": "$(json_escape "$contract_command")",
    "exit_code": $contract_exit,
    "task_profile": "$(json_escape "$task_profile")",
    "allowed_paths": []
  },
  "review": {
    "file": "$(json_escape "${review_file:-}")",
    "status": "$(json_escape "$review_status")",
    "message": "$(json_escape "$review_message")"
  },
  "change_assessment": {
    "schema": "repo-harness-change-assessment-evidence.v1",
    "status": "fail",
    "message": "$(json_escape "$change_assessment_message")"
  },
  "acceptance_receipt": {
    "status": "$(json_escape "$acceptance_status")",
    "disposition": "$(json_escape "$acceptance_disposition")",
    "reviewer": "$(json_escape "$acceptance_reviewer")",
    "source": "$(json_escape "$acceptance_source")",
    "message": "$(json_escape "$acceptance_message")"
  }
}
EOF_CHECKS
fi

cp "$checks_report" "$run_file"

print_maintenance_advisories "$notes_file" || true

if [[ "$exit_code" -eq 0 ]]; then
  echo "Sprint verification passed"
  echo "Run snapshot: $run_file"
else
  echo "Sprint verification failed" >&2
  echo "Run snapshot: $run_file" >&2
fi

# EPC-05: checks/latest.json is materialized FROM the ledger by
# emit-verify-evidence.ts's --checks-file handling (see that script's single
# call into the checks-materializer). Emission (and, on success, this
# materialization) is attempted for both a passing AND a failing verify
# result -- a failing verify-sprint run is still a real, subject-bound,
# authoritative_machine fact ("verification did not pass"), and consumers
# read the payload's own status field, not the event's trust class, to tell
# pass from fail (workflow_checks_pass already works this way). Cannot-bind
# (exit 3) means checks/latest.json is simply not (re)written this run --
# never a fabricated or stale-content fallback.
verify_status="$([[ "$exit_code" -eq 0 ]] && printf pass || printf fail)"
set +e
emit_verify_evidence "repo-harness run verify-sprint --prepare-acceptance" "$checks_report" "$verify_status"
emit_exit=$?
set -e
case "$emit_exit" in
  0) : ;;
  3) : ;;
  *)
    echo "verify-sprint: evidence emission failed" >&2
    if [[ "$exit_code" -eq 0 ]]; then
      exit 1
    fi
    ;;
esac

exit "$exit_code"
