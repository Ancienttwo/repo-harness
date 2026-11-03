// The read contract of the notify relay files under the repo-harness home. `herdr notify install`
// writes the config and, as its last step, the install record. The relay writes the delivery record.
// The operator notify collector, the herdr command and the relay read them through this module;
// the writers stay in task-agent-host.

import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { NOTIFY_CHANNEL_SECRET_KEYS, type NotifyChannelSecretKey } from '../../core/decision/notify-secret-keys';
import { EMPTY_RELAY_DELIVERIES, decodeRelayDeliveries, type RelayDeliveriesV1 } from '../../core/operator/notify-status';
import { repoHarnessHome } from '../repo-harness-home.ts';
import { RH_NOTIFY_RELAY, type HcLabels, type HcTerminalSummary } from './herdr-core.ts';

export const NOTIFY_INSTALL_RECORD_KIND = 'notify_relay_install';
const RECORD_KEYS = ['kind', 'labels', 'name', 'protocol'] as const;
const RECORD_MAX_BYTES = 1024;
const CONFIG_MAX_BYTES = 64 * 1024;
const DELIVERIES_MAX_BYTES = 64 * 1024;

export const notifyInstallRecordPath = (env: NodeJS.ProcessEnv = process.env): string => join(repoHarnessHome(env), 'herdr', 'notify-install.json');
export const notifyConfigPath = (env: NodeJS.ProcessEnv = process.env): string => join(repoHarnessHome(env), 'herdr', 'notify.env');
export const notifyDeliveriesPath = (env: NodeJS.ProcessEnv = process.env): string => join(repoHarnessHome(env), 'herdr', 'notify-deliveries.json');

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

/** The relay terminal that install started: its hc name and the labels that find it. */
export interface NotifyRelayTerminal {
  readonly name: string;
  readonly labels: HcLabels;
}

export type NotifyInstallRecord =
  | { readonly state: 'ok'; readonly relay: NotifyRelayTerminal }
  | { readonly state: 'missing' }
  | { readonly state: 'invalid' };

function decodeInstallRecord(text: string): NotifyRelayTerminal | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  // A record names the relay this version starts. Any other name or label set fails closed: install again.
  if (Object.keys(record).sort().join() !== RECORD_KEYS.join() || record.protocol !== 2 || record.kind !== NOTIFY_INSTALL_RECORD_KIND
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
  const relay = decodeInstallRecord(text);
  return relay === null ? { state: 'invalid' } : { state: 'ok', relay };
}

/** The relay runs when a live terminal carries the recorded name. The status reader and doctor share this rule. */
export function relayIsLive(relays: readonly HcTerminalSummary[], relay: NotifyRelayTerminal): boolean {
  return relays.some(terminal => terminal.name === relay.name && terminal.state === 'live');
}

export const NOTIFY_DONE_KEYS = ['WEBHOOK_NOTIFY_DONE', 'SLACK_NOTIFY_DONE', 'DISCORD_NOTIFY_DONE', 'TELEGRAM_NOTIFY_DONE'] as const;
export type NotifyConfig = Readonly<Record<NotifyChannelSecretKey | typeof NOTIFY_DONE_KEYS[number], string>>;

/** A config value breaks a rule. The message names the key and the rule, never the value. */
export class NotifyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotifyConfigError';
  }
}

const URL_KEYS = ['WEBHOOK_URL', 'SLACK_WEBHOOK_URL', 'DISCORD_WEBHOOK_URL'] as const satisfies readonly NotifyChannelSecretKey[];

/**
 * The one config decoder. Install input and each relay reload pass through it, so a changed file
 * cannot send to plain HTTP or with half a Telegram target. An absent key is an empty value; an
 * absent done flag is off.
 */
export function decodeNotifyConfig(values: Readonly<Record<string, string | undefined>>): NotifyConfig {
  const config: Record<string, string> = {};
  for (const key of NOTIFY_CHANNEL_SECRET_KEYS) {
    const value = values[key] ?? '';
    if (/[\x00-\x1f\x7f'"\\]/.test(value)) throw new NotifyConfigError(`${key} contains an unsupported character.`);
    config[key] = value;
  }
  for (const key of NOTIFY_DONE_KEYS) {
    const value = values[key] ?? '0';
    if (value !== '0' && value !== '1') throw new NotifyConfigError(`${key} must be 0 or 1.`);
    config[key] = value;
  }
  if (!config.WEBHOOK_URL || !config.WEBHOOK_KEY) throw new NotifyConfigError('WEBHOOK_URL and WEBHOOK_KEY are required.');
  if (Boolean(config.TELEGRAM_BOT_TOKEN) !== Boolean(config.TELEGRAM_CHAT_ID)) throw new NotifyConfigError('Telegram needs a bot token and a chat id.');
  for (const key of URL_KEYS) {
    if (!config[key]) continue;
    let url: URL;
    try { url = new URL(config[key]!); } catch { throw new NotifyConfigError(`${key} must be an HTTPS URL.`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new NotifyConfigError(`${key} must be an HTTPS URL without user information.`);
  }
  if (config.TELEGRAM_BOT_TOKEN && !/^\d+:[A-Za-z0-9_-]+$/.test(config.TELEGRAM_BOT_TOKEN)) throw new NotifyConfigError('TELEGRAM_BOT_TOKEN is invalid.');
  if (config.TELEGRAM_CHAT_ID && !/^(?:-?\d+|@[A-Za-z0-9_]+)$/.test(config.TELEGRAM_CHAT_ID)) throw new NotifyConfigError('TELEGRAM_CHAT_ID is invalid.');
  return config as NotifyConfig;
}

/** The decoded config, or `null` when no file exists. A config that breaks a rule throws NotifyConfigError. */
export function readNotifyConfig(env: NodeJS.ProcessEnv): NotifyConfig | null {
  const text = readPrivateFile(notifyConfigPath(env), CONFIG_MAX_BYTES);
  return text === null ? null : decodeNotifyConfig(parseEnv(text));
}

export function readRelayDeliveries(env: NodeJS.ProcessEnv): RelayDeliveriesV1 {
  const text = readPrivateFile(notifyDeliveriesPath(env), DELIVERIES_MAX_BYTES);
  return text === null ? EMPTY_RELAY_DELIVERIES : decodeRelayDeliveries(JSON.parse(text));
}
