import { afterEach, beforeEach, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { TaskDiff, TaskSessions, type FetchTaskDiff } from '../../src/operator-web/TaskDiff';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { allCards } from '../../src/operator-web/types';
import { translate } from '../../src/operator-web/i18n';
import type { OperatorTaskDiff } from '../../src/core/operator/task-diff';
import type { AdmittedSessionSelector } from '../../src/core/sessions/session-selector';

let root: Root;
let window: Window;
const card = allCards(stableSnapshot).find(c => c.execution !== null && c.placement.kind === 'column' && c.placement.column === 'working')!;
const t = (key: Parameters<typeof translate>[1]) => translate('en', key);
const selector: AdmittedSessionSelector = { repository_id: card.repository_id, provider_repository_id: '123', issue_id: '456',
  campaign_id: 'review', task: 'review-task', role: 'deep-reasoner', claim_ref: 'https://github.com/acme/widgets/issues/1#issuecomment-2',
  claim_revision: 'sha256:' + 'a'.repeat(64), grant_sha256: 'sha256:' + 'b'.repeat(64),
  policy_sha256: 'sha256:' + 'c'.repeat(64), actor_id: 'owner', session_binding_sha256: 'sha256:' + 'd'.repeat(64) };
function result(): OperatorTaskDiff {
  return { ...selector, protocol: 2, kind: 'operator_task_diff', target_ref: 'main', branch: 'codex/task', base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    observed_at: '2026-09-10T00:00:00.000Z', patch: '+<script>alert(1)</script>', untracked_paths: ['new file.txt'] };
}
beforeEach(() => {
  window = new Window({ url: 'http://127.0.0.1:4318' });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); await window.happyDOM.close(); });
async function mount(read: FetchTaskDiff, key = 'first') { await act(async () => root.render(<TaskDiff key={key} selector={selector} t={t} read={read} />)); }
async function click() { await act(async () => (document.querySelector('button') as HTMLButtonElement).click()); }

test('loads on demand and renders patch as text with explicit commits and separate untracked files', async () => {
  let calls = 0;
  await mount(async () => { calls++; return result(); }); expect(calls).toBe(0);
  await click(); expect(calls).toBe(1);
  expect(document.querySelector('pre')?.textContent).toBe(result().patch); expect(document.querySelector('script')).toBeNull();
  expect(document.body.textContent).toContain(result().base_sha); expect(document.body.textContent).toContain('new file.txt');
});
test('remount for a changed fence aborts and discards an old response', async () => {
  let resolve!: (value: OperatorTaskDiff) => void; let signal!: AbortSignal;
  await mount((_request, s) => { signal = s; return new Promise(r => { resolve = r; }); });
  await click(); expect(document.body.textContent).toContain('Loading diff');
  await mount(async () => ({ ...result(), patch: '' }), 'new-fence'); expect(signal.aborted).toBe(true);
  await act(async () => resolve(result())); expect(document.querySelector('pre')).toBeNull();
  await click(); expect(document.body.textContent).toContain('No tracked changes'); expect(document.body.textContent).toContain('new file.txt');
});
test('shows refused reads distinctly from an empty diff', async () => {
  await mount(async () => { throw new Error('too_large'); }); await click();
  expect(document.body.textContent).toContain('exceeds the display limit'); expect(document.body.textContent).not.toContain('No tracked changes');
});


test('discovery never selects the first session implicitly and changing selection aborts old diff', async () => {
  const other = { ...selector, task: 'another-task', session_binding_sha256: 'sha256:' + 'e'.repeat(64) };
  const sessions = [selector, other].map(selector => ({ selector, profile_selection: { state: 'unassigned' as const }, admission_sha256: 'sha256:' + 'f'.repeat(64), branch: 'codex/task', runtime: 'terminal' as const, harness_kind: 'codex' }));
  let calls = 0, signal!: AbortSignal, finish!: (value: OperatorTaskDiff) => void;
  await act(async () => root.render(<TaskSessions repositoryId={card.repository_id} t={t}
    read={async request => ({ protocol: 1, kind: 'operator_task_sessions', repository_id: request.repository_id, observed_at: '2026-10-25T00:00:00Z', sessions })}
    readDiff={(_request, observed) => { calls++; signal = observed; return new Promise(resolve => { finish = resolve; }); }} />));
  await click();
  expect(document.querySelector('select')!.value).toBe('');
  expect(document.querySelector('.task-diff')).toBeNull(); expect(calls).toBe(0);
  const choose = async (value: string) => { await act(async () => {
    const select = document.querySelector('select')!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
  }); };
  await choose(selector.session_binding_sha256);
  await act(async () => document.querySelector<HTMLButtonElement>('.task-diff button')!.click());
  expect(calls).toBe(1);
  await choose(other.session_binding_sha256); expect(signal.aborted).toBe(true);
  await act(async () => finish(result())); expect(document.querySelector('pre')).toBeNull();
  await act(async () => document.querySelector<HTMLButtonElement>('.task-sessions > button')!.click());
  expect(document.querySelector('select')!.value).toBe(''); expect(document.querySelector('.task-diff')).toBeNull();
});

test('discovery unavailable is distinct from a validated empty session list', async () => {
  await act(async () => root.render(<TaskSessions repositoryId={card.repository_id} t={t} read={async () => { throw new Error('unavailable'); }} />));
  await click(); expect(document.body.textContent).toContain('Session discovery is unavailable');
  expect(document.body.textContent).not.toContain('No currently admitted');
  await act(async () => root.render(<TaskSessions key="empty" repositoryId={card.repository_id} t={t}
    read={async request => ({ protocol: 1, kind: 'operator_task_sessions', repository_id: request.repository_id, observed_at: '2026-10-25T00:00:00Z', sessions: [] })} />));
  await click(); expect(document.body.textContent).toContain('No currently admitted execution sessions');
});

test('selected-session activity aborts old selection and renders bounded stored evidence as text', async () => {
  const { AdmittedTaskActivity } = await import('../../src/operator-web/AdmittedTaskActivity');
  const selected = {...selector,task:'a'.repeat(64)};
  type Snapshot = import('../../src/core/operator/admitted-task-activity').AdmittedTaskActivity;
  const snapshot = (request: import('../../src/core/operator/admitted-task-activity').AdmittedTaskActivityRequest): Snapshot => ({...request,
    protocol:2,kind:'operator_admitted_task_activity',admission_sha256:'sha256:'+'e'.repeat(64),observed_at:'2026-10-25T00:00:00Z',consistency:'observed',
    entries:[{event:{protocol:2,kind:'repo-harness-task-message-event',message_id:'123e4567-e89b-42d3-a456-000000000001',task_id:selected.task,
      task_identity:{repository_id:selected.provider_repository_id,issue_id:selected.issue_id,campaign_id:selected.campaign_id},admission_sha256:'sha256:'+'e'.repeat(64),scope:'task',target_claim:null,
      sender_kind:'operator',sender_id:'operator',sender_trust:'local_operator',audience:'owner',body:'<script>late-untrusted-activity-body-7f91</script>',body_sha256:'sha256:'+'f'.repeat(64),created_at:'2026-10-25T00:00:00Z',in_reply_to:null,event_digest:'sha256:'+'a'.repeat(64)},receipts:[],replies:[]}],
    coverage:{scope:'task',complete:true,reason:null,scanned:1,bytes:512},next_cursor:null});
  let signal!:AbortSignal, finish!: (value:Snapshot) => void, oldRequest!:import('../../src/core/operator/admitted-task-activity').AdmittedTaskActivityRequest;
  await act(async () => root.render(<AdmittedTaskActivity selector={selected} t={t} read={(request,s) => {oldRequest=request;signal=s;return new Promise(resolve=>{finish=resolve;});}} />));
  await click();
  const next = {...selected,grant_sha256:'sha256:'+'9'.repeat(64)};
  await act(async () => root.render(<AdmittedTaskActivity selector={next} t={t} read={async request=>snapshot(request)} />));
  expect(signal.aborted).toBe(true);
  await act(async () => finish(snapshot(oldRequest)));
  expect(document.body.textContent).not.toContain('late-untrusted-activity-body-7f91');
  await click(); expect(document.body.textContent).toContain('<script>late-untrusted-activity-body-7f91</script>'); expect(document.querySelector('script')).toBeNull();
  expect(document.body.textContent).toContain('Current admission permits this read');
});
