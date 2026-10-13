import type { HookPermission } from './handler-contract';
import type { HookEvent, RouteHost, RouteId } from './route-registry';

/** Pi JSON wire result. Pi validates it in `src/pi/hook-protocol.ts`. */
export interface HookJsonOutput {
  readonly protocol: 1;
  readonly event: HookEvent;
  readonly route_id: RouteId;
  readonly host: string;
  readonly repo_root: string | null;
  readonly exit_code: number;
  readonly reason: string;
  readonly decision: 'allow' | 'block' | 'none';
  readonly additional_context: string | null;
  readonly diagnostics: string;
}

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
  readonly json?: HookJsonOutput;
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

function piDecision(outcome: HookOutcome): HookJsonOutput['decision'] {
  if (outcome.exitCode !== 0 || outcome.reason === 'context-unavailable') return 'block';
  if (outcome.permission?.decision === 'deny') return 'block';
  if (outcome.permission?.decision === 'allow') return 'allow';
  // Pi has no permission system of its own: a PreToolUse handler that ran and
  // did not object admits the tool call.
  return outcome.event === 'PreToolUse' && outcome.reason === 'ok' ? 'allow' : 'none';
}

function renderPiJson(outcome: HookOutcome): HostOutput {
  const json: HookJsonOutput = {
    protocol: 1,
    event: outcome.event,
    route_id: outcome.routeId,
    host: 'pi',
    repo_root: outcome.repoRoot,
    exit_code: outcome.exitCode,
    reason: outcome.reason,
    decision: piDecision(outcome),
    additional_context: outcome.additionalContext,
    diagnostics: boundedHookDiagnostic(outcome.diagnostics),
  };
  return { stdout: `${JSON.stringify(json)}\n`, stderr: '', json };
}

export const HOST_RENDERERS: Readonly<Record<RouteHost, (outcome: HookOutcome) => HostOutput>> = Object.freeze({
  claude: renderHookSpecificOutput,
  codex: renderCodexOutput,
  pi: renderPiJson,
});
