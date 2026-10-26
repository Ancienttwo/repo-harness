// Public contract of the docs routes (PRD G7). The tree comes from the docs
// collector's cache; a file comes from one object of the collector's resident
// cat-file process. Both name the ref and the commit they were read from.
// The strict decoders serve the server before it sends and the browser before
// it renders.

export const OPERATOR_DOCS_TREE_KIND = 'operator_docs_tree' as const;
export const OPERATOR_DOCS_FILE_KIND = 'operator_docs_file' as const;

/** Why a repository's docs cannot be served. Each maps to one HTTP status in the route. */
export const DOCS_UNAVAILABLE_REASONS = [
  'docs_pending',
  'registry_unavailable',
  'repository_not_found',
  'default_branch_unknown',
  'github_remote_missing',
  'github_remote_ambiguous',
  'branch_missing',
  'docs_too_large',
  'docs_reader_unavailable',
] as const;
export type DocsUnavailableReason = typeof DOCS_UNAVAILABLE_REASONS[number];

export interface DocsTreeV1 {
  readonly protocol: 1;
  readonly kind: typeof OPERATOR_DOCS_TREE_KIND;
  readonly repository_id: string;
  /** The ref the collector read, for example `refs/remotes/origin/main`. */
  readonly ref: string;
  readonly commit: string;
  /** When the collector built this listing. */
  readonly collected_at: string;
  readonly files: readonly { readonly path: string; readonly size: number; readonly sha256: string }[];
}

export interface DocsFileV1 {
  readonly protocol: 1;
  readonly kind: typeof OPERATOR_DOCS_FILE_KIND;
  readonly repository_id: string;
  readonly ref: string;
  readonly commit: string;
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  readonly text: string;
  /** The worktree copy is missing, is not the same regular file, or has other bytes. */
  readonly worktree_differs: boolean;
}

const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const DOCS_REF = /^refs\/(?:heads|remotes)\/[A-Za-z0-9._/-]{1,255}$/u;
const COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
// No control byte or backslash; `docs/` first; no empty, `.` or `..` segment.
const DOCS_PATH = /^docs\/[^\x00-\x1f\x7f\\]{1,4091}$/u;

type Json = Record<string, unknown>;

function decoder(label: string) {
  const fail = (what: string): never => { throw new Error(`${label} invalid: ${what}`); };
  return {
    fail,
    obj: (v: unknown, keys: readonly string[], what: string): Json => {
      if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(what);
      return v as Json;
    },
    match: (v: unknown, pattern: RegExp, what: string): string => (typeof v === 'string' && pattern.test(v) ? v : fail(what)),
    count: (v: unknown, what: string): number => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : fail(what)),
    path: (v: unknown): string => {
      if (typeof v !== 'string' || !DOCS_PATH.test(v) || v.split('/').some(part => !part || part === '.' || part === '..')) return fail('path');
      return v;
    },
  };
}

export function decodeDocsTree(value: unknown): DocsTreeV1 {
  const d = decoder('docs tree');
  const v = d.obj(value, ['protocol', 'kind', 'repository_id', 'ref', 'commit', 'collected_at', 'files'], 'tree');
  if (v.protocol !== 1 || v.kind !== OPERATOR_DOCS_TREE_KIND) d.fail('protocol');
  d.match(v.repository_id, REPOSITORY_ID, 'repository_id');
  d.match(v.ref, DOCS_REF, 'ref');
  d.match(v.commit, COMMIT, 'commit');
  d.match(v.collected_at, ISO_TIME, 'collected_at');
  if (!Array.isArray(v.files)) d.fail('files');
  const seen = new Set<string>();
  for (const raw of v.files as unknown[]) {
    const file = d.obj(raw, ['path', 'size', 'sha256'], 'file');
    const path = d.path(file.path);
    if (seen.has(path)) d.fail('duplicate path');
    seen.add(path);
    d.count(file.size, 'size');
    d.match(file.sha256, SHA256, 'sha256');
  }
  return value as DocsTreeV1;
}

export function decodeDocsFile(value: unknown): DocsFileV1 {
  const d = decoder('docs file');
  const v = d.obj(value, ['protocol', 'kind', 'repository_id', 'ref', 'commit', 'path', 'size', 'sha256', 'text', 'worktree_differs'], 'file');
  if (v.protocol !== 1 || v.kind !== OPERATOR_DOCS_FILE_KIND) d.fail('protocol');
  d.match(v.repository_id, REPOSITORY_ID, 'repository_id');
  d.match(v.ref, DOCS_REF, 'ref');
  d.match(v.commit, COMMIT, 'commit');
  d.path(v.path);
  d.count(v.size, 'size');
  d.match(v.sha256, SHA256, 'sha256');
  if (typeof v.text !== 'string') d.fail('text');
  if (typeof v.worktree_differs !== 'boolean') d.fail('worktree_differs');
  return value as DocsFileV1;
}

/** `owner/name` of a GitHub remote URL (https, scp-like ssh or ssh://), lowercased; null for any other URL. */
export function githubRemoteRepository(url: string): string | null {
  const match = /^(?:https:\/\/(?:[^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(?::22)?\/)([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/iu.exec(url.trim());
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : null;
}
