import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareVersions } from '../core/release/compare-versions';

/**
 * The oldest Pi that repo-harness supports. OAR requires
 * `@earendil-works/pi-coding-agent ^1.4.0`, and 1.4.0 is the first Pi with
 * nested `tool_call` events, `before_agent_start` messages and
 * `agent_settled.aborted`. A newer Pi is accepted when the probe passes.
 */
export const MIN_PI_VERSION = '1.4.0';

export type PiHostProbeCode = 'PI_HOST_UNSUPPORTED_VERSION' | 'PI_HOST_PATH_RESOLVER_UNAVAILABLE';

export type ToolPathResolver = (path: string, cwd: string) => string;

export type PiHostProbe =
  | { readonly ok: true; readonly resolveToCwd: ToolPathResolver }
  | { readonly ok: false; readonly code: PiHostProbeCode; readonly message: string };

/**
 * Pi exports no path resolver. The edit and write tools resolve `input.path`
 * with the private `resolveToCwd`; the guard must see the same file, so the
 * probe imports that function and never parses Pi paths itself. When Pi moves
 * it, the probe fails and the extension blocks edits.
 */
export const PI_PATH_RESOLVER_MODULE = 'dist/core/tools/path-utils.js';

export async function probePiHost(version: string, packageDir: string): Promise<PiHostProbe> {
  const order = compareVersions(version, MIN_PI_VERSION);
  if (order === null || order < 0) {
    return { ok: false, code: 'PI_HOST_UNSUPPORTED_VERSION', message: `PI_HOST_UNSUPPORTED_VERSION: Pi ${version}; repo-harness requires Pi >= ${MIN_PI_VERSION}` };
  }
  const module = join(packageDir, PI_PATH_RESOLVER_MODULE);
  let resolver: unknown;
  try {
    resolver = (await import(pathToFileURL(module).href) as { resolveToCwd?: unknown }).resolveToCwd;
  } catch (error) {
    return { ok: false, code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE', message: `PI_HOST_PATH_RESOLVER_UNAVAILABLE: ${module}: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (typeof resolver !== 'function') {
    return { ok: false, code: 'PI_HOST_PATH_RESOLVER_UNAVAILABLE', message: `PI_HOST_PATH_RESOLVER_UNAVAILABLE: ${module} does not export resolveToCwd` };
  }
  return { ok: true, resolveToCwd: resolver as ToolPathResolver };
}
