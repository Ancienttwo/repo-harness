import { afterAll, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { deniedCalls, processApi } from './offline-guard.ts';
import { parseReviewThreads, resolveChecks, WatcherQueryError } from './vendor/github.ts';
import { classifyPr, createQueueState, applyQueueSnapshot, evaluateQueue, planQueue, readSnapshot, runSimple, runQueued } from './vendor/policy.ts';
import { renderJson, renderPretty } from './vendor/render.ts';
import { fakeReader, passingCheck, failedCheck } from './vendor/fakes.test-helper.ts';
import type { GitHubReader, PrContext, PrDecision, ProgressVerdict, PrSnapshot, TerminalVerdict } from './vendor/types.ts';
import { BASE, HEAD, OTHER, Cancelled, changePr, check, collectBaseline, context, fixture, frozen, logicalClock, options, projectStackRow, thread, watcherReader, type Fixture } from './fixtures.ts';
import { simplePoll } from './baseline-poller.ts';

const report: Record<string, unknown> = { schemaVersion: 1, scope: 'private offline fixture comparison', semantics: 'Observer READY is not harness GO; exit 0 is not acceptance.', matrix: [] };
const rows = report.matrix as Record<string, unknown>[];
async function observe(f: Fixture) {
  const w = watcherReader(f);
  const row = await readSnapshot({ reader: w.reader, context: context(f.pr.number), pendingHistory: 'include', allowDraft: false });
  return { decision: classifyPr(row), snapshot: row, calls: w.calls, source: w.source };
}
const cases: [Fixture, boolean, PrDecision['kind'], string][] = [
  [fixture(), true, 'ready', 'same-scope'],
  [fixture('pending', { checks: [check('pending')] }), false, 'waiting', 'same-scope'],
  [fixture('failed', { checks: [check('fail')] }), false, 'blocker', 'same-scope'],
  [fixture('unknown-check-bucket', { checks: [{ ...check(), bucket: 'future', state: 'FUTURE' }] }), false, 'blocker', 'same-scope'],
  [fixture('unresolved-thread', { threads: [thread(1, false)] }), false, 'blocker', 'same-scope'],
  [changePr('draft', { isDraft: true }), false, 'blocker', 'same-scope'],
  [changePr('changes-requested', { reviewDecision: 'CHANGES_REQUESTED' }), false, 'blocker', 'same-scope'],
  [changePr('conflict', { mergeable: 'CONFLICTING' }), false, 'blocker', 'same-scope'],
  [changePr('unknown-mergeability', { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }), false, 'ready', 'unknown-observation'],
  [fixture('code-review-gate-pending', { checks: [check(), check('pending', 'Code Review Gate')] }), false, 'ready', 'intentional-observer-semantics'],
  [fixture('required-ci-missing', { checks: [check('pass', 'other')] }), false, 'ready', 'harness-authority-scope'],
  [changePr('head-identity-mismatch', { headRefOid: OTHER }), false, 'ready', 'harness-authority-scope'],
  [changePr('base-identity-mismatch', { baseRefOid: OTHER }), false, 'ready', 'harness-authority-scope'],
  [fixture('head-changes-between-reads', { identityStates: [{ headRefOid: HEAD }, { headRefOid: OTHER }] }), false, 'ready', 'observation-consistency'],
  [fixture('base-changes-between-reads', { identityStates: [{ baseRefOid: BASE }, { baseRefOid: OTHER }] }), false, 'ready', 'observation-consistency'],
  [fixture('review-head-binding-mismatch', { graphHead: OTHER }), false, 'ready', 'observation-consistency'],
  [fixture('review-base-binding-mismatch', { graphBase: OTHER }), false, 'ready', 'observation-consistency'],
  [fixture('100-resolved-has-next-page', { threads: Array.from({ length: 100 }, (_, i) => thread(i)), hasNextPage: true }), false, 'ready', 'incomplete-observation'],
  [fixture('100-resolved-last-page', { threads: Array.from({ length: 100 }, (_, i) => thread(i)), hasNextPage: false }), true, 'ready', 'same-scope'],
  [fixture('101-full-threads-last-unresolved', { threads: Array.from({ length: 101 }, (_, i) => thread(i, i < 100)) }), false, 'blocker', 'same-scope'],
  [fixture('graphql-partial-error', { graphErrors: [{ message: 'partial fixture response' }] }), false, 'ready', 'decoder-only-transport-unverified'],
];

describe('same frozen facts through both candidates', () => {
  for (const [f, ready, decision, category] of cases) it(f.name, async () => {
    expect(Object.isFrozen(f)).toBe(true);
    const baseline = collectBaseline(f);
    const watcher = await observe(f);
    expect(baseline.result.ready).toBe(ready);
    expect(watcher.decision.kind).toBe(decision);
    if (f.identityStates) {
      expect(baseline.result.blockers.map(b => b.code)).toContain('changed_during_read');
      expect(watcher.source.identityReads).toHaveLength(1);
      expect(baseline.source.identityReads).toHaveLength(4);
      expect(watcher.source.identityReads[0]).toEqual(baseline.source.identityReads[0]);
      expect(watcher.source.transitions[0]).toEqual(baseline.source.transitions[0]);
      expect(watcher.source.current()).toEqual(watcher.source.transitions[0].after);
      const changedField = f.name.startsWith('head-') ? 'headRefOid' : 'baseRefOid';
      expect(watcher.source.current()[changedField]).not.toBe(watcher.source.identityReads[0][changedField]);
    }
    if (f.name === 'head-identity-mismatch') expect(baseline.result.blockers.map(b => b.code)).toContain('head_moved');
    if (f.name === 'base-identity-mismatch') expect(baseline.result.blockers.map(b => b.code)).toContain('base_moved_since_verification');
    rows.push({ name: f.name, category, harnessReady: ready, harnessBlockers: baseline.result.blockers.map(b => b.code),
      observerDecision: decision, falseReadyIfMisusedAsGate: !ready && decision === 'ready',
      collectorLogicalProviderReads: baseline.calls.length, observerLogicalProviderReads: watcher.calls.length,
      ...(f.identityStates ? { temporalReplay: {
        trigger: 'facts response captured; identity moves before observation returns',
        initialIdentityEqual: true, firstTransitionEqual: true,
        observerIdentityReads: watcher.source.identityReads.length,
        collectorIdentityReads: baseline.source.identityReads.length,
        observerFirstHead: watcher.source.identityReads[0].headRefOid,
        observerEndingHead: watcher.source.current().headRefOid,
        observerFirstBase: watcher.source.identityReads[0].baseRefOid,
        observerEndingBase: watcher.source.current().baseRefOid,
      } } : {}),
    });
  });
});

it('does not confuse status-only exit zero with acceptance', async () => {
  const f = fixture('failed', { checks: [check('fail')] });
  const w = watcherReader(f);
  const c = logicalClock();
  const terminal = await runSimple({ contexts: [context()], mode: 'single', statusOnly: true, options,
    dependencies: { reader: w.reader, clock: c.clock, emit: () => {} } });
  expect(terminal.kind).toBe('STATUS');
  expect(terminal.exitCode).toBe(0);
  expect(collectBaseline(f).result.ready).toBe(false);
  report.statusOnly = { observer: terminal.kind, exitCode: terminal.exitCode, harnessReady: false };
});

it('shows thread hasNextPage true and false use the same upstream decoder', () => {
  const response = (hasNextPage: boolean) => ({ data: { repository: { pullRequest: {
    reviewThreads: { nodes: [thread(1)], pageInfo: { hasNextPage } },
  } } } });
  expect(parseReviewThreads(response(false))).toEqual([]);
  expect(parseReviewThreads(response(true))).toEqual([]);
  // The upstream query does not request pageInfo. A reader adapter must add
  // completeness evidence, not infer completeness from this empty result.
});

it('reads every check fallback page; terminal false-equivalent stops without another read', async () => {
  const r = fakeReader({ fastPath: { kind: 'unusable', exitCode: 8, stderr: '' }, rollupPages: [
    { checks: Array.from({ length: 100 }, (_, i) => passingCheck(`ci-${i}`)), endCursor: 'page-2' },
    { checks: [failedCheck('hidden-101')], endCursor: null },
  ] });
  const result = await resolveChecks(r, context());
  expect(result.checks).toHaveLength(101);
  expect(result.checks[100].kind).toBe('failed');
  expect(r.calls).toEqual(['checksFastPath', 'checkRollupPage:null', 'checkRollupPage:page-2']);
  report.checkPagination = { checks: result.checks.length, failedAt: 101, readerCalls: r.calls.length,
    limit: 'Reader-level cursor contract tested; live GhGitHubReader transport is not executed.' };
});

it('does not hide the unbounded repeated-cursor assumption', async () => {
  let pageReads = 0;
  const base = watcherReader(fixture());
  const reader: GitHubReader = Object.freeze({ ...base.reader,
    async checksFastPath() { return { kind: 'unusable' as const, exitCode: 8, stderr: '' }; },
    async checkRollupPage() {
      pageReads++;
      if (pageReads === 3) throw new Cancelled();
      return { checks: [passingCheck()], endCursor: 'same-cursor' };
    },
  });
  await expect(resolveChecks(reader, context())).rejects.toBeInstanceOf(Cancelled);
  expect(pageReads).toBe(3);
  report.repeatedCursor = { boundedByFixtureCancellation: true, upstreamRepeatedPageGuard: false,
    adapterNeed: 'Reject repeated cursors and impose an explicit page budget before live use.' };
});

it('records duplicate waiting events in simple mode versus a minimal dedup poller', async () => {
  const pending = fixture('pending', { checks: [check('pending')] });
  const w = watcherReader(pending);
  const c = logicalClock();
  const events: ProgressVerdict[] = [];
  const terminal = await runSimple({ dependencies: { reader: w.reader, clock: c.clock, emit: e => events.push(e) },
    contexts: [context()], mode: 'single', statusOnly: false, options: { ...options, timeout: 20 } });
  const baselineClock = logicalClock();
  const notifications: string[] = [];
  let baselineReads = 0;
  await simplePoll({ clock: baselineClock.clock, interval: 10, timeout: 20,
    read: () => { const b = collectBaseline(pending); baselineReads += b.calls.length;
      return { ready: b.result.ready, unavailable: false, key: b.result.blockers.map(b => b.code).join(',') }; },
    emit: event => notifications.push(event.key) });
  expect(terminal.kind).toBe('TIMEOUT');
  expect(events.filter(e => e.kind === 'WAITING')).toHaveLength(3);
  expect(notifications).toEqual(['checks_pending']);
  report.duplicateWaits = { polls: 3, observerNotifications: events.length, baselineNotifications: notifications.length,
    observerDuplicates: 2, baselineDuplicates: 0, observerLogicalProviderReads: w.calls.length, collectorLogicalProviderReads: baselineReads };
});

it('measures recovery and the request-count versus latency tradeoff', async () => {
  const c = logicalClock();
  const base = watcherReader(fixture());
  let attempts = 0;
  const reader: GitHubReader = Object.freeze({ ...base.reader, async pullRequest(ctx: PrContext) {
    attempts++;
    if (c.clock.now() < 120) throw new WatcherQueryError({ kind: 'command-exit', retryable: true, detail: 'rate limit fixture', code: 1 });
    return base.reader.pullRequest(ctx);
  } });
  const events: ProgressVerdict[] = [];
  const terminal = await runSimple({ dependencies: { reader, clock: c.clock, emit: e => events.push(e) },
    contexts: [context()], mode: 'single', statusOnly: false, options: { ...options, timeout: 600 } });
  expect(terminal.kind).toBe('READY');
  expect(c.sleeps).toEqual([60, 120]);
  const bc = logicalClock();
  let baselineReads = 0;
  const notifications: string[] = [];
  const b = await simplePoll({ clock: bc.clock, interval: 10, timeout: 600,
    read: () => { const v = collectBaseline(fixture('recovery', { unavailable: bc.clock.now() < 120 }));
      baselineReads += v.calls.length;
      return { ready: v.result.ready, unavailable: v.result.blockers.some(b => b.code === 'provider_unavailable'), key: JSON.stringify(v.result) }; },
    emit: e => notifications.push(e.key) });
  expect(b.outcome).toBe('ready');
  expect(b.polls).toBe(13);
  expect(attempts).toBe(3);
  report.recovery = { serviceAvailableAtSeconds: 120, observerRecoveredAtSeconds: c.clock.now(), baselineRecoveredAtSeconds: bc.clock.now(),
    observerAttempts: attempts, baselineAttempts: b.polls, observerLogicalProviderReads: base.calls.length + 2, collectorLogicalProviderReads: baselineReads,
    observerRetries: events.filter(e => e.kind === 'RETRY').length, baselineNotifications: notifications.length,
    warning: 'Endpoint totals include different observation contracts. Attempts and logical time show the scheduler tradeoff.' };
});

it('stops at the query failure bound and never treats API errors as ready', async () => {
  const f = fixture('unavailable', { unavailable: true });
  const w = watcherReader(f); const c = logicalClock();
  const terminal = await runSimple({ dependencies: { reader: w.reader, clock: c.clock, emit: () => {} },
    contexts: [context()], mode: 'single', statusOnly: false, options: { ...options, maxQueryErrors: 3, timeout: 600 } });
  expect(terminal).toMatchObject({ kind: 'BLOCKER', exitCode: 7 });
  expect(w.calls).toHaveLength(3);
  expect(collectBaseline(f).result).toMatchObject({ ready: false, blockers: [{ code: 'provider_unavailable' }] });
});

it('cancels both injected loops without further reads or an acceptance result', async () => {
  const f = fixture('pending', { checks: [check('pending')] });
  const w = watcherReader(f); const c = logicalClock(1);
  await expect(runSimple({ dependencies: { reader: w.reader, clock: c.clock, emit: () => {} }, contexts: [context()],
    mode: 'single', statusOnly: false, options })).rejects.toBeInstanceOf(Cancelled);
  const reads = w.calls.length;
  await Promise.resolve(); expect(w.calls).toHaveLength(reads);
  const bc = logicalClock(1); let polls = 0;
  await expect(simplePoll({ clock: bc.clock, interval: 10, timeout: 600,
    read: () => { polls++; return { ready: false, unavailable: false, key: 'checks_pending' }; }, emit: () => {} })).rejects.toBeInstanceOf(Cancelled);
  expect(polls).toBe(1);
  report.cancellation = { observerReads: reads, baselinePolls: polls, postCancelReads: 0,
    limit: 'Cancellation is a throwing injected clock. Upstream has no AbortSignal contract or live child cancellation test.' };
});

async function snapshot(f: Fixture): Promise<PrSnapshot> { return (await observe(f)).snapshot; }
it('keeps ready stack segments observational and records a moved base', async () => {
  const root = fixture();
  const stack = [
    root,
    fixture('middle-pending', { pr: { ...root.pr, number: 2, headRefOid: OTHER, headRefName: 'feature-2', baseRefName: 'feature', baseRefOid: HEAD },
      expectedHead: OTHER, expectedBase: HEAD, checks: [check('pending')] }),
    fixture('top-base-moved', { pr: { ...root.pr, number: 3, headRefOid: 'd'.repeat(40), headRefName: 'feature-3', baseRefName: 'feature-2', baseRefOid: 'e'.repeat(40) },
      expectedHead: 'd'.repeat(40), expectedBase: OTHER }),
  ];
  const bs = stack.map(projectStackRow);
  const wr = await Promise.all(stack.map(snapshot));
  const decisions = wr.map(row => classifyPr(row).kind);
  const prefix: number[] = [];
  for (let i = 0; i < bs.length && bs[i].ready; i++) prefix.push(i + 1);
  expect(prefix).toEqual([1]);
  expect(wr.map(row => Number(row.context.number))).toEqual([1, 2, 3]);
  expect(decisions).toEqual(['ready', 'waiting', 'ready']);
  expect(bs[2].blockers.map(b => b.code)).toContain('base_moved_since_verification');
  report.stackSegments = { pureHarnessReadyPrefix: prefix, observerRowDecisions: decisions,
    observerTopReadyAfterBaseMove: true, semantics: 'Neither a per-row observer result nor a contiguous segment authorizes a stack merge.' };
});

it('queue cache deduplicates waits but can hide a changed pending check with the same count', async () => {
  const first = fixture('first', { checks: [check(), check('pending', 'build')] });
  const next = fixture('next', { checks: [check(), check('pending', 'security')] });
  let state = createQueueState([context()], 0);
  state = applyQueueSnapshot(state, await snapshot(first), 0, options).state;
  const a = evaluateQueue(state, 0, options);
  expect(a).toMatchObject({ kind: 'waiting', emit: true });
  state = planQueue(a.state, 10);
  state = applyQueueSnapshot(state, await snapshot(next), 10, options).state;
  const b = evaluateQueue(state, 10, options);
  expect(b).toMatchObject({ kind: 'waiting', emit: false });
  const bc = logicalClock();
  const notifications: string[] = [];
  await simplePoll({ clock: bc.clock, interval: 10, timeout: 10,
    read: () => {
      const r = collectBaseline(bc.clock.now() === 0 ? first : next).result;
      return { ready: r.ready, unavailable: false, key: r.blockers.map(b => b.code).join(',') };
    }, emit: value => notifications.push(value.key),
  });
  expect(notifications).toEqual(['checks_pending']);
  report.queueDedup = { repeatedWaitSuppressed: true, sameCountChangedCheckSuppressed: true,
    baselineChangedCheckSuppressed: true,
    sharedLimitation: 'The small baseline keys blocker codes only. Both candidates suppress build-to-security while still pending.',
    adapterNeed: 'Notification key must include meaningful changed content and exact subject identity.' };
});

it('measures a three-row queued cadence and makes cached upper-row staleness explicit', async () => {
  const c = logicalClock();
  const calls: number[] = [];
  const base = watcherReader(fixture());
  const reader: GitHubReader = Object.freeze({ ...base.reader, async pullRequest(ctx: PrContext) {
    calls.push(ctx.number);
    const merged = c.clock.now() >= ctx.number * 10;
    return { ...(await base.reader.pullRequest(ctx)), state: merged ? 'MERGED' as const : 'OPEN' as const, mergedAt: merged ? '2026-10-06T00:00:00Z' : null };
  } });
  const events: ProgressVerdict[] = [];
  const terminal = await runQueued({ contexts: [context(1), context(2), context(3)], options,
    dependencies: { reader, clock: c.clock, emit: e => events.push(e) } });
  expect(terminal.kind).toBe('COMPLETE');
  expect(calls).toEqual([1, 2, 3, 1, 2, 2, 3, 3]);
  // Minimal full-active-set poller: each round reads each still-active row.
  let baselineReads = 0;
  let active = [1, 2, 3];
  for (const now of [0, 10, 20, 30]) {
    active = active.filter(number => {
      baselineReads++;
      const f = fixture(`stack-${number}`, { pr: { ...fixture().pr, number, state: now >= number * 10 ? 'MERGED' : 'OPEN' } });
      projectStackRow(f);
      return f.pr.state !== 'MERGED';
    });
  }
  expect(baselineReads).toBe(9);
  report.queueCadence = { observerSnapshotReads: calls.length, baselineSnapshotReads: baselineReads,
    observerLogicalProviderReads: base.calls.length, advances: events.filter(e => e.kind === 'ADVANCE').length,
    warning: 'Snapshot counts compare schedules. Pure baseline snapshot reads are not HTTP request counts. Upstream caches upper rows until the sweep.' };
  // Upper base changes after initial sweep are not observed in frontier polls.
  const upperMoved = changePr('upper-moved', { number: 2, baseRefOid: OTHER });
  const q = [context(1), context(2)] as const;
  let state = createQueueState(q, 0);
  state = applyQueueSnapshot(state, await snapshot(fixture()), 0, options).state;
  state = applyQueueSnapshot(state, await snapshot(changePr('upper-original', { number: 2 })), 0, options).state;
  expect(planQueue(state, 10).work?.kind).toBe('frontier-poll');
  expect(projectStackRow(upperMoved).ready).toBe(false);
  expect(state.snapshots.get(context(2).number)?.facts.baseRefName).toBe('main');
  report.upperRowStaleness = { baseChangeVisibleToPureProjection: true, nextUpstreamSweepAtSeconds: state.nextSweepAt,
    limitation: 'Frozen queue has no exact base identity or automatic upper-row invalidation.' };
});

it('verifies that the process import is the denied fixture transport', () => {
  expect(spawnSync as unknown).toBe(processApi.spawnSync as unknown);
});

const PRIVATE_EXPERIMENT_PATH = 'experiments/private/pstack-watch-pr';
function packageEntryExposesPrivateFiles(entry: string): boolean {
  // This small guard accepts plain relative file/directory entries only.
  // New globs or invalid paths require review, never an inferred safe match.
  if (/[?*\[\]{}!()\\]/.test(entry)) return true;
  const listed = entry.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!listed || listed.split('/').some(part => !part || part === '.' || part === '..')) return true;
  return listed === PRIVATE_EXPERIMENT_PATH
    || listed.startsWith(`${PRIVATE_EXPERIMENT_PATH}/`)
    || PRIVATE_EXPERIMENT_PATH.startsWith(`${listed}/`);
}

it('rejects private package exports at every overlap and fails closed on globs', () => {
  const parts = PRIVATE_EXPERIMENT_PATH.split('/');
  const ancestors = [parts.slice(0, 1).join('/'), parts.slice(0, 2).join('/')];
  for (const path of [
    PRIVATE_EXPERIMENT_PATH, `${PRIVATE_EXPERIMENT_PATH}/`, `./${PRIVATE_EXPERIMENT_PATH}`,
    ...ancestors, `${PRIVATE_EXPERIMENT_PATH}/vendor`, `${PRIVATE_EXPERIMENT_PATH}/vendor/github.ts`,
    `${ancestors[0]}/**`, `${PRIVATE_EXPERIMENT_PATH}/**`,
    `@(${ancestors[0]})/${parts.slice(1).join('/')}`, `+(${ancestors[0]})/${parts.slice(1).join('/')}`,
    'assets/*.md', '', '.', '..',
  ]) expect(packageEntryExposesPrivateFiles(path)).toBe(true);
  for (const path of [`${ancestors[1]}/unrelated`, `${PRIVATE_EXPERIMENT_PATH}-other`, `${ancestors[0]}-other/`]) {
    expect(packageEntryExposesPrivateFiles(path)).toBe(false);
  }
});

it('preserves upstream MIT bytes and renders explicit non-authoritative output', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  expect(manifest.files.some(packageEntryExposesPrivateFiles)).toBe(false);
  const provenance = JSON.parse(readFileSync(new URL('./PROVENANCE.json', import.meta.url), 'utf8'));
  for (const f of provenance.files) {
    const bytes = readFileSync(new URL(f.local, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(f.sha256);
    expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(f.upstreamBlobSha);
  }
  const license = readFileSync(new URL('./vendor/LICENSE', import.meta.url), 'utf8');
  expect(license).toContain('Copyright (c) 2026 Lauren Tan');
  const c = logicalClock(); const w = watcherReader(fixture());
  const terminal: TerminalVerdict = await runSimple({ dependencies: { reader: w.reader, clock: c.clock, emit: () => {} },
    contexts: [context()], mode: 'single', statusOnly: false, options });
  const json = JSON.parse(renderJson(terminal));
  expect(json).toMatchObject({ kind: 'READY', exitCode: 0, schemaVersion: 1 });
  expect(renderPretty(terminal)).toContain('READY:');
  report.outputSample = { authority: 'observation-only', acceptance: 'not-granted', upstream: json,
    harness: collectBaseline(fixture()).result };
});

afterAll(() => {
  expect(deniedCalls).toEqual([]);
  report.measurementUnits = 'Logical provider reads are injected collector gh commands or watcher reader methods. They are not actual HTTP requests, latency, CPU, or production throughput. External API requests are zero.';
  report.summary = {
    cases: rows.length,
    sameScopeMissedBlockers: rows.filter(r => r.category === 'same-scope' && !r.harnessReady && r.observerDecision === 'ready').length,
    falseReadyIfMisusedAsGate: rows.filter(r => r.falseReadyIfMisusedAsGate).length,
    observerComparisonFalseReadyIfMisusedAsGate: rows.filter(r => r.falseReadyIfMisusedAsGate && r.category !== 'decoder-only-transport-unverified').length,
    decoderOnlyFalseReadyIfMisusedAsGate: rows.filter(r => r.falseReadyIfMisusedAsGate && r.category === 'decoder-only-transport-unverified').length,
    authorityChanges: 0, networkOrProcessCalls: deniedCalls.length, addedDependencies: 0,
  };
  console.log(`PSTACK_EXPERIMENT_RESULT=${JSON.stringify(report)}`);
});
