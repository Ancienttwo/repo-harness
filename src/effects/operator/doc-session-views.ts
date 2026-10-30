import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readSync } from 'node:fs';
import { basename, join } from 'node:path';
import { decodeDocSessionRecord, type DocSessionRecordV1 } from '../../core/operator/doc-session-record';
import { formatDocSessionCursor, storedDocSessionText } from '../../core/operator/doc-session-events';
import {
  decodeOperatorDocSessionDetail, decodeOperatorDocSessionList, DOC_SESSION_LIST_MAX, docSessionUnread,
  isDocSessionDetailRequest, isDocSessionListRequest,
  type DocSessionDetailRequest, type DocSessionListRequest, type DocSessionSummary,
  type OperatorDocSessionDetail, type OperatorDocSessionList,
} from '../../core/operator/doc-session-views';
import type { DocSessionAgentRecord } from '../../core/operator/doc-session-agent-record';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { DocSessionReadError, docSessionGitRunner, resolveDocSession } from './doc-session-changes';
import { docSessionEventsTail, sessionDirectory } from './doc-session-events';
import { operatorStateDir } from './write-audit';

const fail = (code: 'unavailable' | 'too_large'): never => { throw new DocSessionReadError(code); };
const SID = /^[0-9a-f]{32}$/u;
/** Bound total metadata and event bytes per list observation, in addition to the supervised read deadline. */
const LIST_BYTES = 32 * 1024 * 1024;
const RECORD_BYTES = 1024 * 1024;

function readJson(path: string, optional = false): unknown {
  let fd: number;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if (optional && (error as NodeJS.ErrnoException).code === 'ENOENT') return null; return fail('unavailable'); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) return fail('unavailable');
    if (stat.size > RECORD_BYTES) return fail('too_large');
    const bytes = Buffer.alloc(stat.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
    }
    if (length !== stat.size) return fail('unavailable');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)));
  } finally { closeSync(fd); }
}

function label(value: string): string {
  // Redact the whole input before deriving a short title; never cut a raw token in two.
  return storedDocSessionText(storedDocSessionText(value).text.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim().slice(0, 160)).text || 'Doc session';
}

function metadata(env: NodeJS.ProcessEnv, sid: string, repositoryNames: ReadonlyMap<string, string>, seen: string | null) {
  const directory = sessionDirectory(env, sid);
  const record = decodeDocSessionRecord(readJson(join(directory, 'session.json')));
  if (record.session_id !== sid || !repositoryNames.has(record.repository_id)) return fail('unavailable');
  const raw = readJson(join(directory, 'agent.json'), true);
  // The host owns this private schema. Project only its identity, state, epoch and timestamp.
  // The public decoder below validates each projected value; no private object is serialized.
  const agent = raw as DocSessionAgentRecord | null;
  if (agent !== null && (typeof agent !== 'object' || agent.protocol !== 1 || agent.kind !== 'docs_session_agent' || agent.session_id !== sid
    || !['starting', 'running', 'idle', 'stopped', 'failed'].includes(agent.state) || !Number.isSafeInteger(agent.epoch) || agent.epoch < 1 || typeof agent.updated_at !== 'string'
    || !Number.isFinite(Date.parse(agent.updated_at)) || new Date(agent.updated_at).toISOString() !== agent.updated_at)) return fail('unavailable');
  const tail = docSessionEventsTail(env, sid);
  const lastCursor = tail.last === null ? null : formatDocSessionCursor(tail.last);
  const summary: DocSessionSummary = {
    session_id: sid, title: label(record.instruction), repository_id: record.repository_id,
    repository_name: repositoryNames.get(record.repository_id)!, runtime: record.runtime,
    state: agent === null ? 'created' : agent.state, created_at: new Date(record.created_at).toISOString(),
    last_activity_at: [record.created_at, agent?.updated_at, tail.last_at].filter((at): at is string => !!at).sort().at(-1)!,
    last_cursor: lastCursor, unread: docSessionUnread(lastCursor, seen),
  };
  return { summary, record, epoch: agent?.epoch ?? null, turn: tail.activity };
}

function repositoryNames(env: NodeJS.ProcessEnv): ReadonlyMap<string, string> {
  return new Map(readRepoHarnessRegistryStrictSnapshot({ env }).repos.map(repo => [repo.id, label(basename(repo.path))]));
}

export function readDocSessionList(env: NodeJS.ProcessEnv, request: DocSessionListRequest): OperatorDocSessionList {
  if (!isDocSessionListRequest(request)) return fail('unavailable');
  const root = join(operatorStateDir(env), 'sessions');
  try { if (!lstatSync(root).isDirectory()) return fail('unavailable'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return decodeOperatorDocSessionList({ protocol: 1, kind: 'operator_docs_sessions', sessions: [] }, request);
    throw error;
  }
  const directory = opendirSync(root);
  const ids: string[] = [];
  let bytes = 0, entries = 0;
  try {
    for (let entry = directory.readSync(); entry !== null; entry = directory.readSync()) {
      if (++entries > DOC_SESSION_LIST_MAX) return fail('too_large');
      if (!SID.test(entry.name)) continue;
      if (!entry.isDirectory()) return fail('unavailable');
      ids.push(entry.name);
      for (const name of ['session.json', 'agent.json', 'events.jsonl']) {
        try {
          const stat = lstatSync(join(root, entry.name, name));
          if (!stat.isFile()) return fail('unavailable');
          bytes += stat.size;
          if (bytes > LIST_BYTES) return fail('too_large');
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
    }
  } finally { directory.closeSync(); }
  const names = repositoryNames(env);
  const sessions = ids.map(sid => metadata(env, sid, names, request.seen[sid] ?? null).summary);
  sessions.sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at) || a.session_id.localeCompare(b.session_id));
  return decodeOperatorDocSessionList({ protocol: 1, kind: 'operator_docs_sessions', sessions }, request);
}

export function readDocSessionDetail(env: NodeJS.ProcessEnv, request: DocSessionDetailRequest): OperatorDocSessionDetail {
  if (!isDocSessionDetailRequest(request)) return fail('unavailable');
  const view = metadata(env, request.session_id, repositoryNames(env), request.seen);
  const git = docSessionGitRunner(env);
  const resolved = resolveDocSession(env, request.session_id, git.text);
  const record: DocSessionRecordV1 = resolved.record;
  return decodeOperatorDocSessionDetail({
    protocol: 1, kind: 'operator_docs_session', session: view.summary,
    branch: record.branch, worktree: basename(resolved.worktree),
    head_commit: git.text(resolved.worktree, ['rev-parse', '--verify', 'HEAD']).trim(), base_commit: record.base_commit,
    epoch: view.epoch, turn: view.turn,
  }, request);
}
