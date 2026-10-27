// The Herdr notify install record: the one source of the Herdr session that
// `repo-harness herdr notify install` set up. Install writes it as its last
// step; the operator notify and Bot access collectors read it on every cycle.

import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, constants, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { repoHarnessHome } from '../repo-harness-home.ts';

/** A Herdr session name. Install validates `--session` with it, and the reader validates the record with it. */
export const HERDR_SESSION_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const RECORD_KIND = 'herdr_notify_install';
const RECORD_KEYS = ['protocol', 'kind', 'session'] as const;
const RECORD_MAX_BYTES = 1024;

export function notifyInstallRecordPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(repoHarnessHome(env), 'herdr', 'notify-install.json');
}

/** Atomic write, mode 0600 in a 0700 directory. A symlink at the directory or the record is refused. */
export function writeNotifyInstallRecord(session: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!HERDR_SESSION_NAME.test(session)) throw new Error('Session name is invalid.');
  const target = notifyInstallRecordPath(env);
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('The install record directory must be a directory.');
  chmodSync(dir, 0o700);
  try {
    const existing = lstatSync(target);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('The install record must be a regular file.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temporary = join(dir, `.notify-install-${randomUUID()}`);
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      fchmodSync(fd, 0o600);
      writeFileSync(fd, `${JSON.stringify({ protocol: 1, kind: RECORD_KIND, session })}\n`);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    renameSync(temporary, target);
  } finally {
    try { unlinkSync(temporary); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export type NotifyInstallSession =
  | { readonly state: 'ok'; readonly session: string }
  | { readonly state: 'missing' }
  | { readonly state: 'invalid' };

function decode(text: string): string | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== RECORD_KEYS.length || [...RECORD_KEYS].sort().some((key, index) => keys[index] !== key)) return null;
  if (record.protocol !== 1 || record.kind !== RECORD_KIND) return null;
  return typeof record.session === 'string' && HERDR_SESSION_NAME.test(record.session) ? record.session : null;
}

/** The recorded session. No file is `missing`; a symlink, a non-regular file, an oversized or undecodable record is `invalid`. */
export async function readNotifyInstallSession(env: NodeJS.ProcessEnv = process.env): Promise<NotifyInstallSession> {
  let handle;
  try {
    // O_NONBLOCK: a FIFO planted at the path must not hold the collector cycle open.
    handle = await open(notifyInstallRecordPath(env), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? { state: 'missing' } : { state: 'invalid' };
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > RECORD_MAX_BYTES) return { state: 'invalid' };
    const buffer = Buffer.alloc(RECORD_MAX_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > RECORD_MAX_BYTES) return { state: 'invalid' };
    const session = decode(buffer.subarray(0, bytesRead).toString('utf8'));
    return session === null ? { state: 'invalid' } : { state: 'ok', session };
  } catch {
    return { state: 'invalid' };
  } finally {
    await handle.close();
  }
}
