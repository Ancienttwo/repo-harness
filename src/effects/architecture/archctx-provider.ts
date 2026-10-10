import { loadArchitectureProjectionPolicy, readGlobalArchitectureConfiguration } from './projection-config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ARCHCONTEXT_NODE_RANGE, digestJson, type ArchctxCapabilitiesV1, type Json, type ProjectionApplyReadbackResultV1, type ProjectionRequestV1, type ProjectionResultV2 } from 'archctx-contracts';
import { trustedNodeCandidates } from '../runtime/node-candidates';
import { runProcess } from '../process-runner';
import { normalizeCapabilityPath } from '../../core/capabilities/registry';
import {
  ARCHCTX_REQUIRED_VERSION,
  assertArchctxVersion,
  assertProjectionApplyReadbackResult,
  assertProjectionResult,
  type ArchitectureProjectionPolicy,
  type ArchitectureProjectionReadinessV1,
} from '../../core/architecture/projection';

export interface ArchctxProcessResult { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: string }
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
  return { status: overflow ? 1 : result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, ...((overflow ? 'archctx output exceeded maxBuffer' : result.error) ? { error: overflow ? 'archctx output exceeded maxBuffer' : result.error } : {}) };
};


function architectureModelReady(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.archcontext', 'manifest.yaml'))
    && existsSync(join(repoRoot, '.archcontext', 'product.yaml'))
    && existsSync(join(repoRoot, '.archcontext', 'model', 'nodes'));
}

function capabilityAuthorityReady(repoRoot: string): boolean {
  return existsSync(join(repoRoot, '.archcontext', 'model', 'nodes'));
}

export function resolvePackageLocalArchctx(consumerRoot: string, requiredVersion: string = ARCHCTX_REQUIRED_VERSION): ResolvedArchctxPackage {
  const packageRoot = findInstalledArchctxPackageRoot(consumerRoot, requiredVersion);
  const manifestPath = join(packageRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; version?: unknown; bin?: unknown; engines?: unknown };
  if (manifest.name !== 'archctx' || manifest.version !== requiredVersion) throw new Error(`package-local archctx mismatch: expected archctx@${requiredVersion}, got ${String(manifest.name)}@${String(manifest.version)} (resolved from consumer root ${resolve(consumerRoot)})`);
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
  return DEFAULT_RUNNER(nodeExecutable, [resolved.binaryPath, ...args], { cwd, timeoutMs: remainingTimeout({ deadlineMs, nowMs: now }, timeoutMs, args.join(' ')), env });
}

export function runPackageLocalArchctxJson(
  repoRoot: string,
  requiredVersion: string,
  args: readonly string[],
  options: ArchctxProviderOptions = {},
  maximumMs = 120_000,
  allowErrorEnvelope = false,
): { resolved: ResolvedArchctxPackage; value: unknown } {
  // The runtime package owns the executable; the target repo supplies cwd/model
  // data only. Candidate verification may explicitly select its consumer root.
  const resolved = resolvePackageLocalArchctx(options.consumerRoot ?? findConsumerRoot(), requiredVersion);
  const result = runArchctxProcess(resolved, args, options, repoRoot, remainingTimeout(options, maximumMs, args.join(' ')));
  if ((result.status !== 0 || result.signal || result.error) && !allowErrorEnvelope) throw new Error(`archctx ${args.join(' ')} failed: ${processFailure(result)}`);
  if (result.signal || result.error || result.stdout.trim() === '') throw new Error(`archctx ${args.join(' ')} failed: ${processFailure(result)}`);
  return { resolved, value: parseJson(result.stdout, `archctx ${args.join(' ')}`) };
}

export function archctxCapabilities(repoRoot: string, options: ArchctxProviderOptions = {}): { resolved: ResolvedArchctxPackage; capabilities: ArchctxCapabilitiesV1 } {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  if (policy.provider === 'disabled') throw new Error('architecture projection provider is disabled');
  const { resolved, value } = runPackageLocalArchctxJson(repoRoot, policy.requiredVersion, ['capabilities', '--json'], options, Math.min(policy.timeoutMs, 10_000));
  assertArchctxVersion(value, policy.requiredVersion);
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
    throw new Error(`AC_RUNTIME_VERSION_UNSUPPORTED: managed archctx@${resolved.version}; daemon ${issue.reason}: expected ${issue.expected}, received ${issue.received}. ${ARCHCTX_MAINTENANCE_REMINDER}`);
  }
  if (data.running && (data.rpcVersionCompatible !== true || data.productVersionCompatible !== true)) {
    throw new Error('archctx daemon status did not prove runtime compatibility');
  }
}

export function inspectArchitectureProjectionReadiness(repoRoot: string, options: ArchctxProviderOptions = {}): ArchitectureProjectionReadinessV1 {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  const source = capabilitySource(repoRoot);
  if (policy.provider === 'disabled') return {
    schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
    modelAuthority: { source, ready: capabilityAuthorityReady(repoRoot) },
    projectionProvider: { provider: 'disabled', state: 'disabled', binaryPath: null, version: null, reason: readGlobalArchitectureConfiguration(options.env).initialized ? 'global architecture.projection_provider=disabled' : 'global architecture configuration is missing; run repo-harness update once' },
    codeFacts: { requirement: 'required', state: 'not-evaluated' },
    apply: { mode: policy.applyMode, enabled: false },
  };
  try {
    const handshake = archctxCapabilities(repoRoot, options);
    const modelReady = architectureModelReady(repoRoot);
    return {
      schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
      modelAuthority: { source, ready: capabilityAuthorityReady(repoRoot) },
      projectionProvider: { provider: 'archctx', state: 'ready', binaryPath: handshake.resolved.binaryPath, version: handshake.resolved.version, reason: 'exact package-local capability handshake passed' },
      codeFacts: { requirement: 'required', state: 'not-evaluated' },
      apply: { mode: policy.applyMode, enabled: policy.applyMode !== 'disabled' && modelReady },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const state: ArchitectureProjectionReadinessV1['projectionProvider']['state'] = reason.includes('is missing')
      ? 'missing'
      : reason.includes('mismatch')
        ? 'mismatch'
        : 'error';
    return {
      schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
      modelAuthority: { source, ready: capabilityAuthorityReady(repoRoot) },
      projectionProvider: { provider: 'archctx', state, binaryPath: null, version: null, reason },
      codeFacts: { requirement: 'required', state: 'unavailable' },
      apply: { mode: policy.applyMode, enabled: false },
    };
  }
}

export function runArchitectureProjection(request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions = {}): ProjectionResultV2 {
  return assertProjectionResult(runProjectionCommand('run', request, repoRoot, options), request.requestId);
}

/** Read an existing committed apply; this operation never invokes projection run/apply. */
export function readArchitectureProjectionApply(request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions = {}): ProjectionApplyReadbackResultV1 {
  return assertProjectionApplyReadbackResult(runProjectionCommand('readback', request, repoRoot, options), request);
}

function runProjectionCommand(command: 'run' | 'readback', request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions): unknown {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  if ((request.mode === 'apply' || request.mode === 'adopt') && policy.applyMode === 'disabled') throw new Error('architecture projection apply is disabled');
  const { resolved } = archctxCapabilities(repoRoot, { ...options, policy });
  const label = `archctx projection ${command}`;
  const processResult = runArchctxProcess(resolved, ['projection', command, '--request-json', JSON.stringify(request)], options, repoRoot, remainingTimeout(options, policy.timeoutMs, label));
  if (processResult.status !== 0 || processResult.signal || processResult.error) throw new Error(`${label} failed: ${processFailure(processResult)}`);
  const envelope = parseJson(processResult.stdout, label) as Record<string, unknown>;
  if (envelope.schemaVersion !== 'archcontext.envelope/v1' || envelope.ok !== true || !isRecord(envelope.data)) throw new Error(`${label} returned an invalid envelope: ${safeError(envelope)}`);
  return envelope.data;
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
  if (!packageRoot) throw new Error(`package-local archctx@${requiredVersion} is missing from the consumer dependency tree rooted at ${resolve(consumerRoot)}`);
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

function capabilitySource(repoRoot: string): 'registry' | 'archcontext' {
  const policy = JSON.parse(readFileSync(join(repoRoot, '.ai', 'harness', 'policy.json'), 'utf8')) as { context?: { capability_source?: unknown } };
  return policy.context?.capability_source === 'archcontext' ? 'archcontext' : 'registry';
}

function parseJson(text: string, label: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error(`${label} returned corrupt JSON`); }
}
function processFailure(result: ArchctxProcessResult): string {
  if (result.error) return result.error;
  if (result.signal) return `signal ${result.signal}`;
  // The provider's typed action is authoritative; stderr prose cannot authorize recovery.
  try {
    const value: unknown = JSON.parse(result.stdout);
    if (isRecord(value) && value.schemaVersion === 'archcontext.envelope/v1' && value.ok === false && isRecord(value.error) && value.error.code === 'AC_RUNTIME_VERSION_UNSUPPORTED' && value.error.action === 'upgrade-archctx-runtime') {
      return `exit ${result.status}: ${safeError(value)}`;
    }
  } catch { /* retain ordinary bounded process diagnostics */ }
  return `exit ${result.status}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`;
}
function safeError(value: Record<string, unknown>): string {
  if (!isRecord(value.error) || typeof value.error.message !== 'string') return 'unknown error';
  if (value.schemaVersion === 'archcontext.envelope/v1' && value.ok === false && value.error.code === 'AC_RUNTIME_VERSION_UNSUPPORTED' && value.error.action === 'upgrade-archctx-runtime') {
    return `AC_RUNTIME_VERSION_UNSUPPORTED: ${value.error.message.slice(0, 1000)} ${ARCHCTX_MAINTENANCE_REMINDER}`;
  }
  return value.error.message;
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
