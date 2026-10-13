/**
 * SessionStart context. The handler resolves Effective State once. The state
 * section, or `[HarnessStateUnavailable]`, comes first and always. Every other
 * provider is an independent nullable section with a stable id and the source
 * that holds its full content. Providers read the resolved state; they do not
 * parse the plan, the sprint marker or the policy again. A provider that
 * throws becomes one `[SessionContextProviderFailed] <id>` line and does not
 * remove the state section or a sibling.
 */

import type { SessionContextSection } from './session-context-budget';
import { readText } from '../../effects/state/collect-state-inputs';
import type { EffectiveStateResolution } from '../../effects/loop/state-input-collector';
import { buildStateSnapshotFromEffectiveState } from '../../effects/state/resolve-effective-state';
import { readAttemptLedger } from '../../effects/state/attempt-ledger-store';
import { projectContinuationEnvelope } from '../../core/state/project-continuation-envelope';
import type { EffectiveState } from '../../core/state/types';
import { owedCapabilities, renderOwedCapabilities } from '../../effects/state/owed-capabilities';

const STATE_SOURCE = 'repo-harness state resolve --json';
const OWED_SOURCE = 'repo-harness state owed --json';
/** The resolver reads the pending capture record at this default path. */
const PENDING_PLAN_SOURCE = '.ai/harness/planning/pending.json';

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
    allowed_paths: state.allowed_paths,
    checks: state.checks,
    references: {
      plan: state.authoritative_plan?.path ?? null,
      contract: state.contract?.path ?? null,
      sprint: state.active_sprint.path,
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

export interface SessionContextProviderInput {
  readonly repoRoot: string;
  readonly state: EffectiveState;
  readonly nowMs: number;
}

export interface SessionContextBody {
  readonly content: string;
  readonly source: string;
}

export interface SessionContextProvider {
  readonly id: string;
  readonly priority: number;
  readonly render: (input: SessionContextProviderInput) => SessionContextBody | null;
}

/**
 * The short section for a branch that already owes architecture updates. It
 * reuses the ownership result of the session state resolution. Architecture
 * diagnostics never block, so a Git failure only drops it.
 */
export function owedCapabilitiesSessionBody(repoRoot: string, state: EffectiveState): SessionContextBody | null {
  if (!state.capability_ownership) return null;
  let content: string | null = null;
  try {
    content = renderOwedCapabilities(owedCapabilities(repoRoot, state.capability_ownership));
  } catch {
    return null;
  }
  return content ? { content, source: OWED_SOURCE } : null;
}

/** A fresh pending plan capture with no active plan. Freshness is the resolver's own rule. */
function pendingPlanCaptureBody({ repoRoot, state, nowMs }: SessionContextProviderInput): SessionContextBody | null {
  if (state.authoritative_plan) return null;
  if (buildStateSnapshotFromEffectiveState(state, repoRoot, nowMs).states.pending !== 'fresh') return null;
  return {
    content: [
      '# Pending Plan Capture',
      '',
      'A host/thread planning discussion is pending capture and no active repo plan is selected.',
      '',
      `- Record: \`${PENDING_PLAN_SOURCE}\` (kind, slug and draft path)`,
      '- Rule: continue discussion freely, but do not edit implementation files until the final plan body is captured into `plans/`.',
      "- Capture: `printf '%s\\n' '<decision-complete plan body>' | repo-harness run capture-plan --slug <slug> --title <title>`",
    ].join('\n'),
    source: PENDING_PLAN_SOURCE,
  };
}

/** The next sprint task, from the continuation projection over the resolved state. */
function activeSprintBody({ repoRoot, state }: SessionContextProviderInput): SessionContextBody | null {
  const sprintPath = state.active_sprint.path;
  if (!sprintPath || state.active_sprint.freshness !== 'fresh') return null;
  const envelope = projectContinuationEnvelope({
    state,
    sprintText: readText(repoRoot, sprintPath),
    attemptLedger: readAttemptLedger(repoRoot),
  });
  if (envelope.route !== 'advance_sprint' || !envelope.command) return null;
  return {
    content: [
      '# Active Sprint',
      '',
      `- Sprint: \`${sprintPath}\``,
      `- Next step: \`${envelope.command}\``,
      '- Rule: a Sprint is a long-task container. Use `$think` to expand the next sprint task into a detailed `plans/plan-*.md`, then run the existing plan -> contract -> worktree flow. `tasks/todos.md` stays the deferred-goal ledger.',
    ].join('\n'),
    source: sprintPath,
  };
}

/** The resume file itself decides whether a resume exists. */
function resumeBody({ repoRoot, state }: SessionContextProviderInput): SessionContextBody | null {
  const resumePath = state.resume.path;
  const text = readText(repoRoot, resumePath)?.trim();
  if (!resumePath || !text) return null;
  return {
    content: [
      `# Resume (\`${resumePath}\`, ${state.resume.freshness})`,
      '',
      'Recovery context only. Read the files and attachments that the current user message names first.',
      '',
      text,
    ].join('\n'),
    source: resumePath,
  };
}

export const SESSION_CONTEXT_PROVIDERS: readonly SessionContextProvider[] = Object.freeze([
  { id: 'architecture-owed', priority: 2, render: ({ repoRoot, state }) => owedCapabilitiesSessionBody(repoRoot, state) },
  { id: 'pending-plan-capture', priority: 3, render: pendingPlanCaptureBody },
  { id: 'active-sprint', priority: 4, render: activeSprintBody },
  { id: 'resume', priority: 5, render: resumeBody },
]);

/** All SessionStart sections, state first. The runtime budgets them once. */
export function buildSessionStartSections(
  repoRoot: string,
  resolution: EffectiveStateResolution,
  nowMs: number,
  providers: readonly SessionContextProvider[] = SESSION_CONTEXT_PROVIDERS,
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
