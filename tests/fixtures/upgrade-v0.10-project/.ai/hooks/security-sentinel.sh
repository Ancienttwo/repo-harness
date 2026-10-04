#!/bin/bash
set -euo pipefail

# Lightweight SessionStart sentinel. It checks a fixed set of high-value config
# files only when their content fingerprint changes, then emits a short
# SessionStart context reminder if repo-harness security scan finds anything.

REPO_ROOT="${HOOK_REPO_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SECURITY_DIR="$REPO_ROOT/.ai/harness/security"
STATE_FILE="$SECURITY_DIR/state.sha256"
LATEST_FILE="$SECURITY_DIR/latest.json"

mkdir -p "$SECURITY_DIR"

fingerprint_files() {
  local home_dir="${HOME:-}"
  local files=()
  if [[ -n "$home_dir" ]]; then
    files+=("$home_dir/.claude/settings.json")
    files+=("$home_dir/.codex/hooks.json")
  fi
  files+=("$REPO_ROOT/.vscode/tasks.json")
  files+=("$REPO_ROOT/.claude/settings.json")
  files+=("$REPO_ROOT/.codex/hooks.json")

  local file
  for file in "${files[@]}"; do
    if [[ -f "$file" ]]; then
      if command -v shasum >/dev/null 2>&1; then
        printf '%s %s\n' "$(shasum -a 256 "$file" | awk '{print $1}')" "$file"
      elif command -v sha256sum >/dev/null 2>&1; then
        printf '%s %s\n' "$(sha256sum "$file" | awk '{print $1}')" "$file"
      else
        printf 'exists %s\n' "$file"
      fi
    else
      printf 'missing %s\n' "$file"
    fi
  done
}

security_scan() {
  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_CLI" security scan --json
    return $?
  fi

  if command -v repo-harness >/dev/null 2>&1; then
    repo-harness security scan --json
    return $?
  fi

  if command -v agentic-dev >/dev/null 2>&1; then
    agentic-dev security scan --json
    return $?
  fi

  return 0
}

render_context() {
  local report_file="$1"
  local js='
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!report || report.status === "ok" || !Array.isArray(report.findings) || report.findings.length === 0) process.exit(0);
const high = report.findings.filter((finding) => finding.severity === "high").length;
const fail = report.findings.filter((finding) => finding.severity === "fail").length;
const warn = report.findings.filter((finding) => finding.severity === "warn").length;
const first = report.findings[0];
const bits = [`${report.findings.length} finding(s)`, `${high} high`, `${warn} warn`, `${fail} fail`];
console.log(`[SecurityConfig] ${bits.join(", ")}. First: ${first.ruleId} at ${first.filePath}. Run repo-harness security scan --json.`);
'
  if command -v node >/dev/null 2>&1; then
    node -e "$js" "$report_file"
  elif command -v bun >/dev/null 2>&1; then
    bun -e "$js" "$report_file"
  fi
}

current_fingerprint="$(fingerprint_files)"
previous_fingerprint=""
if [[ -f "$STATE_FILE" ]]; then
  previous_fingerprint="$(cat "$STATE_FILE")"
fi

if [[ "$current_fingerprint" == "$previous_fingerprint" ]]; then
  exit 0
fi

tmp_report="$(mktemp "${TMPDIR:-/tmp}/repo-harness-security.XXXXXX")"
if security_scan >"$tmp_report" 2>/dev/null; then
  cp "$tmp_report" "$LATEST_FILE"
  printf '%s\n' "$current_fingerprint" >"$STATE_FILE"
else
  rm -f "$tmp_report"
  exit 0
fi

context="$(render_context "$tmp_report" || true)"
rm -f "$tmp_report"

[[ -n "$context" ]] || exit 0

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg context "$context" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $context
    }
  }'
  exit 0
fi

printf '%s\n' "$context"
