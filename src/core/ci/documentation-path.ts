export function isDocumentationPath(path: string): boolean {
  if (path.split('/').some(part => !part || part === '.' || part === '..')) return false;
  if (path.startsWith('docs/reference-configs/')) return false;
  // Generated projection outputs are documentation.
  return path === 'README.md'
    || path === 'docs/architecture/.projection-manifest.json'
    || (path.startsWith('docs/architecture/diagrams/') && path.endsWith('.mmd')) || path === 'DEBUG.md'
    || (path.startsWith('examples/') && path.endsWith('.md'))
    || path === 'tasks/lessons.md'
    || (path.startsWith('docs/') && path.endsWith('.md'));
}
/** A diff of documentation paths only selects just the tests that name a changed document. */
export function documentationOnly(paths: readonly string[]): boolean {
  return paths.length > 0 && paths.every(isDocumentationPath);
}

const PROJECTION_MANIFEST = 'docs/architecture/.projection-manifest.json';
const PROJECTION_DIRECTORY = 'docs/architecture/';

/**
 * Generated projection outputs: the manifest and each target path it lists. The manifest is the
 * one source. A target outside docs/architecture/ never counts. Invalid manifest text throws.
 */
export function projectionOutputs(manifestText: string): Set<string> {
  const targets = (JSON.parse(manifestText) as { targets?: Record<string, { path?: unknown }> } | null)?.targets;
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) throw new Error(`${PROJECTION_MANIFEST} has no targets object`);
  const outputs = new Set([PROJECTION_MANIFEST]);
  for (const target of Object.values(targets)) {
    if (typeof target?.path !== 'string') throw new Error(`${PROJECTION_MANIFEST} has a target without a path`);
    if (target.path.startsWith(PROJECTION_DIRECTORY) && target.path.split('/').every(part => part && part !== '.' && part !== '..')) outputs.add(target.path);
  }
  return outputs;
}

export { PROJECTION_DIRECTORY, PROJECTION_MANIFEST };
