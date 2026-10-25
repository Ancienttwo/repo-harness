import { buildAdmittedEngineeringOverlay, projectAdmittedOrganizationAttention, type EngineeringOverlaySnapshotV2, type OverlayRuntimeEffectProjectionV1 } from '../../core/engineers/engineering-overlay';
import { canonicalEngineerJson, engineerSha256 } from '../../core/engineers/profile-binding';
import { readProviderEngineerScheduling, resolveRegisteredRepoForWorktree } from './scheduling';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { observeAgentRuntimeEffects, type AgentRuntimeEffectStatus } from './agent-runtime-effect-store';
export interface EngineeringOverlayDependencies {
  readonly readRegistry: typeof readRepoHarnessRegistryStrictSnapshot;
  readonly readScheduling: typeof readProviderEngineerScheduling;
  readonly listRuntimeEffects: typeof observeAgentRuntimeEffects;
}
export interface CollectEngineeringOverlayOptions {
  readonly repo_root: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly observed_at?: string;
  readonly between_reads?: () => void;
  readonly dependencies?: Partial<EngineeringOverlayDependencies>;
}
const digest = (value: unknown): string => engineerSha256(canonicalEngineerJson(value));
function runtimeProjection(statuses: readonly AgentRuntimeEffectStatus[]): OverlayRuntimeEffectProjectionV1 {
  const current = statuses.map(({ intent, current }) => ({ effect_id: intent.effect_id, operation: intent.operation,
    state: current.state, current_sha256: current.current_sha256 })).sort((a, b) => a.effect_id.localeCompare(b.effect_id));
  const pending = (state: string) => state === 'intent_persisted' || state === 'effect_started';
  const wakes = current.filter(item => item.operation === 'wake_for_offer');
  return { support: 'available', active: current.filter(item => pending(item.state)).length,
    reconciliation_required: current.filter(item => item.state === 'reconciliation_required').length,
    failed: current.filter(item => item.state === 'observed_failure').length,
    wake: { pending: wakes.filter(item => pending(item.state)).length,
      delivered: wakes.filter(item => item.state === 'observed_success').length,
      failed: wakes.filter(item => item.state === 'observed_failure').length,
      reconciliation_required: wakes.filter(item => item.state === 'reconciliation_required').length }, revision: digest(current) };
}
/** Read observations only. Every effect belongs to an exact current admitted session and profile. */
export function collectEngineeringBoard(options: CollectEngineeringOverlayOptions) {
  const deps: EngineeringOverlayDependencies = { readRegistry: readRepoHarnessRegistryStrictSnapshot,
    readScheduling: readProviderEngineerScheduling, listRuntimeEffects: observeAgentRuntimeEffects, ...options.dependencies };
  const registry = deps.readRegistry({ env: options.env });
  const repo = resolveRegisteredRepoForWorktree(options.repo_root, registry);
  const read = () => {
    let scheduling: ReturnType<typeof readProviderEngineerScheduling> | null = null;
    let runtime: EngineeringOverlaySnapshotV2['runtime_effects'] | null = null;
    try { scheduling = deps.readScheduling(repo, options.env); } catch { /* Explicit unavailable observation. */ }
    if (scheduling) {
      try {
        const statuses = deps.listRuntimeEffects(options.repo_root);
        const sessions = scheduling.tasks.flatMap(task => task.sessions).filter(execution => execution.selection.state === 'selected');
        const current = statuses.filter(status => sessions.some(execution => {
          const selection = execution.selection, session = execution.session, fence = status.intent.endpoint_fence;
          return selection.state === 'selected' && fence.engineer_id === selection.engineer_id
            && fence.engineer_contract_revision === selection.engineer_contract_revision
            && fence.session_binding_sha256 === session.selector.session_binding_sha256
            && fence.task === session.selector.task && fence.role === session.selector.role
            && fence.admission_sha256 === session.admission_sha256 && fence.grant_sha256 === session.selector.grant_sha256;
        }));
        runtime = { support: 'available', engineers: scheduling.profiles.map(profile => ({ engineer_id: profile.engineer_id,
          effects: runtimeProjection(current.filter(status => status.intent.endpoint_fence.engineer_id === profile.engineer_id)) })) };
      } catch { /* A malformed journal is unavailable, never an empty successful read. */ }
    }
    return { scheduling, runtime };
  };
  const before = read();
  options.between_reads?.();
  const after = read();
  if (deps.readRegistry({ env: options.env }).registryRevision !== registry.registryRevision) throw new Error('engineering overlay registry changed');
  const schedulingReadable = before.scheduling !== null && after.scheduling !== null;
  const runtimeReadable = schedulingReadable && before.runtime !== null && after.runtime !== null;
  const components: EngineeringOverlaySnapshotV2['components'] = [
    { component: 'scheduling', support: schedulingReadable ? 'available' : 'unreadable',
      observation_before: schedulingReadable ? before.scheduling!.source_revision : null, observation_after: schedulingReadable ? after.scheduling!.source_revision : null },
    { component: 'runtime_effects', support: runtimeReadable ? 'available' : 'unreadable',
      observation_before: runtimeReadable ? digest(before.runtime) : null, observation_after: runtimeReadable ? digest(after.runtime) : null },
  ];
  const overlay = buildAdmittedEngineeringOverlay({
    repository_id: repo.id, registry_revision: registry.registryRevision,
    observed_at: options.observed_at ?? new Date().toISOString(), scheduling: schedulingReadable ? after.scheduling : null,
    runtime_effects: runtimeReadable ? after.runtime! : { support: 'unreadable', engineers: [] }, components,
    snapshot_consistency: components.some(component => component.support === 'unreadable') ? 'degraded'
      : components.some(component => component.observation_before !== component.observation_after) ? 'changed_during_read' : 'stable',
  });
  return { overlay, organization_attention: projectAdmittedOrganizationAttention(overlay) };
}
