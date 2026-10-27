import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { parseEnv, promisify } from 'node:util';
import {
  NOTIFY_PLUGIN_ID,
  readDeliveries,
  type NotifyChannel,
  type NotifyChannelDeliveriesV1,
  type NotifyConfigKey,
  type NotifyLogEntry,
  type NotifyPresence,
  type NotifyStatusV1,
  type NotifyUnavailableReason,
} from '../../core/operator/notify-status';
import { readNotifyInstallSession } from '../terminal/herdr-notify-install';

/** A probe failed, so the status is unknown. The code is public; the cause stays here. */
export class NotifyStatusUnavailableError extends Error {
  constructor(readonly code: NotifyUnavailableReason) {
    super(code);
    this.name = 'NotifyStatusUnavailableError';
  }
}

const runFile = promisify(execFile);
const HERDR_TIMEOUT_MS = 10_000;

export interface NotifyStatusReadInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: Date;
  /** Deadline of each Herdr call. */
  readonly timeout_ms?: number;
}

interface HerdrPluginList {
  readonly plugins?: readonly {
    readonly plugin_id?: unknown;
    readonly enabled?: unknown;
    readonly plugin_root?: unknown;
  }[];
}

// The server answers other requests while Herdr runs, so these reads must not block.
async function herdr(session: string, args: readonly string[], env: NodeJS.ProcessEnv, timeout: number): Promise<string | null> {
  try {
    // SIGKILL: a Herdr that ignores SIGTERM would otherwise hold the notify cycle, and so close(), open.
    const { stdout } = await runFile('herdr', ['--session', session, ...args], { env, encoding: 'utf8', timeout, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch { return null; }
}

function json(raw: string | null): unknown {
  const start = raw?.indexOf('{') ?? -1;
  if (raw === null || start < 0) return null;
  try { return JSON.parse(raw.slice(start)); }
  catch { return null; }
}

function presence(config: Record<string, string | undefined>, ...keys: readonly string[]): NotifyPresence {
  return keys.every(key => config[key]) ? 'configured' : 'missing';
}

interface ConfigPresence {
  readonly config: Record<NotifyConfigKey, NotifyPresence>;
  /** A channel is configured when the plugin would send to it. */
  readonly channels: Record<NotifyChannel, NotifyPresence>;
}

function presences(config: Record<string, string | undefined>): ConfigPresence {
  return {
    config: {
      WEBHOOK_URL: presence(config, 'WEBHOOK_URL'),
      WEBHOOK_KEY: presence(config, 'WEBHOOK_KEY'),
      SLACK_WEBHOOK_URL: presence(config, 'SLACK_WEBHOOK_URL'),
    },
    channels: {
      webhook: presence(config, 'WEBHOOK_URL', 'WEBHOOK_KEY'),
      slack: presence(config, 'SLACK_WEBHOOK_URL'),
      discord: presence(config, 'DISCORD_WEBHOOK_URL'),
      telegram: presence(config, 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'),
    },
  };
}

/** No `.env` means nothing is configured; a file that cannot be read means the presence is unknown. */
async function configPresence(dir: string): Promise<ConfigPresence> {
  const path = `${dir}/.env`;
  try {
    const stat = await lstat(path);
    // The plugin's own config is a regular file; a symlink is not followed and counts as no config.
    if (stat.isSymbolicLink() || !stat.isFile()) return presences({});
    return presences(parseEnv(await readFile(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return presences({});
    throw new NotifyStatusUnavailableError('notify_config_unavailable');
  }
}

function pluginLogs(raw: string | null): readonly NotifyLogEntry[] | null {
  const logs = (json(raw) as { readonly result?: { readonly logs?: readonly NotifyLogEntry[] } } | null)?.result?.logs;
  return Array.isArray(logs) ? logs : null;
}

export interface NotifyChannelStatus {
  readonly status: NotifyStatusV1;
  readonly channels: Readonly<Record<NotifyChannel, NotifyPresence>>;
}

/** Adds the newest recorded delivery of each channel to the status. */
export interface NotifyChannelDeliveryStatus extends NotifyChannelStatus {
  readonly deliveries: NotifyChannelDeliveriesV1;
}

/**
 * The status, whether each channel is configured, and each channel's newest
 * delivery, from one read. Values stay out. A missing or invalid install
 * record, a failed plugin list, or a failed config read of an installed plugin
 * throws NotifyStatusUnavailableError.
 */
export async function readNotifyChannelStatus(input: NotifyStatusReadInput = {}): Promise<NotifyChannelDeliveryStatus> {
  const env = { ...process.env, ...input.env };
  // The session is the one install recorded. HERDR_* is stripped, so a pane's
  // socket or caller identity cannot redirect the read to another session.
  const record = await readNotifyInstallSession(env);
  if (record.state === 'missing') throw new NotifyStatusUnavailableError('notify_session_missing');
  if (record.state === 'invalid') throw new NotifyStatusUnavailableError('notify_session_invalid');
  const { session } = record;
  for (const name of Object.keys(env)) if (name.startsWith('HERDR_')) delete env[name];
  const timeout = input.timeout_ms ?? HERDR_TIMEOUT_MS;
  const plugins = (json(await herdr(session, ['plugin', 'list', '--json', '--plugin', NOTIFY_PLUGIN_ID], env, timeout)) as { readonly result?: HerdrPluginList } | null)?.result?.plugins;
  if (!Array.isArray(plugins)) throw new NotifyStatusUnavailableError('herdr_unavailable');
  const plugin = plugins.find(item => item.plugin_id === NOTIFY_PLUGIN_ID) ?? null;
  // Herdr listed no such plugin: nothing is installed, configured or delivered.
  if (plugin === null) {
    const none = presences({});
    const { last_delivery, deliveries } = readDeliveries([]);
    return { channels: none.channels, deliveries, status: {
      protocol: 1, kind: 'operator_notify_status', plugin_id: NOTIFY_PLUGIN_ID, linked: 'missing', enabled: 'missing',
      config: none.config, last_delivery, observed_at: (input.now ?? new Date()).toISOString(),
    } };
  }
  const [dir, logs] = await Promise.all([
    herdr(session, ['plugin', 'config-dir', NOTIFY_PLUGIN_ID], env, timeout),
    herdr(session, ['plugin', 'log', 'list', '--plugin', NOTIFY_PLUGIN_ID], env, timeout),
  ]);
  const root = typeof plugin.plugin_root === 'string' ? plugin.plugin_root : '';
  let linked: NotifyStatusV1['linked'] = 'missing';
  if (root && isAbsolute(root)) {
    try { linked = (await lstat(`${root}/herdr-plugin.toml`)).isFile() ? 'linked' : 'missing'; }
    catch { linked = 'missing'; }
  }
  if (!dir || !isAbsolute(dir) || /[\r\n\x00]/.test(dir)) throw new NotifyStatusUnavailableError('notify_config_unavailable');
  const { config, channels } = await configPresence(dir);
  // An unreadable log stays `unavailable` per channel; it is not a missing delivery.
  const { last_delivery, deliveries } = readDeliveries(pluginLogs(logs));
  return { channels, deliveries, status: {
    protocol: 1,
    kind: 'operator_notify_status',
    plugin_id: NOTIFY_PLUGIN_ID,
    linked,
    enabled: plugin.enabled === true ? 'enabled' : 'disabled',
    config,
    last_delivery,
    observed_at: (input.now ?? new Date()).toISOString(),
  } };
}
