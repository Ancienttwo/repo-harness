import { loadArchitectureProjectionPolicy, readGlobalArchitectureConfiguration } from './projection-config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ARCHCONTEXT_NODE_RANGE, ERROR_CATALOG, PROJECTION_REQUEST_SCHEMA_VERSION, digestJson, type ArchContextError, type ArchctxCapabilitiesV1, type DocsAnchorsReportV1, type Json, type ProjectionApplyReadbackResultV1, type ProjectionMode, type ProjectionRequestV1, type ProjectionResultV2 } from 'archctx-contracts';
import { trustedNodeCandidates } from '../runtime/node-candidates';
import { runProcess } from '../process-runner';
import { normalizeCapabilityPath } from '../../core/capabilities/registry';
import { readText } from '../state/collect-state-inputs';
import { loadArchcontextAuthority } from '../state/resolve-effective-state';
import {
  ARCHCTX_REQUIRED_VERSION,
  assertArchctxVersion,
  assertProjectionApplyReadbackResult,
  assertProjectionResult,
  decodeDocsAnchorsReport,
  type ArchitectureProjectionPolicy,
  type ArchitectureProjectionReadinessV1,
} from '../../core/architecture/projection';

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

const PROJECTION_WORKTREE_IGNORE_ROOTS = new Set([
  '.git',
  '.codegraph',
  'node_modules',
  'coverage',
  'artifacts',
  '_ops',
  '_ref',
  '.DS_Store',
]);
const PROJECTION_WORKTREE_IGNORE_PATHS = new Set([
  '.ai/harness',
  '.archcontext/.local',
  '.claude/.session-id',
  '.claude/.trace.jsonl',
  'docs/architecture',
]);


export interface ResolvedArchctxPackage {
  binaryPath: string;
  nodeRange: string;
  packageRoot: string;
  version: string;
}

const ARCHCTX_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_RUNNER: RunArchctxProcess = (binary, args, options) => {
  const result = runProcess(binary, args, {
    cwd: options.cwd,
    env: options.env,
    inheritEnv: false,
    timeoutMs: options.timeoutMs,
    maxOutputBytes: ARCHCTX_MAX_OUTPUT_BYTES,
    redactions: [],
    processGroup: true,
  });
  const overflow = Buffer.byteLength(result.stdout, 'utf8') > ARCHCTX_MAX_OUTPUT_BYTES || Buffer.byteLength(result.stderr, 'utf8') > ARCHCTX_MAX_OUTPUT_BYTES;
  return { status: overflow ? 1 : result.status, signal: result.signal, timedOut: result.timedOut, stdout: result.stdout, stderr: result.stderr, ...((overflow ? 'archctx output exceeded maxBuffer' : result.error) ? { error: overflow ? 'archctx output exceeded maxBuffer' : result.error } : {}) };
};


/**
 * The model is ready when the hooks' capability loader accepts the nodes and
 * finds at least one active capability. An empty, sample-only or invalid nodes
 * directory is not ready, so apply stays off and status keeps the adoption step.
 */
function architectureModelReady(repoRoot: string): boolean {
  if (!existsSync(join(repoRoot, '.archcontext', 'manifest.yaml')) || !existsSync(join(repoRoot, '.archcontext', 'product.yaml'))) return false;
  const authority = loadArchcontextAuthority(repoRoot, (path) => readText(repoRoot, path));
  return authority.status === 'valid' && authority.registry.capabilities.length > 0;
}

function capabilityAuthorityReady(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.archcontext', 'model', 'nodes'));
}

export function resolvePackageLocalArchctx(consumerRoot: string, requiredVersion: string = ARCHCTX_REQUIRED_VERSION): ResolvedArchctxPackage {
  const packageRoot = findInstalledArchctxPackageRoot(consumerRoot, requiredVersion);
  const manifestPath = join(packageRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; version?: unknown; bin?: unknown; engines?: unknown };
  if (manifest.name !== 'archctx' || manifest.version !== requiredVersion) throw new ArchctxClientError({ code: 'RH_ARCHCTX_PACKAGE_MISMATCH', action: 'update-repo-harness', message: `package-local archctx mismatch: expected archctx@${requiredVersion}, got ${String(manifest.name)}@${String(manifest.version)} (resolved from consumer root ${resolve(consumerRoot)})` });
  const engines = isRecord(manifest.engines) ? manifest.engines : null;
  if (engines?.node !== ARCHCONTEXT_NODE_RANGE) throw new Error(`package-local archctx@${requiredVersion} Node runtime contract mismatch: expected ${ARCHCONTEXT_NODE_RANGE}, got ${String(engines?.node)}`);
  const bin = isRecord(manifest.bin) && typeof manifest.bin.archctx === 'string' ? manifest.bin.archctx : null;
  if (!bin) throw new Error(`package-local archctx@${requiredVersion} does not declare bin.archctx`);
  const binaryPath = resolve(packageRoot, bin);
  if (!existsSync(binaryPath)) throw new Error(`package-local archctx@${requiredVersion} binary is missing: ${binaryPath}`);
  const realBinary = realpathSync(binaryPath);
  const realPackage = realpathSync(packageRoot);
  const inside = (path: string, root: string) => path === root || path.startsWith(`${root}${sep}`);
  if (!inside(realBinary, realPackage)) throw new Error('package-local archctx binary escapes the archctx package root');
  return { binaryPath: realBinary, nodeRange: ARCHCONTEXT_NODE_RANGE, packageRoot: realPackage, version: requiredVersion };
}

/**
 * Resolution order: the explicit `REPO_HARNESS_NODE_BIN` authority, then the
 * inherited PATH, then the shared trusted-candidate scan. The third tier exists
 * because the bounded verifier's env scrub strips the `REPO_HARNESS_` prefix
 * whole, so a gate that reaches the architecture projection inside the sandbox
 * sees neither the explicit runtime nor an nvm-managed Node on its protected
 * PATH. Every tier applies the same `ARCHCONTEXT_NODE_RANGE` check and the
 * exhausted case still fails closed.
 */
export function resolveCompatibleNodeRuntime(
  env: NodeJS.ProcessEnv,
  trustedCandidateSource: () => readonly string[] = () => trustedNodeCandidates(userInfo().homedir),
  budget: Pick<ArchctxProviderOptions, 'deadlineMs' | 'nowMs'> = {},
): string {
  const version = (candidate: string): string | null => {
    const result = runProcess(candidate, ['--version'], {
      env,
      inheritEnv: false,
      timeoutMs: remainingTimeout(budget, 5_000, 'Node runtime selection'),
      maxOutputBytes: 4 * 1024,
      redactions: [],
      processGroup: true,
    });
    if (result.timedOut && budget.deadlineMs !== undefined) remainingTimeout(budget, 5_000, 'Node runtime selection');
    return result.ok ? result.stdout.trim().replace(/^v/, '') : null;
  };
  const explicitRuntime = env.REPO_HARNESS_NODE_BIN?.trim();
  if (explicitRuntime) {
    if (!isAbsolute(explicitRuntime)) throw new Error('REPO_HARNESS_NODE_BIN must be an absolute path');
    const actual = realpathSync(explicitRuntime);
    const stat = statSync(actual);
    if (!stat.isFile() || (stat.mode & 0o111) === 0) throw new Error('REPO_HARNESS_NODE_BIN is not an executable file');
    const actualVersion = version(actual);
    if (actualVersion === null || !Bun.semver.satisfies(actualVersion, ARCHCONTEXT_NODE_RANGE)) {
      throw new Error(`REPO_HARNESS_NODE_BIN must satisfy Node ${ARCHCONTEXT_NODE_RANGE}`);
    }
    return actual;
  }
  const pathValue = env.PATH ?? '';
  const extensions = process.platform === 'win32'
    ? (env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  for (const directory of pathValue.split(process.platform === 'win32' ? ';' : ':')) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = join(directory, `node${extension}`);
      if (!existsSync(candidate)) continue;
      const actualVersion = version(candidate);
      if (actualVersion !== null && Bun.semver.satisfies(actualVersion, ARCHCONTEXT_NODE_RANGE)) return realpathSync(candidate);
    }
  }
  const trustedCandidates = trustedCandidateSource();
  for (const candidate of trustedCandidates) {
    if (!isAbsolute(candidate) || !existsSync(candidate)) continue;
    const actual = realpathSync(candidate);
    const stat = statSync(actual);
    if (!stat.isFile() || (stat.mode & 0o111) === 0) continue;
    const actualVersion = version(actual);
    if (actualVersion !== null && Bun.semver.satisfies(actualVersion, ARCHCONTEXT_NODE_RANGE)) return actual;
  }
  throw new Error(
    `archctx requires Node ${ARCHCONTEXT_NODE_RANGE}; no compatible node executable was found. `
    + `Scanned sources: REPO_HARNESS_NODE_BIN (unset), `
    + `PATH (${pathValue || '(empty)'}), `
    + `trusted candidates (${trustedCandidates.length > 0 ? trustedCandidates.join(', ') : '(none)'})`,
  );
}

function runArchctxProcess(
  resolved: ResolvedArchctxPackage,
  args: readonly string[],
  options: ArchctxProviderOptions,
  cwd: string,
  timeoutMs: number,
): ArchctxProcessResult {
  const env = options.env ?? process.env;
  if (options.run) return options.run(resolved.binaryPath, args, { cwd, timeoutMs, env });
  const now = options.nowMs ?? Date.now;
  const deadlineMs = options.deadlineMs ?? now() + timeoutMs;
  const nodeExecutable = resolveCompatibleNodeRuntime(env, options.trustedNodeCandidateSource, { deadlineMs, nowMs: now });
  return DEFAULT_RUNNER(nodeExecutable, [resolved.binaryPath, ...args], { cwd, timeoutMs: remainingTimeout({ deadlineMs, nowMs: now }, timeoutMs, commandLabel(args)), env });
}

/** One transport and envelope reader for projection, refactor and ownership. */
export class ArchctxClient {
  readonly resolved: ResolvedArchctxPackage;

  constructor(readonly repoRoot: string, requiredVersion: string, readonly options: ArchctxProviderOptions = {}) {
    this.resolved = resolvePackageLocalArchctx(options.consumerRoot ?? findConsumerRoot(), requiredVersion);
  }

  json(args: readonly string[], maximumMs = 120_000, allowErrorEnvelope = false): unknown {
    const label = commandLabel(args);
    const result = runArchctxProcess(this.resolved, args, this.options, this.repoRoot, remainingTimeout(this.options, maximumMs, label));
    if (result.timedOut) {
      throw new ArchctxClientError({ code: 'RH_ARCHCTX_TIMEOUT', action: 'check-and-retry-same-request', message: `${label} timed out; outcome unknown. Run repo-harness architecture-projection check --json, then retry with the same request id.` });
    }
    if (Buffer.byteLength(result.stdout, 'utf8') > ARCHCTX_MAX_OUTPUT_BYTES || Buffer.byteLength(result.stderr, 'utf8') > ARCHCTX_MAX_OUTPUT_BYTES) throw new Error(`${label} output exceeded maxBuffer`);
    // Process errors can contain argv, including request-json. Do not print them.
    if (result.signal || result.error) throw new Error(`${label} process failed${result.signal ? `: signal ${result.signal}` : ''}`);
    if (result.stdout.trim() === '') throw new Error(`${label} failed: exit ${result.status}: ${result.stderr.trim()}`);
    const value = parseJson(result.stdout, label);
    if (args[0] === 'capabilities' && result.status === 0) return value;
    // Daemon lifecycle readback is not a request-scoped command and carries no
    // requestId; its caller validates the lifecycle envelope itself.
    if (args[0] === 'daemon' && result.status === 0) return value;
    if (!isRecord(value) || value.schemaVersion !== 'archcontext.envelope/v1' || typeof value.ok !== 'boolean' || typeof value.requestId !== 'string') throw new Error(`${label} returned an invalid envelope`);
    if (value.ok === false) {
      const error = decodeArchctxError(value.error);
      if (!allowErrorEnvelope) throw new ArchctxClientError(error);
    } else if (!isRecord(value.data)) throw new Error(`${label} returned an invalid envelope`);
    if (result.status !== 0 && !allowErrorEnvelope && value.ok) throw new Error(`${label} failed: exit ${result.status}`);
    return value;
  }

  data(args: readonly string[], maximumMs: number): unknown {
    return (this.json(args, maximumMs) as Record<string, unknown>).data;
  }
}

export class ArchctxClientError extends Error {
  readonly code: string;
  readonly action: string;
  readonly reasonCode?: string;
  readonly details?: ArchContextError['details'];
  readonly retryable?: boolean;
  readonly providerMessage: string;

  constructor(error: Pick<ArchContextError, 'message' | 'action'> & { code: string } & Partial<Omit<ArchContextError, 'code' | 'message' | 'action'>>) {
    const maintenance = error.code === 'AC_RUNTIME_VERSION_UNSUPPORTED' && error.action === 'upgrade-archctx-runtime' ? ` ${ARCHCTX_MAINTENANCE_REMINDER}` : '';
    super(`${error.code}: ${error.message}${maintenance}${error.reasonCode ? ` (reasonCode: ${error.reasonCode})` : ''}; action: ${error.action}`);
    this.name = 'ArchctxClientError';
    this.code = error.code;
    this.action = error.action;
    this.reasonCode = error.reasonCode;
    this.details = error.details;
    this.retryable = error.retryable;
    this.providerMessage = error.message;
  }
}

function decodeArchctxError(value: unknown): ArchContextError {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string' || typeof value.action !== 'string'
    || !Object.hasOwn(ERROR_CATALOG, value.code)
    || value.action !== ERROR_CATALOG[value.code as ArchContextError['code']].action
    || value.retryable !== ERROR_CATALOG[value.code as ArchContextError['code']].retryable
    || value.severity !== ERROR_CATALOG[value.code as ArchContextError['code']].severity
    || (value.reasonCode !== undefined && typeof value.reasonCode !== 'string')
    || (value.details !== undefined && (!isRecord(value.details) || Buffer.byteLength(JSON.stringify(value.details), 'utf8') > 256 * 1024))) throw new Error('archctx returned an invalid error envelope');
  return value as unknown as ArchContextError;
}

function commandLabel(args: readonly string[]): string { return `archctx ${args.slice(0, args[1]?.startsWith('-') ? 1 : 2).join(' ')}`; }

export function runPackageLocalArchctxJson(
  repoRoot: string,
  requiredVersion: string,
  args: readonly string[],
  options: ArchctxProviderOptions = {},
  maximumMs = 120_000,
  allowErrorEnvelope = false,
): { resolved: ResolvedArchctxPackage; value: unknown } {
  const client = new ArchctxClient(repoRoot, requiredVersion, options);
  return { resolved: client.resolved, value: client.json(args, maximumMs, allowErrorEnvelope) };
}

export function archctxCapabilities(repoRoot: string, options: ArchctxProviderOptions = {}): { resolved: ResolvedArchctxPackage; capabilities: ArchctxCapabilitiesV1 } {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  if (policy.provider === 'disabled') throw new Error('architecture projection provider is disabled');
  const { resolved, value } = runPackageLocalArchctxJson(repoRoot, policy.requiredVersion, ['capabilities', '--json'], options, Math.min(policy.timeoutMs, 10_000));
  try { assertArchctxVersion(value, policy.requiredVersion); }
  catch (error) { throw new ArchctxClientError({ code: 'RH_ARCHCTX_PACKAGE_MISMATCH', action: 'update-repo-harness', message: error instanceof Error ? error.message : String(error) }); }
  return { resolved, capabilities: value as ArchctxCapabilitiesV1 };
}

const ARCHCTX_MAINTENANCE_REMINDER = 'User authorization required: ask before replacing the shared daemon with daemon upgrade; this interrupts other clients. Use the same managed package-local archctx and Node runtime, then verify daemon status. After replacement, check the configured CodeGraph index for this repository; request authorization to rebuild only if it is missing or stale. Do not delete shared state or automatically restart/reindex.';

/** Lifecycle readback is separate from the CLI-only capabilities handshake. */
export function verifyArchctxDaemonRuntime(repoRoot: string, options: ArchctxProviderOptions = {}): void {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  const { resolved, value } = runPackageLocalArchctxJson(repoRoot, policy.requiredVersion, ['daemon', 'status', '--json'], options, Math.min(policy.timeoutMs, 10_000));
  if (!isRecord(value) || value.schemaVersion !== 'archcontext.envelope/v1' || value.ok !== true || !isRecord(value.data) || typeof value.data.running !== 'boolean') {
    throw new Error('archctx daemon status returned an invalid envelope');
  }
  const data = value.data;
  if (data.staleConnection === true) {
    throw new Error('archctx daemon status reports an unhealthy connection; runtime compatibility is unverified. Ask the user before daemon repair; do not automatically restart or clear shared state.');
  }
  if (data.versionUnsupported !== undefined) {
    const issue = data.versionUnsupported;
    if (!isRecord(issue) || typeof issue.reason !== 'string' || typeof issue.expected !== 'string' || typeof issue.received !== 'string' || issue.action !== 'upgrade-archctx-runtime' || issue.command !== 'archctx daemon upgrade') {
      throw new Error('archctx daemon status returned an invalid versionUnsupported diagnostic');
    }
    throw new ArchctxClientError({ code: 'AC_RUNTIME_VERSION_UNSUPPORTED', action: 'upgrade-archctx-runtime', reasonCode: issue.reason, message: `managed archctx@${resolved.version}; daemon ${issue.reason}: expected ${issue.expected}, received ${issue.received}.` });
  }
  if (data.running && (data.rpcVersionCompatible !== true || data.productVersionCompatible !== true)) {
    throw new Error('archctx daemon status did not prove runtime compatibility');
  }
}

export function inspectArchitectureProjectionReadiness(repoRoot: string, options: ArchctxProviderOptions = {}): ArchitectureProjectionReadinessV1 {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  let source: ArchitectureProjectionReadinessV1['modelAuthority']['source'] = 'unadopted';
  let daemonState: ArchitectureProjectionReadinessV1['daemonRuntime']['state'] = 'not-evaluated';
  const codeFacts: ArchitectureProjectionReadinessV1['codeFacts'] = {
    requirement: 'required', state: policy.provider === 'disabled' || existsSync(join(repoRoot, '.codegraph')) ? 'not-evaluated' : 'unavailable',
  };
  const base = () => ({
    schemaVersion: 'repo-harness.architecture-projection-readiness/v1' as const,
    modelAuthority: { source, ready: source !== 'unadopted' && capabilityAuthorityReady(repoRoot) },
    codeFacts,
    daemonRuntime: { state: daemonState },
    apply: { mode: policy.applyMode, enabled: false },
  });
  try {
    source = capabilitySource(repoRoot);
    if (policy.provider === 'disabled') return {
      ...base(),
      projectionProvider: { provider: 'disabled', state: 'disabled', binaryPath: null, nodePath: null, command: null, version: null, reason: readGlobalArchitectureConfiguration(options.env).initialized ? 'global architecture.projection_provider=disabled' : 'global architecture configuration is missing; run repo-harness update once' },
      next: source === 'archcontext' && architectureModelReady(repoRoot) ? null : architectureAdoptionStep(),
    };
    if (source === 'unadopted') throw new ArchctxClientError({ code: 'RH_ARCHCTX_POLICY_MISSING', action: 'adopt-repository', message: 'repository policy is missing; run repo-harness init' });
    const nodePath = resolveCompatibleNodeRuntime(options.env ?? process.env, options.trustedNodeCandidateSource);
    const handshake = archctxCapabilities(repoRoot, options);
    assertRendererFloor(repoRoot, handshake.capabilities);
    try { verifyArchctxDaemonRuntime(repoRoot, options); daemonState = 'compatible'; }
    catch (error) { daemonState = error instanceof ArchctxClientError && error.code === 'AC_RUNTIME_VERSION_UNSUPPORTED' ? 'mismatch' : 'error'; throw error; }
    const modelReady = architectureModelReady(repoRoot);
    return {
      ...base(),
      projectionProvider: { provider: 'archctx', state: 'ready', binaryPath: handshake.resolved.binaryPath, nodePath, command: [nodePath, handshake.resolved.binaryPath], version: handshake.resolved.version, reason: 'exact package-local handshake and daemon runtime check passed; code facts are reported separately' },
      apply: { mode: policy.applyMode, enabled: policy.applyMode !== 'disabled' && modelReady && codeFacts.state !== 'unavailable' },
      next: source !== 'archcontext' || !modelReady ? architectureAdoptionStep() : codeFacts.state === 'unavailable' ? 'codegraph init' : null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const state: ArchitectureProjectionReadinessV1['projectionProvider']['state'] = error instanceof ArchctxClientError
      ? ['RH_ARCHCTX_PACKAGE_MISSING', 'RH_ARCHCTX_POLICY_MISSING'].includes(error.code) ? 'missing'
        : ['RH_ARCHCTX_PACKAGE_MISMATCH', 'RH_ARCHCTX_RENDERER_MISMATCH', 'AC_RUNTIME_VERSION_UNSUPPORTED'].includes(error.code) ? 'mismatch' : 'error'
      : 'error';
    return {
      ...base(),
      projectionProvider: { provider: policy.provider, state, binaryPath: null, nodePath: null, command: null, version: null, reason },
      next: error instanceof ArchctxClientError ? error.action === 'update-repo-harness' ? 'update repo-harness' : error.action : 'repair the reported provider error',
    };
  }
}

/** A package must not rewrite documents made by a newer renderer. */
function assertRendererFloor(repoRoot: string, capabilities: ArchctxCapabilitiesV1): void {
  const path = join(repoRoot, 'docs/architecture/.projection-manifest.json');
  if (!existsSync(path)) return;
  const manifest: unknown = parseJson(readFileSync(path, 'utf8'), 'committed projection manifest');
  const committed = isRecord(manifest) ? manifest.rendererVersion : undefined;
  const provider = capabilities.renderers.architectureDocs;
  const revision = (value: unknown): number | null => {
    if (typeof value !== 'string' || !/^archcontext\.docs-renderer\/v[1-9]\d*$/.test(value)) return null;
    const number = Number(value.slice(value.lastIndexOf('/v') + 2));
    return Number.isSafeInteger(number) ? number : null;
  };
  const committedRevision = revision(committed);
  const providerRevision = revision(provider);
  if (committedRevision === null || providerRevision === null || committedRevision > providerRevision) {
    throw new ArchctxClientError({ code: 'RH_ARCHCTX_RENDERER_MISMATCH', action: 'update-repo-harness', message: `committed renderer ${String(committed)} cannot be served by ${provider}; update repo-harness` });
  }
}

export interface ArchitectureProjectionRequestOptions {
  changedPaths?: readonly string[];
  requestId?: string;
  adoptionPlanId?: string;
  expectedWorktreeDigest?: string;
}

/** One immutable input identity for the whole call, including observed acceptance. */
export function architectureProjectionRequest(mode: ProjectionMode, repoRoot: string, options: ArchitectureProjectionRequestOptions = {}): ProjectionRequestV1 {
  const expected = captureArchitectureProjectionSnapshot(repoRoot);
  if (options.expectedWorktreeDigest !== undefined && options.expectedWorktreeDigest !== expected.worktreeDigest) throw new ArchctxClientError({ code: 'RH_ARCHCTX_PLAN_MISMATCH', action: 'rebuild-plan', message: 'worktree differs from the reviewed plan; run architecture-projection plan --json' });
  const body: Omit<ProjectionRequestV1, 'requestId'> = {
    schemaVersion: PROJECTION_REQUEST_SCHEMA_VERSION,
    profile: 'repo-harness/v1', mode, targets: ['architecture-docs'],
    changedPaths: [...new Set(options.changedPaths ?? [])].sort(), expected,
    ...(mode === 'adopt' ? { adoptionPlanId: options.adoptionPlanId } : {}),
    ...(mode === 'apply' || mode === 'adopt' ? { acceptObservedMajorChange: true as const } : {}),
  };
  return { ...body, requestId: options.requestId ?? `repo-harness.${mode}.${digestJson(body as unknown as Json).slice('sha256:'.length)}` };
}

/** The worker guidance ships in the running package, so the path is valid for every host. */
function architectureAdoptionStep(): string {
  const reference = join(findConsumerRoot(), 'assets', 'skill-commands', 'repo-harness-architecture', 'references', 'worker.md');
  return `The repository has no complete ArchContext model. Follow "Adopt ArchContext in a repository" in ${reference}.`;
}

export function runArchitectureProjection(request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions = {}): ProjectionResultV2 {
  return assertProjectionResult(runProjectionCommand('run', request, repoRoot, options), request.requestId);
}

/** Read an existing committed apply; this operation never invokes projection run/apply. */
export function readArchitectureProjectionApply(request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions = {}): ProjectionApplyReadbackResultV1 {
  return assertProjectionApplyReadbackResult(runProjectionCommand('readback', request, repoRoot, options), request);
}

/**
 * Runs the read-only `archctx docs anchors`. It reports stale citations in
 * human-owned document regions and node prose. It writes nothing.
 */
export function readArchitectureDocsAnchors(repoRoot: string, options: ArchctxProviderOptions = {}): DocsAnchorsReportV1 {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  archctxCapabilities(repoRoot, { ...options, policy });
  const client = new ArchctxClient(repoRoot, policy.requiredVersion, options);
  return decodeDocsAnchorsReport(client.data(['docs', 'anchors', '--json'], policy.timeoutMs));
}

function runProjectionCommand(command: 'run' | 'readback', request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions): unknown {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  if ((request.mode === 'apply' || request.mode === 'adopt') && policy.applyMode === 'disabled') throw new Error('architecture projection apply is disabled');
  const handshake = archctxCapabilities(repoRoot, { ...options, policy });
  assertRendererFloor(repoRoot, handshake.capabilities);
  const client = new ArchctxClient(repoRoot, policy.requiredVersion, options);
  try { return client.data(['projection', command, '--request-json', JSON.stringify(request)], policy.timeoutMs); }
  catch (error) {
    if (error instanceof ArchctxClientError && error.code === 'RH_ARCHCTX_TIMEOUT') throw new ArchctxClientError({ code: error.code, action: error.action, message: `${error.message} Retry with --request-id ${request.requestId}.` });
    throw error;
  }
}

function remainingTimeout(options: Pick<ArchctxProviderOptions, 'deadlineMs' | 'nowMs'>, maximumMs: number, phase: string): number {
  if (options.deadlineMs === undefined) return maximumMs;
  const remaining = Math.floor(options.deadlineMs - (options.nowMs ?? Date.now)());
  if (remaining <= 0) throw new Error(`architecture projection timeout before ${phase}`);
  return Math.min(maximumMs, remaining);
}

/**
 * Reproduces the public ProjectionExpectedSnapshotV1 identity contract used by
 * ArchContext. Projection-owned outputs are excluded so apply can be checked
 * against the same fixed point before and after the ChangeSet write.
 */
export function captureArchitectureProjectionSnapshot(repoRoot: string): ProjectionRequestV1['expected'] {
  const root = realpathSync(resolve(repoRoot));
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const headSha = head.status === 0 ? (head.stdout ?? '').trim() : '';
  if (!/^[a-f0-9]{40}$/.test(headSha)) throw new Error('architecture projection requires a readable 40-character Git HEAD');
  const ignoredPaths = new Set(PROJECTION_WORKTREE_IGNORE_PATHS);
  for (const path of architectureAgentContextTargets(root)) ignoredPaths.add(path);
  const files = listProjectionInputFiles(root, ignoredPaths).map((path) => {
    const absolute = resolve(root, path);
    return {
      path,
      size: statSync(absolute).size,
      digest: createHash('sha256').update(readFileSync(absolute)).digest('hex'),
    };
  });
  return {
    repositoryId: `repo.${createHash('sha256').update(root).digest('hex').slice(0, 16)}`,
    workspaceId: `workspace.${digestJson({ root }).replace(/^sha256:/, '').slice(0, 16)}`,
    headSha,
    worktreeDigest: digestJson(files as unknown as Json) as `sha256:${string}`,
  };
}

function architectureAgentContextTargets(root: string): string[] {
  const nodesDir = join(root, '.archcontext', 'model', 'nodes');
  if (!existsSync(nodesDir)) throw new Error('architecture projection requires .archcontext/model/nodes');
  const yaml = (globalThis as { Bun?: { YAML?: { parse(source: string): unknown } } }).Bun?.YAML;
  if (!yaml?.parse) throw new Error('Bun.YAML is required to resolve architecture projection targets');
  const files = readdirSync(nodesDir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => ({ path: `.archcontext/model/nodes/${name}`, value: yaml.parse(readFileSync(join(nodesDir, name), 'utf8')) }));
  const targets = new Set<string>();
  const ids = new Set<string>();
  for (const { path, value: node } of files) {
    if (!isRecord(node) || node.schemaVersion !== 'archcontext.node/v2' || typeof node.kind !== 'string') {
      throw new Error(`architecture projection node is invalid: ${path}`);
    }
    if (node.kind !== 'capability') continue;
    // repo-harness/v1 layout consumes identity and explicit output targets.
    // Ownership metadata/prefix translation belongs only to the selected workflow
    // registry. In particular, projection must preserve generic source globs and
    // exclusions, and includes every capability rendered by the producer.
    if (typeof node.id !== 'string' || !/^capability\.[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(node.id) || ids.has(node.id)) {
      throw new Error(`architecture projection capability identity is invalid or duplicate: ${path}`);
    }
    ids.add(node.id);
    const extensions = isRecord(node.extensions) ? node.extensions : null;
    const contracts = extensions && isRecord(extensions.contractFiles) ? extensions.contractFiles : null;
    for (const [key, basename] of [['agents', 'AGENTS.md'], ['claude', 'CLAUDE.md']] as const) {
      const target = contracts?.[key];
      if (typeof target !== 'string' || normalizeCapabilityPath(target) !== target || (target !== basename && !target.endsWith(`/${basename}`))) {
        throw new Error(`architecture projection contract target is invalid: ${path}#extensions.contractFiles.${key}`);
      }
      targets.add(target);
    }
  }
  return [...targets].sort();
}

function listProjectionInputFiles(root: string, ignored: Set<string>): string[] {
  const files: string[] = [];
  walk(root);
  return files.sort();

  function walk(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      const rootSegment = path.split('/')[0]!;
      if (!path || PROJECTION_WORKTREE_IGNORE_ROOTS.has(rootSegment) || ignored.has(path) || [...ignored].some((pattern) => path.startsWith(`${pattern}/`))) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(path);
    }
  }
}

function findInstalledArchctxPackageRoot(consumerRoot: string, requiredVersion: string): string {
  const packageRoot = findArchctxPackageRoot(consumerRoot);
  if (!packageRoot) throw new ArchctxClientError({ code: 'RH_ARCHCTX_PACKAGE_MISSING', action: 'update-repo-harness', message: `package-local archctx@${requiredVersion} is missing from the consumer dependency tree rooted at ${resolve(consumerRoot)}` });
  return packageRoot;
}

function findArchctxPackageRoot(startRoot: string): string | null {
  let current = realpathSync(resolve(startRoot));
  while (true) {
    const candidate = join(current, 'node_modules', 'archctx');
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = resolve(current, '..');
    if (parent === current) return null;
    current = parent;
  }
}

function findConsumerRoot(): string {
  let current = resolve(import.meta.dir);
  while (true) {
    try {
      const manifest = JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')) as { name?: unknown };
      if (manifest.name === 'repo-harness') return current;
    } catch { /* continue upward */ }
    const parent = resolve(current, '..');
    if (parent === current) throw new Error('repo-harness package root is unavailable');
    current = parent;
  }
}

function capabilitySource(repoRoot: string): ArchitectureProjectionReadinessV1['modelAuthority']['source'] {
  const path = join(repoRoot, '.ai/harness/policy.json');
  if (!existsSync(path)) return 'unadopted';
  const policy = JSON.parse(readFileSync(path, 'utf8')) as { context?: { capability_source?: unknown } };
  return policy.context?.capability_source === 'archcontext' ? 'archcontext' : 'registry';
}

function parseJson(text: string, label: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error(`${label} returned corrupt JSON`); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
