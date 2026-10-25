import { admittedInboxFixture } from '../helpers/admitted-inbox-fixture';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { taskSessionDirectory } from '../../src/effects/terminal/task-session';
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

import {
  TASK_MESSAGE_HOOK_MAX_BYTES,
  buildTaskMessageEvent,
  renderTaskMessageUntrustedContext,
} from '../../src/core/fleet/admitted-task-message';
import {
  TaskInboxError,
  acknowledgeTaskInbox,
  deliverTaskInbox,
  listTaskInbox,
  sendTaskMessage,
  summarizeTaskInboxForFleet,
  readTaskMessageDelivery,
} from '../../src/effects/fleet/task-inbox';

const CLAIM_ONE = { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: `sha256:${'c'.repeat(64)}` };
const CLAIM_TWO = { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-2', revision: `sha256:${'d'.repeat(64)}` };

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture() {
  const admitted = await admittedInboxFixture();
  return { ...admitted, task_id: admitted.task };
}

function bindingBytes(value: Fixture): string {
  return readFileSync(join(taskSessionDirectory(value.root, value.task_id, value.source.session.role), 'binding.json'), 'utf8');
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
    task_identity: fixture.event.task_identity,
    admission_sha256: fixture.event.admission_sha256,
    scope,
    target_claim: scope === 'claim' ? CLAIM_ONE : null,
    sender_kind: 'user',
    sender_id: 'alice',
    sender_trust: 'local_operator',
    audience,
    body,
    created_at,
    in_reply_to: null,
  });
}

async function withFixture(run: (value: Fixture) => Promise<void>): Promise<void> {
  const value = await fixture();
  try { await run(value); } finally { rmSync(value.directory, { recursive: true, force: true }); }
}

describe('Admitted Task Inbox common-directory effects', () => {
  test('projects a lock-free body-free fleet summary without creating delivery receipts or changing the session binding', () => withFixture(async (value) => {
    const event = message(value, '123e4567-e89b-42d3-a456-426614174009', 'claim', 'never expose this body');
    sendTaskMessage({ repo_root: value.root, source: value.source, event });
    const bindingBefore = bindingBytes(value);
    const summary = summarizeTaskInboxForFleet({
      repo_root: value.root,
      task_id: value.task_id,
      admission_sha256: value.event.admission_sha256,
      current_claim: CLAIM_ONE,
    });
    expect(summary).toEqual({ unread_count: 1, addressed_to_current_claim: true, snapshot_consistency: 'stable' });
    expect(JSON.stringify(summary)).not.toContain(event.body);
    expect(bindingBytes(value)).toBe(bindingBefore);
    expect(listTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      source: value.source,
      recipient: { kind: 'claim', claim: CLAIM_ONE },
      execution_worktree: realpathSync(value.root),
    }).entries[0]?.receipt).toBeNull();
  }));

  test('creates immutable messages idempotently without writing the session binding', () => withFixture(async (value) => {
    const event = message(value, '123e4567-e89b-42d3-a456-426614174010', 'claim', 'private for C1');
    const before = bindingBytes(value);
    const first = sendTaskMessage({ repo_root: value.root, source: value.source, event });
    expect(bindingBytes(value)).toBe(before);
    const second = sendTaskMessage({
      repo_root: value.root,
      source: value.source,
      event: message(value, event.message_id, 'claim', 'private for C1', '2026-08-23T06:00:00Z'),
    });
    expect(second).toMatchObject({ created: false, event_path: first.event_path });
    expect(second.event.created_at).toBe(event.created_at);
    expect(bindingBytes(value)).toBe(before);
    expect(() => sendTaskMessage({
      repo_root: value.root,
      source: value.source,
      event: message(value, event.message_id, 'claim', 'different bytes'),
    })).toThrow(TaskInboxError);
    try {
      sendTaskMessage({ repo_root: value.root, source: value.source, event: message(value, event.message_id, 'claim', 'different bytes') });
    } catch (error) {
      expect((error as TaskInboxError).code).toBe('message_id_conflict');
    }
  }));

  test('supersedes stale claim scope, delivers task scope once, and globally satisfies after ack', () => withFixture(async (value) => {
    const claim = message(value, '123e4567-e89b-42d3-a456-426614174011', 'claim', 'only C1 may read');
    const task = message(value, '123e4567-e89b-42d3-a456-426614174012', 'task', 'C2 may repair this');
    const acknowledgedByC1 = message(value, '123e4567-e89b-42d3-a456-426614174013', 'claim', 'C1 reads and acknowledges this');
    sendTaskMessage({ repo_root: value.root, source: value.source, event: claim });
    sendTaskMessage({ repo_root: value.root, source: value.source, event: task });
    sendTaskMessage({ repo_root: value.root, source: value.source, event: acknowledgedByC1 });
    // The fleet summary counts what each claim has not acknowledged, from that
    // claim's own receipt among every receipt the message holds.
    const unreadFor = (claim: typeof CLAIM_ONE) => summarizeTaskInboxForFleet({
      repo_root: value.root, task_id: value.task_id, admission_sha256: value.event.admission_sha256, current_claim: claim,
    });
    const unread = (count: number) => ({ unread_count: count, addressed_to_current_claim: count > 0, snapshot_consistency: 'stable' as const });
    expect(unreadFor(CLAIM_ONE)).toEqual(unread(3));
    const c1 = { kind: 'claim' as const, claim: CLAIM_ONE };
    expect(deliverTaskInbox({
      repo_root: value.root, task_id: value.task_id, source: value.source, recipient: c1,
      execution_worktree: realpathSync(value.root), delivery_channel: 'hook_session', delivered_at: '2026-08-23T05:05:00Z',
    }).deliveries).toHaveLength(3);
    expect(unreadFor(CLAIM_ONE)).toEqual(unread(3));
    acknowledgeTaskInbox({
      repo_root: value.root, task_id: value.task_id, source: value.source, message_id: acknowledgedByC1.message_id,
      recipient: c1, execution_worktree: realpathSync(value.root), acknowledged_at: '2026-08-23T05:06:00Z',
    });
    expect(unreadFor(CLAIM_ONE)).toEqual(unread(2));
    await value.bind(CLAIM_TWO, 'replacement-owner');
    expect(unreadFor(CLAIM_TWO)).toEqual(unread(1));
    const beforeDelivery = bindingBytes(value);
    const delivered = deliverTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      source: value.source,
      recipient: { kind: 'claim', claim: CLAIM_TWO },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session',
      delivered_at: '2026-08-23T05:10:00Z',
    });
    expect(bindingBytes(value)).toBe(beforeDelivery);
    expect(delivered.superseded_count).toBe(1);
    expect(delivered.deliveries.map((entry) => entry.event.message_id)).toEqual([task.message_id]);
    expect(JSON.stringify(delivered)).not.toContain(claim.body);
    expect(readTaskMessageDelivery({
      repo_root: value.root, task_id: value.task_id, message_id: claim.message_id, recipient: c1,
    }).receipt?.delivery_state).toBe('superseded');
    // The task message now holds a delivered receipt for C1 and for C2.
    expect(unreadFor(CLAIM_TWO)).toEqual(unread(1));
    expect(unreadFor(CLAIM_ONE)).toEqual(unread(1));
    const beforeAck = bindingBytes(value);
    const receipt = acknowledgeTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      source: value.source,
      message_id: task.message_id,
      recipient: { kind: 'claim', claim: CLAIM_TWO },
      execution_worktree: realpathSync(value.root),
      acknowledged_at: '2026-08-23T05:11:00Z',
    });
    expect(receipt.delivery_state).toBe('acknowledged');
    expect(bindingBytes(value)).toBe(beforeAck);
    expect(unreadFor(CLAIM_TWO)).toEqual(unread(0));
    expect(unreadFor(CLAIM_ONE)).toEqual(unread(0));
    const listing = listTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      source: value.source,
      recipient: { kind: 'claim', claim: CLAIM_TWO },
      execution_worktree: realpathSync(value.root),
    });
    expect(listing.entries.find((entry) => entry.event.message_id === task.message_id)?.globally_satisfied).toBe(true);
    expect(deliverTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      source: value.source,
      recipient: { kind: 'claim', claim: CLAIM_TWO },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session',
      delivered_at: '2026-08-23T05:12:00Z',
    }).deliveries).toEqual([]);
  }));

  test('skips a stored event whose approved admission changed instead of failing every scan', () => withFixture(async (value) => {
    const stale = message(value, '123e4567-e89b-42d3-a456-426614174020', 'task', 'written before the admission changed', '2026-08-23T05:00:00Z', 'user');
    sendTaskMessage({ repo_root: value.root, source: value.source, event: stale });

    const refreshed = seedReviewAdmissionFixture(value.root, value.home, { allowedPaths: ['source.txt'] });
    value.source.authority.source = refreshed.source;
    const nextRevision = refreshed.admission.admission_sha256;
    expect(nextRevision).not.toBe(value.event.admission_sha256);

    const recipient = { kind: 'user', id: 'alice' } as const;
    const listing = listTaskInbox({
      repo_root: value.root, task_id: value.task_id, source: value.source, recipient,
    });
    expect(listing.entries).toEqual([]);
    expect(listing.superseded_revision_count).toBe(1);

    expect(deliverTaskInbox({
      repo_root: value.root, task_id: value.task_id, source: value.source, recipient,
      delivery_channel: 'manual', delivered_at: '2026-08-23T06:00:00Z',
    }).deliveries).toEqual([]);

    expect(summarizeTaskInboxForFleet({
      repo_root: value.root, task_id: value.task_id, admission_sha256: nextRevision, current_claim: null,
    })).toEqual({ unread_count: 0, addressed_to_current_claim: false, snapshot_consistency: 'stable' });

    const current = buildTaskMessageEvent({
      message_id: '123e4567-e89b-42d3-a456-426614174021',
      task_id: value.task_id,
      admission_sha256: nextRevision,
      task_identity: value.event.task_identity,
      scope: 'task',
      target_claim: null,
      sender_kind: 'user',
      sender_id: 'alice',
      sender_trust: 'local_operator',
      audience: 'user',
      body: 'written after the admission changed',
      created_at: '2026-08-23T06:01:00Z',
      in_reply_to: null,
    });
    sendTaskMessage({ repo_root: value.root, source: value.source, event: current });
    const relisted = listTaskInbox({
      repo_root: value.root, task_id: value.task_id, source: value.source, recipient,
    });
    expect(relisted.entries.map((entry) => entry.event.message_id)).toEqual([current.message_id]);
    expect(relisted.superseded_revision_count).toBe(1);
  }));

  test('fails closed on a symlinked immutable event instead of following it', () => withFixture(async (value) => {
    const event = message(value, '123e4567-e89b-42d3-a456-426614174013', 'task', 'ordinary task scope');
    const stored = sendTaskMessage({ repo_root: value.root, source: value.source, event });
    unlinkSync(stored.event_path);
    symlinkSync(join(value.root, 'source.txt'), stored.event_path);
    expect(() => listTaskInbox({
      repo_root: value.root,
      task_id: value.task_id,
      source: value.source,
      recipient: { kind: 'user', id: 'alice' },
    })).toThrow(TaskInboxError);
    try {
      listTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        source: value.source,
        recipient: { kind: 'user', id: 'alice' },
      });
    } catch (error) {
      expect((error as TaskInboxError).code).toBe('task_message_unreadable');
    }
  }));

  test('fails closed when an inbox ancestor is a symlink', () => withFixture(async (value) => {
    const common = git(value.root, 'rev-parse', '--git-common-dir');
    const commonRoot = realpathSync(join(value.root, common));
    const outside = join(value.root, 'outside-inbox');
    mkdirSync(outside);
    symlinkSync(outside, join(commonRoot, 'repo-harness'));
    const event = message(value, '123e4567-e89b-42d3-a456-426614174015', 'task', 'must stay inside common dir');
    try {
      sendTaskMessage({ repo_root: value.root, source: value.source, event });
      throw new Error('expected symlinked ancestor rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskInboxError);
      expect((error as TaskInboxError).code).toBe('task_message_unreadable');
    }
  }));

  test('classifies malformed persisted event bytes as task_message_unreadable', () => withFixture(async (value) => {
    const event = message(value, '123e4567-e89b-42d3-a456-426614174014', 'task', 'ordinary task scope');
    const stored = sendTaskMessage({ repo_root: value.root, source: value.source, event });
    writeFileSync(stored.event_path, '{"protocol":1}\n');
    try {
      listTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        source: value.source,
        recipient: { kind: 'user', id: 'alice' },
      });
      throw new Error('expected malformed event rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(TaskInboxError);
      expect((error as TaskInboxError).code).toBe('task_message_unreadable');
    }
  }));

  test('bounds one hook turn and leaves excess task messages pending', () => withFixture(async (value) => {
    for (let index = 0; index < 9; index += 1) {
      const suffix = String(20 + index).padStart(2, '0');
      sendTaskMessage({
        repo_root: value.root,
        source: value.source,
        event: message(value, `123e4567-e89b-42d3-a456-4266141740${suffix}`, 'task', `message ${index}`),
      });
    }
    const input = {
      repo_root: value.root,
      task_id: value.task_id,
      source: value.source,
      recipient: { kind: 'claim' as const, claim: CLAIM_ONE },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session' as const,
    };
    const first = deliverTaskInbox({ ...input, delivered_at: '2026-08-23T05:10:00Z' });
    expect(first.deliveries).toHaveLength(8);
    expect(first.pending_count).toBe(1);
    const second = deliverTaskInbox({ ...input, delivered_at: '2026-08-23T05:11:00Z' });
    expect(second.deliveries).toHaveLength(1);
  }));

  test('applies the 24 KiB ceiling to the complete rendered context, not only body bytes', () => withFixture(async (value) => {
    for (let index = 0; index < 3; index += 1) {
      sendTaskMessage({
        repo_root: value.root,
        source: value.source,
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
      source: value.source,
      recipient: { kind: 'claim', claim: CLAIM_ONE },
      execution_worktree: realpathSync(value.root),
      delivery_channel: 'hook_session',
      delivered_at: '2026-08-23T05:10:00Z',
    });
    expect(delivered.deliveries).toHaveLength(2);
    expect(delivered.pending_count).toBe(1);
    expect(Buffer.byteLength(renderTaskMessageUntrustedContext(delivered.deliveries.map((entry) => entry.event)), 'utf8'))
      .toBeLessThanOrEqual(TASK_MESSAGE_HOOK_MAX_BYTES);
  }));

  test('manual user and orchestrator listing persists delivery before acknowledgement without a session binding write', () => withFixture(async (value) => {
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
    sendTaskMessage({ repo_root: value.root, source: value.source, event: userEvent });
    sendTaskMessage({ repo_root: value.root, source: value.source, event: orchestratorEvent });
    const bindingBefore = bindingBytes(value);
    for (const [recipient, event] of [
      [{ kind: 'user' as const, id: 'alice' }, userEvent],
      [{ kind: 'orchestrator' as const, id: 'fleet' }, orchestratorEvent],
    ] as const) {
      const delivery = deliverTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        source: value.source,
        recipient,
        delivery_channel: 'manual',
        delivered_at: '2026-08-23T05:10:00Z',
      });
      expect(delivery.deliveries.map((entry) => entry.event.message_id)).toEqual([event.message_id]);
      const acknowledged = acknowledgeTaskInbox({
        repo_root: value.root,
        task_id: value.task_id,
        source: value.source,
        recipient,
        message_id: event.message_id,
        acknowledged_at: '2026-08-23T05:11:00Z',
      });
      expect(acknowledged.delivery_state).toBe('acknowledged');
      expect(acknowledged.delivery_channel).toBe('manual');
    }
    expect(bindingBytes(value)).toBe(bindingBefore);
  }));
});
