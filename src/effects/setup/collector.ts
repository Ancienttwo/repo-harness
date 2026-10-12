// Background setup collector (plan §8.1, invariant N1). It runs only in the
// `operator serve` process on a timer, never on a request path.
//
// The setup check builder (`buildSetupCheck`) is synchronous and spawns its own
// probes with spawnSync, so it would block the server event loop for its whole
// run (about 20 s). The collector therefore runs it in one child `bun`
// process. The argv is a code constant (the child entry file); cwd and env are
// the server's own. The child is the leader of a new process group, so the
// 90 s deadline and server shutdown kill the child and every probe it spawned.
// stderr is discarded and stdout must decode as a public setup snapshot, so no
// raw builder text reaches the cache.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { decodeSetupSnapshot, unavailableSetupSnapshot } from '../../core/setup/decode';
import type { SetupReason, SetupSnapshotV1 } from '../../core/setup/types';

export const SETUP_INTERVAL_MS = 10 * 60_000;
export const SETUP_TIMEOUT_MS = 90_000;
const SETUP_STDOUT_LIMIT = 4 * 1024 * 1024;

export const SETUP_CHILD_ARGV = Object.freeze([fileURLToPath(new URL('./setup-check-child.ts', import.meta.url))] as const);

export type SetupProcessFailure = 'timeout' | 'failed' | 'aborted';
export type SetupProcessResult = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly code: SetupProcessFailure };
export type SetupProcessRunner = (
  argv: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeout_ms: number; readonly signal: AbortSignal },
) => Promise<SetupProcessResult>;

/**
 * Spawn `bun <argv>` with no shell, no stdin and no stderr capture. On POSIX the
 * child leads its own process group and a deadline or abort kills the group.
 */
export const runSetupProcess: SetupProcessRunner = (argv, options) => new Promise((settle) => {
  if (options.signal.aborted) { settle({ ok: false, code: 'aborted' }); return; }
  const group = process.platform !== 'win32';
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(process.execPath, [...argv], {
      cwd: options.cwd, env: options.env, stdio: ['ignore', 'pipe', 'ignore'], detached: group, windowsHide: true,
    });
  } catch {
    settle({ ok: false, code: 'failed' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let settled = false;
  const kill = () => {
    try {
      if (group && child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch { /* already exited */ }
  };
  const finish = (result: SetupProcessResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    options.signal.removeEventListener('abort', onAbort);
    settle(result);
  };
  const onAbort = () => { kill(); finish({ ok: false, code: 'aborted' }); };
  const timer = setTimeout(() => { kill(); finish({ ok: false, code: 'timeout' }); }, options.timeout_ms);
  options.signal.addEventListener('abort', onAbort, { once: true });
  child.stdout!.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > SETUP_STDOUT_LIMIT) { kill(); finish({ ok: false, code: 'failed' }); return; }
    chunks.push(chunk);
  });
  child.once('error', () => finish({ ok: false, code: 'failed' }));
  child.once('close', (code) => finish(code === 0 ? { ok: true, stdout: Buffer.concat(chunks).toString('utf8') } : { ok: false, code: 'failed' }));
});

export interface SetupCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly interval_ms?: number;
  readonly timeout_ms?: number;
  readonly run_process?: SetupProcessRunner;
}

export interface SetupCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => SetupSnapshotV1;
  /** Resolves when the cycle in flight, if any, has settled. */
  readonly settled: () => Promise<void>;
  readonly close: () => Promise<void>;
}

/** Network update advisories stay off: the collector runs setup check without --check-updates. */
function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env, NO_COLOR: '1', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' };
  delete next.REPO_HARNESS_CHECK_UPDATES;
  return next;
}

/** A ready snapshot from the child, or the fixed reason it is not one. */
export async function collectSetupSnapshot(options: SetupCollectorOptions & { readonly signal: AbortSignal }):
Promise<{ readonly ok: true; readonly snapshot: SetupSnapshotV1 } | { readonly ok: false; readonly reason: SetupReason | null }> {
  const result = await (options.run_process ?? runSetupProcess)(SETUP_CHILD_ARGV, {
    cwd: options.cwd ?? process.cwd(),
    env: childEnv(options.env ?? process.env),
    timeout_ms: options.timeout_ms ?? SETUP_TIMEOUT_MS,
    signal: options.signal,
  });
  if (!result.ok) {
    if (result.code === 'aborted') return { ok: false, reason: null };
    return { ok: false, reason: result.code === 'timeout' ? 'setup_check_timeout' : 'setup_check_failed' };
  }
  try {
    const snapshot = decodeSetupSnapshot(JSON.parse(result.stdout));
    return snapshot.status === 'ready' ? { ok: true, snapshot } : { ok: false, reason: 'setup_check_invalid' };
  } catch {
    return { ok: false, reason: 'setup_check_invalid' };
  }
}

/**
 * Collect at startup, then every interval after the previous cycle settles.
 * Cycles never overlap. A failed cycle keeps the last good data as `stale`.
 */
export function startSetupCollector(options: SetupCollectorOptions = {}): SetupCollectorHandle {
  const controller = new AbortController();
  let cache: SetupSnapshotV1 = unavailableSetupSnapshot('collection_pending');
  let lastGood: SetupSnapshotV1 | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const cycle = (): Promise<void> => {
    const failed = (reason: SetupReason) => {
      cache = lastGood === null ? unavailableSetupSnapshot(reason) : { ...lastGood, status: 'stale', reason };
    };
    inflight = collectSetupSnapshot({ ...options, signal: controller.signal })
      .then((outcome) => {
        if (closed) return;
        if (outcome.ok) {
          lastGood = outcome.snapshot;
          cache = outcome.snapshot;
        } else if (outcome.reason !== null) {
          failed(outcome.reason);
        }
      }, () => { if (!closed) failed('setup_check_failed'); })
      .finally(() => {
        inflight = null;
        if (closed) return;
        timer = setTimeout(cycle, options.interval_ms ?? SETUP_INTERVAL_MS);
        timer.unref?.();
      });
    return inflight;
  };
  void cycle();
  return Object.freeze({
    read: () => cache,
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      controller.abort();
      await inflight;
    },
  });
}
