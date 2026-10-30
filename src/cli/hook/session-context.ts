/**
 * SessionStart context. The handler resolves Effective State once. The state
 * section, or `[HarnessStateUnavailable]`, comes first and always. Every other
 * provider is an independent nullable section with a stable id and the source
 * that holds its full content. The resume has one
 * pointer in `references`.
 * Providers read the resolved state; they do not parse the plan, the sprint
 * marker or the policy again. A provider that throws becomes one
 * `[SessionContextProviderFailed] <id>` line and does not remove the state
 * section or a sibling.
 */

import type { SessionContextSection } from './session-context-budget';
import type { EffectiveStateResolution } from '../../effects/loop/state-input-collector';
import type { EffectiveState } from '../../core/state/types';

const STATE_SOURCE = 'repo-harness state resolve --json';

export function projectEffectiveStateSessionSection(state: EffectiveState): SessionContextSection {
  const compact = {
    task_id: state.task_id,
    phase: state.phase,
    state_version: state.state_version,
    state_revision: state.state_revision,
    workflow_profile: state.workflow_profile,
    next_action: state.next_action,
    guidance: state.guidance,
    blockers: state.blockers,
    references: {
      handoff: state.handoff.path,
      resume: state.resume.path,
    },
  };
  return {
    id: 'effective-state',
    priority: 1,
    content: `[HarnessState] ${JSON.stringify(compact)}`,
    mandatory: true,
    source: STATE_SOURCE,
  };
}

/** Names the failure by code and hash only; the raw error can carry private paths. */
export function projectUnavailableStateSessionSection(
  failure: Pick<Extract<EffectiveStateResolution, { ok: false }>, 'reason_code' | 'error_hash'>,
): SessionContextSection {
  const content = `[HarnessStateUnavailable] ${JSON.stringify({
    fail_closed: true,
    reason_code: failure.reason_code,
    error_hash: failure.error_hash,
    guidance: 'Do not infer task, scope, or edit permission.',
    required_action: STATE_SOURCE,
  })}`;
  return {
    id: 'effective-state',
    priority: 1,
    content,
    mandatory: true,
    source: STATE_SOURCE,
  };
}

/**
 * PreToolUse.edit matches Edit|Write and Codex apply_patch only. No Bash route
 * exists, because #764 removed the per-call Bash cost (#851). Every host and
 * every state gets this line, because the limit does not depend on state.
 */
export const EDIT_GUARD_SCOPE_SECTION: SessionContextSection = Object.freeze({
  id: 'edit-guard-scope',
  priority: 1,
  content: '[EditGuardScope] The edit guard checks Edit, Write and apply_patch. Claude and Pi Bash have a literal-write tripwire only; other shell writes skip it. Use the edit tools to change repository files. Use Bash to run commands.',
  mandatory: true,
  source: 'docs/reference-configs/hook-operations.md',
});

export interface SessionContextProviderInput {
  readonly repoRoot: string;
  readonly state: EffectiveState;
  readonly nowMs: number;
}

export interface SessionContextBody {
  readonly content: string;
  readonly source: string;
  readonly systemMessage?: string;
}

export interface SessionContextProvider {
  readonly id: string;
  readonly priority: number;
  readonly render: (input: SessionContextProviderInput) => SessionContextBody | null;
}

/** All SessionStart sections, state first. The runtime budgets them once. */
export function buildSessionStartSections(
  repoRoot: string,
  resolution: EffectiveStateResolution,
  nowMs: number,
  providers: readonly SessionContextProvider[] = [],
): SessionContextSection[] {
  if (!resolution.ok) return [projectUnavailableStateSessionSection(resolution)];
  const sections = [projectEffectiveStateSessionSection(resolution.state)];
  for (const provider of providers) {
    let body: SessionContextBody | null;
    try {
      body = provider.render({ repoRoot, state: resolution.state, nowMs });
    } catch {
      // Mandatory so the budget never hides that a section is missing.
      sections.push({
        id: provider.id,
        priority: provider.priority,
        content: `[SessionContextProviderFailed] ${provider.id}`,
        mandatory: true,
        source: STATE_SOURCE,
      });
      continue;
    }
    if (body) sections.push({ id: provider.id, priority: provider.priority, mandatory: false, ...body });
  }
  return sections;
}
