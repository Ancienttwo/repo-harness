import { afterEach, expect, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, statSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeSessionArtifact } from '../src/effects/terminal/task-session-io';
import type { DocCitationV1 } from '../src/core/operator/doc-citation';
import type { DocSessionEventV1 } from '../src/core/operator/doc-session-events';
import { readExclusiveDirectoryLockOwner } from '../src/effects/locking/exclusive-directory-lock';
import {
  DOC_SESSION_AGENT_LOCK, readDocSessionAgent, reconcileDocSessionAgent, requestDocSessionControl, startDocSessionAgent,
  type DocSessionAgentRecord, type DocSessionAgentState,
} from '../src/effects/operator/doc-session-agent';
import { readDocSessionEvents } from '../src/effects/operator/doc-session-events';
import { DocsReader } from '../src/effects/operator/docs-reader';
import { startOperatorServer, type OperatorServerHandle } from '../src/effects/operator/server';
import { repoHarnessRepoIdFor } from '../src/effects/repo-registry';
import { darwinTest } from './helpers/darwin-test';
import { commitAll, initGitRepo, run, tmpWorkspace } from './helpers/repo-fixture';

// Real docs host processes: the bundle that `bun run build:oar-docs-host` writes, under Node >= 24.
// The scripted fixture mode runs OAR's scripted runtime; the boundary case runs the codex path to admission.
const ENTRY = join(import.meta.dir, '..', 'dist', 'oar-docs-host.js');
const GUIDE = '# Guide\n\nThe operator reads docs.\nIt never writes main.\n';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

function resolveNode(): string {
  const node = Bun.which('node', { PATH: process.env.PATH ?? '' });
  if (!node) throw new Error('doc session agent tests need Node >= 24 on PATH');
  return realpathSync(node);
}

function host() {
  if (!existsSync(ENTRY)) throw new Error('run bun run build:oar-docs-host before the doc session agent tests');
  return { node: resolveNode(), entry: realpathSync(ENTRY) };
}

const hex = (text: string) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

/** Fake credential material only: a fixture HOME, never the operator's. */
function fakeAuth(): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return JSON.stringify({ tokens: { access_token: `${part({ alg: 'none' })}.${part({ exp: Math.floor(Date.now() / 1000) + 86_400 })}.fixture` } });
}

interface Harness {
  readonly env: NodeJS.ProcessEnv;
  readonly server: OperatorServerHandle;
  readonly cookie: string;
  readonly home: string;
  create: (instruction: string) => Promise<{ status: number; body: Record<string, any> }>;
  post: (path: string, body?: Record<string, unknown>) => Promise<{ status: number; body: Record<string, any> }>;
  sessionDir: (sid: string) => string;
}

async function harness(options: { readonly env?: NodeJS.ProcessEnv; readonly launch?: 'host' | 'none' } = {}): Promise<Harness> {
  const repo = tmpWorkspace('doc-session-agent-repo'); initGitRepo(repo);
  mkdirSync(join(repo, 'docs'));
  writeFileSync(join(repo, 'docs', 'guide.md'), GUIDE);
  commitAll(repo, 'docs');
  expect(run('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], repo).status).toBe(0);
  const state = tmpWorkspace('doc-session-agent-state');
  const home = tmpWorkspace('doc-session-agent-home');
  const worktrees = realpathSync(tmpWorkspace('doc-session-agent-worktrees'));
  const staticRoot = tmpWorkspace('doc-session-agent-ui');
  // The control root lands under this TMPDIR: `<TMPDIR>/repo-harness-docs-host/<sid>`.
  const temp = tmpWorkspace('doc-session-agent-tmp');
  writeFileSync(join(staticRoot, 'index.html'), '<!doctype html><main>operator</main>');
  mkdirSync(join(home, '.repo-harness'), { recursive: true });
  writeFileSync(join(home, '.repo-harness', 'config.json'), JSON.stringify({ agents: { enabled: ['codex'], uses: { docs: ['codex'], review: [] }, default_docs: 'codex' } }));
  mkdirSync(join(home, '.codex'));
  writeFileSync(join(home, '.codex', 'auth.json'), fakeAuth());
  const repositoryId = repoHarnessRepoIdFor(repo);
  const at = new Date().toISOString();
  writeFileSync(join(state, 'registered-repos.json'), JSON.stringify({ version: 1, authorizationRevision: 1, repos: [{
    id: repositoryId, path: repo, accessMode: 'read_only', source: 'manual', registeredAt: at, lastSeenAt: at,
  }] }));
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: home, REPO_HARNESS_HOME: state, REPO_HARNESS_WORKTREE_ROOT: worktrees, TMPDIR: temp, REPO_HARNESS_OAR_SCRIPTED_FIXTURE: '1', ...options.env,
  };
  const reader = new DocsReader({ root: repo, ref: 'refs/remotes/origin/main', env });
  reader.start();
  await reader.refresh();
  const tree = { protocol: 1, kind: 'operator_docs_tree', repository_id: repositoryId, ref: 'refs/remotes/origin/main', commit: '', collected_at: at, files: [] } as never;
  const server = await startOperatorServer({
    port: 0, static_root: staticRoot, env, docs_session_platform: 'darwin',
    read_docs: () => ({ state: 'ready', tree, reader }),
    ...(options.launch === 'none' ? { docs_agent_launcher: (): DocSessionAgentState => 'starting' } : { docs_agent_launcher: (sid: string) => startDocSessionAgent(env, sid, host) }),
  });
  const cookie = ((await fetch(`${server.url}/`)).headers.get('set-cookie') ?? '').split(';')[0]!;
  const post = async (path: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(`${server.url}${path}`, {
      method: 'POST', headers: { Origin: server.url, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ request_id: randomUUID(), ...body }),
    });
    return { status: response.status, body: JSON.parse(await response.text()) as Record<string, any> };
  };
  const commit = run('git', ['rev-parse', 'refs/remotes/origin/main'], repo).stdout.trim();
  const lines = GUIDE.match(/[^\n]*\n/gu)!;
  const citation: DocCitationV1 = { path: 'docs/guide.md', start_line: 3, end_line: 4, range_sha256: hex(lines.slice(2, 4).join('')), file_sha256: hex(GUIDE), commit };
  const h: Harness = {
    env, server, cookie, home, post,
    create: instruction => post('/api/v1/sessions', { kind: 'docs', runtime: 'codex', repository_id: repositoryId, citations: [citation], instruction }),
    sessionDir: sid => realpathSync(join(state, 'operator', 'sessions', sid)),
  };
  cleanups.push(async () => {
    await server.close();
    reader.close();
    for (const dir of [repo, state, home, worktrees, staticRoot, temp]) rmSync(dir, { recursive: true, force: true });
  });
  return h;
}

/** The host holds `agent.lock` for its whole life; its owner record names the process. */
function hostPid(h: Harness, sid: string): number | null {
  return readExclusiveDirectoryLockOwner(h.sessionDir(sid), DOC_SESSION_AGENT_LOCK)?.pid ?? null;
}

/** Every host a test started is gone after the test, whatever the test did. */
function reapHost(h: Harness, sid: string): void {
  cleanups.push(async () => {
    const pid = hostPid(h, sid);
    if (pid !== null) try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
    await Bun.sleep(50);
  });
}

async function until(h: Harness, sid: string, done: (agent: DocSessionAgentRecord) => boolean, label: string): Promise<DocSessionAgentRecord> {
  for (const deadline = Date.now() + 30_000; ;) {
    const agent = readDocSessionAgent(h.sessionDir(sid));
    if (agent && done(agent)) return agent;
    if (Date.now() > deadline) throw new Error(`agent never reached ${label}: ${JSON.stringify(agent)}\n${readFileSync(join(h.sessionDir(sid), 'host.log'), 'utf8')}`);
    await Bun.sleep(25);
  }
}

const events = (h: Harness, sid: string): readonly DocSessionEventV1[] => readDocSessionEvents(h.env, sid, null).events;
const shape = (list: readonly DocSessionEventV1[]) => list.map(({ protocol: _p, epoch: _e, seq: _s, at: _a, ...rest }) => (rest.type === 'message' ? { type: 'message', role: rest.role } : rest));
/** The control directory comes from agent.json; it is outside the repo-harness home. */
const authCopy = (h: Harness, sid: string) => join(readDocSessionAgent(h.sessionDir(sid))!.control!, 'scratch', '.codex-home', 'auth.json');

darwinTest('a launched agent runs its first turn, records it, waits idle, and a cancel stops it and removes the credential copy', async () => {
  const h = await harness();
  const created = await h.create('Tighten the intro.');
  expect([created.status, created.body.agent]).toEqual([201, 'starting']);
  const sid = created.body.session_id as string;
  reapHost(h, sid);
  const idle = await until(h, sid, agent => agent.state === 'idle', 'idle');
  expect(idle).toMatchObject({ epoch: 1, failure: null, actual_model: 'fixture-oar', credential: null, control: join(realpathSync(h.env.TMPDIR!), 'repo-harness-docs-host', sid), events_error: null });
  expect(existsSync(authCopy(h, sid))).toBe(true);
  const recorded = events(h, sid);
  expect(shape(recorded)).toEqual([
    { type: 'message', role: 'user' },
    { type: 'turn', boundary: 'started' },
    { type: 'message', role: 'agent' },
    { type: 'tool', category: 'edit', status: 'started', paths: ['docs/guide.md'] },
    { type: 'tool', category: 'edit', status: 'succeeded', paths: ['docs/guide.md'] },
    { type: 'tool', category: 'command', status: 'started', paths: [] },
    { type: 'tool', category: 'command', status: 'failed', paths: [] },
    { type: 'turn', boundary: 'ended' },
  ]);
  expect(recorded.map(event => [event.epoch, event.seq])).toEqual(recorded.map((_, seq) => [1, seq]));
  expect(recorded[0]).toMatchObject({ type: 'message', role: 'user', text: 'Tighten the intro.' });
  const log = readFileSync(join(h.sessionDir(sid), 'events.jsonl'), 'utf8');
  for (const planted of ['PLANTED', 'ghp_0123456789', 'Cited passages']) expect(log).not.toContain(planted);

  const pid = hostPid(h, sid);
  expect(pid).not.toBeNull();
  expect(await requestDocSessionControl(h.env, sid, 'cancel')).toBe('accepted');
  expect(await until(h, sid, agent => agent.state === 'stopped', 'stopped')).toMatchObject({ failure: null, credential: 'removed' });
  expect(existsSync(authCopy(h, sid))).toBe(false);
  for (const deadline = Date.now() + 10_000; hostPid(h, sid) !== null && Date.now() < deadline;) await Bun.sleep(25);
  expect(hostPid(h, sid)).toBeNull();
  expect(await requestDocSessionControl(h.env, sid, 'stop')).toBe('session_closed');
}, 60_000);

darwinTest('POST stop aborts the running turn as cancelled and keeps the session; a stop without a turn gets 409 no_active_turn', async () => {
  const h = await harness();
  const sid = (await h.create('fixture:hold the turn open')).body.session_id as string;
  reapHost(h, sid);
  await until(h, sid, agent => agent.state === 'running', 'running');
  const stopped = await h.post(`/api/v1/sessions/${sid}/stop`);
  expect(stopped).toEqual({ status: 202, body: { protocol: 1, kind: 'operator_docs_session_stop', session_id: sid, result: 'aborting' } });
  await until(h, sid, agent => agent.state === 'idle', 'idle');
  expect(shape(events(h, sid)).slice(-2)).toEqual([{ type: 'failure', category: 'cancelled' }, { type: 'turn', boundary: 'ended' }]);
  const again = await h.post(`/api/v1/sessions/${sid}/stop`);
  expect([again.status, again.body.error.code]).toEqual([409, 'no_active_turn']);
  const unknown = await h.post(`/api/v1/sessions/${'f'.repeat(32)}/stop`);
  expect([unknown.status, unknown.body.error.code]).toEqual([404, 'session_not_found']);
  expect(await requestDocSessionControl(h.env, sid, 'cancel')).toBe('accepted');
  await until(h, sid, agent => agent.state === 'stopped', 'stopped');
}, 60_000);

darwinTest('a turn past its time bound ends as timeout and the session stays', async () => {
  const h = await harness({ env: { REPO_HARNESS_DOCS_HOST_TURN_MS: '300' } });
  const sid = (await h.create('fixture:hold until the bound')).body.session_id as string;
  reapHost(h, sid);
  await until(h, sid, agent => agent.state === 'idle', 'idle');
  expect(shape(events(h, sid)).slice(-2)).toEqual([{ type: 'failure', category: 'timeout' }, { type: 'turn', boundary: 'ended' }]);
  expect(await requestDocSessionControl(h.env, sid, 'cancel')).toBe('accepted');
  await until(h, sid, agent => agent.state === 'stopped', 'stopped');
}, 60_000);

darwinTest('a killed host is reconciled: runtime_error, the open turn ended, the credential copy removed; one session never gets a second agent', async () => {
  const h = await harness();
  const sid = (await h.create('fixture:hold for the crash')).body.session_id as string;
  reapHost(h, sid);
  const running = await until(h, sid, agent => agent.state === 'running', 'running');
  // A second launch fails at agent.json; a second host process exits at agent.lock and changes nothing.
  expect(() => startDocSessionAgent(h.env, sid, host)).toThrow();
  const before = readFileSync(join(h.sessionDir(sid), 'events.jsonl'), 'utf8');
  const second = spawnSync(host().node, [host().entry, h.sessionDir(sid)], { encoding: 'utf8', timeout: 20_000, env: { PATH: process.env.PATH, HOME: h.home, REPO_HARNESS_HOME: h.env.REPO_HARNESS_HOME } });
  expect(second.status).not.toBe(0);
  expect(readDocSessionAgent(h.sessionDir(sid))).toMatchObject({ state: 'running', updated_at: running.updated_at });
  expect(readFileSync(join(h.sessionDir(sid), 'events.jsonl'), 'utf8')).toBe(before);

  process.kill(hostPid(h, sid)!, 'SIGKILL');
  expect(await until(h, sid, agent => agent.state === 'failed', 'failed')).toMatchObject({ failure: 'runtime_error', reason: 'docs_host_exited', credential: 'removed' });
  expect(shape(events(h, sid)).slice(-2)).toEqual([{ type: 'failure', category: 'runtime_error' }, { type: 'turn', boundary: 'ended' }]);
  expect(existsSync(authCopy(h, sid))).toBe(false);
}, 60_000);

darwinTest('a server start records the failure of a host that died while no server watched it', async () => {
  const h = await harness({ launch: 'none' });
  const sid = (await h.create('Tighten the intro.')).body.session_id as string;
  // The state a host leaves when it dies between two records: running, no lock owner.
  writeFileSync(join(h.sessionDir(sid), 'agent.json'), JSON.stringify({
    protocol: 1, kind: 'docs_session_agent', session_id: sid, epoch: 1, state: 'running', failure: null, reason: null,
    updated_at: new Date().toISOString(), actual_model: null, credential: null, control: null, events_error: null,
  }), { mode: 0o600 });
  const next = await startOperatorServer({ port: 0, env: h.env, static_root: tmpWorkspace('doc-session-agent-ui-2'), docs_agent_launcher: () => 'starting' });
  cleanups.push(() => next.close());
  expect(readDocSessionAgent(h.sessionDir(sid))).toMatchObject({ state: 'failed', failure: 'runtime_error', reason: 'docs_host_exited' });
  expect(shape(events(h, sid))).toEqual([{ type: 'failure', category: 'runtime_error' }]);
}, 60_000);

darwinTest('a docs host whose admission or boundary proof fails records boundary_denied, opens no runtime session and removes the credential copy', async () => {
  const fake = tmpWorkspace('doc-session-agent-codex');
  cleanups.push(() => rmSync(fake, { recursive: true, force: true }));
  // A stand-in vendor executable outside the worktree: it answers the OAR installation probe and logs each call.
  const codex = join(fake, 'codex');
  writeFileSync(codex, `#!/bin/sh\necho "$@" >> '${join(fake, 'calls.log')}'\n[ "$1" = "--version" ] && echo "codex-cli 0.0.0-fixture"\nexit 0\n`);
  chmodSync(codex, 0o755);
  const h = await harness({ launch: 'none', env: { REPO_HARNESS_OAR_SCRIPTED_FIXTURE: '', OAR_CODEX_BIN: codex } });
  const created = await h.create('Tighten the intro.');
  const sid = created.body.session_id as string;
  const record = JSON.parse(readFileSync(join(h.sessionDir(sid), 'session.json'), 'utf8'));
  // A hard link inside docs/ could carry a write to a protected inode, so admission refuses it.
  linkSync(join(record.worktree, 'docs', 'guide.md'), join(record.worktree, 'docs', 'alias.md'));
  expect(startDocSessionAgent(h.env, sid, host)).toBe('starting');
  reapHost(h, sid);
  const failed = await until(h, sid, agent => agent.state === 'failed', 'failed');
  expect(failed).toMatchObject({ failure: 'boundary_denied', reason: 'docs_host_docs_hardlink_unsupported', credential: 'removed' });
  expect(shape(events(h, sid))).toEqual([{ type: 'failure', category: 'boundary_denied' }]);
  expect(existsSync(authCopy(h, sid))).toBe(false);
  expect(readFileSync(join(fake, 'calls.log'), 'utf8')).not.toContain('--listen');
}, 60_000);

/**
 * A dead host's session: agent.json running, a fake credential copy in its control directory, and an
 * event log that ends in a torn line (the host died during an append). The lock owner is a real process.
 */
function deadHostSession(): { env: NodeJS.ProcessEnv; sid: string; directory: string; copy: string; log: string; torn: string; cleanup: () => void } {
  const state = tmpWorkspace('doc-session-agent-crash-state'), temp = tmpWorkspace('doc-session-agent-crash-tmp');
  const sid = 'd'.repeat(32), directory = join(state, 'operator', 'sessions', sid), control = join(temp, 'repo-harness-docs-host', sid);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, 'session.json'), '{}');
  mkdirSync(join(control, 'scratch', '.codex-home'), { recursive: true, mode: 0o700 });
  const copy = join(control, 'scratch', '.codex-home', 'auth.json');
  writeFileSync(copy, fakeAuth(), { mode: 0o600 });
  writeFileSync(join(directory, 'agent.json'), JSON.stringify({
    protocol: 1, kind: 'docs_session_agent', session_id: sid, epoch: 1, state: 'running', failure: null, reason: null,
    updated_at: new Date().toISOString(), actual_model: null, credential: null, control, events_error: null,
  }), { mode: 0o600 });
  const log = join(directory, 'events.jsonl');
  const torn = `${JSON.stringify({ protocol: 1, epoch: 1, seq: 0, at: '2026-10-29T00:00:00.000Z', type: 'turn', boundary: 'started' })}\n{"protocol":1`;
  writeFileSync(log, torn, { mode: 0o600 });
  return { env: { HOME: state, REPO_HARNESS_HOME: state }, sid, directory: realpathSync(directory), copy, log, torn,
    cleanup: () => { for (const dir of [state, temp]) rmSync(dir, { recursive: true, force: true }); } };
}

/** A real process takes `agent.lock` and either exits holding it (a dead owner) or keeps running (a live owner). */
function lockOwner(directory: string, exit: boolean): ReturnType<typeof spawn> {
  const lock = join(import.meta.dir, '..', 'src', 'effects', 'locking', 'exclusive-directory-lock.ts');
  const script = `const { acquireExclusiveDirectoryLock } = await import(${JSON.stringify(lock)}); acquireExclusiveDirectoryLock(${JSON.stringify(directory)}, ${JSON.stringify(DOC_SESSION_AGENT_LOCK)});`
    + (exit ? 'process.exit(0);' : 'console.log("held"); setInterval(() => {}, 1000);');
  return spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
}

test('a dead host with a torn event log still loses its credential copy and gets a failed state; reconcile repeats safely; a live host keeps its session', async () => {
  const s = deadHostSession();
  cleanups.push(s.cleanup);
  const live = lockOwner(s.directory, false);
  await new Promise<void>(resolve => live.stdout!.once('data', () => resolve()));
  try {
    reconcileDocSessionAgent(s.env, s.sid);
    expect(readDocSessionAgent(s.directory)).toMatchObject({ state: 'running', credential: null, events_error: null });
    expect(existsSync(s.copy)).toBe(true);
  } finally {
    live.kill('SIGKILL');
    await new Promise(resolve => live.once('exit', resolve));
  }
  // SIGKILL leaves the lock to a dead owner. The first reconcile ends the session; the second finds it terminal and changes nothing.
  for (let attempt = 0; attempt < 2; attempt++) reconcileDocSessionAgent(s.env, s.sid);
  expect(readDocSessionAgent(s.directory)).toMatchObject({
    state: 'failed', failure: 'runtime_error', reason: 'docs_host_exited', credential: 'removed', events_error: 'events_unavailable',
  });
  expect(existsSync(s.copy)).toBe(false);
  // The damaged log is kept as it was; nothing truncates or rewrites it.
  expect(readFileSync(s.log, 'utf8')).toBe(s.torn);
}, 60_000);

test('a host that exited holding agent.lock is a proven dead owner, and a missing control directory is no credential copy', async () => {
  const s = deadHostSession();
  cleanups.push(s.cleanup);
  rmSync(join(s.copy, '..', '..', '..'), { recursive: true, force: true });
  const dead = lockOwner(s.directory, true);
  expect(await new Promise(resolve => dead.once('exit', resolve))).toBe(0);
  expect(readExclusiveDirectoryLockOwner(s.directory, DOC_SESSION_AGENT_LOCK)?.pid).toBe(dead.pid);
  reconcileDocSessionAgent(s.env, s.sid);
  expect(readDocSessionAgent(s.directory)).toMatchObject({ state: 'failed', credential: 'absent', events_error: 'events_unavailable' });
  expect(readFileSync(s.log, 'utf8')).toBe(s.torn);
}, 60_000);


// These cases exercise the real host process with OAR's zero-provider scripted runtime.
// They verify message delivery, not native isolation or real-model D1 acceptance.
test('message HTTP delivers queue and steer once, ignores old epochs, then CLI prompts the idle host', async () => {
  const h = await harness();
  const sid = (await h.create('fixture:hold the first turn')).body.session_id as string;
  reapHost(h, sid);
  await until(h, sid, agent => agent.state === 'running', 'running');
  const path = `/api/v1/sessions/${sid}/messages`;
  const request_id = randomUUID();
  const queued = { request_id, text: 'Run the follow-up.', when: 'after_turn' };
  const accepted = await h.post(path, queued);
  expect(accepted).toEqual({ status: 202, body: { protocol: 1, kind: 'operator_docs_session_message', session_id: sid, landed: 'queued' } });
  expect(await h.post(path, queued)).toEqual(accepted);
  const mismatch = await h.post(path, { ...queued, text: 'Different input.' });
  expect([mismatch.status, mismatch.body.error.code]).toEqual([409, 'request_mismatch']);
  expect((await h.post(path, { text: 'Tighten this turn.', when: 'now' })).body.landed).toBe('steered');
  const requests = join(h.sessionDir(sid), 'requests');
  const oldId = randomUUID();
  writeSessionArtifact(join(requests, `message-${oldId}.json`), { kind: 'message', epoch: 0, input_id: oldId, text: 'Obsolete epoch text.', when: 'now' });
  expect((await h.post(`/api/v1/sessions/${sid}/stop`)).status).toBe(202);
  await until(h, sid, agent => agent.state === 'idle', 'idle after queued turn');
  const cli = Bun.spawn([process.execPath, join(import.meta.dir, '../src/cli/index.ts'), 'operator', 'doc-sessions', 'message', sid,
    '--text', 'An idle follow-up.', '--when', 'now', '--request-id', randomUUID(), '--json'], { env: h.env, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(cli.stdout).text(), new Response(cli.stderr).text(), cli.exited]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  expect(JSON.parse(stdout)).toMatchObject({ status: 202, session_id: sid, landed: 'prompted' });
  await until(h, sid, agent => agent.state === 'idle', 'idle after CLI');
  const recorded = events(h, sid);
  const userMessages = recorded.filter(event => event.type === 'message' && event.role === 'user');
  expect(userMessages.map(event => (event as { text: string }).text)).toEqual(['fixture:hold the first turn', queued.text, 'Tighten this turn.', 'An idle follow-up.']);
  expect(recorded.map(event => [event.epoch, event.seq])).toEqual(recorded.map((_, seq) => [1, seq]));
  for (const file of readdirSync(requests)) expect(statSync(join(requests, file)).mode & 0o777).toBe(0o600);
  expect(await requestDocSessionControl(h.env, sid, 'cancel')).toBe('accepted');
  await until(h, sid, agent => agent.state === 'stopped', 'stopped');
  const closed = await h.post(path, { text: 'Cannot deliver.', when: 'now' });
  expect([closed.status, closed.body.error.code]).toEqual([409, 'session_closed']);
}, 60_000);

test('message HTTP validates a closed schema and browser authorization before creating host requests', async () => {
  const h = await harness({ launch: 'none' });
  const sid = (await h.create('Not launched.')).body.session_id as string;
  const path = `/api/v1/sessions/${sid}/messages`;
  for (const fields of [{ text: '', when: 'now' }, { text: 'x', when: 'later' }, { text: 'x', when: 'now', extra: true }, { text: 'x'.repeat(16_385), when: 'now' }]) {
    expect((await h.post(path, fields)).status).toBe(400);
  }
  const response = await fetch(`${h.server.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: randomUUID(), text: 'x', when: 'now' }) });
  expect(response.status).toBe(403);
  expect(existsSync(join(h.sessionDir(sid), 'requests'))).toBe(false);
}, 60_000);


test('a lost message acknowledgement keeps intent unresolved and neither HTTP retry nor concurrent stop replays it', async () => {
  const h = await harness({ launch: 'none' });
  const sid = (await h.create('No listening host.')).body.session_id as string;
  const directory = h.sessionDir(sid);
  const at = new Date().toISOString();
  writeSessionArtifact(join(directory, 'agent.json'), {
    protocol: 1, kind: 'docs_session_agent', session_id: sid, epoch: 1, state: 'idle', failure: null, reason: null,
    updated_at: at, started_at: at, actual_model: null, credential: null, control: null, events_error: null,
  });
  const path = `/api/v1/sessions/${sid}/messages`;
  const input = { request_id: randomUUID(), text: 'Delivery is unknown.', when: 'now' };
  const requests = join(directory, 'requests');
  mkdirSync(requests, { mode: 0o700 });
  const pending = h.post(path, input);
  for (const deadline = Date.now() + 5_000; !existsSync(requests) || readdirSync(requests).length === 0;) {
    if (Date.now() > deadline) throw new Error('message request was not published');
    await Bun.sleep(10);
  }
  const concurrent = await h.post(`/api/v1/sessions/${sid}/stop`);
  expect([concurrent.status, concurrent.body.error.code]).toEqual([503, 'busy']);
  // Model an owner loss after the durable request, before an acknowledgement.
  const agent = readDocSessionAgent(directory)!;
  writeSessionArtifact(join(directory, 'agent.json'), { ...agent, state: 'failed', failure: 'runtime_error' }, false);
  const unknown = await pending;
  expect([unknown.status, unknown.body.error.code]).toEqual([409, 'reconcile_required']);
  expect(await h.post(path, input)).toEqual(unknown);
  expect(readdirSync(requests)).toHaveLength(1);
  const audit = readFileSync(join(h.env.REPO_HARNESS_HOME!, 'operator', 'audit.jsonl'), 'utf8');
  expect(audit).not.toContain(input.text);
  expect(audit.split('\n').filter(line => line.includes(input.request_id)).map(line => JSON.parse(line).phase)).toEqual(['intent']);
}, 60_000);


test('idle disposal resumes the same native identity at the next epoch through HTTP and CLI without replaying the first instruction', async () => {
  const h = await harness({ env: { REPO_HARNESS_DOCS_HOST_IDLE_MS: '1000' } });
  const sid = (await h.create('The original instruction.')).body.session_id as string;
  reapHost(h, sid);
  const first = await until(h, sid, agent => agent.state === 'stopped', 'idle disposal');
  expect(first).toMatchObject({ epoch: 1, reason: 'docs_host_idle', credential: 'removed' });
  expect(typeof first.native_session_id).toBe('string');
  expect(existsSync(authCopy(h, sid))).toBe(false);
  const before = events(h, sid);
  const cursor = `${before.at(-1)!.epoch}.${before.at(-1)!.seq}`;
  const detail = await fetch(`${h.server.url}/api/v1/sessions/${sid}`, { headers: { Cookie: h.cookie } });
  expect(detail.status).toBe(200);
  expect(await detail.text()).not.toContain(first.native_session_id!);
  expect(readDocSessionAgent(h.sessionDir(sid))).toEqual(first);
  // Native history uses this same private directory; this marker only proves directory preservation.
  const marker = join(first.control!, 'scratch', '.codex-home', 'history-fixture');
  writeFileSync(marker, 'preserved private directory');
  const freshAuth = `${fakeAuth()}\n`;
  writeFileSync(join(h.home, '.codex', 'auth.json'), freshAuth);
  const oldId = randomUUID();
  writeSessionArtifact(join(h.sessionDir(sid), 'requests', `stop-${oldId}.json`), { kind: 'stop', epoch: 1 });
  const request_id = randomUUID();
  const input = { request_id, text: 'Continue this conversation.', when: 'now' };
  const response = await h.post(`/api/v1/sessions/${sid}/messages`, input);
  expect([response.status, response.body.landed]).toEqual([202, 'prompted']);
  const second = await until(h, sid, agent => agent.epoch === 2 && agent.state === 'idle', 'resumed turn complete');
  expect(second).toMatchObject({ epoch: 2, native_session_id: first.native_session_id, control: first.control });
  expect(readFileSync(marker, 'utf8')).toBe('preserved private directory');
  expect(readFileSync(authCopy(h, sid), 'utf8')).toBe(freshAuth);
  expect(existsSync(join(h.sessionDir(sid), 'requests', `stop-${oldId}.ack.json`))).toBe(false);
  const recorded = events(h, sid);
  expect(recorded.slice(0, before.length)).toEqual([...before]);
  expect(recorded.slice(before.length).map(event => [event.epoch, event.seq])).toEqual(recorded.slice(before.length).map((_, seq) => [2, seq]));
  expect(recorded.filter(event => event.type === 'message' && event.role === 'user').map(event => (event as { text: string }).text)).toEqual(['The original instruction.', input.text]);
  const tailResponse = await fetch(`${h.server.url}/api/v1/sessions/${sid}/events?after=${cursor}`, { headers: { Cookie: h.cookie } });
  expect(tailResponse.status).toBe(200);
  const tail = await tailResponse.json() as { events: DocSessionEventV1[] };
  expect(tail.events).toEqual(recorded.slice(before.length));
  // Same request across HTTP and CLI reads the audit result; it does not send another input or advance epoch.
  const cli = Bun.spawn([process.execPath, join(import.meta.dir, '../src/cli/index.ts'), 'operator', 'doc-sessions', 'message', sid,
    '--text', input.text, '--when', 'now', '--request-id', request_id, '--json'], { env: h.env, stdout: 'pipe', stderr: 'pipe' });
  expect(await cli.exited).toBe(0);
  expect(JSON.parse(await new Response(cli.stdout).text())).toMatchObject({ status: 202, landed: 'prompted' });
  expect(events(h, sid)).toEqual(recorded);
  await until(h, sid, agent => agent.state === 'stopped', 'second idle disposal');
  // A fresh CLI request resumes once more using the same audited entrypoint.
  const next = Bun.spawn([process.execPath, join(import.meta.dir, '../src/cli/index.ts'), 'operator', 'doc-sessions', 'message', sid,
    '--text', 'Third epoch.', '--when', 'after_turn', '--json'], { env: h.env, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(next.stdout).text(), new Response(next.stderr).text(), next.exited]);
  expect({ code, err }).toEqual({ code: 0, err: '' });
  expect(JSON.parse(out)).toMatchObject({ status: 202, landed: 'prompted' });
  expect(readDocSessionAgent(h.sessionDir(sid))).toMatchObject({ epoch: 3, native_session_id: first.native_session_id });
  expect(await requestDocSessionControl(h.env, sid, 'cancel')).toBe('accepted');
  await until(h, sid, agent => agent.state === 'stopped', 'cancelled');
  const closed = await h.post(`/api/v1/sessions/${sid}/messages`, { text: 'Cannot resume cancel.', when: 'now' });
  expect([closed.status, closed.body.error.code]).toEqual([409, 'session_closed']);
}, 60_000);

test('resume credential failure preserves earlier conversation and leaves an unresolved request without retrying a host', async () => {
  const h = await harness({ env: { REPO_HARNESS_DOCS_HOST_IDLE_MS: '100' } });
  const sid = (await h.create('Existing conversation.')).body.session_id as string;
  reapHost(h, sid);
  await until(h, sid, agent => agent.state === 'stopped', 'idle disposal');
  const before = events(h, sid);
  writeFileSync(join(h.home, '.codex', 'auth.json'), '{}');
  const input = { request_id: randomUUID(), text: 'Must not reach the runtime.', when: 'now' };
  const response = await h.post(`/api/v1/sessions/${sid}/messages`, input);
  expect([response.status, response.body.error.code]).toEqual([409, 'reconcile_required']);
  const failed = readDocSessionAgent(h.sessionDir(sid))!;
  expect(failed).toMatchObject({ epoch: 2, state: 'failed', failure: 'runtime_error' });
  expect(existsSync(authCopy(h, sid))).toBe(false);
  expect(events(h, sid).slice(0, before.length)).toEqual([...before]);
  expect(events(h, sid).slice(before.length)).toMatchObject([{ epoch: 2, seq: 0, type: 'failure', category: 'runtime_error' }]);
  expect(await h.post(`/api/v1/sessions/${sid}/messages`, input)).toEqual(response);
  expect(readDocSessionAgent(h.sessionDir(sid))).toEqual(failed);
}, 60_000);


test('resume rejects a replaced control directory and cleanup never follows it to another credential copy', async () => {
  const h = await harness({ env: { REPO_HARNESS_DOCS_HOST_IDLE_MS: '100' } });
  const sid = (await h.create('Keep the conversation.')).body.session_id as string;
  reapHost(h, sid);
  const old = await until(h, sid, agent => agent.state === 'stopped', 'idle disposal');
  const outside = tmpWorkspace('doc-session-other-control');
  cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
  mkdirSync(join(outside, 'scratch', '.codex-home'), { recursive: true, mode: 0o700 });
  const otherCopy = join(outside, 'scratch', '.codex-home', 'auth.json');
  writeFileSync(otherCopy, 'must remain', { mode: 0o600 });
  renameSync(old.control!, `${old.control!}-retained`);
  symlinkSync(outside, old.control!);
  const response = await h.post(`/api/v1/sessions/${sid}/messages`, { text: 'Do not open.', when: 'now' });
  expect([response.status, response.body.error.code]).toEqual([409, 'reconcile_required']);
  expect(readDocSessionAgent(h.sessionDir(sid))).toMatchObject({ epoch: 2, state: 'failed', failure: 'boundary_denied', credential: 'cleanup_pending' });
  expect(readFileSync(otherCopy, 'utf8')).toBe('must remain');
}, 60_000);

test('concurrent resume requests share the target lock and a late old-epoch child cannot advance the session', async () => {
  const h = await harness({ env: { REPO_HARNESS_DOCS_HOST_IDLE_MS: '100' } });
  const sid = (await h.create('First turn.')).body.session_id as string;
  reapHost(h, sid);
  const old = await until(h, sid, agent => agent.state === 'stopped', 'idle disposal');
  const path = `/api/v1/sessions/${sid}/messages`;
  const responses = await Promise.all([
    h.post(path, { text: 'fixture:hold new epoch', when: 'now' }),
    h.post(path, { text: 'A competing resume.', when: 'now' }),
  ]);
  expect(responses.map(response => response.status).sort()).toEqual([202, 503]);
  expect(responses.find(response => response.status === 503)!.body.error.code).toBe('busy');
  const second = readDocSessionAgent(h.sessionDir(sid))!;
  expect(second).toMatchObject({ epoch: 2, native_session_id: old.native_session_id });
  const late = spawnSync(host().node, [host().entry, h.sessionDir(sid), '--resume-epoch', '1'], { env: h.env, encoding: 'utf8', timeout: 5_000 });
  expect(late.status).not.toBe(0);
  expect(readDocSessionAgent(h.sessionDir(sid))!.epoch).toBe(2);
  expect(await requestDocSessionControl(h.env, sid, 'cancel')).toBe('accepted');
  await until(h, sid, agent => agent.state === 'stopped', 'cancelled');
}, 60_000);
