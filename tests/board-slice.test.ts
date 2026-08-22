/**
 * WP3's falsifiers: the hook board slice and the PreEdit lease-ownership gate.
 *
 * Three claims are under test, and each is written so that the obvious wrong
 * implementation fails it:
 *
 * 1. **One slice, two hosts, identical bytes.** The Codex `SubagentStart`
 *    payload and the Claude `PreToolUse.subagent` prompt appendix are built by
 *    two different handlers; the marker block extracted from each is compared
 *    byte for byte against real fixture state. A second renderer, a host-
 *    dependent field, or a clock would break this.
 * 2. **Arming is a double predicate.** Claim tokens are never garbage
 *    collected, so "a token exists" cannot arm the gate. The stale-token and
 *    primary-tree cases assert exit 0 AND zero collector invocations -- the
 *    only assertable form of "the unarmed path costs nothing".
 * 3. **Armed failures fail closed, individually.** One case per step, each
 *    asserting exit 2 and its own reason token, because a gate that collapsed
 *    five refusals into one message would still pass a test that only checked
 *    the exit code.
 *
 * The lease/topology/canonical fixtures are real: a real git repository, a
 * real linked worktree, real owner records on the shared plane. Mocking them
 * would prove nothing about a gate whose whole job is to compare a worktree
 * against git's own view of it.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  deriveTaskId,
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
import { runMutationGuard, type MutationGuardCollector } from '../src/cli/hook/mutation-guard';
import { runSubagentHandler } from '../src/cli/hook/subagent-handler';
import { createStateInputCollector } from '../src/effects/loop/state-input-collector';
import { resolveEffectiveState } from '../src/effects/state/resolve-effective-state';
import { findClaimTokenByUnitRef } from '../src/effects/state/coordination-claim-token';
import {
  coordinationRoot,
  LEASE_OWNER_FILE_NAME,
} from '../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../src/effects/state/coordination-canonical-source';
import * as sliceInputs from '../src/effects/state/collect-slice-inputs';
import type { EffectiveState } from '../src/core/state/types';

// ---------------------------------------------------------------------------
// Collector spy: the assertable form of "the unarmed path collects nothing"
// ---------------------------------------------------------------------------

let collectCalls = 0;
/** Set by a test that needs the armed collection itself to fail. */
let collectThrows: string | null = null;

/**
 * Snapshotted BEFORE `mock.module`, and that ordering is load-bearing: Bun
 * patches the module registry in place, so the imported namespace object is
 * live-bound. A wrapper that called `sliceInputs.collectSliceInputs` would
 * resolve to itself and recurse forever.
 */
const realSliceInputs = { ...sliceInputs };

mock.module('../src/effects/state/collect-slice-inputs', () => ({
  ...realSliceInputs,
  collectSliceInputs: (cwd: string, options: sliceInputs.SliceCollectionOptions) => {
    collectCalls += 1;
    if (collectThrows !== null) throw new Error(collectThrows);
    return realSliceInputs.collectSliceInputs(cwd, options);
  },
}));

beforeEach(() => {
  collectCalls = 0;
  collectThrows = null;
});

// ---------------------------------------------------------------------------
// Fixture: one clone, one canonical sprint, one linked execution worktree
// ---------------------------------------------------------------------------

const SPRINT_PATH = 'plans/sprints/wp3.sprint.md';
const PLAN_PATH = 'plans/plan-20260820-0159-wp3-fixture.md';
const STALE_PLAN_PATH = 'plans/plan-20260101-0000-retired.md';
const OWN_TASK_CELL = 'wire the hook slice';
const PEER_TASK_CELL = 'relocate worktree metadata';
const CLAIM_ID = 'claim-wp3-own';
const PEER_CLAIM_ID = 'claim-wp3-peer';
const BRANCH = 'codex/wp3-fixture';
const PEER_BRANCH = 'codex/wp3-peer';

/** `backlogRows()` only scans between `## Backlog` and the next `## ` heading. */
const SPRINT_TEXT = [
  '# WP3 fixture sprint',
  '',
  '## Backlog',
  '',
  '| # | Status | Task | Mode | Acceptance | Plan |',
  '| --- | --- | --- | --- | --- | --- |',
  `| 1 | [ ] | ${OWN_TASK_CELL} | contract | slice tests pass | (pending) |`,
  `| 2 | [ ] | ${PEER_TASK_CELL} | contract | metadata tests pass | (pending) |`,
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
  const ownTaskId = deriveTaskId({ repoIdentity, sprintPath: SPRINT_PATH, taskCell: OWN_TASK_CELL });
  const peerTaskId = deriveTaskId({ repoIdentity, sprintPath: SPRINT_PATH, taskCell: PEER_TASK_CELL });

  return {
    primary,
    worktree: realpathSync(worktree),
    repoIdentity,
    ownTaskId,
    ownTaskRevision: deriveTaskRevision({ taskId: ownTaskId, modeCell: 'contract', acceptanceCell: 'slice tests pass' }),
    peerTaskId,
    peerTaskRevision: deriveTaskRevision({ taskId: peerTaskId, modeCell: 'contract', acceptanceCell: 'metadata tests pass' }),
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

/**
 * The same real, non-mocked resolution wiring `tests/mutation-guard.test.ts`
 * uses, pinned to `lite` so every guard downstream of the lease gate passes and
 * the exit code these cases assert can only come from the lease gate itself.
 */
function collectorFor(repoRoot: string, onResolve?: () => void): MutationGuardCollector {
  return createStateInputCollector({
    event: 'PreToolUse',
    repoRoot,
    resolveSessionEffectiveState: () => null,
    resolvePreEditEffectiveState: (targetPaths: readonly string[]): EffectiveState | null => {
      onResolve?.();
      try {
        return resolveEffectiveState(repoRoot, Date.now(), {
          targetPaths,
          operationKind: 'edit',
          explicitOverride: 'lite',
        });
      } catch {
        return null;
      }
    },
  });
}

function edit(repoRoot: string, filePath = 'src/feature.ts') {
  return runMutationGuard({
    collector: collectorFor(repoRoot),
    input: JSON.stringify({ tool_input: { file_path: filePath } }),
    env: {},
  });
}

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

describe('one slice, two hosts, identical bytes', () => {
  let fixture: Fixture;
  beforeEach(() => { fixture = buildFixture(); armFixture(fixture); });
  afterEach(() => fixture.cleanup());

  test('Codex additionalContext and Claude updatedInput.prompt carry the same block', () => {
    const codex = runSubagentHandler({
      event: 'SubagentStart',
      repoRoot: fixture.worktree,
      env: { HOOK_HOST: 'codex' },
      input: JSON.stringify({ agent_type: 'default', model: 'gpt-x', agent_id: 'agent-1', turn_id: 'turn-1' }),
    });
    expect(codex.exitCode).toBe(0);
    const codexContext = String(
      (JSON.parse(codex.stdout) as { hookSpecificOutput: { additionalContext: string } })
        .hookSpecificOutput.additionalContext,
    );

    const claude = runSubagentHandler({
      event: 'PreToolUse',
      repoRoot: fixture.worktree,
      env: {},
      input: JSON.stringify({ tool_name: 'Task', tool_input: { prompt: 'do the work' } }),
    });
    expect(claude.exitCode).toBe(0);
    const claudePrompt = String(
      (JSON.parse(claude.stdout) as { hookSpecificOutput: { updatedInput: { prompt: string } } })
        .hookSpecificOutput.updatedInput.prompt,
    );

    const block = extractSliceBlock(codexContext);
    expect(extractSliceBlock(claudePrompt)).toBe(block);
    expect(block).toContain(OWN_TASK_CELL);
    expect(block).toContain(PEER_TASK_CELL);
    expect(block).toContain(`claim=${CLAIM_ID}`);
  });

  test('the Codex host never receives the block through the Claude branch too', () => {
    const claudeBranchOnCodex = runSubagentHandler({
      event: 'PreToolUse',
      repoRoot: fixture.worktree,
      env: { HOOK_HOST: 'codex' },
      input: JSON.stringify({ tool_name: 'Task', tool_input: { prompt: 'do the work' } }),
    });
    const prompt = String(
      (JSON.parse(claudeBranchOnCodex.stdout) as { hookSpecificOutput: { updatedInput: { prompt: string } } })
        .hookSpecificOutput.updatedInput.prompt,
    );
    expect(prompt).toContain('[repo-harness:return-channel]');
    expect(prompt).not.toContain(BOARD_SLICE_MARKER);
  });

  test('the appendices are independently idempotent: a re-spawn still gets the slice', () => {
    const first = runSubagentHandler({
      event: 'PreToolUse',
      repoRoot: fixture.worktree,
      env: {},
      input: JSON.stringify({ tool_name: 'Task', tool_input: { prompt: 'do the work' } }),
    });
    const stamped = String(
      (JSON.parse(first.stdout) as { hookSpecificOutput: { updatedInput: { prompt: string } } })
        .hookSpecificOutput.updatedInput.prompt,
    );
    // Replaying the fully-stamped prompt is a no-op ...
    const replay = runSubagentHandler({
      event: 'PreToolUse',
      repoRoot: fixture.worktree,
      env: {},
      input: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: stamped } }),
    });
    expect(replay.stdout).toBe('');

    // ... but a prompt carrying only the return contract still receives the
    // slice. The old RETURN_CONTRACT_MARKER early-exit would have swallowed it.
    const contractOnly = stamped.slice(0, stamped.indexOf(BOARD_SLICE_MARKER));
    const second = runSubagentHandler({
      event: 'PreToolUse',
      repoRoot: fixture.worktree,
      env: {},
      input: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: contractOnly } }),
    });
    const secondPrompt = String(
      (JSON.parse(second.stdout) as { hookSpecificOutput: { updatedInput: { prompt: string } } })
        .hookSpecificOutput.updatedInput.prompt,
    );
    expect(secondPrompt).toContain(BOARD_SLICE_MARKER);
    expect(secondPrompt.match(/\[repo-harness:return-channel\]/g)?.length).toBe(1);
  });

  test('SendUserMessage keeps its deny semantics and carries no slice', () => {
    const deny = runSubagentHandler({
      event: 'PreToolUse',
      repoRoot: fixture.worktree,
      env: {},
      input: JSON.stringify({ tool_name: 'SendUserMessage', agent_id: 'agent-a', tool_input: { message: 'report' } }),
    });
    expect(deny.stdout).not.toContain(BOARD_SLICE_MARKER);
    const decision = (JSON.parse(deny.stdout) as {
      hookSpecificOutput: { permissionDecision: string };
    }).hookSpecificOutput.permissionDecision;
    expect(decision).toBe('deny');

    const mainLoop = runSubagentHandler({
      event: 'PreToolUse',
      repoRoot: fixture.worktree,
      env: {},
      input: JSON.stringify({ tool_name: 'SendUserMessage', tool_input: { message: 'main loop' } }),
    });
    expect(mainLoop.stdout).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Arming: the double predicate, and what it costs when it does not fire
// ---------------------------------------------------------------------------

describe('the lease gate stays inert unless the unit is verifiably sprint-bound', () => {
  let fixture: Fixture;
  beforeEach(() => { fixture = buildFixture(); });
  afterEach(() => fixture.cleanup());

  test('no claim token: exit 0 with zero collector invocations', () => {
    write(fixture.worktree, '.ai/harness/active-plan', `${PLAN_PATH}\n`);
    writeLease(fixture, ownerRecord(fixture, { claim_id: 'claim-someone-else' }));
    const result = edit(fixture.worktree);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('LeaseOwnershipGuard');
    expect(collectCalls).toBe(0);
  });

  test('stale token: a unit_ref naming a retired plan does not arm under the current plan', () => {
    write(fixture.worktree, '.ai/harness/active-plan', `${PLAN_PATH}\n`);
    writeClaimToken(fixture.worktree, {
      taskId: fixture.ownTaskId,
      claimId: 'claim-from-a-past-life',
      taskCell: OWN_TASK_CELL,
      unitRef: STALE_PLAN_PATH,
    });
    // A lease that would fail every armed step, proving the gate never looked.
    writeLease(fixture, ownerRecord(fixture, { claim_id: 'claim-someone-else', state: 'completing' }));
    const result = edit(fixture.worktree);
    expect(result.exitCode).toBe(0);
    expect(collectCalls).toBe(0);
  });

  test('primary tree: a matching token does not arm outside a linked worktree', () => {
    write(fixture.primary, '.ai/harness/active-plan', `${PLAN_PATH}\n`);
    writeClaimToken(fixture.primary, {
      taskId: fixture.ownTaskId,
      claimId: 'claim-inline-from-months-ago',
      taskCell: OWN_TASK_CELL,
      unitRef: PLAN_PATH,
    });
    writeLease(fixture, ownerRecord(fixture, { claim_id: 'claim-someone-else' }));
    const result = edit(fixture.primary);
    expect(result.exitCode).toBe(0);
    expect(collectCalls).toBe(0);
  });

  test('no active-plan marker: nothing to bind a token to, nothing collected', () => {
    writeClaimToken(fixture.worktree, {
      taskId: fixture.ownTaskId,
      claimId: CLAIM_ID,
      taskCell: OWN_TASK_CELL,
      unitRef: PLAN_PATH,
    });
    const result = edit(fixture.worktree);
    expect(result.exitCode).toBe(0);
    expect(collectCalls).toBe(0);
  });

  test('an unarmed tree passes even when the collector would throw', () => {
    collectThrows = 'collector exploded';
    write(fixture.worktree, '.ai/harness/active-plan', `${PLAN_PATH}\n`);
    const result = edit(fixture.worktree);
    expect(result.exitCode).toBe(0);
    expect(collectCalls).toBe(0);
  });

  test('armed and consistent: the gate passes and collects exactly once per event', () => {
    armFixture(fixture);
    const result = edit(fixture.worktree);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('LeaseOwnershipGuard');
    expect(collectCalls).toBe(1);
  });

  test('a multi-path apply_patch batch pays one collection, not one per path', () => {
    armFixture(fixture);
    const patch = [
      'apply_patch <<PATCH',
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '*** Update File: src/b.ts',
      '*** Update File: src/c.ts',
      '*** End Patch',
      'PATCH',
    ].join('\n');
    const result = runMutationGuard({
      collector: collectorFor(fixture.worktree),
      input: JSON.stringify({ tool_input: { command: patch } }),
      env: {},
    });
    expect(result.exitCode).toBe(0);
    expect(collectCalls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Armed refusals: one case per step, each with its own reason token
// ---------------------------------------------------------------------------

describe('once armed, every step fails closed with its own reason token', () => {
  let fixture: Fixture;
  beforeEach(() => { fixture = buildFixture(); armFixture(fixture); });
  afterEach(() => fixture.cleanup());

  function expectRefusal(result: ReturnType<typeof edit>, token: string): void {
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain(`[LeaseOwnershipGuard] ${token}:`);
    const record = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Record<string, unknown>;
    expect(record.guard).toBe('LeaseOwnershipGuard');
    expect(record.failure_class).toBe('contract_failure');
    expect(record.action).toBe('block');
  }

  test('step 1 -- two tokens name the same unit: lease_claim_token_ambiguous', () => {
    writeClaimToken(fixture.worktree, {
      taskId: fixture.peerTaskId,
      claimId: PEER_CLAIM_ID,
      taskCell: PEER_TASK_CELL,
      unitRef: PLAN_PATH,
    });
    const result = edit(fixture.worktree);
    expectRefusal(result, 'lease_claim_token_ambiguous');
    // Ambiguity is refused before any collection: there is nothing to validate.
    expect(collectCalls).toBe(0);
  });

  test('step 2 -- no readable owner record: lease_owner_unreadable', () => {
    rmSync(join(coordinationRoot(fixture.primary), 'leases', fixture.ownTaskId), { recursive: true, force: true });
    expectRefusal(edit(fixture.worktree), 'lease_owner_unreadable');
  });

  test('step 2 -- the claim moved: lease_owner_claim_mismatch', () => {
    writeLease(fixture, ownerRecord(fixture, { claim_id: 'claim-taken-over', generation: 2 }));
    const result = edit(fixture.worktree);
    expectRefusal(result, 'lease_owner_claim_mismatch');
    expect(result.stderr).toContain('claim-taken-over');
  });

  test('step 3 -- the lease is not bound: lease_state_not_bound', () => {
    writeLease(fixture, ownerRecord(fixture, { state: 'reserving', execution_worktree: null, branch: null }));
    expectRefusal(edit(fixture.worktree), 'lease_state_not_bound');
  });

  test('step 4 -- bound to a different worktree: lease_owner_tree_mismatch', () => {
    writeLease(fixture, ownerRecord(fixture, { execution_worktree: join(fixture.primary, '..', 'other-tree') }));
    expectRefusal(edit(fixture.worktree), 'lease_owner_tree_mismatch');
  });

  test('step 4 -- bound to a different branch: lease_owner_tree_mismatch', () => {
    writeLease(fixture, ownerRecord(fixture, { branch: 'codex/some-other-branch' }));
    expectRefusal(edit(fixture.worktree), 'lease_owner_tree_mismatch');
  });

  test('step 5 -- the canonical definition drifted: lease_task_revision_drifted', () => {
    // A well-formed revision the row no longer has: what the acceptance cell
    // used to hash to before somebody edited it on the canonical ref.
    writeLease(fixture, ownerRecord(fixture, {
      task_revision: deriveTaskRevision({
        taskId: fixture.ownTaskId,
        modeCell: 'contract',
        acceptanceCell: 'the acceptance line this row used to carry',
      }),
    }));
    expectRefusal(edit(fixture.worktree), 'lease_task_revision_drifted');
  });

  test('an armed collection failure fails closed rather than passing quietly', () => {
    collectThrows = 'coordination state unreadable';
    const result = edit(fixture.worktree);
    expectRefusal(result, 'lease_state_unreadable');
    expect(collectCalls).toBe(1);
  });

  test('an armed tree with no active sprint marker fails closed', () => {
    rmSync(join(fixture.worktree, '.ai/harness/sprint/active-sprint'), { force: true });
    expectRefusal(edit(fixture.worktree), 'lease_sprint_unresolvable');
  });

  test('the refusal precedes the Effective State resolution', () => {
    writeLease(fixture, ownerRecord(fixture, { claim_id: 'claim-taken-over' }));
    let resolutions = 0;
    const result = runMutationGuard({
      collector: collectorFor(fixture.worktree, () => { resolutions += 1; }),
      input: JSON.stringify({ tool_input: { file_path: 'src/feature.ts' } }),
      env: {},
    });
    expect(result.exitCode).toBe(2);
    expect(resolutions).toBe(0);
  });
});
