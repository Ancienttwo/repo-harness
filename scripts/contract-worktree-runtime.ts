#!/usr/bin/env bun
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = basename(scriptDir) === 'helpers' ? resolve(scriptDir, '../../..') : resolve(scriptDir, '..');
const { readSessionArtifact, cleanupTaskWorktree, registerTaskWorktree } = await import(pathToFileURL(join(packageRoot, 'src/effects/terminal/task-session.ts')).href) as typeof import('../src/effects/terminal/task-session');
import type { HerdrEndpoint } from '../src/effects/terminal/herdr';

const [action, ...args] = process.argv.slice(2);
const value = (key: string) => { const at = args.indexOf(key); if (at < 0 || !args[at + 1]) throw new Error(`runtime requires ${key}`); return args[at + 1]!; };
try {
  if (action === 'register') {
    const input = readSessionArtifact<{ endpoint: HerdrEndpoint; parent_pane: string }>(value('--endpoint'));
    console.log(JSON.stringify(await registerTaskWorktree(value('--worktree'), input.endpoint, input.parent_pane)));
  } else if (action === 'cleanup') {
    const result = await cleanupTaskWorktree(value('--repo'), value('--worktree'), args.includes('--dry-run'));
    console.log(JSON.stringify(result));
    if (result.status === 'cleanup_pending') process.exitCode = 1;
  } else throw new Error('runtime action must be register or cleanup');
} catch (error) { console.error(String(error)); process.exitCode = 1; }
