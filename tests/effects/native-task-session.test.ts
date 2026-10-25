import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bindNativeTaskSession } from '../../src/effects/terminal/native-task-session';
import { bindTaskRuntimeFixture } from '../helpers/engineer-runtime-fixture';
import { tmpWorkspace, initGitRepo, commitAll, run } from '../helpers/repo-fixture';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
async function fixture() {
  const root = tmpWorkspace('native-task-session'); roots.push(root); initGitRepo(root);
  run('git', ['remote', 'add', 'origin', 'https://github.com/acme/widgets.git'], root);
  writeFileSync(join(root, 'README.md'), 'fixture'); commitAll(root, 'initial');
  const home = join(root, 'authority-home'); mkdirSync(home);
  const bound = await bindTaskRuntimeFixture(root, { authorityHome: home, repositoryId: '123456', issueId: '987654' });
  const ready = join(root, 'controlled-ready.json');
  const publish = (session_id: string, pid = bound.binding.provider.pid, fixture = false) => writeFileSync(ready, JSON.stringify({ pid, session_id, fixture }));
  publish('native-provider-thread');
  const input = { repo_root: root, binding: bound.binding, ready_path: ready };
  return { root, bound, publish, input };
}
test('controlled native identity binds the exact public-lifecycle session and cannot be reassigned', async () => {
  const f = await fixture();
  expect(existsSync(join(f.bound.dir, 'native-session.json'))).toBe(false);
  expect(existsSync(join(f.bound.dir, 'inbox-1.json'))).toBe(false);
  const first = bindNativeTaskSession(f.input);
  const path = join(f.bound.dir, 'native-session.json'), bytes = readFileSync(path, 'utf8');
  expect(first).toMatchObject({ host: 'codex', native_session_id: 'native-provider-thread', task: f.bound.binding.task, role: f.bound.binding.role });
  expect(first.session_binding_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(bindNativeTaskSession(f.input)).toEqual(first); expect(readFileSync(path, 'utf8')).toBe(bytes);
  f.publish('different-native-thread');
  expect(() => bindNativeTaskSession(f.input)).toThrow('native_task_session_identity_changed');
  expect(readFileSync(path, 'utf8')).toBe(bytes);
});
test('foreign process, scripted identity, changed binding and closed session cannot supply native attribution', async () => {
  const f = await fixture();
  f.publish('native-provider-thread', f.bound.binding.provider.pid + 1);
  expect(() => bindNativeTaskSession(f.input)).toThrow('native_task_session_host_mismatch');
  f.publish('native-provider-thread', f.bound.binding.provider.pid, true);
  expect(() => bindNativeTaskSession(f.input)).toThrow('native_task_session_host_mismatch');
  f.publish('native-provider-thread');
  expect(() => bindNativeTaskSession({ ...f.input, binding: { ...f.bound.binding, max_requests: 2 } })).toThrow('native_task_session_binding_changed');
  writeFileSync(join(f.bound.dir, 'closed.json'), '{}');
  expect(() => bindNativeTaskSession(f.input)).toThrow();
});

import { randomUUID } from 'node:crypto';
import { preparePrePromptInbox } from '../../src/effects/review/pre-prompt-inbox';
import { consumePrePromptInbox } from '../../src/effects/review/pre-prompt-inbox-consumer';
import { buildTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';
import { sendTaskMessage, readTaskMessageDelivery } from '../../src/effects/fleet/task-inbox';
import type { TaskRequest } from '../../src/effects/terminal/task-session';
function requestFor(f: Awaited<ReturnType<typeof fixture>>, bindingDigest: string): TaskRequest {
  return { protocol: 2, task: f.bound.binding.task, role: f.bound.binding.role, round: 1, request_id: randomUUID(),
    task_admission: f.bound.admission, session_binding_sha256: bindingDigest,
    context_ref: join(f.root, 'context-1.txt'), source_ref: join(f.root, 'source.txt'), context_sha256: `sha256:${'a'.repeat(64)}`,
    result_ref: join(f.root, 'result-1.json'), result_contract: { required_fields: ['request_id','context_sha256','value'], atomic_write: 'temp_rename' } };
}
async function inboxFixture() {
  const f = await fixture(), native = bindNativeTaskSession(f.input);
  const event = buildTaskMessageEvent({ message_id: randomUUID(), task_id: f.bound.binding.task,
    task_identity: { repository_id: f.bound.admission.identity.repository_id, issue_id: f.bound.admission.identity.issue_id, campaign_id: f.bound.admission.identity.campaign_id },
    admission_sha256: f.bound.admission.approval.admission_sha256, scope: 'claim', target_claim: f.bound.source.authority.claim,
    sender_kind: 'operator', sender_id: 'fixture-owner', sender_trust: 'local_operator', audience: 'owner',
    body: 'Untrusted message: inspect the changed requirement.', created_at: new Date().toISOString(), in_reply_to: null });
  sendTaskMessage({ repo_root: f.root, source: f.bound.source, event });
  return { ...f, native, event, request: requestFor(f, native.session_binding_sha256) };
}
test('native launch before first request does not deliver; preparation retries recover exact receipt and read-only consume', async () => {
  const f = await inboxFixture();
  const receiptInput = { repo_root: f.root, source: f.bound.source, task_id: f.request.task,
    recipient: { kind: 'claim' as const, claim: f.bound.source.authority.claim }, message_id: f.event.message_id };
  // SessionStart may occur before ready; native association itself never reads/delivers the inbox.
  expect(readTaskMessageDelivery(receiptInput).receipt).toBeNull();
  f.request.pre_prompt_inbox = preparePrePromptInbox({ source: f.bound.source, request: f.request });
  const first = f.request.pre_prompt_inbox;
  expect(preparePrePromptInbox({ source: f.bound.source, request: f.request })).toEqual(first);
  const receipt = readTaskMessageDelivery(receiptInput).receipt!;
  expect(receipt.delivery_channel).toBe('controlled_request');expect(receipt.delivery_ref).toContain(f.request.request_id);
  if (first.status !== 'bound') throw Error('expected companion');
  const bytes = readFileSync(first.path, 'utf8');
  // A crash after receipts but before the final companion recovers only this request's deliveries.
  rmSync(first.path);
  expect(preparePrePromptInbox({ source: f.bound.source, request: f.request })).toEqual(first);
  expect(readFileSync(first.path, 'utf8')).toBe(bytes);
  const text = consumePrePromptInbox({ request: f.request, requestDirectory: f.bound.dir, native_session_id: f.native.native_session_id, host: 'codex' });
  expect(text).toContain(f.event.body);expect(text).toContain('untrusted');
  expect(readFileSync(first.path, 'utf8')).toBe(bytes);expect(readTaskMessageDelivery(receiptInput).receipt).toEqual(receipt);
  expect(() => consumePrePromptInbox({ request: { ...f.request, request_id: randomUUID() }, requestDirectory: f.bound.dir, native_session_id: f.native.native_session_id, host: 'codex' })).toThrow();
  expect(() => consumePrePromptInbox({ request: f.request, requestDirectory: f.bound.dir, native_session_id: 'foreign-native', host: 'codex' })).toThrow();
  expect(() => consumePrePromptInbox({ request: f.request, requestDirectory: f.bound.dir, native_session_id: f.native.native_session_id, host: 'codex', now: Date.now() + 60_001 })).toThrow();
  f.bound.revoke();
  expect(() => consumePrePromptInbox({ request: f.request, requestDirectory: f.bound.dir, native_session_id: f.native.native_session_id, host: 'codex' })).toThrow();
});
test('historical review label explicitly refuses automatic inbox without renaming its session', async () => {
  const f = await fixture(), native = bindNativeTaskSession(f.input);
  const request = { ...requestFor(f, native.session_binding_sha256), task: 'review-historical' };
  request.pre_prompt_inbox = preparePrePromptInbox({ source: f.bound.source, request });
  expect(request.pre_prompt_inbox).toEqual({ status: 'unsupported', reason: 'historical_task_label' });
  expect(consumePrePromptInbox({ request, requestDirectory: f.bound.dir, native_session_id: native.native_session_id, host: 'codex' })).toContain('historical session');
});
