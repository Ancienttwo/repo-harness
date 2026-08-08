import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { delimiter, join, relative, resolve, sep } from 'node:path';
import { capabilityRegistryFromArchcontextNodes, type ArchcontextNodeFile } from '../../core/capabilities/registry';
import {
  ARCHCTX_REQUIRED_VERSION,
  ARCHITECTURE_DOCS_LAYOUT_VERSION,
  ARCHITECTURE_DOCS_RENDERER_VERSION,
  PROJECTION_REQUEST_VERSION,
  PROJECTION_RESULT_VERSION,
  assertArchctxCapabilities,
  digestProjectionJson,
  projectionRequestIssues,
  projectionResultIssues,
  projectionResultReceiptDigest,
  readArchitectureProjectionPolicy,
  type ArchitectureProjectionPolicy,
  type ArchitectureProjectionReadinessV1,
  type ArchitectureRefreshSignalV1,
  type ArchctxCapabilitiesV1,
  type ProjectionRequestV1,
  type ProjectionResultV1,
  type ProjectionSnapshotV1,
  type Sha256Digest,
} from '../../core/architecture/projection';

export interface ArchctxProcessResult { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string; error?: string }
export type RunArchctxProcess = (binary: string, args: readonly string[], options: { cwd: string; timeoutMs: number; env: NodeJS.ProcessEnv }) => ArchctxProcessResult;

export interface ArchctxProviderOptions {
  consumerRoot?: string;
  policy?: ArchitectureProjectionPolicy;
  env?: NodeJS.ProcessEnv;
  run?: RunArchctxProcess;
}

const PROJECTION_WORKTREE_IGNORES = new Set([
  '.git',
  '.codegraph',
  'node_modules',
  'coverage',
  'artifacts',
  '_ops',
  '_ref',
  '.archcontext/.local',
  '.DS_Store',
  'docs/architecture',
]);

export interface ResolvedArchctxPackage {
  binaryPath: string;
  packageRoot: string;
  version: string;
}

type ArchctxProjectionProvenance = Pick<ProjectionSnapshotV1,
  | 'baseHeadSha'
  | 'worktreeDigest'
  | 'sourceTreeDigest'
  | 'modelDigest'
  | 'codeGraphDigest'
  | 'indexedWorktreeDigest'
  | 'projectionInputDigest'
  | 'rendererVersion'
  | 'layoutVersion'
  | 'generatedFrom'>;

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
  const packageRoot = join(resolve(consumerRoot), 'node_modules', 'archctx');
  const manifestPath = join(packageRoot, 'package.json');
  const binaryPath = join(resolve(consumerRoot), 'node_modules', '.bin', process.platform === 'win32' ? 'archctx.cmd' : 'archctx');
  if (!existsSync(manifestPath) || !existsSync(binaryPath)) throw new Error(`package-local archctx@${requiredVersion} is missing under ${resolve(consumerRoot)}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown; version?: unknown };
  if (manifest.name !== 'archctx' || manifest.version !== requiredVersion) throw new Error(`package-local archctx mismatch: expected archctx@${requiredVersion}, got ${String(manifest.name)}@${String(manifest.version)}`);
  const realBinary = realpathSync(binaryPath);
  const realPackage = realpathSync(packageRoot);
  if (!realBinary.startsWith(realPackage) && !realBinary.startsWith(`${resolve(consumerRoot)}${delimiter === ';' ? '\\' : '/'}`)) throw new Error('package-local archctx binary escapes the consumer install root');
  return { binaryPath, packageRoot, version: requiredVersion };
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
    modelAuthority: { source, ready: source === 'registry' || existsSync(join(repoRoot, '.archcontext', 'model', 'nodes')) },
    projectionProvider: { provider: 'disabled', state: 'disabled', binaryPath: null, version: null, reason: 'policy.architecture.projection_provider=disabled' },
    codeFacts: { requirement: 'required', state: 'not-evaluated' },
    apply: { mode: policy.applyMode, enabled: false },
  };
  try {
    const handshake = archctxCapabilities(repoRoot, options);
    return {
      schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
      modelAuthority: { source, ready: source === 'registry' || existsSync(join(repoRoot, '.archcontext', 'model', 'nodes')) },
      projectionProvider: { provider: 'archctx', state: 'ready', binaryPath: handshake.resolved.binaryPath, version: handshake.resolved.version, reason: 'exact package-local capability handshake passed' },
      codeFacts: { requirement: 'required', state: 'not-evaluated' },
      apply: { mode: policy.applyMode, enabled: policy.applyMode !== 'disabled' },
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      schemaVersion: 'repo-harness.architecture-projection-readiness/v1',
      modelAuthority: { source, ready: source === 'registry' || existsSync(join(repoRoot, '.archcontext', 'model', 'nodes')) },
      projectionProvider: { provider: 'archctx', state: reason.includes('mismatch') ? 'mismatch' : 'missing', binaryPath: null, version: null, reason },
      codeFacts: { requirement: 'required', state: 'unavailable' },
      apply: { mode: policy.applyMode, enabled: false },
    };
  }
}

export function runArchitectureProjection(request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions = {}): ProjectionResultV1 {
  const requestIssues = projectionRequestIssues(request);
  if (requestIssues.length > 0) throw new Error(`invalid projection request: ${requestIssues.join('; ')}`);
  const policy = options.policy ?? loadArchitectureProjectionPolicy(repoRoot);
  if (request.mode === 'apply' && policy.applyMode === 'disabled') throw new Error('architecture projection apply is disabled');
  assertExpectedSnapshot(request.expected, captureArchitectureProjectionSnapshot(repoRoot), 'before projection');
  const { resolved } = archctxCapabilities(repoRoot, { ...options, policy });
  const args = docsArgs(request);
  const processResult = (options.run ?? DEFAULT_RUNNER)(resolved.binaryPath, args, { cwd: repoRoot, timeoutMs: policy.timeoutMs, env: options.env ?? process.env });
  if (processResult.status !== 0 || processResult.signal || processResult.error) throw new Error(`archctx projection failed: ${processFailure(processResult)}`);
  const envelope = parseJson(processResult.stdout, 'archctx projection') as Record<string, unknown>;
  if (envelope.schemaVersion !== 'archcontext.envelope/v1' || envelope.ok !== true || !isRecord(envelope.data)) throw new Error(`archctx projection returned an invalid envelope: ${safeError(envelope)}`);
  const result = mapProjectionResult(request, envelope.data);
  assertExpectedSnapshot(request.expected, captureArchitectureProjectionSnapshot(repoRoot), 'after projection');
  const issues = projectionResultIssues(result);
  if (issues.length > 0) throw new Error(`archctx projection result invariant failed: ${issues.join('; ')}`);
  return result;
}

function mapProjectionResult(request: ProjectionRequestV1, data: Record<string, unknown>): ProjectionResultV1 {
  const provenance = asProvenance(data.provenance);
  if (provenance.worktreeDigest !== request.expected.worktreeDigest) throw new Error('archctx projection snapshot does not match request.expected');
  const snapshot: ProjectionSnapshotV1 = {
    ...request.expected,
    baseHeadSha: provenance.baseHeadSha,
    sourceTreeDigest: provenance.sourceTreeDigest,
    modelDigest: provenance.modelDigest,
    codeGraphDigest: provenance.codeGraphDigest,
    indexedWorktreeDigest: provenance.indexedWorktreeDigest,
    projectionInputDigest: provenance.projectionInputDigest,
    rendererVersion: ARCHITECTURE_DOCS_RENDERER_VERSION,
    layoutVersion: ARCHITECTURE_DOCS_LAYOUT_VERSION,
    generatedFrom: provenance.generatedFrom,
  };
  const refreshSignals = array(data.refreshSignals).map((value) => value as ArchitectureRefreshSignalV1);
  const rejected = array(isRecord(data.drift) ? data.drift.diffs : data.rejected).filter(isRecord);
  const humanSignalNodes = refreshSignals.filter((signal) => signal.mode === 'human-action-required').flatMap((signal) => signal.affectedNodeIds);
  const adoptionRequired = rejected.some((entry) => entry.reasonCode === 'projection-adoption-required');
  const humanActions: ProjectionResultV1['humanActions'] = [];
  if (adoptionRequired) humanActions.push({ reasonCode: 'adoption-required', affectedNodeIds: [], requestPayloadDigest: digestProjectionJson(request) });
  if (humanSignalNodes.length > 0) humanActions.push({ reasonCode: 'unresolved-major-change', affectedNodeIds: unique(humanSignalNodes), requestPayloadDigest: digestProjectionJson(request) });
  const status = projectionStatus(request, data, adoptionRequired, humanSignalNodes.length > 0);
  const files = projectionFiles(data);
  const affectedNodeIds = unique([...humanSignalNodes, ...refreshSignals.flatMap((signal) => signal.affectedNodeIds)]);
  const withoutReceipt: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: PROJECTION_RESULT_VERSION,
    requestId: request.requestId,
    status,
    inputSnapshot: snapshot,
    outputSnapshot: snapshot,
    affectedNodeIds,
    files,
    humanActions,
    refreshSignals,
  };
  const receiptDigest = projectionResultReceiptDigest(withoutReceipt);
  return { ...withoutReceipt, refreshSignals: refreshSignals.map((signal) => ({ ...signal, projectionReceiptDigest: receiptDigest })), receiptDigest };
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
  const ignored = new Set(PROJECTION_WORKTREE_IGNORES);
  for (const path of architectureAgentContextTargets(root)) ignored.add(path);
  const files = listProjectionInputFiles(root, ignored).map((path) => {
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
      if (!path || ignored.has(entry.name) || ignored.has(path) || ignored.has(path.split('/')[0]!) || [...ignored].some((pattern) => path.startsWith(`${pattern}/`))) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(path);
    }
  }
}

function assertExpectedSnapshot(expected: ProjectionRequestV1['expected'], actual: ProjectionRequestV1['expected'], phase: string): void {
  for (const field of ['repositoryId', 'workspaceId', 'headSha', 'worktreeDigest'] as const) {
    if (expected[field] !== actual[field]) throw new Error(`architecture projection expected snapshot mismatch ${phase}: ${field}`);
  }
}

function projectionFiles(data: Record<string, unknown>): ProjectionResultV1['files'] {
  const drift = isRecord(data.drift) ? array(data.drift.diffs).filter(isRecord) : [];
  return drift.flatMap<ProjectionResultV1['files'][number]>((entry) => {
    const path = typeof entry.path === 'string' ? entry.path : null;
    if (!path) return [];
    const expected = digestOrNull(entry.expectedDigest);
    const actual = digestOrNull(entry.actualDigest);
    const reason = String(entry.reasonCode ?? '');
    if (reason === 'projection-file-missing' || reason === 'projection-manifest-missing') return expected ? [{ path, action: 'create' as const, preimageDigest: null, outputDigest: expected }] : [];
    if (reason === 'projection-orphaned') return actual ? [{ path, action: 'delete' as const, preimageDigest: actual, outputDigest: null }] : [];
    if (expected && actual && expected !== actual) return [{ path, action: 'update' as const, preimageDigest: actual, outputDigest: expected }];
    return [];
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function projectionStatus(request: ProjectionRequestV1, data: Record<string, unknown>, adoption: boolean, human: boolean): ProjectionResultV1['status'] {
  if (adoption) return 'adoption-required';
  if (human) return 'human-action-required';
  if (data.status === 'noop') return 'noop';
  if (request.mode === 'apply') return 'applied';
  const drift = isRecord(data.drift) ? data.drift : null;
  return drift?.ok === true ? 'noop' : 'planned';
}

function docsArgs(request: ProjectionRequestV1): string[] {
  const subcommand = request.mode === 'check' ? 'plan' : request.mode;
  const args = ['docs', subcommand, '--profile', 'repo-harness/v1', '--generated-at', new Date(0).toISOString(), '--task-session-id', request.requestId];
  if (request.mode === 'apply') args.push('--approved', '--expected-worktree-digest', request.expected.worktreeDigest);
  if (request.mode === 'adopt') args.push('--approved', '--adoption-plan-id', request.adoptionPlanId!, '--expected-worktree-digest', request.expected.worktreeDigest);
  return args;
}

function asProvenance(value: unknown): ArchctxProjectionProvenance {
  if (!isRecord(value)) throw new Error('archctx projection provenance is missing');
  const generated = value.generatedFrom;
  if (!isRecord(generated) || generated.codeGraphPackage !== '@colbymchenry/codegraph' || generated.codeGraphVersion !== '1.5.0' || (generated.codeGraphStatus !== 'ready' && generated.codeGraphStatus !== 'unavailable')) throw new Error('archctx CodeGraph provenance mismatch');
  const required = ['baseHeadSha', 'worktreeDigest', 'sourceTreeDigest', 'modelDigest', 'codeGraphDigest', 'projectionInputDigest', 'rendererVersion', 'layoutVersion'] as const;
  for (const field of required) if (typeof value[field] !== 'string') throw new Error(`archctx projection provenance.${field} is missing`);
  if (value.rendererVersion !== ARCHITECTURE_DOCS_RENDERER_VERSION || value.layoutVersion !== ARCHITECTURE_DOCS_LAYOUT_VERSION) throw new Error('archctx projection renderer/layout mismatch');
  const result = value as unknown as ArchctxProjectionProvenance;
  for (const digest of [result.worktreeDigest, result.sourceTreeDigest, result.modelDigest, result.codeGraphDigest, result.projectionInputDigest, generated.codeGraphBinaryDigest]) if (!digestOrNull(digest)) throw new Error('archctx projection provenance digest invalid');
  return { ...result, generatedFrom: generated as ProjectionSnapshotV1['generatedFrom'] };
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
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function unique(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
function digestOrNull(value: unknown): Sha256Digest | null { return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value) ? value as Sha256Digest : null; }
