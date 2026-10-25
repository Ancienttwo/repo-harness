import { spyOn } from 'bun:test';
import * as herdr from '../../src/effects/terminal/herdr';
import { seedReviewAdmissionFixture } from './review-admission-fixture';
import { loadEngineerProfile } from '../../src/effects/engineers/profile-store';
import { startTaskAgent, taskSessionDirectory, type TaskClaimReference } from '../../src/effects/terminal/task-session';
import { taskRepository } from '../../src/effects/terminal/task-worktree';
import { observeAgentRuntimeEndpoint } from '../../src/effects/engineers/agent-runtime-effect-store';
import { buildTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';
import { sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { readActiveReviewAdmission, revokeReviewAdmission } from '../../src/effects/review/admission-store';

export interface EngineerRuntimeFixtureOptions {
  authorityHome: string; task?: string; role?: string; claim?: TaskClaimReference;
  repositoryId?: string; issueId?: string;
}
/** Public binding lifecycle with injected offline transport; no live service is claimed. */
export async function bindTaskRuntimeFixture(root: string, options: EngineerRuntimeFixtureOptions, engineerId?: string) {
  const task = options.task ?? '1'.repeat(64), role = options.role ?? 'deep-reasoner';
  const spec = { task, role, harness_kind: 'codex' };
  const approved = seedReviewAdmissionFixture(root, options.authorityHome, { repositoryId: options.repositoryId, issueId: options.issueId });
  const selected = engineerId === undefined ? undefined : loadEngineerProfile(root, engineerId);
  const profile = selected === undefined ? undefined : { engineer_id: selected.profile.engineer_id, engineer_contract_revision: selected.engineer_contract_revision };
  const claim = options.claim ?? { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-runtime', revision: `sha256:${'c'.repeat(64)}` };
  async function bind(role = spec.role) {
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
      const authority = { source: approved.source, claim, engineer_profile: profile };
      const binding = await startTaskAgent(root, { ...spec, role, endpoint: { session: 'fixture', home: '/tmp' },
        parent_pane: pane.pane_id, args: [], max_requests: 3 }, {
        taskAuthority: authority, start: async (_endpoint, name) => { agentName = name; },
      });
      return binding;
    } finally { transport.mockRestore(); }
  }
  const binding = await bind();
  const source = { authority: { source: approved.source, claim, engineer_profile: profile }, session: { task, role } };
  const admission = binding.task_admission!;
  return { source, binding, admission, approved, dir: taskSessionDirectory(root, task, role),
    async rebind(nextRole: string) {
      const replacement = await bind(nextRole);
      return { binding: replacement, source: { ...source, session: { task, role: nextRole } } };
    },
    revoke() {
      const current = readActiveReviewAdmission({ ...approved.source, expectedGoal: approved.admission.goal });
      revokeReviewAdmission({ repoRoot: root, authorityHome: options.authorityHome,
        repository_id: approved.admission.repository_id, issue_id: approved.admission.issue_id,
        campaign_id: approved.admission.campaign_id, expectedRevision: current.revision });
    } };
}

export async function bindEngineerRuntimeSession(root: string, engineerId: string, options: EngineerRuntimeFixtureOptions) {
  const bound = await bindTaskRuntimeFixture(root, options, engineerId);
  return { ...bound, endpoint: observeAgentRuntimeEndpoint(root, bound.source) };
}

export async function seedEngineerTaskMessage(repoRoot: string, engineerId: string, messageId: string, body: string, options: EngineerRuntimeFixtureOptions) {
  const bound = await bindEngineerRuntimeSession(repoRoot, engineerId, options);
  const { admission, source } = bound;
  const event = buildTaskMessageEvent({ message_id: messageId, task_id: source.session.task,
    task_identity: { repository_id: admission.identity.repository_id, issue_id: admission.identity.issue_id, campaign_id: admission.identity.campaign_id },
    admission_sha256: admission.approval.admission_sha256, scope: 'claim', target_claim: admission.identity.claim,
    sender_kind: 'operator', sender_id: 'runtime-test', sender_trust: 'local_operator', audience: 'owner', body,
    created_at: '2026-08-30T10:01:00.000Z', in_reply_to: null });
  sendTaskMessage({ repo_root: repoRoot, source, event });
  return { ...bound, event, message_kind: 'task_message' as const, task_id: event.task_id,
    message_id: messageId, expected_admission_sha256: event.admission_sha256 };
}
