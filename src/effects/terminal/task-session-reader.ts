/** Node-safe immutable session reader. Admission observation remains in the owner. */
import { lstatSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import { taskSessionKey } from '../git/repository-identity';
import { taskRepository } from '../git/task-repository';
import { readSessionArtifact } from './task-session-io';
import type { ObjectOwnership, TaskPaneBinding, TerminalStartIntent, TerminalTaskBinding, StartIntent, CreatedPane } from './task-session';

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
/** A contending starter waits this long for the lock holder, which can wait up to 50 s for its host to be ready. */
const TASK_START_LOCK_WAIT_MS = 70_000;

export function readTaskAgent(repoRoot: string, task: string, role: string): { dir: string; binding: TaskPaneBinding } {
  const repository = taskRepository(repoRoot); const root = repository.primary_root; const dir = taskSessionDirectory(root, task, role);
  assertSessionDirectory(root, dir);
  const binding = readSessionArtifact<TaskPaneBinding>(join(dir, 'binding.json'));
  if (binding.task !== task || binding.role !== role || binding.protocol !== 2 || binding.repository_id !== repository.repository_id
    || !['herdr', 'terminal'].includes(binding.runtime)) throw new Error('task_agent_binding_invalid');
  if (!Number.isSafeInteger(binding.max_requests) || binding.max_requests < 1 || binding.max_requests > 100) throw new Error('task_agent_binding_invalid');
  if (binding.runtime === 'terminal') {
    assertCreated(binding.ownership);
    const intent = readSessionArtifact<TerminalStartIntent>(join(dir, 'intent.json'));
    const created = readSessionArtifact<TerminalTaskBinding>(join(dir, 'provider-created.json'));
    if (!sameSessionData(intent.task_admission ?? null, binding.task_admission ?? null) || intent.runtime !== 'terminal' || intent.intent_id !== binding.ownership.intent_id || !sameSessionData(intent.command, binding.command)
      || intent.spec.task !== binding.task || intent.spec.role !== binding.role || intent.spec.harness_kind !== binding.harness_kind
      || intent.spec.max_requests !== binding.max_requests || !sameSessionData(created, binding)) throw new Error('task_agent_binding_invalid');
  } else if (binding.ownership.disposition === 'created') {
    const intent = readSessionArtifact<StartIntent>(join(dir, 'intent.json'));
    const pane = readSessionArtifact<CreatedPane>(join(dir, 'pane-created.json'));
    if (!sameSessionData(intent.task_admission ?? null, binding.task_admission ?? null) || !sameSessionData(intent.spec.endpoint, binding.endpoint) || intent.spec.task !== binding.task
      || intent.spec.role !== binding.role || intent.spec.harness_kind !== binding.harness_kind || intent.spec.max_requests !== binding.max_requests) throw new Error('task_agent_binding_invalid');
    if (intent.intent_id !== binding.ownership.intent_id || pane.intent_id !== intent.intent_id
      || pane.pane_id !== binding.pane_id || pane.terminal_id !== binding.terminal_id) throw new Error('task_agent_pane_identity_lost');
    if (binding.provider.ownership.disposition === 'created' && binding.provider.ownership.intent_id !== intent.intent_id) throw new Error('task_agent_binding_invalid');
    const provider = readSessionArtifact<TaskPaneBinding>(join(dir, 'provider-created.json')).provider;
    if (provider.pid !== binding.provider.pid || provider.identity !== binding.provider.identity) throw new Error('task_agent_process_identity_lost');
  }
  return { dir, binding };
}
