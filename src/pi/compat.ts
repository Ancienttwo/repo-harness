/**
 * Pi host version policy (#1099). The Pi extension, setup check and docs read
 * this one constant. There is no upper bound: a newer Pi is accepted when the
 * runtime capability probe passes.
 *
 * 1.4.0 is the floor because OAR 0.75.0 requires
 * `@earendil-works/pi-coding-agent ^1.4.0`, and Pi 1.4.0 has every event the
 * extension maps (`tool_call` with `parentToolCallId`, `before_agent_start`
 * messages, `agent_settled.aborted`).
 */
export const MIN_PI_VERSION = '1.4.0' as const;

/** Fixed codes for a Pi session that cannot run the repo-harness host. */
export type PiHostUnavailableCode =
  | 'PI_HOST_UNSUPPORTED_VERSION'
  | 'PI_HOST_PATH_RESOLVER_UNAVAILABLE';

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
