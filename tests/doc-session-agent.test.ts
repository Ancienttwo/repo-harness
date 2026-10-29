import { afterEach, expect } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { DocCitationV1 } from '../src/core/operator/doc-citation';
import type { DocSessionEventV1 } from '../src/core/operator/doc-session-events';
import { readExclusiveDirectoryLockOwner } from '../src/effects/locking/exclusive-directory-lock';
import {
  DOC_SESSION_AGENT_LOCK, docSessionControlDirectory, readDocSessionAgent, requestDocSessionControl, startDocSessionAgent,
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
    PATH: process.env.PATH, HOME: home, REPO_HARNESS_HOME: state, REPO_HARNESS_WORKTREE_ROOT: worktrees, REPO_HARNESS_OAR_SCRIPTED_FIXTURE: '1', ...options.env,
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
    for (const dir of [repo, state, home, worktrees, staticRoot]) rmSync(dir, { recursive: true, force: true });
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
const authCopy = (h: Harness, sid: string) => join(docSessionControlDirectory(h.sessionDir(sid)), 'scratch', '.codex-home', 'auth.json');

darwinTest('a launched agent runs its first turn, records it, waits idle, and a cancel stops it and removes the credential copy', async () => {
  const h = await harness();
  const created = await h.create('Tighten the intro.');
  expect([created.status, created.body.agent]).toEqual([201, 'starting']);
  const sid = created.body.session_id as string;
  reapHost(h, sid);
  const idle = await until(h, sid, agent => agent.state === 'idle', 'idle');
  expect(idle).toMatchObject({ epoch: 1, failure: null, actual_model: 'fixture-oar', credential: null });
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
    updated_at: new Date().toISOString(), actual_model: null, credential: null,
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
