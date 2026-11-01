import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { piVersionSupported, type PiCapability, type PiHostUnavailableCode } from '../../pi/compat';
import { probePiHerdrIntegration } from './pi-herdr-integration';

export interface InstalledPi { version: string; state: PiCapability['state']; code?: PiHostUnavailableCode }

/** Load the PATH installation's own SDK metadata in a Bun child. Throws when the probe cannot run. */
export function probeInstalledPi(executable: string, env: NodeJS.ProcessEnv): InstalledPi {
  if (!process.versions.bun) throw new Error('PI_CAPABILITY_PROBE_REQUIRES_BUN');
  let root = dirname(realpathSync(executable));
  while (true) {
    const manifest = join(root, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === '@earendil-works/pi-coding-agent') break;
    const parent = dirname(root);
    if (parent === root) throw new Error('Pi package root unavailable');
    root = parent;
  }
  const child = fileURLToPath(new URL('./pi-capability-child.ts', import.meta.url));
  const result = spawnSync(process.execPath, [child, root],
    { cwd: env.HOME, env, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr.trim() || 'Pi SDK probe failed');
  return JSON.parse(result.stdout) as InstalledPi;
}

/** Pi-only gate for a new Herdr pane launch. Returns the fixed blocking code, or null when ready. */
export function piHerdrLaunchBlocker(executable: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!piVersionSupported(probeInstalledPi(executable, env).version)) return 'PI_HOST_UNSUPPORTED_VERSION';
  const integration = probePiHerdrIntegration(env);
  return integration.state === 'current' ? null : integration.code;
}
