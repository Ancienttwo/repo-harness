#!/bin/bash
set -euo pipefail

usage() {
  cat <<'USAGE_EOF'
Usage: scripts/check-task-workflow.sh [--strict]
USAGE_EOF
}

strict=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --strict)
      strict=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

issues=0
WORKFLOW_CONTRACT_PATH=".ai/harness/workflow-contract.json"
policy_file=".ai/harness/policy.json"
json_runtime=""

report_issue() {
  local message="$1"
  echo "[workflow] $message"
  issues=$((issues + 1))
}

resolve_json_runtime() {
  if command -v node >/dev/null 2>&1; then
    printf 'node'
    return 0
  fi

  if command -v bun >/dev/null 2>&1; then
    printf 'bun'
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
    return 0
  fi

  return 1
}

contract_query_lines() {
  local selector="$1"
  local runtime

  runtime="$(resolve_json_runtime || true)"
  if [[ -z "$runtime" || ! -f "$WORKFLOW_CONTRACT_PATH" ]]; then
    return 1
  fi

  case "$runtime" in
    python3)
      "$runtime" - "$WORKFLOW_CONTRACT_PATH" "$selector" <<'PY_EOF'
import json
import sys

path, selector = sys.argv[1], sys.argv[2]
value = json.load(open(path, "r", encoding="utf-8"))
for part in selector.split("."):
    value = value.get(part) if isinstance(value, dict) else None
if isinstance(value, list):
    for item in value:
        print(item)
elif value is not None:
    print(value)
PY_EOF
      ;;
    *)
      "$runtime" -e '
const fs = require("fs");
const [, filePath, selector] = process.argv;
let value = JSON.parse(fs.readFileSync(filePath, "utf8"));
for (const part of selector.split(".")) {
  value = value && typeof value === "object" ? value[part] : undefined;
}
if (Array.isArray(value)) {
  for (const item of value) {
    console.log(item);
  }
} else if (value !== undefined && value !== null) {
  console.log(value);
}
' "$WORKFLOW_CONTRACT_PATH" "$selector"
      ;;
  esac
}

ACTIVE_PLAN_MARKER=".ai/harness/active-plan"
LEGACY_ACTIVE_PLAN_MARKER=".claude/.active-plan"
ACTIVE_WORKTREE_MARKER=".ai/harness/active-worktree"

read_active_plan_marker() {
  local marker_file="$1"
  local marker_plan

  if [[ -f "$marker_file" ]]; then
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && -f "$marker_plan" ]]; then
      printf '%s' "$marker_plan"
      return 0
    fi
  fi

  return 1
}

get_active_plan() {
  read_active_plan_marker "$ACTIVE_PLAN_MARKER" \
    || read_active_plan_marker "$LEGACY_ACTIVE_PLAN_MARKER"
}

extract_status() {
  local file="$1"
  # Trim with sed, not xargs: xargs aborts on unbalanced quotes in user-edited
  # status text, which would kill the whole check under set -e.
  awk '/\*\*Status\*\*:/ {sub(/^.*\*\*Status\*\*: */, ""); gsub(/\r/, ""); print; exit}' "$file" \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

plan_evidence_contract_error() {
  local file="$1"
  local section=""
  local missing=0

  section="$(awk '
    BEGIN { in_section = 0 }
    /^## Evidence Contract[[:space:]]*$/ { in_section = 1; next }
    in_section && /^## / { exit }
    in_section { print }
  ' "$file")"

  if [[ -z "$(printf '%s' "$section" | tr -d '[:space:]')" ]]; then
    echo "missing ## Evidence Contract section"
    return 1
  fi

  local label line value
  for label in "State/progress path" "Verification evidence" "Evaluator rubric" "Stop condition" "Rollback surface"; do
    line="$(printf '%s\n' "$section" | grep -Ei "^[[:space:]]*-[[:space:]]*(\\*\\*)?${label}(\\*\\*)?[[:space:]]*:" | head -1 || true)"
    if [[ -z "$line" ]]; then
      echo "missing field: ${label}"
      missing=1
      continue
    fi

    value="${line#*:}"
    value="$(printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [[ -z "$value" ]] || printf '%s' "$value" | grep -Eiq '^(tbd|todo|n/a|none|unknown|\.\.\.)$'; then
      echo "field has no concrete value: ${label}"
      missing=1
    fi
  done

  [[ "$missing" -eq 0 ]]
}

check_plan_template_evidence_contract() {
  local file="$1"
  local label

  grep -Eq '^## Evidence Contract[[:space:]]*$' "$file" || {
    report_issue "Plan template is missing ## Evidence Contract: $file"
    return
  }

  for label in "State/progress path" "Verification evidence" "Evaluator rubric" "Stop condition" "Rollback surface"; do
    if ! grep -Eiq "^[[:space:]]*-[[:space:]]*(\\*\\*)?${label}(\\*\\*)?[[:space:]]*:" "$file"; then
      report_issue "Plan template Evidence Contract is missing field '${label}': $file"
    fi
  done
}

todo_source_plan() {
  if [[ ! -f "${todo_file:-tasks/todos.md}" ]]; then
    return 1
  fi
  awk -F': ' '/^\> \*\*Source Plan\*\*:/ {print $2; exit}' "${todo_file:-tasks/todos.md}" | xargs
}

todo_is_deferred_ledger() {
  local file="${1:-${todo_file:-tasks/todos.md}}"
  [[ -f "$file" ]] || return 1
  grep -Eq '^# Deferred Goal Ledger[[:space:]]*$' "$file" \
    && grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$file"
}

todo_deferred_ledger_error() {
  local file="${1:-${todo_file:-tasks/todos.md}}"
  local missing=0

  grep -Eq '^# Deferred Goal Ledger[[:space:]]*$' "$file" || {
    echo "missing '# Deferred Goal Ledger' heading"
    missing=1
  }
  grep -Eq '^> \*\*Status\*\*:[[:space:]]*Backlog[[:space:]]*$' "$file" || {
    echo "missing Backlog status"
    missing=1
  }
  grep -Eq '^## Deferred Goals[[:space:]]*$' "$file" || {
    echo "missing ## Deferred Goals section"
    missing=1
  }
  grep -Eq '\|[[:space:]]*Goal[[:space:]]*\|[[:space:]]*Why Deferred[[:space:]]*\|[[:space:]]*Tradeoff[[:space:]]*\|[[:space:]]*Revisit Trigger[[:space:]]*\|' "$file" || {
    echo "missing deferred-goal table with Tradeoff and Revisit Trigger"
    missing=1
  }

  [[ "$missing" -eq 0 ]]
}

sprint_known_status() {
  case "$1" in
    Draft|Approved|Executing|Done|Archived)
      return 0
      ;;
  esac
  return 1
}

prd_known_status() {
  case "$1" in
    Draft|Approved|Superseded)
      return 0
      ;;
  esac
  return 1
}

markdown_section_has_content() {
  local file="$1"
  local section="$2"
  awk -v section="$section" '
    $0 ~ "^## " section "[[:space:]]*$" { in_section = 1; next }
    in_section && /^## / { exit }
    !in_section { next }
    /^#/ { next }
    {
      line = $0
      gsub(/^[[:space:]]*[->]*[[:space:]]*/, "", line)
      gsub(/[[:space:]]+$/, "", line)
      if (line == "" || line == "..." || line ~ /^Replace /) next
      content = 1
    }
    END { exit content ? 0 : 1 }
  ' "$file"
}

sprint_prd_has_content() {
  local file="$1"
  markdown_section_has_content "$file" "PRD"
}

sprint_ready_error() {
  local file="$1"
  local missing=0

  if ! sprint_prd_has_content "$file"; then
    echo "PRD section is empty or placeholder-only"
    missing=1
  fi

  if ! grep -Eq '^\|[[:space:]]*#[[:space:]]*\|[[:space:]]*Status[[:space:]]*\|[[:space:]]*Task[[:space:]]*\|[[:space:]]*Mode[[:space:]]*\|[[:space:]]*Acceptance[[:space:]]*\|[[:space:]]*Plan[[:space:]]*\|' "$file"; then
    echo "missing backlog table header '| # | Status | Task | Mode | Acceptance | Plan |'"
    missing=1
  else
    local row_errors
    row_errors="$(awk -F '|' '
      /^## Backlog[[:space:]]*$/ { in_section = 1; next }
      in_section && /^## / { exit }
      !in_section { next }
      /^\|[[:space:]]*[0-9]+[[:space:]]*\|/ {
        rows++
        idx = $2; status = $3; task = $4; mode = $5; acceptance = $6
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", idx)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", status)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", task)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", mode)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", acceptance)
        if (status !~ /^\[[ xX]\]$/) printf "row %s has an invalid status cell (expected [ ] or [x])\n", idx
        if (task == "" || task == "...") printf "row %s is missing a task\n", idx
        if (mode != "contract" && mode != "inline") printf "row %s has an invalid mode (expected contract or inline)\n", idx
        if (acceptance == "" || tolower(acceptance) ~ /^(\.\.\.|tbd|todo|n\/a|none)$/) printf "row %s is missing a concrete acceptance line\n", idx
        if (acceptance == "Replace with a machine-checkable acceptance line") printf "row %s still has the template placeholder acceptance\n", idx
        seen_idx[idx]++
        if (task != "") seen_task[task]++
      }
      END {
        if (rows == 0) print "backlog table has no task rows"
        for (i in seen_idx) if (seen_idx[i] > 1) printf "duplicate backlog index %s\n", i
        for (t in seen_task) if (seen_task[t] > 1) printf "duplicate backlog task %s\n", t
      }
    ' "$file")"
    if [[ -n "$row_errors" ]]; then
      printf '%s\n' "$row_errors"
      missing=1
    fi
  fi

  [[ "$missing" -eq 0 ]]
}

prd_ready_error() {
  local file="$1"
  local missing=0

  for section in "AI Quick-Read Card" "Problem" "Acceptance Scenarios"; do
    if ! markdown_section_has_content "$file" "$section"; then
      echo "PRD section '$section' is missing or placeholder-only"
      missing=1
    fi
  done

  [[ "$missing" -eq 0 ]]
}

derive_slug() {
  basename "$1" | sed -E 's/^plan-[0-9]{8}-[0-9]{4}-//; s/\.md$//'
}

plan_contract_path() {
  local plan_file="$1" path
  path="$(awk '
    /^> \*\*Task Contract\*\*:/ {
      sub(/^> \*\*Task Contract\*\*:[[:space:]]*/, "")
      gsub(/`/, "")
      print
      exit
    }
    /^> \*\*Sprint Contract\*\*:/ {
      sub(/^> \*\*Sprint Contract\*\*:[[:space:]]*/, "")
      gsub(/`/, "")
      print
      exit
    }
  ' "$plan_file" | xargs)"

  case "$path" in
    tasks/contracts/*.contract.md)
      printf '%s' "$path"
      ;;
  esac
}

derive_contract_path() {
  local plan_file="$1"
  local explicit slug stem
  explicit="$(plan_contract_path "$plan_file")"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi

  slug="$(derive_slug "$plan_file")"
  stem="$(basename "$plan_file" | sed -E 's/^plan-//; s/\.md$//')"
  if [[ -f "tasks/contracts/${stem}.contract.md" ]] || [[ ! -f "tasks/contracts/${slug}.contract.md" ]]; then
    printf 'tasks/contracts/%s.contract.md' "$stem"
  else
    printf 'tasks/contracts/%s.contract.md' "$slug"
  fi
}

file_mtime() {
  local file="$1"
  local mtime

  mtime="$(stat -c '%Y' "$file" 2>/dev/null || true)"
  if [[ "$mtime" =~ ^[0-9]+$ ]]; then
    printf '%s' "$mtime"
    return 0
  fi

  mtime="$(stat -f '%m' "$file" 2>/dev/null || true)"
  if [[ "$mtime" =~ ^[0-9]+$ ]]; then
    printf '%s' "$mtime"
    return 0
  fi

  printf '0'
}

handoff_declares_no_active_plan() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  grep -Eiq '(^|[^[:alnum:]])No active plan([^[:alnum:]]|$)|^[[:space:]]*(-[[:space:]]*)?(Active Plan|Plan):[[:space:]]*\(none\)[[:space:]]*$' "$file"
}

resume_references_plan() {
  local file="$1"
  [[ -f "$file" ]] || return 1
  grep -Eiq '^[[:space:]]*-[[:space:]]*(Active plan|Plan):[[:space:]]+`?plans/' "$file"
}

check_handoff_resume_pair() {
  local handoff_file="$1"
  local resume_file="$2"
  local handoff_mtime resume_mtime

  [[ -f "$handoff_file" || -f "$resume_file" ]] || return 0

  if [[ -f "$handoff_file" && ! -f "$resume_file" ]]; then
    report_issue "Handoff current exists but resume packet is missing: $resume_file"
    return 0
  fi

  if [[ ! -f "$handoff_file" && -f "$resume_file" ]]; then
    report_issue "Resume packet exists but handoff current is missing: $handoff_file"
    return 0
  fi

  handoff_mtime="$(file_mtime "$handoff_file")"
  resume_mtime="$(file_mtime "$resume_file")"
  if [[ "$resume_mtime" =~ ^[0-9]+$ && "$handoff_mtime" =~ ^[0-9]+$ && "$resume_mtime" -lt "$handoff_mtime" ]]; then
    report_issue "Resume packet is older than handoff current: $resume_file < $handoff_file"
  fi

  if handoff_declares_no_active_plan "$handoff_file" && resume_references_plan "$resume_file"; then
    report_issue "Handoff current declares no active plan but resume packet references a historical plan: $resume_file"
  fi
}

check_current_resume_freshness() {
  local current_file="$1"
  local resume_file="$2"
  local current_mtime resume_mtime

  [[ -f "$current_file" && -f "$resume_file" ]] || return 0
  current_mtime="$(file_mtime "$current_file")"
  resume_mtime="$(file_mtime "$resume_file")"
  if [[ "$current_mtime" =~ ^[0-9]+$ && "$resume_mtime" =~ ^[0-9]+$ && "$resume_mtime" -lt "$current_mtime" ]]; then
    report_issue "Resume packet is older than current status snapshot: $resume_file < $current_file. Run scripts/prepare-handoff.sh --reason <reason> or scripts/codex-handoff-resume.sh."
  fi
}

check_required_file() {
  local path="$1"
  if [[ -f "$path" ]]; then
    return 0
  fi

  if [[ "$path" == .ai/harness/scripts/* ]]; then
    local helper_name="${path##*/}"
    if [[ "${helper_source:-package}" == "package" && -f "scripts/$helper_name" ]]; then
      return 0
    fi
    if [[ -f "assets/templates/helpers/$helper_name" && -f "scripts/$helper_name" ]]; then
      return 0
    fi
  fi

  report_issue "Missing required file: $path"
}

check_reference_config_stub() {
  local path="$1"
  [[ -f "$path" ]] || return 0
  grep -Fq "<!-- repo-harness: reference-config-stub v1 -->" "$path" || return 0

  local name="${path##*/}"
  local doc_id="${name%.md}"
  if ! grep -Fq "> **Doc ID**: $doc_id" "$path"; then
    report_issue "Reference config stub has wrong or missing Doc ID: $path"
  fi
  if ! grep -Fq "repo-harness docs path $doc_id" "$path"; then
    report_issue "Reference config stub is missing resolver command: $path"
  fi
}

check_reference_config_stubs() {
  local path
  if [[ ! -d "docs/reference-configs" ]]; then
    return 0
  fi
  for path in docs/reference-configs/*.md; do
    [[ -e "$path" ]] || continue
    check_reference_config_stub "$path"
  done
}

check_generation_surface_terminology() {
  local file
  local surfaces=(
    ".claude/templates/plan.template.md"
    ".claude/templates/contract.template.md"
    ".claude/templates/review.template.md"
    "scripts/capture-plan.sh"
    "scripts/new-plan.sh"
    "scripts/ensure-task-workflow.sh"
    "scripts/plan-to-todo.sh"
    "scripts/lib/project-init-lib.sh"
  )

  for file in "${surfaces[@]}"; do
    [[ -f "$file" ]] || continue
    if grep -Eq 'Sprint Contract|Sprint Review' "$file"; then
      report_issue "Legacy task artifact terminology in generation surface: $file. Use Task Contract / Task Review for new artifacts; keep verify-sprint.sh and other legacy filenames only for compatibility."
    fi
    if grep -Eq 'tasks/todo\.md|tasks/sprints/' "$file"; then
      report_issue "Legacy workflow path emitted by generation surface: $file. Migrate tasks/todo.md to tasks/todos.md and tasks/sprints/*.sprint.md to plans/sprints/."
    fi
  done
}

trace_schema_error() {
  local file="$1"
  local runtime

  [[ -s "$file" ]] || return 0
  if ! grep -q '[^[:space:]]' "$file"; then
    return 0
  fi
  if grep -Eq '^[[:space:]]*\{[[:space:]]*\}[[:space:]]*$' "$file"; then
    return 0
  fi

  runtime="$(resolve_json_runtime || true)"
  if [[ -z "$runtime" ]]; then
    echo "missing node, bun, or python3 to validate trace schema"
    return 1
  fi

  case "$runtime" in
    python3)
      "$runtime" - "$file" <<'PY_EOF'
import json
import sys

path = sys.argv[1]
try:
    data = json.load(open(path, "r", encoding="utf-8"))
except Exception as exc:
    print(f"invalid JSON: {exc}")
    sys.exit(1)

errors = []
if data.get("schema") != "repo-harness-run-trace.v1":
    errors.append("schema must be repo-harness-run-trace.v1")
for key in ["run_id", "task_profile", "active_plan", "worktree", "branch", "failure_class", "next_step"]:
    if key not in data:
        errors.append(f"missing field: {key}")
for key in ["commands", "guards", "handoffs", "files_changed"]:
    if not isinstance(data.get(key), list):
        errors.append(f"field must be an array: {key}")
for key in ["external_acceptance", "allowed_paths_check"]:
    if not isinstance(data.get(key), dict):
        errors.append(f"field must be an object: {key}")
if data.get("status") not in ["pass", "fail"]:
    errors.append("status must be pass or fail")
contract = data.get("contract")
if not (isinstance(contract, str) or (isinstance(contract, dict) and contract.get("file"))):
    errors.append("contract must be a string or object with file")
review = data.get("review")
if not (isinstance(review, str) or (isinstance(review, dict) and "file" in review)):
    errors.append("review must be a string or object with file")
if errors:
    print("; ".join(errors))
    sys.exit(1)
PY_EOF
      ;;
    *)
      "$runtime" -e '
const fs = require("fs");
const file = process.argv[1];
let data;
try {
  data = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (error) {
  console.log(`invalid JSON: ${error.message}`);
  process.exit(1);
}
const errors = [];
if (data.schema !== "repo-harness-run-trace.v1") errors.push("schema must be repo-harness-run-trace.v1");
for (const key of ["run_id", "task_profile", "active_plan", "worktree", "branch", "failure_class", "next_step"]) {
  if (!(key in data)) errors.push(`missing field: ${key}`);
}
for (const key of ["commands", "guards", "handoffs", "files_changed"]) {
  if (!Array.isArray(data[key])) errors.push(`field must be an array: ${key}`);
}
for (const key of ["external_acceptance", "allowed_paths_check"]) {
  if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key])) {
    errors.push(`field must be an object: ${key}`);
  }
}
if (!["pass", "fail"].includes(data.status)) errors.push("status must be pass or fail");
if (!(typeof data.contract === "string" || (data.contract && typeof data.contract === "object" && data.contract.file))) {
  errors.push("contract must be a string or object with file");
}
if (!(typeof data.review === "string" || (data.review && typeof data.review === "object" && "file" in data.review))) {
  errors.push("review must be a string or object with file");
}
if (errors.length) {
  console.log(errors.join("; "));
  process.exit(1);
}
' "$file"
      ;;
  esac
}

check_required_dir() {
  local path="$1"
  if [[ -d "$path" ]]; then
    return 0
  fi

  if [[ "$path" == ".ai/harness/scripts" && "${helper_source:-package}" == "package" && -d "scripts" ]]; then
    return 0
  fi

  if [[ "$path" == ".ai/harness/scripts" && -d "assets/templates/helpers" && -d "scripts" ]]; then
    return 0
  fi

  report_issue "Missing required directory: $path"
}

check_helper_runtime_files() {
  local helper_names=()
  local helper_name

  if [[ -f "$WORKFLOW_CONTRACT_PATH" ]]; then
    while IFS= read -r helper_name; do
      [[ -n "$helper_name" ]] && helper_names+=("$helper_name")
    done < <(contract_query_lines "helpers.scripts" 2>/dev/null || true)
  fi

  if [[ "${#helper_names[@]}" -eq 0 ]]; then
    helper_names=(
      new-spec.sh new-sprint.sh new-plan.sh capture-plan.sh plan-to-todo.sh
      contract-run.ts contract-worktree.sh ship-worktrees.sh archive-workflow.sh
      refresh-current-status.sh prepare-handoff.sh verify-contract.sh summarize-failures.sh
      verify-sprint.sh harness-trace-grade.sh sprint-backlog.sh check-task-sync.sh check-deploy-sql-order.sh
      check-architecture-sync.sh check-agent-tooling.sh check-context-files.sh
      check-brain-manifest.sh sync-brain-docs.sh check-skill-version.ts
      select-agent-context-blocks.sh ensure-task-workflow.sh check-task-workflow.sh
      maintenance-triage.sh heartbeat-triage.sh switch-plan.sh workflow-contract.ts
      inspect-project-state.ts migrate-workflow-docs.ts migrate-project-template.sh
      capability-resolver.ts architecture-event.ts capability-config.ts architecture-queue.sh
      archive-architecture-request.sh context-contract-sync.sh workstream-sync.sh
      prepare-codex-handoff.sh codex-handoff-resume.sh
    )
  fi

  check_required_dir "$helper_compat_dir"
  if [[ "${helper_source:-package}" != "package" ]]; then
    check_required_dir "$helper_runtime_dir"
  fi

  for helper_name in "${helper_names[@]}"; do
    check_required_file "$helper_compat_dir/$helper_name"
    if [[ "${helper_source:-package}" != "package" && "$helper_runtime_dir" != "$helper_compat_dir" ]]; then
      check_required_file "$helper_runtime_dir/$helper_name"
    fi
  done
}

policy_get() {
  local jq_path="$1"
  local default_value="$2"

  if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
    local value
    value="$(jq -r "$jq_path // empty" "$policy_file" 2>/dev/null || true)"
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  printf '%s' "$default_value"
}

todo_file="$(policy_get '.tasks.todo_file' 'tasks/todos.md')"
current_status_file="$(policy_get '.tasks.current_status_file' 'tasks/current.md')"
lessons_file="$(policy_get '.tasks.lessons_file' 'tasks/lessons.md')"
research_dir="$(policy_get '.tasks.research_dir' 'docs/researches')"
contracts_dir="$(policy_get '.tasks.contracts_dir' 'tasks/contracts')"
reviews_dir="$(policy_get '.tasks.reviews_dir' 'tasks/reviews')"
notes_dir="$(policy_get '.tasks.notes_dir' 'tasks/notes')"
workstreams_dir="$(policy_get '.tasks.workstreams_dir' 'tasks/workstreams')"
runs_dir="$(policy_get '.harness.runs_dir' '.ai/harness/runs')"
checks_file="$(policy_get '.harness.checks_file' '.ai/harness/checks/latest.json')"
helper_runtime_dir="$(policy_get '.harness.helper_runtime_dir' '.ai/harness/scripts')"
helper_compat_dir="$(policy_get '.harness.helper_compat_dir' 'scripts')"
helper_source="$(policy_get '.harness.helper_source' 'package')"
context_map_file="$(policy_get '.context.map_file' '.ai/context/context-map.json')"
handoff_file="$(policy_get '.harness.handoff_file' '.ai/harness/handoff/current.md')"
resume_file="$(policy_get '.handoff_resume.resume_packet_file' '.ai/harness/handoff/resume.md')"
sprints_dir="$(policy_get '.sprints.dir' 'plans/sprints')"
sprint_marker_file="$(policy_get '.sprints.active_marker_file' '.ai/harness/sprint/active-sprint')"
legacy_sprints_dir="tasks/sprints"
upgrade_strategy_version=""
if [[ -f "$policy_file" ]] && command -v jq >/dev/null 2>&1; then
  upgrade_strategy_version="$(policy_get '.upgrade.strategy_version' '')"
fi

check_required_dir "plans"
check_required_dir "plans/archive"
check_required_dir "plans/prds"
check_required_dir "$sprints_dir"
check_required_dir "tasks"
check_required_dir "tasks/archive"
check_required_dir "$contracts_dir"
check_required_dir "$reviews_dir"
check_required_dir "$notes_dir"
check_required_dir "$workstreams_dir"
check_required_dir ".claude/templates"
check_required_dir ".ai/context"
check_required_dir ".ai/harness"
if [[ "$helper_source" != "package" ]]; then
  check_required_dir "$helper_runtime_dir"
fi
check_required_dir "$runs_dir"

helper_file() {
  printf '%s/%s' "$helper_runtime_dir" "$1"
}

check_required_file "docs/spec.md"
check_required_file ".claude/templates/spec.template.md"
check_required_file ".claude/templates/plan.template.md"
check_required_file ".claude/templates/research.template.md"
check_required_file ".claude/templates/contract.template.md"
check_required_file ".claude/templates/review.template.md"
check_required_file ".claude/templates/implementation-notes.template.md"
check_required_file ".claude/templates/prd.template.md"
check_helper_runtime_files
check_required_file "$todo_file"
check_required_file "$current_status_file"
check_required_file "$lessons_file"
check_required_dir "$research_dir"
check_required_file "$context_map_file"
check_required_file "$policy_file"
check_required_file "$(policy_get '.information_lifecycle.external_knowledge.manifest_file' '.ai/harness/brain-manifest.json')"

if [[ -f ".claude/templates/plan.template.md" ]]; then
  check_plan_template_evidence_contract ".claude/templates/plan.template.md"
fi

if [[ -f "$policy_file" && -z "$upgrade_strategy_version" ]] && command -v jq >/dev/null 2>&1; then
  report_issue "Harness policy is missing upgrade.strategy_version; rerun migration to merge the versioned upgrade strategy."
fi

if [[ ! -f "$WORKFLOW_CONTRACT_PATH" ]]; then
  report_issue "Missing workflow contract manifest: $WORKFLOW_CONTRACT_PATH"
else
  json_runtime="$(resolve_json_runtime || true)"
  if [[ -z "$json_runtime" ]]; then
    report_issue "Missing node, bun, or python3 to read workflow contract manifest: $WORKFLOW_CONTRACT_PATH"
  else
    while IFS= read -r rel_dir; do
      [[ -z "$rel_dir" ]] && continue
      check_required_dir "$rel_dir"
    done < <(contract_query_lines "artifacts.requiredDirectories")

    while IFS= read -r rel_file; do
      [[ -z "$rel_file" ]] && continue
      check_required_file "$rel_file"
    done < <(contract_query_lines "artifacts.requiredFiles")
  fi
fi

check_reference_config_stubs
check_generation_surface_terminology
if [[ -f "$checks_file" ]] && ! trace_error="$(trace_schema_error "$checks_file")"; then
  report_issue "Latest checks trace is not repo-harness-run-trace.v1 compatible: ${trace_error//$'\n'/; }"
fi

if [[ -f "docs/plan.md" ]]; then
  report_issue "Legacy docs/plan.md detected; migrate or archive it into plans/."
fi

if [[ -f "docs/TODO.md" ]]; then
  report_issue "Legacy docs/TODO.md detected; migrate it into tasks/todos.md."
fi

if [[ "$todo_file" != "tasks/todo.md" && -f "tasks/todo.md" ]]; then
  report_issue "Legacy tasks/todo.md detected; migrate it into ${todo_file}."
fi

if [[ -f "scripts/check-deploy-sql-order.sh" ]]; then
  if ! bash "scripts/check-deploy-sql-order.sh" --quiet; then
    report_issue "Deploy SQL order check failed."
  fi
fi

if [[ -f "scripts/check-brain-manifest.sh" ]]; then
  if ! bash "scripts/check-brain-manifest.sh"; then
    report_issue "Brain manifest check failed."
  fi
fi

if [[ -f "scripts/sync-brain-docs.sh" ]]; then
  if ! bash "scripts/sync-brain-docs.sh" --check; then
    report_issue "Brain doc sync check failed."
  fi
fi

todo_source="$(todo_source_plan || true)"
if [[ -f "$todo_file" ]]; then
  if grep -q '[^[:space:]]' "$todo_file"; then
    if ! todo_is_deferred_ledger "$todo_file"; then
      report_issue "Legacy ${todo_file} detected; expected a deferred-goal ledger, not an active execution checklist."
    elif ! ledger_error="$(todo_deferred_ledger_error "$todo_file")"; then
      report_issue "${todo_file} deferred ledger is incomplete: ${ledger_error//$'\n'/; }"
    fi
  fi
fi

if [[ -d "plans/prds" ]]; then
  while IFS= read -r prd_sprint_file; do
    [[ -n "$prd_sprint_file" ]] || continue
    report_issue "Sprint backlog file is in the PRD catalog; migrate ${prd_sprint_file} into ${sprints_dir}/."
  done < <(
    find plans/prds -maxdepth 1 -type f -name '*.prd.md' -print0 2>/dev/null \
      | xargs -0 grep -El '^(# Sprint:|## Backlog[[:space:]]*$)' 2>/dev/null || true
  )

  while IFS= read -r prd_file; do
    [[ -n "$prd_file" ]] || continue
    case "$(basename "$prd_file")" in
      [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9]-*.prd.md)
        ;;
      *)
        report_issue "PRD filename must match <YYYYMMDD>-<HHMM>-<slug>.prd.md: $prd_file"
        continue
        ;;
    esac

    prd_status="$(extract_status "$prd_file")"
    if [[ -z "$prd_status" ]]; then
      report_issue "PRD is missing a '**Status**' line: $prd_file"
      continue
    fi
    if ! prd_known_status "$prd_status"; then
      report_issue "PRD has unknown status '${prd_status}': $prd_file"
      continue
    fi
    if [[ "$prd_status" == "Approved" ]]; then
      if ! prd_error="$(prd_ready_error "$prd_file")"; then
        report_issue "PRD $prd_file is not approval-ready: ${prd_error//$'\n'/; }"
      fi
    fi
  done < <(find plans/prds -maxdepth 1 -type f -name '*.prd.md' 2>/dev/null | sort)
fi

if [[ -d "$sprints_dir" ]]; then
  while IFS= read -r sprint_file; do
    [[ -n "$sprint_file" ]] || continue
    sprint_status="$(extract_status "$sprint_file")"
    if [[ -z "$sprint_status" ]]; then
      report_issue "Sprint is missing a '**Status**' line: $sprint_file"
      continue
    fi
    if ! sprint_known_status "$sprint_status"; then
      report_issue "Sprint has unknown status '${sprint_status}': $sprint_file"
      continue
    fi
    if [[ "$sprint_status" == "Approved" || "$sprint_status" == "Executing" ]]; then
      if ! sprint_error="$(sprint_ready_error "$sprint_file")"; then
        report_issue "Sprint $sprint_file is not execution-ready: ${sprint_error//$'\n'/; }"
      fi
    fi
  done < <(find "$sprints_dir" -maxdepth 1 -type f -name '*.sprint.md' 2>/dev/null | sort)
fi

if [[ "$sprints_dir" != "$legacy_sprints_dir" && -d "$legacy_sprints_dir" ]]; then
  report_issue "Legacy sprint directory detected; migrate ${legacy_sprints_dir}/*.sprint.md into ${sprints_dir}/*.sprint.md."
fi

if [[ -d "plans/prds" ]]; then
  while IFS= read -r prd_sprint_file; do
    [[ -n "$prd_sprint_file" ]] || continue
    report_issue "Sprint backlog file is in the PRD catalog; migrate ${prd_sprint_file} into ${sprints_dir}/."
  done < <(
    find plans/prds -maxdepth 1 -type f -name '*.prd.md' -print0 2>/dev/null \
      | xargs -0 grep -El '^(# Sprint:|## Backlog[[:space:]]*$)' 2>/dev/null || true
  )
fi

if [[ -f "$sprint_marker_file" ]]; then
  marker_sprint="$(sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' "$sprint_marker_file" 2>/dev/null || true)"
  if [[ -z "$marker_sprint" || ! -f "$marker_sprint" ]]; then
    report_issue "Active sprint marker does not resolve to a sprint file: ${marker_sprint:-(empty)} (marker: $sprint_marker_file)"
  else
    case "$marker_sprint" in
      "$sprints_dir"/*)
        case "$marker_sprint" in
          *..*)
            report_issue "Active sprint marker must not contain '..': $marker_sprint (marker: $sprint_marker_file)"
            ;;
        esac
        ;;
      *)
        report_issue "Active sprint marker points outside ${sprints_dir}: $marker_sprint (marker: $sprint_marker_file)"
        ;;
    esac
  fi
fi

if [[ -f "$current_status_file" ]]; then
  if ! grep -Eq '^# Current Status Snapshot[[:space:]]*$' "$current_status_file"; then
    report_issue "${current_status_file} is missing '# Current Status Snapshot' heading."
  fi
  if grep -Eq '^[[:space:]]*-[[:space:]]\[[ xX]\][[:space:]]+' "$current_status_file"; then
    report_issue "${current_status_file} must remain a read model, not a checklist."
  fi
fi

check_handoff_resume_pair "$handoff_file" "$resume_file"
check_current_resume_freshness "$current_status_file" "$resume_file"

active_plan="$(get_active_plan || true)"
if [[ -z "$active_plan" ]]; then
  if [[ -f "$ACTIVE_WORKTREE_MARKER" ]]; then
    report_issue "$ACTIVE_WORKTREE_MARKER exists but no active plan marker resolves to a plan."
  fi
else
  if [[ ! -f "$ACTIVE_WORKTREE_MARKER" ]]; then
    report_issue "Active plan marker exists but $ACTIVE_WORKTREE_MARKER is missing."
  else
    current_worktree="$(pwd -P)"
    marked_worktree="$(cat "$ACTIVE_WORKTREE_MARKER" 2>/dev/null | xargs || true)"
    if [[ -z "$marked_worktree" ]]; then
      report_issue "$ACTIVE_WORKTREE_MARKER is empty."
    elif [[ "$marked_worktree" != "$current_worktree" ]]; then
      report_issue "$ACTIVE_WORKTREE_MARKER points to $marked_worktree, expected $current_worktree."
    fi
  fi

  plan_status="$(extract_status "$active_plan")"
  if [[ -z "$plan_status" ]]; then
    report_issue "Active plan is missing a '**Status**' line: $active_plan"
  fi

  if [[ "$plan_status" == "Approved" || "$plan_status" == "Executing" ]]; then
    if ! evidence_error="$(plan_evidence_contract_error "$active_plan")"; then
      report_issue "Active $plan_status plan has incomplete Evidence Contract: $active_plan (${evidence_error//$'\n'/; })"
    fi

    contract_file="$(derive_contract_path "$active_plan")"
    if [[ ! -f "$contract_file" ]]; then
      report_issue "Active $plan_status plan is missing its task contract: $contract_file"
    elif ! grep -Eq '^> \*\*Capability ID\*\*: .+' "$contract_file"; then
      report_issue "Active task contract is missing a capability binding: $contract_file"
    fi
  fi
fi

if [[ "$issues" -eq 0 ]]; then
  echo "[workflow] OK"
  exit 0
fi

if [[ "$strict" -eq 1 ]]; then
  exit 1
fi

echo "[workflow] Found $issues issue(s); rerun with --strict to fail the check."
