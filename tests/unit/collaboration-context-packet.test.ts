/**
 * C2 — `CollaborationContextPacketV1`.
 *
 * The acceptance line for this file is narrow and checkable: the same source
 * bytes build the same packet, the retrieval vocabulary is closed, the quota
 * stops the hottest lane from taking the whole window, truncation leaves
 * evidence, and the rendered text stays inside 1,500 estimated tokens with no
 * wall clock anywhere in the digest preimage.
 */
import { describe, expect, test } from 'bun:test';

import { CollaborationError, type CollaborationActorRefV1 } from '../../src/core/collaboration/common';
import { buildCoordinationSignal, type CoordinationSignalV1 } from '../../src/core/collaboration/signal';
import type { CollaborationHandoffFactV1 } from '../../src/core/collaboration/thread-projection';
import {
  COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
  COLLABORATION_CONTEXT_END,
  COLLABORATION_CONTEXT_START,
  COLLABORATION_CONTEXT_WARNING,
  COLLABORATION_ESTIMATOR_VERSION,
  COLLABORATION_EXPLOITATION_QUOTA_PERCENT,
  COLLABORATION_HOTSPOT_SELECTION_TOP_K,
  COLLABORATION_RETRIEVAL_REASONS,
  COLLABORATION_SELECTION_POLICY_VERSION,
  COLLABORATION_SNAPSHOT_CONSISTENCY,
  buildCollaborationContextPacket,
  canonicalCollaborationContextPacketBytes,
  collaborationContextEnvelopeTokens,
  collaborationEstimatedTokens,
  renderCollaborationSignalLine,
  validateCollaborationContextPacket,
} from '../../src/core/collaboration/context-packet';

const repositoryId = 'repo_0123456789abcdef';
const digest = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`;
const recordId = (n: number): string => n.toString(16).padStart(64, '0');
const taskId = 'a'.repeat(64);
const taskRevision = 'b'.repeat(64);

function engineer(name: string): CollaborationActorRefV1 {
  return {
    kind: 'module_engineer',
    engineer_id: `engineer:capability.runtime-harness.${name}`,
    binding_id: '11111111-1111-4111-8111-111111111111',
    binding_generation: 1,
    principal_mapping_sha256: digest('a'),
  };
}

interface SignalSpec {
  readonly n: number;
  readonly thread: string;
  readonly at?: string;
  readonly actor?: string;
  readonly scopes?: readonly Record<string, string>[];
  readonly sources?: readonly number[];
  readonly artifacts?: number;
}

function signal(spec: SignalSpec): CoordinationSignalV1 {
  return buildCoordinationSignal({
    signal_id: recordId(spec.n),
    repository_id: repositoryId,
    actor: engineer(spec.actor ?? 'collaboration'),
    thread_key: spec.thread,
    reply_to_signal_id: null,
    scope_refs: (spec.scopes ?? []) as never,
    labels: [],
    title: `signal ${spec.n}`,
    body: `body of signal ${spec.n}`,
    artifact_refs: Array.from({ length: spec.artifacts ?? 0 }, (_unused, index) => ({
      ref: `runs/${spec.n}/${index}.txt`,
      sha256: digest('d'),
    })),
    source_signal_ids: (spec.sources ?? []).map(recordId),
    supersedes_signal_id: null,
    created_at: spec.at ?? `2026-08-30T00:00:${String(spec.n % 60).padStart(2, '0')}Z`,
  });
}

const subjectRefs = [{ kind: 'task' as const, task_id: taskId, task_revision: taskRevision }];

/**
 * One lane per retrieval reason. The subject task is observed at a *different*
 * revision than the subject ref carries, which is the case the matching rule
 * exists for.
 */
function reasonFixture(): readonly CoordinationSignalV1[] {
  return [
    signal({ n: 1, thread: 'subject', scopes: [{ kind: 'task', task_id: taskId, task_revision: 'c'.repeat(64) }] }),
    signal({ n: 2, thread: 'subject' }),
    signal({ n: 3, thread: 'cites-subject', sources: [1] }),
    signal({ n: 4, thread: 'handoff-lane' }),
    signal({ n: 5, thread: 'hot-lane', artifacts: 4, actor: 'delivery' }),
    signal({ n: 6, thread: 'hot-lane', artifacts: 4 }),
    signal({ n: 7, thread: 'cold-lane', at: '2026-08-01T00:00:00Z' }),
  ];
}

const handoffFacts: readonly CollaborationHandoffFactV1[] = [
  { thread_key: 'handoff-lane', handoff_id: recordId(0xa1), adoption_count: 2 },
];

function packetFor(
  signals: readonly CoordinationSignalV1[],
  overrides: Partial<Parameters<typeof buildCollaborationContextPacket>[0]> = {},
) {
  return buildCollaborationContextPacket({
    repository_id: repositoryId,
    signals,
    subject_refs: subjectRefs,
    handoff_facts: handoffFacts,
    handoff: { handoff_id: recordId(0xa1), handoff_sha256: digest('e') },
    // Stated explicitly, never defaulted: these fixtures stand in for a reader
    // that observed a clean collection, which is a claim only a reader can make.
    snapshot_consistency: 'stable',
    // The frozen ceiling, which is also the largest budget the builder accepts.
    // These fixtures are about selection, not truncation, and they fit inside it.
    budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
    ...overrides,
  });
}

describe('the packet is byte-identical for the same input', () => {
  test('two builds of the same records produce the same bytes and the same digest', () => {
    const first = packetFor(reasonFixture());
    const second = packetFor([...reasonFixture()].reverse());
    expect(canonicalCollaborationContextPacketBytes(second.packet))
      .toBe(canonicalCollaborationContextPacketBytes(first.packet));
    expect(second.packet.packet_sha256).toBe(first.packet.packet_sha256);
    expect(second.rendered_context).toBe(first.rendered_context);
  });

  test('the packet carries no built_at, in the record or in its digest preimage', () => {
    const { packet } = packetFor(reasonFixture());
    expect(Object.keys(packet)).not.toContain('built_at');
    expect(canonicalCollaborationContextPacketBytes(packet)).not.toContain('built_at');
  });

  test('nothing on the build path reads the wall clock', () => {
    const now = Date.now;
    Date.now = () => { throw new Error('the packet builder must not read the wall clock'); };
    try {
      expect(packetFor(reasonFixture()).packet.signals.length).toBeGreaterThan(0);
    } finally {
      Date.now = now;
    }
  });

  test('the rendered text is what rendered_context_sha256 digests, inside the untrusted markers', () => {
    const { packet, rendered_context: rendered } = packetFor(reasonFixture());
    const lines = rendered.split('\n');
    expect(lines[0]).toBe(COLLABORATION_CONTEXT_START);
    expect(lines[1]).toBe(COLLABORATION_CONTEXT_WARNING);
    expect(lines[lines.length - 1]).toBe(COLLABORATION_CONTEXT_END);
    expect(lines).toHaveLength(packet.signals.length + 3);
    expect(validateCollaborationContextPacket(packet).rendered_context_sha256)
      .toBe(packet.rendered_context_sha256);
  });
});

describe('retrieval reasons are a closed set with matched refs', () => {
  test('the exported vocabulary is exactly the nine reason codes', () => {
    expect([...COLLABORATION_RETRIEVAL_REASONS]).toEqual([
      'same_task',
      'same_work_package',
      'same_capability',
      'same_path',
      'same_thread',
      'source_reference',
      'handoff',
      'hotspot',
      'exploration_slot',
    ]);
  });

  test('every reason a lane can earn is produced, and every produced reason is a member', () => {
    const { packet } = packetFor(reasonFixture());
    const members = new Set<string>(COLLABORATION_RETRIEVAL_REASONS);
    expect(packet.signals.filter((relevant) => !members.has(relevant.reason))).toEqual([]);
    const byId = new Map(packet.signals.map((relevant) => [relevant.signal_id, relevant.reason]));
    expect({
      subject: byId.get(recordId(1)),
      sameThread: byId.get(recordId(2)),
      sourceReference: byId.get(recordId(3)),
      handoff: byId.get(recordId(4)),
    }).toEqual({
      subject: 'same_task',
      sameThread: 'same_thread',
      sourceReference: 'source_reference',
      handoff: 'handoff',
    });
    expect(['hotspot', 'exploration_slot']).toContain(byId.get(recordId(7))!);
  });

  test('each subject kind produces its own reason code', () => {
    const capabilityId = 'capability.runtime-harness.collaboration';
    const signals = [
      signal({ n: 11, thread: 'by-task', scopes: [{ kind: 'task', task_id: taskId, task_revision: taskRevision }] }),
      signal({ n: 12, thread: 'by-work-package', scopes: [{ kind: 'work_package', work_package_id: 'wp-1', work_package_revision: digest('b') }] }),
      signal({ n: 13, thread: 'by-capability', scopes: [{ kind: 'capability', capability_id: capabilityId, capability_revision: digest('b') }] }),
      signal({ n: 14, thread: 'by-path', scopes: [{ kind: 'path', path: 'src/core/collaboration/hotspot.ts', head_sha: 'c'.repeat(40) }] }),
    ];
    const { packet } = packetFor(signals, {
      handoff: null,
      handoff_facts: [],
      subject_refs: [
        { kind: 'task', task_id: taskId, task_revision: taskRevision },
        { kind: 'work_package', work_package_id: 'wp-1', work_package_revision: digest('f') },
        { kind: 'capability', capability_id: capabilityId, capability_revision: digest('f') },
        { kind: 'path', path: 'src/core/collaboration/hotspot.ts', head_sha: 'd'.repeat(40) },
      ],
    });
    expect(new Map(packet.signals.map((relevant) => [relevant.signal_id, relevant.reason])))
      .toEqual(new Map([
        [recordId(11), 'same_task'],
        [recordId(12), 'same_work_package'],
        [recordId(13), 'same_capability'],
        [recordId(14), 'same_path'],
      ]));
  });

  test('a subject match discloses the revision the observation was made at', () => {
    const { packet } = packetFor(reasonFixture());
    const matched = packet.signals.find((relevant) => relevant.signal_id === recordId(1))!;
    expect(matched.matched_refs).toEqual([
      { kind: 'task', task_id: taskId, task_revision: 'c'.repeat(64) },
    ]);
  });

  test('signals with no subject reason carry no matched refs', () => {
    const { packet } = packetFor(reasonFixture());
    for (const relevant of packet.signals) {
      if (relevant.reason === 'same_task') continue;
      expect({ id: relevant.signal_id, refs: relevant.matched_refs }).toEqual({ id: relevant.signal_id, refs: [] });
    }
  });

  test('a subject kind the closed set cannot express is refused, not dropped', () => {
    expect(() => packetFor(reasonFixture(), {
      subject_refs: [{ kind: 'free_topic', value: 'merge flake' }],
    })).toThrow(CollaborationError);
    expect(() => packetFor(reasonFixture(), {
      subject_refs: [{ kind: 'publication', publication_id: 'pub-1', head_sha: 'c'.repeat(40) }],
    })).toThrow(CollaborationError);
  });

  test('the handoff reason needs an injected fact; the reference alone infers no lane', () => {
    const { packet } = packetFor(reasonFixture(), { handoff_facts: [] });
    expect(packet.handoff).toEqual({ handoff_id: recordId(0xa1), handoff_sha256: digest('e') });
    expect(packet.signals.some((relevant) => relevant.reason === 'handoff')).toBe(false);
  });
});

/** Twelve lanes of three signals each, plus one two-signal single-voice lane. */
function crowdedFixture(): readonly CoordinationSignalV1[] {
  const busy = Array.from({ length: 36 }, (_unused, index) => signal({
    n: index + 1,
    thread: `lane-${String(Math.floor(index / 3)).padStart(2, '0')}`,
    actor: `role-${index % 3}`,
    artifacts: 2,
  }));
  return [
    ...busy,
    signal({ n: 90, thread: 'single-voice', at: '2026-08-30T00:00:40Z' }),
    signal({ n: 91, thread: 'single-voice', at: '2026-08-30T00:00:41Z' }),
  ];
}

describe('the quota bounds what the hottest lane can take', () => {
  test('the low-coverage lane is funded even when twelve busier lanes compete', () => {
    const { packet } = packetFor(crowdedFixture(), { subject_refs: [], handoff: null, handoff_facts: [], budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS });
    const chosen = new Set(packet.signals.map((relevant) => relevant.signal_id));
    expect(chosen.has(recordId(90)) || chosen.has(recordId(91))).toBe(true);
  });

  test('each pool spends only its own share, so exploration is never borrowed against', () => {
    const signals = crowdedFixture();
    const { packet, projection } = packetFor(signals, {
      subject_refs: [],
      handoff: null,
      handoff_facts: [],
      budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
    });
    const rank = new Map(projection.threads.map((thread, index) => [thread.thread_key, index]));
    const reserved = new Set(projection.opportunities
      .filter((opportunity) => opportunity.reason === 'low_contributor_coverage' || opportunity.reason === 'unadopted_handoff')
      .map((opportunity) => opportunity.thread_key));
    // Pool membership is a lane property in this fixture: a lane is reserved, or
    // it falls outside the hot top-K and becomes the exploration pool.
    const poolOf = (lane: string): 'exploitation' | 'exploration' =>
      (reserved.has(lane) || rank.get(lane)! >= COLLABORATION_HOTSPOT_SELECTION_TOP_K ? 'exploration' : 'exploitation');
    const byId = new Map(signals.map((entry) => [entry.signal_id, entry]));
    const spent = { exploitation: 0, exploration: 0 };
    for (const relevant of packet.signals) {
      const source = byId.get(relevant.signal_id)!;
      spent[poolOf(source.thread_key)] += collaborationEstimatedTokens(
        `${renderCollaborationSignalLine(source, relevant)}\n`,
      );
    }
    const signalBudget = COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS - collaborationContextEnvelopeTokens();
    const exploitationBudget = Math.floor((signalBudget * COLLABORATION_EXPLOITATION_QUOTA_PERCENT) / 100);
    expect(spent.exploitation).toBeLessThanOrEqual(exploitationBudget);
    expect(spent.exploration).toBeLessThanOrEqual(signalBudget - exploitationBudget);
    // Both pools actually bought something: a quota that only one side ever
    // spends is a quota in name only.
    expect(spent.exploitation).toBeGreaterThan(0);
    expect(spent.exploration).toBeGreaterThan(0);
  });

  test('the hot top-K cannot take every slot', () => {
    const signals = crowdedFixture();
    const { packet, projection } = packetFor(signals, {
      subject_refs: [],
      handoff: null,
      handoff_facts: [],
      budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
    });
    const rank = new Map(projection.threads.map((thread, index) => [thread.thread_key, index]));
    const threadOf = new Map(signals.map((entry) => [entry.signal_id, entry.thread_key]));
    const lanes = packet.signals.map((relevant) => threadOf.get(relevant.signal_id)!);
    const perLane = new Map<string, number>();
    for (const lane of lanes) perLane.set(lane, (perLane.get(lane) ?? 0) + 1);
    expect(Math.max(...perLane.values())).toBeLessThan(lanes.length);
    expect(lanes.filter((lane) => rank.get(lane)! >= COLLABORATION_HOTSPOT_SELECTION_TOP_K).length)
      .toBeGreaterThan(0);
  });

  test('the exploitation share is a fixed integer split of the signal budget', () => {
    const signalBudget = COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS - collaborationContextEnvelopeTokens();
    const exploitation = Math.floor((signalBudget * COLLABORATION_EXPLOITATION_QUOTA_PERCENT) / 100);
    expect(COLLABORATION_EXPLOITATION_QUOTA_PERCENT).toBe(60);
    expect(exploitation + (signalBudget - exploitation)).toBe(signalBudget);
    expect(Number.isInteger(exploitation)).toBe(true);
  });
});

describe('the budget is respected and truncation leaves evidence', () => {
  test('the rendered context stays inside the declared budget', () => {
    const { packet, rendered_context: rendered } = packetFor(crowdedFixture(), {
      subject_refs: [],
      handoff: null,
      handoff_facts: [],
      budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
    });
    expect(packet.budget_estimated_tokens).toBe(COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS);
    expect(collaborationEstimatedTokens(rendered)).toBeLessThanOrEqual(COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS);
  });

  test('an oversubscribed source set reports exactly what it omitted', () => {
    const signals = crowdedFixture();
    const { packet } = packetFor(signals, {
      subject_refs: [],
      handoff: null,
      handoff_facts: [],
      budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
    });
    expect(packet.truncated).toBe(true);
    expect(packet.omitted_signal_count).toBe(signals.length - packet.signals.length);
    expect(packet.omitted_signal_count).toBeGreaterThan(0);
  });

  test('a set that fits reports no truncation', () => {
    const { packet } = packetFor(reasonFixture());
    expect({ truncated: packet.truncated, omitted: packet.omitted_signal_count })
      .toEqual({ truncated: false, omitted: 0 });
    expect(packet.signals).toHaveLength(reasonFixture().length);
  });

  test('a budget that cannot even hold the wrapper is refused', () => {
    expect(() => packetFor(reasonFixture(), { budget_estimated_tokens: collaborationContextEnvelopeTokens() }))
      .toThrow(CollaborationError);
  });

  test('a budget above the frozen injection ceiling is refused', () => {
    // The bound lives in the builder rather than at each surface, so a caller
    // that can name the budget cannot raise the ceiling by asking. The largest
    // accepted value is the constant itself.
    expect(() => packetFor(reasonFixture(), {
      budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS + 1,
    })).toThrow(`must not exceed the frozen injection budget of ${COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS}`);
    expect(() => packetFor(reasonFixture(), { budget_estimated_tokens: 20_000 })).toThrow(CollaborationError);
    expect(packetFor(reasonFixture(), {
      budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
    }).packet.budget_estimated_tokens).toBe(COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS);
    // The default is the same number, so an omitted budget cannot exceed it either.
    expect(packetFor(reasonFixture(), { budget_estimated_tokens: undefined })
      .packet.budget_estimated_tokens).toBe(COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS);
  });
});

describe('the packet round-trips and fails closed', () => {
  test('validation reproduces the built record exactly', () => {
    const { packet } = packetFor(reasonFixture());
    expect(validateCollaborationContextPacket(JSON.parse(JSON.stringify(packet)))).toEqual(packet);
    expect(packet.selection_policy_version).toBe(COLLABORATION_SELECTION_POLICY_VERSION);
    expect(packet.estimator_version).toBe(COLLABORATION_ESTIMATOR_VERSION);
  });

  test.each([
    ['a stale digest', (record: Record<string, unknown>) => { record.packet_sha256 = digest('f'); }],
    ['an unknown field', (record: Record<string, unknown>) => { record.built_at = '2026-08-30T00:00:00Z'; }],
    ['truncation evidence that disagrees', (record: Record<string, unknown>) => { record.truncated = true; }],
    ['an unknown reason code', (record: Record<string, unknown>) => {
      (record.signals as Record<string, unknown>[])[0]!.reason = 'stalled_thread';
    }],
  ])('%s is rejected', (_label, mutate) => {
    const record = JSON.parse(JSON.stringify(packetFor(reasonFixture()).packet)) as Record<string, unknown>;
    mutate(record);
    expect(() => validateCollaborationContextPacket(record)).toThrow(CollaborationError);
  });

  test('a signal from another repository never reaches a packet', () => {
    const foreign = buildCoordinationSignal({
      signal_id: recordId(1),
      repository_id: 'repo_fedcba9876543210',
      actor: engineer('collaboration'),
      thread_key: 'subject',
      reply_to_signal_id: null,
      scope_refs: [],
      labels: [],
      title: 'signal 1',
      body: 'body of signal 1',
      artifact_refs: [],
      source_signal_ids: [],
      supersedes_signal_id: null,
      created_at: '2026-08-30T00:00:01Z',
    });
    expect(() => packetFor([foreign])).toThrow(CollaborationError);
  });
});

describe('snapshot_consistency is carried, not derived', () => {
  test('a build with no snapshot_consistency fails closed', () => {
    // `stable` is a positive assertion about a collection the builder never saw,
    // so there is nothing safe to default to: the caller states it or gets no packet.
    const { snapshot_consistency: _omitted, ...withoutMarker } = {
      repository_id: repositoryId,
      signals: reasonFixture(),
      subject_refs: subjectRefs,
      handoff_facts: handoffFacts,
      handoff: { handoff_id: recordId(0xa1), handoff_sha256: digest('e') },
      snapshot_consistency: 'stable' as const,
      budget_estimated_tokens: COLLABORATION_CONTEXT_BUDGET_ESTIMATED_TOKENS,
    };
    expect(() => buildCollaborationContextPacket(withoutMarker as never)).toThrow(CollaborationError);
    expect(COLLABORATION_SNAPSHOT_CONSISTENCY).toEqual(['stable', 'changed_during_read', 'degraded']);
  });

  test.each(['changed_during_read', 'degraded'] as const)(
    'an injected %s reaches the record and the digest',
    (consistency) => {
      const stable = packetFor(reasonFixture()).packet;
      const { packet } = packetFor(reasonFixture(), { snapshot_consistency: consistency });
      expect(packet.snapshot_consistency).toBe(consistency);
      // Same signals, same rendered text: only the marker moved, and the digest
      // has to notice, or a torn read would be indistinguishable from a clean one.
      expect(packet.rendered_context_sha256).toBe(stable.rendered_context_sha256);
      expect(packet.packet_sha256).not.toBe(stable.packet_sha256);
      expect(validateCollaborationContextPacket(JSON.parse(JSON.stringify(packet)))).toEqual(packet);
    },
  );

  test('a value outside the closed set is refused at build and at validation', () => {
    expect(() => packetFor(reasonFixture(), { snapshot_consistency: 'torn' as never }))
      .toThrow(CollaborationError);
    const record = JSON.parse(JSON.stringify(packetFor(reasonFixture()).packet)) as Record<string, unknown>;
    record.snapshot_consistency = 'torn';
    expect(() => validateCollaborationContextPacket(record)).toThrow(CollaborationError);
  });

  test('a packet missing the field is refused', () => {
    const record = JSON.parse(JSON.stringify(packetFor(reasonFixture()).packet)) as Record<string, unknown>;
    delete record.snapshot_consistency;
    expect(() => validateCollaborationContextPacket(record)).toThrow(CollaborationError);
  });
});
