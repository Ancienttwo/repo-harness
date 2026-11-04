import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildQuotaReport,
  classifyQuotaReading,
  decodeClaudeQuotaCapture,
  decodeCodexRateLimitsResult,
  type QuotaReport,
} from '../../src/core/operator/quota';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
const NOW = Date.parse('2026-11-04T12:00:00.000Z');
const HOUR = 3_600_000;
const fixtures: string[] = [];

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A seven_day window `resetsInHours` before its reset with `used` percent used: elapsed = 100 × (1 − h/168). */
function claude(windows: Record<string, unknown>, observedAt = new Date(NOW).toISOString()) {
  return classifyQuotaReading(decodeClaudeQuotaCapture({ observed_at: observedAt, rate_limits: windows }), NOW);
}
const week = (used: number, resetsInHours: number) => ({ used_percentage: used, resets_at: (NOW + resetsInHours * HOUR) / 1000 });

describe('quota classification', () => {
  test.each([
    // [case, seven_day used, hours to reset, state] — elapsed at 84 h is 50%.
    ['used at 95 is exhausted', 95, 84, 'exhausted'],
    ['headroom under 15 is tight', 86, 160, 'tight'],
    ['pace over +15 is tight', 66, 84, 'tight'],
    ['pace +15 exactly is normal', 65, 84, 'normal'],
    ['pace under -25 with the reset under 24 h is surplus', 60, 12, 'surplus'],
    ['pace under -25 with the reset 24 h or more away is normal', 10, 84, 'normal'],
  ] as const)('%s', (_name, used, hours, state) => {
    const account = claude({ seven_day: week(used, hours) });
    expect(account.windows.find(window => window.window === 'seven_day')?.state).toBe(state);
    // five_hour is absent: an unknown window does not outrank a reading.
    expect(account.state).toBe(state);
  });

  test('the worst window wins and each failed field names its reason', () => {
    const fiveHour = { used_percentage: 96, resets_at: (NOW + HOUR) / 1000 };
    expect(claude({ five_hour: fiveHour, seven_day: week(60, 12) }).state).toBe('exhausted');
    expect(claude({ five_hour: { used_percentage: 10, resets_at: (NOW + 4 * HOUR) / 1000 }, seven_day: week(60, 12) }).state).toBe('normal');
    const cases: Array<[Record<string, unknown>, string]> = [
      [{}, 'seven_day absent'],
      [{ seven_day: null }, 'seven_day is not an object'],
      [{ seven_day: { resets_at: week(1, 1).resets_at } }, 'seven_day.used_percentage missing or not 0-100'],
      [{ seven_day: { used_percentage: 101, resets_at: week(1, 1).resets_at } }, 'seven_day.used_percentage missing or not 0-100'],
      [{ seven_day: { used_percentage: 5, resets_at: '1762300000' } }, 'seven_day.resets_at missing or not Unix seconds'],
      [{ seven_day: week(5, -1) }, 'window reset after the reading'],
      [{ seven_day: week(5, 200) }, 'resets_at is beyond the window length'],
    ];
    for (const [windows, reason] of cases) {
      const account = claude(windows);
      expect(account.state).toBe('unknown');
      expect(account.windows.find(window => window.window === 'seven_day')).toMatchObject({ state: 'unknown', reason, elapsed_percent: null, pace: null });
    }
  });

  test('a reading-level failure makes every window unknown', () => {
    const cases: Array<[unknown, string]> = [
      [{ observed_at: new Date(NOW - 31 * 60_000).toISOString(), rate_limits: { seven_day: week(1, 84) } }, 'reading older than 30 min'],
      [{ observed_at: '2026-11-04 12:00', rate_limits: {} }, 'observed_at is not ISO-8601 UTC'],
      [{ observed_at: new Date(NOW).toISOString(), rate_limits: {}, extra: 1 }, 'capture is not { observed_at, rate_limits }'],
      [{ observed_at: new Date(NOW).toISOString(), rate_limits: [] }, 'rate_limits is not an object'],
    ];
    for (const [capture, reason] of cases) {
      const account = classifyQuotaReading(decodeClaudeQuotaCapture(capture), NOW);
      expect(account).toMatchObject({ account: 'claude', state: 'unknown', reason });
      expect(account.windows.every(window => window.state === 'unknown' && window.reason === reason)).toBe(true);
    }
  });

  test('the Codex decoder reads rateLimits only and fails closed per field', () => {
    const window = (used: number, minutes: number | null, hours: number) => ({ usedPercent: used, windowDurationMins: minutes, resetsAt: (NOW + hours * HOUR) / 1000 });
    const result = {
      rateLimits: { primary: window(10, 300, 4), secondary: window(1, 10_080, 167), credits: { hasCredits: true, unlimited: false, balance: '34410.83' }, planType: 'pro', rateLimitReachedType: null },
      rateLimitsByLimitId: { codex: { primary: window(99, 300, 4) } },
    };
    const normal = classifyQuotaReading(decodeCodexRateLimitsResult(result, new Date(NOW).toISOString()), NOW);
    expect(normal).toMatchObject({ account: 'chatgpt', state: 'normal', reason: null, codex: { plan_type: 'pro', credits: { has_credits: true, unlimited: false, balance: '34410.83' }, field_errors: [] } });
    expect(normal.windows.map(w => [w.window, w.state, w.elapsed_percent])).toEqual([['primary', 'normal', 20], ['secondary', 'normal', 0.6]]);
    const reached = decodeCodexRateLimitsResult({ rateLimits: { ...result.rateLimits, rateLimitReachedType: 'rate_limit_reached' } }, new Date(NOW).toISOString());
    expect(classifyQuotaReading(reached, NOW)).toMatchObject({ state: 'exhausted', reason: 'rate_limit_reached_type rate_limit_reached' });
    const broken = decodeCodexRateLimitsResult({ rateLimits: { primary: window(10, null, 4), secondary: null, credits: { hasCredits: 'yes' }, planType: 7 } }, new Date(NOW).toISOString());
    expect(classifyQuotaReading(broken, NOW)).toMatchObject({
      state: 'unknown',
      windows: [{ window: 'primary', reason: 'primary.windowDurationMins missing or not a positive integer' }, { window: 'secondary', reason: 'secondary absent' }],
      codex: { plan_type: null, credits: null, field_errors: ['planType is not a string or null', 'credits is not { hasCredits, unlimited, balance }'] },
    });
    expect(classifyQuotaReading(decodeCodexRateLimitsResult({ rateLimits: { rateLimitReachedType: 3 } }, new Date(NOW).toISOString()), NOW)).toMatchObject({ state: 'unknown', reason: 'rateLimitReachedType is not a string or null' });
    expect(buildQuotaReport([decodeCodexRateLimitsResult({}, new Date(NOW).toISOString())], NOW).accounts[0]).toMatchObject({ state: 'unknown', reason: 'result.rateLimits is not an object' });
  });
});

const FAKE_CODEX = `#!${process.execPath}
const fs = require('node:fs');
const mode = process.env.FAKE_CODEX_MODE;
const out = message => process.stdout.write(JSON.stringify(message) + '\\n');
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  fs.appendFileSync(process.env.FAKE_CODEX_LOG, JSON.stringify({ argv: process.argv.slice(2), message: JSON.parse(line) }) + '\\n');
  const message = JSON.parse(line);
  if (mode === 'exit') process.exit(3);
  if (message.method === 'initialize') {
    out({ method: 'account/updated', params: {} });
    out({ id: message.id, result: { codexHome: '/fake', platformFamily: 'unix', platformOs: 'macos', userAgent: 'fake' } });
  } else if (message.method === 'account/rateLimits/read') {
    if (mode === 'error') return out({ id: message.id, error: { code: -32603, message: 'not logged in' } });
    const resetsAt = Math.floor(Date.now() / 1000) + 167 * 3600;
    out({ id: message.id, result: { rateLimits: { primary: null, secondary: { usedPercent: 1, windowDurationMins: 10080, resetsAt }, credits: { hasCredits: true, unlimited: false, balance: '34410.83' }, planType: 'pro', rateLimitReachedType: null } } });
  }
});
`;

function fixture(codexMode: string | null) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'quota-')));
  fixtures.push(root);
  const home = join(root, 'home'), bin = join(root, 'bin'), log = join(root, 'codex.jsonl');
  mkdirSync(join(home, '.repo-harness', 'quota'), { recursive: true });
  mkdirSync(bin);
  if (codexMode !== null) {
    writeFileSync(join(bin, 'codex'), FAKE_CODEX);
    chmodSync(join(bin, 'codex'), 0o755);
  }
  const env = { HOME: home, PATH: bin, TMPDIR: tmpdir(), FAKE_CODEX_LOG: log, FAKE_CODEX_MODE: codexMode ?? '' };
  return { home, env, log };
}

function quota(args: string[], env: Record<string, string>) {
  return spawnSync(process.execPath, [CLI, 'quota', ...args], { cwd: ROOT, env, encoding: 'utf8', timeout: 40_000 });
}

describe('repo-harness quota', () => {
  test('reads the capture file and one app-server rateLimits read, grouped by account', () => {
    const f = fixture('ok');
    const resetsAt = Math.floor(Date.now() / 1000) + 2 * 3600;
    writeFileSync(join(f.home, '.repo-harness', 'quota', 'claude.json'), JSON.stringify({ observed_at: new Date().toISOString(), rate_limits: { five_hour: { used_percentage: 97, resets_at: resetsAt } } }));
    const result = quota(['--json'], f.env);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as QuotaReport;
    expect(report.accounts.map(account => [account.account, account.state])).toEqual([['claude', 'exhausted'], ['chatgpt', 'normal']]);
    expect(report.accounts[1]).toMatchObject({ source: 'codex_app_server', codex: { plan_type: 'pro', credits: { balance: '34410.83' } } });
    const calls = readFileSync(f.log, 'utf8').trim().split('\n').map(line => JSON.parse(line) as { argv: string[]; message: Record<string, unknown> });
    expect(calls.every(call => call.argv.join(' ') === 'app-server')).toBe(true);
    expect(calls.map(call => call.message)).toEqual([
      { method: 'initialize', id: 0, params: { clientInfo: { name: 'repo-harness', version: expect.any(String) } } },
      { method: 'initialized' },
      { method: 'account/rateLimits/read', id: 1 },
    ]);
    const text = quota([], f.env);
    expect(text.status).toBe(0);
    expect(text.stdout.trim().split('\n').map(line => line.split(' | ')[0])).toEqual(['claude: exhausted', 'chatgpt: normal']);
  });

  test.each([
    [null, 'codex not on PATH'],
    ['error', 'account/rateLimits/read error: not logged in'],
    ['exit', 'codex app-server exited (3) before the response'],
  ])('codex mode %p is an unknown account with its reason and exit 0', (mode, reason) => {
    const f = fixture(mode);
    const result = quota(['--json'], f.env);
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as QuotaReport;
    expect(report.accounts.map(account => [account.account, account.state, account.reason])).toEqual([['claude', 'unknown', 'no capture'], ['chatgpt', 'unknown', reason]]);
  });
});
