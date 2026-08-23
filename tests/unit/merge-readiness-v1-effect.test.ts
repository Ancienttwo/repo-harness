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
  // Keep the fixture literal narrow: production validates provider buckets
  // before passing them into the pure projection.
  checks: [{ bucket: 'pass' as const }],
  mergeable: 'MERGEABLE' as const,
};

const localSnapshot = {
  token: 'sha256:' + '7'.repeat(64),
  // The projection consumes the already-fenced booleans. The full lease
  // record is intentionally private to the effect's production collector.
  lease: null,
  lease_is_reviewing: true,
  pointer_matches_receipt: true,
  lease_matches_receipt: true,
  canonical_task_matches_receipt: true,
  local_proof_head_matches_receipt: true,
  review_subject_matches_receipt: true,
  verification_evidence_matches_receipt: true,
  local_evidence_fresh: true,
  acceptance: 'pass' as const,
};

function fakeGh(hasNextPage = false): NonNullable<PublicationReadinessInput['gh_runner']> {
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
    if (command === 'pr checks') return { status: 8, stdout: JSON.stringify([{ bucket: 'pending' }]) };
    if (command === 'api graphql') {
      return { status: 0, stdout: JSON.stringify({ data: { node: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage }, nodes: [{ isResolved: false }] } } } } }) };
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
    collect_local: () => localSnapshot,
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

  test('production fake-gh adapter accepts pending exit 8 and exhaustively reads review threads', () => {
    const effectInput = { ...input, gh_runner: fakeGh() };
    const identity = observeProviderReadinessIdentity(receipt, effectInput);
    const facts = observeProviderReadinessFacts(identity, receipt, effectInput);
    expect(identity.head_sha).toBe(HEAD);
    expect(facts.checks).toEqual([{ bucket: 'pending' }]);
    expect(facts.unresolved_thread_count).toBe(1);
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
    expect(facts.checks).toEqual([{ bucket: 'pending' }]);

    const controller = new AbortController();
    controller.abort();
    await expect(observeProviderReadinessIdentityAbortable(receipt, { ...asyncInput, signal: controller.signal }))
      .rejects.toMatchObject({ code: 'provider_unavailable' });
  });

  test('production fake-gh adapter fails closed when review-thread pagination is not exhausted', () => {
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
