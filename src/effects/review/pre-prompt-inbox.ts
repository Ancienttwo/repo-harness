import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import { renderTaskMessageUntrustedContext, type TaskMessageEventV2 } from '../../core/fleet/admitted-task-message';
import { deliverTaskInbox, listTaskInbox, readTaskMessageDelivery, type TaskInboxSessionSource } from '../fleet/task-inbox';
import { readActiveReviewAdmission } from '../admission/admission-store';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { readTaskAgent, readSessionArtifact, writeSessionArtifact, type TaskRequest, type TaskPrePromptInbox } from '../terminal/task-session';
import type { NativeTaskSessionBinding } from '../terminal/native-task-session';
const canonical = (value: unknown) => canonicalize(JSON.parse(JSON.stringify(value)));
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
const MAX_AGE_MS = 60_000;
interface Companion {
  protocol: 1;
  request_id: string;
  request_digest: string;
  native: NativeTaskSessionBinding;
  expires_at: number;
  local_approval: Parameters<typeof readActiveReviewAdmission>[0];
  admission_sha256: string;
  events: TaskMessageEventV2[];
}
function requestSubject(request: TaskRequest) {
  const { pre_prompt_inbox: _companion, ...subject } = request;
  return subject;
}
function assertCurrent(value: Companion, request: TaskRequest, now: number) {
  if (value.protocol !== 1 || value.request_id !== request.request_id || value.request_digest !== digest(requestSubject(request))
    || !Number.isSafeInteger(value.expires_at) || now >= value.expires_at || value.expires_at - now > MAX_AGE_MS
    || value.native.task !== request.task || value.native.role !== request.role
    || value.native.session_binding_sha256 !== request.session_binding_sha256
    || value.admission_sha256 !== request.task_admission?.approval.admission_sha256) throw new Error('pre_prompt_inbox_context_stale');
  const current = readActiveReviewAdmission(value.local_approval);
  if (current.admission.admission_sha256 !== value.admission_sha256 || current.grant_sha256 !== request.task_admission?.approval.grant_sha256
    || current.revision !== request.task_admission?.approval.revision) throw new Error('pre_prompt_inbox_approval_changed');
  const { binding, dir } = readTaskAgent(value.local_approval.repoRoot, request.task, request.role);
  if (existsSync(join(dir, 'closed.json')) || digest(binding) !== value.native.session_binding_sha256
    || canonical(readSessionArtifact(join(dir, 'native-session.json'))) !== canonical(value.native)) throw new Error('pre_prompt_inbox_session_changed');
}
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
/** Read-only host consumption: exact request/native identity, expiry, and current local protected grant. */
export function consumePrePromptInbox(input: { request: TaskRequest; requestDirectory: string; native_session_id: string; host: 'claude' | 'codex'; now?: number }): string {
  const ref = input.request.pre_prompt_inbox;
  if (!ref) return '';
  if (ref.status === 'unsupported') return '[Task inbox unavailable: this historical session uses a legacy task label; create a new admitted session for automatic delivery.]';
  if (ref.path !== join(input.requestDirectory, `inbox-${input.request.round}.json`)) throw new Error('pre_prompt_inbox_path_mismatch');
  const value = readSessionArtifact<Companion>(ref.path);
  if (digest(value) !== ref.sha256 || value.native.host !== input.host || value.native.native_session_id !== input.native_session_id) throw new Error('pre_prompt_inbox_native_mismatch');
  assertCurrent(value, input.request, input.now ?? Date.now());
  return renderTaskMessageUntrustedContext(value.events);
}
