import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import {
  buildEngineerOfferCandidate,
  buildEngineerOffersDocument,
  projectWorkGraph,
  validateWorkGraph,
  type EngineerOfferV1,
} from '../../src/core/engineers/scheduling';
import type { EngineerPrincipalV1 } from '../../src/core/engineers/principal-claim';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import { ExclusiveLockContentionError } from '../../src/effects/locking/exclusive-directory-lock';
import {
  acquireScheduledEngineerTask,
  type ScheduledEngineerAcquireAssertionV1,
  type ScheduledEngineerAcquireResult,
} from '../../src/effects/engineers/scheduling-acquire';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const REPO = 'repo_0123456789abcdef';
const CAPABILITY = 'capability.workflow-engine.contract-assets';
const ENGINEER = `engineer:${CAPABILITY}`;
const DIGEST = `sha256:${'a'.repeat(64)}`;
const BINDING = '11111111-1111-4111-8111-111111111111';

function principal(): EngineerPrincipalV1 {
  return {
    protocol: 1,
    kind: 'repo-harness-engineer-principal',
    repository_id: REPO,
    engineer_id: ENGINEER,
    binding_id: BINDING,
    binding_generation: 2,
    engineer_contract_revision: DIGEST,
    carrier: 'mcp_oauth',
    auth_subject: '22222222-2222-4222-8222-222222222222',
    provider: 'unknown',
    provider_thread_id: null,
  };
}

function offer(): EngineerOfferV1 {
  const graph = projectWorkGraph(validateWorkGraph({
    protocol: 1,
    kind: 'repo-harness-work-graph',
    repository_id: REPO,
    sprint_path: 'plans/sprints/demo.sprint.md',
    lane: 'engineering-v2',
    work_packages: [{
      work_package_id: 'wp-a',
      task_id: fixtureTaskId('task A'),
      primary_capability: CAPABILITY,
      depends_on: [],
      priority: 50,
      concurrency: { scope: 'repo', key: 'release' },
      execution_surface: 'contract',
      integration_group: null,
      required_acceptance: [{ gate: 'module', policy_id: 'module', policy_ref: 'plans/policy.json', policy_revision: DIGEST }],
      retry_policy: { max_automated_attempts: 3, retryable_failure_classes: ['transient_failure'], backoff: { kind: 'exponential', initial_seconds: 30, maximum_seconds: 300 }, attention_after_seconds: 3600, revision_reset: 'reset_on_work_package_revision' } as const,
    rollback_boundary: { kind: 'work_package', boundary_id: 'wp-a', boundary_ref: 'plans/rollback.json', boundary_revision: DIGEST },
    }],
  }), [{ task_id: fixtureTaskId('task A'), task_revision: '2'.repeat(64), task_ref: 'task A', status: '[ ]', row_order: 1 }]);
  const candidate = buildEngineerOfferCandidate({
    graph,
    work_package: graph.work_packages[0],
    engineer: { engineer_id: ENGINEER, capability_id: CAPABILITY, engineer_contract_revision: DIGEST, max_active_claims: 1 },
    binding: { state: 'active', binding_id: BINDING, binding_generation: 2 },
    fleet_offer: {
      execution_readiness: 'execution_ready', snapshot_consistency: 'stable',
      task_id: fixtureTaskId('task A'), task_revision: '2'.repeat(64), offer_revision: `sha256:${'b'.repeat(64)}`, authorization_revision: 4,
    },
    dependencies: [],
    concurrency_available: true,
    concurrency_revision: `sha256:${'c'.repeat(64)}`,
    retry: { state: 'eligible', attempt_count: 0, last_outcome: null, next_eligible_at: null, eligible_since: '2026-09-04T00:00:00.000Z', attention_owner: 'none', starvation_attention: false, authority_revision: `sha256:${'9'.repeat(64)}` } as const,
    active_claims: 0,
  });
  if (!candidate.eligible) throw new Error('fixture offer is not eligible');
  return candidate.offer;
}

function assertion(value: EngineerOfferV1): ScheduledEngineerAcquireAssertionV1 {
  return {
    offer_revision: value.offer_revision,
    work_package_id: value.work_package_id,
    work_package_revision: value.work_package_revision,
    work_graph_revision: value.work_graph_revision,
    task_id: value.task_id,
    task_revision: value.task_revision,
    dependency_revision: value.dependency_revision,
    concurrency_revision: value.concurrency_revision,
    binding_id: value.binding_id,
    binding_generation: value.binding_generation,
    engineer_contract_revision: value.engineer_contract_revision,
    fleet_offer_revision: value.fleet_offer_revision,
    authorization_revision: value.authorization_revision,
  };
}

function document(value: EngineerOfferV1) {
  return buildEngineerOffersDocument({
    repository_id: REPO,
    engineer_id: ENGINEER,
    lane: 'engineering-v2',
    work_graph_revision: value.work_graph_revision,
    candidates: [{ eligible: true, offer: value }],
  });
}

const roots: string[] = [];

/** A real repository so the production concurrency lock resolves a real git
 * common directory instead of a stubbed one. */
function gitFixture(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'me1a-acquire-lock-')));
  roots.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

function concurrencyLockPath(root: string, concurrencyKey: string): string {
  const key = createHash('sha256').update(concurrencyKey, 'utf8').digest('hex');
  return join(resolveGitCommonDirectory(root), 'repo-harness/engineer-scheduling/v1/concurrency', `${key}.lock`);
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('ME-1A scheduled Engineer acquire', () => {
  test('an N-way election on one repository_id:concurrency_key delegates to ME-0B exactly once', async () => {
    const root = gitFixture();
    const current = offer();
    const ledger = join(root, 'acquire-calls.log');
    const claimedMarker = join(root, 'claimed.marker');
    const arrivals = join(root, 'arrivals');
    const outcomes = join(root, 'outcomes');
    const corePath = resolve(process.cwd(), 'src/core/engineers/scheduling.ts');
    const acquirePath = resolve(process.cwd(), 'src/effects/engineers/scheduling-acquire.ts');

    // Eight real processes contend for one key through the production
    // `withConcurrencyLock` over one git common directory. The handshake
    // replaces every sleep with an observed signal: the holder keeps the lock
    // until it has seen all eight arrivals AND all seven competitors finish,
    // and it writes the claimed marker only after that. A competitor therefore
    // cannot reach the marker before it reaches the lock, so the only way for
    // it to finish is to be refused by the lock itself -- which is what makes
    // `engineer_concurrency_unavailable` the mutual-exclusion evidence rather
    // than one of two tolerated outcomes.
    const script = `
      import { appendFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
      import { buildEngineerOffersDocument } from ${JSON.stringify(corePath)};
      import { acquireScheduledEngineerTask } from ${JSON.stringify(acquirePath)};
      const [root, ledger, marker, arrivals, outcomes, offerJson, principalJson] = process.argv.slice(1);
      const offer = JSON.parse(offerJson);
      const sleep = (ms) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
      const count = (dir) => { try { return readdirSync(dir).length; } catch { return 0; } };
      const assertion = {
        offer_revision: offer.offer_revision,
        work_package_id: offer.work_package_id,
        work_package_revision: offer.work_package_revision,
        work_graph_revision: offer.work_graph_revision,
        task_id: offer.task_id,
        task_revision: offer.task_revision,
        dependency_revision: offer.dependency_revision,
        concurrency_revision: offer.concurrency_revision,
        binding_id: offer.binding_id,
        binding_generation: offer.binding_generation,
        engineer_contract_revision: offer.engineer_contract_revision,
        fleet_offer_revision: offer.fleet_offer_revision,
        authorization_revision: offer.authorization_revision,
      };
      const document = (candidates) => buildEngineerOffersDocument({
        repository_id: ${JSON.stringify(REPO)},
        engineer_id: ${JSON.stringify(ENGINEER)},
        lane: 'engineering-v2',
        work_graph_revision: offer.work_graph_revision,
        candidates,
      });
      // Announced before contending, so the holder can wait for a real arrival
      // rather than guess at a startup delay.
      mkdirSync(arrivals, { recursive: true });
      mkdirSync(outcomes, { recursive: true });
      writeFileSync(arrivals + '/' + process.pid, '');
      let record = { ok: false, error: 'unreported' };
      try {
        const result = acquireScheduledEngineerTask({
          repo_root: root,
          principal: JSON.parse(principalJson),
          assertion,
          dependencies: {
            collectOffers: () => document(existsSync(marker) ? [] : [{ eligible: true, offer }]),
            acquire: () => {
              appendFileSync(ledger, process.pid + '\\n');
              const deadline = Date.now() + 20000;
              while (count(arrivals) < 8 || count(outcomes) < 7) {
                if (Date.now() > deadline) {
                  throw new Error('handshake timeout: arrivals=' + count(arrivals) + ' outcomes=' + count(outcomes));
                }
                sleep(25);
              }
              writeFileSync(marker, 'claimed\\n');
              return { ok: true, envelope: { repo_id: ${JSON.stringify(REPO)} }, receipt: { repository_id: ${JSON.stringify(REPO)} } };
            },
          },
        });
        record = result.ok
          ? { ok: true, work_package_id: result.offer.work_package_id }
          : { ok: false, error: result.error };
      } catch (error) {
        record = { ok: false, error: 'uncaught:' + String(error) };
      }
      writeFileSync(outcomes + '/' + process.pid, JSON.stringify(record));
      console.log(JSON.stringify(record));
    `;
    const children = Array.from({ length: 8 }, () => Bun.spawn([
      process.execPath, '-e', script, '--',
      root, ledger, claimedMarker, arrivals, outcomes, JSON.stringify(current), JSON.stringify(principal()),
    ], { stdout: 'pipe', stderr: 'pipe' }));
    const outputs = await Promise.all(children.map(async (child) => {
      const output = await new Response(child.stdout).text();
      const stderr = await new Response(child.stderr).text();
      await child.exited;
      if (stderr) throw new Error(stderr);
      return JSON.parse(output.trim()) as { ok: boolean; work_package_id?: string; error?: string };
    }));

    const report = JSON.stringify(outputs);
    const winners = outputs.filter((item) => item.ok);
    expect(winners, report).toHaveLength(1);
    expect(winners[0]!.work_package_id).toBe('wp-a');
    // ME-0B is reached exactly once across all eight processes.
    expect(readFileSync(ledger, 'utf8').trim().split('\n'), report).toHaveLength(1);
    // Every loser was refused by the lock. A stale-offer refusal here would mean
    // the competitor saw the claimed marker without ever contending for the
    // lock, which is exactly the hole this handshake closes.
    const losers = outputs.filter((item) => !item.ok).map((item) => item.error!);
    expect(losers, report).toEqual(Array.from({ length: 7 }, () => 'engineer_concurrency_unavailable'));

    const lockPath = concurrencyLockPath(root, `${REPO}:release`);
    expect(existsSync(join(lockPath, '..'))).toBeTrue();
    expect(existsSync(lockPath)).toBeFalse();
  }, 30_000);

  test('a competitor reaching the same key while the holder owns the lock is refused before ME-0B', () => {
    const root = gitFixture();
    const current = offer();
    const empty = buildEngineerOffersDocument({
      repository_id: REPO, engineer_id: ENGINEER, lane: 'engineering-v2',
      work_graph_revision: current.work_graph_revision, candidates: [],
    });
    let claimed = false;
    let acquireCount = 0;
    let contended: ScheduledEngineerAcquireResult | null = null;

    const attempt = (): ScheduledEngineerAcquireResult => acquireScheduledEngineerTask({
      repo_root: root,
      principal: principal(),
      assertion: assertion(current),
      dependencies: {
        collectOffers: () => (claimed ? empty : document(current)),
        acquire: () => {
          acquireCount += 1;
          if (contended === null) contended = attempt();
          claimed = true;
          return {
            ok: true,
            envelope: { repo_id: REPO } as any,
            receipt: { repository_id: REPO } as any,
          };
        },
      },
    });

    expect(attempt()).toMatchObject({ ok: true, offer: { work_package_id: 'wp-a' } });
    expect(contended).toMatchObject({ ok: false, error: 'engineer_concurrency_unavailable' });
    expect(acquireCount).toBe(1);
  }, 30_000);


  test('revalidates under the repo-key lock and delegates exactly once to ME-0B', () => {
    const current = offer();
    let collectCount = 0;
    let acquireCount = 0;
    let lockKey = '';
    const result = acquireScheduledEngineerTask({
      repo_root: '/repo',
      principal: principal(),
      assertion: assertion(current),
      dependencies: {
        collectOffers: () => { collectCount += 1; return document(current); },
        withConcurrencyLock: (_root, key, run) => { lockKey = key; return run(); },
        acquire: (options) => {
          acquireCount += 1;
          expect(options.assertion).toEqual({
            repo_id: REPO,
            task_id: current.task_id,
            offer_revision: current.fleet_offer_revision,
            authorization_revision: current.authorization_revision,
          });
          return { ok: true, envelope: { repo_id: REPO } as any, receipt: { repository_id: REPO } as any };
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(collectCount).toBe(2);
    expect(acquireCount).toBe(1);
    expect(lockKey).toBe(`${REPO}:release`);
  });

  test('every asserted scheduling fence fails before mutation when stale', () => {
    const current = offer();
    const base = assertion(current);
    const staleValues: Array<[keyof ScheduledEngineerAcquireAssertionV1, unknown]> = [
      ['offer_revision', DIGEST],
      ['work_package_id', 'wp-other'],
      ['work_package_revision', DIGEST],
      ['work_graph_revision', DIGEST],
      ['task_id', '3'.repeat(64)],
      ['task_revision', '4'.repeat(64)],
      ['dependency_revision', DIGEST],
      ['concurrency_revision', DIGEST],
      ['binding_id', '33333333-3333-4333-8333-333333333333'],
      ['binding_generation', 3],
      ['engineer_contract_revision', `sha256:${'d'.repeat(64)}`],
      ['fleet_offer_revision', DIGEST],
      ['authorization_revision', 5],
    ];
    for (const [key, value] of staleValues) {
      let mutated = false;
      const result = acquireScheduledEngineerTask({
        repo_root: '/repo',
        principal: principal(),
        assertion: { ...base, [key]: value },
        dependencies: {
          collectOffers: () => document(current),
          withConcurrencyLock: (_root, _key, run) => run(),
          acquire: () => { mutated = true; throw new Error('must not mutate'); },
        },
      });
      expect(result).toMatchObject({ ok: false, error: 'engineer_offer_stale' });
      expect(mutated).toBe(false);
    }
  });

  test('a change during the lock window stops before ME-0B', () => {
    const current = offer();
    let reads = 0;
    let mutated = false;
    const empty = buildEngineerOffersDocument({
      repository_id: REPO, engineer_id: ENGINEER, lane: 'engineering-v2',
      work_graph_revision: current.work_graph_revision, candidates: [],
    });
    const result = acquireScheduledEngineerTask({
      repo_root: '/repo',
      principal: principal(),
      assertion: assertion(current),
      dependencies: {
        collectOffers: () => (++reads === 1 ? document(current) : empty),
        withConcurrencyLock: (_root, _key, run) => run(),
        acquire: () => { mutated = true; throw new Error('must not mutate'); },
      },
    });
    expect(result).toMatchObject({ ok: false, error: 'engineer_offer_stale' });
    expect(mutated).toBe(false);
  });

  test('lock contention is a typed concurrency refusal', () => {
    const current = offer();
    const result = acquireScheduledEngineerTask({
      repo_root: '/repo',
      principal: principal(),
      assertion: assertion(current),
      dependencies: {
        collectOffers: () => document(current),
        withConcurrencyLock: () => { throw new ExclusiveLockContentionError('busy', '/lock', 'timeout'); },
        acquire: () => { throw new Error('must not mutate'); },
      },
    });
    expect(result).toEqual({ ok: false, error: 'engineer_concurrency_unavailable', message: 'busy' });
  });
});
