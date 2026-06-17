#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/verify-contract.sh --contract <contract-file> [--strict] [--quiet] [--read-only] [--report-file <path>]

Options:
  --contract <path>     Contract markdown file with a YAML exit_criteria block
  --strict              Exit with code 1 when any criteria fail
  --quiet               Suppress per-check logs; only print on failure or status change
  --read-only           Do not rewrite the contract Status header; tests_pass and
                        commands_succeed still execute for verification
  --report-file <path>  Write structured JSON results for downstream tooling
USAGE_EOF
}

strip_quotes() {
  local value="$1"
  value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
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

resolve_bun_bin() {
  if [[ -n "${BUN_BIN:-}" ]] && [[ -x "${BUN_BIN}" ]]; then
    printf '%s' "$BUN_BIN"
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    command -v bun
    return 0
  fi

  if [[ -x "${HOME}/.bun/bin/bun" ]]; then
    printf '%s' "${HOME}/.bun/bin/bun"
    return 0
  fi

  return 1
}

resolve_run_id() {
  if [[ -n "${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-}}}" ]]; then
    printf '%s' "${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-}}}"
    return
  fi

  printf 'run-%s-%s' "$(date '+%Y%m%dT%H%M%S')" "$$"
}

read_contract_status() {
  local file="$1"
  awk '/^> \*\*Status\*\*:/ {sub(/^.*> \*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

read_contract_review_file() {
  local file="$1"
  local line=""
  local value=""

  line="$(grep -m 1 -E '^> \*\*Review File\*\*:' "$file" || true)"
  [[ -n "$line" ]] || return 0

  if [[ "$line" == *\`* ]]; then
    value="${line#*\`}"
    value="${value%%\`*}"
  else
    value="${line#*> **Review File**:}"
  fi

  printf '%s' "$value" | tr -d '\r' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

read_contract_task_profile() {
  local file="$1"
  awk '/^> \*\*Task Profile\*\*:/ {sub(/^.*> \*\*Task Profile\*\*:[[:space:]]*/, ""); gsub(/\r/, ""); print; exit}' "$file" | xargs
}

contract_allowed_paths() {
  local file="$1"
  awk '
    BEGIN { in_block = 0; block = ""; found = 0 }
    /^```yaml[[:space:]]*$/ {
      in_block = 1
      block = ""
      next
    }
    /^```[[:space:]]*$/ && in_block == 1 {
      if (!found && block ~ /(^|[[:space:]])allowed_paths:/) {
        printf "%s", block
        found = 1
      }
      in_block = 0
      block = ""
      next
    }
    in_block == 1 {
      block = block $0 ORS
    }
  ' "$file" | awk '
    function trim(s) {
      gsub(/^[[:space:]]+/, "", s)
      gsub(/[[:space:]]+$/, "", s)
      return s
    }
    /^[[:space:]]*allowed_paths:[[:space:]]*$/ { in_paths = 1; next }
    in_paths && /^[^[:space:]]/ { exit }
    in_paths && /^[[:space:]]*-[[:space:]]*/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]*/, "", line)
      gsub(/^["'\''`]+|["'\''`]+$/, "", line)
      print trim(line)
    }
  '
}

review_recommends_pass() {
  local review_file="$1"
  [[ -n "$review_file" && -f "$review_file" ]] || return 1
  grep -Eq '^> \*\*Recommendation\*\*:[[:space:]]*pass[[:space:]]*$' "$review_file"
}

review_score() {
  local review_file="$1"
  local dimension="$2"

  [[ -n "$review_file" && -f "$review_file" ]] || return 1

  awk -F'|' -v wanted="$dimension" '
    function trim(s) {
      gsub(/^[[:space:]]+/, "", s)
      gsub(/[[:space:]]+$/, "", s)
      return s
    }
    BEGIN { wanted = tolower(wanted) }
    /^\|/ {
      dim = tolower(trim($2))
      score = trim($3)
      if (dim == wanted && match(score, /[0-9]+/)) {
        print substr(score, RSTART, RLENGTH)
        exit
      }
    }
  ' "$review_file"
}

update_contract_status() {
  local file="$1"
  local status="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  awk -v next_status="$status" '
    BEGIN { updated = 0 }
    {
      if (!updated && $0 ~ /^> \*\*Status\*\*:/) {
        print "> **Status**: " next_status
        updated = 1
        next
      }
      print
    }
    END {
      if (!updated) {
        print ""
        print "> **Status**: " next_status
      }
    }
  ' "$file" > "$tmp_file"

  mv "$tmp_file" "$file"
}

append_result() {
  local kind="$1"
  local target="$2"
  local passed="$3"
  local message="$4"
  RESULT_KINDS+=("$kind")
  RESULT_TARGETS+=("$target")
  RESULT_PASSED+=("$passed")
  RESULT_MESSAGES+=("$message")
}

log_check() {
  local prefix="$1"
  local message="$2"

  if [[ "$quiet" -eq 1 ]]; then
    return
  fi

  echo "[$prefix] $message"
}

pass() {
  local kind="$1"
  local target="$2"
  local message="$3"
  total=$((total + 1))
  append_result "$kind" "$target" "true" "$message"
  log_check "PASS" "$message"
}

fail() {
  local kind="$1"
  local target="$2"
  local message="$3"
  total=$((total + 1))
  failed=$((failed + 1))
  append_result "$kind" "$target" "false" "$message"
  log_check "FAIL" "$message"
}

write_report() {
  local report_path="$1"
  local idx

  [[ -n "$report_path" ]] || return 0

  mkdir -p "$(dirname "$report_path")"

  {
    echo "{"
    printf '  "contract": "%s",\n' "$(json_escape "$contract_file")"
    printf '  "run_id": "%s",\n' "$(json_escape "$run_id")"
    printf '  "previous_status": "%s",\n' "$(json_escape "$previous_status")"
    printf '  "next_status": "%s",\n' "$(json_escape "$next_status")"
    printf '  "failure_class": "%s",\n' "$(json_escape "$failure_class")"
    printf '  "quiet": %s,\n' "$([[ "$quiet" -eq 1 ]] && echo true || echo false)"
    printf '  "strict": %s,\n' "$([[ "$strict" -eq 1 ]] && echo true || echo false)"
    printf '  "read_only": %s,\n' "$([[ "$read_only" -eq 1 ]] && echo true || echo false)"
    printf '  "executes_contract_commands": %s,\n' "$([[ "$executes_contract_commands" -eq 1 ]] && echo true || echo false)"
    printf '  "total": %s,\n' "$total"
    printf '  "failed": %s,\n' "$failed"
    echo '  "results": ['
    for idx in "${!RESULT_KINDS[@]}"; do
      if [[ "$idx" -gt 0 ]]; then
        echo ","
      fi
      printf '    {"kind":"%s","target":"%s","passed":%s,"message":"%s"}' \
        "$(json_escape "${RESULT_KINDS[$idx]}")" \
        "$(json_escape "${RESULT_TARGETS[$idx]}")" \
        "${RESULT_PASSED[$idx]}" \
        "$(json_escape "${RESULT_MESSAGES[$idx]}")"
    done
    echo
    echo "  ]"
    echo "}"
  } > "$report_path"
}

contract_file=""
strict=0
quiet=0
read_only=0
report_file=""
run_id="$(resolve_run_id)"
failure_class=""
executes_contract_commands=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --contract)
      [[ -n "${2:-}" ]] || { echo "Error: --contract requires a value" >&2; usage; exit 2; }
      contract_file="$2"
      shift 2
      ;;
    --strict)
      strict=1
      shift
      ;;
    --quiet)
      quiet=1
      shift
      ;;
    --read-only)
      read_only=1
      shift
      ;;
    --report-file)
      [[ -n "${2:-}" ]] || { echo "Error: --report-file requires a value" >&2; usage; exit 2; }
      report_file="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$contract_file" ]]; then
  echo "Error: --contract is required" >&2
  usage
  exit 2
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

if [[ ! -f "$contract_file" ]]; then
  echo "[ContractVerify] Contract file not found: $contract_file" >&2
  exit 2
fi

previous_status="$(read_contract_status "$contract_file")"
previous_status="${previous_status:-Pending}"

yaml_block="$(
  awk '
    BEGIN { in_block = 0; block = ""; found = 0 }
    /^```yaml[[:space:]]*$/ {
      in_block = 1
      block = ""
      next
    }
    /^```[[:space:]]*$/ && in_block == 1 {
      if (block ~ /(^|[[:space:]])exit_criteria:/) {
        printf "%s", block
        found = 1
        exit
      }
      in_block = 0
      block = ""
      next
    }
    in_block == 1 {
      block = block $0 ORS
    }
  ' "$contract_file"
)"

if [[ -z "$yaml_block" ]]; then
  next_status="Pending"
  if [[ "$read_only" -eq 0 ]]; then
    update_contract_status "$contract_file" "$next_status"
  fi
  total=0
  failed=0
  failure_class="missing_artifact"
  RESULT_KINDS=()
  RESULT_TARGETS=()
  RESULT_PASSED=()
  RESULT_MESSAGES=()
  write_report "$report_file"
  if [[ "$quiet" -eq 0 ]]; then
    echo "[ContractVerify] No YAML exit criteria block found in $contract_file"
  elif [[ "$previous_status" != "$next_status" ]]; then
    echo "[ContractVerify] status ${previous_status} -> ${next_status}"
  fi
  if [[ "$strict" -eq 1 ]]; then
    exit 1
  fi
  exit 0
fi

declare -a files_exist=()
declare -a tests_pass=()
declare -a commands_succeed=()
declare -a artifacts_exist=()
declare -a contain_paths=()
declare -a contain_patterns=()
declare -a files_not_exist=()
declare -a not_contain_paths=()
declare -a not_contain_patterns=()
declare -a qa_dimensions=()
declare -a qa_mins=()
declare -a manual_checks=()

section=""
pending_path=""
pending_dimension=""
review_file="$(read_contract_review_file "$contract_file" || true)"
task_profile="$(read_contract_task_profile "$contract_file" || true)"
declare -a allowed_paths=()
while IFS= read -r allowed_path; do
  [[ -n "$allowed_path" ]] && allowed_paths+=("$allowed_path")
done < <(contract_allowed_paths "$contract_file")

while IFS= read -r raw_line; do
  line="$(printf '%s' "$raw_line" | sed -E 's/[[:space:]]+$//')"
  trimmed="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//')"

  [[ -z "$trimmed" ]] && continue
  [[ "$trimmed" =~ ^# ]] && continue
  [[ "$trimmed" == "exit_criteria:" ]] && continue

  case "$trimmed" in
    files_exist:)
      section="files_exist"
      pending_path=""
      continue
      ;;
    tests_pass:)
      section="tests_pass"
      pending_path=""
      continue
      ;;
    commands_succeed:)
      section="commands_succeed"
      pending_path=""
      continue
      ;;
    artifacts_exist:)
      section="artifacts_exist"
      pending_path=""
      continue
      ;;
    files_contain:)
      section="files_contain"
      pending_path=""
      continue
      ;;
    files_not_exist:)
      section="files_not_exist"
      pending_path=""
      continue
      ;;
    files_not_contain:)
      section="files_not_contain"
      pending_path=""
      continue
      ;;
    qa_scores:)
      section="qa_scores"
      pending_path=""
      pending_dimension=""
      continue
      ;;
    manual_checks:)
      section="manual_checks"
      pending_path=""
      continue
      ;;
  esac

  case "$section" in
    files_exist|commands_succeed|files_not_exist|artifacts_exist|manual_checks)
      if [[ "$trimmed" =~ ^-[[:space:]]*(.+)$ ]]; then
        item="$(strip_quotes "${BASH_REMATCH[1]}")"
        [[ -n "$item" ]] || continue
        if [[ "$section" == "files_exist" ]]; then
          files_exist+=("$item")
        elif [[ "$section" == "commands_succeed" ]]; then
          commands_succeed+=("$item")
        elif [[ "$section" == "artifacts_exist" ]]; then
          artifacts_exist+=("$item")
        elif [[ "$section" == "manual_checks" ]]; then
          manual_checks+=("$item")
        else
          files_not_exist+=("$item")
        fi
      fi
      ;;
    tests_pass)
      if [[ "$trimmed" =~ ^-[[:space:]]*path:[[:space:]]*(.+)$ ]]; then
        item="$(strip_quotes "${BASH_REMATCH[1]}")"
        [[ -n "$item" ]] && tests_pass+=("$item")
      fi
      ;;
    files_contain|files_not_contain)
      if [[ "$trimmed" =~ ^-[[:space:]]*path:[[:space:]]*(.+)$ ]]; then
        pending_path="$(strip_quotes "${BASH_REMATCH[1]}")"
      elif [[ "$trimmed" =~ ^pattern:[[:space:]]*(.+)$ ]]; then
        pattern="$(strip_quotes "${BASH_REMATCH[1]}")"
        if [[ -n "$pending_path" ]]; then
          if [[ "$section" == "files_contain" ]]; then
            contain_paths+=("$pending_path")
            contain_patterns+=("$pattern")
          else
            not_contain_paths+=("$pending_path")
            not_contain_patterns+=("$pattern")
          fi
          pending_path=""
        fi
      fi
      ;;
    qa_scores)
      if [[ "$trimmed" =~ ^-[[:space:]]*dimension:[[:space:]]*(.+)$ ]]; then
        pending_dimension="$(strip_quotes "${BASH_REMATCH[1]}")"
      elif [[ "$trimmed" =~ ^dimension:[[:space:]]*(.+)$ ]]; then
        pending_dimension="$(strip_quotes "${BASH_REMATCH[1]}")"
      elif [[ "$trimmed" =~ ^min:[[:space:]]*([0-9]+)$ ]]; then
        if [[ -n "$pending_dimension" ]]; then
          qa_dimensions+=("$pending_dimension")
          qa_mins+=("${BASH_REMATCH[1]}")
          pending_dimension=""
        fi
      fi
      ;;
  esac
done <<< "$yaml_block"
if ((${#tests_pass[@]} || ${#commands_succeed[@]})); then
  executes_contract_commands=1
fi

total=0
failed=0
RESULT_KINDS=()
RESULT_TARGETS=()
RESULT_PASSED=()
RESULT_MESSAGES=()

case "$task_profile" in
  "")
    pass "task_profile" "(legacy)" "task_profile missing: legacy contract accepted"
    ;;
  code-change|docs-only|ledger-closeout|migration|eval-only|delegated-run)
    pass "task_profile" "$task_profile" "task_profile: $task_profile"
    ;;
  *)
    fail "task_profile" "$task_profile" "unsupported task_profile: $task_profile"
    ;;
esac

if [[ -n "$task_profile" ]]; then
  for path in "${allowed_paths[@]+"${allowed_paths[@]}"}"; do
    case "$task_profile:$path" in
      ledger-closeout:src/*|ledger-closeout:src/|ledger-closeout:tests/*|ledger-closeout:tests/|ledger-closeout:.ai/hooks/*|ledger-closeout:.ai/hooks/|ledger-closeout:assets/hooks/*|ledger-closeout:assets/hooks/)
        fail "allowed_paths" "$path" "ledger-closeout profile cannot allow runtime code or hook paths by default: $path"
        ;;
      docs-only:src/*|docs-only:src/|docs-only:tests/*|docs-only:tests/)
        fail "allowed_paths" "$path" "docs-only profile cannot allow src/ or tests/ by default: $path"
        ;;
      eval-only:src/*|eval-only:src/)
        fail "allowed_paths" "$path" "eval-only profile cannot allow runtime src/ by default: $path"
        ;;
    esac
  done
fi

if ((${#files_exist[@]})); then
  for path in "${files_exist[@]}"; do
    if [[ -e "$path" ]]; then
      pass "files_exist" "$path" "files_exist: $path"
    else
      fail "files_exist" "$path" "files_exist: $path"
    fi
  done
fi

if ((${#artifacts_exist[@]})); then
  for path in "${artifacts_exist[@]}"; do
    if [[ -e "$path" ]]; then
      pass "artifacts_exist" "$path" "artifacts_exist: $path"
    else
      fail "artifacts_exist" "$path" "artifacts_exist: $path"
    fi
  done
fi

if ((${#tests_pass[@]})); then
  for path in "${tests_pass[@]}"; do
    if [[ ! -f "$path" ]]; then
      fail "tests_pass" "$path" "tests_pass file missing: $path"
      continue
    fi

    bun_bin="$(resolve_bun_bin || true)"
    if [[ -z "$bun_bin" ]]; then
      fail "tests_pass" "$path" "tests_pass cannot run (bun not found): $path"
      continue
    fi

    if "$bun_bin" test "$path" >"$tmp_dir/contract-test.log" 2>&1; then
      pass "tests_pass" "$path" "tests_pass: $path"
    else
      fail "tests_pass" "$path" "tests_pass: $path"
    fi
  done
fi

if ((${#commands_succeed[@]})); then
  for cmd in "${commands_succeed[@]}"; do
    if env -u BASH_ENV bash --noprofile --norc -c "$cmd" >"$tmp_dir/contract-command.log" 2>&1; then
      pass "commands_succeed" "$cmd" "commands_succeed: $cmd"
    else
      fail "commands_succeed" "$cmd" "commands_succeed: $cmd"
    fi
  done
fi

if ((${#qa_dimensions[@]})); then
  for idx in "${!qa_dimensions[@]}"; do
    dimension="${qa_dimensions[$idx]}"
    min_score="${qa_mins[$idx]}"
    score="$(review_score "$review_file" "$dimension" || true)"

    if [[ "$score" =~ ^[0-9]+$ && "$score" -ge "$min_score" ]]; then
      pass "qa_scores" "$dimension" "qa_scores: $dimension ${score}/${min_score}"
    else
      fail "qa_scores" "$dimension" "qa_scores: $dimension score ${score:-missing} < $min_score"
    fi
  done
fi

if ((${#manual_checks[@]})); then
  for check in "${manual_checks[@]}"; do
    case "$check" in
      "Evaluator review file recommends pass")
        if review_recommends_pass "$review_file"; then
          pass "manual_checks" "$check" "manual_checks: $check"
        else
          fail "manual_checks" "$check" "manual_checks: $check"
        fi
        ;;
      *)
        fail "manual_checks" "$check" "manual_checks unsupported: $check"
        ;;
    esac
  done
fi

if ((${#contain_paths[@]})); then
  for idx in "${!contain_paths[@]}"; do
    path="${contain_paths[$idx]}"
    pattern="${contain_patterns[$idx]}"

    if [[ ! -f "$path" ]]; then
      fail "files_contain" "$path" "files_contain missing file: $path"
      continue
    fi

    if grep -Eq "$pattern" "$path"; then
      pass "files_contain" "$path" "files_contain: $path =~ $pattern"
    else
      fail "files_contain" "$path" "files_contain: $path !~ $pattern"
    fi
  done
fi

if ((${#files_not_exist[@]})); then
  for path in "${files_not_exist[@]}"; do
    if [[ ! -e "$path" ]]; then
      pass "files_not_exist" "$path" "files_not_exist: $path"
    else
      fail "files_not_exist" "$path" "files_not_exist: $path"
    fi
  done
fi

if ((${#not_contain_paths[@]})); then
  for idx in "${!not_contain_paths[@]}"; do
    path="${not_contain_paths[$idx]}"
    pattern="${not_contain_patterns[$idx]}"

    if [[ ! -f "$path" ]]; then
      pass "files_not_contain" "$path" "files_not_contain missing file: $path"
      continue
    fi

    if grep -Eq "$pattern" "$path"; then
      fail "files_not_contain" "$path" "files_not_contain: $path =~ $pattern"
    else
      pass "files_not_contain" "$path" "files_not_contain: $path !~ $pattern"
    fi
  done
fi

next_status="Fulfilled"
if [[ "$total" -eq 0 ]]; then
  next_status="Pending"
elif [[ "$failed" -gt 0 ]]; then
  next_status="Partial"
  failure_class="contract_failure"
fi

if [[ "$read_only" -eq 0 ]]; then
  update_contract_status "$contract_file" "$next_status"
fi
write_report "$report_file"

if [[ "$quiet" -eq 1 ]]; then
  if [[ "$failed" -gt 0 || "$previous_status" != "$next_status" ]]; then
    echo "[ContractVerify] total=$total failed=$failed status=${previous_status}->${next_status}"
  fi
else
  echo "[ContractVerify] total=$total failed=$failed status=$next_status"
fi

if [[ "$strict" -eq 1 && "$failed" -gt 0 ]]; then
  exit 1
fi
