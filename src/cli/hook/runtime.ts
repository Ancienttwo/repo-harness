import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { getRoute, routeSupportsHost, type HookEvent, type HookHandlerId, type RouteHost, type RouteId } from './route-registry';
import { getHandlerForRoute } from './handler-registry';
import {
  budgetSessionContext,
  errorHash,
  type SessionContextProviderDiagnostic,
  type SessionContextSection,
} from './session-context-budget';
import { writeAllSync } from '../runtime/write-all-sync';
import {
  createStateInputCollector,
  type EffectiveStateResolution,
} from '../../effects/loop/state-input-collector';
import { createHookEventTelemetry } from './event-telemetry';
import {
  resolveEffectiveState,
  StateResolutionUnstableError,
} from '../../effects/state/resolve-effective-state';
import { ExclusiveLockContentionError } from '../../effects/locking/exclusive-directory-lock';
import type { EffectiveState, EffectiveStateRiskInput } from '../../core/state/types';
import type { WorkflowProfile } from '../../core/workflow/profile';
import type { HookHandlerResult } from './handler-contract';
import { HookPayloadError, parseHookPayload, type HookIdentity } from './hook-input';
import { resolveHookIdentity } from './run-identity';
import { boundedHookDiagnostic, HOST_RENDERERS, type HookJsonOutput, type HookOutcome } from './hook-protocol';
import { inspectWorkflowMarker } from '../../core/adoption/minimum-harness-version';

export const HOOK_COMMAND_NAME = 'repo-harness-hook';
const OPT_IN_MARKER = '.ai/harness/workflow-contract.json';
const HOOK_HOSTS: readonly RouteHost[] = ['claude', 'codex', 'pi'];

export interface RunHookOptions {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly cwd?: string;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
  readonly worktreeSweepDeadlineMs?: number;
}

export interface RunHookResult {
  readonly exitCode: number;
  readonly reason: string;
  readonly repoRoot?: string;
  readonly handler?: HookHandlerId;
  readonly json?: HookJsonOutput;
}

export function resolveRepoRoot(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

/**
 * The managed command already ran `git rev-parse --show-toplevel` in the hook
 * cwd and exported the result, so a managed call spawns no second git. Pi
 * strips `HOOK_REPO_ROOT` and resolves from its cwd.
 */
export function resolveHookRepoRoot(cwd: string, env: NodeJS.ProcessEnv): string | null {
  const explicit = env.HOOK_REPO_ROOT?.trim();
  if (!explicit) return resolveRepoRoot(cwd);
  try {
    return fs.realpathSync(explicit);
  } catch {
    return null;
  }
}

export function isOptIn(repoRoot: string): boolean {
  return fs.existsSync(path.join(repoRoot, OPT_IN_MARKER));
}

const EFFECTIVE_STATE_RESOLUTION_MAX_ATTEMPTS = 3;

/**
 * The transient throw signatures of resolveEffectiveState: the stability
 * contract's re-read exhaustion and exclusive state-lock contention. Both are
 * concurrent-write contention, so a bounded retry can clear them. Each throw
 * site owns its error type; this classifier never inspects message text.
 */
function isTransientResolutionInstability(error: unknown): boolean {
  return error instanceof StateResolutionUnstableError
    || error instanceof ExclusiveLockContentionError;
}

type EffectiveStateResolver = (
  repoRoot: string,
  nowMs: number,
  risk?: EffectiveStateRiskInput,
) => EffectiveState;

function effectiveStateRisk(
  event: HookEvent,
  targetPaths: readonly string[],
  env: NodeJS.ProcessEnv,
): EffectiveStateRiskInput {
  const explicitOverride = env.REPO_HARNESS_WORKFLOW_PROFILE as WorkflowProfile | undefined;
  if (event === 'PreToolUse') return { targetPaths, operationKind: 'edit', explicitOverride };
  if (event === 'Stop') return { operationKind: 'inspect', explicitOverride };
  // SessionStart matches `repo-harness state resolve --json` exactly: no
  // operation or profile override, even when hook-only env vars are set.
  return {};
}

/**
 * The single Effective State policy for every hook event: one timestamp,
 * at most three attempts for transient contention, and a hashed failure that
 * each handler renders in its own advisory.
 */
export function resolveHookEffectiveState(
  repoRoot: string,
  event: HookEvent,
  targetPaths: readonly string[],
  env: NodeJS.ProcessEnv,
  nowMs: number,
  resolve: EffectiveStateResolver = resolveEffectiveState,
): EffectiveStateResolution {
  const risk = effectiveStateRisk(event, targetPaths, env);
  let failure: unknown = null;
  for (let attempt = 1; attempt <= EFFECTIVE_STATE_RESOLUTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return { ok: true, state: resolve(repoRoot, nowMs, risk) };
    } catch (error) {
      failure = error;
      if (!isTransientResolutionInstability(error)) break;
    }
  }
  return {
    ok: false,
    reason_code: isTransientResolutionInstability(failure) ? 'state_resolution_unstable' : 'state_resolution_failed',
    error_hash: errorHash(failure),
    message: failure instanceof Error ? failure.message : String(failure),
  };
}

function hostFrom(env: NodeJS.ProcessEnv): RouteHost | null {
  const host = env.HOOK_HOST;
  return HOOK_HOSTS.includes(host as RouteHost) ? host as RouteHost : null;
}

function writeText(fd: 1 | 2, value: string): void {
  if (value) writeAllSync(fd, value);
}

interface Delivery {
  readonly additionalContext: string | null;
  readonly delivered: () => void;
}

/** Budget SessionStart sections once; `delivered` runs after the host write. */
function sessionDelivery(
  repoRoot: string,
  sections: readonly SessionContextSection[],
  sessionId: string | null,
  diagnostics: readonly SessionContextProviderDiagnostic[],
): Delivery {
  if (sections.length === 0 && diagnostics.length === 0) return { additionalContext: null, delivered: () => {} };
  const budgeted = budgetSessionContext(repoRoot, sections, sessionId, diagnostics);
  return {
    additionalContext: budgeted.context || null,
    delivered: () => {
      const included = new Set(budgeted.evidence.included_sections);
      for (const section of sections) if (included.has(section.id)) section.onDelivered?.();
    },
  };
}

function outcomeReason(result: HookHandlerResult): string {
  if (result.reason) return result.reason;
  if (result.exitCode === 0) return result.permission?.decision === 'deny' ? 'blocked' : 'ok';
  return result.exitCode === 2 ? 'blocked' : 'handler-exit';
}

export function runHook(opts: RunHookOptions): RunHookResult {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const route = getRoute(opts.event, opts.routeId);
  const host = hostFrom(env);
  if (!host) {
    writeText(2, `${HOOK_COMMAND_NAME}: HOOK_HOST must be one of ${HOOK_HOSTS.join(', ')}\n`);
    return { exitCode: route?.failClosed ? 2 : 1, reason: 'unknown-host' };
  }
  const render = HOST_RENDERERS[host];
  const emit = (outcome: HookOutcome, delivered?: () => void): HookJsonOutput | undefined => {
    const output = render(outcome);
    writeText(2, output.stderr);
    writeText(1, output.stdout);
    if (output.stdout) delivered?.();
    return output.json;
  };
  const early = (exitCode: number, reason: string, repoRoot: string | null, diagnostics = ''): RunHookResult => {
    const json = emit({
      event: opts.event, routeId: opts.routeId, repoRoot, exitCode, reason, additionalContext: null, diagnostics,
    });
    return { exitCode, reason, ...(repoRoot ? { repoRoot } : {}), ...(json ? { json } : {}) };
  };

  const repoRoot = resolveHookRepoRoot(cwd, env);
  if (!repoRoot) return early(0, 'not-in-git-repo', null);
  if (!isOptIn(repoRoot)) return early(0, 'non-opt-in', repoRoot);
  if (!route) {
    return early(2, 'unknown-route', repoRoot, `${HOOK_COMMAND_NAME}: unknown route ${opts.event}.${opts.routeId}\n`);
  }
  if (!routeSupportsHost(route, host)) {
    return early(2, 'unsupported-host-route', repoRoot,
      `${HOOK_COMMAND_NAME}: unsupported-host-route: ${opts.event}.${opts.routeId} is not installed for ${host}\n`);
  }
  // Exit 1 reports without blocking: exit 2 would hold Stop and UserPromptSubmit hosts.
  const markerGate = inspectWorkflowMarker(repoRoot);
  if (markerGate) return early(1, markerGate.code, repoRoot, `${HOOK_COMMAND_NAME}: ${markerGate.message}\n`);

  const handler = getHandlerForRoute(route);
  const telemetry = createHookEventTelemetry({ repoRoot, event: opts.event, routeId: opts.routeId });
  const providerDiagnostics: SessionContextProviderDiagnostic[] = [];
  const now = new Date();
  const collector = createStateInputCollector({
    repoRoot,
    resolveEffectiveState: (targetPaths) =>
      resolveHookEffectiveState(repoRoot, opts.event, targetPaths, env, now.getTime()),
  });

  let identity: HookIdentity = { host, sessionId: null, runId: null, turnId: null };
  let result: HookHandlerResult;
  let reason: string;
  try {
    const payload = parseHookPayload(opts.input);
    identity = resolveHookIdentity(repoRoot, opts.event, payload, host, now);
    result = handler.run({
      event: opts.event,
      repoRoot,
      sessionCwd: cwd,
      payload,
      identity,
      env,
      now,
      collector,
      worktreeSweepDeadlineMs: opts.worktreeSweepDeadlineMs,
      observeSessionContextDiagnostic: (diagnostic) => { providerDiagnostics.push(diagnostic); },
    });
    reason = outcomeReason(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // A crash of an admission route must not admit the tool call: hosts read
    // only exit 2 as a block.
    result = {
      exitCode: route.failClosed ? 2 : 1,
      diagnostics: boundedHookDiagnostic(`${HOOK_COMMAND_NAME}: ${handler.id} failed: ${detail}\n`),
    };
    reason = error instanceof HookPayloadError ? 'invalid-payload' : 'handler-failed';
  }

  const session = result.sessionContexts
    ? sessionDelivery(repoRoot, result.sessionContexts, identity.sessionId, providerDiagnostics)
    : null;
  const exitCode = result.exitCode;
  const json = emit({
    event: opts.event,
    routeId: opts.routeId,
    repoRoot,
    exitCode,
    reason,
    permission: result.permission,
    additionalContext: session ? session.additionalContext : result.additionalContext ?? null,
    diagnostics: result.diagnostics ?? '',
  }, session?.delivered);
  telemetry.finalize({
    identity,
    exitCode,
    blocked: exitCode === 2 || result.permission?.decision === 'deny',
    reason,
  });
  return { exitCode, reason, repoRoot, handler: handler.id, ...(json ? { json } : {}) };
}
