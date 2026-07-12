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
  key: string;
  count: number;
  token: string;
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
    return parsed.protocol === 1 ? parsed : null;
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
  const key = keyFor(attempt);
  const previous = readState(repoRoot);
  const repeatCount = previous?.key === key ? previous.count + 1 : 1;
  writeState(repoRoot, {
    protocol: 1,
    key,
    count: repeatCount,
    token: randomUUID(),
    updated_at: now.toISOString(),
  });
  const limit = circuitLimit(attempt);
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
    required_action: strongBoundary
      ? 'change the blocked path/action or resolve the security boundary manually'
      : 'change state or run an explicit manual action',
    explicit_override_command: strongBoundary
      ? null
      : `repo-harness run circuit-override --guard ${JSON.stringify(attempt.guard)} --state-version ${JSON.stringify(attempt.stateVersion)}`,
  };
}
