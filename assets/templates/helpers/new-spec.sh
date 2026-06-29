#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  cd "$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
else
  cd "$SCRIPT_DIR/.."
fi

mkdir -p docs .claude/templates

template_file=".claude/templates/spec.template.md"
if [[ ! -f "$template_file" ]]; then
  cat > "$template_file" <<'SPEC_TEMPLATE_EOF'
# Product Spec: {{PROJECT_NAME}}

> **Status**: Draft
> **Last Updated**: {{TIMESTAMP}}
> **Owner**: Planner

## Product Outcome

Describe the stable user or operator outcome this repo should deliver.

## Success Criteria

- Primary workflow:
- Quality bar:
- Out of scope:

## Constraints

- Technical:
- Compliance:
- Delivery:
SPEC_TEMPLATE_EOF
fi

project_name="$(basename "$PWD")"
timestamp="$(date '+%Y-%m-%d %H:%M')"

sed \
  -e "s/{{PROJECT_NAME}}/${project_name}/g" \
  -e "s/{{TIMESTAMP}}/${timestamp}/g" \
  "$template_file" > docs/spec.md

echo "Created docs/spec.md"
