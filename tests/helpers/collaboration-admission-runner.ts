/**
 * One real admission request, in its own operating-system process.
 *
 * This exists so the C4 canary is not three calls in one event loop pretending
 * to be three participants. Each invocation is a separate process with its own
 * pid, contending for the same on-disk exclusive directory lock through the same
 * filesystem, exactly as three delegated Workers launched by a Host would.
 *
 * Usage:
 *   bun tests/helpers/collaboration-admission-runner.ts <repoRoot> <inputsPath> <index>
 *
 * It prints one JSON line describing the decision, so the parent asserts on the
 * bridge's own output rather than on anything this file decides.
 */
import { readFileSync, realpathSync } from 'fs';

import type { CodexReadOnlyCapabilityReceiptV1 } from '../../src/core/engineers/delegation';
import type { ClaimActorReceiptV1 } from '../../src/core/engineers/principal-claim';
import { admitCollaborationDelegation } from '../../src/effects/collaboration/admission-bridge';
import { loadLogicalReadOnlyRoleProfile } from '../../src/effects/engineers/delegated-run-store';
import { delegationParticipant, liveParentFor, type DelegationSubject } from './collaboration-delegation-fixture';

interface RunnerInputs {
  readonly capability: CodexReadOnlyCapabilityReceiptV1;
  readonly claim_actor_receipt: ClaimActorReceiptV1;
  readonly round_index: number;
}

function main(): void {
  const [repoRootArgument, inputsPath, indexArgument] = process.argv.slice(2);
  const repoRoot = realpathSync(repoRootArgument);
  const inputs = JSON.parse(readFileSync(inputsPath, 'utf8')) as RunnerInputs;
  const index = Number.parseInt(indexArgument, 10);
  const subject: DelegationSubject = {
    repoRoot,
    role_profile: loadLogicalReadOnlyRoleProfile(repoRoot, 'explorer'),
    capability: inputs.capability,
    claim_actor_receipt: inputs.claim_actor_receipt,
  };
  const participant = delegationParticipant(subject, index);
  const result = admitCollaborationDelegation({
    repo_root: repoRoot,
    round_index: inputs.round_index,
    decided_at: '2026-08-30T00:00:02.000Z',
    idempotency_key: participant.idempotency_key,
    observed_at: '2026-08-30T00:00:03.000Z',
    delegation: {
      repo_root: repoRoot,
      envelope: participant.envelope,
      role_profile: subject.role_profile,
      capability: subject.capability,
      execution_packet: participant.packet,
      work_envelope: {} as never,
      claim_actor_receipt: subject.claim_actor_receipt,
      decided_at: '2026-08-30T00:00:02.000Z',
      validate_parent: liveParentFor(subject),
    },
  });
  process.stdout.write(`${JSON.stringify({
    index,
    pid: process.pid,
    decision: result.admission.decision,
    rejection_reason: result.admission.rejection_reason,
    observed_active_readers: result.admission.observed_active_readers,
    delegation_decision: result.delegation?.receipt.decision ?? null,
    dispatch_id: result.run?.intent.dispatch_id ?? null,
    run_state: result.run?.current.state ?? null,
  })}\n`);
}

main();
