import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, spawnSync, type StdioOptions } from 'child_process';
import { getRoute, type HookEvent, type RouteId } from './route-registry';

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
}

export interface RunHookResult {
  exitCode: number;
  reason:
    | 'not-in-git-repo'
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
    (event === 'Stop' && routeId === 'default')
  );
}

export function runHook(opts: RunHookOptions): RunHookResult {
  const cwd = opts.cwd ?? process.cwd();
  const commandName = opts.commandName ?? 'repo-harness hook';
  const scriptsRun: string[] = [];
  const skippedScripts: string[] = [];

  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) {
    return { exitCode: 0, reason: 'not-in-git-repo', scriptsRun, skippedScripts };
  }
  if (!isOptIn(repoRoot)) {
    return { exitCode: 0, reason: 'non-opt-in', repoRoot, scriptsRun, skippedScripts };
  }

  const route = getRoute(opts.event, opts.routeId);
  if (!route) {
    process.stderr.write(
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
      ? 'upgrade the repo-harness CLI (npm install -g repo-harness@latest) to refresh packaged hooks'
      : `run 'repo-harness update --repo ${repoRoot}' to sync .ai/hooks`;
  const sessionStartCollectStdout = opts.event === 'SessionStart' && opts.stdio === undefined;
  const sessionStartContexts: string[] = [];
  const codexStopDecisionStdout =
    process.env.HOOK_HOST === 'codex' &&
    opts.event === 'Stop' &&
    opts.stdio === undefined;
  const codexQuietStdout =
    process.env.HOOK_HOST === 'codex' &&
    opts.event !== 'SessionStart' &&
    !codexStopDecisionStdout &&
    opts.stdio === undefined;
  const stdio: StdioOptions = sessionStartCollectStdout
    ? ['inherit', 'pipe', 'inherit']
    : codexStopDecisionStdout
    ? ['inherit', 'pipe', 'pipe']
    : codexQuietStdout
    ? ['inherit', 'pipe', 'inherit']
    : (opts.stdio ?? 'inherit');

  for (const script of route.scripts) {
    const scriptPath = path.join(hooksDir, script);
    if (!fs.existsSync(scriptPath)) {
      if (isSoftMissingRoute(opts.event, opts.routeId)) {
        process.stderr.write(
          `${commandName}: skipping missing script ${scriptPath} (route ${opts.event}.${opts.routeId}); ${syncHint}\n`,
        );
        skippedScripts.push(script);
        continue;
      }

      process.stderr.write(
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
    const childEnv = {
      ...process.env,
      HOOK_REPO_ROOT: repoRoot,
      REPO_HARNESS_ROUTE_EVENT: opts.event,
      REPO_HARNESS_ROUTE_ID: opts.routeId,
      ...(opts.event === 'SessionStart' && script === 'session-start-context.sh'
        ? { REPO_HARNESS_SESSION_START_SECURITY: '1' }
        : {}),
    };
    const child = spawnSync('bash', [scriptPath, ...(opts.args ?? [])], {
      cwd: repoRoot,
      stdio,
      env: childEnv,
    });

    if (child.error) {
      process.stderr.write(
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
      codexStopDecisionStdout &&
      child.status === 0 &&
      looksLikeHookDecisionJson(child.stdout)
    ) {
      process.stdout.write(child.stdout);
    }

    if (sessionStartCollectStdout && child.status === 0) {
      const context = extractSessionStartContext(child.stdout);
      if (context) sessionStartContexts.push(context);
    }

    if (codexStopDecisionStdout && child.status !== 0 && child.stderr) {
      process.stderr.write(child.stderr);
    }

    if (
      (codexQuietStdout || codexStopDecisionStdout) &&
      child.status !== 0 &&
      child.stdout
    ) {
      process.stderr.write(child.stdout);
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
    sessionStartContexts.push(
      `[repo-harness] hooks drift (source=${resolved.source}): missing ${skippedScripts.join(', ')}; ${syncHint}.`,
    );
  }

  if (sessionStartCollectStdout && sessionStartContexts.length > 0) {
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: sessionStartContexts.join('\n'),
      },
    })}\n`);
  }

  return { exitCode: 0, reason: 'ok', repoRoot, scriptsRun, skippedScripts };
}
