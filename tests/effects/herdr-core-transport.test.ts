import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpWorkspace } from '../helpers/repo-fixture';
import {
  HerdrCoreError, RH_LABEL, RH_NOTIFY_LABELS, RH_NOTIFY_RELAY, hcEvents, hcGet, hcKill, hcLabel, hcList, hcListAsync, hcRead, hcRm, hcRun,
  hcSend, hcServerStatusAsync, hcWait, herdrAppCommand, herdrAppDo, type HcLabels, type HcStreamItem,
} from '../../src/effects/terminal/herdr-core';
import { NOTIFY_SECRET_KEYS } from '../../src/core/decision/notify-secret-keys';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const TERMINAL = { address: 't4', name: 'rh-worker', state: 'live', labels: { 'repo-harness.role': 'notify-relay' },
  status: { state: 'idle', app: 'repo-harness', kind: null }, turn: 2,
  pid: 9, foreground: { pid: 9, name: 'claude', argv: ['claude'], cwd: '/w' }, reason: null, holder: 3 };
// One script stands in for both programs. FAKE_MODE picks the outcome; FAKE_OUT_<subcommand> overrides the
// reply for one subcommand; argv is logged one argument per line, and the env key names go to FAKE_ENV_LOG.
const FAKE = `#!/bin/sh
env | cut -d= -f1 >> "$FAKE_ENV_LOG"
for arg in "$@"; do printf '%s\\n' "$arg" >> "$FAKE_LOG"; done
case "$FAKE_MODE" in
  ok) eval "out=\\\${FAKE_OUT_$1:-}"; printf '%s' "\${out:-$FAKE_STDOUT}" ;;
  hang) exec sleep 5 ;;
  hc-error) printf '%s' '{"error":{"kind":"not_found","message":"no terminal \\"t9\\"","hint":"see hc ls --all"}}' >&2; exit 3 ;;
  app-error) printf '%s' '{ "error": "unknown argument \\"place\\"" }'; exit 1 ;;
  text) printf 'not json' ;;
  stream) printf '%s\\n' "$FAKE_STDOUT"; exec sleep 5 ;;
esac
`;

function fake(mode: string, stdout: unknown = {}, replies: Readonly<Record<string, unknown>> = {}) {
  const root = tmpWorkspace('hc-transport'); roots.push(root);
  const bin = join(root, 'bin'), log = join(root, 'argv.log'), envLog = join(root, 'env.log');
  mkdirSync(bin); writeFileSync(log, ''); writeFileSync(envLog, '');
  for (const name of ['hc', 'herdr-app']) { writeFileSync(join(bin, name), FAKE); chmodSync(join(bin, name), 0o755); }
  const env: NodeJS.ProcessEnv = { PATH: `${bin}:/bin:/usr/bin`, FAKE_MODE: mode, FAKE_LOG: log, FAKE_ENV_LOG: envLog,
    FAKE_STDOUT: typeof stdout === 'string' ? stdout : JSON.stringify(stdout) };
  for (const [subcommand, reply] of Object.entries(replies)) env[`FAKE_OUT_${subcommand}`] = JSON.stringify(reply);
  return { env, root, argv: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
    envKeys: () => readFileSync(envLog, 'utf8').split('\n').filter(Boolean) };
}

function failure(call: () => unknown): HerdrCoreError {
  try { call(); } catch (error) { expect(error).toBeInstanceOf(HerdrCoreError); return error as HerdrCoreError; }
  throw new Error('expected a HerdrCoreError');
}

async function asyncFailure(call: () => Promise<unknown>): Promise<HerdrCoreError> {
  return call().then(() => { throw new Error('expected a HerdrCoreError'); },
    (error: unknown) => { expect(error).toBeInstanceOf(HerdrCoreError); return error as HerdrCoreError; });
}

const GET = ['get', '--json', '--', 't4'];

test('success: labels go in on run and list, and come back out of get', async () => {
  const run = fake('ok', { address: 't4', agent: 'claude', cwd: '/w', name: 'rh-worker', state: 'live', turn: 0 });
  expect(hcRun({ argv: ['claude', '--resume'], labels: { ...RH_NOTIFY_RELAY.labels, [RH_LABEL.task]: '1475' }, name: RH_NOTIFY_RELAY.name, cwd: '/w', noParent: true }, { env: run.env }))
    .toEqual({ address: 't4', name: 'rh-worker', state: 'live' });
  expect(run.argv()).toEqual(['run', '--json', '--bg', '--label', 'repo-harness.role=notify-relay', '--label', 'repo-harness.task=1475',
    '--name', 'rh-notify-relay', '--cwd', '/w', '--no-parent', '--', 'claude', '--resume']);

  // hc omits the name of an unnamed terminal in ls rows.
  const list = fake('ok', { hidden_finished: 0, terminals: [{ address: 't4', agent: 'claude', state: 'live', turn: 0 },
    { address: 'mini-cf/t11', agent: 'claude', name: 'rh-advisor', state: 'live', turn: 0 },
    { address: 'lab/odd?terminal', state: null, agent: 9 }] });
  expect(hcList(RH_NOTIFY_LABELS, { env: list.env })).toEqual([{ address: 't4', name: null, agent: 'claude', state: 'live' }]);
  expect(list.argv()).toEqual(['ls', '--json', '--label', 'repo-harness.notify=on']);
  expect(await hcListAsync(RH_NOTIFY_LABELS, { env: list.env })).toEqual([{ address: 't4', name: null, agent: 'claude', state: 'live' }]);
  expect(list.argv()).toEqual(['ls', '--json', '--label', 'repo-harness.notify=on', 'ls', '--json', '--label', 'repo-harness.notify=on']);
  // --all adds finished terminals; the repo-harness label filter stays.
  const all = fake('ok', { hidden_finished: 0, terminals: [{ address: 't1q', agent: 'sh', exit_code: 0, reason: 'exited', state: 'finished', turn: 0 }] });
  expect(hcList(RH_NOTIFY_LABELS, { env: all.env, all: true })).toEqual([{ address: 't1q', name: null, agent: 'sh', state: 'finished' }]);
  expect(await hcListAsync(RH_NOTIFY_LABELS, { env: all.env, all: true })).toEqual([{ address: 't1q', name: null, agent: 'sh', state: 'finished' }]);
  expect(all.argv()).toEqual(['ls', '--json', '--label', 'repo-harness.notify=on', '--all', 'ls', '--json', '--label', 'repo-harness.notify=on', '--all']);
  expect(failure(() => hcList({}, { env: all.env, all: true })).reason).toBe('invalid_labels');

  const get = fake('ok', TERMINAL);
  expect(hcGet('t4', { env: get.env })).toEqual({ address: 't4', name: 'rh-worker', state: 'live',
    labels: { 'repo-harness.role': 'notify-relay' }, status: { state: 'idle', app: 'repo-harness', kind: null }, turn: 2,
    pid: 9, foreground: { pid: 9, name: 'claude', argv: ['claude'], cwd: '/w' }, reason: null });
  expect(get.argv()).toEqual(GET);
  // hc counts addresses in base 30 after t1-t9: t1b is a valid address.
  expect(hcGet('t1b', { env: get.env }).address).toBe('t4');
  expect(get.argv()).toEqual([...GET, 'get', '--json', '--', 't1b']);

  const label = fake('ok', TERMINAL);
  expect(hcLabel('t4', { [RH_LABEL.task]: '1475' }, { env: label.env }).labels).toEqual({ 'repo-harness.role': 'notify-relay' });
  expect(label.argv()).toEqual(['label', '--json', '--', 't4', 'repo-harness.task=1475']);
});

test('acting on one terminal: send, read, wait, kill and rm check it with get first', () => {
  const { foreground: _, ...finished } = TERMINAL;
  const act = fake('ok', TERMINAL, {
    send: { started: true, status: 'idle', turn: 3 },
    // A partial read: hc reads only the screen of a full-screen app while it works.
    read: { complete: false, how: 'screen', text: 'ready', why: 'working' },
    // The live hc 0.1.18 wait line: `status` is the state string.
    wait: { children: [], ended: true, exit_code: null, reason: 'status', signal: null, status: 'done', terminal: 't4', turn: 3 },
    // hc omits foreground once the program has finished.
    kill: { ...finished, state: 'finished', reason: 'killed' },
    rm: { removed: 't4' },
  });
  const options = { env: act.env };
  expect(hcSend('t4', 'hello', options)).toEqual({ started: true, turn: 3 });
  expect(hcRead('t4', 5, options)).toEqual({ text: 'ready', complete: false, why: 'working' });
  expect(hcWait('t4', 1, options)).toEqual({ ended: true, reason: 'status', turn: 3, status: { state: 'done' } });
  expect(hcKill('t4', options)).toMatchObject({ state: 'finished', pid: 9, foreground: null, reason: 'killed' });
  expect(hcRm('t4', options)).toBe('t4');
  expect(act.argv()).toEqual([...GET, 'send', '--json', '--', 't4', 'hello', ...GET, 'read', '--json', '--lines', '5', '--', 't4',
    ...GET, 'wait', '--json', '--timeout', '1', '--', 't4', ...GET, 'kill', '--json', '--', 't4', ...GET, 'rm', '--json', '--', 't4']);
});

test('timeout: a hung hc is killed at the transport timeout', async () => {
  const hang = fake('hang');
  const started = Date.now();
  expect(failure(() => hcGet('t4', { env: hang.env, timeoutMs: 200 })).reason).toBe('timeout');
  expect((await asyncFailure(() => hcListAsync(RH_NOTIFY_LABELS, { env: hang.env, timeoutMs: 200 }))).reason).toBe('timeout');
  expect(Date.now() - started).toBeLessThan(4_000);
});

test('hc error: the exit code and hc error kind are kept; malformed replies fail closed', async () => {
  const error = failure(() => hcGet('t9', { env: fake('hc-error').env }));
  expect([error.program, error.reason, error.exitCode, error.kind]).toEqual(['hc', 'failed', 3, 'not_found']);
  expect(error.message).toContain('no terminal "t9"');
  const listError = await asyncFailure(() => hcListAsync(RH_NOTIFY_LABELS, { env: fake('hc-error').env }));
  expect([listError.reason, listError.exitCode, listError.kind]).toEqual(['failed', 3, 'not_found']);
  expect(failure(() => hcGet('t4', { env: fake('text').env })).reason).toBe('invalid_response');
  for (const address of ['rh-worker', 't0', 't1a']) {
    const bad = fake('ok', { terminals: [{ ...TERMINAL, address }] });
    expect(failure(() => hcList(RH_NOTIFY_LABELS, { env: bad.env })).reason).toBe('invalid_response');
    expect((await asyncFailure(() => hcListAsync(RH_NOTIFY_LABELS, { env: bad.env }))).reason).toBe('invalid_response');
  }
  for (const invalid of [{ labels: { n: 1 } }, { pid: 0 }, { foreground: { pid: 9, name: 'claude', argv: ['claude'] } }, { reason: 1 },
    { status: { state: 'idle', app: 23 } }, { status: { state: 'idle', kind: [] } }, { status: { state: 'idle', msg: {} } }]) {
    expect(failure(() => hcGet('t4', { env: fake('ok', { ...TERMINAL, ...invalid }).env })).reason).toBe('invalid_response');
  }
  expect(failure(() => hcRm('t4', { env: fake('ok', TERMINAL, { rm: { gone: 't4' } }).env })).reason).toBe('invalid_response');
});

// Fake values only: the test proves which keys reach the child, never a real credential.
const SECRETS = Object.fromEntries(NOTIFY_SECRET_KEYS.map(key => [key, `fake-${key.toLowerCase()}`]));
const leaked = (keys: readonly string[]) => NOTIFY_SECRET_KEYS.filter(key => keys.includes(key));

test('environment: no notify secret key reaches a sync, async or event-stream child from an explicit env', async () => {
  const run = fake('stream', JSON.stringify({ channel: null, seq: 1, terminals: [TERMINAL] }), { get: TERMINAL, ls: { hidden_finished: 0, terminals: [] } });
  const env: NodeJS.ProcessEnv = { ...run.env, ...SECRETS, HC_SOCKET: '/tmp/hc-fake.sock' };
  hcGet('t4', { env: { ...env, FAKE_MODE: 'ok' } });
  await hcListAsync(RH_NOTIFY_LABELS, { env: { ...env, FAKE_MODE: 'ok' } });
  let ready!: () => void;
  const received = new Promise<void>(resolve => { ready = resolve; });
  const events = hcEvents(RH_NOTIFY_LABELS, () => ready(), { env });
  await received;
  events.close();
  await events.done;
  const keys = run.envKeys();
  expect(keys.filter(key => key === 'HC_SOCKET')).toHaveLength(3);
  expect(leaked(keys)).toEqual([]);
});

test('environment: no notify secret key reaches the child from the process.env default', () => {
  const run = fake('ok', TERMINAL);
  const saved = { ...process.env };
  Object.assign(process.env, run.env, SECRETS);
  try { hcGet('t4'); } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
  const keys = run.envKeys();
  expect(keys).toContain('FAKE_MODE');
  expect(leaked(keys)).toEqual([]);
});

test('hc missing: the error names the missing program', () => {
  const empty = tmpWorkspace('hc-missing'); roots.push(empty);
  const error = failure(() => hcGet('t4', { env: { PATH: empty } }));
  expect([error.program, error.reason]).toEqual(['hc', 'missing']);
  expect(failure(() => herdrAppDo('pane.close', { pane: 'p1' }, { env: { PATH: empty } })).program).toBe('herdr-app');
});

test('scope: nested runtimes, labels outside the repo-harness set and addresses other than t<n> are refused before any spawn', () => {
  const run = fake('ok', TERMINAL);
  expect(failure(() => hcGet('t4', { env: { ...run.env, HC_TERMINAL_ID: 't1', HERDR_ENV: '1' } })).reason).toBe('nested');
  const refused: HcLabels[] = [{}, { 'herdr.space': 's1' }, { 'Bad Key': 'x', ...RH_NOTIFY_LABELS }, { 'repo-harness.owner': 'x' },
    { [RH_LABEL.role]: 'worker' }, { [RH_LABEL.notify]: 'off' }];
  for (const labels of refused) expect(failure(() => hcList(labels, { env: run.env })).reason).toBe('invalid_labels');
  for (const target of ['rh-worker', 'vps/t3', 'mini-cf/t11', 'lab/odd?terminal', 't0', 't1a', 't10000000', '-t4']) {
    for (const call of [() => hcGet(target, { env: run.env }), () => hcKill(target, { env: run.env }), () => hcRm(target, { env: run.env }),
      () => hcSend(target, 'hello', { env: run.env }), () => hcRead(target, 5, { env: run.env }),
      () => hcWait(target, 1, { env: run.env }), () => hcLabel(target, RH_NOTIFY_LABELS, { env: run.env })]) {
      expect(failure(call).reason).toBe('invalid_address');
    }
  }
  expect(run.argv()).toEqual([]);
});

test('scope: a terminal without a repo-harness label is refused, and kill and rm never reach it', () => {
  const personal = fake('ok', { ...TERMINAL, labels: { 'herdr.space': 's1' } });
  for (const call of [() => hcGet('t4', { env: personal.env }), () => hcKill('t4', { env: personal.env }), () => hcRm('t4', { env: personal.env }),
    () => hcSend('t4', 'hello', { env: personal.env })]) {
    expect(failure(call).reason).toBe('unowned');
  }
  expect(personal.argv()).toEqual([...GET, ...GET, ...GET, ...GET]);
});

test('herdr-app do sends one JSON object and reads its stdout error', () => {
  const ok = fake('ok', { pane: 'p12', terminal: 't5' });
  expect(herdrAppDo('pane.split', { direction: 'right', pane: 'p3', argv: ['claude'] }, { env: ok.env })).toEqual({ pane: 'p12', terminal: 't5' });
  expect(ok.argv()).toEqual(['do', 'pane.split', '{"direction":"right","pane":"p3","argv":["claude"]}']);
  const error = failure(() => herdrAppDo('tab.new', { place: 'x' }, { env: fake('app-error').env }));
  expect([error.program, error.reason, error.exitCode, error.message]).toEqual(['herdr-app', 'failed', 1, 'herdr-app_failed (exit 1): unknown argument "place"']);
  // The operator shows the argv that herdrAppDo runs, so both come from one builder.
  const keep = fake('ok', { pane: 'p4', terminal: 't12' });
  expect(herdrAppCommand('terminal.keep', { terminal: 't12' })).toEqual(['herdr-app', 'do', 'terminal.keep', '{"terminal":"t12"}']);
  expect(herdrAppDo('terminal.keep', { terminal: 't12' }, { env: keep.env })).toEqual({ pane: 'p4', terminal: 't12' });
  expect(keep.argv()).toEqual(['do', 'terminal.keep', '{"terminal":"t12"}']);
});

test('server status: the core id and version are read; a bad version, a missing core id or an hc error fail', async () => {
  const STATUS = { core: { id: 'c-1', name: 'host' }, finished: 0, holder: null, holders: [], installed_by: null, live: 2, pid: 9, uptime_ms: 5, version: '0.1.17' };
  const ok = fake('ok', STATUS);
  expect(await hcServerStatusAsync({ env: ok.env })).toEqual({ version: '0.1.17', core: { id: 'c-1', name: 'host' }, live: 2, finished: 0 });
  expect(ok.argv()).toEqual(['server', 'status', '--json']);
  for (const invalid of [{ version: '0.1' }, { version: 'v0.1.17' }, { core: { id: '', name: 'host' } }, { core: null }, { live: -1 }]) {
    expect((await asyncFailure(() => hcServerStatusAsync({ env: fake('ok', { ...STATUS, ...invalid }).env }))).reason).toBe('invalid_response');
  }
  expect((await asyncFailure(() => hcServerStatusAsync({ env: fake('hc-error').env }))).kind).toBe('not_found');
});

test('events: snapshot, heartbeat, missed and event; close resolves, and a bad line or a throwing onItem stops the stream', async () => {
  const terminals = [TERMINAL, { ...TERMINAL, address: 'mini-cf/t11' }, { address: 'lab/odd?terminal', labels: null }];
  const lines = [JSON.stringify({ channel: null, seq: 3, terminals }),
    JSON.stringify({ jsonrpc: '2.0', method: 'heartbeat', params: { seq: 3 } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'missed', params: { seq: 9, terminals } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { seq: 9, terminal: 'mini-cf/t11', type: 'turn', data: { state: 'blocked', turn: 3 } } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { terminal: 'lab/odd?terminal', type: null, data: 9 } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { seq: 10, terminal: 't4', type: 'turn', data: { state: 'idle', turn: 3 } } }),
    // hc sends foreground data null when no process is in the foreground.
    JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { seq: 11, terminal: 't4', type: 'foreground', data: null } })].join('\n');
  const stream = fake('stream', lines);
  const items: HcStreamItem[] = [];
  let ready!: () => void;
  const received = new Promise<void>(resolve => { ready = resolve; });
  const events = hcEvents(RH_NOTIFY_LABELS, item => { items.push(item); if (items.length === 4) ready(); }, { env: stream.env });
  await received;
  events.close();
  await events.done;
  expect(items.filter(item => item.type !== 'event').map(item => item.terminals.map(row => row.address))).toEqual([['t4'], ['t4']]);
  expect(items.map(item => item.type === 'event' ? [item.type, item.seq, item.event, item.data] : [item.type, item.seq, item.terminals[0]!.labels]))
    .toEqual([['snapshot', 3, { 'repo-harness.role': 'notify-relay' }], ['missed', 9, { 'repo-harness.role': 'notify-relay' }],
      ['event', 10, 'turn', { state: 'idle', turn: 3 }], ['event', 11, 'foreground', null]]);
  expect(stream.argv()).toEqual(['events', '--json', '--label', 'repo-harness.notify=on']);

  for (const line of ['not json', JSON.stringify({ jsonrpc: '2.0', method: 'other', params: { seq: 4 } }),
    JSON.stringify({ seq: 4, terminals: [{ ...TERMINAL, address: 't1a' }] }),
    JSON.stringify({ method: 'missed', params: { seq: 4, terminals: [{ ...TERMINAL, address: 't1a' }] } }),
    JSON.stringify({ method: 'event', params: { seq: 4, terminal: 't1a', type: 'turn', data: {} } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { seq: 4, terminal: 't4', type: 'turn', data: null } })]) {
    const bad = hcEvents(RH_NOTIFY_LABELS, () => {}, { env: fake('stream', line).env });
    expect(await bad.done.then(() => null, (error: HerdrCoreError) => error.reason)).toBe('invalid_response');
  }
  const consumerError = new Error('consumer failed');
  const throwing = hcEvents(RH_NOTIFY_LABELS, () => { throw consumerError; }, { env: fake('stream', lines).env });
  expect(await throwing.done.then(() => null, (error: unknown) => error)).toBe(consumerError);
});
