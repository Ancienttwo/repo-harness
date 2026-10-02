import { requireCampaignActiveAdmission } from './campaign-revision-admission';
import { createCampaignWorkerHandoff } from './campaign-worker';
import { assertMessageExactKeys, canonicalMessageBytes, canonicalMessageDigest } from '../../core/messages/mechanics';
import { CampaignPlanningError } from '../../core/automation/campaign-planning';
import { resolveEngineerPrincipal } from '../engineers/principal';
import { acquireNextScheduledEngineerTask, buildAcquisitionRequestIdentity, requireFreshAcquisitionBudgetAdmission, type AcquisitionRequestV2, type AcquisitionPolicy, type AcquireNextScheduledEngineerTaskOptions, type AcquireNextScheduledEngineerTaskResult } from '../engineers/scheduling-acquire-next';
import { readClaimActorReceipt, validateClaimActorReceiptLive } from '../engineers/claim-actor-store';
import { validateFleetWorkEnvelope } from '../fleet/acquire';
import { processSprintDependencies, releaseSprintCommand } from '../state/coordination-sprint';
import type { ScheduledEngineerAcquireResult } from '../engineers/scheduling-acquire';
import { readIssueBatchIntent } from './issue-batch-store';
import { readPlanningRecord, persistPlanningRecord, withCampaignPlanningLock, listPlanningRecords } from './campaign-planning-store';
import { requireCampaignPlanningAuthority } from './campaign-planning-proof';
import type { CampaignPlanningStepInput } from './campaign-planning';
import type { IssueBatchIntentV1 } from '../../core/automation/issue-batch';
import type { EngineerPrincipalV1 } from '../../core/engineers/principal-claim';
import type { GenericAutomationBudgetReservationV1 } from '../../core/automation/budget';
import { withDevelopmentCampaignLock } from './development-campaign-store';
import { ensureCampaignAuthoringBudget, reserveAutomationBudget, appendAutomationUsage } from './budget-store';
import { ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';

export interface CampaignAcquisitionInput extends Omit<CampaignPlanningStepInput, 'result'> {
  readonly authorization_id: string;
}

export interface CampaignAcquisitionTransactionPorts {
  readonly withCampaignLock: typeof withDevelopmentCampaignLock;
  readonly withPlanningLock: typeof withCampaignPlanningLock;
  readonly readAuthority: typeof requireCampaignPlanningAuthority;
  readonly ensureBudget: typeof ensureCampaignAuthoringBudget;
  readonly reserveBudget: typeof reserveAutomationBudget;
  readonly appendUsage: typeof appendAutomationUsage;
  readonly readRecord: typeof readPlanningRecord;
  readonly persistRecord: typeof persistPlanningRecord;
  readonly requireInnerAdmission: typeof requireFreshAcquisitionBudgetAdmission;
}
export function campaignAcquisitionPolicyR2(input: CampaignAcquisitionInput, intent: IssueBatchIntentV1, authority: ReturnType<typeof requireCampaignPlanningAuthority>): AcquisitionPolicy {
  return Object.freeze({ policy_id: 'engineer/campaign', policy_revision: 'R2', scope: Object.freeze({
    campaign_id: intent.campaign_id, group_number: intent.group_number, intent_sha256: intent.intent_sha256,
    manifest_sha256: canonicalMessageDigest({ ...authority.manifest }), authorization_revision: canonicalMessageDigest({ authorization_sha256: authority.grant.authorization_sha256, policy: authority.policy }),
    parent_host: input.host, parent_session: input.session_id!,
  }) });
}
/** Owner-computed identity; no host-provided task collection or callback names. */
function requireAcquisitionContext(input: CampaignAcquisitionInput, intent: IssueBatchIntentV1, policy: AcquisitionPolicy, authority: ReturnType<typeof requireCampaignPlanningAuthority>): void {
  if (authority.policy.mode !== 'active' || canonicalMessageBytes({ ...policy }) !== canonicalMessageBytes({ ...campaignAcquisitionPolicyR2(input, intent, authority) })) {
    throw new CampaignPlanningError('human_attention_required', 'campaign acquisition owner context changed');
  }
}

interface CampaignAcquisitionFenceV2 { protocol: 2; kind: 'repo-harness-campaign-acquisition-legacy-fence'; admission_key: string; result_key: string; source_sha256: string }
interface CampaignAcquisitionSealV2 { protocol: 2; kind: 'repo-harness-campaign-acquisition-cutover'; inventory_sha256: string; fenced_admissions: readonly string[]; quiescence_evidence: string }
function campaignSealKey(intent: IssueBatchIntentV1): string { return canonicalMessageDigest({ operation: 'campaign-acquisition-cutover-v2', intent_sha256: intent.intent_sha256 }).slice(7); }
function campaignFenceKey(intent: IssueBatchIntentV1, admission: string): string { return canonicalMessageDigest({ operation: 'campaign-acquisition-legacy-fence-v2', intent_sha256: intent.intent_sha256, admission }).slice(7); }
/** Operator-only inventory/migration, never a normal-path v1 reader. Generic planning evidence remains immutable. */
export function inspectCampaignAcquisitionCutover(root: string, intent: IssueBatchIntentV1) {
  const records = listPlanningRecords(root,intent).filter(entry => {
    const record = entry.record as Record<string, unknown> | null;
    return entry.key !== campaignSealKey(intent) && record?.kind !== 'repo-harness-campaign-acquisition-legacy-fence';
  });
  return { inventory_sha256: canonicalMessageDigest({ records }), records };
}
export function migrateCampaignAcquisitionReceipts(options: { repo_root: string; intent: IssueBatchIntentV1; expected_inventory_sha256: string; quiescence_evidence: string }) {
  if (!options.quiescence_evidence.trim()) throw new CampaignPlanningError('human_attention_required','old campaign/inner producers must be explicitly quiesced');
  const root=options.repo_root, intent=options.intent;
  return withDevelopmentCampaignLock(root,intent.campaign_id,() => withCampaignPlanningLock(root,intent,() => {
    const existing = readPlanningRecord<CampaignAcquisitionSealV2>(root,intent,campaignSealKey(intent));
    if (existing) {
      if (existing.protocol !== 2 || existing.kind !== 'repo-harness-campaign-acquisition-cutover' || existing.inventory_sha256 !== options.expected_inventory_sha256) throw new CampaignPlanningError('human_attention_required','campaign cutover seal differs');
      return existing;
    }
    const inventory=inspectCampaignAcquisitionCutover(root,intent);
    if (inventory.inventory_sha256 !== options.expected_inventory_sha256) throw new CampaignPlanningError('human_attention_required','campaign cutover inventory changed');
    const fences: CampaignAcquisitionFenceV2[]=[];
    const matchedResults=new Set<string>();
    for (const entry of inventory.records) {
      const record=entry.record as { request?: unknown; reservation?: GenericAutomationBudgetReservationV1 };
      if (!record?.reservation || record.reservation.operation !== 'acquisition') continue;
      assertMessageExactKeys(record as unknown as Record<string,unknown>,['request','reservation'],'legacy campaign admission',message=>{throw new CampaignPlanningError('human_attention_required',message);});
      const cursor=record.reservation.idempotency_key;
      if (!/^sha256:[a-f0-9]{64}$/.test(cursor) || canonicalMessageDigest({cursor,part:'admission'}).slice(7)!==entry.key) throw new CampaignPlanningError('human_attention_required','unknown campaign acquisition identity');
      const resultKey=canonicalMessageDigest({cursor,part:'result'}).slice(7);
      const result=inventory.records.find(item=>item.key===resultKey)?.record as AcquireNextScheduledEngineerTaskResult | undefined;
      if (!result || typeof result.ok!=='boolean') throw new CampaignPlanningError('human_attention_required','legacy campaign unresolved admission must be reconciled before cutover');
      matchedResults.add(resultKey);
      fences.push({protocol:2,kind:'repo-harness-campaign-acquisition-legacy-fence',admission_key:entry.key,result_key:resultKey,source_sha256:canonicalMessageDigest({admission:record,result})});
    }
    for (const entry of inventory.records) {
      const record=entry.record as Record<string,unknown> | null;
      if (record && typeof record.ok==='boolean' && !matchedResults.has(entry.key)) throw new CampaignPlanningError('human_attention_required','orphan/unknown campaign outcome must be reconciled before cutover');
    }
    for (const fence of fences) persistPlanningRecord(root,intent,campaignFenceKey(intent,fence.admission_key),fence);
    const seal: CampaignAcquisitionSealV2={protocol:2,kind:'repo-harness-campaign-acquisition-cutover',inventory_sha256:inventory.inventory_sha256,fenced_admissions:fences.map(f=>f.admission_key),quiescence_evidence:options.quiescence_evidence};
    persistPlanningRecord(root,intent,campaignSealKey(intent),seal); return seal;
  }));
}

/** Serialize acquisition transactions, not worker execution. Budget owns all arithmetic. */
export function budgetedAcquisition(input: CampaignAcquisitionInput, intent: IssueBatchIntentV1, request: AcquisitionRequestV2, invoke: () => AcquireNextScheduledEngineerTaskResult, ports: Partial<CampaignAcquisitionTransactionPorts> = {}): AcquireNextScheduledEngineerTaskResult | { readonly admission_busy: true } {
  const deps: CampaignAcquisitionTransactionPorts = {
    withCampaignLock: withDevelopmentCampaignLock, readAuthority: requireCampaignPlanningAuthority,
    ensureBudget: ensureCampaignAuthoringBudget, reserveBudget: reserveAutomationBudget, appendUsage: appendAutomationUsage,
    readRecord: readPlanningRecord, persistRecord: persistPlanningRecord, withPlanningLock: withCampaignPlanningLock,
    requireInnerAdmission: requireFreshAcquisitionBudgetAdmission, ...ports,
  };
  let entered = false;
  try {
    return deps.withCampaignLock(input.repo_root, intent.campaign_id, () => {
    entered = true;
    const root = input.repo_root;
    const authority = deps.readAuthority(root, intent, input.env);
    if (authority.policy.mode !== 'active') throw new CampaignPlanningError('human_attention_required', 'campaign acquisition is no longer active');
    const seal = deps.readRecord<CampaignAcquisitionSealV2>(root, intent, campaignSealKey(intent));
    if (!seal || seal.protocol !== 2 || seal.kind !== 'repo-harness-campaign-acquisition-cutover' || !seal.quiescence_evidence) throw new CampaignPlanningError('human_attention_required', 'explicit campaign acquisition identity cutover is required');
    assertMessageExactKeys(seal as unknown as Record<string,unknown>, ['protocol','kind','inventory_sha256','fenced_admissions','quiescence_evidence'], 'campaign acquisition seal', message => { throw new CampaignPlanningError('human_attention_required',message); });
    if (!Array.isArray(seal.fenced_admissions) || seal.fenced_admissions.some(key => !/^[a-f0-9]{64}$/.test(key)) || !/^sha256:[a-f0-9]{64}$/.test(seal.inventory_sha256)) throw new CampaignPlanningError('human_attention_required','campaign seal metadata requires reconciliation');
    let cursor = canonicalMessageDigest({ operation: 'campaign-acquisition-budget', intent_sha256: intent.intent_sha256, key: input.idempotency_key });
    const persist = (key: string, value: unknown) => deps.withPlanningLock(root, intent, () => deps.persistRecord(root, intent, key, value));
    for (;;) {
      const admissionKey = canonicalMessageDigest({ cursor, part: 'admission' }).slice(7);
      const resultKey = canonicalMessageDigest({ cursor, part: 'result' }).slice(7);
      const fence = deps.readRecord<CampaignAcquisitionFenceV2>(root, intent, campaignFenceKey(intent, admissionKey));
      if (fence || seal.fenced_admissions.includes(admissionKey)) throw new CampaignPlanningError('human_attention_required', 'legacy campaign acquisition key is fenced; no transparent replay or new budget');
      const admission = deps.readRecord<{ protocol: 2; kind: string; request: AcquisitionRequestV2; reservation: GenericAutomationBudgetReservationV1 }>(root, intent, admissionKey);
      if (admission) assertMessageExactKeys(admission as unknown as Record<string,unknown>, ['protocol','kind','request','reservation'], 'campaign admission', message => { throw new CampaignPlanningError('human_attention_required',message); });
      if (admission && (admission.protocol !== 2 || admission.kind !== 'repo-harness-campaign-acquisition-admission')) throw new CampaignPlanningError('human_attention_required', 'campaign admission metadata requires reconciliation');
      if (admission && canonicalMessageBytes({ ...admission.request }) !== canonicalMessageBytes({ ...request })) throw new CampaignPlanningError('human_attention_required', 'acquisition key names a different authenticated request');
      const stored = deps.readRecord<{ protocol: 2; kind: string; request_sha256: string; result: AcquireNextScheduledEngineerTaskResult }>(root, intent, resultKey);
      if (stored) assertMessageExactKeys(stored as unknown as Record<string,unknown>, ['protocol','kind','request_sha256','result'], 'campaign result', message => { throw new CampaignPlanningError('human_attention_required',message); });
      if (stored && (stored.protocol !== 2 || stored.kind !== 'repo-harness-campaign-acquisition-result' || stored.request_sha256 !== canonicalMessageDigest({ ...request }))) throw new CampaignPlanningError('human_attention_required', 'campaign result metadata requires reconciliation');
      let result = stored?.result ?? null;
      const replay = result !== null;
      if (admission && !result) throw new CampaignPlanningError('human_attention_required', 'campaign acquisition requires reconciliation before another effect');
      if (!admission && result) throw new CampaignPlanningError('human_attention_required', 'campaign acquisition result has no admission');
      requireAcquisitionContext(input, intent, request.policy, authority);
      if (request.session_id !== input.session_id) throw new CampaignPlanningError('human_attention_required', 'campaign request session differs from its owner');
      if (!result) deps.requireInnerAdmission(root, request);
      const budget = deps.ensureBudget({ repo_root: root, authorization: authority.grant, env: input.env }).budget;
      const reservation = admission?.reservation ?? deps.reserveBudget({ repo_root: root, automation_run_id: budget.automation_run_id,
        expected_budget_sha256: budget.budget_sha256, idempotency_key: cursor, operation: 'acquisition', unit_kind: 'execute',
        unit_id: `${intent.campaign_id}:group:${intent.group_number}`, attempt: 1, provider: null, env: input.env });
      if (!result) {
        persist(admissionKey, { protocol: 2, kind: 'repo-harness-campaign-acquisition-admission', request, reservation });
        // Exceptions leave the durable admission unresolved. A missing return is not a failed acquisition proof.
        result = invoke();
        persist(resultKey, { protocol: 2, kind: 'repo-harness-campaign-acquisition-result', request_sha256: canonicalMessageDigest({ ...request }), result });
      }
      const definitive = result.ok || ['engineer_no_eligible_offer', 'engineer_offer_stale', 'engineer_concurrency_unavailable', 'claim_actor_receipt_failed', 'engineer_acquire_next_conflict'].includes(result.error);
      if (definitive) deps.appendUsage({ repo_root: root, reservation, outcome: result.ok ? 'progress' : 'no_progress',
        evidence_refs: [{ ref: `campaign-acquisition:${resultKey}`, sha256: canonicalMessageDigest({ result }).slice(7) }], env: input.env });
      if (!replay || result.ok || result.error !== 'engineer_no_eligible_offer') return result;
      // acquire-next deliberately does not cache idle. Each later try receives its own reservation,
      // chained to the prior observed result, while completed acquisitions replay without spending.
      cursor = canonicalMessageDigest({ previous: cursor, result });
    }
    });
  } catch (error) {
    // Only contention before admission is idle. An inner lock failure may follow an effect and must remain unresolved.
    if (!entered && error instanceof ExclusiveLockContentionError && error.kind === 'timeout') return { admission_busy: true };
    throw error;
  }
}

export function runCampaignAcquisition(input: CampaignAcquisitionInput, acquire = acquireNextScheduledEngineerTask, ports: Partial<CampaignAcquisitionTransactionPorts> = {}) {
  const root = input.repo_root;
  const intent = readIssueBatchIntent(root, input.campaign_id, input.group_number, input.intent_sha256);
  const readAuthority = ports.readAuthority ?? requireCampaignPlanningAuthority;
  const authority = readAuthority(root, intent, input.env);
  if (input.host !== authority.grant.campaign!.local_parent_host || !input.session_id?.trim() || input.session_id.length > 256) throw new CampaignPlanningError('human_attention_required', 'execution requires the authorized local parent host and session');
  if (!input.idempotency_key || input.idempotency_key.length > 512) throw new CampaignPlanningError('human_attention_required', 'execution requires a bounded idempotency key');
  if (authority.policy.mode === 'shadow') return { action: 'idle' as const, reason: 'shadow campaign cannot acquire workers' };
  requireCampaignActiveAdmission(root, intent, input.env);
  const parent = readPlanningRecord<{ host: string; session_id: string }>(root, intent, 'parent');
  if (!parent || parent.host !== input.host || parent.session_id !== input.session_id) throw new CampaignPlanningError('human_attention_required', 'execution session does not own this group planning');
  if (!authority.grant.campaign?.liveness_policy || authority.grant.campaign.liveness_policy.renewal_actor_kind !== 'controller') throw new CampaignPlanningError('human_attention_required', 'campaign execution requires an explicit controller liveness policy');
  const principal = resolveEngineerPrincipal({ repo_root: root, authorization_id: input.authorization_id, env: input.env });
  const policy = campaignAcquisitionPolicyR2(input, intent, authority);
  const requireMember = (taskId: string) => {
    const current = readAuthority(root, intent, input.env);
    requireAcquisitionContext(input, intent, policy, current);
    if (!current.manifest.slots.some(slot => slot.task_id === taskId)) throw new CampaignPlanningError('human_attention_required', 'Task does not belong to this campaign intent manifest');
  };
  const validateHandoff = (acquired: Extract<ScheduledEngineerAcquireResult, { ok: true }>) => {
    requireMember(acquired.envelope.task_id);
    if (acquired.offer.task_id !== acquired.envelope.task_id) throw new CampaignPlanningError('human_attention_required', 'acquired offer and handoff name different Tasks');
    const currentPrincipal = resolveEngineerPrincipal({ repo_root: root, authorization_id: input.authorization_id, env: input.env });
    if (canonicalMessageBytes({ ...currentPrincipal }) !== canonicalMessageBytes({ ...principal })) throw new CampaignPlanningError('human_attention_required', 'Engineer principal changed during acquisition');
    const receipt = readClaimActorReceipt(root, acquired.envelope.task_id, acquired.envelope.claim_id);
    if (!receipt || canonicalMessageBytes({ ...receipt }) !== canonicalMessageBytes({ ...acquired.receipt }) || receipt.engineer_id !== principal.engineer_id || receipt.binding_id !== principal.binding_id) throw new CampaignPlanningError('human_attention_required', 'acquisition lacks its authenticated stored ClaimActorReceipt');
    validateClaimActorReceiptLive(root, receipt, acquired.envelope);
    validateFleetWorkEnvelope(root, acquired.envelope, input.env);
    requireMember(acquired.envelope.task_id);
  };
  let acceptedFresh = false;
  const acquisitionOptions: AcquireNextScheduledEngineerTaskOptions = {
    repo_root: root, principal, session_id: input.session_id, env: input.env,
    idempotency_key: canonicalMessageDigest({ operation: 'campaign-acquisition', intent_sha256: intent.intent_sha256, key: input.idempotency_key }),
    filters: { task_ids: authority.manifest.slots.map(slot => slot.task_id) },
    admission_policy: policy,
    before_acquire: offer => requireMember(offer.task_id),
    accept_acquired: result => {
      try {
        validateHandoff(result);
        acceptedFresh = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const work = result.envelope;
        try {
          const deps = processSprintDependencies(root);
          // releaseSprintCommand invokes this read under its existing Task lock; check/release races close only for cooperating Lease writers holding that Task lock.
          const released = releaseSprintCommand({ claimId: work.claim_id }, { ...deps, coordination: { ...deps.coordination,
            readLease: taskId => {
              const live = deps.coordination.readLease(taskId);
              const lease = live.record;
              if (live.classification === 'unknown' || taskId !== work.task_id || !lease
                || lease.claim_id !== work.claim_id || lease.generation !== work.generation || lease.state !== 'bound'
                || lease.execution_worktree !== work.worktree_path || lease.branch !== work.branch || lease.unit_ref !== work.unit_ref) {
                throw new Error('own Lease no longer matches the exact acquired handoff');
              }
              const actor = readClaimActorReceipt(root, work.task_id, work.claim_id);
              if (!actor || canonicalMessageBytes({ ...actor }) !== canonicalMessageBytes({ ...result.receipt })
                || actor.repository_id !== principal.repository_id || actor.engineer_id !== principal.engineer_id
                || actor.binding_id !== principal.binding_id || actor.binding_generation !== principal.binding_generation
                || actor.engineer_contract_revision !== principal.engineer_contract_revision || actor.lease_generation !== work.generation) {
                throw new Error('own ClaimActor proof no longer matches the authenticated acquisition');
              }
              return live;
            },
          } });
          if (released.exitCode !== 0) throw new Error(released.stderr || released.stdout);
        } catch (rollbackError) {
          return { ok: false, error: 'rollback_failed', message: `${message}; own-claim release failed: ${String(rollbackError)}; residual worktree: ${work.worktree_path}` };
        }
        return { ok: false, error: 'claim_actor_receipt_failed', message };
      }
    }
  };
  const request = buildAcquisitionRequestIdentity(acquisitionOptions);
  const acquired = budgetedAcquisition(input, intent, request, () => {
    const result = acquire(acquisitionOptions);
    if (result.ok && !acceptedFresh) throw new CampaignPlanningError('human_attention_required', 'unbudgeted acquisition replay requires reconciliation');
    return result;
  }, ports);
  if ('admission_busy' in acquired) return { action: 'idle' as const, reason: 'campaign acquisition admission lock is occupied' };
  if (!acquired.ok) {
    const fleet = acquired.error === 'fleet_acquire_failed' ? acquired.fleet : undefined;
    if (acquired.error === 'engineer_no_eligible_offer' || fleet && !fleet.ok && fleet.error === 'fleet_acquire_failed' && fleet.fleet?.error === 'no_eligible_task') return { action: 'idle' as const, reason: 'no eligible campaign task or campaign capacity is occupied' };
    return acquired;
  }
  // A replay may already be running in a worker; reject stale authority without releasing it.
  validateHandoff(acquired);
  return {
    action: 'dispatch' as const, envelope: acquired.envelope, receipt: acquired.receipt,
    worker_handoff: createCampaignWorkerHandoff(input, acquired),
    instructions: [
      'The local parent host starts the acquired worker through contract-run run --campaign-handoff <selector-json-file>; save worker_handoff as that selector. The selector only names the stored handoff.',
      'Use the envelope worktree and contract allowed_paths; preserve the admitted repair scope. Stop when claim authority is lost.',
      'Use the existing contract-worktree and ship-worktrees workflow for verification and manual publication. These instructions do not create task ownership.',
    ],
  };
}
