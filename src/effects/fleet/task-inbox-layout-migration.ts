/** Offline, exact-byte Task Inbox layout transaction. */
import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TASK_INBOX_RETIREMENT_MARKER, taskInboxRecipientStorageKey } from '../../core/fleet/task-inbox-layout';
import { canonicalTaskMessageEventBytes, canonicalTaskMessageDeliveryReceiptBytes, deriveTaskMessageRecipientKey,
  validateTaskMessageEvent, validateTaskMessageDeliveryReceipt, recipientFromTaskMessageReceipt, type TaskMessageRecipient } from '../../core/fleet/task-message';
import { canonicalTaskReplyCommitBytes, canonicalTaskReplyIntentBytes, validateTaskReplyCommit, validateTaskReplyIntent } from '../../core/fleet/task-reply';
import { createFileExclusiveDurably } from '../evidence/atomic-append';
import { resolveGitCommonDirectory } from '../git/common-directory';
import { acquireExclusiveDirectoryLock, withExclusiveDirectoryLock, type ExclusiveDirectoryLockHandle } from '../locking/exclusive-directory-lock';
import { readLease, taskLockRelativePath } from '../state/coordination-lease-store';
import { assertInboxDirectory, inboxLayoutPaths, inboxPathStat, syncInboxDirectory } from './task-inbox-layout';

type Entry = { path: string; kind: 'directory' } | { path: string; kind: 'file'; size: number; sha256: string };
interface Manifest {
  protocol: 1; kind: 'task-inbox-layout-migration'; common: string; identity: string; from: 1; to: 2;
  source: Entry[]; target: Entry[]; source_sha256: string; target_sha256: string;
}
interface Receipt { manifest: Manifest; manifest_sha256: string; receipt_sha256: string }
export type InboxMigrationBoundary = 'journal-prepared' | 'journal' | 'staged-file' | 'staged' | 'retired' | 'fenced'
  | 'published' | 'receipt' | 'rollback-journal' | 'rollback-staged' | 'rollback-restored'
  | 'rollback-archived' | 'reapply-ready';
export interface InboxMigrationInput {
  repo_root: string;
  mode?: 'dry-run' | 'apply' | 'resume' | 'rollback';
  expected_source_sha256?: string;
  receipt_sha256?: string;
  confirm_quiescent?: boolean;
  /** Fault injection at durable boundaries; never exposed by the CLI. */
  on_boundary?: (boundary: InboxMigrationBoundary) => void;
}
export class TaskInboxMigrationError extends Error {
  readonly code = 'task_inbox_migration_refused';
  constructor(message: string) { super(message); this.name = 'TaskInboxMigrationError'; }
}
function refuse(message: string): never { throw new TaskInboxMigrationError(message); }
function sha(bytes: string | Buffer): string { return `sha256:${createHash('sha256').update(bytes).digest('hex')}`; }
function json(value: unknown): string { return `${JSON.stringify(value)}\n`; }
function equal(a: unknown, b: unknown): boolean { return json(a) === json(b); }
function readFile(path: string, max = Number.MAX_SAFE_INTEGER): Buffer {
  const stat = inboxPathStat(path);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > max) refuse('unsafe or oversized migration file');
  return readFileSync(path);
}
function readObject(path: string): unknown {
  if (inboxPathStat(path)?.nlink !== 1n) refuse('migration metadata must have one owned path');
  const bytes = readFile(path);
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { refuse('migration metadata is malformed'); }
  if (json(value) !== bytes.toString('utf8')) refuse('migration metadata is not canonical');
  return value;
}
function inventory(root: string): Entry[] {
  if (!inboxPathStat(root)?.isDirectory()) refuse('migration tree is missing');
  assertInboxDirectory(root);
  const entries: Entry[] = [];
  const links = new Map<string, { count: bigint; expected: bigint }>();
  function visit(relative: string): void {
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (!name || /[\\\x00-\x1f]/.test(name)) refuse('unsafe migration path');
      const path = relative ? `${relative}/${name}` : name;
      const stat = inboxPathStat(join(root, path));
      if (!stat || stat.isSymbolicLink()) refuse('migration tree changed or contains a link');
      if (stat.isDirectory()) { entries.push({ path, kind: 'directory' }); visit(path); }
      else {
        const bytes = readFile(join(root, path));
        const identity = `${stat.dev}:${stat.ino}`, observed = links.get(identity);
        links.set(identity, { count: (observed?.count ?? 0n) + 1n, expected: stat.nlink });
        entries.push({ path, kind: 'file', size: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  visit('');
  // A publication crash can retain its staging hard link. Every link must be inside the inventoried tree.
  for (const link of links.values()) if (link.count !== link.expected) refuse('migration file has links outside its inventory');
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function canonicalRecord<T>(path: string, validate: (value: unknown) => T, serialize: (value: T) => string): T {
  const bytes = readFile(path);
  const value = validate(JSON.parse(bytes.toString('utf8')));
  if (`${serialize(value)}\n` !== bytes.toString('utf8')) refuse('record bytes are not canonical');
  return value;
}
/** Legacy keys are decoded only inside the explicit offline migration. */
function oldRecipient(key: string): TaskMessageRecipient {
  const fields = key.split(':');
  let recipient: TaskMessageRecipient;
  if (fields[0] === 'claim' && fields.length === 3 && fields[2]?.startsWith('g')) {
    recipient = { kind: 'claim', claim_id: fields[1]!, generation: Number(fields[2].slice(1)) };
  } else if ((fields[0] === 'user' || fields[0] === 'orchestrator') && fields.length === 2) {
    recipient = { kind: fields[0], id: fields[1]! };
  } else return refuse('unknown legacy recipient path');
  if (deriveTaskMessageRecipientKey(recipient) !== key) refuse('non-canonical legacy recipient path');
  return recipient;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function mappedPath(root: string, entry: Entry): string | null {
  const [task, area, id, name, leaf, ...extra] = entry.path.split('/');
  const directory = entry.kind === 'directory';
  if (!task || !/^[a-f0-9]{64}$/.test(task) || extra.length) refuse('unknown Task Inbox path');
  if (!area && directory) return entry.path;
  if (!['events', 'delivery', 'reply-effects', 'staging'].includes(area!)) refuse('unknown Task Inbox area');
  if (!id && directory) return area === 'staging' ? null : entry.path;
  if (area === 'staging') {
    if (!['events', 'delivery', 'reply-effects'].includes(id!) || leaf
      || (name ? directory || !/^\..+\.tmp$/.test(name) : !directory)) refuse('unknown staging residue');
    return null;
  }
  if (area === 'events') {
    if (directory || name || !id?.endsWith('.json')) refuse('unknown event path');
    const event = canonicalRecord(join(root, entry.path), validateTaskMessageEvent, canonicalTaskMessageEventBytes);
    if (task !== event.task_id || id !== `${event.message_id}.json`) refuse('event path identity mismatch');
    return entry.path;
  }
  if (!id || !UUID.test(id)) refuse('invalid message path');
  if (!name && directory) return entry.path;
  const key = area === 'delivery' && name?.endsWith('.json') ? name.slice(0, -5) : name;
  if (!key) refuse('missing legacy recipient');
  const recipient = oldRecipient(key);
  const token = taskInboxRecipientStorageKey(recipient);
  if (area === 'delivery') {
    if (directory || leaf || name !== `${key}.json`) refuse('unknown delivery path');
    const receipt = canonicalRecord(join(root, entry.path), validateTaskMessageDeliveryReceipt, canonicalTaskMessageDeliveryReceiptBytes);
    const actual = recipientFromTaskMessageReceipt(receipt);
    if (receipt.message_id !== id || deriveTaskMessageRecipientKey(actual) !== key) refuse('receipt path identity mismatch');
    const eventPath = join(root, task, 'events', `${id}.json`);
    if (inboxPathStat(eventPath)) {
      const event = canonicalRecord(eventPath, validateTaskMessageEvent, canonicalTaskMessageEventBytes);
      if (event.task_id !== task || event.task_revision !== receipt.recipient_task_revision) refuse('receipt parent identity mismatch');
    }
    return `${task}/${area}/${id}/${token}.json`;
  }
  const target = `${task}/${area}/${id}/${token}`;
  if (!leaf && directory) return target;
  if (directory || (leaf !== 'intent.json' && leaf !== 'commit.json')) refuse('unknown reply path');
  if (leaf === 'intent.json') {
    const intent = canonicalRecord(join(root, entry.path), validateTaskReplyIntent, canonicalTaskReplyIntentBytes);
    const actual = { kind: 'claim' as const, claim_id: intent.claim_actor.claim_id, generation: intent.claim_actor.lease_generation };
    if (intent.parent.task_id !== task || intent.parent.message_id !== id || deriveTaskMessageRecipientKey(actual) !== key) refuse('reply path identity mismatch');
  } else canonicalRecord(join(root, entry.path), validateTaskReplyCommit, canonicalTaskReplyCommitBytes);
  return `${target}/${leaf}`;
}
function buildManifest(common: string, sourceRoot: string): Manifest {
  const stat = inboxPathStat(common)!;
  const identity = `${stat.dev}:${stat.ino}`;
  const source = inventory(sourceRoot);
  const targets = new Set<string>();
  const target = source.flatMap(entry => {
    const path = mappedPath(sourceRoot, entry);
    if (path === null) return [];
    if (targets.has(path.toLowerCase())) refuse('target path collision');
    targets.add(path.toLowerCase());
    return [{ ...entry, path }];
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return { protocol: 1, kind: 'task-inbox-layout-migration', common, identity, from: 1, to: 2, source, target,
    source_sha256: sha(json({ common, identity, source })), target_sha256: sha(json(target)) };
}
function receiptFor(manifest: Manifest): Receipt {
  const basis = { manifest, manifest_sha256: sha(json(manifest)) };
  return { ...basis, receipt_sha256: sha(json(basis)) };
}
function assertTree(root: string, entries: Entry[]): void {
  if (!equal(inventory(root), entries)) refuse('migration tree differs from its frozen inventory');
}
function sourceRoot(common: string): string {
  const p = inboxLayoutPaths(common);
  if (inboxPathStat(p.backup)) {
    if (inboxPathStat(p.legacy)?.isDirectory()) refuse('both legacy and retired trees exist');
    return p.backup;
  }
  return p.legacy;
}
function checkedManifest(common: string, value: unknown): Manifest {
  const observed = buildManifest(common, sourceRoot(common));
  if (!equal(value, observed)) refuse('manifest identity or original bytes changed');
  return observed;
}
function checkedReceipt(common: string, path: string): Receipt {
  const value = readObject(path) as Receipt;
  const expected = receiptFor(checkedManifest(common, value?.manifest));
  if (!equal(value, expected)) refuse('receipt digest mismatch');
  return expected;
}
/** A completed rollback is history, not authority over subsequent v1 writes. */
function checkedRollbackHistory(common: string): Receipt {
  const value = readObject(inboxLayoutPaths(common).rolledBack) as Receipt;
  const manifest = value?.manifest;
  const stat = inboxPathStat(common)!;
  const identity = `${stat.dev}:${stat.ino}`;
  if (!manifest || !Array.isArray(manifest.source) || !Array.isArray(manifest.target)) refuse('invalid rollback receipt');
  const expected: Manifest = { protocol: 1, kind: 'task-inbox-layout-migration', common, identity, from: 1, to: 2,
    source: manifest.source, target: manifest.target,
    source_sha256: sha(json({ common, identity, source: manifest.source })), target_sha256: sha(json(manifest.target)) };
  if (!equal(manifest, expected) || !equal(value, receiptFor(expected))) refuse('rollback receipt identity or digest mismatch');
  return value;
}
function archiveRollback(common: string, input: InboxMigrationInput): void {
  const p = inboxLayoutPaths(common);
  if (!inboxPathStat(p.rolledBack)) return;
  const receipt = checkedRollbackHistory(common);
  const directory = join(p.root, 'migration-history');
  assertInboxDirectory(directory);
  if (!inboxPathStat(directory)) { mkdirSync(directory, { mode: 0o700 }); syncInboxDirectory(p.root); }
  publishMetadata(join(directory, `${receipt.receipt_sha256.slice('sha256:'.length)}.json`), receipt);
  input.on_boundary?.('rollback-archived');
  removeMetadata(p.rolledBack);
  input.on_boundary?.('reapply-ready');
}
/**
 * Prove a recovered path is this transaction's single-link inode holding `bytes` (or, when `prefix`, an
 * interrupted prefix of them). Re-fsyncing such an inode proves nothing after a failed writeback, so callers
 * replace it with a freshly created inode instead of trusting it.
 */
function assertOwnedFile(path: string, bytes: Buffer, prefix: boolean): void {
  assertInboxDirectory(dirname(path));
  const before = inboxPathStat(path);
  if (!before?.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || (prefix ? before.size > BigInt(bytes.length) : before.size !== BigInt(bytes.length))) refuse('unsafe transaction file');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size || !readFileSync(fd).equals(bytes.subarray(0, Number(opened.size)))) {
      refuse('conflicting transaction file');
    }
  } finally { closeSync(fd); }
  const after = inboxPathStat(path);
  if (!after?.isFile() || after.isSymbolicLink() || after.nlink !== 1n
    || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size) {
    refuse('transaction file changed before rewrite');
  }
}

/** Only transaction-owned paths may be rewritten; complete and interrupted files both get a fresh inode. */
function writeOwned(path: string, bytes: Buffer): void {
  if (inboxPathStat(path)) {
    if (inboxPathStat(path)?.nlink !== 1n) refuse('transaction file has multiple paths');
    assertOwnedFile(path, bytes, true);
    unlinkSync(path);
  }
  assertInboxDirectory(dirname(path));
  createFileExclusiveDurably(path, bytes);
  syncInboxDirectory(dirname(path));
}
/** A published path is replaced atomically through its pending sibling, so the authority never disappears. */
function publishMetadata(path: string, value: unknown, beforePublish?: () => void): void {
  const bytes = Buffer.from(json(value));
  if (inboxPathStat(path)) assertOwnedFile(path, bytes, false);
  const pending = `${path}.pending`;
  writeOwned(pending, bytes);
  beforePublish?.();
  renameSync(pending, path);
  syncInboxDirectory(dirname(path));
}
function removeMetadata(path: string): void { if (inboxPathStat(path)) { unlinkSync(path); syncInboxDirectory(dirname(path)); } }
function marker(common: string): void {
  const path = inboxLayoutPaths(common).legacy;
  const bytes = Buffer.from(TASK_INBOX_RETIREMENT_MARKER);
  if (!readFile(path, bytes.length).equals(bytes)) refuse('retirement marker mismatch');
}
function finishForward(common: string, manifest: Manifest, input: InboxMigrationInput): Receipt {
  const p = inboxLayoutPaths(common);
  if (inboxPathStat(p.current)) {
    if (inboxPathStat(p.stage) || !inboxPathStat(p.backup)) refuse('unexpected published migration state');
    marker(common); assertTree(p.current, manifest.target);
    // Only a receipt proves a run rewrote this tree onto fresh inodes. Without one, retract the unobserved
    // publication (runtime stays closed on the journal) and replay staging rather than re-flush old inodes.
    if (!inboxPathStat(p.receipt)) { renameSync(p.current, p.stage); syncInboxDirectory(p.root); }
  }
  if (!inboxPathStat(p.current)) {
    const original = sourceRoot(common);
    checkedManifest(common, manifest);
    assertInboxDirectory(p.stage);
    if (!inboxPathStat(p.stage)) mkdirSync(p.stage, { mode: 0o700 });
    const expected = new Map(manifest.target.map(entry => [entry.path, entry]));
    for (const entry of inventory(p.stage)) {
      const target = expected.get(entry.path);
      if (!target || target.kind !== entry.kind) refuse('unknown staged entry');
    }
    for (const entry of manifest.source) {
      const relative = mappedPath(original, entry);
      if (relative === null) continue;
      const path = join(p.stage, relative);
      if (entry.kind === 'directory') { assertInboxDirectory(path); mkdirSync(path, { recursive: true, mode: 0o700 }); }
      else { writeOwned(path, readFile(join(original, entry.path))); input.on_boundary?.('staged-file'); }
    }
    assertTree(p.stage, manifest.target);
    for (const entry of [...manifest.target].reverse()) if (entry.kind === 'directory') syncInboxDirectory(join(p.stage, entry.path));
    syncInboxDirectory(p.stage); input.on_boundary?.('staged');
    checkedManifest(common, manifest);
    if (original === p.legacy) { renameSync(p.legacy, p.backup); syncInboxDirectory(p.root); input.on_boundary?.('retired'); }
    writeOwned(p.legacy, Buffer.from(TASK_INBOX_RETIREMENT_MARKER)); input.on_boundary?.('fenced');
    renameSync(p.stage, p.current); syncInboxDirectory(p.root); input.on_boundary?.('published');
  }
  marker(common); assertTree(p.current, manifest.target);
  const receipt = receiptFor(manifest);
  publishMetadata(p.receipt, receipt); input.on_boundary?.('receipt');
  removeMetadata(p.journal);
  return receipt;
}
function finishRollback(common: string, manifest: Manifest, input: InboxMigrationInput): Receipt {
  const p = inboxLayoutPaths(common);
  checkedManifest(common, manifest);
  const receipt = receiptFor(manifest);
  const pendingReceipt = `${p.receipt}.pending`;
  if (inboxPathStat(pendingReceipt)) {
    if (inboxPathStat(pendingReceipt)?.nlink !== 1n) refuse('transaction file has multiple paths');
    const expected = Buffer.from(json(receipt));
    const prepared = readFile(pendingReceipt, expected.length);
    if (!expected.subarray(0, prepared.length).equals(prepared)) refuse('conflicting prepared receipt');
    // The inverse owns only this transaction's complete receipt or interrupted prefix.
    removeMetadata(pendingReceipt);
  }
  if (inboxPathStat(p.current)) {
    if (inboxPathStat(p.stage)) refuse('both serving and staged trees exist');
    assertTree(p.current, manifest.target); marker(common);
    renameSync(p.current, p.stage); syncInboxDirectory(p.root); input.on_boundary?.('rollback-staged');
  }
  if (inboxPathStat(p.backup)) {
    if (inboxPathStat(p.legacy)) { marker(common); unlinkSync(p.legacy); }
    renameSync(p.backup, p.legacy); syncInboxDirectory(p.root); input.on_boundary?.('rollback-restored');
  }
  assertTree(p.legacy, manifest.source);
  publishMetadata(p.rolledBack, receipt);
  if (inboxPathStat(p.stage)) {
    // Rollback can also discard an incomplete copy, but only entries and prefixes owned by this manifest.
    const expected = new Map(manifest.target.map(entry => [entry.path, entry]));
    const originals = new Map(manifest.source.map(entry => [mappedPath(p.legacy, entry), entry]));
    for (const entry of inventory(p.stage)) {
      const target = expected.get(entry.path);
      if (!target || target.kind !== entry.kind) refuse('unknown staged rollback entry');
      if (entry.kind === 'file') {
        const source = originals.get(entry.path)!;
        const bytes = readFile(join(p.legacy, source.path));
        const staged = readFile(join(p.stage, entry.path), bytes.length);
        if (!bytes.subarray(0, staged.length).equals(staged)) refuse('conflicting staged rollback bytes');
      }
    }
    rmSync(p.stage, { recursive: true }); syncInboxDirectory(p.root);
  }
  if (inboxPathStat(p.receipt)) checkedReceipt(common, p.receipt);
  removeMetadata(p.receipt); removeMetadata(p.journal); removeMetadata(p.rollback);
  return receipt;
}
function withTasks<T>(input: InboxMigrationInput, manifest: Manifest, run: () => T): T {
  const tasks = manifest.source.filter(entry => entry.kind === 'directory' && !entry.path.includes('/')).map(entry => entry.path);
  const locks: ExclusiveDirectoryLockHandle[] = [];
  try {
    for (const task of tasks) {
      locks.push(acquireExclusiveDirectoryLock(manifest.common, taskLockRelativePath(task)));
      if (readLease(input.repo_root, task).classification !== 'available') refuse('Task execution must be quiescent before migration');
    }
    checkedManifest(manifest.common, manifest);
    locks.forEach(lock => lock.assertOwned());
    return run();
  } finally { for (const lock of locks.reverse()) lock.release(); }
}
export function migrateTaskInboxLayout(input: InboxMigrationInput) {
  const common = resolveGitCommonDirectory(input.repo_root);
  const p = inboxLayoutPaths(common);
  assertInboxDirectory(common); assertInboxDirectory(join(common, 'repo-harness')); assertInboxDirectory(p.root);
  const mode = input.mode ?? 'dry-run';
  function inspect() {
    if (inboxPathStat(p.rollback)) return { state: 'rollback_required', manifest: checkedManifest(common, readObject(p.rollback)) };
    if (inboxPathStat(p.journal)) return { state: 'recovery_required', manifest: checkedManifest(common, readObject(p.journal)) };
    if (inboxPathStat(p.receipt)) {
      const receipt = checkedReceipt(common, p.receipt);
      return { state: 'committed', manifest: receipt.manifest };
    }
    if (inboxPathStat(p.rolledBack)) {
      const receipt = checkedRollbackHistory(common);
      if ([p.current, p.backup, p.stage, `${p.rollback}.pending`].some(path => inboxPathStat(path))) refuse('unexpected completed rollback state');
      if (mode === 'dry-run' || mode === 'apply' || inboxPathStat(`${p.journal}.pending`)) {
        return { state: 'planned', manifest: buildManifest(common, p.legacy) };
      }
      return { state: 'rolled_back', manifest: checkedManifest(common, receipt.manifest) };
    }
    if (!inboxPathStat(p.legacy)) {
      if ([p.backup, p.stage, `${p.journal}.pending`, `${p.rollback}.pending`].some(path => inboxPathStat(path))) refuse('orphan migration artifacts');
      assertInboxDirectory(p.current);
      return { state: 'not_required', manifest: null };
    }
    if ([p.current, p.backup, p.stage].some(path => inboxPathStat(path))) refuse('unexpected pre-migration tree');
    return { state: 'planned', manifest: buildManifest(common, p.legacy) };
  }
  function result(state: string, manifest: Manifest | null) {
    return { ok: true, state, ...(manifest ? receiptFor(manifest) : {}) };
  }
  if (mode === 'dry-run') { const observed = inspect(); return result(observed.state, observed.manifest); }
  if (!input.confirm_quiescent) refuse('--confirm-quiescent is required; stop all repository clients first');
  return withExclusiveDirectoryLock(common, 'repo-harness/task-inbox-migration.lock', () => {
    const observed = inspect();
    const manifest = observed.manifest;
    if (!manifest) refuse('no legacy migration exists');
    if (mode === 'rollback') {
      if (input.receipt_sha256 !== receiptFor(manifest).receipt_sha256) refuse('exact --receipt-sha256 is required');
    } else if (input.expected_source_sha256 !== manifest.source_sha256) refuse('exact --expected-source-sha256 is required');
    if (mode === 'apply' && observed.state !== 'planned') refuse('apply requires a fresh migration; use resume');
    if (mode === 'resume' && observed.state === 'committed' && !inboxPathStat(`${p.rollback}.pending`)) {
      marker(common); assertTree(p.current, manifest.target); return result('committed', manifest);
    }
    if (observed.state === 'rolled_back' && !inboxPathStat(p.rollback)) { assertTree(p.legacy, manifest.source); return result('rolled_back', manifest); }
    const rollback = mode === 'rollback' || observed.state === 'rollback_required' || !!inboxPathStat(`${p.rollback}.pending`);
    if (rollback && inboxPathStat(p.current)) assertTree(p.current, manifest.target);
    // A rollback must consume a prepared forward journal through its exact-byte publication path.
    if (rollback && inboxPathStat(`${p.journal}.pending`)) publishMetadata(p.journal, manifest);
    const journal = rollback ? p.rollback : p.journal;
    publishMetadata(journal, manifest, () => input.on_boundary?.('journal-prepared'));
    input.on_boundary?.(rollback ? 'rollback-journal' : 'journal');
    return withTasks(input, manifest, () => {
      archiveRollback(common, input);
      const receipt = rollback ? finishRollback(common, manifest, input) : finishForward(common, manifest, input);
      return { ok: true, state: rollback ? 'rolled_back' : 'committed', ...receipt };
    });
  });
}
