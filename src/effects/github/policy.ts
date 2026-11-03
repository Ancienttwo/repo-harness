import { readFileSync } from 'fs';
import { join } from 'path';

export interface ExternalSourceFetchLimitsV1 {
  readonly max_pages: number;
  readonly max_issues: number;
  readonly max_body_bytes: number;
  readonly max_total_bytes: number;
  readonly deadline_ms: number;
}

class ExternalSourceProtocolError extends Error {
  constructor(readonly code: 'external_source_invalid', message: string) {
    super(message);
    this.name = 'ExternalSourceProtocolError';
  }
}

function failLimits(message: string): never {
  throw new ExternalSourceProtocolError('external_source_invalid', message);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) failLimits(`${label} must be a positive integer`);
  return value as number;
}

export function validateExternalSourceFetchLimits(value: unknown): ExternalSourceFetchLimitsV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failLimits('limits must be an object');
  const limits = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(limits).sort()) !== JSON.stringify(['deadline_ms', 'max_body_bytes', 'max_issues', 'max_pages', 'max_total_bytes'])) failLimits('limits fields are invalid');
  return Object.freeze({
    max_pages: positiveInteger(limits.max_pages, 'limits.max_pages'),
    max_issues: positiveInteger(limits.max_issues, 'limits.max_issues'),
    max_body_bytes: positiveInteger(limits.max_body_bytes, 'limits.max_body_bytes'),
    max_total_bytes: positiveInteger(limits.max_total_bytes, 'limits.max_total_bytes'),
    deadline_ms: positiveInteger(limits.deadline_ms, 'limits.deadline_ms'),
  });
}

export interface ExternalSourcesOffPolicyV1 {
  readonly version: 1;
  readonly mode: 'off';
}

export interface ExternalSourcesManualGithubPolicyV1 {
  readonly version: 1;
  readonly mode: 'manual';
  readonly github: {
    readonly enabled: true;
    readonly repository: string;
    readonly selection:
      | { readonly kind: 'labels'; readonly labels_all: readonly string[]; readonly assignees_any: readonly string[] }
      | { readonly kind: 'issue_numbers'; readonly issue_numbers: readonly number[] };
    readonly limits: ExternalSourceFetchLimitsV1;
  };
}

export type ExternalSourcesPolicyV1 = ExternalSourcesOffPolicyV1 | ExternalSourcesManualGithubPolicyV1;

export class ExternalSourcePolicyError extends Error {
  constructor(readonly code: 'external_source_policy_invalid' | 'external_source_policy_disabled', message: string) {
    super(message);
    this.name = 'ExternalSourcePolicyError';
  }
}

function fail(message: string): never {
  throw new ExternalSourcePolicyError('external_source_policy_invalid', message);
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(`${label} fields are invalid`);
}

function strings(value: unknown, label: string, required: boolean): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.trim() !== '')) fail(`${label} must be an array of non-empty strings`);
  const result = value.map((entry) => entry.trim());
  if (result.length === 0 && required) fail(`${label} must not be empty`);
  if (JSON.stringify(result) !== JSON.stringify([...result].sort()) || new Set(result).size !== result.length) fail(`${label} must be sorted and unique`);
  return Object.freeze(result);
}

function positiveIntegers(value: unknown, label: string): readonly number[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => Number.isSafeInteger(entry) && entry > 0)) {
    fail(`${label} must be a non-empty array of positive integers`);
  }
  const result = value as number[];
  if (JSON.stringify(result) !== JSON.stringify([...result].sort((left, right) => left - right)) || new Set(result).size !== result.length) {
    fail(`${label} must be sorted and unique`);
  }
  return Object.freeze([...result]);
}

function selection(value: unknown): ExternalSourcesManualGithubPolicyV1['github']['selection'] {
  const selected = object(value, 'external_sources.github.selection');
  if (selected.kind === 'labels') {
    exact(selected, ['assignees_any', 'kind', 'labels_all'], 'external_sources.github.selection');
    return Object.freeze({
      kind: 'labels' as const,
      labels_all: strings(selected.labels_all, 'external_sources.github.selection.labels_all', true),
      assignees_any: strings(selected.assignees_any, 'external_sources.github.selection.assignees_any', false),
    });
  }
  if (selected.kind === 'issue_numbers') {
    exact(selected, ['issue_numbers', 'kind'], 'external_sources.github.selection');
    return Object.freeze({
      kind: 'issue_numbers' as const,
      issue_numbers: positiveIntegers(selected.issue_numbers, 'external_sources.github.selection.issue_numbers'),
    });
  }
  fail('external_sources.github.selection.kind must be labels or issue_numbers');
}

function repository(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) fail('external_sources.github.repository must be an owner/repository reference');
  return value;
}

export function parseExternalSourcesPolicy(value: unknown): ExternalSourcesPolicyV1 {
  if (value === undefined) return Object.freeze({ version: 1, mode: 'off' });
  const policy = object(value, 'external_sources');
  if (policy.version !== 1) fail('external_sources.version must be 1');
  if (policy.mode === 'off') {
    exact(policy, ['mode', 'version'], 'external_sources');
    return Object.freeze({ version: 1, mode: 'off' });
  }
  if (policy.mode !== 'manual') fail('external_sources.mode must be off or manual');
  exact(policy, ['github', 'mode', 'version'], 'external_sources');
  const github = object(policy.github, 'external_sources.github');
  exact(github, ['enabled', 'limits', 'repository', 'selection'], 'external_sources.github');
  if (github.enabled !== true) fail('external_sources.github.enabled must be true when mode is manual');
  const limits = validateExternalSourceFetchLimits(github.limits);
  const selected = selection(github.selection);
  if (selected.kind === 'issue_numbers' && selected.issue_numbers.length > limits.max_issues) {
    fail('external_sources.github.selection.issue_numbers exceeds limits.max_issues');
  }
  return Object.freeze({
    version: 1 as const,
    mode: 'manual' as const,
    github: Object.freeze({
      enabled: true as const,
      repository: repository(github.repository),
      selection: selected,
      limits,
    }),
  });
}

export function readExternalSourcesPolicy(repoRoot: string): ExternalSourcesPolicyV1 {
  const path = join(repoRoot, '.ai', 'harness', 'policy.json');
  let topLevel: Record<string, unknown>;
  try {
    topLevel = object(JSON.parse(readFileSync(path, 'utf8')), '.ai/harness/policy.json');
  } catch (error) {
    if (error instanceof ExternalSourcePolicyError) throw error;
    throw new ExternalSourcePolicyError('external_source_policy_invalid', `.ai/harness/policy.json cannot be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseExternalSourcesPolicy(topLevel.external_sources);
}

export function requireManualGithubPolicy(policy: ExternalSourcesPolicyV1): ExternalSourcesManualGithubPolicyV1 {
  if (policy.mode !== 'manual') throw new ExternalSourcePolicyError('external_source_policy_disabled', 'external_sources is off; manual GitHub refresh is not enabled');
  return policy;
}
