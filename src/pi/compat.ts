/**
 * Pi host version policy (#1099). The Pi extension, setup check and docs read
 * this one constant. There is no upper bound: a newer Pi is accepted when the
 * runtime capability probe passes.
 *
 * 1.4.0 is the floor because OAR 0.80.1 requires
 * `@earendil-works/pi-coding-agent ^1.4.0`, and Pi 1.4.0 has every event the
 * extension maps (`tool_call` with `parentToolCallId`, `before_agent_start`
 * messages, `agent_settled.aborted`).
 */
export const MIN_PI_VERSION = '1.4.0' as const;

/** Fixed codes for a Pi session that cannot run the repo-harness host. */
export type PiHostUnavailableCode =
  | 'PI_HOST_UNSUPPORTED_VERSION'
  | 'PI_HOST_PATH_RESOLVER_UNAVAILABLE';

export type PiPathResolver = (filePath: string, cwd: string) => string;
export type PiCapability =
  | { readonly state: 'ready'; readonly resolveToCwd: PiPathResolver }
  | { readonly state: 'unavailable'; readonly code: PiHostUnavailableCode };

/** The SDK owns path syntax. A moved private export makes the host unavailable. */
export async function probePiCapability(
  version: string,
  packageDir: string,
  load: (url: string) => Promise<unknown> = (url) => import(url),
): Promise<PiCapability> {
  if (!piVersionSupported(version)) return { state: 'unavailable', code: 'PI_HOST_UNSUPPORTED_VERSION' };
  try {
    const { pathToFileURL } = await import('node:url');
    const { join } = await import('node:path');
    const module = await load(pathToFileURL(join(packageDir, 'dist/core/tools/path-utils.js')).href);
    if (module && typeof module === 'object' && 'resolveToCwd' in module && typeof module.resolveToCwd === 'function') {
      return { state: 'ready', resolveToCwd: module.resolveToCwd as PiPathResolver };
    }
  } catch { /* The fixed code also covers a missing or unloadable module. */ }
  return { state: 'unavailable', code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE' };
}

/** Semver core compare (major.minor.patch); a prerelease of the floor is below it. */
export function piVersionSupported(version: string, minimum: string = MIN_PI_VERSION): boolean {
  const parse = (value: string) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
    return match ? { core: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] !== undefined } : null;
  };
  const actual = parse(version);
  const floor = parse(minimum);
  if (!actual || !floor) return false;
  for (let i = 0; i < 3; i++) {
    if (actual.core[i] !== floor.core[i]) return actual.core[i]! > floor.core[i]!;
  }
  return !actual.prerelease || floor.prerelease;
}
