import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectionResultReceiptDigest, type ArchitectureProjectionPolicy, type ProjectionRequestV1, type ProjectionResultV1 } from '../src/core/architecture/projection';
import { runMutationObserved, consumePendingPostEditEvents, readPendingPostEditEvents, migratePendingPostEditJournalV1 } from '../src/cli/hook/mutation-observed';
import { readArchitectureDriftCursor } from '../src/cli/hook/architecture-drift';
import { drainArchitectureProjectionJobs } from '../src/effects/architecture/projection-orchestrator';
import {
  architectureProjectionJobState,
  architectureProjectionJobId,
  architectureProjectionQueueState,
  claimNextArchitectureProjectionJob,
  enqueueArchitectureProjectionJob,
  failArchitectureProjectionJob,
  recoverAbandonedArchitectureProjectionJobs,
  retryArchitectureProjectionDeadLetter,
} from '../src/effects/architecture/projection-jobs';
import type { ArchctxProcessResult, RunArchctxProcess } from '../src/effects/architecture/archctx-provider';
import { buildManagedHooks } from '../src/cli/installer/managed-entries';
import { consumeArchitectureRefreshSignals, type RunArchitectureRefreshActions } from '../src/effects/architecture/refresh-consumer';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = (token: string) => `sha256:${token.repeat(64).slice(0, 64)}` as const;
const policy: ArchitectureProjectionPolicy = { provider: 'archctx', applyMode: 'automatic', failureGate: 'advisory', requiredVersion: '0.4.2', timeoutMs: 120_000 };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-axr6-'));
  roots.push(root);
  const repoRoot = join(root, 'repo');
  const consumerRoot = join(root, 'consumer');
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  mkdirSync(join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  mkdirSync(join(repoRoot, 'src'), { recursive: true });
  mkdirSync(join(consumerRoot, 'node_modules/archctx/bin'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ architecture: { projection_provider: 'archctx', projection_apply: 'automatic', projection_version: '0.4.2', projection_timeout_ms: 120000 } })}\n`);
  writeFileSync(join(repoRoot, '.archcontext/model/nodes/root.yaml'), `schemaVersion: archcontext.node/v2
kind: capability
id: capability.test.root
name: Root
summary: Root capability.
responsibilities:
  - Own runtime tests.
status: active
source:
  include:
    - src/**
extensions:
  lspProfile: ts
  verification: []
  contractFiles:
    agents: AGENTS.md
    claude: CLAUDE.md
`);
  writeFileSync(join(repoRoot, 'src/index.ts'), 'export const value = 1;\n');
  writeFileSync(join(repoRoot, 'AGENTS.md'), '# agents\n');
  writeFileSync(join(repoRoot, 'CLAUDE.md'), '# claude\n');
  writeFileSync(join(consumerRoot, 'node_modules/archctx/package.json'), `${JSON.stringify({ name: 'archctx', version: '0.4.2', engines: { node: '>=24 <26' }, bin: { archctx: './bin/archctx' } })}\n`);
  writeFileSync(join(consumerRoot, 'node_modules/archctx/bin/archctx'), '#!/bin/sh\nexit 1\n');
  chmodSync(join(consumerRoot, 'node_modules/archctx/bin/archctx'), 0o755);
  execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'axr6@example.com'], { cwd: repoRoot });
  execFileSync('git', ['config', 'user.name', 'AXR6'], { cwd: repoRoot });
  execFileSync('git', ['add', '.'], { cwd: repoRoot });
  execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoRoot, stdio: 'ignore' });
  const collector = { getRepoRoot: () => repoRoot, getWorktreeOwnership: () => ({ current: repoRoot, owner: null, ownedByCurrent: false }), getActivePlanMarker: () => null };
  return { repoRoot, consumerRoot, collector };
}

function capabilities(): ArchctxProcessResult {
  return { status: 0, signal: null, stderr: '', stdout: JSON.stringify({
    schemaVersion: 'archcontext.capabilities/v1',
    package: { name: 'archctx', version: '0.4.2' },
    protocols: { projectionRequest: 'archcontext.projection-request/v1', projectionResult: 'archcontext.projection-result/v1', architectureRefreshSignal: 'archcontext.architecture-refresh-signal/v1' },
    renderers: { architectureDocs: 'archcontext.docs-renderer/v2', agentContext: 'archcontext.agent-context-renderer/v1' },
    features: ['architecture-docs-renderer-v2', 'architecture-refresh-signal-v1', 'projection-protocol-v1'],
  }) };
}

function envelope(request: ProjectionRequestV1) {
  const snapshot = {
    ...request.expected,
    baseHeadSha: request.expected.headSha,
    sourceTreeDigest: digest('1'), modelDigest: digest('2'), codeGraphDigest: digest('3'), indexedWorktreeDigest: digest('4'), projectionInputDigest: digest('5'),
    rendererVersion: 'archcontext.docs-renderer/v2' as const,
    layoutVersion: 'archcontext.docs-layout/v1' as const,
    generatedFrom: { codeGraphPackage: '@colbymchenry/codegraph' as const, codeGraphVersion: '1.5.0' as const, codeGraphBinaryDigest: digest('6'), codeGraphStatus: 'ready' as const },
  };
  const body: Omit<ProjectionResultV1, 'receiptDigest'> = {
    schemaVersion: 'archcontext.projection-result/v1' as const,
    requestId: request.requestId,
    status: 'applied' as const,
    inputSnapshot: snapshot,
    outputSnapshot: snapshot,
    affectedNodeIds: [], files: [], humanActions: [], refreshSignals: [],
  };
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.run', data: { ...body, receiptDigest: projectionResultReceiptDigest(body) } };
}

function envelopeWithStatus(
  request: ProjectionRequestV1,
  status: 'human-action-required' | 'blocked',
) {
  const value = structuredClone(envelope(request));
  value.data.status = status;
  value.data.humanActions = status === 'human-action-required'
    ? [{ reasonCode: 'unresolved-major-change' as const, affectedNodeIds: ['capability.test.root'], requestPayloadDigest: digest('a') }]
    : [];
  const { receiptDigest: _receipt, ...body } = value.data;
  value.data.receiptDigest = projectionResultReceiptDigest(body);
  return value;
}

function envelopeWithUnresolvedMajorSignal(request: ProjectionRequestV1) {
  const value = structuredClone(envelope(request));
  const snapshot = value.data.outputSnapshot;
  value.data.refreshSignals = [{
    schemaVersion: 'archcontext.architecture-refresh-signal/v1',
    signalId: digest('b'),
    idempotencyKey: digest('c'),
    mode: 'human-action-required',
    repository: { repositoryId: snapshot.repositoryId },
    worktree: { workspaceId: snapshot.workspaceId, headSha: snapshot.headSha, worktreeDigest: snapshot.worktreeDigest },
    cause: 'unresolved-major-candidate',
    reasonCodes: ['responsibility-changed'],
    affectedNodeIds: ['capability.test.root'],
    refreshTargets: ['architecture-readiness'],
    baseDigests: { modelDigest: digest('d'), sourceTreeDigest: digest('e'), flowProofDigest: digest('f'), projectionDigest: digest('0') },
    resultingDigests: { modelDigest: digest('1'), sourceTreeDigest: digest('2'), flowProofDigest: digest('3'), projectionDigest: digest('4') },
    projectionReceiptDigest: digest('f'),
  }];
  const { receiptDigest: _receipt, ...body } = value.data;
  value.data.receiptDigest = projectionResultReceiptDigest(body);
  value.data.refreshSignals[0]!.projectionReceiptDigest = value.data.receiptDigest;
  return value;
}

function successfulRunner(projectionCalls: { count: number }): RunArchctxProcess {
  return (_binary, args) => {
    if (args[0] === 'capabilities') return capabilities();
    projectionCalls.count += 1;
    const request = JSON.parse(args[3]!) as ProjectionRequestV1;
    return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(envelope(request)) };
  };
}

function drain(repoRoot: string, options: Parameters<typeof drainArchitectureProjectionJobs>[1]) {
  return drainArchitectureProjectionJobs(repoRoot, { ...options, sourceEvents: readPendingPostEditEvents(repoRoot) });
}

describe('durable architecture projection orchestration', () => {
  test('coalesces ten source paths into one provider process and acks only after the durable receipt', () => {
    const f = fixture();
    for (let index = 0; index < 10; index += 1) {
      runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: `src/file-${index}.ts`, session_id: 'one-session' }) });
    }
    const projectionCalls = { count: 0 };
    const drained = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: successfulRunner(projectionCalls) });
    expect(drained.status).toBe('succeeded');
    expect(drained.acknowledgeSourceEvents).toBe(true);
    expect(projectionCalls.count).toBe(1);
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(10);
    expect(readdirSync(join(f.repoRoot, '.ai/harness/architecture-projection/receipts'))).toHaveLength(1);
    consumePendingPostEditEvents(f.repoRoot, process.env, { skipArchitectureCascade: true });
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(0);
  });

  test('projects a same-session path again after the prior delivery was acknowledged', () => {
    const f = fixture();
    const projectionCalls = { count: 0 };
    const input = JSON.stringify({ file_path: 'src/repeated.ts', session_id: 'same-session' });
    runMutationObserved({ collector: f.collector, input });
    const first = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: successfulRunner(projectionCalls) });
    consumePendingPostEditEvents(f.repoRoot, process.env, { skipArchitectureCascade: true, eventIds: first.sourceEventIds });
    runMutationObserved({ collector: f.collector, input });
    const second = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: successfulRunner(projectionCalls) });
    expect(second.status).toBe('succeeded');
    expect(second.jobId).not.toBe(first.jobId);
    expect(projectionCalls.count).toBe(2);
  });

  test('projects a coalesced edit that arrives after request capture instead of receipt-shortcutting it', () => {
    const f = fixture();
    const input = JSON.stringify({ file_path: 'src/during-projection.ts', session_id: 'during-projection' });
    runMutationObserved({ collector: f.collector, input });
    let projectionCalls = 0;
    const run: RunArchctxProcess = (_binary, args) => {
      if (args[0] === 'capabilities') return capabilities();
      projectionCalls += 1;
      const request = JSON.parse(args[3]!) as ProjectionRequestV1;
      if (projectionCalls === 1) runMutationObserved({ collector: f.collector, input });
      return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(envelope(request)) };
    };
    const first = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    consumePendingPostEditEvents(f.repoRoot, process.env, { skipArchitectureCascade: true, eventIds: first.sourceEventIds });
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(1);
    const second = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    expect(second.status).toBe('succeeded');
    expect(second.jobId).not.toBe(first.jobId);
    expect(projectionCalls).toBe(2);
  });

  test('bounds handshake, provider, validation, and refresh under one drain deadline', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/deadline.ts', session_id: 'deadline' }) });
    let clockMs = 0;
    const timeouts: number[] = [];
    const run: RunArchctxProcess = (_binary, args, options) => {
      timeouts.push(options.timeoutMs);
      if (args[0] === 'capabilities') {
        clockMs = 10_000;
        return capabilities();
      }
      const request = JSON.parse(args[3]!) as ProjectionRequestV1;
      clockMs = 119_000;
      return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(envelope(request)) };
    };
    const result = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run, nowMs: () => clockMs });
    expect(result.status).toBe('succeeded');
    expect(timeouts).toEqual([10_000, 110_000]);
  });

  test('retains source events on process failure and dead-letters the third attempt', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/failing.ts', session_id: 'failure' }) });
    const failed: RunArchctxProcess = (_binary, args) => args[0] === 'capabilities'
      ? capabilities()
      : { status: 1, signal: null, stdout: '', stderr: 'projection failed' };
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('dead-letter');
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(1);
    expect(architectureProjectionQueueState(f.repoRoot).deadLetters).toBe(1);
    const deadLetterId = architectureProjectionQueueState(f.repoRoot).oldestDeadLetterJobId;
    expect(deadLetterId).toMatch(/^job-[a-f0-9]{24}$/);
    const retried = retryArchitectureProjectionDeadLetter(realpathSync(f.repoRoot), deadLetterId!);
    expect(retried.attempt).toBe(0);
    expect(architectureProjectionQueueState(f.repoRoot).deadLetters).toBe(0);
    expect(architectureProjectionQueueState(f.repoRoot).pending).toBe(1);
  });

  test('normalizes duplicate paths into one stable job identity and preserves dead-letter visibility', () => {
    const f = fixture();
    for (const session_id of ['duplicate-a', 'duplicate-b']) {
      runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/shared.ts', session_id }) });
    }
    const sources = readPendingPostEditEvents(f.repoRoot);
    expect(architectureProjectionJobId(sources.map((event) => event.event_id), ['src/shared.ts', 'src/shared.ts']))
      .toBe(architectureProjectionJobId(sources.map((event) => event.event_id), ['src/shared.ts']));
    const failed: RunArchctxProcess = (_binary, args) => args[0] === 'capabilities'
      ? capabilities()
      : { status: 1, signal: null, stdout: '', stderr: 'projection failed' };
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('dead-letter');
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/new-after-dead-letter.ts', session_id: 'after-dead-letter' }) });
    const replay = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed });
    expect(replay.status).toBe('dead-letter');
    expect(replay.acknowledgeSourceEvents).toBe(false);
    expect(replay.jobId).toBe(architectureProjectionQueueState(f.repoRoot).oldestDeadLetterJobId);
  });

  test('keeps a dead-letter bound to its stable journal slot when the same session edits the same path again', () => {
    const f = fixture();
    const input = JSON.stringify({ file_path: 'src/dead-letter-slot.ts', session_id: 'same-dead-letter-session' });
    runMutationObserved({ collector: f.collector, input });
    const firstSource = readPendingPostEditEvents(f.repoRoot)[0]!;
    const failedCalls = { count: 0 };
    const failed: RunArchctxProcess = (_binary, args) => {
      if (args[0] === 'capabilities') return capabilities();
      failedCalls.count += 1;
      return { status: 1, signal: null, stdout: '', stderr: 'deterministic projection failure' };
    };
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    const deadLettered = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed });
    expect(deadLettered.status).toBe('dead-letter');
    expect(failedCalls.count).toBe(3);

    runMutationObserved({ collector: f.collector, input });
    const coalescedSource = readPendingPostEditEvents(f.repoRoot)[0]!;
    expect(coalescedSource.event_id).not.toBe(firstSource.event_id);
    expect(coalescedSource.source_key).toBe(firstSource.source_key);
    const blocked = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed });
    expect(blocked).toMatchObject({ status: 'dead-letter', jobId: deadLettered.jobId, acknowledgeSourceEvents: false });
    expect(failedCalls.count).toBe(3);
    expect(architectureProjectionQueueState(f.repoRoot)).toMatchObject({ pending: 0, running: 0, deadLetters: 1 });
    expect(() => retryArchitectureProjectionDeadLetter(realpathSync(f.repoRoot), deadLettered.jobId!)).not.toThrow();
  });

  test('persists preflight failures without consuming the provider delivery budget', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/preflight.ts', session_id: 'preflight' }) });
    const nodeDir = join(f.repoRoot, '.archcontext/model/nodes');
    const nodePath = join(nodeDir, 'root.yaml');
    const node = readFileSync(nodePath, 'utf8');
    rmSync(nodeDir, { recursive: true, force: true });
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy }).status).toBe('retry-pending');
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy }).status).toBe('retry-pending');
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy }).status).toBe('retry-pending');
    expect(architectureProjectionQueueState(f.repoRoot)).toMatchObject({ pending: 1, deadLetters: 0 });
    const [pendingName] = readdirSync(join(f.repoRoot, '.ai/harness/architecture-projection/pending'));
    expect(JSON.parse(readFileSync(join(f.repoRoot, '.ai/harness/architecture-projection/pending', pendingName!), 'utf8')).attempt).toBe(0);
    mkdirSync(nodeDir, { recursive: true });
    writeFileSync(nodePath, node);
    const projectionCalls = { count: 0 };
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: successfulRunner(projectionCalls) }).status).toBe('succeeded');
    expect(projectionCalls.count).toBe(1);
  });

  test('preflight failure does not consume the attempt budget of an unrelated pending job', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/healthy.ts', session_id: 'healthy' }) });
    const failed: RunArchctxProcess = (_binary, args) => args[0] === 'capabilities'
      ? capabilities()
      : { status: 1, signal: null, stdout: '', stderr: 'projection failed' };
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/new.ts', session_id: 'new' }) });
    rmSync(join(f.repoRoot, '.archcontext/model/nodes'), { recursive: true, force: true });
    const preflight = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy });
    expect(preflight.status).toBe('retry-pending');
    expect(preflight.error).toContain('requires .archcontext/model/nodes');
    const [pendingName] = readdirSync(join(f.repoRoot, '.ai/harness/architecture-projection/pending'));
    expect(JSON.parse(readFileSync(join(f.repoRoot, '.ai/harness/architecture-projection/pending', pendingName!), 'utf8')).attempt).toBe(1);
  });

  test('allows only one running provider job per repository', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    const first = enqueueArchitectureProjectionJob(root, ['event-a'], ['source-a'], ['src/a.ts']);
    expect(claimNextArchitectureProjectionJob(root)?.jobId).toBe(first?.jobId);
    expect(enqueueArchitectureProjectionJob(root, ['event-b'], ['source-b'], ['src/b.ts'])).toBeNull();
    expect(claimNextArchitectureProjectionJob(root)).toBeNull();
    expect(architectureProjectionQueueState(root)).toMatchObject({ pending: 0, running: 1 });
  });

  test('reads queue state under the store lock instead of racing a concurrent transition', async () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    const marker = join(root, '.ai/harness/architecture-projection/store-lock-held');
    const lockModule = new URL('../src/effects/locking/exclusive-directory-lock.ts', import.meta.url).href;
    const child = Bun.spawn({
      cmd: [process.execPath, '-e', `
        import { writeFileSync } from 'node:fs';
        import { withExclusiveDirectoryLock } from ${JSON.stringify(lockModule)};
        const [root, marker] = process.argv.slice(1);
        withExclusiveDirectoryLock(root, '.ai/harness/architecture-projection/locks/store', () => {
          writeFileSync(marker, 'held\\n');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
        });
      `, root, marker],
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const waitDeadline = Date.now() + 2_000;
    while (!existsSync(marker) && Date.now() < waitDeadline) await Bun.sleep(5);
    expect(existsSync(marker)).toBe(true);
    const startedAt = Date.now();
    expect(architectureProjectionQueueState(root)).toMatchObject({ pending: 0, running: 0 });
    const elapsed = Date.now() - startedAt;
    expect(await child.exited).toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(200);
  });

  test('quarantines a fresh running job after its Stop owner dies, then recovers it only after the provider lease', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/crash.ts', session_id: 'crash' }) });
    const [source] = readPendingPostEditEvents(root);
    const queued = enqueueArchitectureProjectionJob(root, [source!.event_id], [source!.source_key], source!.changed_paths);
    const running = claimNextArchitectureProjectionJob(root);
    expect(running?.jobId).toBe(queued?.jobId);
    const runningPath = join(root, '.ai/harness/architecture-projection/running', `${running!.jobId}.json`);
    writeFileSync(runningPath, `${JSON.stringify({ ...running, ownerPid: 2_147_483_647 }, null, 2)}\n`);

    expect(recoverAbandonedArchitectureProjectionJobs(root, new Date(running!.updatedAt))).toBe(0);
    expect(architectureProjectionJobState(root, running!.jobId)).toBe('running');
    expect(recoverAbandonedArchitectureProjectionJobs(root, new Date(Date.parse(running!.updatedAt) + 150_001))).toBe(1);
    expect(architectureProjectionJobState(root, running!.jobId)).toBe('pending');
    expect(readPendingPostEditEvents(root).map((event) => event.event_id)).toEqual([source!.event_id]);
  });

  test('recovers a stale running job even when its PID has been reused', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    const queued = enqueueArchitectureProjectionJob(root, ['event-stale'], ['source-stale'], ['src/stale.ts'], new Date('2026-01-01T00:00:00.000Z'));
    const running = claimNextArchitectureProjectionJob(root, new Date('2026-01-01T00:00:01.000Z'));
    expect(running?.jobId).toBe(queued?.jobId);
    expect(running?.ownerPid).toBe(process.pid);
    expect(recoverAbandonedArchitectureProjectionJobs(root, new Date('2026-01-01T00:16:00.000Z'))).toBe(1);
    expect(architectureProjectionJobState(root, running!.jobId)).toBe('pending');
  });

  test('dead-letters an abandoned third attempt instead of retrying forever', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    enqueueArchitectureProjectionJob(root, ['event-timeout'], ['source-timeout'], ['src/timeout.ts']);
    const running = claimNextArchitectureProjectionJob(root)!;
    const runningPath = join(root, '.ai/harness/architecture-projection/running', `${running.jobId}.json`);
    writeFileSync(runningPath, `${JSON.stringify({ ...running, attempt: 3, ownerPid: 2_147_483_647 }, null, 2)}\n`);
    expect(recoverAbandonedArchitectureProjectionJobs(root, new Date(Date.parse(running.updatedAt) + 150_001))).toBe(1);
    expect(architectureProjectionJobState(root, running.jobId)).toBe('dead-letter');
  });

  test('receipt wins crash recovery when running cleanup did not finish', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    enqueueArchitectureProjectionJob(root, ['event-receipt-crash'], ['source-receipt-crash'], ['src/receipt-crash.ts']);
    const running = claimNextArchitectureProjectionJob(root)!;
    const receipts = join(root, '.ai/harness/architecture-projection/receipts');
    mkdirSync(receipts, { recursive: true });
    writeFileSync(join(receipts, `${running.jobId}.json`), '{}\n');
    expect(recoverAbandonedArchitectureProjectionJobs(root)).toBe(1);
    expect(architectureProjectionJobState(root, running.jobId)).toBe('receipt');
    expect(architectureProjectionQueueState(root).running).toBe(0);
  });

  test('rejects completion or failure from a stale claim owner', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    enqueueArchitectureProjectionJob(root, ['event-owner'], ['source-owner'], ['src/owner.ts']);
    const running = claimNextArchitectureProjectionJob(root)!;
    const runningPath = join(root, '.ai/harness/architecture-projection/running', `${running.jobId}.json`);
    writeFileSync(runningPath, `${JSON.stringify({ ...running, attempt: running.attempt + 1, ownerPid: running.ownerPid! + 1 }, null, 2)}\n`);
    expect(() => failArchitectureProjectionJob(root, running, { kind: 'process', message: 'stale owner' })).toThrow('claim no longer belongs');
  });

  test('acks only the events bound to a completed job when a newer edit arrives between retries', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/first.ts', session_id: 'first' }) });
    const failed: RunArchctxProcess = (_binary, args) => args[0] === 'capabilities'
      ? capabilities()
      : { status: 1, signal: null, stdout: '', stderr: 'retry me' };
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/second.ts', session_id: 'second' }) });
    const projectionCalls = { count: 0 };
    const drained = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: successfulRunner(projectionCalls) });
    consumePendingPostEditEvents(f.repoRoot, process.env, { skipArchitectureCascade: true, eventIds: drained.sourceEventIds });
    expect(readPendingPostEditEvents(f.repoRoot).map((event) => event.changed_paths)).toEqual([['src/second.ts']]);
  });

  test('rebinds a retried job to the current delivery id of the same source slot before projection', () => {
    const f = fixture();
    const input = JSON.stringify({ file_path: 'src/rebound.ts', session_id: 'rebound' });
    runMutationObserved({ collector: f.collector, input });
    const firstSource = readPendingPostEditEvents(f.repoRoot)[0]!;
    const failed: RunArchctxProcess = (_binary, args) => args[0] === 'capabilities'
      ? capabilities()
      : { status: 1, signal: null, stdout: '', stderr: 'retry me' };
    expect(drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed }).status).toBe('retry-pending');
    runMutationObserved({ collector: f.collector, input });
    const currentSource = readPendingPostEditEvents(f.repoRoot)[0]!;
    expect(currentSource.event_id).not.toBe(firstSource.event_id);

    const completed = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: successfulRunner({ count: 0 }) });
    expect(completed.status).toBe('succeeded');
    expect(completed.sourceEventIds).toEqual([currentSource.event_id]);
    consumePendingPostEditEvents(f.repoRoot, process.env, { skipArchitectureCascade: true, eventIds: completed.sourceEventIds });
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(0);
  });

  test('suppresses projection-owned docs and context paths without spawning', () => {
    const f = fixture();
    for (const path of ['docs/architecture/index.md', 'AGENTS.md', 'CLAUDE.md']) {
      runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: path, session_id: 'owned' }) });
    }
    const projectionCalls = { count: 0 };
    const drained = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: successfulRunner(projectionCalls) });
    expect(drained.status).toBe('idle');
    expect(drained.acknowledgeSourceEvents).toBe(true);
    expect(projectionCalls.count).toBe(0);
    expect(architectureProjectionQueueState(f.repoRoot).pending).toBe(0);
  });

  test('disabled provider does not spawn and leaves legacy architecture cascade authority to the caller', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/disabled.ts', session_id: 'disabled' }) });
    const projectionCalls = { count: 0 };
    const drained = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, provider: 'disabled', applyMode: 'disabled' }, run: successfulRunner(projectionCalls) });
    expect(drained.status).toBe('disabled');
    expect(projectionCalls.count).toBe(0);
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(1);
  });

  test('manual apply mode stays off the automatic Stop lane', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/manual.ts', session_id: 'manual' }) });
    const projectionCalls = { count: 0 };
    const result = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy: { ...policy, applyMode: 'manual' }, run: successfulRunner(projectionCalls) });
    expect(result.status).toBe('disabled');
    expect(result.acknowledgeSourceEvents).toBe(true);
    expect(projectionCalls.count).toBe(0);
  });

  test('does not acknowledge human-action or blocked provider outcomes as success', () => {
    for (const status of ['human-action-required', 'blocked'] as const) {
      const f = fixture();
      runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: `src/${status}.ts`, session_id: status }) });
      const run: RunArchctxProcess = (_binary, args) => {
        if (args[0] === 'capabilities') return capabilities();
        const request = JSON.parse(args[3]!) as ProjectionRequestV1;
        return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(envelopeWithStatus(request, status)) };
      };
      const result = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
      expect(result.acknowledgeSourceEvents).toBe(false);
      expect(result.status).toBe(status === 'blocked' ? 'retry-pending' : 'dead-letter');
      expect(result.error).toContain(status);
      if (status === 'human-action-required') expect(result.error).toContain('unresolved-major-change');
      expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(1);
    }
  });

  test('dead-letters an unresolved-major refresh signal without acknowledging its source event', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/major.ts', session_id: 'major' }) });
    const run: RunArchctxProcess = (_binary, args) => {
      if (args[0] === 'capabilities') return capabilities();
      return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(envelopeWithUnresolvedMajorSignal(JSON.parse(args[3]!) as ProjectionRequestV1)) };
    };
    const result = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run });
    expect(result).toMatchObject({ status: 'dead-letter', acknowledgeSourceEvents: false });
    expect(result.error).toContain('unresolved major change');
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(1);
    expect(existsSync(join(f.repoRoot, '.ai/harness/architecture-refresh/receipts'))).toBe(false);
  });

  test('manual drain reads the cursor authority and leaves the journal to its own consumer', () => {
    const f = fixture();
    writeFileSync(join(f.repoRoot, '.ai/harness/policy.json'), '{"architecture":{"projection_provider":"disabled","projection_apply":"disabled"}}\n');
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/rollback.ts', session_id: 'rollback' }) });
    writeFileSync(join(f.repoRoot, 'src/shell-written.ts'), 'export const written = 1;\n');
    const cli = realpathSync(join(import.meta.dir, '..', 'src', 'cli', 'index.ts'));
    const output = execFileSync(process.execPath, [cli, 'architecture-projection', 'drain', '--json'], {
      cwd: f.repoRoot,
      env: { ...process.env, PATH: '/usr/bin:/bin' },
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toMatchObject({ status: 'disabled', sourceJournalPending: 1 });
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(1);
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: f.repoRoot, encoding: 'utf8' }).trim();
    expect(readArchitectureDriftCursor(f.repoRoot)?.head_sha).toBe(head);
  });

  test('migrates v1 observations under the writer lock without losing coalesced dirty state', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/legacy.ts', session_id: 'legacy' }) });
    const dir = join(f.repoRoot, '.ai/harness/journal/post-edit/pending');
    const path = join(dir, readdirSync(dir)[0]!);
    const event = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, `${JSON.stringify({
      ...event,
      schema_version: 1,
      dirty: { ...event.dirty, 'contract-verification': true },
      payload: { ...event.payload, contract_verification: { contract_file: 'tasks/contracts/legacy.contract.md', checks_file: '.ai/harness/checks/latest.json' } },
    })}\n`);
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(0);
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/legacy.ts', session_id: 'legacy' }) });
    expect(readPendingPostEditEvents(f.repoRoot)[0]).toMatchObject({
      schema_version: 2,
      dirty: { 'contract-verification': true },
      payload: { contract_verification: { contract_file: 'tasks/contracts/legacy.contract.md' } },
    });
    expect(migratePendingPostEditJournalV1(f.repoRoot, 100)).toEqual({ migrated: 0, remaining: 0 });
    writeFileSync(path, `${JSON.stringify({ ...JSON.parse(readFileSync(path, 'utf8')), schema_version: 1 })}\n`);
    expect(migratePendingPostEditJournalV1(f.repoRoot, 100)).toEqual({ migrated: 1, remaining: 0 });
    expect(readPendingPostEditEvents(f.repoRoot)[0]?.schema_version).toBe(2);
  });

  test('assigns 150 seconds only to managed Stop.default for both hosts', () => {
    for (const host of ['claude', 'codex'] as const) {
      const hooks = buildManagedHooks(host, 'full');
      expect(hooks.Stop?.flatMap((entry) => entry.hooks).map((entry) => entry.timeout)).toEqual([150]);
      for (const [event, entries] of Object.entries(hooks)) {
        if (event === 'Stop') continue;
        expect(entries.flatMap((entry) => entry.hooks).every((entry) => entry.timeout === 30)).toBe(true);
      }
    }
  });

  test('consumes a typed refresh signal exactly once and persists output digests', () => {
    const f = fixture();
    let calls = 0;
    const signal = {
      schemaVersion: 'archcontext.architecture-refresh-signal/v1' as const,
      signalId: digest('a'), idempotencyKey: digest('b'), mode: 'refresh-required' as const,
      repository: { repositoryId: 'repo.test' },
      worktree: { workspaceId: 'workspace.test', headSha: '1'.repeat(40), worktreeDigest: digest('c') },
      cause: 'accepted-semantic-delta' as const,
      acceptedChange: { changeSetId: 'cs-1', eventId: 'event-1', reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'] },
      reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'], refreshTargets: ['architecture-docs'],
      baseDigests: { model: digest('d') }, resultingDigests: { model: digest('e') }, projectionReceiptDigest: digest('f'),
    };
    const run = () => {
      calls += 1;
      return [{ actionKey: 'architecture-queue:src/index.ts', action: 'architecture-queue' as const, status: 0, stdout: '[ArchitectureDrift] Request: test', stderr: '' }];
    };
    const first = consumeArchitectureRefreshSignals(f.repoRoot, [signal], ['src/index.ts'], { run });
    const second = consumeArchitectureRefreshSignals(f.repoRoot, [signal], ['src/index.ts'], { run });
    expect(calls).toBe(1);
    expect(second).toEqual(first);
    expect(first[0]?.actions[0]?.outputDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test('typed refresh authority runs canonical sync actions even when architecture-queue reports no drift card', () => {
    const f = fixture();
    const bin = join(dirname(f.repoRoot), 'refresh-bin');
    const calls = join(dirname(f.repoRoot), 'refresh-calls.txt');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'repo-harness'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$AXR6_REFRESH_CALLS"\nexit 0\n');
    chmodSync(join(bin, 'repo-harness'), 0o755);
    const signal = {
      schemaVersion: 'archcontext.architecture-refresh-signal/v1' as const,
      signalId: digest('g'), idempotencyKey: digest('h'), mode: 'refresh-required' as const,
      repository: { repositoryId: 'repo.test' },
      worktree: { workspaceId: 'workspace.test', headSha: '1'.repeat(40), worktreeDigest: digest('i') },
      cause: 'accepted-semantic-delta' as const,
      acceptedChange: { changeSetId: 'cs-2', eventId: 'event-2', reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'] },
      reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'], refreshTargets: ['architecture-docs'],
      baseDigests: { model: digest('j') }, resultingDigests: { model: digest('k') }, projectionReceiptDigest: digest('l'),
    };
    const [receipt] = consumeArchitectureRefreshSignals(f.repoRoot, [signal], ['src/index.ts'], {
      env: { ...process.env, PATH: bin, AXR6_REFRESH_CALLS: calls },
    });
    expect(receipt?.actions.map((action) => action.action)).toEqual([
      'architecture-queue',
      'context-contract-sync',
      'capability-context-request',
    ]);
    expect(readFileSync(calls, 'utf8').trim().split('\n')).toEqual([
      'run architecture-queue record --file src/index.ts',
      'run context-contract-sync sync-latest',
      'capability-context request --from-latest-architecture-event',
    ]);
  });

  test('default refresh runner checkpoints each successful action before the next deadline check', () => {
    const f = fixture();
    const bin = join(dirname(f.repoRoot), 'checkpoint-bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'repo-harness'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(bin, 'repo-harness'), 0o755);
    const signal = {
      schemaVersion: 'archcontext.architecture-refresh-signal/v1' as const,
      signalId: digest('5'), idempotencyKey: digest('6'), mode: 'refresh-required' as const,
      repository: { repositoryId: 'repo.test' },
      worktree: { workspaceId: 'workspace.test', headSha: '1'.repeat(40), worktreeDigest: digest('7') },
      cause: 'accepted-semantic-delta' as const,
      acceptedChange: { changeSetId: 'cs-4', eventId: 'event-4', reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'] },
      reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'], refreshTargets: ['architecture-readiness'],
      baseDigests: { modelDigest: digest('8'), sourceTreeDigest: digest('9'), flowProofDigest: digest('a'), projectionDigest: digest('b') },
      resultingDigests: { modelDigest: digest('c'), sourceTreeDigest: digest('d'), flowProofDigest: digest('e'), projectionDigest: digest('f') },
      projectionReceiptDigest: digest('0'),
    };
    let clockReads = 0;
    expect(() => consumeArchitectureRefreshSignals(f.repoRoot, [signal], ['src/a.ts', 'src/b.ts'], {
      env: { ...process.env, PATH: bin },
      deadlineMs: 1_000,
      nowMs: () => clockReads++ === 0 ? 0 : 2_000,
    })).toThrow('timeout before canonical action');
    const progressPath = join(f.repoRoot, '.ai/harness/architecture-projection/refresh-progress', `${signal.signalId.replace(/^sha256:/, '')}.json`);
    expect(JSON.parse(readFileSync(progressPath, 'utf8')).actions.map((entry: { actionKey: string }) => entry.actionKey)).toEqual(['architecture-queue:src/a.ts']);
    let resumedFrom: string[] = [];
    const [receipt] = consumeArchitectureRefreshSignals(f.repoRoot, [signal], ['src/a.ts', 'src/b.ts'], {
      run: (_root, _signal, _paths, _env, completed) => {
        resumedFrom = [...completed];
        return [
          { actionKey: 'architecture-queue:src/b.ts', action: 'architecture-queue', status: 0, stdout: '', stderr: '' },
          { actionKey: 'context-contract-sync', action: 'context-contract-sync', status: 0, stdout: '', stderr: '' },
          { actionKey: 'capability-context-request', action: 'capability-context-request', status: 0, stdout: '', stderr: '' },
        ];
      },
    });
    expect(resumedFrom).toEqual(['architecture-queue:src/a.ts']);
    expect(receipt?.actions).toHaveLength(4);
  });

  test('refresh retry resumes after the last durable action progress record', () => {
    const f = fixture();
    const signal = {
      schemaVersion: 'archcontext.architecture-refresh-signal/v1' as const,
      signalId: digest('m'), idempotencyKey: digest('n'), mode: 'refresh-required' as const,
      repository: { repositoryId: 'repo.test' },
      worktree: { workspaceId: 'workspace.test', headSha: '1'.repeat(40), worktreeDigest: digest('o') },
      cause: 'accepted-semantic-delta' as const,
      acceptedChange: { changeSetId: 'cs-3', eventId: 'event-3', reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'] },
      reasonCodes: ['responsibility-changed'], affectedNodeIds: ['capability.test.root'], refreshTargets: ['architecture-docs'],
      baseDigests: { model: digest('p') }, resultingDigests: { model: digest('q') }, projectionReceiptDigest: digest('r'),
    };
    const observedCompleted: string[][] = [];
    let attempt = 0;
    const run: RunArchitectureRefreshActions = (_root, _signal, _paths, _env, completed) => {
      observedCompleted.push([...completed].sort());
      attempt += 1;
      return attempt === 1
        ? [
            { actionKey: 'architecture-queue:src/a.ts', action: 'architecture-queue' as const, status: 0, stdout: '', stderr: '' },
            { actionKey: 'architecture-queue:src/b.ts', action: 'architecture-queue' as const, status: 1, stdout: '', stderr: 'failed' },
          ]
        : [
            { actionKey: 'architecture-queue:src/b.ts', action: 'architecture-queue' as const, status: 0, stdout: '', stderr: '' },
            { actionKey: 'context-contract-sync', action: 'context-contract-sync' as const, status: 0, stdout: '', stderr: '' },
            { actionKey: 'capability-context-request', action: 'capability-context-request' as const, status: 0, stdout: '', stderr: '' },
          ];
    };
    expect(() => consumeArchitectureRefreshSignals(f.repoRoot, [signal], ['src/a.ts', 'src/b.ts'], { run })).toThrow('failed with exit 1');
    const [receipt] = consumeArchitectureRefreshSignals(f.repoRoot, [signal], ['src/a.ts', 'src/b.ts'], { run });
    expect(observedCompleted).toEqual([[], ['architecture-queue:src/a.ts']]);
    expect(receipt?.actions.map((action) => action.actionKey)).toEqual([
      'architecture-queue:src/a.ts',
      'architecture-queue:src/b.ts',
      'context-contract-sync',
      'capability-context-request',
    ]);
  });
});
