import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { parseEnv, promisify } from 'node:util';
import {
  NOTIFY_PLUGIN_ID,
  type NotifyConfigKey,
  type NotifyDeliveryV1,
  type NotifyPresence,
  type NotifyStatusV1,
} from '../../core/operator/notify-status';

const runFile = promisify(execFile);

export interface NotifyStatusReadInput {
  readonly env?: NodeJS.ProcessEnv;
  /** The Herdr session the plugin was installed into. Defaults to the session Herdr itself selects from `HERDR_SESSION`. */
  readonly session?: string;
  readonly now?: Date;
}

interface HerdrPluginList {
  readonly plugins?: readonly {
    readonly plugin_id?: unknown;
    readonly enabled?: unknown;
    readonly plugin_root?: unknown;
  }[];
}

interface HerdrPluginLog {
  readonly finished_unix_ms?: unknown;
  readonly stderr?: unknown;
}

// The server answers other requests while Herdr runs, so these reads must not block.
async function herdr(session: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    const { stdout } = await runFile('herdr', ['--session', session, ...args], { env, encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
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

export type NotifyChannel = 'webhook' | 'slack' | 'discord' | 'telegram';

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

async function configPresence(dir: string | null): Promise<ConfigPresence> {
  if (!dir) return presences({});
  const path = `${dir}/.env`;
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) return presences({});
    return presences(parseEnv(await readFile(path, 'utf8')));
  } catch {
    return presences({});
  }
}

type DeliveryOutcome = 'succeeded' | 'failed' | 'unsupported' | null;

const is2xx = (code: string) => Number(code) >= 200 && Number(code) < 300;

/**
 * Every stderr line format the reader knows, mapped to a delivery attempt result
 * (true/false) or to null for a known line that records no attempt. The current
 * plugin writes `<CHANNEL>: HTTP <status>[ app-failed]` or `<CHANNEL>: delivery
 * failed.`. The 0.1.0 plugin, still installed on some machines, writes
 * `POST|SLACK <identity> -> <status>` or `POST|SLACK failed: <reason>`.
 */
const LINE_FORMATS: readonly (readonly [RegExp, (match: RegExpMatchArray) => boolean | null])[] = [
  [/^\[webhook-notify\] [A-Z]+: HTTP (\d{3})( app-failed)?$/u, match => is2xx(match[1]!) && match[2] === undefined],
  [/^\[webhook-notify\] [A-Z]+: delivery failed\.$/u, () => false],
  [/^\[webhook-notify\] Invalid config, event, or state\.$/u, () => null],
  [/^\[webhook-notify\] Cannot read debounce state\. Using empty state\.$/u, () => null],
  [/^\[webhook-notify\] (?:POST|SLACK) \S+ -> (\d{3})$/u, match => is2xx(match[1]!)],
  [/^\[webhook-notify\] (?:POST|SLACK) failed: /u, () => false],
  [/^\[webhook-notify\] (?:invalid \S+: |skip test workspace |no target configured |debounced |state write failed: |error: )/u, () => null],
];

/** One event can try several channels; it succeeded only when every attempt succeeded. */
function entryOutcome(stderr: string): DeliveryOutcome {
  const attempts: boolean[] = [];
  for (const line of stderr.split('\n').map(item => item.trimEnd()).filter(Boolean)) {
    const known = LINE_FORMATS.map(([pattern, read]) => {
      const match = line.match(pattern);
      return match ? { result: read(match) } : null;
    }).find(item => item !== null);
    if (!known) return 'unsupported';
    if (known.result !== null) attempts.push(known.result);
  }
  if (attempts.length === 0) return null;
  return attempts.every(Boolean) ? 'succeeded' : 'failed';
}

/**
 * Herdr does not promise log order, so the newest finish time selects the entry.
 * An entry without a valid finish time cannot be placed in time and is skipped.
 * A newest entry the reader cannot interpret is `unsupported`, never `missing`.
 */
function lastDelivery(raw: string | null): NotifyDeliveryV1 {
  const logs = (json(raw) as { readonly result?: { readonly logs?: readonly HerdrPluginLog[] } } | null)?.result?.logs;
  if (!Array.isArray(logs)) return { at: null, result: 'unavailable' };
  let newest: { readonly finished: number; readonly result: Exclude<DeliveryOutcome, null> } | null = null;
  for (const entry of logs) {
    const finished = entry?.finished_unix_ms;
    if (typeof finished !== 'number' || !Number.isSafeInteger(finished) || finished < 0) continue;
    if (newest !== null && finished <= newest.finished) continue;
    const result = entryOutcome(typeof entry?.stderr === 'string' ? entry.stderr : '');
    if (result !== null) newest = { finished, result };
  }
  if (newest === null) return { at: null, result: 'missing' };
  return { at: new Date(newest.finished).toISOString(), result: newest.result };
}

export interface NotifyChannelStatus {
  readonly status: NotifyStatusV1;
  readonly channels: Readonly<Record<NotifyChannel, NotifyPresence>>;
}

/** Read plugin install, enable, config presence, and the last recorded delivery. Values stay out. */
export async function readNotifyStatus(input: NotifyStatusReadInput = {}): Promise<NotifyStatusV1> {
  return (await readNotifyChannelStatus(input)).status;
}

/** The status plus whether each delivery channel is configured, from the same config read. */
export async function readNotifyChannelStatus(input: NotifyStatusReadInput = {}): Promise<NotifyChannelStatus> {
  const env = { ...process.env, ...input.env };
  // Install names the session with --session and strips HERDR_*; the reader must
  // target the same session, so a pane's socket or caller identity cannot redirect it.
  const session = input.session ?? (env.HERDR_SESSION || 'default');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session)) throw new Error('notify_status_session');
  for (const name of Object.keys(env)) if (name.startsWith('HERDR_')) delete env[name];
  const [listed, dir, logs] = await Promise.all([
    herdr(session, ['plugin', 'list', '--json', '--plugin', NOTIFY_PLUGIN_ID], env),
    herdr(session, ['plugin', 'config-dir', NOTIFY_PLUGIN_ID], env),
    herdr(session, ['plugin', 'log', 'list', '--plugin', NOTIFY_PLUGIN_ID], env),
  ]);
  const plugins = (json(listed) as { readonly result?: HerdrPluginList } | null)?.result?.plugins;
  const plugin = Array.isArray(plugins) ? plugins.find(item => item.plugin_id === NOTIFY_PLUGIN_ID) ?? null : null;
  const root = typeof plugin?.plugin_root === 'string' ? plugin.plugin_root : '';
  let linked: NotifyStatusV1['linked'] = 'missing';
  if (root && isAbsolute(root)) {
    try { linked = (await lstat(`${root}/herdr-plugin.toml`)).isFile() ? 'linked' : 'missing'; }
    catch { linked = 'missing'; }
  }
  const configDir = dir && isAbsolute(dir) && !/[\r\n\x00]/.test(dir) ? dir : null;
  const { config, channels } = await configPresence(configDir);
  return { channels, status: {
    protocol: 1,
    kind: 'operator_notify_status',
    plugin_id: NOTIFY_PLUGIN_ID,
    linked,
    enabled: plugin ? (plugin.enabled === true ? 'enabled' : 'disabled') : 'missing',
    config,
    last_delivery: lastDelivery(logs),
    observed_at: (input.now ?? new Date()).toISOString(),
  } };
}
