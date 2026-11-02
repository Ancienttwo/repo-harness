#!/usr/bin/env bun
/** Task agent host entry for the Herdr worktree actions. `contract-worktree-runtime.ts` runs this file as a
 * process, so the contract worktree runtime imports no task agent host module. */
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { HerdrEndpoint } from '../src/effects/terminal/task-session-record';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = basename(scriptDir) === 'helpers' ? resolve(scriptDir, '../../..') : resolve(scriptDir, '..');
const [action, ...args] = process.argv.slice(2);
const { readSessionArtifact } = await import(pathToFileURL(join(packageRoot, 'src/effects/terminal/task-session-io.ts')).href) as typeof import('../src/effects/terminal/task-session-io');
const { cleanupTaskWorktree, notifyTaskWorktreeMerged, registerTaskWorktree } = await import(pathToFileURL(join(packageRoot, 'src/effects/terminal/task-session.ts')).href) as typeof import('../src/effects/terminal/task-session');
const value = (key: string) => { const at = args.indexOf(key); if (at < 0 || !args[at + 1]) throw new Error(`runtime requires ${key}`); return args[at + 1]!; };
try {
  if (action === 'register') {
    const input = readSessionArtifact<{ endpoint: HerdrEndpoint; parent_pane: string }>(value('--endpoint'));
    console.log(JSON.stringify(await registerTaskWorktree(value('--worktree'), input.endpoint, input.parent_pane)));
  } else if (action === 'notify-merged') {
    const result = await notifyTaskWorktreeMerged(value('--repo'), value('--owner'), {
      pr: Number(value('--pr')), merge_sha: value('--merge'), worktree: value('--worktree'), branch: value('--branch'),
    });
    console.log(JSON.stringify(result));
    if (result.status === 'retained') process.exitCode = 1;
  } else if (action === 'cleanup') {
    const result = await cleanupTaskWorktree(value('--repo'), value('--worktree'), args.includes('--dry-run'));
    console.log(JSON.stringify(result));
    if (result.status === 'cleanup_pending') process.exitCode = 1;
  } else throw new Error('unknown worktree runtime action');
} catch (error) { console.error(String(error)); process.exitCode = 1; }
