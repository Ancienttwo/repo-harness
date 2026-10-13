import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { getRoute, routeSupportsHost, type HookEvent, type HookHandlerId, type RouteHost, type RouteId } from './route-registry';
import { getHandlerForRoute } from './handler-registry';
import { budgetSessionContext, errorHash } from './session-context-budget';
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
import type { EffectiveState } from '../../core/state/types';
import type { HookHandlerResult } from './handler-contract';
import { HookPayloadError, hookIdentity, parseHookPayload, type HookIdentity } from './hook-input';
import { boundedHookDiagnostic, HOST_RENDERERS, type HookJsonOutput, type HookOutcome } from './hook-protocol';
import { inspectWorkflowMarker, WORKFLOW_MARKER_GATE_EVENTS } from '../../core/adoption/minimum-harness-version';

export const HOOK_COMMAND_NAME = 'repo-harness-hook';
const OPT_IN_MARKER = '.ai/harness/workflow-contract.json';
const HOOK_HOSTS: readonly RouteHost[] = ['claude', 'codex', 'pi'];

export interface RunHookOptions {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly cwd?: string;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
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

type EffectiveStateResolver = (repoRoot: string, nowMs: number) => EffectiveState;

/**
 * The single Effective State policy for every hook event: the same
 * resolution as `repo-harness state resolve --json`, one timestamp, at most
 * three attempts for transient contention, and a hashed failure that each
 * handler renders in its own advisory.
 */
export function resolveHookEffectiveState(
  repoRoot: string,
  nowMs: number,
  resolve: EffectiveStateResolver = resolveEffectiveState,
): EffectiveStateResolution {
  let failure: unknown = null;
  for (let attempt = 1; attempt <= EFFECTIVE_STATE_RESOLUTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return { ok: true, state: resolve(repoRoot, nowMs) };
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
  const emit = (outcome: HookOutcome): HookJsonOutput | undefined => {
    const output = render(outcome);
    writeText(2, output.stderr);
    writeText(1, output.stdout);
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
    const repair = host === 'pi' ? 'Reload the Pi extension.' : `Run repo-harness install --target ${host} --location global.`;
    return early(2, 'unknown-route', repoRoot, `${HOOK_COMMAND_NAME}: unknown route ${opts.event}.${opts.routeId}. ${repair}\n`);
  }
  if (!routeSupportsHost(route, host)) {
    return early(2, 'unsupported-host-route', repoRoot,
      `${HOOK_COMMAND_NAME}: unsupported-host-route: ${opts.event}.${opts.routeId} is not installed for ${host}\n`);
  }
  // Session and turn events report the gate with exit 1, which does not block. Tool events skip it, so every guard still runs.
  const markerGate = WORKFLOW_MARKER_GATE_EVENTS.has(opts.event) ? inspectWorkflowMarker(repoRoot) : null;
  if (markerGate) return early(1, markerGate.code, repoRoot, `${HOOK_COMMAND_NAME}: ${markerGate.message}\n`);

  const handler = getHandlerForRoute(route);
  const telemetry = createHookEventTelemetry({ repoRoot, event: opts.event, routeId: opts.routeId });
  const now = new Date();
  const collector = createStateInputCollector({
    repoRoot,
    resolveEffectiveState: () =>
      resolveHookEffectiveState(repoRoot, now.getTime()),
  });

  let identity: HookIdentity = { host, sessionId: null, runId: null, turnId: null };
  let result: HookHandlerResult;
  let reason: string;
  try {
    const payload = parseHookPayload(opts.input);
    identity = hookIdentity(payload, host);
    result = handler.run({ event: opts.event, repoRoot, payload, identity, env, now, collector });
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

  const additionalContext = result.sessionContexts
    ? budgetSessionContext(result.sessionContexts) || null
    : result.additionalContext ?? null;
  const exitCode = result.exitCode;
  const json = emit({
    event: opts.event,
    routeId: opts.routeId,
    repoRoot,
    exitCode,
    reason,
    permission: result.permission,
    additionalContext,
    diagnostics: result.diagnostics ?? '',
  });
  telemetry.finalize({
    identity,
    exitCode,
    blocked: exitCode === 2 || result.permission?.decision === 'deny',
    reason,
  });
  return { exitCode, reason, repoRoot, handler: handler.id, ...(json ? { json } : {}) };
}
