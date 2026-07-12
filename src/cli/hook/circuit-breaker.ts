import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { WorkflowProfile } from './workflow-profile';

export type CircuitKind = 'guard' | 'review' | 'subagent' | 'repair' | 'cross-model-consult';

export interface CircuitAttempt {
  readonly kind: CircuitKind;
  readonly guard: string;
  readonly reason: string;
  readonly pathOrAction: string;
  readonly stateVersion: string | number;
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
  readonly state_version: string | number;
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
  const authority = [
    attempt.kind, attempt.guard, attempt.reason, attempt.pathOrAction,
    attempt.stateVersion, attempt.fingerprint,
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
  const previous = readState(repoRoot);
  const limit = circuitLimit(attempt);
  const repeatCount = Math.min((previous?.entries[key]?.count ?? 0) + 1, limit + 1);
  writeState(repoRoot, {
    protocol: 1,
    entries: {
      ...(previous?.entries ?? {}),
      [key]: { count: repeatCount, token: randomUUID() },
    },
    updated_at: now.toISOString(),
  });
  const allowed = repeatCount <= limit;
  const strongBoundary = attempt.strongBoundary === true;
  return {
    protocol: 1,
    allowed,
    tripped: !allowed,
    guard: attempt.guard,
    reason: attempt.reason,
    path_action: attempt.pathOrAction,
    state_version: attempt.stateVersion,
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
