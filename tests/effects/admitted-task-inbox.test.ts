import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { admittedInboxFixture } from '../helpers/admitted-inbox-fixture';
import { seedReviewAdmissionFixture } from '../helpers/review-admission-fixture';
import { acknowledgeTaskInbox, deliverTaskInbox, listTaskInbox, readAdmittedTaskActivity, sendTaskMessage, taskInboxTaskDirectory } from '../../src/effects/fleet/task-inbox';
import { buildTaskMessageEvent, validateTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';
import { taskMessageSender } from '../../src/cli/commands/fleet';
import type { TaskExecutionViewV1 } from '../../src/core/operator/execution-state';
import { decodeTaskMessagesView } from '../../src/core/operator/task-messages';
import { startOperatorServer } from '../../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { tmpWorkspace } from '../helpers/repo-fixture';

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

test('bounded admitted activity pages stored events newest first and keeps the records read before a budget stop', async () => {
  const f = await admittedInboxFixture();
  try {
    sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event });
    deliverTaskInbox({ ...f.input, delivery_channel: 'manual', delivered_at: time });
    acknowledgeTaskInbox({ ...f.input, message_id: f.event.message_id, acknowledged_at: time });
    // Time order is opposite to id order and to text order: `…00.500Z` is later than `…00Z`, and the later event has the lower id.
    const second = buildTaskMessageEvent({ ...f.event, message_id: '123e4567-e89b-42d3-a456-426614173fff', body: 'Second note.',
      created_at: f.event.created_at.replace('Z', '.500Z') });
    sendTaskMessage({ repo_root: f.root, source: f.source, event: second });
    expect(listTaskInbox(f.input).entries.map(entry => entry.event.message_id)).toEqual([f.event.message_id, second.message_id]);
    const query = { repo_root: f.root, task_id: f.task, limit: 1, after: null, message_id: null, budget };
    const activity = readAdmittedTaskActivity(query);
    expect(activity.entries).toHaveLength(1);
    // Two event scans; the receipt of the older event is not read, because that event is not on the page.
    expect(activity.coverage).toMatchObject({ reason: 'page', scanned: 2 });
    expect(Object.keys(activity.entries[0]!).sort()).toEqual(['event', 'receipts']);
    expect(activity.entries[0]?.event).toEqual(second);
    expect(activity.entries[0]?.receipts).toEqual([]);
    expect(activity.next_cursor).toBe(second.message_id);
    const next = readAdmittedTaskActivity({ ...query, after: activity.next_cursor });
    expect(next.entries[0]?.event).toEqual(f.event);
    expect(next.entries[0]?.receipts.map(receipt => receipt.delivery_state)).toEqual(['acknowledged']);
    expect(next.coverage.complete).toBe(true);
    expect(readAdmittedTaskActivity({ ...query, budget: { ...budget, max_scan: 0 } }).coverage.reason).toBe('scan');
    // The walk scans both events; the budget stops at the receipt of the older event, and the newer complete record stays.
    const stopped = readAdmittedTaskActivity({ ...query, limit: 2, budget: { ...budget, max_scan: 2 } });
    expect(stopped.entries).toHaveLength(1);
    expect(stopped.coverage).toMatchObject({ complete: false, reason: 'scan', scanned: 2 });
    expect(stopped.next_cursor).toBeNull();
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
    const hermes = { protocol: 1, kind: 'repo-harness-bot', bot_id: 'hermes', name: 'Hermes', host: 'Hermes', slack_bot_id: null, herdr_agent: 'hermes', registered_at: time.replace('Z', '.000Z') } as const;
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

test('the task messages route serves the stored inbox of a verified task and refuses an unknown or unverified task id', async () => {
  const f = await admittedInboxFixture();
  const registry = tmpWorkspace('task-messages-registry');
  try {
    sendTaskMessage({ repo_root: f.root, source: f.source, event: f.event });
    deliverTaskInbox({ ...f.input, delivery_channel: 'manual', delivered_at: time });
    const id = repoHarnessRepoIdFor(f.root);
    writeFileSync(join(registry, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{
      id, path: f.root, accessMode: 'read_only', source: 'manual', registeredAt: time, lastSeenAt: time }] }));
    const unverified = '2'.repeat(64);
    const follow = (task: string) => ({ task_id: task, resume: null, hc_terminal: null });
    const view: TaskExecutionViewV1 = { protocol: 1, kind: 'operator_task_execution', repository_id: id, observed_at: '2026-10-25T01:00:00.000Z', unlisted_tasks: 0, tasks: [
      { state: 'verified', task: f.task, role: 'deep-reasoner', issue_id: null, branch: null, agent: 'codex', runtime: 'terminal', follow_up: follow(f.task) },
      { state: 'unverified', task: unverified, role: 'deep-reasoner', reason: 'closed', follow_up: follow(unverified) },
    ] };
    const server = await startOperatorServer({ port: 0, env: { ...process.env, REPO_HARNESS_HOME: registry }, read_execution_state: () => ({ state: 'ready', view }) });
    const get = async (task: string, query = '') => {
      const response = await fetch(`${server.url}/api/v1/repositories/${id}/tasks/${task}/messages${query}`);
      return { status: response.status, text: await response.text() };
    };
    try {
      const served = await get(f.task);
      expect(served.status).toBe(200);
      const request = { repository_id: id, task_id: f.task };
      expect(decodeTaskMessagesView(JSON.parse(served.text), request)).toEqual({ protocol: 1, kind: 'operator_task_messages', ...request, complete: true, messages: [{
        message_id: f.event.message_id, body: 'Please inspect the failing check.', sender_kind: 'user', sender_id: 'fixture-user', audience: 'owner',
        created_at: f.event.created_at, receipts: [{ recipient_kind: 'claim', recipient_id: null, delivery_state: 'delivered', delivered_at: time, acknowledged_at: null }] }] });
      // The public view carries no path, claim reference, admission or digest.
      for (const hidden of [f.root, registry, f.input.recipient.claim.reference, f.event.admission_sha256, f.event.event_digest]) expect(served.text).not.toContain(hidden);
      for (const [task, query, status, code] of [
        ['3'.repeat(64), '', 404, 'task_not_found'],
        [unverified, '', 409, 'task_unverified'],
        [f.task, '?after=x', 400, 'invalid_request'],
      ] as const) {
        const answer = await get(task, query);
        expect(answer.status).toBe(status);
        expect((JSON.parse(answer.text) as { error: { code: string } }).error.code).toBe(code);
      }
    } finally { await server.close(); }
  } finally { rmSync(f.directory, { recursive: true, force: true }); rmSync(registry, { recursive: true, force: true }); }
});
