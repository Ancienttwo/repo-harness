export const PROMPT_GUARD_INTENTS = Object.freeze([
  'done',
  'planning_start',
  'planning_discussion',
  'review_release',
  'passive_worktree_status',
  'passive_completion_report',
  'passive_next_slice_report',
  'none',
  'embedded_approved_plan',
  'bug_fix_execution',
  'plan_execution_projection',
  'general_execution',
] as const);

export type PromptGuardIntent = (typeof PROMPT_GUARD_INTENTS)[number];

export const PROMPT_GUARD_PLAN_STATES = Object.freeze([
  'none',
  'stale_marker',
  'foreign_worktree',
  'draft',
  'annotating',
  'approved',
  'executing',
  'unknown',
] as const);

export type PromptGuardPlanState = (typeof PROMPT_GUARD_PLAN_STATES)[number];

export const PROMPT_GUARD_ACTIONS = Object.freeze([
  'allow',
  'spec_block',
  'stale_active_plan_advice',
  'plan_capture_pending_advice',
  'worktree_execution_advice',
  'plan_capture_missing_active_advice',
  'plan_status_no_active_block',
  'plan_capture_draft_advice',
  'plan_status_not_approved_block',
  'evidence_contract_block',
  'plan_execution_scaffold_advice',
  'contract_missing_block',
  'done_missing_active_plan',
  'done_contract_path_missing',
  'done_missing_contract',
  'done_evidence_contract_block',
  'done_gate',
] as const);

export type PromptGuardAction = (typeof PROMPT_GUARD_ACTIONS)[number];

export const PROMPT_GUARD_EXECUTION_INTENTS = Object.freeze([
  'embedded_approved_plan',
  'bug_fix_execution',
  'plan_execution_projection',
  'general_execution',
] as const);

export type PromptGuardExecutionIntent =
  (typeof PROMPT_GUARD_EXECUTION_INTENTS)[number];

export interface PromptGuardIntentFacts {
  readonly done: boolean;
  readonly planStart: boolean;
  readonly implement: boolean;
  readonly planningDiscussion: boolean;
  readonly reviewRelease: boolean;
  readonly passiveWorktreeStatus: boolean;
  readonly passiveCompletionReport: boolean;
  readonly passiveNextSliceReport: boolean;
  readonly embeddedApprovedPlan: boolean;
  readonly planShapedMarkdown: boolean;
  readonly bugOrHunt: boolean;
  readonly planExecutionProjection: boolean;
}

export interface PromptGuardState {
  readonly spec: 'present' | 'missing';
  readonly plan: PromptGuardPlanState;
  readonly pending: 'none' | 'fresh' | 'stale';
  readonly worktree: 'current' | 'linked_target' | 'foreign_marker';
  readonly contract: 'present' | 'missing';
  readonly contractPath: 'present' | 'missing';
  readonly evidence: 'unchecked' | 'complete' | 'incomplete';
}

export function classifyPromptGuardIntent(
  facts: PromptGuardIntentFacts,
): PromptGuardIntent {
  if (facts.done) return 'done';
  if (facts.planStart && !facts.implement) return 'planning_start';
  if (facts.planningDiscussion) return 'planning_discussion';
  if (facts.reviewRelease) return 'review_release';
  if (facts.passiveWorktreeStatus) return 'passive_worktree_status';
  if (facts.passiveCompletionReport) return 'passive_completion_report';
  if (facts.passiveNextSliceReport) return 'passive_next_slice_report';
  if (!facts.implement) return 'none';
  if (facts.embeddedApprovedPlan || facts.planShapedMarkdown) {
    return 'embedded_approved_plan';
  }
  if (facts.bugOrHunt) return 'bug_fix_execution';
  if (facts.planExecutionProjection) return 'plan_execution_projection';
  return 'general_execution';
}

function isExecutionIntent(
  intent: PromptGuardIntent,
): intent is PromptGuardExecutionIntent {
  return PROMPT_GUARD_EXECUTION_INTENTS.includes(
    intent as PromptGuardExecutionIntent,
  );
}

function decideNoActivePlanAction(
  intent: PromptGuardExecutionIntent,
  state: PromptGuardState,
): PromptGuardAction {
  if (intent !== 'bug_fix_execution' && state.pending === 'fresh') {
    return 'plan_capture_pending_advice';
  }
  if (state.worktree === 'linked_target') return 'worktree_execution_advice';
  if (intent === 'plan_execution_projection') {
    return 'plan_capture_missing_active_advice';
  }
  return 'plan_status_no_active_block';
}

function decideDraftPlanAction(
  intent: PromptGuardExecutionIntent,
): PromptGuardAction {
  if (intent === 'plan_execution_projection') return 'plan_capture_draft_advice';
  return 'plan_status_not_approved_block';
}

function decideApprovedPlanAction(
  intent: PromptGuardExecutionIntent,
  state: PromptGuardState,
): PromptGuardAction {
  if (state.evidence === 'incomplete') return 'evidence_contract_block';
  if (
    state.plan === 'approved' &&
    intent === 'plan_execution_projection' &&
    state.contract !== 'present'
  ) {
    return 'plan_execution_scaffold_advice';
  }
  if (state.contract !== 'present') return 'contract_missing_block';
  return 'allow';
}

export const PROMPT_GUARD_EXECUTION_TABLE: Readonly<
  Record<
    PromptGuardPlanState,
    Record<PromptGuardExecutionIntent, (state: PromptGuardState) => PromptGuardAction>
  >
> = Object.freeze({
  none: Object.freeze({
    embedded_approved_plan: (state: PromptGuardState) =>
      decideNoActivePlanAction('embedded_approved_plan', state),
    bug_fix_execution: (state: PromptGuardState) => decideNoActivePlanAction('bug_fix_execution', state),
    plan_execution_projection: (state: PromptGuardState) =>
      decideNoActivePlanAction('plan_execution_projection', state),
    general_execution: (state: PromptGuardState) => decideNoActivePlanAction('general_execution', state),
  }),
  stale_marker: Object.freeze({
    embedded_approved_plan: () => 'stale_active_plan_advice',
    bug_fix_execution: () => 'stale_active_plan_advice',
    plan_execution_projection: () => 'stale_active_plan_advice',
    general_execution: () => 'stale_active_plan_advice',
  }),
  foreign_worktree: Object.freeze({
    embedded_approved_plan: () => 'stale_active_plan_advice',
    bug_fix_execution: () => 'stale_active_plan_advice',
    plan_execution_projection: () => 'stale_active_plan_advice',
    general_execution: () => 'stale_active_plan_advice',
  }),
  draft: Object.freeze({
    embedded_approved_plan: () => decideDraftPlanAction('embedded_approved_plan'),
    bug_fix_execution: () => decideDraftPlanAction('bug_fix_execution'),
    plan_execution_projection: () =>
      decideDraftPlanAction('plan_execution_projection'),
    general_execution: () => decideDraftPlanAction('general_execution'),
  }),
  annotating: Object.freeze({
    embedded_approved_plan: () => decideDraftPlanAction('embedded_approved_plan'),
    bug_fix_execution: () => decideDraftPlanAction('bug_fix_execution'),
    plan_execution_projection: () =>
      decideDraftPlanAction('plan_execution_projection'),
    general_execution: () => decideDraftPlanAction('general_execution'),
  }),
  approved: Object.freeze({
    embedded_approved_plan: (state: PromptGuardState) =>
      decideApprovedPlanAction('embedded_approved_plan', state),
    bug_fix_execution: (state: PromptGuardState) => decideApprovedPlanAction('bug_fix_execution', state),
    plan_execution_projection: (state: PromptGuardState) =>
      decideApprovedPlanAction('plan_execution_projection', state),
    general_execution: (state: PromptGuardState) => decideApprovedPlanAction('general_execution', state),
  }),
  executing: Object.freeze({
    embedded_approved_plan: (state: PromptGuardState) =>
      decideApprovedPlanAction('embedded_approved_plan', state),
    bug_fix_execution: (state: PromptGuardState) => decideApprovedPlanAction('bug_fix_execution', state),
    plan_execution_projection: (state: PromptGuardState) =>
      decideApprovedPlanAction('plan_execution_projection', state),
    general_execution: (state: PromptGuardState) => decideApprovedPlanAction('general_execution', state),
  }),
  unknown: Object.freeze({
    embedded_approved_plan: () => 'allow',
    bug_fix_execution: () => 'allow',
    plan_execution_projection: () => 'allow',
    general_execution: () => 'allow',
  }),
});

function decideDoneAction(state: PromptGuardState): PromptGuardAction {
  if (
    state.plan === 'none' ||
    state.plan === 'stale_marker' ||
    state.plan === 'foreign_worktree'
  ) {
    return 'done_missing_active_plan';
  }
  if (state.contractPath !== 'present') return 'done_contract_path_missing';
  if (state.contract !== 'present') return 'done_missing_contract';
  if (state.evidence === 'incomplete') return 'done_evidence_contract_block';
  return 'done_gate';
}

export function decidePromptGuardAction(
  intent: PromptGuardIntent,
  state: PromptGuardState,
): PromptGuardAction {
  if (intent === 'done') return decideDoneAction(state);
  if (!isExecutionIntent(intent)) return 'allow';
  if (state.spec === 'missing') return 'spec_block';
  return PROMPT_GUARD_EXECUTION_TABLE[state.plan][intent](state);
}
