import { TaskFreezeError } from '../../core/engineers/task-freeze';
import { listLeaseReads } from '../state/coordination-lease-store';
import { listLiveClaimActorReceiptsForEngineer } from './claim-actor-store';

/**
 * Binding rotation never transfers a Lease. A live Claim must first complete
 * the existing explicit release path; ME-4A only records the residual state.
 */
export function assertNoLiveClaimForBindingRotation(cwd: string, engineerId: string, bindingId: string): void {
  const claimIds = new Set(listLiveClaimActorReceiptsForEngineer(cwd, engineerId).map((receipt) => receipt.claim_id));
  const bindingSessionId = `engineer:${bindingId}`;
  for (const lease of listLeaseReads(cwd)) {
    if (lease.classification === 'unknown') {
      throw new TaskFreezeError(
        'task_freeze_state_unavailable',
        `cannot prove binding rotation safe while Lease ${lease.task_id} is unknown (${lease.unknown_reason})`,
      );
    }
    if (lease.record !== null
      && lease.record.state !== 'released'
      && lease.record.claimed_by.session_id === bindingSessionId) {
      claimIds.add(lease.record.claim_id);
    }
  }
  if (claimIds.size === 0) return;
  throw new TaskFreezeError(
    'bound_task_active',
    `engineer ${engineerId} owns ${claimIds.size} live Claim(s); inspect/freeze the bound task and release it explicitly before binding rotation`,
  );
}
