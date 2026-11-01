import { describe, expect, test } from 'bun:test';
import { selectAttemptTestArtifacts, testArtifactAttempt, type RequiredCheckTestExecutionV1 } from '../../src/core/evidence/test-execution-evidence';
import { readTestExecutionEvidence, readTestExecutionEvidenceAbortable } from '../../src/effects/publication/test-execution-evidence';
import { notStackMemberDetail, projectPullRequestMergeReadiness, type MergeReadinessBlockerCode } from '../../src/core/publication/merge-readiness';

import {
  MergeReadinessError,
  observeProviderReadinessFactsAbortable,
  observeProviderReadinessIdentityAbortable,
  observeProviderReadinessFacts,
  observeProviderReadinessIdentity,
  resolveFleetReadiness,
  collectPullRequestMergeReadiness,
  collectPullRequestMergeReadinessAbortable,
  type PullRequestReadinessInput,
  type PublicationReadinessInput,
} from '../../src/effects/publication/merge-readiness';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const receipt = { provider_repo_id: 'R_readiness_effect', pr_number: 42,
  pr_url: 'https://github.com/example/repo-harness/pull/42', branch: 'codex/readiness-effect', target_ref: 'main' };

const providerIdentity = {
  provider_repo_id: receipt.provider_repo_id,
  repo_name_with_owner: 'example/repo-harness',
  pr_number: receipt.pr_number,
  pr_url: receipt.pr_url,
  state: 'OPEN',
  is_draft: false,
  head_sha: HEAD,
  head_ref: receipt.branch,
  base_sha: BASE,
  base_ref: receipt.target_ref,
  body: 'Provider PR description',
  review_decision: null,
  changed_files: 0,
  mergeable: 'MERGEABLE' as const,
};

const REQUIRED_CI = 'Required / CI';
const REQUIRED_CI_LINK = 'https://github.com/example/repo-harness/actions/runs/123/job/456';

interface FakeGhOptions {
  readonly wrongBase?: boolean;
  /** Policy file text at the base; null is an absent file (404). */
  readonly policy?: string | null;
  /** Changed paths the provider reports for the PR head, as one REST page. */
  readonly changedPaths?: readonly string[];
  /** Explicit REST pages; a full page of 100 entries asks for the next page. */
  readonly changedFilePages?: readonly (readonly { readonly filename: string; readonly previous_filename?: string }[])[];
  /** Buckets `pr checks --required` reports for the required CI check. */
  readonly requiredBucket?: 'pass' | 'pending' | 'fail' | 'skipping' | 'cancel';
  /** The unfiltered `pr checks` answer, used only for the waiver lookup. */
  readonly allChecks?: readonly { readonly name: string; readonly bucket: string }[];
}

function fakeGh(options: FakeGhOptions = {}): NonNullable<PublicationReadinessInput['gh_runner']> {
  const pr = {
    number: receipt.pr_number,
    url: receipt.pr_url,
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD,
    headRefName: receipt.branch,
    baseRefOid: BASE,
    baseRefName: receipt.target_ref,
    body: 'Provider PR description',
    reviewDecision: '',
    changedFiles: options.changedFilePages?.flat().length ?? options.changedPaths?.length ?? 0,
    mergeable: 'MERGEABLE',
  };
  const requiredBucket = options.requiredBucket ?? 'pending';
  const requiredChecks = [{ name: REQUIRED_CI, bucket: requiredBucket, link: REQUIRED_CI_LINK }];
  return (args) => {
    const command = `${args[0]} ${args[1]}`;
    if (args[0] === 'api' && args[1] === 'repos/example/repo-harness') return { status: 0, stdout: JSON.stringify({ id: 1001, node_id: receipt.provider_repo_id, full_name: 'example/repo-harness', default_branch: receipt.target_ref }) };
    if (command === 'repo view') return { status: 0, stdout: JSON.stringify({ id: receipt.provider_repo_id, nameWithOwner: 'example/repo-harness' }) };
    if (command === 'pr view') return { status: 0, stdout: JSON.stringify(pr) };
    if (command === 'pr checks') {
      const checks = args.includes('--required') ? requiredChecks : (options.allChecks ?? requiredChecks);
      return { status: checks.some(check => check.bucket === 'pending') ? 8 : 0, stdout: JSON.stringify(checks) };
    }
    if (command === 'api graphql') return { status: 0, stdout: JSON.stringify(reviewGraph()) };
    if (args[0] === 'api' && args[1]?.startsWith('repos/example/repo-harness/pulls/42/files?')) {
      const page = Number(new URLSearchParams(args[1].slice(args[1].indexOf('?') + 1)).get('page'));
      const pages = options.changedFilePages
        ?? [(options.changedPaths ?? []).map((filename) => ({ filename }))];
      return { status: 0, stdout: JSON.stringify(pages[page - 1] ?? []) };
    }
    if (args[0] === 'api' && args[1] === `repos/example/repo-harness/contents/.ai/harness/policy.json?ref=${BASE}`) {
      if (options.policy === undefined || options.policy === null) return { status: 1, stdout: JSON.stringify({ status: '404', message: 'Not Found' }) };
      return { status: 0, stdout: JSON.stringify({ type: 'file', path: '.ai/harness/policy.json', encoding: 'base64', content: Buffer.from(options.policy).toString('base64') }) };
    }
    if (args[0] === 'api' && args[1]?.includes('/contents/.github/workflows/ci-report.yml')) return { status: 1, stdout: JSON.stringify({ status: '404', message: 'Not Found' }) };
    if (command === 'api repos/example/repo-harness/actions/runs/123') {
      return { status: 0, stdout: JSON.stringify({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD,
        status: 'completed', conclusion: 'success',
        pull_requests: [{ number: receipt.pr_number, head: { sha: HEAD }, base: { sha: options.wrongBase ? '9'.repeat(40) : BASE } }] }) };
    }
    return { status: 2, stdout: '', stderr: `unexpected fake gh args: ${args.join(' ')}` };
  };
}



function reviewGraph() {
  return { data: { node: { id: receipt.provider_repo_id, pullRequest: {
    number: receipt.pr_number, headRefOid: HEAD, baseRefOid: BASE, reviewDecision: null,
    latestOpinionatedReviews: { pageInfo: { hasNextPage: false }, nodes: [] as { state: string }[] },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] as { isResolved: boolean }[] },
  } } } };
}

const input: PullRequestReadinessInput = { repo_root: '/tmp/merge-readiness-effect-fixture', repository: 'example/repo-harness',
  provider_repository_id: '1001', pr_number: 42, expected_head_sha: HEAD, expected_base_sha: BASE };


function passingGh(): NonNullable<PublicationReadinessInput['gh_runner']> {
  const source = fakeGh();
  return args => {
    const result = source(args);
    if (args[0] === 'pr' && args[1] === 'checks') return { status: 0, stdout: JSON.stringify([{ name: 'Required / CI', bucket: 'pass', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' }]) };
    if (args[1]?.includes('/actions/runs/')) return { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), status: 'completed', conclusion: 'success' }) };
    return result;
  };
}

interface StackParent {
  readonly number: number;
  readonly head_ref: string;
  readonly head_sha: string;
  readonly base_ref: string;
  readonly base_sha: string;
  readonly state?: 'OPEN' | 'CLOSED' | 'MERGED';
  readonly cross_repository?: boolean;
}

/** The member PR keeps its own identity; only its base ref and the chain list differ. */
function stackGh(options: {
  readonly member_base_ref: string;
  readonly member_base_sha?: string;
  readonly parents: readonly StackParent[];
  readonly default_branch?: string;
}): NonNullable<PublicationReadinessInput['gh_runner']> {
  const source = passingGh();
  const memberBaseSha = options.member_base_sha ?? BASE;
  const defaultBranch = options.default_branch ?? 'main';
  return (args) => {
    if (args[0] === 'pr' && args[1] === 'list') {
      const head = args[args.indexOf('--head') + 1];
      return { status: 0, stdout: JSON.stringify(options.parents.filter((parent) => parent.head_ref === head).map((parent) => ({
        number: parent.number, state: parent.state ?? 'OPEN',
        headRefOid: parent.head_sha, headRefName: parent.head_ref,
        baseRefOid: parent.base_sha, baseRefName: parent.base_ref,
        isCrossRepository: parent.cross_repository ?? false,
      }))) };
    }
    const result = source(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      return { ...result, stdout: JSON.stringify({
        ...JSON.parse(result.stdout), baseRefOid: memberBaseSha, baseRefName: options.member_base_ref,
      }) };
    }
    if (args[0] === 'api' && args[1] === 'repos/example/repo-harness') {
      return { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), default_branch: defaultBranch }) };
    }
    return result;
  };
}

describe('explicit PR readiness effects', () => {
  test('rejects the retired publication selector even alongside an explicit PR', () => {
    expect(() => collectPullRequestMergeReadiness({ ...input, publication_id: 'retired' } as PullRequestReadinessInput)).toThrow('publication_id');
  });

  test.each(['stable', 'one-torn', 'torn', 'body-only'] as const)('fences provider identity and retries once: %s', scenario => {
    const source = passingGh(); let reads = 0;
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: args => {
      const result = source(args);
      if (args[0] !== 'pr' || args[1] !== 'view') return result;
      reads++;
      const changed = scenario === 'torn' ? reads % 2 === 0 : scenario === 'one-torn' && reads === 2;
      return { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout),
        ...(changed ? { headRefOid: 'd'.repeat(40) } : {}), body: scenario === 'body-only' ? `body ${reads}` : '' }) };
    } });
    expect(verdict.ready).toBe(scenario !== 'torn');
    expect(verdict.expected_head_sha).toBe(HEAD); expect(verdict.expected_base_sha).toBe(BASE);
    expect(reads).toBe(['torn','one-torn'].includes(scenario) ? 4 : 2);
    if (scenario === 'torn') expect(verdict.blockers).toContainEqual({ code: 'changed_during_read', attention_owner: 'external' });
    expect('publication_id' in verdict).toBe(false);
  });
  test('unavailable and incomplete responses cannot authorize readiness', () => {
    for (const response of [{ status: 1, stdout: '' }, { status: 0, stdout: '{}' }]) {
      const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: () => response });
      expect(verdict.ready).toBe(false);
      expect(verdict.blockers[0]?.code).toBe(response.status ? 'provider_unavailable' : 'provider_data_incomplete');
    }
  });
  test('pending exit 8 and mismatched CI base remain blocked', async () => {
    expect(collectPullRequestMergeReadiness({ ...input, gh_runner: fakeGh() }).blockers.map(b => b.code)).toContain('checks_pending');
    const passing = passingGh();
    const wrongBase = collectPullRequestMergeReadiness({ ...input, gh_runner: args => {
      const result = passing(args);
      if (args[0] !== 'api' || args[1] !== 'repos/example/repo-harness/actions/runs/123') return result;
      const run = JSON.parse(result.stdout);
      run.pull_requests[0].base.sha = '9'.repeat(40);
      return { ...result, stdout: JSON.stringify(run) };
    } });
    expect(wrongBase.ready).toBe(false);
    expect(wrongBase.blockers).toEqual([{ code: 'provider_data_incomplete', attention_owner: 'external' }]);
    let calls = 0; const controller = new AbortController(); controller.abort();
    const verdict = await collectPullRequestMergeReadinessAbortable({ ...input, signal: controller.signal,
      gh_runner_async: async args => { calls++; return fakeGh()(args); } });
    expect(verdict.blockers.map(b => b.code)).toContain('provider_unavailable'); expect(calls).toBe(0);
  });
  test('explicit fleet order isolates provider failures', () => {
    const source = passingGh(); let failed = false;
    const { repo_root, ...selection } = input;
    const aggregate = resolveFleetReadiness({ repo_root, pull_requests: [selection, selection], gh_runner: args => {
      if (!failed) { failed = true; return { status: 1, stdout: '' }; } return source(args);
    } });
    expect(aggregate.pull_requests.map(item => item.pr_number)).toEqual([42,42]);
    expect(aggregate.pull_requests[0]!.blockers[0]!.code).toBe('provider_unavailable');
    expect(aggregate.pull_requests[1]!.ready).toBe(true);
  });
});

describe('stacked pull request readiness reads', () => {
  const PARENT_HEAD = 'c'.repeat(40);
  const FINAL_BASE = 'd'.repeat(40);
  const ONE_LEVEL: StackParent = {
    number: 41, head_ref: 'feat/base', head_sha: PARENT_HEAD, base_ref: 'main', base_sha: FINAL_BASE,
  };

  test('a non-stack PR keeps the current ready verdict and reads no chain', () => {
    const calls: string[][] = [];
    const source = passingGh();
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: args => { calls.push([...args]); return source(args); } });
    expect(verdict.ready).toBe(true);
    expect(verdict.stack).toEqual(notStackMemberDetail());
    expect(calls.some(args => args[0] === 'pr' && args[1] === 'list')).toBe(false);
  });

  test('a one-level stack is blocked with the observed chain and no own-base facts', async () => {
    const source = stackGh({ member_base_ref: ONE_LEVEL.head_ref, parents: [ONE_LEVEL] });
    const calls: string[][] = [];
    const verdict = collectPullRequestMergeReadiness({
      ...input, gh_runner: args => { calls.push([...args]); return source(args); },
    });
    const expectedStack = {
      member: true, depth: 1,
      chain: [
        { pr_number: 42, head_ref: receipt.branch, head_sha: HEAD, base_ref: ONE_LEVEL.head_ref, base_sha: BASE },
        { pr_number: 41, head_ref: ONE_LEVEL.head_ref, head_sha: PARENT_HEAD, base_ref: 'main', base_sha: FINAL_BASE },
      ],
      final_base_sha: FINAL_BASE, status: 'complete' as const,
    };
    expect(verdict.ready).toBe(false);
    expect(verdict.attention_owner).toBe('agent');
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member']);
    expect(verdict.stack).toEqual(expectedStack);
    expect(verdict.check_failures).toEqual([]);
    expect(verdict.required_check_coverage).toBeNull();
    // The member is blocked without any own-base check, review or coverage read.
    expect(calls.some(args => args[0] === 'pr' && args[1] === 'checks')).toBe(false);
    expect(calls.some(args => args[0] === 'api' && (args[1]?.includes('/contents/') || args[1] === 'graphql'))).toBe(false);

    const abortable = await collectPullRequestMergeReadinessAbortable({ ...input, gh_runner_async: async args => source(args) });
    expect(abortable.stack).toEqual(expectedStack);
    expect(abortable.blockers).toEqual(verdict.blockers);
  });

  test('a multi-level chain is ordered from the PR to the default branch', () => {
    const parent: StackParent = {
      number: 41, head_ref: 'feat/b', head_sha: PARENT_HEAD, base_ref: 'feat/a', base_sha: 'e'.repeat(40),
    };
    const root: StackParent = {
      number: 40, head_ref: 'feat/a', head_sha: 'e'.repeat(40), base_ref: 'main', base_sha: FINAL_BASE,
    };
    const verdict = collectPullRequestMergeReadiness({
      ...input, gh_runner: stackGh({ member_base_ref: parent.head_ref, parents: [parent, root] }),
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.stack.status).toBe('complete');
    expect(verdict.stack.depth).toBe(2);
    expect(verdict.stack.chain.map((entry) => entry.pr_number)).toEqual([42, 41, 40]);
    expect(verdict.stack.chain.map((entry) => entry.head_ref)).toEqual([receipt.branch, 'feat/b', 'feat/a']);
    expect(verdict.stack.final_base_sha).toBe(FINAL_BASE);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member']);
  });

  test('a cycle fails closed with the proven edges', () => {
    const parent: StackParent = {
      number: 41, head_ref: 'feat/a', head_sha: PARENT_HEAD, base_ref: 'feat/b', base_sha: 'e'.repeat(40),
    };
    const root: StackParent = {
      number: 40, head_ref: 'feat/b', head_sha: 'e'.repeat(40), base_ref: 'feat/a', base_sha: 'f'.repeat(40),
    };
    const verdict = collectPullRequestMergeReadiness({
      ...input, gh_runner: stackGh({ member_base_ref: parent.head_ref, parents: [parent, root] }),
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.stack.status).toBe('cycle');
    // #40 points back to feat/a before it can become a valid ancestor, so the
    // proven chain stops at the parent that introduced the repeating edge.
    expect(verdict.stack.depth).toBe(1);
    expect(verdict.stack.chain.map((entry) => entry.pr_number)).toEqual([42, 41]);
    expect(verdict.stack.final_base_sha).toBeNull();
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member', 'stack_cycle']);
  });

  test.each([
    ['missing', [], 'base_pr_missing', 'stack_base_pr_missing'],
    ['closed', [{ ...ONE_LEVEL, state: 'CLOSED' as const }], 'base_pr_not_open', 'stack_base_pr_not_open'],
    ['foreign', [{ ...ONE_LEVEL, cross_repository: true }], 'foreign_pr', 'stack_foreign_pr'],
  ] as const)('a %s base PR fails closed', (_label, parents, status, code) => {
    const verdict = collectPullRequestMergeReadiness({
      ...input, gh_runner: stackGh({ member_base_ref: ONE_LEVEL.head_ref, parents }),
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.stack.status).toBe(status);
    expect(verdict.stack.chain.map((entry) => entry.pr_number)).toEqual([42]);
    expect(verdict.stack.depth).toBe(0);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member', code]);
  });

  test('the depth cap stops a chain that never reaches the default branch', () => {
    const parents: StackParent[] = Array.from({ length: 21 }, (_, index) => ({
      number: 1000 + index,
      head_ref: `feat/${index}`,
      head_sha: (index + 10).toString(16).padStart(2, '0').repeat(20),
      base_ref: `feat/${index + 1}`,
      base_sha: (index + 11).toString(16).padStart(2, '0').repeat(20),
    }));
    const verdict = collectPullRequestMergeReadiness({
      ...input, gh_runner: stackGh({ member_base_ref: 'feat/0', parents }),
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.stack.status).toBe('depth_exceeded');
    expect(verdict.stack.depth).toBe(20);
    expect(verdict.stack.chain).toHaveLength(21);
    expect(verdict.stack.final_base_sha).toBeNull();
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member', 'stack_depth_exceeded']);
  });

  test('a base that moves during the chain read is changed_during_read', () => {
    const source = stackGh({ member_base_ref: ONE_LEVEL.head_ref, parents: [ONE_LEVEL] });
    let reads = 0;
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: (args) => {
      if (args[0] !== 'pr' || args[1] !== 'list') return source(args);
      reads++;
      const observed = source(args);
      return { ...observed, stdout: JSON.stringify(JSON.parse(observed.stdout).map((entry: Record<string, unknown>) => ({
        ...entry, headRefOid: reads.toString(16).padStart(40, '0'),
      }))) };
    } });
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['changed_during_read']);
    expect(verdict.stack.status).toBe('unobserved');
    expect(reads).toBeGreaterThanOrEqual(4);
  });

  test('caller-supplied chain data cannot turn a member into a ready verdict', () => {
    const forged = { member: false, depth: 0, chain: [], final_base_sha: null, status: 'not_member' };
    const verdict = collectPullRequestMergeReadiness({
      ...input, stack: forged, gh_runner: stackGh({ member_base_ref: ONE_LEVEL.head_ref, parents: [ONE_LEVEL] }),
    } as PullRequestReadinessInput);
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual(['stack_member']);
    expect(verdict.stack.chain.map((entry) => entry.pr_number)).toEqual([42, 41]);
  });
});

test.each([
  ['missing', undefined], ['whitespace', ' '], ['unknown', 'UNKNOWN'],
  ['boolean', false], ['number', 0], ['array', ['APPROVED']], ['object', { decision: 'APPROVED' }],
] as const)('both identity adapters reject malformed CLI reviewDecision: %s', async (_label, decision) => {
  const source = fakeGh();
  const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
    const observed = source(args);
    return args[0] === 'pr' && args[1] === 'view'
      ? { ...observed, stdout: JSON.stringify({ ...JSON.parse(observed.stdout), reviewDecision: decision }) }
      : observed;
  };
  expect(() => observeProviderReadinessIdentity({ ...input, gh_runner }))
    .toThrow('provider PR reviewDecision is unknown');
  await expect(observeProviderReadinessIdentityAbortable({
    ...input, gh_runner_async: async args => gh_runner(args),
  })).rejects.toMatchObject({ code: 'provider_data_incomplete' });
});

test.each([null, '', 'APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED'] as const)(
  'both identity adapters accept valid CLI reviewDecision %j', async decision => {
    const source = fakeGh();
    const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
      const observed = source(args);
      return args[0] === 'pr' && args[1] === 'view'
        ? { ...observed, stdout: JSON.stringify({ ...JSON.parse(observed.stdout), reviewDecision: decision }) }
        : observed;
    };
    const synchronous = observeProviderReadinessIdentity({ ...input, gh_runner });
    const abortable = await observeProviderReadinessIdentityAbortable({
      ...input, gh_runner_async: async args => gh_runner(args),
    });
    expect(synchronous.review_decision).toBe(decision === '' ? null : decision);
    expect(abortable).toEqual(synchronous);
  },
);

test.each([
  ['missing', undefined], ['empty', ''], ['unknown', 'UNKNOWN'], ['changed', 'APPROVED'],
] as const)('both facts adapters refuse GraphQL reviewDecision %s with empty CLI decision', async (_label, decision) => {
  const source = fakeGh();
  const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
    if (args[0] !== 'api' || args[1] !== 'graphql') return source(args);
    const graph = reviewGraph();
    Object.assign(graph.data.node.pullRequest, { reviewDecision: decision });
    return { status: 0, stdout: JSON.stringify(graph) };
  };
  const identity = observeProviderReadinessIdentity({ ...input, gh_runner });
  expect(() => observeProviderReadinessFacts(identity, receipt, { ...input, gh_runner }))
    .toThrow('provider review decision changed during read');
  const asyncInput = { ...input, gh_runner_async: async (args: readonly string[]) => gh_runner(args) };
  const asyncIdentity = await observeProviderReadinessIdentityAbortable(asyncInput);
  await expect(observeProviderReadinessFactsAbortable(asyncIdentity, receipt, asyncInput))
    .rejects.toMatchObject({ code: 'provider_data_incomplete' });
});

test.each([
  ['trunk', 'trunk', true], ['trunk', 'main', false], [undefined, 'main', false], ['', 'main', false],
] as const)('identity binds the PR base to the repository default branch %j (base %s)', async (defaultBranch, baseRef, accepted) => {
  const source = fakeGh();
  const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
    const observed = source(args);
    if (args[0] === 'pr' && args[1] === 'view') return { ...observed, stdout: JSON.stringify({ ...JSON.parse(observed.stdout), baseRefName: baseRef }) };
    if (args[0] === 'api' && args[1] === 'repos/example/repo-harness') {
      const { default_branch: _ignored, ...repository } = JSON.parse(observed.stdout);
      return { ...observed, stdout: JSON.stringify(defaultBranch === undefined ? repository : { ...repository, default_branch: defaultBranch }) };
    }
    return observed;
  };
  const asyncRead = () => observeProviderReadinessIdentityAbortable({ ...input, gh_runner_async: async args => gh_runner(args) });
  if (accepted) {
    expect(observeProviderReadinessIdentity({ ...input, gh_runner }).base_ref).toBe(baseRef);
    expect((await asyncRead()).base_ref).toBe(baseRef);
  } else {
    expect(() => observeProviderReadinessIdentity({ ...input, gh_runner })).toThrow(MergeReadinessError);
    await expect(asyncRead()).rejects.toMatchObject({ code: 'provider_data_incomplete' });
  }
});

test('ordinary PR consumer uses trusted CI head/base once and needs no local artifact or marker', () => {
  const source = fakeGh(); let ciCalls = 0;
  const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
    const observed = source(args);
    if (args[0] === 'pr' && args[1] === 'view') return { ...observed, stdout: JSON.stringify({ ...JSON.parse(observed.stdout), body: 'Ordinary PR goal/change/verification/risk/rollback' }) };
    if (args[0] === 'pr' && args[1] === 'checks') { ciCalls++; return { status: 0, stdout: JSON.stringify([{ name: 'Required / CI', bucket: 'pass', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' }]) }; }
    if (args[0] === 'api' && args[1]?.includes('/actions/runs/')) return { ...observed, stdout: JSON.stringify({ ...JSON.parse(observed.stdout), status: 'completed', conclusion: 'success' }) };
    return observed;
  };
  const verdict = collectPullRequestMergeReadiness({ repository: 'example/repo-harness', provider_repository_id: '1001', repo_root: '/tmp/absent-local-artifacts', pr_number: 42,
    expected_head_sha: HEAD, expected_base_sha: BASE, gh_runner });
  expect(verdict.ready).toBe(true); expect(ciCalls).toBe(1);
  expect('publication_id' in verdict).toBe(false);
  const moved = collectPullRequestMergeReadiness({ repository: 'example/repo-harness', provider_repository_id: '1001', repo_root: '/tmp/absent-local-artifacts', pr_number: 42,
    expected_head_sha: HEAD, expected_base_sha: '9'.repeat(40), gh_runner });
  expect(moved.blockers.map(blocker => blocker.code)).toContain('base_moved_since_verification');
});

test.each(['changes', 'threads', 'dismissed', 'approved', 'outdated-unresolved', 'review-truncated', 'threads-truncated', 'malformed', 'graphql-error', 'wrong-head', 'wrong-pr', 'wrong-repo', 'review-churn', 'unavailable'])('ordinary and abortable consumers enforce provider review state: %s', async scenario => {
  const source = fakeGh();
  const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
    const observed = source(args);
    if (args[0] === 'pr' && args[1] === 'checks') return { status: 0, stdout: JSON.stringify([{ name: 'Required / CI', bucket: 'pass', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' }]) };
    if (args[1]?.includes('/actions/runs/')) return { ...observed, stdout: JSON.stringify({ ...JSON.parse(observed.stdout), status: 'completed', conclusion: 'success' }) };
    if (args[0] !== 'api' || args[1] !== 'graphql') return observed;
    const graph = reviewGraph();
    const pr = graph.data.node.pullRequest;
    if (scenario === 'changes') pr.latestOpinionatedReviews.nodes = [{ state: 'CHANGES_REQUESTED' }];
    if (scenario === 'dismissed') pr.latestOpinionatedReviews.nodes = [{ state: 'DISMISSED' }];
    if (scenario === 'approved') pr.latestOpinionatedReviews.nodes = [{ state: 'APPROVED' }];
    if (scenario === 'threads' || scenario === 'outdated-unresolved') pr.reviewThreads.nodes = [{ isResolved: false }];
    if (scenario === 'outdated-unresolved') Object.assign(pr.reviewThreads.nodes[0]!, { isOutdated: true });
    if (scenario === 'review-truncated') pr.latestOpinionatedReviews.pageInfo.hasNextPage = true;
    if (scenario === 'threads-truncated') pr.reviewThreads.pageInfo.hasNextPage = true;
    if (scenario === 'malformed') pr.latestOpinionatedReviews.nodes = [{ state: 'UNKNOWN' }];
    if (scenario === 'wrong-head') pr.headRefOid = '9'.repeat(40);
    if (scenario === 'wrong-pr') pr.number = 43;
    if (scenario === 'wrong-repo') graph.data.node.id = 'R_other';
    if (scenario === 'review-churn') Object.assign(pr, { reviewDecision: 'CHANGES_REQUESTED' });
    if (scenario === 'graphql-error') Object.assign(graph, { errors: [{ message: 'partial response' }] });
    if (scenario === 'unavailable') return { status: 1, stdout: '', stderr: 'provider unavailable' };
    return { status: 0, stdout: JSON.stringify(graph) };
  };
  const verdict = collectPullRequestMergeReadiness({ repository: 'example/repo-harness', provider_repository_id: '1001', repo_root: '/tmp/absent-local-artifacts', pr_number: 42,
    expected_head_sha: HEAD, expected_base_sha: BASE, gh_runner });
  const expected: MergeReadinessBlockerCode[] = scenario === 'changes' ? ['changes_requested']
    : ['threads', 'outdated-unresolved'].includes(scenario) ? ['unresolved_threads']
    : ['dismissed', 'approved'].includes(scenario) ? []
    : [scenario === 'unavailable' ? 'provider_unavailable' : 'provider_data_incomplete'];
  expect(verdict.blockers.map(blocker => blocker.code)).toEqual(expected);
  const asyncInput = { ...input, gh_runner_async: async (args: readonly string[]) => gh_runner(args) };
  if (expected.some(code => code.startsWith('provider_'))) {
    await expect(observeProviderReadinessFactsAbortable(providerIdentity, receipt, asyncInput)).rejects.toMatchObject({ code: expected[0] });
  } else {
    const facts = await observeProviderReadinessFactsAbortable(providerIdentity, receipt, asyncInput);
    expect(facts.review_decision).toBe(scenario === 'changes' ? 'CHANGES_REQUESTED' : null);
    expect(facts.unresolved_thread_count).toBe(expected[0] === 'unresolved_threads' ? 1 : 0);
  }
});

test('ordinary provider collector blocks decision changes after normalized empty CLI reads', () => {
  const source = fakeGh();
  let identityReads = 0;
  const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
    const observed = source(args);
    if (args[0] === 'pr' && args[1] === 'view') return { ...observed, stdout: JSON.stringify({
      ...JSON.parse(observed.stdout), reviewDecision: ++identityReads % 2 ? '' : 'APPROVED',
    }) };
    if (args[0] === 'pr' && args[1] === 'checks') return { status: 0, stdout: JSON.stringify([
      { name: 'Required / CI', bucket: 'pass', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' },
    ]) };
    if (args[1]?.includes('/actions/runs/')) return { ...observed, stdout: JSON.stringify({
      ...JSON.parse(observed.stdout), status: 'completed', conclusion: 'success',
    }) };
    return observed;
  };
  const verdict = collectPullRequestMergeReadiness({ ...input, repository: 'example/repo-harness', provider_repository_id: '1001', pr_number: 42,
    expected_head_sha: HEAD, expected_base_sha: BASE, gh_runner });
  expect(verdict.blockers.map(blocker => blocker.code)).toEqual(['changed_during_read']);
  expect(identityReads).toBe(4);
});

// Provider commit responses come from real Git objects, including root and merge commits.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('rollback boundary binds the current base to one merged main PR and one real parent for both adapters', async () => {
  const root = mkdtempSync(join(tmpdir(), 'readiness-boundary-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-qb', 'main'); git('config', 'user.name', 'Boundary fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'feature'), 'before'); git('add', '.'); git('commit', '-qm', 'pre-reporter history'); const before = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'feature'), 'after'); git('add', '.'); git('commit', '-qm', 'reporter cutover'); const base = git('rev-parse', 'HEAD');
    const tree = git('rev-parse', 'HEAD^{tree}');
    const merge = git('commit-tree', tree, '-p', before, '-p', base, '-m', 'merge fixture');
    git('checkout', '-qb', 'rebase-pr', before);
    for (const file of ['first', 'second']) { writeFileSync(join(root, file), file); git('add', '.'); git('commit', '-qm', file); }
    git('rebase', 'main'); const rebased = git('rev-parse', 'HEAD');
    const rebaseCount = Number(git('rev-list', '--count', `${base}..${rebased}`));
    expect(rebaseCount).toBe(2);
    git('checkout', '-q', 'main'); git('merge', '--squash', 'rebase-pr'); git('commit', '-qm', 'multi-commit squash');
    const squashed = git('rev-parse', 'HEAD');
    expect(git('rev-list', '--count', `${base}..${squashed}`)).toBe('1');
    const commitData = (sha: string) => ({ sha, parents: git('rev-list', '--parents', '-n', '1', sha).split(' ').slice(1).map(sha => ({ sha })) });
    const mergedPR = { number: 17, merged_at: '2026-10-03T00:00:00Z', merge_commit_sha: base, base: { ref: 'main' } };
    const scenarios = ['ready', '404', 'forbidden', 'activation-malformed', 'activation-error', 'false-404', 'failed-file', 'missing-pr', 'wrong-main', 'wrong-merge-sha', 'unmerged-pr', 'ambiguous-pr', 'bad-number', 'unsafe-number', 'incomplete-pagination', 'malformed-associations', 'malformed-association', 'bad-merged-at', 'association-error', 'root', 'multiple-parents', 'batch-merge', 'batch-head-mismatch', 'zero-parent', 'same-parent', 'mismatched-commit', 'zero-base', 'commit-error', 'multi-commit-rebase', 'multi-commit-squash', 'parent-other-pr', 'parent-empty', 'parent-malformed', 'parent-malformed-entry', 'parent-missing-number', 'parent-unsafe-number', 'parent-full-page', 'parent-error', 'detail-error', 'wrong-detail-pr', 'wrong-detail-sha', 'unmerged-detail', 'wrong-detail-base', 'malformed-detail'];
    for (const scenario of scenarios) {
      const batch = scenario.startsWith('batch-');
      const observedBase = scenario === 'zero-base' ? '0'.repeat(40) : scenario === 'root' ? before : scenario === 'multiple-parents' || batch ? merge : scenario === 'multi-commit-rebase' ? rebased : scenario === 'multi-commit-squash' ? squashed : base;
      const observedParent = scenario === 'multi-commit-rebase' ? git('rev-parse', `${rebased}^`) : scenario === 'multi-commit-squash' ? base : before;
      const identity = { ...providerIdentity, base_sha: observedBase, changed_files: 0 };
      const requests: string[] = [];
      const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
        const path = args[1] ?? ''; requests.push(args.join(' '));
        const json = (value: unknown, status = 0) => ({ status, stdout: JSON.stringify(value) });
        const error = () => ({ status: 2, stdout: '', stderr: 'provider unavailable' });
        if (path === 'graphql') { const graph = reviewGraph(); graph.data.node.pullRequest.baseRefOid = observedBase; return json(graph); }
        if (args[0] === 'pr') return json([{ name: 'Required / CI', bucket: 'pass', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' }]);
        if (path.includes('/actions/runs/123')) return json({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD, status: 'completed', conclusion: 'success', pull_requests: [{ number: 42, head: { sha: HEAD }, base: { sha: observedBase } }] });
        if (path === `repos/example/repo-harness/contents/.ai/harness/policy.json?ref=${observedBase}`) {
          // No coverage block in this scenario: the pre-#1205 behavior must hold.
          return json({ status: '404', message: 'Not Found' }, 1);
        }
        if (path.includes('/contents/')) {
          expect(path).toBe(`repos/example/repo-harness/contents/.github/workflows/ci-report.yml?ref=${observedBase}`);
          if (scenario === '404') return json({ status: '404', message: 'Not Found' }, 1);
          if (scenario === 'forbidden') return json({ status: '403', message: 'Forbidden' }, 1);
          if (scenario === 'activation-malformed') return json({ type: 'dir', path: '.github/workflows/ci-report.yml' });
          if (scenario === 'activation-error') return error();
          if (scenario === 'false-404') return json({ status: '404' });
          if (scenario === 'failed-file') return json({ type: 'file', path: '.github/workflows/ci-report.yml', sha: tree }, 1);
          return json({ type: 'file', path: '.github/workflows/ci-report.yml', sha: tree });
        }
        if (path.includes(`/commits/${observedBase}/pulls`)) {
          expect(path).toBe(`repos/example/repo-harness/commits/${observedBase}/pulls?per_page=100`);
          if (scenario === 'association-error') return error();
          if (scenario === 'malformed-associations') return json({ nodes: [mergedPR] });
          if (scenario === 'missing-pr') return json([]);
          if (scenario === 'malformed-association') return json([mergedPR, null]);
          if (scenario === 'bad-merged-at') return json([{ ...mergedPR, merged_at: true }]);
          if (scenario === 'ambiguous-pr') return json([mergedPR, { ...mergedPR, number: 18 }]);
          if (scenario === 'incomplete-pagination') return json(Array.from({ length: 100 }, () => mergedPR));
          return json([{ ...mergedPR, merge_commit_sha: observedBase,
            ...(scenario === 'wrong-main' ? { base: { ref: 'feature' } } : {}),
            ...(scenario === 'wrong-merge-sha' ? { merge_commit_sha: before } : {}),
            ...(scenario === 'unmerged-pr' ? { merged_at: null } : {}),
            ...(scenario === 'bad-number' ? { number: 0 } : {}),
            ...(scenario === 'unsafe-number' ? { number: Number.MAX_SAFE_INTEGER + 1 } : {}),
          }]);
        }
        if (path === 'repos/example/repo-harness/pulls/17') {
          if (scenario === 'detail-error') return error();
          if (scenario === 'malformed-detail') return json(null);
          // The batch PR head is the merge commit's second parent; `multiple-parents` is an ordinary feature PR.
          return json({ ...mergedPR, merged: true, merge_commit_sha: observedBase,
            head: { ref: batch ? 'integration/1287-batch-3' : 'feat/boundary', sha: scenario === 'batch-head-mismatch' ? before : base },
            commits: ['multi-commit-rebase', 'multi-commit-squash'].includes(scenario) ? rebaseCount : Number(git('rev-list', '--count', `${before}..${base}`)),
            ...(scenario === 'wrong-detail-pr' ? { number: 18 } : {}),
            ...(scenario === 'wrong-detail-sha' ? { merge_commit_sha: before } : {}),
            ...(scenario === 'unmerged-detail' ? { merged: false } : {}),
            ...(scenario === 'wrong-detail-base' ? { base: { ref: 'feature' } } : {}),
          });
        }
        if (path === `repos/example/repo-harness/commits/${observedParent}/pulls?per_page=100`) {
          if (scenario === 'parent-error') return error();
          if (scenario === 'parent-malformed') return json({ nodes: [] });
          if (scenario === 'parent-malformed-entry') return json([null]);
          if (scenario === 'parent-missing-number') return json([{}]);
          if (scenario === 'parent-unsafe-number') return json([{ number: Number.MAX_SAFE_INTEGER + 1 }]);
          if (scenario === 'parent-full-page') return json(Array.from({ length: 100 }, () => ({ number: 16 })));
          if (scenario === 'multi-commit-rebase') return json([{ ...mergedPR, merge_commit_sha: rebased }]);
          return json(scenario === 'parent-empty' ? [] : [{ ...mergedPR, number: 16, merge_commit_sha: observedParent }]);
        }
        if (path.includes(`/git/commits/${observedBase}`)) {
          if (scenario === 'commit-error') return error();
          const commit = commitData(observedBase);
          if (scenario === 'zero-parent') commit.parents = [{ sha: '0'.repeat(40) }];
          if (scenario === 'same-parent') commit.parents = [{ sha: base }];
          if (scenario === 'mismatched-commit') commit.sha = before;
          return json(commit);
        }
        throw Error(`Unexpected provider call: ${args.join(' ')}`);
      };
      const syncRead = () => observeProviderReadinessFacts(identity, receipt, { ...input, repo_root: root, gh_runner });
      const asyncRead = () => observeProviderReadinessFactsAbortable(identity, receipt, { ...input, repo_root: root, gh_runner_async: async args => gh_runner(args) });
      if (['ready', '404', 'multi-commit-squash', 'parent-other-pr', 'parent-empty', 'batch-merge'].includes(scenario)) {
        const expected = scenario === '404' ? { status: 'not_active' as const } : { status: 'ready' as const, pr_number: 17, before_sha: observedParent, after_sha: observedBase };
        const syncFacts = syncRead(); const asyncFacts = await asyncRead();
        expect(syncFacts.rollback_boundary).toEqual(expected);
        expect(asyncFacts.rollback_boundary).toEqual(expected);
        for (const provider of [syncFacts, asyncFacts]) {
          const verdict = projectPullRequestMergeReadiness({ expected_head_sha: HEAD, expected_base_sha: observedBase,
            integration_mode: 'unmerged', observation: 'stable', provider, stack: notStackMemberDetail() });
          expect(verdict.ready).toBe(true); expect(verdict.blockers).toEqual([]);
        }
        if (scenario === '404') expect(requests.some(path => path.includes('/pulls') || path.includes('/git/commits/'))).toBe(false);
      } else {
        const code = scenario.endsWith('-error') || ['forbidden', 'failed-file'].includes(scenario) ? 'provider_unavailable' : 'provider_data_incomplete';
        try { syncRead(); throw Error(`unexpected readiness: ${scenario}`); } catch (error) { expect(error).toMatchObject({ code }); }
        await expect(asyncRead()).rejects.toMatchObject({ code });
        if (scenario === 'multi-commit-rebase') {
          expect(syncRead).toThrow('Automatic rollback cannot revert only the last commit of multi-commit rebase PR #17');
          await expect(asyncRead()).rejects.toThrow('Automatic rollback cannot revert only the last commit of multi-commit rebase PR #17');
        }
      }
      expect(requests.some(path => path.includes('/git/ref/tags/') || path.includes('/git/tags/'))).toBe(false);
    }
    git('checkout', '-qb', 'squash-rollback', squashed); git('revert', '--no-edit', squashed);
    expect(git('rev-parse', 'HEAD^{tree}')).toBe(git('rev-parse', `${base}^{tree}`));
    git('checkout', '-qb', 'batch-rollback', merge); git('revert', '--no-edit', '-m', '1', merge);
    expect(git('rev-parse', 'HEAD^{tree}')).toBe(git('rev-parse', `${before}^{tree}`));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('merged provider PR remains blocked without local squash classification authority', () => {
  const source = passingGh();
  const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: args => {
    const result = source(args);
    return args[0] === 'pr' && args[1] === 'view' ? { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), state: 'MERGED' }) } : result;
  } });
  expect(verdict.ready).toBe(false);
  expect(verdict.blockers.map(blocker => blocker.code)).toContain('already_integrated');
});


const SUMMARY_JOB = 'Required / CI';
const SHARD_ONE = 'Affected tests (shard 1/3)';
const SHARD_TWO = 'Affected tests (shard 2/3)';
const SUMMARY_STEP = 'Consume the single candidate verification';
const SHARD_STEP = 'Run the shard tests';

/** The real ci.yml shape: a summary required job and the matrix shards it needs. */
const WORKFLOW_DEFINITION = [
  'name: CI',
  'on:',
  '  pull_request:',
  'jobs:',
  '  selection:',
  '    name: Select test coverage',
  '  verify:',
  '    name: Affected tests (shard ${{ matrix.shard }}/3)',
  '    needs: selection',
  '  required:',
  '    name: Required / CI',
  '    needs: [selection, verify]',
].join('\n');

type EvidenceScenario = 'passed-rerun' | 'failed-check' | 'missing-previous-job' | 'association-unknown'
  | 'evidence-unavailable' | 'original-test-skipped' | 'original-test-not-executed' | 'no-annotations';

function evidenceGh(scenario: EvidenceScenario): NonNullable<PublicationReadinessInput['gh_runner']> {
  const source = fakeGh();
  const failing = scenario === 'failed-check';
  const run = {
    path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD,
    status: 'completed', conclusion: failing ? 'failure' : 'success',
    run_attempt: failing ? 1 : 2, workflow_id: 99,
    pull_requests: [{ number: receipt.pr_number, head: { sha: HEAD }, base: { sha: BASE } }],
  };
  const job = (id: number, name: string, conclusion: string, step: string, checkRun: string | null = null) => ({
    id, name, status: 'completed', conclusion,
    steps: [{ name: step, number: 1, status: 'completed', conclusion }],
    check_run_url: checkRun,
  });
  const annotationRun = scenario === 'no-annotations' ? null
    : 'https://api.github.com/repos/example/repo-harness/check-runs/77';
  return (args) => {
    const path = args[1] ?? '';
    if (args[0] === 'pr' && args[1] === 'checks') {
      return { status: failing ? 1 : 0, stdout: JSON.stringify([{
        name: SUMMARY_JOB, bucket: failing ? 'fail' : 'pass',
        link: `https://github.com/example/repo-harness/actions/runs/123/job/${failing ? 456 : 789}`,
      }]) };
    }
    if (path === 'repos/example/repo-harness/actions/runs/123') return { status: 0, stdout: JSON.stringify(run) };
    if (path === 'repos/example/repo-harness/actions/runs/123/attempts/1/jobs?per_page=100') {
      return { status: 0, stdout: JSON.stringify({ total_count: 3, jobs: [
        job(456, scenario === 'missing-previous-job' ? 'renamed summary job' : SUMMARY_JOB, 'failure', SUMMARY_STEP),
        job(460, SHARD_ONE, 'failure', SHARD_STEP, annotationRun),
        job(461, SHARD_TWO, 'success', SHARD_STEP),
      ] }) };
    }
    if (path === 'repos/example/repo-harness/actions/runs/123/attempts/2/jobs?per_page=100') {
      return { status: 0, stdout: JSON.stringify({ total_count: 3, jobs: [
        job(789, SUMMARY_JOB, 'success', SUMMARY_STEP),
        job(760, SHARD_ONE, 'success', SHARD_STEP),
        job(761, SHARD_TWO, 'success', SHARD_STEP),
      ] }) };
    }
    if (path === 'repos/example/repo-harness/check-runs/77/annotations?per_page=100') {
      return { status: 0, stdout: JSON.stringify([{ title: 'session-runtime > chunk boundary',
        message: 'AssertionError: expected 200 but received 500' }]) };
    }
    if (path === `repos/example/repo-harness/contents/.github/workflows/ci.yml?ref=${HEAD}`) {
      if (scenario === 'association-unknown') return { status: 1, stdout: JSON.stringify({ status: '404', message: 'Not Found' }) };
      return { status: 0, stdout: JSON.stringify({ type: 'file', path: '.github/workflows/ci.yml',
        encoding: 'base64', content: Buffer.from(WORKFLOW_DEFINITION).toString('base64') }) };
    }
    return source(args);
  };
}

function testExecution(scenario: EvidenceScenario): RequiredCheckTestExecutionV1 {
  if (scenario === 'evidence-unavailable' || scenario === 'no-annotations') return { status: 'unavailable' };
  if (scenario === 'original-test-skipped') {
    return { status: 'available', executed: ['session-runtime > unrelated'], skipped: ['session-runtime > chunk boundary'] };
  }
  if (scenario === 'original-test-not-executed') {
    return { status: 'available', executed: ['session-runtime > unrelated'], skipped: [] };
  }
  return { status: 'available', executed: ['session-runtime > chunk boundary'], skipped: [] };
}

function evidenceVerdict(scenario: EvidenceScenario) {
  const gh_runner = evidenceGh(scenario);
  const reader = () => testExecution(scenario);
  return collectPullRequestMergeReadiness({ ...input, gh_runner, test_execution_reader: reader });
}

async function evidenceVerdictAsync(scenario: EvidenceScenario) {
  const gh_runner = evidenceGh(scenario);
  return collectPullRequestMergeReadinessAbortable({ ...input, gh_runner_async: async args => gh_runner(args),
    test_execution_reader_async: async () => testExecution(scenario) });
}

test('a passing same-SHA rerun preserves the failed shard and revalidates at test level', async () => {
  const sync = evidenceVerdict('passed-rerun');
  expect(sync.ready).toBe(true);
  expect(sync.blockers).toEqual([]);
  expect(sync.check_failures).toHaveLength(1);
  const [evidence] = sync.check_failures;
  expect(evidence!.association).toBe('declared_needs');
  expect(evidence!.workflow).toEqual({ path: '.github/workflows/ci.yml', id: 99, revision: HEAD });
  // The reported failure is the failed child, not the summary job's shell step.
  expect(evidence!.failed).toMatchObject({
    run_id: 123, attempt: 1, job_id: 460, job_name: SHARD_ONE,
    steps: [SHARD_STEP], tests: ['session-runtime > chunk boundary'], shape: 'assertion_mismatch',
  });
  expect(evidence!.failed.failure_excerpt).toContain('AssertionError');
  // The summary job link and the child's attempt history survive the rerun.
  expect(evidence!.summary).toMatchObject({ run_id: 123, attempt: 1, job_id: 456, job_name: SUMMARY_JOB });
  expect(evidence!.failed_children).toHaveLength(1);
  expect(evidence!.failed_children[0]).toMatchObject({
    association: 'declared_needs',
    failure: { job_id: 460, job_name: SHARD_ONE, tests: ['session-runtime > chunk boundary'] },
  });
  expect(evidence!.failed_children[0]!.attempts).toEqual([
    { attempt: 1, job_id: 460, job_name: SHARD_ONE, conclusion: 'failure' },
    { attempt: 2, job_id: 760, job_name: SHARD_ONE, conclusion: 'success' },
  ]);
  // The retry's job/step scope carries real workflow step names, never a test name.
  expect(evidence!.retry).toMatchObject({
    attempted: true, attempts: 2, outcome: 'failed_then_passed', revalidated: true, reason: null,
    latest: { run_id: 123, attempt: 2, job_id: 789, job_name: SUMMARY_JOB },
  });
  expect(evidence!.retry.latest.scope.executed).toEqual([SUMMARY_JOB, SUMMARY_STEP]);
  expect(evidence!.retry.latest.scope.executed).not.toContain('session-runtime > chunk boundary');
  expect(evidence!.observed_result).toBe('failed_then_passed');
  expect(evidence!.cause).toBe('unknown');

  const asyncVerdict = await evidenceVerdictAsync('passed-rerun');
  expect(asyncVerdict.check_failures).toEqual(sync.check_failures);
});

test('a failed required check keeps its blocker and records the failed shard', () => {
  const verdict = evidenceVerdict('failed-check');
  expect(verdict.ready).toBe(false);
  expect(verdict.blockers.map(blocker => blocker.code)).toContain('checks_failed');
  const [evidence] = verdict.check_failures;
  expect(evidence!.association).toBe('declared_needs');
  expect(evidence!.observed_result).toBe('failed');
  expect(evidence!.failed).toMatchObject({ run_id: 123, attempt: 1, job_id: 460, job_name: SHARD_ONE,
    steps: [SHARD_STEP], tests: ['session-runtime > chunk boundary'], shape: 'assertion_mismatch' });
  expect(evidence!.failed_children[0]!.attempts).toHaveLength(1);
  expect(evidence!.retry).toMatchObject({ attempted: false, attempts: 1, outcome: 'not_attempted', revalidated: false, reason: null });
  expect(evidence!.cause).toBe('unknown');
});

test('an unproven dependency keeps the summary failure and attributes no child', () => {
  const verdict = evidenceVerdict('association-unknown');
  expect(verdict.ready).toBe(true);
  const [evidence] = verdict.check_failures;
  expect(evidence!.association).toBe('unknown');
  // The reported failure stays on the required check's own job.
  expect(evidence!.failed).toMatchObject({ job_id: 456, job_name: SUMMARY_JOB, steps: [SUMMARY_STEP], tests: [] });
  expect(evidence!.summary).toMatchObject({ job_id: 456, job_name: SUMMARY_JOB });
  // The observed shard is preserved but marked unknown, never promoted to root cause.
  expect(evidence!.failed_children).toHaveLength(1);
  expect(evidence!.failed_children[0]).toMatchObject({
    association: 'unknown',
    failure: { job_id: 460, job_name: SHARD_ONE, steps: [SHARD_STEP], tests: ['session-runtime > chunk boundary'] },
  });
  expect(evidence!.retry).toMatchObject({ outcome: 'failed_then_not_revalidated', revalidated: false,
    reason: 'failed_test_identifier_unavailable' });
  expect(evidence!.cause).toBe('unknown');
});

test('a passing rerun without test execution evidence is not revalidated', () => {
  const verdict = evidenceVerdict('evidence-unavailable');
  expect(verdict.ready).toBe(true);
  const [evidence] = verdict.check_failures;
  expect(evidence!.association).toBe('declared_needs');
  expect(evidence!.failed.tests).toEqual(['session-runtime > chunk boundary']);
  expect(evidence!.retry).toMatchObject({ outcome: 'failed_then_not_revalidated', revalidated: false,
    reason: 'test_execution_evidence_unavailable' });
  expect(evidence!.observed_result).toBe('not_revalidated');
});

test('a rerun that skips the originally failed test is not revalidation', () => {
  const verdict = evidenceVerdict('original-test-skipped');
  expect(verdict.ready).toBe(true);
  const [evidence] = verdict.check_failures;
  expect(evidence!.failed.tests).toEqual(['session-runtime > chunk boundary']);
  expect(evidence!.retry).toMatchObject({ outcome: 'failed_then_not_revalidated', revalidated: false,
    reason: 'original_test_skipped' });
  expect(evidence!.observed_result).toBe('not_revalidated');
});

test('a rerun that does not execute the originally failed test is not revalidation', () => {
  const verdict = evidenceVerdict('original-test-not-executed');
  expect(verdict.ready).toBe(true);
  const [evidence] = verdict.check_failures;
  expect(evidence!.retry).toMatchObject({ outcome: 'failed_then_not_revalidated', revalidated: false,
    reason: 'original_test_not_executed' });
  expect(evidence!.observed_result).toBe('not_revalidated');
});

test('a rerun without failed child annotations keeps the child but cannot name a test', () => {
  const verdict = evidenceVerdict('no-annotations');
  expect(verdict.ready).toBe(true);
  const [evidence] = verdict.check_failures;
  expect(evidence!.failed).toMatchObject({ job_id: 460, job_name: SHARD_ONE, shape: 'logs_unavailable', tests: [] });
  expect(evidence!.failed_children[0]!.failure.job_id).toBe(460);
  expect(evidence!.retry).toMatchObject({ outcome: 'failed_then_not_revalidated', revalidated: false,
    reason: 'failed_test_identifier_unavailable' });
});

test('the default test execution source reads the attempt JUnit artifacts and fails closed', async () => {
  const junit = (cases: string) => '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<testsuites name="bun test">\n  <testsuite name="tests/unit/session-runtime.test.ts" file="tests/unit/session-runtime.test.ts">\n'
    + cases + '\n  </testsuite>\n</testsuites>\n';
  const executed = junit('    <testcase name="chunk boundary" classname="session-runtime" file="tests/unit/session-runtime.test.ts" />');
  const skipped = junit('    <testcase name="chunk boundary" classname="session-runtime" file="tests/unit/session-runtime.test.ts"><skipped /></testcase>');
  const list = (names: readonly string[]) => ({ status: 0, stdout: JSON.stringify({
    total_count: names.length,
    artifacts: names.map((name, index) => ({ id: index + 1, name, expired: false })),
  }) });
  const writeReport = (name: string, directory: string) => {
    writeFileSync(join(directory, 'junit.xml'), name === 'junit-affected-shard-1-2' ? skipped : executed);
    return true;
  };
  const base = { repository: 'example/repo-harness', run_id: 123, attempt: 2, repo_root: '/tmp/merge-readiness-effect-fixture' };
  expect(selectAttemptTestArtifacts([{ name: 'junit-affected-shard-0-1' }, { name: 'junit-affected-shard-0-2' }], 2))
    .toEqual([{ name: 'junit-affected-shard-0-2' }]);
  expect(testArtifactAttempt('junit-daily-12')).toBe(12);
  // A non-JUnit artifact with an attempt suffix is not a test execution source.
  expect(testArtifactAttempt('test-projection-2')).toBeNull();

  const available = readTestExecutionEvidence({ ...base, download: writeReport,
    gh_runner: () => list(['junit-affected-shard-0-1', 'junit-affected-shard-0-2']) });
  expect(available).toEqual({ status: 'available',
    executed: ['session-runtime > chunk boundary', 'tests/unit/session-runtime.test.ts > chunk boundary',
      'tests/unit/session-runtime.test.ts > session-runtime > chunk boundary'],
    skipped: [] });

  expect(readTestExecutionEvidence({ ...base, download: writeReport, gh_runner: () => list(['junit-affected-shard-0-1']) }))
    .toEqual({ status: 'unavailable' });
  expect(readTestExecutionEvidence({ ...base, download: writeReport, gh_runner: () => list(['junit-affected-shard-1-2']) }))
    .toEqual({ status: 'available', executed: [], skipped: ['session-runtime > chunk boundary',
      'tests/unit/session-runtime.test.ts > chunk boundary',
      'tests/unit/session-runtime.test.ts > session-runtime > chunk boundary'] });
  expect(readTestExecutionEvidence({ ...base, gh_runner: () => ({ status: 1, stdout: '', stderr: 'provider unavailable' }) }))
    .toEqual({ status: 'unavailable' });
  expect(readTestExecutionEvidence({ ...base, download: writeReport,
    gh_runner: () => ({ status: 0, stdout: '<not json>' }) })).toEqual({ status: 'unavailable' });
});

test('the attempt artifact read is available on the abortable path', async () => {
  const report = '<?xml version="1.0"?><testsuites><testsuite><testcase name="chunk boundary" classname="session-runtime" /></testsuite></testsuites>';
  const result = await readTestExecutionEvidenceAbortable({
    repository: 'example/repo-harness', run_id: 123, attempt: 2, repo_root: '/tmp/merge-readiness-effect-fixture',
    gh_runner: () => ({ status: 0, stdout: JSON.stringify({ total_count: 1,
      artifacts: [{ id: 1, name: 'junit-daily-2', expired: false }] }) }),
    download: (_name, directory) => { writeFileSync(join(directory, 'report.xml'), report); return true; },
  }, undefined);
  expect(result).toEqual({ status: 'available', executed: ['session-runtime > chunk boundary'], skipped: [] });
});

test('a rerun whose preserved summary job is missing fails closed instead of inventing history', () => {
  const gh_runner = evidenceGh('missing-previous-job');
  const identity = observeProviderReadinessIdentity({ ...input, gh_runner });
  expect(() => observeProviderReadinessFacts(identity, receipt, { ...input, gh_runner }))
    .toThrow('did not preserve the failed job');
});

const MATRIX = 'build, typecheck, test (matrix)';

function coveragePolicyText(block: unknown): string {
  return JSON.stringify({ publication: { acceptance_merge: 'on', required_check_coverage: block } });
}

const ACTIVE_POLICY = coveragePolicyText({
  protected_paths: ['api-surface/**'],
  required_checks: ['Required / CI', MATRIX],
});

describe('required-check coverage reads', () => {
  function observed(
    verdict: ReturnType<typeof collectPullRequestMergeReadiness>,
  ): readonly { readonly check: string; readonly bucket: string; readonly requirement: string }[] {
    return verdict.required_check_coverage?.checks ?? [];
  }

  test('an absent coverage block reads no changed files and keeps the current behavior', () => {
    const calls: string[][] = [];
    const source = fakeGh({ requiredBucket: 'pass' });
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: args => { calls.push([...args]); return source(args); } });
    expect(verdict.ready).toBe(true);
    expect(verdict.required_check_coverage).toBeNull();
    expect(calls.some(args => args[1]?.startsWith('repos/example/repo-harness/pulls/42/files?'))).toBe(false);
    expect(calls.filter(args => args[0] === 'pr' && args[1] === 'checks')).toHaveLength(1);
    // One policy read is the whole extra cost when the block is inactive.
    expect(calls.filter(args => args[1]?.includes('/contents/.ai/harness/policy.json'))).toHaveLength(1);
  });

  test('a protected changed path blocks a skipped declared check and reads each check view once', () => {
    const calls: string[][] = [];
    const source = fakeGh({
      policy: ACTIVE_POLICY,
      changedPaths: ['src/app.ts', 'api-surface/entries.json'],
      requiredBucket: 'pass',
      allChecks: [{ name: 'Required / CI', bucket: 'pass' }, { name: MATRIX, bucket: 'skipping' }],
    });
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: args => { calls.push([...args]); return source(args); } });
    expect(verdict.ready).toBe(false);
    const blocker = verdict.blockers.find((entry) => entry.code === 'required_check_coverage_missing')!;
    expect(blocker.detail).toContain('"api-surface/entries.json"');
    expect(blocker.detail).toContain(`"${MATRIX}" is skipping`);
    expect(observed(verdict)).toEqual([
      { check: 'Required / CI', bucket: 'pass', requirement: 'required' },
      { check: MATRIX, bucket: 'skipping', requirement: 'required' },
    ]);
    expect(verdict.required_check_coverage?.protected_paths).toEqual(['api-surface/entries.json']);
    expect(calls.filter(args => args[0] === 'pr' && args[1] === 'checks' && args.includes('--required'))).toHaveLength(1);
    expect(calls.filter(args => args[0] === 'pr' && args[1] === 'checks' && !args.includes('--required'))).toHaveLength(1);
    expect(calls.filter(args => args[1]?.startsWith('repos/example/repo-harness/pulls/42/files?'))).toHaveLength(1);
    // Inactive-to-active: policy + one file page + one all-checks read.
    expect(calls.filter(args => args[1]?.includes('/contents/.ai/harness/policy.json'))).toHaveLength(1);
  });

  test('a rename protects both the source and the destination path', () => {
    const renamed = (source: string, destination: string) => fakeGh({
      policy: ACTIVE_POLICY,
      changedFilePages: [[{ filename: destination, previous_filename: source }]],
      requiredBucket: 'pass',
      allChecks: [{ name: 'Required / CI', bucket: 'pass' }, { name: MATRIX, bucket: 'pass' }],
    });
    const sourceProtected = collectPullRequestMergeReadiness({ ...input, gh_runner: renamed('api-surface/entries.json', 'src/entries.json') });
    expect(sourceProtected.ready).toBe(true);
    expect(sourceProtected.required_check_coverage?.protected_paths).toEqual(['api-surface/entries.json']);

    const destinationProtected = collectPullRequestMergeReadiness({ ...input, gh_runner: renamed('src/entries.json', 'api-surface/entries.json') });
    expect(destinationProtected.ready).toBe(true);
    expect(destinationProtected.required_check_coverage?.protected_paths).toEqual(['api-surface/entries.json']);

    // A rename whose source is protected still needs every declared check.
    const skipped = collectPullRequestMergeReadiness({ ...input, gh_runner: fakeGh({
      policy: ACTIVE_POLICY,
      changedFilePages: [[{ filename: 'src/entries.json', previous_filename: 'api-surface/entries.json' }]],
      requiredBucket: 'pass',
      allChecks: [{ name: 'Required / CI', bucket: 'pass' }, { name: MATRIX, bucket: 'skipping' }],
    }) });
    expect(skipped.ready).toBe(false);
    expect(skipped.blockers.map((entry) => entry.code)).toContain('required_check_coverage_missing');
  });

  test('the file read paginates exactly and the read budget follows the page count', () => {
    const files = (count: number, prefix = 'src/file') => Array.from({ length: count }, (_, index) => ({ filename: `${prefix}-${index}.ts` }));
    const pagesOf = (count: number) => {
      const all = files(count);
      const pages: { filename: string }[][] = [];
      for (let index = 0; index < all.length; index += 100) pages.push(all.slice(index, index + 100));
      return pages;
    };
    const run = (count: number) => {
      const source = fakeGh({ policy: ACTIVE_POLICY, changedFilePages: pagesOf(count),
        requiredBucket: 'pass', allChecks: [{ name: 'Required / CI', bucket: 'pass' }] });
      const calls: string[][] = [];
      const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: args => { calls.push([...args]); return source(args); } });
      return { calls, verdict };
    };
    // Exact boundaries: ceil(count / 100) pages, and 0 files cost no page at all.
    for (const [count, pages] of [[0, 0], [1, 1], [100, 1], [101, 2], [200, 2], [3000, 30]] as const) {
      const { calls, verdict } = run(count);
      const fileCalls = calls.filter(args => args[1]?.includes('/files?'));
      expect([count, fileCalls.length]).toEqual([count, pages]);
      expect([count, fileCalls.map(args => /[?&]page=(\d+)/u.exec(args[1]!)?.[1])])
        .toEqual([count, Array.from({ length: pages }, (_, index) => String(index + 1))]);
      expect(verdict.ready).toBe(true);
      // The policy read and the all-checks read happen once, whatever the page count.
      expect(calls.filter(args => args[1]?.includes('/contents/.ai/harness/policy.json'))).toHaveLength(1);
      expect(calls.filter(args => args[0] === 'pr' && args[1] === 'checks' && !args.includes('--required'))).toHaveLength(1);
    }
  });

  test('the executor reuses its base policy read instead of a second contents read', () => {
    const calls: string[][] = [];
    const source = fakeGh({ changedFilePages: [[{ filename: 'api-surface/entries.json' }]],      requiredBucket: 'pass', allChecks: [{ name: 'Required / CI', bucket: 'pass' }, { name: MATRIX, bucket: 'pass' }] });
    const verdict = collectPullRequestMergeReadiness({ ...input,
      policy_file_at_base: { status: 'present', text: ACTIVE_POLICY },
      gh_runner: args => { calls.push([...args]); return source(args); } });
    expect(calls.filter(args => args[1]?.includes('/contents/.ai/harness/policy.json'))).toHaveLength(0);
    expect(verdict.required_check_coverage?.protected_paths).toEqual(['api-surface/entries.json']);
    expect(verdict.ready).toBe(true);
  });

  test('an unprotected changed path under an active block stays ready', () => {
    const source = fakeGh({
      policy: ACTIVE_POLICY,
      changedPaths: ['src/core/app.ts'],
      requiredBucket: 'pass',
      allChecks: [{ name: 'Required / CI', bucket: 'pass' }, { name: MATRIX, bucket: 'skipping' }],
    });
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: source });
    expect(verdict.ready).toBe(true);
    expect(verdict.blockers).toEqual([]);
    expect(verdict.required_check_coverage?.protected_paths).toEqual([]);
    expect(observed(verdict).map((check) => check.requirement)).toEqual(['not_required', 'not_required']);
  });

  test('a passing coverage-waiver check waives the block and is recorded', () => {
    const source = fakeGh({
      policy: ACTIVE_POLICY,
      changedPaths: ['api-surface/entries.json'],
      requiredBucket: 'pass',
      allChecks: [{ name: 'Required / CI', bucket: 'pass' }, { name: MATRIX, bucket: 'skipping' },
        { name: 'coverage-waiver', bucket: 'pass' }],
    });
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: source });
    expect(verdict.ready).toBe(true);
    expect(verdict.required_check_coverage?.waiver).toEqual({ check: 'coverage-waiver', bucket: 'pass' });
    expect(observed(verdict).map((check) => check.requirement)).toEqual(['waived', 'waived']);
  });

  test('a malformed coverage block fails closed with the typed policy blocker', () => {
    const source = fakeGh({
      policy: coveragePolicyText({ protected_path: ['api-surface/**'] }),
      changedPaths: ['api-surface/entries.json'],
      requiredBucket: 'pass',
    });
    const verdict = collectPullRequestMergeReadiness({ ...input, gh_runner: source });
    expect(verdict.ready).toBe(false);
    expect(verdict.required_check_coverage).toBeNull();
    const blocker = verdict.blockers.find((entry) => entry.code === 'required_check_coverage_policy_invalid')!;
    expect(blocker.detail).toContain('unknown fields: protected_path');
  });

  test('the abortable adapter reads the same coverage facts', async () => {
    const source = fakeGh({
      policy: ACTIVE_POLICY,
      changedPaths: ['api-surface/entries.json'],
      requiredBucket: 'pass',
      allChecks: [{ name: 'Required / CI', bucket: 'pass' }, { name: MATRIX, bucket: 'skipping' }],
    });
    const verdict = await collectPullRequestMergeReadinessAbortable({
      ...input, gh_runner_async: async args => source(args),
    });
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers.map((entry) => entry.code)).toContain('required_check_coverage_missing');
    expect(verdict.required_check_coverage?.checks).toHaveLength(2);
  });
});

