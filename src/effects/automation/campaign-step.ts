import { execFileSync } from 'child_process';
import { resolve } from 'path';

import { canonicalMessageBytes, canonicalMessageDigest } from '../../core/messages/mechanics';
import {
  reconcileIssueBatchSlots,
  type IssueBatchReconciliationV1,
  type IssueBatchReconciledSlotV1,
} from '../../core/automation/issue-batch-reconcile';
import type { IssueBatchIntentV1, IssueBatchSlot } from '../../core/automation/issue-batch';
import type { ProviderIssueObservationV1 } from '../../core/external-sources/issue-observation';
import type { GithubCommandResult } from '../external-sources/github';
import { listProviderIssueObservations } from '../external-sources/store';
import { prepareIssueBatchAuthoringContinuation, type IssueAuthoringBrowserResult, type IssueAuthoringDependencies } from './gpt-pro-issue-authoring';
import { readCampaignExternalSourcesPolicyAtRevision } from './development-campaign-policy';
import { requireManualGithubPolicy } from '../external-sources/policy';
import {
  listIssueAuthoringSessions,
  listIssueBatchJournalRecords,
  persistIssueBatchJournalRecord,
  readIssueBatchIntent,
} from './issue-batch-store';
import { IssueBatchObserverError, observeIssueBatch, requireIssueBatchAuthority, type IssueBatchObservationSnapshotV1, type ObserveIssueBatchInput } from './issue-batch-observer';
import { withDevelopmentCampaignLock } from './development-campaign-store';

const STEP_KIND = 'repo-harness-campaign-heartbeat-step' as const;
const RESERVATION_KIND = 'repo-harness-campaign-provider-mutation-reservation' as const;
const RESULT_KIND = 'repo-harness-campaign-provider-mutation-result' as const;
const NEXT_CHECK_DELAY_MS = 60_000;

export type CampaignStepAction =
  | 'idle'
  | 'observe'
  | 'fill_missing'
  | 'edit_issue'
  | 'comment_unexpected'
  | 'close_unexpected'
  | 'campaign_no_progress'
  | 'reconciliation_required';

type MutationAction = Extract<CampaignStepAction, 'fill_missing' | 'edit_issue' | 'comment_unexpected' | 'close_unexpected'>;

export interface CampaignMutationReservationV1 {
  readonly protocol: 1;
  readonly kind: typeof RESERVATION_KIND;
  readonly campaign_id: string;
  readonly group_number: number;
  readonly intent_sha256: string;
  readonly idempotency_key: string;
  readonly action: MutationAction;
  readonly requested_slots: readonly IssueBatchSlot[];
  readonly provider_issue_id: string | null;
  readonly source_session_ref: string | null;
  readonly expected_journal_sha256: string;
  readonly snapshot_receipt_sha256: string;
  readonly reconciliation: IssueBatchReconciliationV1;
  readonly reserved_at: string;
  readonly reservation_sha256: string;
}

export interface CampaignMutationResultV1 {
  readonly protocol: 1;
  readonly kind: typeof RESULT_KIND;
  readonly reservation_sha256: string;
  readonly action: MutationAction;
  readonly provider_issue_id: string | null;
  readonly requested_slots: readonly IssueBatchSlot[];
  readonly outcome: 'completed' | 'no_progress';
  readonly evidence_refs: readonly string[];
  readonly completed_at: string;
  readonly result_sha256: string;
}

export interface CampaignStepReceiptV1 {
  readonly protocol: 1;
  readonly kind: typeof STEP_KIND;
  readonly campaign_id: string;
  readonly group_number: number;
  readonly intent_sha256: string;
  readonly idempotency_key: string;
  readonly action: CampaignStepAction;
  readonly outcome: 'idle' | 'progress' | 'no_progress' | 'reconciliation_required';
  readonly observed_at: string;
  readonly next_check_at: string | null;
  readonly snapshot_receipt_sha256: string | null;
  readonly reconciliation: IssueBatchReconciliationV1 | null;
  readonly mutation_reservation_sha256: string | null;
  readonly evidence_refs: readonly string[];
  readonly step_receipt_sha256: string;
}

export interface RunCampaignStepInput {
  readonly repo_root: string;
  readonly campaign_id: string;
  readonly group_number: number;
  readonly intent_sha256: string;
  readonly idempotency_key: string;
  readonly env?: NodeJS.ProcessEnv;
}

export interface CampaignStepDependencies {
  readonly now?: () => Date;
  readonly observe?: (input: ObserveIssueBatchInput) => IssueBatchObservationSnapshotV1;
  readonly readBinding: IssueAuthoringDependencies<IssueAuthoringBrowserResult>['readBinding'];
  readonly followup: IssueAuthoringDependencies<IssueAuthoringBrowserResult>['followup'];
  readonly mutate_issue?: (input: { readonly repository: string; readonly issue_number: number; readonly action: 'comment' | 'close'; readonly body: string | null }) => Promise<GithubCommandResult> | GithubCommandResult;
  readonly provider_command?: (args: readonly string[], options: { readonly timeout_ms: number; readonly max_buffer: number }) => GithubCommandResult;
}

export interface CampaignStepResultV1 {
  readonly intent: IssueBatchIntentV1;
  readonly step_receipt: CampaignStepReceiptV1;
  readonly reconciliation: IssueBatchReconciliationV1 | null;
}

export type CampaignStepErrorCode =
  | 'campaign_step_invalid'
  | 'campaign_no_progress'
  | 'campaign_reconciliation_required'
  | 'source_main_stale'
  | 'campaign_step_mutation_failed';

export class CampaignStepError extends Error {
  constructor(readonly code: CampaignStepErrorCode, message: string, readonly receipt: CampaignStepReceiptV1 | null = null, readonly cause?: unknown) {
    super(message);
    this.name = 'CampaignStepError';
  }
}

function stepAuthority(input: RunCampaignStepInput, intent: IssueBatchIntentV1, now: Date) {
  try { return requireIssueBatchAuthority({ repo_root: input.repo_root, intent, env: input.env, now }); }
  catch (error) {
    if (error instanceof IssueBatchObserverError) {
      const code: CampaignStepErrorCode = error.code === 'campaign_no_progress' ? 'campaign_no_progress'
        : error.code === 'source_main_stale' ? 'source_main_stale' : 'campaign_step_invalid';
      throw new CampaignStepError(code, error.message, null, error);
    }
    throw error;
  }
}

function digestRecord<T extends Record<string, unknown>>(basis: T, field: string): T & Record<string, string> {
  return Object.freeze({ ...basis, [field]: canonicalMessageDigest(basis) });
}
function canonical(value: Record<string, unknown>): string { return `${canonicalMessageBytes(value)}\n`; }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CampaignStepError('campaign_reconciliation_required', 'heartbeat journal contains a malformed record');
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) throw new CampaignStepError('campaign_reconciliation_required', `${label} fields are invalid`);
}
function validateDigest(value: Record<string, unknown>, field: string): void {
  const stored = value[field];
  if (typeof stored !== 'string') throw new CampaignStepError('campaign_reconciliation_required', `heartbeat journal record has no ${field}`);
  const { [field]: _digest, ...basis } = value;
  if (canonicalMessageDigest(basis) !== stored) throw new CampaignStepError('campaign_reconciliation_required', `heartbeat journal ${field} is stale`);
}
const MUTATION_ACTIONS: readonly MutationAction[] = ['fill_missing', 'edit_issue', 'comment_unexpected', 'close_unexpected'];
const STEP_ACTIONS: readonly CampaignStepAction[] = ['idle', 'observe', ...MUTATION_ACTIONS, 'campaign_no_progress', 'reconciliation_required'];
function sha(value: unknown): value is string { return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value); }
function timestamp(value: unknown): value is string { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function nullableString(value: unknown): boolean { return value === null || typeof value === 'string'; }
function stringArray(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every((entry) => typeof entry === 'string'); }
function slotArray(value: unknown): value is readonly IssueBatchSlot[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && /^(?:0[1-9]|10)$/u.test(entry))
    && new Set(value).size === value.length && JSON.stringify(value) === JSON.stringify([...value].sort());
}
function validateReconciliation(value: unknown, intentSha256: string, snapshotReceiptSha256: string): value is IssueBatchReconciliationV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!sha(candidate.reconciliation_sha256)) return false;
  const { reconciliation_sha256: _digest, ...basis } = candidate;
  return canonicalMessageDigest(basis) === candidate.reconciliation_sha256 && candidate.intent_sha256 === intentSha256 && candidate.snapshot_receipt_sha256 === snapshotReceiptSha256;
}
function reservations(input: RunCampaignStepInput): readonly CampaignMutationReservationV1[] {
  return listIssueBatchJournalRecords(input.repo_root, input.campaign_id, input.group_number, 'reservations').map((entry) => {
    const value = record(entry); validateDigest(value, 'reservation_sha256');
    exact(value, ['protocol', 'kind', 'campaign_id', 'group_number', 'intent_sha256', 'idempotency_key', 'action', 'requested_slots', 'provider_issue_id', 'source_session_ref', 'expected_journal_sha256', 'snapshot_receipt_sha256', 'reconciliation', 'reserved_at', 'reservation_sha256'], 'provider mutation reservation');
    const action = value.action as MutationAction;
    if (value.protocol !== 1 || value.kind !== RESERVATION_KIND || value.campaign_id !== input.campaign_id || value.group_number !== input.group_number || value.intent_sha256 !== input.intent_sha256
      || typeof value.idempotency_key !== 'string' || !MUTATION_ACTIONS.includes(action) || !slotArray(value.requested_slots) || !nullableString(value.provider_issue_id) || !nullableString(value.source_session_ref)
      || !sha(value.expected_journal_sha256) || !sha(value.snapshot_receipt_sha256) || !timestamp(value.reserved_at)
      || !validateReconciliation(value.reconciliation, input.intent_sha256, value.snapshot_receipt_sha256)
      || ((action === 'fill_missing') !== (value.requested_slots.length > 0 && value.provider_issue_id === null && typeof value.source_session_ref === 'string'))
      || (action === 'edit_issue' && (value.requested_slots.length !== 1 || typeof value.provider_issue_id !== 'string' || typeof value.source_session_ref !== 'string'))
      || ((action === 'comment_unexpected' || action === 'close_unexpected') && (value.requested_slots.length !== 0 || typeof value.provider_issue_id !== 'string' || value.source_session_ref !== null))) {
      throw new CampaignStepError('campaign_reconciliation_required', 'provider mutation reservation binding is invalid');
    }
    return value as unknown as CampaignMutationReservationV1;
  });
}
function results(input: RunCampaignStepInput): readonly CampaignMutationResultV1[] {
  return listIssueBatchJournalRecords(input.repo_root, input.campaign_id, input.group_number, 'results').map((entry) => {
    const value = record(entry); validateDigest(value, 'result_sha256');
    exact(value, ['protocol', 'kind', 'reservation_sha256', 'action', 'provider_issue_id', 'requested_slots', 'outcome', 'evidence_refs', 'completed_at', 'result_sha256'], 'provider mutation result');
    if (value.protocol !== 1 || value.kind !== RESULT_KIND || !sha(value.reservation_sha256) || !MUTATION_ACTIONS.includes(value.action as MutationAction) || !nullableString(value.provider_issue_id)
      || !slotArray(value.requested_slots) || !['completed', 'no_progress'].includes(String(value.outcome))
      || !stringArray(value.evidence_refs) || !timestamp(value.completed_at)) throw new CampaignStepError('campaign_reconciliation_required', 'provider mutation result is invalid');
    return value as unknown as CampaignMutationResultV1;
  });
}
function receipts(input: RunCampaignStepInput): readonly CampaignStepReceiptV1[] {
  return listIssueBatchJournalRecords(input.repo_root, input.campaign_id, input.group_number, 'receipts').map((entry) => {
    const value = record(entry); validateDigest(value, 'step_receipt_sha256');
    exact(value, ['protocol', 'kind', 'campaign_id', 'group_number', 'intent_sha256', 'idempotency_key', 'action', 'outcome', 'observed_at', 'next_check_at', 'snapshot_receipt_sha256', 'reconciliation', 'mutation_reservation_sha256', 'evidence_refs', 'step_receipt_sha256'], 'campaign step receipt');
    const action = value.action as CampaignStepAction;
    const outcome = value.outcome;
    const snapshotSha = value.snapshot_receipt_sha256;
    const reconciliationValid = value.reconciliation === null ? snapshotSha === null : sha(snapshotSha) && validateReconciliation(value.reconciliation, input.intent_sha256, snapshotSha);
    if (value.protocol !== 1 || value.kind !== STEP_KIND || value.campaign_id !== input.campaign_id || value.group_number !== input.group_number || value.intent_sha256 !== input.intent_sha256
      || typeof value.idempotency_key !== 'string' || !STEP_ACTIONS.includes(action) || !['idle', 'progress', 'no_progress', 'reconciliation_required'].includes(String(outcome))
      || !timestamp(value.observed_at) || !(value.next_check_at === null || timestamp(value.next_check_at)) || !(snapshotSha === null || sha(snapshotSha))
      || !reconciliationValid || !(value.mutation_reservation_sha256 === null || sha(value.mutation_reservation_sha256)) || !stringArray(value.evidence_refs)
      || (action === 'idle' && outcome !== 'idle') || (action === 'reconciliation_required' && outcome !== 'reconciliation_required')
      || (action === 'campaign_no_progress' && outcome !== 'no_progress')
      || (MUTATION_ACTIONS.includes(action as MutationAction) && !sha(value.mutation_reservation_sha256))) {
      throw new CampaignStepError('campaign_reconciliation_required', 'campaign step receipt binding is invalid');
    }
    return value as unknown as CampaignStepReceiptV1;
  });
}

function persistReceipt(input: RunCampaignStepInput, basis: Omit<CampaignStepReceiptV1, 'protocol' | 'kind' | 'campaign_id' | 'group_number' | 'intent_sha256' | 'idempotency_key' | 'step_receipt_sha256'>): CampaignStepReceiptV1 {
  const receipt = digestRecord({
    protocol: 1 as const, kind: STEP_KIND, campaign_id: input.campaign_id, group_number: input.group_number,
    intent_sha256: input.intent_sha256, idempotency_key: input.idempotency_key, ...basis,
  }, 'step_receipt_sha256') as unknown as CampaignStepReceiptV1;
  return withDevelopmentCampaignLock(input.repo_root, input.campaign_id, () => {
    const replay = receipts(input).find((entry) => entry.idempotency_key === input.idempotency_key);
    if (replay) return replay;
    const reservation = reservations(input).find((entry) => entry.idempotency_key === input.idempotency_key);
    if (reservation) {
      const result = results(input).find((entry) => entry.reservation_sha256 === reservation.reservation_sha256);
      if (!result || basis.mutation_reservation_sha256 !== reservation.reservation_sha256) {
        throw new CampaignStepError('campaign_reconciliation_required', 'idempotency key names a provider mutation that has no matching durable result');
      }
    }
    persistIssueBatchJournalRecord(input.repo_root, input.campaign_id, input.group_number, 'receipts', receipt.step_receipt_sha256, canonical(receipt as unknown as Record<string, unknown>));
    return receipt;
  });
}

interface CampaignJournalSnapshot {
  readonly reservations: readonly CampaignMutationReservationV1[];
  readonly results: readonly CampaignMutationResultV1[];
  readonly receipts: readonly CampaignStepReceiptV1[];
  readonly journal_sha256: string;
}

function journalSha256(
  storedReservations: readonly CampaignMutationReservationV1[],
  storedResults: readonly CampaignMutationResultV1[],
  storedReceipts: readonly CampaignStepReceiptV1[],
): string {
  const refs = [
    ...storedReservations.map((entry) => entry.reservation_sha256),
    ...storedResults.map((entry) => entry.result_sha256),
    ...storedReceipts.map((entry) => entry.step_receipt_sha256),
  ].sort();
  return canonicalMessageDigest({ refs });
}

function campaignJournalSnapshot(input: RunCampaignStepInput): CampaignJournalSnapshot {
  const storedReservations = reservations(input);
  const storedResults = results(input);
  const storedReceipts = receipts(input);
  return Object.freeze({
    reservations: storedReservations,
    results: storedResults,
    receipts: storedReceipts,
    journal_sha256: journalSha256(storedReservations, storedResults, storedReceipts),
  });
}

function readCampaignJournalSnapshot(input: RunCampaignStepInput): CampaignJournalSnapshot {
  return withDevelopmentCampaignLock(input.repo_root, input.campaign_id, () => campaignJournalSnapshot(input));
}

function persistReservation(input: RunCampaignStepInput, intent: IssueBatchIntentV1, action: MutationAction, requestedSlots: readonly IssueBatchSlot[], providerIssueId: string | null, sourceSessionRef: string | null, reservedAt: string, expectedJournalSha256: string, snapshot: IssueBatchObservationSnapshotV1, reconciliation: IssueBatchReconciliationV1, now: () => Date): CampaignMutationReservationV1 {
  return withDevelopmentCampaignLock(input.repo_root, input.campaign_id, () => {
    stepAuthority(input, intent, now());
    const journal = campaignJournalSnapshot(input);
    const storedReservations = journal.reservations; const storedResults = journal.results;
    const unresolved = storedReservations.find((candidate) => !storedResults.some((result) => result.reservation_sha256 === candidate.reservation_sha256));
    if (unresolved) throw new CampaignStepError('campaign_reconciliation_required', `provider mutation ${unresolved.reservation_sha256} has no durable result`);
    const sameKey = storedReservations.find((candidate) => candidate.idempotency_key === input.idempotency_key);
    if (sameKey) {
      if (sameKey.action !== action || sameKey.provider_issue_id !== providerIssueId || JSON.stringify(sameKey.requested_slots) !== JSON.stringify(requestedSlots)) {
        throw new CampaignStepError('campaign_step_invalid', 'idempotency key names another provider mutation');
      }
      throw new CampaignStepError('campaign_reconciliation_required', 'provider mutation reservation appeared after observation; rerun from durable journal state');
    }
    const completedEdit = action === 'edit_issue' && providerIssueId !== null
      ? storedReservations.find((candidate) => candidate.action === 'edit_issue' && candidate.provider_issue_id === providerIssueId
        && storedResults.some((result) => result.reservation_sha256 === candidate.reservation_sha256))
      : undefined;
    if (completedEdit) throw new CampaignStepError('campaign_reconciliation_required', `provider issue ${providerIssueId} already has a completed metadata edit`);
    if (journal.journal_sha256 !== expectedJournalSha256) throw new CampaignStepError('campaign_reconciliation_required', 'campaign group journal changed after provider observation; rerun reconciliation');
    const value = digestRecord({
      protocol: 1 as const, kind: RESERVATION_KIND, campaign_id: input.campaign_id, group_number: input.group_number,
      intent_sha256: input.intent_sha256, idempotency_key: input.idempotency_key, action,
      requested_slots: Object.freeze([...requestedSlots]), provider_issue_id: providerIssueId, source_session_ref: sourceSessionRef, reserved_at: reservedAt,
      expected_journal_sha256: expectedJournalSha256, snapshot_receipt_sha256: snapshot.receipt.receipt_sha256, reconciliation,
    }, 'reservation_sha256') as unknown as CampaignMutationReservationV1;
    persistIssueBatchJournalRecord(input.repo_root, input.campaign_id, input.group_number, 'reservations', value.reservation_sha256, canonical(value as unknown as Record<string, unknown>));
    return value;
  });
}

function persistResult(input: RunCampaignStepInput, reservation: CampaignMutationReservationV1, outcome: CampaignMutationResultV1['outcome'], evidenceRefs: readonly string[], completedAt: string): CampaignMutationResultV1 {
  return withDevelopmentCampaignLock(input.repo_root, input.campaign_id, () => {
    const existing = results(input).find((entry) => entry.reservation_sha256 === reservation.reservation_sha256);
    if (existing) return existing;
    const value = digestRecord({
      protocol: 1 as const, kind: RESULT_KIND, reservation_sha256: reservation.reservation_sha256,
      action: reservation.action, provider_issue_id: reservation.provider_issue_id,
      requested_slots: reservation.requested_slots, outcome, evidence_refs: Object.freeze([...evidenceRefs].sort()), completed_at: completedAt,
    }, 'result_sha256') as unknown as CampaignMutationResultV1;
    persistIssueBatchJournalRecord(input.repo_root, input.campaign_id, input.group_number, 'results', value.result_sha256, canonical(value as unknown as Record<string, unknown>));
    return value;
  });
}

function nextCheck(now: Date): string { return new Date(now.getTime() + NEXT_CHECK_DELAY_MS).toISOString(); }
function issueNumber(observation: ProviderIssueObservationV1, repository: string): number {
  let parsed: URL;
  try { parsed = new URL(observation.url); }
  catch { throw new CampaignStepError('campaign_step_invalid', `provider issue URL is invalid: ${observation.url}`); }
  const escaped = repository.split('/').map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('/');
  const match = parsed.protocol === 'https:' && parsed.hostname === 'github.com' && parsed.port === '' && parsed.username === '' && parsed.password === ''
    && parsed.search === '' && parsed.hash === '' ? parsed.pathname.match(new RegExp(`^/${escaped}/issues/([1-9]\\d*)$`, 'u')) : null;
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isSafeInteger(value) || value < 1) throw new CampaignStepError('campaign_step_invalid', `provider issue URL cannot name a GitHub issue: ${observation.url}`);
  if (observation.display_ref !== `${repository}#${value}`) throw new CampaignStepError('campaign_step_invalid', `provider issue display ref does not match URL number: ${observation.display_ref}`);
  return value;
}
function defaultMutate(input: { readonly repository: string; readonly issue_number: number; readonly action: 'comment' | 'close'; readonly body: string | null }, timeoutMs: number, maxBuffer: number, runner?: CampaignStepDependencies['provider_command']): GithubCommandResult {
  const endpoint = `repos/${input.repository}/issues/${input.issue_number}`;
  const args = input.action === 'comment'
    ? ['api', '--method', 'POST', `${endpoint}/comments`, '-f', `body=${input.body ?? ''}`]
    : ['api', '--method', 'PATCH', endpoint, '-f', 'state=closed', '-f', 'state_reason=not_planned'];
  const stdout = runner
    ? runner(args, { timeout_ms: timeoutMs, max_buffer: maxBuffer }).stdout
    : execFileSync('gh', args, { encoding: 'utf8', timeout: timeoutMs, maxBuffer, stdio: ['ignore', 'pipe', 'pipe'] });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(stdout) as Record<string, unknown>; }
  catch { throw new CampaignStepError('campaign_step_mutation_failed', 'GitHub mutation returned invalid JSON'); }
  const responseUrl = (() => { try { return new URL(String(payload.html_url)); } catch { return null; } })();
  const boundIssueUrl = responseUrl?.protocol === 'https:' && responseUrl.hostname === 'github.com'
    && responseUrl.pathname === `/${input.repository}/issues/${input.issue_number}`;
  if (input.action === 'comment') {
    if (!Number.isSafeInteger(payload.id) || (payload.id as number) < 1) throw new CampaignStepError('campaign_step_mutation_failed', 'GitHub comment response has no immutable id');
    if (!boundIssueUrl || !/^#issuecomment-\d+$/u.test(responseUrl!.hash)) throw new CampaignStepError('campaign_step_mutation_failed', 'GitHub comment response is not bound to the requested issue');
  } else if (!boundIssueUrl || payload.number !== input.issue_number || payload.state !== 'closed' || payload.state_reason !== 'not_planned') {
    throw new CampaignStepError('campaign_step_mutation_failed', 'GitHub close response does not confirm not_planned on the requested issue');
  }
  return { stdout };
}

function latestObservation(snapshot: IssueBatchObservationSnapshotV1, providerIssueId: string): ProviderIssueObservationV1 {
  const value = snapshot.observations.find((entry) => entry.provider_issue_id === providerIssueId);
  if (!value) throw new CampaignStepError('campaign_reconciliation_required', `reconciliation names provider issue ${providerIssueId} outside the snapshot`);
  return value;
}
function slotObservation(reconciliation: IssueBatchReconciliationV1, slot: IssueBatchSlot): IssueBatchReconciledSlotV1 {
  const value = reconciliation.slots.find((entry) => entry.slot === slot);
  if (!value) throw new CampaignStepError('campaign_reconciliation_required', `reconciliation has no slot ${slot}`);
  return value;
}

export async function runCampaignStep(inputValue: RunCampaignStepInput, deps: CampaignStepDependencies): Promise<CampaignStepResultV1> {
  const input = { ...inputValue, repo_root: resolve(inputValue.repo_root) };
  const now = deps.now ?? (() => new Date());
  const observedDate = now(); const observedAt = observedDate.toISOString();
  const intent = readIssueBatchIntent(input.repo_root, input.campaign_id, input.group_number, input.intent_sha256);
  const journal = readCampaignJournalSnapshot(input);
  const replay = journal.receipts.find((entry) => entry.idempotency_key === input.idempotency_key);
  if (replay) return Object.freeze({ intent, step_receipt: replay, reconciliation: replay.reconciliation });

  const storedReservations = journal.reservations; const storedResults = journal.results;
  for (const result of storedResults) {
    const reservation = storedReservations.find((entry) => entry.reservation_sha256 === result.reservation_sha256);
    if (!reservation || reservation.action !== result.action || reservation.provider_issue_id !== result.provider_issue_id || JSON.stringify(reservation.requested_slots) !== JSON.stringify(result.requested_slots)) {
      throw new CampaignStepError('campaign_reconciliation_required', 'provider mutation result does not bind its reservation');
    }
  }
  const unresolved = storedReservations.find((candidate) => !storedResults.some((result) => result.reservation_sha256 === candidate.reservation_sha256));
  if (unresolved) {
    const stepReceipt = persistReceipt(input, {
      action: 'reconciliation_required', outcome: 'reconciliation_required', observed_at: observedAt, next_check_at: null,
      snapshot_receipt_sha256: null, reconciliation: null, mutation_reservation_sha256: unresolved.reservation_sha256,
      evidence_refs: [unresolved.reservation_sha256],
    });
    throw new CampaignStepError('campaign_reconciliation_required', 'a provider mutation has no durable result; reconcile it before retrying', stepReceipt);
  }

  if (observedDate.getTime() >= Date.parse(intent.expires_at)) {
    const stepReceipt = persistReceipt(input, {
      action: 'campaign_no_progress', outcome: 'no_progress', observed_at: observedAt, next_check_at: null,
      snapshot_receipt_sha256: null, reconciliation: null, mutation_reservation_sha256: null, evidence_refs: [intent.intent_sha256],
    });
    return Object.freeze({ intent, step_receipt: stepReceipt, reconciliation: null });
  }

  const authority = stepAuthority(input, intent, observedDate);
  const currentMain = authority.current_main_sha;
  const sessions = listIssueAuthoringSessions(input.repo_root, input.campaign_id, input.group_number, intent.intent_sha256);
  const latestSession = sessions.at(-1) ?? null;
  const priorReceipts = journal.receipts;
  const settled = priorReceipts.some((entry) => entry.action === 'observe' && entry.reconciliation !== null
    && entry.reconciliation.unexpected_issue_ids.length === 0
    && entry.reconciliation.slots.every((slot) => slot.state === 'complete' || slot.state === 'unfilled'));
  const abandoned = sessions.length === 0 || sessions.every((entry) => entry.browser_status === 'dry_run' || entry.browser_status === 'cancelled');
  if (settled || abandoned) {
    const stepReceipt = persistReceipt(input, {
      action: 'idle', outcome: 'idle', observed_at: observedAt, next_check_at: nextCheck(observedDate),
      snapshot_receipt_sha256: null, reconciliation: null, mutation_reservation_sha256: null,
      evidence_refs: settled ? priorReceipts.slice(-1).map((entry) => entry.step_receipt_sha256) : sessions.map((entry) => entry.session_sha256),
    });
    return Object.freeze({ intent, step_receipt: stepReceipt, reconciliation: null });
  }

  const completedReplayReservation = storedReservations.find((entry) => entry.idempotency_key === input.idempotency_key);
  const completedReplayResult = completedReplayReservation ? storedResults.find((entry) => entry.reservation_sha256 === completedReplayReservation.reservation_sha256) : null;
  if (completedReplayReservation && completedReplayResult) {
    const stepReceipt = persistReceipt(input, {
      action: completedReplayReservation.action, outcome: completedReplayResult.outcome === 'completed' ? 'progress' : 'no_progress',
      observed_at: completedReplayReservation.reserved_at, next_check_at: nextCheck(new Date(completedReplayReservation.reserved_at)),
      snapshot_receipt_sha256: completedReplayReservation.snapshot_receipt_sha256, reconciliation: completedReplayReservation.reconciliation,
      mutation_reservation_sha256: completedReplayReservation.reservation_sha256,
      evidence_refs: [completedReplayReservation.snapshot_receipt_sha256, completedReplayReservation.reconciliation.reconciliation_sha256, completedReplayReservation.reservation_sha256, completedReplayResult.result_sha256],
    });
    return Object.freeze({ intent, step_receipt: stepReceipt, reconciliation: completedReplayReservation.reconciliation });
  }
  const expectedJournalSha256 = journal.journal_sha256;
  const snapshot = (deps.observe ?? observeIssueBatch)({ repo_root: input.repo_root, intent, env: input.env, now });
  const currentHashes = new Set(snapshot.observations.map((entry) => entry.observation_sha256));
  const editedIssueIds = storedResults.filter((entry) => entry.action === 'edit_issue' && entry.provider_issue_id !== null).map((entry) => entry.provider_issue_id!);
  const repairBaselines = new Map<string, { readonly observation_sha256: string; readonly observed_at: string }>();
  for (const result of storedResults.filter((entry) => entry.action === 'edit_issue' && entry.provider_issue_id !== null)) {
    const reservation = storedReservations.find((entry) => entry.reservation_sha256 === result.reservation_sha256)!;
    const baselineReceipt = priorReceipts.filter((entry) => entry.reconciliation !== null && entry.snapshot_receipt_sha256 !== reservation.snapshot_receipt_sha256
      && Date.parse(entry.observed_at) >= Date.parse(result.completed_at)).sort((left, right) => left.observed_at.localeCompare(right.observed_at))[0];
    const baselineSlot = baselineReceipt?.reconciliation?.slots.find((slot) => slot.provider_issue_id === result.provider_issue_id && slot.observation_sha256 !== null);
    if (baselineReceipt && baselineSlot?.observation_sha256) repairBaselines.set(result.provider_issue_id!, { observation_sha256: baselineSlot.observation_sha256, observed_at: baselineReceipt.observed_at });
  }
  const authorizedRepairIssueIds = editedIssueIds.filter((issueId) => !repairBaselines.has(issueId));
  const priorObservations = listProviderIssueObservations(input.repo_root).filter((entry) => {
    if (entry.registered_repository_id !== intent.repository_id || currentHashes.has(entry.observation_sha256)) return false;
    const baseline = repairBaselines.get(entry.provider_issue_id);
    return baseline === undefined || entry.observation_sha256 === baseline.observation_sha256 || Date.parse(entry.observed_at) > Date.parse(baseline.observed_at);
  });
  const exhaustedSlots = storedResults.filter((entry) => entry.action === 'edit_issue').flatMap((entry) => entry.requested_slots);
  const reconciliation = reconcileIssueBatchSlots({
    intent, snapshot_receipt: snapshot.receipt, observations: snapshot.observations, prior_observations: priorObservations,
    repaired_issue_ids: authorizedRepairIssueIds, repair_exhausted_slots: exhaustedSlots, current_main_sha: currentMain,
  });

  const completedComments = new Set(storedResults.filter((entry) => entry.action === 'comment_unexpected').map((entry) => entry.provider_issue_id));
  const completedCloses = new Set(storedResults.filter((entry) => entry.action === 'close_unexpected').map((entry) => entry.provider_issue_id));
  const openUnexpected = reconciliation.unexpected_issue_ids.map((id) => latestObservation(snapshot, id)).filter((entry) => entry.state === 'open');
  let action: MutationAction | null = null; let requestedSlots: readonly IssueBatchSlot[] = []; let target: ProviderIssueObservationV1 | null = null;
  if (openUnexpected.length > 0) {
    target = openUnexpected[0]!;
    if (!completedComments.has(target.provider_issue_id)) action = 'comment_unexpected';
    else if (!completedCloses.has(target.provider_issue_id)) action = 'close_unexpected';
  }
  if (action === null && reconciliation.invalid_slots.length > 0) {
    requestedSlots = [reconciliation.invalid_slots[0]!];
    const issueId = slotObservation(reconciliation, requestedSlots[0]!).provider_issue_id;
    if (issueId && !editedIssueIds.includes(issueId)) { action = 'edit_issue'; target = latestObservation(snapshot, issueId); }
  }
  if (action === null && reconciliation.missing_slots.length > 0) {
    action = 'fill_missing'; requestedSlots = reconciliation.missing_slots;
  }

  if (action === null) {
    const complete = reconciliation.slots.every((slot) => slot.state === 'complete') && openUnexpected.length === 0;
    const settledNoProgress = openUnexpected.length === 0 && reconciliation.slots.every((slot) => slot.state === 'complete' || slot.state === 'unfilled');
    const stepReceipt = persistReceipt(input, {
      action: 'observe', outcome: complete ? 'progress' : 'no_progress', observed_at: observedAt,
      next_check_at: complete || settledNoProgress ? null : nextCheck(observedDate), snapshot_receipt_sha256: snapshot.receipt.receipt_sha256,
      reconciliation, mutation_reservation_sha256: null,
      evidence_refs: [snapshot.receipt.receipt_sha256, reconciliation.reconciliation_sha256],
    });
    return Object.freeze({ intent, step_receipt: stepReceipt, reconciliation: stepReceipt.reconciliation });
  }

  const sourceSessionRef = action === 'fill_missing' || action === 'edit_issue' ? latestSession?.session_ref ?? null : null;
  if ((action === 'fill_missing' || action === 'edit_issue') && sourceSessionRef === null) {
    throw new CampaignStepError('campaign_reconciliation_required', 'authoring follow-up requires a durable source session');
  }
  const targetIssueUrl = target?.url ?? null;
  const targetIssueNumber = target === null ? null : issueNumber(target, intent.provider_repository);
  if (action === 'fill_missing' || action === 'edit_issue') stepAuthority(input, intent, now());
  const preparedAuthoring = action === 'fill_missing' || action === 'edit_issue' ? prepareIssueBatchAuthoringContinuation({
        repo_root: input.repo_root, campaign_id: input.campaign_id, group_number: input.group_number,
        intent_sha256: intent.intent_sha256, source_session_ref: sourceSessionRef!, operation: action,
        requested_slots: requestedSlots, provider_issue_id: action === 'edit_issue' ? target!.provider_issue_id : undefined,
        provider_issue_url: action === 'edit_issue' ? targetIssueUrl! : undefined, env: input.env,
      }, { readBinding: deps.readBinding, followup: deps.followup }) : null;
  const reservation = persistReservation(input, intent, action, requestedSlots, target?.provider_issue_id ?? null, sourceSessionRef, observedAt, expectedJournalSha256, snapshot, reconciliation, now);
  let evidenceRefs: readonly string[]; let mutationOutcome: CampaignMutationResultV1['outcome'] = 'completed';
  try {
    if (action === 'fill_missing' || action === 'edit_issue') {
      const authored = await preparedAuthoring!.execute();
      evidenceRefs = [authored.session.session_sha256];
      mutationOutcome = authored.session.browser_status === 'completed' && authored.session.verification === 'verified' ? 'completed' : 'no_progress';
    } else {
      const mutationAction = action === 'comment_unexpected' ? 'comment' : 'close';
      const body = mutationAction === 'comment' ? `repo-harness campaign ${intent.campaign_id} group ${intent.group_number}: this Issue names an undeclared slot and is not planned for adoption.` : null;
      const policy = requireManualGithubPolicy(readCampaignExternalSourcesPolicyAtRevision(input.repo_root, intent.base_main_sha));
      const mutationInput = { repository: intent.provider_repository, issue_number: targetIssueNumber!, action: mutationAction, body } as const;
      const result = deps.mutate_issue ? await deps.mutate_issue(mutationInput) : defaultMutate(mutationInput, policy.github.limits.deadline_ms, policy.github.limits.max_total_bytes + 1, deps.provider_command);
      evidenceRefs = [snapshot.receipt.receipt_sha256, canonicalMessageDigest({ action: mutationAction, stdout: result.stdout })];
    }
  } catch (error) {
    throw new CampaignStepError('campaign_step_mutation_failed', `provider mutation ${reservation.reservation_sha256} has an unknown result and requires reconciliation`, null, error);
  }
  const mutationResult = persistResult(input, reservation, mutationOutcome, evidenceRefs, now().toISOString());
  const stepReceipt = persistReceipt(input, {
    action, outcome: mutationOutcome === 'completed' ? 'progress' : 'no_progress', observed_at: observedAt, next_check_at: nextCheck(observedDate),
    snapshot_receipt_sha256: snapshot.receipt.receipt_sha256, reconciliation,
    mutation_reservation_sha256: reservation.reservation_sha256,
    evidence_refs: [snapshot.receipt.receipt_sha256, reconciliation.reconciliation_sha256, reservation.reservation_sha256, mutationResult.result_sha256],
  });
  return Object.freeze({ intent, step_receipt: stepReceipt, reconciliation });
}
