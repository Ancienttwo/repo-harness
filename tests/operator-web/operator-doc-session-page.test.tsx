import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeOperatorDocSessionMessage, decodeOperatorDocSessionStop, type DocSessionCitationView } from '../../src/core/operator/doc-session-api';
import { decodeOperatorDocSessionDiff, decodeOperatorDocSessionLoss } from '../../src/core/operator/doc-session-changes';
import { decodeOperatorDocSessionEvents } from '../../src/core/operator/doc-session-events';
import { decodeDocSessionFinalizationView } from '../../src/core/operator/doc-session-finalization-view';
import { decodeOperatorDocSessionDetail } from '../../src/core/operator/doc-session-views';
import { DocSessionPage, type DocSessionPageProps } from '../../src/operator-web/DocSessionPage';
import {
  finalizeWriteAnswer,
  OPERATOR_SESSION_FINALIZE_STORAGE_KEY,
  OPERATOR_SESSION_SEEN_STORAGE_KEY,
  sessionReadAnswer,
  sessionWriteAnswer,
  storedFinalizeRequest,
  storeFinalizeRequest,
} from '../../src/operator-web/doc-sessions';
import { translate, type OperatorLocale } from '../../src/operator-web/i18n';

mock.module('mermaid', () => ({ default: { initialize: () => {}, render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }) } }));

let root: Root | null = null;
let window: Window;

beforeEach(() => {
  window = new Window({ url: 'http://127.0.0.1:4318/' });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (media: string) => ({ matches: false, media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true }),
  });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator, localStorage: window.localStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node, Event: window.Event, Range: window.Range,
    MouseEvent: window.MouseEvent, KeyboardEvent: window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true,
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  await window.happyDOM.close();
});

const settle = () => act(async () => { for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setTimeout(resolve, 0)); });

const SID = 'ab'.repeat(16);
const AT = '2026-10-30T08:00:00.000Z';
const BASE = 'b'.repeat(40);
const COMMIT = 'c'.repeat(40);
const LOSS_HEAD = 'd'.repeat(40);
const DIFF_SHA = '1'.repeat(64);
const NEW_DIFF_SHA = '2'.repeat(64);
const LOSS_SHA = '3'.repeat(64);
const PR_URL = 'https://github.com/Ancienttwo/repo-harness/pull/1201';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const RETRY_ACTION = 'Retry the same session action with a new request_id and unchanged fields.';

interface Answer { readonly status: number; readonly body: unknown }
const ok = (body: unknown): Answer => ({ status: 200, body });
const refused = (status: number, code: string, extra: Record<string, unknown> = {}): Answer =>
  ({ status, body: { error: { code, message: `${code} message`, next_action: `${code} action`, ...extra } } });
const json = ({ status, body }: Answer) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function detail(session: Record<string, unknown> = {}, fields: Record<string, unknown> = {}): Answer {
  return ok({
    protocol: 1, kind: 'operator_docs_session',
    session: {
      session_id: SID, title: 'Tighten the reading column', repository_id: 'repo_a5b76eee64af71c3', repository_name: 'repo-harness', runtime: 'codex',
      state: 'idle', created_at: AT, last_activity_at: AT, last_cursor: null, unread: false, ...session,
    },
    branch: `docs/${SID.slice(0, 12)}`, worktree: `repo-harness-wt-docs-${SID.slice(0, 12)}`, head_commit: BASE, base_commit: BASE, epoch: 1,
    turn: session.state === 'running' ? 'running' : 'idle', ...fields,
  });
}

// A modified markdown file with two hunks, an added note and a binary image.
const PATCH = [
  'diff --git a/docs/guide.md b/docs/guide.md',
  'index 1111111..2222222 100644',
  '--- a/docs/guide.md',
  '+++ b/docs/guide.md',
  '@@ -3,3 +3,3 @@',
  ' ## Reading',
  ' ',
  '-Old sentence.',
  '+New sentence.',
  '@@ -20,2 +20,3 @@ ## Later',
  ' Keep this line.',
  '+Added **bold** line.',
  ' Last kept line.',
  'diff --git a/docs/img.png b/docs/img.png',
  'new file mode 100644',
  'Binary files /dev/null and b/docs/img.png differ',
  'diff --git a/docs/notes/new.md b/docs/notes/new.md',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/docs/notes/new.md',
  '@@ -0,0 +1,2 @@',
  '+# New note',
  '+--- a line that looks like a header',
  '',
].join('\n');

/** A first commit starts from the session base, so the diff head is the base until the server commits. */
function diff(sha = DIFF_SHA, head = BASE): Answer {
  return ok({
    protocol: 1, kind: 'operator_docs_session_diff', session_id: SID, base_commit: BASE, head_commit: head, turn: 'idle',
    files: [
      { path: 'docs/guide.md', status: 'modified', tracked: true, binary: false },
      { path: 'docs/img.png', status: 'added', tracked: false, binary: true },
      { path: 'docs/notes/new.md', status: 'added', tracked: false, binary: false },
    ],
    patch: PATCH, diff_sha256: sha, observed_at: AT,
  });
}

function loss(fields: Record<string, unknown> = {}): Answer {
  return ok({
    protocol: 1, kind: 'operator_docs_session_loss', session_id: SID, head_commit: LOSS_HEAD, turn: 'idle',
    files: [{ path: 'docs/guide.md', status: 'modified', tracked: true }, { path: 'docs/notes/new.md', status: 'added', tracked: false }],
    ignored: ['docs/.cache/'], commits: ['e'.repeat(40)], pushed: false, loss_sha256: LOSS_SHA, observed_at: AT, ...fields,
  });
}

type Stage = 'prepared' | 'committed' | 'pushed' | 'creating_pr' | 'pr_failed' | 'complete';
const commitProgress = (stage: Stage) => ({
  protocol: 1, kind: 'operator_docs_session_finalize', operation: 'commit', stage, commit: COMMIT,
  pushed: ['pushed', 'creating_pr', 'pr_failed', 'complete'].includes(stage), pr: stage === 'complete' ? { number: 1201, url: PR_URL } : null,
});
const discardProgress = (stage: 'removing' | 'removed' | 'complete') => ({ protocol: 1, kind: 'operator_docs_session_finalize', operation: 'discard', stage });
const finalization = (progress: unknown = null): Answer => ok({ protocol: 1, kind: 'operator_docs_session_finalization_state', session_id: SID, progress });
/** The 503 a commit answers when a step after the saved commit did not finish. */
const stepFailed = (stage: Stage, code: string): Answer => ({ status: 503, body: { ...commitProgress(stage), error: { code, message: code, next_action: RETRY_ACTION } } });

let seq = 0;
const said = (role: 'user' | 'agent', text: string) => ({ type: 'message', role, text, truncated: false });
function events(bodies: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  seq = 0;
  return bodies.map(body => ({ protocol: 1, epoch: 1, seq: seq++, at: AT, ...body }));
}
const RECORD = events([
  { type: 'turn', boundary: 'started' },
  said('user', 'Tighten the reading column section.'),
  { type: 'tool', category: 'read', status: 'succeeded', paths: ['docs/guide.md'] },
  { type: 'tool', category: 'command', status: 'succeeded', paths: [] },
  said('agent', 'The diff is ready.'),
  { type: 'turn', boundary: 'ended' },
]);

interface Server {
  readonly detail?: readonly Answer[];
  readonly diff?: readonly Answer[];
  readonly loss?: readonly Answer[];
  readonly finalization?: readonly Answer[];
  readonly events?: readonly Record<string, unknown>[];
  /** A raw events page body; overrides `events`. */
  readonly eventsPage?: unknown;
  readonly message?: readonly Answer[];
  readonly stop?: readonly Answer[];
  readonly commit?: readonly Answer[];
  readonly discard?: readonly Answer[];
  readonly citations?: readonly DocSessionCitationView[];
}

/** Readers and writers that answer with wire bodies through the page's own answer handling and decoders. */
function serve(server: Server) {
  const reads = { detail: 0, diff: 0, loss: 0, finalization: 0 };
  const sent: Record<'message' | 'stop' | 'commit' | 'discard', Record<string, unknown>[]> = { message: [], stop: [], commit: [], discard: [] };
  const pick = (list: readonly Answer[] | undefined, index: number): Answer => list![Math.min(index, list!.length - 1)]!;
  const record = server.events ?? RECORD;
  const props: Omit<DocSessionPageProps, 't' | 'steerUnsupported' | 'onSteerUnsupported'> = {
    sessionId: SID,
    readDetail: request => sessionReadAnswer(json(pick(server.detail ?? [detail()], reads.detail++)), value => decodeOperatorDocSessionDetail(value, request)),
    readDiff: id => sessionReadAnswer(json(pick(server.diff ?? [diff()], reads.diff++)), value => decodeOperatorDocSessionDiff(value, { session_id: id })),
    readLoss: id => sessionReadAnswer(json(pick(server.loss ?? [loss()], reads.loss++)), value => decodeOperatorDocSessionLoss(value, { session_id: id })),
    readFinalization: id => sessionReadAnswer(json(pick(server.finalization ?? [finalization()], reads.finalization++)),
      value => decodeDocSessionFinalizationView(value, { session_id: id })),
    readEvents: (id, after) => sessionReadAnswer(json(ok(server.eventsPage ?? {
      protocol: 1, kind: 'operator_docs_session_events', session_id: id, after, events: after === null ? record : [],
      next_cursor: after === null && record.length > 0 ? `1.${record.length - 1}` : after, complete: true, activity: 'idle',
    })), value => decodeOperatorDocSessionEvents(value, id, after)),
    writeMessage: (id, body) => { sent.message.push({ ...body }); return sessionWriteAnswer(json(pick(server.message, sent.message.length - 1)), value => decodeOperatorDocSessionMessage(value, id)); },
    writeStop: (id, body) => { sent.stop.push({ ...body }); return sessionWriteAnswer(json(pick(server.stop, sent.stop.length - 1)), value => decodeOperatorDocSessionStop(value, id)); },
    writeCommit: (_, body) => { sent.commit.push({ ...body }); return finalizeWriteAnswer(json(pick(server.commit, sent.commit.length - 1))); },
    writeDiscard: (_, body) => { sent.discard.push({ ...body }); return finalizeWriteAnswer(json(pick(server.discard, sent.discard.length - 1))); },
    citations: server.citations ?? null,
    generation: 0, mode: 'light', now: Date.parse(AT) + 6 * 60_000, onOpen: () => {},
  };
  return { props, reads, sent };
}

/** Holds the per-session steer answer the way the app does. */
function Harness({ props, t }: { readonly props: ReturnType<typeof serve>['props']; readonly t: DocSessionPageProps['t'] }) {
  const [noSteer, setNoSteer] = useState(false);
  return <DocSessionPage {...props} steerUnsupported={noSteer} onSteerUnsupported={() => setNoSteer(true)} t={t} />;
}

async function mount(server: Server, locale: OperatorLocale = 'en') {
  const harness = serve(server);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const t: DocSessionPageProps['t'] = (key, params) => translate(locale, key, params);
  await act(async () => root?.render(<Harness props={harness.props} t={t} />));
  await settle();
  const $ = <E extends Element = HTMLElement>(selector: string) => container.querySelector<E>(selector);
  const all = (selector: string) => Array.from(container.querySelectorAll<HTMLElement>(selector));
  return { ...harness, container, $, all, t };
}

const unmount = async () => { await act(async () => root?.unmount()); root = null; };
const click = async (element: Element | null) => { await act(async () => (element as HTMLElement).click()); await settle(); };

/**
 * Sets a controlled field the way typing does. React DOM loads before the test
 * window exists, so it watches text fields through focusin and keyup, not input.
 */
async function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
  await act(async () => {
    element!.dispatchEvent(new window.Event('focusin', { bubbles: true }) as unknown as Event);
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element!), 'value')!.set!.call(element, value);
    element!.dispatchEvent(new window.Event('keyup', { bubbles: true }) as unknown as Event);
  });
}

/** The request body without its request id, after checking that the id is a UUID. */
function withoutId(body: Record<string, unknown> | undefined): Record<string, unknown> {
  const { request_id: id, ...rest } = body!;
  expect(id).toMatch(UUID);
  return rest;
}

/** An answer without a typed body: the page cannot tell whether the server ran the request. */
const UNANSWERED: Answer = { status: 502, body: {} };

const FIRST_COMMIT = { expected_head: BASE, expected_diff_sha256: DIFF_SHA, message: 'Tighten the reading column' };

describe('doc session page', () => {
  test('4-DSES-P1: only changed hunks with unchanged counts; commit binds the reviewed diff and shows the Draft PR from the finalization read', async () => {
    const page = await mount({
      commit: [ok(commitProgress('complete'))],
      finalization: [finalization(), finalization(commitProgress('complete'))],
    }, 'zh');
    expect(page.$('[data-doc-session-page] h1')?.textContent).toBe('Tighten the reading column');
    expect(page.$('[data-session-status]')?.textContent).toBe('等你审阅');
    expect(page.all('[data-session-changes] dd').length).toBe(0);
    expect(page.all('header dd').map(item => item.textContent)).toEqual(['repo-harness', 'Codex', `docs/${SID.slice(0, 12)}`, `repo-harness-wt-docs-${SID.slice(0, 12)}`]);

    expect(page.all('[data-diff-file]').map(row => [row.getAttribute('data-diff-file'), row.getAttribute('data-diff-status')])).toEqual([
      ['docs/guide.md', 'modified'], ['docs/img.png', 'added'], ['docs/notes/new.md', 'added'],
    ]);
    // Two unchanged lines before the first hunk, fourteen between the hunks; the added file starts at line 1.
    expect(page.all('[data-unchanged]').map(row => row.textContent)).toEqual(['其余 2 行没变', '其余 14 行没变']);
    const guide = page.$('[data-diff-section="docs/guide.md"]')!;
    expect(Array.from(guide.querySelectorAll('tr'), row => [row.getAttribute('data-line-kind'), ...Array.from(row.querySelectorAll('td'), cell => cell.textContent)])).toEqual([
      ['context', '3', '3', ' ', '## Reading'],
      ['context', '4', '4', ' ', ''],
      ['removed', '5', '', '-', 'Old sentence.'],
      ['added', '', '5', '+', 'New sentence.'],
      ['context', '20', '20', ' ', 'Keep this line.'],
      ['added', '', '21', '+', 'Added **bold** line.'],
      ['context', '21', '22', ' ', 'Last kept line.'],
    ]);
    expect(page.$('[data-diff-section="docs/img.png"]')?.textContent).toBe('docs/img.png二进制文件，不显示内容。');
    expect(Array.from(page.$('[data-diff-section="docs/notes/new.md"]')!.querySelectorAll('tr td:last-child'), cell => cell.textContent))
      .toEqual(['# New note', '--- a line that looks like a header']);

    // Reading mode renders the new side of markdown hunks on the file's own line numbers.
    await click(page.$('[data-view="reading"]'));
    expect(page.$('[data-session-diff]')?.getAttribute('data-session-diff')).toBe('reading');
    const reading = page.all('[data-diff-section="docs/guide.md"] [data-hunk-reading]');
    expect(reading.map(block => block.querySelector('[data-line]')?.getAttribute('data-line'))).toEqual(['3', '20']);
    expect(reading[1]!.querySelector('strong')?.textContent).toBe('bold');
    expect(reading[0]!.textContent).not.toContain('Old sentence.');
    expect(page.all('[data-unchanged]').map(row => row.getAttribute('data-unchanged'))).toEqual(['2', '14']);
    await click(page.$('[data-view="diff"]'));

    const message = page.$<HTMLInputElement>('[data-commit-message]')!;
    expect(message.value).toBe('Tighten the reading column');
    await type(message, 'Tighten the reading column note');
    const submit = page.$<HTMLButtonElement>('[data-commit-submit]')!;
    expect([submit.textContent, submit.disabled]).toEqual(['提交并开 Draft PR', false]);
    const detailReads = page.reads.detail;
    await click(submit);
    expect(page.sent.commit.length).toBe(1);
    expect(withoutId(page.sent.commit[0])).toEqual({ ...FIRST_COMMIT, message: 'Tighten the reading column note' });
    // The answer is followed by the finalization read; the steps and the link come from it.
    expect(page.reads.finalization).toBe(2);
    expect(page.$('[data-delivery]')?.getAttribute('data-finalize-stage')).toBe('complete');
    expect(page.all('[data-step]').map(step => [step.getAttribute('data-step'), step.getAttribute('data-step-state')]))
      .toEqual([['commit', 'done'], ['push', 'done'], ['pull_request', 'done']]);
    expect(page.$(`a[href="${PR_URL}"]`)?.textContent).toBe('Draft PR #1201');
    expect(page.$('[data-session-status]')?.textContent).toBe('已开 Draft PR');
    expect(page.$('[data-commit-submit]')).toBeNull();
    expect(page.reads.detail).toBeGreaterThan(detailReads);
    // A completed delivery needs no stored request.
    expect(storedFinalizeRequest(SID, 'commit')).toBeNull();
  });

  test('4-DSES-P1: commit waits for review; a diff_changed refusal reads the diff again and binds the new digest', async () => {
    const running = await mount({ detail: [detail({ state: 'running' })] });
    expect(running.$<HTMLButtonElement>('[data-commit-submit]')?.disabled).toBe(true);
    expect(running.$('[data-commit-hint]')?.textContent).toBe(running.t('docSession.commit.notReady'));
    await unmount();

    const page = await mount({ diff: [diff(), diff(NEW_DIFF_SHA)], commit: [refused(409, 'diff_changed'), refused(409, 'busy')] });
    await click(page.$('[data-view="reading"]'));
    await click(page.$('[data-commit-submit]'));
    expect(withoutId(page.sent.commit[0])).toEqual(FIRST_COMMIT);
    expect(page.$('[data-write-result]')?.getAttribute('data-write-result')).toBe('diff_changed');
    expect(page.reads.diff).toBe(2);
    // The new diff arrived in reading mode, so it is not reviewed until the diff view shows it.
    expect(page.$<HTMLButtonElement>('[data-commit-submit]')?.disabled).toBe(true);
    expect(page.$('[data-commit-hint]')?.textContent).toBe(page.t('docSession.commit.needsReview'));
    await click(page.$('[data-view="diff"]'));
    await click(page.$('[data-commit-submit]'));
    // The server saved nothing, so the next first request binds the new digest.
    expect(withoutId(page.sent.commit[1])).toEqual({ ...FIRST_COMMIT, expected_diff_sha256: NEW_DIFF_SHA });
  });

  test('4-DSES-P2: a follow-up goes after the turn or into it; steer_unsupported disables「插入本轮」with its reason; Stop shows while a turn runs', async () => {
    const page = await mount({
      detail: [detail({ state: 'running' })],
      message: [refused(409, 'steer_unsupported', { message: 'This runtime cannot insert a message into the current turn.', next_action: 'Choose after_turn explicitly.' }),
        { status: 202, body: { protocol: 1, kind: 'operator_docs_session_message', session_id: SID, landed: 'queued' } }],
      stop: [{ status: 202, body: { protocol: 1, kind: 'operator_docs_session_stop', session_id: SID, result: 'aborting' } }, refused(409, 'no_active_turn')],
    }, 'zh');
    const now = page.$<HTMLButtonElement>('[data-when="now"]')!;
    // No field says whether the runtime steers, so the page offers it until the server says no.
    expect([now.textContent, now.disabled]).toEqual(['插入本轮', false]);
    expect(page.$('[data-steer-unsupported]')).toBeNull();
    expect(page.$('[data-stop]')?.textContent).toBe('停止');
    await click(now);
    await type(page.$<HTMLTextAreaElement>('[data-follow-up] textarea'), 'Also name the 1.65 line height.');
    await click(page.$('[data-send]'));
    expect(withoutId(page.sent.message[0])).toEqual({ text: 'Also name the 1.65 line height.', when: 'now' });
    expect(page.$('[data-follow-up] [data-write-result]')?.getAttribute('data-write-result')).toBe('steer_unsupported');
    expect([page.$<HTMLButtonElement>('[data-when="now"]')!.disabled, page.$('[data-when="after_turn"]')?.getAttribute('aria-checked')]).toEqual([true, 'true']);
    expect(page.$('[data-steer-unsupported]')?.textContent).toBe('这个 runtime 不支持插入本轮。');
    // The text stays, and the next send goes after the turn.
    await click(page.$('[data-send]'));
    expect(withoutId(page.sent.message[1])).toEqual({ text: 'Also name the 1.65 line height.', when: 'after_turn' });
    expect(page.$('[data-landed]')?.getAttribute('data-landed')).toBe('queued');
    expect(page.$<HTMLTextAreaElement>('[data-follow-up] textarea')?.value).toBe('');

    await click(page.$('[data-stop]'));
    expect(withoutId(page.sent.stop[0])).toEqual({});
    expect(page.$('[data-stop-result]')?.textContent).toBe('正在停止本轮，会话保留。');
    await click(page.$('[data-stop]'));
    expect(page.$('[data-follow-up] [data-write-result]')?.getAttribute('data-write-result')).toBe('no_active_turn');
    await unmount();

    const steer = await mount({ message: [{ status: 202, body: { protocol: 1, kind: 'operator_docs_session_message', session_id: SID, landed: 'steered' } }] });
    expect(steer.$('[data-stop]')).toBeNull();
    await click(steer.$('[data-when="now"]'));
    await type(steer.$<HTMLTextAreaElement>('[data-follow-up] textarea'), 'Keep the 672px rule.');
    await click(steer.$('[data-send]'));
    expect(withoutId(steer.sent.message[0])).toEqual({ text: 'Keep the 672px rule.', when: 'now' });
    expect(steer.$('[data-landed]')?.textContent).toBe(steer.t('docSession.landed.steered'));
    // A message over the server's byte limit is not sent.
    await type(steer.$<HTMLTextAreaElement>('[data-follow-up] textarea'), '中'.repeat(5_462));
    expect([steer.$<HTMLButtonElement>('[data-send]')?.disabled, steer.$('[data-message-too-long]') !== null]).toEqual([true, true]);
    await unmount();

    // A stopped agent or a started finalization closes the follow-up.
    for (const server of [{ detail: [detail({ state: 'stopped' })] }, { finalization: [finalization(commitProgress('pushed'))] }]) {
      const closed = await mount(server);
      expect(closed.$('[data-follow-up-closed]')?.textContent).toBe(closed.t('docSession.error.session_closed.message'));
      expect(closed.$<HTMLTextAreaElement>('[data-follow-up] textarea')?.disabled).toBe(true);
      expect(closed.$<HTMLButtonElement>('[data-send]')?.disabled).toBe(true);
      await unmount();
    }
  });

  test('4-DSES-N1: the record shows text, tool category, relative paths and state only; a record with a raw field is refused, not shown', async () => {
    const page = await mount({});
    await click(page.$('[data-tool-fold] button'));
    expect(page.all('[data-tool]').map(row => [row.getAttribute('data-tool'), row.textContent])).toEqual([
      ['read', 'doneReaddocs/guide.md'],
      ['command', 'doneRun'],
    ]);
    // UX-operator-console-uiux-N1: every control acts on this doc session or the page view.
    expect(page.all('button').map(button => button.textContent)).toEqual(['Diff', 'Reading', 'Commit and open Draft PR', 'Discard', '2 tool calls', 'After this turn', 'Insert into this turn', 'Send']);
    await unmount();

    const smuggled = { command: 'git push --force origin main', arguments: '{"path":"/Users/someone/repo"}', output: 'ghp_SMUGGLEDTOKEN0123456789' };
    const page2 = await mount({ eventsPage: {
      protocol: 1, kind: 'operator_docs_session_events', session_id: SID, after: null,
      events: events([{ type: 'tool', category: 'command', status: 'succeeded', paths: [], ...smuggled }]), next_cursor: '1.0', complete: true, activity: 'idle',
    } });
    expect(page2.$('[data-session-record] [data-session-failure]')?.getAttribute('data-session-failure')).toBe('unreadable');
    expect(page2.$('[data-conversation]')).toBeNull();
    const html = page2.container.innerHTML;
    for (const value of Object.values(smuggled)) expect(html).not.toContain(value);
    expect(html).not.toMatch(/\/Users\/|\/home\/|\/tmp\/|ghp_/u);
  });

  test('4-DSES-F1: a path_outside_scope or generated_region refusal lists its files and commits nothing', async () => {
    const page = await mount({ commit: [
      refused(422, 'path_outside_scope', { files: ['plans/roadmap.md', 'AGENTS.md'] }),
      refused(422, 'generated_region', { files: ['docs/architecture/generated.md'] }),
    ] }, 'zh');
    await click(page.$('[data-commit-submit]'));
    const banner = page.$('[data-write-result="path_outside_scope"]')!;
    expect(banner.textContent).toContain('有改动在 docs/ 之外。没有提交。');
    expect(Array.from(banner.querySelectorAll('[data-refusal-files] code'), code => code.textContent)).toEqual(['plans/roadmap.md', 'AGENTS.md']);
    expect(page.$('[data-delivery]')).toBeNull();
    await click(page.$('[data-commit-submit]'));
    expect(Array.from(page.$('[data-write-result="generated_region"]')!.querySelectorAll('[data-refusal-files] code'), code => code.textContent))
      .toEqual(['docs/architecture/generated.md']);
    expect(page.sent.commit.map(withoutId)).toEqual([FIRST_COMMIT, FIRST_COMMIT]);
  });

  test('4-DSES-F1: a scope refusal that may follow a saved first request keeps it while no finalization read proves otherwise', async () => {
    // The server re-checks the scope after it saved the journal, so a first-send
    // generated_region answer alone proves nothing about persistence; the
    // /finalization read would decide, and here it fails.
    const page = await mount({
      finalization: [finalization(), UNANSWERED],
      commit: [refused(422, 'generated_region', { files: ['docs/architecture/generated.md'] })],
    }, 'zh');
    await click(page.$('[data-commit-submit]'));
    expect(Array.from(page.$('[data-write-result="generated_region"]')!.querySelectorAll('[data-refusal-files] code'), code => code.textContent))
      .toEqual(['docs/architecture/generated.md']);
    expect(storedFinalizeRequest(SID, 'commit')).toEqual(FIRST_COMMIT);
    const input = page.$<HTMLInputElement>('[data-commit-message]')!;
    expect([input.disabled, input.value]).toEqual([true, FIRST_COMMIT.message]);
    await type(input, 'A different message');
    expect(input.value).toBe(FIRST_COMMIT.message);
    await click(page.$('[data-commit-submit]'));
    expect(withoutId(page.sent.commit[1])).toEqual(FIRST_COMMIT);
    expect(storedFinalizeRequest(SID, 'commit')).toEqual(FIRST_COMMIT);
  });

  test('4-DSES-F2: a delivery that stopped at the Draft PR keeps its step view on load; each retry resends the stored first request unchanged with a new request_id', async () => {
    // The first commit was sent before a reload: the server saved it and the browser kept it.
    storeFinalizeRequest(SID, 'commit', FIRST_COMMIT);
    const page = await mount({
      // The worktree head is now the saved commit; a resume must not bind it.
      diff: [diff(NEW_DIFF_SHA, COMMIT)],
      finalization: [finalization(commitProgress('pr_failed')), finalization(commitProgress('pr_failed')), finalization(commitProgress('complete'))],
      commit: [stepFailed('pr_failed', 'pr_create_failed'), ok(commitProgress('complete'))],
    }, 'zh');
    expect(page.all('[data-step]').map(step => step.getAttribute('data-step-state'))).toEqual(['done', 'done', 'failed']);
    expect(page.$('[data-delivery-stopped]')?.textContent).toBe('停在「开 Draft PR」这一步。');
    // A resume offers no new commit form.
    expect(page.$('[data-commit-message]')).toBeNull();
    const retry = page.$<HTMLButtonElement>('[data-commit-submit]')!;
    expect([retry.getAttribute('data-commit-submit'), retry.textContent, retry.disabled]).toEqual(['resume', '从这一步重试', false]);
    await click(retry);
    expect(withoutId(page.sent.commit[0])).toEqual(FIRST_COMMIT);
    // The 503 names the step that did not finish; the progress is the read that followed.
    expect(page.$('[data-write-result]')?.getAttribute('data-write-result')).toBe('pr_create_failed');
    expect(page.$('[data-write-result]')?.textContent).toContain('提交已推送，但 GitHub 没有建出 Draft PR。');
    expect(page.$('[data-delivery-stopped]')).not.toBeNull();
    expect(storedFinalizeRequest(SID, 'commit')).toEqual(FIRST_COMMIT);
    await click(page.$('[data-commit-submit]'));
    expect(withoutId(page.sent.commit[1])).toEqual(FIRST_COMMIT);
    expect(page.sent.commit[1]!.request_id).not.toBe(page.sent.commit[0]!.request_id);
    expect(page.$('[data-delivery-stopped]')).toBeNull();
    expect(page.$(`a[href="${PR_URL}"]`)).not.toBeNull();
    expect(localStorage.getItem(OPERATOR_SESSION_FINALIZE_STORAGE_KEY)).toBe('{}');
  });

  test('4-DSES-F2: a commit answer that was lost keeps the first body: the message is locked, and a retry resends it even though the finalization re-read failed too', async () => {
    const page = await mount({
      // The server may have saved the request, but neither the answer nor the /finalization re-read arrived.
      finalization: [finalization(), UNANSWERED],
      commit: [UNANSWERED, ok(commitProgress('complete'))],
    });
    await click(page.$('[data-commit-submit]'));
    expect(withoutId(page.sent.commit[0])).toEqual(FIRST_COMMIT);
    expect(page.$('[data-write-result]')?.getAttribute('data-write-result')).toBe('unreachable');
    const input = page.$<HTMLInputElement>('[data-commit-message]')!;
    expect(input.disabled).toBe(true);
    expect(page.$('[data-commit-hint]')?.textContent).toBe(page.t('docSession.commit.messageLocked'));
    expect(storedFinalizeRequest(SID, 'commit')).toEqual(FIRST_COMMIT);

    await type(input, 'A different message');
    expect(input.value).toBe(FIRST_COMMIT.message);
    await click(page.$('[data-commit-submit]'));
    expect(withoutId(page.sent.commit[1])).toEqual(FIRST_COMMIT);
    // The lost answer is resent as the same request, so the server replays what it recorded.
    expect(page.sent.commit[1]!.request_id).toBe(page.sent.commit[0]!.request_id);
    expect(storedFinalizeRequest(SID, 'commit')).toEqual(FIRST_COMMIT);
  });

  test('4-DSES-F2: a first body stored by another tab after this render is resent at click time; the edited message does not build a new body', async () => {
    const page = await mount({ finalization: [finalization(), UNANSWERED], commit: [UNANSWERED] });
    expect(page.$<HTMLInputElement>('[data-commit-message]')?.disabled).toBe(false);
    // The other tab stored and sent its body after this tab rendered the editable form.
    const other = { ...FIRST_COMMIT, message: 'Written by the other tab' };
    storeFinalizeRequest(SID, 'commit', other);
    await type(page.$<HTMLInputElement>('[data-commit-message]'), 'Written by this tab');
    await click(page.$('[data-commit-submit]'));
    expect(page.sent.commit.length).toBe(1);
    expect(withoutId(page.sent.commit[0])).toEqual(other);
    expect(storedFinalizeRequest(SID, 'commit')).toEqual(other);
    const input = page.$<HTMLInputElement>('[data-commit-message]')!;
    expect([input.disabled, input.value]).toEqual([true, other.message]);
  });

  test('4-DSES-F2: a lost answer is released once a /finalization read after it shows no progress; a first-send refusal that saved nothing releases at once', async () => {
    const lost = await mount({ commit: [UNANSWERED, refused(409, 'busy')], finalization: [finalization(), finalization()] });
    await click(lost.$('[data-commit-submit]'));
    expect(lost.$<HTMLInputElement>('[data-commit-message]')?.disabled).toBe(false);
    expect(storedFinalizeRequest(SID, 'commit')).toBeNull();
    await type(lost.$<HTMLInputElement>('[data-commit-message]'), 'A different message');
    await click(lost.$('[data-commit-submit]'));
    expect(withoutId(lost.sent.commit[1])).toEqual({ ...FIRST_COMMIT, message: 'A different message' });
    await unmount();

    // A refusal of a retry proves nothing: busy also answers a request whose first send is still running.
    const retried = await mount({ commit: [UNANSWERED, refused(409, 'busy')], finalization: [finalization(), UNANSWERED] });
    await click(retried.$('[data-commit-submit]'));
    await click(retried.$('[data-commit-submit]'));
    expect(retried.$('[data-write-result]')?.getAttribute('data-write-result')).toBe('busy');
    expect(retried.$<HTMLInputElement>('[data-commit-message]')?.disabled).toBe(true);
    expect(storedFinalizeRequest(SID, 'commit')).toEqual(FIRST_COMMIT);
  });

  test('4-DSES-F2: after a diff_changed refusal nothing was saved, so the next commit builds a new body from the new message and digest', async () => {
    const page = await mount({ diff: [diff(), diff(NEW_DIFF_SHA)], commit: [refused(409, 'diff_changed'), UNANSWERED] });
    await click(page.$('[data-commit-submit]'));
    expect(page.$('[data-write-result]')?.getAttribute('data-write-result')).toBe('diff_changed');
    expect(storedFinalizeRequest(SID, 'commit')).toBeNull();
    expect(page.$<HTMLInputElement>('[data-commit-message]')?.disabled).toBe(false);
    await type(page.$<HTMLInputElement>('[data-commit-message]'), 'Reworded after the diff changed');
    await click(page.$('[data-view="reading"]'));
    await click(page.$('[data-view="diff"]'));
    await click(page.$('[data-commit-submit]'));
    expect(withoutId(page.sent.commit[1])).toEqual({ ...FIRST_COMMIT, expected_diff_sha256: NEW_DIFF_SHA, message: 'Reworded after the diff changed' });
  });

  test('4-DSES-F2: after a reload without the stored first request, the page never sends a new commit body', async () => {
    const page = await mount({ diff: [diff(NEW_DIFF_SHA, COMMIT)], finalization: [finalization(commitProgress('pushed'))], commit: [ok(commitProgress('complete'))] });
    expect(page.$('[data-finalize-stage]')?.getAttribute('data-finalize-stage')).toBe('pushed');
    expect(page.$('[data-original-missing]')?.textContent).toContain(page.t('docSession.finalize.originalMissing.message'));
    expect(page.$('[data-original-missing]')?.textContent).toContain(page.t('docSession.finalize.originalMissing.action'));
    expect(page.$('[data-commit-submit]')).toBeNull();
    expect(page.$('[data-commit-message]')).toBeNull();
    // Discard is not offered over a saved commit either.
    expect(page.$('[data-discard-open]')).toBeNull();
    expect(page.sent.commit).toEqual([]);
  });

  test('4-DSES-F3: a refused boundary or a failed host shows the reason and keeps the session isolated', async () => {
    const denied = await mount({ events: events([{ type: 'turn', boundary: 'started' }, { type: 'failure', category: 'boundary_denied' }]) }, 'zh');
    const banner = denied.$('[data-session-isolation]')!;
    expect(banner.getAttribute('data-session-isolation')).toBe('boundary_denied');
    expect(banner.textContent).toContain('会话边界拒绝了一个操作。');
    expect(banner.textContent).toContain('会话不会退回无隔离运行。');
    expect(banner.querySelector('button')).toBeNull();
    await unmount();

    const failed = await mount({ detail: [detail({ state: 'failed' })], events: events([{ type: 'failure', category: 'timeout' }]) });
    expect(failed.$('[data-session-status]')?.getAttribute('data-session-status')).toBe('failed');
    expect(failed.$('[data-session-isolation]')?.getAttribute('data-session-isolation')).toBe('timeout');
    expect(failed.$<HTMLButtonElement>('[data-send]')?.disabled).toBe(true);
    expect(failed.all('button').filter(button => /isolation|boundary|retry/iu.test(button.textContent ?? ''))).toEqual([]);
  });

  test('4-DSES-F4: discard lists the loss first and binds its digest; loss_changed deletes nothing; turn_active and a pushed branch say why', async () => {
    const page = await mount({
      loss: [loss(), loss({ files: [] }), loss({ pushed: false })],
      discard: [refused(409, 'loss_changed'), refused(409, 'turn_active'), refused(409, 'branch_pushed', { next_action: 'git push origin --delete docs/tighten-the-reading-column' })],
    }, 'zh');
    expect(page.reads.loss).toBe(0);
    await click(page.$('[data-discard-open]'));
    expect(page.reads.loss).toBe(1);
    expect(page.all('[data-loss="files"] li').map(item => item.textContent)).toEqual(['docs/guide.md修改', 'docs/notes/new.md新增 · 未跟踪']);
    expect(page.all('[data-loss="ignored"] li').map(item => item.textContent)).toEqual(['docs/.cache/']);
    expect(page.all('[data-loss="commits"] li').map(item => item.textContent)).toEqual(['e'.repeat(12)]);
    await click(page.$('[data-discard-confirm]'));
    expect(withoutId(page.sent.discard[0])).toEqual({ expected_head: LOSS_HEAD, expected_loss_sha256: LOSS_SHA });
    expect(page.$('[data-discard] [data-write-result]')?.textContent).toContain('丢弃会删的内容变了。什么都没删。');
    expect(page.$('[data-discard-done]')).toBeNull();
    expect(page.reads.loss).toBe(2);
    expect(page.$('[data-loss="files"]')).toBeNull();

    await click(page.$('[data-discard-confirm]'));
    expect(page.$('[data-discard] [data-write-result]')?.getAttribute('data-write-result')).toBe('turn_active');
    expect(page.$('[data-discard] [data-write-result]')?.textContent).toContain('先停止本轮，再丢弃。');

    await click(page.$('[data-discard-confirm]'));
    expect(page.$('[data-discard] [data-write-result]')?.getAttribute('data-write-result')).toBe('branch_pushed');
    expect(page.$('[data-discard] [data-command] code')?.textContent).toBe('git push origin --delete docs/tighten-the-reading-column');
    expect(page.$('[data-discard-confirm]')).toBeNull();
    expect(page.sent.discard.length).toBe(3);
    await unmount();

    const pushed = await mount({ loss: [loss({ pushed: true })] });
    await click(pushed.$('[data-discard-open]'));
    expect(pushed.$('[data-loss-pushed]')?.textContent).toBe(pushed.t('docSession.error.branch_pushed.message'));
    expect(pushed.$('[data-discard-confirm]')).toBeNull();
    expect(pushed.sent.discard.length).toBe(0);
  });

  test('4-DSES-F4: a confirmed discard is read back from /finalization; an unfinished one retries the stored request unchanged', async () => {
    const page = await mount({
      // The detail and diff fail once the worktree is gone; the page shows the discard, not those failures.
      detail: [detail(), { status: 409, body: { code: 'worktree_missing' } }],
      diff: [diff(), { status: 409, body: { code: 'worktree_missing' } }],
      finalization: [finalization(), finalization(discardProgress('removed')), finalization(discardProgress('complete'))],
      discard: [{ status: 503, body: { ...discardProgress('removed'), error: { code: 'discard_reconcile_required', message: 'm', next_action: 'n' } } }, ok(discardProgress('complete'))],
    });
    await click(page.$('[data-discard-open]'));
    await click(page.$('[data-discard-confirm]'));
    const first = { expected_head: LOSS_HEAD, expected_loss_sha256: LOSS_SHA };
    expect(withoutId(page.sent.discard[0])).toEqual(first);
    expect(page.$('[data-discard]')?.getAttribute('data-finalize-stage')).toBe('removed');
    expect(page.$('[data-discard] [data-write-result]')?.getAttribute('data-write-result')).toBe('discard_reconcile_required');
    await click(page.$('[data-discard-confirm="resume"]'));
    expect(withoutId(page.sent.discard[1])).toEqual(first);
    expect(page.sent.discard[1]!.request_id).not.toBe(page.sent.discard[0]!.request_id);
    expect(page.$('[data-discard-done]')?.textContent).toBe(page.t('docSession.discard.done'));
    expect(page.all('[data-session-failure]').map(banner => banner.getAttribute('data-session-failure'))).toEqual([]);
    expect(storedFinalizeRequest(SID, 'discard')).toBeNull();
  });

  test('4-DSES-F4: a discard answer that was lost keeps the first body: a new loss read does not build a new one', async () => {
    const page = await mount({ loss: [loss(), loss({ loss_sha256: '4'.repeat(64) })], finalization: [finalization(), UNANSWERED], discard: [UNANSWERED, ok(discardProgress('complete'))] });
    const first = { expected_head: LOSS_HEAD, expected_loss_sha256: LOSS_SHA };
    await click(page.$('[data-discard-open]'));
    await click(page.$('[data-discard-confirm]'));
    expect(withoutId(page.sent.discard[0])).toEqual(first);
    expect(page.$('[data-discard] [data-write-result]')?.getAttribute('data-write-result')).toBe('unreachable');
    expect(storedFinalizeRequest(SID, 'discard')).toEqual(first);

    // The user closes and opens the confirm again; the loss read now shows another digest.
    await click(page.$('[data-discard] button:not([data-discard-confirm])'));
    await click(page.$('[data-discard-open]'));
    expect(page.reads.loss).toBe(2);
    await click(page.$('[data-discard-confirm]'));
    expect(withoutId(page.sent.discard[1])).toEqual(first);
    expect(storedFinalizeRequest(SID, 'discard')).toEqual(first);
  });

  test('4-DSES-F4: a first discard body stored by another tab after this render is resent at click time', async () => {
    const page = await mount({ finalization: [finalization(), UNANSWERED], discard: [UNANSWERED] });
    await click(page.$('[data-discard-open]'));
    // The other tab stored and sent its body after this tab read the loss.
    const other = { expected_head: LOSS_HEAD, expected_loss_sha256: '5'.repeat(64) };
    storeFinalizeRequest(SID, 'discard', other);
    await click(page.$('[data-discard-confirm]'));
    expect(page.sent.discard.length).toBe(1);
    expect(withoutId(page.sent.discard[0])).toEqual(other);
    expect(storedFinalizeRequest(SID, 'discard')).toEqual(other);
  });

  test('4-DSES-F4: a lost discard answer is released by a /finalization read with no progress, and a retry refusal does not release it', async () => {
    const released = await mount({ loss: [loss(), loss({ loss_sha256: '4'.repeat(64) })], finalization: [finalization(), finalization()], discard: [UNANSWERED, UNANSWERED] });
    await click(released.$('[data-discard-open]'));
    await click(released.$('[data-discard-confirm]'));
    expect(storedFinalizeRequest(SID, 'discard')).toBeNull();
    await click(released.$('[data-discard] button:not([data-discard-confirm])'));
    await click(released.$('[data-discard-open]'));
    await click(released.$('[data-discard-confirm]'));
    expect(withoutId(released.sent.discard[1])).toEqual({ expected_head: LOSS_HEAD, expected_loss_sha256: '4'.repeat(64) });
    await unmount();

    const retried = await mount({ finalization: [finalization(), UNANSWERED], discard: [UNANSWERED, refused(409, 'worktree_in_use'), refused(409, 'loss_changed')] });
    await click(retried.$('[data-discard-open]'));
    await click(retried.$('[data-discard-confirm]'));
    await click(retried.$('[data-discard-confirm]'));
    expect(retried.$('[data-discard] [data-write-result]')?.getAttribute('data-write-result')).toBe('worktree_in_use');
    expect(storedFinalizeRequest(SID, 'discard')).toEqual({ expected_head: LOSS_HEAD, expected_loss_sha256: LOSS_SHA });
    await click(retried.$('[data-discard-confirm]'));
    expect(withoutId(retried.sent.discard[2])).toEqual({ expected_head: LOSS_HEAD, expected_loss_sha256: LOSS_SHA });
  });

  test('4-DOCS-F1: pills from the create answer are numbered in list order and a relocated one is marked; the newest cursor is marked seen', async () => {
    const page = await mount({ citations: [
      { path: 'docs/guide.md', start_line: 3, end_line: 5, relocated: false },
      { path: 'docs/notes/new.md', start_line: 8, end_line: 9, relocated: true },
    ] }, 'zh');
    const pills = page.all('[data-message="user"] [data-citation]');
    expect(pills.map(pill => pill.textContent)).toEqual(['①docs/guide.md:L3–L5', '②docs/notes/new.md:L8–L9· 已改用新行号']);
    expect(pills.map(pill => pill.querySelector('[data-citation-relocated]') !== null)).toEqual([false, true]);
    expect(JSON.parse(localStorage.getItem(OPERATOR_SESSION_SEEN_STORAGE_KEY)!)[SID]).toBe('1.5');
  });

  test('a failed read names its source and the reason; nothing reads as an empty success', async () => {
    const page = await mount({ detail: [{ status: 404, body: { code: 'session_not_found' } }], diff: [{ status: 413, body: { code: 'too_large' } }] }, 'zh');
    expect(page.$('[data-doc-session-page] h1')?.textContent).toBe('文档会话');
    expect(page.all('[data-session-failure]').map(banner => banner.getAttribute('data-session-failure'))).toEqual(['session_not_found', 'too_large']);
    expect(page.$('[data-session-failure="too_large"]')?.textContent).toContain('改动 · 改动超过页面能读的上限。');
    expect(page.$('[data-diff-empty]')).toBeNull();
    expect(page.$('[data-commit]')).toBeNull();
    await unmount();

    // Without the finalization read the page offers neither commit nor discard.
    const unread = await mount({ finalization: [{ status: 503, body: { code: 'unavailable' } }] });
    expect(unread.$('[data-session-failure="unavailable"]')).not.toBeNull();
    expect(unread.$('[data-commit]')).toBeNull();
    expect(unread.$('[data-discard-open]')).toBeNull();
  });
});
