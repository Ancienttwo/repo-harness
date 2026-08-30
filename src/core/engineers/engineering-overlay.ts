import { canonicalEngineerJson, engineerSha256 } from './profile-binding';

export const ENGINEERING_OVERLAY_PROTOCOL = 1 as const;
export const ENGINEERING_OVERLAY_KIND = 'repo-harness-engineering-overlay-snapshot' as const;
export const ORGANIZATION_ATTENTION_KIND = 'repo-harness-organization-attention-snapshot' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const REPOSITORY_ID = /^repo_[0-9a-f]{16}$/u;
const ENGINEER_ID = /^engineer:capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const CAPABILITY_ID = /^capability\.[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TASK_ID = /^[0-9a-f]{64}$/u;

export type OverlaySupport = 'unsupported' | 'available' | 'unreadable';
export type OverlayConsistency = 'stable' | 'changed_during_read' | 'degraded';
export type OverlayBindingState = 'unbound' | 'active' | 'retired' | null;
export type OverlayProviderObservation = 'unknown' | 'reachable' | 'unreachable';
export type OverlayComponentName = 'profiles' | 'bindings' | 'claims' | 'messages' | 'runtime_effects';
const COMPONENT_ORDER: readonly OverlayComponentName[] = ['profiles', 'bindings', 'claims', 'messages', 'runtime_effects'];

export interface OverlayBindingValueV1 {
  readonly binding_id: string;
  readonly binding_generation: number;
  readonly engineer_contract_revision: string;
  readonly provider: string;
  readonly provider_thread_id: string;
  readonly host_id: string;
  readonly observation: OverlayProviderObservation;
}

export interface OverlayBindingProjectionV1 {
  readonly support: 'available' | 'unreadable';
  readonly state: OverlayBindingState;
  readonly value: OverlayBindingValueV1 | null;
  readonly revision: string | null;
}

export interface OverlayActiveClaimValueV1 {
  readonly task_id: string;
  readonly task_revision: string;
  readonly claim_id: string;
  readonly lease_generation: number;
  readonly work_envelope_sha256: string;
  readonly worktree_path: string;
  readonly branch: string;
  readonly unit_ref: string;
  readonly receipt_sha256: string;
}

export interface OverlayActiveClaimProjectionV1 {
  readonly support: 'available' | 'unreadable';
  readonly value: OverlayActiveClaimValueV1 | null;
  readonly revision: string | null;
}

export interface OverlayMessageProjectionV1 {
  readonly support: 'available' | 'unreadable';
  readonly pending: number | null;
  readonly delivery_failed: number | null;
  readonly revision: string | null;
}

export interface OverlayRuntimeEffectProjectionV1 {
  readonly support: 'available' | 'unreadable';
  readonly active: number | null;
  readonly reconciliation_required: number | null;
  readonly failed: number | null;
  readonly revision: string | null;
}

export interface OverlayUnsupportedProjectionV1 {
  readonly support: 'unsupported';
  readonly value: null;
}

export interface EngineeringOverlayEngineerV1 {
  readonly engineer_id: string;
  readonly capability_id: string;
  readonly engineer_contract_revision: string;
  readonly binding: OverlayBindingProjectionV1;
  readonly active_claim: OverlayActiveClaimProjectionV1;
  readonly delegations: OverlayUnsupportedProjectionV1;
  readonly messages: OverlayMessageProjectionV1;
  readonly runtime_effects: OverlayRuntimeEffectProjectionV1;
  readonly memory: OverlayUnsupportedProjectionV1;
}

export interface OverlayComponentObservationV1 {
  readonly component: OverlayComponentName;
  readonly support: 'available' | 'unreadable';
  readonly observation_before: string | null;
  readonly observation_after: string | null;
}

export interface EngineeringOverlaySnapshotV1 {
  readonly protocol: typeof ENGINEERING_OVERLAY_PROTOCOL;
  readonly kind: typeof ENGINEERING_OVERLAY_KIND;
  readonly repository_id: string;
  readonly registry_revision: string;
  readonly observed_at: string;
  readonly engineers: readonly EngineeringOverlayEngineerV1[];
  readonly components: readonly OverlayComponentObservationV1[];
  readonly snapshot_consistency: OverlayConsistency;
  readonly snapshot_sha256: string;
}

export type OrganizationAttentionReason =
  | 'binding_missing'
  | 'binding_stale'
  | 'engineer_contract_revision_changed'
  | 'message_delivery_failed'
  | 'runtime_reconciliation_required';

export interface OrganizationAttentionItemV1 {
  readonly engineer_id: string;
  readonly reason: OrganizationAttentionReason;
  readonly owner: 'maintainer' | 'module_engineer' | 'runtime_operator';
  readonly source_revision: string;
}

export interface OrganizationAttentionSnapshotV1 {
  readonly protocol: typeof ENGINEERING_OVERLAY_PROTOCOL;
  readonly kind: typeof ORGANIZATION_ATTENTION_KIND;
  readonly repository_id: string;
  readonly overlay_snapshot_sha256: string;
  readonly observed_at: string;
  readonly attention: readonly OrganizationAttentionItemV1[];
  readonly snapshot_consistency: OverlayConsistency;
  readonly snapshot_sha256: string;
}

export type EngineeringOverlayErrorCode = 'engineering_overlay_invalid';

export class EngineeringOverlayError extends Error {
  constructor(readonly code: EngineeringOverlayErrorCode, message: string) {
    super(message);
    this.name = 'EngineeringOverlayError';
  }
}

type RecordValue = Record<string, unknown>;

function invalid(message: string): never {
  throw new EngineeringOverlayError('engineering_overlay_invalid', message);
}

function record(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object`);
  return value as RecordValue;
}

function exact(value: RecordValue, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) invalid(`${label} fields are invalid`);
}

function string(value: unknown, field: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > 1024
    || (pattern && !pattern.test(value))) invalid(`${field} is invalid`);
  return value;
}

function nullableDigest(value: unknown, field: string): string | null {
  return value === null ? null : string(value, field, DIGEST);
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid(`${field} is invalid`);
  return value as number;
}

function timestamp(value: unknown, field: string): string {
  const result = string(value, field);
  if (!Number.isFinite(Date.parse(result))) invalid(`${field} is invalid`);
  return result;
}

function validateBinding(value: unknown): OverlayBindingProjectionV1 {
  const input = record(value, 'binding');
  exact(input, ['support', 'state', 'value', 'revision'], 'binding');
  if (input.support === 'unreadable') {
    if (input.state !== null || input.value !== null || input.revision !== null) invalid('unreadable binding must not expose state/value/revision');
    return Object.freeze({ support: 'unreadable', state: null, value: null, revision: null });
  }
  if (input.support !== 'available') invalid('binding support is invalid');
  const revision = string(input.revision, 'binding.revision', DIGEST);
  if (input.state === 'unbound') {
    if (input.value !== null) invalid('unbound binding must have null value');
    return Object.freeze({ support: 'available', state: 'unbound', value: null, revision });
  }
  if (input.state !== 'active' && input.state !== 'retired') invalid('binding state is invalid');
  const item = record(input.value, 'binding.value');
  exact(item, ['binding_id', 'binding_generation', 'engineer_contract_revision', 'provider', 'provider_thread_id', 'host_id', 'observation'], 'binding.value');
  if (item.observation !== 'unknown' && item.observation !== 'reachable' && item.observation !== 'unreachable') invalid('binding observation is invalid');
  return Object.freeze({
    support: 'available',
    state: input.state,
    value: Object.freeze({
      binding_id: string(item.binding_id, 'binding_id', UUID),
      binding_generation: integer(item.binding_generation, 'binding_generation', 1),
      engineer_contract_revision: string(item.engineer_contract_revision, 'binding engineer_contract_revision', DIGEST),
      provider: string(item.provider, 'provider'),
      provider_thread_id: string(item.provider_thread_id, 'provider_thread_id'),
      host_id: string(item.host_id, 'host_id'),
      observation: item.observation,
    }),
    revision,
  });
}

function validateClaim(value: unknown): OverlayActiveClaimProjectionV1 {
  const input = record(value, 'active_claim');
  exact(input, ['support', 'value', 'revision'], 'active_claim');
  if (input.support === 'unreadable') {
    if (input.value !== null || input.revision !== null) invalid('unreadable active_claim must not expose value/revision');
    return Object.freeze({ support: 'unreadable', value: null, revision: null });
  }
  if (input.support !== 'available') invalid('active_claim support is invalid');
  const revision = string(input.revision, 'active_claim.revision', DIGEST);
  if (input.value === null) return Object.freeze({ support: 'available', value: null, revision });
  const item = record(input.value, 'active_claim.value');
  exact(item, ['task_id', 'task_revision', 'claim_id', 'lease_generation', 'work_envelope_sha256', 'worktree_path', 'branch', 'unit_ref', 'receipt_sha256'], 'active_claim.value');
  return Object.freeze({ support: 'available', value: Object.freeze({
    task_id: string(item.task_id, 'task_id', TASK_ID),
    task_revision: string(item.task_revision, 'task_revision', DIGEST),
    claim_id: string(item.claim_id, 'claim_id', UUID),
    lease_generation: integer(item.lease_generation, 'lease_generation', 1),
    work_envelope_sha256: string(item.work_envelope_sha256, 'work_envelope_sha256', DIGEST),
    worktree_path: string(item.worktree_path, 'worktree_path'),
    branch: string(item.branch, 'branch'),
    unit_ref: string(item.unit_ref, 'unit_ref'),
    receipt_sha256: string(item.receipt_sha256, 'receipt_sha256', DIGEST),
  }), revision });
}

function validateMessages(value: unknown): OverlayMessageProjectionV1 {
  const input = record(value, 'messages');
  exact(input, ['support', 'pending', 'delivery_failed', 'revision'], 'messages');
  if (input.support === 'unreadable') {
    if (input.pending !== null || input.delivery_failed !== null || input.revision !== null) invalid('unreadable messages must not expose values');
    return Object.freeze({ support: 'unreadable', pending: null, delivery_failed: null, revision: null });
  }
  if (input.support !== 'available') invalid('messages support is invalid');
  return Object.freeze({ support: 'available', pending: integer(input.pending, 'messages.pending'), delivery_failed: integer(input.delivery_failed, 'messages.delivery_failed'), revision: string(input.revision, 'messages.revision', DIGEST) });
}

function validateRuntimeEffects(value: unknown): OverlayRuntimeEffectProjectionV1 {
  const input = record(value, 'runtime_effects');
  exact(input, ['support', 'active', 'reconciliation_required', 'failed', 'revision'], 'runtime_effects');
  if (input.support === 'unreadable') {
    if (input.active !== null || input.reconciliation_required !== null || input.failed !== null || input.revision !== null) invalid('unreadable runtime_effects must not expose values');
    return Object.freeze({ support: 'unreadable', active: null, reconciliation_required: null, failed: null, revision: null });
  }
  if (input.support !== 'available') invalid('runtime_effects support is invalid');
  return Object.freeze({ support: 'available', active: integer(input.active, 'runtime_effects.active'), reconciliation_required: integer(input.reconciliation_required, 'runtime_effects.reconciliation_required'), failed: integer(input.failed, 'runtime_effects.failed'), revision: string(input.revision, 'runtime_effects.revision', DIGEST) });
}

function validateUnsupported(value: unknown, field: string): OverlayUnsupportedProjectionV1 {
  const input = record(value, field);
  exact(input, ['support', 'value'], field);
  if (input.support !== 'unsupported' || input.value !== null) invalid(`${field} must be unsupported`);
  return Object.freeze({ support: 'unsupported', value: null });
}

function validateEngineer(value: unknown): EngineeringOverlayEngineerV1 {
  const input = record(value, 'engineer');
  exact(input, ['engineer_id', 'capability_id', 'engineer_contract_revision', 'binding', 'active_claim', 'delegations', 'messages', 'runtime_effects', 'memory'], 'engineer');
  const engineerId = string(input.engineer_id, 'engineer_id', ENGINEER_ID);
  const capabilityId = string(input.capability_id, 'capability_id', CAPABILITY_ID);
  if (engineerId !== `engineer:${capabilityId}`) invalid('engineer_id does not match capability_id');
  return Object.freeze({
    engineer_id: engineerId,
    capability_id: capabilityId,
    engineer_contract_revision: string(input.engineer_contract_revision, 'engineer_contract_revision', DIGEST),
    binding: validateBinding(input.binding),
    active_claim: validateClaim(input.active_claim),
    delegations: validateUnsupported(input.delegations, 'delegations'),
    messages: validateMessages(input.messages),
    runtime_effects: validateRuntimeEffects(input.runtime_effects),
    memory: validateUnsupported(input.memory, 'memory'),
  });
}

function validateComponents(value: unknown): readonly OverlayComponentObservationV1[] {
  if (!Array.isArray(value) || value.length !== 5) invalid('components are invalid');
  const seen = new Set<string>();
  const components = value.map((candidate, index) => {
    const input = record(candidate, 'component');
    exact(input, ['component', 'support', 'observation_before', 'observation_after'], 'component');
    if (!['profiles', 'bindings', 'claims', 'messages', 'runtime_effects'].includes(String(input.component)) || seen.has(String(input.component))) invalid('component name is invalid or duplicated');
    if (input.component !== COMPONENT_ORDER[index]) invalid('components are not in canonical order');
    seen.add(String(input.component));
    if (input.support !== 'available' && input.support !== 'unreadable') invalid('component support is invalid');
    const before = nullableDigest(input.observation_before, 'component.observation_before');
    const after = nullableDigest(input.observation_after, 'component.observation_after');
    if (input.support === 'available' ? before === null || after === null : before !== null || after !== null) invalid('component support/digest combination is invalid');
    return Object.freeze({ component: input.component as OverlayComponentName, support: input.support, observation_before: before, observation_after: after });
  });
  return Object.freeze(components);
}

function overlayBasis(value: Omit<EngineeringOverlaySnapshotV1, 'snapshot_sha256'>): object { return value; }

export function buildEngineeringOverlaySnapshot(input: Omit<EngineeringOverlaySnapshotV1, 'protocol' | 'kind' | 'snapshot_sha256'>): EngineeringOverlaySnapshotV1 {
  const basis = { protocol: ENGINEERING_OVERLAY_PROTOCOL, kind: ENGINEERING_OVERLAY_KIND, ...input } as const;
  return validateEngineeringOverlaySnapshot({ ...basis, snapshot_sha256: engineerSha256(canonicalEngineerJson(overlayBasis(basis))) });
}

export function validateEngineeringOverlaySnapshot(value: unknown): EngineeringOverlaySnapshotV1 {
  const input = record(value, 'engineering overlay');
  exact(input, ['protocol', 'kind', 'repository_id', 'registry_revision', 'observed_at', 'engineers', 'components', 'snapshot_consistency', 'snapshot_sha256'], 'engineering overlay');
  if (input.protocol !== ENGINEERING_OVERLAY_PROTOCOL || input.kind !== ENGINEERING_OVERLAY_KIND) invalid('engineering overlay protocol/kind is invalid');
  if (!Array.isArray(input.engineers)) invalid('engineers must be an array');
  const engineers = input.engineers.map(validateEngineer).sort((left, right) => left.engineer_id.localeCompare(right.engineer_id));
  if (engineers.some((item, index) => index > 0 && item.engineer_id === engineers[index - 1].engineer_id)) invalid('engineer_id is duplicated');
  const components = validateComponents(input.components);
  const componentByName = new Map(components.map((component) => [component.component, component]));
  const profiles = componentByName.get('profiles')!;
  if (profiles.support === 'unreadable') {
    if (engineers.length !== 0 || components.some((component) => component.support !== 'unreadable')) {
      invalid('unreadable profiles require an empty fully degraded projection');
    }
  } else {
    const observedSupports: Readonly<Record<Exclude<OverlayComponentName, 'profiles'>, readonly ('available' | 'unreadable')[]>> = {
      bindings: engineers.map((engineer) => engineer.binding.support),
      claims: engineers.map((engineer) => engineer.active_claim.support),
      messages: engineers.map((engineer) => engineer.messages.support),
      runtime_effects: engineers.map((engineer) => engineer.runtime_effects.support),
    };
    for (const component of ['bindings', 'claims', 'messages', 'runtime_effects'] as const) {
      const expected = observedSupports[component].some((support) => support === 'unreadable') ? 'unreadable' : 'available';
      if (componentByName.get(component)!.support !== expected) invalid(`${component} component support does not match Engineer observations`);
    }
  }
  const derivedConsistency: OverlayConsistency = components.some((component) => component.support === 'unreadable')
    ? 'degraded'
    : components.some((component) => component.observation_before !== component.observation_after)
      ? 'changed_during_read'
      : 'stable';
  if (input.snapshot_consistency !== derivedConsistency) invalid('snapshot_consistency does not match component observations');
  const basis = {
    protocol: ENGINEERING_OVERLAY_PROTOCOL,
    kind: ENGINEERING_OVERLAY_KIND,
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID),
    registry_revision: string(input.registry_revision, 'registry_revision', DIGEST),
    observed_at: timestamp(input.observed_at, 'observed_at'),
    engineers: Object.freeze(engineers),
    components,
    snapshot_consistency: derivedConsistency,
  } as const;
  const digest = string(input.snapshot_sha256, 'snapshot_sha256', DIGEST);
  if (digest !== engineerSha256(canonicalEngineerJson(overlayBasis(basis)))) invalid('snapshot_sha256 is invalid');
  return Object.freeze({ ...basis, snapshot_sha256: digest });
}

export function canonicalEngineeringOverlaySnapshotBytes(value: EngineeringOverlaySnapshotV1): string {
  return canonicalEngineerJson(validateEngineeringOverlaySnapshot(value));
}

function attentionBasis(value: Omit<OrganizationAttentionSnapshotV1, 'snapshot_sha256'>): object { return value; }

export function projectOrganizationAttention(overlayInput: EngineeringOverlaySnapshotV1): OrganizationAttentionSnapshotV1 {
  const overlay = validateEngineeringOverlaySnapshot(overlayInput);
  const attention: OrganizationAttentionItemV1[] = [];
  for (const engineer of overlay.engineers) {
    if (engineer.binding.support === 'available') {
      if (engineer.binding.state === 'unbound') attention.push({ engineer_id: engineer.engineer_id, reason: 'binding_missing', owner: 'maintainer', source_revision: engineer.binding.revision! });
      if (engineer.binding.state === 'retired') attention.push({ engineer_id: engineer.engineer_id, reason: 'binding_stale', owner: 'maintainer', source_revision: engineer.binding.revision! });
      if (engineer.binding.value && engineer.binding.value.engineer_contract_revision !== engineer.engineer_contract_revision) attention.push({ engineer_id: engineer.engineer_id, reason: 'engineer_contract_revision_changed', owner: 'maintainer', source_revision: engineer.binding.revision! });
    }
    if (engineer.messages.support === 'available' && engineer.messages.delivery_failed !== null && engineer.messages.delivery_failed > 0) attention.push({ engineer_id: engineer.engineer_id, reason: 'message_delivery_failed', owner: 'module_engineer', source_revision: engineer.messages.revision! });
    if (engineer.runtime_effects.support === 'available' && engineer.runtime_effects.reconciliation_required !== null && engineer.runtime_effects.reconciliation_required > 0) attention.push({ engineer_id: engineer.engineer_id, reason: 'runtime_reconciliation_required', owner: 'runtime_operator', source_revision: engineer.runtime_effects.revision! });
  }
  attention.sort((left, right) => left.engineer_id.localeCompare(right.engineer_id) || left.reason.localeCompare(right.reason));
  const basis = {
    protocol: ENGINEERING_OVERLAY_PROTOCOL,
    kind: ORGANIZATION_ATTENTION_KIND,
    repository_id: overlay.repository_id,
    overlay_snapshot_sha256: overlay.snapshot_sha256,
    observed_at: overlay.observed_at,
    attention: Object.freeze(attention),
    snapshot_consistency: overlay.snapshot_consistency,
  } as const;
  return validateOrganizationAttentionSnapshot({ ...basis, snapshot_sha256: engineerSha256(canonicalEngineerJson(attentionBasis(basis))) });
}

export function validateOrganizationAttentionSnapshot(value: unknown): OrganizationAttentionSnapshotV1 {
  const input = record(value, 'organization attention');
  exact(input, ['protocol', 'kind', 'repository_id', 'overlay_snapshot_sha256', 'observed_at', 'attention', 'snapshot_consistency', 'snapshot_sha256'], 'organization attention');
  if (input.protocol !== ENGINEERING_OVERLAY_PROTOCOL || input.kind !== ORGANIZATION_ATTENTION_KIND || !Array.isArray(input.attention)) invalid('organization attention protocol/kind/attention is invalid');
  const seen = new Set<string>();
  const owners: Readonly<Record<OrganizationAttentionReason, OrganizationAttentionItemV1['owner']>> = {
    binding_missing: 'maintainer',
    binding_stale: 'maintainer',
    engineer_contract_revision_changed: 'maintainer',
    message_delivery_failed: 'module_engineer',
    runtime_reconciliation_required: 'runtime_operator',
  };
  const attention = input.attention.map((candidate) => {
    const item = record(candidate, 'attention item');
    exact(item, ['engineer_id', 'reason', 'owner', 'source_revision'], 'attention item');
    if (!['binding_missing', 'binding_stale', 'engineer_contract_revision_changed', 'message_delivery_failed', 'runtime_reconciliation_required'].includes(String(item.reason))) invalid('attention reason is invalid');
    const reason = item.reason as OrganizationAttentionReason;
    if (item.owner !== owners[reason]) invalid('attention owner does not match reason');
    const engineerId = string(item.engineer_id, 'engineer_id', ENGINEER_ID);
    const key = `${engineerId}\0${reason}`;
    if (seen.has(key)) invalid('attention item is duplicated');
    seen.add(key);
    return Object.freeze({ engineer_id: engineerId, reason, owner: owners[reason], source_revision: string(item.source_revision, 'source_revision', DIGEST) });
  }).sort((left, right) => left.engineer_id.localeCompare(right.engineer_id) || left.reason.localeCompare(right.reason));
  if (input.snapshot_consistency !== 'stable' && input.snapshot_consistency !== 'changed_during_read' && input.snapshot_consistency !== 'degraded') invalid('snapshot_consistency is invalid');
  const basis = {
    protocol: ENGINEERING_OVERLAY_PROTOCOL,
    kind: ORGANIZATION_ATTENTION_KIND,
    repository_id: string(input.repository_id, 'repository_id', REPOSITORY_ID),
    overlay_snapshot_sha256: string(input.overlay_snapshot_sha256, 'overlay_snapshot_sha256', DIGEST),
    observed_at: timestamp(input.observed_at, 'observed_at'),
    attention: Object.freeze(attention),
    snapshot_consistency: input.snapshot_consistency,
  } as const;
  const digest = string(input.snapshot_sha256, 'snapshot_sha256', DIGEST);
  if (digest !== engineerSha256(canonicalEngineerJson(attentionBasis(basis)))) invalid('organization attention snapshot_sha256 is invalid');
  return Object.freeze({ ...basis, snapshot_sha256: digest });
}

export function canonicalOrganizationAttentionSnapshotBytes(value: OrganizationAttentionSnapshotV1): string {
  return canonicalEngineerJson(validateOrganizationAttentionSnapshot(value));
}
