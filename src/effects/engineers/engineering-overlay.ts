import {
  buildEngineeringOverlaySnapshot,
  projectOrganizationAttention,
  type EngineeringOverlayEngineerV1,
  type EngineeringOverlaySnapshotV1,
  type OrganizationAttentionSnapshotV1,
  type OverlayActiveClaimProjectionV1,
  type OverlayBindingProjectionV1,
  type OverlayComponentName,
  type OverlayComponentObservationV1,
  type OverlayMessageProjectionV1,
  type OverlayRuntimeEffectProjectionV1,
} from '../../core/engineers/engineering-overlay';
import { canonicalEngineerJson, engineerSha256 } from '../../core/engineers/profile-binding';
import type { ClaimActorReceiptV1 } from '../../core/engineers/principal-claim';
import type { AgentRuntimeEffectStatus } from './agent-runtime-effect-store';
import {
  readRepoHarnessRegistryStrictSnapshot,
} from '../repo-registry';
import { readEngineerBindingStatus, type EngineerBindingStatus } from './binding-store';
import { listLiveClaimActorReceiptsForEngineer } from './claim-actor-store';
import { observeModuleInboxSummary, type ModuleInboxObservationSummary } from './module-inbox';
import { listEngineerProfiles, type ResolvedEngineerProfile } from './profile-store';
import { observeAgentRuntimeEffects } from './agent-runtime-effect-store';
import { resolveRegisteredRepoForWorktree } from './scheduling';

export type EngineeringOverlayProjectionErrorCode =
  | 'engineering_overlay_repository_unregistered'
  | 'engineering_overlay_unreadable';

export class EngineeringOverlayProjectionError extends Error {
  constructor(readonly code: EngineeringOverlayProjectionErrorCode, message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'EngineeringOverlayProjectionError';
  }
}

export interface EngineeringOverlayDependencies {
  readonly readRegistry: typeof readRepoHarnessRegistryStrictSnapshot;
  readonly listProfiles: typeof listEngineerProfiles;
  readonly readBinding: typeof readEngineerBindingStatus;
  readonly listClaims: typeof listLiveClaimActorReceiptsForEngineer;
  readonly readMessages: typeof observeModuleInboxSummary;
  readonly listRuntimeEffects: typeof observeAgentRuntimeEffects;
}

export interface CollectEngineeringOverlayOptions {
  readonly repo_root: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly observed_at?: string;
  readonly dependencies?: Partial<EngineeringOverlayDependencies>;
  readonly between_reads?: () => void;
}

export interface EngineeringBoardReadV1 {
  readonly overlay: EngineeringOverlaySnapshotV1;
  readonly organization_attention: OrganizationAttentionSnapshotV1;
}

interface ComponentRead<T> {
  readonly support: 'available' | 'unreadable';
  readonly value: T | null;
  readonly revision: string | null;
}

interface EngineerRead {
  readonly profile: ResolvedEngineerProfile;
  readonly binding: ComponentRead<OverlayBindingProjectionV1>;
  readonly claim: ComponentRead<OverlayActiveClaimProjectionV1>;
  readonly messages: ComponentRead<OverlayMessageProjectionV1>;
  readonly runtime_effects: ComponentRead<OverlayRuntimeEffectProjectionV1>;
}

interface ReadPass {
  readonly profiles: ComponentRead<readonly ResolvedEngineerProfile[]>;
  readonly engineers: readonly EngineerRead[];
  readonly revisions: Readonly<Record<OverlayComponentName, string | null>>;
  readonly support: Readonly<Record<OverlayComponentName, 'available' | 'unreadable'>>;
}

function dependencies(overrides: Partial<EngineeringOverlayDependencies> = {}): EngineeringOverlayDependencies {
  return {
    readRegistry: readRepoHarnessRegistryStrictSnapshot,
    listProfiles: listEngineerProfiles,
    readBinding: readEngineerBindingStatus,
    listClaims: listLiveClaimActorReceiptsForEngineer,
    readMessages: observeModuleInboxSummary,
    listRuntimeEffects: observeAgentRuntimeEffects,
    ...overrides,
  };
}

function digest(value: unknown): string {
  return engineerSha256(canonicalEngineerJson(value));
}

function unreadable<T>(): ComponentRead<T> {
  return Object.freeze({ support: 'unreadable', value: null, revision: null });
}

function available<T>(value: T, revision: string): ComponentRead<T> {
  return Object.freeze({ support: 'available', value, revision });
}

function observe<T>(reader: () => { readonly value: T; readonly revision: string }): ComponentRead<T> {
  try {
    const observed = reader();
    return available(observed.value, observed.revision);
  } catch {
    return unreadable();
  }
}

function bindingProjection(status: EngineerBindingStatus): OverlayBindingProjectionV1 {
  const binding = status.binding;
  if (!binding || status.current.state === 'unbound') {
    return Object.freeze({ support: 'available', state: 'unbound', value: null, revision: status.current.current_digest });
  }
  return Object.freeze({
    support: 'available',
    state: binding.state,
    value: Object.freeze({
      binding_id: binding.binding_id,
      binding_generation: binding.binding_generation,
      engineer_contract_revision: binding.engineer_contract_revision,
      provider: binding.provider,
      provider_thread_id: binding.provider_thread_id,
      host_id: binding.host_id,
      observation: 'unknown' as const,
    }),
    revision: status.current.current_digest,
  });
}

function claimProjection(receipts: readonly ClaimActorReceiptV1[]): OverlayActiveClaimProjectionV1 {
  if (receipts.length > 1) throw new EngineeringOverlayProjectionError('engineering_overlay_unreadable', 'Engineer has more than one live ClaimActorReceipt');
  const receipt = receipts[0];
  if (!receipt) return Object.freeze({ support: 'available', value: null, revision: digest([]) });
  return Object.freeze({
    support: 'available',
    value: Object.freeze({
      task_id: receipt.task_id,
      task_revision: receipt.task_revision,
      claim_id: receipt.claim_id,
      lease_generation: receipt.lease_generation,
      work_envelope_sha256: receipt.work_envelope_sha256,
      worktree_path: receipt.worktree_path,
      branch: receipt.branch,
      unit_ref: receipt.unit_ref,
      receipt_sha256: receipt.receipt_sha256,
    }),
    revision: digest(receipts.map((item) => item.receipt_sha256)),
  });
}

function messageProjection(summary: ModuleInboxObservationSummary): OverlayMessageProjectionV1 {
  return Object.freeze({ support: 'available', pending: summary.pending, delivery_failed: summary.delivery_failed, revision: summary.revision });
}

function runtimeEffectProjection(statuses: readonly AgentRuntimeEffectStatus[]): OverlayRuntimeEffectProjectionV1 {
  const current = statuses.map((status) => ({ effect_id: status.intent.effect_id, current_sha256: status.current.current_sha256, operation: status.intent.operation, state: status.current.state }))
    .sort((left, right) => left.effect_id.localeCompare(right.effect_id));
  const wakes = current.filter((item) => item.operation === 'wake_for_offer');
  return Object.freeze({
    support: 'available',
    active: current.filter((item) => item.state === 'intent_persisted' || item.state === 'effect_started').length,
    reconciliation_required: current.filter((item) => item.state === 'reconciliation_required').length,
    failed: current.filter((item) => item.state === 'observed_failure').length,
    wake: Object.freeze({
      pending: wakes.filter((item) => item.state === 'intent_persisted' || item.state === 'effect_started').length,
      delivered: wakes.filter((item) => item.state === 'observed_success').length,
      failed: wakes.filter((item) => item.state === 'observed_failure').length,
      reconciliation_required: wakes.filter((item) => item.state === 'reconciliation_required').length,
    }),
    revision: digest(current),
  });
}

function componentAggregate<T>(values: readonly ComponentRead<T>[]): { readonly support: 'available' | 'unreadable'; readonly revision: string | null } {
  if (values.some((value) => value.support === 'unreadable')) return Object.freeze({ support: 'unreadable', revision: null });
  return Object.freeze({ support: 'available', revision: digest(values.map((value) => value.revision)) });
}

function readPass(repoRoot: string, deps: EngineeringOverlayDependencies): ReadPass {
  const profiles = observe(() => {
    const value = deps.listProfiles(repoRoot);
    return { value, revision: digest(value.map((profile) => ({ engineer_id: profile.profile.engineer_id, capability_id: profile.profile.capability_id, engineer_contract_revision: profile.engineer_contract_revision }))) };
  });
  if (profiles.support === 'unreadable' || profiles.value === null) {
    const support = Object.freeze({ profiles: 'unreadable', bindings: 'unreadable', claims: 'unreadable', messages: 'unreadable', runtime_effects: 'unreadable' } as const);
    return Object.freeze({ profiles, engineers: Object.freeze([]), support, revisions: Object.freeze({ profiles: null, bindings: null, claims: null, messages: null, runtime_effects: null }) });
  }
  const engineers = profiles.value.map((profile) => {
    const engineerId = profile.profile.engineer_id;
    const binding = observe(() => {
      const value = bindingProjection(deps.readBinding(repoRoot, engineerId, profile.engineer_contract_revision));
      return { value, revision: value.revision! };
    });
    const claim = observe(() => {
      const value = claimProjection(deps.listClaims(repoRoot, engineerId));
      return { value, revision: value.revision! };
    });
    const messages = observe(() => {
      const value = messageProjection(deps.readMessages(repoRoot, engineerId));
      return { value, revision: value.revision! };
    });
    const runtimeEffects = observe(() => {
      const value = runtimeEffectProjection(deps.listRuntimeEffects(repoRoot, engineerId));
      return { value, revision: value.revision! };
    });
    return Object.freeze({ profile, binding, claim, messages, runtime_effects: runtimeEffects });
  });
  const bindings = componentAggregate(engineers.map((item) => item.binding));
  const claims = componentAggregate(engineers.map((item) => item.claim));
  const messages = componentAggregate(engineers.map((item) => item.messages));
  const runtimeEffects = componentAggregate(engineers.map((item) => item.runtime_effects));
  return Object.freeze({
    profiles,
    engineers: Object.freeze(engineers),
    support: Object.freeze({ profiles: 'available', bindings: bindings.support, claims: claims.support, messages: messages.support, runtime_effects: runtimeEffects.support }),
    revisions: Object.freeze({ profiles: profiles.revision, bindings: bindings.revision, claims: claims.revision, messages: messages.revision, runtime_effects: runtimeEffects.revision }),
  });
}

function projectionOrUnreadable<T>(read: ComponentRead<T>, fallback: T): T {
  return read.support === 'available' && read.value !== null ? read.value : fallback;
}

function engineerProjection(read: EngineerRead): EngineeringOverlayEngineerV1 {
  return Object.freeze({
    engineer_id: read.profile.profile.engineer_id,
    capability_id: read.profile.profile.capability_id,
    engineer_contract_revision: read.profile.engineer_contract_revision,
    binding: projectionOrUnreadable(read.binding, Object.freeze({ support: 'unreadable', state: null, value: null, revision: null })),
    active_claim: projectionOrUnreadable(read.claim, Object.freeze({ support: 'unreadable', value: null, revision: null })),
    delegations: Object.freeze({ support: 'unsupported', value: null }),
    messages: projectionOrUnreadable(read.messages, Object.freeze({ support: 'unreadable', pending: null, delivery_failed: null, revision: null })),
    runtime_effects: projectionOrUnreadable(read.runtime_effects, Object.freeze({ support: 'unreadable', active: null, reconciliation_required: null, failed: null, wake: null, revision: null })),
    memory: Object.freeze({ support: 'unsupported', value: null }),
  });
}

const COMPONENT_ORDER: readonly OverlayComponentName[] = ['profiles', 'bindings', 'claims', 'messages', 'runtime_effects'];

export function collectEngineeringBoard(options: CollectEngineeringOverlayOptions): EngineeringBoardReadV1 {
  const deps = dependencies(options.dependencies);
  let registry;
  try {
    registry = deps.readRegistry({ env: options.env });
  } catch (error) {
    throw new EngineeringOverlayProjectionError('engineering_overlay_unreadable', 'repository registry authority is unreadable', error);
  }
  let repo;
  try {
    repo = resolveRegisteredRepoForWorktree(options.repo_root, registry);
  } catch (error) {
    throw new EngineeringOverlayProjectionError('engineering_overlay_repository_unregistered', 'current worktree is not an exact registered repository', error);
  }
  const before = readPass(options.repo_root, deps);
  options.between_reads?.();
  const after = readPass(options.repo_root, deps);
  const components: OverlayComponentObservationV1[] = COMPONENT_ORDER.map((component) => {
    const support = before.support[component] === 'available' && after.support[component] === 'available' ? 'available' : 'unreadable';
    return Object.freeze({
      component,
      support,
      observation_before: support === 'available' ? before.revisions[component] : null,
      observation_after: support === 'available' ? after.revisions[component] : null,
    });
  });
  const degraded = components.some((component) => component.support === 'unreadable');
  const changed = components.some((component) => component.support === 'available' && component.observation_before !== component.observation_after);
  // The Profile authority names the projection's rows. A pass that lost it saw
  // no Engineers at all, so a surviving pass must not repopulate the roster:
  // both read directions converge on the same empty degraded projection.
  const profilesReadable = before.profiles.support === 'available' && after.profiles.support === 'available';
  const overlay = buildEngineeringOverlaySnapshot({
    repository_id: repo.id,
    registry_revision: registry.registryRevision,
    observed_at: options.observed_at ?? new Date().toISOString(),
    engineers: profilesReadable ? after.engineers.map(engineerProjection) : Object.freeze([]),
    components: Object.freeze(components),
    snapshot_consistency: degraded ? 'degraded' : changed ? 'changed_during_read' : 'stable',
  });
  return Object.freeze({ overlay, organization_attention: projectOrganizationAttention(overlay) });
}
