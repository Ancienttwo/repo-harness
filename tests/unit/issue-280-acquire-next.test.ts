import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import type { EngineerOfferV1, EngineerOffersV1 } from '../../src/core/engineers/scheduling';
import type { EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import { acquireNextScheduledEngineerTask } from '../../src/effects/engineers/scheduling-acquire-next';

const D = (c: string) => `sha256:${c.repeat(64)}`;
const principal = Object.freeze({
  protocol: 1, kind: 'repo-harness-engineer-principal', repository_id: 'repo_0123456789abcdef',
  engineer_id: 'engineer:capability.demo', binding_id: '11111111-1111-4111-8111-111111111111',
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
    authorization_revision: 3, offer_revision: D(id === 'first' ? '3' : '4'),
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
      withLock: (_root, _key, run) => run(), collectOffers: () => document([first, second]),
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
        withLock: (_root, _key, run) => run(), collectOffers: () => { reads += 1; return document([low, high]); },
        acquire: (input) => { selected.push(input.assertion.work_package_id); return selected.length === 1
          ? { ok: false, error: 'engineer_offer_stale', message: 'moved' } : success(high); },
      } });
    expect(result.ok).toBe(true); expect(reads).toBe(2); expect(selected).toEqual(['second', 'second']);
  });

  test('reselects after a lost Fleet election and remains bounded', () => {
    const repo = root(); let mutations = 0; const selected = offer('first', 10);
    const result = acquireNextScheduledEngineerTask({ repo_root: repo, principal, idempotency_key: 'election', max_selection_attempts: 2, dependencies: {
      withLock: (_root, _key, run) => run(), collectOffers: () => document([selected]),
      acquire: () => { mutations += 1; return { ok: false, error: 'fleet_acquire_failed', message: 'lost election', fleet: { ok: false, error: 'fleet_acquire_failed', message: 'lost election', fleet: { ok: false, error: 'claim_failed', message: 'lost election' } } }; },
    } });
    expect(result).toMatchObject({ ok: false, error: 'fleet_acquire_failed' });
    expect(mutations).toBe(2);
  });

  test('replays one durable success and rejects another request under the same key', () => {
    const repo = root(); let mutations = 0; const selected = offer('first', 10);
    const dependencies = { withLock: (_root: string, _key: string, run: () => any) => run(), collectOffers: () => document([selected]),
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
      withLock: (_root, _key, run) => run(), collectOffers: () => document([selected]), acquire: () => success(selected),
    } });
    const directory = join(repo, '.git/repo-harness/engineer-scheduling/v1/acquire-next');
    const path = join(directory, readdirSync(directory).find((name) => name.endsWith('.json'))!);
    const receipt = JSON.parse(readFileSync(path, 'utf8')); receipt.result.envelope.claim_id = 'forged';
    writeFileSync(path, JSON.stringify(receipt));
    expect(() => acquireNextScheduledEngineerTask({ repo_root: repo, principal, idempotency_key: 'tamper', dependencies: {
      withLock: (_root, _key, run) => run(), collectOffers: () => document([selected]), acquire: () => success(selected),
    } })).toThrow('modified');
  });
});
