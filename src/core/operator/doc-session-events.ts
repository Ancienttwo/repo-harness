import { containsSecret, SECRET_TOKEN_PATTERNS } from '../security/secret-patterns';
import { isPublicDevActivityText, publicDevActivityText } from './public-text';

/**
 * Doc session events (PRD G3, G4; issue #1022). A record holds only what the
 * doc session page shows: message text, the tool category, repository-relative
 * paths, the execution status, turn boundaries and the failure category. Raw
 * tool arguments, full commands, terminal output and environment values have
 * no field, so the closed decoder refuses a record that carries them.
 *
 * `epoch.seq` is the cursor. The host adds one to `epoch` at each restart,
 * because OAR counts `seq` from 0 again when it resumes a session.
 */
export type DocSessionEventV1 = DocSessionEventCursorV1 & (
  | { readonly type: 'message'; readonly role: DocSessionMessageRole; readonly text: string; readonly truncated: boolean }
  | { readonly type: 'tool'; readonly category: DocSessionToolCategory; readonly status: DocSessionToolStatus; readonly paths: readonly string[] }
  | { readonly type: 'turn'; readonly boundary: 'started' | 'ended' }
  | { readonly type: 'failure'; readonly category: DocSessionFailureCategory }
);

interface DocSessionEventCursorV1 {
  readonly protocol: 1;
  readonly epoch: number;
  readonly seq: number;
  readonly at: string;
}

/** What the host hands to the writer: unredacted text, no protocol, no truncation flag. */
export type DocSessionEventInput = DocSessionEventV1 extends infer E
  ? E extends { readonly type: 'message' } ? Omit<E, 'protocol' | 'truncated'> : Omit<E, 'protocol'>
  : never;

export const DOC_SESSION_MESSAGE_ROLES = ['agent', 'user'] as const;
export const DOC_SESSION_TOOL_CATEGORIES = ['read', 'search', 'edit', 'command', 'web', 'other'] as const;
export const DOC_SESSION_TOOL_STATUSES = ['started', 'succeeded', 'failed'] as const;
export const DOC_SESSION_FAILURE_CATEGORIES = ['runtime_error', 'tool_failed', 'timeout', 'cancelled', 'boundary_denied'] as const;
export type DocSessionMessageRole = typeof DOC_SESSION_MESSAGE_ROLES[number];
export type DocSessionToolCategory = typeof DOC_SESSION_TOOL_CATEGORIES[number];
export type DocSessionToolStatus = typeof DOC_SESSION_TOOL_STATUSES[number];
export type DocSessionFailureCategory = typeof DOC_SESSION_FAILURE_CATEGORIES[number];

export const DOC_SESSION_EVENT_TEXT_MAX_BYTES = 16_384;
export const DOC_SESSION_EVENT_MAX_PATHS = 32;
const PATH_MAX_BYTES = 512;
export const DOC_SESSION_EVENTS_PAGE = 200;
/** The page polls each 1 s while a turn runs and each 30 s when the session is idle. */
export const DOC_SESSION_POLL_MS = Object.freeze({ running: 1_000, idle: 30_000 });
export type DocSessionActivity = keyof typeof DOC_SESSION_POLL_MS;

/** Replaces a whole text or path when a secret is left after every replacement rule. */
export const DOC_SESSION_TEXT_WITHHELD = '[withheld: possible secret]';
const PATH_WITHHELD = '[withheld]';

const ENCODER = new TextEncoder();
const utf8Bytes = (text: string): number => ENCODER.encode(text).length;

const COMMON_KEYS = ['at', 'epoch', 'protocol', 'seq', 'type'];
const TYPE_KEYS: Readonly<Record<DocSessionEventV1['type'], readonly string[]>> = {
  message: ['role', 'text', 'truncated'],
  tool: ['category', 'paths', 'status'],
  turn: ['boundary'],
  failure: ['category'],
};

// Some replacements still match their own rule (`Authorization: Bearer [REDACTED]`),
// so the check runs on the text with the replacement strings taken out.
function hasUnredactedSecret(text: string): boolean {
  let rest = text;
  for (const { replacement } of SECRET_TOKEN_PATTERNS) rest = rest.split(replacement).join('');
  return containsSecret(rest);
}

function replaceSecrets(text: string): string {
  let out = text;
  for (const { pattern, replacement } of SECRET_TOKEN_PATTERNS) out = out.replace(new RegExp(pattern.source, pattern.flags), replacement);
  return out;
}

/** Message text the page may show: token rules first, then absolute paths; a secret left over withholds the text. */
function redactDocSessionText(text: string): string {
  const out = publicDevActivityText(replaceSecrets(text));
  return hasUnredactedSecret(out) ? DOC_SESSION_TEXT_WITHHELD : out;
}

/** A path keeps its place in the list; a secret left over after the token rules withholds it. */
export function redactDocSessionPath(path: string): string {
  const out = replaceSecrets(path);
  return hasUnredactedSecret(out) ? PATH_WITHHELD : out;
}

/**
 * The stored form of message text: redacted whole, then cut to the byte limit.
 * A cut inside a replacement (`Authorization: Bearer [RE`) can match a rule
 * again, so cut text that no longer passes is withheld.
 */
export function storedDocSessionText(text: string): { readonly text: string; readonly truncated: boolean } {
  const cut = truncateUtf8(redactDocSessionText(text), DOC_SESSION_EVENT_TEXT_MAX_BYTES);
  return cut.truncated && !publicText(cut.text) ? { text: DOC_SESSION_TEXT_WITHHELD, truncated: true } : cut;
}

/** The longest prefix of whole code points that fits the byte limit. */
function truncateUtf8(text: string, maxBytes: number): { readonly text: string; readonly truncated: boolean } {
  if (utf8Bytes(text) <= maxBytes) return { text, truncated: false };
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    const size = utf8Bytes(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return { text: text.slice(0, end), truncated: true };
}

/** A path inside the repository, relative to its root, in `/` form. */
export function isRepositoryRelativePath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || utf8Bytes(value) > PATH_MAX_BYTES) return false;
  if (value.startsWith('/') || value.includes('\\') || /[\u0000-\u001f\u007f]/u.test(value) || /^[A-Za-z]:/u.test(value)) return false;
  const segments = value.split('/');
  // `~` as the first segment names a home directory, not a path inside the repository.
  return segments[0] !== '~' && segments.every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const counter = (value: unknown, min: number): value is number => Number.isSafeInteger(value) && (value as number) >= min;
const oneOf = <T>(value: unknown, values: readonly T[]): value is T => values.includes(value as T);
// A date parser skips text it does not read, such as `(token) 2020`; only the exact UTC form passes.
const timestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) && new Date(value).toISOString() === value;

function publicText(value: unknown): value is string {
  return typeof value === 'string' && utf8Bytes(value) <= DOC_SESSION_EVENT_TEXT_MAX_BYTES
    && isPublicDevActivityText(value) && !hasUnredactedSecret(value);
}

/** Closed decoder for one stored event. Every text must already be redacted. */
export function decodeDocSessionEvent(value: unknown): DocSessionEventV1 {
  if (!isObject(value) || !oneOf(value.type, Object.keys(TYPE_KEYS) as DocSessionEventV1['type'][])) throw new Error('doc session event type');
  const keys = Object.keys(value).sort();
  const expected = [...COMMON_KEYS, ...TYPE_KEYS[value.type]].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) throw new Error('doc session event keys');
  if (value.protocol !== 1 || !counter(value.epoch, 1) || !counter(value.seq, 0) || !timestamp(value.at)) throw new Error('doc session event cursor');
  const valid = value.type === 'message' ? oneOf(value.role, DOC_SESSION_MESSAGE_ROLES) && publicText(value.text) && typeof value.truncated === 'boolean'
    : value.type === 'tool' ? oneOf(value.category, DOC_SESSION_TOOL_CATEGORIES) && oneOf(value.status, DOC_SESSION_TOOL_STATUSES)
      && Array.isArray(value.paths) && value.paths.length <= DOC_SESSION_EVENT_MAX_PATHS
      && value.paths.every(path => isRepositoryRelativePath(path) && !hasUnredactedSecret(path))
    : value.type === 'turn' ? oneOf(value.boundary, ['started', 'ended'])
    : oneOf(value.category, DOC_SESSION_FAILURE_CATEGORIES);
  if (!valid) throw new Error('doc session event fields');
  return value as unknown as DocSessionEventV1;
}

export interface DocSessionCursor { readonly epoch: number; readonly seq: number }

/** `<epoch>.<seq>`, both decimal without leading zeros. */
export function parseDocSessionCursor(value: string): DocSessionCursor | null {
  const match = /^(0|[1-9][0-9]{0,15})\.(0|[1-9][0-9]{0,15})$/u.exec(value);
  if (!match) return null;
  const epoch = Number(match[1]), seq = Number(match[2]);
  return Number.isSafeInteger(epoch) && Number.isSafeInteger(seq) ? { epoch, seq } : null;
}

export const formatDocSessionCursor = (cursor: DocSessionCursor): string => `${cursor.epoch}.${cursor.seq}`;

export const compareDocSessionCursor = (a: DocSessionCursor, b: DocSessionCursor): number => a.epoch - b.epoch || a.seq - b.seq;

/** Running from a turn start until its end; idle before the first turn and after an end. */
export function docSessionActivity(events: readonly DocSessionEventV1[]): DocSessionActivity {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.type === 'turn') return event.boundary === 'started' ? 'running' : 'idle';
  }
  return 'idle';
}

export interface OperatorDocSessionEventsV1 {
  readonly protocol: 1;
  readonly kind: 'operator_docs_session_events';
  readonly session_id: string;
  /** The cursor of the request; null reads from the start. */
  readonly after: string | null;
  readonly events: readonly DocSessionEventV1[];
  /** The cursor for the next poll: the last event returned, else `after`. */
  readonly next_cursor: string | null;
  /** False when more events follow the page. */
  readonly complete: boolean;
  readonly activity: DocSessionActivity;
}

const PAGE_KEYS = ['activity', 'after', 'complete', 'events', 'kind', 'next_cursor', 'protocol', 'session_id'];

/** Closed decoder for the events read response, for the server before it sends and for the page. */
export function decodeOperatorDocSessionEvents(value: unknown, sessionId: string, after: string | null): OperatorDocSessionEventsV1 {
  if (!isObject(value)) throw new Error('doc session events page');
  const keys = Object.keys(value).sort();
  if (keys.length !== PAGE_KEYS.length || keys.some((key, index) => key !== PAGE_KEYS[index])) throw new Error('doc session events page keys');
  if (value.protocol !== 1 || value.kind !== 'operator_docs_session_events' || value.session_id !== sessionId || value.after !== after
    || typeof value.complete !== 'boolean' || !oneOf(value.activity, ['running', 'idle']) || !Array.isArray(value.events)
    || value.events.length > DOC_SESSION_EVENTS_PAGE) throw new Error('doc session events page fields');
  const events = value.events.map(decodeDocSessionEvent);
  const floor = after === null ? null : parseDocSessionCursor(after);
  if (after !== null && floor === null) throw new Error('doc session events page cursor');
  let previous = floor;
  for (const event of events) {
    if (previous !== null && compareDocSessionCursor(event, previous) <= 0) throw new Error('doc session events page order');
    previous = event;
  }
  const expectedNext = previous === null ? null : formatDocSessionCursor(previous);
  if (value.next_cursor !== expectedNext) throw new Error('doc session events page next cursor');
  return value as unknown as OperatorDocSessionEventsV1;
}
