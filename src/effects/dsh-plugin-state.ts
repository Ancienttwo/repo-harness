import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const PACKAGE_NAME = 'repo-harness';

/**
 * DSH owns its plugin installation, so repo-harness only reads it. `absent`
 * is the definite "DSH is not installed" read (no profiles directory);
 * `undeclared` means no profile names the repo-harness bundle. Any other read
 * error throws, so a caller that selects or probes the `dsh` plugin fails closed.
 */
export type DshPluginState =
  | { readonly status: 'absent'; readonly profilesDir: string }
  | { readonly status: 'undeclared'; readonly profilesDir: string; readonly profiles: readonly string[] }
  | { readonly status: 'declared'; readonly profilesDir: string; readonly profiles: readonly string[] };

export function dshProfilesDir(env: NodeJS.ProcessEnv = process.env): string {
  const configuredHome = env.DSH_HOME?.trim();
  return join(configuredHome ? resolve(configuredHome) : join(env.HOME ?? env.USERPROFILE ?? homedir(), '.dsh'), 'profiles');
}

function readOptional(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export function readDshPluginState(env: NodeJS.ProcessEnv = process.env): DshPluginState {
  const profilesDir = dshProfilesDir(env);
  let entries;
  try {
    entries = readdirSync(profilesDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'absent', profilesDir };
    throw new Error(`cannot read DSH profiles at ${profilesDir}: ${(error as Error).message}`);
  }
  const profiles = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const declared: string[] = [];
  for (const profile of profiles) {
    const dir = join(profilesDir, profile);
    const manifestText = readOptional(join(dir, 'package.json'));
    const manifest = (manifestText === null ? {} : JSON.parse(manifestText)) as {
      dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown>; dsh?: { profile?: { bundles?: unknown } };
    };
    const dependencies = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
    const bundles = Array.isArray(manifest.dsh?.profile?.bundles) ? manifest.dsh.profile.bundles : [];
    const patch = readOptional(join(dir, 'cordis.patch.yml')) ?? '';
    if (PACKAGE_NAME in dependencies || bundles.includes(PACKAGE_NAME) || patch.includes(PACKAGE_NAME)) declared.push(profile);
  }
  return declared.length > 0
    ? { status: 'declared', profilesDir, profiles: declared }
    : { status: 'undeclared', profilesDir, profiles };
}
