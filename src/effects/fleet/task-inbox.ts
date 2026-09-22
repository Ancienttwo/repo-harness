import { closeSync, constants, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, opendirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeSync } from 'fs';
import { dirname, isAbsolute, join, relative } from 'path';
import { randomUUID } from 'crypto';

import {
  TASK_MESSAGE_BODY_MAX_BYTES,
  TASK_MESSAGE_HOOK_MAX_BYTES,
  TASK_MESSAGE_HOOK_MAX_MESSAGES,
  TaskMessageError,
  buildTaskMessageEvent,
  buildTaskMessageDeliveryReceipt,
  canonicalTaskMessageDeliveryReceiptBytes,
  canonicalTaskMessageEventBytes,
  deriveTaskMessageRecipientKey,
  renderTaskMessageUntrustedContext,
  transitionTaskMessageDeliveryReceipt,
  validateTaskMessageDeliveryReceipt,
  validateTaskMessageEvent,
  type TaskMessageDeliveryChannel,
  type TaskMessageDeliveryReceiptV1,
  type TaskMessageEventV1,
  type TaskMessageRecipient,
} from '../../core/fleet/task-message';
import { TASK_REPLY_RECORD_MAX_BYTES, buildTaskReplyIntent, buildTaskReplyCommit, canonicalTaskReplyIntentBytes, canonicalTaskReplyCommitBytes, validateTaskReplyIntent, validateTaskReplyCommit, assertTaskReplyRetry, assertTaskReplyResumeFence, inspectTaskReplyChain, TaskReplyError, type TaskReplyIntentV1, type TaskReplyCommitV1 } from '../../core/fleet/task-reply';
import type { ClaimActorReceiptV1, EngineerPrincipalMappingV1 } from '../../core/engineers/principal-claim';
import { lookupCanonicalTask, PENDING_ROW_STATUS, type CanonicalTask } from '../../core/state/coordination-identity';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readCanonicalSprint, resolveRepoIdentity, type CanonicalSprintSource } from '../state/coordination-canonical-source';
import { readClaimActorReceipt } from '../engineers/claim-actor-store';
import { readLease, withTaskLock, type LeaseRead } from '../state/coordination-lease-store';

export const TASK_INBOX_RELATIVE_PATH = 'repo-harness/task-inbox/v1';

export type TaskInboxErrorCode =
  | 'task_message_invalid'
  | 'task_message_unreadable'
  | 'message_id_conflict'
  | 'task_revision_mismatch'
  | 'canonical_source_stale'
  | 'task_not_pending'
  | 'task_unowned'
  | 'claim_mismatch'
  | 'recipient_unavailable'
  | 'task_message_transition_invalid';

export class TaskInboxError extends Error {
  constructor(readonly code: TaskInboxErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'TaskInboxError';
  }
}

export interface TaskInboxCanonicalSource extends CanonicalSprintSource {}

export interface SendTaskMessageInput {
  readonly repo_root: string;
  readonly canonical_source: TaskInboxCanonicalSource;
  readonly event: TaskMessageEventV1;
}

export interface SendTaskBoardMessageInput extends SendTaskMessageInput {
  /**
   * Runs the final publication inside the caller's registry authorization
   * lock, after re-proving that authority.
   *
   * The task lock stays outside it, so this send never holds the
   * machine-global registry lock while it waits up to the task-lock budget or
   * across canonical Git reads. Checking authorization and then publishing
   * outside that lock would leave a window where a revocation commits between
   * the check and the write, so the check and the write are one critical
   * section of the same lock a revocation must take.
   */
  readonly with_registry_authority: <T>(publish: () => T) => T;
}

export interface TaskInboxListInput {
  readonly repo_root: string;
  readonly task_id: string;
  readonly canonical_source: TaskInboxCanonicalSource;
  readonly recipient: TaskMessageRecipient;
  /** Required only for owner delivery/listing. It must be the bound worktree. */
  readonly execution_worktree?: string;
}

export interface DeliverTaskInboxInput extends TaskInboxListInput {
  readonly delivery_channel: TaskMessageDeliveryChannel;
  /** Required exactly when the delivery channel is one Agent Runtime effect's
   * Host action; it is the bounded control reference that later proves this
   * effect's delivery. Forbidden for human-facing channels. An effect
   * delivery marks exactly its own message and never the whole hook lane. */
  readonly delivery_ref?: string;
  readonly message_id?: string;
  readonly delivered_at: string;
}

export interface AcknowledgeTaskInboxInput extends TaskInboxListInput {
  readonly message_id: string;
  readonly acknowledged_at: string;
}

export interface SupersedeTaskInboxInput extends TaskInboxListInput {
  readonly message_id: string;
  /** A current owner that proves the frozen claim was replaced. */
  readonly successor: Extract<TaskMessageRecipient, { readonly kind: 'claim' }>;
  readonly successor_execution_worktree: string;
  readonly delivery_channel: TaskMessageDeliveryChannel;
}

export interface TaskInboxEventEntry {
  readonly event: TaskMessageEventV1;
  readonly receipt: TaskMessageDeliveryReceiptV1 | null;
  readonly globally_satisfied: boolean;
}

export interface TaskInboxListResult {
  readonly task_id: string;
  readonly entries: readonly TaskInboxEventEntry[];
  /** Audience-matching events skipped because their task revision is superseded. */
  readonly superseded_revision_count: number;
}

export interface TaskInboxDelivery {
  readonly event: TaskMessageEventV1;
  readonly receipt: TaskMessageDeliveryReceiptV1;
}

export interface TaskInboxDeliveryResult {
  readonly task_id: string;
  /** Only new deliveries. An already-delivered receipt is never rendered again. */
  readonly deliveries: readonly TaskInboxDelivery[];
  readonly superseded_count: number;
  readonly pending_count: number;
  readonly rendered_body_bytes: number;
}

export interface TaskInboxSendResult {
  readonly event: TaskMessageEventV1;
  readonly event_path: string;
  readonly created: boolean;
}

/**
 * The fleet board's deliberately narrow inbox projection.  It is not a
 * delivery API: it has no recipient worktree, does not take a task lock, and
 * cannot expose (or render) an untrusted message body.
 */
export interface TaskInboxFleetSummaryInput {
  readonly repo_root: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly current_claim: { readonly claim_id: string; readonly generation: number } | null;
}

export interface TaskInboxFleetSummaryV1 {
  readonly unread_count: number;
  readonly addressed_to_current_claim: boolean;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
}

function asInboxError(error: unknown, fallback: TaskInboxErrorCode, context: string): TaskInboxError {
  if (error instanceof TaskInboxError) return error;
  if (error instanceof TaskMessageError) return new TaskInboxError(error.code, error.message, error);
  return new TaskInboxError(fallback, context, error);
}

function fail(code: TaskInboxErrorCode, message: string, cause?: unknown): never {
  throw new TaskInboxError(code, message, cause);
}

/**
 * A rejection raised by a caller-supplied authority check. This module owns the
 * Task Inbox error vocabulary, not the caller's, so its reason crosses the lock
 * boundary unchanged instead of being flattened into `task_message_unreadable`.
 */
class TaskInboxAuthorityRejection extends Error {
  constructor(readonly reason: unknown) {
    super('the task inbox caller rejected its own authority before publication');
    this.name = 'TaskInboxAuthorityRejection';
  }
}

function withInboxTaskLock<T>(repoRoot: string, taskId: string, action: () => T): T {
  try {
    return withTaskLock(repoRoot, taskId, action);
  } catch (error) {
    if (error instanceof TaskInboxAuthorityRejection) throw error.reason;
    throw asInboxError(error, 'task_message_unreadable', `cannot operate task inbox under the task lock for ${taskId}`);
  }
}

function taskInboxRoot(repoRoot: string): string {
  return join(resolveGitCommonDirectory(repoRoot), TASK_INBOX_RELATIVE_PATH);
}

/** Crash residue is not a canonical record and must never enter strict scans. */
function taskInboxStagingDirectory(repoRoot: string, taskId: string, kind: 'events' | 'delivery'): string {
  return join(taskInboxTaskDirectory(repoRoot, taskId), 'staging', kind);
}

export function taskInboxTaskDirectory(repoRoot: string, taskId: string): string {
  assertTaskId(taskId);
  return join(taskInboxRoot(repoRoot), taskId);
}

export function taskInboxEventPath(repoRoot: string, taskId: string, messageId: string): string {
  assertTaskId(taskId);
  assertMessageId(messageId);
  return join(taskInboxTaskDirectory(repoRoot, taskId), 'events', `${messageId}.json`);
}

export function taskInboxDeliveryPath(
  repoRoot: string,
  taskId: string,
  messageId: string,
  recipient: TaskMessageRecipient,
): string {
  assertTaskId(taskId);
  assertMessageId(messageId);
  return join(taskInboxTaskDirectory(repoRoot, taskId), 'delivery', messageId, `${deriveTaskMessageRecipientKey(recipient)}.json`);
}

function assertTaskId(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) fail('task_message_invalid', `task id is invalid: ${JSON.stringify(value)}`);
}

function assertMessageId(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    fail('task_message_invalid', `message id is invalid: ${JSON.stringify(value)}`);
  }
}

function inboxPathSegments(commonDirectory: string, path: string): string[] {
  const rel = relative(commonDirectory, path);
  if (rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    fail('task_message_unreadable', `task inbox path escapes the git common directory: ${path}`);
  }
  return rel.split(/[\\/]/u).filter(Boolean);
}

/** Walk every component with lstat so an ancestor symlink cannot redirect inbox I/O. */
function inspectSafeDirectoryChain(commonDirectory: string, path: string, create: boolean, context: string): boolean {
  let current = commonDirectory;
  for (const segment of inboxPathSegments(commonDirectory, path)) {
    current = join(current, segment);
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw asInboxError(error, 'task_message_unreadable', `cannot inspect ${context}: ${current}`);
      }
      if (!create) return false;
      try {
        mkdirSync(current, { mode: 0o700 });
        stat = lstatSync(current);
      } catch (mkdirError) {
        throw asInboxError(mkdirError, 'task_message_unreadable', `cannot prepare ${context}: ${current}`);
      }
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('task_message_unreadable', `${context} is unsafe: ${current}`);
  }
  return true;
}

function assertRegular(path: string, context: string): void {
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot inspect ${context}: ${path}`);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('task_message_unreadable', `${context} is unsafe: ${path}`);
}

function readCanonicalFile(path: string, context: string): string {
  assertRegular(path, context);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot read ${context}: ${path}`);
  }
  if (!raw.endsWith('\n') || raw.slice(0, -1).includes('\n\n')) {
    fail('task_message_unreadable', `${context} does not have canonical record framing: ${path}`);
  }
  return raw.slice(0, -1);
}

function readEventAt(path: string): TaskMessageEventV1 {
  let event: TaskMessageEventV1;
  try {
    event = validateTaskMessageEvent(JSON.parse(readCanonicalFile(path, 'task message event')));
  } catch (error) {
    throw new TaskInboxError('task_message_unreadable', `task message event is malformed: ${path}`, error);
  }
  if (canonicalTaskMessageEventBytes(event) !== readCanonicalFile(path, 'task message event')) {
    fail('task_message_unreadable', `task message event is not canonical: ${path}`);
  }
  return event;
}

function readReceiptAt(path: string): TaskMessageDeliveryReceiptV1 {
  let receipt: TaskMessageDeliveryReceiptV1;
  try {
    receipt = validateTaskMessageDeliveryReceipt(JSON.parse(readCanonicalFile(path, 'task message delivery receipt')));
  } catch (error) {
    throw new TaskInboxError('task_message_unreadable', `task message delivery receipt is malformed: ${path}`, error);
  }
  if (canonicalTaskMessageDeliveryReceiptBytes(receipt) !== readCanonicalFile(path, 'task message delivery receipt')) {
    fail('task_message_unreadable', `task message delivery receipt is not canonical: ${path}`);
  }
  return receipt;
}

function readOptionalReceipt(
  repoRoot: string,
  taskId: string,
  messageId: string,
  recipient: TaskMessageRecipient,
): TaskMessageDeliveryReceiptV1 | null {
  const path = taskInboxDeliveryPath(repoRoot, taskId, messageId, recipient);
  if (!existsSync(path)) return null;
  const receipt = readReceiptAt(path);
  if (receipt.message_id !== messageId || deriveTaskMessageRecipientKey(recipientFromReceipt(receipt)) !== deriveTaskMessageRecipientKey(recipient)) {
    fail('task_message_unreadable', `task message delivery receipt identity is mismatched: ${path}`);
  }
  return receipt;
}

function recipientFromReceipt(receipt: TaskMessageDeliveryReceiptV1): TaskMessageRecipient {
  if (receipt.recipient_kind === 'claim') {
    if (receipt.recipient_claim_id === null || receipt.recipient_generation === null) {
      fail('task_message_unreadable', 'claim receipt has no claim identity');
    }
    return { kind: 'claim', claim_id: receipt.recipient_claim_id, generation: receipt.recipient_generation };
  }
  return { kind: receipt.recipient_kind, id: receipt.recipient_id };
}

function listEvents(repoRoot: string, taskId: string): TaskMessageEventV1[] {
  const directory = join(taskInboxTaskDirectory(repoRoot, taskId), 'events');
  if (!inspectSafeDirectoryChain(resolveGitCommonDirectory(repoRoot), directory, false, 'task message event directory')) return [];
  let stat;
  try {
    stat = lstatSync(directory);
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot inspect task message event directory: ${directory}`);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('task_message_unreadable', `task message event directory is unsafe: ${directory}`);
  let names: string[];
  try {
    names = readdirSync(directory).sort();
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot list task message events: ${directory}`);
  }
  const events: TaskMessageEventV1[] = [];
  for (const name of names) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/iu.test(name)) {
      fail('task_message_unreadable', `task message event filename is invalid: ${name}`);
    }
    const event = readEventAt(join(directory, name));
    if (`${event.message_id}.json` !== name || event.task_id !== taskId) {
      fail('task_message_unreadable', `task message event path identity is mismatched: ${name}`);
    }
    events.push(event);
  }
  return events.sort((left, right) => (left.created_at < right.created_at ? -1 : left.created_at > right.created_at ? 1
    : left.message_id < right.message_id ? -1 : left.message_id > right.message_id ? 1 : 0));
}

function listReceipts(repoRoot: string, taskId: string, messageId: string): TaskMessageDeliveryReceiptV1[] {
  const directory = join(taskInboxTaskDirectory(repoRoot, taskId), 'delivery', messageId);
  if (!inspectSafeDirectoryChain(resolveGitCommonDirectory(repoRoot), directory, false, 'task message delivery directory')) return [];
  let stat;
  try {
    stat = lstatSync(directory);
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot inspect task message delivery directory: ${directory}`);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('task_message_unreadable', `task message delivery directory is unsafe: ${directory}`);
  let names: string[];
  try {
    names = readdirSync(directory).sort();
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot list task message receipts: ${directory}`);
  }
  return names.map((name) => {
    if (!name.endsWith('.json')) fail('task_message_unreadable', `task message delivery filename is invalid: ${name}`);
    const receipt = readReceiptAt(join(directory, name));
    if (receipt.message_id !== messageId || `${deriveTaskMessageRecipientKey(recipientFromReceipt(receipt))}.json` !== name) {
      fail('task_message_unreadable', `task message delivery path identity is mismatched: ${name}`);
    }
    return receipt;
  });
}

function canonicalTask(
  repoRoot: string,
  source: TaskInboxCanonicalSource,
  taskId: string,
  expectedRevision: string,
): CanonicalTask {
  const canonical = readCanonicalSprint(repoRoot, source);
  if (!canonical.ok) fail('task_message_invalid', canonical.error);
  const task = lookupCanonicalTask({
    repoIdentity: resolveRepoIdentity(repoRoot),
    sprintPath: source.sprintPath,
    sprintText: canonical.text,
  }, taskId);
  if (!task.ok) fail('task_message_invalid', task.error);
  if (task.task.task_revision !== expectedRevision) {
    fail('task_revision_mismatch', `canonical task revision does not match task inbox event for ${taskId}`);
  }
  return task.task;
}

/**
 * The request's source is intentionally captured before the task lock so the
 * operator can receive a typed stale-snapshot response. The active marker and
 * policy target are re-read here, under that lock, to make this comparison the
 * source-authority linearization point for publication.
 */
function assertCanonicalSourceIsActive(repoRoot: string, source: TaskInboxCanonicalSource): void {
  let sprintPath: string | null;
  let targetRef: string;
  try {
    sprintPath = readActiveSprintPath(repoRoot);
    targetRef = readCanonicalTargetRef(repoRoot);
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', 'cannot re-read active task board authority');
  }
  if (sprintPath !== source.sprintPath || targetRef !== source.targetRef) {
    fail('canonical_source_stale', 'the active task board authority changed since the message was opened');
  }
}

function assertLeaseCanonicalSource(lease: LeaseRead, source: TaskInboxCanonicalSource, taskId: string, expectedRevision: string): NonNullable<LeaseRead['record']> {
  if (lease.record === null) fail('task_unowned', `task ${taskId} has no owner`);
  if (lease.record.task_revision !== expectedRevision) fail('task_revision_mismatch', `lease revision does not match task inbox event for ${taskId}`);
  if (lease.record.target_ref !== source.targetRef || lease.record.sprint_path !== source.sprintPath) {
    fail('claim_mismatch', `lease canonical source does not match task inbox source for ${taskId}`);
  }
  return lease.record;
}

function assertCurrentOwner(
  repoRoot: string,
  source: TaskInboxCanonicalSource,
  taskId: string,
  recipient: Extract<TaskMessageRecipient, { readonly kind: 'claim' }>,
  executionWorktree: string | undefined,
): NonNullable<LeaseRead['record']> {
  const lease = readLease(repoRoot, taskId);
  if (lease.record === null) fail('task_unowned', `task ${taskId} has no owner`);
  canonicalTask(repoRoot, source, taskId, lease.record.task_revision);
  const record = assertLeaseCanonicalSource(lease, source, taskId, lease.record.task_revision);
  if (record.state !== 'bound') fail('recipient_unavailable', `task ${taskId} owner is ${record.state}, not bound`);
  if (record.claim_id !== recipient.claim_id || record.generation !== recipient.generation) {
    fail('claim_mismatch', `task ${taskId} owner does not match recipient claim`);
  }
  if (!executionWorktree || record.execution_worktree === null) fail('recipient_unavailable', `task ${taskId} has no execution worktree`);
  let resolvedWorktree: string;
  try {
    resolvedWorktree = realpathSync(executionWorktree);
  } catch (error) {
    throw asInboxError(error, 'recipient_unavailable', `cannot resolve recipient execution worktree: ${executionWorktree}`);
  }
  if (record.execution_worktree !== resolvedWorktree) {
    fail('recipient_unavailable', `task ${taskId} is not bound to recipient execution worktree`);
  }
  return record;
}

function audienceMatches(event: TaskMessageEventV1, recipient: TaskMessageRecipient): boolean {
  return event.audience === (recipient.kind === 'claim' ? 'owner' : recipient.kind);
}

function recipientTaskRevision(input: TaskInboxListInput): string {
  if (input.recipient.kind === 'claim') {
    return assertCurrentOwner(
      input.repo_root,
      input.canonical_source,
      input.task_id,
      input.recipient,
      input.execution_worktree,
    ).task_revision;
  }
  const canonical = readCanonicalSprint(input.repo_root, input.canonical_source);
  if (!canonical.ok) fail('task_message_invalid', canonical.error);
  const task = lookupCanonicalTask({
    repoIdentity: resolveRepoIdentity(input.repo_root),
    sprintPath: input.canonical_source.sprintPath,
    sprintText: canonical.text,
  }, input.task_id);
  if (!task.ok) fail('task_message_invalid', task.error);
  return task.task.task_revision;
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function fsyncDirectory(path: string): void {
  const fd = openSync(path, constants.O_RDONLY);
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function ensureInboxDirectories(repoRoot: string, taskId: string, messageId?: string): void {
  const commonDirectory = resolveGitCommonDirectory(repoRoot);
  const root = taskInboxRoot(repoRoot);
  inspectSafeDirectoryChain(commonDirectory, root, true, 'task inbox root');
  const taskDirectory = taskInboxTaskDirectory(repoRoot, taskId);
  inspectSafeDirectoryChain(commonDirectory, taskDirectory, true, 'task inbox task directory');
  inspectSafeDirectoryChain(commonDirectory, join(taskDirectory, 'events'), true, 'task inbox event directory');
  inspectSafeDirectoryChain(commonDirectory, taskInboxStagingDirectory(repoRoot, taskId, 'events'), true, 'task inbox event staging directory');
  if (messageId) {
    inspectSafeDirectoryChain(commonDirectory, join(taskDirectory, 'delivery'), true, 'task inbox delivery root');
    inspectSafeDirectoryChain(commonDirectory, join(taskDirectory, 'delivery', messageId), true, 'task inbox delivery directory');
    inspectSafeDirectoryChain(commonDirectory, taskInboxStagingDirectory(repoRoot, taskId, 'delivery'), true, 'task inbox delivery staging directory');
  }
}

function writeImmutableEvent(repoRoot: string, event: TaskMessageEventV1, beforePublish?: () => void): TaskInboxSendResult {
  ensureInboxDirectories(repoRoot, event.task_id);
  const target = taskInboxEventPath(repoRoot, event.task_id, event.message_id);
  const canonical = canonicalTaskMessageEventBytes(event);
  if (existsSync(target)) {
    const existing = readEventAt(target);
    if (!sameEventRetry(existing, event)) {
      fail('message_id_conflict', `task message id ${event.message_id} conflicts with existing immutable event`);
    }
    return { event: existing, event_path: target, created: false };
  }
  const directory = dirname(target);
  const temporary = join(
    taskInboxStagingDirectory(repoRoot, event.task_id, 'events'),
    `.${event.message_id}.${process.pid}.${randomUUID()}.tmp`,
  );
  const bytes = Buffer.from(`${canonical}\n`, 'utf-8');
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot persist task message event: ${target}`);
  } finally {
    if (fd !== null) closeSync(fd);
  }
  try {
    beforePublish?.();
    try {
      linkSync(temporary, target);
      fsyncDirectory(directory);
      return { event, event_path: target, created: true };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const existing = readEventAt(target);
        if (!sameEventRetry(existing, event)) {
          fail('message_id_conflict', `task message id ${event.message_id} conflicts with existing immutable event`);
        }
        return { event: existing, event_path: target, created: false };
      }
      throw asInboxError(error, 'task_message_unreadable', `cannot publish task message event: ${target}`);
    }
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw asInboxError(error, 'task_message_unreadable', `cannot clean task message temporary: ${temporary}`);
    }
  }
}

/**
 * A caller cannot know the first write's timestamp when retrying after a
 * crash. It is therefore the sole immutable field sourced from the incumbent;
 * every other field, including both byte digests, must still agree exactly.
 */
function sameEventRetry(existing: TaskMessageEventV1, candidate: TaskMessageEventV1): boolean {
  const rebased = buildTaskMessageEvent({
    message_id: candidate.message_id,
    task_id: candidate.task_id,
    task_revision: candidate.task_revision,
    scope: candidate.scope,
    target_claim_id: candidate.target_claim_id,
    target_generation: candidate.target_generation,
    sender_kind: candidate.sender_kind,
    sender_id: candidate.sender_id,
    sender_trust: candidate.sender_trust,
    audience: candidate.audience,
    body: candidate.body,
    created_at: existing.created_at,
    in_reply_to: candidate.in_reply_to,
  });
  return canonicalTaskMessageEventBytes(existing) === canonicalTaskMessageEventBytes(rebased);
}

function writeReceipt(repoRoot: string, taskId: string, receipt: TaskMessageDeliveryReceiptV1, beforePublish?: () => void): TaskMessageDeliveryReceiptV1 {
  const recipient = recipientFromReceipt(receipt);
  ensureInboxDirectories(repoRoot, taskId, receipt.message_id);
  const target = taskInboxDeliveryPath(repoRoot, taskId, receipt.message_id, recipient);
  if (existsSync(target)) readReceiptAt(target);
  const canonical = canonicalTaskMessageDeliveryReceiptBytes(receipt);
  const directory = dirname(target);
  const temporary = join(
    taskInboxStagingDirectory(repoRoot, taskId, 'delivery'),
    `.${receipt.message_id}.${deriveTaskMessageRecipientKey(recipient)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const bytes = Buffer.from(`${canonical}\n`, 'utf-8');
  let fd: number | null = null;
  try {
    try {
      fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      writeAll(fd, bytes);
      fsyncSync(fd);
      closeSync(fd);
      fd = null;
    } catch (error) {
      throw asInboxError(error, 'task_message_unreadable', `cannot stage task message delivery receipt: ${target}`);
    }
    beforePublish?.();
    try {
      renameSync(temporary, target);
      fsyncDirectory(directory);
    } catch (error) {
      throw asInboxError(error, 'task_message_unreadable', `cannot persist task message delivery receipt: ${target}`);
    }
  } finally {
    if (fd !== null) closeSync(fd);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw asInboxError(error, 'task_message_unreadable', `cannot clean task message receipt temporary: ${temporary}`);
    }
  }
  return receipt;
}

function assertEventStored(event: TaskMessageEventV1, taskId: string): void {
  if (event.task_id !== taskId) fail('task_message_unreadable', `task message event ${event.message_id} is in the wrong task directory`);
  if (Buffer.byteLength(event.body, 'utf-8') > TASK_MESSAGE_BODY_MAX_BYTES) fail('task_message_unreadable', `task message event ${event.message_id} body exceeds its limit`);
}

/** Fails closed where the caller names one exact event and revision. */
function assertEventCanonical(event: TaskMessageEventV1, taskId: string, revision: string): void {
  assertEventStored(event, taskId);
  if (event.task_revision !== revision) fail('task_revision_mismatch', `task message event ${event.message_id} revision is stale`);
}

/**
 * A scan reads every stored event of one task. Editing the sprint row's Task,
 * Mode, or Acceptance cell drifts `task_revision`, so an event written before
 * that edit is no longer addressed to the canonical task: it is skipped, and
 * is neither listed, delivered, nor counted. Aborting the whole scan instead
 * let one superseded event hide the entire inbox permanently -- and, through
 * the fleet card's inbox observation, the entire repository.
 */
function isCurrentRevisionEvent(event: TaskMessageEventV1, taskId: string, revision: string): boolean {
  assertEventStored(event, taskId);
  return event.task_revision === revision;
}

function isGloballySatisfied(repoRoot: string, taskId: string, event: TaskMessageEventV1): boolean {
  if (event.scope !== 'task') return false;
  return listReceipts(repoRoot, taskId, event.message_id).some((receipt) => receipt.delivery_state === 'acknowledged');
}

function receiptFor(
  repoRoot: string,
  taskId: string,
  event: TaskMessageEventV1,
  recipient: TaskMessageRecipient,
  channel: TaskMessageDeliveryChannel,
): TaskMessageDeliveryReceiptV1 {
  return readOptionalReceipt(repoRoot, taskId, event.message_id, recipient)
    ?? buildTaskMessageDeliveryReceipt({
      message_id: event.message_id,
      recipient,
      task_revision: event.task_revision,
      delivery_channel: channel,
    });
}

interface TaskInboxFleetObservation {
  readonly unread_count: number;
  readonly addressed_to_current_claim: boolean;
  readonly revision: string;
}

/**
 * Validate one immutable inbox observation without acquiring a task lock.
 * Event canonicalization necessarily checks the stored record, but no event
 * object escapes this function and no body is rendered or copied into the
 * result.  The digest fences both events and mutable receipt facts so the
 * caller can honestly report a torn observation rather than patching states.
 */
function observeTaskInboxFleetSummary(input: TaskInboxFleetSummaryInput): TaskInboxFleetObservation {
  assertTaskId(input.task_id);
  if (!/^[0-9a-f]{64}$/u.test(input.task_revision)) {
    fail('task_revision_mismatch', `task revision is invalid for ${input.task_id}`);
  }
  const events = listEvents(input.repo_root, input.task_id);
  const revisionParts: string[] = [];
  let unreadCount = 0;
  for (const event of events) {
    if (!isCurrentRevisionEvent(event, input.task_id, input.task_revision)) continue;
    revisionParts.push(canonicalTaskMessageEventBytes(event));
    const receipts = listReceipts(input.repo_root, input.task_id, event.message_id);
    for (const receipt of receipts) revisionParts.push(canonicalTaskMessageDeliveryReceiptBytes(receipt));
    if (event.audience !== 'owner' || input.current_claim === null) continue;
    if (event.scope === 'claim' && (event.target_claim_id !== input.current_claim.claim_id
      || event.target_generation !== input.current_claim.generation)) continue;
    if (event.scope === 'task' && receipts.some((receipt) => receipt.delivery_state === 'acknowledged')) continue;
    const recipient: TaskMessageRecipient = {
      kind: 'claim', claim_id: input.current_claim.claim_id, generation: input.current_claim.generation,
    };
    const receipt = readOptionalReceipt(input.repo_root, input.task_id, event.message_id, recipient);
    if (receipt?.delivery_state === 'acknowledged' || receipt?.delivery_state === 'superseded') continue;
    unreadCount += 1;
  }
  return Object.freeze({
    unread_count: unreadCount,
    addressed_to_current_claim: unreadCount > 0,
    revision: JSON.stringify(revisionParts),
  });
}

/**
 * Lock-free A/B summary for fleet projection.  A writer may race either the
 * immutable event list or delivery receipts; retrying the whole read once
 * keeps output bounded and never manufactures a mixed generation.
 */
export function summarizeTaskInboxForFleet(input: TaskInboxFleetSummaryInput): TaskInboxFleetSummaryV1 {
  const first = observeTaskInboxFleetSummary(input);
  const second = observeTaskInboxFleetSummary(input);
  if (first.revision === second.revision) {
    return Object.freeze({
      unread_count: first.unread_count,
      addressed_to_current_claim: first.addressed_to_current_claim,
      snapshot_consistency: 'stable',
    });
  }
  const retryBefore = observeTaskInboxFleetSummary(input);
  const retryAfter = observeTaskInboxFleetSummary(input);
  return Object.freeze({
    unread_count: retryBefore.unread_count,
    addressed_to_current_claim: retryBefore.addressed_to_current_claim,
    snapshot_consistency: retryBefore.revision === retryAfter.revision ? 'stable' : 'changed_during_read',
  });
}

function sendTaskMessageWithAuthority(
  input: SendTaskMessageInput,
  requireActiveTaskBoardAuthority: boolean,
  withRegistryAuthority: (<T>(publish: () => T) => T) | null,
): TaskInboxSendResult {
  let event: TaskMessageEventV1;
  try {
    event = validateTaskMessageEvent(input.event);
  } catch (error) {
    throw asInboxError(error, 'task_message_invalid', 'task message event is invalid');
  }
  const publish = (): TaskInboxSendResult => {
    if (withRegistryAuthority === null) return writeImmutableEvent(input.repo_root, event);
    let authorized = false;
    try {
      return withRegistryAuthority(() => {
        authorized = true;
        return writeImmutableEvent(input.repo_root, event);
      });
    } catch (error) {
      // Only the caller's own authority rejection crosses this module's error
      // vocabulary unchanged; a failure of the write itself is ours.
      if (authorized) throw error;
      throw new TaskInboxAuthorityRejection(error);
    }
  };
  return withInboxTaskLock(input.repo_root, event.task_id, () => {
    if (requireActiveTaskBoardAuthority) {
      assertCanonicalSourceIsActive(input.repo_root, input.canonical_source);
    }
    const task = canonicalTask(input.repo_root, input.canonical_source, event.task_id, event.task_revision);
    if (requireActiveTaskBoardAuthority && task.row.status !== PENDING_ROW_STATUS) {
      fail('task_not_pending', `task ${event.task_id} no longer accepts messages because its status is ${task.row.status}`);
    }
    if (event.scope === 'claim') {
      const record = assertLeaseCanonicalSource(readLease(input.repo_root, event.task_id), input.canonical_source, event.task_id, event.task_revision);
      if (record.state !== 'bound') fail('recipient_unavailable', `task ${event.task_id} owner is ${record.state}, not bound`);
      if (record.claim_id !== event.target_claim_id || record.generation !== event.target_generation) {
        fail('claim_mismatch', `task ${event.task_id} claim scope does not match current owner`);
      }
    }
    return publish();
  });
}

/**
 * Persist a producer-authorized immutable event after canonical task
 * resolution. Claim-scoped sends additionally freeze the current bound
 * claim/generation under lock.
 */
export function sendTaskMessage(input: SendTaskMessageInput): TaskInboxSendResult {
  return sendTaskMessageWithAuthority(input, false, null);
}

/**
 * Task Board's only write. Its captured source and pending-row authority are
 * both revalidated under the task lock immediately before publication.
 */
export function sendTaskBoardMessage(input: SendTaskBoardMessageInput): TaskInboxSendResult {
  return sendTaskMessageWithAuthority(input, true, input.with_registry_authority);
}

/** Read-only projection for a canonical recipient. It never marks delivery. */
export function listTaskInbox(input: TaskInboxListInput): TaskInboxListResult {
  assertTaskId(input.task_id);
  return withInboxTaskLock(input.repo_root, input.task_id, () => {
    const expectedRevision = recipientTaskRevision(input);
    let supersededRevisionCount = 0;
    const entries = listEvents(input.repo_root, input.task_id)
      .filter((event) => audienceMatches(event, input.recipient))
      .map((event) => {
        if (!isCurrentRevisionEvent(event, input.task_id, expectedRevision)) {
          supersededRevisionCount += 1;
          return null;
        }
        if (event.scope === 'claim' && (input.recipient.kind !== 'claim'
          || event.target_claim_id !== input.recipient.claim_id
          || event.target_generation !== input.recipient.generation)) return null;
        return {
          event,
          receipt: readOptionalReceipt(input.repo_root, input.task_id, event.message_id, input.recipient),
          globally_satisfied: isGloballySatisfied(input.repo_root, input.task_id, event),
        } satisfies TaskInboxEventEntry;
      })
      .filter((entry): entry is TaskInboxEventEntry => entry !== null);
    return { task_id: input.task_id, entries, superseded_revision_count: supersededRevisionCount };
  });
}

/** Read one exact Task message/recipient receipt pair for runtime correlation.
 * This adds no delivery transition and preserves Task Inbox as the authority. */
export function readTaskMessageDelivery(input: {
  readonly repo_root: string;
  readonly task_id: string;
  readonly message_id: string;
  readonly recipient: TaskMessageRecipient;
}): TaskInboxEventEntry {
  const event = readEventAt(taskInboxEventPath(input.repo_root, input.task_id, input.message_id));
  if (event.task_id !== input.task_id || event.message_id !== input.message_id) {
    fail('task_message_invalid', 'message does not belong to the requested Task inbox');
  }
  const receipt = readOptionalReceipt(input.repo_root, input.task_id, input.message_id, input.recipient);
  return Object.freeze({
    event,
    receipt,
    globally_satisfied: receipt?.delivery_state === 'acknowledged',
  });
}

/**
 * Fence the recipient, supersede stale claim messages, and durably mark
 * eligible events delivered before returning them. Hook delivery is bounded;
 * a controlled manual listing is the delivery boundary for all matching rows.
 */
export function deliverTaskInbox(input: DeliverTaskInboxInput): TaskInboxDeliveryResult {
  const recipient = input.recipient;
  assertTaskId(input.task_id);
  if (input.delivery_channel === 'agent_runtime_effect') {
    if (input.delivery_ref === undefined || input.delivery_ref.length === 0) {
      fail('task_message_invalid', 'agent_runtime_effect delivery requires its bounded control reference');
    }
    if (input.message_id === undefined) {
      fail('task_message_invalid', 'agent_runtime_effect delivery requires its exact message_id');
    }
  } else if (input.delivery_ref !== undefined || input.message_id !== undefined) {
    fail('task_message_invalid', 'only agent_runtime_effect delivery carries a bounded control reference');
  }
  if (input.delivery_channel !== 'agent_runtime_effect' && input.delivery_ref !== undefined) {
    fail('task_message_invalid', 'only agent_runtime_effect delivery carries a bounded control reference');
  }
  return withInboxTaskLock(input.repo_root, input.task_id, () => {
    const expectedRevision = recipientTaskRevision(input);
    const deliveries: TaskInboxDelivery[] = [];
    let supersededCount = 0;
    let pendingCount = 0;
    let renderedBodyBytes = 0;
    for (const event of listEvents(input.repo_root, input.task_id)) {
      if (!isCurrentRevisionEvent(event, input.task_id, expectedRevision)) continue;
      if (!audienceMatches(event, recipient)) continue;
      if (event.scope === 'claim' && recipient.kind === 'claim'
        && (event.target_claim_id !== recipient.claim_id || event.target_generation !== recipient.generation)) {
        const frozenRecipient: TaskMessageRecipient = {
          kind: 'claim', claim_id: event.target_claim_id!, generation: event.target_generation!,
        };
        const prior = receiptFor(input.repo_root, input.task_id, event, frozenRecipient, input.delivery_channel);
        if (prior.delivery_state === 'acknowledged') continue;
        const next = transitionTaskMessageDeliveryReceipt(prior, { state: 'superseded' });
        if (canonicalTaskMessageDeliveryReceiptBytes(prior) !== canonicalTaskMessageDeliveryReceiptBytes(next)) {
          writeReceipt(input.repo_root, input.task_id, next);
          supersededCount += 1;
        }
        continue;
      }
      if (isGloballySatisfied(input.repo_root, input.task_id, event)) continue;
      if (input.delivery_channel === 'agent_runtime_effect' && event.message_id !== input.message_id) continue;
      const prior = receiptFor(input.repo_root, input.task_id, event, recipient, input.delivery_channel);
      if (prior.delivery_state === 'acknowledged' || prior.delivery_state === 'superseded' || prior.delivery_state === 'delivered') continue;
      const bodyBytes = Buffer.byteLength(event.body, 'utf-8');
      const candidateEvents = [...deliveries.map((delivery) => delivery.event), event];
      const renderedBytes = Buffer.byteLength(renderTaskMessageUntrustedContext(candidateEvents), 'utf-8');
      if (input.delivery_channel === 'hook_session'
        && (deliveries.length >= TASK_MESSAGE_HOOK_MAX_MESSAGES || renderedBytes > TASK_MESSAGE_HOOK_MAX_BYTES)) {
        pendingCount += 1;
        continue;
      }
      const delivered = transitionTaskMessageDeliveryReceipt(prior, input.delivery_channel === 'agent_runtime_effect'
        ? { state: 'delivered', at: input.delivered_at, delivery_ref: input.delivery_ref }
        : { state: 'delivered', at: input.delivered_at, delivery_channel: input.delivery_channel });
      writeReceipt(input.repo_root, input.task_id, delivered);
      deliveries.push({ event, receipt: delivered });
      renderedBodyBytes += bodyBytes;
    }
    return {
      task_id: input.task_id,
      deliveries,
      superseded_count: supersededCount,
      pending_count: pendingCount,
      rendered_body_bytes: renderedBodyBytes,
    };
  });
}

/** Acknowledge a delivered message; a task-scoped acknowledgement globally satisfies it. */
export function acknowledgeTaskInbox(input: AcknowledgeTaskInboxInput): TaskMessageDeliveryReceiptV1 {
  assertTaskId(input.task_id);
  assertMessageId(input.message_id);
  return withInboxTaskLock(input.repo_root, input.task_id, () => {
    const expectedRevision = recipientTaskRevision(input);
    const event = readEventAt(taskInboxEventPath(input.repo_root, input.task_id, input.message_id));
    assertEventCanonical(event, input.task_id, expectedRevision);
    if (!audienceMatches(event, input.recipient)) fail('recipient_unavailable', 'message audience does not match recipient');
    if (event.scope === 'claim' && (input.recipient.kind !== 'claim'
      || event.target_claim_id !== input.recipient.claim_id
      || event.target_generation !== input.recipient.generation)) {
      fail('claim_mismatch', 'claim-scoped message does not match recipient');
    }
    const receipt = readOptionalReceipt(input.repo_root, input.task_id, input.message_id, input.recipient);
    if (receipt === null) fail('recipient_unavailable', 'message has not been delivered to recipient');
    const acknowledged = transitionTaskMessageDeliveryReceipt(receipt, { state: 'acknowledged', at: input.acknowledged_at });
    if (canonicalTaskMessageDeliveryReceiptBytes(receipt) !== canonicalTaskMessageDeliveryReceiptBytes(acknowledged)) {
      writeReceipt(input.repo_root, input.task_id, acknowledged);
    }
    return acknowledged;
  });
}

/** CLI-facing spelling retained at the effect boundary. */
export const ackTaskInbox = acknowledgeTaskInbox;

/** Explicit successor-fenced supersession for a stale claim-scoped event. */
export function supersedeTaskInbox(input: SupersedeTaskInboxInput): TaskMessageDeliveryReceiptV1 {
  assertTaskId(input.task_id);
  assertMessageId(input.message_id);
  return withInboxTaskLock(input.repo_root, input.task_id, () => {
    const current = assertCurrentOwner(
      input.repo_root,
      input.canonical_source,
      input.task_id,
      input.successor,
      input.successor_execution_worktree,
    );
    const event = readEventAt(taskInboxEventPath(input.repo_root, input.task_id, input.message_id));
    assertEventCanonical(event, input.task_id, current.task_revision);
    if (event.scope !== 'claim') fail('claim_mismatch', 'only claim-scoped messages can be superseded');
    if (event.target_claim_id === current.claim_id && event.target_generation === current.generation) {
      fail('claim_mismatch', 'current owner cannot supersede its own claim-scoped message');
    }
    const frozenRecipient: TaskMessageRecipient = { kind: 'claim', claim_id: event.target_claim_id!, generation: event.target_generation! };
    const receipt = receiptFor(input.repo_root, input.task_id, event, frozenRecipient, input.delivery_channel);
    const superseded = transitionTaskMessageDeliveryReceipt(receipt, { state: 'superseded' });
    if (canonicalTaskMessageDeliveryReceiptBytes(receipt) !== canonicalTaskMessageDeliveryReceiptBytes(superseded)) {
      writeReceipt(input.repo_root, input.task_id, superseded);
    }
    return superseded;
  });
}

export class TaskReplyStoreError extends Error {
  readonly code = 'task_reply_inconsistent';
}
function replyInconsistent(message: string): never { throw new TaskReplyStoreError(message); }

export interface TaskInboxReplyAuthority {
  readonly mapping: EngineerPrincipalMappingV1;
  readonly actor: ClaimActorReceiptV1;
  /** Re-read the exact request authorization and all current fences; no async gap. */
  readonly revalidate: () => void;
}

export interface RestrictedTaskInboxInput extends TaskInboxListInput {
  readonly recipient: Extract<TaskMessageRecipient, { kind: 'claim' }>;
  /** The Engineer composition owner holds Binding outside Task, then mapping and registry inside Task. */
  readonly with_authority: <T>(action: (authority: TaskInboxReplyAuthority) => T) => T;
}

function withRestrictedInbox<T>(input: RestrictedTaskInboxInput, action: (authority: TaskInboxReplyAuthority) => T): T {
  assertTaskId(input.task_id);
  return withTaskLock(input.repo_root, input.task_id, () => input.with_authority((authority) => {
    const revision = recipientTaskRevision(input);
    if (authority.actor.task_id !== input.task_id || authority.actor.task_revision !== revision
      || authority.actor.claim_id !== input.recipient.claim_id || authority.actor.lease_generation !== input.recipient.generation) {
      throw new TaskReplyError('task_reply_fence_changed', 'authenticated actor differs from the current inbox recipient');
    }
    return action(authority);
  }));
}

function isOriginalSteer(event: TaskMessageEventV1): boolean {
  return event.audience === 'owner' && event.in_reply_to === null && event.sender_trust === 'local_operator'
    && (event.sender_kind === 'user' || event.sender_kind === 'operator');
}

function restrictedParent(input: RestrictedTaskInboxInput, messageId: string, eventDigest: string): TaskMessageEventV1 {
  const event = readEventAt(taskInboxEventPath(input.repo_root, input.task_id, messageId));
  assertEventCanonical(event, input.task_id, recipientTaskRevision(input));
  if (event.message_id !== messageId) fail('task_message_unreadable', 'steer path identity is mismatched');
  if (!isOriginalSteer(event) || event.event_digest !== eventDigest) fail('task_message_invalid', 'exact original human steer is required');
  if (event.scope === 'claim' && (event.target_claim_id !== input.recipient.claim_id || event.target_generation !== input.recipient.generation)) {
    fail('claim_mismatch', 'steer belongs to a different claim recipient');
  }
  return event;
}

/** Explicit authenticated pull. Existing hook/effect delivery facts are never relabelled. */
export function consumeTaskSteer(input: RestrictedTaskInboxInput & { message_id: string; event_digest: string; now: string }) {
  return withRestrictedInbox(input, (authority) => {
    const event = restrictedParent(input, input.message_id, input.event_digest);
    const prior = readOptionalReceipt(input.repo_root, input.task_id, event.message_id, input.recipient);
    if (prior?.delivery_state === 'superseded') fail('recipient_unavailable', 'recipient was superseded');
    if (prior?.delivery_state === 'delivered' || prior?.delivery_state === 'acknowledged') {
      return { event, receipt: prior, context: renderTaskMessageUntrustedContext([event]) };
    }
    if (isGloballySatisfied(input.repo_root, input.task_id, event)) fail('recipient_unavailable', 'an earlier recipient acknowledged this steer; explicit handoff is required');
    authority.revalidate();
    const receipt = transitionTaskMessageDeliveryReceipt(prior ?? receiptFor(input.repo_root, input.task_id, event, input.recipient, 'manual'),
      { state: 'delivered', at: input.now, delivery_channel: 'manual' });
    writeReceipt(input.repo_root, input.task_id, receipt, authority.revalidate);
    return { event, receipt, context: renderTaskMessageUntrustedContext([event]) };
  });
}

export function acknowledgeTaskSteer(input: RestrictedTaskInboxInput & { message_id: string; event_digest: string; now: string }) {
  return withRestrictedInbox(input, (authority) => {
    const event = restrictedParent(input, input.message_id, input.event_digest);
    const prior = readOptionalReceipt(input.repo_root, input.task_id, event.message_id, input.recipient);
    if (!prior) fail('recipient_unavailable', 'steer has not been delivered to this recipient');
    const receipt = transitionTaskMessageDeliveryReceipt(prior, { state: 'acknowledged', at: input.now });
    authority.revalidate();
    if (canonicalTaskMessageDeliveryReceiptBytes(prior) !== canonicalTaskMessageDeliveryReceiptBytes(receipt)) writeReceipt(input.repo_root, input.task_id, receipt, authority.revalidate);
    return receipt;
  });
}

export type TaskReplyWriteBoundary = 'intent_file_fsynced' | 'intent_published' | 'event_published' | 'commit_file_fsynced' | 'commit_published';

function replyDirectory(repoRoot: string, taskId: string, parentId: string, recipient: TaskMessageRecipient): string {
  assertMessageId(parentId);
  return join(taskInboxTaskDirectory(repoRoot, taskId), 'reply-effects', parentId, deriveTaskMessageRecipientKey(recipient));
}

function optionalReplyRecord<T>(commonDirectory: string, path: string, validate: (value: unknown) => T, canonical: (value: T) => string, charge?: (bytes: number) => void): T | null {
  if (!inspectSafeDirectoryChain(commonDirectory, dirname(path), false, 'reply record directory')) return null;
  let stat;
  try { stat = lstatSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > TASK_REPLY_RECORD_MAX_BYTES) fail('task_message_unreadable', 'reply record is unsafe or exceeds its byte bound');
  charge?.(stat.size);
  const bytes = readCanonicalFile(path, 'reply record');
  const value = validate(JSON.parse(bytes));
  if (canonical(value) !== bytes) replyInconsistent('reply record is not canonical');
  return value;
}

function readReplyChain(input: { repo_root: string; task_id: string; recipient: TaskMessageRecipient }, parent: TaskMessageEventV1, charge?: (bytes: number) => void, commonDirectory = resolveGitCommonDirectory(input.repo_root)) {
  assertTaskId(input.task_id); assertMessageId(parent.message_id);
  const taskDirectory = join(commonDirectory, TASK_INBOX_RELATIVE_PATH, input.task_id);
  const recipientKey = deriveTaskMessageRecipientKey(input.recipient);
  const directory = join(taskDirectory, 'reply-effects', parent.message_id, recipientKey);
  const intent = optionalReplyRecord(commonDirectory, join(directory, 'intent.json'), validateTaskReplyIntent, canonicalTaskReplyIntentBytes, charge);
  const commit = optionalReplyRecord(commonDirectory, join(directory, 'commit.json'), validateTaskReplyCommit, canonicalTaskReplyCommitBytes, charge);
  const effectId = intent?.effect_id ?? commit?.effect_id;
  const event = effectId ? optionalReplyRecord(commonDirectory, join(taskDirectory, 'events', `${effectId}.json`), validateTaskMessageEvent, canonicalTaskMessageEventBytes, charge) : null;
  const acknowledgement = optionalReplyRecord(commonDirectory, join(taskDirectory, 'delivery', parent.message_id, `${recipientKey}.json`), validateTaskMessageDeliveryReceipt, canonicalTaskMessageDeliveryReceiptBytes, charge);
  if (intent && (intent.parent.message_id !== parent.message_id || intent.claim_actor.claim_id !== (input.recipient.kind === 'claim' ? input.recipient.claim_id : null)
    || intent.claim_actor.lease_generation !== (input.recipient.kind === 'claim' ? input.recipient.generation : null))) replyInconsistent('reply record is in a different parent/recipient slot');
  return { intent, event, commit, acknowledgement, observation: inspectTaskReplyChain({ parent, acknowledgement, intent, event, commit }) };
}

function persistReplyRecord(input: RestrictedTaskInboxInput, parentId: string, kind: 'intent' | 'commit', canonical: string, beforePublish: () => void, hook?: (boundary: TaskReplyWriteBoundary) => void): void {
  const directory = replyDirectory(input.repo_root, input.task_id, parentId, input.recipient);
  const common = resolveGitCommonDirectory(input.repo_root);
  inspectSafeDirectoryChain(common, directory, true, 'reply record directory');
  // New path components must survive alongside the immutable linked record.
  for (let current = directory; current !== common; current = dirname(current)) fsyncDirectory(current);
  fsyncDirectory(common);
  const staging = join(taskInboxTaskDirectory(input.repo_root, input.task_id), 'staging', 'reply-effects');
  inspectSafeDirectoryChain(common, staging, true, 'reply staging directory');
  const target = join(directory, `${kind}.json`);
  const bytes = Buffer.from(`${canonical}\n`, 'utf8');
  if (bytes.length > TASK_REPLY_RECORD_MAX_BYTES) fail('task_message_invalid', 'reply record exceeds its byte bound');
  const temporary = join(staging, `.${kind}.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes);
    fsyncSync(fd);
    closeSync(fd); fd = null;
    hook?.(`${kind}_file_fsynced`);
    beforePublish();
    try { linkSync(temporary, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (readCanonicalFile(target, 'reply record') !== canonical) throw new TaskReplyError('task_reply_conflict', 'reply slot already contains different bytes');
    }
    fsyncDirectory(directory);
    hook?.(`${kind}_published`);
  } finally {
    if (fd !== null) closeSync(fd);
    try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export function replyToTaskSteer(input: RestrictedTaskInboxInput & {
  parent_message_id: string; parent_event_digest: string; reply_message_id: string; body: string;
  now: () => string; crash_hook?: (boundary: TaskReplyWriteBoundary) => void;
}) {
  return withRestrictedInbox(input, (authority) => {
    const parent = restrictedParent(input, input.parent_message_id, input.parent_event_digest);
    let chain = readReplyChain(input, parent);
    if (chain.observation.state === 'inconsistent') replyInconsistent(chain.observation.reason);
    if (!chain.acknowledgement || chain.acknowledgement.delivery_state !== 'acknowledged') fail('recipient_unavailable', 'reply requires this recipient acknowledgement');
    if (chain.intent) assertTaskReplyResumeFence(chain.intent, { principal_mapping: authority.mapping, claim_actor: authority.actor });
    const intent = buildTaskReplyIntent({ parent, acknowledgement: chain.acknowledgement, principal_mapping: authority.mapping, claim_actor: authority.actor,
      reply_message_id: input.reply_message_id, body: input.body, prepared_at: chain.intent?.prepared_at ?? input.now() });
    if (chain.intent) assertTaskReplyRetry(chain.intent, intent);
    if (chain.observation.state === 'complete') return { event: chain.event!, commit: chain.commit!, created: false };
    if (!chain.intent && existsSync(taskInboxEventPath(input.repo_root, input.task_id, intent.effect_id))) replyInconsistent('orphan event cannot be retroactively authenticated');
    authority.revalidate();
    if (!chain.intent) persistReplyRecord(input, parent.message_id, 'intent', canonicalTaskReplyIntentBytes(intent), authority.revalidate, input.crash_hook);
    authority.revalidate();
    const published = writeImmutableEvent(input.repo_root, intent.reply, authority.revalidate);
    if (published.event.event_digest !== intent.reply.event_digest) replyInconsistent('event bytes differ from frozen intent');
    input.crash_hook?.('event_published');
    authority.revalidate();
    chain = readReplyChain(input, parent);
    if (chain.observation.state !== 'event_uncommitted') replyInconsistent('reply chain changed before commit');
    const commit = buildTaskReplyCommit({ intent, committed_at: input.now() });
    persistReplyRecord(input, parent.message_id, 'commit', canonicalTaskReplyCommitBytes(commit), authority.revalidate, input.crash_hook);
    const committed = readReplyChain(input, parent);
    if (committed.observation.state !== 'complete') replyInconsistent('reply commit readback is incomplete');
    return { event: committed.event!, commit: committed.commit!, created: true };
  });
}

/** Exact stored facts only; complete describes a chain, never the current owner's authorization. */
export function readTaskSteerReply(input: { repo_root: string; task_id: string; parent_message_id: string; recipient: TaskMessageRecipient }) {
  return withTaskLock(input.repo_root, input.task_id, () => {
    const parent = readEventAt(taskInboxEventPath(input.repo_root, input.task_id, input.parent_message_id));
    assertEventStored(parent, input.task_id);
    if (parent.message_id !== input.parent_message_id) fail('task_message_unreadable', 'steer path identity is mismatched');
    return { parent, ...readReplyChain(input, parent) };
  });
}

/** Bounded, reconstructible pending-disposition view. No delivery, ACK, provider or recovery writes. */
export function observeTaskSteers(input: RestrictedTaskInboxInput & { limit?: number; after?: string; parent_message_id?: string; parent_event_digest?: string }) {
  const exact = input.parent_message_id !== undefined || input.parent_event_digest !== undefined;
  if (exact && (input.parent_message_id === undefined || input.parent_event_digest === undefined || input.limit !== undefined || input.after !== undefined)) {
    fail('task_message_invalid', 'exact recovery requires parent_message_id and parent_event_digest without pagination');
  }
  if (input.parent_message_id !== undefined) assertMessageId(input.parent_message_id);
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('task_message_invalid', 'limit must be from 1 to 100');
  if (input.after !== undefined) assertMessageId(input.after);
  return withRestrictedInbox(input, (authority) => {
    const started = Date.now();
    const commonDirectory = resolveGitCommonDirectory(input.repo_root);
    const directory = join(commonDirectory, TASK_INBOX_RELATIVE_PATH, input.task_id, 'events');
    const events: TaskMessageEventV1[] = [];
    let scanned = 0, bytes = 0;
    let exhausted: 'scan' | 'bytes' | 'deadline' | null = null;
    const charge = (size: number): void => {
      if (Date.now() - started >= 250) { exhausted = 'deadline'; throw new Error('bounded inbox read exhausted'); }
      if (bytes + size > 2 * 1024 * 1024) { exhausted = 'bytes'; throw new Error('bounded inbox read exhausted'); }
      bytes += size;
    };
    if (exact) {
      const parent = optionalReplyRecord(commonDirectory, join(directory, `${input.parent_message_id}.json`), validateTaskMessageEvent, canonicalTaskMessageEventBytes, charge);
      if (!parent) fail('task_message_invalid', 'exact recovery parent is missing');
      assertEventCanonical(parent, input.task_id, authority.actor.task_revision);
      if (parent.message_id !== input.parent_message_id) fail('task_message_unreadable', 'steer path identity is mismatched');
      if (!isOriginalSteer(parent) || parent.event_digest !== input.parent_event_digest) fail('task_message_invalid', 'exact original human steer is required');
      if (parent.scope === 'claim' && (parent.target_claim_id !== input.recipient.claim_id || parent.target_generation !== input.recipient.generation)) fail('claim_mismatch', 'steer belongs to a different claim recipient');
      scanned = 1;
      events.push(parent);
    } else if (inspectSafeDirectoryChain(commonDirectory, directory, false, 'task events')) {
      const stream = opendirSync(directory);
      try {
        for (let entry = stream.readSync(); entry !== null; entry = stream.readSync()) {
          if (scanned >= 1000) { exhausted = 'scan'; break; }
          scanned += 1;
          if (!entry.isFile() || !entry.name.endsWith('.json')) fail('task_message_unreadable', 'unexpected Task event entry');
          const messageId = entry.name.slice(0, -5); assertMessageId(messageId);
          // Directory coverage is bounded independently of the requested page.
          const event = optionalReplyRecord(commonDirectory, join(directory, entry.name), validateTaskMessageEvent, canonicalTaskMessageEventBytes, charge)!;
          assertEventStored(event, input.task_id);
          if (event.message_id !== messageId) fail('task_message_unreadable', 'steer path identity is mismatched');
          events.push(event);
        }
      } catch (error) { if (!exhausted) throw error; }
      finally { stream.closeSync(); }
    }
    const parents = events.filter(event => isOriginalSteer(event) && event.task_revision === authority.actor.task_revision
      && (event.scope === 'task' || (event.target_claim_id === input.recipient.claim_id && event.target_generation === input.recipient.generation)))
      .sort((a, b) => a.message_id < b.message_id ? -1 : a.message_id > b.message_id ? 1 : 0).filter(event => !input.after || event.message_id > input.after);
    const entries: { parent: TaskMessageEventV1; receipt: TaskMessageDeliveryReceiptV1 | null; reply: ReturnType<typeof inspectTaskReplyChain>; pending_disposition: boolean; reply_message_id: string | null;
      recovery: { parent_message_id: string; parent_event_digest: string; reply_message_id: string; body: string; intent_sha256: string } | null }[] = [];
    if (!exhausted) {
      try {
        for (const parent of parents.slice(0, limit)) {
          const chain = readReplyChain(input, parent, charge, commonDirectory);
          if (exact) {
            if (!chain.intent) replyInconsistent('exact recovery requires a persisted reply intent');
            assertTaskReplyResumeFence(chain.intent, { principal_mapping: authority.mapping, claim_actor: authority.actor });
          }
          const orphan = !chain.intent && !chain.commit && events.some(event => event.in_reply_to === parent.message_id && event.sender_id === authority.actor.receipt_sha256);
          const observation = orphan ? { state: 'orphan_event' as const } : chain.observation;
          entries.push({ parent, receipt: chain.acknowledgement, reply: observation,
            pending_disposition: (chain.acknowledgement?.delivery_state === 'delivered' || chain.acknowledgement?.delivery_state === 'acknowledged') && observation.state !== 'complete',
            reply_message_id: chain.intent?.effect_id ?? chain.commit?.effect_id ?? null,
            recovery: chain.intent && (observation.state === 'intent_only' || observation.state === 'event_uncommitted')
              ? { parent_message_id: chain.intent.parent.message_id, parent_event_digest: chain.intent.parent.event_digest,
                reply_message_id: chain.intent.effect_id, body: chain.intent.reply.body, intent_sha256: chain.intent.intent_sha256 }
              : null });
        }
      } catch (error) { if (!exhausted) throw error; }
    }
    return { task_id: input.task_id, recipient: input.recipient, fence: { task_revision: authority.actor.task_revision, claim_actor_digest: authority.actor.receipt_sha256, mapping_digest: authority.mapping.mapping_digest },
      entries, context: renderTaskMessageUntrustedContext(entries.map(entry => entry.parent)),
      coverage: { scope: exact ? 'exact_parent' as const : 'inbox' as const, complete: exhausted === null && parents.length <= entries.length, reason: exhausted ?? (parents.length > entries.length ? 'page' : null), scanned, bytes },
      next_cursor: exhausted === null && parents.length > entries.length ? entries.at(-1)?.parent.message_id ?? null : null };
  });
}

/** Historical observations never acquire a Lease/Binding lock or perform delivery. */
export function readHistoricalTaskActivity(input: {
  repo_root: string; task_id: string; limit: number; after: string | null; message_id: string | null;
  budget: { max_scan: number; max_bytes: number; deadline_ms: number };
}) {
  assertTaskId(input.task_id);
  if (input.message_id !== null) assertMessageId(input.message_id);
  if (input.after !== null) assertMessageId(input.after);
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) fail('task_message_invalid', 'invalid activity limit');
  const common = resolveGitCommonDirectory(input.repo_root);
  const directory = join(common, TASK_INBOX_RELATIVE_PATH, input.task_id, 'events');
  const started = Date.now();
  let scanned = 0, bytes = 0;
  let exhausted: 'scan' | 'bytes' | 'deadline' | null = null;
  const stop = (reason: NonNullable<typeof exhausted>): never => { exhausted = reason; throw new Error('activity read budget exhausted'); };
  const charge = (size: number) => {
    if (Date.now() - started >= input.budget.deadline_ms) stop('deadline');
    if (bytes + size > input.budget.max_bytes) stop('bytes');
    bytes += size;
  };
  const count = () => { charge(0); if (scanned >= input.budget.max_scan) stop('scan'); scanned++; };
  const each = (path: string, visit: (name: string) => void) => {
    if (!inspectSafeDirectoryChain(common, path, false, 'historical activity directory')) return;
    const stream = opendirSync(path);
    try { for (let entry = stream.readSync(); entry; entry = stream.readSync()) {
      count();
      if (!entry.isFile() || !entry.name.endsWith('.json')) fail('task_message_unreadable', 'invalid historical activity entry');
      visit(entry.name);
    } } finally { stream.closeSync(); }
  };
  const eventAt = (id: string) => {
    assertMessageId(id);
    const event = optionalReplyRecord(common, join(directory, `${id}.json`), validateTaskMessageEvent, canonicalTaskMessageEventBytes, charge);
    if (!event) return null;
    assertEventStored(event, input.task_id);
    if (event.message_id !== id) fail('task_message_unreadable', 'historical event path identity is mismatched');
    return event;
  };
  const receiptsAt = (event: TaskMessageEventV1) => {
    const receipts: TaskMessageDeliveryReceiptV1[] = [];
    const path = join(common, TASK_INBOX_RELATIVE_PATH, input.task_id, 'delivery', event.message_id);
    each(path, name => {
      const receipt = optionalReplyRecord(common, join(path, name), validateTaskMessageDeliveryReceipt, canonicalTaskMessageDeliveryReceiptBytes, charge);
      if (!receipt || receipt.message_id !== event.message_id || receipt.recipient_task_revision !== event.task_revision
        || `${deriveTaskMessageRecipientKey(recipientFromReceipt(receipt))}.json` !== name) fail('task_message_unreadable', 'historical receipt path identity is mismatched');
      receipts.push(receipt);
    });
    return receipts.sort((a,b) => deriveTaskMessageRecipientKey(recipientFromReceipt(a)).localeCompare(deriveTaskMessageRecipientKey(recipientFromReceipt(b))));
  };
  type Reply = { claim_id: string; generation: number; reply_message_id: string | null; observation: ReturnType<typeof inspectTaskReplyChain>; actor: ClaimActorReceiptV1 | null };
  const repliesAt = (parent: TaskMessageEventV1, receipts: TaskMessageDeliveryReceiptV1[]): Reply[] => {
    const replies: Reply[] = [];
    if (!isOriginalSteer(parent)) return replies;
    for (const receipt of receipts) {
      const recipient = recipientFromReceipt(receipt);
      if (recipient.kind !== 'claim') continue;
      const chain = readReplyChain({ ...input, recipient }, parent, charge, common);
      let actor: ClaimActorReceiptV1 | null = null;
      if (chain.intent && chain.observation.state !== 'inconsistent') {
        const recorded = readClaimActorReceipt(input.repo_root, input.task_id, recipient.claim_id, { max_bytes: REPLY_RECORD_MAX_BYTES, charge });
        if (recorded && recorded.receipt_sha256 === chain.intent.claim_actor.receipt_sha256
          && recorded.task_id === input.task_id && recorded.task_revision === parent.task_revision
          && recorded.claim_id === recipient.claim_id && recorded.lease_generation === recipient.generation) actor = recorded;
      }
      replies.push({ claim_id: recipient.claim_id, generation: recipient.generation, reply_message_id: chain.intent?.effect_id ?? chain.commit?.effect_id ?? null, observation: chain.observation, actor });
    }
    return replies;
  };
  const events: TaskMessageEventV1[] = [];
  const entries: { event: TaskMessageEventV1; receipts: TaskMessageDeliveryReceiptV1[]; replies: Reply[] }[] = [];
  let historyExists = inspectSafeDirectoryChain(common, directory, false, 'historical event directory');
  try {
    if (input.message_id !== null) { count(); const event = eventAt(input.message_id); historyExists = event !== null; if (event) events.push(event); }
    else if (historyExists) each(directory, name => { const event = eventAt(name.slice(0,-5)); if (!event) fail('task_message_unreadable', 'historical event disappeared'); events.push(event); });
    events.sort((a,b) => a.message_id < b.message_id ? -1 : a.message_id > b.message_id ? 1 : 0);
    for (const event of events.filter(e => input.after === null || e.message_id > input.after).slice(0,input.limit)) {
      const receipts = receiptsAt(event);
      const parent = event.in_reply_to === null ? event : eventAt(event.in_reply_to);
      const parentReceipts = parent === event ? receipts : parent ? receiptsAt(parent) : [];
      const replies = parent ? repliesAt(parent, parentReceipts).filter(r => parent === event || r.reply_message_id === event.message_id) : [];
      entries.push({ event, receipts, replies });
    }
  } catch (error) { if (!exhausted) throw error; }
  const more = events.filter(e => input.after === null || e.message_id > input.after).length > entries.length;
  const reason = exhausted ?? (more ? 'page' as const : null);
  return { history_exists: historyExists, entries,
    coverage: { complete: reason === null, reason, scanned, bytes },
    next_cursor: reason === 'page' ? entries.at(-1)?.event.message_id ?? null : null };
}
