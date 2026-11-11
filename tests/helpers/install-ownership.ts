import { createHash } from 'crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, isAbsolute, join, relative, resolve } from 'path';
import { versions } from '../../src/cli/installer/install-profile';
import { installProfileStatePath } from '../../src/cli/installer/install-state';
import { bunGlobalPackageRoot } from '../../src/cli/installer/skill-projection';
import type { PluginId, PluginSelection } from '../../src/core/skill-surface/plugin-manifest';

/**
 * Install state resolves to `homedir()` without HOME; a fixture write must never reach the real one.
 * Bun's `homedir()` and `userInfo().homedir` both follow $HOME, so neither names the real home from a process
 * that already runs under a temp HOME. The guard accepts only a HOME strictly inside the temp directory, which
 * need not exist yet: callers let the fixture create it. The temp root may be a symlink (macOS /var), so both forms count.
 * macOS fixtures that hardcode /tmp sit outside tmpdir(), so POSIX also accepts a HOME strictly inside /tmp or its macOS target /private/tmp.
 */
export function installStateFixturePath(env: NodeJS.ProcessEnv): string {
  const home = env.HOME ? resolve(env.HOME) : undefined;
  const inside = (root: string) => {
    const path = home && relative(root, home);
    return !!path && !path.startsWith('..') && !isAbsolute(path);
  };
  if (!inside(tmpdir()) && !inside(realpathSync(tmpdir())) && !(process.platform !== 'win32' && (inside('/tmp') || inside('/private/tmp')))) {
    throw new Error('Install-state fixtures need an env.HOME strictly inside the temp directory');
  }
  return installProfileStatePath(env);
}

/** Opt in to an installed runtime; callers own the temporary HOME and package mutations. */
export function seedGlobalPackageFixture(env: NodeJS.ProcessEnv = process.env, options: { sourceRoot?: string; mutable?: true } = {}): string {
  env.BUN_INSTALL ??= join(env.HOME!, '.bun');
  const root = bunGlobalPackageRoot(env)!;
  const source = options.sourceRoot ?? join(import.meta.dir, '../..');
  if (options.mutable) {
    mkdirSync(join(root, 'dist'), { recursive: true });
    copyFileSync(join(source, 'dist/hook-entry.js'), join(root, 'dist/hook-entry.js'));
  } else if (!existsSync(root)) {
    mkdirSync(dirname(root), { recursive: true });
    symlinkSync(source, root, 'dir');
  } else if (realpathSync(root) !== realpathSync(source)) {
    throw new Error(`Global package fixture already belongs to another source: ${root}`);
  }
  return root;
}

/**
 * Run `fn` under a temporary HOME with the global package fixture seeded. The directory is
 * `<tmpdir>/<prefix>-<random>`; HOME and BUN_INSTALL are restored and the directory removed after `fn`.
 */
export function withTempHome(prefix: string, fn: (home: string) => void): void {
  const home = realpathSync(mkdtempSync(join(tmpdir(), `${prefix}-`)));
  const previousHome = process.env.HOME;
  const previousBunInstall = process.env.BUN_INSTALL;
  process.env.HOME = home;
  process.env.BUN_INSTALL = join(home, '.bun');
  seedGlobalPackageFixture();
  try {
    fn(home);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousBunInstall === undefined) delete process.env.BUN_INSTALL;
    else process.env.BUN_INSTALL = previousBunInstall;
    rmSync(home, { recursive: true, force: true });
  }
}

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
  const statePath = installStateFixturePath(env);
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ protocol: 3, ...versions(['architecture', 'cross-review', 'mcp', 'operator', 'peer-runtime', 'platform', 'product', 'strategy-memory']), selection: 'all',
    transaction_id: 'owned-upgrade-fixture', applied_at: new Date().toISOString(), ownership_manifest, previous: null }));
}

/**
 * Record an install selection without managed surfaces, as `repo-harness install --plugins <plugins>` leaves it.
 * `selection: 'all'` with a subset is an `all` state recorded before the other plugin ids existed.
 */
export function recordPluginSelection(env: NodeJS.ProcessEnv, plugins: readonly PluginId[] = ['architecture'], selection: PluginSelection = [...plugins]): void {
  const statePath = installStateFixturePath(env);
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ protocol: 3, ...versions(plugins), selection,
    transaction_id: 'plugin-selection-fixture', applied_at: new Date().toISOString(), ownership_manifest: [], previous: null }));
}

/**
 * A child environment whose own HOME records the selection. `test:files` runs
 * several files under one HOME, so a file never writes the selection there.
 */
export function pluginSelectionEnv(plugins: readonly PluginId[] = ['architecture'], base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'repo-harness-selection-home-')));
  const gitConfig = join(base.HOME ?? '', '.gitconfig');
  if (base.HOME && existsSync(gitConfig)) copyFileSync(gitConfig, join(home, '.gitconfig'));
  const env = { ...base, HOME: home };
  recordPluginSelection(env, plugins);
  return env;
}
