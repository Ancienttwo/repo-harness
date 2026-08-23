import { describe, expect, test } from 'bun:test';

import {
  FEEDBACK_SUMMARY_MAX_BYTES,
  FeedbackProtocolError,
  buildFeedbackDeliveryReceipt,
  buildFeedbackEvent,
  buildRepairDispatchProof,
  buildReactionAttemptReceipt,
  canonicalFeedbackEventBytes,
  deriveFeedbackRevision,
  deriveRepairId,
  deriveReactionToken,
  projectRepairOffer,
  transitionFeedbackDeliveryReceipt,
  transitionRepairDispatchProof,
  validateFeedbackDeliveryReceipt,
  validateFeedbackEvent,
  validateReactionAttemptReceipt,
  validateRepairDispatchProof,
  validateRepairOffer,
  type ReactionAttemptReceiptInput,
} from '../../src/core/publication/feedback';

const PUBLICATION_ID = `sha256:${'a'.repeat(64)}`;
const TOKEN = `sha256:${'b'.repeat(64)}`;
const TASK_ID = 'c'.repeat(64);
const HEAD = 'd'.repeat(40);
const RECEIPT = `sha256:${'e'.repeat(64)}`;
const COMPLETION_PUBLICATION = `sha256:${'f'.repeat(64)}`;
const COMPLETION_RECEIPT = `sha256:${'0'.repeat(64)}`;
const COMPLETION_HEAD = '1'.repeat(40);

function eventInput(providerEventId = 'check-run:1') {
  return {
    provider: 'github' as const,
    provider_event_id: providerEventId,
    publication_id: PUBLICATION_ID,
    head_sha: HEAD,
    failing_check_ids: ['check:2', 'check:1'],
    failing_checks: [
      { id: 'check:2', conclusion: 'FAILURE' as const },
      { id: 'check:1', conclusion: 'TIMED_OUT' as const },
    ],
    unresolved_review_thread_ids: ['thread:2', 'thread:1'],
    changes_requested_review_ids: ['review:2', 'review:1'],
    mergeability: 'CONFLICTING' as const,
    summary: 'CI failed and two review threads remain unresolved.',
    provider_url: 'https://github.example.invalid/owner/repo/pull/1',
    observed_at: '2026-08-23T06:30:00.000Z',
  };
}

function pendingDelivery(providerEventId = 'check-run:1') {
  return buildFeedbackDeliveryReceipt({
    provider_event_id: providerEventId,
    delivery_state: 'pending',
    delivery_channel: 'none',
    delivered_at: null,
    acknowledged_at: null,
    superseded_at: null,
  });
}

function reaction(overrides: Partial<ReactionAttemptReceiptInput> = {}) {
  return buildReactionAttemptReceipt({
    publication_id: PUBLICATION_ID,
    repair_id: `sha256:${'2'.repeat(64)}`,
    successor_claim_id: 'claim-fixture',
    successor_generation: 3,
    completion_publication_id: COMPLETION_PUBLICATION,
    completion_receipt_sha256: COMPLETION_RECEIPT,
    completion_head_sha: COMPLETION_HEAD,
    completion_ship_transaction_key: 'ship-completion-1',
    before_reaction_token: TOKEN,
    after_reaction_token: TOKEN,
    outcome: 'completed',
    recorded_at: '2026-08-23T06:30:00.000Z',
    ...overrides,
  });
}

function preparedProof(overrides: Partial<Parameters<typeof buildRepairDispatchProof>[0]> = {}) {
  return buildRepairDispatchProof({
    publication_id: PUBLICATION_ID,
    receipt_sha256: RECEIPT,
    task_id: TASK_ID,
    task_revision: '3'.repeat(64),
    claim_id: 'claim-fixture',
    generation: 3,
    head_sha: HEAD,
    ship_transaction_key: 'ship-source-1',
    feedback_revision: `sha256:${'4'.repeat(64)}`,
    before_reaction_token: TOKEN,
    action: 'resume_same_owner',
    phase: 'prepared',
    successor_claim_id: null,
    successor_generation: null,
    successor_state: null,
    ...overrides,
  });
}

describe('FeedbackEventV1', () => {
  test('normalizes provider object IDs once and validates only canonical persisted event bytes', () => {
    const event = buildFeedbackEvent(eventInput());
    expect(event.failing_check_ids).toEqual(['check:1', 'check:2']);
    expect(event.failing_checks).toEqual([
      { id: 'check:1', conclusion: 'TIMED_OUT' },
      { id: 'check:2', conclusion: 'FAILURE' },
    ]);
    expect(event.unresolved_review_thread_ids).toEqual(['thread:1', 'thread:2']);
    expect(event.changes_requested_review_ids).toEqual(['review:1', 'review:2']);
    expect(event.observed_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.keys(event)).toEqual([
      'protocol', 'kind', 'provider', 'provider_event_id', 'publication_id', 'head_sha',
      'failing_check_ids', 'failing_checks', 'unresolved_review_thread_ids', 'changes_requested_review_ids',
      'mergeability', 'summary', 'provider_url', 'observed_at', 'observed_digest',
    ]);
    expect(validateFeedbackEvent(JSON.parse(canonicalFeedbackEventBytes(event)))).toEqual(event);

    const unsorted = {
      ...event,
      failing_check_ids: ['check:2', 'check:1'],
      failing_checks: [
        { id: 'check:2', conclusion: 'FAILURE' },
        { id: 'check:1', conclusion: 'TIMED_OUT' },
      ],
    };
    expect(() => validateFeedbackEvent(unsorted)).toThrow(FeedbackProtocolError);
    try {
      validateFeedbackEvent(unsorted);
    } catch (error) {
      expect((error as FeedbackProtocolError).code).toBe('feedback_unreadable');
    }
  });

  test('fails closed on non-frozen fields, stale digests, missing provider IDs, and unbounded summaries', () => {
    const event = buildFeedbackEvent(eventInput());
    expect(() => validateFeedbackEvent({ ...event, comment_body: 'untrusted and forbidden' })).toThrow(FeedbackProtocolError);
    expect(() => validateFeedbackEvent({ ...event, observed_digest: TOKEN })).toThrow(FeedbackProtocolError);
    expect(() => buildFeedbackEvent({ ...eventInput(), provider_event_id: '' })).toThrow(FeedbackProtocolError);
    expect(() => buildFeedbackEvent({ ...eventInput(), summary: 'x'.repeat(FEEDBACK_SUMMARY_MAX_BYTES + 1) })).toThrow(FeedbackProtocolError);
  });
});

describe('FeedbackDeliveryReceiptV1', () => {
  test('keeps delivery mutable but makes the transition history monotonic', () => {
    const pending = pendingDelivery();
    const delivered = transitionFeedbackDeliveryReceipt(pending, {
      delivery_state: 'delivered',
      delivery_channel: 'manual',
      transitioned_at: '2026-08-23T06:31:00.000Z',
    });
    expect(delivered).toMatchObject({
      delivery_state: 'delivered',
      delivery_channel: 'manual',
      delivered_at: '2026-08-23T06:31:00.000Z',
      acknowledged_at: null,
      superseded_at: null,
    });
    const acknowledged = transitionFeedbackDeliveryReceipt(delivered, {
      delivery_state: 'acknowledged',
      transitioned_at: '2026-08-23T06:32:00.000Z',
    });
    expect(acknowledged).toMatchObject({
      delivery_state: 'acknowledged',
      delivery_channel: 'manual',
      delivered_at: '2026-08-23T06:31:00.000Z',
      acknowledged_at: '2026-08-23T06:32:00.000Z',
    });
    expect(() => transitionFeedbackDeliveryReceipt(delivered, {
      delivery_state: 'acknowledged',
      delivery_channel: 'host_adapter',
      transitioned_at: '2026-08-23T06:32:00.000Z',
    })).toThrow(FeedbackProtocolError);
    expect(() => validateFeedbackDeliveryReceipt({ ...pending, arbitrary: true })).toThrow(FeedbackProtocolError);
  });

  test('allows an explicit manual acknowledgement from pending and a pending supersede without inventing delivery', () => {
    const acknowledged = transitionFeedbackDeliveryReceipt(pendingDelivery(), {
      delivery_state: 'acknowledged',
      delivery_channel: 'manual',
      transitioned_at: '2026-08-23T06:32:00.000Z',
    });
    expect(acknowledged.delivered_at).toBe(acknowledged.acknowledged_at);

    const superseded = transitionFeedbackDeliveryReceipt(pendingDelivery(), {
      delivery_state: 'superseded',
      transitioned_at: '2026-08-23T06:33:00.000Z',
    });
    expect(superseded).toMatchObject({
      delivery_state: 'superseded', delivery_channel: 'none', delivered_at: null, superseded_at: '2026-08-23T06:33:00.000Z',
    });
  });
});

describe('reaction and repair projection', () => {
  test('freezes a deterministic prepared-to-dispatched proof with the exact lifecycle successor', () => {
    const prepared = preparedProof();
    expect(prepared.repair_id).toBe(deriveRepairId({
      publication_id: prepared.publication_id,
      receipt_sha256: prepared.receipt_sha256,
      task_id: prepared.task_id,
      task_revision: prepared.task_revision,
      claim_id: prepared.claim_id,
      generation: prepared.generation,
      head_sha: prepared.head_sha,
      ship_transaction_key: prepared.ship_transaction_key,
      feedback_revision: prepared.feedback_revision,
      before_reaction_token: prepared.before_reaction_token,
      action: prepared.action,
    }));
    const dispatched = transitionRepairDispatchProof(prepared, {
      successor_claim_id: 'claim-fixture',
      successor_generation: 3,
      successor_state: 'bound',
    });
    expect(validateRepairDispatchProof(dispatched)).toEqual(dispatched);
    expect(() => transitionRepairDispatchProof(prepared, {
      successor_claim_id: 'new-claim', successor_generation: 4, successor_state: 'reserving',
    })).toThrow(FeedbackProtocolError);
    const takeover = transitionRepairDispatchProof(preparedProof({ action: 'explicit_takeover' }), {
      successor_claim_id: 'new-claim', successor_generation: 4, successor_state: 'reserving',
    });
    expect(takeover).toMatchObject({
      action: 'explicit_takeover',
      phase: 'dispatched',
      successor_claim_id: 'new-claim',
      successor_generation: 4,
      successor_state: 'reserving',
    });
    expect(() => transitionRepairDispatchProof(preparedProof({ action: 'explicit_takeover' }), {
      successor_claim_id: 'claim-fixture', successor_generation: 4, successor_state: 'reserving',
    })).toThrow(FeedbackProtocolError);
    expect(() => validateRepairDispatchProof({ ...prepared, operator_session: 'forbidden' })).toThrow(FeedbackProtocolError);
  });

  test('reaction token includes only the frozen breaker domain, canonically', () => {
    const first = deriveReactionToken({
      publication_id: PUBLICATION_ID,
      head_sha: HEAD,
      failing_checks: [
        { id: 'check:2', conclusion: 'FAILURE' },
        { id: 'check:1', conclusion: 'TIMED_OUT' },
      ],
      unresolved_review_thread_ids: ['thread:2', 'thread:1'],
      mergeability: 'CONFLICTING',
    });
    const reordered = deriveReactionToken({
      publication_id: PUBLICATION_ID,
      head_sha: HEAD,
      failing_checks: [
        { id: 'check:1', conclusion: 'TIMED_OUT' },
        { id: 'check:2', conclusion: 'FAILURE' },
      ],
      unresolved_review_thread_ids: ['thread:1', 'thread:2'],
      mergeability: 'CONFLICTING',
    });
    const changedConclusion = deriveReactionToken({
      publication_id: PUBLICATION_ID,
      head_sha: HEAD,
      failing_checks: [
        { id: 'check:1', conclusion: 'FAILURE' },
        { id: 'check:2', conclusion: 'FAILURE' },
      ],
      unresolved_review_thread_ids: ['thread:1', 'thread:2'],
      mergeability: 'CONFLICTING',
    });
    const changedMergeability = deriveReactionToken({
      publication_id: PUBLICATION_ID,
      head_sha: HEAD,
      failing_checks: [
        { id: 'check:1', conclusion: 'TIMED_OUT' },
        { id: 'check:2', conclusion: 'FAILURE' },
      ],
      unresolved_review_thread_ids: ['thread:1', 'thread:2'],
      mergeability: 'MERGEABLE',
    });
    expect(reordered).toBe(first);
    expect(changedConclusion).not.toBe(first);
    expect(changedMergeability).not.toBe(first);
    const reviewChanged = buildFeedbackEvent({
      ...eventInput(),
      changes_requested_review_ids: ['review:1', 'review:3'],
    });
    const original = buildFeedbackEvent(eventInput());
    expect(deriveFeedbackRevision([reviewChanged])).not.toBe(deriveFeedbackRevision([original]));
    expect(deriveReactionToken({
      publication_id: reviewChanged.publication_id,
      head_sha: reviewChanged.head_sha,
      failing_checks: reviewChanged.failing_checks,
      unresolved_review_thread_ids: reviewChanged.unresolved_review_thread_ids,
      mergeability: reviewChanged.mergeability,
    })).toBe(first);
    const receipt = reaction();
    expect(validateReactionAttemptReceipt(receipt)).toEqual(receipt);
    expect(receipt.completion_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(() => validateReactionAttemptReceipt({ ...receipt, operator_session: 'forbidden' })).toThrow(FeedbackProtocolError);
  });

  test('hashes the canonical event set and hands no-progress to the user after two same-token completed repairs', () => {
    const firstEvent = buildFeedbackEvent(eventInput('check-run:1'));
    const secondEvent = buildFeedbackEvent({
      ...eventInput('thread:2'),
      failing_check_ids: [],
      failing_checks: [],
      unresolved_review_thread_ids: ['thread:1'],
    });
    const revision = deriveFeedbackRevision([firstEvent, secondEvent]);
    expect(deriveFeedbackRevision([secondEvent, firstEvent])).toBe(revision);

    const noProgress = projectRepairOffer({
      task_id: TASK_ID,
      publication_id: PUBLICATION_ID,
      expected_claim_id: 'claim-fixture',
      expected_generation: 3,
      expected_head_sha: HEAD,
      feedback_revision: revision,
      reaction_token: TOKEN,
      reaction_attempts: [reaction(), reaction({
        completion_ship_transaction_key: 'ship-completion-2', recorded_at: '2026-08-23T06:35:00.000Z',
      })],
    });
    expect(noProgress).toMatchObject({ state: 'no_progress', attention_owner: 'user', publication_id: PUBLICATION_ID });

    const offered = projectRepairOffer({
      task_id: TASK_ID,
      publication_id: PUBLICATION_ID,
      expected_claim_id: 'claim-fixture',
      expected_generation: 3,
      expected_head_sha: HEAD,
      feedback_revision: revision,
      reaction_token: TOKEN,
      reaction_attempts: [reaction(), reaction({ outcome: 'abandoned' })],
    });
    expect(offered).toMatchObject({
      state: 'offered', attention_owner: 'agent',
      offer: {
        kind: 'repo-harness-repair-offer',
        allowed_actions: ['resume_same_owner', 'explicit_takeover'],
      },
    });
    if (offered.state === 'offered') expect(validateRepairOffer(offered.offer)).toEqual(offered.offer);
  });
});
