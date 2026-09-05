import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeSync } from 'fs';
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
import { canonicalMessageBytes, canonicalMessageDigest } from '../../core/messages/mechanics';
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
  const heartbeat = join(group, 'heartbeat');
  return {
    root, campaign, group, intent: join(group, 'intent.json'), sessions: join(group, 'authoring-sessions'), heartbeat,
    reservations: join(heartbeat, 'reservations'), results: join(heartbeat, 'results'), receipts: join(heartbeat, 'receipts'),
    lock: `${relative(root, group)}/locks/authoring.lock`,
  };
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
  if (intent.campaign_id !== campaignId || intent.group_number !== groupNumber) fail('issue_batch_not_found', 'issue batch intent is stored under another campaign group');
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

export function listIssueAuthoringSessions(repoRoot: string, campaignId: string, groupNumber: number, intentSha256?: string): readonly IssueAuthoringSessionV1[] {
  const value = paths(repoRoot, campaignId, groupNumber);
  if (!existsSync(value.sessions)) return Object.freeze([]);
  const sessions = readdirSync(value.sessions, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/u.test(entry.name)) fail('issue_batch_unsafe', `unexpected authoring session entry: ${entry.name}`);
    const session = parse(join(value.sessions, entry.name), validateIssueAuthoringSession, canonicalIssueAuthoringSessionBytes);
    if (entry.name !== `${session.session_sha256.slice('sha256:'.length)}.json`) fail('issue_batch_conflict', 'authoring session filename does not bind its immutable content');
    return session;
  }).filter((session) => intentSha256 === undefined || session.intent_sha256 === intentSha256)
    .sort((left, right) => left.created_at.localeCompare(right.created_at) || left.session_sha256.localeCompare(right.session_sha256));
  return Object.freeze(sessions);
}

export function assertIssueAuthoringSourceSession(
  repoRoot: string,
  campaignId: string,
  groupNumber: number,
  intentSha256: string,
  sessionRef: string,
): IssueAuthoringSessionV1 {
  const value = paths(repoRoot, campaignId, groupNumber);
  return withExclusiveDirectoryLock(value.root, value.lock, () => {
    readIssueBatchIntent(repoRoot, campaignId, groupNumber, intentSha256);
    if (!existsSync(value.sessions)) fail('issue_batch_not_found', 'source session does not belong to the issue batch intent');
    for (const entry of readdirSync(value.sessions, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/u.test(entry.name)) fail('issue_batch_unsafe', `unexpected issue authoring session entry: ${entry.name}`);
      const session = parse(join(value.sessions, entry.name), validateIssueAuthoringSession, canonicalIssueAuthoringSessionBytes);
      if (entry.name !== `${session.session_sha256.slice('sha256:'.length)}.json`) fail('issue_batch_conflict', 'issue authoring session filename does not bind its immutable content');
      if (session.session_ref === sessionRef && session.intent_sha256 === intentSha256) return session;
    }
    return fail('issue_batch_not_found', 'source session does not belong to the issue batch intent');
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export type IssueBatchJournalCategory = 'reservations' | 'results' | 'receipts';

function journalDirectory(value: ReturnType<typeof paths>, category: IssueBatchJournalCategory): string {
  if (category === 'reservations') return value.reservations;
  if (category === 'results') return value.results;
  if (category === 'receipts') return value.receipts;
  return fail('issue_batch_unsafe', 'journal category is invalid');
}

/** The campaign step owns and validates the canonical record schema; this store only supplies atomic immutable bytes. */
export function persistIssueBatchJournalRecord(repoRoot: string, campaignId: string, groupNumber: number, category: IssueBatchJournalCategory, digest: string, canonicalBytes: string): string {
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) fail('issue_batch_unsafe', 'journal digest is invalid');
  if (!canonicalBytes.endsWith('\n')) fail('issue_batch_unsafe', 'journal bytes must be canonical and newline terminated');
  const value = paths(repoRoot, campaignId, groupNumber);
  return withExclusiveDirectoryLock(value.root, value.lock, () => {
    ensure(value.root, value.campaign); ensure(value.root, value.group); ensure(value.root, value.heartbeat);
    const directory = journalDirectory(value, category); ensure(value.root, directory);
    const target = join(directory, `${digest.slice('sha256:'.length)}.json`);
    immutable(target, Buffer.from(canonicalBytes, 'utf8'));
    return target;
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

export function listIssueBatchJournalRecords(repoRoot: string, campaignId: string, groupNumber: number, category: IssueBatchJournalCategory): readonly unknown[] {
  const value = paths(repoRoot, campaignId, groupNumber);
  const directory = journalDirectory(value, category);
  if (!existsSync(directory)) return Object.freeze([]);
  return Object.freeze(readdirSync(directory, { withFileTypes: true }).map((entry) => {
    if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/u.test(entry.name)) fail('issue_batch_unsafe', `unexpected heartbeat journal entry: ${entry.name}`);
    let parsed: unknown;
    try { parsed = JSON.parse(regular(join(directory, entry.name)).toString('utf8')); }
    catch (error) { return fail('issue_batch_conflict', `heartbeat journal record is malformed: ${entry.name}`, error); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('issue_batch_conflict', `heartbeat journal record is not an object: ${entry.name}`);
    const value = parsed as Record<string, unknown>;
    const digestField = category === 'reservations' ? 'reservation_sha256' : category === 'results' ? 'result_sha256' : 'step_receipt_sha256';
    const storedDigest = value[digestField];
    if (typeof storedDigest !== 'string') fail('issue_batch_conflict', `heartbeat journal record has no ${digestField}: ${entry.name}`);
    const { [digestField]: _digest, ...basis } = value;
    if (canonicalMessageDigest(basis) !== storedDigest || entry.name !== `${storedDigest.slice('sha256:'.length)}.json`) {
      fail('issue_batch_conflict', `heartbeat journal record content identity is invalid: ${entry.name}`);
    }
    if (!regular(join(directory, entry.name)).equals(Buffer.from(`${canonicalMessageBytes(value)}\n`, 'utf8'))) {
      fail('issue_batch_conflict', `heartbeat journal record is non-canonical: ${entry.name}`);
    }
    return parsed;
  }));
}
export function issueBatchGroupStoreRoot(repoRoot: string, campaignId: string, groupNumber: number): string { return paths(repoRoot, campaignId, groupNumber).group; }

export type IssueBatchAdoptionArtifact = 'challenge' | 'response' | 'completed-response' | 'seal-sources' | 'adoption' | 'publication';
function adoptionArtifactPath(value: ReturnType<typeof paths>, name: IssueBatchAdoptionArtifact): string {
  if (!['challenge', 'response', 'completed-response', 'seal-sources', 'adoption', 'publication'].includes(name)) fail('issue_batch_unsafe', 'invalid adoption artifact');
  return join(value.group, 'adoption', `${name}.json`);
}
/** Each named artifact is immutable; the caller owns its schema and verifies authority on reuse. */
export function persistIssueBatchAdoptionArtifact(repoRoot: string, intent: IssueBatchIntentV1, name: IssueBatchAdoptionArtifact, record: Record<string, unknown>): void {
  const value = paths(repoRoot, intent.campaign_id, intent.group_number);
  withExclusiveDirectoryLock(value.root, value.lock, () => {
    readIssueBatchIntent(repoRoot, intent.campaign_id, intent.group_number, intent.intent_sha256);
    ensure(value.root, join(value.group, 'adoption'));
    const basis = { intent_sha256: intent.intent_sha256, name, record };
    immutable(adoptionArtifactPath(value, name), Buffer.from(`${canonicalMessageBytes({ ...basis, artifact_sha256: canonicalMessageDigest(basis) })}\n`));
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}
export function readIssueBatchAdoptionArtifact(repoRoot: string, intent: IssueBatchIntentV1, name: IssueBatchAdoptionArtifact): Record<string, unknown> | null {
  const value = paths(repoRoot, intent.campaign_id, intent.group_number);
  const path = adoptionArtifactPath(value, name);
  if (!existsSync(path)) return null;
  const bytes = regular(path).toString('utf8');
  const parsed = JSON.parse(bytes);
  const { artifact_sha256: digest, ...basis } = parsed;
  if (basis.intent_sha256 !== intent.intent_sha256 || basis.name !== name || !basis.record || typeof basis.record !== 'object'
    || canonicalMessageDigest(basis) !== digest || `${canonicalMessageBytes(parsed)}\n` !== bytes) fail('issue_batch_conflict', 'adoption artifact identity differs');
  return basis.record;
}
export function withIssueBatchPublicationLock<T>(repoRoot: string, intent: IssueBatchIntentV1, fn: () => T): T {
  const value = paths(repoRoot, intent.campaign_id, intent.group_number);
  return withExclusiveDirectoryLock(value.root, `${value.lock}-publication`, fn, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}

/** BRC6 serializes snapshot staging with seal creation; only a budget terminal freezes the staged source set. */
export function withIssueBatchSealSources<T>(repoRoot: string, intent: IssueBatchIntentV1, sources: Record<string, unknown>, readTerminal: () => T | null, sealTerminal: () => T): T {
  const value = paths(repoRoot, intent.campaign_id, intent.group_number);
  return withExclusiveDirectoryLock(value.root, `${value.lock}-seal`, () => {
    const terminal = readTerminal();
    const existing = readIssueBatchAdoptionArtifact(repoRoot, intent, 'seal-sources');
    if (terminal !== null) {
      if (!existing || canonicalMessageBytes(existing) !== canonicalMessageBytes(sources)) fail('issue_batch_conflict', 'sealed provider source revisions differ or are unavailable');
      return terminal;
    }
    // A failed or interrupted pre-seal attempt grants no authority over later authorized authoring.
    if (existing) { unlinkSync(adoptionArtifactPath(value, 'seal-sources')); fsyncDirectory(join(value.group, 'adoption')); }
    persistIssueBatchAdoptionArtifact(repoRoot, intent, 'seal-sources', sources);
    return sealTerminal();
  }, { reclaimStaleEmptyDirectory: true, reclaimStaleOwner: true });
}
