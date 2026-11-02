import { spawnSync } from 'child_process';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'bun:test';

import { buildIntegrationBatch, type BatchBuildDocument, type BatchBuildResult } from '../../src/effects/publication/batch-build';
import { batchMemberMerges } from '../../src/core/publication/merge-readiness';
import { tmpWorkspace } from '../helpers/repo-fixture';

const CLI = join(import.meta.dir, '../../src/cli/index.ts');
const REPOSITORY = 'acme/widgets';
const REPOSITORY_ID = '4242';
const PARENT = 77;

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

interface Fixture {
  readonly root: string;
  readonly remote: string;
  readonly work: string;
  /** PR number to its head SHA: #11 adds one.txt, #12 adds two.txt, #13 adds a different one.txt. */
  readonly heads: Readonly<Record<number, string>>;
}

/** A bare remote with main and GitHub-style refs/pull/<n>/head refs, and a clone of it as the build checkout. */
function fixture(): Fixture {
  const root = tmpWorkspace('repo-harness-batch-build');
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  git(root, 'init', '--bare', '-b', 'main', remote);
  mkdirSync(seed);
  git(seed, 'init', '-b', 'main');
  appendFileSync(join(seed, '.git/config'), '\n[user]\n\tname = Batch Test\n\temail = batch@test.local\n');
  writeFileSync(join(seed, 'README.md'), 'base\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'base');
  git(seed, 'remote', 'add', 'origin', remote);
  git(seed, 'push', 'origin', 'main');
  const heads: Record<number, string> = {};
  for (const [pr, file, text] of [[11, 'one.txt', 'one\n'], [12, 'two.txt', 'two\n'], [13, 'one.txt', 'other\n']] as const) {
    git(seed, 'checkout', '-B', `member-${pr}`, 'main');
    writeFileSync(join(seed, file), text);
    git(seed, 'add', '.');
    git(seed, 'commit', '-m', `member ${pr}`);
    heads[pr] = git(seed, 'rev-parse', 'HEAD');
    git(seed, 'push', 'origin', `HEAD:refs/pull/${pr}/head`);
  }
  git(root, 'clone', remote, work);
  appendFileSync(join(work, '.git/config'), '\n[user]\n\tname = Batch Test\n\temail = batch@test.local\n');
  return { root, remote, work, heads };
}

const acceptanceReview = (subject: string) => [
  'repo-harness acceptance review', 'Round: 1', `Subject: ${subject}`, 'Tier: high', 'Verdict: PASS',
  'Reviewer: gatekeeper', 'Model relation: unknown', '', 'Summary.', ''].join('\n');

/** The gh calls the build makes, answered from the fixture; `closedBatchPrs` names head refs that already have a PR. */
function ghStub(f: Fixture, closedBatchPrs: readonly string[] = []) {
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
      return ok(closedBatchPrs.includes(head) ? [{ number: 500, state: 'closed' }] : []);
    }
    if (args[1] === '-X' && args[2] === 'POST') {
      created.push(Object.fromEntries(args.filter((arg, index) => args[index - 1] === '-f').map((arg) => {
        const at = arg.indexOf('=');
        return [arg.slice(0, at), arg.slice(at + 1)];
      })));
      return ok({ number: 900, html_url: 'https://github.com/acme/widgets/pull/900' });
    }
    return { status: 1, stdout: '', stderr: `unexpected gh call: ${args.join(' ')}` };
  };
  return { runner, calls, created };
}

function buildBatch(f: Fixture, prs: readonly number[], stub = ghStub(f)) {
  const result = buildIntegrationBatch({ repo_root: f.work, provider_repository_id: REPOSITORY_ID, parent: PARENT, prs, gh_runner: stub.runner });
  return { result, stub };
}

function built(result: BatchBuildResult): BatchBuildDocument {
  if (result.exit_code !== 0) throw new Error(`expected a build, got ${JSON.stringify(result.document)}`);
  return result.document;
}

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
    expect(document).toMatchObject({ batch_number: 1, branch: `integration/${PARENT}-batch-1`, dropped: [], pr: { number: 900 } });
    expect(document.merged.map((member) => [member.pr, member.head_sha])).toEqual([[11, f.heads[11]], [12, f.heads[12]]]);
    expect(git(f.remote, 'rev-parse', `refs/heads/integration/${PARENT}-batch-1`)).toBe(document.head_sha);
    expect(document.base_sha).toBe(git(f.remote, 'rev-parse', 'refs/heads/main'));
    const chain = remoteChain(f, document.base_sha, document.head_sha);
    expect(chain).toMatchObject({ status: 'complete' });
    if (chain.status === 'complete') expect(chain.members.map((member) => member.member_head_sha)).toEqual([f.heads[12], f.heads[11]]);
    expect(stub.created).toHaveLength(1);
    const pr = stub.created[0]!;
    expect(pr).toMatchObject({ title: `chore(integration): merge accepted PRs #11 #12 as one batch (#${PARENT})`,
      head: `integration/${PARENT}-batch-1`, base: 'main' });
    expect(pr.body!.split('\n').slice(0, 3)).toEqual(['Closes #1', 'Closes #2', `Refs #${PARENT}`]);
    expect(pr.body).toContain(`| #11 | #1 | \`${f.heads[11]}\` (round 1 PASS, high) | \`${f.heads[11]}\` | https://github.com/acme/widgets/pull/11#pullrequestreview-1 |`);
    expect(pr.body).toContain(`| #12 | #2 | no acceptance review on GitHub | \`${f.heads[12]}\` | — |`);
    expect(pr.body).toContain('Not in this PR: none.');
  }));

  test('a conflicting member is dropped and reported; the others still merge', () => withFixture((f) => {
    const { result, stub } = buildBatch(f, [11, 13, 12]);
    const document = built(result);
    expect(document.merged.map((member) => member.pr)).toEqual([11, 12]);
    expect(document.dropped).toEqual([{ pr: 13, head_sha: f.heads[13]!, reason: 'merge_conflict', files: ['one.txt'] }]);
    expect(remoteChain(f, document.base_sha, document.head_sha)).toMatchObject({ status: 'complete' });
    expect(stub.created[0]!.title).toBe(`chore(integration): merge accepted PRs #11 #12 as one batch (#${PARENT})`);
    expect(stub.created[0]!.body).not.toContain('Closes #3');
    expect(stub.created[0]!.body).toContain('Not in this PR: #13 (merge conflict in `one.txt`).');
  }));

  test('a batch number used by a remote branch or by a closed PR head is not reused', () => withFixture((f) => {
    git(f.remote, 'update-ref', `refs/heads/integration/${PARENT}-batch-1`, f.heads[11]!);
    const { result, stub } = buildBatch(f, [12], ghStub(f, [`integration/${PARENT}-batch-2`]));
    expect(built(result)).toMatchObject({ batch_number: 3, branch: `integration/${PARENT}-batch-3` });
    expect(git(f.remote, 'rev-parse', `refs/heads/integration/${PARENT}-batch-1`)).toBe(f.heads[11]);
    expect(stub.calls.filter((args) => args[1]?.startsWith(`repos/${REPOSITORY}/pulls?state=all`)).map((args) => args[1]!.split('head=acme:')[1]))
      .toEqual([`integration/${PARENT}-batch-2`, `integration/${PARENT}-batch-3`]);
  }));

  test('the CLI refuses more than 6 members before any provider call or push', () => withFixture((f) => {
    const prs = [11, 12, 13, 14, 15, 16, 17].flatMap((pr) => ['--pr', String(pr)]);
    const result = spawnSync('bun', [CLI, 'publication', 'batch', 'build', '--repository-id', REPOSITORY_ID, '--parent', String(PARENT), ...prs, '--json'], {
      cwd: f.work, encoding: 'utf-8', env: { ...process.env, REPO_HARNESS_GH_BIN: join(f.root, 'no-gh') }, timeout: 120_000,
    });
    expect(result.status).toBe(4);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false, exit_code: 4, error: 'invalid_selection' });
    expect(git(f.remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/integration')).toBe('');
  }));
});
