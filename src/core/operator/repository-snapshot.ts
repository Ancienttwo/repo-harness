import { isOperatorServiceEpoch } from './observation-identity';
import { decodeOperatorAutomationSummary, type OperatorAutomationSummary } from './automation-summary';
import type { OperatorFleetSnapshotV1 } from './fleet-snapshot';

export interface OperatorRepositorySnapshot {
  readonly protocol: 3;
  readonly kind: 'operator_repository_snapshot';
  readonly repository_id: string;
  readonly service_epoch: string;
  readonly generation: number;
  readonly snapshot: OperatorFleetSnapshotV1;
  readonly automation: OperatorAutomationSummary;
}

export function assertRepositorySnapshotIdentity(value: OperatorRepositorySnapshot, repositoryId: string): void {
  decodeOperatorAutomationSummary(value.automation, repositoryId);
  if (value.protocol !== 3 || value.kind !== 'operator_repository_snapshot'
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(repositoryId)
    || value.repository_id !== repositoryId
    || !isOperatorServiceEpoch(value.service_epoch)
    || value.snapshot.service_epoch !== value.service_epoch
    || !Number.isSafeInteger(value.generation) || value.generation < 1
    || value.snapshot.sequence !== value.generation
    || value.snapshot.repositories.length !== 1
    || value.snapshot.repositories[0]?.repository_id !== repositoryId) {
    throw new Error('repository_snapshot_invalid');
  }
}

export function projectOperatorRepositorySnapshot(
  snapshot: OperatorFleetSnapshotV1, repositoryId: string, automation: OperatorAutomationSummary,
): OperatorRepositorySnapshot {
  const result: OperatorRepositorySnapshot = {
    protocol: 3, kind: 'operator_repository_snapshot', repository_id: repositoryId,
    service_epoch: snapshot.service_epoch, generation: snapshot.sequence, snapshot, automation,
  };
  assertRepositorySnapshotIdentity(result, repositoryId);
  return result;
}
