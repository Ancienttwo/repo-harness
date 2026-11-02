import { afterEach, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpWorkspace } from '../helpers/repo-fixture';
import { HerdrCoreError, RH_LABEL, RH_NOTIFY_LABELS, RH_NOTIFY_RELAY, hcEvents, hcGet, hcKill, hcList, hcRm, hcRun, herdrAppDo, type HcLabels, type HcStreamItem }
  from '../../src/effects/terminal/herdr-core';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const TERMINAL = { address: 't4', name: 'rh-worker', state: 'live', labels: { 'repo-harness.role': 'notify-relay' }, status: { state: 'idle', app: 'repo-harness' }, turn: 2, pid: 9 };
// One script stands in for both programs; FAKE_MODE picks the outcome and argv is logged per line.
const FAKE = `#!/bin/sh
for arg in "$@"; do printf '%s\\n' "$arg" >> "$FAKE_LOG"; done
case "$FAKE_MODE" in
  ok) printf '%s' "$FAKE_STDOUT" ;;
  hang) exec sleep 5 ;;
  hc-error) printf '%s' '{"error":{"kind":"not_found","message":"no terminal \\"t9\\"","hint":"see hc ls --all"}}' >&2; exit 3 ;;
  app-error) printf '%s' '{ "error": "unknown argument \\"place\\"" }'; exit 1 ;;
  text) printf 'not json' ;;
  stream) printf '%s\\n' "$FAKE_STDOUT"; exec sleep 5 ;;
esac
`;

function fake(mode: string, stdout: unknown = {}) {
  const root = tmpWorkspace('hc-transport'); roots.push(root);
  const bin = join(root, 'bin'), log = join(root, 'argv.log');
  mkdirSync(bin); writeFileSync(log, '');
  for (const name of ['hc', 'herdr-app']) { writeFileSync(join(bin, name), FAKE); chmodSync(join(bin, name), 0o755); }
  const env: NodeJS.ProcessEnv = { PATH: `${bin}:/bin:/usr/bin`, FAKE_MODE: mode, FAKE_LOG: log,
    FAKE_STDOUT: typeof stdout === 'string' ? stdout : JSON.stringify(stdout) };
  return { env, root, argv: () => readFileSync(log, 'utf8').split('\n').filter(Boolean) };
}

function failure(call: () => unknown): HerdrCoreError {
  try { call(); } catch (error) { expect(error).toBeInstanceOf(HerdrCoreError); return error as HerdrCoreError; }
  throw new Error('expected a HerdrCoreError');
}

test('success: labels go in on run and list, and come back out of get', () => {
  const run = fake('ok', { address: 't4', agent: 'claude', cwd: '/w', name: 'rh-worker', state: 'live', turn: 0 });
  expect(hcRun({ argv: ['claude', '--resume'], labels: { ...RH_NOTIFY_RELAY.labels, [RH_LABEL.task]: '1475' }, name: RH_NOTIFY_RELAY.name, cwd: '/w', noParent: true }, { env: run.env }))
    .toEqual({ address: 't4', name: 'rh-worker', state: 'live' });
  expect(run.argv()).toEqual(['run', '--json', '--bg', '--label', 'repo-harness.role=notify-relay', '--label', 'repo-harness.task=1475',
    '--name', 'rh-notify-relay', '--cwd', '/w', '--no-parent', '--', 'claude', '--resume']);

  const list = fake('ok', { hidden_finished: 0, terminals: [{ address: 't4', agent: 'claude', name: null, state: 'live', turn: 0 }] });
  expect(hcList(RH_NOTIFY_LABELS, { env: list.env })).toEqual([{ address: 't4', name: null, state: 'live' }]);
  expect(list.argv()).toEqual(['ls', '--json', '--label', 'repo-harness.notify=on']);

  const get = fake('ok', TERMINAL);
  expect(hcGet('t4', { env: get.env })).toEqual({ address: 't4', name: 'rh-worker', state: 'live',
    labels: { 'repo-harness.role': 'notify-relay' }, status: { state: 'idle', app: 'repo-harness' }, turn: 2 });
  expect(get.argv()).toEqual(['get', '--json', '--', 't4']);
});

test('timeout: a hung hc is killed at the transport timeout', () => {
  const hang = fake('hang');
  const started = Date.now();
  expect(failure(() => hcGet('t4', { env: hang.env, timeoutMs: 200 })).reason).toBe('timeout');
  expect(Date.now() - started).toBeLessThan(4_000);
});

test('hc error: the exit code and hc error kind are kept', () => {
  const error = failure(() => hcGet('t9', { env: fake('hc-error').env }));
  expect([error.program, error.reason, error.exitCode, error.kind]).toEqual(['hc', 'failed', 3, 'not_found']);
  expect(error.message).toContain('no terminal "t9"');
  expect(failure(() => hcGet('t4', { env: fake('text').env })).reason).toBe('invalid_response');
  expect(failure(() => hcGet('t4', { env: fake('ok', { ...TERMINAL, labels: { n: 1 } }).env })).reason).toBe('invalid_response');
});

test('hc missing: the error names the missing program', () => {
  const empty = tmpWorkspace('hc-missing'); roots.push(empty);
  const error = failure(() => hcGet('t4', { env: { PATH: empty } }));
  expect([error.program, error.reason]).toEqual(['hc', 'missing']);
  expect(failure(() => herdrAppDo('pane.close', { pane: 'p1' }, { env: { PATH: empty } })).program).toBe('herdr-app');
});

test('refusals happen before any spawn: nested runtimes and labels outside the repo-harness set', () => {
  const run = fake('ok', TERMINAL);
  expect(failure(() => hcGet('t4', { env: { ...run.env, HC_TERMINAL_ID: 't1', HERDR_ENV: '1' } })).reason).toBe('nested');
  const refused: HcLabels[] = [{}, { 'herdr.space': 's1' }, { 'Bad Key': 'x', ...RH_NOTIFY_LABELS }, { 'repo-harness.owner': 'x' },
    { [RH_LABEL.role]: 'worker' }, { [RH_LABEL.notify]: 'off' }];
  for (const labels of refused) {
    expect(failure(() => hcList(labels, { env: run.env })).reason).toBe('invalid_labels');
  }
  expect(run.argv()).toEqual([]);
});

test('herdr-app do sends one JSON object and reads its stdout error', () => {
  const ok = fake('ok', { pane: 'p12', terminal: 't5' });
  expect(herdrAppDo('pane.split', { direction: 'right', pane: 'p3', argv: ['claude'] }, { env: ok.env })).toEqual({ pane: 'p12', terminal: 't5' });
  expect(ok.argv()).toEqual(['do', 'pane.split', '{"direction":"right","pane":"p3","argv":["claude"]}']);
  const error = failure(() => herdrAppDo('tab.new', { place: 'x' }, { env: fake('app-error').env }));
  expect([error.program, error.reason, error.exitCode, error.message]).toEqual(['herdr-app', 'failed', 1, 'herdr-app_failed (exit 1): unknown argument "place"']);
});

test('events: a labeled snapshot then events; close resolves and a bad line rejects', async () => {
  const lines = [JSON.stringify({ channel: null, seq: 3, terminals: [TERMINAL] }),
    JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { seq: 4, terminal: 't4', type: 'turn', data: { state: 'idle', turn: 3 } } })].join('\n');
  const stream = fake('stream', lines);
  const items: HcStreamItem[] = [];
  let ready!: () => void;
  const received = new Promise<void>(resolve => { ready = resolve; });
  const events = hcEvents(RH_NOTIFY_LABELS, item => { items.push(item); if (items.length === 2) ready(); }, { env: stream.env });
  await received;
  events.close();
  await events.done;
  expect(items.map(item => item.type === 'snapshot' ? item.terminals[0]!.labels : [item.event, item.data]))
    .toEqual([{ 'repo-harness.role': 'notify-relay' }, ['turn', { state: 'idle', turn: 3 }]]);
  expect(stream.argv()).toEqual(['events', '--json', '--label', 'repo-harness.notify=on']);

  const bad = hcEvents(RH_NOTIFY_LABELS, () => {}, { env: fake('stream', 'not json').env });
  expect(await bad.done.then(() => null, (error: HerdrCoreError) => error.reason)).toBe('invalid_response');
});
