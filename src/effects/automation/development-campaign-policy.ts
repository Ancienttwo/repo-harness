import { readFileSync } from 'fs';
import { join } from 'path';
import { execFileSync } from 'child_process';

import { parseExternalSourcesPolicy, type ExternalSourcesPolicyV1 } from '../external-sources/policy';

export type DevelopmentCampaignMode = 'off' | 'shadow' | 'active';

export interface DevelopmentCampaignOffPolicyV1 {
  readonly version: 1;
  readonly mode: 'off';
}

export interface DevelopmentCampaignEnabledPolicyV1 {
  readonly version: 1;
  readonly mode: 'shadow' | 'active';
  readonly limits: {
    readonly maximum_group_count: 1 | 2 | 3;
    readonly maximum_issues_per_group: number;
    readonly maximum_parallel_tasks: 1 | 2 | 3;
  };
}

export type DevelopmentCampaignPolicyV1 = DevelopmentCampaignOffPolicyV1 | DevelopmentCampaignEnabledPolicyV1;

export class DevelopmentCampaignPolicyError extends Error {
  constructor(readonly code: 'campaign_policy_invalid' | 'campaign_mode_disabled' | 'campaign_external_sources_disabled', message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'DevelopmentCampaignPolicyError';
  }
}

function fail(code: DevelopmentCampaignPolicyError['code'], message: string, cause?: unknown): never {
  throw new DevelopmentCampaignPolicyError(code, message, cause);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('campaign_policy_invalid', `${label} must be an object`);
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail('campaign_policy_invalid', `${label} fields are invalid`);
}

function bounded(value: unknown, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    fail('campaign_policy_invalid', `development_campaign.limits.${field} must be an integer from 1 to ${maximum}`);
  }
  return value as number;
}

export function parseDevelopmentCampaignPolicy(value: unknown): DevelopmentCampaignPolicyV1 {
  if (value === undefined) return Object.freeze({ version: 1, mode: 'off' });
  const policy = record(value, 'development_campaign');
  if (policy.version !== 1) fail('campaign_policy_invalid', 'development_campaign.version must be 1');
  if (policy.mode === 'off') {
    exact(policy, ['mode', 'version'], 'development_campaign');
    return Object.freeze({ version: 1, mode: 'off' });
  }
  if (policy.mode !== 'shadow' && policy.mode !== 'active') fail('campaign_policy_invalid', 'development_campaign.mode must be off, shadow, or active');
  exact(policy, ['limits', 'mode', 'version'], 'development_campaign');
  const limits = record(policy.limits, 'development_campaign.limits');
  exact(limits, ['maximum_group_count', 'maximum_issues_per_group', 'maximum_parallel_tasks'], 'development_campaign.limits');
  return Object.freeze({
    version: 1,
    mode: policy.mode,
    limits: Object.freeze({
      maximum_group_count: bounded(limits.maximum_group_count, 'maximum_group_count', 3) as 1 | 2 | 3,
      maximum_issues_per_group: bounded(limits.maximum_issues_per_group, 'maximum_issues_per_group', 10),
      maximum_parallel_tasks: bounded(limits.maximum_parallel_tasks, 'maximum_parallel_tasks', 3) as 1 | 2 | 3,
    }),
  });
}

function policyDocumentAtRevision(repoRoot: string, revision: string): Record<string, unknown> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(revision)) fail('campaign_policy_invalid', 'campaign target revision is invalid');
  let raw: string;
  try {
    raw = execFileSync('git', ['show', `${revision}:.ai/harness/policy.json`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return fail('campaign_policy_invalid', `campaign policy is unavailable at authorized revision ${revision}`, error);
  }
  try {
    return record(JSON.parse(raw), '.ai/harness/policy.json');
  } catch (error) {
    if (error instanceof DevelopmentCampaignPolicyError) throw error;
    return fail('campaign_policy_invalid', `campaign policy is invalid at authorized revision ${revision}`, error);
  }
}

export function readDevelopmentCampaignPolicy(repoRoot: string): DevelopmentCampaignPolicyV1 {
  let document: Record<string, unknown>;
  try { document = record(JSON.parse(readFileSync(join(repoRoot, '.ai', 'harness', 'policy.json'), 'utf8')), '.ai/harness/policy.json'); }
  catch (error) {
    if (error instanceof DevelopmentCampaignPolicyError) throw error;
    return fail('campaign_policy_invalid', '.ai/harness/policy.json cannot be read', error);
  }
  return parseDevelopmentCampaignPolicy(document.development_campaign);
}

export function readDevelopmentCampaignPolicyAtRevision(repoRoot: string, revision: string): DevelopmentCampaignPolicyV1 {
  return parseDevelopmentCampaignPolicy(policyDocumentAtRevision(repoRoot, revision).development_campaign);
}

export function readCampaignExternalSourcesPolicyAtRevision(repoRoot: string, revision: string): ExternalSourcesPolicyV1 {
  return parseExternalSourcesPolicy(policyDocumentAtRevision(repoRoot, revision).external_sources);
}

export function requireDevelopmentCampaignStartPolicy(repoRoot: string, revision: string): DevelopmentCampaignEnabledPolicyV1 {
  const policy = readDevelopmentCampaignPolicyAtRevision(repoRoot, revision);
  if (policy.mode === 'off') fail('campaign_mode_disabled', 'development_campaign.mode is off at the authorized target revision');
  if (readCampaignExternalSourcesPolicyAtRevision(repoRoot, revision).mode === 'off') {
    fail('campaign_external_sources_disabled', 'external_sources.mode must be enabled before a development campaign can start');
  }
  return policy;
}
