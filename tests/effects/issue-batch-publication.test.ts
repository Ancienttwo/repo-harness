import { collectRepoTaskOffers } from '../../src/effects/fleet/acquire';
import { afterEach, describe, expect, test } from 'bun:test';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { buildIssueBatchAdoption } from '../../src/core/automation/issue-batch-adoption';
import { publishIssueBatch, type PublishIssueBatchInput, type CampaignPublicationBoundary } from '../../src/effects/automation/issue-batch-publication';
import { persistIssueBatchIntent, readIssueBatchAdoptionArtifact } from '../../src/effects/automation/issue-batch-store';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { projectCanonicalTasks } from '../../src/core/state/coordination-identity';
import { validateWorkGraph, projectWorkGraph, schedulingCarrierPath } from '../../src/core/engineers/scheduling';
import { makeIntent, makeAdoptionInput, policy } from '../helpers/issue-batch-adoption-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const SPRINT = 'plans/sprints/repair.sprint.md';
function git(root: string, args: string[]): string { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function fixture(): PublishIssueBatchInput {
  const root = mkdtempSync(join(tmpdir(), 'brc6-publication-')); roots.push(root);
  git(root, ['init', '-q', '-b', 'main']); git(root, ['config', 'user.email', 'test@example.invalid']); git(root, ['config', 'user.name', 'Test']);
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, SPRINT), '# Sprint: repair\n\n> **Status**: Approved\n> **Backlog Schema**: 2\n\n## Backlog\n\n| # | ID | Status | Task | Mode | Acceptance | Plan |\n|---|----|---|---|---|---|---|\n\n## Execution Log\n');
  const repository = repoHarnessRepoIdFor(root);
  writeFileSync(join(root, schedulingCarrierPath(SPRINT)), JSON.stringify({ protocol: 1, kind: 'repo-harness-work-graph', repository_id: repository, sprint_path: SPRINT, lane: 'generic-v1', work_packages: [] }));
  git(root, ['add', '.']); git(root, ['commit', '-qm', 'base']);
  const intent = makeIntent({ repository_id: repository, base_main_sha: git(root, ['rev-parse', 'HEAD']) });
  mkdirSync(join(root, '.git/repo-harness/development-campaigns/v1'), { recursive: true });
  persistIssueBatchIntent(root, intent);
  const adopted = buildIssueBatchAdoption(makeAdoptionInput(intent));
  return { repo_root: root, intent, receipt: adopted.receipt, sprint_path: SPRINT, policy, evidence: { challenge_receipt_sha256: adopted.challenge_receipt.receipt_sha256, terminal_sha256: 'a'.repeat(64) }, now: () => '2026-09-05T01:00:00.000Z' };
}
function projected(root: string, commit: string) {
  const sprintText = git(root, ['show', `${commit}:${SPRINT}`]);
  const tasks = projectCanonicalTasks({ repoIdentity: resolveRepoIdentity(root), sprintPath: SPRINT, sprintText });
  const graph = validateWorkGraph(JSON.parse(git(root, ['show', `${commit}:${schedulingCarrierPath(SPRINT)}`])));
  return { tasks, graph: projectWorkGraph(graph, tasks.map((t, i) => ({ task_id: t.task_id, task_revision: t.task_revision, task_ref: t.row.task, status: t.row.status, row_order: i + 1 }))) };
}
function offers(root: string) {
  mkdirSync(join(root, '.ai/harness/sprint'), { recursive: true });
  writeFileSync(join(root, '.ai/harness/sprint/active-sprint'), SPRINT);
  const repo = { id: repoHarnessRepoIdFor(root), path: root, accessMode: 'read_write' as const, source: 'manual' as const, registeredAt: '2026-09-05T00:00:00Z', lastSeenAt: '2026-09-05T00:00:00Z' };
  return collectRepoTaskOffers(repo, { registryPath: 'fixture', authorizationRevision: 1, repos: [repo] })?.offers ?? [];
}
describe('BRC6 three-file publication', () => {
  test('one candidate commit preserves user index/worktree and canonical visibility until integration', () => {
    const f = fixture(); const root = f.repo_root;
    writeFileSync(join(root, 'user-file'), 'staged'); git(root, ['add', 'user-file']);
    writeFileSync(join(root, 'user-file'), 'unstaged'); const index = git(root, ['write-tree']);
    const result = publishIssueBatch(f);
    expect(git(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', result.materialized_commit]).split('\n').sort()).toEqual([SPRINT, schedulingCarrierPath(SPRINT), result.manifest_path].sort());
    expect(git(root, ['write-tree'])).toBe(index); expect(readFileSync(join(root, 'user-file'), 'utf8')).toBe('unstaged');
    expect(projected(root, 'main').tasks).toHaveLength(0); expect(offers(root)).toHaveLength(0);
    const candidate = projected(root, result.candidate_ref); expect(candidate.tasks).toHaveLength(2);
    expect(candidate.graph.work_packages.every(w => w.concurrency.key === w.primary_capability && w.task_status === '[ ]')).toBe(true);
    expect(candidate.tasks.every(t => t.row.plan === '(pending)')).toBe(true);
    expect(publishIssueBatch(f)).toEqual(result);
    git(root, ['update-ref', 'refs/heads/main', result.materialized_commit, f.intent.base_main_sha]);
    expect(projected(root, 'main').tasks.map(t => t.task_id)).toEqual([...result.task_ids]);
    expect(offers(root).map(o => o.task_id)).toEqual([...result.task_ids]);
    expect(offers(root).every(o => o.execution_readiness !== 'execution_ready')).toBe(true);
    git(root, ['update-ref', '-d', result.candidate_ref]);
    expect(publishIssueBatch(f)).toEqual(result);
  });
  test.each(['after_sprint_blob', 'after_graph_blob', 'after_manifest_blob', 'after_publication_intent_fsync', 'before_ref_cas', 'after_ref_cas'] as CampaignPublicationBoundary[])('crash at %s has no partial canonical publication and replays exactly', boundary => {
    const f = fixture();
    expect(() => publishIssueBatch({ ...f, crash_hook: at => { if (at === boundary) throw new Error('crash'); } })).toThrow('crash');
    expect(git(f.repo_root, ['rev-parse', 'main'])).toBe(f.intent.base_main_sha);
    const before = readIssueBatchAdoptionArtifact(f.repo_root, f.intent, 'publication');
    const result = publishIssueBatch(f);
    if (before) expect(result.materialized_commit).toBe(before.materialized_commit as string);
    expect(projected(f.repo_root, result.materialized_commit).tasks).toHaveLength(2);
  });
  test('rejects conflicting projection replay and moved target before first CAS', () => {
    const f = fixture(); publishIssueBatch(f);
    expect(() => publishIssueBatch({ ...f, evidence: { ...f.evidence, terminal_sha256: 'b'.repeat(64) } })).toThrow('different materialization');
    const other = fixture();
    const tree = git(other.repo_root, ['rev-parse', 'HEAD^{tree}']); const moved = git(other.repo_root, ['commit-tree', tree, '-p', 'HEAD', '-m', 'advance']);
    git(other.repo_root, ['update-ref', 'refs/heads/main', moved]);
    expect(() => publishIssueBatch(other)).toThrow('canonical target moved');
  });
});

test('canonical target verify and candidate CAS are one Git transaction', () => {
  const f = fixture();
  expect(() => publishIssueBatch({ ...f, crash_hook: boundary => {
    if (boundary !== 'before_ref_cas') return;
    const moved = git(f.repo_root, ['commit-tree', git(f.repo_root, ['rev-parse', 'HEAD^{tree}']), '-p', 'HEAD', '-m', 'move']);
    git(f.repo_root, ['update-ref', 'refs/heads/main', moved]);
  } })).toThrow();
  expect(git(f.repo_root, ['for-each-ref', '--format=%(refname)', 'refs/heads/codex'])).toBe('');
});

 test('preserves existing cross-graph dependencies while validating the new closed group', () => {
  const f = fixture(); const root = f.repo_root;
  const taskId = 'f'.repeat(64);
  const sprint = readFileSync(join(root, SPRINT), 'utf8').replace('\n## Execution Log', `| 1 | ${taskId} | [ ] | Existing task | contract | existing | (pending) |\n\n## Execution Log`);
  writeFileSync(join(root, SPRINT), sprint);
  const existing = { ...policy, work_package_id: 'existing', task_id: taskId, primary_capability: 'capability.runtime-harness.development-campaign', priority: 50,
    depends_on: [{ repository_id: f.intent.repository_id, work_package_id: 'external', required_state: 'canonical_done' as const, acceptance_authority: null }],
    concurrency: { scope: 'repo', key: 'existing' }, execution_surface: 'contract', integration_group: null };
  writeFileSync(join(root, schedulingCarrierPath(SPRINT)), JSON.stringify({ protocol: 1, kind: 'repo-harness-work-graph', repository_id: f.intent.repository_id, sprint_path: SPRINT, lane: 'engineering-v2', work_packages: [existing] }));
  git(root, ['add', '.']); git(root, ['commit', '-qm', 'existing canonical graph']);
  const intent = makeIntent({ campaign_id: 'campaign-existing', repository_id: f.intent.repository_id, base_main_sha: git(root, ['rev-parse', 'HEAD']) });
  const adopted = buildIssueBatchAdoption(makeAdoptionInput(intent));
  persistIssueBatchIntent(root, intent);
  const result = publishIssueBatch({ ...f, intent, receipt: adopted.receipt });
  expect(projected(root, result.materialized_commit).graph.work_packages.find(w => w.work_package_id === 'existing')!.depends_on).toEqual(existing.depends_on);
 });
