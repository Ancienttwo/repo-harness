import { expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { admittedInboxFixture } from '../helpers/admitted-inbox-fixture';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { acknowledgeTaskInbox, deliverTaskInbox, listTaskInbox, readAdmittedTaskActivity, readHistoricalTaskActivity, sendTaskMessage, taskInboxTaskDirectory } from '../../src/effects/fleet/task-inbox';
import { buildTaskMessageEvent, canonicalTaskMessageEventBytes, validateTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';
import { buildTaskReplyIntent, buildTaskReplyCommit, canonicalTaskReplyIntentBytes, canonicalTaskReplyCommitBytes, validateTaskReplyIntent } from '../../src/core/fleet/admitted-task-reply';
import { admittedTaskInboxRecipientStorageKey } from '../../src/core/fleet/task-inbox-layout';

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

test('admitted reply recovery bytes and bounded activity retain session provenance without legacy fallback', async () => {
  const f = await admittedInboxFixture();
  try {
    sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event });
    deliverTaskInbox({ ...f.input, delivery_channel: 'manual', delivered_at: time });
    const ack = acknowledgeTaskInbox({ ...f.input, message_id: f.event.message_id, acknowledged_at: time });
    const intent = buildTaskReplyIntent({ parent: f.event, acknowledgement: ack,
      session: { execution_actor: f.admission.identity.execution_actor, claim: f.admission.identity.claim,
        grant_sha256: f.admission.approval.grant_sha256, session_binding_sha256: `sha256:${'d'.repeat(64)}` },
      reply_message_id: '123e4567-e89b-42d3-a456-426614174001', body: 'Recorded reply.', prepared_at: time });
    expect(() => validateTaskReplyIntent({ ...intent, principal_mapping: {} })).toThrow();
    const commit = buildTaskReplyCommit({ intent, committed_at: time });
    const directory = taskInboxTaskDirectory(f.root, f.task);
    const slot = join(directory, 'reply-effects', f.event.message_id, admittedTaskInboxRecipientStorageKey(f.input.recipient));
    mkdirSync(slot, { recursive: true });
    writeFileSync(join(slot, 'intent.json'), canonicalTaskReplyIntentBytes(intent) + '\n');
    writeFileSync(join(slot, 'commit.json'), canonicalTaskReplyCommitBytes(commit) + '\n');
    writeFileSync(join(directory, 'events', intent.effect_id + '.json'), canonicalTaskMessageEventBytes(intent.reply) + '\n');
    const query = { repo_root: f.root, task_id: f.task, limit: 1, after: null, message_id: null, budget };
    const activity = readAdmittedTaskActivity(query);
    expect(activity.entries[0]?.replies[0]?.observation.state).toBe('complete');
    expect(activity.entries[0]?.replies[0]?.session).toEqual(intent.session);
    expect(activity.next_cursor).toBe(f.event.message_id);
    expect(readAdmittedTaskActivity({ ...query, after: activity.next_cursor }).entries[0]?.event.message_id).toBe(intent.effect_id);
    expect(readHistoricalTaskActivity(query).entries).toHaveLength(0);
    expect(readAdmittedTaskActivity({ ...query, budget: { ...budget, max_scan: 0 } }).coverage.reason).toBe('scan');
  } finally { rmSync(f.directory, { recursive: true, force: true }); }
});
