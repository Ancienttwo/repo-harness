import type { EffectiveState } from '../../core/state/types';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import type { SessionContextProviderDiagnostic, SessionContextSection } from './session-context-budget';
import type { HookEvent, HookHandlerId, RouteId } from './route-registry';
import type {
  HookEffectBoundary,
  HookEffectCardinality,
  HookEffectObservation,
  HookEffectRecovery,
  HookEventTelemetryMetric,
  HookEffectObservationState,
} from '../../core/loop/loop-event-protocol';

/**
 * A bounded, handler-local durable-effect declaration.  The declaration is
 * optional on TypedHookHandler: omitted means uninstrumented, never zero
 * effects.  `phases` names the existing post-commit observer phases so the
 * runtime can distinguish an observed prefix from a complete success.
 */
export interface HookEffectContract {
  readonly contractId: string;
  readonly boundary: HookEffectBoundary;
  readonly cardinality: HookEffectCardinality;
  readonly recovery: HookEffectRecovery;
  readonly completeMetrics: readonly HookEventTelemetryMetric[];
  readonly phases: readonly string[];
}

export type { HookEffectObservationState, HookEffectObservation };

/** Invocation-local tracker owned by the typed runtime, not a transaction API. */
export interface HookEffectTracker {
  recordCommittedPhase(phase: string): void;
  observation(
    completedSuccessfully: boolean,
    handlerThrew: boolean,
    recoveryOverride?: HookEffectRecovery,
  ): HookEffectObservation;
}

/** Typed internal failure for a bounded effect that needs reconciliation. */
export class HookEffectReconciliationRequired extends Error {
  readonly recovery: HookEffectRecovery = 'reconcile-required';
  readonly telemetryReason = 'effect-reconcile-required';

  constructor(message: string) {
    super(message);
    this.name = 'HookEffectReconciliationRequired';
  }
}

export function hookEffectFailureMetadata(error: unknown): {
  readonly recovery: HookEffectRecovery;
  readonly telemetryReason: string;
} | null {
  return error instanceof HookEffectReconciliationRequired
    ? { recovery: error.recovery, telemetryReason: error.telemetryReason }
    : null;
}

/** Result returned by every typed hook handler before host output shaping. */
export interface HookHandlerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reason?: string;
  /** SessionStart only: sections to feed to the canonical context budgeter. */
  readonly sessionContexts?: readonly SessionContextSection[];
}

export interface HookHandlerDependencies {
  readonly observeEventWrite?: (path: string) => void;
  readonly observeJournalWrite?: (path: string) => void;
  readonly observeProjectionWrite?: (target: { readonly kind: string; readonly path: string }) => void;
  readonly observeProjectionTransaction?: () => void;
  readonly observeSessionContextDiagnostic?: (diagnostic: SessionContextProviderDiagnostic) => void;
  /** Test/observer seam invoked after a named durable phase commits. */
  readonly afterEffectCommit?: (phase: string) => void;
}

/** The single context boundary shared by all route handlers. */
export interface HookHandlerContext {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly repoRoot: string;
  readonly input?: string | Buffer;
  readonly env: NodeJS.ProcessEnv;
  readonly now: Date;
  readonly collector: StateInputCollector<HookEvent, SessionContextSection | null, EffectiveState | null, EffectiveState | null>;
  readonly dependencies: HookHandlerDependencies;
  readonly collectSessionStdout: boolean;
}

export interface TypedHookHandler {
  readonly id: HookHandlerId;
  /** Present only for the two handlers with an explicit effect boundary. */
  readonly effectContract?: HookEffectContract;
  readonly run: (context: HookHandlerContext) => HookHandlerResult;
}

/** Build the four-state observation without introducing a generic sink. */
export function createHookEffectTracker(contract: HookEffectContract): HookEffectTracker {
  const committed = new Set<string>();

  return {
    recordCommittedPhase(phase: string): void {
      if (contract.phases.includes(phase)) committed.add(phase);
    },
    observation(
      completedSuccessfully: boolean,
      handlerThrew: boolean,
      recoveryOverride?: HookEffectRecovery,
    ): HookEffectObservation {
      const committedPhases = contract.phases.filter((phase) => committed.has(phase));
      const allPhasesCommitted = contract.phases.length > 0 && committedPhases.length === contract.phases.length;
      let state: HookEffectObservationState;
      if (!handlerThrew && committedPhases.length === 0) {
        state = 'none_committed';
      } else if (handlerThrew && committedPhases.length === 0) {
        state = 'unknown_partial';
      } else if (allPhasesCommitted && (completedSuccessfully || handlerThrew)) {
        // A throw after the final observer still proves the complete bounded
        // set committed; the exception remains visible in the outer result.
        state = 'committed_complete';
      } else if (committedPhases.length > 0) {
        state = 'committed_partial';
      } else {
        state = 'unknown_partial';
      }
      return {
        contract_id: contract.contractId,
        boundary: contract.boundary,
        cardinality: contract.cardinality,
        recovery: recoveryOverride ?? contract.recovery,
        state,
        committed_phases: committedPhases,
        last_committed_phase: committedPhases.at(-1) ?? null,
      };
    },
  };
}
