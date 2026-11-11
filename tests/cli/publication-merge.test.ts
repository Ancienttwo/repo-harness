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
  POLICY_ON,
  POLICY_QUEUE,
  QUEUE_ENTRY,
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
const scratch = mkdtempSync(join(tmpdir(), 'repo-harness-publication-merge-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface MergeInProcessOptions {
  /** Internal seam: no real wait during the bounded readback window. */
  readonly readbackWait?: (milliseconds: number) => void;
  /** Internal seam: deterministic clock for the bounded readback window. */
  readonly readbackNow?: () => number;
  /** Internal seam: simulate a slow provider call before the fake answer. */
  readonly beforeCall?: (args: readonly string[]) => void;
  /** Fail this provider read before the fake returns its response. */
  readonly failedRead?: string;
  /** Internal seam: observe the timeout passed to each readback call. */
  readonly readbackTimeout?: (milliseconds: number) => void;
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
    expected_head_sha: options.head ?? HEAD, expected_base_sha: options.base ?? BASE,
    gh_runner: (args) => {
      options.beforeCall?.(args);
      calls.push([...args]);
      if (args[1] === options.failedRead) return { status: 1, stdout: '', stderr: 'connection reset' };
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

describe('publication merge uses base protection contexts', () => {
  const contexts = ['ubuntu-latest / Node 22.22.x', 'Governance Verify'];
  const checks = [
    { name: contexts[0]!, bucket: 'pass', link: `https://github.com/${REPOSITORY}/actions/runs/123/job/456` },
    { name: contexts[1]!, bucket: 'pass', link: 'https://ci.example.com/build/42' },
  ];

  test('all protected contexts green allow a different workflow', () => {
    const { result, mutations, calls } = mergeInProcess(passingScenario({ requiredContexts: contexts,
      requiredChecks: checks, requiredRun: { path: '.github/workflows/verify.yml' } }));
    expect(result.exit_code).toBe(0);
    expect(mutations).toHaveLength(1);
    expect(calls.filter(args => args[1]?.endsWith('/branches/main/protection'))).toHaveLength(1);
  });

  test.each([
    ['missing', checks.slice(0, 1), contexts, {}, 'provider_data_incomplete'],
    ['red', [checks[0]!, { ...checks[1]!, bucket: 'fail' }], contexts, {}, 'checks_failed'],
    ['ruleset red', [...checks, { name: 'Ruleset Check', bucket: 'fail', link: 'https://ci.example.com/ruleset/42' }], contexts, {}, 'checks_failed'],
    ['ruleset pending', [...checks, { name: 'Ruleset Check', bucket: 'pending', link: 'https://ci.example.com/ruleset/42' }], contexts, {}, 'checks_pending'],
    ['ruleset Actions head mismatch', [...checks.map(check => ({ ...check, link: 'https://ci.example.com/build/42' })), { name: 'Ruleset Check', bucket: 'pass', link: checks[0]!.link }], contexts, { head_sha: 'f'.repeat(40) }, 'provider_data_incomplete'],
    ['empty protection', checks, [], {}, 'provider_data_incomplete'],
    ['another Actions head', checks, contexts, { head_sha: 'f'.repeat(40) }, 'provider_data_incomplete'],
    ['second Actions context has another head', [{ ...checks[0]!, link: checks[1]!.link }, { ...checks[1]!, link: checks[0]!.link }], contexts, { head_sha: 'f'.repeat(40) }, 'provider_data_incomplete'],
    ['Actions link missing', [{ ...checks[0]!, workflow: 'Verify', link: '' }, checks[1]!], contexts, {}, 'provider_data_incomplete'],
    ['Actions from another repository', [{ ...checks[0]!, link: 'https://github.com/foreign/repo/actions/runs/123/job/456' }, checks[1]!], contexts, {}, 'provider_data_incomplete'],
    ['another Actions PR', checks, contexts, { pull_requests: [{ number: 99, head: { sha: HEAD }, base: { sha: BASE } }] }, 'provider_data_incomplete'],
    ['another Actions base', checks, contexts, { pull_requests: [{ number: PR, head: { sha: HEAD }, base: { sha: 'f'.repeat(40) } }] }, 'provider_data_incomplete'],
  ] as const)('%s refuses the merge', (_label, requiredChecks, requiredContexts, requiredRun, blocker) => {
    const { result, mutations } = mergeInProcess(passingScenario({ requiredChecks, requiredContexts, requiredRun }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'merge_readiness_blocked' });
    expect(failureOf(result).blockers?.map(value => value.code)).toContain(blocker);
    expect(mutations).toHaveLength(0);
  });
});

describe('publication merge refusals send no mergePullRequest', () => {
  test('the removed --batch option fails before any provider call', () => {
    const dir = join(scratch, 'unknown-batch-option');
    mkdirSync(dir);
    const gh = installFakeGh(dir, passingScenario());
    const result = spawnSync('bun', [CLI, 'publication', 'merge', '--repository', REPOSITORY, '--repository-id', REPOSITORY_ID,
      '--pr', String(PR), '--head', HEAD, '--base', BASE, '--json', '--batch'], {
      cwd: dir, encoding: 'utf-8', env: { ...process.env, REPO_HARNESS_GH_BIN: gh.bin }, timeout: 60_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown option '--batch'");
    expect(result.stdout).toBe('');
    expect(gh.calls()).toEqual([]);
  });

  test('a failed live-tip compare exits 4 before any mutation', () => {
    const compare = `repos/${REPOSITORY}/compare/${BASE}...${HEAD}`;
    const { result, calls, mutations, enqueues } = mergeInProcess(passingScenario(QUEUE_ON), { failedRead: compare });
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'provider_unavailable' });
    expect(calls.at(-1)).toContain('{status, behind_by}');
    expect(mutations).toHaveLength(0);
    expect(enqueues).toHaveLength(0);
  });

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

  test('a switch turned off at the live tip of main refuses a PR whose recorded base predates it', () => {
    const { result, calls, mutations } = mergeInProcess(passingScenario({ liveTip: OTHER_COMMIT,
      policyAt: { [OTHER_COMMIT]: policy({ publication: { acceptance_merge: 'off' } }) } }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 3, error: 'acceptance_merge_off' });
    expect(failureOf(result).message).toContain(`live tip ${OTHER_COMMIT}`);
    expect(calls.some((args) => args[1] === `repos/${REPOSITORY}/contents/.ai/harness/policy.json?ref=${BASE}`)).toBe(false);
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

  test('a merge whose queue parent has the switch off exits 5 with the revert command', () => {
    const { result, enqueues } = run(queueScenario({ queueSequence: ['merged'],
      policyAt: { [repo.parent]: policy({ publication: { acceptance_merge: 'off', merge_queue: 'on' } }) } }));
    expect(result.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain(`not on at its parent ${repo.parent}; the owner decides on git revert ${repo.merge}`);
    expect(enqueues).toHaveLength(1);
  });

  test('an unreadable policy at the queue parent exits 5 with the revert command', () => {
    const { result, enqueues } = run(queueScenario(), { failedRead: `repos/${REPOSITORY}/contents/.ai/harness/policy.json?ref=${repo.parent}` });
    expect(result.document).toMatchObject({ ok: false, exit_code: 5, error: 'merge_outcome_unknown' });
    expect(failureOf(result).message).toContain(`policy at its parent ${repo.parent} could not be read: gh api repos/${REPOSITORY}/contents/.ai/harness/policy.json?ref=${repo.parent}: connection reset; the owner decides on git revert ${repo.merge}`);
    expect(enqueues).toHaveLength(1);
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


});

/**
 * A head that is behind the live tip of main: the merge result comes from a
 * real `git merge-tree` of the tip and the head, fetched from a bare `origin`.
 */
describe('publication merge checks the policy in the merge result of a head behind main', () => {
  const POLICY_TIP = policy({ merge_gate: { enabled: true }, publication: { acceptance_merge: 'on', merge_queue: 'off' } });
  const POLICY_PR = policy({ merge_gate: { enabled: true }, publication: { acceptance_merge: 'on', merge_queue: 'on' } });
  let remote: string;
  let base: string;
  const shas: Record<'unrelatedTip' | 'policyTip' | 'cleanHead' | 'policyHead', string> = { unrelatedTip: '', policyTip: '', cleanHead: '', policyHead: '' };
  beforeAll(() => {
    const work = join(scratch, 'behind-work');
    remote = join(scratch, 'behind-remote.git');
    mkdirSync(join(work, '.ai/harness'), { recursive: true });
    git(work, 'init', '-q', '-b', 'main');
    const commit = (file: string, text: string) => {
      writeFileSync(join(work, file), text);
      git(work, 'add', file);
      git(work, 'commit', '-q', '-m', file);
      return git(work, 'rev-parse', 'HEAD');
    };
    commit('a.txt', 'a\n');
    base = commit('.ai/harness/policy.json', POLICY_ON);
    shas.unrelatedTip = commit('c.txt', 'c\n');
    git(work, 'reset', '-q', '--hard', base);
    shas.policyTip = commit('.ai/harness/policy.json', POLICY_TIP);
    git(work, 'reset', '-q', '--hard', base);
    shas.cleanHead = commit('a.txt', 'changed\n');
    git(work, 'reset', '-q', '--hard', base);
    shas.policyHead = commit('.ai/harness/policy.json', POLICY_PR);
    for (const [name, sha] of Object.entries(shas)) git(work, 'branch', name, sha);
    git(scratch, 'clone', '-q', '--bare', work, remote);
  });
  const run = (tip: 'unrelatedTip' | 'policyTip', head: 'cleanHead' | 'policyHead') => {
    git(remote, 'update-ref', 'refs/heads/main', shas[tip]);
    git(remote, 'update-ref', `refs/pull/${PR}/head`, shas[head]);
    const root = join(scratch, `behind-root-${queueRoots++}`);
    mkdirSync(root);
    git(root, 'init', '-q');
    git(root, 'remote', 'add', 'origin', remote);
    const scenario = passingScenario({ head: shas[head], base, liveTip: shas[tip], headBehindTip: true, parents: [base],
      policyAt: { [shas[tip]]: tip === 'policyTip' ? POLICY_TIP : POLICY_ON } });
    return mergeInProcessAt(root, scenario, { readbackWait: () => {}, readbackNow: () => 0, head: shas[head], base });
  };

  test('a head that does not touch the policy merges after main changed the publication subtree', () => {
    const { result, mutations } = run('policyTip', 'cleanHead');
    expect(result).toMatchObject({ exit_code: 0, document: { policy_ref: shas.policyTip, base_sha: base } });
    expect(mutations).toHaveLength(1);
  });

  test.each([
    ['changes the publication subtree', 'unrelatedTip', 'changes the publication policy subtree'],
    ['conflicts with main in the policy file', 'policyTip', 'conflicts in .ai/harness/policy.json'],
  ] as const)('a head that %s is refused', (_label, tip, message) => {
    const { result, mutations } = run(tip, 'policyHead');
    expect(result.document).toMatchObject({ ok: false, exit_code: 4, error: 'publication_policy_changed_in_pr' });
    expect(failureOf(result).message).toContain(message);
    expect(mutations).toHaveLength(0);
  });
});
