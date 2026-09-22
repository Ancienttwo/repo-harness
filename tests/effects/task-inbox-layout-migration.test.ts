import { afterEach, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildTaskMessageDeliveryReceipt, buildTaskMessageEvent, canonicalTaskMessageDeliveryReceiptBytes,
  canonicalTaskMessageEventBytes, deriveTaskMessageRecipientKey, type TaskMessageRecipient } from '../../src/core/fleet/task-message';
import { taskInboxRecipientStorageKey } from '../../src/core/fleet/task-inbox-layout';
import { migrateTaskInboxLayout, type InboxMigrationBoundary } from '../../src/effects/fleet/task-inbox-layout-migration';
import { inboxLayoutPaths, inspectTaskInboxLayout } from '../../src/effects/fleet/task-inbox-layout';
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
