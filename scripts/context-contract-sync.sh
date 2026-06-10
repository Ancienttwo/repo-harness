#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage:
  scripts/context-contract-sync.sh sync-latest
  scripts/context-contract-sync.sh sync-event --json '<event-json>'
USAGE_EOF
}

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
repo="$(cd "$repo" && pwd)"
cd "$repo"

command_name="${1:-sync-latest}"
shift || true

event_json=""
event_file=".ai/harness/architecture/events.jsonl"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      [[ -n "${2:-}" ]] || { echo "context-contract-sync: --json requires a value" >&2; exit 2; }
      event_json="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "context-contract-sync: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

architecture_event() {
  if command -v bun >/dev/null 2>&1 && [[ -f "scripts/architecture-event.ts" ]]; then
    bun scripts/architecture-event.ts "$@"
    return $?
  fi
  return 127
}

json_get() {
  local json_input="$1"
  local key="$2"
  local parsed=""

  if [[ -z "$json_input" ]]; then
    return 1
  fi

  if parsed="$(architecture_event json-get --key "$key" --json "$json_input" 2>/dev/null)"; then
    printf '%s' "$parsed"
    return 0
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

  if [[ -z "$parsed" ]] && command -v bun >/dev/null 2>&1; then
    parsed="$(JSON_INPUT="$json_input" JSON_KEY="$key" bun -e '
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
  local parsed=""

  if parsed="$(architecture_event safe-token --value "$value" 2>/dev/null)"; then
    printf '%s' "$parsed"
    return 0
  fi

  value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
  value="$(printf '%s' "$value" | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  printf '%s' "${value:-root}"
}

derive_scope() {
  local block="$1"
  local derived=""
  local block_slug
  local domain_slug
  local capability_slug
  local architecture_module
  local workstream_dir

  if derived="$(architecture_event derive-scope --block "$block" 2>/dev/null)"; then
    printf '%s\n' "$derived"
    return 0
  fi

  block_slug="$(safe_token "$block")"
  domain_slug="$block_slug"
  capability_slug="_domain"

  IFS='/' read -r -a parts <<< "$block"
  if [[ "${#parts[@]}" -ge 2 ]]; then
    domain_slug="$(safe_token "${parts[0]}-${parts[1]}")"
  fi
  if [[ "${#parts[@]}" -gt 2 ]]; then
    local last_index
    last_index=$((${#parts[@]} - 1))
    capability_slug="$(safe_token "${parts[$last_index]}")"
  fi

  architecture_module="docs/architecture/modules/${domain_slug}/${capability_slug}.md"
  workstream_dir="tasks/workstreams/${domain_slug}/${capability_slug}"
  printf '%s\n%s\n%s\n%s\n' "$domain_slug" "$capability_slug" "$architecture_module" "$workstream_dir"
}

metadata_value() {
  local file="$1"
  local label="$2"
  awk -v label="$label" '
    $0 ~ "^> \\*\\*" label "\\*\\*:" {
      sub("^> \\*\\*" label "\\*\\*: ?", "")
      print
      exit
    }
  ' "$file" 2>/dev/null
}

format_active_workstreams() {
  local dir="$1"
  local count=0
  local file
  local status
  local current_slice
  local source_plan

  if [[ ! -d "$dir" ]]; then
    echo "- (none yet)"
    return 0
  fi

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    status="$(metadata_value "$file" "Status")"
    current_slice="$(metadata_value "$file" "Current Slice")"
    source_plan="$(metadata_value "$file" "Source Plan")"
    echo "- \`${file}\`"
    echo "  - status: ${status:-unknown}"
    echo "  - current_slice: ${current_slice:-unknown}"
    echo "  - source_plan: ${source_plan:-unknown}"
    count=$((count + 1))
  done < <(find "$dir" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sort | head -5)

  if [[ "$count" -eq 0 ]]; then
    echo "- (none yet)"
  fi
}

validate_block() {
  local block="$1"
  case "$block" in
    ""|root|.|..|../*|*/../*|/*|*$'\n'*|*$'\r'*)
      return 1
      ;;
  esac
  [[ -e "$block" ]]
}

replace_contract_block() {
  local source_file="$1"
  local output_file="$2"
  local block_file="$3"
  local marker_state begins ends disorder

  # Refuse to rewrite when markers are unbalanced: a missing END would swallow
  # everything after BEGIN, and duplicate markers would duplicate the block.
  marker_state="$(awk '
    /^<!-- BEGIN ARCHITECTURE CONTRACT -->[[:space:]]*$/ { begins++; if (ends > 0) disorder = 1 }
    /^<!-- END ARCHITECTURE CONTRACT -->[[:space:]]*$/   { ends++; if (begins == 0) disorder = 1 }
    END { printf "%d %d %d", begins, ends, disorder }
  ' "$source_file")"
  read -r begins ends disorder <<< "$marker_state"
  if ! { [[ "$begins" -eq 0 && "$ends" -eq 0 ]] || [[ "$begins" -eq 1 && "$ends" -eq 1 && "$disorder" -eq 0 ]]; }; then
    echo "[ContextContractSync] ERROR: unbalanced ARCHITECTURE CONTRACT markers in $source_file (begin=$begins end=$ends); refusing to rewrite. Repair the markers manually, then re-run sync." >&2
    return 1
  fi

  awk -v block_file="$block_file" '
    BEGIN {
      while ((getline line < block_file) > 0) {
        block = block line "\n"
      }
      close(block_file)
      in_block = 0
      replaced = 0
    }
    /^<!-- BEGIN ARCHITECTURE CONTRACT -->[[:space:]]*$/ {
      printf "%s", block
      in_block = 1
      replaced = 1
      next
    }
    /^<!-- END ARCHITECTURE CONTRACT -->[[:space:]]*$/ {
      in_block = 0
      next
    }
    in_block == 0 { print }
    END {
      if (replaced == 0) {
        if (NR > 0) print ""
        printf "%s", block
      }
    }
  ' "$source_file" > "$output_file"
}

sync_context_map() {
  local block="$1"
  local domain_slug="$2"
  local capability_slug="$3"
  local capability_id="${4:-$block}"
  local contract_agents="${5:-$block/AGENTS.md}"
  local contract_claude="${6:-$block/CLAUDE.md}"
  local lsp_profile="${7:-typescript-lsp}"
  local context_map=".ai/context/context-map.json"
  local runtime=""

  if architecture_event sync-context-map \
    --context-map "$context_map" \
    --block "$block" \
    --capability-id "$capability_id" \
    --contract-agents "$contract_agents" \
    --contract-claude "$contract_claude" \
    --architecture-domain "$domain_slug" \
    --architecture-capability "$capability_slug" \
    --lsp-profile "$lsp_profile" 2>/dev/null; then
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    runtime="node"
  elif command -v bun >/dev/null 2>&1; then
    runtime="bun"
  else
    echo "[ContextContractSync] Context map update skipped: node or bun not found."
    return 0
  fi

  mkdir -p "$(dirname "$context_map")"
  if [[ ! -f "$context_map" ]]; then
    cat > "$context_map" <<'CONTEXT_EOF'
{
  "version": 1,
  "profile": "stable-root-progressive-subdir",
  "functional_block_selector": {
    "script": "scripts/select-agent-context-blocks.sh",
    "config_file": ".ai/context/agent-context-blocks.txt",
    "env": "REPO_HARNESS_CONTEXT_BLOCKS",
    "legacy_env": "PROJECT_INITIALIZER_CONTEXT_BLOCKS",
    "rule": "compatibility selector; capability registry is the source of truth"
  },
  "root_context_files": ["CLAUDE.md", "AGENTS.md"],
  "discoverable_contexts": []
}
CONTEXT_EOF
  fi

  CONTEXT_MAP="$context_map" BLOCK_PATH="$block" CAPABILITY_ID="$capability_id" CONTRACT_AGENTS="$contract_agents" CONTRACT_CLAUDE="$contract_claude" ARCH_DOMAIN="$domain_slug" ARCH_CAPABILITY="$capability_slug" LSP_PROFILE="$lsp_profile" "$runtime" <<'JS_EOF'
const fs = require("fs");
const path = process.env.CONTEXT_MAP;
const block = process.env.BLOCK_PATH;
const capabilityId = process.env.CAPABILITY_ID;
const contractAgents = process.env.CONTRACT_AGENTS;
const contractClaude = process.env.CONTRACT_CLAUDE;
const domain = process.env.ARCH_DOMAIN;
const capability = process.env.ARCH_CAPABILITY;
const lspProfile = process.env.LSP_PROFILE || "typescript-lsp";

let data;
try {
  data = JSON.parse(fs.readFileSync(path, "utf8"));
} catch {
  data = {
    version: 1,
    profile: "stable-root-progressive-subdir",
    root_context_files: ["CLAUDE.md", "AGENTS.md"],
    discoverable_contexts: []
  };
}

if (!Array.isArray(data.discoverable_contexts)) data.discoverable_contexts = [];

for (const [fileName, entryPath] of [["CLAUDE.md", contractClaude], ["AGENTS.md", contractAgents]]) {
  const targetAgent = fileName === "CLAUDE.md" ? "claude" : "codex";
  if (!data.discoverable_contexts.some((entry) => entry && entry.path === entryPath)) {
    data.discoverable_contexts.push({
      path: entryPath,
      priority: "high",
      char_budget: 1000,
      purpose: "capability-contract",
      capability_id: capabilityId,
      functional_block: block,
      matched_prefix: block,
      architecture_domain: domain,
      architecture_capability: capability,
      target_agent: targetAgent,
      lsp_profile: lspProfile,
      doc_scope: "capability-contract",
      verification_hint: "record local commands here before implementation"
    });
  }
}

fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
JS_EOF
}

if [[ "$command_name" == "sync-latest" ]]; then
  event_json="$(tail -n 1 "$event_file" 2>/dev/null || true)"
elif [[ "$command_name" != "sync-event" ]]; then
  echo "context-contract-sync: unknown command: $command_name" >&2
  usage
  exit 2
fi

if [[ -z "$event_json" ]]; then
  echo "[ContextContractSync] No architecture event to sync."
  exit 0
fi

functional_block="$(json_get "$event_json" "functional_block" || true)"
capability_id="$(json_get "$event_json" "capability_id" || true)"
matched_prefix="$(json_get "$event_json" "matched_prefix" || true)"
file_path="$(json_get "$event_json" "file_path" || true)"
severity="$(json_get "$event_json" "severity" || true)"
change_type="$(json_get "$event_json" "change_type" || true)"
request_file="$(json_get "$event_json" "request_file" || true)"
event_ts="$(json_get "$event_json" "ts" || true)"
architecture_domain="$(json_get "$event_json" "architecture_domain" || true)"
architecture_capability="$(json_get "$event_json" "architecture_capability" || true)"
architecture_module="$(json_get "$event_json" "architecture_module" || true)"
workstream_dir="$(json_get "$event_json" "workstream_dir" || true)"
contract_agents="$(json_get "$event_json" "contract_agents" || true)"
contract_claude="$(json_get "$event_json" "contract_claude" || true)"
lsp_profile="$(json_get "$event_json" "lsp_profile" || true)"

if [[ ( -z "$capability_id" || "$capability_id" == "root" ) && -n "$file_path" && -f "scripts/capability-resolver.ts" ]] && command -v bun >/dev/null 2>&1; then
  resolver_json="$(bun scripts/capability-resolver.ts match --path "$file_path" --format json 2>/dev/null || true)"
  if [[ -n "$resolver_json" && "$(json_get "$resolver_json" "matched" || true)" == "true" ]]; then
    functional_block="$(json_get "$resolver_json" "functional_block")"
    capability_id="$(json_get "$resolver_json" "capability_id")"
    matched_prefix="$(json_get "$resolver_json" "matched_prefix")"
    architecture_domain="$(json_get "$resolver_json" "architecture_domain")"
    architecture_capability="$(json_get "$resolver_json" "architecture_capability")"
    architecture_module="$(json_get "$resolver_json" "architecture_module")"
    workstream_dir="$(json_get "$resolver_json" "workstream_dir")"
    contract_agents="$(json_get "$resolver_json" "contract_agents" || true)"
    contract_claude="$(json_get "$resolver_json" "contract_claude" || true)"
    lsp_profile="$(json_get "$resolver_json" "lsp_profile" || true)"
  fi
fi

matched_prefix="${matched_prefix:-$functional_block}"
capability_id="${capability_id:-$functional_block}"
contract_agents="${contract_agents:-$functional_block/AGENTS.md}"
contract_claude="${contract_claude:-$functional_block/CLAUDE.md}"
lsp_profile="${lsp_profile:-typescript-lsp}"

if ! validate_block "$functional_block"; then
  echo "[ContextContractSync] Root scope or missing functional block; no local AGENTS/CLAUDE contract updated."
  exit 0
fi

mkdir -p "$(dirname "$contract_agents")" "$(dirname "$contract_claude")"

block_slug="$(safe_token "$functional_block")"
if [[ -z "$architecture_domain" || -z "$architecture_capability" || -z "$architecture_module" || -z "$workstream_dir" ]]; then
  derived_scope="$(derive_scope "$functional_block")"
  architecture_domain="${architecture_domain:-$(printf '%s\n' "$derived_scope" | sed -n '1p')}"
  architecture_capability="${architecture_capability:-$(printf '%s\n' "$derived_scope" | sed -n '2p')}"
  architecture_module="${architecture_module:-$(printf '%s\n' "$derived_scope" | sed -n '3p')}"
  workstream_dir="${workstream_dir:-$(printf '%s\n' "$derived_scope" | sed -n '4p')}"
fi

if architecture_event sync-contract-files \
  --functional-block "$functional_block" \
  --capability-id "$capability_id" \
  --matched-prefix "$matched_prefix" \
  --architecture-domain "$architecture_domain" \
  --architecture-capability "$architecture_capability" \
  --architecture-module "$architecture_module" \
  --workstream-dir "$workstream_dir" \
  --contract-agents "$contract_agents" \
  --contract-claude "$contract_claude" \
  --event-ts "${event_ts:-unknown}" \
  --file-path "${file_path:-unknown}" \
  --severity "${severity:-unknown}" \
  --change-type "${change_type:-unknown}" \
  --request-file "${request_file:-unknown}" \
  --lsp-profile "$lsp_profile" 2>/dev/null; then
  sync_context_map "$functional_block" "$architecture_domain" "$architecture_capability" "$capability_id" "$contract_agents" "$contract_claude" "$lsp_profile"
  echo "[ContextContractSync] Updated $contract_agents and $contract_claude."
  exit 0
fi

latest_snapshot="$({ find docs/architecture/snapshots -type f -name "*${block_slug}*.md" 2>/dev/null || true; } | sort | tail -1)"
latest_human_diagram="$({ find docs/architecture/diagrams -type f -name "*${block_slug}*.html" 2>/dev/null || true; } | sort | tail -1)"
latest_snapshot="${latest_snapshot:-(none yet)}"
latest_human_diagram="${latest_human_diagram:-(none yet)}"
semantic_diagram_source="$architecture_module"
if [[ "$latest_snapshot" != "(none yet)" ]]; then
  semantic_diagram_source="$latest_snapshot"
fi
active_workstreams="$(format_active_workstreams "$workstream_dir")"

block_tmp="$(mktemp)"
cat > "$block_tmp" <<EOF_BLOCK
<!-- BEGIN ARCHITECTURE CONTRACT -->
## Architecture Contract

- Functional block: \`${functional_block}\`
- Capability ID: \`${capability_id}\`
- Matched prefix: \`${matched_prefix}\`
- Architecture domain: \`${architecture_domain}\`
- Architecture capability: \`${architecture_capability}\`
- Architecture module: \`${architecture_module}\`
- Last architecture event: ${event_ts:-unknown}
- Last changed path: \`${file_path:-unknown}\`
- Severity: ${severity:-unknown}
- Change type: ${change_type:-unknown}
- Module responsibility: Keep this block aligned with the local boundary described by surrounding human-owned context.
- Entrypoints: \`${functional_block}\`
- Allowed dependencies: Follow root \`AGENTS.md\` / \`CLAUDE.md\` and this local contract.
- Forbidden dependencies: Do not cross sibling app/service/package boundaries without an architecture snapshot or explicit plan.
- Runtime path: \`${functional_block}\`
- LSP/tooling profile: \`${lsp_profile}\`
- Verification: Use root required checks plus local commands recorded in this capability contract.
- Latest snapshot: \`${latest_snapshot}\`
- Semantic diagram source: \`${semantic_diagram_source}\`
- Latest human diagram: \`${latest_human_diagram}\`
- Pending architecture request: \`${request_file:-unknown}\`

## Active Workstreams

${active_workstreams}

## Current Session Projection

- Durable progress lives under \`${workstream_dir}\`.
- \`tasks/current.md\` is the tracked derived status snapshot; it is not a live lock or task source.
- \`tasks/todo.md\` is the deferred-goal ledger; current execution slices stay in the active plan's \`## Task Breakdown\`.
<!-- END ARCHITECTURE CONTRACT -->
EOF_BLOCK

base_file=""
if [[ -f "$contract_agents" ]]; then
  base_file="$contract_agents"
elif [[ -f "$contract_claude" ]]; then
  base_file="$contract_claude"
else
  base_file="$(mktemp)"
  cat > "$base_file" <<'BASE_EOF'
# Functional Block Agent Context

Keep this file focused on the local contract for this primary functional block.

BASE_EOF
fi

updated_file="$(mktemp)"
if ! replace_contract_block "$base_file" "$updated_file" "$block_tmp"; then
  rm -f "$updated_file" "$block_tmp"
  if [[ "$base_file" == /tmp/* || "$base_file" == "${TMPDIR:-/tmp}"* ]]; then
    rm -f "$base_file"
  fi
  exit 1
fi

cp "$updated_file" "$contract_agents"
cp "$updated_file" "$contract_claude"
rm -f "$updated_file" "$block_tmp"
if [[ "$base_file" == /tmp/* || "$base_file" == "${TMPDIR:-/tmp}"* ]]; then
  rm -f "$base_file"
fi

sync_context_map "$functional_block" "$architecture_domain" "$architecture_capability" "$capability_id" "$contract_agents" "$contract_claude" "$lsp_profile"

echo "[ContextContractSync] Updated $contract_agents and $contract_claude."
