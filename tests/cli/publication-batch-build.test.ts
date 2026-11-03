import { spawnSync } from 'child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'bun:test';

import { buildIntegrationBatch, type BatchBuildDocument, type BatchBuildFailure, type BatchBuildResult } from '../../src/effects/publication/batch-build';
import { BATCH_REF, batchMemberMerges } from '../../src/core/publication/merge-readiness';
import { tmpWorkspace, writeShellExecutableFixture } from '../helpers/repo-fixture';

const CLI = join(import.meta.dir, '../../src/cli/index.ts');
const REAL_GIT = Bun.which('git')!;
const REPOSITORY = 'acme/widgets';
const REPOSITORY_ID = '4242';
const PARENT = 77;
const BATCH_1 = `integration/${PARENT}-batch-1`;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

interface Fixture {
  readonly root: string;
  readonly seed: string;
  readonly remote: string;
  readonly work: string;
  /** Git for the build: the real git, except that `remote get-url` reports the URLs in fetch-urls and push-urls. */
  readonly gitBin: string;
  /** PR number to head: #11 adds one.txt, #12 adds two.txt, #13 adds another one.txt, #14 is the base commit. */
  readonly heads: Record<number, string>;
}

const identity = '\n[user]\n\tname = Batch Test\n\temail = batch@test.local\n';

/** A bare remote with main and GitHub-style refs/pull/<n>/head refs, and a clone of it as the build checkout. */
function fixture(): Fixture {
  const root = tmpWorkspace('repo-harness-batch-build');
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', remote);
  mkdirSync(seed);
  git(seed, 'init', '-b', 'main');
  appendFileSync(join(seed, '.git/config'), identity);
  writeFileSync(join(seed, 'README.md'), 'base\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'base');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'main', 'main:refs/pull/14/head');
  const heads: Record<number, string> = { 14: git(seed, 'rev-parse', 'HEAD') };
  for (const [pr, file, text] of [[11, 'one.txt', 'one\n'], [12, 'two.txt', 'two\n'], [13, 'one.txt', 'other\n']] as const) {
    git(seed, 'checkout', '-B', `member-${pr}`, 'main');
    writeFileSync(join(seed, file), text);
    git(seed, 'add', '.');
    git(seed, 'commit', '-m', `member ${pr}`);
    heads[pr] = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'push', 'origin', `HEAD:refs/pull/${pr}/head`);
  }
  git(root, 'clone', remote, work);
  appendFileSync(join(work, '.git/config'), identity);
  writeFileSync(join(root, 'fetch-urls'), `https://github.com/${REPOSITORY}.git\n`);
  writeFileSync(join(root, 'push-urls'), `git@github.com:${REPOSITORY}.git\n`);
  const gitBin = join(root, 'git');
  writeShellExecutableFixture(gitBin, ['#!/bin/sh',
    'if [ "$1" = remote ] && [ "$2" = get-url ]; then',
    `  if [ "$3" = --push ]; then cat '${root}/push-urls'; else cat '${root}/fetch-urls'; fi`,
    '  exit 0',
    'fi',
    `exec '${REAL_GIT}' "$@"`, ''].join('\n'));
  return { root, seed, remote, work, gitBin, heads };
}

/** PR #15: one member with 100 commits, so base..head after its merge commit has 101. */
function addLongMember(f: Fixture): void {
  const stream = Array.from({ length: 100 }, (_, i) => [`commit refs/heads/long`, `committer T <t@t.local> ${1_700_000_000 + i} +0000`,
    'data 1', 'c', ...(i === 0 ? [`from ${f.heads[14]}`] : []), 'M 644 inline long.txt', `data ${String(i).length + 1}`, `${i}`, ''].join('\n')).join('');
  expect(spawnSync('git', ['fast-import', '--quiet'], { cwd: f.seed, input: stream }).status).toBe(0);
  git(f.seed, 'push', 'origin', 'long:refs/pull/15/head');
  f.heads[15] = git(f.seed, 'rev-parse', 'long');
}

const acceptanceReview = (subject: string) => [
  'repo-harness acceptance review', 'Round: 1', `Subject: ${subject}`, 'Tier: high', 'Verdict: PASS',
  'Reviewer: gatekeeper', 'Model relation: unknown', '', 'Summary.', ''].join('\n');

interface StubOptions {
  /** Head refs that already have a PR. */
  readonly closedBatchPrs?: readonly string[];
  /** Runs at each batch-number PR probe, after the build read the remote branches. */
  readonly onProbe?: (branch: string) => void;
  readonly createFails?: boolean;
}

/** The gh calls the build makes, answered from the fixture. */
function ghStub(f: Fixture, options: StubOptions = {}) {
  const calls: string[][] = [];
  const created: Record<string, string>[] = [];
  const runner = (args: readonly string[]) => {
    calls.push([...args]);
    const ok = (value: unknown) => ({ status: 0, stdout: JSON.stringify(value) });
    if (args[1] === `repositories/${REPOSITORY_ID}`) return ok({ id: Number(REPOSITORY_ID), full_name: REPOSITORY, default_branch: 'main' });
    if (args[1] === 'graphql') {
      const pr = Number(args.find((arg) => arg.startsWith('number='))!.slice('number='.length));
      return ok({ data: { repository: { pullRequest: {
        number: pr, headRefOid: f.heads[pr],
        closingIssuesReferences: { pageInfo: { hasNextPage: false }, nodes: [{ number: pr - 10, repository: { nameWithOwner: REPOSITORY } }] },
        reviews: { nodes: pr === 11 ? [{ body: acceptanceReview(f.heads[11]!), url: 'https://github.com/acme/widgets/pull/11#pullrequestreview-1' }] : [] },
      } } } });
    }
    if (args[1]?.startsWith(`repos/${REPOSITORY}/pulls?state=all`)) {
      const head = args[1].split('head=acme:')[1]!;
      if (args[1].includes('per_page=1&')) options.onProbe?.(head);
      return ok(options.closedBatchPrs?.includes(head) ? [{ number: 500, state: 'closed' }] : []);
    }
    if (args[1] === '-X' && args[2] === 'POST') {
      created.push(Object.fromEntries(args.filter((_arg, index) => args[index - 1] === '-f').map((arg) => {
        const at = arg.indexOf('=');
        return [arg.slice(0, at), arg.slice(at + 1)];
      })));
      return options.createFails ? { status: 1, stdout: '', stderr: 'HTTP 502' } : ok({ number: 900, html_url: 'https://github.com/acme/widgets/pull/900' });
    }
    return { status: 1, stdout: '', stderr: `unexpected gh call: ${args.join(' ')}` };
  };
  return { runner, calls, created };
}

function buildBatch(f: Fixture, prs: readonly number[], stub = ghStub(f), env: Record<string, string> = {}) {
  const vars = { REPO_HARNESS_GIT_BIN: f.gitBin, ...env };
  const saved = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]));
  Object.assign(process.env, vars);
  try {
    const result = buildIntegrationBatch({ repo_root: f.work, provider_repository_id: REPOSITORY_ID, parent: String(PARENT),
      prs: prs.map(String), gh_runner: stub.runner });
    return { result, stub };
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function built(result: BatchBuildResult): BatchBuildDocument {
  if (result.exit_code !== 0) throw new Error(`expected a build, got ${JSON.stringify(result.document)}`);
  return result.document;
}

function refused(result: BatchBuildResult): BatchBuildFailure {
  if (result.exit_code === 0) throw new Error(`expected a refusal, got ${JSON.stringify(result.document)}`);
  return result.document;
}

const integrationRefs = (f: Fixture) => git(f.remote, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/integration');

/** The commit graph of base..head on the remote, read as `publication merge --batch` reads the compare range. */
function remoteChain(f: Fixture, base: string, head: string) {
  const lines = git(f.remote, 'rev-list', '--parents', `${base}..${head}`).split('\n').filter(Boolean);
  return batchMemberMerges(base, head, new Map(lines.map((line) => {
    const [sha, ...parents] = line.split(' ');
    return [sha!, parents] as const;
  })));
}

function withFixture(fn: (f: Fixture) => void) {
  const f = fixture();
  try {
    fn(f);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}

describe('publication batch build', () => {
  test('two clean members give one batch branch of member merges and one batch PR', () => withFixture((f) => {
    const { result, stub } = buildBatch(f, [11, 12]);
    const document = built(result);
    expect(document).toMatchObject({ batch_number: 1, branch: BATCH_1, dropped: [], pr: { number: 900 } });
    expect(BATCH_REF.test(document.branch)).toBe(true);
    expect(document.merged.map((member) => [member.pr, member.head_sha])).toEqual([[11, f.heads[11]], [12, f.heads[12]]]);
    expect(git(f.remote, 'rev-parse', `refs/heads/${BATCH_1}`)).toBe(document.head_sha);
    expect(document.base_sha).toBe(git(f.remote, 'rev-parse', 'refs/heads/main'));
    const chain = remoteChain(f, document.base_sha, document.head_sha);
    expect(chain).toMatchObject({ status: 'complete' });
    if (chain.status === 'complete') expect(chain.members.map((member) => member.member_head_sha)).toEqual([f.heads[12], f.heads[11]]);
    expect(stub.created).toHaveLength(1);
    const pr = stub.created[0]!;
    expect(pr).toMatchObject({ title: `chore(integration): merge accepted PRs #11 #12 as one batch (#${PARENT})`, head: BATCH_1, base: 'main' });
    expect(pr.body!.split('\n').slice(0, 3)).toEqual(['Closes #1', 'Closes #2', `Refs #${PARENT}`]);
    expect(pr.body).toContain(`| #11 | #1 | \`${f.heads[11]}\` (round 1 PASS, high) | \`${f.heads[11]}\` | https://github.com/acme/widgets/pull/11#pullrequestreview-1 |`);
    expect(pr.body).toContain(`| #12 | #2 | no acceptance review on GitHub | \`${f.heads[12]}\` | — |`);
    expect(pr.body).toContain('Not in this PR: none.');
  }));

  test('a conflicting member and an already contained member are dropped and reported; the others still merge', () => withFixture((f) => {
    const { result, stub } = buildBatch(f, [11, 13, 14, 12]);
    const document = built(result);
    expect(document.merged.map((member) => member.pr)).toEqual([11, 12]);
    expect(document.dropped).toEqual([
      { pr: 13, head_sha: f.heads[13]!, reason: 'merge_conflict', files: ['one.txt'] },
      { pr: 14, head_sha: f.heads[14]!, reason: 'already_contained', files: [] },
    ]);
    expect(remoteChain(f, document.base_sha, document.head_sha)).toMatchObject({ status: 'complete' });
    expect(git(f.work, 'worktree', 'list', '--porcelain').split('\n').filter((line) => line.startsWith('worktree '))).toHaveLength(1);
    expect(stub.created[0]!.title).toBe(`chore(integration): merge accepted PRs #11 #12 as one batch (#${PARENT})`);
    expect(stub.created[0]!.body).not.toMatch(/Closes #[34]/u);
    expect(stub.created[0]!.body).toContain('Not in this PR: #13 (merge conflict in `one.txt`); #14 (its head is already in main or in an earlier member).');
  }));

  test('a batch number used by a remote branch or by a closed PR head is not reused', () => withFixture((f) => {
    git(f.remote, 'update-ref', `refs/heads/${BATCH_1}`, f.heads[11]!);
    const { result, stub } = buildBatch(f, [12], ghStub(f, { closedBatchPrs: [`integration/${PARENT}-batch-2`] }));
    expect(built(result)).toMatchObject({ batch_number: 3, branch: `integration/${PARENT}-batch-3` });
    expect(git(f.remote, 'rev-parse', `refs/heads/${BATCH_1}`)).toBe(f.heads[11]);
    expect(stub.calls.filter((args) => args[1]?.includes('per_page=1&')).map((args) => args[1]!.split('head=acme:')[1]))
      .toEqual([`integration/${PARENT}-batch-2`, `integration/${PARENT}-batch-3`]);
  }));

  // Fixed dates make two builds of the same members on the same base produce the same head.
  const sameDates = { GIT_AUTHOR_DATE: '1700000000 +0000', GIT_COMMITTER_DATE: '1700000000 +0000' };
  test.each(['an ancestor of the batch head', 'the same batch head'] as const)(
    'a batch ref that another build creates at %s after the number is chosen is a collision', (other) => withFixture((f) => {
      let otherHead = '';
      const stub = ghStub(f, { onProbe: (branch) => {
        if (otherHead) return;
        otherHead = other === 'the same batch head' ? built(buildBatch(f, [11], ghStub(f), sameDates).result).head_sha : f.heads[14]!;
        git(f.remote, 'update-ref', `refs/heads/${branch}`, otherHead);
      } });
      const failure = refused(buildBatch(f, [11], stub, sameDates).result);
      expect(failure).toMatchObject({ exit_code: 4, error: 'batch_ref_collision', branch: BATCH_1, observed_head_sha: otherHead });
      if (other === 'the same batch head') expect(failure.head_sha).toBe(otherHead);
      expect(integrationRefs(f)).toBe(`refs/heads/${BATCH_1} ${otherHead}`);
      expect(stub.created).toHaveLength(0);
    }));

  test('a failed PR create with no PR on the pushed head exits 5 with the branch, head, title and body', () => withFixture((f) => {
    const failure = refused(buildBatch(f, [11, 12], ghStub(f, { createFails: true })).result);
    expect(failure).toMatchObject({ exit_code: 5, error: 'batch_pr_outcome_unknown', branch: BATCH_1,
      title: `chore(integration): merge accepted PRs #11 #12 as one batch (#${PARENT})` });
    expect(failure.body).toContain('Closes #1');
    expect(git(f.remote, 'rev-parse', `refs/heads/${BATCH_1}`)).toBe(failure.head_sha!);
  }));

  test('a push URL that names another repository is refused before any remote read or write', () => withFixture((f) => {
    writeFileSync(join(f.root, 'push-urls'), `https://github.com/${REPOSITORY}.git\nhttps://token@github.com/someone/widgets.git\n`);
    const { result, stub } = buildBatch(f, [11, 12]);
    const failure = refused(result);
    expect(failure).toMatchObject({ exit_code: 4, error: 'remote_mismatch' });
    expect(failure.message).not.toContain('token');
    expect(stub.calls).toHaveLength(1);
    expect(integrationRefs(f)).toBe('');
  }));

  test('GIT_DIR and GIT_WORK_TREE of the caller do not move the caller checkout', () => withFixture((f) => {
    const before = git(f.work, 'rev-parse', 'HEAD');
    const { result } = buildBatch(f, [11], ghStub(f), { GIT_DIR: join(f.work, '.git'), GIT_WORK_TREE: f.work });
    expect(built(result).merged.map((member) => member.pr)).toEqual([11]);
    expect(git(f.work, 'rev-parse', 'HEAD')).toBe(before);
    expect(git(f.work, 'status', '--porcelain')).toBe('');
  }));

  test('a batch with more commits than publication merge --batch proves is refused before the push', () => withFixture((f) => {
    addLongMember(f);
    const { result, stub } = buildBatch(f, [15]);
    expect(refused(result)).toMatchObject({ exit_code: 4, error: 'batch_commit_limit_exceeded' });
    expect(integrationRefs(f)).toBe('');
    expect(stub.created).toHaveLength(0);
  }));

  test('the CLI refuses more than 6 members and a non-canonical integer before any provider call or push', () => withFixture((f) => {
    const prs = [11, 12, 13, 14, 15, 16, 17].flatMap((pr) => ['--pr', String(pr)]);
    const result = spawnSync('bun', [CLI, 'publication', 'batch', 'build', '--repository-id', REPOSITORY_ID, '--parent', String(PARENT), ...prs, '--json'], {
      cwd: f.work, encoding: 'utf-8', env: { ...process.env, REPO_HARNESS_GH_BIN: join(f.root, 'no-gh') }, timeout: 120_000,
    });
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, exit_code: 4, error: 'invalid_selection' });
    const stub = ghStub(f);
    expect(refused(buildIntegrationBatch({ repo_root: f.work, provider_repository_id: REPOSITORY_ID, parent: '1e2', prs: ['11'], gh_runner: stub.runner })))
      .toMatchObject({ exit_code: 4, error: 'invalid_selection' });
    expect(stub.calls).toHaveLength(0);
    expect(integrationRefs(f)).toBe('');
  }));
});
