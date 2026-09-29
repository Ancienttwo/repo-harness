import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { buildTaskAgentCommand } from '../../src/cli/commands/task-agent';
import { assertCreated, harnessCapabilities, startTaskAgent } from '../../src/effects/terminal/task-session';
import { validateHerdrEndpoint } from '../../src/effects/terminal/herdr';

test('public task-agent command has only task participant operations, never server stop', () => {
  expect(buildTaskAgentCommand().commands.map(command => command.name())).toEqual(['start', 'send', 'status', 'read', 'close', 'cancel']);
  expect(buildTaskAgentCommand().commands.some(command => command.name().includes('server'))).toBe(false);
});
test('attached ownership cannot be signalled and real harness evidence stays unverified', () => {
  expect(() => assertCreated({ disposition: 'attached' })).toThrow('attached_object_not_closeable');
  for (const kind of ['codex', 'claude', 'opencode', 'pi']) {
    expect(harnessCapabilities(kind).read_only).toEqual({ status: 'unverified', evidence_ref: null });
    expect(() => harnessCapabilities(kind, 'fixture-evidence.json')).toThrow('real_harness_unverified');
  }
  expect(harnessCapabilities('fixture', 'fixture-evidence.json').resume).toEqual({ status: 'verified', evidence_ref: 'fixture-evidence.json' });
});
test('both socket endpoints are validated before directory or intent creation', async () => {
  const root = mkdtempSync('/tmp/ep-');
  try {
    const home = '/tmp/' + 'x'.repeat(120);
    expect(() => validateHerdrEndpoint({ session: 'owned', home })).toThrow('endpoint_path_too_long');
    await expect(startTaskAgent(root, { task: 'task', role: 'advisor', harness_kind: 'codex', endpoint: { session: 'owned', home }, parent_pane: 'unused', args: [], max_requests: 1 })).rejects.toThrow('endpoint_path_too_long');
    expect(existsSync(join(root, '.ai'))).toBe(false);
    // This API socket fits; its longer client socket does not. No server is started.
    const session = 's';
    const capacity = process.platform === 'darwin' ? 103 : 107;
    const shortBase = '/tmp/' + 'x'.repeat(capacity - '/tmp/'.length - '/.config/herdr/sessions/s/herdr.sock'.length);
    expect(() => validateHerdrEndpoint({ session, home: shortBase })).toThrow('endpoint_path_too_long');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('public start rejects caller-supplied argv before allocating task state', async () => {
  const root = mkdtempSync('/tmp/av-');
  try {
    for (const args of [['--dangerously-skip-permissions'], ['--model', 'caller-selected']]) {
      writeFileSync(join(root, 'spec.json'), JSON.stringify({ task: 'task', role: 'advisor', harness_kind: 'codex',
        endpoint: { session: 'unused', home: root }, parent_pane: 'unused', args, max_requests: 1 }));
      await expect(buildTaskAgentCommand().parseAsync(['start', '--repo', root, '--input', 'spec.json'], { from: 'user' })).rejects.toThrow('arguments_require_role_profile');
      expect(existsSync(join(root, '.ai'))).toBe(false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
