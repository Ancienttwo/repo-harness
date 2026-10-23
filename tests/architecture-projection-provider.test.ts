import { afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PROJECTION_REQUEST_SCHEMA_VERSION,
  errorEnvelope,
  failureEnvelope,
  knownFailure,
  projectionApplyReadbackRequestFromReceipt,
  createProjectionApplyIdentity,
  digestJson,
  projectionApplyLookupKey,
  projectionResultInvariantIssues,
  projectionResultReceiptDigest,
  type ArchitectureRefreshSignalV1,
  type Json,
  type NativeContextExportV1,
  type ProjectionExpectedSnapshotV1,
  type ProjectionRequestV1,
  type ProjectionResultV2,
} from 'archctx-contracts';
import { ARCHCTX_REQUIRED_VERSION, decodeNativeContextExport, summarizeArchitectureRender, decodeArchitectureHandEdits, type NativeContextSource, type ArchitectureProjectionPolicy } from '../src/core/architecture/projection';
import {
  archctxCapabilities,
  ArchctxClientError,
  architectureProjectionRequest,
  verifyArchctxDaemonRuntime,
  inspectArchitectureProjectionReadiness,
  readArchitectureProjectionSnapshot,
  readArchitectureNativeContext,
  resolveCompatibleNodeRuntime,
  resolvePackageLocalArchctx,
  readArchitectureDocsAnchors,
  readArchitectureHandEdits,
  readArchitectureProjectionApply,
  runArchitectureProjection,
  stopWorkspaceArchitectureDaemons,
  type ArchctxProcessResult,
  type RunArchctxProcess,
} from '../src/effects/architecture/archctx-provider';
import { trustedNodeCandidates } from '../src/effects/runtime/node-candidates';
import { architectureProjectionExitCode, buildArchitectureProjectionCommand } from '../src/cli/commands/architecture-projection';
import { applyArchitectureProjection } from '../src/effects/architecture/projection-apply';
import { architectureWriterArgs } from '../src/effects/architecture/projection-writer';

const PACKAGE_ROOT = join(import.meta.dir, '..');
const CLI_ENTRY = join(PACKAGE_ROOT, 'src', 'cli', 'index.ts');
const roots: string[] = [];
const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as const;
const digestProjectionJson = (value: unknown) => digestJson(value as Json) as `sha256:${string}`;
const policy: ArchitectureProjectionPolicy = { provider: 'archctx', applyMode: 'manual', requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 120_000 };
// archctx owns the snapshot identity; the fake provider returns this literal.
const expectedSnapshot: ProjectionExpectedSnapshotV1 = {
  repositoryId: 'repo.0123456789abcdef', workspaceId: 'workspace.0123456789abcdef', headSha: 'a'.repeat(40), worktreeDigest: digest('1'),
};

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-archctx-provider-'));
  roots.push(root);
  const consumerRoot = join(root, 'consumer');
  const repoRoot = join(root, 'repo');
  const packageRoot = join(consumerRoot, 'node_modules', 'archctx');
  const binRoot = join(consumerRoot, 'node_modules', '.bin');
  mkdirSync(join(packageRoot, 'bin'), { recursive: true });
  mkdirSync(binRoot, { recursive: true });
  mkdirSync(join(repoRoot, '.ai', 'harness'), { recursive: true });
  mkdirSync(join(repoRoot, '.archcontext', 'model', 'nodes'), { recursive: true });
  mkdirSync(join(repoRoot, 'src', 'core'), { recursive: true });
  writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({ name: 'archctx', version: ARCHCTX_REQUIRED_VERSION, engines: { node: '>=22.22 <26' }, bin: { archctx: './bin/archctx' } })}\n`);
  const binary = join(packageRoot, 'bin', 'archctx');
  writeFileSync(binary, '#!/bin/sh\nexit 99\n');
  chmodSync(binary, 0o755);
  symlinkSync(join('..', 'archctx', 'bin', 'archctx'), join(binRoot, 'archctx'));
  writeFileSync(join(repoRoot, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    context: { capability_source: 'archcontext' },
    architecture: { projection_provider: 'archctx', projection_apply: 'manual', projection_version: ARCHCTX_REQUIRED_VERSION, projection_timeout_ms: 120000 },
  })}\n`);
  writeFileSync(join(repoRoot, '.archcontext', 'model', 'nodes', 'capability.test.core.yaml'), `schemaVersion: archcontext.node/v2
kind: capability
id: capability.test.core
name: Test Core
summary: Test projection identity.
responsibilities:
  - Own the test projection identity.
status: active
source:
  include:
    - src/core/**
extensions:
  lspProfile: ts
  verification: []
  contractFiles:
    agents: AGENTS.md
    claude: CLAUDE.md
`);
  writeFileSync(join(repoRoot, 'src', 'core', 'index.ts'), 'export const value = 1;\n');
  writeFileSync(join(repoRoot, 'AGENTS.md'), 'ignored projection output\n');
  writeFileSync(join(repoRoot, 'CLAUDE.md'), 'ignored projection output\n');
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'Repo Harness Test'], { cwd: repoRoot });
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoRoot, stdio: 'ignore' });
  return { root, consumerRoot, repoRoot, binary };
}

function vendorArchctx(root: string, version: string): string {
  const packageRoot = join(root, 'node_modules', 'archctx');
  mkdirSync(join(packageRoot, 'bin'), { recursive: true });
  writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({ name: 'archctx', version, engines: { node: '>=22.22 <26' }, bin: { archctx: './bin/archctx' } })}\n`);
  const binary = join(packageRoot, 'bin', 'archctx');
  writeFileSync(binary, '#!/bin/sh\nexit 99\n');
  chmodSync(binary, 0o755);
  return binary;
}

function capabilities(version = ARCHCTX_REQUIRED_VERSION) {
  return {
    schemaVersion: 'archcontext.capabilities/v1',
    package: { name: 'archctx', version },
    protocols: {
      projectionRequest: 'archcontext.projection-request/v1',
      projectionResult: 'archcontext.projection-result/v2',
      architectureRefreshSignal: 'archcontext.architecture-refresh-signal/v1',
    },
    renderers: { architectureDocs: 'archcontext.docs-renderer/v6', agentContext: 'archcontext.agent-context-renderer/v1' },
    features: ['architecture-docs-renderer-v2', 'architecture-refresh-signal-v1', 'projection-apply-receipt-v1', 'projection-prior-committed-applies-v1', 'projection-protocol-v2', 'projection-apply-readback-v1', 'projection-snapshot-v1'],
  };
}

function request(): ProjectionRequestV1 {
  return {
    schemaVersion: PROJECTION_REQUEST_SCHEMA_VERSION,
    requestId: 'request.axr5',
    profile: 'repo-harness/v1',
    mode: 'plan',
    targets: ['architecture-docs'],
    changedPaths: ['src/core/a.ts'],
    expected: { ...expectedSnapshot },
  };
}

function snapshotEnvelope(expected: ProjectionExpectedSnapshotV1 = expectedSnapshot) {
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.snapshot', data: { expected } };
}

const doctorEnvelope = (state = 'index-missing', issues: Array<{ code: string; message: string }> = []) => ({
  schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'doctor',
  data: { codeFacts: { schemaVersion: 'archcontext.repository-code-facts/v1', state, indexPresent: state !== 'index-missing', requiredVersion: '1.6.2', codeGraphVersion: '1.6.2', issues } },
});

/** Answers `projection snapshot` before the wrapped runner sees or records a call. */
function withSnapshot(run: RunArchctxProcess, snapshot: () => ProjectionExpectedSnapshotV1 = () => expectedSnapshot): RunArchctxProcess {
  return (binary, args, options) => args[0] === 'projection' && args[1] === 'snapshot'
    ? { status: 0, signal: null, stdout: JSON.stringify(snapshotEnvelope(snapshot())), stderr: '' }
    : run(binary, args, options);
}

function projectionEnvelope(expected: ProjectionRequestV1['expected']) {
  const snapshot = {
    ...expected,
    baseHeadSha: expected.headSha,
    sourceTreeDigest: digest('2'),
    modelDigest: digest('3'),
    codeGraphDigest: digest('4'),
    indexedWorktreeDigest: digest('1'),
    projectionInputDigest: digest('5'),
    rendererVersion: 'archcontext.docs-renderer/v6' as const,
    layoutVersion: 'archcontext.docs-layout/v1' as const,
    generatedFrom: { codeGraphPackage: '@colbymchenry/codegraph' as const, codeGraphVersion: '1.6.2' as const, codeGraphStatus: 'ready' as const },
  };
  const withoutReceipt = {
    schemaVersion: 'archcontext.projection-result/v2' as const,
    requestId: 'request.axr5',
    status: 'planned' as const,
    inputSnapshot: { ...snapshot },
    outputSnapshot: { ...snapshot },
    affectedNodeIds: [],
    files: [{ path: 'docs/architecture/index.md', action: 'create' as const, preimageDigest: null, outputDigest: digest('7') }],
    humanActions: [],
    refreshSignals: [],
  };
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.run', data: { ...withoutReceipt, receiptDigest: projectionResultReceiptDigest(withoutReceipt) } };
}

function applyEnvelope(
  requestId: string,
  originalExpected: ProjectionRequestV1['expected'],
  acceptedChange: NonNullable<ProjectionRequestV1['acceptedChange']>,
  status: 'applied-reconcile-required' | 'applied' | 'noop',
) {
  const snapshot = {
    ...originalExpected,
    baseHeadSha: originalExpected.headSha,
    sourceTreeDigest: digest('2'), modelDigest: digest('3'), codeGraphDigest: digest('4'), indexedWorktreeDigest: digest('1'), projectionInputDigest: digest('5'),
    rendererVersion: 'archcontext.docs-renderer/v6' as const,
    layoutVersion: 'archcontext.docs-layout/v1' as const,
    generatedFrom: { codeGraphPackage: '@colbymchenry/codegraph' as const, codeGraphVersion: '1.6.2' as const, codeGraphStatus: 'ready' as const },
  };
  const applyReceipt = {
    schemaVersion: 'archcontext.projection-apply-identity/v1' as const,
    applyId: digest('a'), lookupKey: digest('b'), repositoryId: originalExpected.repositoryId, workspaceId: originalExpected.workspaceId,
    acceptedChange,
    semanticCommit: { changeSetId: 'changeset.docs-projection-test', idempotencyKey: 'idem_changeset.docs-projection-test' },
    ownedFilesDigest: digest('c'), refreshSignalsDigest: digest('d'),
  };
  const signal: ArchitectureRefreshSignalV1 = {
    schemaVersion: 'archcontext.architecture-refresh-signal/v1', signalId: digest('e'), idempotencyKey: digest('f'), mode: 'refresh-required',
    repository: { repositoryId: originalExpected.repositoryId },
    worktree: { workspaceId: originalExpected.workspaceId, headSha: originalExpected.headSha, worktreeDigest: originalExpected.worktreeDigest },
    cause: 'accepted-semantic-delta', acceptedChange,
    reasonCodes: [...acceptedChange.reasonCodes], affectedNodeIds: [...acceptedChange.affectedNodeIds], refreshTargets: ['architecture-readiness'],
    baseDigests: { modelDigest: digest('0'), sourceTreeDigest: digest('1'), flowProofDigest: digest('2'), projectionDigest: digest('3') },
    resultingDigests: { modelDigest: digest('4'), sourceTreeDigest: digest('5'), flowProofDigest: digest('6'), projectionDigest: digest('7') },
    projectionReceiptDigest: digest('0'),
  };
  const withoutReceipt = {
    schemaVersion: 'archcontext.projection-result/v2' as const,
    requestId,
    status,
    inputSnapshot: snapshot,
    outputSnapshot: snapshot,
    affectedNodeIds: ['capability.test.core'],
    files: [{ path: 'docs/architecture/index.md', action: 'update' as const, preimageDigest: digest('8'), outputDigest: digestProjectionJson({ path: 'docs/architecture/index.md', body: 'committed projection\n' }) }],
    humanActions: [],
    refreshSignals: status === 'applied' ? [signal] : [],
    applyReceipt,
  };
  const receiptDigest = projectionResultReceiptDigest(withoutReceipt);
  const data = {
    ...withoutReceipt,
    refreshSignals: withoutReceipt.refreshSignals.map((entry) => ({ ...entry, projectionReceiptDigest: receiptDigest })),
    receiptDigest,
  };
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.run', data };
}

function committedApplyEnvelope(request: ProjectionRequestV1) {
  if (!request.acceptedChange) throw new Error('fixture requires acceptedChange');
  const original = applyEnvelope(request.requestId, request.expected, request.acceptedChange, 'applied').data;
  const identity = createProjectionApplyIdentity({
    repositoryId: request.expected.repositoryId,
    workspaceId: request.expected.workspaceId,
    acceptedChange: request.acceptedChange,
    changeSetId: original.applyReceipt.semanticCommit.changeSetId,
    idempotencyKey: original.applyReceipt.semanticCommit.idempotencyKey,
    files: original.files,
    refreshSignals: original.refreshSignals as unknown as Parameters<typeof createProjectionApplyIdentity>[0]['refreshSignals'],
  });
  const { receiptDigest: _old, ...body } = original;
  const receiptDigest = projectionResultReceiptDigest({ ...body, applyReceipt: identity });
  const data = {
    ...body,
    applyReceipt: identity,
    receiptDigest,
    refreshSignals: body.refreshSignals.map((signal) => ({ ...signal, projectionReceiptDigest: receiptDigest })),
  };
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.run', data };
}

function committedApplyReadback(request: ProjectionRequestV1, result: ReturnType<typeof committedApplyEnvelope>['data']) {
  const signal = result.refreshSignals[0]!;
  const resultingDigests = {
    modelDigest: signal.resultingDigests.modelDigest!,
    sourceTreeDigest: signal.resultingDigests.sourceTreeDigest!,
    flowProofDigest: signal.resultingDigests.flowProofDigest!,
    projectionDigest: signal.resultingDigests.projectionDigest!,
  };
  const ownedOutputDigest = digest('c');
  const recovery = {
    schemaVersion: 'archcontext.projection-apply-recovery-binding/v1' as const,
    targets: request.targets,
    changedPaths: request.changedPaths,
    originalExpectedSnapshot: request.expected,
    expectedResultingDigests: resultingDigests,
    rendererVersion: result.outputSnapshot.rendererVersion,
    layoutVersion: result.outputSnapshot.layoutVersion,
    generatedFrom: result.outputSnapshot.generatedFrom,
    ownedOutputDigest,
    receiptDigest: result.receiptDigest,
  };
  const body = {
    schemaVersion: 'archcontext.projection-apply-readback-result/v1' as const,
    requestId: request.requestId,
    requestDigest: digestProjectionJson(request),
    receipt: { schemaVersion: 'archcontext.projection-apply-receipt/v1' as const, identity: result.applyReceipt, result, recovery },
    current: { snapshot: result.outputSnapshot, resultingDigests, ownedOutputDigest, fixedPointDigest: digest('d') },
  };
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.readback', data: { ...body, readbackDigest: digestProjectionJson(body) } };
}

function absentApplyReadback(request: ProjectionRequestV1) {
  if (!request.acceptedChange) throw new Error('fixture requires acceptedChange');
  const body = {
    schemaVersion: 'archcontext.projection-apply-absence/v1' as const,
    requestId: request.requestId,
    requestDigest: digestProjectionJson(request),
    lookupKey: projectionApplyLookupKey({
      repositoryId: request.expected.repositoryId,
      workspaceId: request.expected.workspaceId,
      acceptedChange: request.acceptedChange,
    }),
    current: request.expected,
  };
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.readback',
    data: { ...body, absenceDigest: digestProjectionJson(body) } };
}

// Acceptance is producer data. The consumer sends only acceptObservedMajorChange.
function producerAcceptedRequest(request: ProjectionRequestV1): ProjectionRequestV1 {
  const { acceptObservedMajorChange: _flag, ...body } = request;
  return { ...body, acceptedChange: { changeSetId: 'changeset.producer-observed', eventId: 'event.producer-observed', reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.core'] } };
}

function writeAppliedOutputs(repoRoot: string): void {
  mkdirSync(join(repoRoot, 'docs/architecture'), { recursive: true });
  writeFileSync(join(repoRoot, 'docs/architecture/index.md'), 'committed projection\n');
}

function runner(calls: Array<{ binary: string; args: readonly string[] }>, docs: ReturnType<typeof projectionEnvelope>): RunArchctxProcess {
  return (binary, args): ArchctxProcessResult => {
    calls.push({ binary, args });
    return { status: 0, signal: null, stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : args[0] === 'doctor' ? doctorEnvelope() : args[0] === 'daemon' ? { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.status', data: { running: false } } : args[1] === 'snapshot' ? snapshotEnvelope() : docs), stderr: '' };
  };
}

// Recorded from archctx 0.7.2 projection run in an isolated HOME on this branch.
const codeFactsUnavailableEnvelope = {
  "schemaVersion": "archcontext.envelope/v1",
  "ok": false,
  "requestId": "projection.run",
  "error": {
    "code": "AC_CODE_FACTS_UNAVAILABLE",
    "severity": "error",
    "retryable": true,
    "action": "codegraph-init",
    "message": "code facts are required by .archcontext/manifest.yaml but unavailable (index-missing); run `codegraph init` and retry",
    "reasonCode": "index-missing"
  }
};

function projectionCli(f: ReturnType<typeof fixture>, envelope: unknown, requestId = 'request.axr5') {
  const applyPath = join(import.meta.dir, '../src/effects/architecture/projection-apply.ts');
  const cliPath = join(import.meta.dir, '../src/cli/commands/architecture-projection.ts');
  const script = join(f.root, 'cli-apply.ts');
  writeFileSync(script, `import { mock } from 'bun:test';
const { applyArchitectureProjection: actualApply } = await import(${JSON.stringify(applyPath)});
mock.module(${JSON.stringify(applyPath)}, () => ({ applyArchitectureProjection: (root, options) => actualApply(root, { ...options, consumerRoot: ${JSON.stringify(f.consumerRoot)}, policy: ${JSON.stringify(policy)}, run: (_bin, args) => ({status: 0, signal: null, stdout: JSON.stringify(args[0] === 'capabilities' ? ${JSON.stringify(capabilities())} : args[1] === 'snapshot' ? ${JSON.stringify(snapshotEnvelope())} : ${JSON.stringify(envelope)}), stderr: ''}) }) }));
const { buildArchitectureProjectionCommand } = await import(${JSON.stringify(cliPath)});
buildArchitectureProjectionCommand().parse(['apply', '--json', '--request-id', ${JSON.stringify(requestId)}], { from: 'user' });
`);
  return spawnSync(process.execPath, [script], { cwd: f.repoRoot, env: { ...process.env, HOME: f.root }, encoding: 'utf8', timeout: 10000 });
}

describe('native architecture context', () => {
  let exported: NativeContextExportV1;
  const commit = 'a'.repeat(40);

  beforeAll(() => {
    exported = readArchitectureNativeContext(join(import.meta.dir, '..'), { kind: 'worktree' });
  }, 30_000);

  function context(source: NativeContextSource): NativeContextExportV1 {
    const value = structuredClone(exported);
    value.snapshot = source.kind === 'ref'
      ? { source: 'ref', commitSha: source.commit, treeOid: 'b'.repeat(40), validation: 'immutable-tree' }
      : { source: 'worktree', headSha: commit, headTreeOid: 'b'.repeat(40), validation: 'stable-read' };
    return value;
  }

  function envelope(value: NativeContextExportV1): ArchctxProcessResult {
    return { status: 0, signal: null, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'export.native', data: value }), stderr: '' };
  }

  test('decodes a schema-valid worktree and a matching immutable ref', () => {
    for (const source of [{ kind: 'worktree' }, { kind: 'ref', commit }] as const) {
      const value = context(source);
      expect(decodeNativeContextExport(value, source)).toBe(value);
    }
  });

  test.each(['schema', 'profile', 'node schema', 'ref SHA', 'ref source', 'worktree source'])('rejects a native export with a mismatched %s', (kind) => {
    const source: NativeContextSource = kind.startsWith('ref') ? { kind: 'ref', commit } : { kind: 'worktree' };
    const value: Record<string, unknown> = { ...context(source) };
    if (kind === 'schema') value.schemaVersion = 'archcontext.native-context-export/v0';
    if (kind === 'profile') value.profile = 'other/v1';
    if (kind === 'node schema') delete (value.model as NativeContextExportV1['model']).nodes[0]!.summary;
    if (kind === 'ref SHA') value.snapshot = { source: 'ref', commitSha: 'c'.repeat(40), treeOid: 'b'.repeat(40), validation: 'immutable-tree' };
    if (kind === 'ref source') value.snapshot = context({ kind: 'worktree' }).snapshot;
    if (kind === 'worktree source') value.snapshot = context({ kind: 'ref', commit }).snapshot;
    let error: unknown;
    try { decodeNativeContextExport(value, source); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ArchctxClientError);
    expect(error).toMatchObject({ code: 'RH_ARCHCTX_NATIVE_CONTEXT_INVALID', action: 'update-repo-harness' });
  });

  test('preserves the registered strict native failure code and remedy', () => {
    const f = fixture();
    const failure = knownFailure('AC_MODEL_ADOPTION_REQUIRED', 'native-context-model-missing', { path: '.archcontext/manifest.yaml' });
    const run: RunArchctxProcess = () => ({ status: 1, signal: null, stdout: JSON.stringify(failureEnvelope('export.native', failure)), stderr: '' });
    let error: unknown;
    try { readArchitectureNativeContext(f.repoRoot, { kind: 'worktree' }, { consumerRoot: f.consumerRoot, run }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ArchctxClientError);
    expect(error).toMatchObject({ code: failure.code, action: failure.action, reasonCode: failure.reasonCode, details: failure.details });
  });

  test('refuses a strict native failure with unregistered field values', () => {
    const f = fixture();
    const failure = { ...knownFailure('AC_MODEL_ADOPTION_REQUIRED', 'native-context-model-missing'), message: 'unregistered message' };
    const run: RunArchctxProcess = () => ({ status: 1, signal: null, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: false, requestId: 'export.native', error: failure }), stderr: '' });
    expect(() => readArchitectureNativeContext(f.repoRoot, { kind: 'worktree' }, { consumerRoot: f.consumerRoot, run })).toThrow('invalid error envelope');
  });

  test('reuses one ref object by real repository path without a handshake', () => {
    const f = fixture();
    const calls: Array<{ args: readonly string[]; timeoutMs: number }> = [];
    const source = { kind: 'ref', commit } as const;
    const run: RunArchctxProcess = (_binary, args, options) => {
      calls.push({ args, timeoutMs: options.timeoutMs });
      return envelope(context(source));
    };
    const options = { consumerRoot: f.consumerRoot, run };
    const first = readArchitectureNativeContext(f.repoRoot, source, options);
    const alias = join(f.root, 'repo-alias');
    symlinkSync(f.repoRoot, alias, 'junction');
    expect(readArchitectureNativeContext(alias, source, options)).toBe(first);
    const frozenTree = (value: unknown): boolean => value === null || typeof value !== 'object'
      || Object.isFrozen(value) && Object.values(value).every(frozenTree);
    expect(frozenTree(readArchitectureNativeContext(alias, source, options))).toBe(true);
    expect(calls).toEqual([{ args: ['export', 'native', '--ref', commit, '--profile', 'repo-harness/v1', '--json'], timeoutMs: 30_000 }]);
    const other = fixture();
    expect(readArchitectureNativeContext(other.repoRoot, source, options)).not.toBe(first);
    expect(calls).toHaveLength(2);
  });

  test('keeps four refs and evicts the least recently read ref', () => {
    const f = fixture();
    const calls: string[] = [];
    const run: RunArchctxProcess = (_binary, args) => {
      const requested = args[args.indexOf('--ref') + 1]!;
      calls.push(requested);
      return envelope(context({ kind: 'ref', commit: requested }));
    };
    const read = (id: string) => readArchitectureNativeContext(f.repoRoot, { kind: 'ref', commit: id.repeat(40) }, { consumerRoot: f.consumerRoot, run });
    const first = read('1');
    read('2'); read('3'); read('4');
    expect(read('1')).toBe(first);
    read('5');
    expect(read('1')).toBe(first);
    read('2');
    expect(calls).toEqual(['1', '2', '3', '4', '5', '2'].map((id) => id.repeat(40)));
  });

  test('does not memoize worktree reads and uses the caller deadline', () => {
    const f = fixture();
    const calls: Array<{ args: readonly string[]; timeoutMs: number }> = [];
    const run: RunArchctxProcess = (_binary, args, options) => {
      calls.push({ args, timeoutMs: options.timeoutMs });
      return envelope(context({ kind: 'worktree' }));
    };
    const options = { consumerRoot: f.consumerRoot, run, nowMs: () => 1_000, deadlineMs: 2_250 };
    const first = readArchitectureNativeContext(f.repoRoot, { kind: 'worktree' }, options);
    expect(readArchitectureNativeContext(f.repoRoot, { kind: 'worktree' }, options)).not.toBe(first);
    expect(calls).toEqual(Array.from({ length: 2 }, () => ({ args: ['export', 'native', '--worktree', '--profile', 'repo-harness/v1', '--json'], timeoutMs: 1_250 })));
  });

  test('does not cache a failed ref decode', () => {
    const f = fixture();
    const source = { kind: 'ref', commit } as const;
    let calls = 0;
    const run: RunArchctxProcess = () => envelope(context(++calls === 1 ? { kind: 'worktree' } : source));
    const options = { consumerRoot: f.consumerRoot, run };
    expect(() => readArchitectureNativeContext(f.repoRoot, source, options)).toThrow(ArchctxClientError);
    const recovered = readArchitectureNativeContext(f.repoRoot, source, options);
    expect(readArchitectureNativeContext(f.repoRoot, source, options)).toBe(recovered);
    expect(calls).toBe(2);
  });

  test('doctor controls apply readiness even with a complete model', () => {
    const f = fixture();
    copyFileSync(join(import.meta.dir, '..', '.archcontext', 'manifest.yaml'), join(f.repoRoot, '.archcontext', 'manifest.yaml'));
    writeFileSync(join(f.repoRoot, '.archcontext', 'product.yaml'), 'name: fixture\n');
    for (const state of ['ready', 'not-ready'] as const) {
      const baseRun = runner([], projectionEnvelope(expectedSnapshot));
      const run: RunArchctxProcess = (binary, args, options) => {
        if (args[0] === 'export') return envelope(context({ kind: 'worktree' }));
        if (args[0] === 'doctor') return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(doctorEnvelope(state, state === 'ready' ? [] : [{ code: 'version-mismatch', message: 'CodeGraph repository status version mismatch' }])) };
        return baseRun(binary, args, options);
      };
      const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
      expect(readiness.projectionProvider.state).toBe('ready');
      expect(readiness.codeFacts.state).toBe(state);
      expect(readiness.apply.enabled).toBe(state === 'ready');
      expect(readiness.next).toBe(state === 'ready' ? null : 'codegraph index .');
    }
  });

  test.each(['typed', 'precondition', 'unexpected'])('readiness handles a %s export failure', (kind) => {
    const f = fixture();
    copyFileSync(join(import.meta.dir, '..', '.archcontext', 'manifest.yaml'), join(f.repoRoot, '.archcontext', 'manifest.yaml'));
    writeFileSync(join(f.repoRoot, '.archcontext', 'product.yaml'), 'name: fixture\n');
    const run: RunArchctxProcess = () => {
      if (kind === 'unexpected') throw new Error('export process failed');
      const failure = kind === 'typed'
        ? knownFailure('AC_SCHEMA_INVALID', 'native-context-model-invalid')
        : knownFailure('AC_PRECONDITION_FAILED', 'native-context-input-missing');
      return { status: 1, signal: null, stdout: JSON.stringify(failureEnvelope('export.native', failure)), stderr: '' };
    };
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run });
    expect(readiness.apply.enabled).toBe(false);
    if (kind === 'typed') {
      expect(readiness.projectionProvider.state).toBe('disabled');
      expect(readiness.next).toContain('Adopt ArchContext in a repository');
    } else {
      // A failure that is not a model fault keeps its own reason instead of the adoption step.
      expect(readiness.projectionProvider.state).toBe('error');
      expect(readiness.projectionProvider.reason).toContain(kind === 'unexpected' ? 'export process failed' : 'AC_PRECONDITION_FAILED');
      expect(readiness.next).not.toContain('Adopt ArchContext in a repository');
    }
  });
});

describe('package-local ArchContext projection provider', () => {
  test('apply accepts only the major change observed by one archctx call', () => {
    const f = fixture();
    const wireRequests: ProjectionRequestV1[] = [];
    const run: RunArchctxProcess = (_binary, args) => {
      if (args[0] === 'capabilities') return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      const wireRequest = JSON.parse(args[3]!) as ProjectionRequestV1;
      wireRequests.push(wireRequest);
      writeAppliedOutputs(f.repoRoot);
      return { status: 0, signal: null, stdout: JSON.stringify(committedApplyEnvelope(producerAcceptedRequest(wireRequest))), stderr: '' };
    };
    const result = applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: withSnapshot(run) });
    expect(result.status).toBe('applied');
    expect(wireRequests).toHaveLength(1);
    expect(wireRequests[0]!.acceptObservedMajorChange).toBe(true);
    expect(wireRequests[0]!.acceptedChange).toBeUndefined();
    expect(result.applyReceipt?.acceptedChange).toEqual(producerAcceptedRequest(wireRequests[0]!).acceptedChange!);
    expect(existsSync(join(f.repoRoot, '.ai/harness/architecture-projection'))).toBe(false);
  });

  test('a new snapshot has a new id and the same snapshot retries with the same id', () => {
    const f = fixture();
    const committedRequests = new Set<string>();
    let current = expectedSnapshot;
    const run: RunArchctxProcess = withSnapshot((_binary, args) => {
      if (args[0] === 'capabilities') return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      const wireRequest = JSON.parse(args[3]!) as ProjectionRequestV1;
      committedRequests.add(wireRequest.requestId);
      writeAppliedOutputs(f.repoRoot);
      return { status: 0, signal: null, stdout: JSON.stringify(committedApplyEnvelope(producerAcceptedRequest(wireRequest))), stderr: '' };
    }, () => current);
    expect(applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }).status).toBe('applied');
    expect(applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }).status).toBe('applied');
    expect(committedRequests.size).toBe(1);
    current = { ...expectedSnapshot, worktreeDigest: digest('9') };
    expect(applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }).status).toBe('applied');
    expect(committedRequests.size).toBe(2);
  });

  test('apply without a major change runs the provider once', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const docs = projectionEnvelope(expectedSnapshot);
    const run: RunArchctxProcess = withSnapshot((binary, args) => {
      calls.push({ binary, args });
      if (args[0] === 'capabilities') return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      const wireRequest = JSON.parse(args[3]!) as ProjectionRequestV1;
      const { receiptDigest: _previous, ...body } = docs.data;
      const noop = { ...body, requestId: wireRequest.requestId, status: 'noop' as const, files: [] };
      return { status: 0, signal: null, stdout: JSON.stringify({ ...docs, data: { ...noop, receiptDigest: projectionResultReceiptDigest(noop) } }), stderr: '' };
    });
    expect(applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }).status).toBe('noop');
    expect(calls.filter((call) => call.args[0] === 'projection')).toHaveLength(1);
  });

  test.each(['projection-accepted-change-committed', 'projection-apply-request-differs'])('typed committed error %s reads back unchanged but succeeds only for the accepted change', (reasonCode) => {
    const f = fixture();
    let applies = 0;
    let readbacks = 0;
    let committed: ReturnType<typeof committedApplyEnvelope>;
    let readbackRequest: ProjectionRequestV1;
    const run: RunArchctxProcess = withSnapshot((_binary, args) => {
      if (args[0] === 'capabilities') return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      const wireRequest = JSON.parse(args[3]!) as ProjectionRequestV1;
      if (args[1] === 'readback') {
        readbacks += 1;
        expect(args[3]).toBe(JSON.stringify(readbackRequest));
        return { status: 0, signal: null, stdout: JSON.stringify(committedApplyReadback(wireRequest, committed.data)), stderr: '' };
      }
      applies += 1;
      const accepted = producerAcceptedRequest(wireRequest);
      committed = committedApplyEnvelope(accepted);
      const receipt = committedApplyReadback(accepted, committed.data).data.receipt;
      readbackRequest = projectionApplyReadbackRequestFromReceipt(receipt)!;
      writeAppliedOutputs(f.repoRoot);
      return { status: 1, signal: null, stdout: JSON.stringify(errorEnvelope('projection.run', 'AC_PROJECTION_APPLY_COMMITTED',
        'this accepted change was already applied; send error.details.readbackRequest unchanged as the projection readback request', reasonCode,
        { requestId: accepted.requestId, lookupKey: committed.data.applyReceipt.lookupKey, applyId: committed.data.applyReceipt.applyId, readbackRequest: readbackRequest as unknown as Json })), stderr: '' };
    });
    if (reasonCode === 'projection-accepted-change-committed') {
      const result = applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
      expect(result).toEqual(committed!.data);
    } else {
      let error: unknown;
      try { applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(ArchctxClientError);
      expect(error).toMatchObject({ code: 'AC_PROJECTION_APPLY_COMMITTED', reasonCode: 'projection-apply-request-differs' });
    }
    expect(applies).toBe(1);
    expect(readbacks).toBe(1);
  });

  test('the complete recorded code-facts envelope preserves the remedy and typed reason', () => {
    const f = fixture();
    const run: RunArchctxProcess = (_binary, args) => ({ status: args[0] === 'capabilities' ? 0 : 1, signal: null,
      stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : codeFactsUnavailableEnvelope, null, 2), stderr: 'short stderr' });
    let error: unknown;
    try { runArchitectureProjection(request(), f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ArchctxClientError);
    expect(error).toMatchObject({ code: 'AC_CODE_FACTS_UNAVAILABLE', action: 'codegraph-init', reasonCode: 'index-missing', retryable: true });
    expect((error as Error).message).toContain('run `codegraph init` and retry');
  });

  test('prose cannot authorize readback and oversized typed details fail closed', () => {
    const f = fixture();
    let readbacks = 0;
    for (const response of [
      { stdout: '', stderr: 'AC_PRECONDITION_FAILED: committed projection receipt requires recovery' },
      { stdout: JSON.stringify(errorEnvelope('projection.run', 'AC_PROJECTION_APPLY_COMMITTED', 'committed', 'projection-accepted-change-committed', { readbackRequest: { oversized: 'x'.repeat(256 * 1024) } })), stderr: '' },
    ]) {
      const run: RunArchctxProcess = withSnapshot((_binary, args) => args[0] === 'capabilities'
        ? { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' }
        : { status: 1, signal: null, ...response });
      expect(() => applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run, runReadback: () => { readbacks++; throw new Error('must not read back'); } })).toThrow();
    }
    expect(readbacks).toBe(0);
  });

  test('a second capability edit cannot be rebound by a second apply request', () => {
    const f = fixture();
    const wireRequests: ProjectionRequestV1[] = [];
    let current = expectedSnapshot;
    const run: RunArchctxProcess = withSnapshot((_binary, args) => {
      if (args[0] === 'capabilities') return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      const wireRequest = JSON.parse(args[3]!) as ProjectionRequestV1;
      wireRequests.push(wireRequest);
      // A second capability edit lands after the snapshot read; archctx re-checks the request snapshot.
      current = { ...expectedSnapshot, worktreeDigest: digest('9') };
      expect(wireRequest.expected).toEqual(expectedSnapshot);
      return { status: 1, signal: null, stdout: JSON.stringify(errorEnvelope('projection.run', 'AC_PRECONDITION_FAILED', 'expected snapshot mismatch: worktreeDigest', 'expected-snapshot-mismatch')), stderr: '' };
    }, () => current);
    expect(() => applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run })).toThrow('expected snapshot mismatch');
    expect(wireRequests).toHaveLength(1);
    expect(wireRequests[0]!.acceptedChange).toBeUndefined();
    expect(existsSync(join(f.repoRoot, 'docs/architecture/index.md'))).toBe(false);
  });

  test('declined-unprovable-proof reaches the CLI with the debt report next step', () => {
    const f = fixture();
    // Recorded from a real archctx 0.8.0 single-request apply (acceptObservedMajorChange) in a disposable repository.
    const declined = JSON.parse(readFileSync(join(import.meta.dir, 'fixtures/architecture-projection/declined-unprovable-proof-0.8.0.json'), 'utf8')) as ProjectionResultV2;
    expect(projectionResultInvariantIssues(declined)).toEqual([]);
    const result = projectionCli(f, { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.run', data: declined }, declined.requestId);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).majorChangeAcceptance).toBe('declined-unprovable-proof');
    expect(result.stderr).toContain('next: repo-harness architecture-debt --json');
    expect(result.stderr).not.toMatch(/next: archctx /);
  });

  test('a timeout reports outcome unknown and the same id without the request JSON', () => {
    const f = fixture();
    const run: RunArchctxProcess = withSnapshot((_binary, args) => args[0] === 'capabilities'
      ? { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' }
      : { status: 1, signal: 'SIGTERM', stdout: '', stderr: '', timedOut: true, error: 'process timed out: --request-json secret-payload' });
    let message = '';
    try { applyArchitectureProjection(f.repoRoot, { consumerRoot: f.consumerRoot, policy, requestId: 'same.retry.id', run }); }
    catch (error) { message = (error as Error).message; }
    expect(message).toContain('outcome unknown');
    expect(message).toContain('check --json');
    expect(message).toContain('--request-id same.retry.id');
    expect(message).not.toContain('--request-json');
    expect(message).not.toContain('secret-payload');
  });

  test('reviewed worktree digest binds apply before any projection run', () => {
    const f = fixture();
    const calls: string[][] = [];
    let current = expectedSnapshot;
    const options = { consumerRoot: f.consumerRoot, policy, run: withSnapshot((_binary, args) => { calls.push([...args]); throw new Error('must not run'); }, () => current) };
    const planned = architectureProjectionRequest('plan', f.repoRoot, options);
    expect(planned.expected).toEqual(expectedSnapshot);
    const apply = architectureProjectionRequest('apply', f.repoRoot, { ...options, expectedWorktreeDigest: planned.expected.worktreeDigest });
    expect(apply.expected).toEqual(planned.expected);
    current = { ...expectedSnapshot, worktreeDigest: digest('9') };
    expect(() => applyArchitectureProjection(f.repoRoot, { ...options, expectedWorktreeDigest: planned.expected.worktreeDigest })).toThrow('worktree differs from the reviewed plan');
    expect(calls).toEqual([]);
    for (const mode of ['apply', 'adopt']) expect(buildArchitectureProjectionCommand().commands.find((command) => command.name() === mode)!.options.map((option) => option.long)).toContain('--expected-worktree-digest');
  });

  test('a projection run manifest-incompatible envelope throws its typed code and reason', () => {
    const f = fixture();
    const failure = failureEnvelope('projection.run', knownFailure('AC_PRECONDITION_FAILED', 'projection-manifest-incompatible'));
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const run: RunArchctxProcess = (binary, args) => {
      calls.push({ binary, args });
      return args[0] === 'capabilities' ? { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' } : args[1] === 'snapshot' ? { status: 0, signal: null, stdout: JSON.stringify(snapshotEnvelope()), stderr: '' } : { status: 1, signal: null, stdout: JSON.stringify(failure), stderr: '' };
    };
    const options = { consumerRoot: f.consumerRoot, policy, run };
    let error: unknown;
    try { runArchitectureProjection(architectureProjectionRequest('check', f.repoRoot, options), f.repoRoot, options); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ArchctxClientError);
    expect(error).toMatchObject({ code: 'AC_PRECONDITION_FAILED', action: failure.error.action, reasonCode: 'projection-manifest-incompatible' });
    expect(calls.some((call) => call.args[0] === 'projection' && call.args[1] === 'run')).toBe(true);
  });

  test('readiness reports missing policy and incompatible daemon as typed states', () => {
    const f = fixture();
    const options = { consumerRoot: f.consumerRoot, policy, run: runner([], projectionEnvelope(expectedSnapshot)) };
    rmSync(join(f.repoRoot, '.ai/harness/policy.json'));
    const missing = inspectArchitectureProjectionReadiness(f.repoRoot, options);
    expect(missing.modelAuthority.source).toBe('unadopted');
    expect(missing.projectionProvider.state).toBe('missing');
    expect(missing.projectionProvider.reason).toContain('run repo-harness init');
    writeFileSync(join(f.repoRoot, '.ai/harness/policy.json'), JSON.stringify({ context: { capability_source: 'archcontext' } }));
    const run: RunArchctxProcess = (_bin, args) => ({ status: 0, signal: null, stderr: '', stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : {
      schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.status', data: { running: true, versionUnsupported: { reason: 'product-version-mismatch', expected: ARCHCTX_REQUIRED_VERSION, received: '0.6.3', action: 'upgrade-archctx-runtime', command: 'archctx daemon upgrade' } },
    }) });
    const mismatch = inspectArchitectureProjectionReadiness(f.repoRoot, { ...options, run });
    expect(mismatch.projectionProvider.state).toBe('mismatch');
    expect(mismatch.daemonRuntime.state).toBe('mismatch');
    expect(mismatch.apply.enabled).toBe(false);
  });

  test('readiness maps doctor not-ready and issues to code facts and the fix', () => {
    const f = fixture();
    mkdirSync(join(f.repoRoot, '.codegraph'));
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const baseRun = runner(calls, projectionEnvelope(expectedSnapshot));
    const issues = [{ code: 'version-mismatch', message: 'CodeGraph repository status version mismatch' }];
    const run: RunArchctxProcess = (binary, args, options) => {
      if (args[0] !== 'doctor') return baseRun(binary, args, options);
      calls.push({ binary, args });
      return { status: 0, signal: null, stdout: JSON.stringify(doctorEnvelope('not-ready', issues)), stderr: '' };
    };
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    expect(readiness.projectionProvider.state).toBe('ready');
    expect(readiness.codeFacts).toEqual({ requirement: 'required', state: 'not-ready', issues });
    expect(readiness.apply.enabled).toBe(false);
    expect(readiness.next).toBe('codegraph index .');
    expect(calls.map(({ args }) => args[0])).toEqual(['capabilities', 'daemon', 'doctor']);
  });

  test('readiness keeps doctor failures closed and preserves unavailable diagnostics', () => {
    const f = fixture();
    const baseRun = runner([], projectionEnvelope(expectedSnapshot));
    let doctor = doctorEnvelope('unknown') as unknown;
    const run: RunArchctxProcess = (binary, args, options) => args[0] === 'doctor'
      ? { status: 0, signal: null, stderr: '', stdout: JSON.stringify(doctor) }
      : baseRun(binary, args, options);
    const options = { consumerRoot: f.consumerRoot, policy, run };
    const invalid = inspectArchitectureProjectionReadiness(f.repoRoot, options);
    expect(invalid.projectionProvider.state).toBe('error');
    expect(invalid.projectionProvider.reason).toContain('RH_ARCHCTX_DOCTOR_INVALID');
    expect(invalid.apply.enabled).toBe(false);
    const facts = { schemaVersion: 'archcontext.repository-code-facts/v1', state: 'unavailable' as const, requiredVersion: '1.6.2', reasonCode: 'codegraph-unavailable', message: 'CodeGraph binary is unavailable' };
    doctor = { ...doctorEnvelope(), data: { codeFacts: facts } };
    const unavailable = inspectArchitectureProjectionReadiness(f.repoRoot, options);
    expect(unavailable.codeFacts).toEqual({ requirement: 'required', state: facts.state, issues: [], reasonCode: facts.reasonCode, message: facts.message });
    expect(unavailable.apply.enabled).toBe(false);
    expect(unavailable.next).toBe('repo-harness update');
  });

  test('a ready doctor keeps the adoption step for an incomplete model', () => {
    const f = fixture();
    const baseRun = runner([], projectionEnvelope(expectedSnapshot));
    const run: RunArchctxProcess = (binary, args, options) => args[0] === 'doctor'
      ? { status: 0, signal: null, stderr: '', stdout: JSON.stringify(doctorEnvelope('ready')) }
      : baseRun(binary, args, options);
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    expect(readiness.codeFacts.state).toBe('ready');
    expect(readiness.apply.enabled).toBe(false);
    const reference = /in (\/.+worker\.md)\.$/.exec(readiness.next!)?.[1];
    expect(realpathSync(reference!)).toBe(realpathSync(join(import.meta.dir, '..', 'assets', 'skill-commands', 'repo-harness-architecture', 'references', 'worker.md')));
    expect(readFileSync(reference!, 'utf8')).toContain('## Adopt ArchContext in a repository');
  });

  describe('committed projection manifest compatibility', () => {
    const withManifest = (f: ReturnType<typeof fixture>, contents: string) => {
      mkdirSync(join(f.repoRoot, 'docs', 'architecture'), { recursive: true });
      writeFileSync(join(f.repoRoot, 'docs', 'architecture', '.projection-manifest.json'), contents);
    };
    const manifest = (floor: string) => JSON.stringify({
      schemaVersion: 'archcontext.architecture-docs-projection-manifest/v3',
      rendererVersion: 'archcontext.docs-renderer/v6',
      minimumRendererVersion: floor,
      profile: 'repo-harness/v1',
    });
    const readiness = (f: ReturnType<typeof fixture>) => {
      // A fixed fake Node runtime keeps the result independent of the Node on the test machine.
      const fakeBin = join(f.root, 'bin');
      mkdirSync(fakeBin, { recursive: true });
      const node = join(fakeBin, 'node');
      writeFileSync(node, '#!/bin/sh\necho v24.1.0\n');
      chmodSync(node, 0o755);
      return inspectArchitectureProjectionReadiness(f.repoRoot, {
        consumerRoot: f.consumerRoot, policy, env: { PATH: fakeBin }, trustedNodeCandidateSource: () => [], run: runner([], projectionEnvelope(expectedSnapshot)),
      });
    };

    test('a renderer floor newer than the installed archctx is not ready and keeps apply disabled', () => {
      const f = fixture();
      withManifest(f, manifest('archcontext.docs-renderer/v7'));
      const result = readiness(f);
      expect(result.projectionProvider.state).toBe('mismatch');
      expect(result.projectionProvider.reasonCode).toBe('projection-manifest-incompatible');
      expect(result.projectionProvider.reason).toContain('minimumRendererVersion is unsupported by this engine');
      expect(result.apply.enabled).toBe(false);
    });

    test('a floor the installed archctx meets stays ready', () => {
      const f = fixture();
      withManifest(f, manifest('archcontext.docs-renderer/v6'));
      expect(readiness(f).projectionProvider.state).toBe('ready');
    });

    test('a malformed committed manifest fails closed', () => {
      const f = fixture();
      withManifest(f, '{not json');
      const result = readiness(f);
      expect(result.projectionProvider.state).toBe('error');
      expect(result.projectionProvider.reason).toContain('is not valid JSON');
      expect(result.apply.enabled).toBe(false);
    });
  });

  describe('closeout architecture daemon stop', () => {
    const worktree = '/private/tmp/repo-harness-wt-closed';
    const listing = (daemons: unknown[]) => ({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.list', data: { stateRoot: '/state', daemons } });
    const entry = (stateDir: string, root: string | undefined, connection = 'valid') => ({ storageRepositoryId: 'repo.0000000000000001', storageWorkspaceId: 'ws.0000000000000001', stateDir, connectionPath: `${stateDir}/archctxd.json`, connection, ...(root === undefined ? {} : { root, rootExists: false, pid: 1, pidAlive: true }) });
    const daemons = [entry('/state/closed', worktree), entry('/state/other', '/private/tmp/repo-harness-wt-other'), entry('/state/orphan', undefined, 'invalid')];

    test('stops only the daemon whose listed root is the removed checkout, by state directory', () => {
      const f = fixture();
      const calls: Array<{ args: readonly string[]; cwd: string }> = [];
      const run: RunArchctxProcess = (_binary, args, options) => {
        calls.push({ args, cwd: options.cwd });
        return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(args[1] === 'list' ? listing(daemons) : { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.stop', data: { stopping: true } }) };
      };
      expect(stopWorkspaceArchitectureDaemons(f.repoRoot, worktree, { consumerRoot: f.consumerRoot, policy, run })).toEqual({
        schemaVersion: 'repo-harness.architecture-daemon-stop/v1', worktree, provider: 'archctx', stopped: ['/state/closed'], failures: [],
      });
      expect(calls).toEqual([
        { args: ['daemon', 'list', '--json'], cwd: f.repoRoot },
        { args: ['daemon', 'stop', '--state-dir', '/state/closed', '--json'], cwd: f.repoRoot },
      ]);
    });

    test('a disabled provider reports disabled and never resolves or runs archctx', () => {
      const run: RunArchctxProcess = () => { throw new Error('must not run'); };
      expect(stopWorkspaceArchitectureDaemons('/missing-repo', worktree, { consumerRoot: '/missing-consumer', policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run })).toEqual({
        schemaVersion: 'repo-harness.architecture-daemon-stop/v1', worktree, provider: 'disabled', stopped: [], failures: [],
      });
    });

    test('typed stop and listing failures are reported with their archctx fields', () => {
      const f = fixture();
      const unavailable = errorEnvelope('daemon.stop', 'AC_RUNTIME_UNAVAILABLE', 'No archctxd connection file found in /state/closed');
      const stopFailed: RunArchctxProcess = (_binary, args) => args[1] === 'list'
        ? { status: 0, signal: null, stderr: '', stdout: JSON.stringify(listing(daemons)) }
        : { status: 1, signal: null, stderr: '', stdout: JSON.stringify(unavailable) };
      expect(stopWorkspaceArchitectureDaemons(f.repoRoot, worktree, { consumerRoot: f.consumerRoot, policy, run: stopFailed }).failures).toEqual([
        { stateDir: '/state/closed', code: 'AC_RUNTIME_UNAVAILABLE', action: 'start-or-reconnect-runtime', retryable: true, message: 'No archctxd connection file found in /state/closed' },
      ]);
      const listFailed: RunArchctxProcess = () => ({ status: 1, signal: null, stderr: '', stdout: JSON.stringify(errorEnvelope('daemon.list', 'AC_RUNTIME_UNAVAILABLE', 'state root unreadable')) });
      const report = stopWorkspaceArchitectureDaemons(f.repoRoot, worktree, { consumerRoot: f.consumerRoot, policy, run: listFailed });
      expect(report.stopped).toEqual([]);
      expect(report.failures).toEqual([{ stateDir: null, code: 'AC_RUNTIME_UNAVAILABLE', action: 'start-or-reconnect-runtime', retryable: true, message: 'state root unreadable' }]);
    });

    test('an invalid stop envelope fails closed instead of counting as stopped', () => {
      const f = fixture();
      const run: RunArchctxProcess = (_binary, args) => ({ status: 0, signal: null, stderr: '', stdout: JSON.stringify(args[1] === 'list' ? listing(daemons) : { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.stop', data: {} }) });
      expect(() => stopWorkspaceArchitectureDaemons(f.repoRoot, worktree, { consumerRoot: f.consumerRoot, policy, run })).toThrow('archctx daemon stop returned an invalid envelope');
    });
  });

  test('rejects a re-digested readback whose current output proof differs from the committed receipt', () => {
    const f = fixture();
    const accepted = request();
    accepted.mode = 'apply';
    accepted.acceptedChange = {
      changeSetId: 'changeset.docs-projection-readback-proof', eventId: 'event.readback-proof',
      reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.core'],
    };
    const committed = committedApplyEnvelope(accepted);
    const forged = committedApplyReadback(accepted, committed.data);
    forged.data.current.ownedOutputDigest = digest('e');
    const { readbackDigest: _old, ...body } = forged.data;
    forged.data.readbackDigest = digestProjectionJson(body);
    const run: RunArchctxProcess = (_binary, args) => ({
      status: 0, signal: null,
      stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : forged), stderr: '',
    });
    expect(() => readArchitectureProjectionApply(accepted, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }))
      .toThrow('readback current state differs from committed recovery binding');
    const absent: RunArchctxProcess = (_binary, args) => ({
      status: 0, signal: null,
      stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : absentApplyReadback(accepted)), stderr: '',
    });
    expect(() => readArchitectureProjectionApply(accepted, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: absent }))
      .toThrow('no committed projection apply exists for request.axr5');
  });

  test('bounds a real provider process tree whose descendant keeps captured pipes open', () => {
    const f = fixture();
    // Include runtime selection and startup so the provider reaches its descendant
    // before the timeout exercises process-tree cleanup. Selection has its own test.
    const providerBudgetMs = 2_000;
    const descendantPidPath = join(f.root, 'descendant.pid');
    const node = resolveCompatibleNodeRuntime(process.env);
    writeFileSync(f.binary, [
      "const { spawn } = require('node:child_process');",
      "const { writeFileSync } = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: ['ignore', 'inherit', 'inherit'] });",
      "writeFileSync(process.env.ARCHCTX_DESCENDANT_PID_PATH, String(child.pid));",
      "setInterval(() => {}, 1000);",
      '',
    ].join('\n'));
    const providerModule = join(import.meta.dir, '..', 'src', 'effects', 'architecture', 'archctx-provider.ts');
    const script = join(f.root, 'provider-timeout.ts');
    writeFileSync(script, [
      `import { archctxCapabilities } from ${JSON.stringify(providerModule)};`,
      `const started = Date.now();`,
      `try {`,
      `  archctxCapabilities(${JSON.stringify(f.repoRoot)}, { consumerRoot: ${JSON.stringify(f.consumerRoot)}, policy: { provider: 'archctx', applyMode: 'manual', requiredVersion: '${ARCHCTX_REQUIRED_VERSION}', timeoutMs: ${providerBudgetMs} }, env: { ...process.env, REPO_HARNESS_NODE_BIN: ${JSON.stringify(node)}, ARCHCTX_DESCENDANT_PID_PATH: ${JSON.stringify(descendantPidPath)} }, deadlineMs: Date.now() + ${providerBudgetMs} });`,
      `  process.exitCode = 2;`,
      `} catch (error) {`,
      `  console.error(String(error));`,
      `  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);`,
      `  const pid = Number((await import('node:fs')).readFileSync(${JSON.stringify(descendantPidPath)}, 'utf8'));`,
      `  let descendantAlive = true;`,
      `  try { process.kill(pid, 0); } catch { descendantAlive = false; }`,
      `  if (descendantAlive) try { process.kill(pid, 'SIGKILL'); } catch { descendantAlive = false; }`,
      `  console.log(String(error));`,
      `  console.log('descendant_alive=' + descendantAlive);`,
      `  console.log('elapsed=' + (Date.now() - started));`,
      `}`,
      '',
    ].join('\n'));
    const result = spawnSync(process.execPath, [script], { cwd: f.repoRoot, encoding: 'utf8', timeout: 4_000, killSignal: 'SIGKILL' });
    expect((result.error as NodeJS.ErrnoException | undefined)?.code).not.toBe('ETIMEDOUT');
    if (result.status !== 0) throw new Error(`provider timeout fixture failed: ${result.stderr || result.stdout}`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('descendant_alive=false');
  });

  test('charges Node runtime selection to the caller deadline', () => {
    const f = fixture();
    const slowNode = join(f.root, 'slow-node');
    writeFileSync(slowNode, '#!/bin/sh\n/bin/sleep 2\necho v24.18.0\n');
    chmodSync(slowNode, 0o755);
    const providerModule = join(import.meta.dir, '..', 'src', 'effects', 'architecture', 'archctx-provider.ts');
    const script = join(f.root, 'node-deadline.ts');
    writeFileSync(script, [
      `import { resolveCompatibleNodeRuntime } from ${JSON.stringify(providerModule)};`,
      `try {`,
      `  resolveCompatibleNodeRuntime({ PATH: '', REPO_HARNESS_NODE_BIN: ${JSON.stringify(slowNode)} }, () => [], { deadlineMs: Date.now() + 100 });`,
      `  process.exitCode = 2;`,
      `} catch (error) { console.log(String(error)); }`,
      '',
    ].join('\n'));
    const result = spawnSync(process.execPath, [script], { cwd: f.repoRoot, encoding: 'utf8', timeout: 4_000, killSignal: 'SIGKILL' });
    expect((result.error as NodeJS.ErrnoException | undefined)?.code).not.toBe('ETIMEDOUT');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('architecture projection timeout before Node runtime selection');
  });

  test('exposes projection commands without a separate acceptance authority', () => {
    const command = buildArchitectureProjectionCommand();
    expect(command.commands.map((entry) => entry.name())).toEqual(['policy', 'status', 'check', 'plan', 'apply', 'adopt', 'anchors', 'render-check', 'hand-edits', 'publish']);
    for (const name of ['check', 'plan', 'apply', 'adopt', 'publish']) {
      const subcommand = command.commands.find((candidate) => candidate.name() === name);
      expect(subcommand!.options.map((option) => option.long)).not.toContain('--accepted-change-set-id');
      expect(subcommand!.options.map((option) => option.long)).not.toContain('--approval-reference');
    }
    // The rolling target and the acceptance flag are fixed in architectureWriterArgs.
    expect(command.commands.find((candidate) => candidate.name() === 'publish')!.options).toEqual([]);
  });

  test('writer delegates a fixed rolling target and loop to archctx with explicit state', () => {
    const status = architectureWriterArgs('status', '/tmp/writer-state');
    expect(status).toEqual(['projection', 'publish-status', '--remote', 'origin', '--base', 'main', '--json']);
    expect(status).not.toContain('--accept-observed-major-change');
    const once = architectureWriterArgs('once', '/tmp/writer-state');
    expect(once).toEqual(['projection', 'publish', '--remote', 'origin', '--base', 'main', '--branch', 'archctx/projection', '--publisher', 'gh', '--accept-observed-major-change', '--json']);
    expect(architectureWriterArgs('follow', '/tmp/writer-state')).toEqual([...once.slice(0, -1), '--follow', '--interval', '300', '--json']);
    expect(() => architectureWriterArgs('once', undefined)).toThrow('ARCHCONTEXT_STATE_DIR');
    expect(() => architectureWriterArgs('once', 'relative')).toThrow('absolute');
    expect(() => architectureWriterArgs('push-main', '/tmp/writer-state')).toThrow('Usage');
  });

  test('publish status runs the package-local archctx writer status in the target repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-harness-publish-'));
    roots.push(root);
    const [home, stateDir] = ['home', 'state'].map((name) => join(root, name));
    for (const dir of [home, stateDir]) mkdirSync(dir);
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, ARCHCONTEXT_STATE_DIR: stateDir };
    const git = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd, env, stdio: 'ignore' });
    const repository = (name: string) => {
      const repo = join(root, name);
      mkdirSync(repo);
      git(root, ['init', '-q', '--bare', `${repo}.git`]);
      git(repo, ['init', '-q', '-b', 'main']);
      git(repo, ['commit', '-q', '--allow-empty', '-m', name]);
      git(repo, ['remote', 'add', 'origin', `${repo}.git`]);
      git(repo, ['push', '-q', 'origin', 'main']);
      return repo;
    };
    const repo = repository('repo');
    const other = repository('other');

    const cli = spawnSync(process.execPath, [CLI_ENTRY, 'architecture-projection', 'publish', 'status'], { cwd: repo, env, encoding: 'utf8', timeout: 60_000 });
    expect(cli.status, cli.stderr).toBe(0);
    const published = JSON.parse(cli.stdout) as { ok: boolean; data: { schemaVersion: string; remote: string; base: string; worktreePath: string } };
    expect(published.ok).toBe(true);
    expect(published.data).toMatchObject({ schemaVersion: 'archcontext.projection-publish-status/v1', remote: 'origin', base: 'main' });
    expect([stateDir, realpathSync(stateDir)].some((dir) => published.data.worktreePath.startsWith(join(dir, 'repositories')))).toBe(true);

    // archctx derives the writer repository id from its cwd: the direct run from the target repo matches, one from another repo does not.
    const archctx = resolvePackageLocalArchctx(PACKAGE_ROOT);
    const direct = (cwd: string) => JSON.parse(execFileSync(resolveCompatibleNodeRuntime(env), [archctx.binaryPath, ...architectureWriterArgs('status', stateDir)], { cwd, env, encoding: 'utf8' })) as unknown;
    expect(published).toEqual(direct(repo) as never);
    expect(published).not.toEqual(direct(other) as never);
  });

  test.each([
    ['no state dir', undefined, 'status', 'ARCHCONTEXT_STATE_DIR must be an explicit absolute path'],
    ['a relative state dir', 'writer-state', 'status', 'ARCHCONTEXT_STATE_DIR must be an explicit absolute path'],
    ['an unknown mode', '/tmp/repo-harness-unused-writer-state', 'push-main', 'Usage: repo-harness architecture-projection publish <status|once|follow>'],
  ])('publish refuses %s before it resolves archctx', (_case, stateDir, mode, message) => {
    const cwd = mkdtempSync(join(tmpdir(), 'repo-harness-publish-refusal-'));
    roots.push(cwd);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd, stdio: 'ignore' });
    const env: NodeJS.ProcessEnv = { ...process.env, HOME: cwd };
    delete env.ARCHCONTEXT_STATE_DIR;
    if (stateDir) env.ARCHCONTEXT_STATE_DIR = stateDir;
    const result = spawnSync(process.execPath, [CLI_ENTRY, 'architecture-projection', 'publish', mode], { cwd, env, encoding: 'utf8', timeout: 60_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stdout).toBe('');
    expect(existsSync(join(cwd, 'writer-state'))).toBe(false);
    expect(existsSync('/tmp/repo-harness-unused-writer-state')).toBe(false);
  });

  test('docs anchors runs read-only archctx docs anchors after the handshake and decodes its report', () => {
    const f = fixture();
    const calls: Array<readonly string[]> = [];
    const report = {
      schemaVersion: 'archcontext.docs-anchors/v1', profile: 'repo-harness/v1', codeGraph: { availability: 'ready' },
      summary: { nodes: 1, documents: 1, citations: 1, findings: 1, unchecked: 0, byKind: { 'line-moved': 0, 'line-out-of-range': 0, 'missing-path': 0, 'missing-symbol': 1, 'unknown-selector': 0 } },
      nodes: [{ nodeId: 'capability.test.core', documentPath: 'docs/architecture/modules/test/core.md', citationCount: 1,
        findings: [{ kind: 'missing-symbol', origin: { kind: 'document', path: 'docs/architecture/modules/test/core.md', line: 3 }, citation: { text: 'index.ts#gone', path: 'index.ts', symbol: 'gone' } }], unchecked: [] }],
    };
    const run = (data: unknown): RunArchctxProcess => (_binary, args) => {
      calls.push(args);
      return { status: 0, signal: null, stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'docs.anchors', data }), stderr: '' };
    };
    const worktreeState = () => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: f.repoRoot, encoding: 'utf8' });
    const before = worktreeState();
    expect(readArchitectureDocsAnchors(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: run(report) })).toEqual(report as never);
    expect(calls).toEqual([['capabilities', '--json'], ['docs', 'anchors', '--json']]);
    expect(worktreeState()).toBe(before);
    expect(() => readArchitectureDocsAnchors(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: run({ ...report, summary: { ...report.summary, findings: 0 } }) }))
      .toThrow('docs anchors report invalid');
    expect(() => readArchitectureDocsAnchors(f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run: run(report) }))
      .toThrow('architecture projection provider is disabled');
  });

  test('manual command exit status distinguishes clean/planned from human and failure outcomes', () => {
    expect(architectureProjectionExitCode('check', 'noop')).toBe(0);
    expect(architectureProjectionExitCode('check', 'planned')).toBe(1);
    expect(architectureProjectionExitCode('plan', 'planned')).toBe(0);
    expect(architectureProjectionExitCode('apply', 'applied')).toBe(0);
    expect(architectureProjectionExitCode('adopt', 'applied')).toBe(0);
    expect(architectureProjectionExitCode('check', 'applied')).toBe(1);
    expect(architectureProjectionExitCode('plan', 'applied')).toBe(1);
    for (const status of ['adoption-required', 'human-action-required', 'blocked', 'retryable-failure', 'permanent-failure']) {
      expect(architectureProjectionExitCode('plan', status)).toBe(1);
    }
  });
  test('resolves only the package-local exact version and never PATH', () => {
    const f = fixture();
    const resolved = resolvePackageLocalArchctx(f.consumerRoot);
    expect(resolved.binaryPath).toBe(realpathSync(f.binary));
    writeFileSync(join(f.consumerRoot, 'node_modules', 'archctx', 'package.json'), '{"name":"archctx","version":"0.3.0"}\n');
    expect(() => resolvePackageLocalArchctx(f.consumerRoot)).toThrow(`expected archctx@${ARCHCTX_REQUIRED_VERSION}`);
  });

  test('resolves a hoisted package from an installed repo-harness package root', () => {
    const f = fixture();
    const installedHarnessRoot = join(f.consumerRoot, 'node_modules', 'repo-harness');
    mkdirSync(installedHarnessRoot, { recursive: true });
    expect(resolvePackageLocalArchctx(installedHarnessRoot).binaryPath).toBe(realpathSync(f.binary));
  });

  test.each(['0.0.1', ARCHCTX_REQUIRED_VERSION])('runtime provider is not overridden by target archctx@%s', (version) => {
    const f = fixture();
    const repoBinary = vendorArchctx(f.repoRoot, version);
    const before = readFileSync(join(f.repoRoot, 'node_modules', 'archctx', 'package.json'), 'utf8');
    const calls: string[] = [];
    const handshake = archctxCapabilities(f.repoRoot, {
      policy,
      run: (binary) => {
        calls.push(binary);
        return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      },
    });
    expect(handshake.resolved.packageRoot).toBe(realpathSync(join(import.meta.dir, '..', 'node_modules', 'archctx')));
    expect(handshake.resolved.binaryPath).not.toBe(realpathSync(repoBinary));
    expect(calls).toEqual([handshake.resolved.binaryPath]);
    expect(handshake.resolved.version).toBe(ARCHCTX_REQUIRED_VERSION);
    expect(readFileSync(join(f.repoRoot, 'node_modules', 'archctx', 'package.json'), 'utf8')).toBe(before);
  });

  test('fails closed on a mismatching runtime provider even when the target has a valid copy', () => {
    const f = fixture();
    vendorArchctx(f.repoRoot, ARCHCTX_REQUIRED_VERSION);
    vendorArchctx(f.consumerRoot, '0.0.1');
    expect(() => archctxCapabilities(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: () => ({ status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' }) }))
      .toThrow(`expected archctx@${ARCHCTX_REQUIRED_VERSION}, got archctx@0.0.1 (resolved from consumer root ${f.consumerRoot})`);
  });

  test('status CLI uses its runtime provider for a repository with stale local archctx', () => {
    const f = fixture();
    vendorArchctx(f.repoRoot, '0.0.1');
    const home = join(f.root, 'home');
    mkdirSync(join(home, '.repo-harness'), { recursive: true });
    writeFileSync(join(home, '.repo-harness', 'config.json'), JSON.stringify({
      architecture: { projection_provider: 'archctx', projection_apply: 'manual' },
    }));
    const output = execFileSync(process.execPath, [
      join(import.meta.dir, '..', 'src', 'cli', 'index.ts'), 'architecture-projection', 'status', '--json',
    ], { cwd: f.repoRoot, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 10_000 });
    const readiness = JSON.parse(output);
    expect(readiness.projectionProvider.state).toBe('ready');
    expect(readiness.codeFacts.state).toBe('index-missing');
    expect(readiness.projectionProvider.version).toBe(ARCHCTX_REQUIRED_VERSION);
    expect(readiness.projectionProvider.binaryPath).toBe(resolvePackageLocalArchctx(join(import.meta.dir, '..')).binaryPath);
    expect(JSON.parse(readFileSync(join(f.repoRoot, 'node_modules', 'archctx', 'package.json'), 'utf8')).version).toBe('0.0.1');
    // The guides run "$NODE" "$ARCHCTX" from this field, so it must run as given.
    const [node, archctx] = readiness.projectionProvider.command;
    expect(readiness.projectionProvider.command).toEqual([readiness.projectionProvider.nodePath, readiness.projectionProvider.binaryPath]);
    const handshake = JSON.parse(execFileSync(node, [archctx, 'capabilities', '--json'], { cwd: f.repoRoot, encoding: 'utf8', timeout: 10_000 }));
    expect(handshake.package.version).toBe(ARCHCTX_REQUIRED_VERSION);
    // Code facts must be ready before the model adoption step becomes the next action.
    expect(readiness.next).toBe('codegraph init -y .');
  });

  test('fails closed when the provider reports another package version', () => {
    const f = fixture();
    expect(() => archctxCapabilities(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: () => ({ status: 0, signal: null, stdout: JSON.stringify(capabilities('0.6.2')), stderr: '' }) }))
      .toThrow(`expected archctx@${ARCHCTX_REQUIRED_VERSION}, got archctx@0.6.2`);
  });

  test('resolves from the running CLI package root when the target repo vendors no archctx', () => {
    const f = fixture();
    const handshake = archctxCapabilities(f.repoRoot, { policy, run: () => ({ status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' }) });
    expect(handshake.resolved.version).toBe(ARCHCTX_REQUIRED_VERSION);
    expect(handshake.resolved.packageRoot).toBe(realpathSync(join(import.meta.dir, '..', 'node_modules', 'archctx')));
  });

  test('disabled readiness performs zero subprocess calls', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run: runner(calls, projectionEnvelope(expectedSnapshot)) });
    expect(readiness.projectionProvider.state).toBe('disabled');
    expect(calls).toHaveLength(0);
  });

  test('does not enable apply for a partial model that lacks manifest and product authority', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    // Readiness now resolves the Node runtime for its command field. A fixed fake
    // runtime keeps the result independent of the Node on the test machine.
    const fakeBin = join(f.root, 'bin');
    mkdirSync(fakeBin, { recursive: true });
    const node = join(fakeBin, 'node');
    writeFileSync(node, '#!/bin/sh\necho v24.1.0\n');
    chmodSync(node, 0o755);
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, {
      consumerRoot: f.consumerRoot,
      policy,
      env: { PATH: fakeBin },
      trustedNodeCandidateSource: () => [],
      run: runner(calls, projectionEnvelope(expectedSnapshot)),
    });
    expect(readiness.projectionProvider.state).toBe('ready');
    expect(readiness.codeFacts.state).toBe('index-missing');
    expect(readiness.projectionProvider.command).toEqual([realpathSync(node), resolvePackageLocalArchctx(f.consumerRoot).binaryPath]);
    expect(readiness.modelAuthority.ready).toBe(true);
    expect(readiness.apply.enabled).toBe(false);
    expect(readiness.next).toBe('codegraph init -y .');
  });

  test('keeps the adoption step until the capability loader accepts the model', () => {
    const f = fixture();
    copyFileSync(join(import.meta.dir, '..', '.archcontext', 'manifest.yaml'), join(f.repoRoot, '.archcontext', 'manifest.yaml'));
    writeFileSync(join(f.repoRoot, '.archcontext', 'product.yaml'), 'name: fixture\n');
    const nodes = join(f.repoRoot, '.archcontext', 'model', 'nodes');
    const inspect = () => inspectArchitectureProjectionReadiness(f.repoRoot, { policy: { ...policy, provider: 'disabled', applyMode: 'disabled' } });
    // A valid manifest and capability export leave no adoption step.
    expect(inspect().next).toBeNull();
    // An uncommitted node deletion is a worktree precondition fault, not an unadopted model.
    rmSync(join(nodes, 'capability.test.core.yaml'));
    expect(inspect()).toMatchObject({ projectionProvider: { state: 'error' } });
    expect(inspect().projectionProvider.reason).toContain('AC_PRECONDITION_FAILED');
    // Empty nodes directory after the deletion is committed.
    execFileSync('git', ['add', '-A'], { cwd: f.repoRoot });
    execFileSync('git', ['commit', '-q', '-m', 'remove nodes'], { cwd: f.repoRoot });
    expect(inspect().next).toContain('Adopt ArchContext in a repository');
    // Only the sample node that `archctx init` writes; it has no responsibilities.
    writeFileSync(join(nodes, 'capability.architecture.context.yaml'), [
      'id: "capability.architecture.context"',
      'kind: "capability"',
      'name: "Architecture Context"',
      'schemaVersion: "archcontext.node/v2"',
      'status: "active"',
      'summary: "Keeps product and architecture intent available to coding agents."',
      '',
    ].join('\n'));
    expect(inspect().next).toContain('Adopt ArchContext in a repository');
  });

  test('fails closed when neither PATH nor the trusted candidates carry a compatible Node runtime', () => {
    const f = fixture();
    const fakeBin = join(f.root, 'bin');
    mkdirSync(fakeBin, { recursive: true });
    const node = join(fakeBin, 'node');
    writeFileSync(node, '#!/bin/sh\necho v22.21.0\n');
    chmodSync(node, 0o755);
    const pathOnlyEnv: NodeJS.ProcessEnv = { ...process.env, PATH: fakeBin };
    // An exported runtime authority must not rescue this failure mode.
    delete pathOnlyEnv.REPO_HARNESS_NODE_BIN;
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, {
      consumerRoot: f.consumerRoot,
      policy,
      env: pathOnlyEnv,
      trustedNodeCandidateSource: () => [],
    });
    expect(readiness.projectionProvider.state).toBe('error');
    expect(readiness.projectionProvider.reason).toContain('requires Node >=22.22 <26');
    expect(readiness.projectionProvider.reason).toContain('trusted candidates ((none))');
  });

  test('a disabled provider still reports a missing Node runtime when it reads the model', () => {
    const f = fixture();
    copyFileSync(join(import.meta.dir, '..', '.archcontext', 'manifest.yaml'), join(f.repoRoot, '.archcontext', 'manifest.yaml'));
    writeFileSync(join(f.repoRoot, '.archcontext', 'product.yaml'), 'name: fixture\n');
    const fakeBin = join(f.root, 'bin');
    mkdirSync(fakeBin, { recursive: true });
    const node = join(fakeBin, 'node');
    writeFileSync(node, '#!/bin/sh\necho v22.21.0\n');
    chmodSync(node, 0o755);
    const pathOnlyEnv: NodeJS.ProcessEnv = { ...process.env, PATH: fakeBin };
    delete pathOnlyEnv.REPO_HARNESS_NODE_BIN;
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, {
      consumerRoot: f.consumerRoot,
      policy: { ...policy, provider: 'disabled', applyMode: 'disabled' },
      env: pathOnlyEnv,
      trustedNodeCandidateSource: () => [],
    });
    // Model reads need archctx even when projection is disabled; the runtime fault is not hidden as "not adopted".
    expect(readiness.projectionProvider).toMatchObject({ provider: 'disabled', state: 'error' });
    expect(readiness.projectionProvider.reason).toContain('requires Node >=22.22 <26');
    expect(readiness.apply.enabled).toBe(false);
  });

  test('enumerates fixed system paths then sorted nvm versions in the shared trusted-candidate scan', () => {
    const f = fixture();
    const home = join(f.root, 'home');
    const nvmRoot = join(home, '.nvm', 'versions', 'node');
    for (const version of ['v20.11.0', 'v24.18.0']) {
      mkdirSync(join(nvmRoot, version, 'bin'), { recursive: true });
      const binary = join(nvmRoot, version, 'bin', 'node');
      writeFileSync(binary, `#!/bin/sh\necho ${version}\n`);
      chmodSync(binary, 0o755);
    }
    const candidates = trustedNodeCandidates(home);
    expect(candidates.slice(0, 3)).toEqual(['/usr/bin/node', '/usr/local/bin/node', '/opt/homebrew/bin/node']);
    expect(candidates.filter((candidate) => candidate.startsWith(home))).toEqual([
      join(home, '.local', 'bin', 'node'),
      join(nvmRoot, 'v20.11.0', 'bin', 'node'),
      join(nvmRoot, 'v24.18.0', 'bin', 'node'),
    ]);
  });

  test('enumerates versioned Homebrew keg symlinks after home-scoped candidates in numeric order', () => {
    if (process.platform === 'win32') return;
    const f = fixture();
    const home = join(f.root, 'home');
    const nvmNode = join(home, '.nvm', 'versions', 'node', 'v20.11.0', 'bin', 'node');
    mkdirSync(join(nvmNode, '..'), { recursive: true });
    const prefix = join(f.root, 'homebrew');
    mkdirSync(join(prefix, 'opt'), { recursive: true });
    for (const name of ['node@24', 'node@20', 'node', 'node@24-old', 'nodejs@24']) {
      const kegRoot = join(prefix, 'Cellar', name, 'test-version');
      mkdirSync(join(kegRoot, 'bin'), { recursive: true });
      const node = join(kegRoot, 'bin', 'node');
      writeFileSync(node, `#!/bin/sh\necho v${name === 'node@20' ? '20.11.0' : '24.21.0'}\n`);
      chmodSync(node, 0o755);
      symlinkSync(kegRoot, join(prefix, 'opt', name));
    }
    const candidates = trustedNodeCandidates(home, [prefix]);
    expect(candidates.slice(3, 7)).toEqual([
      join(home, '.local', 'bin', 'node'),
      nvmNode,
      join(prefix, 'opt', 'node@20', 'bin', 'node'),
      join(prefix, 'opt', 'node@24', 'bin', 'node'),
    ]);
    expect(candidates.filter((candidate) => candidate.startsWith(`${prefix}/`))).toEqual([
      join(prefix, 'opt', 'node@20', 'bin', 'node'),
      join(prefix, 'opt', 'node@24', 'bin', 'node'),
    ]);
  });

  test('resolves a scrubbed-env Node runtime through a Homebrew keg real path', () => {
    if (process.platform === 'win32') return;
    const f = fixture();
    const fakeBin = join(f.root, 'bin');
    mkdirSync(fakeBin, { recursive: true });
    writeFileSync(join(fakeBin, 'node'), '#!/bin/sh\necho v26.10.0\n');
    chmodSync(join(fakeBin, 'node'), 0o755);
    const prefix = join(f.root, 'homebrew');
    mkdirSync(join(prefix, 'opt'), { recursive: true });
    for (const major of [20, 24]) {
      const kegRoot = join(prefix, 'Cellar', `node@${major}`, `${major}.21.0`);
      mkdirSync(join(kegRoot, 'bin'), { recursive: true });
      writeFileSync(join(kegRoot, 'bin', 'node'), `#!/bin/sh\necho v${major}.21.0\n`);
      chmodSync(join(kegRoot, 'bin', 'node'), 0o755);
      symlinkSync(kegRoot, join(prefix, 'opt', `node@${major}`));
    }
    const home = join(f.root, 'home');
    const scrubbedEnv: NodeJS.ProcessEnv = { PATH: fakeBin, HOME: home };
    const scoped = () => trustedNodeCandidates(home, [prefix])
      .filter((candidate) => candidate.startsWith(`${f.root}/`));
    expect(resolveCompatibleNodeRuntime(scrubbedEnv, scoped))
      .toBe(realpathSync(join(prefix, 'opt', 'node@24', 'bin', 'node')));
  });

  test('resolves a scrubbed-env Node runtime through the shared nvm scan when PATH has none', () => {
    const f = fixture();
    const fakeBin = join(f.root, 'bin');
    mkdirSync(fakeBin, { recursive: true });
    const incompatiblePathNode = join(fakeBin, 'node');
    writeFileSync(incompatiblePathNode, '#!/bin/sh\necho v22.21.0\n');
    chmodSync(incompatiblePathNode, 0o755);
    const home = join(f.root, 'home');
    const nvmRoot = join(home, '.nvm', 'versions', 'node');
    for (const version of ['v20.11.0', 'v22.22.0', 'v24.18.0']) {
      mkdirSync(join(nvmRoot, version, 'bin'), { recursive: true });
      const binary = join(nvmRoot, version, 'bin', 'node');
      writeFileSync(binary, `#!/bin/sh\necho ${version}\n`);
      chmodSync(binary, 0o755);
    }
    // The scrubbed bounded-verifier shape: REPO_HARNESS_NODE_BIN stripped whole.
    const scrubbedEnv: NodeJS.ProcessEnv = { PATH: fakeBin, HOME: home };
    const scoped = () => trustedNodeCandidates(home).filter((candidate) => candidate.startsWith(`${home}/`));
    expect(resolveCompatibleNodeRuntime(scrubbedEnv, scoped))
      .toBe(realpathSync(join(nvmRoot, 'v22.22.0', 'bin', 'node')));
  });

  test('applies the archctx Node range to trusted candidates and reports every scanned source', () => {
    const f = fixture();
    const fakeBin = join(f.root, 'bin');
    mkdirSync(fakeBin, { recursive: true });
    const incompatiblePathNode = join(fakeBin, 'node');
    writeFileSync(incompatiblePathNode, '#!/bin/sh\necho v22.21.0\n');
    chmodSync(incompatiblePathNode, 0o755);
    const home = join(f.root, 'home');
    const nvmRoot = join(home, '.nvm', 'versions', 'node');
    mkdirSync(join(nvmRoot, 'v20.11.0', 'bin'), { recursive: true });
    const staleNode = join(nvmRoot, 'v20.11.0', 'bin', 'node');
    writeFileSync(staleNode, '#!/bin/sh\necho v20.11.0\n');
    chmodSync(staleNode, 0o755);
    const scrubbedEnv: NodeJS.ProcessEnv = { PATH: fakeBin, HOME: home };
    const scoped = () => trustedNodeCandidates(home).filter((candidate) => candidate.startsWith(`${home}/`));
    expect(() => resolveCompatibleNodeRuntime(scrubbedEnv, scoped)).toThrow(/requires Node >=22.22 <26/);
    expect(() => resolveCompatibleNodeRuntime(scrubbedEnv, scoped)).toThrow(/REPO_HARNESS_NODE_BIN \(unset\)/);
    expect(() => resolveCompatibleNodeRuntime(scrubbedEnv, scoped)).toThrow(new RegExp(`PATH \\(${fakeBin}\\)`));
    expect(() => resolveCompatibleNodeRuntime(scrubbedEnv, scoped)).toThrow(new RegExp(`trusted candidates \\(${join(home, '.local', 'bin', 'node')}, ${staleNode}\\)`));
  });

  test('rejects Node 22.21 and uses the protected helper exact Node 22.22 authority without widening PATH', () => {
    const f = fixture();
    const fakeBin = join(f.root, 'protected-node');
    mkdirSync(fakeBin, { recursive: true });
    const staleNode = join(fakeBin, 'node-22.21');
    writeFileSync(staleNode, '#!/bin/sh\necho v22.21.0\n');
    chmodSync(staleNode, 0o755);
    expect(() => resolveCompatibleNodeRuntime({ PATH: '/usr/bin:/bin', REPO_HARNESS_NODE_BIN: staleNode }))
      .toThrow('must satisfy Node >=22.22 <26');
    const node = join(fakeBin, 'node-22.22');
    writeFileSync(node, '#!/bin/sh\necho v22.22.0\n');
    chmodSync(node, 0o755);
    expect(resolveCompatibleNodeRuntime({ PATH: '/usr/bin:/bin', REPO_HARNESS_NODE_BIN: node })).toBe(realpathSync(node));
    expect(() => resolveCompatibleNodeRuntime({ PATH: '/usr/bin:/bin', REPO_HARNESS_NODE_BIN: 'node' })).toThrow('must be an absolute path');
  });

  test('handshakes capabilities then maps a validated projection result', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const projectionRequest = request();
    projectionRequest.acceptedChange = {
      changeSetId: 'changeset.add-capability',
      eventId: 'event.user-accepted',
      reasonCodes: ['node-added', 'ownership-changed'],
      affectedNodeIds: ['capability.runtime', 'capability.workflow'],
    };
    const result = runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner(calls, projectionEnvelope(projectionRequest.expected)), env: { ...process.env, PATH: join(f.root, 'conflicting-path') } });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.binary === realpathSync(f.binary))).toBe(true);
    expect(calls[0]!.args).toEqual(['capabilities', '--json']);
    expect(calls[1]!.args.slice(0, 3)).toEqual(['projection', 'run', '--request-json']);
    expect(JSON.parse(calls[1]!.args[3]!)).toEqual(projectionRequest);
    expect(result.status).toBe('planned');
    expect(result.files).toEqual([{ path: 'docs/architecture/index.md', action: 'create', preimageDigest: null, outputDigest: digest('7') }]);
    expect(projectionResultInvariantIssues(result)).toEqual([]);
    const { receiptDigest, ...payload } = result;
    expect(receiptDigest).toBe(projectionResultReceiptDigest(payload));
  });

  test('reads the expected snapshot from archctx projection snapshot without a handshake', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    expect(readArchitectureProjectionSnapshot(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner(calls, projectionEnvelope(expectedSnapshot)) })).toEqual(expectedSnapshot);
    expect(calls).toEqual([{ binary: realpathSync(f.binary), args: ['projection', 'snapshot', '--json'] }]);
  });

  test('a snapshot error envelope throws its typed code, action and reason', () => {
    const f = fixture();
    const failure = failureEnvelope('projection.snapshot', knownFailure('AC_REPO_NOT_FOUND', 'git-worktree-required'));
    const run: RunArchctxProcess = () => ({ status: 1, signal: null, stdout: JSON.stringify(failure), stderr: '' });
    let error: unknown;
    try { readArchitectureProjectionSnapshot(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(ArchctxClientError);
    expect(error).toMatchObject({ code: 'AC_REPO_NOT_FOUND', action: failure.error.action, reasonCode: 'git-worktree-required' });
  });

  test('a malformed snapshot fails closed with a typed error', () => {
    const f = fixture();
    const { worktreeDigest: _digest, ...missingDigest } = expectedSnapshot;
    const malformed: unknown[] = [
      { ...snapshotEnvelope(), requestId: 'projection.run' },
      { ...snapshotEnvelope(), data: {} },
      { ...snapshotEnvelope(), data: { expected: expectedSnapshot, extra: true } },
      snapshotEnvelope(missingDigest as ProjectionExpectedSnapshotV1),
      snapshotEnvelope({ ...expectedSnapshot, extra: 'x' } as ProjectionExpectedSnapshotV1),
      snapshotEnvelope({ ...expectedSnapshot, repositoryId: '' }),
      snapshotEnvelope({ ...expectedSnapshot, headSha: 'a'.repeat(39) }),
      snapshotEnvelope({ ...expectedSnapshot, headSha: 'A'.repeat(40) }),
      snapshotEnvelope({ ...expectedSnapshot, worktreeDigest: 'a'.repeat(64) as ProjectionExpectedSnapshotV1['worktreeDigest'] }),
    ];
    for (const envelope of malformed) {
      const run: RunArchctxProcess = () => ({ status: 0, signal: null, stdout: JSON.stringify(envelope), stderr: '' });
      let error: unknown;
      try { readArchitectureProjectionSnapshot(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(ArchctxClientError);
      expect(error).toMatchObject({ code: 'RH_ARCHCTX_SNAPSHOT_INVALID', action: 'update-repo-harness', reasonCode: 'projection-snapshot-invalid' });
    }
  });

  test('refuses apply and adopt while projection apply is disabled', () => {
    const f = fixture();
    const projectionRequest = request();
    for (const mode of ['apply', 'adopt'] as const) {
      projectionRequest.mode = mode;
      expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, applyMode: 'disabled' }, run: runner([], projectionEnvelope(projectionRequest.expected)) })).toThrow('apply is disabled');
    }
  });

  test('tracks the packed node/v2 integration proof without a stale node/v1 dependency', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as any;
    const readback = JSON.parse(readFileSync(join(import.meta.dir, '..', 'docs', 'verification', 'axr5-archctx-clean-room-readback.json'), 'utf8')) as any;
    expect(manifest.devDependencies?.['archctx-contracts']).toBeUndefined();
    expect(manifest.scripts?.['check:archctx-integration']).toBe('bun scripts/axr5-archctx-clean-room.ts');
    expect(readback.status).toBe('verified');
    expect(readback.packages.contracts.version).toBe(ARCHCTX_REQUIRED_VERSION);
    expect(Object.keys(readback.packages.contracts).sort()).toEqual(['file', 'name', 'version']);
    expect(Object.keys(readback.packages.archctx).sort()).toEqual(['file', 'name', 'version']);
    expect(readback.consumer.authoritativeNodeSchema).toBe('archcontext.node/v2');
    expect(readback.consumer.authoritativeNodeSchemaDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(readback.source.dirtySourceUsed).toBe(false);
  });

  test('rejects corrupt JSON and results outside the published contract', () => {
    const f = fixture();
    const projectionRequest = request();
    const validEnvelope = projectionEnvelope(projectionRequest.expected);
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: () => ({ status: 0, signal: null, stdout: '{', stderr: '' }) })).toThrow('corrupt JSON');

    const corrupt = structuredClone(validEnvelope) as any;
    corrupt.data.refreshSignals = [{}];
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], corrupt) })).toThrow('projection result invalid: $.refreshSignals[0]');

    const forged = structuredClone(validEnvelope) as any;
    forged.data.receiptDigest = digest('f');
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], forged) })).toThrow('receiptDigest must match the canonical projection result payload');

    const legacy = structuredClone(validEnvelope) as any;
    legacy.data.schemaVersion = 'archcontext.projection-result/v1';
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], legacy) })).toThrow('projection result invalid: $.schemaVersion');

    const otherRequest = structuredClone(validEnvelope) as any;
    otherRequest.data.requestId = 'request.other';
    const { receiptDigest: _old, ...payload } = otherRequest.data;
    otherRequest.data.receiptDigest = projectionResultReceiptDigest(payload);
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], otherRequest) })).toThrow('requestId mismatch');
  });

  test('distinguishes pre-write failure, committed reconciliation, and consumed noop', () => {
    const f = fixture();
    const acceptedChange: NonNullable<ProjectionRequestV1['acceptedChange']> = {
      changeSetId: 'changeset.user-accepted', eventId: 'event.user-accepted',
      reasonCodes: ['responsibility-changed'],
      affectedNodeIds: ['capability.test.core'],
    };
    const initial = request();
    initial.mode = 'apply';
    initial.requestId = 'request.apply.initial';
    initial.acceptedChange = acceptedChange;
    const originalExpected = initial.expected;
    let projectionCalls = 0;
    let ownedWrites = 0;
    let humanAcceptances = 0;
    const run: RunArchctxProcess = (_binary, args) => {
      if (args[0] === 'capabilities') return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      projectionCalls += 1;
      const wireRequest = JSON.parse(args[3]!) as ProjectionRequestV1;
      if (projectionCalls === 1) {
        ownedWrites += 1;
        humanAcceptances += 1;
        writeFileSync(join(f.repoRoot, 'src', 'core', 'concurrent.ts'), 'export const concurrent = true;\n');
        return { status: 0, signal: null, stdout: JSON.stringify(applyEnvelope(wireRequest.requestId, originalExpected, acceptedChange, 'applied-reconcile-required')), stderr: 'warning: projection post-apply worktree digest diverged from the accepted snapshot' };
      }
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(applyEnvelope(wireRequest.requestId, originalExpected, acceptedChange, projectionCalls === 2 ? 'applied' : 'noop')),
        stderr: '',
      };
    };

    const first = runArchitectureProjection(initial, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    expect(first.status).toBe('applied-reconcile-required');
    expect(first.refreshSignals).toEqual([]);
    expect(first.applyReceipt?.applyId).toBe(digest('a'));

    const retry = { ...initial, requestId: 'request.apply.retry', expected: { ...expectedSnapshot, worktreeDigest: digest('9') } };
    const second = runArchitectureProjection(retry, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    expect(second.status).toBe('applied');
    expect(second.refreshSignals).toHaveLength(1);

    const third = runArchitectureProjection({ ...retry, requestId: 'request.apply.noop' }, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    expect(third.status).toBe('noop');
    expect(third.refreshSignals).toEqual([]);
    expect(projectionCalls).toBe(3);
    expect(ownedWrites).toBe(1);
    expect(humanAcceptances).toBe(1);
  });

  test('pre-write provider failure remains fail-closed', () => {
    const f = fixture();
    const projectionRequest = request();
    projectionRequest.mode = 'apply';
    projectionRequest.acceptedChange = { changeSetId: 'changeset.stale', eventId: 'event.stale', reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.core'] };
    const run: RunArchctxProcess = (_binary, args) => args[0] === 'capabilities'
      ? { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' }
      : { status: 1, signal: null, stdout: '', stderr: 'AC_PRECONDITION_FAILED: expected snapshot is stale' };
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run })).toThrow('expected snapshot is stale');
  });
});


describe('ArchContext maintenance reminders', () => {
  const incompatible = {
    schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.status',
    data: { running: true, versionUnsupported: {
      reason: 'product-version-mismatch', expected: ARCHCTX_REQUIRED_VERSION, received: '0.2.3',
      action: 'upgrade-archctx-runtime', command: 'archctx daemon upgrade',
    } },
  };

  test('daemon lifecycle mismatch requests authorization without running recovery', () => {
    const f = fixture();
    const calls: string[][] = [];
    const run: RunArchctxProcess = (_binary, args) => {
      calls.push([...args]);
      return { status: 0, signal: null, stdout: JSON.stringify(incompatible), stderr: '' };
    };
    expect(() => verifyArchctxDaemonRuntime(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }))
      .toThrow('received 0.2.3. User authorization required');
    expect(calls).toEqual([['daemon', 'status', '--json']]);
  });

  test('healthy and stopped daemons need no maintenance; malformed status fails closed', () => {
    const f = fixture();
    const check = (data: unknown) => verifyArchctxDaemonRuntime(f.repoRoot, {
      consumerRoot: f.consumerRoot, policy,
      run: () => ({ status: 0, signal: null, stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'daemon.status', data }), stderr: '' }),
    });
    expect(() => check({ running: false })).not.toThrow();
    expect(() => check({ running: true, rpcVersionCompatible: true, productVersionCompatible: true })).not.toThrow();
    expect(() => check({ running: true })).toThrow('did not prove runtime compatibility');
    expect(() => check({ running: 'true' })).toThrow('invalid envelope');
    expect(() => check({ running: false, staleConnection: true })).toThrow('unhealthy connection');
    expect(() => check({ ...incompatible.data, versionUnsupported: { ...incompatible.data.versionUnsupported, action: 'unknown' } }))
      .toThrow('invalid versionUnsupported diagnostic');
  });

  test('projection failure preserves typed maintenance guidance beyond diagnostic truncation', () => {
    const f = fixture();
    const calls: string[][] = [];
    const run: RunArchctxProcess = (_binary, args) => {
      calls.push([...args]);
      return { status: args[0] === 'capabilities' ? 0 : 1, signal: null, stderr: 'short stderr', stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : {
        schemaVersion: 'archcontext.envelope/v1', ok: false, requestId: 'projection',
        error: { ...errorEnvelope('projection', 'AC_RUNTIME_VERSION_UNSUPPORTED', 'x'.repeat(400) + ' daemon 0.2.3 requires replacement').error },
      }) };
    };
    let message = '';
    try { runArchitectureProjection(request(), f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }); }
    catch (error) { message = (error as Error).message; }
    expect(message).toContain('daemon 0.2.3 requires replacement');
    expect(message).toContain('User authorization required');
    expect(message).toContain('only if it is missing or stale');
    expect(calls.map((args) => args[0])).toEqual(['capabilities', 'projection']);
  });

  test('untyped stderr and wrong envelope schemas never produce a reset recommendation', () => {
    const f = fixture();
    for (const schemaVersion of ['unknown', 'archcontext.envelope/v1']) {
      const run: RunArchctxProcess = (_binary, args) => ({ status: args[0] === 'capabilities' ? 0 : 1, signal: null,
        stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : { schemaVersion, ok: false, error: { code: 'AC_RUNTIME_VERSION_UNSUPPORTED', action: 'unknown', message: 'not authority' } }),
        stderr: 'AC_RUNTIME_VERSION_UNSUPPORTED' });
      expect(() => runArchitectureProjection(request(), f.repoRoot, { consumerRoot: f.consumerRoot, policy, run }))
        .toThrow('invalid envelope');
    }
  });
});


describe('single-writer observations', () => {
  test('render equivalence ignores source stamps but rejects output drift and incomplete coverage', () => {
    const result: ProjectionResultV2 = projectionEnvelope(request().expected).data;
    result.status = 'planned';
    result.humanActions = [];
    result.changes = [{ targetId: 'target.a', path: 'docs/architecture/a.md', affectedCapabilityIds: [],
      stampChanged: true, outputChanged: false, semanticChanged: false, proofChanged: false,
      plannedAction: 'none', classification: 'stamp-only', reasonCodes: ['source-stamp-changed'] }];
    expect(summarizeArchitectureRender(result)).toMatchObject({ renderEquivalent: true, differingPaths: [] });
    result.changes[0]!.outputChanged = true;
    expect(summarizeArchitectureRender(result)).toMatchObject({ renderEquivalent: false, differingPaths: ['docs/architecture/a.md'] });
    result.status = 'planned-partial';
    expect(summarizeArchitectureRender(result).renderEquivalent).toBeNull();
    result.status = 'human-action-required';
    expect(summarizeArchitectureRender(result).renderEquivalent).toBeNull();
    delete result.changes;
    expect(() => summarizeArchitectureRender(result)).toThrow('omitted per-target changes');
  });

  test('hand-edit warnings consume only upstream manual-edit codes through the existing client', () => {
    const f = fixture();
    const data = { schemaVersion: 'archcontext.docs-drift/v1', drift: { diffs: [
      { path: 'docs/architecture/a.md', reasonCode: 'projection-generated-region-manually-edited' },
      { path: 'docs/architecture/map.md', reasonCode: 'projection-generated-file-manually-edited' },
      { path: 'docs/architecture/b.md', reasonCode: 'projection-generated-region-stale' },
      { path: 'docs/architecture/.projection-manifest.json', reasonCode: 'projection-manifest-stale' },
    ] } };
    const calls: string[][] = [];
    const result = readArchitectureHandEdits(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: (_bin, args) => {
      calls.push([...args]);
      return { status: 0, signal: null, stderr: '', stdout: JSON.stringify({ schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'docs.drift', data }) };
    } });
    expect(calls).toEqual([['docs', 'drift', '--profile', 'repo-harness/v1', '--json']]);
    expect(result).toEqual(data.drift.diffs.slice(0, 2));
    expect(() => decodeArchitectureHandEdits({ schemaVersion: data.schemaVersion, drift: {} })).toThrow('omitted diffs');
    expect(() => decodeArchitectureHandEdits({ ...data, drift: { diffs: [{ path: 4, reasonCode: 'projection-generated-file-manually-edited' }] } })).toThrow('invalid');
    expect(() => decodeArchitectureHandEdits({ ...data, schemaVersion: 'other' })).toThrow('schema mismatch');
  });
});
