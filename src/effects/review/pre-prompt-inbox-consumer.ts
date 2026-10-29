import type { OarObservationSnapshot } from '../terminal/task-runtime-observation';
/** Node-safe read-only companion validation; no owner preparation or profile loading. */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import { renderTaskMessageUntrustedContext, type TaskMessageEventV2 } from '../../core/fleet/admitted-task-message';
import { readActiveReviewAdmission } from '../admission/admission-store';
import { readTaskAgent } from '../terminal/task-session-reader';
import { readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import type { TaskRequest } from '../terminal/task-session';
import type { NativeTaskSessionBinding } from '../terminal/native-task-session';
export const canonical = (value: unknown) => canonicalize(JSON.parse(JSON.stringify(value)));
export const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;
export const MAX_AGE_MS = 60_000;
export interface Companion {
  protocol: 1;
  request_id: string;
  request_digest: string;
  native: NativeTaskSessionBinding;
  expires_at: number;
  local_approval: Parameters<typeof readActiveReviewAdmission>[0];
  admission_sha256: string;
  events: TaskMessageEventV2[];
}
export function requestSubject(request: TaskRequest) {
  const { pre_prompt_inbox: _companion, ...subject } = request;
  return subject;
}
export function assertCompanionRequestIdentity(value: Companion, request: TaskRequest, now: number) {
  if (value.protocol !== 1 || value.request_id !== request.request_id || value.request_digest !== digest(requestSubject(request))
    || !Number.isSafeInteger(value.expires_at) || now >= value.expires_at || value.expires_at - now > MAX_AGE_MS
    || value.native.task !== request.task || value.native.role !== request.role
    || value.native.session_binding_sha256 !== request.session_binding_sha256
    || value.admission_sha256 !== request.task_admission?.approval.admission_sha256) throw new Error('pre_prompt_inbox_context_stale');
}
export function assertCurrent(value: Companion, request: TaskRequest, now: number) {
  assertCompanionRequestIdentity(value, request, now);
  const current = readActiveReviewAdmission(value.local_approval);
  if (current.admission.admission_sha256 !== value.admission_sha256 || current.grant_sha256 !== request.task_admission?.approval.grant_sha256
    || current.revision !== request.task_admission?.approval.revision) throw new Error('pre_prompt_inbox_approval_changed');
  const { binding, dir } = readTaskAgent(value.local_approval.repoRoot, request.task, request.role);
  if (existsSync(join(dir, 'closed.json')) || digest(binding) !== value.native.session_binding_sha256
    || canonical(readSessionArtifact(join(dir, 'native-session.json'))) !== canonical(value.native)) throw new Error('pre_prompt_inbox_session_changed');
}
/** Read-only host consumption: exact request/native identity, expiry, and current local protected grant. */
export function consumePrePromptInbox(input: { request: TaskRequest; requestDirectory: string; native_session_id: string; host: NativeTaskSessionBinding['host']; now?: number }): string {
  const ref = input.request.pre_prompt_inbox;
  if (!ref) return '';
  if (ref.status === 'unsupported') return '[Task inbox unavailable: this historical session uses a legacy task label; create a new admitted session for automatic delivery.]';
  if (ref.path !== join(input.requestDirectory, `inbox-${input.request.round}.json`)) throw new Error('pre_prompt_inbox_path_mismatch');
  const value = readSessionArtifact<Companion>(ref.path);
  if (digest(value) !== ref.sha256 || value.native.host !== input.host || value.native.native_session_id !== input.native_session_id) throw new Error('pre_prompt_inbox_native_mismatch');
  assertCurrent(value, input.request, input.now ?? Date.now());
  return renderTaskMessageUntrustedContext(value.events);
}

export interface PrePromptInboxAccepted {
  protocol: 1;
  kind: 'repo-harness-pre-prompt-accepted';
  request_id: string;
  companion_sha256: string;
  host: NativeTaskSessionBinding['host'];
  native_session_id: string;
  provider: {pid: number; identity: string};
  consumed_at: number;
  accepted_at: number;
  observation_seq: number;
}
/** Called only by the owned host's OAR input-scoped accepted-control observer.
 * The native reviewer cannot write this protected journal. An earlier ACK is not proof. */
export function recordPrePromptInboxAccepted(input: {
  request: TaskRequest; requestDirectory: string; native_session_id: string; host: NativeTaskSessionBinding['host'];
  consumed_at: number; observation: OarObservationSnapshot;
}): void {
  const ref = input.request.pre_prompt_inbox, observation = input.observation;
  if (!ref || ref.status === 'unsupported' || observation.control !== 'accepted') return;
  if (observation.request_id !== input.request.request_id || observation.input_id !== input.request.request_id
    || observation.round !== input.request.round || observation.session_id !== input.native_session_id) throw new Error('pre_prompt_inbox_acceptance_mismatch');
  consumePrePromptInbox({ ...input, now: input.consumed_at });
  const value = readSessionArtifact<Companion>(ref.path);
  if (canonical(observation.host) !== canonical(value.native.provider)) throw new Error('pre_prompt_inbox_host_mismatch');
  const path = join(input.requestDirectory, `inbox-accepted-${input.request.round}.json`);
  if (existsSync(path)) {
    const prior = readSessionArtifact<PrePromptInboxAccepted>(path);
    if (prior.request_id !== input.request.request_id || prior.companion_sha256 !== ref.sha256
      || prior.native_session_id !== input.native_session_id || prior.host !== input.host
      || prior.consumed_at !== input.consumed_at || canonical(prior.provider) !== canonical(observation.host)) throw new Error('pre_prompt_inbox_acceptance_changed');
    return;
  }
  writeSessionArtifact(path, { protocol: 1, kind: 'repo-harness-pre-prompt-accepted', request_id: input.request.request_id,
    companion_sha256: ref.sha256, host: input.host, native_session_id: input.native_session_id,
    provider: observation.host, consumed_at: input.consumed_at, accepted_at: Date.now(), observation_seq: observation.seq } satisfies PrePromptInboxAccepted);
}
