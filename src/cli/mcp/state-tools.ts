import { decodeEffectiveState, type EffectiveStateV2 } from '../../core/state/types';
import { resolveEffectiveStateReadOnly } from '../../effects/state/resolve-effective-state';
import { currentGitBranch, isRepoHarnessAdopted } from './repo';
import type { McpProfileName } from './types';

export const STATE_SUMMARY_TOOL_NAME = 'summarize_repo_harness_state';

export interface StateToolDefinition {
  readonly name: typeof STATE_SUMMARY_TOOL_NAME;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, unknown>;
}

export interface CompactEffectiveState {
  readonly protocol: EffectiveStateV2['protocol'];
  readonly kind: EffectiveStateV2['kind'];
  readonly task_id: EffectiveStateV2['task_id'];
  readonly phase: EffectiveStateV2['phase'];
  readonly state_version: EffectiveStateV2['state_version'];
  readonly state_revision: EffectiveStateV2['state_revision'];
  readonly workflow_profile: EffectiveStateV2['workflow_profile'];
  readonly requested_workflow_profile: EffectiveStateV2['requested_workflow_profile'];
  readonly risk_floor: EffectiveStateV2['risk_floor'];
  readonly profile_reasons: EffectiveStateV2['profile_reasons'];
  readonly blockers: EffectiveStateV2['blockers'];
  readonly stale_sources: EffectiveStateV2['stale_sources'];
  readonly conflicting_sources: EffectiveStateV2['conflicting_sources'];
  readonly next_action: EffectiveStateV2['next_action'];
  readonly guidance: EffectiveStateV2['guidance'];
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
}

export type StateToolResolver = (
  repoRoot: string,
  nowMs: number,
  risk: { readonly targetPaths: readonly string[]; readonly operationKind: 'inspect' },
) => EffectiveStateV2;

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

export function buildStateToolDefinitions(): StateToolDefinition[] {
  return [{
    name: STATE_SUMMARY_TOOL_NAME,
    description: 'Return a compact projection of the canonical Effective State. It writes nothing; state_version is the last published version, so compare state_revision to detect a change.',
    inputSchema: {
      type: 'object',
      properties: { repo_path: { type: 'string' } },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }];
}

export function isStateTool(name: string): name is typeof STATE_SUMMARY_TOOL_NAME {
  return name === STATE_SUMMARY_TOOL_NAME;
}

export function projectCompactEffectiveState(state: EffectiveStateV2): CompactEffectiveState {
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
    blockers: state.blockers,
    stale_sources: state.stale_sources,
    conflicting_sources: state.conflicting_sources,
    next_action: state.next_action,
    guidance: state.guidance,
  };
}

export function callStateTool(
  ctx: StateToolContext,
  name: typeof STATE_SUMMARY_TOOL_NAME,
  deps: StateToolDependencies = {},
): StateSummaryResult {
  if (!isStateTool(name)) throw new Error(`unknown state tool: ${name}`);
  const resolve = deps.resolve ?? resolveEffectiveStateReadOnly;
  const effective = decodeEffectiveState(resolve(ctx.repoRoot, ctx.nowMs ?? Date.now(), {
    targetPaths: [],
    operationKind: 'inspect',
  }));
  return {
    ...projectCompactEffectiveState(effective),
    status: {
      adopted: (deps.isAdopted ?? isRepoHarnessAdopted)(ctx.repoRoot),
      branch: (deps.branch ?? currentGitBranch)(ctx.repoRoot),
      profile: ctx.mcpPolicyProfile,
      profile_authority: 'mcp-policy',
      mcp_policy_profile: ctx.mcpPolicyProfile,
    },
  };
}
