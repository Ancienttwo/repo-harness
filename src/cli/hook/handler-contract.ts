import type { StateInputCollector } from '../../effects/loop/state-input-collector';
import type { HookIdentity, HookPayload } from './hook-input';
import type { SessionContextProviderDiagnostic, SessionContextSection } from './session-context-budget';
import type { HookEvent, HookHandlerId } from './route-registry';

/** A tool admission decision. `updatedInput` replaces the tool input on allow. */
export interface HookPermission {
  readonly decision: 'allow' | 'deny';
  readonly reason: string;
  readonly updatedInput?: Readonly<Record<string, unknown>>;
}

/**
 * The typed result of every hook handler. The runtime renders it once per
 * host; handlers never write host JSON or host streams.
 *
 * - `exitCode`: 0 success, 2 a policy block, any other value a failure.
 * - `additionalContext`: text for the model.
 * - `diagnostics`: text for the operator, never parsed.
 * - `reason`: telemetry detail; the runtime derives one when it is absent.
 * - `sessionContexts`: SessionStart sections for the context budgeter.
 */
export interface HookHandlerResult {
  readonly exitCode: number;
  readonly permission?: HookPermission;
  readonly additionalContext?: string;
  readonly diagnostics?: string;
  readonly reason?: string;
  readonly sessionContexts?: readonly SessionContextSection[];
}

/** The single context boundary shared by all route handlers. */
export interface HookHandlerContext {
  readonly event: HookEvent;
  readonly repoRoot: string;
  readonly sessionCwd: string;
  readonly payload: HookPayload;
  readonly identity: HookIdentity;
  readonly env: NodeJS.ProcessEnv;
  readonly now: Date;
  readonly collector: StateInputCollector;
  readonly worktreeSweepDeadlineMs?: number;
  readonly observeSessionContextDiagnostic: (diagnostic: SessionContextProviderDiagnostic) => void;
}

export interface TypedHookHandler {
  readonly id: HookHandlerId;
  readonly run: (context: HookHandlerContext) => HookHandlerResult;
}
