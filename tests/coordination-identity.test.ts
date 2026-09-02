/**
 * Identity and revision determinism for the shared lease protocol.
 *
 * The first suite is the contract's Falsifier, run before anything downstream
 * exists: if a claim cannot survive an unrelated row completing, the revision
 * granularity is wrong and every verb built on it inherits the defect.
 */
import { describe, expect, test } from 'bun:test';
import {
  COORDINATION_PROTOCOL,
  FIRST_LEASE_GENERATION,
  LEASE_OWNER_RECORD_SCHEMA_V2,
  TASK_DIGEST_PATTERN,
  abortLeaseCompletionRecord,
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  abandonPublicationLeaseRecord,
  deriveTaskRevision,
  lookupCanonicalTask,
  parseLeaseOwnerRecord,
  projectCanonicalTasks,
  releaseLeaseRecord,
  reopenPublicationLeaseRecord,
  serializeLeaseOwnerRecord,
  stealLeaseRecord,
  takeoverPublicationLeaseRecord,
  enterReviewingLeaseRecord,
  type LeaseOwnerRecordV1,
} from '../src/core/state/coordination-identity';
import { SprintSchemaError } from '../src/core/state/sprint-backlog-rows';
import { fixtureTaskId } from './helpers/sprint-fixture';

const REPO_IDENTITY = '/tmp/example-clone/.git';
const SPRINT_PATH = 'plans/sprints/20260818-1156-shared-lease.sprint.md';

function sprint(rows: readonly string[]): string {
  return [
    '# Sprint: Coordination Identity Fixture',
    '',
    '> **Status**: Executing',
    '> **Slug**: coordination-identity',
    '> **Backlog Schema**: 2',
    '',
    '## Backlog',
    '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    ...rows,
    '',
    '## Execution Log',
    '',
  ].join('\n');
}

const ID_A = fixtureTaskId('build the lease store');
const ID_B = fixtureTaskId('wire the claim verbs');
const ID_C = fixtureTaskId('document the protocol');

const ROW_A = `| 1 | ${ID_A} | [ ] | build the lease store | contract | store tests pass | (pending) |`;
const ROW_A_DONE = `| 1 | ${ID_A} | [x] | build the lease store | contract | store tests pass | \`plans/archive/plan-a.md\` |`;
const ROW_B = `| 2 | ${ID_B} | [ ] | wire the claim verbs | contract | claim tests pass | (pending) |`;
const ROW_C = `| 3 | ${ID_C} | [ ] | document the protocol | inline | docs updated | (pending) |`;

function tasksOf(sprintText: string, sprintPath = SPRINT_PATH) {
  return projectCanonicalTasks({
    repoIdentity: REPO_IDENTITY,
    sprintPath,
    sprintText,
  });
}

function taskByCell(sprintText: string, taskCell: string, sprintPath = SPRINT_PATH) {
  const found = tasksOf(sprintText, sprintPath).find((task) => task.row.task === taskCell);
  if (!found) throw new Error(`fixture has no row with Task cell ${taskCell}`);
  return found;
}

describe('falsifier: a claim survives an unrelated row completing', () => {
  test("row B's task_revision is unchanged when row A's Status flips [ ] -> [x]", () => {
    const before = sprint([ROW_A, ROW_B, ROW_C]);
    const after = sprint([ROW_A_DONE, ROW_B, ROW_C]);

    // The sprint file really did change; the assertion below is not vacuous.
    expect(after).not.toBe(before);
    expect(taskByCell(before, 'build the lease store').row.status).toBe('[ ]');
    expect(taskByCell(after, 'build the lease store').row.status).toBe('[x]');

    const rowBefore = taskByCell(before, 'wire the claim verbs');
    const rowAfter = taskByCell(after, 'wire the claim verbs');
    expect(rowAfter.task_revision).toBe(rowBefore.task_revision);
    expect(rowAfter.task_id).toBe(rowBefore.task_id);
  });

  test("a row's own Status flip does not move its task_revision either", () => {
    const pending = taskByCell(sprint([ROW_A, ROW_B]), 'build the lease store');
    const done = taskByCell(sprint([ROW_A_DONE, ROW_B]), 'build the lease store');
    expect(done.task_revision).toBe(pending.task_revision);
    // Only the Plan and Status cells moved, and neither is in either preimage.
    expect(done.row.plan).not.toBe(pending.row.plan);
  });

  test('task_id survives a row reorder', () => {
    const original = tasksOf(sprint([ROW_A, ROW_B, ROW_C]));
    const reordered = tasksOf(sprint([ROW_C, ROW_B, ROW_A]));
    expect(reordered.map((task) => task.row.task)).toEqual([
      'document the protocol',
      'wire the claim verbs',
      'build the lease store',
    ]);
    for (const task of original) {
      const moved = reordered.find((candidate) => candidate.row.task === task.row.task);
      expect(moved?.task_id).toBe(task.task_id);
      expect(moved?.task_revision).toBe(task.task_revision);
    }
  });

  test('task_id survives deleting the row above, renumbered indices included', () => {
    const original = taskByCell(sprint([ROW_A, ROW_B, ROW_C]), 'wire the claim verbs');
    const renumbered = `| 1 | ${ID_B} | [ ] | wire the claim verbs | contract | claim tests pass | (pending) |`;
    const survivor = taskByCell(sprint([renumbered, ROW_C]), 'wire the claim verbs');
    expect(survivor.row.index).toBe('1');
    expect(original.row.index).toBe('2');
    expect(survivor.task_id).toBe(original.task_id);
    expect(survivor.task_revision).toBe(original.task_revision);
  });
});

describe('task identity', () => {
  test('digests are bare 64-character hex, safe as one path component', () => {
    for (const task of tasksOf(sprint([ROW_A, ROW_B]))) {
      expect(task.task_id).toMatch(TASK_DIGEST_PATTERN);
      expect(task.task_revision).toMatch(TASK_DIGEST_PATTERN);
      expect(task.task_id).not.toContain('/');
      expect(task.task_id).not.toContain(':');
    }
  });

  test('derivation is deterministic across calls', () => {
    const first = tasksOf(sprint([ROW_A, ROW_B, ROW_C]));
    const second = tasksOf(sprint([ROW_A, ROW_B, ROW_C]));
    expect(second.map((task) => task.task_id)).toEqual(first.map((task) => task.task_id));
    expect(second.map((task) => task.task_revision)).toEqual(
      first.map((task) => task.task_revision),
    );
  });

  test('two rows whose slugs normalize identically do not collide', () => {
    // `normalize_slug()` collapses both of these to `fix-auth-bug`; the exact
    // Task cell text does not, which is why it, not the slug, is the key.
    const text = sprint([
      `| 1 | ${fixtureTaskId('Fix auth bug')} | [ ] | Fix auth bug | contract | green | (pending) |`,
      `| 2 | ${fixtureTaskId('Fix auth-bug')} | [ ] | Fix auth-bug | contract | green | (pending) |`,
    ]);
    const tasks = tasksOf(text);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].task_id).not.toBe(tasks[1].task_id);
    expect(tasks[0].task_revision).not.toBe(tasks[1].task_revision);

    // Both are individually resolvable, so neither shadows the other.
    const input = { repoIdentity: REPO_IDENTITY, sprintPath: SPRINT_PATH, sprintText: text };
    for (const task of tasks) {
      const lookup = lookupCanonicalTask(input, task.task_id);
      expect(lookup.ok).toBe(true);
      if (lookup.ok) expect(lookup.task.row.task).toBe(task.row.task);
    }
  });

  test('identity no longer depends on the sprint path or the clone', () => {
    // The persisted cell IS the identity: the same row read under two sprint
    // paths is the same task, and cross-sprint separation now comes from
    // minting distinct ids rather than from hashing the path or the clone.
    const text = sprint([ROW_B]);
    const here = taskByCell(text, 'wire the claim verbs', 'plans/sprints/one.sprint.md');
    const there = taskByCell(text, 'wire the claim verbs', 'plans/sprints/two.sprint.md');
    expect(here.task_id).toBe(ID_B);
    expect(there.task_id).toBe(here.task_id);
    expect(there.task_revision).toBe(here.task_revision);
  });

  test('revision field boundaries cannot be forged by embedding a separator', () => {
    // A naive `fields.join('\n')` preimage would let these two collide.
    const left = deriveTaskRevision({
      taskId: ID_A, taskCell: 'b/c', modeCell: 'contract', acceptanceCell: 'green',
    });
    const right = deriveTaskRevision({
      taskId: ID_A, taskCell: 'b', modeCell: 'c\ncontract', acceptanceCell: 'green',
    });
    expect(left).not.toBe(right);
  });
});

describe('task revision granularity', () => {
  const input = (text: string) => ({
    repoIdentity: REPO_IDENTITY,
    sprintPath: SPRINT_PATH,
    sprintText: text,
  });

  test("editing an unrelated row's Mode or Acceptance leaves this row untouched", () => {
    const before = sprint([ROW_A, ROW_B]);
    const editedSibling = sprint([
      `| 1 | ${ID_A} | [ ] | build the lease store | inline | store tests pass and docs land | (pending) |`,
      ROW_B,
    ]);
    expect(taskByCell(editedSibling, 'wire the claim verbs').task_revision)
      .toBe(taskByCell(before, 'wire the claim verbs').task_revision);
    // The edited row itself did move, so the check has teeth.
    expect(taskByCell(editedSibling, 'build the lease store').task_revision)
      .not.toBe(taskByCell(before, 'build the lease store').task_revision);
  });

  test("editing this row's Acceptance drifts its revision but keeps its identity", () => {
    const before = taskByCell(sprint([ROW_A, ROW_B]), 'wire the claim verbs');
    const after = taskByCell(
      sprint([ROW_A, `| 2 | ${ID_B} | [ ] | wire the claim verbs | contract | claim and steal tests pass | (pending) |`]),
      'wire the claim verbs',
    );
    expect(after.task_id).toBe(before.task_id);
    expect(after.task_revision).not.toBe(before.task_revision);
  });

  test("editing this row's Mode drifts its revision", () => {
    const before = taskByCell(sprint([ROW_B]), 'wire the claim verbs');
    const after = taskByCell(
      sprint([`| 2 | ${ID_B} | [ ] | wire the claim verbs | inline | claim tests pass | (pending) |`]),
      'wire the claim verbs',
    );
    expect(after.task_id).toBe(before.task_id);
    expect(after.task_revision).not.toBe(before.task_revision);
  });

  test('the revision is bound to its own task_id', () => {
    const shared = { taskCell: 'same text', modeCell: 'contract', acceptanceCell: 'green' };
    expect(deriveTaskRevision({ ...shared, taskId: fixtureTaskId('one') }))
      .not.toBe(deriveTaskRevision({ ...shared, taskId: fixtureTaskId('two') }));
  });

  test('the revision moves with the Task cell so a rename drifts stale claims', () => {
    const shared = { taskId: ID_B, modeCell: 'contract', acceptanceCell: 'claim tests pass' };
    expect(deriveTaskRevision({ ...shared, taskCell: 'wire the claim verbs' }))
      .not.toBe(deriveTaskRevision({ ...shared, taskCell: 'wire the claim verbs (fencing)' }));
  });

  test('lookup fails closed on an unknown, malformed, or ambiguous task id', () => {
    const text = sprint([ROW_A, ROW_B]);
    const unknown = lookupCanonicalTask(input(text), 'f'.repeat(64));
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain('no backlog row');

    const malformed = lookupCanonicalTask(input(text), 'not-a-digest');
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error).toContain('malformed task id');

    // Two rows carrying one copied id is the fail-closed case: the whole
    // projection is refused rather than one of the two rows being picked.
    const duplicated = sprint([ROW_B, `| 3 | ${ID_B} | [ ] | wire the claim verbs again | inline | other | (pending) |`]);
    const ambiguous = lookupCanonicalTask(input(duplicated), ID_B);
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) expect(ambiguous.error).toContain('repeats task id');
    expect(() => tasksOf(duplicated)).toThrow(SprintSchemaError);
  });

  test('the protocol version is part of the preimage', () => {
    expect(COORDINATION_PROTOCOL).toBe(1);
  });
});

/**
 * The owner record's three fencing/authority fields, falsified where they are
 * cheapest to falsify: no filesystem, no git, no clock. Every case here is a
 * shape the store must classify `unknown` rather than partly trust.
 */
describe('owner record schema', () => {
  const TASK = taskByCell(sprint([ROW_A, ROW_B]), 'wire the claim verbs');

  function owner(): LeaseOwnerRecordV1 {
    return buildLeaseOwnerRecord({
      claimId: 'claim-1',
      taskId: TASK.task_id,
      taskRevision: TASK.task_revision,
      sprintPath: SPRINT_PATH,
      targetRef: 'refs/heads/main',
      generation: FIRST_LEASE_GENERATION,
      sessionId: 'session-1',
      sourceWorktree: '/tmp/example-clone',
    });
  }

  test('a fresh claim mints generation 1, records its ref, and has no finish key', () => {
    const record = owner();
    expect(record.generation).toBe(1);
    expect(record.target_ref).toBe('refs/heads/main');
    expect(record.finish_transaction_key).toBeNull();
    expect(parseLeaseOwnerRecord(serializeLeaseOwnerRecord(record))).toEqual(record);
  });

  test('parse rejects a record missing generation, target_ref, or finish_transaction_key', () => {
    for (const field of ['generation', 'target_ref', 'finish_transaction_key'] as const) {
      const { [field]: _dropped, ...withoutField } = owner();
      expect(parseLeaseOwnerRecord(`${JSON.stringify(withoutField)}\n`)).toBeNull();
    }
  });

  test('parse rejects a generation that is not a whole number at or above 1', () => {
    for (const generation of [0, -1, 1.5, '2', null]) {
      expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...owner(), generation })}\n`)).toBeNull();
    }
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...owner(), generation: 7 })}\n`)?.generation)
      .toBe(7);
  });

  test('parse rejects an empty target_ref and a non-null non-string finish key', () => {
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...owner(), target_ref: '' })}\n`)).toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...owner(), finish_transaction_key: 7 })}\n`))
      .toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...owner(), finish_transaction_key: '' })}\n`))
      .toBeNull();
  });

  test('schema-1 retains its existing field-level compatibility while rejecting schema-2 carriers', () => {
    const legacy = {
      ...owner(),
      state: 'reserving' as const,
      execution_worktree: null,
      branch: null,
      // Schema 1 historically validates fields, not cross-state execution tuples.
      unit_ref: 'plans/legacy-boundary.md',
    };
    expect(parseLeaseOwnerRecord(serializeLeaseOwnerRecord(legacy))).toEqual(legacy);
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...legacy, current_publication: null })}\n`)).toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...legacy, unknown_outer_field: true })}\n`)).toBeNull();
  });

  test('begin-completion records the closeout journal key it was handed', () => {
    const bound = bindLeaseRecord(owner(), {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
      branch: 'codex/row',
      unitRef: 'plans/plan-row.md',
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;

    const keyed = beginLeaseCompletionRecord(bound.record, {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
      finishTransactionKey: 'finish/abc123',
    });
    expect(keyed.ok).toBe(true);
    if (keyed.ok) {
      expect(keyed.record.state).toBe('completing');
      expect(keyed.record.finish_transaction_key).toBe('finish/abc123');
    }

    // No journal, no key: the field is never filled with a plausible stand-in.
    const unkeyed = beginLeaseCompletionRecord(bound.record, {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
      finishTransactionKey: null,
    });
    expect(unkeyed.ok).toBe(true);
    if (unkeyed.ok) expect(unkeyed.record.finish_transaction_key).toBeNull();
  });

  test('abort-completion restores only the same fenced worktree and is idempotent', () => {
    const bound = bindLeaseRecord(owner(), {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
      branch: 'codex/row',
      unitRef: 'plans/plan-row.md',
    });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const completing = beginLeaseCompletionRecord(bound.record, {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
      finishTransactionKey: 'finish/abc123',
    });
    expect(completing.ok).toBe(true);
    if (!completing.ok) return;

    expect(abortLeaseCompletionRecord(completing.record, {
      claimId: 'stale-claim',
      executionWorktree: '/tmp/wt',
    }).ok).toBe(false);
    expect(abortLeaseCompletionRecord(completing.record, {
      claimId: 'claim-1',
      executionWorktree: '/tmp/other',
    }).ok).toBe(false);

    const restored = abortLeaseCompletionRecord(completing.record, {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.record).toMatchObject({
      state: 'bound',
      claim_id: 'claim-1',
      execution_worktree: '/tmp/wt',
      finish_transaction_key: null,
    });

    const replay = abortLeaseCompletionRecord(restored.record, {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
    });
    expect(replay).toEqual(restored);
    expect(abortLeaseCompletionRecord(owner(), {
      claimId: 'claim-1',
      executionWorktree: '/tmp/wt',
    }).ok).toBe(false);
  });

  test('a steal increments the generation and keeps the claimed ref', () => {
    const first = owner();
    const stolen = stealLeaseRecord(first, {
      expectedClaimId: 'claim-1',
      reason: 'no progress',
      newClaimId: 'claim-2',
      sessionId: 'session-2',
      sourceWorktree: '/tmp/other',
    });
    expect(stolen.ok).toBe(true);
    if (!stolen.ok) return;
    expect(stolen.record.generation).toBe(2);
    expect(stolen.record.target_ref).toBe(first.target_ref);
    expect(stolen.record.finish_transaction_key).toBeNull();
    expect(stolen.record.stolen_from).toEqual({ claim_id: 'claim-1', reason: 'no progress' });

    const again = stealLeaseRecord(stolen.record, {
      expectedClaimId: 'claim-2',
      reason: 'reassigned',
      newClaimId: 'claim-3',
      sessionId: 'session-3',
      sourceWorktree: '/tmp/third',
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.record.generation).toBe(3);
  });
});

describe('lease state guards', () => {
  const TASK = taskByCell(sprint([ROW_A, ROW_B]), 'build the lease store');

  function inState(state: 'reserving' | 'bound' | 'completing' | 'released'): LeaseOwnerRecordV1 {
    return {
      ...buildLeaseOwnerRecord({
        claimId: 'claim-1',
        taskId: TASK.task_id,
        taskRevision: TASK.task_revision,
        sprintPath: SPRINT_PATH,
        targetRef: 'main',
        generation: FIRST_LEASE_GENERATION,
        sessionId: 'session-1',
        sourceWorktree: '/tmp/example-clone',
      }),
      state,
    };
  }

  test('a completing lease refuses every steal, however the token is presented', () => {
    const stolen = stealLeaseRecord(inState('completing'), {
      expectedClaimId: 'claim-1',
      reason: 'stalled',
      newClaimId: 'claim-2',
      sessionId: 'session-2',
      sourceWorktree: '/tmp/other',
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error).toContain('cannot steal a lease in state completing');

    // The states a steal is for are unaffected.
    for (const state of ['reserving', 'bound'] as const) {
      const allowed = stealLeaseRecord(inState(state), {
        expectedClaimId: 'claim-1',
        reason: 'stalled',
        newClaimId: 'claim-2',
        sessionId: 'session-2',
        sourceWorktree: '/tmp/other',
      });
      expect(allowed.ok).toBe(true);
    }
  });

  test('release accepts only reserving and bound', () => {
    for (const state of ['reserving', 'bound'] as const) {
      const released = releaseLeaseRecord(inState(state), 'claim-1');
      expect(released.ok).toBe(true);
      if (released.ok) expect(released.record.state).toBe('released');
    }
    for (const state of ['completing', 'released'] as const) {
      const refused = releaseLeaseRecord(inState(state), 'claim-1');
      expect(refused.ok).toBe(false);
      if (!refused.ok) {
        expect(refused.error).toContain(`cannot release a lease in state ${state}`);
      }
    }
  });

  test('the fencing token is compared before the state, on every transition', () => {
    for (const transition of [
      () => releaseLeaseRecord(inState('completing'), 'claim-other'),
      () => stealLeaseRecord(inState('completing'), {
        expectedClaimId: 'claim-other',
        reason: 'stalled',
        newClaimId: 'claim-2',
        sessionId: 'session-2',
        sourceWorktree: '/tmp/other',
      }),
    ]) {
      const outcome = transition();
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error).not.toContain('state completing');
    }
  });
});

describe('lease owner record schema 2 publication lifecycle', () => {
  const TASK = taskByCell(sprint([ROW_A, ROW_B]), 'build the lease store');
  const pointer = {
    publication_id: `sha256:${'a'.repeat(64)}`,
    receipt_sha256: `sha256:${'b'.repeat(64)}`,
    head_sha: 'c'.repeat(40),
    ship_transaction_key: 'ship/fixture-key',
  } as const;

  function completing() {
    const reserved = buildLeaseOwnerRecord({
      claimId: 'claim-1', taskId: TASK.task_id, taskRevision: TASK.task_revision,
      sprintPath: SPRINT_PATH, targetRef: 'main', generation: 1,
      sessionId: 'session-1', sourceWorktree: '/tmp/source',
    });
    const bound = bindLeaseRecord(reserved, {
      claimId: 'claim-1', executionWorktree: '/tmp/review-wt', branch: 'codex/review', unitRef: 'plans/review.md',
    });
    if (!bound.ok) throw new Error(bound.error);
    const complete = beginLeaseCompletionRecord(bound.record, {
      claimId: 'claim-1', executionWorktree: '/tmp/review-wt', finishTransactionKey: 'finish/fixture-key',
    });
    if (!complete.ok) throw new Error(complete.error);
    return complete.record;
  }

  test('writes a strict schema-2 reviewing pointer without touching coordination digests', () => {
    const entered = enterReviewingLeaseRecord(completing(), { claimId: 'claim-1', publication: pointer });
    expect(entered.ok).toBe(true);
    if (!entered.ok) return;
    expect(entered.record).toMatchObject({
      record_schema: LEASE_OWNER_RECORD_SCHEMA_V2,
      state: 'reviewing',
      current_publication: pointer,
      finish_transaction_key: null,
    });
    expect(parseLeaseOwnerRecord(serializeLeaseOwnerRecord(entered.record))).toEqual(entered.record);
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...entered.record, current_publication: { ...pointer, extra: true } })}\n`)).toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...entered.record, record_schema: 3 })}\n`)).toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...entered.record, record_schema: undefined })}\n`)).toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...entered.record, unexpected: true })}\n`)).toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...entered.record, finish_transaction_key: 'finish/mixed-domains' })}\n`)).toBeNull();
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...entered.record, execution_worktree: null, branch: null, unit_ref: null })}\n`)).toBeNull();
    const reopened = reopenPublicationLeaseRecord(entered.record, {
      claimId: 'claim-1', expectedGeneration: 1, expectedPublicationId: pointer.publication_id, expectedHeadSha: pointer.head_sha,
    });
    if (!reopened.ok) throw new Error(reopened.error);
    expect(parseLeaseOwnerRecord(`${JSON.stringify({ ...reopened.record, current_publication: pointer })}\n`)).toBeNull();
    expect(COORDINATION_PROTOCOL).toBe(1);
  });

  test('reviewing refuses ordinary steal and only lifecycle transitions clear its pointer', () => {
    const entered = enterReviewingLeaseRecord(completing(), { claimId: 'claim-1', publication: pointer });
    if (!entered.ok) throw new Error(entered.error);
    const stolen = stealLeaseRecord(entered.record, {
      expectedClaimId: 'claim-1', reason: 'repair', newClaimId: 'claim-2', sessionId: 'session-2', sourceWorktree: '/tmp/two',
    });
    expect(stolen.ok).toBe(false);
    if (!stolen.ok) expect(stolen.error).toContain('publication takeover');

    const reopened = reopenPublicationLeaseRecord(entered.record, {
      claimId: 'claim-1', expectedGeneration: 1, expectedPublicationId: pointer.publication_id, expectedHeadSha: pointer.head_sha,
    });
    expect(reopened.ok).toBe(true);
    if (reopened.ok) expect(reopened.record).toMatchObject({ state: 'bound', current_publication: null, record_schema: 2 });

    const taken = takeoverPublicationLeaseRecord(entered.record, {
      expectedClaimId: 'claim-1', expectedGeneration: 1, expectedPublicationId: pointer.publication_id,
      expectedHeadSha: pointer.head_sha,
      reason: 'repair', newClaimId: 'claim-2', sessionId: 'session-2', sourceWorktree: '/tmp/two',
    });
    expect(taken.ok).toBe(true);
    if (taken.ok) expect(taken.record).toMatchObject({
      state: 'reserving', generation: 2, claim_id: 'claim-2', execution_worktree: null, branch: null, unit_ref: null, current_publication: null,
    });
    const abandoned = abandonPublicationLeaseRecord(entered.record, {
      expectedClaimId: 'claim-1', expectedGeneration: 1, expectedPublicationId: pointer.publication_id,
      expectedHeadSha: pointer.head_sha,
    });
    expect(abandoned.ok).toBe(true);
    if (abandoned.ok) expect(abandoned.record).toMatchObject({ state: 'released', current_publication: null });

    const staleGeneration = reopenPublicationLeaseRecord(entered.record, {
      claimId: 'claim-1', expectedGeneration: 2, expectedPublicationId: pointer.publication_id, expectedHeadSha: pointer.head_sha,
    });
    expect(staleGeneration).toEqual({ ok: false, error: expect.stringContaining('expected generation') });
    const staleHead = takeoverPublicationLeaseRecord(entered.record, {
      expectedClaimId: 'claim-1', expectedGeneration: 1, expectedPublicationId: pointer.publication_id,
      expectedHeadSha: 'd'.repeat(40), reason: 'repair', newClaimId: 'claim-2', sessionId: 'session-2', sourceWorktree: '/tmp/two',
    });
    expect(staleHead).toEqual({ ok: false, error: 'publication_pointer_mismatch' });
  });
});
