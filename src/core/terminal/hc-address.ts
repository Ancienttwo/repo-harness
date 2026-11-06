/**
 * hc's own address for a terminal on this core (hc terminals.rs `id_shaped`, floor 0.1.17): `t`, then 1-9, then base-30
 * symbols, for example `t7` or `t1b`. A name can name a later terminal; this address never does, and no name has
 * this shape. hc ids are u32, so an address has at most seven symbols.
 */
const ADDRESS = /^t[1-9][0-9bcdfghjkmnpqrstvwxyz]{0,6}$/;

/** True when `value` has hc's terminal address shape (see ADDRESS). */
export function isHcAddress(value: string): boolean {
  return ADDRESS.test(value);
}

/** A slash marks another machine's terminal. Machine names have no published grammar. */
export function isRemoteHcAddress(value: string): boolean {
  return value.includes('/');
}
