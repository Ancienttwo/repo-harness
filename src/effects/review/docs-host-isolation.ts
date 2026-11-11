import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, posix } from 'node:path';

export const DOCS_HOST_PROJECTION_MANIFEST = 'docs/architecture/.projection-manifest.json';

export function assertDocsHostPlatform(platform: NodeJS.Platform = process.platform): void {
  if (platform !== 'darwin') throw new Error('platform_unsupported');
}

/**
 * The manifest path, generated projection targets, and every directory above
 * them inside docs/ (no rename or removal). The manifest path stays protected
 * when the file is absent, so a session cannot create one. A symlink on any
 * protected path would route a write to an open docs/ file, so it is refused.
 */
export function docsHostProtectedProjection(worktree: string): readonly string[] {
  const protectedPaths = new Set<string>(['docs']);
  const protect = (path: string) => {
    for (let entry = path; entry.startsWith('docs/'); entry = posix.dirname(entry)) {
      if (lstatSync(join(worktree, entry), { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`docs_host_projection_symlink_unsupported: ${entry}`);
      protectedPaths.add(entry);
    }
  };
  protect(DOCS_HOST_PROJECTION_MANIFEST);
  const manifestPath = join(worktree, DOCS_HOST_PROJECTION_MANIFEST);
  if (existsSync(manifestPath)) {
    let targets: unknown;
    try { targets = (JSON.parse(readFileSync(manifestPath, 'utf8')) as { targets?: unknown }).targets; }
    catch { throw new Error('docs_host_projection_manifest_invalid'); }
    if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw new Error('docs_host_projection_manifest_invalid');
    for (const target of Object.values(targets)) {
      const path = (target as { path?: unknown } | null)?.path;
      if (typeof path !== 'string' || path === '' || isAbsolute(path) || posix.normalize(path) !== path || path.startsWith('../') || /[\r\n\0"]/.test(path)) {
        throw new Error('docs_host_projection_manifest_invalid');
      }
      if (path.startsWith('docs/')) protect(path); else protectedPaths.add(path);
    }
  }
  return [...protectedPaths].sort().map(path => join(worktree, path));
}
