import { decodeDocCitation, type DocCitationV1 } from './doc-citation';

/**
 * The doc session record (`<repoHarnessHome>/operator/sessions/<sid>/session.json`,
 * issue #1021): server state, written once at creation. `worktree` is an
 * absolute path; no route serves it.
 */
export interface DocSessionRecordV1 {
  readonly protocol: 1;
  readonly kind: 'docs_session';
  readonly session_id: string;
  readonly state: 'created';
  readonly created_at: string;
  readonly repository_id: string;
  readonly runtime: string;
  readonly branch: string;
  readonly worktree: string;
  readonly base_commit: string;
  readonly citations: readonly DocSessionRecordCitationV1[];
  readonly instruction: string;
}

/** The submitted citation, and where the session base holds it. */
export type DocSessionRecordCitationV1 = DocCitationV1 & { readonly resolved: DocCitationV1; readonly relocated: boolean };

const RECORD_KEYS = ['base_commit', 'branch', 'citations', 'created_at', 'instruction', 'kind', 'protocol', 'repository_id', 'runtime', 'session_id', 'state', 'worktree'];
const SESSION_ID = /^[0-9a-f]{32}$/u;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
};

function decodeCitation(value: unknown): DocSessionRecordCitationV1 {
  if (!isObject(value) || typeof value.relocated !== 'boolean') throw new Error('doc session record citation');
  const { resolved, relocated, ...submitted } = value;
  return { ...decodeDocCitation(submitted), resolved: decodeDocCitation(resolved), relocated };
}

/** Closed decoder. The branch must be the one creation names for this session id. */
export function decodeDocSessionRecord(value: unknown): DocSessionRecordV1 {
  if (!isObject(value) || !exactKeys(value, RECORD_KEYS)) throw new Error('doc session record keys');
  const { protocol, kind, session_id, state, created_at, repository_id, runtime, branch, worktree, base_commit, citations, instruction } = value;
  if (protocol !== 1 || kind !== 'docs_session' || state !== 'created') throw new Error('doc session record kind');
  if (typeof session_id !== 'string' || !SESSION_ID.test(session_id) || branch !== `docs/${session_id.slice(0, 12)}`) throw new Error('doc session record identity');
  if (typeof created_at !== 'string' || !Number.isFinite(Date.parse(created_at))) throw new Error('doc session record created_at');
  if (typeof repository_id !== 'string' || !TOKEN.test(repository_id) || typeof runtime !== 'string' || !TOKEN.test(runtime)) throw new Error('doc session record repository');
  if (typeof worktree !== 'string' || !worktree.startsWith('/') || worktree.includes('\0')) throw new Error('doc session record worktree');
  if (typeof base_commit !== 'string' || !COMMIT.test(base_commit)) throw new Error('doc session record base_commit');
  if (typeof instruction !== 'string' || !Array.isArray(citations) || citations.length === 0) throw new Error('doc session record content');
  return {
    protocol, kind, session_id, state, created_at, repository_id, runtime, branch, worktree, base_commit, instruction,
    citations: citations.map(decodeCitation),
  };
}
