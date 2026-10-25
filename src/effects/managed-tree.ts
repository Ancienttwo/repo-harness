import { createHash } from 'crypto';
import { readdirSync, readFileSync, readlinkSync } from 'fs';
import { join } from 'path';

export const OWNER_MARKER = '.repo-harness-owner.json';


export interface ManagedTreeOptions {
  readonly excludes?: readonly string[];
  readonly includes?: readonly string[];
}

/** The contract owns the source projection. Target ownership hashes stay complete. */
export function installedCopyTreeOptions(
  surface: 'canonical-skill' | 'command-facade',
  contract: { readonly installedCopyExcludes?: unknown; readonly installedCopyIncludes?: unknown },
): ManagedTreeOptions {
  const excludes = contract.installedCopyExcludes;
  if (!Array.isArray(excludes) || !excludes.every((value) => typeof value === 'string' && !value.includes('\n'))) {
    throw new Error('installed copy exclusions are missing or invalid');
  }
  if (surface === 'command-facade') return { excludes };
  const includes = contract.installedCopyIncludes;
  if (!Array.isArray(includes) || includes.length === 0 || !includes.every((value) =>
    typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes('\n')
    && value.replace(/\/$/, '').split('/').every((part: string) => part !== '' && part !== '.' && part !== '..'))) {
    throw new Error('installed copy includes are missing or invalid');
  }
  return { excludes, includes };
}

/** Both source hashes and rsync consume these exact files and links. */
export function managedTreeEntries(root: string, options: ManagedTreeOptions = {}): Array<{ path: string; type: 'file' | 'symlink' }> {
  const patterns = (options.excludes ?? []).map((pattern) => ({
    directory: pattern.endsWith('/'),
    basename: !pattern.replace(/\/$/, '').includes('/'),
    glob: new Bun.Glob(`${pattern.replace(/\/$/, '').includes('/') ? '**/' : ''}${pattern.replace(/\/$/, '')}`),
  }));
  const entries: Array<{ path: string; type: 'file' | 'symlink' }> = [];
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === OWNER_MARKER) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (patterns.some((pattern) => (!pattern.directory || entry.isDirectory())
        && pattern.glob.match(pattern.basename ? entry.name : relative))
        // A declared runtime descendant keeps its excluded parent traversable.
        && !(entry.isDirectory() && options.includes?.some((include) => include.startsWith(`${relative}/`)))) continue;
      if (options.includes && !options.includes.some((include) => include.endsWith('/')
        ? relative.startsWith(include) || `${relative}/` === include || include.startsWith(`${relative}/`)
        : relative === include || include.startsWith(`${relative}/`))) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) entries.push({ path: relative, type: 'file' });
      else if (entry.isSymbolicLink()) entries.push({ path: relative, type: 'symlink' });
      else if (options.excludes !== undefined) throw new Error(`unsupported installed-copy source entry: ${relative}`);
    }
  };
  visit(root, '');
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return entries;
}

/** Hash one selected tree. No filters means the complete ownership proof. */
export function hashManagedTree(root: string, options: ManagedTreeOptions = {}): string {
  const entries = managedTreeEntries(root, options);
  const hash = createHash('sha256');
  for (const entry of entries) {
    const absolute = join(root, entry.path);
    if (entry.type === 'symlink') {
      hash.update(`L\0${entry.path}\0${readlinkSync(absolute)}\0`);
    } else {
      hash.update(`F\0${entry.path}\0`);
      hash.update(readFileSync(absolute));
      hash.update('\0');
    }
  }
  return `sha256:${hash.digest('hex')}`;
}
