// Strict decoders for the two path lists of Review by risk: the change hazard
// list (assets/review-hazards.v1.json) and the High list
// (assets/review-high-list.v1.json). scripts/sync-reference-configs.ts renders
// both lists in agentic-development-flow.md; the board rule R3 reads the
// path-visible hazards and R5 the path-visible High signals. The package ships
// both files, so downstream boards read the same lists. Exact keys; an entry
// that a path cannot show has no paths.

import hazardsJson from '../../../assets/review-hazards.v1.json';
import highListJson from '../../../assets/review-high-list.v1.json';
import { decodeReaders } from '../evidence/decode-readers';

export const REVIEW_HAZARDS_VERSION = 'repo-harness.review-hazards.v1';
export const REVIEW_HIGH_LIST_VERSION = 'repo-harness.review-high-list.v1';
const ENTRY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
/** One path segment: `**`, or literal characters with at most one `*`. */
const GLOB_SEGMENT = /^(?:\*\*|[A-Za-z0-9._-]*\*?[A-Za-z0-9._-]*)$/u;

export type ReviewPathEntry =
  | { readonly id: string; readonly text: string; readonly path_visible: true; readonly paths: readonly string[] }
  | { readonly id: string; readonly text: string; readonly path_visible: false };

export type ReviewHazard = ReviewPathEntry;

export interface ReviewHazardsV1 {
  readonly hazards_version: typeof REVIEW_HAZARDS_VERSION;
  readonly hazards: readonly ReviewHazard[];
}

export interface ReviewHighListV1 {
  readonly high_list_version: typeof REVIEW_HIGH_LIST_VERSION;
  readonly signals: readonly ReviewPathEntry[];
}

interface PathListShape {
  readonly label: string;
  readonly version_key: string;
  readonly version: string;
  readonly list_key: string;
  readonly entry: string;
}

function decodePathList(value: unknown, shape: PathListShape): ReviewPathEntry[] {
  const fail = (what: string): never => { throw new Error(`${shape.label} invalid: ${what}`); };
  const { obj } = decodeReaders(fail);
  // Text lands in a markdown table cell: one line, no pipe.
  const cell = (v: unknown, what: string): string =>
    (typeof v === 'string' && v.length > 0 && v.length <= 280 && v.trim() === v && !/[\x00-\x1f\x7f|]/u.test(v) ? v : fail(what));
  const glob = (v: unknown, what: string): string => {
    const segments = typeof v === 'string' ? v.split('/') : [];
    return segments.length > 0 && segments.every(s => s !== '' && s !== '.' && s !== '..' && GLOB_SEGMENT.test(s)) ? v as string : fail(what);
  };

  const root = obj(value, [shape.version_key, shape.list_key], 'list');
  if (root[shape.version_key] !== shape.version) fail(shape.version_key);
  const raws = root[shape.list_key];
  if (!Array.isArray(raws) || raws.length === 0) fail(shape.list_key);
  const ids = new Set<string>();
  return (raws as unknown[]).map((raw): ReviewPathEntry => {
    const visible = (raw as { path_visible?: unknown } | null)?.path_visible === true;
    const h = obj(raw, visible ? ['id', 'text', 'path_visible', 'paths'] : ['id', 'text', 'path_visible'], shape.entry);
    const id = typeof h.id === 'string' && ENTRY_ID.test(h.id) ? h.id : fail(`${shape.entry} id`);
    if (ids.has(id)) fail(`duplicate ${shape.entry} id ${id}`);
    ids.add(id);
    const text = cell(h.text, `${id} text`);
    if (!visible) return h.path_visible === false ? { id, text, path_visible: false } : fail(`${id} path_visible`);
    if (!Array.isArray(h.paths) || h.paths.length === 0) fail(`${id} paths`);
    const paths = (h.paths as unknown[]).map(p => glob(p, `${id} paths`));
    if (new Set(paths).size !== paths.length) fail(`${id} paths`);
    return { id, text, path_visible: true, paths };
  });
}

export function decodeReviewHazards(value: unknown): ReviewHazardsV1 {
  const hazards = decodePathList(value, { label: 'review hazards', version_key: 'hazards_version', version: REVIEW_HAZARDS_VERSION, list_key: 'hazards', entry: 'hazard' });
  return { hazards_version: REVIEW_HAZARDS_VERSION, hazards };
}

export function decodeReviewHighList(value: unknown): ReviewHighListV1 {
  const signals = decodePathList(value, { label: 'review high list', version_key: 'high_list_version', version: REVIEW_HIGH_LIST_VERSION, list_key: 'signals', entry: 'signal' });
  return { high_list_version: REVIEW_HIGH_LIST_VERSION, signals };
}

/** The packaged lists. A decode failure is a build error; the board and reference-config tests stop it. */
export const REVIEW_HAZARDS: ReviewHazardsV1 = decodeReviewHazards(hazardsJson);
export const REVIEW_HIGH_LIST: ReviewHighListV1 = decodeReviewHighList(highListJson);

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

function pathHits(entries: readonly ReviewPathEntry[], paths: readonly string[]): { readonly id: string; readonly path: string }[] {
  return entries.flatMap((entry) => {
    if (!entry.path_visible) return [];
    const patterns = entry.paths.map(globPattern);
    return paths.filter(path => patterns.some(pattern => pattern.test(path))).map(path => ({ id: entry.id, path }));
  });
}

export interface PathHazardHitV1 {
  readonly hazard: string;
  readonly path: string;
}

/** Hits of repository-relative paths on the path-visible hazards; the other hazards need a reviewer. */
export function pathHazardHits(paths: readonly string[]): PathHazardHitV1[] {
  return pathHits(REVIEW_HAZARDS.hazards, paths).map(hit => ({ hazard: hit.id, path: hit.path }));
}

export interface PathHighHitV1 {
  readonly signal: string;
  readonly path: string;
}

/** Hits of repository-relative paths on the path-visible High signals; a reviewer applies the whole list. */
export function pathHighHits(paths: readonly string[]): PathHighHitV1[] {
  return pathHits(REVIEW_HIGH_LIST.signals, paths).map(hit => ({ signal: hit.id, path: hit.path }));
}
