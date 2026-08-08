import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { capabilityRegistryFromArchcontextNodes, type ArchcontextNodeFile } from '../../core/capabilities/registry';
import {
  ARCHCTX_REQUIRED_VERSION,
  ARCHITECTURE_DOCS_LAYOUT_VERSION,
  ARCHITECTURE_DOCS_RENDERER_VERSION,
  assertArchctxCapabilities,
  assertProjectionResult,
  digestProjectionJson,
  projectionRequestIssues,
  readArchitectureProjectionPolicy,
  type ArchitectureProjectionPolicy,
  type ArchitectureProjectionReadinessV1,
  type ArchctxCapabilitiesV1,
  type ProjectionRequestV1,
  type ProjectionResultV1,
} from '../../core/architecture/projection';

export interface ArchctxProcessResult { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: string }
export type RunArchctxProcess = (binary: string, args: readonly string[], options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }) => ArchctxProcessResult;

export interface ArchctxProviderOptions {
  consumerRoot?: string;
  policy?: ArchitectureProjectionPolicy;
  env?: NodeJS.ProcessEnv;
  run?: RunArchctxProcess;
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
  '.archcontext/.local',
  'docs/architecture',
]);

export interface ResolvedArchctxPackage {
  binaryPath: string;
  packageRoot: string;
  version: string;
}

const DEFAULT_RUNNER: RunArchctxProcess = (binary, args, options) => {
  const result = spawnSync(binary, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: result.status, signal: result.signal, stdout: result.stdout ?? '', stderr: result.stderr ?? '', ...(result.error ? { error: result.error.message } : {}) };
};

export function loadArchitectureProjectionPolicy(repoRoot: string): ArchitectureProjectionPolicy {
  const path = join(repoRoot, '.ai', 'harness', 'policy.json');
  return readArchitectureProjectionPolicy(JSON.parse(readFileSync(path, 'utf8')));
}

export function resolvePackageLocalArchctx(consumerRoot: string, requiredVersion: string = ARCHCTX_REQUIRED_VERSION): ResolvedArchctxPackage {
  const packageRoot = findInstalledArchctxPackageRoot(consumerRoot, requiredVersion);
  const manifestPath = join(packageRoot, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; version?: unknown; bin?: unknown };
  if (manifest.name !== 'archctx' || manifest.version !== requiredVersion) throw new Error(`package-local archctx mismatch: expected archctx@${requiredVersion}, got ${String(manifest.name)}@${String(manifest.version)}`);
  const bin = isRecord(manifest.bin) && typeof manifest.bin.archctx === 'string' ? manifest.bin.archctx : null;
  if (!bin) throw new Error(`package-local archctx@${requiredVersion} does not declare bin.archctx`);
  const binaryPath = resolve(packageRoot, bin);
  if (!existsSync(binaryPath)) throw new Error(`package-local archctx@${requiredVersion} binary is missing: ${binaryPath}`);
  const realBinary = realpathSync(binaryPath);
  const realPackage = realpathSync(packageRoot);
  const inside = (path: string, root: string) => path === root || path.startsWith(`${root}${sep}`);
  if (!inside(realBinary, realPackage)) throw new Error('package-local archctx binary escapes the archctx package root');
  return { binaryPath: realBinary, packageRoot: realPackage, version: requiredVersion };
}

export function archctxCapabilities(repoRoot: string, options: ArchctxProviderOptions = {}): { resolved: ResolvedArchctxPackage; capabilities: ArchctxCapabilitiesV1 } {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(repoRoot);
  if (policy.provider === 'disabled') throw new Error('architecture projection provider is disabled');
  const resolved = resolvePackageLocalArchctx(options.consumerRoot ?? findConsumerRoot(), policy.requiredVersion);
  const result = (options.run ?? DEFAULT_RUNNER)(resolved.binaryPath, ['capabilities', '--json'], {
    cwd: repoRoot,
    timeoutMs: Math.min(policy.timeoutMs, 10_000),
    env: options.env ?? process.env,
  });
  if (result.status !== 0 || result.signal || result.error) throw new Error(`archctx capabilities failed: ${processFailure(result)}`);
  return { resolved, capabilities: assertArchctxCapabilities(parseJson(result.stdout, 'archctx capabilities'), policy.requiredVersion) };
}

export function inspectArchitectureProjectionReadiness(repoRoot: string, options: ArchctxProviderOptions = {}): ArchitectureProjectionReadinessV1 {
  const policy = options.policy ?? loadArchitectureProjectionPolicy(repoRoot);
  const source = capabilitySource(repoRoot);
  if (policy.provider === 'disabled') return {
    schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
    modelAuthority: { source, ready: existsSync(join(repoRoot, '.archcontext', 'model', 'nodes')) },
    projectionProvider: { provider: 'disabled', state: 'disabled', binaryPath: null, version: null, reason: 'policy.architecture.projection_provider=disabled' },
    codeFacts: { requirement: 'required', state: 'not-evaluated' },
    apply: { mode: policy.applyMode, enabled: false },
  };
  try {
    const handshake = archctxCapabilities(repoRoot, options);
    return {
      schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
      modelAuthority: { source, ready: existsSync(join(repoRoot, '.archcontext', 'model', 'nodes')) },
      projectionProvider: { provider: 'archctx', state: 'ready', binaryPath: handshake.resolved.binaryPath, version: handshake.resolved.version, reason: 'exact package-local capability handshake passed' },
      codeFacts: { requirement: 'required', state: 'not-evaluated' },
      apply: { mode: policy.applyMode, enabled: policy.applyMode !== 'disabled' },
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
      modelAuthority: { source, ready: existsSync(join(repoRoot, '.archcontext', 'model', 'nodes')) },
      projectionProvider: { provider: 'archctx', state, binaryPath: null, version: null, reason },
      codeFacts: { requirement: 'required', state: 'unavailable' },
      apply: { mode: policy.applyMode, enabled: false },
    };
  }
}

export function runArchitectureProjection(request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions = {}): ProjectionResultV1 {
  const requestIssues = projectionRequestIssues(request);
  if (requestIssues.length > 0) throw new Error(`invalid projection request: ${requestIssues.join('; ')}`);
  const policy = options.policy ?? loadArchitectureProjectionPolicy(repoRoot);
  if ((request.mode === 'apply' || request.mode === 'adopt') && policy.applyMode === 'disabled') throw new Error('architecture projection apply is disabled');
  const { resolved } = archctxCapabilities(repoRoot, { ...options, policy });
  const args = ['projection', 'run', '--request-json', JSON.stringify(request)];
  const processResult = (options.run ?? DEFAULT_RUNNER)(resolved.binaryPath, args, { cwd: repoRoot, timeoutMs: policy.timeoutMs, env: options.env ?? process.env });
  if (processResult.status !== 0 || processResult.signal || processResult.error) throw new Error(`archctx projection failed: ${processFailure(processResult)}`);
  const envelope = parseJson(processResult.stdout, 'archctx projection') as Record<string, unknown>;
  if (envelope.schemaVersion !== 'archcontext.envelope/v1' || envelope.ok !== true || !isRecord(envelope.data)) throw new Error(`archctx projection returned an invalid envelope: ${safeError(envelope)}`);
  const result = assertProjectionResult(envelope.data, request.requestId);
  assertExpectedSnapshot(request.expected, result.inputSnapshot, 'in provider result input');
  assertProjectionResultAuthority(request, result, repoRoot, policy);
  assertExpectedSnapshot(result.outputSnapshot, captureArchitectureProjectionSnapshot(repoRoot), 'after projection');
  if (result.inputSnapshot.rendererVersion !== ARCHITECTURE_DOCS_RENDERER_VERSION || result.outputSnapshot.rendererVersion !== ARCHITECTURE_DOCS_RENDERER_VERSION || result.inputSnapshot.layoutVersion !== ARCHITECTURE_DOCS_LAYOUT_VERSION || result.outputSnapshot.layoutVersion !== ARCHITECTURE_DOCS_LAYOUT_VERSION) throw new Error('archctx projection renderer/layout mismatch');
  return result;
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
    workspaceId: `workspace.${digestProjectionJson({ root }).replace(/^sha256:/, '').slice(0, 16)}`,
    headSha,
    worktreeDigest: digestProjectionJson(files),
  };
}

export function architectureProjectionOwnedPaths(repoRoot: string): string[] {
  return [...new Set(['docs/architecture', ...architectureAgentContextTargets(realpathSync(resolve(repoRoot)))])].sort();
}

function architectureAgentContextTargets(root: string): string[] {
  const nodesDir = join(root, '.archcontext', 'model', 'nodes');
  if (!existsSync(nodesDir)) throw new Error('architecture projection requires .archcontext/model/nodes');
  const yaml = (globalThis as { Bun?: { YAML?: { parse(source: string): unknown } } }).Bun?.YAML;
  if (!yaml?.parse) throw new Error('Bun.YAML is required to resolve architecture projection targets');
  const files: ArchcontextNodeFile[] = readdirSync(nodesDir)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => ({ path: `.archcontext/model/nodes/${name}`, value: yaml.parse(readFileSync(join(nodesDir, name), 'utf8')) }));
  const resolution = capabilityRegistryFromArchcontextNodes(files, {
    repoRoot: root,
    isExistingDirectory: (path) => {
      try { return statSync(resolve(root, path)).isDirectory(); } catch { return false; }
    },
  });
  if (resolution.status !== 'valid') throw new Error(`architecture projection capability nodes are invalid: ${resolution.diagnostics.map((entry) => entry.message).join('; ')}`);
  return [...new Set(resolution.registry.capabilities.flatMap((capability) => [capability.contract_files.agents, capability.contract_files.claude]))];
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

function assertProjectionResultAuthority(
  request: ProjectionRequestV1,
  result: ProjectionResultV1,
  repoRoot: string,
  policy: ArchitectureProjectionPolicy,
): void {
  if (result.status === 'applied' && request.mode !== 'apply' && request.mode !== 'adopt') {
    throw new Error(`archctx projection returned applied for non-mutating mode ${request.mode}`);
  }
  if (result.status === 'applied' && policy.applyMode === 'disabled') {
    throw new Error('archctx projection returned applied while projection apply is disabled');
  }
  if (result.outputSnapshot.worktreeDigest !== request.expected.worktreeDigest || result.outputSnapshot.headSha !== request.expected.headSha) {
    throw new Error('archctx projection wrote outside the projection-owned fixed-point surfaces');
  }
  const allowed = new Set<string>();
  if (request.targets.includes('architecture-docs')) allowed.add('docs/architecture');
  if (request.targets.includes('agent-context')) for (const path of architectureAgentContextTargets(repoRoot)) allowed.add(path);
  for (const file of result.files) {
    if (![...allowed].some((path) => file.path === path || file.path.startsWith(`${path}/`))) {
      throw new Error(`archctx projection result path escapes requested projection targets: ${file.path}`);
    }
  }
}

function findInstalledArchctxPackageRoot(consumerRoot: string, requiredVersion: string): string {
  let current = realpathSync(resolve(consumerRoot));
  while (true) {
    const candidate = join(current, 'node_modules', 'archctx');
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = resolve(current, '..');
    if (parent === current) throw new Error(`package-local archctx@${requiredVersion} is missing from the consumer dependency tree rooted at ${resolve(consumerRoot)}`);
    current = parent;
  }
}

function assertExpectedSnapshot(expected: ProjectionRequestV1['expected'], actual: ProjectionRequestV1['expected'], phase: string): void {
  for (const field of ['repositoryId', 'workspaceId', 'headSha', 'worktreeDigest'] as const) {
    if (expected[field] !== actual[field]) throw new Error(`architecture projection expected snapshot mismatch ${phase}: ${field}`);
  }
}

function findConsumerRoot(): string {
  let current = resolve(import.meta.dir, '..', '..', '..');
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
function processFailure(result: ArchctxProcessResult): string { return result.error ?? (result.signal ? `signal ${result.signal}` : `exit ${result.status}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`); }
function safeError(value: Record<string, unknown>): string { return isRecord(value.error) && typeof value.error.message === 'string' ? value.error.message : 'unknown error'; }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
