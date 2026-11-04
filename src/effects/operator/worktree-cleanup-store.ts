/** Server-private cleanup sessions: one plan per session id, with the observations it was built from. */
import { randomUUID } from 'node:crypto';
import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { CleanupLossEvidence } from '../../core/operator/worktree-cleanup-observation';
import { decodeCleanupPlan, type CleanupPlan, type CleanupPlanItem } from '../../core/operator/worktree-cleanup-plan';
import { createFileExclusiveDurably, syncDirectoryDurably } from '../atomic-append';
import type { CleanupObservationTarget } from './worktree-cleanup-observation';
import { cleanupLossSha256 } from './worktree-cleanup-plan';
import { prepareOperatorStateDir } from './write-audit';

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

function privateDirectory(path: string): string {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) throw new Error('worktree cleanup store unsafe');
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

/** The existing private scratch directory that archive staging requires. */
export function cleanupStagingDirectory(env: NodeJS.ProcessEnv, sessionId: string): string {
  return privateDirectory(join(cleanupSessionDirectory(env, sessionId), 'staging'));
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
  const directory = cleanupSessionDirectory(env, plan.session_id), temporary = join(directory, `.plan-${randomUUID()}`);
  createFileExclusiveDurably(temporary, Buffer.from(JSON.stringify({ plan, items: session.items })));
  try { renameSync(temporary, join(directory, 'plan.json')); } catch (error) { unlinkSync(temporary); throw error; }
  syncDirectoryDurably(directory);
}

export function loadCleanupSession(env: NodeJS.ProcessEnv, sessionId: string): CleanupSession {
  const raw = readPrivate(join(cleanupSessionDirectory(env, sessionId), 'plan.json'));
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

const archivePath = (env: NodeJS.ProcessEnv, sessionId: string, item: CleanupPlanItem) =>
  join(cleanupSessionDirectory(env, sessionId), `archive-${item.worktree.id}-${item.plan_sha256}.json`);

export function readCleanupArchiveRecord(env: NodeJS.ProcessEnv, sessionId: string, item: CleanupPlanItem): CleanupArchiveRecord | null {
  return readPrivate(archivePath(env, sessionId, item)) as CleanupArchiveRecord | null;
}

/** Write once. A retry with the same readback is accepted; a different one is refused. */
export function writeCleanupArchiveRecord(env: NodeJS.ProcessEnv, sessionId: string, item: CleanupPlanItem, record: CleanupArchiveRecord): void {
  const existing = readCleanupArchiveRecord(env, sessionId, item);
  if (existing !== null) {
    if (existing.manifest_sha256 !== record.manifest_sha256 || existing.pr !== record.pr) throw new Error('worktree cleanup archive record changed');
    return;
  }
  const path = archivePath(env, sessionId, item);
  createFileExclusiveDurably(path, Buffer.from(JSON.stringify({ manifest_sha256: record.manifest_sha256, pr: record.pr })));
  syncDirectoryDurably(join(path, '..'));
}
