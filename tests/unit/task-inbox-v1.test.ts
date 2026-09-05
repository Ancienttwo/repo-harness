import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { TASK_MESSAGE_HOOK_MAX_BYTES, buildTaskMessageEvent, renderTaskMessageUntrustedContext } from '../../src/core/fleet/task-message';
import { bindLeaseRecord, buildLeaseOwnerRecord, deriveTaskRevision } from '../../src/core/state/coordination-identity';
import {
  TaskInboxError,
  acknowledgeTaskInbox,
  deliverTaskInbox,
  listTaskInbox,
  sendTaskMessage,
  summarizeTaskInboxForFleet,
} from '../../src/effects/fleet/task-inbox';
import { readLease, createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const SPRINT_PATH = 'plans/sprints/inbox.sprint.md';
const TASK_CELL = 'deliver peer messages safely';
const CLAIM_ONE = '123e4567-e89b-42d3-a456-426614174001';
const CLAIM_TWO = '123e4567-e89b-42d3-a456-426614174002';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

interface Fixture {
  readonly root: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly source: { readonly targetRef: string; readonly sprintPath: string };
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-task-inbox-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Task Inbox Test');
  git(root, 'config', 'user.email', 'task-inbox@test.invalid');
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, SPRINT_PATH), [
    '# Sprint: inbox', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${TASK_CELL}`)} | [ ] | ${TASK_CELL} | contract | proves delivery | (pending) |`, '',
  ].join('\n'));
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  const task_id = fixtureTaskId(TASK_CELL);
  const task_revision = deriveTaskRevision({ taskCell: TASK_CELL, taskId: task_id, modeCell: 'contract', acceptanceCell: 'proves delivery' });
  return { root, task_id, task_revision, source: { targetRef: 'main', sprintPath: SPRINT_PATH } };
}

function bind(fixture: Fixture, claim_id: string, generation: number): void {
  const claimed = buildLeaseOwnerRecord({
    claimId: claim_id,
    taskId: fixture.task_id,
    taskRevision: fixture.task_revision,
    sprintPath: SPRINT_PATH,
    targetRef: 'main',
    generation,
    sessionId: `session-${generation}`,
    sourceWorktree: fixture.root,
  });
  const bound = bindLeaseRecord(claimed, {
    claimId: claim_id,
    executionWorktree: realpathSync(fixture.root),
    branch: `codex/inbox-${generation}`,
    unitRef: 'plans/plan-inbox.md',
  });
  if (!bound.ok) throw new Error(bound.error);
  if (generation === 1 && !createLeaseDirectory(fixture.root, fixture.task_id)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(fixture.root, fixture.task_id, bound.record);
}

function message(
  fixture: Fixture,
  message_id: string,
  scope: 'task' | 'claim',
  body: string,
  created_at = '2026-08-23T05:00:00Z',
  audience: 'owner' | 'orchestrator' | 'user' = 'owner',
) {
  return buildTaskMessageEvent({
    message_id,
    task_id: fixture.task_id,
    task_revision: fixture.task_revision,
    scope,
    target_claim_id: scope === 'claim' ? CLAIM_ONE : null,
    target_generation: scope === 'claim' ? 1 : null,
    sender_kind: 'user',
    sender_id: 'alice',
    sender_trust: 'local_operator',
    audience,
    body,
    created_at,
    in_reply_to: null,
  });
}

function withFixture(run: (value: Fixture) => void): void {
  const value = fixture();
  try { run(value); } finally { rmSync(value.root, { recursive: true, force: true }); }
}

describe('Task Inbox V1 common-directory effects', () => {
  test('projects a lock-free body-free fleet summary without creating delivery receipts or changing the lease', () => withFixture((value) => {
    bind(value, CLAIM_ONE, 1);
    const event = message(value, '123e4567-e89b-42d3-a456-426614174009', 'claim', 'never expose this body');
    sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event });
    const leaseBefore = readLease(value.root, value.task_id).raw;
    const summary = summarizeTaskInboxForFleet({
      repo_root: value.root,
      task_id: value.task_id,
      task_revision: value.task_revision,
      current_claim: { claim_id: CLAIM_ONE, generation: 1 },
    });
    expect(summary).toEqual({ unread_count: 1, addressed_to_current_claim: true, snapshot_consistency: 'stable' });
    expect(JSON.stringify(summary)).not.toContain(event.body);
    expect(readLease(value.root, value.task_id).raw).toBe(leaseBefore);
    expect(listTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      recipient: { kind: 'claim', claim_id: CLAIM_ONE, generation: 1 },
      execution_worktree: realpathSync(value.root),
    }).entries[0]?.receipt).toBeNull();
  }));

  test('creates immutable messages idempotently without writing the lease', () => withFixture((value) => {
    bind(value, CLAIM_ONE, 1);
    const event = message(value, '123e4567-e89b-42d3-a456-426614174010', 'claim', 'private for C1');
    const before = readLease(value.root, value.task_id).raw;
    const first = sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event });
    expect(readLease(value.root, value.task_id).raw).toBe(before);
    const second = sendTaskMessage({
      repo_root: value.root,
      canonical_source: value.source,
      event: message(value, event.message_id, 'claim', 'private for C1', '2026-08-23T06:00:00Z'),
    });
    expect(second).toMatchObject({ created: false, event_path: first.event_path });
    expect(second.event.created_at).toBe(event.created_at);
    expect(readLease(value.root, value.task_id).raw).toBe(before);
    expect(() => sendTaskMessage({
      repo_root: value.root,
      canonical_source: value.source,
      event: message(value, event.message_id, 'claim', 'different bytes'),
    })).toThrow(TaskInboxError);
    try {
      sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event: message(value, event.message_id, 'claim', 'different bytes') });
    } catch (error) {
      expect((error as TaskInboxError).code).toBe('message_id_conflict');
    }
  }));

  test('supersedes stale claim scope, delivers task scope once, and globally satisfies after ack', () => withFixture((value) => {
    bind(value, CLAIM_ONE, 1);
    const claim = message(value, '123e4567-e89b-42d3-a456-426614174011', 'claim', 'only C1 may read');
    const task = message(value, '123e4567-e89b-42d3-a456-426614174012', 'task', 'C2 may repair this');
    sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event: claim });
    sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event: task });
    bind(value, CLAIM_TWO, 2);
    const beforeDelivery = readLease(value.root, value.task_id).raw;
    const delivered = deliverTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      recipient: { kind: 'claim', claim_id: CLAIM_TWO, generation: 2 },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session',
      delivered_at: '2026-08-23T05:10:00Z',
    });
    expect(readLease(value.root, value.task_id).raw).toBe(beforeDelivery);
    expect(delivered.superseded_count).toBe(1);
    expect(delivered.deliveries.map((entry) => entry.event.message_id)).toEqual([task.message_id]);
    expect(JSON.stringify(delivered)).not.toContain(claim.body);
    const beforeAck = readLease(value.root, value.task_id).raw;
    const receipt = acknowledgeTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      message_id: task.message_id,
      recipient: { kind: 'claim', claim_id: CLAIM_TWO, generation: 2 },
      execution_worktree: realpathSync(value.root),
      acknowledged_at: '2026-08-23T05:11:00Z',
    });
    expect(receipt.delivery_state).toBe('acknowledged');
    expect(readLease(value.root, value.task_id).raw).toBe(beforeAck);
    const listing = listTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      recipient: { kind: 'claim', claim_id: CLAIM_TWO, generation: 2 },
      execution_worktree: realpathSync(value.root),
    });
    expect(listing.entries.find((entry) => entry.event.message_id === task.message_id)?.globally_satisfied).toBe(true);
    expect(deliverTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      recipient: { kind: 'claim', claim_id: CLAIM_TWO, generation: 2 },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session',
      delivered_at: '2026-08-23T05:12:00Z',
    }).deliveries).toEqual([]);
  }));

  test('fails closed on a symlinked immutable event instead of following it', () => withFixture((value) => {
    const event = message(value, '123e4567-e89b-42d3-a456-426614174013', 'task', 'ordinary task scope');
    const stored = sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event });
    unlinkSync(stored.event_path);
    symlinkSync(join(value.root, 'README.md'), stored.event_path);
    expect(() => listTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      recipient: { kind: 'user', id: 'alice' },
    })).toThrow(TaskInboxError);
    try {
      listTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        canonical_source: value.source,
        recipient: { kind: 'user', id: 'alice' },
      });
    } catch (error) {
      expect((error as TaskInboxError).code).toBe('task_message_unreadable');
    }
  }));

  test('fails closed when an inbox ancestor is a symlink', () => withFixture((value) => {
    const common = git(value.root, 'rev-parse', '--git-common-dir');
    const commonRoot = realpathSync(join(value.root, common));
    const outside = join(value.root, 'outside-inbox');
    mkdirSync(outside);
    symlinkSync(outside, join(commonRoot, 'repo-harness'));
    const event = message(value, '123e4567-e89b-42d3-a456-426614174015', 'task', 'must stay inside common dir');
    try {
      sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event });
      throw new Error('expected symlinked ancestor rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskInboxError);
      expect((error as TaskInboxError).code).toBe('task_message_unreadable');
    }
  }));

  test('classifies malformed persisted event bytes as task_message_unreadable', () => withFixture((value) => {
    const event = message(value, '123e4567-e89b-42d3-a456-426614174014', 'task', 'ordinary task scope');
    const stored = sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event });
    writeFileSync(stored.event_path, '{"protocol":1}\n');
    try {
      listTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        canonical_source: value.source,
        recipient: { kind: 'user', id: 'alice' },
      });
      throw new Error('expected malformed event rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskInboxError);
      expect((error as TaskInboxError).code).toBe('task_message_unreadable');
    }
  }));

  test('bounds one hook turn and leaves excess task messages pending', () => withFixture((value) => {
    bind(value, CLAIM_ONE, 1);
    for (let index = 0; index < 9; index += 1) {
      const suffix = String(20 + index).padStart(2, '0');
      sendTaskMessage({
        repo_root: value.root,
        canonical_source: value.source,
        event: message(value, `123e4567-e89b-42d3-a456-4266141740${suffix}`, 'task', `message ${index}`),
      });
    }
    const input = {
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      recipient: { kind: 'claim' as const, claim_id: CLAIM_ONE, generation: 1 },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session' as const,
    };
    const first = deliverTaskInbox({ ...input, delivered_at: '2026-08-23T05:10:00Z' });
    expect(first.deliveries).toHaveLength(8);
    expect(first.pending_count).toBe(1);
    const second = deliverTaskInbox({ ...input, delivered_at: '2026-08-23T05:11:00Z' });
    expect(second.deliveries).toHaveLength(1);
  }));

  test('applies the 24 KiB ceiling to the complete rendered context, not only body bytes', () => withFixture((value) => {
    bind(value, CLAIM_ONE, 1);
    for (let index = 0; index < 3; index += 1) {
      sendTaskMessage({
        repo_root: value.root,
        canonical_source: value.source,
        event: message(
          value,
          `123e4567-e89b-42d3-a456-42661417403${index}`,
          'task',
          'x'.repeat(8 * 1024),
          `2026-08-23T05:00:0${index}Z`,
        ),
      });
    }
    const delivered = deliverTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      canonical_source: value.source,
      recipient: { kind: 'claim', claim_id: CLAIM_ONE, generation: 1 },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session',
      delivered_at: '2026-08-23T05:10:00Z',
    });
    expect(delivered.deliveries).toHaveLength(2);
    expect(delivered.pending_count).toBe(1);
    expect(Buffer.byteLength(renderTaskMessageUntrustedContext(delivered.deliveries.map((entry) => entry.event)), 'utf8'))
      .toBeLessThanOrEqual(TASK_MESSAGE_HOOK_MAX_BYTES);
  }));

  test('manual user and orchestrator listing persists delivery before acknowledgement without a lease write', () => withFixture((value) => {
    const userEvent = message(
      value,
      '123e4567-e89b-42d3-a456-426614174040',
      'task',
      'for a user',
      '2026-08-23T05:00:00Z',
      'user',
    );
    const orchestratorEvent = message(
      value,
      '123e4567-e89b-42d3-a456-426614174041',
      'task',
      'for an orchestrator',
      '2026-08-23T05:00:01Z',
      'orchestrator',
    );
    sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event: userEvent });
    sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event: orchestratorEvent });
    const leaseBefore = readLease(value.root, value.task_id).raw;
    for (const [recipient, event] of [
      [{ kind: 'user' as const, id: 'alice' }, userEvent],
      [{ kind: 'orchestrator' as const, id: 'fleet' }, orchestratorEvent],
    ] as const) {
      const delivery = deliverTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        canonical_source: value.source,
        recipient,
        delivery_channel: 'manual',
        delivered_at: '2026-08-23T05:10:00Z',
      });
      expect(delivery.deliveries.map((entry) => entry.event.message_id)).toEqual([event.message_id]);
      const acknowledged = acknowledgeTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        canonical_source: value.source,
        recipient,
        message_id: event.message_id,
        acknowledged_at: '2026-08-23T05:11:00Z',
      });
      expect(acknowledged.delivery_state).toBe('acknowledged');
      expect(acknowledged.delivery_channel).toBe('manual');
    }
    expect(readLease(value.root, value.task_id).raw).toBe(leaseBefore);
  }));
});
