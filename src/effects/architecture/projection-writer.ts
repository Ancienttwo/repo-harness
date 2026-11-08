import { spawn } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROJECTION_WRITER_DEFAULT_BRANCH } from 'archctx-contracts';
import { resolveCompatibleNodeRuntime, resolvePackageLocalArchctx } from './archctx-provider';
import { gitExecFileSync } from '../git/runner';
import { runProcess } from '../process-runner';
import { isRepoHarnessSourceCheckout } from '../source-checkout';

const FOLLOW_INTERVAL_MS = 300_000;
/** EX_TEMPFAIL: the supervisor restarts the writer on a non-zero exit, now with the new code. */
export const WRITER_RESTART_EXIT_CODE = 75;
const UPDATE_SCHEMA_VERSION = 'repo-harness.projection-writer-update/v1';

/**
 * Repository policy only. archctx owns locking, rendering, Git writes and PR publication.
 * The writer accepts proven observed major changes; archctx still declines unprovable ones.
 * The owner's GO to merge the rolling PR is the acceptance.
 * `follow` runs one `once` publication per interval; the repo-harness loop updates the writer code first.
 */
export function architectureWriterArgs(mode: string, stateDir: string | undefined): string[] {
  if (!stateDir || !isAbsolute(stateDir)) throw new Error('ARCHCONTEXT_STATE_DIR must be an explicit absolute path for the shared writer state');
  if (!['status', 'once', 'follow'].includes(mode)) throw new Error('Usage: repo-harness architecture-projection publish <status|once|follow>');
  const target = ['--remote', 'origin', '--base', 'main'];
  return mode === 'status'
    ? ['projection', 'publish-status', ...target, '--json']
    : ['projection', 'publish', ...target, '--branch', PROJECTION_WRITER_DEFAULT_BRANCH, '--publisher', 'gh', '--accept-observed-major-change', '--json'];
}

export type WriterCheckoutSync = { state: 'current' } | { state: 'updated'; from: string; to: string };

/** Lives in `node_modules`, so a removed dependency tree also removes the install proof. */
const INSTALL_MARKER = 'node_modules/.repo-harness-writer-install';

export class WriterUpdateFailure extends Error {
  constructor(message: string, readonly head: string | null, readonly target: string | null) { super(message); }
}

/**
 * The writer code is the checkout at `origin/main` with its dependencies installed for that commit.
 * archctx uses the checkout only as the Git repository: it renders in its own detached worktree
 * under ARCHCONTEXT_STATE_DIR, so moving this checkout's HEAD does not move the projection target.
 * `runningHead` is the commit the running process loaded. Any fast-forward or install returns
 * `updated`, because the process must restart to load the new code and dependencies.
 */
export function syncWriterCheckout(checkoutRoot: string, runningHead: string, bun: string): WriterCheckoutSync {
  const git = (args: string[]) => gitExecFileSync(['-C', checkoutRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const markerPath = join(checkoutRoot, INSTALL_MARKER);
  let head: string | null = null;
  let target: string | null = null;
  try {
    head = git(['rev-parse', 'HEAD']);
    git(['fetch', '--quiet', 'origin', 'main']);
    target = git(['rev-parse', '--verify', 'refs/remotes/origin/main^{commit}']);
    const installed = existsSync(markerPath) ? readFileSync(markerPath, 'utf8').trim() : null;
    if (head === target && installed === target && runningHead === target) return { state: 'current' };
    if (head !== target) {
      if (git(['status', '--porcelain']) !== '') throw new Error(`the writer checkout has local changes; it refuses to fast-forward ${checkoutRoot}`);
      git(['merge', '--ff-only', '--quiet', target]);
      head = target;
    }
    if (installed !== target) {
      rmSync(markerPath, { force: true });
      const install = runProcess(bun, ['install', '--frozen-lockfile'], { cwd: checkoutRoot, timeoutMs: FOLLOW_INTERVAL_MS });
      if (install.status !== 0) throw new Error(`bun install --frozen-lockfile failed: ${(install.stderr || install.error || '').trim()}`);
      writeFileSync(markerPath, `${target}\n`);
    }
    return { state: 'updated', from: runningHead, to: target };
  } catch (error) {
    throw new WriterUpdateFailure((error instanceof Error ? error.message : String(error)).trim(), head, target);
  }
}

export interface FollowWriterPorts {
  /** Runs one publication and returns its exit code. */
  readonly publishOnce: () => Promise<number>;
  /** Waits one interval; returns true when the process must stop. */
  readonly wait: () => Promise<boolean>;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

/**
 * Each iteration first updates the writer code. An update failure writes a JSON line to stdout
 * every iteration and the same line to stderr once per distinct error, and skips publication:
 * the running code may be older than the archctx that main pins.
 */
export async function followArchitectureWriter(checkoutRoot: string, runningHead: string, bun: string, ports: FollowWriterPorts): Promise<number> {
  let noticed: string | null = null;
  for (;;) {
    let sync: WriterCheckoutSync | null = null;
    try {
      sync = syncWriterCheckout(checkoutRoot, runningHead, bun);
      noticed = null;
    } catch (error) {
      if (!(error instanceof WriterUpdateFailure)) throw error;
      const line = JSON.stringify({ schemaVersion: UPDATE_SCHEMA_VERSION, result: 'update-failed', code: 'writer_update_failed', checkout: checkoutRoot, runningHead, head: error.head, target: error.target, error: error.message, at: new Date().toISOString() });
      ports.stdout(line);
      if (noticed !== error.message) ports.stderr(line);
      noticed = error.message;
    }
    if (sync?.state === 'updated') {
      ports.stdout(JSON.stringify({ schemaVersion: UPDATE_SCHEMA_VERSION, result: 'updated', from: sync.from, to: sync.to, at: new Date().toISOString() }));
      return WRITER_RESTART_EXIT_CODE;
    }
    if (sync?.state === 'current') await ports.publishOnce();
    if (await ports.wait()) return 0;
  }
}

/**
 * Runs the pinned archctx from the repo-harness package against `repoRoot`.
 * archctx derives the writer repository from its cwd, so the cwd is the target repo, not the package.
 */
export async function runArchitectureWriter(repoRoot: string, mode: string, env: NodeJS.ProcessEnv): Promise<number> {
  const args = architectureWriterArgs(mode, env.ARCHCONTEXT_STATE_DIR);
  if (mode !== 'follow') return runArchctx(repoRoot, args, env);
  const checkoutRoot = realpathSync(fileURLToPath(new URL('../../..', import.meta.url)));
  const git = (args: string[]) => gitExecFileSync(['-C', checkoutRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const topLevel = (() => { try { return realpathSync(git(['rev-parse', '--show-toplevel'])); } catch { return null; } })();
  if (!process.versions.bun || topLevel !== checkoutRoot || !isRepoHarnessSourceCheckout(checkoutRoot)) {
    throw new Error(`publish follow runs only under bun from a repo-harness Git source checkout; ${checkoutRoot} is not one`);
  }
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    return await followArchitectureWriter(checkoutRoot, git(['rev-parse', 'HEAD']), process.execPath, {
      publishOnce: () => runArchctx(repoRoot, args, env),
      wait: () => (stopped ? Promise.resolve(true) : waitOrStop()),
      stdout: (line) => process.stdout.write(`${line}\n`),
      stderr: (line) => process.stderr.write(`${line}\n`),
    });
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

async function runArchctx(repoRoot: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  const provider = resolvePackageLocalArchctx();
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

function waitOrStop(): Promise<boolean> {
  return new Promise((resolveWait) => {
    const finish = (stop: boolean) => {
      clearTimeout(timer);
      process.off('SIGINT', stopNow);
      process.off('SIGTERM', stopNow);
      resolveWait(stop);
    };
    const stopNow = () => finish(true);
    const timer = setTimeout(() => finish(false), FOLLOW_INTERVAL_MS);
    process.on('SIGINT', stopNow);
    process.on('SIGTERM', stopNow);
  });
}
