// The notify relay files under the repo-harness home. `herdr notify install` writes the
// config and, as its last step, the install record. The relay writes the delivery record.
// The operator notify collector reads all three on every cycle.

import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { repoHarnessHome } from '../repo-harness-home.ts';
import { RH_NOTIFY_RELAY, type HcLabels, type HcTerminalSummary } from './herdr-core.ts';

const RECORD_KIND = 'notify_relay_install';
const RECORD_KEYS = ['kind', 'labels', 'name', 'protocol'] as const;

/** The relay terminal that install started: its hc name and the labels that find it. */
export interface NotifyRelayTerminal {
  readonly name: string;
  readonly labels: HcLabels;
}
const RECORD_MAX_BYTES = 1024;

export const notifyInstallRecordPath = (env: NodeJS.ProcessEnv = process.env): string => join(repoHarnessHome(env), 'herdr', 'notify-install.json');
export const notifyConfigPath = (env: NodeJS.ProcessEnv = process.env): string => join(repoHarnessHome(env), 'herdr', 'notify.env');
export const notifyDeliveriesPath = (env: NodeJS.ProcessEnv = process.env): string => join(repoHarnessHome(env), 'herdr', 'notify-deliveries.json');

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

/** The text of a regular private file, or `null` when it does not exist. A symlink, FIFO or oversized file throws. */
export function readPrivateFile(path: string, limit: number): string | null {
  let fd;
  try {
    // O_NONBLOCK: a FIFO planted at the path must not block the open.
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit) throw new Error('notify_file_invalid');
    const buffer = Buffer.alloc(limit + 1);
    const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('notify_file_invalid');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

export function writeNotifyInstallRecord(env: NodeJS.ProcessEnv = process.env): void {
  writePrivateFile(notifyInstallRecordPath(env), `${JSON.stringify({ protocol: 2, kind: RECORD_KIND, name: RH_NOTIFY_RELAY.name, labels: RH_NOTIFY_RELAY.labels })}\n`);
}

export type NotifyInstallRecord =
  | { readonly state: 'ok'; readonly relay: NotifyRelayTerminal }
  | { readonly state: 'missing' }
  | { readonly state: 'invalid' };

function decode(text: string): NotifyRelayTerminal | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // A record names the relay this version starts. Any other name or label set fails closed: install again.
  if (Object.keys(record).sort().join() !== RECORD_KEYS.join() || record.protocol !== 2 || record.kind !== RECORD_KIND
    || record.name !== RH_NOTIFY_RELAY.name || JSON.stringify(record.labels) !== JSON.stringify(RH_NOTIFY_RELAY.labels)) return null;
  return RH_NOTIFY_RELAY;
}

/**
 * No file is `missing`. A symlink, a non-regular file, an oversized record, or any other
 * shape is `invalid`, including a classic Herdr record that named a session: install again.
 */
export function readNotifyInstallRecord(env: NodeJS.ProcessEnv = process.env): NotifyInstallRecord {
  let text;
  try { text = readPrivateFile(notifyInstallRecordPath(env), RECORD_MAX_BYTES); }
  catch { return { state: 'invalid' }; }
  if (text === null) return { state: 'missing' };
  const relay = decode(text);
  return relay === null ? { state: 'invalid' } : { state: 'ok', relay };
}

/** The relay runs when a live terminal carries the recorded name. The status reader and doctor share this rule. */
export function relayIsLive(relays: readonly HcTerminalSummary[], relay: NotifyRelayTerminal): boolean {
  return relays.some(terminal => terminal.name === relay.name && terminal.state === 'live');
}
