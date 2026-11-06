import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { recordPluginSelection } from '../helpers/install-ownership';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { assertBotEvent } from '../../assets/herdr/github-events/bot-event.mjs';
import { askMasked } from '../../src/cli/commands/herdr-actions';
import type { HcEventStream, HcStreamItem, HcTerminal } from '../../src/effects/terminal/herdr-core';
import { NOTIFY_CHANNEL_SECRET_KEYS } from '../../src/core/decision/notify-secret-keys';
import { notifyConfigPath, notifyDeliveriesPath, notifyInstallRecordPath } from '../../src/effects/terminal/notify-read';
import { createNotifyRelay, runNotifyRelay } from '../../src/effects/terminal/notify-relay';
import { tmpWorkspace } from '../helpers/repo-fixture';

const ROOT = join(import.meta.dir, '../..');
const KEY = 'fixture-secret-key';
const SLACK = 'https://slack.example/hook/slack-secret';
const DISCORD = 'https://discord.example/hook/discord-secret';
const TOKEN = '123:telegram-secret';
const FULL_CONFIG = [`WEBHOOK_URL='https://bot.example/routine'`, `WEBHOOK_KEY='${KEY}'`, `SLACK_WEBHOOK_URL='${SLACK}'`,
  `DISCORD_WEBHOOK_URL='${DISCORD}'`, `TELEGRAM_BOT_TOKEN='${TOKEN}'`, `TELEGRAM_CHAT_ID='-42'`].join('\n') + '\n';
const AT = Date.parse('2026-11-03T08:00:00.000Z');

function terminal(address: string, labels: Record<string, string>, status: HcTerminal['status'] = null): HcTerminal {
  return { address, name: `agent-${address}`, state: 'live', labels, status, turn: 0, pid: null, foreground: null, reason: null };
}
const event = (terminal: string, type: string, data: Record<string, unknown>, seq = 1): HcStreamItem => ({ type: 'event', seq, terminal, event: type, data });
const turn = (terminal: string, state: string, n = 1) => event(terminal, 'turn', { state, turn: n });

interface Call { readonly url: string; readonly init: RequestInit; readonly body: Record<string, unknown> }

function relayFixture(config = FULL_CONFIG, respond: (url: string) => Promise<Response> | Response = () => new Response('{"ok":true}', { status: 200 })) {
  const home = tmpWorkspace('rh-notify-relay');
  const env: NodeJS.ProcessEnv = { REPO_HARNESS_HOME: home };
  mkdirSync(join(home, 'herdr'), { recursive: true, mode: 0o700 });
  writeFileSync(notifyConfigPath(env), config, { mode: 0o600 });
  const calls: Call[] = [];
  const log: string[] = [];
  let now = AT;
  const send = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
    return respond(String(url));
  }) as typeof fetch;
  const relay = createNotifyRelay({ env, send, now: () => now, host: 'mac', log: line => log.push(line) });
  const feed = async (...items: HcStreamItem[]) => { for (const item of items) relay.handle(item); await relay.settled(); };
  const record = () => JSON.parse(readFileSync(notifyDeliveriesPath(env), 'utf8')) as Record<string, unknown>;
  return { home, env, calls, log, feed, record, tick: (ms: number) => { now += ms; }, cleanup: () => rmSync(home, { recursive: true, force: true }) };
}

const labels = { 'repo-harness.notify': 'on', 'repo-harness.task': '1479', 'repo-harness.request': 'r-7', 'repo-harness.repository': 'repo-harness' };
const snapshot = (...terminals: HcTerminal[]): HcStreamItem => ({ type: 'snapshot', seq: 0, terminals });

describe('notify relay', () => {
  test('a blocked turn reaches the Bot and every human channel with native bodies and is recorded per channel', async () => {
    const f = relayFixture();
    try {
      await f.feed(snapshot(terminal('t7', labels, { state: 'blocked', app: 'codex', kind: 'permission' })), turn('t7', 'blocked'));
      expect(f.calls.map(call => call.url)).toEqual(['https://bot.example/routine', SLACK, DISCORD, `https://api.telegram.org/bot${TOKEN}/sendMessage`]);
      expect(f.calls[0]!.init.headers).toMatchObject({ authorization: `Bearer ${KEY}`, 'x-webhook-key': KEY });
      expect(assertBotEvent(f.calls[0]!.body)).toEqual({ protocol: 'repo-harness.bot-event/v1', source: 'herdr', repository: 'repo-harness',
        kind: 'agent.blocked', ts: '2026-11-03T08:00:00.000Z',
        data: { host: 'mac', terminal: 't7', name: 'agent-t7', agent: 'codex', blocked_kind: 'permission', task: '1479', request_id: 'r-7' } });
      expect(f.calls[1]!.body.text).toBe('hc blocked: codex @ agent-t7\nterminal t7 · mac\nrepo repo-harness · task 1479 · request r-7');
      expect(f.calls[2]!.body.allowed_mentions).toEqual({ parse: [] });
      expect(f.calls[3]!.body.chat_id).toBe('-42');
      expect(f.calls.every(call => call.init.redirect === 'error' && call.init.signal instanceof AbortSignal)).toBe(true);
      const at = '2026-11-03T08:00:00.000Z';
      expect(f.record()).toEqual({ protocol: 1, kind: 'notify_relay_deliveries', last: { at, result: 'succeeded' },
        channels: { webhook: { at, result: 'succeeded' }, slack: { at, result: 'succeeded' }, discord: { at, result: 'succeeded' }, telegram: { at, result: 'succeeded' } } });
      expect(statSync(notifyDeliveriesPath(f.env)).mode & 0o777).toBe(0o600);
      // The next hc turn is sent at once; a turn is sent once per channel, however late it repeats.
      f.tick(1_000);
      await f.feed(turn('t7', 'working', 2), turn('t7', 'blocked', 2));
      expect(f.calls).toHaveLength(8);
      expect(f.calls.filter(call => call.url.includes('bot.example')).map(call => call.body.kind)).toEqual(['agent.blocked', 'agent.blocked']);
      f.tick(120_000);
      await f.feed(turn('t7', 'blocked'), turn('t7', 'blocked', 2));
      expect(f.calls).toHaveLength(8);
    } finally { f.cleanup(); }
  });

  test('done is opt-in for each channel, and other turn states send nothing', async () => {
    for (const [channel, prefix] of [['WEBHOOK', 'https://bot.example'], ['SLACK', SLACK], ['DISCORD', DISCORD], ['TELEGRAM', 'https://api.telegram.org']] as const) {
      const f = relayFixture();
      try {
        await f.feed(snapshot(terminal('t7', labels)), turn('t7', 'done'), turn('t7', 'idle'), turn('t7', 'error'));
        expect(f.calls).toHaveLength(0);
        writeFileSync(notifyConfigPath(f.env), `${FULL_CONFIG}${channel}_NOTIFY_DONE='1'\n`);
        await f.feed(turn('t7', 'done'));
        expect(f.calls.map(call => call.url.startsWith(prefix))).toEqual([true]);
        if (channel === 'WEBHOOK') expect(f.calls[0]!.body.kind).toBe('agent.done');
      } finally { f.cleanup(); }
    }
  });

  test('one failing channel is recorded for that channel only, and it retries without repeating the channels that succeeded', async () => {
    let failing = true;
    const f = relayFixture(FULL_CONFIG, url => {
      if (failing && url.includes('bot.example')) throw new Error(`refused ${url}`);
      if (failing && url.includes('discord.example')) return new Response('', { status: 429 });
      if (failing && url.includes('telegram.org')) return new Response('{"ok":false}', { status: 200 });
      return new Response('{"ok":true}', { status: 200 });
    });
    try {
      await f.feed(snapshot(terminal('t7', labels)), turn('t7', 'blocked'));
      expect(f.calls).toHaveLength(4);
      const at = '2026-11-03T08:00:00.000Z';
      expect(f.record()).toMatchObject({ last: { at, result: 'failed' }, channels: {
        webhook: { at, result: 'failed' }, slack: { at, result: 'succeeded' }, discord: { at, result: 'failed' }, telegram: { at, result: 'failed' } } });
      expect([...f.log].sort()).toEqual(['DISCORD: HTTP 429', 'SLACK: HTTP 200', 'TELEGRAM: HTTP 200 app-failed', 'WEBHOOK: delivery failed.']);
      failing = false;
      f.tick(1_000);
      await f.feed(turn('t7', 'blocked'));
      expect(f.calls.slice(4).map(call => new URL(call.url).hostname)).toEqual(['bot.example', 'discord.example', 'api.telegram.org']);
      // The newest event decides `last`; Slack keeps its own older result.
      expect(f.record()).toMatchObject({ last: { result: 'succeeded' }, channels: { slack: { at, result: 'succeeded' }, webhook: { result: 'succeeded' } } });
    } finally { f.cleanup(); }
  });

  test('Slack escapes broadcast and user mentions in every message field', async () => {
    const f = relayFixture();
    try {
      await f.feed(snapshot({ ...terminal('t7', labels, { state: 'blocked', app: '<!channel>' }), name: '<!everyone> <@U123|user> & text' }), turn('t7', 'blocked'));
      const slack = String(f.calls[1]!.body.text);
      for (const token of ['!channel', '!everyone', '@U123|user']) expect(slack).toContain(`&lt;${token}&gt;`);
      expect(slack).toContain('&amp; text');
      expect(slack).not.toMatch(/[<>]/);
      expect((f.calls[0]!.body.data as Record<string, unknown>).name).toBe('<!everyone> <@U123|user> & text');
    } finally { f.cleanup(); }
  });

  test('task, request and repository come only from valid labels, and a terminal labeled after start is known', async () => {
    const f = relayFixture();
    try {
      await f.feed(snapshot(terminal('t7', { 'repo-harness.notify': 'on', 'repo-harness.task': 'bad task', 'repo-harness.repository': '/Users/someone/repo' })), turn('t7', 'blocked'));
      expect(f.calls[0]!.body.repository).toBeNull();
      expect(f.calls[0]!.body.data).toEqual({ host: 'mac', terminal: 't7', name: 'agent-t7', agent: null, blocked_kind: null });
      expect(JSON.stringify(f.calls)).not.toContain('/Users/someone');
      // A Herdr.app pane that gains the notify label later arrives as a labels event with its record.
      await f.feed(event('t9', 'labels', { labels, record: { ...terminal('t9', {}), name: 'late', status: { state: 'working', app: 'claude' } } }),
        event('t9', 'status', { status: { state: 'blocked', app: 'claude', kind: 'question' } }), turn('t9', 'blocked'));
      expect(f.calls[4]!.body).toMatchObject({ repository: 'repo-harness', data: { terminal: 't9', name: 'late', agent: 'claude', blocked_kind: 'question', task: '1479', request_id: 'r-7' } });
    } finally { f.cleanup(); }
  });

  test('a missed snapshot replaces all terminal state, and events at or below its seq are ignored', async () => {
    const f = relayFixture();
    try {
      await f.feed(snapshot(terminal('t7', labels), terminal('t9', labels)),
        { type: 'missed', seq: 10, terminals: [{ ...terminal('t9', labels), name: 'renamed' }] },
        { ...turn('t9', 'blocked'), seq: 10 }, { type: 'event', seq: 11, terminal: 't9', event: 'foreground', data: null },
        { ...turn('t9', 'blocked'), seq: 11 }, { ...turn('t7', 'blocked'), seq: 12 });
      expect(f.calls.filter(call => call.url.includes('bot.example')).map(call => call.body.data))
        .toMatchObject([{ terminal: 't9', name: 'renamed' }, { terminal: 't7', name: null }]);
    } finally { f.cleanup(); }
  });

  test('a missing config or Bot webhook sends nothing, and no payload, log line or record holds a config value', async () => {
    const f = relayFixture(`SLACK_WEBHOOK_URL='${SLACK}'\n`);
    try {
      await f.feed(snapshot(terminal('t7', labels)), turn('t7', 'blocked'));
      expect(f.calls).toHaveLength(0);
      rmSync(notifyConfigPath(f.env));
      await f.feed(turn('t7', 'blocked'));
      expect(f.calls).toHaveLength(0);
      expect(existsSync(notifyDeliveriesPath(f.env))).toBe(false);
      // Each reload passes the install rules: a plain-HTTP Bot webhook sends nothing and names the rule.
      writeFileSync(notifyConfigPath(f.env), FULL_CONFIG.replace('https://bot.example', 'http://bot.example'), { mode: 0o600 });
      await f.feed(turn('t7', 'blocked'));
      expect(f.calls).toHaveLength(0);
      expect(f.log.at(-1)).toBe('The notify config is invalid: WEBHOOK_URL must be an HTTPS URL without user information. Run: repo-harness herdr notify install');
      writeFileSync(notifyConfigPath(f.env), FULL_CONFIG, { mode: 0o600 });
      await f.feed(turn('t7', 'blocked'));
      const everything = JSON.stringify(f.calls.map(call => call.body)) + f.log.join('\n') + readFileSync(notifyDeliveriesPath(f.env), 'utf8');
      for (const secret of [KEY, SLACK, DISCORD, TOKEN, 'bot.example']) expect(everything).not.toContain(secret);
    } finally { f.cleanup(); }
  });

  test('the relay returns on a hangup and rejects when the stream ends on its own', async () => {
    const env = { REPO_HARNESS_HOME: tmpWorkspace('rh-notify-run') };
    const fakeStream = (end: Promise<void>, onClose: () => void): HcEventStream => ({ close: onClose, done: end });
    let finish!: () => void;
    const ended = runNotifyRelay({ env, log: () => {}, events: () => fakeStream(new Promise<void>(resolve => { finish = resolve; }), () => {}) });
    finish();
    await expect(ended).rejects.toThrow('The hc event stream ended.');
    let closed = false;
    let release!: () => void;
    const stopped = runNotifyRelay({ env, log: () => {}, events: (labelFilter) => {
      expect(labelFilter).toEqual({ 'repo-harness.notify': 'on' });
      return fakeStream(new Promise<void>(resolve => { release = resolve; }), () => { closed = true; release(); });
    } });
    process.emit('SIGHUP');
    await expect(stopped).resolves.toBeUndefined();
    expect(closed).toBe(true);
    rmSync(env.REPO_HARNESS_HOME, { recursive: true, force: true });
  });

  test('a received bot event fails on the first invalid field', () => {
    const valid = { protocol: 'repo-harness.bot-event/v1', source: 'herdr', repository: 'repo-harness', kind: 'agent.blocked', ts: '2026-11-01T00:00:00.000Z', data: {} };
    expect(assertBotEvent(valid) as unknown).toBe(valid);
    expect(() => assertBotEvent({ ...valid, protocol: 'repo-harness.bot-event/v0' })).toThrow(new Error('invalid bot event: protocol'));
    expect(() => assertBotEvent({ ...valid, source: 'slack' })).toThrow(new Error('invalid bot event: source'));
  });
});

/** The shipped CLI with a fake `hc` on PATH: it records each call and answers from FIXTURE_HC. */
function cliFixture() {
  const root = tmpWorkspace('rh-notify-install');
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'hc'), `#!${process.execPath}
import { appendFileSync } from 'node:fs';
const argv = process.argv.slice(2);
const notify = (process.env.FIXTURE_KEYS ?? '').split(',').filter(key => key && process.env[key] !== undefined);
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({ argv, secret: process.env.WEBHOOK_KEY ?? null, notify }) + '\\n');
const mode = process.env.FIXTURE_HC ?? 'none';
const relay = { address: 't5', name: 'rh-notify-relay', state: 'live', labels: { 'repo-harness.role': 'notify-relay' }, status: null, turn: 0 };
if (mode === 'fail') { process.stderr.write(JSON.stringify({ error: { kind: 'unavailable', message: 'private ' + process.env.FIXTURE_PRIVATE } })); process.exit(1); }
const finished = { ...relay, address: 't6', state: 'finished' };
const target = argv[argv.length - 1];
if (argv[0] === 'ls') console.log(JSON.stringify({ terminals: mode !== 'live' ? [] : argv.includes('--all') ? [relay, finished] : [relay] }));
else if (argv[0] === 'run') console.log(JSON.stringify(relay));
else if (argv[0] === 'get') console.log(JSON.stringify(target === 't6' ? finished : relay));
else if (argv[0] === 'kill') console.log(JSON.stringify({ ...relay, state: 'finished' }));
else if (argv[0] === 'rm') console.log(JSON.stringify({ removed: target }));
else process.exit(2);
`);
  chmodSync(join(bin, 'hc'), 0o755);
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: join(root, 'account'), REPO_HARNESS_HOME: join(root, 'home'), FIXTURE_CALLS: join(root, 'calls.jsonl') };
  for (const key of Object.keys(env)) if (/^(WEBHOOK_|SLACK_|DISCORD_|TELEGRAM_|HC_|HERDR_)/.test(key)) delete env[key];
  recordPluginSelection(env, ['peer-runtime']);
  const cli = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [join(ROOT, 'src/cli/index.ts'), 'herdr', 'notify', ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 20_000 });
  const calls = (): { argv: string[]; secret: string | null; notify: string[] }[] => existsSync(env.FIXTURE_CALLS!)
    ? readFileSync(env.FIXTURE_CALLS!, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
  return { root, env, cli, calls, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const botFlags = ['--non-interactive', '--webhook-url', 'https://bot.example/routine', '--webhook-key', KEY];

describe('herdr notify install and uninstall', () => {
  test('install writes a private config, starts one parentless labeled relay, and writes the record last', () => {
    const f = cliFixture();
    try {
      const result = f.cli(['install', ...botFlags, '--slack-webhook-url', SLACK, '--slack-notify-done']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe('Herdr notify is installed. Relay terminal: rh-notify-relay. Default events: blocked.\n');
      const config = readFileSync(notifyConfigPath(f.env), 'utf8');
      expect(config).toContain(`WEBHOOK_KEY='${KEY}'`);
      expect(config).toContain(`SLACK_NOTIFY_DONE='1'`);
      expect(statSync(notifyConfigPath(f.env)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(readFileSync(notifyInstallRecordPath(f.env), 'utf8'))).toEqual({ protocol: 2, kind: 'notify_relay_install',
        name: 'rh-notify-relay', labels: { 'repo-harness.role': 'notify-relay' } });
      const [list, run] = f.calls();
      expect(list!.argv).toEqual(['ls', '--json', '--label', 'repo-harness.role=notify-relay']);
      expect(run!.argv).toEqual(['run', '--json', '--bg', '--label', 'repo-harness.role=notify-relay', '--name', 'rh-notify-relay', '--no-parent',
        '--', process.execPath, join(ROOT, 'src/cli/index.ts'), 'herdr', 'notify', 'relay', '--home', f.env.REPO_HARNESS_HOME!]);
      // Secrets reach the config file only, never the hc environment or argv.
      expect(f.calls().every(call => call.secret === null && !call.argv.join(' ').includes(KEY))).toBe(true);
      expect(result.stdout + result.stderr).not.toContain(KEY);

      // A live relay reads the new config on its next event, so a second install starts no second relay.
      const again = f.cli(['install', ...botFlags], { FIXTURE_HC: 'live' });
      expect(again.status, again.stderr).toBe(0);
      expect(f.calls().slice(2).map(call => call.argv[0])).toEqual(['ls']);
      expect(readFileSync(notifyConfigPath(f.env), 'utf8')).toContain(`SLACK_WEBHOOK_URL=''`);
    } finally { f.cleanup(); }
  });

  test('install writes every core channel key to notify.env, and no hc child gets one', () => {
    const f = cliFixture();
    try {
      const valid: Record<string, string> = { WEBHOOK_URL: 'https://bot.example/routine', WEBHOOK_KEY: KEY, SLACK_WEBHOOK_URL: SLACK,
        DISCORD_WEBHOOK_URL: DISCORD, TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_CHAT_ID: '-42' };
      // The loop covers a key that is added to the core channel list later; it has no format rule, so a plain value stands in.
      const exported = Object.fromEntries(NOTIFY_CHANNEL_SECRET_KEYS.map(key => [key, valid[key] ?? `fixture-${key.toLowerCase()}`]));
      const result = f.cli(['install', '--non-interactive'], { ...exported, FIXTURE_KEYS: NOTIFY_CHANNEL_SECRET_KEYS.join(',') });
      expect(result.status, result.stderr).toBe(0);
      const config = readFileSync(notifyConfigPath(f.env), 'utf8');
      for (const key of NOTIFY_CHANNEL_SECRET_KEYS) expect(config).toContain(`${key}='${exported[key]}'`);
      expect(f.calls().map(call => call.argv[0])).toEqual(['ls', 'run']);
      expect(f.calls().flatMap(call => call.notify)).toEqual([]);
    } finally { f.cleanup(); }
  });

  test('invalid or missing credentials and an hc failure stop before any file is written, and no value is disclosed', () => {
    const f = cliFixture();
    try {
      for (const args of [['--non-interactive'], [...botFlags, '--slack-webhook-url', 'http://slack.example/x'], [...botFlags, '--telegram-bot-token', '1:a']]) {
        const result = f.cli(['install', ...args]);
        expect(result.status).toBe(1);
        expect(result.stderr).toStartWith('Herdr notify: ');
        expect(result.stderr).not.toContain(KEY);
      }
      expect(f.calls()).toEqual([]);
      const failed = f.cli(['install', ...botFlags], { FIXTURE_HC: 'fail', FIXTURE_PRIVATE: '/Users/private-path' });
      expect(failed.status).toBe(1);
      expect(failed.stderr).toBe('Herdr notify: hc did not list its terminals. Check that the hc core runs.\n');
      for (const path of [notifyConfigPath(f.env), notifyInstallRecordPath(f.env)]) expect(existsSync(path)).toBe(false);
    } finally { f.cleanup(); }
  });

  test('start needs a written config and starts a relay only when none is live', () => {
    const f = cliFixture();
    try {
      const missing = f.cli(['start']);
      expect(missing.status).toBe(1);
      expect(missing.stderr).toBe('Herdr notify: No notify config. Run: repo-harness herdr notify install\n');
      expect(f.calls()).toEqual([]);
      expect(f.cli(['install', ...botFlags]).status).toBe(0);
      rmSync(notifyInstallRecordPath(f.env));
      const started = f.cli(['start']);
      expect(started.status, started.stderr).toBe(0);
      expect(started.stdout).toBe('Relay terminal rh-notify-relay started.\n');
      expect(f.calls().slice(2).map(call => call.argv[0])).toEqual(['ls', 'run']);
      expect(existsSync(notifyInstallRecordPath(f.env))).toBe(true);
      const live = f.cli(['start'], { FIXTURE_HC: 'live' });
      expect(live.stdout).toBe('Relay terminal rh-notify-relay already runs.\n');
      expect(f.calls().slice(4).map(call => call.argv[0])).toEqual(['ls']);
    } finally { f.cleanup(); }
  });

  test('uninstall stops and removes the relay terminal, then the notify files; an hc failure keeps them', () => {
    const f = cliFixture();
    try {
      expect(f.cli(['install', ...botFlags]).status).toBe(0);
      writeFileSync(notifyDeliveriesPath(f.env), '{}');
      const failed = f.cli(['uninstall'], { FIXTURE_HC: 'fail' });
      expect(failed.status).toBe(1);
      expect(existsSync(notifyConfigPath(f.env))).toBe(true);
      const removed = f.cli(['uninstall'], { FIXTURE_HC: 'live' });
      expect(removed.status, removed.stderr).toBe(0);
      // A finished relay terminal (after hc kill and notify start) is removed too; only a live one is killed.
      expect(f.calls().slice(-7).map(call => call.argv)).toEqual([
        ['ls', '--json', '--label', 'repo-harness.role=notify-relay', '--all'], ['get', '--json', '--', 't5'], ['kill', '--json', '--', 't5'],
        ['get', '--json', '--', 't5'], ['rm', '--json', '--', 't5'], ['get', '--json', '--', 't6'], ['rm', '--json', '--', 't6']]);
      for (const path of [notifyConfigPath(f.env), notifyInstallRecordPath(f.env), notifyDeliveriesPath(f.env)]) expect(existsSync(path)).toBe(false);
    } finally { f.cleanup(); }
  });

  test('masked input restores terminal state on Enter, cancel, and EOF', async () => {
    for (const ending of ['enter', 'cancel', 'eof']) {
      const input = new PassThrough() as unknown as NodeJS.ReadStream;
      const output = new PassThrough() as unknown as NodeJS.WriteStream;
      let screen = ''; output.on('data', chunk => { screen += chunk.toString(); });
      Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value: boolean) { this.isRaw = value; return this; } });
      Object.assign(output, { isTTY: true });
      const answer = askMasked('Key', input, output);
      input.write('secret'); input.write('\x7f');
      if (ending === 'enter') input.write('\r');
      else if (ending === 'cancel') input.write('\x03');
      else input.emit('end');
      if (ending === 'enter') expect(await answer).toBe('secre');
      else await expect(answer).rejects.toThrow(ending === 'cancel' ? 'Input canceled.' : 'Input ended.');
      expect(screen).not.toContain('secret');
      expect(input.isRaw).toBe(false);
      expect(input.listenerCount('data')).toBe(0);
    }
  });
});
