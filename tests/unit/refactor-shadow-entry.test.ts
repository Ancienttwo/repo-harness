import { afterEach, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { moduleStatisticsSnapshotDigest, refactorAssessmentDigest, type ModuleStatisticsSnapshotV1, type RefactorAssessmentV1, type RefactorRequestV1 } from 'archctx-contracts';
import { buildRefactorCommand } from '../../src/cli/commands/refactor';
import { runShadowRefactorDiscovery, type RefactorShadowInput } from '../../src/effects/refactor/shadow-discovery';
import { activateRefactorFixture } from '../helpers/refactor-activation-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const digest = (char: string) => `sha256:${char.repeat(64)}`;
const request: RefactorRequestV1 = { schemaVersion: 'archcontext.refactor-request/v1', scope: { kind: 'repository' } };
const input: RefactorShadowInput = { request, candidateAlias: 'C01', providerCalls: 3, authorCalls: 1, timeoutMs: 10000 };
const draft = { authoredBy: { id: 'repo-harness.local-refactor-author', kind: 'subagent', source: 'subagent' }, intent: 'Remove the measured cycle', scopePaths: ['a.ts'], targetOutcomes: [], killList: [] };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'refactor-shadow-test-')); roots.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q'); mkdirSync(join(root, '.ai/harness'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/policy.json'), JSON.stringify({ refactor: { mode: 'shadow' } }));
  writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
  git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
  const head = git('rev-parse', 'HEAD'); activateRefactorFixture(root, 'repo.test', head, 'shadow');
  let authors = 0; let scans = 0; let observations = true; let lifecycle: string | null = null;
  let coverage: 'complete' | 'partial' | 'unknown' = 'complete'; let ambiguous = false; let stale = false;
  let change: 'repository' | 'workspace' | 'model' | null = null;
  const recommendation = { schemaVersion: 'archcontext.recommendation/v3', recommendationId: 'recommendation.1', runId: 'run.1', fingerprint: digest('a'), subject: 'node.a', status: 'open', confidence: 'high', enforcement: 'advisory', risk: 'low', uncertainty: 'low', evidenceBindingIds: [], explanation: [], authoredBy: { kind: 'daemon', id: 'archctxd', source: 'daemon' }, subjectSelectorId: 'node.a', relations: {}, createdAt: '2026-09-04T00:00:00.000Z', updatedAt: '2026-09-04T00:01:00.000Z', category: 'structural_observation', payload: { assessmentDigest: digest('b'), kind: 'cycle', affectedNodeIds: ['node.a'], baselineSnapshotDigest: digest('c'), derivedOutcomes: [] } };
  const provider = { consumerRoot: process.cwd(), run: (_binary: string, args: readonly string[]) => {
    let value: unknown;
    if (args[0] === 'capabilities') value = { schemaVersion: 'archcontext.capabilities/v1', package: { name: 'archctx', version: '0.5.6' }, features: ['module-statistics-v1', 'refactor-assessment-v1', 'recommendation-v3'] };
    else if (args[0] === 'book') value = { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'book.recommendations', data: { schemaVersion: 'archcontext.architecture-book-recommendations/v1', recommendations: lifecycle ? [{ ...recommendation, status: lifecycle }] : [], freshness: { worktree: { headSha: head } } } };
    else {
      scans++;
      const req = JSON.parse(args[args.indexOf('--request-json') + 1]!) as RefactorRequestV1;
      const proposed = Boolean(req.proposal);
      if (proposed) { expect(req.expectedHeadSha).toBe(head); expect(req.expectedWorktreeDigest).toBe(digest('b')); }
      const snapshotDraft: ModuleStatisticsSnapshotV1 = {
        schemaVersion: 'archcontext.module-statistics/v1', repository: { repositoryId: proposed && change === 'repository' ? 'repo.changed' : 'repo.test', storageRepositoryId: 'storage.repo.test' },
        worktree: { workspaceId: proposed && change === 'workspace' ? 'workspace.changed' : 'workspace.test', storageWorkspaceId: 'storage.workspace.test', branch: 'main', headSha: proposed && stale ? 'c'.repeat(40) : head, worktreeDigest: digest('b') }, modelDigest: proposed && change === 'model' ? digest('f') : digest('c'),
        codeFacts: { provider: 'codegraph', version: '1.5.0', binaryDigest: digest('d'), indexedWorktreeDigest: coverage === 'unknown' ? null : digest('b'), coverage, truncated: coverage !== 'complete', edgeLimit: 5000, reasonCodes: [] }, modules: [],
        repositorySummary: { moduleCount: 0, undeclaredFootprintNodeCount: 0, ownedFileCount: 0, unownedFileCount: 0, multiplyOwnedFileCount: ambiguous ? 1 : 0, crossModuleEdgeCount: 0, crossModuleCycleCount: 0, stronglyConnectedComponentCount: 0, unresolvedImportCount: 0, dynamicInvocationRiskCount: 0 }, createdAt: '2026-09-04T00:00:00.000Z', snapshotDigest: digest('0'),
      };
      const snapshot = { ...snapshotDraft, snapshotDigest: moduleStatisticsSnapshotDigest(snapshotDraft) };
      const assessmentDraft: RefactorAssessmentV1 = { schemaVersion: 'archcontext.refactor-assessment/v1', requestId: 'request.test', statisticsSnapshotDigest: snapshot.snapshotDigest, modelDigest: snapshot.modelDigest, codeFactsDigest: digest('e'), requestedScope: req.scope, proposalDigest: req.proposal?.proposalDigest ?? null, observations: [], scale: proposed ? 'module' : null, scaleReasonCodes: [], affectedNodeIds: [], majorChangeReasons: [], pressure: { level: 'low', score: 0, signalIds: [] }, confidence: { level: 'high', callerCoverage: null, testsObserved: null, rollbackObserved: null, unresolvedEvidence: [] }, createdAt: '2026-09-04T00:00:01.000Z', assessmentDigest: digest('0') };
      const assessment = { ...assessmentDraft, assessmentDigest: refactorAssessmentDigest(assessmentDraft) };
      value = { schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'refactor.scan', data: { schemaVersion: 'archcontext.runtime-refactor-scan/v1', repository: snapshot.repository, worktree: snapshot.worktree, requestId: 'request.test', request: req, snapshot, assessment, ...(req.proposal ? { proposal: req.proposal } : {}), proposedRecommendations: observations && !proposed ? [recommendation] : [] } };
    }
    return { status: 0, signal: null, stderr: '', stdout: JSON.stringify(value) };
  } };
  const dependencies = { provider, author: async (prompt: string) => { authors++; expect(prompt.match(/Treat absent requirements/g)).toHaveLength(1); return draft; } };
  return { root, dependencies, authors: () => authors, scans: () => scans, observations: (value: boolean) => { observations = value; }, lifecycle: (value: string) => { lifecycle = value; }, coverage: (value: typeof coverage) => { coverage = value; }, ambiguous: () => { ambiguous = true; }, stale: () => { stale = true; }, change: (value: typeof change) => { change = value; } };
}
test('public CLI reaches provider and accountable author, then suppresses exact duplicate proposals', async () => {
  const f = fixture(); const file = join(f.root, 'request.json'); writeFileSync(file, JSON.stringify(input));
  await buildRefactorCommand(f.dependencies).parseAsync(['discover', '--repo', f.root, '--request', file], { from: 'user' });
  expect(f.authors()).toBe(1); expect(f.scans()).toBe(2);
  const duplicate = await runShadowRefactorDiscovery(input, f.root, f.dependencies) as any;
  expect(duplicate.status).toBe('duplicate'); expect(duplicate.result.status).toBe('assessed'); expect(f.authors()).toBe(1);
  expect(readdirSync(join(f.root, '.git/repo-harness')).sort()).toEqual(['refactor-activation', 'refactor-shadow']);
  expect(readFileSync(join(f.root, 'a.ts'), 'utf8')).toBe('export const a = 1;\n');
});
test('normal empty and upstream resolved/superseded observations never invoke author', async () => {
  for (const state of ['empty', 'resolved', 'superseded']) { const f = fixture(); if (state === 'empty') f.observations(false); else f.lifecycle(state);
    expect((await runShadowRefactorDiscovery(input, f.root, f.dependencies) as any).status).toBe('no_action'); expect(f.authors()).toBe(0); }
});
test('missing index, partial and ambiguous ownership stop at proof_required', async () => {
  for (const state of ['unknown', 'partial', 'ambiguous'] as const) { const f = fixture(); if (state === 'ambiguous') f.ambiguous(); else f.coverage(state);
    expect((await runShadowRefactorDiscovery(input, f.root, f.dependencies) as any).status).toBe('proof_required'); expect(f.authors()).toBe(0); }
});
test('explicit budgets stop before side effects and author failure is not retried', async () => {
  const f = fixture(); expect((await runShadowRefactorDiscovery({ ...input, providerCalls: 1 }, f.root, f.dependencies) as any).status).toBe('budget_exhausted'); expect(f.scans()).toBe(0);
  expect((await runShadowRefactorDiscovery({ ...input, authorCalls: 0 }, f.root, f.dependencies) as any).status).toBe('budget_exhausted'); expect(f.authors()).toBe(0);
  const deps = { ...f.dependencies, author: async () => { throw new Error('author unavailable'); } };
  expect((await runShadowRefactorDiscovery(input, f.root, deps) as any).status).toBe('failed');
  expect((await runShadowRefactorDiscovery(input, f.root, f.dependencies) as any).status).toBe('duplicate'); expect(f.authors()).toBe(0);
});
test('identity changes during authoring fail closed for HEAD, workspace, repository and model', async () => {
  for (const state of ['head', 'workspace', 'repository', 'model'] as const) { const f = fixture();
    const deps = { ...f.dependencies, author: async () => { await Promise.resolve(); if (state === 'head') f.stale(); else f.change(state); return draft; } };
    expect((await runShadowRefactorDiscovery(input, f.root, deps) as any).status).toBe('failed'); }
});
test('illegal author, unauthorized fields and empty or wrong scope are rejected without assessment', async () => {
  for (const invalid of [{ ...draft, authoredBy: { id: 'evil', kind: 'daemon', source: 'daemon' } }, { ...draft, scale: 'module' }, { ...draft, route: 'no_action' }, { ...draft, scopePaths: [] }, { ...draft, scopePaths: ['missing.ts'] }]) {
    const f = fixture(); const result = await runShadowRefactorDiscovery(input, f.root, { ...f.dependencies, author: async () => invalid }) as any;
    expect(result.status).toBe('failed'); expect(f.scans()).toBe(1);
  }
});
test('concurrent exact triggers reserve one author attempt', async () => {
  const f = fixture(); let release!: () => void; let count = 0;
  const barrier = new Promise<void>((done) => { release = done; });
  const first = runShadowRefactorDiscovery(input, f.root, { ...f.dependencies, author: async () => { count++; await barrier; return draft; } });
  expect((await runShadowRefactorDiscovery(input, f.root, f.dependencies) as any).status).toBe('in_progress_or_interrupted');
  release(); expect((await first as any).status).toBe('assessed'); expect(count).toBe(1); expect(f.authors()).toBe(0);
});
test('activation and explicit candidate selection remain required', async () => {
  const f = fixture();
  expect((await runShadowRefactorDiscovery({ ...input, candidateAlias: undefined }, f.root, f.dependencies) as any).status).toBe('awaiting_selection'); expect(f.authors()).toBe(0);
  writeFileSync(join(f.root, '.ai/harness/policy.json'), JSON.stringify({ refactor: { mode: 'off' } }));
  expect(runShadowRefactorDiscovery(input, f.root, f.dependencies)).rejects.toThrow('enablement');
});

test('local author adapter executes the read-only CLI and reads its bounded final JSON', () => {
  const f = fixture(); const bin = join(f.root, 'bin'); mkdirSync(bin);
  const executable = join(bin, 'codex'); const log = join(f.root, 'author-args.json');
  writeFileSync(executable, '#!/usr/bin/env node\n' + `const fs = require('fs'); const args = process.argv.slice(2); fs.writeFileSync(${JSON.stringify(log)}, JSON.stringify({ args, secret: process.env.SHADOW_TEST_SECRET ?? null })); fs.writeFileSync(args[args.indexOf('--output-last-message') + 1], ${JSON.stringify(JSON.stringify(draft))});`);
  chmodSync(executable, 0o700);
  const modulePath = join(process.cwd(), 'src/effects/refactor/shadow-discovery.ts');
  const execution = spawnSync(process.execPath, ['-e', `import { runLocalRefactorAuthor } from ${JSON.stringify(modulePath)}; console.log(JSON.stringify(await runLocalRefactorAuthor('bounded proposal', 10000)));`], { cwd: f.root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, SHADOW_TEST_SECRET: 'must-not-reach-author' }, encoding: 'utf8', timeout: 20000 });
  expect(execution.status).toBe(0); expect(JSON.parse(execution.stdout)).toEqual(draft);
  const captured = JSON.parse(readFileSync(log, 'utf8')); expect(captured.secret).toBeNull(); const args = captured.args;
  expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only'); expect(args).toContain('--ignore-user-config'); expect(args).toContain('--ephemeral');
});
