import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  collectFleetBoard,
  productionFleetBoardDependencies,
  watchFleetBoard,
  type FleetBoardDependencies,
} from '../../src/effects/fleet/board';
import type { FleetBoardCardInputV1 } from '../../src/core/fleet/board';
import {
  buildPublicationReceipt,
  encodePublicationMarker,
  publicationReceiptDigest,
} from '../../src/core/publication/publication-receipt';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskId,
  deriveTaskRevision,
  enterReviewingLeaseRecord,
} from '../../src/core/state/coordination-identity';
import {
  repoHarnessRepoIdFor,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistryStrictSnapshot,
} from '../../src/effects/repo-registry';
import { writePublicationReceiptCache } from '../../src/effects/publication/publication-receipt';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';

function repo(index: number): RepoHarnessRegisteredRepo {
  return {
    id: `repo-${String(index).padStart(2, '0')}`,
    path: `/fixtures/repo-${index}`,
    accessMode: index % 2 === 0 ? 'read_write' : 'read_only',
    source: 'manual',
    registeredAt: '2026-08-23T00:00:00.000Z',
    lastSeenAt: '2026-08-23T00:00:00.000Z',
  };
}

function registry(repos: readonly RepoHarnessRegisteredRepo[]): RepoHarnessRegistryStrictSnapshot {
  return {
    registryPath: '/fixtures/registered-repos.json', authorizationRevision: 7,
    registryRevision: 'sha256:registry', repos,
  };
}

function card(index: number): FleetBoardCardInputV1 {
  return {
    task_id: index.toString(16).padStart(64, '0'),
    task_revision: 'b'.repeat(64),
    task_label: `fixture row ${index}`, task_index: index,
    task_state: 'pending', lease_state: 'available', claim_id: null, generation: null,
    current_publication: null, merge_readiness: null, execution_readiness: 'execution_ready',
    feedback: { pending_count: 0, no_progress: false, repair_actions: [] },
    inbox: { unread_count: 0, addressed_to_current_claim: false }, snapshot_consistency: 'stable',
  };
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function shellSingleQuoted(value: string): string {
  return `'${value.replace(/'/gu, "'\\\"'\\\"'")}'`;
}

function createReviewingProviderFixture(root: string, cards: number): { readonly repo: RepoHarnessRegisteredRepo; readonly gh_bin: string; readonly counter_dir: string } {
  const sprintPath = 'plans/sprints/fleet-provider.sprint.md';
  const taskNames = Array.from({ length: cards }, (_, index) => `observe provider card ${index + 1}`);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fleet Provider Test');
  git(root, 'config', 'user.email', 'fleet-provider@test.invalid');
  mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
  writeFileSync(join(root, sprintPath), [
    '# Fleet provider fixture', '', '## Backlog', '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '|---|--------|------|------|------------|------|',
    ...taskNames.map((task, index) => `| ${index + 1} | [ ] | ${task} | inline | provider observation remains read only | (pending) |`),
    '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '-c', 'codex/fleet-provider');
  writeFileSync(join(root, 'feature.txt'), 'provider\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'provider fixture');
  const head = git(root, 'rev-parse', 'HEAD');
  const tree = git(root, 'rev-parse', 'HEAD^{tree}');
  const repoId = resolveRepoIdentity(root);
  const providerCases: string[] = [];
  for (const [index, taskName] of taskNames.entries()) {
    const taskId = deriveTaskId({ repoIdentity: repoId, sprintPath, taskCell: taskName });
    const taskRevision = deriveTaskRevision({ taskId, modeCell: 'inline', acceptanceCell: 'provider observation remains read only' });
    const claimId = `fleet-provider-claim-${index + 1}`;
    const receipt = buildPublicationReceipt({
      repo_id: repoId, task_id: taskId, task_revision: taskRevision, claim_id: claimId, generation: 1,
      target_ref: 'main', base_sha: base, branch: 'codex/fleet-provider', head_sha: head, tree_sha: tree,
      review_subject_sha256: `sha256:${'1'.repeat(64)}`,
      verification_evidence_sha256: `sha256:${'2'.repeat(64)}`,
      merge_seal_sha256: `sha256:${'3'.repeat(64)}`,
      provider: 'github', provider_repo_id: 'R_fleet_provider', pr_number: index + 1,
      pr_url: `https://example.invalid/pr/${index + 1}`, created_at: '2026-08-23T00:00:00.000Z',
    });
    writePublicationReceiptCache(root, receipt);
    const owner = buildLeaseOwnerRecord({
      claimId, taskId, taskRevision, sprintPath, targetRef: 'main', generation: 1,
      sessionId: `fleet-provider-session-${index + 1}`, sourceWorktree: root,
    });
    const bound = bindLeaseRecord(owner, { claimId, executionWorktree: root, branch: 'codex/fleet-provider', unitRef: 'plans/plan-fleet-provider.md' });
    if (!bound.ok) throw new Error(bound.error);
    const completing = beginLeaseCompletionRecord(bound.record, { claimId, executionWorktree: root, finishTransactionKey: null });
    if (!completing.ok) throw new Error(completing.error);
    const reviewing = enterReviewingLeaseRecord(completing.record, {
      claimId,
      publication: {
        publication_id: receipt.publication_id,
        receipt_sha256: publicationReceiptDigest(receipt),
        head_sha: head,
        ship_transaction_key: `fleet-provider-ship-${index + 1}`,
      },
    });
    if (!reviewing.ok) throw new Error(reviewing.error);
    if (!createLeaseDirectory(root, taskId)) throw new Error('lease creation failed');
    writeLeaseOwnerDurably(root, taskId, reviewing.record);
    const providerPr = JSON.stringify({
      number: index + 1, url: receipt.pr_url, state: 'OPEN', isDraft: false,
      headRefOid: head, headRefName: receipt.branch, baseRefOid: base, baseRefName: 'main',
      body: encodePublicationMarker(receipt), reviewDecision: null, mergeable: 'MERGEABLE',
    });
    providerCases.push(`  ${index + 1}) printf '%s\\n' ${shellSingleQuoted(providerPr)} ;;`);
  }
  const counterDir = join(root, 'provider-counter');
  mkdirSync(counterDir);
  writeFileSync(join(counterDir, 'active'), '0\n');
  writeFileSync(join(counterDir, 'maximum'), '0\n');
  const ghBin = join(root, 'fake-gh.sh');
  writeFileSync(ghBin, [
    '#!/bin/sh', 'set -eu', 'counter="${FLEET_PROVIDER_COUNTER_DIR:?}"',
    'lock() { while ! mkdir "$counter/lock" 2>/dev/null; do sleep 0.002; done; }',
    'unlock() { rmdir "$counter/lock"; }',
    'lock', 'active=$(cat "$counter/active")', 'active=$((active + 1))', 'printf "%s\\n" "$active" > "$counter/active"',
    'maximum=$(cat "$counter/maximum")', 'if [ "$active" -gt "$maximum" ]; then printf "%s\\n" "$active" > "$counter/maximum"; fi', 'unlock',
    'cleanup() { lock; active=$(cat "$counter/active"); printf "%s\\n" "$((active - 1))" > "$counter/active"; unlock; }',
    'trap cleanup EXIT INT TERM', 'sleep 0.04',
    'if [ "$1" = "repo" ] && [ "$2" = "view" ]; then printf "%s\\n" \'{"id":"R_fleet_provider","nameWithOwner":"example/fleet"}\'; exit 0; fi',
    'if [ "$1" = "pr" ] && [ "$2" = "view" ]; then case "$3" in', ...providerCases, '  *) exit 2 ;;', 'esac; exit 0; fi',
    'if [ "$1" = "pr" ] && [ "$2" = "checks" ]; then printf "%s\\n" \'[{"bucket":"pass"}]\'; exit 0; fi',
    'if [ "$1" = "api" ] && [ "$2" = "graphql" ]; then printf "%s\\n" \'{"data":{"node":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}}}\'; exit 0; fi',
    'exit 2',
  ].join('\n'));
  chmodSync(ghBin, 0o755);
  return {
    repo: {
      id: 'repo-provider', path: realpathSync(root), accessMode: 'read_only', source: 'manual',
      registeredAt: '2026-08-23T00:00:00.000Z', lastSeenAt: '2026-08-23T00:00:00.000Z',
    },
    gh_bin: ghBin,
    counter_dir: counterDir,
  };
}

describe('fleet board collector', () => {
  test('real collector reads a registered sprint board without mutating repo or registry authority', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-real-'));
    const repoRoot = join(root, 'repo');
    const home = join(root, 'home');
    const sprintPath = 'plans/sprints/fleet-board.sprint.md';
    try {
      mkdirSync(join(repoRoot, '.ai/harness/sprint'), { recursive: true });
      mkdirSync(join(repoRoot, 'plans/sprints'), { recursive: true });
      mkdirSync(home, { recursive: true });
      writeFileSync(join(repoRoot, '.ai/harness/policy.json'), '{"worktree_strategy":{"merge_back":{"target":"main"}}}\n');
      writeFileSync(join(repoRoot, '.ai/harness/sprint/active-sprint'), `${sprintPath}\n`);
      writeFileSync(join(repoRoot, sprintPath), [
        '# Fleet fixture', '', '## Backlog', '',
        '| # | Status | Task | Mode | Acceptance | Plan |',
        '|---|--------|------|------|------------|------|',
        '| 1 | [ ] | inspect one registered repository | inline | projection is read only | (pending) |', '',
      ].join('\n'));
      execFileSync('git', ['init', '-b', 'main'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.name', 'Fleet Board Test'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['config', 'user.email', 'fleet-board@test.invalid'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['add', '.'], { cwd: repoRoot, encoding: 'utf8' });
      execFileSync('git', ['commit', '-m', 'fixture'], { cwd: repoRoot, encoding: 'utf8' });
      const canonicalRepoRoot = realpathSync(repoRoot);
      const repositoryId = repoHarnessRepoIdFor(canonicalRepoRoot);
      writeFileSync(join(home, 'registered-repos.json'), `${JSON.stringify({
        version: 1, authorizationRevision: 1, repos: [{
          id: repositoryId, path: canonicalRepoRoot, accessMode: 'read_only', source: 'manual',
          registeredAt: '2026-08-23T00:00:00.000Z', lastSeenAt: '2026-08-23T00:00:00.000Z',
        }],
      })}\n`);
      const registryBefore = readFileSync(join(home, 'registered-repos.json'), 'utf8');
      const statusBefore = execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
      const result = await collectFleetBoard({ env: { ...process.env, REPO_HARNESS_HOME: home }, timeout_ms: 1_000 });
      expect(result.repositories[0]).toMatchObject({ repository_id: repositoryId, status: 'ok' });
      expect(result.repositories[0]?.cards).toHaveLength(1);
      // The label is the digest's own preimage: the same sprint row cell the
      // task id was derived from, not a second description of the work.
      expect(result.repositories[0]?.cards[0]).toMatchObject({
        task_label: 'inspect one registered repository',
        task_index: 1,
      });
      expect(result.repositories[0]?.cards[0]?.task_id).toMatch(/^[0-9a-f]{64}$/u);
      expect(readFileSync(join(home, 'registered-repos.json'), 'utf8')).toBe(registryBefore);
      expect(execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' })).toBe(statusBefore);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 10_000);

  test('bounds ten independent repository reads and isolates the damaged tenth row', async () => {
    const repos = Array.from({ length: 10 }, (_, index) => repo(index));
    let active = 0;
    let maximum = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry(repos),
      collect_repository: async (entry) => {
        active += 1;
        maximum = Math.max(maximum, active);
        await Promise.resolve();
        active -= 1;
        if (entry.id === 'repo-09') throw new Error('fixture authority unreadable');
        return {
          repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(Number(entry.id.slice(-2)))], error: null,
        };
      },
    };
    const result = await collectFleetBoard({ max_concurrency: 4, timeout_ms: 1_000, observed_at: '2026-08-23T00:00:00.000Z' }, dependencies);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(result.repositories).toHaveLength(10);
    expect(result.repositories.filter((entry) => entry.status === 'ok')).toHaveLength(9);
    expect(result.repositories.find((entry) => entry.repository_id === 'repo-09')).toMatchObject({
      status: 'unreadable', error: { code: 'repo_board_unavailable' },
    });
    expect(result.counts.available).toBe(9);
    expect(result.counts.unreadable).toBe(1);
  });

  test('uses one fleet round deadline, drains abort cleanup, and marks every unfinished repository as timed out', async () => {
    const repos = Array.from({ length: 10 }, (_, index) => repo(index));
    let starts = 0;
    let cleanupFinished = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry(repos),
      collect_repository: async (entry, _registry, options) => {
        starts += 1;
        await new Promise<void>((resolve) => {
          const onAbort = () => {
            clearTimeout(timer);
            setTimeout(() => {
              cleanupFinished += 1;
              resolve();
            }, 20);
          };
          const timer = setTimeout(() => {
            options.signal.removeEventListener('abort', onAbort);
            resolve();
          }, 650);
          options.signal.addEventListener('abort', onAbort, { once: true });
        });
        return {
          repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(Number(entry.id.slice(-2)))], error: null,
        };
      },
    };
    const startedAt = Date.now();
    const result = await collectFleetBoard({ max_concurrency: 4, timeout_ms: 1_000 }, dependencies);
    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1_500);
    expect(starts).toBe(8);
    expect(cleanupFinished).toBe(4);
    expect(result.repositories.filter((entry) => entry.status === 'ok')).toHaveLength(4);
    expect(result.repositories.filter((entry) => entry.error?.code === 'repo_collection_timeout')).toHaveLength(6);
  }, 5_000);

  test('does not start providers when synchronous enumeration consumes the fleet round deadline', async () => {
    let collectionCalls = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => {
        const until = Date.now() + 1_050;
        while (Date.now() < until) { /* model a blocking authority read */ }
        return registry([repo(0)]);
      },
      collect_repository: async () => {
        collectionCalls += 1;
        throw new Error('provider observation must not start after the deadline');
      },
    };
    const result = await collectFleetBoard({ timeout_ms: 1_000 }, dependencies);
    expect(collectionCalls).toBe(0);
    expect(result.repositories[0]?.error).toEqual({
      code: 'repo_collection_timeout', message: 'repository collection exceeded the fleet round deadline',
    });
  }, 5_000);

  test('bounds real readiness provider children across reviewing cards with the fleet limiter', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fleet-board-provider-limit-'));
    const previousGhBin = process.env.REPO_HARNESS_GH_BIN;
    const previousCounter = process.env.FLEET_PROVIDER_COUNTER_DIR;
    try {
      const fixture = createReviewingProviderFixture(root, 4);
      process.env.REPO_HARNESS_GH_BIN = fixture.gh_bin;
      process.env.FLEET_PROVIDER_COUNTER_DIR = fixture.counter_dir;
      const dependencies: FleetBoardDependencies = {
        read_registry: () => registry([fixture.repo]),
        collect_repository: productionFleetBoardDependencies.collect_repository,
      };
      const result = await collectFleetBoard({ max_concurrency: 2, timeout_ms: 30_000 }, dependencies);
      expect(result.repositories[0]).toMatchObject({ status: 'ok' });
      expect(result.repositories[0]?.cards).toHaveLength(4);
      expect(Number.parseInt(readFileSync(join(fixture.counter_dir, 'maximum'), 'utf8'), 10)).toBe(2);
      expect(readFileSync(join(fixture.counter_dir, 'active'), 'utf8').trim()).toBe('0');
    } finally {
      if (previousGhBin === undefined) delete process.env.REPO_HARNESS_GH_BIN;
      else process.env.REPO_HARNESS_GH_BIN = previousGhBin;
      if (previousCounter === undefined) delete process.env.FLEET_PROVIDER_COUNTER_DIR;
      else process.env.FLEET_PROVIDER_COUNTER_DIR = previousCounter;
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);

  test('does not start a repository observation after the outer signal wins before synchronous collection', async () => {
    const controller = new AbortController();
    let collectionCalls = 0;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => {
        controller.abort();
        return registry([repo(0)]);
      },
      collect_repository: async () => {
        collectionCalls += 1;
        throw new Error('provider observation must not start');
      },
    };
    await expect(collectFleetBoard({ signal: controller.signal, timeout_ms: 1_000 }, dependencies)).rejects.toMatchObject({
      code: 'fleet_watch_aborted_before_first_snapshot',
    });
    expect(collectionCalls).toBe(0);
  });

  test('redacts provider stderr and repository paths from isolated rows', async () => {
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry([repo(0)]),
      collect_repository: async () => {
        throw new Error('gh stderr /private/provider-root token=super-secret');
      },
    };
    const result = await collectFleetBoard({ timeout_ms: 1_000 }, dependencies);
    const rendered = JSON.stringify(result);
    expect(result.repositories[0]?.error).toEqual({
      code: 'repo_board_unavailable', message: 'repository board observation is unavailable',
    });
    expect(rendered).not.toContain('/private/provider-root');
    expect(rendered).not.toContain('super-secret');
    expect(rendered).not.toContain('gh stderr');
  });

  test('watch emits immediate sequential snapshots with monotonic sequence and no overlap', async () => {
    const controller = new AbortController();
    const repos = [repo(0)];
    let active = 0;
    let overlap = false;
    const dependencies: FleetBoardDependencies = {
      read_registry: () => registry(repos),
      collect_repository: async (entry) => {
        active += 1;
        overlap ||= active > 1;
        await Promise.resolve();
        active -= 1;
        return {
          repository_id: entry.id, repo_root: entry.path, access_mode: entry.accessMode,
          status: 'ok', snapshot_consistency: 'stable', cards: [card(1)], error: null,
        };
      },
    };
    const iterator = watchFleetBoard({ interval_ms: 1_000, timeout_ms: 1_000, signal: controller.signal }, dependencies);
    const first = await iterator.next();
    expect(first.value?.sequence).toBe(1);
    const second = await iterator.next();
    expect(second.value?.sequence).toBe(2);
    const third = await iterator.next();
    expect(third.value?.sequence).toBe(3);
    controller.abort();
    expect((await iterator.next()).done).toBe(true);
    expect(overlap).toBe(false);
  }, 10_000);
});
