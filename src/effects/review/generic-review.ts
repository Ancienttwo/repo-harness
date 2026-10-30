import { preparePrePromptInbox, commitPrePromptInbox } from './pre-prompt-inbox';
import { bindNativeTaskSession } from '../terminal/native-task-session';
import { osAccountHome } from '../runtime/os-account-home';
import { reviewCampaignKey } from '../../core/review/authority-context';
import type { ReviewAdmissionSource } from '../admission/admission-source';
import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, relative, resolve } from 'path';
import { userInfo } from 'os';
import { fileURLToPath } from 'url';
import { canonicalize } from '../../core/evidence/canonical-json';
import { REVIEW_MAX_ROUNDS, REVIEW_TIMEOUT_MS, validateReviewOutput, type ReviewOutput } from '../../core/review/generic-review';
import { composeReviewPacket } from '../../core/review/review-packet';
import { acquireExclusiveDirectoryLock, ExclusiveLockContentionError } from '../locking/exclusive-directory-lock';
import { validateHerdrEndpoint, type HerdrEndpoint } from '../terminal/herdr';
import { parseFrontmatter, validateFrontmatter, AGENT_TARGET_OVERRIDES } from '../terminal/task-role-profiles';
import { taskRepository } from '../git/task-repository';
import { locked, startTaskApplicationHost, bindTerminalApplicationHost, assertTerminalHostCommand, readTaskAgent, processProofAlive, sendTaskRequest, collectTaskResult, closeTaskAgent, cancelTaskAgent, taskAgentStatus,
  taskSessionDirectory, assertTaskBinding, nextSessionRound, ensureSessionDirectory,
  readSessionArtifact, writeSessionArtifact, validateTaskClaimReference, validateTaskEngineerProfile, taskBindingSha256, type TaskEngineerProfile, type TaskClaimReference, type ProcessProof, type TaskCleanupResult, type TaskPaneBinding, type TaskRequest } from '../terminal/task-session';
import { reviewIsolationPolicy, reviewHostCommand, prepareReviewLauncher, prepareCodexHome, removeCopiedAuth, preparePiAgentDirectory, removePiCredentialReferences } from './review-isolation';
import type { ReviewHostSpec, HostRoundObservation } from './oar-review-host';
import type { SessionOptions, InstallationSnapshot } from '@botiverse/oar';
import { acceptanceContext, acceptanceReviewContextDigest, authorityFingerprint, GENERIC_REVIEW_ROLE,
  projectAcceptance, recordAcceptance, verifyAcceptance, type AcceptanceAuthor, type AcceptanceReceipt } from './acceptance-receipt';
import { oarObservationFile, readOarObservation } from '../terminal/task-runtime-observation';
import { gitExecFileSync } from '../git/runner';
import { isReviewRuntimeId, type ReviewRuntimeId } from '../../core/review/review-runtimes';
import { piExecutable } from '../pi-executable';

type Harness = ReviewRuntimeId;
interface ReviewSession {
  protocol: 1;
  owner_root: string;
  campaign_sha256: string;
  task_claim: TaskClaimReference;
  engineer_profile?: TaskEngineerProfile;
  goal_sha256: string;
  task: string;
  reviewer_repo: string;
  /** Null for an app-terminal session: the Claude app operator launches the host. */
  endpoint: HerdrEndpoint | null;
  parent_pane: string | null;
  requested_harness: Harness;
  actual_harness: Harness;
  owner_harness: Harness | null;
  fallback_reason: string | null;
  control_directory: string;
  started_at: number;
}
interface RoundRecord { subject_sha256: string; context_sha256: string; task_request: TaskRequest }
export interface ReviewOptions {
  repoRoot: string;
  authority: ReviewAdmissionSource;
  taskClaim: TaskClaimReference;
  engineerProfile?: TaskEngineerProfile;
  verification?: string;
  reviewerRepo: string;
  /** Herdr launch addressing. An app-terminal launch has neither field. */
  endpoint?: HerdrEndpoint;
  parentPane?: string;
  launch?: 'herdr' | 'app-terminal';
  harness?: Harness;
  timeoutMs?: number;
  authorityHome?: string;
  admitSession: () => void;
}

function fingerprint(root: string): string {
  return authorityFingerprint(gitExecFileSync(['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
    + gitExecFileSync(['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--binary'], { cwd: root, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 }));
}
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
function boundOwner(repo: string, endpoint: HerdrEndpoint, pane: string): Harness | null {
  const kinds = new Set<Harness>();
  for (const { binding } of paneBindings(repo, endpoint, pane)) { assertTaskBinding(binding); kinds.add(binding.harness_kind as Harness); }
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
function boundAuthor(repo: string, session: ReviewSession): AcceptanceAuthor | null {
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
/** Null is an unobserved reviewer model; it grants no cross-model claim. */
function completedModel(session: ReviewSession, request: TaskRequest): string | null {
  const observation = readSessionArtifact<HostRoundObservation>(join(session.control_directory, `observed-${request.round}.json`));
  if (observation.request_id !== request.request_id || observation.kind !== 'ended' || observation.outcome !== 'completed') throw new Error('review_host_turn_unverified');
  return observation.actual_model;
}
const shellQuote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
/** A cancel without a claim writes this tombstone, so a later launch fails at its claim. */
type HostClaim = ProcessProof | { pid: null; closed: true };
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
export async function probeReviewInstallation(kind: Harness, executable?: string): Promise<InstallationSnapshot> {
  const pi = kind === 'pi' ? executable ?? piExecutable() : undefined;
  if (kind === 'pi' && !pi) return { kind: 'not_found' };
  const { node, entry } = hostExecutable();
  return JSON.parse(execFileSync(node, [entry, '--installation', kind, ...(pi ? [pi] : [])], { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024,
    env: executable && kind !== 'pi' ? { ...process.env, [kind === 'codex' ? 'OAR_CODEX_BIN' : 'OAR_CLAUDE_BIN']: executable } : process.env })) as InstallationSnapshot;
}
const runtime = { start: startTaskApplicationHost, bindTerminal: bindTerminalApplicationHost, launched: terminalHostLaunched, send: sendTaskRequest, collect: collectTaskResult, close: closeTaskAgent,
  cancel: cancelTaskAgent, status: taskAgentStatus, assertBinding: assertTaskBinding,
  owner: boundOwner, author: boundAuthor, model: completedModel, bindNative: bindNativeTaskSession,
  installation: probeReviewInstallation,
  piExecutable,
  ready: waitHostFile,
  dispose: async (repo: string, task: string, output: string, terminal = false): Promise<void> => {
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
  } };
export type ReviewEffects = Partial<typeof runtime>;

export function reviewLocation(repoRoot: string, authority: ReviewAdmissionSource) {
  const repository = taskRepository(authority.repoRoot), root = repository.execution_root;
  if (taskRepository(repoRoot).repository_id !== repository.repository_id) throw new Error('review_admission_repository_mismatch');
  const campaign = reviewCampaignKey(authority), key = campaign.slice(7);
  const dir = join(repository.primary_root, '.ai/harness/runs/generic-review', key);
  ensureSessionDirectory(repository.primary_root, dir);
  return { root, primary: repository.primary_root, campaign, key, dir };
}

function contextIdentity(context: Awaited<ReturnType<typeof acceptanceContext>>) {
  return { admission_sha256: context.admission.admission_sha256, goal_sha256: context.goal.revision,
    subject_sha256: context.subject.review_subject_sha256, verification_evidence_sha256: context.evidence.fingerprint,
    target_revision: context.subject.target_rev };
}

function sourcePacket(root: string, paths: readonly string[], target: string): string {
  const pieces = [gitExecFileSync(['diff', '--no-ext-diff', '--no-textconv', '--binary', target, '--'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })];
  for (const path of paths) {
    const file = resolve(root, path);
    if (relative(root, file).split('/').includes('..')) throw new Error('review_unsafe_subject_path');
    if (!existsSync(file)) { pieces.push(`Deleted path: ${JSON.stringify(path)}`); continue; }
    if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || !realpathSync(file).startsWith(root + '/')) throw new Error('review_unsupported_subject_entry');
    if (gitExecFileSync(['--literal-pathspecs', 'ls-files', '--', path], { cwd: root, encoding: 'utf8' }).trim()) continue;
    if (lstatSync(file).size > 8 * 1024 * 1024) throw new Error('review_subject_too_large');
    pieces.push(`Complete untracked file ${JSON.stringify(path)}:\n${new TextDecoder('utf8', { fatal: true }).decode(readFileSync(file))}`);
  }
  return pieces.join('\n');
}

/** Fleet owns review instructions. Pi owns its native provider/model selection. */
export function reviewSessionOptions(kind: Harness, output: string, runtimeHome?: string): SessionOptions {
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

export interface ReviewLaunchRequired {
  status: 'launch_required'; round: number; requested_harness: Harness; actual_harness: Harness; fallback_reason: string | null;
  cwd: string; argv: string[]; command: string;
}
export interface ReviewRoundResult {
  status: 'accepted' | 'rejected'; round: number; output: ReviewOutput; receipt: AcceptanceReceipt; projection: string;
  requested_harness: Harness; actual_harness: Harness; fallback_reason: string | null;
}
/** Only an app-terminal launch can end a call before delivery, with the host command to run. */
export function runReviewRound(options: ReviewOptions & { launch?: 'herdr' }, effects?: ReviewEffects): Promise<ReviewRoundResult>;
export function runReviewRound(options: ReviewOptions, effects?: ReviewEffects): Promise<ReviewRoundResult | ReviewLaunchRequired>;
export async function runReviewRound(options: ReviewOptions, effects: ReviewEffects = {}): Promise<ReviewRoundResult | ReviewLaunchRequired> {
  const taskClaim = validateTaskClaimReference(options.taskClaim);
  const engineerProfile = validateTaskEngineerProfile(options.authority.repoRoot, options.engineerProfile);
  const taskAuthority = { source: options.authority, claim: taskClaim, ...(engineerProfile ? { engineer_profile: engineerProfile } : {}) };
  const terminal = options.launch === 'app-terminal';
  if (terminal ? options.endpoint || options.parentPane : !options.endpoint || !options.parentPane) throw new Error('review_launch_addressing_invalid');
  if (!terminal) validateHerdrEndpoint(options.endpoint!);
  const endpoint = options.endpoint ?? null, parentPane = options.parentPane ?? null;
  const client = { ...runtime, ...effects };
  const { root, primary, campaign, key, dir } = reviewLocation(options.repoRoot, options.authority);
  const lock = acquireExclusiveDirectoryLock(primary, relative(primary, join(dir, 'caller.lock')), { waitTimeoutMs: 1, reclaimStaleOwner: true });
  let authOutput: string | undefined;
  let piOutput: string | undefined;
  try {
    if (existsSync(join(dir, 'closed.json'))) throw new Error('review_session_closed');
    if (existsSync(join(dir, 'close.request'))) throw new Error('review_session_closing; finish the same cancel or close');
    // Refuse an unusable terminal command before any session admission.
    if (terminal) { const host = hostExecutable(); assertTerminalHostCommand(reviewHostCommand(host.node, host.entry, join(dir, 'host.json'))); }
    const reviewerRepo = realpathSync(options.reviewerRepo);
    if (reviewerRepo === root || reviewerRepo === primary || taskRepository(reviewerRepo).repository_id !== taskRepository(root).repository_id) throw new Error('review_requires_dedicated_linked_checkout');
    const timeout = options.timeoutMs ?? REVIEW_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > REVIEW_TIMEOUT_MS) throw new Error('review_invalid_timeout');
    if (!options.verification) throw new Error('review_requires_explicit_verification_report');
    const context = await acceptanceContext({ root, authority: options.authority, verification: options.verification! });
    const identity = contextIdentity(context);
    let session: ReviewSession;
    if (existsSync(join(dir, 'session.json'))) {
      session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
      if (session.protocol !== 1 || session.owner_root !== root || session.campaign_sha256 !== campaign
        || JSON.stringify(session.task_claim) !== JSON.stringify(taskClaim)
        || canonicalize(JSON.parse(JSON.stringify(session.engineer_profile ?? null))) !== canonicalize(JSON.parse(JSON.stringify(engineerProfile ?? null)))
        || session.reviewer_repo !== reviewerRepo || canonicalize(JSON.parse(JSON.stringify(session.endpoint))) !== canonicalize(JSON.parse(JSON.stringify(endpoint)))
        || session.control_directory !== dir || session.parent_pane !== parentPane || (options.harness && options.harness !== session.actual_harness)) throw new Error('review_session_spec_changed');
    } else {
      // An app-terminal launch exists only for an operator in the Claude app, so that session owns the work.
      const owner = options.harness ? null : terminal ? 'claude' : client.owner(root, endpoint!, parentPane!);
      if (!options.harness && !owner) throw new Error('review_owner_unknown; specify --harness');
      const requested = options.harness ?? (owner === 'claude' ? 'codex' : 'claude');
      if (!isReviewRuntimeId(requested)) throw new Error('review_harness_unsupported');
      let actual = requested; let reason: string | null = null;
      const installed = await client.installation(actual);
      if (installed.kind !== 'available') {
        if (installed.kind !== 'not_found' || options.harness || !owner || owner === 'pi'
          || (await client.installation(owner)).kind !== 'available') throw new Error('review_provider_executable_missing_or_unsupported');
        actual = owner; reason = `${requested} executable missing before start`;
        console.error(`Review fallback: ${reason}; actual harness=${actual}.`);
      }
      options.admitSession();
      session = { protocol: 1, owner_root: root, campaign_sha256: campaign, task_claim: taskClaim, ...(engineerProfile ? { engineer_profile: engineerProfile } : {}), goal_sha256: identity.goal_sha256, task: key, reviewer_repo: reviewerRepo,
        endpoint, parent_pane: parentPane, requested_harness: requested, actual_harness: actual,
        owner_harness: owner, fallback_reason: reason, control_directory: dir, started_at: Date.now() };
      writeSessionArtifact(join(dir, 'session.json'), session);
    }
    // Reconcile only existing positive receipts; never resend an uncertain request.
    const previousTaskDir = taskSessionDirectory(primary, session.task, GENERIC_REVIEW_ROLE);
    for (let priorRound = 1; priorRound <= REVIEW_MAX_ROUNDS; priorRound++) {
      if (!existsSync(join(previousTaskDir, `inbox-accepted-${priorRound}.json`))) continue;
      const prior = readSessionArtifact<TaskRequest>(join(previousTaskDir, `request-${priorRound}.json`));
      commitPrePromptInbox({ source: { authority: taskAuthority, session: { task: session.task, role: GENERIC_REVIEW_ROLE } }, request: prior });
    }
    const contextDigest = acceptanceReviewContextDigest(context);
    const round = nextSessionRound<RoundRecord>(dir, REVIEW_MAX_ROUNDS, contextDigest, previous => previous.context_sha256);
    const previous = round > 1 ? readSessionArtifact<{ output: ReviewOutput }>(join(dir, `accepted-${round - 1}.json`)).output.findings : [];
    const packet = composeReviewPacket({ context_sha256: contextDigest, subject_sha256: identity.subject_sha256,
      actual_harness: session.actual_harness, actual_role: GENERIC_REVIEW_ROLE, prior_findings: previous,
      admission: JSON.stringify(context.admission), goal: context.goal.content, verification: context.verification.content,
      source: sourcePacket(root, context.subject.paths, context.subject.target_rev) });
    const inputDir = join(reviewerRepo, '.ai/harness/runs/generic-review-input', key);
    ensureSessionDirectory(reviewerRepo, inputDir);
    const packetPath = join(inputDir, `packet-${round}.txt`);
    if (!existsSync(packetPath)) writeFileSync(packetPath, packet, { flag: 'wx', mode: 0o600 });
    else if (readFileSync(packetPath, 'utf8') !== packet) {
      // A failed start does not consume a round. Preserve its packet even when
      // the launch outcome is unknown; do not replace it or start another pane.
      throw new Error(`review_packet_changed_before_send; packet for round ${round} is preserved. Inspect with repo-harness review status --repo ${shellQuote(root)} --campaign-id ${shellQuote(options.authority.campaign_id)} --json; restore the original subject and verification before retrying the same review round.`);
    }
    const taskDir = taskSessionDirectory(primary, session.task, GENERIC_REVIEW_ROLE);
    const outbox = join(reviewerRepo, '.ai/harness/runs/task-agent-outbox', taskDir.split('/').pop()!);
    ensureSessionDirectory(reviewerRepo, outbox);
    let runtimeHome: string | undefined;
    if (session.actual_harness === 'codex') {
      authOutput = outbox;
      const marker = join(dir, 'auth-copy.json');
      const prepared = prepareCodexHome(outbox, options.endpoint?.home ?? process.env.HOME ?? userInfo().homedir, timeout * REVIEW_MAX_ROUNDS + 120_000, existsSync(marker));
      runtimeHome = prepared.home;
      if (!existsSync(marker)) writeSessionArtifact(marker, { auth_copied: true, mode: prepared.mode });
    }
    if (session.actual_harness === 'pi') {
      piOutput = outbox;
      runtimeHome = preparePiAgentDirectory(outbox, options.endpoint?.home ?? process.env.HOME ?? userInfo().homedir);
    }
    // Isolation admission precedes any SDK/native Session creation.
    const repository = taskRepository(root);
    const isolationPaths = { subject: root, primary, ownerRecord: dir, journal: dir,
      gitCommonDir: repository.repository_id, output: outbox,
      ...(session.actual_harness === 'pi' ? { piAgentDirectory: runtimeHome } : {}) };
    const policy = reviewIsolationPolicy(isolationPaths);
    const profilePath = join(dir, 'isolation.sb');
    if (!existsSync(profilePath)) writeFileSync(profilePath, policy, { flag: 'wx', mode: 0o600 });
    else if (readFileSync(profilePath, 'utf8') !== policy) throw new Error('review_isolation_changed');
    const specPath = join(dir, 'host.json');
    if (!existsSync(specPath)) {
      const installation = await client.installation(session.actual_harness);
      if (installation.kind !== 'available') throw new Error('review_provider_executable_missing_or_unsupported');
      if (session.actual_harness === 'pi' ? installation.via !== 'bundled' : installation.via !== 'executable') throw new Error('review_provider_executable_required');
      const vendorExecutable = session.actual_harness === 'pi' ? client.piExecutable() : installation.via === 'executable' ? installation.command : null;
      if (!vendorExecutable) throw new Error('review_provider_executable_missing_or_unsupported');
      const launcher = prepareReviewLauncher(dir, profilePath, vendorExecutable);
      const isolatedInstallation = await client.installation(session.actual_harness, launcher);
      if (isolatedInstallation.kind !== 'available' || (session.actual_harness === 'pi'
        ? isolatedInstallation.via !== 'bundled' : isolatedInstallation.via !== 'executable' || isolatedInstallation.command !== launcher)) {
        throw new Error('review_isolated_installation_unverified');
      }
      const spec: ReviewHostSpec = { mode: 'review', isolation: { paths: isolationPaths, policyFile: profilePath }, kind: session.actual_harness,
        installation: isolatedInstallation, launcher, vendorExecutable: realpathSync(vendorExecutable),
        options: reviewSessionOptions(session.actual_harness, outbox, runtimeHome), requestDirectory: taskDir, output: outbox, controlDirectory: dir, timeoutMs: timeout };
      writeSessionArtifact(specPath, spec);
    }
    const { node, entry: hostEntry } = hostExecutable();
    const command = reviewHostCommand(node, hostEntry, specPath);
    let binding: TaskPaneBinding;
    if (session.endpoint === null) {
      const bound = await client.bindTerminal(reviewerRepo, { task: session.task, role: GENERIC_REVIEW_ROLE, harness_kind: session.actual_harness,
        max_requests: REVIEW_MAX_ROUNDS }, command, () => client.launched(dir), taskAuthority);
      // Nothing was sent. The operator runs the command once in an app terminal, then repeats this round.
      if (!bound) {
        const launch: ReviewLaunchRequired = { status: 'launch_required', round, requested_harness: session.requested_harness, actual_harness: session.actual_harness,
          fallback_reason: session.fallback_reason, cwd: reviewerRepo, argv: [...command], command: command.map(shellQuote).join(' ') };
        return launch;
      }
      binding = bound;
    } else {
      binding = await client.start(reviewerRepo, { task: session.task, role: GENERIC_REVIEW_ROLE, harness_kind: session.actual_harness,
        endpoint: session.endpoint, parent_pane: session.parent_pane!, args: [], max_requests: REVIEW_MAX_ROUNDS },
        command, () => client.ready(join(dir, 'ready.json')), undefined, taskAuthority);
    }
    client.assertBinding(binding);
    client.bindNative({ repo_root: reviewerRepo, binding, ready_path: join(dir, 'ready.json') });
    if (binding.runtime === 'herdr' && binding.pane_id === session.parent_pane) throw new Error('review_must_not_reuse_owner_pane');
    const recheck = await acceptanceContext({ root, authority: options.authority, verification: options.verification! });
    if (acceptanceReviewContextDigest(recheck) !== contextDigest) throw new Error('review_context_changed_before_submit');
    const before = [fingerprint(root), fingerprint(reviewerRepo)];
    if (existsSync(join(dir, 'close.request'))) throw new Error('review_round_cancelled; no request sent');
    lock.assertOwned();
    // Write intent before send; an unknown delivery must never allocate another round.
    writeSessionArtifact(join(dir, `request-${round}.json`), { ...identity, context_sha256: contextDigest, task_request: null });
    const request = await client.send(reviewerRepo, session.task, GENERIC_REVIEW_ROLE, relative(reviewerRepo, packetPath), 'repeatable',
      request => client.ready(join(dir, `ack-${request.round}.json`)), undefined, undefined, taskAuthority,
      request => preparePrePromptInbox({ source: { authority: taskAuthority, session: { task: session.task, role: GENERIC_REVIEW_ROLE } }, request }));
    writeSessionArtifact(join(dir, `delivery-${round}.json`), { ...identity, context_sha256: contextDigest, task_request: request });
    const deadline = Date.now() + timeout;
    let collected;
    let bindingCheckedAt = 0;
    let inboxSettled = false;
    const commitInbox = () => commitPrePromptInbox({ source: { authority: taskAuthority, session: { task: session.task, role: GENERIC_REVIEW_ROLE } }, request }).status !== 'pending';
    for (;;) {
      if (!inboxSettled) inboxSettled = commitInbox();
      // A cancel request wins over a pending Result; the final decision is the
      // re-check below, after the loop, before any acceptance is recorded.
      if (existsSync(join(dir, 'close.request'))) throw new Error('review_round_cancelled; no acceptance recorded');
      // The host writes observed after the turn ends, and the reviewer writes
      // the Result during the turn. A missing Result at this point is final.
      if (existsSync(join(dir, `observed-${request.round}.json`))) {
        collected = await client.collect(reviewerRepo, session.task, GENERIC_REVIEW_ROLE, request.round, undefined, taskAuthority);
        if (!collected) throw new Error('review_result_missing; inspect the same request; do not resend');
        break;
      }
      // Binding identity costs several Herdr and ps calls; check it once per second.
      if (Date.now() - bindingCheckedAt >= 1000) { client.assertBinding(binding); bindingCheckedAt = Date.now(); }
      lock.assertOwned();
      if (Date.now() >= deadline) throw new Error('review_round_timeout; inspect the same request; do not resend');
      await Bun.sleep(100);
    }
    // The host can write its inbox receipt after this round's commit check and
    // before its observed check. Commit that delivery under this round's grant now.
    if (!inboxSettled) commitInbox();
    // Linearization point for accept-versus-cancel: the Result is collected
    // and observed, and no acceptance exists yet. A request written after this
    // read cannot un-record the acceptance below, so closeReview reports it to
    // the cancel caller instead.
    if (existsSync(join(dir, 'close.request'))) throw new Error('review_round_cancelled; no acceptance recorded');
    if (before[0] !== fingerprint(root) || before[1] !== fingerprint(reviewerRepo)) throw new Error('review_worktree_mutated');
    const model = client.model(session, request);
    if (!collected.value || typeof collected.value !== 'object' || Array.isArray(collected.value)
      || Object.keys(collected.value).sort().join(',') !== 'context_sha256,findings,request_id,subject_sha256,summary,verdict') throw new Error('review_malformed_provider_value');
    const output = validateReviewOutput({ ...collected.value, actual_harness: session.actual_harness, actual_role: GENERIC_REVIEW_ROLE, actual_model: model }, { request_id: request.request_id, context_sha256: contextDigest,
      subject_sha256: identity.subject_sha256, actual_harness: session.actual_harness, actual_role: GENERIC_REVIEW_ROLE, actual_model: model }, previous);
    const findings = output.findings.filter(finding => finding.status !== 'resolved').map(({ severity, message }) => ({ severity, message }));
    const reviewResult = { ...output, findings };
    const reviewer = session.actual_harness === 'pi' ? 'Pi' : session.actual_harness === 'codex' ? 'Codex' : 'Claude';
    const receipt = await recordAcceptance({ root, authorityHome: options.authorityHome ?? osAccountHome(), authority: options.authority,
      verification: options.verification!, expectedContext: identity,
      disposition: output.verdict === 'PASS' ? 'external_pass' : 'reject', reviewer, source: 'generic-review', actor: null,
      summary: output.summary, findings, reviewResult, author: client.author(root, session) });
    writeSessionArtifact(join(dir, `accepted-${round}.json`), { output, receipt });
    const projection = join(dir, 'acceptance.review.md');
    if (!existsSync(projection)) writeFileSync(projection, '# Acceptance Review\n\n', { flag: 'wx', mode: 0o600 });
    projectAcceptance(projection, receipt);
    return { status: output.verdict === 'PASS' ? 'accepted' as const : 'rejected' as const, round, output, receipt,
      projection, requested_harness: session.requested_harness, actual_harness: session.actual_harness, fallback_reason: session.fallback_reason };
  } catch (error) {
    if (authOutput && removeCopiedAuth(authOutput).status === 'cleanup_pending') throw new Error('cleanup_pending: review_auth_copy_delete_failed');
    if (piOutput && removePiCredentialReferences(piOutput).status === 'cleanup_pending') throw new Error('cleanup_pending: review_pi_credential_cleanup_failed');
    throw error;
  } finally { lock.release(); }
}

export function reviewStatus(repoRoot: string, authority: ReviewAdmissionSource, effects: ReviewEffects = {}) {
  const { dir } = reviewLocation(repoRoot, authority);
  if (!existsSync(join(dir, 'session.json'))) return { status: 'absent' };
  const session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
  return { ...session, lifecycle: ({ ...runtime, ...effects }).status(session.reviewer_repo, session.task, GENERIC_REVIEW_ROLE),
    status: existsSync(join(dir, 'closed.json')) ? 'closed' : 'open',
    rounds: Array.from({ length: REVIEW_MAX_ROUNDS }, (_, index) => index + 1).filter(round => existsSync(join(dir, `request-${round}.json`)))
      .map(round => ({ round, receipt_saved: existsSync(join(dir, `accepted-${round}.json`)) })) };
}

function acceptedRounds(dir: string): number[] {
  return Array.from({ length: REVIEW_MAX_ROUNDS }, (_, index) => index + 1).filter(round => existsSync(join(dir, `accepted-${round}.json`)));
}

/** Covers the round's 60 s host acknowledgement wait before it sees the
 * cancel. Round-1 admission and host start can hold the lock longer
 * than this bound; a timed-out cancel must be run again. */
const REVIEW_CANCEL_LOCK_WAIT_MS = 90_000;
export async function closeReview(repoRoot: string, authority: ReviewAdmissionSource, cancel = false, authorityHome = osAccountHome(),
  effects: ReviewEffects = {}) {
  const { dir, primary, root } = reviewLocation(repoRoot, authority);
  // An active round holds caller.lock until it ends. Cancel first publishes the
  // durable close request, which the round and the OAR host both observe, and
  // then waits for the lock so receipt and cleanup publication stay serialized.
  if (cancel && existsSync(join(dir, 'session.json')) && !existsSync(join(dir, 'closed.json'))) {
    try { writeSessionArtifact(join(dir, 'close.request'), { close: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  let authOutput: string | undefined;
  let piOutput: string | undefined;
  try {
    return await locked(primary, dir, async () => {
      if (existsSync(join(dir, 'session.json'))) {
        const owned = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
        if (owned.actual_harness === 'codex' || owned.actual_harness === 'pi') {
          const output = join(owned.reviewer_repo, '.ai/harness/runs/task-agent-outbox', taskSessionDirectory(primary, owned.task, GENERIC_REVIEW_ROLE).split('/').pop()!);
          if (owned.actual_harness === 'codex') authOutput = output;
          else piOutput = output;
        }
      }
      if (existsSync(join(dir, 'closed.json'))) return readSessionArtifact<{ cleanup: TaskCleanupResult }>(join(dir, 'closed.json')).cleanup;
      const session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
      if (!cancel) {
        const receipt = await verifyAcceptance({ root, authorityHome, authority });
        const completed = acceptedRounds(dir);
        if (!completed.length) throw new Error('review_no_accepted_round');
        const last = readSessionArtifact<{ output: ReviewOutput; receipt: AcceptanceReceipt }>(join(dir, `accepted-${completed.at(-1)}.json`));
        if (last.output.verdict !== 'PASS' || JSON.stringify(last.receipt) !== JSON.stringify(receipt)) throw new Error('review_acceptance_mismatch');
      }
      const client = { ...runtime, ...effects };
      // An ambiguous launch without a disposal acknowledgement remains pending;
      // never kill a host whose OAR children may still be alive.
      await client.dispose(session.reviewer_repo, session.task, session.control_directory, session.endpoint === null);
      const cleanup = await (cancel ? client.cancel : client.close)(session.reviewer_repo, session.task, GENERIC_REVIEW_ROLE);
      // The round's final close.request read is not atomic with the acceptance
      // write. A cancel that lands in that window still closes the session,
      // and the durable receipt is reported here rather than discarded.
      const accepted = cancel ? acceptedRounds(dir) : [];
      const piCredentials = piOutput;
      piOutput = undefined;
      if (piCredentials && removePiCredentialReferences(piCredentials).status === 'cleanup_pending') throw new Error('cleanup_pending: review_pi_credential_cleanup_failed');
      if (cleanup.status === 'closed') writeSessionArtifact(join(dir, 'closed.json'), { cancelled: cancel, cleanup, ...(accepted.length ? { accepted_rounds: accepted } : {}) });
      return accepted.length ? { ...cleanup, accepted_rounds: accepted } : cleanup;
    }, undefined, cancel ? REVIEW_CANCEL_LOCK_WAIT_MS : 0);
  } catch (error) {
    if (cancel && error instanceof ExclusiveLockContentionError && error.kind === 'timeout') {
      throw new Error('review_cancel_pending; close.request is durable; run cancel again', { cause: error });
    }
    throw error;
  } finally {
    if (authOutput && removeCopiedAuth(authOutput).status === 'cleanup_pending') throw new Error('cleanup_pending: review_auth_copy_delete_failed');
    if (piOutput && removePiCredentialReferences(piOutput).status === 'cleanup_pending') throw new Error('cleanup_pending: review_pi_credential_cleanup_failed');
  }
}
