import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync, type StdioOptions } from 'child_process';
import { getRoute, type HookEvent, type RouteId } from './route-registry';
import { budgetSessionContext, type SessionContextSection } from './session-context-budget';
import { writeAllSync } from '../runtime/write-all-sync';
import { createHash } from 'crypto';

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

function extractSessionStartContext(output: Buffer | string | null | undefined): string | null {
  if (!output) return null;
  const text = output.toString().trim();
  if (!text) return null;
  if (!text.startsWith('{')) return text;
  try {
    const parsed = JSON.parse(text) as {
      hookSpecificOutput?: { hookEventName?: unknown; additionalContext?: unknown };
    };
    const specific = parsed.hookSpecificOutput;
    if (
      specific?.hookEventName === 'SessionStart' &&
      typeof specific.additionalContext === 'string'
    ) {
      return specific.additionalContext;
    }
  } catch {
    return text;
  }
  return text;
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

function isSoftMissingScript(event: HookEvent, routeId: RouteId, script: string): boolean {
  if (isSoftMissingRoute(event, routeId)) return true;
  return event === 'PostToolUse' && routeId === 'edit' && script === 'minimal-change-observer.sh';
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
    const stateSection = effectiveStateSessionSection(repoRoot);
    if (stateSection) sessionStartContexts.push(stateSection);
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

  for (const script of route.scripts) {
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
      env: { ...process.env, HOOK_REPO_ROOT: repoRoot },
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

    if (sessionStartCollectStdout && child.status === 0) {
      const context = extractSessionStartContext(child.stdout);
      if (context) {
        const securityBoundary = script === 'security-sentinel.sh';
        const taskState = script === 'session-start-context.sh';
        const scriptActionable = taskState && /^# (Pending Plan Capture|Capability Context Queue|Architecture Queue|Active Sprint)/m.test(context);
        sessionStartContexts.push({
          id: script,
          priority: securityBoundary ? 2 : taskState ? 5 : 6,
          content: context,
          mandatory: securityBoundary,
          actionable: securityBoundary || scriptActionable,
          reference: taskState
            ? 'repo-harness state resolve --json'
            : 'repo-harness setup check --json',
        });
      }
    }

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

  if (sessionStartCollectStdout && skippedScripts.length > 0) {
    sessionStartContexts.push({
      id: 'hooks-drift',
      priority: 6,
      content: `[repo-harness] hooks drift (source=${resolved.source}): missing ${skippedScripts.join(', ')}; ${syncHint}.`,
      mandatory: false,
      actionable: true,
      reference: syncHint,
    });
  }

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
