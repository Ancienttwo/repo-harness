import { describe, expect, test } from 'bun:test';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { buildTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';
import { admittedInboxFixture } from '../helpers/admitted-inbox-fixture';
import {
  TaskInboxError,
  deliverTaskInbox,
  acknowledgeTaskInbox,
  listTaskInbox,
  sendTaskMessage,
  taskInboxDeliveryPath,
  taskInboxTaskDirectory,
} from '../../src/effects/fleet/task-inbox';
import { taskLockRelativePath } from '../../src/effects/locking/task-lock';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const TASK_INBOX_MODULE = resolve(import.meta.dir, '../../src/effects/fleet/task-inbox.ts');
const MESSAGE_ONE = '123e4567-e89b-42d3-a456-426614174010';
const MESSAGE_TWO = '123e4567-e89b-42d3-a456-426614174011';
const RECIPIENT = { kind: 'user' as const, id: 'alice' };

test('delivery paths use portable bounded components without folding recipient identity', async () => {
  await withFixtureAsync(async value => {
    const recipients = [
      { kind: 'claim' as const, claim: value.source.authority.claim },
      { kind: 'user' as const, id: 'Alice' },
      { kind: 'user' as const, id: 'alice' },
      { kind: 'orchestrator' as const, id: 'CON.' },
      { kind: 'user' as const, id: 'a'.repeat(128) },
    ];
    const names = recipients.map(recipient => basename(taskInboxDeliveryPath(value.root, value.taskId, MESSAGE_ONE, recipient)));
    for (const name of names) {
      expect(name).toMatch(/^[a-z0-9-]+\.json$/);
      expect(name.length).toBeLessThanOrEqual(71);
    }
    expect(new Set(names).size).toBe(recipients.length);
  });
});

test('case-distinct recipients persist independently through delivery and ACK on the native filesystem', async () => {
  await withFixtureAsync(async value => {
    sendTaskMessage({ repo_root: value.root, source: value.source, event: event(value, MESSAGE_ONE) });
    const inputs = ['Alice', 'alice'].map(id => ({ repo_root: value.root, source: value.source,
      task_id: value.taskId, recipient: { kind: 'user' as const, id } }));
    for (const input of inputs) deliverTaskInbox({ ...input, delivery_channel: 'manual', delivered_at: '2026-09-22T00:00:00Z' });
    acknowledgeTaskInbox({ ...inputs[0]!, message_id: MESSAGE_ONE, acknowledged_at: '2026-09-22T00:01:00Z' });
    const receipts = inputs.map(input => JSON.parse(readFileSync(taskInboxDeliveryPath(value.root, value.taskId, MESSAGE_ONE, input.recipient), 'utf8')));
    expect(receipts.map(receipt => receipt.recipient_id)).toEqual(['Alice', 'alice']);
    expect(receipts.map(receipt => receipt.delivery_state)).toEqual(['acknowledged', 'delivered']);
  });
});

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  const admitted = await admittedInboxFixture();
  return { ...admitted, taskId: admitted.task };
}

function event(value: Fixture, messageId: string) {
  return buildTaskMessageEvent({
    message_id: messageId,
    task_id: value.taskId,
    task_identity: value.event.task_identity,
    admission_sha256: value.event.admission_sha256,
    scope: 'task',
    target_claim: null,
    sender_kind: 'operator',
    sender_id: 'task-inbox-staging-test',
    sender_trust: 'local_operator',
    audience: 'user',
    body: `body for ${messageId}`,
    created_at: '2026-09-01T01:00:00.000Z',
    in_reply_to: null,
  });
}

async function withFixtureAsync(run: (value: Fixture) => Promise<void>): Promise<void> {
  const value = await fixture();
  return run(value).finally(() => rmSync(value.directory, { recursive: true, force: true }));
}

function interruptedWriter(
  value: Fixture,
  operation: 'event' | 'receipt',
  markerPath: string,
): ReturnType<typeof Bun.spawn> {
  const script = `
    import { mock } from 'bun:test';
    const fs = await import('node:fs');
    const operation = process.env.STAGING_OPERATION;
    const intercepted = operation === 'event' ? 'linkSync' : 'renameSync';
    const original = fs[intercepted];
    mock.module('fs', () => ({
      ...fs,
      [intercepted]: (...args) => {
        // The task lock also links its owner record. Stop only at the inbox's
        // own publication, whose source is a staged inbox file.
        if (!/[\\\\/]staging[\\\\/]/.test(String(args[0]))) return original(...args);
        fs.writeFileSync(process.env.STAGING_MARKER, JSON.stringify(args));
        const wait = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(wait, 0, 0);
      },
    }));
    const inbox = await import(process.env.TASK_INBOX_MODULE);
    const input = JSON.parse(process.env.STAGING_INPUT);
    // The provider fixture is explicit input; functions do not survive JSON transport.
    const provider = JSON.parse(process.env.STAGING_PROVIDER);
    input.source.authority.source.runner = args => ({ stdout: JSON.stringify(
      args.includes('repos/acme/widgets/issues/903') ? provider.issue : provider.repository) });
    if (operation === 'event') inbox.sendTaskMessage(input);
    else inbox.deliverTaskInbox(input);
  `;
  const input = operation === 'event'
    ? { repo_root: value.root, source: value.source, event: event(value, MESSAGE_ONE) }
    : {
      repo_root: value.root,
      task_id: value.taskId,
      source: value.source,
      recipient: RECIPIENT,
      delivery_channel: 'manual',
      delivered_at: '2026-09-01T01:01:00.000Z',
    };
  return Bun.spawn([process.execPath, '-e', script], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      STAGING_OPERATION: operation,
      STAGING_MARKER: markerPath,
      STAGING_INPUT: JSON.stringify(input),
      STAGING_PROVIDER: JSON.stringify({ issue: value.approved.issue, repository: { id: 'R_provider', full_name: 'acme/widgets', html_url: 'https://github.com/acme/widgets' } }),
      TASK_INBOX_MODULE,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

async function terminateAtPublication(
  worker: ReturnType<typeof Bun.spawn>,
  markerPath: string,
  value: Fixture,
): Promise<readonly string[]> {
  const deadline = Date.now() + 10_000;
  while (!existsSync(markerPath)) {
    if (Date.now() >= deadline) {
      const stderr = worker.stderr instanceof ReadableStream ? await new Response(worker.stderr).text() : '';
      worker.kill();
      throw new Error(`timed out waiting for staging publication barrier: ${stderr}`);
    }
    await Bun.sleep(10);
  }
  const paths = JSON.parse(readFileSync(markerPath, 'utf8')) as readonly string[];
  worker.kill();
  await worker.exited;
  // Lock cancellation is covered separately. Remove this dead child-process
  // lock immediately so these tests isolate the persisted staging residue.
  rmSync(join(resolveGitCommonDirectory(value.root), taskLockRelativePath(value.taskId)), {
    recursive: true,
    force: true,
  });
  return paths;
}

function expectUnreadable(run: () => unknown): void {
  expect(run).toThrow(TaskInboxError);
  try {
    run();
  } catch (error) {
    expect((error as TaskInboxError).code).toBe('task_message_unreadable');
  }
}

describe('Task Inbox staging isolation', () => {
  test('an event writer terminated before publication leaves only non-canonical staging and the inbox remains usable', async () => {
    await withFixtureAsync(async (value) => {
      const markerPath = join(value.root, 'event-publication-ready');
      const writer = interruptedWriter(value, 'event', markerPath);
      const [temporary, target] = await terminateAtPublication(writer, markerPath, value);
      const taskDirectory = taskInboxTaskDirectory(value.root, value.taskId);

      expect(temporary.startsWith(join(taskDirectory, 'staging', 'events'))).toBe(true);
      expect(target).toBe(join(taskDirectory, 'events', `${MESSAGE_ONE}.json`));
      expect(existsSync(temporary)).toBe(true);
      expect(existsSync(target)).toBe(false);
      expect(readdirSync(join(taskDirectory, 'events'))).toEqual([]);

      expect(listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        source: value.source,
        recipient: RECIPIENT,
      }).entries).toEqual([]);

      expect(sendTaskMessage({
        repo_root: value.root,
        source: value.source,
        event: event(value, MESSAGE_ONE),
      }).created).toBe(true);
      expect(sendTaskMessage({
        repo_root: value.root,
        source: value.source,
        event: event(value, MESSAGE_TWO),
      }).created).toBe(true);
      expect(listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        source: value.source,
        recipient: RECIPIENT,
      }).entries.map((entry) => entry.event.message_id)).toEqual([MESSAGE_ONE, MESSAGE_TWO]);

      const unknownCanonical = join(taskDirectory, 'events', '.unknown.tmp');
      writeFileSync(unknownCanonical, 'not a canonical event\n');
      expectUnreadable(() => listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        source: value.source,
        recipient: RECIPIENT,
      }));
      unlinkSync(unknownCanonical);
    });
  }, 30_000);

  test('a receipt writer terminated before publication leaves only non-canonical staging and delivery can resume', async () => {
    await withFixtureAsync(async (value) => {
      sendTaskMessage({ repo_root: value.root, source: value.source, event: event(value, MESSAGE_ONE) });
      const markerPath = join(value.root, 'receipt-publication-ready');
      const writer = interruptedWriter(value, 'receipt', markerPath);
      const [temporary, target] = await terminateAtPublication(writer, markerPath, value);
      const taskDirectory = taskInboxTaskDirectory(value.root, value.taskId);
      const canonicalReceipt = taskInboxDeliveryPath(value.root, value.taskId, MESSAGE_ONE, RECIPIENT);

      expect(temporary.startsWith(join(taskDirectory, 'staging', 'delivery'))).toBe(true);
      expect(target).toBe(canonicalReceipt);
      expect(existsSync(temporary)).toBe(true);
      expect(existsSync(canonicalReceipt)).toBe(false);
      expect(readdirSync(join(taskDirectory, 'delivery', MESSAGE_ONE))).toEqual([]);

      expect(listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        source: value.source,
        recipient: RECIPIENT,
      }).entries[0]?.receipt).toBeNull();
      expect(deliverTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        source: value.source,
        recipient: RECIPIENT,
        delivery_channel: 'manual',
        delivered_at: '2026-09-01T01:02:00.000Z',
      }).deliveries).toHaveLength(1);

      const unknownCanonical = join(taskDirectory, 'delivery', MESSAGE_ONE, '.unknown.tmp');
      writeFileSync(unknownCanonical, 'not a canonical receipt\n');
      expectUnreadable(() => listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        source: value.source,
        recipient: RECIPIENT,
      }));
      unlinkSync(unknownCanonical);
    });
  }, 30_000);
});
