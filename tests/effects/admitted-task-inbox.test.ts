import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { admittedInboxFixture } from '../helpers/admitted-inbox-fixture';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { acknowledgeTaskInbox, deliverTaskInbox, listTaskInbox, readAdmittedTaskActivity, sendTaskMessage, taskInboxTaskDirectory } from '../../src/effects/fleet/task-inbox';
import { buildTaskMessageEvent, validateTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';
import { taskMessageSender } from '../../src/cli/commands/fleet';

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
    expect(readAdmittedTaskActivity({ ...query, budget: { ...budget, max_scan: 0 } }).coverage.reason).toBe('scan');
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('a retired agent_runtime_effect receipt fails its readers with the record path', async () => {
  const f = await admittedInboxFixture();
  try {
    sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event });
    deliverTaskInbox({ ...f.input, delivery_channel: 'manual', delivered_at: time });
    const directory = taskInboxTaskDirectory(f.root, f.task);
    const [name] = readdirSync(join(directory, 'delivery'), { recursive: true }).map(String).filter(entry => entry.endsWith('.json'));
    const path = join(directory, 'delivery', name!);
    writeFileSync(path, readFileSync(path, 'utf8').replace('"delivery_channel":"manual"', '"delivery_channel":"agent_runtime_effect"'));
    const retired = `delivery_channel agent_runtime_effect is retired: ${path}. The operator removes or archives this record by hand.`;
    expect(() => listTaskInbox(f.input)).toThrow(retired);
    expect(() => readAdmittedTaskActivity({ repo_root: f.root, task_id: f.task, limit: 1, after: null, message_id: null, budget })).toThrow(retired);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('a binding with a retired engineer_profile fails its reader with the record path', async () => {
  const f = await admittedInboxFixture();
  try {
    const path = join(f.dir, 'binding.json');
    const binding = JSON.parse(readFileSync(path, 'utf8'));
    binding.task_admission.identity.engineer_profile = { engineer_id: 'retired' };
    writeFileSync(path, `${JSON.stringify(binding, null, 2)}\n`);
    expect(() => sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event }))
      .toThrow(`task_agent_engineer_profile_retired: ${path}. The operator removes or archives this record by hand.`);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});

test('a message sent for a registered Bot keeps local operator trust and names the Bot as sender', async () => {
  const f = await admittedInboxFixture();
  try {
    const hermes = { protocol: 1, kind: 'repo-harness-bot', bot_id: 'hermes', name: 'Hermes', host: 'Hermes', mcp_client_id: null, slack_bot_id: null, herdr_agent: 'hermes', registered_at: time.replace('Z', '.000Z') } as const;
    expect(taskMessageSender(null, [hermes])).toEqual({ sender_kind: 'user', sender_id: null, sender_trust: 'local_operator' });
    expect(() => taskMessageSender('ghost', [hermes])).toThrow('--bot ghost is not a registered Bot');
    const event = buildTaskMessageEvent({ ...f.event, ...taskMessageSender('hermes', [hermes]) });
    expect(event).toMatchObject({ sender_kind: 'operator', sender_id: 'hermes', sender_trust: 'local_operator' });
    sendTaskMessage({ repo_root: f.root, source: f.source, event });
    deliverTaskInbox({ ...f.input, delivery_channel: 'manual', delivered_at: time });
    const activity = readAdmittedTaskActivity({ repo_root: f.root, task_id: f.task, limit: 1, after: null, message_id: null, budget });
    expect(activity.entries[0]?.event).toMatchObject({ sender_kind: 'operator', sender_id: 'hermes' });
    expect(activity.entries[0]?.receipts.map(receipt => receipt.delivery_state)).toEqual(['delivered']);
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
