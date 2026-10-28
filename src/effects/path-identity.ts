import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** Retain path identity when an installed package or runtime has been removed. */
export function realPathOrResolved(pathValue: string): string {
  try { return realpathSync(pathValue); }
  catch { return resolve(pathValue); }
}
