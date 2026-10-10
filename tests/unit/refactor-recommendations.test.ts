import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeRefactorRecommendations, type RefactorDiscovery } from '../../src/effects/refactor/recommendations';
import { formatRefactorRecommendations } from '../../src/cli/commands/refactor';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'refactor-recommendation-')); roots.push(root);
  const home = join(root, 'home'); mkdirSync(join(home, '.repo-harness'), { recursive: true });
  const repo = join(root, 'repo'); mkdirSync(join(repo, '.archcontext'), { recursive: true });
  writeFileSync(join(repo, '.archcontext/manifest.yaml'), 'fixture: true\n');
  return { root, repo, env: { ...process.env, HOME: home } };
}

function observation(id: string) {
  return {
    recommendationId: id, category: 'structural_observation', subject: 'module.a', subjectSelectorId: `selector.${id}`, status: 'open',
    confidence: 'high', risk: 'medium', uncertainty: 'low', explanation: ['Structural observation cycle on module.a'], evidenceBindingIds: ['binding.cycle'],
    payload: { kind: 'cycle', affectedNodeIds: ['module.a', 'module.b'], assessmentDigest: 'sha256:'.padEnd(71, '1'), baselineSnapshotDigest: 'sha256:'.padEnd(71, '2'), derivedOutcomes: [] },
  };
}
function module(nodeId: string) {
  return {
    nodeId, footprint: { fileCount: 12, lineCount: 3400, includePatterns: [], excludePatterns: [] },
    dependencyGraph: { fanIn: 4, fanOut: 9, cycleCount: 2, instability: 0.69, directionViolationCount: 1 },
    tests: { testFileCount: 3 }, uncertainty: { unresolvedImports: 0 },
  };
}
function discovery(options: { coverage?: string; multiplyOwned?: number; ids?: string[]; records?: Array<{ recommendationId: string; status: string }> } = {}): RefactorDiscovery {
  const ids = options.ids ?? ['rec.0'];
  return {
    scan: {
      snapshot: { codeFacts: { coverage: options.coverage ?? 'complete', truncated: false }, repositorySummary: { multiplyOwnedFileCount: options.multiplyOwned ?? 0 },
        modules: [module('module.a'), module('module.b')] },
      assessment: { observations: ids.map((id) => ({ kind: 'cycle', subjectSelectorId: `selector.${id}`, signalIds: ['signal.cycle'], metrics: { cycleCount: 2, sccSize: 2 } })) },
      proposedRecommendations: ids.map(observation),
    },
    records: options.records ?? [],
  } as unknown as RefactorDiscovery;
}

test('each suggestion carries its measured metrics and module evidence and no state is written', () => {
  const f = fixture();
  const value = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery() });
  expect(value.status).toBe('recommended');
  expect(value.candidates).toHaveLength(1);
  expect(value.candidates[0]).toMatchObject({
    recommendationId: 'rec.0', kind: 'cycle', subject: 'module.a', metrics: { cycleCount: 2, sccSize: 2 },
    modules: [
      { nodeId: 'module.a', files: 12, lines: 3400, fanIn: 4, fanOut: 9, cycles: 2, instability: 0.69, directionViolations: 1, testFiles: 3, unresolvedImports: 0 },
      { nodeId: 'module.b', files: 12 },
    ],
  });
  expect(formatRefactorRecommendations(value)).toContain('metrics: cycleCount=2, sccSize=2');
  expect(existsSync(join(f.repo, '.ai/harness/runs'))).toBe(false);
});

test('suggestions with a recorded user decision are not shown again', () => {
  const f = fixture();
  const value = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({
    ids: ['rec.0', 'rec.1', 'rec.2'], records: [{ recommendationId: 'rec.0', status: 'rejected' }, { recommendationId: 'rec.1', status: 'acknowledged' }],
  }) });
  expect(value.candidates.map((entry) => entry.recommendationId)).toEqual(['rec.1', 'rec.2']);
  const none = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ ids: ['rec.0'], records: [{ recommendationId: 'rec.0', status: 'deferred' }] }) });
  expect(none.status).toBe('no_action');
});

test('incomplete code facts or ambiguous ownership withhold suggestions', () => {
  const f = fixture();
  const partial = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ coverage: 'partial' }) });
  expect(partial).toMatchObject({ status: 'proof_required', candidates: [] });
  expect(partial.message).toContain('codegraph init');
  const ambiguous = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ multiplyOwned: 75 }) });
  expect(ambiguous).toMatchObject({ status: 'proof_required', candidates: [] });
  expect(ambiguous.message).toContain('75 files have more than one owning capability');
});

test('an unavailable provider or a missing model reports unavailable without a scan', () => {
  const f = fixture();
  const failed = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => { throw new Error('archctx missing'); } });
  expect(failed).toMatchObject({ status: 'unavailable', message: 'archctx missing' });
  rmSync(join(f.repo, '.archcontext'), { recursive: true });
  expect(observeRefactorRecommendations(f.repo, { env: f.env, discover: () => { throw new Error('must not scan'); } }).status).toBe('unavailable');
});
