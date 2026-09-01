import { describe, expect, test } from 'bun:test';

import {
  decodeOperatorCollaborationSnapshot,
  decodeOperatorFleetSnapshot,
  decodeOperatorTaskMessageResponse,
  OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR,
  OperatorCollaborationPayloadError,
  OperatorPayloadError,
  OperatorTaskMessageResponseError,
} from '../../src/operator-web/types';
import { translate } from '../../src/operator-web/i18n';

const taskId = 'a'.repeat(64);
const taskRevision = 'b'.repeat(64);
const claimId = '00000000-0000-4000-8000-000000000001';
const snapshotDigest = `sha256:${'c'.repeat(64)}`;

function validFleetPayload(): Record<string, unknown> {
  return {
    protocol: 3,
    kind: 'operator_fleet_snapshot',
    registry_revision: `sha256:${'d'.repeat(64)}`,
    sequence: 1,
    observed_at: '2026-08-31T00:00:00.000Z',
    snapshot_consistency: 'stable',
    repositories: [{
      repository_id: 'repo-1',
      access_mode: 'read_write',
      status: 'ok',
      snapshot_consistency: 'stable',
      cards: [{
        repository_id: 'repo-1',
        task_id: taskId,
        task_revision: taskRevision,
        task_label: 'validate operator identity',
        task_index: 1,
        claim_id: claimId,
        generation: 1,
        column: 'working',
        attention_owner: 'agent',
        execution_readiness: 'execution_ready',
        lease_state: 'bound',
        publication_id: null,
        head_sha: null,
        merge_readiness: null,
        blocker_codes: [],
        feedback: { pending_count: 0, no_progress: false, repair_actions: [] },
        inbox: {
          unread_count: 0,
          addressed_to_current_claim: false,
          delivery_state: 'pending',
          runtime_reachability: 'unknown',
          effect_sha256: null,
          failure_class: null,
        },
        snapshot_consistency: 'stable',
      }],
      error: null,
    }],
    counts: { available: 0, working: 1, in_review: 0, ready_to_merge: 0, done: 0, unreadable: 0 },
    source_snapshot_sha256: snapshotDigest,
  };
}

function fleetPayloadWithCard(changes: Record<string, unknown>): Record<string, unknown> {
  const payload = validFleetPayload();
  const repositories = payload.repositories as Array<Record<string, unknown>>;
  const repository = repositories[0]!;
  const cards = repository.cards as Array<Record<string, unknown>>;
  repository.cards = [{ ...cards[0], ...changes }];
  return payload;
}

function validCollaborationPayload(): Record<string, unknown> {
  return {
    protocol: 1,
    kind: 'operator_collaboration_snapshot',
    repository_id: 'repo-1',
    mode: 'off',
    snapshot_consistency: 'stable',
    degraded_sources: [],
    changed_sources: [],
    threads: [],
    signals: [],
    handoffs: [],
    participants: [],
    opportunities: [],
    unverified_execution_context_count: 0,
    source_snapshot_sha256: snapshotDigest,
  };
}

describe('operator browser payload contracts', () => {
  test('accepts an addressable task and claim fence', () => {
    const decoded = decodeOperatorFleetSnapshot(validFleetPayload());
    const card = decoded.repositories[0]?.cards[0];

    expect(card).toMatchObject({ task_id: taskId, task_revision: taskRevision, claim_id: claimId, generation: 1 });
    expect(card?.task_id).toMatch(/^[0-9a-f]{64}$/u);
    expect(card?.task_revision).toMatch(/^[0-9a-f]{64}$/u);
    expect(card?.claim_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  });

  test.each([
    ['malformed task digest', { task_id: 'task-1' }],
    ['uppercase task digest', { task_id: 'A'.repeat(64) }],
    ['malformed task revision digest', { task_revision: 'revision-1' }],
    ['uppercase task revision digest', { task_revision: 'B'.repeat(64) }],
    ['malformed claim UUID', { claim_id: 'claim-1' }],
    ['zero generation', { generation: 0 }],
    ['claim without generation', { generation: null }],
    ['generation without claim', { claim_id: null }],
  ])('rejects %s before rendering a write affordance', (_name, changes) => {
    expect(() => decodeOperatorFleetSnapshot(fleetPayloadWithCard(changes))).toThrow(OperatorPayloadError);
  });

  test.each([
    ['unreadable repository with a card', { status: 'unreadable', snapshot_consistency: 'degraded', error: { code: 'repo_unreadable', message: 'unreadable' } }],
    ['unreadable repository with stable consistency', { status: 'unreadable', snapshot_consistency: 'stable', cards: [], error: { code: 'repo_unreadable', message: 'unreadable' } }],
    ['unreadable repository without an error', { status: 'unreadable', snapshot_consistency: 'degraded', cards: [], error: null }],
  ])('rejects an impossible %s payload', (_name, changes) => {
    const payload = validFleetPayload();
    const repositories = payload.repositories as Array<Record<string, unknown>>;
    repositories[0] = { ...repositories[0], ...changes };
    expect(() => decodeOperatorFleetSnapshot(payload)).toThrow(OperatorPayloadError);
  });

  test('rejects repository and Fleet consistency that is healthier than a child', () => {
    const changedCard = fleetPayloadWithCard({ snapshot_consistency: 'changed_during_read' });
    expect(() => decodeOperatorFleetSnapshot(changedCard)).toThrow(OperatorPayloadError);

    const degradedRepository = validFleetPayload();
    const repositories = degradedRepository.repositories as Array<Record<string, unknown>>;
    repositories[0] = { ...repositories[0], snapshot_consistency: 'degraded' };
    expect(() => decodeOperatorFleetSnapshot(degradedRepository)).toThrow(OperatorPayloadError);

    degradedRepository.snapshot_consistency = 'degraded';
    expect(decodeOperatorFleetSnapshot(degradedRepository).snapshot_consistency).toBe('degraded');
  });

  test('accepts mode as a closed collaboration consistency source', () => {
    expect(decodeOperatorCollaborationSnapshot({
      ...validCollaborationPayload(),
      snapshot_consistency: 'changed_during_read',
      changed_sources: ['mode'],
    }).changed_sources).toEqual(['mode']);
  });

  test('strictly decodes and binds Task Message success acknowledgments', () => {
    const expected = {
      repository_id: 'repo-1',
      task_id: taskId,
      message_id: '00000000-0000-4000-8000-000000000002',
      scope: 'claim' as const,
    };
    const created = {
      ok: true,
      protocol: 1,
      ...expected,
      created: true,
    } as const;
    expect(decodeOperatorTaskMessageResponse(created, expected, 201)).toEqual(created);
    expect(decodeOperatorTaskMessageResponse({ ...created, created: false }, expected, 200).created).toBe(false);
  });

  test.each([
    ['empty body', {}, 200],
    ['wrong protocol', { protocol: 2 }, 201],
    ['wrong repository', { repository_id: 'repo-2' }, 201],
    ['wrong task', { task_id: 'f'.repeat(64) }, 201],
    ['wrong message', { message_id: '00000000-0000-4000-8000-000000000003' }, 201],
    ['wrong scope', { scope: 'task' }, 201],
    ['extra field', { future: true }, 201],
    ['status disagrees with created', {}, 200],
  ])('rejects Task Message success with %s', (_name, changes, status) => {
    const expected = {
      repository_id: 'repo-1',
      task_id: taskId,
      message_id: '00000000-0000-4000-8000-000000000002',
      scope: 'claim' as const,
    };
    const response = _name === 'empty body' ? {} : {
      ok: true,
      protocol: 1,
      ...expected,
      created: true,
      ...changes,
    };
    expect(() => decodeOperatorTaskMessageResponse(response, expected, status)).toThrow(OperatorTaskMessageResponseError);
  });

  test('uses a collaboration-specific validation contract while Fleet keeps its own contract', () => {
    expect(() => decodeOperatorFleetSnapshot({ ...validFleetPayload(), protocol: 99 })).toThrow(OperatorPayloadError);

    let protocolError: unknown;
    try {
      decodeOperatorCollaborationSnapshot({ ...validCollaborationPayload(), protocol: 99 });
    } catch (error) {
      protocolError = error;
    }
    expect(protocolError).toBeInstanceOf(OperatorCollaborationPayloadError);
    expect(protocolError).toMatchObject(OPERATOR_COLLABORATION_PAYLOAD_INVALID_ERROR);
    expect(protocolError).not.toBeInstanceOf(OperatorPayloadError);

    expect(() => decodeOperatorCollaborationSnapshot({
      ...validCollaborationPayload(),
      threads: [{ thread_key: 'missing-required-fields' }],
    })).toThrow(OperatorCollaborationPayloadError);
  });

  test('provides runtime-effect recovery copy in both operator locales', () => {
    expect(translate('en', 'repo.error.runtimeEffectUnreadable')).toContain('Reconcile runtime delivery evidence');
    expect(translate('zh', 'repo.error.runtimeEffectUnreadable')).toContain('reconcile runtime 投递证据');
  });
});
