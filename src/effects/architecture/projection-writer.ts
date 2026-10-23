import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { PROJECTION_WRITER_DEFAULT_BRANCH } from 'archctx-contracts';
import { ARCHCTX_REQUIRED_VERSION } from '../../core/architecture/projection';
import { findConsumerRoot, resolveCompatibleNodeRuntime, resolvePackageLocalArchctx } from './archctx-provider';

/**
 * Repository policy only. archctx owns locking, rendering, Git writes and PR publication.
 * The writer accepts proven observed major changes; archctx still declines unprovable ones.
 * The owner's GO to merge the rolling PR is the acceptance.
 */
export function architectureWriterArgs(mode: string, stateDir: string | undefined): string[] {
  if (!stateDir || !isAbsolute(stateDir)) throw new Error('ARCHCONTEXT_STATE_DIR must be an explicit absolute path for the shared writer state');
  if (!['status', 'once', 'follow'].includes(mode)) throw new Error('Usage: repo-harness architecture-projection publish <status|once|follow>');
  const target = ['--remote', 'origin', '--base', 'main'];
  return mode === 'status'
    ? ['projection', 'publish-status', ...target, '--json']
    : ['projection', 'publish', ...target, '--branch', PROJECTION_WRITER_DEFAULT_BRANCH, '--publisher', 'gh',
      '--accept-observed-major-change', ...(mode === 'follow' ? ['--follow', '--interval', '300'] : []), '--json'];
}

/**
 * Runs the pinned archctx from the repo-harness package against `repoRoot`.
 * archctx derives the writer repository from its cwd, so the cwd is the target repo, not the package.
 */
export async function runArchitectureWriter(repoRoot: string, mode: string, env: NodeJS.ProcessEnv): Promise<number> {
  const args = architectureWriterArgs(mode, env.ARCHCONTEXT_STATE_DIR);
  const provider = resolvePackageLocalArchctx(findConsumerRoot(), ARCHCTX_REQUIRED_VERSION);
  const node = resolveCompatibleNodeRuntime(env);
  const child = spawn(node, [provider.binaryPath, ...args], { cwd: repoRoot, env, stdio: 'inherit' });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  try {
    return await new Promise<number>((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolveExit(code ?? 1));
    });
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
  }
}
