import { beforeEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { OperatorApp } from '../../src/operator-web/App';
import { NotifyStatusPanel } from '../../src/operator-web/NotifyStatus';
import { stableSnapshot } from '../../src/operator-web/fixture';
import { translate } from '../../src/operator-web/i18n';
import { projectSnapshotViewState } from '../../src/operator-web/types';
import type { NotifyStatusV1 } from '../../src/core/operator/notify-status';

const SECRET = 'super-secret-webhook-key';
const URL = 'https://hooks.slack.example/services/SECRETPATH';

const status: NotifyStatusV1 = {
  protocol: 1,
  kind: 'operator_notify_status',
  plugin_id: 'aimpact.webhook-notify',
  linked: 'linked',
  enabled: 'enabled',
  config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'missing' },
  last_delivery: { at: '2026-10-04T01:02:03.000Z', result: 'succeeded' },
  observed_at: '2026-10-04T01:03:00.000Z',
};

const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate('en', key, values);

beforeEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('notify plugin status panel', () => {
  test('renders link, enable, presence, and the last delivery', () => {
    const markup = renderToStaticMarkup(<NotifyStatusPanel initialStatus={status} t={t} />);
    expect(markup).toContain('Notify plugin');
    expect(markup).toContain('aimpact.webhook-notify');
    expect(markup).toContain('linked');
    expect(markup).toContain('enabled');
    expect(markup).toContain('WEBHOOK_URL');
    expect(markup).toContain('configured');
    expect(markup).toContain('SLACK_WEBHOOK_URL');
    expect(markup).toContain('missing');
    expect(markup).toContain('2026-10-04T01:02:03.000Z');
    expect(markup).toContain('succeeded');
  });

  test('never renders secret values or write controls', () => {
    const markup = renderToStaticMarkup(
      <NotifyStatusPanel initialStatus={{
        ...status,
        config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
      }} t={t} />,
    );
    expect(markup).not.toContain(SECRET);
    expect(markup).not.toContain(URL);
    expect(markup).not.toContain('https://');
    expect(markup).not.toContain('<button');
    expect(markup).not.toContain('<input');
    expect(markup).not.toContain('<form');
  });

  test('the System page states a missing delivery without a control', () => {
    const markup = renderToStaticMarkup(
      <OperatorApp
        initialLocale="en"
        initialPlace={{ workspace: 'system', module: null, item: null }}
        initialState={projectSnapshotViewState(stableSnapshot)}
        initialNotifyStatus={{ ...status, last_delivery: { at: null, result: 'missing' }, enabled: 'disabled' }}
      />,
    );
    expect(markup).toContain('data-notify-state="ready"');
    expect(markup).toContain('disabled');
    expect(markup).toContain('no delivery recorded');
    expect(markup).not.toContain(SECRET);
    expect(markup).toContain('read-only');
  });
});
