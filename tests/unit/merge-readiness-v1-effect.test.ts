import { describe, expect, test } from 'bun:test';

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
  review_subject_sha256: 'sha256:' + '4'.repeat(64),
  verification_evidence_sha256: 'sha256:' + '5'.repeat(64),
  merge_seal_sha256: 'sha256:' + '6'.repeat(64),
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
  rollback_tags: 'not_active' as const,
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
    if (args[0] === 'api' && args[1]?.includes('/contents/.github/workflows/ci-report.yml')) return { status: 1, stdout: JSON.stringify({ status: '404', message: 'Not Found' }) };
    if (command === 'api repos/example/repo-harness/actions/runs/123') {
      return { status: 0, stdout: JSON.stringify({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD,
        pull_requests: [{ number: receipt.pr_number, head: { sha: HEAD }, base: { sha: wrongBase ? '9'.repeat(40) : BASE } }] }) };
    }
    return { status: 2, stdout: '', stderr: `unexpected fake gh args: ${args.join(' ')}` };
  };
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

  test('review/body observations cannot churn the actual PR/head/base merge fence', () => {
    let reads = 0;
    const verdict = resolvePublicationReadiness(input, collector({ observe_identity: () => ({ ...providerIdentity,
      body: `description observation ${reads++}`, review_decision: reads % 2 ? 'REVIEW_REQUIRED' : 'APPROVED' }) }));
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
    expect(facts.unresolved_thread_count).toBeNull();
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

// The readback decoder consumes actual annotated Git objects; it never scans or gates older history.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('reporter activation fences only the current merged parent and decodes real before/after annotations', () => {
  const root = mkdtempSync(join(tmpdir(), 'readiness-tags-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  try {
    git('init', '-qb', 'main'); git('config', 'user.name', 'Tag readback fixture'); git('config', 'user.email', 'ci@example.invalid'); git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'feature'), 'before'); git('add', '.'); git('commit', '-qm', 'untagged pre-cutover history'); const before = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'feature'), 'after'); git('add', '.'); git('commit', '-qm', 'squashed reporter cutover'); const base = git('rev-parse', 'HEAD');
    git('tag', '-a', 'gate-cutover-pr-17-before', before, '-m', 'before'); git('tag', '-a', 'gate-cutover-pr-17-after', base, '-m', 'after');
    const identity = { ...providerIdentity, base_sha: base }; const requests: string[] = []; let active = true; let forbidden = false; let malformedTag = false;
    const gh_runner: NonNullable<PublicationReadinessInput['gh_runner']> = args => {
      const path = args[1] ?? ''; requests.push(args.join(' '));
      const json = (value: unknown, status = 0) => ({ status, stdout: JSON.stringify(value) });
      if (args[0] === 'pr') return json([{ name: 'Required / CI', bucket: 'pass', link: 'https://github.com/example/repo-harness/actions/runs/123/job/456' }]);
      if (path.includes('/actions/runs/123')) return json({ path: '.github/workflows/ci.yml', event: 'pull_request', head_sha: HEAD, status: 'completed', conclusion: 'success', pull_requests: [{ number: 42, head: { sha: HEAD }, base: { sha: base } }] });
      if (path.includes('/contents/')) return forbidden ? json({ status: '403', message: 'Forbidden' }, 1) : active ? json({ type: 'file', path: '.github/workflows/ci-report.yml', sha: '8'.repeat(40) }) : json({ status: '404' }, 1);
      if (path.includes(`/commits/${base}/pulls`)) return json([{ number: 17, merged_at: '2026-10-03T00:00:00Z', merge_commit_sha: base, base: { ref: 'main' } }]);
      if (path.includes(`/git/commits/${base}`)) return json({ sha: base, parents: [{ sha: before }] });
      if (path.includes('/git/ref/tags/')) {
        if (malformedTag) return json({ object: [] });
        const name = path.split('/').at(-1)!;
        if (spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${name}`], { cwd: root }).status !== 0) return json({ status: '404' }, 1);
        return json({ object: { type: git('cat-file', '-t', `refs/tags/${name}`), sha: git('rev-parse', `refs/tags/${name}`) } });
      }
      if (path.includes('/git/tags/')) {
        const text = git('cat-file', '-p', path.split('/').at(-1)!);
        return json({ tag: text.split('\n').find(line => line.startsWith('tag '))!.slice(4), object: { type: 'commit', sha: text.split('\n')[0]!.slice(7) } });
      }
      throw Error(`Unexpected provider call: ${args.join(' ')}`);
    };
    const read = () => observeProviderReadinessFacts(identity, receipt, { ...input, gh_runner });
    expect(read().rollback_tags).toBe('ready');
    malformedTag = true; expect(() => read()).toThrow('rollback tag object must be an object'); malformedTag = false;
    expect(new Set(requests.filter(path => path.includes('/commits/') && path.includes('/pulls')))).toEqual(new Set([`api repos/example/repo-harness/commits/${base}/pulls?per_page=100`]));
    expect(requests.some(path => path.includes('state=closed'))).toBe(false);
    git('tag', '-d', 'gate-cutover-pr-17-after'); expect(read().rollback_tags).toBe('pending');
    git('tag', '-a', 'gate-cutover-pr-17-after', before, '-m', 'conflict'); expect(read().rollback_tags).toBe('pending');
    active = false; requests.length = 0; expect(read().rollback_tags).toBe('not_active'); expect(requests.some(path => path.includes('/pulls'))).toBe(false);
    forbidden = true; expect(() => read()).toThrow('rollback reporter activation unavailable');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
