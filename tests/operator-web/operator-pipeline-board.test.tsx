import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { OperatorApp } from '../../src/operator-web/App';
import { PipelineBoardPanel, type PipelineBoardReader } from '../../src/operator-web/PipelineBoard';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { translate } from '../../src/operator-web/i18n';
import { projectSnapshotViewState } from '../../src/operator-web/types';
import type { PipelineBoardV2, PipelineCard } from '../../src/core/pipeline/projection';

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
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    try {
      await act(async () => root.render(<PipelineBoardPanel t={t} />));
      expect(requested).toEqual(['/api/v1/pipelines']);
      expect(panel().getAttribute('data-pipeline-state')).toBe('ready');

      body = board({ cards: [card({ repository_id: '/Users/someone/private-repo' })] });
      await visibilityChange();
      expect(requested).toHaveLength(2);
      expect(panel().getAttribute('data-pipeline-state')).toBe('refresh-failed');
      expect(panel().textContent).not.toContain('/Users/');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
