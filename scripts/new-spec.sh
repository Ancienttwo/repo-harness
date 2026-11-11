#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -n "${REPO_HARNESS_TARGET_REPO_ROOT:-}" ]]; then
  cd "$REPO_HARNESS_TARGET_REPO_ROOT"
elif REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
else
  cd "$SCRIPT_DIR/.."
fi

mkdir -p docs

# A repository template at the old copy path is the repository's own; otherwise use the package template.
template_file=".claude/templates/spec.template.md"
if [[ ! -f "$template_file" ]]; then
  template_file="$PACKAGE_ROOT/assets/templates/spec.template.md"
fi

project_name="$(basename "$PWD")"
timestamp="$(date '+%Y-%m-%d %H:%M')"

sed \
  -e "s/{{PROJECT_NAME}}/${project_name}/g" \
  -e "s/{{TIMESTAMP}}/${timestamp}/g" \
  "$template_file" > docs/spec.md

echo "Created docs/spec.md"
