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

# Reads .ai/harness/policy.json#context.capability_source with the JSON parser
# of an available runtime. A missing policy or field means "registry".
capability_source() {
  local policy_file="$repo/.ai/harness/policy.json" runtime=""
  if [[ ! -f "$policy_file" ]]; then
    echo registry
    return 0
  fi
  if command -v bun >/dev/null 2>&1; then
    runtime=bun
  elif command -v node >/dev/null 2>&1; then
    runtime=node
  else
    echo "select-agent-context-blocks: bun or node is required to read .ai/harness/policy.json" >&2
    return 1
  fi
  POLICY_FILE="$policy_file" "$runtime" -e '
const fs = require("fs");
const policy = JSON.parse(fs.readFileSync(process.env.POLICY_FILE, "utf8"));
const context = policy && policy.context;
console.log(context && Object.prototype.hasOwnProperty.call(context, "capability_source") ? String(context.capability_source) : "registry");
'
}

if ! source_mode="$(capability_source)"; then
  echo "select-agent-context-blocks: cannot read .ai/harness/policy.json#context.capability_source" >&2
  exit 1
fi
# Only the two capability sources exist. Any other value fails closed instead
# of reaching the registry or directory-discovery path.
case "$source_mode" in
  registry|archcontext) ;;
  *)
    echo "select-agent-context-blocks: unknown capability_source \"$source_mode\"; .ai/harness/policy.json#context.capability_source must be registry or archcontext" >&2
    exit 1
    ;;
esac

# The packaged sibling resolver comes first, then a repo-local copy.
archcontext_resolver() {
  if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
        && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "$0")" ]]; then
    local sibling
    sibling="$(dirname "$REPO_HARNESS_HELPER_SOURCE_PATH")/capability-resolver.ts"
    if [[ -f "$sibling" ]]; then
      printf '%s\n' "$sibling"
      return 0
    fi
  fi
  if [[ -f "$repo/scripts/capability-resolver.ts" ]]; then
    printf '%s\n' "$repo/scripts/capability-resolver.ts"
    return 0
  fi
  return 1
}

# Under archcontext the resolver is the only authority. Its error is the result:
# there is no fallback to the retired JSON registry or to directory discovery.
if [[ "$source_mode" == "archcontext" ]]; then
  if ! command -v bun >/dev/null 2>&1 || ! resolver="$(archcontext_resolver)"; then
    echo "select-agent-context-blocks: capability_source \"archcontext\" needs bun and capability-resolver.ts" >&2
    exit 1
  fi
  if ! resolver_prefixes="$(cd "$repo" && bun "$resolver" list --format prefixes)"; then
    exit 1
  fi
  printf '%s\n' "$resolver_prefixes" | emit_existing_dirs
  exit 0
fi

# Registry mode: the resolver reads the JSON registry. The direct JSON read
# below stays as the no-Bun path for registry-mode repos only.
if command -v bun >/dev/null 2>&1 && [[ -f "$repo/scripts/capability-resolver.ts" ]]; then
  resolver_prefixes="$(cd "$repo" && bun scripts/capability-resolver.ts list --format prefixes 2>/dev/null || true)"
  if [[ -n "$resolver_prefixes" ]]; then
    printf '%s\n' "$resolver_prefixes" | emit_existing_dirs
    exit 0
  fi
fi

if [[ -f "$registry_file" ]]; then
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
