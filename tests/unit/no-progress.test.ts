import { describe, expect, test } from 'bun:test';

import { evaluateNoProgress } from '../../src/core/state/no-progress';
import { evaluateAttemptStall, parseAttemptLedger } from '../../src/core/state/attempt-ledger';
import { deriveReactionToken } from '../../src/core/publication/feedback';

const TOKEN = `sha256:${'a'.repeat(64)}`;

describe('evaluateNoProgress', () => {
  test('requires two trailing completed attempts that both retain the current token', () => {
    expect(evaluateNoProgress([
      { outcome: 'completed', before_token: TOKEN, after_token: TOKEN },
    ], TOKEN)).toBe('none');
    expect(evaluateNoProgress([
      { outcome: 'completed', before_token: TOKEN, after_token: TOKEN },
      { outcome: 'completed', before_token: TOKEN, after_token: TOKEN },
    ], TOKEN)).toBe('no_progress');
  });

  test('a changed token, abandoned action, or unrelated outcome resets the trailing run', () => {
    expect(evaluateNoProgress([
      { outcome: 'completed', before_token: TOKEN, after_token: TOKEN },
      { outcome: 'completed', before_token: TOKEN, after_token: `${TOKEN}-changed` },
      { outcome: 'completed', before_token: TOKEN, after_token: TOKEN },
    ], TOKEN)).toBe('none');
    expect(evaluateNoProgress([
      { outcome: 'completed', before_token: TOKEN, after_token: TOKEN },
      { outcome: 'abandoned', before_token: TOKEN, after_token: TOKEN },
      { outcome: 'completed', before_token: TOKEN, after_token: TOKEN },
    ], TOKEN)).toBe('none');
  });

  test('the continuation attempt receipt adapts to the shared algorithm without changing its wire contract', () => {
    const unit = 'plans/plan-fixture.md';
    const receipt = (outcome: 'completed' | 'halted') => JSON.stringify({
      protocol: 1,
      kind: 'repo-harness-attempt-receipt',
      unit_ref: unit,
      before_progress_token: TOKEN,
      after_progress_token: TOKEN,
      outcome,
      recorded_at: '2026-08-23T00:00:00.000Z',
    });
    const ledger = parseAttemptLedger(`${receipt('completed')}\n${receipt('completed')}\n`);
    expect(ledger).toEqual({
      status: 'ok',
      receipts: expect.arrayContaining([
        expect.objectContaining({ kind: 'repo-harness-attempt-receipt', before_progress_token: TOKEN }),
      ]),
    });
    expect(evaluateAttemptStall(ledger, unit, TOKEN)).toBe('no_progress');
    expect(evaluateAttemptStall(parseAttemptLedger(`${receipt('completed')}\n${receipt('halted')}\n`), unit, TOKEN)).toBe('none');
  });

  test('frozen breaker-domain changes reset the reaction breaker', () => {
    const base = deriveReactionToken({
      publication_id: `sha256:${'b'.repeat(64)}`,
      head_sha: 'c'.repeat(40),
      failing_checks: [{ id: 'CHECK_1', conclusion: 'FAILURE' }],
      unresolved_review_thread_ids: ['THREAD_1'],
      mergeability: 'CONFLICTING',
    });
    const completedTwice = [
      { outcome: 'completed' as const, before_token: base, after_token: base },
      { outcome: 'completed' as const, before_token: base, after_token: base },
    ];
    expect(evaluateNoProgress(completedTwice, base)).toBe('no_progress');

    for (const changed of [
      deriveReactionToken({
        publication_id: `sha256:${'b'.repeat(64)}`, head_sha: 'c'.repeat(40),
        failing_checks: [{ id: 'CHECK_1', conclusion: 'TIMED_OUT' }],
        unresolved_review_thread_ids: ['THREAD_1'], mergeability: 'CONFLICTING',
      }),
      deriveReactionToken({
        publication_id: `sha256:${'b'.repeat(64)}`, head_sha: 'c'.repeat(40),
        failing_checks: [{ id: 'CHECK_1', conclusion: 'FAILURE' }],
        unresolved_review_thread_ids: ['THREAD_2'], mergeability: 'CONFLICTING',
      }),
      deriveReactionToken({
        publication_id: `sha256:${'b'.repeat(64)}`, head_sha: 'c'.repeat(40),
        failing_checks: [{ id: 'CHECK_1', conclusion: 'FAILURE' }],
        unresolved_review_thread_ids: ['THREAD_1'], mergeability: 'MERGEABLE',
      }),
    ]) {
      expect(changed).not.toBe(base);
      expect(evaluateNoProgress(completedTwice, changed)).toBe('none');
    }
  });
});
