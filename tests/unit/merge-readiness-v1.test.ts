import { describe, expect, test } from 'bun:test';

import {
  projectMergeReadiness,
  type MergeReadinessInputV1,
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
  review_subject_sha256: `sha256:${'4'.repeat(64)}`,
  verification_evidence_sha256: `sha256:${'5'.repeat(64)}`,
  merge_seal_sha256: `sha256:${'6'.repeat(64)}`,
  provider: 'github',
  provider_repo_id: 'R_readiness',
  pr_number: 42,
  pr_url: 'https://example.invalid/pr/42',
  created_at: '2026-08-22T22:40:00Z',
});

function readyInput(): MergeReadinessInputV1 {
  return {
    receipt,
    lease_is_reviewing: true,
    pointer_matches_receipt: true,
    lease_matches_receipt: true,
    canonical_task_matches_receipt: true,
    local_proof_head_matches_receipt: true,
    review_subject_matches_receipt: true,
    verification_evidence_matches_receipt: true,
    local_evidence_fresh: true,
    acceptance: 'pass',
    integration_mode: 'unmerged',
    observation: 'stable',
    provider: {
      state: 'OPEN',
      is_draft: false,
      head_sha: HEAD,
      base_sha: BASE,
      review_decision: null,
      unresolved_thread_count: 0,
      checks: [{ bucket: 'pass' }],
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
      lease_is_reviewing: false,
      pointer_matches_receipt: false,
      lease_matches_receipt: false,
      canonical_task_matches_receipt: false,
      local_proof_head_matches_receipt: false,
      review_subject_matches_receipt: false,
      verification_evidence_matches_receipt: false,
      local_evidence_fresh: false,
      acceptance: 'missing',
      integration_mode: 'absorbed',
      provider: {
        ...readyInput().provider!,
        state: 'CLOSED',
        is_draft: true,
        head_sha: 'd'.repeat(40),
        base_sha: 'e'.repeat(40),
        review_decision: 'CHANGES_REQUESTED',
        unresolved_thread_count: 1,
        checks: [{ bucket: 'pending' }, { bucket: 'skipping' }],
        mergeable: 'CONFLICTING',
      },
    });

    expect(verdict.ready).toBe(false);
    expect(verdict.expected_head_sha).toBe(HEAD);
    expect(verdict.expected_base_sha).toBe(BASE);
    expect(verdict.attention_owner).toBe('user');
    expect(verdict.blockers.map((blocker) => blocker.code)).toEqual([
      'lease_not_reviewing',
      'publication_pointer_mismatch',
      'publication_claim_mismatch',
      'task_revision_mismatch',
      'head_moved',
      'review_subject_mismatch',
      'verification_evidence_stale',
      'acceptance_missing',
      'already_integrated',
      'pr_not_open',
      'draft',
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
        checks: [{ bucket: 'pass' }, { bucket: 'cancel' }],
        review_decision: 'REVIEW_REQUIRED',
      },
    });

    expect(verdict.ready).toBe(false);
    expect(verdict.attention_owner).toBe('agent');
    expect(verdict.blockers).toEqual([
      { code: 'required_reviews_missing', attention_owner: 'external' },
      { code: 'checks_failed', attention_owner: 'agent' },
    ]);
  });
});
