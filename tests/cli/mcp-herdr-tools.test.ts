import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { SpawnSyncReturns } from 'child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { mcpAuditLogPath } from '../../src/cli/mcp/audit';
import { callHerdrTool, MAX_TASK_PROMPT_BYTES, type HerdrToolContext } from '../../src/cli/mcp/herdr-tools';
import { readRegisteredRepoHarnessRepos, registerRepoHarnessRepo, setRepoHarnessAccessMode } from '../../src/effects/repo-registry';
import type { HerdrSpawn } from '../../src/effects/terminal/herdr';
import { notifyInstallRecordPath, writeNotifyInstallRecord } from '../../src/effects/terminal/herdr-notify-install';
import { commitAll, initGitRepo, run, tmpWorkspace } from '../helpers/repo-fixture';

interface Fixture {
  readonly root: string;
  readonly granted: string;
  readonly grantedWorktree: string;
  readonly readOnly: string;
  readonly unregistered: string;
  readonly plainDir: string;
  readonly grantedId: string;
}

let fixture: Fixture;
let previousHome: string | undefined;

function adoptedRepo(root: string, name: string): string {
  const repo = join(root, name);
  mkdirSync(join(repo, '.ai/harness'), { recursive: true });
  writeFileSync(join(repo, '.ai/harness/policy.json'), '{}\n');
  initGitRepo(repo);
  commitAll(repo, 'fixture');
  return repo;
}

beforeEach(() => {
  const root = tmpWorkspace('repo-harness-mcp-herdr-tools');
  previousHome = process.env.REPO_HARNESS_HOME;
  process.env.REPO_HARNESS_HOME = join(root, 'home');
  const granted = adoptedRepo(root, 'granted');
  const grantedWorktree = join(root, 'granted-wt');
  expect(run('git', ['worktree', 'add', '-b', 'task', grantedWorktree], granted).status).toBe(0);
  const readOnly = adoptedRepo(root, 'read-only');
  const unregistered = adoptedRepo(root, 'unregistered');
  const plainDir = join(root, 'plain');
  mkdirSync(plainDir);
  expect(setRepoHarnessAccessMode(granted, 'read_write').accessMode).toBe('read_write');
  expect(registerRepoHarnessRepo(readOnly, 'manual').registered).toBe(true);
  const grantedId = readRegisteredRepoHarnessRepos({ adoptedOnly: true }).find((repo) => repo.path === granted)!.id;
  writeNotifyInstallRecord('default');
  fixture = { root, granted, grantedWorktree, readOnly, unregistered, plainDir, grantedId };
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.REPO_HARNESS_HOME;
  else process.env.REPO_HARNESS_HOME = previousHome;
  rmSync(fixture.root, { recursive: true, force: true });
});

/** Agents in the shape `herdr agent list` returns (herdr 0.9.3). */
function herdrAgents(f: Fixture): Record<string, unknown>[] {
  const agent = (pane_id: string, cwd: string, foreground_cwd: string, extra: Record<string, unknown> = {}) => ({
    agent: 'claude', agent_status: 'idle', cwd, foreground_cwd, pane_id,
    terminal_title: `title ${pane_id}`, terminal_title_stripped: `title ${pane_id}`,
    tab_id: 'w1:t1', terminal_id: `term-${pane_id}`, workspace_id: 'w1', focused: false, revision: 1,
    ...extra,
  });
  return [
    agent('w1:p1', f.granted, f.granted, { name: 'primary' }),
    agent('w1:p2', f.plainDir, join(f.grantedWorktree, '.ai'), { agent: 'codex', agent_status: 'working' }),
    // The foreground process decides scope, not the pane's start directory.
    agent('w1:p3', f.granted, f.unregistered),
    agent('w1:p4', f.readOnly, f.readOnly),
    agent('w1:p5', f.plainDir, f.plainDir),
    agent('w1:p6', 'granted', 'granted'),
  ];
}

interface FakeHerdr {
  readonly spawn: HerdrSpawn;
  readonly calls: string[][];
}

function fakeHerdr(f: Fixture, readOutput = 'line one\n'): FakeHerdr {
  const calls: string[][] = [];
  const reply = (stdout: string): SpawnSyncReturns<Buffer> => ({
    pid: 1, output: [], stdout: Buffer.from(stdout), stderr: Buffer.alloc(0), status: 0, signal: null,
  });
  const spawn: HerdrSpawn = (command, args) => {
    expect(command).toBe('herdr');
    calls.push([...args]);
    const subcommand = args.slice(2, 4).join(' ');
    if (subcommand === 'agent list') {
      return reply(JSON.stringify({ id: 'cli:agent:list', result: { type: 'agent_list', agents: herdrAgents(f) } }));
    }
    if (subcommand === 'agent prompt') return reply('');
    if (subcommand === 'agent read') return reply(readOutput);
    throw new Error(`unexpected herdr call: ${args.join(' ')}`);
  };
  return { spawn, calls };
}

function context(herdr: FakeHerdr): HerdrToolContext {
  return { repoRoot: fixture.granted, spawn: herdr.spawn, env: { REPO_HARNESS_HOME: process.env.REPO_HARNESS_HOME } };
}

function auditEntries(): Array<Record<string, unknown>> {
  return readFileSync(mcpAuditLogPath(fixture.granted), 'utf-8').trim().split('\n').map((line) => JSON.parse(line));
}

describe('herdr task dispatch tools', () => {
  test('list returns only agents whose foreground cwd is in a read_write repo or its linked worktree', async () => {
    const herdr = fakeHerdr(fixture);
    const result = await callHerdrTool(context(herdr), 'list_task_agents', {});
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      agents: [
        { pane_id: 'w1:p1', name: 'primary', agent: 'claude', agent_status: 'idle', repo_id: fixture.grantedId, title: 'title w1:p1' },
        { pane_id: 'w1:p2', name: null, agent: 'codex', agent_status: 'working', repo_id: fixture.grantedId, title: 'title w1:p2' },
      ],
    });
    expect(herdr.calls).toEqual([['--session', 'default', 'agent', 'list']]);
    expect(auditEntries()).toEqual([expect.objectContaining({ tool: 'list_task_agents', status: 'ok' })]);
  });

  test('an inherited GIT_DIR does not pull other panes into the granted repo', async () => {
    const previousGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = join(fixture.granted, '.git');
    try {
      const result = await callHerdrTool(context(fakeHerdr(fixture)), 'list_task_agents', {});
      expect((result.structuredContent as { agents: Array<{ pane_id: string }> }).agents.map((agent) => agent.pane_id))
        .toEqual(['w1:p1', 'w1:p2']);
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
    }
  });

  test('the Herdr session comes from the notify install record, not HERDR_SESSION', async () => {
    writeNotifyInstallRecord('work');
    const herdr = fakeHerdr(fixture);
    await callHerdrTool({ ...context(herdr), env: { REPO_HARNESS_HOME: process.env.REPO_HARNESS_HOME, HERDR_SESSION: 'other' } }, 'list_task_agents', {});
    expect(herdr.calls).toEqual([['--session', 'work', 'agent', 'list']]);
  });

  test('a missing or invalid notify install record blocks the call before any herdr command', async () => {
    const recordPath = notifyInstallRecordPath();
    for (const [record, code] of [[null, 'notify_session_missing'], ['{"session":"work"}\n', 'notify_session_invalid']] as const) {
      if (record === null) rmSync(recordPath);
      else writeFileSync(recordPath, record);
      for (const [tool, args] of [
        ['list_task_agents', {}],
        ['prompt_task_agent', { pane_id: 'w1:p1', text: 'continue' }],
        ['read_task_agent', { pane_id: 'w1:p1' }],
      ] as const) {
        const herdr = fakeHerdr(fixture);
        const result = await callHerdrTool(context(herdr), tool, args);
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ error: { code } });
        expect(herdr.calls).toEqual([]);
      }
    }
    const entries = auditEntries();
    expect(entries).toHaveLength(6);
    expect(entries.every((entry) => entry.status === 'blocked')).toBe(true);
  });

  test('prompt and read refuse an out-of-scope or unknown pane without running a pane command', async () => {
    for (const paneId of ['w1:p3', 'w1:p4', 'w1:p5', 'w1:p6', 'w9:p9']) {
      for (const [tool, args] of [
        ['prompt_task_agent', { pane_id: paneId, text: 'run the tests' }],
        ['read_task_agent', { pane_id: paneId }],
      ] as const) {
        const herdr = fakeHerdr(fixture);
        const result = await callHerdrTool(context(herdr), tool, args);
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ error: { code: 'PANE_NOT_IN_SCOPE' } });
        expect(herdr.calls).toEqual([['--session', 'default', 'agent', 'list']]);
      }
    }
    expect(auditEntries().every((entry) => entry.status === 'blocked')).toBe(true);
  });

  test('invalid arguments run no herdr command', async () => {
    const cases: Array<[Parameters<typeof callHerdrTool>[1], Record<string, unknown>]> = [
      ['prompt_task_agent', { pane_id: 'w1:p1', text: 'x'.repeat(MAX_TASK_PROMPT_BYTES + 1) }],
      ['prompt_task_agent', { pane_id: 'w1:p1', text: '   ' }],
      ['prompt_task_agent', { pane_id: '--help', text: 'hello' }],
      ['read_task_agent', { pane_id: 'w1:p1', lines: 401 }],
      ['read_task_agent', { pane_id: 'w1:p1', lines: 1.5 }],
      ['list_task_agents', { repo_path: fixture.granted }],
    ];
    for (const [tool, args] of cases) {
      const herdr = fakeHerdr(fixture);
      const result = await callHerdrTool(context(herdr), tool, args);
      expect(result.structuredContent).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
      expect(herdr.calls).toEqual([]);
    }
  });

  test('prompt submits the text to an in-scope pane after a fresh scope check', async () => {
    const herdr = fakeHerdr(fixture);
    const text = '--wait is plain prompt text';
    const result = await callHerdrTool(context(herdr), 'prompt_task_agent', { pane_id: 'w1:p2', text });
    expect(result.structuredContent).toEqual({ pane_id: 'w1:p2', repo_id: fixture.grantedId, submitted: true });
    expect(herdr.calls).toEqual([
      ['--session', 'default', 'agent', 'list'],
      ['--session', 'default', 'agent', 'prompt', 'w1:p2', text],
    ]);
    const [entry] = auditEntries();
    expect(entry).toMatchObject({ tool: 'prompt_task_agent', status: 'ok', repoId: fixture.grantedId });
    expect(JSON.stringify(entry)).not.toContain(text);
  });

  test('read returns redacted recent output with the default and requested line count', async () => {
    const herdr = fakeHerdr(fixture, 'build ok\nOPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz\n');
    const result = await callHerdrTool(context(herdr), 'read_task_agent', { pane_id: 'w1:p1' });
    const value = result.structuredContent as { text: string; lines: number; repo_id: string };
    expect(value).toMatchObject({ pane_id: 'w1:p1', repo_id: fixture.grantedId, lines: 120 });
    expect(value.text).toContain('build ok');
    expect(value.text).toContain('OPENAI_API_KEY=[REDACTED]');
    expect(value.text).not.toContain('abcdefghijklmnopqrstuvwxyz');
    expect(herdr.calls[1]).toEqual(['--session', 'default', 'agent', 'read', 'w1:p1', '--source', 'recent-unwrapped', '--lines', '120']);

    await callHerdrTool(context(herdr), 'read_task_agent', { pane_id: 'w1:p1', lines: 400 });
    expect(herdr.calls[3]).toEqual(['--session', 'default', 'agent', 'read', 'w1:p1', '--source', 'recent-unwrapped', '--lines', '400']);
  });

  test('a revoked grant takes the pane out of scope at the next call', async () => {
    const herdr = fakeHerdr(fixture);
    expect((await callHerdrTool(context(herdr), 'list_task_agents', {})).structuredContent).toMatchObject({ agents: [{}, {}] });
    setRepoHarnessAccessMode(fixture.granted, 'read_only');
    const result = await callHerdrTool(context(herdr), 'prompt_task_agent', { pane_id: 'w1:p1', text: 'continue' });
    expect(result.structuredContent).toMatchObject({ error: { code: 'PANE_NOT_IN_SCOPE' } });
    expect(herdr.calls.some((call) => call[3] === 'prompt')).toBe(false);
  });

  test('a failed herdr command is reported and audited as failed', async () => {
    const calls: string[][] = [];
    const spawn: HerdrSpawn = (_command, args) => {
      calls.push([...args]);
      return { pid: 1, output: [], stdout: Buffer.from('{"error":{"code":"server_unavailable"}}'), stderr: Buffer.alloc(0), status: 1, signal: null };
    };
    const result = await callHerdrTool({ repoRoot: fixture.granted, spawn, env: { REPO_HARNESS_HOME: process.env.REPO_HARNESS_HOME } }, 'list_task_agents', {});
    expect(result.structuredContent).toMatchObject({ error: { code: 'HERDR_UNAVAILABLE' } });
    expect(auditEntries()).toEqual([expect.objectContaining({ tool: 'list_task_agents', status: 'failed' })]);
  });
});
