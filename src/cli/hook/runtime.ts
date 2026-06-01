import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawnSync, type StdioOptions } from 'child_process';
import { getRoute, type HookEvent, type RouteId } from './route-registry';

const OPT_IN_MARKER = '.ai/harness/workflow-contract.json';

export interface RunHookOptions {
  event: HookEvent;
  routeId: RouteId;
  args?: readonly string[];
  cwd?: string;
  /** Pass-through stdio for the spawned hook script. Defaults to inherit. */
  stdio?: 'inherit' | 'pipe' | 'ignore';
  /** Optional override for the hooks dir (test only); defaults to `<repo>/.ai/hooks`. */
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

export function runHook(opts: RunHookOptions): RunHookResult {
  const cwd = opts.cwd ?? process.cwd();
  const commandName = opts.commandName ?? 'repo-harness hook';
  const scriptsRun: string[] = [];

  const repoRoot = resolveRepoRoot(cwd);
  if (!repoRoot) {
    return { exitCode: 0, reason: 'not-in-git-repo', scriptsRun };
  }
  if (!isOptIn(repoRoot)) {
    return { exitCode: 0, reason: 'non-opt-in', repoRoot, scriptsRun };
  }

  const route = getRoute(opts.event, opts.routeId);
  if (!route) {
    process.stderr.write(
      `${commandName}: unknown route ${opts.event}.${opts.routeId}\n`,
    );
    return { exitCode: 2, reason: 'unknown-route', repoRoot, scriptsRun };
  }

  const hooksDir = opts.hooksDir ?? path.join(repoRoot, '.ai/hooks');
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
      process.stderr.write(
        `${commandName}: script not found at ${scriptPath} (route ${opts.event}.${opts.routeId})\n`,
      );
      return {
        exitCode: 3,
        reason: 'missing-script',
        repoRoot,
        scriptsRun,
        failedScript: script,
      };
    }

    scriptsRun.push(script);
    const child = spawnSync('bash', [scriptPath, ...(opts.args ?? [])], {
      cwd: repoRoot,
      stdio,
      env: { ...process.env, HOOK_REPO_ROOT: repoRoot },
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
        failedScript: script,
      };
    }
  }

  if (sessionStartCollectStdout && sessionStartContexts.length > 0) {
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: sessionStartContexts.join('\n'),
      },
    })}\n`);
  }

  return { exitCode: 0, reason: 'ok', repoRoot, scriptsRun };
}
