import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { decodeDevActivitySnapshot } from '../../src/core/dev-activity/decode';
import { DOC_SESSION_MAX_CITATIONS, DOC_SESSION_MAX_INSTRUCTION, type DocSessionRefusalV1 } from '../../src/core/operator/doc-session-api';
import type { DocsFileV1 } from '../../src/core/operator/docs';
import { unavailableRuntimeOverlay } from '../../src/core/operator/runtime-status';
import { OperatorApp, type OperatorAppProps } from '../../src/operator-web/App';
import { EMPTY_DOC_DRAFT, withCitation } from '../../src/operator-web/doc-draft';
import {
  markSessionSeen, OPERATOR_SESSION_SEEN_STORAGE_KEY,
  type DocSessionCreateRequest, type DocSessionCreateWriter, type DocSessionsRead, type DocSessionWrite, type RequestId,
} from '../../src/operator-web/doc-sessions';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { fixtureProps } from '../../src/operator-web/fixtures';
import { busyDevActivity } from '../../src/operator-web/fixtures/dev-activity';
import { DOCS_COMMIT, docsFileAnswer } from '../../src/operator-web/fixtures/docs';
import { CLEANUP_SESSION, PR_SESSION, REVIEW_SESSION, RUNNING_SESSION } from '../../src/operator-web/fixtures/doc-sessions';
import { agentsSettingsFixture } from '../../src/operator-web/fixtures/settings';
import { translate } from '../../src/operator-web/i18n';
import type { AgentsSettingsRead } from '../../src/operator-web/settings';

mock.module('mermaid', () => ({ default: { initialize: () => {}, render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }) } }));

const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate('en', key, params);
const NOW = Date.now();
const activity = decodeDevActivitySnapshot(busyDevActivity(NOW));
const CONSOLE = 'docs/design/console.md';
const SETTINGS_YAML = 'docs/reference/settings.yaml';

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

function props(fixture: 'busy' | 'empty' | 'degraded', overrides: Partial<OperatorAppProps> = {}): OperatorAppProps {
  return {
    ...fixtureProps(fixture), initialLocale: 'en', initialSnapshot: stableSnapshot, fetchSnapshot: async () => stableSnapshot,
    initialDevActivity: activity, fetchDevActivity: async () => activity,
    initialRuntimeOverlay: unavailableRuntimeOverlay(), readRuntimeStatus: async () => unavailableRuntimeOverlay(), readNotifyStatus: () => new Promise(() => {}),
    ...overrides,
  };
}

async function mount(hash: string, appProps: OperatorAppProps): Promise<void> {
  window.location.hash = hash;
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<OperatorApp {...appProps} />));
  await settle();
}

const $ = <T extends Element = HTMLElement>(selector: string) => document.querySelector<T>(selector);
const $$ = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector));
const click = async (element: Element | null) => { await act(async () => (element as HTMLElement).click()); await settle(); };

/**
 * Types into a text field. React loads before the DOM globals exist here, so it
 * takes its keyup path for text fields: it follows the focused field and reads
 * its value on a key event. That path wants IE's attachEvent and detachEvent.
 */
async function typeInto(element: HTMLTextAreaElement, value: string): Promise<void> {
  Object.assign(element, { attachEvent() {}, detachEvent() {} });
  await act(async () => {
    element.focus();
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new window.KeyboardEvent('keyup', { bubbles: true }) as unknown as Event);
  });
}

/** Selects the first characters of one rendered markdown block, as a drag across it would. */
async function selectBlock(line: number): Promise<void> {
  const block = $(`[data-docs-body] [data-line="${line}"]`)!;
  const range = document.createRange();
  range.setStart(block.firstChild!, 0);
  range.setEnd(block.firstChild!, 5);
  await act(async () => {
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new window.Event('selectionchange') as unknown as Event);
  });
}

async function citeBlock(line: number): Promise<void> {
  await selectBlock(line);
  await click($('[data-docs-cite]'));
}

const fileOf = (path: string): DocsFileV1 => docsFileAnswer('repo', path).body as DocsFileV1;
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const refusal = (code: string, extra: Partial<DocSessionRefusalV1> = {}): DocSessionWrite<never> =>
  ({ state: 'refused', status: 409, refusal: { code, message: `${code} server text`, next_action: `${code} server action`, paths: [], ...extra } });

/** A create writer that records each request and answers with `answer`, or with the fixture's own session. */
function recording(inner: DocSessionCreateWriter, answer?: (call: number) => DocSessionWrite<never>) {
  const calls: (DocSessionCreateRequest & RequestId)[] = [];
  const write: DocSessionCreateWriter = body => { calls.push(body); return answer ? Promise.resolve(answer(calls.length)) : inner(body); };
  return { calls, write };
}

const composerStart = () => $<HTMLButtonElement>('[data-composer-start]')!;
const hash = () => window.location.hash;

describe('starting a doc session from Home', () => {
  test('4-HOME-P1 a cited passage, an instruction and an agent start a session that opens as #session/<id>', async () => {
    const base = props('busy');
    const { calls, write } = recording(base.writeDocSessionCreate!);
    await mount(`#docs/${CONSOLE}`, { ...base, writeDocSessionCreate: write });
    const repository = $('[data-repository-switch]')!.getAttribute('data-selected')!;
    expect(repository).not.toBe('');
    // The citation made on the Docs page is in the Home composer.
    await citeBlock(5);
    await click($('.workspace-nav a[data-workspace="home"]'));
    expect($('[data-home] [data-doc-composer]')).not.toBeNull();
    expect($$('[data-composer-citation]').map(item => item.getAttribute('data-composer-citation'))).toEqual([`${CONSOLE}:L5`]);
    expect($('[data-composer-citation]')!.textContent).toContain('①');
    // The Docs page repository is the Home composer's: Home has no repository of its own.
    expect($('[data-composer-repository]')?.getAttribute('data-composer-repository')).toBe(repository);
    // The start button waits for an instruction; the agent is the saved default.
    expect(composerStart().disabled).toBe(true);
    expect($<HTMLSelectElement>('[data-composer-agent]')!.value).toBe('codex');
    await typeInto($<HTMLTextAreaElement>('[data-composer-input]')!, 'Name the 1.65 line height in the first sentence.');
    expect(composerStart().disabled).toBe(false);
    await click(composerStart());

    expect(calls).toHaveLength(1);
    const file = fileOf(CONSOLE);
    expect(calls[0]).toMatchObject({
      kind: 'docs', runtime: 'codex', instruction: 'Name the 1.65 line height in the first sentence.',
      citations: [{
        path: CONSOLE, start_line: 5, end_line: 5, commit: DOCS_COMMIT, file_sha256: file.sha256,
        range_sha256: sha256(file.lines[4]!.text),
      }],
    });
    expect(calls[0]!.repository_id).toBe(repository);
    expect(hash()).toMatch(/^#session\/e0000001e0000001e0000001e0000001$/u);
    expect($('main')?.getAttribute('data-workspace')).toBe('session');
    // The draft is cleared once the session exists.
    await click($('.workspace-nav a[data-workspace="home"]'));
    expect($$('[data-composer-citation]')).toHaveLength(0);
    expect($<HTMLTextAreaElement>('[data-composer-input]')!.value).toBe('');
  });

  test('4-HOME-P1 Continue lists the doc sessions that still need you next to the tasks', async () => {
    await mount('#home', props('busy'));
    const more = $('section[aria-labelledby="home-continue"] button[aria-expanded="false"]');
    if (more) await click(more);
    const rows = $$('[data-continue-session]');
    expect(rows.map(row => row.getAttribute('data-continue-session')).sort()).toEqual([RUNNING_SESSION, REVIEW_SESSION].sort());
    const review = $(`[data-continue-session="${REVIEW_SESSION}"]`)!;
    expect(review.querySelector('[data-session-status]')?.textContent).toBe(t('docSession.status.awaiting_review'));
    expect(review.querySelector('a')?.getAttribute('href')).toBe(`#session/${REVIEW_SESSION}`);
    expect(review.textContent).toContain('Explain citation line numbers');
    // A session with a Draft PR has nothing left to continue here.
    expect($(`[data-continue-session="${PR_SESSION}"]`)).toBeNull();
    expect($$('[data-continue-item]').length).toBeGreaterThan(0);
  });

  test('4-HOME-F1 platform_unsupported shows its reason and next step and starts nothing', async () => {
    const { calls, write } = recording(props('busy').writeDocSessionCreate!, () => refusal('platform_unsupported', { message: 'no OS boundary', next_action: 'use macOS' }));
    await mount(`#docs/${CONSOLE}`, { ...props('busy'), writeDocSessionCreate: write });
    await citeBlock(5);
    await click($('.workspace-nav a[data-workspace="home"]'));
    await typeInto($<HTMLTextAreaElement>('[data-composer-input]')!, 'Tighten it.');
    await click(composerStart());
    const shown = $('[data-composer-refusal="platform_unsupported"]')!;
    expect(shown.textContent).toContain(t('docSession.error.platform_unsupported.message'));
    expect(shown.textContent).toContain(t('docSession.error.platform_unsupported.action'));
    expect(calls).toHaveLength(1);
    expect(hash()).toBe('#home');
    // The citation stays, so the user can start it from a console that can.
    expect($$('[data-composer-citation]')).toHaveLength(1);
    expect($('[data-stale]')).toBeNull();
  });

  test('a lost connection says the request may have run, and a retry resends the same request id', async () => {
    const { calls, write } = recording(props('busy').writeDocSessionCreate!, () => ({ state: 'unreachable' }));
    await mount(`#docs/${CONSOLE}`, { ...props('busy'), writeDocSessionCreate: write });
    await citeBlock(5);
    await typeInto($<HTMLTextAreaElement>('[data-composer-input]')!, 'Tighten it.');
    await click(composerStart());
    expect($('[data-composer-refusal="unreachable"]')?.textContent).toBe(t('docSession.write.unreachable'));
    await click(composerStart());
    expect(calls).toHaveLength(2);
    expect(calls[1]!.request_id).toBe(calls[0]!.request_id);
  });

  test('a runtime refusal links to Settings', async () => {
    for (const code of ['runtime_not_enabled', 'docs_isolation_unverified']) {
      const { write } = recording(props('busy').writeDocSessionCreate!, () => refusal(code, { message: 'x', next_action: 'y' }));
      await mount(`#docs/${CONSOLE}`, { ...props('busy'), writeDocSessionCreate: write });
      await citeBlock(5);
      await typeInto($<HTMLTextAreaElement>('[data-composer-input]')!, 'Tighten it.');
      await click(composerStart());
      expect($(`[data-composer-refusal="${code}"] [data-composer-settings]`)?.getAttribute('href')).toBe('#settings');
      await act(async () => root?.unmount());
      root = null;
      document.body.innerHTML = '';
    }
  });

  test('a list that fails with a typed reason keeps the composer, says why and starts nothing; no answer at all shows no session control', async () => {
    const readDocSessions = async (): Promise<DocSessionsRead> => ({ state: 'unavailable', reason: 'timeout' });
    await mount('#home', props('busy', { readDocSessions }));
    expect($('[data-doc-composer]')).not.toBeNull();
    expect($('[data-composer-sessions-failure="timeout"]')?.textContent).toContain(t('docSession.error.timeout.message'));
    expect(composerStart().disabled).toBe(true);
    // The list is never shown as empty: the failure takes its place.
    expect($('[data-continue-sessions-failure]')?.textContent).toContain(t('docSession.error.timeout.message'));
    // The rail lists sessions or nothing: it never shows an empty list for a list it could not read.
    expect($('[data-recent-sessions]')).toBeNull();
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    // No answer says nothing about the routes, so no session control shows.
    await mount('#home', props('busy', { readDocSessions: async () => ({ state: 'unavailable', reason: 'unreachable' }) }));
    for (const selector of ['[data-doc-composer]', '[data-new-session]', '[data-recent-sessions]', '[data-continue-sessions-failure]']) expect($(selector)).toBeNull();
  });
});

describe('citing on the Docs page', () => {
  test('4-DOCS-P1 a selected passage becomes a numbered path:line label, the agent list holds only docs-enabled runtimes, and Start opens the session', async () => {
    const base = props('busy');
    const settings = agentsSettingsFixture(NOW, 'busy');
    const read = async (): Promise<AgentsSettingsRead> => ({
      state: 'ok', settings: { ...settings, config: { ...settings.config, enabled: ['claude', 'codex', 'kimi'], uses: { docs: ['codex', 'kimi'], review: ['claude'] }, default_docs: 'kimi' } },
    });
    const { calls, write } = recording(base.writeDocSessionCreate!);
    await mount(`#docs/${CONSOLE}`, { ...base, readAgentsSettings: read, writeDocSessionCreate: write });
    expect($('[data-docs-composer] [data-doc-composer]')).not.toBeNull();
    // Select from the h2 at L3 through the paragraph at L5: one citation for L3–L5.
    const range = document.createRange();
    range.setStart($('[data-docs-body] [data-line="3"]')!.firstChild!, 0);
    range.setEnd($('[data-docs-body] [data-line="5"]')!.firstChild!, 8);
    await act(async () => {
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new window.Event('selectionchange') as unknown as Event);
    });
    expect($('[data-docs-cite-range]')?.getAttribute('data-docs-cite-range')).toBe('3-5');
    await click($('[data-docs-cite]'));
    expect($$('[data-composer-citation]').map(item => item.textContent)).toEqual([expect.stringContaining(`${CONSOLE}:L3–L5`)]);
    const file = fileOf(CONSOLE);
    // Only the runtimes enabled with the docs use; the saved default is preselected; the rest are managed in Settings.
    const select = $<HTMLSelectElement>('[data-composer-agent]')!;
    expect(Array.from(select.options, option => option.value)).toEqual(['codex', 'kimi']);
    expect(select.value).toBe('kimi');
    expect($('[data-composer-manage]')?.getAttribute('href')).toBe('#settings');
    expect($('[data-composer-manage]')?.textContent).toBe(t('composer.agent.manage'));
    await typeInto($<HTMLTextAreaElement>('[data-composer-input]')!, 'Shorten the section.');
    await click(composerStart());
    expect(calls[0]).toMatchObject({
      kind: 'docs', runtime: 'kimi',
      citations: [{ path: CONSOLE, start_line: 3, end_line: 5, range_sha256: sha256(file.lines.slice(2, 5).map(line => line.text).join('')), commit: DOCS_COMMIT }],
    });
    expect(hash()).toMatch(/^#session\/[0-9a-f]{32}$/u);
  });

  test('4-DOCS-P1 a read-only source file can be cited line by line', async () => {
    await mount(`#docs/${SETTINGS_YAML}`, props('busy'));
    const source = $('[data-docs-source]')!;
    const range = document.createRange();
    range.setStart(source.querySelector('li[data-line="2"]')!.firstChild!, 0);
    range.setEnd(source.querySelector('li[data-line="3"]')!.firstChild!, 4);
    await act(async () => {
      const selection = document.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new window.Event('selectionchange') as unknown as Event);
    });
    await click($('[data-docs-cite]'));
    expect($('[data-composer-citation]')?.getAttribute('data-composer-citation')).toBe(`${SETTINGS_YAML}:L2–L3`);
  });

  test('4-DOCS-P1 a file whose working copy differs keeps the note that citations use the commit', async () => {
    await mount(`#docs/${CONSOLE}`, props('busy'));
    expect($('[data-docs-dirty]')?.textContent).toContain(t('docs.dirty'));
    await citeBlock(5);
    expect($('[data-composer-citation]')).not.toBeNull();
  });

  test('4-DOCS-F1 citation_stale marks the citations and asks the user to cite again; citing again clears the mark', async () => {
    const { calls, write } = recording(props('busy').writeDocSessionCreate!, () => refusal('citation_stale'));
    await mount(`#docs/${CONSOLE}`, { ...props('busy'), writeDocSessionCreate: write });
    await citeBlock(5);
    await typeInto($<HTMLTextAreaElement>('[data-composer-input]')!, 'Tighten it.');
    await click(composerStart());
    const shown = $('[data-composer-refusal="citation_stale"]')!;
    expect(shown.textContent).toContain(t('docSession.error.citation_stale.message'));
    expect(shown.textContent).toContain(t('docSession.error.citation_stale.action'));
    expect($$('[data-composer-citation][data-stale]')).toHaveLength(1);
    expect(hash()).toBe(`#docs/${CONSOLE}`);
    // Removing the stale citation and citing the passage again starts from a clean draft.
    await click($('[aria-label^="Remove citation"]'));
    expect($$('[data-composer-citation]')).toHaveLength(0);
    expect($('[data-composer-refusal]')).toBeNull();
    await citeBlock(9);
    expect($$('[data-composer-citation][data-stale]')).toHaveLength(0);
    expect(calls).toHaveLength(1);
  });

  test('the draft takes at most 16 citations, each range once, and the instruction field has the server limit', async () => {
    expect(DOC_SESSION_MAX_CITATIONS).toBe(16);
    let draft = EMPTY_DOC_DRAFT;
    const citation = (line: number) => ({ path: CONSOLE, start_line: line, end_line: line, range_sha256: 'a'.repeat(64), file_sha256: 'b'.repeat(64), commit: DOCS_COMMIT });
    for (let line = 1; line <= DOC_SESSION_MAX_CITATIONS + 1; line++) draft = withCitation(draft, 'repo_a', citation(line));
    expect(draft.citations).toHaveLength(DOC_SESSION_MAX_CITATIONS);
    // The same range twice is one citation, and another repository starts a new set.
    expect(withCitation(draft, 'repo_a', citation(1)).citations).toHaveLength(DOC_SESSION_MAX_CITATIONS);
    expect(withCitation(draft, 'repo_b', citation(1))).toMatchObject({ repositoryId: 'repo_b', citations: [{ start_line: 1 }] });
    await mount(`#docs/${CONSOLE}`, props('busy'));
    expect($<HTMLTextAreaElement>('[data-composer-input]')!.maxLength).toBe(DOC_SESSION_MAX_INSTRUCTION);
  });
});

describe('the sidebar', () => {
  test('C10 the rail lists recent sessions in server order with an unread dot, and highlights the open one', async () => {
    await mount('#home', props('busy'));
    const rows = $$('[data-recent-session]');
    expect(rows.map(row => row.getAttribute('data-recent-session'))).toEqual([RUNNING_SESSION, REVIEW_SESSION, PR_SESSION]);
    expect(rows.map(row => row.textContent)).toEqual([
      expect.stringContaining('Tighten the reading column'), expect.stringContaining('Explain citation line numbers'), expect.stringContaining('Fix the changelog link'),
    ]);
    // Nothing is marked seen yet, so every session with an event is unread.
    expect($$('[data-recent-session] [data-unread]')).toHaveLength(3);
    expect($('[data-recent-session] [data-dot="accent"]')).not.toBeNull();
    expect($('[data-recent-sessions]')?.textContent).toContain(t('session.recent'));
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';

    markSessionSeen(REVIEW_SESSION, '1.99');
    expect(JSON.parse(localStorage.getItem(OPERATOR_SESSION_SEEN_STORAGE_KEY)!)[REVIEW_SESSION]).toBe('1.99');
    await mount(`#session/${RUNNING_SESSION}`, props('busy'));
    expect($$('[data-recent-session] [data-unread]')).toHaveLength(1);
    expect($(`[data-recent-session="${REVIEW_SESSION}"] [data-unread]`)).toBeNull();
    // The open session is highlighted and shows no dot.
    expect($(`[data-recent-session="${RUNNING_SESSION}"]`)?.getAttribute('aria-current')).toBe('page');
    expect($(`[data-recent-session="${PR_SESSION}"]`)?.getAttribute('aria-current')).toBeNull();
    expect($(`[data-recent-session="${RUNNING_SESSION}"] [data-unread]`)).toBeNull();
    await click($(`[data-recent-session="${PR_SESSION}"]`));
    expect(hash()).toBe(`#session/${PR_SESSION}`);
  });

  test('C10 「新会话」 opens Home and focuses the composer; a collapsed rail hides 「最近」', async () => {
    await mount(`#docs/${CONSOLE}`, props('busy'));
    expect($('[data-new-session]')?.textContent).toBe(t('session.new'));
    await click($('[data-new-session]'));
    expect(hash()).toBe('#home');
    expect(document.activeElement).toBe($('[data-composer-input]'));
    expect($('[data-recent-sessions]')?.className).not.toContain('rail:hidden');
    await click($('[data-rail-toggle]'));
    expect($('[data-nav-rail]')?.getAttribute('data-nav-rail')).toBe('collapsed');
    expect($('[data-recent-sessions]')?.className).toContain('rail:hidden');
    // The collapsed rail keeps the new session entry as an icon with its name for assistive tools.
    expect($('[data-new-session] span')?.className).toContain('rail:sr-only');
  });
});

describe('a server without doc sessions', () => {
  test('1-HOME-N1 an absent list renders no composer, agent select, start button or session row on Home', async () => {
    await mount('#home', props('degraded'));
    expect($('[data-home]')).not.toBeNull();
    for (const selector of ['[data-doc-composer]', '[data-composer-input]', '[data-composer-agent]', '[data-composer-start]', '[data-composer-cite]', '[data-continue-session]', '[data-continue-sessions-failure]']) {
      expect($(selector)).toBeNull();
    }
    expect($('main')?.textContent).not.toContain(t('composer.start'));
    expect($$('[data-continue-item]').length).toBeGreaterThan(0);
  });

  test('1-SHELL-N1 an absent list leaves the rail without 「新会话」 and 「最近」, and the Docs page without a cite action or composer', async () => {
    await mount(`#docs/${CONSOLE}`, props('degraded'));
    expect($('[data-new-session]')).toBeNull();
    expect($('[data-recent-sessions]')).toBeNull();
    expect($('aside')?.textContent).not.toContain(t('session.new'));
    expect($('aside')?.textContent).not.toContain(t('session.recent'));
    // The docs reader here is down in the degraded fixture; the busy file view answers the selection checks below.
    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    const listsNoDocs = async (): Promise<DocSessionsRead> => ({ state: 'ok', value: { protocol: 1, kind: 'operator_docs_sessions', kinds: ['worktree_cleanup'], sessions: [], observed_at: new Date().toISOString() } });
    await mount(`#docs/${CONSOLE}`, props('busy', { readDocSessions: listsNoDocs }));
    await selectBlock(5);
    expect($('[data-docs-cite]')).toBeNull();
    expect($('[data-doc-composer]')).toBeNull();
    expect($('[data-new-session]')).toBeNull();
  });

  test('1-SHELL-N1 #session/<id> and #cleanup/<id> with an absent list show Home and send no session read', async () => {
    const reads: string[] = [];
    const never = (name: string) => () => { reads.push(name); return new Promise<never>(() => {}); };
    const watched: Partial<OperatorAppProps> = {
      readDocSession: never('detail'), readDocSessionEvents: never('events'), readDocSessionDiff: never('diff'), readDocSessionLoss: never('loss'), readCleanupPlan: never('plan'),
    };
    for (const route of [`#session/${RUNNING_SESSION}`, `#cleanup/${CLEANUP_SESSION}`]) {
      await mount(route, props('degraded', watched));
      expect($('main')?.getAttribute('data-workspace')).toBe('home');
      expect($('[data-home]')).not.toBeNull();
      expect($('[data-doc-session-page]')).toBeNull();
      expect($('[data-cleanup-session-page]')).toBeNull();
      expect(hash()).toBe('#home');
      expect(reads).toEqual([]);
      await act(async () => root?.unmount());
      root = null;
      document.body.innerHTML = '';
    }

    // While the list is still loading, the session reads wait for its answer.
    await mount(`#session/${RUNNING_SESSION}`, props('busy', { ...watched, readDocSessions: () => new Promise<never>(() => {}) }));
    expect($('[data-doc-session-page]')).toBeNull();
    expect(reads).toEqual([]);
  });

  test('UX-operator-console-uiux-N1 the start surfaces send only docs-session requests and hold no control for a coding session', async () => {
    const { calls, write } = recording(props('busy').writeDocSessionCreate!);
    await mount(`#docs/${CONSOLE}`, { ...props('busy'), writeDocSessionCreate: write });
    await citeBlock(5);
    await typeInto($<HTMLTextAreaElement>('[data-composer-input]')!, 'Tighten it.');
    await click(composerStart());
    expect(calls).toHaveLength(1);
    expect(Object.keys(calls[0]!).sort()).toEqual(['citations', 'instruction', 'kind', 'repository_id', 'request_id', 'runtime']);
    expect(calls[0]!.kind).toBe('docs');
    // Home, the Docs page and the rail have no stop, steer, message or task-session control.
    for (const path of ['#home', `#docs/${CONSOLE}`]) {
      window.location.hash = path;
      await act(async () => { window.dispatchEvent(new window.Event('hashchange')); });
      await settle();
      const labels = $$('main button, aside button, main textarea, main input').map(control => `${control.textContent} ${control.getAttribute('aria-label') ?? ''} ${control.getAttribute('placeholder') ?? ''}`.toLowerCase());
      expect(labels.filter(label => /\b(stop|steer|interrupt|abort)\b|停止|插入本轮/u.test(label))).toEqual([]);
      // The only free-text field is the composer's instruction, and it starts a docs session.
      expect($$('main textarea')).toHaveLength(1);
    }
  });
});
