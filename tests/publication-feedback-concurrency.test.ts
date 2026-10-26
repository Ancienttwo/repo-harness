import { admittedFeedbackFixture } from './helpers/admitted-feedback-fixture';
import { historicalRepairProof } from './helpers/publication-fixture';
import { dispatchedRepairFixture } from './helpers/publication-fixture';
import { seedReactionReceipt } from './helpers/publication-fixture';
import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import {
  buildFeedbackDeliveryReceipt,
  buildFeedbackEvent,
  buildReactionAttemptReceipt,
  deriveReactionToken,
} from '../src/core/publication/feedback';
import {
  intakeGitHubFeedback,
  projectFleetFeedback,
  projectPendingFeedbackOffer,
  type FeedbackObservationInput,
} from '../src/effects/fleet/provider-feedback';
import { readFeedbackDeliveryReceipts, readFeedbackEvents, readReactionAttemptReceipts, writeFeedbackDeliveryReceipt, writeFeedbackEvent } from '../src/effects/publication/feedback-store';
import { resolveGitCommonDirectory } from '../src/effects/git/common-directory';

const roots: string[] = [];
const CLAIM = 'claim-feedback-concurrency';
const BASE = 'b'.repeat(40);

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture() {
  const subject = await admittedFeedbackFixture();
  roots.push(subject.directory);
  return subject;
}

function feedbackRunner(head: string, tornFirstRound = false, graphErrors = false): NonNullable<FeedbackObservationInput['gh_runner']> {
  let prReads = 0;
  return (args) => {
    const query = args.find((arg) => arg.startsWith('query='));
    if (args[0] === 'repo' && args[1] === 'view') return { status: 0, stdout: JSON.stringify({ id: 'R_feedback_concurrency', nameWithOwner: 'acme/widgets' }) };
    if (args[0] === 'api' && args[1] === 'repos/acme/widgets') return { status: 0, stdout: JSON.stringify({ id: 123, node_id: 'R_feedback_concurrency', full_name: 'acme/widgets', default_branch: 'main' }) };
    if (args[0] === 'pr' && args[1] === 'view') {
      prReads += 1;
      const observedHead = tornFirstRound && prReads === 2 ? 'd'.repeat(40) : head;
      return { status: 0, stdout: JSON.stringify({
        number: 9, url: 'https://example.invalid/pr/9', state: 'OPEN', isDraft: false,
        headRefOid: observedHead, headRefName: 'codex/feedback', baseRefOid: BASE, baseRefName: 'main', mergeable: 'MERGEABLE', reviewDecision: null,
      }) };
    }
    if (query !== undefined && graphErrors) {
      return { status: 0, stdout: JSON.stringify({ errors: [{ message: 'provider query failure' }] }) };
    }
    if (query?.includes('checkSuites')) return { status: 0, stdout: JSON.stringify({
      data: { node: { pullRequest: { commits: { nodes: [{ commit: {
        oid: head, checkSuites: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{ id: 'SUITE_9' }] },
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
  test('retries one torn provider round, deduplicates immutable events, and leaves admission binding bytes unchanged', async () => {
    const subject = await fixture();
    const ownerPath = subject.bindingPath;
    const before = readFileSync(ownerPath, 'utf-8');
    const input = { ...subject.input, gh_runner: feedbackRunner(subject.head, true) };
    const first = intakeGitHubFeedback(input);
    const second = intakeGitHubFeedback({ ...input, gh_runner: feedbackRunner(subject.head) });
    expect(first.event_count).toBe(2);
    expect(second.event_count).toBe(2);
    expect(readFeedbackEvents(subject.root, subject.publication_id)).toHaveLength(2);
    expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
  });

  test('offer projection is read-only and halts after two completed same-token reactions', async () => {
    const subject = await fixture();
    const input = { ...subject.input, gh_runner: feedbackRunner(subject.head) };
    intakeGitHubFeedback(input);
    const ownerPath = subject.bindingPath;
    const before = readFileSync(ownerPath, 'utf-8');
    const offered = projectPendingFeedbackOffer(input);
    expect(offered.state).toBe('offered');
    if (offered.state !== 'offered') throw new Error('expected repair offer');
    const events = readFeedbackEvents(subject.root, subject.publication_id);
    const token = deriveReactionToken({
      publication_id: subject.publication_id, head_sha: subject.head,
      failing_checks: events.flatMap((event) => event.failing_checks),
      unresolved_review_thread_ids: events.flatMap((event) => event.unresolved_review_thread_ids),
      mergeability: 'MERGEABLE',
    });
    for (const [index, recordedAt] of ['2026-08-23T00:03:00Z', '2026-08-23T00:04:00Z'].entries()) {
      const takeover = index === 1;
      // Historical completion wire records remain explicit read-model fixtures.
      const prepared = historicalRepairProof({
        publication_id: subject.publication_id,
        receipt_sha256: `sha256:${'3'.repeat(64)}`,
        task_id: subject.task_id,
        task_revision: '2'.repeat(64),
        claim_id: CLAIM,
        generation: 1,
        head_sha: subject.head,
        ship_transaction_key: 'ship-feedback',
        feedback_revision: offered.offer.feedback_revision,
        before_reaction_token: token,
        action: takeover ? 'explicit_takeover' : 'resume_same_owner',
        phase: 'prepared',
        successor_claim_id: null,
        successor_generation: null,
        successor_state: null,
      });
      const proof = dispatchedRepairFixture(prepared, {
        successor_claim_id: takeover ? 'claim-feedback-next' : CLAIM,
        successor_generation: takeover ? 2 : 1,
        successor_state: takeover ? 'reserving' : 'bound',
      });
      seedReactionReceipt(subject.root, subject.publication_id, buildReactionAttemptReceipt({
        publication_id: subject.publication_id,
        repair_id: proof.repair_id,
        successor_claim_id: proof.successor_claim_id!,
        successor_generation: proof.successor_generation!,
        completion_publication_id: subject.publication_id,
        completion_receipt_sha256: `sha256:${'3'.repeat(64)}`,
        completion_head_sha: subject.head,
        completion_ship_transaction_key: `ship-feedback-completed-${index}`,
        before_reaction_token: token, after_reaction_token: token, outcome: 'completed', recorded_at: recordedAt,
      }));
    }
    const halted = projectPendingFeedbackOffer(input);
    expect(halted).toMatchObject({ state: 'no_progress', attention_owner: 'user', reaction_token: token });
    expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
  });

  test('Fleet feedback retries an intake that lands between complete store observations', async () => {
    const subject = await fixture();
    const input = { ...subject.input, gh_runner: feedbackRunner(subject.head) };
    intakeGitHubFeedback(input);
    const concurrentEvent = buildFeedbackEvent({
      provider: 'github', provider_event_id: 'THREAD_CONCURRENT', publication_id: subject.publication_id, head_sha: subject.head,
      failing_check_ids: [], failing_checks: [], unresolved_review_thread_ids: ['THREAD_CONCURRENT'],
      changes_requested_review_ids: [], mergeability: 'MERGEABLE', summary: 'concurrent review thread',
      provider_url: 'https://example.invalid/pr/9', observed_at: '2026-08-23T00:05:00Z',
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
    expect(projected.repair_actions).toEqual([]);
    expect(reactionReads).toBe(4);
  });

  test('Fleet feedback never labels continuously changing reaction evidence stable', async () => {
    const subject = await fixture();
    const input = { ...subject.input, gh_runner: feedbackRunner(subject.head) };
    intakeGitHubFeedback(input);
    const events = readFeedbackEvents(subject.root, subject.publication_id);
    const token = deriveReactionToken({
      publication_id: subject.publication_id,
      head_sha: subject.head,
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
      completion_receipt_sha256: `sha256:${'3'.repeat(64)}`,
      completion_head_sha: subject.head,
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

  test('a stable provider head mismatch fails before any feedback write or admission binding mutation', async () => {
    const subject = await fixture();
    const ownerPath = subject.bindingPath;
    const before = readFileSync(ownerPath, 'utf-8');
    const normal = feedbackRunner(subject.head);
    const mismatched: NonNullable<FeedbackObservationInput['gh_runner']> = (args) => {
      const result = normal(args);
      if (args[0] !== 'pr' || args[1] !== 'view') return result;
      return { ...result, stdout: JSON.stringify({ ...JSON.parse(result.stdout), headRefOid: 'd'.repeat(40) }) };
    };
    expect(() => intakeGitHubFeedback({ ...subject.input, gh_runner: mismatched }))
      .toThrow('provider PR head does not match');
    const root = join(resolveGitCommonDirectory(subject.root), 'repo-harness', 'feedback');
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(ownerPath, 'utf-8')).toBe(before);
  });

  test('a GraphQL error fails closed before feedback persistence or admission binding mutation', async () => {
    const subject = await fixture();
    const ownerPath = subject.bindingPath;
    const before = readFileSync(ownerPath, 'utf-8');
    try {
      intakeGitHubFeedback({
        ...subject.input, gh_runner: feedbackRunner(subject.head, false, true),
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
