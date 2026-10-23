#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { PROJECTION_WRITER_DEFAULT_BRANCH } from 'archctx-contracts';
import { ARCHCTX_REQUIRED_VERSION } from '../../core/architecture/projection';
import { resolveCompatibleNodeRuntime, resolvePackageLocalArchctx } from './archctx-provider';

/** Repository policy only. archctx owns locking, rendering, Git writes and PR publication. */
export function architectureWriterArgs(mode: string, stateDir: string | undefined): string[] {
  if (!stateDir || !isAbsolute(stateDir)) throw new Error('ARCHCONTEXT_STATE_DIR must be an explicit absolute path for the shared writer state');
  if (!['status', 'once', 'follow'].includes(mode)) throw new Error('Usage: bun run architecture:writer <status|once|follow>');
  const target = ['--remote', 'origin', '--base', 'main'];
  return mode === 'status'
    ? ['projection', 'publish-status', ...target, '--json']
    : ['projection', 'publish', ...target, '--branch', PROJECTION_WRITER_DEFAULT_BRANCH, '--publisher', 'gh',
      ...(mode === 'follow' ? ['--follow', '--interval', '300'] : []), '--json'];
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: bun run architecture:writer <status|once|follow>');
    const args = architectureWriterArgs(process.argv[2]!, process.env.ARCHCONTEXT_STATE_DIR);
    const root = resolve(import.meta.dir, '../../..');
    const provider = resolvePackageLocalArchctx(root, ARCHCTX_REQUIRED_VERSION);
    const node = resolveCompatibleNodeRuntime(process.env);
    const child = spawn(node, [provider.binaryPath, ...args], { cwd: root, env: process.env, stdio: 'inherit' });
    const interrupt = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    try {
      process.exitCode = await new Promise<number>((resolveExit, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolveExit(code ?? 1));
      });
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
