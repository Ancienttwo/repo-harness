import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ARCHCTX_REQUIRED_VERSION } from '../../src/core/architecture/projection';
import type { DocSessionRecordV1 } from '../../src/core/operator/doc-session-record';
import type { DocSessionChange } from '../../src/core/operator/doc-session-changes';
import type { GithubCommandRunner } from '../../src/effects/github/issues';
import { createDocSessionGithubAdapters } from '../../src/effects/operator/doc-session-finalize-github';
import { createDocSessionScopeValidator } from '../../src/effects/operator/doc-session-finalize-scope';
import { initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const target = { remote: 'origin', repository: 'Fixture/Docs', base_branch: 'main' };
const branch = 'docs/0123456789ab', commit = 'a'.repeat(40);
const repo = () => ({ id: 42, full_name: 'Fixture/Docs', html_url: 'https://github.com/Fixture/Docs', archived: false, disabled: false, default_branch: 'main', permissions: { push: true } });
const pr = () => ({ number: 7, html_url: 'https://github.com/Fixture/Docs/pull/7', state: 'open', draft: true, merged_at: null,
  head: { ref: branch, sha: commit, repo: { id: 42, full_name: 'Fixture/Docs' } },
  base: { ref: 'main', repo: { id: 42, full_name: 'Fixture/Docs' } } });
function transport(replies: unknown[]) {
  const calls: string[][] = [];
  const runner: GithubCommandRunner = (args, options) => {
    calls.push([...args]); expect(options.timeout_ms).toBeGreaterThan(0); expect(options.max_buffer).toBeLessThanOrEqual(2 * 1024 * 1024);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error('unexpected provider call');
    return { stdout: typeof next === 'string' ? next : JSON.stringify(next) };
  };
  return { runner, calls };
}
function fixture() {
  const root = tmpWorkspace('finalize-adapters'); roots.push(root); initGitRepo(root);
  mkdirSync(join(root, 'docs'));
  const git = (...args: string[]) => { const result = run('git', args, root); expect(result.status).toBe(0); return result.stdout; };
  git('remote', 'add', 'origin', 'https://github.com/fixture/docs.git');
  return { root, git, session: { worktree: root } as DocSessionRecordV1 };
}

test('target selection uses real Git remote configuration and provider identity/default branch/permission', async () => {
  const f = fixture(); const t = transport([repo()]);
  const adapters = createDocSessionGithubAdapters(process.env, t.runner);
  expect(await adapters.publication_target(f.session)).toEqual(target);
  expect(t.calls).toHaveLength(1); expect(t.calls[0]).toContain('repos/fixture/docs');
  expect(t.calls[0]).toContain('github.com'); expect(t.calls[0]).toContain('GET');
  f.git('remote', 'add', 'second', 'git@github.com:Fixture/Docs.git');
  await expect(adapters.publication_target(f.session)).rejects.toThrow();
  expect(t.calls).toHaveLength(1);
});

test('split push identity and multiple push URLs are refused before any provider call', async () => {
  const f = fixture(); const t = transport([]); const adapters = createDocSessionGithubAdapters(process.env, t.runner);
  f.git('remote', 'set-url', '--push', 'origin', 'https://github.com/other/repo.git');
  await expect(adapters.publication_target(f.session)).rejects.toThrow();
  f.git('remote', 'set-url', '--push', 'origin', 'https://github.com/fixture/docs.git');
  f.git('remote', 'set-url', '--add', '--push', 'origin', 'https://github.com/fixture/docs.git');
  await expect(adapters.publication_target(f.session)).rejects.toThrow(); expect(t.calls).toHaveLength(0);
});

test('repository redirects, removed permission and changed default base fail closed', async () => {
  for (const row of [{ ...repo(), full_name: 'Other/Docs' }, { ...repo(), permissions: { push: false } }, { ...repo(), default_branch: 'next' }]) {
    const t = transport([row]); const a = createDocSessionGithubAdapters(process.env, t.runner);
    await expect(a.find_draft_pr(target, branch, commit)).rejects.toThrow(); expect(t.calls).toHaveLength(1);
  }
});

test('lookup uses all states and all bases and only accepts an exact Draft head', async () => {
  const t = transport([repo(), [pr()]]); const a = createDocSessionGithubAdapters(process.env, t.runner);
  expect(await a.find_draft_pr(target, branch, commit)).toEqual({ number: 7, url: pr().html_url });
  const endpoint = t.calls[1]!.find(arg => arg.startsWith('repos/'))!;
  expect(endpoint).toContain('state=all'); expect(endpoint).toContain('head=Fixture%3Adocs%2F0123456789ab'); expect(endpoint).not.toContain('&base=');
  for (const row of [{ ...pr(), state: 'closed' }, { ...pr(), draft: false }, { ...pr(), merged_at: '2026-10-29' },
    { ...pr(), head: { ...pr().head, sha: 'b'.repeat(40) } }, { ...pr(), base: { ...pr().base, ref: 'other' } },
    { ...pr(), head: { ...pr().head, repo: { id: 44, full_name: 'Other/Docs' } } }]) {
    const bad = transport([repo(), [row]]);
    await expect(createDocSessionGithubAdapters(process.env, bad.runner).find_draft_pr(target, branch, commit)).rejects.toThrow();
  }
});

test('ambiguous, malformed and oversized provider replies never mean absent', async () => {
  for (const response of [[pr(), pr()], {}, 'not JSON', ' '.repeat(2 * 1024 * 1024 + 1), new Error('provider unavailable')]) {
    const t = transport([repo(), response]);
    await expect(createDocSessionGithubAdapters(process.env, t.runner).find_draft_pr(target, branch, commit)).rejects.toThrow();
  }
});

test('create reuses exact PR and sends no mutation when preflight is unavailable', async () => {
  const existing = transport([repo(), [pr()]]);
  expect((await createDocSessionGithubAdapters(process.env, existing.runner).create_draft_pr(target, branch, commit, 'Title')).state).toBe('created');
  expect(existing.calls.some(args => args.includes('POST'))).toBe(false);
  const unavailable = transport([new Error('denied')]);
  expect((await createDocSessionGithubAdapters(process.env, unavailable.runner).create_draft_pr(target, branch, commit, 'Title')).state).toBe('not_created');
  expect(unavailable.calls.some(args => args.includes('POST'))).toBe(false);
});

test('creation keeps user text literal, sets draft true, and validates the response', async () => {
  const t = transport([repo(), [], pr()]); const a = createDocSessionGithubAdapters(process.env, t.runner);
  const message = '@file $(never-execute)\n\n{owner} and "quoted" text';
  expect(await a.create_draft_pr(target, branch, commit, message)).toEqual({ state: 'created', pr: { number: 7, url: pr().html_url } });
  expect(t.calls).toHaveLength(3);
  const post = t.calls[2]!;
  expect(post).toContain('POST'); expect(post).toContain('github.com'); expect(post).toContain('draft=true');
  expect(post).toContain(`body=${message}`); expect(post[post.indexOf(`body=${message}`) - 1]).toBe('--raw-field');
  expect(post).toContain(`head=${branch}`); expect(post).toContain('base=main');
});

test('all failures after the single POST remain unknown and are never retried in the adapter', async () => {
  for (const response of [new Error('timeout'), 'bad JSON', { ...pr(), draft: false }, { ...pr(), number: 0 }]) {
    const t = transport([repo(), [], response]);
    expect((await createDocSessionGithubAdapters(process.env, t.runner).create_draft_pr(target, branch, commit, 'Title')).state).toBe('unknown');
    expect(t.calls.filter(args => args.includes('POST'))).toHaveLength(1);
  }
});

test('a spent deadline prevents further requests', async () => {
  let clock = 0; const t = transport([repo(), []]);
  const runner: GithubCommandRunner = (args, options) => { const result = t.runner(args, options); clock += 16000; return result; };
  await expect(createDocSessionGithubAdapters(process.env, runner, () => clock).find_draft_pr(target, branch, commit)).rejects.toThrow();
  expect(t.calls).toHaveLength(1);
});

const change = (path: string): DocSessionChange => ({ path, status: 'modified', old_mode: '100644', new_mode: '100644', old_oid: 'a'.repeat(40), new_oid: 'b'.repeat(40), tracked: true });
function scope(f: ReturnType<typeof fixture>, diffs: unknown[] = []) {
  const calls: string[][] = [];
  const validate = createDocSessionScopeValidator({
    // Test seam only. Production must supply the host owner's canonical predicate.
    is_writable_path: path => path !== 'docs/AGENTS.md',
    architecture: { consumerRoot: resolve(import.meta.dir, '../..'),
      policy: { provider: 'archctx', applyMode: 'manual', requiredVersion: ARCHCTX_REQUIRED_VERSION, timeoutMs: 5000 },
      run: (_binary, args) => { calls.push([...args]); return { status: 0, signal: null, stderr: '', stdout: JSON.stringify({
        schemaVersion: 'archcontext.envelope/v1', ok: true, requestId: 'scope-fixture', data: { schemaVersion: 'archcontext.docs-drift/v1', drift: { diffs } },
      }) }; },
    },
  });
  return { validate: (paths: string[]) => validate(f.session, paths.map(change)), calls };
}

test('scope combines docs-reader and required host policy without duplicating its rules', async () => {
  const f = fixture(); const v = scope(f);
  await expect(v.validate(['src/main.ts', 'docs/AGENTS.md', 'docs/.env'])).rejects.toMatchObject({ status: 422, code: 'path_outside_scope', files: ['src/main.ts', 'docs/AGENTS.md', 'docs/.env'] });
  expect(v.calls).toHaveLength(0);
  expect(() => createDocSessionScopeValidator({} as any)).toThrow('host writable-path authority');
});

test('generated target and manifest protection comes from the existing host projection authority', async () => {
  const f = fixture(); mkdirSync(join(f.root, 'docs/architecture'));
  writeFileSync(join(f.root, 'docs/architecture/.projection-manifest.json'), JSON.stringify({ targets: { one: { path: 'docs/architecture/generated.md' } } }));
  const v = scope(f);
  await expect(v.validate(['docs/architecture/generated.md'])).rejects.toMatchObject({ status: 422, code: 'generated_region', files: ['docs/architecture/generated.md'] });
  await expect(v.validate(['docs/architecture/.projection-manifest.json'])).rejects.toMatchObject({ status: 422, code: 'generated_region' });
  expect(v.calls).toHaveLength(0);
});

test('hand-edit rejection uses the existing architecture client/decoder and only affected paths', async () => {
  const f = fixture();
  const v = scope(f, [
    { path: 'docs/guide.md', reasonCode: 'projection-generated-region-manually-edited' },
    { path: 'docs/unrelated.md', reasonCode: 'projection-generated-file-manually-edited' },
  ]);
  await expect(v.validate(['docs/guide.md'])).rejects.toMatchObject({ status: 422, code: 'generated_region', files: ['docs/guide.md'] });
  expect(v.calls).toEqual([['docs', 'drift', '--profile', 'repo-harness/v1', '--json']]);
  await expect(scope(f, [{ path: 'docs/guide.md', reasonCode: 'projection-generated-region-stale' }]).validate(['docs/guide.md'])).resolves.toBeUndefined();
});

test('malformed hand-edit response or host policy failure is unavailable, not permission', async () => {
  const f = fixture();
  await expect(scope(f, [{ path: 7, reasonCode: 'projection-generated-file-manually-edited' }]).validate(['docs/guide.md'])).rejects.toMatchObject({ status: 503, code: 'scope_validation_unavailable' });
  const validate = createDocSessionScopeValidator({ is_writable_path: () => { throw new Error('policy unavailable'); } });
  await expect(validate(f.session, [change('docs/guide.md')])).rejects.toMatchObject({ status: 503, code: 'scope_validation_unavailable' });
});
