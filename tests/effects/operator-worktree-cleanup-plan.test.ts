import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanupSelection, decodeAuthorizedCleanupRequest, decodeCleanupAdvice, decodeCleanupPlan, type CleanupAdvice } from '../../src/core/operator/worktree-cleanup-plan';
import type { DocSessionRecordV1 } from '../../src/core/operator/doc-session-record';
import { docSessionGitRunner, observeDocSessionLoss } from '../../src/effects/operator/doc-session-changes';
import {
  cleanupLossSha256, cleanupPlanSelectionDigest, createCleanupPlan, executeCleanupPlan,
  type CleanupExecutionPorts, type CleanupObservation,
} from '../../src/effects/operator/worktree-cleanup-plan';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const SID = 'a'.repeat(32), REPO = `repo_${'b'.repeat(16)}`;
const advice = (archive = true): CleanupAdvice => ({
  recommendation: archive ? 'archive_then_delete' : 'delete', reason: 'Work is complete.', evidence: ['One local change.'],
  archive: { git: archive ? { directory: 'docs/archive/2026-10-29-feature', branch: 'docs/archive-feature', paths: ['docs/guide.md'], include_commits: true } : null, private: null },
});
function observation(n = 1, judgment: 'green' | 'yellow' | 'red' = 'yellow'): CleanupObservation {
  return {
    worktree: { id: `wt_${String(n).padStart(64, '0')}`, repository_id: REPO, directory: `repo-wt-${n}`, branch: `feature-${n}`, source: 'manual', judgment,
      reasons: judgment === 'green' ? [] : judgment === 'yellow' ? ['dirty'] : ['process_in_use'],
      size_bytes: 80, size_observed_at: null, process_count: judgment === 'red' ? 1 : 0, dirty_files: judgment === 'green' ? 0 : 1,
      ignored_entries: 0, unpushed_commits: 0, merge: 'ancestor', record: null },
    loss: { head_commit: 'c'.repeat(40), changes: judgment === 'green' ? [] : [{ path: 'docs/guide.md', status: 'modified', tracked: true,
      old_mode: '100644', new_mode: '100644', old_oid: 'd'.repeat(40), new_oid: 'e'.repeat(40) }], index: [], ignored: [], ignored_leaves: [], commits: [], pushed: false },
  };
}
function harness(observations = [observation()]) {
  const plan = createCleanupPlan(SID, observations.map(observed => ({ observation: observed, advice: advice(observed.worktree.judgment === 'yellow') })));
  const ids = observations.map(o => o.worktree.id);
  const request = { session_id: SID, ids, expected_digest: cleanupPlanSelectionDigest(plan, ids), approvals: plan.items.filter(i => i.worktree.judgment === 'yellow')
    .map(i => ({ id: i.worktree.id, plan_sha256: i.plan_sha256, loss_sha256: i.loss_sha256! })) };
  const calls: string[] = [], keys: string[] = [];
  const ports: CleanupExecutionPorts = {
    loadPlan: async () => plan,
    observe: async id => { calls.push(`observe:${id.slice(-1)}`); return observations.find(o => o.worktree.id === id)!; },
    archiveCommit: async key => { calls.push('commit'); keys.push(key); },
    archivePush: async key => { calls.push('push'); keys.push(key); },
    archivePr: async key => { calls.push('pr'); keys.push(key); return 'https://github.com/example/repo/pull/5'; },
    remove: async (key, item, verify) => { await verify(); calls.push(`remove:${item.worktree.id.slice(-1)}`); keys.push(key); },
  };
  return { observations, plan, request, calls, keys, ports };
}

describe('cleanup plan contract and execution boundary', () => {
  test('green defaults on, yellow defaults off and red has no selection', () => {
    const h = harness([observation(1, 'green'), observation(2), observation(3, 'red')]);
    expect(h.plan.items.map(cleanupSelection)).toEqual([
      { selectable: true, selected_by_default: true }, { selectable: true, selected_by_default: false }, { selectable: false, selected_by_default: false },
    ]);
    expect(decodeCleanupPlan(JSON.parse(JSON.stringify(h.plan)))).toEqual(h.plan);
  });
  test('closed request rejects client paths, advice, extra approvals and duplicate ids', () => {
    const h = harness();
    expect(decodeAuthorizedCleanupRequest(h.request)).toEqual(h.request);
    for (const input of [
      { ...h.request, path: '/private/target' }, { ...h.request, advice: advice() },
      { ...h.request, ids: [...h.request.ids, ...h.request.ids] },
      { ...h.request, approvals: [...h.request.approvals, ...h.request.approvals] },
      { ...h.request, approvals: [{ ...h.request.approvals[0], id: observation(2).worktree.id }] },
    ]) expect(() => decodeAuthorizedCleanupRequest(input)).toThrow();
  });
  test('public advice refuses absolute paths, secrets, archive escapes and inconsistent recommendations', () => {
    for (const input of [
      { ...advice(), reason: '/home/private/checkout' },
      { ...advice(), evidence: ['ghp_' + 'q'.repeat(36)] },
      { ...advice(), archive: { git: { ...advice().archive.git!, paths: ['../private'] }, private: null } },
      { ...advice(), archive: { git: null, private: { directory: '/home/private', paths: ['.env'] } } },
      { ...advice(), recommendation: 'delete' },
    ]) expect(() => decodeCleanupAdvice(input)).toThrow();
  });
  test('archive manifests only select observed loss paths and retain unpushed commits', () => {
    const o = observation();
    expect(() => createCleanupPlan(SID, [{ observation: o, advice: { ...advice(), archive: { git: { ...advice().archive.git!, paths: ['missing.md'] }, private: null } } }])).toThrow('archive_paths_invalid');
    expect(() => createCleanupPlan(SID, [{ observation: o, advice: { ...advice(), archive: { ...advice().archive, private: { directory: 'local', paths: ['docs/guide.md'] } } } }])).toThrow('archive_paths_invalid');
    expect(() => createCleanupPlan(SID, [{ observation: { ...o, loss: { ...o.loss!, commits: ['f'.repeat(40)] } }, advice: advice(false) }])).toThrow('commits_need_archive');
    const plan = createCleanupPlan(SID, [{ observation: { ...o, loss: null }, advice: { ...advice(false), recommendation: 'keep' } }]);
    expect(cleanupSelection(plan.items[0]!)).toEqual({ selectable: false, selected_by_default: false });
  });
  test('private-only archive never calls Git push or PR publication', async () => {
    const h = harness();
    const plan = createCleanupPlan(SID, [{ observation: h.observations[0]!, advice: { ...advice(), archive: { git: null, private: { directory: 'fixture-repo', paths: ['docs/guide.md'] } } } }]);
    const item = plan.items[0]!;
    const request = { ...h.request, approvals: [{ id: item.worktree.id, loss_sha256: item.loss_sha256!, plan_sha256: item.plan_sha256 }] };
    expect((await executeCleanupPlan(request, { ...h.ports, loadPlan: async () => plan })).items[0]).toMatchObject({ outcome: 'removed', archive_pr: null });
    expect(h.calls).toEqual(['observe:1', 'commit', 'observe:1', 'remove:1']);
  });
  test('no yellow authorization means no archive or remove call', async () => {
    const h = harness();
    const result = await executeCleanupPlan({ ...h.request, approvals: [] }, h.ports);
    expect(result.items[0]).toMatchObject({ outcome: 'skipped', reason: 'not_approved' });
    expect(h.calls).toEqual([]);
  });
  test('content and plan fingerprints both need explicit matching approval', async () => {
    for (const field of ['loss_sha256', 'plan_sha256'] as const) {
      const h = harness();
      const result = await executeCleanupPlan({ ...h.request, approvals: [{ ...h.request.approvals[0], [field]: '0'.repeat(64) }] }, h.ports);
      expect(result.items[0]).toMatchObject({ outcome: 'skipped', reason: field === 'loss_sha256' ? 'loss_changed' : 'plan_changed' });
      expect(h.calls).toEqual([]);
    }
  });
  test('archive completes commit, push and Draft PR before the final barrier and removal', async () => {
    const h = harness();
    expect((await executeCleanupPlan(h.request, h.ports)).items[0]).toMatchObject({ outcome: 'removed', archive_pr: 'https://github.com/example/repo/pull/5' });
    expect(h.calls).toEqual(['observe:1', 'commit', 'push', 'pr', 'observe:1', 'remove:1']);
    expect(new Set(h.keys).size).toBe(1);
  });
  test.each(['archiveCommit', 'archivePush', 'archivePr'] as const)('uncertain %s never advances to deletion and exposes no raw error', async method => {
    const h = harness();
    const result = await executeCleanupPlan(h.request, { ...h.ports, [method]: async () => { throw new Error('/private/path secret-output'); } });
    expect(result.items[0]).toMatchObject({ outcome: 'reconcile_required', reason: 'archive_failed' });
    expect(h.calls.some(c => c.startsWith('remove:'))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('secret-output');
    expect(JSON.stringify(result)).not.toContain('/private/path');
  });
  test('a missing Draft PR readback keeps the original worktree', async () => {
    const h = harness();
    expect((await executeCleanupPlan(h.request, { ...h.ports, archivePr: async () => null })).items[0]).toMatchObject({ outcome: 'reconcile_required', stage: 'archive_pr' });
    expect(h.calls.some(c => c.startsWith('remove:'))).toBe(false);
  });
  test('an item changed after approval is skipped while the other selected item proceeds', async () => {
    const h = harness([observation(), observation(2, 'green')]);
    h.observations[0] = { ...h.observations[0]!, loss: { ...h.observations[0]!.loss!, head_commit: 'f'.repeat(40) } };
    const result = await executeCleanupPlan(h.request, h.ports);
    expect(result.items.map(i => [i.outcome, i.reason])).toEqual([['skipped', 'loss_changed'], ['removed', null]]);
    expect(h.calls).toEqual(['observe:1', 'observe:2', 'observe:2', 'remove:2']);
  });
  test.each(['content', 'occupancy', 'unknown'])('%s changing during archive is refused inside the final barrier', async change => {
    const h = harness();
    const result = await executeCleanupPlan(h.request, { ...h.ports, archivePr: async () => {
      const o = h.observations[0]!;
      h.observations[0] = change === 'content' ? { ...o, loss: { ...o.loss!, head_commit: 'f'.repeat(40) } }
        : { ...o, worktree: { ...o.worktree, judgment: change === 'occupancy' ? 'red' : 'yellow', process_count: change === 'occupancy' ? 1 : null } };
      return 'https://github.com/example/repo/pull/5';
    } });
    expect(result.items[0]).toMatchObject({ outcome: 'skipped', reason: change === 'content' ? 'loss_changed' : change === 'occupancy' ? 'in_use' : 'unavailable', stage: 'remove' });
    expect(h.calls.some(c => c.startsWith('remove:'))).toBe(false);
  });
  test('red and unknown inventory items never reach side effects', async () => {
    const h = harness([observation(1, 'red'), { ...observation(2), worktree: { ...observation(2).worktree, process_count: null } }]);
    expect((await executeCleanupPlan(h.request, h.ports)).items.map(i => i.reason)).toEqual(['in_use', 'unavailable']);
    expect(h.calls).toEqual([]);
  });
  test('server plan tampering and stale selection stop before observation', async () => {
    const h = harness();
    await expect(executeCleanupPlan({ ...h.request, expected_digest: '0'.repeat(64) }, h.ports)).rejects.toThrow('digest_changed');
    const changed = structuredClone(h.plan);
    (changed.items[0]!.advice.evidence as string[]).push('Different evidence.');
    await expect(executeCleanupPlan(h.request, { ...h.ports, loadPlan: async () => changed })).rejects.toThrow('plan_changed');
    expect(h.calls).toEqual([]);
  });
  test('a remover without verification or with uncertain outcome cannot report success', async () => {
    const h = harness([observation(1, 'green')]);
    expect((await executeCleanupPlan(h.request, { ...h.ports, remove: async () => {} })).items[0]).toMatchObject({ outcome: 'reconcile_required', reason: 'removal_unproven' });
    expect((await executeCleanupPlan(h.request, { ...h.ports, remove: async (_key, _item, verify) => { await verify(); throw new Error('lost result'); } })).items[0].outcome).toBe('reconcile_required');
  });
  test('retry reuses the archive identity and does not silently retry in one execution', async () => {
    const h = harness();
    let attempts = 0;
    const ports = { ...h.ports, archivePush: async (key: string) => { h.keys.push(key); attempts++; throw new Error('remote result unknown'); } };
    await executeCleanupPlan(h.request, ports); expect(attempts).toBe(1);
    await executeCleanupPlan(h.request, ports); expect(attempts).toBe(2);
    expect(new Set(h.keys).size).toBe(1);
  });
});

test('real Git loss observations change fingerprints for bytes, index-only versions, ignored files and commits', () => {
  const root = tmpWorkspace('cleanup-plan-loss');
  try {
    initGitRepo(root); mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs/guide.md'), 'base\n');
    writeFileSync(join(root, '.gitignore'), '.env\n'); commitAll(root, 'base');
    const git = (...args: string[]) => { const result = run('git', args, root); expect(result.status).toBe(0); return result.stdout.trim(); };
    const base = git('rev-parse', 'HEAD'); git('update-ref', 'refs/remotes/origin/main', base);
    git('checkout', '-b', `docs/${SID.slice(0, 12)}`);
    const record: DocSessionRecordV1 = { protocol: 1, kind: 'docs_session', session_id: SID, state: 'created', created_at: new Date().toISOString(), repository_id: REPO,
      runtime: 'codex', branch: `docs/${SID.slice(0, 12)}`, worktree: root, base_commit: base, citations: [], instruction: 'fixture' };
    const observe = () => ({ ...observation(), loss: observeDocSessionLoss(docSessionGitRunner(process.env), record, root) });
    const initial = cleanupLossSha256(observe());
    writeFileSync(join(root, 'docs/guide.md'), 'first\n');
    const changed = cleanupLossSha256(observe()); expect(changed).not.toBe(initial);
    writeFileSync(join(root, 'docs/guide.md'), 'other\n'); expect(cleanupLossSha256(observe())).not.toBe(changed);
    git('add', 'docs/guide.md'); writeFileSync(join(root, 'docs/guide.md'), 'base\n');
    const staged = observe(); expect(staged.loss.index).toHaveLength(1); expect(cleanupLossSha256(staged)).not.toBe(initial);
    // Synthetic fixture data only. No credential or real worktree is accessed.
    writeFileSync(join(root, '.env'), 'SYNTHETIC=one\n'); const ignored = cleanupLossSha256(observe());
    writeFileSync(join(root, '.env'), 'SYNTHETIC=two\n'); expect(cleanupLossSha256(observe())).not.toBe(ignored);
    const beforeCommit = cleanupLossSha256(observe()); git('commit', '-m', 'unpublished');
    const committed = observe(); expect(committed.loss.commits).toHaveLength(1); expect(cleanupLossSha256(committed)).not.toBe(beforeCommit);
    const plan = createCleanupPlan(SID, [{ observation: committed, advice: { ...advice(), archive: { ...advice().archive, private: { directory: 'fixture-repo', paths: ['.env'] } } } }]);
    expect(JSON.stringify(plan)).not.toContain('SYNTHETIC'); expect(JSON.stringify(plan)).not.toContain(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
