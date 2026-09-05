import { canonicalMessageDigest } from '../messages/mechanics';

export const CAMPAIGN_PLANNING_PROTOCOL = 1 as const;
export const PLANNING_OUTCOMES = ['plan_ready', 'not_reproducible', 'feature_route_required', 'human_attention_required', 'source_stale', 'planning_failed'] as const;
export type CampaignPlanningOutcome = typeof PLANNING_OUTCOMES[number];
export class CampaignPlanningError extends Error {
  constructor(readonly code: 'planning_failed' | 'source_stale' | 'feature_surface_detected' | 'protected_surface_detected' | 'human_attention_required', message: string) { super(message); this.name = 'CampaignPlanningError'; }
}
export interface PlannedSurfaces {
  readonly paths: readonly string[];
  readonly cli_commands: readonly string[];
  readonly mcp_tools: readonly string[];
  readonly public_exports: readonly string[];
  readonly protocol_kinds: readonly string[];
  readonly capability_nodes: readonly string[];
}
export interface PlanningArtifact { readonly path: string; readonly sha256: string; }
export interface CharacterizationEvidence {
  readonly current_behavior: string;
  readonly regression_guard: string;
  readonly old_tests_command: string;
  readonly falsifier_command: string;
  readonly old_tests_exit: 0;
  readonly falsifier_exit: number;
  readonly artifact: PlanningArtifact;
}
export interface CampaignPlanningResultInput {
  readonly job_sha256: string;
  readonly outcome: CampaignPlanningOutcome;
  readonly explanation: string;
  readonly surfaces: PlannedSurfaces | null;
  readonly characterization: CharacterizationEvidence | null;
}
export interface CampaignPlanningJob {
  readonly protocol: typeof CAMPAIGN_PLANNING_PROTOCOL;
  readonly kind: 'repo-harness-campaign-planning-job';
  readonly campaign_id: string;
  readonly group_number: number;
  readonly intent_sha256: string;
  readonly publication_sha: string;
  readonly protection_sha256: string;
  readonly task_id: string;
  readonly task_revision: string;
  readonly sprint_path: string;
  readonly source_ref: string;
  readonly source_revision: string;
  readonly observation_sha256: string;
  readonly host: 'claude' | 'codex';
  readonly session_id: string;
  readonly issue_kind: 'bugfix' | 'test_gap';
  readonly job_sha256: string;
}
export function planningPath(value: unknown): string {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\') || value.split('/').some(p => !p || p === '.' || p === '..' || p.toLowerCase() === '.git') || /[\x00-\x20*?\[\]{}!]/u.test(value)) {
    throw new CampaignPlanningError('planning_failed', 'planning requires concrete repository-relative file paths');
  }
  return value;
}
function object(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) throw new CampaignPlanningError('planning_failed', `${label} fields are invalid`);
  return value as Record<string, unknown>;
}
function concrete(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || /^(?:todo|tbd|unknown|none|n\/a)$/iu.test(value.trim())) throw new CampaignPlanningError('planning_failed', `${label} is required`);
  return value;
}
export function validatePlanningResult(value: unknown): CampaignPlanningResultInput {
  const r = object(value, ['job_sha256', 'outcome', 'explanation', 'surfaces', 'characterization'], 'planning result');
  if (typeof r.job_sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(r.job_sha256) || !PLANNING_OUTCOMES.includes(r.outcome as CampaignPlanningOutcome)) throw new CampaignPlanningError('planning_failed', 'planning result identity or outcome is invalid');
  concrete(r.explanation, 'explanation');
  if (r.surfaces !== null) {
    const s = object(r.surfaces, ['paths', 'cli_commands', 'mcp_tools', 'public_exports', 'protocol_kinds', 'capability_nodes'], 'planned surfaces');
    for (const [key, entries] of Object.entries(s)) {
      if (!Array.isArray(entries) || entries.some(v => typeof v !== 'string' || !v.trim()) || new Set(entries).size !== entries.length) throw new CampaignPlanningError('planning_failed', `${key} must be an explicit unique list`);
    }
    if (!(s.paths as string[]).length) throw new CampaignPlanningError('planning_failed', 'planned paths are required');
    (s.paths as string[]).forEach(planningPath);
  }
  if (r.characterization !== null) {
    const c = object(r.characterization, ['current_behavior', 'regression_guard', 'old_tests_command', 'falsifier_command', 'old_tests_exit', 'falsifier_exit', 'artifact'], 'characterization');
    for (const key of ['current_behavior', 'old_tests_command', 'falsifier_command']) concrete(c[key], key);
    planningPath(c.regression_guard);
    if (c.old_tests_exit !== 0 || !Number.isSafeInteger(c.falsifier_exit) || (c.falsifier_exit as number) <= 0) throw new CampaignPlanningError('planning_failed', 'characterization must demonstrate old tests pass and falsifier fails');
    const a = object(c.artifact, ['path', 'sha256'], 'characterization artifact'); planningPath(a.path);
    if (typeof a.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(a.sha256)) throw new CampaignPlanningError('planning_failed', 'characterization artifact digest is invalid');
  }
  if (r.outcome === 'plan_ready' && r.surfaces === null) throw new CampaignPlanningError('planning_failed', 'plan_ready requires explicit planned surfaces');
  return r as unknown as CampaignPlanningResultInput;
}
export function rejectPlannedFeatures(s: PlannedSurfaces): void {
  for (const key of ['cli_commands', 'mcp_tools', 'public_exports', 'protocol_kinds', 'capability_nodes'] as const) {
    if (s[key].length) throw new CampaignPlanningError('feature_surface_detected', `repair planning adds ${key}: ${s[key].join(', ')}`);
  }
}
export function buildPlanningJob(input: Omit<CampaignPlanningJob, 'protocol' | 'kind' | 'job_sha256'>): CampaignPlanningJob {
  const basis = { protocol: CAMPAIGN_PLANNING_PROTOCOL, kind: 'repo-harness-campaign-planning-job' as const, ...input };
  return Object.freeze({ ...basis, job_sha256: canonicalMessageDigest(basis) });
}
