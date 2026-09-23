import { createHash } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import {
  decodeOperatorAutomationSummary, decodeAutomationGrant, decodeAutomationBudget,
  decodeAutomationController, decodeAutomationCampaign,
  type AutomationSource, type OperatorAutomationSummary,
} from '../../core/operator/automation-summary';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readDevelopmentCampaignPolicy } from '../automation/development-campaign-policy';
import { listStoredProgramAuthorizations, readStoredProgramAuthorization } from '../automation/grant-store';
import { listAutomationBudgetRuns, readAutomationBudgetBoardSlice } from '../automation/budget-store';
import { listAutomationControllerRuns, readAutomationControllerHeadEvent, readAutomationControllerStatus } from '../automation/controller-store';
import { readDevelopmentCampaignStatus } from '../automation/development-campaign-store';
import { storedPlanningIntents } from '../automation/campaign-planning-store';
import { readCampaignStepReceipts } from '../automation/campaign-step';

export const automationSummaryReaders = {
  registry: readRepoHarnessRegistryStrictSnapshot, policy: readDevelopmentCampaignPolicy,
  grant_ids: listStoredProgramAuthorizations, grant: readStoredProgramAuthorization,
  budget_ids: listAutomationBudgetRuns, budget: readAutomationBudgetBoardSlice,
  controllers: listAutomationControllerRuns, controller: readAutomationControllerStatus, head: readAutomationControllerHeadEvent,
  campaign: readDevelopmentCampaignStatus, intents: storedPlanningIntents, receipts: readCampaignStepReceipts,
};
export interface AutomationSummaryReadInput { readonly repository_id: string; readonly registry_revision?: string; readonly env?: NodeJS.ProcessEnv }
class SourceReadError extends Error {
  constructor(readonly reason: 'source_changed' | 'limit_exceeded') { super(reason); }
}
const same = (left: unknown, right: unknown): void => { if (JSON.stringify(left) !== JSON.stringify(right)) throw new SourceReadError('source_changed'); };
function bounded<T>(rows: readonly T[]): readonly T[] { if (rows.length > 64) throw new SourceReadError('limit_exceeded'); return rows; }
const check = (condition: boolean): void => { if (!condition) throw new Error('source identity differs'); };

/** Read original authority only. No lock, provider, controller step or projection write. */
export function readOperatorAutomationSummary(input: AutomationSummaryReadInput, readers = automationSummaryReaders): OperatorAutomationSummary {
  const observedAt = new Date().toISOString();
  const before = readers.registry({ env: input.env, adoptedOnly: false });
  if (input.registry_revision !== undefined) same(before.registryRevision, input.registry_revision);
  const repo = before.repos.find((entry) => entry.id === input.repository_id);
  if (!repo || !lstatSync(repo.path).isDirectory() || lstatSync(repo.path).isSymbolicLink()) throw new Error('automation repository unavailable');
  const root = realpathSync(repo.path);
  const observe = <T>(read: () => readonly T[]): AutomationSource<T> => {
    const sourceObservedAt = new Date().toISOString();
    try {
      const records = bounded(read());
      return { status: records.length ? 'known' : 'missing', observed_at: sourceObservedAt, reason: null, records };
    } catch (error) {
      return { status: 'unavailable', observed_at: sourceObservedAt, reason: error instanceof SourceReadError ? error.reason : 'source_unavailable', records: [] };
    }
  };
  const policy = observe(() => {
    const value = readers.policy(root);
    same(value, readers.policy(root));
    return [{ mode: value.mode, source_ref: 'registered_worktree_policy' as const, policy_sha256: createHash('sha256').update(JSON.stringify(value)).digest('hex') }];
  });
  const grants = observe(() => {
    const ids = bounded(readers.grant_ids(root, input.env));
    const records = ids.map((sha) => {
      const g = readers.grant(root, sha, input.env);
      check(g.repository_id === repo.id && g.authorization_sha256 === sha);
      return decodeAutomationGrant({ authorization_id: g.authorization_id, authorization_sha256: g.authorization_sha256,
        target_ref: g.target_ref, target_revision: g.target_revision, allowed_work_package_ids: g.allowed_work_package_ids,
        contract_scope: g.contract_scope, contract_path: g.contract_path, merge_mode: g.merge_mode,
        issued_at: g.issued_at, expires_at: g.expires_at, campaign_id: g.campaign?.campaign_id ?? null });
    });
    same(ids, readers.grant_ids(root, input.env)); return records;
  });
  const budgets = observe(() => {
    const ids = bounded(readers.budget_ids(root));
    const records = ids.map((runId) => {
      const b = readers.budget(root, runId, input.env);
      check(b.repository_id === repo.id && b.automation_run_id === runId);
      const next = readers.budget(root, runId, input.env);
      same([b.budget_sha256,b.ledger_sha256,b.event_count,b.state,b.stop_receipt?.stop_receipt_sha256],
        [next.budget_sha256,next.ledger_sha256,next.event_count,next.state,next.stop_receipt?.stop_receipt_sha256]);
      return decodeAutomationBudget({ automation_run_id: b.automation_run_id, budget_sha256: b.budget_sha256, budget_revision: b.budget_revision,
        state: b.state, deadline_at: b.deadline_at, ledger_sha256: b.ledger_sha256, slice_sha256: b.slice_sha256,
        event_count: b.event_count, last_completed_step_index: b.last_completed_step_index, open_reservation_count: b.open_reservation_count,
        projection_stale: b.projection_stale, attention_owner: b.attention_owner, metrics: b.metrics,
        stop_receipt: b.stop_receipt === null ? null : { stop_receipt_sha256: b.stop_receipt.stop_receipt_sha256,
          refusal_code: b.stop_receipt.refusal_code, issued_at: b.stop_receipt.issued_at, triggering_metric: b.stop_receipt.triggering_metric } });
    });
    same(ids, readers.budget_ids(root)); return records;
  });
  const controllers = observe(() => {
    const runs = bounded(readers.controllers(root));
    const records = runs.map(({ run, current }) => {
      const event = readers.head(root, run.run_id);
      check(run.repository_id === repo.id && event.run_id === run.run_id && current.run_sha256 === run.run_sha256
        && event.event_sha256 === current.current_event_sha256 && event.revision === current.revision && event.next_state === current.state);
      same(current, readers.controller(root, run.run_id).current);
      return decodeAutomationController({ run_id: run.run_id, run_sha256: run.run_sha256, budget_sha256: run.budget_sha256,
        current_sha256: current.current_sha256, event_sha256: event.event_sha256, revision: current.revision,
        state: current.state, operation: event.operation, observed_at: event.observed_at, retry_at: event.retry_at,
        source_attention_owner: event.attention_owner, typed_reason_status: event.blocker === null ? 'missing' : 'unavailable',
        task_id: event.receipt.task_id, claim_id: event.receipt.claim_id, dispatch_id: event.receipt.dispatch_id, runtime_effect_id: event.receipt.runtime_effect_id });
    });
    same(runs.map(r=>r.current.current_sha256), readers.controllers(root).map(r=>r.current.current_sha256));
    return records;
  });
  const campaigns = observe(() => {
    if (grants.status === 'unavailable') throw new Error('grant discovery unavailable');
    const intents = bounded(readers.intents(root));
    for (const intent of intents) check(intent.repository_id === repo.id);
    const ids = bounded([...new Set([...grants.records.flatMap(g=>g.campaign_id === null ? [] : [g.campaign_id]), ...intents.map(i=>i.campaign_id)])].sort());
    const records = ids.map((campaignId) => {
      let stored: ReturnType<typeof readers.campaign>;
      try { stored = readers.campaign(root, campaignId, input.env); }
      catch (error) {
        if ((error as {code?: unknown})?.code === 'campaign_not_found') return null;
        throw error;
      }
      const { campaign, current, events } = stored;
      const grant = grants.records.find(g=>g.authorization_sha256 === campaign.authorization_sha256);
      check(campaign.repository_id === repo.id && campaign.campaign_id === campaignId && grant !== undefined
        && grant.authorization_id === campaign.authorization_id && grant.campaign_id === campaignId
        && grant.target_ref === campaign.target_ref && grant.target_revision === campaign.target_revision);
      const event = events.at(-1);
      check(event !== undefined && event.event_sha256 === current.current_event_sha256 && event.revision === current.revision);
      const groupDecisions = intents.filter(i=>i.campaign_id === campaignId).map((intent) => {
        check(intent.target_ref === campaign.target_ref);
        const selected = { repo_root: root, campaign_id: campaignId, group_number: intent.group_number, intent_sha256: intent.intent_sha256 };
        const receipts = bounded(readers.receipts(selected));
        same(receipts, readers.receipts(selected));
        const ordered = [...receipts].sort((a,b)=>a.observed_at.localeCompare(b.observed_at));
        const last = ordered.at(-1), prior = ordered.at(-2);
        if (last && prior && last.observed_at === prior.observed_at && last.step_receipt_sha256 !== prior.step_receipt_sha256) throw new Error('decision order unavailable');
        return { group_number: intent.group_number, intent_sha256: intent.intent_sha256,
          last_decision: last === undefined ? null : { receipt_sha256: last.step_receipt_sha256, action: last.action,
            outcome: last.outcome, observed_at: last.observed_at, next_check_at: last.next_check_at } };
      });
      same(current, readers.campaign(root, campaignId, input.env).current);
      return decodeAutomationCampaign({ campaign_id: campaignId, campaign_sha256: campaign.campaign_sha256,
        authorization_sha256: campaign.authorization_sha256, current_sha256: current.current_sha256, event_sha256: event!.event_sha256,
        revision: current.revision, state: current.state, operation: event!.operation, observed_at: event!.observed_at,
        typed_reason_status: 'unavailable', source_attention_owner: 'unavailable', group_decisions: groupDecisions });
    });
    same(intents.map(i=>i.intent_sha256), readers.intents(root).map(i=>i.intent_sha256));
    return records.filter((record): record is NonNullable<typeof record> => record !== null);
  });
  const after = readers.registry({ env: input.env, adoptedOnly: false });
  same(before.registryRevision, after.registryRevision);
  same(root, realpathSync(after.repos.find(entry=>entry.id === repo.id)!.path));
  return decodeOperatorAutomationSummary({ protocol: 1, repository_id: repo.id, consistency: 'observed', observed_at: observedAt,
    policy, grants, budgets, controllers, campaigns,
    native_execution: { status: 'unavailable', reason: 'native_admission_authority_unavailable', turn_ref: null },
  }, repo.id);
}
