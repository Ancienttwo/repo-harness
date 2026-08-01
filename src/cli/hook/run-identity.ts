/**
 * Single run-identity resolution + minting authority for the hook path
 * (run-identity threading slice).
 *
 * Unified resolution order applied by every consumption point
 * (`event-telemetry.ts`, `command-observed.ts`): `payload.run_id` ->
 * `HOOK_RUN_ID` -> `CODEX_RUN_ID` -> `CLAUDE_RUN_ID` -> session-state lookup
 * by `session_id` -> null. This mirrors the pre-existing chain in
 * `event-telemetry.ts` (`firstString(payload.run_id, env.HOOK_RUN_ID,
 * env.CODEX_RUN_ID, env.CLAUDE_RUN_ID)`), extended with one more fallback
 * tier here rather than duplicated as a second, potentially divergent chain.
 *
 * Minting is SessionStart-only (`mintOrAdoptSessionRunIdentity`): when
 * payload/env already carry an upstream run identity (loop-engine is the
 * upstream authority), it is adopted verbatim and persisted, never minted
 * over. Otherwise a fresh id is minted at most once per `session_id` --
 * re-entry with the same `session_id` and no upstream override reuses the
 * stored value instead of re-minting.
 *
 * Storage: `.ai/harness/state/session-run-identity.json`, a single-slot JSON
 * object (pattern reference: `session-context-budget.ts`'s
 * `session-context-budget.json` -- one current entry, overwritten on the
 * next session rather than an ever-growing map keyed by every historical
 * session_id). Bounded by construction: exactly one entry at all times.
 *
 * Hook processes are one-shot per invocation (`hook-entry.ts` spawns a fresh
 * process per event and exits), so a bare module-level cache safely bounds
 * the state-file read to at most once per invocation regardless of how many
 * call sites in the same process ask for it -- mirrors
 * `state-input-collector.ts`'s private `once()` memoization idiom without
 * importing that unexported helper.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

const STATE_RELATIVE_PATH = '.ai/harness/state/session-run-identity.json';

/** Structural subset of a hook's parsed JSON payload this module needs. */
export interface RunIdentityPayload {
  readonly session_id?: unknown;
  readonly run_id?: unknown;
}

export interface ResolvedRunIdentity {
  readonly sessionId: string | null;
  readonly runId: string | null;
}

interface SessionRunIdentityState {
  readonly protocol: 1;
  readonly session_id: string;
  readonly run_id: string;
  readonly created_at: string;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function firstString(...values: readonly unknown[]): string | null {
  for (const value of values) {
    const resolved = stringField(value);
    if (resolved !== null) return resolved;
  }
  return null;
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

// Module-level, one-shot-per-process memoization (see module doc). A fresh
// hook process starts with both at UNCOMPUTED; `persist` below sets the
// cache directly from the value it just wrote so a same-process re-read
// (e.g. event-telemetry.ts's lookup right after SessionStart's own mint)
// never re-touches disk. Keyed by repoRoot so distinct fixture repos within
// one test process never see each other's cached state.
const UNCOMPUTED = Symbol('run-identity-state-uncomputed');
let cachedRepoRoot: string | typeof UNCOMPUTED = UNCOMPUTED;
let cachedState: SessionRunIdentityState | null | typeof UNCOMPUTED = UNCOMPUTED;

function readStateOnce(repoRoot: string): SessionRunIdentityState | null {
  if (cachedState === UNCOMPUTED || cachedRepoRoot !== repoRoot) {
    cachedRepoRoot = repoRoot;
    cachedState = readStateFile(repoRoot);
  }
  return cachedState;
}

function persist(repoRoot: string, state: SessionRunIdentityState): void {
  writeStateFile(repoRoot, state);
  cachedRepoRoot = repoRoot;
  cachedState = state;
}

/**
 * The unified chain every consumption point applies: `payload.run_id` ->
 * `HOOK_RUN_ID` -> `CODEX_RUN_ID` -> `CLAUDE_RUN_ID` -> session-state lookup
 * by `session_id` -> null. Never mints -- SessionStart's
 * `mintOrAdoptSessionRunIdentity` is the only place a new id is fabricated.
 */
export function resolveRunIdentity(
  repoRoot: string,
  payload: RunIdentityPayload,
  env: NodeJS.ProcessEnv,
): ResolvedRunIdentity {
  const sessionId = firstString(payload.session_id, env.HOOK_SESSION_ID, env.CODEX_SESSION_ID, env.CLAUDE_SESSION_ID);
  const directRunId = firstString(payload.run_id, env.HOOK_RUN_ID, env.CODEX_RUN_ID, env.CLAUDE_RUN_ID);
  if (directRunId) return { sessionId, runId: directRunId };
  if (!sessionId) return { sessionId, runId: null };
  const state = readStateOnce(repoRoot);
  return { sessionId, runId: state && state.session_id === sessionId ? state.run_id : null };
}

/** `run-<timestamp>-<pid>` (pattern reference: `scripts/verify-sprint.sh`'s `run_id="${HOOK_RUN_ID:-${CLAUDE_RUN_ID:-${CODEX_RUN_ID:-run-${run_stamp}-$$}}}"`). */
function mintRunId(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `run-${stamp}-${process.pid}`;
}

/**
 * SessionStart's single minting point. If payload/env already carry an
 * upstream run identity, it is adopted (persisted verbatim, never minted
 * over) -- loop-engine is the upstream authority. Otherwise, a prior stored
 * entry for the SAME session_id is reused untouched (re-entry never changes
 * the id); only a new/absent session_id triggers a fresh mint. Returns null
 * only when no session_id is resolvable at all (nothing to key storage on).
 */
export function mintOrAdoptSessionRunIdentity(
  repoRoot: string,
  payload: RunIdentityPayload,
  env: NodeJS.ProcessEnv,
  now: Date = new Date(),
): string | null {
  const sessionId = firstString(payload.session_id, env.HOOK_SESSION_ID, env.CODEX_SESSION_ID, env.CLAUDE_SESSION_ID);
  if (!sessionId) return null;

  const upstream = firstString(payload.run_id, env.HOOK_RUN_ID, env.CODEX_RUN_ID, env.CLAUDE_RUN_ID);
  if (upstream) {
    persist(repoRoot, { protocol: 1, session_id: sessionId, run_id: upstream, created_at: now.toISOString() });
    return upstream;
  }

  const existing = readStateOnce(repoRoot);
  if (existing && existing.session_id === sessionId) return existing.run_id;

  const minted = mintRunId(now);
  persist(repoRoot, { protocol: 1, session_id: sessionId, run_id: minted, created_at: now.toISOString() });
  return minted;
}
