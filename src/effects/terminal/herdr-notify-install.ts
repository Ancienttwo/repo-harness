// The notify file writers: `herdr notify install` writes the config and, as its last step, the
// install record; the relay writes the delivery record. The paths and readers are in notify-read.ts.

import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, fchmodSync, fsyncSync, lstatSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { RH_NOTIFY_RELAY } from './herdr-core.ts';
import { NOTIFY_INSTALL_RECORD_KIND, notifyInstallRecordPath } from './notify-read.ts';

/** Atomic write, mode 0600 in a 0700 directory. A symlink at the directory or the target is refused. */
export function writePrivateFile(target: string, text: string): void {
  const dir = dirname(target);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('The notify directory must be a directory.');
  chmodSync(dir, 0o700);
  try {
    const existing = lstatSync(target);
    if (!existing.isFile() || existing.isSymbolicLink()) throw new Error('A notify file must be a regular file.');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temporary = join(dir, `.notify-${randomUUID()}`);
  try {
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      fchmodSync(fd, 0o600);
      writeFileSync(fd, text);
      fsyncSync(fd);
    } finally { closeSync(fd); }
    renameSync(temporary, target);
  } finally {
    try { unlinkSync(temporary); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

export function writeNotifyInstallRecord(env: NodeJS.ProcessEnv = process.env): void {
  writePrivateFile(notifyInstallRecordPath(env), `${JSON.stringify({ protocol: 2, kind: NOTIFY_INSTALL_RECORD_KIND, name: RH_NOTIFY_RELAY.name, labels: RH_NOTIFY_RELAY.labels })}\n`);
}
