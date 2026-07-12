import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { circuitLimit, recordCircuitAttempt, type CircuitAttempt } from '../src/cli/hook/circuit-breaker';

function attempt(overrides: Partial<CircuitAttempt> = {}): CircuitAttempt {
  return {
    kind: 'guard', guard: 'scope', reason: 'outside allowed paths', pathOrAction: 'src/secret.ts',
    stateVersion: 'sha256:state', fingerprint: 'sha256:guard', profile: 'lite', ...overrides,
  };
}

function withRepo(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-circuit-'));
  try { run(cwd); } finally { rmSync(cwd, { recursive: true, force: true }); }
}

describe('workflow circuit breakers', () => {
  test('same guard fingerprint blocks at most twice before structured trip', () => withRepo((cwd) => {
    expect(recordCircuitAttempt(cwd, attempt()).allowed).toBe(true);
    expect(recordCircuitAttempt(cwd, attempt()).allowed).toBe(true);
    const third = recordCircuitAttempt(cwd, attempt());
    expect(third).toMatchObject({ allowed: false, tripped: true, repeat_count: 3, limit: 2 });
    expect(third.explicit_override_command).not.toBeNull();
  }));

  test('state or action changes reset the consecutive repeat counter', () => withRepo((cwd) => {
    recordCircuitAttempt(cwd, attempt());
    expect(recordCircuitAttempt(cwd, attempt({ stateVersion: 'sha256:new' })).repeat_count).toBe(1);
    expect(recordCircuitAttempt(cwd, attempt({ pathOrAction: 'src/other.ts' })).repeat_count).toBe(1);
  }));

  test('profile caps match review, subagent, repair, and consult contracts', () => {
    expect(circuitLimit(attempt({ kind: 'review', profile: 'lite' }))).toBe(1);
    expect(circuitLimit(attempt({ kind: 'review', profile: 'strict' }))).toBe(2);
    expect(circuitLimit(attempt({ kind: 'subagent', profile: 'standard' }))).toBe(2);
    expect(circuitLimit(attempt({ kind: 'subagent', profile: 'strict', explicitHighRiskContract: true }))).toBe(3);
    expect(circuitLimit(attempt({ kind: 'repair' }))).toBe(2);
    expect(circuitLimit(attempt({ kind: 'cross-model-consult' }))).toBe(0);
    expect(circuitLimit(attempt({ kind: 'cross-model-consult', riskTriggeredConsult: true }))).toBe(1);
  });

  test('strong boundaries never expose an override command', () => withRepo((cwd) => {
    recordCircuitAttempt(cwd, attempt({ strongBoundary: true }));
    recordCircuitAttempt(cwd, attempt({ strongBoundary: true }));
    const decision = recordCircuitAttempt(cwd, attempt({ strongBoundary: true }));
    expect(decision.allowed).toBe(false);
    expect(decision.explicit_override_command).toBeNull();
    expect(decision.required_action).toContain('security boundary');
  }));
});
