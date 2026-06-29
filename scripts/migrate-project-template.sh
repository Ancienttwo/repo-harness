#!/bin/bash
# Migrate an existing project to the repo-harness tasks-first harness model.
# - Shared hook source of truth: .ai/hooks/
# - User-level host adapters: ~/.claude/settings.json and ~/.codex/hooks.json
# - Stable product truth: docs/spec.md
# - Active-plan selector: .ai/harness/active-plan, with .claude/.active-plan legacy fallback
# - Sprint artifacts: plans/sprints/, tasks/contracts/, tasks/reviews/, .ai/context/context-map.json
# - Harness state: .ai/harness/checks/latest.json, .ai/harness/policy.json,
#   .ai/harness/brain-manifest.json,
#   .ai/harness/events.jsonl, .ai/harness/architecture/events.jsonl,
#   .ai/harness/handoff/current.md,
#   .ai/harness/handoff/resume.md,
#   .ai/harness/failures/latest.jsonl, .ai/harness/security/.gitkeep,
#   .ai/harness/worktrees/.gitkeep, .ai/harness/runs/.gitkeep
#
# Usage:
#   bash scripts/migrate-project-template.sh --repo /path/to/repo --dry-run
#   bash scripts/migrate-project-template.sh --repo /path/to/repo --apply

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PI_LIB_DIR="$SCRIPT_DIR/lib"
if [[ -f "$PI_LIB_DIR/project-init-lib.sh" ]]; then
  # shellcheck source=/dev/null
  . "$PI_LIB_DIR/project-init-lib.sh"
fi
HOOK_ASSETS_DIR="$SKILL_ROOT/assets/hooks"
TEMPLATE_ASSETS_DIR="$SKILL_ROOT/assets/templates"
HELPER_ASSETS_DIR="$TEMPLATE_ASSETS_DIR/helpers"
FACTOR_FACTORY_ASSETS_DIR="$TEMPLATE_ASSETS_DIR/factor-factory"
WORKFLOW_CONTRACT_ASSET="$SKILL_ROOT/assets/workflow-contract.v1.json"
JQ_BIN="${REPO_HARNESS_JQ_BIN:-jq}"

MODE="dry-run"
TARGET_REPO=""
INSPECT_OUTPUT=""

usage() {
  cat <<'USAGE_EOF'
Usage: migrate-project-template.sh --repo <path> [--dry-run|--apply]

Options:
  --repo <path>  Target repository path
  --dry-run      Print planned changes only (default)
  --apply        Apply changes
  --help         Show help
USAGE_EOF
}

log() {
  echo "[migrate] $*"
}

has_jq() {
  command -v "$JQ_BIN" >/dev/null 2>&1
}

run_ts_script() {
  local script_path="$1"
  shift

  if command -v bun >/dev/null 2>&1; then
    bun "$script_path" "$@"
    return $?
  fi

  if command -v node >/dev/null 2>&1; then
    node --experimental-strip-types "$script_path" "$@"
    return $?
  fi

  echo "[migrate] Missing bun/node runtime for TypeScript helper: $script_path" >&2
  return 1
}

merge_hook_settings_json() {
  local base_file="$1"
  local patch_file="$2"
  local output_file="$3"

  node - "$base_file" "$patch_file" "$output_file" <<'NODE_EOF'
const fs = require("fs");

const [, , basePath, patchPath, outputPath] = process.argv;

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matcherOf(block) {
  return block && Object.prototype.hasOwnProperty.call(block, "matcher")
    ? block.matcher ?? null
    : null;
}

function ensureHooksArray(block) {
  if (!Array.isArray(block.hooks)) {
    block.hooks = [];
  }
  return block.hooks;
}

function hasCommand(block, command) {
  return ensureHooksArray(block).some((hook) => (hook?.command ?? "") === command);
}

function mergeEventBlocks(baseBlocks, patchBlocks) {
  const result = Array.isArray(baseBlocks) ? clone(baseBlocks) : [];

  for (const patchBlock of Array.isArray(patchBlocks) ? patchBlocks : []) {
    const matcher = matcherOf(patchBlock);
    const patchHooks = Array.isArray(patchBlock?.hooks) ? patchBlock.hooks : [];

    for (const patchHook of patchHooks) {
      const command = patchHook?.command ?? "";
      if (!command) continue;

      const existingWithCommand = result.find(
        (block) => matcherOf(block) === matcher && hasCommand(block, command)
      );
      if (existingWithCommand) continue;

      const targetBlock = result.find((block) => matcherOf(block) === matcher);
      if (targetBlock) {
        ensureHooksArray(targetBlock).push(clone(patchHook));
        continue;
      }

      const newBlock = matcher === null
        ? { hooks: [clone(patchHook)] }
        : { matcher, hooks: [clone(patchHook)] };
      result.push(newBlock);
    }
  }

  return result;
}

const base = readJson(basePath);
const patch = readJson(patchPath);

const merged = {
  ...clone(base),
  ...clone(Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "hooks"))),
};

const baseHooks = (base && typeof base.hooks === "object" && base.hooks !== null) ? clone(base.hooks) : {};
const patchHooks = (patch && typeof patch.hooks === "object" && patch.hooks !== null) ? patch.hooks : {};

merged.hooks = baseHooks;
for (const [eventName, patchBlocks] of Object.entries(patchHooks)) {
  merged.hooks[eventName] = mergeEventBlocks(baseHooks[eventName], patchBlocks);
}

fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2) + "\n");
NODE_EOF
}

run_or_echo() {
  if [[ "$MODE" == "apply" ]]; then
    "$@"
  else
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  fi
}

backup_if_exists() {
  local path="$1"
  if [[ -f "$path" ]]; then
    run_or_echo cp "$path" "$path.bak.$(date +%Y%m%d%H%M%S)"
  fi
}

remove_path_if_exists() {
  local path="$1"
  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] remove \"$path\" if it exists"
    return 0
  fi

  if [[ -e "$path" ]]; then
    rm -rf "$path"
  fi
}

repo_relative_path() {
  local repo="$1"
  local path="$2"

  if [[ "$path" == "$repo/"* ]]; then
    printf '%s' "${path#"$repo/"}"
  else
    printf '%s' "$path"
  fi
}

file_matches_any_source() {
  local file_path="$1"
  shift
  local source_path

  [[ -f "$file_path" ]] || return 1
  for source_path in "$@"; do
    [[ -f "$source_path" ]] || continue
    if cmp -s "$file_path" "$source_path"; then
      return 0
    fi
  done

  return 1
}

file_has_repo_harness_marker() {
  local file_path="$1"

  [[ -f "$file_path" ]] || return 1

  grep -Eiq \
    '(repo-harness|claude-runtime-temp|Task Contract|Sprint Review|Deferred Goal Ledger|Workflow Contract|ContractWorktree|SprintBacklog|ArchitectureSync|ArchitectureDrift|BrainSync|CurrentStatus|\.ai/harness|\.claude/templates|tasks/contracts|tasks/reviews)' \
    "$file_path"
}

is_self_host_source_repo() {
  local repo="$1"
  local repo_real
  local source_real

  repo_real="$(cd "$repo" 2>/dev/null && pwd -P || printf '%s' "$repo")"
  source_real="$(cd "$SKILL_ROOT" 2>/dev/null && pwd -P || printf '%s' "$SKILL_ROOT")"

  [[ "$repo_real" == "$source_real" ]]
}

is_generated_root_helper() {
  local repo="$1"
  local rel_path="$2"
  local path="$repo/$rel_path"
  local helper_name="${rel_path##*/}"

  [[ "$rel_path" == scripts/* && -f "$path" ]] || return 1

  if file_matches_any_source "$path" "$HELPER_ASSETS_DIR/$helper_name" "$SCRIPT_DIR/$helper_name"; then
    return 0
  fi

  case "$helper_name" in
    skill-factory-create.sh|skill-factory-check.sh|architecture-drift.sh)
      file_has_repo_harness_marker "$path"
      return $?
      ;;
  esac

  file_has_repo_harness_marker "$path"
}

remove_generated_helper_if_owned() {
  local repo="$1"
  local rel_path="$2"
  local path="$repo/$rel_path"
  local display_path

  display_path="$(repo_relative_path "$repo" "$path")"

  if is_self_host_source_repo "$repo"; then
    if [[ "$MODE" != "apply" ]]; then
      echo "[dry-run] preserve self-host source helper \"$path\""
    else
      log "Preserved self-host source helper: $display_path"
    fi
    return 0
  fi

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] remove generated helper \"$path\" if repo-harness ownership is identifiable"
    return 0
  fi

  [[ -e "$path" ]] || return 0

  if is_generated_root_helper "$repo" "$rel_path"; then
    rm -f "$path"
    log "Removed generated legacy root helper: $display_path"
  else
    log "Preserved possible app-owned script: $display_path (not identifiable as repo-harness generated helper)"
  fi
}

prune_removed_hook_commands() {
  local settings_file="$1"

  if [[ "$MODE" != "apply" || ! -f "$settings_file" ]]; then
    return 0
  fi

  if ! command -v node >/dev/null 2>&1; then
    log "Skipping removed-hook pruning for $settings_file because node is unavailable"
    return 0
  fi

  node - "$settings_file" <<'NODE_EOF'
const fs = require("fs");
const path = process.argv[2];
const removedFragments = ["memory-intake.sh", "skill-factory-session-end.sh"];

const settings = JSON.parse(fs.readFileSync(path, "utf8"));
if (!settings.hooks || typeof settings.hooks !== "object") {
  process.exit(0);
}

const nextHooks = {};
for (const [eventName, blocks] of Object.entries(settings.hooks)) {
  const keptBlocks = (Array.isArray(blocks) ? blocks : [])
    .map((block) => {
      const hooks = (Array.isArray(block.hooks) ? block.hooks : []).filter((hook) => {
        const command = hook?.command ?? "";
        return !removedFragments.some((fragment) => command.includes(fragment));
      });
      return hooks.length > 0 ? { ...block, hooks } : null;
    })
    .filter(Boolean);

  if (keptBlocks.length > 0) {
    nextHooks[eventName] = keptBlocks;
  }
}

settings.hooks = nextHooks;
fs.writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
NODE_EOF
}

cleanup_removed_workflow_assets() {
  local repo="$1"
  local cleanup_mode
  local rel_path

  while IFS=$'\t' read -r cleanup_mode rel_path; do
    [[ -z "$rel_path" ]] && continue
    case "$cleanup_mode" in
      generated_helper)
        remove_generated_helper_if_owned "$repo" "$rel_path"
        ;;
      *)
        remove_path_if_exists "$repo/$rel_path"
        ;;
    esac
  done < <(pi_workflow_contract_upgrade_action_entries "$WORKFLOW_CONTRACT_ASSET" "remove" "known_generated")
}

ensure_runtime_gitignore_block() {
  local repo="$1"
  local file_path="$2"
  local extra_entries=""
  if pi_should_enable_factor_factory "$(pi_plan_type)"; then
    extra_entries="$(pi_factor_factory_gitignore_entries)"
  fi
  pi_ensure_gitignore_block "$file_path" "" "$extra_entries" "$MODE"
}

legacy_root_helper_paths() {
  local helper_name
  while IFS= read -r helper_name; do
    [[ -z "$helper_name" ]] && continue
    printf '%s\n' "$helper_name"
    printf '%s\n' "scripts/repo-harness/${helper_name#scripts/}"
  done < <(pi_legacy_root_helper_paths "$WORKFLOW_CONTRACT_ASSET")
}

untrack_legacy_root_helpers() {
  local repo="$1"
  local rel_path

  if is_self_host_source_repo "$repo"; then
    return 0
  fi

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] untrack repo-harness legacy root helpers from git index when tracked"
    return 0
  fi

  if ! git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    return 0
  fi

  while IFS= read -r rel_path; do
    [[ -z "$rel_path" ]] && continue
    if ! git -C "$repo" ls-files --error-unmatch -- "$rel_path" >/dev/null 2>&1; then
      continue
    fi
    if [[ ! -e "$repo/$rel_path" ]]; then
      git -C "$repo" rm --cached --force --quiet -- "$rel_path"
      log "Untracked removed legacy root helper: $rel_path"
      continue
    fi
    if [[ "$rel_path" == scripts/repo-harness/* ]] || is_generated_root_helper "$repo" "$rel_path"; then
      git -C "$repo" rm --cached --force --quiet -- "$rel_path"
      log "Untracked legacy root helper: $rel_path"
    else
      log "Preserved tracked app-owned script: $rel_path"
    fi
  done < <(legacy_root_helper_paths)
}

migrate_active_plan_marker() {
  local repo="$1"
  local new_marker="$repo/.ai/harness/active-plan"
  local legacy_marker="$repo/.claude/.active-plan"
  local worktree_marker="$repo/.ai/harness/active-worktree"
  local new_value=""
  local legacy_value=""

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] migrate active-plan marker to .ai/harness/active-plan with .claude/.active-plan compatibility"
    return 0
  fi

  if [[ -f "$new_marker" ]]; then
    new_value="$(cat "$new_marker" 2>/dev/null | xargs)"
  fi
  if [[ -f "$legacy_marker" ]]; then
    legacy_value="$(cat "$legacy_marker" 2>/dev/null | xargs)"
  fi

  if [[ -n "$new_value" ]]; then
    mkdir -p "$(dirname "$legacy_marker")"
    printf '%s' "$new_value" > "$legacy_marker"
    mkdir -p "$(dirname "$worktree_marker")"
    (cd "$repo" && pwd -P) > "$worktree_marker"
    return 0
  fi

  if [[ -n "$legacy_value" ]]; then
    mkdir -p "$(dirname "$new_marker")"
    printf '%s' "$legacy_value" > "$new_marker"
    (cd "$repo" && pwd -P) > "$worktree_marker"
  fi
}

ensure_gitignore_entry() {
  local file_path="$1"
  local entry="$2"

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] ensure .gitignore entry: $entry"
    return
  fi

  if ! grep -Fxq "$entry" "$file_path"; then
    printf "%s\n" "$entry" >> "$file_path"
  fi
}

install_templates() {
  local repo="$1"
  pi_install_templates "$repo" "$TEMPLATE_ASSETS_DIR" "$MODE"
}

install_helpers() {
  local repo="$1"
  if [[ -d "$HELPER_ASSETS_DIR" ]]; then
    local helper_names
    helper_names="$(pi_workflow_contract_query_lines "$WORKFLOW_CONTRACT_ASSET" "helpers.scripts" | xargs)"
    pi_install_helpers "$repo" "$HELPER_ASSETS_DIR" "$MODE" "$helper_names"
  else
    log "Helper assets not found at $HELPER_ASSETS_DIR"
  fi
}

install_workflow_contract() {
  local repo="$1"
  pi_install_workflow_contract "$repo" "$WORKFLOW_CONTRACT_ASSET" "$MODE"
}

ensure_task_sync_package_script() {
  local repo="$1"
  local package_file="$repo/package.json"

  if [[ ! -f "$package_file" ]]; then
    if [[ "$MODE" == "apply" ]]; then
      log "package.json missing; skipped check:task-sync injection"
    else
      echo "[dry-run] package.json missing; skip task workflow script injection"
    fi
    return
  fi

  pi_ensure_task_sync "$repo" "0" "$MODE"
  if [[ "$MODE" == "apply" ]]; then
    log "Injected task workflow scripts into $package_file"
  fi
}

migrate_legacy_sprint_prds() {
  local repo="$1"
  local legacy_dir="$repo/tasks/sprints"
  local prd_dir="$repo/plans/prds"
  local sprint_dir="$repo/plans/sprints"
  local marker_file="$repo/.ai/harness/sprint/active-sprint"
  local src
  local stem
  local legacy_rel
  local marker_value

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] migrate legacy sprint files from tasks/sprints/*.sprint.md and sprint-shaped plans/prds/*.prd.md into plans/sprints/*.sprint.md"
    return 0
  fi

  mkdir -p "$prd_dir" "$sprint_dir"
  shopt -s nullglob

  move_sprint_file() {
    local src_file="$1"
    local old_rel="$2"
    local stem_name="$3"
    local dest_file
    local dest_rel_file
    local n

    dest_file="$sprint_dir/${stem_name}.sprint.md"
    n=2
    while [[ -e "$dest_file" ]]; do
      dest_file="$sprint_dir/${stem_name}-v${n}.sprint.md"
      n=$((n + 1))
    done

    mv "$src_file" "$dest_file"

    dest_rel_file="plans/sprints/$(basename "$dest_file")"
    if [[ -f "$marker_file" ]]; then
      marker_value="$(tr -d '\r\n' < "$marker_file")"
      if [[ "$marker_value" == "$old_rel" || "$marker_value" == "$src_file" ]]; then
        printf '%s\n' "$dest_rel_file" > "$marker_file"
      fi
    fi
  }

  for src in "$legacy_dir"/*.sprint.md; do
    stem="$(basename "$src" .sprint.md)"
    legacy_rel="tasks/sprints/${stem}.sprint.md"
    move_sprint_file "$src" "$legacy_rel" "$stem"
  done

  for src in "$prd_dir"/*.prd.md; do
    if grep -Eq '^(# Sprint:|## Backlog[[:space:]]*$)' "$src"; then
      stem="$(basename "$src" .prd.md)"
      legacy_rel="plans/prds/${stem}.prd.md"
      move_sprint_file "$src" "$legacy_rel" "$stem"
    fi
  done
  shopt -u nullglob

  rmdir "$legacy_dir" 2>/dev/null || true
}

create_task_files_if_missing() {
  local repo="$1"
  local project_name
  local timestamp
  local todo_file
  local legacy_todo_file
  local legacy_todo_archive

  project_name="$(basename "$repo")"
  timestamp="$(date '+%Y-%m-%d %H:%M')"
  todo_file="$repo/tasks/todos.md"
  legacy_todo_file="$repo/tasks/todo.md"
  legacy_todo_archive="$repo/tasks/archive/legacy-tasks-todo.md"

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] ensure docs/spec.md, tasks/*, workstreams, reviews, notes, .ai/context/{capabilities.json,context-map.json}, and .ai/harness/{checks/latest.json,policy.json,brain-manifest.json,events.jsonl,architecture/events.jsonl,handoff/current.md,handoff/resume.md,failures/latest.jsonl,security/.gitkeep,worktrees/.gitkeep,runs/.gitkeep} exist with current workflow guidance"
    return
  fi

  mkdir -p \
    "$repo/plans" \
    "$repo/plans/archive" \
    "$repo/plans/prds" \
    "$repo/plans/sprints" \
    "$repo/tasks" \
    "$repo/tasks/archive" \
    "$repo/tasks/contracts" \
    "$repo/tasks/reviews" \
    "$repo/tasks/notes" \
    "$repo/tasks/workstreams" \
    "$repo/docs" \
    "$repo/docs/architecture/domains" \
    "$repo/docs/architecture/modules" \
    "$repo/docs/architecture/requests" \
    "$repo/docs/architecture/snapshots" \
    "$repo/docs/architecture/diagrams" \
    "$repo/.ai/context" \
    "$repo/.ai/harness/checks" \
    "$repo/.ai/harness/handoff" \
    "$repo/.ai/harness/failures" \
    "$repo/.ai/harness/architecture" \
    "$repo/.ai/harness/runs"

  if [[ ! -f "$repo/docs/spec.md" ]]; then
    if [[ -f "$repo/.claude/templates/spec.template.md" ]]; then
      sed \
        -e "s/{{PROJECT_NAME}}/${project_name}/g" \
        -e "s/{{TIMESTAMP}}/${timestamp}/g" \
        "$repo/.claude/templates/spec.template.md" > "$repo/docs/spec.md"
    else
      cat > "$repo/docs/spec.md" <<EOF_SPEC
# Product Spec: ${project_name}

> **Status**: Draft
> **Last Updated**: ${timestamp}
> **Owner**: Planner
EOF_SPEC
    fi
  fi

  if [[ -f "$legacy_todo_file" ]]; then
    mkdir -p "$repo/tasks/archive"
    if [[ ! -f "$legacy_todo_archive" ]]; then
      cp "$legacy_todo_file" "$legacy_todo_archive"
    fi
    if [[ ! -f "$todo_file" ]]; then
      if grep -Eq '^# Deferred Goal Ledger[[:space:]]*$' "$legacy_todo_file" \
        && grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$legacy_todo_file"; then
        cp "$legacy_todo_file" "$todo_file"
      else
        cat > "$todo_file" <<'TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (migration)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Review archived legacy checklist | Legacy tasks/todo.md contained execution checklist content before migration. | Preserve user-authored task text in tasks/archive instead of guessing which items still matter. | Open the archive and promote real follow-up work into a new plan or a deferred-goal row. |
TODO_EOF
      fi
    fi
    mv "$legacy_todo_file" "$legacy_todo_file.migrated.bak"
  fi

  if [[ ! -f "$todo_file" ]]; then
    cat > "$todo_file" <<'TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (migration)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| (none) | No deferred medium/long-term goal recorded yet. | Keep migrated workflow state bounded. | Add a row when a real follow-up is postponed. |
TODO_EOF
  elif ! grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$todo_file"; then
    backup_if_exists "$todo_file"
    cat > "$todo_file" <<'TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (migration)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Review archived legacy checklist | Legacy tasks/todos.md contained execution checklist content before migration. | Preserve user-authored task text in tasks/archive instead of guessing which items still matter. | Open the archive and promote real follow-up work into a new plan or a deferred-goal row. |
TODO_EOF
  fi

  if [[ ! -f "$repo/tasks/current.md" ]]; then
    cat > "$repo/tasks/current.md" <<'CURRENT_STATUS_EOF'
# Current Status Snapshot

<!-- generated-by: repo-harness refresh-current-status v1 -->
<!-- updated_at: bootstrap -->
<!-- stale_after: 24h -->

> **Status**: Idle
> **Updated At**: bootstrap
> **Source Branch**: main
> **Source Commit**: bootstrap
> **Target Branch**: main
> **Stale After**: 24h
> **Reason**: bootstrap
> **Derived From**: active-plan, workstreams, handoff, checks, git status

This file is a tracked mainline snapshot derived from repo artifacts. It is not a live lock, not a kanban board, and not an implementation gate. If it is stale, read the source artifacts below.
CURRENT_STATUS_EOF
  fi

  if [[ ! -f "$repo/tasks/lessons.md" ]]; then
    cat > "$repo/tasks/lessons.md" <<'LESSONS_EOF'
# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:
LESSONS_EOF
  fi

  pi_ensure_harness_state_surface "$repo" "apply"

}

install_reference_configs() {
  local repo="$1"
  local ref_dir="$repo/docs/reference-configs"
  local ref_assets_dir="$SKILL_ROOT/assets/reference-configs"

  run_or_echo mkdir -p "$ref_dir"

  if [[ -d "$ref_assets_dir" ]]; then
    if [[ "$MODE" == "apply" ]]; then
      pi_install_reference_configs "$repo" "$ref_assets_dir" "apply"
    else
      pi_install_reference_configs "$repo" "$ref_assets_dir" "dry-run"
    fi
  fi
}

ensure_ops_scaffold() {
  local repo="$1"
  local deploy_readme="$repo/deploy/README.md"

  run_or_echo mkdir -p "$repo/deploy/env"
  run_or_echo mkdir -p "$repo/deploy/scripts"
  run_or_echo mkdir -p "$repo/deploy/submissions"
  run_or_echo mkdir -p "$repo/deploy/runbooks"
  run_or_echo mkdir -p "$repo/deploy/release-checklists"
  run_or_echo mkdir -p "$repo/deploy/sql"
  run_or_echo mkdir -p "$repo/_ops/env"
  run_or_echo mkdir -p "$repo/_ops/secrets"
  run_or_echo mkdir -p "$repo/_ops/artifacts"
  run_or_echo mkdir -p "$repo/_ops/logs"
  run_or_echo mkdir -p "$repo/_ops/state"
  run_or_echo mkdir -p "$repo/_ops/scratch"

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] ensure deploy workspace README, tracked placeholders, deploy/sql, and ignored _ops private state"
    echo "[dry-run] migrate legacy _ops runbooks/scripts/submissions/env examples into deploy/"
    return 0
  fi

  migrate_legacy_ops_asset() {
    local src="$1"
    local dest="$2"
    if [[ -e "$src" && ! -e "$dest" ]]; then
      mv "$src" "$dest"
    fi
  }

  migrate_legacy_ops_children() {
    local src_dir="$1"
    local dest_dir="$2"
    local src
    local base
    [[ -d "$src_dir" ]] || return 0
    shopt -s nullglob dotglob
    for src in "$src_dir"/*; do
      base="$(basename "$src")"
      [[ "$base" == ".gitkeep" ]] && continue
      migrate_legacy_ops_asset "$src" "$dest_dir/$base"
    done
    shopt -u nullglob dotglob
  }

  migrate_legacy_ops_asset "$repo/_ops/env/.env.example" "$repo/deploy/env/.env.example"
  migrate_legacy_ops_children "$repo/_ops/scripts" "$repo/deploy/scripts"
  migrate_legacy_ops_children "$repo/_ops/submissions" "$repo/deploy/submissions"
  migrate_legacy_ops_children "$repo/_ops/sql" "$repo/deploy/sql"

  shopt -s nullglob
  for legacy_doc in "$repo/_ops"/*.md; do
    legacy_base="$(basename "$legacy_doc")"
    [[ "$legacy_base" == "README.md" ]] && continue
    migrate_legacy_ops_asset "$legacy_doc" "$repo/deploy/$legacy_base"
  done
  shopt -u nullglob

  shopt -s nullglob
  for legacy_sql in "$repo/_ops"/*.sql; do
    legacy_base="$(basename "$legacy_sql")"
    migrate_legacy_ops_asset "$legacy_sql" "$repo/deploy/sql/$legacy_base"
  done
  shopt -u nullglob

  touch "$repo/deploy/env/.gitkeep"
  touch "$repo/deploy/scripts/.gitkeep"
  touch "$repo/deploy/submissions/.gitkeep"
  touch "$repo/deploy/runbooks/.gitkeep"
  touch "$repo/deploy/release-checklists/.gitkeep"
  touch "$repo/deploy/sql/.gitkeep"

  if [[ ! -f "$deploy_readme" ]]; then
    cat > "$deploy_readme" <<'DEPLOY_README_EOF'
# Deployment Operations

`deploy/` is a commit-ready surface for deployment and operations runbooks, submission materials, release checklists, helper scripts, and env examples.

## Track

- `deploy/scripts/` for operational scripts.
- `deploy/submissions/` for submission or review materials.
- `deploy/runbooks/` and `deploy/release-checklists/` for operational documentation.
- `deploy/sql/` for ordered deployment SQL files named like `0001_create_tables.sql`.
- `deploy/*.md` for runbooks and operating notes.
- `deploy/env/.env.example` for documented variable shapes only.

## Do Not Track

- `_ops/`
- private keys, real env files, provider state, production tokens, credential dumps, artifacts, logs, and local-only overrides

Keep external upstream checkouts and source references in `_ref/`; `_ref/` is ignored and must stay out of commits.
DEPLOY_README_EOF
  fi
}

ensure_research_surface() {
  local repo="$1"
  local research_dir="$repo/docs/researches"
  local research_readme="$research_dir/README.md"
  local legacy_research="$repo/tasks/research.md"
  local legacy_archive="$research_dir/legacy-research-notes.md"

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] ensure research reports directory at $research_dir"
    if [[ -f "$legacy_research" ]]; then
      echo "[dry-run] archive legacy $legacy_research into $legacy_archive and leave a tombstone"
    fi
    return
  fi

  mkdir -p "$research_dir"

  if [[ ! -f "$research_readme" ]]; then
    cat > "$research_readme" <<'RESEARCH_README_EOF'
# Research Reports

Durable research reports live in this directory as dated Markdown files.

Use `YYYYMMDD-topic.md` names for new reports. Keep task-local implementation
decisions in `tasks/notes/`, and keep repeated correction-derived rules in
`tasks/lessons.md`.
RESEARCH_README_EOF
  fi

  if [[ -f "$legacy_research" ]]; then
    if [[ ! -f "$legacy_archive" ]]; then
      cp "$legacy_research" "$legacy_archive"
    fi

    cat > "$legacy_research" <<'RESEARCH_TOMBSTONE_EOF'
# Research Notes Moved

> **Status**: Retired tombstone
> **Canonical Surface**: `docs/researches/`
> **Legacy Archive**: `docs/researches/legacy-research-notes.md`

Durable research reports now live under `docs/researches/*.md`. This file is
kept only as a transition pointer for older tooling and historical links; do
not add new findings here.
RESEARCH_TOMBSTONE_EOF
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --repo)
        TARGET_REPO="${2:-}"
        shift 2
        ;;
      --dry-run)
        MODE="dry-run"
        shift
        ;;
      --apply)
        MODE="apply"
        shift
        ;;
      --help)
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
}

require_repo() {
  if [[ -z "$TARGET_REPO" ]]; then
    echo "--repo is required" >&2
    usage
    exit 1
  fi

  if [[ ! -d "$TARGET_REPO" ]]; then
    echo "Repo path does not exist: $TARGET_REPO" >&2
    exit 1
  fi

  local target_physical
  target_physical="$(cd "$TARGET_REPO" && pwd -P)"
  local home_physical=""
  if [[ -n "${HOME:-}" && -d "$HOME" ]]; then
    home_physical="$(cd "$HOME" && pwd -P)"
  fi

  if [[ -n "$home_physical" && "$target_physical" == "$home_physical" ]]; then
    echo "Refusing to migrate HOME as a repo target: $target_physical" >&2
    echo "Run repo-harness adopt --repo <git-repo> from an intended project." >&2
    exit 2
  fi
}

inspect_project_state() {
  local repo="$1"
  local inspector="$SCRIPT_DIR/inspect-project-state.ts"

  if [[ ! -f "$inspector" ]]; then
    log "Project-state inspector missing: $inspector"
    return 1
  fi

  INSPECT_OUTPUT="$(run_ts_script "$inspector" --repo "$repo" --format text)"
  printf '%s\n' "$INSPECT_OUTPUT"
}

migrate_hooks() {
  local repo="$1"
  local project_claude_dir="$repo/.claude"
  local project_ai_hooks_dir="$repo/.ai/hooks"

  run_or_echo mkdir -p "$project_claude_dir" "$project_ai_hooks_dir"

  cleanup_removed_workflow_assets "$repo"
  pi_install_hook_assets "$repo" "$HOOK_ASSETS_DIR" "$MODE"
  pi_install_hook_adapters "$repo" "$HOOK_ASSETS_DIR" "$MODE"
}

migrate_docs() {
  local repo="$1"
  local migrator="$SCRIPT_DIR/migrate-workflow-docs.ts"

  if [[ ! -f "$migrator" ]]; then
    log "Legacy-doc migrator missing: $migrator"
    return 1
  fi

  if [[ "$MODE" == "apply" ]]; then
    run_ts_script "$migrator" --repo "$repo" --apply
  else
    run_ts_script "$migrator" --repo "$repo" --dry-run
  fi
}

migrate_workflow() {
  local repo="$1"

  run_or_echo mkdir -p "$repo/plans/archive"
  run_or_echo mkdir -p "$repo/plans/prds"
  run_or_echo mkdir -p "$repo/plans/sprints"
  run_or_echo mkdir -p "$repo/tasks/archive"
  run_or_echo mkdir -p "$repo/tasks/contracts"
  run_or_echo mkdir -p "$repo/tasks/reviews"
  run_or_echo mkdir -p "$repo/tasks/notes"
  run_or_echo mkdir -p "$repo/tasks/workstreams"
  run_or_echo mkdir -p "$repo/docs/reference-configs"
  run_or_echo mkdir -p "$repo/.ai/harness/checks"
  run_or_echo mkdir -p "$repo/.ai/harness/handoff"
  migrate_active_plan_marker "$repo"

  install_templates "$repo"
  install_helpers "$repo"
  install_workflow_contract "$repo"
  if pi_should_enable_factor_factory "$(pi_plan_type)"; then
    pi_install_factor_factory "$repo" "$FACTOR_FACTORY_ASSETS_DIR" "$SKILL_ROOT/scripts" "$MODE"
  fi
  install_reference_configs "$repo"
  ensure_ops_scaffold "$repo"
  ensure_research_surface "$repo"
  migrate_legacy_sprint_prds "$repo"
  create_task_files_if_missing "$repo"
  ensure_task_sync_package_script "$repo"

  local repo_gitignore="$repo/.gitignore"
  run_or_echo touch "$repo_gitignore"
  ensure_gitignore_entry "$repo_gitignore" "# Project-specific"
  ensure_gitignore_entry "$repo_gitignore" "artifacts/"
  ensure_gitignore_entry "$repo_gitignore" "coverage/"
  ensure_gitignore_entry "$repo_gitignore" "*.tar.gz"
  ensure_gitignore_entry "$repo_gitignore" "*.tgz"
  ensure_gitignore_entry "$repo_gitignore" "# External references"
  ensure_gitignore_entry "$repo_gitignore" "_ref/"
  ensure_gitignore_entry "$repo_gitignore" ".codegraph/"
  ensure_gitignore_entry "$repo_gitignore" "# Local operations state"
  ensure_gitignore_entry "$repo_gitignore" "_ops/"
  ensure_gitignore_entry "$repo_gitignore" "# Environment"
  ensure_gitignore_entry "$repo_gitignore" ".env"
  ensure_gitignore_entry "$repo_gitignore" ".env.*"
  ensure_gitignore_entry "$repo_gitignore" "!.env.example"
  ensure_gitignore_entry "$repo_gitignore" "# OS metadata"
  ensure_gitignore_entry "$repo_gitignore" ".DS_Store"
  ensure_runtime_gitignore_block "$repo" "$repo_gitignore"
  untrack_legacy_root_helpers "$repo"

}

verify_migration_contract() {
  local repo="$1"

  if [[ "$MODE" != "apply" ]]; then
    echo "[dry-run] refresh Codex handoff before workflow verify"
    echo "[dry-run] verify migrated workflow with repo-harness run check-task-workflow --strict"
    return 0
  fi

  if [[ -f "$SKILL_ROOT/src/cli/index.ts" ]] && command -v bun >/dev/null 2>&1; then
    (cd "$repo" && REPO_HARNESS_SOURCE_ROOT="$SKILL_ROOT" bun "$SKILL_ROOT/src/cli/index.ts" run prepare-codex-handoff --reason "repo-harness-migration-verify" >/dev/null) || true
    log "Refreshed Codex handoff before workflow verify"
    (cd "$repo" && REPO_HARNESS_SOURCE_ROOT="$SKILL_ROOT" bun "$SKILL_ROOT/src/cli/index.ts" run check-task-workflow --strict)
    return $?
  fi

  (cd "$repo" && repo-harness run prepare-codex-handoff --reason "repo-harness-migration-verify" >/dev/null) || true
  log "Refreshed Codex handoff before workflow verify"
  (cd "$repo" && repo-harness run check-task-workflow --strict)
}

print_report() {
  local repo="$1"
  echo
  echo "=== Migration Report ==="
  echo "Mode: $MODE"
  echo "Repo: $repo"
  if [[ -n "$INSPECT_OUTPUT" ]]; then
    echo "--- Inspection ---"
    printf '%s\n' "$INSPECT_OUTPUT"
  fi
  echo "- Project hooks synced from: $HOOK_ASSETS_DIR (repo-local fallback; lib-only unless hook_source=repo)"
  echo "- Host hook config target: user-level ~/.claude/settings.json and ~/.codex/hooks.json"
  echo "- $(pi_print_codex_hook_trust_notice)"
  echo "- Legacy docs/TODO.md / docs/plan.md / docs/PROGRESS.md: migrated by scripts/migrate-workflow-docs.ts"
  echo "- Workflow migration: docs/spec.md + plans/ + tasks/contracts + tasks/reviews + .ai/context/context-map.json + .ai/harness/*"
  echo "- Workflow contract manifest installed at: .ai/harness/workflow-contract.json"
  echo "- Helper runtime: package/global only through repo-harness run; no repo-local helper script writes"
  echo "- Upgrade/reconfigure/cleanup plan: generated from workflow contract migrations.upgrade"
  echo "- Existing external_tooling overrides are preserved; missing defaults are merged into .ai/harness/policy.json"
  echo "- Runtime temporary ignore block synced to .gitignore"
  pi_print_external_tooling_report "$repo" "$MODE" "$SCRIPT_DIR/check-agent-tooling.sh"
}

run_skill_hook() {
  local event="$1"
  local hook_script="$SCRIPT_DIR/run-skill-hook.ts"

  if command -v bun >/dev/null 2>&1 && [[ -f "$hook_script" ]]; then
    bun "$hook_script" "$event" --context "{\"repo\":\"$TARGET_REPO\",\"mode\":\"$MODE\"}" 2>&1 || {
      if [[ "$event" == pre-* ]]; then
        log "Pre-hook $event failed, aborting."
        return 1
      else
        log "Post-hook $event warning (non-fatal)."
      fi
    }
  fi
}

update_version_stamp() {
  local repo="$1"
  local stamp_file="$repo/.claude/.skill-version"
  local skill_version_file="$SKILL_ROOT/assets/skill-version.json"
  local sv_version="unknown"
  local sv_template_version="unknown"

  if [[ -f "$skill_version_file" ]] && command -v bun >/dev/null 2>&1; then
    sv_version=$(bun -e "console.log(JSON.parse(require('fs').readFileSync('$skill_version_file','utf-8')).version)")
    sv_template_version=$(bun -e "console.log(JSON.parse(require('fs').readFileSync('$skill_version_file','utf-8')).templateVersion)")
  elif [[ -f "$skill_version_file" ]] && command -v node >/dev/null 2>&1; then
    sv_version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$skill_version_file','utf-8')).version)")
    sv_template_version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$skill_version_file','utf-8')).templateVersion)")
  fi

  if [[ "$MODE" == "apply" ]]; then
    local existing_skill_version=""
    local existing_template_version=""
    local existing_migrated_at=""
    local migrated_at=""

    if [[ -f "$stamp_file" ]]; then
      existing_skill_version="$(awk -F= '$1 == "skill_version" { print $2 }' "$stamp_file" 2>/dev/null || true)"
      existing_template_version="$(awk -F= '$1 == "template_version" { print $2 }' "$stamp_file" 2>/dev/null || true)"
      existing_migrated_at="$(awk -F= '$1 == "migrated_at" { print $2 }' "$stamp_file" 2>/dev/null || true)"
    fi

    if [[ "$existing_skill_version" == "$sv_version" && "$existing_template_version" == "$sv_template_version" && -n "$existing_migrated_at" ]]; then
      migrated_at="$existing_migrated_at"
    else
      migrated_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    fi

    mkdir -p "$(dirname "$stamp_file")"
    local stamp_tmp
    stamp_tmp="$(mktemp)"
    cat > "$stamp_tmp" <<STAMP_EOF
skill_version=$sv_version
template_version=$sv_template_version
migrated_at=$migrated_at
STAMP_EOF
    if [[ -f "$stamp_file" ]] && cmp -s "$stamp_tmp" "$stamp_file"; then
      rm -f "$stamp_tmp"
      log "Version stamp already current: $stamp_file"
    else
      mv "$stamp_tmp" "$stamp_file"
      log "Version stamp updated: $stamp_file"
    fi
  else
    echo "[dry-run] update version stamp at $stamp_file (skill=$sv_version, template=$sv_template_version)"
  fi
}

main() {
  parse_args "$@"
  require_repo

  TARGET_REPO="$(cd "$TARGET_REPO" && pwd)"
  log "Starting migration ($MODE) for $TARGET_REPO"

  run_skill_hook "pre-migrate" || exit 1

  inspect_project_state "$TARGET_REPO" || exit 1
  migrate_hooks "$TARGET_REPO"
  migrate_docs "$TARGET_REPO"
  migrate_workflow "$TARGET_REPO"
  update_version_stamp "$TARGET_REPO"
  verify_migration_contract "$TARGET_REPO" || exit 1
  print_report "$TARGET_REPO"

  run_skill_hook "post-migrate"
}

main "$@"
