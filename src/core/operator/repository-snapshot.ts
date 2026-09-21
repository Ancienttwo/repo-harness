import { decodeOperatorAutomationSummary, type OperatorAutomationSummary } from './automation-summary';
import type { OperatorFleetSnapshotV1 } from './fleet-snapshot';

export interface OperatorRepositorySnapshot {
  readonly protocol: 2;
  readonly kind: 'operator_repository_snapshot';
  readonly repository_id: string;
  readonly service_epoch: string;
  readonly generation: number;
  readonly snapshot: OperatorFleetSnapshotV1;
  readonly automation: OperatorAutomationSummary;
}

export function assertRepositorySnapshotIdentity(value: OperatorRepositorySnapshot, repositoryId: string): void {
  decodeOperatorAutomationSummary(value.automation, repositoryId);
  if (value.protocol !== 2 || value.kind !== 'operator_repository_snapshot'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(repositoryId)
    || value.repository_id !== repositoryId
    || typeof value.service_epoch !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value.service_epoch)
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || value.snapshot.sequence !== value.generation
    || value.snapshot.repositories.length !== 1
    || value.snapshot.repositories[0]?.repository_id !== repositoryId) {
    throw new Error('repository_snapshot_invalid');
  }
}

export function projectOperatorRepositorySnapshot(
  snapshot: OperatorFleetSnapshotV1, repositoryId: string, serviceEpoch: string, automation: OperatorAutomationSummary,
): OperatorRepositorySnapshot {
  const result: OperatorRepositorySnapshot = {
    protocol: 2, kind: 'operator_repository_snapshot', repository_id: repositoryId,
    service_epoch: serviceEpoch, generation: snapshot.sequence, snapshot, automation,
  };
  assertRepositorySnapshotIdentity(result, repositoryId);
  return result;
}
