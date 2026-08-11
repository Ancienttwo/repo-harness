import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARCHCTX_REQUIRED_VERSION,
  PROJECTION_REQUEST_VERSION,
  projectionRequestIssues,
  projectionResultReceiptDigest,
  projectionResultIssues,
  type ArchitectureProjectionPolicy,
  type ProjectionRequestV1,
} from '../src/core/architecture/projection';
import {
  inspectArchitectureProjectionReadiness,
  captureArchitectureProjectionSnapshot,
  resolveCompatibleNodeRuntime,
  resolvePackageLocalArchctx,
  runArchitectureProjection,
  type ArchctxProcessResult,
  type RunArchctxProcess,
} from '../src/effects/architecture/archctx-provider';
import { architectureProjectionExitCode, buildArchitectureProjectionCommand } from '../src/cli/commands/architecture-projection';

const roots: string[] = [];
const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as const;
const policy: ArchitectureProjectionPolicy = { provider: 'archctx', applyMode: 'manual', failureGate: 'advisory', requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 120_000 };

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
  writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({ name: 'archctx', version: '0.4.1', engines: { node: '>=24 <26' }, bin: { archctx: './bin/archctx' } })}\n`);
  const binary = join(packageRoot, 'bin', 'archctx');
  writeFileSync(binary, '#!/bin/sh\nexit 99\n');
  chmodSync(binary, 0o755);
  symlinkSync(join('..', 'archctx', 'bin', 'archctx'), join(binRoot, 'archctx'));
  writeFileSync(join(repoRoot, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    context: { capability_source: 'archcontext' },
    architecture: { projection_provider: 'archctx', projection_apply: 'manual', projection_version: '0.4.1', projection_timeout_ms: 120000 },
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

function capabilities() {
  return {
    schemaVersion: 'archcontext.capabilities/v1',
    package: { name: 'archctx', version: '0.4.1' },
    protocols: {
      projectionRequest: 'archcontext.projection-request/v1',
      projectionResult: 'archcontext.projection-result/v1',
      architectureRefreshSignal: 'archcontext.architecture-refresh-signal/v1',
    },
    renderers: { architectureDocs: 'archcontext.docs-renderer/v2', agentContext: 'archcontext.agent-context-renderer/v1' },
    features: ['architecture-docs-renderer-v2', 'architecture-refresh-signal-v1', 'projection-protocol-v1'],
  };
}

function request(repoRoot: string): ProjectionRequestV1 {
  const expected = captureArchitectureProjectionSnapshot(repoRoot);
  return {
    schemaVersion: PROJECTION_REQUEST_VERSION,
    requestId: 'request.axr5',
    profile: 'repo-harness/v1',
    mode: 'plan',
    targets: ['architecture-docs'],
    changedPaths: ['src/core/a.ts'],
    expected,
  };
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
    rendererVersion: 'archcontext.docs-renderer/v2' as const,
    layoutVersion: 'archcontext.docs-layout/v1' as const,
    generatedFrom: { codeGraphPackage: '@colbymchenry/codegraph' as const, codeGraphVersion: '1.5.0' as const, codeGraphBinaryDigest: digest('6'), codeGraphStatus: 'ready' as const },
  };
  const withoutReceipt = {
    schemaVersion: 'archcontext.projection-result/v1' as const,
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

function runner(calls: Array<{ binary: string; args: readonly string[] }>, docs: ReturnType<typeof projectionEnvelope>): RunArchctxProcess {
  return (binary, args): ArchctxProcessResult => {
    calls.push({ binary, args });
    return { status: 0, signal: null, stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : docs), stderr: '' };
  };
}

describe('package-local ArchContext projection provider', () => {
  test('does not expose caller-authored architecture acceptance as CLI authority', () => {
    const command = buildArchitectureProjectionCommand();
    for (const name of ['check', 'plan', 'apply', 'adopt']) {
      const subcommand = command.commands.find((candidate) => candidate.name() === name);
      expect(subcommand).toBeDefined();
      expect(subcommand!.options.map((option) => option.long)).not.toContain('--accepted-change-set-id');
      expect(subcommand!.options.map((option) => option.long)).not.toContain('--accepted-event-id');
      expect(subcommand!.options.map((option) => option.long)).not.toContain('--accepted-reason');
      expect(subcommand!.options.map((option) => option.long)).not.toContain('--accepted-node-id');
    }

    const invalid = request(fixture().repoRoot);
    invalid.acceptedChange = {
      changeSetId: 'changeset.unsorted',
      eventId: 'event.unsorted',
      reasonCodes: ['ownership-changed', 'node-added'],
      affectedNodeIds: ['capability.workflow', 'capability.runtime'],
    };
    expect(projectionRequestIssues(invalid)).toContain('acceptedChange.reasonCodes must be sorted, unique and non-empty');
    expect(projectionRequestIssues(invalid)).toContain('acceptedChange.affectedNodeIds must be sorted, unique and non-empty');
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
    expect(() => resolvePackageLocalArchctx(f.consumerRoot)).toThrow('expected archctx@0.4.1');
  });

  test('resolves a hoisted package from an installed repo-harness package root', () => {
    const f = fixture();
    const installedHarnessRoot = join(f.consumerRoot, 'node_modules', 'repo-harness');
    mkdirSync(installedHarnessRoot, { recursive: true });
    expect(resolvePackageLocalArchctx(installedHarnessRoot).binaryPath).toBe(realpathSync(f.binary));
  });

  test('disabled readiness performs zero subprocess calls', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run: runner(calls, projectionEnvelope(captureArchitectureProjectionSnapshot(f.repoRoot))) });
    expect(readiness.projectionProvider.state).toBe('disabled');
    expect(calls).toHaveLength(0);
  });

  test('does not enable apply for a partial model that lacks manifest and product authority', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, {
      consumerRoot: f.consumerRoot,
      policy,
      run: runner(calls, projectionEnvelope(captureArchitectureProjectionSnapshot(f.repoRoot))),
    });
    expect(readiness.projectionProvider.state).toBe('ready');
    expect(readiness.modelAuthority.ready).toBe(true);
    expect(readiness.apply.enabled).toBe(false);
  });

  test('fails closed when PATH has no Node runtime compatible with archctx', () => {
    const f = fixture();
    const fakeBin = join(f.root, 'bin');
    mkdirSync(fakeBin, { recursive: true });
    const node = join(fakeBin, 'node');
    writeFileSync(node, '#!/bin/sh\necho v22.14.0\n');
    chmodSync(node, 0o755);
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, {
      consumerRoot: f.consumerRoot,
      policy,
      env: { ...process.env, PATH: fakeBin },
    });
    expect(readiness.projectionProvider.state).toBe('error');
    expect(readiness.projectionProvider.reason).toContain('requires Node >=24 <26');
  });

  test('uses the protected helper exact Node authority without widening PATH', () => {
    const f = fixture();
    const fakeBin = join(f.root, 'protected-node');
    mkdirSync(fakeBin, { recursive: true });
    const node = join(fakeBin, 'node');
    writeFileSync(node, '#!/bin/sh\necho v24.18.0\n');
    chmodSync(node, 0o755);
    expect(resolveCompatibleNodeRuntime({ PATH: '/usr/bin:/bin', REPO_HARNESS_NODE_BIN: node })).toBe(realpathSync(node));
    expect(() => resolveCompatibleNodeRuntime({ PATH: '/usr/bin:/bin', REPO_HARNESS_NODE_BIN: 'node' })).toThrow('must be an absolute path');
  });

  test('handshakes capabilities then maps a validated projection result', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const projectionRequest = request(f.repoRoot);
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
    expect(projectionResultIssues(result)).toEqual([]);
    const { receiptDigest, ...payload } = result;
    expect(receiptDigest).toBe(projectionResultReceiptDigest(payload));
  });

  test('captures ArchContext fixed-point identity and excludes projection-owned outputs', () => {
    const f = fixture();
    const before = captureArchitectureProjectionSnapshot(f.repoRoot);
    expect(before.repositoryId).toMatch(/^repo\.[a-f0-9]{16}$/);
    expect(before.workspaceId).toMatch(/^workspace\.[a-f0-9]{16}$/);
    writeFileSync(join(f.repoRoot, 'AGENTS.md'), 'changed generated output\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot)).toEqual(before);
    writeFileSync(join(f.repoRoot, '.ai', 'harness', 'runtime-state.json'), '{"updated":true}\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot)).toEqual(before);
    mkdirSync(join(f.repoRoot, '.claude'), { recursive: true });
    writeFileSync(join(f.repoRoot, '.claude', '.session-id'), 'session-one\n');
    writeFileSync(join(f.repoRoot, '.claude', '.trace.jsonl'), '{"event":"one"}\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot)).toEqual(before);
    writeFileSync(join(f.repoRoot, '.claude', 'settings.json'), '{}\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot).worktreeDigest).not.toBe(before.worktreeDigest);
    rmSync(join(f.repoRoot, '.claude', 'settings.json'));
    mkdirSync(join(f.repoRoot, 'nested'), { recursive: true });
    writeFileSync(join(f.repoRoot, 'nested', 'AGENTS.md'), 'not a projection target\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot).worktreeDigest).not.toBe(before.worktreeDigest);
    rmSync(join(f.repoRoot, 'nested'), { recursive: true, force: true });
    mkdirSync(join(f.repoRoot, 'src', 'node_modules'), { recursive: true });
    writeFileSync(join(f.repoRoot, 'src', 'node_modules', 'not-a-root-install.ts'), 'export const visible = true;\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot).worktreeDigest).not.toBe(before.worktreeDigest);
    rmSync(join(f.repoRoot, 'src', 'node_modules'), { recursive: true, force: true });
    writeFileSync(join(f.repoRoot, 'src', 'core', 'index.ts'), 'export const value = 2;\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot).worktreeDigest).not.toBe(before.worktreeDigest);
  });

  test('rejects provider writes outside the requested surface and applied status for read-only modes', () => {
    const f = fixture();
    const projectionRequest = request(f.repoRoot);
    projectionRequest.mode = 'check';
    const applied = structuredClone(projectionEnvelope(projectionRequest.expected)) as any;
    applied.data.status = 'applied';
    const { receiptDigest: _appliedReceipt, ...appliedPayload } = applied.data;
    applied.data.receiptDigest = projectionResultReceiptDigest(appliedPayload);
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], applied) })).toThrow('applied for non-mutating mode check');

    const escaped = structuredClone(projectionEnvelope(projectionRequest.expected));
    escaped.data.files[0]!.path = '.git/hooks/pre-commit';
    const { receiptDigest: _escapedReceipt, ...escapedPayload } = escaped.data;
    escaped.data.receiptDigest = projectionResultReceiptDigest(escapedPayload);
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], escaped) })).toThrow('path escapes requested projection targets');

    const hiddenWrite = structuredClone(projectionEnvelope(projectionRequest.expected)) as any;
    hiddenWrite.data.outputSnapshot.worktreeDigest = digest('9');
    const { receiptDigest: _hiddenReceipt, ...hiddenPayload } = hiddenWrite.data;
    hiddenWrite.data.receiptDigest = projectionResultReceiptDigest(hiddenPayload);
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], hiddenWrite) })).toThrow('outside the projection-owned fixed-point surfaces');

    const actualDiskWrite: RunArchctxProcess = (_binary, args) => {
      if (args[0] === 'capabilities') return { status: 0, signal: null, stdout: JSON.stringify(capabilities()), stderr: '' };
      writeFileSync(join(f.repoRoot, 'src', 'core', 'stray.ts'), 'export const stray = true;\n');
      return { status: 0, signal: null, stdout: JSON.stringify(projectionEnvelope(projectionRequest.expected)), stderr: '' };
    };
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: actualDiskWrite })).toThrow('snapshot mismatch after projection');

    projectionRequest.mode = 'apply';
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, applyMode: 'disabled' }, run: runner([], projectionEnvelope(projectionRequest.expected)) })).toThrow('apply is disabled');
  });

  test('tracks the packed node/v2 integration proof without a stale node/v1 dependency', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf8')) as any;
    const readback = JSON.parse(readFileSync(join(import.meta.dir, '..', 'docs', 'verification', 'axr5-archctx-clean-room-readback.json'), 'utf8')) as any;
    expect(manifest.devDependencies?.['archctx-contracts']).toBeUndefined();
    expect(manifest.scripts?.['check:archctx-integration']).toBe('bun scripts/axr5-archctx-clean-room.ts');
    expect(readback.status).toBe('verified');
    expect(readback.packages.contracts.version).toBe('0.4.1');
    expect(readback.consumer.authoritativeNodeSchema).toBe('archcontext.node/v2');
    expect(readback.consumer.authoritativeNodeSchemaDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(readback.source.dirtySourceUsed).toBe(false);
  });

  test('rejects feature mismatch, corrupt JSON and stale worktree', () => {
    const f = fixture();
    const projectionRequest = request(f.repoRoot);
    const validEnvelope = projectionEnvelope(projectionRequest.expected);
    const mismatch: RunArchctxProcess = (_binary, args) => ({ status: 0, signal: null, stdout: JSON.stringify(args[0] === 'capabilities' ? { ...capabilities(), features: [] } : validEnvelope), stderr: '' });
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: mismatch })).toThrow('feature set mismatch');
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: () => ({ status: 0, signal: null, stdout: '{', stderr: '' }) })).toThrow('corrupt JSON');
    const stale = structuredClone(validEnvelope);
    stale.data.outputSnapshot.worktreeDigest = digest('9');
    const { receiptDigest: _old, ...payload } = stale.data;
    stale.data.receiptDigest = projectionResultReceiptDigest(payload);
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], stale) })).toThrow('outside the projection-owned fixed-point surfaces');

    const corrupt = structuredClone(validEnvelope) as any;
    corrupt.data.refreshSignals = [{}];
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], corrupt) })).toThrow('refreshSignals[0].schemaVersion');

    const forged = structuredClone(validEnvelope) as any;
    forged.data.receiptDigest = digest('f');
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], forged) })).toThrow('receiptDigest mismatch');
  });
});
