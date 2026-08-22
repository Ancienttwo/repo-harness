import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

import { publicationJournalEvidence } from '../../src/effects/publication/publication-receipt';
import {
  abandonPublication,
  enterPublicationReviewing,
  inspectLegacyPublication,
  migrateLegacyPublication,
  reopenPublication,
  takeoverPublication,
} from '../../src/effects/publication/publication-lifecycle';
import { PublicationLifecycleError } from '../../src/core/publication/publication-lifecycle';
import { preparePublicationReceipt, ensurePublicationReceipt } from '../../src/effects/publication/publication-receipt';
import { beginLeaseCompletionRecord, bindLeaseRecord, buildLeaseOwnerRecord, deriveTaskId, deriveTaskRevision } from '../../src/core/state/coordination-identity';
import { createLeaseDirectory, readLease, writeLeaseOwnerDurably } from '../../src/effects/state/coordination-lease-store';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

const CLAIM = 'claim-lifecycle';
const SUBJECT = `sha256:${'3'.repeat(64)}`;
const SPRINT_PATH = 'plans/sprints/demo.sprint.md';
const TASK_CELL = 'review lifecycle';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

interface Fixture {
  readonly root: string;
  readonly taskId: string;
  readonly revision: string;
  readonly head: string;
  readonly gh: string;
  readonly body: string;
  readonly seal: string;
  readonly checks: string;
  readonly journal: string;
  readonly shipKey: string;
}

function deriveShipKey(root: string, transactionRoot: string, originalHead: string, baseSha: string): string {
  return execFileSync('git', ['hash-object', '--stdin'], {
    cwd: root,
    input: [
      `repo=${transactionRoot}`,
      `worktree=${root}`,
      'operation=ship',
      'plan=',
      'contract=',
      `original_head=${originalHead}`,
      'target_branch=main',
      `base_sha=${baseSha}`,
    ].join('\n') + '\n',
    encoding: 'utf-8',
  }).trim();
}

function installFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-publication-lifecycle-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Lifecycle Test');
  git(root, 'config', 'user.email', 'lifecycle@test.invalid');
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, SPRINT_PATH), [
    '# Sprint: lifecycle', '', '## Backlog', '',
    '| # | Status | Task | Mode | Acceptance | Plan |',
    '|---|--------|------|------|------------|------|',
    `| 1 | [ ] | ${TASK_CELL} | contract | lifecycle tests | (pending) |`, '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  const repoIdentity = resolveRepoIdentity(root);
  const taskId = deriveTaskId({ repoIdentity, sprintPath: SPRINT_PATH, taskCell: TASK_CELL });
  const revision = deriveTaskRevision({ taskId, modeCell: 'contract', acceptanceCell: 'lifecycle tests' });
  git(root, 'switch', '-c', 'codex/lifecycle');
  writeFileSync(join(root, 'feature.txt'), 'lifecycle\n');
  mkdirSync(join(root, '.ai/harness/checks'), { recursive: true });
  const checks = join(root, '.ai/harness/checks/latest.json');
  writeFileSync(checks, JSON.stringify({ status: 'pass', review_subject_sha256: SUBJECT }) + '\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'feature');
  const head = git(root, 'rev-parse', 'HEAD');
  const base = git(root, 'rev-parse', 'main');
  const record = buildLeaseOwnerRecord({
    claimId: CLAIM, taskId, taskRevision: revision, sprintPath: SPRINT_PATH, targetRef: 'main', generation: 1,
    sessionId: 'session-one', sourceWorktree: root,
  });
  const bound = bindLeaseRecord(record, { claimId: CLAIM, executionWorktree: root, branch: 'codex/lifecycle', unitRef: 'plans/plan-lifecycle.md' });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, { claimId: CLAIM, executionWorktree: root, finishTransactionKey: 'finish/lifecycle' });
  if (!completing.ok) throw new Error(completing.error);
  if (!createLeaseDirectory(root, taskId)) throw new Error('lease election failed');
  writeLeaseOwnerDurably(root, taskId, completing.record);
  const seal = join(root, 'seal.json');
  writeFileSync(seal, JSON.stringify({ protocol: 1, kind: 'repo-harness-merge-seal', base_sha: base, head_sha: head, acceptance_subject_sha256: SUBJECT }) + '\n');
  const body = join(root, 'pr-body.md'); writeFileSync(body, 'PR body\n');
  const gh = join(root, 'fake-gh.sh');
  writeFileSync(gh, [
    '#!/bin/bash', 'set -euo pipefail',
    'head="$(git rev-parse HEAD)"', 'base="$(git rev-parse main)"', 'body="$(jq -Rs . < "$GH_BODY_FILE")"',
    'merged_at="null"; [[ -z "${GH_PR_MERGED_AT:-}" ]] || merged_at="\\"$GH_PR_MERGED_AT\\""',
    'pr="{\\"number\\":1,\\"url\\":\\"https://example.invalid/pr/1\\",\\"headRefOid\\":\\"$head\\",\\"headRefName\\":\\"codex/lifecycle\\",\\"baseRefName\\":\\"main\\",\\"baseRefOid\\":\\"$base\\",\\"body\\":$body,\\"createdAt\\":\\"2026-08-22T04:05:55Z\\",\\"state\\":\\"${GH_PR_STATE:-OPEN}\\",\\"mergedAt\\":$merged_at}"',
    'if [[ "$1 $2" == "repo view" ]]; then printf \'{"id":"R_lifecycle"}\\n\'; exit 0; fi',
    'if [[ "$1 $2" == "pr list" ]]; then [[ "${GH_PR_EXISTS:-0}" == "1" ]] && printf \'[%s]\\n\' "$pr" || printf \'[]\\n\'; exit 0; fi',
    'if [[ "$1 $2" == "pr view" ]]; then printf \'%s\\n\' "$pr"; exit 0; fi',
    'if [[ "$1 $2" == "pr edit" ]]; then printf \'%s\' "$5" > "$GH_BODY_FILE"; exit 0; fi',
    'exit 2', '',
  ].join('\n'));
  chmodSync(gh, 0o755);
  const transactionRoot = join(resolveGitCommonDirectory(root), 'repo-harness/transactions');
  const shipKey = deriveShipKey(root, transactionRoot, head, base);
  const journal = join(transactionRoot, 'ship', shipKey, 'status.json');
  mkdirSync(dirname(journal), { recursive: true });
  writeFileSync(join(dirname(journal), 'meta.json'), JSON.stringify({
    operation: 'ship', key: shipKey, repo: transactionRoot, worktree: root,
    branch: 'codex/lifecycle', plan: '', contract: '', original_head: head,
    target_branch: 'main', base_ref: 'refs/remotes/origin/main', base_sha: base,
  }) + '\n');
  return { root, taskId, revision, head, gh, body, seal, checks, journal, shipKey };
}

function withFixture(run: (fixture: Fixture) => void): void {
  const fixture = installFixture();
  const before = { ...process.env };
  process.env.GH_BODY_FILE = fixture.body;
  process.env.GH_PR_EXISTS = '0';
  process.env.GH_PR_STATE = 'OPEN';
  delete process.env.GH_PR_MERGED_AT;
  try { run(fixture); } finally { process.env = before; rmSync(fixture.root, { recursive: true, force: true }); }
}

function createReceiptAndJournal(fixture: Fixture) {
  const input = { repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM, branch: 'codex/lifecycle', target_branch: 'main', gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks };
  const prepared = preparePublicationReceipt(input);
  if (prepared.create_intent === null) throw new Error('fixture expected creation intent');
  writeFileSync(fixture.journal, JSON.stringify({
    operation: 'ship', key: fixture.shipKey, status: 'in_progress', phases: [
      { phase: 'gate_sealed', ref: fixture.head },
      { phase: 'pushed', ref: fixture.head },
      { phase: 'publication_create_intent', publication: prepared },
    ],
  }) + '\n');
  process.env.GH_PR_EXISTS = '1';
  const ensured = ensurePublicationReceipt({ ...input, create_intent: prepared.create_intent, create_intent_journal_path: fixture.journal });
  writeFileSync(fixture.journal, JSON.stringify({ operation: 'ship', key: fixture.shipKey, status: 'in_progress', phases: [
    { phase: 'gate_sealed', ref: fixture.head },
    { phase: 'pushed', ref: fixture.head },
    { phase: 'publication_create_intent', publication: prepared },
    { phase: 'pr_observed', ref: fixture.head, publication: publicationJournalEvidence(ensured.receipt) },
  ] }) + '\n');
  return ensured.receipt;
}

function completeLegacyJournal(fixture: Fixture, receipt: ReturnType<typeof createReceiptAndJournal>): void {
  const inProgress = JSON.parse(readFileSync(fixture.journal, 'utf-8')) as { phases: unknown[] };
  writeFileSync(fixture.journal, JSON.stringify({
    operation: 'ship', key: fixture.shipKey, status: 'complete',
    phases: [...inProgress.phases, { phase: 'complete', ref: fixture.head }],
  }) + '\n');
}

describe('task-locked publication lifecycle', () => {
  test('enters reviewing after marker-backed journal evidence and same-owner reopen fences topology', () => withFixture((fixture) => {
    const receipt = createReceiptAndJournal(fixture);
    const enterInput = { repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM, ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal, gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks };
    expect(() => enterPublicationReviewing({ ...enterInput, ship_journal_path: join(fixture.root, 'untrusted-status.json') }))
      .toThrow('key-derived common-directory ship journal');
    expect(readLease(fixture.root, fixture.taskId).record?.state).toBe('completing');
    const pointer = enterPublicationReviewing(enterInput);
    expect(pointer.publication_id).toBe(receipt.publication_id);
    expect(readLease(fixture.root, fixture.taskId).record).toMatchObject({ record_schema: 2, state: 'reviewing', current_publication: pointer });
    expect(enterPublicationReviewing(enterInput)).toEqual(pointer);
    expect(() => reopenPublication({ ...enterInput, expected_generation: 2, publication_id: receipt.publication_id, expected_head_sha: receipt.head_sha }))
      .toThrow('expected generation 2');
    expect(readLease(fixture.root, fixture.taskId).record?.state).toBe('reviewing');
    const reopened = reopenPublication({ ...enterInput, expected_generation: 1, publication_id: receipt.publication_id, expected_head_sha: receipt.head_sha });
    expect(reopened).toMatchObject({ record_schema: 2, state: 'bound', current_publication: null, claim_id: CLAIM });
  }));

  test('reopen authorization fence blocks the lease write after transport entry authorization is revoked', () => withFixture((fixture) => {
    const receipt = createReceiptAndJournal(fixture);
    const enterInput = { repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM, ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal, gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks };
    enterPublicationReviewing(enterInput);
    const before = readLease(fixture.root, fixture.taskId).raw;
    expect(() => reopenPublication({
      ...enterInput,
      expected_generation: 1,
      publication_id: receipt.publication_id,
      expected_head_sha: receipt.head_sha,
      authorization_fence: () => {
        throw new PublicationLifecycleError('publication_claim_mismatch', 'authorization was revoked before reopen mutation');
      },
    })).toThrow('authorization was revoked before reopen mutation');
    expect(readLease(fixture.root, fixture.taskId).raw).toBe(before);
  }));

  test('takeover writes reserving and abandon persists lineage before removing the lease', () => withFixture((fixture) => {
    const receipt = createReceiptAndJournal(fixture);
    enterPublicationReviewing({ repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM, ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal, gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks });
    expect(() => takeoverPublication({
      repo_root: fixture.root, task_id: fixture.taskId, expected_claim_id: CLAIM, expected_generation: 1,
      publication_id: receipt.publication_id, expected_head_sha: 'd'.repeat(40), reason: 'CI repair', session_id: 'session-two', new_claim_id: 'claim-two', source_worktree: fixture.root,
      gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks,
    })).toThrow('publication_pointer_mismatch');
    expect(readLease(fixture.root, fixture.taskId).record?.state).toBe('reviewing');
    const taken = takeoverPublication({
      repo_root: fixture.root, task_id: fixture.taskId, expected_claim_id: CLAIM, expected_generation: 1,
      publication_id: receipt.publication_id, expected_head_sha: receipt.head_sha, reason: 'CI repair', session_id: 'session-two', new_claim_id: 'claim-two', source_worktree: fixture.root,
      gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks,
    });
    expect(taken).toMatchObject({ state: 'reserving', generation: 2, claim_id: 'claim-two', current_publication: null, execution_worktree: null });

    // A new fixture keeps the reviewing pointer so abandon proves lineage-first removal.
    const second = installFixture();
    const previous = { ...process.env }; process.env.GH_BODY_FILE = second.body; process.env.GH_PR_EXISTS = '0';
    try {
      const secondReceipt = createReceiptAndJournal(second);
      enterPublicationReviewing({ repo_root: second.root, task_id: second.taskId, claim_id: CLAIM, ship_transaction_key: second.shipKey, ship_journal_path: second.journal, gh_bin: second.gh, merge_seal_path: second.seal, checks_path: second.checks });
      expect(() => abandonPublication({ repo_root: second.root, task_id: second.taskId, expected_claim_id: CLAIM, expected_generation: 1, publication_id: secondReceipt.publication_id, expected_head_sha: secondReceipt.head_sha, reason: 'closed unmerged', gh_bin: second.gh, merge_seal_path: second.seal, checks_path: second.checks })).toThrow('CLOSED and unmerged');
      process.env.GH_PR_STATE = 'CLOSED'; process.env.GH_PR_MERGED_AT = '2026-08-22T05:00:00Z';
      expect(() => abandonPublication({ repo_root: second.root, task_id: second.taskId, expected_claim_id: CLAIM, expected_generation: 1, publication_id: secondReceipt.publication_id, expected_head_sha: secondReceipt.head_sha, reason: 'closed unmerged', gh_bin: second.gh, merge_seal_path: second.seal, checks_path: second.checks })).toThrow('CLOSED and unmerged');
      delete process.env.GH_PR_MERGED_AT;
      const lineage = abandonPublication({ repo_root: second.root, task_id: second.taskId, expected_claim_id: CLAIM, expected_generation: 1, publication_id: secondReceipt.publication_id, expected_head_sha: secondReceipt.head_sha, reason: 'closed unmerged', gh_bin: second.gh, merge_seal_path: second.seal, checks_path: second.checks });
      expect(lineage.publication_id).toBe(secondReceipt.publication_id);
      expect(readLease(second.root, second.taskId).classification).toBe('available');
      const lineagePath = join(resolveGitCommonDirectory(second.root), 'repo-harness/publications/v1/lineage', `${secondReceipt.publication_id.slice('sha256:'.length)}.json`);
      expect(existsSync(lineagePath)).toBe(true);
      expect(JSON.parse(readFileSync(lineagePath, 'utf-8')).reason).toBe('closed unmerged');
    } finally { process.env = previous; rmSync(second.root, { recursive: true, force: true }); }
  }));

  test('takeover authorization fence blocks the lease write after transport entry authorization is revoked', () => withFixture((fixture) => {
    const receipt = createReceiptAndJournal(fixture);
    const enterInput = { repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM, ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal, gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks };
    enterPublicationReviewing(enterInput);
    const before = readLease(fixture.root, fixture.taskId).raw;
    expect(() => takeoverPublication({
      repo_root: fixture.root,
      task_id: fixture.taskId,
      expected_claim_id: CLAIM,
      expected_generation: 1,
      publication_id: receipt.publication_id,
      expected_head_sha: receipt.head_sha,
      reason: 'CI repair',
      session_id: 'session-two',
      new_claim_id: 'claim-two',
      source_worktree: fixture.root,
      gh_bin: fixture.gh,
      merge_seal_path: fixture.seal,
      checks_path: fixture.checks,
      authorization_fence: () => {
        throw new PublicationLifecycleError('publication_claim_mismatch', 'authorization was revoked before takeover mutation');
      },
    })).toThrow('authorization was revoked before takeover mutation');
    expect(readLease(fixture.root, fixture.taskId).raw).toBe(before);
  }));

  test('reopen revalidates the live marker/provider receipt before any lease mutation', () => withFixture((fixture) => {
    const receipt = createReceiptAndJournal(fixture);
    enterPublicationReviewing({ repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM, ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal, gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks });
    writeFileSync(fixture.body, 'marker removed after review entry\n');
    expect(() => reopenPublication({
      repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM, expected_generation: 1,
      publication_id: receipt.publication_id, expected_head_sha: receipt.head_sha,
      gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks,
    })).toThrow('publication receipt marker');
    expect(readLease(fixture.root, fixture.taskId).record?.state).toBe('reviewing');
  }));

  test('legacy inspection only classifies a complete marker-backed receipt, journal, and lease join as migratable', () => withFixture((fixture) => {
    const receipt = createReceiptAndJournal(fixture);
    const premature = inspectLegacyPublication({
      repo_root: fixture.root, task_id: fixture.taskId, expected_claim_id: CLAIM,
      ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal,
      gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks,
    });
    expect(premature.classification).toBe('legacy_unattributable');
    completeLegacyJournal(fixture, receipt);
    const migratable = inspectLegacyPublication({
      repo_root: fixture.root, task_id: fixture.taskId, expected_claim_id: CLAIM,
      ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal,
      gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks,
    });
    expect(migratable.classification).toBe('migratable');
    const migrated = migrateLegacyPublication({
      repo_root: fixture.root, task_id: fixture.taskId, claim_id: CLAIM,
      ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal,
      gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks,
    });
    expect(migrated.publication_id).toBe(receipt.publication_id);
    writeFileSync(fixture.body, 'marker intentionally absent\n');
    const unattributable = inspectLegacyPublication({
      repo_root: fixture.root, task_id: fixture.taskId, expected_claim_id: CLAIM,
      ship_transaction_key: fixture.shipKey, ship_journal_path: fixture.journal,
      gh_bin: fixture.gh, merge_seal_path: fixture.seal, checks_path: fixture.checks,
    });
    expect(unattributable.classification).toBe('legacy_unattributable');
  }));
});
