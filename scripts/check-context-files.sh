#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/check-context-files.sh
USAGE_EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

issues=0
files="$(
  find . \
    \( -path './.git' -o -path './node_modules' -o -path './_ref' -o -path './_ops' -o -path './.worktrees' \) -prune -o \
    -type f \( -name 'AGENTS.md' -o -name 'CLAUDE.md' \) -print \
    | sort
)"

if [[ -z "$files" ]]; then
  echo "[ContextScan] No AGENTS.md or CLAUDE.md files found."
  exit 0
fi

scan_pattern() {
  local label="$1"
  local regex="$2"
  local match

  match="$(printf '%s\n' "$files" | xargs grep -Eni "$regex" 2>/dev/null | head -1 || true)"
  if [[ -n "$match" ]]; then
    echo "[ContextScan] ${label}: ${match}"
    issues=$((issues + 1))
  fi
}

scan_pattern "prompt-injection" '(ignore (all|any|previous) instructions|reveal (the )?(system|developer) prompt|bypass (the )?(guard|policy)|override (the )?(policy|guard))'
scan_pattern "secret-exfiltration" '(print|show|copy|upload|send).*(api key|token|secret|credential|\.env)|curl .*https?://|wget .*https?://'
scan_pattern "filesystem-exfiltration" '(read|cat|copy).*(\.env|id_rsa|config\.yaml|secrets?)'

if [[ "$issues" -gt 0 ]]; then
  echo "[ContextScan] FAIL (${issues} suspicious pattern(s))"
  exit 1
fi

echo "[ContextScan] SAFE"
