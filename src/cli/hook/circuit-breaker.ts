import { createHash, randomUUID } from 'crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import type { WorkflowProfile } from '../../core/workflow/profile';

export type CircuitKind = 'guard' | 'review' | 'subagent' | 'repair' | 'cross-model-consult';

export interface CircuitAttempt {
  readonly kind: CircuitKind;
  readonly guard: string;
  readonly reason: string;
  readonly pathOrAction: string;
  readonly progressToken: string;
  readonly fingerprint: string;
  readonly profile: WorkflowProfile;
  readonly explicitHighRiskContract?: boolean;
  readonly riskTriggeredConsult?: boolean;
  readonly userRequestedConsult?: boolean;
  readonly strongBoundary?: boolean;
}

export interface CircuitDecision {
  readonly protocol: 1;
  readonly allowed: boolean;
  readonly tripped: boolean;
  readonly guard: string;
  readonly reason: string;
  readonly path_action: string;
  readonly progress_token: string;
  readonly repeat_count: number;
  readonly limit: number;
  readonly required_action: string;
  readonly explicit_override_command: string | null;
}

interface PersistedCircuitState {
  protocol: 1;
  entries: Record<string, { count: number; token: string }>;
  updated_at: string;
}

const STATE_PATH = '.ai/harness/state/circuit-breaker.json';
const LOCK_PATH = `${STATE_PATH}.lock`;
const LOCK_TIMEOUT_MS = 2_000;
const LOCK_POLL_MS = 5;
const LOCK_WAIT = new Int32Array(new SharedArrayBuffer(4));

interface CircuitLockOwner {
  protocol: 1;
  pid: number;
  token: string;
  acquired_at: string;
}

export function circuitLimit(attempt: CircuitAttempt): number {
  switch (attempt.kind) {
    case 'guard': return 2;
    case 'review': return attempt.profile === 'strict' ? 2 : 1;
    case 'subagent': return attempt.profile === 'strict' && attempt.explicitHighRiskContract ? 3 : 2;
    case 'repair': return 2;
    case 'cross-model-consult':
      return attempt.riskTriggeredConsult || attempt.userRequestedConsult ? 1 : 0;
  }
}

function keyFor(attempt: CircuitAttempt): string {
  // A missing/empty progressToken must still hash to one stable value so
  // repeats keep accumulating against the same key (fail closed, breaker
  // trips sooner) instead of looking like a fresh key every call (fail
  // open, breaker never trips). Array#join already normalizes undefined,
  // null, and '' to the same empty segment, so this holds with no extra
  // branching -- but this behavior is the requirement, not an accident.
  const authority = [
    attempt.kind, attempt.guard, attempt.reason, attempt.pathOrAction,
    attempt.progressToken, attempt.fingerprint,
  ].join('\0');
  return createHash('sha256').update(authority).digest('hex');
}

function readState(repoRoot: string): PersistedCircuitState | null {
  try {
    const parsed = JSON.parse(readFileSync(join(repoRoot, STATE_PATH), 'utf-8')) as PersistedCircuitState;
    return parsed.protocol === 1 && parsed.entries && typeof parsed.entries === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(repoRoot: string, state: PersistedCircuitState): void {
  const target = join(repoRoot, STATE_PATH);
  mkdirSync(dirname(target), { recursive: true });
  const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, target);
}

function readLockOwner(lockPath: string): CircuitLockOwner | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8')) as Partial<CircuitLockOwner>;
    return parsed.protocol === 1
      && Number.isInteger(parsed.pid)
      && (parsed.pid ?? 0) > 0
      && typeof parsed.token === 'string'
      && parsed.token.length > 0
      && typeof parsed.acquired_at === 'string'
      ? parsed as CircuitLockOwner
      : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function acquireLock(repoRoot: string): { lockPath: string; token: string } {
  const lockPath = join(repoRoot, LOCK_PATH);
  mkdirSync(dirname(lockPath), { recursive: true });
  const token = randomUUID();
  const owner: CircuitLockOwner = {
    protocol: 1,
    pid: process.pid,
    token,
    acquired_at: new Date().toISOString(),
  };
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (true) {
    let descriptor: number | null = null;
    try {
      descriptor = openSync(lockPath, 'wx', 0o600);
      writeFileSync(descriptor, `${JSON.stringify(owner)}\n`);
      closeSync(descriptor);
      return { lockPath, token };
    } catch (error) {
      if (descriptor !== null) {
        try { closeSync(descriptor); } catch { /* descriptor already closed */ }
        try { unlinkSync(lockPath); } catch { /* another process will observe/recover it */ }
      }
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const observed = readLockOwner(lockPath);
    if (Date.now() >= deadline) {
      // Never reclaim a stale-looking wx lock in-process. With only portable
      // filesystem primitives, read/verify/unlink has a TOCTOU window where a
      // concurrent reclaimer can delete a newly acquired lock. A crashed owner
      // therefore fails closed and requires explicit operator cleanup.
      const ownerDetail = observed
        ? `${processIsAlive(observed.pid) ? 'live' : 'stale'} owner pid ${observed.pid}`
        : 'unresolved owner';
      throw new Error(
        `circuit breaker lock contention (${ownerDetail}); attempt denied after ${LOCK_TIMEOUT_MS}ms`,
      );
    }
    Atomics.wait(LOCK_WAIT, 0, 0, LOCK_POLL_MS);
  }
}

function releaseLock(lockPath: string, token: string): void {
  const owner = readLockOwner(lockPath);
  if (!owner || owner.token !== token || owner.pid !== process.pid) {
    throw new Error('circuit breaker lock ownership changed before release; attempt denied');
  }
  unlinkSync(lockPath);
}

export function recordCircuitAttempt(
  repoRoot: string,
  attempt: CircuitAttempt,
  now = new Date(),
): CircuitDecision {
  if (!['guard', 'review', 'subagent', 'repair', 'cross-model-consult'].includes(attempt.kind)) {
    throw new Error(`invalid circuit kind: ${String(attempt.kind)}`);
  }
  if (!['lite', 'standard', 'strict'].includes(attempt.profile)) {
    throw new Error(`invalid workflow profile: ${String(attempt.profile)}`);
  }
  for (const [field, value] of Object.entries({
    guard: attempt.guard,
    reason: attempt.reason,
    pathOrAction: attempt.pathOrAction,
    fingerprint: attempt.fingerprint,
  })) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  }
  const key = keyFor(attempt);
  const limit = circuitLimit(attempt);
  const lock = acquireLock(repoRoot);
  let repeatCount: number;
  try {
    const previous = readState(repoRoot);
    repeatCount = Math.min((previous?.entries[key]?.count ?? 0) + 1, limit + 1);
    writeState(repoRoot, {
      protocol: 1,
      entries: {
        ...(previous?.entries ?? {}),
        [key]: { count: repeatCount, token: randomUUID() },
      },
      updated_at: now.toISOString(),
    });
  } finally {
    releaseLock(lock.lockPath, lock.token);
  }
  const allowed = repeatCount <= limit;
  const strongBoundary = attempt.strongBoundary === true;
  return {
    protocol: 1,
    allowed,
    tripped: !allowed,
    guard: attempt.guard,
    reason: attempt.reason,
    path_action: attempt.pathOrAction,
    progress_token: attempt.progressToken,
    repeat_count: repeatCount,
    limit,
    required_action: !allowed
      ? strongBoundary
        ? 'terminal: stop repeating this action; change the blocked path/action or resolve the security boundary manually'
        : 'terminal: stop automatic retries; change state or wait for an explicit user decision'
      : 'continue within the bounded attempt limit',
    // There is intentionally no runtime override command. Strong boundaries
    // stay fail-closed and weak-boundary recovery requires a real state change.
    explicit_override_command: null,
  };
}
