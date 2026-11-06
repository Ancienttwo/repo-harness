import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildQuotaReport,
  classifyQuotaReading,
  decodeClaudeQuotaCapture,
  decodeCodexRateLimitsResult,
  decodeQuotaReport,
  formatQuotaReport,
  type QuotaReport,
} from '../../src/core/board/quota';
import { formatSeatRoutes, type SeatAccountStates } from '../../src/core/board/seat-routing';
import { DEFAULT_SEATS_CONFIG } from '../../src/core/board/seats-settings';

const ROOT = join(import.meta.dir, '../..');
const CLI = join(ROOT, 'src/cli/index.ts');
const HOOK_ENTRY = join(ROOT, 'src/cli/hook-entry.ts');
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

describe('seat quota routing', () => {
  test.each([
    ['normal', 'normal', ['worker-important', 'worker-deep'], 'worker-important'],
    ['unknown', 'surplus', ['worker-important', 'worker-deep'], 'worker-deep'],
    ['tight', 'normal', ['worker-important', 'worker-deep'], 'worker-deep'],
    ['exhausted', 'normal', ['worker-important', 'worker-deep'], 'worker-deep'],
    ['tight', 'tight', ['worker-important', 'worker-deep'], 'worker-deep'],
    ['unknown', 'exhausted', ['worker-important', 'worker-deep'], 'worker-important'],
    ['exhausted', 'exhausted', ['worker-important', 'worker-deep'], 'none'],
    ['tight', 'tight', ['worker', 'worker-light'], 'worker-light'],
  ] as const)('routes claude %s and chatgpt %s through %j to %s', (claude, chatgpt, candidates, selected) => {
    const seats = { ...DEFAULT_SEATS_CONFIG, routing: { ...DEFAULT_SEATS_CONFIG.routing, important_deep: candidates } };
    const line = formatSeatRoutes(seats, { claude, chatgpt }).split('\n')[0]!;
    expect(line).toStartWith(`route important_deep: ${selected} (`);
    if (selected === 'none') expect(line).toContain('claude exhausted, reserved for advisor and orchestrator; chatgpt exhausted');
    if (selected === 'worker-deep' && (claude === 'tight' || claude === 'exhausted')) expect(line).toContain(`skipped worker-important: claude ${claude}, reserved for advisor and orchestrator`);
    if (selected === 'worker-deep' && chatgpt === 'tight') expect(line).toContain('chatgpt tight');
    if (selected === 'worker-important' && claude === 'unknown') expect(line).toContain('claude unknown');
  });

  test.each(['tight', 'exhausted', 'normal', 'unknown'] as const)('explorer selection with claude %s', claude => {
    const lines = formatSeatRoutes(DEFAULT_SEATS_CONFIG, { claude, chatgpt: 'normal' }).split('\n');
    expect(lines).toContain(claude === 'tight' || claude === 'exhausted' ? `explorer: haiku high (claude ${claude})` : 'explorer: default');
  });

  test('frontend waits for tight Claude without a Codex or Pi fallback', () => {
    expect(formatSeatRoutes(DEFAULT_SEATS_CONFIG, { claude: 'tight', chatgpt: 'surplus' }).split('\n'))
      .toContain('route frontend: none (claude tight, reserved for advisor and orchestrator; frontend waits for claude)');
  });

  test('hyper overrides route models and exposes only the exhausted advisor fallback', () => {
    const seats = { ...DEFAULT_SEATS_CONFIG, routing: { ...DEFAULT_SEATS_CONFIG.routing, mode: 'hyper' as const } };
    const states: SeatAccountStates = { claude: 'normal', chatgpt: 'normal' };
    const normal = formatSeatRoutes(seats, states);
    expect(normal).toContain('route important_deep: worker-important (claude opus high)');
    expect(normal).toContain('route simple_fast: worker (codex gpt-6-astra high)');
    expect(normal).toContain('gatekeeper: gatekeeper (codex gpt-6-astra high; chatgpt normal)');
    expect(normal).toContain('reviewer: reviewer (claude opus high; claude normal)');
    expect(normal).not.toContain('advisor: fallback');
    const exhausted = formatSeatRoutes(seats, { ...states, claude: 'exhausted' });
    expect(exhausted).toContain('advisor: fallback codex gpt-6-astra high (claude exhausted)');
    expect(exhausted).toContain('route frontend: none (claude exhausted, reserved for advisor and orchestrator; frontend waits for claude)');
  });
});

describe('quota classification', () => {
  test('the report decoder preserves a built report and rejects malformed wire shapes', () => {
    const report = buildQuotaReport([
      decodeClaudeQuotaCapture({ observed_at: new Date(NOW).toISOString(), rate_limits: { seven_day: week(50, 84) } }),
      decodeCodexRateLimitsResult({ rateLimits: {
        primary: { usedPercent: 10, windowDurationMins: 10080, resetsAt: (NOW + 84 * HOUR) / 1000 },
        planType: 'pro', credits: { hasCredits: true, unlimited: false, balance: '12.50' },
      } }, new Date(NOW).toISOString()),
      decodeCodexRateLimitsResult({}, new Date(NOW).toISOString()),
    ], NOW);
    expect(decodeQuotaReport(report)).toBe(report);
    const nullable = structuredClone(report);
    nullable.accounts[1]!.codex!.credits = null;
    nullable.accounts[1]!.codex!.plan_type = null;
    expect(decodeQuotaReport(nullable)).toBe(nullable);
    const rows: Array<[string, unknown]> = [
      ['protocol', 'other'], ['read_at', null], ['accounts', {}], ['accounts.0', []],
      ['accounts.0.account', 'other'], ['accounts.0.source', 'other'], ['accounts.0.observed_at', 1],
      ['accounts.0.state', 'absent'], ['accounts.0.reason', false], ['accounts.0.windows', {}],
      ['accounts.0.windows.0', null], ['accounts.0.windows.0.window', 1],
      ['accounts.0.windows.0.window_minutes', '300'], ['accounts.0.windows.0.used_percent', NaN],
      ['accounts.0.windows.0.resets_at', 1], ['accounts.0.windows.0.elapsed_percent', false],
      ['accounts.0.windows.0.pace', Infinity], ['accounts.0.windows.0.state', 'other'], ['accounts.0.windows.0.reason', {}],
      ['accounts.1.codex', undefined], ['accounts.1.codex.plan_type', 1], ['accounts.1.codex.credits', []],
      ['accounts.1.codex.credits.has_credits', 'yes'], ['accounts.1.codex.credits.unlimited', 0],
      ['accounts.1.codex.credits.balance', 12], ['accounts.1.codex.rate_limit_reached_type', false],
      ['accounts.1.codex.field_errors', null], ['accounts.1.codex.field_errors', [1]],
    ];
    const at = (value: unknown, path: string[]): Record<string, unknown> => path.reduce((row, key) => (row as Record<string, unknown>)[key], value) as Record<string, unknown>;
    for (const [path, invalid] of rows) {
      const value = structuredClone(report), keys = path.split('.'), key = keys.pop()!;
      at(value, keys)[key] = invalid;
      expect(() => decodeQuotaReport(value), path).toThrow();
    }
    for (const path of ['', 'accounts.0', 'accounts.0.windows.0', 'accounts.1.codex', 'accounts.1.codex.credits']) {
      const keys = path ? path.split('.') : [];
      const fields = Object.keys(at(report, keys));
      for (const key of [...fields, 'extra']) {
        const value = structuredClone(report), row = at(value, keys);
        if (key === 'extra') row.extra = true; else delete row[key];
        expect(() => decodeQuotaReport(value), `${path}.${key}`).toThrow();
      }
    }
    for (const value of [null, [], 'report']) expect(() => decodeQuotaReport(value)).toThrow();
  });

  test.each([
    // [case, seven_day used, hours to reset, window state, account state] — elapsed at 84 h is 50%.
    // five_hour is absent, so the account state is the seven_day state.
    ['used at 95 is exhausted', 95, 84, 'exhausted', 'exhausted'],
    ['headroom under 15 is tight', 86, 160, 'tight', 'tight'],
    ['pace over +15 is tight', 66, 84, 'tight', 'tight'],
    ['pace +15 exactly is normal', 65, 84, 'normal', 'normal'],
    ['pace under -25 with the reset under 24 h is surplus', 60, 12, 'surplus', 'surplus'],
    ['pace under -25 with the reset 24 h or more away is normal', 10, 84, 'normal', 'normal'],
  ] as const)('%s', (_name, used, hours, windowState, accountState) => {
    const account = claude({ seven_day: week(used, hours) });
    expect(account.windows.find(window => window.window === 'seven_day')?.state).toBe(windowState);
    expect(account.state).toBe(accountState);
  });

  test('the worst window wins and each failed field names its reason', () => {
    const fiveHour = { used_percentage: 96, resets_at: (NOW + HOUR) / 1000 };
    expect(claude({ five_hour: fiveHour, seven_day: week(60, 12) }).state).toBe('exhausted');
    expect(claude({ five_hour: { used_percentage: 10, resets_at: (NOW + 4 * HOUR) / 1000 }, seven_day: week(60, 12) }).state).toBe('normal');
    const cases: Array<[Record<string, unknown>, string]> = [
      [{}, 'seven_day absent'],
      [{ seven_day: null }, 'seven_day absent'],
      [{ seven_day: 'x' }, 'seven_day is not an object'],
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
      reason: 'no window of 10080 min',
      windows: [{ window: 'primary', state: 'unknown', reason: 'primary.windowDurationMins missing or not a positive integer' }, { window: 'secondary', state: 'absent', reason: 'secondary absent' }],
      codex: { plan_type: null, credits: null, field_errors: ['planType is not a string or null', 'credits is not { hasCredits, unlimited, balance }'] },
    });
    expect(classifyQuotaReading(decodeCodexRateLimitsResult({ rateLimits: { rateLimitReachedType: 3 } }, new Date(NOW).toISOString()), NOW)).toMatchObject({ state: 'unknown', reason: 'rateLimitReachedType is not a string or null' });
    expect(buildQuotaReport([decodeCodexRateLimitsResult({}, new Date(NOW).toISOString())], NOW).accounts[0]).toMatchObject({ state: 'unknown', reason: 'result.rateLimits is not an object' });
  });

  test('the weekly window decides the account and an absent non-weekly window is absent', () => {
    const stale = new Date(NOW - 31 * 60_000).toISOString();
    const codexWindow = (used: number, minutes: number, hours: number) => ({ usedPercent: used, windowDurationMins: minutes, resetsAt: (NOW + hours * HOUR) / 1000 });
    const codex = (rateLimits: Record<string, unknown>, observedAt = new Date(NOW).toISOString()) => classifyQuotaReading(decodeCodexRateLimitsResult({ rateLimits }, observedAt), NOW);
    const fiveHour = (used: number) => ({ used_percentage: used, resets_at: (NOW + 4 * HOUR) / 1000 });
    const weekly = codexWindow(5, 10_080, 160), short = codexWindow(10, 300, 4);
    const rows: Array<[string, ReturnType<typeof classifyQuotaReading>, string, string | null, Array<[string, string, string | null]>]> = [
      // [case, account report, account state, account reason, [window, state, reason]]
      ['claude weekly absent', claude({ five_hour: fiveHour(10) }), 'unknown', null, [['five_hour', 'normal', null], ['seven_day', 'unknown', 'seven_day absent']]],
      ['claude weekly absent, five_hour exhausted', claude({ five_hour: fiveHour(96) }), 'exhausted', null, [['five_hour', 'exhausted', null], ['seven_day', 'unknown', 'seven_day absent']]],
      ['claude weekly absent, five_hour tight', claude({ five_hour: fiveHour(90) }), 'tight', null, [['five_hour', 'tight', null], ['seven_day', 'unknown', 'seven_day absent']]],
      ['claude weekly malformed, five_hour exhausted', claude({ five_hour: fiveHour(96), seven_day: { used_percentage: 5 } }), 'exhausted', null, [['five_hour', 'exhausted', null], ['seven_day', 'unknown', 'seven_day.resets_at missing or not Unix seconds']]],
      ['claude weekly stale', claude({ seven_day: week(10, 84) }, stale), 'unknown', 'reading older than 30 min', [['five_hour', 'unknown', 'reading older than 30 min'], ['seven_day', 'unknown', 'reading older than 30 min']]],
      ['claude weekly malformed', claude({ five_hour: fiveHour(10), seven_day: { used_percentage: 5 } }), 'unknown', null, [['five_hour', 'normal', null], ['seven_day', 'unknown', 'seven_day.resets_at missing or not Unix seconds']]],
      ['claude non-weekly undefined', claude({ seven_day: week(10, 84) }), 'normal', null, [['five_hour', 'absent', 'five_hour absent'], ['seven_day', 'normal', null]]],
      ['claude non-weekly null', claude({ five_hour: null, seven_day: week(10, 84) }), 'normal', null, [['five_hour', 'absent', 'five_hour absent'], ['seven_day', 'normal', null]]],
      ['claude non-weekly malformed', claude({ five_hour: 'x', seven_day: week(10, 84) }), 'unknown', null, [['five_hour', 'unknown', 'five_hour is not an object'], ['seven_day', 'normal', null]]],
      ['claude non-weekly valid', claude({ five_hour: fiveHour(96), seven_day: week(10, 84) }), 'exhausted', null, [['five_hour', 'exhausted', null], ['seven_day', 'normal', null]]],
      ['codex weekly absent', codex({ primary: short, secondary: null }), 'unknown', 'no window of 10080 min', [['primary', 'normal', null], ['secondary', 'absent', 'secondary absent']]],
      ['codex weekly absent, primary exhausted', codex({ primary: codexWindow(96, 300, 4), secondary: null }), 'exhausted', 'no window of 10080 min', [['primary', 'exhausted', null], ['secondary', 'absent', 'secondary absent']]],
      ['codex weekly absent, primary tight', codex({ primary: codexWindow(90, 300, 4), secondary: null }), 'tight', 'no window of 10080 min', [['primary', 'tight', null], ['secondary', 'absent', 'secondary absent']]],
      ['codex weekly malformed, primary exhausted', codex({ primary: codexWindow(96, 300, 4), secondary: { ...weekly, usedPercent: -1 } }), 'exhausted', null, [['primary', 'exhausted', null], ['secondary', 'unknown', 'secondary.usedPercent missing or not a non-negative integer']]],
      ['codex weekly stale', codex({ primary: weekly, secondary: null }, stale), 'unknown', 'reading older than 30 min', [['primary', 'unknown', 'reading older than 30 min'], ['secondary', 'unknown', 'reading older than 30 min']]],
      ['codex weekly malformed', codex({ primary: { ...weekly, usedPercent: -1 }, secondary: null }), 'unknown', null, [['primary', 'unknown', 'primary.usedPercent missing or not a non-negative integer'], ['secondary', 'absent', 'secondary absent']]],
      ['codex non-weekly undefined', codex({ primary: weekly }), 'normal', null, [['primary', 'normal', null], ['secondary', 'absent', 'secondary absent']]],
      ['codex non-weekly null', codex({ primary: weekly, secondary: null }), 'normal', null, [['primary', 'normal', null], ['secondary', 'absent', 'secondary absent']]],
      ['codex non-weekly malformed', codex({ primary: weekly, secondary: { ...short, resetsAt: 0 } }), 'unknown', null, [['primary', 'normal', null], ['secondary', 'unknown', 'secondary.resetsAt missing or not Unix seconds']]],
      ['codex non-weekly valid', codex({ primary: codexWindow(90, 300, 4), secondary: weekly }), 'tight', null, [['primary', 'tight', null], ['secondary', 'normal', null]]],
    ];
    for (const [name, account, state, reason, windows] of rows) {
      expect([name, account.state, account.reason, account.windows.map(window => [window.window, window.state, window.reason])]).toEqual([name, state, reason, windows]);
    }
    const line = formatQuotaReport(buildQuotaReport([decodeCodexRateLimitsResult({ rateLimits: { primary: weekly, secondary: null } }, new Date(NOW).toISOString())], NOW));
    expect(line).toStartWith('chatgpt: normal | primary normal 5% used, pace +0.2, ');
    expect(line).toContain('; secondary absent | read ');
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
    out({ id: message.id, result: { rateLimits: { primary: { usedPercent: 50, windowDurationMins: 300, resetsAt: Math.floor(Date.now() / 1000) + 2 * 3600 }, secondary: { usedPercent: 1, windowDurationMins: 10080, resetsAt }, credits: { hasCredits: true, unlimited: false, balance: '34410.83' }, planType: 'pro', rateLimitReachedType: null } } });
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
    expect(decodeQuotaReport(report)).toBe(report);
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
    const lines = text.stdout.trim().split('\n');
    expect(lines.slice(0, 2).map(line => line.split(' | ')[0])).toEqual(['claude: exhausted', 'chatgpt: normal']);
    expect(lines.slice(2).map(line => line.split(':')[0])).toEqual(['route important_deep', 'route important_fast', 'route simple_deep', 'route simple_fast', 'route frontend', 'explorer', 'gatekeeper', 'reviewer']);
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

describe('repo-harness-hook statusline', () => {
  test('copies rate_limits unchanged with a new observed_at, prints the line, and keeps the old capture otherwise', () => {
    const f = fixture(null);
    const capture = join(f.home, '.repo-harness', 'quota', 'claude.json');
    rmSync(join(f.home, '.repo-harness'), { recursive: true });
    const resetsAt = Math.floor(Date.now() / 1000);
    const fiveHour = { used_percentage: 12.4, resets_at: resetsAt + 2 * 3600 }, sevenDay = { used_percentage: 30, resets_at: resetsAt + 100 * 3600 };
    const statusline = (stdin: string, args: string[] = []) => spawnSync(process.execPath, [HOOK_ENTRY, 'statusline', ...args], { cwd: tmpdir(), env: f.env, input: stdin, encoding: 'utf8', timeout: 40_000 });
    const rows: Array<[string, string, string[], number, string, Record<string, unknown> | 'kept']> = [
      // [case, stdin, extra argv, exit, stdout, written rate_limits or 'kept']
      ['both windows and an undocumented key', JSON.stringify({ session_id: 's', rate_limits: { five_hour: fiveHour, seven_day: sevenDay, other: { x: 1 } } }), [], 0, '5h 12% · 7d 30%\n', { five_hour: fiveHour, seven_day: sevenDay, other: { x: 1 } }],
      ['one window', JSON.stringify({ rate_limits: { seven_day: sevenDay } }), [], 0, '7d 30%\n', { seven_day: sevenDay }],
      ['no rate_limits', JSON.stringify({ session_id: 's' }), [], 0, '\n', 'kept'],
      ['empty stdin', '', [], 0, '\n', 'kept'],
      ['rate_limits not an object', JSON.stringify({ rate_limits: 'x' }), [], 1, '', 'kept'],
      ['stdin not JSON', '{', [], 1, '', 'kept'],
      ['an extra argument', JSON.stringify({ rate_limits: { seven_day: sevenDay } }), ['--json'], 2, '', 'kept'],
    ];
    let previous = '';
    for (const [name, stdin, args, exit, stdout, written] of rows) {
      const before = Date.now();
      const result = statusline(stdin, args);
      expect([name, result.status, result.stdout], result.stderr).toEqual([name, exit, stdout]);
      const text = readFileSync(capture, 'utf8');
      if (written === 'kept') {
        expect([name, text]).toEqual([name, previous]);
        continue;
      }
      const value = JSON.parse(text) as { observed_at: string; rate_limits: unknown };
      expect([name, Object.keys(value), value.rate_limits]).toEqual([name, ['observed_at', 'rate_limits'], written]);
      expect(Date.parse(value.observed_at)).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
      expect(decodeClaudeQuotaCapture(value).reason).toBeNull();
      expect(statSync(capture).mode & 0o777).toBe(0o600);
      previous = text;
    }
    expect(statusline(JSON.stringify({ rate_limits: 'x' })).stderr).toBe('repo-harness-hook statusline: capture not written: rate_limits is not an object\n');
    // The Q1 reader accepts the capture that the writer wrote.
    const report = JSON.parse(quota(['--json'], f.env).stdout) as QuotaReport;
    expect(report.accounts[0]).toMatchObject({ account: 'claude', state: 'normal', observed_at: JSON.parse(previous).observed_at, windows: [{ window: 'five_hour', state: 'absent', reason: 'five_hour absent' }, { window: 'seven_day', state: 'normal', used_percent: 30, reason: null }] });
  });
});
