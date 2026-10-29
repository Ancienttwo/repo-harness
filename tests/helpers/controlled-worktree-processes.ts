import { mock } from 'bun:test';
import { fileURLToPath } from 'node:url';
import type { WorktreeProcess } from '../../src/effects/git/worktree-processes';

type ControlledInventory = WorktreeProcess[] | null | (() => WorktreeProcess[] | null);
let processes: ControlledInventory = [];

// Cleanup fixtures exercise real Git and filesystem operations. Their process
// observation is a separate input, including in disposable CLI subprocesses.
// A function value is read at each observation, so a test can change the
// inventory between two observations without sleeping.
mock.module(fileURLToPath(new URL('../../src/effects/git/worktree-processes.ts', import.meta.url)), () => ({
  worktreeProcesses: () => typeof processes === 'function' ? processes() : processes,
}));

export const controlledWorktreeProcessPreload = fileURLToPath(import.meta.url);
export function setControlledWorktreeProcesses(value: ControlledInventory): void { processes = value; }
