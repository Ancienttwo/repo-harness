import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Single authority for the trusted Node runtime candidate scan.
 *
 * Both the protected helper runner (`src/cli/runtime/helper-runner.ts`) and the
 * architecture projection provider (`src/effects/architecture/archctx-provider.ts`)
 * need the same list of locations where a compatible Node runtime may live when
 * `PATH` cannot be trusted or carries no compatible runtime. The scan is a pure
 * filesystem enumeration; version filtering stays with each caller because they
 * execute candidates under different process authorities.
 */
function childDirectories(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => join(root, entry.name))
    .sort();
}

export function trustedNodeCandidates(home: string): string[] {
  const nvmVersions = join(home, '.nvm', 'versions', 'node');
  const candidates = [
    '/usr/bin/node',
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    // A user-curated pin (commonly a symlink to a specific major) outranks the
    // nvm sweep: it is one explicit choice, not an enumeration of installs.
    join(home, '.local', 'bin', 'node'),
    ...childDirectories(nvmVersions).map((versionRoot) => join(versionRoot, 'bin', 'node')),
  ];
  const toolcacheRoots = process.platform === 'win32'
    ? ['C:\\hostedtoolcache\\windows\\node']
    : ['/opt/hostedtoolcache/node', '/Users/runner/hostedtoolcache/node', '/Users/runner/work/_tool/node'];
  for (const root of toolcacheRoots) {
    for (const versionRoot of childDirectories(root)) {
      for (const architectureRoot of childDirectories(versionRoot)) {
        candidates.push(
          process.platform === 'win32'
            ? join(architectureRoot, 'node.exe')
            : join(architectureRoot, 'bin', 'node'),
        );
      }
    }
  }
  return [...new Set(candidates)];
}
