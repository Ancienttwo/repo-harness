// Doc session events (PRD G3, G4; issue #1022). The host appends redacted
// events to `<repoHarnessHome>/operator/sessions/<sid>/events.jsonl`, next to
// the session record of #1021; the page reads them by an `epoch.seq` cursor.
//
// No host produces events yet: agent launch (G5) needs the user's approval of
// its confirmation bypass first. Production OPERATOR_ROUTES has no events
// route; tests admit it through their own route inventory.

import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, realpathSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import {
  compareDocSessionCursor, decodeDocSessionEvent, decodeOperatorDocSessionEvents, docSessionActivity,
  DOC_SESSION_EVENTS_PAGE, formatDocSessionCursor, parseDocSessionCursor, redactDocSessionPath, storedDocSessionText,
  type DocSessionCursor, type DocSessionEventInput, type DocSessionEventV1, type OperatorDocSessionEventsV1,
} from '../../core/operator/doc-session-events';
import { syncDirectoryDurably } from '../atomic-append';
import { ExclusiveLockContentionError, withExclusiveDirectoryLock } from '../locking/exclusive-directory-lock';
import { operatorStateDir } from './write-audit';

export const OPERATOR_SESSION_EVENTS_ROUTE = /^\/api\/v1\/sessions\/([0-9a-f]{32})\/events$/u;
/** Bounds the log that each poll reads and decodes. The writer refuses an append past it. */
export const DOC_SESSION_EVENTS_MAX_BYTES = 8 * 1024 * 1024;
const SESSION_ID = /^[0-9a-f]{32}$/u;
const EVENTS_FILE = 'events.jsonl';

export type DocSessionEventsFailure =
  | 'session_not_found' | 'invalid_cursor' | 'invalid_event' | 'cursor_not_increasing' | 'events_full' | 'events_busy' | 'events_unavailable';

export class DocSessionEventsError extends Error {
  constructor(readonly code: DocSessionEventsFailure) { super(code); }
}
const fail = (code: DocSessionEventsFailure): never => { throw new DocSessionEventsError(code); };

/** The session directory, which exists once #1021 wrote its record. A symlink is not a session. */
function sessionDirectory(env: NodeJS.ProcessEnv, sessionId: string): string {
  if (!SESSION_ID.test(sessionId)) return fail('session_not_found');
  const directory = join(operatorStateDir(env), 'sessions', sessionId);
  try {
    if (lstatSync(directory).isDirectory() && lstatSync(join(directory, 'session.json')).isFile()) return directory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return fail('events_unavailable');
  }
  return fail('session_not_found');
}

function readAll(fd: number, size: number): Buffer {
  const data = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const read = readSync(fd, data, offset, size - offset, offset);
    if (read === 0) break;
    offset += read;
  }
  return data.subarray(0, offset);
}

/**
 * Every complete line, decoded and in strictly increasing cursor order. A
 * last line without its newline is an append in progress; the reader skips
 * it, and the writer, which holds the lock, refuses a log that ends that way.
 */
function decodeLog(data: Buffer, partialTail: 'skip' | 'refuse'): DocSessionEventV1[] {
  const text = data.toString('utf8');
  const end = text.lastIndexOf('\n');
  if (end !== text.length - 1 && partialTail === 'refuse') return fail('events_unavailable');
  const events: DocSessionEventV1[] = [];
  let previous: DocSessionCursor | null = null;
  for (const line of end < 0 ? [] : text.slice(0, end).split('\n')) {
    let event: DocSessionEventV1;
    try { event = decodeDocSessionEvent(JSON.parse(line)); } catch { return fail('events_unavailable'); }
    if (previous !== null && compareDocSessionCursor(event, previous) <= 0) return fail('events_unavailable');
    events.push(event);
    previous = event;
  }
  return events;
}

function readStoredEvents(path: string): DocSessionEventV1[] {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW); } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? [] : fail('events_unavailable');
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > DOC_SESSION_EVENTS_MAX_BYTES) return fail('events_unavailable');
    return decodeLog(readAll(fd, stat.size), 'skip');
  } finally { closeSync(fd); }
}

/** Redact first, then decode: a field outside the schema, such as raw tool arguments, is refused. */
function storedEvent(input: DocSessionEventInput): DocSessionEventV1 {
  const value = input as unknown as Record<string, unknown>;
  let record: Record<string, unknown>;
  if (input.type === 'message') {
    if (typeof value.text !== 'string') return fail('invalid_event');
    record = { ...value, protocol: 1, ...storedDocSessionText(value.text) };
  } else if (input.type === 'tool') {
    if (!Array.isArray(value.paths) || !value.paths.every(path => typeof path === 'string')) return fail('invalid_event');
    record = { ...value, protocol: 1, paths: (value.paths as string[]).map(redactDocSessionPath) };
  } else {
    record = { ...value, protocol: 1 };
  }
  try { return decodeDocSessionEvent(record); } catch { return fail('invalid_event'); }
}

function writeAll(fd: number, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset);
}

/**
 * The host's writer. A batch is redacted, decoded and checked as a whole, then
 * appended with one write and synced; a refusal writes nothing. Each event
 * must move the `epoch.seq` cursor forward.
 */
export function appendDocSessionEvents(env: NodeJS.ProcessEnv, sessionId: string, inputs: readonly DocSessionEventInput[]): void {
  const directory = sessionDirectory(env, sessionId);
  const records = inputs.map(storedEvent);
  for (let index = 1; index < records.length; index += 1) {
    if (compareDocSessionCursor(records[index]!, records[index - 1]!) <= 0) fail('cursor_not_increasing');
  }
  if (records.length === 0) return;
  const data = Buffer.from(records.map(record => `${JSON.stringify(record)}\n`).join(''), 'utf8');
  const path = join(directory, EVENTS_FILE);
  try {
    withExclusiveDirectoryLock(realpathSync(directory), 'events.lock', () => {
      let created = false;
      let fd: number;
      try {
        fd = openSync(path, constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        created = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') return fail('events_unavailable');
        try { fd = openSync(path, constants.O_RDWR | constants.O_APPEND | constants.O_NOFOLLOW); } catch { return fail('events_unavailable'); }
      }
      try {
        const stat = fstatSync(fd);
        if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > DOC_SESSION_EVENTS_MAX_BYTES) fail('events_unavailable');
        const last = decodeLog(readAll(fd, stat.size), 'refuse').at(-1);
        if (last !== undefined && compareDocSessionCursor(records[0]!, last) <= 0) fail('cursor_not_increasing');
        if (stat.size + data.length > DOC_SESSION_EVENTS_MAX_BYTES) fail('events_full');
        writeAll(fd, data);
        fsyncSync(fd);
      } finally { closeSync(fd); }
      // A new directory entry survives a crash only after its parent is synced.
      if (created) syncDirectoryDurably(directory);
    });
  } catch (error) {
    if (error instanceof ExclusiveLockContentionError) fail('events_busy');
    throw error;
  }
}

/** One page of events after the cursor. Activity covers the whole log, not only the page. */
export function readDocSessionEvents(env: NodeJS.ProcessEnv, sessionId: string, after: string | null): OperatorDocSessionEventsV1 {
  const floor = after === null ? null : parseDocSessionCursor(after);
  if (after !== null && floor === null) fail('invalid_cursor');
  const events = readStoredEvents(join(sessionDirectory(env, sessionId), EVENTS_FILE));
  const pending = floor === null ? events : events.filter(event => compareDocSessionCursor(event, floor) > 0);
  const page = pending.slice(0, DOC_SESSION_EVENTS_PAGE);
  const last = page.at(-1);
  return decodeOperatorDocSessionEvents({
    protocol: 1, kind: 'operator_docs_session_events', session_id: sessionId, after, events: page,
    next_cursor: last === undefined ? after : formatDocSessionCursor(last),
    complete: pending.length <= DOC_SESSION_EVENTS_PAGE, activity: docSessionActivity(events),
  }, sessionId, after);
}
