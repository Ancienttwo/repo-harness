/**
 * C3 — `WorkStateHandoffV1` schema invariants.
 *
 * Acceptance for sprint row C3: a handoff carries attempted paths, dead ends,
 * key findings and next actions; `execution_context` is a discriminated union
 * whose every branch is complete or invalid; the trigger set is closed; and
 * knowledge transfer never borrows the delivery plane's ownership vocabulary.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CollaborationError,
  COLLABORATION_PROTOCOL,
  collaborationActorSha256,
  deriveCollaborationRecordId,
  type CollaborationActorRefV1,
} from '../../src/core/collaboration/common';
import {
  HANDOFF_ENTRY_MAX_BYTES,
  HANDOFF_GOAL_MAX_BYTES,
  HANDOFF_LIST_MAX_COUNT,
  WORK_STATE_HANDOFF_KIND,
  WORK_STATE_HANDOFF_TRIGGERS,
  buildWorkStateHandoff,
  canonicalWorkStateHandoffBytes,
  deriveWorkStateHandoffId,
  validateHandoffExecutionContext,
  validateWorkStateHandoff,
  type HandoffExecutionContextV1,
  type WorkStateHandoffInput,
} from '../../src/core/collaboration/handoff';

const REPO_ROOT = join(import.meta.dir, '../..');
const REPOSITORY_ID = 'repo_0123456789abcdef';
const HANDOFF_ID = 'a'.repeat(64);
const OTHER_ID = 'b'.repeat(64);
const SIGNAL_ID = 'c'.repeat(64);
const DIGEST = `sha256:${'d'.repeat(64)}`;

const ACTOR: CollaborationActorRefV1 = Object.freeze({
  kind: 'module_engineer',
  engineer_id: 'engineer:capability.runtime-harness.collaboration',
  binding_id: '11111111-1111-4111-8111-111111111111',
  binding_generation: 1,
  principal_mapping_sha256: `sha256:${'e'.repeat(64)}`,
});

function input(overrides: Partial<WorkStateHandoffInput> = {}): WorkStateHandoffInput {
  return {
    handoff_id: HANDOFF_ID,
    repository_id: REPOSITORY_ID,
    actor: ACTOR,
    thread_key: 'merge-gate-flake',
    scope_refs: [{ kind: 'free_topic', value: 'merge gate flake' }],
    trigger: 'budget_low',
    goal: 'find why the fourth writer never observes the published token',
    completed: ['reproduced the failure under four concurrent writers'],
    key_findings: ['the loser reconciles, so the count is not the cause'],
    attempted_paths: [{
      description: 'raise the lock timeout to 30s',
      outcome: 'no change; the fourth writer still misses the token',
      evidence_refs: [],
    }],
    dead_ends: ['lock timeout tuning'],
    open_hypotheses: ['the publication fence, not the writer count'],
    next_actions: ['instrument the fence between link and fsync'],
    source_signal_ids: [],
    execution_context: { kind: 'none' },
    supersedes_handoff_id: null,
    created_at: '2026-08-30T00:00:00.000Z',
    ...overrides,
  };
}

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CollaborationError) return error.code;
    return `other:${(error as Error).message}`;
  }
  return 'no-error';
}

describe('C3 WorkStateHandoffV1 schema', () => {
  test('a complete handoff round-trips through validation with a stable digest', () => {
    const handoff = buildWorkStateHandoff(input());
    expect(handoff.protocol).toBe(COLLABORATION_PROTOCOL);
    expect(handoff.kind).toBe(WORK_STATE_HANDOFF_KIND);
    expect(handoff.handoff_sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(validateWorkStateHandoff(JSON.parse(canonicalWorkStateHandoffBytes(handoff)))).toEqual(handoff);
    // The digest covers the content and nothing else, so the same content
    // rebuilt anywhere produces the same bytes.
    expect(buildWorkStateHandoff(input()).handoff_sha256).toBe(handoff.handoff_sha256);
  });

  /**
   * The reason this protocol exists. Each of the four knowledge fields is a
   * required key, and dropping any one of them is invalid rather than defaulted.
   */
  test('attempted paths, dead ends, key findings and next actions are required keys', () => {
    for (const field of ['attempted_paths', 'dead_ends', 'key_findings', 'next_actions'] as const) {
      expect({ field, code: code(() => buildWorkStateHandoff(input({ [field]: undefined } as never))) })
        .toEqual({ field, code: 'collaboration_invalid' });
      const record = { ...buildWorkStateHandoff(input()) } as Record<string, unknown>;
      delete record[field];
      expect({ field, code: code(() => validateWorkStateHandoff(record)) })
        .toEqual({ field, code: 'collaboration_invalid' });
    }
  });

  /**
   * A handoff that attempted nothing and proposes nothing next transfers no
   * knowledge; it is an empty record wearing a schema. `dead_ends` and
   * `key_findings` may legitimately be empty, and forcing a row there would buy
   * the word "none" written into the successor's evidence slot.
   */
  test('attempted paths and next actions must be non-empty; findings and dead ends may be empty', () => {
    expect(code(() => buildWorkStateHandoff(input({ attempted_paths: [] })))).toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({ next_actions: [] })))).toBe('collaboration_invalid');
    const sparse = buildWorkStateHandoff(input({ dead_ends: [], key_findings: [], completed: [], open_hypotheses: [] }));
    expect(sparse.dead_ends).toEqual([]);
    expect(sparse.key_findings).toEqual([]);
  });

  test('a blank entry is refused wherever knowledge is recorded', () => {
    expect(code(() => buildWorkStateHandoff(input({ dead_ends: ['   '] })))).toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({ key_findings: [''] })))).toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({ next_actions: ['\n\t '] })))).toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({ goal: '  ' })))).toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({
      attempted_paths: [{ description: 'tried it', outcome: '  ', evidence_refs: [] }],
    })))).toBe('collaboration_invalid');
  });

  test('an attempted path is exactly description, outcome and evidence refs', () => {
    expect(code(() => buildWorkStateHandoff(input({
      attempted_paths: [{ description: 'tried it', evidence_refs: [] } as never],
    })))).toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({
      attempted_paths: [{ description: 'tried it', outcome: 'failed', evidence_refs: [], note: 'extra' } as never],
    })))).toBe('collaboration_invalid');
    const withEvidence = buildWorkStateHandoff(input({
      attempted_paths: [{
        description: 'raised the lock timeout',
        outcome: 'no change',
        evidence_refs: [{ ref: 'runs/2026-08-30/lock-timeout.log', sha256: DIGEST }],
      }],
    }));
    expect(withEvidence.attempted_paths[0]!.evidence_refs).toHaveLength(1);
  });

  test('transport limits bound each field', () => {
    expect(code(() => buildWorkStateHandoff(input({ goal: 'g'.repeat(HANDOFF_GOAL_MAX_BYTES + 1) }))))
      .toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({ dead_ends: ['d'.repeat(HANDOFF_ENTRY_MAX_BYTES + 1)] }))))
      .toBe('collaboration_invalid');
    expect(code(() => buildWorkStateHandoff(input({
      next_actions: Array.from({ length: HANDOFF_LIST_MAX_COUNT + 1 }, (_, index) => `action ${index}`),
    })))).toBe('collaboration_invalid');
  });

  test('the trigger set is closed', () => {
    expect([...WORK_STATE_HANDOFF_TRIGGERS])
      .toEqual(['budget_low', 'context_pressure', 'phase_complete', 'stalled', 'manual']);
    for (const trigger of WORK_STATE_HANDOFF_TRIGGERS) {
      expect(buildWorkStateHandoff(input({ trigger })).trigger).toBe(trigger);
    }
    for (const trigger of ['budget-low', 'BUDGET_LOW', 'exhausted', '', null]) {
      expect({ trigger, code: code(() => buildWorkStateHandoff(input({ trigger: trigger as never }))) })
        .toEqual({ trigger, code: 'collaboration_invalid' });
    }
  });

  test('a handoff cannot supersede itself and source signals must be unique record ids', () => {
    expect(code(() => buildWorkStateHandoff(input({ supersedes_handoff_id: HANDOFF_ID }))))
      .toBe('collaboration_invalid');
    expect(buildWorkStateHandoff(input({ supersedes_handoff_id: OTHER_ID })).supersedes_handoff_id)
      .toBe(OTHER_ID);
    expect(code(() => buildWorkStateHandoff(input({ source_signal_ids: [SIGNAL_ID, SIGNAL_ID] }))))
      .toBe('collaboration_invalid');
    for (const bad of ['../escape', SIGNAL_ID.toUpperCase(), 'not-hex', '', 'c'.repeat(65)]) {
      expect({ bad, code: code(() => buildWorkStateHandoff(input({ source_signal_ids: [bad] }))) })
        .toEqual({ bad, code: 'collaboration_invalid' });
    }
  });

  test('the record is exact-key and a stale digest is refused', () => {
    const handoff = buildWorkStateHandoff(input());
    expect(code(() => validateWorkStateHandoff({ ...handoff, extra: 1 }))).toBe('collaboration_invalid');
    expect(code(() => validateWorkStateHandoff({ ...handoff, handoff_sha256: DIGEST })))
      .toBe('collaboration_invalid');
    expect(code(() => validateWorkStateHandoff({ ...handoff, protocol: 2 }))).toBe('collaboration_invalid');
    expect(code(() => validateWorkStateHandoff({ ...handoff, kind: 'repo-harness-coordination-signal' })))
      .toBe('collaboration_invalid');
    // A field edited without recomputing the digest is exactly the tamper this
    // catches: the content moved, the attestation did not.
    expect(code(() => validateWorkStateHandoff({ ...handoff, dead_ends: [] }))).toBe('collaboration_invalid');
  });

  test('the id is derived from repository, actor and one identity key', () => {
    const derived = deriveWorkStateHandoffId(REPOSITORY_ID, ACTOR, 'idem-1');
    expect(derived).toMatch(/^[0-9a-f]{64}$/u);
    expect(derived).toBe(deriveCollaborationRecordId('work-state-handoff', [
      REPOSITORY_ID,
      collaborationActorSha256(ACTOR),
      'idem-1',
    ]));
    expect(derived).not.toBe(deriveWorkStateHandoffId(REPOSITORY_ID, ACTOR, 'idem-2'));
    // Domain separation: a signal and a handoff never collide on one key.
    expect(derived).not.toBe(deriveCollaborationRecordId('coordination-signal', [
      REPOSITORY_ID,
      collaborationActorSha256(ACTOR),
      'idem-1',
    ]));
  });
});

describe('C3 HandoffExecutionContextV1', () => {
  const complete: readonly HandoffExecutionContextV1[] = [
    { kind: 'none' },
    { kind: 'delegated_worker', worker_run_ref_sha256: DIGEST, worker_result_sha256: DIGEST },
    {
      kind: 'bound_task',
      task_id: 'f'.repeat(64),
      task_revision: '0'.repeat(64),
      claim_id: '22222222-2222-4222-8222-222222222222',
      lease_generation: 3,
      work_envelope_sha256: DIGEST,
      task_freeze_receipt_sha256: DIGEST,
    },
    { kind: 'publication', publication_id: 'pub-42', head_sha: '9'.repeat(40) },
  ];

  test('every branch round-trips inside a handoff', () => {
    for (const execution_context of complete) {
      const handoff = buildWorkStateHandoff(input({ execution_context }));
      expect({ kind: execution_context.kind, context: handoff.execution_context })
        .toEqual({ kind: execution_context.kind, context: execution_context });
    }
  });

  /**
   * The whole point of the union over four nullable fields: a branch missing one
   * of its references is invalid, so "all four null and still valid" cannot
   * happen. Every branch is tested by deleting each of its own keys in turn.
   */
  test('a branch missing any one of its references is invalid', () => {
    for (const context of complete) {
      for (const key of Object.keys(context).filter((name) => name !== 'kind')) {
        const partial = { ...context } as Record<string, unknown>;
        delete partial[key];
        expect({ kind: context.kind, key, code: code(() => validateHandoffExecutionContext(partial)) })
          .toEqual({ kind: context.kind, key, code: 'collaboration_invalid' });
      }
    }
  });

  test('a branch carrying a foreign reference is invalid', () => {
    expect(code(() => validateHandoffExecutionContext({ kind: 'none', task_id: 'f'.repeat(64) })))
      .toBe('collaboration_invalid');
    expect(code(() => validateHandoffExecutionContext({
      kind: 'publication',
      publication_id: 'pub-42',
      head_sha: '9'.repeat(40),
      claim_id: '22222222-2222-4222-8222-222222222222',
    }))).toBe('collaboration_invalid');
  });

  test('each reference is held to the shape of the authority it names', () => {
    const boundTask = complete[2] as Extract<HandoffExecutionContextV1, { kind: 'bound_task' }>;
    const bad: readonly [string, unknown][] = [
      ['task_id', 'not-hex'],
      ['task_revision', 'f'.repeat(63)],
      ['claim_id', 'not-a-uuid'],
      ['lease_generation', 0],
      ['lease_generation', 1.5],
      ['lease_generation', '3'],
      ['work_envelope_sha256', 'd'.repeat(64)],
      ['task_freeze_receipt_sha256', 'sha256:nothex'],
    ];
    for (const [key, value] of bad) {
      expect({ key, value, code: code(() => validateHandoffExecutionContext({ ...boundTask, [key]: value })) })
        .toEqual({ key, value, code: 'collaboration_invalid' });
    }
    expect(code(() => validateHandoffExecutionContext({
      kind: 'publication', publication_id: 'pub-42', head_sha: 'z'.repeat(40),
    }))).toBe('collaboration_invalid');
    expect(code(() => validateHandoffExecutionContext({
      kind: 'publication', publication_id: 'pub\n42', head_sha: '9'.repeat(40),
    }))).toBe('collaboration_invalid');
    expect(code(() => validateHandoffExecutionContext({
      kind: 'delegated_worker', worker_run_ref_sha256: DIGEST, worker_result_sha256: 'sha256:short',
    }))).toBe('collaboration_invalid');
  });

  test('an unknown or absent discriminator is invalid', () => {
    for (const value of [{ kind: 'human' }, { kind: '' }, {}, null, [], 'none']) {
      expect({ value, code: code(() => validateHandoffExecutionContext(value)) })
        .toEqual({ value, code: 'collaboration_invalid' });
    }
  });
});

/**
 * The frozen split: a handoff passes knowledge, `TaskFreezeReceiptV1` passes
 * exact state, and the existing Lease lifecycle passes the right to execute.
 * These modules therefore do not own a wire version of their own — they consume
 * the frozen `COLLABORATION_PROTOCOL` — and the closed inclusion scan in
 * `tests/unit/collaboration-authority-baseline.test.ts`, which ranges over
 * `src/core/**` modules that *own* a `*_PROTOCOL`, is left true unchanged with
 * `src/core/collaboration/common.ts` still the single adjudicated exclusion for
 * the whole plane.
 */
describe('C3 protocol ownership and vocabulary', () => {
  const C3_CORE = ['src/core/collaboration/handoff.ts', 'src/core/collaboration/adoption.ts'] as const;

  test('neither module mints a second protocol constant for the collaboration plane', async () => {
    for (const module of C3_CORE) {
      const namespace = (await import(join(REPO_ROOT, module))) as Readonly<Record<string, unknown>>;
      expect({ module, owners: Object.keys(namespace).filter((name) => name.endsWith('_PROTOCOL')) })
        .toEqual({ module, owners: [] });
    }
    const handoff = buildWorkStateHandoff(input());
    expect(handoff.protocol).toBe(COLLABORATION_PROTOCOL);
  });

  /**
   * Knowledge adoption never borrows the delivery plane's ownership vocabulary.
   * The adoption family carries the word nowhere at all. `handoff.ts` may name a
   * `claim_id`, because the `bound_task` branch points at a real Task Claim, so
   * the allowed set is stated exactly rather than the rule being waived: a
   * `claimHandoff`, a `claimed_by` or an `unclaimed` would all widen it and fail.
   */
  test('knowledge transfer never uses claim vocabulary', () => {
    for (const module of [
      'src/core/collaboration/adoption.ts',
      'src/effects/collaboration/adoption-store.ts',
    ]) {
      const source = readFileSync(join(REPO_ROOT, module), 'utf8');
      expect({ module, claimWords: source.match(/claim/giu) ?? [] })
        .toEqual({ module, claimWords: [] });
    }

    const handoffSource = readFileSync(join(REPO_ROOT, 'src/core/collaboration/handoff.ts'), 'utf8');
    expect([...new Set(handoffSource.match(/[A-Za-z_]*claim[A-Za-z_]*/giu) ?? [])].sort())
      // `Claim` is the delivery-plane noun in prose; `claim_id` and its local
      // binding are the `bound_task` reference to it. Nothing else is allowed.
      .toEqual(['Claim', 'claimId', 'claim_id']);

    for (const module of [
      'src/core/collaboration/handoff.ts',
      'src/core/collaboration/adoption.ts',
      'src/effects/collaboration/handoff-store.ts',
      'src/effects/collaboration/adoption-store.ts',
    ]) {
      expect({ module, unclaimed: readFileSync(join(REPO_ROOT, module), 'utf8').includes('unclaimed') })
        .toEqual({ module, unclaimed: false });
    }
    // The term for a handoff nobody has picked up.
    expect(readFileSync(join(REPO_ROOT, 'src/core/collaboration/adoption.ts'), 'utf8'))
      .toContain('unadopted_handoff');
  });
});
