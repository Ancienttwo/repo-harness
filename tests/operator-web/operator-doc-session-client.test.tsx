import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { checkDocCitation, docCitationBudget } from '../../src/core/operator/doc-citation';
import { DOC_CITATION_MAX_LINES, DOC_SESSION_WRITE_REFUSALS, type CleanupPlanPreview } from '../../src/core/operator/doc-session-api';
import { DOC_SESSION_READ_FAILURES } from '../../src/core/operator/doc-session-changes';
import {
  DOC_SESSION_FAILURE_CATEGORIES,
  DOC_SESSION_TOOL_CATEGORIES,
  type DocSessionEventV1,
  type OperatorDocSessionEventsV1,
} from '../../src/core/operator/doc-session-events';
import type { DocSessionViewState } from '../../src/core/operator/doc-session-views';
import { docsLines, OPERATOR_DOCS_FILE_KIND, type DocsFileV1 } from '../../src/core/operator/docs';
import { WORKTREE_CLEANUP_SKIP_REASONS } from '../../src/core/operator/worktree-cleanup';
import { WORKTREE_REASONS } from '../../src/core/operator/worktrees';
import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { cleanupPlanDelay, cleanupPlanStep, type CleanupPlanView } from '../../src/operator-web/cleanup-session';
import { Conversation } from '../../src/operator-web/Conversation';
import { buildCitation, citationLabel, selectionLineRange } from '../../src/operator-web/doc-citation';
import {
  DOC_SESSION_READ_REASONS,
  DOC_SESSION_STATUSES,
  docSessionDetailRequest,
  docSessionEventsStep,
  docSessionListRequest,
  docSessionStatus,
  fetchDocSessionDetail,
  fetchDocSessionDiff,
  fetchDocSessionEvents,
  fetchDocSessionFinalization,
  fetchDocSessions,
  keepsRequestId,
  markSessionSeen,
  mergeDocSessionEvents,
  NO_DOC_SESSION_EVENTS,
  OPERATOR_SESSION_SEEN_STORAGE_KEY,
  postDocSessionCommit,
  postDocSessionDiscard,
  startPoll,
  useDocSessionEvents,
  useDocSessions,
  useSessionWrite,
  type DocSessionEventsReader,
  type DocSessionEventsView,
  type DocSessionProgress,
  type DocSessionRead,
  type DocSessionsReader,
  type DocSessionWrite,
  type PollTimer,
  type RequestId,
  type SessionWrite,
} from '../../src/operator-web/doc-sessions';
import { DocsPage } from '../../src/operator-web/DocsPage';
// The app loads the session pages lazily; loading them here keeps that import off the settle window.
import '../../src/operator-web/CleanupSessionPage';
import '../../src/operator-web/DocSessionPage';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { fixtureProps } from '../../src/operator-web/fixtures';
import { busyDevActivity, HARNESS_ID } from '../../src/operator-web/fixtures/dev-activity';
import { CLEANUP_SESSION, PR_SESSION, REVIEW_SESSION, RUNNING_SESSION } from '../../src/operator-web/fixtures/doc-sessions';
import { isOperatorMessageKey, translate } from '../../src/operator-web/i18n';
import { docsAnswer } from '../../src/operator-web/repository-reads';
import { decodeDocsFile, decodeDocsTree } from '../../src/core/operator/docs';
import { docsFileAnswer, docsTreeAnswer } from '../../src/operator-web/fixtures/docs';
import { parseWorkspaceLocation, workspaceHash } from '../../src/operator-web/workspace-location';

mock.module('mermaid', () => ({ default: { initialize: () => {}, render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }) } }));

let root: Root | null = null;
let window: Window;
const realFetch = globalThis.fetch;

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
  globalThis.fetch = realFetch;
  await window.happyDOM.close();
});

const settle = () => act(async () => { for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setTimeout(resolve, 0)); });
const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(node));
  await settle();
  return container;
}

const SID = 'ab'.repeat(16);
const AT = '2026-10-30T08:00:00.000Z';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const envelope = (code: string, extra: Record<string, unknown> = {}) => ({ error: { code, message: `${code} message`, next_action: `${code} action`, ...extra } });

/** Serves queued answers and records each request. */
function serve(answers: readonly (() => Response)[]) {
  const requests: { readonly method: string; readonly url: string; readonly init: RequestInit | undefined }[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    requests.push({ method: init?.method ?? 'GET', url: String(url), init });
    return answers[requests.length - 1]!();
  }) as typeof fetch;
  return requests;
}

const list = { protocol: 1, kind: 'operator_docs_sessions', sessions: [] };
const OTHER = 'cd'.repeat(16);
const summary = (fields: Record<string, unknown> = {}) => ({
  session_id: SID, title: 'Tighten the column', repository_id: 'repo_a5b76eee64af71c3', repository_name: 'repo-harness', runtime: 'codex',
  state: 'idle', created_at: AT, last_activity_at: AT, last_cursor: '1.4', unread: true, ...fields,
});
const NO_SEEN = { seen: {} };

describe('doc session reads', () => {
  test('the list read is the availability authority: a missing or POST-only route is absent, any other failure is a reason', async () => {
    const requests = serve([
      () => json(200, list),
      () => json(404, envelope('not_found')),
      () => json(405, envelope('method_not_allowed')),
      () => json(503, { code: 'busy' }),
      () => json(200, { ...list, kinds: ['docs', 'worktree_cleanup'] }),
      () => new Response('<html>proxy</html>', { status: 502 }),
      () => { throw new TypeError('connection refused'); },
    ]);
    const results: string[] = [];
    for (let index = 0; index < 7; index++) {
      const read = await fetchDocSessions(NO_SEEN, new AbortController().signal);
      results.push(read.state === 'unavailable' ? read.reason : read.state);
    }
    expect(results).toEqual(['ok', 'absent', 'absent', 'busy', 'unreadable', 'unreachable', 'unreachable']);
    expect(new Set(requests.map(request => `${request.method} ${request.url}`))).toEqual(new Set([`GET /api/v1/sessions?seen=${encodeURIComponent('{}')}`]));
  });

  test('list and detail requests carry seen, and each answer decodes against the request it answers', async () => {
    markSessionSeen(SID, '1.2');
    const request = docSessionListRequest();
    expect(request).toEqual({ seen: { [SID]: '1.2' } });
    expect(docSessionDetailRequest(SID)).toEqual({ session_id: SID, seen: '1.2' });
    expect(docSessionDetailRequest(OTHER)).toEqual({ session_id: OTHER, seen: null });
    const detail = (fields: Record<string, unknown>) => ({
      protocol: 1, kind: 'operator_docs_session', session: summary(fields), branch: `docs/${SID.slice(0, 12)}`, worktree: 'repo-harness-wt-docs-abababababab',
      head_commit: '1f'.repeat(20), base_commit: '1f'.repeat(20), epoch: 1, turn: 'idle',
    });
    const requests = serve([
      // 1.4 is after the seen 1.2, so the server must say unread; an answer that disagrees with the sent seen is refused.
      () => json(200, { ...list, sessions: [summary()] }),
      () => json(200, { ...list, sessions: [summary({ unread: false })] }),
      () => json(200, detail({ last_cursor: '1.2', unread: false })),
      () => json(200, detail({ last_cursor: '1.2', unread: true })),
    ]);
    const first = await fetchDocSessions(request, new AbortController().signal);
    const second = await fetchDocSessions(request, new AbortController().signal);
    const third = await fetchDocSessionDetail(docSessionDetailRequest(SID), new AbortController().signal);
    const fourth = await fetchDocSessionDetail(docSessionDetailRequest(SID), new AbortController().signal);
    expect(requests.map(sent => decodeURIComponent(sent.url))).toEqual([
      `/api/v1/sessions?seen={"${SID}":"1.2"}`, `/api/v1/sessions?seen={"${SID}":"1.2"}`,
      `/api/v1/sessions/${SID}?seen=1.2`, `/api/v1/sessions/${SID}?seen=1.2`,
    ]);
    expect([first.state === 'ok' && first.value.sessions[0]!.unread, second]).toEqual([true, { state: 'unavailable', reason: 'unreadable' }]);
    expect([third.state === 'ok' && third.value.session.unread, fourth]).toEqual([false, { state: 'unavailable', reason: 'unreadable' }]);
    // A session this browser never showed sends no seen cursor.
    const unseen = serve([() => json(404, { code: 'session_not_found' })]);
    await fetchDocSessionDetail(docSessionDetailRequest(OTHER), new AbortController().signal);
    expect(unseen[0]!.url).toBe(`/api/v1/sessions/${OTHER}`);
  });

  test('the list hook builds seen from storage and drops cursors of sessions the server no longer lists', async () => {
    markSessionSeen(SID, '1.4');
    markSessionSeen(OTHER, '2.0');
    const sent: unknown[] = [];
    // One reader for every render, as the app passes it.
    const read: DocSessionsReader = async (request) => { sent.push(request); return { state: 'ok', value: { protocol: 1, kind: 'operator_docs_sessions', sessions: [] } }; };
    function Harness() {
      useDocSessions(read, 0);
      return null;
    }
    serve([]);
    await render(<Harness />);
    expect(sent[0]).toEqual({ seen: { [SID]: '1.4', [OTHER]: '2.0' } });
    expect(JSON.parse(localStorage.getItem(OPERATOR_SESSION_SEEN_STORAGE_KEY)!)).toEqual({});
  });

  test('session reads accept the bare {code} body; a missing route on them is not absent', async () => {
    const requests = serve([
      () => json(413, { code: 'too_large' }),
      () => json(404, { code: 'session_not_found' }),
      () => json(404, envelope('not_found')),
      () => json(409, { code: 'a_code_from_a_newer_server' }),
    ]);
    const reasons: string[] = [];
    for (let index = 0; index < 4; index++) {
      const read = await fetchDocSessionDiff(SID, new AbortController().signal);
      reasons.push(read.state === 'unavailable' ? read.reason : read.state);
    }
    expect(reasons).toEqual(['too_large', 'session_not_found', 'unreachable', 'unreachable']);
    expect(requests[0]!.url).toBe(`/api/v1/sessions/${SID}/diff`);
  });

  test('the events read sends its cursor and decodes the page against it', async () => {
    const page = (after: string | null, events: unknown[], next: string | null) => ({
      protocol: 1, kind: 'operator_docs_session_events', session_id: SID, after, events, next_cursor: next, complete: true, activity: 'idle',
    });
    const requests = serve([
      () => json(200, page(null, [], null)),
      () => json(200, page('1.4', [{ protocol: 1, epoch: 1, seq: 5, at: AT, type: 'turn', boundary: 'ended' }], '1.5')),
      // A page that answers another cursor fails the decoder.
      () => json(200, page('1.3', [], '1.3')),
      () => json(400, { code: 'invalid_cursor' }),
    ]);
    const first = await fetchDocSessionEvents(SID, null, new AbortController().signal);
    const second = await fetchDocSessionEvents(SID, '1.4', new AbortController().signal);
    const third = await fetchDocSessionEvents(SID, '1.4', new AbortController().signal);
    const fourth = await fetchDocSessionEvents(SID, '1.4', new AbortController().signal);
    expect(requests.map(request => request.url)).toEqual([
      `/api/v1/sessions/${SID}/events`, `/api/v1/sessions/${SID}/events?after=1.4`, `/api/v1/sessions/${SID}/events?after=1.4`, `/api/v1/sessions/${SID}/events?after=1.4`,
    ]);
    expect([first.state, second.state === 'ok' && second.value.next_cursor]).toEqual(['ok', '1.5']);
    expect([third, fourth]).toEqual([{ state: 'unavailable', reason: 'unreadable' }, { state: 'unavailable', reason: 'invalid_cursor' }]);
  });
});

describe('doc session writes', () => {
  const body = { request_id: crypto.randomUUID(), expected_head: '1f'.repeat(20), expected_diff_sha256: '9e'.repeat(32), message: 'docs: tighten' };
  const outcome = (stage: string, extra: Record<string, unknown> = {}) => ({
    protocol: 1, kind: 'operator_docs_session_finalize', operation: 'commit', stage, commit: '1f'.repeat(20), pushed: stage !== 'committed', pr: null, ...extra,
  });

  test('map every commit answer to one result; scope refusals keep their files; a 503 outcome names its error; a success body is not page state', async () => {
    const requests = serve([
      () => json(200, outcome('complete', { pr: { number: 12, url: 'https://github.com/acme/docs/pull/12' } })),
      () => json(422, envelope('path_outside_scope', { files: ['src/cli/index.ts', 'docs/../x'] })),
      () => json(422, envelope('generated_region', { files: ['docs/architecture/generated.md'] })),
      () => json(503, envelope('busy')),
      () => json(503, outcome('pr_failed', { error: { code: 'pr_create_failed', message: 'pr_create_failed', next_action: 'Retry the same session action with a new request_id and unchanged fields.' } })),
      // The progress comes from the finalization read, so the page does not decode a 2xx body at all.
      () => json(200, { anything: true }),
      () => new Response('<html>proxy</html>', { status: 502 }),
      () => { throw new TypeError('connection refused'); },
    ]);
    const outcomes: DocSessionWrite<unknown>[] = [];
    for (let index = 0; index < 8; index++) outcomes.push(await postDocSessionCommit(SID, body));
    expect(outcomes.map(result => result.state === 'refused' ? `${result.status}:${result.refusal.code}:${result.refusal.files.join(',')}` : result.state)).toEqual([
      // A path outside the repository is not a typed refusal, so the answer counts as none.
      'ok', 'unreachable', '422:generated_region:docs/architecture/generated.md', '503:busy:', '503:pr_create_failed:', 'ok', 'unreachable', 'unreachable',
    ]);
    expect(outcomes[4]!.state === 'refused' && outcomes[4]!.refusal.next_action).toBe('Retry the same session action with a new request_id and unchanged fields.');
    const sent = requests[0]!;
    expect([sent.method, sent.url, sent.init?.credentials, JSON.parse(String(sent.init?.body))]).toEqual(['POST', `/api/v1/sessions/${SID}/commit`, 'same-origin', body]);
    const discard = serve([() => json(503, { ...outcome('removing'), operation: 'discard', error: { code: 'discard_reconcile_required', message: 'm', next_action: 'n' } })]);
    const discarded = await postDocSessionDiscard(SID, { request_id: body.request_id, expected_head: '1f'.repeat(20), expected_loss_sha256: '9e'.repeat(32) });
    expect([discard[0]!.url, discarded.state === 'refused' && discarded.refusal.code]).toEqual([`/api/v1/sessions/${SID}/discard`, 'discard_reconcile_required']);
  });

  test('the finalization read decodes against its session', async () => {
    const view = (progress: unknown, sessionId = SID) => ({ protocol: 1, kind: 'operator_docs_session_finalization_state', session_id: sessionId, progress });
    const requests = serve([
      () => json(200, view(null)),
      () => json(200, view({ ...outcome('pushed'), pr: null })),
      () => json(200, view(null, OTHER)),
      () => json(503, { code: 'events_unavailable' }),
    ]);
    const reads: DocSessionRead<unknown>[] = [];
    for (let index = 0; index < 4; index++) reads.push(await fetchDocSessionFinalization(SID, new AbortController().signal));
    expect(requests[0]!.url).toBe(`/api/v1/sessions/${SID}/finalization`);
    expect(reads.map(read => read.state === 'ok' ? 'ok' : read.reason)).toEqual(['ok', 'ok', 'unreadable', 'events_unavailable']);
  });

  test('a resend keeps its request_id only after no typed answer or a retryable refusal, as the settings form does', async () => {
    const refusal = (code: string): DocSessionWrite<string> => ({ state: 'refused', status: 409, refusal: { code, message: 'm', next_action: 'n', files: [] } });
    expect([{ state: 'unreachable' }, { state: 'unreadable' }, refusal('busy'), refusal('audit_unavailable'), refusal('body_timeout'), refusal('diff_changed'), { state: 'ok', result: 'x' }]
      .map(outcome => keepsRequestId(outcome as DocSessionWrite<string>))).toEqual([true, true, true, true, true, false, false]);

    const sent: (RequestId & { readonly text: string })[] = [];
    const answers: DocSessionWrite<string>[] = [{ state: 'unreachable' }, refusal('busy'), refusal('steer_unsupported'), { state: 'ok', result: 'queued' }, { state: 'unreachable' }, { state: 'ok', result: 'x' }];
    const send = async (value: RequestId & { readonly text: string }) => { sent.push(value); return answers.shift()!; };
    let write: SessionWrite<{ readonly text: string }, string> | null = null;
    function Harness({ sender }: { readonly sender: typeof send }) { write = useSessionWrite(sender); return null; }
    await render(<Harness sender={send} />);
    for (const text of ['a', 'a', 'a', 'a', 'a']) await act(async () => { await write!.submit({ text }); });
    // unreachable → same id; busy → same id; steer_unsupported → the next send is new; ok → new; then unreachable.
    expect(sent.map(value => value.text)).toEqual(['a', 'a', 'a', 'a', 'a']);
    expect(sent[1]!.request_id).toBe(sent[0]!.request_id);
    expect(sent[2]!.request_id).toBe(sent[0]!.request_id);
    expect(sent[3]!.request_id).not.toBe(sent[2]!.request_id);
    expect(sent[4]!.request_id).not.toBe(sent[3]!.request_id);
    // The same body for another target is a new request.
    const other = async (value: RequestId & { readonly text: string }) => send(value);
    await act(async () => root?.render(<Harness sender={other} />));
    await act(async () => { await write!.submit({ text: 'a' }); });
    expect(sent[5]!.request_id).not.toBe(sent[4]!.request_id);
    expect(write!.state).toEqual({ kind: 'answered', outcome: { state: 'ok', result: 'x' } });
  });
});

const event = (epoch: number, seq: number, body: Record<string, unknown> = { type: 'turn', boundary: 'started' }): DocSessionEventV1 =>
  ({ protocol: 1, epoch, seq, at: AT, ...body }) as DocSessionEventV1;
const page = (after: string | null, events: DocSessionEventV1[], complete: boolean, activity: 'running' | 'idle'): DocSessionRead<OperatorDocSessionEventsV1> => ({
  state: 'ok', value: {
    protocol: 1, kind: 'operator_docs_session_events', session_id: SID, after, events,
    next_cursor: events.length > 0 ? `${events.at(-1)!.epoch}.${events.at(-1)!.seq}` : after, complete, activity,
  },
});

/** A timer the test runs by hand. */
function manualTimer() {
  const waits: { readonly ms: number; readonly run: () => void; cancelled: boolean }[] = [];
  const timer: PollTimer = (ms, run) => {
    const wait = { ms, run, cancelled: false };
    waits.push(wait);
    return () => { wait.cancelled = true; };
  };
  const fire = async () => {
    const wait = waits.at(-1)!;
    expect(wait.cancelled).toBe(false);
    wait.run();
    await flush();
  };
  return { waits, timer, fire };
}
const flush = async () => { for (let turn = 0; turn < 10; turn++) await new Promise(resolve => setTimeout(resolve, 0)); };

describe('doc session event polling', () => {
  test('follows next_cursor at once while a page is incomplete, then waits by activity; a new epoch continues the list', async () => {
    const afters: (string | null)[] = [];
    const answers = [
      page(null, [event(1, 0), event(1, 1, { type: 'message', role: 'user', text: 'Tighten it.', truncated: false })], false, 'running'),
      page('1.1', [event(1, 2, { type: 'tool', category: 'read', status: 'succeeded', paths: ['docs/a.md'] })], true, 'running'),
      page('1.2', [event(1, 3, { type: 'turn', boundary: 'ended' })], true, 'idle'),
      page('1.3', [event(2, 0), event(2, 1, { type: 'tool', category: 'edit', status: 'started', paths: ['docs/a.md'] })], true, 'running'),
    ];
    const read: DocSessionEventsReader = async (sessionId, after) => { expect(sessionId).toBe(SID); afters.push(after); return answers.shift()!; };
    const views: DocSessionEventsView[] = [];
    const { waits, timer, fire } = manualTimer();
    const poll = startPoll(docSessionEventsStep(read, SID, view => views.push(view)), { timer });
    await flush();
    // The first page was incomplete, so the second read followed without a wait.
    expect(afters).toEqual([null, '1.1']);
    expect(waits.map(wait => wait.ms)).toEqual([1_000]);
    await fire();
    expect(waits.map(wait => wait.ms)).toEqual([1_000, 30_000]);
    await fire();
    expect(afters).toEqual([null, '1.1', '1.2', '1.3']);
    expect(waits.at(-1)!.ms).toBe(1_000);
    const last = views.at(-1)!;
    expect(last.events.map(item => `${item.epoch}.${item.seq}`)).toEqual(['1.0', '1.1', '1.2', '1.3', '2.0', '2.1']);
    expect([last.cursor, last.activity, last.failure]).toEqual(['2.1', 'running', null]);
    poll.stop();
    expect(waits.at(-1)!.cancelled).toBe(true);
  });

  test('a failed read keeps the events, names the reason and retries at the idle interval', async () => {
    const answers: DocSessionRead<OperatorDocSessionEventsV1>[] = [
      page(null, [event(1, 0)], true, 'running'),
      { state: 'unavailable', reason: 'events_unavailable' },
      page('1.0', [event(1, 1, { type: 'turn', boundary: 'ended' })], true, 'idle'),
    ];
    const afters: (string | null)[] = [];
    const views: DocSessionEventsView[] = [];
    const { waits, timer, fire } = manualTimer();
    startPoll(docSessionEventsStep(async (_, after) => { afters.push(after); return answers.shift()!; }, SID, view => views.push(view)), { timer });
    await flush();
    await fire();
    expect(views.at(-1)).toEqual({ events: [event(1, 0)], cursor: '1.0', activity: 'running', failure: 'events_unavailable' });
    expect(waits.at(-1)!.ms).toBe(30_000);
    await fire();
    // The retry resumes from the same cursor and clears the failure.
    expect(afters).toEqual([null, '1.0', '1.0']);
    expect(views.at(-1)!.failure).toBeNull();
  });

  test('merging keeps cursor order and drops duplicates', () => {
    const current = [event(1, 0), event(1, 1), event(1, 2)];
    expect(mergeDocSessionEvents(current, [])).toBe(current);
    expect(mergeDocSessionEvents(current, [event(1, 1), event(1, 3), event(2, 0)]).map(item => `${item.epoch}.${item.seq}`)).toEqual(['1.0', '1.1', '1.2', '1.3', '2.0']);
    expect(mergeDocSessionEvents(current, [event(2, 0)]).map(item => `${item.epoch}.${item.seq}`)).toEqual(['1.0', '1.1', '1.2', '2.0']);
  });

  test('pausing aborts the read in flight and waits; resuming reads at once', async () => {
    const signals: AbortSignal[] = [];
    let release: (value: DocSessionRead<OperatorDocSessionEventsV1>) => void = () => {};
    const { waits, timer } = manualTimer();
    const poll = startPoll(docSessionEventsStep((_, __, signal) => { signals.push(signal); return new Promise(resolve => { release = resolve; }); }, SID, () => {}), { timer });
    poll.pause();
    expect(signals[0]!.aborted).toBe(true);
    release(page(null, [event(1, 0)], true, 'idle'));
    await flush();
    expect(waits).toEqual([]);
    poll.resume();
    expect(signals.length).toBe(2);
    poll.stop();
    expect(signals[1]!.aborted).toBe(true);
  });

  test('the hook reads while mounted, pauses while the tab is hidden and stops on unmount', async () => {
    let visibility: 'visible' | 'hidden' = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const afters: (string | null)[] = [];
    const read: DocSessionEventsReader = async (_, after) => {
      afters.push(after);
      return after === null ? page(null, [event(1, 0)], false, 'idle') : page(after, [event(1, 1, { type: 'turn', boundary: 'ended' })], true, 'idle');
    };
    let view: DocSessionEventsView = NO_DOC_SESSION_EVENTS;
    function Harness() { view = useDocSessionEvents(read, SID); return null; }
    await render(<Harness />);
    expect(afters).toEqual([null, '1.0']);
    expect(view.events.length).toBe(2);
    visibility = 'hidden';
    await act(async () => { document.dispatchEvent(new window.Event('visibilitychange') as unknown as Event); });
    visibility = 'visible';
    await act(async () => { document.dispatchEvent(new window.Event('visibilitychange') as unknown as Event); });
    await settle();
    // Becoming visible reads at once from the cursor already shown.
    expect(afters).toEqual([null, '1.0', '1.1']);
    await act(async () => root?.unmount());
    root = null;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(afters.length).toBe(3);
  });
});

describe('doc session status and seen cursors', () => {
  test('the visible status is a completed finalization first, then the docs host state', () => {
    const states: readonly DocSessionViewState[] = ['created', 'starting', 'running', 'idle', 'stopped', 'failed'];
    expect(Object.fromEntries(states.map(state => [state, docSessionStatus(state, null)]))).toEqual({
      created: 'running', starting: 'running', running: 'running', idle: 'awaiting_review', stopped: 'awaiting_review', failed: 'failed',
    });
    const commit = (stage: 'pushed' | 'pr_failed' | 'complete'): DocSessionProgress => ({
      operation: 'commit', stage, commit: '1f'.repeat(20), pushed: true, pr: stage === 'complete' ? { number: 12, url: 'https://github.com/acme/docs/pull/12' } : null,
    });
    for (const state of states) {
      expect(docSessionStatus(state, commit('complete'))).toBe('pr_open');
      expect(docSessionStatus(state, { operation: 'discard', stage: 'complete' })).toBe('discarded');
      // An unfinished delivery or discard leaves the status to the host.
      expect(docSessionStatus(state, commit('pr_failed'))).toBe(docSessionStatus(state, null));
      expect(docSessionStatus(state, { operation: 'discard', stage: 'removed' })).toBe(docSessionStatus(state, null));
    }
    expect(translate('zh', 'docSession.status.awaiting_review')).toBe('等你审阅');
    expect(translate('zh', 'docSession.status.pr_open')).toBe('已开 Draft PR');
  });

  test('the seen cursor only moves forward and keeps only session ids', () => {
    markSessionSeen(SID, '1.9');
    markSessionSeen(SID, '2.0');
    markSessionSeen(SID, '1.0');
    markSessionSeen(SID, 'not-a-cursor');
    expect(JSON.parse(localStorage.getItem(OPERATOR_SESSION_SEEN_STORAGE_KEY)!)).toEqual({ [SID]: '2.0' });
    localStorage.setItem(OPERATOR_SESSION_SEEN_STORAGE_KEY, JSON.stringify({ [SID]: '2.0', '../x': '1.0', [OTHER]: '01.2' }));
    expect(docSessionListRequest()).toEqual({ seen: { [SID]: '2.0' } });
  });

  test('the page works without storage: every session reads as never shown', () => {
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    Object.assign(globalThis, { localStorage: broken });
    expect(() => markSessionSeen(SID, '1.0')).not.toThrow();
    expect(docSessionListRequest()).toEqual({ seen: {} });
    expect(docSessionDetailRequest(SID)).toEqual({ session_id: SID, seen: null });
    Object.assign(globalThis, { localStorage: window.localStorage });
    window.localStorage.setItem(OPERATOR_SESSION_SEEN_STORAGE_KEY, '{not json');
    expect(docSessionListRequest()).toEqual({ seen: {} });
  });
});

function docsFile(path: string, text: string): DocsFileV1 {
  return {
    protocol: 1, kind: OPERATOR_DOCS_FILE_KIND, repository_id: HARNESS_ID, ref: 'refs/remotes/origin/main', commit: '49'.repeat(20),
    committed_at: AT, path, size: new TextEncoder().encode(text).length, sha256: createHash('sha256').update(text).digest('hex'), text, lines: docsLines(text), worktree_differs: false,
  };
}

describe('citations', () => {
  const text = '# Überblick\r\n\r\nZeile mit Umlauten: äöü — 中文。\r\nplain\n\n最后一行没有换行';
  const file = docsFile('docs/notes/mixed.md', text);

  test('the browser hash agrees byte for byte with the server check, with CRLF, non-ASCII text and a last line without LF', async () => {
    for (const [start, end] of [[1, 1], [1, 3], [3, 3], [4, 6], [6, 6], [1, 6]] as const) {
      const citation = await buildCitation(file, start, end);
      const bytes = Buffer.from(file.lines.slice(start - 1, end).map(line => line.text).join(''), 'utf8');
      expect(citation.range_sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      expect(checkDocCitation(citation, text, docCitationBudget())).toEqual({ state: 'current', start_line: start, end_line: end });
      expect([citation.path, citation.file_sha256, citation.commit]).toEqual([file.path, file.sha256, file.commit]);
    }
  });

  test('a range outside the file or over the line cap is refused', async () => {
    const long = docsFile('docs/long.md', Array.from({ length: DOC_CITATION_MAX_LINES + 1 }, (_, index) => `line ${index}\n`).join(''));
    await expect(buildCitation(long, 1, DOC_CITATION_MAX_LINES)).resolves.toMatchObject({ end_line: DOC_CITATION_MAX_LINES });
    await expect(buildCitation(long, 1, DOC_CITATION_MAX_LINES + 1)).rejects.toThrow('line cap');
    await expect(buildCitation(file, 0, 1)).rejects.toThrow();
    await expect(buildCitation(file, 3, 2)).rejects.toThrow();
    await expect(buildCitation(file, 1, 7)).rejects.toThrow();
  });

  test('labels name the path and the line range', () => {
    expect(citationLabel({ path: 'docs/a.md', start_line: 3, end_line: 8 })).toBe('docs/a.md:L3–L8');
    expect(citationLabel({ path: 'docs/a.md', start_line: 3, end_line: 3 })).toBe('docs/a.md:L3');
  });
});

describe('selection mapping on the docs page DOM', () => {
  async function mountDocs(path: string): Promise<{ readonly container: HTMLElement; readonly file: DocsFileV1 }> {
    const answer = (wire: { readonly status: number; readonly body: unknown }) => json(wire.status, wire.body);
    const readFile = (repositoryId: string, filePath: string) => docsAnswer(answer(docsFileAnswer(repositoryId, filePath)), decodeDocsFile);
    const read = await readFile(HARNESS_ID, path);
    if (read.state !== 'ok') throw new Error('fixture file');
    const container = await render(<DocsPage repositoryId={HARNESS_ID} path={path} readTree={repositoryId => docsAnswer(answer(docsTreeAnswer(repositoryId, Date.now())), decodeDocsTree)}
      readFile={readFile} generation={0} mode="light" now={Date.now()} onOpen={() => {}} t={t} />);
    return { container, file: read.value };
  }

  function select(from: Node, fromOffset: number, to: Node, toOffset: number): Selection {
    const range = document.createRange();
    range.setStart(from, fromOffset);
    range.setEnd(to, toOffset);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  }
  const block = (container: Element, line: number) => container.querySelector(`[data-docs-body] [data-line="${line}"]`)!;
  const textOf = (element: Element) => element.firstChild!;

  test('markdown blocks run to the next block, without trailing blank lines; a triple click does not reach the next block', async () => {
    const { container, file } = await mountDocs('docs/design/console.md');
    const body = container.querySelector('[data-docs-body]')!;
    // console.md: h1 L1, h2 L3, p L5, h2 L7, p L9, blockquote L11 holding a p of its own.
    expect(Array.from(body.querySelectorAll('[data-line]'), element => `${element.tagName}:${element.getAttribute('data-line')}`))
      .toEqual(['H1:1', 'H2:3', 'P:5', 'H2:7', 'P:9', 'BLOCKQUOTE:11', 'P:11']);
    const paragraph = block(container, 5);
    expect(selectionLineRange(select(textOf(paragraph), 2, textOf(paragraph), 9), body, file)).toEqual({ start_line: 5, end_line: 5 });
    expect(selectionLineRange(select(textOf(block(container, 3)), 1, textOf(paragraph), 4), body, file)).toEqual({ start_line: 3, end_line: 5 });
    expect(selectionLineRange(select(paragraph, 0, textOf(block(container, 7)), 0), body, file)).toEqual({ start_line: 5, end_line: 5 });
    // The last block runs to the end of the file; the nested paragraph is part of its blockquote.
    const quote = body.querySelector('blockquote p')!;
    expect(selectionLineRange(select(textOf(quote), 0, textOf(quote), 5), body, file)).toEqual({ start_line: 11, end_line: file.lines.length });
    const citation = await buildCitation(file, 3, 5);
    expect(checkDocCitation(citation, file.text, docCitationBudget()).state).toBe('current');
  });

  test('a selection outside the blocks, or a caret, maps to nothing', async () => {
    const { container, file } = await mountDocs('docs/design/console.md');
    const body = container.querySelector('[data-docs-body]')!;
    const header = container.querySelector('[data-docs-file-header] h2')!;
    expect(selectionLineRange(select(textOf(header), 0, textOf(header), 4), body, file)).toBeNull();
    const paragraph = block(container, 5);
    expect(selectionLineRange(select(textOf(paragraph), 3, textOf(paragraph), 3), body, file)).toBeNull();
  });

  test('a source file maps each selected line, blank lines included', async () => {
    const { container, file } = await mountDocs('docs/reference/settings.yaml');
    const source = container.querySelector('[data-docs-source]')!;
    const line = (number: number) => source.querySelector(`li[data-line="${number}"]`)!;
    // settings.yaml: line 5 is blank, line 6 is `collect:`.
    expect(file.lines[4]!.text).toBe('\n');
    expect(selectionLineRange(select(textOf(line(2)), 0, line(5), 0), source, file)).toEqual({ start_line: 2, end_line: 4 });
    expect(selectionLineRange(select(textOf(line(4)), 0, textOf(line(6)), 3), source, file)).toEqual({ start_line: 4, end_line: 6 });
  });
});

describe('Conversation', () => {
  // Fields outside D2 smuggled into the events must never reach the page.
  const smuggled = { command: 'git push --force origin main', output: 'ghp_SMUGGLEDTOKEN', arguments: '{"path":"/Users/someone/repo"}' };
  const events: DocSessionEventV1[] = [
    event(1, 0, { type: 'turn', boundary: 'started' }),
    event(1, 1, { type: 'message', role: 'user', text: 'Tighten the column.', truncated: false }),
    event(1, 2, { type: 'message', role: 'agent', text: 'Reading the note first.', truncated: false }),
    event(1, 3, { type: 'tool', category: 'read', status: 'succeeded', paths: ['docs/design/console.md'], ...smuggled }),
    event(1, 4, { type: 'tool', category: 'command', status: 'failed', paths: [], ...smuggled }),
    event(1, 5, { type: 'tool', category: 'edit', status: 'started', paths: ['docs/design/console.md', 'docs/README.md'] }),
    event(1, 6, { type: 'message', role: 'agent', text: 'Done. [withheld: possible secret]', truncated: true }),
    event(1, 7, { type: 'failure', category: 'boundary_denied' }),
    event(1, 8, { type: 'turn', boundary: 'ended' }),
    event(2, 0, { type: 'turn', boundary: 'started' }),
    event(2, 1, { type: 'message', role: 'agent', text: 'Second turn.', truncated: false }),
  ];

  test('renders messages, folded tools, turn dividers and failures, and no field outside D2', async () => {
    const container = await render(<Conversation events={events} runtime="codex" t={t}
      citations={[{ path: 'docs/design/console.md', start_line: 3, end_line: 5, relocated: true }]} />);
    const user = container.querySelectorAll('[data-message="user"]');
    expect(user.length).toBe(1);
    expect(user[0]!.querySelector('[data-citation]')?.textContent).toContain('①docs/design/console.md:L3–L5');
    expect(user[0]!.querySelector('[data-citation-relocated]')).not.toBeNull();
    // The agent name comes before the first reply of each turn only.
    expect(Array.from(container.querySelectorAll('[data-message="agent"]'), item => item.querySelector('[data-agent-name]')?.textContent ?? null))
      .toEqual(['Codex', null, 'Codex']);
    expect(container.querySelector('[data-message-truncated]')?.textContent).toBe(t('docSession.message.truncated'));
    const fold = container.querySelector<HTMLElement>('[data-tool-fold]')!;
    expect([fold.getAttribute('data-tool-fold'), fold.textContent]).toEqual(['3', '3 tool calls']);
    await act(async () => fold.querySelector('button')!.click());
    expect(Array.from(fold.querySelectorAll('[data-tool]'), row => [row.getAttribute('data-tool'), row.getAttribute('data-tool-status'), row.querySelector('[data-dot]')?.getAttribute('data-dot'),
      Array.from(row.querySelectorAll('code'), code => code.textContent).join(' ')])).toEqual([
      ['read', 'succeeded', 'ok', 'docs/design/console.md'],
      ['command', 'failed', 'danger', ''],
      ['edit', 'started', 'active', 'docs/design/console.md docs/README.md'],
    ]);
    expect(Array.from(container.querySelectorAll('[data-turn]'), row => [row.getAttribute('data-turn'), row.getAttribute('data-turn-state')]))
      .toEqual([['1', 'ended'], ['2', 'running']]);
    expect(container.querySelector('[data-turn="2"]')?.textContent).toContain('turn 2 · in progress');
    expect(container.querySelector('[data-failure]')?.textContent).toBe(t('docSession.failure.boundary_denied'));
    const html = container.innerHTML;
    for (const value of Object.values(smuggled)) expect(html).not.toContain(value);
    expect(html).not.toContain('/Users/');
  });

  test('uses the zh verbs and an unknown runtime keeps a neutral square', async () => {
    const container = await render(<Conversation events={events.slice(0, 6)} runtime={null} t={(key, params) => translate('zh', key, params)} />);
    await act(async () => container.querySelector<HTMLButtonElement>('[data-tool-fold] button')!.click());
    expect(Array.from(container.querySelectorAll('[data-tool] .font-medium'), verb => verb.textContent)).toEqual(['读', '运行', '改']);
    expect(container.querySelector('[data-agent-name]')?.textContent).toBe('Agent');
    expect(container.querySelector('[data-agent-name] span')?.className).toContain('bg-kumo-fill');
  });
});

describe('session routes', () => {
  test('#session/<id> and #cleanup/<id> need a 32-hex id', () => {
    expect(parseWorkspaceLocation(`#session/${SID}`)).toEqual({ workspace: 'session', module: null, item: SID });
    expect(parseWorkspaceLocation(`#cleanup/${SID}`)).toEqual({ workspace: 'cleanup', module: null, item: SID });
    expect(workspaceHash({ workspace: 'session', module: null, item: SID })).toBe(`#session/${SID}`);
    for (const hash of ['#session', '#session/', `#session/${SID.toUpperCase()}`, `#session/${SID}0`, `#cleanup/${SID}/x`, '#session/..%2F']) {
      expect(parseWorkspaceLocation(hash).workspace).toBe('home');
    }
  });
});

describe('cleanup session', () => {
  async function busyPreview(): Promise<CleanupPlanPreview> {
    const read = await fixtureProps('busy').readCleanupPlan!(CLEANUP_SESSION, new AbortController().signal);
    if (read.state !== 'ok') throw new Error(`plan ${read.state}`);
    return read.value;
  }

  test('the plan polls each 1 s while the agent investigates, and keeps the last preview when a refresh fails', async () => {
    const preview = await busyPreview();
    expect(cleanupPlanDelay(preview)).toBe(30_000);
    expect(cleanupPlanDelay({ ...preview, agent: 'running' })).toBe(1_000);
    expect(cleanupPlanDelay({ ...preview, agent: 'starting' })).toBe(1_000);
    expect(cleanupPlanDelay({ ...preview, state: 'investigating', plan: null })).toBe(1_000);
    const shown: { view: CleanupPlanView } = { view: { kind: 'loading' } };
    const answers: DocSessionRead<CleanupPlanPreview>[] = [{ state: 'ok', value: { ...preview, agent: 'running' } }, { state: 'unavailable', reason: 'timeout' }];
    const { waits, timer, fire } = manualTimer();
    startPoll(cleanupPlanStep(async () => answers.shift()!, CLEANUP_SESSION, change => { shown.view = change(shown.view); }), { timer });
    await flush();
    expect([shown.view.kind, waits.at(-1)!.ms]).toEqual(['ready', 1_000]);
    await fire();
    expect(shown.view.kind === 'ready' && shown.view.refreshFailed).toBe(true);
    expect(waits.at(-1)!.ms).toBe(30_000);
  });
});

describe('fixtures', () => {
  const signal = () => new AbortController().signal;

  test('busy lists three sessions; its records page through to the end through the real decoders', async () => {
    const props = fixtureProps('busy');
    const list = await props.readDocSessions!(NO_SEEN, signal());
    expect(list.state === 'ok' && list.value.sessions.map(row => [row.state, row.unread])).toEqual([['running', true], ['idle', true], ['stopped', true]]);
    const views: DocSessionEventsView[] = [];
    const { timer } = manualTimer();
    const poll = startPoll(docSessionEventsStep(props.readDocSessionEvents!, RUNNING_SESSION, view => views.push(view)), { timer });
    await flush();
    poll.stop();
    const record = views.at(-1)!;
    expect([record.failure, record.activity, record.events.length, new Set(record.events.map(item => item.epoch))]).toEqual([null, 'running', 13, new Set([1, 2])]);
    expect(list.state === 'ok' && list.value.sessions[0]!.last_cursor).toBe(record.cursor);
    // The fixture computes unread from the seen it was sent, as the server does.
    const seen = await props.readDocSessions!({ seen: { [RUNNING_SESSION]: record.cursor! } }, signal());
    expect(seen.state === 'ok' && seen.value.sessions.map(row => row.unread)).toEqual([false, true, true]);
    for (const sessionId of [RUNNING_SESSION, REVIEW_SESSION, PR_SESSION]) {
      expect((await props.readDocSession!({ session_id: sessionId, seen: null }, signal())).state).toBe('ok');
      for (const read of [props.readDocSessionDiff!, props.readDocSessionLoss!, props.readDocSessionFinalization!]) expect((await read(sessionId, signal())).state).toBe('ok');
    }
    const finalization = await props.readDocSessionFinalization!(PR_SESSION, signal());
    expect(finalization.state === 'ok' && finalization.value.progress).toMatchObject({ stage: 'complete', pr: { url: 'https://github.com/Ancienttwo/repo-harness/pull/1188' } });
    const review = await props.readDocSessionFinalization!(REVIEW_SESSION, signal());
    expect(review.state === 'ok' && review.value.progress).toBeNull();
  });

  test('busy writers answer like the server, a created session joins the list, and the finalization read reports the writes', async () => {
    const props = fixtureProps('busy');
    const id = () => crypto.randomUUID();
    const file = docsFile('docs/design/console.md', 'one\ntwo\n');
    const created = await props.writeDocSessionCreate!({ request_id: id(), kind: 'docs', runtime: 'codex', repository_id: HARNESS_ID,
      citations: [await buildCitation(file, 1, 2)], instruction: 'Shorten the column note.' });
    if (created.state !== 'ok') throw new Error(created.state);
    expect(created.result.citations).toEqual([{ path: 'docs/design/console.md', start_line: 1, end_line: 2, relocated: false }]);
    const list = await props.readDocSessions!(NO_SEEN, signal());
    expect(list.state === 'ok' && list.value.sessions[0]!.session_id).toBe(created.result.session_id);
    expect((await props.readDocSession!({ session_id: created.result.session_id, seen: null }, signal())).state).toBe('ok');
    const message = await props.writeDocSessionMessage!(RUNNING_SESSION, { request_id: id(), text: 'Also the title.', when: 'after_turn' });
    const stop = await props.writeDocSessionStop!(RUNNING_SESSION, { request_id: id() });
    const commit = await props.writeDocSessionCommit!(REVIEW_SESSION, { request_id: id(), expected_head: '1f'.repeat(20), expected_diff_sha256: '9e'.repeat(32), message: 'docs: explain citations' });
    const discard = await props.writeDocSessionDiscard!(RUNNING_SESSION, { request_id: id(), expected_head: '1f'.repeat(20), expected_loss_sha256: '9e'.repeat(32) });
    const cleanup = await props.writeCleanupSessionCreate!({ request_id: id(), kind: 'worktree_cleanup', runtime: 'codex' });
    expect([
      message.state === 'ok' && message.result.landed, stop.state === 'ok' && stop.result.result, commit.state, discard.state,
      cleanup.state === 'ok' && cleanup.result.session_id,
    ]).toEqual(['queued', 'aborting', 'ok', 'ok', CLEANUP_SESSION]);
    const progress = async (sessionId: string) => {
      const read = await props.readDocSessionFinalization!(sessionId, signal());
      return read.state === 'ok' ? read.value.progress : read.reason;
    };
    expect(await progress(REVIEW_SESSION)).toMatchObject({ operation: 'commit', stage: 'complete' });
    expect(await progress(RUNNING_SESSION)).toMatchObject({ operation: 'discard', stage: 'complete' });
  });

  test('empty lists no session; degraded has no session route, so the list is absent', async () => {
    const empty = await fixtureProps('empty').readDocSessions!(NO_SEEN, signal());
    expect(empty.state === 'ok' && empty.value.sessions).toEqual([]);
    const degraded = fixtureProps('degraded');
    expect(await degraded.readDocSessions!(NO_SEEN, signal())).toEqual({ state: 'absent' });
    expect(await degraded.readDocSessionEvents!(RUNNING_SESSION, null, signal())).toEqual({ state: 'unavailable', reason: 'unreachable' });
  });

  test('fixture text names no host path or secret', () => {
    const source = readFileSync(join(import.meta.dir, '../../src/operator-web/fixtures/doc-sessions.ts'), 'utf8');
    expect(source).not.toMatch(/\/Users\/|\/home\/|\/tmp\/|ghp_|sk-[A-Za-z0-9]/u);
  });
});

describe('session pages in the app', () => {
  const now = Date.now();
  const activity = decodeDevActivitySnapshot(busyDevActivity(now));
  function props(fixture: 'busy' | 'degraded'): OperatorAppProps {
    return {
      ...fixtureProps(fixture), initialLocale: 'en', initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
      initialDevActivity: activity, fetchDevActivity: async () => activity,
      initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(), readNotifyStatus: () => new Promise(() => {}),
    };
  }
  async function mount(hash: string, appProps: OperatorAppProps): Promise<void> {
    window.location.hash = hash;
    await render(<OperatorApp {...appProps} />);
    await settle();
  }

  test('#session/<id> shows the session title and its record, and marks it seen; a page not opened from create has no citation pills', async () => {
    await mount(`#session/${RUNNING_SESSION}`, props('busy'));
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('session');
    expect(document.querySelector('[data-doc-session-page] h1')?.textContent).toBe('Tighten the reading column');
    expect(document.querySelectorAll('[data-conversation] [data-message]').length).toBe(4);
    expect(document.querySelector('[data-turn="2"]')?.getAttribute('data-turn-state')).toBe('running');
    // No read returns a session's citations; only the create answer names them.
    expect(document.querySelector('[data-citation]')).toBeNull();
    expect(JSON.parse(localStorage.getItem(OPERATOR_SESSION_SEEN_STORAGE_KEY)!)[RUNNING_SESSION]).toBe('2.2');
  });

  test('a delivered session shows the Draft PR from its finalization read', async () => {
    await mount(`#session/${PR_SESSION}`, props('busy'));
    expect(document.querySelector('[data-session-status]')?.getAttribute('data-session-status')).toBe('pr_open');
    expect(document.querySelector('[data-delivery]')?.getAttribute('data-finalize-stage')).toBe('complete');
    expect(document.querySelector('a[href="https://github.com/Ancienttwo/repo-harness/pull/1188"]')?.textContent).toBe('Draft PR #1188');
    expect(document.querySelector('[data-commit-submit]')).toBeNull();
    expect(document.querySelector('[data-discard-open]')).toBeNull();
  });

  test('#cleanup/<id> shows its record; a server without session routes sends the session route Home', async () => {
    await mount(`#cleanup/${CLEANUP_SESSION}`, props('busy'));
    expect(document.querySelector('[data-cleanup-session-page]')?.getAttribute('data-cleanup-session-page')).toBe(CLEANUP_SESSION);
    expect(document.querySelector('[data-tool-fold]')?.getAttribute('data-tool-fold')).toBe('2');
    await act(async () => root?.unmount());
    root = null;
    await mount(`#session/${RUNNING_SESSION}`, props('degraded'));
    expect(document.querySelector('main')?.getAttribute('data-workspace')).toBe('home');
    expect(document.querySelector('[data-doc-session-page]')).toBeNull();
    expect(document.querySelector('[data-conversation]')).toBeNull();
  });
});

describe('copy', () => {
  test('every session code, verb, status and failure category has en and zh copy', () => {
    const keys = [
      ...DOC_SESSION_STATUSES.map(status => `docSession.status.${status}`),
      ...[...DOC_SESSION_WRITE_REFUSALS, ...DOC_SESSION_READ_FAILURES, ...DOC_SESSION_READ_REASONS].flatMap(code => [`docSession.error.${code}.message`, `docSession.error.${code}.action`]),
      ...DOC_SESSION_TOOL_CATEGORIES.map(category => `docSession.tool.${category}`),
      ...DOC_SESSION_FAILURE_CATEGORIES.map(category => `docSession.failure.${category}`),
      ...['prepared', 'committed', 'pushed', 'creating_pr', 'pr_failed', 'complete', 'discard_removing', 'discard_removed', 'discard_complete']
        .map(stage => `docSession.finalize.stage.${stage}`),
      ...['delete', 'archive_then_delete', 'keep'].map(advice => `cleanupSession.advice.${advice}`),
      ...['message', 'action'].map(part => `cleanupSession.execution.cleanup_execution_unavailable.${part}`),
      ...[...WORKTREE_REASONS, ...WORKTREE_CLEANUP_SKIP_REASONS].map(reason => `worktrees.reason.${reason}`),
    ];
    expect(keys.filter(key => !isOperatorMessageKey(key))).toEqual([]);
    expect(['读', '搜', '改', '运行', '网页', '其他']).toEqual(DOC_SESSION_TOOL_CATEGORIES.map(category => translate('zh', `docSession.tool.${category}`)));
  });
});
