/**
 * The hc version floor. The release owns it: `herdr-core-pin.json` in this
 * package protects this package's hc client code, so every reader (Board,
 * Bots, runtime, readiness and the CI install) takes the floor from that file.
 * Each reader checks its component: Board, setup and install/update check the
 * client; Bots and the runtime transport check the core.
 * Browser bundles and Node both read this file, so it stays free of Node
 * built-ins. Herdr.app has no pin yet.
 */
import pin from './herdr-core-pin.json';

export const HC_VERSION_TEXT = /^[0-9]{1,9}\.[0-9]{1,9}\.[0-9]{1,9}$/u;

/** The lowest hc version that this release's client code supports. */
export const HC_MIN_VERSION: string = pin.min_version;

export interface HcReleaseAsset { readonly url: string; readonly sha256: string }

/** The checksum-pinned herdr-core release archive of each platform, by asset name (`macos-aarch64`). */
export const HC_RELEASE_ASSETS: Readonly<Record<string, HcReleaseAsset>> = pin.release_assets;

export interface HcVersionCheck {
  /** `mismatch`: the core is older than the pin. */
  readonly state: 'aligned' | 'mismatch';
  readonly expected: { readonly min_version: string };
  readonly actual: { readonly version: string };
}

function parts(version: string): readonly number[] {
  if (!HC_VERSION_TEXT.test(version)) throw new Error('hc_version_invalid');
  return version.split('.').map(Number);
}

/** -1, 0 or 1, by numeric `x.y.z` order. */
export function compareHcVersions(left: string, right: string): number {
  const a = parts(left), b = parts(right);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index]! < b[index]! ? -1 : 1;
  return 0;
}

export function hcVersionCheck(version: string, minVersion: string): HcVersionCheck {
  return { state: compareHcVersions(version, minVersion) >= 0 ? 'aligned' : 'mismatch', expected: { min_version: minVersion }, actual: { version } };
}

/** The core answered, but its version is below the pin: nothing of its terminal schema is read. */
export class HcVersionMismatchError extends Error {
  constructor(readonly check: HcVersionCheck) {
    super(`hc core ${check.actual.version} is below the repo-harness floor ${check.expected.min_version}; if hc --version is below ${check.expected.min_version}, run hc update --version ${check.expected.min_version} (it restarts the core); else run hc server restart.`);
    this.name = 'HcVersionMismatchError';
  }
}
