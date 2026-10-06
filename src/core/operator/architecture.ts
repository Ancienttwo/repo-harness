import type { ModuleIndexV1, ModuleDetailV1 } from '../architecture/module-view';
import type { ModuleReviewPromptV1 } from '../review/module-review-prompt';

export const ARCHITECTURE_CAPABILITY_ID = /^capability\.[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const ARCHITECTURE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const OPERATOR_ARCHITECTURE_MODULES_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/architecture\/modules$/u;
export const OPERATOR_ARCHITECTURE_MODULE_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/architecture\/modules\/(capability\.[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/u;
export const OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/architecture\/modules\/(capability\.[a-z0-9-]+(?:\.[a-z0-9-]+)+)\/review-prompt$/u;

export const ARCHITECTURE_FAILURES = ['repository_not_found', 'capability_not_found', 'commit_not_found', 'invalid_request', 'unavailable', 'timeout',
  'model_invalid', 'model_missing', 'path_escape', 'secret_detected', 'worktree_changed_during_read', 'shard_out_of_range', 'budget_too_small', 'context_budget_invalid', 'diff_refs_required', 'dirty_path_invalid', 'git_path_encoding_invalid', 'git_read_failed',
  'model_duplicate_id', 'model_flow_target_invalid', 'model_parent_invalid', 'model_relation_target_invalid', 'model_validation_unavailable', 'path_invalid',
  'revision_invalid', 'source_include_invalid', 'source_missing', 'tree_path_invalid', 'yaml_invalid'] as const;

type Check = (value: unknown) => boolean;
const text: Check = value => typeof value === 'string';
const integer: Check = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive: Check = value => integer(value) && (value as number) > 0;
const bool: Check = value => typeof value === 'boolean';
const match = (pattern: RegExp): Check => value => text(value) && pattern.test(value as string);
const one = (...values: unknown[]): Check => value => values.includes(value);
const nullable = (check: Check): Check => value => value === null || check(value);
const list = (check: Check): Check => value => Array.isArray(value) && value.every(check);
// Each object has exactly one public field set. Nested records use the same rule.
const object = (fields: Record<string, Check>): Check => value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === Object.keys(fields).length
    && Object.entries(fields).every(([key, check]) => Object.hasOwn(record, key) && check(record[key]));
};
const hash = match(/^[0-9a-f]{64}$/);
const commit = match(ARCHITECTURE_COMMIT);
const capability = match(ARCHITECTURE_CAPABILITY_ID);
const path: Check = value => text(value) && !(value as string).startsWith('/') && !/^[A-Za-z]:/.test(value as string)
  && !/[\\\x00-\x1f\x7f]/.test(value as string) && (value as string).split('/').every(part => part !== '' && part !== '.' && part !== '..');
const state = object({ model_valid: one('valid', 'invalid', 'unknown'), generated_summary: one('fresh', 'stale', 'unknown'), section3: one('present', 'pending') });
const step = object({ id: text, from: text, to: text, label: text,
  evidence: object({ entrypointId: text, sourceSymbol: text, sinkId: text }) });
const flow: Check = value => object({ id: text, capabilityId: capability, name: text, applicability: one('not-applicable'), rationale: text })(value)
  || object({ id: text, capabilityId: capability, name: text, applicability: one('required'),
    participants: list(object({ id: text, nodeId: text })), steps: list(step),
    outcomes: list(object({ id: text, kind: one('success', 'error'), label: text, steps: list(step), terminal: object({ participant: text, label: text }) })) })(value);
const graphNode: Check = value => object({ id: text, kind: one('capability', 'component'), name: text, role: one('center', 'child', 'caller', 'callee') })(value)
  || object({ id: text, kind: one('group'), role: one('caller', 'callee'), count: positive, members: list(object({ id: text, name: text })) })(value);
const index = object({ schema_version: one('repo-harness.architecture-modules.v1'), commit,
  modules: list(object({ id: capability, domain: text, name: text, status: text, components: integer, state })) });
const detail = object({ schema_version: one('repo-harness.architecture-module.v1'), commit,
  module: object({ id: capability, name: text, status: text, summary: text, responsibilities: list(text), verification: list(text),
    entrypoints: list(object({ id: text, path, symbols: list(object({ name: text, sinks: list(object({ id: text, path, symbol: text })) })) })) }),
  graph: object({ center: capability, nodes: list(graphNode), edges: list(object({ source: text, target: text, intent: text, relation_kind: text, direction: one('directed', 'undirected') })) }),
  flows: list(flow), section3: nullable(text), linked_docs: list(object({ path, kind: one('contract', 'plan'), status: nullable(text) })), state });
const prompt = object({ schema_version: one('repo-harness.module-review-prompt.v1'), prompt_version: text, package_version: text,
  repository_id: match(/^repo_[0-9a-f]{16}$/), capability_id: capability, commit, mode: one('module', 'diff'), base: nullable(commit), head: nullable(commit),
  worktree_dirty_paths: list(path), dirty_content_sha256: nullable(hash), model_sha256: hash, doc_sha256: nullable(hash),
  sources: list(object({ path, sha256: hash, bytes: integer, class: one('required', 'optional'), disposition: one('included', 'omitted', 'chunked') })),
  budget: object({ input_cap_bytes: positive, used_bytes: integer, incomplete: bool, omitted_sections: list(text) }),
  shard: object({ index: positive, count: positive, bytes: integer }), full_prompt_sha256: hash, prompt: text, digest: hash });

export function decodeArchitectureModuleIndex(value: unknown): ModuleIndexV1 {
  if (!index(value)) throw new Error('architecture_module_index_invalid');
  return value as ModuleIndexV1;
}
export function decodeArchitectureModuleDetail(value: unknown): ModuleDetailV1 {
  if (!detail(value)) throw new Error('architecture_module_detail_invalid');
  const result = value as ModuleDetailV1;
  const ids = new Set(result.graph.nodes.map(node => node.id));
  if (result.graph.center !== result.module.id || !ids.has(result.graph.center)
    || ids.size !== result.graph.nodes.length || result.graph.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))
    || result.graph.nodes.some(node => node.kind === 'group' && node.count !== node.members.length)) throw new Error('architecture_module_detail_invalid');
  return result;
}
export function decodeArchitectureReviewPrompt(value: unknown): ModuleReviewPromptV1 {
  if (!prompt(value)) throw new Error('architecture_review_prompt_invalid');
  const result = value as ModuleReviewPromptV1;
  if (result.shard.index > result.shard.count || (result.mode === 'module' ? result.base !== null || result.head !== null : result.base === null || result.head === null)
    || (result.worktree_dirty_paths.length === 0) !== (result.dirty_content_sha256 === null)) throw new Error('architecture_review_prompt_invalid');
  return result;
}

export type ArchitectureRequest = { repository_id: string } & (
  | { kind: 'architecture_modules' }
  | { kind: 'architecture_module'; capability_id: string }
  | { kind: 'architecture_review_prompt'; capability_id: string; shard: number; base?: string; head?: string }
);
export function parseArchitectureRequest(url: URL): ArchitectureRequest | null {
  const index = OPERATOR_ARCHITECTURE_MODULES_ROUTE.exec(url.pathname);
  const detail = OPERATOR_ARCHITECTURE_MODULE_ROUTE.exec(url.pathname);
  const prompt = OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE.exec(url.pathname);
  if (!index && !detail && !prompt) return null;
  if (!prompt) {
    if (url.search !== '') throw new Error('invalid_request');
    return index ? { kind: 'architecture_modules', repository_id: index[1] }
      : { kind: 'architecture_module', repository_id: detail![1], capability_id: detail![2] };
  }
  const query = url.searchParams;
  const keys = [...query.keys()];
  if (keys.some(key => !['shard', 'mode', 'base', 'head'].includes(key)) || new Set(keys).size !== keys.length
    || !/^[1-9][0-9]{0,3}$/.test(query.get('shard') ?? '')) throw new Error('invalid_request');
  const mode = query.get('mode') ?? 'module';
  if (mode !== 'module' && mode !== 'diff') throw new Error('invalid_request');
  const base = query.get('base'), head = query.get('head');
  if (mode === 'module' ? base !== null || head !== null : !base || !head || !ARCHITECTURE_COMMIT.test(base) || !ARCHITECTURE_COMMIT.test(head)) throw new Error('invalid_request');
  return { kind: 'architecture_review_prompt', repository_id: prompt[1], capability_id: prompt[2], shard: Number(query.get('shard')),
    ...(mode === 'diff' ? { base: base!, head: head! } : {}) };
}
export function isArchitectureRequest(value: unknown): value is ArchitectureRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (!match(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)(record.repository_id)) return false;
  if (record.kind === 'architecture_modules') return object({ kind: one(record.kind), repository_id: text })(value);
  if (record.kind === 'architecture_module') return object({ kind: one(record.kind), repository_id: text, capability_id: capability })(value);
  if (record.kind !== 'architecture_review_prompt') return false;
  const fields = { kind: one(record.kind), repository_id: text, capability_id: capability, shard: match(/^[1-9][0-9]{0,3}$/) };
  const fixed = { ...record, shard: String(record.shard) };
  return typeof record.shard === 'number' && (Object.hasOwn(record, 'base') || Object.hasOwn(record, 'head')
    ? object({ ...fields, base: commit, head: commit })(fixed) : object(fields)(fixed));
}
