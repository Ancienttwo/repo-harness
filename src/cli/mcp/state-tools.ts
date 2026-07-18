import type { EffectiveStateV1 } from '../../core/state/types';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveEffectiveState } from '../../effects/state/resolve-effective-state';
import { currentGitBranch, isRepoHarnessAdopted } from './repo';
import { redactMcpText } from './redaction';
import type { McpProfileName } from './types';

export const STATE_SUMMARY_TOOL_NAME = 'summarize_repo_harness_state';

export interface StateToolDefinition {
  readonly name: typeof STATE_SUMMARY_TOOL_NAME;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, unknown>;
}

export interface CompactEffectiveState {
  readonly protocol: EffectiveStateV1['protocol'];
  readonly kind: EffectiveStateV1['kind'];
  readonly task_id: EffectiveStateV1['task_id'];
  readonly phase: EffectiveStateV1['phase'];
  readonly state_version: EffectiveStateV1['state_version'];
  readonly state_revision: EffectiveStateV1['state_revision'];
  readonly workflow_profile: EffectiveStateV1['workflow_profile'];
  readonly requested_workflow_profile: EffectiveStateV1['requested_workflow_profile'];
  readonly risk_floor: EffectiveStateV1['risk_floor'];
  readonly profile_reasons: EffectiveStateV1['profile_reasons'];
  readonly authoritative_plan: EffectiveStateV1['authoritative_plan'];
  readonly contract: EffectiveStateV1['contract'];
  readonly blockers: EffectiveStateV1['blockers'];
  readonly stale_sources: EffectiveStateV1['stale_sources'];
  readonly conflicting_sources: EffectiveStateV1['conflicting_sources'];
  readonly next_action: EffectiveStateV1['next_action'];
  /**
   * LSC-08: additive parity fields, copied verbatim from the resolved
   * state. MCP never recomputes readiness or Skill guidance -- it projects
   * the same authority CLI and the Stop hook already consume (see the
   * four-adapter parity assertions in `tests/state/adapter-parity.test.ts`).
   */
  readonly readiness: EffectiveStateV1['readiness'];
  readonly guidance: EffectiveStateV1['guidance'];
}

export interface StateSummaryResult extends CompactEffectiveState {
  readonly status: {
    readonly adopted: boolean;
    readonly branch: string | null;
    /** Existing field retained with its authority made explicit. */
    readonly profile: McpProfileName;
    readonly profile_authority: 'mcp-policy';
    readonly mcp_policy_profile: McpProfileName;
  };
  /** Existing 0.10.x display projection; never consumed as state authority. */
  readonly current: string | null;
  readonly current_authority: 'non-authoritative-projection';
  /** Additive label that makes the legacy display projection's status explicit. */
  readonly current_preview: {
    readonly source: 'tasks/current.md';
    readonly authority: 'non-authoritative-projection';
    readonly text: string;
  } | null;
}

export type StateToolResolver = (
  repoRoot: string,
  nowMs: number,
  risk: { readonly targetPaths: readonly string[]; readonly operationKind: 'inspect' },
) => EffectiveStateV1;

export interface StateToolContext {
  readonly repoRoot: string;
  readonly mcpPolicyProfile: McpProfileName;
  readonly nowMs?: number;
}

export interface StateToolDependencies {
  readonly resolve?: StateToolResolver;
  readonly isAdopted?: (repoRoot: string) => boolean;
  readonly branch?: (repoRoot: string) => string | null;
}

function readCurrentPreview(repoRoot: string): string | null {
  const path = join(repoRoot, 'tasks/current.md');
  if (!existsSync(path)) return null;
  const preview = readFileSync(path, 'utf-8').split(/\r?\n/).slice(0, 50).join('\n');
  return preview ? redactMcpText(preview).text : null;
}

export function buildStateToolDefinitions(): StateToolDefinition[] {
  return [{
    name: STATE_SUMMARY_TOOL_NAME,
    description: 'Return a compact projection of the canonical Effective State.',
    inputSchema: {
      type: 'object',
      properties: { repo_path: { type: 'string' } },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }];
}

export function isStateTool(name: string): name is typeof STATE_SUMMARY_TOOL_NAME {
  return name === STATE_SUMMARY_TOOL_NAME;
}

export function projectCompactEffectiveState(state: EffectiveStateV1): CompactEffectiveState {
  return {
    protocol: state.protocol,
    kind: state.kind,
    task_id: state.task_id,
    phase: state.phase,
    state_version: state.state_version,
    state_revision: state.state_revision,
    workflow_profile: state.workflow_profile,
    requested_workflow_profile: state.requested_workflow_profile,
    risk_floor: state.risk_floor,
    profile_reasons: state.profile_reasons,
    authoritative_plan: state.authoritative_plan,
    contract: state.contract,
    blockers: state.blockers,
    stale_sources: state.stale_sources,
    conflicting_sources: state.conflicting_sources,
    next_action: state.next_action,
    readiness: state.readiness,
    guidance: state.guidance,
  };
}

export function callStateTool(
  ctx: StateToolContext,
  name: typeof STATE_SUMMARY_TOOL_NAME,
  deps: StateToolDependencies = {},
): StateSummaryResult {
  if (!isStateTool(name)) throw new Error(`unknown state tool: ${name}`);
  const resolve = deps.resolve ?? resolveEffectiveState;
  const effective = resolve(ctx.repoRoot, ctx.nowMs ?? Date.now(), {
    targetPaths: [],
    operationKind: 'inspect',
  });
  const current = readCurrentPreview(ctx.repoRoot);
  return {
    ...projectCompactEffectiveState(effective),
    status: {
      adopted: (deps.isAdopted ?? isRepoHarnessAdopted)(ctx.repoRoot),
      branch: (deps.branch ?? currentGitBranch)(ctx.repoRoot),
      profile: ctx.mcpPolicyProfile,
      profile_authority: 'mcp-policy',
      mcp_policy_profile: ctx.mcpPolicyProfile,
    },
    current,
    current_authority: 'non-authoritative-projection',
    current_preview: current === null ? null : {
      source: 'tasks/current.md',
      authority: 'non-authoritative-projection',
      text: current,
    },
  };
}
