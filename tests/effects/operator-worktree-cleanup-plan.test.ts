import { describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanupEligible, cleanupSelection, decodeAuthorizedCleanupRequest, decodeCleanupAdvice, decodeCleanupChoices, decodeCleanupExecutionResult, decodeCleanupPlan,
  type CleanupAdvice, type CleanupExecutionResult,
} from '../../src/core/operator/worktree-cleanup-plan';
import { observeCleanupLoss } from '../../src/effects/operator/worktree-cleanup-observation';
import { worktreeId } from '../../src/effects/git/worktree-record';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
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
    loss: { kind: 'registered', identity: { dev: 1, ino: n, birthtime_ms: 1 }, branch: `refs/heads/feature-${n}`, head_commit: 'c'.repeat(40),
      files: judgment === 'green' ? [] : [{ path: 'docs/guide.md', kind: 'file', mode: 0o644, size: 5, sha256: 'd'.repeat(64), git_oid: 'e'.repeat(40) }],
      changed_paths: judgment === 'green' ? [] : ['docs/guide.md'], index: [], ignored: [], commits: [], remote_refs: [] },
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
    reconcile: async () => ({ state: 'absent' }),
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
  test('a user choice carries only id, recommendation and archive, under the advice archive rules', () => {
    const id = observation().worktree.id;
    const choice = { id, recommendation: advice().recommendation, archive: advice().archive };
    const keep = createCleanupPlan(SID, [{ observation: observation(), advice: { ...advice(false), recommendation: 'keep' } }]).items[0]!;
    // Pass 1 is keep: the item is not selectable, but the observation lets the user choose.
    expect([cleanupEligible(keep), cleanupSelection(keep).selectable]).toEqual([true, false]);
    expect(decodeCleanupChoices([choice, { id: observation(2).worktree.id, recommendation: 'keep', archive: { git: null, private: null } }])).toHaveLength(2);
    for (const input of [
      [], [choice, choice], [{ ...choice, id: 'wt_1' }], [{ ...choice, reason: 'From the page.' }], [{ ...choice, evidence: ['x'] }],
      [{ ...choice, archive: { git: null, private: null } }], [{ ...choice, recommendation: 'delete' }],
      [{ ...choice, archive: { git: { ...advice().archive.git!, directory: 'docs/other' }, private: null } }],
      [{ ...choice, archive: { git: null, private: { directory: '/home/private', paths: ['.env'] } } }],
      [{ ...choice, archive: { git: { ...advice().archive.git!, paths: ['../escape'] }, private: null } }],
      Array.from({ length: 17 }, (_, n) => ({ ...choice, id: observation(n + 1).worktree.id })),
    ]) expect(() => decodeCleanupChoices(input)).toThrow('worktree_cleanup_plan_invalid');
  });
  test('the execution result decoder accepts each producer outcome and pairs reasons with outcomes', async () => {
    const h = harness([observation(), observation(2, 'green'), observation(3, 'red')]);
    h.observations[0] = { ...h.observations[0]!, loss: { ...h.observations[0]!.loss!, head_commit: 'f'.repeat(40) } };
    const skipped = await executeCleanupPlan(h.request, h.ports);
    const push = harness(), plain = harness();
    const failed = await executeCleanupPlan(push.request, { ...push.ports, archivePush: async () => { throw new Error('remote unknown'); } });
    const removed = await executeCleanupPlan(plain.request, plain.ports);
    for (const result of [skipped, failed, removed]) expect(decodeCleanupExecutionResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect([...skipped.items, ...failed.items, ...removed.items].map(i => [i.outcome, i.reason])).toEqual([
      ['skipped', 'loss_changed'], ['removed', null], ['skipped', 'in_use'], ['reconcile_required', 'archive_failed'], ['removed', null]]);
    const item = (edit: object): CleanupExecutionResult => ({ ...removed, items: [{ ...removed.items[0]!, ...edit }] });
    for (const input of [
      item({ reason: 'in_use' }), item({ outcome: 'skipped', reason: 'archive_failed' }), item({ outcome: 'skipped', reason: null }),
      item({ outcome: 'reconcile_required', reason: 'loss_changed' }), item({ outcome: 'failed', reason: 'unavailable' }), item({ stage: 'archive' }),
      item({ archive_pr: '/private/receipt' }), item({ raw: 'private' }), { ...removed, items: [] }, { ...removed, items: [removed.items[0], removed.items[0]] },
      { ...removed, kind: 'operator_worktree_cleanup' }, { ...removed, session_id: 'b'.repeat(31) },
    ]) expect(() => decodeCleanupExecutionResult(input)).toThrow('worktree_cleanup_plan_invalid');
  });
  test('archive manifests only select observed loss paths and retain unpushed commits', () => {
    const o = observation();
    expect(() => createCleanupPlan(SID, [{ observation: o, advice: { ...advice(), archive: { git: { ...advice().archive.git!, paths: ['missing.md'] }, private: null } } }])).toThrow('archive_paths_invalid');
    expect(() => createCleanupPlan(SID, [{ observation: o, advice: { ...advice(), archive: { ...advice().archive, private: { directory: 'local', paths: ['docs/guide.md'] } } } }])).toThrow('archive_paths_invalid');
    expect(() => createCleanupPlan(SID, [{ observation: { ...o, loss: { ...o.loss!, commits: ['f'.repeat(40)] } }, advice: advice(false) }])).toThrow('commits_need_archive');
    const plan = createCleanupPlan(SID, [{ observation: { ...o, loss: null }, advice: { ...advice(false), recommendation: 'keep' } }]);
    expect(cleanupSelection(plan.items[0]!)).toEqual({ selectable: false, selected_by_default: false });
  });
  test('the plan lists the archivable loss paths, and the archive validator accepts exactly them', () => {
    const o = observation(), file = o.loss!.files[0]!;
    const directory = (path: string) => ({ ...file, path, kind: 'directory' as const, sha256: null, git_oid: null });
    const symlink = (path: string) => ({ ...file, path, kind: 'symlink' as const });
    const staged = (path: string, mode: string) => ({ path, mode, oid: 'f'.repeat(40), stage: 0 });
    const loss = { ...o.loss!, ignored: ['.env', 'cache/'],
      changed_paths: ['bin/run.sh', 'docs/guide.md', 'docs/index-link.md', 'docs/link.md', 'docs/removed.md', 'docs/staged-link.md', 'docs/staged.md', 'docs/tracked-link.md', 'docs/was-link.md', 'empty'],
      index: [staged('bin/run.sh', '100755'), staged('docs/index-link.md', '120000'), staged('docs/staged-link.md', '120000'), staged('docs/staged.md', '100644'),
        staged('docs/tracked-link.md', '120000'), staged('docs/was-link.md', '120000')],
      files: [{ ...file, path: '.env' }, { ...file, path: 'README.md' }, directory('cache'), file, symlink('docs/link.md'), symlink('docs/staged-link.md'),
        symlink('docs/tracked-link.md'), { ...file, path: 'docs/was-link.md' }, directory('empty')] };
    const plan = (paths: string[]) => createCleanupPlan(SID, [{ observation: { ...o, loss }, advice: { ...advice(), archive: { git: null, private: { directory: 'fixture-repo', paths } } } }]);
    expect(plan(['docs/guide.md']).items[0]!.loss).toMatchObject({ files: loss.changed_paths, archivable: ['.env', 'bin/run.sh', 'docs/guide.md', 'docs/staged.md', 'docs/was-link.md'] });
    // A worktree entry decides when present: only a regular file (changed, ignored, or a former symlink now a file) qualifies.
    // Without one, every index version must be a regular-file mode (100644, 100755); 120000 is a symlink.
    for (const [path, accepted] of [['docs/guide.md', true], ['.env', true], ['docs/was-link.md', true], ['docs/staged.md', true], ['bin/run.sh', true],
      ['docs/removed.md', false], ['empty', false], ['cache', false], ['docs/link.md', false], ['docs/staged-link.md', false], ['docs/tracked-link.md', false],
      ['docs/index-link.md', false], ['README.md', false]] as const) {
      if (accepted) expect(plan([path]).items[0]!.advice.archive.private!.paths).toEqual([path]);
      else expect(() => plan([path])).toThrow('archive_paths_invalid');
    }
    const item = plan(['docs/guide.md']).items[0]!;
    for (const archivable of [['docs/guide.md', '.env'], ['.env', '.env'], ['/private/.env']]) {
      expect(() => decodeCleanupPlan({ protocol: 1, kind: 'operator_worktree_cleanup_plan', session_id: SID, items: [{ ...item, loss: { ...item.loss!, archivable } }] })).toThrow('worktree_cleanup_plan_invalid');
    }
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
  test.each(['/private/checkout', 'https://github.com/example/repo/pull/5?token=synthetic', `https://github.com/ghp_${'q'.repeat(36)}/repo/pull/5`])('invalid publication readback is withheld: %s', async published => {
    const h = harness();
    const result = await executeCleanupPlan(h.request, { ...h.ports, archivePr: async () => published });
    expect(result.items[0]).toMatchObject({ outcome: 'reconcile_required', stage: 'archive_pr', archive_pr: null });
    expect(JSON.stringify(result)).not.toContain(published);
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
  test('a lost removal result is recovered before observing a now-missing worktree', async () => {
    const h = harness();
    let exists = true, removals = 0, reconciliations = 0;
    const ports = { ...h.ports,
      reconcile: async (key: string, item: typeof h.plan.items[number]) => {
        reconciliations++;
        return exists ? { state: 'absent' as const } : { state: 'completed' as const, key,
          id: item.worktree.id, loss_sha256: item.loss_sha256!, plan_sha256: item.plan_sha256,
          archive_pr: 'https://github.com/example/repo/pull/5' };
      },
      observe: async (id: string) => { if (!exists) throw new Error('notfound'); return h.ports.observe(id); },
      remove: async (_key: string, _item: typeof h.plan.items[number], verify: () => Promise<void>) => {
        await verify(); removals++; exists = false; throw new Error('result lost after deletion');
      },
    };
    expect((await executeCleanupPlan(h.request, ports)).items[0]).toMatchObject({ outcome: 'reconcile_required', reason: 'removal_unproven' });
    const beforeRetry = h.calls.length;
    expect((await executeCleanupPlan(h.request, ports)).items[0]).toMatchObject({ outcome: 'removed', archive_pr: 'https://github.com/example/repo/pull/5' });
    expect(h.calls).toHaveLength(beforeRetry);
    expect(removals).toBe(1); expect(reconciliations).toBe(2);
  });
  test.each(['pending', 'wrong-key', 'wrong-id', 'wrong-loss', 'wrong-plan', 'private-link', 'extra-field', 'throws'])('reconciliation %s does not inspect or remove a live source', async mode => {
    const h = harness();
    const result = await executeCleanupPlan(h.request, { ...h.ports, reconcile: async (key, item) => {
      if (mode === 'throws') throw new Error('/private/receipt-unreadable');
      const value = { state: mode === 'pending' ? 'pending' as const : 'completed' as const, key,
        id: item.worktree.id, loss_sha256: item.loss_sha256!, plan_sha256: item.plan_sha256,
        archive_pr: 'https://github.com/example/repo/pull/5' };
      if (mode === 'wrong-key') value.key += ':another-session';
      if (mode === 'wrong-id') value.id = observation(2).worktree.id;
      if (mode === 'wrong-loss') value.loss_sha256 = '0'.repeat(64);
      if (mode === 'wrong-plan') value.plan_sha256 = '0'.repeat(64);
      if (mode === 'private-link') value.archive_pr = '/private/receipt';
      return mode === 'extra-field' ? { ...value, raw: 'private' } : value;
    } });
    expect(result.items[0]).toMatchObject({ outcome: 'reconcile_required', reason: 'removal_unproven', stage: 'reconcile' });
    expect(h.calls).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('/private');
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

test('real generic observations change fingerprints for bytes, index-only versions, ignored files and commits', () => {
  const parent = tmpWorkspace('cleanup-plan-loss'), root = join(parent, 'repo'), tree = join(parent, 'tree');
  try {
    mkdirSync(root); initGitRepo(root); mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'docs/guide.md'), 'base\n');
    writeFileSync(join(root, '.gitignore'), '.env\n'); commitAll(root, 'base');
    const git = (cwd: string, ...args: string[]) => { const result = run('git', args, cwd); expect(result.status).toBe(0); return result.stdout.trim(); };
    const base = git(root, 'rev-parse', 'HEAD'); git(root, 'update-ref', 'refs/remotes/origin/main', base);
    git(root, 'worktree', 'add', '-b', 'feature', tree);
    const target = { repository: root, worktree: tree, id: worktreeId(resolveGitCommonDirectory(root), tree), kind: 'registered' as const };
    const observe = () => ({ ...observation(), loss: observeCleanupLoss(target, { env: process.env, deadline: Date.now() + 5000 }) });
    const initial = cleanupLossSha256(observe());
    writeFileSync(join(tree, 'docs/guide.md'), 'first\n');
    const changed = cleanupLossSha256(observe()); expect(changed).not.toBe(initial);
    writeFileSync(join(tree, 'docs/guide.md'), 'other\n'); expect(cleanupLossSha256(observe())).not.toBe(changed);
    git(tree, 'add', 'docs/guide.md'); writeFileSync(join(tree, 'docs/guide.md'), 'base\n');
    const staged = observe(); expect(staged.loss.changed_paths).toContain('docs/guide.md'); expect(cleanupLossSha256(staged)).not.toBe(initial);
    writeFileSync(join(tree, '.env'), 'SYNTHETIC=one\n'); const ignored = cleanupLossSha256(observe());
    writeFileSync(join(tree, '.env'), 'SYNTHETIC=two\n'); expect(cleanupLossSha256(observe())).not.toBe(ignored);
    const beforeCommit = cleanupLossSha256(observe()); git(tree, 'commit', '-m', 'unpublished');
    const committed = observe(); expect(committed.loss.commits).toHaveLength(1); expect(cleanupLossSha256(committed)).not.toBe(beforeCommit);
    const plan = createCleanupPlan(SID, [{ observation: committed, advice: { ...advice(), archive: { ...advice().archive, private: { directory: 'fixture-repo', paths: ['.env'] } } } }]);
    expect(JSON.stringify(plan)).not.toContain('SYNTHETIC'); expect(JSON.stringify(plan)).not.toContain(parent);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
