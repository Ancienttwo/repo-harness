#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

if [[ -f ".ai/hooks/lib/workflow-state.sh" ]]; then
  # shellcheck source=/dev/null
  . ".ai/hooks/lib/workflow-state.sh"
  contract_file="$(workflow_active_contract || true)"
  review_file="$(workflow_active_review || true)"
  checks_file="$(workflow_checks_file)"
else
  contract_file=""
  review_file=""
  checks_file=".ai/harness/checks/latest.json"
fi

[[ -n "$contract_file" && -f "$contract_file" ]] || { echo "No active sprint contract found" >&2; exit 1; }

mkdir -p "$(dirname "$checks_file")"
contract_report="$(mktemp)"
trap 'rm -f "$contract_report"' EXIT

contract_command="bash scripts/verify-contract.sh --contract $contract_file --strict --report-file <temp>"
set +e
contract_output="$(bash scripts/verify-contract.sh --contract "$contract_file" --strict --report-file "$contract_report" 2>&1)"
contract_exit=$?
set -e

if [[ -n "$contract_output" ]]; then
  printf '%s\n' "$contract_output"
fi

review_status="fail"
review_message="Sprint review recommends pass."
if [[ -z "$review_file" || ! -f "$review_file" ]]; then
  review_message="Missing sprint review file."
  echo "Missing sprint review file" >&2
elif grep -Eq '^> \*\*Recommendation\*\*:[[:space:]]*pass([[:space:]]*)$' "$review_file"; then
  review_status="pass"
else
  review_message="Sprint review does not recommend pass."
  echo "Sprint review does not recommend pass" >&2
fi

status="fail"
exit_code=1
if [[ "$contract_exit" -eq 0 && "$review_status" == "pass" ]]; then
  status="pass"
  exit_code=0
fi

if command -v jq >/dev/null 2>&1 && jq -e . "$contract_report" >/dev/null 2>&1; then
  jq -n \
    --slurpfile contract_report "$contract_report" \
    --arg status "$status" \
    --arg source "verify-sprint" \
    --arg command "bash scripts/verify-sprint.sh" \
    --arg generated_at "$(date '+%Y-%m-%dT%H:%M:%S%z')" \
    --arg contract_file "$contract_file" \
    --arg contract_status "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)" \
    --arg contract_command "$contract_command" \
    --argjson contract_exit "$contract_exit" \
    --arg review_file "${review_file:-}" \
    --arg review_status "$review_status" \
    --arg review_message "$review_message" \
    --argjson exit_code "$exit_code" \
    '{
      status: $status,
      source: $source,
      command: $command,
      exit_code: $exit_code,
      generated_at: $generated_at,
      contract: {
        file: $contract_file,
        status: $contract_status,
        command: $contract_command,
        exit_code: $contract_exit,
        report: ($contract_report[0] // {})
      },
      review: {
        file: $review_file,
        status: $review_status,
        message: $review_message
      }
    }' > "$checks_file"
else
  cat > "$checks_file" <<EOF_CHECKS
{
  "status": "$(json_escape "$status")",
  "source": "verify-sprint",
  "command": "bash scripts/verify-sprint.sh",
  "exit_code": $exit_code,
  "generated_at": "$(json_escape "$(date '+%Y-%m-%dT%H:%M:%S%z')")",
  "contract": {
    "file": "$(json_escape "$contract_file")",
    "status": "$([[ "$contract_exit" -eq 0 ]] && printf pass || printf fail)",
    "command": "$(json_escape "$contract_command")",
    "exit_code": $contract_exit
  },
  "review": {
    "file": "$(json_escape "${review_file:-}")",
    "status": "$(json_escape "$review_status")",
    "message": "$(json_escape "$review_message")"
  }
}
EOF_CHECKS
fi

if [[ "$exit_code" -eq 0 ]]; then
  echo "Sprint verification passed"
else
  echo "Sprint verification failed" >&2
fi

exit "$exit_code"
