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
# shellcheck source=/dev/null
. "$SCRIPT_DIR/lib/session-state.sh"

is_execution_approval_intent() {
  echo "$PROMPT_TEXT" | grep -qEi "^[[:space:][:punct:]]*(please[[:space:][:punct:]]+)?(go ahead([[:space:]]+(with[[:space:]]+(it|this|that)|please))?|go|proceed([[:space:]]+(with[[:space:]]+(it|this|that)|please))?|approved|approve([[:space:]]+(it|this|that))?|ship it|let'?s go|继续执行|批准执行|批准|可以干(了|吧)?|可以(开始|执行)(了|吧)?|直接改(了|吧)?|整|整吧|开干|干吧|做吧|走起)([[:space:][:punct:]]+please)?[[:space:][:punct:]]*$"
}

prompt_has_explicit_execution_command_line() {
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "^[[:space:][:punct:]]*(please[[:space:]]+)?(implement[[:space:]]+(this|the)|execute[[:space:]]+(this|the)|start[[:space:]]+(implementation|executing|coding)|go ahead|proceed|ship it|开始(实现|执行|落实|写)|执行计划|落实计划|批准执行|批准|直接(改|做|实现|执行|落地)|动手|开干|可以(开始|执行|干)|可以干|干吧|做吧)([[:space:][:punct:]]|$)"
}

is_plan_execution_projection_intent() {
  if is_execution_approval_intent; then
    return 0
  fi

  prompt_first_nonblank_line | grep -qEi "^[[:space:][:punct:]]*(please[[:space:][:punct:]]+)?((implement|execute|run|start[[:space:]]+(implementing|executing))[[:space:]]+(this|the|approved)[[:space:]]+plan|开始(实现|执行|落实)(这个|该)?(方案|计划)|执行(这个|该)?(方案|计划)|落实(这个|该)?(方案|计划))([[:space:][:punct:]]+please)?[[:space:][:punct:]]*$"
}

is_implement_intent() {
  if is_trigger_question_prompt; then
    return 1
  fi
  if is_retrospective_completion_report_intent; then
    return 1
  fi
  if is_next_slice_or_status_advisory_intent; then
    return 1
  fi
  if is_plan_discussion_continuation_intent; then
    return 1
  fi
  if is_plan_refinement_intent; then
    return 1
  fi
  if is_diagnostic_question_intent; then
    return 1
  fi
  if is_review_release_advisory_intent; then
    return 1
  fi
  if is_passive_worktree_status_intent; then
    return 1
  fi
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(implement|execute|build it|do it|go ahead|proceed|ship it|实现|执行|开始写|动手|开干)" || is_execution_approval_intent || is_embedded_approved_plan_intent || is_plan_shaped_markdown_intent
}

is_done_intent() {
  if is_plan_refinement_intent; then
    return 1
  fi

  # Long markdown / plan-shaped prompts often contain literal "Completed" / "Done"
  # tokens as state-enum values (e.g. `[BrainPromote] pass/Completed-only`). Those
  # are *not* a user declaration that the work is done. To avoid false positives:
  #   - long prompts (>= 280 chars OR plan-shaped markdown) must declare done in
  #     the first non-blank line via an explicit completion phrase
  #   - short prompts keep the historically permissive match but require a word
  #     boundary so substrings like "completionToken" no longer trigger
  if is_plan_shaped_markdown_intent || is_embedded_approved_plan_intent; then
    prompt_first_nonblank_line | grep -qEi "^[[:space:][:punct:]]*(/done|/complete|/finish|done\.?|mark[[:space:]]+(it[[:space:]]+|this[[:space:]]+)?(as[[:space:]]+)?done|task[[:space:]]+(is[[:space:]]+)?(done|complete|completed|finished)|all[[:space:]]+done|wrap[[:space:]]+(it[[:space:]]+)?up|完成(了|啦|吧|！|。)?|结束(吧|！|。)?|可以收工|收工(了|吧)?|宣布完成|工作完成)[[:space:][:punct:]]*$"
    return $?
  fi

  local text_length
  text_length=$(printf '%s' "$PROMPT_INTENT_TEXT" | wc -c | tr -d ' ')
  if [ "${text_length:-0}" -ge 280 ]; then
    prompt_first_nonblank_line | grep -qEi "^[[:space:][:punct:]]*(/done|/complete|/finish|done\.?|mark[[:space:]]+(it[[:space:]]+|this[[:space:]]+)?(as[[:space:]]+)?done|task[[:space:]]+(is[[:space:]]+)?(done|complete|completed|finished)|all[[:space:]]+done|wrap[[:space:]]+(it[[:space:]]+)?up|完成(了|啦|吧|！|。)?|结束(吧|！|。)?|可以收工|收工(了|吧)?|宣布完成|工作完成)[[:space:][:punct:]]*$"
    return $?
  fi

  # Short prompts: require token boundaries / explicit completion phrases so
  # task instructions such as `完成后验证` do not close the active contract.
  if echo "$PROMPT_INTENT_TEXT" | grep -qEi "(^|[[:space:][:punct:]])(done|complete|completed|finished|mark[[:space:]]+done)([[:space:][:punct:]]|$)"; then
    return 0
  fi
  echo "$PROMPT_INTENT_TEXT" | grep -qE "(^|[[:space:][:punct:]，。！？!])(任务完成了?|完成(了|啦|吧)?|已完成|本轮完成|这刀完成|收尾完成|结束吧|结束任务|可以收工|收工(了|吧)?|宣布完成|工作完成)([[:space:][:punct:]，。！？!]|$)"
}

derive_done_outcome() {
  if echo "$PROMPT_INTENT_TEXT" | grep -qEi "(abandon(ed)?|drop( it)?|放弃|不做了|算了|作废|不要了|废弃)"; then
    printf '%s' "Abandoned"
    return 0
  fi
  if echo "$PROMPT_INTENT_TEXT" | grep -qEi "(supersed(ed|e)|replaced by|被.*取代|被.*替代|改用新方案|换方案)"; then
    printf '%s' "Superseded"
    return 0
  fi
  printf '%s' "Completed"
}

is_spa_day_intent() {
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(spa day|audit rules|consolidate|cleanup rules|规则清理|规则审计|合并规则|瘦身)"
}

is_plan_creation_intent() {
  is_plan_discussion_continuation_intent && return 1
  is_plan_refinement_intent && return 1
  is_diagnostic_question_intent && return 1
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(new plan|create plan|write plan|draft plan|新建计划|创建计划|写计划|制定计划|补计划)"
}

is_bug_or_hunt_intent() {
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(fix|patch|bug|error|crash|broken|regression|报错|崩溃|修复|不工作|跑不通|为什么.*错|排查|查查|定位问题|debug)"
}

is_plain_feature_plan_start_intent() {
  is_trigger_question_prompt && return 1
  is_plan_discussion_continuation_intent && return 1
  is_plan_refinement_intent && return 1
  is_diagnostic_question_intent && return 1
  is_bug_or_hunt_intent && return 1
  is_execution_approval_intent && return 1

  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(new feature|feature request|add (a )?(new )?feature|build (a|an|the)[[:space:]].*(page|screen|feature|component|module|tool|dashboard|api|endpoint|flow|app)|create (a|an|the)[[:space:]].*(page|screen|feature|component|module|tool|dashboard|api|endpoint|flow|app)|开发新功能|开发.*功能|新增功能|新功能|加.*功能|做(一个|个).*(页|页面|功能|模块|工具|组件|接口|应用|系统|面板|流程)|搭(一个|个).*(页|页面|功能|模块|工具|组件|接口|应用|系统|面板|流程)|写(一个|个).*(页|页面|功能|模块|工具|组件|接口|脚本|应用|系统|面板|流程))"
}

is_review_release_intent() {
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(review|check|pre-merge|before merge|release|publish|push|验收|检查|提交|发布|推送|合并前)"
}

is_review_release_advisory_intent() {
  is_review_release_intent || return 1
  is_embedded_approved_plan_intent && return 1
  is_plan_shaped_markdown_intent && return 1
  is_execution_approval_intent && return 1

  # Review/check prompts often say "execute /check" or "执行 checklist". Those
  # route to evaluator evidence, not implementation. Keep explicit coding verbs
  # on the implementation gate.
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(implement|build it|do it|实现|开始写|动手|开干)" && return 1
  return 0
}

is_passive_worktree_status_intent() {
  is_execution_approval_intent && return 1
  is_embedded_approved_plan_intent && return 1
  is_plan_shaped_markdown_intent && return 1
  prompt_has_explicit_execution_command_line && return 1

  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(plan-to-todo|worktree|linked worktree|隔离 worktree|分支|branch)" || return 1
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(实现会在.*worktree.*完成|会在.*worktree.*完成|已在.*worktree.*完成实现|worktree.*完成实现|implementation will .*worktree|will .*happen.*worktree|will .*complete.*worktree|implementation (has been )?(completed|done).*worktree|completed implementation.*worktree)"
}

is_retrospective_completion_report_intent() {
  is_execution_approval_intent && return 1
  is_embedded_approved_plan_intent && return 1
  is_plan_shaped_markdown_intent && return 1
  prompt_has_explicit_execution_command_line && return 1

  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(implement|execute|build|实现|执行|开发)" || return 1
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(现在已补|已补|已归档|已复跑|并已复跑|已完成|已处理|我补了|我已经|通过|passed|completed)" || return 1
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(npm|bun|pnpm|yarn|test|lint|build|check|复跑|归档|docs/|README|PRD|通过|passed)"
}

is_next_slice_or_status_advisory_intent() {
  local first

  is_execution_approval_intent && return 1
  is_embedded_approved_plan_intent && return 1
  is_plan_shaped_markdown_intent && return 1
  prompt_has_explicit_execution_command_line && return 1

  first="$(prompt_first_nonblank_line)"
  if printf '%s\n' "$first" | grep -qEi "(下一刀.*(plan|think|方案|计划)|(plan|think|方案|计划).*下一刀)"; then
    return 0
  fi

  if printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(^|[[:space:][:punct:]])下一刀([[:space:][:punct:]]|$)" \
    && printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "建议切" \
    && printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "理由是" \
    && printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "入口是"; then
    return 0
  fi

  if printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "^[[:space:]]*P1[[:space:]]*$" \
    && printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "^[[:space:]]*P2[[:space:]]*$" \
    && printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "^[[:space:]]*P3[[:space:]]*$" \
    && printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(验证结果|已在.*worktree.*完成实现|worktree.*完成实现|未提交|未[[:space:]-]*merge)"; then
    return 0
  fi

  return 1
}

prompt_matches_worktree_record() {
  local worktree_path="$1"
  local branch_name="$2"
  local path_base

  [[ -n "$worktree_path" ]] || return 1
  if printf '%s' "$PROMPT_INTENT_TEXT" | grep -Fq "$worktree_path"; then
    return 0
  fi

  path_base="$(basename "$worktree_path")"
  if [[ -n "$path_base" ]] && printf '%s' "$PROMPT_INTENT_TEXT" | grep -Fq "$path_base"; then
    return 0
  fi

  if [[ -n "$branch_name" ]] && printf '%s' "$PROMPT_INTENT_TEXT" | grep -Fq "$branch_name"; then
    return 0
  fi

  return 1
}

prompt_linked_worktree_target() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 1
  git worktree list --porcelain >/dev/null 2>&1 || return 1

  local current worktree_path branch_name line real_path active_plan
  current="$(pwd -P)"
  worktree_path=""
  branch_name=""

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ -z "$line" ]]; then
      if [[ -n "$worktree_path" ]]; then
        real_path="$(cd "$worktree_path" 2>/dev/null && pwd -P || true)"
        active_plan="$(cat "$worktree_path/.ai/harness/active-plan" 2>/dev/null | xargs || true)"
        if [[ -n "$real_path" && "$real_path" != "$current" ]] \
          && [[ -n "$active_plan" && -f "$worktree_path/$active_plan" ]] \
          && prompt_matches_worktree_record "$worktree_path" "$branch_name"; then
          printf '%s' "$worktree_path"
          return 0
        fi
      fi
      worktree_path=""
      branch_name=""
      continue
    fi

    case "$line" in
      worktree\ *)
        worktree_path="${line#worktree }"
        ;;
      branch\ *)
        branch_name="${line#branch }"
        branch_name="${branch_name#refs/heads/}"
        ;;
    esac
  done < <(git worktree list --porcelain 2>/dev/null || true)

  if [[ -n "$worktree_path" ]]; then
    real_path="$(cd "$worktree_path" 2>/dev/null && pwd -P || true)"
    active_plan="$(cat "$worktree_path/.ai/harness/active-plan" 2>/dev/null | xargs || true)"
    if [[ -n "$real_path" && "$real_path" != "$current" ]] \
      && [[ -n "$active_plan" && -f "$worktree_path/$active_plan" ]] \
      && prompt_matches_worktree_record "$worktree_path" "$branch_name"; then
      printf '%s' "$worktree_path"
      return 0
    fi
  fi

  return 1
}

is_embedded_approved_plan_intent() {
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi '^[[:space:]]*(please[[:space:]]+)?implement[[:space:]]+this[[:space:]]+plan[[:space:]]*:'
}

prompt_first_nonblank_line() {
  printf '%s\n' "$PROMPT_INTENT_TEXT" | awk 'NF { print; exit }'
}

is_trigger_question_prompt() {
  local first
  first="$(prompt_first_nonblank_line)"
  printf '%s\n' "$first" | grep -qEi '(会不会触发|会触发吗|能触发吗|可以触发吗|does this trigger|would this trigger|will this trigger|比如.*触发|例如.*触发)'
}

is_plan_refinement_intent() {
  local first
  first="$(prompt_first_nonblank_line)"

  printf '%s\n' "$first" | grep -qEi "(implement|execute|开始实现|开始执行|批准执行|直接改|动手|开干|可以干)" && return 1

  printf '%s\n' "$first" | grep -qEi "((review|critique|refine|improve|polish|完善|优化|调整|修改|补充|评审|审一下|看一下|看看|评价|帮我看|帮我审).*(plan|方案|计划|设计|claude|codex)|((plan|方案|计划|设计|claude).*(review|critique|refine|improve|polish|完善|优化|调整|修改|补充|评审|审一下|看一下|看看|评价|帮我看|帮我审)))"
}

is_explicit_execution_start_line() {
  local first
  first="$(prompt_first_nonblank_line)"
  printf '%s\n' "$first" | grep -qEi "^[[:space:][:punct:]]*(please[[:space:]]+)?(implement[[:space:]]+(this|the)|execute[[:space:]]+(this|the)|start[[:space:]]+(implementation|executing|coding)|go ahead|proceed|ship it|开始(实现|执行|落实|写)|执行计划|落实计划|批准执行|批准|直接(改|做|实现|执行|落地)|动手|开干|可以(开始|执行|干)|可以干|干吧|做吧)([[:space:][:punct:]]|$)"
}

is_plan_discussion_continuation_intent() {
  workflow_pending_orchestration_is_fresh || return 1
  is_execution_approval_intent && return 1
  is_embedded_approved_plan_intent && return 1
  is_plan_shaped_markdown_intent && return 1
  is_explicit_execution_start_line && return 1

  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(plan|方案|计划|workflow|hook|hooks|codex[[:space:]-]*plan|claude[[:space:]-]*plan|dynamic[[:space:]-]*workflow|orchestrat|active[[:space:]-]*plan|active[[:space:]-]*marker|PlanStatusGuard|PlanCaptureGate|PlanStartGate|capture|落实plan|执行门禁)" || return 1
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(继续讨论|讨论|追问|疑问|补充|调整|完善|优化|评审|review|refine|怎么|如何|为什么|为啥|不要.*机械|不能.*机械|过于机械|多轮|中断|状态|边界|弱点|补充|改一下|修一下|不合理|有风险|我觉得|是否|是不是|能不能|应该|设计)"
}

is_diagnostic_question_intent() {
  is_execution_approval_intent && return 1
  is_embedded_approved_plan_intent && return 1
  is_plan_shaped_markdown_intent && return 1

  if printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(怎么实现|如何实现|为什么.*(实现|执行|implement|execute)|why.*(implement|execute)|how.*implement|the way .*implement|implement.*interesting|执行流程.*(被拦|拦截|中断|为什么|怎么))"; then
    return 0
  fi

  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(hook|hooks|worktree|wt|PlanStatusGuard|执行路径|没开|中断|被拦|拦截|root cause|debug|排查|查查|定位)" || return 1
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi "(为什么|为啥|怎么回事|怎么.*(没|不|会|被)|why|what.*root cause|root cause|排查|查查|定位|debug|诊断|中断|被拦|拦截|执行路径|没开)"
}

active_plan_marker_problem() {
  local marker_file marker_plan owner current

  current="$(pwd -P)"
  if [[ -f "$ACTIVE_WORKTREE_MARKER" ]]; then
    owner="$(cat "$ACTIVE_WORKTREE_MARKER" 2>/dev/null | xargs)"
    if [[ -n "$owner" && "$owner" != "$current" ]]; then
      printf 'active plan marker belongs to a different worktree: %s' "$owner"
      return 0
    fi
  fi

  for marker_file in "$ACTIVE_PLAN_MARKER" "$LEGACY_ACTIVE_PLAN_MARKER"; do
    [[ -f "$marker_file" ]] || continue
    marker_plan="$(cat "$marker_file" 2>/dev/null | xargs)"
    if [[ -n "$marker_plan" && ! -f "$marker_plan" ]]; then
      printf 'stale active plan marker points to missing plan: %s' "$marker_plan"
      return 0
    fi
  done

  return 1
}

is_plan_shaped_markdown_intent() {
  local first
  is_trigger_question_prompt && return 1

  first="$(prompt_first_nonblank_line)"
  printf '%s\n' "$first" | grep -qE '^#[[:space:]]+' || return 1
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi '^##[[:space:]]+Summary[[:space:]]*$' || return 1
  printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi '(^##[[:space:]]+(Key Changes|Tests|Assumptions)[[:space:]]*$|P1[[:space:]]|P2[[:space:]]|P3[[:space:]])'
}

is_think_plan_start_intent() {
  if is_plan_discussion_continuation_intent; then
    return 1
  fi
  if is_plan_refinement_intent; then
    return 1
  fi
  if is_diagnostic_question_intent; then
    return 1
  fi
  if is_bug_or_hunt_intent; then
    return 1
  fi
  if echo "$PROMPT_INTENT_TEXT" | grep -qEi '^[[:space:][:punct:]]*(/think|[$]think|\[[$]think\])'; then
    return 0
  fi
  echo "$PROMPT_INTENT_TEXT" | grep -qEi '(plan this|plan it|how should i|how should we|出方案|给方案|怎么设计|用什么方案|制定计划|写计划|新建计划|创建计划)' || is_plain_feature_plan_start_intent
}

derive_plan_start_title() {
  local title="$PROMPT_INTENT_TEXT"
  title="$(printf '%s' "$title" | tr '\r\n' '  ' | sed -E 's/\[[$]think\]\([^)]*\)/think/g; s/[$]think/think/g; s#/think#think#g; s/[[:space:]]+/ /g; s/^[[:space:][:punct:]]+//; s/[[:space:]]+$//')"
  if [[ -z "$title" ]]; then
    title="Planning Session"
  fi
  printf '%s' "$title" | cut -c 1-96
}

derive_plan_start_slug() {
  local title slug
  title="$(derive_plan_start_title)"
  slug="$(normalize_plan_slug "$title")"
  if [[ -z "$slug" || "$slug" = "think" || "$slug" = "plan" ]]; then
    if is_plain_feature_plan_start_intent; then
      slug="feature-plan-$(date +%H%M%S)"
    else
      slug="think-plan-$(date +%H%M%S)"
    fi
  fi
  printf '%s' "$slug" | cut -c 1-64 | sed -E 's/-+$//'
}

normalize_plan_slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g'
}

maybe_start_plan_workflow() {
  is_think_plan_start_intent || return 0

  if [[ ! -x "scripts/ensure-task-workflow.sh" ]]; then
    echo "[PlanStartGate] Think/plan intent detected, but scripts/ensure-task-workflow.sh is missing. Continue with planning and capture manually."
    return 0
  fi

  local slug title before_latest after_latest draft_plan kind source_ref start_output
  slug="$(derive_plan_start_slug)"
  title="$(derive_plan_start_title)"
  before_latest="$(get_latest_plan || true)"
  kind="$(derive_pending_orchestration_kind)"
  source_ref="$title"
  echo "[PlanStartGate] Think/plan intent detected. Starting independent file-backed Draft plan workflow."
  if ! start_output="$(bash "scripts/ensure-task-workflow.sh" --new-plan --slug "$slug" --title "$title" 2>&1)"; then
    printf '%s\n' "$start_output"
    return 0
  fi
  printf '%s\n' "$start_output"
  after_latest="$(get_latest_plan || true)"
  draft_plan=""
  if [[ -n "$after_latest" && "$after_latest" != "$before_latest" ]]; then
    draft_plan="$after_latest"
  fi
  workflow_write_pending_orchestration "$kind" "${HOOK_HOST:-unknown}" "$slug" "$draft_plan" "$source_ref" "plans/plan-*.md"
}

derive_pending_orchestration_kind() {
  if printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi '(/think|[$]think|\[[$]think\]|waza[[:space:]/-]*think)'; then
    printf 'waza-think'
    return 0
  fi
  if printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi 'dynamic[[:space:]-]*workflow|workflow'; then
    printf 'dynamic-workflow'
    return 0
  fi
  if printf '%s\n' "$PROMPT_INTENT_TEXT" | grep -qEi 'codex[[:space:]-]*plan'; then
    printf 'codex-plan'
    return 0
  fi
  printf 'repo-harness-plan'
}

emit_pending_orchestration_discussion() {
  local active_plan kind source_ref source_arg
  workflow_pending_orchestration_is_fresh || return 0
  active_plan="$(get_active_plan || true)"
  [[ -z "$active_plan" || ! -f "$active_plan" ]] || return 0
  is_plan_discussion_continuation_intent || return 0
  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  source_arg=""
  [[ -n "$source_ref" ]] && source_arg=" --source-ref <source-ref>"

  echo "[PlanDiscussionGate] Pending plan/orchestration discussion is still open; continuing discussion, not implementation."
  echo "[PlanDiscussionGate] $(workflow_pending_orchestration_summary)"
  echo "[PlanDiscussionGate] When the decision is complete, capture the final plan body before editing implementation files:"
  echo "  printf '%s\n' '<decision-complete plan body>' | bash scripts/capture-plan.sh --slug <slug> --title <title> --status Draft --source ${kind:-host-plan} --orchestration-kind ${kind:-host-plan} --route planning${source_arg}"
}

emit_pending_orchestration_capture_gate() {
  local kind source_ref source_arg
  workflow_pending_orchestration_is_fresh || return 1
  kind="$(workflow_pending_orchestration_field kind 2>/dev/null || true)"
  source_ref="$(workflow_pending_orchestration_field source_ref 2>/dev/null || true)"
  source_arg=""
  [[ -n "$source_ref" ]] && source_arg=" --source-ref <source-ref>"
  echo "[PlanCaptureGate] Implementation requested while a pending plan/orchestration discussion has not been captured."
  echo "[PlanCaptureGate] $(workflow_pending_orchestration_summary)"
  echo "[PlanCaptureGate] Capture the final plan body first; if implementation is already approved, use --status Approved --execute:"
  echo "  printf '%s\n' '<approved plan body>' | bash scripts/capture-plan.sh --slug <slug> --title <title> --status Approved --source ${kind:-host-plan} --orchestration-kind ${kind:-host-plan} --route planning --execute${source_arg}"
  return 0
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

extract_embedded_approved_plan_body() {
  if ! is_embedded_approved_plan_intent && is_plan_shaped_markdown_intent; then
    printf '%s\n' "$PROMPT_INTENT_TEXT"
    return 0
  fi

  printf '%s\n' "$PROMPT_INTENT_TEXT" | awk '
    BEGIN { found = 0 }
    !found {
      line = $0
      lower = tolower(line)
      if (lower ~ /^[[:space:]]*(please[[:space:]]+)?implement[[:space:]]+this[[:space:]]+plan[[:space:]]*:/) {
        found = 1
        colon = index(line, ":")
        rest = substr(line, colon + 1)
        sub(/^[[:space:]]+/, "", rest)
        if (length(rest) > 0) {
          print rest
        }
        next
      }
    }
    found { print }
  '
}

derive_embedded_approved_plan_title() {
  local body="$1"
  local title
  title="$(printf '%s\n' "$body" | awk '
    /^#[[:space:]]*Plan:[[:space:]]*/ {
      sub(/^#[[:space:]]*Plan:[[:space:]]*/, "")
      print
      exit
    }
    /^#[[:space:]]+/ {
      sub(/^#[[:space:]]+/, "")
      print
      exit
    }
  ' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' | head -1)"
  if [[ -z "$title" ]]; then
    title="Approved Plan"
  fi
  printf '%s' "$title" | cut -c 1-96
}

maybe_capture_embedded_approved_plan() {
  is_embedded_approved_plan_intent || is_plan_shaped_markdown_intent || return 0

  if [[ ! -x "scripts/capture-plan.sh" ]]; then
    echo "[PlanCaptureGate] Embedded approved plan detected, but scripts/capture-plan.sh is missing."
    hook_structured_error \
      "PlanCaptureGate" \
      "Embedded approved plan detected but scripts/capture-plan.sh is missing." \
      "Install workflow helpers before executing an embedded approved plan." \
      "missing_artifact"
    exit 2
  fi

  local body title slug capture_output
  body="$(extract_embedded_approved_plan_body)"
  if [[ -z "$(printf '%s' "$body" | tr -d '[:space:]')" ]]; then
    echo "[PlanCaptureGate] Embedded approved plan marker has no plan body."
    hook_structured_error \
      "PlanCaptureGate" \
      "PLEASE IMPLEMENT THIS PLAN was provided without a plan body." \
      "Paste the approved plan body after the marker so scripts/capture-plan.sh can store and project it." \
      "missing_artifact"
    exit 2
  fi

  title="$(derive_embedded_approved_plan_title "$body")"
  slug="$(normalize_plan_slug "$title")"
  if [[ -z "$slug" ]]; then
    slug="approved-plan-$(date +%H%M%S)"
  fi

  echo "[PlanCaptureGate] Embedded approved plan detected. Capturing and projecting before implementation."
  if ! capture_output="$(printf '%s\n' "$body" | bash "scripts/capture-plan.sh" --slug "$slug" --title "$title" --status Approved --source user-approved-plan --route planning --execute 2>&1)"; then
    printf '%s\n' "$capture_output"
    hook_structured_error \
      "PlanCaptureGate" \
      "Embedded approved plan capture failed." \
      "Fix the capture-plan.sh or plan-to-todo.sh error before editing implementation files." \
      "state_violation"
    exit 2
  fi
  printf '%s\n' "$capture_output"
  exit 0
}

is_agentic_packaging_intent() {
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(repeated workflow|reusable workflow|workflow packaging|package into (a )?skill|make this (a )?skill|subagent or automation|skill or automation|skill/subagent/automation|重复(手工)?工作|重复工作流|做成[[:space:]]*(skill|subagent|automation)|包装成(skill|subagent|automation|技能|自动化)|抽象成(skill|subagent|automation|技能|自动化)|沉淀成(工作流|skill|技能|自动化)|做成[[:space:]]*(hook|钩子).*触发|触发用户授权.*(plan|计划|方案))"
}

emit_agentic_packaging_hint() {
  if is_agentic_packaging_intent; then
    echo "[AgenticDevRoute] Reusable workflow packaging intent detected."
    echo "[AgenticDevRoute] Suggested route: repo-harness-autoplan after user authorization; hook will not plan or create assets."
  fi
}

is_codegraph_route_intent() {
  is_trigger_question_prompt && return 1
  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(who calls|what calls|callers|callees|impact|impact radius|trace[[:space:]]+(flow|path|call)|where[[:space:]].*(defined|definition)|definition of|symbol named|调用关系|谁调用|调用了谁|哪里定义|定义在哪|影响面|调用链|追踪(路径|调用|链)|从.*到.*怎么走)"
}

is_nontrivial_code_task_intent() {
  is_trigger_question_prompt && return 1
  is_plan_discussion_continuation_intent && return 1
  is_plan_refinement_intent && return 1
  is_review_release_advisory_intent && return 1

  if is_diagnostic_question_intent && ! is_bug_or_hunt_intent; then
    return 1
  fi

  if prompt_first_nonblank_line | grep -qEi "^[[:space:][:punct:]]*(git[[:space:]]+(status|log|show|diff|push|pull|commit)|status|commit|push|merge|提交|推送|合并|看状态|看看状态)([[:space:][:punct:]]|$)"; then
    return 1
  fi

  if is_bug_or_hunt_intent || is_plain_feature_plan_start_intent || is_implement_intent; then
    return 0
  fi

  echo "$PROMPT_INTENT_TEXT" | grep -qEi "(architecture|architectural|runtime|hook|hooks|shared contract|workflow contract|module boundary|route registry|multi[- ]?file|refactor|dependency path|架构|运行时|钩子|共享合约|工作流合约|模块边界|路由表|多文件|重构|依赖路径)"
}

emit_codegraph_route_hint() {
  local session_key session_file=".claude/.session-id"

  mkdir -p .claude
  session_key="$(session_state_resolve_key "$session_file")"

  if session_state_codegraph_used "$session_key" || session_state_codegraph_nudged "$session_key"; then
    return 0
  fi

  if is_codegraph_route_intent || is_nontrivial_code_task_intent; then
    echo "[CodegraphRoute] Structural code-navigation intent detected. Prefer CodeGraph context/search/callers/impact before grep/read when available."
    session_state_mark_codegraph_nudged "$session_key" || true
  fi
}

emit_waza_route_hint() {
  if is_agentic_packaging_intent; then
    return
  fi

  if is_think_plan_start_intent; then
    echo "[WazaRoute] Planning intent detected. Default route: Waza /think."
    return
  fi

  if echo "$PROMPT_INTENT_TEXT" | grep -qEi "(agent|agents|codex|claude|hook|hooks|workflow|tooling|config|AGENTS\\.md|CLAUDE\\.md|健康度|健康检查|配置检查|配置|钩子|工作流|技能配置|AI coding|agent instructions)"; then
    echo "[WazaRoute] Agent workflow/tooling intent detected. Default route: Waza /health."
    return
  fi

  if is_review_release_intent; then
    echo "[WazaRoute] Review/release intent detected. Default route: Waza /check."
    emit_external_acceptance_prompt review
    emit_cross_review_hint merge
  fi
}

# Cross-review advisory: nudge the agent to consider an independent second
# opinion from a different-vendor model. Advisory only (echo, exit 0); the agent
# decides whether to act. Host-aware: in Codex suggest claude-review, otherwise
# (Claude) suggest codex-review. On Codex the dispatcher swallows success stdout,
# so this primarily surfaces on the Claude host; the Codex-side availability note
# is delivered once by session-start-context.sh.
emit_cross_review_hint() {
  local skill peer
  if [ "${HOOK_HOST:-claude}" = "codex" ]; then
    skill="claude-review"; peer="Claude"
  else
    skill="codex-review"; peer="Codex"
  fi
  case "${1:-}" in
    merge)
      echo "[CrossReview] Pre-merge moment — consider an independent ${peer} review of the diff via ${skill}: a different training distribution has non-overlapping blind spots. Skip if the change is trivial."
      ;;
    debug)
      echo "[CrossReview] Hard bug — ${skill} can give an independent ${peer} root-cause diagnosis. Agreeing diagnoses raise confidence; divergence shows where to dig."
      ;;
  esac
}

emit_external_acceptance_prompt() {
  local mode="${1:-review}"
  local expected_reviewer expected_source command active_plan contract_file review_file checks_file

  expected_reviewer="$(workflow_external_acceptance_expected_reviewer)"
  expected_source="$(workflow_external_acceptance_expected_source "$expected_reviewer")"
  if [ "$expected_source" = "claude-review" ]; then
    command="/claude-review"
  else
    command="codex-review"
  fi

  active_plan="$(get_active_plan || true)"
  contract_file="$(workflow_active_contract || true)"
  review_file="$(workflow_active_review || true)"
  checks_file="$(workflow_checks_file)"

  echo "[ExternalAcceptance] Review/release intent detected. Start peer acceptance in parallel with local /check."
  echo "[ExternalAcceptance] Mode: $mode"
  echo "[ExternalAcceptance] Current active plan: ${active_plan:-"(none)"}"
  echo "[ExternalAcceptance] Current contract: ${contract_file:-"(none)"}"
  echo "[ExternalAcceptance] Current review: ${review_file:-tasks/reviews/<slug>.review.md}"
  echo "[ExternalAcceptance] Current checks: $checks_file"
  echo "[ExternalAcceptance] Peer reviewer: $expected_reviewer via $command"
  echo "[ExternalAcceptance] Diff scope for peer: branch diff against target, staged diff, unstaged diff, and untracked files."
  cat <<EOF_EXTERNAL_ACCEPTANCE
[ExternalAcceptance] Prompt to send with $command:
Review the current sprint for acceptance only. Do not run /check. Do not edit files. Do not write files. Inspect the diff scope, contract, review evidence, and checks evidence, then return only a Markdown block that can be pasted into ${review_file:-tasks/reviews/<slug>.review.md}.

## External Acceptance Advice
> **External Acceptance**: pass
> **External Reviewer**: $expected_reviewer
> **External Source**: $expected_source
> **External Started**: YYYY-MM-DDTHH:MM:SS+0800
> **External Completed**: YYYY-MM-DDTHH:MM:SS+0800

- P1 blockers: none
- P2 advisories:
- Acceptance checklist: pass

If the peer CLI is unavailable, record **External Acceptance**: unavailable and include the failure reason. That does not satisfy the completion gate unless a Manual Override: line with a concrete reason is also recorded.
EOF_EXTERNAL_ACCEPTANCE
}

strip_prompt_context_blocks() {
  awk '
    /^[[:space:]]*<(skill|environment_context|INSTRUCTIONS|system|developer|app-context|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions)[^>]*>[[:space:]]*$/ {
      skip = 1
      next
    }
    /^[[:space:]]*<\/(skill|environment_context|INSTRUCTIONS|system|developer|app-context|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions)>[[:space:]]*$/ {
      skip = 0
      next
    }
    skip { next }
    { print }
  '
}

prompt_intent_text() {
  local stripped
  stripped="$(printf '%s\n' "$PROMPT_TEXT" | strip_prompt_context_blocks | sed -E '/^[[:space:]]*$/d')"
  if [[ -n "$(printf '%s' "$stripped" | tr -d '[:space:]')" ]]; then
    printf '%s' "$stripped"
  else
    printf '%s' "$PROMPT_TEXT"
  fi
}

prompt_guard_bool_flag() {
  local value=0
  if "$@"; then
    value=1
  fi
  printf '%s' "$value"
}

prompt_guard_decision_command() {
  local source_cli source_hook_cli
  source_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/index.ts"
  source_hook_cli="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)/src/cli/hook-entry.ts"

  if [[ -n "${REPO_HARNESS_HOOK_CLI:-}" && -f "${REPO_HARNESS_HOOK_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_HOOK_CLI" prompt-guard-decide
    return $?
  fi

  if [[ -n "${REPO_HARNESS_CLI:-}" && -f "${REPO_HARNESS_CLI:-}" ]] && command -v bun >/dev/null 2>&1; then
    bun "$REPO_HARNESS_CLI" prompt-guard-decide
    return $?
  fi

  if [[ -f "$source_hook_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_hook_cli" prompt-guard-decide
    return $?
  fi

  if [[ -n "${HOOK_REPO_ROOT:-}" && -f "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" ]] && command -v bun >/dev/null 2>&1; then
    bun "$HOOK_REPO_ROOT/src/cli/hook-entry.ts" prompt-guard-decide
    return $?
  fi

  if command -v repo-harness-hook >/dev/null 2>&1; then
    repo-harness-hook prompt-guard-decide
    return $?
  fi

  if command -v repo-harness >/dev/null 2>&1; then
    repo-harness prompt-guard-decide
    return $?
  fi

  if [[ -f "$source_cli" ]] && command -v bun >/dev/null 2>&1; then
    bun "$source_cli" prompt-guard-decide
    return $?
  fi

  return 127
}

prompt_guard_refresh_state() {
  prompt_guard_spec_state="missing"
  prompt_guard_plan_state="none"
  prompt_guard_pending_state="none"
  prompt_guard_worktree_state="current"
  prompt_guard_contract_state="missing"
  prompt_guard_contract_path_state="missing"
  prompt_guard_evidence_state="unchecked"

  active_plan=""
  plan_status=""
  marker_problem=""
  linked_worktree=""
  contract_file=""
  evidence_error=""

  if [ -f "docs/spec.md" ]; then
    prompt_guard_spec_state="present"
  fi

  active_plan="$(get_active_plan || true)"
  if [ -n "$active_plan" ] && [ -f "$active_plan" ]; then
    plan_status="$(get_plan_status "$active_plan")"
    case "$plan_status" in
      Draft) prompt_guard_plan_state="draft" ;;
      Annotating) prompt_guard_plan_state="annotating" ;;
      Approved) prompt_guard_plan_state="approved" ;;
      Executing) prompt_guard_plan_state="executing" ;;
      *) prompt_guard_plan_state="unknown" ;;
    esac

    if [ -n "$(derive_contract_path "$active_plan" || true)" ]; then
      prompt_guard_contract_path_state="present"
    fi

    if ! evidence_error="$(plan_evidence_contract_error "$active_plan")"; then
      prompt_guard_evidence_state="incomplete"
    else
      prompt_guard_evidence_state="complete"
    fi
  else
    marker_problem="$(active_plan_marker_problem || true)"
    if [[ "$marker_problem" == *"different worktree"* ]]; then
      prompt_guard_plan_state="foreign_worktree"
      prompt_guard_worktree_state="foreign_marker"
    elif [[ -n "$marker_problem" ]]; then
      prompt_guard_plan_state="stale_marker"
    fi
  fi

  if workflow_pending_orchestration_is_fresh; then
    prompt_guard_pending_state="fresh"
  elif [ -s "$(workflow_pending_orchestration_file)" ]; then
    prompt_guard_pending_state="stale"
  fi

  linked_worktree="$(prompt_linked_worktree_target || true)"
  if [[ -n "$linked_worktree" ]]; then
    prompt_guard_worktree_state="linked_target"
  fi

  contract_file="$(workflow_active_contract || true)"
  if [[ -n "$contract_file" && -f "$contract_file" ]]; then
    prompt_guard_contract_state="present"
  fi
}

prompt_guard_decide() {
  local decision_output

  export PROMPT_GUARD_DONE_INTENT="$done_intent"
  export PROMPT_GUARD_PLAN_START_INTENT="$plan_start_intent"
  export PROMPT_GUARD_IMPLEMENT_INTENT="$implement_intent"
  export PROMPT_GUARD_PLANNING_DISCUSSION_INTENT
  export PROMPT_GUARD_REVIEW_RELEASE_INTENT
  export PROMPT_GUARD_PASSIVE_WORKTREE_STATUS_INTENT
  export PROMPT_GUARD_PASSIVE_COMPLETION_REPORT_INTENT
  export PROMPT_GUARD_PASSIVE_NEXT_SLICE_REPORT_INTENT
  export PROMPT_GUARD_EMBEDDED_APPROVED_PLAN_INTENT
  export PROMPT_GUARD_PLAN_SHAPED_MARKDOWN_INTENT
  export PROMPT_GUARD_BUG_OR_HUNT_INTENT
  export PROMPT_GUARD_PLAN_EXECUTION_PROJECTION_INTENT="$plan_execution_projection_intent"

  PROMPT_GUARD_PLANNING_DISCUSSION_INTENT="$(prompt_guard_bool_flag is_plan_discussion_continuation_intent)"
  PROMPT_GUARD_REVIEW_RELEASE_INTENT="$(prompt_guard_bool_flag is_review_release_advisory_intent)"
  PROMPT_GUARD_PASSIVE_WORKTREE_STATUS_INTENT="$(prompt_guard_bool_flag is_passive_worktree_status_intent)"
  PROMPT_GUARD_PASSIVE_COMPLETION_REPORT_INTENT="$(prompt_guard_bool_flag is_retrospective_completion_report_intent)"
  PROMPT_GUARD_PASSIVE_NEXT_SLICE_REPORT_INTENT="$(prompt_guard_bool_flag is_next_slice_or_status_advisory_intent)"
  PROMPT_GUARD_EMBEDDED_APPROVED_PLAN_INTENT="$(prompt_guard_bool_flag is_embedded_approved_plan_intent)"
  PROMPT_GUARD_PLAN_SHAPED_MARKDOWN_INTENT="$(prompt_guard_bool_flag is_plan_shaped_markdown_intent)"
  PROMPT_GUARD_BUG_OR_HUNT_INTENT="$(prompt_guard_bool_flag is_bug_or_hunt_intent)"

  export PROMPT_GUARD_SPEC_STATE="$prompt_guard_spec_state"
  export PROMPT_GUARD_PLAN_STATE="$prompt_guard_plan_state"
  export PROMPT_GUARD_PENDING_STATE="$prompt_guard_pending_state"
  export PROMPT_GUARD_WORKTREE_STATE="$prompt_guard_worktree_state"
  export PROMPT_GUARD_CONTRACT_STATE="$prompt_guard_contract_state"
  export PROMPT_GUARD_CONTRACT_PATH_STATE="$prompt_guard_contract_path_state"
  export PROMPT_GUARD_EVIDENCE_STATE="$prompt_guard_evidence_state"

  if ! decision_output="$(prompt_guard_decision_command)"; then
    echo "[PromptGuard] Decision engine unavailable or failed."
    hook_structured_error \
      "PromptGuard" \
      "Prompt guard decision engine failed." \
      "Install repo-harness or run from the source checkout so the TypeScript decision engine is available." \
      "missing_artifact"
    exit 2
  fi

  printf '%s\n' "$decision_output" | head -n1 | xargs
}

render_prompt_guard_action() {
  local action="$1"

  case "$action" in
    allow|done_gate)
      return 0
      ;;
    spec_block)
      echo "[SpecGuard] Missing docs/spec.md. Create stable product truth before implementation."
      hook_structured_error \
        "SpecGuard" \
        "Implementation requested without docs/spec.md." \
        "Run bash scripts/new-spec.sh and capture stable product intent before implementing." \
        "missing_artifact"
      exit 2
      ;;
    stale_active_plan_advice)
      clear_active_plan
      echo "[PlanStatusGuard] Advisory: ${marker_problem}; cleared stale active markers. Capture or switch to an approved plan before editing implementation files."
      exit 0
      ;;
    plan_capture_pending_advice)
      emit_pending_orchestration_capture_gate || true
      exit 0
      ;;
    worktree_execution_advice)
      echo "[WorktreeExecutionGate] Active plan is in linked worktree: $linked_worktree"
      echo "[WorktreeExecutionGate] Continue from that worktree instead of recapturing a plan:"
      echo "  cd \"$linked_worktree\""
      exit 0
      ;;
    plan_capture_missing_active_advice)
      echo "[PlanCaptureGate] Approval detected before an active plan artifact exists."
      echo "[PlanCaptureGate] Let the agent run the approved-plan capture path now:"
      echo "  git status --short --branch -uall"
      echo "  printf '%s\n' '<approved plan body>' | bash scripts/capture-plan.sh --slug <slug> --title <title> --status Approved --source waza-think --route planning --execute"
      exit 0
      ;;
    plan_status_no_active_block)
      echo "[PlanStatusGuard] No active plan found in plans/. Capture the approved planning output with: bash scripts/capture-plan.sh --slug <slug> --title <title> --status Approved --execute"
      echo "[PlanStatusGuard] If there is no captured planning output yet, run: bash scripts/ensure-task-workflow.sh --slug <slug> --title <title>"
      hook_structured_error \
        "PlanStatusGuard" \
        "No active plan found in plans/." \
        "Capture the approved planning output with bash scripts/capture-plan.sh --slug <slug> --title <title> --status Approved --execute, or run bash scripts/ensure-task-workflow.sh --slug <slug> --title <title> when no planning output exists." \
        "missing_artifact"
      exit 2
      ;;
    plan_capture_draft_advice)
      echo "[PlanCaptureGate] Approval detected for $plan_status plan: $active_plan"
      echo "[PlanCaptureGate] Recapture the exact approved plan body with --status Approved --execute, or mark this plan Approved and run:"
      echo "  bash scripts/plan-to-todo.sh --plan $active_plan"
      exit 0
      ;;
    plan_status_not_approved_block)
      echo "[PlanStatusGuard] Plan status is '$plan_status' in $active_plan. Complete annotation cycle first."
      hook_structured_error \
        "PlanStatusGuard" \
        "Plan status is $plan_status in $active_plan." \
        "Complete the annotation cycle and move the plan to Approved before implementation." \
        "state_violation"
      exit 2
      ;;
    evidence_contract_block)
      echo "[EvidenceContractGuard] Plan Evidence Contract is incomplete in $active_plan:"
      printf '%s\n' "$evidence_error"
      hook_structured_error \
        "EvidenceContractGuard" \
        "Implementation requested without a complete plan Evidence Contract." \
        "Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before implementation." \
        "quality_gate"
      exit 2
      ;;
    plan_execution_scaffold_advice)
      echo "[PlanExecutionGate] Approval detected for approved plan: $active_plan"
      echo "[PlanExecutionGate] Create the sprint contract/review/notes before implementation:"
      echo "  bash scripts/plan-to-todo.sh --plan $active_plan"
      exit 0
      ;;
    contract_missing_block)
      echo "[ContractGuard] Missing active sprint contract for $active_plan"
      hook_structured_error \
        "ContractGuard" \
        "Implementation requested without an active sprint contract." \
        "Run bash scripts/plan-to-todo.sh --plan $active_plan to create the contract/review/notes scaffold before implementation." \
        "missing_artifact"
      exit 2
      ;;
    done_missing_active_plan)
      echo "[ContractGuard] Done intent detected, but no active plan found. Complete plan workflow first."
      hook_structured_error \
        "ContractGuard" \
        "Done intent detected without an active plan." \
        "Finish the plan workflow and ensure plans/ contains the active plan before marking work done." \
        "state_violation"
      exit 2
      ;;
    done_contract_path_missing)
      echo "[ContractGuard] Could not derive contract path from plan: $active_plan"
      hook_structured_error \
        "ContractGuard" \
        "Could not derive a contract path from $active_plan." \
        "Rename the plan to plan-<timestamp>-<slug>.md so the matching contract can be resolved." \
        "missing_artifact"
      exit 2
      ;;
    done_missing_contract)
      echo "[ContractGuard] Missing task contract: $contract_file"
      hook_structured_error \
        "ContractGuard" \
        "Missing task contract $contract_file." \
        "Create the contract or regenerate tasks from the active plan before marking work done." \
        "missing_artifact"
      exit 2
      ;;
    done_evidence_contract_block)
      echo "[EvidenceContractGuard] Plan Evidence Contract is incomplete in $active_plan:"
      printf '%s\n' "$evidence_error"
      hook_structured_error \
        "EvidenceContractGuard" \
        "Done intent detected without a complete plan Evidence Contract." \
        "Fill ## Evidence Contract with state/progress path, verification evidence, evaluator rubric, stop condition, and rollback surface before marking work done." \
        "quality_gate"
      exit 2
      ;;
    *)
      echo "[PromptGuard] Unknown decision action: $action"
      hook_structured_error \
        "PromptGuard" \
        "Unknown prompt guard decision action: $action." \
        "Fix the TypeScript prompt guard decision table before continuing." \
        "state_violation"
      exit 2
      ;;
  esac
}

PROMPT_TEXT="$(hook_get_prompt "${1:-}")"
PROMPT_INTENT_TEXT="$(prompt_intent_text)"

emit_agentic_packaging_hint
emit_waza_route_hint
emit_codegraph_route_hint
emit_pending_orchestration_discussion

implement_intent=0
if is_implement_intent; then
  implement_intent=1
fi

execution_approval_intent=0
if is_execution_approval_intent; then
  execution_approval_intent=1
fi

plan_execution_projection_intent=0
if is_plan_execution_projection_intent; then
  plan_execution_projection_intent=1
fi

done_intent=0
if is_done_intent; then
  done_intent=1
fi

plan_start_intent=0
if is_plan_creation_intent || is_think_plan_start_intent; then
  plan_start_intent=1
fi

plan_research_ready=1
if [ "$plan_start_intent" -eq 1 ]; then
  if ! has_research_for_new_plan; then
    latest_plan="$(get_latest_plan || true)"
    if [[ -n "$latest_plan" ]]; then
      plan_research_ready=0
      echo "[ResearchGate] Advisory: tasks/research.md is missing or older than $latest_plan; skipping automatic Draft plan creation."
      echo "[ResearchGate] Update tasks/research.md with fresh findings before creating the next plan."
    else
      echo "[ResearchGate] WARNING: tasks/research.md does not exist yet. Consider creating it with current findings before drafting the plan."
      echo "  首次创建计划：建议先写 tasks/research.md，但不阻塞。"
    fi
  fi
fi

if [ "$implement_intent" -eq 0 ] && [ "$done_intent" -eq 0 ]; then
  if [ "$plan_start_intent" -eq 1 ] && [ "$plan_research_ready" -eq 0 ]; then
    echo "[PlanStartGate] Skipping automatic Draft plan workflow until research is refreshed."
  else
    maybe_start_plan_workflow
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
  prompt_guard_refresh_state
  prompt_guard_action="$(prompt_guard_decide)"
  if [ "$prompt_guard_action" = "spec_block" ]; then
    render_prompt_guard_action "$prompt_guard_action"
  fi

  maybe_capture_embedded_approved_plan

  prompt_guard_refresh_state
  prompt_guard_action="$(prompt_guard_decide)"
  render_prompt_guard_action "$prompt_guard_action"
fi

if [ "$done_intent" -eq 1 ]; then
  prompt_guard_refresh_state
  prompt_guard_action="$(prompt_guard_decide)"
  render_prompt_guard_action "$prompt_guard_action"

  if [ -f "scripts/verify-contract.sh" ]; then
    # --read-only: hook-driven verification must not rewrite the contract Status
    # header, otherwise a transient failure (e.g. flaky `bun test`) dirties the
    # worktree and chains into worktree-guard on the next prompt.
    if ! bash "scripts/verify-contract.sh" --contract "$contract_file" --strict --read-only; then
      echo "[ContractGuard] Contract verification failed: $contract_file"
      hook_structured_error \
        "ContractGuard" \
        "Contract verification failed for $contract_file." \
        "Resolve the failing exit criteria in the contract before marking work done." \
        "contract_failure"
      exit 2
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
      "Run Waza /check after verification and record its evaluator recommendation in tasks/reviews/<slug>.review.md before marking work done." \
      "quality_gate"
    exit 2
  fi

  if ! workflow_review_recommends_pass "$review_file"; then
    echo "[ReviewGuard] Sprint review does not recommend pass: $review_file"
    hook_structured_error \
      "ReviewGuard" \
      "Sprint review is missing a passing recommendation." \
      "Run Waza /check with fresh verification evidence and record a pass recommendation before marking work done." \
      "quality_gate"
    exit 2
  fi

  external_status="$(workflow_external_acceptance_status "$review_file")"
  IFS=$'\t' read -r external_state external_reviewer external_source external_message <<< "$external_status"
  if [ "$external_state" != "pass" ] && [ "$external_state" != "manual_override" ]; then
    echo "[ExternalAcceptanceGuard] ${external_message:-External acceptance is missing.}"
    hook_structured_error \
      "ExternalAcceptanceGuard" \
      "${external_message:-External acceptance is missing from $review_file.}" \
      "Run peer acceptance via $(workflow_external_acceptance_expected_source) and record ## External Acceptance Advice in $review_file before marking work done." \
      "quality_gate"
    exit 2
  fi

  checks_file="$(workflow_checks_file)"
  if [ ! -f "$checks_file" ]; then
    echo "[EvidenceGuard] Missing structured checks file: $checks_file"
    hook_structured_error \
      "EvidenceGuard" \
      "Done intent detected without structured verification evidence." \
      "Run the relevant checks so .ai/harness/checks/latest.json exists before marking work done." \
      "quality_gate"
    exit 2
  fi

  if ! checks_error="$(workflow_checks_pass "$checks_file" "$contract_file" "$review_file")"; then
    echo "[EvidenceGuard] $checks_error"
    hook_structured_error \
      "EvidenceGuard" \
      "$checks_error" \
      "Run bash scripts/verify-sprint.sh so .ai/harness/checks/latest.json records a passing current sprint verification." \
      "quality_gate"
    exit 2
  fi

  task_state="$(workflow_plan_task_state "$active_plan")"
  IFS=$'\t' read -r total_tasks done_tasks next_task <<< "$task_state"
  remaining_tasks=$(( ${total_tasks:-0} - ${done_tasks:-0} ))
  if [ "${remaining_tasks:-0}" -gt 0 ]; then
    echo "[ArchiveGuard] Done intent detected but active plan still has $remaining_tasks unchecked item(s). Refusing to auto-archive."
    hook_structured_error \
      "ArchiveGuard" \
      "Done intent with $remaining_tasks unchecked active-plan task(s)." \
      "Finish the remaining Task Breakdown item: ${next_task:-see $active_plan}." \
      "state_violation"
    exit 2
  fi

  if workflow_is_linked_worktree; then
    next_action="$(workflow_next_action)"
    next_stage="$(printf '%s\n' "$next_action" | cut -f1)"
    next_command="$(printf '%s\n' "$next_action" | cut -f2)"
    next_message="$(printf '%s\n' "$next_action" | cut -f3-)"
    [[ "${next_command:-}" == "-" ]] && next_command=""
    echo "[WorkflowNextAction] Done quality gates passed for $active_plan."
    echo "[WorkflowNextAction] ${next_message:-Finish this contract worktree.}"
    if [ -n "${next_command:-}" ]; then
      echo "[WorkflowNextAction] ${next_command}"
    fi
    exit 0
  fi

  if [ ! -x scripts/archive-workflow.sh ]; then
    echo "[AutoArchive] scripts/archive-workflow.sh is missing or not executable. Skipping auto-archive."
    hook_structured_error \
      "AutoArchive" \
      "scripts/archive-workflow.sh is missing or not executable." \
      "Install the workflow helper before relying on auto-archive." \
      "missing_artifact"
    exit 1
  fi

  outcome="$(derive_done_outcome)"
  echo "[AutoArchive] All quality gates passed. Archiving $active_plan as outcome=$outcome"
  if ! archive_output="$(bash scripts/archive-workflow.sh --plan "$active_plan" --outcome "$outcome" 2>&1)"; then
    printf '%s\n' "$archive_output"
    hook_structured_error \
      "AutoArchive" \
      "Automatic archive failed for $active_plan." \
      "Run bash scripts/archive-workflow.sh --plan $active_plan --outcome $outcome and resolve the error." \
      "contract_failure"
    exit 1
  fi
  printf '%s\n' "$archive_output"
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
  emit_cross_review_hint debug
fi
if ! is_diagnostic_question_intent && ! is_review_release_advisory_intent && ! is_passive_worktree_status_intent && ! is_next_slice_or_status_advisory_intent && ! is_retrospective_completion_report_intent && echo "$PROMPT_TEXT" | grep -qEi "(new feature|feature|implement|build|新功能|实现|开发功能|执行)"; then
  echo "[BDD] Feature intent detected. Define Given-When-Then acceptance scenarios first."
  echo "  检测到新功能请求：先定义 Given-When-Then 验收场景。"
fi
