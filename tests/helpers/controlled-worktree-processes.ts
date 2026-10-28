import { mock } from 'bun:test';
import { fileURLToPath } from 'node:url';
import type { WorktreeProcess } from '../../src/effects/git/worktree-processes';

let processes: WorktreeProcess[] | null = [];

// Cleanup fixtures exercise real Git and filesystem operations. Their process
// observation is a separate input, including in disposable CLI subprocesses.
mock.module(fileURLToPath(new URL('../../src/effects/git/worktree-processes.ts', import.meta.url)), () => ({
  worktreeProcesses: () => processes,
}));

export const controlledWorktreeProcessPreload = fileURLToPath(import.meta.url);
export function setControlledWorktreeProcesses(value: WorktreeProcess[] | null): void { processes = value; }
