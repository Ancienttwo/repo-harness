import { describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import { ROUTES } from '../src/cli/hook/route-registry';
import { routeToLoopEvent, type LoopEventKind } from '../src/core/loop/loop-event-protocol';

const MODULE_PATH = join(import.meta.dir, '../src/core/loop/loop-event-protocol.ts');

const LOOP_EVENT_KINDS: readonly LoopEventKind[] = [
  'session_started',
  'prompt_submitted',
  'mutation_requested',
  'mutation_observed',
  'command_observed',
  'subagent_started',
  'subagent_stopped',
  'session_stopping',
];

function routeKey(entry: { readonly event: string; readonly routeId: string }): string {
  return `${entry.event}.${entry.routeId}`;
}

// Recursive relative-file listing so the purity test can detect a write
// anywhere under the scratch cwd, not just at its top level.
function listFilesRecursive(root: string): readonly string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else out.push(relative(root, absolute));
    }
  };
  visit(root);
  return out.sort();
}

describe('loop-event-protocol route mapping', () => {
  test('routeToLoopEvent covers exactly the 11 registry route tuples, no extras, no duplicates', () => {
    const registryKeys = ROUTES.map(routeKey).sort();
    const mappedKeys = routeToLoopEvent.map(routeKey).sort();

    expect(ROUTES.length).toBe(11);
    expect(routeToLoopEvent.length).toBe(11);
    expect(new Set(mappedKeys).size).toBe(routeToLoopEvent.length);
    expect(mappedKeys).toEqual(registryKeys);
  });

  test('every mapped kind is one of the 8 declared LoopEvent kinds', () => {
    for (const tuple of routeToLoopEvent) {
      expect(LOOP_EVENT_KINDS).toContain(tuple.kind);
    }
  });

  test('every LoopEvent kind is reachable from at least one route', () => {
    const reachable = new Set(routeToLoopEvent.map((tuple) => tuple.kind));
    for (const kind of LOOP_EVENT_KINDS) {
      expect(reachable.has(kind)).toBe(true);
    }
  });

  test('purity: importing the module produces no stdout/stderr and touches no files', () => {
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'loop-event-protocol-purity-')));
    try {
      const before = listFilesRecursive(cwd);
      const moduleUrl = pathToFileURL(MODULE_PATH).href;
      const result = spawnSync(
        'bun',
        ['-e', `await import(${JSON.stringify(moduleUrl)});`],
        { cwd, encoding: 'utf-8' },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(listFilesRecursive(cwd)).toEqual(before);
      expect(statSync(cwd).isDirectory()).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
