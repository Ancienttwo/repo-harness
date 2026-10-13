import type { HookIdentity } from '../../src/cli/hook/hook-input';

/** The identity the runtime passes to handlers; tests override what they assert. */
export function hookIdentity(overrides: Partial<HookIdentity> = {}): HookIdentity {
  return { host: 'claude', sessionId: null, runId: null, turnId: null, ...overrides };
}
