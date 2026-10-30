import { evaluateAttemptStall, type AttemptLedgerRead } from './attempt-ledger';
import type {
  ContinuationEnvelopeV2,
  ContinuationRoute,
  EffectiveState,
} from './types';

/** Existing command the envelope points at; never re-implemented here. */
const CONTINUE_COMMAND = 'repo-harness state resolve --json';

/** Routes that hand the caller work to do, and so can be circuit-broken. */
const ACTIONABLE_ROUTES: ReadonlySet<ContinuationRoute> = new Set<ContinuationRoute>([
  'continue',
]);

export interface ContinuationEnvelopeInputs {
  readonly state: EffectiveState;
  /** The attempt ledger's own parsed bytes; evidence only, never authority. */
  readonly attemptLedger: AttemptLedgerRead;
}

/**
 * Resolve the continuation route before applying the no-progress circuit
 * breaker. The route is a projection of Effective State alone: a hard blocker
 * halts, a fresh handoff next action continues, and every other state idles.
 * The unit reference is the state revision, so no plan or sprint path enters
 * the output.
 */
function projectRoutedEnvelope(
  input: ContinuationEnvelopeInputs,
): ContinuationEnvelopeV2 {
  const { state } = input;

  const envelope = (
    route: ContinuationRoute,
    unitRef: string | null,
    command: string | null,
    reason: string,
  ): ContinuationEnvelopeV2 => ({
    protocol: 2,
    kind: 'repo-harness-continuation-envelope',
    route,
    unit_ref: unitRef,
    authority_revision: state.authority_revision,
    progress_token: state.progress_token,
    command,
    reason,
  });

  if (state.blockers.length > 0) {
    return envelope('halt', null, null, `blockers:${state.blockers.join(',')}`);
  }
  if (state.next_action !== null) {
    return envelope(
      'continue',
      state.state_revision,
      CONTINUE_COMMAND,
      `next_action:${state.next_action}`,
    );
  }
  return envelope('idle', null, null, 'no_next_action');
}

/**
 * Deterministic projection: no time, PID, locale, or filesystem input. Given
 * identical effective state and identical ledger bytes, the output is
 * byte-identical.
 */
export function projectContinuationEnvelope(
  input: ContinuationEnvelopeInputs,
): ContinuationEnvelopeV2 {
  const routed = projectRoutedEnvelope(input);
  if (!ACTIONABLE_ROUTES.has(routed.route)) return routed;

  const verdict = evaluateAttemptStall(
    input.attemptLedger,
    routed.unit_ref,
    routed.progress_token,
  );
  if (verdict === 'none') return routed;
  // Key order is preserved: only `route`, `command`, and `reason` are replaced.
  return { ...routed, route: 'halt', command: null, reason: verdict };
}
