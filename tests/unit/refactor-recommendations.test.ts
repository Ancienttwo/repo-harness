import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RefactorProviderError } from '../../src/core/refactor/provider-contract';
import { observeRefactorRecommendations, refactorCandidates, type RefactorDiscovery } from '../../src/effects/refactor/recommendations';
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

// The archctx-contracts package ships these 0.7.2 fixtures: a real scan result and one recorded open suggestion.
const shipped = (name: string) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.resolve('archctx-contracts'))), '../fixtures/valid', name), 'utf8'));
const shippedScan = () => shipped('runtime-refactor-scan.json');
const shippedRecord = () => shipped('recommendation-v3.json');

/** The shipped scan has unknown code facts; the tests that need suggestions start from a complete read of it. */
function discovery(options: { codeFacts?: Record<string, unknown>; multiplyOwned?: number; scan?: Record<string, unknown>; open?: unknown[] } = {}): RefactorDiscovery {
  const scan = shippedScan();
  scan.snapshot.codeFacts = { ...scan.snapshot.codeFacts, coverage: 'complete', truncated: false, reasonCodes: [], ...options.codeFacts };
  scan.snapshot.repositorySummary.multiplyOwnedFileCount = options.multiplyOwned ?? 0;
  return { scan: { ...scan, ...options.scan }, open: options.open ?? [] } as unknown as RefactorDiscovery;
}

test('each suggestion carries the metrics and bounded evidence of its own observation and no state is written', () => {
  const f = fixture();
  const value = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery() });
  expect(value.status).toBe('recommended');
  expect(value.candidates.map((entry) => entry.kind)).toEqual(['undeclared-footprint', 'evidence-gap']);
  expect(value.candidates[1]).toMatchObject({
    subject: 'repository:repo.537182127c5f2134',
    metrics: { unresolvedImportCount: 0, edgeLimit: 5000 },
    evidence: { kind: 'evidence-gap', coverage: 'unknown', totalCount: 0, truncated: false },
  });
  expect(value.candidates[0]).toMatchObject({
    metrics: {},
    evidence: { kind: 'undeclared-footprint', paths: [], totalCount: 0, truncated: false },
    snapshot: 'current',
    modules: [{ nodeId: 'capability.architecture.context', files: null, directionViolations: null, unresolvedImports: 0 }],
  });
  // archctx 0.7.2 never measures these, so they are not part of the module evidence.
  expect(Object.keys(value.candidates[0]!.modules[0]!)).not.toContain('instability');
  expect(Object.keys(value.candidates[0]!.modules[0]!)).not.toContain('testFiles');
  const text = formatRefactorRecommendations(value);
  expect(text).toContain('metrics: unresolvedImportCount=0, edgeLimit=5000');
  expect(text).toContain('evidence: evidence-gap, 0 total');
  expect(existsSync(join(f.repo, '.ai/harness/runs'))).toBe(false);
});

test('the text view lists the first items of a truncated evidence sample', () => {
  const record = shippedRecord();
  record.payload = {
    ...record.payload, kind: 'cycle', affectedNodeIds: [], metrics: { memberCount: 64, cycleEdgeCount: 444 },
    evidence: {
      kind: 'cycle', memberNodeIds: ['module.a', 'module.b'], totalCount: 444, truncated: true,
      edges: Array.from({ length: 8 }, (_, index) => ({ fromPath: `src/a${index}.ts`, fromLine: index + 1, toPath: 'src/b.ts', specifier: './b', fromNodeId: 'module.a', toNodeId: 'module.b' })),
    },
  };
  const [candidate] = refactorCandidates(discovery({ scan: { proposedRecommendations: [] }, open: [record] }));
  expect(candidate).toMatchObject({ kind: 'cycle', metrics: { memberCount: 64, cycleEdgeCount: 444 } });
  const text = formatRefactorRecommendations({ schemaVersion: 'repo-harness.refactor-recommendations/v2', status: 'recommended', candidates: [candidate!] });
  expect(text).toContain('metrics: memberCount=64, cycleEdgeCount=444');
  expect(text).toContain('evidence: cycle, 444 total (sample is truncated)');
  expect(text).toContain('- src/a0.ts:1 -> src/b.ts');
  expect(text).toContain('- src/a4.ts:5 -> src/b.ts');
  expect(text).not.toContain('src/a5.ts');
});

test('a recorded open suggestion that the scan suppresses is still listed, once, next to new scan candidates', () => {
  const f = fixture();
  const record = shippedRecord();
  // archctx suppresses a scan candidate whose fingerprint is already recorded, so the scan no longer proposes it.
  const scanned = shippedScan().proposedRecommendations;
  const onlyRecorded = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ scan: { proposedRecommendations: [], suppressed: [{ reasonCode: 'duplicate-active-fingerprint' }] }, open: [record] }) });
  expect(onlyRecorded.status).toBe('recommended');
  expect(onlyRecorded.candidates.map((entry) => entry.recommendationId)).toEqual([record.recommendationId]);
  // The shipped record is also a scan candidate, so a second recorded suggestion needs its own id.
  const second = { ...record, recommendationId: 'recommendation.recorded-elsewhere' };
  const mixed = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ open: [second] }) });
  expect(mixed.candidates.map((entry) => entry.recommendationId)).toEqual([second.recommendationId, ...scanned.map((entry: { recommendationId: string }) => entry.recommendationId)]);
  const listedTwice = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ open: [scanned[0]] }) });
  expect(listedTwice.candidates.map((entry) => entry.recommendationId)).toEqual(scanned.map((entry: { recommendationId: string }) => entry.recommendationId));
});

test('a recorded suggestion from an earlier snapshot keeps its own metrics and gets no current module statistics', () => {
  const stale = { ...shippedRecord(), payload: { ...shippedRecord().payload, baselineSnapshotDigest: `sha256:${'0'.repeat(64)}`, metrics: { unownedFileCount: 218 } } };
  const scan = { proposedRecommendations: [] };
  const [earlier] = refactorCandidates(discovery({ scan, open: [stale] }));
  expect(earlier).toMatchObject({ snapshot: 'earlier', baselineSnapshotDigest: stale.payload.baselineSnapshotDigest, metrics: { unownedFileCount: 218 }, modules: [] });
  const [current] = refactorCandidates(discovery({ scan, open: [shippedRecord()] }));
  expect(current).toMatchObject({ snapshot: 'current', modules: [{ nodeId: 'capability.architecture.context' }] });
  const text = formatRefactorRecommendations({ schemaVersion: 'repo-harness.refactor-recommendations/v2', status: 'recommended', candidates: [earlier!] });
  expect(text).toContain(`recorded on an earlier snapshot (${stale.payload.baselineSnapshotDigest})`);
  expect(text).not.toContain('modules:');
});

test('no open record and no scan candidate means no action', () => {
  const f = fixture();
  expect(observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ scan: { proposedRecommendations: [] } }) }).status).toBe('no_action');
});

test('incomplete code facts or ambiguous ownership withhold suggestions', () => {
  const f = fixture();
  const partial = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ codeFacts: { coverage: 'partial', reasonCodes: ['code-facts-missing'] } }) });
  expect(partial).toMatchObject({ status: 'proof_required', candidates: [] });
  expect(partial.message).toContain('codegraph init');
  const ambiguous = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => discovery({ multiplyOwned: 75 }) });
  expect(ambiguous).toMatchObject({ status: 'proof_required', candidates: [] });
  expect(ambiguous.message).toContain('75 files have more than one owning capability');
});

test('the import node limit reaches the scan and its remedy is a larger limit, not a new index', () => {
  const f = fixture();
  const limits: Array<number | undefined> = [];
  const limited = observeRefactorRecommendations(f.repo, {
    env: f.env, importNodeLimit: 100,
    discover: (_root, _provider, limit) => { limits.push(limit); return discovery({ codeFacts: { coverage: 'partial', reasonCodes: ['code-facts-import-limit'], edgeLimit: 100, importNodeCount: 6145 } }); },
  });
  expect(limits).toEqual([100]);
  expect(limited).toMatchObject({ status: 'proof_required', candidates: [] });
  expect(limited.message).toContain('6145 import nodes');
  expect(limited.message).toContain('limit of 100');
  expect(limited.message).toContain('--import-node-limit');
  expect(limited.message).not.toContain('codegraph init');
  observeRefactorRecommendations(f.repo, { env: f.env, discover: (_root, _provider, limit) => { limits.push(limit); return discovery(); } });
  expect(limits).toEqual([100, undefined]);
});

test('a provider error keeps its code, action and full message', () => {
  const f = fixture();
  const message = `repository state is stale: ${'x'.repeat(1500)}`;
  const failed = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => { throw new RefactorProviderError('AC_REFACTOR_STALE', message, 'rerun-refactor-scan'); } });
  expect(failed).toMatchObject({ status: 'unavailable', candidates: [], code: 'AC_REFACTOR_STALE', action: 'rerun-refactor-scan', message });
  expect(formatRefactorRecommendations(failed)).toBe(`[RefactorRecommendations] unavailable: AC_REFACTOR_STALE: ${message} (action: rerun-refactor-scan)\n`);
});

test('an unavailable provider or a missing model reports unavailable without a scan', () => {
  const f = fixture();
  const failed = observeRefactorRecommendations(f.repo, { env: f.env, discover: () => { throw new Error('archctx missing'); } });
  expect(failed).toMatchObject({ status: 'unavailable', message: 'archctx missing' });
  expect(failed.code).toBeUndefined();
  rmSync(join(f.repo, '.archcontext'), { recursive: true });
  expect(observeRefactorRecommendations(f.repo, { env: f.env, discover: () => { throw new Error('must not scan'); } }).status).toBe('unavailable');
});
