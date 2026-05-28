#!/bin/bash
# Create standard project directory structure
# Usage: bash scripts/create-project-dirs.sh
#
# Creates the three-layer project structure:
#   IMMUTABLE LAYER (资产层): specs, contracts, tests
#   MUTABLE LAYER (厕纸层): src
#   SUPPORTING (支撑层): docs, scripts, deploy, _ops, artifacts, tasks, plans

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
  if pi_should_enable_factor_factory "${PROJECT_INITIALIZER_PLAN_TYPE:-}"; then
    extra_entries="$(pi_factor_factory_gitignore_entries)"
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
  mkdir -p .ai/hooks .codex

  if [[ -d "$ASSETS_HOOKS_DIR" ]]; then
    find "$ASSETS_HOOKS_DIR" -mindepth 1 -maxdepth 1 \( -type f -name '*.sh' -o -type d -name 'lib' \) | while read -r asset; do
      if [[ -d "$asset" ]]; then
        cp -R "$asset" .ai/hooks/
      else
        cp "$asset" .ai/hooks/
      fi
    done
  fi

  find .ai/hooks -type f -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
  if [[ -f "$ASSETS_HOOKS_DIR/codex.hooks.template.json" ]]; then
    cp "$ASSETS_HOOKS_DIR/codex.hooks.template.json" .codex/hooks.json
  fi
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
mkdir -p scripts
mkdir -p .ai/hooks
mkdir -p .ai/context
mkdir -p .codex
mkdir -p .ai/harness/checks
mkdir -p .ai/harness/handoff
mkdir -p .ai/harness/context-budget
mkdir -p .ai/harness/failures
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

cat > tasks/todo.md << 'TASK_TODO_EOF'
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

cat > tasks/research.md << 'TASK_RESEARCH_EOF'
# Project Research Notes

> **Last Updated**: TBD
> **Scope**: (what area of the codebase was researched)
> **Usage**: Store deep codebase findings and hidden contracts here, not in chat-only summaries.

## Codebase Map
| File | Purpose | Key Exports |
|------|---------|-------------|

## Architecture Observations
### Patterns & Conventions
### Implicit Contracts
### Edge Cases & Intricacies

## Technical Debt / Risks

## Research Conclusions
### What to Preserve
### What to Change
### Open Questions
TASK_RESEARCH_EOF

write_templates
install_workflow_helpers
install_workflow_contract
install_hook_assets
if pi_should_enable_factor_factory "${PROJECT_INITIALIZER_PLAN_TYPE:-}"; then
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
# - .ai/harness/context-budget/latest.json
# - .ai/harness/failures/latest.jsonl
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
  cat > docs/reference-configs/agentic-development-flow.md << 'REF_AGENTIC_FLOW_EOF'
# Agentic Development Flow

Use this file for gstack/Waza routing, P1/P2/P3 reporting triggers, and daily agentic development flow.
REF_AGENTIC_FLOW_EOF

  cat > docs/reference-configs/external-tooling.md << 'REF_EXTERNAL_TOOLING_EOF'
# External Tooling Reference

Use this file for external tool routing, install commands, update commands, and gbrain MCP guidance.
REF_EXTERNAL_TOOLING_EOF
fi

cat > scripts/regenerate.sh << 'REGENERATE_EOF'
#!/bin/bash
# Regenerate a module: delete implementation, keep spec/contract/tests
# Usage: ./scripts/regenerate.sh <module-name>

MODULE=$1

if [ -z "$MODULE" ]; then
  echo "Usage: ./scripts/regenerate.sh <module-name>"
  echo "Example: ./scripts/regenerate.sh auth"
  exit 1
fi

if [ ! -d "src/modules/$MODULE" ]; then
  echo "Module src/modules/$MODULE not found"
  exit 1
fi

echo "Deleting implementation: src/modules/$MODULE"
rm -rf "src/modules/$MODULE"
mkdir -p "src/modules/$MODULE"

echo "Module $MODULE cleared. Ready for rewrite."
echo ""
echo "Preserved assets:"
echo "  - docs/spec.md"
echo "  - interfaces/modules/$MODULE.interface.ts"
echo "  - tests/unit/$MODULE/"
echo "  - tests/integration/$MODULE/"
REGENERATE_EOF
chmod +x scripts/regenerate.sh

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
