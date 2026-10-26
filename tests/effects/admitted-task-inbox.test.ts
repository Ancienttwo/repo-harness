import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { admittedInboxFixture } from '../helpers/admitted-inbox-fixture';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { acknowledgeTaskInbox, deliverTaskInbox, listTaskInbox, readAdmittedTaskActivity, readHistoricalTaskActivity, sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { buildTaskMessageEvent, validateTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';

const time = '2026-10-25T01:00:00Z';
const budget = { max_scan: 100, max_bytes: 1024 * 1024, deadline_ms: 5000 };
test('admitted inbox preserves retry, delivery, acknowledgement and exact immutable claim binding', async () => {
  const f = await admittedInboxFixture();
  try {
    sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event });
    sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event });
    expect(listTaskInbox(f.input).entries).toHaveLength(1);
    deliverTaskInbox({ ...f.input, delivery_channel: 'manual', delivered_at: time });
    const ack = acknowledgeTaskInbox({ ...f.input, message_id: f.event.message_id, acknowledged_at: time });
    expect(ack.delivery_state).toBe('acknowledged');
    expect(listTaskInbox(f.input).entries[0]?.receipt?.delivery_state).toBe('acknowledged');
    expect(() => listTaskInbox({ ...f.input, recipient: { kind: 'claim', claim: { ...f.input.recipient.claim, revision: `sha256:${'b'.repeat(64)}` } } })).toThrow('recipient does not match');
    expect(() => validateTaskMessageEvent({ ...f.event, target_generation: 1 })).toThrow();
    expect(() => sendTaskMessage({ repo_root: f.root, source: f.source,
      event: buildTaskMessageEvent({ ...f.event, task_identity: { ...f.event.task_identity, issue_id: 'other' } }) })).toThrow('current admitted task');
    seedReviewAdmissionFixture(f.root, f.home);
    expect(() => listTaskInbox(f.input)).toThrow();
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('bounded admitted activity pages stored events and receipts without legacy fallback', async () => {
  const f = await admittedInboxFixture();
  try {
    sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event });
    deliverTaskInbox({ ...f.input, delivery_channel: 'manual', delivered_at: time });
    acknowledgeTaskInbox({ ...f.input, message_id: f.event.message_id, acknowledged_at: time });
    const second = buildTaskMessageEvent({ ...f.event, message_id: '123e4567-e89b-42d3-a456-426614174001', body: 'Second note.' });
    sendTaskMessage({ repo_root: f.root, source: f.source, event: second });
    const query = { repo_root: f.root, task_id: f.task, limit: 1, after: null, message_id: null, budget };
    const activity = readAdmittedTaskActivity(query);
    expect(activity.entries).toHaveLength(1);
    expect(Object.keys(activity.entries[0]!).sort()).toEqual(['event', 'receipts']);
    expect(activity.entries[0]?.event).toEqual(f.event);
    expect(activity.entries[0]?.receipts.map(receipt => receipt.delivery_state)).toEqual(['acknowledged']);
    expect(activity.next_cursor).toBe(f.event.message_id);
    const next = readAdmittedTaskActivity({ ...query, after: activity.next_cursor });
    expect(next.entries[0]?.event).toEqual(second);
    expect(next.entries[0]?.receipts).toEqual([]);
    expect(readHistoricalTaskActivity(query).entries).toHaveLength(0);
    expect(readAdmittedTaskActivity({ ...query, budget: { ...budget, max_scan: 0 } }).coverage.reason).toBe('scan');
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
