// Agent runtime installation probe (G9). It runs in the setup collector's
// probe child, never in the `operator serve` event loop: OAR's installation
// probes start each runtime's executable, and OAR's root entry is large.
//
// The registry is OAR's default registry plus Mister Morph, a community
// runtime that needs no extra package. Cursor and Pi Durable need optional
// packages that repo-harness does not install, so they are not constructed;
// the probe reports which package is missing.

import { cursorInstallation, defaultRuntimes, type InstallationProbe, type InstallationSnapshot } from '@botiverse/oar';
import { createMorphRuntime } from '@botiverse/oar/community';

import { publicAgentConfigText } from '../../core/operator/agent-config';
import type { AgentRuntimeGroup, AgentRuntimeInstallationV1, AgentRuntimeProbeEntryV1, AgentRuntimeProbeV1 } from '../../core/operator/agents-settings';

const PROBE_TIMEOUT_MS = 15_000;

export interface ProbedRuntime {
  readonly id: string;
  readonly group: AgentRuntimeGroup;
  readonly installation?: InstallationProbe;
}

/** A runtime OAR builds only from an optional package that the host installs. */
export interface HostDependencyRuntime {
  readonly id: string;
  readonly package: string;
  /** The probe to run once the package resolves; null when the runtime also needs host-owned storage. */
  readonly installation: InstallationProbe | null;
}

export const HOST_DEPENDENCY_RUNTIMES: readonly HostDependencyRuntime[] = Object.freeze([
  { id: 'cursor', package: '@cursor/sdk', installation: cursorInstallation },
  { id: 'pi-durable', package: '@earendil-works/pi-durable', installation: null },
]);

export function registryRuntimes(): readonly ProbedRuntime[] {
  return [
    ...defaultRuntimes.list().map(runtime => ({ id: runtime.id, group: 'default' as const, installation: runtime.installation })),
    ...[createMorphRuntime()].map(runtime => ({ id: runtime.id, group: 'community' as const, installation: runtime.installation })),
  ];
}

function packageResolves(name: string): boolean {
  try {
    import.meta.resolve(name);
    return true;
  } catch {
    return false;
  }
}

/** The command path and shadowed copies stay private; free text passes the public filter. */
export function publicInstallation(snapshot: InstallationSnapshot): AgentRuntimeInstallationV1 {
  if (snapshot.kind === 'available') {
    const version = snapshot.via === 'executable' && snapshot.version !== undefined ? publicAgentConfigText(snapshot.version) : null;
    return { kind: 'available', via: snapshot.via, version };
  }
  if (snapshot.kind === 'unsupported') return { kind: 'unsupported', reason: publicAgentConfigText(snapshot.reason) };
  return { kind: 'not_found' };
}

async function runProbe(probe: InstallationProbe, timeoutMs: number): Promise<AgentRuntimeInstallationV1> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<AgentRuntimeInstallationV1>((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout({ kind: 'probe_failed' }), timeoutMs);
  });
  try {
    return await Promise.race([probe().then(publicInstallation, (): AgentRuntimeInstallationV1 => ({ kind: 'probe_failed' })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export interface AgentRuntimeProbeOptions {
  readonly runtimes?: readonly ProbedRuntime[];
  readonly host_dependencies?: readonly HostDependencyRuntime[];
  readonly package_resolves?: (name: string) => boolean;
  readonly timeout_ms?: number;
  readonly now?: () => number;
}

export async function probeAgentRuntimes(options: AgentRuntimeProbeOptions = {}): Promise<AgentRuntimeProbeV1> {
  const timeoutMs = options.timeout_ms ?? PROBE_TIMEOUT_MS;
  const resolves = options.package_resolves ?? packageResolves;
  const registered = await Promise.all((options.runtimes ?? registryRuntimes()).map(async (runtime): Promise<AgentRuntimeProbeEntryV1> => ({
    id: runtime.id,
    group: runtime.group,
    installation: runtime.installation === undefined ? { kind: 'probe_failed' } : await runProbe(runtime.installation, timeoutMs),
  })));
  const dependent = await Promise.all((options.host_dependencies ?? HOST_DEPENDENCY_RUNTIMES).map(async (runtime): Promise<AgentRuntimeProbeEntryV1> => ({
    id: runtime.id,
    group: 'host_dependency',
    installation: !resolves(runtime.package) ? { kind: 'dependency_missing', package: runtime.package }
      : runtime.installation === null ? { kind: 'host_setup_required' }
        : await runProbe(runtime.installation, timeoutMs),
  })));
  return {
    protocol: 1,
    kind: 'agent_runtime_probe',
    collected_at: new Date((options.now ?? Date.now)()).toISOString(),
    entries: [...registered, ...dependent],
  };
}
