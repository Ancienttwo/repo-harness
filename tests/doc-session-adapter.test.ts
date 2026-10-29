import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scriptedRuntime } from '@botiverse/oar/testing';
import type { Event, Session } from '@botiverse/oar';

import { DocSessionAdapter, docSessionRepositoryPath, type DocSessionEventBody } from '../src/core/operator/doc-session-adapter';
import { DOC_SESSION_EVENT_MAX_PATHS } from '../src/core/operator/doc-session-events';
import { appendDocSessionEvents } from '../src/effects/operator/doc-session-events';
import { scriptedDocsTurn } from '../src/effects/operator/oar-docs-host';
import { tmpWorkspace } from './helpers/repo-fixture';

const SESSION_ID = 'c'.repeat(32);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A real scripted OAR session (the docs host's zero-model seam) and every event it emits. */
async function scriptedSession(worktree: string): Promise<{ session: Session; events: Event[] }> {
  const session = await scriptedRuntime({ id: 'fixture', model: 'fixture-oar', turn: scriptedDocsTurn }).session({ kind: 'available', via: 'bundled' }, { cwd: worktree });
  const events: Event[] = [];
  session.events(event => events.push(event), { cursor: { sessionId: session.id, afterSeq: -1 }, coalesceText: { maxHoldMs: 20 } });
  return { session, events };
}

async function untilTurnEnds(events: Event[], count = 1): Promise<void> {
  for (const until = Date.now() + 10_000; events.filter(event => event.kind === 'turn_ended').length < count;) {
    if (Date.now() > until) throw new Error('scripted turn did not end');
    await Bun.sleep(10);
  }
}

function sessionStore(): { env: NodeJS.ProcessEnv; log: string } {
  const home = tmpWorkspace('doc-session-adapter'); roots.push(home);
  const directory = join(home, 'operator', 'sessions', SESSION_ID);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'session.json'), '{}');
  return { env: { REPO_HARNESS_HOME: home }, log: join(directory, 'events.jsonl') };
}

test('a scripted turn becomes text, edit paths, command status and turn records, and no planted value reaches events.jsonl', async () => {
  const worktree = tmpWorkspace('doc-session-adapter-wt'); roots.push(worktree);
  const { session, events } = await scriptedSession(worktree);
  expect((await session.prompt('Tighten the intro.')).kind).toBe('accepted');
  await untilTurnEnds(events);
  const adapter = new DocSessionAdapter(worktree);
  adapter.disposed();
  await session.dispose();
  const bodies = events.flatMap(event => adapter.map(event));
  expect(bodies.map(body => body.type === 'message' ? { type: 'message', role: body.role } : body)).toEqual([
    { type: 'turn', boundary: 'started' },
    { type: 'message', role: 'agent' },
    { type: 'tool', category: 'edit', status: 'started', paths: ['docs/guide.md'] },
    { type: 'tool', category: 'edit', status: 'succeeded', paths: ['docs/guide.md'] },
    { type: 'tool', category: 'command', status: 'started', paths: [] },
    { type: 'tool', category: 'command', status: 'failed', paths: [] },
    { type: 'turn', boundary: 'ended' },
  ]);

  const store = sessionStore();
  appendDocSessionEvents(store.env, SESSION_ID, bodies.map((body, seq) => ({ ...body, epoch: 1, seq, at: '2026-10-29T00:00:00.000Z' } as Parameters<typeof appendDocSessionEvents>[2][number])));
  const log = readFileSync(store.log, 'utf8');
  for (const planted of ['PLANTED', 'ghp_0123456789', worktree, '/etc/']) expect(log).not.toContain(planted);
  expect(log).toContain('I tightened the intro of docs/guide.md.');
}, 30_000);

test('an aborted turn records the abort cause, a failed turn records runtime_error, and each closes its turn', async () => {
  const worktree = tmpWorkspace('doc-session-adapter-wt'); roots.push(worktree);
  const { session, events } = await scriptedSession(worktree);
  const adapter = new DocSessionAdapter(worktree);
  expect((await session.prompt('fixture:hold')).kind).toBe('accepted');
  adapter.aborting('timeout');
  expect((await session.abort()).kind).toBe('accepted');
  await untilTurnEnds(events);
  expect((await session.prompt('fixture:fail')).kind).toBe('accepted');
  await untilTurnEnds(events, 2);
  adapter.disposed();
  await session.dispose();
  expect(events.flatMap(event => adapter.map(event))).toEqual([
    { type: 'turn', boundary: 'started' }, { type: 'failure', category: 'timeout' }, { type: 'turn', boundary: 'ended' },
    { type: 'turn', boundary: 'started' }, { type: 'failure', category: 'runtime_error' }, { type: 'turn', boundary: 'ended' },
  ]);
}, 30_000);

test('paths stay inside the worktree, at most 32 per record; subagent events, a rejected prompt and an unrequested exit are mapped by rule', () => {
  const worktree = '/private/tmp/wt';
  expect(docSessionRepositoryPath(worktree, '/private/tmp/wt/docs/a.md')).toBe('docs/a.md');
  expect(docSessionRepositoryPath(worktree, './docs/a.md')).toBe('docs/a.md');
  for (const path of ['/private/tmp/wt-other/docs/a.md', '/etc/passwd', '../outside.md', 'docs/../../x', '~/notes.md']) expect(docSessionRepositoryPath(worktree, path), path).toBeNull();

  const adapter = new DocSessionAdapter(worktree);
  const root = { agentPath: [] as string[] };
  const changes = JSON.stringify(Array.from({ length: 40 }, (_, index) => ({ path: `${worktree}/docs/page-${index}.md`, diff: 'x' })));
  const started = adapter.map({ ...root, kind: 'tool_call_started', callId: 'a', tool: 'fileChange', input: changes }) as Extract<DocSessionEventBody, { type: 'tool' }>[];
  expect(started[0]!.paths).toHaveLength(DOC_SESSION_EVENT_MAX_PATHS);
  // No reported result and no exit code is not a success.
  expect(adapter.map({ ...root, kind: 'tool_call_ended', callId: 'a' })).toEqual([{ type: 'tool', category: 'edit', status: 'failed', paths: started[0]!.paths }]);
  expect(adapter.map({ ...root, kind: 'tool_call_started', callId: 'b', tool: 'commandExecution', input: 'cat x' })).toEqual([{ type: 'tool', category: 'command', status: 'started', paths: [] }]);
  expect(adapter.map({ ...root, kind: 'tool_call_ended', callId: 'b', exitCode: 0 })).toEqual([{ type: 'tool', category: 'command', status: 'succeeded', paths: [] }]);
  expect(adapter.map({ agentPath: ['child'], kind: 'text_delta', text: 'from a subagent' })).toEqual([]);
  for (const kind of ['reasoning', 'tool_call_input', 'usage', 'model', 'user_message']) expect(adapter.map({ ...root, kind, text: 'x', input: 'y' }), kind).toEqual([]);
  expect(adapter.map({ ...root, kind: 'control_rejected', action: 'prompt' })).toEqual([{ type: 'failure', category: 'runtime_error' }]);
  expect(adapter.map({ ...root, kind: 'control_rejected', action: 'abort' })).toEqual([]);
  expect(adapter.map({ ...root, kind: 'turn_started' })).toEqual([{ type: 'turn', boundary: 'started' }]);
  expect(adapter.map({ ...root, kind: 'exited' })).toEqual([{ type: 'failure', category: 'runtime_error' }, { type: 'turn', boundary: 'ended' }]);
  expect(adapter.turnOpen).toBe(false);
  expect(adapter.map({ ...root, kind: 'exited' })).toEqual([{ type: 'failure', category: 'runtime_error' }]);
  adapter.disposed();
  expect(adapter.map({ ...root, kind: 'exited' })).toEqual([]);
});
