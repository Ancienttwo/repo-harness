// Adapted from ~/herdr-plugins/webhook-notify. Config and identity come from Herdr.
import { existsSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { isAbsolute, join, sep } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

const DEBOUNCE_MS = 120_000;
const TIMEOUT_MS = 5_000;
const log = (message) => console.error(`[webhook-notify] ${message}`);

function objectJson(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event or context.');
  return value;
}

function isTemporary(path) {
  const absolute = realpathSync(path);
  return [tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].filter(existsSync).some((root) => {
    const normalized = realpathSync(root);
    return absolute === normalized || absolute.startsWith(normalized + sep);
  });
}

export async function notify(env = process.env, send = fetch) {
  const event = objectJson(env.HERDR_PLUGIN_EVENT_JSON);
  const context = objectJson(env.HERDR_PLUGIN_CONTEXT_JSON);
  if (event.event !== 'pane.agent_status_changed') return;
  const data = event.data;
  if (!data || !['done', 'blocked'].includes(data.agent_status)) return;
  if (typeof data.pane_id !== 'string' || !data.pane_id || typeof data.workspace_id !== 'string') throw new Error('Invalid event identity.');
  const paths = [context.workspace_cwd, context.focused_pane_cwd, context.worktree?.path].filter((path) => typeof path === 'string' && path);
  if (!paths.length || paths.some((path) => !isAbsolute(path))) throw new Error('Workspace path is missing or invalid.');
  if (paths.some(isTemporary) || String(context.workspace_label ?? '').startsWith('rh-herdr-')) return;
  if (!env.HERDR_PLUGIN_CONFIG_DIR || !env.HERDR_PLUGIN_STATE_DIR) throw new Error('Herdr plugin directories are missing.');
  const config = parseEnv(readFileSync(join(env.HERDR_PLUGIN_CONFIG_DIR, '.env'), 'utf8'));
  if (!config.NOTIFY_SESSION) throw new Error('Session filter is missing.');
  // Herdr removes HERDR_SESSION for its documented default session.
  if (config.NOTIFY_SESSION !== (env.HERDR_SESSION || 'default')) return;
  if (!config.WEBHOOK_URL || !config.WEBHOOK_KEY) throw new Error('Bot webhook config is missing.');

  const now = Date.now();
  const payload = {
    source: 'herdr', host: hostname(), session: config.NOTIFY_SESSION,
    pane_id: data.pane_id, workspace_id: data.workspace_id, agent_status: data.agent_status,
    agent: data.agent ?? null, display_agent: data.display_agent ?? null, title: data.title ?? null,
    state_labels: data.state_labels ?? null, workspace_label: context.workspace_label ?? null,
    tab_label: context.tab_label ?? null, ts: new Date(now).toISOString(),
  };
  const where = [payload.workspace_label, payload.tab_label].filter(Boolean).join(' / ') || payload.workspace_id;
  const text = `Herdr ${payload.agent_status}: ${payload.display_agent || payload.agent || 'agent'} @ ${where}` +
    (payload.title ? `\n${payload.title}` : '') + `\npane ${payload.pane_id} · ${payload.host}`;
  const targets = [
    { channel: 'WEBHOOK', url: config.WEBHOOK_URL, body: payload,
      headers: { authorization: `Bearer ${config.WEBHOOK_KEY}`, 'x-webhook-key': config.WEBHOOK_KEY } },
    { channel: 'SLACK', url: config.SLACK_WEBHOOK_URL,
      body: { text: text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') } },
    { channel: 'DISCORD', url: config.DISCORD_WEBHOOK_URL, body: { content: text.slice(0, 2000), allowed_mentions: { parse: [] } } },
    { channel: 'TELEGRAM', url: config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID
      ? `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage` : '',
      body: { chat_id: config.TELEGRAM_CHAT_ID, text: text.slice(0, 4096) } },
  ].filter((target) => target.url && (data.agent_status === 'blocked' || config[`${target.channel}_NOTIFY_DONE`] === '1'));
  const statePath = join(env.HERDR_PLUGIN_STATE_DIR, 'debounce-state.json');
  let state = {};
  try {
    const saved = objectJson(readFileSync(statePath, 'utf8'));
    if (Object.values(saved).some((at) => typeof at !== 'number' || !Number.isFinite(at) || at < 0 || at > now)) throw new Error('Invalid debounce state.');
    state = saved;
  } catch (error) {
    if (error.code !== 'ENOENT') log('Cannot read debounce state. Using empty state.');
  }
  for (const [key, at] of Object.entries(state)) if (now - at >= DEBOUNCE_MS) delete state[key];
  for (const target of targets) {
    const key = JSON.stringify([config.NOTIFY_SESSION, data.pane_id, data.agent_status, target.channel]);
    if (state[key] && now - state[key] < DEBOUNCE_MS) continue;
    try {
      const response = await send(target.url, {
        method: 'POST', headers: { 'content-type': 'application/json', ...target.headers },
        body: JSON.stringify(target.body), signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
      });
      let ok = response.ok;
      if (ok && target.channel === 'TELEGRAM') ok = (await response.json()).ok === true;
      // Telegram can refuse a message inside an HTTP 200; the log must keep that failure.
      log(`${target.channel}: HTTP ${response.status}${response.ok && !ok ? ' app-failed' : ''}`);
      if (ok) {
        state[key] = now;
        const temporary = `${statePath}-${randomUUID()}`;
        try {
          writeFileSync(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
          renameSync(temporary, statePath);
        } finally {
          try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
      }
    } catch { log(`${target.channel}: delivery failed.`); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  notify().catch(() => { log('Invalid config, event, or state.'); process.exitCode = 1; });
}
