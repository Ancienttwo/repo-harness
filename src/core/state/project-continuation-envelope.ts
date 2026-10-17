import { evaluateAttemptStall, type AttemptLedgerRead } from './attempt-ledger';
import type {
  ContinuationEnvelopeV1,
  ContinuationRoute,
  EffectiveState,
} from './types';

/** Existing commands the envelope points at; never re-implemented here. */
const CONTINUE_COMMAND = 'repo-harness state resolve --json';
const VERIFY_COMMAND = 'repo-harness run verify-sprint';

const EXECUTABLE_PLAN_STATUS: ReadonlySet<string> = new Set(['approved', 'executing']);

/** Routes that hand the caller work to do, and so can be circuit-broken. */
const ACTIONABLE_ROUTES: ReadonlySet<ContinuationRoute> = new Set<ContinuationRoute>([
  'continue_active_plan',
  'verify_or_finish',
]);

export interface ContinuationEnvelopeInputs {
  readonly state: EffectiveState;
  /** The attempt ledger's own parsed bytes; evidence only, never authority. */
  readonly attemptLedger: AttemptLedgerRead;
}

/** The route table above, before the circuit breaker's post-pass. */
function projectRoutedEnvelope(
  input: ContinuationEnvelopeInputs,
): ContinuationEnvelopeV1 {
  const { state } = input;
  const plan = state.authoritative_plan;

  const envelope = (
    route: ContinuationRoute,
    unitRef: string | null,
    command: string | null,
    reason: string,
  ): ContinuationEnvelopeV1 => ({
    protocol: 1,
    kind: 'repo-harness-continuation-envelope',
    route,
    unit_ref: unitRef,
    authority_revision: state.authority_revision,
    progress_token: state.progress_token,
    command,
    reason,
  });

  if (state.blockers.length > 0) {
    return envelope('halt', plan?.path ?? null, null, `blockers:${state.blockers.join(',')}`);
  }
  if (state.stale_sources.includes('active_plan_marker')) {
    return envelope('halt', null, null, 'stale:active_plan_marker');
  }
  if (plan) {
    if (!EXECUTABLE_PLAN_STATUS.has(plan.status)) {
      return envelope('halt', plan.path, null, `plan_status:${plan.status}`);
    }
    return state.next_action === null
      ? envelope('verify_or_finish', plan.path, VERIFY_COMMAND, 'complete_approved_work_package')
      : envelope('continue_active_plan', plan.path, CONTINUE_COMMAND, `next_action:${state.next_action}`);
  }
  return envelope('idle', null, null, 'no_active_plan');
}

/**
 * Deterministic projection: no time, PID, locale, or filesystem input. Given
 * identical effective state, identical ledger bytes,
 * the output is byte-identical.
 */
export function projectContinuationEnvelope(
  input: ContinuationEnvelopeInputs,
): ContinuationEnvelopeV1 {
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
