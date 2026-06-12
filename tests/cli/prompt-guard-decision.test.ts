import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { join } from 'path';
import {
  classifyPromptGuardIntent,
  decidePromptGuardAction,
  PROMPT_GUARD_EXECUTION_INTENTS,
  PROMPT_GUARD_PLAN_STATES,
  type PromptGuardIntentFacts,
  type PromptGuardState,
} from '../../src/cli/hook/prompt-guard-decision';

const CLI = join(import.meta.dir, '../..', 'src/cli/index.ts');
const HOOK_ENTRY = join(import.meta.dir, '../..', 'src/cli/hook-entry.ts');

const baseFacts: PromptGuardIntentFacts = {
  done: false,
  planStart: false,
  implement: false,
  planningDiscussion: false,
  reviewRelease: false,
  passiveWorktreeStatus: false,
  passiveCompletionReport: false,
  passiveNextSliceReport: false,
  embeddedApprovedPlan: false,
  planShapedMarkdown: false,
  bugOrHunt: false,
  planExecutionProjection: false,
};

const baseState: PromptGuardState = {
  spec: 'present',
  plan: 'none',
  pending: 'none',
  worktree: 'current',
  contract: 'missing',
  contractPath: 'missing',
  evidence: 'unchecked',
};

function state(overrides: Partial<PromptGuardState>): PromptGuardState {
  return { ...baseState, ...overrides };
}

describe('prompt-guard decision engine', () => {
  test('explicit execution intents and plan states stay enumerated', () => {
    expect(PROMPT_GUARD_EXECUTION_INTENTS).toEqual([
      'embedded_approved_plan',
      'bug_fix_execution',
      'plan_execution_projection',
      'general_execution',
    ]);
    expect(PROMPT_GUARD_PLAN_STATES).toContain('approved');
    expect(PROMPT_GUARD_PLAN_STATES).toContain('executing');
  });

  test('classifies explicit plan projection separately from generic execution', () => {
    expect(
      classifyPromptGuardIntent({
        ...baseFacts,
        implement: true,
        planExecutionProjection: true,
      }),
    ).toBe('plan_execution_projection');

    expect(
      classifyPromptGuardIntent({
        ...baseFacts,
        implement: true,
        bugOrHunt: true,
        planExecutionProjection: true,
      }),
    ).toBe('bug_fix_execution');

    expect(
      classifyPromptGuardIntent({
        ...baseFacts,
        passiveNextSliceReport: true,
      }),
    ).toBe('passive_next_slice_report');
  });

  test('regression: active Draft plan plus implement-this-plan routes to capture gate', () => {
    expect(
      decidePromptGuardAction(
        'plan_execution_projection',
        state({ plan: 'draft', contractPath: 'present' }),
      ),
    ).toBe('plan_capture_draft_advice');
  });

  test('no active plan distinguishes projection, pending-plan capture, and bug fixes', () => {
    expect(decidePromptGuardAction('plan_execution_projection', baseState)).toBe(
      'plan_capture_missing_active_advice',
    );
    expect(
      decidePromptGuardAction(
        'plan_execution_projection',
        state({ pending: 'fresh' }),
      ),
    ).toBe('plan_capture_pending_advice');
    expect(
      decidePromptGuardAction('bug_fix_execution', state({ pending: 'fresh' })),
    ).toBe('plan_status_no_active_block');
  });

  test('approved plan without contract scaffolds explicit execution and blocks generic execution', () => {
    const approved = state({
      plan: 'approved',
      contractPath: 'present',
      evidence: 'complete',
    });
    expect(decidePromptGuardAction('plan_execution_projection', approved)).toBe(
      'plan_execution_scaffold_advice',
    );
    expect(decidePromptGuardAction('general_execution', approved)).toBe(
      'contract_missing_block',
    );
  });

  test('passive intents allow while done intent enters quality gate states', () => {
    expect(decidePromptGuardAction('passive_completion_report', baseState)).toBe(
      'allow',
    );
    expect(decidePromptGuardAction('done', baseState)).toBe(
      'done_missing_active_plan',
    );
    expect(
      decidePromptGuardAction(
        'done',
        state({ plan: 'approved', contractPath: 'present' }),
      ),
    ).toBe('done_missing_contract');
    expect(
      decidePromptGuardAction(
        'done',
        state({
          plan: 'approved',
          contractPath: 'present',
          contract: 'present',
          evidence: 'incomplete',
        }),
      ),
    ).toBe('done_evidence_contract_block');
    expect(
      decidePromptGuardAction(
        'done',
        state({
          plan: 'approved',
          contractPath: 'present',
          contract: 'present',
          evidence: 'complete',
        }),
      ),
    ).toBe('done_gate');
  });

  test('internal CLI prints the action enum from environment facts', () => {
    const res = spawnSync(
      process.execPath,
      [CLI, 'prompt-guard-decide'],
      {
        cwd: join(import.meta.dir, '../..'),
        encoding: 'utf-8',
        env: {
          ...process.env,
          PROMPT_GUARD_IMPLEMENT_INTENT: '1',
          PROMPT_GUARD_PLAN_EXECUTION_PROJECTION_INTENT: '1',
          PROMPT_GUARD_SPEC_STATE: 'present',
          PROMPT_GUARD_PLAN_STATE: 'draft',
          PROMPT_GUARD_PENDING_STATE: 'none',
          PROMPT_GUARD_WORKTREE_STATE: 'current',
          PROMPT_GUARD_CONTRACT_STATE: 'missing',
          PROMPT_GUARD_CONTRACT_PATH_STATE: 'present',
          PROMPT_GUARD_EVIDENCE_STATE: 'unchecked',
        },
      },
    );

    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('plan_capture_draft_advice');
  });

  test('hook entry exposes the lightweight prompt-guard decision command', () => {
    const res = spawnSync(
      process.execPath,
      [HOOK_ENTRY, 'prompt-guard-decide'],
      {
        cwd: join(import.meta.dir, '../..'),
        encoding: 'utf-8',
        env: {
          ...process.env,
          PROMPT_GUARD_IMPLEMENT_INTENT: '1',
          PROMPT_GUARD_PLAN_EXECUTION_PROJECTION_INTENT: '1',
          PROMPT_GUARD_SPEC_STATE: 'present',
          PROMPT_GUARD_PLAN_STATE: 'none',
          PROMPT_GUARD_PENDING_STATE: 'none',
          PROMPT_GUARD_WORKTREE_STATE: 'current',
          PROMPT_GUARD_CONTRACT_STATE: 'missing',
          PROMPT_GUARD_CONTRACT_PATH_STATE: 'missing',
          PROMPT_GUARD_EVIDENCE_STATE: 'unchecked',
        },
      },
    );

    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe('plan_capture_missing_active_advice');
  });
});
