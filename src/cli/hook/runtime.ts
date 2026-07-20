import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync, type StdioOptions } from 'child_process';
import { getRoute, type HookEvent, type RouteId } from './route-registry';
import { budgetSessionContext, type SessionContextSection } from './session-context-budget';
import { writeAllSync } from '../runtime/write-all-sync';
import { createStateInputCollector } from '../../effects/loop/state-input-collector';
import { createHash } from 'crypto';
import { runMutationGuard } from './mutation-guard';
import { buildSessionStartSections } from './session-context';
import {
  consumePendingPostEditEvents,
  pendingPostEditJournalSection,
  runMutationObserved,
} from './mutation-observed';
import { resolveEffectiveState } from '../../effects/state/resolve-effective-state';
import type { EffectiveState } from '../../core/state/types';
import type { WorkflowProfile } from '../../core/workflow/profile';

const OPT_IN_MARKER = '.ai/harness/workflow-contract.json';
const POLICY_FILE = '.ai/harness/policy.json';
const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface RunHookOptions {
  event: HookEvent;
  routeId: RouteId;
  args?: readonly string[];
  cwd?: string;
  /** Pass-through stdio for the spawned hook script. Defaults to inherit. */
  stdio?: 'inherit' | 'pipe' | 'ignore';
  /** Optional override for the hooks dir (test only); defaults to resolveHooksDir(). */
  hooksDir?: string;
  /** Diagnostic command name for stderr messages. */
  commandName?: string;
  /** Host event payload, replayed unchanged to every script on the route. */
  input?: string | Buffer;
}

export interface RunHookResult {
  exitCode: number;
  reason:
    | 'not-in-git-repo'
    | 'repo-root-mismatch'
    | 'non-opt-in'
    | 'unknown-route'
    | 'missing-script'
    | 'script-failed'
    | 'ok';
  repoRoot?: string;
  scriptsRun: string[];
  skippedScripts: string[];
  failedScript?: string;
}

function recordHookInvocation(
  repoRoot: string,
  input: { event: HookEvent; routeId: RouteId; script: string; startedAt: number; durationMs: number; exitCode: number; stdout: Buffer | string | null | undefined },
): void {
  try {
    const output = input.stdout == null ? null : input.stdout.toString();
    const record = {
      protocol: 1,
      ts: new Date(input.startedAt).toISOString(),
      event: input.event,
      route_id: input.routeId,
      script: input.script,
      duration_ms: input.durationMs,
      exit_code: input.exitCode,
      output_bytes: output === null ? null : Buffer.byteLength(output, 'utf-8'),
      blocked: input.exitCode !== 0 || looksLikeHookDecisionJson(input.stdout) && output?.includes('"decision":"block"') === true,
      fingerprint: `sha256:${createHash('sha256').update(`${input.event}\0${input.routeId}\0${input.script}\0${input.exitCode}\0${output ?? 'unavailable'}`).digest('hex')}`,
    };
    const metricsPath = path.join(repoRoot, '.ai/harness/runs/hook-invocations.jsonl');
    fs.mkdirSync(path.join(repoRoot, '.ai/harness/runs'), { recursive: true });
    fs.appendFileSync(metricsPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  } catch {
    // Telemetry evidence is non-authoritative and must never alter hook safety.
  }
}

function looksLikeHookDecisionJson(output: Buffer | string | null | undefined): boolean {
  if (!output) return false;
  const text = output.toString().trim();
  if (!text.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(text) as { decision?: unknown };
    return parsed.decision === 'block' || parsed.decision === 'allow';
  } catch {
    return false;
  }
}

function looksLikeHookAdditionalContextJson(
  output: Buffer | string | null | undefined,
  hookEventName: HookEvent,
): boolean {
  if (!output) return false;
  const text = output.toString().trim();
  if (!text.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(text) as {
      hookSpecificOutput?: { hookEventName?: unknown; additionalContext?: unknown };
    };
    const specific = parsed.hookSpecificOutput;
    return (
      specific?.hookEventName === hookEventName &&
      typeof specific.additionalContext === 'string' &&
      specific.additionalContext.trim().length > 0
    );
  } catch {
    return false;
  }
}

function effectiveStateSessionSection(repoRoot: string): SessionContextSection | null {
  const cli = path.join(PACKAGE_ROOT, 'src', 'cli', 'index.ts');
  if (!fs.existsSync(cli)) return null;
  const resolved = spawnSync(process.execPath, [cli, 'state', 'resolve', '--json'], {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, HOOK_REPO_ROOT: repoRoot },
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
      (state.active_sprint?.path && state.active_sprint.freshness === 'fresh');
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

/**
 * HRD-03's PreEdit-shaped Effective State resolution thunk. Mirrors the
 * retired `pre-edit-guard.sh`'s `bun $CLI state resolve --json --operation
 * edit --target-path ...` call, but invokes the same `resolveEffectiveState`
 * function `src/cli/commands/state.ts` itself calls directly in-process --
 * `mutation-guard.ts` lives under `src/cli/*`, the same layer `state.ts`
 * already imports `resolveEffectiveState` from, so this is not a new
 * cross-layer dependency. Going in-process (rather than spawning the CLI as
 * a subprocess, matching `effectiveStateSessionSection` above) is what
 * collapses the old two-subprocess PreToolUse.edit chain's `bun_cli` count:
 * the resolver's own internal git/cache work still happens (this call is
 * not a no-op), but the wrapping subprocess spawn -- and the shell-side
 * `hook_json_get`/jq/bun fallback machinery around it -- disappears.
 * Exceptions (matching a non-zero CLI exit) collapse to `null`, exactly
 * like the old script's `cli_status -ne 0` branch.
 */
function resolvePreEditEffectiveState(repoRoot: string, targetPaths: readonly string[]): EffectiveState | null {
  const explicitOverride = process.env.REPO_HARNESS_WORKFLOW_PROFILE as WorkflowProfile | undefined;
  try {
    return resolveEffectiveState(repoRoot, Date.now(), {
      targetPaths,
      operationKind: 'edit',
      explicitOverride,
    });
  } catch {
    return null;
  }
}

export function resolveRepoRoot(cwd: string): string | null {
  try {
    const out = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
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

function resolveExplicitRepoRoot(cwd: string, env: NodeJS.ProcessEnv = process.env): {
  repoRoot: string | null;
  mismatch: boolean;
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

/**
 * Central-first hook script resolution. The packaged copy ships inside the
 * globally installed repo-harness package, so upgrading the CLI upgrades hook
 * behavior for every repo at once — no per-repo .ai/hooks refresh. Repos that
 * develop the hooks themselves (e.g. the repo-harness self-host checkout) pin
 * `"hook_source": "repo"` in .ai/harness/policy.json to keep running their
 * vendored copy.
 *
 * Order (mirrors scripts/hook-shim.sh, where "central" is the installed
 * ~/.repo-harness/hooks bundle instead of the packaged directory):
 *   1. REPO_HARNESS_HOOK_SOURCE env: `repo` | `central` | absolute hooks dir
 *   2. repo policy pin `"hook_source": "repo"`
 *   3. packaged assets/hooks (when present)
 *   4. vendored <repo>/.ai/hooks fallback
 */
export type HookSource = 'env' | 'repo-pin' | 'packaged' | 'repo-fallback';

export interface ResolvedHooksDir {
  dir: string;
  source: HookSource;
}

function repoPinsHookSource(repoRoot: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, POLICY_FILE), 'utf-8');
    const policy = JSON.parse(raw) as { hook_source?: unknown };
    return policy.hook_source === 'repo';
  } catch {
    return false;
  }
}

function packagedHooksDir(): string {
  return path.join(PACKAGE_ROOT, 'assets', 'hooks');
}

export function resolveHooksDir(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedHooksDir {
  const repoDir = path.join(repoRoot, '.ai/hooks');
  const override = env.REPO_HARNESS_HOOK_SOURCE?.trim();
  if (override === 'repo') return { dir: repoDir, source: 'env' };
  if (override === 'central') return { dir: packagedHooksDir(), source: 'env' };
  if (override && path.isAbsolute(override)) return { dir: override, source: 'env' };

  if (repoPinsHookSource(repoRoot)) return { dir: repoDir, source: 'repo-pin' };

  const packaged = packagedHooksDir();
  if (fs.existsSync(path.join(packaged, 'run-hook.sh'))) {
    return { dir: packaged, source: 'packaged' };
  }

  return { dir: repoDir, source: 'repo-fallback' };
}

function isSoftMissingRoute(event: HookEvent, routeId: RouteId): boolean {
  return (
    (event === 'SessionStart' && routeId === 'default') ||
    (event === 'PreToolUse' && routeId === 'subagent') ||
    (event === 'UserPromptSubmit' && routeId === 'delegation') ||
    (event === 'SubagentStart' && routeId === 'context') ||
    (event === 'SubagentStop' && routeId === 'quality') ||
    (event === 'Stop' && routeId === 'default') ||
    (event === 'PostToolUse' && routeId === 'always')
  );
}

// HRD-05: the PostToolUse.edit / minimal-change-observer.sh per-script
// exception that used to live here is now unreachable -- that route's
// script list is `[]` (route-registry.ts) and its dispatch bypasses
// route.scripts entirely (mutation-observed handler, see `steps` below), so
// the generic script loop this function gates can never see that script
// name for that route again. Removed rather than left dead, matching
// HRD-04's precedent for the analogous SessionStart case. `script` stays a
// parameter for a future per-script exception, unused today.
function isSoftMissingScript(event: HookEvent, routeId: RouteId, script: string): boolean {
  void script;
  return isSoftMissingRoute(event, routeId);
}

export function runHook(opts: RunHookOptions): RunHookResult {
  const cwd = opts.cwd ?? process.cwd();
  const commandName = opts.commandName ?? 'repo-harness hook';
  const scriptsRun: string[] = [];
  const skippedScripts: string[] = [];

  const resolvedRepo = resolveExplicitRepoRoot(cwd);
  if (resolvedRepo.mismatch) {
    return { exitCode: 0, reason: 'repo-root-mismatch', scriptsRun, skippedScripts };
  }
  const repoRoot = resolvedRepo.repoRoot;
  if (!repoRoot) {
    return { exitCode: 0, reason: 'not-in-git-repo', scriptsRun, skippedScripts };
  }
  if (!isOptIn(repoRoot)) {
    return { exitCode: 0, reason: 'non-opt-in', repoRoot, scriptsRun, skippedScripts };
  }

  // One lazy, memoizing collector per event (HRD-02), threaded to the call
  // sites HRD-03..06 will add. Today only the SessionStart branch below
  // reads from it; effectiveStateSessionSection is injected (not imported)
  // because state-input-collector.ts lives in the effects layer, which
  // cannot depend on this CLI module.
  const collector = createStateInputCollector({
    event: opts.event,
    repoRoot,
    resolveSessionEffectiveState: () => effectiveStateSessionSection(repoRoot),
    resolvePreEditEffectiveState: (targetPaths) => resolvePreEditEffectiveState(repoRoot, targetPaths),
  });

  const route = getRoute(opts.event, opts.routeId);
  if (!route) {
    writeAllSync(2,
      `${commandName}: unknown route ${opts.event}.${opts.routeId}\n`,
    );
    return { exitCode: 2, reason: 'unknown-route', repoRoot, scriptsRun, skippedScripts };
  }

  const resolved: ResolvedHooksDir = opts.hooksDir
    ? { dir: opts.hooksDir, source: 'env' }
    : resolveHooksDir(repoRoot);
  const hooksDir = resolved.dir;
  const syncHint =
    resolved.source === 'packaged'
      ? 'upgrade the repo-harness CLI (bun add -g repo-harness@latest) to refresh packaged hooks'
      : resolved.source === 'repo-fallback'
        ? 'upgrade the repo-harness CLI to restore packaged hooks, or set "hook_source": "repo" before syncing a full vendored hook runtime'
        : `run 'repo-harness adopt --repo ${repoRoot}' to sync pinned .ai/hooks`;
  const sessionStartCollectStdout = opts.event === 'SessionStart' && opts.stdio === undefined;
  const sessionStartContexts: SessionContextSection[] = [];
  if (sessionStartCollectStdout) {
    const stateSection = collector.getSessionEffectiveState();
    if (stateSection) sessionStartContexts.push(stateSection);
    // HRD-05: crash-replay visibility -- pending post-edit journal events
    // (written but not yet consumed at Stop) are surfaced here so a session
    // that resumes after a crash sees them. Defined in mutation-observed.ts
    // (outside session-context.ts, which is outside this package's Allowed
    // Paths) and pushed the same way effectiveStateSessionSection's result
    // is, immediately above.
    const pendingJournalSection = pendingPostEditJournalSection(repoRoot);
    if (pendingJournalSection) sessionStartContexts.push(pendingJournalSection);
  }
  // HRD-04: SessionStart.default's script list is replaced by the in-process
  // session-context builder (route.scripts is `[]`, mirroring HRD-03's
  // mutation-guard precedent), so the ordinary script loop below already
  // no-ops for this route. Runs unconditionally whenever this route matches
  // (scriptsRun + durable side effects + telemetry), exactly like the
  // retired 3-script loop ran regardless of sessionStartCollectStdout (a
  // caller that overrides opts.stdio still executed the scripts, with their
  // real side effects, just with I/O silenced) -- only pushing the resulting
  // sections into sessionStartContexts is gated on sessionStartCollectStdout,
  // matching the old per-script stdout->section extraction step exactly.
  const isSessionStartBuilderRoute = opts.event === 'SessionStart' && opts.routeId === 'default';
  if (isSessionStartBuilderRoute) {
    const builderScript = 'session-context';
    scriptsRun.push(builderScript);
    const startedAt = Date.now();
    const builtSections = buildSessionStartSections(collector, process.env, startedAt);
    if (sessionStartCollectStdout) sessionStartContexts.push(...builtSections);
    recordHookInvocation(repoRoot, {
      event: opts.event,
      routeId: opts.routeId,
      script: builderScript,
      startedAt,
      durationMs: Date.now() - startedAt,
      exitCode: 0,
      stdout: Buffer.from(builtSections.map((section) => section.content).join('\n'), 'utf-8'),
    });
  }

  // HRD-05: Stop's existing shell orchestration (stop-orchestrator.sh, run
  // unmodified immediately afterward via the generic script loop below)
  // keeps running; this is the minimal deferred-consumption wiring the
  // contract asks for -- reading pending post-edit journal events and
  // replaying the SAME external commands the retired scripts used
  // (architecture-queue/context-sync/capability-context/verify-contract/
  // minimal-change), then marking each event consumed atomically. Runs
  // before stop-orchestrator.sh so its own unconditional
  // `workflow_write_handoff "session-stop"` still refreshes the handoff
  // checkpoint afterward, matching the old per-edit-then-Stop ordering
  // closely enough for recovery purposes. Deliberately NOT added to
  // `scriptsRun`/`recordHookInvocation`: this route's `scripts_run`/
  // `child_invocations`/`write_set` shape is pinned byte-for-byte by the
  // HRD-01 golden (tests/fixtures/loop-runtime/characterization.json), and
  // this contract's Stop Conditions forbid shifting any cell other than
  // PostToolUse.edit. When there are no pending events (the golden's own
  // fixture scenario) this is a single failed readdir, zero subprocess
  // calls, zero writes -- unobservable in the golden's own terms. Wrapped in
  // try/catch: deferred-consumption housekeeping must never block Stop.
  if (opts.event === 'Stop' && opts.routeId === 'default') {
    try {
      consumePendingPostEditEvents(repoRoot, process.env);
    } catch {
      // Never fail Stop on deferred-consumption housekeeping.
    }
  }

  // Codex Desktop rejects Stop decision stdout at turn finalization, so collect
  // and suppress successful Stop output while preserving failure diagnostics.
  const codexStopSuppressSuccessOutput =
    process.env.HOOK_HOST === 'codex' &&
    opts.event === 'Stop' &&
    opts.stdio === undefined;
  const codexSubagentStopDecisionStdout =
    process.env.HOOK_HOST === 'codex' &&
    opts.event === 'SubagentStop' &&
    opts.routeId === 'quality' &&
    opts.stdio === undefined;
  const codexDecisionStdout = codexSubagentStopDecisionStdout;
  const codexAdditionalContextStdout =
    process.env.HOOK_HOST === 'codex' &&
    opts.stdio === undefined &&
    (
      (opts.event === 'UserPromptSubmit' && opts.routeId === 'delegation') ||
      (opts.event === 'SubagentStart' && opts.routeId === 'context')
    );
  const codexQuietStdout =
    process.env.HOOK_HOST === 'codex' &&
    opts.event !== 'SessionStart' &&
    !codexStopSuppressSuccessOutput &&
    !codexDecisionStdout &&
    !codexAdditionalContextStdout &&
    opts.stdio === undefined;
  const captureAndReplayHostOutput =
    process.env.HOOK_HOST !== 'codex' &&
    opts.event !== 'SessionStart' &&
    opts.stdio === undefined;
  const childStdin: StdioOptions[0] = opts.input === undefined ? 'inherit' : 'pipe';
  const stdio = (sessionStartCollectStdout
    ? [childStdin, 'pipe', 'inherit']
    : codexStopSuppressSuccessOutput
    ? [childStdin, 'pipe', 'pipe']
    : codexDecisionStdout
    ? [childStdin, 'pipe', 'pipe']
    : codexAdditionalContextStdout
    ? [childStdin, 'pipe', 'inherit']
    : codexQuietStdout
    ? [childStdin, 'pipe', 'inherit']
    : captureAndReplayHostOutput
    ? [childStdin, 'pipe', 'pipe']
    : (opts.stdio ?? 'inherit')) as StdioOptions;

  // HRD-03: PreToolUse.edit's script list is replaced by the in-process
  // mutation-guard handler; route.scripts for this route is `[]` (see
  // route-registry.ts), so the ordinary script loop below would already no-op
  // for it. This is the one route whose dispatch is NOT driven by
  // route.scripts at all anymore -- the handler always runs. The generic
  // script-spawn path immediately below is untouched and still drives every
  // other route exactly as before.
  const isMutationGuardRoute = opts.event === 'PreToolUse' && opts.routeId === 'edit';
  // HRD-05: PostToolUse.edit's script list is replaced by the in-process
  // mutation-observed journal handler; route.scripts for this route is `[]`
  // (see route-registry.ts), mirroring HRD-03's mutation-guard precedent
  // exactly -- this route's dispatch is NOT driven by route.scripts either.
  const isMutationObservedRoute = opts.event === 'PostToolUse' && opts.routeId === 'edit';
  const steps: readonly string[] = isMutationGuardRoute
    ? ['mutation-guard']
    : isMutationObservedRoute
      ? ['mutation-observed']
      : route.scripts;

  for (const script of steps) {
    if (isMutationObservedRoute && script === 'mutation-observed') {
      scriptsRun.push(script);
      const startedAt = Date.now();
      const handlerResult = runMutationObserved({ collector, input: opts.input, hooksDir, env: process.env });
      const child = {
        status: handlerResult.exitCode as number | null,
        stdout: Buffer.from(handlerResult.stdout, 'utf-8') as Buffer | null,
        stderr: Buffer.from(handlerResult.stderr, 'utf-8') as Buffer | null,
        error: undefined as Error | undefined,
      };
      recordHookInvocation(repoRoot, {
        event: opts.event,
        routeId: opts.routeId,
        script,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode: child.status ?? 0,
        stdout: child.stdout,
      });
      if (captureAndReplayHostOutput) {
        if (child.stdout) writeAllSync(1, child.stdout);
        if (child.stderr) writeAllSync(2, child.stderr);
      }
      // No SessionStart/Stop/decision/additionalContext branch applies to
      // PostToolUse.edit; only the Codex quiet-stdout failure diagnostic does.
      if (codexQuietStdout && child.status !== 0 && child.stdout) {
        writeAllSync(2, child.stdout);
      }
      if (child.status !== 0) {
        return {
          exitCode: child.status ?? 1,
          reason: 'script-failed',
          repoRoot,
          scriptsRun,
          skippedScripts,
          failedScript: script,
        };
      }
      continue;
    }

    if (isMutationGuardRoute && script === 'mutation-guard') {
      scriptsRun.push(script);
      const startedAt = Date.now();
      const handlerResult = runMutationGuard({ collector, input: opts.input });
      const child = {
        status: handlerResult.exitCode as number | null,
        stdout: Buffer.from(handlerResult.stdout, 'utf-8') as Buffer | null,
        stderr: Buffer.from(handlerResult.stderr, 'utf-8') as Buffer | null,
        error: undefined as Error | undefined,
      };
      recordHookInvocation(repoRoot, {
        event: opts.event,
        routeId: opts.routeId,
        script,
        startedAt,
        durationMs: Date.now() - startedAt,
        exitCode: child.status ?? 0,
        stdout: child.stdout,
      });
      if (captureAndReplayHostOutput) {
        if (child.stdout) writeAllSync(1, child.stdout);
        if (child.stderr) writeAllSync(2, child.stderr);
      }
      // No SessionStart/Stop/decision/additionalContext branch applies to
      // PreToolUse.edit; only the Codex quiet-stdout failure diagnostic does.
      if (codexQuietStdout && child.status !== 0 && child.stdout) {
        writeAllSync(2, child.stdout);
      }
      if (child.status !== 0) {
        return {
          exitCode: child.status ?? 1,
          reason: 'script-failed',
          repoRoot,
          scriptsRun,
          skippedScripts,
          failedScript: script,
        };
      }
      continue;
    }

    const scriptPath = path.join(hooksDir, script);
    if (!fs.existsSync(scriptPath)) {
      if (isSoftMissingScript(opts.event, opts.routeId, script)) {
        writeAllSync(2,
          `${commandName}: skipping missing script ${scriptPath} (route ${opts.event}.${opts.routeId}); ${syncHint}\n`,
        );
        skippedScripts.push(script);
        continue;
      }

      writeAllSync(2,
        `${commandName}: script not found at ${scriptPath} (route ${opts.event}.${opts.routeId})\n`,
      );
      return {
        exitCode: 3,
        reason: 'missing-script',
        repoRoot,
        scriptsRun,
        skippedScripts,
        failedScript: script,
      };
    }

    scriptsRun.push(script);
    const startedAt = Date.now();
    const child = spawnSync('bash', [scriptPath, ...(opts.args ?? [])], {
      cwd: repoRoot,
      stdio,
      input: opts.input,
      env: {
        ...process.env,
        HOOK_REPO_ROOT: repoRoot,
        REPO_HARNESS_HOOK_CLI: process.env.REPO_HARNESS_HOOK_CLI
          ?? path.join(PACKAGE_ROOT, 'src', 'cli', 'hook-entry.ts'),
      },
    });
    recordHookInvocation(repoRoot, {
      event: opts.event,
      routeId: opts.routeId,
      script,
      startedAt,
      durationMs: Date.now() - startedAt,
      exitCode: child.status ?? (child.error ? 1 : 0),
      stdout: child.stdout,
    });
    if (captureAndReplayHostOutput) {
      if (child.stdout) writeAllSync(1, child.stdout);
      if (child.stderr) writeAllSync(2, child.stderr);
    }

    if (child.error) {
      writeAllSync(2,
        `${commandName}: failed to run ${scriptPath}: ${child.error.message}\n`,
      );
      return {
        exitCode: 1,
        reason: 'script-failed',
        repoRoot,
        scriptsRun,
        skippedScripts,
        failedScript: script,
      };
    }

    if (
      codexDecisionStdout &&
      child.status === 0 &&
      looksLikeHookDecisionJson(child.stdout)
    ) {
      writeAllSync(1, child.stdout);
    }

    if (
      codexAdditionalContextStdout &&
      child.status === 0 &&
      looksLikeHookAdditionalContextJson(child.stdout, opts.event)
    ) {
      writeAllSync(1, child.stdout);
    }

    // HRD-04: the per-script SessionStart stdout->section extraction that
    // used to live here is retired along with the three scripts. SessionStart
    // has exactly one route (`default`), whose script list is now `[]` (see
    // route-registry.ts), so this loop never iterates with
    // sessionStartCollectStdout true any more -- the in-process
    // session-context builder above produces these sections directly instead
    // of round-tripping through a child stdout buffer.

    if (
      (codexStopSuppressSuccessOutput || codexDecisionStdout) &&
      child.status !== 0 &&
      child.stderr
    ) {
      writeAllSync(2, child.stderr);
    }

    if (
      (
        codexQuietStdout ||
        codexStopSuppressSuccessOutput ||
        codexDecisionStdout ||
        codexAdditionalContextStdout
      ) &&
      child.status !== 0 &&
      child.stdout
    ) {
      writeAllSync(2, child.stdout);
    }

    if (child.status !== 0) {
      return {
        exitCode: child.status ?? 1,
        reason: 'script-failed',
        repoRoot,
        scriptsRun,
        skippedScripts,
        failedScript: script,
      };
    }
  }

  // HRD-04: the "hooks-drift" synthetic section that used to fire here when
  // a SessionStart script was soft-missing is now unreachable -- SessionStart
  // has exactly one route, and that route's script list is `[]` (nothing can
  // ever land in skippedScripts while sessionStartCollectStdout is true), so
  // it is removed rather than left dead.

  if (sessionStartCollectStdout && sessionStartContexts.length > 0) {
    const sessionId = process.env.HOOK_SESSION_ID
      ?? process.env.CODEX_SESSION_ID
      ?? process.env.CLAUDE_SESSION_ID
      ?? null;
    const budgeted = budgetSessionContext(repoRoot, sessionStartContexts, sessionId);
    if (!budgeted.context) {
      return { exitCode: 0, reason: 'ok', repoRoot, scriptsRun, skippedScripts };
    }
    writeAllSync(1, `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: budgeted.context,
      },
    })}\n`);
  }

  return { exitCode: 0, reason: 'ok', repoRoot, scriptsRun, skippedScripts };
}
