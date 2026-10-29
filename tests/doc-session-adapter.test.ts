import { afterEach, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scriptedRuntime } from '@botiverse/oar/testing';
import type { Event, Session } from '@botiverse/oar';

import { DOC_SESSION_MESSAGE_HOLD_CHARS, DocSessionAdapter, docSessionRepositoryPath, type DocSessionEventBody } from '../src/core/operator/doc-session-adapter';
import { DOC_SESSION_EVENT_MAX_PATHS, DOC_SESSION_TEXT_WITHHELD } from '../src/core/operator/doc-session-events';
import { containsSecret } from '../src/core/security/secret-patterns';
import { appendDocSessionEvents } from '../src/effects/operator/doc-session-events';
import { DOC_SESSION_ABORT_GRACE_MS, DocsTurnControl, scriptedDocsTurn } from '../src/effects/operator/oar-docs-host';
import { tmpWorkspace } from './helpers/repo-fixture';

const SESSION_ID = 'c'.repeat(32);
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

/** A real scripted OAR session (the docs host's zero-model seam) and every event it emits. */
async function scriptedSession(worktree: string, turn = scriptedDocsTurn, maxHoldMs = 20): Promise<{ session: Session; events: Event[] }> {
  const session = await scriptedRuntime({ id: 'fixture', model: 'fixture-oar', turn }).session({ kind: 'available', via: 'bundled' }, { cwd: worktree });
  const events: Event[] = [];
  session.events(event => events.push(event), { cursor: { sessionId: session.id, afterSeq: -1 }, coalesceText: { maxHoldMs } });
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

const STORE_AT = '2026-10-29T00:00:00.000Z';
const store = (env: NodeJS.ProcessEnv, bodies: readonly DocSessionEventBody[]) =>
  appendDocSessionEvents(env, SESSION_ID, bodies.map((body, seq) => ({ ...body, epoch: 1, seq, at: STORE_AT } as Parameters<typeof appendDocSessionEvents>[2][number])));

test('a secret split across two text deltas, with a pause longer than the coalescer hold, is redacted whole', async () => {
  const worktree = tmpWorkspace('doc-session-adapter-wt'); roots.push(worktree);
  // Neither fragment matches the secret rules alone; joined they are one GitHub token.
  const head = 'ghp_0123456789', rest = 'abcdefghijklmnopqrstuvwxyzAB';
  expect([containsSecret(head), containsSecret(rest), containsSecret(head + rest)]).toEqual([false, false, true]);
  const { session, events } = await scriptedSession(worktree, async turn => {
    turn.say(`The token is ${head}`);
    await Bun.sleep(650);
    turn.say(`${rest} and nothing else.`);
  }, 500);
  expect((await session.prompt('split')).kind).toBe('accepted');
  await untilTurnEnds(events);
  const adapter = new DocSessionAdapter(worktree);
  adapter.disposed();
  await session.dispose();
  // The real coalescer with the host's hold (500 ms) and a 650 ms pause delivered two separate deltas of one message.
  expect(events.filter(event => event.kind === 'text_delta')).toHaveLength(2);
  const bodies = events.flatMap(event => adapter.map(event));
  expect(bodies.filter(body => body.type === 'message')).toHaveLength(1);
  const s = sessionStore();
  store(s.env, bodies);
  const log = readFileSync(s.log, 'utf8');
  for (const fragment of [head, rest]) expect(log).not.toContain(fragment);
  expect(log).toContain('The token is ghp_[REDACTED] and nothing else.');
}, 30_000);

for (const split of [false, true]) test(`hold overflow with a compressed secret prefix withholds the whole message (${split ? 'three deltas' : 'one delta'})`, () => {
  const prefix = ('sk-' + 'A'.repeat(1000) + ' ').repeat(65) + ' '.repeat(262);
  const head = 'ghp_0123456789', rest = 'abcdefghijklmnopqrstuvwxyzAB';
  expect(prefix.length + head.length).toBe(DOC_SESSION_MESSAGE_HOLD_CHARS);
  const adapter = new DocSessionAdapter('/private/tmp/wt');
  for (const text of split ? [prefix, head, rest] : [prefix + head + rest]) {
    expect(adapter.map({ agentPath: [], kind: 'text_delta', messageId: 'm', text })).toEqual([]);
  }
  const s = sessionStore();
  store(s.env, adapter.flush());
  const log = readFileSync(s.log, 'utf8');
  expect(JSON.parse(log)).toMatchObject({ type: 'message', text: DOC_SESSION_TEXT_WITHHELD, truncated: true });
  for (const fragment of [head, rest, 'sk-' + 'A'.repeat(1000)]) expect(log).not.toContain(fragment);
});

test('a complete message at the hold bound keeps the writer redaction after prefix compression', () => {
  const prefix = ('sk-' + 'A'.repeat(1000) + ' ').repeat(64);
  const token = 'ghp_0123456789abcdefghijklmnopqrstuvwxyzAB';
  const padding = ' '.repeat(DOC_SESSION_MESSAGE_HOLD_CHARS - prefix.length - token.length);
  const adapter = new DocSessionAdapter('/private/tmp/wt');
  adapter.map({ agentPath: [], kind: 'text_delta', messageId: 'm', text: prefix + token + padding });
  const s = sessionStore();
  store(s.env, adapter.flush());
  const log = readFileSync(s.log, 'utf8');
  expect(JSON.parse(log)).toMatchObject({ text: 'sk-[REDACTED] '.repeat(64) + 'ghp_[REDACTED]' + padding, truncated: false });
  expect(log).not.toContain(token);
});

test('a message past the hold bound is withheld and stored as truncated', () => {
  const adapter = new DocSessionAdapter('/private/tmp/wt');
  const root = { agentPath: [] as string[] };
  adapter.map({ ...root, kind: 'turn_started' });
  expect(adapter.map({ ...root, kind: 'text_delta', messageId: 'm', text: 'x'.repeat(DOC_SESSION_MESSAGE_HOLD_CHARS - 2) })).toEqual([]);
  expect(adapter.map({ ...root, kind: 'text_delta', messageId: 'm', text: 'yyyyy' })).toEqual([]);
  expect(adapter.map({ ...root, kind: 'text_delta', messageId: 'm', text: 'later text must also be withheld' })).toEqual([]);
  const [message, end] = adapter.map({ ...root, kind: 'turn_ended', outcome: { kind: 'completed' } });
  expect(message).toEqual({ type: 'message', role: 'agent', text: DOC_SESSION_TEXT_WITHHELD, truncated: true });
  expect(end).toEqual({ type: 'turn', boundary: 'ended' });
  // A message from another id ends the held one first.
  adapter.map({ ...root, kind: 'text_delta', messageId: 'a', text: 'first' });
  expect(adapter.map({ ...root, kind: 'text_delta', messageId: 'b', text: 'second' })).toEqual([{ type: 'message', role: 'agent', text: 'first' }]);
  expect(adapter.flush()).toEqual([{ type: 'message', role: 'agent', text: 'second' }]);
  // The writer keeps a producer's truncation even when the stored text is short.
  const s = sessionStore();
  store(s.env, [{ type: 'message', role: 'agent', text: 'short', truncated: true }]);
  expect(JSON.parse(readFileSync(s.log, 'utf8'))).toMatchObject({ text: 'short', truncated: true });
});

test('a rejected interrupt is not a stop: the cause resets, the next bound retries it, and an accepted one that does not end the turn becomes overdue', async () => {
  const worktree = tmpWorkspace('doc-session-adapter-wt'); roots.push(worktree);
  // The producer's own outcome objects: OAR rejects an interrupt with no turn running and accepts one while a turn runs.
  // The control reads only `kind`, which is also what a `runtime_refused` rejection carries.
  const { session, events } = await scriptedSession(worktree);
  const rejected = await session.abort();
  expect(rejected).toMatchObject({ kind: 'rejected', code: 'no_active_turn' });
  expect((await session.prompt('fixture:hold')).kind).toBe('accepted');
  for (const until = Date.now() + 5_000; !events.some(event => event.kind === 'turn_started');) { if (Date.now() > until) throw new Error('no turn'); await Bun.sleep(10); }
  const accepted = await session.abort();
  expect(accepted.kind).toBe('accepted');
  await untilTurnEnds(events);
  await session.dispose();

  const adapter = new DocSessionAdapter(worktree);
  const root = { agentPath: [] as string[] };
  adapter.map({ ...root, kind: 'turn_started' });
  const calls: string[] = [];
  const refusing = new DocsTurnControl({ abort: async () => { calls.push('abort'); return rejected; } }, adapter);
  expect(await refusing.abort('timeout')).toBe(false);
  expect(await refusing.abort('timeout')).toBe(false);
  expect(calls).toHaveLength(2);
  expect(refusing.overdue(Date.now() + DOC_SESSION_ABORT_GRACE_MS + 1)).toBe(false);
  // The rejected timeout did not leave its cause behind: a later aborted turn is a cancel.
  expect(adapter.map({ ...root, kind: 'turn_ended', outcome: { kind: 'aborted' } })).toEqual([{ type: 'failure', category: 'cancelled' }, { type: 'turn', boundary: 'ended' }]);

  adapter.map({ ...root, kind: 'turn_started' });
  const accepting = new DocsTurnControl({ abort: async () => { calls.push('abort'); return accepted; } }, adapter);
  const now = Date.now();
  expect(await accepting.abort('timeout', now)).toBe(true);
  expect(await accepting.abort('cancelled', now)).toBe(true);
  expect(calls).toHaveLength(3);
  expect(accepting.overdue(now + DOC_SESSION_ABORT_GRACE_MS)).toBe(false);
  expect(accepting.overdue(now + DOC_SESSION_ABORT_GRACE_MS + 1)).toBe(true);
  expect(adapter.map({ ...root, kind: 'turn_ended', outcome: { kind: 'aborted' } })[0]).toEqual({ type: 'failure', category: 'timeout' });
  expect(accepting.overdue(now + DOC_SESSION_ABORT_GRACE_MS + 1)).toBe(false);
}, 30_000);
