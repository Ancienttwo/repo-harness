import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readNotifyStatus } from '../../src/effects/operator/notify-status';
import { NotifyStatusPanel } from '../../src/operator-web/NotifyStatus';
import { translate } from '../../src/operator-web/i18n';
import { startOperatorServer } from '../../src/effects/operator/server';

const SECRET = 'fixture-secret-key-must-not-leak';
const SLACK = 'https://hooks.slack.example/services/T000/B000/secret-token';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rh-notify-status-'));
  const bin = join(root, 'bin');
  const config = join(root, 'config');
  const source = join(root, 'source');
  mkdirSync(bin);
  mkdirSync(config, { mode: 0o700 });
  mkdirSync(source, { mode: 0o700 });
  writeFileSync(join(source, 'herdr-plugin.toml'), 'id = "aimpact.webhook-notify"\n');
  writeFileSync(join(config, '.env'), `WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='${SECRET}'\nSLACK_WEBHOOK_URL='${SLACK}'\n`, { mode: 0o600 });
  const shim = join(bin, 'herdr');
  writeFileSync(shim, `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + '\\n');
const id = 'aimpact.webhook-notify';
if (args[0] === 'plugin' && args[1] === 'list') {
  const enabled = process.env.FIXTURE_ENABLED !== '0';
  const linked = process.env.FIXTURE_LINKED !== '0';
  console.log(JSON.stringify({ id: 'cli:plugin', result: { type: 'plugin_list', plugins: linked ? [{ plugin_id: id, enabled, plugin_root: process.env.FIXTURE_SOURCE }] : [] } }));
} else if (args[1] === 'config-dir') {
  if (process.env.FIXTURE_CONFIG_FAIL === '1') process.exit(1);
  console.log(process.env.FIXTURE_CONFIG);
} else if (args[1] === 'log') {
  console.log(process.env.FIXTURE_LOGS ?? '{"result":{"logs":[]}}');
}
`);
  chmodSync(shim, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FIXTURE_CALLS: join(root, 'calls.jsonl'),
    FIXTURE_CONFIG: config,
    FIXTURE_SOURCE: source,
    FIXTURE_ENABLED: '1',
    FIXTURE_LINKED: '1',
  };
  return { root, config, source, env, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('notify plugin status', () => {
  test('reports link, enable, config presence, and the last recorded delivery without secret values', async () => {
    const f = fixture();
    try {
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
        { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' },
        { finished_unix_ms: 1_700_000_100_000, status: 'succeeded', stderr: '' },
        { finished_unix_ms: 1_700_000_200_000, status: 'failed', stderr: '[webhook-notify] SLACK: HTTP 500\n' },
      ] } });
      const status = await readNotifyStatus({ env: f.env, now: new Date('2026-10-04T00:00:00.000Z') });
      expect(status).toMatchObject({
        linked: 'linked',
        enabled: 'enabled',
        config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
        last_delivery: { at: '2023-11-14T22:16:40.000Z', result: 'failed' },
      });
      expect(JSON.stringify(status)).not.toContain(SECRET);
      expect(JSON.stringify(status)).not.toContain(SLACK);
      expect(JSON.stringify(status)).not.toContain('bot.example');
    } finally { f.cleanup(); }
  });

  test('a missing plugin, config, or delivery stays missing and does not invent a success', async () => {
    const f = fixture();
    try {
      f.env.FIXTURE_LINKED = '0';
      f.env.FIXTURE_CONFIG_FAIL = '1';
      const status = await readNotifyStatus({ env: f.env, now: new Date('2026-10-04T00:00:00.000Z') });
      expect(status.linked).toBe('missing');
      expect(status.enabled).toBe('missing');
      expect(status.config).toEqual({ WEBHOOK_URL: 'missing', WEBHOOK_KEY: 'missing', SLACK_WEBHOOK_URL: 'missing' });
      expect(status.last_delivery).toEqual({ at: null, result: 'missing' });
    } finally { f.cleanup(); }
  });

  test('a linked plugin can be disabled, and an omitted Slack value is missing', async () => {
    const f = fixture();
    try {
      writeFileSync(join(f.config, '.env'), `WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='${SECRET}'\n`, { mode: 0o600 });
      f.env.FIXTURE_ENABLED = '0';
      const status = await readNotifyStatus({ env: f.env, now: new Date('2026-10-04T00:00:00.000Z') });
      expect(status.enabled).toBe('disabled');
      expect(status.config.SLACK_WEBHOOK_URL).toBe('missing');
      expect(JSON.stringify(status)).not.toContain(SECRET);
    } finally { f.cleanup(); }
  });

  test('a config symlink is not followed', async () => {
    const f = fixture();
    try {
      const outside = join(f.root, 'outside.env');
      writeFileSync(outside, `WEBHOOK_URL='https://hidden.example'\nWEBHOOK_KEY='hidden-secret'\n`);
      rmSync(join(f.config, '.env'));
      symlinkSync(outside, join(f.config, '.env'));
      const status = await readNotifyStatus({ env: f.env, now: new Date('2026-10-04T00:00:00.000Z') });
      expect(status.config.WEBHOOK_URL).toBe('missing');
      expect(JSON.stringify(status)).not.toContain('hidden');
    } finally { f.cleanup(); }
  });

  test('a failed attempt in the newest delivery event marks it failed, even after a success', async () => {
    const f = fixture();
    try {
      for (const [stderr, result] of [
        ['[webhook-notify] WEBHOOK: delivery failed.\n', 'failed'],
        ['[webhook-notify] WEBHOOK: HTTP 200\n[webhook-notify] SLACK: HTTP 404\n', 'failed'],
        ['[webhook-notify] WEBHOOK: HTTP 200\n[webhook-notify] SLACK: delivery failed.\n', 'failed'],
        ['[webhook-notify] WEBHOOK: HTTP 202\n[webhook-notify] SLACK: HTTP 200\n', 'succeeded'],
      ] as const) {
        f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
          { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' },
          { finished_unix_ms: 1_700_000_300_000, status: 'succeeded', stderr },
          { finished_unix_ms: 1_700_000_400_000, status: 'failed', stderr: '[webhook-notify] Invalid config, event, or state.\n' },
        ] } });
        const status = await readNotifyStatus({ env: f.env });
        expect(status.last_delivery).toEqual({ at: '2023-11-14T22:18:20.000Z', result });
      }
    } finally { f.cleanup(); }
  });

  test('the newest delivery is chosen by finish time, not by log array position', async () => {
    const f = fixture();
    try {
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
        { finished_unix_ms: 1_700_000_500_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 500\n' },
        { finished_unix_ms: 1_700_000_900_000, status: 'succeeded', stderr: '' },
        { status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' },
        { finished_unix_ms: 'later', status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' },
        { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' },
      ] } });
      const status = await readNotifyStatus({ env: f.env });
      expect(status.last_delivery).toEqual({ at: '2023-11-14T22:21:40.000Z', result: 'failed' });
    } finally { f.cleanup(); }
  });

  test('a status read from a secret-bearing config renders no secret value in the panel', async () => {
    const f = fixture();
    try {
      const status = await readNotifyStatus({ env: f.env });
      const markup = renderToStaticMarkup(createElement(NotifyStatusPanel, { initialStatus: status, t: key => translate('en', key) }));
      expect(markup).toContain('WEBHOOK_KEY');
      expect(markup).toContain('configured');
      expect(markup).not.toContain(SECRET);
      expect(markup).not.toContain(SLACK);
      expect(markup).not.toContain('bot.example');
      expect(markup).not.toContain(f.config);
    } finally { f.cleanup(); }
  });

  test('the operator route returns the same status and stays read-only', async () => {
    const f = fixture();
    const server = await startOperatorServer({
      port: 0,
      static_root: f.root,
      env: f.env,
    });
    try {
      const response = await fetch(`${server.url}/api/v1/notify/status`);
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).toContain('"linked":"linked"');
      expect(body).toContain('"WEBHOOK_KEY":"configured"');
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain(SLACK);
      const denied = await fetch(`${server.url}/api/v1/notify/status`, { method: 'POST' });
      expect(denied.status).toBe(405);
    } finally { await server.close(); f.cleanup(); }
  });
});
