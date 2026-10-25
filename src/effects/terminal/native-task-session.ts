import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalize } from '../../core/evidence/canonical-json';
import { readTaskAgent, readSessionArtifact, writeSessionArtifact, type TaskPaneBinding } from './task-session';

/** Native host attribution only. This record never grants current task authority. */
export interface NativeTaskSessionBinding {
  readonly protocol: 1;
  readonly kind: 'repo-harness-native-task-session';
  readonly host: 'claude' | 'codex';
  readonly native_session_id: string;
  readonly task: string;
  readonly role: string;
  readonly session_binding_sha256: string;
  readonly provider: { readonly pid: number; readonly identity: string };
}
const canonical = (value: unknown) => canonicalize(JSON.parse(JSON.stringify(value)));
const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;

/** The controlled OAR host writes ready only after native start/resume succeeds.
 * Pinned OAR 0.62.1 uses Claude's --session-id/--resume and Codex's
 * thread/start|resume response thread.id as Session.id. No cwd or actor join. */
export function bindNativeTaskSession(input: {
  repo_root: string;
  binding: TaskPaneBinding;
  ready_path: string;
}): NativeTaskSessionBinding {
  const { binding } = input;
  if (!binding.task_admission || !['claude', 'codex'].includes(binding.harness_kind)) throw new Error('native_task_session_admission_required');
  const ready = readSessionArtifact<{ pid?: unknown; session_id?: unknown; fixture?: unknown }>(input.ready_path);
  if (ready.pid !== binding.provider.pid || ready.fixture !== false
    || typeof ready.session_id !== 'string' || !ready.session_id.trim() || ready.session_id !== ready.session_id.trim()
    || ready.session_id.length > 256 || /[\x00-\x1f\x7f]/u.test(ready.session_id)) throw new Error('native_task_session_host_mismatch');
  const record: NativeTaskSessionBinding = {
    protocol: 1, kind: 'repo-harness-native-task-session', host: binding.harness_kind as 'claude' | 'codex',
    native_session_id: ready.session_id, task: binding.task, role: binding.role,
    session_binding_sha256: digest(binding), provider: { pid: binding.provider.pid, identity: binding.provider.identity },
  };
  const current = () => {
    const read = readTaskAgent(input.repo_root, binding.task, binding.role);
    if (existsSync(join(read.dir, 'closed.json')) || canonical(read.binding) !== canonical(binding)) throw new Error('native_task_session_binding_changed');
    return read.dir;
  };
  const path = join(current(), 'native-session.json');
  if (!existsSync(path)) {
    try { writeSessionArtifact(path, record); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  if (canonical(readSessionArtifact(path)) !== canonical(record)) throw new Error('native_task_session_identity_changed');
  current();
  return record;
}
