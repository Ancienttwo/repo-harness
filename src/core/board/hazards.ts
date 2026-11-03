// Strict decoder for assets/review-hazards.v1.json, the one source of the
// change hazard list. scripts/sync-reference-configs.ts renders the list in
// agentic-development-flow.md from it, and the board rule R3 reads its
// path-visible entries. The package ships the file, so downstream boards read
// the same list. Exact keys; a hazard that a path cannot show has no paths.

import hazardsJson from '../../../assets/review-hazards.v1.json';

export const REVIEW_HAZARDS_VERSION = 'repo-harness.review-hazards.v1';
const HAZARD_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
/** One path segment: `**`, or literal characters with at most one `*`. */
const GLOB_SEGMENT = /^(?:\*\*|[A-Za-z0-9._-]*\*?[A-Za-z0-9._-]*)$/u;

export type ReviewHazard =
  | { readonly id: string; readonly text: string; readonly path_visible: true; readonly paths: readonly string[] }
  | { readonly id: string; readonly text: string; readonly path_visible: false };

export interface ReviewHazardsV1 {
  readonly hazards_version: typeof REVIEW_HAZARDS_VERSION;
  readonly hazards: readonly ReviewHazard[];
}

export function decodeReviewHazards(value: unknown): ReviewHazardsV1 {
  const fail = (what: string): never => { throw new Error(`review hazards invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(what);
    if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(`${what} fields`);
    return v as Record<string, unknown>;
  };
  // Text lands in a markdown table cell: one line, no pipe.
  const cell = (v: unknown, what: string): string =>
    (typeof v === 'string' && v.length > 0 && v.length <= 280 && v.trim() === v && !/[\x00-\x1f\x7f|]/u.test(v) ? v : fail(what));
  const glob = (v: unknown, what: string): string => {
    const segments = typeof v === 'string' ? v.split('/') : [];
    return segments.length > 0 && segments.every(s => s !== '' && s !== '.' && s !== '..' && GLOB_SEGMENT.test(s)) ? v as string : fail(what);
  };

  const root = obj(value, ['hazards_version', 'hazards'], 'list');
  if (root.hazards_version !== REVIEW_HAZARDS_VERSION) fail('hazards_version');
  if (!Array.isArray(root.hazards) || root.hazards.length === 0) fail('hazards');
  const ids = new Set<string>();
  const hazards = (root.hazards as unknown[]).map((raw): ReviewHazard => {
    const visible = (raw as { path_visible?: unknown } | null)?.path_visible === true;
    const h = obj(raw, visible ? ['id', 'text', 'path_visible', 'paths'] : ['id', 'text', 'path_visible'], 'hazard');
    const id = typeof h.id === 'string' && HAZARD_ID.test(h.id) ? h.id : fail('hazard id');
    if (ids.has(id)) fail(`duplicate hazard id ${id}`);
    ids.add(id);
    const text = cell(h.text, `${id} text`);
    if (!visible) return h.path_visible === false ? { id, text, path_visible: false } : fail(`${id} path_visible`);
    if (!Array.isArray(h.paths) || h.paths.length === 0) fail(`${id} paths`);
    const paths = (h.paths as unknown[]).map(p => glob(p, `${id} paths`));
    if (new Set(paths).size !== paths.length) fail(`${id} paths`);
    return { id, text, path_visible: true, paths };
  });
  return { hazards_version: REVIEW_HAZARDS_VERSION, hazards };
}

/** The packaged list. A decode failure is a build error; the board and reference-config tests stop it. */
export const REVIEW_HAZARDS: ReviewHazardsV1 = decodeReviewHazards(hazardsJson);

/** `**` matches zero or more whole segments; `*` matches inside one segment. */
function globPattern(glob: string): RegExp {
  const segments = glob.split('/');
  const body = segments.map((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === '**') return last ? '.+' : '(?:[^/]+/)*';
    return segment.replace(/\./gu, '\\.').replace('*', '[^/]*') + (last ? '' : '/');
  }).join('');
  return new RegExp(`^${body}$`, 'u');
}

export interface PathHazardHitV1 {
  readonly hazard: string;
  readonly path: string;
}

/** Hits of repository-relative paths on the path-visible hazards; the other hazards need a reviewer. */
export function pathHazardHits(paths: readonly string[]): PathHazardHitV1[] {
  return REVIEW_HAZARDS.hazards.flatMap((hazard) => {
    if (!hazard.path_visible) return [];
    const patterns = hazard.paths.map(globPattern);
    return paths.filter(path => patterns.some(pattern => pattern.test(path))).map(path => ({ hazard: hazard.id, path }));
  });
}
