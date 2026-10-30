// Adapted from ~/herdr-plugins/webhook-notify. Config and identity come from Herdr.
import { constants, closeSync, fchmodSync, fstatSync, mkdirSync, openSync, readSync, readdirSync, rmdirSync, existsSync, lstatSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { systemWorktreeRoot } from './worktree-location.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { POLICY_VERSION, paneStatusRequest, decodeClefAnswer, decisionBand } from './pane-status.mjs';

const DEBOUNCE_MS = 120_000;
const TIMEOUT_MS = 5_000;
const log = (message) => console.error(`[webhook-notify] ${message}`);

function objectJson(raw) {
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid event or context.');
  return value;
}

function isManagedTaskPath(absolute, managedRoot) {
  let worktree = absolute;
  while (dirname(worktree) !== managedRoot) {
    const parent = dirname(worktree);
    if (parent === worktree) return false;
    worktree = parent;
  }
  if (!/^.+-wt-.+$/.test(basename(worktree))) return false;
  try {
    const pointer = join(worktree, '.git');
    const file = lstatSync(pointer);
    if (!file.isFile() || file.isSymbolicLink()) return false;
    const content = readFileSync(pointer, 'utf8').trim();
    if (!content.startsWith('gitdir: ')) return false;
    const namedAdmin = resolve(worktree, content.slice(8));
    const stat = lstatSync(namedAdmin);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && stat.uid !== process.getuid?.())) return false;
    const admin = realpathSync(namedAdmin);
    const commonPointer = join(admin, 'commondir');
    const commonFile = lstatSync(commonPointer);
    if (!commonFile.isFile() || commonFile.isSymbolicLink()) return false;
    const common = realpathSync(resolve(admin, readFileSync(commonPointer, 'utf8').trim()));
    const head = lstatSync(join(common, 'HEAD')), objects = lstatSync(join(common, 'objects')), refs = lstatSync(join(common, 'refs'));
    if (dirname(admin) !== join(common, 'worktrees') || !head.isFile() || head.isSymbolicLink()
      || !objects.isDirectory() || objects.isSymbolicLink() || !refs.isDirectory() || refs.isSymbolicLink()) return false;
    const backpointer = join(admin, 'gitdir');
    const back = lstatSync(backpointer);
    return back.isFile() && !back.isSymbolicLink()
      && realpathSync(readFileSync(backpointer, 'utf8').trim()) === realpathSync(pointer);
  } catch { return false; }
}

function isTemporary(path, managedRoot) {
  const absolute = realpathSync(path);
  if (isManagedTaskPath(absolute, managedRoot)) return false;
  return [tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].filter(existsSync).some((root) => {
    const normalized = realpathSync(root);
    return absolute === normalized || absolute.startsWith(normalized + sep);
  });
}

const ID_PATTERN = /^[\w.:@/-]{1,128}$/;
const NAME_PATTERN = /^[\w.-]{1,128}$/;

function readIdentityFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) throw new Error('Invalid identity file.');
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Herdr's context names the repository only. The task and the request live in the
// repo-harness task-agent session that owns this pane. A value that cannot be read, or
// that two open sessions both claim, is left out: this notice never guesses a task.
// Herdr's repo_key is a path. It only matches the session's repository_id here and never
// leaves this function; the payload names the repository by Herdr's repo_name.
function taskIdentity(data, context, session) {
  const key = context.worktree?.repo_key;
  const repoKey = typeof key === 'string' && key.length <= 1024 && !/[\u0000-\u001f]/.test(key) ? key : undefined;
  const name = context.worktree?.repo_name;
  const identity = { ...(typeof name === 'string' && NAME_PATTERN.test(name) ? { repository: name } : {}) };
  const root = context.worktree?.repo_root;
  if (typeof root !== 'string' || !isAbsolute(root)) return identity;
  try {
    const agents = join(root, '.ai/harness/runs/task-agents');
    if (!lstatSync(agents).isDirectory() || lstatSync(agents).isSymbolicLink()) return identity;
    const matches = [];
    for (const entry of readdirSync(agents, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const dir = join(agents, entry.name);
      let binding;
      try { binding = readIdentityFile(join(dir, 'binding.json')); } catch { continue; }
      if (binding?.runtime !== 'herdr' || binding.pane_id !== data.pane_id || binding.workspace_id !== data.workspace_id
        || binding.endpoint?.session !== session || (repoKey && binding.repository_id !== repoKey)
        || typeof binding.task !== 'string' || !ID_PATTERN.test(binding.task) || existsSync(join(dir, 'closed.json'))) continue;
      matches.push({ dir, binding });
    }
    if (matches.length !== 1) return identity;
    const { dir, binding } = matches[0];
    // Only the highest round names the current request. If it cannot be read, no request id is
    // reported: an earlier round would be a stale value.
    const rounds = readdirSync(dir).map((name) => Number(name.match(/^started-(\d+)\.json$/)?.[1])).filter(Number.isSafeInteger);
    let requestId;
    if (rounds.length) {
      try {
        const started = readIdentityFile(join(dir, `started-${Math.max(...rounds)}.json`));
        if (typeof started?.request_id === 'string' && ID_PATTERN.test(started.request_id)) requestId = started.request_id;
      } catch { /* Unreadable: leave the request id out. */ }
    }
    return { ...identity, task: binding.task, ...(requestId ? { request_id: requestId } : {}) };
  } catch { /* No readable session: report the repository alone. */ }
  return identity;
}

export async function notify(env = process.env, send = fetch, options = {}) {
  const event = objectJson(env.HERDR_PLUGIN_EVENT_JSON);
  const context = objectJson(env.HERDR_PLUGIN_CONTEXT_JSON);
  if (event.event !== 'pane_agent_status_changed') return;
  const data = event.data;
  if (!data || !['done', 'blocked'].includes(data.agent_status)) return;
  if (typeof data.pane_id !== 'string' || !data.pane_id || typeof data.workspace_id !== 'string') throw new Error('Invalid event identity.');
  const paths = [context.workspace_cwd, context.focused_pane_cwd, context.worktree?.path].filter((path) => typeof path === 'string' && path);
  if (!paths.length || paths.some((path) => !isAbsolute(path))) throw new Error('Workspace path is missing or invalid.');
  const managedRoot = realpathSync(options.managedRoot ?? systemWorktreeRoot(process.platform, tmpdir()));
  if (paths.some(path => isTemporary(path, managedRoot)) || String(context.workspace_label ?? '').startsWith('rh-herdr-')) return;
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
    tab_label: context.tab_label ?? null, ...taskIdentity(data, context, config.NOTIFY_SESSION), ts: new Date(now).toISOString(),
  };
  const trace = [payload.repository && `repo ${payload.repository}`, payload.task && `task ${payload.task}`,
    payload.request_id && `request ${payload.request_id}`].filter(Boolean).join(' · ');
  const where = [payload.workspace_label, payload.tab_label].filter(Boolean).join(' / ') || payload.workspace_id;
  const text = `Herdr ${payload.agent_status}: ${payload.display_agent || payload.agent || 'agent'} @ ${where}` +
    (payload.title ? `\n${payload.title}` : '') + `\npane ${payload.pane_id} · ${payload.host}` +
    (trace ? `\n${trace}` : '');
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
  // Shadow work starts only after all existing notification attempts finish.
  if (config.CLEF_MODE === 'shadow' && config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_API_TOKEN
    && data.agent_status === 'done' && ['claude', 'codex', 'pi'].includes(data.agent)) {
    try { await shadowDecision(env, config, data, send); }
    catch { log('Shadow record failed.'); }
  }
}

const runFile = promisify(execFile);
const SHADOW_LIMIT = 20 * 1024 * 1024;
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const MODELS = ['clef-flash', 'clef'];

// Fixed data-safety rules. These patterns never classify the pane outcome.
export function redactTail(text, config = {}) {
  let value = text.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  for (const [key, secret] of Object.entries(config)) {
    if (secret && /(?:TOKEN|KEY|URL|ACCOUNT_ID|CHAT_ID)$/.test(key)) value = value.replaceAll(secret, '[redacted]');
  }
  return value
    .replace(/\b[A-Z][A-Z0-9_]*(?:\s*=\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+)/gi, '[redacted]')
    .replace(/\bBearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g, '[redacted]')
    .replace(/\b[0-9a-fA-F]{32,}\b/g, '[redacted]')
    .replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, '[redacted]');
}

function boundedTail(raw, config) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  const redacted = redactTail(lines.slice(-120).join('\n'), config);
  const bytes = Buffer.from(redacted);
  // Avoid splitting a UTF-8 character at the start of the retained suffix.
  let start = Math.max(0, bytes.length - 16 * 1024);
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
  const tail = bytes.subarray(start).toString('utf8');
  return { tail, tail_lines: tail ? tail.split('\n').length : 0, tail_truncated: lines.length >= 120 || start > 0 };
}

function privateRead(path, limit) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > limit || stat.uid !== process.getuid?.()) throw new Error('Invalid shadow file.');
    fchmodSync(fd, 0o600);
    const bytes = Buffer.alloc(stat.size);
    let count = 0;
    while (count < bytes.length) {
      const read = readSync(fd, bytes, count, bytes.length - count, count);
      if (!read) throw new Error('Incomplete shadow file.');
      count += read;
    }
    return bytes.toString('utf8');
  } catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  finally { if (fd !== undefined) closeSync(fd); }
}

function privateWrite(path, text) {
  const temporary = `${path}-${randomUUID()}`;
  try {
    writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } finally { try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}

async function withShadowLock(dir, action) {
  const lock = join(dir, 'decision-shadow.lock');
  const deadline = Date.now() + 2000;
  for (;;) {
    try { mkdirSync(lock, { mode: 0o700 }); break; }
    catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  try { return action(); } finally { rmdirSync(lock); }
}

async function reserveCalls(dir, now) {
  return withShadowLock(dir, () => {
    const path = join(dir, 'decision-budget.json');
    const raw = privateRead(path, 1024);
    const day = new Date(now).toISOString().slice(0, 10);
    const saved = raw ? JSON.parse(raw) : { day, calls: 0 };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saved.day) || !Number.isSafeInteger(saved.calls)
      || saved.calls < 0 || saved.calls > 2000 || saved.day > day) throw new Error('Invalid call budget.');
    const count = saved.day === day ? saved.calls : 0;
    const allowed = Math.min(MODELS.length, 2000 - count);
    privateWrite(path, JSON.stringify({ day, calls: count + allowed }));
    return allowed;
  });
}

async function saveShadow(dir, record) {
  await withShadowLock(dir, () => {
    const path = join(dir, 'decision-shadow.jsonl');
    const raw = privateRead(path, SHADOW_LIMIT);
    const cutoff = Date.now() - RETENTION_MS;
    const lines = raw.split('\n').filter(Boolean).filter(line => {
      const ts = Date.parse(JSON.parse(line).ts);
      if (!Number.isFinite(ts)) throw new Error('Invalid shadow timestamp.');
      return ts >= cutoff;
    });
    lines.push(JSON.stringify(record));
    let size = lines.reduce((sum, line) => sum + Buffer.byteLength(line) + 1, 0);
    let start = 0;
    while (size > SHADOW_LIMIT && start < lines.length) size -= Buffer.byteLength(lines[start++]) + 1;
    privateWrite(path, lines.slice(start).join('\n') + '\n');
  });
}

async function saveRecord(env, record) {
  await saveShadow(env.HERDR_PLUGIN_STATE_DIR, record);
  privateWrite(join(env.HERDR_PLUGIN_CONFIG_DIR, 'decision-state.json'), JSON.stringify({ protocol: 1, state_dir: env.HERDR_PLUGIN_STATE_DIR }));
}

async function modelDecision(model, state, config, send) {
  const started = performance.now();
  const controller = new AbortController();
  let timer;
  try {
    const response = await Promise.race([
      (async () => {
        const reply = await send(`https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/cloudflare/${model}`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}` },
          body: JSON.stringify(paneStatusRequest(state, model)),
        });
        if (!reply.ok || reply.redirected) throw new Error('Clef unavailable.');
        const envelope = await reply.json();
        if (envelope?.success !== true) throw new Error('Clef unavailable.');
        return decodeClefAnswer(envelope.result, model);
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Clef timeout.')); }, 3000); }),
    ]);
    return { model, ...response, band: decisionBand(response), latency_ms: Math.round(performance.now() - started) };
  } catch { return { model, status: 'unavailable', latency_ms: Math.round(performance.now() - started) }; }
  finally { clearTimeout(timer); }
}

async function shadowDecision(env, config, data, send) {
  const record = {
    event_id: randomUUID(), ts: new Date().toISOString(), pane_id: data.pane_id,
    agent: data.agent, herdr_status: data.agent_status, policy_version: POLICY_VERSION,
    tail_sha256: null, tail: null, models: [],
  };
  let state;
  try {
    if (!/^[a-f0-9]{32}$/i.test(config.CLOUDFLARE_ACCOUNT_ID)) throw new Error('Invalid account id.');
    if (typeof env.HERDR_BIN_PATH !== 'string' || !isAbsolute(env.HERDR_BIN_PATH)) throw new Error('Herdr binary path is missing.');
    // Do not pass channel or Cloudflare secrets to the read-only Herdr child.
    const childEnv = { ...env };
    for (const key of Object.keys(childEnv)) if (key.startsWith('CLOUDFLARE_') || /^(WEBHOOK_|SLACK_|DISCORD_|TELEGRAM_)/.test(key)) delete childEnv[key];
    const raw = (await runFile(env.HERDR_BIN_PATH, ['pane', 'read', data.pane_id, '--source', 'recent', '--lines', '120'], {
        env: childEnv, encoding: 'utf8', timeout: 2000, maxBuffer: 1024 * 1024,
      })).stdout;
    state = { agent: data.agent, herdr_status: data.agent_status, pane_title: redactTail(String(data.title ?? ''), config).slice(0, 512), ...boundedTail(raw, config) };
    record.tail = state.tail;
    record.tail_sha256 = createHash('sha256').update(state.tail).digest('hex');
  } catch {
    record.models = MODELS.map(model => ({ model, status: 'unavailable' }));
    await saveRecord(env, record);
    return;
  }
  let allowed;
  try { allowed = await reserveCalls(env.HERDR_PLUGIN_STATE_DIR, Date.now()); }
  catch {
    record.models = MODELS.map(model => ({ model, status: 'unavailable' }));
    await saveRecord(env, record);
    return;
  }
  record.models = await Promise.all(MODELS.map((model, index) => index < allowed
    ? modelDecision(model, state, config, send) : { model, status: 'skipped_cap' }));
  await saveRecord(env, record);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  notify().catch(() => { log('Invalid config, event, or state.'); process.exitCode = 1; });
}
