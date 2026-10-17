import { EngineerProfileBindingError } from '../../core/engineers/profile-binding';
import { listLeaseReads } from '../state/coordination-lease-store';
import { listLiveClaimActorReceiptsForEngineer } from './claim-actor-store';

/**
 * Binding rotation never transfers a Lease. A live Claim must first complete
 * the existing explicit release path.
 */
export function assertNoLiveClaimForBindingRotation(cwd: string, engineerId: string, bindingId: string): void {
  const claimIds = new Set(listLiveClaimActorReceiptsForEngineer(cwd, engineerId).map((receipt) => receipt.claim_id));
  const bindingSessionId = `engineer:${bindingId}`;
  for (const lease of listLeaseReads(cwd)) {
    if (lease.classification === 'unknown') {
      throw new EngineerProfileBindingError(
        'bound_task_lease_unavailable',
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
  throw new EngineerProfileBindingError(
    'bound_task_active',
    `engineer ${engineerId} owns ${claimIds.size} live Claim(s); release it explicitly before binding rotation`,
  );
}
