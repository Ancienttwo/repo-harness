/**
 * Hook identity: one resolution per hook process, from the host payload only.
 *
 * `session_id`, `run_id` and `turn_id` come from the payload. Claude, Codex
 * and the Pi bridge all put them there; no environment alias is read. When the
 * payload has no `run_id`, the run is the one SessionStart stored for the same
 * `session_id`.
 *
 * SessionStart is the only minting point. An upstream `run_id` in its payload
 * is adopted and stored verbatim. Otherwise a stored entry for the same
 * `session_id` is reused, and only a new `session_id` mints a fresh id.
 *
 * Storage: `.ai/harness/state/session-run-identity.json`, one slot that the
 * next session overwrites.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { payloadIdentityField, type HookIdentity, type HookPayload } from './hook-input';
import type { HookEvent, RouteHost } from './route-registry';

const STATE_RELATIVE_PATH = '.ai/harness/state/session-run-identity.json';

interface SessionRunIdentityState {
  readonly protocol: 1;
  readonly session_id: string;
  readonly run_id: string;
  readonly created_at: string;
}

function isSessionRunIdentityState(value: unknown): value is SessionRunIdentityState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<SessionRunIdentityState>;
  return state.protocol === 1
    && typeof state.session_id === 'string' && state.session_id.length > 0
    && typeof state.run_id === 'string' && state.run_id.length > 0
    && typeof state.created_at === 'string';
}

function readStateFile(repoRoot: string): SessionRunIdentityState | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(repoRoot, STATE_RELATIVE_PATH), 'utf-8'));
    return isSessionRunIdentityState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeStateFile(repoRoot: string, state: SessionRunIdentityState): void {
  const target = join(repoRoot, STATE_RELATIVE_PATH);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
}

function mintRunId(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `run-${stamp}-${process.pid}`;
}

function sessionStartRunId(repoRoot: string, sessionId: string | null, upstream: string | null, now: Date): string | null {
  if (!sessionId) return upstream;
  if (upstream) {
    writeStateFile(repoRoot, { protocol: 1, session_id: sessionId, run_id: upstream, created_at: now.toISOString() });
    return upstream;
  }
  const existing = readStateFile(repoRoot);
  if (existing && existing.session_id === sessionId) return existing.run_id;
  const minted = mintRunId(now);
  writeStateFile(repoRoot, { protocol: 1, session_id: sessionId, run_id: minted, created_at: now.toISOString() });
  return minted;
}

function storedRunId(repoRoot: string, sessionId: string | null): string | null {
  if (!sessionId) return null;
  const state = readStateFile(repoRoot);
  return state && state.session_id === sessionId ? state.run_id : null;
}

export function resolveHookIdentity(
  repoRoot: string,
  event: HookEvent,
  payload: HookPayload,
  host: RouteHost,
  now: Date = new Date(),
): HookIdentity {
  const sessionId = payloadIdentityField(payload, 'session_id');
  const payloadRunId = payloadIdentityField(payload, 'run_id');
  const runId = event === 'SessionStart'
    ? sessionStartRunId(repoRoot, sessionId, payloadRunId, now)
    : payloadRunId ?? storedRunId(repoRoot, sessionId);
  return { host, sessionId, runId, turnId: payloadIdentityField(payload, 'turn_id') };
}
