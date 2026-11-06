/**
 * hc addresses on this core: `t`, then 1-9, then base-30 symbols, such as `t7` or `t1b`.
 * hc ids are u32, so an address has at most seven symbols after `t`.
 */
export const HC_LOCAL_ADDRESS = /^t[1-9][0-9bcdfghjkmnpqrstvwxyz]{0,6}$/u;

/** A slash marks another machine; its address shape is outside this core's contract. */
export function isRemoteHcAddress(value: string): boolean {
  return value.includes('/');
}
