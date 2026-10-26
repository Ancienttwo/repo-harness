import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { TaskExecution, TaskExecutionSnapshot, UnverifiedExecutionReason } from '../../core/operator/execution-state';
import { TASK_SESSIONS_MAX_ENTRIES } from '../../core/sessions/task-sessions';
import { taskRepository } from '../git/task-repository';
import type { NativeTaskSessionBinding } from '../terminal/native-task-session';
import { processProofAlive, readSessionArtifact, readTaskAgent, taskSessionDirectory, type TaskPaneBinding } from '../terminal/task-session';

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalize(JSON.parse(JSON.stringify(value)))).digest('hex')}`;

function sessionDirectories(primaryRoot: string): string[] {
  let base = primaryRoot;
  for (const component of ['.ai', 'harness', 'runs', 'task-agents']) {
    base = join(base, component);
    if (!existsSync(base)) return [];
    const stat = lstatSync(base);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('execution_state_unsafe_directory');
  }
  const names = readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^[0-9a-f]{64}$/u.test(entry.name)).map(entry => entry.name).sort();
  if (names.length > TASK_SESSIONS_MAX_ENTRIES) throw new Error('execution_state_too_large');
  return names.map(name => join(base, name));
}

function verify(primaryRoot: string, dir: string, task: string, role: string): TaskExecution {
  const refuse = (reason: UnverifiedExecutionReason): TaskExecution => ({ state: 'unverified', task, role, reason });
  if (existsSync(join(dir, 'closed.json'))) return refuse('closed');
  let binding: TaskPaneBinding;
  try { binding = readTaskAgent(primaryRoot, task, role).binding; } catch { return refuse('binding_invalid'); }
  if (!existsSync(join(dir, 'native-session.json'))) return refuse('native_session_missing');
  let native: NativeTaskSessionBinding;
  try { native = readSessionArtifact<NativeTaskSessionBinding>(join(dir, 'native-session.json')); } catch { return refuse('native_session_mismatch'); }
  if (!native || typeof native !== 'object') return refuse('native_session_mismatch');
  const bindingDigest = digest(binding);
  if (native.session_binding_sha256 !== bindingDigest) return refuse('binding_mismatch');
  if (native.protocol !== 1 || native.kind !== 'repo-harness-native-task-session' || native.host !== binding.harness_kind
    || native.task !== task || native.role !== role || typeof native.native_session_id !== 'string'
    || native.provider?.pid !== binding.provider.pid || native.provider?.identity !== binding.provider.identity) return refuse('native_session_mismatch');
  // The task-session proof compares PID, process group and start time. A reused PID throws.
  try { if (!processProofAlive(binding.provider)) return refuse('provider_exited'); } catch { return refuse('provider_identity_lost'); }
  // The session can close or rebind during the process check.
  if (existsSync(join(dir, 'closed.json'))) return refuse('closed');
  try { if (digest(readTaskAgent(primaryRoot, task, role).binding) !== bindingDigest) return refuse('binding_mismatch'); }
  catch { return refuse('binding_invalid'); }
  return { state: 'verified', task, role, issue_id: binding.task_admission?.identity.issue_id ?? null,
    agent: native.host, runtime: binding.runtime, native_session_id: native.native_session_id,
    herdr_pane: binding.runtime === 'herdr' ? { session: binding.endpoint.session, workspace_id: binding.workspace_id,
      pane_id: binding.pane_id, agent_name: binding.agent_name } : null };
}

/**
 * Background collector for task execution state. It reads only the task-agent
 * records and the OS process table: no conversation, no terminal text, no write.
 * The snapshot holds no path, endpoint home or process identity string.
 */
export function collectTaskExecutionStates(repoRoot: string): TaskExecutionSnapshot {
  const primaryRoot = taskRepository(repoRoot).primary_root;
  const executions: TaskExecution[] = [];
  for (const dir of sessionDirectories(primaryRoot)) {
    if (!existsSync(join(dir, 'binding.json'))) continue; // Start in progress: no session yet.
    let stored: { task?: unknown; role?: unknown };
    try { stored = readSessionArtifact(join(dir, 'binding.json')); } catch { continue; }
    const { task, role } = stored ?? {};
    // A record outside the directory that its task and role select names no session of that task.
    if (typeof task !== 'string' || typeof role !== 'string' || taskSessionDirectory(primaryRoot, task, role) !== dir) continue;
    executions.push(verify(primaryRoot, dir, task, role));
  }
  return { protocol: 1, kind: 'operator_task_execution', observed_at: new Date().toISOString(), executions };
}
