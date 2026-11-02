#!/usr/bin/env bun
// Task-agent-host process entry for the worktree actions that need herdr-core state.
// contract-worktree-runtime.ts runs it as a process; the argv, the JSON on stdout and the exit code are the port.
import type { HerdrCoreEndpoint } from './task-session-record';
import { cleanupTaskWorktree, notifyTaskWorktreeMerged, registerTaskWorktree } from './task-session';
import { readSessionArtifact } from './task-session-io';

const [action, ...args] = process.argv.slice(2);
const value = (key: string) => { const at = args.indexOf(key); if (at < 0 || !args[at + 1]) throw new Error(`runtime requires ${key}`); return args[at + 1]!; };
try {
  if (action === 'register') {
    const input = readSessionArtifact<{ endpoint: HerdrCoreEndpoint; parent_terminal: string }>(value('--endpoint'));
    console.log(JSON.stringify(await registerTaskWorktree(value('--worktree'), input.endpoint, input.parent_terminal)));
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
