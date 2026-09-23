import { afterEach, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { buildTaskMessageDeliveryReceipt, buildTaskMessageEvent, canonicalTaskMessageDeliveryReceiptBytes,
  canonicalTaskMessageEventBytes, deriveTaskMessageRecipientKey, type TaskMessageRecipient } from '../../src/core/fleet/task-message';
import { taskInboxRecipientStorageKey } from '../../src/core/fleet/task-inbox-layout';
import { migrateTaskInboxLayout, type InboxMigrationBoundary } from '../../src/effects/fleet/task-inbox-layout-migration';
import { assertTaskInboxLayoutUnchanged, inboxLayoutPaths, inspectTaskInboxLayout } from '../../src/effects/fleet/task-inbox-layout';
import { readTaskMessageDelivery, taskInboxTaskDirectory } from '../../src/effects/fleet/task-inbox';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { createLeaseDirectory } from '../../src/effects/state/coordination-lease-store';

const roots: string[] = [];
const TASK = '1'.repeat(64), REVISION = '2'.repeat(64), ID = '123e4567-e89b-42d3-a456-426614174000';
const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function put(path: string, bytes: string | Buffer) { mkdirSync(resolve(path, '..'), { recursive: true }); writeFileSync(path, bytes); }
function tree(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const result: Record<string, string> = {};
  for (const item of readdirSync(path, { withFileTypes: true })) {
    if (item.isDirectory()) for (const [name, bytes] of Object.entries(tree(join(path, item.name)))) result[`${item.name}/${name}`] = bytes;
    else result[item.name] = readFileSync(join(path, item.name)).toString('base64');
  }
  return result;
}
function fixture(receipts = process.platform !== 'win32') {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'inbox-migration-'))); roots.push(root);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  const common = resolveGitCommonDirectory(root), paths = inboxLayoutPaths(common);
  const event = buildTaskMessageEvent({ message_id: ID, task_id: TASK, task_revision: REVISION,
    scope: 'task', target_claim_id: null, target_generation: null, sender_kind: 'user', sender_id: 'alice',
    sender_trust: 'local_operator', audience: 'user', body: 'Keep these exact bytes. 中文',
    created_at: '2026-09-22T00:00:00Z', in_reply_to: null });
  put(join(paths.legacy, TASK, 'events', `${ID}.json`), `${canonicalTaskMessageEventBytes(event)}\n`);
  const recipients: TaskMessageRecipient[] = receipts ? [
    { kind: 'claim', claim_id: ID, generation: Number.MAX_VALUE },
    { kind: 'user', id: 'Alice' }, { kind: 'user', id: 'bob' },
    { kind: 'orchestrator', id: 'CON.' }, { kind: 'user', id: 'Z'.repeat(128) },
  ] : [];
  for (const recipient of recipients) {
    const receipt = buildTaskMessageDeliveryReceipt({ message_id: ID, recipient, task_revision: REVISION, delivery_channel: 'manual' });
    put(join(paths.legacy, TASK, 'delivery', ID, `${deriveTaskMessageRecipientKey(recipient)}.json`), `${canonicalTaskMessageDeliveryReceiptBytes(receipt)}\n`);
  }
  put(join(paths.legacy, TASK, 'staging/events', '.interrupted.tmp'), 'partial bytes');
  const original = tree(paths.legacy);
  const plan = migrateTaskInboxLayout({ repo_root: root });
  const manifest = plan.manifest;
  if (!manifest) throw new Error('missing fixture manifest');
  const apply = (on_boundary?: (boundary: InboxMigrationBoundary) => void) => migrateTaskInboxLayout({ repo_root: root, mode: 'apply',
    confirm_quiescent: true, expected_source_sha256: manifest.source_sha256, on_boundary });
  const resume = () => migrateTaskInboxLayout({ repo_root: root, mode: 'resume', confirm_quiescent: true, expected_source_sha256: manifest.source_sha256 });
  const rollback = (on_boundary?: (boundary: InboxMigrationBoundary) => void) => migrateTaskInboxLayout({ repo_root: root, mode: 'rollback',
    confirm_quiescent: true, receipt_sha256: plan.receipt_sha256, on_boundary });
  return { root, common, paths, event, recipients, original, plan: { ...plan, manifest }, apply, resume, rollback };
}
test('dry-run is read only, history needs no active sprint, and exact bytes survive migration and rollback', () => {
  const f = fixture();
  const before = tree(f.common);
  expect(migrateTaskInboxLayout({ repo_root: f.root })).toEqual(f.plan);
  expect(tree(f.common)).toEqual(before);
  expect(() => taskInboxTaskDirectory(f.root, TASK)).toThrow('v1 history must be migrated');
  expect(tree(f.common)).toEqual(before);
  const applied = f.apply();
  expect(applied.state).toBe('committed');
  expect(tree(f.paths.backup)).toEqual(f.original);
  expect(readFileSync(join(f.paths.current, TASK, 'events', `${ID}.json`))).toEqual(Buffer.from(f.original[`${TASK}/events/${ID}.json`]!, 'base64'));
  expect(existsSync(join(f.paths.current, TASK, 'staging'))).toBeFalse();
  for (const recipient of f.recipients) {
    const old = f.original[`${TASK}/delivery/${ID}/${deriveTaskMessageRecipientKey(recipient)}.json`]!;
    expect(readFileSync(join(f.paths.current, TASK, 'delivery', ID, `${taskInboxRecipientStorageKey(recipient)}.json`))).toEqual(Buffer.from(old, 'base64'));
    const receipt = readTaskMessageDelivery({ repo_root: f.root, task_id: TASK, message_id: ID, recipient });
    expect(receipt.receipt?.delivery_state).toBe('pending');
  }
  expect(f.resume()).toEqual(applied);
  expect(f.rollback().state).toBe('rolled_back');
  expect(tree(f.paths.legacy)).toEqual(f.original);
  expect(f.resume().state).toBe('rolled_back');
  expect(() => inspectTaskInboxLayout(f.common)).toThrow('v1 history');
});

test.each(['journal-prepared', 'journal', 'staged-file', 'staged', 'retired', 'fenced', 'published', 'receipt'] as const)(
  'interruption at %s keeps runtime closed and resumes idempotently', boundary => {
    const f = fixture();
    expect(() => f.apply(value => { if (value === boundary) throw new Error('interrupted'); })).toThrow('interrupted');
    expect(() => inspectTaskInboxLayout(f.common)).toThrow();
    expect(f.resume().state).toBe('committed');
    expect(f.resume().state).toBe('committed');
    expect(tree(f.paths.backup)).toEqual(f.original);
  });

test.each(['rollback-journal', 'rollback-staged', 'rollback-restored'] as const)('rollback interruption at %s resumes the inverse', boundary => {
  const f = fixture(); f.apply();
  expect(() => f.rollback(value => { if (value === boundary) throw new Error('interrupted'); })).toThrow('interrupted');
  expect(() => inspectTaskInboxLayout(f.common)).toThrow();
  expect(f.resume().state).toBe('rolled_back');
  expect(tree(f.paths.legacy)).toEqual(f.original);
});

test('rollback refuses any later v2 write before modifying either tree', () => {
  const f = fixture(); f.apply();
  put(join(f.paths.current, TASK, 'events', 'later.json'), 'new authoritative bytes');
  const before = tree(f.paths.root);
  expect(() => f.rollback()).toThrow('frozen inventory');
  expect(tree(f.paths.root)).toEqual(before);
});

test.each([false, true])('completed rollback permits a fresh approved upgrade after new v1 writes=%s', changed => {
  const f = fixture(); f.apply(); f.rollback();
  const later = '223e4567-e89b-42d3-a456-426614174000';
  if (changed) put(join(f.paths.legacy, TASK, 'events', `${later}.json`), `${canonicalTaskMessageEventBytes(buildTaskMessageEvent({ ...f.event, message_id: later, body: 'new v1 history' }))}\n`);
  const original = tree(f.paths.legacy);
  const plan = migrateTaskInboxLayout({ repo_root: f.root });
  const result = migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply', confirm_quiescent: true, expected_source_sha256: plan.manifest!.source_sha256 });
  expect(result.state).toBe('committed');
  expect(tree(f.paths.backup)).toEqual(original);
  const history = join(f.paths.root, 'migration-history', `${f.plan.receipt_sha256!.slice('sha256:'.length)}.json`);
  expect(JSON.parse(readFileSync(history, 'utf8')).receipt_sha256).toBe(f.plan.receipt_sha256);
});

test.each([false, true])('rollback clears an interrupted receipt before a fresh upgrade, partial=%s', partial => {
  const f = fixture();
  const rename = fs.renameSync;
  const fault = spyOn(fs, 'renameSync').mockImplementation((source, target) => {
    if (String(target) === f.paths.receipt) throw new Error('receipt publication interrupted');
    return rename(source, target);
  });
  try { expect(() => f.apply()).toThrow('receipt publication interrupted'); }
  finally { fault.mockRestore(); }
  const pending = `${f.paths.receipt}.pending`;
  const prepared = readFileSync(pending);
  if (partial) writeFileSync(pending, prepared.subarray(0, 50));
  expect(f.rollback().state).toBe('rolled_back');
  expect(existsSync(pending)).toBeFalse();
  const later = '223e4567-e89b-42d3-a456-426614174000';
  put(join(f.paths.legacy, TASK, 'events', `${later}.json`), `${canonicalTaskMessageEventBytes(buildTaskMessageEvent({ ...f.event, message_id: later, body: 'history after interrupted receipt rollback' }))}\n`);
  const original = tree(f.paths.legacy);
  const plan = migrateTaskInboxLayout({ repo_root: f.root });
  const applied = migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply', confirm_quiescent: true, expected_source_sha256: plan.manifest!.source_sha256 });
  expect(applied.state).toBe('committed');
  expect(tree(f.paths.backup)).toEqual(original);
  expect(existsSync(pending)).toBeFalse();
});

test.each(['foreign', 'linked'] as const)('rollback preserves an unowned prepared receipt: %s', kind => {
  const f = fixture();
  const rename = fs.renameSync;
  const fault = spyOn(fs, 'renameSync').mockImplementation((source, target) => {
    if (String(target) === f.paths.receipt) throw new Error('receipt publication interrupted');
    return rename(source, target);
  });
  try { expect(() => f.apply()).toThrow('receipt publication interrupted'); }
  finally { fault.mockRestore(); }
  const pending = `${f.paths.receipt}.pending`;
  if (kind === 'foreign') writeFileSync(pending, 'foreign receipt');
  else linkSync(pending, join(f.root, 'outside-receipt'));
  const bytes = readFileSync(pending), current = tree(f.paths.current), backup = tree(f.paths.backup);
  expect(() => f.rollback()).toThrow(kind === 'foreign' ? 'conflicting prepared receipt' : 'multiple paths');
  expect(readFileSync(pending)).toEqual(bytes);
  expect(tree(f.paths.current)).toEqual(current);
  expect(tree(f.paths.backup)).toEqual(backup);
});

test.each(['journal-prepared', 'journal', 'rollback-archived', 'reapply-ready', 'staged', 'retired', 'fenced', 'published', 'receipt'] as const)(
  'fresh migration after rollback recovers at %s and retains both receipts', boundary => {
    for (const rollback of [false, true]) {
      const f = fixture(); f.apply(); f.rollback();
      const later = '223e4567-e89b-42d3-a456-426614174000';
      put(join(f.paths.legacy, TASK, 'events', `${later}.json`), `${canonicalTaskMessageEventBytes(buildTaskMessageEvent({ ...f.event, message_id: later }))}\n`);
      const original = tree(f.paths.legacy), before = tree(f.paths.root);
      const plan = migrateTaskInboxLayout({ repo_root: f.root });
      expect(tree(f.paths.root)).toEqual(before);
      expect(() => f.apply()).toThrow('exact --expected-source');
      const input = { repo_root: f.root, confirm_quiescent: true, expected_source_sha256: plan.manifest!.source_sha256 };
      expect(() => migrateTaskInboxLayout({ ...input, mode: 'apply', on_boundary(value) {
        if (value === boundary) throw new Error('interrupted reapply');
      } })).toThrow('interrupted reapply');
      expect(() => inspectTaskInboxLayout(f.common)).toThrow();
      const result = migrateTaskInboxLayout({ ...input, mode: rollback ? 'rollback' : 'resume', receipt_sha256: plan.receipt_sha256 });
      expect(result.state).toBe(rollback ? 'rolled_back' : 'committed');
      expect(tree(rollback ? f.paths.legacy : f.paths.backup)).toEqual(original);
      if (!rollback) expect(inspectTaskInboxLayout(f.common)).toBeString();
      expect(existsSync(`${f.paths.journal}.pending`)).toBeFalse();
      const history = join(f.paths.root, 'migration-history', `${f.plan.receipt_sha256!.slice('sha256:'.length)}.json`);
      expect(JSON.parse(readFileSync(history, 'utf8')).receipt_sha256).toBe(f.plan.receipt_sha256);
      expect(JSON.parse(readFileSync(rollback ? f.paths.rolledBack : f.paths.receipt, 'utf8')).receipt_sha256).toBe(plan.receipt_sha256);
    }
  });

test('source changes, wrong digest, and unconfirmed operation fail closed', () => {
  const f = fixture();
  expect(() => migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply' })).toThrow('confirm-quiescent');
  expect(() => migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply', confirm_quiescent: true, expected_source_sha256: 'wrong' })).toThrow('exact --expected-source');
  put(join(f.paths.legacy, TASK, 'staging/events', '.another.tmp'), 'new residue');
  expect(() => f.apply()).toThrow('exact --expected-source');
  expect(existsSync(f.paths.current)).toBeFalse();
});

test('unknown lease refuses mutation without interpreting historical recipients as live owners', () => {
  const f = fixture(); createLeaseDirectory(f.root, TASK);
  expect(() => f.apply()).toThrow('quiescent');
  expect(tree(f.paths.legacy)).toEqual(f.original);
  expect(existsSync(f.paths.current)).toBeFalse();
});

test('invalid canonical bytes and forged path identities are rejected before a journal', () => {
  const f = fixture();
  const eventPath = join(f.paths.legacy, TASK, 'events', `${ID}.json`);
  writeFileSync(eventPath, `${JSON.stringify(f.event)}\n`);
  expect(() => migrateTaskInboxLayout({ repo_root: f.root })).toThrow('not canonical');
  writeFileSync(eventPath, `${canonicalTaskMessageEventBytes(f.event)}\n`);
  renameSync(eventPath, join(f.paths.legacy, TASK, 'events', '223e4567-e89b-42d3-a456-426614174000.json'));
  expect(() => migrateTaskInboxLayout({ repo_root: f.root })).toThrow('identity mismatch');
  expect(existsSync(f.paths.journal)).toBeFalse();
});

test.skipIf(process.platform === 'win32')('unsafe links and conflicting staging bytes are never followed or overwritten', () => {
  const f = fixture();
  symlinkSync(f.paths.legacy, join(f.paths.legacy, TASK, 'linked'));
  expect(() => migrateTaskInboxLayout({ repo_root: f.root })).toThrow('link');
  rmSync(join(f.paths.legacy, TASK, 'linked'));
  expect(() => f.apply(boundary => { if (boundary === 'staged-file') throw new Error('interrupted'); })).toThrow();
  put(join(f.paths.stage, TASK, 'events', `${ID}.json`), 'conflict');
  expect(() => f.resume()).toThrow('conflicting');
  expect(tree(f.paths.legacy)).toEqual(f.original);
});

test('prefix writes and a partial prepared journal recover only with the exact approved source', () => {
  const f = fixture();
  expect(() => f.apply(boundary => { if (boundary === 'journal-prepared') throw new Error('interrupted'); })).toThrow();
  const pending = `${f.paths.journal}.pending`;
  const bytes = readFileSync(pending); writeFileSync(pending, bytes.subarray(0, 50));
  expect(f.resume().state).toBe('committed');
});

test.each(['writeSync', 'renameSync', 'fsyncSync'] as const)('%s failure retains source bytes and an explicitly resumable transaction', operation => {
  const f = fixture();
  let fault: ReturnType<typeof spyOn> | undefined;
  try {
    expect(() => f.apply(boundary => {
      if (boundary === 'journal') fault = spyOn(fs, operation).mockImplementation(() => { throw new Error('injected filesystem failure'); });
    })).toThrow('injected filesystem failure');
  } finally { fault?.mockRestore(); }
  expect(tree(f.paths.legacy)).toEqual(f.original);
  expect(() => inspectTaskInboxLayout(f.common)).toThrow();
  expect(f.resume().state).toBe('committed');
});

/** Fail the flush of whichever inode sits at `path`, recording whether that path was unlinked first. */
function faultFlushAt(path: string, message: string) {
  const sync = fs.fsyncSync, unlink = fs.unlinkSync;
  const seen = { unlinked: false, faulted: false, faultedAfterUnlink: false };
  const flush = spyOn(fs, 'fsyncSync').mockImplementation(fd => {
    let at: fs.BigIntStats | null = null;
    try { at = fs.lstatSync(path, { bigint: true }); } catch {}
    const opened = fs.fstatSync(fd, { bigint: true });
    if (at && opened.isFile() && at.dev === opened.dev && at.ino === opened.ino) {
      seen.faulted = true; seen.faultedAfterUnlink = seen.unlinked;
      throw new Error(message);
    }
    return sync(fd);
  });
  const removal = spyOn(fs, 'unlinkSync').mockImplementation(target => {
    if (String(target) === path) seen.unlinked = true;
    return unlink(target);
  });
  return { seen, restore() { flush.mockRestore(); removal.mockRestore(); } };
}
function failFirstFileFlush(f: ReturnType<typeof fixture>, boundary: InboxMigrationBoundary) {
  const sync = fs.fsyncSync;
  let failed = false, fault: ReturnType<typeof spyOn> | undefined;
  try {
    expect(() => f.apply(value => {
      if (value === boundary) fault = spyOn(fs, 'fsyncSync').mockImplementation(fd => {
        if (!failed && fs.fstatSync(fd).isFile()) { failed = true; throw new Error('first flush failed'); }
        return sync(fd);
      });
    })).toThrow('first flush failed');
  } finally { fault?.mockRestore(); }
  expect(failed).toBeTrue();
}

test.each(['staged file', 'retirement marker', 'prepared receipt'] as const)(
  'resume rewrites a complete %s on a fresh inode and publishes no receipt until that flush succeeds', kind => {
    const f = fixture(false);
    const target = kind === 'staged file' ? join(f.paths.stage, TASK, 'events', `${ID}.json`)
      : kind === 'retirement marker' ? f.paths.legacy : `${f.paths.receipt}.pending`;
    failFirstFileFlush(f, kind === 'staged file' ? 'journal' : kind === 'retirement marker' ? 'retired' : 'published');
    const complete = readFileSync(target);
    expect(complete.length).toBeGreaterThan(0);

    const fault = faultFlushAt(target, 'rewrite flush failed');
    try { expect(() => f.resume()).toThrow('rewrite flush failed'); }
    finally { fault.restore(); }
    expect(fault.seen.faultedAfterUnlink).toBeTrue();
    expect(existsSync(f.paths.receipt)).toBeFalse();
    expect(() => inspectTaskInboxLayout(f.common)).toThrow();

    expect(f.resume().state).toBe('committed');
    expect(tree(f.paths.backup)).toEqual(f.original);
    expect(existsSync(`${f.paths.receipt}.pending`)).toBeFalse();
    expect(inspectTaskInboxLayout(f.common)).toBeString();
  });

test('a published tree without a receipt is retracted and rewritten before any receipt', () => {
  const f = fixture(false);
  expect(() => f.apply(value => { if (value === 'published') throw new Error('interrupted after publication'); })).toThrow('interrupted after publication');
  expect(existsSync(f.paths.current)).toBeTrue();
  expect(existsSync(f.paths.receipt)).toBeFalse();
  const fault = faultFlushAt(join(f.paths.stage, TASK, 'events', `${ID}.json`), 'published tree rewrite failed');
  try { expect(() => f.resume()).toThrow('published tree rewrite failed'); }
  finally { fault.restore(); }
  expect(fault.seen.faultedAfterUnlink).toBeTrue();
  expect(existsSync(f.paths.receipt)).toBeFalse();
  expect(() => inspectTaskInboxLayout(f.common)).toThrow();
  expect(f.resume().state).toBe('committed');
  expect(readFileSync(join(f.paths.current, TASK, 'events', `${ID}.json`))).toEqual(Buffer.from(f.original[`${TASK}/events/${ID}.json`]!, 'base64'));
  expect(tree(f.paths.backup)).toEqual(f.original);
});

test('existing published metadata is replaced through a fresh pending inode, never trusted in place', () => {
  const f = fixture(false);
  expect(() => f.apply(value => { if (value === 'journal') throw new Error('interrupted after journal'); })).toThrow('interrupted after journal');
  const journal = readFileSync(f.paths.journal);
  const fault = faultFlushAt(`${f.paths.journal}.pending`, 'journal rewrite failed');
  try { expect(() => f.resume()).toThrow('journal rewrite failed'); }
  finally { fault.restore(); }
  expect(fault.seen.faulted).toBeTrue();
  expect(readFileSync(f.paths.journal)).toEqual(journal);
  expect(existsSync(f.paths.receipt)).toBeFalse();
  expect(f.resume().state).toBe('committed');
  expect(existsSync(f.paths.journal)).toBeFalse();
  expect(existsSync(`${f.paths.journal}.pending`)).toBeFalse();
});

test.each(['external link', 'link during verification', 'replaced before open', 'replaced after verification'] as const)(
  'rewrite refuses a staged file whose ownership changes: %s', kind => {
    const f = fixture(false);
    failFirstFileFlush(f, 'journal');
    const staged = join(f.paths.stage, TASK, 'events', `${ID}.json`);
    const bytes = readFileSync(staged), outside = join(f.root, 'outside.json'), replacement = join(f.root, 'replacement.json');
    const open = fs.openSync, close = fs.closeSync;
    let stagedFd: number | undefined;
    const replace = () => { writeFileSync(replacement, bytes); renameSync(replacement, staged); };
    const opening = spyOn(fs, 'openSync').mockImplementation(((path: fs.PathLike, ...rest: unknown[]) => {
      if (String(path) === staged && stagedFd === undefined) {
        if (kind === 'link during verification') linkSync(staged, outside);
        if (kind === 'replaced before open') replace();
        const fd = (open as (...args: unknown[]) => number)(path, ...rest);
        stagedFd = fd;
        return fd;
      }
      return (open as (...args: unknown[]) => number)(path, ...rest);
    }) as typeof fs.openSync);
    const closing = spyOn(fs, 'closeSync').mockImplementation(fd => {
      close(fd);
      if (fd === stagedFd && kind === 'replaced after verification') { stagedFd = -1; replace(); }
    });
    if (kind === 'external link') linkSync(staged, outside);
    try {
      expect(() => f.resume()).toThrow(kind === 'external link' ? 'links outside its inventory'
        : kind === 'replaced after verification' ? 'transaction file changed before rewrite' : 'conflicting transaction file');
    } finally { opening.mockRestore(); closing.mockRestore(); }
    expect(readFileSync(staged)).toEqual(bytes);
    expect(existsSync(f.paths.receipt)).toBeFalse();
    rmSync(outside, { force: true });
    expect(f.resume().state).toBe('committed');
  });

test('rollback before publication discards only the owned partial stage', () => {
  const f = fixture();
  expect(() => f.apply(boundary => { if (boundary === 'staged-file') throw new Error('interrupted'); })).toThrow();
  expect(f.rollback().state).toBe('rolled_back');
  expect(tree(f.paths.legacy)).toEqual(f.original);
});

test('publication residue may retain an internal hard link but external links refuse migration', () => {
  const f = fixture();
  const source = join(f.paths.legacy, TASK, 'events', `${ID}.json`);
  linkSync(source, join(f.paths.legacy, TASK, 'staging/events', '.published.tmp'));
  const plan = migrateTaskInboxLayout({ repo_root: f.root });
  expect(plan.state).toBe('planned');
  const external = join(f.root, 'external.json'); linkSync(source, external);
  expect(() => migrateTaskInboxLayout({ repo_root: f.root })).toThrow('outside its inventory');
  rmSync(external);
  const original = tree(f.paths.legacy);
  const result = migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply', confirm_quiescent: true, expected_source_sha256: plan.manifest!.source_sha256 });
  expect(result.state).toBe('committed');
  expect(tree(f.paths.backup)).toEqual(original);
});

test('migration keeps independent stage files distinct when default inode numbers collide', () => {
  const f = fixture(false);
  const later = '223e4567-e89b-42d3-a456-426614174000';
  put(join(f.paths.legacy, TASK, 'events', `${later}.json`), `${canonicalTaskMessageEventBytes(buildTaskMessageEvent({
    ...f.event, message_id: later, body: 'a separate authoritative event',
  }))}\n`);
  const original = tree(f.paths.legacy);
  const plan = migrateTaskInboxLayout({ repo_root: f.root });
  const originalLstatSync = fs.lstatSync.bind(fs);
  const stageEvents = join(f.paths.stage, TASK, 'events');
  const currentEvents = join(f.paths.current, TASK, 'events');
  const ids = new Map([[`${ID}.json`, 9007199254740992n], [`${later}.json`, 9007199254740993n]]);
  let defaultStageFileStats = 0, exactStageFileStats = 0;
  let fault: ReturnType<typeof spyOn> | undefined;
  try {
    const result = migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply', confirm_quiescent: true,
      expected_source_sha256: plan.manifest!.source_sha256, on_boundary: boundary => {
      if (boundary !== 'staged-file' || fault) return;
      fault = spyOn(fs, 'lstatSync').mockImplementation(((path: fs.PathLike, options?: fs.StatOptions) => {
        const stat = originalLstatSync(path, options);
        if (!stat) return stat;
        const syntheticIno = stat.isFile() && (dirname(String(path)) === stageEvents || dirname(String(path)) === currentEvents)
          ? ids.get(basename(String(path))) : undefined;
        if (syntheticIno === undefined) return stat;
        if (options?.bigint) {
          exactStageFileStats += 1;
          return new Proxy(stat, { get(target, property, receiver) {
            if (property === 'dev') return 1n;
            if (property === 'ino') return syntheticIno;
            if (property === 'nlink') return stat.nlink;
            return Reflect.get(target, property, receiver);
          } });
        }
        defaultStageFileStats += 1;
        return new Proxy(stat, { get(target, property, receiver) {
          if (property === 'dev') return 1;
          if (property === 'ino') return Number(syntheticIno);
          if (property === 'nlink') return stat.nlink;
          return Reflect.get(target, property, receiver);
        } });
      }) as typeof fs.lstatSync);
      } });
    expect(result.state).toBe('committed');
    expect(tree(f.paths.backup)).toEqual(original);
    const first = fs.lstatSync(join(currentEvents, `${ID}.json`));
    const second = fs.lstatSync(join(currentEvents, `${later}.json`));
    expect(first.ino).toBe(second.ino);
    expect(first.nlink).toBe(1);
    expect(second.nlink).toBe(1);
  } finally {
    fault?.mockRestore();
  }
  expect(defaultStageFileStats).toBeGreaterThanOrEqual(2);
  expect(exactStageFileStats).toBeGreaterThanOrEqual(2);
  const source = originalLstatSync(join(f.paths.backup, TASK, 'events', `${ID}.json`), { bigint: true });
  const second = originalLstatSync(join(f.paths.backup, TASK, 'events', `${later}.json`), { bigint: true });
  expect(source.ino).not.toBe(second.ino);
  expect(source.nlink).toBe(1n);
  expect(second.nlink).toBe(1n);
});

test('layout identity fence distinguishes adjacent exact inode values', () => {
  const f = fixture(false); f.apply();
  const originalLstatSync = fs.lstatSync.bind(fs);
  const exact = [9007199254740992n, 9007199254740993n];
  let epoch = 0, exactCurrentStats = 0;
  const fault = spyOn(fs, 'lstatSync').mockImplementation(((path: fs.PathLike, options?: fs.StatOptions) => {
    const stat = originalLstatSync(path, options);
    if (!stat) return stat;
    if (String(path) !== f.paths.current) return stat;
    const ino = exact[epoch]!;
    if (options?.bigint) {
      exactCurrentStats += 1;
      return new Proxy(stat, { get(target, property, receiver) {
        if (property === 'dev') return 1n;
        if (property === 'ino') return ino;
        return Reflect.get(target, property, receiver);
      } });
    }
    return new Proxy(stat, { get(target, property, receiver) {
      if (property === 'dev') return 1;
      if (property === 'ino') return Number(ino);
      return Reflect.get(target, property, receiver);
    } });
  }) as typeof fs.lstatSync);
  try {
    const identity = inspectTaskInboxLayout(f.common);
    epoch = 1;
    expect(() => assertTaskInboxLayoutUnchanged(f.common, identity)).toThrow('changed during observation');
  } finally {
    fault.mockRestore();
  }
  expect(exactCurrentStats).toBeGreaterThanOrEqual(2);
});

test('migration retains legal event metadata beyond the separate reply-record size limit', () => {
  const f = fixture();
  const event = buildTaskMessageEvent({ ...f.event, sender_id: 'a'.repeat(70000) });
  const relative = join(TASK, 'events', `${ID}.json`);
  const bytes = `${canonicalTaskMessageEventBytes(event)}\n`;
  put(join(f.paths.legacy, relative), bytes);
  const plan = migrateTaskInboxLayout({ repo_root: f.root });
  migrateTaskInboxLayout({ repo_root: f.root, mode: 'apply', confirm_quiescent: true, expected_source_sha256: plan.manifest!.source_sha256 });
  expect(readFileSync(join(f.paths.current, relative), 'utf8')).toBe(bytes);
  expect(readFileSync(join(f.paths.backup, relative), 'utf8')).toBe(bytes);
});

test('layout readers reject legacy reappearance and inconsistent retirement artifacts without writes', () => {
  const f = fixture(); f.apply();
  rmSync(f.paths.legacy); mkdirSync(f.paths.legacy);
  let before = tree(f.paths.root);
  expect(() => inspectTaskInboxLayout(f.common)).toThrow('v1 history');
  expect(tree(f.paths.root)).toEqual(before);
  rmSync(f.paths.legacy, { recursive: true }); before = tree(f.paths.root);
  expect(() => inspectTaskInboxLayout(f.common)).toThrow('inconsistent');
  expect(tree(f.paths.root)).toEqual(before);
});

test('actual process death after retirement resumes from the retained original', () => {
  const f = fixture();
  const module = resolve(import.meta.dir, '../../src/effects/fleet/task-inbox-layout-migration.ts');
  const script = `import { migrateTaskInboxLayout } from ${JSON.stringify(module)}; migrateTaskInboxLayout({repo_root: process.argv[1], mode:'apply', confirm_quiescent:true, expected_source_sha256:process.argv[2], on_boundary:b=>{if(b==='retired')process.exit(73)}});`;
  const child = spawnSync(process.execPath, ['-e', script, f.root, f.plan.manifest.source_sha256], { encoding: 'utf8' });
  expect(child.status, child.stderr).toBe(73);
  expect(f.resume().state).toBe('committed');
  expect(tree(f.paths.backup)).toEqual(f.original);
});

test('CLI is dry by default and requires exclusive mutation flags and quiescence', () => {
  const f = fixture(); const before = tree(f.common);
  const run = (...args: string[]) => spawnSync(process.execPath, [CLI, 'fleet', 'inbox', 'migrate-layout', '--json', ...args], { cwd: f.root, encoding: 'utf8' });
  const dry = run(); expect(dry.status, dry.stderr).toBe(0); expect(JSON.parse(dry.stdout).state).toBe('planned');
  expect(tree(f.common)).toEqual(before);
  expect(run('--apply', '--resume').stderr).toContain('mutually exclusive');
  expect(run('--apply').stderr).toContain('confirm-quiescent');
  const apply = run('--apply', '--confirm-quiescent', '--expected-source-sha256', f.plan.manifest.source_sha256);
  expect(apply.status, apply.stderr).toBe(0); expect(JSON.parse(apply.stdout).state).toBe('committed');
});
