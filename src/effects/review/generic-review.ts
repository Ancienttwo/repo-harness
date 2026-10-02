import { existsSync, lstatSync, readFileSync, realpathSync, readdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { isAbsolute, join, relative, resolve } from 'path';
import { userInfo } from 'os';
import { fileURLToPath } from 'url';
import { canonicalize } from '../../core/evidence/canonical-json';
import { markdownHeader } from '../../core/state/artifact-parsers';
import { REVIEW_MAX_ROUNDS, REVIEW_TIMEOUT_MS, validateReviewOutput, type ReviewOutput } from '../../core/review/generic-review';
import { acquireExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { validateHerdrEndpoint, type HerdrEndpoint } from '../terminal/herdr';
import { parseFrontmatter, validateFrontmatter, AGENT_TARGET_OVERRIDES } from '../terminal/task-role-profiles';
import { taskRepository } from '../terminal/task-worktree';
import { startTaskApplicationHost, readTaskAgent, processProofAlive, sendTaskRequest, collectTaskResult, closeTaskAgent, cancelTaskAgent, taskAgentStatus,
  taskSessionDirectory, assertTaskBinding, nextSessionRound, ensureSessionDirectory,
  readSessionArtifact, writeSessionArtifact, type TaskCleanupResult, type TaskRequest } from '../terminal/task-session';
import { reviewIsolationPolicy, isolatedHostCommand } from './review-isolation';
import type { ReviewHostSpec, HostRoundObservation } from './oar-review-host';
import type { SessionOptions, InstallationSnapshot } from '@botiverse/oar';
import { acceptanceContext, acceptanceReviewContextDigest, authorityFingerprint, GENERIC_REVIEW_ROLE,
  projectAcceptance, recordAcceptance, verifyAcceptance, type AcceptanceReceipt } from '../../../scripts/acceptance-receipt';

type Harness = 'claude' | 'codex';
interface ReviewSession {
  protocol: 1;
  owner_root: string;
  contract_sha256: string;
  goal_sha256: string;
  task: string;
  reviewer_repo: string;
  endpoint: HerdrEndpoint;
  parent_pane: string;
  requested_harness: Harness;
  actual_harness: Harness;
  owner_harness: Harness | null;
  fallback_reason: string | null;
  started_at: number;
}
interface RoundRecord { subject_sha256: string; context_sha256: string; task_request: TaskRequest }
export interface ReviewOptions {
  repoRoot: string;
  contract: string;
  verification?: string;
  reviewerRepo: string;
  endpoint: HerdrEndpoint;
  parentPane: string;
  harness?: Harness;
  timeoutMs?: number;
  authorityHome?: string;
  admitSession: () => void;
}

function fingerprint(root: string): string {
  return authorityFingerprint(execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
    + execFileSync('git', ['diff', 'HEAD', '--no-ext-diff', '--no-textconv', '--binary'], { cwd: root, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 }));
}
// Owner inference consumes existing typed task bindings only. Interactive
// parents without a binding require an explicit --harness; never guess from TUI.
function boundOwner(repo: string, endpoint: HerdrEndpoint, pane: string): Harness | null {
  const base = join(taskRepository(repo).primary_root, '.ai/harness/runs/task-agents');
  if (!existsSync(base)) return null;
  const kinds = new Set<Harness>();
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || !existsSync(join(base, entry.name, 'binding.json'))) continue;
    const saved = readSessionArtifact<import('../terminal/task-session').TaskPaneBinding>(join(base, entry.name, 'binding.json'));
    if (saved.pane_id !== pane || canonicalize(JSON.parse(JSON.stringify(saved.endpoint))) !== canonicalize(JSON.parse(JSON.stringify(endpoint)))
      || !['claude', 'codex'].includes(saved.harness_kind)) continue;
    const { binding } = readTaskAgent(repo, saved.task, saved.role);
    assertTaskBinding(binding); kinds.add(binding.harness_kind as Harness);
  }
  return kinds.size === 1 ? [...kinds][0]! : null;
}
async function waitHostFile(path: string, timeout = 60_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error('review_host_deadline; inspect same launch/request');
    await Bun.sleep(25);
  }
}
function completedModel(session: ReviewSession, request: TaskRequest): string {
  const observation = readSessionArtifact<HostRoundObservation>(join(resolve(request.result_ref, '..'), `observed-${request.round}.json`));
  if (observation.request_id !== request.request_id || observation.kind !== 'ended' || observation.outcome !== 'completed') throw new Error('review_host_turn_unverified');
  // Init-only Claude projection cannot certify the actual gateway backend.
  if (session.actual_harness === 'claude' || !observation.actual_model) throw new Error('review_actual_model_unverified');
  return observation.actual_model;
}
function hostExecutable(): { node: string; entry: string } {
  return { node: realpathSync(process.env.REPO_HARNESS_NODE_BIN ?? Bun.which('node') ?? ''),
    entry: realpathSync(fileURLToPath(new URL('../../../dist/oar-review-host.js', import.meta.url))) };
}
/** Only the fixed Node>=24 host executes the OAR installation API. */
export async function probeReviewInstallation(kind: Harness): Promise<InstallationSnapshot> {
  const { node, entry } = hostExecutable();
  return JSON.parse(execFileSync(node, [entry, '--installation', kind], { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024 })) as InstallationSnapshot;
}
const runtime = { start: startTaskApplicationHost, send: sendTaskRequest, collect: collectTaskResult, close: closeTaskAgent,
  cancel: cancelTaskAgent, status: taskAgentStatus, assertBinding: assertTaskBinding,
  owner: boundOwner, model: completedModel,
  installation: probeReviewInstallation,
  ready: waitHostFile,
  dispose: async (repo: string, task: string, output: string): Promise<void> => {
    const { binding } = readTaskAgent(repo, task, GENERIC_REVIEW_ROLE);
    const request = join(output, 'close.request');
    if (!existsSync(request)) writeSessionArtifact(request, { close: true });
    await waitHostFile(join(output, 'disposed.json'));
    const deadline = Date.now() + 60_000;
    while (processProofAlive(binding.provider)) {
      if (Date.now() >= deadline) throw new Error('review_host_cleanup_pending; do not close pane before SDK disposal');
      await Bun.sleep(25);
    }
  } };
export type ReviewEffects = Partial<typeof runtime>;

export function reviewLocation(repoRoot: string, contractPath: string) {
  const repository = taskRepository(repoRoot);
  const root = repository.execution_root;
  const contract = relative(root, resolve(root, contractPath));
  if (isAbsolute(contract) || contract.split('/').includes('..') || !contract.startsWith('tasks/contracts/') || !contract.endsWith('.contract.md')) {
    throw new Error('review_invalid_contract_path');
  }
  const key = createHash('sha256').update(contract).digest('hex');
  const dir = join(repository.primary_root, '.ai/harness/runs/generic-review', key);
  ensureSessionDirectory(repository.primary_root, dir);
  return { root, primary: repository.primary_root, contract, key, dir };
}

function contextIdentity(context: Awaited<ReturnType<typeof acceptanceContext>>) {
  return { contract_sha256: authorityFingerprint(context.contract.content), goal_sha256: authorityFingerprint(context.goal.content),
    subject_sha256: context.subject.review_subject_sha256, verification_evidence_sha256: context.evidence.fingerprint,
    target_revision: context.subject.target_rev };
}

function sourcePacket(root: string, paths: readonly string[], target: string): string {
  const pieces = [execFileSync('git', ['diff', '--no-ext-diff', '--no-textconv', '--binary', target, '--'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })];
  for (const path of paths) {
    const file = resolve(root, path);
    if (relative(root, file).split('/').includes('..')) throw new Error('review_unsafe_subject_path');
    if (!existsSync(file)) { pieces.push(`Deleted path: ${JSON.stringify(path)}`); continue; }
    if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || !realpathSync(file).startsWith(root + '/')) throw new Error('review_unsupported_subject_entry');
    if (execFileSync('git', ['--literal-pathspecs', 'ls-files', '--', path], { cwd: root, encoding: 'utf8' }).trim()) continue;
    if (lstatSync(file).size > 8 * 1024 * 1024) throw new Error('review_subject_too_large');
    pieces.push(`Complete untracked file ${JSON.stringify(path)}:\n${new TextDecoder('utf8', { fatal: true }).decode(readFileSync(file))}`);
  }
  return pieces.join('\n');
}

/** Model/effort come from the existing fleet; vendor argv belongs to OAR. */
export function reviewSessionOptions(kind: Harness, output: string): SessionOptions {
  const fleet = parseFrontmatter(readFileSync(fileURLToPath(new URL('../../../agents/fleet/deep-reasoner.md', import.meta.url)), 'utf8'));
  if (!fleet || !validateFrontmatter(fleet, GENERIC_REVIEW_ROLE).ok) throw new Error('review_fleet_invalid');
  const target = AGENT_TARGET_OVERRIDES[GENERIC_REVIEW_ROLE]!;
  return { cwd: output, model: kind === 'codex' ? target.model : fleet.model!, effort: kind === 'codex' ? target.effort : fleet.effort!,
    appendSystemPrompt: `${fleet.body}\nReview communication exception: writing the final JSON once to this request's exact result_ref is the only authorized mutation. No temporary file, rename, other edits or permission workarounds. This is communication, not production editing.` };
}

export async function runReviewRound(options: ReviewOptions, effects: ReviewEffects = {}) {
  validateHerdrEndpoint(options.endpoint);
  const client = { ...runtime, ...effects };
  const { root, primary, contract, key, dir } = reviewLocation(options.repoRoot, options.contract);
  const lock = acquireExclusiveDirectoryLock(primary, relative(primary, join(dir, 'caller.lock')), { waitTimeoutMs: 1, reclaimStaleOwner: true });
  try {
    if (existsSync(join(dir, 'closed.json'))) throw new Error('review_session_closed');
    const legacyDir = join(root, '.ai/harness/runs/claude-review', createHash('sha256').update(contract).digest('hex'));
    const legacySessionOpen = existsSync(join(legacyDir, 'session.json')) && !existsSync(join(legacyDir, 'closed.json'));
    const legacyServerPending = (existsSync(join(legacyDir, 'server.json')) || existsSync(join(legacyDir, 'server-start-intent.json')))
      && !existsSync(join(legacyDir, 'server-closed.json'));
    if (legacySessionOpen || legacyServerPending) throw new Error('review_legacy_drain_required; drain with the previous version before cutover');
    const reviewerRepo = realpathSync(options.reviewerRepo);
    if (reviewerRepo === root || reviewerRepo === primary || taskRepository(reviewerRepo).repository_id !== taskRepository(root).repository_id) throw new Error('review_requires_dedicated_linked_checkout');
    const timeout = options.timeoutMs ?? REVIEW_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > REVIEW_TIMEOUT_MS) throw new Error('review_invalid_timeout');
    const context = await acceptanceContext({ root, contract, verification: options.verification ?? '.ai/harness/checks/latest.json' });
    const identity = contextIdentity(context);
    let session: ReviewSession;
    if (existsSync(join(dir, 'session.json'))) {
      session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
      if (session.protocol !== 1 || session.owner_root !== root || session.contract_sha256 !== identity.contract_sha256 || session.goal_sha256 !== identity.goal_sha256
        || session.reviewer_repo !== reviewerRepo || canonicalize(JSON.parse(JSON.stringify(session.endpoint))) !== canonicalize(JSON.parse(JSON.stringify(options.endpoint)))
        || session.parent_pane !== options.parentPane || (options.harness && options.harness !== session.actual_harness)) throw new Error('review_session_spec_changed');
    } else {
      const owner = options.harness ? null : client.owner(root, options.endpoint, options.parentPane);
      if (!options.harness && !owner) throw new Error('review_owner_unknown; specify --harness');
      const requested = options.harness ?? (owner === 'claude' ? 'codex' : 'claude');
      if (!['claude', 'codex'].includes(requested)) throw new Error('review_harness_unsupported');
      let actual = requested; let reason: string | null = null;
      const installed = await client.installation(actual);
      if (installed.kind !== 'available') {
        if (installed.kind !== 'not_found' || options.harness || !owner
          || (await client.installation(owner)).kind !== 'available') throw new Error('review_provider_executable_missing_or_unsupported');
        actual = owner; reason = `${requested} executable missing before start`;
        console.error(`Review fallback: ${reason}; actual harness=${actual}.`);
      }
      options.admitSession();
      session = { protocol: 1, owner_root: root, contract_sha256: identity.contract_sha256, goal_sha256: identity.goal_sha256, task: `review-${key.slice(0, 32)}`, reviewer_repo: reviewerRepo,
        endpoint: options.endpoint, parent_pane: options.parentPane, requested_harness: requested, actual_harness: actual,
        owner_harness: owner, fallback_reason: reason, started_at: Date.now() };
      writeSessionArtifact(join(dir, 'session.json'), session);
    }
    const round = nextSessionRound<RoundRecord>(dir, REVIEW_MAX_ROUNDS, identity.subject_sha256, previous => previous.subject_sha256);
    const inputDir = join(reviewerRepo, '.ai/harness/runs/generic-review-input', key);
    ensureSessionDirectory(reviewerRepo, inputDir);
    const taskDir = taskSessionDirectory(primary, session.task, GENERIC_REVIEW_ROLE);
    const outbox = join(reviewerRepo, '.ai/harness/runs/task-agent-outbox', taskDir.split('/').pop()!);
    ensureSessionDirectory(reviewerRepo, outbox);
    // Isolation admission precedes any SDK/native Session creation.
    const repository = taskRepository(root);
    const isolationPaths = { subject: root, primary, ownerRecord: resolve(root, contract), journal: dir,
      gitCommonDir: repository.repository_id, output: outbox };
    const policy = reviewIsolationPolicy(isolationPaths);
    const profilePath = join(dir, 'isolation.sb');
    if (!existsSync(profilePath)) writeFileSync(profilePath, policy, { flag: 'wx', mode: 0o600 });
    else if (readFileSync(profilePath, 'utf8') !== policy) throw new Error('review_isolation_changed');
    const specPath = join(dir, 'host.json');
    if (!existsSync(specPath)) {
      const installation = await client.installation(session.actual_harness);
      if (installation.kind !== 'available') throw new Error('review_provider_executable_missing_or_unsupported');
      const spec: ReviewHostSpec = { mode: 'review', isolation: { paths: isolationPaths, policyFile: profilePath }, kind: session.actual_harness, installation,
        options: reviewSessionOptions(session.actual_harness, outbox), requestDirectory: taskDir, output: outbox, timeoutMs: timeout };
      writeSessionArtifact(specPath, spec);
    }
    const { node, entry: hostEntry } = hostExecutable();
    const binding = await client.start(reviewerRepo, { task: session.task, role: GENERIC_REVIEW_ROLE, harness_kind: session.actual_harness,
      endpoint: session.endpoint, parent_pane: session.parent_pane, args: [], max_requests: REVIEW_MAX_ROUNDS },
      isolatedHostCommand(profilePath, node, hostEntry, specPath), () => client.ready(join(outbox, 'ready.json')));
    client.assertBinding(binding);
    if (binding.pane_id === session.parent_pane) throw new Error('review_must_not_reuse_owner_pane');
    const previous = round > 1 ? readSessionArtifact<{ output: ReviewOutput }>(join(dir, `accepted-${round - 1}.json`)).output.findings : [];
    const contextDigest = acceptanceReviewContextDigest(context);
    const packet = [
      'Review the complete current subject against its goal, contract and prepared verification evidence. Do not edit production code or invoke other reviewers. Only author one final JSON file to the exact request.result_ref; no temp/rename or alternate submission. Terminal output and idle are observation only.',
      'Outer transport JSON is {request_id: request.request_id, context_sha256: request.context_sha256, value: domain output}. Provider value has EXACTLY request_id, context_sha256, subject_sha256, verdict, summary, findings. Domain request_id is request.request_id; domain context_sha256 is the prepared domain hash below (distinct from transport packet hash). The owner adds actual harness/role/model from the bound task-agent and OAR Session observation, not your self-description.',
      'PASS requires no unresolved P0/P1. FAIL requires at least one unresolved finding. Each finding has EXACTLY id, severity:P0|P1|P2|P3, status:new|open|resolved, message. Keep stable IDs: every prior finding must remain resolved/open with current evidence. A previous verdict is not evidence for current code.',
      `DOMAIN IDENTITY: ${JSON.stringify({ context_sha256: contextDigest, subject_sha256: identity.subject_sha256, actual_harness: session.actual_harness, actual_role: GENERIC_REVIEW_ROLE })}`,
      `PRIOR FINDINGS: ${JSON.stringify(previous)}`, `CONTRACT:\n${context.contract.content}`, `GOAL:\n${context.goal.content}`,
      `PREPARED VERIFICATION:\n${context.verification.content}`, `CURRENT SOURCE:\n${sourcePacket(root, context.subject.paths, context.subject.target_rev)}`,
    ].join('\n\n');
    if (Buffer.byteLength(packet) > 10 * 1024 * 1024) throw new Error('review_context_too_large');
    const packetPath = join(inputDir, `packet-${round}.txt`);
    if (!existsSync(packetPath)) writeFileSync(packetPath, packet, { flag: 'wx', mode: 0o600 });
    else if (readFileSync(packetPath, 'utf8') !== packet) throw new Error('review_packet_changed_before_send');
    const recheck = await acceptanceContext({ root, contract, verification: options.verification ?? '.ai/harness/checks/latest.json' });
    if (acceptanceReviewContextDigest(recheck) !== contextDigest) throw new Error('review_context_changed_before_submit');
    const before = [fingerprint(root), fingerprint(reviewerRepo)];
    lock.assertOwned();
    // Write intent before send; an unknown delivery must never allocate another round.
    writeSessionArtifact(join(dir, `request-${round}.json`), { ...identity, context_sha256: contextDigest, task_request: null });
    const request = await client.send(reviewerRepo, session.task, GENERIC_REVIEW_ROLE, relative(reviewerRepo, packetPath), 'repeatable',
      request => client.ready(join(outbox, `ack-${request.round}.json`)));
    writeSessionArtifact(join(dir, `delivery-${round}.json`), { ...identity, context_sha256: contextDigest, task_request: request });
    const deadline = Date.now() + timeout;
    let collected;
    for (;;) {
      collected = await client.collect(reviewerRepo, session.task, GENERIC_REVIEW_ROLE, request.round);
      if (collected && existsSync(join(outbox, `observed-${request.round}.json`))) break;
      client.assertBinding(binding); lock.assertOwned();
      if (Date.now() >= deadline) throw new Error('review_round_timeout; inspect the same request; do not resend');
      await Bun.sleep(100);
    }
    if (before[0] !== fingerprint(root) || before[1] !== fingerprint(reviewerRepo)) throw new Error('review_worktree_mutated');
    const model = client.model(session, request);
    if (!collected.value || typeof collected.value !== 'object' || Array.isArray(collected.value)
      || Object.keys(collected.value).sort().join(',') !== 'context_sha256,findings,request_id,subject_sha256,summary,verdict') throw new Error('review_malformed_provider_value');
    const output = validateReviewOutput({ ...collected.value, actual_harness: session.actual_harness, actual_role: GENERIC_REVIEW_ROLE, actual_model: model }, { request_id: request.request_id, context_sha256: contextDigest,
      subject_sha256: identity.subject_sha256, actual_harness: session.actual_harness, actual_role: GENERIC_REVIEW_ROLE, actual_model: model }, previous);
    const findings = output.findings.filter(finding => finding.status !== 'resolved').map(({ severity, message }) => ({ severity, message }));
    const reviewResult = { ...output, findings };
    const reviewer = session.actual_harness === 'codex' ? 'Codex' : 'Claude';
    const receipt = await recordAcceptance({ root, authorityHome: options.authorityHome ?? userInfo().homedir, contract,
      verification: options.verification ?? '.ai/harness/checks/latest.json', expectedContext: identity,
      disposition: output.verdict === 'PASS' ? 'external_pass' : 'reject', reviewer, source: 'generic-review', actor: null,
      summary: output.summary, findings, reviewResult });
    writeSessionArtifact(join(dir, `accepted-${round}.json`), { output, receipt });
    const review = markdownHeader(context.contract.content, 'Review File');
    if (review) projectAcceptance(resolve(root, review), receipt);
    return { status: output.verdict === 'PASS' ? 'accepted' : 'rejected', round, output, receipt,
      requested_harness: session.requested_harness, actual_harness: session.actual_harness, fallback_reason: session.fallback_reason };
  } finally { lock.release(); }
}

export function reviewStatus(repoRoot: string, contract: string, effects: ReviewEffects = {}) {
  const { dir } = reviewLocation(repoRoot, contract);
  if (!existsSync(join(dir, 'session.json'))) return { status: 'absent' };
  const session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
  return { ...session, lifecycle: ({ ...runtime, ...effects }).status(session.reviewer_repo, session.task, GENERIC_REVIEW_ROLE),
    status: existsSync(join(dir, 'closed.json')) ? 'closed' : 'open',
    rounds: Array.from({ length: REVIEW_MAX_ROUNDS }, (_, index) => index + 1).filter(round => existsSync(join(dir, `request-${round}.json`)))
      .map(round => ({ round, receipt_saved: existsSync(join(dir, `accepted-${round}.json`)) })) };
}

export async function closeReview(repoRoot: string, contract: string, cancel = false, authorityHome = userInfo().homedir,
  effects: ReviewEffects = {}) {
  const { dir, primary, root } = reviewLocation(repoRoot, contract);
  const lock = acquireExclusiveDirectoryLock(primary, relative(primary, join(dir, 'caller.lock')), { waitTimeoutMs: 1, reclaimStaleOwner: true });
  try {
    if (existsSync(join(dir, 'closed.json'))) return readSessionArtifact<{ cleanup: TaskCleanupResult }>(join(dir, 'closed.json')).cleanup;
    const session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
    if (!cancel) {
      const receipt = await verifyAcceptance({ root, authorityHome, contract });
      const completed = Array.from({ length: REVIEW_MAX_ROUNDS }, (_, index) => index + 1).filter(round => existsSync(join(dir, `accepted-${round}.json`)));
      if (!completed.length) throw new Error('review_no_accepted_round');
      const last = readSessionArtifact<{ output: ReviewOutput; receipt: AcceptanceReceipt }>(join(dir, `accepted-${completed.at(-1)}.json`));
      if (last.output.verdict !== 'PASS' || JSON.stringify(last.receipt) !== JSON.stringify(receipt)) throw new Error('review_acceptance_mismatch');
    }
    const client = { ...runtime, ...effects };
    const taskDir = taskSessionDirectory(primary, session.task, GENERIC_REVIEW_ROLE);
    const output = join(session.reviewer_repo, '.ai/harness/runs/task-agent-outbox', taskDir.split('/').pop()!);
    // An ambiguous launch without a disposal acknowledgement remains pending;
    // never kill a host whose OAR children may still be alive.
    await client.dispose(session.reviewer_repo, session.task, output);
    const cleanup = await (cancel ? client.cancel : client.close)(session.reviewer_repo, session.task, GENERIC_REVIEW_ROLE);
    if (cleanup.status === 'closed') writeSessionArtifact(join(dir, 'closed.json'), { cancelled: cancel, cleanup });
    return cleanup;
  } finally { lock.release(); }
}
