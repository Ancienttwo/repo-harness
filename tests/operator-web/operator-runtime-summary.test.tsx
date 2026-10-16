import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { RuntimeSummary, useRuntimeOverlay, type RuntimeOverlayReader } from '../../src/operator-web/RuntimeBadges';
import { translate } from '../../src/operator-web/i18n';
import { decodeRuntimeOverlay, unavailableRuntimeOverlay, type NativeRuntimeSourceSummary, type RuntimeOverlay } from '../../src/core/operator/runtime-status';

const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('en', key, values);
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const render = (node: ReactNode) => renderToStaticMarkup(node);
beforeEach(() => { delete (globalThis as { window?: unknown }).window; });
function RuntimePanel({ readRuntimeStatus, initialRuntimeOverlay, refreshGeneration = 0, t: tr = t }: { readRuntimeStatus?: RuntimeOverlayReader; initialRuntimeOverlay?: RuntimeOverlay; refreshGeneration?: number; t?: typeof t }) {
  const view = useRuntimeOverlay(readRuntimeStatus ?? (async () => initialRuntimeOverlay!), initialRuntimeOverlay, true, refreshGeneration);
  return <section className="runtime-panel"><RuntimeSummary view={view} now={Date.now()} t={tr} /></section>;
}
function nativeSource(overrides: Partial<NativeRuntimeSourceSummary> = {}): NativeRuntimeSourceSummary {
  return { source_id: 'codex-capture', provider: 'codex', generation: '12345678-1234-4234-8234-123456789012',
    capture_status: 'connected', heartbeat_at: minutesAgo(1), freshness: 'fresh',
    observations: [{ scope: 'session', session_id: 'thread-native', turn_id: 'turn-native', state: 'working', reason: 'unknown',
      event_received_at: '2020-01-01T00:00:00.000Z', changed_at: null }], ...overrides };
}
function nativeOverlay(sources: NativeRuntimeSourceSummary[]): RuntimeOverlay {
  return { ...unavailableRuntimeOverlay(), status: 'ready', observed_at: minutesAgo(1), native_sources: sources };
}

describe('native runtime summary', () => {
  test('native sessions stay outside task cards and do not change task acceptance', () => {
    const served = nativeOverlay([nativeSource()]), before = JSON.stringify(served);
    const markup = render(<RuntimePanel initialRuntimeOverlay={served} t={t} />);
    expect(markup).toContain('Native session / terminal observations (not linked to tasks)');
    expect(markup).toContain('codex · codex-capture');
    expect(markup).toContain('Session');
    expect(markup).toContain('thread-native');
    expect(markup).toContain('data-native-state="working"');
    expect(markup).not.toContain('unclaimed panes');
    expect(markup).not.toContain('herdr_session');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<input');
    expect(JSON.stringify(served)).toBe(before);
  });

  test('native terminal providers show typed blocked reasons and ending is not acceptance', () => {
    for (const provider of ['claude', 'pi'] as const) {
      for (const [reason, label] of [['permission', 'Permission needed'], ['question', 'Answer needed'], ['auth', 'Sign-in needed'], ['unknown', 'Reason unknown']] as const) {
        const source = nativeSource({ provider, source_id: provider + '-capture', observations: [{ scope: 'terminal', session_id: null, turn_id: null,
          state: 'blocked', reason, event_received_at: minutesAgo(1), changed_at: '2020-01-01T00:00:00.000Z' }] });
        const markup = render(<RuntimePanel initialRuntimeOverlay={nativeOverlay([source])} t={t} />);
        expect(markup).toContain(provider + ' · ' + provider + '-capture');
        expect(markup).toContain('Terminal');
        expect(markup).toContain('data-native-state="blocked"');
        expect(markup).toContain(label);
        expect(markup).toContain('Provider change time');
      }
    }
    for (const state of ['unknown', 'idle', 'settled', 'error', 'cancelled'] as const) {
      const source = nativeSource(); source.observations[0].state = state;
      const markup = render(<RuntimePanel initialRuntimeOverlay={nativeOverlay([source])} t={t} />);
      expect(markup).toContain(`data-native-state="${state}"`);
      if (state === 'idle') expect(markup).not.toContain('Reported cancellation');
      if (state === 'settled') expect(markup).toContain('Activity ended · no task acceptance');
    }
  });

  test('native empty and cleared reports do not invent Idle; unavailable and disconnected stay explicit', () => {
    for (const capture_status of ['connected', 'unavailable', 'disconnected'] as const) {
      const source = nativeSource({ capture_status, freshness: capture_status === 'connected' ? 'fresh' : capture_status,
        heartbeat_at: capture_status === 'unavailable' ? null : minutesAgo(1), generation: capture_status === 'unavailable' ? null : nativeSource().generation, observations: [] });
      const markup = render(<RuntimePanel initialRuntimeOverlay={nativeOverlay([source])} t={t} />);
      expect(markup).toContain('No native report received');
      expect(markup).not.toContain('data-native-state');
      expect(markup).toContain(`data-native-capture="${capture_status}"`);
      expect(markup).toContain(`data-native-freshness="${source.freshness}"`);
      expect(markup).not.toContain('unclaimed panes');
    }
    const disconnected = nativeSource({ capture_status: 'disconnected', freshness: 'disconnected', heartbeat_at: minutesAgo(10) });
    const markup = render(<RuntimePanel initialRuntimeOverlay={nativeOverlay([disconnected])} t={t} />);
    expect(markup).toContain('data-native-state="working"');
    expect(markup).toContain('data-native-freshness="disconnected"');
    expect(markup).not.toContain('data-native-freshness="stale"');
  });

  test('native freshness uses each capture heartbeat, not event age or overlay observation time', () => {
    const sources = [nativeSource(), nativeSource({ source_id: 'old-capture', heartbeat_at: minutesAgo(6) })];
    const overlay = { ...nativeOverlay(sources), observed_at: '2020-01-01T00:00:00.000Z' };
    const markup = render(<RuntimePanel initialRuntimeOverlay={overlay} t={t} />);
    const first = markup.slice(markup.indexOf('data-native-source="codex-capture"'), markup.indexOf('data-native-source="old-capture"'));
    const old = markup.slice(markup.indexOf('data-native-source="old-capture"'), markup.length);
    expect(first).toContain('data-native-freshness="fresh"');
    expect(first).toContain('Status event received');
    expect(first).toContain('title="2020-01-01T00:00:00.000Z"');
    expect(first).toContain('Capture heartbeat');
    expect(old).toContain('data-native-freshness="stale"');
    expect(old).not.toContain('data-native-freshness="fresh"');
  });

  test('native boundary and source labels are readable in Chinese', () => {
    const zh = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('zh', key, values);
    const markup = render(<RuntimePanel initialRuntimeOverlay={nativeOverlay([nativeSource({ observations: [] })])} t={zh} />);
    expect(markup).toContain('原生会话/终端观察（未关联任务）');
    expect(markup).toContain('未收到原生报告');
    expect(markup).toContain('采集心跳不表示 agent 进度');
    expect(markup).toContain('采集心跳当前有效');
  });

});

describe('native runtime refresh', () => {
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

  const panel = () => document.querySelector('.runtime-panel')!;
  const visibilityChange = () => act(async () => { document.dispatchEvent(new Event('visibilitychange')); });

  test('native cache ages per source across repeated HTTP failures and rejects private fields', async () => {
    const current = nativeOverlay([nativeSource(), nativeSource({ source_id: 'old-capture', heartbeat_at: minutesAgo(6) })]);
    let value: unknown = current;
    const read = async () => decodeRuntimeOverlay(value);
    await act(async () => root.render(<RuntimePanel readRuntimeStatus={read} t={t} />));
    expect(panel().querySelector('[data-native-source="codex-capture"] [data-native-freshness="fresh"]')).not.toBeNull();
    value = { ...current, native_sources: [{ ...current.native_sources[0], raw_terminal: '/private/auth-secret' }] };
    const originalNow = Date.now;
    Date.now = () => originalNow() + 6 * 60_000;
    try {
      await visibilityChange();
      await visibilityChange();
      expect(panel().textContent).toContain('Runtime refresh failed');
      expect(panel().textContent).not.toContain('auth-secret');
      expect(panel().querySelectorAll('[data-native-freshness="stale"]')).toHaveLength(2);
      expect(panel().querySelector('[data-native-freshness="fresh"]')).toBeNull();
      expect(panel().querySelector('[data-native-freshness="disconnected"]')).toBeNull();
      expect(panel().querySelector('[data-native-state="working"]')).not.toBeNull();
      expect(panel().querySelector(`[datetime="${current.native_sources[0].heartbeat_at}"]`)).not.toBeNull();
    } finally { Date.now = originalNow; }
  });

  test('cleared native snapshot removes its old report without making task Idle', async () => {
    let value = nativeOverlay([nativeSource()]);
    const read = async () => value;
    await act(async () => root.render(<RuntimePanel readRuntimeStatus={read} t={t} />));
    expect(panel().querySelector('[data-native-state="working"]')).not.toBeNull();
    value = nativeOverlay([nativeSource({ observations: [] })]);
    await visibilityChange();
    expect(panel().querySelector('[data-native-state]')).toBeNull();
    expect(panel().textContent).toContain('No native report received');
    expect(panel().querySelector('[data-runtime-state="idle"]')).toBeNull();
  });

});
