import { describe, expect, test } from 'bun:test';
import { projectPullRequestMergeReadiness, type MergeReadinessBlockerCode } from '../../src/core/publication/merge-readiness';

import {
  buildPublicationReceipt,
  decodePublicationMarker,
  encodePublicationMarker,
  publicationReceiptDigest,
} from '../../src/core/publication/publication-receipt';
import {
  MergeReadinessError,
  observeProviderReadinessFactsAbortable,
  observeProviderReadinessIdentityAbortable,
  observeProviderReadinessFacts,
  observeProviderReadinessIdentity,
  resolveFleetReadiness,
  resolvePublicationReadiness,
  productionMergeReadinessCollector,
  collectPullRequestMergeReadiness,
  type FleetReadinessCollector,
  type MergeReadinessCollector,
  type PublicationReadinessInput,
} from '../../src/effects/publication/merge-readiness';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const TASK_ID = '1'.repeat(64);
const TASK_REVISION = '2'.repeat(64);
const CLAIM_ID = 'claim-readiness-effect';

const receipt = buildPublicationReceipt({
  repo_id: 'sha256:' + '3'.repeat(64),
  task_id: TASK_ID,
  task_revision: TASK_REVISION,
  claim_id: CLAIM_ID,
  generation: 1,
  target_ref: 'main',
  base_sha: BASE,
  branch: 'codex/readiness-effect',
  head_sha: HEAD,
  tree_sha: 'c'.repeat(40),
  candidate_diff_fingerprint: 'sha256:' + '4'.repeat(64),
  provider: 'github',
  provider_repo_id: 'R_readiness_effect',
  pr_number: 42,
  pr_url: 'https://example.invalid/pr/42',
  created_at: '2026-08-22T22:40:00Z',
});

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
  body: `PR body\n${encodePublicationMarker(receipt)}\n`,
  review_decision: null,
  mergeable: 'MERGEABLE' as const,
};

const providerFacts = {
  state: 'OPEN',
  is_draft: false,
  head_sha: HEAD,
  base_sha: BASE,
  review_decision: null,
  unresolved_thread_count: 0,
  rollback_boundary: { status: 'not_active' as const },
  // Keep the fixture literal narrow: production validates provider buckets
  // before passing them into the pure projection.
  checks: [{ name: 'Required / CI', bucket: 'pass' as const }],
  mergeable: 'MERGEABLE' as const,
};

function fakeGh(wrongBase = false): NonNullable<PublicationReadinessInput['gh_runner']> {
  const pr = {
    number: receipt.pr_number,
    url: receipt.pr_url,
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD,
    headRefName: receipt.branch,
    baseRefOid: BASE,
    baseRefName: receipt.target_ref,
    body: `PR body\n${encodePublicationMarker(receipt)}\n`,
    reviewDecision: null,
    mergeable: 'MERGEABLE',
  };
  return (args) => {
    const command = `${args[0]} ${args[1]}`;
    if (command === 'repo view') return { status: 0, stdout: JSON.stringify({ id: receipt.provider_repo_id, nameWithOwner: 'example/repo-harness' }) };
    if (command === 'pr view') return { status: 0, stdout: JSON.stringify(pr) };
    if (command === 'pr checks') return { status: 8, stdout: JSON.stringify([{ name: 'Required / CI', bucket: 'pending', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' }]) };
    if (command === 'api graphql') return { status: 0, stdout: JSON.stringify(reviewGraph()) };
    if (args[0] === 'api' && args[1]?.includes('/contents/.github/workflows/ci-report.yml')) return { status: 1, stdout: JSON.stringify({ status: '404', message: 'Not Found' }) };
    if (command === 'api repos/example/repo-harness/actions/runs/123') {
      return { status: 0, stdout: JSON.stringify({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD,
        pull_requests: [{ number: receipt.pr_number, head: { sha: HEAD }, base: { sha: wrongBase ? '9'.repeat(40) : BASE } }] }) };
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

const input: PublicationReadinessInput = {
  repo_root: '/tmp/merge-readiness-effect-fixture',
  publication_id: receipt.publication_id,
};

function collector(overrides: Partial<MergeReadinessCollector> = {}): MergeReadinessCollector {
  return {
    resolve_receipt: () => receipt,
    observe_identity: () => providerIdentity,
    observe_facts: () => providerFacts,
    classify_integration: () => 'unmerged',
    ...overrides,
  };
}

describe('MergeReadinessV1 effect', () => {
  test('is read-only and accepts only a marker-carried receipt on the injected resolve path', () => {
    const writes: string[] = [];
    const body = `PR body\n${encodePublicationMarker(receipt)}\n`;
    const decoded = decodePublicationMarker(body);
    expect(decoded).not.toBeNull();
    const verdict = resolvePublicationReadiness(
      input,
      collector({
        resolve_receipt: () => {
          // The effect's provider identity is the untrusted carrier. Decode
          // the full immutable payload, but do not repair or rewrite it.
          const markerReceipt = decodePublicationMarker(body);
          if (markerReceipt === null) throw new Error('marker missing');
          return markerReceipt;
        },
      }),
    );

    expect(verdict.ready).toBe(true);
    expect(verdict.publication_id).toBe(receipt.publication_id);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(writes).toEqual([]);
  });

  test('retries the whole provider identity→facts→identity round once after a torn read', () => {
    const calls: string[] = [];
    let identityCall = 0;
    const verdict = resolvePublicationReadiness(input, collector({
      observe_identity: () => {
        calls.push('identity');
        identityCall += 1;
        return identityCall === 2
          ? { ...providerIdentity, head_sha: 'd'.repeat(40) }
          : providerIdentity;
      },
      observe_facts: (identity) => {
        calls.push(`facts:${identity.head_sha}`);
        return providerFacts;
      },
    }));

    expect(verdict.ready).toBe(true);
    expect(calls).toEqual([
      'identity', `facts:${HEAD}`, 'identity',
      'identity', `facts:${HEAD}`, 'identity',
    ]);
  });

  test('body observations cannot churn the actual PR/head/base merge fence', () => {
    let reads = 0;
    const verdict = resolvePublicationReadiness(input, collector({ observe_identity: () => ({ ...providerIdentity,
      body: `description observation ${reads++}` }) }));
    expect(verdict.ready).toBe(true); expect(reads).toBe(2);
  });

  test('reports changed_during_read after the bounded second torn round and preserves receipt fences', () => {
    let identityCall = 0;
    const verdict = resolvePublicationReadiness(input, collector({
      observe_identity: () => {
        identityCall += 1;
        return {
          ...providerIdentity,
          head_sha: identityCall % 2 === 1 ? HEAD : 'd'.repeat(40),
        };
      },
    }));

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.blockers).toContainEqual({ code: 'changed_during_read', attention_owner: 'external' });
    expect(identityCall).toBe(4);
  });

  test('provider unavailable is typed, fail-closed, and performs no write', () => {
    const writes: string[] = [];
    const verdict = resolvePublicationReadiness(input, collector({
      observe_identity: () => {
        writes.push('read-only observation');
        throw new MergeReadinessError('provider_unavailable', 'gh unavailable');
      },
    }));

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.blockers).toContainEqual({ code: 'provider_unavailable', attention_owner: 'external' });
    expect(writes).toEqual(['read-only observation']);
  });

  test('incomplete provider facts are typed and cannot produce readiness', () => {
    const verdict = resolvePublicationReadiness(input, collector({
      observe_facts: () => {
        throw new MergeReadinessError('provider_data_incomplete', 'review threads are truncated');
      },
    }));

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.blockers).toContainEqual({ code: 'provider_data_incomplete', attention_owner: 'external' });
  });

  test('marker mismatch is observed without any receipt, lease, provider, or marker write', () => {
    const writes: string[] = [];
    const mismatched = buildPublicationReceipt({
      ...receipt,
      head_sha: 'd'.repeat(40),
    });
    expect(() => resolvePublicationReadiness(input, collector({
      resolve_receipt: () => {
        const markerReceipt = decodePublicationMarker(`PR body\n${encodePublicationMarker(mismatched)}\n`);
        if (markerReceipt === null || publicationReceiptDigest(markerReceipt) !== publicationReceiptDigest(receipt)) {
          writes.push('marker mismatch observed');
        }
        return receipt;
      },
      observe_identity: () => {
        writes.push('provider identity');
        throw new MergeReadinessError('publication_claim_mismatch', 'marker mismatch');
      },
      observe_facts: () => {
        writes.push('provider facts');
        return providerFacts;
      },
    }))).toThrow(MergeReadinessError);

    expect(writes).toEqual(['marker mismatch observed', 'provider identity']);
  });

  test('production fake-gh adapter accepts pending exit 8 and binds trusted CI to exact head/base', () => {
    const effectInput = { ...input, gh_runner: fakeGh() };
    const identity = observeProviderReadinessIdentity(receipt, effectInput);
    const facts = observeProviderReadinessFacts(identity, receipt, effectInput);
    expect(identity.head_sha).toBe(HEAD);
    expect(facts.checks).toEqual([{ name: 'Required / CI', bucket: 'pending' }]);
    expect(facts.unresolved_thread_count).toBe(0);
  });

  test('abortable provider adapter shares the synchronous parser and fails closed before a provider child starts', async () => {
    const synchronous = fakeGh();
    const asyncInput = {
      ...input,
      gh_runner_async: async (args: readonly string[]) => synchronous(args),
    };
    const identity = await observeProviderReadinessIdentityAbortable(receipt, asyncInput);
    const facts = await observeProviderReadinessFactsAbortable(identity, receipt, asyncInput);
    expect(identity.head_sha).toBe(HEAD);
    expect(facts.checks).toEqual([{ name: 'Required / CI', bucket: 'pending' }]);

    const controller = new AbortController();
    controller.abort();
    await expect(observeProviderReadinessIdentityAbortable(receipt, { ...asyncInput, signal: controller.signal }))
      .rejects.toMatchObject({ code: 'provider_unavailable' });
  });

  test('production fake-gh adapter fails closed for CI from a different base', () => {
    const effectInput = { ...input, gh_runner: fakeGh(true) };
    const identity = observeProviderReadinessIdentity(receipt, effectInput);
    expect(() => observeProviderReadinessFacts(identity, receipt, effectInput)).toThrow(MergeReadinessError);
  });

  test('fleet aggregate isolates a damaged publication and preserves later canonical order', () => {
    const damaged = `sha256:${'d'.repeat(64)}`;
    const readyVerdict = resolvePublicationReadiness(input, collector());
    const fleetCollector: FleetReadinessCollector = {
      collect_index: () => ({
        sprint_path: 'plans/sprints/current.md',
        snapshot_consistency: 'stable',
        publication_ids: [damaged, receipt.publication_id],
      }),
      resolve_publication: (candidate) => {
        if (candidate.publication_id === damaged) {
          throw new MergeReadinessError('publication_claim_mismatch', 'damaged receipt cache');
        }
        return readyVerdict;
      },
    };
    const aggregate = resolveFleetReadiness({ repo_root: input.repo_root }, fleetCollector);
    expect(aggregate.publications.map((entry) => entry.publication_id)).toEqual([damaged, receipt.publication_id]);
    expect(aggregate.publications[0]).toEqual({
      publication_id: damaged,
      error: 'publication_claim_mismatch',
      message: 'damaged receipt cache',
    });
    expect(aggregate.publications[1]?.verdict?.ready).toBe(true);
  });
});

test('production read-only collector has no local lease/review/artifact collector', () => {
  expect(Object.keys(productionMergeReadinessCollector).sort()).toEqual([
    'classify_integration', 'observe_facts', 'observe_identity', 'resolve_receipt',
  ]);
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
  const verdict = collectPullRequestMergeReadiness({ repo_root: '/tmp/absent-local-artifacts', pr_number: 42,
    expected_head_sha: HEAD, expected_base_sha: BASE, gh_runner });
  expect(verdict.ready).toBe(true); expect(ciCalls).toBe(1);
  expect('publication_id' in verdict).toBe(false);
  const moved = collectPullRequestMergeReadiness({ repo_root: '/tmp/absent-local-artifacts', pr_number: 42,
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
  const verdict = collectPullRequestMergeReadiness({ repo_root: '/tmp/absent-local-artifacts', pr_number: 42,
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

test('review decision movement after facts prevents a green verdict', () => {
  let reads = 0;
  const verdict = resolvePublicationReadiness(input, collector({ observe_identity: () => ({ ...providerIdentity,
    review_decision: ++reads % 2 ? null : 'CHANGES_REQUESTED' }) }));
  expect(verdict.blockers.map(blocker => blocker.code)).toEqual(['changed_during_read']);
  expect(reads).toBe(4);
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
    const scenarios = ['ready', '404', 'forbidden', 'activation-malformed', 'activation-error', 'false-404', 'failed-file', 'missing-pr', 'wrong-main', 'wrong-merge-sha', 'unmerged-pr', 'ambiguous-pr', 'bad-number', 'unsafe-number', 'incomplete-pagination', 'malformed-associations', 'malformed-association', 'bad-merged-at', 'association-error', 'root', 'multiple-parents', 'zero-parent', 'same-parent', 'mismatched-commit', 'zero-base', 'commit-error', 'multi-commit-rebase', 'multi-commit-squash', 'parent-other-pr', 'parent-empty', 'parent-malformed', 'parent-malformed-entry', 'parent-missing-number', 'parent-unsafe-number', 'parent-full-page', 'parent-error', 'detail-error', 'wrong-detail-pr', 'wrong-detail-sha', 'unmerged-detail', 'wrong-detail-base', 'malformed-detail'];
    for (const scenario of scenarios) {
      const observedBase = scenario === 'zero-base' ? '0'.repeat(40) : scenario === 'root' ? before : scenario === 'multiple-parents' ? merge : scenario === 'multi-commit-rebase' ? rebased : scenario === 'multi-commit-squash' ? squashed : base;
      const observedParent = scenario === 'multi-commit-rebase' ? git('rev-parse', `${rebased}^`) : scenario === 'multi-commit-squash' ? base : before;
      const identity = { ...providerIdentity, base_sha: observedBase };
      const requests: string[] = [];
      const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
        const path = args[1] ?? ''; requests.push(args.join(' '));
        const json = (value: unknown, status = 0) => ({ status, stdout: JSON.stringify(value) });
        const error = () => ({ status: 2, stdout: '', stderr: 'provider unavailable' });
        if (path === 'graphql') { const graph = reviewGraph(); graph.data.node.pullRequest.baseRefOid = observedBase; return json(graph); }
        if (args[0] === 'pr') return json([{ name: 'Required / CI', bucket: 'pass', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' }]);
        if (path.includes('/actions/runs/123')) return json({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD, status: 'completed', conclusion: 'success', pull_requests: [{ number: 42, head: { sha: HEAD }, base: { sha: observedBase } }] });
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
          return json({ ...mergedPR, merged: true, merge_commit_sha: observedBase,
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
      if (['ready', '404', 'multi-commit-squash', 'parent-other-pr', 'parent-empty'].includes(scenario)) {
        const expected = scenario === '404' ? { status: 'not_active' as const } : { status: 'ready' as const, pr_number: 17, before_sha: observedParent, after_sha: observedBase };
        const syncFacts = syncRead(); const asyncFacts = await asyncRead();
        expect(syncFacts.rollback_boundary).toEqual(expected);
        expect(asyncFacts.rollback_boundary).toEqual(expected);
        for (const provider of [syncFacts, asyncFacts]) {
          const verdict = projectPullRequestMergeReadiness({ expected_head_sha: HEAD, expected_base_sha: observedBase,
            integration_mode: 'unmerged', observation: 'stable', provider });
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
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('publication integration classification uses the installed helper without a repo-local merge lib copy', () => {
  const root = mkdtempSync(join(tmpdir(), 'readiness-installed-helper-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-b', 'main'); git('config', 'user.name', 'Readiness fixture'); git('config', 'user.email', 'readiness@test.invalid');
    writeFileSync(join(root, 'feature'), 'base'); git('add', '.'); git('commit', '-qm', 'base');
    git('switch', '-qc', 'codex/adopted');
    writeFileSync(join(root, 'feature'), 'changed'); git('add', '.'); git('commit', '-qm', 'candidate');
    const head = git('rev-parse', 'HEAD');
    const tree = git('rev-parse', 'HEAD^{tree}');
    git('switch', '-q', 'main'); git('merge', '--squash', 'codex/adopted'); git('commit', '-qm', 'squash');
    const base = git('rev-parse', 'HEAD');
    expect(existsSync(join(root, 'scripts/worktree-merge-lib.sh'))).toBe(false);
    const adopted = buildPublicationReceipt({
      repo_id: 'sha256:' + '5'.repeat(64), task_id: TASK_ID, task_revision: TASK_REVISION, claim_id: CLAIM_ID, generation: 1,
      target_ref: 'main', base_sha: base, branch: 'codex/adopted', head_sha: head, tree_sha: tree,
      candidate_diff_fingerprint: 'sha256:' + '6'.repeat(64), provider: 'github', provider_repo_id: 'R_readiness_adopted',
      pr_number: 43, pr_url: 'https://example.invalid/pr/43', created_at: '2026-08-22T22:40:00Z',
    });
    const verdict = resolvePublicationReadiness({ repo_root: root, publication_id: adopted.publication_id }, {
      ...productionMergeReadinessCollector,
      resolve_receipt: () => adopted,
      observe_identity: () => ({ ...providerIdentity, base_sha: base, head_sha: head }),
      observe_facts: () => ({ ...providerFacts, head_sha: head, base_sha: base }),
    });
    expect(verdict.integration_mode).toBe('absorbed');
    expect(verdict.blockers.map(blocker => blocker.code)).toContain('already_integrated');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
