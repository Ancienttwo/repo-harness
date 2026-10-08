import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { OperatorApp } from '../../src/operator-web/App';
import { PipelineBoardPanel, pipelineCardKey, type PipelineBoardReader } from '../../src/operator-web/PipelineBoard';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { translate } from '../../src/operator-web/i18n';
import { projectSnapshotViewState } from '../../src/operator-web/types';
import { decodeRuntimeOverlay, projectRuntimeOverlay, unavailableRuntimeOverlay, type RuntimeIdentity, type RuntimeObservation, type RuntimeOverlay, type RuntimePaneObservation } from '../../src/core/operator/runtime-status';
import type { PipelineBoardV2, PipelineCard } from '../../src/core/pipeline/board';

const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('en', key, values);

const REPOSITORY_ID = `sha256:${'ab'.repeat(32)}`;
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function card(overrides: Partial<PipelineCard> = {}): PipelineCard {
  return {
    source_host: 'max',
    repository_id: REPOSITORY_ID,
    task: 'task-pipeline-observer',
    id: 'pl-0001',
    repo: 'repo-harness',
    title: 'Pipeline observer',
    phase: 'merge-ask',
    admission: 'gate_qualified',
    state_version: 7,
    record_updated_at: '2026-10-04T12:00:00.000Z',
    phase_since: '2026-10-04T11:00:00.000Z',
    runs: [{ role: 'implementer', round: 1, status: 'ended', result_state: 'validated' }],
    blocked: null,
    subject: { base_sha: '866abc31aaaa', head_sha: 'a0326d33bbbb', tree_digest: 'sha256:0123456789ab', environment: 'bun-1.3' },
    approval: { attested: true, expired: false, expired_reason: null },
    external_fact: null,
    evidence: [{ kind: 'typecheck', source: 'verified', verdict: 'pass', current: true, count: 2 }],
    flags: ['waiting_owner'],
    ...overrides,
  };
}

function board(overrides: Partial<PipelineBoardV2> = {}): PipelineBoardV2 {
  const generated = minutesAgo(1);
  return {
    projection_version: 'repo-harness.pipeline-board.v2',
    status: 'ready',
    generated_at: generated,
    last_reconciled_at: generated,
    epoch: 3,
    commit_seq: 41,
    source_observed_at: { 'max:git': generated },
    coverage: { counted: 1, skipped: 0, errors: 0, registration_incomplete: 0 },
    cards: [card()],
    ...overrides,
  };
}

const render = (node: ReactNode) => renderToStaticMarkup(node);

beforeEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

function runtimeOverlay(state: RuntimeObservation['state'] = 'working', reason: RuntimeObservation['reason'] = 'unknown'): RuntimeOverlay {
  const identity: RuntimeIdentity = { source_host: 'max', repository_id: REPOSITORY_ID, task: 'task-pipeline-observer', role: 'implementer', round: 1,
    pipeline_state_version: 7, request_id: 'request-1', context_sha256: `sha256:${'b'.repeat(64)}`, runtime_session: 'runtime-1', attempt: 1,
    generation: 'intent-1', source_epoch: 0, herdr_session: 'fixture', terminal_id: 'terminal-1', pane_id: 'pane-1', agent_session: 'agent-1' };
  return projectRuntimeOverlay([identity], [{ identity, revision: 1, state, reason, changed_at: null, source: ['settled','error','cancelled','clear'].includes(state) || reason !== 'unknown' ? 'program-v1' : 'herdr-agent' }], minutesAgo(1), 0, 'v1', Date.now());
}

function paneOverlay(state: RuntimePaneObservation['state'] = 'working', reason: RuntimePaneObservation['reason'] = 'unknown', binding: RuntimeIdentity | null = runtimeOverlay().badges[0].identity): RuntimeOverlay {
  const identity = binding ?? runtimeOverlay().badges[0].identity;
  const pane = { source_host: identity.source_host, herdr_session: identity.herdr_session, terminal_id: identity.terminal_id, pane_id: identity.pane_id, agent_session: identity.agent_session };
  return projectRuntimeOverlay(binding ? [binding] : [], [], minutesAgo(1), 0, 'v1', Date.now(), true, binding ? 0 : 1,
    [{ scope: 'pane', source: 'osc7501', pane, binding, source_epoch: 4, revision: 1, state, reason, changed_at: '2020-01-01T00:00:00.000Z' }]);
}

describe('pipeline board panel', () => {
  test('renders board facts, coverage, source times and one card from the served snapshot', () => {
    const served = board();
    const markup = render(<PipelineBoardPanel initialBoard={served} t={t} />);
    expect(markup).toContain('data-pipeline-state="ready"');
    expect(markup).toContain('Pipeline ledger board');
    expect(markup).toContain(`title="${served.generated_at}"`);
    expect(markup).toContain('Source max:git');
    expect(markup).toContain('1 counted · 0 skipped · 0 errors · 0 registration incomplete');
    expect(markup).toContain('>41<');
    expect(markup).toContain('Pipeline observer');
    expect(markup).toContain('merge ask');
    expect(markup).toContain('gate qualified');
    expect(markup).toContain('waiting for owner');
    expect(markup).toContain('a0326d33bbbb');
    expect(markup).toContain(REPOSITORY_ID);
    expect(markup).toContain('implementer');
    expect(markup).toContain('result validated');
    expect(markup).toContain('typecheck · verified · pass · current × 2');
  });

  test('uses native details for bounded detail and has no write control or private path', () => {
    const markup = render(<PipelineBoardPanel initialBoard={board({ cards: [card({
      blocked: 'review requested changes',
      external_fact: { source: 'github', approval_not_recorded: true, confirmed_deviation: false, squash_commit: 'c0ffee123456' },
      approval: { attested: false, expired: true, expired_reason: 'head moved' },
    })] })} t={t} />);
    expect(markup).toContain('<details class="pipeline-card__detail"><summary>Record detail</summary>');
    expect(markup).toContain('Blocked: review requested changes');
    expect(markup).toContain('recorded from github');
    expect(markup).toContain('c0ffee123456');
    expect(markup).toContain('head moved');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<form');
    expect(markup).not.toContain('/Users/');
    expect(markup).not.toContain('http');
  });

  test('card keys stay distinct when host or task values contain the delimiter', () => {
    const first = card({ source_host: 'max', task: `x:${REPOSITORY_ID}:y` });
    const second = card({ source_host: `max:${REPOSITORY_ID}:x`, task: 'y' });
    const joined = (c: PipelineCard) => `${c.source_host}:${c.repository_id}:${c.task}`;
    expect(joined(first)).toBe(joined(second));
    expect(pipelineCardKey(first)).not.toBe(pipelineCardKey(second));
  });

  test('renders an unknown server value as its own text', () => {
    const markup = render(<PipelineBoardPanel initialBoard={board({ cards: [card({ phase: 'future-phase', flags: ['new_flag'] })] })} t={t} />);
    expect(markup).toContain('future-phase');
    expect(markup).toContain('new_flag');
  });

  test('labels loading, empty, partial, stale and unavailable as distinct states', () => {
    const loading = render(<PipelineBoardPanel t={t} />);
    expect(loading).toContain('data-pipeline-state="loading"');
    expect(loading).toContain('Reading the pipeline board…');

    const empty = render(<PipelineBoardPanel initialBoard={board({ status: 'empty', cards: [] })} t={t} />);
    expect(empty).toContain('data-pipeline-state="empty"');
    expect(empty).toContain('The ledger has no pipeline records.');

    const partial = render(<PipelineBoardPanel initialBoard={board({ status: 'partial', coverage: { counted: 1, skipped: 0, errors: 2, registration_incomplete: 1 } })} t={t} />);
    expect(partial).toContain('data-pipeline-state="partial"');
    expect(partial).toContain('Snapshot is partial');
    expect(partial).toContain('2 errors · 1 registration incomplete');

    const stale = render(<PipelineBoardPanel initialBoard={board({ status: 'stale' })} t={t} />);
    expect(stale).toContain('data-pipeline-state="stale"');
    expect(stale).toContain('Snapshot is stale');

    const old = '2020-01-01T00:00:00.000Z';
    const staleByAge = render(<PipelineBoardPanel initialBoard={board({ generated_at: old })} t={t} />);
    expect(staleByAge).toContain('data-pipeline-state="stale"');
    expect(staleByAge).toContain(`title="${old}"`);

    const unavailable = render(<PipelineBoardPanel initialBoard={board({ status: 'unavailable', generated_at: null, cards: [] })} t={t} />);
    expect(unavailable).toContain('data-pipeline-state="unavailable"');
    expect(unavailable).toContain('Pipeline board unavailable');
  });

  test('runtime badges distinguish source activity, typed reasons and result acceptance without changing the ledger', () => {
    const served = board(), before = JSON.stringify(served);
    for (const [state, label] of [['working','Working'],['idle','Idle'],['blocked','Blocked'],['done-unseen','Idle · not seen'],['settled','Agent settled'],['error','Reported error'],['cancelled','Reported cancellation']] as const) {
      const markup = render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={runtimeOverlay(state)} t={t} />);
      expect(markup).toContain(`data-runtime-state="${state}"`); expect(markup).toContain(label);
      expect(markup).toContain('result validated'); expect(markup).toContain('merge ask');
      expect(markup).not.toContain('/private/'); expect(markup).not.toContain('<button');
    }
    const cleared = render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={runtimeOverlay('clear')} t={t} />);
    expect(cleared).toContain('data-runtime-state="unknown"');
    expect(cleared).not.toContain('data-runtime-state="clear"'); expect(cleared).not.toContain('Status cleared');
    expect(cleared).toContain('result validated'); expect(cleared).toContain('merge ask');
    for (const [reason, label] of [['permission','Permission needed'],['question','Answer needed'],['auth','Sign-in needed'],['unknown','Reason unknown']] as const) {
      expect(render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={runtimeOverlay('blocked', reason)} t={t} />)).toContain(label);
    }
    expect(JSON.stringify(served)).toBe(before);
  });

  test('runtime age, disconnect and ambiguous or changed card identity remain separate from state', () => {
    const served = board(), current = runtimeOverlay();
    const old = { ...current, observed_at: '2020-01-01T00:00:00.000Z' };
    const stale = render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={old} t={t} />);
    expect(stale).toContain('data-runtime-state="working"'); expect(stale).toContain('data-runtime-freshness="stale"');
    const disconnected = { ...current, status: 'unavailable' as const, badges: current.badges.map(b => ({ ...b, freshness: 'disconnected' as const })) };
    expect(render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={disconnected} t={t} />)).toContain('Source disconnected');
    for (const change of [{ source_host: 'other' }, { repository_id: `sha256:${'c'.repeat(64)}` }, { task: 'other' }, { state_version: 8 }, { runs: [{ role: 'reviewer', round: 1, status: 'running', result_state: 'missing' }] }]) {
      const markup = render(<PipelineBoardPanel initialBoard={board({ cards: [card(change)] })} initialRuntimeOverlay={current} t={t} />);
      expect(markup).toContain('data-runtime-state="unknown"'); expect(markup).not.toContain('data-runtime-state="working"');
    }
    const ambiguous = { ...current, badges: [...current.badges, { ...current.badges[0], identity: { ...current.badges[0].identity, request_id: 'request-2', attempt: 2 } }] };
    expect(render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={ambiguous} t={t} />)).toContain('data-runtime-state="unknown"');
    expect(render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={{ ...current, unclaimed: 3 }} t={t} />)).toContain('3 unclaimed panes');
  });

  test('suppresses obsolete role rounds even when card state version and terminal identity are unchanged', () => {
    const currentBoard = board({ cards: [card({ runs: [
      { role: 'implementer', round: 1, status: 'ended', result_state: 'validated' },
      { role: 'implementer', round: 2, status: 'running', result_state: 'missing' },
    ] })] });
    const old = runtimeOverlay('working');
    const oldOnly = render(<PipelineBoardPanel initialBoard={currentBoard} initialRuntimeOverlay={old} t={t} />);
    expect(oldOnly).toContain('data-runtime-state="unknown"');
    expect(oldOnly).not.toContain('data-runtime-state="working"');
    const latest = runtimeOverlay('blocked');
    latest.badges[0].identity = { ...latest.badges[0].identity, round: 2, attempt: 2, request_id: 'request-2' };
    const both = { ...latest, badges: [...old.badges, ...latest.badges] };
    const markup = render(<PipelineBoardPanel initialBoard={currentBoard} initialRuntimeOverlay={both} t={t} />);
    expect(markup).toContain('data-runtime-state="blocked"');
    expect(markup).not.toContain('data-runtime-state="working"');
    expect(markup).toContain('merge ask');
  });

  test('shows the first terminal report as a separate fact without changing task results', () => {
    const served = board(), before = JSON.stringify(served);
    for (const [state, label] of [['working', 'Working'], ['idle', 'Idle'], ['settled', 'Activity ended · review needed'], ['error', 'Reported error']] as const) {
      const markup = render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={paneOverlay(state)} t={t} />);
      expect(markup).toContain('Linked terminal report');
      expect(markup).toContain("This is the terminal&#x27;s latest report. It does not prove progress or acceptance for this task round.");
      expect(markup).toContain(`data-runtime-pane-state="${state}"`);
      expect(markup).toContain(label);
      expect(markup).toContain('data-runtime-state="unknown"');
      expect(markup).toContain('result validated');
      expect(markup).toContain('merge ask');
      expect(markup).not.toContain('Reported cancellation');
      expect(markup).not.toContain('<button');
      expect(markup).not.toContain('<form');
      expect(markup).not.toContain('request-1');
      expect(markup).not.toContain('runtime-1');
      expect(markup).not.toContain('/private/');
    }
    expect(JSON.stringify(served)).toBe(before);
    const taskRuntime = runtimeOverlay('idle');
    const both = { ...taskRuntime, pane_observations: paneOverlay().pane_observations };
    const markup = render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={both} t={t} />);
    expect(markup).toContain('data-runtime-state="idle"');
    expect(markup).toContain('data-runtime-pane-state="working"');
    const cleared = render(<PipelineBoardPanel initialBoard={served} initialRuntimeOverlay={paneOverlay('clear')} t={t} />);
    expect(cleared).not.toContain('Linked terminal report');
    expect(cleared).not.toContain('data-runtime-pane-state');
    expect(cleared).toContain('result validated');
    expect(cleared).toContain('merge ask');
  });

  test('shows terminal block reasons and both locales without task acceptance claims', () => {
    for (const [reason, label] of [['permission', 'Permission needed'], ['question', 'Answer needed'], ['auth', 'Sign-in needed'], ['unknown', 'Reason unknown']] as const) {
      const markup = render(<PipelineBoardPanel initialBoard={board()} initialRuntimeOverlay={paneOverlay('blocked', reason)} t={t} />);
      expect(markup).toContain('data-runtime-pane-state="blocked"');
      expect(markup).toContain(label);
      expect(markup).toContain('result validated');
      expect(markup).toContain('merge ask');
    }
    const zh: typeof t = (key, values) => translate('zh', key, values);
    const markup = render(<PipelineBoardPanel initialBoard={board()} initialRuntimeOverlay={paneOverlay('settled')} t={zh} />);
    expect(markup).toContain('关联终端报告');
    expect(markup).toContain('这是该终端最近的报告。它不证明本轮任务进度或验收结果。');
    expect(markup).toContain('活动已结束 · 待查看');
  });

  test('uses terminal snapshot freshness and does not treat an old change time as loss of connection', () => {
    const overlay = paneOverlay();
    for (const freshness of ['fresh', 'stale', 'disconnected'] as const) {
      const snapshot = { ...overlay, pane_observations: overlay.pane_observations.map(report => ({ ...report, freshness })) };
      const markup = render(<PipelineBoardPanel initialBoard={board()} initialRuntimeOverlay={snapshot} t={t} />);
      expect(markup).toContain('data-runtime-pane-state="working"');
      expect(markup).toContain(`data-runtime-pane-freshness="${freshness}"`);
      expect(markup).toContain('result validated');
      expect(markup).toContain('merge ask');
    }
  });

  test('ages a retained terminal snapshot while preserving source disconnection', () => {
    const retained = { ...paneOverlay(), observed_at: minutesAgo(6) };
    const markup = render(<PipelineBoardPanel initialBoard={board()} initialRuntimeOverlay={retained} t={t} />);
    expect(markup).toContain('data-runtime-pane-state="working"');
    expect(markup).toContain('data-runtime-pane-freshness="stale"');
    expect(markup).not.toContain('data-runtime-pane-freshness="fresh"');
    const disconnected = { ...retained, pane_observations: retained.pane_observations.map(report => ({ ...report, freshness: 'disconnected' as const })) };
    const offline = render(<PipelineBoardPanel initialBoard={board()} initialRuntimeOverlay={disconnected} t={t} />);
    expect(offline).toContain('data-runtime-pane-freshness="disconnected"');
    expect(offline).not.toContain('data-runtime-pane-freshness="stale"');
  });

  test('does not attach unbound, ambiguous or obsolete terminal reports to a card', () => {
    const current = paneOverlay();
    for (const change of [{ source_host: 'other' }, { repository_id: `sha256:${'c'.repeat(64)}` }, { task: 'other' }, { state_version: 8 }, { runs: [{ role: 'reviewer', round: 1, status: 'running', result_state: 'missing' }] }, { runs: [
      { role: 'implementer', round: 1, status: 'ended', result_state: 'validated' },
      { role: 'implementer', round: 2, status: 'running', result_state: 'missing' },
    ] }]) {
      const markup = render(<PipelineBoardPanel initialBoard={board({ cards: [card(change)] })} initialRuntimeOverlay={current} t={t} />);
      expect(markup).not.toContain('Linked terminal report');
      expect(markup).not.toContain('data-runtime-pane-state');
    }
    const unbound = render(<PipelineBoardPanel initialBoard={board()} initialRuntimeOverlay={paneOverlay('working', 'unknown', null)} t={t} />);
    expect(unbound).not.toContain('Linked terminal report');
    expect(unbound).toContain('1 unclaimed panes');
    const first = current.pane_observations[0];
    const second = { ...first, pane: { ...first.pane, pane_id: 'pane-2' }, binding: { ...first.binding!, pane_id: 'pane-2', request_id: 'request-2', attempt: 2 } };
    const ambiguous = render(<PipelineBoardPanel initialBoard={board()} initialRuntimeOverlay={{ ...current, pane_observations: [first, second] }} t={t} />);
    expect(ambiguous).not.toContain('Linked terminal report');
    expect(ambiguous).not.toContain('data-runtime-pane-state');
    const latest = { ...first.binding!, round: 2 };
    const latestMarkup = render(<PipelineBoardPanel initialBoard={board({ cards: [card({ runs: [{ role: 'implementer', round: 2, status: 'running', result_state: 'missing' }] })] })} initialRuntimeOverlay={paneOverlay('working', 'unknown', latest)} t={t} />);
    expect(latestMarkup).toContain('data-runtime-pane-state="working"');
  });

  test('mounts in the organization tab panel', () => {
    const markup = render(
      <OperatorApp initialLocale="en" initialState={projectSnapshotViewState(stableSnapshot)} initialPipelineBoard={board()} />,
    );
    const organization = markup.slice(markup.indexOf('id="view-panel-organization"'));
    expect(organization).toContain('data-pipeline-state="ready"');
  });
});

describe('pipeline board refresh', () => {
  let window: Window;
  let root: Root;

  beforeEach(() => {
    window = new Window({ url: 'http://127.0.0.1:4318' });
    Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, Event: window.Event, IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    await window.happyDOM.close();
  });

  const panel = () => document.querySelector('.pipeline-board')!;
  const visibilityChange = () => act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

  test('keeps the last good snapshot and its times after a refresh failure', async () => {
    const served = board();
    let calls = 0;
    const read: PipelineBoardReader = async () => {
      calls += 1;
      if (calls === 1) return served;
      throw new Error('pipeline_board_unavailable');
    };
    await act(async () => root.render(<PipelineBoardPanel readBoard={read} t={t} />));
    expect(panel().getAttribute('data-pipeline-state')).toBe('ready');

    await visibilityChange();
    expect(calls).toBe(2);
    expect(panel().getAttribute('data-pipeline-state')).toBe('refresh-failed');
    expect(panel().textContent).toContain('Refresh failed');
    expect(panel().textContent).toContain('Pipeline observer');
    expect(panel().querySelector(`time[datetime="${served.generated_at}"]`)).not.toBeNull();
  });

  test('a first read failure is unavailable, with no board shown', async () => {
    await act(async () => root.render(<PipelineBoardPanel readBoard={async () => { throw new Error('down'); }} t={t} />));
    expect(panel().getAttribute('data-pipeline-state')).toBe('unavailable');
    expect(panel().querySelector('.pipeline-cards')).toBeNull();
  });

  test('the default reader decodes the served board with the shared decoder', async () => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];
    let body: unknown = board();
    globalThis.fetch = (async (input: string) => {
      requested.push(input);
      return new Response(JSON.stringify(input === '/api/v1/runtime/status' ? unavailableRuntimeOverlay() : body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    try {
      await act(async () => root.render(<PipelineBoardPanel t={t} />));
      expect(requested).toEqual(['/api/v1/pipelines', '/api/v1/runtime/status']);
      expect(panel().getAttribute('data-pipeline-state')).toBe('ready');

      body = board({ cards: [card({ repository_id: '/Users/someone/private-repo' })] });
      await visibilityChange();
      expect(requested.filter(path => path === '/api/v1/pipelines')).toHaveLength(2);
      expect(requested.filter(path => path === '/api/v1/runtime/status')).toHaveLength(2);
      expect(panel().getAttribute('data-pipeline-state')).toBe('refresh-failed');
      expect(panel().textContent).not.toContain('/Users/');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('the default reader rejects a served absolute path under /opt or /var and shows no path', async () => {
    const originalFetch = globalThis.fetch;
    let body: unknown = board({ cards: [card({ subject: { ...card().subject!, environment: '/opt/homebrew/bin/bun' } })] });
    globalThis.fetch = (async () => new Response(JSON.stringify(body), {
      status: 200, headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
    try {
      await act(async () => root.render(<PipelineBoardPanel t={t} />));
      expect(panel().getAttribute('data-pipeline-state')).toBe('unavailable');
      expect(panel().querySelector('.pipeline-cards')).toBeNull();
      expect(panel().textContent).not.toContain('/opt/');

      const served = board();
      body = served;
      await visibilityChange();
      expect(panel().getAttribute('data-pipeline-state')).toBe('ready');

      body = board({ cards: [card({ blocked: 'gate failed in /var/folders/nz/T/worktree' })] });
      await visibilityChange();
      expect(panel().getAttribute('data-pipeline-state')).toBe('refresh-failed');
      expect(panel().querySelector(`time[datetime="${served.generated_at}"]`)).not.toBeNull();
      expect(panel().textContent).not.toContain('/var/');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  test('runtime refresh failure keeps badge age; obsolete HTTP response cannot replace a newer observation', async () => {
    const served = runtimeOverlay(), pending: ((value: RuntimeOverlay) => void)[] = [];
    let calls = 0;
    const read = () => { calls++; return new Promise<RuntimeOverlay>(resolve => pending.push(resolve)); };
    await act(async () => root.render(<PipelineBoardPanel initialBoard={board()} readRuntimeStatus={read} t={t} />));
    expect(calls).toBe(1);
    await act(async () => root.render(<PipelineBoardPanel initialBoard={board()} readRuntimeStatus={read} refreshGeneration={1} t={t} />));
    await act(async () => pending[0](runtimeOverlay('idle')));
    expect(panel().querySelector('[data-runtime-state="idle"]')).toBeNull();
    await act(async () => pending.at(-1)!(served));
    expect(panel().querySelector('[data-runtime-state="working"]')).not.toBeNull();
    const fail = async () => { throw new Error('fixture'); };
    await act(async () => root.render(<PipelineBoardPanel initialBoard={board()} readRuntimeStatus={fail} refreshGeneration={2} t={t} />));
    expect(panel().querySelector('[data-runtime-state="working"]')).not.toBeNull();
    expect(panel().querySelector(`[datetime="${served.observed_at}"]`)).not.toBeNull();
    expect(panel().textContent).toContain('Runtime refresh failed');
  });

  test('runtime decoder rejects private payloads and preserves the last good observation', async () => {
    let value: unknown = runtimeOverlay();
    const read = async () => decodeRuntimeOverlay(value);
    await act(async () => root.render(<PipelineBoardPanel initialBoard={board()} readRuntimeStatus={read} t={t} />));
    expect(panel().querySelector('[data-runtime-state="working"]')).not.toBeNull();
    value = { ...runtimeOverlay(), raw_terminal: '/private/auth-secret' }; await visibilityChange();
    expect(panel().textContent).not.toContain('auth-secret'); expect(panel().textContent).toContain('Runtime refresh failed');
  });

});
