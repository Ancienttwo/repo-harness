/**
 * C2 — the deterministic hotspot function.
 *
 * These tests pin the two properties the sprint row's acceptance line rests on:
 * the score is a capped integer function of structural counts, and its recency
 * term is measured against the source snapshot's own epoch rather than the wall
 * clock.
 */
import { describe, expect, test } from 'bun:test';

import { CollaborationError } from '../../src/core/collaboration/common';
import {
  COLLABORATION_ARTIFACT_RICH_MIN_REFS,
  COLLABORATION_HOTSPOT_SCORE_MAX,
  COLLABORATION_LOW_COVERAGE_BONUS,
  COLLABORATION_RECENCY_BUCKET_BOUNDARIES_MS,
  COLLABORATION_RECENCY_RANK_MAX,
  collaborationHasLowContributorCoverage,
  collaborationHotspotScore,
  collaborationRecencyRank,
  type CollaborationHotspotInputV1,
} from '../../src/core/collaboration/hotspot';

const HOUR = 60 * 60 * 1000;

function input(overrides: Partial<CollaborationHotspotInputV1> = {}): CollaborationHotspotInputV1 {
  return {
    signal_count: 1,
    distinct_contributor_count: 1,
    artifact_ref_count: 0,
    unadopted_handoff_count: 0,
    cross_thread_reference_count: 0,
    recency_rank: 0,
    ...overrides,
  };
}

describe('recency is relative to the snapshot epoch', () => {
  test('the same age scores the same rank at any absolute instant', () => {
    const age = 3 * HOUR;
    const early = Date.parse('1999-01-01T00:00:00Z');
    const late = Date.parse('2099-01-01T00:00:00Z');
    expect(collaborationRecencyRank(early, early - age)).toBe(collaborationRecencyRank(late, late - age));
  });

  test('every bucket boundary maps to the documented rank, top rank first', () => {
    const epoch = Date.parse('2026-08-30T00:00:00Z');
    const ranks = COLLABORATION_RECENCY_BUCKET_BOUNDARIES_MS.map(
      (boundary) => collaborationRecencyRank(epoch, epoch - boundary),
    );
    expect(ranks).toEqual([4, 3, 2, 1]);
    expect(COLLABORATION_RECENCY_RANK_MAX).toBe(4);
    expect(collaborationRecencyRank(epoch, epoch)).toBe(COLLABORATION_RECENCY_RANK_MAX);
    const beyond = COLLABORATION_RECENCY_BUCKET_BOUNDARIES_MS[COLLABORATION_RECENCY_BUCKET_BOUNDARIES_MS.length - 1]!;
    expect(collaborationRecencyRank(epoch, epoch - beyond - 1)).toBe(0);
  });

  test('a thread newer than the epoch is a caller error, not a clamp', () => {
    const epoch = Date.parse('2026-08-30T00:00:00Z');
    expect(() => collaborationRecencyRank(epoch, epoch + 1)).toThrow(CollaborationError);
  });

  test('the function never consults the wall clock', () => {
    const epoch = Date.parse('2026-08-30T00:00:00Z');
    const now = Date.now;
    Date.now = () => { throw new Error('the hotspot function must not read the wall clock'); };
    try {
      expect(collaborationRecencyRank(epoch, epoch - HOUR)).toBe(COLLABORATION_RECENCY_RANK_MAX);
      expect(collaborationHotspotScore(input({ recency_rank: 4 }))).toBeGreaterThan(0);
    } finally {
      Date.now = now;
    }
  });
});

describe('the score is a capped integer function', () => {
  test('every score is a non-negative integer inside the declared bound', () => {
    const samples: CollaborationHotspotInputV1[] = [
      input(),
      input({ signal_count: 9_999, distinct_contributor_count: 9_999 }),
      input({ signal_count: 40, distinct_contributor_count: 1, artifact_ref_count: 400, unadopted_handoff_count: 40, cross_thread_reference_count: 40, recency_rank: 4 }),
      input({ signal_count: 3, distinct_contributor_count: 3, artifact_ref_count: 2, cross_thread_reference_count: 1, recency_rank: 2 }),
    ];
    for (const sample of samples) {
      const score = collaborationHotspotScore(sample);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(COLLABORATION_HOTSPOT_SCORE_MAX);
    }
  });

  test('no single dimension can grow without bound', () => {
    const capped = collaborationHotspotScore(input({ signal_count: 12, distinct_contributor_count: 1 }));
    const absurd = collaborationHotspotScore(input({ signal_count: 1_000_000, distinct_contributor_count: 1 }));
    expect(absurd).toBe(capped);
  });

  test('each dimension is monotonic while under its cap', () => {
    const base = input({ signal_count: 4, distinct_contributor_count: 2 });
    const fields = ['artifact_ref_count', 'unadopted_handoff_count', 'cross_thread_reference_count', 'recency_rank'] as const;
    for (const field of fields) {
      const low = collaborationHotspotScore({ ...base, [field]: 0 });
      const high = collaborationHotspotScore({ ...base, [field]: 1 });
      expect({ field, rises: high > low }).toEqual({ field, rises: true });
    }
  });

  test('a lane with signals but one participant carries the low-coverage bonus', () => {
    const lonely = input({ signal_count: 2, distinct_contributor_count: 1 });
    const shared = input({ signal_count: 2, distinct_contributor_count: 2 });
    expect(collaborationHasLowContributorCoverage(2, 1)).toBe(true);
    expect(collaborationHasLowContributorCoverage(1, 1)).toBe(false);
    expect(collaborationHasLowContributorCoverage(2, 2)).toBe(false);
    // The extra contributor is worth its own weight; the bonus is what keeps a
    // single-voice lane visible rather than letting the busier lane bury it.
    expect(collaborationHotspotScore(lonely) - collaborationHotspotScore(shared))
      .toBe(COLLABORATION_LOW_COVERAGE_BONUS - 5);
  });

  test('the artifact-rich threshold is a shared constant, not a local number', () => {
    expect(COLLABORATION_ARTIFACT_RICH_MIN_REFS).toBe(2);
  });
});

describe('invalid inputs fail closed', () => {
  test.each([
    ['signal_count', { signal_count: -1 }],
    ['signal_count fraction', { signal_count: 1.5 }],
    ['artifact_ref_count', { artifact_ref_count: -1 }],
    ['unadopted_handoff_count', { unadopted_handoff_count: Number.NaN }],
    ['recency_rank above max', { recency_rank: COLLABORATION_RECENCY_RANK_MAX + 1 }],
    ['more contributors than signals', { signal_count: 1, distinct_contributor_count: 2 }],
  ])('%s is rejected', (_label, overrides) => {
    expect(() => collaborationHotspotScore(input(overrides as Partial<CollaborationHotspotInputV1>)))
      .toThrow(CollaborationError);
  });
});
