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
