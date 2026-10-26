import { TaskMessageError } from '../../core/messages/task-message-error';
import { sameTaskMessageClaim, type TaskMessageClaim } from '../../core/messages/task-message-claim';
import { TASK_INBOX_V2_RELATIVE_PATH, admittedTaskInboxRecipientStorageKey as taskInboxRecipientStorageKey } from '../../core/fleet/task-inbox-layout';
import {
  inspectTaskInboxLayout,
  assertTaskInboxLayoutUnchanged,
  syncInboxDirectory,
  TaskInboxLayoutError,
} from './task-inbox-layout';
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  opendirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { dirname, isAbsolute, join, relative } from 'path';
import { randomUUID } from 'crypto';

import {
  TASK_MESSAGE_BODY_MAX_BYTES,
  TASK_MESSAGE_HOOK_MAX_BYTES,
  TASK_MESSAGE_HOOK_MAX_MESSAGES,
  buildTaskMessageEvent,
  buildTaskMessageDeliveryReceipt,
  canonicalTaskMessageDeliveryReceiptBytes,
  canonicalTaskMessageEventBytes,
  deriveTaskMessageRecipientKey,
  renderTaskMessageUntrustedContext,
  transitionTaskMessageDeliveryReceipt,
  validateTaskMessageDeliveryReceipt,
  validateTaskMessageEvent,
  recipientFromTaskMessageReceipt,
  type TaskMessageDeliveryChannel,
  type TaskMessageDeliveryReceiptV2,
  type TaskMessageEventV2,
  type TaskMessageRecipient,
} from '../../core/fleet/admitted-task-message';
import {
  TASK_REPLY_RECORD_MAX_BYTES,
  canonicalTaskReplyIntentBytes,
  canonicalTaskReplyCommitBytes,
  validateTaskReplyIntent,
  validateTaskReplyCommit,
  inspectTaskReplyChain,
} from '../../core/fleet/task-reply';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { readTaskAgent, observeTaskSessionAdmission, type TaskSessionAuthority, type TaskSessionAdmission } from '../terminal/task-session';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { readActiveReviewAdmission } from '../admission/admission-store';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { JsonValue } from '../../core/evidence/types';
import * as historicalMessage from '../../core/fleet/task-message';
import { taskInboxRecipientStorageKey as historicalRecipientStorageKey } from '../../core/fleet/task-inbox-layout';
import { withTaskLock } from '../locking/task-lock';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

export const TASK_INBOX_RELATIVE_PATH = TASK_INBOX_V2_RELATIVE_PATH;

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

export interface TaskInboxSessionSource {
  readonly authority: TaskSessionAuthority;
  readonly session: { readonly task: string; readonly role: string };
}

export interface SendTaskMessageInput {
  readonly repo_root: string;
  readonly source: TaskInboxSessionSource;
  readonly event: TaskMessageEventV2;
}

export interface TaskInboxListInput {
  readonly repo_root: string;
  readonly task_id: string;
  readonly source: TaskInboxSessionSource;
  readonly recipient: TaskMessageRecipient;
  /** Required only for owner delivery/listing. It must be the bound worktree. */
  readonly execution_worktree?: string;
}

export interface DeliverTaskInboxInput extends TaskInboxListInput {
  readonly delivery_channel: TaskMessageDeliveryChannel;
  /** Required exactly when the delivery channel is one controlled request or Agent Runtime effect's
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

export interface TaskInboxEventEntry {
  readonly event: TaskMessageEventV2;
  readonly receipt: TaskMessageDeliveryReceiptV2 | null;
  readonly globally_satisfied: boolean;
}

export interface TaskInboxListResult {
  readonly task_id: string;
  readonly entries: readonly TaskInboxEventEntry[];
  /** Audience-matching events skipped because their task revision is superseded. */
  readonly superseded_revision_count: number;
}

export interface TaskInboxDelivery {
  readonly event: TaskMessageEventV2;
  readonly receipt: TaskMessageDeliveryReceiptV2;
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
  readonly event: TaskMessageEventV2;
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
  readonly admission_sha256: string;
  readonly current_claim: TaskMessageClaim | null;
}

export interface TaskInboxFleetSummaryV1 {
  readonly unread_count: number;
  readonly addressed_to_current_claim: boolean;
  readonly snapshot_consistency: 'stable' | 'changed_during_read';
}

function asInboxError(error: unknown, fallback: TaskInboxErrorCode, context: string): TaskInboxError {
  if (error instanceof TaskInboxError) return error;
  if (error instanceof TaskMessageError) return new TaskInboxError(error.code, error.message, error);
  if (error instanceof TaskInboxLayoutError) return new TaskInboxError('task_message_unreadable', error.message, error);
  return new TaskInboxError(fallback, context, error);
}

function fail(code: TaskInboxErrorCode, message: string, cause?: unknown): never {
  throw new TaskInboxError(code, message, cause);
}

function withInboxTaskLock<T>(repoRoot: string, taskId: string, action: () => T): T {
  try {
    const common = resolveGitCommonDirectory(repoRoot);
    // Share the offline migration mutex, including writers for task directories
    // that were not present when its inventory was captured. Always acquire it
    // before the unchanged physical task lock, as the migration does.
    return withExclusiveDirectoryLock(common, 'repo-harness/task-inbox-migration.lock', () =>
      withTaskLock(repoRoot, taskId, () => {
        inspectTaskInboxLayout(common);
        const result = action();
        inspectTaskInboxLayout(common);
        return result;
      }));
  } catch (error) {
    throw asInboxError(error, 'task_message_unreadable', `cannot operate task inbox under the task lock for ${taskId}`);
  }
}

function taskInboxRoot(repoRoot: string): string {
  const common = resolveGitCommonDirectory(repoRoot);
  inspectTaskInboxLayout(common);
  return join(common, TASK_INBOX_RELATIVE_PATH);
}

/** Crash residue is not a canonical record and must never enter strict scans. */
function taskInboxStagingDirectory(repoRoot: string, taskId: string, kind: 'events' | 'delivery'): string {
  return join(taskInboxTaskDirectory(repoRoot, taskId), 'staging', kind);
}

export function taskInboxTaskDirectory(repoRoot: string, taskId: string): string {
  return taskInboxTaskScope(repoRoot, taskId).directory;
}

/**
 * One task's inbox location, resolved once. Resolving the common directory
 * spawns Git, so a scan carries this value instead of resolving it again for
 * every event it reads.
 */
interface TaskInboxTaskScope {
  readonly common: string;
  readonly task_id: string;
  readonly directory: string;
}

function taskInboxTaskScope(repoRoot: string, taskId: string): TaskInboxTaskScope {
  assertTaskId(taskId);
  const common = resolveGitCommonDirectory(repoRoot);
  inspectTaskInboxLayout(common);
  return { common, task_id: taskId, directory: join(common, TASK_INBOX_RELATIVE_PATH, taskId, 'admitted') };
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
  return join(taskInboxTaskDirectory(repoRoot, taskId), 'delivery', messageId, `${taskInboxRecipientStorageKey(recipient)}.json`);
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

function readEventAt(path: string): TaskMessageEventV2 {
  let event: TaskMessageEventV2;
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

function readReceiptAt(path: string): TaskMessageDeliveryReceiptV2 {
  let receipt: TaskMessageDeliveryReceiptV2;
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
): TaskMessageDeliveryReceiptV2 | null {
  const path = taskInboxDeliveryPath(repoRoot, taskId, messageId, recipient);
  if (!existsSync(path)) return null;
  const receipt = readReceiptAt(path);
  if (receipt.message_id !== messageId || deriveTaskMessageRecipientKey(recipientFromReceipt(receipt)) !== deriveTaskMessageRecipientKey(recipient)) {
    fail('task_message_unreadable', `task message delivery receipt identity is mismatched: ${path}`);
  }
  return receipt;
}

function recipientFromReceipt(receipt: TaskMessageDeliveryReceiptV2): TaskMessageRecipient {
  return recipientFromTaskMessageReceipt(receipt);
}

function listEvents(scope: TaskInboxTaskScope): TaskMessageEventV2[] {
  const taskId = scope.task_id;
  const directory = join(scope.directory, 'events');
  if (!inspectSafeDirectoryChain(scope.common, directory, false, 'task message event directory')) return [];
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
  const events: TaskMessageEventV2[] = [];
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

function listReceipts(scope: TaskInboxTaskScope, messageId: string): TaskMessageDeliveryReceiptV2[] {
  const directory = join(scope.directory, 'delivery', messageId);
  if (!inspectSafeDirectoryChain(scope.common, directory, false, 'task message delivery directory')) return [];
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
    if (receipt.message_id !== messageId || `${taskInboxRecipientStorageKey(recipientFromReceipt(receipt))}.json` !== name) {
      fail('task_message_unreadable', `task message delivery path identity is mismatched: ${name}`);
    }
    return receipt;
  });
}

function sameData(left: unknown, right: unknown): boolean {
  return canonicalize(left as JsonValue) === canonicalize(right as JsonValue);
}
interface InboxAdmission { admission: TaskSessionAdmission; assertLocalCurrent: () => void }
/** Provider observation happens outside the inbox mutex. Inside it, only the
 * exact local approval and immutable session binding are reread. */
function observeInboxAdmission(input: { repo_root: string; source: TaskInboxSessionSource; task_id: string }): InboxAdmission {
  assertTaskId(input.task_id);
  if (!input.source || input.source.session.task !== input.task_id) fail('claim_mismatch', 'explicit session task does not match inbox');
  const { binding, dir } = readTaskAgent(input.repo_root, input.source.session.task, input.source.session.role);
  if (!binding.task_admission || existsSync(join(dir, 'closed.json'))) fail('recipient_unavailable', 'admitted session is unavailable');
  const admission = observeTaskSessionAdmission(binding.execution_root, binding, binding.runtime, input.source.authority);
  if (!sameData(binding.task_admission.identity, admission.identity)) fail('claim_mismatch', 'session admission identity changed');
  const source = input.source.authority.source;
  const active = observeActiveReviewAdmission(source);
  if (active.grant_sha256 !== admission.approval.grant_sha256 || active.admission.admission_sha256 !== admission.approval.admission_sha256) fail('canonical_source_stale', 'admission changed during inbox observation');
  const expectedGoal = active.admission.goal;
  const assertLocalCurrent = () => {
    const current = readActiveReviewAdmission({ ...source, expectedGoal });
    if (current.grant_sha256 !== admission.approval.grant_sha256 || current.admission.admission_sha256 !== admission.approval.admission_sha256) fail('canonical_source_stale', 'admission changed during inbox operation');
    const latest = readTaskAgent(input.repo_root, input.source.session.task, input.source.session.role);
    if (!sameData(latest.binding, binding) || existsSync(join(latest.dir, 'closed.json'))) fail('recipient_unavailable', 'session changed during inbox operation');
  };
  assertLocalCurrent();
  return { admission, assertLocalCurrent };
}
/** Read-only request preparation for trusted control clients. */
export function observeTaskInboxContext(input: { repo_root: string; source: TaskInboxSessionSource; task_id: string }): TaskSessionAdmission {
  return observeInboxAdmission(input).admission;
}
function audienceMatches(event: TaskMessageEventV2, recipient: TaskMessageRecipient): boolean {
  return event.audience === (recipient.kind === 'claim' ? 'owner' : recipient.kind);
}
function assertInboxRecipient(input: TaskInboxListInput, admission: TaskSessionAdmission): string {
  if (input.recipient.kind === 'claim') {
    if (!sameTaskMessageClaim(input.recipient.claim, admission.identity.claim)) fail('claim_mismatch', 'recipient does not match admitted claim reference');
    if (!input.execution_worktree || realpathSync(input.execution_worktree) !== admission.identity.execution_root) fail('recipient_unavailable', 'recipient worktree does not match admitted session');
  }
  return admission.approval.admission_sha256;
}

function writeAll(fd: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
}

function fsyncDirectory(path: string): void { syncInboxDirectory(path); }

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

function writeImmutableEvent(repoRoot: string, event: TaskMessageEventV2): TaskInboxSendResult {
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
    inspectTaskInboxLayout(resolveGitCommonDirectory(repoRoot));
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
function sameEventRetry(existing: TaskMessageEventV2, candidate: TaskMessageEventV2): boolean {
  const rebased = buildTaskMessageEvent({
    message_id: candidate.message_id,
    task_id: candidate.task_id,
    admission_sha256: candidate.admission_sha256,
    scope: candidate.scope,
    target_claim: candidate.target_claim,
    task_identity: candidate.task_identity,
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

function writeReceipt(repoRoot: string, taskId: string, receipt: TaskMessageDeliveryReceiptV2): TaskMessageDeliveryReceiptV2 {
  const recipient = recipientFromReceipt(receipt);
  ensureInboxDirectories(repoRoot, taskId, receipt.message_id);
  const target = taskInboxDeliveryPath(repoRoot, taskId, receipt.message_id, recipient);
  if (existsSync(target)) readReceiptAt(target);
  const canonical = canonicalTaskMessageDeliveryReceiptBytes(receipt);
  const directory = dirname(target);
  const temporary = join(
    taskInboxStagingDirectory(repoRoot, taskId, 'delivery'),
    `.${receipt.message_id}.${taskInboxRecipientStorageKey(recipient)}.${process.pid}.${randomUUID()}.tmp`,
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
    inspectTaskInboxLayout(resolveGitCommonDirectory(repoRoot));
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

function assertEventStored(event: { task_id: string; message_id: string; body: string }, taskId: string): void {
  if (event.task_id !== taskId) fail('task_message_unreadable', `task message event ${event.message_id} is in the wrong task directory`);
  if (Buffer.byteLength(event.body, 'utf-8') > TASK_MESSAGE_BODY_MAX_BYTES) fail('task_message_unreadable', `task message event ${event.message_id} body exceeds its limit`);
}

/** Fails closed where the caller names one exact event and revision. */
function assertEventCanonical(event: TaskMessageEventV2, taskId: string, revision: string): void {
  assertEventStored(event, taskId);
  if (event.admission_sha256 !== revision) fail('task_revision_mismatch', `task message event ${event.message_id} revision is stale`);
}

/**
 * A scan reads every admitted event of one task. A replaced admission makes
 * earlier events no longer addressed to the current task context: they are skipped, and
 * is neither listed, delivered, nor counted. Aborting the whole scan instead
 * let one superseded event hide the entire inbox permanently -- and, through
 * the fleet card's inbox observation, the entire repository.
 */
function isCurrentRevisionEvent(event: TaskMessageEventV2, taskId: string, revision: string): boolean {
  assertEventStored(event, taskId);
  return event.admission_sha256 === revision;
}

function isGloballySatisfied(repoRoot: string, taskId: string, event: TaskMessageEventV2): boolean {
  if (event.scope !== 'task') return false;
  return listReceipts(taskInboxTaskScope(repoRoot, taskId), event.message_id).some((receipt) => receipt.delivery_state === 'acknowledged');
}

function receiptFor(
  repoRoot: string,
  taskId: string,
  event: TaskMessageEventV2,
  recipient: TaskMessageRecipient,
  channel: TaskMessageDeliveryChannel,
): TaskMessageDeliveryReceiptV2 {
  return readOptionalReceipt(repoRoot, taskId, event.message_id, recipient)
    ?? buildTaskMessageDeliveryReceipt({
      message_id: event.message_id,
      recipient,
      admission_sha256: event.admission_sha256,
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
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.admission_sha256)) {
    fail('task_revision_mismatch', `task revision is invalid for ${input.task_id}`);
  }
  const scope = taskInboxTaskScope(input.repo_root, input.task_id);
  const events = listEvents(scope);
  const revisionParts: string[] = [];
  let unreadCount = 0;
  for (const event of events) {
    if (!isCurrentRevisionEvent(event, input.task_id, input.admission_sha256)) continue;
    revisionParts.push(canonicalTaskMessageEventBytes(event));
    const receipts = listReceipts(scope, event.message_id);
    for (const receipt of receipts) revisionParts.push(canonicalTaskMessageDeliveryReceiptBytes(receipt));
    if (event.audience !== 'owner' || input.current_claim === null) continue;
    if (event.scope === 'claim' && (!sameTaskMessageClaim(event.target_claim, input.current_claim))) continue;
    if (event.scope === 'task' && receipts.some((receipt) => receipt.delivery_state === 'acknowledged')) continue;
    const recipient: TaskMessageRecipient = {
      kind: 'claim', claim: input.current_claim,
    };
    // listReceipts already read and identity-checked this recipient's receipt.
    const recipientKey = deriveTaskMessageRecipientKey(recipient);
    const receipt = receipts.find((entry) => deriveTaskMessageRecipientKey(recipientFromReceipt(entry)) === recipientKey);
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
  const layoutCommon = resolveGitCommonDirectory(input.repo_root);
  const layoutIdentity = inspectTaskInboxLayout(layoutCommon);
  const result = (() => {
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
  })();
  assertTaskInboxLayoutUnchanged(layoutCommon, layoutIdentity);
  return result;
}

/** Persist a producer-authorized event after canonical task and claim checks. */
export function sendTaskMessage(input: SendTaskMessageInput): TaskInboxSendResult {
  let event: TaskMessageEventV2;
  try {
    event = validateTaskMessageEvent(input.event);
  } catch (error) {
    throw asInboxError(error, 'task_message_invalid', 'task message event is invalid');
  }
  const observed = observeInboxAdmission({ ...input, task_id: event.task_id });
  return withInboxTaskLock(input.repo_root, event.task_id, () => {
    observed.assertLocalCurrent();
    const current = observed.admission;
    if (event.admission_sha256 !== current.approval.admission_sha256
      || !sameData(event.task_identity, { repository_id: current.identity.repository_id, issue_id: current.identity.issue_id, campaign_id: current.identity.campaign_id })) fail('task_revision_mismatch', 'message does not match current admitted task');
    if (event.scope === 'claim' && !sameTaskMessageClaim(event.target_claim, current.identity.claim)) fail('claim_mismatch', 'message does not match current immutable claim');
    const result = writeImmutableEvent(input.repo_root, event);
    observed.assertLocalCurrent();
    return result;
  });
}

/** Read-only projection for a canonical recipient. It never marks delivery. */
export function listTaskInbox(input: TaskInboxListInput): TaskInboxListResult {
  assertTaskId(input.task_id);
  const observed = observeInboxAdmission(input);
  return withInboxTaskLock(input.repo_root, input.task_id, () => {
    observed.assertLocalCurrent();
    const expectedRevision = assertInboxRecipient(input, observed.admission);
    let supersededRevisionCount = 0;
    const entries = listEvents(taskInboxTaskScope(input.repo_root, input.task_id))
      .filter((event) => audienceMatches(event, input.recipient))
      .map((event) => {
        if (!isCurrentRevisionEvent(event, input.task_id, expectedRevision)) {
          supersededRevisionCount += 1;
          return null;
        }
        if (event.scope === 'claim' && (input.recipient.kind !== 'claim'
          || !sameTaskMessageClaim(event.target_claim, input.recipient.claim))) return null;
        return {
          event,
          receipt: readOptionalReceipt(input.repo_root, input.task_id, event.message_id, input.recipient),
          globally_satisfied: isGloballySatisfied(input.repo_root, input.task_id, event),
        } satisfies TaskInboxEventEntry;
      })
      .filter((entry): entry is TaskInboxEventEntry => entry !== null);
    observed.assertLocalCurrent();
    return { task_id: input.task_id, entries, superseded_revision_count: supersededRevisionCount };
  });
}

/** Read one exact Task message/recipient receipt pair for runtime correlation.
 * This adds no delivery transition and preserves Task Inbox as the authority. */
export function readTaskMessageDelivery(input: TaskInboxListInput & { readonly message_id: string }): TaskInboxEventEntry {
  const observed = observeInboxAdmission(input);
  const revision = assertInboxRecipient(input, observed.admission);
  const layoutCommon = resolveGitCommonDirectory(input.repo_root);
  const layoutIdentity = inspectTaskInboxLayout(layoutCommon);
  const result = (() => {
  observed.assertLocalCurrent();
  const event = readEventAt(taskInboxEventPath(input.repo_root, input.task_id, input.message_id));
  if (event.task_id !== input.task_id || event.message_id !== input.message_id) {
    fail('task_message_invalid', 'message does not belong to the requested Task inbox');
  }
  assertEventCanonical(event, input.task_id, revision);
  const receipt = readOptionalReceipt(input.repo_root, input.task_id, input.message_id, input.recipient);
  observed.assertLocalCurrent();
  return Object.freeze({
    event,
    receipt,
    globally_satisfied: receipt?.delivery_state === 'acknowledged',
  });
  })();
  assertTaskInboxLayoutUnchanged(layoutCommon, layoutIdentity);
  return result;
}

/**
 * Fence the recipient, supersede stale claim messages, and durably mark
 * eligible events delivered before returning them. Hook delivery is bounded;
 * a controlled manual listing is the delivery boundary for all matching rows.
 */
export function deliverTaskInbox(input: DeliverTaskInboxInput): TaskInboxDeliveryResult {
  const recipient = input.recipient;
  assertTaskId(input.task_id);
  if ((input.delivery_channel === 'agent_runtime_effect' || input.delivery_channel === 'controlled_request')) {
    if (input.delivery_ref === undefined || input.delivery_ref.length === 0) {
      fail('task_message_invalid', 'controlled delivery requires its bounded control reference');
    }
    if (input.message_id === undefined) {
      fail('task_message_invalid', 'controlled delivery requires its exact message_id');
    }
  } else if (input.delivery_ref !== undefined || input.message_id !== undefined) {
    fail('task_message_invalid', 'only controlled delivery carries a bounded control reference');
  }
  if (input.delivery_channel !== 'agent_runtime_effect' && input.delivery_channel !== 'controlled_request' && input.delivery_ref !== undefined) {
    fail('task_message_invalid', 'only controlled delivery carries a bounded control reference');
  }
  const observed = observeInboxAdmission(input);
  return withInboxTaskLock(input.repo_root, input.task_id, () => {
    observed.assertLocalCurrent();
    const expectedRevision = assertInboxRecipient(input, observed.admission);
    const deliveries: TaskInboxDelivery[] = [];
    let supersededCount = 0;
    let pendingCount = 0;
    let renderedBodyBytes = 0;
    for (const event of listEvents(taskInboxTaskScope(input.repo_root, input.task_id))) {
      if (!isCurrentRevisionEvent(event, input.task_id, expectedRevision)) continue;
      if (!audienceMatches(event, recipient)) continue;
      if (event.scope === 'claim' && recipient.kind === 'claim'
        && (!sameTaskMessageClaim(event.target_claim, recipient.claim))) {
        const frozenRecipient: TaskMessageRecipient = {
          kind: 'claim', claim: event.target_claim!,
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
      if ((input.delivery_channel === 'agent_runtime_effect' || input.delivery_channel === 'controlled_request') && event.message_id !== input.message_id) continue;
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
      const delivered = transitionTaskMessageDeliveryReceipt(prior, (input.delivery_channel === 'agent_runtime_effect' || input.delivery_channel === 'controlled_request')
        ? { state: 'delivered', at: input.delivered_at, delivery_ref: input.delivery_ref, ...(input.delivery_channel === 'controlled_request' ? { delivery_channel: input.delivery_channel } : {}) }
        : { state: 'delivered', at: input.delivered_at, delivery_channel: input.delivery_channel });
      writeReceipt(input.repo_root, input.task_id, delivered);
      deliveries.push({ event, receipt: delivered });
      renderedBodyBytes += bodyBytes;
    }
    observed.assertLocalCurrent();
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
export function acknowledgeTaskInbox(input: AcknowledgeTaskInboxInput): TaskMessageDeliveryReceiptV2 {
  assertTaskId(input.task_id);
  assertMessageId(input.message_id);
  const observed = observeInboxAdmission(input);
  return withInboxTaskLock(input.repo_root, input.task_id, () => {
    observed.assertLocalCurrent();
    const expectedRevision = assertInboxRecipient(input, observed.admission);
    const event = readEventAt(taskInboxEventPath(input.repo_root, input.task_id, input.message_id));
    assertEventCanonical(event, input.task_id, expectedRevision);
    if (!audienceMatches(event, input.recipient)) fail('recipient_unavailable', 'message audience does not match recipient');
    if (event.scope === 'claim' && (input.recipient.kind !== 'claim'
      || !sameTaskMessageClaim(event.target_claim, input.recipient.claim))) {
      fail('claim_mismatch', 'claim-scoped message does not match recipient');
    }
    const receipt = readOptionalReceipt(input.repo_root, input.task_id, input.message_id, input.recipient);
    if (receipt === null) fail('recipient_unavailable', 'message has not been delivered to recipient');
    const acknowledged = transitionTaskMessageDeliveryReceipt(receipt, { state: 'acknowledged', at: input.acknowledged_at });
    if (canonicalTaskMessageDeliveryReceiptBytes(receipt) !== canonicalTaskMessageDeliveryReceiptBytes(acknowledged)) {
      writeReceipt(input.repo_root, input.task_id, acknowledged);
    }
    observed.assertLocalCurrent();
    return acknowledged;
  });
}

/** CLI-facing spelling retained at the effect boundary. */
export const ackTaskInbox = acknowledgeTaskInbox;

export class TaskReplyStoreError extends Error {
  readonly code = 'task_reply_inconsistent';
}
function replyInconsistent(message: string): never { throw new TaskReplyStoreError(message); }

function isOriginalSteer(event: historicalMessage.TaskMessageEventV1): boolean {
  return event.audience === 'owner' && event.in_reply_to === null && event.sender_trust === 'local_operator'
    && (event.sender_kind === 'user' || event.sender_kind === 'operator');
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

function readReplyChain(input: { repo_root: string; task_id: string; recipient: historicalMessage.TaskMessageRecipient }, parent: historicalMessage.TaskMessageEventV1, charge?: (bytes: number) => void, commonDirectory = resolveGitCommonDirectory(input.repo_root)) {
  assertTaskId(input.task_id); assertMessageId(parent.message_id);
  const taskDirectory = join(commonDirectory, TASK_INBOX_RELATIVE_PATH, input.task_id);
  const recipientKey = historicalRecipientStorageKey(input.recipient);
  const directory = join(taskDirectory, 'reply-effects', parent.message_id, recipientKey);
  const intent = optionalReplyRecord(commonDirectory, join(directory, 'intent.json'), validateTaskReplyIntent, canonicalTaskReplyIntentBytes, charge);
  const commit = optionalReplyRecord(commonDirectory, join(directory, 'commit.json'), validateTaskReplyCommit, canonicalTaskReplyCommitBytes, charge);
  const effectId = intent?.effect_id ?? commit?.effect_id;
  const event = effectId ? optionalReplyRecord(commonDirectory, join(taskDirectory, 'events', `${effectId}.json`), historicalMessage.validateTaskMessageEvent, historicalMessage.canonicalTaskMessageEventBytes, charge) : null;
  const acknowledgement = optionalReplyRecord(commonDirectory, join(taskDirectory, 'delivery', parent.message_id, `${recipientKey}.json`), historicalMessage.validateTaskMessageDeliveryReceipt, historicalMessage.canonicalTaskMessageDeliveryReceiptBytes, charge);
  if (intent && (intent.parent.message_id !== parent.message_id || intent.claim_actor.claim_id !== (input.recipient.kind === 'claim' ? input.recipient.claim_id : null)
    || intent.claim_actor.lease_generation !== (input.recipient.kind === 'claim' ? input.recipient.generation : null))) replyInconsistent('reply record is in a different parent/recipient slot');
  return { intent, event, commit, acknowledgement, observation: inspectTaskReplyChain({ parent, acknowledgement, intent, event, commit }) };
}

export interface TaskActivityCoverage {
  readonly complete: boolean;
  readonly reason: 'scan' | 'bytes' | 'deadline' | 'page' | null;
  readonly scanned: number;
  readonly bytes: number;
}

/** Historical observations never acquire a Lease/Binding lock or perform delivery. */
export function readHistoricalTaskActivity(input: {
  repo_root: string; task_id: string; limit: number; after: string | null; message_id: string | null;
  budget: { max_scan: number; max_bytes: number; deadline_ms: number };
}) {
  const layoutCommon = resolveGitCommonDirectory(input.repo_root);
  const layoutIdentity = inspectTaskInboxLayout(layoutCommon);
  const result = (() => {
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
    const event = optionalReplyRecord(common, join(directory, `${id}.json`), historicalMessage.validateTaskMessageEvent, historicalMessage.canonicalTaskMessageEventBytes, charge);
    if (!event) return null;
    assertEventStored(event, input.task_id);
    if (event.message_id !== id) fail('task_message_unreadable', 'historical event path identity is mismatched');
    return event;
  };
  const receiptsAt = (event: historicalMessage.TaskMessageEventV1) => {
    const receipts: historicalMessage.TaskMessageDeliveryReceiptV1[] = [];
    const path = join(common, TASK_INBOX_RELATIVE_PATH, input.task_id, 'delivery', event.message_id);
    each(path, name => {
      const receipt = optionalReplyRecord(common, join(path, name), historicalMessage.validateTaskMessageDeliveryReceipt, historicalMessage.canonicalTaskMessageDeliveryReceiptBytes, charge);
      if (!receipt || receipt.message_id !== event.message_id || receipt.recipient_task_revision !== event.task_revision
        || `${historicalRecipientStorageKey(historicalMessage.recipientFromTaskMessageReceipt(receipt))}.json` !== name) fail('task_message_unreadable', 'historical receipt path identity is mismatched');
      receipts.push(receipt);
    });
    return receipts.sort((a,b) => historicalMessage.deriveTaskMessageRecipientKey(historicalMessage.recipientFromTaskMessageReceipt(a)).localeCompare(historicalMessage.deriveTaskMessageRecipientKey(historicalMessage.recipientFromTaskMessageReceipt(b))));
  };
  type Reply = { claim_id: string; generation: number; reply_message_id: string | null; observation: ReturnType<typeof inspectTaskReplyChain> };
  const repliesAt = (parent: historicalMessage.TaskMessageEventV1, receipts: historicalMessage.TaskMessageDeliveryReceiptV1[]): Reply[] => {
    const replies: Reply[] = [];
    if (!isOriginalSteer(parent)) return replies;
    for (const receipt of receipts) {
      const recipient = historicalMessage.recipientFromTaskMessageReceipt(receipt);
      if (recipient.kind !== 'claim') continue;
      const chain = readReplyChain({ ...input, recipient }, parent, charge, common);
      replies.push({ claim_id: recipient.claim_id, generation: recipient.generation, reply_message_id: chain.intent?.effect_id ?? chain.commit?.effect_id ?? null, observation: chain.observation });
    }
    return replies;
  };
  const events: historicalMessage.TaskMessageEventV1[] = [];
  const entries: { event: historicalMessage.TaskMessageEventV1; receipts: historicalMessage.TaskMessageDeliveryReceiptV1[]; replies: Reply[] }[] = [];
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
  const coverage: TaskActivityCoverage = { complete: reason === null, reason, scanned, bytes };
  return { history_exists: historyExists, entries, coverage,
    next_cursor: reason === 'page' ? entries.at(-1)?.event.message_id ?? null : null };
  })();
  assertTaskInboxLayoutUnchanged(layoutCommon, layoutIdentity);
  return result;
}

/** Historical correlation only; never used to authorize active delivery. */
export function readHistoricalTaskMessageDelivery(input: { repo_root: string; task_id: string; message_id: string; recipient: historicalMessage.TaskMessageRecipient }) {
  assertTaskId(input.task_id); assertMessageId(input.message_id);
  const common = resolveGitCommonDirectory(input.repo_root), layout = inspectTaskInboxLayout(common);
  const directory = join(common, TASK_INBOX_RELATIVE_PATH, input.task_id);
  const event = optionalReplyRecord(common, join(directory, 'events', `${input.message_id}.json`), historicalMessage.validateTaskMessageEvent, historicalMessage.canonicalTaskMessageEventBytes);
  if (!event || event.task_id !== input.task_id || event.message_id !== input.message_id) fail('task_message_unreadable', 'historical event unavailable');
  const receipt = optionalReplyRecord(common, join(directory, 'delivery', input.message_id, `${historicalRecipientStorageKey(input.recipient)}.json`), historicalMessage.validateTaskMessageDeliveryReceipt, historicalMessage.canonicalTaskMessageDeliveryReceiptBytes);
  if (receipt && (receipt.message_id !== event.message_id || receipt.recipient_task_revision !== event.task_revision
    || historicalMessage.deriveTaskMessageRecipientKey(historicalMessage.recipientFromTaskMessageReceipt(receipt)) !== historicalMessage.deriveTaskMessageRecipientKey(input.recipient))) fail('task_message_unreadable', 'historical receipt identity is mismatched');
  let globallySatisfied = false;
  const deliveryDirectory = join(directory, 'delivery', input.message_id);
  if (event.scope === 'task' && inspectSafeDirectoryChain(common, deliveryDirectory, false, 'historical deliveries')) {
    for (const name of readdirSync(deliveryDirectory)) {
      if (!name.endsWith('.json')) fail('task_message_unreadable', 'historical receipt filename is invalid');
      const other = optionalReplyRecord(common, join(deliveryDirectory, name), historicalMessage.validateTaskMessageDeliveryReceipt, historicalMessage.canonicalTaskMessageDeliveryReceiptBytes);
      if (!other || other.message_id !== event.message_id || other.recipient_task_revision !== event.task_revision
        || `${historicalRecipientStorageKey(historicalMessage.recipientFromTaskMessageReceipt(other))}.json` !== name) fail('task_message_unreadable', 'historical receipt path is mismatched');
      if (other.delivery_state === 'acknowledged') globallySatisfied = true;
    }
  }
  assertTaskInboxLayoutUnchanged(common, layout);
  return { event, receipt, globally_satisfied: globallySatisfied };
}

/** Read-only admitted-wire activity; recorded provenance is not current authorization. */
export function readAdmittedTaskActivity(input: {
  repo_root: string; task_id: string; limit: number; after: string | null; message_id: string | null;
  budget: { max_scan: number; max_bytes: number; deadline_ms: number };
}) {
  const layoutCommon = resolveGitCommonDirectory(input.repo_root);
  const layoutIdentity = inspectTaskInboxLayout(layoutCommon);
  const result = (() => {
  assertTaskId(input.task_id);
  if (input.message_id !== null) assertMessageId(input.message_id);
  if (input.after !== null) assertMessageId(input.after);
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) fail('task_message_invalid', 'invalid activity limit');
  const common = resolveGitCommonDirectory(input.repo_root);
  const directory = join(common, TASK_INBOX_RELATIVE_PATH, input.task_id, 'admitted', 'events');
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
  const receiptsAt = (event: TaskMessageEventV2) => {
    const receipts: TaskMessageDeliveryReceiptV2[] = [];
    const path = join(common, TASK_INBOX_RELATIVE_PATH, input.task_id, 'admitted', 'delivery', event.message_id);
    each(path, name => {
      const receipt = optionalReplyRecord(common, join(path, name), validateTaskMessageDeliveryReceipt, canonicalTaskMessageDeliveryReceiptBytes, charge);
      if (!receipt || receipt.message_id !== event.message_id || receipt.recipient_admission_sha256 !== event.admission_sha256
        || `${taskInboxRecipientStorageKey(recipientFromTaskMessageReceipt(receipt))}.json` !== name) fail('task_message_unreadable', 'historical receipt path identity is mismatched');
      receipts.push(receipt);
    });
    return receipts.sort((a,b) => deriveTaskMessageRecipientKey(recipientFromTaskMessageReceipt(a)).localeCompare(deriveTaskMessageRecipientKey(recipientFromTaskMessageReceipt(b))));
  };
  const events: TaskMessageEventV2[] = [];
  const entries: { event: TaskMessageEventV2; receipts: TaskMessageDeliveryReceiptV2[] }[] = [];
  let historyExists = inspectSafeDirectoryChain(common, directory, false, 'historical event directory');
  try {
    if (input.message_id !== null) { count(); const event = eventAt(input.message_id); historyExists = event !== null; if (event) events.push(event); }
    else if (historyExists) each(directory, name => { const event = eventAt(name.slice(0,-5)); if (!event) fail('task_message_unreadable', 'historical event disappeared'); events.push(event); });
    events.sort((a,b) => a.message_id < b.message_id ? -1 : a.message_id > b.message_id ? 1 : 0);
    for (const event of events.filter(e => input.after === null || e.message_id > input.after).slice(0,input.limit)) {
      entries.push({ event, receipts: receiptsAt(event) });
    }
  } catch (error) { if (!exhausted) throw error; }
  const more = events.filter(e => input.after === null || e.message_id > input.after).length > entries.length;
  const reason = exhausted ?? (more ? 'page' as const : null);
  const coverage: TaskActivityCoverage = { complete: reason === null, reason, scanned, bytes };
  return { history_exists: historyExists, entries, coverage,
    next_cursor: reason === 'page' ? entries.at(-1)?.event.message_id ?? null : null };
  })();
  assertTaskInboxLayoutUnchanged(layoutCommon, layoutIdentity);
  return result;
}

