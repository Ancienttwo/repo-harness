import { spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as herdr from '../../src/effects/terminal/herdr';
import { seedReviewAdmissionFixture } from './review-admission-fixture';
import { loadEngineerProfile } from '../../src/effects/profiles/profile-store';
import { startTaskAgent, readSessionArtifact, taskSessionDirectory, type TaskClaimReference, type TaskAgentSpec, type TaskSessionAuthority, type HerdrTaskBinding } from '../../src/effects/terminal/task-session';
import { taskRepository } from '../../src/effects/git/task-repository';
import { observeAgentRuntimeEndpoint } from '../../src/effects/engineers/agent-runtime-effect-store';
import { buildTaskMessageEvent } from '../../src/core/fleet/admitted-task-message';
import { sendTaskMessage } from '../../src/effects/fleet/task-inbox';
import { readActiveReviewAdmission, revokeActiveReviewAdmission } from '../../src/effects/admission/admission-store';

/** In-process Herdr transport double for one task agent. The test process is the
 * observed provider. The caller restores the returned spy. */
export function mockOfflineHerdr(root: string, spec: TaskAgentSpec) {
  const repository = taskRepository(root);
  const primary = { workspace_id: 'fixture-primary-workspace', worktree: {
    repo_key: repository.repository_id, checkout_path: repository.primary_root, repo_root: repository.primary_root,
  } };
  const workspace = repository.execution_root === repository.primary_root ? primary : {
    workspace_id: 'fixture-workspace', worktree: {
      repo_key: repository.repository_id, checkout_path: repository.execution_root, repo_root: repository.primary_root,
    },
  };
  const spaces = workspace === primary ? [primary] : [primary, workspace];
  const parent = { pane_id: spec.parent_pane, terminal_id: `parent-terminal-${spec.role}`,
    workspace_id: workspace.workspace_id, cwd: repository.execution_root };
  const pane = { pane_id: `fixture-${spec.role}`, terminal_id: `terminal-${spec.role}`,
    workspace_id: workspace.workspace_id, cwd: repository.execution_root };
  const bindingPath = join(taskSessionDirectory(root, spec.task, spec.role), 'binding.json');
  let agentName = existsSync(bindingPath) ? readSessionArtifact<HerdrTaskBinding>(bindingPath).agent_name : '';
  const transport = spyOn(herdr, 'herdrCommand').mockImplementation((_endpoint, args) => {
    const [kind, action] = args;
    let result: object;
    if (kind === 'workspace' && action === 'list') result = { workspaces: spaces };
    else if (kind === 'workspace' && action === 'get') {
      const selected = spaces.find(space => space.workspace_id === args[2]);
      if (!selected) throw new Error(`unknown offline workspace: ${args[2]}`);
      result = { workspace: selected };
    } else if (kind === 'worktree' && action === 'open') {
      const path = args[args.indexOf('--path') + 1];
      const selected = spaces.find(space => space.worktree.checkout_path === path);
      if (!selected) throw new Error(`unknown offline checkout: ${path}`);
      result = { workspace: selected, root_pane: parent, already_open: true };
    } else if (kind === 'pane' && action === 'list') result = { panes: [parent, pane] };
    else if (kind === 'pane' && action === 'get') result = { pane: args[2] === parent.pane_id ? parent : pane };
    else if (kind === 'pane' && action === 'split') result = { pane };
    else if (kind === 'pane' && action === 'process-info') result = { process_info: {
      shell_pid: process.ppid, foreground_process_group_id: process.pid, foreground_processes: [{ pid: process.pid }],
    } };
    else if (kind === 'agent' && action === 'get') {
      if (!agentName || args[2] !== agentName) throw new Error(`unknown offline agent: ${args[2]}`);
      result = { agent: { ...pane, name: agentName, agent: spec.harness_kind } };
    }
    else throw new Error(`unexpected offline Herdr call: ${args.join(' ')}`);
    return { pid: process.pid, status: 0, signal: null, stdout: Buffer.from(JSON.stringify({ id: 'fixture', result })), stderr: Buffer.alloc(0), output: [] };
  });
  return { transport, nameAgent: (name: string) => { agentName = name; } };
}

/** Real public session admission and binding, with an explicit in-process transport double.
 * The test process is the observed provider; this does not start a model or service. */
export async function startOfflineTaskAgent(root: string, spec: TaskAgentSpec, taskAuthority: TaskSessionAuthority) {
  const offline = mockOfflineHerdr(root, spec);
  try {
    return await startTaskAgent(root, spec, { taskAuthority, start: async (_endpoint, name) => { offline.nameAgent(name); } });
  } finally { offline.transport.mockRestore(); }
}

export interface EngineerRuntimeFixtureOptions {
  authorityHome: string; task?: string; role?: string; claim?: TaskClaimReference;
  repositoryId?: string; issueId?: string;
  harnessKind?: 'claude' | 'codex' | 'pi';
}
/** Public binding lifecycle with injected offline transport; no live service is claimed. */
export async function bindTaskRuntimeFixture(root: string, options: EngineerRuntimeFixtureOptions, engineerId?: string) {
  const task = options.task ?? '1'.repeat(64), role = options.role ?? 'deep-reasoner';
  const spec = { task, role, harness_kind: options.harnessKind ?? 'codex' };
  const approved = seedReviewAdmissionFixture(root, options.authorityHome, { repositoryId: options.repositoryId, issueId: options.issueId });
  const selected = engineerId === undefined ? undefined : loadEngineerProfile(root, engineerId);
  const profile = selected === undefined ? undefined : { engineer_id: selected.profile.engineer_id, engineer_contract_revision: selected.engineer_contract_revision };
  const claim = options.claim ?? { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-runtime', revision: `sha256:${'c'.repeat(64)}` };
  async function bind(role = spec.role) {
    return startOfflineTaskAgent(root, { ...spec, role, endpoint: { session: 'fixture', home: '/tmp' },
      parent_pane: `fixture-parent-${role}`, args: [], max_requests: 3 },
    { source: approved.source, claim, engineer_profile: profile });
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
      revokeActiveReviewAdmission({ repoRoot: root, authorityHome: options.authorityHome,
        repository_id: approved.admission.repository_id, issue_id: approved.admission.issue_id,
        campaign_id: approved.admission.campaign_id, expectedRevision: current.revision, expectedGrantSha256: current.grant_sha256 });
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
