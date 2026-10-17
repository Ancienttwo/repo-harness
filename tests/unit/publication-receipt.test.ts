import { describe, expect, test } from 'bun:test';
import { buildPublicationReceipt, buildPublicationCreateIntent, canonicalPublicationCreateIntentBytes, canonicalPublicationPrepareEnvelopeBytes, buildPublicationPrepareEnvelope, decodePublicationMarker, derivePublicationId, encodePublicationMarker, publicationReceiptDigest, replacePublicationMarker } from '../../src/core/publication/publication-receipt';
const TASK_ID = '1'.repeat(64);
const TASK_REVISION = '2'.repeat(64);
const CLAIM_ID = 'claim-publication-fixture';
const SUBJECT = `sha256:${'3'.repeat(64)}`;
describe('PublicationReceiptV3', () => {
  test('uses the frozen deterministic identity preimage and a complete canonical marker', () => {
    const input = {
      repo_id: 'fixture-common-dir',
      task_id: TASK_ID,
      task_revision: TASK_REVISION,
      claim_id: CLAIM_ID,
      generation: 1,
      target_ref: 'main',
      base_sha: 'a'.repeat(40),
      branch: 'codex/publication',
      head_sha: 'b'.repeat(40),
      tree_sha: 'c'.repeat(40),
      candidate_diff_fingerprint: SUBJECT,
      provider: 'github' as const,
      provider_repo_id: 'R_fixture',
      pr_number: 1,
      pr_url: 'https://example.invalid/pr/1',
      created_at: '2026-08-22T04:05:55Z',
    };
    const receipt = buildPublicationReceipt(input);
    expect(receipt.publication_id).toBe('sha256:f1819c97aa8816e26d68c2edb23c6344427e65f747047763ee982b733751ab28');
    expect(receipt.publication_id).toBe(derivePublicationId(input));
    expect(receipt.publication_id).toBe(buildPublicationReceipt({ ...input, created_at: '2026-08-23T04:05:55Z' }).publication_id);
    expect(receipt.protocol).toBe(3);
    expect(Object.keys(receipt)).not.toContain('review_subject_sha256');
    expect(Object.keys(receipt)).not.toContain('verification_evidence_sha256');
    const intent = buildPublicationCreateIntent(input);
    const intentBytes = '{"claim_id":"claim-publication-fixture","generation":1,"head_sha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","kind":"repo-harness-publication-create-intent","protocol":1,"provider_repo_id":"R_fixture","publication_id":"sha256:f1819c97aa8816e26d68c2edb23c6344427e65f747047763ee982b733751ab28","task_id":"1111111111111111111111111111111111111111111111111111111111111111"}';
    expect(canonicalPublicationCreateIntentBytes(intent)).toBe(intentBytes);
    expect(canonicalPublicationPrepareEnvelopeBytes(buildPublicationPrepareEnvelope(intent)))
      .toBe(`{"action":"create","create_intent":${intentBytes},"kind":"repo-harness-publication-prepare","protocol":1}`);
    expect(canonicalPublicationPrepareEnvelopeBytes(buildPublicationPrepareEnvelope(null)))
      .toBe('{"action":"existing","create_intent":null,"kind":"repo-harness-publication-prepare","protocol":1}');
    const marker = encodePublicationMarker(receipt);
    expect(marker).toStartWith('<!-- repo-harness-publication-receipt:v3:');
    expect(decodePublicationMarker(marker)).toEqual(receipt);
    expect(decodePublicationMarker(replacePublicationMarker('human text', receipt))).toEqual(receipt);
    expect(publicationReceiptDigest(receipt)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

});
