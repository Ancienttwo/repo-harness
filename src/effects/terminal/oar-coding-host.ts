import { codexRuntime, type AvailableInstallation, type Session } from '@botiverse/oar';
import { promptAndWait } from '@botiverse/oar/observe';
import { scriptedRuntime } from '@botiverse/oar/testing';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTaskRequest, readSessionArtifact, writeSessionArtifact, taskSessionDirectory, type TaskRequest } from './task-session';
import { taskRepository } from './task-worktree';
import { assertCodingHostAdmission, prepareCodingLauncher, proveCodingIsolation, type CodingHostAdmission } from './coding-isolation';

export interface CodingHostSpec {
  admission: CodingHostAdmission;
  task: string;
  role: string;
  primary_root: string;
  request_directory: string;
  control_directory: string;
  max_requests: number;
  installation: AvailableInstallation;
  launcher: string;
  policy_file: string;
}
export function assertCodingHostNode(version = process.versions.node): void {
  const major = Number(version.split('.')[0]);
  if (major < 24 || major >= 26 || !Number.isInteger(major)) throw new Error('OAR_CODING_NODE_24_OR_25_REQUIRED');
}

/** OAR output is observation. Only task-session validates and collects results. */
export class OarCodingHost {
  private closing: Promise<void> | undefined;
  private readonly unsubscribe: () => void;
  constructor(private readonly session: Session, print: (event: unknown) => void) {
    this.unsubscribe = session.events(print, { cursor: { sessionId: session.id, afterSeq: -1 } });
  }
  get sessionId(): string { return this.session.id; }
  prompt(request: TaskRequest, content: string) {
    if (this.closing) throw new Error('OAR_CODING_HOST_DISPOSED');
    return promptAndWait(this.session, `TASK REQUEST: ${JSON.stringify(request)}\n\n${content}`, { timeoutMs: 1_800_000 });
  }
  dispose(): Promise<void> {
    return this.closing ??= (async () => {
      try { await this.session.abort(); }
      finally { try { await this.session.dispose(); } finally { this.unsubscribe(); } }
    })();
  }
}

/** Uses OAR's own runtime, with no provider process or simulated wire parser. */
export async function openScriptedCodingHost(cwd: string, turn: Parameters<typeof scriptedRuntime>[0]['turn'], print: (event: unknown) => void): Promise<OarCodingHost> {
  assertCodingHostNode();
  const session = await scriptedRuntime({ id: 'coding-fixture', model: 'fixture-oar', turn }).session({ kind: 'available', via: 'bundled' }, { cwd });
  return new OarCodingHost(session, print);
}
export async function runCodingHostRequest(host: OarCodingHost, spec: CodingHostSpec, request: TaskRequest): Promise<boolean> {
  const { binding } = assertTaskRequest(spec.primary_root, spec.request_directory, request);
  if (binding.execution_root !== spec.admission.execution_root || binding.host !== null || request.round > spec.max_requests) throw new Error('OAR_CODING_REQUEST_INVALID');
  const content = readFileSync(request.context_ref, 'utf8');
  if (`sha256:${createHash('sha256').update(content).digest('hex')}` !== request.context_sha256) throw new Error('OAR_CODING_CONTEXT_MISMATCH');
  // Immutable before prompt. A host restart never delivers this input again.
  writeSessionArtifact(join(spec.control_directory, `attempt-${request.round}.json`), { request_id: request.request_id });
  writeSessionArtifact(join(spec.control_directory, `ack-${request.round}.json`), { request_id: request.request_id });
  const result = await host.prompt(request, content);
  writeSessionArtifact(join(spec.control_directory, `observed-${request.round}.json`), {
    request_id: request.request_id, kind: result.kind, outcome: result.kind === 'rejected' ? null : result.outcome.kind,
  });
  return result.kind === 'ended' && result.outcome.kind === 'completed';
}
export async function serveCodingHostRequests(host: OarCodingHost, spec: CodingHostSpec, close: () => Promise<void>, closing: () => boolean): Promise<void> {
  const closePath = join(spec.control_directory, 'close.request');
  const watch = setInterval(() => { if (existsSync(closePath)) void close().catch(() => {}); }, 25);
  try {
    for (let round = 1; !closing() && !existsSync(closePath);) {
      const path = join(spec.request_directory, `request-${round}.json`);
      if (!existsSync(path)) { await new Promise(resolve => setTimeout(resolve, 25)); continue; }
      if (round > spec.max_requests) throw new Error('OAR_CODING_ROUND_BUDGET_EXHAUSTED');
      const completed = await runCodingHostRequest(host, spec, readSessionArtifact<TaskRequest>(path));
      if (closing()) return;
      if (!completed) throw new Error('OAR_CODING_TURN_INCOMPLETE');
      round++;
    }
  } finally { clearInterval(watch); }
}
export async function openCodingHost(spec: CodingHostSpec, print: (event: unknown) => void): Promise<OarCodingHost> {
  assertCodingHostNode();
  assertCodingHostAdmission(spec.admission.execution_root, spec.admission);
  if (spec.primary_root !== taskRepository(spec.admission.execution_root).primary_root
    || spec.request_directory !== taskSessionDirectory(spec.primary_root, spec.task, spec.role)
    || spec.control_directory !== join(spec.request_directory, 'coding-host') || spec.policy_file !== join(spec.control_directory, 'policy.sb')
    || !Number.isSafeInteger(spec.max_requests) || spec.max_requests < 1 || spec.max_requests > 100
    || spec.installation.kind !== 'available' || spec.installation.via !== 'executable' || spec.installation.command !== spec.launcher
    || prepareCodingLauncher(spec.control_directory, spec.policy_file, spec.admission) !== spec.launcher) throw new Error('OAR_CODING_HOST_SPEC_INVALID');
  proveCodingIsolation(spec.admission, spec.policy_file);
  // The admitted OS child policy remains the write authority. OAR's broad
  // sandbox default is explicitly overridden. No native flags are built here.
  process.env.OAR_CODEX_SANDBOX = 'workspace-write';
  const session = await codexRuntime.session(spec.installation, {
    cwd: spec.admission.execution_root, model: spec.admission.model, effort: spec.admission.effort,
  });
  return new OarCodingHost(session, print);
}

async function main(): Promise<void> {
  assertCodingHostNode();
  if (process.argv[2] === '--installation') {
    process.env.OAR_CODEX_BIN = process.argv[3]!;
    console.log(JSON.stringify(await codexRuntime.installation()));
    return;
  }
  const spec = readSessionArtifact<CodingHostSpec>(process.argv[2]!);
  // No fixture mode is accepted by the installed entrypoint.
  let host: OarCodingHost;
  try { host = await openCodingHost(spec, event => console.log(JSON.stringify({ oar: event }))); }
  catch (error) { writeSessionArtifact(join(spec.control_directory, 'error.json'), { error: String(error) }); throw error; }
  let closing: Promise<void> | undefined;
  const close = () => closing ??= host.dispose();
  const signal = () => { void close().catch(() => {}); };
  process.once('SIGTERM', signal); process.once('SIGINT', signal);
  try {
    writeSessionArtifact(join(spec.control_directory, 'ready.json'), { pid: process.pid, session_id: host.sessionId });
    console.log('OAR_CODING_HOST_READY');
    await serveCodingHostRequests(host, spec, close, () => closing !== undefined);
  } catch (error) {
    writeSessionArtifact(join(spec.control_directory, 'error.json'), { error: String(error) });
    throw error;
  } finally {
    await close();
    writeSessionArtifact(join(spec.control_directory, 'disposed.json'), { disposed: true, session_id: host.sessionId });
    console.log('OAR_CODING_HOST_DISPOSED');
    process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal);
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
