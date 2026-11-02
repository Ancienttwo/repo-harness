/** Persisted task session records and their Node-safe reads. Terminal control and admission observation stay with their owners. */
import { existsSync, lstatSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { ProcessProof, TaskAgentSpec, TaskSessionAdmission, TerminalHostSpec } from '../../core/review/runner-port';
import { taskSessionKey, taskWorkspaceKey } from '../git/repository-identity';
import { taskRepository, type TaskRepository } from '../git/task-repository';
import { readSessionArtifact } from './task-session-io';

/** One herdr-core core, addressed by its socket (`HC_SOCKET`). `home` is the HOME that the
 * programs of that core see; review reads provider credentials from it. */
export interface HerdrCoreEndpoint { readonly socket: string; readonly home?: string }
export type ObjectOwnership = { disposition: 'created'; intent_id: string } | { disposition: 'attached' };
export interface OwnedProcess extends ProcessProof { ownership: ObjectOwnership }

interface TaskBindingCommon {
  protocol: 2;
  repository_id: string;
  execution_root: string;
  task: string;
  role: string;
  harness_kind: string;
  ownership: ObjectOwnership;
  provider: OwnedProcess;
  max_requests: number;
  task_admission?: TaskSessionAdmission;
}
/** A task session in its own herdr-core terminal. The provider is the terminal's program. */
export interface HerdrTaskBinding extends TaskBindingCommon {
  runtime: 'herdr-core';
  endpoint: HerdrCoreEndpoint;
  terminal_id: string;
  terminal_name: string;
}
/** An application host that an operator terminal (the Claude app) started
 * from the exact owner command. The terminal stays with the operator: no terminal
 * identity, history or signal authority exists for it. */
export interface TerminalTaskBinding extends TaskBindingCommon {
  runtime: 'terminal';
  command: string[];
}
export type TaskPaneBinding = HerdrTaskBinding | TerminalTaskBinding;
export type HerdrTaskAgentSpec = TaskAgentSpec<HerdrCoreEndpoint>;
export interface StartIntent { task_admission?: TaskSessionAdmission; protocol: 2; runtime: 'herdr-core'; repository: TaskRepository; intent_id: string; terminal_name: string; spec: HerdrTaskAgentSpec }
export interface TerminalStartIntent { task_admission?: TaskSessionAdmission; protocol: 2; runtime: 'terminal'; repository: TaskRepository; intent_id: string; spec: TerminalHostSpec; command: string[] }
export interface CreatedTerminal { intent_id: string; terminal_id: string; terminal_name: string }
/** The hc addressing of one checkout. hc has no workspace, so nothing is opened or closed for it. */
export interface TaskWorkspaceBinding {
  protocol: 2;
  repository: TaskRepository;
  endpoint: HerdrCoreEndpoint;
}

/** #1476: classic Herdr records are not migrated (decision on #1474). */
export function classicRecordRetired(path: string): never {
  throw new Error(`task_agent_classic_herdr_record_retired: ${path}. Classic Herdr sessions are not migrated; archive this record and start the session again.`);
}
export function readStartIntent(path: string): StartIntent | TerminalStartIntent {
  const intent = readSessionArtifact<StartIntent | TerminalStartIntent>(path);
  if (intent.runtime !== 'herdr-core' && intent.runtime !== 'terminal') classicRecordRetired(path);
  return intent;
}
export function readWorkspaceBinding(path: string): TaskWorkspaceBinding {
  const binding = readSessionArtifact<TaskWorkspaceBinding>(path);
  if (binding.protocol !== 2) classicRecordRetired(path);
  return binding;
}

export function assertSessionDirectory(root: string, path: string): void {
  const segments = relative(root, path).split('/');
  if (segments.includes('..') || isAbsolute(relative(root, path))) throw new Error('task_agent_unsafe_directory');
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    const stat = lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('task_agent_unsafe_directory');
  }
}

export function assertCreated(ownership: ObjectOwnership): asserts ownership is Extract<ObjectOwnership, { disposition: 'created' }> {
  if (ownership?.disposition !== 'created' || typeof ownership.intent_id !== 'string' || !ownership.intent_id) {
    throw new Error('task_agent_attached_object_not_closeable');
  }
}

export function taskSessionDirectory(root: string, task: string, role: string): string {
  const repository = taskRepository(root);
  return join(repository.primary_root, '.ai/harness/runs/task-agents', taskSessionKey(repository.repository_id, task, role));
}

export function sameSessionData(left: unknown, right: unknown): boolean {
  // Compare the JSON wire values, using the existing canonical key order.
  return canonicalize(JSON.parse(JSON.stringify(left))) === canonicalize(JSON.parse(JSON.stringify(right)));
}

/** #1345 removed engineer identity. An old binding stops its reader until the operator removes or archives it. */
export function readTaskBinding(path: string): TaskPaneBinding {
  const binding = readSessionArtifact<TaskPaneBinding>(path);
  if ((binding.runtime as string) === 'herdr') classicRecordRetired(path);
  if (binding.task_admission && Object.hasOwn(binding.task_admission.identity, 'engineer_profile')) {
    throw new Error(`task_agent_engineer_profile_retired: ${path}. The operator removes or archives this record by hand.`);
  }
  return binding;
}

export function readTaskAgent(repoRoot: string, task: string, role: string): { dir: string; binding: TaskPaneBinding } {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, task, role);
  assertSessionDirectory(root, dir);
  const binding = readTaskBinding(join(dir, 'binding.json'));
  if (binding.task !== task || binding.role !== role || binding.protocol !== 2 || binding.repository_id !== repository.repository_id
    || !['herdr-core', 'terminal'].includes(binding.runtime)) throw new Error('task_agent_binding_invalid');
  if (!Number.isSafeInteger(binding.max_requests) || binding.max_requests < 1 || binding.max_requests > 100) throw new Error('task_agent_binding_invalid');
  if (binding.runtime === 'terminal') {
    assertCreated(binding.ownership);
    const intent = readStartIntent(join(dir, 'intent.json'));
    const created = readSessionArtifact<TerminalTaskBinding>(join(dir, 'provider-created.json'));
    if (!sameSessionData(intent.task_admission ?? null, binding.task_admission ?? null) || intent.runtime !== 'terminal' || intent.intent_id !== binding.ownership.intent_id || !sameSessionData(intent.command, binding.command)
      || intent.spec.task !== binding.task || intent.spec.role !== binding.role || intent.spec.harness_kind !== binding.harness_kind
      || intent.spec.max_requests !== binding.max_requests || !sameSessionData(created, binding)) throw new Error('task_agent_binding_invalid');
  } else if (binding.ownership.disposition === 'created') {
    const intent = readStartIntent(join(dir, 'intent.json'));
    const created = readSessionArtifact<CreatedTerminal>(join(dir, 'terminal-created.json'));
    if (intent.runtime !== 'herdr-core' || !sameSessionData(intent.task_admission ?? null, binding.task_admission ?? null) || !sameSessionData(intent.spec.endpoint, binding.endpoint) || intent.spec.task !== binding.task
      || intent.spec.role !== binding.role || intent.spec.harness_kind !== binding.harness_kind || intent.spec.max_requests !== binding.max_requests) throw new Error('task_agent_binding_invalid');
    if (intent.intent_id !== binding.ownership.intent_id || created.intent_id !== intent.intent_id
      || created.terminal_id !== binding.terminal_id || created.terminal_name !== binding.terminal_name) throw new Error('task_agent_terminal_identity_lost');
    if (binding.provider.ownership.disposition === 'created' && binding.provider.ownership.intent_id !== intent.intent_id) throw new Error('task_agent_binding_invalid');
    const provider = readSessionArtifact<TaskPaneBinding>(join(dir, 'provider-created.json')).provider;
    if (provider.pid !== binding.provider.pid || provider.identity !== binding.provider.identity) throw new Error('task_agent_process_identity_lost');
  }
  return { dir, binding };
}

export function workspaceDirectory(repository: TaskRepository): string {
  return join(repository.primary_root, '.ai/harness/runs/task-workspaces', taskWorkspaceKey(repository.repository_id, repository.execution_root));
}
/** The session sweep cannot close an open runtime or contact herdr-core. */
export function taskWorktreeRuntimeClosed(repository: TaskRepository): boolean {
  const dir = workspaceDirectory(repository);
  try { lstatSync(dir); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true; throw error; }
  assertSessionDirectory(repository.primary_root, dir);
  if (!existsSync(join(dir, 'closed.json'))) return false;
  const closed = readSessionArtifact<{ repository_id: string; checkout: string }>(join(dir, 'closed.json'));
  return closed.repository_id === repository.repository_id && closed.checkout === repository.execution_root;
}
