import { spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as herdrCore from '../../src/effects/terminal/herdr-core';
import { RH_LABEL, RH_NOTIFY_LABELS, RH_ROLE } from '../../src/effects/terminal/herdr-core';
import { taskSessionKey } from '../../src/effects/git/repository-identity';
import { seedReviewAdmissionFixture } from './review-admission-fixture';
import { startTaskAgent } from '../../src/effects/terminal/task-session';
import { readSessionArtifact } from '../../src/effects/terminal/task-session-io';
import { taskSessionDirectory, type HerdrTaskAgentSpec, type StartIntent } from '../../src/effects/terminal/task-session-record';
import type { TaskClaimReference } from '../../src/core/review/runner-port';
import type { TaskSessionAuthority } from '../../src/effects/admission/admission-source';
import { taskRepository } from '../../src/effects/git/task-repository';
import { readActiveReviewAdmission, revokeActiveReviewAdmission } from '../../src/effects/admission/admission-store';
import type { ExecutionHost } from '../../src/core/operator/execution-state';

/** In-process herdr-core transport double for one task agent. The provider is the test process unless
 * `pid` names another; the parent terminal works in the execution root. The caller restores the spies. */
export function mockOfflineHerdr(root: string, spec: HerdrTaskAgentSpec, pid = process.pid) {
  const repository = taskRepository(root);
  const address = `t-${spec.role}`;
  const intentPath = join(taskSessionDirectory(root, spec.task, spec.role), 'intent.json');
  const foreground = { pid, name: 'bun', argv: [process.execPath], cwd: repository.execution_root };
  const live = { state: 'live' as const, status: null, turn: 0, reason: null, foreground };
  // The labels and name that the product set at hc run; the intent is their only source.
  const agent = () => {
    if (!existsSync(intentPath)) return null;
    const intent = readSessionArtifact<StartIntent>(intentPath);
    return { ...live, address, name: intent.terminal_name, pid, labels: {
      [RH_LABEL.role]: RH_ROLE.taskSession, [RH_LABEL.task]: taskSessionKey(intent.repository.repository_id, spec.task, spec.role),
      [RH_LABEL.request]: intent.intent_id, [RH_LABEL.harness]: spec.harness_kind, ...RH_NOTIFY_LABELS } };
  };
  const unexpected = (call: string) => () => { throw new Error(`unexpected offline hc call: ${call}`); };
  const spies = {
    hcRun: spyOn(herdrCore, 'hcRun').mockImplementation(input => ({ address, name: input.name ?? null, state: 'live' })),
    hcGet: spyOn(herdrCore, 'hcGet').mockImplementation(target => {
      if (target === spec.parent_terminal) return { ...live, address: target, name: null, pid: process.pid, labels: {} };
      const terminal = agent();
      if (target !== address || !terminal) throw new herdrCore.HerdrCoreError('hc', 'failed', 3, 'not_found');
      return terminal;
    }),
    hcList: spyOn(herdrCore, 'hcList').mockImplementation(unexpected('ls')),
    hcKill: spyOn(herdrCore, 'hcKill').mockImplementation(unexpected('kill')),
    hcRm: spyOn(herdrCore, 'hcRm').mockImplementation(unexpected('rm')),
    hcJson: spyOn(herdrCore, 'hcJson').mockImplementation(unexpected('json')),
  };
  return { spies, address, terminal: agent,
    transport: { mockRestore: () => { for (const spy of Object.values(spies)) spy.mockRestore(); } } };
}

/** Real public session admission and binding, with an explicit in-process transport double.
 * The test process is the observed provider; this does not start a model or service. */
export async function startOfflineTaskAgent(root: string, spec: HerdrTaskAgentSpec, taskAuthority: TaskSessionAuthority) {
  const offline = mockOfflineHerdr(root, spec);
  try {
    return await startTaskAgent(root, spec, { taskAuthority, argv: [process.execPath], ready: async () => {} });
  } finally { offline.transport.mockRestore(); }
}

export interface TaskRuntimeFixtureOptions {
  authorityHome: string; task?: string; role?: string; claim?: TaskClaimReference;
  repositoryId?: string; issueId?: string;
  harness_kind?: ExecutionHost;
}
/** Public binding lifecycle with injected offline transport; no live service is claimed. */
export async function bindTaskRuntimeFixture(root: string, options: TaskRuntimeFixtureOptions) {
  const task = options.task ?? '1'.repeat(64), role = options.role ?? 'deep-reasoner';
  const spec = { task, role, harness_kind: options.harness_kind ?? 'codex' };
  const approved = seedReviewAdmissionFixture(root, options.authorityHome, { repositoryId: options.repositoryId, issueId: options.issueId });
  const claim = options.claim ?? { reference: 'https://github.com/acme/widgets/issues/903#issuecomment-runtime', revision: `sha256:${'c'.repeat(64)}` };
  async function bind(role = spec.role) {
    return startOfflineTaskAgent(root, { ...spec, role, endpoint: { socket: '/tmp/fixture-hc/hc.sock', home: '/tmp' },
      parent_terminal: `fixture-parent-${role}`, args: [], max_requests: 3 },
    { source: approved.source, claim });
  }
  const binding = await bind();
  const source = { authority: { source: approved.source, claim }, session: { task, role } };
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
