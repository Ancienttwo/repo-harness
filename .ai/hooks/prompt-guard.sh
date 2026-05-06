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

is_implement_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "(implement|execute|build it|do it|实现|执行|开始写|动手)"
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

PROMPT_TEXT="$(hook_get_prompt "${1:-}")"

implement_intent=0
if is_implement_intent; then
  implement_intent=1
fi

done_intent=0
if is_done_intent; then
  done_intent=1
fi

if is_plan_creation_intent; then
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
    echo "[PlanStatusGuard] No active plan found in plans/. Run: bash scripts/ensure-task-workflow.sh --slug <slug> --title <title>"
    hook_structured_error \
      "PlanStatusGuard" \
      "No active plan found in plans/." \
      "Run bash scripts/ensure-task-workflow.sh --slug <slug> --title <title> before implementation." \
      "missing_artifact"
    exit 1
  fi

  plan_status="$(get_plan_status "$active_plan")"
  if [ "$plan_status" = "Draft" ] || [ "$plan_status" = "Annotating" ]; then
    echo "[PlanStatusGuard] Plan status is '$plan_status' in $active_plan. Complete annotation cycle first."
    hook_structured_error \
      "PlanStatusGuard" \
      "Plan status is $plan_status in $active_plan." \
      "Complete the annotation cycle and move the plan to Approved before implementation." \
      "state_violation"
    exit 1
  fi

  if [ "$plan_status" = "Approved" ] || [ "$plan_status" = "Executing" ]; then
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
