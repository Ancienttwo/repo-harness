import type { ModuleIndexV1, ModuleDetailV1 } from '../architecture/module-view';
import type { ModuleReviewPromptV1 } from '../review/module-review-prompt';

export const ARCHITECTURE_CAPABILITY_ID = /^capability\.[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const ARCHITECTURE_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const OPERATOR_ARCHITECTURE_MODULES_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/architecture\/modules$/u;
export const OPERATOR_ARCHITECTURE_MODULE_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/architecture\/modules\/(capability\.[a-z0-9-]+(?:\.[a-z0-9-]+)+)$/u;
export const OPERATOR_ARCHITECTURE_REVIEW_PROMPT_ROUTE = /^\/api\/v1\/repositories\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\/architecture\/modules\/(capability\.[a-z0-9-]+(?:\.[a-z0-9-]+)+)\/review-prompt$/u;

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
const path = match(/^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[^\\\x00-\x1f\x7f]+$/);
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
  repository_id: text, capability_id: capability, commit, mode: one('module', 'diff'), base: nullable(commit), head: nullable(commit),
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
