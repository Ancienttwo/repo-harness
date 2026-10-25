import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ARCHCONTEXT_NODE_RANGE } from 'archctx-contracts';

export type NodeSelection =
  | { readonly status: 'selected'; readonly path: string }
  | { readonly status: 'explicit-rejected'; readonly reason: 'not-absolute' | 'not-executable' | 'version' }
  | { readonly status: 'not-found' };

export interface NodeSelectionInput {
  /** `REPO_HARNESS_NODE_BIN` when the caller honors it. Omit to skip that tier. */
  readonly explicit?: string;
  /** Search PATH only when this is set. An empty string searches nothing. */
  readonly pathValue?: string;
  readonly pathExt?: string;
  readonly candidates: readonly string[] | (() => readonly string[]);
  /** Run `--version` under the caller's process authority. Return the version without a leading `v`, or null. */
  readonly versionOf: (executable: string) => string | null;
  readonly platform?: NodeJS.Platform;
}

function satisfies(version: string | null): boolean {
  return version !== null && Bun.semver.satisfies(version, ARCHCONTEXT_NODE_RANGE);
}

/**
 * One Node selection order: explicit pin, then PATH, then trusted candidates.
 * Callers still start the version process, because the protected helper and
 * the architecture provider do not share a process environment.
 */
export function selectCompatibleNode(input: NodeSelectionInput): NodeSelection {
  const platform = input.platform ?? process.platform;
  const explicit = input.explicit?.trim();
  if (explicit) {
    if (!isAbsolute(explicit)) return { status: 'explicit-rejected', reason: 'not-absolute' };
    const actual = realpathSync(explicit);
    const stat = statSync(actual);
    if (!stat.isFile() || (stat.mode & 0o111) === 0) return { status: 'explicit-rejected', reason: 'not-executable' };
    if (!satisfies(input.versionOf(actual))) return { status: 'explicit-rejected', reason: 'version' };
    return { status: 'selected', path: actual };
  }
  if (input.pathValue !== undefined) {
    const extensions = platform === 'win32'
      ? (input.pathExt ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : [''];
    for (const directory of input.pathValue.split(platform === 'win32' ? ';' : ':')) {
      if (!directory) continue;
      for (const extension of extensions) {
        const candidate = join(directory, `node${extension}`);
        if (!existsSync(candidate)) continue;
        if (!satisfies(input.versionOf(candidate))) continue;
        return { status: 'selected', path: realpathSync(candidate) };
      }
    }
  }
  const candidates = typeof input.candidates === 'function' ? input.candidates() : input.candidates;
  for (const candidate of candidates) {
    if (!isAbsolute(candidate) || !existsSync(candidate)) continue;
    const actual = realpathSync(candidate);
    const stat = statSync(actual);
    if (!stat.isFile() || (stat.mode & 0o111) === 0) continue;
    if (!satisfies(input.versionOf(actual))) continue;
    return { status: 'selected', path: actual };
  }
  return { status: 'not-found' };
}
