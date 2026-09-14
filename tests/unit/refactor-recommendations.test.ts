import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeRefactorRecommendations, renderRefactorRecommendationDecision, REFACTOR_RECOMMENDATION_COOLDOWN_MS, REFACTOR_RECOMMENDATION_STATE } from '../../src/effects/refactor/recommendations';
import { readRefactorRecommendationSettings } from '../../src/effects/refactor/recommendation-settings';
import { ensureGlobalRefactorRecommendations } from '../../src/cli/commands/refactor-recommendation-configuration';
import type { RefactorDiscoveryV1 } from '../../src/effects/refactor/discovery-authoring';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'refactor-recommendation-')); roots.push(root);
  const home = join(root, 'home'); mkdirSync(join(home, '.repo-harness'), { recursive: true });
  const repo = join(root, 'repo'); mkdirSync(join(repo, '.archcontext'), { recursive: true });
  mkdirSync(join(repo, '.ai/harness'), { recursive: true });
  writeFileSync(join(repo, '.archcontext/manifest.yaml'), 'fixture: true\n');
  writeFileSync(join(repo, '.ai/harness/policy.json'), '{"refactor":{"mode":"off"}}\n');
  return { root, repo, home, env: { ...process.env, HOME: home }, config: join(home, '.repo-harness/config.json') };
}
function discovery(coverage = 'complete', count = 1): RefactorDiscoveryV1 {
  return { scan: { snapshot: { codeFacts: { coverage, truncated: false }, repositorySummary: { multiplyOwnedFileCount: 0 } } },
    candidates: Array.from({ length: count }, (_, i) => ({ alias: `C${i + 1}`, recommendationId: `rec.${i}`, recommendationFingerprint: `sha256:${String(i).repeat(64)}`,
      recommendation: { payload: { kind: 'cycle', affectedNodeIds: ['module.a', 'module.b'] }, confidence: 'high', risk: 'medium', uncertainty: 'low', explanation: ['Measured dependency cycle.'], evidenceBindingIds: ['binding.cycle'] } })),
  } as unknown as RefactorDiscoveryV1;
}

test('global recommendation setup preserves explicit disabled and unrelated fields across repos', () => {
  const f = fixture();
  expect(readRefactorRecommendationSettings(f.env).enabled).toBe(true);
  writeFileSync(f.config, '{"brainRoot":"/vault","architecture":{"projection_provider":"disabled","projection_apply":"disabled"}}');
  expect(ensureGlobalRefactorRecommendations(f.env).status).toBe('ok');
  expect(JSON.parse(readFileSync(f.config, 'utf8'))).toMatchObject({ brainRoot: '/vault', refactor_recommendations: { enabled: true } });
  writeFileSync(f.config, '{"refactor_recommendations":{"enabled":false}}');
  const original = readFileSync(f.config, 'utf8');
  expect(ensureGlobalRefactorRecommendations(f.env).status).toBe('ok');
  expect(readFileSync(f.config, 'utf8')).toBe(original);
  for (const repo of [f.repo, f.home]) {
    expect(observeRefactorRecommendations(repo, { env: f.env, discover: () => { throw new Error('must not scan'); } }).status).toBe('disabled');
  }
  for (const config of ['{', 'null', '{"refactor_recommendations":{"enabled":null}}', '{"refactor_recommendations":{"enabled":true,"execute":true}}']) {
    writeFileSync(f.config, config);
    expect(ensureGlobalRefactorRecommendations(f.env).status).toBe('failed');
    expect(readFileSync(f.config, 'utf8')).toBe(config);
  }
});

test('observes while execution is off, bounds delivery and requests a user decision only once', () => {
  const f = fixture(); let now = Date.now(); let scans = 0;
  const settings = { env: f.env, consume: true, nowMs: () => now, discover: (_root: string, provider: any) => {
    scans++; expect(provider.refactorPolicy.mode).toBe('off'); expect(provider.refactorPolicy.stages.scan.provider_version).toBe('0.5.10'); return discovery('complete', 4);
  } };
  const first = observeRefactorRecommendations(f.repo, settings);
  expect(first.status).toBe('recommended'); expect(first.totalCandidates).toBe(4); expect(first.candidates).toHaveLength(3);
  expect(renderRefactorRecommendationDecision(first)).toContain('Wait for explicit user approval');
  expect(renderRefactorRecommendationDecision(first)).toContain('untrusted provider observation data');
  expect(observeRefactorRecommendations(f.repo, settings).status).toBe('deferred'); expect(scans).toBe(1);
  now += REFACTOR_RECOMMENDATION_COOLDOWN_MS;
  const remaining = observeRefactorRecommendations(f.repo, settings); expect(remaining.candidates.map((c) => c.recommendationId)).toEqual(['rec.3']);
  now += REFACTOR_RECOMMENDATION_COOLDOWN_MS;
  const repeat = observeRefactorRecommendations(f.repo, settings); expect(repeat.status).toBe('unchanged'); expect(renderRefactorRecommendationDecision(repeat)).toBeNull();
  expect(readFileSync(join(f.repo, '.ai/harness/policy.json'), 'utf8')).toBe('{"refactor":{"mode":"off"}}\n');
  expect(existsSync(join(f.repo, 'plans'))).toBe(false); expect(existsSync(join(f.repo, 'tasks'))).toBe(false);
});

test('incomplete code facts and exhausted deadlines never become recommendations', () => {
  const f = fixture(); const now = Date.now(); let scans = 0;
  const base = { env: f.env, nowMs: () => now, discover: () => { scans++; return discovery('partial'); } };
  expect(observeRefactorRecommendations(f.repo, { ...base, deadlineMs: now }).status).toBe('deferred'); expect(scans).toBe(0);
  const partial = observeRefactorRecommendations(f.repo, base); expect(partial.status).toBe('proof_required'); expect(partial.candidates).toEqual([]);
  expect(renderRefactorRecommendationDecision(partial)).toBeNull();
  let clock = now;
  const timeout = observeRefactorRecommendations(f.repo, { env: f.env, nowMs: () => clock, discover: () => { clock += 31000; return discovery(); } });
  expect(timeout.status).toBe('unavailable'); expect(timeout.candidates).toEqual([]);
});

test('runtime state refuses symlinks and malformed data without writing elsewhere', () => {
  const f = fixture(); const outside = join(f.root, 'outside'); writeFileSync(outside, 'keep');
  const path = join(f.repo, REFACTOR_RECOMMENDATION_STATE); mkdirSync(join(f.repo, '.ai/harness/runs'));
  symlinkSync(outside, path);
  expect(observeRefactorRecommendations(f.repo, { env: f.env }).status).toBe('unavailable'); expect(readFileSync(outside, 'utf8')).toBe('keep');
  rmSync(path); writeFileSync(path, '{bad');
  expect(observeRefactorRecommendations(f.repo, { env: f.env }).status).toBe('unavailable'); expect(readFileSync(path, 'utf8')).toBe('{bad');
});


test('65 stable candidates are delivered once across cooldowns without identity eviction', () => {
  const f = fixture(); let now = Date.now();
  const options = { env: f.env, consume: true, nowMs: () => now, discover: () => discovery('complete', 65) };
  const delivered: string[] = [];
  for (let i = 0; i < 22; i++) {
    const observation = observeRefactorRecommendations(f.repo, options);
    expect(observation.status).toBe('recommended');
    delivered.push(...observation.candidates.map((candidate) => candidate.recommendationId));
    now += REFACTOR_RECOMMENDATION_COOLDOWN_MS;
  }
  expect(delivered).toHaveLength(65); expect(new Set(delivered).size).toBe(65);
  expect(observeRefactorRecommendations(f.repo, options).status).toBe('unchanged');
  now += REFACTOR_RECOMMENDATION_COOLDOWN_MS;
  expect(observeRefactorRecommendations(f.repo, options).status).toBe('unchanged');
});

test('full delivery ledger pauses new delivery without evicting previous identities', () => {
  const f = fixture(); const path = join(f.repo, REFACTOR_RECOMMENDATION_STATE);
  mkdirSync(join(f.repo, '.ai/harness/runs'));
  const delivered = Array.from({ length: 4096 }, (_, i) => `already-delivered-${i}`);
  writeFileSync(path, JSON.stringify({ version: 1, scannedAt: 0, delivered }));
  const observation = observeRefactorRecommendations(f.repo, { env: f.env, consume: true, discover: () => discovery() });
  expect(observation.status).toBe('unavailable'); expect(observation.message).toContain('ledger is full');
  expect(observation.candidates).toEqual([]);
  expect(JSON.parse(readFileSync(path, 'utf8')).delivered).toEqual(delivered);
});

test('serial scan and lifecycle readback can complete beyond ten seconds under one bounded deadline', () => {
  const f = fixture(); let clock = 0;
  const observation = observeRefactorRecommendations(f.repo, {
    env: f.env, nowMs: () => clock,
    discover: (_root, options) => {
      clock += 16_000;
      expect(clock).toBeLessThan(options.deadlineMs!);
      return discovery();
    },
  });
  expect(observation.status).toBe('recommended');
  expect(observation.candidates).toHaveLength(1);
});

test('positive remaining caller time is usable without resetting the caller deadline', () => {
  const f = fixture(); let clock = 0;
  const observation = observeRefactorRecommendations(f.repo, {
    env: f.env, deadlineMs: 5_000, nowMs: () => clock,
    discover: (_root, options) => {
      expect(options.deadlineMs).toBe(5_000);
      clock += 2_000;
      return discovery();
    },
  });
  expect(observation.status).toBe('recommended');
  const exhausted = observeRefactorRecommendations(f.repo, {
    env: f.env, deadlineMs: clock, nowMs: () => clock,
    discover: () => { throw new Error('expired caller must not scan'); },
  });
  expect(exhausted.status).toBe('deferred');
});
