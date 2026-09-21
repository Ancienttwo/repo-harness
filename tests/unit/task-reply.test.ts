import { describe, expect, test } from 'bun:test';
import { canonicalEngineerJson, engineerSha256 } from '../../src/core/engineers/profile-binding';
import {
  revokeEngineerPrincipalMapping, validateClaimActorReceipt, validateEngineerPrincipalMapping,
  type ClaimActorReceiptV1, type EngineerPrincipalMappingV1,
} from '../../src/core/engineers/principal-claim';
import {
  buildTaskMessageEvent, buildTaskMessageDeliveryReceipt, transitionTaskMessageDeliveryReceipt,
  type TaskMessageEventInput,
} from '../../src/core/fleet/task-message';
import {
  TaskReplyError, assertTaskReplyResumeFence, assertTaskReplyRetry,
  buildTaskReplyCommit, buildTaskReplyIntent, canonicalTaskReplyCommitBytes, canonicalTaskReplyIntentBytes,
  inspectTaskReplyChain, validateTaskReplyCommit, validateTaskReplyIntent,
} from '../../src/core/fleet/task-reply';

const id = (n: number) => `${n}23e4567-e89b-42d3-a456-426614174000`;
const hex = (n: number) => String(n).repeat(64);
const hash = (n: number) => `sha256:${hex(n)}`;
const AT = '2026-09-21T16:00:00Z';
const LATER = '2026-09-21T16:01:00Z';

function mapping(changes: Partial<EngineerPrincipalMappingV1> = {}) {
  const value = {
    protocol: 1, kind: 'repo-harness-engineer-principal-mapping', repository_id: 'repo_1234567890abcdef',
    authorization_id: id(5), engineer_id: 'engineer:capability.runtime-harness.fleet', binding_id: id(4),
    binding_generation: 1, engineer_contract_revision: hash(8), state: 'active', created_at: AT, revoked_at: null,
    ...changes,
  };
  const { mapping_digest: _ignored, ...basis } = value as typeof value & { mapping_digest?: string };
  return validateEngineerPrincipalMapping({ ...basis, mapping_digest: engineerSha256(canonicalEngineerJson(basis)) });
}

function actor(changes: Partial<ClaimActorReceiptV1> = {}) {
  const value = {
    protocol: 1, kind: 'repo-harness-claim-actor-receipt', task_id: hex(1), task_revision: hex(2),
    claim_id: id(3), lease_generation: 1, engineer_id: 'engineer:capability.runtime-harness.fleet',
    binding_id: id(4), binding_generation: 1, repository_id: 'repo_1234567890abcdef', authorization_revision: 1,
    work_envelope_sha256: hash(7), worktree_path: '/fixture/worktree', branch: 'codex/fixture', unit_ref: 'fixture',
    engineer_contract_revision: hash(8), session_id: 'fixture-session', bound_at: AT, ...changes,
  };
  const { receipt_sha256: _ignored, ...basis } = value as typeof value & { receipt_sha256?: string };
  return validateClaimActorReceipt({ ...basis, receipt_sha256: engineerSha256(canonicalEngineerJson(basis)) });
}

function fixture(parentChanges: Partial<TaskMessageEventInput> = {}) {
  const parent = buildTaskMessageEvent({
    message_id: id(1), task_id: hex(1), task_revision: hex(2), scope: 'task', target_claim_id: null,
    target_generation: null, sender_kind: 'operator', sender_id: 'local-operator', sender_trust: 'local_operator',
    audience: 'owner', body: 'Inspect existing work before answering.', created_at: AT, in_reply_to: null,
    ...parentChanges,
  });
  const pending = buildTaskMessageDeliveryReceipt({ message_id: parent.message_id,
    recipient: { kind: 'claim', claim_id: id(3), generation: 1 }, task_revision: hex(2), delivery_channel: 'hook_session' });
  const delivered = transitionTaskMessageDeliveryReceipt(pending, { state: 'delivered', at: AT });
  const acknowledgement = transitionTaskMessageDeliveryReceipt(delivered, { state: 'acknowledged', at: AT });
  return { parent, acknowledgement, principal_mapping: mapping(), claim_actor: actor(),
    reply_message_id: id(2), body: 'I inspected the current candidate; no work was repeated.', prepared_at: LATER };
}

function chain() {
  const input = fixture();
  const intent = buildTaskReplyIntent(input);
  const commit = buildTaskReplyCommit({ intent, committed_at: LATER });
  return { parent: input.parent, acknowledgement: input.acknowledgement, intent, event: intent.reply, commit };
}

function resign<T extends object>(value: T, key: keyof T): T {
  const { [key]: _ignored, ...basis } = value;
  return { ...basis, [key]: engineerSha256(canonicalEngineerJson(basis)) } as T;
}

describe('Task reply contract', () => {
  test.each(['task', 'claim'] as const)('freezes a %s steer reply directed only to the user', (scope) => {
    const input = fixture(scope === 'claim' ? { scope, target_claim_id: id(3), target_generation: 1 } : {});
    const intent = buildTaskReplyIntent(input);
    expect(intent.reply).toMatchObject({ scope: 'task', audience: 'user', target_claim_id: null, target_generation: null,
      sender_kind: 'agent', sender_trust: 'lease_owner', sender_id: input.claim_actor.receipt_sha256, in_reply_to: input.parent.message_id });
    expect(intent.effect_id).toBe(input.reply_message_id);
    expect(intent.idempotency_key).toBe(input.reply_message_id);
    expect(validateTaskReplyIntent(JSON.parse(canonicalTaskReplyIntentBytes(intent)))).toEqual(intent);
    const commit = buildTaskReplyCommit({ intent, committed_at: LATER });
    expect(validateTaskReplyCommit(JSON.parse(canonicalTaskReplyCommitBytes(commit)))).toEqual(commit);
    expect(Object.isFrozen(intent.reply)).toBe(true);
  });

  test.each([
    { sender_kind: 'agent' }, { sender_trust: 'unverified_agent' }, { sender_trust: 'lease_owner' },
    { audience: 'orchestrator' }, { audience: 'user' }, { in_reply_to: id(6) },
    { task_id: hex(9) }, { task_revision: hex(9) },
    { scope: 'claim', target_claim_id: id(6), target_generation: 1 },
    { scope: 'claim', target_claim_id: id(3), target_generation: 2 },
  ] as Partial<TaskMessageEventInput>[])('rejects an inadmissible parent %j', (changes) => {
    expect(() => buildTaskReplyIntent(fixture(changes))).toThrow(TaskReplyError);
  });

  test('allows the original user entry, but never a reply using its parent ID', () => {
    expect(buildTaskReplyIntent(fixture({ sender_kind: 'user' })).parent.sender_kind).toBe('user');
    expect(() => buildTaskReplyIntent({ ...fixture(), reply_message_id: id(1) })).toThrow('IDs must differ');
  });

  test.each([
    { delivery_state: 'delivered', acknowledged_at: null },
    { message_id: id(6) }, { recipient_task_revision: hex(9) }, { recipient_generation: 2 },
    { recipient_id: id(6), recipient_claim_id: id(6) },
    { recipient_kind: 'user', recipient_id: 'alice', recipient_claim_id: null, recipient_generation: null },
  ])('requires the actual ACK of this recipient %j', (changes) => {
    const input = fixture();
    expect(() => buildTaskReplyIntent({ ...input, acknowledgement: { ...input.acknowledgement, ...changes } as typeof input.acknowledgement })).toThrow(TaskReplyError);
  });

  test.each([
    { repository_id: 'repo_abcdef1234567890' }, { engineer_id: 'engineer:capability.runtime-harness.other' },
    { binding_id: id(6) }, { binding_generation: 2 }, { engineer_contract_revision: hash(9) },
  ])('rejects mismatched actor and mapping %j', (changes) => {
    expect(() => buildTaskReplyIntent({ ...fixture(), principal_mapping: mapping(changes) })).toThrow('fences differ');
  });

  test('rejects revoked mappings and malformed underlying records', () => {
    const input = fixture();
    expect(() => buildTaskReplyIntent({ ...input, principal_mapping: revokeEngineerPrincipalMapping(input.principal_mapping, LATER) })).toThrow(TaskReplyError);
    expect(() => buildTaskReplyIntent({ ...input, claim_actor: { ...input.claim_actor, receipt_sha256: hash(9) } })).toThrow(TaskReplyError);
    expect(() => buildTaskReplyIntent({ ...input, acknowledgement: null as never })).toThrow(TaskReplyError);
  });

  test.each([{ audience: 'owner' }, { sender_id: 'forged' }, { sender_trust: 'local_operator' },
    { in_reply_to: id(6) }, { created_at: AT }, { sender_kind: 'operator' }] as Partial<TaskMessageEventInput>[])(
    'rejects forged reply direction even with recomputed digests %j', (changes) => {
      const intent = buildTaskReplyIntent(fixture());
      const reply = buildTaskMessageEvent({ ...intent.reply, ...changes });
      expect(() => validateTaskReplyIntent(resign({ ...intent, reply }, 'intent_sha256'))).toThrow(TaskReplyError);
    });

  test('rejects unknown fields, missing fields, alternate keys and digest tampering', () => {
    const { intent, commit } = chain();
    for (const mutation of [{ ...intent, protocol: 2 }, { ...intent, extra: 1 }, { ...intent, effect_id: id(6) },
      resign({ ...intent, idempotency_key: id(6) }, 'intent_sha256'), { ...intent, intent_sha256: hash(9) }]) {
      expect(() => validateTaskReplyIntent(mutation)).toThrow(TaskReplyError);
    }
    for (const mutation of [{ ...commit, kind: 'other' }, { ...commit, extra: 1 }, { ...commit, commit_sha256: hash(9) },
      { ...commit, committed_at: 'yesterday' }, { ...commit, intent_sha256: 'bad' }, { ...commit, effect_id: 'bad' }]) {
      expect(() => validateTaskReplyCommit(mutation)).toThrow(TaskReplyError);
    }
    expect(() => validateTaskReplyIntent({})).toThrow(TaskReplyError);
    expect(() => validateTaskReplyCommit(null)).toThrow(TaskReplyError);
  });

  test('retries frozen bytes; changed content, ID or timestamp cannot create another logical result', () => {
    const input = fixture();
    const intent = buildTaskReplyIntent(input);
    expect(() => assertTaskReplyRetry(intent, JSON.parse(canonicalTaskReplyIntentBytes(intent)))).not.toThrow();
    for (const changes of [{ body: 'Different meaning' }, { reply_message_id: id(6) }, { prepared_at: AT }]) {
      expect(() => assertTaskReplyRetry(intent, buildTaskReplyIntent({ ...input, ...changes }))).toThrow('differs from the frozen intent');
    }
  });
});

describe('Task reply interrupted-chain oracle', () => {
  test.each([
    [false, false, false, 'absent'], [true, false, false, 'intent_only'],
    [true, true, false, 'event_uncommitted'], [false, true, false, 'orphan_event'],
    [true, true, true, 'complete'], [false, false, true, 'inconsistent'],
    [true, false, true, 'inconsistent'], [false, true, true, 'inconsistent'],
  ] as const)('observes presence intent=%s event=%s commit=%s without inventing a stage', (hasIntent, hasEvent, hasCommit, state) => {
    const current = chain();
    const input = { ...current, intent: hasIntent ? current.intent : null,
      event: hasEvent ? current.event : null, commit: hasCommit ? current.commit : null };
    const before = JSON.stringify(input);
    expect(inspectTaskReplyChain(input).state).toBe(state);
    expect(JSON.stringify(input)).toBe(before);
  });

  test('response loss returns the same complete chain without consulting current authority', () => {
    const input = chain();
    const original = JSON.stringify(input);
    expect(inspectTaskReplyChain(input)).toEqual({ state: 'complete' });
    expect(inspectTaskReplyChain(JSON.parse(original))).toEqual({ state: 'complete' });
    expect(JSON.stringify(input)).toBe(original);
  });

  test('observes changed parent, original ACK or event as inconsistent despite valid individual schemas', () => {
    const input = chain();
    expect(inspectTaskReplyChain({ ...input, parent: buildTaskMessageEvent({ ...input.parent, body: 'Changed guidance' }) })).toEqual({ state: 'inconsistent', reason: 'source_mismatch' });
    expect(inspectTaskReplyChain({ ...input, acknowledgement: null })).toEqual({ state: 'inconsistent', reason: 'source_mismatch' });
    expect(inspectTaskReplyChain({ ...input, acknowledgement: { ...input.acknowledgement, acknowledged_at: LATER } })).toEqual({ state: 'inconsistent', reason: 'source_mismatch' });
    expect(inspectTaskReplyChain({ ...input, event: buildTaskMessageEvent({ ...input.event, body: 'Changed answer' }) })).toEqual({ state: 'inconsistent', reason: 'event_mismatch' });
  });

  test.each(['effect_id', 'intent_sha256', 'reply_event_digest', 'acknowledgement_sha256'] as const)(
    'rejects validly hashed but unrelated commit %s', (field) => {
      const input = chain();
      const commit = resign({ ...input.commit, [field]: field === 'effect_id' ? id(6) : hash(9) }, 'commit_sha256');
      expect(inspectTaskReplyChain({ ...input, commit })).toEqual({ state: 'inconsistent', reason: 'commit_mismatch' });
    });

  test.each([
    { authorization_id: id(6) }, { binding_generation: 2 }, { binding_id: id(6) },
  ])('refuses resume after mapping rotation %j but preserves historical chain', (changes) => {
    const input = chain();
    expect(() => assertTaskReplyResumeFence(input.intent, { principal_mapping: mapping(changes), claim_actor: actor() })).toThrow('different authorization or actor fence');
    expect(inspectTaskReplyChain(input).state).toBe('complete');
  });

  test.each([
    { lease_generation: 2 }, { task_revision: hex(9) }, { claim_id: id(6) },
    { authorization_revision: 2 }, { work_envelope_sha256: hash(9) }, { session_id: 'new-session' },
  ])('refuses resume after actor fence change %j', (changes) => {
    const intent = buildTaskReplyIntent(fixture());
    expect(() => assertTaskReplyResumeFence(intent, { principal_mapping: mapping(), claim_actor: actor(changes) })).toThrow(TaskReplyError);
  });

  test('exact fence is resumable; revocation is not; neither operation executes work', () => {
    const input = fixture();
    const intent = buildTaskReplyIntent(input);
    expect(() => assertTaskReplyResumeFence(intent, input)).not.toThrow();
    expect(() => assertTaskReplyResumeFence(intent, { ...input,
      principal_mapping: revokeEngineerPrincipalMapping(input.principal_mapping, LATER) })).toThrow(TaskReplyError);
  });

  test('hook receipt remains hook delivery and never proves the separate notify effect', () => {
    const input = chain();
    expect(inspectTaskReplyChain(input).state).toBe('complete');
    expect(input.intent.acknowledgement.delivery_channel).toBe('hook_session');
    expect(input.intent.acknowledgement.delivery_ref).toBeNull();
  });
});
