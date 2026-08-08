import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { projectionResultReceiptDigest, type ArchitectureProjectionPolicy, type ProjectionRequestV1 } from '../src/core/architecture/projection';
import { runMutationObserved, consumePendingPostEditEvents, readPendingPostEditEvents, migratePendingPostEditJournalV1 } from '../src/cli/hook/mutation-observed';
import { drainArchitectureProjectionJobs } from '../src/effects/architecture/projection-orchestrator';
import {
  architectureProjectionJobState,
  architectureProjectionJobId,
  architectureProjectionQueueState,
  claimNextArchitectureProjectionJob,
  enqueueArchitectureProjectionJob,
  recoverAbandonedArchitectureProjectionJobs,
  retryArchitectureProjectionDeadLetter,
} from '../src/effects/architecture/projection-jobs';
import type { ArchctxProcessResult, RunArchctxProcess } from '../src/effects/architecture/archctx-provider';
import { buildManagedHooks } from '../src/cli/installer/managed-entries';
import { consumeArchitectureRefreshSignals } from '../src/effects/architecture/refresh-consumer';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = (token: string) => `sha256:${token.repeat(64).slice(0, 64)}` as const;
const policy: ArchitectureProjectionPolicy = { provider: 'archctx', applyMode: 'automatic', failureGate: 'advisory', requiredVersion: '0.4.0', timeoutMs: 120_000 };

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-axr6-'));
  roots.push(root);
  const repoRoot = join(root, 'repo');
  const consumerRoot = join(root, 'consumer');
  mkdirSync(join(repoRoot, '.ai/harness'), { recursive: true });
  mkdirSync(join(repoRoot, '.archcontext/model/nodes'), { recursive: true });
  mkdirSync(join(repoRoot, 'src'), { recursive: true });
  mkdirSync(join(consumerRoot, 'node_modules/archctx/bin'), { recursive: true });
  writeFileSync(join(repoRoot, '.ai/harness/policy.json'), `${JSON.stringify({ architecture: { projection_provider: 'archctx', projection_apply: 'automatic', projection_version: '0.4.0', projection_timeout_ms: 120000 } })}\n`);
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
  writeFileSync(join(consumerRoot, 'node_modules/archctx/package.json'), `${JSON.stringify({ name: 'archctx', version: '0.4.0', bin: { archctx: './bin/archctx' } })}\n`);
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
    package: { name: 'archctx', version: '0.4.0' },
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
  const body = {
    schemaVersion: 'archcontext.projection-result/v1' as const,
    requestId: request.requestId,
    status: 'applied' as const,
    inputSnapshot: snapshot,
    outputSnapshot: snapshot,
    affectedNodeIds: [], files: [], humanActions: [], refreshSignals: [],
  };
  return { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'projection.run', data: { ...body, receiptDigest: projectionResultReceiptDigest(body) } };
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
    const replay = drain(f.repoRoot, { consumerRoot: f.consumerRoot, policy, run: failed });
    expect(replay.status).toBe('dead-letter');
    expect(replay.acknowledgeSourceEvents).toBe(false);
    expect(replay.jobId).toBe(architectureProjectionQueueState(f.repoRoot).oldestDeadLetterJobId);
  });

  test('allows only one running provider job per repository', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    const first = enqueueArchitectureProjectionJob(root, ['event-a'], ['src/a.ts']);
    expect(claimNextArchitectureProjectionJob(root)?.jobId).toBe(first?.jobId);
    expect(enqueueArchitectureProjectionJob(root, ['event-b'], ['src/b.ts'])).toBeNull();
    expect(claimNextArchitectureProjectionJob(root)).toBeNull();
    expect(architectureProjectionQueueState(root)).toMatchObject({ pending: 0, running: 1 });
  });

  test('recovers a running job whose owner process died without acknowledging its source event', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/crash.ts', session_id: 'crash' }) });
    const [source] = readPendingPostEditEvents(root);
    const queued = enqueueArchitectureProjectionJob(root, [source!.event_id], source!.changed_paths);
    const running = claimNextArchitectureProjectionJob(root);
    expect(running?.jobId).toBe(queued?.jobId);
    const runningPath = join(root, '.ai/harness/architecture-projection/running', `${running!.jobId}.json`);
    writeFileSync(runningPath, `${JSON.stringify({ ...running, ownerPid: 2_147_483_647 }, null, 2)}\n`);

    expect(recoverAbandonedArchitectureProjectionJobs(root)).toBe(1);
    expect(architectureProjectionJobState(root, running!.jobId)).toBe('pending');
    expect(readPendingPostEditEvents(root).map((event) => event.event_id)).toEqual([source!.event_id]);
  });

  test('recovers a stale running job even when its PID has been reused', () => {
    const f = fixture();
    const root = realpathSync(f.repoRoot);
    const queued = enqueueArchitectureProjectionJob(root, ['event-stale'], ['src/stale.ts'], new Date('2026-01-01T00:00:00.000Z'));
    const running = claimNextArchitectureProjectionJob(root, new Date('2026-01-01T00:00:01.000Z'));
    expect(running?.jobId).toBe(queued?.jobId);
    expect(running?.ownerPid).toBe(process.pid);
    expect(recoverAbandonedArchitectureProjectionJobs(root, new Date('2026-01-01T00:16:00.000Z'))).toBe(1);
    expect(architectureProjectionJobState(root, running!.jobId)).toBe('pending');
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

  test('migrates v1 observations once and keeps the runtime reader v2-only', () => {
    const f = fixture();
    runMutationObserved({ collector: f.collector, input: JSON.stringify({ file_path: 'src/legacy.ts', session_id: 'legacy' }) });
    const dir = join(f.repoRoot, '.ai/harness/journal/post-edit/pending');
    const path = join(dir, readdirSync(dir)[0]!);
    const event = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, `${JSON.stringify({ ...event, schema_version: 1 })}\n`);
    expect(readPendingPostEditEvents(f.repoRoot)).toHaveLength(0);
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
      return [{ action: 'architecture-queue' as const, status: 0, stdout: '[ArchitectureDrift] Request: test', stderr: '' }];
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
});
