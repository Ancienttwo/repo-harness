import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedReviewAdmissionFixture } from './review-admission-fixture';
import { tmpWorkspace, initGitRepo, commitAll } from './repo-fixture';
import { observeTaskSessionAdmission, taskSessionDirectory, ensureSessionDirectory, writeSessionArtifact, type HerdrTaskBinding } from '../../src/effects/terminal/task-session';
import { taskRepository } from '../../src/effects/terminal/task-worktree';
import { buildTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';

/** Synthetic attached transport; no process or provider service is started. */
export function admittedInboxFixture(task = '1'.repeat(64)) {
  const directory = tmpWorkspace('admitted-inbox'), root = join(directory, 'repo'), home = join(directory, 'authority');
  mkdirSync(root); mkdirSync(home, { mode: 0o700 }); initGitRepo(root);
  writeFileSync(join(root, '.gitignore'), '.ai/\n'); writeFileSync(join(root, 'source.txt'), 'source\n'); commitAll(root, 'fixture');
  const approved = seedReviewAdmissionFixture(root, home);
  const claim = { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: `sha256:${'c'.repeat(64)}` };
  const spec = { task, role: 'deep-reasoner', harness_kind: 'codex' };
  const source = { authority: { source: approved.source, claim }, session: { task, role: spec.role } };
  const admission = observeTaskSessionAdmission(root, spec, 'herdr', source.authority);
  const binding: HerdrTaskBinding = { protocol: 2, ...spec, runtime: 'herdr',
    repository_id: taskRepository(root).repository_id, execution_root: root,
    ownership: { disposition: 'attached' }, provider: { pid: 123, identity: 'fixture-process', ownership: { disposition: 'attached' } },
    max_requests: 3, endpoint: { session: 'fixture' }, pane_id: 'pane', terminal_id: 'terminal', workspace_id: 'workspace',
    shell: { pid: 122, identity: 'fixture-shell' }, agent_name: 'fixture-agent', task_admission: admission };
  const dir = taskSessionDirectory(root, task, spec.role);
  ensureSessionDirectory(root, dir); writeSessionArtifact(join(dir, 'binding.json'), binding);
  const event = buildTaskMessageEvent({ message_id: '123e4567-e89b-42d3-a456-426614174000', task_id: task,
    task_identity: { repository_id: admission.identity.repository_id, issue_id: admission.identity.issue_id, campaign_id: admission.identity.campaign_id },
    admission_sha256: admission.approval.admission_sha256, scope: 'claim', target_claim: claim,
    sender_kind: 'user', sender_id: 'fixture-user', sender_trust: 'local_operator', audience: 'owner', body: 'Please inspect the failing check.',
    created_at: '2026-10-25T00:00:00Z', in_reply_to: null });
  const input = { repo_root: root, task_id: task, source, recipient: { kind: 'claim' as const, claim }, execution_worktree: root };
  return { directory, root, home, task, source, admission, approved, binding, dir, event, input };
}
