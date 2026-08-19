/**
 * The lock-free consistency contract, driven through the collector seam.
 *
 * The hazard here is not a filesystem race but a claim about one: that a
 * read-then-reread which only compares the sprint revision reports `stable`
 * while the coordination, topology, or evidence dimensions tore underneath it.
 * That is `tasks/todos.md`'s WP2 addendum row verbatim, and it is the one
 * scenario a real-filesystem test cannot schedule reliably -- so the collector
 * is injected and the tear is scripted, which is exactly what makes the
 * falsification deterministic.
 *
 * Every digest below is produced by the real `composeBoardRevision` /
 * `boardDigest`, so a change to the composition recipe fails here rather than
 * being papered over by hand-written revision strings.
 */
import { describe, expect, test } from 'bun:test';
import {
  boardDigest,
  composeBoardRevision,
  type BoardEvidenceInput,
  type BoardInputsV1,
  type BoardTaskInput,
} from '../src/core/state/project-board';
import { resolveBoardFromCollector, type BoardCollector } from '../src/effects/state/resolve-board';
import {
  deriveTaskId,
  deriveTaskRevision,
  type LeaseOwnerRecordV1,
} from '../src/core/state/coordination-identity';
import type { AttemptLedgerRead } from '../src/core/state/attempt-ledger';

const REPO_IDENTITY = '/tmp/board-consistency-fixture/.git';
const SPRINT_PATH = 'plans/sprints/consistency.sprint.md';
const TASK_CELL = 'tear the snapshot';
const CANONICAL_REF = 'main';
const CANONICAL_OID = 'fedcba9876543210fedcba9876543210fedcba98';
const WORKTREE_A = '/tmp/board-consistency-fixture-wt-a';
const UNIT_REF = 'plans/plan-consistency.md';
const TOKEN = 'sha256:progress-token-a';

const TASK_ID = deriveTaskId({
  repoIdentity: REPO_IDENTITY,
  sprintPath: SPRINT_PATH,
  taskCell: TASK_CELL,
});
const TASK_REVISION = deriveTaskRevision({
  taskId: TASK_ID,
  modeCell: 'contract',
  acceptanceCell: 'consistency tests pass',
});

/** The single sprint text every scenario keeps constant, on purpose. */
const SPRINT_TEXT = [
  '| # | Status | Task | Mode | Acceptance | Plan |',
  `| 1 | [ ] | ${TASK_CELL} | contract | consistency tests pass | (pending) |`,
].join('\n');

function ownerRecord(claimId: string, generation: number): LeaseOwnerRecordV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-lease-owner',
    claim_id: claimId,
    task_id: TASK_ID,
    task_revision: TASK_REVISION,
    sprint_path: SPRINT_PATH,
    target_ref: CANONICAL_REF,
    generation,
    state: 'bound',
    claimed_by: { session_id: `session-${claimId}`, source_worktree: WORKTREE_A },
    execution_worktree: WORKTREE_A,
    branch: 'codex/consistency',
    unit_ref: UNIT_REF,
    finish_transaction_key: null,
    stolen_from: generation > 1 ? { claim_id: 'claim-a', reason: 'no progress' } : null,
  };
}

interface Observation {
  /** The owner record's bytes, exactly as the store would have read them. */
  readonly owner: LeaseOwnerRecordV1;
  readonly topologyRaw: string;
  readonly ledger: AttemptLedgerRead;
  readonly ledgerRaw: string | null;
  readonly progressToken: string | null;
}

const BASELINE: Observation = {
  owner: ownerRecord('claim-a', 1),
  topologyRaw: `worktree ${WORKTREE_A}\nHEAD abc\nbranch refs/heads/codex/consistency\n\n`,
  ledger: { status: 'ok', receipts: [] },
  ledgerRaw: '',
  progressToken: TOKEN,
};

function evidenceOf(observation: Observation): BoardEvidenceInput {
  return {
    worktree: WORKTREE_A,
    worktree_present: true,
    ledger: observation.ledger,
    ledger_raw: observation.ledgerRaw,
    progress_token: observation.progressToken,
    progress_unreadable_reason: observation.progressToken === null
      ? 'owner_state_unresolvable'
      : null,
  };
}

function taskOf(observation: Observation): BoardTaskInput {
  return {
    task_id: TASK_ID,
    task_revision: TASK_REVISION,
    row: {
      index: '1',
      status: '[ ]',
      task: TASK_CELL,
      mode: 'contract',
      acceptance: 'consistency tests pass',
      plan: '(pending)',
    },
    lease: { classification: 'bound', unknown_reason: null, record: observation.owner },
    evidence: evidenceOf(observation),
  };
}

/**
 * Build one complete observation the way `collectBoardInputs` does: four
 * per-dimension digests over the observed bytes, composed into one.
 */
function inputsOf(observation: Observation): BoardInputsV1 {
  return {
    canonical_target: { ref: CANONICAL_REF, oid: CANONICAL_OID },
    sprint_path: SPRINT_PATH,
    tasks: [taskOf(observation)],
    revisions: composeBoardRevision({
      task_authority: boardDigest('repo-harness-board-task-authority', [
        CANONICAL_REF,
        CANONICAL_OID,
        SPRINT_PATH,
        SPRINT_TEXT,
      ]),
      coordination: boardDigest('repo-harness-board-coordination', [
        TASK_ID,
        'bound',
        null,
        `${JSON.stringify(observation.owner, null, 2)}\n`,
      ]),
      topology: boardDigest('repo-harness-board-topology', [observation.topologyRaw]),
      evidence: boardDigest('repo-harness-board-evidence', [
        WORKTREE_A,
        'present',
        observation.ledgerRaw,
        observation.progressToken,
        observation.progressToken === null ? 'owner_state_unresolvable' : null,
      ]),
    }),
  };
}

/** A collector that hands out one scripted observation per call, in order. */
function scriptedCollector(script: readonly Observation[]): BoardCollector {
  const queue = [...script];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('collector called more times than the script allows');
    return inputsOf(next);
  };
}

describe('board snapshot consistency', () => {
  test('a constant sprint revision does not make a flipped owner stable', () => {
    const stolen: Observation = { ...BASELINE, owner: ownerRecord('claim-b', 2) };

    // The premise of the falsifier: the sprint did not move at all. A
    // consistency check that compared only this would report `stable`.
    expect(inputsOf(BASELINE).revisions.task_authority)
      .toBe(inputsOf(stolen).revisions.task_authority);
    expect(inputsOf(BASELINE).revisions.coordination)
      .not.toBe(inputsOf(stolen).revisions.coordination);

    const document = resolveBoardFromCollector(
      scriptedCollector([BASELINE, stolen, BASELINE, stolen]),
    );
    expect(document.snapshot_consistency).toBe('changed_during_read');
    // The published document is the second round's A side, whole and
    // self-consistent -- never a patchwork of both observations.
    expect(document.cards[0].claim?.claim_id).toBe('claim-a');
    expect(document.cards[0].claim?.generation).toBe(1);
  });

  test('a topology-only change is detected and localizable', () => {
    const removed: Observation = { ...BASELINE, topologyRaw: 'worktree /tmp/primary\nHEAD abc\n\n' };
    expect(inputsOf(BASELINE).revisions.task_authority)
      .toBe(inputsOf(removed).revisions.task_authority);
    expect(inputsOf(BASELINE).revisions.coordination)
      .toBe(inputsOf(removed).revisions.coordination);
    expect(inputsOf(BASELINE).revisions.topology)
      .not.toBe(inputsOf(removed).revisions.topology);

    const document = resolveBoardFromCollector(
      scriptedCollector([BASELINE, removed, BASELINE, removed]),
    );
    expect(document.snapshot_consistency).toBe('changed_during_read');
    // Publishing all four dimensions is what lets a caller say WHICH input
    // moved instead of only that something did.
    expect(document.revisions.topology).toBe(inputsOf(BASELINE).revisions.topology);
  });

  test('an evidence-only change is detected', () => {
    const advanced: Observation = { ...BASELINE, progressToken: 'sha256:progress-token-b' };
    expect(inputsOf(BASELINE).revisions.coordination)
      .toBe(inputsOf(advanced).revisions.coordination);
    expect(inputsOf(BASELINE).revisions.evidence)
      .not.toBe(inputsOf(advanced).revisions.evidence);

    const document = resolveBoardFromCollector(
      scriptedCollector([BASELINE, advanced, BASELINE, advanced]),
    );
    expect(document.snapshot_consistency).toBe('changed_during_read');
  });

  test('one torn round followed by a settled round is stable', () => {
    const stolen: Observation = { ...BASELINE, owner: ownerRecord('claim-b', 2) };
    // Round one tears; round two is quiet. The retry discards the whole first
    // round rather than reusing any part of it.
    const document = resolveBoardFromCollector(
      scriptedCollector([BASELINE, stolen, stolen, stolen]),
    );
    expect(document.snapshot_consistency).toBe('stable');
    expect(document.cards[0].claim?.claim_id).toBe('claim-b');
    expect(document.cards[0].claim?.generation).toBe(2);
    expect(document.cards[0].claim?.stolen_from).toEqual({
      claim_id: 'claim-a',
      reason: 'no progress',
    });
  });

  test('a quiet repository resolves in exactly one round', () => {
    // Four scripted observations, two consumed: a second round would throw.
    const document = resolveBoardFromCollector(
      scriptedCollector([BASELINE, BASELINE, BASELINE, BASELINE]),
    );
    expect(document.snapshot_consistency).toBe('stable');
    expect(document.cards[0].column).toBe('doing');
  });

  test('an unreadable ledger never transfers ownership', () => {
    const broken: Observation = {
      ...BASELINE,
      ledger: { status: 'unreadable', line: 2 },
      ledgerRaw: 'not a receipt\n',
    };
    const readable = resolveBoardFromCollector(scriptedCollector([BASELINE, BASELINE]));
    const unreadable = resolveBoardFromCollector(scriptedCollector([broken, broken]));

    expect(readable.cards[0].progress_state).toBe('active');
    expect(unreadable.cards[0].progress_state).toBe('unreadable');
    // Field for field: evidence failure degrades the evidence dimension and
    // nothing else. Ownership is the lease's business, not the ledger's.
    expect(unreadable.cards[0].claim).toEqual(readable.cards[0].claim);
    expect(unreadable.cards[0].lease_state).toBe(readable.cards[0].lease_state);
    expect(unreadable.cards[0].column).toBe(readable.cards[0].column);
    expect(unreadable.cards[0].actions).toEqual(readable.cards[0].actions);
  });

  test('an unresolvable owner state is named, not swallowed', () => {
    const unresolvable: Observation = { ...BASELINE, progressToken: null };
    const document = resolveBoardFromCollector(
      scriptedCollector([unresolvable, unresolvable]),
    );
    expect(document.snapshot_consistency).toBe('stable');
    expect(document.cards[0].progress_state).toBe('unreadable');
    expect(document.cards[0].diagnostics.progress_unreadable_reason)
      .toBe('owner_state_unresolvable');
    expect(document.cards[0].column).toBe('doing');
  });

  test('only snapshot_consistency changes between a stable and a torn document', () => {
    const stolen: Observation = { ...BASELINE, owner: ownerRecord('claim-b', 2) };
    const stable = resolveBoardFromCollector(scriptedCollector([BASELINE, BASELINE]));
    const torn = resolveBoardFromCollector(
      scriptedCollector([stolen, BASELINE, BASELINE, stolen]),
    );
    expect(torn.snapshot_consistency).toBe('changed_during_read');
    expect({ ...torn, snapshot_consistency: 'stable' }).toEqual(stable);
    // Key order is preserved too, so the two documents stay byte-comparable.
    expect(Object.keys(torn)).toEqual(Object.keys(stable));
  });
});
