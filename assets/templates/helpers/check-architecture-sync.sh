#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: repo-harness run check-architecture-sync [--mode off|advisory|strict] [--target <branch>] [--changed-files <file>] [--format text|json]

Checks architecture request index integrity, then gates pending architecture
drift only for capabilities touched by the current branch or working tree.
USAGE_EOF
}

repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
repo="$(cd "$repo" && pwd)"
cd "$repo"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mode=""
target_branch=""
changed_files_file=""
format="text"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      [[ -n "${2:-}" ]] || { echo "check-architecture-sync: --mode requires a value" >&2; exit 2; }
      mode="$2"
      shift 2
      ;;
    --target)
      [[ -n "${2:-}" ]] || { echo "check-architecture-sync: --target requires a value" >&2; exit 2; }
      target_branch="$2"
      shift 2
      ;;
    --changed-files)
      [[ -n "${2:-}" ]] || { echo "check-architecture-sync: --changed-files requires a value" >&2; exit 2; }
      changed_files_file="$2"
      shift 2
      ;;
    --format)
      [[ -n "${2:-}" ]] || { echo "check-architecture-sync: --format requires a value" >&2; exit 2; }
      format="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "check-architecture-sync: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

policy_value() {
  local jq_path="$1"
  local default_value="$2"
  local value=""

  if [[ -f ".ai/harness/policy.json" ]] && command -v jq >/dev/null 2>&1; then
    value="$(jq -r "$jq_path // empty" .ai/harness/policy.json 2>/dev/null || true)"
  elif [[ -f ".ai/harness/policy.json" ]] && command -v node >/dev/null 2>&1; then
    value="$(POLICY_PATH="$jq_path" node -e '
const fs = require("fs");
const path = process.env.POLICY_PATH || "";
try {
  const policy = JSON.parse(fs.readFileSync(".ai/harness/policy.json", "utf8"));
  const keys = path.replace(/^\./, "").split(".");
  let value = policy;
  for (const key of keys) value = value && value[key];
  if (value === undefined || value === null || value === "") process.exit(1);
  process.stdout.write(String(value));
} catch {
  process.exit(1);
}
' 2>/dev/null || true)"
  fi

  printf '%s' "${value:-$default_value}"
}

helper_sibling() {
  local helper_name="$1"
  local helper_dir="$SCRIPT_DIR"
  if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" && -f "$REPO_HARNESS_HELPER_SOURCE_PATH" \
        && "$(basename "$REPO_HARNESS_HELPER_SOURCE_PATH")" == "$(basename "${BASH_SOURCE[0]}")" ]]; then
    helper_dir="$(dirname "$REPO_HARNESS_HELPER_SOURCE_PATH")"
  fi
  if [[ -n "$helper_dir" && -f "$helper_dir/$helper_name" ]]; then
    printf '%s\n' "$helper_dir/$helper_name"
    return 0
  fi
  return 1
}

severity_rank() {
  case "$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')" in
    critical) printf '4' ;;
    high) printf '3' ;;
    medium) printf '2' ;;
    low) printf '1' ;;
    *) printf '0' ;;
  esac
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

normalize_repo_path() {
  local value="$1"
  value="${value#file://}"
  case "$value" in
    "$repo"/*) value="${value#$repo/}" ;;
    /*) return 1 ;;
    ./*) value="${value#./}" ;;
  esac
  value="${value%/}"
  case "$value" in
    ""|.|..|../*|*/../*|*$'\n'*|*$'\r'*) return 1 ;;
  esac
  printf '%s\n' "$value"
}

collect_changed_files() {
  local merge_base=""

  if [[ -n "$changed_files_file" ]]; then
    while IFS= read -r path; do
      [[ -n "$path" ]] || continue
      normalize_repo_path "$path" || true
    done < "$changed_files_file"
    return 0
  fi

  if [[ -n "$target_branch" ]] && git rev-parse --verify --quiet "$target_branch" >/dev/null 2>&1; then
    merge_base="$(git merge-base HEAD "$target_branch" 2>/dev/null || true)"
  fi

  if [[ -n "$merge_base" ]]; then
    git diff --name-only --diff-filter=ACMRTUXB "$merge_base"...HEAD
  fi

  git status --porcelain=v1 --untracked-files=all | while IFS= read -r line; do
    path="${line:3}"
    case "$line" in
      R*|C*)
        path="${path##* -> }"
        ;;
    esac
    [[ -n "$path" ]] || continue
    normalize_repo_path "$path" || true
  done
}

pending_request_files() {
  [[ -d "docs/architecture/requests" ]] || return 0
  find "docs/architecture/requests" -maxdepth 1 -type f -name '*.md' | sort | while IFS= read -r request; do
    [[ "$(metadata_value "$request" "Status" || true)" == "Pending" ]] || continue
    printf '%s\n' "$request"
  done
}

pending_requests_for_capabilities() {
  local threshold="$1"
  local min_rank capability_set="$2"
  local request capability severity
  min_rank="$(severity_rank "$threshold")"

  while IFS= read -r request; do
    capability="$(metadata_value "$request" "Capability ID" || true)"
    capability="${capability:-root}"
    severity="$(metadata_value "$request" "Severity" || true)"
    [[ "$(severity_rank "$severity")" -ge "$min_rank" ]] || continue
    if printf '%s\n' "$capability_set" | grep -Fxq "$capability"; then
      printf '%s\t%s\t%s\n' "$capability" "$severity" "$request"
    fi
  done < <(pending_request_files)
}

mode="${mode:-$(policy_value '.architecture.freshness_gate' 'advisory')}"
target_branch="${target_branch:-$(policy_value '.worktree_strategy.merge_back.target' 'main')}"
threshold="$(policy_value '.architecture.gate_min_severity' 'medium')"
projection_provider="$(policy_value '.architecture.projection_provider' 'disabled')"
projection_apply="$(policy_value '.architecture.projection_apply' 'disabled')"

count_json_files() {
  local directory="$1"
  [[ -d "$directory" ]] || { printf '0'; return 0; }
  find "$directory" -maxdepth 1 -type f -name '*.json' | wc -l | tr -d ' '
}

projection_state="disabled"
projection_reason="policy.architecture.projection_provider=disabled"
if [[ "$projection_provider" == "archctx" ]]; then
  if command -v repo-harness >/dev/null 2>&1; then
    projection_status_json="$(repo-harness architecture-projection status --json 2>/dev/null || true)"
    if [[ -n "$projection_status_json" ]] && command -v jq >/dev/null 2>&1; then
      projection_state="$(printf '%s' "$projection_status_json" | jq -r '.projectionProvider.state // "error"' 2>/dev/null || printf 'error')"
      projection_reason="$(printf '%s' "$projection_status_json" | jq -r '.projectionProvider.reason // "readiness status unavailable"' 2>/dev/null || printf 'readiness status unavailable')"
    elif [[ -n "$projection_status_json" ]] && command -v node >/dev/null 2>&1; then
      projection_readback="$(PROJECTION_STATUS_JSON="$projection_status_json" node -e '
try {
  const value = JSON.parse(process.env.PROJECTION_STATUS_JSON || "{}");
  process.stdout.write(`${value.projectionProvider?.state || "error"}\t${value.projectionProvider?.reason || "readiness status unavailable"}`);
} catch { process.stdout.write("error\treadiness status invalid"); }
' 2>/dev/null || printf 'error\treadiness status unavailable')"
      projection_state="${projection_readback%%$'\t'*}"
      projection_reason="${projection_readback#*$'\t'}"
    else
      projection_state="error"
      projection_reason="readiness status unavailable"
    fi
  else
    projection_state="missing"
    projection_reason="repo-harness CLI unavailable for provider handshake"
  fi
fi

projection_runtime_root=".ai/harness/architecture-projection"
projection_pending="$(count_json_files "$projection_runtime_root/pending")"
projection_running="$(count_json_files "$projection_runtime_root/running")"
projection_dead_letters="$(count_json_files "$projection_runtime_root/dead-letter")"
projection_human_actions=0
projection_adoption_required=0
if [[ -d "$projection_runtime_root/receipts" ]] && command -v jq >/dev/null 2>&1; then
  while IFS= read -r receipt; do
    receipt_status="$(jq -r '.result.status // empty' "$receipt" 2>/dev/null || true)"
    [[ "$receipt_status" == "human-action-required" ]] && projection_human_actions=$((projection_human_actions + 1))
    [[ "$receipt_status" == "adoption-required" ]] && projection_adoption_required=$((projection_adoption_required + 1))
  done < <(find "$projection_runtime_root/receipts" -maxdepth 1 -type f -name '*.json' | sort)
fi
projection_blocking=$((projection_pending + projection_running + projection_dead_letters + projection_human_actions + projection_adoption_required))
if [[ "$projection_provider" == "archctx" && "$projection_state" != "ready" ]]; then
  projection_blocking=$((projection_blocking + 1))
fi

case "$mode" in
  off|advisory|strict) ;;
  *)
    echo "check-architecture-sync: unknown mode: $mode" >&2
    exit 1
    ;;
esac

run_architecture_queue() {
  local sibling=""
  sibling="$(helper_sibling architecture-queue.sh || true)"
  if [[ -n "$sibling" ]]; then
    bash "$sibling" "$@"
    return $?
  fi
  return 127
}

architecture_queue_available() {
  helper_sibling architecture-queue.sh >/dev/null 2>&1 && return 0
  return 1
}

run_capability_resolver() {
  local sibling=""
  sibling="$(helper_sibling capability-resolver.ts || true)"
  if command -v bun >/dev/null 2>&1 && [[ -n "$sibling" ]]; then
    bun "$sibling" "$@"
    return $?
  fi
  return 127
}

if ! architecture_queue_available; then
  if [[ "$mode" == "strict" ]]; then
    echo "[ArchitectureSync] strict gate failed: missing architecture-queue helper" >&2
    exit 1
  fi
  echo "[ArchitectureSync] WARN: missing architecture-queue helper; skipping advisory freshness gate" >&2
  exit 0
fi

if ! run_architecture_queue reindex --check >/dev/null; then
  echo "[ArchitectureSync] architecture request index is stale; run repo-harness run architecture-queue reindex" >&2
  exit 1
fi

if [[ "$mode" == "off" ]]; then
  case "$format" in
    json) printf '{"mode":"off","changed_capabilities":0,"blocking":0,"projection":{"provider":"%s","apply":"%s","state":"%s","pending":%s,"running":%s,"dead_letters":%s,"human_actions":%s,"adoption_required":%s,"blocking":%s}}\n' "$(json_escape "$projection_provider")" "$(json_escape "$projection_apply")" "$(json_escape "$projection_state")" "$projection_pending" "$projection_running" "$projection_dead_letters" "$projection_human_actions" "$projection_adoption_required" "$projection_blocking" ;;
    text) echo "[ArchitectureSync] mode=off changed_capabilities=0 blocking=0"; echo "[ArchitectureProjection] provider=$projection_provider apply=$projection_apply state=$projection_state pending=$projection_pending running=$projection_running dead_letters=$projection_dead_letters human_actions=$projection_human_actions adoption_required=$projection_adoption_required blocking=$projection_blocking" ;;
    *) echo "check-architecture-sync: unsupported --format: $format" >&2; exit 2 ;;
  esac
  exit 0
fi

if ! run_capability_resolver list --format json >/dev/null 2>&1; then
  if [[ "$mode" == "strict" ]]; then
    echo "[ArchitectureSync] strict gate failed: missing capability-resolver helper" >&2
    exit 1
  fi
  echo "[ArchitectureSync] WARN: missing capability-resolver helper; skipping advisory freshness gate" >&2
  exit 0
fi

changed_files="$(collect_changed_files | sort -u)"
if [[ -z "$changed_files" ]]; then
  case "$format" in
    json) printf '{"mode":"%s","gate_min_severity":"%s","changed_capabilities":0,"blocking":0,"projection":{"provider":"%s","apply":"%s","state":"%s","reason":"%s","pending":%s,"running":%s,"dead_letters":%s,"human_actions":%s,"adoption_required":%s,"blocking":%s}}\n' "$(json_escape "$mode")" "$(json_escape "$threshold")" "$(json_escape "$projection_provider")" "$(json_escape "$projection_apply")" "$(json_escape "$projection_state")" "$(json_escape "$projection_reason")" "$projection_pending" "$projection_running" "$projection_dead_letters" "$projection_human_actions" "$projection_adoption_required" "$projection_blocking" ;;
    text) echo "[ArchitectureSync] mode=$mode gate_min_severity=$threshold changed_capabilities=0 blocking=0"; echo "[ArchitectureProjection] provider=$projection_provider apply=$projection_apply state=$projection_state pending=$projection_pending running=$projection_running dead_letters=$projection_dead_letters human_actions=$projection_human_actions adoption_required=$projection_adoption_required blocking=$projection_blocking" ;;
    *) echo "check-architecture-sync: unsupported --format: $format" >&2; exit 2 ;;
  esac
  exit 0
fi

matches_json="$(printf '%s\n' "$changed_files" | run_capability_resolver match --paths-from - --format json)"
if command -v jq >/dev/null 2>&1; then
  capabilities="$(printf '%s' "$matches_json" | jq -r '[.[] | (.capability_id // "root")] | unique | .[]')"
elif command -v node >/dev/null 2>&1; then
  capabilities="$(
    MATCHES_JSON="$matches_json" node -e '
const matches = JSON.parse(process.env.MATCHES_JSON || "[]");
const ids = new Set();
for (const item of matches) ids.add(item.capability_id || "root");
for (const id of [...ids].sort()) console.log(id);
'
  )"
else
  capabilities=""
fi
changed_count="$(printf '%s\n' "$capabilities" | sed '/^$/d' | wc -l | tr -d ' ')"
blocking_lines="$(pending_requests_for_capabilities "$threshold" "$capabilities")"
blocking_count="$(printf '%s\n' "$blocking_lines" | sed '/^$/d' | wc -l | tr -d ' ')"

case "$format" in
  json)
    blocking_json="$(
      printf '%s\n' "$blocking_lines" | awk -F '\t' 'NF >= 3 { printf "%s{\"capability_id\":\"%s\",\"severity\":\"%s\",\"request\":\"%s\"}", sep, $1, $2, $3; sep="," }'
    )"
    printf '{"mode":"%s","gate_min_severity":"%s","changed_capabilities":%s,"blocking":%s,"blocking_requests":[%s],"projection":{"provider":"%s","apply":"%s","state":"%s","reason":"%s","pending":%s,"running":%s,"dead_letters":%s,"human_actions":%s,"adoption_required":%s,"blocking":%s}}\n' \
      "$(json_escape "$mode")" "$(json_escape "$threshold")" "$changed_count" "$blocking_count" "$blocking_json" "$(json_escape "$projection_provider")" "$(json_escape "$projection_apply")" "$(json_escape "$projection_state")" "$(json_escape "$projection_reason")" "$projection_pending" "$projection_running" "$projection_dead_letters" "$projection_human_actions" "$projection_adoption_required" "$projection_blocking"
    ;;
  text)
    echo "[ArchitectureSync] mode=$mode gate_min_severity=$threshold changed_capabilities=$changed_count blocking=$blocking_count"
    echo "[ArchitectureProjection] provider=$projection_provider apply=$projection_apply state=$projection_state pending=$projection_pending running=$projection_running dead_letters=$projection_dead_letters human_actions=$projection_human_actions adoption_required=$projection_adoption_required blocking=$projection_blocking"
    if [[ "$blocking_count" -gt 0 ]]; then
      printf '%s\n' "$blocking_lines" | while IFS=$'\t' read -r capability severity request; do
        [[ -n "$capability" ]] || continue
        echo "[ArchitectureSync] pending $severity $capability -> $request"
      done
    fi
    ;;
  *)
    echo "check-architecture-sync: unsupported --format: $format" >&2
    exit 2
    ;;
esac

if [[ "$blocking_count" -gt 0 ]]; then
  if [[ "$mode" == "strict" ]]; then
    echo "[ArchitectureSync] strict gate failed: changed capabilities have pending architecture requests" >&2
    exit 1
  fi
  echo "[ArchitectureSync] WARN: changed capabilities have pending architecture requests" >&2
fi

if [[ "$projection_blocking" -gt 0 ]]; then
  if [[ "$mode" == "strict" ]]; then
    echo "[ArchitectureProjection] strict gate failed: provider/readiness or durable projection state is not complete" >&2
    exit 1
  fi
  echo "[ArchitectureProjection] WARN: provider/readiness or durable projection state requires attention ($projection_reason)" >&2
fi

exit 0
