#!/bin/bash
set -euo pipefail

WORKFLOW_STATE_LIB="${REPO_HARNESS_WORKFLOW_STATE_LIB:-.ai/hooks/lib/workflow-state.sh}"
if [[ -n "${REPO_HARNESS_BUN_BIN:-}" ]] && [[ "$WORKFLOW_STATE_LIB" != /* || ! -f "$WORKFLOW_STATE_LIB" || -L "$WORKFLOW_STATE_LIB" ]]; then
  echo "archive-workflow: trusted workflow-state library is unavailable" >&2
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

archive_transaction_dir=""
archive_transaction_active=0
archive_transaction_paths=()
archive_transaction_existed=()

archive_transaction_snapshot() {
  local path="$1"
  local index="${#archive_transaction_paths[@]}"
  archive_transaction_paths+=("$path")
  if [[ -e "$path" || -L "$path" ]]; then
    archive_transaction_existed+=("1")
    mkdir -p "$archive_transaction_dir/$index"
    cp -Rp "$path" "$archive_transaction_dir/$index/value"
  else
    archive_transaction_existed+=("0")
  fi
}

archive_transaction_rollback() {
  local index path
  for ((index = ${#archive_transaction_paths[@]} - 1; index >= 0; index--)); do
    path="${archive_transaction_paths[$index]}"
    rm -rf "$path"
    if [[ "${archive_transaction_existed[$index]}" == "1" ]]; then
      mkdir -p "$(dirname "$path")"
      cp -Rp "$archive_transaction_dir/$index/value" "$path"
    fi
  done
}

archive_transaction_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$archive_transaction_active" -eq 1 && "$status" -ne 0 ]]; then
    if ! archive_transaction_rollback; then
      echo "archive-workflow: rollback failed; inspect $archive_transaction_dir before retrying" >&2
      status=1
    else
      echo "archive-workflow: archive failed; restored live workflow artifacts" >&2
    fi
  fi
  [[ -z "$archive_transaction_dir" ]] || rm -rf "$archive_transaction_dir"
  exit "$status"
}

archive_transaction_begin() {
  archive_transaction_dir="$(mktemp -d)"
  archive_transaction_active=1
  trap archive_transaction_on_exit EXIT
  archive_transaction_snapshot "plans"
  archive_transaction_snapshot "tasks"
  archive_transaction_snapshot ".ai/harness/active-plan"
  archive_transaction_snapshot ".ai/harness/active-worktree"
  archive_transaction_snapshot ".claude/.plan-state"
}

archive_transaction_commit() {
  archive_transaction_active=0
  trap - EXIT
  rm -rf "$archive_transaction_dir"
  archive_transaction_dir=""
}

verify_prediction_scratch_binding() {
  local source_root="$1"
  local scratch_root="$2"
  local checks_file="$3"
  local canonical_source canonical_scratch origin_url canonical_origin source_head scratch_head
  local review_base source_target scratch_target path source_path scratch_path

  [[ "$source_root" == /* && -d "$source_root" ]] || {
    echo "archive-workflow: prediction acceptance source must be an existing absolute directory" >&2
    return 1
  }
  [[ "$scratch_root" == /* && -d "$scratch_root" && -d "$scratch_root/.git" && ! -L "$scratch_root/.git" ]] || {
    echo "archive-workflow: prediction scratch must be an existing standalone clone" >&2
    return 1
  }
  canonical_source="$(cd "$source_root" && pwd -P)"
  canonical_scratch="$(cd "$scratch_root" && pwd -P)"
  [[ "$(git -C "$canonical_source" rev-parse --show-toplevel 2>/dev/null)" == "$canonical_source" ]] || {
    echo "archive-workflow: prediction acceptance source must be a canonical git root" >&2
    return 1
  }
  origin_url="$(git -C "$canonical_scratch" remote get-url origin 2>/dev/null || true)"
  [[ "$origin_url" == /* && -d "$origin_url" ]] || {
    echo "archive-workflow: prediction scratch origin must be an existing absolute local path" >&2
    return 1
  }
  canonical_origin="$(cd "$origin_url" && pwd -P)"
  [[ "$canonical_origin" == "$canonical_source" ]] || {
    echo "archive-workflow: prediction acceptance source does not match scratch origin" >&2
    return 1
  }
  [[ "$canonical_source" != "$canonical_scratch" ]] || {
    echo "archive-workflow: prediction acceptance source must be distinct from scratch" >&2
    return 1
  }
  source_head="$(git -C "$canonical_source" rev-parse HEAD 2>/dev/null || true)"
  scratch_head="$(git -C "$canonical_scratch" rev-parse HEAD 2>/dev/null || true)"
  [[ -n "$source_head" && "$source_head" == "$scratch_head" ]] || {
    echo "archive-workflow: prediction acceptance source and scratch must share the exact candidate HEAD" >&2
    return 1
  }
  [[ -z "$(git -C "$canonical_source" status --porcelain=v1 --untracked-files=all)" ]] || {
    echo "archive-workflow: prediction acceptance source must be clean" >&2
    return 1
  }
  [[ -z "$(git -C "$canonical_scratch" status --porcelain=v1 --untracked-files=all)" ]] || {
    echo "archive-workflow: prediction scratch must be clean" >&2
    return 1
  }
  review_base="$(
    REPO_HARNESS_POLICY_FILE="$canonical_source/.ai/harness/policy.json" "$BUN_BIN" -e '
      const file = process.env.REPO_HARNESS_POLICY_FILE;
      if (!file) process.exit(2);
      const policy = JSON.parse(await Bun.file(file).text());
      const value = policy?.worktree_strategy?.review_base;
      if (typeof value !== "string" || value.trim() === "") process.exit(2);
      process.stdout.write(value);
    '
  )" || {
    echo "archive-workflow: prediction acceptance source review base is unavailable" >&2
    return 1
  }
  source_target="$(git -C "$canonical_source" rev-parse "$review_base^{commit}" 2>/dev/null || true)"
  scratch_target="$(git -C "$canonical_scratch" rev-parse "$review_base^{commit}" 2>/dev/null || true)"
  [[ -n "$source_target" && "$source_target" == "$scratch_target" ]] || {
    echo "archive-workflow: prediction acceptance source and scratch must share the exact review target" >&2
    return 1
  }
  [[ "$checks_file" != /* && "$checks_file" != ../* && "$checks_file" != */../* ]] || {
    echo "archive-workflow: prediction checks path must stay repository-relative" >&2
    return 1
  }
  for path in "$checks_file" .ai/harness/active-plan .ai/harness/active-worktree; do
    source_path="$canonical_source/$path"
    scratch_path="$canonical_scratch/$path"
    if [[ -e "$source_path" || -L "$source_path" || -e "$scratch_path" || -L "$scratch_path" ]]; then
      [[ -f "$source_path" && ! -L "$source_path" && -f "$scratch_path" && ! -L "$scratch_path" ]] || {
        echo "archive-workflow: prediction runtime input shape differs from source: $path" >&2
        return 1
      }
      cmp -s "$source_path" "$scratch_path" || {
        echo "archive-workflow: prediction runtime input bytes differ from source: $path" >&2
        return 1
      }
    fi
  done
}

promote_contract_to_fulfilled() {
  local contract_file="$1"
  local contract_status status_tmp

  contract_status="$(awk '/^> \*\*Status\*\*:/ {sub(/^.*> \*\*Status\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$contract_file" | xargs)"
  if [[ "$contract_status" == "Fulfilled" ]]; then
    return 0
  fi
  [[ "$contract_status" == "Active" ]] || {
    echo "archive-workflow: cannot promote contract with status ${contract_status:-missing}: $contract_file" >&2
    return 1
  }
  status_tmp="$(mktemp)"
  awk '
    BEGIN { updated = 0 }
    {
      if (!updated && $0 ~ /^> \*\*Status\*\*:/) {
        print "> **Status**: Fulfilled"
        updated = 1
        next
      }
      print
    }
  ' "$contract_file" > "$status_tmp"
  cat "$status_tmp" > "$contract_file"
  rm -f "$status_tmp"
}

completed_archive_gate() {
  local contract_file="$1"
  local review_file="$2"
  local update_contract_status="${3:-1}"
  local workflow_state_file="$WORKFLOW_STATE_LIB"
  local contract_status checks_file checks_message

  [[ -f "$contract_file" ]] || {
    echo "archive-workflow: Completed requires an active contract: $contract_file" >&2
    return 1
  }
  [[ -f "$review_file" ]] || {
    echo "archive-workflow: Completed requires an active review: $review_file" >&2
    return 1
  }
  [[ -f "$workflow_state_file" ]] || {
    echo "archive-workflow: Completed requires workflow gate authority: $workflow_state_file" >&2
    return 1
  }

  # shellcheck source=/dev/null
  . "$workflow_state_file"
  for gate_function in workflow_checks_file workflow_checks_pass; do
    if ! declare -F "$gate_function" >/dev/null 2>&1; then
      echo "archive-workflow: workflow gate authority is missing $gate_function" >&2
      return 1
    fi
  done

  contract_status="$(awk '/^> \*\*Status\*\*:/ {sub(/^.*> \*\*Status\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$contract_file" | xargs)"
  if [[ "$contract_status" != "Active" && "$contract_status" != "Fulfilled" ]]; then
    echo "archive-workflow: Completed requires a verified Active or Fulfilled contract, got ${contract_status:-missing}: $contract_file" >&2
    return 1
  fi

  checks_file="$(workflow_checks_file)"
  if ! checks_message="$(workflow_checks_pass "$checks_file" "$contract_file" "$review_file")"; then
    echo "archive-workflow: Completed requires current passing verify-sprint evidence: ${checks_message:-$checks_file}" >&2
    return 1
  fi

  if [[ -z "$BUN_BIN" || ! -x "$BUN_BIN" || ! -f "$helper_dir/acceptance-receipt.ts" ]]; then
    echo "archive-workflow: Completed requires the AcceptanceReceipt helper and trusted Bun runtime" >&2
    return 1
  fi
  if ! REPO_HARNESS_TARGET_REPO_ROOT="$PWD" "$BUN_BIN" "$helper_dir/acceptance-receipt.ts" verify \
    --contract "$contract_file" --verification "$checks_file" >/dev/null; then
    echo "archive-workflow: Completed AcceptanceReceipt gate failed" >&2
    return 1
  fi

  if [[ ! -f "$helper_dir/check-architecture-sync.sh" ]]; then
    echo "archive-workflow: Completed requires architecture freshness helper: $helper_dir/check-architecture-sync.sh" >&2
    return 1
  fi
  REPO_HARNESS_TARGET_REPO_ROOT="$PWD" bash "$helper_dir/check-architecture-sync.sh"

  if [[ "$update_contract_status" -eq 1 ]]; then
    promote_contract_to_fulfilled "$contract_file"
  fi
}

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/archive-workflow.sh --plan <plan-file> --outcome <Completed|Abandoned|Superseded> [--timestamp <YYYYMMDD-HHMM>] [--timestamp-human <YYYY-MM-DD HH:MM>] [--parent-run-id <id>] [--predict-manifest <absolute-output>]

  --timestamp  Use this exact value as the archive-family filename timestamp
               instead of calling `date` here. Callers that predict archive
               destinations ahead of time (contract-worktree.sh finish) pass
               their own already-computed timestamp so predictions and actual
               output cannot disagree across a minute boundary. Standalone
               invocations omit this and get a fresh single `date` call, as
               before.
USAGE_EOF
}

sha256_file() {
  local file="$1"
  [[ "${REPO_HARNESS_BUN_BIN:-}" == /* && -x "${REPO_HARNESS_BUN_BIN:-}" ]] || {
    echo "archive-workflow: manifest prediction requires the trusted Bun runtime" >&2
    return 1
  }
  REPO_HARNESS_SHA256_FILE="$file" "$REPO_HARNESS_BUN_BIN" -e '
    import { createHash } from "crypto";
    const file = process.env.REPO_HARNESS_SHA256_FILE;
    if (!file) process.exit(2);
    const bytes = await Bun.file(file).arrayBuffer();
    process.stdout.write(`sha256:${createHash("sha256").update(new Uint8Array(bytes)).digest("hex")}`);
  '
}

predict_archive_manifest() {
  local output="$1" fixed_timestamp="$2" fixed_timestamp_human="$3" fixed_parent_run_id="$4"
  local scratch scratch_repo manifest_tmp path digest target_branch source_repo checks_file
  [[ "$output" == /* ]] || { echo "archive-workflow: --predict-manifest output must be absolute" >&2; return 1; }
  [[ "${REPO_HARNESS_BUN_BIN:-}" == /* && -x "${REPO_HARNESS_BUN_BIN:-}" ]] || { echo "archive-workflow: --predict-manifest requires the trusted Bun runtime" >&2; return 1; }
  [[ ! -L "$output" ]] || { echo "archive-workflow: --predict-manifest output must not be a symlink" >&2; return 1; }
  [[ -d "$(dirname "$output")" ]] || { echo "archive-workflow: manifest output parent is missing" >&2; return 1; }
  source_repo="$(pwd -P)"
  [[ -z "$(git status --porcelain=v1 --untracked-files=all)" ]] || {
    echo "archive-workflow: manifest prediction requires a clean source worktree" >&2
    return 1
  }
  if [[ "$outcome" == "Completed" ]]; then
    resolve_archive_artifacts
    completed_archive_gate "$contract_file" "$review_file" 0
    checks_file="$(workflow_checks_file)"
  fi
  scratch="$(mktemp -d)"
  scratch_repo="$scratch/repo"
  manifest_tmp="$scratch/manifest"
  if ! git clone --quiet --no-hardlinks "$PWD" "$scratch_repo"; then
    rm -rf "$scratch"
    return 1
  fi
  # The scratch clone intentionally contains only tracked candidate bytes.
  # Reuse the caller's installed dependency tree for read-only workflow checks;
  # node_modules remains ignored and is never part of the predicted manifest.
  if [[ -d "$PWD/node_modules" ]]; then
    ln -s "$PWD/node_modules" "$scratch_repo/node_modules"
  fi
  target_branch="$("$REPO_HARNESS_BUN_BIN" -e '
    try {
      const policy = JSON.parse(await Bun.file(".ai/harness/policy.json").text());
      process.stdout.write(policy?.worktree_strategy?.merge_back?.target || "main");
    } catch { process.stdout.write("main"); }
  ' 2>/dev/null)"
  if ! git -C "$scratch_repo" show-ref --verify --quiet "refs/heads/$target_branch"; then
    git -C "$scratch_repo" show-ref --verify --quiet "refs/remotes/origin/$target_branch" || {
      echo "archive-workflow: prediction target branch is unavailable: $target_branch" >&2
      rm -rf "$scratch"
      return 1
    }
    git -C "$scratch_repo" update-ref "refs/heads/$target_branch" "refs/remotes/origin/$target_branch"
  fi
  if [[ -d .ai/harness/checks ]]; then
    mkdir -p "$scratch_repo/.ai/harness/checks"
    cp -Rp .ai/harness/checks/. "$scratch_repo/.ai/harness/checks/"
  fi
  for path in .ai/harness/active-plan .ai/harness/active-worktree; do
    if [[ -f "$path" ]]; then
      mkdir -p "$scratch_repo/$(dirname "$path")"
      cp -p "$path" "$scratch_repo/$path"
    fi
  done
  if [[ "$outcome" == "Completed" ]]; then
    verify_prediction_scratch_binding "$source_repo" "$scratch_repo" "$checks_file"
  fi
  if ! (
    cd "$scratch_repo"
    export REPO_HARNESS_TARGET_REPO_ROOT="$scratch_repo"
    apply_archive_workflow preverified >/dev/null
  ); then
    rm -rf "$scratch"
    return 1
  fi
  git -C "$scratch_repo" add -A
  : > "$manifest_tmp"
  while IFS= read -r path; do
    case "$path" in
      plans/archive/*.md|tasks/archive/contract-*.md|tasks/archive/review-*.md|tasks/archive/notes-*.md)
        [[ -f "$scratch_repo/$path" && ! -L "$scratch_repo/$path" ]] || { rm -rf "$scratch"; return 1; }
        digest="$(sha256_file "$scratch_repo/$path")"
        printf '%s\t%s\n' "$path" "$digest" >> "$manifest_tmp"
        ;;
    esac
  done < <(git -C "$scratch_repo" diff --cached --name-only --diff-filter=ACMR)
  [[ -s "$manifest_tmp" ]] || { echo "archive-workflow: predicted semantic destination manifest is empty" >&2; rm -rf "$scratch"; return 1; }
  /usr/bin/sort -u "$manifest_tmp" > "$output"
  rm -rf "$scratch"
}

set_plan_status() {
  local file="$1"
  local status="$2"
  local tmp_file
  tmp_file="$(mktemp)"
  awk -v next_status="$status" '
    BEGIN { updated = 0 }
    {
      if (!updated && $0 ~ /\*\*Status\*\*:/) {
        sub(/\*\*Status\*\*: .*/, "**Status**: " next_status)
        updated = 1
      }
      print
    }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

unique_archive_path() {
  local desired="$1"
  if [[ ! -e "$desired" ]]; then
    printf '%s' "$desired"
    return
  fi

  local stem ext counter candidate
  stem="${desired%.md}"
  ext=".md"
  counter=2
  candidate="${stem}-v${counter}${ext}"
  while [[ -e "$candidate" ]]; do
    counter=$((counter + 1))
    candidate="${stem}-v${counter}${ext}"
  done
  printf '%s' "$candidate"
}

normalize_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

is_transient_plan_slug() {
  case "$1" in
    think-plan-[0-9]*|codex-plan-[0-9]*|approved-plan-[0-9]*)
      return 0
      ;;
  esac
  return 1
}

plan_title_slug_from_file() {
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

plan_artifact_stem_from_parts() {
  local plan_file="$1"
  local original_stem="$2"
  local slug="$3"
  local stamp title_slug

  if [[ "$original_stem" =~ ^[0-9]{8}-[0-9]{4}-.+ ]]; then
    stamp="$(printf '%s' "$original_stem" | sed -E 's/^([0-9]{8}-[0-9]{4})-.+$/\1/')"
    if is_transient_plan_slug "$slug"; then
      title_slug="$(plan_title_slug_from_file "$plan_file" || true)"
      if [[ -n "$title_slug" && "$title_slug" != "$slug" ]]; then
        printf '%s-%s' "$stamp" "$title_slug"
        return 0
      fi
    fi
    printf '%s' "$original_stem"
  else
    printf '%s' "$slug"
  fi
}

todo_is_deferred_ledger() {
  local file="${1:-tasks/todos.md}"
  [[ -f "$file" ]] || return 1
  grep -Eq '^# Deferred Goal Ledger[[:space:]]*$' "$file" \
    && grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$file" \
    && grep -Eq '^## Deferred Goals[[:space:]]*$' "$file" \
    && grep -Eq '\|[[:space:]]*Goal[[:space:]]*\|[[:space:]]*Why Deferred[[:space:]]*\|[[:space:]]*Tradeoff[[:space:]]*\|[[:space:]]*Revisit Trigger[[:space:]]*\|' "$file"
}

touch_deferred_ledger_update_marker() {
  local file="${1:-tasks/todos.md}"
  local tmp_file
  tmp_file="$(mktemp)"
  awk '
    BEGIN { updated = 0 }
    !updated && /^> \*\*Updated\*\*:/ {
      print "> **Updated**: (archive-workflow)"
      updated = 1
      next
    }
    { print }
  ' "$file" > "$tmp_file"
  mv "$tmp_file" "$file"
}

write_empty_deferred_ledger() {
  cat > tasks/todos.md <<'TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (archive-workflow)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| (none) | Archived workflow did not leave a deferred medium/long-term goal. | Keep the next slice clean. | Add a row when a real follow-up is postponed. |
TODO_EOF
}

resolve_archive_artifacts() {
  contract_file="tasks/contracts/${artifact_stem}.contract.md"
  if [[ ! -f "$contract_file" && -f "tasks/contracts/${slug}.contract.md" ]]; then
    contract_file="tasks/contracts/${slug}.contract.md"
  fi
  review_file="tasks/reviews/${artifact_stem}.review.md"
  if [[ ! -f "$review_file" && -f "tasks/reviews/${slug}.review.md" ]]; then
    review_file="tasks/reviews/${slug}.review.md"
  fi
}

apply_archive_workflow() {
  local completed_gate_mode="$1"
  local plan_status archive_plan_path archive_todo notes_file archive_notes
  local archive_contract archive_review cleared_active marker_file marker_value plan_key

  resolve_archive_artifacts
  if [[ "$outcome" == "Completed" && "$completed_gate_mode" == "required" ]]; then
    completed_archive_gate "$contract_file" "$review_file"
  elif [[ "$outcome" == "Completed" && "$completed_gate_mode" == "preverified" ]]; then
    promote_contract_to_fulfilled "$contract_file"
  fi

  if [[ ! -f "$helper_dir/refresh-current-status.sh" ]]; then
    echo "archive-workflow: required current-status refresh helper is missing: $helper_dir/refresh-current-status.sh" >&2
    return 1
  fi

  archive_transaction_begin
  mkdir -p plans/archive tasks/archive tasks/notes

  plan_status="Archived"
  if [[ "$outcome" == "Abandoned" ]]; then
    plan_status="Abandoned"
  fi
  set_plan_status "$plan_file" "$plan_status"

  archive_plan_path="plans/archive/${plan_base}"
  archive_plan_path="$(unique_archive_path "$archive_plan_path")"

  if [[ "$plan_file" != "$archive_plan_path" ]]; then
    mv "$plan_file" "$archive_plan_path"
  fi

  if [[ -f tasks/todos.md ]] && grep -q '[^[:space:]]' tasks/todos.md; then
    archive_todo="$(unique_archive_path "tasks/archive/todo-${timestamp}-${slug}.md")"
    {
      echo "> **Archived**: ${timestamp_human}"
      echo "> **Related Plan**: ${archive_plan_path}"
      echo "> **Outcome**: ${outcome}"
      echo "> **Source Plan**: ${todo_source_plan:-"(none)"}"
      echo "> **Parent Run ID**: ${parent_run_id}"
      echo
      cat tasks/todos.md
    } > "$archive_todo"
  fi

  notes_file="tasks/notes/${artifact_stem}.notes.md"
  if [[ ! -f "$notes_file" && -f "tasks/notes/${slug}.notes.md" ]]; then
    notes_file="tasks/notes/${slug}.notes.md"
  fi
  if [[ -f "$notes_file" ]]; then
    archive_notes="$(unique_archive_path "tasks/archive/notes-${timestamp}-${slug}.md")"
    {
      echo "> **Archived**: ${timestamp_human}"
      echo "> **Related Plan**: ${archive_plan_path}"
      echo "> **Outcome**: ${outcome}"
      echo "> **Lifecycle**: notes"
      echo "> **Parent Run ID**: ${parent_run_id}"
      echo
      cat "$notes_file"
    } > "$archive_notes"
    rm -f "$notes_file"
  fi

  if [[ -f "$contract_file" ]]; then
    archive_contract="$(unique_archive_path "tasks/archive/contract-${timestamp}-${slug}.md")"
    {
      echo "> **Archived**: ${timestamp_human}"
      echo "> **Related Plan**: ${archive_plan_path}"
      echo "> **Outcome**: ${outcome}"
      echo "> **Lifecycle**: contract"
      echo "> **Parent Run ID**: ${parent_run_id}"
      echo
      cat "$contract_file"
    } > "$archive_contract"
    rm -f "$contract_file"
  fi

  if [[ -f "$review_file" ]]; then
    archive_review="$(unique_archive_path "tasks/archive/review-${timestamp}-${slug}.md")"
    {
      echo "> **Archived**: ${timestamp_human}"
      echo "> **Related Plan**: ${archive_plan_path}"
      echo "> **Outcome**: ${outcome}"
      echo "> **Lifecycle**: review"
      echo "> **Parent Run ID**: ${parent_run_id}"
      echo
      cat "$review_file"
    } > "$archive_review"
    rm -f "$review_file"
  fi

  if todo_is_deferred_ledger tasks/todos.md; then
    touch_deferred_ledger_update_marker tasks/todos.md
  else
    write_empty_deferred_ledger
  fi

  cleared_active=0
  for marker_file in ".ai/harness/active-plan"; do
    if [[ ! -f "$marker_file" ]]; then
      continue
    fi
    marker_value="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ "$marker_value" == "$plan_file" || "$marker_value" == "./$plan_file" ]]; then
      rm -f "$marker_file"
      cleared_active=1
      echo "Cleared $marker_file (archived plan was active)"
    fi
  done
  if [[ "$cleared_active" -eq 1 ]]; then
    rm -f ".ai/harness/active-worktree"
  fi

  plan_key="$(basename "$plan_file" .md)"
  rm -f ".claude/.plan-state/${plan_key}.todo.md.bak"
  rm -f ".claude/.plan-state/${plan_key}.task-state.json.bak"
  rm -f ".claude/.plan-state/${plan_key}.task-handoff.md.bak"

  bash "$helper_dir/refresh-current-status.sh" --clear --write --reason "archive-workflow"

  archive_transaction_commit

  echo "Archived plan to: $archive_plan_path"
  if [[ -f "docs/reference-configs/handoff-protocol.md" ]]; then
    echo "Next: refresh or prune long-running workflow rules using docs/reference-configs/handoff-protocol.md"
  fi
}

plan_file=""
outcome=""
timestamp_override=""
timestamp_human_override=""
parent_run_id_override=""
predict_manifest_output=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      [[ -n "${2:-}" ]] || { echo "Error: --plan requires a value" >&2; usage; exit 1; }
      plan_file="$2"
      shift 2
      ;;
    --outcome)
      [[ -n "${2:-}" ]] || { echo "Error: --outcome requires a value" >&2; usage; exit 1; }
      outcome="$2"
      shift 2
      ;;
    --timestamp)
      [[ -n "${2:-}" ]] || { echo "Error: --timestamp requires a value" >&2; usage; exit 1; }
      [[ "$2" =~ ^[0-9]{8}-[0-9]{4}$ ]] || { echo "Error: --timestamp must match YYYYMMDD-HHMM, got: $2" >&2; usage; exit 1; }
      timestamp_override="$2"
      shift 2
      ;;
    --timestamp-human)
      [[ "${2:-}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}$ ]] || { echo "Error: --timestamp-human must match YYYY-MM-DD HH:MM" >&2; usage; exit 1; }
      timestamp_human_override="$2"
      shift 2
      ;;
    --parent-run-id)
      [[ -n "${2:-}" && ! "$2" =~ [[:space:]] ]] || { echo "Error: --parent-run-id must be a non-empty token" >&2; usage; exit 1; }
      parent_run_id_override="$2"
      shift 2
      ;;
    --predict-manifest)
      [[ -n "${2:-}" ]] || { echo "Error: --predict-manifest requires a value" >&2; usage; exit 1; }
      predict_manifest_output="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$plan_file" || -z "$outcome" ]]; then
  echo "--plan and --outcome are required" >&2
  usage
  exit 1
fi

case "$outcome" in
  Completed|Abandoned|Superseded)
    ;;
  *)
    echo "Invalid outcome: $outcome" >&2
    exit 1
    ;;
esac

if [[ ! -f "$plan_file" ]]; then
  echo "Plan file not found: $plan_file" >&2
  exit 1
fi

normalized_plan="${plan_file#./}"
if [[ "$normalized_plan" == plans/archive/* ]]; then
  echo "Error: plan is already archived" >&2
  exit 1
fi

if [[ -n "$timestamp_override" ]]; then
  timestamp="$timestamp_override"
else
  timestamp="$(date +%Y%m%d-%H%M)"
fi
timestamp_human="${timestamp_human_override:-$(date '+%Y-%m-%d %H:%M')}"
plan_base="$(basename "$plan_file")"
slug="$(echo "$plan_base" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//')"
original_artifact_stem="$(printf '%s' "$plan_base" | sed -E 's/^plan-//; s/\.md$//')"
artifact_stem="$(plan_artifact_stem_from_parts "$plan_file" "$original_artifact_stem" "$slug")"
parent_run_id="${parent_run_id_override:-${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${timestamp}}}}}"
todo_source_plan="$(awk -F': ' '/^> \*\*Source Plan\*\*:/ {print $2; exit}' tasks/todos.md 2>/dev/null | xargs)"

if [[ -n "$predict_manifest_output" ]]; then
  predict_archive_manifest "$predict_manifest_output" "$timestamp" "$timestamp_human" "$parent_run_id"
  exit 0
fi

apply_archive_workflow required
exit $?
