import { existsSync, readFileSync } from 'fs';
import { isAbsolute } from 'path';

export const MINIMAL_CHANGE_PROTECTED_CONCERNS = Object.freeze([
  'security',
  'validation',
  'data_loss',
  'error_handling',
  'accessibility',
  'explicit_requirement',
  'tests',
] as const);

export const MINIMAL_CHANGE_REPORT_PATH = '.ai/harness/checks/minimal-change.latest.json';

export type MinimalChangeMode = 'off' | 'advice';
export type MinimalChangeRawMode = MinimalChangeMode | 'enforce';
export type MinimalChangeDependencyPolicy = 'warn' | 'observe' | 'off';
export type MinimalChangeNewFilePolicy = 'warn' | 'observe' | 'off';
export type MinimalChangeAbstractionPolicy = 'warn' | 'observe' | 'off';

export interface MinimalChangePolicy {
  readonly version: 1;
  readonly mode: MinimalChangeMode;
  readonly requestedMode: MinimalChangeRawMode;
  readonly blocking: false;
  readonly session_context: boolean;
  readonly prompt_advice: boolean;
  readonly post_edit_observer: boolean;
  readonly stop_review: boolean;
  readonly max_findings: number;
  readonly max_context_words: number;
  readonly new_dependency: MinimalChangeDependencyPolicy;
  readonly new_file: MinimalChangeNewFilePolicy;
  readonly new_abstraction: MinimalChangeAbstractionPolicy;
  readonly protected_concerns: readonly string[];
  readonly report_path: string;
  readonly event_dedupe: boolean;
  readonly warnings: readonly string[];
}

const ACTIVE_MINIMAL_CHANGE_POLICY_DEFAULTS: MinimalChangePolicy = Object.freeze({
  version: 1,
  mode: 'advice',
  requestedMode: 'advice',
  blocking: false,
  session_context: true,
  prompt_advice: true,
  post_edit_observer: false,
  stop_review: true,
  max_findings: 5,
  max_context_words: 180,
  new_dependency: 'warn',
  new_file: 'observe',
  new_abstraction: 'warn',
  protected_concerns: MINIMAL_CHANGE_PROTECTED_CONCERNS,
  report_path: MINIMAL_CHANGE_REPORT_PATH,
  event_dedupe: true,
  warnings: Object.freeze([]),
});

export const DEFAULT_MINIMAL_CHANGE_POLICY: MinimalChangePolicy = Object.freeze({
  ...ACTIVE_MINIMAL_CHANGE_POLICY_DEFAULTS,
  mode: 'off',
  requestedMode: 'off',
  session_context: false,
  prompt_advice: false,
  post_edit_observer: false,
  stop_review: false,
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

function enumField<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

function normalizeMode(value: unknown): {
  mode: MinimalChangeMode;
  requestedMode: MinimalChangeRawMode;
  warning?: string;
} {
  if (value === 'off' || value === 'advice') {
    return { mode: value, requestedMode: value };
  }
  if (value === 'enforce') {
    return {
      mode: 'advice',
      requestedMode: 'enforce',
      warning: 'minimal_change.mode=enforce is not supported in v1; normalized to advice',
    };
  }
  if (typeof value === 'string') {
    return {
      mode: 'off',
      requestedMode: 'off',
      warning: `unknown minimal_change.mode=${value}; using off`,
    };
  }
  return {
    mode: 'off',
    requestedMode: 'off',
  };
}

function validHarnessRelativePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const normalized = value.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  if (isAbsolute(normalized)) return undefined;
  const parts = normalized.split('/');
  if (parts.includes('..')) return undefined;
  if (parts[0] !== '.ai' || parts[1] !== 'harness') return undefined;
  return normalized;
}

function protectedConcerns(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return DEFAULT_MINIMAL_CHANGE_POLICY.protected_concerns;
  const out = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
  return out.length > 0 ? Object.freeze([...out]) : DEFAULT_MINIMAL_CHANGE_POLICY.protected_concerns;
}

export function normalizeMinimalChangePolicy(value: unknown): MinimalChangePolicy {
  const warnings: string[] = [];
  const input = isRecord(value) ? value : {};
  const mode = normalizeMode(input.mode);
  if (mode.warning) warnings.push(mode.warning);
  const fallback =
    mode.mode === 'off' ? DEFAULT_MINIMAL_CHANGE_POLICY : ACTIVE_MINIMAL_CHANGE_POLICY_DEFAULTS;

  const reportPath = validHarnessRelativePath(input.report_path);
  if (input.report_path !== undefined && !reportPath) {
    warnings.push('minimal_change.report_path must stay under .ai/harness; using default report path');
  }

  return Object.freeze({
    version: 1,
    mode: mode.mode,
    requestedMode: mode.requestedMode,
    blocking: false,
    session_context: boolField(input.session_context, fallback.session_context),
    prompt_advice: boolField(input.prompt_advice, fallback.prompt_advice),
    post_edit_observer: boolField(input.post_edit_observer, fallback.post_edit_observer),
    stop_review: boolField(input.stop_review, fallback.stop_review),
    max_findings: boundedInteger(input.max_findings, fallback.max_findings, 1, 20),
    max_context_words: boundedInteger(
      input.max_context_words,
      fallback.max_context_words,
      60,
      240,
    ),
    new_dependency: enumField(
      input.new_dependency,
      ['warn', 'observe', 'off'] as const,
      fallback.new_dependency,
    ),
    new_file: enumField(
      input.new_file,
      ['warn', 'observe', 'off'] as const,
      fallback.new_file,
    ),
    new_abstraction: enumField(
      input.new_abstraction,
      ['warn', 'observe', 'off'] as const,
      fallback.new_abstraction,
    ),
    protected_concerns: protectedConcerns(input.protected_concerns),
    report_path: reportPath ?? DEFAULT_MINIMAL_CHANGE_POLICY.report_path,
    event_dedupe: boolField(input.event_dedupe, fallback.event_dedupe),
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
