import { spawnSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { parseEnv } from 'node:util';
import {
  NOTIFY_PLUGIN_ID,
  type NotifyConfigKey,
  type NotifyDeliveryV1,
  type NotifyPresence,
  type NotifyStatusV1,
} from '../../core/operator/notify-status';

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
  readonly status?: unknown;
  readonly stderr?: unknown;
}

function herdrJson(args: readonly string[], env: NodeJS.ProcessEnv): unknown {
  const result = spawnSync('herdr', [...args], {
    env, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0 || result.signal) return null;
  const raw = result.stdout.trim();
  const start = raw.indexOf('{');
  if (start < 0) return null;
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

function lastDelivery(env: NodeJS.ProcessEnv): NotifyDeliveryV1 {
  const value = herdrJson(['plugin', 'log', 'list', '--plugin', NOTIFY_PLUGIN_ID], env) as
    | { readonly result?: { readonly logs?: readonly HerdrPluginLog[] } } | null;
  const logs = value?.result?.logs;
  if (!Array.isArray(logs)) return { at: null, result: 'missing' };
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const entry = logs[index];
    const stderr = typeof entry?.stderr === 'string' ? entry.stderr : '';
    const match = stderr.match(/\[webhook-notify\] ([A-Z]+): HTTP (\d+)/);
    if (!match) continue;
    const finished = entry?.finished_unix_ms;
    const at = typeof finished === 'number' && Number.isSafeInteger(finished) ? new Date(finished).toISOString() : null;
    const status = Number(match[2]);
    return { at, result: entry?.status === 'succeeded' && status >= 200 && status < 300 ? 'succeeded' : 'failed' };
  }
  return { at: null, result: 'missing' };
}

/** Read plugin install, enable, config presence, and the last recorded delivery. Values stay out. */
export function readNotifyStatus(input: NotifyStatusReadInput = {}): NotifyStatusV1 {
  const env = { ...process.env, ...input.env };
  const listed = herdrJson(['plugin', 'list', '--json', '--plugin', NOTIFY_PLUGIN_ID], env) as
    | { readonly result?: HerdrPluginList } | null;
  const plugin = listed?.result?.plugins?.find(item => item.plugin_id === NOTIFY_PLUGIN_ID) ?? null;
  const root = typeof plugin?.plugin_root === 'string' ? plugin.plugin_root : '';
  let linked: NotifyStatusV1['linked'] = 'missing';
  if (root && isAbsolute(root)) {
    try { linked = lstatSync(`${root}/herdr-plugin.toml`).isFile() ? 'linked' : 'missing'; }
    catch { linked = 'missing'; }
  }
  const dirResult = spawnSync('herdr', ['plugin', 'config-dir', NOTIFY_PLUGIN_ID], {
    env, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const dir = dirResult.status === 0 ? dirResult.stdout.trim() : '';
  const configDir = dir && isAbsolute(dir) && !/[\r\n\x00]/.test(dir) ? dir : null;
  return {
    protocol: 1,
    kind: 'operator_notify_status',
    plugin_id: NOTIFY_PLUGIN_ID,
    linked,
    enabled: plugin ? (plugin.enabled === true ? 'enabled' : 'disabled') : 'missing',
    config: configPresence(configDir),
    last_delivery: lastDelivery(env),
    observed_at: (input.now ?? new Date()).toISOString(),
  };
}
