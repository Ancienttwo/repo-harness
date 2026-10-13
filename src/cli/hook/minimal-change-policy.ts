import { existsSync, readFileSync } from 'fs';

export type MinimalChangeMode = 'off' | 'advice';

/** The policy for the minimal-change text in SessionStart and prompt advice. */
export interface MinimalChangePolicy {
  readonly version: 1;
  readonly mode: MinimalChangeMode;
  readonly session_context: boolean;
  readonly prompt_advice: boolean;
  readonly max_context_words: number;
  readonly warnings: readonly string[];
}

const ACTIVE_MINIMAL_CHANGE_POLICY_DEFAULTS: MinimalChangePolicy = Object.freeze({
  version: 1,
  mode: 'advice',
  session_context: true,
  prompt_advice: true,
  max_context_words: 180,
  warnings: Object.freeze([]),
});

export const DEFAULT_MINIMAL_CHANGE_POLICY: MinimalChangePolicy = Object.freeze({
  ...ACTIVE_MINIMAL_CHANGE_POLICY_DEFAULTS,
  mode: 'off',
  session_context: false,
  prompt_advice: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boolField(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeMode(value: unknown): { mode: MinimalChangeMode; warning?: string } {
  if (value === 'off' || value === 'advice') return { mode: value };
  if (typeof value === 'string') {
    return { mode: 'off', warning: `unknown minimal_change.mode=${value}; using off` };
  }
  return { mode: 'off' };
}

export function normalizeMinimalChangePolicy(value: unknown): MinimalChangePolicy {
  const warnings: string[] = [];
  const input = isRecord(value) ? value : {};
  const mode = normalizeMode(input.mode);
  if (mode.warning) warnings.push(mode.warning);
  const fallback =
    mode.mode === 'off' ? DEFAULT_MINIMAL_CHANGE_POLICY : ACTIVE_MINIMAL_CHANGE_POLICY_DEFAULTS;

  return Object.freeze({
    version: 1,
    mode: mode.mode,
    session_context: boolField(input.session_context, fallback.session_context),
    prompt_advice: boolField(input.prompt_advice, fallback.prompt_advice),
    max_context_words: boundedInteger(
      input.max_context_words,
      fallback.max_context_words,
      60,
      240,
    ),
    warnings: Object.freeze(warnings),
  });
}

export function loadMinimalChangePolicy(repoRoot: string): MinimalChangePolicy {
  const policyPath = `${repoRoot}/.ai/harness/policy.json`;
  if (!existsSync(policyPath)) return DEFAULT_MINIMAL_CHANGE_POLICY;
  try {
    const parsed = JSON.parse(readFileSync(policyPath, 'utf8')) as { minimal_change?: unknown };
    return normalizeMinimalChangePolicy(parsed.minimal_change);
  } catch {
    return normalizeMinimalChangePolicy(undefined);
  }
}
