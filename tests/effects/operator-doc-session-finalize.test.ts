import { afterEach, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodeDocSessionCommit, decodeDocSessionDiscard } from '../../src/core/operator/doc-session-finalize';
import { readDocSessionDiff, readDocSessionLoss } from '../../src/effects/operator/doc-session-changes';
import { docSessionCommitOperation, docSessionDiscardOperation, readDocSessionFinalization, DocSessionScopeRefusal, type DocSessionFinalizeDependencies } from '../../src/effects/operator/doc-session-finalize';
import { OperatorWriteRefusal, runOperatorWrite } from '../../src/effects/operator/write-run';
import { repoHarnessRepoIdFor } from '../../src/effects/repo-registry';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(cwd: string, args: string[]): string {
  const result = run('git', args, cwd);
  if (result.status !== 0) throw new Error(`${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
}
function fixture() {
  const root = tmpWorkspace('doc-finalize'); roots.push(root);
  const repo = join(root, 'repo'); mkdirSync(repo); initGitRepo(repo);
  mkdirSync(join(repo, 'docs')); writeFileSync(join(repo, 'docs/guide.md'), 'before\n');
  writeFileSync(join(repo, '.gitignore'), '*.log\n'); commitAll(repo, 'base');
  const base = git(repo, ['rev-parse', 'HEAD']);
  const remote = join(root, 'remote.git'); git(root, ['init', '--bare', remote]);
  git(repo, ['remote', 'add', 'origin', remote]); git(repo, ['push', 'origin', 'main']);
  const sid = randomUUID().replaceAll('-', ''); const branch = `docs/${sid.slice(0, 12)}`;
  const wtRoot = join(root, 'worktrees'); mkdirSync(wtRoot);
  const worktree = join(wtRoot, `${basename(repo)}-wt-docs-${sid.slice(0, 12)}`);
  git(repo, ['worktree', 'add', '-b', branch, worktree, base]);
  const home = join(root, 'home'); mkdirSync(home);
  const env = { ...process.env, HOME: home, REPO_HARNESS_HOME: home, REPO_HARNESS_WORKTREE_ROOT: wtRoot };
  const repoId = repoHarnessRepoIdFor(repo); const now = new Date().toISOString();
  writeFileSync(join(home, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{ id: repoId, path: repo, accessMode: 'read_only', source: 'manual', registeredAt: now, lastSeenAt: now }] }));
  const directory = join(home, 'operator/sessions', sid); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const citation = { path: 'docs/guide.md', start_line: 1, end_line: 1, range_sha256: 'a'.repeat(64), file_sha256: 'b'.repeat(64), commit: base };
  writeFileSync(join(directory, 'session.json'), JSON.stringify({ protocol: 1, kind: 'docs_session', session_id: sid, state: 'created', created_at: now, repository_id: repoId, runtime: 'codex', branch, worktree, base_commit: base, citations: [{ ...citation, resolved: citation, relocated: false }], instruction: 'Revise guide.' }));
  writeFileSync(join(worktree, 'docs/guide.md'), 'after\n');
  let created = 0;
  // This fixture has no host process. Production must provide the real lifecycle adapter.
  const deps: DocSessionFinalizeDependencies = {
    env, with_quiesced_session: async (_sid, action) => action(),
    // Isolate Git removal from the OS inventory adapter: cloud /proc access is
    // restricted. Native process-inventory acceptance is not claimed here.
    processes: () => [],
    validate_changes: async (_record, changes) => {
      const refused = changes.filter(change => !change.path.startsWith('docs/')).map(change => change.path);
      if (refused.length) throw new DocSessionScopeRefusal('path_outside_scope', refused);
    },
    publication_target: async () => ({ remote: 'origin', repository: 'fixture/docs', base_branch: 'main' }),
    find_draft_pr: async () => null,
    create_draft_pr: async () => { created++; return { state: 'created', pr: { number: 1, url: 'https://github.com/fixture/docs/pull/1' } }; },
  };
  const diff = readDocSessionDiff(env, sid);
  const input = { expected_head: diff.head_commit, expected_diff_sha256: diff.diff_sha256, message: 'Edited commit title\n\nExplanation.' };
  const commit = (overrides: Partial<DocSessionFinalizeDependencies> = {}, requestId = randomUUID()) => runOperatorWrite(requestId, docSessionCommitOperation(sid, input, { ...deps, ...overrides }), env);
  const lossInput = () => { const loss = readDocSessionLoss(env, sid); return { expected_head: loss.head_commit, expected_loss_sha256: loss.loss_sha256 }; };
  const discard = (input = lossInput(), overrides: Partial<DocSessionFinalizeDependencies> = {}) => runOperatorWrite(randomUUID(), docSessionDiscardOperation(sid, input, { ...deps, ...overrides }), env);
  return { root, repo, remote, worktree, directory, env, sid, branch, base, input, deps, commit, lossInput, discard, created: () => created };
}
const body = (answer: { body: unknown }) => answer.body as any;

test('closed bodies reject extra paths, malformed hashes and blank messages', () => {
  const fields = { expected_head: 'a'.repeat(40), expected_diff_sha256: 'b'.repeat(64), message: 'title' };
  expect(decodeDocSessionCommit(fields)).toEqual(fields);
  expect(() => decodeDocSessionCommit({ ...fields, worktree: '/tmp/other' })).toThrow();
  expect(() => decodeDocSessionCommit({ ...fields, message: ' ' })).toThrow();
  expect(() => decodeDocSessionDiscard({ expected_head: fields.expected_head, expected_loss_sha256: 'x' })).toThrow();
});

test('real Git snapshot, edited message, non-force bare push and readback; replay makes no new commit or PR', async () => {
  const s = fixture(); const request = randomUUID();
  const answer = await s.commit({}, request);
  expect(answer.status).toBe(200); expect(body(answer).stage).toBe('complete');
  const head = git(s.worktree, ['rev-parse', 'HEAD']);
  expect(git(s.remote, ['rev-parse', `refs/heads/${s.branch}`])).toBe(head);
  expect(git(s.worktree, ['show', `${head}:docs/guide.md`])).toBe('after');
  expect(git(s.worktree, ['log', '-1', '--format=%B'])).toBe(s.input.message);
  expect(git(s.worktree, ['rev-list', '--count', `${s.base}..HEAD`])).toBe('1');
  expect(await s.commit({}, request)).toEqual(answer);
  expect(await s.commit()).toEqual(answer); expect(s.created()).toBe(1);
  expect(readFileSync(join(s.env.REPO_HARNESS_HOME, 'operator/audit.jsonl'), 'utf8')).not.toContain(s.worktree);
  const audit = readFileSync(join(s.env.REPO_HARNESS_HOME, 'operator/audit.jsonl'), 'utf8');
  for (const step of ['commit', 'push', 'draft_pr']) expect(audit).toContain(`docs_finalize_${step}`);
});

test('proven PR failure persists pushed stage; new request resumes only PR creation', async () => {
  const s = fixture();
  const failed = await s.commit({ create_draft_pr: async () => ({ state: 'not_created' }) });
  expect(body(failed).stage).toBe('pr_failed'); expect(body(failed).pushed).toBe(true);
  const detail = readDocSessionFinalization(s.env, s.sid) as any;
  expect(detail.stage).toBe('pr_failed'); expect(detail.commit).toBe(body(failed).commit);
  expect(JSON.stringify(detail)).not.toContain(s.remote);
  const head = git(s.worktree, ['rev-parse', 'HEAD']);
  expect((await s.commit()).status).toBe(200);
  expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(head);
  expect(git(s.worktree, ['rev-list', '--count', `${s.base}..HEAD`])).toBe('1');
});

test('a real receive-hook push failure resumes the existing commit', async () => {
  const s = fixture();
  const hook = join(s.remote, 'hooks/pre-receive');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const failed = await s.commit();
  expect(body(failed).stage).toBe('committed'); expect(failed.status).toBe(503);
  const head = git(s.worktree, ['rev-parse', 'HEAD']);
  unlinkSync(hook);
  expect((await s.commit()).status).toBe(200);
  expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(head);
  expect(git(s.remote, ['rev-parse', `refs/heads/${s.branch}`])).toBe(head);
});

test('first publication refuses unreviewed intermediate commits even if their bytes were reverted', async () => {
  const s = fixture();
  writeFileSync(join(s.worktree, 'outside.txt'), 'must never reach remote\n'); commitAll(s.worktree, 'outside');
  unlinkSync(join(s.worktree, 'outside.txt')); commitAll(s.worktree, 'revert outside');
  const diff = readDocSessionDiff(s.env, s.sid);
  const answer = await runOperatorWrite(randomUUID(), docSessionCommitOperation(s.sid,
    { ...s.input, expected_head: diff.head_commit, expected_diff_sha256: diff.diff_sha256 }, s.deps), s.env);
  expect(body(answer).error.code).toBe('head_history_unsupported');
  expect(git(s.remote, ['for-each-ref', `refs/heads/${s.branch}`])).toBe('');
});

test('unknown PR outcome is never recreated; later provider readback recovers exact PR', async () => {
  const s = fixture(); let calls = 0;
  const overrides = { create_draft_pr: async () => { calls++; return { state: 'unknown' as const }; } };
  expect(body(await s.commit(overrides)).error.code).toBe('pr_outcome_unknown');
  expect(body(await s.commit(overrides)).error.code).toBe('pr_outcome_unknown'); expect(calls).toBe(1);
  const recovered = await s.commit({ find_draft_pr: async () => ({ number: 5, url: 'https://github.com/fixture/docs/pull/5' }) });
  expect(body(recovered).pr.number).toBe(5); expect(calls).toBe(1);
});

test('changed diff and authoritative scope refusal leave branch and remote untouched', async () => {
  const s = fixture(); writeFileSync(join(s.worktree, 'docs/guide.md'), 'new unseen bytes\n');
  expect(body(await s.commit()).error.code).toBe('diff_changed');
  writeFileSync(join(s.worktree, 'docs/guide.md'), 'after\n');
  const refusal = await s.commit({ validate_changes: async () => { throw new DocSessionScopeRefusal('generated_region', ['docs/guide.md']); } });
  expect(refusal.status).toBe(422); expect(body(refusal).error.code).toBe('generated_region');
  expect(body(refusal).error.files).toEqual(['docs/guide.md']);
  expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(s.base);
  expect(git(s.remote, ['for-each-ref', `refs/heads/${s.branch}`])).toBe('');
});

test('mutating bytes during scope validation is caught before moving the branch', async () => {
  const s = fixture();
  const answer = await s.commit({ validate_changes: async () => { writeFileSync(join(s.worktree, 'docs/guide.md'), 'raced\n'); } });
  expect(body(answer).error.code).toBe('diff_changed'); expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(s.base);
});

test('lifecycle refusal fails closed and concurrent commit/discard share the session target lock', async () => {
  const s = fixture();
  expect(body(await s.commit({ with_quiesced_session: async () => { throw new OperatorWriteRefusal(409, 'turn_active', 'active', 'Stop'); } })).error.code).toBe('turn_active');
  let release!: () => void; let entered!: () => void;
  const holding = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { entered = resolve; });
  const first = s.commit({ with_quiesced_session: async (_sid, action) => { entered(); await holding; return action(); } });
  await ready;
  try { expect(body(await s.discard()).error.code).toBe('busy'); } finally { release(); }
  expect((await first).status).toBe(200);
});

test('discard validates canonical loss and removes only the managed worktree and matching local branch', async () => {
  const s = fixture(); writeFileSync(join(s.worktree, 'docs/ignored.log'), 'lost bytes\n');
  const input = s.lossInput(); writeFileSync(join(s.worktree, 'docs/ignored.log'), 'changed bytes\n');
  expect(body(await s.discard(input)).error.code).toBe('loss_changed'); expect(existsSync(s.worktree)).toBe(true);
  const answer = await s.discard();
  expect(answer.status).toBe(200); expect(body(answer).stage).toBe('complete');
  expect(existsSync(s.worktree)).toBe(false);
  expect(git(s.repo, ['for-each-ref', `refs/heads/${s.branch}`])).toBe('');
  expect(git(s.repo, ['rev-parse', 'main'])).toBe(s.base);
});

test('live remote check blocks discard even with no local remote-tracking branch', async () => {
  const s = fixture();
  git(s.worktree, ['push', s.remote, `HEAD:refs/heads/${s.branch}`]);
  const localRef = `refs/remotes/origin/${s.branch}`;
  git(s.repo, ['update-ref', '-d', localRef]);
  const answer = await s.discard();
  expect(body(answer).error.code).toBe('branch_pushed'); expect(existsSync(s.worktree)).toBe(true);
  expect(git(s.remote, ['rev-parse', `refs/heads/${s.branch}`])).toBe(s.base);
});

test('unknown process inventory refuses discard without deleting data', async () => {
  const s = fixture();
  expect(body(await s.discard(s.lossInput(), { processes: () => null })).error.code).toBe('worktree_in_use');
  expect(existsSync(s.worktree)).toBe(true);
});

for (const step of ['commit', 'push'] as const) test(`a ${step} result-audit failure cannot authorize the next step on retry`, async () => {
  const s = fixture();
  const audit = join(s.env.REPO_HARNESS_HOME, 'operator/audit.jsonl');
  const breaker = join(s.root, 'break-audit.js');
  writeFileSync(breaker, `const fs = require('node:fs'); const path = ${JSON.stringify(audit)}; fs.renameSync(path, path + '.saved'); fs.mkdirSync(path);`);
  const hook = step === 'commit' ? join(s.repo, '.git/hooks/reference-transaction') : join(s.remote, 'hooks/post-receive');
  writeFileSync(hook, `#!/bin/sh\n${step === 'commit' ? '[ "$1" = committed ] || exit 0\n' : ''}exec '${process.execPath}' '${breaker}'\n`, { mode: 0o755 });
  const first = await s.commit();
  expect(body(first).error.code).toBe('reconcile_required');
  const head = git(s.worktree, ['rev-parse', 'HEAD']);
  expect(head).not.toBe(s.base);
  unlinkSync(hook); rmSync(audit, { recursive: true }); renameSync(audit + '.saved', audit);
  const retry = await s.commit();
  expect(body(retry).error.code).toBe('step_audit_incomplete');
  const journal = JSON.parse(readFileSync(join(s.directory, 'finalize.json'), 'utf8'));
  expect(journal.stage).toBe(step === 'commit' ? 'prepared' : 'committed');
  expect(journal.audit.step).toBe(step);
  const stepRecords = readFileSync(audit, 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(record => record.request_id === journal.audit.request_id);
  expect(stepRecords.map(record => record.phase)).toEqual(['intent']);
  expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(head);
  expect(git(s.remote, ['for-each-ref', '--format=%(objectname)', `refs/heads/${s.branch}`])).toBe(step === 'commit' ? '' : head);
  expect(s.created()).toBe(0);
});

test('encoded journal limit refuses escape expansion before any Git change and accepted maxima round trip', async () => {
  const s = fixture();
  const commitMessage = (message: string) => runOperatorWrite(randomUUID(), docSessionCommitOperation(s.sid, { ...s.input, message }, s.deps), s.env);
  const objectsBefore = git(s.worktree, ['count-objects', '-v']);
  const refused = await commitMessage('x' + '\u0001'.repeat(7999));
  expect(refused.status).toBe(413); expect(body(refused).error.code).toBe('finalize_state_too_large');
  expect(existsSync(join(s.directory, 'finalize.json'))).toBe(false);
  expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(s.base);
  expect(git(s.worktree, ['count-objects', '-v'])).toBe(objectsBefore);
  expect(git(s.remote, ['for-each-ref', `refs/heads/${s.branch}`])).toBe('');
  const message = '界'.repeat(8000);
  expect((await commitMessage(message)).status).toBe(200);
  expect((readDocSessionFinalization(s.env, s.sid) as any).stage).toBe('complete');
  expect(JSON.parse(readFileSync(join(s.directory, 'finalize.json'), 'utf8')).input.message).toBe(message);
  expect((await commitMessage(message)).status).toBe(200);
  const escaped = fixture();
  const escapedMessage = 'x' + '\\'.repeat(7999);
  const answer = await runOperatorWrite(randomUUID(), docSessionCommitOperation(escaped.sid, { ...escaped.input, message: escapedMessage }, escaped.deps), escaped.env);
  expect(answer.status).toBe(200);
  expect((readDocSessionFinalization(escaped.env, escaped.sid) as any).stage).toBe('complete');
  expect(JSON.parse(readFileSync(join(escaped.directory, 'finalize.json'), 'utf8')).input.message).toBe(escapedMessage);
});

test('prepared scope refusal stays 422 with paths on the initial second check and on recovery', async () => {
  const s = fixture(); let checks = 0;
  const refusal = () => { throw new DocSessionScopeRefusal('generated_region', ['docs/guide.md']); };
  const first = await s.commit({ validate_changes: async () => { if (++checks === 2) refusal(); } });
  for (const answer of [first, await s.commit({ validate_changes: async () => refusal() })]) {
    expect(answer.status).toBe(422); expect(body(answer).error.files).toEqual(['docs/guide.md']);
    expect(body(answer).error.code).toBe('generated_region');
  }
  expect(git(s.worktree, ['rev-parse', 'HEAD'])).toBe(s.base);
  expect(git(s.remote, ['for-each-ref', `refs/heads/${s.branch}`])).toBe('');
  expect(s.created()).toBe(0);
});
