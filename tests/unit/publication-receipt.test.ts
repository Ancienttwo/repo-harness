import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readPublicationReceiptCache, PublicationReceiptError } from '../../src/effects/publication/publication-receipt';
import { seedPublicationReceipt } from '../helpers/publication-fixture';
import { describe, expect, test } from 'bun:test';
import { buildPublicationReceipt, buildPublicationCreateIntent, canonicalPublicationCreateIntentBytes, canonicalPublicationPrepareEnvelopeBytes, buildPublicationPrepareEnvelope, decodePublicationMarker, derivePublicationId, encodePublicationMarker, publicationReceiptDigest, replacePublicationMarker } from '../../src/core/publication/publication-receipt';
const TASK_ID = '1'.repeat(64);
const TASK_REVISION = '2'.repeat(64);
const CLAIM_ID = 'claim-publication-fixture';
const SUBJECT = `sha256:${'3'.repeat(64)}`;
function receiptInput() {
  return {
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
}

describe('PublicationReceiptV3', () => {
  test('uses the frozen deterministic identity preimage and a complete canonical marker', () => {
    const input = receiptInput();
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

  test.each([1, 2])('rejects retired protocol %s marker and cache bytes without rewriting them', version => {
    const root = mkdtempSync(join(tmpdir(), 'publication-reader-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      const receipt = buildPublicationReceipt(receiptInput());
      const path = seedPublicationReceipt(root, receipt);
      expect(readPublicationReceiptCache(root, receipt.publication_id)).toEqual(receipt);
      const raw = JSON.stringify({ ...receipt, protocol: version });
      const marker = `<!-- repo-harness-publication-receipt:v${version}:${Buffer.from(raw).toString('base64url')} -->`;
      expect(() => decodePublicationMarker(marker)).toThrow(`publication receipt marker version ${version} is retired`);
      writeFileSync(path, raw);
      expect(() => readPublicationReceiptCache(root, receipt.publication_id)).toThrow(PublicationReceiptError);
      expect(() => readPublicationReceiptCache(root, receipt.publication_id)).toThrow(`publication receipt version ${version} is retired`);
      expect(readFileSync(path, 'utf8')).toBe(raw);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

});
