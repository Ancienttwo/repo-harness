import { decodeOperatorAutomationSummary } from '../core/operator/automation-summary';
import { assertRepositorySnapshotIdentity, type OperatorRepositorySnapshot } from '../core/operator/repository-snapshot';
import { decodeOperatorFleetSnapshot } from './types';

export function decodeOperatorRepositorySnapshot(value: unknown, repositoryId: string): OperatorRepositorySnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== 'automation,generation,kind,protocol,repository_id,service_epoch,snapshot') {
    throw new Error('repository_snapshot_invalid');
  }
  const record = value as OperatorRepositorySnapshot;
  const result = { ...record, snapshot: decodeOperatorFleetSnapshot(record.snapshot), automation: decodeOperatorAutomationSummary(record.automation, repositoryId) };
  assertRepositorySnapshotIdentity(result, repositoryId);
  return result;
}

export async function fetchRepositorySnapshot(repositoryId: string, signal: AbortSignal): Promise<OperatorRepositorySnapshot> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(repositoryId)) throw new Error('repository_snapshot_invalid');
  const response = await fetch(`/api/v1/fleet/repositories/${encodeURIComponent(repositoryId)}/snapshot`, { signal, cache: 'no-store' });
  const value: unknown = await response.json();
  if (!response.ok) {
    const code = (value as { error?: { code?: unknown } } | null)?.error?.code;
    const known = ['fleet_repository_not_found', 'fleet_registry_invalid', 'fleet_registry_unavailable',
      'fleet_snapshot_busy', 'fleet_snapshot_timeout', 'fleet_snapshot_unavailable'];
    throw new Error(typeof code === 'string' && known.includes(code) ? code : 'fleet_snapshot_unavailable');
  }
  return decodeOperatorRepositorySnapshot(value, repositoryId);
}
