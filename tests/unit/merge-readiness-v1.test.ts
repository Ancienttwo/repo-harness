import { describe, expect, test } from 'bun:test';

import {
  projectMergeReadiness,
  projectPullRequestMergeReadiness,
  type MergeReadinessInputV1,
  type ProviderMergeReadinessFactsV1,
} from '../../src/core/publication/merge-readiness';
import { buildPublicationReceipt } from '../../src/core/publication/publication-receipt';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

const receipt = buildPublicationReceipt({
  repo_id: `sha256:${'1'.repeat(64)}`,
  task_id: '2'.repeat(64),
  task_revision: '3'.repeat(64),
  claim_id: 'claim-readiness',
  generation: 1,
  target_ref: 'main',
  base_sha: BASE,
  branch: 'codex/readiness',
  head_sha: HEAD,
  tree_sha: 'c'.repeat(40),
  candidate_diff_fingerprint: `sha256:${'4'.repeat(64)}`,
  provider: 'github',
  provider_repo_id: 'R_readiness',
  pr_number: 42,
  pr_url: 'https://example.invalid/pr/42',
  created_at: '2026-08-22T22:40:00Z',
});

function readyInput(): MergeReadinessInputV1 {
  return {
    receipt,
    integration_mode: 'unmerged',
    observation: 'stable',
    provider: {
      state: 'OPEN',
      is_draft: false,
      head_sha: HEAD,
      base_sha: BASE,
      review_decision: null,
      unresolved_thread_count: 0,
      rollback_boundary: { status: 'not_active' },
      checks: [{ name: 'Required / CI', bucket: 'pass' }],
      mergeable: 'MERGEABLE',
    },
  };
}

describe('MergeReadinessV1', () => {
  test('projects a ready verdict only from fully fenced inputs', () => {
    expect(projectMergeReadiness(readyInput())).toEqual({
      protocol: 1,
      kind: 'repo-harness-merge-readiness',
      publication_id: receipt.publication_id,
      ready: true,
      expected_head_sha: HEAD,
      expected_base_sha: BASE,
      integration_mode: 'unmerged',
      attention_owner: 'none',
      blockers: [],
    });
  });

  test('always preserves receipt fences and deterministically routes aggregate blockers', () => {
    const verdict = projectMergeReadiness({
      ...readyInput(),
      integration_mode: 'absorbed',
      provider: {
        ...readyInput().provider!,
        state: 'CLOSED',
        is_draft: true,
        head_sha: 'd'.repeat(40),
        base_sha: 'e'.repeat(40),
        review_decision: 'CHANGES_REQUESTED',
        unresolved_thread_count: 1,
        checks: [{ name: 'Required / CI', bucket: 'pending' }, { name: 'Required / CI', bucket: 'skipping' }],
        mergeable: 'CONFLICTING',
      },
    });

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.attention_owner).toBe('agent');
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual([
      'already_integrated',
      'pr_not_open',
      'draft',
      'head_moved',
      'base_moved_since_verification',
      'changes_requested',
      'unresolved_threads',
      'checks_pending',
      'checks_failed',
      'not_mergeable',
    ]);
  });

  test('fails closed for provider data churn and unavailable provider facts', () => {
    const changed = projectMergeReadiness({
      ...readyInput(),
      observation: 'changed_during_read',
      provider: null,
    });
    const unavailable = projectMergeReadiness({
      ...readyInput(),
      observation: 'provider_data_incomplete',
      provider: null,
    });

    expect(changed.ready).toBe(false);
    expect(changed.attention_owner).toBe('external');
    expect(changed.blockers.map((blocker) => blocker.code)).toEqual(['changed_during_read']);
    expect(unavailable.ready).toBe(false);
    expect(unavailable.attention_owner).toBe('external');
    expect(unavailable.blockers.map((blocker) => blocker.code)).toEqual(['provider_data_incomplete']);
  });

  test('treats only passing required-CI buckets as green and review null as no review requirement', () => {
    const verdict = projectMergeReadiness({
      ...readyInput(),
      provider: {
        ...readyInput().provider!,
        checks: [{ name: 'Required / CI', bucket: 'pass' }, { name: 'Required / CI', bucket: 'cancel' }],
        review_decision: 'REVIEW_REQUIRED',
      },
    });

    expect(verdict.ready).toBe(false);
    expect(verdict.attention_owner).toBe('agent');
    expect(verdict.blockers).toEqual([
      { code: 'checks_failed', attention_owner: 'agent' },
    ]);
  });
});

test.each(['head_sha','base_sha'] as const)('an otherwise green Publication loses readiness when provider %s moves', field => {
  const input=readyInput();
  const verdict=projectMergeReadiness({...input,provider:{...input.provider!,[field]:'9'.repeat(40)}});
  expect(verdict.ready).toBe(false);
  expect(verdict.blockers.map(b=>b.code)).toEqual([field==='head_sha'?'head_moved':'base_moved_since_verification']);
});
test('ordinary PR readiness needs no receipt, lease or acceptance artifact', () => {
  const { provider, integration_mode, observation } = readyInput();
  const input = { provider: provider!, integration_mode, observation,
    expected_head_sha: HEAD, expected_base_sha: BASE };
  expect(projectPullRequestMergeReadiness(input).ready).toBe(true);
  expect(projectPullRequestMergeReadiness({ ...input, provider: { ...input.provider, checks: [] } }).ready).toBe(false);
  expect(projectPullRequestMergeReadiness({ ...input, provider: { ...input.provider, checks: [{ name: 'fake-green', bucket: 'pass' }] } }).ready).toBe(false);
});

test.each([null, -1, 0.5, Number.NaN])('missing or invalid thread count %s fails closed', count => {
  const input = readyInput();
  const verdict = projectMergeReadiness({ ...input, provider: { ...input.provider!, unresolved_thread_count: count } });
  expect(verdict.blockers.map(blocker => blocker.code)).toEqual(['provider_data_incomplete']);
});

test.each(['APPROVED', 'REVIEW_REQUIRED', null])('review decision %s needs no local approval artifact', decision => {
  const input = readyInput();
  expect(projectMergeReadiness({ ...input, provider: { ...input.provider!, review_decision: decision } }).ready).toBe(true);
});


test('a ready rollback boundary binds both provider and expected base', () => {
  const input = readyInput();
  const boundary = { status: 'ready' as const, pr_number: 17, before_sha: 'c'.repeat(40), after_sha: BASE };
  const provider = { ...input.provider!, rollback_boundary: boundary };
  expect(projectMergeReadiness({ ...input, provider }).ready).toBe(true);
  expect(projectMergeReadiness({ ...input, provider: { ...provider, base_sha: 'd'.repeat(40) } }).blockers.map(b => b.code))
    .toEqual(['base_moved_since_verification', 'provider_data_incomplete']);
  expect(projectPullRequestMergeReadiness({ provider, integration_mode: 'unmerged', observation: 'stable',
    expected_head_sha: HEAD, expected_base_sha: 'd'.repeat(40) }).blockers.map(b => b.code))
    .toEqual(['base_moved_since_verification', 'provider_data_incomplete']);
});

test.each([undefined, null, 'ready', [], { status: 'pending' }, { status: 'ready' },
  ...[0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '17'].map(pr_number => ({ status: 'ready', pr_number, before_sha: 'c'.repeat(40), after_sha: BASE })),
  ...[undefined, '0'.repeat(40), 'invalid', BASE].map(before_sha => ({ status: 'ready', pr_number: 17, before_sha, after_sha: BASE })),
  ...[undefined, '0'.repeat(40), 'invalid', 'd'.repeat(40)].map(after_sha => ({ status: 'ready', pr_number: 17, before_sha: 'c'.repeat(40), after_sha })),
].map(rollback_boundary => ({ rollback_boundary })))('invalid rollback boundary fails closed: %j', ({ rollback_boundary }) => {
  const input = readyInput();
  const provider = { ...input.provider!, rollback_boundary } as unknown as ProviderMergeReadinessFactsV1;
  expect(projectMergeReadiness({ ...input, provider }).blockers.map(b => b.code)).toEqual(['provider_data_incomplete']);
});

test('retired rollback facts do not supply the new boundary', () => {
  const input = readyInput();
  const { rollback_boundary: _boundary, ...facts } = input.provider!;
  const provider = { ...facts, rollback_tags: 'ready' } as unknown as ProviderMergeReadinessFactsV1;
  expect(projectMergeReadiness({ ...input, provider }).blockers.map(b => b.code)).toEqual(['provider_data_incomplete']);
});
