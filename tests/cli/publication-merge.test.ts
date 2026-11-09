import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
  executePublicationMerge,
  type PublicationMergeFailure,
  type PublicationMergeResult,
} from '../../src/effects/publication/merge-executor';
import {
  BASE,
  HEAD,
  MERGE_COMMIT,
  PR,
  POLICY_QUEUE,
  QUEUE_ENTRY,
  QUEUE_PARENT,
  QUEUE_RULES,
  REPOSITORY,
  REPOSITORY_ID,
  fakeGhResponse,
  graphqlVariable,
  installFakeGh,
  isEnqueueMutation,
  isMergeMutation,
  isQueueReadback,
  passingScenario,
  type PublicationMergeScenario,
} from '../helpers/publication-merge-fake-gh';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
const OTHER_COMMIT = 'd'.repeat(40);
const BATCH_REF = 'integration/1309-batch-2';
const MEMBER_1 = 'e'.repeat(40);
const MEMBER_1_MERGE = 'f'.repeat(40);
const MEMBER_2 = '1'.repeat(40);
/** Built as orchestrator §9.3 builds a batch: `git merge --no-ff` of each member onto the base. */
const BATCH_COMMITS = [
  { sha: MEMBER_1, parents: [BASE] },
  { sha: MEMBER_1_MERGE, parents: [BASE, MEMBER_1] },
  { sha: MEMBER_2, parents: [BASE] },
  { sha: HEAD, parents: [MEMBER_1_MERGE, MEMBER_2] },
];
const batchScenario = (overrides: Partial<PublicationMergeScenario> = {}) =>
  passingScenario({ headRef: BATCH_REF, compareCommits: BATCH_COMMITS, parents: [BASE, HEAD], ...overrides });
const scratch = mkdtempSync(join(tmpdir(), 'repo-harness-publication-merge-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface MergeInProcessOptions {
  /** Internal seam: no real wait during the bounded readback window. */
  readonly readbackWait?: (milliseconds: number) => void;
  /** Internal seam: deterministic clock for the bounded readback window. */
  readonly readbackNow?: () => number;
  /** Internal seam: simulate a slow provider call before the fake answer. */
  readonly beforeCall?: (args: readonly string[]) => void;
  /** Internal seam: observe the timeout passed to each readback call. */
  readonly readbackTimeout?: (milliseconds: number) => void;
  readonly batch?: boolean;
  /** The reviewed head and base; default HEAD and BASE. */
  readonly head?: string;
  readonly base?: string;
}

function mergeInProcess(scenario: PublicationMergeScenario, options: MergeInProcessOptions = {}) {
  return mergeInProcessAt(scratch, scenario, options);
}

function mergeInProcessAt(root: string, scenario: PublicationMergeScenario, options: MergeInProcessOptions = {}) {
  const calls: string[][] = [];
  const queued: unknown[] = [];
  let readbacks = 0;
  let queueReadbacks = 0;
  const result = executePublicationMerge({
    repo_root: root, repository: REPOSITORY, provider_repository_id: REPOSITORY_ID, pr_number: PR,
    expected_head_sha: options.head ?? HEAD, expected_base_sha: options.base ?? BASE, batch: options.batch,
    gh_runner: (args) => {
      options.beforeCall?.(args);
      calls.push([...args]);
      const prReadback = args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`;
      const response = fakeGhResponse(args, scenario, prReadback ? readbacks++ : isQueueReadback(args) ? queueReadbacks++ : 0);
      return { status: response.status as number, stdout: response.stdout, stderr: response.stderr };
    },
    ...(options.readbackWait ? { readback_wait: options.readbackWait } : {}),
    ...(options.readbackNow ? { readback_now: options.readbackNow } : {}),
    ...(options.readbackTimeout ? { readback_timeout: options.readbackTimeout } : {}),
    on_queued: (entry) => queued.push(entry),
  });
  return { result, calls, queued, mutations: calls.filter(isMergeMutation), enqueues: calls.filter(isEnqueueMutation) };
}

function failureOf(result: PublicationMergeResult): PublicationMergeFailure {
  if (result.exit_code === 0) throw new Error(`expected a refusal, got a merge: ${JSON.stringify(result.document)}`);
  return result.document;
}

let cliRun = 0;
function mergeCli(scenario: PublicationMergeScenario, extraArgs: readonly string[] = [], head = HEAD, base = BASE, cwd?: string) {
  const dir = join(scratch, `cli-${cliRun++}`);
  mkdirSync(dir);
  const gh = installFakeGh(dir, scenario);
  const result = spawnSync('bun', [CLI, 'publication', 'merge', '--repository', REPOSITORY, '--repository-id', REPOSITORY_ID,
    '--pr', String(PR), '--head', head, '--base', base, '--json', ...extraArgs], {
    cwd: cwd ?? dir, encoding: 'utf-8', env: { ...process.env, REPO_HARNESS_GH_BIN: gh.bin }, timeout: 120_000,
  });
  const calls = gh.calls();
  return { status: result.status, document: JSON.parse(result.stdout) as Record<string, any>, stderr: result.stderr, calls, mutations: calls.filter(isMergeMutation) };
}

const policy = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const QUEUE_ON = { policyBase: POLICY_QUEUE, policyHead: POLICY_QUEUE };

describe('publication merge refusals send no mergePullRequest', () => {
  test.each([
    ['off', policy({ publication: { acceptance_merge: 'off' } })],
    ['missing publication', policy({ merge_gate: { enabled: true } })],
    ['missing field', policy({ publication: {} })],
    ['missing policy file', null],
  ] as const)('base switch %s exits 3', (_label, policyBase) => {
    const { result, mutations } = mergeInProcess(passingScenario({ policyBase }));
    expect(result.exit_code).toBe(3);
    expect(result.document).toMatchObject({ ok: false, exit_code: 3, error: 'acceptance_merge_off' });
    expect(mutations).toHaveLength(0);
  });

  test.each([
    ['"yes"', policy({ publication: { acceptance_merge: 'yes' } })],
    ['boolean', policy({ publication: { acceptance_merge: true } })],
    ['non-object publication', policy({ publication: 'on' })],
    ['unknown publication field', policy({ publication: { acceptance_merge: 'on', bypass: true } })],
    ['invalid JSON', '{ "publication": { "acceptance_merge": "on" '],
    ['merge_queue "yes"', policy({ publication: { acceptance_merge: 'on', merge_queue: 'yes' } })],
  ] as const)('base switch %s fails closed as publication_policy_invalid', (_label, policyBase) => {
    const { result, mutations } = mergeInProcess(passingScenario({ policyBase }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'publication_policy_invalid' });
    expect(mutations).toHaveLength(0);
  });

  test.each([
    ['turns the switch off', policy({ publication: { acceptance_merge: 'off' } })],
    ['deletes the subtree', policy({ merge_gate: { enabled: true } })],
    ['deletes the file', null],
    ['breaks the JSON', '{'],
  ] as const)('a PR that %s is refused', (_label, policyHead) => {
    const { result, mutations } = mergeInProcess(passingScenario({ policyHead }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'publication_policy_changed_in_pr' });
    expect(mutations).toHaveLength(0);
  });

  test.each([
    ['fork PR', { isCrossRepository: true }, 'cross_repository_pr'],
    ['auto-merge request', { autoMerge: true }, 'auto_merge_enabled'],
    ['strict=false', { protection: { strict: false, enforce_admins: true } }, 'base_protection_insufficient'],
    ['enforce_admins=false', { protection: { strict: true, enforce_admins: false } }, 'base_protection_insufficient'],
    ['unprotected branch', { protection: null }, 'base_protection_insufficient'],
    ['merge queue rule', { rules: [{ type: 'pull_request' }, { type: 'merge_queue' }] }, 'base_protection_insufficient'],
    ['merge queue from classic protection', { rules: [], mergeQueueEnabled: true }, 'base_protection_insufficient'],
    ['unreported merge queue state', { mergeQueueEnabled: 'missing' }, 'base_protection_insufficient'],
    ['merge queue switch on without a merge queue', QUEUE_ON, 'merge_queue_policy_mismatch'],
    ['required merge queue with the switch off', { rules: QUEUE_RULES, mergeQueueEnabled: true }, 'merge_queue_policy_mismatch'],
    ['merge queue with the MERGE method', { ...QUEUE_ON, rules: [{ type: 'merge_queue', parameters: { merge_method: 'MERGE' } }], mergeQueueEnabled: true }, 'base_protection_insufficient'],
    ['merge queue with HEADGREEN grouping', { ...QUEUE_ON, rules: [{ type: 'merge_queue', parameters: { merge_method: 'SQUASH', grouping_strategy: 'HEADGREEN' } }], mergeQueueEnabled: true }, 'base_protection_insufficient'],
    ['merge queue with a commit-list squash message', { ...QUEUE_ON, rules: QUEUE_RULES, mergeQueueEnabled: true, squashMessage: 'COMMIT_MESSAGES' }, 'base_protection_insufficient'],
    ['PR already in the merge queue', { ...QUEUE_ON, rules: QUEUE_RULES, mergeQueueEnabled: true, queued: true }, 'merge_queue_entry_exists'],
  ] as const)('%s is refused', (_label, overrides, error) => {
    const { result, mutations } = mergeInProcess(passingScenario(overrides));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error });
    expect(mutations).toHaveLength(0);
  });

  test.each([
    ['unresolved_threads', { unresolvedThreads: 1 }],
    ['checks_pending', { checks: 'pending' }],
    ['changes_requested', { changesRequested: true }],
  ] as const)('readiness blocker %s is passed through unchanged', (code, overrides) => {
    const { result, mutations } = mergeInProcess(passingScenario(overrides));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'merge_readiness_blocked' });
    expect(failureOf(result).blockers?.map((blocker) => blocker.code)).toContain(code);
    expect(mutations).toHaveLength(0);
  });

  test('a body that only refers to a linked issue is a closing reference mismatch', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ body: 'Refs #12', closing: [`${REPOSITORY}#12`] }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'closing_references_mismatch' });
    expect(failureOf(result).message).toContain(`GitHub links [${REPOSITORY}#12]`);
    expect(mutations).toHaveLength(0);
  });

  test('a title closing keyword without a provider link is a closing reference mismatch', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ title: 'Ship it, fixes #9', body: '', closing: [] }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'closing_references_mismatch' });
    expect(failureOf(result).message).toContain(`commit message closes [${REPOSITORY}#9]`);
    expect(mutations).toHaveLength(0);
  });

  test('a closing keyword before a pull request URL is refused and names the target', () => {
    const pull = 'https://github.com/o/r/pull/9#issuecomment-123';
    const { result, mutations } = mergeInProcess(passingScenario({ body: `Closes #7\nFixes ${pull}` }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'closing_references_mismatch' });
    expect(failureOf(result).message).toContain(`unsupported targets [${pull}]`);
    expect(mutations).toHaveLength(0);
  });

  test('an unreadable protection endpoint names the missing Administration read', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ protection: null }));
    expect(failureOf(result)).toMatchObject({ exit_code: 4, error: 'base_protection_insufficient' });
    expect(failureOf(result).message).toContain('protection is absent or the token cannot read it (needs Administration read)');
    expect(mutations).toHaveLength(0);
  });

  test('more than 100 closing links fail closed', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ closingHasNextPage: true }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'closing_references_incomplete' });
    expect(mutations).toHaveLength(0);
  });

  test('provider read failures before the mutation exit 4', () => {
    const calls: string[][] = [];
    const result = executePublicationMerge({ repo_root: scratch, repository: REPOSITORY, provider_repository_id: REPOSITORY_ID,
      pr_number: PR, expected_head_sha: HEAD, expected_base_sha: BASE,
      gh_runner: (args) => { calls.push([...args]); return { status: 1, stdout: '', stderr: 'connection reset' }; } });
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'provider_unavailable' });
    expect(calls.filter(isMergeMutation)).toHaveLength(0);
  });

  test('an invalid selection sends no provider call', () => {
    const calls: string[][] = [];
    const result = executePublicationMerge({ repo_root: scratch, repository: REPOSITORY, provider_repository_id: REPOSITORY_ID,
      pr_number: Number.NaN, expected_head_sha: HEAD, expected_base_sha: BASE,
      gh_runner: (args) => { calls.push([...args]); return { status: 0, stdout: '{}' }; } });
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'invalid_selection' });
    expect(calls).toEqual([]);
  });
});

describe('publication merge execution', () => {
  test('a policy change outside the publication subtree still merges once with the explicit message', () => {
    const policyHead = policy({ merge_gate: { enabled: false }, publication: { acceptance_merge: 'on' }, unrelated: [1] });
    const { result, calls, mutations } = mergeInProcess(passingScenario({ policyHead }));
    expect(result.exit_code).toBe(0);
    expect(mutations).toHaveLength(1);
    const mutation = mutations[0]!;
    expect(graphqlVariable(mutation, 'query')).toContain('mergeMethod:SQUASH');
    expect(graphqlVariable(mutation, 'expectedHeadOid')).toBe(HEAD);
    expect(graphqlVariable(mutation, 'commitHeadline')).toBe(`Ship the executor (#${PR})`);
    expect(graphqlVariable(mutation, 'commitBody')).toBe('Closes #7\n\nDetails.');
    // Every REST and CLI call names the repository; nothing reads the local remote.
    for (const call of calls) {
      if (call[0] === 'api' && call[1] !== 'graphql') expect(call[1]!.startsWith(`repos/${REPOSITORY}`)).toBe(true);
      if (call[0] !== 'api') expect(call).toContain(`github.com/${REPOSITORY}`);
      if (call[0] === 'api') expect(call.slice(-2)).toEqual(['--hostname', 'github.com']);
    }
  });

  test('the CLI merges once and prints the merge, parent and revert command', () => {
    const run = mergeCli(passingScenario());
    expect(run.status).toBe(0);
    expect(run.document).toEqual({
      protocol: 1,
      kind: 'repo-harness-publication-merge',
      repository: REPOSITORY,
      provider_repository_id: REPOSITORY_ID,
      pr: PR,
      head_sha: HEAD,
      base_ref: 'main',
      base_sha: BASE,
      merge_commit_sha: MERGE_COMMIT,
      parent_sha: BASE,
      policy_ref: BASE,
      revert: `git revert ${MERGE_COMMIT}`,
    });
    expect(run.mutations).toHaveLength(1);
    expect(graphqlVariable(run.mutations[0]!, 'expectedHeadOid')).toBe(HEAD);
  }, 120_000);

  test('the CLI returns the merge document after a stale first readback', () => {
    const run = mergeCli(passingScenario({ readbackSequence: ['open', 'merged'] }));
    expect(run.status).toBe(0);
    expect(run.document).toMatchObject({ merge_commit_sha: MERGE_COMMIT, parent_sha: BASE });
    expect(run.mutations).toHaveLength(1);
    expect(run.calls.filter((args) => args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`)).toHaveLength(2);
  }, 120_000);

  test('the CLI exits 3 for an off switch without a mutation', () => {
    const run = mergeCli(passingScenario({ policyBase: policy({ publication: { acceptance_merge: 'off' } }) }));
    expect(run.status).toBe(3);
    expect(run.document).toMatchObject({ ok: false, exit_code: 3, error: 'acceptance_merge_off' });
    expect(run.mutations).toHaveLength(0);
  }, 120_000);

  test('the CLI exits 4 for a pre-mutation refusal', () => {
    const run = mergeCli(passingScenario({ protection: { strict: false, enforce_admins: false } }));
    expect(run.status).toBe(4);
    expect(run.document).toMatchObject({ ok: false, exit_code: 4, error: 'base_protection_insufficient' });
    expect(run.mutations).toHaveLength(0);
  }, 120_000);

  test('a merge request that never completes exits 5 and is not retried', () => {
    const run = mergeCli(passingScenario({ merge: 'kill' }));
    expect(run.status).toBe(5);
    expect(run.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(run.mutations).toHaveLength(1);
    expect(run.calls.at(-1)).toEqual(run.mutations[0]);
  }, 120_000);

  test('an incomplete merge response exits 5 and is not retried', () => {
    const { result, calls, mutations } = mergeInProcess(passingScenario({ merge: 'truncated' }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(mutations).toHaveLength(1);
    expect(calls.at(-1)).toEqual(mutations[0]);
  });

  test('an explicit GraphQL rejection with the PR still open exits 6 with the provider error', () => {
    const run = mergeCli(passingScenario({ merge: 'graphql_error', readback: 'open' }));
    expect(run.status).toBe(6);
    expect(run.document).toMatchObject({ ok: false, exit_code: 6, error: 'provider_rejected' });
    expect(run.document.message).toContain('Head branch was modified');
    expect(run.mutations).toHaveLength(1);
  }, 120_000);

  test('an error response with the PR still open at the expected head is a proven rejection', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ merge: 'internal_error', readback: 'open' }));
    expect(failureOf(result)).toMatchObject({ exit_code: 6, error: 'provider_rejected' });
    expect(failureOf(result).message).toContain('INTERNAL');
    expect(mutations).toHaveLength(1);
  });

  test('an error response followed by a proven merge exits 0 and keeps the provider error', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ merge: 'internal_error' }));
    expect(result.exit_code).toBe(0);
    expect(result.document).toMatchObject({ merge_commit_sha: MERGE_COMMIT, parent_sha: BASE });
    expect(result.exit_code === 0 && result.document.provider_errors).toContain('INTERNAL');
    expect(mutations).toHaveLength(1);
  });

  test('a malformed error response with a failed readback exits 5', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ merge: 'null_errors', readback: 'fail' }));
    expect(failureOf(result)).toMatchObject({ exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain('provider errors: [null]');
    expect(mutations).toHaveLength(1);
  });

  test('an error response followed by an unproven merge exits 5', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ merge: 'null_errors', parents: [BASE, HEAD] }));
    expect(failureOf(result)).toMatchObject({ exit_code: 5, error: 'merge_outcome_unknown' });
    expect(mutations).toHaveLength(1);
  });

  test('a merge commit with two parents exits 5', () => {
    const run = mergeCli(passingScenario({ parents: [BASE, HEAD] }));
    expect(run.status).toBe(5);
    expect(run.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(run.mutations).toHaveLength(1);
  }, 120_000);

  test('a merge commit whose single parent is not the expected base exits 5', () => {
    const { result, mutations } = mergeInProcess(passingScenario({ parents: [OTHER_COMMIT] }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(mutations).toHaveLength(1);
  });

  test('a successful squash with a late PR readback is proven within the bounded window', () => {
    const { result, calls, mutations } = mergeInProcess(passingScenario({ readbackSequence: ['open', 'merged'] }), { readbackWait: () => {} });
    expect(result.exit_code).toBe(0);
    expect(result.document).toMatchObject({ merge_commit_sha: MERGE_COMMIT, parent_sha: BASE });
    expect(mutations).toHaveLength(1);
    expect(calls.filter((args) => args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`)).toHaveLength(2);
  });

  test('a readback that never shows the merge exits 5 with not-merged evidence', () => {
    const { result, calls, mutations } = mergeInProcess(passingScenario({ readbackSequence: ['open'] }), { readbackWait: () => {} });
    expect(failureOf(result)).toMatchObject({ exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain('state=open');
    expect(failureOf(result).message).toContain('merged=false');
    expect(failureOf(result).message).toContain('did not confirm the merge');
    expect(mutations).toHaveLength(1);
    const readbacks = calls.filter((args) => args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`);
    expect(readbacks.length).toBeGreaterThan(1);
    expect(readbacks.length).toBeLessThanOrEqual(13);
  });

  test('a slow PR read that consumes the window starts neither another PR read nor the commit read', () => {
    let now = 0;
    const { result, calls, mutations } = mergeInProcess(passingScenario({ readback: 'merged' }), {
      readbackNow: () => now,
      readbackWait: () => { throw new Error('no wait after the deadline'); },
      beforeCall: (args) => {
        if (args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`) now += 30_000;
      },
    });
    expect(failureOf(result)).toMatchObject({ exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain('did not confirm the merge within 30000 ms');
    expect(mutations).toHaveLength(1);
    expect(calls.filter((args) => args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`)).toHaveLength(1);
    expect(calls.filter((args) => args[0] === 'api' && args[1] === `repos/${REPOSITORY}/git/commits/${MERGE_COMMIT}`)).toHaveLength(0);
  });

  test('each readback call is capped to the window that remains', () => {
    let now = 0;
    const timeouts: number[] = [];
    const { result } = mergeInProcess(passingScenario({ readbackSequence: ['open', 'merged'] }), {
      readbackNow: () => now,
      readbackWait: (milliseconds) => { now += milliseconds; },
      readbackTimeout: (milliseconds) => { timeouts.push(milliseconds); },
    });
    expect(result.exit_code).toBe(0);
    expect(timeouts).toEqual([30_000, 29_750, 29_750]);
  });

  test('a readback that shows a different merged SHA exits 5 with that SHA and the response SHA', () => {
    const { result, calls } = mergeInProcess(passingScenario({ readbackMergeSha: OTHER_COMMIT }), { readbackWait: () => {} });
    expect(failureOf(result)).toMatchObject({ exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain(`merged at ${OTHER_COMMIT}`);
    expect(failureOf(result).message).toContain(`merge response reported ${MERGE_COMMIT}`);
    expect(calls.filter((args) => args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`)).toHaveLength(1);
  });
});

/**
 * A real repository for the queue content proof. Each run gets a new checkout
 * whose `origin` is a bare repository with `refs/pull/42/head` and a `main` that
 * holds the scenario's merge commit, so the production fetch runs unchanged.
 */
interface QueueRepo {
  readonly remote: string;
  readonly base: string;
  readonly head: string;
  /** main after another PR merged: a child of base. */
  readonly parent: string;
  /** The queue squash of head onto parent, and the squash of head onto base. */
  readonly merge: string;
  readonly mergeOnBase: string;
  /** A commit on parent whose tree is not the merge of head. */
  readonly wrongMerge: string;
  /** main after a change to the file that head adds: head does not merge onto it. */
  readonly conflictParent: string;
  /** A commit on conflictParent that stands for the provider's merge. */
  readonly conflictMerge: string;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid',
    GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' } });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function buildQueueRepo(): QueueRepo {
  const work = join(scratch, 'queue-work');
  const remote = join(scratch, 'queue-remote.git');
  mkdirSync(work);
  git(work, 'init', '-q', '-b', 'main');
  const commit = (file: string, text: string, message: string) => {
    writeFileSync(join(work, file), text);
    git(work, 'add', file);
    git(work, 'commit', '-q', '-m', message);
    return git(work, 'rev-parse', 'HEAD');
  };
  const base = commit('a.txt', 'a\n', 'base');
  git(work, 'checkout', '-q', '-b', 'feat');
  const head = commit('b.txt', 'b\n', 'head');
  git(work, 'checkout', '-q', 'main');
  const conflictParent = commit('b.txt', 'other\n', 'main adds b');
  git(work, 'reset', '-q', '--hard', base);
  const parent = commit('c.txt', 'c\n', 'main moved');
  const squash = (onto: string) => git(work, 'commit-tree', git(work, 'merge-tree', '--write-tree', onto, head), '-p', onto, '-m', 'squash');
  const merge = squash(parent);
  const mergeOnBase = squash(base);
  const wrongMerge = git(work, 'commit-tree', `${parent}^{tree}`, '-p', parent, '-m', 'wrong');
  const conflictMerge = git(work, 'commit-tree', `${parent}^{tree}`, '-p', conflictParent, '-m', 'provider merge');
  for (const [name, sha] of [['merge', merge], ['merge-on-base', mergeOnBase], ['wrong', wrongMerge], ['conflict', conflictMerge]]) git(work, 'branch', name!, sha!);
  git(scratch, 'clone', '-q', '--bare', work, remote);
  git(remote, 'update-ref', `refs/pull/${PR}/head`, head);
  return { remote, base, head, parent, merge, mergeOnBase, wrongMerge, conflictParent, conflictMerge };
}

let queueRoots = 0;
/** A new checkout with an empty object store; origin's main is `mainTip`. */
function queueCheckout(repo: QueueRepo, mainTip: string, origin = repo.remote): string {
  git(repo.remote, 'update-ref', 'refs/heads/main', mainTip);
  const root = join(scratch, `queue-root-${queueRoots++}`);
  mkdirSync(root);
  git(root, 'init', '-q');
  git(root, 'remote', 'add', 'origin', origin);
  return root;
}

describe('publication merge through a required merge queue', () => {
  let repo: QueueRepo;
  beforeAll(() => { repo = buildQueueRepo(); });
  const queueScenario = (overrides: Partial<PublicationMergeScenario> = {}) => passingScenario({ ...QUEUE_ON, rules: QUEUE_RULES, mergeQueueEnabled: true,
    protection: { strict: false, enforce_admins: true }, head: repo.head, base: repo.base, mergeCommit: repo.merge, queueParent: repo.parent,
    parents: [repo.parent], ...overrides });
  const run = (scenario: PublicationMergeScenario, options: MergeInProcessOptions = {}, origin?: string) =>
    mergeInProcessAt(queueCheckout(repo, scenario.mergeCommit ?? repo.merge, origin), scenario,
      { readbackWait: () => {}, readbackNow: () => 0, head: repo.head, base: repo.base, ...options });

  test.each([
    ['onto a moved main', () => ({}), () => repo.parent, true],
    ['onto the reviewed base', () => ({ mergeCommit: repo.mergeOnBase, queueParent: repo.base, parents: [repo.base] }), () => repo.base, false],
  ] as const)('the executor enqueues once and proves a queue squash %s by tree and merge_group CI', (_label, overrides, parent, compares) => {
    const waits: number[] = [];
    const { result, calls, queued, mutations, enqueues } = run(queueScenario({ queueSequence: ['queued', 'queued', 'merged'], ...overrides() }),
      { readbackWait: (ms) => waits.push(ms) });
    expect(mutations).toHaveLength(0);
    expect(enqueues).toHaveLength(1);
    expect(graphqlVariable(enqueues[0]!, 'expectedHeadOid')).toBe(repo.head);
    expect(queued).toEqual([{ id: QUEUE_ENTRY, state: 'QUEUED', position: 1 }]);
    expect(waits).toEqual([30_000, 30_000]);
    expect(calls.some((args) => args[1] === `repos/${REPOSITORY}/compare/${repo.base}...${parent()}`)).toBe(compares);
    const merge = (overrides() as { mergeCommit?: string }).mergeCommit ?? repo.merge;
    expect(result).toMatchObject({ exit_code: 0, document: { merge_commit_sha: merge, base_sha: repo.base, parent_sha: parent(),
      merge_queue_entry: QUEUE_ENTRY, revert: `git revert ${merge}` } });
  });

  test('the CLI reports the queue entry on stderr and the merge on stdout', () => {
    const cli = mergeCli(queueScenario(), [], repo.head, repo.base, queueCheckout(repo, repo.merge));
    expect(cli.status).toBe(0);
    expect(JSON.parse(cli.stderr.trim().split('\n').at(-1)!)).toEqual({ queued: { id: QUEUE_ENTRY, state: 'QUEUED', position: 1 } });
    expect(cli.document).toMatchObject({ merge_commit_sha: repo.merge, parent_sha: repo.parent, merge_queue_entry: QUEUE_ENTRY });
    expect(cli.mutations).toHaveLength(0);
  });

  test('one removal read followed by the merge is a merge', () => {
    const waits: number[] = [];
    const { result } = run(queueScenario({ queueSequence: ['queued', 'removed', 'merged'] }), { readbackWait: (ms) => waits.push(ms) });
    expect(result).toMatchObject({ exit_code: 0, document: { merge_commit_sha: repo.merge } });
    expect(waits).toEqual([30_000, 5_000]);
  });

  test.each([
    ['a confirmed removal', { queueSequence: ['queued', 'removed', 'removed'] }, 6, 'merge_queue_removed', 'was removed without a merge'],
    ['a removal around an unreadable read', { queueSequence: ['queued', 'removed', 'unreadable', 'removed'] }, 6, 'merge_queue_removed', 'was removed without a merge'],
    ['a removal after the entry came back', { queueSequence: ['queued', 'removed', 'queued', 'removed', 'removed'] }, 6, 'merge_queue_removed', 'was removed without a merge'],
    ['a replacement entry', { queueSequence: ['queued', 'replaced', 'merged'] }, 6, 'merge_queue_removed', `${QUEUE_ENTRY}_2 replaced queue entry ${QUEUE_ENTRY}`],
    ['a moved head', { queueSequence: ['queued', 'moved'] }, 5, 'merge_outcome_unknown', 'left the queue without a merge'],
    ['a closed PR', { queueSequence: ['closed'] }, 5, 'merge_outcome_unknown', 'state=CLOSED'],
    ['a merge commit with another tree', () => ({ mergeCommit: repo.wrongMerge }), 5, 'merge_outcome_unknown', 'a merge of'],
    ['a head that conflicts with the queue parent', () => ({ mergeCommit: repo.conflictMerge, queueParent: repo.conflictParent, parents: [repo.conflictParent] }), 5, 'merge_outcome_unknown', 'does not merge cleanly'],
    ['an unreadable merge_group run list', { queueRun: 'unreadable' }, 5, 'merge_outcome_unknown', 'merge_group CI readback failed'],
    ['a failed merge_group run', { queueRun: 'failure' }, 5, 'merge_outcome_unknown', 'no successful merge_group CI run'],
    ['no merge_group run', { queueRun: 'missing' }, 5, 'merge_outcome_unknown', 'no successful merge_group CI run'],
    ['a parent that does not descend from the reviewed base', { queueParentStatus: 'diverged' }, 5, 'merge_outcome_unknown', 'does not descend from the expected base'],
    ['an enqueue that never completes', { enqueue: 'kill' }, 5, 'merge_outcome_unknown', 'enqueue request did not complete'],
    ['an incomplete enqueue response', { enqueue: 'incomplete' }, 5, 'merge_outcome_unknown', 'enqueue response is incomplete'],
    ['an enqueue entry with a malformed position', { enqueue: 'bad_entry' }, 5, 'merge_outcome_unknown', 'enqueue response is incomplete'],
    ['an enqueue response that is not JSON', { enqueue: 'malformed_json' }, 5, 'merge_outcome_unknown', 'enqueue response is not a JSON object'],
    ['a failed enqueue call without GraphQL errors', { enqueue: 'nonzero' }, 5, 'merge_outcome_unknown', 'enqueue request failed'],
    ['an enqueue error, a removal read, then an unreadable read', { enqueue: 'graphql_error', queueSequence: ['removed', 'unreadable'] }, 5, 'merge_outcome_unknown', 'Pull request is not mergeable.'],
    ['an enqueue error with the PR not queued on two reads', { enqueue: 'graphql_error', queueSequence: ['removed', 'removed'] }, 6, 'provider_rejected', 'Pull request is not mergeable.'],
    ['an enqueue error with an unreadable PR', { enqueue: 'graphql_error', queueSequence: ['unreadable'] }, 5, 'merge_outcome_unknown', 'Pull request is not mergeable.'],
  ] as const)('%s fails without a second enqueue', (_label, overrides, exitCode, error, message) => {
    const extra = typeof overrides === 'function' ? overrides() : overrides;
    const { result, mutations, enqueues } = run(queueScenario(extra as Partial<PublicationMergeScenario>));
    expect(result.document).toMatchObject({ ok: false, exit_code: exitCode, error });
    expect(failureOf(result).message).toContain(message);
    expect(enqueues).toHaveLength(1);
    expect(mutations).toHaveLength(0);
  });

  test('an enqueue error followed by a queued entry waits for the merge and keeps the provider error', () => {
    const { result, queued } = run(queueScenario({ enqueue: 'graphql_error', queueSequence: ['removed', 'queued', 'merged'] }));
    expect(queued).toEqual([{ id: QUEUE_ENTRY, state: 'AWAITING_CHECKS', position: 1 }]);
    expect(result).toMatchObject({ exit_code: 0, document: { merge_commit_sha: repo.merge, provider_errors: expect.stringContaining('Pull request is not mergeable.') } });
  });

  test('a failed fetch from origin exits 5 and keeps git stderr out of the result', () => {
    const missing = join(scratch, 'no-such-remote.git');
    const { result } = run(queueScenario(), {}, missing);
    expect(result.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain('git fetch from origin failed (exit 128)');
    expect(failureOf(result).message).not.toContain(missing);
  });

  test.each([
    ['an enqueue error with the PR already merged', { enqueue: 'graphql_error', queueSequence: ['merged'] }, 0],
    ['an enqueue error, a removal read, then the merge', { enqueue: 'graphql_error', queueSequence: ['removed', 'merged'] }, 1],
  ] as const)('%s proves the merge and keeps the provider error', (_label, overrides, waits) => {
    const calls: number[] = [];
    const { result, enqueues } = run(queueScenario(overrides), { readbackWait: (ms) => calls.push(ms) });
    expect(result).toMatchObject({ exit_code: 0, document: { merge_commit_sha: repo.merge, provider_errors: expect.stringContaining('Pull request is not mergeable.') } });
    expect(calls).toHaveLength(waits);
    expect(enqueues).toHaveLength(1);
  });

  test.each([
    ['unreadable', 'readback failed'],
    ['wrong_pr', 'queue readback has no PR'],
    ['bad_oid', 'state=MERGED'],
  ] as const)('a queue readback that stays %s until the window ends exits 5 with its evidence', (state, evidence) => {
    let clock = 0;
    const { result } = run(queueScenario({ queueSequence: ['queued', state] }), { readbackNow: () => clock, readbackWait: (ms) => { clock += ms; } });
    expect(result.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain(evidence);
  });

  test('a queue that neither merges nor removes the PR within 90 minutes exits 5', () => {
    let clock = 0;
    const { result, enqueues } = run(queueScenario({ queueSequence: ['queued'] }), { readbackNow: () => clock, readbackWait: (ms) => { clock += ms; } });
    expect(result.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain(`within ${90 * 60_000} ms; last queue entry ${QUEUE_ENTRY}: AWAITING_CHECKS`);
    expect(enqueues).toHaveLength(1);
  });

  test('--batch is refused when the base requires a merge queue', () => {
    const { result, enqueues } = mergeInProcess(passingScenario({ ...QUEUE_ON, rules: QUEUE_RULES, mergeQueueEnabled: true, headRef: BATCH_REF, compareCommits: BATCH_COMMITS }), { batch: true });
    expect(failureOf(result)).toMatchObject({ exit_code: 4, error: 'base_protection_insufficient' });
    expect(enqueues).toHaveLength(0);
  });
});

describe('publication merge --batch', () => {
  test('the CLI merges a batch once with a merge commit and proves both parents', () => {
    const run = mergeCli(batchScenario(), ['--batch']);
    expect(run.status).toBe(0);
    expect(run.document).toMatchObject({
      merge_commit_sha: MERGE_COMMIT,
      parent_sha: BASE,
      parent_shas: [BASE, HEAD],
      revert: `git revert -m 1 ${MERGE_COMMIT}`,
    });
    expect(run.mutations).toHaveLength(1);
    expect(graphqlVariable(run.mutations[0]!, 'query')).toContain('mergeMethod:MERGE');
    expect(graphqlVariable(run.mutations[0]!, 'commitHeadline')).toBe(`Ship the executor (#${PR})`);
  }, 120_000);

  test('the CLI proves a batch whose compare response carries more patch text than the default spawn buffer', () => {
    const run = mergeCli(batchScenario({ comparePatchBytes: 2 * 1024 * 1024 }), ['--batch']);
    expect(run.document).toMatchObject({ merge_commit_sha: MERGE_COMMIT, parent_shas: [BASE, HEAD] });
    expect(run.mutations).toHaveLength(1);
  }, 120_000);

  test('the CLI refuses --batch on a head ref outside integration/ without a request', () => {
    const run = mergeCli(batchScenario({ headRef: 'feat/executor' }), ['--batch']);
    expect(run.status).toBe(4);
    expect(run.document).toMatchObject({ ok: false, exit_code: 4, error: 'batch_ref_invalid' });
    expect(run.mutations).toHaveLength(0);
  }, 120_000);

  test('a batch commit of its own on the first-parent chain is refused without a request', () => {
    const own = OTHER_COMMIT;
    const { result, mutations } = mergeInProcess(batchScenario({ compareCommits: [
      { sha: own, parents: [BASE] },
      { sha: MEMBER_1, parents: [BASE] },
      { sha: HEAD, parents: [own, MEMBER_1] },
    ] }), { batch: true });
    expect(failureOf(result)).toMatchObject({ exit_code: 4, error: 'batch_has_own_commit' });
    expect(failureOf(result).message).toContain(`commit ${own} on the batch first-parent chain is not a two-parent member merge`);
    expect(mutations).toHaveLength(0);
  });

  test('a provider merge with one parent under --batch is a contradiction, not a merge', () => {
    const { result, mutations } = mergeInProcess(batchScenario({ parents: [BASE] }), { batch: true, readbackWait: () => {} });
    expect(failureOf(result)).toMatchObject({ exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain(`expected exactly [${BASE}, ${HEAD}]`);
    expect(mutations).toHaveLength(1);
  });
});
