import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { AvailableInstallation } from '@botiverse/oar';
import { canonicalize } from '../../core/evidence/canonical-json';
import { assertCodingHostAdmission, prepareCodingLauncher, proveCodingIsolation, type CodingHostAdmission } from './coding-isolation';
import type { CodingHostSpec } from './oar-coding-host';
import { taskRepository } from './task-worktree';
import { assertTaskBinding, cancelTaskAgent, closeTaskAgent, ensureSessionDirectory, readSessionArtifact, readTaskAgent, sendTaskRequest, startTaskApplicationHost, taskSessionDirectory, waitSessionArtifact, writeSessionArtifact, type TaskAgentSpec, type TaskCleanupResult, type TaskPaneBinding } from './task-session';
export { assertCodingHostAdmission, type CodingHostAdmission } from './coding-isolation';

const hostEntry = () => realpathSync(join(import.meta.dir, '../../../dist/oar-coding-host.js'));
function same(left: unknown, right: unknown): boolean { return canonicalize(JSON.parse(JSON.stringify(left))) === canonicalize(JSON.parse(JSON.stringify(right))); }
function installation(admission: CodingHostAdmission): AvailableInstallation {
  const result = spawnSync(admission.node, ['--disable-sigusr1', hostEntry(), '--installation', admission.executable], { encoding: 'utf8', timeout: 10_000 });
  if (result.error || result.status !== 0) throw new Error('OAR_CODING_INSTALLATION_UNVERIFIED');
  const value = JSON.parse(result.stdout) as AvailableInstallation;
  if (value.kind !== 'available' || value.via !== 'executable' || realpathSync(value.command) !== realpathSync(admission.executable)) throw new Error('OAR_CODING_INSTALLATION_UNVERIFIED');
  return value;
}
function readCodingSpec(dir: string): CodingHostSpec {
  const spec = readSessionArtifact<CodingHostSpec>(join(dir, 'coding-host', 'spec.json'));
  if (spec.control_directory !== join(dir, 'coding-host') || spec.request_directory !== dir
    || spec.request_directory !== taskSessionDirectory(spec.primary_root, spec.task, spec.role)) throw new Error('OAR_CODING_HOST_SPEC_INVALID');
  return spec;
}
/** Read-only identity proof for PM recovery. It never probes a provider. */
export function assertCodingTaskAgent(repoRoot: string, task: string, role: string, admission?: CodingHostAdmission): { dir: string; binding: TaskPaneBinding } {
  const current = readTaskAgent(repoRoot, task, role), spec = readCodingSpec(current.dir);
  assertCodingHostAdmission(current.binding.execution_root, spec.admission);
  const ready = readSessionArtifact<{pid: number; session_id: string}>(join(spec.control_directory, 'ready.json'));
  if (current.binding.host !== null || current.binding.harness_kind !== 'codex' || current.binding.execution_root !== spec.admission.execution_root
    || spec.task !== task || spec.role !== role || spec.max_requests !== current.binding.max_requests
    || spec.primary_root !== taskRepository(current.binding.execution_root).primary_root
    || ready.pid !== current.binding.provider.pid || !ready.session_id
    || admission !== undefined && !same(spec.admission, admission)) throw new Error('OAR_CODING_HOST_IDENTITY_LOST');
  return current;
}
export async function startCodingTaskAgent(repoRoot: string, spec: TaskAgentSpec, admission: CodingHostAdmission): Promise<TaskPaneBinding> {
  assertCodingHostAdmission(repoRoot, admission);
  if (spec.harness_kind !== admission.runtime || spec.args.length !== 0) throw new Error('OAR_CODING_NATIVE_ARGUMENTS_REFUSED');
  const repository = taskRepository(repoRoot), dir = taskSessionDirectory(repository.primary_root, spec.task, spec.role);
  const control = join(dir, 'coding-host');
  ensureSessionDirectory(repository.primary_root, control);
  const specFile = join(control, 'spec.json');
  if (existsSync(specFile)) {
    const prior = readCodingSpec(dir);
    if (!same(prior.admission, admission) || prior.request_directory !== dir || prior.primary_root !== repository.primary_root || prior.max_requests !== spec.max_requests) throw new Error('OAR_CODING_ADMISSION_CHANGED');
    // task-session reconciles this same intent. It never launches a new host.
  } else {
    // Probe installation and OS denial before Herdr can split a pane.
    const available = installation(admission);
    const policy_file = join(control, 'policy.sb');
    const launcher = prepareCodingLauncher(control, policy_file, admission);
    proveCodingIsolation(admission, policy_file);
    const hostSpec: CodingHostSpec = { admission, task: spec.task, role: spec.role, primary_root: repository.primary_root, request_directory: dir, control_directory: control,
      max_requests: spec.max_requests, installation: { ...available, via: 'executable', command: launcher }, launcher, policy_file };
    writeSessionArtifact(specFile, hostSpec);
  }
  const binding = await startTaskApplicationHost(repoRoot, spec, [admission.node, '--disable-sigusr1', hostEntry(), specFile], async () => {
    await waitSessionArtifact(join(control, 'ready.json'), Date.now() + 50_000, () => {
      if (existsSync(join(control, 'error.json'))) throw new Error('OAR_CODING_START_FAILED');
    });
    const ready = readSessionArtifact<{ pid: number; session_id: string }>(join(control, 'ready.json'));
    if (!Number.isSafeInteger(ready.pid) || typeof ready.session_id !== 'string' || !ready.session_id) throw new Error('OAR_CODING_READY_INVALID');
  });
  const ready = readSessionArtifact<{ pid: number }>(join(control, 'ready.json'));
  if (binding.host !== null || binding.provider.pid !== ready.pid) throw new Error('OAR_CODING_HOST_IDENTITY_LOST');
  return binding;
}
export async function sendCodingTaskRequest(repoRoot: string, task: string, role: string, contextRef: string, contextPolicy: 'repeatable' | 'changed_only' = 'repeatable') {
  const { dir, binding } = assertCodingTaskAgent(repoRoot, task, role), spec = readCodingSpec(dir);
  assertCodingHostAdmission(binding.execution_root, spec.admission);
  if (binding.host !== null || binding.execution_root !== spec.admission.execution_root) throw new Error('OAR_CODING_HOST_IDENTITY_LOST');
  return sendTaskRequest(repoRoot, task, role, contextRef, contextPolicy, async request => {
    const ack = join(spec.control_directory, `ack-${request.round}.json`);
    await waitSessionArtifact(ack, Date.now() + 10_000, () => {
      assertTaskBinding(binding);
      if (existsSync(join(spec.control_directory, 'error.json'))) throw new Error('OAR_CODING_DELIVERY_FAILED');
    });
    if (readSessionArtifact<{request_id: string}>(ack).request_id !== request.request_id) throw new Error('OAR_CODING_ACK_IDENTITY_LOST');
  });
}
async function cleanupCodingTaskAgent(repoRoot: string, task: string, role: string, cancel: boolean): Promise<TaskCleanupResult> {
  assertCodingTaskAgent(repoRoot, task, role);
  return cancel ? cancelTaskAgent(repoRoot, task, role) : closeTaskAgent(repoRoot, task, role);
}
export function closeCodingTaskAgent(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult> { return cleanupCodingTaskAgent(repoRoot, task, role, false); }
export function cancelCodingTaskAgent(repoRoot: string, task: string, role: string): Promise<TaskCleanupResult> { return cleanupCodingTaskAgent(repoRoot, task, role, true); }
