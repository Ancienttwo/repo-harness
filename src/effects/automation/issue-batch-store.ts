import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';
import { createHash, randomUUID } from 'crypto';

import {
  canonicalIssueAuthoringSessionBytes,
  canonicalIssueBatchIntentBytes,
  validateIssueAuthoringSession,
  validateIssueBatchIntent,
  type IssueAuthoringSessionV1,
  type IssueBatchIntentV1,
} from '../../core/automation/issue-batch';
import { developmentCampaignStoreRoot } from './development-campaign-store';
import { withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';

export class IssueBatchStoreError extends Error {
  constructor(readonly code: 'issue_batch_conflict' | 'issue_batch_not_found' | 'issue_batch_persistence_failed' | 'issue_batch_unsafe', message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'IssueBatchStoreError';
  }
}

function fail(code: IssueBatchStoreError['code'], message: string, cause?: unknown): never { throw new IssueBatchStoreError(code, message, cause); }
function safeSegment(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(value)) fail('issue_batch_unsafe', `${label} is invalid`);
  return value;
}
function groupSegment(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 3) fail('issue_batch_unsafe', 'group number is invalid');
  return String(value).padStart(4, '0');
}
function paths(repoRoot: string, campaignId: string, groupNumber: number) {
  const root = resolve(developmentCampaignStoreRoot(repoRoot));
  const campaign = join(root, createHash('sha256').update(safeSegment(campaignId, 'campaign id'), 'utf8').digest('hex'));
  const group = join(campaign, 'groups', groupSegment(groupNumber));
  return { root, campaign, group, intent: join(group, 'intent.json'), sessions: join(group, 'authoring-sessions'), lock: `${relative(root, group)}/locks/authoring.lock` };
}
function fsyncDirectory(path: string): void { const fd = openSync(path, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
function ensure(root: string, target: string): void {
  const scoped = relative(root, target);
  if (!scoped || scoped === '..' || scoped.startsWith(`..${sep}`) || isAbsolute(scoped)) fail('issue_batch_unsafe', 'issue batch store path escapes its root');
  let current = root;
  for (const segment of scoped.split(sep)) {
    current = join(current, segment);
    if (!existsSync(current)) { mkdirSync(current, { mode: 0o700 }); fsyncDirectory(dirname(current)); }
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('issue_batch_unsafe', `unsafe issue batch directory: ${current}`);
  }
}
function regular(path: string): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) fail('issue_batch_unsafe', `unsafe issue batch file: ${path}`);
  return readFileSync(path);
}
function writeAll(fd: number, bytes: Buffer): void { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); }
function immutable(path: string, bytes: Buffer): void {
  if (existsSync(path)) {
    if (!regular(path).equals(bytes)) fail('issue_batch_conflict', `${path} names different immutable bytes`);
    return;
  }
  const temporary = join(dirname(path), `.${process.pid}.${randomUUID()}.tmp`);
  let fd: number | null = null;
  try {
    fd = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeAll(fd, bytes); fsyncSync(fd); closeSync(fd); fd = null;
    renameSync(temporary, path); fsyncDirectory(dirname(path));
  } catch (error) { fail('issue_batch_persistence_failed', `cannot persist issue batch file ${path}`, error); }
  finally { if (fd !== null) closeSync(fd); try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}
function parse<T>(path: string, validate: (value: unknown) => T, canonical: (value: T) => string): T {
  if (!existsSync(path)) fail('issue_batch_not_found', `issue batch artifact is missing: ${path}`);
  const bytes = regular(path); let value: T;
  try { value = validate(JSON.parse(bytes.toString('utf8'))); }
  catch (error) { return fail('issue_batch_conflict', `issue batch artifact is invalid: ${path}`, error); }
  if (!bytes.equals(Buffer.from(`${canonical(value)}\n`, 'utf8'))) fail('issue_batch_conflict', `issue batch artifact is non-canonical: ${path}`);
  return value;
}

export function persistIssueBatchIntent(repoRoot: string, intentInput: IssueBatchIntentV1): IssueBatchIntentV1 {
  const intent = validateIssueBatchIntent(intentInput); const value = paths(repoRoot, intent.campaign_id, intent.group_number);
  return withExclusiveDirectoryLock(value.root, value.lock, () => {
    ensure(value.root, value.campaign); ensure(value.root, value.group); ensure(value.root, value.sessions);
    immutable(value.intent, Buffer.from(`${canonicalIssueBatchIntentBytes(intent)}\n`, 'utf8'));
    return intent;
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function readIssueBatchIntent(repoRoot: string, campaignId: string, groupNumber: number, intentSha256: string): IssueBatchIntentV1 {
  const value = paths(repoRoot, campaignId, groupNumber);
  if (!/^sha256:[0-9a-f]{64}$/u.test(intentSha256)) fail('issue_batch_unsafe', 'intent digest is invalid');
  const intent = parse(value.intent, validateIssueBatchIntent, canonicalIssueBatchIntentBytes);
  if (intent.intent_sha256 !== intentSha256) fail('issue_batch_not_found', 'issue batch intent digest does not name the group intent');
  return intent;
}

export function persistIssueAuthoringSession(repoRoot: string, campaignId: string, groupNumber: number, sessionInput: IssueAuthoringSessionV1): IssueAuthoringSessionV1 {
  const session = validateIssueAuthoringSession(sessionInput); const value = paths(repoRoot, campaignId, groupNumber);
  return withExclusiveDirectoryLock(value.root, value.lock, () => {
    ensure(value.root, value.campaign); ensure(value.root, value.group); ensure(value.root, value.sessions);
    readIssueBatchIntent(repoRoot, campaignId, groupNumber, session.intent_sha256);
    immutable(join(value.sessions, `${session.session_sha256.slice('sha256:'.length)}.json`), Buffer.from(`${canonicalIssueAuthoringSessionBytes(session)}\n`, 'utf8'));
    return session;
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function issueBatchGroupStoreRoot(repoRoot: string, campaignId: string, groupNumber: number): string { return paths(repoRoot, campaignId, groupNumber).group; }
