/**
 * The Herdr observation pin. Browser bundles and Node transports both read it,
 * so it stays free of Node built-ins. `herdr-observation.ts` re-exports these
 * names and owns the socket codec.
 */

/**
 * Schema source revision. Reported version fields do not attest this commit.
 * Upstream `herdrdev/herdr` v0.9.5 release commit.
 */
export const HERDR_OBSERVATION_REVISION = '2ecf19a92fc3a7fff75b6ce3655ef04f4625ec01';
export const HERDR_OBSERVATION_VERSION = '0.9.5';
export const HERDR_OBSERVATION_PROTOCOL = 22;
