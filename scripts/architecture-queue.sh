#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage:
  repo-harness run architecture-queue record --file <path>
  repo-harness run architecture-queue status [--format text|json|summary] [--gate]
  repo-harness run architecture-queue reindex [--check] [--quiet]
  repo-harness run architecture-queue triage --before <YYYY-MM-DD>
  repo-harness run architecture-queue check
USAGE_EOF
}

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
repo="$(cd "$repo" && pwd)"
cd "$repo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command_name="${1:-status}"
shift || true

file_path=""
format="text"
check_mode="false"
quiet="false"
gate="false"
before_date=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --file)
      [[ -n "${2:-}" ]] || { echo "architecture-queue: --file requires a value" >&2; exit 2; }
      file_path="$2"
      shift 2
      ;;
    --format)
      [[ -n "${2:-}" ]] || { echo "architecture-queue: --format requires a value" >&2; exit 2; }
      format="$2"
      shift 2
      ;;
    --before)
      [[ -n "${2:-}" ]] || { echo "architecture-queue: --before requires a value" >&2; exit 2; }
      before_date="$2"
      shift 2
      ;;
    --check)
      check_mode="true"
      shift
      ;;
    --quiet)
      quiet="true"
      shift
      ;;
    --gate)
      gate="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "architecture-queue: unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

index_file="docs/architecture/index.md"
requests_dir="docs/architecture/requests"
event_file=".ai/harness/architecture/events.jsonl"

helper_sibling() {
  local helper_name="$1"
  local helper_dir="$SCRIPT_DIR"
  if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" ]]; then
    helper_dir="$(dirname "$REPO_HARNESS_HELPER_SOURCE_PATH")"
  fi
  if [[ -n "$helper_dir" && -f "$helper_dir/$helper_name" ]]; then
    printf '%s\n' "$helper_dir/$helper_name"
    return 0
  fi
  return 1
}

architecture_event() {
  local sibling=""
  sibling="$(helper_sibling architecture-event.ts || true)"
  if command -v bun >/dev/null 2>&1 && [[ -n "$sibling" ]]; then
    bun "$sibling" "$@"
    return $?
  fi
  return 127
}

architecture_event_required() {
  if ! architecture_event safe-token --value probe >/dev/null 2>&1; then
    echo "architecture-queue: missing architecture-event helper" >&2
    return 127
  fi
  return 0
}

capability_resolver() {
  local sibling=""
  sibling="$(helper_sibling capability-resolver.ts || true)"
  if command -v bun >/dev/null 2>&1 && [[ -n "$sibling" ]]; then
    bun "$sibling" "$@"
    return $?
  fi
  return 127
}

capability_resolver_available() {
  capability_resolver list --format json >/dev/null 2>&1
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
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
  process.stdout.write(typeof value === "object" ? JSON.stringify(value) : String(value));
} catch {
  process.exit(1);
}
' 2>/dev/null || true)"
  fi

  [[ -n "$parsed" ]] || return 1
  printf '%s' "$parsed"
}

json_starts_with_object() {
  local json_input="$1"
  local first
  first="$(printf '%s' "$json_input" | sed -n 's/^[[:space:]]*//; /^$/d; s/^\(.\).*$/\1/p; q')"
  [[ "$first" == "{" ]]
}

repo_relative_path() {
  local value="$1"

  if architecture_event repo-path --repo "$repo" --path "$value" 2>/dev/null; then
    return 0
  fi

  value="${value#file://}"
  case "$value" in
    "$repo"/*)
      value="${value#$repo/}"
      ;;
    /*)
      return 1
      ;;
    ./*)
      value="${value#./}"
      ;;
  esac

  case "$value" in
    ""|.|..|../*|*/../*|*$'\n'*|*$'\r'*)
      return 1
      ;;
  esac

  printf '%s' "$value"
}

metadata_value() {
  local file="$1"
  local label="$2"
  [[ -f "$file" ]] || return 1
  awk -v label="> **${label}**:" '
    index($0, label) == 1 {
      value = substr($0, length(label) + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^`|`$/, "", value)
      print value
      exit
    }
  ' "$file"
}

selected_blocks() {
  local sibling=""
  sibling="$(helper_sibling select-agent-context-blocks.sh || true)"
  if [[ -n "$sibling" ]]; then
    "$sibling" "$repo" 2>/dev/null || true
    return 0
  fi

  find "$repo" \
    \( -path "$repo/.git" -o -path "$repo/node_modules" -o -path "$repo/.ai" -o -path "$repo/.claude" \) -prune -o \
    \( -type f \( -name 'CLAUDE.md' -o -name 'AGENTS.md' \) \) -print 2>/dev/null | while IFS= read -r context_file; do
      context_dir="$(dirname "$context_file")"
      rel_dir="${context_dir#$repo/}"
      [[ "$rel_dir" == "$context_dir" || "$rel_dir" == "." ]] && continue
      printf '%s\n' "$rel_dir"
    done | sort -u
}

match_functional_block() {
  local rel_path="$1"
  local best="root"
  local block

  while IFS= read -r block; do
    [[ -n "$block" ]] || continue
    block="${block#./}"
    block="${block%/}"
    [[ -z "$block" || "$block" == "." ]] && continue
    case "$block" in
      /*|../*|*/../*|*\"*)
        continue
        ;;
    esac

    if [[ "$rel_path" == "$block" || "$rel_path" == "$block/"* ]]; then
      if [[ "$best" == "root" || "${#block}" -gt "${#best}" ]]; then
        best="$block"
      fi
    fi
  done < <(selected_blocks)

  printf '%s' "$best"
}

classify_change() {
  local rel_path="$1"
  local base
  base="$(basename "$rel_path")"

  case "$rel_path" in
    .git/*|node_modules/*|.ai/harness/architecture/*|docs/architecture/*|.claude/.trace.jsonl)
      printf 'none internal\n'
      return
      ;;
    CLAUDE.md|AGENTS.md|*/CLAUDE.md|*/AGENTS.md)
      printf 'none agent-context\n'
      return
      ;;
  esac

  if [[ "$rel_path" =~ ^(\.ai/hooks/|assets/hooks/) ]] ||
     [[ "$rel_path" == ".ai/harness/policy.json" ]] ||
     [[ "$rel_path" == ".ai/harness/workflow-contract.json" ]] ||
     [[ "$rel_path" == "assets/workflow-contract.v1.json" ]] ||
     [[ "$rel_path" =~ ^scripts/(architecture-queue|context-contract-sync|workstream-sync|migrate-project-template|migrate-workflow-docs|inspect-project-state|check-skill-version|capability-resolver|capability-config|create-project-dirs|init-project|ensure-task-workflow|check-task-workflow|check-deploy-sql-order|refresh-current-status|workflow-contract|select-agent-context-blocks)\.(sh|ts)$ ]] ||
     [[ "$rel_path" == "scripts/lib/project-init-lib.sh" ]]; then
    printf 'high workflow-surface\n'
    return
  fi

  if [[ "$rel_path" =~ (^|/)(migrations|migration|schema|schemas|database|db|infra|terraform|k8s)(/|$) ]] ||
     [[ "$base" =~ ^wrangler.*\.toml$ ]] ||
     [[ "$base" =~ ^(Dockerfile|docker-compose\.ya?ml|schema\.prisma)$ ]]; then
    printf 'high data-or-deploy\n'
    return
  fi

  if [[ "$rel_path" =~ ^(apps|packages|services)/[^/]+/(package\.json|tsconfig\.json|metro\.config\.(js|ts)|vite\.config\.(js|ts)|next\.config\.(js|mjs|ts)|app\.json|app\.config\.(js|ts))$ ]] ||
     [[ "$rel_path" =~ ^(apps|packages|services)/[^/]+/src/(routes|api|server|app)(/|$) ]] ||
     [[ "$rel_path" =~ ^packages/[^/]+/src/[^/]+/index\.ts$ ]] ||
     [[ "$rel_path" =~ ^(package\.json|turbo\.json|tsconfig\.json|pnpm-workspace\.yaml|bunfig\.toml)$ ]]; then
    printf 'medium boundary-or-config\n'
    return
  fi

  if [[ "$rel_path" =~ ^(apps|packages|services)/[^/]+/src/ ]]; then
    printf 'low source-change\n'
    return
  fi

  printf 'none unrelated\n'
}

policy_arch_value() {
  local key="$1"
  local default_value="$2"
  local policy_file=".ai/harness/policy.json"
  local parsed=""

  if [[ -f "$policy_file" ]] && command -v node >/dev/null 2>&1; then
    parsed="$(POLICY_FILE="$policy_file" POLICY_KEY="$key" node -e '
const fs = require("fs");
const file = process.env.POLICY_FILE;
const key = process.env.POLICY_KEY;
try {
  const policy = JSON.parse(fs.readFileSync(file, "utf8"));
  const value = policy.architecture && policy.architecture[key];
  if (value === undefined || value === null || value === "") process.exit(1);
  process.stdout.write(String(value));
} catch {
  process.exit(1);
}
' 2>/dev/null || true)"
  fi

  printf '%s' "${parsed:-$default_value}"
}

severity_rank() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    critical) printf '4' ;;
    high) printf '3' ;;
    medium) printf '2' ;;
    low) printf '1' ;;
    *) printf '0' ;;
  esac
}

request_card_path() {
  local capability_id="$1"
  printf '%s/%s.md' "$requests_dir" "$(safe_token "$capability_id")"
}

pending_request_files() {
  [[ -d "$requests_dir" ]] || return 0
  find "$requests_dir" -maxdepth 1 -type f -name '*.md' | sort | while IFS= read -r request; do
    [[ "$(metadata_value "$request" "Status" || true)" == "Pending" ]] || continue
    printf '%s\n' "$request"
  done
}

pending_count() {
  pending_request_files | wc -l | tr -d ' '
}

pending_count_at_or_above() {
  local threshold="$1"
  local min_rank request severity count
  min_rank="$(severity_rank "$threshold")"
  count=0
  while IFS= read -r request; do
    severity="$(metadata_value "$request" "Severity" || true)"
    if [[ "$(severity_rank "$severity")" -ge "$min_rank" ]]; then
      count=$((count + 1))
    fi
  done < <(pending_request_files)
  printf '%s' "$count"
}

reindex_requests() {
  architecture_event_required
  if [[ "$check_mode" == "true" ]]; then
    architecture_event reindex-requests --index-file "$index_file" --requests-dir "$requests_dir" --check
  else
    architecture_event reindex-requests --index-file "$index_file" --requests-dir "$requests_dir"
    [[ "$quiet" == "true" ]] || echo "[ArchitectureQueue] Reindexed $index_file"
  fi
}

status_command() {
  local count mode threshold blocking
  count="$(pending_count)"
  mode="$(policy_arch_value "freshness_gate" "advisory")"
  threshold="$(policy_arch_value "gate_min_severity" "medium")"
  blocking="$(pending_count_at_or_above "$threshold")"

  case "$format" in
    json)
      printf '{"pending":%s,"gate_mode":"%s","gate_min_severity":"%s","blocking":%s}\n' "$count" "$mode" "$threshold" "$blocking"
      ;;
    summary)
      printf 'pending=%s gate_mode=%s gate_min_severity=%s blocking=%s\n' "$count" "$mode" "$threshold" "$blocking"
      ;;
    text)
      printf '[ArchitectureQueue] pending=%s gate_mode=%s gate_min_severity=%s blocking=%s\n' "$count" "$mode" "$threshold" "$blocking"
      ;;
    *)
      echo "architecture-queue: unsupported --format: $format" >&2
      exit 2
      ;;
  esac

  [[ "$gate" == "true" ]] || return 0
  case "$mode" in
    off)
      return 0
      ;;
    advisory)
      if [[ "$blocking" -gt 0 ]]; then
        echo "[ArchitectureQueue] WARN: pending architecture requests meet gate threshold ($blocking >= $threshold)" >&2
      fi
      return 0
      ;;
    strict)
      if ! architecture_event_required >/dev/null 2>&1 || ! capability_resolver_available; then
        echo "[ArchitectureQueue] strict gate failed: missing queue dependencies" >&2
        return 1
      fi
      if [[ "$blocking" -gt 0 ]]; then
        echo "[ArchitectureQueue] strict gate failed: pending architecture requests meet gate threshold ($blocking >= $threshold)" >&2
        return 1
      fi
      return 0
      ;;
    *)
      echo "[ArchitectureQueue] unknown freshness_gate: $mode" >&2
      return 1
      ;;
  esac
}

record_command() {
  if [[ -z "$file_path" ]]; then
    echo "architecture-queue: missing --file" >&2
    exit 2
  fi

  local rel_path severity change_type capability_match resolver_stderr
  rel_path="$(repo_relative_path "$file_path" || true)"
  if [[ -z "$rel_path" ]]; then
    echo "[ArchitectureDrift] Skipped unsafe path: $file_path"
    exit 0
  fi

  read -r severity change_type < <(classify_change "$rel_path")
  if [[ "$severity" == "none" ]]; then
    echo "[ArchitectureDrift] No architecture drift request for $rel_path ($change_type)."
    exit 0
  fi

  if ! architecture_event_required >/dev/null 2>&1; then
    echo "[ArchitectureQueue] WARN: architecture-event helper is required to record $rel_path; skipping advisory queue update"
    exit 0
  fi

  capability_match=""
  if capability_resolver_available; then
    resolver_stderr="$(mktemp)"
    if ! capability_match="$(capability_resolver match --path "$rel_path" --format json 2>"$resolver_stderr")"; then
      [[ -n "$capability_match" ]] && echo "$capability_match" >&2
      cat "$resolver_stderr" >&2
      rm -f "$resolver_stderr"
      exit 1
    fi
    if ! json_starts_with_object "$capability_match"; then
      cat "$resolver_stderr" >&2
      echo "[ArchitectureDrift] WARN: capability resolver returned non-JSON; using root fallback for $rel_path" >&2
      capability_match=""
    fi
    rm -f "$resolver_stderr"
  fi

  local functional_block matched_prefix capability_id contract_agents contract_claude capability_resolved
  local architecture_domain architecture_capability architecture_module workstream_dir
  functional_block="root"
  matched_prefix="root"
  capability_id="root"
  contract_agents=""
  contract_claude=""
  capability_resolved="false"
  if [[ -n "$capability_match" ]] && [[ "$(json_get "$capability_match" "matched" || true)" == "true" ]]; then
    functional_block="$(json_get "$capability_match" "functional_block")"
    matched_prefix="$(json_get "$capability_match" "matched_prefix")"
    capability_id="$(json_get "$capability_match" "capability_id")"
    capability_resolved="true"
  elif ! capability_resolver_available; then
    functional_block="$(match_functional_block "$rel_path")"
    matched_prefix="$functional_block"
    capability_id="$(safe_token "$functional_block")"
    [[ "$functional_block" == "root" ]] && capability_id="root"
  fi

  if [[ "$capability_resolved" != "true" && "$severity" == "low" && "$change_type" == "source-change" ]]; then
    echo "[ArchitectureDrift] No architecture drift request for $rel_path (unmatched source-change)."
    exit 0
  fi

  architecture_domain="root"
  architecture_capability="_root"
  architecture_module="docs/architecture/index.md"
  workstream_dir="tasks/workstreams/root/_root"
  if [[ "$capability_resolved" == "true" && "$functional_block" != "root" ]]; then
    architecture_domain="$(json_get "$capability_match" "architecture_domain")"
    architecture_capability="$(json_get "$capability_match" "architecture_capability")"
    architecture_module="$(json_get "$capability_match" "architecture_module")"
    workstream_dir="$(json_get "$capability_match" "workstream_dir")"
    contract_agents="$(json_get "$capability_match" "contract_agents" || true)"
    contract_claude="$(json_get "$capability_match" "contract_claude" || true)"
  elif [[ "$functional_block" != "root" ]]; then
    read -r architecture_domain architecture_capability architecture_module workstream_dir < <(architecture_event derive-scope --block "$functional_block" --format lines)
  fi

  local iso_timestamp request_file spawn_recommended contract_sync_required request_event_json event_json
  iso_timestamp="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  request_file="$(request_card_path "$capability_id")"
  spawn_recommended="false"
  contract_sync_required="false"

  [[ "$severity" == "high" ]] && spawn_recommended="true"
  if [[ "$functional_block" != "root" && ( "$severity" == "high" || "$severity" == "medium" ) ]]; then
    contract_sync_required="true"
  fi

  request_event_json="$(architecture_event event-json \
    --ts "$iso_timestamp" \
    --file-path "$rel_path" \
    --severity "$severity" \
    --functional-block "$functional_block" \
    --capability-id "$capability_id" \
    --matched-prefix "$matched_prefix" \
    --architecture-domain "$architecture_domain" \
    --architecture-capability "$architecture_capability" \
    --architecture-module "$architecture_module" \
    --workstream-dir "$workstream_dir" \
    --contract-agents "$contract_agents" \
    --contract-claude "$contract_claude" \
    --change-type "$change_type" \
    --request-file "$request_file" \
    --spawn-recommended "$spawn_recommended" \
    --contract-sync-required "$contract_sync_required" \
    --pretty)"

  mkdir -p "$requests_dir" "$(dirname "$event_file")" docs/architecture/snapshots docs/architecture/diagrams docs/architecture/domains docs/architecture/modules tasks/workstreams
  architecture_event upsert-request --request-file "$request_file" --event-json "$request_event_json"

  event_json="$(architecture_event event-json \
    --ts "$iso_timestamp" \
    --file-path "$rel_path" \
    --severity "$severity" \
    --functional-block "$functional_block" \
    --capability-id "$capability_id" \
    --matched-prefix "$matched_prefix" \
    --architecture-domain "$architecture_domain" \
    --architecture-capability "$architecture_capability" \
    --architecture-module "$architecture_module" \
    --workstream-dir "$workstream_dir" \
    --contract-agents "$contract_agents" \
    --contract-claude "$contract_claude" \
    --change-type "$change_type" \
    --request-file "$request_file" \
    --spawn-recommended "$spawn_recommended" \
    --contract-sync-required "$contract_sync_required")"
  printf '%s\n' "$event_json" >> "$event_file"

  quiet="true"
  check_mode="false"
  reindex_requests

  echo "[ArchitectureDrift] Request: $request_file"
  echo "[ArchitectureDrift] Event: $event_file"
  echo "[ArchitectureDrift] severity=$severity capability_id=$capability_id functional_block=$functional_block spawn_recommended=$spawn_recommended contract_sync_required=$contract_sync_required"
}

triage_command() {
  if [[ -z "$before_date" ]]; then
    echo "architecture-queue: triage requires --before <YYYY-MM-DD>" >&2
    exit 2
  fi
  if [[ ! "$before_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "architecture-queue: --before must be YYYY-MM-DD" >&2
    exit 2
  fi
  architecture_event_required

  local request detected detected_date capability_id card count
  count=0
  mkdir -p "$requests_dir"
  while IFS= read -r request; do
    [[ -f "$request" ]] || continue
    case "$(basename "$request")" in
      20??????-??????-*.md)
        ;;
      *)
        continue
        ;;
    esac
    [[ "$(metadata_value "$request" "Status" || true)" == "Pending" ]] || continue
    detected="$(metadata_value "$request" "Detected" || true)"
    detected_date="${detected%%T*}"
    [[ "$detected_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || continue
    if [[ "$detected_date" > "$before_date" || "$detected_date" == "$before_date" ]]; then
      continue
    fi
    capability_id="$(metadata_value "$request" "Capability ID" || true)"
    capability_id="${capability_id:-root}"
    card="$(request_card_path "$capability_id")"
    architecture_event upsert-from-request --source-request "$request" --request-file "$card"
    archive_sibling="$(helper_sibling archive-architecture-request.sh || true)"
    if [[ -n "$archive_sibling" ]]; then
      bash "$archive_sibling" \
        --request "$request" \
        --status superseded \
        --artifact "$card" \
        --note "Merged into architecture queue card by triage --before $before_date." >/dev/null
    else
      mkdir -p "docs/architecture/requests/archive/$(date '+%Y')"
      mv "$request" "docs/architecture/requests/archive/$(date '+%Y')/$(basename "$request")"
    fi
    count=$((count + 1))
  done < <(find "$requests_dir" -maxdepth 1 -type f -name '*.md' | sort)

  quiet="true"
  check_mode="false"
  reindex_requests
  echo "[ArchitectureQueue] triaged=$count before=$before_date pending=$(pending_count)"
}

check_command() {
  check_mode="true"
  reindex_requests
  gate="true"
  status_command
}

case "$command_name" in
  record)
    record_command
    ;;
  status)
    status_command
    ;;
  reindex)
    reindex_requests
    ;;
  triage)
    triage_command
    ;;
  check)
    check_command
    ;;
  *)
    echo "architecture-queue: unknown command: $command_name" >&2
    usage >&2
    exit 2
    ;;
esac
