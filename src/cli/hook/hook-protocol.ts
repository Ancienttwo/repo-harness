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

/** Pi bridge wire result: one JSON object on stdout. `src/pi/hook-bridge.ts` validates it. */
export interface PiHookResult {
  readonly protocol: 1;
  readonly event: HookEvent;
  readonly route_id: RouteId;
  readonly exit_code: number;
  readonly reason: string;
  readonly decision: 'allow' | 'block' | 'none';
  readonly additional_context: string | null;
  readonly system_message: string | null;
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

/**
 * Pi has no permission system of its own. A PreToolUse handler that exits 0
 * without a deny admits the call; exit 2 or a deny blocks it, as in Claude.
 */
function piDecision(outcome: HookOutcome): PiHookResult['decision'] {
  if (outcome.exitCode === 2 || outcome.permission?.decision === 'deny') return 'block';
  return outcome.event === 'PreToolUse' && outcome.exitCode === 0 ? 'allow' : 'none';
}

/** Pi reads only stdout. Operator text travels in `diagnostics`, so stderr stays empty. */
function renderPiOutput(outcome: HookOutcome): HostOutput {
  const result: PiHookResult = {
    protocol: 1,
    event: outcome.event,
    route_id: outcome.routeId,
    exit_code: outcome.exitCode,
    reason: outcome.reason,
    decision: piDecision(outcome),
    additional_context: outcome.exitCode === 0 ? outcome.additionalContext : null,
    system_message: outcome.exitCode === 0 ? outcome.systemMessage ?? null : null,
    diagnostics: boundedHookDiagnostic(outcome.diagnostics),
  };
  return { stdout: `${JSON.stringify(result)}\n`, stderr: '' };
}

export const HOST_RENDERERS: Readonly<Record<RouteHost, (outcome: HookOutcome) => HostOutput>> = Object.freeze({
  claude: (outcome) => renderHookSpecificOutput(outcome, outcome.systemMessage),
  codex: renderCodexOutput,
  pi: renderPiOutput,
});
