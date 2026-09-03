import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildPublicationReceipt,
  publicationReceiptDigest,
} from '../src/core/publication/publication-receipt';
import {
  buildFeedbackDeliveryReceipt,
  buildFeedbackEvent,
  buildReactionAttemptReceipt,
  buildRepairDispatchProof,
  deriveReactionToken,
} from '../src/core/publication/feedback';
import {
  beginLeaseCompletionRecord,
  bindLeaseRecord,
  buildLeaseOwnerRecord,
  deriveTaskRevision,
  enterReviewingLeaseRecord,
} from '../src/core/state/coordination-identity';
import {
  intakeGitHubFeedback,
  projectFleetFeedback,
  projectPendingFeedbackOffer,
  type FeedbackObservationInput,
} from '../src/effects/publication/feedback';
import {
  appendReactionAttemptReceipt,
  readFeedbackDeliveryReceipts,
  readFeedbackEvents,
  readReactionAttemptReceipts,
  transitionRepairDispatchProof,
  writeFeedbackDeliveryReceipt,
  writeFeedbackEvent,
  writeRepairDispatchProof,
} from '../src/effects/publication/feedback-store';
import { writePublicationReceiptCache } from '../src/effects/publication/publication-receipt';
import { resolveRepoIdentity } from '../src/effects/state/coordination-canonical-source';
import { createLeaseDirectory, leaseOwnerPath, writeLeaseOwnerDurably } from '../src/effects/state/coordination-lease-store';
import { resolveGitCommonDirectory } from '../src/effects/git/common-directory';
import { fixtureTaskId } from './helpers/sprint-fixture';

const roots: string[] = [];
const CLAIM = 'claim-feedback-concurrency';
const SPRINT = 'plans/sprints/feedback.sprint.md';
const TASK = 'repair provider feedback';
const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim();
}

interface Fixture {
  readonly root: string;
  readonly task_id: string;
  readonly publication_id: string;
  readonly receipt: ReturnType<typeof buildPublicationReceipt>;
}

function fixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-feedback-concurrency-'));
  roots.push(root);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Feedback Test');
  git(root, 'config', 'user.email', 'feedback@test.invalid');
  mkdirSync(join(root, 'plans', 'sprints'), { recursive: true });
  writeFileSync(join(root, SPRINT), [
    '# Sprint: feedback', '', '> **Backlog Schema**: 2', '', '## Backlog', '',
    '| # | ID | Status | Task | Mode | Acceptance | Plan |',
    '|---|----|--------|------|------|------------|------|',
    `| 1 | ${fixtureTaskId(`${TASK}`)} | [ ] | ${TASK} | contract | provider feedback passes | (pending) |`, '',
  ].join('\n'));
  writeFileSync(join(root, 'README.md'), 'base\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'base');
  const repoId = resolveRepoIdentity(root);
  const taskId = fixtureTaskId(TASK);
  const taskRevision = deriveTaskRevision({ taskCell: TASK, taskId, modeCell: 'contract', acceptanceCell: 'provider feedback passes' });
  git(root, 'switch', '-c', 'codex/feedback');
  writeFileSync(join(root, 'feature.txt'), 'feedback\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'feature');

  const receipt = buildPublicationReceipt({
    repo_id: `sha256:${'0'.repeat(64)}`,
    task_id: taskId, task_revision: taskRevision, claim_id: CLAIM, generation: 1,
    target_ref: 'main', base_sha: BASE, branch: 'codex/feedback', head_sha: HEAD, tree_sha: 'c'.repeat(40),
    review_subject_sha256: `sha256:${'3'.repeat(64)}`,
    verification_evidence_sha256: `sha256:${'4'.repeat(64)}`,
    merge_seal_sha256: `sha256:${'5'.repeat(64)}`,
    provider: 'github', provider_repo_id: 'R_feedback_concurrency', pr_number: 9,
    pr_url: 'https://example.invalid/pr/9', created_at: '2026-08-23T00:00:00Z',
  });
  writePublicationReceiptCache(root, receipt);
  const owner = buildLeaseOwnerRecord({
    claimId: CLAIM, taskId, taskRevision, sprintPath: SPRINT, targetRef: 'main', generation: 1,
    sessionId: 'feedback-session', sourceWorktree: root,
  });
  const bound = bindLeaseRecord(owner, { claimId: CLAIM, executionWorktree: root, branch: 'codex/feedback', unitRef: 'plans/plan-feedback.md' });
  if (!bound.ok) throw new Error(bound.error);
  const completing = beginLeaseCompletionRecord(bound.record, { claimId: CLAIM, executionWorktree: root, finishTransactionKey: null });
  if (!completing.ok) throw new Error(completing.error);
  const reviewing = enterReviewingLeaseRecord(completing.record, {
    claimId: CLAIM,
    publication: {
      publication_id: receipt.publication_id,
      receipt_sha256: publicationReceiptDigest(receipt),
      head_sha: HEAD,
      ship_transaction_key: 'ship-feedback',
    },
  });
  if (!reviewing.ok) throw new Error(reviewing.error);
  if (!createLeaseDirectory(root, taskId)) throw new Error('lease creation failed');
  writeLeaseOwnerDurably(root, taskId, reviewing.record);
  return { root, task_id: taskId, publication_id: receipt.publication_id, receipt };
}

function feedbackRunner(tornFirstRound = false, graphErrors = false): NonNullable<FeedbackObservationInput['gh_runner']> {
  let prReads = 0;
  return (args) => {
    const query = args.find((arg) => arg.startsWith('query='));
    if (args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ id: 'R_feedback_concurrency' }) };
    if (args[0] === 'pr' && args[1] === 'view') {
      prReads += 1;
      const head = tornFirstRound && prReads === 2 ? 'd'.repeat(40) : HEAD;
      return { status: 0, stdout: JSON.stringify({
        number: 9, url: 'https://example.invalid/pr/9', state: 'OPEN', isDraft: false,
        headRefOid: head, headRefName: 'codex/feedback', baseRefOid: BASE, baseRefName: 'main', mergeStateStatus: 'MERGEABLE',
      }) };
    }
    if (query !== undefined && graphErrors) {
      return { status: 0, stdout: JSON.stringify({ errors: [{ message: 'provider query failure' }] }) };
    }
    if (query?.includes('checkSuites')) return { status: 0, stdout: JSON.stringify({
      data: { node: { pullRequest: { commits: { nodes: [{ commit: {
        oid: HEAD, checkSuites: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'SUITE_9' }] },
      } }] } } } },
    }) };
    if (query?.includes('checkRuns')) return { status: 0, stdout: JSON.stringify({
      data: { node: { checkRuns: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
        id: 'CHECK_9', status: 'COMPLETED', conclusion: 'FAILURE', completedAt: '2026-08-23T00:00:01Z',
      }] } } },
    }) };
    if (query?.includes('reviewThreads')) return { status: 0, stdout: JSON.stringify({
      data: { node: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
        id: 'THREAD_9', isResolved: false, updatedAt: '2026-08-23T00:00:02Z',
      }] } } } },
    }) };
    if (query?.includes('reviews(first:100')) return { status: 0, stdout: JSON.stringify({
      data: { node: { pullRequest: { reviews: {
        pageInfo: { hasNextPage: false, endCursor: null }, nodes: [],
      } } } },
    }) };
    return { status: 2, stdout: '', stderr: `unexpected gh call: ${args.join(' ')}` };
  };
}

describe('provider feedback intake fences', () => {
  test('retries one torn provider round, deduplicates immutable events, and leaves lease bytes unchanged', () => {
    const subject = fixture();
    const ownerPath = leaseOwnerPath(subject.root, subject.task_id);
    const before = readFileSync(ownerPath, 'utf-8');
    const input = { repo_root: subject.root, publication_id: subject.publication_id, gh_runner: feedbackRunner(true) };
    const first = intakeGitHubFeedback(input);
    const second = intakeGitHubFeedback({ ...input, gh_runner: feedbackRunner() });
    expect(first.event_count).toBe(2);
    expect(second.event_count).toBe(2);
    expect(readFeedbackEvents(subject.root, subject.publication_id)).toHaveLength(2);
    expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
  });

  test('offer projection is read-only and halts after two completed same-token reactions', () => {
    const subject = fixture();
    const input = { repo_root: subject.root, publication_id: subject.publication_id, gh_runner: feedbackRunner() };
    intakeGitHubFeedback(input);
    const ownerPath = leaseOwnerPath(subject.root, subject.task_id);
    const before = readFileSync(ownerPath, 'utf-8');
    const offered = projectPendingFeedbackOffer(input);
    expect(offered.state).toBe('offered');
    if (offered.state !== 'offered') throw new Error('expected repair offer');
    const events = readFeedbackEvents(subject.root, subject.publication_id);
    const token = deriveReactionToken({
      publication_id: subject.publication_id, head_sha: HEAD,
      failing_checks: events.flatMap((event) => event.failing_checks),
      unresolved_review_thread_ids: events.flatMap((event) => event.unresolved_review_thread_ids),
      mergeability: 'MERGEABLE',
    });
    for (const [index, recordedAt] of ['2026-08-23T00:03:00Z', '2026-08-23T00:04:00Z'].entries()) {
      const takeover = index === 1;
      const prepared = buildRepairDispatchProof({
        publication_id: subject.publication_id,
        receipt_sha256: publicationReceiptDigest(subject.receipt),
        task_id: subject.task_id,
        task_revision: subject.receipt.task_revision,
        claim_id: CLAIM,
        generation: 1,
        head_sha: HEAD,
        ship_transaction_key: 'ship-feedback',
        feedback_revision: offered.offer.feedback_revision,
        before_reaction_token: token,
        action: takeover ? 'explicit_takeover' : 'resume_same_owner',
        phase: 'prepared',
        successor_claim_id: null,
        successor_generation: null,
        successor_state: null,
      });
      writeRepairDispatchProof(subject.root, subject.publication_id, prepared);
      const proof = transitionRepairDispatchProof(subject.root, subject.publication_id, prepared.repair_id, {
        successor_claim_id: takeover ? 'claim-feedback-next' : CLAIM,
        successor_generation: takeover ? 2 : 1,
        successor_state: takeover ? 'reserving' : 'bound',
      });
      appendReactionAttemptReceipt(subject.root, subject.publication_id, buildReactionAttemptReceipt({
        publication_id: subject.publication_id,
        repair_id: proof.repair_id,
        successor_claim_id: proof.successor_claim_id!,
        successor_generation: proof.successor_generation!,
        completion_publication_id: subject.publication_id,
        completion_receipt_sha256: publicationReceiptDigest(subject.receipt),
        completion_head_sha: HEAD,
        completion_ship_transaction_key: `ship-feedback-completed-${index}`,
        before_reaction_token: token, after_reaction_token: token, outcome: 'completed', recorded_at: recordedAt,
      }));
    }
    const halted = projectPendingFeedbackOffer(input);
    expect(halted).toMatchObject({ state: 'no_progress', attention_owner: 'user', reaction_token: token });
    expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
  });

  test('Fleet feedback retries an intake that lands between complete store observations', () => {
    const subject = fixture();
    const input = { repo_root: subject.root, publication_id: subject.publication_id, gh_runner: feedbackRunner() };
    intakeGitHubFeedback(input);
    const concurrentEvent = buildFeedbackEvent({
      provider: 'github', provider_event_id: 'THREAD_CONCURRENT', publication_id: subject.publication_id, head_sha: HEAD,
      failing_check_ids: [], failing_checks: [], unresolved_review_thread_ids: ['THREAD_CONCURRENT'],
      changes_requested_review_ids: [], mergeability: 'MERGEABLE', summary: 'concurrent review thread',
      provider_url: subject.receipt.pr_url, observed_at: '2026-08-23T00:05:00Z',
    });
    let reactionReads = 0;
    const projected = projectFleetFeedback(input, {
      read_reactions: (repoRoot, publicationId, gitBin) => {
        const observed = readReactionAttemptReceipts(repoRoot, publicationId, gitBin);
        reactionReads += 1;
        if (reactionReads === 1) {
          writeFeedbackEvent(subject.root, concurrentEvent);
          writeFeedbackDeliveryReceipt(subject.root, subject.publication_id, buildFeedbackDeliveryReceipt({
            provider_event_id: concurrentEvent.provider_event_id, delivery_state: 'pending', delivery_channel: 'none',
            delivered_at: null, acknowledged_at: null, superseded_at: null,
          }));
        }
        return observed;
      },
    });
    expect(projected).toMatchObject({ pending_count: 3, no_progress: false, snapshot_consistency: 'stable' });
    expect(projected.repair_actions).toEqual(['resume_same_owner', 'explicit_takeover']);
    expect(reactionReads).toBe(4);
  });

  test('Fleet feedback never labels continuously changing reaction evidence stable', () => {
    const subject = fixture();
    const input = { repo_root: subject.root, publication_id: subject.publication_id, gh_runner: feedbackRunner() };
    intakeGitHubFeedback(input);
    const events = readFeedbackEvents(subject.root, subject.publication_id);
    const token = deriveReactionToken({
      publication_id: subject.publication_id,
      head_sha: HEAD,
      failing_checks: events.flatMap((event) => event.failing_checks),
      unresolved_review_thread_ids: events.flatMap((event) => event.unresolved_review_thread_ids),
      mergeability: 'MERGEABLE',
    });
    const reaction = buildReactionAttemptReceipt({
      publication_id: subject.publication_id,
      repair_id: `sha256:${'8'.repeat(64)}`,
      successor_claim_id: CLAIM,
      successor_generation: 1,
      completion_publication_id: subject.publication_id,
      completion_receipt_sha256: publicationReceiptDigest(subject.receipt),
      completion_head_sha: HEAD,
      completion_ship_transaction_key: 'ship-feedback-observation',
      before_reaction_token: token,
      after_reaction_token: token,
      outcome: 'completed',
      recorded_at: '2026-08-23T00:06:00Z',
    });
    let reactionReads = 0;
    const projected = projectFleetFeedback(input, {
      read_events: readFeedbackEvents,
      read_deliveries: readFeedbackDeliveryReceipts,
      read_reactions: () => Object.freeze(reactionReads++ % 2 === 0 ? [] : [reaction]),
    });
    expect(projected.snapshot_consistency).toBe('changed_during_read');
    expect(reactionReads).toBe(4);
  });

  test('a stable provider head mismatch fails before any feedback write or lease mutation', () => {
    const subject = fixture();
    const ownerPath = leaseOwnerPath(subject.root, subject.task_id);
    const before = readFileSync(ownerPath, 'utf-8');
    const normal = feedbackRunner();
    const mismatched: NonNullable<FeedbackObservationInput['gh_runner']> = (args) => {
      const result = normal(args);
      if (args[0] !== 'pr' || args[1] !== 'view') return result;
      return { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), headRefOid: 'd'.repeat(40) }) };
    };
    expect(() => intakeGitHubFeedback({ repo_root: subject.root, publication_id: subject.publication_id, gh_runner: mismatched }))
      .toThrow('provider PR head does not match');
    const root = join(resolveGitCommonDirectory(subject.root), 'repo-harness', 'feedback');
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
  });

  test('a GraphQL error fails closed before feedback persistence or lease mutation', () => {
    const subject = fixture();
    const ownerPath = leaseOwnerPath(subject.root, subject.task_id);
    const before = readFileSync(ownerPath, 'utf-8');
    try {
      intakeGitHubFeedback({
        repo_root: subject.root, publication_id: subject.publication_id, gh_runner: feedbackRunner(false, true),
      });
      throw new Error('expected GraphQL error to fail closed');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('feedback_provider_incomplete');
    }
    const root = join(resolveGitCommonDirectory(subject.root), 'repo-harness', 'feedback');
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
  });
});
