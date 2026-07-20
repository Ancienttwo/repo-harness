import { createHash } from 'crypto';
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { WorkflowProfile } from '../../core/workflow/profile';
import { withExclusiveDirectoryLock } from '../../effects/locking/exclusive-directory-lock';

const CIRCUIT_KINDS = [
  'guard', 'review', 'subagent', 'repair', 'cross-model-consult',
] as const;

export type CircuitKind = typeof CIRCUIT_KINDS[number];

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

type CircuitPattern =
  | 'initial'
  | 'real-progress-reset'
  | 'exact-repeat'
  | 'new-blocker'
  | 'oscillation'
  | 'superficial-churn';

interface PersistedCircuitEntry {
  progress_token: string;
  blocker_key: string;
  count: number;
  render_key: string;
  recent_blockers: readonly string[];
  last_pattern: CircuitPattern;
}

interface PersistedCircuitState {
  protocol: 2;
  entries: Partial<Record<CircuitKind, PersistedCircuitEntry>>;
  updated_at: string;
}

const STATE_PATH = '.ai/harness/state/circuit-breaker.json';
const LOCK_PATH = `${STATE_PATH}.lock`;
const LOCK_TIMEOUT_MS = 2_000;

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

function isCircuitKind(value: unknown): value is CircuitKind {
  return typeof value === 'string' && (CIRCUIT_KINDS as readonly string[]).includes(value);
}

function hashSegments(...segments: readonly string[]): string {
  return createHash('sha256').update(segments.join('\0')).digest('hex');
}

function isCircuitPattern(value: unknown): value is CircuitPattern {
  return value === 'initial'
    || value === 'real-progress-reset'
    || value === 'exact-repeat'
    || value === 'new-blocker'
    || value === 'oscillation'
    || value === 'superficial-churn';
}

function isPersistedCircuitEntry(value: unknown): value is PersistedCircuitEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PersistedCircuitEntry>;
  return typeof entry.progress_token === 'string'
    && typeof entry.blocker_key === 'string'
    && Number.isSafeInteger(entry.count)
    && (entry.count ?? 0) >= 1
    && typeof entry.render_key === 'string'
    && Array.isArray(entry.recent_blockers)
    && entry.recent_blockers.length <= 2
    && entry.recent_blockers.every((blocker) => typeof blocker === 'string')
    && isCircuitPattern(entry.last_pattern);
}

function isLegacyCircuitState(value: Record<string, unknown>): boolean {
  if (!value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)
    || typeof value.updated_at !== 'string') return false;
  return Object.entries(value.entries).every(([key, entry]) => {
    if (!/^[0-9a-f]{64}$/.test(key) || !entry || typeof entry !== 'object') return false;
    const legacy = entry as { count?: unknown; token?: unknown };
    return Number.isSafeInteger(legacy.count)
      && (legacy.count as number) >= 1
      && typeof legacy.token === 'string'
      && legacy.token.length > 0;
  });
}

function readState(repoRoot: string): PersistedCircuitState | null {
  const statePath = join(repoRoot, STATE_PATH);
  let raw: string;
  try {
    raw = readFileSync(statePath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`cannot read circuit breaker state: ${statePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`invalid circuit breaker state JSON: ${statePath}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid circuit breaker state envelope: ${statePath}`);
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope.protocol === 1) {
    if (!isLegacyCircuitState(envelope)) {
      throw new Error(`invalid protocol-1 circuit breaker state: ${statePath}`);
    }
    return null;
  }
  if (envelope.protocol !== 2) {
    throw new Error(`unsupported circuit breaker state protocol: ${String(envelope.protocol)}`);
  }
  if (!envelope.entries || typeof envelope.entries !== 'object'
    || Array.isArray(envelope.entries) || typeof envelope.updated_at !== 'string') {
    throw new Error(`invalid protocol-2 circuit breaker state: ${statePath}`);
  }
  const entries: Partial<Record<CircuitKind, PersistedCircuitEntry>> = {};
  for (const [kind, value] of Object.entries(envelope.entries)) {
    if (!isCircuitKind(kind) || !isPersistedCircuitEntry(value)) {
      throw new Error(`invalid protocol-2 circuit breaker entry: ${kind}`);
    }
    entries[kind] = value;
  }
  return { protocol: 2, entries, updated_at: envelope.updated_at };
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
  if (!isCircuitKind(attempt.kind)) {
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
  const progressToken = typeof attempt.progressToken === 'string' ? attempt.progressToken : '';
  const blockerKey = hashSegments(attempt.kind, attempt.guard);
  const renderKey = hashSegments(attempt.reason, attempt.pathOrAction, attempt.fingerprint);
  const limit = circuitLimit(attempt);
  const canonicalRoot = realpathSync(repoRoot);
  const repeatCount = withExclusiveDirectoryLock(canonicalRoot, LOCK_PATH, () => {
    const previous = readState(canonicalRoot);
    const prior = previous?.entries[attempt.kind];
    let pattern: CircuitPattern;
    let nextRepeatCount: number;
    let entry: PersistedCircuitEntry;
    if (!prior) {
      pattern = 'initial';
      nextRepeatCount = 1;
      entry = {
        progress_token: progressToken,
        blocker_key: blockerKey,
        count: nextRepeatCount,
        render_key: renderKey,
        recent_blockers: [blockerKey],
        last_pattern: pattern,
      };
    } else if (prior.progress_token !== progressToken) {
      pattern = 'real-progress-reset';
      nextRepeatCount = 1;
      entry = {
        progress_token: progressToken,
        blocker_key: blockerKey,
        count: nextRepeatCount,
        render_key: renderKey,
        recent_blockers: [blockerKey],
        last_pattern: pattern,
      };
    } else {
      const oscillating = prior.recent_blockers.length === 2
        && prior.recent_blockers[0] === blockerKey
        && prior.recent_blockers[1] === prior.blocker_key
        && blockerKey !== prior.blocker_key;
      if (oscillating) {
        pattern = 'oscillation';
        nextRepeatCount = limit + 1;
      } else if (prior.blocker_key === blockerKey) {
        pattern = prior.render_key === renderKey ? 'exact-repeat' : 'superficial-churn';
        nextRepeatCount = Math.min(prior.count + 1, limit + 1);
      } else {
        pattern = 'new-blocker';
        nextRepeatCount = 1;
      }
      entry = {
        progress_token: progressToken,
        blocker_key: blockerKey,
        count: nextRepeatCount,
        render_key: renderKey,
        recent_blockers: [...prior.recent_blockers, blockerKey].slice(-2),
        last_pattern: pattern,
      };
    }
    writeState(canonicalRoot, {
      protocol: 2,
      entries: { ...(previous?.entries ?? {}), [attempt.kind]: entry },
      updated_at: now.toISOString(),
    });
    return nextRepeatCount;
  }, { reclaimStaleOwner: false, waitTimeoutMs: LOCK_TIMEOUT_MS });
  const allowed = repeatCount <= limit;
  const strongBoundary = attempt.strongBoundary === true;
  return {
    protocol: 1,
    allowed,
    tripped: !allowed,
    guard: attempt.guard,
    reason: attempt.reason,
    path_action: attempt.pathOrAction,
    progress_token: progressToken,
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
