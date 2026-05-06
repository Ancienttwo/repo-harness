#!/bin/bash
# Create standard project directory structure
# Usage: bash scripts/create-project-dirs.sh
#
# Creates the three-layer project structure:
#   IMMUTABLE LAYER (资产层): specs, contracts, tests
#   MUTABLE LAYER (厕纸层): src
#   SUPPORTING (支撑层): docs, scripts, .ops, artifacts, tasks, plans

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
  mkdir -p .ai/hooks .claude/hooks

  if [[ -d "$ASSETS_HOOKS_DIR" ]]; then
    find "$ASSETS_HOOKS_DIR" -mindepth 1 -maxdepth 1 \( -type f -name '*.sh' -o -type d -name 'lib' \) | while read -r asset; do
      if [[ -d "$asset" ]]; then
        cp -R "$asset" .ai/hooks/
      else
        cp "$asset" .ai/hooks/
      fi
    done

    find "$ASSETS_HOOKS_DIR" -mindepth 1 -maxdepth 1 -type f -name '*.sh' | while read -r asset; do
      hook_name="$(basename "$asset")"
      if [[ "$hook_name" == "hook-input.sh" ]]; then
        continue
      fi

      cat > ".claude/hooks/$hook_name" <<EOF_HOOK_SHIM
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="\${HOOK_REPO_ROOT:-\$(cd "\$SCRIPT_DIR/../.." && pwd)}"
TARGET="\$REPO_ROOT/.ai/hooks/$hook_name"

if [[ ! -f "\$TARGET" ]]; then
  echo "[HookShim] Shared hook not found: \$TARGET" >&2
  exit 1
fi

export HOOK_REPO_ROOT="\$REPO_ROOT"
exec bash "\$TARGET" "\$@"
EOF_HOOK_SHIM
    done
  fi

  find .ai/hooks -type f -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
  find .claude/hooks -type f -name '*.sh' -exec chmod +x {} + 2>/dev/null || true
}

ensure_task_sync_package_script() {
  pi_ensure_task_sync "$PWD" "1" "apply"
}

# ===== IMMUTABLE LAYER (资产层) =====
mkdir -p specs/modules
mkdir -p contracts/modules
mkdir -p tests/unit
mkdir -p tests/integration
mkdir -p tests/e2e

# ===== MUTABLE LAYER (厕纸层) =====
mkdir -p src/modules

# ===== SUPPORTING (支撑层) =====
mkdir -p docs/architecture
mkdir -p docs/api
mkdir -p docs/guides
mkdir -p docs/archives
mkdir -p docs/reference-configs
mkdir -p scripts
mkdir -p .claude/hooks
mkdir -p .ai/hooks
mkdir -p .ai/context
mkdir -p .ai/harness/checks
mkdir -p .ai/harness/handoff
mkdir -p .ai/harness/context-budget
mkdir -p .ai/harness/failures
mkdir -p .ai/harness/runs
mkdir -p .ops/database
mkdir -p .ops/secrets
mkdir -p artifacts
create_contract_directories

# ===== Initial Files =====
touch docs/CHANGELOG.md
touch docs/brief.md
touch docs/tech-stack.md
touch docs/decisions.md

touch docs/reference-configs/changelog-versioning.md
touch docs/reference-configs/git-strategy.md
touch docs/reference-configs/release-deploy.md
touch docs/reference-configs/ai-workflows.md
touch docs/reference-configs/coding-standards.md
touch docs/reference-configs/development-protocol.md
touch docs/reference-configs/external-tooling.md
touch docs/reference-configs/workflow-orchestration.md

cat > docs/PROGRESS.md << 'PROGRESS_EOF'
# Project Milestones

> Use this file for milestone checkpoints only.
> Active execution belongs in `tasks/todo.md`, `tasks/contracts/`, `tasks/reviews/`, and `.ai/harness/handoff/current.md`.

## Current Milestone

- Name: Initial delivery
- Status: In progress
- Success state: Ship the first project milestone with passing sprint verification.

## Completed Milestones

- [x] Repository scaffolded

## Next Milestone / Blockers

- [ ] First feature milestone shipped
- [ ] Record the blocker or dependency that gates the next milestone.

## Milestone Notes

- Record releases, migrations, and major checkpoints here.
PROGRESS_EOF

cat > tasks/todo.md << 'TASK_TODO_EOF'
# Task Execution Checklist (Primary)

> **Source Plan**: (none)
> **Status**: Idle
> Generate the next execution checklist from an approved plan with:
>   bash scripts/plan-to-todo.sh --plan plans/plan-YYYYMMDD-HHMM-slug.md

## Execution
- [ ] No active execution checklist
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

cp "$ASSETS_HOOKS_DIR/settings.template.json" .claude/settings.json

cat > docs/spec.md << 'DOCS_SPEC_EOF'
# Product Spec

> **Status**: Draft
> **Owner**: Planner
DOCS_SPEC_EOF
# Canonical harness state surface:
# - .ai/context/context-map.json
# - .ai/harness/policy.json
# - .ai/harness/checks/latest.json
# - .ai/harness/events.jsonl
# - .ai/harness/handoff/current.md
# - .ai/harness/handoff/resume.md
# - .ai/harness/context-budget/latest.json
# - .ai/harness/failures/latest.jsonl
# - .ai/harness/runs/.gitkeep
pi_ensure_harness_state_surface "$PWD" "apply"

cat > specs/overview.md << 'SPECS_OVERVIEW_EOF'
# Project Specifications

> **Spec is the Source of Truth. 规格是唯一真理的来源。**

## How to Use

1. Write spec first, then implement
2. Changing spec = rewrite downstream
3. No implementation without spec

## Modules

- Add module specs in `modules/` directory
- Format: `{module-name}.spec.md`
SPECS_OVERVIEW_EOF

cat > contracts/types.ts << 'CONTRACTS_TYPES_EOF'
/**
 * Shared Type Definitions
 *
 * IMMUTABLE: Changes here require downstream rewrites
 */

// Add shared types here
export {}
CONTRACTS_TYPES_EOF

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
  cp "$ASSETS_REF_DIR"/*.md docs/reference-configs/
else
  cat > docs/reference-configs/changelog-versioning.md << 'REF_CHANGELOG_EOF'
# Changelog & Versioning Reference

Use this file for detailed release-note and semantic-versioning rules.
REF_CHANGELOG_EOF

  cat > docs/reference-configs/git-strategy.md << 'REF_GIT_EOF'
# Git Strategy Reference

Use this file for branch model and commit convention details.
REF_GIT_EOF

  cat > docs/reference-configs/release-deploy.md << 'REF_RELEASE_EOF'
# Release & Deployment Reference

Use this file for release pipeline and deployment trigger details.
REF_RELEASE_EOF

  cat > docs/reference-configs/ai-workflows.md << 'REF_AIWF_EOF'
# AI Workflows Reference

Use this file for extended AI workflow templates, tasks-first session handoff, and milestone-only progress guidance.
REF_AIWF_EOF

  cat > docs/reference-configs/coding-standards.md << 'REF_CODING_STANDARDS_EOF'
# Coding Standards Reference

Use this file for detailed coding constraints and refactor thresholds.
REF_CODING_STANDARDS_EOF

  cat > docs/reference-configs/development-protocol.md << 'REF_DEV_PROTOCOL_EOF'
# Development Protocol Reference

Use this file for detailed feature/bug flow playbooks, repo-local task sync rules, and final response requirements.
REF_DEV_PROTOCOL_EOF

  cat > docs/reference-configs/external-tooling.md << 'REF_EXTERNAL_TOOLING_EOF'
# External Tooling Reference

Use this file for external tool routing, install commands, update commands, and gbrain MCP guidance.
REF_EXTERNAL_TOOLING_EOF

  cat > docs/reference-configs/workflow-orchestration.md << 'REF_WORKFLOW_ORCH_EOF'
# Workflow Orchestration Reference

Use this file for advanced plan/execution orchestration patterns.
REF_WORKFLOW_ORCH_EOF

  cat > docs/reference-configs/spa-day-protocol.md << 'SPA_DAY_EOF'
# Spa Day Protocol

Periodic cleanup protocol to reduce context bloat and rule conflicts.
SPA_DAY_EOF
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
echo "  - specs/modules/$MODULE.spec.md"
echo "  - contracts/modules/$MODULE.contract.ts"
echo "  - tests/unit/$MODULE/"
echo "  - tests/integration/$MODULE/"
REGENERATE_EOF
chmod +x scripts/regenerate.sh

touch .ops/.gitkeep
echo "# This folder contains sensitive operations files - DO NOT COMMIT" > .ops/README.md

echo "Project directory structure created successfully."
