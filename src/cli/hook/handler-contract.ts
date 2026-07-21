import type { EffectiveState } from '../../core/state/types';
import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import type { SessionContextSection } from './session-context-budget';
import type { HookEvent, HookHandlerId, RouteId } from './route-registry';

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
  readonly observeProjectionWrite?: (target: { readonly path: string }) => void;
  readonly observeProjectionTransaction?: () => void;
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
  readonly run: (context: HookHandlerContext) => HookHandlerResult;
}
