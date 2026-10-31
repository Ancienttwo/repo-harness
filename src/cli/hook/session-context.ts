/**
 * SessionStart context. The handler resolves Effective State once. The state
 * section, or `[HarnessStateUnavailable]`, is the only section this module
 * owns. It names no local handoff or resume file.
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

/** The state, or its fail-closed unavailability notice. The runtime budgets it once. */
export function buildSessionStartSections(resolution: EffectiveStateResolution): SessionContextSection[] {
  if (!resolution.ok) return [projectUnavailableStateSessionSection(resolution)];
  return [projectEffectiveStateSessionSection(resolution.state)];
}
