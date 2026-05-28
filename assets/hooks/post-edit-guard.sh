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

run_architecture_drift_sync() {
  local drift_output

  [[ -x "scripts/architecture-drift.sh" ]] || return 0

  drift_output="$(bash "scripts/architecture-drift.sh" record --file "$FILE_PATH" 2>&1 || true)"
  [[ -n "$drift_output" ]] && printf '%s\n' "$drift_output"

  if printf '%s\n' "$drift_output" | grep -q '^\[ArchitectureDrift\] Request:'; then
    if [[ -x "scripts/context-contract-sync.sh" ]]; then
      bash "scripts/context-contract-sync.sh" sync-latest || true
    fi
  fi
}

run_brain_doc_sync() {
  [[ -x "scripts/sync-brain-docs.sh" ]] || return 0

  bash "scripts/sync-brain-docs.sh" --changed "$FILE_PATH" || true
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

run_architecture_drift_sync

run_brain_doc_sync

run_continuous_contract_verification

if [[ "$FILE_PATH" != "tasks/todo.md" ]] || [[ ! -f "tasks/todo.md" ]]; then
  exit 0
fi

if grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' tasks/todo.md; then
  rm -f "$(workflow_task_state_file)" ".claude/.task-handoff.md"
  echo "[TaskHandoff] Deferred-goal ledger updated; active execution remains in the plan Task Breakdown."
  exit 0
fi

mkdir -p .claude

STATE_FILE="$(workflow_task_state_file)"
HANDOFF_FILE=".claude/.task-handoff.md"

prev_done="$(workflow_read_state_field "$STATE_FILE" "done_tasks" 2>/dev/null || echo 0)"
prev_done="${prev_done:-0}"

workflow_sync_task_state_from_todo "tasks/todo.md" "$STATE_FILE"

done_tasks="$(workflow_read_state_field "$STATE_FILE" "done_tasks" 2>/dev/null || echo 0)"
total_tasks="$(workflow_read_state_field "$STATE_FILE" "total_tasks" 2>/dev/null || echo 0)"
done_tasks="${done_tasks:-0}"
total_tasks="${total_tasks:-0}"

if [[ "$done_tasks" -le "$prev_done" ]]; then
  exit 0
fi

just_completed="$(
  grep -E '^[[:space:]]*-[[:space:]]\[[xX]\][[:space:]]+' tasks/todo.md \
    | sed -E 's/^[[:space:]]*-[[:space:]]\[[xX]\][[:space:]]+//' \
    | tail -1
)"
just_completed="${just_completed:-Task completed}"

remaining_tasks="$(
  grep -E '^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+' tasks/todo.md \
    | sed -E 's/^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+/- [ ] /'
)"

if [[ -z "$remaining_tasks" ]]; then
  remaining_tasks="- [ ] (none)"
fi

diff_stat="$(git diff --shortstat HEAD 2>/dev/null | tr -d '\n')"
diff_stat="${diff_stat:-no uncommitted diff against HEAD}"

active_plan="$(get_active_plan || true)"
if [[ -z "$active_plan" ]]; then
  active_plan="(none)"
fi

plan_status="(unknown)"
if [[ "$active_plan" != "(none)" && -f "$active_plan" ]]; then
  plan_status="$(awk '/^\> \*\*Status\*\*:/ {sub(/^.*\> \*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$active_plan" | xargs)"
  plan_status="${plan_status:-(unknown)}"
fi

next_task="$(
  grep -E '^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+' tasks/todo.md \
    | head -1 \
    | sed -E 's/^[[:space:]]*-[[:space:]]\[[[:space:]]\][[:space:]]+//'
)"
next_task="${next_task:-(none)}"

changed_files="$(git diff --name-only HEAD 2>/dev/null | head -10)"
changed_files="${changed_files:-(none)}"

cat > "$HANDOFF_FILE" <<EOF_HANDOFF
# Task Handoff Summary

> **Generated**: $(date '+%Y-%m-%d %H:%M:%S')
> **Progress**: ${done_tasks}/${total_tasks}
> **Active Plan**: ${active_plan}

## Plan Status

- ${plan_status}

## Just Completed

- ${just_completed}

## Remaining Tasks

${remaining_tasks}

## Next Actions

- Next task: ${next_task}

## Key Artifacts

\`\`\`
${changed_files}
\`\`\`

## Working Tree Snapshot

- ${diff_stat}
EOF_HANDOFF

echo "[TaskHandoff] Task completion advanced (${done_tasks}/${total_tasks}). Wrote ${HANDOFF_FILE}."

workflow_write_handoff "task-progress" || true
if [[ -f "$(workflow_handoff_file)" ]]; then
  echo "[HarnessHandoff] Refreshed $(workflow_handoff_file)."
fi
