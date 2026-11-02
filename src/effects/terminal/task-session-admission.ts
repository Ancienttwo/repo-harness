/** Reads the live review admission of a persisted task session. It observes approval and never creates a claim or task state. */
import { existsSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import { validateTaskClaimReference } from '../../core/review/authority-context';
import type { TaskSessionAdmission } from '../../core/review/runner-port';
import type { TaskSessionAuthority } from '../admission/admission-source';
import { readActiveReviewAdmission } from '../admission/admission-store';
import { observeActiveReviewAdmission } from '../admission/issue-goal';
import { gitExecFileSync } from '../git/runner';
import { taskRepository } from '../git/task-repository';
import { readWorktreeTopology } from '../git/worktree-topology';
import { readTaskAgent, sameSessionData, type HerdrTaskAgentSpec, type TaskPaneBinding } from './task-session-record';

/** Observe the existing approval; do not create a second claim or task state. */
export function observeTaskSessionAdmission(repoRoot: string, spec: Pick<HerdrTaskAgentSpec, 'task' | 'role' | 'harness_kind'>,
  runtime: 'herdr' | 'terminal', authority: TaskSessionAuthority): TaskSessionAdmission {
  const claim = validateTaskClaimReference(authority.claim);
  const execution = taskRepository(repoRoot), owner = taskRepository(authority.source.repoRoot);
  if (execution.repository_id !== owner.repository_id) throw new Error('task_agent_admission_repository_mismatch');
  const topology = readWorktreeTopology(execution.execution_root).worktrees;
  for (const root of [owner.execution_root, execution.execution_root]) {
    if (!topology.some(entry => { try { return !entry.prunable && realpathSync(entry.path) === root; } catch { return false; } })) {
      throw new Error('task_agent_admission_repository_mismatch');
    }
  }
  const active = observeActiveReviewAdmission(authority.source), admitted = active.admission;
  let branch: string | null = null;
  try { branch = gitExecFileSync(['symbolic-ref', '--quiet', 'HEAD'], { cwd: execution.execution_root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (error) { if ((error as { status?: number }).status !== 1) throw error; }
  const head = gitExecFileSync(['rev-parse', 'HEAD'], { cwd: execution.execution_root, encoding: 'utf8' }).trim();
  return {
    identity: { repository_id: admitted.repository_id, issue_id: admitted.issue_id,
      campaign_id: admitted.campaign_id, campaign_sha256: admitted.campaign_sha256, execution_actor: admitted.actor_id,
      claim, source_root: owner.execution_root, execution_root: execution.execution_root, branch, task: spec.task, role: spec.role,
      harness_kind: spec.harness_kind, runtime },
    approval: { admission_sha256: admitted.admission_sha256, grant_sha256: active.grant_sha256, revision: active.revision,
      goal_revision: admitted.goal.revision, scope_sha256: sessionDigest(admitted.allowed_paths) },
    head_revision: head,
  };
}
function sessionDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(value)))).digest('hex')}`;
}
/** The request and native-session `session_binding_sha256` of a task binding. */
export function taskBindingSha256(binding: TaskPaneBinding): string { return sessionDigest(binding); }

export type CurrentTaskSessionRefusal = 'claim_mismatch' | 'recipient_unavailable' | 'canonical_source_stale';
export interface CurrentTaskSession { admission: TaskSessionAdmission; assertLocalCurrent: () => void }
/** Provider observation happens outside the caller's mutex. Inside it, only the
 * exact local approval and immutable session binding are reread. The caller's
 * `refuse` throws its own error for each refusal. */
export function observeCurrentTaskSession(input: { repo_root: string; source: { authority: TaskSessionAuthority; session: { task: string; role: string } } },
  refuse: (code: CurrentTaskSessionRefusal, message: string) => never): CurrentTaskSession {
  const { binding, dir } = readTaskAgent(input.repo_root, input.source.session.task, input.source.session.role);
  if (!binding.task_admission || existsSync(join(dir, 'closed.json'))) refuse('recipient_unavailable', 'admitted session is unavailable');
  const admission = observeTaskSessionAdmission(binding.execution_root, binding, binding.runtime, input.source.authority);
  if (!sameSessionData(binding.task_admission.identity, admission.identity)) refuse('claim_mismatch', 'session admission identity changed');
  const source = input.source.authority.source;
  const active = observeActiveReviewAdmission(source);
  if (active.grant_sha256 !== admission.approval.grant_sha256 || active.admission.admission_sha256 !== admission.approval.admission_sha256) refuse('canonical_source_stale', 'admission changed during inbox observation');
  const expectedGoal = active.admission.goal;
  const assertLocalCurrent = () => {
    const current = readActiveReviewAdmission({ ...source, expectedGoal });
    if (current.grant_sha256 !== admission.approval.grant_sha256 || current.admission.admission_sha256 !== admission.approval.admission_sha256) refuse('canonical_source_stale', 'admission changed during inbox operation');
    const latest = readTaskAgent(input.repo_root, input.source.session.task, input.source.session.role);
    if (!sameSessionData(latest.binding, binding) || existsSync(join(latest.dir, 'closed.json'))) refuse('recipient_unavailable', 'session changed during inbox operation');
  };
  assertLocalCurrent();
  return { admission, assertLocalCurrent };
}
