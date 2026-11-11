/**
 * The pattern of a `sha256:`-prefixed digest (see `sha256Prefixed`). It lives apart from
 * `sha256.ts` because the browser import graph must not reach `crypto`. No `g` or `y` flag:
 * `.test` keeps no state.
 */
export const SHA256_PREFIXED_PATTERN = /^sha256:[0-9a-f]{64}$/u;
