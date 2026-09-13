import { loadArchitectureProjectionPolicy, readGlobalArchitectureConfiguration } from './projection-config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ARCHCONTEXT_NODE_RANGE } from 'archctx-contracts';
import { trustedNodeCandidates } from '../runtime/node-candidates';
import { runProcess } from '../process-runner';
import { capabilityRegistryFromArchcontextNodes, type ArchcontextNodeFile } from '../../core/capabilities/registry';
import {
  ARCHCTX_REQUIRED_VERSION,
  ARCHITECTURE_DOCS_LAYOUT_VERSION,
  ARCHITECTURE_DOCS_RENDERER_VERSION,
  assertArchctxCapabilities,
  assertProjectionResult,
  digestProjectionJson,
  projectionRequestIssues,
  sameAcceptedArchitectureChange,
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
  trustedNodeCandidateSource?: () => readonly string[];
  deadlineMs?: number;
  nowMs?: () => number;
  onDiagnostic?: (diagnostic: ArchitectureProjectionProviderDiagnostic) => void;
}

export type ProjectionSnapshotIdentityField = 'repositoryId' | 'workspaceId' | 'headSha' | 'worktreeDigest';

interface ProjectionInputFile { path: string; size: number; digest: string }
interface ProjectionSnapshotObservation {
  snapshot: ProjectionRequestV1['expected'];
  files: ProjectionInputFile[];
}

// Request-local diagnostic evidence stays off the wire and cannot outlive its snapshot.
const snapshotObservations = new WeakMap<ProjectionRequestV1['expected'], ProjectionSnapshotObservation>();

export type ArchitectureProjectionProviderDiagnostic =
  | {
      code: 'snapshot-drift';
      phase: 'before-provider' | 'after-provider';
      baseline: 'request-capture' | 'provider-entry' | 'unavailable';
      mismatchedFields: ProjectionSnapshotIdentityField[];
      expected: ProjectionRequestV1['expected'];
      actual: ProjectionRequestV1['expected'];
      changes: Array<{ path: string; change: 'added' | 'modified' | 'deleted'; before: Omit<ProjectionInputFile, 'path'> | null; after: Omit<ProjectionInputFile, 'path'> | null }> | null;
      totalChanges: number | null;
      truncated: boolean;
      message: string;
    }
  | {
      code: 'post-apply-reconciliation-required';
      status: 'applied-reconcile-required';
      applyId: string;
      lookupKey: string;
      mismatchedFields: ProjectionSnapshotIdentityField[];
      providerStderr: string | null;
      message: string;
    }
  | {
      code: 'apply-receipt-reconciled';
      status: 'applied' | 'noop';
      applyId: string;
      lookupKey: string;
      refreshDelivery: 'delivered' | 'already-consumed';
      message: string;
    };

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
  return { resolved, capabilities: assertArchctxCapabilities(value, policy.requiredVersion) };
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

export function runArchitectureProjection(request: ProjectionRequestV1, repoRoot: string, options: ArchctxProviderOptions = {}): ProjectionResultV1 {
  const requestIssues = projectionRequestIssues(request);
  if (requestIssues.length > 0) throw new Error(`invalid projection request: ${requestIssues.join('; ')}`);
  const policy = options.policy ?? loadArchitectureProjectionPolicy(options.env);
  if ((request.mode === 'apply' || request.mode === 'adopt') && policy.applyMode === 'disabled') throw new Error('architecture projection apply is disabled');
  const { resolved } = archctxCapabilities(repoRoot, { ...options, policy });
  const args = ['projection', 'run', '--request-json', JSON.stringify(request)];
  const before = captureProjectionSnapshotObservation(repoRoot);
  const captured = snapshotObservations.get(request.expected);
  const baseline = captured && snapshotMismatches(captured.snapshot, request.expected).length === 0 ? captured : undefined;
  reportSnapshotDrift(options, 'before-provider', request.expected, before, baseline);
  const processResult = runArchctxProcess(
    resolved,
    args,
    options,
    repoRoot,
    remainingTimeout(options, policy.timeoutMs, 'projection'),
  );
  const after = captureProjectionSnapshotObservation(repoRoot);
  reportSnapshotDrift(options, 'after-provider', before.snapshot, after, before);
  if (processResult.status !== 0 || processResult.signal || processResult.error) throw new Error(`archctx projection failed: ${processFailure(processResult)}`);
  const envelope = parseJson(processResult.stdout, 'archctx projection') as Record<string, unknown>;
  if (envelope.schemaVersion !== 'archcontext.envelope/v1' || envelope.ok !== true || !isRecord(envelope.data)) throw new Error(`archctx projection returned an invalid envelope: ${safeError(envelope)}`);
  const result = assertProjectionResult(envelope.data, request.requestId);
  const inputMismatches = snapshotMismatches(request.expected, result.inputSnapshot);
  const receiptDelivery = inputMismatches.length > 0 && isCorrelatedApplyReceiptDelivery(request, result);
  if (!receiptDelivery) assertExpectedSnapshot(request.expected, result.inputSnapshot, 'in provider result input');
  assertProjectionResultAuthority(request, result, repoRoot, policy, receiptDelivery);
  const actualSnapshot = after.snapshot;
  if (result.status === 'applied-reconcile-required') {
    const mismatchedFields = snapshotMismatches(result.outputSnapshot, actualSnapshot);
    const providerStderr = processResult.stderr.trim().slice(0, 600) || null;
    if (mismatchedFields.length === 0 && providerStderr === null) {
      throw new Error('archctx projection returned applied-reconcile-required without observable post-apply divergence');
    }
    const receipt = result.applyReceipt!;
    const reason = providerStderr ? `; provider: ${providerStderr.replace(/\s+/g, ' ')}` : '';
    emitProviderDiagnostic(options, {
      code: 'post-apply-reconciliation-required',
      status: result.status,
      applyId: receipt.applyId,
      lookupKey: receipt.lookupKey,
      mismatchedFields,
      providerStderr,
      message: `architecture projection apply committed but requires reconciliation; post-check mismatches: ${mismatchedFields.join(',') || 'provider-verification-error'}${reason}`,
    });
  } else if (receiptDelivery) {
    assertExpectedSnapshot(request.expected, actualSnapshot, 'after apply receipt reconciliation');
    const receipt = result.applyReceipt!;
    emitProviderDiagnostic(options, {
      code: 'apply-receipt-reconciled',
      status: result.status as 'applied' | 'noop',
      applyId: receipt.applyId,
      lookupKey: receipt.lookupKey,
      refreshDelivery: result.status === 'applied' ? 'delivered' : 'already-consumed',
      message: result.status === 'applied'
        ? 'architecture projection durable apply receipt reconciled; original refresh signals delivered'
        : 'architecture projection durable apply receipt already reconciled; refresh signals already consumed',
    });
  } else {
    assertExpectedSnapshot(result.outputSnapshot, actualSnapshot, 'after projection');
  }
  remainingTimeout(options, policy.timeoutMs, 'post-projection validation');
  if (result.inputSnapshot.rendererVersion !== ARCHITECTURE_DOCS_RENDERER_VERSION || result.outputSnapshot.rendererVersion !== ARCHITECTURE_DOCS_RENDERER_VERSION || result.inputSnapshot.layoutVersion !== ARCHITECTURE_DOCS_LAYOUT_VERSION || result.outputSnapshot.layoutVersion !== ARCHITECTURE_DOCS_LAYOUT_VERSION) throw new Error('archctx projection renderer/layout mismatch');
  return result;
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
  const observation = captureProjectionSnapshotObservation(repoRoot);
  const snapshot = { ...observation.snapshot };
  snapshotObservations.set(snapshot, observation);
  return snapshot;
}

function captureProjectionSnapshotObservation(repoRoot: string): ProjectionSnapshotObservation {
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
  const snapshot = {
    repositoryId: `repo.${createHash('sha256').update(root).digest('hex').slice(0, 16)}`,
    workspaceId: `workspace.${digestProjectionJson({ root }).replace(/^sha256:/, '').slice(0, 16)}`,
    headSha,
    worktreeDigest: digestProjectionJson(files),
  };
  return { snapshot, files };
}

function reportSnapshotDrift(
  options: ArchctxProviderOptions,
  phase: 'before-provider' | 'after-provider',
  expected: ProjectionRequestV1['expected'],
  actual: ProjectionSnapshotObservation,
  baseline?: ProjectionSnapshotObservation,
): void {
  const mismatchedFields = snapshotMismatches(expected, actual.snapshot);
  if (mismatchedFields.length === 0) return;
  const changes: Extract<ArchitectureProjectionProviderDiagnostic, { code: 'snapshot-drift' }>['changes'] = baseline ? [] : null;
  let totalChanges: number | null = baseline ? 0 : null;
  if (baseline && changes) {
    const before = new Map(baseline.files.map(({ path, ...file }) => [path, file]));
    const after = new Map(actual.files.map(({ path, ...file }) => [path, file]));
    for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const previous = before.get(path) ?? null;
      const current = after.get(path) ?? null;
      if (previous?.digest === current?.digest && previous?.size === current?.size) continue;
      totalChanges!++;
      if (changes.length < 20) changes.push({ path, change: previous === null ? 'added' : current === null ? 'deleted' : 'modified', before: previous, after: current });
    }
  }
  const detail = {
    phase,
    baseline: baseline ? phase === 'before-provider' ? 'request-capture' as const : 'provider-entry' as const : 'unavailable' as const,
    mismatchedFields,
    expected: { ...expected },
    actual: { ...actual.snapshot },
    changes,
    totalChanges,
    truncated: totalChanges !== null && totalChanges > (changes?.length ?? 0),
  };
  emitProviderDiagnostic(options, { code: 'snapshot-drift', ...detail, message: `snapshot drift ${JSON.stringify(detail)}` });
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
  receiptDelivery = false,
): void {
  if ((result.status === 'applied' || result.status === 'applied-reconcile-required') && request.mode !== 'apply' && request.mode !== 'adopt') {
    throw new Error(`archctx projection returned ${result.status} for non-mutating mode ${request.mode}`);
  }
  if ((result.status === 'applied' || result.status === 'applied-reconcile-required') && policy.applyMode === 'disabled') {
    throw new Error(`archctx projection returned ${result.status} while projection apply is disabled`);
  }
  if (!receiptDelivery && (result.outputSnapshot.worktreeDigest !== request.expected.worktreeDigest || result.outputSnapshot.headSha !== request.expected.headSha)) {
    throw new Error('archctx projection wrote outside the projection-owned fixed-point surfaces');
  }
  if (result.applyReceipt) {
    if (request.mode !== 'apply' || !request.acceptedChange) throw new Error('archctx projection apply receipt requires an accepted apply request');
    if (!sameAcceptedArchitectureChange(request.acceptedChange, result.applyReceipt.acceptedChange)) throw new Error('archctx projection apply receipt accepted change mismatch');
    if (result.applyReceipt.repositoryId !== request.expected.repositoryId || result.applyReceipt.workspaceId !== request.expected.workspaceId) throw new Error('archctx projection apply receipt repository/workspace mismatch');
  }
  const allowed = new Set<string>();
  if (request.targets.includes('architecture-docs')) allowed.add('docs/architecture');
  if (request.targets.includes('agent-context')) for (const path of architectureAgentContextTargets(repoRoot)) allowed.add(path);
  // A prior committed apply is the provider declaring an earlier attempt's commit under
  // this same requestId; it is not an applyReceipt, so it carries no accepted-change
  // requirement. It is held to the same target boundary as this attempt's own files.
  const writtenPaths = [
    ...result.files.map((file) => file.path),
    ...(result.priorCommittedApplies ?? []).flatMap((apply) => apply.files.map((file) => file.path)),
  ];
  for (const written of writtenPaths) {
    if (![...allowed].some((path) => written === path || written.startsWith(`${path}/`))) {
      throw new Error(`archctx projection result path escapes requested projection targets: ${written}`);
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

function assertExpectedSnapshot(expected: ProjectionRequestV1['expected'], actual: ProjectionRequestV1['expected'], phase: string): void {
  for (const field of snapshotMismatches(expected, actual)) {
    if (expected[field] !== actual[field]) throw new Error(`architecture projection expected snapshot mismatch ${phase}: ${field}`);
  }
}

function snapshotMismatches(expected: ProjectionRequestV1['expected'], actual: ProjectionRequestV1['expected']): ProjectionSnapshotIdentityField[] {
  return (['repositoryId', 'workspaceId', 'headSha', 'worktreeDigest'] as const).filter((field) => expected[field] !== actual[field]);
}

function isCorrelatedApplyReceiptDelivery(request: ProjectionRequestV1, result: ProjectionResultV1): boolean {
  return request.mode === 'apply'
    && request.acceptedChange !== undefined
    && result.applyReceipt !== undefined
    && (result.status === 'applied' || result.status === 'noop')
    && result.applyReceipt.repositoryId === request.expected.repositoryId
    && result.applyReceipt.workspaceId === request.expected.workspaceId
    && sameAcceptedArchitectureChange(request.acceptedChange, result.applyReceipt.acceptedChange);
}

function emitProviderDiagnostic(options: ArchctxProviderOptions, diagnostic: ArchitectureProjectionProviderDiagnostic): void {
  if (options.onDiagnostic) {
    options.onDiagnostic(diagnostic);
    return;
  }
  process.stderr.write(`[ArchitectureProjection] ${diagnostic.message}${diagnostic.code === 'post-apply-reconciliation-required' && diagnostic.providerStderr ? `; provider: ${diagnostic.providerStderr}` : ''}\n`);
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
function processFailure(result: ArchctxProcessResult): string { return result.error ?? (result.signal ? `signal ${result.signal}` : `exit ${result.status}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`); }
function safeError(value: Record<string, unknown>): string { return isRecord(value.error) && typeof value.error.message === 'string' ? value.error.message : 'unknown error'; }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
