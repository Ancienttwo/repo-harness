import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, test } from 'bun:test';

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
  REPOSITORY,
  REPOSITORY_ID,
  fakeGhResponse,
  graphqlVariable,
  installFakeGh,
  isMergeMutation,
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
}

function mergeInProcess(scenario: PublicationMergeScenario, options: MergeInProcessOptions = {}) {
  const calls: string[][] = [];
  let readbacks = 0;
  const result = executePublicationMerge({
    repo_root: scratch, repository: REPOSITORY, provider_repository_id: REPOSITORY_ID, pr_number: PR,
    expected_head_sha: HEAD, expected_base_sha: BASE, batch: options.batch,
    gh_runner: (args) => {
      options.beforeCall?.(args);
      calls.push([...args]);
      const prReadback = args[0] === 'api' && args[1] === `repos/${REPOSITORY}/pulls/${PR}`;
      const response = fakeGhResponse(args, scenario, prReadback ? readbacks++ : 0);
      return { status: response.status as number, stdout: response.stdout, stderr: response.stderr };
    },
    ...(options.readbackWait ? { readback_wait: options.readbackWait } : {}),
    ...(options.readbackNow ? { readback_now: options.readbackNow } : {}),
    ...(options.readbackTimeout ? { readback_timeout: options.readbackTimeout } : {}),
  });
  return { result, calls, mutations: calls.filter(isMergeMutation) };
}

function failureOf(result: PublicationMergeResult): PublicationMergeFailure {
  if (result.exit_code === 0) throw new Error(`expected a refusal, got a merge: ${JSON.stringify(result.document)}`);
  return result.document;
}

let cliRun = 0;
function mergeCli(scenario: PublicationMergeScenario, extraArgs: readonly string[] = []) {
  const dir = join(scratch, `cli-${cliRun++}`);
  mkdirSync(dir);
  const gh = installFakeGh(dir, scenario);
  const result = spawnSync('bun', [CLI, 'publication', 'merge', '--repository', REPOSITORY, '--repository-id', REPOSITORY_ID,
    '--pr', String(PR), '--head', HEAD, '--base', BASE, '--json', ...extraArgs], {
    cwd: dir, encoding: 'utf-8', env: { ...process.env, REPO_HARNESS_GH_BIN: gh.bin }, timeout: 120_000,
  });
  const calls = gh.calls();
  return { status: result.status, document: JSON.parse(result.stdout) as Record<string, any>, stderr: result.stderr, calls, mutations: calls.filter(isMergeMutation) };
}

const policy = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

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
