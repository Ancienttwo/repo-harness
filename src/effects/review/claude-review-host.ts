import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { appendFileSync, existsSync, realpathSync } from 'fs';
import { join, relative } from 'path';
import { acquireExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { createInterface } from 'readline';
import { CLAUDE_REVIEW_MAX_ROUNDS, CLAUDE_REVIEW_SCHEMA, CLAUDE_REVIEW_TIMEOUT_MS, reviewContextDigest, validateClaudeReviewResult, type ClaudeReviewRequest } from '../../core/review/claude-review';
import { reviewEndpoint, reviewSessionLocation, reviewHostIdentity, type ReviewProcesses, type ReviewSession } from './claude-review-session';
import { beginSessionRound, captureTaskPane, harnessCapabilities, processIdentity, readSessionArtifact, saveSessionRoundResult, signalCreatedProcess, writeSessionArtifact } from '../terminal/task-session';
import { taskRepository } from '../terminal/task-worktree';
import { herdrCommand, herdrMutation } from '../terminal/herdr';

/** One host owns one child. Requests/results are transport evidence, never task or acceptance authority. */
export async function runClaudeReviewHost(directory: string): Promise<void> {
  const dir = realpathSync(directory);
  const session = readSessionArtifact<ReviewSession>(join(dir, 'session.json'));
  if (reviewSessionLocation(session.repo_root, session.contract_file).dir !== dir || existsSync(join(dir, 'processes.json'))) {
    throw new Error('claude_review_host_identity_mismatch');
  }
  // Cancellation and child creation share this lock; missing metadata alone is not proof of absence.
  if (session.startup_protocol !== 1) throw new Error('claude_review_startup_protocol_missing');
  const startup = acquireExclusiveDirectoryLock(session.repo_root, relative(session.repo_root, join(dir, 'startup.lock')),
    { waitTimeoutMs: 1000, reclaimStaleOwner: true });
  let child: ChildProcessWithoutNullStreams;
  let processes: ReviewProcesses;
  try {
    if (existsSync(join(dir, 'close.request.json')) || existsSync(join(dir, 'closed.json'))) return;
    if (existsSync(join(dir, 'spawn-intent.json'))) throw new Error('claude_review_startup_already_attempted');
    if (session.protocol !== 3) throw new Error('claude_review_session_identity_mismatch');
    const pane = process.env.HERDR_PANE_ID;
    if (!pane || process.env.HERDR_ENV !== '1') throw new Error('claude_review_host_requires_herdr');
    const identity = reviewHostIdentity(session, pane);
    if (identity.host !== processIdentity(process.pid)) throw new Error('claude_review_host_pane_mismatch');
    const env = { ...process.env };
    delete env.CLAUDECODE;
    writeSessionArtifact(join(dir, 'spawn-intent.json'), { session_id: session.session_id });
    try { child = spawn(session.provider_bin, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--session-id', session.session_id, '--no-session-persistence', '--model', 'fable',
      '--tools', 'Read,Grep,Glob', '--allowedTools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '',
      '--settings', '{"disableAllHooks":true}', '--disable-slash-commands', '--no-chrome', '--json-schema', JSON.stringify(CLAUDE_REVIEW_SCHEMA)],
    { cwd: session.repo_root, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      writeSessionArtifact(join(dir, 'startup-no-child.json'), { session_id: session.session_id });
      throw error;
    }
    if (!child.pid) {
      // Failed spawn emits error asynchronously even though no process was created.
      child.once('error', () => {});
      writeSessionArtifact(join(dir, 'startup-no-child.json'), { session_id: session.session_id });
      throw new Error('claude_review_spawn_failed');
    }
    const endpoint = reviewEndpoint(session);
    const name = `review-${session.session_id.replaceAll('-', '').slice(0, 20)}`;
    herdrMutation(herdrCommand(endpoint, ['pane', 'report-agent', pane, '--source', 'repo-harness', '--agent', 'claude', '--state', 'idle', '--seq', '1']));
    herdrMutation(herdrCommand(endpoint, ['agent', 'rename', pane, name]));
    const proof = captureTaskPane(endpoint, pane, name, { pid: child.pid, identity: processIdentity(child.pid) },
      { disposition: 'created', intent_id: session.session_id }, { pid: process.pid, identity: processIdentity(process.pid) });
    processes = { host: processIdentity(process.pid), child: processIdentity(child.pid), child_pid: child.pid,
      server: identity.server, pane, binding: { protocol: 3, launch: 'structured_host', result_authority: 'host', host_result: {journal_ref: dir}, containment: null, repository_id: taskRepository(session.repo_root).repository_id, execution_root: session.repo_root, runtime: 'herdr', task: session.contract_file, role: 'gatekeeper',
        harness_kind: 'claude', endpoint, max_requests: CLAUDE_REVIEW_MAX_ROUNDS, capabilities: harnessCapabilities('claude'), ...proof, host: {pid:process.pid,identity:processIdentity(process.pid)} } };
    writeSessionArtifact(join(dir, 'processes.json'), processes);
  } finally { startup.release(); }
  console.log(`Claude reviewer | session=${session.session_id} pid=${child.pid} contract=${session.contract_file}`);
  console.log('Waiting for a review round. This pane shows streamed activity and structured findings.');
  let active: ClaudeReviewRequest | null = null;
  let completed = 0;
  let interrupted = false;
  let closing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let outputBytes = 0;
  const fail = (error: unknown) => {
    interrupted = true;
    clearTimeout(timer);
    if (!existsSync(join(dir, 'failure.json'))) writeSessionArtifact(join(dir, 'failure.json'), { error: String(error), round: active?.round ?? null });
    console.error(`INTERRUPTED: ${String(error)}. Result not accepted; use status/cancel.`);
  };
  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('exit', (code, signal) => { if (!closing) fail(`provider exited code=${code} signal=${signal}`); resolve({ code, signal }); });
  });
  child.on('error', fail);
  child.stdin.on('error', error => { if (!closing) fail(error); });
  child.stderr.on('data', (data: Buffer) => {
    if (outputBytes < 16 * 1024 * 1024) appendFileSync(join(dir, 'provider.stderr.log'), data, { mode: 0o600 });
    outputBytes += data.length;
  });
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => {
    if (interrupted || closing) return;
    try {
      outputBytes += Buffer.byteLength(line);
      if (outputBytes > 16 * 1024 * 1024) throw new Error('claude_review_output_limit');
      appendFileSync(join(dir, 'provider.events.jsonl'), line + '\n', { mode: 0o600 });
      const event = JSON.parse(line) as Record<string, unknown>;
      if (event.type === 'assistant') {
        const message = event.message as { content?: { type: string; text?: string; name?: string }[] } | undefined;
        for (const item of message?.content ?? []) {
          if (item.type === 'text') console.log(item.text);
          if (item.type === 'tool_use') console.log(`[tool] ${item.name}`);
        }
      } else console.log(`[event] ${event.type}${event.subtype ? '/' + event.subtype : ''}`);
      if (event.type !== 'result') return;
      if (!active) throw new Error('claude_review_unexpected_result');
      if (processIdentity(child.pid!) !== processes.child) throw new Error('claude_review_child_identity_lost');
      const output = validateClaudeReviewResult(event, active);
      saveSessionRoundResult(dir, active.round, event);
      clearTimeout(timer);
      completed = active.round;
      active = null;
      console.log(`ROUND ${completed} ${output.verdict}: ${output.summary}`);
      for (const finding of output.findings) console.log(`[${finding.severity}/${finding.status}] ${finding.id}: ${finding.message}`);
      console.log('Round saved. Waiting for host acceptance and the next repair round or explicit close.');
    } catch (error) { fail(error); }
  });
  async function shutdown() {
    closing = true;
    clearTimeout(timer);
    child.stdin.end();
    let termination = 'stdin-eof';
    if (await Promise.race([exitPromise.then(() => true), Bun.sleep(4000).then(() => false)]) === false) {
      if (processIdentity(child.pid!) !== processes.child) throw new Error('claude_review_cleanup_child_identity_lost');
      signalCreatedProcess(processes.binding.provider, 'SIGTERM', true);
      termination = 'owned-group-sigterm';
    }
    if (await Promise.race([exitPromise.then(() => true), Bun.sleep(4000).then(() => false)]) === false) {
      if (processIdentity(child.pid!) !== processes.child) throw new Error('claude_review_cleanup_child_identity_lost');
      signalCreatedProcess(processes.binding.provider, 'SIGKILL', true);
      termination = 'owned-group-sigkill';
    }
    const exit = await exitPromise;
    writeSessionArtifact(join(dir, 'closed.json'), { session_id: session.session_id, completed_rounds: completed,
      termination, exit, cancelled: readSessionArtifact<{ cancel: boolean }>(join(dir, 'close.request.json')).cancel });
    console.log('Owned provider exited. Closing this host/pane.');
    process.exit(0);
  }
  setInterval(() => {
    if (closing) return;
    try {
      if (existsSync(join(dir, 'close.request.json'))) {
        const request = readSessionArtifact<{ session_id: string; cancel: boolean }>(join(dir, 'close.request.json'));
        if (request.session_id !== session.session_id || typeof request.cancel !== 'boolean') throw new Error('claude_review_invalid_close_request');
        void shutdown().catch(fail);
        return;
      }
      if (interrupted || active || completed >= CLAUDE_REVIEW_MAX_ROUNDS) return;
      const next = completed + 1;
      const path = join(dir, `request-${next}.json`);
      if (!existsSync(path)) return;
      const request = readSessionArtifact<ClaudeReviewRequest>(path);
      if (request.round !== next || request.session_id !== session.session_id || typeof request.prompt !== 'string'
        || request.context_sha256 !== reviewContextDigest(request.context) || request.context.contract_file !== session.contract_file
        || request.context.contract_sha256 !== session.contract_sha256 || request.context.goal_sha256 !== session.goal_sha256
        || !Number.isSafeInteger(request.timeout_ms) || request.timeout_ms < 1 || request.timeout_ms > CLAUDE_REVIEW_TIMEOUT_MS) {
        throw new Error('claude_review_invalid_request');
      }
      // Publishing started before writing stdin makes interrupted delivery observable and non-replayable.
      beginSessionRound(dir, next, { round_id: request.round_id, session_id: session.session_id, child: processes.child });
      active = request;
      outputBytes = 0;
      console.log(`ROUND ${next} submitted: ${request.context.subject_sha256}`);
      child.stdin.write(JSON.stringify({ type: 'user', session_id: session.session_id, parent_tool_use_id: null,
        message: { role: 'user', content: request.prompt } }) + '\n');
      timer = setTimeout(() => fail('claude_review_round_timeout; delivery is ambiguous'), request.timeout_ms);
    } catch (error) { fail(error); }
  }, 100);
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) throw new Error('claude_review_host_requires_state_directory');
  runClaudeReviewHost(dir).catch(error => {
    console.error(error);
    if (!existsSync(join(dir, 'failure.json'))) writeSessionArtifact(join(dir, 'failure.json'), { error: String(error) });
    process.exit(1);
  });
}
