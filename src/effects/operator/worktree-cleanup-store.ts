/** Server-private cleanup sessions: one plan per session id, with the observations it was built from. */
import { randomUUID } from 'node:crypto';
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { decodeCleanupInvestigationJob, type CleanupInvestigationJob } from '../../core/operator/worktree-cleanup-investigation';
import type { CleanupLossEvidence } from '../../core/operator/worktree-cleanup-observation';
import { decodeCleanupPlan, type CleanupPlan, type CleanupPlanItem } from '../../core/operator/worktree-cleanup-plan';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../atomic-append';
import type { CleanupObservationTarget } from './worktree-cleanup-observation';
import { cleanupLossSha256 } from './worktree-cleanup-plan';
import { operatorStateDir, prepareOperatorStateDir } from './write-audit';

const SESSION = /^[a-f0-9]{32}$/u;

/** Never sent to the browser. The plan item's loss digest binds `loss`. */
export interface CleanupPrivateItem {
  readonly target: CleanupObservationTarget;
  readonly loss: CleanupLossEvidence | null;
}
export interface CleanupSession {
  readonly plan: CleanupPlan;
  readonly items: Readonly<Record<string, CleanupPrivateItem>>;
}
/** Written before removal starts; the trash receipt binds the same values. */
export interface CleanupArchiveRecord { readonly manifest_sha256: string; readonly pr: string | null }

export class CleanupSessionMissing extends Error {
  constructor() { super('worktree cleanup session not found'); }
}

function assertPrivateDirectory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error('worktree cleanup store unsafe');
}
function privateDirectory(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertPrivateDirectory(path);
  return path;
}
function readPrivate(path: string): unknown {
  let stat;
  try { stat = lstatSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600) throw new Error('worktree cleanup store unsafe');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return JSON.parse(readFileSync(fd, 'utf8')); } finally { closeSync(fd); }
}

export function cleanupSessionDirectory(env: NodeJS.ProcessEnv, sessionId: string): string {
  if (!SESSION.test(sessionId)) throw new Error('worktree cleanup session id invalid');
  return privateDirectory(join(privateDirectory(join(prepareOperatorStateDir(env), 'worktree-cleanup')), sessionId));
}
/** Read paths create nothing: an unknown session leaves no directory behind. Null means that no file can exist. */
function sessionFile(env: NodeJS.ProcessEnv, sessionId: string, name: string): string | null {
  if (!SESSION.test(sessionId)) throw new Error('worktree cleanup session id invalid');
  const store = join(operatorStateDir(env), 'worktree-cleanup'), directory = join(store, sessionId);
  for (const path of [store, directory]) {
    try { assertPrivateDirectory(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  return join(directory, name);
}

/** The existing private scratch directory that archive staging requires. */
export function cleanupStagingDirectory(env: NodeJS.ProcessEnv, sessionId: string): string {
  return privateDirectory(join(cleanupSessionDirectory(env, sessionId), 'staging'));
}

/** Replace one private session file atomically. */
function replacePrivate(env: NodeJS.ProcessEnv, sessionId: string, name: string, value: unknown): void {
  const directory = cleanupSessionDirectory(env, sessionId), temporary = join(directory, `.${name}-${randomUUID()}`);
  createFileExclusiveDurably(temporary, Buffer.from(JSON.stringify(value)));
  try { renameSync(temporary, join(directory, name)); } catch (error) { unlinkSync(temporary); throw error; }
  syncDirectoryDurably(directory);
}

/** Replace the session plan atomically. The private items must be exactly the plan items, bound by their loss digests. */
export function saveCleanupSession(env: NodeJS.ProcessEnv, session: CleanupSession): void {
  const plan = decodeCleanupPlan(session.plan);
  const ids = plan.items.map(item => item.worktree.id);
  if (Object.keys(session.items).sort().join(',') !== [...ids].sort().join(',')) throw new Error('worktree cleanup session items invalid');
  for (const item of plan.items) {
    const own = session.items[item.worktree.id]!;
    if (own.target.id !== item.worktree.id || cleanupLossSha256({ worktree: item.worktree, loss: own.loss }) !== item.loss_sha256) throw new Error('worktree cleanup session items invalid');
  }
  replacePrivate(env, plan.session_id, 'plan.json', { plan, items: session.items });
}

export function loadCleanupSession(env: NodeJS.ProcessEnv, sessionId: string): CleanupSession {
  const path = sessionFile(env, sessionId, 'plan.json'), raw = path === null ? null : readPrivate(path);
  if (raw === null) throw new CleanupSessionMissing();
  const record = raw as { plan: unknown; items: Record<string, CleanupPrivateItem> };
  const plan = decodeCleanupPlan(record.plan);
  if (plan.session_id !== sessionId) throw new Error('worktree cleanup session changed');
  for (const item of plan.items) {
    const own = record.items?.[item.worktree.id];
    if (!own || own.target.id !== item.worktree.id || cleanupLossSha256({ worktree: item.worktree, loss: own.loss }) !== item.loss_sha256) throw new Error('worktree cleanup session changed');
  }
  return { plan, items: record.items };
}

const archiveName = (item: CleanupPlanItem) => `archive-${item.worktree.id}-${item.plan_sha256}.json`;

export function readCleanupArchiveRecord(env: NodeJS.ProcessEnv, sessionId: string, item: CleanupPlanItem): CleanupArchiveRecord | null {
  const path = sessionFile(env, sessionId, archiveName(item));
  return (path === null ? null : readPrivate(path)) as CleanupArchiveRecord | null;
}

/** Write once. A retry with the same readback is accepted; a different one is refused. */
export function writeCleanupArchiveRecord(env: NodeJS.ProcessEnv, sessionId: string, item: CleanupPlanItem, record: CleanupArchiveRecord): void {
  const existing = readCleanupArchiveRecord(env, sessionId, item);
  if (existing !== null) {
    if (existing.manifest_sha256 !== record.manifest_sha256 || existing.pr !== record.pr) throw new Error('worktree cleanup archive record changed');
    return;
  }
  const path = join(cleanupSessionDirectory(env, sessionId), archiveName(item));
  createFileExclusiveDurably(path, Buffer.from(JSON.stringify({ manifest_sha256: record.manifest_sha256, pr: record.pr })));
  syncDirectoryDurably(join(path, '..'));
}

/** The latest investigation job of a session. One record per session: a new job replaces it. */
export function saveCleanupInvestigation(env: NodeJS.ProcessEnv, job: CleanupInvestigationJob): void {
  replacePrivate(env, job.session_id, 'investigation.json', decodeCleanupInvestigationJob(job));
}

export function loadCleanupInvestigation(env: NodeJS.ProcessEnv, sessionId: string): CleanupInvestigationJob | null {
  const path = sessionFile(env, sessionId, 'investigation.json'), raw = path === null ? null : readPrivate(path);
  if (raw === null) return null;
  const job = decodeCleanupInvestigationJob(raw);
  if (job.session_id !== sessionId) throw new Error('worktree cleanup investigation changed');
  return job;
}
