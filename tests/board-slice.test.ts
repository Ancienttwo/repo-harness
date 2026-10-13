/**
 * WP3's falsifier: the hook board slice.
 *
 * **One slice, two hosts, identical bytes.** The Codex `SubagentStart`
 * payload and the Claude `PreToolUse.subagent` prompt appendix are built by
 * two different handlers; the marker block extracted from each is compared
 * byte for byte against real fixture state. A second renderer, a host-
 * dependent field, or a clock would break this.
 *
 * The lease/topology/canonical fixtures are real: a real git repository, a
 * real linked worktree, real owner records on the shared plane.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  deriveTaskRevision,
  serializeLeaseOwnerRecord,
  type LeaseOwnerRecordV1,
  type NonReviewingPersistedLeaseState,
} from '../src/core/state/coordination-identity';
import { projectBoardSlice } from '../src/core/state/project-board-slice';
import type { BoardOwnershipInput } from '../src/core/state/project-board';
import type { BoardSliceV1 } from '../src/core/state/types';
import {
  BOARD_SLICE_MARKER,
  BOARD_SLICE_MAX_BYTES,
  renderBoardSlice,
} from '../src/cli/hook/board-slice-context';
import { runReturnChannel } from '../src/cli/hook/return-channel';
import { runSubagentContext } from '../src/cli/hook/subagent-context';
import { createStateInputCollector, type StateInputCollector } from '../src/effects/loop/state-input-collector';
import { resolveHookEffectiveState } from '../src/cli/hook/runtime';
import { hookIdentity } from './helpers/hook-identity';
import { findClaimTokenByUnitRef } from '../src/effects/state/coordination-claim-token';
import {
  coordinationRoot,
  LEASE_OWNER_FILE_NAME,
} from '../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../src/effects/state/coordination-canonical-source';
import { fixtureTaskId } from './helpers/sprint-fixture';

// ---------------------------------------------------------------------------
// Fixture: one clone, one canonical sprint, one linked execution worktree
// ---------------------------------------------------------------------------

const SPRINT_PATH = 'plans/sprints/wp3.sprint.md';
const PLAN_PATH = 'plans/plan-20260820-0159-wp3-fixture.md';
const OWN_TASK_CELL = 'wire the hook slice';
const PEER_TASK_CELL = 'relocate worktree metadata';
const CLAIM_ID = 'claim-wp3-own';
const PEER_CLAIM_ID = 'claim-wp3-peer';
const BRANCH = 'codex/wp3-fixture';
const PEER_BRANCH = 'codex/wp3-peer';

/** `backlogRows()` only scans between `## Backlog` and the next `## ` heading. */
const SPRINT_TEXT = [
  '# WP3 fixture sprint',
  '> **Status**: Executing',
  '> **Backlog Schema**: 2',
  '',
  '## Backlog',
  '',
  '| # | ID | Status | Task | Mode | Acceptance | Plan |',
  '| --- |----| --- | --- | --- | --- | --- |',
  `| 1 | ${fixtureTaskId(`${OWN_TASK_CELL}`)} | [ ] | ${OWN_TASK_CELL} | contract | slice tests pass | (pending) |`,
  `| 2 | ${fixtureTaskId(`${PEER_TASK_CELL}`)} | [ ] | ${PEER_TASK_CELL} | contract | metadata tests pass | (pending) |`,
  '',
].join('\n');

interface Fixture {
  /** The primary working tree. */
  readonly primary: string;
  /** The linked execution worktree the lease names. */
  readonly worktree: string;
  readonly repoIdentity: string;
  readonly ownTaskId: string;
  readonly ownTaskRevision: string;
  readonly peerTaskId: string;
  readonly peerTaskRevision: string;
  cleanup(): void;
}

function git(cwd: string, args: readonly string[]): void {
  const done = spawnSync('git', [...args], { cwd, encoding: 'utf-8' });
  if (done.status !== 0) throw new Error(`git ${args.join(' ')}: ${done.stderr}`);
}

function write(root: string, relative: string, content: string): void {
  const target = join(root, relative);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content);
}

function buildFixture(): Fixture {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wp3-slice-')));
  const primary = join(base, 'clone');
  const worktree = join(base, 'clone-wt');
  mkdirSync(primary, { recursive: true });
  git(primary, ['init', '-b', 'main']);
  git(primary, ['config', 'user.email', 'wp3@example.com']);
  git(primary, ['config', 'user.name', 'WP3 Fixture']);

  write(primary, SPRINT_PATH, SPRINT_TEXT);
  write(primary, PLAN_PATH, ['# WP3 fixture plan', '', '> **Status**: Executing', ''].join('\n'));
  write(primary, 'docs/spec.md', '# spec\n');
  write(primary, '.ai/harness/sprint/active-sprint', `${SPRINT_PATH}\n`);
  write(primary, '.ai/harness/policy.json', `${JSON.stringify({
    worktree_strategy: { merge_back: { target: 'main' }, review_base: 'main', base_branch: 'main' },
    active_plan: {
      lifecycle: { annotation_end: 'Annotating', approved: 'Approved', executing: 'Executing', terminal_start: 'Complete' },
      statuses: ['Draft', 'Annotating', 'Approved', 'Executing', 'Complete'],
    },
  }, null, 2)}\n`);
  write(primary, '.ai/harness/workflow-contract.json', '{}\n');
  git(primary, ['add', '.']);
  git(primary, ['commit', '-m', 'seed']);
  git(primary, ['worktree', 'add', '-b', BRANCH, worktree]);

  const repoIdentity = resolveRepoIdentity(primary);
  const ownTaskId = fixtureTaskId(OWN_TASK_CELL);
  const peerTaskId = fixtureTaskId(PEER_TASK_CELL);

  return {
    primary,
    worktree: realpathSync(worktree),
    repoIdentity,
    ownTaskId,
    ownTaskRevision: deriveTaskRevision({ taskCell: OWN_TASK_CELL, taskId: ownTaskId, modeCell: 'contract', acceptanceCell: 'slice tests pass' }),
    peerTaskId,
    peerTaskRevision: deriveTaskRevision({ taskCell: PEER_TASK_CELL, taskId: peerTaskId, modeCell: 'contract', acceptanceCell: 'metadata tests pass' }),
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

/** `write_claim_token`'s exact five-field, key=value shape. */
function writeClaimToken(
  tree: string,
  options: {
    readonly taskId: string;
    readonly claimId: string;
    readonly taskCell: string;
    readonly unitRef: string;
  },
): void {
  write(tree, `.ai/harness/sprint/claims/${options.taskId}.claim`, [
    `claim_id=${options.claimId}`,
    `task_id=${options.taskId}`,
    `sprint=${SPRINT_PATH}`,
    `task=${options.taskCell}`,
    `unit_ref=${options.unitRef}`,
    '',
  ].join('\n'));
}

function writeLease(fixture: Fixture, record: LeaseOwnerRecordV1): void {
  const directory = join(coordinationRoot(fixture.primary), 'leases', record.task_id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, LEASE_OWNER_FILE_NAME), serializeLeaseOwnerRecord(record));
}

function ownerRecord(
  fixture: Fixture,
  overrides: Partial<LeaseOwnerRecordV1> = {},
): LeaseOwnerRecordV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-lease-owner',
    claim_id: CLAIM_ID,
    task_id: fixture.ownTaskId,
    task_revision: fixture.ownTaskRevision,
    sprint_path: SPRINT_PATH,
    target_ref: 'main',
    generation: 1,
    state: 'bound' as NonReviewingPersistedLeaseState,
    claimed_by: { session_id: 'session-wp3', source_worktree: fixture.primary },
    execution_worktree: fixture.worktree,
    branch: BRANCH,
    unit_ref: PLAN_PATH,
    finish_transaction_key: null,
    stolen_from: null,
    ...overrides,
  };
}

function peerRecord(fixture: Fixture): LeaseOwnerRecordV1 {
  return {
    ...ownerRecord(fixture),
    claim_id: PEER_CLAIM_ID,
    task_id: fixture.peerTaskId,
    task_revision: fixture.peerTaskRevision,
    execution_worktree: join(fixture.primary, '..', 'peer-tree'),
    branch: PEER_BRANCH,
    unit_ref: 'plans/plan-peer.md',
  };
}

/**
 * The armed happy path: this worktree holds the claim, the lease is bound to
 * it, and a peer holds the other row.
 */
function armFixture(fixture: Fixture): void {
  write(fixture.worktree, '.ai/harness/active-plan', `${PLAN_PATH}\n`);
  write(fixture.worktree, '.ai/harness/active-worktree', `${fixture.worktree}\n`);
  writeClaimToken(fixture.worktree, {
    taskId: fixture.ownTaskId,
    claimId: CLAIM_ID,
    taskCell: OWN_TASK_CELL,
    unitRef: PLAN_PATH,
  });
  writeLease(fixture, ownerRecord(fixture));
  writeLease(fixture, peerRecord(fixture));
}

// ---------------------------------------------------------------------------
// Handler invocation helpers
// ---------------------------------------------------------------------------

/** Extract the slice block from a host payload: marker line through the pointer line. */
function extractSliceBlock(text: string): string {
  const start = text.indexOf(BOARD_SLICE_MARKER);
  expect(start).toBeGreaterThanOrEqual(0);
  const pointer = 'progress/stall not computed here — repo-harness state board --json';
  const end = text.indexOf(pointer, start);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end + pointer.length);
}

// ---------------------------------------------------------------------------
// Pure projection: the structural absences are the contract
// ---------------------------------------------------------------------------

const PURE_TASK_ID = 'a'.repeat(64);
const PURE_PEER_ID = 'b'.repeat(64);

function pureTask(overrides: Partial<BoardOwnershipInput> = {}): BoardOwnershipInput {
  return {
    task_id: PURE_TASK_ID,
    task_revision: 'rev-own',
    row: {
      index: '1',
      status: '[ ]',
      task: 'wire the hook slice',
      mode: 'contract',
      acceptance: 'slice tests pass',
      plan: '(pending)',
    },
    lease: { classification: 'bound', unknown_reason: null, record: null },
    worktree_present: true,
    ...overrides,
  };
}

describe('BoardSliceV1 omits the dimensions it cannot observe', () => {
  test('self carries no progress_state, no column, and no conflict field', () => {
    const slice = projectBoardSlice({
      canonical_target: { ref: 'main', oid: '0'.repeat(40) },
      sprint_path: SPRINT_PATH,
      self_task_id: PURE_TASK_ID,
      tasks: [pureTask()],
    });
    const self = slice.self;
    expect(self).not.toBeNull();
    // Absence, not an empty value: a `not_observed` field would advertise a
    // dimension this document does not have (WP2's precedent).
    expect(Object.hasOwn(self!, 'progress_state')).toBe(false);
    expect(Object.hasOwn(self!, 'column')).toBe(false);
    expect(Object.hasOwn(self!.diagnostics, 'progress_unreadable_reason')).toBe(false);
    expect(Object.hasOwn(self!.diagnostics, 'actual_path_overlap')).toBe(false);
    expect(Object.hasOwn(self!.diagnostics, 'scope_overlap')).toBe(false);
    expect(Object.hasOwn(self!.diagnostics, 'stalled')).toBe(false);
  });

  test('self is null when no claim token names a row, and peers still resolve', () => {
    const slice = projectBoardSlice({
      canonical_target: { ref: 'main', oid: '0'.repeat(40) },
      sprint_path: SPRINT_PATH,
      self_task_id: null,
      tasks: [pureTask({ task_id: PURE_PEER_ID })],
    });
    expect(slice.self).toBeNull();
    expect(slice.peers.map((peer) => peer.task_id)).toEqual([PURE_PEER_ID]);
  });

  test('only live leases are peers: released and unknown name no owner to coordinate with', () => {
    const slice = projectBoardSlice({
      canonical_target: { ref: 'main', oid: '0'.repeat(40) },
      sprint_path: SPRINT_PATH,
      self_task_id: null,
      tasks: [
        pureTask({ task_id: 'c'.repeat(64), lease: { classification: 'released', unknown_reason: null, record: null } }),
        pureTask({ task_id: 'd'.repeat(64), lease: { classification: 'unknown', unknown_reason: 'owner_record_missing', record: null } }),
        pureTask({ task_id: 'e'.repeat(64), lease: { classification: 'available', unknown_reason: null, record: null } }),
        pureTask({ task_id: 'f'.repeat(64), lease: { classification: 'completing', unknown_reason: null, record: null } }),
      ],
    });
    expect(slice.peers.map((peer) => peer.task_id)).toEqual(['f'.repeat(64)]);
  });

  test('peers sort by task_id regardless of canonical file order', () => {
    const slice = projectBoardSlice({
      canonical_target: { ref: 'main', oid: '0'.repeat(40) },
      sprint_path: SPRINT_PATH,
      self_task_id: null,
      tasks: [
        pureTask({ task_id: 'f'.repeat(64) }),
        pureTask({ task_id: 'c'.repeat(64) }),
        pureTask({ task_id: 'a'.repeat(64) }),
      ],
    });
    expect(slice.peers.map((peer) => peer.task_id[0])).toEqual(['a', 'c', 'f']);
  });
});

describe('renderBoardSlice is deterministic and bounded', () => {
  function sliceWithPeers(count: number): BoardSliceV1 {
    return projectBoardSlice({
      canonical_target: { ref: 'main', oid: '0'.repeat(40) },
      sprint_path: SPRINT_PATH,
      self_task_id: PURE_TASK_ID,
      tasks: [
        pureTask(),
        ...Array.from({ length: count }, (_unused, index) => pureTask({
          task_id: `${String(index).padStart(2, '0')}${'0'.repeat(62)}`,
          row: { index: String(index + 2), status: '[ ]', task: `peer row ${index}`, mode: 'contract', acceptance: 'x', plan: '(pending)' },
        })),
      ],
    });
  }

  test('identical input yields identical bytes', () => {
    const slice = sliceWithPeers(3);
    expect(renderBoardSlice(slice)).toBe(renderBoardSlice(slice));
    expect(renderBoardSlice(slice).startsWith(BOARD_SLICE_MARKER)).toBe(true);
  });

  test('at most eight peers render, the rest collapse into a +N more pointer', () => {
    const rendered = renderBoardSlice(sliceWithPeers(11));
    expect(rendered.match(/^ {2}- peer row /gm)?.length).toBe(8);
    expect(rendered).toContain('+3 more');
  });

  test('the block never exceeds the structural cap and always ends with the pointer', () => {
    const rendered = renderBoardSlice(sliceWithPeers(40));
    expect(Buffer.byteLength(rendered, 'utf-8')).toBeLessThanOrEqual(BOARD_SLICE_MAX_BYTES);
    expect(rendered.endsWith('progress/stall not computed here — repo-harness state board --json')).toBe(true);
  });

  test('a pathological sprint still fits the cap, keeping the marker and self', () => {
    const long = 'x'.repeat(4000);
    const slice = projectBoardSlice({
      canonical_target: { ref: 'main', oid: '0'.repeat(40) },
      sprint_path: SPRINT_PATH,
      self_task_id: PURE_TASK_ID,
      tasks: [pureTask({
        row: { index: '1', status: '[ ]', task: long, mode: 'contract', acceptance: 'x', plan: '(pending)' },
      })],
    });
    const rendered = renderBoardSlice(slice);
    expect(Buffer.byteLength(rendered, 'utf-8')).toBeLessThanOrEqual(BOARD_SLICE_MAX_BYTES);
    expect(rendered.startsWith(BOARD_SLICE_MARKER)).toBe(true);
    expect(rendered.endsWith('progress/stall not computed here — repo-harness state board --json')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The claim-token reader: the contract's Falsifier probe
// ---------------------------------------------------------------------------

describe('claim tokens: ambiguity is never resolved by picking one', () => {
  let fixture: Fixture;
  beforeEach(() => { fixture = buildFixture(); });
  afterEach(() => fixture.cleanup());

  test('two tokens with the same unit_ref report ambiguous, naming both', () => {
    writeClaimToken(fixture.worktree, { taskId: fixture.ownTaskId, claimId: CLAIM_ID, taskCell: OWN_TASK_CELL, unitRef: PLAN_PATH });
    writeClaimToken(fixture.worktree, { taskId: fixture.peerTaskId, claimId: PEER_CLAIM_ID, taskCell: PEER_TASK_CELL, unitRef: PLAN_PATH });
    const read = findClaimTokenByUnitRef(fixture.worktree, PLAN_PATH);
    expect(read.outcome).toBe('ambiguous');
    expect(read.outcome === 'ambiguous' && read.matches.length).toBe(2);
  });

  test('an inline unit_ref can never match a plan-path marker', () => {
    writeClaimToken(fixture.worktree, {
      taskId: fixture.ownTaskId,
      claimId: CLAIM_ID,
      taskCell: OWN_TASK_CELL,
      unitRef: `inline:${SPRINT_PATH}#1`,
    });
    expect(findClaimTokenByUnitRef(fixture.worktree, PLAN_PATH).outcome).toBe('none');
  });

  test('a token missing a required field never matches and never counts toward ambiguity', () => {
    write(fixture.worktree, '.ai/harness/sprint/claims/broken.claim', `sprint=${SPRINT_PATH}\ntask=x\n`);
    writeClaimToken(fixture.worktree, { taskId: fixture.ownTaskId, claimId: CLAIM_ID, taskCell: OWN_TASK_CELL, unitRef: PLAN_PATH });
    const read = findClaimTokenByUnitRef(fixture.worktree, PLAN_PATH);
    expect(read.outcome).toBe('found');
  });
});

// ---------------------------------------------------------------------------
// Byte-equality across hosts
// ---------------------------------------------------------------------------

function collectorFor(repoRoot: string): StateInputCollector {
  return createStateInputCollector({
    repoRoot,
    resolveEffectiveState: () =>
      resolveHookEffectiveState(repoRoot, Date.now()),
  });
}

describe('one slice, two hosts, identical bytes', () => {
  let fixture: Fixture;
  beforeEach(() => { fixture = buildFixture(); armFixture(fixture); });
  afterEach(() => fixture.cleanup());

  test('Codex additionalContext and Claude updatedInput.prompt carry the same block', () => {
    const codex = runSubagentContext({
      collector: collectorFor(fixture.worktree),
      identity: hookIdentity({ host: 'codex' }),
      payload: { agent_type: 'default', model: 'gpt-x', agent_id: 'agent-1', turn_id: 'turn-1' },
      env: { ...process.env, HOOK_HOST: 'codex' },
    });
    expect(codex.exitCode).toBe(0);
    const codexContext = String(codex.additionalContext);

    const claude = returnChannel({ tool_name: 'Task', tool_input: { prompt: 'do the work' } });
    expect(claude.exitCode).toBe(0);
    const claudePrompt = String(claude.permission?.updatedInput?.prompt);

    const block = extractSliceBlock(codexContext);
    expect(extractSliceBlock(claudePrompt)).toBe(block);
    expect(block).toContain(OWN_TASK_CELL);
    expect(block).toContain(PEER_TASK_CELL);
    expect(block).toContain(`claim=${CLAIM_ID}`);
  });

  test('the appendices are independently idempotent: a re-spawn still gets the slice', () => {
    const first = returnChannel({ tool_name: 'Task', tool_input: { prompt: 'do the work' } });
    const stamped = String(first.permission?.updatedInput?.prompt);
    // Replaying the fully-stamped prompt is a no-op ...
    const replay = returnChannel({ tool_name: 'Agent', tool_input: { prompt: stamped } });
    expect(replay).toEqual({ exitCode: 0 });

    // ... but a prompt carrying only the return contract still receives the
    // slice. The old RETURN_CONTRACT_MARKER early-exit would have swallowed it.
    const contractOnly = stamped.slice(0, stamped.indexOf(BOARD_SLICE_MARKER));
    const second = returnChannel({ tool_name: 'Agent', tool_input: { prompt: contractOnly } });
    const secondPrompt = String(second.permission?.updatedInput?.prompt);
    expect(secondPrompt).toContain(BOARD_SLICE_MARKER);
    expect(secondPrompt.match(/\[repo-harness:return-channel\]/g)?.length).toBe(1);
  });

  test('SendUserMessage gets no slice, no permission decision and no context', () => {
    expect(returnChannel({ tool_name: 'SendUserMessage', agent_id: 'agent-a', tool_input: { message: 'report' } }))
      .toEqual({ exitCode: 0 });
    expect(returnChannel({ tool_name: 'SendUserMessage', tool_input: { message: 'main loop' } }))
      .toEqual({ exitCode: 0 });
  });

  function returnChannel(payload: Record<string, unknown>) {
    return runReturnChannel({ collector: collectorFor(fixture.worktree), payload });
  }
});
