import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARCHCTX_REQUIRED_VERSION,
  PROJECTION_REQUEST_VERSION,
  projectionResultReceiptDigest,
  projectionResultIssues,
  type ArchitectureProjectionPolicy,
  type ProjectionRequestV1,
} from '../src/core/architecture/projection';
import {
  inspectArchitectureProjectionReadiness,
  captureArchitectureProjectionSnapshot,
  resolvePackageLocalArchctx,
  runArchitectureProjection,
  type ArchctxProcessResult,
  type RunArchctxProcess,
} from '../src/effects/architecture/archctx-provider';

const roots: string[] = [];
const digest = (value: string) => `sha256:${value.repeat(64).slice(0, 64)}` as const;
const policy: ArchitectureProjectionPolicy = { provider: 'archctx', applyMode: 'manual', requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 120_000 };

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
  writeFileSync(join(packageRoot, 'package.json'), `${JSON.stringify({ name: 'archctx', version: '0.4.0' })}\n`);
  const binary = join(packageRoot, 'bin', 'archctx');
  writeFileSync(binary, '#!/bin/sh\nexit 99\n');
  chmodSync(binary, 0o755);
  symlinkSync(join('..', 'archctx', 'bin', 'archctx'), join(binRoot, 'archctx'));
  writeFileSync(join(repoRoot, '.ai', 'harness', 'policy.json'), `${JSON.stringify({
    context: { capability_source: 'archcontext' },
    architecture: { projection_provider: 'archctx', projection_apply: 'manual', projection_version: '0.4.0', projection_timeout_ms: 120000 },
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
  return { root, consumerRoot, repoRoot, binary: join(binRoot, 'archctx') };
}

function capabilities() {
  return {
    schemaVersion: 'archcontext.capabilities/v1',
    package: { name: 'archctx', version: '0.4.0' },
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
  return {
    schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'docs.plan', data: {
      schemaVersion: 'archcontext.docs-projection-change-set/v1',
      provenance: {
        schemaVersion: 'archcontext.architecture-docs-projection-provenance/v1',
        baseHeadSha: expected.headSha,
        worktreeDigest: expected.worktreeDigest,
        sourceTreeDigest: digest('2'),
        modelDigest: digest('3'),
        codeGraphDigest: digest('4'),
        indexedWorktreeDigest: digest('1'),
        projectionInputDigest: digest('5'),
        rendererVersion: 'archcontext.docs-renderer/v2',
        layoutVersion: 'archcontext.docs-layout/v1',
        generatedFrom: { codeGraphPackage: '@colbymchenry/codegraph', codeGraphVersion: '1.5.0', codeGraphBinaryDigest: digest('6'), codeGraphStatus: 'ready' },
      },
      drift: { ok: false, reasonCodes: ['projection-file-missing'], diffs: [{ path: 'docs/architecture/index.md', reasonCode: 'projection-file-missing', expectedDigest: digest('7') }] },
      refreshSignals: [],
    },
  };
}

function runner(calls: Array<{ binary: string; args: readonly string[] }>, docs: ReturnType<typeof projectionEnvelope>): RunArchctxProcess {
  return (binary, args): ArchctxProcessResult => {
    calls.push({ binary, args });
    return { status: 0, signal: null, stdout: JSON.stringify(args[0] === 'capabilities' ? capabilities() : docs), stderr: '' };
  };
}

describe('package-local ArchContext projection provider', () => {
  test('resolves only the package-local exact version and never PATH', () => {
    const f = fixture();
    const resolved = resolvePackageLocalArchctx(f.consumerRoot);
    expect(resolved.binaryPath).toBe(f.binary);
    writeFileSync(join(f.consumerRoot, 'node_modules', 'archctx', 'package.json'), '{"name":"archctx","version":"0.3.0"}\n');
    expect(() => resolvePackageLocalArchctx(f.consumerRoot)).toThrow('expected archctx@0.4.0');
  });

  test('disabled readiness performs zero subprocess calls', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const readiness = inspectArchitectureProjectionReadiness(f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run: runner(calls, projectionEnvelope(captureArchitectureProjectionSnapshot(f.repoRoot))) });
    expect(readiness.projectionProvider.state).toBe('disabled');
    expect(calls).toHaveLength(0);
  });

  test('handshakes capabilities then maps a validated projection result', () => {
    const f = fixture();
    const calls: Array<{ binary: string; args: readonly string[] }> = [];
    const projectionRequest = request(f.repoRoot);
    const result = runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner(calls, projectionEnvelope(projectionRequest.expected)), env: { ...process.env, PATH: join(f.root, 'conflicting-path') } });
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.binary === f.binary)).toBe(true);
    expect(calls[0]!.args).toEqual(['capabilities', '--json']);
    expect(calls[1]!.args.slice(0, 2)).toEqual(['docs', 'plan']);
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
    writeFileSync(join(f.repoRoot, 'src', 'core', 'index.ts'), 'export const value = 2;\n');
    expect(captureArchitectureProjectionSnapshot(f.repoRoot).worktreeDigest).not.toBe(before.worktreeDigest);
  });

  test('rejects feature mismatch, corrupt JSON and stale worktree', () => {
    const f = fixture();
    const projectionRequest = request(f.repoRoot);
    const validEnvelope = projectionEnvelope(projectionRequest.expected);
    const mismatch: RunArchctxProcess = (_binary, args) => ({ status: 0, signal: null, stdout: JSON.stringify(args[0] === 'capabilities' ? { ...capabilities(), features: [] } : validEnvelope), stderr: '' });
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: mismatch })).toThrow('feature set mismatch');
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: () => ({ status: 0, signal: null, stdout: '{', stderr: '' }) })).toThrow('corrupt JSON');
    const stale = structuredClone(validEnvelope);
    (stale.data.provenance as { worktreeDigest: string }).worktreeDigest = digest('9');
    expect(() => runArchitectureProjection(projectionRequest, f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: runner([], stale) })).toThrow('does not match request.expected');
  });
});
