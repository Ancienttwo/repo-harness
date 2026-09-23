import type { EngineeringOverlayEngineerV1, EngineeringOverlaySnapshotV1, OrganizationAttentionSnapshotV1 } from '../engineers/engineering-overlay';

export const OPERATOR_ORGANIZATION_LIMIT = 200;
const MAX_BYTES = 1024 * 1024;
type Engineer = EngineeringOverlayEngineerV1;
export interface OperatorOrganizationEngineer extends Omit<Engineer, 'binding' | 'active_claim'> {
  readonly binding: Omit<Engineer['binding'], 'value'> & {
    readonly value: Omit<NonNullable<Engineer['binding']['value']>, 'provider_thread_id' | 'host_id'> | null;
  };
  readonly active_claim: Omit<Engineer['active_claim'], 'value'> & {
    readonly value: Omit<NonNullable<Engineer['active_claim']['value']>, 'worktree_path' | 'branch' | 'unit_ref'> | null;
  };
}
export interface OperatorOrganizationSnapshot {
  readonly repository_id: string;
  readonly registry_revision: string;
  readonly observed_at: string;
  readonly source_snapshot_sha256: string;
  readonly snapshot_consistency: EngineeringOverlaySnapshotV1['snapshot_consistency'];
  readonly components: EngineeringOverlaySnapshotV1['components'];
  readonly engineers: readonly OperatorOrganizationEngineer[];
  readonly attention: OrganizationAttentionSnapshotV1;
}

function invalid(): never { throw new Error('operator_organization_payload_invalid'); }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value || (pattern && !pattern.test(value))) invalid();
  return value;
}
function one<T extends string>(value: unknown, values: readonly T[]): T {
  if (!values.includes(value as T)) invalid();
  return value as T;
}
function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
  return value as number;
}
const digest = (value: unknown) => text(value, /^sha256:[0-9a-f]{64}$/u);
const taskId = (value: unknown) => text(value, /^[0-9a-f]{64}$/u);
const uuid = (value: unknown) => text(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
const engineerId = (value: unknown) => text(value, /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u);
function instant(value: unknown): string { const result = text(value); if (!Number.isFinite(Date.parse(result))) invalid(); return result; }
function array(value: unknown, limit: number): readonly unknown[] { if (!Array.isArray(value) || value.length > limit) invalid(); return value; }
function nullableDigest(value: unknown): string | null { return value === null ? null : digest(value); }
function unsupported(value: unknown): Engineer['memory'] {
  const v = record(value, ['support', 'value']);
  if (v.support !== 'unsupported' || v.value !== null) invalid();
  return { support: 'unsupported', value: null };
}
function engineer(value: unknown): OperatorOrganizationEngineer {
  const v = record(value, ['engineer_id', 'capability_id', 'engineer_contract_revision', 'binding', 'active_claim', 'delegations', 'messages', 'runtime_effects', 'memory']);
  const b = record(v.binding, ['support', 'state', 'value', 'revision']);
  const bindingSupport = one(b.support, ['available', 'unreadable']);
  const bindingState = b.state === null ? null : one(b.state, ['unbound', 'active', 'retired']);
  let bindingValue: OperatorOrganizationEngineer['binding']['value'] = null;
  if (b.value !== null) {
    const bv = record(b.value, ['binding_id', 'binding_generation', 'engineer_contract_revision', 'provider', 'observation']);
    bindingValue = { binding_id: uuid(bv.binding_id), binding_generation: count(bv.binding_generation), engineer_contract_revision: digest(bv.engineer_contract_revision), provider: text(bv.provider), observation: one(bv.observation, ['unknown', 'reachable', 'unreachable']) };
    if (bindingValue.binding_generation === 0) invalid();
  }
  const bindingRevision = nullableDigest(b.revision);
  if (bindingSupport === 'unreadable' ? bindingState !== null || bindingValue !== null || bindingRevision !== null : bindingState === null || bindingRevision === null || ((bindingState === 'unbound') !== (bindingValue === null))) invalid();
  const c = record(v.active_claim, ['support', 'value', 'revision']);
  const claimSupport = one(c.support, ['available', 'unreadable']);
  let claimValue: OperatorOrganizationEngineer['active_claim']['value'] = null;
  if (c.value !== null) {
    const cv = record(c.value, ['task_id', 'task_revision', 'claim_id', 'lease_generation', 'work_envelope_sha256', 'receipt_sha256']);
    claimValue = { task_id: taskId(cv.task_id), task_revision: digest(cv.task_revision), claim_id: uuid(cv.claim_id), lease_generation: count(cv.lease_generation), work_envelope_sha256: digest(cv.work_envelope_sha256), receipt_sha256: digest(cv.receipt_sha256) };
    if (claimValue.lease_generation === 0) invalid();
  }
  const claimRevision = nullableDigest(c.revision);
  if (claimSupport === 'unreadable' ? claimValue !== null || claimRevision !== null : claimRevision === null) invalid();
  const m = record(v.messages, ['support', 'pending', 'delivery_failed', 'revision']);
  const messageSupport = one(m.support, ['available', 'unreadable']);
  if (messageSupport === 'unreadable' && (m.pending !== null || m.delivery_failed !== null || m.revision !== null)) invalid();
  const messages = messageSupport === 'unreadable' ? { support: messageSupport, pending: null, delivery_failed: null, revision: null } : { support: messageSupport, pending: count(m.pending), delivery_failed: count(m.delivery_failed), revision: digest(m.revision) };
  const r = record(v.runtime_effects, ['support', 'active', 'reconciliation_required', 'failed', 'wake', 'revision']);
  const runtimeSupport = one(r.support, ['available', 'unreadable']);
  let runtime: Engineer['runtime_effects'];
  if (runtimeSupport === 'unreadable') {
    if ([r.active, r.reconciliation_required, r.failed, r.wake, r.revision].some(item => item !== null)) invalid();
    runtime = { support: 'unreadable', active: null, reconciliation_required: null, failed: null, wake: null, revision: null };
  } else {
    const w = record(r.wake, ['pending', 'delivered', 'failed', 'reconciliation_required']);
    runtime = { support: 'available', active: count(r.active), reconciliation_required: count(r.reconciliation_required), failed: count(r.failed), wake: { pending: count(w.pending), delivered: count(w.delivered), failed: count(w.failed), reconciliation_required: count(w.reconciliation_required) }, revision: digest(r.revision) };
  }
  return { engineer_id: engineerId(v.engineer_id), capability_id: text(v.capability_id, /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u), engineer_contract_revision: digest(v.engineer_contract_revision), binding: { support: bindingSupport, state: bindingState, value: bindingValue, revision: bindingRevision }, active_claim: { support: claimSupport, value: claimValue, revision: claimRevision }, delegations: unsupported(v.delegations), memory: unsupported(v.memory), messages, runtime_effects: runtime };
}

/** Browser-safe shape validation; source digests identify records, not browser authorization. */
export function decodeOperatorOrganizationSnapshot(value: unknown, repositoryId: string): OperatorOrganizationSnapshot {
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_BYTES) invalid();
  const v = record(value, ['repository_id', 'registry_revision', 'observed_at', 'source_snapshot_sha256', 'snapshot_consistency', 'components', 'engineers', 'attention']);
  if (v.repository_id !== repositoryId) invalid();
  text(v.repository_id, /^repo_[0-9a-f]{16}$/u);
  const engineers = array(v.engineers, OPERATOR_ORGANIZATION_LIMIT).map(engineer);
  if (new Set(engineers.map(item => item.engineer_id)).size !== engineers.length) invalid();
  const componentNames = ['profiles', 'bindings', 'claims', 'messages', 'runtime_effects'] as const;
  const components = array(v.components, 5).map(item => {
    const c = record(item, ['component', 'support', 'observation_before', 'observation_after']);
    const support = one(c.support, ['available', 'unreadable']);
    const before = nullableDigest(c.observation_before), after = nullableDigest(c.observation_after);
    if (support === 'available' ? before === null || after === null : before !== null || after !== null) invalid();
    return { component: one(c.component, componentNames), support, observation_before: before, observation_after: after };
  });
  if (new Set(components.map(c => c.component)).size !== 5) invalid();
  const consistency = one(v.snapshot_consistency, ['stable', 'changed_during_read', 'degraded']);
  const expectedConsistency = components.some(c => c.support === 'unreadable') ? 'degraded' : components.some(c => c.observation_before !== c.observation_after) ? 'changed_during_read' : 'stable';
  if (consistency !== expectedConsistency) invalid();
  if (components.find(c => c.component === 'profiles')!.support === 'unreadable' && (engineers.length !== 0 || components.some(c => c.support !== 'unreadable'))) invalid();
  const a = record(v.attention, ['protocol', 'kind', 'repository_id', 'overlay_snapshot_sha256', 'observed_at', 'attention', 'snapshot_consistency', 'snapshot_sha256']);
  if (a.protocol !== 1 || a.kind !== 'repo-harness-organization-attention-snapshot' || a.repository_id !== repositoryId || a.overlay_snapshot_sha256 !== v.source_snapshot_sha256 || a.observed_at !== v.observed_at || a.snapshot_consistency !== consistency) invalid();
  const reasons = ['binding_missing', 'binding_stale', 'engineer_contract_revision_changed', 'message_delivery_failed', 'runtime_reconciliation_required'] as const;
  const attention = array(a.attention, OPERATOR_ORGANIZATION_LIMIT * reasons.length).map(item => {
    const row = record(item, ['engineer_id', 'reason', 'owner', 'source_revision']);
    const id = engineerId(row.engineer_id);
    if (!engineers.some(e => e.engineer_id === id)) invalid();
    return { engineer_id: id, reason: one(row.reason, reasons), owner: one(row.owner, ['maintainer', 'module_engineer', 'runtime_operator']), source_revision: digest(row.source_revision) };
  });
  if (new Set(attention.map(row => `${row.engineer_id}:${row.reason}`)).size !== attention.length) invalid();
  return { repository_id: repositoryId, registry_revision: digest(v.registry_revision), observed_at: instant(v.observed_at), source_snapshot_sha256: digest(v.source_snapshot_sha256), snapshot_consistency: consistency, components, engineers, attention: { protocol: 1, kind: 'repo-harness-organization-attention-snapshot', repository_id: repositoryId, overlay_snapshot_sha256: digest(a.overlay_snapshot_sha256), observed_at: instant(a.observed_at), snapshot_consistency: consistency, snapshot_sha256: digest(a.snapshot_sha256), attention } };
}

/** Redact a validated upstream pair without reclassifying counts, state or responsibility. */
export function projectOperatorOrganizationSnapshot(overlay: EngineeringOverlaySnapshotV1, attention: OrganizationAttentionSnapshotV1): OperatorOrganizationSnapshot {
  if (overlay.engineers.length > OPERATOR_ORGANIZATION_LIMIT) invalid();
  const engineers = overlay.engineers.map(e => ({
    engineer_id: e.engineer_id, capability_id: e.capability_id, engineer_contract_revision: e.engineer_contract_revision,
    binding: { support: e.binding.support, state: e.binding.state, revision: e.binding.revision, value: e.binding.value && { binding_id: e.binding.value.binding_id, binding_generation: e.binding.value.binding_generation, engineer_contract_revision: e.binding.value.engineer_contract_revision, provider: e.binding.value.provider, observation: e.binding.value.observation } },
    active_claim: { support: e.active_claim.support, revision: e.active_claim.revision, value: e.active_claim.value && { task_id: e.active_claim.value.task_id, task_revision: e.active_claim.value.task_revision, claim_id: e.active_claim.value.claim_id, lease_generation: e.active_claim.value.lease_generation, work_envelope_sha256: e.active_claim.value.work_envelope_sha256, receipt_sha256: e.active_claim.value.receipt_sha256 } },
    delegations: e.delegations, messages: e.messages, runtime_effects: e.runtime_effects, memory: e.memory,
  }));
  return decodeOperatorOrganizationSnapshot({ repository_id: overlay.repository_id, registry_revision: overlay.registry_revision, observed_at: overlay.observed_at, source_snapshot_sha256: overlay.snapshot_sha256, snapshot_consistency: overlay.snapshot_consistency, components: overlay.components, engineers, attention }, overlay.repository_id);
}
