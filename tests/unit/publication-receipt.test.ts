import { candidate } from '../../scripts/merge-gate';
import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildPublicationReceipt,
  buildPublicationCreateIntent,
  canonicalPublicationCreateIntentBytes,
  canonicalPublicationPrepareEnvelopeBytes,
  validatePublicationReceipt,
  buildPublicationPrepareEnvelope,
  decodePublicationMarker,
  derivePublicationId,
  encodePublicationMarker,
  publicationReceiptDigest,
  publicationSha256,
  replacePublicationMarker,
} from '../../src/core/publication/publication-receipt';
import {
  PublicationReceiptError,
  ensurePublicationReceipt,
  preparePublicationReceipt,
  publicationReceiptPath,
  readPublicationReceiptCache,
  rebuildPublicationReceipt,
  writePublicationReceiptCache,
} from '../../src/effects/publication/publication-receipt';
import { bindLeaseRecord, beginLeaseCompletionRecord, buildLeaseOwnerRecord } from '../../src/core/state/coordination-identity';
import { createLeaseDirectory, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { readLease } from '../../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

const TASK_ID = '1'.repeat(64);
const TASK_REVISION = '2'.repeat(64);
const CLAIM_ID = 'claim-publication-fixture';
const SUBJECT = `sha256:${'3'.repeat(64)}`;
const HARNESS_ROOT = join(import.meta.dir, '../..');

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

interface Fixture {
  readonly root: string;
  readonly base: string;
  readonly head: string;
  readonly gh: string;
  readonly body: string;
}

function installFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-publication-receipt-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Publication Test');
  git(root, 'config', 'user.email', 'publication@test.invalid');
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', 'README.md');
  git(root, 'commit', '-m', 'base');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'switch', '-c', 'codex/publication');
  writeFileSync(join(root, 'feature.txt'), 'publication\n');
  git(root, 'add', 'feature.txt');
  git(root, 'commit', '-m', 'feature');
  const head = git(root, 'rev-parse', 'HEAD');

  const record = buildLeaseOwnerRecord({
    claimId: CLAIM_ID,
    taskId: TASK_ID,
    taskRevision: TASK_REVISION,
    sprintPath: 'plans/sprints/demo.sprint.md',
    targetRef: 'main',
    generation: 1,
    sessionId: 'session-fixture',
    sourceWorktree: root,
  });
  const bound = bindLeaseRecord(record, {
    claimId: CLAIM_ID,
    executionWorktree: root,
    branch: 'codex/publication',
    unitRef: 'plans/plan-demo.md',
  });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, {
    claimId: CLAIM_ID,
    executionWorktree: root,
    finishTransactionKey: null,
  });
  if (!completing.ok) throw new Error(completing.error);
  if (!createLeaseDirectory(root, TASK_ID)) throw new Error('fixture lease election failed');
  writeLeaseOwnerDurably(root, TASK_ID, completing.record);

  const body = join(root, 'pr-body.md');
  writeFileSync(body, 'Automated ship body.\n');
  const gh = join(root, 'fake-gh.sh');
  writeFileSync(gh, [
    '#!/bin/bash',
    'set -euo pipefail',
    'head="$(git rev-parse HEAD)"',
    'base="$(git rev-parse main)"',
    'body="$(jq -Rs . < "$GH_BODY_FILE")"',
    'pr_json="{\\"number\\":1,\\"url\\":\\"https://example.invalid/pr/1\\",\\"headRefOid\\":\\"${GH_HEAD_SHA:-$head}\\",\\"headRefName\\":\\"${GH_HEAD_REF:-codex/publication}\\",\\"baseRefName\\":\\"${GH_BASE_REF:-main}\\",\\"baseRefOid\\":\\"${GH_BASE_SHA:-$base}\\",\\"body\\":$body,\\"createdAt\\":\\"2026-08-22T04:05:55Z\\"}"',
    'if [[ "$1" == "repo" && "$2" == "view" ]]; then printf \'{"id":"R_fixture"}\\n\'; exit 0; fi',
    'if [[ "$1" == "pr" && "$2" == "list" ]]; then [[ "${GH_PR_EXISTS:-0}" == "1" ]] && printf \'[%s]\\n\' "$pr_json" || printf \'[]\\n\'; exit 0; fi',
    'if [[ "$1" == "pr" && "$2" == "view" ]]; then printf \'%s\\n\' "$pr_json"; exit 0; fi',
    'if [[ "$1" == "pr" && "$2" == "edit" ]]; then',
    '  [[ "${GH_FAIL_EDIT:-0}" != "1" ]] || { echo "forced marker failure" >&2; exit 41; }',
    '  printf \'%s\' "$5" > "$GH_BODY_FILE"',
    '  exit 0',
    'fi',
    'echo "unexpected gh invocation: $*" >&2',
    'exit 2',
    '',
  ].join('\n'));
  chmodSync(gh, 0o755);
  return { root, base, head, gh, body };
}

function withFixture(run: (fixture: Fixture) => void): void {
  const fixture = installFixture();
  const before = { ...process.env };
  process.env.GH_BODY_FILE = fixture.body;
  process.env.GH_PR_EXISTS = '0';
  try {
    run(fixture);
  } finally {
    process.env = before;
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function ensureInput(fixture: Fixture) {
  return {
    repo_root: fixture.root,
    task_id: TASK_ID,
    claim_id: CLAIM_ID,
    branch: 'codex/publication',
    target_branch: 'main',
    gh_bin: fixture.gh,
    create_intent_journal_path: join(fixture.root, 'publication-intent.status.json'),
  } as const;
}

function prepareThenObserve(fixture: Fixture) {
  const prepared = preparePublicationReceipt(ensureInput(fixture));
  expect(prepared.action).toBe('create');
  expect(prepared.create_intent).not.toBeNull();
  writeFileSync(
    join(fixture.root, 'publication-intent.status.json'),
    `${JSON.stringify({ phases: [{ phase: 'publication_create_intent', publication: buildPublicationPrepareEnvelope(prepared.create_intent!) }] })}\n`,
  );
  process.env.GH_PR_EXISTS = '1';
  return prepared.create_intent!;
}

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

  test('persists a pre-create intent, writes the common-dir cache, and rebuilds field-equivalently', () => {
    withFixture((fixture) => {
      const createIntent = prepareThenObserve(fixture);
      const first = ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: createIntent });
      const second = ensurePublicationReceipt(ensureInput(fixture));
      expect(second.receipt.publication_id).toBe(first.receipt.publication_id);
      expect(second.marker_changed).toBe(false);
      expect(first.receipt.repo_id).toBe(publicationSha256(resolveGitCommonDirectory(fixture.root)));
      expect(first.receipt.head_sha).toBe(fixture.head);
      const markerBody = readFileSync(fixture.body, 'utf-8');
      expect(decodePublicationMarker(markerBody)).toEqual(first.receipt);
      expect(JSON.stringify(first.receipt)).not.toContain(fixture.root);
      expect(markerBody).not.toContain(fixture.root);
      expect(readPublicationReceiptCache(fixture.root, first.receipt.publication_id)).toEqual(first.receipt);

      const conflicting = buildPublicationReceipt({
        repo_id: first.receipt.repo_id,
        task_id: first.receipt.task_id,
        task_revision: first.receipt.task_revision,
        claim_id: first.receipt.claim_id,
        generation: first.receipt.generation,
        target_ref: first.receipt.target_ref,
        base_sha: first.receipt.base_sha,
        branch: first.receipt.branch,
        head_sha: first.receipt.head_sha,
        tree_sha: first.receipt.tree_sha,
        candidate_diff_fingerprint: first.receipt.candidate_diff_fingerprint,
        provider: first.receipt.provider,
        provider_repo_id: first.receipt.provider_repo_id,
        pr_number: first.receipt.pr_number,
        pr_url: first.receipt.pr_url,
        created_at: '2026-08-23T04:05:55Z',
      });
      expect(conflicting.publication_id).toBe(first.receipt.publication_id);
      expect(() => writePublicationReceiptCache(fixture.root, conflicting)).toThrow(PublicationReceiptError);

      const cache = publicationReceiptPath(fixture.root, first.receipt.publication_id);
      unlinkSync(cache);
      expect(existsSync(cache)).toBe(false);
      const rebuilt = rebuildPublicationReceipt({
        repo_root: fixture.root,
        pr_number: 1,
        gh_bin: fixture.gh,
        });
      expect(rebuilt.receipt).toEqual(first.receipt);
      expect(readPublicationReceiptCache(fixture.root, first.receipt.publication_id)).toEqual(first.receipt);

      const cliResult = JSON.parse(execFileSync(
        process.execPath,
        [join(HARNESS_ROOT, 'src/cli/index.ts'), 'publication', 'receipt', 'rebuild', '--pr', '1'],
        {
          cwd: fixture.root,
          encoding: 'utf-8',
          env: {
            ...process.env,
            REPO_HARNESS_GH_BIN: fixture.gh,
          },
        },
      )) as { ok: boolean; receipt: unknown };
      expect(cliResult.ok).toBe(true);
      expect(cliResult.receipt).toEqual(first.receipt);
    });
  });

  test('reports typed partial failure after a PR exists and rejects a mismatched claim', () => {
    withFixture((fixture) => {
      const createIntent = prepareThenObserve(fixture);
      process.env.GH_FAIL_EDIT = '1';
      try {
        ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: createIntent });
        throw new Error('expected marker persistence to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(PublicationReceiptError);
        expect((error as PublicationReceiptError).code).toBe('publication_incomplete');
      } finally {
        delete process.env.GH_FAIL_EDIT;
      }
      expect(readFileSync(fixture.body, 'utf-8')).toBe('Automated ship body.\n');
      const recovered = ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: createIntent });
      expect(decodePublicationMarker(readFileSync(fixture.body, 'utf-8'))).toEqual(recovered.receipt);
      expect(() => ensurePublicationReceipt({ ...ensureInput(fixture), claim_id: 'wrong-claim' })).toThrow(PublicationReceiptError);
      try {
        ensurePublicationReceipt({ ...ensureInput(fixture), claim_id: 'wrong-claim' });
      } catch (error) {
        expect((error as PublicationReceiptError).code).toBe('publication_claim_mismatch');
      }
      expect(() => ensurePublicationReceipt({ ...ensureInput(fixture), target_branch: 'release' })).toThrow(PublicationReceiptError);
    });
  });

  test('refuses pre-existing markerless PRs and validates target/head references', () => {
    withFixture((fixture) => {
      process.env.GH_PR_EXISTS = '1';
      expect(() => ensurePublicationReceipt(ensureInput(fixture))).toThrow(PublicationReceiptError);
      try {
        preparePublicationReceipt(ensureInput(fixture));
        throw new Error('expected markerless PR preparation to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(PublicationReceiptError);
        expect((error as PublicationReceiptError).code).toBe('publication_claim_mismatch');
      }

      process.env.GH_PR_EXISTS = '0';
      const unpersistedIntent = preparePublicationReceipt(ensureInput(fixture)).create_intent!;
      process.env.GH_PR_EXISTS = '1';
      expect(() => ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: unpersistedIntent })).toThrow(PublicationReceiptError);
      process.env.GH_PR_EXISTS = '0';
      const createIntent = prepareThenObserve(fixture);
      process.env.GH_BASE_REF = 'release';
      expect(() => ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: createIntent })).toThrow(PublicationReceiptError);
      delete process.env.GH_BASE_REF;
      process.env.GH_HEAD_REF = 'codex/retargeted';
      expect(() => ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: createIntent })).toThrow(PublicationReceiptError);
      delete process.env.GH_HEAD_REF;

      const persisted = ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: createIntent });
      process.env.GH_BASE_SHA = 'f'.repeat(40);
      expect(() => rebuildPublicationReceipt({
        repo_root: fixture.root,
        pr_number: persisted.receipt.pr_number,
        gh_bin: fixture.gh,
        })).toThrow(PublicationReceiptError);
      delete process.env.GH_BASE_SHA;
      process.env.GH_HEAD_REF = 'codex/retargeted';
      expect(() => rebuildPublicationReceipt({
        repo_root: fixture.root,
        pr_number: persisted.receipt.pr_number,
        gh_bin: fixture.gh,
        })).toThrow(PublicationReceiptError);
    });
  });

  test('binds marker write authority to the lease worktree and checked-out branch', () => {
    withFixture((fixture) => {
      const createIntent = prepareThenObserve(fixture);
      expect(() => ensurePublicationReceipt({ ...ensureInput(fixture), branch: 'codex/other', create_intent: createIntent })).toThrow(PublicationReceiptError);

      const lease = readLease(fixture.root, TASK_ID);
      expect(lease.record).not.toBeNull();
      const otherWorktree = join(fixture.root, 'other-worktree');
      mkdirSync(otherWorktree);
      writeLeaseOwnerDurably(fixture.root, TASK_ID, {
        ...lease.record!,
        execution_worktree: otherWorktree,
      });
      try {
        ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: createIntent });
        throw new Error('expected cross-worktree marker write to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(PublicationReceiptError);
        expect((error as PublicationReceiptError).code).toBe('publication_claim_mismatch');
      }
    });
  });


  test('refuses retired V1 cache and marker bytes without migration or overwrite', () => {
    withFixture((fixture) => {
      const intent = prepareThenObserve(fixture);
      const result = ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: intent });
      const { candidate_diff_fingerprint, ...retained } = result.receipt;
      const oldReceipt = { ...retained, protocol: 1, review_subject_sha256: SUBJECT, verification_evidence_sha256: SUBJECT };
      expect(() => validatePublicationReceipt(oldReceipt)).toThrow('version 1 is retired');
      const cache = publicationReceiptPath(fixture.root, result.receipt.publication_id);
      const oldBytes = `${JSON.stringify(oldReceipt)}\n`;
      writeFileSync(cache, oldBytes);
      expect(() => readPublicationReceiptCache(fixture.root, result.receipt.publication_id)).toThrow(PublicationReceiptError);
      expect(() => writePublicationReceiptCache(fixture.root, result.receipt)).toThrow(PublicationReceiptError);
      expect(readFileSync(cache, 'utf-8')).toBe(oldBytes);
      const oldMarker = `<!-- repo-harness-publication-receipt:v1:${Buffer.from(JSON.stringify(oldReceipt)).toString('base64url')} -->`;
      writeFileSync(fixture.body, `human text\n${oldMarker}\n`);
      const bodyBefore = readFileSync(fixture.body, 'utf-8');
      expect(() => decodePublicationMarker(bodyBefore)).toThrow('marker version 1 is retired');
      expect(() => replacePublicationMarker(bodyBefore, result.receipt)).toThrow('marker version 1 is retired');
      expect(() => ensurePublicationReceipt(ensureInput(fixture))).toThrow(PublicationReceiptError);
      expect(() => rebuildPublicationReceipt({ repo_root: fixture.root, pr_number: 1, gh_bin: fixture.gh })).toThrow(PublicationReceiptError);
      expect(readFileSync(fixture.body, 'utf-8')).toBe(bodyBefore);
      expect(readFileSync(cache, 'utf-8')).toBe(oldBytes);
    });
  });

  test('refuses retired V2 seal-bound cache and marker bytes without migration or overwrite', () => {
    withFixture((fixture) => {
      const intent = prepareThenObserve(fixture);
      const result = ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: intent });
      const oldReceipt = { ...result.receipt, protocol: 2, merge_seal_sha256: SUBJECT };
      expect(() => validatePublicationReceipt(oldReceipt)).toThrow('version 2 is retired');
      const cache = publicationReceiptPath(fixture.root, result.receipt.publication_id);
      const oldBytes = `${JSON.stringify(oldReceipt)}\n`;
      writeFileSync(cache, oldBytes);
      expect(() => readPublicationReceiptCache(fixture.root, result.receipt.publication_id)).toThrow(PublicationReceiptError);
      expect(() => writePublicationReceiptCache(fixture.root, result.receipt)).toThrow(PublicationReceiptError);
      const oldMarker = `<!-- repo-harness-publication-receipt:v2:${Buffer.from(JSON.stringify(oldReceipt)).toString('base64url')} -->`;
      writeFileSync(fixture.body, `human text\n${oldMarker}\n`);
      const bodyBefore = readFileSync(fixture.body, 'utf-8');
      expect(() => decodePublicationMarker(bodyBefore)).toThrow('marker version 2 is retired');
      expect(() => replacePublicationMarker(bodyBefore, result.receipt)).toThrow('marker version 2 is retired');
      expect(() => rebuildPublicationReceipt({ repo_root: fixture.root, pr_number: 1, gh_bin: fixture.gh })).toThrow(PublicationReceiptError);
      expect(readFileSync(fixture.body, 'utf-8')).toBe(bodyBefore);
      expect(readFileSync(cache, 'utf-8')).toBe(oldBytes);
    });
  });

  test('binds the native candidate diff without a host merge seal and rebuild refuses a forged diff', () => {
    withFixture((fixture) => {
      const intent = prepareThenObserve(fixture);
      const result = ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: intent });
      expect(Object.keys(result.receipt)).not.toContain('merge_seal_sha256');
      expect(result.receipt.base_sha).toBe(fixture.base);
      expect(result.receipt.candidate_diff_fingerprint).toBe(candidate(fixture.root, fixture.base).diffFingerprint);
      const { protocol: _protocol, kind: _kind, publication_id: _id, ...input } = result.receipt;
      const forged = buildPublicationReceipt({ ...input, candidate_diff_fingerprint: SUBJECT });
      expect(forged.publication_id).toBe(result.receipt.publication_id);
      unlinkSync(publicationReceiptPath(fixture.root, result.receipt.publication_id));
      writeFileSync(fixture.body, replacePublicationMarker('Automated ship body.\n', forged));
      expect(() => rebuildPublicationReceipt({ repo_root: fixture.root, pr_number: 1, gh_bin: fixture.gh }))
        .toThrow('candidate diff no longer matches');
      expect(readPublicationReceiptCache(fixture.root, result.receipt.publication_id)).toBeNull();
    });
  });

  test('returns a typed refusal for unavailable native Git evidence and keeps the host alive', () => {
    withFixture((fixture) => {
      const intent = prepareThenObserve(fixture);
      process.env.GH_BASE_SHA = 'f'.repeat(40);
      expect(() => ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: intent }))
        .toThrow('candidate diff evidence is unavailable: git rev-parse');
      expect(readFileSync(fixture.body, 'utf-8')).toBe('Automated ship body.\n');
      delete process.env.GH_BASE_SHA;
      expect(ensurePublicationReceipt({ ...ensureInput(fixture), create_intent: intent }).receipt.protocol).toBe(3);
    });
  });

  test('holds the task lock across the adjacent owner re-read and marker write', () => {
    const source = readFileSync(join(HARNESS_ROOT, 'src/effects/publication/publication-receipt.ts'), 'utf-8');
    const lock = source.lastIndexOf('withTaskLock(input.repo_root, input.task_id, () => {');
    const markerWrite = source.indexOf('updateProviderBody(input.repo_root, ghBin, provider.pr_number, updatedBody);', lock);
    const lockClose = source.indexOf('\n      });', lock);
    expect(lock).toBeGreaterThan(-1);
    expect(markerWrite).toBeGreaterThan(lock);
    expect(markerWrite).toBeLessThan(lockClose);
  });
});
