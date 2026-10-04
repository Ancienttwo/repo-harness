import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, statSync, utimesSync, mkdtempSync, mkdirSync, cpSync, symlinkSync, readdirSync, readFileSync, writeFileSync, unlinkSync, appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { buildEngineerOffersDocument, type EngineerOfferV1, type EngineerOffersV1 } from '../../src/core/engineers/scheduling';
import type { EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import { canonicalEngineerJson, engineerSha256 } from '../../src/core/engineers/profile-binding';
import { observeRetryEligibility } from '../../src/core/engineers/automation-attempt';
import { withExclusiveDirectoryLock } from '../../src/effects/locking/exclusive-directory-lock';
import { coordinationRoot } from '../../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { acquireNextScheduledEngineerTask, acquireSelectedEngineerTask, prepareEngineerObservation, readEngineerObservation, inspectAcquisitionReceiptCutover, migrateAcquisitionReceipts, requireAcquisitionLedgerV2, EngineerAcquisitionLedgerError, EngineerObservationError, type AcquireSelectedEngineerTaskOptions } from '../../src/effects/engineers/scheduling-acquire-next';

const D = (c: string) => `sha256:${c.repeat(64)}`;
const principal = Object.freeze({
  protocol: 1, kind: 'repo-harness-engineer-principal', repository_id: 'repo_0123456789abcdef',
  engineer_id: 'engineer:capability.demo.worker', binding_id: '11111111-1111-4111-8111-111111111111',
  binding_generation: 1, engineer_contract_revision: D('a'), carrier: 'mcp_oauth',
  auth_subject: '22222222-2222-4222-8222-222222222222', provider: 'unknown', provider_thread_id: null,
}) as EngineerPrincipalV1;

function root(): string {
  const path = mkdtempSync(join(tmpdir(), 'issue-280-'));
  execFileSync('git', ['init', '-q'], { cwd: path });
  return path;
}

function offer(id: string, priority: number): EngineerOfferV1 {
  return {
    protocol: 1, kind: 'repo-harness-engineer-offer', repository_id: principal.repository_id,
    sprint_path: 'plans/sprints/demo.sprint.md', work_package_id: id, work_package_revision: D('b'),
    work_graph_revision: D('c'), task_id: 'd'.repeat(64), task_revision: 'e'.repeat(64),
    primary_capability: 'capability.demo', priority, dependency_state: 'ready', dependency_revision: D('f'),
    concurrency_scope: 'repo', concurrency_key: id, concurrency_revision: D('1'),
    engineer_id: principal.engineer_id, engineer_contract_revision: principal.engineer_contract_revision,
    binding_id: principal.binding_id, binding_generation: 1, fleet_offer_revision: D('2'),
    authorization_revision: 3, retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'fixed', initial_seconds: 30, maximum_seconds: 30 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' }, retry_revision: D('9'), eligible_since: '2026-09-04T00:00:00.000Z', attempt_count: 0, last_outcome: null, next_eligible_at: null, blocker_owner: 'none', starvation_attention: false,
    offer_revision: D(id === 'first' ? '3' : '4'),
  };
}

function document(offers: readonly EngineerOfferV1[]): EngineerOffersV1 {
  return { protocol: 1, kind: 'repo-harness-engineer-offers', repository_id: principal.repository_id,
    engineer_id: principal.engineer_id, lane: 'engineering-v2', work_graph_revision: D('c'),
    snapshot_revision: D('5'), offers, exclusions: [] };
}

function success(selected: EngineerOfferV1) {
  return { ok: true as const, offer: selected, envelope: { claim_id: 'claim-one' } as any, receipt: { claim_id: 'claim-one' } as any };
}

describe('issue #280 canonical acquire-next', () => {
  test('selects the first existing offer without introducing a second sort', () => {
    const repo = root();
    const calls: string[] = [];
    const second = offer('second', 100); const first = offer('first', 10);
    const result = acquireNextScheduledEngineerTask({ repo_root: repo, principal, idempotency_key: 'ordered', dependencies: {
      resolvePrincipal: () => principal, withLock: (_root, _key, run) => run(), collectOffers: () => document([first, second]),
      acquire: (input) => { calls.push(input.assertion.work_package_id); return success(first); },
    } });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(['first']);
  });

  test('re-reads after a stale selection and applies closed filters to each canonical document', () => {
    const repo = root(); let reads = 0; const selected: string[] = [];
    const low = offer('first', 10); const high = offer('second', 90);
    const result = acquireNextScheduledEngineerTask({ repo_root: repo, principal, idempotency_key: 'stale',
      filters: { minimum_priority: 50 }, max_selection_attempts: 2, dependencies: {
        resolvePrincipal: () => principal, withLock: (_root, _key, run) => run(), collectOffers: () => { reads += 1; return document([low, high]); },
        acquire: (input) => { selected.push(input.assertion.work_package_id); return selected.length === 1
          ? { ok: false, error: 'engineer_offer_stale', message: 'moved' } : success(high); },
      } });
    expect(result.ok).toBe(true); expect(reads).toBe(2); expect(selected).toEqual(['second', 'second']);
  });

  test('reselects after a lost Fleet election and remains bounded', () => {
    const repo = root(); let mutations = 0; const selected = offer('first', 10);
    const result = acquireNextScheduledEngineerTask({ repo_root: repo, principal, idempotency_key: 'election', max_selection_attempts: 2, dependencies: {
      resolvePrincipal: () => principal, withLock: (_root, _key, run) => run(), collectOffers: () => document([selected]),
      acquire: () => { mutations += 1; return { ok: false, error: 'fleet_acquire_failed', message: 'lost election', fleet: { ok: false, error: 'fleet_acquire_failed', message: 'lost election', fleet: { ok: false, error: 'claim_failed', message: 'lost election' } } }; },
    } });
    expect(result).toMatchObject({ ok: false, error: 'fleet_acquire_failed' });
    expect(mutations).toBe(2);
  });

  test('replays one durable success and rejects another request under the same key', () => {
    const repo = root(); let mutations = 0; const selected = offer('first', 10);
    const dependencies = { resolvePrincipal: () => principal, withLock: (_root: string, _key: string, run: () => any) => run(), collectOffers: () => document([selected]),
      acquire: () => { mutations += 1; return success(selected); } };
    const input = { repo_root: repo, principal, idempotency_key: 'same', dependencies };
    expect(acquireNextScheduledEngineerTask(input).ok).toBe(true);
    expect(acquireNextScheduledEngineerTask(input).ok).toBe(true);
    expect(mutations).toBe(1);
    const conflict = acquireNextScheduledEngineerTask({ ...input, filters: { minimum_priority: 1 } });
    expect(conflict).toMatchObject({ ok: false, error: 'engineer_acquire_next_conflict' });
  });

  test('fails closed for a modified receipt', () => {
    const repo = root(); const selected = offer('first', 10);
    acquireNextScheduledEngineerTask({ repo_root: repo, principal, idempotency_key: 'tamper', dependencies: {
      resolvePrincipal: () => principal, withLock: (_root, _key, run) => run(), collectOffers: () => document([selected]), acquire: () => success(selected),
    } });
    const directory = join(repo, '.git/repo-harness/engineer-scheduling/v1/acquire-next');
    const path = join(directory, readdirSync(directory).find((name) => /^[a-f0-9]{64}\.json$/.test(name))!);
    const receipt = JSON.parse(readFileSync(path, 'utf8')); receipt.result.envelope.claim_id = 'forged';
    writeFileSync(path, JSON.stringify(receipt));
    expect(() => acquireNextScheduledEngineerTask({ repo_root: repo, principal, idempotency_key: 'tamper', dependencies: {
      resolvePrincipal: () => principal, withLock: (_root, _key, run) => run(), collectOffers: () => document([selected]), acquire: () => success(selected),
    } })).toThrow('modified');
  });
});


describe('exact Task membership selection', () => {
  test('filters membership without reordering and binds normalized membership to replay', () => {
    const repo = root(); let mutations = 0;
    const outside = { ...offer('outside', 100), task_id: 'a'.repeat(64) };
    const first = { ...offer('first', 10), task_id: 'b'.repeat(64) };
    const second = { ...offer('second', 90), task_id: 'c'.repeat(64) };
    const input = { repo_root: repo, principal, idempotency_key: 'membership', dependencies: {
      resolvePrincipal: () => principal, collectOffers: () => document([outside, first, second]),
      acquire: (request: any) => { mutations++; expect(request.assertion.task_id).toBe(first.task_id); return success(first); },
    } };
    const result = acquireNextScheduledEngineerTask({ ...input, filters: { task_ids: [second.task_id, first.task_id] } });
    expect(result.ok).toBe(true);
    expect(acquireNextScheduledEngineerTask({ ...input, filters: { task_ids: [first.task_id, second.task_id, first.task_id] } })).toEqual(result);
    expect(mutations).toBe(1);
    expect(acquireNextScheduledEngineerTask({ ...input, filters: { task_ids: [outside.task_id] } })).toMatchObject({ error: 'engineer_acquire_next_conflict' });
  });

  test('empty membership selects nothing and malformed membership fails before offer reads', () => {
    const repo = root(); let reads = 0;
    const input = { repo_root: repo, principal, idempotency_key: 'empty', dependencies: {
      resolvePrincipal: () => principal, collectOffers: () => { reads++; return document([offer('first', 10)]); },
      acquire: () => { throw new Error('must not acquire'); },
    } };
    expect(acquireNextScheduledEngineerTask({ ...input, filters: { task_ids: [] } })).toMatchObject({ error: 'engineer_no_eligible_offer' });
    expect(reads).toBe(1);
    for (const task_ids of [null, 'all', ['not-a-task'], [null]]) {
      expect(() => acquireNextScheduledEngineerTask({ ...input, filters: { task_ids } as any })).toThrow('canonical Task IDs');
    }
    expect(() => acquireNextScheduledEngineerTask({ ...input, filters: { task_id: 'a'.repeat(64) } as any })).toThrow('unknown field');
    expect(reads).toBe(1);
  });
});

// S1 evidence is deliberately independent of the acquire-next key ledger.
describe('trusted observation prepare', () => {
  const who = { ...principal, engineer_id: 'engineer:capability.demo.worker' } as EngineerPrincipalV1;
  const t1 = Date.parse('2026-09-30T10:00:00.000Z');
  const authorityGuards: Array<() => void> = [];
  afterEach(() => {
    while (authorityGuards.length > 0) authorityGuards.pop()!();
  });

  function authorityPaths(repo: string): string[] {
    const common = resolveGitCommonDirectory(repo);
    return [coordinationRoot(repo), join(common, 'repo-harness/engineers/v1/claim-actors'),
      join(common, 'repo-harness/engineer-scheduling/v1/acquire-next')];
  }

  function authoritySnapshot(repo: string) {
    const walk = (path: string): unknown[] => {
      const stat = statSync(path);
      return [path, stat.ino, stat.mode, stat.mtimeMs, stat.ctimeMs, stat.isDirectory()
        ? readdirSync(path).sort().map(name => walk(join(path, name)))
        : readFileSync(path).toString('hex')];
    };
    return authorityPaths(repo).map(path => existsSync(path) ? walk(path) : [path, 'absent']);
  }

  function prepared(seedAuthorities = false) {
    const repo = root();
    mkdirSync(join(repo, '.ai/harness'), { recursive: true });
    writeFileSync(join(repo, '.ai/harness/policy.json'), '{"version":1}');
    if (seedAuthorities) {
      const [coordination, claimActors, acquireNext] = authorityPaths(repo);
      const taskId = 'd'.repeat(64);
      const files = [join(coordination!, 'leases', taskId, 'owner.json'),
        join(coordination!, 'locks/tasks', `${taskId}.lock`, 'owner.json'),
        join(claimActors!, taskId, '11111111-1111-4111-8111-111111111111.json'),
        join(acquireNext!, `${'a'.repeat(64)}.json`)];
      for (const path of files) {
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, 'existing opaque authority evidence\n');
      }
    }
    const before = authoritySnapshot(repo);
    const assertAuthorityUntouched = () => expect(authoritySnapshot(repo)).toEqual(before);
    authorityGuards.push(assertAuthorityUntouched);
    let now = t1;
    let reads = 0;
    const input = { repo_root: repo, principal: who, dependencies: {
      now: () => now, resolvePrincipal: () => who,
      collectOffers: (options: any) => {
        reads += 1; expect(options.now_ms).toBe(t1);
        return buildEngineerOffersDocument({ repository_id: who.repository_id, engineer_id: who.engineer_id,
          lane: 'unclassified', work_graph_revision: null, candidates: [] });
      },
    } };
    const result = prepareEngineerObservation(input);
    assertAuthorityUntouched();
    const path = join(resolveGitCommonDirectory(repo), 'repo-harness/engineer-scheduling/v1/observations', `${result.observation_ref.slice(7)}.json`);
    return { input, result, path, setNow: (value: number) => { now = value; }, reads: () => reads };
  }

  test.each(['absent', 'seeded'] as const)('snapshot ownership refusal preserves %s claim/lease/acquire-next stores', state => {
    const f = prepared(state === 'seeded');
    const beforeRecords = readdirSync(join(f.path, '..')).sort();
    const foreignOffers = buildEngineerOffersDocument({ repository_id: who.repository_id,
      engineer_id: 'engineer:capability.demo.other', lane: 'unclassified', work_graph_revision: null, candidates: [] });
    expect(() => prepareEngineerObservation({ ...f.input, dependencies: {
      ...f.input.dependencies, collectOffers: () => foreignOffers,
    } })).toThrow('observation snapshot ownership is invalid');
    expect(readdirSync(join(f.path, '..')).sort()).toEqual(beforeRecords);
    // Also reach decode's ownership guard with a self-consistent record and snapshot hash.
    const snapshotBytes = canonicalEngineerJson(foreignOffers);
    const bytes = canonicalEngineerJson({ ...f.result.observation, snapshot_bytes: snapshotBytes,
      snapshot_sha256: engineerSha256(snapshotBytes) });
    const ref = engineerSha256(bytes);
    writeFileSync(join(f.path, '..', `${ref.slice(7)}.json`), bytes);
    expect(() => readEngineerObservation({ ...f.input, observation_ref: ref })).toThrow('observation snapshot ownership is invalid');
  });

  test.each(['absent', 'seeded'] as const)('mid-prepare policy rotation preserves %s claim/lease/acquire-next stores', state => {
    const f = prepared(state === 'seeded');
    const beforeRecords = readdirSync(join(f.path, '..')).sort();
    expect(() => prepareEngineerObservation({ ...f.input, dependencies: {
      ...f.input.dependencies, collectOffers: options => {
        const offers = f.input.dependencies.collectOffers(options);
        writeFileSync(join(f.input.repo_root, '.ai/harness/policy.json'), '{"version":2}');
        return offers;
      },
    } })).toThrow('observation policy changed during prepare');
    expect(readdirSync(join(f.path, '..')).sort()).toEqual(beforeRecords);
  });

  test('publishes exact immutable snapshot bytes; identical prepare does not replace evidence', () => {
    const f = prepared();
    const bytes = readFileSync(f.path, 'utf8');
    expect(prepareEngineerObservation(f.input).observation_ref).toBe(f.result.observation_ref);
    expect(readFileSync(f.path, 'utf8')).toBe(bytes);
    f.setNow(t1 + 1);
    expect(readEngineerObservation({ ...f.input, observation_ref: f.result.observation_ref })).toEqual(f.result);
    expect(f.reads()).toBe(2); // reader never recollects, never acquires.
    expect(f.result.observation.expires_at_ms).toBe(t1 + 30_000);
    expect(JSON.parse(f.result.observation.snapshot_bytes)).toEqual(f.result.offers);
  });

  test('fresh at expiry minus one; exact expiry, future and clock rollback refuse', () => {
    const f = prepared();
    const read = () => readEngineerObservation({ ...f.input, observation_ref: f.result.observation_ref });
    f.setNow(t1 + 29_999); expect(read().observation.observed_at_ms).toBe(t1);
    f.setNow(t1 + 30_000); expect(read).toThrow('expired');
    f.setNow(t1 + 30_001); expect(read).toThrow('expired');
    f.setNow(t1 - 1); expect(read).toThrow('future');
    f.setNow(t1); expect(read().observation.observed_at_ms).toBe(t1);
    f.setNow(t1 - 10); expect(read).toThrow('clock rolled back');
  });

  test('refuses another principal, Binding or repository even when copied into its store', () => {
    const f = prepared();
    for (const changed of [{ auth_subject: '33333333-3333-4333-8333-333333333333' }, { binding_generation: 2 }]) {
      const foreign = { ...who, ...changed };
      expect(() => readEngineerObservation({ ...f.input, principal: foreign,
        dependencies: { ...f.input.dependencies, resolvePrincipal: () => foreign }, observation_ref: f.result.observation_ref })).toThrow('another repository or principal');
    }
    const g = prepared(); cpSync(f.path, g.path);
    expect(() => readEngineerObservation({ ...g.input, observation_ref: g.result.observation_ref })).toThrow('modified');
    const foreignPath = join(resolveGitCommonDirectory(g.input.repo_root), 'repo-harness/engineer-scheduling/v1/observations', `${f.result.observation_ref.slice(7)}.json`);
    cpSync(f.path, foreignPath);
    expect(() => readEngineerObservation({ ...g.input, observation_ref: f.result.observation_ref })).toThrow('another repository');
  });

  test('refuses tampered, missing, malformed and policy-revised records without minting replacements', () => {
    const f = prepared();
    const read = () => readEngineerObservation({ ...f.input, observation_ref: f.result.observation_ref });
    writeFileSync(join(f.input.repo_root, '.ai/harness/policy.json'), '{"version":2}');
    expect(read).toThrow('policy revision changed');
    writeFileSync(join(f.input.repo_root, '.ai/harness/policy.json'), '{"version":1}');
    writeFileSync(f.path, readFileSync(f.path, 'utf8').replace(String(t1), String(t1 + 1)));
    expect(read).toThrow('modified');
    expect(() => prepareEngineerObservation(f.input)).toThrow('conflicts');
    expect(() => readEngineerObservation({ ...f.input, observation_ref: D('0') })).toThrow();
    expect(() => readEngineerObservation({ ...f.input, observation_ref: '../escape' })).toThrow('ref is invalid');
  });

  test('rejects self-consistent content hashes with invalid schema, snapshot or time bounds', () => {
    const f = prepared();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ unknown_field: true }, 'fields are invalid'],
      [{ producer: 'foreign-producer' }, 'schema'],
      [{ snapshot_sha256: D('0') }, 'snapshot digest'],
      [{ expires_at_ms: t1 + 30_001 }, 'time bounds'],
      [{ observed_at_ms: t1 + 1, expires_at_ms: t1 + 30_001 }, 'future'],
      [{ observed_at_ms: t1 - 30_000, expires_at_ms: t1 }, 'expired'],
    ];
    for (const [change, refusal] of cases) {
      const bytes = canonicalEngineerJson({ ...f.result.observation, ...change });
      const ref = engineerSha256(bytes);
      writeFileSync(join(f.path, '..', `${ref.slice(7)}.json`), bytes);
      expect(() => readEngineerObservation({ ...f.input, observation_ref: ref })).toThrow(refusal);
    }
    expect(f.reads()).toBe(1); // no re-mint or collector fallback, even with a self-consistent hash.
  });

  test('rejects symlink store ancestors and symlink receipt files', () => {
    const f = prepared();
    const other = root();
    mkdirSync(join(other, '.ai/harness'), { recursive: true });
    writeFileSync(join(other, '.ai/harness/policy.json'), '{"version":1}');
    symlinkSync(join(resolveGitCommonDirectory(f.input.repo_root), 'repo-harness'), join(resolveGitCommonDirectory(other), 'repo-harness'));
    expect(() => prepareEngineerObservation({ ...f.input, repo_root: other })).toThrow('unsafe');
    const linked = join(f.path, '..', `${D('0').slice(7)}.json`);
    symlinkSync(f.path, linked);
    expect(() => readEngineerObservation({ ...f.input, observation_ref: D('0') })).toThrow();
  });
});


describe('S2 selected acquisition transaction', () => {
  const at = Date.parse('2026-10-01T00:00:00.000Z');
  function selectedFixture() {
    const repo = root();
    mkdirSync(join(repo, '.ai/harness'), { recursive: true });
    writeFileSync(join(repo, '.ai/harness/policy.json'), '{"version":1}');
    let now = at;
    let authenticated = principal;
    let effects = 0;
    const canonicalOffer = (time: number) => {
      const { offer_revision: _old, ...base } = offer('first', 10);
      const retry = observeRetryEligibility({ policy: base.retry_policy, current: null,
        work_package_revision: base.work_package_revision, observed_at: new Date(time).toISOString() });
      const basis = { ...base, primary_capability: 'capability.demo.worker', eligible_since: retry.eligible_since!, retry_revision: retry.authority_revision };
      return { ...basis, offer_revision: engineerSha256(canonicalEngineerJson(basis)) };
    };
    const doc = (time: number) => buildEngineerOffersDocument({ repository_id: principal.repository_id,
      engineer_id: principal.engineer_id, lane: 'engineering-v2', work_graph_revision: D('c'), candidates: [{ eligible: true, offer: canonicalOffer(time) }] });
    const prepared = prepareEngineerObservation({ repo_root: repo, principal, dependencies: {
      now: () => now, resolvePrincipal: () => authenticated, collectOffers: options => doc(options.now_ms!),
    } });
    const selected = prepared.offers.offers[0]!;
    const { protocol: _protocol, kind: _kind, repository_id: _repo, sprint_path: _sprint,
      primary_capability: _capability, priority: _priority, dependency_state: _state,
      concurrency_scope: _scope, concurrency_key: _key, engineer_id: _engineer,
      retry_policy: _policy, retry_revision: _retry, eligible_since: _since, attempt_count: _count,
      last_outcome: _outcome, next_eligible_at: _next, blocker_owner: _owner, starvation_attention: _attention,
      ...assertion } = selected;
    const input: AcquireSelectedEngineerTaskOptions = { repo_root: repo, principal, assertion,
      observation_ref: prepared.observation_ref, idempotency_key: 'selected', session_id: 'session-one',
      dependencies: { now: () => now, resolvePrincipal: () => authenticated,
        collectOffers: () => { throw new Error('selected must never run the selector'); },
        acquire: options => { expect(options.offer_options!.now_ms).toBe(at); effects++; return success(selected); },
      } };
    const record = () => join(resolveGitCommonDirectory(repo), 'repo-harness/engineer-scheduling/v1/acquire-next', `${engineerSha256(input.idempotency_key).slice(7)}.json`);
    const obsPath = join(resolveGitCommonDirectory(repo), 'repo-harness/engineer-scheduling/v1/observations', `${prepared.observation_ref.slice(7)}.json`);
    return { repo, input, selected, doc, prepared, record, obsPath, effects: () => effects,
      time: (value: number) => { now = value; }, auth: (value: typeof principal) => { authenticated = value; } };
  }

  test('T1 receipt solves first-offer staleness at T2 and binds ref in completed evidence', () => {
    const f = selectedFixture(); f.time(at + 1);
    expect(f.doc(at + 1).offers[0]!.offer_revision).not.toBe(f.selected.offer_revision);
    expect(acquireSelectedEngineerTask(f.input).ok).toBeTrue();
    expect(f.effects()).toBe(1);
    expect(JSON.parse(readFileSync(f.record(), 'utf8'))).toMatchObject({ protocol: 2, state: 'completed',
      observation_ref: f.prepared.observation_ref, request: { operation: 'selected', session_id: 'session-one', policy: { policy_revision: 'R1' } } });
  });

  test('completed replay skips missing/expired observation and does not repeat effect', () => {
    const f = selectedFixture();
    const input = f.input;
    const first = acquireSelectedEngineerTask(input); expect(first.ok).toBeTrue();
    f.time(at + 30_000); unlinkSync(f.obsPath);
    expect(acquireSelectedEngineerTask(input)).toEqual(first);
    expect(f.effects()).toBe(1);
    for (const change of [{ session_id: 'other' }, { observation_ref: D('0') },
      { assertion: { ...input.assertion, task_revision: 'f'.repeat(64) } }]) {
      expect(acquireSelectedEngineerTask({ ...input, ...change })).toMatchObject({ error: 'engineer_acquire_next_conflict' });
    }
    f.auth({ ...principal, binding_generation: 2 });
    expect(() => acquireSelectedEngineerTask(input)).toThrow('principal/Binding differs');
    expect(f.effects()).toBe(1);
  });

  test('crash at effect leaves pending; missing/expired ref never resets the key', () => {
    const f = selectedFixture(); let effects = 0;
    const input = { ...f.input,
      dependencies: { ...f.input.dependencies, acquire: () => {
        effects++; expect(JSON.parse(readFileSync(f.record(), 'utf8')).state).toBe('pending');
        throw Error('effect outcome unknown');
      } },
    };
    expect(() => acquireSelectedEngineerTask(input)).toThrow('outcome unknown');
    expect(JSON.parse(readFileSync(f.record(), 'utf8'))).toMatchObject({ state: 'pending', observation_ref: input.observation_ref });
    f.time(at + 30_001); unlinkSync(f.obsPath);
    expect(acquireSelectedEngineerTask(input)).toMatchObject({ error: 'engineer_acquire_next_reconciliation_required' });
    expect(effects).toBe(1);
  });

  test('new expired/missing/corrupt/foreign references reject with frozen typed errors and zero effects', () => {
    const f = selectedFixture();
    const readCode = (run: () => unknown) => { try { run(); throw Error('expected refusal'); } catch (error) { expect(error).toBeInstanceOf(EngineerObservationError); return (error as EngineerObservationError).code; } };
    f.time(at + 30_000); expect(readCode(() => acquireSelectedEngineerTask(f.input))).toBe('engineer_observation_expired');
    f.time(at); expect(readCode(() => acquireSelectedEngineerTask({ ...f.input, observation_ref: D('0') }))).toBe('engineer_observation_missing');
    const bytes = readFileSync(f.obsPath, 'utf8'); writeFileSync(f.obsPath, '{}');
    expect(readCode(() => acquireSelectedEngineerTask(f.input))).toBe('engineer_observation_corrupt');
    writeFileSync(f.obsPath, bytes);
    const other = { ...principal, auth_subject: '33333333-3333-4333-8333-333333333333' };
    f.auth(other);
    expect(readCode(() => acquireSelectedEngineerTask({ ...f.input, principal: other }))).toBe('engineer_observation_identity_mismatch');
    expect(f.effects()).toBe(0); expect(existsSync(f.record())).toBeFalse();
  });

  test.each(['broken-json', 'null', 'digest', 'unsafe-file'] as const)('receipt %s is a ledger fault, never observation failure or a new effect', fault => {
    const f = selectedFixture();
    expect(acquireSelectedEngineerTask(f.input).ok).toBeTrue();
    const bytes = readFileSync(f.record(), 'utf8');
    if (fault === 'unsafe-file') { unlinkSync(f.record()); symlinkSync(f.obsPath, f.record()); }
    else writeFileSync(f.record(), fault === 'broken-json' ? '{' : fault === 'null' ? 'null' : bytes.replace('completed', 'pending'));
    try { acquireSelectedEngineerTask(f.input); throw new Error('expected ledger refusal'); }
    catch (error) {
      expect(error).toBeInstanceOf(EngineerAcquisitionLedgerError);
      expect((error as EngineerAcquisitionLedgerError).code).toBe(fault === 'unsafe-file' ? 'engineer_acquisition_ledger_unsafe_path' : 'engineer_acquisition_ledger_corrupt');
    }
    expect(f.effects()).toBe(1);
  });

  test.each(['broken-json', 'null', 'digest', 'unsafe-file'] as const)('seal %s has ledger-specific ownership before admission', fault => {
    const f = selectedFixture();
    requireAcquisitionLedgerV2(f.repo);
    const path = join(f.record(), '..', 'cutover-v2.json');
    const bytes = readFileSync(path, 'utf8');
    if (fault === 'unsafe-file') { unlinkSync(path); symlinkSync(f.obsPath, path); }
    else writeFileSync(path, fault === 'broken-json' ? '{' : fault === 'null' ? 'null' : bytes.replace('new-empty-store', 'modified'));
    try { acquireSelectedEngineerTask(f.input); throw new Error('expected ledger refusal'); }
    catch (error) {
      expect(error).toBeInstanceOf(EngineerAcquisitionLedgerError);
      expect((error as EngineerAcquisitionLedgerError).code).toBe(fault === 'unsafe-file' ? 'engineer_acquisition_ledger_unsafe_path' : 'engineer_acquisition_ledger_corrupt');
    }
    expect(f.effects()).toBe(0); expect(existsSync(f.record())).toBeFalse();
  });

  test('invalid/incomplete assertions never fall back to automatic selection', () => {
    const f = selectedFixture();
    const { dependency_revision: _missing, ...assertion } = f.input.assertion;
    expect(() => acquireSelectedEngineerTask({ ...f.input, assertion } as any)).toThrow('fields');
    expect(() => acquireSelectedEngineerTask({ ...f.input, filters: {} } as any)).toThrow('unknown');
    expect(acquireSelectedEngineerTask({ ...f.input, assertion: { ...f.input.assertion, task_id: 'f'.repeat(64) } })).toMatchObject({ error: 'engineer_offer_stale' });
    expect(f.effects()).toBe(0);
  });

  test('two OS callers share the production key lock and durable result: one effect', async () => {
    const f = selectedFixture(); requireAcquisitionLedgerV2(f.repo);
    const log = join(f.repo, 'claims.log');
    const module = join(import.meta.dir, '../../src/effects/engineers/scheduling-acquire-next.ts');
    const { dependencies: _deps, ...input } = f.input;
    const script = String.raw`import { appendFileSync } from 'fs'; import { acquireSelectedEngineerTask } from ${JSON.stringify(module)};
      const input=${JSON.stringify(input)}, offer=${JSON.stringify(f.selected)};
      const result=acquireSelectedEngineerTask({...input,dependencies:{now:()=>${at+1},resolvePrincipal:()=>input.principal,
      acquire:()=>{appendFileSync(${JSON.stringify(log)},'claim\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);return {ok:true,offer,envelope:{claim_id:'one'},receipt:{claim_id:'one'}};}}});
      if(!result.ok) throw Error(JSON.stringify(result));`;
    const children = [0,1].map(() => Bun.spawn([process.execPath,'-e',script], { stdout:'pipe', stderr:'pipe' }));
    for (const child of children) expect(await child.exited, await new Response(child.stderr).text()).toBe(0);
    expect(readFileSync(log,'utf8').trim().split('\n')).toHaveLength(1);
  });
});

describe('S2 one-shot legacy receipt cutover', () => {
  function legacy(state: 'pending' | 'completed') {
    const repo = root(), key = 'legacy-key';
    const path = join(resolveGitCommonDirectory(repo), 'repo-harness/engineer-scheduling/v1/acquire-next', `${engineerSha256(key).slice(7)}.json`);
    mkdirSync(join(path,'..'), { recursive: true });
    const basis = { protocol:1, kind:'repo-harness-engineer-acquire-next-receipt', request_sha256:D('a'), state,
      result:state==='pending'?null:success(offer('first',10)) };
    const receipt_sha256=engineerSha256(JSON.stringify(basis));
    const bytes=JSON.stringify({...basis,receipt_sha256})+'\n';writeFileSync(path,bytes);
    return {repo,key,path,bytes};
  }
  test('completed v1 key becomes a v2 terminal fence with exact source evidence, never replayed', () => {
    const f=legacy('completed');let effects=0;
    const input={repo_root:f.repo,principal,idempotency_key:f.key,dependencies:{resolvePrincipal:()=>principal,
      collectOffers:()=>document([offer('first',10)]),acquire:()=>{effects++;return success(offer('first',10));}}};
    expect(()=>acquireNextScheduledEngineerTask(input)).toThrow('cutover is required');
    try { acquireNextScheduledEngineerTask(input); throw Error('expected cutover refusal'); } catch (error) {
      expect(error).toBeInstanceOf(EngineerAcquisitionLedgerError);
      expect((error as EngineerAcquisitionLedgerError).code).toBe('engineer_acquisition_ledger_cutover_required');
    }
    expect(effects).toBe(0); expect(readFileSync(f.path,'utf8')).toBe(f.bytes);
    const inventory=inspectAcquisitionReceiptCutover(f.repo);
    const args={repo_root:f.repo,expected_inventory_sha256:inventory.inventory_sha256,quiescence_evidence:'operator:old-producers-stopped'};
    const seal=migrateAcquisitionReceipts(args);expect(migrateAcquisitionReceipts(args)).toEqual(seal);
    const fence=JSON.parse(readFileSync(f.path,'utf8'));expect(fence).toMatchObject({protocol:2,state:'fenced',legacy_bytes:f.bytes});
    expect(acquireNextScheduledEngineerTask(input)).toMatchObject({error:'engineer_acquire_next_conflict'});
    unlinkSync(f.path);
    expect(acquireNextScheduledEngineerTask(input)).toMatchObject({error:'engineer_acquire_next_reconciliation_required'});
    expect(effects).toBe(0);
  });
  test.each(['pending','corrupt'] as const)('%s legacy metadata stops activation and preserves unknown evidence', state => {
    const f=legacy('pending');if(state==='corrupt')writeFileSync(f.path,'broken JSON');
    const before=readFileSync(f.path,'utf8');
    expect(()=>migrateAcquisitionReceipts({repo_root:f.repo,expected_inventory_sha256:state==='corrupt'?D('a'):inspectAcquisitionReceiptCutover(f.repo).inventory_sha256,quiescence_evidence:'operator:stopped'})).toThrow();
    expect(readFileSync(f.path,'utf8')).toBe(before);
    expect(()=>acquireNextScheduledEngineerTask({repo_root:f.repo,principal,idempotency_key:'new-key',dependencies:{resolvePrincipal:()=>principal}})).toThrow();
    expect(existsSync(join(f.path,'..','cutover-v2.json'))).toBeFalse();
  });
});


describe('S2 gatekeeper auto acquisition regressions', () => {
  const ledger = (repo: string) => join(resolveGitCommonDirectory(repo), 'repo-harness/engineer-scheduling/v1/acquire-next');
  test('sealed acquisitions and replay do not acquire the cutover lock', () => {
    const repo = root(); requireAcquisitionLedgerV2(repo);
    const input = { repo_root: repo, principal, idempotency_key: 'sealed', dependencies: {
      resolvePrincipal: () => principal, collectOffers: () => document([offer('first',10)]), acquire: () => success(offer('first',10)),
    } };
    const first = acquireNextScheduledEngineerTask(input);
    withExclusiveDirectoryLock(resolveGitCommonDirectory(repo), 'repo-harness/engineer-scheduling/v1/acquisition-cutover.lock', () => {
      expect(() => requireAcquisitionLedgerV2(repo)).not.toThrow();
      expect(acquireNextScheduledEngineerTask(input)).toEqual(first);
    });
  });
  test('first initialization reclaims a stale empty cutover lock', () => {
    const repo = root();
    const path = join(resolveGitCommonDirectory(repo), 'repo-harness/engineer-scheduling/v1/acquisition-cutover.lock');
    mkdirSync(path, { recursive: true });
    const old = new Date(Date.now() - 60_000); utimesSync(path,old,old);
    expect(() => requireAcquisitionLedgerV2(repo)).not.toThrow();
    expect(existsSync(path)).toBeFalse(); expect(existsSync(join(ledger(repo),'cutover-v2.json'))).toBeTrue();
  });
  test('five idle poll keys leave no receipt files; an idle key can change filters', () => {
    const repo = root(); requireAcquisitionLedgerV2(repo);
    const before = readdirSync(ledger(repo)).sort();
    let effects = 0;
    const deps = { resolvePrincipal: () => principal, collectOffers: () => document([]), acquire: () => { effects++; return success(offer('first',10)); } };
    for (let index=0;index<5;index++) {
      expect(acquireNextScheduledEngineerTask({repo_root:repo,principal,idempotency_key:`poll-${index}`,dependencies:deps})).toMatchObject({error:'engineer_no_eligible_offer'});
    }
    for (const minimum_priority of [10,90]) {
      expect(acquireNextScheduledEngineerTask({repo_root:repo,principal,idempotency_key:'poll-0',filters:{minimum_priority},dependencies:deps})).toMatchObject({error:'engineer_no_eligible_offer'});
    }
    expect(readdirSync(ledger(repo)).sort()).toEqual(before); expect(effects).toBe(0);
  });
  test('stale then empty is determinate idle; the same key acquires when the world changes', () => {
    const repo = root(); const selected=offer('first',10); let ready=false,reads=0,effects=0;
    const input={repo_root:repo,principal,idempotency_key:'stale-empty',dependencies:{
      resolvePrincipal:()=>principal,
      collectOffers:()=>document(ready || reads++===0 ? [selected] : []),
      acquire:()=>{effects++;return ready ? success(selected) : {ok:false as const,error:'engineer_offer_stale' as const,message:'changed'};},
    }};
    expect(acquireNextScheduledEngineerTask(input)).toMatchObject({error:'engineer_no_eligible_offer'});
    expect(existsSync(join(ledger(repo),`${engineerSha256(input.idempotency_key).slice(7)}.json`))).toBeFalse();
    ready=true; expect(acquireNextScheduledEngineerTask(input).ok).toBeTrue(); expect(effects).toBe(2);
  });
  test.each(['missing-policy','corrupt-policy','collector-refusal'] as const)('failed prepare %s creates no empty observations directory', failure => {
    const repo=root(); mkdirSync(join(repo,'.ai/harness'),{recursive:true});
    if(failure!=='missing-policy')writeFileSync(join(repo,'.ai/harness/policy.json'),failure==='corrupt-policy'?'not JSON':'{"version":1}');
    expect(()=>prepareEngineerObservation({repo_root:repo,principal,dependencies:{resolvePrincipal:()=>principal,
      collectOffers:()=>{throw Error('collector refusal');}}})).toThrow();
    expect(existsSync(join(resolveGitCommonDirectory(repo),'repo-harness/engineer-scheduling/v1/observations'))).toBeFalse();
  });
});
