import { readOarObservation, oarObservationFile } from '../terminal/task-runtime-observation';
import type { PrePromptInboxAccepted } from './pre-prompt-inbox-consumer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderTaskMessageUntrustedContext, type TaskMessageEventV2 } from '../../core/fleet/admitted-task-message';
import { deliverTaskInbox, listTaskInbox, readTaskMessageDelivery, readAdmittedTaskActivity, type TaskInboxSessionSource } from '../fleet/task-inbox';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { readTaskAgent } from '../terminal/task-session-reader';
import { readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import type { TaskRequest, TaskPrePromptInbox } from '../terminal/task-session';
import type { NativeTaskSessionBinding } from '../terminal/native-task-session';
import { canonical, digest, MAX_AGE_MS, requestSubject, assertCurrent, assertCompanionRequestIdentity, type Companion } from './pre-prompt-inbox-consumer';
/** Controller-only reservation. No delivery receipt is written before actual prompt acceptance. */
export function preparePrePromptInbox(input: { source: TaskInboxSessionSource; request: TaskRequest; now?: number }): TaskPrePromptInbox {
  const { source, request } = input, now = input.now ?? Date.now();
  if (!/^[0-9a-f]{64}$/.test(request.task)) return { status: 'unsupported', reason: 'historical_task_label' };
  const repo_root = source.authority.source.repoRoot;
  const { dir, binding } = readTaskAgent(repo_root, request.task, request.role);
  const finalPath = join(dir, `inbox-${request.round}.json`), intentPath = join(dir, `inbox-intent-${request.round}.json`);
  const active = observeActiveReviewAdmission(source.authority.source);
  if (active.admission.admission_sha256 !== request.task_admission?.approval.admission_sha256
    || active.grant_sha256 !== request.task_admission.approval.grant_sha256) throw new Error('pre_prompt_inbox_approval_changed');
  const recipient = { kind: 'claim' as const, claim: source.authority.claim };
  const inbox = { repo_root, execution_worktree: binding.execution_root, task_id: request.task, source, recipient };
  if (!existsSync(intentPath)) {
    const events: TaskMessageEventV2[] = [];
    for (const entry of listTaskInbox(inbox).entries) {
      if (entry.globally_satisfied || entry.receipt && entry.receipt.delivery_state !== 'pending') continue;
      if (events.length >= 8 || Buffer.byteLength(renderTaskMessageUntrustedContext([...events, entry.event])) > 16_384) break;
      events.push(entry.event);
    }
    const native = readSessionArtifact<NativeTaskSessionBinding>(join(dir, 'native-session.json'));
    const authority = source.authority.source;
    const value: Companion = { protocol: 1, request_id: request.request_id, request_digest: digest(requestSubject(request)), native,
      expires_at: now + MAX_AGE_MS, admission_sha256: active.admission.admission_sha256,
      local_approval: { repoRoot: authority.repoRoot, authorityHome: authority.authorityHome,
        repository_id: active.admission.repository_id, issue_id: active.admission.issue_id, campaign_id: active.admission.campaign_id,
        expectedGrantSha256: active.grant_sha256, expectedPolicySha256: active.admission.policy.policy_sha256,
        expectedActor: active.admission.actor_id, expectedGoal: active.admission.goal }, events };
    assertCurrent(value, request, now);
    writeSessionArtifact(intentPath, value);
  }
  const intent = readSessionArtifact<Companion>(intentPath);
  assertCurrent(intent, request, now);
  const companion = intent;
  assertCurrent(companion, request, Date.now());
  if (!existsSync(finalPath)) writeSessionArtifact(finalPath, companion);
  if (canonical(readSessionArtifact(finalPath)) !== canonical(companion)) throw new Error('pre_prompt_inbox_companion_changed');
  return { status: 'bound', path: finalPath, sha256: digest(companion) };
}

/** Commit the existing inbox ledger only after exact positive host acceptance proof.
 * Missing/unknown send is pending. Recovery repeats this function, never the prompt. */
export function commitPrePromptInbox(input: { source: TaskInboxSessionSource; request: TaskRequest }) {
  const { source, request } = input, ref = request.pre_prompt_inbox;
  if (!ref || ref.status === 'unsupported') return { status: 'unsupported' as const };
  const repo_root = source.authority.source.repoRoot;
  const { dir, binding } = readTaskAgent(repo_root, request.task, request.role);
  if (ref.path !== join(dir, `inbox-${request.round}.json`)) throw new Error('pre_prompt_inbox_path_mismatch');
  const receiptPath = join(dir, `inbox-accepted-${request.round}.json`);
  if (!existsSync(receiptPath)) return { status: 'pending' as const };
  const receipt = readSessionArtifact<PrePromptInboxAccepted>(receiptPath);
  const companion = readSessionArtifact<Companion>(ref.path);
  const published = readSessionArtifact<TaskRequest>(join(dir, `request-${request.round}.json`));
  const started = readSessionArtifact<{request_id: string; provider: unknown}>(join(dir, `started-${request.round}.json`));
  const observation = readOarObservation(join(dir, oarObservationFile(request.round)), request, binding.provider);
  if (canonical(published) !== canonical(request) || started.request_id !== request.request_id
    || canonical(started.provider) !== canonical(binding.provider)
    || receipt.protocol !== 1 || receipt.kind !== 'repo-harness-pre-prompt-accepted'
    || receipt.request_id !== request.request_id || receipt.companion_sha256 !== ref.sha256 || digest(companion) !== ref.sha256
    || receipt.native_session_id !== companion.native.native_session_id || receipt.host !== companion.native.host
    || canonical(receipt.provider) !== canonical({pid: binding.provider.pid, identity: binding.provider.identity})
    || !Number.isSafeInteger(receipt.consumed_at) || !Number.isSafeInteger(receipt.accepted_at)
    || receipt.accepted_at < receipt.consumed_at || receipt.accepted_at > Date.now()
    || !Number.isSafeInteger(receipt.observation_seq) || !observation || observation.control !== 'accepted'
    || observation.session_id !== receipt.native_session_id || observation.input_id !== request.request_id
    || observation.seq < receipt.observation_seq) throw new Error('pre_prompt_inbox_acceptance_mismatch');
  // Settled delivery is historical evidence, not a request to act under its old
  // grant again. Verify the exact accepted context and ledger before bypassing
  // current authority; missing/partial evidence still takes the original fence.
  assertCompanionRequestIdentity(companion, request, receipt.consumed_at);
  if (digest(binding) !== companion.native.session_binding_sha256
    || canonical(readSessionArtifact(join(dir, 'native-session.json'))) !== canonical(companion.native)) throw new Error('pre_prompt_inbox_session_changed');
  const exactRef = `controlled-request:${request.request_id}:${request.session_binding_sha256}`;
  const settled = companion.events.every(event => {
    const history = readAdmittedTaskActivity({ repo_root, task_id: request.task, limit: 1, after: null, message_id: event.message_id,
      budget: { max_scan: 200, max_bytes: 512 * 1024, deadline_ms: 1000 } });
    if (!history.coverage.complete || history.entries.length !== 1) return false;
    const entry = history.entries[0]!;
    return canonical(entry.event) === canonical(event) && entry.receipts.some(record =>
      record.delivery_channel === 'controlled_request' && record.delivery_ref === exactRef
      && record.recipient_kind === 'claim' && canonical(record.recipient_claim) === canonical(request.task_admission!.identity.claim)
      && record.recipient_admission_sha256 === companion.admission_sha256
      && record.delivered_at === new Date(receipt.accepted_at).toISOString()
      && ['delivered', 'acknowledged'].includes(record.delivery_state));
  });
  if (settled) return { status: 'committed' as const };
  // Expiry bounds the actual read, not later owner recovery. Current local approval
  // and immutable binding still fence recovery, and deliver reobserves provider authority.
  assertCurrent(companion, request, receipt.consumed_at);
  const inbox = { repo_root, execution_worktree: binding.execution_root, task_id: request.task, source, recipient: { kind: 'claim' as const, claim: source.authority.claim } };
  const delivery_ref = `controlled-request:${request.request_id}:${request.session_binding_sha256}`;
  for (const event of companion.events) {
    if (canonical(readTaskMessageDelivery({ ...inbox, message_id: event.message_id }).event) !== canonical(event)) throw new Error('pre_prompt_inbox_event_changed');
    deliverTaskInbox({ ...inbox, delivery_channel: 'controlled_request', delivery_ref,
      message_id: event.message_id, delivered_at: new Date(receipt.accepted_at).toISOString() });
    const current = readTaskMessageDelivery({ ...inbox, message_id: event.message_id });
    if (current.receipt?.delivery_channel !== 'controlled_request' || current.receipt.delivery_ref !== delivery_ref
      || !['delivered', 'acknowledged'].includes(current.receipt.delivery_state)) throw new Error('pre_prompt_inbox_receipt_conflict');
  }
  return { status: 'committed' as const };
}
