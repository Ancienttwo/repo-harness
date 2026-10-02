import { claudeRuntime, codexRuntime, createRuntimeRegistry, type Runtime, type Session, type SessionOptions } from '@botiverse/oar';
import { promptAndWait } from '@botiverse/oar/observe';
import { scriptedRuntime } from '@botiverse/oar/testing';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readSessionArtifact, writeSessionArtifact, type TaskRequest } from '../terminal/task-session';
import type { AvailableInstallation } from '@botiverse/oar';
import { dirname } from 'node:path';
import { reviewHostTemporaryDirectory } from './review-isolation';

export function assertOarHostNode(version = process.versions.node): void {
  if (!/^\d+\./.test(version) || Number(version.split('.')[0]) < 24) throw new Error('OAR_HOST_NODE_24_REQUIRED');
}
export function reviewRuntime(kind: string) {
  if (!['claude', 'codex'].includes(kind)) throw new Error('OAR_REVIEW_RUNTIME_UNSUPPORTED');
  return createRuntimeRegistry([codexRuntime, claudeRuntime]).require(kind);
}

/** Domain lifecycle over OAR's public API; no vendor argv or native-output parser. */
export class OarReviewHost {
  private round = 0;
  private disposed = false;
  private readonly unsubscribe: () => void;
  constructor(private readonly session: Session, print: (view: unknown) => void) {
    this.unsubscribe = session.events(print, { cursor: { sessionId: session.id, afterSeq: -1 } });
  }
  async prompt(input: string, timeoutMs = 30_000) {
    if (this.disposed) throw new Error('OAR_REVIEW_HOST_DISPOSED');
    if (this.round >= 3) throw new Error('OAR_REVIEW_ROUND_BUDGET_EXHAUSTED');
    this.round++;
    // Reviewer authors the Result file. This returned text is observation,
    // never a TaskResult, Receipt, or an application-extracted JSON payload.
    return promptAndWait(this.session, input, { timeoutMs });
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    await this.session.dispose();
    this.unsubscribe(); this.disposed = true;
  }
  get sessionId(): string { return this.session.id; }
  model(kind: string): string | null {
    // Claude system/init is requested/init metadata, not actual gateway model.
    if (kind === 'claude') return null;
    return this.session.model().value;
  }
}

/** Zero-model seam uses OAR's scriptedRuntime, not a hand-built adapter. */
export async function openScriptedReviewHost(options: SessionOptions, print: (view: unknown) => void,
  turn: Parameters<typeof scriptedRuntime>[0]['turn']): Promise<OarReviewHost> {
  assertOarHostNode();
  // Configuration only; Seatbelt is the protection authority.
  process.env.OAR_CODEX_SANDBOX = 'workspace-write';
  const runtime: Runtime = scriptedRuntime({ id: 'fixture', model: 'fixture-oar', turn });
  const session = await runtime.session({ kind: 'available', via: 'bundled' }, options);
  return new OarReviewHost(session, print);
}

interface FixtureSpec { mode: 'scripted'; cwd: string; inputs: string[]; closeRequest: string; readyFile: string; disposedFile: string }
export interface ReviewHostSpec {
  mode: 'review';
  kind: 'codex' | 'claude';
  installation: AvailableInstallation;
  options: SessionOptions;
  requestDirectory: string;
  output: string;
  timeoutMs: number;
}
export interface HostRoundObservation {
  request_id: string;
  kind: string;
  outcome: string | null;
  actual_model: string | null;
}

/** File request is application data, never text extracted from a harness. */
export async function runHostFileRequest(host: OarReviewHost, spec: ReviewHostSpec, request: TaskRequest): Promise<HostRoundObservation> {
  if (request.protocol !== 2 || request.round < 1 || request.round > 3
    || request.context_ref !== join(spec.output, `context-${request.round}.txt`)
    || request.result_ref !== join(spec.output, `result-${request.round}.json`)) throw new Error('OAR_HOST_REQUEST_INVALID');
  const content = readFileSync(request.context_ref, 'utf8');
  if (`sha256:${createHash('sha256').update(content).digest('hex')}` !== request.context_sha256) throw new Error('OAR_HOST_CONTEXT_MISMATCH');
  writeSessionArtifact(join(spec.output, `ack-${request.round}.json`), { request_id: request.request_id });
  // Fleet's RECOMMENDATION-first message is retained. Only the reviewer tool
  // writes result_ref; the host never interprets/publishes root-turn text.
  const run = await host.prompt(`TASK REQUEST: ${JSON.stringify(request)}\n\n${content}`, spec.timeoutMs);
  const observation = { request_id: request.request_id, kind: run.kind,
    outcome: run.kind === 'rejected' ? null : run.outcome.kind, actual_model: host.model(spec.kind) };
  writeSessionArtifact(join(spec.output, `observed-${request.round}.json`), observation);
  return observation;
}

async function main(): Promise<void> {
  assertOarHostNode();
  if (process.argv[2] === '--installation') {
    const runtime = reviewRuntime(process.argv[3]!);
    if (!runtime.installation) throw new Error('OAR_REVIEW_INSTALLATION_UNVERIFIED');
    console.log(JSON.stringify(await runtime.installation()));
    return;
  }
  const spec = readSessionArtifact<FixtureSpec | ReviewHostSpec>(process.argv[2]!);
  const temporary = reviewHostTemporaryDirectory(spec.mode === 'scripted' ? dirname(spec.readyFile) : spec.output);
  process.env.TMPDIR = temporary;
  let host: OarReviewHost;
  let output: string;
  if (spec.mode === 'scripted') {
    if (process.env.REPO_HARNESS_OAR_SCRIPTED_FIXTURE !== '1' || spec.inputs.length > 3) throw new Error('OAR_HOST_FIXTURE_SPEC_INVALID');
    output = spec.cwd;
    host = await openScriptedReviewHost({ cwd: spec.cwd }, view => console.log(JSON.stringify({ fixture: true, view })),
      async ({ input, say }) => { say(`RECOMMENDATION: fixture observation for ${input} — confidence: HIGH`); });
  } else {
    if (process.platform !== 'darwin' || spec.options.cwd !== spec.output) throw new Error('OAR_REVIEW_ISOLATION_UNSUPPORTED');
    // Parent launches only through proved Seatbelt policy. The OAR knob is
    // configuration, not evidence, and precedes native Session creation.
    process.env.OAR_CODEX_SANDBOX = 'workspace-write';
    output = spec.output;
    const session = await reviewRuntime(spec.kind).session(spec.installation, spec.options);
    host = new OarReviewHost(session, view => console.log(JSON.stringify({ oar: view })));
  }
  const readyFile = spec.mode === 'scripted' ? spec.readyFile : join(output, 'ready.json');
  const closeRequest = spec.mode === 'scripted' ? spec.closeRequest : join(output, 'close.request');
  const disposedFile = spec.mode === 'scripted' ? spec.disposedFile : join(output, 'disposed.json');
  let closing: Promise<void> | undefined;
  const close = () => closing ??= host.dispose();
  // Disposal ack is written by finally, not inferred from a signal/idle.
  const signal = () => { void close(); };
  process.once('SIGTERM', signal); process.once('SIGINT', signal);
  try {
    writeSessionArtifact(readyFile, { pid: process.pid, session_id: host.sessionId, fixture: spec.mode === 'scripted' });
    console.log('OAR_HOST_READY');
    if (spec.mode === 'scripted') {
      for (const input of spec.inputs) await host.prompt(input);
      console.log('OAR_HOST_ROUNDS_DONE_FIXTURE');
      while (!existsSync(closeRequest) && !closing) await new Promise(resolve => setTimeout(resolve, 25));
    } else {
      for (let round = 1; !closing && !existsSync(closeRequest);) {
        const path = join(spec.requestDirectory, `request-${round}.json`);
        if (!existsSync(path)) { await new Promise(resolve => setTimeout(resolve, 25)); continue; }
        if (round > 3) throw new Error('OAR_REVIEW_ROUND_BUDGET_EXHAUSTED');
        const request = readSessionArtifact<TaskRequest>(path);
        const observation = await runHostFileRequest(host, spec, request);
        if (observation.kind !== 'ended' || observation.outcome !== 'completed') throw new Error('OAR_REVIEW_TURN_FAILED');
        round++;
      }
    }
  } catch (error) {
    if (spec.mode === 'review') writeSessionArtifact(join(output, 'error.json'), { error: String(error) });
    throw error;
  } finally {
    await close();
    writeSessionArtifact(disposedFile, { disposed: true, fixture: spec.mode === 'scripted' });
    console.log('OAR_HOST_DISPOSED');
    process.removeListener('SIGTERM', signal); process.removeListener('SIGINT', signal);
  }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
