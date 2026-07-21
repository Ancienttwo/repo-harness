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
  if [[ -n "${REPO_HARNESS_HELPER_SOURCE_PATH:-}" ]]; then
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
    json) printf '{"mode":"off","changed_capabilities":0,"blocking":0}\n' ;;
    text) echo "[ArchitectureSync] mode=off changed_capabilities=0 blocking=0" ;;
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
    json) printf '{"mode":"%s","gate_min_severity":"%s","changed_capabilities":0,"blocking":0}\n' "$(json_escape "$mode")" "$(json_escape "$threshold")" ;;
    text) echo "[ArchitectureSync] mode=$mode gate_min_severity=$threshold changed_capabilities=0 blocking=0" ;;
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
    printf '{"mode":"%s","gate_min_severity":"%s","changed_capabilities":%s,"blocking":%s,"blocking_requests":[%s]}\n' \
      "$(json_escape "$mode")" "$(json_escape "$threshold")" "$changed_count" "$blocking_count" "$blocking_json"
    ;;
  text)
    echo "[ArchitectureSync] mode=$mode gate_min_severity=$threshold changed_capabilities=$changed_count blocking=$blocking_count"
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

exit 0
