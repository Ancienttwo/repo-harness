import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedReviewAdmissionFixture } from './review-admission-fixture';
import { tmpWorkspace, initGitRepo, commitAll } from './repo-fixture';
import { taskSessionDirectory } from '../../src/effects/terminal/task-session';
import type { TaskClaimReference } from '../../src/core/review/runner-port';
import { startOfflineTaskAgent } from './engineer-runtime-fixture';
import { buildTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';

/** Offline transport injection exercises public admission and binding persistence.
 * The test process and its parent supply real process identity reads, not proof
 * of a live provider. No service, pane, or external agent is started. */
export async function admittedInboxFixture(task = '1'.repeat(64), options: Parameters<typeof seedReviewAdmissionFixture>[2] = {}) {
  const directory = tmpWorkspace('admitted-inbox'), root = join(directory, 'repo'), home = join(directory, 'authority');
  mkdirSync(root); mkdirSync(home, { mode: 0o700 }); initGitRepo(root);
  writeFileSync(join(root, '.gitignore'), '.ai/\n'); writeFileSync(join(root, 'source.txt'), 'source\n'); commitAll(root, 'fixture');
  const approved = seedReviewAdmissionFixture(root, home, options);
  const claim = { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-1', revision: `sha256:${'c'.repeat(64)}` };
  const spec = { task, role: 'deep-reasoner', harness_kind: 'codex' };
  const source = { authority: { source: approved.source, claim }, session: { task, role: spec.role } };
  async function bind(claim: TaskClaimReference, role = spec.role) {
    const authority = { source: source.authority.source, claim };
    const binding = await startOfflineTaskAgent(root, { ...spec, role,
      endpoint: { session: 'fixture', home: '/tmp' },
      parent_pane: `fixture-parent-${role}`, args: [], max_requests: 3 }, authority);
    source.authority = authority;
    source.session = { task, role };
    return binding;
  }
  const binding = await bind(claim);
  const admission = binding.task_admission!;
  const dir = taskSessionDirectory(root, task, spec.role);
  const event = buildTaskMessageEvent({ message_id: '123e4567-e89b-42d3-a456-426614174000', task_id: task,
    task_identity: { repository_id: admission.identity.repository_id, issue_id: admission.identity.issue_id, campaign_id: admission.identity.campaign_id },
    admission_sha256: admission.approval.admission_sha256, scope: 'claim', target_claim: claim,
    sender_kind: 'user', sender_id: 'fixture-user', sender_trust: 'local_operator', audience: 'owner', body: 'Please inspect the failing check.',
    created_at: '2026-10-25T00:00:00Z', in_reply_to: null });
  const input = { repo_root: root, task_id: task, source, recipient: { kind: 'claim' as const, claim }, execution_worktree: root };
  return { directory, root, home, task, source, admission, approved, binding, dir, event, input, bind };
}
