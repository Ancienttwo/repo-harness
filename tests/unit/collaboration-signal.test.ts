/**
 * C1 — `CoordinationSignalV1`.
 *
 * The protocol closes the transport and nothing else. These tests pin the exact
 * key set, the content-addressed digest, the identity derivation, and the fact
 * that no semantic vocabulary is enforced.
 */
import { describe, expect, test } from 'bun:test';

import {
  COLLABORATION_PROTOCOL,
  COLLABORATION_SOURCE_SIGNAL_MAX_COUNT,
  CollaborationError,
  collaborationActorSha256,
  type CollaborationActorRefV1,
} from '../../src/core/collaboration/common';
import {
  COORDINATION_SIGNAL_KIND,
  buildCoordinationSignal,
  canonicalCoordinationSignalBytes,
  deriveCoordinationSignalId,
  validateCoordinationSignal,
  type CoordinationSignalInput,
} from '../../src/core/collaboration/signal';

const repositoryId = 'repo_0123456789abcdef';
const digest = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`;
const recordId = (seed: string): string => seed.repeat(64).slice(0, 64);

const actor: CollaborationActorRefV1 = {
  kind: 'module_engineer',
  engineer_id: 'engineer:capability.runtime-harness.collaboration',
  binding_id: '11111111-1111-4111-8111-111111111111',
  binding_generation: 1,
  principal_mapping_sha256: digest('a'),
};

const otherActor: CollaborationActorRefV1 = {
  kind: 'delegated_worker',
  parent_engineer_id: 'engineer:capability.runtime-harness.collaboration',
  parent_binding_id: '11111111-1111-4111-8111-111111111111',
  parent_binding_generation: 1,
  worker_run_ref_sha256: digest('b'),
  admission_receipt_sha256: digest('c'),
};

function input(overrides: Partial<CoordinationSignalInput> = {}): CoordinationSignalInput {
  return {
    signal_id: recordId('1'),
    repository_id: repositoryId,
    actor,
    thread_key: 'merge-gate-flake',
    reply_to_signal_id: null,
    scope_refs: [{ kind: 'path', path: 'src/core/collaboration/signal.ts', head_sha: 'c'.repeat(40) }],
    labels: ['NEED-REPRO'],
    title: 'lock contention shows up only under four writers',
    body: 'Reproduced twice; the third writer never observes the published token.',
    artifact_refs: [{ ref: 'runs/2026-08-29/stdout.txt', sha256: digest('d') }],
    source_signal_ids: [],
    supersedes_signal_id: null,
    created_at: '2026-08-29T12:00:00.000Z',
    ...overrides,
  };
}

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CollaborationError) return error.code;
    return `unexpected:${(error as Error).message}`;
  }
  return 'no-error';
}

describe('C1 coordination signal protocol', () => {
  test('builds a content-addressed record with the frozen envelope', () => {
    const signal = buildCoordinationSignal(input());
    expect(signal.protocol).toBe(COLLABORATION_PROTOCOL);
    expect(signal.kind).toBe(COORDINATION_SIGNAL_KIND);
    expect(signal.signal_sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(Object.keys(signal).sort()).toEqual([
      'actor', 'artifact_refs', 'body', 'created_at', 'kind', 'labels', 'protocol', 'reply_to_signal_id',
      'repository_id', 'scope_refs', 'signal_id', 'signal_sha256', 'source_signal_ids',
      'supersedes_signal_id', 'thread_key', 'title',
    ]);
    expect(validateCoordinationSignal(signal)).toEqual(signal);
    expect(canonicalCoordinationSignalBytes(signal)).toBe(JSON.stringify(JSON.parse(canonicalCoordinationSignalBytes(signal))));
  });

  test('identical inputs produce identical bytes, and any field change moves the digest', () => {
    const first = buildCoordinationSignal(input());
    expect(canonicalCoordinationSignalBytes(buildCoordinationSignal(input()))).toBe(canonicalCoordinationSignalBytes(first));
    for (const change of [
      { title: 'different' },
      { body: 'different' },
      { thread_key: 'other-thread' },
      { labels: ['HOLD'] },
      { created_at: '2026-08-29T12:00:01.000Z' },
      { actor: otherActor },
    ] as Partial<CoordinationSignalInput>[]) {
      expect(buildCoordinationSignal(input(change)).signal_sha256).not.toBe(first.signal_sha256);
    }
  });

  test('rejects unknown fields, a wrong protocol or kind, and a stale digest', () => {
    const signal = buildCoordinationSignal(input());
    expect(code(() => validateCoordinationSignal({ ...signal, extra: 1 }))).toBe('collaboration_invalid');
    const { title: _dropped, ...withoutTitle } = signal as unknown as Record<string, unknown>;
    expect(code(() => validateCoordinationSignal(withoutTitle))).toBe('collaboration_invalid');
    expect(code(() => validateCoordinationSignal({ ...signal, protocol: 2 }))).toBe('collaboration_invalid');
    expect(code(() => validateCoordinationSignal({ ...signal, kind: 'repo-harness-work-state-handoff' }))).toBe('collaboration_invalid');
    expect(code(() => validateCoordinationSignal({ ...signal, title: 'edited in place' }))).toBe('collaboration_invalid');
    expect(code(() => validateCoordinationSignal({ ...signal, signal_sha256: digest('f') }))).toBe('collaboration_invalid');
    expect(code(() => validateCoordinationSignal('not an object'))).toBe('collaboration_invalid');
  });

  test('rejects malformed identity, repository and reference fields', () => {
    expect(code(() => buildCoordinationSignal(input({ signal_id: 'short' })))).toBe('collaboration_invalid');
    expect(code(() => buildCoordinationSignal(input({ repository_id: 'my-repo' })))).toBe('collaboration_invalid');
    expect(code(() => buildCoordinationSignal(input({ supersedes_signal_id: 'short' })))).toBe('collaboration_invalid');
    expect(code(() => buildCoordinationSignal(input({ reply_to_signal_id: 'short' })))).toBe('collaboration_invalid');
    expect(code(() => buildCoordinationSignal(input({ source_signal_ids: ['short'] })))).toBe('collaboration_invalid');
    expect(code(() => buildCoordinationSignal(input({ source_signal_ids: [recordId('2'), recordId('2')] })))).toBe('collaboration_invalid');
  });

  test('refuses self-reference in every reference slot', () => {
    const id = recordId('1');
    expect(code(() => buildCoordinationSignal(input({ supersedes_signal_id: id })))).toBe('collaboration_invalid');
    expect(code(() => buildCoordinationSignal(input({ reply_to_signal_id: id })))).toBe('collaboration_invalid');
    expect(code(() => buildCoordinationSignal(input({ source_signal_ids: [id] })))).toBe('collaboration_invalid');
  });

  test('bounds source signals at sixteen', () => {
    const ids = Array.from(
      { length: COLLABORATION_SOURCE_SIGNAL_MAX_COUNT },
      (_unused, index) => index.toString(16).padStart(2, '0').repeat(32),
    );
    expect(buildCoordinationSignal(input({ source_signal_ids: ids })).source_signal_ids).toHaveLength(COLLABORATION_SOURCE_SIGNAL_MAX_COUNT);
    expect(code(() => buildCoordinationSignal(input({ source_signal_ids: [...ids, recordId('e')] })))).toBe('collaboration_invalid');
  });

  test('closes no semantics: any thread key and any label vocabulary is accepted', () => {
    const emergent = buildCoordinationSignal(input({
      thread_key: 'whatever-the-agent-decided-to-call-it',
      labels: ['HOLD', 'BREAKTHROUGH', 'NEED-REPRO', 'lane:perf'],
      scope_refs: [{ kind: 'free_topic', value: 'not in any existing taxonomy' }],
    }));
    expect(emergent.labels).toEqual(['HOLD', 'BREAKTHROUGH', 'NEED-REPRO', 'lane:perf']);
    expect(emergent.scope_refs[0]).toEqual({ kind: 'free_topic', value: 'not in any existing taxonomy' });
  });
});

describe('C1 coordination signal identity derivation', () => {
  test('is deterministic in the repository, the actor and one identity key', () => {
    const id = deriveCoordinationSignalId(repositoryId, actor, 'idem-1');
    expect(id).toMatch(/^[0-9a-f]{64}$/u);
    expect(deriveCoordinationSignalId(repositoryId, actor, 'idem-1')).toBe(id);
    expect(deriveCoordinationSignalId(repositoryId, actor, 'idem-2')).not.toBe(id);
    expect(deriveCoordinationSignalId('repo_fedcba9876543210', actor, 'idem-1')).not.toBe(id);
    expect(deriveCoordinationSignalId(repositoryId, otherActor, 'idem-1')).not.toBe(id);
  });

  test('binds the whole actor, so a rebound Engineer does not reuse an identity', () => {
    const rebound = { ...actor, binding_generation: 2, principal_mapping_sha256: digest('e') };
    expect(collaborationActorSha256(rebound)).not.toBe(collaborationActorSha256(actor));
    expect(deriveCoordinationSignalId(repositoryId, rebound, 'idem-1'))
      .not.toBe(deriveCoordinationSignalId(repositoryId, actor, 'idem-1'));
  });
});
