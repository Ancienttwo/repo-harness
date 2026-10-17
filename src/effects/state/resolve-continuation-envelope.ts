import { projectContinuationEnvelope } from '../../core/state/project-continuation-envelope';
import type { ContinuationEnvelopeV1 } from '../../core/state/types';
import { readAttemptLedger } from './attempt-ledger-store';
import { resolveEffectiveStateReadOnly } from './resolve-effective-state';

/**
 * Read-only continuation projection.
 *
 * `resolveEffectiveStateReadOnly` is the no-write resolution path: it runs the
 * same stability loop as `resolveEffectiveState` but allocates no version and
 * publishes no cache, so this command mutates nothing. The risk input matches
 * the existing whole-repo inspection convention (`buildStateSnapshot`, the Stop
 * hook's `resolveStopEffectiveState`): no target paths, `operation: 'inspect'`.
 *
 * The attempt ledger is read the same way -- read-only, absent-tolerant, and
 * outside every state input bundle -- so it feeds the circuit breaker without
 * entering `EffectiveState` resolution or this command's zero-write contract.
 */
export function resolveContinuationEnvelope(
  cwd = process.cwd(),
  nowMs = Date.now(),
): ContinuationEnvelopeV1 {
  const state = resolveEffectiveStateReadOnly(cwd, nowMs, {
    targetPaths: [],
    operationKind: 'inspect',
  });
  return projectContinuationEnvelope({
    state,
    attemptLedger: readAttemptLedger(cwd),
  });
}
