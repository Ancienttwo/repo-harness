import type { HookPermission } from './handler-contract';
import type { HookEvent, RouteHost, RouteId } from './route-registry';

export const HOOK_DIAGNOSTIC_BYTES = 8 * 1024;

export function boundedHookDiagnostic(text: string): string {
  return Buffer.from(text).subarray(0, HOOK_DIAGNOSTIC_BYTES).toString('utf8').replace(/�$/u, '');
}

/** One finished hook event, ready for the host renderer. */
export interface HookOutcome {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly repoRoot: string | null;
  readonly exitCode: number;
  readonly reason: string;
  readonly permission?: HookPermission;
  readonly additionalContext: string | null;
  readonly systemMessage?: string;
  readonly diagnostics: string;
}

export interface HostOutput {
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Claude and Codex read `hookSpecificOutput` from stdout on exit 0 and the
 * operator text from stderr. Neither host gives exit-0 stderr to the model.
 */
function renderHookSpecificOutput(outcome: HookOutcome, systemMessage?: string): HostOutput {
  const specific: Record<string, unknown> = {};
  if (outcome.exitCode === 0 && outcome.permission) {
    specific.permissionDecision = outcome.permission.decision;
    specific.permissionDecisionReason = outcome.permission.reason;
    if (outcome.permission.updatedInput) specific.updatedInput = outcome.permission.updatedInput;
  }
  if (outcome.exitCode === 0 && outcome.additionalContext) specific.additionalContext = outcome.additionalContext;
  const envelope: Record<string, unknown> = {};
  if (Object.keys(specific).length > 0) envelope.hookSpecificOutput = { hookEventName: outcome.event, ...specific };
  if (outcome.exitCode === 0 && systemMessage) envelope.systemMessage = systemMessage;
  const stdout = Object.keys(envelope).length > 0
    ? `${JSON.stringify(envelope)}\n`
    : '';
  return { stdout, stderr: outcome.diagnostics };
}

/**
 * Codex Desktop renders Stop JSON as "Unsupported content type", so Codex
 * Stop writes no stdout. Its operator text stays on stderr.
 */
function renderCodexOutput(outcome: HookOutcome): HostOutput {
  const output = renderHookSpecificOutput(outcome);
  return outcome.event === 'Stop' ? { ...output, stdout: '' } : output;
}

/** Version of the single JSON object that the Pi renderer writes to stdout. */
export const PI_HOOK_PROTOCOL = 1 as const;

export interface PiHookOutput {
  readonly protocol: typeof PI_HOOK_PROTOCOL;
  readonly event: HookEvent;
  readonly route_id: RouteId;
  readonly exit_code: number;
  readonly reason: string;
  readonly decision: 'allow' | 'block' | 'none';
  readonly additional_context: string | null;
  readonly system_message: string | null;
  readonly diagnostics: string;
  readonly updated_input?: Readonly<Record<string, unknown>>;
}

/**
 * The repo-harness Pi extension reads exactly one JSON object from stdout.
 * Exit 2 or a deny permission is a block. Operator text stays on stderr.
 */
function renderPiOutput(outcome: HookOutcome): HostOutput {
  const permission = outcome.exitCode === 0 ? outcome.permission?.decision : undefined;
  const decision = outcome.exitCode === 2 || permission === 'deny' ? 'block' : permission === 'allow' ? 'allow' : 'none';
  const output: PiHookOutput = {
    protocol: PI_HOOK_PROTOCOL,
    event: outcome.event,
    route_id: outcome.routeId,
    exit_code: outcome.exitCode,
    reason: outcome.reason,
    decision,
    additional_context: outcome.exitCode === 0 ? outcome.additionalContext : null,
    system_message: outcome.exitCode === 0 ? outcome.systemMessage ?? null : null,
    diagnostics: boundedHookDiagnostic(outcome.diagnostics),
    // Preserve requested changes on the wire. A block is the only allowed outcome until Pi can apply them.
    ...(outcome.permission?.updatedInput ? { updated_input: outcome.permission.updatedInput } : {}),
  };
  return { stdout: `${JSON.stringify(output)}\n`, stderr: outcome.diagnostics };
}

export const HOST_RENDERERS: Readonly<Record<RouteHost, (outcome: HookOutcome) => HostOutput>> = Object.freeze({
  claude: (outcome) => renderHookSpecificOutput(outcome, outcome.systemMessage),
  codex: renderCodexOutput,
  pi: renderPiOutput,
});
