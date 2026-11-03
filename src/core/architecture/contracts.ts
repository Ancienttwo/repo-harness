import {
  capabilityIdentityFromNodeId,
  type ArchcontextCapabilityOwners,
  type ArchcontextCapabilityResolution,
  type ArchcontextPathOwner,
  type Capability,
  type CapabilityIdentity,
  type CapabilityOwnership,
  type CapabilityPathResolution,
  type CapabilityRegistry,
  type CapabilityRegistryDiagnostic,
} from '../capabilities/registry';

/**
 * The core contract of the Architecture plugin. Core reaches the archctx
 * ownership, notice, runtime and CodeGraph code only through these ports. A
 * process entry registers the providers once; a port without a provider is a
 * typed unavailable result, never a fallback.
 */
export const ARCHITECTURE_CONTRACT_VERSION = 1;
export type ArchitectureContractVersion = typeof ARCHITECTURE_CONTRACT_VERSION;

export type ProjectionProvider = 'disabled' | 'archctx';
export type ProjectionApplyMode = 'disabled' | 'manual';

export interface ArchitectureProjectionPolicy {
  provider: ProjectionProvider;
  applyMode: ProjectionApplyMode;
  requiredVersion: string;
  timeoutMs: number;
}

export interface ArchctxProcessResult { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: string; timedOut?: boolean }
export type RunArchctxProcess = (binary: string, args: readonly string[], options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }) => ArchctxProcessResult;

export interface ArchctxProviderOptions {
  consumerRoot?: string;
  policy?: ArchitectureProjectionPolicy;
  env?: NodeJS.ProcessEnv;
  run?: RunArchctxProcess;
  trustedNodeCandidateSource?: () => readonly string[];
  deadlineMs?: number;
  nowMs?: () => number;
}

export interface ArchcontextOwnerLookup<C> {
  get(nodeId: string): C | undefined;
}

export const ARCHCONTEXT_IDENTITY_OWNERS: ArchcontextOwnerLookup<CapabilityIdentity> = {
  get: (nodeId) => capabilityIdentityFromNodeId(nodeId) ?? undefined,
};

export type ArchctxResolveResult = Omit<ArchcontextPathOwner, 'path'>;

/** Answers keyed by the exact query line; the owner of the cache binds them to one model. */
export interface ArchcontextResolveCache {
  lookup(queries: readonly string[]): ReadonlyMap<string, ArchctxResolveResult>;
  store(answers: ReadonlyMap<string, ArchctxResolveResult>): void;
}

/** The archcontext capability authority with the summary of each capability node. */
export interface ArchcontextCapabilityContext {
  readonly registry: CapabilityRegistry;
  readonly owners: ArchcontextCapabilityOwners;
  readonly summaries: ReadonlyMap<string, string>;
}

/** Path ownership under `capability_source: archcontext`. */
export interface ArchitectureOwnershipPort {
  readonly contractVersion: ArchitectureContractVersion;
  /** The complete capability authority from one worktree export; a rejected model is an `invalid` result. */
  readAuthority(repoRoot: string, options?: ArchctxProviderOptions): ArchcontextCapabilityResolution;
  /** The authority and the node summaries; a failure throws `CapabilitySourceError`. */
  readCapabilityContext(repoRoot: string): ArchcontextCapabilityContext;
  /** One `archctx resolve` batch; a process, version or runtime failure throws. */
  resolvePaths<C extends { readonly id: string } = Capability>(
    repoRoot: string,
    owners: ArchcontextOwnerLookup<C>,
    paths: readonly string[],
    options?: ArchctxProviderOptions,
    cache?: ArchcontextResolveCache,
  ): CapabilityPathResolution<C>;
  /** The exact query lines that `resolvePaths` sends; callers key caches on them. */
  resolveQueries(repoRoot: string, paths: readonly string[]): string[];
  /** The persistent answer cache of one worktree. */
  resolveCache(repoRoot: string): ArchcontextResolveCache;
  /** The diagnostic for an error that `resolvePaths` threw. */
  resolveFailure(error: unknown): CapabilityRegistryDiagnostic;
  formatError(error: unknown): string;
}

export type ArchitecturePathOwnersRead =
  | { readonly status: 'resolved'; readonly resolution: CapabilityPathResolution<CapabilityIdentity> }
  | { readonly status: 'failed'; readonly code: string };

/** Path owners for display, with no policy branch. */
export interface ArchitectureDisplayPort {
  readonly contractVersion: ArchitectureContractVersion;
  pathOwners(repoRoot: string, paths: readonly string[], options?: ArchctxProviderOptions): ArchitecturePathOwnersRead;
}

export interface AgentNotice {
  readonly content?: string;
  readonly systemMessage?: string;
  readonly diagnostics?: string;
}

export type AgentNoticePoint = 'session-start' | 'turn';

/** The `[ArchitectureDebt]` and `[Archimap]` notice at SessionStart, `inbox` and Stop. */
export interface ArchitectureNoticePort {
  readonly contractVersion: ArchitectureContractVersion;
  collect(
    repoRoot: string,
    ownership: (options: ArchctxProviderOptions) => CapabilityOwnership | null,
    options?: ArchctxProviderOptions,
    point?: AgentNoticePoint,
  ): AgentNotice;
}

export interface ResolvedArchctxPackage {
  binaryPath: string;
  nodeRange: string;
  packageRoot: string;
  version: string;
}

export interface ArchitectureDaemonStopFailure {
  /** Null when the daemon listing failed before a state directory was known. */
  stateDir: string | null;
  code: string;
  action: string;
  reasonCode?: string;
  retryable?: boolean;
  message: string;
}

export interface ArchitectureDaemonStopReportV1 {
  schemaVersion: 'repo-harness.architecture-daemon-stop/v1';
  worktree: string;
  provider: ArchitectureProjectionPolicy['provider'];
  stopped: string[];
  failures: ArchitectureDaemonStopFailure[];
}

/** The managed archctx runtime for the setup check and the worktree closeout. */
export interface ArchitectureRuntimePort {
  readonly contractVersion: ArchitectureContractVersion;
  readonly requiredArchctxVersion: string;
  resolvePackageLocalArchctx(consumerRoot: string): ResolvedArchctxPackage;
  stopWorkspaceDaemons(repoRoot: string, canonicalWorktree: string): ArchitectureDaemonStopReportV1;
}

export interface ArchitectureDoctorCheck {
  readonly id: string;
  readonly describe: string;
  readonly status: 'ok' | 'warn' | 'fail' | 'na';
  readonly detail: string;
}

/** The `doctor` CodeGraph rows for the selected plugin ids, or the selection read error. */
export interface CodegraphDoctorPort {
  readonly contractVersion: ArchitectureContractVersion;
  checks(cwd: string, plugins: readonly string[] | Error): readonly ArchitectureDoctorCheck[];
}

export interface ArchitecturePorts {
  readonly ownership: ArchitectureOwnershipPort;
  readonly display: ArchitectureDisplayPort;
  readonly notice: ArchitectureNoticePort;
  readonly runtime: ArchitectureRuntimePort;
  readonly codegraphDoctor: CodegraphDoctorPort;
}

export type ArchitecturePortName = keyof ArchitecturePorts;

export interface ArchitectureUnavailable {
  readonly status: 'unavailable';
  readonly code: 'ARCHITECTURE_PROVIDER_UNAVAILABLE';
  readonly port: ArchitecturePortName;
  readonly message: string;
}

const registered: { -readonly [K in ArchitecturePortName]?: ArchitecturePorts[K] } = {};

/**
 * A process entry calls this once with the providers it runs. A provider of
 * another contract version is refused before any port is registered.
 */
export function registerArchitecturePorts(ports: Partial<ArchitecturePorts>): void {
  for (const [name, port] of Object.entries(ports)) {
    if (port.contractVersion !== ARCHITECTURE_CONTRACT_VERSION) {
      throw new Error(`architecture ${name} provider has contract version ${String(port.contractVersion)}; core requires ${ARCHITECTURE_CONTRACT_VERSION}`);
    }
  }
  Object.assign(registered, ports);
}

export function architecturePort<K extends ArchitecturePortName>(name: K): ArchitecturePorts[K] | ArchitectureUnavailable {
  const port = registered[name];
  if (port) return port as ArchitecturePorts[K];
  return { status: 'unavailable', code: 'ARCHITECTURE_PROVIDER_UNAVAILABLE', port: name, message: `no architecture ${name} provider is registered in this process` };
}

export function isArchitectureUnavailable(value: object): value is ArchitectureUnavailable {
  return 'status' in value && value.status === 'unavailable' && 'code' in value && value.code === 'ARCHITECTURE_PROVIDER_UNAVAILABLE';
}
