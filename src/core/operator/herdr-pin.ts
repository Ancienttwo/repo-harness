/**
 * The hc version floor. The release owns it: `herdr-core-pin.json` in this
 * package protects this package's hc client code, so every reader (Board,
 * Bots, runtime, readiness and the CI install) takes the floor from that file.
 * Browser bundles and Node both read this file, so it stays free of Node
 * built-ins. Herdr.app has no pin yet.
 */
import pin from './herdr-core-pin.json';

export const HC_VERSION_TEXT = /^[0-9]{1,9}\.[0-9]{1,9}\.[0-9]{1,9}$/u;

/** The lowest hc version that this release's client code supports. */
export const HC_MIN_VERSION: string = pin.min_version;

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
    super(`hc_version_mismatch: expected ${check.expected.min_version} or later; actual ${check.actual.version}`);
    this.name = 'HcVersionMismatchError';
  }
}
