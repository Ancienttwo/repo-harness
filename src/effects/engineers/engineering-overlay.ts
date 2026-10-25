import { buildAdmittedEngineeringOverlay, projectAdmittedOrganizationAttention } from '../../core/engineers/engineering-overlay';
import { readProviderEngineerScheduling, resolveRegisteredRepoForWorktree } from './scheduling';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
export interface CollectEngineeringOverlayOptions {
  readonly repo_root: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly observed_at?: string;
  readonly between_reads?: () => void;
}
/** Provider-backed overlay. The two observations must agree before actions can use them. */
export function collectEngineeringBoard(options: CollectEngineeringOverlayOptions) {
  const registry = readRepoHarnessRegistryStrictSnapshot({ env: options.env });
  const repo = resolveRegisteredRepoForWorktree(options.repo_root, registry);
  const read = () => {
    try { return readProviderEngineerScheduling(repo, options.env); }
    catch { return null; }
  };
  const before = read();
  options.between_reads?.();
  const after = read();
  const readable = before !== null && after !== null;
  const overlay = buildAdmittedEngineeringOverlay({
    repository_id: repo.id, registry_revision: registry.registryRevision,
    observed_at: options.observed_at ?? new Date().toISOString(),
    scheduling: readable ? after : null,
    runtime_effects: { support: 'unreadable', engineers: [] },
    components: [{ component: 'scheduling', support: readable ? 'available' : 'unreadable',
      observation_before: readable ? before.source_revision : null, observation_after: readable ? after.source_revision : null }],
    snapshot_consistency: !readable ? 'degraded' : before.source_revision === after.source_revision ? 'stable' : 'changed_during_read',
  });
  return { overlay, organization_attention: projectAdmittedOrganizationAttention(overlay) };
}
