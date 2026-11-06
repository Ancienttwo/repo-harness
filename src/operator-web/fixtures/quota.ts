import {
  buildQuotaReport,
  decodeClaudeQuotaCapture,
  decodeCodexRateLimitsResult,
  decodeQuotaReport,
  unknownQuotaReading,
  type QuotaReport,
} from '../../core/board/quota';

const iso = (ms: number) => new Date(ms).toISOString();
const seconds = (ms: number) => Math.round(ms / 1000);
const HOUR = 3_600_000;

/**
 * The report goes through the producer's own source decoders and classifier,
 * then the wire decoder, as `GET /api/v1/quota` serves it.
 * busy: Claude tight on the weekly window, ChatGPT normal with a credits balance.
 */
export function busyQuota(now: number): QuotaReport {
  const claude = decodeClaudeQuotaCapture({
    observed_at: iso(now - 4 * 60_000),
    rate_limits: {
      five_hour: { used_percentage: 41, resets_at: seconds(now + 2 * HOUR) },
      seven_day: { used_percentage: 88, resets_at: seconds(now + 30 * HOUR) },
    },
  });
  const chatgpt = decodeCodexRateLimitsResult({
    rateLimits: {
      primary: { windowDurationMins: 300, usedPercent: 8, resetsAt: seconds(now + 3 * HOUR) },
      secondary: { windowDurationMins: 10_080, usedPercent: 34, resetsAt: seconds(now + 96 * HOUR) },
      planType: 'plus',
      credits: { hasCredits: true, unlimited: false, balance: '12.50' },
      rateLimitReachedType: null,
    },
  }, iso(now - 60_000));
  return decodeQuotaReport(buildQuotaReport([claude, chatgpt], now));
}

/** degraded: no Claude capture yet, ChatGPT at its limit with no credits and no five-hour window. */
export function degradedQuota(now: number): QuotaReport {
  const chatgpt = decodeCodexRateLimitsResult({
    rateLimits: {
      primary: null,
      secondary: { windowDurationMins: 10_080, usedPercent: 97, resetsAt: seconds(now + 20 * HOUR) },
      planType: 'plus',
      credits: { hasCredits: false, unlimited: false, balance: null },
      rateLimitReachedType: null,
    },
  }, iso(now - 60_000));
  return decodeQuotaReport(buildQuotaReport([unknownQuotaReading('claude', 'no capture'), chatgpt], now));
}
