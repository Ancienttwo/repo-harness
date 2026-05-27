#!/bin/bash
# Prompt Guard Hook — UserPromptSubmit
# Detects bug-fix / feature requests and injects TDD/BDD context.
# Detects research/plan annotation changes and enforces "don't implement yet".

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/workflow-state.sh"

is_execution_approval_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "^[[:space:][:punct:]]*(please[[:space:][:punct:]]+)?(go ahead([[:space:]]+(with[[:space:]]+(it|this|that)|please))?|go|proceed([[:space:]]+(with[[:space:]]+(it|this|that)|please))?|approved|approve([[:space:]]+(it|this|that))?|ship it|let'?s go|继续执行|批准执行|批准|可以干(了|吧)?|可以(开始|执行)(了|吧)?|直接改(了|吧)?|整|整吧|开干|干吧|做吧|走起)([[:space:][:punct:]]+please)?[[:space:][:punct:]]*$"
}

is_implement_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "(implement|execute|build it|do it|go ahead|proceed|ship it|实现|执行|开始写|动手|开干)" || is_execution_approval_intent
}

is_done_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "(done|complete|completed|finished|mark done|完成|结束|收工)"
}

is_spa_day_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "(spa day|audit rules|consolidate|cleanup rules|规则清理|规则审计|合并规则|瘦身)"
}

is_plan_creation_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "(new plan|create plan|write plan|draft plan|新建计划|创建计划|写计划|制定计划|补计划)"
}

is_think_plan_start_intent() {
  if echo "$PROMPT_TEXT" | grep -qEi "(fix|patch|bug|error|crash|broken|regression|报错|崩溃|修复|不工作|跑不通|为什么.*错)"; then
    return 1
  fi
  echo "$PROMPT_TEXT" | grep -qEi '(/think|[$]think|\[[$]think\]|plan this|plan it|how should i|how should we|出方案|给方案|怎么设计|用什么方案|制定计划|写计划|新建计划|创建计划)'
}

derive_plan_start_title() {
  local title="$PROMPT_TEXT"
  title="$(printf '%s' "$title" | tr '\r\n' '  ' | sed -E 's/[[:space:]]+/ /g; s/^[[:space:][:punct:]]+//; s/[[:space:]]+$//')"
  title="$(printf '%s' "$title" | sed -E 's/\[[$]think\]\([^)]*\)/think/g; s/[$]think/think/g; s#/think#think#g')"
  if [[ -z "$title" ]]; then
    title="Planning Session"
  fi
  printf '%s' "$title" | cut -c 1-96
}

derive_plan_start_slug() {
  local title slug
  title="$(derive_plan_start_title)"
  slug="$(printf '%s' "$title" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"
  if [[ -z "$slug" || "$slug" = "think" || "$slug" = "plan" ]]; then
    slug="think-plan-$(date +%H%M%S)"
  fi
  printf '%s' "$slug" | cut -c 1-64 | sed -E 's/-+$//'
}

maybe_start_plan_workflow() {
  is_think_plan_start_intent || return 0

  local active_plan slug title
  active_plan="$(get_active_plan || true)"
  if [[ -n "$active_plan" && -f "$active_plan" ]]; then
    echo "[PlanStartGate] Think/plan intent detected. Active plan already exists: $active_plan"
    return 0
  fi

  if [[ ! -x "scripts/ensure-task-workflow.sh" ]]; then
    echo "[PlanStartGate] Think/plan intent detected, but scripts/ensure-task-workflow.sh is missing. Continue with planning and capture manually."
    return 0
  fi

  slug="$(derive_plan_start_slug)"
  title="$(derive_plan_start_title)"
  echo "[PlanStartGate] Think/plan intent detected. Starting file-backed Draft plan workflow."
  bash "scripts/ensure-task-workflow.sh" --slug "$slug" --title "$title"
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

is_agentic_packaging_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "(repeated workflow|reusable workflow|workflow packaging|package into (a )?skill|make this (a )?skill|subagent or automation|skill or automation|skill/subagent/automation|重复(手工)?工作|重复工作流|做成[[:space:]]*(skill|subagent|automation)|包装成(skill|subagent|automation|技能|自动化)|抽象成(skill|subagent|automation|技能|自动化)|沉淀成(工作流|skill|技能|自动化)|做成[[:space:]]*(hook|钩子).*触发|触发用户授权.*(plan|计划|方案))"
}

emit_agentic_packaging_hint() {
  if is_agentic_packaging_intent; then
    echo "[AgenticDevRoute] Reusable workflow packaging intent detected."
    echo "[AgenticDevRoute] Suggested route: agentic-dev-autoplan after user authorization; hook will not plan or create assets."
  fi
}

emit_waza_route_hint() {
  if is_agentic_packaging_intent; then
    return
  fi

  if echo "$PROMPT_TEXT" | grep -qEi "(agent|agents|codex|claude|hook|hooks|workflow|tooling|config|AGENTS\\.md|CLAUDE\\.md|健康度|健康检查|配置检查|配置|钩子|工作流|技能配置|AI coding|agent instructions)"; then
    echo "[WazaRoute] Agent workflow/tooling intent detected. Default route: Waza /health."
    return
  fi

  if echo "$PROMPT_TEXT" | grep -qEi "(review|check|pre-merge|before merge|release|publish|push|验收|检查|提交|发布|推送|合并前)"; then
    echo "[WazaRoute] Review/release intent detected. Default route: Waza /check."
  fi
}

PROMPT_TEXT="$(hook_get_prompt "${1:-}")"

emit_agentic_packaging_hint
emit_waza_route_hint

implement_intent=0
if is_implement_intent; then
  implement_intent=1
fi

execution_approval_intent=0
if is_execution_approval_intent; then
  execution_approval_intent=1
fi

done_intent=0
if is_done_intent; then
  done_intent=1
fi

if is_plan_creation_intent || is_think_plan_start_intent; then
  if ! has_research_for_new_plan; then
    latest_plan="$(get_latest_plan || true)"
    if [[ -n "$latest_plan" ]]; then
      echo "[ResearchGate] tasks/research.md must exist and be newer than $latest_plan before creating a new plan."
      hook_structured_error \
        "ResearchGate" \
        "Research is missing or older than the latest plan ($latest_plan)." \
        "Update tasks/research.md with fresh findings before drafting a new plan." \
        "missing_artifact"
      exit 1
    else
      echo "[ResearchGate] WARNING: tasks/research.md does not exist yet. Consider creating it with current findings before drafting the plan."
      echo "  首次创建计划：建议先写 tasks/research.md，但不阻塞。"
    fi
  fi
fi

if [ "$implement_intent" -eq 0 ] && [ "$done_intent" -eq 0 ]; then
  maybe_start_plan_workflow
fi

if [ "$implement_intent" -eq 0 ]; then
  if [ -f "tasks/todo.md" ] && has_changes "tasks/todo.md"; then
    echo "[PlanGuard] tasks/todo.md has been modified. Read annotations and update the plan. Do not implement yet."
  fi

  if [ -f "tasks/lessons.md" ] && has_changes "tasks/lessons.md"; then
    echo "[LessonGuard] tasks/lessons.md has updates. Review prevention rules before coding."
  fi

  if [ -f "tasks/research.md" ] && has_changes "tasks/research.md"; then
    echo "[ResearchGuard] tasks/research.md updated. Review research deeply before planning or implementation."
  fi

  changed_plan="$(has_changes_glob '^plans/plan-.*\.md$' || true)"
  if [ -n "$changed_plan" ]; then
    echo "[AnnotationGuard] ${changed_plan} has annotations. Process all notes and revise. Do not implement yet."
  fi
fi

if [ "$implement_intent" -eq 1 ]; then
  if [ ! -f "docs/spec.md" ]; then
    echo "[SpecGuard] Missing docs/spec.md. Create stable product truth before implementation."
    hook_structured_error \
      "SpecGuard" \
      "Implementation requested without docs/spec.md." \
      "Run bash scripts/new-spec.sh and capture stable product intent before implementing." \
      "missing_artifact"
    exit 1
  fi

  active_plan="$(get_active_plan || true)"
  if [ -z "$active_plan" ] || [ ! -f "$active_plan" ]; then
    if [ "$execution_approval_intent" -eq 1 ]; then
      echo "[PlanCaptureGate] Approval detected before an active plan artifact exists."
      echo "[PlanCaptureGate] Let the agent run the approved-plan capture path now:"
      echo "  git status --short --branch -uall"
      echo "  printf '%s\n' '<approved plan body>' | bash scripts/capture-plan.sh --slug <slug> --title <title> --status Approved --source waza-think --route planning --execute"
      exit 0
    fi

    echo "[PlanStatusGuard] No active plan found in plans/. Capture the approved planning output with: bash scripts/capture-plan.sh --slug <slug> --title <title> --status Approved --execute"
    echo "[PlanStatusGuard] If there is no captured planning output yet, run: bash scripts/ensure-task-workflow.sh --slug <slug> --title <title>"
    hook_structured_error \
      "PlanStatusGuard" \
      "No active plan found in plans/." \
      "Capture the approved planning output with bash scripts/capture-plan.sh --slug <slug> --title <title> --status Approved --execute, or run bash scripts/ensure-task-workflow.sh --slug <slug> --title <title> when no planning output exists." \
      "missing_artifact"
    exit 1
  fi

  plan_status="$(get_plan_status "$active_plan")"
  if [ "$plan_status" = "Draft" ] || [ "$plan_status" = "Annotating" ]; then
    if [ "$execution_approval_intent" -eq 1 ]; then
      echo "[PlanCaptureGate] Approval detected for $plan_status plan: $active_plan"
      echo "[PlanCaptureGate] Recapture the exact approved plan body with --status Approved --execute, or mark this plan Approved and run:"
      echo "  bash scripts/plan-to-todo.sh --plan $active_plan"
      exit 0
    fi

    echo "[PlanStatusGuard] Plan status is '$plan_status' in $active_plan. Complete annotation cycle first."
    hook_structured_error \
      "PlanStatusGuard" \
      "Plan status is $plan_status in $active_plan." \
      "Complete the annotation cycle and move the plan to Approved before implementation." \
      "state_violation"
    exit 1
  fi

  if [ "$plan_status" = "Approved" ] || [ "$plan_status" = "Executing" ]; then
    if ! evidence_error="$(plan_evidence_contract_error "$active_plan")"; then
      echo "[EvidenceContractGuard] Plan Evidence Contract is incomplete in $active_plan:"
      printf '%s\n' "$evidence_error"
      hook_structured_error \
        "EvidenceContractGuard" \
        "Implementation requested without a complete plan Evidence Contract." \
        "Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before implementation." \
        "quality_gate"
      exit 1
    fi

    if [ "$plan_status" = "Approved" ] && [ "$execution_approval_intent" -eq 1 ]; then
      contract_file="$(workflow_active_contract || true)"
      todo_source="$(get_todo_source_plan || true)"
      if [ -z "$contract_file" ] || [ ! -f "$contract_file" ] || [ "$todo_source" != "$active_plan" ]; then
        echo "[PlanExecutionGate] Approval detected for approved plan: $active_plan"
        echo "[PlanExecutionGate] Project the approved plan before implementation:"
        echo "  bash scripts/plan-to-todo.sh --plan $active_plan"
        exit 0
      fi
    fi

    contract_file="$(workflow_active_contract || true)"
    if [ -z "$contract_file" ] || [ ! -f "$contract_file" ]; then
      echo "[ContractGuard] Missing active sprint contract for $active_plan"
      hook_structured_error \
        "ContractGuard" \
        "Implementation requested without an active sprint contract." \
        "Run bash scripts/new-sprint.sh --slug <slug> --title <title> or create tasks/contracts/<slug>.contract.md first." \
        "missing_artifact"
      exit 1
    fi

    todo_source="$(get_todo_source_plan || true)"
    if [ "$todo_source" != "$active_plan" ]; then
      echo "[TodoGuard] Active plan is '$plan_status' in $active_plan but tasks/todo.md is not synchronized."
      echo "[TodoGuard] Run: bash scripts/plan-to-todo.sh --plan $active_plan"
      echo "[TodoGuard] Or if switching between plans: bash scripts/switch-plan.sh --plan $active_plan"
      hook_structured_error \
        "TodoGuard" \
        "tasks/todo.md is not synchronized with $active_plan." \
        "Run bash scripts/plan-to-todo.sh --plan $active_plan or bash scripts/switch-plan.sh --plan $active_plan" \
        "state_violation"
      exit 1
    fi
  fi
fi

if [ "$done_intent" -eq 1 ]; then
  active_plan="$(get_active_plan || true)"
  if [ -z "$active_plan" ] || [ ! -f "$active_plan" ]; then
    echo "[ContractGuard] Done intent detected, but no active plan found. Complete plan workflow first."
    hook_structured_error \
      "ContractGuard" \
      "Done intent detected without an active plan." \
      "Finish the plan workflow and ensure plans/ contains the active plan before marking work done." \
      "state_violation"
    exit 1
  fi

  contract_file="$(derive_contract_path "$active_plan" || true)"
  if [ -z "$contract_file" ]; then
    echo "[ContractGuard] Could not derive contract path from plan: $active_plan"
    hook_structured_error \
      "ContractGuard" \
      "Could not derive a contract path from $active_plan." \
      "Rename the plan to plan-<timestamp>-<slug>.md so the matching contract can be resolved." \
      "missing_artifact"
    exit 1
  fi

  if [ ! -f "$contract_file" ]; then
    echo "[ContractGuard] Missing task contract: $contract_file"
    hook_structured_error \
      "ContractGuard" \
      "Missing task contract $contract_file." \
      "Create the contract or regenerate tasks from the active plan before marking work done." \
      "missing_artifact"
    exit 1
  fi

  if ! evidence_error="$(plan_evidence_contract_error "$active_plan")"; then
    echo "[EvidenceContractGuard] Plan Evidence Contract is incomplete in $active_plan:"
    printf '%s\n' "$evidence_error"
    hook_structured_error \
      "EvidenceContractGuard" \
      "Done intent detected without a complete plan Evidence Contract." \
      "Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before marking work done." \
      "quality_gate"
    exit 1
  fi

  if [ -f "scripts/verify-contract.sh" ]; then
    if ! bash "scripts/verify-contract.sh" --contract "$contract_file" --strict; then
      echo "[ContractGuard] Contract verification failed: $contract_file"
      hook_structured_error \
        "ContractGuard" \
        "Contract verification failed for $contract_file." \
        "Resolve the failing exit criteria in the contract before marking work done." \
        "contract_failure"
      exit 1
    fi
  else
    echo "[ContractGuard] verify-contract.sh not found at scripts/verify-contract.sh (degraded mode: skipping strict verification)."
  fi

  review_file="$(workflow_active_review || true)"
  if [ -z "$review_file" ] || [ ! -f "$review_file" ]; then
    echo "[ReviewGuard] Missing sprint review: ${review_file:-tasks/reviews/<slug>.review.md}"
    hook_structured_error \
      "ReviewGuard" \
      "Done intent detected without a sprint review artifact." \
      "Create tasks/reviews/<slug>.review.md and record an evaluator recommendation before marking work done." \
      "quality_gate"
    exit 1
  fi

  if ! workflow_review_recommends_pass "$review_file"; then
    echo "[ReviewGuard] Sprint review does not recommend pass: $review_file"
    hook_structured_error \
      "ReviewGuard" \
      "Sprint review is missing a passing recommendation." \
      "Update the review with fresh evidence and a pass recommendation before marking work done." \
      "quality_gate"
    exit 1
  fi

  checks_file="$(workflow_checks_file)"
  if [ ! -f "$checks_file" ]; then
    echo "[EvidenceGuard] Missing structured checks file: $checks_file"
    hook_structured_error \
      "EvidenceGuard" \
      "Done intent detected without structured verification evidence." \
      "Run the relevant checks so .ai/harness/checks/latest.json exists before marking work done." \
      "quality_gate"
    exit 1
  fi

  if ! checks_error="$(workflow_checks_pass "$checks_file" "$contract_file" "$review_file")"; then
    echo "[EvidenceGuard] $checks_error"
    hook_structured_error \
      "EvidenceGuard" \
      "$checks_error" \
      "Run bash scripts/verify-sprint.sh so .ai/harness/checks/latest.json records a passing current sprint verification." \
      "quality_gate"
    exit 1
  fi
fi

if is_spa_day_intent; then
  if [ -f "docs/reference-configs/handoff-protocol.md" ]; then
    echo "[HarnessMaintenance] Follow docs/reference-configs/handoff-protocol.md and sprint-contracts.md when consolidating workflow rules."
  else
    echo "[HarnessMaintenance] harness protocol docs missing. Add docs/reference-configs/handoff-protocol.md."
  fi
fi

# --- TDD/BDD Context Injection ---
if echo "$PROMPT_TEXT" | grep -qEi "(fix|patch|bug|修复|修bug|修 bug|改bug)"; then
  echo "[TDD] Bug-fix intent detected. Reproduce with a failing test first."
  echo "  检测到修复请求：先写失败测试复现问题，再重写实现。"
fi
if echo "$PROMPT_TEXT" | grep -qEi "(new feature|feature|implement|build|新功能|实现|开发功能|执行)"; then
  echo "[BDD] Feature intent detected. Define Given-When-Then acceptance scenarios first."
  echo "  检测到新功能请求：先定义 Given-When-Then 验收场景。"
fi
