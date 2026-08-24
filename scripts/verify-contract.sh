#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERIFICATION_BUDGET_MS=3600000

# Delegate evidence_requirements parsing to the one shared lib function
# (workflow_contract_evidence_requirement) instead of re-implementing a second
# parser here; sourced defensively so a missing/relocated lib fails the new
# check closed rather than crashing the whole script.
WORKFLOW_STATE_LIB="${REPO_HARNESS_WORKFLOW_STATE_LIB:-.ai/hooks/lib/workflow-state.sh}"
if [[ -f "$WORKFLOW_STATE_LIB" ]]; then
  # shellcheck disable=SC1090
  . "$WORKFLOW_STATE_LIB"
fi

now_ms() {
  if command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(String(Date.now()))'
  elif command -v bun >/dev/null 2>&1; then
    bun -e 'process.stdout.write(String(Date.now()))'
  else
    printf '%s000' "$(date +%s)"
  fi
}

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/verify-contract.sh --contract <contract-file> [--strict] [--quiet] [--read-only] [--report-file <path>] [--force-expensive-rerun --reason <text>]

Options:
  --contract <path>     Contract markdown file with a YAML exit_criteria block
  --strict              Exit with code 1 when any criteria fail
  --quiet               Suppress per-check logs; only print on failure or status change
  --read-only           Do not rewrite the contract Status header; tests_pass and
                        commands_succeed still execute for verification
  --report-file <path>  Write structured JSON results for downstream tooling
  --force-expensive-rerun
                        Execute a cached expensive pass again instead of reusing it
  --reason <text>       Required non-empty audit reason for --force-expensive-rerun
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

# Extracts the body of the markdown `## Root Cause Evidence` section (everything between
# that heading and the next `##` heading), mirroring contract-run.ts's sectionBody().
contract_root_cause_section() {
  local file="$1"
  awk '
    BEGIN { in_section = 0 }
    /^## Root Cause Evidence[[:space:]]*$/ {
      in_section = 1
      next
    }
    in_section == 1 && /^##[[:space:]]/ {
      exit
    }
    in_section == 1 {
      print
    }
  ' "$file"
}

# Extracts the inline value of a `- <field>: <value>` bullet from a Root Cause Evidence
# section body. Prints nothing (empty string) when the field is absent.
root_cause_field() {
  local section="$1"
  local field="$2"
  local line
  while IFS= read -r line; do
    if [[ "$line" =~ ^-[[:space:]]*${field}:[[:space:]]*(.+)$ ]]; then
      printf '%s' "${BASH_REMATCH[1]}" | sed -E 's/[[:space:]]+$//'
      return 0
    fi
  done <<< "$section"
  printf ''
}

# Verbatim placeholder text from the contract template's `## Root Cause Evidence`
# section (assets/templates/contract.template.md and its mirrors); a field still equal
# to this text has not been filled in. Kept in sync with contract-run.ts's
# ROOT_CAUSE_PLACEHOLDER by the shared tests/fixtures/root-cause/ fixtures rather than a
# shared library (see plan YAGNI: no cross-implementation parsing library).
root_cause_placeholder() {
  local field="$1"
  case "$field" in
    root_cause)
      printf '%s' 'one sentence naming file:line/condition (testable, not "a state issue").'
      ;;
    repro)
      printf '%s' 'the command or UI path that reproduces the symptom.'
      ;;
    regression_guard)
      printf '%s' 'path to a test that fails on the unfixed code and passes after the fix (must also appear under exit_criteria.tests_pass).'
      ;;
    pre_fix_failure_artifact)
      printf '%s' 'path to a captured run of regression_guard on the UNFIXED code. Capture with `bun test <regression_guard> > <artifact> 2>&1; echo "PRE_FIX_EXIT=$?" >> <artifact>` (no pipes — pipes swallow the exit status). The gate requires a non-zero `PRE_FIX_EXIT=` line plus the regression_guard path string in the artifact (see H2/H3).'
      ;;
  esac
}

is_concrete_root_cause_field() {
  local value="$1"
  local field="$2"
  [[ -n "$value" ]] || return 1
  [[ "$value" != *"{{"*"}}"* ]] || return 1
  local placeholder
  placeholder="$(root_cause_placeholder "$field")"
  [[ "$value" != "$placeholder" ]]
}

# Bugfix-only pre-fix failure evidence gate (see docs/reference-configs/sprint-contracts.md
# "Root Cause Evidence Gate"). Mirrors contract-run.ts's checkRootCauseEvidence: all four
# fields must be concrete, regression_guard must be listed under exit_criteria.tests_pass
# (the already-populated $tests_pass array), and pre_fix_failure_artifact must exist and
# show a genuine failure via a non-zero PRE_FIX_EXIT= line plus the regression_guard path
# string — never a "fail" substring match, since a passing bun run's own summary line
# contains "0 fail".
check_root_cause_evidence() {
  local contract_file="$1"
  local section root_cause repro regression_guard pre_fix_artifact
  section="$(contract_root_cause_section "$contract_file")"
  root_cause="$(root_cause_field "$section" "root_cause")"
  repro="$(root_cause_field "$section" "repro")"
  regression_guard="$(root_cause_field "$section" "regression_guard")"
  pre_fix_artifact="$(root_cause_field "$section" "pre_fix_failure_artifact")"

  if is_concrete_root_cause_field "$root_cause" "root_cause"; then
    pass "root_cause_evidence" "root_cause" "Root Cause Evidence: root_cause is concrete"
  else
    fail "root_cause_evidence" "root_cause" "Root Cause Evidence: root_cause is empty or still a template placeholder"
  fi

  if is_concrete_root_cause_field "$repro" "repro"; then
    pass "root_cause_evidence" "repro" "Root Cause Evidence: repro is concrete"
  else
    fail "root_cause_evidence" "repro" "Root Cause Evidence: repro is empty or still a template placeholder"
  fi

  local regression_guard_concrete=0
  if is_concrete_root_cause_field "$regression_guard" "regression_guard"; then
    regression_guard_concrete=1
    pass "root_cause_evidence" "regression_guard" "Root Cause Evidence: regression_guard is concrete"
  else
    fail "root_cause_evidence" "regression_guard" "Root Cause Evidence: regression_guard is empty or still a template placeholder"
  fi

  local pre_fix_artifact_concrete=0
  if is_concrete_root_cause_field "$pre_fix_artifact" "pre_fix_failure_artifact"; then
    pre_fix_artifact_concrete=1
    pass "root_cause_evidence" "pre_fix_failure_artifact" "Root Cause Evidence: pre_fix_failure_artifact is concrete"
  else
    fail "root_cause_evidence" "pre_fix_failure_artifact" "Root Cause Evidence: pre_fix_failure_artifact is empty or still a template placeholder"
  fi

  if [[ "$regression_guard_concrete" -eq 1 ]]; then
    local found=0
    local tp
    for tp in "${tests_pass[@]+"${tests_pass[@]}"}"; do
      if [[ "$tp" == "$regression_guard" ]]; then
        found=1
        break
      fi
    done
    if [[ "$found" -eq 1 ]]; then
      pass "root_cause_evidence" "regression_guard_in_tests_pass" "Root Cause Evidence: regression_guard $regression_guard is listed under exit_criteria.tests_pass"
    else
      fail "root_cause_evidence" "regression_guard_in_tests_pass" "Root Cause Evidence: regression_guard $regression_guard is not listed under exit_criteria.tests_pass"
    fi
  fi

  if [[ "$pre_fix_artifact_concrete" -eq 1 ]]; then
    if [[ ! -f "$pre_fix_artifact" ]]; then
      fail "root_cause_evidence" "pre_fix_failure_artifact_exists" "Root Cause Evidence: pre_fix_failure_artifact does not exist: $pre_fix_artifact"
    else
      pass "root_cause_evidence" "pre_fix_failure_artifact_exists" "Root Cause Evidence: pre_fix_failure_artifact exists: $pre_fix_artifact"

      local exit_line="" exit_value=""
      exit_line="$(grep -E '^PRE_FIX_EXIT=[0-9]+[[:space:]]*$' "$pre_fix_artifact" | tail -1 || true)"
      if [[ -n "$exit_line" ]]; then
        exit_value="$(printf '%s' "$exit_line" | sed -E 's/^PRE_FIX_EXIT=([0-9]+).*/\1/')"
      fi
      if [[ -n "$exit_value" && "$exit_value" != "0" ]]; then
        pass "root_cause_evidence" "pre_fix_failure_artifact_exit" "Root Cause Evidence: pre_fix_failure_artifact shows PRE_FIX_EXIT=$exit_value"
      else
        fail "root_cause_evidence" "pre_fix_failure_artifact_exit" "Root Cause Evidence: pre_fix_failure_artifact is missing a non-zero PRE_FIX_EXIT= line: $pre_fix_artifact"
      fi

      if [[ "$regression_guard_concrete" -eq 1 ]]; then
        if grep -qF -- "$regression_guard" "$pre_fix_artifact"; then
          pass "root_cause_evidence" "pre_fix_failure_artifact_references_guard" "Root Cause Evidence: pre_fix_failure_artifact references the regression_guard path"
        else
          fail "root_cause_evidence" "pre_fix_failure_artifact_references_guard" "Root Cause Evidence: pre_fix_failure_artifact does not reference the regression_guard path $regression_guard"
        fi
      fi
    fi
  fi
}

check_evidence_requirements() {
  local contract_file="$1"
  local requirement=""
  if declare -F workflow_contract_evidence_requirement >/dev/null 2>&1; then
    requirement="$(workflow_contract_evidence_requirement "$contract_file" 2>/dev/null || true)"
  fi
  case "$requirement" in
    required|not_applicable)
      pass "evidence_requirements" "benchmark" "Evidence Requirements: benchmark declared as $requirement"
      ;;
    *)
      fail "evidence_requirements" "benchmark" "Evidence Requirements: missing or invalid evidence_requirements.benchmark declaration in $contract_file"
      ;;
  esac
}

review_manual_check_evidence() {
  local review_file="$1"
  local manual_check="$2"
  [[ -n "$review_file" && -f "$review_file" ]] || {
    printf 'missing\t'
    return 0
  }

  awk -v wanted="$manual_check" '
    function trim(s) {
      gsub(/^[[:space:]]+/, "", s)
      gsub(/[[:space:]]+$/, "", s)
      return s
    }
    /^##[[:space:]]+Manual Check Evidence[[:space:]]*$/ {
      in_section = 1
      next
    }
    in_section && /^##[[:space:]]+/ {
      exit
    }
    !in_section {
      next
    }
    /^[[:space:]]*-[[:space:]]*\[[xX ]\][[:space:]]*/ {
      if (found) {
        exit
      }
      candidate = $0
      checked = (candidate ~ /^[[:space:]]*-[[:space:]]*\[[xX]\]/)
      sub(/^[[:space:]]*-[[:space:]]*\[[xX ]\][[:space:]]*/, "", candidate)
      if (trim(candidate) == wanted) {
        found = 1
        selected_checked = checked
      }
      next
    }
    found && /^[[:space:]]*-[[:space:]]*Evidence:[[:space:]]*/ {
      evidence = $0
      sub(/^[[:space:]]*-[[:space:]]*Evidence:[[:space:]]*/, "", evidence)
      evidence = trim(evidence)
    }
    END {
      if (!found) {
        printf "missing\t"
      } else if (!selected_checked) {
        printf "unchecked\t%s", evidence
      } else if (evidence == "") {
        printf "missing_evidence\t"
      } else {
        printf "checked\t%s", evidence
      }
    }
  ' "$review_file"
}

is_concrete_manual_evidence() {
  local evidence="$1"
  local normalized
  evidence="$(printf '%s' "$evidence" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  [[ -n "$evidence" ]] || return 1
  [[ "$evidence" != *"{{"*"}}"* ]] || return 1
  normalized="$(printf '%s' "$evidence" | tr '[:upper:]' '[:lower:]')"
  case "$normalized" in
    pending|pending:*|todo|todo:*|tbd|tbd:*|unavailable|unavailable:*|unknown|unknown:*|n/a|n/a:*|na|none|none:*|not\ run|not\ run:*|not\ executed|not\ executed:*|not\ available|not\ available:*|...|"concrete observation, command output, screenshot path, or reviewer note")
      return 1
      ;;
  esac
  return 0
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
    function normalize_dimension(s) {
      s = tolower(trim(s))
      gsub(/_/, " ", s)
      gsub(/[[:space:]]+/, " ", s)
      return s
    }
    BEGIN { wanted = normalize_dimension(wanted) }
    /^\|/ {
      dim = normalize_dimension($2)
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
  local duration_ms="${5:-null}"
  local timed_out="${6:-false}"
  local exit_code="${7:-null}"
  local signal="${8:-null}"
  local execution="${9:-evaluated}"
  local command="${10:-}"
  local cache_key="${11:-}"
  local force_reason="${12:-}"
  RESULT_KINDS+=("$kind")
  RESULT_TARGETS+=("$target")
  RESULT_PASSED+=("$passed")
  RESULT_MESSAGES+=("$message")
  RESULT_DURATIONS+=("$duration_ms")
  RESULT_TIMED_OUT+=("$timed_out")
  RESULT_EXIT_CODES+=("$exit_code")
  RESULT_SIGNALS+=("$signal")
  RESULT_EXECUTIONS+=("$execution")
  RESULT_COMMANDS+=("$command")
  RESULT_CACHE_KEYS+=("$cache_key")
  RESULT_FORCE_REASONS+=("$force_reason")
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

record_timed_result() {
  local kind="$1" target="$2" passed="$3" message="$4" duration_ms="$5" timed_out="$6" exit_code="$7" signal="${8:-null}"
  local execution="${9:-executed}" command="${10:-}" cache_key="${11:-}" force_reason="${12:-}"
  total=$((total + 1))
  if [[ "$passed" != "true" ]]; then failed=$((failed + 1)); fi
  append_result "$kind" "$target" "$passed" "$message" "$duration_ms" "$timed_out" "$exit_code" "$signal" "$execution" "$command" "$cache_key" "$force_reason"
  if [[ "$passed" == "true" ]]; then log_check "PASS" "$message"; else log_check "FAIL" "$message"; fi
}

is_evidence_producer_command() {
  local cmd="$1"
  case "$cmd" in
    *benchmark:harness*|*run-harness-profile-benchmark*|*" codex exec "*|codex\ exec\ *|*" claude -p "*|claude\ -p\ *) return 0 ;;
  esac
  # Anchored to this CLI's own `init` subcommand (repo-harness init / bun .../index.ts init)
  # so a bare word match doesn't misfire on git init, npm init, or codegraph init.
  if [[ "$cmd" =~ (^|[[:space:]])(repo-harness|([^[:space:]]*/)?index\.ts)[[:space:]]+init([[:space:]]|$) && "$cmd" != *"--dry-run"* ]]; then return 0; fi
  if [[ "$cmd" =~ (^|[[:space:]])install([[:space:]]|$) && "$cmd" != *"--dry-run"* ]]; then return 0; fi
  return 1
}

# Bounded runner logs live in the round's mktemp dir, which the EXIT trap
# destroys, so a failing criterion leaves only its exit_code in the report and
# nothing that names WHICH test or command failed. Retain the log of a failing
# criterion next to the run snapshot that shares this round's run id. Passing
# criteria retain nothing: green rounds would otherwise fill runs/ with
# multi-MB logs nobody reads.
FAILURE_LOG_DIR=".ai/harness/runs"

# Deterministic, filesystem-safe slug for a criterion (a test path or a whole
# shell command), bounded in length so a long command line cannot produce an
# unusable filename.
criterion_slug() {
  local slug
  slug="$(printf '%s' "$1" | tr -C 'A-Za-z0-9._-' '-' | sed -E 's/-+/-/g; s/^-//; s/-$//')"
  slug="${slug:-criterion}"
  printf '%s' "${slug:0:80}"
}

# Diagnostic only: a retention failure is reported but never changes the
# round's verdict, since losing a log must not turn a passing round red.
retain_failure_log() {
  local log_path="$1" criterion="$2" retained

  [[ -f "$log_path" ]] || return 0
  retained="$FAILURE_LOG_DIR/${run_id}-$(criterion_slug "$criterion").log"
  if ! mkdir -p "$FAILURE_LOG_DIR" 2>/dev/null || ! cp "$log_path" "$retained" 2>/dev/null; then
    echo "[ContractVerify] WARN: could not retain failure log for: $criterion" >&2
    return 0
  fi
  log_check "LOG" "retained failure log: $retained"
}

run_bounded() {
  local log_path="$1" result_path="$2"
  shift 2
  local runner="$SCRIPT_DIR/run-bounded-verifier-command.ts"
  [[ -f "$runner" ]] || return 127
  "$bun_bin" "$runner" \
    --deadline-ms "$verification_deadline_ms" \
    --log "$log_path" \
    --result "$result_path" \
    -- env \
      -u BASH_ENV \
      -u REPO_HARNESS_VERIFICATION_CONTEXT_FILE \
      -u REPO_HARNESS_VERIFICATION_PREFLIGHT_FILE \
      "$@"
}

# tests_pass is intentionally owned by the nearest package manifest rather than
# by the verifier's Bun invocation. This preserves package-local test runner
# configuration (for example Vitest defines or Bun preloads) and keeps one
# declared test authority for every criterion.
repository_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
repository_root="$(cd "$repository_root" && pwd -P)"
resolved_test_owner=""
resolved_test_path=""
resolved_test_command=""
test_owner_resolution_error=""

path_is_within_repository() {
  local candidate="$1"
  [[ "$candidate" == "$repository_root" || "$candidate" == "$repository_root/"* ]]
}

canonicalize_tests_pass_path() {
  local candidate="$1"
  "$bun_bin" -e '
    const { realpathSync } = require("node:fs");
    try {
      process.stdout.write(realpathSync(process.argv.at(-1)));
    } catch {
      process.exit(1);
    }
  ' -- "$candidate"
}

package_test_script_status() {
  local manifest="$1"
  "$bun_bin" -e '
    const { readFileSync } = require("node:fs");
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(process.argv.at(-1), "utf8"));
    } catch {
      process.exit(10);
    }
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) process.exit(10);
    if (manifest.scripts !== undefined && (!manifest.scripts || typeof manifest.scripts !== "object" || Array.isArray(manifest.scripts))) process.exit(10);
    if (typeof manifest.scripts?.test !== "string" || manifest.scripts.test.trim() === "") process.exit(11);
  ' -- "$manifest" >/dev/null 2>&1
}

render_package_test_command() {
  local owner="$1" test_path="$2"
  printf 'bun run --cwd %q test -- %q' "$owner" "$test_path"
}

resolve_tests_pass_owner() {
  local path="$1" candidate_path test_path ancestor manifest manifest_path manifest_status parent
  resolved_test_owner=""
  resolved_test_path=""
  resolved_test_command=""
  test_owner_resolution_error=""

  if [[ "$path" == /* ]]; then
    candidate_path="$path"
  else
    candidate_path="$repository_root/$path"
  fi

  if ! test_path="$(canonicalize_tests_pass_path "$candidate_path" 2>/dev/null)"; then
    test_owner_resolution_error="tests_pass path is symlink-ambiguous: $path"
    return 1
  fi
  if ! path_is_within_repository "$test_path"; then
    test_owner_resolution_error="tests_pass path resolves outside repository: $path"
    return 1
  fi

  ancestor="$(dirname "$test_path")"
  while path_is_within_repository "$ancestor"; do
    manifest="$ancestor/package.json"
    if [[ -e "$manifest" || -L "$manifest" ]]; then
      if ! manifest_path="$(canonicalize_tests_pass_path "$manifest" 2>/dev/null)"; then
        test_owner_resolution_error="tests_pass package manifest is symlink-ambiguous: $path"
        return 1
      fi
      if ! path_is_within_repository "$manifest_path"; then
        test_owner_resolution_error="tests_pass package manifest resolves outside repository: $path"
        return 1
      fi
      if [[ "$manifest_path" != "$manifest" ]]; then
        test_owner_resolution_error="tests_pass package manifest is symlink-ambiguous: $path"
        return 1
      fi

      if package_test_script_status "$manifest_path"; then
        resolved_test_owner="${ancestor#"$repository_root"/}"
        [[ "$ancestor" == "$repository_root" ]] && resolved_test_owner="."
        resolved_test_path="${test_path#"$ancestor"/}"
        resolved_test_command="$(render_package_test_command "$resolved_test_owner" "$resolved_test_path")"
        return 0
      else
        manifest_status=$?
      fi
      if [[ "$manifest_status" -eq 11 ]]; then
        test_owner_resolution_error="tests_pass package scripts.test is missing: $path"
      else
        test_owner_resolution_error="tests_pass package manifest is malformed: $path"
      fi
      return 1
    fi

    [[ "$ancestor" == "$repository_root" ]] && break
    parent="$(dirname "$ancestor")"
    [[ "$parent" == "$ancestor" ]] && break
    ancestor="$parent"
  done

  test_owner_resolution_error="tests_pass package owner is missing: $path"
  return 1
}

CRITERION_CACHE_ROOT=".ai/harness/runs/criteria"
criterion_cache_enabled=0
criterion_cache_key=""
criterion_cache_record=""
criterion_cache_command=""
criterion_cache_reused_duration=0
criterion_cache_reused_message=""
criterion_cache_reused_signal="null"
criterion_cache_force_reason=""
criterion_cache_block_message=""
EXPENSIVE_CRITERION_MS="${REPO_HARNESS_EXPENSIVE_CRITERION_MS:-30000}"

sha256_text() {
  "$bun_bin" -e 'const { createHash } = require("node:crypto"); process.stdout.write(createHash("sha256").update(process.argv.at(-1)).digest("hex"));' -- "$1"
}

initialize_criterion_cache() {
  local cache_component
  [[ -n "$criterion_context_file" ]] || return 0
  [[ -n "$bun_bin" && -x "$bun_bin" ]] || { echo "verify-contract: criterion cache requires Bun" >&2; return 1; }
  command -v jq >/dev/null 2>&1 || { echo "verify-contract: criterion cache requires jq" >&2; return 1; }
  [[ "$EXPENSIVE_CRITERION_MS" =~ ^[0-9]+$ ]] || { echo "verify-contract: REPO_HARNESS_EXPENSIVE_CRITERION_MS must be a non-negative integer" >&2; return 1; }
  [[ -f "$criterion_context_file" && ! -L "$criterion_context_file" ]] || { echo "verify-contract: criterion context is missing or symlinked: $criterion_context_file" >&2; return 1; }
  if ! jq -e \
    --arg root "$repository_root" \
    '.schema == "repo-harness-criterion-context.v1"
      and .repository_root == $root
      and (.subject_sha256 | test("^sha256:[0-9a-f]{64}$"))
      and (.target_revision | test("^[0-9a-f]{40}([0-9a-f]{24})?$"))
      and (.contract_sha256 | test("^sha256:[0-9a-f]{64}$"))
      and (.goal_sha256 | test("^sha256:[0-9a-f]{64}$"))
      and (.toolchain_fingerprint | test("^sha256:[0-9a-f]{64}$"))
      and (keys | sort == ["contract_sha256","goal_sha256","repository_root","schema","subject_sha256","target_revision","toolchain_fingerprint"])' \
    "$criterion_context_file" >/dev/null 2>&1; then
    echo "verify-contract: criterion context is malformed or stale for this repository" >&2
    return 1
  fi
  for cache_component in ".ai" ".ai/harness" ".ai/harness/runs" "$CRITERION_CACHE_ROOT"; do
    if [[ -L "$cache_component" || ( -e "$cache_component" && ! -d "$cache_component" ) ]]; then
      echo "verify-contract: criterion cache path is not a trusted directory: $cache_component" >&2
      return 1
    fi
  done
  mkdir -p "$CRITERION_CACHE_ROOT" || return 1
  for cache_component in ".ai" ".ai/harness" ".ai/harness/runs" "$CRITERION_CACHE_ROOT"; do
    if [[ -L "$cache_component" || ! -d "$cache_component" ]]; then
      echo "verify-contract: criterion cache path became unsafe: $cache_component" >&2
      return 1
    fi
  done
  criterion_cache_enabled=1
}

load_cached_pass() {
  [[ -f "$criterion_cache_record" && ! -L "$criterion_cache_record" ]] || return 1
  jq -e \
    --slurpfile context "$criterion_context_file" \
    --arg key "$criterion_cache_key" \
    --arg kind "$1" \
    --arg target "$2" \
    --arg command "$3" \
    '.schema == "repo-harness-criterion-result.v1"
      and .key == $key
      and .context == $context[0]
      and .criterion == {kind:$kind,target:$target,command:$command}
      and .result.passed == true
      and .result.timed_out == false
      and .result.exit_code == 0
      and (.result.duration_ms | type == "number" and . >= 0)
      and (.result.message | type == "string")
      and ((.result.signal == null) or (.result.signal | type == "string"))
      and (.expensive | type == "boolean")' \
    "$criterion_cache_record" >/dev/null 2>&1 || return 1
  criterion_cache_reused_duration="$(jq -r '.result.duration_ms' "$criterion_cache_record")"
  criterion_cache_reused_message="$(jq -r '.result.message' "$criterion_cache_record")"
  criterion_cache_reused_signal="$(jq -c '.result.signal // null' "$criterion_cache_record")"
  cached_expensive="$(jq -r '.expensive' "$criterion_cache_record")"
  return 0
}

release_criterion_cache_lock() {
  if [[ -n "$active_cache_lock" ]]; then
    rmdir "$active_cache_lock" 2>/dev/null || true
    active_cache_lock=""
  fi
}

# Return 0 to reuse, 1 to execute while holding the key lock, or 2 to fail
# closed because another verifier already owns the exact-key execution slot.
begin_criterion_cache_decision() {
  local kind="$1" target="$2" command="$3" basis lock_path
  criterion_cache_key=""
  criterion_cache_record=""
  criterion_cache_command="$command"
  criterion_cache_force_reason=""
  criterion_cache_block_message=""
  [[ "$criterion_cache_enabled" -eq 1 ]] || return 1
  criterion_reuse_enabled "$kind" "$target" || return 1

  basis="$(jq -S -c --arg kind "$kind" --arg target "$target" --arg command "$command" '. + {criterion:{kind:$kind,target:$target,command:$command}}' "$criterion_context_file")"
  criterion_cache_key="sha256:$(sha256_text "$basis")"
  criterion_cache_record="$CRITERION_CACHE_ROOT/${criterion_cache_key#sha256:}.json"
  lock_path="${criterion_cache_record}.lock"

  if load_cached_pass "$kind" "$target" "$command"; then
    if [[ "$force_expensive_rerun" -eq 0 || "$cached_expensive" != "true" ]]; then
      return 0
    fi
  fi

  if ! mkdir "$lock_path" 2>/dev/null; then
    criterion_cache_block_message="criterion execution is already in progress for exact key $criterion_cache_key"
    return 2
  fi
  active_cache_lock="$lock_path"

  # A concurrent verifier may have published while this process was acquiring
  # the lock. Recheck under the lock before permitting a process spawn.
  if load_cached_pass "$kind" "$target" "$command"; then
    if [[ "$force_expensive_rerun" -eq 0 || "$cached_expensive" != "true" ]]; then
      release_criterion_cache_lock
      return 0
    fi
    criterion_cache_force_reason="$force_reason"
    if ! rm -f "$criterion_cache_record"; then
      criterion_cache_block_message="cached pass could not be invalidated before forced execution"
      release_criterion_cache_lock
      return 2
    fi
  fi
  return 1
}

persist_passing_criterion() {
  local kind="$1" target="$2" command="$3" message="$4" duration_ms="$5" signal="$6"
  local expensive=false recorded_at tmp_record
  [[ "$criterion_cache_enabled" -eq 1 && -n "$criterion_cache_record" ]] || { release_criterion_cache_lock; return 0; }
  if [[ "$duration_ms" -ge "$EXPENSIVE_CRITERION_MS" ]]; then
    expensive=true
  fi
  recorded_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  tmp_record="$(mktemp "$CRITERION_CACHE_ROOT/.criterion.XXXXXX")"
  active_cache_tmp="$tmp_record"
  jq -n \
    --slurpfile context "$criterion_context_file" \
    --arg key "$criterion_cache_key" \
    --arg kind "$kind" \
    --arg target "$target" \
    --arg command "$command" \
    --arg message "$message" \
    --argjson duration_ms "$duration_ms" \
    --argjson signal "$signal" \
    --argjson expensive "$expensive" \
    --arg recorded_at "$recorded_at" \
    --arg run_id "$run_id" \
    '{
      schema:"repo-harness-criterion-result.v1",
      key:$key,
      context:$context[0],
      criterion:{kind:$kind,target:$target,command:$command},
      result:{passed:true,message:$message,duration_ms:$duration_ms,timed_out:false,exit_code:0,signal:$signal},
      expensive:$expensive,
      recorded_at:$recorded_at,
      run_id:$run_id
    }' > "$tmp_record"
  mv "$tmp_record" "$criterion_cache_record"
  active_cache_tmp=""
  release_criterion_cache_lock
}

is_preflight_command() {
  case "$1" in
    "bash scripts/check-task-sync.sh"|\
    "bash scripts/check-architecture-sync.sh"|\
    "bash scripts/check-deploy-sql-order.sh"|\
    "repo-harness run check-task-workflow --strict"|\
    "bash scripts/check-task-workflow.sh --strict")
      return 0
      ;;
  esac
  return 1
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
    printf '  "budget_ms": %s,\n' "$VERIFICATION_BUDGET_MS"
    printf '  "total_duration_ms": %s,\n' "$(( $(now_ms) - verification_started_ms ))"
    printf '  "timed_out": %s,\n' "$([[ "$verification_budget_exhausted" -eq 1 ]] && echo true || echo false)"
    printf '  "total": %s,\n' "$total"
    printf '  "failed": %s,\n' "$failed"
    echo '  "results": ['
    for idx in "${!RESULT_KINDS[@]}"; do
      if [[ "$idx" -gt 0 ]]; then
        echo ","
      fi
      printf '    {"kind":"%s","target":"%s","passed":%s,"message":"%s","duration_ms":%s,"timed_out":%s,"exit_code":%s,"signal":%s,"execution":"%s","command":"%s","cache_key":"%s","force_reason":"%s"}' \
        "$(json_escape "${RESULT_KINDS[$idx]}")" \
        "$(json_escape "${RESULT_TARGETS[$idx]}")" \
        "${RESULT_PASSED[$idx]}" \
        "$(json_escape "${RESULT_MESSAGES[$idx]}")" \
        "${RESULT_DURATIONS[$idx]}" \
        "${RESULT_TIMED_OUT[$idx]}" \
        "${RESULT_EXIT_CODES[$idx]}" \
        "${RESULT_SIGNALS[$idx]}" \
        "$(json_escape "${RESULT_EXECUTIONS[$idx]}")" \
        "$(json_escape "${RESULT_COMMANDS[$idx]}")" \
        "$(json_escape "${RESULT_CACHE_KEYS[$idx]}")" \
        "$(json_escape "${RESULT_FORCE_REASONS[$idx]}")"
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
criterion_context_file="${REPO_HARNESS_VERIFICATION_CONTEXT_FILE:-}"
verification_preflight_file="${REPO_HARNESS_VERIFICATION_PREFLIGHT_FILE:-}"
force_expensive_rerun=0
force_reason=""
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
    --force-expensive-rerun)
      force_expensive_rerun=1
      shift
      ;;
    --reason)
      [[ -n "${2:-}" ]] || { echo "Error: --reason requires a non-empty value" >&2; usage; exit 2; }
      force_reason="$2"
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

if [[ "$force_expensive_rerun" -eq 1 && -z "${force_reason//[[:space:]]/}" ]]; then
  echo "Error: --force-expensive-rerun requires --reason <non-empty>" >&2
  exit 2
fi
if [[ "$force_expensive_rerun" -eq 0 && -n "$force_reason" ]]; then
  echo "Error: --reason is only valid with --force-expensive-rerun" >&2
  exit 2
fi

if [[ -z "$contract_file" ]]; then
  echo "Error: --contract is required" >&2
  usage
  exit 2
fi

tmp_dir="$(mktemp -d)"
active_cache_lock=""
active_cache_tmp=""
cleanup_verify_contract() {
  if [[ -n "$active_cache_lock" ]]; then
    rmdir "$active_cache_lock" 2>/dev/null || true
  fi
  if [[ -n "$active_cache_tmp" ]]; then
    rm -f "$active_cache_tmp"
  fi
  rm -rf "$tmp_dir"
}
trap cleanup_verify_contract EXIT
verification_started_ms="$(now_ms)"
verification_deadline_ms="$((verification_started_ms + VERIFICATION_BUDGET_MS))"
verification_budget_exhausted=0

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
  RESULT_DURATIONS=()
  RESULT_TIMED_OUT=()
  RESULT_EXIT_CODES=()
  RESULT_SIGNALS=()
  RESULT_EXECUTIONS=()
  RESULT_COMMANDS=()
  RESULT_CACHE_KEYS=()
  RESULT_FORCE_REASONS=()
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
declare -a reusable_tests_pass=()
declare -a reusable_commands_succeed=()

section=""
in_exit_criteria=0
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
  if [[ "$line" == "exit_criteria:" ]]; then
    in_exit_criteria=1
    section=""
    continue
  fi
  if [[ "$line" =~ ^[^[:space:]] ]]; then
    in_exit_criteria=0
    section=""
  fi
  [[ "$in_exit_criteria" -eq 1 ]] || continue

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

reuse_section=""
in_criterion_reuse=0
while IFS= read -r raw_line; do
  line="$(printf '%s' "$raw_line" | sed -E 's/[[:space:]]+$//')"
  if [[ "$line" == "criterion_reuse:" ]]; then
    in_criterion_reuse=1
    reuse_section=""
    continue
  fi
  if [[ "$line" =~ ^[^[:space:]] ]]; then
    in_criterion_reuse=0
    reuse_section=""
  fi
  [[ "$in_criterion_reuse" -eq 1 ]] || continue
  case "$line" in
    "  tests_pass:")
      reuse_section="tests_pass"
      continue
      ;;
    "  commands_succeed:")
      reuse_section="commands_succeed"
      continue
      ;;
  esac
  if [[ "$line" =~ ^[[:space:]]{4}-[[:space:]]*(.+)$ ]]; then
    item="$(strip_quotes "${BASH_REMATCH[1]}")"
    [[ -n "$item" ]] || continue
    if [[ "$reuse_section" == "tests_pass" ]]; then
      reusable_tests_pass+=("$item")
    elif [[ "$reuse_section" == "commands_succeed" ]]; then
      reusable_commands_succeed+=("$item")
    fi
  fi
done <<< "$yaml_block"

criterion_declared() {
  local kind="$1" target="$2" candidate
  if [[ "$kind" == "tests_pass" ]]; then
    for candidate in "${tests_pass[@]+"${tests_pass[@]}"}"; do
      [[ "$candidate" == "$target" ]] && return 0
    done
  else
    for candidate in "${commands_succeed[@]+"${commands_succeed[@]}"}"; do
      [[ "$candidate" == "$target" ]] && return 0
    done
  fi
  return 1
}

criterion_reuse_enabled() {
  local kind="$1" target="$2" candidate
  if [[ "$kind" == "tests_pass" ]]; then
    for candidate in "${reusable_tests_pass[@]+"${reusable_tests_pass[@]}"}"; do
      [[ "$candidate" == "$target" ]] && return 0
    done
  else
    for candidate in "${reusable_commands_succeed[@]+"${reusable_commands_succeed[@]}"}"; do
      [[ "$candidate" == "$target" ]] && return 0
    done
  fi
  return 1
}

if ((${#tests_pass[@]} || ${#commands_succeed[@]})); then
  executes_contract_commands=1
fi

total=0
failed=0
RESULT_KINDS=()
RESULT_TARGETS=()
RESULT_PASSED=()
RESULT_MESSAGES=()
RESULT_DURATIONS=()
RESULT_TIMED_OUT=()
RESULT_EXIT_CODES=()
RESULT_SIGNALS=()
RESULT_EXECUTIONS=()
RESULT_COMMANDS=()
RESULT_CACHE_KEYS=()
RESULT_FORCE_REASONS=()

case "$task_profile" in
  "")
    pass "task_profile" "(legacy)" "task_profile missing: legacy contract accepted"
    ;;
  code-change|docs-only|ledger-closeout|migration|eval-only|delegated-run|bugfix|frontend)
    pass "task_profile" "$task_profile" "task_profile: $task_profile"
    ;;
  *)
    fail "task_profile" "$task_profile" "unsupported task_profile: $task_profile"
    ;;
esac

check_evidence_requirements "$contract_file"

for item in "${reusable_tests_pass[@]+"${reusable_tests_pass[@]}"}"; do
  if ! criterion_declared "tests_pass" "$item"; then
    fail "criterion_reuse" "$item" "criterion_reuse tests_pass target is not declared under exit_criteria"
  fi
done
for item in "${reusable_commands_succeed[@]+"${reusable_commands_succeed[@]}"}"; do
  if ! criterion_declared "commands_succeed" "$item"; then
    fail "criterion_reuse" "$item" "criterion_reuse commands_succeed target is not declared under exit_criteria"
  fi
done

if [[ "$task_profile" == "bugfix" ]]; then
  check_root_cause_evidence "$contract_file"
fi

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

if [[ "$task_profile" == "frontend" ]]; then
  frontend_design_brief_found=0
  for path in "${files_exist[@]+"${files_exist[@]}"}"; do
    base="$(basename "$path")"
    base_lower="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]')"
    if [[ "$path" == docs/design/* || "$base_lower" == *design* ]]; then
      frontend_design_brief_found=1
      break
    fi
  done
  if ((! frontend_design_brief_found)); then
    fail "files_exist" "(frontend)" "frontend profile requires a design brief artifact in files_exist"
  fi
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

verification_preflight_ready=1
if [[ -n "$verification_preflight_file" ]]; then
  if [[ ! -f "$verification_preflight_file" || -L "$verification_preflight_file" ]] || \
    ! command -v jq >/dev/null 2>&1 || \
    ! jq -e 'type == "object" and (.status | type == "string")' "$verification_preflight_file" >/dev/null 2>&1; then
    verification_preflight_ready=0
    fail "verification_preflight" "$verification_preflight_file" "verification preflight evidence is unavailable or malformed"
  elif [[ "$(jq -r '.status' "$verification_preflight_file")" != "pass" ]]; then
    verification_preflight_ready=0
    preflight_status="$(jq -r '.status' "$verification_preflight_file")"
    preflight_outside="$(jq -r '(.outside // []) | join(", ")' "$verification_preflight_file")"
    fail "allowed_paths" "$contract_file" "allowed_paths preflight ${preflight_status}${preflight_outside:+: ${preflight_outside}}"
  fi
fi

if [[ "$executes_contract_commands" -eq 1 && "$verification_preflight_ready" -eq 1 ]]; then
  bun_bin="$(resolve_bun_bin || true)"
else
  bun_bin=""
fi
criterion_cache_ready=1
if [[ "$verification_preflight_ready" -eq 0 ]]; then
  criterion_cache_ready=0
elif [[ "$executes_contract_commands" -eq 1 ]] && ! initialize_criterion_cache; then
  criterion_cache_ready=0
  fail "criterion_cache" "$criterion_context_file" "criterion cache context is unavailable or invalid"
fi

execute_test_criterion() {
  local path="$1" index="$2" decision message execution
  if [[ ! -f "$path" ]]; then
    fail "tests_pass" "$path" "tests_pass file missing: $path"
    return 0
  fi
  if [[ -z "$bun_bin" ]]; then
    fail "tests_pass" "$path" "tests_pass cannot run (bun not found): $path"
    return 0
  fi
  if ! resolve_tests_pass_owner "$path"; then
    fail "tests_pass" "$path" "$test_owner_resolution_error"
    return 0
  fi

  set +e
  begin_criterion_cache_decision "tests_pass" "$path" "$resolved_test_command"
  decision=$?
  set -e
  case "$decision" in
    0)
      record_timed_result "tests_pass" "$path" true "reused pass: $criterion_cache_reused_message" "$criterion_cache_reused_duration" false 0 "$criterion_cache_reused_signal" "reused" "$resolved_test_command" "$criterion_cache_key" ""
      return 0
      ;;
    2)
      record_timed_result "tests_pass" "$path" false "$criterion_cache_block_message" 0 false 75 null "blocked" "$resolved_test_command" "$criterion_cache_key" ""
      return 0
      ;;
  esac
  execution="executed"
  [[ -z "$criterion_cache_force_reason" ]] || execution="forced"

  result_path="$tmp_dir/test-${index}.json"
  log_path="$tmp_dir/test-${index}.log"
  set +e
  run_bounded "$log_path" "$result_path" "$bun_bin" run --cwd "$resolved_test_owner" test -- "$resolved_test_path"
  bounded_exit=$?
  set -e
  bounded_duration="$(sed -nE 's/.*"duration_ms":([0-9]+).*/\1/p' "$result_path" 2>/dev/null || true)"
  bounded_timed_out="$(sed -nE 's/.*"timed_out":(true|false).*/\1/p' "$result_path" 2>/dev/null || true)"
  bounded_signal="$(sed -nE 's/.*"signal":("[^"]*"|null).*/\1/p' "$result_path" 2>/dev/null || true)"
  bounded_duration="${bounded_duration:-0}"
  bounded_timed_out="${bounded_timed_out:-false}"
  bounded_signal="${bounded_signal:-null}"
  if [[ "$bounded_exit" -eq 0 ]]; then
    message="tests_pass: $path via $resolved_test_command (${bounded_duration}ms)"
    persist_passing_criterion "tests_pass" "$path" "$resolved_test_command" "$message" "$bounded_duration" "$bounded_signal"
    record_timed_result "tests_pass" "$path" true "$message" "$bounded_duration" false 0 "$bounded_signal" "$execution" "$resolved_test_command" "$criterion_cache_key" "$criterion_cache_force_reason"
  else
    release_criterion_cache_lock
    record_timed_result "tests_pass" "$path" false "tests_pass: $path via $resolved_test_command (${bounded_duration}ms, exit=$bounded_exit)" "$bounded_duration" "$bounded_timed_out" "$bounded_exit" "$bounded_signal" "$execution" "$resolved_test_command" "$criterion_cache_key" "$criterion_cache_force_reason"
    retain_failure_log "$log_path" "$path"
  fi
  if [[ "$bounded_timed_out" == "true" ]]; then
    verification_budget_exhausted=1
  fi
}

execute_command_criterion() {
  local cmd="$1" index="$2" decision message execution
  if is_evidence_producer_command "$cmd"; then
    record_timed_result "commands_succeed" "$cmd" false "commands_succeed forbidden evidence producer: $cmd" 0 false 126 null "rejected" "$cmd"
    return 0
  fi
  if [[ -z "$bun_bin" ]]; then
    fail "commands_succeed" "$cmd" "commands_succeed cannot run bounded (bun not found): $cmd"
    return 0
  fi

  set +e
  begin_criterion_cache_decision "commands_succeed" "$cmd" "$cmd"
  decision=$?
  set -e
  case "$decision" in
    0)
      record_timed_result "commands_succeed" "$cmd" true "reused pass: $criterion_cache_reused_message" "$criterion_cache_reused_duration" false 0 "$criterion_cache_reused_signal" "reused" "$cmd" "$criterion_cache_key" ""
      return 0
      ;;
    2)
      record_timed_result "commands_succeed" "$cmd" false "$criterion_cache_block_message" 0 false 75 null "blocked" "$cmd" "$criterion_cache_key" ""
      return 0
      ;;
  esac
  execution="executed"
  [[ -z "$criterion_cache_force_reason" ]] || execution="forced"

  result_path="$tmp_dir/command-${index}.json"
  log_path="$tmp_dir/command-${index}.log"
  set +e
  run_bounded "$log_path" "$result_path" bash --noprofile --norc -c "$cmd"
  bounded_exit=$?
  set -e
  bounded_duration="$(sed -nE 's/.*"duration_ms":([0-9]+).*/\1/p' "$result_path" 2>/dev/null || true)"
  bounded_timed_out="$(sed -nE 's/.*"timed_out":(true|false).*/\1/p' "$result_path" 2>/dev/null || true)"
  bounded_signal="$(sed -nE 's/.*"signal":("[^"]*"|null).*/\1/p' "$result_path" 2>/dev/null || true)"
  bounded_duration="${bounded_duration:-0}"
  bounded_timed_out="${bounded_timed_out:-false}"
  bounded_signal="${bounded_signal:-null}"
  if [[ "$bounded_exit" -eq 0 ]]; then
    message="commands_succeed: $cmd (${bounded_duration}ms)"
    persist_passing_criterion "commands_succeed" "$cmd" "$cmd" "$message" "$bounded_duration" "$bounded_signal"
    record_timed_result "commands_succeed" "$cmd" true "$message" "$bounded_duration" false 0 "$bounded_signal" "$execution" "$cmd" "$criterion_cache_key" "$criterion_cache_force_reason"
  else
    release_criterion_cache_lock
    record_timed_result "commands_succeed" "$cmd" false "commands_succeed: $cmd (${bounded_duration}ms, exit=$bounded_exit)" "$bounded_duration" "$bounded_timed_out" "$bounded_exit" "$bounded_signal" "$execution" "$cmd" "$criterion_cache_key" "$criterion_cache_force_reason"
    retain_failure_log "$log_path" "$cmd"
  fi
  if [[ "$bounded_timed_out" == "true" ]]; then
    verification_budget_exhausted=1
  fi
}

if [[ "$criterion_cache_ready" -eq 1 ]] && ((${#commands_succeed[@]})); then
  command_index=0
  for cmd in "${commands_succeed[@]}"; do
    if is_preflight_command "$cmd"; then
      execute_command_criterion "$cmd" "$command_index"
    fi
    command_index=$((command_index + 1))
    [[ "$verification_budget_exhausted" -eq 0 ]] || break
  done
fi

criterion_execution_ready="$criterion_cache_ready"
if [[ -n "$verification_preflight_file" && "$failed" -gt 0 ]]; then
  criterion_execution_ready=0
fi

if [[ "$criterion_execution_ready" -eq 1 && "$verification_budget_exhausted" -eq 0 ]] && ((${#tests_pass[@]})); then
  test_index=0
  for path in "${tests_pass[@]}"; do
    execute_test_criterion "$path" "$test_index"
    test_index=$((test_index + 1))
    [[ "$verification_budget_exhausted" -eq 0 ]] || break
  done
fi

if [[ "$criterion_execution_ready" -eq 1 && "$verification_budget_exhausted" -eq 0 ]] && ((${#commands_succeed[@]})); then
  command_index=0
  for cmd in "${commands_succeed[@]}"; do
    if ! is_preflight_command "$cmd"; then
      execute_command_criterion "$cmd" "$command_index"
    fi
    command_index=$((command_index + 1))
    [[ "$verification_budget_exhausted" -eq 0 ]] || break
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
    evidence_row="$(review_manual_check_evidence "$review_file" "$check")"
    evidence_status="${evidence_row%%$'\t'*}"
    evidence=""
    if [[ "$evidence_row" == *$'\t'* ]]; then
      evidence="${evidence_row#*$'\t'}"
    fi
    case "$evidence_status" in
      checked)
        if is_concrete_manual_evidence "$evidence"; then
          pass "manual_checks" "$check" "manual_checks: exact checked evidence recorded for $check"
        else
          fail "manual_checks" "$check" "manual_checks evidence is placeholder-only: $check"
        fi
        ;;
      unchecked)
        fail "manual_checks" "$check" "manual_checks evidence is unchecked: $check"
        ;;
      missing_evidence)
        fail "manual_checks" "$check" "manual_checks checked item has no evidence: $check"
        ;;
      *)
        fail "manual_checks" "$check" "manual_checks exact evidence item is missing: $check"
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
  if [[ "$verification_budget_exhausted" -eq 1 ]]; then
    failure_class="verification_budget"
  elif [[ "$verification_preflight_ready" -eq 0 ]]; then
    failure_class="allowed_paths"
  else
    failure_class="contract_failure"
  fi
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
