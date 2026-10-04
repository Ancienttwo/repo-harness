import { execFile } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
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
async function herdr(args: readonly string[], env: NodeJS.ProcessEnv): Promise<string | null> {
  try {
    const { stdout } = await runFile('herdr', [...args], { env, encoding: 'utf8', timeout: 10_000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.trim();
  } catch { return null; }
}

function json(raw: string | null): unknown {
  const start = raw?.indexOf('{') ?? -1;
  if (raw === null || start < 0) return null;
  try { return JSON.parse(raw.slice(start)); }
  catch { return null; }
}

function presence(config: Record<string, string | undefined>, key: NotifyConfigKey): NotifyPresence {
  return config[key] ? 'configured' : 'missing';
}

function configPresence(dir: string | null): Record<NotifyConfigKey, NotifyPresence> {
  const empty = { WEBHOOK_URL: 'missing', WEBHOOK_KEY: 'missing', SLACK_WEBHOOK_URL: 'missing' } as const;
  if (!dir) return { ...empty };
  const path = `${dir}/.env`;
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) return { ...empty };
    const config = parseEnv(readFileSync(path, 'utf8'));
    return {
      WEBHOOK_URL: presence(config, 'WEBHOOK_URL'),
      WEBHOOK_KEY: presence(config, 'WEBHOOK_KEY'),
      SLACK_WEBHOOK_URL: presence(config, 'SLACK_WEBHOOK_URL'),
    };
  } catch {
    return { ...empty };
  }
}

/**
 * The shipped plugin writes one stderr line per channel attempt:
 * `<CHANNEL>: HTTP <status>` or `<CHANNEL>: delivery failed.`. One event can try
 * several channels; it succeeded only when every attempt returned 2xx.
 */
function lastDelivery(raw: string | null): NotifyDeliveryV1 {
  const logs = (json(raw) as { readonly result?: { readonly logs?: readonly HerdrPluginLog[] } } | null)?.result?.logs;
  if (!Array.isArray(logs)) return { at: null, result: 'missing' };
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const entry = logs[index];
    const stderr = typeof entry?.stderr === 'string' ? entry.stderr : '';
    const attempts = [...stderr.matchAll(/\[webhook-notify\] [A-Z]+: (?:HTTP (\d{3})|delivery failed\.)/gu)];
    if (attempts.length === 0) continue;
    const finished = entry?.finished_unix_ms;
    const at = typeof finished === 'number' && Number.isSafeInteger(finished) ? new Date(finished).toISOString() : null;
    const ok = attempts.every(attempt => attempt[1] !== undefined && Number(attempt[1]) >= 200 && Number(attempt[1]) < 300);
    return { at, result: ok ? 'succeeded' : 'failed' };
  }
  return { at: null, result: 'missing' };
}

/** Read plugin install, enable, config presence, and the last recorded delivery. Values stay out. */
export async function readNotifyStatus(input: NotifyStatusReadInput = {}): Promise<NotifyStatusV1> {
  const env = { ...process.env, ...input.env };
  const [listed, dir, logs] = await Promise.all([
    herdr(['plugin', 'list', '--json', '--plugin', NOTIFY_PLUGIN_ID], env),
    herdr(['plugin', 'config-dir', NOTIFY_PLUGIN_ID], env),
    herdr(['plugin', 'log', 'list', '--plugin', NOTIFY_PLUGIN_ID], env),
  ]);
  const plugins = (json(listed) as { readonly result?: HerdrPluginList } | null)?.result?.plugins;
  const plugin = Array.isArray(plugins) ? plugins.find(item => item.plugin_id === NOTIFY_PLUGIN_ID) ?? null : null;
  const root = typeof plugin?.plugin_root === 'string' ? plugin.plugin_root : '';
  let linked: NotifyStatusV1['linked'] = 'missing';
  if (root && isAbsolute(root)) {
    try { linked = lstatSync(`${root}/herdr-plugin.toml`).isFile() ? 'linked' : 'missing'; }
    catch { linked = 'missing'; }
  }
  const configDir = dir && isAbsolute(dir) && !/[\r\n\x00]/.test(dir) ? dir : null;
  return {
    protocol: 1,
    kind: 'operator_notify_status',
    plugin_id: NOTIFY_PLUGIN_ID,
    linked,
    enabled: plugin ? (plugin.enabled === true ? 'enabled' : 'disabled') : 'missing',
    config: configPresence(configDir),
    last_delivery: lastDelivery(logs),
    observed_at: (input.now ?? new Date()).toISOString(),
  };
}
