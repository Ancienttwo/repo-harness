// Strict decoder for assets/tool-catalog.v1.json, the one source of the
// recommended tool list. The Operator Tools page bundles it, and
// scripts/sync-reference-configs.ts renders the resource table in
// external-tooling.md from it. Exact keys, closed vocabularies. The catalog
// holds no install or probe command: install state belongs to the
// check-agent-tooling detector, named here only by its `tools.<key>`.

import catalogJson from '../../../assets/tool-catalog.v1.json';

export const TOOL_CATALOG_VERSION = 'repo-harness.tool-catalog.v1';
export const TOOL_KINDS = ['resource', 'local_tool'] as const;
export const TOOL_CATEGORIES = ['frontend', 'design', 'agent_skills', 'code_navigation', 'orchestration'] as const;
/** Also the `#tools/<id>` path parameter. */
const TOOL_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
/** `docs_anchor` values are anchors in this document. */
export const EXTERNAL_TOOLING_DOC_URL = 'https://github.com/Ancienttwo/repo-harness/blob/main/docs/reference-configs/external-tooling.md';

export type ToolKind = typeof TOOL_KINDS[number];
export type ToolCategory = typeof TOOL_CATEGORIES[number];

export interface ToolCatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly kind: ToolKind;
  readonly category: ToolCategory;
  readonly url: string;
  /** SPDX id; null when upstream declares none. */
  readonly license: string | null;
  readonly summary: { readonly en: string; readonly zh: string };
  /** The detector's `tools.<key>`; always null for a resource. */
  readonly detector: string | null;
  readonly docs_anchor: string | null;
}

export interface ToolCatalogV1 {
  readonly catalog_version: typeof TOOL_CATALOG_VERSION;
  readonly tools: readonly ToolCatalogEntry[];
}

export function decodeToolCatalog(value: unknown): ToolCatalogV1 {
  const fail = (what: string): never => { throw new Error(`tool catalog invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(what);
    if (Object.keys(v).sort().join(',') !== [...keys].sort().join(',')) return fail(`${what} fields`);
    return v as Record<string, unknown>;
  };
  const oneOf = <T extends string>(v: unknown, values: readonly T[], what: string): T =>
    (typeof v === 'string' && (values as readonly string[]).includes(v) ? v as T : fail(what));
  const match = (v: unknown, pattern: RegExp, what: string): string =>
    (typeof v === 'string' && pattern.test(v) ? v : fail(what));
  const nullable = <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null ? null : read(v));
  // Text lands in a markdown table cell: one line, no pipe, no backtick.
  const cell = (v: unknown, limit: number, what: string): string =>
    (typeof v === 'string' && v.length > 0 && v.length <= limit && v.trim() === v && !/[\x00-\x1f\x7f|`]/u.test(v) ? v : fail(what));
  const httpsUrl = (v: unknown, what: string): string => {
    let url: URL;
    try { url = new URL(typeof v === 'string' ? v : ''); } catch { return fail(what); }
    return url.protocol === 'https:' && url.username === '' && url.password === '' && url.href === v && !/[\s()]/u.test(v) ? v : fail(what);
  };

  const root = obj(value, ['catalog_version', 'tools'], 'catalog');
  if (root.catalog_version !== TOOL_CATALOG_VERSION) fail('catalog_version');
  if (!Array.isArray(root.tools) || root.tools.length === 0) fail('tools');
  const ids = new Set<string>();
  const tools = (root.tools as unknown[]).map((raw): ToolCatalogEntry => {
    const t = obj(raw, ['id', 'name', 'kind', 'category', 'url', 'license', 'summary', 'detector', 'docs_anchor'], 'tool');
    const id = match(t.id, TOOL_ID, 'tool id');
    if (ids.has(id)) fail(`duplicate tool id ${id}`);
    ids.add(id);
    const kind = oneOf(t.kind, TOOL_KINDS, `${id} kind`);
    const summary = obj(t.summary, ['en', 'zh'], `${id} summary`);
    const detector = nullable(t.detector, x => match(x, /^[a-z][a-z0-9_]{0,63}$/u, `${id} detector`));
    if (kind === 'resource' && detector !== null) fail(`${id} detector`);
    return {
      id,
      name: cell(t.name, 64, `${id} name`),
      kind,
      category: oneOf(t.category, TOOL_CATEGORIES, `${id} category`),
      url: httpsUrl(t.url, `${id} url`),
      license: nullable(t.license, x => match(x, /^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/u, `${id} license`)),
      summary: { en: cell(summary.en, 280, `${id} summary.en`), zh: cell(summary.zh, 280, `${id} summary.zh`) },
      detector,
      docs_anchor: nullable(t.docs_anchor, x => match(x, /^#[a-z0-9][a-z0-9-]{0,127}$/u, `${id} docs_anchor`)),
    };
  });
  return { catalog_version: TOOL_CATALOG_VERSION, tools };
}

/** The packaged catalog. A decode failure is a build error; the catalog tests stop it. */
export const TOOL_CATALOG: ToolCatalogV1 = decodeToolCatalog(catalogJson);

/**
 * Install status of one entry. This version reads no detector result, so a
 * tool with a detector key is `unknown`: no reported check never means
 * installed. Resources and tools without a detector are `na`.
 */
export type ToolStatus = 'unknown' | 'na';

export function toolStatus(entry: ToolCatalogEntry): ToolStatus {
  return entry.kind === 'local_tool' && entry.detector !== null ? 'unknown' : 'na';
}
