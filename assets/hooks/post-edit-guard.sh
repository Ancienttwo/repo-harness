#!/bin/bash
# Post-Edit Guard — PostToolUse on Edit|Write
# Combines doc-drift reminders, continuous contract verification, and task handoff generation.

set -euo pipefail
export LC_ALL=C

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

run_continuous_contract_verification() {
  local active_plan contract_file checks_file

  [[ -f "scripts/verify-contract.sh" ]] || return 0

  active_plan="$(get_active_plan || true)"
  [[ -n "$active_plan" && -f "$active_plan" ]] || return 0

  contract_file="$(derive_contract_path "$active_plan" || true)"
  [[ -n "$contract_file" && -f "$contract_file" ]] || return 0
  checks_file="$(workflow_checks_file)"
  mkdir -p "$(dirname "$checks_file")"

  if contract_references_path "$contract_file" "$FILE_PATH"; then
    bash "scripts/verify-contract.sh" --contract "$contract_file" --quiet --report-file "$checks_file" || true
  fi
}

run_architecture_queue_sync() {
  local queue_output status

  [[ -x "scripts/architecture-queue.sh" ]] || return 0

  if queue_output="$(bash "scripts/architecture-queue.sh" record --file "$FILE_PATH" 2>&1)"; then
    :
  else
    status=$?
    [[ -n "$queue_output" ]] && printf '%s\n' "$queue_output"
    echo "[SyncChain] WARN: architecture-queue failed for $FILE_PATH (exit $status)"
    return 0
  fi
  [[ -n "$queue_output" ]] && printf '%s\n' "$queue_output"

  if printf '%s\n' "$queue_output" | grep -q '^\[ArchitectureDrift\] Request:'; then
    if [[ -x "scripts/context-contract-sync.sh" ]]; then
      if bash "scripts/context-contract-sync.sh" sync-latest; then
        :
      else
        status=$?
        echo "[SyncChain] WARN: context-contract-sync failed after $FILE_PATH (exit $status)"
      fi
    fi
    if [[ -n "${REPO_HARNESS_CLI:-}" && -f "$REPO_HARNESS_CLI" ]] && command -v bun >/dev/null 2>&1; then
      if bun "$REPO_HARNESS_CLI" capability-context request --from-latest-architecture-event; then
        :
      else
        status=$?
        echo "[SyncChain] WARN: capability-context request failed after $FILE_PATH (exit $status)"
      fi
    elif command -v repo-harness >/dev/null 2>&1; then
      if repo-harness capability-context request --from-latest-architecture-event; then
        :
      else
        status=$?
        echo "[SyncChain] WARN: capability-context request failed after $FILE_PATH (exit $status)"
      fi
    elif command -v bun >/dev/null 2>&1 && [[ -f "src/cli/index.ts" ]]; then
      if bun src/cli/index.ts capability-context request --from-latest-architecture-event; then
        :
      else
        status=$?
        echo "[SyncChain] WARN: capability-context request failed after $FILE_PATH (exit $status)"
      fi
    fi
  fi
}

run_brain_doc_sync() {
  [[ -x "scripts/sync-brain-docs.sh" ]] || return 0
  [[ -f ".ai/harness/brain-manifest.json" ]] || return 0

  # Fast-path: most edits are not repo-to-brain sources. Avoid starting the JS
  # manifest reader unless the changed repo path appears in the manifest.
  if ! grep -Fq "\"$FILE_PATH\"" ".ai/harness/brain-manifest.json"; then
    return 0
  fi

  if bash "scripts/sync-brain-docs.sh" --changed "$FILE_PATH"; then
    :
  else
    local status=$?
    echo "[SyncChain] WARN: brain-doc-sync failed for $FILE_PATH (exit $status)"
  fi
}

FILE_PATH="$(hook_get_file_path "${1:-}")"
[[ -z "$FILE_PATH" ]] && exit 0

BASENAME=$(basename "$FILE_PATH")
DIRNAME=$(dirname "$FILE_PATH")

if [[ "$FILE_PATH" == deploy/* ]]; then
  echo "[DeployAsset] Deployment operations asset changed: $FILE_PATH"
  echo "  Confirm secrets, real env files, provider state, artifacts, logs, and scratch files remain in ignored _ops/ before committing."
  echo "  Keep deployment SQL directly under deploy/sql/ with 4-digit ascending prefixes."
fi

if [[ "$BASENAME" == "package.json" && "$DIRNAME" =~ (^|/)packages/([^/]+) ]]; then
  PKG_NAME="packages/${BASH_REMATCH[2]}"
  if [[ -n "$PKG_NAME" ]]; then
    echo "[DocDrift] $PKG_NAME/package.json changed"
    echo "  Check: docs/packages.md exports table may need updating"
  fi
fi

if [[ "$FILE_PATH" =~ (^|/)packages/([^/]+)/src/([^/]+)/index\.ts$ ]]; then
  PKG="${BASH_REMATCH[2]}"
  MODULE="${BASH_REMATCH[3]}"
  echo "[DocDrift] New module '$MODULE' in $PKG"
  echo "  Check: docs/packages.md and docs/architecture.md may need updating"
fi

if [[ "$FILE_PATH" =~ (^|/)apps/[^/]+/src/.+ ]]; then
  echo "[DocDrift] App source changed: $FILE_PATH"
  echo "  Check: docs/architecture.md source tree may need updating"
fi

if [[ "$BASENAME" == "metro.config.js" ]] || [[ "$BASENAME" == "metro.config.ts" ]]; then
  echo "[DocDrift] Metro config changed"
  echo "  Check: docs/guides/metro-esm-gotchas.md may need updating"
fi

if [[ "$BASENAME" == "tsconfig.json" && "$DIRNAME" =~ (^|/)(packages|apps)/ ]]; then
  echo "[DocDrift] TypeScript config changed in $(basename "$DIRNAME")"
  echo "  Check: docs/packages.md may need updating"
fi

if [[ "$BASENAME" == "turbo.json" ]]; then
  echo "[DocDrift] Turborepo config changed"
  echo "  Check: docs/architecture.md pipeline section may need updating"
fi

if [[ "$BASENAME" =~ ^wrangler.*\.toml$ ]]; then
  echo "[DocDrift] Wrangler config changed: $BASENAME"
  echo "  Check: docs/guides/cf-deployment.md bindings/routes may need updating"
fi

# Aggregated advisories (route-registry keeps one PostToolUse edit entry; the
# dispatcher-level aggregation lives here).
if [[ -f "$SCRIPT_DIR/first-principles-guard.sh" ]]; then
  bash "$SCRIPT_DIR/first-principles-guard.sh" "$FILE_PATH" </dev/null || true
elif [[ -f "$SCRIPT_DIR/anti-simplification.sh" ]]; then
  bash "$SCRIPT_DIR/anti-simplification.sh" "$FILE_PATH" </dev/null || true
fi

run_architecture_queue_sync

run_brain_doc_sync

run_continuous_contract_verification

case "$FILE_PATH" in
  tasks/todos.md|plans/*.md|tasks/reviews/*.review.md|.ai/harness/checks/latest.json)
    ;;
  *)
    exit 0
    ;;
esac

active_plan="$(get_active_plan || true)"
if [[ "$FILE_PATH" == "tasks/todos.md" && -z "$active_plan" ]] && grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todos.md; then
  rm -f "$(workflow_task_state_file)" ".claude/.task-handoff.md"
  echo "[TaskHandoff] Deferred-goal ledger updated; active execution remains in the plan Task Breakdown."
  exit 0
fi

mkdir -p .claude

STATE_FILE="$(workflow_task_state_file)"
HANDOFF_FILE=".claude/.task-handoff.md"

if [[ "$FILE_PATH" == "tasks/todos.md" ]] && [[ -f "tasks/todos.md" ]] && ! grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todos.md; then
  workflow_sync_task_state_from_todo "tasks/todos.md" "$STATE_FILE"
fi

task_state="$(workflow_plan_task_state "$active_plan")"
IFS=$'\t' read -r total_tasks done_tasks next_pending <<< "$task_state"
done_tasks="${done_tasks:-0}"
total_tasks="${total_tasks:-0}"
next_pending="${next_pending:-"(none)"}"

next_action="$(workflow_next_action)"
next_stage="$(printf '%s\n' "$next_action" | cut -f1)"
next_command="$(printf '%s\n' "$next_action" | cut -f2)"
next_message="$(printf '%s\n' "$next_action" | cut -f3-)"
[[ "${next_command:-}" == "-" ]] && next_command=""
next_stage="${next_stage:-none}"
next_message="${next_message:-(none)}"

diff_stat="$(git diff --shortstat HEAD 2>/dev/null | tr -d '\n')"
diff_stat="${diff_stat:-no uncommitted diff against HEAD}"

if [[ -z "$active_plan" ]]; then
  active_plan="(none)"
fi

plan_status="(unknown)"
if [[ "$active_plan" != "(none)" && -f "$active_plan" ]]; then
  plan_status="$(awk '/^\> \*\*Status\*\*:/ {sub(/^.*\> \*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$active_plan" | xargs)"
  plan_status="${plan_status:-(unknown)}"
fi

changed_files="$(git diff --name-only HEAD 2>/dev/null | head -10)"
changed_files="${changed_files:-(none)}"

cat > "$HANDOFF_FILE" <<EOF_HANDOFF
# Task Handoff Summary

> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Progress**: ${done_tasks}/${total_tasks}
> **Active Plan**: ${active_plan}

## Plan Status

- ${plan_status}

## Current Task

- ${next_pending}

## Next Actions

- Stage: ${next_stage}
- Action: ${next_message}
- Command: ${next_command:-(none)}

## Key Artifacts

\`\`\`
${changed_files}
\`\`\`

## Working Tree Snapshot

- ${diff_stat}
EOF_HANDOFF

echo "[TaskHandoff] Workflow next action is ${next_stage}. Wrote ${HANDOFF_FILE}."

workflow_write_handoff "task-progress" || true
if [[ -f "$(workflow_handoff_file)" ]]; then
  echo "[HarnessHandoff] Refreshed $(workflow_handoff_file)."
fi
