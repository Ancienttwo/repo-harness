/**
 * The pure board projection, with no filesystem, no git, and no clock.
 *
 * Everything falsified here is a decision, not an effect: which column a
 * (task_state, lease_state, progress_state) triple lands in, which diagnostics
 * a shape raises, and which existing commands a card may offer. The effects --
 * torn snapshots, real leases, real worktrees -- are falsified in
 * `tests/board-snapshot-consistency.test.ts` and
 * `tests/sprint-claim-concurrency.test.ts`; a mock there would prove nothing,
 * and a filesystem here would prove nothing either.
 *
 * The column assertions are written as invariants over the whole constructible
 * cross product rather than as a second copy of the implementation's `if`
 * chain. A mirrored predicate would pass against any refactor that broke both
 * copies the same way; an invariant ("done outranks everything", "only
 * `stalled` lets the evidence dimension move a column") does not.
 */
import { describe, expect, test } from 'bun:test';
import type { AttemptLedgerRead } from '../src/core/state/attempt-ledger';
import {
  deriveTaskRevision,
  type LeaseOwnerRecordV2,
  type LeaseOwnerRecordV1,
} from '../src/core/state/coordination-identity';
import {
  boardDigest,
  composeBoardRevision,
  projectBoard,
  type BoardEvidenceInput,
  type BoardInputsV1,
  type BoardLeaseInput,
  type BoardTaskInput,
} from '../src/core/state/project-board';
import type { CanonicalTaskRow } from '../src/core/state/coordination-identity';
import type {
  AttemptReceiptV1,
  BoardCardV1,
  BoardColumn,
  BoardLeaseState,
  BoardProgressState,
  TaskState,
} from '../src/core/state/types';
import { fixtureTaskId } from './helpers/sprint-fixture';

const REPO_IDENTITY = '/tmp/board-projection-fixture/.git';
const SPRINT_PATH = 'plans/sprints/board.sprint.md';
const TASK_CELL = 'project the board';
const CANONICAL_REF = 'main';
const CANONICAL_OID = '0123456789abcdef0123456789abcdef01234567';
const WORKTREE = '/tmp/board-projection-fixture-wt-a';
const UNIT_REF = 'plans/plan-board.md';
const TOKEN = 'sha256:progress-token-a';

const TASK_ID = fixtureTaskId(TASK_CELL);
const TASK_REVISION = deriveTaskRevision({ taskCell: TASK_CELL,
  taskId: TASK_ID,
  modeCell: 'contract',
  acceptanceCell: 'board tests pass',
});
/** What the row's definition drifted TO; the lease still holds the old one. */
const DRIFTED_REVISION = deriveTaskRevision({ taskCell: TASK_CELL,
  taskId: TASK_ID,
  modeCell: 'inline',
  acceptanceCell: 'something else entirely',
});

const TASK_STATES: readonly TaskState[] = ['pending', 'done', 'missing', 'drifted'];
const LEASE_STATES: readonly BoardLeaseState[] = [
  'available',
  'reserving',
  'bound',
  'completing',
  'released',
  'unknown',
];
const PROGRESS_STATES: readonly BoardProgressState[] = [
  'not_observed',
  'active',
  'stalled',
  'unreadable',
];

/** The eight reasons the store may classify a lease `unknown`. */
const UNKNOWN_REASONS = [
  'lease_path_not_directory',
  'owner_record_missing',
  'owner_record_symlink',
  'owner_record_not_file',
  'owner_record_empty',
  'owner_record_malformed',
  'owner_record_task_id_mismatch',
  'owner_record_unreadable',
] as const;

function backlogRow(status: string): CanonicalTaskRow {
  return {
    index: '1',
    status,
    task: TASK_CELL,
    mode: 'contract',
    acceptance: 'board tests pass',
    plan: '(pending)',
  };
}

function ownerRecord(overrides: Partial<LeaseOwnerRecordV1> = {}): LeaseOwnerRecordV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-lease-owner',
    claim_id: 'claim-1',
    task_id: TASK_ID,
    task_revision: TASK_REVISION,
    sprint_path: SPRINT_PATH,
    target_ref: CANONICAL_REF,
    generation: 1,
    state: 'bound',
    claimed_by: { session_id: 'session-1', source_worktree: '/tmp/board-projection-fixture' },
    execution_worktree: WORKTREE,
    branch: 'codex/board',
    unit_ref: UNIT_REF,
    finish_transaction_key: null,
    stolen_from: null,
    ...overrides,
  };
}

function noProgressReceipt(): AttemptReceiptV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-attempt-receipt',
    unit_ref: UNIT_REF,
    before_progress_token: TOKEN,
    after_progress_token: TOKEN,
    outcome: 'completed',
    recorded_at: '2026-08-19T00:00:00.000Z',
  };
}

function ledgerFor(progress: BoardProgressState): AttemptLedgerRead {
  if (progress === 'unreadable') return { status: 'unreadable', line: 3 };
  // Two trailing no-progress `completed` receipts are the stall proof; one is
  // not, which is what keeps `active` and `stalled` genuinely different here.
  return {
    status: 'ok',
    receipts: progress === 'stalled' ? [noProgressReceipt(), noProgressReceipt()] : [],
  };
}

function evidenceFor(progress: BoardProgressState): BoardEvidenceInput | null {
  if (progress === 'not_observed') return null;
  return {
    worktree: WORKTREE,
    worktree_present: true,
    ledger: ledgerFor(progress),
    ledger_raw: progress === 'unreadable' ? 'not a receipt\n' : '',
    progress_token: TOKEN,
    progress_unreadable_reason: null,
  };
}

function leaseFor(lease: BoardLeaseState): BoardLeaseInput {
  if (lease === 'available') {
    return { classification: 'available', unknown_reason: null, record: null };
  }
  if (lease === 'unknown') {
    return { classification: 'unknown', unknown_reason: 'owner_record_missing', record: null };
  }
  if (lease === 'reviewing') {
    const reviewing: LeaseOwnerRecordV2 = {
      ...ownerRecord(),
      record_schema: 2,
      state: 'reviewing',
      finish_transaction_key: null,
      current_publication: {
        publication_id: `sha256:${'a'.repeat(64)}`,
        receipt_sha256: `sha256:${'b'.repeat(64)}`,
        head_sha: 'c'.repeat(40),
        ship_transaction_key: 'ship/lease-for-fixture',
      },
    };
    return { classification: lease, unknown_reason: null, record: reviewing };
  }
  const base = lease === 'reserving'
    // A reserving lease has no execution worktree yet: `claim` precedes
    // worktree creation and only `bind` fills it.
    ? ownerRecord({ state: 'reserving', execution_worktree: null, branch: null, unit_ref: null })
    : lease === 'completing'
      ? ownerRecord({ state: 'completing', finish_transaction_key: 'closeout-key-1' })
      : ownerRecord({ state: lease });
  return { classification: lease, unknown_reason: null, record: base };
}

/**
 * Whether a triple is physically constructible. Progress evidence exists only
 * for a lease that names an execution worktree, so `available`, `unknown`, and
 * `reserving` can only ever be `not_observed`.
 */
function constructible(lease: BoardLeaseState, progress: BoardProgressState): boolean {
  const observable = lease === 'bound' || lease === 'completing' || lease === 'released';
  return observable || progress === 'not_observed';
}

function taskInput(
  state: TaskState,
  lease: BoardLeaseState,
  progress: BoardProgressState,
): BoardTaskInput {
  const leaseInput = leaseFor(lease);
  const hasRecord = leaseInput.record !== null;
  const row = state === 'missing'
    ? null
    : state === 'done'
      ? backlogRow('[x]')
      // With a lease, drift is a revision mismatch; without one there is no
      // record to mismatch, so the drifted shape is a status cell outside the
      // `[ ]` / `[x]` grammar `sprint-backlog.sh` writes.
      : state === 'drifted' && !hasRecord
        ? backlogRow('[~]')
        : backlogRow('[ ]');
  const record = hasRecord && state === 'drifted'
    ? { ...leaseInput.record!, task_revision: DRIFTED_REVISION }
    : leaseInput.record;
  return {
    task_id: TASK_ID,
    task_revision: TASK_REVISION,
    row,
    lease: { ...leaseInput, record },
    evidence: hasRecord && record?.execution_worktree ? evidenceFor(progress) : null,
  };
}

function boardInputs(tasks: readonly BoardTaskInput[]): BoardInputsV1 {
  return {
    canonical_target: { ref: CANONICAL_REF, oid: CANONICAL_OID },
    sprint_path: SPRINT_PATH,
    tasks,
    revisions: composeBoardRevision({
      task_authority: boardDigest('fixture-task-authority', ['a']),
      coordination: boardDigest('fixture-coordination', ['a']),
      topology: boardDigest('fixture-topology', ['a']),
      evidence: boardDigest('fixture-evidence', ['a']),
    }),
  };
}

function cardFor(
  state: TaskState,
  lease: BoardLeaseState,
  progress: BoardProgressState,
): BoardCardV1 {
  const document = projectBoard(boardInputs([taskInput(state, lease, progress)]));
  return document.cards[0];
}

interface Triple {
  readonly state: TaskState;
  readonly lease: BoardLeaseState;
  readonly progress: BoardProgressState;
}

const TRIPLES: readonly Triple[] = TASK_STATES.flatMap((state) => (
  LEASE_STATES.flatMap((lease) => (
    PROGRESS_STATES
      .filter((progress) => constructible(lease, progress))
      .map((progress) => ({ state, lease, progress }))
  ))
));

describe('board column decision table', () => {
  test('the cross product is total, and every dimension reports what it was given', () => {
    // 4 task states x (3 lease states x 1 progress state + 3 lease states x 4).
    expect(TRIPLES).toHaveLength(4 * (3 + 12));
    const columns = new Set<BoardColumn>();
    for (const triple of TRIPLES) {
      const card = cardFor(triple.state, triple.lease, triple.progress);
      expect(card.task_state).toBe(triple.state);
      expect(card.lease_state).toBe(triple.lease);
      expect(card.progress_state).toBe(triple.progress);
      columns.add(card.column);
    }
    // All four columns are reachable; a table that never produced `todo` or
    // `doing` would pass every blocking assertion below and still be useless.
    expect([...columns].sort()).toEqual(['blocked', 'doing', 'done', 'todo']);
  });

  test('a completed canonical row outranks every other dimension', () => {
    for (const triple of TRIPLES.filter((candidate) => candidate.state === 'done')) {
      const card = cardFor(triple.state, triple.lease, triple.progress);
      expect(card.column).toBe('done');
    }
  });

  test('only `stalled` lets the evidence dimension move a column', () => {
    for (const state of TASK_STATES) {
      for (const lease of LEASE_STATES) {
        const observable = PROGRESS_STATES.filter((progress) => constructible(lease, progress));
        if (observable.length === 1) continue;
        const quiet = observable
          .filter((progress) => progress !== 'stalled')
          .map((progress) => cardFor(state, lease, progress).column);
        // not_observed, active, and unreadable must agree: evidence failure is
        // not evidence of anything about ownership.
        expect(new Set(quiet).size).toBe(1);
        const stalled = cardFor(state, lease, 'stalled');
        expect(stalled.column).toBe(state === 'done' ? 'done' : 'blocked');
      }
    }
  });

  test('an unreadable ledger leaves ownership field-for-field intact', () => {
    const readable = cardFor('pending', 'bound', 'active');
    const unreadable = cardFor('pending', 'bound', 'unreadable');
    expect(unreadable.progress_state).toBe('unreadable');
    expect(unreadable.claim).toEqual(readable.claim);
    expect(unreadable.lease_state).toBe(readable.lease_state);
    expect(unreadable.column).toBe(readable.column);
    expect(unreadable.actions).toEqual(readable.actions);
  });

  test('a pending row with an active lease is doing, and with no lease is todo', () => {
    expect(cardFor('pending', 'available', 'not_observed').column).toBe('todo');
    expect(cardFor('pending', 'reserving', 'not_observed').column).toBe('doing');
    expect(cardFor('pending', 'bound', 'active').column).toBe('doing');
    expect(cardFor('pending', 'completing', 'active').column).toBe('doing');
  });

  test('a residual released lease blocks, because it really blocks claim', () => {
    // `claimSprintCommand` refuses anything whose classification is not
    // `available`, so a `released` record whose directory removal never
    // completed leaves an unclaimable row -- not a free one.
    const card = cardFor('pending', 'released', 'active');
    expect(card.column).toBe('blocked');
    expect(card.lease_state).toBe('released');
  });
});

describe('lease vocabulary pass-through', () => {
  test('all eight unknown reasons survive verbatim and land in blocked', () => {
    for (const reason of UNKNOWN_REASONS) {
      const input = taskInput('pending', 'unknown', 'not_observed');
      const card = projectBoard(boardInputs([
        { ...input, lease: { ...input.lease, unknown_reason: reason } },
      ])).cards[0];
      expect(card.lease_state).toBe('unknown');
      expect(card.diagnostics.lease_unknown_reason).toBe(reason);
      expect(card.column).toBe('blocked');
    }
  });

  test('`orphaned` is never a lease state; it is a topology diagnostic', () => {
    expect(LEASE_STATES).not.toContain('orphaned' as BoardLeaseState);
    const card = cardFor('pending', 'bound', 'active');
    expect(card.diagnostics.orphan_reclaimable).toBe(false);
  });
});

describe('diagnostics', () => {
  test('a completed row with a residual lease is done plus cleanup', () => {
    for (const lease of ['reserving', 'bound', 'completing', 'released', 'unknown'] as const) {
      const card = cardFor('done', lease, 'not_observed');
      expect(card.column).toBe('done');
      expect(card.diagnostics.lease_cleanup_required).toBe(true);
      expect(card.actions.reconcile).toBe(
        `repo-harness sprint reconcile --task-id ${TASK_ID} --target-ref ${CANONICAL_REF}`,
      );
    }
    const clean = cardFor('done', 'available', 'not_observed');
    expect(clean.diagnostics.lease_cleanup_required).toBe(false);
    expect(clean.actions.reconcile).toBeNull();
  });

  test('definition drift is the lease holding a revision canonical no longer has', () => {
    const drifted = cardFor('drifted', 'bound', 'active');
    expect(drifted.task_state).toBe('drifted');
    expect(drifted.diagnostics.definition_drift).toBe(true);
    expect(drifted.column).toBe('blocked');
    expect(drifted.claim?.claim_id).toBe('claim-1');

    // A status cell outside the `[ ]` / `[x]` grammar is the same class of
    // fact with no lease to compare against: the row is neither claimable nor
    // complete, so it must not sit in `todo`.
    const unrecognized = cardFor('drifted', 'available', 'not_observed');
    expect(unrecognized.diagnostics.definition_drift).toBe(true);
    expect(unrecognized.column).toBe('blocked');
  });

  test('a lease whose row left canonical is missing, not silently pending', () => {
    const card = cardFor('missing', 'bound', 'active');
    expect(card.task_state).toBe('missing');
    expect(card.column).toBe('blocked');
    expect(card.row_index).toBe('');
    expect(card.task).toBe('');
    // Ownership is still reported: the lease exists and someone holds it.
    expect(card.claim?.claim_id).toBe('claim-1');
  });

  test('a worktree that left git worktree list is a reclaimable orphan', () => {
    const base = taskInput('pending', 'bound', 'active');
    const card = projectBoard(boardInputs([{
      ...base,
      evidence: {
        worktree: WORKTREE,
        worktree_present: false,
        ledger: null,
        ledger_raw: null,
        progress_token: null,
        progress_unreadable_reason: 'owner_worktree_missing',
      },
    }])).cards[0];
    expect(card.diagnostics.worktree_missing).toBe(true);
    expect(card.diagnostics.orphan_reclaimable).toBe(true);
    expect(card.progress_state).toBe('unreadable');
    expect(card.diagnostics.progress_unreadable_reason).toBe('owner_worktree_missing');
    expect(card.column).toBe('blocked');
  });

  test('an open publication window is never auto-reclaimable', () => {
    const base = taskInput('pending', 'completing', 'active');
    const card = projectBoard(boardInputs([{
      ...base,
      evidence: {
        worktree: WORKTREE,
        worktree_present: false,
        ledger: null,
        ledger_raw: null,
        progress_token: null,
        progress_unreadable_reason: 'owner_worktree_missing',
      },
    }])).cards[0];
    expect(card.diagnostics.worktree_missing).toBe(true);
    // `completing` may already have published; reclaiming it would erase the
    // window marker that says so.
    expect(card.diagnostics.orphan_reclaimable).toBe(false);
    expect(card.column).toBe('blocked');
  });

  test('a lease claimed against another ref is reported, never re-validated', () => {
    const base = taskInput('pending', 'bound', 'active');
    const card = projectBoard(boardInputs([{
      ...base,
      lease: { ...base.lease, record: { ...base.lease.record!, target_ref: 'release/0.15' } },
    }])).cards[0];
    expect(card.diagnostics.target_ref_mismatch).toBe(true);
    expect(card.column).toBe('blocked');
    expect(card.claim?.target_ref).toBe('release/0.15');
  });

  test('the cut conflict fields are absent from diagnostics, not empty', () => {
    const diagnostics = cardFor('pending', 'bound', 'active')
      .diagnostics as unknown as Record<string, unknown>;
    // Absent says "not computed"; `[]` would say "no overlap", which this
    // projection cannot prove without the cwd-bound changed-set authority.
    expect(Object.hasOwn(diagnostics, 'actual_path_overlap')).toBe(false);
    expect(Object.hasOwn(diagnostics, 'scope_overlap')).toBe(false);
  });
});

describe('actions', () => {
  test('release and steal are offered exactly where the verbs accept them', () => {
    for (const lease of ['reserving', 'bound'] as const) {
      const card = cardFor('pending', lease, 'not_observed');
      expect(card.actions.release).toBe('repo-harness sprint release --claim-id claim-1');
      expect(card.actions.steal).toBe(
        "repo-harness sprint steal --expected-claim-id claim-1 --reason '<reason>' --session-id '<session-id>'",
      );
    }
  });

  test('a completing lease offers neither steal nor release', () => {
    const card = cardFor('pending', 'completing', 'active');
    // `stealLeaseRecord` refuses `completing` outright and `releaseLeaseRecord`
    // accepts only reserving/bound; printing either would be inventing an
    // action the verb would reject.
    expect(card.actions.steal).toBeNull();
    expect(card.actions.release).toBeNull();
  });

  test('a reviewing lease is doing but offers no sprint mutation or reconcile bypass', () => {
    const reviewing: LeaseOwnerRecordV2 = {
      ...ownerRecord(),
      record_schema: 2,
      state: 'reviewing',
      finish_transaction_key: null,
      current_publication: {
        publication_id: `sha256:${'a'.repeat(64)}`,
        receipt_sha256: `sha256:${'b'.repeat(64)}`,
        head_sha: 'c'.repeat(40),
        ship_transaction_key: 'ship/board-fixture',
      },
    };
    const base = taskInput('pending', 'bound', 'active');
    const card = projectBoard(boardInputs([{
      ...base,
      lease: { classification: 'reviewing', unknown_reason: null, record: reviewing },
    }])).cards[0];
    expect(card.lease_state).toBe('reviewing');
    expect(card.column).toBe('doing');
    expect(card.claim?.current_publication).toEqual(reviewing.current_publication);
    expect(card.actions).toEqual({
      release: null, steal: null, reconcile: null,
      publication_reconcile: `repo-harness publication reconcile --task-id ${TASK_ID} --expected-claim-id claim-1 --expected-generation 1 --publication-id ${reviewing.current_publication.publication_id} --expected-head-sha ${reviewing.current_publication.head_sha} --remote '<remote>'`,
      publication_recover: null,
      publication_reopen: `repo-harness publication reopen --task-id ${TASK_ID} --claim-id claim-1 --expected-generation 1 --publication-id ${reviewing.current_publication.publication_id} --expected-head-sha ${reviewing.current_publication.head_sha}`,
      publication_takeover: `repo-harness publication takeover --task-id ${TASK_ID} --expected-claim-id claim-1 --expected-generation 1 --publication-id ${reviewing.current_publication.publication_id} --expected-head-sha ${reviewing.current_publication.head_sha} --reason '<reason>' --session-id '<session-id>'`,
      publication_abandon: `repo-harness publication abandon --task-id ${TASK_ID} --expected-claim-id claim-1 --expected-generation 1 --publication-id ${reviewing.current_publication.publication_id} --expected-head-sha ${reviewing.current_publication.head_sha} --reason '<reason>'`,
    });
  });

  test('a card with no lease offers nothing', () => {
    const card = cardFor('pending', 'available', 'not_observed');
    expect(card.actions).toEqual({
      release: null, steal: null, reconcile: null,
      publication_reconcile: null, publication_recover: null,
      publication_reopen: null, publication_takeover: null, publication_abandon: null,
    });
  });

  test('a completing lease routes recovery to the publication adapter', () => {
    const card = cardFor('pending', 'completing', 'active');
    expect(card.actions.publication_reconcile).toBeNull();
    expect(card.actions.publication_recover).toBe('repo-harness publication recover inspect');
  });
});

describe('determinism', () => {
  test('identical inputs yield byte-identical JSON', () => {
    const tasks = TRIPLES.map((triple) => taskInput(triple.state, triple.lease, triple.progress));
    const first = JSON.stringify(projectBoard(boardInputs(tasks)), null, 2);
    const second = JSON.stringify(projectBoard(boardInputs(tasks)), null, 2);
    expect(first).toBe(second);
  });

  test('cards keep canonical file order, not a column grouping', () => {
    const document = projectBoard(boardInputs([
      taskInput('pending', 'bound', 'active'),
      taskInput('done', 'available', 'not_observed'),
      taskInput('pending', 'available', 'not_observed'),
    ]));
    expect(document.cards.map((card) => card.column)).toEqual(['doing', 'done', 'todo']);
  });

  test('the composite revision is domain-separated over all four dimensions', () => {
    const dimensions = {
      task_authority: 'sha256:a',
      coordination: 'sha256:b',
      topology: 'sha256:c',
      evidence: 'sha256:d',
    };
    const base = composeBoardRevision(dimensions).board;
    for (const key of Object.keys(dimensions) as (keyof typeof dimensions)[]) {
      const moved = composeBoardRevision({ ...dimensions, [key]: 'sha256:moved' }).board;
      expect(moved).not.toBe(base);
    }
    // Field values cannot forge a separator into a neighbouring position.
    expect(boardDigest('d', ['a', 'b'])).not.toBe(boardDigest('d', ['a"b']));
    expect(boardDigest('d', [null])).not.toBe(boardDigest('d', ['']));
    expect(boardDigest('one', ['a'])).not.toBe(boardDigest('two', ['a']));
  });

  test('the document header names the canonical target and sprint it read', () => {
    const document = projectBoard(boardInputs([taskInput('pending', 'available', 'not_observed')]));
    expect(document.protocol).toBe(1);
    expect(document.kind).toBe('repo-harness-board');
    expect(document.canonical_target).toEqual({ ref: CANONICAL_REF, oid: CANONICAL_OID });
    expect(document.sprint_path).toBe(SPRINT_PATH);
    // The projector never decides consistency; `resolveBoard` owns that.
    expect(document.snapshot_consistency).toBe('stable');
  });
});
