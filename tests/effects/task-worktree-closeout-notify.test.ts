import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { mockOfflineHerdr } from '../helpers/engineer-runtime-fixture';
import { commitAll, initGitRepo, run, tmpWorkspaceIn } from '../helpers/repo-fixture';
import { cleanupTaskWorktree, notifyTaskWorktreeMerged, startTaskAgent } from '../../src/effects/terminal/task-session';
import { removeExactWorktree } from '../../src/effects/state/coordination-worktree-topology';
import { HerdrCoreError } from '../../src/effects/terminal/herdr-core';

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
    endpoint: { socket: join(base, 'hc.sock'), home }, parent_terminal: 'fixture-parent-worker', args: [], max_requests: 1 };
  const provider = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], {
    detached: true, env: { ...process.env, HOME: home }, stdio: ['ignore', 'pipe', 'ignore'],
  });
  children.push(provider);
  await new Promise<void>((resolve, reject) => {
    provider.stdout!.once('data', () => resolve()); provider.once('error', reject);
  });
  const offline = mockOfflineHerdr(checkout, spec, provider.pid!);
  restores.push(() => offline.transport.mockRestore());
  const exited = () => provider.exitCode !== null || provider.signalCode !== null;
  const exit = async () => {
    if (exited()) return;
    provider.kill('SIGTERM');
    await new Promise<void>(resolve => provider.once('exit', () => resolve()));
  };
  const prompts: string[][] = [];
  let mode = 'live';
  const getTerminal = offline.spies.hcGet.getMockImplementation()!;
  offline.spies.hcGet.mockImplementation((address, options) => {
    if (mode === 'unreachable') throw new Error('fixture_endpoint_unreachable');
    if (address === offline.address && mode === 'gone') throw new HerdrCoreError('hc', 'failed', 3, 'not_found');
    const terminal = getTerminal(address, options);
    return address === offline.address && mode === 'foreign-cwd' ? { ...terminal, foreground: { ...terminal.foreground!, cwd: root } } : terminal;
  });
  offline.spies.hcJson.mockImplementation((args, options) => {
    expect(args.slice(0, 3)).toEqual(['send', '--', offline.address]);
    expect(options?.env?.HC_SOCKET).toBe(spec.endpoint.socket);
    prompts.push([...args]);
    if (mode === 'lost-ack') throw new Error('fixture_ack_lost_after_delivery');
    return {};
  });
  // hc kill ends the program group; the terminal stays listed as finished until hc rm.
  offline.spies.hcKill.mockImplementation(() => { provider.kill('SIGTERM'); return { ...offline.terminal()!, state: 'finished', foreground: null, reason: 'killed' }; });
  offline.spies.hcRm.mockImplementation(address => { mode = 'gone'; return address; });
  const binding = await startTaskAgent(checkout, spec, { argv: [process.execPath], ready: async () => {} });
  mkdirSync(join(checkout, '.ai/harness'), { recursive: true });
  writeFileSync(join(checkout, '.ai/harness/active-worktree'), checkout + '\n');
  const notice = { pr: 993, merge_sha: merge, worktree: checkout, branch };
  return { root, checkout, spec, binding, prompts, notice, spies: offline.spies, setMode(value: string) { mode = value; },
    notify: () => notifyTaskWorktreeMerged(root, binding.terminal_id, notice),
    /** The owner program exited and its terminal was removed. */
    async ownerGone() { await exit(); mode = 'gone'; },
    remove: () => removeExactWorktree(root, { worktree: checkout, branch: notice.branch, head_sha: merge,
      target_ref: 'main', target_oid: merge, merge_commit_sha: merge }, { closeout: true }),
  };
}

test('merge notice targets the owner terminal working in the bound checkout and does not replay accepted submission', async () => {
  const f = await fixture();
  expect(await f.notify()).toEqual({ status: 'notified' });
  expect(await f.notify()).toEqual({ status: 'already_notified' });
  expect(f.prompts).toHaveLength(1);
  expect(f.prompts[0]!.slice(0, 3)).toEqual(['send', '--', f.binding.terminal_id]);
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
  ]) await expect(notifyTaskWorktreeMerged(f.root, f.binding.terminal_id, notice)).rejects.toThrow();
  expect(f.prompts).toHaveLength(0);
});

test('cleanup ends the live owner terminal before closeout and exact public removal of a feat branch', async () => {
  const f = await fixture('feat/owner');
  expect(await f.notify()).toEqual({ status: 'notified' });
  expect(f.prompts).toHaveLength(1);
  expect(await cleanupTaskWorktree(f.root, f.checkout)).toEqual({ status: 'closed', pids: [] });
  expect([f.spies.hcKill.mock.calls.map(call => call[0]), f.spies.hcRm.mock.calls.map(call => call[0])]).toEqual([[f.binding.terminal_id], [f.binding.terminal_id]]);
  const cli = join(import.meta.dir, '../../src/cli/index.ts');
  const removal = run(process.execPath, [cli, 'run', 'contract-worktree-runtime', 'remove-exact',
    '--repo', f.root, '--worktree', f.checkout, '--branch', f.notice.branch, '--head', f.notice.merge_sha,
    '--target', 'main', '--target-oid', f.notice.merge_sha, '--merge', f.notice.merge_sha], f.root);
  expect(removal.status).toBe(0);
  expect(existsSync(f.checkout)).toBe(false);
  expect(run('git', ['show-ref', '--verify', '--quiet', 'refs/heads/feat/owner'], f.root).status).not.toBe(0);
});

test('a removed owner terminal falls back to the existing closeout which releases binding, marker, checkout and branch', async () => {
  const f = await fixture(); await f.ownerGone();
  expect(await f.notify()).toEqual({ status: 'owner_gone', reason: 'agent_exited' });
  expect(await cleanupTaskWorktree(f.root, f.checkout)).toEqual({ status: 'closed', pids: [] });
  expect(await f.notify()).toEqual({ status: 'owner_gone', reason: 'workspace_closed' });
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
  await f.ownerGone();
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

test('unreachable owner or an owner outside the checkout retains state without sending a prompt', async () => {
  const f = await fixture();
  for (const mode of ['unreachable', 'foreign-cwd']) {
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
