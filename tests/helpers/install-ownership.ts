import { createHash } from 'crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { installProfileStatePath, versions } from '../../src/cli/installer/install-profile';

/** Seed the persisted protocol, independently of unrelated owner probes. */
export function recordInstallOwnership(paths: string[], env: NodeJS.ProcessEnv): void {
  const ownership_manifest = paths.map(path => {
    const directory = lstatSync(path).isDirectory();
    const hash = createHash('sha256');
    if (directory) {
      const files: string[] = [];
      const visit = (root: string) => {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (entry.isDirectory()) visit(join(root, entry.name));
          else files.push(relative(path, join(root, entry.name)));
        }
      };
      visit(path);
      for (const file of files.sort()) {
        hash.update(`F\0${file}\0`);
        hash.update(readFileSync(join(path, file)));
        hash.update('\0');
      }
    } else hash.update(readFileSync(path));
    return {
      owner: directory ? 'cross-review' : 'core', path,
      authority: 'repo-harness-install-transaction', removal: 'managed-surfaces-only',
      type: directory ? 'directory-copy' : 'managed-file',
      managed_marker: directory ? 'transaction-created-directory' : 'transaction-created-file',
      content_hash: `sha256:${hash.digest('hex')}`, symlink_target: null,
    };
  });
  const statePath = installProfileStatePath(env);
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ protocol: 3, ...versions(['architecture', 'cross-review', 'peer-runtime', 'platform', 'product', 'strategy-memory']), selection: 'all',
    transaction_id: 'owned-upgrade-fixture', applied_at: new Date().toISOString(), ownership_manifest, previous: null }));
}
