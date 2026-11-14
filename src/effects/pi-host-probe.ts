import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { piVersionSupported, type PiCapability, type PiHostUnavailableCode } from '../pi/compat';

export interface InstalledPi { version: string; state: PiCapability['state']; code?: PiHostUnavailableCode }

/** The package root of the PATH installation's own SDK. */
function piPackageRoot(executable: string): string {
  let root = dirname(realpathSync(executable));
  while (true) {
    const manifest = join(root, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === '@earendil-works/pi-coding-agent') return root;
    const parent = dirname(root);
    if (parent === root) throw new Error('Pi package root unavailable');
    root = parent;
  }
}

/** Run one Bun child that loads the PATH installation's SDK. Throws when the child cannot run. */
function runPiChild<T>(name: string, args: readonly string[], env: NodeJS.ProcessEnv): T {
  if (!process.versions.bun) throw new Error('PI_CAPABILITY_PROBE_REQUIRES_BUN');
  const child = fileURLToPath(new URL(name, import.meta.url));
  const result = spawnSync(process.execPath, [child, ...args],
    { cwd: env.HOME, env, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || 'Pi SDK probe failed');
  return JSON.parse(result.stdout) as T;
}

/** Load the PATH installation's own SDK metadata in a Bun child. Throws when the probe cannot run. */
export function probeInstalledPi(executable: string, env: NodeJS.ProcessEnv): InstalledPi {
  return runPiChild<InstalledPi>('./pi-capability-child.ts', [piPackageRoot(executable)], env);
}

export interface PiModelIdentity { readonly provider: string; readonly model: string }

/**
 * The provider and model that the PATH pi selects for `--model <reference>`
 * in the review agent directory, from pi's own resolver. The child runs
 * offline with an empty credential store.
 */
export function resolvePiModel(executable: string, agentDirectory: string, reference: string, env: NodeJS.ProcessEnv = process.env): PiModelIdentity {
  let result: { provider?: unknown; model?: unknown; error?: unknown };
  try {
    result = runPiChild('./pi-model-child.ts', [piPackageRoot(executable), agentDirectory, reference],
      { ...env, PI_CODING_AGENT_DIR: agentDirectory, PI_OFFLINE: '1' });
  } catch (error) { throw new Error(`review_pi_model_unresolved: ${(error as Error).message}`); }
  if (typeof result.provider !== 'string' || typeof result.model !== 'string') {
    throw new Error(`review_pi_model_unresolved: ${typeof result.error === 'string' ? result.error : 'no model'}`);
  }
  return { provider: result.provider, model: result.model };
}

/** Pi-only review launch gate. Returns a fixed blocking code, or null when the PATH Pi meets MIN_PI_VERSION. */
export function piReviewLaunchBlocker(executable: string, env: NodeJS.ProcessEnv = process.env): 'PI_HOST_UNSUPPORTED_VERSION' | 'PI_HOST_PROBE_FAILED' | null {
  let version: string;
  try { version = probeInstalledPi(executable, env).version; } catch { return 'PI_HOST_PROBE_FAILED'; }
  return piVersionSupported(version) ? null : 'PI_HOST_UNSUPPORTED_VERSION';
}
