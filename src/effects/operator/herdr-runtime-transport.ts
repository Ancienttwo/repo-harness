// The operator's herdr-core reads: the hc pin, the core check and the runtime
// transport. Every read goes through the typed helpers of `herdr-core.ts`, on
// the core that the server's environment selects (`HC_SESSION` / `HC_SOCKET`).
// Terminal text, titles and working directories never leave this file.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HC_VERSION_TEXT, HcPinUnavailableError, HcVersionMismatchError, compareHcVersions, hcVersionCheck, type HcVersionCheck } from '../../core/operator/herdr-pin';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { RH_LABEL, RH_ROLE, hcEvents, hcServerStatusAsync, type HcLabels, type HcTerminal } from '../terminal/herdr-core';
import type { StructuredRuntimeTransport } from './runtime-source';
import { RUNTIME_SOURCE_PROTOCOL } from './runtime-source';

/** The operator observes task-session terminals only; it never lists unlabeled terminals. */
export const TASK_SESSION_LABELS: HcLabels = { [RH_LABEL.role]: RH_ROLE.taskSession };
const POLICY_SEGMENTS = ['.ai', 'harness', 'policy.json'] as const;
const RECONNECT_MS = 1000;

/**
 * The highest `external_tooling.herdr_core.min_version` over the registered
 * repository policies: one hc core serves all of them. Null when none is readable.
 */
export function readHcPin(env: NodeJS.ProcessEnv): string | null {
  let pin: string | null = null, repos;
  // An unreadable registry names no policy, so no pin is known.
  try { repos = readRepoHarnessRegistryStrictSnapshot({ env }).repos; } catch { return null; }
  for (const repo of repos) {
    let value: unknown;
    try {
      const policy = JSON.parse(readFileSync(join(repo.path, ...POLICY_SEGMENTS), 'utf8')) as { external_tooling?: { herdr_core?: { min_version?: unknown } } };
      value = policy.external_tooling?.herdr_core?.min_version;
    } catch { continue; /* an unreadable policy pins nothing */ }
    if (typeof value === 'string' && HC_VERSION_TEXT.test(value) && (pin === null || compareHcVersions(value, pin) > 0)) pin = value;
  }
  return pin;
}

export interface HcCoreObservation { readonly core_id: string; readonly check: HcVersionCheck }

/** The answering core and its version against the pin. Throws `HcPinUnavailableError` or a `HerdrCoreError`. */
export async function observeHcCore(env: NodeJS.ProcessEnv, timeoutMs?: number): Promise<HcCoreObservation> {
  const pin = readHcPin(env);
  if (pin === null) throw new HcPinUnavailableError();
  const status = await hcServerStatusAsync({ env, timeoutMs });
  return { core_id: status.core.id, check: hcVersionCheck(status.version, pin) };
}

export interface HcSnapshot { readonly seq: number; readonly terminals: readonly HcTerminal[] }

/** One snapshot: `hc events` sends the matching terminals first, then the stream is closed. */
export function readHcSnapshot(labels: HcLabels, env: NodeJS.ProcessEnv, signal?: AbortSignal): Promise<HcSnapshot> {
  return new Promise((resolve, reject) => {
    let snapshot: HcSnapshot | null = null;
    const stream = hcEvents(labels, item => {
      if (snapshot === null && item.type !== 'event') { snapshot = { seq: item.seq, terminals: item.terminals }; stream.close(); }
    }, { env });
    const abort = () => stream.close();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    stream.done.then(() => (snapshot ? resolve(snapshot) : reject(new Error(signal?.aborted ? 'hc_snapshot_aborted' : 'hc_snapshot_missing'))), reject)
      .finally(() => signal?.removeEventListener('abort', abort));
  });
}

/**
 * The runtime source on herdr-core. The subscription is one `hc events` stream of the task-session terminals;
 * a snapshot is a fresh `hc events` snapshot, with the snapshot `seq` as the revision of every terminal in it.
 * The core must answer at or above the pin before anything is read, and again after each reconnect.
 */
export function createHerdrCoreRuntimeTransport(source_host: string, env: NodeJS.ProcessEnv) {
  let active = false, ready = false, generation = 0, core = '';
  let stream: ReturnType<typeof hcEvents> | null = null, retry: ReturnType<typeof setTimeout> | null = null;
  let invalidate: (event: string, error?: unknown) => void = () => {};
  async function identify(): Promise<string> {
    const observed = await observeHcCore(env);
    if (observed.check.state !== 'aligned') throw new HcVersionMismatchError(observed.check);
    return observed.core_id;
  }
  function closeStream() { generation++; ready = false; stream?.close(); stream = null; }
  function close() { active = false; if (retry) clearTimeout(retry); retry = null; closeStream(); }
  function lost(current: number, error?: unknown) {
    if (!active || current !== generation) return;
    closeStream(); invalidate('disconnected', error);
    const reconnect = async () => {
      retry = null; if (!active) return;
      const attempt = generation;
      try {
        core = await identify(); if (!active || attempt !== generation) return;
        await connect(); if (active && attempt === generation) invalidate('reconnect');
      } catch (failure) {
        if (active && attempt === generation) { invalidate('disconnected', failure); retry = setTimeout(reconnect, RECONNECT_MS); }
      }
    };
    retry = setTimeout(reconnect, RECONNECT_MS);
  }
  /** Resolves on the stream's first snapshot, so the subscription exists before the first read. */
  function connect(): Promise<void> {
    const current = generation;
    return new Promise((resolve, reject) => {
      let started = false;
      const next = hcEvents(TASK_SESSION_LABELS, item => {
        if (!active || current !== generation) return;
        if (!started) { started = true; ready = true; resolve(); return; }
        invalidate(item.type === 'missed' ? 'events_lost' : 'terminal.changed');
      }, { env });
      stream = next;
      next.done.then(() => { if (!started) reject(new Error('hc_events_ended')); else lost(current); },
        error => { if (!started) reject(error); else lost(current, error); });
    });
  }
  const transport: StructuredRuntimeTransport = {
    async capabilities() {
      core = await identify();
      return { protocol: RUNTIME_SOURCE_PROTOCOL, source_host, hc_core: core, agent_status: true };
    },
    async subscribe(_events, callback, signal) {
      if (active) throw new Error('herdr_runtime_subscribed');
      active = true; invalidate = callback;
      const abort = () => close(); signal.addEventListener('abort', abort, { once: true });
      try { if (signal.aborted) throw new Error('herdr_runtime_aborted'); await connect(); }
      catch (error) { close(); throw error; }
      finally { signal.removeEventListener('abort', abort); }
      return close;
    },
    async snapshot(signal) {
      if (!active || !ready) throw new Error('herdr_runtime_disconnected');
      const current = generation;
      const { seq, terminals } = await readHcSnapshot(TASK_SESSION_LABELS, env, signal);
      if (current !== generation || !active || signal.aborted) throw new Error('herdr_runtime_disconnected');
      return { protocol: 'repo-harness.runtime-source.snapshot.v2', source_host, hc_core: core,
        terminals: terminals.map(terminal => ({ terminal_id: terminal.address, status: terminal.status?.state ?? null, revision: seq })) };
    },
  };
  return { transport, close };
}
