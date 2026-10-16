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
function renderHookSpecificOutput(outcome: HookOutcome): HostOutput {
  const specific: Record<string, unknown> = {};
  if (outcome.exitCode === 0 && outcome.permission) {
    specific.permissionDecision = outcome.permission.decision;
    specific.permissionDecisionReason = outcome.permission.reason;
    if (outcome.permission.updatedInput) specific.updatedInput = outcome.permission.updatedInput;
  }
  if (outcome.exitCode === 0 && outcome.additionalContext) specific.additionalContext = outcome.additionalContext;
  const stdout = Object.keys(specific).length > 0
    ? `${JSON.stringify({ hookSpecificOutput: { hookEventName: outcome.event, ...specific } })}\n`
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

export const HOST_RENDERERS: Readonly<Record<RouteHost, (outcome: HookOutcome) => HostOutput>> = Object.freeze({
  claude: renderHookSpecificOutput,
  codex: renderCodexOutput,
});
