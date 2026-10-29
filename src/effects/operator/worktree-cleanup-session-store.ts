import { WORKTREE_CLEANUP_MAX_IDS } from '../../core/operator/worktree-cleanup';
/** Node-safe private plan storage used by the existing OAR host. No observer,
 * native FFI, archive writer or deletion actuator is loaded into the host. */
import { constants, openSync, closeSync, fstatSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decodeCleanupSessionRecord, decodeCleanupPlanPreview, type CleanupPlanPreview } from '../../core/operator/worktree-cleanup-session';
import { decodeCleanupAdvice, decodeCleanupPlan, type CleanupAdvice, type CleanupPlan } from '../../core/operator/worktree-cleanup-plan';
import { readSessionArtifact, writeSessionArtifact, writeSessionBytes } from '../terminal/task-session-io';
import { createCleanupPlan, type CleanupObservation } from './worktree-cleanup-plan';
import type { CleanupObservationTarget } from './worktree-cleanup-observation';
import { sessionDirectory } from './doc-session-events';
import { readDocSessionAgent } from './doc-session-agent';

export interface CleanupSessionObservation {
  readonly protocol: 1;
  readonly session_id: string;
  readonly observed_at: string;
  readonly items: readonly { readonly target: CleanupObservationTarget | null; readonly observation: CleanupObservation }[];
}
const KEEP: CleanupAdvice = { recommendation: 'keep', reason: 'Investigation is required.', evidence: ['No deletion is authorized.'], archive: { git: null, private: null } };
const MAX_BYTES = 32 * 1024 * 1024;
function readBounded(path: string): unknown {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600 || stat.size > MAX_BYTES) throw new Error('cleanup_store_unavailable');
    const bytes = Buffer.alloc(stat.size + 1); let used = 0;
    while (used < bytes.length) { const n = readSync(fd, bytes, used, bytes.length - used, used); if (!n) break; used += n; }
    if (used !== stat.size) throw new Error('cleanup_store_changed');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, used)));
  } finally { closeSync(fd); }
}
/** Use the exact persisted bytes for both preflight admission and the durable write. */
function observationBytes(value: CleanupSessionObservation): string {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(bytes) > MAX_BYTES) throw new Error('cleanup_observation_too_large');
  return bytes;
}
export function validateCleanupObservation(value: unknown, sid: string): CleanupSessionObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('cleanup_observation_invalid');
  const v = value as CleanupSessionObservation;
  if (Object.keys(v).sort().join(',') !== 'items,observed_at,protocol,session_id' || v.protocol !== 1 || v.session_id !== sid
    || v.items?.length < 1 || v.items?.length > WORKTREE_CLEANUP_MAX_IDS || typeof v.observed_at !== 'string' || !Number.isFinite(Date.parse(v.observed_at)) || !Array.isArray(v.items)) throw new Error('cleanup_observation_invalid');
  for (const item of v.items) {
    if (!item || Object.keys(item).sort().join(',') !== 'observation,target') throw new Error('cleanup_observation_invalid');
    if (item.target !== null && (Object.keys(item.target).sort().join(',') !== 'id,kind,repository,worktree'
      || item.target.id !== item.observation.worktree.id || !['registered', 'orphan'].includes(item.target.kind)
      || ![item.target.repository, item.target.worktree].every(path => typeof path === 'string' && path.startsWith('/') && !/[\0\r\n]/u.test(path)))) throw new Error('cleanup_target_invalid');
    if (item.target === null && item.observation.loss !== null) throw new Error('cleanup_target_missing');
  }
  // Reuse the one public plan decoder and complete-content fingerprint authority.
  createCleanupPlan(sid, v.items.map(item => ({ observation: item.observation, advice: KEEP })));
  observationBytes(v);
  return v;
}
export function saveCleanupObservation(directory: string, value: CleanupSessionObservation): void {
  validateCleanupObservation(value, value.session_id);
  writeSessionBytes(join(directory, 'cleanup-observation.json'), observationBytes(value));
}
export function readCleanupObservation(env: NodeJS.ProcessEnv, sid: string): CleanupSessionObservation {
  return validateCleanupObservation(readBounded(join(sessionDirectory(env, sid), 'cleanup-observation.json')), sid);
}
export function cleanupSessionPrompt(env: NodeJS.ProcessEnv, sid: string): string {
  const saved = readCleanupObservation(env, sid);
  return JSON.stringify({ session_id: sid, observed_at: saved.observed_at, items: saved.items.map(item => ({
    id: item.observation.worktree.id, target: item.target?.worktree ?? null, worktree: item.observation.worktree,
    loss: item.observation.loss === null ? null : { files: item.observation.loss.changed_paths, ignored: item.observation.loss.ignored, commits: item.observation.loss.commits },
  })) });
}
export function beginCleanupPlan(env: NodeJS.ProcessEnv, sid: string): void {
  writeSessionArtifact(join(sessionDirectory(env, sid), 'cleanup-plan.json'), { state: 'investigating', plan: null }, false);
}
function bindAdvice(saved: CleanupSessionObservation, advice: ReadonlyMap<string, CleanupAdvice>): CleanupPlan {
  if (advice.size !== saved.items.length) throw new Error('cleanup_advice_identity');
  return createCleanupPlan(saved.session_id, saved.items.map(item => {
      const row = advice.get(item.observation.worktree.id);
      if (!row || row.archive.private !== null && row.archive.private.directory !== item.observation.worktree.repository_id) throw new Error('cleanup_advice_identity');
      if ((item.observation.loss === null || item.observation.worktree.judgment === 'red') && row.recommendation !== 'keep') throw new Error('cleanup_advice_unsafe');
      return { observation: item.observation, advice: row };
    }));
}
/** The runtime supplies advice only. The server binds it to saved observations. */
export function saveCleanupAdvice(env: NodeJS.ProcessEnv, sid: string, text: string | null): void {
  const directory = sessionDirectory(env, sid);
  let plan: CleanupPlan | null = null;
  try {
    if (text === null || Buffer.byteLength(text) > 128 * 1024) throw new Error('cleanup_advice_missing');
    const parsed = JSON.parse(text);
    if (!parsed || Object.keys(parsed).join(',') !== 'items' || !Array.isArray(parsed.items)) throw new Error('cleanup_advice_invalid');
    const saved = readCleanupObservation(env, sid);
    const advice = new Map<string, CleanupAdvice>();
    for (const row of parsed.items) {
      if (!row || Object.keys(row).sort().join(',') !== 'advice,id' || typeof row.id !== 'string' || advice.has(row.id)) throw new Error('cleanup_advice_invalid');
      advice.set(row.id, decodeCleanupAdvice(row.advice));
    }
    if (advice.size !== saved.items.length) throw new Error('cleanup_advice_identity');
    plan = bindAdvice(saved, advice);
  } catch { /* Invalid, partial or unsafe advice is not an authorizable plan. */ }
  writeSessionArtifact(join(directory, 'cleanup-plan.json'), { state: plan === null ? 'unavailable' : 'ready', plan }, false);
}
export function readCleanupPlanPreview(env: NodeJS.ProcessEnv, request: { readonly session_id: string }): CleanupPlanPreview {
  const sid = request.session_id, directory = sessionDirectory(env, sid);
  const record = decodeCleanupSessionRecord(readSessionArtifact(join(directory, 'session.json')));
  if (record.session_id !== sid) throw new Error('cleanup_session_identity');
  const saved = readCleanupObservation(env, sid);
  let progress: { state: 'investigating' | 'ready' | 'unavailable'; plan: CleanupPlan | null } = { state: 'investigating', plan: null };
  try {
    const raw = readBounded(join(directory, 'cleanup-plan.json')) as typeof progress;
    if (!raw || Object.keys(raw).sort().join(',') !== 'plan,state' || !['investigating', 'ready', 'unavailable'].includes(raw.state)) throw new Error('cleanup_plan_invalid');
    let plan = raw.plan === null ? null : decodeCleanupPlan(raw.plan);
    if (plan !== null) {
      const bound = bindAdvice(saved, new Map(plan.items.map(item => [item.worktree.id, item.advice])));
      if (!isDeepStrictEqual(plan, bound)) throw new Error('cleanup_plan_observation_mismatch');
      plan = bound;
    }
    progress = { state: raw.state, plan };
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const agent = readDocSessionAgent(directory);
  if (agent !== null && (agent.session_id !== sid || agent.protocol !== 1 || agent.kind !== 'docs_session_agent')) throw new Error('cleanup_agent_identity');
  if (progress.state === 'investigating' && (agent?.state === 'failed' || agent?.state === 'stopped')) progress = { state: 'unavailable', plan: null };
  return decodeCleanupPlanPreview({ protocol: 1, kind: 'operator_worktree_cleanup_preview', session_id: sid,
    runtime: record.runtime, agent: agent?.state ?? null, observed_at: saved.observed_at, ...progress,
    execution: { enabled: false, code: 'cleanup_execution_unavailable' },
  }, request);
}
