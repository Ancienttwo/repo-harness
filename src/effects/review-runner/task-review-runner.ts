/** The task-agent-host implementation of the reviewer runner port. It owns the
 * reviewer task session, the OAR host launch and its control files, and the
 * reviewer profile. Generic review reaches it only through the port. */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InstallationSnapshot, SessionOptions } from '@botiverse/oar';
import { canonicalize } from '../../core/evidence/canonical-json';
import { GENERIC_REVIEW_ROLE, type AcceptanceAuthor } from '../../core/review/acceptance-receipt';
import { isReviewRuntimeId, type ReviewRuntimeId } from '../../core/review/review-runtimes';
import type { ProcessProof, ReviewAuthorQuery, ReviewerRunner, TaskRequest } from '../../core/review/runner-port';
import type { TaskSessionAuthority } from '../admission/admission-source';
import { taskRepository } from '../git/task-repository';
import { piExecutable } from '../pi-executable';
import { reviewHostCommand } from '../review/review-isolation';
import { validateHerdrEndpoint, type HerdrEndpoint } from '../terminal/herdr';
import { bindNativeTaskSession } from '../terminal/native-task-session';
import { parseFrontmatter, validateFrontmatter, AGENT_TARGET_OVERRIDES } from '../terminal/task-role-profiles';
import { assertTaskBinding, assertTerminalHostCommand, bindTerminalApplicationHost, cancelTaskAgent, closeTaskAgent, collectTaskResult,
  processProofAlive, readTaskAgent, sendTaskRequest, startTaskApplicationHost, taskAgentStatus, taskBindingSha256, taskSessionDirectory,
  type TaskPaneBinding } from '../terminal/task-session';
import { readSessionArtifact, writeSessionArtifact } from '../terminal/task-session-io';
import { commitPrePromptInbox, preparePrePromptInbox } from './task-pre-prompt-inbox';
import { oarObservationFile, readOarObservation } from '../terminal/task-runtime-observation';

/** A cancel without a claim writes this tombstone, so a later launch fails at its claim. */
type HostClaim = ProcessProof | { pid: null; closed: true };

/** Task bindings whose own Herdr pane is the review caller's pane. */
function paneBindings(repo: string, endpoint: HerdrEndpoint, pane: string): { dir: string; binding: TaskPaneBinding }[] {
  const base = join(taskRepository(repo).primary_root, '.ai/harness/runs/task-agents');
  if (!existsSync(base)) return [];
  const bound: { dir: string; binding: TaskPaneBinding }[] = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(base, entry.name, 'binding.json'))) continue;
    const saved = readSessionArtifact<TaskPaneBinding>(join(base, entry.name, 'binding.json'));
    if (saved.runtime !== 'herdr' || saved.pane_id !== pane || canonicalize(JSON.parse(JSON.stringify(saved.endpoint))) !== canonicalize(JSON.parse(JSON.stringify(endpoint)))
      || !isReviewRuntimeId(saved.harness_kind)) continue;
    bound.push(readTaskAgent(repo, saved.task, saved.role));
  }
  return bound;
}
// Owner inference consumes existing typed task bindings only. Interactive
// parents without a binding require an explicit --harness; never guess from TUI.
function boundOwner(repo: string, endpoint: HerdrEndpoint, pane: string): ReviewRuntimeId | null {
  const kinds = new Set<ReviewRuntimeId>();
  for (const { binding } of paneBindings(repo, endpoint, pane)) { assertTaskBinding(binding); kinds.add(binding.harness_kind as ReviewRuntimeId); }
  return kinds.size === 1 ? [...kinds][0]! : null;
}
/** An author turn without valid v3 evidence for its request is unknown; it never blocks the verdict. */
function authorTurn(path: string, request: TaskRequest, provider: ProcessProof) {
  try { return readOarObservation(path, request, provider); }
  catch (error) {
    if (/^OAR_OBSERVATION_(?:INVALID|LIMIT|IDENTITY_MISMATCH)$/.test((error as Error).message)) return null;
    throw error;
  }
}
/** The single author task session bound to the caller pane for this campaign
 * and reviewed root, and the models its OAR host observed at turn end. Every
 * ended turn counts; a missing, running or model-less turn makes the set unknown. */
function boundAuthor(repo: string, session: ReviewAuthorQuery<HerdrEndpoint>): AcceptanceAuthor | null {
  if (session.endpoint === null || session.parent_pane === null) return null;
  const bound = paneBindings(repo, session.endpoint, session.parent_pane);
  if (bound.length !== 1) return null;
  const { dir, binding } = bound[0]!;
  const identity = binding.task_admission?.identity;
  if (!identity || identity.campaign_sha256 !== session.campaign_sha256 || identity.execution_root !== session.owner_root) return null;
  const models = new Set<string>();
  let known = true;
  for (let round = 1; round <= binding.max_requests && existsSync(join(dir, `request-${round}.json`)); round++) {
    const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
    const turn = authorTurn(join(dir, oarObservationFile(round)), request, binding.provider);
    if (turn?.control === 'rejected') continue;
    if (turn?.status !== 'idle' || turn.outcome === null || turn.actual_model === null) { known = false; break; }
    models.add(turn.actual_model);
  }
  return { binding_sha256: taskBindingSha256(binding), models: known && models.size ? [...models].sort() : null };
}
async function waitHostFile(path: string, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error('review_host_deadline; inspect same launch/request');
    await Bun.sleep(25);
  }
}
/** A reused pid is not the claimed host. */
function claimedHostAlive(proof: ProcessProof): boolean {
  try { return processProofAlive(proof); }
  catch (error) { if (String(error).includes('task_agent_process_identity_lost')) return false; throw error; }
}
/** The host that claimed this control directory, after it is ready; null when
 * no host claimed it yet. Never launches or relaunches a host. */
async function terminalHostLaunched(dir: string, timeout = 60_000): Promise<ProcessProof | null> {
  const path = join(dir, 'host-claim.json');
  if (!existsSync(path)) return null;
  const claim = readSessionArtifact<HostClaim>(path);
  if (claim.pid === null) throw new Error('review_session_closing; finish the same cancel or close');
  const deadline = Date.now() + timeout;
  while (!existsSync(join(dir, 'ready.json'))) {
    if (!claimedHostAlive(claim)) throw new Error('review_host_start_failed; read the app terminal output, then run review cancel; do not launch again');
    if (Date.now() >= deadline) throw new Error('review_host_ready_timeout; run review cancel; do not launch again');
    await Bun.sleep(100);
  }
  if (readSessionArtifact<{ pid: number }>(join(dir, 'ready.json')).pid !== claim.pid) throw new Error('review_host_identity_mismatch');
  return { pid: claim.pid, identity: claim.identity };
}
function hostExecutable(): { node: string; entry: string } {
  return { node: realpathSync(process.env.REPO_HARNESS_NODE_BIN ?? Bun.which('node') ?? ''),
    entry: realpathSync(fileURLToPath(new URL('../../../dist/oar-review-host.js', import.meta.url))) };
}
/** Only the fixed Node>=24 host executes the OAR installation API. */
async function probeReviewInstallation(kind: ReviewRuntimeId, executable?: string): Promise<InstallationSnapshot> {
  const pi = kind === 'pi' ? executable ?? piExecutable() : undefined;
  if (kind === 'pi' && !pi) return { kind: 'not_found' };
  const { node, entry } = hostExecutable();
  return JSON.parse(execFileSync(node, [entry, '--installation', kind, ...(pi ? [pi] : [])], { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024,
    env: executable && kind !== 'pi' ? { ...process.env, [kind === 'codex' ? 'OAR_CODEX_BIN' : 'OAR_CLAUDE_BIN']: executable } : process.env })) as InstallationSnapshot;
}
/** Fleet owns review instructions. Pi owns its native provider/model selection. */
export function reviewSessionOptions(kind: ReviewRuntimeId, output: string, runtimeHome?: string): SessionOptions {
  const fleet = parseFrontmatter(readFileSync(fileURLToPath(new URL('../../../agents/fleet/deep-reasoner.md', import.meta.url)), 'utf8'));
  if (!fleet || !validateFrontmatter(fleet, GENERIC_REVIEW_ROLE).ok) throw new Error('review_fleet_invalid');
  const target = AGENT_TARGET_OVERRIDES[GENERIC_REVIEW_ROLE]!;
  if (kind === 'pi' && !runtimeHome) throw new Error('review_pi_agent_directory_required');
  return { cwd: output,
    ...(kind === 'pi' ? { env: { PI_CODING_AGENT_DIR: runtimeHome!, OAR_PI_AGENT_DIR: runtimeHome! } }
      : { model: kind === 'codex' ? target.model : fleet.model!, effort: kind === 'codex' ? target.effort : fleet.effort!,
        ...(kind === 'codex' && runtimeHome ? { env: { CODEX_HOME: runtimeHome } } : {}) }),
    appendSystemPrompt: `${fleet.body}\nReview communication exception: writing the final JSON once to this request's exact result_ref is the only authorized mutation. No temporary file, rename, other edits or permission workarounds. This is communication, not production editing.` };
}

/** The one reviewer runner. A Herdr or app-terminal launch is an option of each session, not a second implementation. */
export const taskReviewRunner: ReviewerRunner<TaskPaneBinding, HerdrEndpoint, TaskSessionAuthority> = {
  validateEndpoint: validateHerdrEndpoint,
  endpointHome: endpoint => endpoint?.home,
  hostCommand(specFile, terminal) {
    const { node, entry } = hostExecutable();
    const command = reviewHostCommand(node, entry, specFile);
    if (terminal) assertTerminalHostCommand(command);
    return command;
  },
  installation: probeReviewInstallation,
  sessionOptions: reviewSessionOptions,
  requestDirectory: taskSessionDirectory,
  outputDirectory: (reviewerRepo, primaryRoot, task, role) =>
    join(reviewerRepo, '.ai/harness/runs/task-agent-outbox', taskSessionDirectory(primaryRoot, task, role).split('/').pop()!),
  owner: boundOwner,
  author: boundAuthor,
  start: startTaskApplicationHost,
  bindTerminal: bindTerminalApplicationHost,
  launched: terminalHostLaunched,
  ready: waitHostFile,
  status: taskAgentStatus,
  assertBinding: assertTaskBinding,
  assertNotOwnerPane(binding, ownerPane) {
    if (binding.runtime === 'herdr' && binding.pane_id === ownerPane) throw new Error('review_must_not_reuse_owner_pane');
  },
  bindNative: bindNativeTaskSession,
  send: (repoRoot, task, role, contextRef, contextPolicy, delivery, publicationBoundary, guard, authority) =>
    sendTaskRequest(repoRoot, task, role, contextRef, contextPolicy, delivery, publicationBoundary, guard, authority,
      request => preparePrePromptInbox({ source: { authority: authority!, session: { task, role } }, request })),
  collect: collectTaskResult,
  settleCompanion: (authority, task, role, request) =>
    commitPrePromptInbox({ source: { authority, session: { task, role } }, request }).status === 'pending' ? 'pending' : 'settled',
  recoverCompanions(authority, primaryRoot, task, role, rounds) {
    // Reconcile only existing positive receipts; never resend an uncertain request.
    const dir = taskSessionDirectory(primaryRoot, task, role);
    for (let round = 1; round <= rounds; round++) {
      if (!existsSync(join(dir, `inbox-accepted-${round}.json`))) continue;
      const request = readSessionArtifact<TaskRequest>(join(dir, `request-${round}.json`));
      commitPrePromptInbox({ source: { authority, session: { task, role } }, request });
    }
  },
  async dispose(repo, task, output, terminal = false) {
    const request = join(output, 'close.request');
    if (terminal && !existsSync(join(taskSessionDirectory(repo, task, GENERIC_REVIEW_ROLE), 'binding.json'))) {
      // Unbound app-terminal host: a claimed host disposes on close.request and
      // exits. Without a claim, the tombstone makes any later launch fail first.
      // A host that began a Session and exits without disposal proof stays pending.
      if (!existsSync(request)) writeSessionArtifact(request, { close: true });
      const path = join(output, 'host-claim.json');
      try { writeSessionArtifact(path, { pid: null, closed: true }); return; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
      const claim = readSessionArtifact<HostClaim>(path);
      if (claim.pid === null) return;
      const deadline = Date.now() + 60_000;
      while (claimedHostAlive(claim)) {
        if (Date.now() >= deadline) throw new Error('review_host_cleanup_pending; the app terminal host is still running');
        await Bun.sleep(25);
      }
      if (existsSync(join(output, 'session-opening.json')) && !existsSync(join(output, 'disposed.json'))) {
        throw new Error('review_host_cleanup_pending; the host exited after it began a Session without a disposal receipt; check for a leftover reviewer process');
      }
      return;
    }
    const { binding } = readTaskAgent(repo, task, GENERIC_REVIEW_ROLE);
    if (!existsSync(request)) writeSessionArtifact(request, { close: true });
    await waitHostFile(join(output, 'disposed.json'));
    const deadline = Date.now() + 60_000;
    while (processProofAlive(binding.provider)) {
      if (Date.now() >= deadline) throw new Error('review_host_cleanup_pending; do not close pane before SDK disposal');
      await Bun.sleep(25);
    }
  },
  close: closeTaskAgent,
  cancel: cancelTaskAgent,
};
