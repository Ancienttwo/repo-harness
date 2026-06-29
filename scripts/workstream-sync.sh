#!/bin/bash
set -euo pipefail

# Contract invariant: durable capability ledgers live under tasks/workstreams.

usage() {
  cat <<'USAGE_EOF'
Usage:
  repo-harness run workstream-sync ensure --block <capability-prefix> [--slug <slug>] [--title <title>] [--plan <plan-file>] [--slice <todo-id>] [--request <architecture-request>]
USAGE_EOF
}

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
repo="$(cd "$repo" && pwd)"
cd "$repo"
helper_dir="$(cd "$(dirname "${REPO_HARNESS_HELPER_SOURCE_PATH:-$0}")" && pwd)"

command_name="${1:-ensure}"
shift || true

functional_block=""
slug=""
title=""
source_plan="(none)"
current_slice="todo-01"
request_file="(none)"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

json_get() {
  local json_input="$1"
  local key="$2"
  local parsed=""

  if [[ -z "$json_input" ]]; then
    return 1
  fi

  if command -v jq >/dev/null 2>&1; then
    parsed="$(printf '%s' "$json_input" | jq -r ".$key // empty" 2>/dev/null || true)"
  fi

  if [[ -z "$parsed" ]] && command -v node >/dev/null 2>&1; then
    parsed="$(JSON_INPUT="$json_input" JSON_KEY="$key" node -e '
const raw = process.env.JSON_INPUT || "";
const key = process.env.JSON_KEY || "";
try {
  const value = JSON.parse(raw)[key];
  if (value === undefined || value === null) process.exit(1);
  process.stdout.write(String(value));
} catch {
  process.exit(1);
}
' 2>/dev/null || true)"
  fi

  [[ -n "$parsed" ]] || return 1
  printf '%s' "$parsed"
}

safe_token() {
  local value="$1"
  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  printf '%s' "${value:-workstream}"
}

validate_block() {
  local block="$1"
  case "$block" in
    ""|.|..|../*|*/../*|/*|*$'\n'*|*$'\r'*)
      return 1
      ;;
  esac
  [[ -e "$block" ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --block)
      [[ -n "${2:-}" ]] || { echo "workstream-sync: --block requires a value" >&2; exit 2; }
      functional_block="${2#./}"
      functional_block="${functional_block%/}"
      shift 2
      ;;
    --slug)
      [[ -n "${2:-}" ]] || { echo "workstream-sync: --slug requires a value" >&2; exit 2; }
      slug="$(safe_token "$2")"
      shift 2
      ;;
    --title)
      [[ -n "${2:-}" ]] || { echo "workstream-sync: --title requires a value" >&2; exit 2; }
      title="$2"
      shift 2
      ;;
    --plan)
      [[ -n "${2:-}" ]] || { echo "workstream-sync: --plan requires a value" >&2; exit 2; }
      source_plan="$2"
      shift 2
      ;;
    --slice)
      [[ -n "${2:-}" ]] || { echo "workstream-sync: --slice requires a value" >&2; exit 2; }
      current_slice="$2"
      shift 2
      ;;
    --request)
      [[ -n "${2:-}" ]] || { echo "workstream-sync: --request requires a value" >&2; exit 2; }
      request_file="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "workstream-sync: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ "$command_name" != "ensure" ]]; then
  echo "workstream-sync: unknown command: $command_name" >&2
  usage
  exit 2
fi

if ! validate_block "$functional_block"; then
  echo "workstream-sync: --block must be an existing repo-relative capability prefix" >&2
  exit 2
fi

if [[ ! -f "scripts/capability-resolver.ts" ]] || ! command -v bun >/dev/null 2>&1; then
  echo "workstream-sync: scripts/capability-resolver.ts and bun are required" >&2
  exit 2
fi

if ! resolver_json="$(bun scripts/capability-resolver.ts match --path "$functional_block" --format json 2>&1)"; then
  echo "$resolver_json" >&2
  exit 1
fi

if [[ "$(json_get "$resolver_json" "matched" || true)" != "true" ]]; then
  echo "workstream-sync: --block must match a declared capability prefix in .ai/context/capabilities.json" >&2
  exit 2
fi

capability_id="$(json_get "$resolver_json" "capability_id")"
matched_prefix="$(json_get "$resolver_json" "matched_prefix")"
architecture_domain="$(json_get "$resolver_json" "architecture_domain")"
architecture_capability="$(json_get "$resolver_json" "architecture_capability")"
architecture_module="$(json_get "$resolver_json" "architecture_module")"
workstream_dir="$(json_get "$resolver_json" "workstream_dir")"
contract_agents="$(json_get "$resolver_json" "contract_agents" || true)"
contract_claude="$(json_get "$resolver_json" "contract_claude" || true)"

if [[ -z "$slug" ]]; then
  if [[ -n "$title" ]]; then
    slug="$(safe_token "$title")"
  else
    slug="$(date '+%Y%m%d')-${architecture_capability}"
  fi
fi
title="${title:-$slug}"
workstream_file="${workstream_dir}/${slug}.md"
event_file=".ai/harness/events.jsonl"
iso_timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
architecture_domain_file="docs/architecture/domains/${architecture_domain}.md"

mkdir -p "$workstream_dir" "$(dirname "$architecture_module")" "$(dirname "$architecture_domain_file")" ".ai/harness"

if [[ ! -f "$architecture_domain_file" ]]; then
  cat > "$architecture_domain_file" <<EOF_DOMAIN
# Architecture Domain: ${architecture_domain}

> **Source**: \`.ai/context/capabilities.json\`

## Capabilities

- \`${capability_id}\` -> \`${architecture_module}\`
EOF_DOMAIN
elif ! grep -Fq "$architecture_module" "$architecture_domain_file"; then
  {
    echo ""
    echo "- \`${capability_id}\` -> \`${architecture_module}\`"
  } >> "$architecture_domain_file"
fi

if [[ ! -f "$architecture_module" ]]; then
  cat > "$architecture_module" <<EOF_MODULE
# Architecture Module: ${architecture_domain}/${architecture_capability}

> **Capability ID**: \`${capability_id}\`
> **Functional Block**: \`${functional_block}\`
> **Matched Prefix**: \`${matched_prefix}\`
> **Domain**: \`${architecture_domain}\`
> **Capability**: \`${architecture_capability}\`

## Boundary

- Responsibility: Keep the capability boundary, entrypoints, runtime path, dependency rules, and local verification pointers for \`${capability_id}\`.
- Entrypoints: \`${matched_prefix}\`
- Runtime path: \`${matched_prefix}\`
- Local contracts: \`${contract_agents:-none}\`, \`${contract_claude:-none}\`

## Active Workstreams

- \`${workstream_file}\`
EOF_MODULE
elif ! grep -Fq "$workstream_file" "$architecture_module"; then
  {
    echo ""
    echo "- \`${workstream_file}\`"
  } >> "$architecture_module"
fi

if [[ ! -f "$workstream_file" ]]; then
  cat > "$workstream_file" <<EOF_WORKSTREAM
# Workstream: ${title}

> **Status**: active
> **Capability ID**: \`${capability_id}\`
> **Functional Block**: \`${functional_block}\`
> **Matched Prefix**: \`${matched_prefix}\`
> **Architecture Domain**: \`${architecture_domain}\`
> **Architecture Capability**: \`${architecture_capability}\`
> **Architecture Module**: \`${architecture_module}\`
> **Source Plan**: ${source_plan}
> **Current Slice**: ${current_slice}
> **Last Handoff**: \`.ai/harness/handoff/current.md\`
> **Architecture Request**: ${request_file}

## Purpose

Track durable multi-session progress for \`${capability_id}\` without inflating local agent instructions.

## TODOs

- [ ] ${current_slice}: Complete the current executable slice for \`${capability_id}\`.

## Notes

- Project the current slice into \`tasks/todos.md\` for a single session.
- Keep architecture facts in \`${architecture_module}\`; keep execution progress here.
EOF_WORKSTREAM
fi

event_json="{\"ts\":\"$(json_escape "$iso_timestamp")\",\"file_path\":\"$(json_escape "$workstream_file")\",\"severity\":\"medium\",\"functional_block\":\"$(json_escape "$functional_block")\",\"capability_id\":\"$(json_escape "$capability_id")\",\"matched_prefix\":\"$(json_escape "$matched_prefix")\",\"architecture_domain\":\"$(json_escape "$architecture_domain")\",\"architecture_capability\":\"$(json_escape "$architecture_capability")\",\"architecture_module\":\"$(json_escape "$architecture_module")\",\"workstream_dir\":\"$(json_escape "$workstream_dir")\",\"contract_agents\":\"$(json_escape "$contract_agents")\",\"contract_claude\":\"$(json_escape "$contract_claude")\",\"active_workstream\":\"$(json_escape "$workstream_file")\",\"change_type\":\"workstream-sync\",\"spawn_recommended\":false,\"contract_sync_required\":true,\"request_file\":\"$(json_escape "$request_file")\"}"
printf '%s\n' "$event_json" >> "$event_file"

if [[ -f "$helper_dir/context-contract-sync.sh" ]]; then
  bash "$helper_dir/context-contract-sync.sh" sync-event --json "$event_json"
fi

echo "[WorkstreamSync] Ensured $workstream_file for $capability_id."
