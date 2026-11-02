import { describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startNotifyCollector, type NotifyCacheV1 } from '../../src/effects/operator/notify-collector';
import { NotifyStatusUnavailableError, readNotifyChannelStatus, type NotifyStatusReadInput } from '../../src/effects/operator/notify-status';
import { NotifyStatusPanel } from '../../src/operator-web/NotifyStatus';
import { translate } from '../../src/operator-web/i18n';
import { startOperatorServer } from '../../src/effects/operator/server';
import { notifyConfigPath, notifyDeliveriesPath, notifyInstallRecordPath, writeNotifyInstallRecord } from '../../src/effects/terminal/herdr-notify-install';

const SECRET = 'fixture-secret-key-must-not-leak';

const validDelivery = {
  status: {
    protocol: 2, kind: 'operator_notify_status', relay: 'live',
    config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
    last_delivery: { at: null, result: 'succeeded' }, observed_at: '2026-10-27T00:00:00.000Z',
  },
  channels: { webhook: 'configured', slack: 'configured', discord: 'configured', telegram: 'configured' },
  deliveries: {
    webhook: { at: null, result: 'succeeded' }, slack: { at: null, result: 'succeeded' },
    discord: { at: null, result: 'succeeded' }, telegram: { at: null, result: 'succeeded' },
  },
} as const;

/** The relay status part of one read; most cases here assert only that part. */
const readNotifyStatus = async (input: NotifyStatusReadInput) => (await readNotifyChannelStatus(input)).status;

async function unavailableCode(read: Promise<unknown>): Promise<string | null> {
  try { await read; return null; } catch (error) { return error instanceof NotifyStatusUnavailableError ? error.code : String(error); }
}
const SLACK = 'https://hooks.slack.example/services/T000/B000/secret-token';
const RELAY = { address: 't9', name: 'rh-notify-relay', state: 'live' };

/** A fake `hc` on PATH: `ls` answers from FIXTURE_RELAY (live, none, finished, fail or hang) and records each call. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rh-notify-status-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const shim = join(bin, 'hc');
  writeFileSync(shim, `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(argv) + '\\n');
const relay = process.env.FIXTURE_RELAY;
if (relay === 'hang') { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); }
else if (relay === 'fail') { process.stderr.write(JSON.stringify({ error: { kind: 'unavailable', message: 'core is down' } })); process.exit(1); }
else if (argv[0] === 'ls') {
  const terminals = relay === 'none' ? [] : [{ ...${JSON.stringify(RELAY)}, state: relay === 'finished' ? 'finished' : 'live' }];
  console.log(JSON.stringify({ terminals }));
} else process.exit(2);
`);
  chmodSync(shim, 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FIXTURE_CALLS: join(root, 'calls.jsonl'),
    FIXTURE_RELAY: 'live',
    REPO_HARNESS_HOME: join(root, 'home'),
  };
  writeNotifyInstallRecord(env);
  writeFileSync(notifyConfigPath(env), `WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='${SECRET}'\nSLACK_WEBHOOK_URL='${SLACK}'\n`, { mode: 0o600 });
  const calls = (): string[][] => { try { return readFileSync(env.FIXTURE_CALLS!, 'utf8').trim().split('\n').map(line => JSON.parse(line) as string[]); } catch { return []; } };
  return { root, env, calls, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const deliveries = (channels: Record<string, unknown>, last: unknown = null) =>
  JSON.stringify({ protocol: 1, kind: 'notify_relay_deliveries', last, channels: { webhook: null, slack: null, discord: null, telegram: null, ...channels } });

describe('notify relay status', () => {
  test('a live relay reports config presence and the last recorded delivery without secret values', async () => {
    const f = fixture();
    try {
      writeFileSync(notifyDeliveriesPath(f.env), deliveries({ slack: { at: '2023-11-14T22:16:40.000Z', result: 'failed' } }, { at: '2023-11-14T22:16:40.000Z', result: 'failed' }));
      const status = await readNotifyStatus({ env: f.env, now: new Date('2026-10-04T00:00:00.000Z') });
      expect(status).toEqual({
        protocol: 2, kind: 'operator_notify_status', relay: 'live',
        config: { WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'configured', SLACK_WEBHOOK_URL: 'configured' },
        last_delivery: { at: '2023-11-14T22:16:40.000Z', result: 'failed' },
        observed_at: '2026-10-04T00:00:00.000Z',
      });
      for (const value of [SECRET, SLACK, 'bot.example']) expect(JSON.stringify(status)).not.toContain(value);
      // One hc call, filtered on the relay labels from the install record.
      expect(f.calls()).toEqual([['ls', '--json', '--label', 'repo-harness.role=notify-relay']]);
    } finally { f.cleanup(); }
  });

  test('no install record is notify_session_missing, and any other record is notify_session_invalid, before any hc call', async () => {
    const f = fixture();
    const record = notifyInstallRecordPath(f.env);
    try {
      rmSync(record);
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_session_missing');
      const valid = { protocol: 2, kind: 'notify_relay_install', name: 'rh-notify-relay', labels: { 'repo-harness.role': 'notify-relay' } };
      for (const text of [
        '{not json',
        // The classic Herdr record named a session. It fails closed: install again.
        JSON.stringify({ protocol: 1, kind: 'herdr_notify_install', session: 'default' }),
        JSON.stringify({ ...valid, at: '2026-10-27T00:00:00.000Z' }),
        JSON.stringify({ ...valid, name: 'other-relay' }),
        JSON.stringify({ ...valid, labels: { 'repo-harness.role': 'task-agent' } }),
        JSON.stringify([valid]),
      ]) {
        writeFileSync(record, text, { mode: 0o600 });
        expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_session_invalid');
      }
      // A symlink to a valid record is not followed.
      const target = join(f.root, 'elsewhere.json');
      writeFileSync(target, JSON.stringify(valid), { mode: 0o600 });
      rmSync(record);
      symlinkSync(target, record);
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_session_invalid');
      // A FIFO is not a regular file, and opening it does not hold the read.
      rmSync(record);
      expect(spawnSync('mkfifo', [record]).status).toBe(0);
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_session_invalid');
      expect(f.calls()).toEqual([]);
    } finally { f.cleanup(); }
  });

  test('no live relay terminal is relay_stopped, and an hc that fails or hangs is hc_unavailable, never missing', async () => {
    const f = fixture();
    try {
      for (const relay of ['none', 'finished']) {
        f.env.FIXTURE_RELAY = relay;
        expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('relay_stopped');
      }
      f.env.FIXTURE_RELAY = 'fail';
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('hc_unavailable');
      f.env.FIXTURE_RELAY = 'hang';
      const started = Date.now();
      expect(await unavailableCode(readNotifyStatus({ env: f.env, timeout_ms: 200 }))).toBe('hc_unavailable');
      expect(Date.now() - started).toBeLessThan(5_000);
    } finally { f.cleanup(); }
  });

  test('each channel is configured only when the relay would send to it, and no value leaves the reader', async () => {
    const f = fixture();
    try {
      writeFileSync(notifyConfigPath(f.env), `WEBHOOK_URL='https://bot.example/routine'\nSLACK_WEBHOOK_URL='${SLACK}'\nDISCORD_WEBHOOK_URL='https://discord.example/discord-secret'\nTELEGRAM_BOT_TOKEN='123:telegram-secret'\n`, { mode: 0o600 });
      const read = await readNotifyChannelStatus({ env: f.env, now: new Date('2026-10-04T00:00:00.000Z') });
      expect(read.channels).toEqual({ webhook: 'missing', slack: 'configured', discord: 'configured', telegram: 'missing' });
      expect(read.status.config).toEqual({ WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'missing', SLACK_WEBHOOK_URL: 'configured' });
      for (const value of [SLACK, 'discord-secret', 'telegram-secret', 'bot.example']) expect(JSON.stringify(read)).not.toContain(value);
    } finally { f.cleanup(); }
  });

  test('a missing config or delivery record stays missing and does not invent a success', async () => {
    const f = fixture();
    try {
      rmSync(notifyConfigPath(f.env));
      const read = await readNotifyChannelStatus({ env: f.env });
      expect(read.status.config).toEqual({ WEBHOOK_URL: 'missing', WEBHOOK_KEY: 'missing', SLACK_WEBHOOK_URL: 'missing' });
      expect(read.status.last_delivery).toEqual({ at: null, result: 'missing' });
      for (const channel of ['webhook', 'slack', 'discord', 'telegram'] as const) expect(read.deliveries[channel]).toEqual({ at: null, result: 'missing' });
    } finally { f.cleanup(); }
  });

  test('a config that is a symlink or cannot be read is notify_config_unavailable, never missing', async () => {
    const f = fixture();
    const config = notifyConfigPath(f.env);
    try {
      const outside = join(f.root, 'outside.env');
      writeFileSync(outside, `WEBHOOK_URL='https://hidden.example'\nWEBHOOK_KEY='hidden-secret'\n`);
      rmSync(config);
      symlinkSync(outside, config);
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_config_unavailable');
      rmSync(config);
      writeFileSync(config, `WEBHOOK_URL='https://bot.example/routine'\n`, { mode: 0 });
      if (process.getuid?.() !== 0) expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_config_unavailable');
    } finally { chmodSync(config, 0o600); f.cleanup(); }
  });

  test('each channel reports its own newest delivery, and an unreadable record is unavailable for every channel', async () => {
    const f = fixture();
    try {
      writeFileSync(notifyDeliveriesPath(f.env), deliveries({
        webhook: { at: '2023-11-14T22:15:00.000Z', result: 'succeeded' },
        slack: { at: '2023-11-14T22:15:00.000Z', result: 'failed' },
        telegram: { at: '2023-11-14T22:16:40.000Z', result: 'failed' },
      }, { at: '2023-11-14T22:16:40.000Z', result: 'failed' }));
      const read = await readNotifyChannelStatus({ env: f.env });
      expect(read.deliveries).toEqual({
        webhook: { at: '2023-11-14T22:15:00.000Z', result: 'succeeded' },
        slack: { at: '2023-11-14T22:15:00.000Z', result: 'failed' },
        discord: { at: null, result: 'missing' },
        telegram: { at: '2023-11-14T22:16:40.000Z', result: 'failed' },
      });
      for (const broken of ['not json', deliveries({ slack: { at: 'yesterday', result: 'failed' } }), deliveries({ slack: { at: '2023-11-14T22:15:00.000Z', result: 'unsupported' } })]) {
        writeFileSync(notifyDeliveriesPath(f.env), broken);
        const unreadable = await readNotifyChannelStatus({ env: f.env });
        expect(unreadable.status.last_delivery).toEqual({ at: null, result: 'unavailable' });
        for (const channel of ['webhook', 'slack', 'discord', 'telegram'] as const) expect(unreadable.deliveries[channel]).toEqual({ at: null, result: 'unavailable' });
      }
      expect(renderToStaticMarkup(createElement(NotifyStatusPanel, { initialStatus: (await readNotifyChannelStatus({ env: f.env })).status, t: key => translate('en', key) })))
        .toContain('delivery record unavailable');
    } finally { f.cleanup(); }
  });

  test('the collector runs one hc call per cycle, keeps its cache, and replaces it with a code on failure', async () => {
    const f = fixture();
    const collector = startNotifyCollector({ env: f.env, interval_ms: 60_000 });
    try {
      expect(collector.read()).toEqual({ state: 'pending' });
      await collector.settled();
      const cache = collector.read();
      expect(cache.state === 'ok' && cache.value.status.relay).toBe('live');
      collector.read(); collector.read();
      expect(f.calls()).toHaveLength(1);
    } finally { await collector.close(); }

    f.env.FIXTURE_RELAY = 'none';
    const stopped = startNotifyCollector({ env: f.env, interval_ms: 60_000 });
    try {
      await stopped.settled();
      expect(stopped.read()).toEqual({ state: 'unavailable', reason: 'relay_stopped' });
    } finally { await stopped.close(); }
    f.cleanup();
  });

  test('a record written while the collector runs takes effect on the next cycle, without a restart', async () => {
    const f = fixture();
    rmSync(notifyInstallRecordPath(f.env));
    const collector = startNotifyCollector({ env: f.env, interval_ms: 20 });
    try {
      await collector.settled();
      expect(collector.read()).toEqual({ state: 'unavailable', reason: 'notify_session_missing' });
      writeNotifyInstallRecord(f.env);
      for (let attempt = 0; attempt < 250 && collector.read().state !== 'ok'; attempt++) { await Bun.sleep(20); await collector.settled(); }
      const cache = collector.read();
      expect(cache.state === 'ok' && cache.value.status.relay).toBe('live');
    } finally { await collector.close(); f.cleanup(); }
  });

  test('a status read from a secret-bearing config renders no secret value in the panel', async () => {
    const f = fixture();
    try {
      const status = await readNotifyStatus({ env: f.env });
      const markup = renderToStaticMarkup(createElement(NotifyStatusPanel, { initialStatus: status, t: key => translate('en', key) }));
      expect(markup).toContain('WEBHOOK_KEY');
      expect(markup).toContain('configured');
      for (const value of [SECRET, SLACK, 'bot.example', f.root]) expect(markup).not.toContain(value);
    } finally { f.cleanup(); }
  });

  test('the operator route returns the same status and stays read-only', async () => {
    const f = fixture();
    const server = await startOperatorServer({
      port: 0,
      static_root: f.root,
      env: f.env,
      notify_collector: true,
    });
    try {
      let response = await fetch(`${server.url}/api/v1/notify/status`);
      for (let attempt = 0; attempt < 200 && response.status === 503; attempt++) {
        expect((await response.json() as { error: { code: string } }).error.code).toBe('notify_status_pending');
        await Bun.sleep(25);
        response = await fetch(`${server.url}/api/v1/notify/status`);
      }
      expect(response.status).toBe(200);
      const body = await response.text();
      // GETs read the cache: more requests add no hc call.
      const hcCalls = f.calls().length;
      for (let index = 0; index < 3; index++) expect((await fetch(`${server.url}/api/v1/notify/status`)).status).toBe(200);
      expect(f.calls()).toHaveLength(hcCalls);
      expect(body).toContain('"relay":"live"');
      expect(body).toContain('"WEBHOOK_KEY":"configured"');
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain(SLACK);
      const denied = await fetch(`${server.url}/api/v1/notify/status`, { method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } });
      expect(denied.status).toBe(405);
    } finally { await server.close(); f.cleanup(); }
  });

  test('the notify route answers a failed probe with its reason code, never a status of missing', async () => {
    for (const [cache, code] of [
      [{ state: 'pending' }, 'notify_status_pending'],
      [{ state: 'unavailable', reason: 'hc_unavailable' }, 'hc_unavailable'],
      [{ state: 'unavailable', reason: 'relay_stopped' }, 'relay_stopped'],
      [{ state: 'unavailable', reason: 'notify_config_unavailable' }, 'notify_config_unavailable'],
      [{ state: 'unavailable', reason: 'notify_session_missing' }, 'notify_session_missing'],
      [{ state: 'unavailable', reason: 'notify_session_invalid' }, 'notify_session_invalid'],
      // A cached status that fails the decoder is refused, not sent.
      [{ state: 'ok', value: { ...validDelivery, status: { ...validDelivery.status, relay: 'stopped' } } }, 'notify_status_invalid'],
    ] as const) {
      const server = await startOperatorServer({ port: 0, static_root: tmpdir(), read_notify: () => cache as NotifyCacheV1 });
      try {
        const response = await fetch(`${server.url}/api/v1/notify/status`);
        expect(response.status).toBe(503);
        const body = await response.json() as { error: { code: string; message: string } };
        expect(body.error.code).toBe(code);
        // `notify_session_missing` names a missing record, not a missing status: the rest of the body still says nothing is missing.
        expect(JSON.stringify(body).replaceAll(code, '')).not.toContain('missing');
      } finally { await server.close(); }
    }
  });
  test('the reader performs no synchronous filesystem or process call on the server request path', async () => {
    const source = await Bun.file(new URL('../../src/effects/operator/notify-status.ts', import.meta.url)).text();
    expect(source).not.toMatch(/\b\w+Sync\s*\(/u);
    // The relay list call is the async transport call; the files are read through node:fs/promises in herdr-notify-install.ts.
    expect(source).toContain('await hcListAsync(');
  });
});
