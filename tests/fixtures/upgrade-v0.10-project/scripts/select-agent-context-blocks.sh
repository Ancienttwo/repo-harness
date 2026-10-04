#!/bin/bash
set -euo pipefail

repo="${1:-.}"
repo="$(cd "$repo" && pwd)"
config_file="${REPO_HARNESS_CONTEXT_BLOCKS_FILE:-$repo/.ai/context/agent-context-blocks.txt}"
registry_file="$repo/.ai/context/capabilities.json"

emit_lines() {
  sed -e 's/#.*$//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | sed '/^$/d'
}

emit_existing_dirs() {
  while IFS= read -r rel_dir; do
    rel_dir="${rel_dir#./}"
    rel_dir="${rel_dir%/}"
    [[ -z "$rel_dir" || "$rel_dir" == "." ]] && continue
    case "$rel_dir" in
      /*|../*|*/../*|*\"*)
        continue
        ;;
    esac
    [[ -d "$repo/$rel_dir" ]] || continue
    printf '%s\n' "$rel_dir"
  done | sort -u
}

if [[ -f "$registry_file" ]]; then
  if command -v bun >/dev/null 2>&1 && [[ -f "$repo/scripts/capability-resolver.ts" ]]; then
    (cd "$repo" && bun scripts/capability-resolver.ts list --format prefixes 2>/dev/null || true) | emit_existing_dirs
    exit 0
  fi

  if command -v node >/dev/null 2>&1; then
    node - "$registry_file" <<'JS_EOF' | emit_existing_dirs
const fs = require("fs");
const registry = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
for (const capability of registry.capabilities || []) {
  for (const prefix of capability.prefixes || []) {
    console.log(prefix);
  }
}
JS_EOF
    exit 0
  fi
fi

context_blocks="${REPO_HARNESS_CONTEXT_BLOCKS:-}"
if [[ -n "$context_blocks" ]]; then
  printf '%s\n' "$context_blocks" | tr ',:' '\n' | emit_lines | emit_existing_dirs
  exit 0
fi

if [[ -f "$config_file" ]]; then
  emit_lines < "$config_file" | emit_existing_dirs
  exit 0
fi

find "$repo" \
  \( -path "$repo/.git" -o -path "$repo/node_modules" -o -path "$repo/.ai" -o -path "$repo/.claude" -o -path "$repo/_ref" -o -path "$repo/_ops" -o -path "$repo/.worktrees" \) -prune -o \
  \( -type f \( -name 'CLAUDE.md' -o -name 'AGENTS.md' \) \) -print 2>/dev/null | while IFS= read -r context_file; do
    context_dir="$(dirname "$context_file")"
    rel_dir="${context_dir#$repo/}"
    [[ "$rel_dir" == "$context_dir" || "$rel_dir" == "." ]] && continue
    printf '%s\n' "$rel_dir"
  done | sort -u
