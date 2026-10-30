// Background setup collector (plan §8.1, invariant N1). It runs only in the
// `operator serve` process on a timer, never on a request path.
//
// The setup check builder (`buildSetupCheck`) is synchronous and spawns its own
// probes with spawnSync, so it would block the server event loop for its whole
// run (about 20 s). The collector therefore runs it in one child `bun`
// process. The argv is a code constant (the child entry file); cwd and env are
// the server's own. On POSIX the child is the leader of a new process group, so
// the 90 s deadline and server shutdown terminate the child and every probe it
// spawned. The group is registered, so a later server start reaps it when this
// server dies with SIGKILL.
// stderr is discarded and stdout must decode as a public setup snapshot, so no
// raw builder text reaches the cache.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { spawnRegisteredProcessGroup } from '../process-group-registry';
import { terminateProcessGroup } from '../process-group-termination';

import { decodeSetupSnapshot, unavailableSetupSnapshot } from '../../core/setup/decode';
import type { SetupReason, SetupSnapshotV2 } from '../../core/setup/types';
import { decodeAgentRuntimeProbe, type AgentRuntimeProbeV1, type AgentRuntimesCacheV1, type AgentRuntimesReason } from '../../core/operator/agents-settings';

export const SETUP_INTERVAL_MS = 10 * 60_000;
export const SETUP_TIMEOUT_MS = 90_000;
const SETUP_STDOUT_LIMIT = 4 * 1024 * 1024;
const SETUP_TERMINATION_GRACE_MS = 500;

export const SETUP_CHILD_ARGV = Object.freeze([fileURLToPath(new URL('../../cli/commands/setup-check-child.ts', import.meta.url))] as const);
/** The agent runtime probe child (G9). It runs in the same cycle, after setup check. */
export const AGENT_RUNTIME_PROBE_ARGV = Object.freeze([fileURLToPath(new URL('./agent-runtime-probe-child.ts', import.meta.url))] as const);
export const AGENT_RUNTIME_PROBE_TIMEOUT_MS = 60_000;

export type SetupProcessFailure = 'timeout' | 'failed' | 'aborted';
export type SetupProcessResult = { readonly ok: true; readonly stdout: string } | { readonly ok: false; readonly code: SetupProcessFailure };
export type SetupProcessRunner = (
  argv: readonly string[],
  options: {
    readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeout_ms: number; readonly signal: AbortSignal;
    /** The owner name in the process-group record; the setup collector by default. */
    readonly service?: string;
    /** Bounded private request bytes. They do not appear in the child argv. */
    readonly stdin?: string;
  },
) => Promise<SetupProcessResult>;

/**
 * Spawn `bun <argv>` with no shell or stderr capture and optional bounded stdin. On POSIX the
 * child leads its own registered process group; a deadline, abort or oversized
 * stdout terminates that group (Windows: the `taskkill /T` tree) before settling.
 */
export const runSetupProcess: SetupProcessRunner = (argv, options) => new Promise((settle) => {
  if (options.signal.aborted) { settle({ ok: false, code: 'aborted' }); return; }
  if (options.stdin !== undefined && Buffer.byteLength(options.stdin) > 64 * 1024) { settle({ ok: false, code: 'failed' }); return; }
  const group = process.platform !== 'win32';
  let child: ReturnType<typeof spawn>;
  try {
    child = spawnRegisteredProcessGroup(options.service ?? 'setup-collector', () => spawn(process.execPath, [...argv], {
      cwd: options.cwd, env: options.env, stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'], detached: group, windowsHide: true,
    }));
  } catch {
    settle({ ok: false, code: 'failed' });
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let settled = false;
  let failure: SetupProcessResult | null = null;
  const finish = (result: SetupProcessResult) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    options.signal.removeEventListener('abort', onAbort);
    settle(result);
  };
  const terminate = (code: SetupProcessFailure) => {
    if (settled || failure !== null) return;
    failure = { ok: false, code };
    const result = failure;
    clearTimeout(timer);
    child.stdout!.destroy();
    if (child.pid === undefined) { finish(result); return; }
    void terminateProcessGroup(child.pid, SETUP_TERMINATION_GRACE_MS)
      .catch(() => { /* already exited */ })
      .then(() => finish(result));
  };
  const onAbort = () => terminate('aborted');
  const timer = setTimeout(() => terminate('timeout'), options.timeout_ms);
  options.signal.addEventListener('abort', onAbort, { once: true });
  child.stdout!.on('data', (chunk: Buffer) => {
    if (failure !== null) return;
    size += chunk.length;
    if (size > SETUP_STDOUT_LIMIT) { terminate('failed'); return; }
    chunks.push(chunk);
  });
  child.once('error', () => finish(failure ?? { ok: false, code: 'failed' }));
  child.once('close', (code) => {
    if (failure !== null) return;
    finish(code === 0 ? { ok: true, stdout: Buffer.concat(chunks).toString('utf8') } : { ok: false, code: 'failed' });
  });
  if (child.stdin) {
    child.stdin.once('error', () => terminate('failed'));
    child.stdin.end(options.stdin);
  }
});

export interface SetupCollectorOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly interval_ms?: number;
  readonly timeout_ms?: number;
  readonly run_process?: SetupProcessRunner;
  /** Also probe agent runtime installations in each cycle (operator serve). */
  readonly agent_runtimes?: { readonly run_process?: SetupProcessRunner; readonly timeout_ms?: number };
}

export interface SetupCollectorHandle {
  /** Cache read only; never starts work. */
  readonly read: () => SetupSnapshotV2;
  /** Agent runtime probe cache; `collection_pending` until the first probe settles, or always when the probe is off. */
  readonly read_agent_runtimes: () => AgentRuntimesCacheV1;
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
Promise<{ readonly ok: true; readonly snapshot: SetupSnapshotV2 } | { readonly ok: false; readonly reason: SetupReason | null }> {
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

/** A probe snapshot from the probe child, or the fixed reason it is not one. */
export async function collectAgentRuntimeProbe(options: {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly run_process?: SetupProcessRunner;
  readonly timeout_ms?: number;
  readonly signal: AbortSignal;
}): Promise<{ readonly ok: true; readonly probe: AgentRuntimeProbeV1 } | { readonly ok: false; readonly reason: AgentRuntimesReason | null }> {
  const result = await (options.run_process ?? runSetupProcess)(AGENT_RUNTIME_PROBE_ARGV, {
    cwd: options.cwd ?? process.cwd(),
    env: childEnv(options.env ?? process.env),
    timeout_ms: options.timeout_ms ?? AGENT_RUNTIME_PROBE_TIMEOUT_MS,
    signal: options.signal,
    service: 'agent-runtime-probe',
  });
  if (!result.ok) {
    if (result.code === 'aborted') return { ok: false, reason: null };
    return { ok: false, reason: result.code === 'timeout' ? 'probe_timeout' : 'probe_failed' };
  }
  try {
    return { ok: true, probe: decodeAgentRuntimeProbe(JSON.parse(result.stdout)) };
  } catch {
    return { ok: false, reason: 'probe_invalid' };
  }
}

/**
 * Collect at startup, then every interval after the previous cycle settles.
 * Cycles never overlap. A failed cycle keeps the last good data as `stale`.
 */
export function startSetupCollector(options: SetupCollectorOptions = {}): SetupCollectorHandle {
  const controller = new AbortController();
  let cache: SetupSnapshotV2 = unavailableSetupSnapshot('collection_pending');
  let lastGood: SetupSnapshotV2 | null = null;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  let runtimes: AgentRuntimesCacheV1 = { status: 'unavailable', reason: 'collection_pending' };
  const probe = async (): Promise<void> => {
    if (options.agent_runtimes === undefined || closed) return;
    const outcome = await collectAgentRuntimeProbe({
      env: options.env, cwd: options.cwd, run_process: options.agent_runtimes.run_process,
      timeout_ms: options.agent_runtimes.timeout_ms, signal: controller.signal,
    });
    if (closed) return;
    if (outcome.ok) runtimes = { status: 'ready', probe: outcome.probe };
    else if (outcome.reason !== null) {
      runtimes = runtimes.status === 'unavailable'
        ? { status: 'unavailable', reason: outcome.reason }
        : { status: 'stale', reason: outcome.reason, probe: runtimes.probe };
    }
  };
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
      .then(probe)
      .catch(() => { /* A failed probe keeps the last probe cache. */ })
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
    read_agent_runtimes: () => runtimes,
    settled: () => inflight ?? Promise.resolve(),
    close: async () => {
      closed = true;
      clearTimeout(timer);
      controller.abort();
      await inflight;
    },
  });
}
