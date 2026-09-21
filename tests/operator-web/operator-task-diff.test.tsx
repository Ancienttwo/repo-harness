import { afterEach, beforeEach, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { TaskDiff, type FetchTaskDiff } from '../../src/operator-web/TaskDiff';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { allCards } from '../../src/operator-web/types';
import { translate } from '../../src/operator-web/i18n';
import type { OperatorTaskDiff } from '../../src/core/operator/task-diff';

let root: Root;
let window: Window;
const card = allCards(stableSnapshot).find(c => c.claim_id !== null && c.placement.kind === 'column' && c.placement.column === 'working')!;
const t = (key: Parameters<typeof translate>[1]) => translate('en', key);
function result(): OperatorTaskDiff {
  return { protocol: 1, kind: 'operator_task_diff', repository_id: card.repository_id, task_id: card.task_id, task_revision: card.task_revision,
    claim_id: card.claim_id!, generation: card.generation!, target_ref: 'main', branch: 'codex/task', base_sha: 'a'.repeat(40), head_sha: 'b'.repeat(40),
    observed_at: '2026-09-10T00:00:00.000Z', patch: '+<script>alert(1)</script>', untracked_paths: ['new file.txt'] };
}
beforeEach(() => {
  window = new Window({ url: 'http://127.0.0.1:4318' });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); await window.happyDOM.close(); });
async function mount(read: FetchTaskDiff, key = 'first') { await act(async () => root.render(<TaskDiff key={key} card={card} t={t} read={read} />)); }
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
