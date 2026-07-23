import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getRoute, type HookEvent, type HookHandlerId, type RouteId } from './route-registry';
import { getHandlerForRoute } from './handler-registry';
import { budgetSessionContext } from './session-context-budget';
import { writeAllSync } from '../runtime/write-all-sync';
import { createStateInputCollector } from '../../effects/loop/state-input-collector';
import { createHookEventTelemetry } from './event-telemetry';
import { resolveEffectiveState } from '../../effects/state/resolve-effective-state';
import type { EffectiveState } from '../../core/state/types';
import type { WorkflowProfile } from '../../core/workflow/profile';
import type { HookHandlerResult } from './handler-contract';

const OPT_IN_MARKER = '.ai/harness/workflow-contract.json';
const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface RunHookOptions {
  readonly event: HookEvent;
  readonly routeId: RouteId;
  readonly cwd?: string;
  /** Host output mode. The runtime owns all fd shaping; handlers never write to host fds. */
  readonly stdio?: 'inherit' | 'pipe' | 'ignore';
  readonly commandName?: string;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RunHookResult {
  readonly exitCode: number;
  readonly reason:
    | 'not-in-git-repo'
    | 'repo-root-mismatch'
    | 'non-opt-in'
    | 'unknown-route'
    | 'handler-unbound'
    | 'handler-failed'
    | 'ok';
  readonly repoRoot?: string;
  readonly handler?: HookHandlerId;
}

function outputBytes(output: string | null | undefined): number | null {
  return output == null ? null : Buffer.byteLength(output, 'utf8');
}

function parseJson(output: string): Record<string, unknown> | null {
  const text = output.trim();
  if (!text.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isDecisionOutput(output: string): boolean {
  const decision = parseJson(output)?.decision;
  return decision === 'allow' || decision === 'block';
}

function isAdditionalContextOutput(output: string, event: HookEvent): boolean {
  const parsed = parseJson(output);
  const specific = parsed?.hookSpecificOutput;
  return Boolean(
    specific && typeof specific === 'object' && !Array.isArray(specific) &&
    (specific as Record<string, unknown>).hookEventName === event &&
    typeof (specific as Record<string, unknown>).additionalContext === 'string' &&
    String((specific as Record<string, unknown>).additionalContext).trim(),
  );
}

function isStructuredHookOutput(output: string, event: HookEvent): boolean {
  return isDecisionOutput(output) || isAdditionalContextOutput(output, event);
}

function writeText(fd: 1 | 2, value: string): void {
  if (value) writeAllSync(fd, value);
}

function hostOutput(
  opts: RunHookOptions,
  result: HookHandlerResult,
  repoRoot: string,
): void {
  const env = opts.env ?? process.env;
  const mode = opts.stdio;
  if (mode === 'ignore' || mode === 'pipe') return;

  const isSessionDefault = opts.event === 'SessionStart' && opts.routeId === 'default';
  const isDefaultSessionCapture = isSessionDefault && mode === undefined;
  if (isDefaultSessionCapture) {
    if (result.stderr) writeText(2, result.stderr);
    const sections = result.sessionContexts ?? [];
    if (sections.length === 0) return;
    const sessionId = env.HOOK_SESSION_ID ?? env.CODEX_SESSION_ID ?? env.CLAUDE_SESSION_ID ?? null;
    const budgeted = budgetSessionContext(repoRoot, sections, sessionId);
    if (!budgeted.context) return;
    writeText(1, `${JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: budgeted.context },
    })}\n`);
    return;
  }

  if (mode === 'inherit') {
    writeText(1, result.stdout);
    writeText(2, result.stderr);
    return;
  }

  // Claude's default adapter consumes both streams. Codex's adapter consumes
  // only the explicitly structured success envelope for decision/context
  // routes; all other successful stdout is intentionally quiet.
  if (env.HOOK_HOST !== 'codex') {
    writeText(1, result.stdout);
    writeText(2, result.stderr);
    return;
  }

  const structuredSuccess = result.exitCode === 0 && isStructuredHookOutput(result.stdout, opts.event);
  const structuredRoute =
    (opts.event === 'PreToolUse' && opts.routeId === 'subagent') ||
    (opts.event === 'UserPromptSubmit' && opts.routeId === 'delegation') ||
    (opts.event === 'SubagentStart' && opts.routeId === 'context') ||
    (opts.event === 'SubagentStop' && opts.routeId === 'quality');
  if (structuredRoute && structuredSuccess) writeText(1, result.stdout);
  if (result.exitCode !== 0) {
    writeText(2, result.stderr);
    if (result.stdout) writeText(2, result.stdout);
  } else {
    writeText(2, result.stderr);
  }
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

function canonicalPath(input: string): string {
  const resolved = path.resolve(input);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function resolveExplicitRepoRoot(cwd: string, env: NodeJS.ProcessEnv): {
  readonly repoRoot: string | null;
  readonly mismatch: boolean;
} {
  const explicit = env.HOOK_REPO_ROOT?.trim();
  if (!explicit) return { repoRoot: resolveRepoRoot(cwd), mismatch: false };
  const explicitRoot = resolveRepoRoot(explicit);
  if (!explicitRoot) return { repoRoot: null, mismatch: false };
  const cwdRoot = resolveRepoRoot(cwd);
  if (cwdRoot && canonicalPath(cwdRoot) !== canonicalPath(explicitRoot)) {
    return { repoRoot: null, mismatch: true };
  }
  return { repoRoot: explicitRoot, mismatch: false };
}

export function isOptIn(repoRoot: string): boolean {
  return fs.existsSync(path.join(repoRoot, OPT_IN_MARKER));
}

function effectiveStateSessionSection(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): import('./session-context-budget').SessionContextSection | null {
  const cli = path.join(PACKAGE_ROOT, 'src', 'cli', 'index.ts');
  if (!fs.existsSync(cli)) return null;
  const resolved = spawnSync(process.execPath, [cli, 'state', 'resolve', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...env, HOOK_REPO_ROOT: repoRoot },
  });
  if (!resolved.stdout?.trim()) return null;
  try {
    const state = JSON.parse(resolved.stdout) as {
      task_id?: unknown;
      phase?: unknown;
      state_version?: unknown;
      state_revision?: unknown;
      workflow_profile?: unknown;
      next_action?: unknown;
      guidance?: unknown;
      blockers?: unknown;
      allowed_paths?: unknown;
      checks?: unknown;
      authoritative_plan?: { path?: unknown } | null;
      contract?: { path?: unknown } | null;
      active_sprint?: { path?: unknown; freshness?: unknown } | null;
      handoff?: { path?: unknown; freshness?: unknown } | null;
      resume?: { path?: unknown; freshness?: unknown } | null;
    };
    const blockers = Array.isArray(state.blockers) ? state.blockers : [];
    const actionable = typeof state.task_id === 'string' || blockers.length > 0 ||
      Boolean(state.active_sprint?.path && state.active_sprint.freshness === 'fresh');
    if (!actionable) return null;
    const compact = {
      task_id: state.task_id ?? null,
      phase: state.phase ?? 'unknown',
      state_version: state.state_version ?? null,
      state_revision: state.state_revision ?? null,
      workflow_profile: state.workflow_profile ?? null,
      next_action: state.next_action ?? null,
      guidance: state.guidance ?? null,
      blockers,
      allowed_paths: Array.isArray(state.allowed_paths) ? state.allowed_paths : [],
      checks: state.checks ?? null,
      references: {
        plan: state.authoritative_plan?.path ?? null,
        contract: state.contract?.path ?? null,
        sprint: state.active_sprint?.path ?? null,
        handoff: state.handoff?.path ?? null,
        resume: state.resume?.path ?? null,
      },
    };
    return {
      id: 'effective-state',
      priority: 2,
      content: `[HarnessState] ${JSON.stringify(compact)}`,
      mandatory: true,
      actionable: true,
      reference: 'repo-harness state resolve --json',
    };
  } catch {
    return null;
  }
}

const PRE_EDIT_RESOLUTION_MAX_ATTEMPTS = 3;
const STABILITY_UNSTABLE_MESSAGE = 'workflow authority changed repeatedly while resolving effective state';
const LOCK_TIMEOUT_MESSAGE_PREFIX = 'timed out waiting for exclusive lock ';

/**
 * The two known transient-instability throw signatures resolveEffectiveState
 * can raise: the stability contract's re-read exhaustion (partitioned to
 * authority sources only in resolve-effective-state.ts, but still reachable
 * under sustained AUTHORITY churn) and the exclusive state-lock timeout
 * (src/effects/locking/exclusive-directory-lock.ts). Both are concurrent-
 * write contention, not a genuinely unresolvable workflow profile -- the
 * bounded retry below gives ordinary contention a chance to clear before
 * falling back to a distinct, truthful fail-closed diagnostic in
 * mutation-guard.ts. Any other throw keeps today's exact behavior: caught
 * immediately below, reported as `null` with zero retries.
 */
function isTransientResolutionInstability(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message === STABILITY_UNSTABLE_MESSAGE
    || error.message.startsWith(LOCK_TIMEOUT_MESSAGE_PREFIX);
}

function resolvePreEditEffectiveState(
  repoRoot: string,
  targetPaths: readonly string[],
  env: NodeJS.ProcessEnv,
): EffectiveState | null {
  const explicitOverride = env.REPO_HARNESS_WORKFLOW_PROFILE as WorkflowProfile | undefined;
  let lastInstability: unknown = null;
  for (let attempt = 1; attempt <= PRE_EDIT_RESOLUTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return resolveEffectiveState(repoRoot, Date.now(), {
        targetPaths,
        operationKind: 'edit',
        explicitOverride,
      });
    } catch (error) {
      if (!isTransientResolutionInstability(error)) return null;
      lastInstability = error;
    }
  }
  // Bounded retry exhausted: residual instability. Re-throw the original
  // error (message unchanged) instead of collapsing to null, so
  // mutation-guard.ts can render a distinct fail-closed diagnostic rather
  // than the misleading generic "resolution failed" banner.
  throw lastInstability;
}

function resolveStopEffectiveState(repoRoot: string, env: NodeJS.ProcessEnv): EffectiveState | null {
  const explicitOverride = env.REPO_HARNESS_WORKFLOW_PROFILE as WorkflowProfile | undefined;
  try {
    return resolveEffectiveState(repoRoot, Date.now(), {
      operationKind: 'inspect',
      explicitOverride,
    });
  } catch {
    return null;
  }
}

export function runHook(opts: RunHookOptions): RunHookResult {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const commandName = opts.commandName ?? 'repo-harness hook';
  const resolved = resolveExplicitRepoRoot(cwd, env);
  if (resolved.mismatch) return { exitCode: 0, reason: 'repo-root-mismatch' };
  const repoRoot = resolved.repoRoot;
  if (!repoRoot) return { exitCode: 0, reason: 'not-in-git-repo' };
  if (!isOptIn(repoRoot)) return { exitCode: 0, reason: 'non-opt-in', repoRoot };

  const route = getRoute(opts.event, opts.routeId);
  if (!route) {
    writeAllSync(2, `${commandName}: unknown route ${opts.event}.${opts.routeId}\n`);
    return { exitCode: 2, reason: 'unknown-route', repoRoot };
  }
  const handler = getHandlerForRoute(route);
  if (!handler) {
    writeAllSync(2, `${commandName}: no typed handler for ${opts.event}.${opts.routeId}\n`);
    return { exitCode: 2, reason: 'handler-unbound', repoRoot };
  }

  const telemetry = createHookEventTelemetry({ repoRoot, event: opts.event, routeId: opts.routeId, input: opts.input, env });
  const collector = createStateInputCollector({
    event: opts.event,
    repoRoot,
    resolveSessionEffectiveState: () => {
      telemetry.recordStateResolution();
      telemetry.markMetricsComplete(['state_resolutions']);
      return effectiveStateSessionSection(repoRoot, env);
    },
    resolvePreEditEffectiveState: (targetPaths) => {
      telemetry.recordStateResolution();
      telemetry.markMetricsComplete(['state_resolutions']);
      return resolvePreEditEffectiveState(repoRoot, targetPaths, env);
    },
    resolveStopEffectiveState: () => {
      telemetry.recordStateResolution();
      telemetry.markMetricsComplete(['state_resolutions']);
      return resolveStopEffectiveState(repoRoot, env);
    },
  });

  let handlerResult: HookHandlerResult;
  let handlerThrew = false;
  const startedAt = new Date();
  try {
    handlerResult = handler.run({
      event: opts.event,
      routeId: opts.routeId,
      repoRoot,
      input: opts.input,
      env,
      now: startedAt,
      collector,
      dependencies: {
        observeJournalWrite: (journalPath) => {
          telemetry.recordEventWrite(journalPath);
          telemetry.recordWriteTransaction();
        },
        observeProjectionWrite: (target) => telemetry.recordDurableWrite(target.path),
        observeProjectionTransaction: () => telemetry.recordWriteTransaction(),
      },
      collectSessionStdout: opts.event === 'SessionStart' && opts.stdio === undefined,
    });
  } catch (error) {
    handlerThrew = true;
    const detail = error instanceof Error ? error.message : String(error);
    handlerResult = {
      exitCode: 1,
      stdout: '',
      stderr: `${commandName}: ${handler.id} failed: ${detail}\n`,
      reason: 'handler-failed',
    };
  }

  telemetry.recordStep({
    name: handler.id,
    execution: 'in_process',
    startedAt,
    elapsedMs: Date.now() - startedAt.getTime(),
    exitCode: handlerResult.exitCode,
    outputBytes: outputBytes(handlerResult.stdout),
    blocked: isDecisionOutput(handlerResult.stdout) && parseJson(handlerResult.stdout)?.decision === 'block',
  });
  // A typed step is observable, but being in-process does not make every
  // logical filesystem access observable automatically. Preserve HRD-08's
  // fail-closed metric semantics: only mark the write sets whose handlers
  // report every write through the injected observers. The remaining typed
  // handlers have no opaque runtime step, while their uninstrumented logical
  // file counters remain explicitly incomplete instead of becoming a false
  // zero/pass.
  if (!handlerThrew && handler.id === 'mutation-observed') {
    telemetry.markMetricsComplete([
      'state_resolutions',
      'files_written',
      'durable_writes',
      'write_transactions',
      'full_projection_writes',
      'event_writes',
    ]);
  }
  if (!handlerThrew && handler.id === 'stop') {
    telemetry.markMetricsComplete([
      'files_written',
      'durable_writes',
      'write_transactions',
    ]);
  }
  hostOutput(opts, handlerResult, repoRoot);
  const exitCode = handlerResult.exitCode;
  const publicReason: RunHookResult['reason'] = exitCode === 0 ? 'ok' : 'handler-failed';
  // Handler-specific detail is retained only in the event telemetry record;
  // the public runtime result has one stable success/failure vocabulary.
  telemetry.finalize({
    exitCode,
    reason: handlerResult.reason ?? publicReason,
    blocked: exitCode !== 0,
  });
  return { exitCode, reason: publicReason, repoRoot, handler: handler.id };
}
