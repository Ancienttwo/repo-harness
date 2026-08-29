/**
 * C1 — shared collaboration mechanics.
 *
 * `src/core/collaboration/common.ts` is frozen after this row: C2-C9 consume the
 * actor union, scope-ref union, artifact-ref alias, transport limits, record
 * identity and recorded-time source without editing them. These tests pin the
 * closed shapes, not the helpers' internals.
 */
import { describe, expect, test } from 'bun:test';

import {
  COLLABORATION_ARTIFACT_REF_MAX_COUNT,
  COLLABORATION_BODY_MAX_BYTES,
  COLLABORATION_LABEL_MAX_COUNT,
  COLLABORATION_MODES,
  COLLABORATION_PROTOCOL,
  COLLABORATION_SCOPE_REF_MAX_COUNT,
  COLLABORATION_SOURCE_SIGNAL_MAX_COUNT,
  COLLABORATION_TITLE_MAX_BYTES,
  CollaborationError,
  canonicalCollaborationBytes,
  collaborationActorLineage,
  collaborationActorSha256,
  deriveCollaborationRecordId,
  validateCollaborationActorRef,
  validateCollaborationArtifactRefs,
  validateCollaborationBody,
  validateCollaborationLabels,
  validateCollaborationRecordedTimeSource,
  validateCollaborationScopeRef,
  validateCollaborationScopeRefs,
  validateCollaborationTitle,
  type CollaborationActorRefV1,
} from '../../src/core/collaboration/common';

const digest = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`;

const moduleEngineer: CollaborationActorRefV1 = {
  kind: 'module_engineer',
  engineer_id: 'engineer:capability.runtime-harness.collaboration',
  binding_id: '11111111-1111-4111-8111-111111111111',
  binding_generation: 1,
  principal_mapping_sha256: digest('a'),
};

const delegatedWorker: CollaborationActorRefV1 = {
  kind: 'delegated_worker',
  parent_engineer_id: 'engineer:capability.runtime-harness.collaboration',
  parent_binding_id: '11111111-1111-4111-8111-111111111111',
  parent_binding_generation: 1,
  worker_run_ref_sha256: digest('b'),
  admission_receipt_sha256: digest('c'),
};

function code(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof CollaborationError) return error.code;
    return `unexpected:${(error as Error).message}`;
  }
  return 'no-error';
}

describe('C1 collaboration actor union', () => {
  test('accepts both supported kinds and rejects every unsupported one', () => {
    expect(validateCollaborationActorRef(moduleEngineer)).toEqual(moduleEngineer);
    expect(validateCollaborationActorRef(delegatedWorker)).toEqual(delegatedWorker);
    // D4 keeps deferred and unsupported kinds out of the wire union entirely:
    // there is no placeholder branch to grow into.
    for (const kind of ['human_operator', 'native_subagent', 'engineer', '']) {
      expect(code(() => validateCollaborationActorRef({ ...moduleEngineer, kind }))).toBe('collaboration_invalid');
    }
  });

  test('rejects unknown, missing and cross-branch fields', () => {
    expect(code(() => validateCollaborationActorRef({ ...moduleEngineer, extra: 1 }))).toBe('collaboration_invalid');
    const { binding_id: _dropped, ...withoutBinding } = moduleEngineer as Record<string, unknown>;
    expect(code(() => validateCollaborationActorRef(withoutBinding))).toBe('collaboration_invalid');
    // A module_engineer may not borrow the delegated_worker provenance fields.
    expect(code(() => validateCollaborationActorRef({
      ...moduleEngineer,
      worker_run_ref_sha256: digest('b'),
    }))).toBe('collaboration_invalid');
  });

  test('rejects malformed identity fields', () => {
    expect(code(() => validateCollaborationActorRef({ ...moduleEngineer, engineer_id: 'capability.a.b' }))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationActorRef({ ...moduleEngineer, binding_id: 'not-a-uuid' }))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationActorRef({ ...moduleEngineer, binding_generation: 0 }))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationActorRef({ ...moduleEngineer, principal_mapping_sha256: 'deadbeef' }))).toBe('collaboration_invalid');
  });

  test('actor digest is content-addressed and distinguishes the two kinds', () => {
    expect(collaborationActorSha256(moduleEngineer)).toBe(collaborationActorSha256({ ...moduleEngineer }));
    expect(collaborationActorSha256(moduleEngineer)).not.toBe(collaborationActorSha256(delegatedWorker));
  });

  test('lineage survives rebinding for an Engineer and separates two Worker runs', () => {
    // binding_generation counts rebindings of one persistent Engineer, so a
    // rebound Engineer may still supersede its own earlier signals.
    expect(collaborationActorLineage({ ...moduleEngineer, binding_generation: 7, principal_mapping_sha256: digest('d') }))
      .toBe(collaborationActorLineage(moduleEngineer));
    // Two delegated runs are two participants even under one parent Engineer.
    expect(collaborationActorLineage({ ...delegatedWorker, worker_run_ref_sha256: digest('e') }))
      .not.toBe(collaborationActorLineage(delegatedWorker));
    expect(collaborationActorLineage(moduleEngineer)).not.toBe(collaborationActorLineage(delegatedWorker));
  });
});

describe('C1 collaboration scope refs', () => {
  test('every branch binds the revision of what it points at', () => {
    const refs = [
      { kind: 'capability', capability_id: 'capability.runtime-harness.collaboration', capability_revision: digest('a') },
      { kind: 'work_package', work_package_id: 'wp-a', work_package_revision: digest('b') },
      { kind: 'task', task_id: 'a'.repeat(64), task_revision: 'b'.repeat(64) },
      { kind: 'path', path: 'src/core/collaboration/common.ts', head_sha: 'c'.repeat(40) },
      { kind: 'publication', publication_id: 'pub-1', head_sha: 'd'.repeat(40) },
      { kind: 'free_topic', value: 'why does the merge gate flake' },
    ] as const;
    for (const ref of refs) expect(validateCollaborationScopeRef(ref)).toEqual(ref);
    expect(validateCollaborationScopeRefs(refs.slice(0, 6), 'scope_refs')).toHaveLength(6);
  });

  test('rejects unknown kinds, unknown fields and unsafe paths', () => {
    expect(code(() => validateCollaborationScopeRef({ kind: 'lane', value: 'x' }))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationScopeRef({ kind: 'free_topic', value: 'x', extra: 1 }))).toBe('collaboration_invalid');
    for (const path of ['/etc/passwd', '../outside', 'a/../b', 'a//b', './a', '-rf']) {
      expect(code(() => validateCollaborationScopeRef({ kind: 'path', path, head_sha: 'c'.repeat(40) }))).toBe('collaboration_invalid');
    }
    expect(code(() => validateCollaborationScopeRef({ kind: 'path', path: 'a.ts', head_sha: 'zz' }))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationScopeRef({ kind: 'task', task_id: 'short', task_revision: 'b'.repeat(64) }))).toBe('collaboration_invalid');
  });

  test('enforces the scope-ref count bound', () => {
    const ref = { kind: 'free_topic', value: 'topic' } as const;
    const atLimit = Array.from({ length: COLLABORATION_SCOPE_REF_MAX_COUNT }, () => ref);
    expect(validateCollaborationScopeRefs(atLimit, 'scope_refs')).toHaveLength(COLLABORATION_SCOPE_REF_MAX_COUNT);
    expect(code(() => validateCollaborationScopeRefs([...atLimit, ref], 'scope_refs'))).toBe('collaboration_invalid');
  });
});

describe('C1 collaboration artifact refs', () => {
  test('runs the WorkerResult evidence-ref validator, bounded to eight entries', () => {
    const ref = { ref: 'run/stdout.txt', sha256: digest('a') };
    const atLimit = Array.from({ length: COLLABORATION_ARTIFACT_REF_MAX_COUNT }, () => ref);
    expect(validateCollaborationArtifactRefs(atLimit, 'artifact_refs')).toHaveLength(COLLABORATION_ARTIFACT_REF_MAX_COUNT);
    // The delegation module owns this validator, so its rejection type surfaces
    // here rather than a second collaboration-local copy of the same rules.
    expect(() => validateCollaborationArtifactRefs([...atLimit, ref], 'artifact_refs')).toThrow();
    expect(() => validateCollaborationArtifactRefs([{ ref: 'x', sha256: 'nope' }], 'artifact_refs')).toThrow();
    expect(() => validateCollaborationArtifactRefs([{ ref: 'x', sha256: digest('a'), extra: 1 }], 'artifact_refs')).toThrow();
  });
});

describe('C1 collaboration transport limits', () => {
  test('title, body and labels reject exactly at their frozen boundary', () => {
    expect(validateCollaborationTitle('t'.repeat(COLLABORATION_TITLE_MAX_BYTES))).toHaveLength(COLLABORATION_TITLE_MAX_BYTES);
    expect(code(() => validateCollaborationTitle('t'.repeat(COLLABORATION_TITLE_MAX_BYTES + 1)))).toBe('collaboration_invalid');
    expect(validateCollaborationBody('b'.repeat(COLLABORATION_BODY_MAX_BYTES))).toHaveLength(COLLABORATION_BODY_MAX_BYTES);
    expect(code(() => validateCollaborationBody('b'.repeat(COLLABORATION_BODY_MAX_BYTES + 1)))).toBe('collaboration_invalid');
    // Byte-bounded, not character-bounded.
    expect(code(() => validateCollaborationTitle('字'.repeat(COLLABORATION_TITLE_MAX_BYTES)))).toBe('collaboration_invalid');
    const labels = Array.from({ length: COLLABORATION_LABEL_MAX_COUNT }, (_unused, index) => `label-${index}`);
    expect(validateCollaborationLabels(labels, 'labels')).toHaveLength(COLLABORATION_LABEL_MAX_COUNT);
    expect(code(() => validateCollaborationLabels([...labels, 'one-more'], 'labels'))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationLabels(['dup', 'dup'], 'labels'))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationLabels(['line\nbreak'], 'labels'))).toBe('collaboration_invalid');
    // The protocol closes the label count, never the vocabulary.
    expect(validateCollaborationLabels(['HOLD', 'BREAKTHROUGH', 'NEED-REPRO'], 'labels')).toHaveLength(3);
  });

  test('the frozen limits match Child PRD A', () => {
    expect({
      title: COLLABORATION_TITLE_MAX_BYTES,
      body: COLLABORATION_BODY_MAX_BYTES,
      labels: COLLABORATION_LABEL_MAX_COUNT,
      scope_refs: COLLABORATION_SCOPE_REF_MAX_COUNT,
      artifact_refs: COLLABORATION_ARTIFACT_REF_MAX_COUNT,
      source_signals: COLLABORATION_SOURCE_SIGNAL_MAX_COUNT,
      protocol: COLLABORATION_PROTOCOL,
    }).toEqual({
      title: 256,
      body: 8 * 1024,
      labels: 12,
      scope_refs: 8,
      artifact_refs: 8,
      source_signals: 16,
      protocol: 1,
    });
  });

  test('collaboration.mode is the closed off/shadow/active ladder', () => {
    expect([...COLLABORATION_MODES]).toEqual(['off', 'shadow', 'active']);
  });
});

describe('C1 collaboration record identity', () => {
  test('is deterministic, domain-separated and unambiguous across preimage splits', () => {
    expect(deriveCollaborationRecordId('signal', ['a', 'b'])).toBe(deriveCollaborationRecordId('signal', ['a', 'b']));
    expect(deriveCollaborationRecordId('signal', ['a', 'b'])).not.toBe(deriveCollaborationRecordId('handoff', ['a', 'b']));
    // NUL-joined, so no pair of distinct part lists collides by concatenation.
    expect(deriveCollaborationRecordId('signal', ['ab', 'c'])).not.toBe(deriveCollaborationRecordId('signal', ['a', 'bc']));
    expect(deriveCollaborationRecordId('signal', ['a'])).toMatch(/^[0-9a-f]{64}$/u);
    expect(code(() => deriveCollaborationRecordId('signal', []))).toBe('collaboration_invalid');
  });
});

describe('C1 collaboration recorded time', () => {
  test('accepts both frozen sources and rejects anything else', () => {
    expect(validateCollaborationRecordedTimeSource({ kind: 'first_publication' })).toEqual({ kind: 'first_publication' });
    expect(validateCollaborationRecordedTimeSource({ kind: 'persisted_observation', observed_at: '2026-08-29T00:00:00.000Z' }))
      .toEqual({ kind: 'persisted_observation', observed_at: '2026-08-29T00:00:00.000Z' });
    expect(code(() => validateCollaborationRecordedTimeSource({ kind: 'wall_clock' }))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationRecordedTimeSource({ kind: 'first_publication', observed_at: '2026-08-29T00:00:00.000Z' }))).toBe('collaboration_invalid');
    expect(code(() => validateCollaborationRecordedTimeSource({ kind: 'persisted_observation', observed_at: 'yesterday' }))).toBe('collaboration_invalid');
  });
});

describe('C1 canonical bytes', () => {
  test('key order in the input does not change the bytes', () => {
    expect(canonicalCollaborationBytes({ b: 1, a: 2 })).toBe(canonicalCollaborationBytes({ a: 2, b: 1 }));
  });
});
