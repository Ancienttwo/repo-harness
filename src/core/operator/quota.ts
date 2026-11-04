/**
 * Quota read model (#1716 Q1). Quota belongs to the provider account, not to
 * the host. One strict decoder per source: a missing or malformed field makes
 * its window `unknown` with a named reason. No decoder fills a default or reads
 * a second source for the same field.
 */
export const QUOTA_PROTOCOL = 'repo-harness.quota.v1' as const;
/** The Claude capture file, relative to HOME. Q1 reads it; the Q2 status line route writes it with mode 0600. */
export const CLAUDE_QUOTA_CAPTURE_PATH = ['.repo-harness', 'quota', 'claude.json'] as const;
export const QUOTA_STALE_MS = 30 * 60_000;
const SURPLUS_RESET_MS = 24 * 3_600_000;
/** The weekly window decides the account. Codex marks it only by this duration. */
const WEEKLY_WINDOW_MINUTES = 10_080;

export type QuotaAccount = 'claude' | 'chatgpt';
export type QuotaState = 'exhausted' | 'tight' | 'normal' | 'surplus' | 'unknown';
/** An absent non-weekly window is `absent`; it does not change the account state (#1741). */
export type QuotaWindowState = QuotaState | 'absent';
/**
 * Worst first: the account takes the first state in this order that one of
 * its windows has. A window without a reading cannot prove headroom, so it
 * outranks normal and surplus (decision 6625256198). The weekly window is
 * required: a missing one counts as `unknown` in this order.
 */
export const QUOTA_STATE_ORDER: readonly QuotaState[] = ['exhausted', 'tight', 'unknown', 'normal', 'surplus'];

/** One present window of the Claude status line stdin `rate_limits` object. */
export interface ClaudeRateLimitWindow { used_percentage: number; resets_at: number }
/**
 * The Claude capture file. `rate_limits` is the status line stdin object,
 * unchanged. A window can be absent: an absent `seven_day` is `unknown`, an
 * absent `five_hour` is `absent`.
 */
export interface ClaudeQuotaCapture {
  observed_at: string;
  rate_limits: { five_hour?: ClaudeRateLimitWindow; seven_day?: ClaudeRateLimitWindow; [window: string]: unknown };
}

export interface CodexCredits { has_credits: boolean; unlimited: boolean; balance: string | null }

interface WindowSample {
  window: string;
  window_minutes: number | null;
  used_percent: number | null;
  /** Unix seconds. */
  resets_at: number | null;
  /** The source has no value (`undefined` or `null`) for this window. */
  absent: boolean;
  reason: string | null;
}

/** A decoded source reading. `reason` set means the whole reading is unknown. */
export interface QuotaReading {
  account: QuotaAccount;
  source: 'claude_capture_file' | 'codex_app_server';
  observed_at: string | null;
  reason: string | null;
  windows: WindowSample[];
  codex?: { plan_type: string | null; credits: CodexCredits | null; rate_limit_reached_type: string | null; field_errors: string[] };
}

export interface QuotaWindowReport {
  window: string;
  window_minutes: number | null;
  used_percent: number | null;
  resets_at: string | null;
  elapsed_percent: number | null;
  pace: number | null;
  state: QuotaWindowState;
  reason: string | null;
}

export interface QuotaAccountReport {
  account: QuotaAccount;
  source: QuotaReading['source'];
  observed_at: string | null;
  state: QuotaState;
  reason: string | null;
  windows: QuotaWindowReport[];
  codex?: QuotaReading['codex'];
}

export interface QuotaReport { protocol: typeof QUOTA_PROTOCOL; read_at: string; accounts: QuotaAccountReport[] }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const ISO_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,3})?Z$/;

export function unknownQuotaReading(account: QuotaAccount, reason: string): QuotaReading {
  return { account, source: account === 'claude' ? 'claude_capture_file' : 'codex_app_server', observed_at: null, reason, windows: [] };
}

function claudeWindow(rateLimits: Record<string, unknown>, window: 'five_hour' | 'seven_day', minutes: number): WindowSample {
  const sample: WindowSample = { window, window_minutes: minutes, used_percent: null, resets_at: null, absent: false, reason: null };
  if (rateLimits[window] === undefined || rateLimits[window] === null) return { ...sample, absent: true, reason: `${window} absent` };
  const value = record(rateLimits[window]);
  if (!value) return { ...sample, reason: `${window} is not an object` };
  const used = value.used_percentage, resets = value.resets_at;
  if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100) return { ...sample, reason: `${window}.used_percentage missing or not 0-100` };
  if (typeof resets !== 'number' || !Number.isFinite(resets) || resets <= 0) return { ...sample, reason: `${window}.resets_at missing or not Unix seconds` };
  return { ...sample, used_percent: used, resets_at: resets };
}

/** Decodes the Claude capture file. Q2 decodes its own output with this function before it writes the file. */
export function decodeClaudeQuotaCapture(value: unknown): QuotaReading {
  const capture = record(value);
  if (!capture || Object.keys(capture).sort().join(',') !== 'observed_at,rate_limits') return unknownQuotaReading('claude', 'capture is not { observed_at, rate_limits }');
  const observed = capture.observed_at;
  if (typeof observed !== 'string' || !ISO_UTC.test(observed) || !Number.isFinite(Date.parse(observed))) return unknownQuotaReading('claude', 'observed_at is not ISO-8601 UTC');
  const rateLimits = record(capture.rate_limits);
  if (!rateLimits) return { ...unknownQuotaReading('claude', 'rate_limits is not an object'), observed_at: observed };
  return {
    account: 'claude', source: 'claude_capture_file', observed_at: observed, reason: null,
    windows: [claudeWindow(rateLimits, 'five_hour', 300), claudeWindow(rateLimits, 'seven_day', 10_080)],
  };
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function codexWindow(snapshot: Record<string, unknown>, window: 'primary' | 'secondary'): WindowSample {
  const sample: WindowSample = { window, window_minutes: null, used_percent: null, resets_at: null, absent: false, reason: null };
  if (snapshot[window] === undefined || snapshot[window] === null) return { ...sample, absent: true, reason: `${window} absent` };
  const value = record(snapshot[window]);
  if (!value) return { ...sample, reason: `${window} is not an object` };
  const minutes = value.windowDurationMins, used = value.usedPercent, resets = value.resetsAt;
  if (!positiveInteger(minutes)) return { ...sample, reason: `${window}.windowDurationMins missing or not a positive integer` };
  if (typeof used !== 'number' || !Number.isSafeInteger(used) || used < 0) return { ...sample, window_minutes: minutes, reason: `${window}.usedPercent missing or not a non-negative integer` };
  if (!positiveInteger(resets)) return { ...sample, window_minutes: minutes, used_percent: used, reason: `${window}.resetsAt missing or not Unix seconds` };
  return { ...sample, window_minutes: minutes, used_percent: used, resets_at: resets };
}

/** Decodes the `account/rateLimits/read` result (codex app-server v2). It reads only `rateLimits`, never `rateLimitsByLimitId`. */
export function decodeCodexRateLimitsResult(value: unknown, observedAt: string): QuotaReading {
  const snapshot = record(record(value)?.rateLimits);
  if (!snapshot) return { ...unknownQuotaReading('chatgpt', 'result.rateLimits is not an object'), observed_at: observedAt };
  const reading: QuotaReading = {
    account: 'chatgpt', source: 'codex_app_server', observed_at: observedAt, reason: null,
    windows: [codexWindow(snapshot, 'primary'), codexWindow(snapshot, 'secondary')],
  };
  const reached = snapshot.rateLimitReachedType;
  if (reached !== null && reached !== undefined && typeof reached !== 'string') return { ...reading, reason: 'rateLimitReachedType is not a string or null' };
  const fieldErrors: string[] = [];
  const plan = snapshot.planType;
  if (plan !== null && plan !== undefined && typeof plan !== 'string') fieldErrors.push('planType is not a string or null');
  let credits: CodexCredits | null = null;
  if (snapshot.credits !== null && snapshot.credits !== undefined) {
    const value = record(snapshot.credits);
    if (value && typeof value.hasCredits === 'boolean' && typeof value.unlimited === 'boolean' && (value.balance === null || value.balance === undefined || typeof value.balance === 'string')) {
      credits = { has_credits: value.hasCredits, unlimited: value.unlimited, balance: typeof value.balance === 'string' ? value.balance : null };
    } else fieldErrors.push('credits is not { hasCredits, unlimited, balance }');
  }
  return {
    ...reading,
    codex: { plan_type: typeof plan === 'string' ? plan : null, credits, rate_limit_reached_type: typeof reached === 'string' ? reached : null, field_errors: fieldErrors },
  };
}

const round = (value: number) => Math.round(value * 10) / 10;

function classifyWindow(sample: WindowSample, nowMs: number, readingReason: string | null): QuotaWindowReport {
  const report: QuotaWindowReport = {
    window: sample.window, window_minutes: sample.window_minutes, used_percent: sample.used_percent,
    resets_at: sample.resets_at === null ? null : new Date(sample.resets_at * 1000).toISOString(),
    elapsed_percent: null, pace: null, state: 'unknown', reason: readingReason ?? sample.reason,
  };
  // An absent Codex window has no duration, so it is never the weekly window.
  if (readingReason === null && sample.absent && sample.window_minutes !== WEEKLY_WINDOW_MINUTES) return { ...report, state: 'absent' };
  if (report.reason !== null || sample.used_percent === null || sample.resets_at === null || sample.window_minutes === null) return report;
  const remainingMs = sample.resets_at * 1000 - nowMs, windowMs = sample.window_minutes * 60_000;
  if (remainingMs <= 0) return { ...report, reason: 'window reset after the reading' };
  if (remainingMs > windowMs) return { ...report, reason: 'resets_at is beyond the window length' };
  const used = sample.used_percent;
  const elapsed = 100 * (1 - remainingMs / windowMs), pace = used - elapsed;
  const state: QuotaState = used >= 95 ? 'exhausted'
    : 100 - used < 15 || pace > 15 ? 'tight'
      : pace < -25 && remainingMs < SURPLUS_RESET_MS ? 'surplus'
        : 'normal';
  return { ...report, elapsed_percent: round(elapsed), pace: round(pace), state };
}

/**
 * Applies the #1716 decision table to each window. The worst window state wins; `rate_limit_reached_type` set means exhausted.
 * No window of 10080 min means no weekly reading; that counts as an unknown window in the order.
 */
export function classifyQuotaReading(reading: QuotaReading, nowMs: number): QuotaAccountReport {
  const stale = reading.reason === null && reading.observed_at !== null && nowMs - Date.parse(reading.observed_at) > QUOTA_STALE_MS;
  const reason = stale ? 'reading older than 30 min' : reading.reason;
  const windows = reading.windows.map(sample => classifyWindow(sample, nowMs, reason));
  const reached = reason === null ? reading.codex?.rate_limit_reached_type ?? null : null;
  const weekly = reading.windows.some(sample => sample.window_minutes === WEEKLY_WINDOW_MINUTES);
  // A missing weekly reading is one more `unknown` candidate: exhausted or tight on another window still wins.
  const state: QuotaState = reason !== null ? 'unknown'
    : reached !== null ? 'exhausted'
      : QUOTA_STATE_ORDER.find(candidate => (candidate === 'unknown' && !weekly) || windows.some(window => window.state === candidate)) ?? 'unknown';
  const accountReason = reason ?? (reached !== null ? `rate_limit_reached_type ${reached}` : !weekly ? `no window of ${WEEKLY_WINDOW_MINUTES} min` : null);
  return {
    account: reading.account, source: reading.source, observed_at: reading.observed_at, state,
    reason: accountReason, windows,
    ...(reading.codex ? { codex: reading.codex } : {}),
  };
}

export function buildQuotaReport(readings: readonly QuotaReading[], nowMs: number): QuotaReport {
  return { protocol: QUOTA_PROTOCOL, read_at: new Date(nowMs).toISOString(), accounts: readings.map(reading => classifyQuotaReading(reading, nowMs)) };
}

function formatWindow(window: QuotaWindowReport, nowMs: number): string {
  if (window.state === 'absent') return `${window.window} absent`;
  if (window.state === 'unknown') return `${window.window} unknown (${window.reason})`;
  const hours = round((Date.parse(window.resets_at!) - nowMs) / 3_600_000);
  return `${window.window} ${window.state} ${window.used_percent}% used, pace ${window.pace! > 0 ? '+' : ''}${window.pace}, resets ${window.resets_at} (${hours} h)`;
}

/** One line per account. */
export function formatQuotaReport(report: QuotaReport): string {
  const nowMs = Date.parse(report.read_at);
  return report.accounts.map(account => {
    const parts = [`${account.account}: ${account.state}`];
    if (account.reason !== null) parts.push(account.reason);
    if (account.windows.length) parts.push(account.windows.map(window => formatWindow(window, nowMs)).join('; '));
    const credits = account.codex?.credits;
    if (credits) parts.push(`credits ${credits.unlimited ? 'unlimited' : credits.balance ?? 'no balance'}`);
    if (account.observed_at !== null) parts.push(`read ${account.observed_at}`);
    return parts.join(' | ');
  }).join('\n');
}
