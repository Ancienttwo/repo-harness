import { existsSync, closeSync, lstatSync, openSync, readFileSync, realpathSync, writeFileSync, chmodSync } from 'fs';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import { isAbsolute, join, relative, resolve } from 'path';
import { userInfo } from 'os';
import { fileURLToPath } from 'url';
import { acquireExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { herdrCommand, herdrEnvironment, herdrResult, validateHerdrEndpoint, type HerdrEndpoint } from '../terminal/herdr';
import { assertCreated, assertTaskBinding, ensureSessionDirectory, nextSessionRound, processIdentity, processProofAlive, readSessionArtifact, signalCreatedProcess, waitSessionArtifact, writeSessionArtifact, type ObjectOwnership, type TaskPaneBinding } from '../terminal/task-session';
import { markdownHeader } from '../../core/state/artifact-parsers';
import { CLAUDE_REVIEW_MAX_ROUNDS, CLAUDE_REVIEW_TIMEOUT_MS, reviewContextDigest, validateClaudeReviewResult, type ClaudeReviewContext, type ClaudeReviewRequest } from '../../core/review/claude-review';
import { acceptanceContext, authorityFingerprint, projectAcceptance, recordAcceptance, verifyAcceptance } from '../../../scripts/acceptance-receipt';

export interface ReviewSession {
  protocol: 3;
  startup_protocol?: 1;
  repo_root: string;
  contract_file: string;
  contract_sha256: string;
  goal_sha256: string;
  session_id: string;
  herdr_session: string;
  herdr_bin: string;
  herdr_config: string;
  provider_bin: string;
  runtime_home: string;
}

export interface ReviewProcesses {
  host: string;
  child: string;
  child_pid: number;
  server: string;
  pane: string;
  binding: TaskPaneBinding;
}

export interface ClaudeReviewOptions {
  repoRoot: string;
  contract: string;
  verification?: string;
  timeoutMs?: number;
  /** Internal seams used by deterministic integration tests, never exposed by CLI. */
  providerCommand?: string;
  authorityHome?: string;
  runtimeHome?: string;
  admitSession: () => void;
}

export function reviewSessionLocation(repoRoot: string, contract: string): { root: string; dir: string; contract: string } {
  const root = realpathSync(repoRoot);
  const canonical = relative(root, resolve(root, contract));
  if (!canonical.startsWith('tasks/contracts/') || !canonical.endsWith('.contract.md') || canonical.split('/').includes('..')) {
    throw new Error('claude_review_invalid_contract_path');
  }
  const key = createHash('sha256').update(canonical).digest('hex');
  const dir = join(root, '.ai/harness/runs/claude-review', key);
  ensureSessionDirectory(root, dir);
  return { root, dir, contract: canonical };
}

export function reviewEndpoint(session: ReviewSession): HerdrEndpoint {
  return { session: session.herdr_session, configPath: session.herdr_config, home: session.runtime_home };
}

export function herdr(session: ReviewSession, args: string[]): Record<string, any> {
  return herdrResult(herdrCommand(reviewEndpoint(session), args, session.herdr_bin));
}

interface ReviewServer { pid: number; identity: string; ownership: ObjectOwnership }

function serverStartupUnresolved(session: ReviewSession, dir: string): boolean {
  if (!existsSync(join(dir, 'server-start-intent.json')) || existsSync(join(dir, 'server.json'))) return false;
  return !existsSync(join(dir, 'server-closed.json'))
    || readSessionArtifact<{ session_id?: string }>(join(dir, 'server-closed.json')).session_id !== session.session_id;
}

export function reviewServerIdentity(session: ReviewSession): ReviewServer {
  const { dir } = reviewSessionLocation(session.repo_root, session.contract_file);
  const server = readSessionArtifact<ReviewServer>(join(dir, 'server.json'));
  if (processIdentity(server.pid) !== server.identity) throw new Error('claude_review_server_identity_lost');
  return server;
}

export function reviewHostIdentity(session: ReviewSession, pane: string): { server: string; host: string } {
  const server = reviewServerIdentity(session);
  const result = herdr(session, ['pane', 'process-info', '--pane', pane]);
  const info = result.process_info;
  if (result.type !== 'pane_process_info' || info?.pane_id !== pane || !Number.isSafeInteger(info.shell_pid)) throw new Error('claude_review_host_pane_mismatch');
  const parent = execFileSync('ps', ['-p', String(info.shell_pid), '-o', 'ppid='], { encoding: 'utf8' }).trim();
  if (Number(parent) !== server.pid) throw new Error('claude_review_host_server_mismatch');
  return { server: server.identity, host: processIdentity(info.shell_pid) };
}

export function assertReviewProcesses(session: ReviewSession, processes: ReviewProcesses): void {
  assertTaskBinding(processes.binding);
  const identity = reviewHostIdentity(session, processes.pane);
  if (identity.server !== processes.server || identity.host !== processes.host
    || processIdentity(processes.child_pid) !== processes.child) throw new Error('claude_review_process_identity_lost');
}

export async function startReviewServer(session: ReviewSession, dir: string): Promise<void> {
  validateHerdrEndpoint(reviewEndpoint(session));
  const startup = acquireExclusiveDirectoryLock(session.repo_root, relative(session.repo_root, join(dir, 'startup.lock')),
    { waitTimeoutMs: 1000, reclaimStaleOwner: true });
  try {
    failure(dir);
    if (existsSync(join(dir, 'server.json'))) throw new Error('claude_review_server_already_started');
    const host = fileURLToPath(new URL('./claude-review-host.ts', import.meta.url));
    const launcher = join(dir, 'host.sh');
    writeFileSync(launcher, `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(host)} ${shellQuote(dir)}\n`, { flag: 'wx', mode: 0o700 });
    chmodSync(launcher, 0o700);
    writeFileSync(session.herdr_config, `onboarding = false\n[terminal]\ndefault_shell = ${JSON.stringify(launcher)}\nshell_mode = "non_login"\n[update]\nversion_check = false\nmanifest_check = false\n[session]\nresume_agents_on_restore = false\n`, { flag: 'wx', mode: 0o600 });
    writeSessionArtifact(join(dir, 'server-start-intent.json'), { session_id: session.session_id });
    const log = openSync(join(dir, 'herdr-server.log'), 'ax', 0o600);
    let server: ChildProcess | undefined;
    try {
      server = spawn(session.herdr_bin, ['--session', session.herdr_session, 'server'], {
        cwd: session.repo_root, env: herdrEnvironment(reviewEndpoint(session)),
        detached: true, stdio: ['ignore', log, log],
      });
      server.on('error', () => {});
      if (!server.pid) throw new Error('claude_review_server_spawn_failed');
      writeSessionArtifact(join(dir, 'server.json'), { pid: server.pid, identity: processIdentity(server.pid), ownership: { disposition: 'created', intent_id: session.session_id } });
      server.unref();
    } catch (error) {
      // No workspace has been created yet. Reap only this still-owned child;
      // an interrupted caller instead leaves its durable intent unresolved.
      if (server?.pid) {
        server.kill('SIGKILL');
        const deadline = Date.now() + 5000;
        while (server.exitCode === null && server.signalCode === null && Date.now() < deadline) await Bun.sleep(10);
        if (server.exitCode === null && server.signalCode === null) throw new Error('claude_review_server_cleanup_incomplete');
      }
      writeSessionArtifact(join(dir, 'server-closed.json'), { session_id: session.session_id });
      throw error;
    } finally { closeSync(log); }
  } finally { startup.release(); }
  const deadline = Date.now() + 10_000;
  for (;;) {
    failure(dir); reviewServerIdentity(session);
    try { herdr(session, ['workspace', 'list']); break; }
    catch (error) { if (Date.now() >= deadline) throw error; await Bun.sleep(100); }
  }
  // The dedicated server starts empty; only this caller may create its first host.
  failure(dir);
  const result = herdr(session, ['workspace', 'create', '--cwd', session.repo_root, '--label', 'Claude acceptance reviewer', '--no-focus']);
  if (result.type !== 'workspace_created' || typeof result.root_pane?.pane_id !== 'string') throw new Error('claude_review_invalid_pane_response');
  writeSessionArtifact(join(dir, 'pane.json'), { pane: result.root_pane.pane_id });
}

async function stopReviewServer(session: ReviewSession, dir: string): Promise<void> {
  if (serverStartupUnresolved(session, dir)) throw new Error('claude_review_server_startup_ownership_unknown; inspect the named herdr server');
  if (!existsSync(join(dir, 'server.json'))) return;
  const server = readSessionArtifact<ReviewServer>(join(dir, 'server.json'));
  assertCreated(server.ownership);
  const alive = () => {
    try { return processProofAlive(server); } catch { throw new Error('claude_review_server_identity_lost'); }
  };
  // Let the host exit and remove its pane before stopping the dedicated server.
  const deadline = Date.now() + 5000;
  while (alive()) {
    const value = herdr(session, ['workspace', 'list']);
    if (value.type !== 'workspace_list' || !Array.isArray(value.workspaces)) throw new Error('claude_review_invalid_workspace_response');
    if (value.workspaces.length === 0) break;
    if (Date.now() >= deadline) throw new Error('claude_review_server_has_live_panes; preserve them and inspect');
    await Bun.sleep(100);
  }
  if (!alive()) {
    if (!existsSync(join(dir, 'server-closed.json'))) writeSessionArtifact(join(dir, 'server-closed.json'), server);
    return;
  }
  signalCreatedProcess(server, 'SIGTERM');
  const stoppedBy = Date.now() + 5000;
  while (alive() && Date.now() < stoppedBy) await Bun.sleep(100);
  if (alive()) throw new Error('claude_review_server_cleanup_incomplete');
  if (!existsSync(join(dir, 'server-closed.json'))) writeSessionArtifact(join(dir, 'server-closed.json'), server);
}

function readSession(dir: string, root: string, contract: string): ReviewSession {
  const session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
  if (session.protocol !== 3 || session.repo_root !== root || session.contract_file !== contract
    || !/^[0-9a-f-]{36}$/.test(session.session_id) || session.herdr_session !== `review-${session.session_id.replaceAll("-", "").slice(0, 20)}`
    || !isAbsolute(session.runtime_home) || !isAbsolute(session.herdr_bin) || session.herdr_config !== join(dir, 'herdr.toml') || !isAbsolute(session.provider_bin)) throw new Error('claude_review_session_identity_mismatch');
  return session;
}

function shellQuote(value: string): string { return `'${value.replace(/'/g, `'\\''`)}'`; }

function failure(dir: string): void {
  if (existsSync(join(dir, 'failure.json'))) throw new Error(`claude_review_interrupted: ${readSessionArtifact<{ error: string }>(join(dir, 'failure.json')).error}`);
  if (existsSync(join(dir, 'close.request.json'))) throw new Error('claude_review_session_closed');
}

function contextIdentity(context: Awaited<ReturnType<typeof acceptanceContext>>): ClaudeReviewContext {
  return {
    contract_file: context.contract.path, contract_sha256: authorityFingerprint(context.contract.content),
    goal_sha256: authorityFingerprint(context.goal.content), subject_sha256: context.subject.review_subject_sha256,
    verification_evidence_sha256: context.evidence.fingerprint, target_revision: context.subject.target_rev,
  };
}

function sourcePacket(root: string, paths: readonly string[], target: string): string {
  const pieces = [execFileSync('git', ['-C', root, 'diff', '--no-ext-diff', '--no-textconv', '--binary', target, '--'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })];
  for (const path of paths) {
    const file = resolve(root, path);
    if (relative(root, file).split('/').includes('..')) throw new Error('claude_review_unsafe_subject_path');
    if (!existsSync(file)) { pieces.push(`\nDeleted path: ${JSON.stringify(path)}`); continue; }
    if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || !realpathSync(file).startsWith(root + '/')) throw new Error(`claude_review_unsupported_subject_entry: ${path}`);
    // Tracked content is already in the diff; read tools provide surrounding context.
    const tracked = execFileSync('git', ['-C', root, '--literal-pathspecs', 'ls-files', '--', path], { encoding: 'utf8' }).trim();
    if (tracked) continue;
    if (lstatSync(file).size > 8 * 1024 * 1024) throw new Error('claude_review_subject_too_large');
    const content = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file));
    pieces.push(`\nComplete untracked file ${JSON.stringify(path)}:\n${content}`);
  }
  const packet = pieces.join('\n');
  if (Buffer.byteLength(packet) > 8 * 1024 * 1024) throw new Error('claude_review_subject_too_large');
  return packet;
}

export async function runClaudeReviewRound(options: ClaudeReviewOptions) {
  const startupId = randomUUID();
  const runtimeHome = options.runtimeHome ?? process.env.HOME ?? userInfo().homedir;
  validateHerdrEndpoint({ session: `review-${startupId.replaceAll("-", "").slice(0, 20)}`, home: runtimeHome });
  const { root, dir, contract } = reviewSessionLocation(options.repoRoot, options.contract);
  const lock = acquireExclusiveDirectoryLock(root, relative(root, join(dir, 'caller.lock')), { waitTimeoutMs: 1, reclaimStaleOwner: true });
  try {
    failure(dir);
    const timeout = options.timeoutMs ?? CLAUDE_REVIEW_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > CLAUDE_REVIEW_TIMEOUT_MS) throw new Error('claude_review_invalid_timeout');
    const verification = options.verification ?? '.ai/harness/checks/latest.json';
    const context = await acceptanceContext({ root, contract, verification });
    if (context.policy.reviewer !== 'Claude') throw new Error('claude_review_requires_claude_acceptance_policy');
    const identity = contextIdentity(context);
    let session: ReviewSession;
    if (!existsSync(join(dir, 'session.json'))) {
      const herdrBin = Bun.which('herdr');
      const providerBin = options.providerCommand ? realpathSync(options.providerCommand) : Bun.which('claude');
      if (!herdrBin || !providerBin) throw new Error('claude_review_requires_herdr_and_claude');
      const version = execFileSync(herdrBin, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
      const match = /^herdr (\d+)\.(\d+)\.(\d+)$/.exec(version);
      if (!match || (Number(match[1]) === 0 && Number(match[2]) < 9)) throw new Error('claude_review_requires_herdr_0_9');
      options.admitSession();
      const id = startupId;
      session = { protocol: 3, startup_protocol: 1, repo_root: root, contract_file: contract, contract_sha256: identity.contract_sha256,
        goal_sha256: identity.goal_sha256, session_id: id, herdr_session: `review-${id.replaceAll("-", "").slice(0, 20)}`, herdr_bin: herdrBin, herdr_config: join(dir, 'herdr.toml'), provider_bin: providerBin, runtime_home: runtimeHome };
      writeSessionArtifact(join(dir, 'session.json'), session);
      try {
        await startReviewServer(session, dir);
        await waitSessionArtifact(join(dir, 'processes.json'), Date.now() + 15_000, () => failure(dir));
      } catch (error) {
        if (!existsSync(join(dir, 'failure.json'))) writeSessionArtifact(join(dir, 'failure.json'), { error: `startup: ${String(error)}` });
        throw error;
      }
    } else session = readSession(dir, root, contract);
    if (session.contract_sha256 !== identity.contract_sha256 || session.goal_sha256 !== identity.goal_sha256) throw new Error('claude_review_contract_or_goal_changed');
    const processes = readSessionArtifact<ReviewProcesses>(join(dir, 'processes.json'));
    assertReviewProcesses(session, processes);
    const round = nextSessionRound<ClaudeReviewRequest>(dir, CLAUDE_REVIEW_MAX_ROUNDS, identity.subject_sha256,
      previous => previous.context.subject_sha256);
    const request: ClaudeReviewRequest = { round, round_id: randomUUID(), session_id: session.session_id,
      context: identity, context_sha256: reviewContextDigest(identity), timeout_ms: timeout, prompt: '' };
    request.prompt = [
      'Act as an independent read-only acceptance reviewer. Review the complete current subject against its goal, contract and prepared verification evidence. Do not edit files or invoke other reviewers. Return only the required structured review result.',
      `Echo this exact identity: ${JSON.stringify({ round_id: request.round_id, session_id: session.session_id, subject_sha256: identity.subject_sha256, context_sha256: request.context_sha256 })}`,
      'PASS is permitted only when the current subject satisfies the contract and has no unresolved P0/P1 findings. Otherwise return FAIL. Findings use stable IDs; each prior finding must be marked resolved or open with current evidence; new problems use new IDs. A previous verdict is not evidence for the current code.',
      `CONTRACT:\n${context.contract.content}`, `GOAL:\n${context.goal.content}`,
      `PREPARED VERIFICATION:\n${context.verification.content}`,
      `CURRENT SOURCE:\n${sourcePacket(root, context.subject.paths, context.subject.target_rev)}`,
    ].join('\n\n');
    if (Buffer.byteLength(request.prompt) > 10 * 1024 * 1024) throw new Error('claude_review_context_too_large');
    const recheck = await acceptanceContext({ root, contract, verification });
    if (reviewContextDigest(contextIdentity(recheck)) !== request.context_sha256) throw new Error('claude_review_context_changed_before_submit');
    lock.assertOwned(); assertReviewProcesses(session, processes);
    writeSessionArtifact(join(dir, `request-${round}.json`), request);
    await waitSessionArtifact(join(dir, `result-${round}.json`), Date.now() + timeout + 2000, () => { failure(dir); assertReviewProcesses(session, processes); });
    failure(dir); assertReviewProcesses(session, processes); lock.assertOwned();
    const result = readSessionArtifact<unknown>(join(dir, `result-${round}.json`));
    const output = validateClaudeReviewResult(result, request);
    if (round > 1) {
      const previousRequest = readSessionArtifact<ClaudeReviewRequest>(join(dir, `request-${round - 1}.json`));
      const previous = validateClaudeReviewResult(readSessionArtifact(join(dir, `result-${round - 1}.json`)), previousRequest);
      for (const finding of previous.findings) {
        const current = output.findings.find(item => item.id === finding.id);
        if (!current || current.status === 'new') throw new Error('claude_review_previous_finding_unaddressed');
      }
    }
    const receipt = await recordAcceptance({ root, authorityHome: options.authorityHome ?? userInfo().homedir, contract, verification,
      disposition: output.verdict === 'PASS' ? 'external_pass' : 'reject', reviewer: 'Claude', source: 'claude-review', actor: null,
      summary: output.summary, findings: output.findings.filter(finding => finding.status !== 'resolved').map(({ severity, message }) => ({ severity, message })),
      expectedContext: request.context });
    writeSessionArtifact(join(dir, `accepted-${round}.json`), { result_sha256: createHash('sha256').update(JSON.stringify(result)).digest('hex'), receipt });
    const review = markdownHeader(context.contract.content, 'Review File');
    if (review) projectAcceptance(resolve(root, review), receipt);
    return { status: output.verdict === 'PASS' ? 'accepted' : 'rejected', round, session_id: session.session_id,
      child_pid: processes.child_pid, pane: processes.pane, attach: `${shellQuote(session.herdr_bin)} --session ${shellQuote(session.herdr_session)}`, output, receipt };
  } finally { lock.release(); }
}

export function claudeReviewStatus(repoRoot: string, contractPath: string) {
  const { root, dir, contract } = reviewSessionLocation(repoRoot, contractPath);
  if (!existsSync(join(dir, 'session.json'))) return { status: 'absent' };
  const session = readSession(dir, root, contract);
  const closed = existsSync(join(dir, 'closed.json'));
  const unresolvedServer = serverStartupUnresolved(session, dir);
  const serverClosed = !existsSync(join(dir, 'server.json')) || existsSync(join(dir, 'server-closed.json'));
  let error: string | null = null;
  let processes: ReviewProcesses | null = null;
  if (!closed) {
    try { processes = readSessionArtifact<ReviewProcesses>(join(dir, 'processes.json')); assertReviewProcesses(session, processes); failure(dir); }
    catch (caught) { error = String(caught); }
  }
  const rounds = Array.from({ length: CLAUDE_REVIEW_MAX_ROUNDS }, (_, i) => i + 1).filter(i => existsSync(join(dir, `request-${i}.json`)))
    .map(round => ({ round, submitted: true, result_saved: existsSync(join(dir, `result-${round}.json`)), receipt_saved: existsSync(join(dir, `accepted-${round}.json`)) }));
  return { status: unresolvedServer ? 'cleanup_pending' : closed ? (serverClosed ? 'closed' : 'cleanup_pending') : error ? 'interrupted' : rounds.some(r => !r.receipt_saved) ? 'pending' : 'idle',
    session_id: session.session_id, processes, rounds, error, attach: `${shellQuote(session.herdr_bin)} --session ${shellQuote(session.herdr_session)}` };
}

export async function closeClaudeReview(options: Pick<ClaudeReviewOptions, 'repoRoot' | 'contract' | 'authorityHome'>, cancel = false) {
  const { root, dir, contract } = reviewSessionLocation(options.repoRoot, options.contract);
  const session = readSession(dir, root, contract);
  if (existsSync(join(dir, 'closed.json'))) { await stopReviewServer(session, dir); return readSessionArtifact(join(dir, 'closed.json')); }
  if (!existsSync(join(dir, 'processes.json'))) {
    if (!cancel) throw new Error('claude_review_startup_incomplete; use cancel');
    if (session.startup_protocol !== 1) throw new Error('claude_review_startup_ownership_unknown; startup serialization was not recorded');
    const startup = acquireExclusiveDirectoryLock(root, relative(root, join(dir, 'startup.lock')),
      { waitTimeoutMs: 1000, reclaimStaleOwner: true });
    try {
      if (existsSync(join(dir, 'closed.json'))) { await stopReviewServer(session, dir); return readSessionArtifact(join(dir, 'closed.json')); }
      // The host may have finished bootstrap while we acquired the lock.
      if (!existsSync(join(dir, 'processes.json'))) {
        if (serverStartupUnresolved(session, dir)) throw new Error('claude_review_server_startup_ownership_unknown; inspect the named herdr server');
        if (existsSync(join(dir, 'spawn-intent.json'))) {
          if (!existsSync(join(dir, 'startup-no-child.json'))
            || readSessionArtifact<{ session_id: string }>(join(dir, 'startup-no-child.json')).session_id !== session.session_id) {
            throw new Error('claude_review_startup_ownership_unknown; inspect the owned herdr session; cleanup is not proven');
          }
        }
        if (!existsSync(join(dir, 'close.request.json'))) writeSessionArtifact(join(dir, 'close.request.json'), { cancel: true, session_id: session.session_id });
        writeSessionArtifact(join(dir, 'closed.json'), { session_id: session.session_id, cancelled: true, termination: 'startup-no-child' });
        await stopReviewServer(session, dir);
        return readSessionArtifact(join(dir, 'closed.json'));
      }
    } finally { startup.release(); }
  }
  const processes = readSessionArtifact<ReviewProcesses>(join(dir, 'processes.json'));
  assertCreated(processes.binding.ownership); assertCreated(processes.binding.provider.ownership);
  const server = readSessionArtifact<ReviewServer>(join(dir, 'server.json'));
  let serverAlive = true;
  try { process.kill(server.pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') serverAlive = false; else throw error; }
  if (serverAlive && processIdentity(server.pid) !== server.identity) throw new Error('claude_review_server_identity_lost');
  // The host owns the child and may still be available to clean an exited provider.
  let hostAvailable = false;
  try {
    const identity = reviewHostIdentity(session, processes.pane);
    hostAvailable = identity.server === processes.server && identity.host === processes.host;
  } catch { /* An exited host can leave its detached provider alive. Only explicit cancel handles that case. */ }
  if (hostAvailable) assertTaskBinding(processes.binding, true);
  if (!hostAvailable) {
    if (!cancel) throw new Error('claude_review_cleanup_identity_lost');
    // A changed PPID after reparenting is not a new process; PID, group, start time and executable remain fenced.
    const alive = () => {
      try { return processProofAlive(processes.binding.provider); } catch { throw new Error('claude_review_cleanup_child_identity_lost'); }
    };
    if (!existsSync(join(dir, 'close.request.json'))) writeSessionArtifact(join(dir, 'close.request.json'), { cancel: true, session_id: session.session_id });
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
      if (!alive()) break;
      signalCreatedProcess(processes.binding.provider, signal, true);
      const deadline = Date.now() + 4000;
      while (alive() && Date.now() < deadline) await Bun.sleep(100);
    }
    if (alive()) throw new Error('claude_review_cleanup_incomplete');
    // Never kill a pane after losing its host identity: it may now belong to the user.
    writeSessionArtifact(join(dir, 'closed.json'), { session_id: session.session_id, cancelled: true, termination: 'orphan-owned-group', host_available: false });
    await stopReviewServer(session, dir);
    return readSessionArtifact(join(dir, 'closed.json'));
  }
  if (!cancel) {
    const receipt = await verifyAcceptance({ root, authorityHome: options.authorityHome ?? userInfo().homedir, contract });
    const completed = Array.from({ length: CLAUDE_REVIEW_MAX_ROUNDS }, (_, i) => i + 1).filter(i => existsSync(join(dir, `accepted-${i}.json`)));
    if (!completed.length) throw new Error('claude_review_no_accepted_round');
    const accepted = readSessionArtifact<{ receipt: unknown }>(join(dir, `accepted-${completed.at(-1)}.json`));
    if (JSON.stringify(accepted.receipt) !== JSON.stringify(receipt)) throw new Error('claude_review_acceptance_mismatch');
  }
  if (!existsSync(join(dir, 'close.request.json'))) writeSessionArtifact(join(dir, 'close.request.json'), { cancel, session_id: session.session_id });
  await waitSessionArtifact(join(dir, 'closed.json'), Date.now() + 15_000, () => {});
  await stopReviewServer(session, dir);
  return readSessionArtifact(join(dir, 'closed.json'));
}
