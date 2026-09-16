import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, closeSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drainArchitectureProjectionJobs } from './projection-orchestrator';

export const ARCHITECTURE_PROJECTION_CONTINUATION_FLAG = '--architecture-projection-continuation';

/**
 * One wake-up of the existing durable queue, not another scheduler. Call only
 * after Stop has finished its worktree writes so the provider captures that
 * final snapshot. The existing claim lock serializes concurrent consumers.
 */
export function startArchitectureProjectionContinuation(
  repoRoot: string,
  env: NodeJS.ProcessEnv,
): { pid: number; logPath: string } {
  const root = realpathSync(repoRoot);
  const logPath = `.ai/harness/architecture-projection/continuations/${randomUUID()}.log`;
  mkdirSync(join(root, '.ai/harness/architecture-projection/continuations'), { recursive: true, mode: 0o700 });
  const absoluteLog = join(root, logPath);
  const fd = openSync(absoluteLog, 'wx', 0o600);
  try {
    // In a bundle import.meta.url points to hook-entry.js, whose flag dispatch
    // calls the same consumer. Source execution re-enters this module below.
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ARCHITECTURE_PROJECTION_CONTINUATION_FLAG, root], {
      cwd: root, env, detached: true, stdio: ['ignore', fd, fd],
    });
    child.on('error', (error) => { appendFileSync(absoluteLog, `continuation launch failed: ${error.message}\n`); });
    if (child.pid === undefined) throw new Error(`architecture projection continuation did not start; see ${logPath}`);
    child.unref();
    return { pid: child.pid, logPath };
  } finally {
    closeSync(fd);
  }
}

/** No discovery, publication or new events: consume only the already queued work. */
export function runArchitectureProjectionContinuationCli(argv: readonly string[], env = process.env): number {
  try {
    if (argv.length !== 1 || !argv[0]) throw new Error('architecture projection continuation requires one repository root');
    const result = drainArchitectureProjectionJobs(realpathSync(argv[0]), { env });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result.status === 'retry-pending' || result.status === 'reconcile-pending' || result.status === 'dead-letter' ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  const [flag, ...args] = process.argv.slice(2);
  process.exit(flag === ARCHITECTURE_PROJECTION_CONTINUATION_FLAG ? runArchitectureProjectionContinuationCli(args) : 2);
}
