import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { mockOfflineHerdr } from '../helpers/engineer-runtime-fixture';
import { commitAll, initGitRepo, run, tmpWorkspaceIn } from '../helpers/repo-fixture';
import { cleanupTaskWorktree, notifyTaskWorktreeMerged, startTaskAgent } from '../../src/effects/terminal/task-session';
import { removeExactWorktree } from '../../src/effects/state/coordination-worktree-topology';
import { herdrCommand, herdrMutation } from '../../src/effects/terminal/herdr';

const roots: string[] = [];
const restores: Array<() => void> = [];
const children: ChildProcess[] = [];
afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise<void>(resolve => child.once('exit', () => resolve()));
    }
  }
  for (const restore of restores.splice(0).reverse()) restore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function fixture(branch = 'codex/owner') {
  const base = tmpWorkspaceIn('/tmp', 'mn'); roots.push(base);
  const root = join(base, 'repo'), home = join(base, 'home'), checkout = join(base, 'repo-wt-owner');
  mkdirSync(root); mkdirSync(home); initGitRepo(root);
  writeFileSync(join(root, '.gitignore'), '.ai/\n.env\n');
  writeFileSync(join(root, 'file'), 'base'); commitAll(root, 'base');
  expect(run('git', ['worktree', 'add', '-b', branch, checkout], root).status).toBe(0);
  writeFileSync(join(checkout, 'file'), 'merged'); commitAll(checkout, 'owner change');
  expect(run('git', ['merge', '--ff-only', branch], root).status).toBe(0);
  const merge = run('git', ['rev-parse', 'HEAD'], root).stdout.trim();
  const spec = { task: 'owner-task', role: 'worker', harness_kind: 'codex',
    endpoint: { session: 'fixture', home }, parent_pane: 'fixture-parent-worker', args: [], max_requests: 1 };
  const provider = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], {
    detached: true, env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'ignore'],
  });
  children.push(provider);
  await new Promise<void>((resolve, reject) => {
    provider.stdout!.once('data', () => resolve()); provider.once('error', reject);
  });
  const offline = mockOfflineHerdr(checkout, spec);
  restores.push(() => offline.transport.mockRestore());
  const original = offline.transport.getMockImplementation()!;
  const prompts: string[][] = [];
  let mode = 'live';
  let workspaceOpened = false;
  offline.transport.mockImplementation((...args) => {
    const command = args[1];
    const response = (result: object) => ({ pid: process.pid, status: 0, signal: null, stdout: Buffer.from(JSON.stringify({ id: 'fixture', result })), stderr: Buffer.alloc(0), output: [] });
    if (mode === 'unreachable') throw new Error('fixture_endpoint_unreachable');
    if (command[0] === 'pane' && command[1] === 'close') { mode = 'owner-closed'; return response({}); }
    if (command[0] === 'workspace' && command[1] === 'close') { mode = 'workspace-closed'; return response({}); }
    if (command[0] === 'agent' && command[1] === 'prompt') {
      expect(args[0]).toEqual(spec.endpoint);
      prompts.push([...command]);
      if (mode === 'lost-ack') throw new Error('fixture_ack_lost_after_delivery');
      return response({});
    }
    if (command[0] === 'agent' && command[1] === 'list') {
      const agent = JSON.parse(original(spec.endpoint, ['agent', 'get', agentName]).stdout.toString()).result.agent;
      if (mode === 'replaced') agent.terminal_id = 'another-terminal';
      return response({ agents: mode === 'gone' ? [] : [agent] });
    }
    if (mode === 'gone' && command[0] === 'pane' && command[1] === 'list') return response({ panes: [] });
    if (['gone', 'workspace-closed'].includes(mode) && command[0] === 'workspace' && command[1] === 'list') return response({ workspaces: [] });
    if (command[0] === 'pane' && command[1] === 'process-info') return response({ process_info: {
      shell_pid: process.ppid, foreground_process_group_id: provider.pid,
      foreground_processes: [{ pid: provider.exitCode === null && provider.signalCode === null ? provider.pid : process.ppid }],
    } });
    const result = original(...args);
    if (command[0] === 'worktree' && command[1] === 'open') {
      workspaceOpened = true;
      const value = JSON.parse(result.stdout.toString()); value.result.already_open = false;
      return response(value.result);
    }
    if (!workspaceOpened && command[0] === 'workspace' && command[1] === 'list') {
      const value = JSON.parse(result.stdout.toString());
      return response({ workspaces: value.result.workspaces.filter((space: { workspace_id: string }) => space.workspace_id !== 'fixture-workspace') });
    }
    if (mode === 'owner-closed' && command[0] === 'pane' && command[1] === 'list') {
      const value = JSON.parse(result.stdout.toString());
      return response({ panes: value.result.panes.filter((pane: { pane_id: string }) => pane.pane_id === spec.parent_pane) });
    }
    if (mode === 'foreign-cwd' && command[0] === 'pane' && command[1] === 'list') {
      const value = JSON.parse(result.stdout.toString());
      for (const pane of value.result.panes) pane.foreground_cwd = root;
      return response(value.result);
    }
    return result;
  });
  let agentName = '';
  const binding = await startTaskAgent(checkout, spec, { start: async (_endpoint, name) => { agentName = name; offline.nameAgent(name); } });
  mkdirSync(join(checkout, '.ai/harness'), { recursive: true });
  writeFileSync(join(checkout, '.ai/harness/active-worktree'), checkout + '\n');
  const notice = { pr: 993, merge_sha: merge, worktree: checkout, branch };
  return { root, checkout, spec, binding, prompts, notice, setMode(value: string) { mode = value; },
    notify: () => notifyTaskWorktreeMerged(root, binding.pane_id, notice),
    async completeOwner() {
      provider.kill('SIGTERM');
      await new Promise<void>(resolve => provider.once('exit', () => resolve()));
      herdrMutation(herdrCommand(spec.endpoint, ['pane', 'close', '--pane', binding.pane_id]));
    },
    remove: () => removeExactWorktree(root, { worktree: checkout, branch: notice.branch, head_sha: merge,
      target_ref: 'main', target_oid: merge, merge_commit_sha: merge }, { closeout: true }),
  };
}

test('merge notice targets the attributed owner in the bound workspace and does not replay accepted submission', async () => {
  const f = await fixture();
  expect(await f.notify()).toEqual({ status: 'notified' });
  expect(await f.notify()).toEqual({ status: 'already_notified' });
  expect(f.prompts).toHaveLength(1);
  expect(f.prompts[0]!.slice(0, 3)).toEqual(['agent', 'prompt', f.binding.pane_id]);
  const text = f.prompts[0]![3]!;
  expect(text).toContain(JSON.stringify(f.notice));
  expect(text).toContain('Do not auto-commit or push');
  expect(text).toContain('no new merge, push or deletion authority');
  expect(existsSync(f.checkout)).toBe(true);
  expect(readFileSync(join(f.checkout, '.ai/harness/active-worktree'), 'utf8').trim()).toBe(f.checkout);
});

test('wrong checkout, branch or malformed merge readback cannot notify another owner', async () => {
  const f = await fixture();
  for (const notice of [
    { ...f.notice, worktree: f.root }, { ...f.notice, branch: 'another-branch' },
    { ...f.notice, merge_sha: '' }, { ...f.notice, pr: 0 },
  ]) await expect(notifyTaskWorktreeMerged(f.root, f.binding.pane_id, notice)).rejects.toThrow();
  expect(f.prompts).toHaveLength(0);
});

test('ordinary worker exits its owned pane before live-workspace cleanup and exact public removal of a feat branch', async () => {
  const f = await fixture('feat/owner');
  rmSync(join(f.root, '.ai/harness/runs/task-agents'), { recursive: true });
  expect(await f.notify()).toEqual({ status: 'notified' });
  expect(f.prompts).toHaveLength(1);
  expect(await cleanupTaskWorktree(f.root, f.checkout)).toMatchObject({ status: 'cleanup_pending', reason: 'extra_panes' });
  await f.completeOwner();
  expect(await cleanupTaskWorktree(f.root, f.checkout)).toEqual({ status: 'closed', pids: [] });
  const cli = join(import.meta.dir, '../../src/cli/index.ts');
  const removal = run(process.execPath, [cli, 'run', 'contract-worktree-runtime', 'remove-exact',
    '--repo', f.root, '--worktree', f.checkout, '--branch', f.notice.branch, '--head', f.notice.merge_sha,
    '--target', 'main', '--target-oid', f.notice.merge_sha, '--merge', f.notice.merge_sha], f.root);
  expect(removal.status).toBe(0);
  expect(existsSync(f.checkout)).toBe(false);
  expect(run('git', ['show-ref', '--verify', '--quiet', 'refs/heads/feat/owner'], f.root).status).not.toBe(0);
});

test('closed pane falls back to the existing closeout which releases binding, marker, checkout and branch', async () => {
  const f = await fixture(); f.setMode('gone');
  expect(await f.notify()).toEqual({ status: 'owner_gone', reason: 'workspace_closed' });
  expect(await cleanupTaskWorktree(f.root, f.checkout)).toEqual({ status: 'closed', pids: [] });
  writeFileSync(join(f.checkout, '.env'), 'ignored fixture data');
  f.remove();
  expect(existsSync(f.checkout)).toBe(false);
  expect(run('git', ['show-ref', '--verify', '--quiet', 'refs/heads/codex/owner'], f.root).status).not.toBe(0);
  expect(run('git', ['worktree', 'list', '--porcelain'], f.root).stdout).not.toContain(f.checkout);
  expect(f.prompts).toHaveLength(0);
});

test('owner closeout retains tracked changes, untracked content, unmerged commits and locks', async () => {
  const f = await fixture();
  expect(await f.notify()).toEqual({ status: 'notified' });
  f.setMode('gone');
  expect(await cleanupTaskWorktree(f.root, f.checkout)).toEqual({ status: 'closed', pids: [] });
  writeFileSync(join(f.checkout, 'file'), 'unfinished');
  expect(f.remove).toThrow('dirty');
  writeFileSync(join(f.checkout, 'file'), 'merged');
  writeFileSync(join(f.checkout, 'untracked'), 'keep');
  expect(f.remove).toThrow('dirty');
  rmSync(join(f.checkout, 'untracked'));
  expect(run('git', ['worktree', 'lock', f.checkout], f.root).status).toBe(0);
  expect(f.remove).toThrow('locked');
  expect(run('git', ['worktree', 'unlock', f.checkout], f.root).status).toBe(0);
  writeFileSync(join(f.checkout, 'file'), 'new commit'); commitAll(f.checkout, 'after merge');
  expect(f.remove).toThrow();
  expect(existsSync(f.checkout)).toBe(true);
});

test('unreachable or replaced owner identity retains state without sending a prompt', async () => {
  const f = await fixture();
  for (const mode of ['unreachable', 'replaced', 'foreign-cwd']) {
    f.setMode(mode);
    expect((await f.notify()).status).toBe('retained');
  }
  expect(f.prompts).toHaveLength(0);
  expect(existsSync(f.checkout)).toBe(true);
});

test('lost transport ACK is retained as unknown delivery and is never retried', async () => {
  const f = await fixture(); f.setMode('lost-ack');
  expect(await f.notify()).toMatchObject({ status: 'retained', reason: expect.stringContaining('delivery_unknown') });
  f.setMode('live');
  expect(await f.notify()).toMatchObject({ status: 'retained', reason: expect.stringContaining('never replay') });
  expect(f.prompts).toHaveLength(1);
});
