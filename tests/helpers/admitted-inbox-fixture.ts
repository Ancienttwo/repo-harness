import { spyOn } from 'bun:test';
import * as herdr from '../../src/effects/terminal/herdr';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedReviewAdmissionFixture } from './review-admission-fixture';
import { tmpWorkspace, initGitRepo, commitAll } from './repo-fixture';
import { startTaskAgent, taskSessionDirectory, type TaskClaimReference } from '../../src/effects/terminal/task-session';
import { taskRepository } from '../../src/effects/terminal/task-worktree';
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
    const repository = taskRepository(root);
    const workspace = { workspace_id: 'fixture-workspace', worktree: {
      repo_key: repository.repository_id, checkout_path: repository.execution_root, repo_root: repository.primary_root,
    } };
    let agentName = '';
    const pane = { pane_id: `fixture-${role}`, terminal_id: `terminal-${role}`, workspace_id: workspace.workspace_id };
    const transport = spyOn(herdr, 'herdrCommand').mockImplementation((_endpoint, args) => {
      const [kind, action] = args;
      let result: object;
      if (kind === 'workspace' && action === 'list') result = { workspaces: [workspace] };
      else if (kind === 'workspace' && action === 'get') result = { workspace };
      else if (kind === 'pane' && action === 'list') result = { panes: [pane] };
      else if (kind === 'pane' && (action === 'get' || action === 'split')) result = { pane };
      else if (kind === 'pane' && action === 'process-info') result = { process_info: {
        shell_pid: process.ppid, foreground_process_group_id: process.pid, foreground_processes: [{ pid: process.pid }],
      } };
      else if (kind === 'agent' && action === 'get') result = { agent: { ...pane, name: agentName, agent: 'codex' } };
      else throw new Error(`unexpected offline Herdr call: ${args.join(' ')}`);
      return { pid: process.pid, status: 0, signal: null, stdout: Buffer.from(JSON.stringify({ id: 'fixture', result })), stderr: Buffer.alloc(0), output: [] };
    });
    try {
      const authority = { source: source.authority.source, claim };
      const binding = await startTaskAgent(root, { ...spec, role, endpoint: { session: 'fixture', home: '/tmp' },
        parent_pane: pane.pane_id, args: [], max_requests: 3 }, {
        taskAuthority: authority, start: async (_endpoint, name) => { agentName = name; },
      });
      source.authority = authority;
      source.session = { task, role };
      return binding;
    } finally { transport.mockRestore(); }
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
