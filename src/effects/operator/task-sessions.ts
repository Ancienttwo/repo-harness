import { existsSync, lstatSync, opendirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalize } from '../../core/evidence/canonical-json';
import { decodeOperatorTaskSessions, isTaskSessionsRequest, TASK_SESSIONS_MAX_BYTES, TASK_SESSIONS_MAX_ENTRIES, type OperatorTaskSession, type OperatorTaskSessions, type OperatorTaskSessionsRequest } from '../../core/operator/task-sessions';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readSessionArtifact, taskSessionDirectory, type TaskPaneBinding } from '../terminal/task-session';
import { taskRepository } from '../terminal/task-worktree';
import { readCurrentReviewAdmissionSource } from '../review/admission-source';
import { observeOperatorTaskDiffSource, OperatorTaskDiffError } from './task-diff';
const fail = (code: 'unavailable' | 'too_large' | 'stale'): never => { throw new OperatorTaskDiffError(code); };

/** Derived discovery only. A displayed selector must be revalidated on use. */
export function readOperatorTaskSessions(input: OperatorTaskSessionsRequest & { readonly env?: NodeJS.ProcessEnv },
  effects: { readonly currentSource?: typeof readCurrentReviewAdmissionSource } = {}): OperatorTaskSessions {
  const { env, ...request } = input;
  if (!isTaskSessionsRequest(request)) return fail('unavailable');
  try {
    const observe = () => {
      const registry = readRepoHarnessRegistryStrictSnapshot({ env, adoptedOnly: false });
      const repo = registry.repos.find(repo => repo.id === request.repository_id);
      if (!repo) return fail('unavailable');
      const root = realpathSync(repo.path), primary = taskRepository(root).primary_root;
      let base = primary;
      for (const component of ['.ai', 'harness', 'runs', 'task-agents']) {
        base = join(base, component);
        if (!existsSync(base)) return { root, revision: registry.authorizationRevision, sessions: [] as OperatorTaskSession[] };
        const stat = lstatSync(base);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return fail('unavailable');
      }
      const names: string[] = [], directory = opendirSync(base);
      try {
        for (let entry = directory.readSync(); entry; entry = directory.readSync()) {
          if (names.length >= TASK_SESSIONS_MAX_ENTRIES) return fail('too_large');
          if (!entry.isDirectory() || !/^[0-9a-f]{64}$/u.test(entry.name)) return fail('unavailable');
          names.push(entry.name);
        }
      } finally { directory.closeSync(); }
      const sessions: OperatorTaskSession[] = [];
      let totalBytes = 0;
      for (const name of names.sort()) {
        const dir = join(base, name), path = join(dir, 'binding.json');
        if (existsSync(join(dir, 'closed.json')) || !existsSync(path)) continue;
        const stat = lstatSync(path);
        totalBytes += stat.size;
        if (stat.size > 1024 * 1024 || totalBytes > 8 * 1024 * 1024) return fail('too_large');
        const binding = readSessionArtifact<TaskPaneBinding>(path);
        if (!binding.task_admission) continue; // Generic runtime has no approved issue identity.
        if (taskSessionDirectory(root, binding.task, binding.role) !== dir) return fail('unavailable');
        const identity = binding.task_admission.identity;
        if (typeof identity.source_root !== 'string' || realpathSync(identity.source_root) !== identity.source_root) return fail('unavailable');
        if (taskRepository(identity.source_root).repository_id !== taskRepository(root).repository_id) return fail('unavailable');
        const source = (effects.currentSource ?? readCurrentReviewAdmissionSource)({ repoRoot: identity.source_root,
          repository_id: identity.repository_id, issue_id: identity.issue_id, campaign_id: identity.campaign_id });
        if (!source) continue; // A protected revocation is distinct from an unreadable/provider failure.
        const selector = { repository_id: request.repository_id, provider_repository_id: identity.repository_id,
          issue_id: identity.issue_id, campaign_id: identity.campaign_id, task: binding.task, role: binding.role,
          claim_ref: identity.claim.reference, claim_revision: identity.claim.revision,
          grant_sha256: source.expectedGrantSha256, policy_sha256: source.expectedPolicySha256, actor_id: source.expectedActor,
          session_binding_sha256: `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(binding)))).digest('hex')}` };
        const observed = observeOperatorTaskDiffSource({ ...selector, env }, { admissionSource: () => source });
        sessions.push({ selector, profile_selection: identity.engineer_profile ? { state: 'selected', ...identity.engineer_profile } : { state: 'unassigned' }, admission_sha256: observed.approval.admission_sha256, branch: observed.branch, runtime: binding.runtime, harness_kind: binding.harness_kind });
      }
      return { root, revision: registry.authorizationRevision, sessions };
    };
    const before = observe(), after = observe();
    if (JSON.stringify(before) !== JSON.stringify(after)) return fail('stale');
    const result = { protocol: 1, kind: 'operator_task_sessions', repository_id: request.repository_id,
      observed_at: new Date().toISOString(), sessions: after.sessions };
    if (Buffer.byteLength(JSON.stringify(result)) > TASK_SESSIONS_MAX_BYTES) return fail('too_large');
    return decodeOperatorTaskSessions(result, request);
  } catch (error) { if (error instanceof OperatorTaskDiffError) throw error; return fail('unavailable'); }
}
