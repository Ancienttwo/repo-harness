import { projectContinuationEnvelope } from '../../core/state/project-continuation-envelope';
import type { ContinuationEnvelopeV1 } from '../../core/state/types';
import { readAttemptLedger } from './attempt-ledger-store';
import { readText } from './collect-state-inputs';
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
 * The active sprint file is read here and nowhere else; `readText` keeps the
 * marker's path confined to the repository exactly as the resolver does.
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
  const sprintPath = state.active_sprint.path;
  return projectContinuationEnvelope({
    state,
    sprintText: sprintPath && state.active_sprint.freshness === 'fresh'
      ? readText(cwd, sprintPath)
      : null,
    attemptLedger: readAttemptLedger(cwd),
  });
}
