/**
 * `GET /api/v1/repositories`: the registered repositories, from the registry.
 * It is the one repository list of the console: the repository switcher, the
 * single-repository pages, the board form and the Repositories page read it.
 * Per-repository health and counts stay with Dev Activity.
 */
export const OPERATOR_REPOSITORIES_KIND = 'operator_repositories' as const;
export const OPERATOR_REPOSITORIES_PROTOCOL = 1 as const;

export type OperatorRepositoryAccessMode = 'read_only' | 'read_write';

export interface OperatorRepositoryV1 {
  /** Registry id (`repo_` + 16 hex). */
  readonly repository_id: string;
  /** The basename of the registered root; the root itself stays on the server. */
  readonly display_name: string;
  readonly access_mode: OperatorRepositoryAccessMode;
}

export interface OperatorRepositoriesV1 {
  readonly protocol: typeof OPERATOR_REPOSITORIES_PROTOCOL;
  readonly kind: typeof OPERATOR_REPOSITORIES_KIND;
  /** Registrations whose root is a real directory, sorted by display name, then id. */
  readonly repositories: readonly OperatorRepositoryV1[];
  /** Registrations whose root is gone or is not a real directory. */
  readonly stale_registrations: number;
}

const REPOSITORY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

/** The answer is not protocol 1: no row of it, nor an earlier list, may be shown. */
export class OperatorRepositoriesInvalidError extends Error {
  constructor() { super('repositories response is invalid'); }
}

function invalid(): never {
  throw new OperatorRepositoriesInvalidError();
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  if (actual.length !== keys.length || keys.slice().sort().some((key, index) => key !== actual[index])) invalid();
  return record;
}

function decodeRepository(value: unknown): OperatorRepositoryV1 {
  const record = exactRecord(value, ['repository_id', 'display_name', 'access_mode']);
  const { repository_id: id, display_name: name, access_mode: access } = record;
  if (typeof id !== 'string' || !REPOSITORY_ID.test(id)) invalid();
  if (typeof name !== 'string' || name.length === 0) invalid();
  if (access !== 'read_only' && access !== 'read_write') invalid();
  return Object.freeze({ repository_id: id, display_name: name, access_mode: access });
}

/** Refuse any other protocol, kind or field at the browser boundary. */
export function decodeOperatorRepositories(value: unknown): OperatorRepositoriesV1 {
  const record = exactRecord(value, ['protocol', 'kind', 'repositories', 'stale_registrations']);
  if (record.protocol !== OPERATOR_REPOSITORIES_PROTOCOL || record.kind !== OPERATOR_REPOSITORIES_KIND) invalid();
  if (!Array.isArray(record.repositories)) invalid();
  const stale = record.stale_registrations;
  if (typeof stale !== 'number' || !Number.isSafeInteger(stale) || stale < 0) invalid();
  const repositories = record.repositories.map(decodeRepository);
  if (new Set(repositories.map(row => row.repository_id)).size !== repositories.length) invalid();
  return Object.freeze({
    protocol: OPERATOR_REPOSITORIES_PROTOCOL,
    kind: OPERATOR_REPOSITORIES_KIND,
    repositories: Object.freeze(repositories),
    stale_registrations: stale,
  });
}
