import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import {
  buildPublicationReceipt,
  encodePublicationMarker,
  publicationSha256,
  publicationReceiptDigest,
} from '../../src/core/publication/publication-receipt';
import {
  buildRepairDispatchProof,
  buildReactionAttemptReceipt,
  deriveReactionToken,
  transitionRepairDispatchProof,
} from '../../src/core/publication/feedback';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskRevision,
  enterReviewingLeaseRecord,
} from '../../src/core/state/coordination-identity';
import {
  appendReactionAttemptReceipt,
  feedbackEventPath,
  readFeedbackDeliveryReceipts,
  readFeedbackEvents,
  readReactionAttemptReceipts,
  writeRepairDispatchProof,
} from '../../src/effects/publication/feedback-store';
import {
  publicationJournalEvidence,
  readPublicationReceiptCache,
  writePublicationReceiptCache,
} from '../../src/effects/publication/publication-receipt';
import { resolveRepoIdentity } from '../../src/effects/state/coordination-canonical-source';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';
import {
  createLeaseDirectory,
  leaseDirectory,
  readLease,
  writeLeaseOwnerDurably,
} from '../../src/effects/state/coordination-lease-store';
import { fixtureTaskId } from '../helpers/sprint-fixture';

const CLI = resolve(import.meta.dir, '../../src/cli/index.ts');
const CLAIM = 'claim-feedback-cli';
const SPRINT = 'plans/sprints/feedback-cli.sprint.md';
const TASK = 'repair provider feedback from CLI';
const REVIEW_SUBJECT = `sha256:${'3'.repeat(64)}`;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function fakeGh(root: string, head: string, base: string): string {
  const path = join(root, 'fake-gh.ts');
  writeFileSync(path, `#!/usr/bin/env bun
const args = Bun.argv.slice(2);
const query = args.find((value) => value.startsWith('query=')) ?? '';
const body = process.env.GH_BODY_FILE ? await Bun.file(process.env.GH_BODY_FILE).text() : '';
const observedHead = process.env.GH_HEAD_OVERRIDE ?? '${head}';
let value;
if (args[0] === 'repo' && args[1] === 'view') {
  value = { id: 'R_feedback_cli' };
} else if (args[0] === 'pr' && args[1] === 'view') {
  value = {
    number: 7,
    url: 'https://example.invalid/pr/7',
    state: 'OPEN',
    isDraft: false,
    headRefOid: observedHead,
    headRefName: 'codex/feedback-cli',
    baseRefOid: '${base}',
    baseRefName: 'main',
    mergeStateStatus: 'CONFLICTING',
    body,
    createdAt: '2026-08-23T00:00:00Z',
    mergedAt: null,
  };
} else if (query.includes('checkSuites')) {
  value = { data: { node: { pullRequest: { commits: { nodes: [{ commit: {
    oid: observedHead,
    checkSuites: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'SUITE_1' }] },
  } }] } } } } };
} else if (query.includes('checkRuns')) {
  value = { data: { node: { checkRuns: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
    id: 'CHECK_1', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-08-23T00:00:01Z',
  }] } } } };
} else if (query.includes('CheckRun')) {
  value = { data: { node: {
    id: 'CHECK_1', name: 'provider-check', detailsUrl: 'https://example.invalid/check/1',
    status: 'COMPLETED', conclusion: 'FAILURE',
    output: { title: 'Untrusted provider title', summary: 'UNTRUSTED-CHECK-BODY', text: null },
  } } };
} else if (query.includes('reviews(')) {
  value = { data: { node: { pullRequest: { reviews: {
    pageInfo: { hasNextPage: false, endCursor: null }, nodes: [],
  } } } } };
} else if (query.includes('reviewThreads')) {
  value = { data: { node: { pullRequest: { reviewThreads: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [{ id: 'THREAD_1', isResolved: false, updatedAt: '2026-08-23T00:00:02Z' }],
  } } } } };
} else {
  process.stderr.write('unexpected gh arguments: ' + args.join(' ') + '\\n');
  process.exit(2);
}
process.stdout.write(JSON.stringify(value));
`, { mode: 0o755 });
  chmodSync(path, 0o755);
  return path;
}

interface Fixture {
  readonly root: string;
  readonly publicationId: string;
  readonly fakeGh: string;
  readonly taskId: string;
  readonly taskRevision: string;
  readonly claimId: string;
  readonly generation: number;
  readonly headSha: string;
  readonly baseSha: string;
  readonly checksPath: string;
  readonly sealPath: string;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'fleet-feedback-cli-'));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Fleet Feedback CLI Test');
  git(root, 'config', 'user.email', 'fleet-feedback-cli@test.invalid');
  mkdirSync(join(root, 'plans/sprints'), { recursive: true });
  writeFileSync(join(root, SPRINT), [
    '# Sprint: feedback CLI', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${TASK}`)} | [ ] | ${TASK} | contract | provider feedback passes | (pending) |`, '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'feedback cli fixture\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'seed feedback CLI fixture');

  const repoIdentity = resolveRepoIdentity(root);
  const taskId = fixtureTaskId(TASK);
  const taskRevision = deriveTaskRevision({ taskCell: TASK, taskId, modeCell: 'contract', acceptanceCell: 'provider feedback passes' });
  git(root, 'switch', '-c', 'codex/feedback-cli');
  writeFileSync(join(root, 'feature.txt'), 'feedback\n');
  mkdirSync(join(root, '.ai/harness/checks'), { recursive: true });
  const checksPath = join(root, '.ai/harness/checks/latest.json');
  writeFileSync(checksPath, JSON.stringify({ status: 'pass', review_subject_sha256: REVIEW_SUBJECT }) + '\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'add feedback fixture change');

  const headSha = git(root, 'rev-parse', 'HEAD');
  const baseSha = git(root, 'rev-parse', 'main');
  const treeSha = git(root, 'rev-parse', 'HEAD^{tree}');
  const sealPath = join(root, 'seal.json');
  const sealBytes = `${JSON.stringify({
    protocol: 1,
    kind: 'repo-harness-merge-seal',
    base_sha: baseSha,
    head_sha: headSha,
    acceptance_subject_sha256: REVIEW_SUBJECT,
  })}\n`;
  writeFileSync(sealPath, sealBytes);

  const receipt = buildPublicationReceipt({
    repo_id: publicationSha256(resolveGitCommonDirectory(root)),
    task_id: taskId,
    task_revision: taskRevision,
    claim_id: CLAIM,
    generation: 1,
    target_ref: 'main',
    base_sha: baseSha,
    branch: 'codex/feedback-cli',
    head_sha: headSha,
    tree_sha: treeSha,
    review_subject_sha256: REVIEW_SUBJECT,
    verification_evidence_sha256: publicationSha256(readFileSync(checksPath)),
    merge_seal_sha256: publicationSha256(sealBytes),
    provider: 'github',
    provider_repo_id: 'R_feedback_cli',
    pr_number: 7,
    pr_url: 'https://example.invalid/pr/7',
    created_at: '2026-08-23T00:00:00Z',
  });
  writePublicationReceiptCache(root, receipt);
  const bodyPath = join(root, 'pr-body.md');
  writeFileSync(bodyPath, `PR body\n\n${encodePublicationMarker(receipt)}\n`);

  const owner = buildLeaseOwnerRecord({
    claimId: CLAIM,
    taskId,
    taskRevision,
    sprintPath: SPRINT,
    targetRef: 'main',
    generation: 1,
    sessionId: 'feedback-cli-session',
    sourceWorktree: root,
  });
  const bound = bindLeaseRecord(owner, {
    claimId: CLAIM,
    executionWorktree: root,
    branch: 'codex/feedback-cli',
    unitRef: 'plans/plan-feedback-cli.md',
  });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, {
    claimId: CLAIM,
    executionWorktree: root,
    finishTransactionKey: null,
  });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId: CLAIM,
    publication: {
      publication_id: receipt.publication_id,
      receipt_sha256: publicationReceiptDigest(receipt),
      head_sha: headSha,
      ship_transaction_key: 'ship-feedback-cli',
    },
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!createLeaseDirectory(root, taskId)) throw new Error('feedback CLI lease creation failed');
  writeLeaseOwnerDurably(root, taskId, reviewing.record);

  return {
    root,
    publicationId: receipt.publication_id,
    fakeGh: fakeGh(root, headSha, baseSha),
    taskId,
    taskRevision,
    claimId: CLAIM,
    generation: 1,
    headSha,
    baseSha,
    checksPath,
    sealPath,
  };
}

function addAmbiguousReviewingPublication(subject: Fixture): void {
  const source = readPublicationReceiptCache(subject.root, subject.publicationId);
  if (source === null) throw new Error('fixture source receipt is unavailable');
  const sprintPath = 'plans/sprints/feedback-cli-ambiguous.sprint.md';
  const taskCell = 'second current reviewing publication';
  const task = 'second current reviewing publication';
  writeFileSync(join(subject.root, sprintPath), [
    '# Sprint: feedback CLI ambiguity', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${task}`)} | [ ] | ${task} | contract | provider feedback passes | (pending) |`, '',
  ].join('\n'));
  const repoIdentity = resolveRepoIdentity(subject.root);
  const taskId = fixtureTaskId(taskCell);
  const taskRevision = deriveTaskRevision({ taskCell: TASK,
    taskId,
    modeCell: 'contract',
    acceptanceCell: 'provider feedback passes',
  });
  const claimId = 'claim-feedback-cli-ambiguous';
  const receipt = buildPublicationReceipt({
    repo_id: source.repo_id,
    task_id: taskId,
    task_revision: taskRevision,
    claim_id: claimId,
    generation: 1,
    target_ref: source.target_ref,
    base_sha: source.base_sha,
    branch: 'codex/feedback-cli-ambiguous',
    head_sha: source.head_sha,
    tree_sha: source.tree_sha,
    review_subject_sha256: source.review_subject_sha256,
    verification_evidence_sha256: source.verification_evidence_sha256,
    merge_seal_sha256: source.merge_seal_sha256,
    provider: source.provider,
    provider_repo_id: source.provider_repo_id,
    pr_number: source.pr_number + 1,
    pr_url: 'https://example.invalid/pr/8',
    created_at: '2026-08-23T00:00:01Z',
  });
  writePublicationReceiptCache(subject.root, receipt);
  const owner = buildLeaseOwnerRecord({
    claimId,
    taskId,
    taskRevision,
    sprintPath,
    targetRef: source.target_ref,
    generation: 1,
    sessionId: 'feedback-cli-ambiguous-session',
    sourceWorktree: subject.root,
  });
  const bound = bindLeaseRecord(owner, {
    claimId,
    executionWorktree: subject.root,
    branch: receipt.branch,
    unitRef: 'plans/plan-feedback-cli-ambiguous.md',
  });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, {
    claimId,
    executionWorktree: subject.root,
    finishTransactionKey: null,
  });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId,
    publication: {
      publication_id: receipt.publication_id,
      receipt_sha256: publicationReceiptDigest(receipt),
      head_sha: receipt.head_sha,
      ship_transaction_key: 'ship-feedback-cli-ambiguous',
    },
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!createLeaseDirectory(subject.root, taskId)) throw new Error('ambiguous lease creation failed');
  writeLeaseOwnerDurably(subject.root, taskId, reviewing.record);
}

function runCli(fixture: Fixture, args: readonly string[], envOverrides: Record<string, string> = {}) {
  return spawnSync('bun', [CLI, ...args], {
    cwd: fixture.root,
    encoding: 'utf8',
    env: {
      ...process.env,
      REPO_HARNESS_GH_BIN: fixture.fakeGh,
      REPO_HARNESS_GIT_BIN: 'git',
      REPO_HARNESS_PUBLICATION_SEAL_PATH: fixture.sealPath,
      REPO_HARNESS_PUBLICATION_CHECKS_PATH: fixture.checksPath,
      GH_BODY_FILE: join(fixture.root, 'pr-body.md'),
      ...envOverrides,
    },
  });
}

function repairFenceArgs(subject: Fixture, offer: Record<string, unknown>): string[] {
  return [
    '--publication-id', subject.publicationId,
    '--feedback-revision', String(offer.feedback_revision),
    '--task-id', subject.taskId,
    '--claim-id', subject.claimId,
    '--generation', String(subject.generation),
    '--head-sha', subject.headSha,
  ];
}

function dispatchedProofForOffer(subject: Fixture, offer: Record<string, unknown>, reactionToken: string) {
  const receipt = readPublicationReceiptCache(subject.root, subject.publicationId);
  if (receipt === null) throw new Error('fixture publication receipt is unavailable');
  const prepared = buildRepairDispatchProof({
    publication_id: receipt.publication_id,
    receipt_sha256: publicationReceiptDigest(receipt),
    task_id: receipt.task_id,
    task_revision: receipt.task_revision,
    claim_id: receipt.claim_id,
    generation: receipt.generation,
    head_sha: receipt.head_sha,
    ship_transaction_key: 'ship-feedback-cli',
    feedback_revision: String(offer.feedback_revision),
    before_reaction_token: reactionToken,
    action: 'resume_same_owner',
    phase: 'prepared',
    successor_claim_id: null,
    successor_generation: null,
    successor_state: null,
  });
  const dispatched = transitionRepairDispatchProof(prepared, {
    successor_claim_id: subject.claimId,
    successor_generation: subject.generation,
    successor_state: 'bound',
  });
  writeRepairDispatchProof(subject.root, subject.publicationId, prepared);
  writeRepairDispatchProof(subject.root, subject.publicationId, dispatched);
  return dispatched;
}

function appendCompletedReaction(subject: Fixture, proof: ReturnType<typeof dispatchedProofForOffer>, token: string, recordedAt: string): void {
  const receipt = readPublicationReceiptCache(subject.root, subject.publicationId);
  if (receipt === null) throw new Error('fixture publication receipt is unavailable');
  appendReactionAttemptReceipt(subject.root, subject.publicationId, buildReactionAttemptReceipt({
    publication_id: subject.publicationId,
    repair_id: proof.repair_id,
    successor_claim_id: proof.successor_claim_id!,
    successor_generation: proof.successor_generation!,
    completion_publication_id: receipt.publication_id,
    completion_receipt_sha256: publicationReceiptDigest(receipt),
    completion_head_sha: receipt.head_sha,
    completion_ship_transaction_key: `completion-${recordedAt}`,
    before_reaction_token: token,
    after_reaction_token: token,
    outcome: 'completed',
    recorded_at: recordedAt,
  }));
}

function prepareCompletionPublication(subject: Fixture) {
  const source = readPublicationReceiptCache(subject.root, subject.publicationId);
  if (source === null) throw new Error('fixture source receipt is unavailable');
  writeFileSync(join(subject.root, 'repair-complete.txt'), 'completed\n');
  git(subject.root, 'add', 'repair-complete.txt');
  git(subject.root, 'commit', '-m', 'complete feedback repair');
  const completionHead = git(subject.root, 'rev-parse', 'HEAD');
  const completionTree = git(subject.root, 'rev-parse', 'HEAD^{tree}');
  const completion = buildPublicationReceipt({
    repo_id: source.repo_id,
    task_id: source.task_id,
    task_revision: source.task_revision,
    claim_id: source.claim_id,
    generation: source.generation,
    target_ref: source.target_ref,
    base_sha: source.base_sha,
    branch: source.branch,
    head_sha: completionHead,
    tree_sha: completionTree,
    review_subject_sha256: source.review_subject_sha256,
    verification_evidence_sha256: source.verification_evidence_sha256,
    merge_seal_sha256: source.merge_seal_sha256,
    provider: source.provider,
    provider_repo_id: source.provider_repo_id,
    pr_number: source.pr_number,
    pr_url: source.pr_url,
    created_at: '2026-08-23T00:10:00Z',
  });
  writePublicationReceiptCache(subject.root, completion);
  const transactionRoot = join(resolveGitCommonDirectory(subject.root), 'repo-harness/transactions');
  const metadata = {
    operation: 'ship',
    repo: transactionRoot,
    worktree: subject.root,
    branch: source.branch,
    plan: '',
    contract: '',
    original_head: completionHead,
    target_branch: source.target_ref,
    base_ref: 'refs/remotes/origin/main',
    base_sha: source.base_sha,
  };
  const shipTransactionKey = execFileSync('git', ['hash-object', '--stdin'], {
    cwd: subject.root,
    input: [
      `repo=${metadata.repo}`,
      `worktree=${metadata.worktree}`,
      'operation=ship',
      'plan=',
      'contract=',
      `original_head=${metadata.original_head}`,
      `target_branch=${metadata.target_branch}`,
      `base_sha=${metadata.base_sha}`,
    ].join('\n') + '\n',
    encoding: 'utf8',
  }).trim();
  const journalDirectory = join(transactionRoot, 'ship', shipTransactionKey);
  mkdirSync(journalDirectory, { recursive: true });
  writeFileSync(join(journalDirectory, 'meta.json'), JSON.stringify({ key: shipTransactionKey, ...metadata }) + '\n');
  writeFileSync(join(journalDirectory, 'status.json'), JSON.stringify({
    operation: 'ship',
    key: shipTransactionKey,
    status: 'complete',
    phases: [
      { phase: 'gate_sealed', ref: completion.head_sha },
      { phase: 'pushed', ref: completion.head_sha },
      { phase: 'pr_observed', ref: completion.head_sha, publication: publicationJournalEvidence(completion) },
      { phase: 'complete', ref: completion.head_sha },
    ],
  }) + '\n');
  const lease = readLease(subject.root, subject.taskId).record;
  if (lease === null || lease.state !== 'bound') throw new Error('fixture expected bound successor before completion');
  const completing = beginLeaseCompletionRecord(lease, {
    claimId: source.claim_id,
    executionWorktree: subject.root,
    finishTransactionKey: shipTransactionKey,
  });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId: subject.claimId,
    publication: {
      publication_id: completion.publication_id,
      receipt_sha256: publicationReceiptDigest(completion),
      head_sha: completion.head_sha,
      ship_transaction_key: shipTransactionKey,
    },
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  writeLeaseOwnerDurably(subject.root, subject.taskId, reviewing.record);
  return completion;
}

describe('fleet feedback CLI', () => {
  test('intake resolves the sole current reviewing publication when omitted', () => {
    const subject = fixture();
    const result = runCli(subject, ['fleet', 'feedback', 'intake', '--json']);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      publication_id: subject.publicationId,
      event_count: 2,
    });
  });

  test('intake without a publication id rejects an empty current-publication set', () => {
    const subject = fixture();
    rmSync(leaseDirectory(subject.root, subject.taskId), { recursive: true, force: true });
    const result = runCli(subject, ['fleet', 'feedback', 'intake', '--json']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: 'publication_not_found',
    });
    expect(readFeedbackEvents(subject.root, subject.publicationId)).toEqual([]);
  });

  test('intake without a publication id rejects multiple current-publication pointers', () => {
    const subject = fixture();
    addAmbiguousReviewingPublication(subject);
    const result = runCli(subject, ['fleet', 'feedback', 'intake', '--json']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: 'publication_claim_mismatch',
      message: expect.stringContaining('ambiguous'),
    });
    expect(readFeedbackEvents(subject.root, subject.publicationId)).toEqual([]);
  });

  test('intake emits JSON and retries the same provider snapshot idempotently', () => {
    const subject = fixture();
    const args = ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId];
    const first = runCli(subject, args);
    expect(first.status, first.stderr).toBe(0);
    expect(first.stderr).toBe('');
    expect(JSON.parse(first.stdout)).toMatchObject({ ok: true, publication_id: subject.publicationId, event_count: 2 });

    const second = runCli(subject, args);
    expect(second.status, second.stderr).toBe(0);
    expect(JSON.parse(second.stdout)).toMatchObject({ ok: true, event_count: 2 });
    expect(readFeedbackEvents(subject.root, subject.publicationId)).toHaveLength(2);
    expect(readFeedbackDeliveryReceipts(subject.root, subject.publicationId)).toHaveLength(2);
  });

  test('offers projects a repair and reports user attention after two completed same-token attempts', () => {
    const subject = fixture();
    const intake = runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const offered = runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    expect(offered.status, offered.stderr).toBe(0);
    expect(JSON.parse(offered.stdout)).toMatchObject({ state: 'offered', attention_owner: 'agent' });

    const events = readFeedbackEvents(subject.root, subject.publicationId);
    const token = deriveReactionToken({
      publication_id: subject.publicationId,
      head_sha: subject.headSha,
      failing_checks: events.flatMap((event) => event.failing_checks),
      unresolved_review_thread_ids: events.flatMap((event) => event.unresolved_review_thread_ids),
      mergeability: events[0]?.mergeability ?? 'CONFLICTING',
    });
    const proof = dispatchedProofForOffer(subject, JSON.parse(offered.stdout).offer as Record<string, unknown>, token);
    for (const recordedAt of ['2026-08-23T00:03:00Z', '2026-08-23T00:04:00Z']) {
      appendCompletedReaction(subject, proof, token, recordedAt);
    }
    const halted = runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    expect(halted.status, halted.stderr).toBe(0);
    expect(JSON.parse(halted.stdout)).toMatchObject({
      state: 'no_progress',
      attention_owner: 'user',
      publication_id: subject.publicationId,
      reaction_token: token,
    });
  });

  test('acknowledges a pending delivery through the manual channel', () => {
    const subject = fixture();
    const intake = runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const ack = runCli(subject, [
      'fleet', 'feedback', 'ack', '--json', '--publication-id', subject.publicationId, '--provider-event-id', 'CHECK_1',
    ]);
    expect(ack.status, ack.stderr).toBe(0);
    expect(JSON.parse(ack.stdout)).toMatchObject({
      ok: true,
      receipt: { provider_event_id: 'CHECK_1', delivery_state: 'acknowledged', delivery_channel: 'manual' },
    });
  });

  test('shows provider body as untrusted without persisting it', () => {
    const subject = fixture();
    const intake = runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const eventPath = feedbackEventPath(subject.root, subject.publicationId, 'CHECK_1');
    const before = readFileSync(eventPath, 'utf8');
    const shown = runCli(subject, [
      'fleet', 'feedback', 'show', '--json',
      '--publication-id', subject.publicationId,
      '--provider-event-id', 'CHECK_1',
    ]);
    expect(shown.status, shown.stderr).toBe(0);
    expect(JSON.parse(shown.stdout)).toMatchObject({
      ok: true,
      provider_event_id: 'CHECK_1',
      untrusted: true,
      body: expect.stringContaining('UNTRUSTED-CHECK-BODY'),
    });
    const after = readFileSync(eventPath, 'utf8');
    expect(after).toBe(before);
    expect(after).not.toContain('UNTRUSTED-CHECK-BODY');
  });

  test('returns argument errors as exit 2 before invoking the effect', () => {
    const subject = fixture();
    const result = runCli(subject, ['fleet', 'feedback', 'ack', '--json', '--publication-id', subject.publicationId]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({ ok: false, error: 'invalid_argument' });
  });

  test('repair reopen projects and fences the offer, then returns bound lease state', () => {
    const subject = fixture();
    const intake = runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const offers = runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    const projection = JSON.parse(offers.stdout) as { offer: Record<string, unknown> };
    const reopened = runCli(subject, [
      'fleet', 'feedback', 'repair', 'reopen', '--json', ...repairFenceArgs(subject, projection.offer),
    ]);
    expect(reopened.status, reopened.stderr).toBe(0);
    expect(JSON.parse(reopened.stdout)).toMatchObject({
      ok: true,
      repair_id: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      proof: { phase: 'dispatched', repair_id: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) },
      lease: { state: 'bound', claim_id: subject.claimId, generation: subject.generation },
      envelope: { action: 'reopened', publication_id: subject.publicationId, repair_id: expect.any(String) },
    });
  });

  test('repair takeover projects and fences the offer, then stops at reserving', () => {
    const subject = fixture();
    const intake = runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const offers = runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    const projection = JSON.parse(offers.stdout) as { offer: Record<string, unknown> };
    const taken = runCli(subject, [
      'fleet', 'feedback', 'repair', 'takeover', '--json', ...repairFenceArgs(subject, projection.offer),
      '--reason', 'provider feedback repair', '--session-id', 'feedback-cli-takeover',
    ]);
    expect(taken.status, taken.stderr).toBe(0);
    const result = JSON.parse(taken.stdout) as { lease: { claim_id: string; generation: number; state: string }; envelope: Record<string, unknown> };
    expect(result).toMatchObject({
      ok: true,
      repair_id: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      proof: { phase: 'dispatched', repair_id: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) },
      lease: { state: 'reserving', generation: 2 },
      envelope: { action: 'taken_over', publication_id: subject.publicationId, repair_id: expect.any(String) },
    });
    expect(result.lease.claim_id).not.toBe(subject.claimId);
  });

  test('repair takeover rejects caller-selected claim and worktree identities', () => {
    const subject = fixture();
    const intake = runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const offers = runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    const projection = JSON.parse(offers.stdout) as { offer: Record<string, unknown> };
    for (const spoofed of [
      ['--new-claim-id', 'caller-claim'],
      ['--source-worktree', subject.root],
    ]) {
      const result = runCli(subject, [
        'fleet', 'feedback', 'repair', 'takeover', '--json', ...repairFenceArgs(subject, projection.offer),
        '--reason', 'provider feedback repair', '--session-id', 'feedback-cli-takeover', ...spoofed,
      ]);
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain('unknown option');
    }
  });

  test('repair complete writes exactly one completed reaction receipt', () => {
    const subject = fixture();
    const intake = runCli(subject, ['fleet', 'feedback', 'intake', '--json', '--publication-id', subject.publicationId]);
    expect(intake.status, intake.stderr).toBe(0);
    const offers = runCli(subject, ['fleet', 'feedback', 'offers', '--json', '--publication-id', subject.publicationId]);
    const projection = JSON.parse(offers.stdout) as { offer: Record<string, unknown> };
    const reopened = runCli(subject, [
      'fleet', 'feedback', 'repair', 'reopen', '--json', ...repairFenceArgs(subject, projection.offer),
    ]);
    expect(reopened.status, reopened.stderr).toBe(0);
    const dispatch = JSON.parse(reopened.stdout) as { repair_id: string };

    const spoofed = runCli(subject, [
      'fleet', 'feedback', 'repair', 'complete', '--json',
      '--publication-id', subject.publicationId, '--repair-id', dispatch.repair_id,
      '--before-reaction-token', 'sha256:spoofed', '--after-reaction-token', 'sha256:spoofed',
    ]);
    expect(spoofed.status).not.toBe(0);
    expect(`${spoofed.stdout}${spoofed.stderr}`).toContain('unknown option');
    expect(readReactionAttemptReceipts(subject.root, subject.publicationId)).toHaveLength(0);

    const premature = runCli(subject, [
      'fleet', 'feedback', 'repair', 'complete', '--json',
      '--publication-id', subject.publicationId, '--repair-id', dispatch.repair_id,
      '--recorded-at', '2026-08-23T00:05:00Z',
    ]);
    expect(premature.status, premature.stderr).toBe(1);
    expect(JSON.parse(premature.stderr)).toMatchObject({ ok: false });
    expect(readReactionAttemptReceipts(subject.root, subject.publicationId)).toHaveLength(0);

    const completion = prepareCompletionPublication(subject);
    const completionIntake = runCli(
      subject,
      ['fleet', 'feedback', 'intake', '--json', '--publication-id', completion.publication_id],
      { GH_HEAD_OVERRIDE: completion.head_sha },
    );
    expect(completionIntake.status, completionIntake.stderr).toBe(0);
    const completed = runCli(subject, [
      'fleet', 'feedback', 'repair', 'complete', '--json',
      '--publication-id', subject.publicationId, '--repair-id', dispatch.repair_id,
      '--recorded-at', '2026-08-23T00:05:00Z',
    ]);
    expect(completed.status, completed.stderr).toBe(0);
    const completedOutput = JSON.parse(completed.stdout) as { ok: boolean; receipt: Record<string, unknown> };
    expect(completedOutput).toMatchObject({
      ok: true,
      receipt: { publication_id: subject.publicationId, outcome: 'completed', repair_id: dispatch.repair_id },
    });
    const firstReceipt = completedOutput.receipt;
    const replay = runCli(subject, [
      'fleet', 'feedback', 'repair', 'complete', '--json',
      '--publication-id', subject.publicationId, '--repair-id', dispatch.repair_id,
      '--recorded-at', '2026-08-23T00:05:00Z',
    ]);
    expect(replay.status, replay.stderr).toBe(0);
    expect(JSON.parse(replay.stdout).receipt).toEqual(firstReceipt);
    expect(readReactionAttemptReceipts(subject.root, subject.publicationId)).toHaveLength(1);
  }, 30_000);
});
