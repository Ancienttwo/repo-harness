/**
 * C2 — thread aggregation, the deterministic epoch and contribution
 * opportunities.
 *
 * The row's acceptance line asks for four things these tests hold: the same
 * input projects byte-identically, threads aggregate on opaque key equality
 * alone, recency is measured against the snapshot's own epoch, and the
 * opportunity vocabulary is a closed structural set with no state inference in
 * it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, test } from 'bun:test';

import {
  CollaborationError,
  canonicalCollaborationBytes,
  type CollaborationActorRefV1,
} from '../../src/core/collaboration/common';
import { COLLABORATION_RECENCY_RANK_MAX } from '../../src/core/collaboration/hotspot';
import { buildCoordinationSignal, type CoordinationSignalV1 } from '../../src/core/collaboration/signal';
import {
  COLLABORATION_OPPORTUNITY_REASONS,
  COLLABORATION_OPPORTUNITY_SOURCE_REF_MAX_COUNT,
  collaborationSourceSnapshotDigest,
  projectCollaborationThreads,
  type CollaborationHandoffFactV1,
} from '../../src/core/collaboration/thread-projection';

const REPO_ROOT = join(import.meta.dir, '..', '..');
const repositoryId = 'repo_0123456789abcdef';
const HOUR = 60 * 60 * 1000;

const digest = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`;
const recordId = (n: number): string => n.toString(16).padStart(64, '0');

function engineer(name: string, generation = 1): CollaborationActorRefV1 {
  return {
    kind: 'module_engineer',
    engineer_id: `engineer:capability.runtime-harness.${name}`,
    binding_id: '11111111-1111-4111-8111-111111111111',
    binding_generation: generation,
    principal_mapping_sha256: digest('a'),
  };
}

function worker(runSeed: string): CollaborationActorRefV1 {
  return {
    kind: 'delegated_worker',
    parent_engineer_id: 'engineer:capability.runtime-harness.collaboration',
    parent_binding_id: '11111111-1111-4111-8111-111111111111',
    parent_binding_generation: 1,
    worker_run_ref_sha256: digest(runSeed),
    admission_receipt_sha256: digest('c'),
  };
}

interface SignalSpec {
  readonly n: number;
  readonly thread: string;
  readonly at: string;
  readonly actor?: CollaborationActorRefV1;
  readonly artifacts?: number;
  readonly sources?: readonly number[];
  readonly replyTo?: number;
  readonly scopes?: readonly { kind: 'path'; path: string; head_sha: string }[];
}

function signal(spec: SignalSpec): CoordinationSignalV1 {
  return buildCoordinationSignal({
    signal_id: recordId(spec.n),
    repository_id: repositoryId,
    actor: spec.actor ?? engineer('collaboration'),
    thread_key: spec.thread,
    reply_to_signal_id: spec.replyTo === undefined ? null : recordId(spec.replyTo),
    scope_refs: spec.scopes ?? [],
    labels: [],
    title: `signal ${spec.n}`,
    body: `body of signal ${spec.n}`,
    artifact_refs: Array.from({ length: spec.artifacts ?? 0 }, (_unused, index) => ({
      ref: `runs/${spec.n}/${index}.txt`,
      sha256: digest('d'),
    })),
    source_signal_ids: (spec.sources ?? []).map(recordId),
    supersedes_signal_id: null,
    created_at: spec.at,
  });
}

/** Three lanes, two participants, one cross-lane citation and one dense lane. */
function fixture(): readonly CoordinationSignalV1[] {
  return [
    signal({ n: 1, thread: 'merge-gate-flake', at: '2026-08-30T00:00:00Z', artifacts: 2 }),
    signal({ n: 2, thread: 'merge-gate-flake', at: '2026-08-29T23:30:00Z', actor: engineer('delivery') }),
    signal({ n: 3, thread: 'lock-contention', at: '2026-08-29T21:00:00Z', sources: [1] }),
    signal({ n: 4, thread: 'lock-contention', at: '2026-08-29T20:00:00Z' }),
    signal({ n: 5, thread: 'docs-drift', at: '2026-08-25T00:00:00Z' }),
  ];
}

describe('the projection is byte-identical for the same input', () => {
  test('two builds of the same records produce the same bytes', () => {
    const first = projectCollaborationThreads({ signals: fixture() });
    const second = projectCollaborationThreads({ signals: fixture() });
    expect(canonicalCollaborationBytes(second as unknown as Readonly<Record<string, unknown>>))
      .toBe(canonicalCollaborationBytes(first as unknown as Readonly<Record<string, unknown>>));
    expect(second.projection_sha256).toBe(first.projection_sha256);
  });

  test('the caller\'s array order is not an input to the answer', () => {
    const forwards = fixture();
    const backwards = [...forwards].reverse();
    expect(projectCollaborationThreads({ signals: backwards }).projection_sha256)
      .toBe(projectCollaborationThreads({ signals: forwards }).projection_sha256);
    expect(collaborationSourceSnapshotDigest(backwards)).toBe(collaborationSourceSnapshotDigest(forwards));
  });

  test('nothing on the path reads the wall clock', () => {
    const now = Date.now;
    Date.now = () => { throw new Error('the projection must not read the wall clock'); };
    try {
      expect(projectCollaborationThreads({ signals: fixture() }).threads).toHaveLength(3);
    } finally {
      Date.now = now;
    }
  });

  test('the three C2 modules import only collaboration mechanics', () => {
    const allowed = new Set(['./common', './signal', './hotspot', './thread-projection', '../messages/mechanics']);
    for (const name of ['thread-projection', 'hotspot', 'context-packet']) {
      const source = readFileSync(join(REPO_ROOT, 'src/core/collaboration', `${name}.ts`), 'utf8');
      const specifiers = [...source.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/gu)].map((match) => match[1]!);
      expect({ name, outside: specifiers.filter((specifier) => !allowed.has(specifier)) })
        .toEqual({ name, outside: [] });
      // A hotspot score that could reach a scheduler would be an authority; the
      // import allowlist above is what makes "it cannot" checkable rather than
      // asserted, and this pins the clock out of the digest inputs too. Prose is
      // stripped first: these modules discuss the clock they refuse to read.
      const code = source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/\/\/[^\n]*/gu, '');
      expect({ name, clock: /Date\.now\(|new Date\(|performance\.now\(|hrtime/u.test(code) })
        .toEqual({ name, clock: false });
    }
  });
});

describe('lanes aggregate on exact opaque key equality', () => {
  test('keys that merely look alike stay apart', () => {
    const projection = projectCollaborationThreads({
      signals: [
        signal({ n: 1, thread: 'merge-gate', at: '2026-08-30T00:00:00Z' }),
        signal({ n: 2, thread: 'merge-gate ', at: '2026-08-30T00:00:00Z' }),
        signal({ n: 3, thread: 'Merge-Gate', at: '2026-08-30T00:00:00Z' }),
        signal({ n: 4, thread: 'merge-gate', at: '2026-08-30T00:00:00Z' }),
      ],
    });
    expect(projection.threads.map((thread) => thread.thread_key).sort())
      .toEqual(['Merge-Gate', 'merge-gate', 'merge-gate ']);
    expect(projection.threads.find((thread) => thread.thread_key === 'merge-gate')!.signal_count).toBe(2);
  });

  test('participants are counted by C1 lineage, so a rebinding is still one voice', () => {
    const projection = projectCollaborationThreads({
      signals: [
        signal({ n: 1, thread: 'lane', at: '2026-08-30T00:00:00Z', actor: engineer('collaboration', 1) }),
        signal({ n: 2, thread: 'lane', at: '2026-08-30T00:00:01Z', actor: engineer('collaboration', 4) }),
        signal({ n: 3, thread: 'lane', at: '2026-08-30T00:00:02Z', actor: worker('b') }),
        signal({ n: 4, thread: 'lane', at: '2026-08-30T00:00:03Z', actor: worker('e') }),
      ],
    });
    expect(projection.threads[0]!.distinct_contributor_count).toBe(3);
    expect(projection.threads[0]!.signal_count).toBe(4);
  });

  test('an unresolvable reference is not evidence of a cross-lane link', () => {
    const both = projectCollaborationThreads({ signals: fixture() });
    expect(both.threads.find((thread) => thread.thread_key === 'lock-contention')!.cross_thread_reference_count).toBe(1);
    expect(both.threads.find((thread) => thread.thread_key === 'merge-gate-flake')!.cross_thread_reference_count).toBe(1);
    const dangling = projectCollaborationThreads({
      signals: [signal({ n: 3, thread: 'lock-contention', at: '2026-08-29T21:00:00Z', sources: [99] })],
    });
    expect(dangling.threads[0]!.cross_thread_reference_count).toBe(0);
  });

  test('a duplicate record in the source set fails the projection closed', () => {
    const one = signal({ n: 1, thread: 'lane', at: '2026-08-30T00:00:00Z' });
    expect(() => projectCollaborationThreads({ signals: [one, one] })).toThrow(CollaborationError);
  });
});

describe('the epoch comes from the source set', () => {
  test('the epoch is the latest created_at, and recency is measured from it', () => {
    const projection = projectCollaborationThreads({ signals: fixture() });
    expect(projection.epoch_at).toBe('2026-08-30T00:00:00Z');
    expect(projection.threads.find((thread) => thread.thread_key === 'merge-gate-flake')!.recency_rank)
      .toBe(COLLABORATION_RECENCY_RANK_MAX);
    expect(projection.threads.find((thread) => thread.thread_key === 'docs-drift')!.recency_rank).toBe(0);
  });

  test('shifting every record by the same offset leaves every rank unchanged', () => {
    const shift = (iso: string): string => new Date(Date.parse(iso) + 4000 * HOUR).toISOString().replace(/\.000Z$/u, 'Z');
    const shifted = fixture().map((original) => signal({
      n: Number.parseInt(original.signal_id, 16),
      thread: original.thread_key,
      at: shift(original.created_at),
      artifacts: original.artifact_refs.length,
      sources: original.source_signal_ids.map((id) => Number.parseInt(id, 16)),
      actor: original.actor,
    }));
    expect(projectCollaborationThreads({ signals: shifted }).threads.map((thread) => thread.recency_rank))
      .toEqual(projectCollaborationThreads({ signals: fixture() }).threads.map((thread) => thread.recency_rank));
  });

  test('an empty source set has no epoch and no lanes', () => {
    const projection = projectCollaborationThreads({ signals: [] });
    expect(projection).toMatchObject({ epoch_at: null, signal_count: 0, threads: [], opportunities: [] });
  });
});

describe('the handoff seam is injected, never inferred', () => {
  test('with no facts every handoff-derived count is zero', () => {
    const projection = projectCollaborationThreads({ signals: fixture() });
    for (const thread of projection.threads) {
      expect({ key: thread.thread_key, unadopted: thread.unadopted_handoff_count, adoptions: thread.adoption_count })
        .toEqual({ key: thread.thread_key, unadopted: 0, adoptions: 0 });
    }
    expect(projection.opportunities.some((opportunity) => opportunity.reason === 'unadopted_handoff')).toBe(false);
  });

  test('injected facts produce counts and an unadopted-handoff opportunity', () => {
    const facts: readonly CollaborationHandoffFactV1[] = [
      { thread_key: 'lock-contention', handoff_id: recordId(0xa1), adoption_count: 0 },
      { thread_key: 'lock-contention', handoff_id: recordId(0xa2), adoption_count: 3 },
    ];
    const projection = projectCollaborationThreads({ signals: fixture(), handoff_facts: facts });
    const lane = projection.threads.find((thread) => thread.thread_key === 'lock-contention')!;
    expect({ unadopted: lane.unadopted_handoff_count, adoptions: lane.adoption_count })
      .toEqual({ unadopted: 1, adoptions: 3 });
    expect(projection.opportunities.find((opportunity) => opportunity.reason === 'unadopted_handoff'))
      .toEqual({ thread_key: 'lock-contention', reason: 'unadopted_handoff', source_refs: [recordId(0xa1)] });
  });

  test('a fact about a lane the snapshot cannot see fails closed', () => {
    expect(() => projectCollaborationThreads({
      signals: fixture(),
      handoff_facts: [{ thread_key: 'a-lane-with-no-signals', handoff_id: recordId(0xa1), adoption_count: 0 }],
    })).toThrow(CollaborationError);
  });

  test('a duplicate handoff fact fails closed', () => {
    const fact: CollaborationHandoffFactV1 = { thread_key: 'docs-drift', handoff_id: recordId(0xa1), adoption_count: 0 };
    expect(() => projectCollaborationThreads({ signals: fixture(), handoff_facts: [fact, fact] }))
      .toThrow(CollaborationError);
  });
});

describe('contribution opportunities use a closed structural set', () => {
  test('the exported vocabulary is exactly the six structural reasons', () => {
    expect([...COLLABORATION_OPPORTUNITY_REASONS]).toEqual([
      'unadopted_handoff',
      'low_contributor_coverage',
      'cross_thread_reference',
      'recent_activity',
      'artifact_rich_thread',
      'exploration_slot',
    ]);
  });

  test('the three removed inference reasons are not members', () => {
    const removed = ['open_request', 'unverified_hypothesis', 'stalled_thread'];
    expect(removed.filter((reason) => (COLLABORATION_OPPORTUNITY_REASONS as readonly string[]).includes(reason)))
      .toEqual([]);
  });

  test('every produced reason is a member of the exported set', () => {
    const projection = projectCollaborationThreads({
      signals: fixture(),
      handoff_facts: [{ thread_key: 'docs-drift', handoff_id: recordId(0xa1), adoption_count: 0 }],
    });
    const members = new Set<string>(COLLABORATION_OPPORTUNITY_REASONS);
    expect(projection.opportunities.filter((opportunity) => !members.has(opportunity.reason))).toEqual([]);
  });

  test('each structural reason is produced by the condition it names', () => {
    const projection = projectCollaborationThreads({ signals: fixture() });
    const reasonsFor = (threadKey: string): string[] => projection.opportunities
      .filter((opportunity) => opportunity.thread_key === threadKey)
      .map((opportunity) => String(opportunity.reason));
    // Two participants, two artifact refs, one crossing edge, latest in the set.
    expect(reasonsFor('merge-gate-flake').sort())
      .toEqual(['artifact_rich_thread', 'cross_thread_reference', 'recent_activity']);
    // One participant, two signals, one crossing edge, three hours old.
    expect(reasonsFor('lock-contention').sort())
      .toEqual(['cross_thread_reference', 'low_contributor_coverage']);
    // Nothing structural marks it, so it becomes the exploration pool.
    expect(reasonsFor('docs-drift')).toEqual(['exploration_slot']);
  });

  test('cross-lane refs name only the signals actually on a crossing edge', () => {
    const projection = projectCollaborationThreads({ signals: fixture() });
    expect(projection.opportunities.find(
      (opportunity) => opportunity.thread_key === 'lock-contention' && opportunity.reason === 'cross_thread_reference',
    )!.source_refs).toEqual([recordId(3)]);
  });

  test('recent_activity names every signal at the latest instant, in either spelling', () => {
    // `…:05Z` and `…:05.000Z` are one instant; `latest_signal_at` can only carry
    // one spelling, so a string compare would drop the other signal's evidence.
    const signals = [
      signal({ n: 1, thread: 'same-instant', at: '2026-08-30T00:00:05Z' }),
      signal({ n: 2, thread: 'same-instant', at: '2026-08-30T00:00:05.000Z', actor: engineer('delivery') }),
    ];
    const projection = projectCollaborationThreads({ signals });
    const recent = projection.opportunities.find((opportunity) => opportunity.reason === 'recent_activity')!;
    expect([...recent.source_refs].sort()).toEqual([recordId(1), recordId(2)].sort());
  });

  test('source refs stay bounded on a busy lane', () => {
    const signals = Array.from({ length: 20 }, (_unused, index) => signal({
      n: index + 1,
      thread: 'busy',
      at: `2026-08-30T00:00:${String(index).padStart(2, '0')}Z`,
    }));
    const projection = projectCollaborationThreads({ signals });
    for (const opportunity of projection.opportunities) {
      expect(opportunity.source_refs.length).toBeLessThanOrEqual(COLLABORATION_OPPORTUNITY_SOURCE_REF_MAX_COUNT);
    }
  });
});
