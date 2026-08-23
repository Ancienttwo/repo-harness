import { afterEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildFeedbackDeliveryReceipt,
  buildFeedbackEvent,
  buildRepairDispatchProof,
  buildReactionAttemptReceipt,
  transitionRepairDispatchProof,
  transitionFeedbackDeliveryReceipt,
} from '../../src/core/publication/feedback';
import {
  FeedbackStoreError,
  appendReactionAttemptReceipt,
  feedbackEventPath,
  repairDispatchProofPath,
  readFeedbackDeliveryReceipt,
  readFeedbackEvents,
  readReactionAttemptReceipts,
  readRepairDispatchProof,
  readRepairDispatchProofs,
  transitionRepairDispatchProof as transitionStoredRepairDispatchProof,
  writeFeedbackDeliveryReceipt,
  writeFeedbackEvent,
  writeRepairDispatchProof,
} from '../../src/effects/publication/feedback-store';
import { resolveGitCommonDirectory } from '../../src/effects/git/common-directory';

const roots: string[] = [];
const PUBLICATION_ID = `sha256:${'a'.repeat(64)}`;
const HEAD = 'b'.repeat(40);
const TASK_ID = 'c'.repeat(64);
const RECEIPT = `sha256:${'d'.repeat(64)}`;
const TOKEN = `sha256:${'e'.repeat(64)}`;

function preparedProof() {
  return buildRepairDispatchProof({
    publication_id: PUBLICATION_ID,
    receipt_sha256: RECEIPT,
    task_id: TASK_ID,
    task_revision: 'f'.repeat(64),
    claim_id: 'claim-feedback',
    generation: 1,
    head_sha: HEAD,
    ship_transaction_key: 'source-ship-key',
    feedback_revision: `sha256:${'0'.repeat(64)}`,
    before_reaction_token: TOKEN,
    action: 'resume_same_owner',
    phase: 'prepared',
    successor_claim_id: null,
    successor_generation: null,
    successor_state: null,
  });
}

function dispatchedProof() {
  return transitionRepairDispatchProof(preparedProof(), {
    successor_claim_id: 'claim-feedback',
    successor_generation: 1,
    successor_state: 'bound',
  });
}

function reaction(overrides: Partial<Parameters<typeof buildReactionAttemptReceipt>[0]> = {}) {
  const proof = dispatchedProof();
  return buildReactionAttemptReceipt({
    publication_id: PUBLICATION_ID,
    repair_id: proof.repair_id,
    successor_claim_id: proof.successor_claim_id!,
    successor_generation: proof.successor_generation!,
    completion_publication_id: `sha256:${'1'.repeat(64)}`,
    completion_receipt_sha256: `sha256:${'2'.repeat(64)}`,
    completion_head_sha: '3'.repeat(40),
    completion_ship_transaction_key: 'completion-ship-key',
    before_reaction_token: TOKEN,
    after_reaction_token: TOKEN,
    outcome: 'completed',
    recorded_at: '2026-08-23T00:02:00Z',
    ...overrides,
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'repo-harness-feedback-store-'));
  roots.push(root);
  execFileSync('git', ['init', '-b', 'main'], { cwd: root });
  return root;
}

function event(overrides: Partial<Parameters<typeof buildFeedbackEvent>[0]> = {}) {
  return buildFeedbackEvent({
    provider: 'github',
    provider_event_id: 'CHECK_NODE_1',
    publication_id: PUBLICATION_ID,
    head_sha: HEAD,
    failing_check_ids: ['CHECK_NODE_1'],
    failing_checks: [{ id: 'CHECK_NODE_1', conclusion: 'FAILURE' }],
    unresolved_review_thread_ids: [],
    changes_requested_review_ids: [],
    mergeability: 'CONFLICTING',
    summary: 'GitHub check failed',
    provider_url: 'https://example.invalid/pr/1',
    observed_at: '2026-08-23T00:00:00Z',
    ...overrides,
  });
}

describe('provider feedback common-directory store', () => {
  test('creates immutable idempotent events, while delivery remains separate and mutable', () => {
    const root = repo();
    const first = event();
    const path = writeFeedbackEvent(root, first);
    expect(path.startsWith(resolveGitCommonDirectory(root))).toBe(true);
    expect(writeFeedbackEvent(root, first)).toBe(path);
    expect(readFeedbackEvents(root, PUBLICATION_ID)).toEqual([first]);

    try {
      writeFeedbackEvent(root, event({ summary: 'Same provider event, different immutable fact' }));
      throw new Error('expected immutable conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(FeedbackStoreError);
      expect((error as FeedbackStoreError).code).toBe('provider_event_conflict');
    }

    const pending = buildFeedbackDeliveryReceipt({
      provider_event_id: first.provider_event_id,
      delivery_state: 'pending', delivery_channel: 'none',
      delivered_at: null, acknowledged_at: null, superseded_at: null,
    });
    writeFeedbackDeliveryReceipt(root, PUBLICATION_ID, pending);
    const acknowledged = transitionFeedbackDeliveryReceipt(pending, {
      delivery_state: 'acknowledged', delivery_channel: 'manual', transitioned_at: '2026-08-23T00:01:00Z',
    });
    writeFeedbackDeliveryReceipt(root, PUBLICATION_ID, acknowledged);
    expect(readFeedbackDeliveryReceipt(root, PUBLICATION_ID, first.provider_event_id)).toEqual(acknowledged);
    expect(readFeedbackEvents(root, PUBLICATION_ID)).toEqual([first]);
  });

  test('rejects symlinked immutable records and keeps only dispatched, idempotent completion receipts', () => {
    const root = repo();
    const first = event();
    const eventPath = feedbackEventPath(root, PUBLICATION_ID, first.provider_event_id);
    mkdirSync(join(eventPath, '..'), { recursive: true });
    symlinkSync('/dev/null', eventPath);
    expect(() => readFeedbackEvents(root, PUBLICATION_ID)).toThrow('feedback event is unsafe');

    const prepared = preparedProof();
    expect(() => writeRepairDispatchProof(root, PUBLICATION_ID, dispatchedProof())).toThrow('must start prepared');
    const proofPath = writeRepairDispatchProof(root, PUBLICATION_ID, prepared);
    expect(readRepairDispatchProof(root, PUBLICATION_ID, prepared.repair_id)).toEqual(prepared);
    expect(() => appendReactionAttemptReceipt(root, PUBLICATION_ID, reaction())).toThrow('no dispatched repair proof');

    const dispatched = transitionStoredRepairDispatchProof(root, PUBLICATION_ID, prepared.repair_id, {
      successor_claim_id: 'claim-feedback', successor_generation: 1, successor_state: 'bound',
    });
    expect(readRepairDispatchProofs(root, PUBLICATION_ID)).toEqual([dispatched]);
    expect(writeRepairDispatchProof(root, PUBLICATION_ID, dispatched)).toBe(proofPath);

    const completed = reaction();
    const reactionPath = appendReactionAttemptReceipt(root, PUBLICATION_ID, completed);
    expect(appendReactionAttemptReceipt(root, PUBLICATION_ID, completed)).toBe(reactionPath);
    expect(readReactionAttemptReceipts(root, PUBLICATION_ID)).toEqual([completed]);
    expect(() => appendReactionAttemptReceipt(root, PUBLICATION_ID, reaction({ after_reaction_token: `sha256:${'4'.repeat(64)}` }))).toThrow('completion_id conflicts');
    const common = resolveGitCommonDirectory(root);
    const publicationDirectory = join(common, 'repo-harness', 'feedback', 'v1', PUBLICATION_ID.slice('sha256:'.length));
    expect(readdirSync(publicationDirectory)).toContain('reactions.jsonl');
    expect(readdirSync(publicationDirectory)).toContain('repairs');
    expect(proofPath).toBe(repairDispatchProofPath(root, PUBLICATION_ID, prepared.repair_id));
  });
});
