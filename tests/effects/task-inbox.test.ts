import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildTaskMessageEvent } from '../../src/core/fleet/task-message';
import { deriveTaskRevision } from '../../src/core/state/coordination-identity';
import {
  TaskInboxError,
  deliverTaskInbox,
  listTaskInbox,
  sendTaskMessage,
  taskInboxDeliveryPath,
  taskInboxTaskDirectory,
} from '../../src/effects/fleet/task-inbox';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { taskLockRelativePath } from '../../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const PROJECT_ROOT = resolve(import.meta.dir, '../..');
const TASK_INBOX_MODULE = resolve(import.meta.dir, '../../src/effects/fleet/task-inbox.ts');
const SPRINT_PATH = 'plans/sprints/task-inbox-staging.sprint.md';
const TASK_CELL = 'keep staging outside canonical scans';
const MESSAGE_ONE = '123e4567-e89b-42d3-a456-426614174010';
const MESSAGE_TWO = '123e4567-e89b-42d3-a456-426614174011';
const RECIPIENT = { kind: 'user' as const, id: 'alice' };

interface Fixture {
  readonly root: string;
  readonly taskId: string;
  readonly taskRevision: string;
  readonly source: { readonly targetRef: string; readonly sprintPath: string };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-task-inbox-staging-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Task Inbox Staging Test');
  git(root, 'config', 'user.email', 'task-inbox-staging@test.invalid');
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, SPRINT_PATH), [
    '# Sprint: task inbox staging', '', '> **Status**: Executing', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${TASK_CELL}`)} | [ ] | ${TASK_CELL} | contract | proves staging isolation | (pending) |`, '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  const taskId = fixtureTaskId(TASK_CELL);
  const taskRevision = deriveTaskRevision({ taskCell: TASK_CELL,
    taskId,
    modeCell: 'contract',
    acceptanceCell: 'proves staging isolation',
  });
  return { root, taskId, taskRevision, source: { targetRef: 'main', sprintPath: SPRINT_PATH } };
}

function event(value: Fixture, messageId: string) {
  return buildTaskMessageEvent({
    message_id: messageId,
    task_id: value.taskId,
    task_revision: value.taskRevision,
    scope: 'task',
    target_claim_id: null,
    target_generation: null,
    sender_kind: 'operator',
    sender_id: 'task-inbox-staging-test',
    sender_trust: 'local_operator',
    audience: 'user',
    body: `body for ${messageId}`,
    created_at: '2026-09-01T01:00:00.000Z',
    in_reply_to: null,
  });
}

function withFixtureAsync(run: (value: Fixture) => Promise<void>): Promise<void> {
  const value = fixture();
  return run(value).finally(() => rmSync(value.root, { recursive: true, force: true }));
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
    mock.module('fs', () => ({
      ...fs,
      [intercepted]: (...args) => {
        fs.writeFileSync(process.env.STAGING_MARKER, JSON.stringify(args));
        const wait = new Int32Array(new SharedArrayBuffer(4));
        Atomics.wait(wait, 0, 0);
      },
    }));
    const inbox = await import(process.env.TASK_INBOX_MODULE);
    const input = JSON.parse(process.env.STAGING_INPUT);
    if (operation === 'event') inbox.sendTaskMessage(input);
    else inbox.deliverTaskInbox(input);
  `;
  const input = operation === 'event'
    ? { repo_root: value.root, canonical_source: value.source, event: event(value, MESSAGE_ONE) }
    : {
      repo_root: value.root,
      task_id: value.taskId,
      canonical_source: value.source,
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
        canonical_source: value.source,
        recipient: RECIPIENT,
      }).entries).toEqual([]);

      expect(sendTaskMessage({
        repo_root: value.root,
        canonical_source: value.source,
        event: event(value, MESSAGE_ONE),
      }).created).toBe(true);
      expect(sendTaskMessage({
        repo_root: value.root,
        canonical_source: value.source,
        event: event(value, MESSAGE_TWO),
      }).created).toBe(true);
      expect(listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        canonical_source: value.source,
        recipient: RECIPIENT,
      }).entries.map((entry) => entry.event.message_id)).toEqual([MESSAGE_ONE, MESSAGE_TWO]);

      const unknownCanonical = join(taskDirectory, 'events', '.unknown.tmp');
      writeFileSync(unknownCanonical, 'not a canonical event\n');
      expectUnreadable(() => listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        canonical_source: value.source,
        recipient: RECIPIENT,
      }));
      unlinkSync(unknownCanonical);
    });
  }, 30_000);

  test('a receipt writer terminated before publication leaves only non-canonical staging and delivery can resume', async () => {
    await withFixtureAsync(async (value) => {
      sendTaskMessage({ repo_root: value.root, canonical_source: value.source, event: event(value, MESSAGE_ONE) });
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
        canonical_source: value.source,
        recipient: RECIPIENT,
      }).entries[0]?.receipt).toBeNull();
      expect(deliverTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        canonical_source: value.source,
        recipient: RECIPIENT,
        delivery_channel: 'manual',
        delivered_at: '2026-09-01T01:02:00.000Z',
      }).deliveries).toHaveLength(1);

      const unknownCanonical = join(taskDirectory, 'delivery', MESSAGE_ONE, '.unknown.tmp');
      writeFileSync(unknownCanonical, 'not a canonical receipt\n');
      expectUnreadable(() => listTaskInbox({
        repo_root: value.root,
        task_id: value.taskId,
        canonical_source: value.source,
        recipient: RECIPIENT,
      }));
      unlinkSync(unknownCanonical);
    });
  }, 30_000);
});
