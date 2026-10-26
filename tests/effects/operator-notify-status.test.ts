import { describe, expect, spyOn, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { startNotifyCollector } from '../../src/effects/operator/notify-collector';
import { NotifyStatusUnavailableError, readNotifyChannelStatus, type NotifyStatusReadInput } from '../../src/effects/operator/notify-status';
import { NotifyStatusPanel } from '../../src/operator-web/NotifyStatus';
import { translate } from '../../src/operator-web/i18n';
import { startOperatorServer } from '../../src/effects/operator/server';

const SECRET = 'fixture-secret-key-must-not-leak';

/** The plugin status part of one read; most cases here assert only that part. */
const readNotifyStatus = async (input: NotifyStatusReadInput) => (await readNotifyChannelStatus(input)).status;

async function unavailableCode(read: Promise<unknown>): Promise<string | null> {
  try { await read; return null; } catch (error) { return error instanceof NotifyStatusUnavailableError ? error.code : String(error); }
}
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
const argv = process.argv.slice(2);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ argv, herdr_env: Object.keys(process.env).filter(name => name.startsWith('HERDR_')).sort() }) + '\\n');
const args = argv[0] === '--session' ? argv.slice(2) : argv;
const id = 'aimpact.webhook-notify';
if (args[0] === 'plugin' && args[1] === 'list') {
  if (process.env.FIXTURE_LIST_FAIL === '1') process.exit(1);
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

  test('every plugin read targets the install session and drops the caller pane identity', async () => {
    const f = fixture();
    try {
      f.env.HERDR_SESSION = 'pane-session';
      f.env.HERDR_SOCKET_PATH = join(f.root, 'pane.sock');
      await readNotifyStatus({ env: f.env, session: 'notify-test', now: new Date('2026-10-04T00:00:00.000Z') });
      const calls = readFileSync(f.env.FIXTURE_CALLS!, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { argv: string[]; herdr_env: string[] });
      expect(calls.map(call => call.argv.slice(0, 3)).sort()).toEqual([
        ['--session', 'notify-test', 'plugin'],
        ['--session', 'notify-test', 'plugin'],
        ['--session', 'notify-test', 'plugin'],
      ]);
      expect(calls.flatMap(call => call.herdr_env)).toEqual([]);
    } finally { f.cleanup(); }
  });

  test('without an explicit session the reader names the session Herdr itself would select', async () => {
    for (const [session, expected] of [[undefined, 'default'], ['pane-session', 'pane-session']] as const) {
      const f = fixture();
      try {
        if (session) f.env.HERDR_SESSION = session; else delete f.env.HERDR_SESSION;
        await readNotifyStatus({ env: f.env, now: new Date('2026-10-04T00:00:00.000Z') });
        const calls = readFileSync(f.env.FIXTURE_CALLS!, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { argv: string[] });
        expect(new Set(calls.map(call => call.argv.slice(0, 2).join(' ')))).toEqual(new Set([`--session ${expected}`]));
      } finally { f.cleanup(); }
    }
  });

  test('an invalid session name is refused before any Herdr call', async () => {
    const f = fixture();
    try {
      expect(await unavailableCode(readNotifyStatus({ env: f.env, session: '../other' }))).toBe('herdr_session_invalid');
      expect(() => readFileSync(f.env.FIXTURE_CALLS!, 'utf8')).toThrow();
    } finally { f.cleanup(); }
  });

  test('each channel is configured only when the plugin would send to it, and no value leaves the reader', async () => {
    const f = fixture();
    try {
      writeFileSync(join(f.config, '.env'), `WEBHOOK_URL='https://bot.example/routine'\nSLACK_WEBHOOK_URL='${SLACK}'\nDISCORD_WEBHOOK_URL='https://discord.example/discord-secret'\nTELEGRAM_BOT_TOKEN='123:telegram-secret'\n`, { mode: 0o600 });
      const read = await readNotifyChannelStatus({ env: f.env, session: 'notify-test', now: new Date('2026-10-04T00:00:00.000Z') });
      expect(read.channels).toEqual({ webhook: 'missing', slack: 'configured', discord: 'configured', telegram: 'missing' });
      expect(read.status.config).toEqual({ WEBHOOK_URL: 'configured', WEBHOOK_KEY: 'missing', SLACK_WEBHOOK_URL: 'configured' });
      for (const value of [SLACK, 'discord-secret', 'telegram-secret', 'bot.example']) expect(JSON.stringify(read)).not.toContain(value);
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

  test('a failed Herdr plugin list or config lookup is unavailable with a code, never missing', async () => {
    const f = fixture();
    try {
      f.env.FIXTURE_LIST_FAIL = '1';
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('herdr_unavailable');
      delete f.env.FIXTURE_LIST_FAIL;
      f.env.FIXTURE_CONFIG_FAIL = '1';
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_config_unavailable');
      delete f.env.FIXTURE_CONFIG_FAIL;
      f.env.FIXTURE_CONFIG = 'relative/dir';
      expect(await unavailableCode(readNotifyStatus({ env: f.env }))).toBe('notify_config_unavailable');
    } finally { f.cleanup(); }
  });

  test('the collector runs one probe set per cycle, keeps its cache, and replaces it with a code on failure', async () => {
    const f = fixture();
    const calls = () => readFileSync(f.env.FIXTURE_CALLS!, 'utf8').trim().split('\n').map(line => (JSON.parse(line) as { argv: string[] }).argv.slice(2, 4).join(' '));
    const collector = startNotifyCollector({ env: f.env, session: 'notify-test', interval_ms: 60_000 });
    try {
      expect(collector.read()).toEqual({ state: 'pending' });
      await collector.settled();
      const cache = collector.read();
      expect(cache.state === 'ok' && cache.value.status.linked).toBe('linked');
      collector.read(); collector.read();
      expect(calls().sort()).toEqual(['plugin config-dir', 'plugin list', 'plugin log']);
    } finally { await collector.close(); }

    f.env.FIXTURE_LIST_FAIL = '1';
    const failing = startNotifyCollector({ env: f.env, session: 'notify-test', interval_ms: 60_000 });
    try {
      await failing.settled();
      expect(failing.read()).toEqual({ state: 'unavailable', reason: 'herdr_unavailable' });
    } finally { await failing.close(); }

    const invalid = startNotifyCollector({ env: f.env, session: '../other' });
    expect(invalid.read()).toEqual({ state: 'unavailable', reason: 'herdr_session_invalid' });
    await invalid.settled();
    expect(invalid.read()).toEqual({ state: 'unavailable', reason: 'herdr_session_invalid' });
    await invalid.close();
    f.cleanup();
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
      // GETs read the cache: more requests add no Herdr call.
      const herdrCalls = readFileSync(f.env.FIXTURE_CALLS!, 'utf8');
      for (let index = 0; index < 3; index++) expect((await fetch(`${server.url}/api/v1/notify/status`)).status).toBe(200);
      expect(readFileSync(f.env.FIXTURE_CALLS!, 'utf8')).toBe(herdrCalls);
      expect(body).toContain('"linked":"linked"');
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
      [{ state: 'unavailable', reason: 'herdr_unavailable' }, 'herdr_unavailable'],
      [{ state: 'unavailable', reason: 'notify_config_unavailable' }, 'notify_config_unavailable'],
      [{ state: 'unavailable', reason: 'herdr_session_invalid' }, 'herdr_session_invalid'],
    ] as const) {
      const server = await startOperatorServer({ port: 0, static_root: tmpdir(), read_notify: () => cache });
      try {
        const response = await fetch(`${server.url}/api/v1/notify/status`);
        expect(response.status).toBe(503);
        const body = await response.json() as { error: { code: string; message: string } };
        expect(body.error.code).toBe(code);
        expect(JSON.stringify(body)).not.toContain('missing');
      } finally { await server.close(); }
    }
  });
  test('the 0.1.0 plugin log format is read, and its delivery identities stay out', async () => {
    const f = fixture();
    try {
      // Line shapes copied from a real 0.1.0 install; the identity tokens are placeholders.
      const legacy = (stderr: string, finished: number) => ({ finished_unix_ms: finished, status: 'succeeded', exit_code: 0, stderr });
      for (const [stderr, result] of [
        ['[webhook-notify] POST wA:p4:done -> 200\n', 'succeeded'],
        ['[webhook-notify] SLACK wA:p4:blocked -> 200\n[webhook-notify] POST wA:p4:blocked -> 200\n', 'succeeded'],
        ['[webhook-notify] POST wA:p4:done -> 503\n', 'failed'],
        ['[webhook-notify] POST failed: The operation was aborted due to timeout\n', 'failed'],
        ['[webhook-notify] SLACK wA:p4:blocked -> 200\n[webhook-notify] POST failed: fetch failed\n', 'failed'],
      ] as const) {
        f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
          legacy(stderr, 1_700_000_300_000),
          legacy('[webhook-notify] debounced wA:p4:done\n', 1_700_000_400_000),
          legacy('', 1_700_000_500_000),
        ] } });
        const status = await readNotifyStatus({ env: f.env });
        expect(status.last_delivery).toEqual({ at: '2023-11-14T22:18:20.000Z', result });
        expect(JSON.stringify(status)).not.toContain('wA:p4');
        expect(JSON.stringify(status)).not.toContain('timeout');
      }
    } finally { f.cleanup(); }
  });

  test('a newest record in an unknown format is unsupported, and an unreadable log is unavailable, never missing', async () => {
    const f = fixture();
    try {
      const known = { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' };
      const unknown = { status: 'succeeded', stderr: '[webhook-notify] WEBHOOK delivered private-identity ok\n' };
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [known, { ...unknown, finished_unix_ms: 1_700_000_100_000 }] } });
      const newer = await readNotifyStatus({ env: f.env });
      expect(newer.last_delivery).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'unsupported' });
      expect(JSON.stringify(newer)).not.toContain('private-identity');
      const markup = renderToStaticMarkup(createElement(NotifyStatusPanel, { initialStatus: newer, t: key => translate('en', key) }));
      expect(markup).toContain('log format not supported');
      expect(markup).not.toContain('no delivery recorded');
      expect(markup).not.toContain('private-identity');

      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [{ ...unknown, finished_unix_ms: 1_699_999_000_000 }, known] } });
      expect((await readNotifyStatus({ env: f.env })).last_delivery).toEqual({ at: '2023-11-14T22:13:20.000Z', result: 'succeeded' });

      f.env.FIXTURE_LOGS = 'not json';
      const unreadable = await readNotifyStatus({ env: f.env });
      expect(unreadable.last_delivery).toEqual({ at: null, result: 'unavailable' });
      expect(renderToStaticMarkup(createElement(NotifyStatusPanel, { initialStatus: unreadable, t: key => translate('en', key) })))
        .toContain('delivery log unavailable');
    } finally { f.cleanup(); }
  });

  test('a Telegram refusal inside HTTP 200 reaches the reader as a failed delivery', async () => {
    const pluginPath = join(import.meta.dir, '../../assets/herdr/webhook-notify/notify.mjs');
    const { notify } = await import(pluginPath) as {
      notify: (env: NodeJS.ProcessEnv, send: typeof fetch) => Promise<void>;
    };
    for (const [telegramOk, result] of [[false, 'failed'], [true, 'succeeded']] as const) {
      const f = fixture();
      const state = join(f.root, 'state');
      mkdirSync(state);
      // Event context is an existing non-temporary directory. The test does not write there.
      const workspace = dirname(realpathSync('/tmp'));
      writeFileSync(join(f.config, '.env'), `WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='${SECRET}'\nNOTIFY_SESSION='notify-test'\nTELEGRAM_BOT_TOKEN='123:token'\nTELEGRAM_CHAT_ID='-42'\n`, { mode: 0o600 });
      const stderr: string[] = [];
      const spy = spyOn(console, 'error').mockImplementation((line: unknown) => { stderr.push(String(line)); });
      try {
        await notify({ ...f.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: f.config, HERDR_PLUGIN_STATE_DIR: state,
          HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane_agent_status_changed', data: { pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: 'blocked' } }),
          HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: workspace }),
        }, (async (url: string | URL | Request) => new Response(JSON.stringify({ ok: !String(url).includes('telegram.org') || telegramOk }), { status: 200 })) as typeof fetch);
      } finally { spy.mockRestore(); }
      try {
        expect(stderr).toHaveLength(2);
        f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [{ finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: stderr.join('\n') + '\n' }] } });
        expect((await readNotifyStatus({ env: f.env })).last_delivery).toEqual({ at: '2023-11-14T22:13:20.000Z', result });
      } finally { f.cleanup(); }
    }
  });

  test('a debounce-state warning from the shipped plugin does not hide the delivery result', async () => {
    const pluginPath = join(import.meta.dir, '../../assets/herdr/webhook-notify/notify.mjs');
    const { notify } = await import(pluginPath) as {
      notify: (env: NodeJS.ProcessEnv, send: typeof fetch) => Promise<void>;
    };
    const f = fixture();
    const state = join(f.root, 'state');
    mkdirSync(state);
    writeFileSync(join(state, 'debounce-state.json'), 'not json');
    const workspace = dirname(realpathSync('/tmp'));
    writeFileSync(join(f.config, '.env'), `WEBHOOK_URL='https://bot.example/routine'\nWEBHOOK_KEY='${SECRET}'\nNOTIFY_SESSION='notify-test'\n`, { mode: 0o600 });
    const stderr: string[] = [];
    const spy = spyOn(console, 'error').mockImplementation((line: unknown) => { stderr.push(String(line)); });
    try {
      await notify({ ...f.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: f.config, HERDR_PLUGIN_STATE_DIR: state,
        HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane_agent_status_changed', data: { pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: 'blocked' } }),
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: workspace }),
      }, (async (_url: string | URL | Request) => new Response('{}', { status: 200 })) as typeof fetch);
    } finally { spy.mockRestore(); }
    try {
      expect(stderr).toEqual(['[webhook-notify] Cannot read debounce state. Using empty state.', '[webhook-notify] WEBHOOK: HTTP 200']);
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [{ finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: stderr.join('\n') + '\n' }] } });
      expect((await readNotifyStatus({ env: f.env })).last_delivery).toEqual({ at: '2023-11-14T22:13:20.000Z', result: 'succeeded' });
    } finally { f.cleanup(); }
  });

  test('each channel reports its own newest delivery, and a failed channel does not hide the others', async () => {
    const f = fixture();
    try {
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
        { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n[webhook-notify] SLACK: HTTP 200\n[webhook-notify] DISCORD: HTTP 204\n' },
        { finished_unix_ms: 1_700_000_100_000, status: 'succeeded', stderr: '[webhook-notify] SLACK: delivery failed.\n[webhook-notify] WEBHOOK: HTTP 200\n' },
        { finished_unix_ms: 1_700_000_200_000, status: 'succeeded', stderr: '[webhook-notify] TELEGRAM: HTTP 200 app-failed\n' },
        { finished_unix_ms: 1_700_000_300_000, status: 'succeeded', stderr: '' },
      ] } });
      const read = await readNotifyChannelStatus({ env: f.env, session: 'notify-test' });
      expect(read.deliveries).toEqual({
        webhook: { at: '2023-11-14T22:15:00.000Z', result: 'succeeded' },
        slack: { at: '2023-11-14T22:15:00.000Z', result: 'failed' },
        discord: { at: '2023-11-14T22:13:20.000Z', result: 'succeeded' },
        telegram: { at: '2023-11-14T22:16:40.000Z', result: 'failed' },
      });
      // The combined record stays as it was: the newest event with an attempt.
      expect(read.status.last_delivery).toEqual({ at: '2023-11-14T22:16:40.000Z', result: 'failed' });
    } finally { f.cleanup(); }
  });

  test('a channel with no recorded attempt is missing, and an unreadable log is unavailable for every channel', async () => {
    const f = fixture();
    try {
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
        { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' },
      ] } });
      const read = await readNotifyChannelStatus({ env: f.env, session: 'notify-test' });
      expect(read.deliveries.webhook).toEqual({ at: '2023-11-14T22:13:20.000Z', result: 'succeeded' });
      for (const channel of ['slack', 'discord', 'telegram'] as const) expect(read.deliveries[channel]).toEqual({ at: null, result: 'missing' });
      f.env.FIXTURE_LOGS = 'not json';
      const unreadable = await readNotifyChannelStatus({ env: f.env, session: 'notify-test' });
      for (const channel of ['webhook', 'slack', 'discord', 'telegram'] as const) expect(unreadable.deliveries[channel]).toEqual({ at: null, result: 'unavailable' });
    } finally { f.cleanup(); }
  });

  test('an unknown log line makes only the channels it could belong to unsupported', async () => {
    const f = fixture();
    try {
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
        { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] SLACK: HTTP 200\n[webhook-notify] WEBHOOK: HTTP 200\n' },
        { finished_unix_ms: 1_700_000_100_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n[webhook-notify] DISCORD sent private-identity ok\n' },
      ] } });
      const read = await readNotifyChannelStatus({ env: f.env, session: 'notify-test' });
      expect(read.deliveries.webhook).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'succeeded' });
      expect(read.deliveries.slack).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'unsupported' });
      expect(read.deliveries.discord).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'unsupported' });
      expect(read.deliveries.telegram).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'unsupported' });
      expect(JSON.stringify(read)).not.toContain('private-identity');
    } finally { f.cleanup(); }
  });

  test('0.1.0 lines name no proven channel: each channel is unsupported while the combined record still reads them', async () => {
    const f = fixture();
    try {
      // Line shapes copied from a real 0.1.0 install; the identity tokens are placeholders.
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
        { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] POST wA:p4:done -> 200\n[webhook-notify] SLACK wA:p4:done -> 200\n' },
        { finished_unix_ms: 1_700_000_100_000, status: 'succeeded', stderr: '[webhook-notify] SLACK failed: fetch failed\n' },
      ] } });
      const read = await readNotifyChannelStatus({ env: f.env, session: 'notify-test' });
      for (const channel of ['webhook', 'slack', 'discord', 'telegram'] as const) {
        expect(read.deliveries[channel]).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'unsupported' });
      }
      expect(read.status.last_delivery).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'failed' });
      expect(JSON.stringify(read)).not.toContain('wA:p4');

      // A later entry in the current format gives its channel a result again; the others stay unsupported.
      f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [
        { finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: '[webhook-notify] POST wA:p4:done -> 200\n' },
        { finished_unix_ms: 1_700_000_100_000, status: 'succeeded', stderr: '[webhook-notify] WEBHOOK: HTTP 200\n' },
      ] } });
      const later = await readNotifyChannelStatus({ env: f.env, session: 'notify-test' });
      expect(later.deliveries.webhook).toEqual({ at: '2023-11-14T22:15:00.000Z', result: 'succeeded' });
      expect(later.deliveries.slack).toEqual({ at: '2023-11-14T22:13:20.000Z', result: 'unsupported' });
    } finally { f.cleanup(); }
  });

  describe('shipped plugin', () => {
    const pluginPath = join(import.meta.dir, '../../assets/herdr/webhook-notify/notify.mjs');
    const TELEGRAM = '123456:telegram-token-must-not-leak';
    const DISCORD = 'https://discord.example/api/webhooks/discord-secret-must-not-leak';
    type Notify = (env: NodeJS.ProcessEnv, send: typeof fetch) => Promise<void>;

    interface Sent { readonly url: string; readonly body: Record<string, unknown> }

    async function run(f: ReturnType<typeof fixture>, options: {
      readonly worktree?: Record<string, unknown>; readonly failing?: readonly string[]; readonly status?: 'blocked' | 'done';
    } = {}) {
      const { notify } = await import(pluginPath) as { notify: Notify };
      const state = join(f.root, 'state');
      mkdirSync(state, { recursive: true });
      writeFileSync(join(f.config, '.env'), [
        `WEBHOOK_URL='https://bot.example/routine'`, `WEBHOOK_KEY='${SECRET}'`, `NOTIFY_SESSION='notify-test'`,
        `SLACK_WEBHOOK_URL='${SLACK}'`, `DISCORD_WEBHOOK_URL='${DISCORD}'`,
        `TELEGRAM_BOT_TOKEN='${TELEGRAM}'`, `TELEGRAM_CHAT_ID='-42'`,
      ].join('\n') + '\n', { mode: 0o600 });
      const sent: Sent[] = [];
      const stderr: string[] = [];
      const spy = spyOn(console, 'error').mockImplementation((line: unknown) => { stderr.push(String(line)); });
      try {
        await notify({ ...f.env, HERDR_SESSION: 'notify-test', HERDR_PLUGIN_CONFIG_DIR: f.config, HERDR_PLUGIN_STATE_DIR: state,
          HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: 'pane_agent_status_changed', data: { pane_id: 'pane-1', workspace_id: 'workspace-1', agent_status: options.status ?? 'blocked', agent: 'claude' } }),
          HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ workspace_cwd: dirname(realpathSync('/tmp')), ...(options.worktree ? { worktree: options.worktree } : {}) }),
        }, (async (url: string | URL | Request, init?: RequestInit) => {
          const target = String(url);
          sent.push({ url: target, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
          if (options.failing?.some(part => target.includes(part))) throw new Error(`refused ${target}`);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }) as typeof fetch);
      } finally { spy.mockRestore(); }
      return { sent, stderr, state };
    }

    function binding(repoRoot: string, extra: { readonly started?: readonly string[]; readonly closed?: boolean; readonly pane?: string;
      readonly key?: string; readonly task?: string } = {}) {
      const dir = join(repoRoot, '.ai/harness/runs/task-agents', extra.key ?? 'key-1');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'binding.json'), JSON.stringify({
        protocol: 2, repository_id: 'repo-key-1', runtime: 'herdr', task: extra.task ?? 'task-1019', role: 'worker',
        pane_id: extra.pane ?? 'pane-1', workspace_id: 'workspace-1', endpoint: { session: 'notify-test' },
      }));
      (extra.started ?? ['req-1', 'req-2']).forEach((id, index) => writeFileSync(join(dir, `started-${index + 1}.json`), JSON.stringify({ request_id: id })));
      if (extra.closed) writeFileSync(join(dir, 'closed.json'), '{}');
    }

    test('the payload and the human messages carry the repository, task and latest request id', async () => {
      const f = fixture();
      try {
        const repoRoot = join(f.root, 'repo');
        binding(repoRoot);
        const { sent } = await run(f, { worktree: { repo_key: 'repo-key-1', repo_root: repoRoot, repo_name: 'demo-repo' } });
        expect(sent).toHaveLength(4);
        const bot = sent.find(item => item.url.includes('bot.example'))!;
        expect(bot.body).toMatchObject({ repository: 'demo-repo', task: 'task-1019', request_id: 'req-2' });
        const slack = sent.find(item => item.url === SLACK)!;
        expect(String(slack.body.text)).toContain('task task-1019 · request req-2');
        expect(String(slack.body.text)).not.toContain('repo-key-1');
        for (const item of sent.filter(item => !item.url.includes('bot.example'))) {
          expect(JSON.stringify(item.body)).toContain('task-1019');
        }
      } finally { f.cleanup(); }
    });

    test('ids the plugin cannot read are left out of the payload, never invented', async () => {
      const f = fixture();
      try {
        const repoRoot = join(f.root, 'repo');
        // A closed session, another pane, or no binding: the task and request id stay unknown.
        for (const setup of [() => binding(repoRoot, { closed: true }), () => rmSync(join(repoRoot, '.ai'), { recursive: true, force: true }),
          () => binding(repoRoot, { pane: 'pane-9' })]) {
          setup();
          rmSync(join(f.root, 'state'), { recursive: true, force: true });
          const { sent } = await run(f, { worktree: { repo_key: 'repo-key-1', repo_root: repoRoot, repo_name: 'demo-repo' } });
          const bot = sent.find(item => item.url.includes('bot.example'))!;
          expect(bot.body).toMatchObject({ repository: 'demo-repo' });
          expect(bot.body).not.toHaveProperty('task');
          expect(bot.body).not.toHaveProperty('request_id');
          expect(String(sent.find(item => item.url === SLACK)!.body.text)).not.toContain('task ');
        }
        rmSync(join(f.root, 'state'), { recursive: true, force: true });
        const { sent } = await run(f);
        const bare = sent.find(item => item.url.includes('bot.example'))!.body;
        for (const key of ['repository', 'task', 'request_id']) expect(bare).not.toHaveProperty(key);
      } finally { f.cleanup(); }
    });

    test('every payload names the repository by name, never by the repo_key path', async () => {
      const f = fixture();
      try {
        const repoRoot = join(f.root, 'repo');
        const key = '/Users/some one/Projects/demo-repo/.git';
        binding(repoRoot);
        // The session carries the same path as its repository id, with a space in it.
        const path = join(repoRoot, '.ai/harness/runs/task-agents/key-1/binding.json');
        writeFileSync(path, readFileSync(path, 'utf8').replace('"repo-key-1"', JSON.stringify(key)));
        const { sent, stderr, state } = await run(f, { worktree: { repo_key: key, repo_root: repoRoot, repo_name: 'demo-repo' } });
        expect(sent.find(item => item.url.includes('bot.example'))!.body).toMatchObject({ repository: 'demo-repo', task: 'task-1019', request_id: 'req-2' });
        const everything = JSON.stringify(sent.map(item => item.body)) + stderr.join('\n')
          + readdirSync(state).map(name => readFileSync(join(state, name), 'utf8')).join('\n');
        expect(everything).not.toContain('/Users/some one');
        expect(everything).not.toContain('Projects/demo-repo');
        for (const item of sent.filter(item => !item.url.includes('bot.example'))) expect(JSON.stringify(item.body)).toContain('repo demo-repo');
      } finally { f.cleanup(); }
    });

    test('without a repo_name the repository is left out, even when a repo_key path is given', async () => {
      const f = fixture();
      try {
        const { sent } = await run(f, { worktree: { repo_key: '/Users/someone/Projects/demo-repo/.git' } });
        expect(sent.find(item => item.url.includes('bot.example'))!.body).not.toHaveProperty('repository');
        expect(JSON.stringify(sent)).not.toContain('/Users/someone');
        // A repo_name that is not a plain name is not forwarded.
        rmSync(join(f.root, 'state'), { recursive: true, force: true });
        const odd = await run(f, { worktree: { repo_key: 'k', repo_name: '/Users/someone/demo-repo' } });
        expect(JSON.stringify(odd.sent)).not.toContain('/Users/someone');
        expect(odd.sent.find(item => item.url.includes('bot.example'))!.body).not.toHaveProperty('repository');
      } finally { f.cleanup(); }
    });

    test('an unreadable newest request file leaves the request id out instead of using an earlier round', async () => {
      const f = fixture();
      try {
        const repoRoot = join(f.root, 'repo');
        binding(repoRoot);
        const newest = join(repoRoot, '.ai/harness/runs/task-agents/key-1/started-2.json');
        for (const broken of ['{not json', JSON.stringify({ request_id: 'bad id with spaces' }), JSON.stringify({})]) {
          writeFileSync(newest, broken);
          rmSync(join(f.root, 'state'), { recursive: true, force: true });
          const { sent } = await run(f, { worktree: { repo_key: 'repo-key-1', repo_root: repoRoot, repo_name: 'demo-repo' } });
          const bot = sent.find(item => item.url.includes('bot.example'))!;
          expect(bot.body).toMatchObject({ task: 'task-1019' });
          expect(bot.body).not.toHaveProperty('request_id');
          expect(JSON.stringify(sent)).not.toContain('req-1');
        }
      } finally { f.cleanup(); }
    });

    test('two open sessions for the same pane report no task and no request id', async () => {
      const f = fixture();
      try {
        const repoRoot = join(f.root, 'repo');
        binding(repoRoot);
        binding(repoRoot, { key: 'key-2', task: 'task-other', started: ['req-9'] });
        const { sent } = await run(f, { worktree: { repo_key: 'repo-key-1', repo_root: repoRoot, repo_name: 'demo-repo' } });
        const bot = sent.find(item => item.url.includes('bot.example'))!;
        expect(bot.body).toMatchObject({ repository: 'demo-repo' });
        expect(bot.body).not.toHaveProperty('task');
        expect(bot.body).not.toHaveProperty('request_id');
        expect(JSON.stringify(sent)).not.toContain('task-other');
        expect(JSON.stringify(sent)).not.toContain('task-1019');
        // Closing one of the two leaves a single open session, which is reported.
        writeFileSync(join(repoRoot, '.ai/harness/runs/task-agents/key-2/closed.json'), '{}');
        rmSync(join(f.root, 'state'), { recursive: true, force: true });
        const single = await run(f, { worktree: { repo_key: 'repo-key-1', repo_root: repoRoot, repo_name: 'demo-repo' } });
        expect(single.sent.find(item => item.url.includes('bot.example'))!.body).toMatchObject({ task: 'task-1019', request_id: 'req-2' });
      } finally { f.cleanup(); }
    });

    test('no payload, log line, or state file holds a webhook URL or token', async () => {
      const f = fixture();
      try {
        const repoRoot = join(f.root, 'repo');
        binding(repoRoot);
        const { sent, stderr, state } = await run(f, { worktree: { repo_key: 'repo-key-1', repo_root: repoRoot }, failing: ['hooks.slack.example'] });
        const everything = JSON.stringify(sent.map(item => item.body)) + stderr.join('\n')
          + readdirSync(state).map(name => readFileSync(join(state, name), 'utf8')).join('\n');
        for (const secret of [SECRET, SLACK, 'bot.example', DISCORD, 'discord-secret', TELEGRAM, 'telegram-token']) expect(everything).not.toContain(secret);
      } finally { f.cleanup(); }
    });

    test('one failing channel is recorded for that channel only, and the others keep their result', async () => {
      const f = fixture();
      try {
        const { stderr } = await run(f, { failing: ['hooks.slack.example'] });
        f.env.FIXTURE_LOGS = JSON.stringify({ result: { logs: [{ finished_unix_ms: 1_700_000_000_000, status: 'succeeded', stderr: stderr.join('\n') + '\n' }] } });
        const read = await readNotifyChannelStatus({ env: f.env, session: 'notify-test' });
        expect(read.deliveries.slack.result).toBe('failed');
        for (const channel of ['webhook', 'discord', 'telegram'] as const) expect(read.deliveries[channel].result).toBe('succeeded');
        expect(read.status.last_delivery.result).toBe('failed');
      } finally { f.cleanup(); }
    });
  });

  test('the reader performs no synchronous filesystem or process call on the server request path', async () => {
    const source = await Bun.file(new URL('../../src/effects/operator/notify-status.ts', import.meta.url)).text();
    expect(source).not.toMatch(/\b\w+Sync\s*\(/u);
    expect(source).toContain("from 'node:fs/promises'");
  });
});
