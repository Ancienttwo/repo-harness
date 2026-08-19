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
  TASK_DIGEST_PATTERN,
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskId,
  deriveTaskRevision,
  lookupCanonicalTask,
  parseLeaseOwnerRecord,
  projectCanonicalTasks,
  releaseLeaseRecord,
  serializeLeaseOwnerRecord,
  stealLeaseRecord,
  type LeaseOwnerRecordV1,
} from '../src/core/state/coordination-identity';

const REPO_IDENTITY = '/tmp/example-clone/.git';
const SPRINT_PATH = 'plans/sprints/20260818-1156-shared-lease.sprint.md';

function sprint(rows: readonly string[]): string {
  return [
    '# Sprint: Coordination Identity Fixture',
    '',
    '> **Status**: Executing',
    '> **Slug**: coordination-identity',
    '',
    '## Backlog',
    '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '|---|--------|------|------|------------|------|',
    ...rows,
    '',
    '## Execution Log',
    '',
  ].join('\n');
}

const ROW_A = '| 1 | [ ] | build the lease store | contract | store tests pass | (pending) |';
const ROW_A_DONE = '| 1 | [x] | build the lease store | contract | store tests pass | `plans/archive/plan-a.md` |';
const ROW_B = '| 2 | [ ] | wire the claim verbs | contract | claim tests pass | (pending) |';
const ROW_C = '| 3 | [ ] | document the protocol | inline | docs updated | (pending) |';

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
    const renumbered = '| 1 | [ ] | wire the claim verbs | contract | claim tests pass | (pending) |';
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
      '| 1 | [ ] | Fix auth bug | contract | green | (pending) |',
      '| 2 | [ ] | Fix auth-bug | contract | green | (pending) |',
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

  test('the same Task cell text in two different sprints stays isolated', () => {
    const text = sprint([ROW_B]);
    const here = taskByCell(text, 'wire the claim verbs', 'plans/sprints/one.sprint.md');
    const there = taskByCell(text, 'wire the claim verbs', 'plans/sprints/two.sprint.md');
    expect(there.task_id).not.toBe(here.task_id);
    expect(there.task_revision).not.toBe(here.task_revision);
  });

  test('a different clone derives a different task_id for the same row', () => {
    const shared = { sprintPath: SPRINT_PATH, taskCell: 'wire the claim verbs' };
    expect(deriveTaskId({ ...shared, repoIdentity: '/tmp/clone-a/.git' }))
      .not.toBe(deriveTaskId({ ...shared, repoIdentity: '/tmp/clone-b/.git' }));
  });

  test('field boundaries cannot be forged by embedding a separator', () => {
    // A naive `fields.join('\n')` preimage would let these two collide.
    const left = deriveTaskId({
      repoIdentity: REPO_IDENTITY,
      sprintPath: 'plans/sprints/a.md',
      taskCell: 'b/c',
    });
    const right = deriveTaskId({
      repoIdentity: REPO_IDENTITY,
      sprintPath: 'plans/sprints/a.md\nb',
      taskCell: 'c',
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
      '| 1 | [ ] | build the lease store | inline | store tests pass and docs land | (pending) |',
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
      sprint([ROW_A, '| 2 | [ ] | wire the claim verbs | contract | claim and steal tests pass | (pending) |']),
      'wire the claim verbs',
    );
    expect(after.task_id).toBe(before.task_id);
    expect(after.task_revision).not.toBe(before.task_revision);
  });

  test("editing this row's Mode drifts its revision", () => {
    const before = taskByCell(sprint([ROW_B]), 'wire the claim verbs');
    const after = taskByCell(
      sprint(['| 2 | [ ] | wire the claim verbs | inline | claim tests pass | (pending) |']),
      'wire the claim verbs',
    );
    expect(after.task_id).toBe(before.task_id);
    expect(after.task_revision).not.toBe(before.task_revision);
  });

  test('the revision is bound to its own task_id', () => {
    const shared = { modeCell: 'contract', acceptanceCell: 'green' };
    const left = deriveTaskId({ repoIdentity: REPO_IDENTITY, sprintPath: SPRINT_PATH, taskCell: 'one' });
    const right = deriveTaskId({ repoIdentity: REPO_IDENTITY, sprintPath: SPRINT_PATH, taskCell: 'two' });
    expect(deriveTaskRevision({ ...shared, taskId: left }))
      .not.toBe(deriveTaskRevision({ ...shared, taskId: right }));
  });

  test('lookup fails closed on an unknown, malformed, or ambiguous task id', () => {
    const text = sprint([ROW_A, ROW_B]);
    const unknown = lookupCanonicalTask(input(text), 'f'.repeat(64));
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.error).toContain('no backlog row');

    const malformed = lookupCanonicalTask(input(text), 'not-a-digest');
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error).toContain('malformed task id');

    const duplicated = sprint([ROW_B, '| 3 | [ ] | wire the claim verbs | inline | other | (pending) |']);
    const taskId = tasksOf(duplicated)[0].task_id;
    const ambiguous = lookupCanonicalTask(input(duplicated), taskId);
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) expect(ambiguous.error).toContain('ambiguous task id');
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
