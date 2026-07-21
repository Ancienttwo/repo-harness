/**
 * Prompt intent classifiers for the typed UserPromptSubmit handler.
 *
 * The shell hook used byte-oriented `grep -Ei` classifiers, which made
 * Chinese-language boundaries locale-dependent (UTF-8 continuation bytes can
 * fall inside `[[:punct:]]` under LC_ALL=C, so e.g. "里完成。" misclassified
 * as a done declaration on GNU grep but not BSD grep). This module owns the
 * full prompt-text classification with real Unicode semantics. The typed
 * prompt handler owns filesystem state, side effects, and verdict rendering.
 *
 * Porting conventions:
 * - `grep -qEi "<pat>"` over multi-line text → RegExp with `imu` flags so
 *   `^`/`$` stay line anchors, matching grep's per-line semantics.
 * - `[[:space:][:punct:]]` boundary → `[\s\p{P}\p{S}]` (Unicode-aware).
 * - `[^[:alpha:]]` word-ish boundaries in English verb matchers stay ASCII
 *   (`[^A-Za-z]`) on purpose: "fixture"/"prefix" must not fire.
 */

const SP = String.raw`[\s\p{P}\p{S}]`;

function re(pattern: string): RegExp {
  return new RegExp(pattern, 'imu');
}

export interface PromptIntentContext {
  /** Raw prompt text as delivered by the host. */
  readonly raw: string;
  /** Prompt with host-injected context blocks stripped. */
  readonly text: string;
  readonly firstLine: string;
  /** True when a pending plan/orchestration discussion is fresh. */
  readonly pendingFresh: boolean;
}

/**
 * Mirror of strip_prompt_context_blocks: drop host-injected wrapper blocks
 * (skill/system/environment) so classification sees the user's words.
 */
export function stripPromptContextBlocks(prompt: string): string {
  const tagNames =
    'skill|environment_context|INSTRUCTIONS|system|developer|app-context|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions';
  const open = new RegExp(String.raw`^\s*<(${tagNames})[^>]*>\s*$`, 'i');
  const close = new RegExp(String.raw`^\s*</(${tagNames})>\s*$`, 'i');
  const out: string[] = [];
  let skip = false;
  for (const line of prompt.split('\n')) {
    if (open.test(line)) {
      skip = true;
      continue;
    }
    if (close.test(line)) {
      skip = false;
      continue;
    }
    if (!skip) out.push(line);
  }
  const stripped = out.join('\n');
  return stripped.trim().length > 0 ? stripped : prompt;
}

export function buildPromptIntentContext(
  rawPrompt: string,
  pendingFresh: boolean,
): PromptIntentContext {
  const raw = rawPrompt.replace(/\r/g, '');
  const text = stripPromptContextBlocks(raw);
  const firstLine = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  return { raw, text, firstLine, pendingFresh };
}

const EXECUTION_APPROVAL = re(
  String.raw`^${SP}*(please${SP}+)?(go ahead(\s+(with\s+(it|this|that)|please))?|go|proceed(\s+(with\s+(it|this|that)|please))?|approved|approve(\s+(it|this|that))?|ship it|let'?s go|继续执行|批准执行|批准|同意(了)?${SP}*(执行|开干|开始|动手|做|干)(了|吧)?|可以干(了|吧)?|可以(开始|执行)(了|吧)?|直接改(了|吧)?|整|整吧|开干|干吧|做吧|走起)(${SP}+please)?${SP}*$`,
);

export function isExecutionApprovalIntent(ctx: PromptIntentContext): boolean {
  return EXECUTION_APPROVAL.test(ctx.raw);
}

const EXPLICIT_EXECUTION_LINE = re(
  String.raw`^${SP}*(please\s+)?(implement\s+(this|the)|execute\s+(this|the)|start\s+(implementation|executing|coding)|go ahead|proceed|ship it|开始(实现|执行|落实|写)|执行计划|落实计划|批准执行|批准|直接(改|做|实现|执行|落地)|动手|开干|可以(开始|执行|干)|可以干|干吧|做吧)(${SP}|$)`,
);

// Unlike the legacy execution verbs above, this newly supported phrase must
// remain an actual command at the start of a line. A whitespace-only prefix
// keeps quoted examples, questions, and negations out of the execution path.
const DIRECT_MODIFICATION_LINE = re(
  String.raw`^\s*(请\s*)?直接修改`,
);
const DIRECT_MODIFICATION_INLINE_PAYLOAD =
  /“[^”\n]*”|「[^」\n]*」|『[^』\n]*』|"[^"\n]*"|`[^`\n]*`/gu;
const DIRECT_MODIFICATION_QUESTION = re(
  String.raw`([?？]|[吗么呢]${SP}*$|是不是|能不能|可不可以|要不要|应不应该|该不该|会不会|行不行|好不好|对不对|合不合适)`,
);
const DIRECT_MODIFICATION_NON_COMMAND = re(
  String.raw`(不合适(?:吧|${SP}*($|[,，;；。]))|(?:是)?不(?:对|应该|行)(?:吧|的?${SP}*($|[,，;；。]))|不要这么做|不是(我|我们)?的?要求|只是(一个|个)?示例|仅作示例|作为示例)`,
);

function isDirectModificationCommandLine(line: string): boolean {
  const topLevelText = line.replace(DIRECT_MODIFICATION_INLINE_PAYLOAD, '');
  return (
    DIRECT_MODIFICATION_LINE.test(line) &&
    !DIRECT_MODIFICATION_QUESTION.test(topLevelText) &&
    !DIRECT_MODIFICATION_NON_COMMAND.test(topLevelText)
  );
}

function hasDirectModificationCommandLine(ctx: PromptIntentContext): boolean {
  return isDirectModificationCommandLine(ctx.firstLine);
}

export function promptHasExplicitExecutionCommandLine(ctx: PromptIntentContext): boolean {
  return EXPLICIT_EXECUTION_LINE.test(ctx.text) || hasDirectModificationCommandLine(ctx);
}

export function isExplicitExecutionStartLine(ctx: PromptIntentContext): boolean {
  return EXPLICIT_EXECUTION_LINE.test(ctx.firstLine) || hasDirectModificationCommandLine(ctx);
}

const PLAN_EXECUTION_PROJECTION_LINE = re(
  String.raw`^${SP}*(please${SP}+)?((implement|execute|run|start\s+(implementing|executing))\s+(this|the|approved)\s+plan|开始(实现|执行|落实)(这个|该)?(方案|计划)|执行(这个|该)?(方案|计划)|落实(这个|该)?(方案|计划))(${SP}+please)?${SP}*$`,
);

export function isPlanExecutionProjectionIntent(ctx: PromptIntentContext): boolean {
  if (isExecutionApprovalIntent(ctx)) return true;
  return PLAN_EXECUTION_PROJECTION_LINE.test(ctx.firstLine);
}

const TRIGGER_QUESTION = re(
  '(会不会触发|会触发吗|能触发吗|可以触发吗|does this trigger|would this trigger|will this trigger|比如.*触发|例如.*触发)',
);

export function isTriggerQuestionPrompt(ctx: PromptIntentContext): boolean {
  if (hasDirectModificationCommandLine(ctx)) return false;
  return TRIGGER_QUESTION.test(ctx.firstLine);
}

const EMBEDDED_APPROVED_PLAN = re(
  String.raw`^\s*(please\s+)?implement\s+this\s+plan\s*:`,
);

export function isEmbeddedApprovedPlanIntent(ctx: PromptIntentContext): boolean {
  return EMBEDDED_APPROVED_PLAN.test(ctx.text);
}

export function isPlanShapedMarkdownIntent(ctx: PromptIntentContext): boolean {
  if (isTriggerQuestionPrompt(ctx)) return false;
  if (!/^#\s+/u.test(ctx.firstLine)) return false;
  if (!re(String.raw`^##\s+Summary\s*$`).test(ctx.text)) return false;
  return re(String.raw`(^##\s+(Key Changes|Tests|Assumptions)\s*$|P1\s|P2\s|P3\s)`).test(ctx.text);
}

const PLAN_REFINEMENT_EXEC = re(
  '(implement|execute|开始实现|开始执行|批准执行|直接改|动手|开干|可以干)',
);
const PLAN_REFINEMENT = re(
  '((review|critique|refine|improve|polish|完善|优化|调整|修改|补充|评审|审一下|看一下|看看|评价|帮我看|帮我审).*(plan|方案|计划|设计|claude|codex)|((plan|方案|计划|设计|claude).*(review|critique|refine|improve|polish|完善|优化|调整|修改|补充|评审|审一下|看一下|看看|评价|帮我看|帮我审)))',
);

export function isPlanRefinementIntent(ctx: PromptIntentContext): boolean {
  if (hasDirectModificationCommandLine(ctx)) return false;
  if (PLAN_REFINEMENT_EXEC.test(ctx.firstLine)) return false;
  return PLAN_REFINEMENT.test(ctx.firstLine);
}

const PLAN_DISCUSSION_TOPIC = re(
  String.raw`(plan|方案|计划|workflow|hook|hooks|codex[\s-]*plan|claude[\s-]*plan|dynamic[\s-]*workflow|orchestrat|active[\s-]*plan|active[\s-]*marker|PlanStatusGuard|PlanCaptureGate|PlanStartGate|capture|落实plan|执行门禁)`,
);
const PLAN_DISCUSSION_MOVE = re(
  '(继续讨论|讨论|追问|疑问|补充|调整|完善|优化|评审|review|refine|怎么|如何|为什么|为啥|不要.*机械|不能.*机械|过于机械|多轮|中断|状态|边界|弱点|补充|改一下|修一下|不合理|有风险|我觉得|是否|是不是|能不能|应该|设计)',
);

export function isPlanDiscussionContinuationIntent(ctx: PromptIntentContext): boolean {
  if (!ctx.pendingFresh) return false;
  if (isExecutionApprovalIntent(ctx)) return false;
  if (isEmbeddedApprovedPlanIntent(ctx)) return false;
  if (isPlanShapedMarkdownIntent(ctx)) return false;
  if (isExplicitExecutionStartLine(ctx)) return false;
  return PLAN_DISCUSSION_TOPIC.test(ctx.text) && PLAN_DISCUSSION_MOVE.test(ctx.text);
}

const PLAN_CONSULTATION_TOPIC = re(
  String.raw`(plan|方案|计划|workflow|hook|hooks|codex[\s-]*plan|claude[\s-]*plan|active[\s-]*plan|PlanStatusGuard|PlanCaptureGate|PlanStartGate|执行门禁|new\s+plan|create\s+(a\s+)?(new\s+)?plan|write\s+plan|draft\s+plan|新建计划|创建计划|写计划|制定计划|补计划)`,
);
const PLAN_CONSULTATION_QUESTION = re(
  String.raw`(为什么|为啥|怎么回事|怎么.*(看|理解|处理|判断|选|选择|创建)|如何.*(看|理解|处理|判断|选|选择|创建)|是否|是不是|能不能|可不可以|该不该|应该|哪个|哪种|哪条|选择哪个|咨询|讨论|追问|疑问|问一下|会不会|会触发吗|被拦|拦截|why|how\s+(do|should|can|would|could)|should\s+(i|we)|would|could|can\s+(i|we)|which|what\s+if|is\s+it|question|consult|discuss)`,
);

export function isPlanConsultationIntent(ctx: PromptIntentContext): boolean {
  if (isExecutionApprovalIntent(ctx)) return false;
  if (isEmbeddedApprovedPlanIntent(ctx)) return false;
  if (isPlanShapedMarkdownIntent(ctx)) return false;
  if (isExplicitExecutionStartLine(ctx)) return false;
  return PLAN_CONSULTATION_TOPIC.test(ctx.text) && PLAN_CONSULTATION_QUESTION.test(ctx.text);
}

const DIAGNOSTIC_DIRECT = re(
  '(怎么实现|如何实现|为什么.*(实现|执行|implement|execute)|why.*(implement|execute)|how.*implement|the way .*implement|implement.*interesting|执行流程.*(被拦|拦截|中断|为什么|怎么))',
);
const DIAGNOSTIC_TOPIC = re(
  '(hook|hooks|worktree|wt|PlanStatusGuard|执行路径|没开|中断|被拦|拦截|root cause|debug|排查|查查|定位)',
);
const DIAGNOSTIC_QUESTION = re(
  '(为什么|为啥|怎么回事|怎么.*(没|不|会|被)|why|what.*root cause|root cause|排查|查查|定位|debug|诊断|中断|被拦|拦截|执行路径|没开)',
);

export function isDiagnosticQuestionIntent(ctx: PromptIntentContext): boolean {
  if (isExecutionApprovalIntent(ctx)) return false;
  if (isEmbeddedApprovedPlanIntent(ctx)) return false;
  if (isPlanShapedMarkdownIntent(ctx)) return false;
  if (hasDirectModificationCommandLine(ctx)) return false;
  if (DIAGNOSTIC_DIRECT.test(ctx.text)) return true;
  return DIAGNOSTIC_TOPIC.test(ctx.text) && DIAGNOSTIC_QUESTION.test(ctx.text);
}

const REVIEW_RELEASE = re(
  '(review|check|pre-merge|before merge|release|publish|push|验收|检查|提交|发布|推送|合并前)',
);

export function isReviewReleaseIntent(ctx: PromptIntentContext): boolean {
  return REVIEW_RELEASE.test(ctx.text);
}

const REVIEW_RELEASE_CODING_VERB = re('(implement|build it|do it|实现|开始写|动手|开干)');

export function isReviewReleaseAdvisoryIntent(ctx: PromptIntentContext): boolean {
  if (!isReviewReleaseIntent(ctx)) return false;
  if (isEmbeddedApprovedPlanIntent(ctx)) return false;
  if (isPlanShapedMarkdownIntent(ctx)) return false;
  if (isExecutionApprovalIntent(ctx)) return false;
  if (hasDirectModificationCommandLine(ctx)) return false;
  // Review/check prompts often say "execute /check" or "执行 checklist". Those
  // route to evaluator evidence, not implementation.
  if (REVIEW_RELEASE_CODING_VERB.test(ctx.text)) return false;
  return true;
}

const PASSIVE_WORKTREE_TOPIC = re(
  '(plan-to-todo|worktree|linked worktree|隔离 worktree|分支|branch)',
);
const PASSIVE_WORKTREE_STATUS = re(
  '(实现会在.*worktree.*完成|会在.*worktree.*完成|已在.*worktree.*完成实现|worktree.*完成实现|implementation will .*worktree|will .*happen.*worktree|will .*complete.*worktree|implementation (has been )?(completed|done).*worktree|completed implementation.*worktree)',
);

export function isPassiveWorktreeStatusIntent(ctx: PromptIntentContext): boolean {
  if (isExecutionApprovalIntent(ctx)) return false;
  if (isEmbeddedApprovedPlanIntent(ctx)) return false;
  if (isPlanShapedMarkdownIntent(ctx)) return false;
  if (promptHasExplicitExecutionCommandLine(ctx)) return false;
  return PASSIVE_WORKTREE_TOPIC.test(ctx.text) && PASSIVE_WORKTREE_STATUS.test(ctx.text);
}

const RETRO_VERB = re('(implement|execute|build|实现|执行|开发)');
const RETRO_DONE = re(
  '(现在已补|已补|已归档|已复跑|并已复跑|已完成|已处理|我补了|我已经|通过|passed|completed)',
);
const RETRO_EVIDENCE = re(
  '(npm|bun|pnpm|yarn|test|lint|build|check|复跑|归档|docs/|README|PRD|通过|passed)',
);

export function isRetrospectiveCompletionReportIntent(ctx: PromptIntentContext): boolean {
  if (isExecutionApprovalIntent(ctx)) return false;
  if (isEmbeddedApprovedPlanIntent(ctx)) return false;
  if (isPlanShapedMarkdownIntent(ctx)) return false;
  if (promptHasExplicitExecutionCommandLine(ctx)) return false;
  return RETRO_VERB.test(ctx.text) && RETRO_DONE.test(ctx.text) && RETRO_EVIDENCE.test(ctx.text);
}

export function isNextSliceOrStatusAdvisoryIntent(ctx: PromptIntentContext): boolean {
  if (isExecutionApprovalIntent(ctx)) return false;
  if (isEmbeddedApprovedPlanIntent(ctx)) return false;
  if (isPlanShapedMarkdownIntent(ctx)) return false;
  if (promptHasExplicitExecutionCommandLine(ctx)) return false;

  if (re('(下一刀.*(plan|think|方案|计划)|(plan|think|方案|计划).*下一刀)').test(ctx.firstLine)) {
    return true;
  }

  if (
    re(String.raw`(^|${SP})下一刀(${SP}|$)`).test(ctx.text) &&
    ctx.text.includes('建议切') &&
    ctx.text.includes('理由是') &&
    ctx.text.includes('入口是')
  ) {
    return true;
  }

  if (
    re(String.raw`^\s*P1\s*$`).test(ctx.text) &&
    re(String.raw`^\s*P2\s*$`).test(ctx.text) &&
    re(String.raw`^\s*P3\s*$`).test(ctx.text) &&
    re(String.raw`(验证结果|已在.*worktree.*完成实现|worktree.*完成实现|未提交|未[\s-]*merge)`).test(ctx.text)
  ) {
    return true;
  }

  return false;
}

const IMPLEMENT_VERB = re(
  '(implement|execute|build it|do it|go ahead|proceed|ship it|实现|执行|开始写|动手|开干)',
);

export function isImplementIntent(ctx: PromptIntentContext): boolean {
  if (isTriggerQuestionPrompt(ctx)) return false;
  if (isRetrospectiveCompletionReportIntent(ctx)) return false;
  if (isNextSliceOrStatusAdvisoryIntent(ctx)) return false;
  if (isPlanConsultationIntent(ctx)) return false;
  if (isPlanDiscussionContinuationIntent(ctx)) return false;
  if (isPlanRefinementIntent(ctx)) return false;
  if (isDiagnosticQuestionIntent(ctx)) return false;
  if (isReviewReleaseAdvisoryIntent(ctx)) return false;
  if (isPassiveWorktreeStatusIntent(ctx)) return false;
  return (
    IMPLEMENT_VERB.test(ctx.text) ||
    hasDirectModificationCommandLine(ctx) ||
    isExecutionApprovalIntent(ctx) ||
    isEmbeddedApprovedPlanIntent(ctx) ||
    isPlanShapedMarkdownIntent(ctx)
  );
}

const DONE_FIRST_LINE = re(
  String.raw`^${SP}*(/done|/complete|/finish|done\.?|mark\s+(it\s+|this\s+)?(as\s+)?done|task\s+(is\s+)?(done|complete|completed|finished)|all\s+done|wrap\s+(it\s+)?up|完成(了|啦|吧|！|。)?|结束(吧|！|。)?|可以收工|收工(了|吧)?|宣布完成|工作完成)${SP}*$`,
);
const DONE_SHORT_EN = re(
  String.raw`(^|${SP})(done|complete|completed|finished|mark\s+done)(${SP}|$)`,
);
const DONE_SHORT_ZH = re(
  String.raw`(^|[\s\p{P}\p{S}])(任务完成了?|完成(了|啦|吧)?|已完成|本轮完成|这刀完成|收尾完成|结束吧|结束任务|可以收工|收工(了|吧)?|宣布完成|工作完成)([\s\p{P}\p{S}]|$)`,
);

export function isDoneIntent(ctx: PromptIntentContext): boolean {
  if (isPlanRefinementIntent(ctx)) return false;

  // Long markdown / plan-shaped prompts often contain literal "Completed" /
  // "Done" tokens as state-enum values. Those are not a user declaration that
  // the work is done: long or plan-shaped prompts must declare done in the
  // first non-blank line via an explicit completion phrase.
  if (isPlanShapedMarkdownIntent(ctx) || isEmbeddedApprovedPlanIntent(ctx)) {
    return DONE_FIRST_LINE.test(ctx.firstLine);
  }

  if (Buffer.byteLength(ctx.text, 'utf8') >= 280) {
    return DONE_FIRST_LINE.test(ctx.firstLine);
  }

  // Short prompts: require token boundaries / explicit completion phrases so
  // task instructions such as `完成后验证` do not close the active contract.
  if (DONE_SHORT_EN.test(ctx.text)) return true;
  return DONE_SHORT_ZH.test(ctx.text);
}

export type DoneOutcome = 'Completed' | 'Abandoned' | 'Superseded';

export function deriveDoneOutcome(ctx: PromptIntentContext): DoneOutcome {
  if (re('(abandon(ed)?|drop( it)?|放弃|不做了|算了|作废|不要了|废弃)').test(ctx.text)) {
    return 'Abandoned';
  }
  if (re('(supersed(ed|e)|replaced by|被.*取代|被.*替代|改用新方案|换方案)').test(ctx.text)) {
    return 'Superseded';
  }
  return 'Completed';
}

export function isSpaDayIntent(ctx: PromptIntentContext): boolean {
  return re('(spa day|audit rules|consolidate|cleanup rules|规则清理|规则审计|合并规则|瘦身)').test(ctx.text);
}

const PLAN_CREATION = re(
  '(new plan|create plan|write plan|draft plan|新建计划|创建计划|写计划|制定计划|补计划)',
);

export function isPlanCreationIntent(ctx: PromptIntentContext): boolean {
  if (isPlanDiscussionContinuationIntent(ctx)) return false;
  if (isPlanRefinementIntent(ctx)) return false;
  if (isDiagnosticQuestionIntent(ctx)) return false;
  if (isPlanConsultationIntent(ctx)) return false;
  return PLAN_CREATION.test(ctx.text);
}

const BUG_OR_HUNT = re(
  '(fix|patch|bug|error|crash|broken|regression|报错|崩溃|修复|不工作|跑不通|为什么.*错|排查|查查|定位问题|debug)',
);

export function isBugOrHuntIntent(ctx: PromptIntentContext): boolean {
  return BUG_OR_HUNT.test(ctx.text);
}

// Precise bug-FIX classifier for the TDD advisory. isBugOrHuntIntent stays
// deliberately broad because it is only used as an exclusion; this one is a
// positive trigger, so a bare "bug" substring (找出Bug, review for bugs,
// prefix, fixture) must NOT fire. Requires an explicit fix verb or a
// breakage report.
const FIX_VERB_EN = re(
  String.raw`(^|[^A-Za-z])(fix(es|ed|ing)?|patch(es|ed|ing)?|hotfix)([^A-Za-z]|$)|bug[\s_-]?fix`,
);
const FIX_VERB_ZH = re(
  '修复|修一下|修个|修掉|修好|修不好|反复修|修bug|修 bug|改bug|改 bug|解决.{0,24}(bug|缺陷|报错|崩溃)',
);
const BREAKAGE_REPORT = re(
  String.raw`(报错|崩溃|闪退|跑不通|不工作|坏了|挂了|crash(es|ed|ing)?|broken|stack\s?trace|regression|used to work|no longer works|stopped working)`,
);

export function isBugFixIntent(ctx: PromptIntentContext): boolean {
  if (FIX_VERB_EN.test(ctx.text)) return true;
  if (FIX_VERB_ZH.test(ctx.text)) return true;
  return BREAKAGE_REPORT.test(ctx.text);
}

const PLAIN_FEATURE = re(
  String.raw`(new feature|feature request|add (a )?(new )?feature|build (a|an|the)\s.*(page|screen|feature|component|module|tool|dashboard|api|endpoint|flow|app)|create (a|an|the)\s.*(page|screen|feature|component|module|tool|dashboard|api|endpoint|flow|app)|开发新功能|开发.*功能|新增功能|新功能|加.*功能|做(一个|个).*(页|页面|功能|模块|工具|组件|接口|应用|系统|面板|流程)|搭(一个|个).*(页|页面|功能|模块|工具|组件|接口|应用|系统|面板|流程)|写(一个|个).*(页|页面|功能|模块|工具|组件|接口|脚本|应用|系统|面板|流程))`,
);

export function isPlainFeaturePlanStartIntent(ctx: PromptIntentContext): boolean {
  if (isTriggerQuestionPrompt(ctx)) return false;
  if (isPlanDiscussionContinuationIntent(ctx)) return false;
  if (isPlanRefinementIntent(ctx)) return false;
  if (isDiagnosticQuestionIntent(ctx)) return false;
  if (isPlanConsultationIntent(ctx)) return false;
  if (isBugOrHuntIntent(ctx)) return false;
  if (isExecutionApprovalIntent(ctx)) return false;
  return PLAIN_FEATURE.test(ctx.text);
}

const THINK_COMMAND = re(String.raw`^${SP}*(/think|[$]think|\[[$]think\])`);
const THINK_PLAN_PHRASE = re(
  '(plan this|plan it|how should i|how should we|出方案|给方案|怎么设计|用什么方案|制定计划|写计划|新建计划|创建计划)',
);

export function isThinkPlanStartIntent(ctx: PromptIntentContext): boolean {
  if (isPlanDiscussionContinuationIntent(ctx)) return false;
  if (isPlanRefinementIntent(ctx)) return false;
  if (isDiagnosticQuestionIntent(ctx)) return false;
  if (isBugOrHuntIntent(ctx)) return false;
  if (THINK_COMMAND.test(ctx.text)) return true;
  if (isPlanConsultationIntent(ctx)) return false;
  return THINK_PLAN_PHRASE.test(ctx.text) || isPlainFeaturePlanStartIntent(ctx);
}

export function normalizePlanSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/-{2,}/g, '-');
}

export function derivePlanStartTitle(ctx: PromptIntentContext): string {
  let title = ctx.text
    .replace(/[\r\n]/g, ' ')
    .replace(/\[\$think\]\([^)]*\)/g, 'think')
    .replace(/\$think/g, 'think')
    .replace(/\/think/g, 'think')
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`^${SP}+`, 'u'), '')
    .trim();
  if (title.length === 0) title = 'Planning Session';
  return Array.from(title).slice(0, 96).join('');
}

export function derivePlanStartSlug(ctx: PromptIntentContext, now: Date = new Date()): string {
  const title = derivePlanStartTitle(ctx);
  let slug = normalizePlanSlug(title);
  if (slug === '' || slug === 'think' || slug === 'plan') {
    const hms = [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((n) => String(n).padStart(2, '0'))
      .join('');
    slug = isPlainFeaturePlanStartIntent(ctx) ? `feature-plan-${hms}` : `think-plan-${hms}`;
  }
  return Array.from(slug).slice(0, 64).join('').replace(/-+$/, '');
}

export type PendingOrchestrationKind =
  | 'waza-think'
  | 'dynamic-workflow'
  | 'codex-plan'
  | 'repo-harness-plan';

export function derivePendingOrchestrationKind(ctx: PromptIntentContext): PendingOrchestrationKind {
  if (re(String.raw`(/think|[$]think|\[[$]think\]|waza[\s/-]*think)`).test(ctx.text)) {
    return 'waza-think';
  }
  if (re(String.raw`dynamic[\s-]*workflow|workflow`).test(ctx.text)) {
    return 'dynamic-workflow';
  }
  if (re(String.raw`codex[\s-]*plan`).test(ctx.text)) {
    return 'codex-plan';
  }
  return 'repo-harness-plan';
}

const AGENTIC_PACKAGING = re(
  String.raw`(repeated workflow|reusable workflow|workflow packaging|package into (a )?skill|make this (a )?skill|subagent or automation|skill or automation|skill/subagent/automation|重复(手工)?工作|重复工作流|做成\s*(skill|subagent|automation)|包装成(skill|subagent|automation|技能|自动化)|抽象成(skill|subagent|automation|技能|自动化)|沉淀成(工作流|skill|技能|自动化)|做成\s*(hook|钩子).*触发|触发用户授权.*(plan|计划|方案))`,
);

export function isAgenticPackagingIntent(ctx: PromptIntentContext): boolean {
  return AGENTIC_PACKAGING.test(ctx.text);
}

const CODEGRAPH_ROUTE = re(
  String.raw`(who calls|what calls|callers|callees|impact|impact radius|trace\s+(flow|path|call)|where\s.*(defined|definition)|definition of|symbol named|调用关系|谁调用|调用了谁|哪里定义|定义在哪|影响面|调用链|追踪(路径|调用|链)|从.*到.*怎么走)`,
);

export function isCodegraphRouteIntent(ctx: PromptIntentContext): boolean {
  if (isTriggerQuestionPrompt(ctx)) return false;
  return CODEGRAPH_ROUTE.test(ctx.text);
}

const GIT_STATUS_LINE = re(
  String.raw`^${SP}*(git\s+(status|log|show|diff|push|pull|commit)|status|commit|push|merge|提交|推送|合并|看状态|看看状态)(${SP}|$)`,
);
const STRUCTURAL_TOPIC = re(
  '(architecture|architectural|runtime|hook|hooks|shared contract|workflow contract|module boundary|route registry|multi[- ]?file|refactor|dependency path|架构|运行时|钩子|共享合约|工作流合约|模块边界|路由表|多文件|重构|依赖路径)',
);

export function isNontrivialCodeTaskIntent(ctx: PromptIntentContext): boolean {
  if (isTriggerQuestionPrompt(ctx)) return false;
  if (isPlanDiscussionContinuationIntent(ctx)) return false;
  if (isPlanRefinementIntent(ctx)) return false;
  if (isReviewReleaseAdvisoryIntent(ctx)) return false;
  if (isDiagnosticQuestionIntent(ctx) && !isBugOrHuntIntent(ctx)) return false;
  if (GIT_STATUS_LINE.test(ctx.firstLine)) return false;
  if (isBugOrHuntIntent(ctx) || isPlainFeaturePlanStartIntent(ctx) || isImplementIntent(ctx)) {
    return true;
  }
  return STRUCTURAL_TOPIC.test(ctx.text);
}

// /health needs a health/audit/diagnostic VERB and a tooling NOUN. A bare
// tooling noun ("review the hook framework") must not misroute review intent
// to /health; reviews fall through to /check.
const HEALTH_VERB = re(
  String.raw`(健康度|健康检查|体检|诊断|环境检查|配置检查|检查.{0,24}(配置|环境|工具链|钩子|hook|健康)|审计.{0,24}(配置|环境|工具链|钩子|hook|agent)|health\s?check|tooling\s+check|audit.{0,40}(setup|tooling|config|environment)|为什么|为啥|怎么回事|不工作|没生效|没触发|被拦|拦截|not firing|why)`,
);
const HEALTH_NOUN = re(
  String.raw`(agent|agents|codex|claude|hook|hooks|workflow|tooling|config|AGENTS\.md|CLAUDE\.md|钩子|工作流|技能配置|配置|环境|工具链|AI coding|agent instructions)`,
);

export function isHealthRouteIntent(ctx: PromptIntentContext): boolean {
  return HEALTH_VERB.test(ctx.text) && HEALTH_NOUN.test(ctx.text);
}

const BDD_FEATURE = re('(new feature|feature|implement|build|新功能|实现|开发功能|执行)');

function passiveOrAdvisoryExclusion(ctx: PromptIntentContext): boolean {
  return (
    isDiagnosticQuestionIntent(ctx) ||
    isPlanConsultationIntent(ctx) ||
    isReviewReleaseAdvisoryIntent(ctx) ||
    isPassiveWorktreeStatusIntent(ctx) ||
    isNextSliceOrStatusAdvisoryIntent(ctx) ||
    isRetrospectiveCompletionReportIntent(ctx)
  );
}

/** TDD bug-fix advisory with diagnostic/review/consultation exclusions applied. */
export function shouldEmitTddBugFixAdvice(ctx: PromptIntentContext): boolean {
  if (passiveOrAdvisoryExclusion(ctx)) return false;
  return isBugFixIntent(ctx);
}

/** BDD feature advisory with the same exclusions; matches the raw prompt like the shell did. */
export function shouldEmitBddFeatureAdvice(ctx: PromptIntentContext): boolean {
  if (passiveOrAdvisoryExclusion(ctx)) return false;
  return BDD_FEATURE.test(ctx.raw);
}

const UX_FEATURE_NOUN_ZH = re(
  '(页面|界面|前端|网页|落地页|组件|按钮|弹窗|表单|布局|排版|样式|交互|仪表盘)',
);
const UX_FEATURE_NOUN_EN = re(
  String.raw`(^|[^A-Za-z0-9_])(ui|ux|user interface|frontend|front-?end|web ?page|landing page|screen|button|modal|dialog|form|layout|dashboard|css)([^A-Za-z0-9_]|$)`,
);

/** Frontend-scoped UX guard advisory: BDD feature intent AND a UI noun in the stripped prompt. */
export function shouldEmitUxFeatureGuardAdvice(ctx: PromptIntentContext): boolean {
  if (!shouldEmitBddFeatureAdvice(ctx)) return false;
  return UX_FEATURE_NOUN_ZH.test(ctx.text) || UX_FEATURE_NOUN_EN.test(ctx.text);
}
