#!/usr/bin/env bun
import { execFileSync } from 'child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = basename(scriptDir) === 'helpers' ? resolve(scriptDir, '../../..') : resolve(scriptDir, '..');
const { readSessionArtifact, cleanupTaskWorktree, registerTaskWorktree } = await import(pathToFileURL(join(packageRoot, 'src/effects/terminal/task-session.ts')).href) as typeof import('../src/effects/terminal/task-session');
import type { HerdrEndpoint } from '../src/effects/terminal/herdr';

const [action, ...args] = process.argv.slice(2);
const value = (key: string) => { const at = args.indexOf(key); if (at < 0 || !args[at + 1]) throw new Error(`runtime requires ${key}`); return args[at + 1]!; };
function markActiveWorktree(worktree: string): void {
  const canonical = realpathSync(worktree);
  let directory = canonical;
  for (const part of ['.ai', 'harness']) {
    directory = join(directory, part);
    try { lstatSync(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; mkdirSync(directory, { mode: 0o700 }); }
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('active-worktree marker directory is unsafe');
  }
  const marker = join(directory, 'active-worktree');
  try {
    const stat = lstatSync(marker);
    if (!stat.isFile() || stat.isSymbolicLink() || readFileSync(marker, 'utf8').trim() !== canonical) throw new Error('active-worktree marker has another owner');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    writeFileSync(marker, canonical + '\n', { flag: 'wx', mode: 0o600 });
  }
}
try {
  if (action === 'assert-unused-path') {
    try {
      lstatSync(value('--worktree'));
      throw new Error('target worktree path already exists');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  } else if (action === 'add-worktree') {
    const { withWorktreeTopologyLock } = await import(pathToFileURL(join(packageRoot, 'src/effects/state/coordination-worktree-topology.ts')).href) as typeof import('../src/effects/state/coordination-worktree-topology');
    withWorktreeTopologyLock(value('--repo'), () => {
      const worktree = value('--worktree');
      mkdirSync(dirname(worktree), { recursive: true });
      // mkdir is the exclusive path claim. It refuses files and all symlinks.
      mkdirSync(worktree, { mode: 0o700 });
      const gitArgs = args.includes('--new-branch')
        ? ['worktree', 'add', '-b', value('--branch'), worktree, value('--base')]
        : ['worktree', 'add', worktree, value('--branch')];
      execFileSync('git', gitArgs, { cwd: value('--repo'), stdio: 'inherit' });
      markActiveWorktree(worktree);
    });
  } else if (action === 'mark-active') {
    const { withWorktreeTopologyLock, assertWorktreeBinding } = await import(pathToFileURL(join(packageRoot, 'src/effects/state/coordination-worktree-topology.ts')).href) as typeof import('../src/effects/state/coordination-worktree-topology');
    withWorktreeTopologyLock(value('--repo'), () => {
      assertWorktreeBinding(value('--repo'), value('--worktree'), value('--branch'));
      markActiveWorktree(value('--worktree'));
    });
  } else if (action === 'register') {
    const input = readSessionArtifact<{ endpoint: HerdrEndpoint; parent_pane: string }>(value('--endpoint'));
    console.log(JSON.stringify(await registerTaskWorktree(value('--worktree'), input.endpoint, input.parent_pane)));
  } else if (action === 'cleanup') {
    const result = await cleanupTaskWorktree(value('--repo'), value('--worktree'), args.includes('--dry-run'));
    console.log(JSON.stringify(result));
    if (result.status === 'cleanup_pending') process.exitCode = 1;
  } else if (action === 'remove-exact') {
    const { removeExactWorktree } = await import(pathToFileURL(join(packageRoot, 'src/effects/state/coordination-worktree-topology.ts')).href) as typeof import('../src/effects/state/coordination-worktree-topology');
    removeExactWorktree(value('--repo'), {
      worktree: value('--worktree') === '(absent)' ? '' : value('--worktree'),
      branch: value('--branch'), head_sha: value('--head'), target_ref: value('--target'),
      target_oid: value('--target-oid'), merge_commit_sha: value('--merge'),
    });
  } else throw new Error('unknown worktree runtime action');
} catch (error) { console.error(String(error)); process.exitCode = 1; }
