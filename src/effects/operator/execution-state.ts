import { sha256Prefixed } from '../../core/evidence/sha256';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import type { TaskExecution, TaskExecutionSnapshot, UnverifiedExecutionReason } from '../../core/operator/execution-state';
import { taskRepository } from '../git/task-repository';
import { readSessionArtifact } from '../terminal/task-session-io';
import { processProofAlive, readTaskAgent, taskSessionDirectory, taskSessionDirectories, type NativeTaskSessionBinding, type TaskPaneBinding } from '../terminal/task-session-record';

const digest = (value: unknown) => sha256Prefixed(canonicalize(JSON.parse(JSON.stringify(value))));
// Admission records the full ref; Dev Activity names a branch without this prefix.
const BRANCH_REF = 'refs/heads/';

/** The core of a live hc task session, by its socket; null when the core does not answer. */
export type HcCoreIdOf = (socket: string) => Promise<string | null>;
/** The hc terminal of a verified session and the socket of its core, which never leaves the collector child. */
type Verified = { readonly execution: TaskExecution; readonly terminal: { readonly address: string; readonly name: string; readonly socket: string } | null };

function verify(primaryRoot: string, dir: string, task: string, role: string): Verified {
  const refuse = (reason: UnverifiedExecutionReason): Verified => ({ execution: { state: 'unverified', task, role, reason }, terminal: null });
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
  const admitted = binding.task_admission?.identity.branch ?? null;
  // hc never reuses an address on its core, so the bound address still names this session's terminal.
  return { execution: { state: 'verified', task, role, issue_id: binding.task_admission?.identity.issue_id ?? null,
    branch: admitted?.startsWith(BRANCH_REF) ? admitted.slice(BRANCH_REF.length) : null, agent: native.host, runtime: binding.runtime, native_session_id: native.native_session_id,
    hc_terminal: null },
    terminal: binding.runtime === 'herdr-core' ? { address: binding.terminal_id, name: binding.terminal_name, socket: binding.endpoint.socket } : null };
}

/**
 * Background collector for task execution state. It reads only the task-agent
 * records, the OS process table and the core id of each live hc session: no
 * conversation, no terminal text, no write. The snapshot holds no path,
 * endpoint home or process identity string.
 */
export async function collectTaskExecutionStates(repoRoot: string, coreIdOf: HcCoreIdOf): Promise<TaskExecutionSnapshot> {
  const primaryRoot = taskRepository(repoRoot).primary_root;
  const executions: TaskExecution[] = [];
  for (const dir of taskSessionDirectories(primaryRoot)) {
    if (!existsSync(join(dir, 'binding.json'))) continue; // Start in progress: no session yet.
    let stored: { task?: unknown; role?: unknown };
    try { stored = readSessionArtifact(join(dir, 'binding.json')); } catch { continue; }
    const { task, role } = stored ?? {};
    // A record outside the directory that its task and role select names no session of that task.
    if (typeof task !== 'string' || typeof role !== 'string' || taskSessionDirectory(primaryRoot, task, role) !== dir) continue;
    const { execution, terminal } = verify(primaryRoot, dir, task, role);
    const core_id = execution.state === 'verified' && terminal !== null ? await coreIdOf(terminal.socket) : null;
    executions.push(execution.state !== 'verified' || core_id === null || terminal === null ? execution
      : { ...execution, hc_terminal: { address: terminal.address, name: terminal.name, core_id } });
  }
  return { protocol: 1, kind: 'operator_task_execution', observed_at: new Date().toISOString(), executions };
}
