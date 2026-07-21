import {
  existsSync,
  realpathSync,
  readFileSync,
  statSync,
} from 'fs';
import { basename, dirname, join } from 'path';

/**
 * The typed counterpart of `assets/hooks/hook-input.sh`.
 *
 * Hook input is read once at the runtime boundary.  Callers then use the
 * typed accessors below rather than reparsing stdin for every field.  A
 * malformed payload is deliberately not coerced into a semantic value: the
 * accessor returns its caller supplied default and records the same warning
 * the shell helper exposed to stderr.
 */

export interface HookInputOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly repoRoot?: string;
}

export interface HookInput {
  readonly raw: string;
  readonly value: unknown;
  readonly valid: boolean;
  readonly warnings: readonly string[];
  get(path: string, fallback?: unknown): unknown;
  getString(path: string, fallback?: string): string;
  getPrompt(fallback?: string): string;
  getSessionId(fallback?: string): string;
  getRunId(fallback?: string): string;
  getFilePath(fallback?: string): string;
  getApplyPatchPaths(): readonly string[];
  getToolName(fallback?: string): string;
  getToolInput(): Record<string, unknown>;
}

interface HookInputFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  realpathSync(path: string): string;
  statSync(path: string): { isFile(): boolean; readonly mtimeMs?: number };
}

const defaultFs: HookInputFs = {
  existsSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
  realpathSync,
  statSync,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pathParts(path: string): readonly string[] {
  return path.split('.').filter(Boolean);
}

function valueAt(root: unknown, path: string): unknown {
  let current = root;
  for (const part of pathParts(path)) {
    const record = asRecord(current);
    if (!record || !(part in record)) return undefined;
    current = record[part];
  }
  return current;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeRepoRelativePath(repoRoot: string | undefined, raw: string): string {
  if (!raw || !raw.startsWith('/') || !repoRoot) return raw;
  if (raw === repoRoot || raw.startsWith(`${repoRoot}/`)) return raw.slice(repoRoot.length + 1);

  let rootReal = '';
  try {
    rootReal = realpathSync(repoRoot);
  } catch {
    rootReal = '';
  }
  if (rootReal && (raw === rootReal || raw.startsWith(`${rootReal}/`))) {
    return raw.slice(rootReal.length + 1);
  }

  // The host may report an absolute path under a symlinked temp directory,
  // and the file may not exist yet (PreToolUse). Resolve only the parent, as
  // the shell helper does, without guessing about paths outside this repo.
  try {
    const rawParent = dirname(raw);
    const canonical = `${realpathSync(rawParent)}/${basename(raw)}`;
    if (rootReal && (canonical === rootReal || canonical.startsWith(`${rootReal}/`))) {
      return canonical.slice(rootReal.length + 1);
    }
    if (canonical === repoRoot || canonical.startsWith(`${repoRoot}/`)) {
      return canonical.slice(repoRoot.length + 1);
    }
  } catch {
    // Keep the original absolute path when the parent cannot be resolved.
  }
  return raw;
}

function applyPatchPaths(repoRoot: string | undefined, command: string): readonly string[] {
  const paths: string[] = [];
  for (const line of command.split('\n')) {
    const file = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line)?.[1]
      ?? /^\*\*\* Move to: (.+)$/.exec(line)?.[1];
    if (file) paths.push(normalizeRepoRelativePath(repoRoot, file));
  }
  return Object.freeze(paths);
}

function firstNonEmpty(values: readonly string[]): string {
  return values.find((value) => value.length > 0) ?? '';
}

export function parseHookInput(
  input: string | Buffer | undefined,
  options: HookInputOptions = {},
): HookInput {
  const env = options.env ?? process.env;
  const raw = input === undefined ? '' : input.toString();
  const trimmed = raw.trim();
  let value: unknown = {};
  let valid = true;
  if (trimmed) {
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      value = {};
      valid = false;
    }
  }

  const warnings: string[] = [];
  const warned = new Set<string>();
  const warnIfMalformed = (path: string): void => {
    if (valid || !trimmed || warned.has(path)) return;
    warned.add(path);
    warnings.push(`[HookInput] WARN: stdin is not valid JSON while requesting path: ${path} (typed parser could not parse it)`);
  };
  const get = (path: string, fallback?: unknown): unknown => {
    const found = valueAt(value, path);
    if (found === undefined || found === null) {
      warnIfMalformed(path);
      return fallback;
    }
    return found;
  };
  const getString = (path: string, fallback = ''): string => stringValue(get(path, fallback)) || fallback;
  const getPrompt = (fallback = ''): string => {
    const fromEnv = env.PROMPT;
    if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
    return firstNonEmpty([
      getString('.prompt'),
      getString('.user_message'),
      fallback,
    ]);
  };
  const getSessionId = (fallback = ''): string => firstNonEmpty([
    env.HOOK_SESSION_ID ?? '',
    getString('.session_id'),
    env.CLAUDE_SESSION_ID ?? '',
    env.CODEX_SESSION_ID ?? '',
    env.SESSION_KEY ?? '',
    fallback,
  ]);
  const getRunId = (fallback = ''): string => firstNonEmpty([
    env.HOOK_RUN_ID ?? '',
    getString('.run_id'),
    getString('.tool_input.run_id'),
    fallback,
  ]);
  const getFilePath = (fallback = ''): string => normalizeRepoRelativePath(
    options.repoRoot,
    firstNonEmpty([
      getString('.file_path'),
      getString('.tool_input.file_path'),
      getString('.trigger_file_path'),
      getString('.parent_file_path'),
      env.CLAUDE_FILE_PATH ?? '',
      fallback,
    ]),
  );
  const getToolInput = (): Record<string, unknown> => asRecord(get('.tool_input', {})) ?? {};

  return {
    raw,
    value,
    valid,
    get warnings() {
      return Object.freeze([...warnings]);
    },
    get,
    getString,
    getPrompt,
    getSessionId,
    getRunId,
    getFilePath,
    getApplyPatchPaths: () => applyPatchPaths(options.repoRoot, getString('.tool_input.command')),
    getToolName: (fallback = '') => firstNonEmpty([
      getString('.tool_name'),
      getString('.hook_event_name'),
      env.HOOK_TOOL_NAME ?? '',
      fallback,
    ]),
    getToolInput,
  };
}

/** Small file helpers shared by typed hook handlers and their fixtures. */
export function readHookText(repoRoot: string, relativePath: string, fsApi: HookInputFs = defaultFs): string | null {
  const target = join(repoRoot, relativePath);
  if (!fsApi.existsSync(target)) return null;
  try {
    if (!fsApi.statSync(target).isFile()) return null;
    return fsApi.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

export type { HookInputFs };
