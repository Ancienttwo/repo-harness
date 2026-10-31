/**
 * Generated-artifact regeneration (repo-harness issue #1257).
 *
 * A repository policy may declare generated path globs, exactly one
 * regeneration command and a timeout. Readiness builds the merge tree of the
 * base and the PR head, resolves conflicts that fall on declared generated
 * paths, runs the command in a network-denied sandbox and requires the
 * regeneration to be a fixed point inside the declared paths.
 *
 * A mixed file (generated fields plus human-authored fields) needs an explicit
 * `mixed` rule with JSON-pointer paths that are preserved from the PR head.
 * The executor never guesses which side to take: without a rule it fails closed
 * when the PR version changes the regenerated result.
 *
 * The publication policy file itself can never be a declared generated path, so
 * regeneration cannot raise a declared budget. A budget raise stays an explicit
 * policy edit in the PR.
 *
 * This module owns the closed policy block, the merge-tree conflict rules, the
 * JSON-pointer resolution and the check result shape. It performs no I/O.
 */

import { PUBLICATION_POLICY_PATH } from './policy-path';
import { protectedPathMatches } from './required-check-coverage';

export const GENERATED_ARTIFACTS_MAX_TIMEOUT_MS = 600_000;

/** One policy-declared mixed file: these JSON pointers are human-authored and come from the PR head. */
export interface GeneratedArtifactsMixedRuleV1 {
  readonly path: string;
  readonly preserve_from_pr: readonly string[];
}

export interface GeneratedArtifactsPolicyV1 {
  /** Generated path globs. Every path the command changes must match one of them. */
  readonly paths: readonly string[];
  /** Exactly one shell command that rewrites the generated files. */
  readonly command: string;
  readonly timeout_ms: number;
  readonly mixed: readonly GeneratedArtifactsMixedRuleV1[];
}

export type GeneratedArtifactsPolicyAtRef =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'active'; readonly policy: GeneratedArtifactsPolicyV1 };

export const GENERATED_ARTIFACTS_FAILURE_CODES = [
  'generated_artifacts_policy_invalid',
  'generated_artifacts_conflict_outside',
  'generated_artifacts_mixed_without_rule',
  'generated_artifacts_command_failed',
  'generated_artifacts_timeout',
  'generated_artifacts_network_attempt',
  'generated_artifacts_diff_outside',
  'generated_artifacts_unstable',
  'generated_artifacts_unavailable',
] as const;

export type GeneratedArtifactsFailureCode = typeof GENERATED_ARTIFACTS_FAILURE_CODES[number];

/** The named cause and the exact path/diff a failed regeneration check observed. */
export interface GeneratedArtifactsFailureV1 {
  readonly code: GeneratedArtifactsFailureCode;
  readonly message: string;
}

/**
 * The observed regeneration on the merge tree. `merge_tree_sha` is null when
 * the tree could not be built. The path lists are sorted and unique.
 */
export interface GeneratedArtifactsCheckV1 {
  readonly head_sha: string;
  readonly base_sha: string;
  readonly merge_tree_sha: string | null;
  readonly generated_paths: readonly string[];
  readonly conflicted_paths: readonly string[];
  readonly resolved_paths: readonly string[];
  readonly regenerated_paths: readonly string[];
  readonly failure: GeneratedArtifactsFailureV1 | null;
}

export type GeneratedArtifactsFactsV1 =
  | { readonly status: 'absent' }
  | { readonly status: 'invalid'; readonly message: string }
  | {
    readonly status: 'active';
    readonly policy: GeneratedArtifactsPolicyV1;
    readonly check: GeneratedArtifactsCheckV1;
  };

export type GeneratedArtifactsParseResult =
  | { readonly ok: true; readonly policy: GeneratedArtifactsPolicyV1 | null }
  | { readonly ok: false; readonly message: string };

export type GeneratedArtifactsResolveResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function repoRelativePath(value: string): boolean {
  return value.length > 0 && !value.startsWith('/') && !value.includes('\\')
    && !value.includes('\0') && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function glob(value: unknown, label: string): string {
  if (typeof value !== 'string' || !repoRelativePath(value)) fail(`${label} must be a repository-relative glob`);
  return value;
}

function pointer(value: unknown, label: string): string {
  if (typeof value !== 'string' || parseJsonPointer(value) === null) fail(`${label} must be a JSON pointer`);
  return value;
}

/**
 * RFC 6901 pointer segments. The empty pointer addresses the whole document.
 * `~0` and `~1` are the only escapes; a stray `~` is invalid.
 */
export function parseJsonPointer(value: string): string[] | null {
  if (value === '') return [];
  if (!value.startsWith('/')) return null;
  const segments: string[] = [];
  for (const raw of value.slice(1).split('/')) {
    if (/~(?![01])/u.test(raw)) return null;
    segments.push(raw.replace(/~1/gu, '/').replace(/~0/gu, '~'));
  }
  return segments;
}

function arrayIndex(segment: string, length: number): number | null {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(segment)) return null;
  const index = Number(segment);
  return Number.isSafeInteger(index) && index >= 0 && index <= length ? index : null;
}

function resolveJsonPointer(root: unknown, segments: readonly string[]): { readonly found: boolean; readonly value?: unknown } {
  let cursor = root;
  for (const segment of segments) {
    if (Array.isArray(cursor)) {
      const index = arrayIndex(segment, cursor.length - 1);
      if (index === null || index >= cursor.length) return { found: false };
      cursor = cursor[index];
    } else if (isRecord(cursor)) {
      if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return { found: false };
      cursor = cursor[segment];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: cursor };
}

/** Set one pointer in a parsed document. The parent must already exist in the base version. */
function setJsonPointer(root: unknown, segments: readonly string[], value: unknown): boolean {
  if (segments.length === 0) return false;
  let cursor = root;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const index = arrayIndex(segment, cursor.length - 1);
      if (index === null || index >= cursor.length) return false;
      cursor = cursor[index];
    } else if (isRecord(cursor)) {
      if (!Object.prototype.hasOwnProperty.call(cursor, segment)) return false;
      cursor = cursor[segment];
    } else {
      return false;
    }
  }
  const leaf = segments[segments.length - 1]!;
  if (Array.isArray(cursor)) {
    const index = arrayIndex(leaf, cursor.length);
    if (index === null) return false;
    if (index === cursor.length) cursor.push(value);
    else cursor[index] = value;
    return true;
  }
  if (!isRecord(cursor)) return false;
  cursor[leaf] = value;
  return true;
}

function copyJson(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Resolve one mixed-file conflict: start from the base version (all generated
 * fields), then copy the declared human-authored pointers from the PR head.
 * A pointer must exist in the PR head and its parent must exist in the base
 * version; otherwise the declared rule does not apply and the check fails
 * closed instead of taking one side.
 */
export function resolveMixedFileConflict(input: {
  readonly path: string;
  readonly base_text: string;
  readonly head_text: string;
  readonly preserve_from_pr: readonly string[];
}): GeneratedArtifactsResolveResult {
  let base: unknown;
  let head: unknown;
  try {
    base = JSON.parse(input.base_text);
  } catch {
    return { ok: false, message: `the base version of "${input.path}" is not valid JSON` };
  }
  try {
    head = JSON.parse(input.head_text);
  } catch {
    return { ok: false, message: `the PR version of "${input.path}" is not valid JSON` };
  }
  const resolved = copyJson(base);
  for (const pointerValue of input.preserve_from_pr) {
    const segments = parseJsonPointer(pointerValue)!;
    const observed = resolveJsonPointer(head, segments);
    if (!observed.found) {
      return { ok: false, message: `preserve_from_pr pointer "${pointerValue}" is absent in the PR version of "${input.path}"` };
    }
    if (!setJsonPointer(resolved, segments, copyJson(observed.value))) {
      return { ok: false, message: `preserve_from_pr pointer "${pointerValue}" does not resolve in the base version of "${input.path}"` };
    }
  }
  return { ok: true, text: `${JSON.stringify(resolved, null, 2)}\n` };
}

function mixedRule(value: unknown, index: number): GeneratedArtifactsMixedRuleV1 {
  if (!isRecord(value)) fail(`mixed[${index}] must be an object`);
  const unknown = Object.keys(value).filter((key) => key !== 'path' && key !== 'preserve_from_pr');
  if (unknown.length > 0) fail(`mixed[${index}] has unknown fields: ${unknown.sort().join(', ')}`);
  const path = glob(value.path, `mixed[${index}].path`);
  const preserve = value.preserve_from_pr;
  if (!Array.isArray(preserve) || preserve.length === 0) fail(`mixed[${index}].preserve_from_pr must be a non-empty array`);
  const pointers = preserve.map((entry, entryIndex) => pointer(entry, `mixed[${index}].preserve_from_pr[${entryIndex}]`));
  if (new Set(pointers).size !== pointers.length) fail(`mixed[${index}].preserve_from_pr must not repeat a value`);
  return Object.freeze({ path, preserve_from_pr: Object.freeze(pointers) });
}

/**
 * The closed `publication.generated_artifacts` block. An absent or empty block
 * keeps the pre-#1257 behavior; any other shape fails closed.
 */
export function parseGeneratedArtifactsBlock(value: unknown): GeneratedArtifactsParseResult {
  if (!isRecord(value)) return { ok: false, message: 'the block must be an object' };
  const unknown = Object.keys(value).filter((key) => !['paths', 'command', 'timeout_ms', 'mixed'].includes(key));
  if (unknown.length > 0) return { ok: false, message: `the block has unknown fields: ${unknown.sort().join(', ')}` };
  const paths: string[] = [];
  const mixed: GeneratedArtifactsMixedRuleV1[] = [];
  try {
    if (value.paths !== undefined) {
      if (!Array.isArray(value.paths)) fail('paths must be an array');
      paths.push(...value.paths.map((entry, index) => glob(entry, `paths[${index}]`)));
      if (new Set(paths).size !== paths.length) fail('paths must not repeat a value');
    }
    if (value.mixed !== undefined) {
      if (!Array.isArray(value.mixed)) fail('mixed must be an array');
      mixed.push(...value.mixed.map((entry, index) => mixedRule(entry, index)));
      if (new Set(mixed.map((entry) => entry.path)).size !== mixed.length) fail('mixed must not repeat a path');
    }
    for (const rule of mixed) {
      if (!paths.some((pattern) => protectedPathMatches(pattern, rule.path))) {
        fail(`mixed path "${rule.path}" does not match a declared generated path glob`);
      }
    }
    if (paths.some((pattern) => protectedPathMatches(pattern, PUBLICATION_POLICY_PATH))) {
      fail(`paths must not match ${PUBLICATION_POLICY_PATH}; regeneration must never raise a declared budget`);
    }
    if (value.command === undefined) {
      if (paths.length > 0) fail('command is required when paths is not empty');
      if (value.timeout_ms !== undefined) fail('command is required when timeout_ms is declared');
    } else {
      if (typeof value.command !== 'string' || value.command.trim() === ''
        || value.command.includes('\0') || /[\r\n]/u.test(value.command)) {
        fail('command must be one non-empty line');
      }
      if (paths.length === 0) fail('paths must not be empty when command is declared');
      if (value.timeout_ms === undefined) fail('timeout_ms is required when command is declared');
      if (!Number.isSafeInteger(value.timeout_ms) || Number(value.timeout_ms) < 1
        || Number(value.timeout_ms) > GENERATED_ARTIFACTS_MAX_TIMEOUT_MS) {
        fail(`timeout_ms must be an integer between 1 and ${GENERATED_ARTIFACTS_MAX_TIMEOUT_MS}`);
      }
    }
    if (mixed.length > 0 && paths.length === 0) fail('paths must not be empty when mixed rules are declared');
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
  if (paths.length === 0) return { ok: true, policy: null };
  return {
    ok: true,
    policy: Object.freeze({
      paths: Object.freeze(paths),
      command: value.command as string,
      timeout_ms: Number(value.timeout_ms),
      mixed: Object.freeze(mixed),
    }),
  };
}

/** The mixed rule for one concrete path, or null when the file is declared fully generated. */
export function mixedRuleFor(policy: GeneratedArtifactsPolicyV1, path: string): GeneratedArtifactsMixedRuleV1 | null {
  return policy.mixed.find((rule) => rule.path === path) ?? null;
}

export function isGeneratedPath(policy: GeneratedArtifactsPolicyV1, path: string): boolean {
  return policy.paths.some((pattern) => protectedPathMatches(pattern, path));
}
