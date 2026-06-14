#!/bin/bash
# Create standard project directory structure
# Usage: bash scripts/create-project-dirs.sh
#
# Creates the three-layer project structure:
#   IMMUTABLE LAYER (资产层): specs, contracts, tests
#   MUTABLE LAYER (厕纸层): src
#   SUPPORTING (支撑层): docs, deploy, _ops, artifacts, tasks, plans

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_LIB_DIR="$SCRIPT_DIR/lib"
if [[ -f "$PI_LIB_DIR/project-init-lib.sh" ]]; then
  # shellcheck source=/dev/null
  . "$PI_LIB_DIR/project-init-lib.sh"
fi
ASSETS_TEMPLATES_DIR="$SCRIPT_DIR/../assets/templates"
ASSETS_HOOKS_DIR="$SCRIPT_DIR/../assets/hooks"
ASSETS_REF_DIR="$SCRIPT_DIR/../assets/reference-configs"
ASSETS_FACTOR_FACTORY_DIR="$ASSETS_TEMPLATES_DIR/factor-factory"
ASSETS_WORKFLOW_CONTRACT="$SCRIPT_DIR/../assets/workflow-contract.v1.json"

write_runtime_gitignore_block() {
  local extra_entries=""
  local helper_entries=""
  if pi_should_enable_factor_factory "$(pi_plan_type)"; then
    extra_entries="$(pi_factor_factory_gitignore_entries)"
  fi
  helper_entries="$(pi_helper_wrapper_gitignore_entries "$ASSETS_WORKFLOW_CONTRACT")"
  if [[ -n "$helper_entries" ]]; then
    if [[ -n "$extra_entries" ]]; then
      extra_entries="${extra_entries}"$'\n'"${helper_entries}"
    else
      extra_entries="$helper_entries"
    fi
  fi
  pi_ensure_gitignore_block ".gitignore" "$PI_DEFAULT_GITIGNORE_CONTENT" "$extra_entries" "apply"
}

write_templates() {
  pi_install_templates "$PWD" "$ASSETS_TEMPLATES_DIR" "apply"
}

install_workflow_helpers() {
  local helper_names
  helper_names="$(pi_workflow_contract_query_lines "$ASSETS_WORKFLOW_CONTRACT" "helpers.scripts" | xargs)"
  pi_install_helpers "$PWD" "$ASSETS_TEMPLATES_DIR/helpers" "apply" "$helper_names"
}

install_workflow_contract() {
  pi_install_workflow_contract "$PWD" "$ASSETS_WORKFLOW_CONTRACT" "apply"
}

create_contract_directories() {
  while IFS= read -r rel_dir; do
    [[ -z "$rel_dir" ]] && continue
    mkdir -p "$rel_dir"
  done < <(pi_workflow_contract_query_lines "$ASSETS_WORKFLOW_CONTRACT" "artifacts.requiredDirectories")
}

install_hook_assets() {
  pi_install_hook_assets "$PWD" "$ASSETS_HOOKS_DIR" "apply"
}

ensure_task_sync_package_script() {
  pi_ensure_task_sync "$PWD" "1" "apply"
}

# ===== IMMUTABLE LAYER (资产层) =====
mkdir -p interfaces/modules
mkdir -p tests/unit
mkdir -p tests/integration
mkdir -p tests/e2e

# ===== MUTABLE LAYER (厕纸层) =====
mkdir -p src/modules

# ===== SUPPORTING (支撑层) =====
mkdir -p docs/reference-configs
if pi_should_generate_full_docs; then
  mkdir -p docs/architecture
  mkdir -p docs/api
  mkdir -p docs/guides
  mkdir -p docs/archives
fi
mkdir -p .ai/hooks
mkdir -p .ai/context
mkdir -p .ai/harness/checks
mkdir -p .ai/harness/handoff
mkdir -p .ai/harness/failures
mkdir -p .ai/harness/security
mkdir -p .ai/harness/runs
mkdir -p deploy/env
mkdir -p deploy/scripts
mkdir -p deploy/submissions
mkdir -p deploy/runbooks
mkdir -p deploy/release-checklists
mkdir -p deploy/sql
mkdir -p _ops/env
mkdir -p _ops/secrets
mkdir -p _ops/artifacts
mkdir -p _ops/logs
mkdir -p _ops/state
mkdir -p _ops/scratch
mkdir -p artifacts
create_contract_directories

# ===== Initial Files =====
touch docs/CHANGELOG.md
if pi_should_generate_full_docs; then
  touch docs/brief.md
  touch docs/tech-stack.md
  touch docs/decisions.md
fi

cat > tasks/todos.md << 'TASK_TODO_EOF'
# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: (initial)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| (none) | No deferred medium/long-term goal recorded yet. | Keep the first sprint bounded. | Add a row when a real follow-up is postponed. |
TASK_TODO_EOF

cat > tasks/current.md << 'TASK_CURRENT_EOF'
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
TASK_CURRENT_EOF

cat > tasks/lessons.md << 'TASK_LESSONS_EOF'
# Lessons Learned (Self-Improvement Loop)

> Capture correction-derived prevention rules here.
> Promote repeated patterns into durable project rules during spa day.

## Template
- Date:
- Triggered by correction:
- Mistake pattern:
- Prevention rule:
- Where to apply next time:
TASK_LESSONS_EOF

mkdir -p docs/researches
cat > docs/researches/README.md << 'RESEARCH_README_EOF'
# Research Reports

Durable research reports live in this directory as topic-scoped Markdown files.

Use `YYYYMMDD-topic.md` names when chronology matters, or `<topic>.md` for
stable subject reports. Keep task-local implementation decisions in
`tasks/notes/`, and keep repeated correction-derived rules in `tasks/lessons.md`.
RESEARCH_README_EOF

write_templates
install_workflow_helpers
install_workflow_contract
install_hook_assets
if pi_should_enable_factor_factory "$(pi_plan_type)"; then
  pi_install_factor_factory "$PWD" "$ASSETS_FACTOR_FACTORY_DIR" "$SCRIPT_DIR" "apply"
fi
ensure_task_sync_package_script
write_runtime_gitignore_block

pi_install_hook_adapters "$PWD" "$ASSETS_HOOKS_DIR" "apply"
pi_print_codex_hook_trust_notice

cat > docs/spec.md << 'DOCS_SPEC_EOF'
# Product Spec

> **Status**: Draft
> **Owner**: Planner
DOCS_SPEC_EOF
# Canonical harness state surface:
# - .ai/context/context-map.json
# - .ai/harness/policy.json
# - .ai/harness/brain-manifest.json
# - .ai/harness/checks/latest.json
# - .ai/harness/events.jsonl
# - .ai/harness/architecture/events.jsonl
# - .ai/harness/handoff/current.md
# - .ai/harness/handoff/resume.md
# - .ai/harness/failures/latest.jsonl
# - .ai/harness/security/.gitkeep
# - .ai/harness/worktrees/.gitkeep
# - .ai/harness/runs/.gitkeep
pi_ensure_harness_state_surface "$PWD" "apply"

cat > interfaces/types.ts << 'INTERFACES_TYPES_EOF'
/**
 * Shared Runtime Interface Definitions
 *
 * IMMUTABLE: Changes here require downstream rewrites
 */

// Add shared API schemas, event schemas, DTOs, or boundary types here
export {}
INTERFACES_TYPES_EOF

cat > tests/README.md << 'TESTS_README_EOF'
# Test Directory Structure

> **Test is the new Spec. 测试是唯一的真理。**

## Asset Hierarchy

Tests are IMMUTABLE ASSETS. Implementation is DISPOSABLE.

## Rules

- Test code quantity ≥ Implementation code quantity
- Test failure = Delete module and rewrite
- Never modify tests to make buggy code pass

## Running Tests

```bash
bun test              # Run all tests
bun test --coverage   # With coverage
bun test --watch      # Watch mode
```
TESTS_README_EOF

if [[ -d "$ASSETS_REF_DIR" ]]; then
  pi_install_reference_configs "$PWD" "$ASSETS_REF_DIR" "apply"
else
  pi_write_reference_config_stub "docs/reference-configs/agentic-development-flow.md" "agentic-development-flow.md" "$SCRIPT_DIR/../assets/reference-configs"
  pi_write_reference_config_stub "docs/reference-configs/external-tooling.md" "external-tooling.md" "$SCRIPT_DIR/../assets/reference-configs"
fi

touch deploy/env/.gitkeep
touch deploy/scripts/.gitkeep
touch deploy/submissions/.gitkeep
touch deploy/runbooks/.gitkeep
touch deploy/release-checklists/.gitkeep
touch deploy/sql/.gitkeep
cat > deploy/README.md << 'DEPLOY_README_EOF'
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

echo "Project directory structure created successfully."
