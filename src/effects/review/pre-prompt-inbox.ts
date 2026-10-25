import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderTaskMessageUntrustedContext, type TaskMessageEventV2 } from '../../core/fleet/admitted-task-message';
import { deliverTaskInbox, listTaskInbox, readTaskMessageDelivery, type TaskInboxSessionSource } from '../fleet/task-inbox';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { readTaskAgent } from '../terminal/task-session-reader';
import { readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import type { TaskRequest, TaskPrePromptInbox } from '../terminal/task-session';
import type { NativeTaskSessionBinding } from '../terminal/native-task-session';
import { canonical, digest, MAX_AGE_MS, requestSubject, assertCurrent, type Companion } from './pre-prompt-inbox-consumer';
/** Controller-only preparation. Provider observation and ledger writes never run in a hook or reviewer. */
export function preparePrePromptInbox(input: { source: TaskInboxSessionSource; request: TaskRequest; now?: number }): TaskPrePromptInbox {
  const { source, request } = input, now = input.now ?? Date.now();
  if (!/^[0-9a-f]{64}$/.test(request.task)) return { status: 'unsupported', reason: 'historical_task_label' };
  const repo_root = source.authority.source.repoRoot;
  const { dir } = readTaskAgent(repo_root, request.task, request.role);
  const finalPath = join(dir, `inbox-${request.round}.json`), intentPath = join(dir, `inbox-intent-${request.round}.json`);
  const active = observeActiveReviewAdmission(source.authority.source);
  if (active.admission.admission_sha256 !== request.task_admission?.approval.admission_sha256
    || active.grant_sha256 !== request.task_admission.approval.grant_sha256) throw new Error('pre_prompt_inbox_approval_changed');
  const recipient = { kind: 'claim' as const, claim: source.authority.claim };
  const inbox = { repo_root, task_id: request.task, source, recipient };
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
  const ref = `controlled-request:${request.request_id}:${request.session_binding_sha256}`;
  const events: TaskMessageEventV2[] = [];
  for (const event of intent.events) {
    deliverTaskInbox({ ...inbox, delivery_channel: 'controlled_request', delivery_ref: ref, message_id: event.message_id, delivered_at: new Date(now).toISOString() });
    const exact = readTaskMessageDelivery({ ...inbox, message_id: event.message_id });
    if (exact.receipt?.delivery_channel === 'controlled_request' && exact.receipt.delivery_ref === ref
      && ['delivered', 'acknowledged'].includes(exact.receipt.delivery_state)) events.push(exact.event);
  }
  const companion = { ...intent, events };
  assertCurrent(companion, request, Date.now());
  if (!existsSync(finalPath)) writeSessionArtifact(finalPath, companion);
  if (canonical(readSessionArtifact(finalPath)) !== canonical(companion)) throw new Error('pre_prompt_inbox_companion_changed');
  return { status: 'bound', path: finalPath, sha256: digest(companion) };
}
