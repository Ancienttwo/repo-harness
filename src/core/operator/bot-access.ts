// Bot access projections (PRD G29). Every function here takes raw local data
// and keeps only bounded, typed fields: no token, passphrase, webhook URL,
// absolute path, stderr or environment value can pass through. A field that
// does not match its grammar becomes null or drops the row; it is never echoed.

import { NOTIFY_CHANNELS, NOTIFY_PLUGIN_ID, NOTIFY_STATUS_KEYS, NOTIFY_SESSION_REASONS, NOTIFY_UNAVAILABLE_REASONS, type NotifyChannelDeliveriesV1, type NotifyDeliveryState, type NotifyPresence, type NotifySessionReason, type NotifyStatusV1, type NotifyUnavailableReason } from './notify-status';

export type BotAccessUnavailable<Reason extends string> = { readonly state: 'unavailable'; readonly reason: Reason };

export interface McpDoctorProjection {
  readonly status: 'ready_local' | 'ready_user' | 'not_adopted';
  readonly package_version: string | null;
  readonly config_version_ok: boolean;
  readonly auth_mode: 'oauth' | 'bearer' | 'url-token' | 'missing';
  readonly auth_configured: boolean;
  readonly capabilities: {
    readonly workspace_reader: boolean;
    readonly workflow_planner: boolean;
    readonly workflow_executor: boolean;
    readonly workspace_coder: boolean;
  };
  readonly registered_repo_count: number;
  readonly allowed_root_count: number;
  readonly unsafe_allowed_root_count: number;
  readonly legacy_full_disk_read: boolean;
  readonly authorization_revision: number | null;
  readonly codex: { readonly cli_available: boolean; readonly configured: boolean };
  readonly chatgpt: { readonly server_name_configured: boolean; readonly public_endpoint_configured: boolean };
}

/**
 * The registered Bots that attribution reads (PRD G30). A record attributes
 * an MCP OAuth client, a Herdr agent name or an audit row to a Bot; it never
 * grants access.
 */
export interface BotIdentity {
  readonly bot_id: string;
  readonly name: string;
  readonly host: string;
  readonly mcp_client_id: string | null;
  readonly slack_bot_id: string | null;
  readonly herdr_agent: string | null;
}

export type BotDirectory = { readonly state: 'ok'; readonly bots: readonly BotIdentity[] } | { readonly state: 'unavailable' };

/** `unregistered` matches no registered Bot; `unavailable` means the registry could not be read, so no answer is known. */
export type BotAttribution = { readonly state: 'registered'; readonly bot_id: string } | { readonly state: 'unregistered' } | { readonly state: 'unavailable' };

export type BotProjection = BotIdentity;

export interface OAuthClientProjection {
  readonly client_id: string;
  readonly bot: BotAttribution;
  readonly issued_at: string | null;
  readonly profiles: readonly string[];
  /** The latest end of a live grant for this client: refresh expiry when present, else access expiry. */
  readonly expires_at: string | null;
}

export interface McpAuditProjection {
  readonly at: string;
  readonly tool: string;
  readonly status: 'ok' | 'blocked' | 'failed';
  readonly bot: BotAttribution;
}

export interface RegistryRepoProjection {
  readonly repo_id: string;
  readonly label: string | null;
  readonly access_mode: 'read_only' | 'read_write';
  readonly last_audit: { readonly state: 'ok'; readonly entry: McpAuditProjection } | { readonly state: 'missing' } | BotAccessUnavailable<'audit_unreadable'>;
}

export interface HerdrVersionProjection {
  readonly state: 'aligned' | 'mismatch';
  readonly expected: { readonly version: string; readonly protocol: number; readonly revision: string };
  readonly actual: { readonly version: string | null; readonly protocol: number | null };
}

export interface HerdrStatusProjection {
  readonly client: { readonly version: string | null; readonly protocol: number | null };
  readonly server: {
    readonly status: 'running' | 'not_running' | 'unknown';
    readonly version: HerdrVersionProjection | null;
    readonly restart_needed: boolean;
  };
}

export type HerdrAgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

export interface HerdrSnapshotProjection {
  readonly workspaces: number;
  readonly tabs: number;
  readonly panes: number;
  readonly agents: readonly { readonly pane_id: string; readonly agent: string | null; readonly name: string | null; readonly agent_status: HerdrAgentStatus; readonly bot: BotAttribution }[];
}

export interface BotAccessSnapshotV1 {
  readonly protocol: 1;
  readonly kind: 'operator_bot_access';
  readonly observed_at: string;
  readonly bots: { readonly state: 'ok'; readonly bots: readonly BotProjection[] } | BotAccessUnavailable<'bot_registry_invalid'>;
  readonly mcp: { readonly state: 'ok'; readonly doctor: McpDoctorProjection } | BotAccessUnavailable<'mcp_doctor_failed' | 'mcp_doctor_timeout' | 'mcp_doctor_invalid'>;
  readonly oauth: { readonly state: 'ok'; readonly clients: readonly OAuthClientProjection[]; readonly unreadable_clients: number }
    | { readonly state: 'missing' } | BotAccessUnavailable<'oauth_unreadable'>;
  readonly registry: { readonly state: 'ok'; readonly authorization_revision: number; readonly registry_revision: string; readonly repos: readonly RegistryRepoProjection[] }
    | BotAccessUnavailable<'registry_unavailable' | 'registry_invalid'>;
  readonly herdr: {
    readonly state: 'ok';
    readonly session: string;
    readonly status: { readonly state: 'ok'; readonly value: HerdrStatusProjection } | BotAccessUnavailable<'herdr_status_failed' | 'herdr_status_invalid'>;
    readonly snapshot: { readonly state: 'ok'; readonly value: HerdrSnapshotProjection } | BotAccessUnavailable<'herdr_not_running' | 'herdr_version_mismatch' | 'herdr_snapshot_failed'>;
  } | BotAccessUnavailable<NotifySessionReason>;
  readonly notify: {
    readonly state: 'ok';
    readonly status: NotifyStatusV1;
    readonly channels: Readonly<Record<'webhook' | 'slack' | 'discord' | 'telegram', NotifyPresence>>;
    readonly deliveries: NotifyChannelDeliveriesV1;
  } | BotAccessUnavailable<'notify_status_pending' | NotifyUnavailableReason>;
}

const VERSION_TEXT = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const NAME_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CLIENT_ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROFILE_TEXT = /^[a-z][a-z0-9_-]{0,31}$/;
const TOOL_TEXT = /^[a-z][a-z0-9_.-]{0,63}$/;
const BOT_ID_TEXT = /^[a-z][a-z0-9-]{0,62}$/;
const HERDR_AGENT_TEXT = /^[a-z][a-z0-9_-]{0,31}$/;
const HERDR_ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,63}$/;

type Json = Record<string, unknown>;
const object = (value: unknown): Json | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null;
const flag = (value: unknown): boolean => value === true;
const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const text = (value: unknown, grammar: RegExp): string | null => typeof value === 'string' && grammar.test(value) ? value : null;
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const one = <T extends string>(value: unknown, allowed: readonly T[]): T | null => allowed.includes(value as T) ? value as T : null;

/** The Bot whose `field` equals `value`. The registry keeps each identity on at most one Bot. */
export function attributeBot(directory: BotDirectory, field: 'bot_id' | 'mcp_client_id' | 'herdr_agent', value: string | null): BotAttribution {
  if (directory.state !== 'ok') return { state: 'unavailable' };
  const bot = value === null ? undefined : directory.bots.find(entry => entry[field] === value);
  return bot ? { state: 'registered', bot_id: bot.bot_id } : { state: 'unregistered' };
}

export function projectBots(directory: BotDirectory & { readonly state: 'ok' }): readonly BotProjection[] {
  return directory.bots.map(bot => ({
    bot_id: bot.bot_id, name: bot.name, host: bot.host, mcp_client_id: bot.mcp_client_id, slack_bot_id: bot.slack_bot_id, herdr_agent: bot.herdr_agent,
  })).sort((a, b) => a.bot_id.localeCompare(b.bot_id));
}

function seconds(value: unknown): string | null {
  const at = integer(value);
  if (at === null || at === 0 || at > 8_640_000_000_000) return null;
  return new Date(at * 1000).toISOString();
}

/** `repo-harness mcp doctor --json` output. Paths, endpoints and root lists are dropped; roots are counted. */
export function projectMcpDoctor(value: unknown): McpDoctorProjection {
  const report = object(value);
  const mcp = object(report?.mcp);
  const status = one(report?.status, ['ready_local', 'ready_user', 'not_adopted'] as const);
  if (!report || !mcp || status === null) throw new Error('mcp_doctor_invalid');
  const permissions = object(mcp.permissions), capabilities = object(mcp.capabilities);
  const codex = object(report.codex), chatgpt = object(report.chatgpt);
  return {
    status,
    package_version: text(mcp.packageVersion, VERSION_TEXT),
    config_version_ok: flag(mcp.configVersionOk),
    auth_mode: one(chatgpt?.authMode, ['oauth', 'bearer', 'url-token', 'missing'] as const) ?? 'missing',
    auth_configured: flag(mcp.authConfigured),
    capabilities: {
      workspace_reader: flag(capabilities?.workspaceReader),
      workflow_planner: flag(capabilities?.workflowPlanner),
      workflow_executor: flag(capabilities?.workflowExecutor),
      workspace_coder: flag(capabilities?.workspaceCoder),
    },
    registered_repo_count: count(permissions?.registeredRepoCount),
    allowed_root_count: count(permissions?.allowedRootCount),
    unsafe_allowed_root_count: Array.isArray(permissions?.unsafeAllowedRoots) ? permissions.unsafeAllowedRoots.length : 0,
    legacy_full_disk_read: flag(permissions?.legacyFullDiskReadDetected),
    authorization_revision: integer(mcp.authorizationRevision),
    codex: { cli_available: flag(codex?.cliAvailable), configured: flag(codex?.configured) },
    chatgpt: { server_name_configured: flag(chatgpt?.serverNameConfigured), public_endpoint_configured: flag(chatgpt?.publicEndpointConfigured) },
  };
}

/**
 * The MCP OAuth token store. Token strings are map keys and the stored grant
 * repeats them, so only client id, issue time, profile and expiry are read.
 */
export function projectOAuthClients(value: unknown, nowSeconds: number, directory: BotDirectory): { readonly clients: readonly OAuthClientProjection[]; readonly unreadable_clients: number } {
  const store = object(value);
  if (!store) throw new Error('oauth_unreadable');
  const grants = new Map<string, { profiles: Set<string>; expires: number | null }>();
  const grant = (clientId: string) => grants.get(clientId) ?? grants.set(clientId, { profiles: new Set(), expires: null }).get(clientId)!;
  const extend = (clientId: string, expires: number | null) => {
    const entry = grant(clientId);
    if (expires !== null && expires > nowSeconds && (entry.expires === null || expires > entry.expires)) entry.expires = expires;
  };
  // Live refresh tokens by access token, with their known expiries. A refresh record without an expiry is live.
  const refresh = new Map<string, number[]>();
  for (const raw of Object.values(object(store.refreshTokens) ?? {})) {
    const record = object(raw);
    const accessToken = typeof raw === 'string' ? raw : typeof record?.accessToken === 'string' ? record.accessToken : null;
    const expires = record?.expiresAt === undefined ? null : integer(record.expiresAt);
    if (accessToken === null || (record?.expiresAt !== undefined && (expires === null || expires <= nowSeconds))) continue;
    refresh.set(accessToken, [...refresh.get(accessToken) ?? [], ...expires === null ? [] : [expires]]);
  }
  // A grant is live while its access token or one of its refresh tokens is live, as in `listAuthorizations`.
  for (const [token, raw] of Object.entries(object(store.accessTokens) ?? {})) {
    const info = object(raw), clientId = text(info?.clientId, CLIENT_ID_TEXT);
    if (!info || clientId === null) continue;
    const expires = info.expiresAt === undefined ? null : integer(info.expiresAt);
    const accessLive = info.expiresAt === undefined || (expires !== null && expires > nowSeconds);
    const refreshes = refresh.get(token);
    if (!accessLive && refreshes === undefined) continue;
    grant(clientId).profiles.add(text(info.profile, PROFILE_TEXT) ?? 'planner');
    if (accessLive) extend(clientId, expires);
    for (const end of refreshes ?? []) extend(clientId, end);
  }
  const clients: OAuthClientProjection[] = [];
  let unreadable = 0;
  for (const [key, raw] of Object.entries(object(store.clients) ?? {})) {
    const client = object(raw), clientId = text(client?.client_id, CLIENT_ID_TEXT);
    if (!client || clientId === null || clientId !== key) { unreadable++; continue; }
    const entry = grants.get(clientId);
    clients.push({
      client_id: clientId,
      bot: attributeBot(directory, 'mcp_client_id', clientId),
      issued_at: seconds(client.client_id_issued_at),
      profiles: [...entry?.profiles ?? []].sort(),
      expires_at: entry?.expires == null ? null : seconds(entry.expires),
    });
  }
  return { clients: clients.sort((a, b) => a.client_id.localeCompare(b.client_id)), unreadable_clients: unreadable };
}

/**
 * One MCP audit JSONL row. Paths, hashes, errors and correlation ids are
 * dropped. `botId` names the Bot the writer resolved from the caller's OAuth
 * client; a row without one, or whose Bot is no longer registered, is
 * unregistered. A row marked `botLookup: unavailable` is unavailable.
 */
export function projectMcpAuditEntry(value: unknown, directory: BotDirectory): McpAuditProjection | null {
  const entry = object(value);
  const at = typeof entry?.timestamp === 'string' && !Number.isNaN(Date.parse(entry.timestamp)) ? new Date(entry.timestamp).toISOString() : null;
  const tool = text(entry?.tool, TOOL_TEXT);
  const status = one(entry?.status, ['ok', 'blocked', 'failed'] as const);
  if (at === null || tool === null || status === null) return null;
  // The writer marks a row whose registry lookup failed; that Bot is unknown, not unregistered.
  const bot: BotAttribution = entry?.botLookup === 'unavailable' ? { state: 'unavailable' } : attributeBot(directory, 'bot_id', text(entry?.botId, BOT_ID_TEXT));
  return { at, tool, status, bot };
}

/** A registry row: the repository id, the last path segment as a label, and the access mode. */
export function projectRegistryRepo(repo: { readonly id: string; readonly path: string; readonly accessMode: 'read_only' | 'read_write' },
  last_audit: RegistryRepoProjection['last_audit']): RegistryRepoProjection {
  const segment = repo.path.split(/[\\/]/u).filter(Boolean).pop();
  return { repo_id: repo.id, label: text(segment, NAME_TEXT), access_mode: repo.accessMode, last_audit };
}

/** `herdr status --json`. The binary path, socket path and session echo are dropped. */
export function projectHerdrStatus(value: unknown, check: (server: Json) => HerdrVersionProjection): HerdrStatusProjection {
  const status = object(value), client = object(status?.client), server = object(status?.server);
  if (!client || !server) throw new Error('herdr_status_invalid');
  const state = one(server.status, ['running', 'not_running'] as const) ?? 'unknown';
  return {
    client: { version: text(client.version, VERSION_TEXT), protocol: integer(client.protocol) },
    server: { status: state, version: state === 'running' ? check(server) : null, restart_needed: flag(server.restart_needed) || flag(object(status?.update)?.restart_needed) },
  };
}

/** `session.snapshot`. Only counts, agent pane states and the Bot that owns each agent name remain: no cwd, title, label or terminal text. */
export function projectHerdrSnapshot(value: unknown, directory: BotDirectory): HerdrSnapshotProjection {
  const snapshot = object(value);
  if (!snapshot || !['workspaces', 'tabs', 'panes', 'agents'].every(key => Array.isArray(snapshot[key]))) throw new Error('herdr_snapshot_invalid');
  const agents = (snapshot.agents as unknown[]).flatMap(raw => {
    const agent = object(raw), pane_id = text(agent?.pane_id, HERDR_ID_TEXT);
    if (pane_id === null) return [];
    // `agent` is the detected kind (claude, codex); `name` is the alias `herdr agent rename` set, which a Bot record names.
    const name = text(agent?.name, HERDR_AGENT_TEXT);
    return [{ pane_id, agent: text(agent?.agent, NAME_TEXT), name, agent_status: one(agent?.agent_status, ['idle', 'working', 'blocked', 'done', 'unknown'] as const) ?? 'unknown',
      bot: attributeBot(directory, 'herdr_agent', name) }];
  });
  return {
    workspaces: (snapshot.workspaces as unknown[]).length,
    tabs: (snapshot.tabs as unknown[]).length,
    panes: (snapshot.panes as unknown[]).length,
    agents: agents.sort((a, b) => a.pane_id.localeCompare(b.pane_id)),
  };
}

const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const HERDR_REVISION_TEXT = /^[0-9a-f]{40}$/u;
const SLACK_BOT_ID_TEXT = /^[A-Z][A-Z0-9]{2,31}$/u;
const BOT_HOST_TEXT = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/u;
const REPO_ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REVISION_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DELIVERY_STATES: readonly NotifyDeliveryState[] = ['succeeded', 'failed', 'unsupported', 'unavailable', 'missing'];

/**
 * The one strict decoder of `BotAccessSnapshotV1`, for the server before it
 * sends the cache and for the browser before it renders. Every object must have
 * exactly its fields, and every string its grammar; anything else throws.
 */
export function decodeBotAccessSnapshot(value: unknown): BotAccessSnapshotV1 {
  const fail = (what: string): never => { throw new Error(`bot access invalid: ${what}`); };
  const obj = (v: unknown, keys: readonly string[], what: string): Json => {
    const record = object(v);
    if (!record || Object.keys(record).sort().join(',') !== [...keys].sort().join(',')) return fail(what);
    return record;
  };
  const array = (v: unknown, what: string): unknown[] => (Array.isArray(v) ? v : fail(what));
  const match = (v: unknown, grammar: RegExp, what: string): string => (typeof v === 'string' && grammar.test(v) ? v : fail(what));
  const nullable = <T>(v: unknown, read: (x: unknown) => T): T | null => (v === null ? null : read(v));
  const oneOf = <T extends string>(v: unknown, values: readonly T[], what: string): T => (values.includes(v as T) ? v as T : fail(what));
  const bool = (v: unknown, what: string): boolean => (typeof v === 'boolean' ? v : fail(what));
  const whole = (v: unknown, what: string): number => (integer(v) ?? fail(what));
  /** A section is `{state:'ok', ...fields}`, one of `others`, or `{state:'unavailable', reason}` with an allowed reason. */
  const section = (v: unknown, what: string, fields: readonly string[], reasons: readonly string[], others: readonly string[] = []): Json => {
    const state = object(v)?.state;
    if (state === 'unavailable') { oneOf(obj(v, ['state', 'reason'], what).reason, reasons, `${what} reason`); return {}; }
    if (typeof state === 'string' && others.includes(state)) { obj(v, ['state'], what); return {}; }
    return state === 'ok' ? obj(v, ['state', ...fields], what) : fail(`${what} state`);
  };
  const attribution = (v: unknown, what: string): void => {
    const state = object(v)?.state;
    if (state === 'registered') match(obj(v, ['state', 'bot_id'], what).bot_id, BOT_ID_TEXT, what);
    else if (state === 'unregistered' || state === 'unavailable') obj(v, ['state'], what);
    else fail(what);
  };

  const v = obj(value, ['protocol', 'kind', 'observed_at', 'bots', 'mcp', 'oauth', 'registry', 'herdr', 'notify'], 'snapshot');
  if (v.protocol !== 1 || v.kind !== 'operator_bot_access') fail('protocol');
  match(v.observed_at, ISO_TIME, 'observed_at');

  const bots = section(v.bots, 'bots', ['bots'], ['bot_registry_invalid']);
  if (bots.bots !== undefined) {
    for (const raw of array(bots.bots, 'bots')) {
      const bot = obj(raw, ['bot_id', 'name', 'host', 'mcp_client_id', 'slack_bot_id', 'herdr_agent'], 'bot');
      match(bot.bot_id, BOT_ID_TEXT, 'bot_id');
      if (typeof bot.name !== 'string' || bot.name.length === 0 || bot.name.length > 64 || bot.name.trim() !== bot.name || /[\x00-\x1f\x7f]/u.test(bot.name)) fail('bot name');
      match(bot.host, BOT_HOST_TEXT, 'bot host');
      nullable(bot.mcp_client_id, x => match(x, CLIENT_ID_TEXT, 'bot mcp_client_id'));
      nullable(bot.slack_bot_id, x => match(x, SLACK_BOT_ID_TEXT, 'bot slack_bot_id'));
      nullable(bot.herdr_agent, x => match(x, HERDR_AGENT_TEXT, 'bot herdr_agent'));
    }
  }

  const mcp = section(v.mcp, 'mcp', ['doctor'], ['mcp_doctor_failed', 'mcp_doctor_timeout', 'mcp_doctor_invalid']);
  if (mcp.doctor !== undefined) {
    const d = obj(mcp.doctor, ['status', 'package_version', 'config_version_ok', 'auth_mode', 'auth_configured', 'capabilities', 'registered_repo_count',
      'allowed_root_count', 'unsafe_allowed_root_count', 'legacy_full_disk_read', 'authorization_revision', 'codex', 'chatgpt'], 'doctor');
    oneOf(d.status, ['ready_local', 'ready_user', 'not_adopted'] as const, 'doctor status');
    nullable(d.package_version, x => match(x, VERSION_TEXT, 'doctor package_version'));
    oneOf(d.auth_mode, ['oauth', 'bearer', 'url-token', 'missing'] as const, 'doctor auth_mode');
    for (const key of ['config_version_ok', 'auth_configured', 'legacy_full_disk_read'] as const) bool(d[key], `doctor ${key}`);
    for (const key of ['registered_repo_count', 'allowed_root_count', 'unsafe_allowed_root_count'] as const) whole(d[key], `doctor ${key}`);
    nullable(d.authorization_revision, x => whole(x, 'doctor authorization_revision'));
    const capabilities = obj(d.capabilities, ['workspace_reader', 'workflow_planner', 'workflow_executor', 'workspace_coder'], 'doctor capabilities');
    for (const flagValue of Object.values(capabilities)) bool(flagValue, 'doctor capability');
    for (const flagValue of Object.values(obj(d.codex, ['cli_available', 'configured'], 'doctor codex'))) bool(flagValue, 'doctor codex');
    for (const flagValue of Object.values(obj(d.chatgpt, ['server_name_configured', 'public_endpoint_configured'], 'doctor chatgpt'))) bool(flagValue, 'doctor chatgpt');
  }

  const oauth = section(v.oauth, 'oauth', ['clients', 'unreadable_clients'], ['oauth_unreadable'], ['missing']);
  if (oauth.clients !== undefined) {
    whole(oauth.unreadable_clients, 'oauth unreadable_clients');
    for (const raw of array(oauth.clients, 'oauth clients')) {
      const client = obj(raw, ['client_id', 'bot', 'issued_at', 'profiles', 'expires_at'], 'oauth client');
      match(client.client_id, CLIENT_ID_TEXT, 'client_id');
      attribution(client.bot, 'client bot');
      nullable(client.issued_at, x => match(x, ISO_TIME, 'client issued_at'));
      nullable(client.expires_at, x => match(x, ISO_TIME, 'client expires_at'));
      for (const profile of array(client.profiles, 'client profiles')) match(profile, PROFILE_TEXT, 'client profile');
    }
  }

  const registry = section(v.registry, 'registry', ['authorization_revision', 'registry_revision', 'repos'], ['registry_unavailable', 'registry_invalid']);
  if (registry.repos !== undefined) {
    whole(registry.authorization_revision, 'registry authorization_revision');
    match(registry.registry_revision, REVISION_DIGEST, 'registry_revision');
    for (const raw of array(registry.repos, 'registry repos')) {
      const repo = obj(raw, ['repo_id', 'label', 'access_mode', 'last_audit'], 'registry repo');
      match(repo.repo_id, REPO_ID_TEXT, 'repo_id');
      nullable(repo.label, x => match(x, NAME_TEXT, 'repo label'));
      oneOf(repo.access_mode, ['read_only', 'read_write'] as const, 'repo access_mode');
      const audit = section(repo.last_audit, 'last_audit', ['entry'], ['audit_unreadable'], ['missing']);
      if (audit.entry !== undefined) {
        const entry = obj(audit.entry, ['at', 'tool', 'status', 'bot'], 'audit entry');
        match(entry.at, ISO_TIME, 'audit at');
        match(entry.tool, TOOL_TEXT, 'audit tool');
        oneOf(entry.status, ['ok', 'blocked', 'failed'] as const, 'audit status');
        attribution(entry.bot, 'audit bot');
      }
    }
  }

  // Without an install record there is no session to ask, so the section is unavailable as a whole.
  const herdr = section(v.herdr, 'herdr', ['session', 'status', 'snapshot'], NOTIFY_SESSION_REASONS);
  if (herdr.session !== undefined) {
    match(herdr.session, NAME_TEXT, 'herdr session');
    const status = section(herdr.status, 'herdr status', ['value'], ['herdr_status_failed', 'herdr_status_invalid']);
    if (status.value !== undefined) {
      const value = obj(status.value, ['client', 'server'], 'herdr status value');
      const client = obj(value.client, ['version', 'protocol'], 'herdr client');
      nullable(client.version, x => match(x, VERSION_TEXT, 'herdr client version'));
      nullable(client.protocol, x => whole(x, 'herdr client protocol'));
      const server = obj(value.server, ['status', 'version', 'restart_needed'], 'herdr server');
      const running = oneOf(server.status, ['running', 'not_running', 'unknown'] as const, 'herdr server status') === 'running';
      bool(server.restart_needed, 'herdr restart_needed');
      if ((server.version === null) === running) fail('herdr server version');
      nullable(server.version, x => {
        const version = obj(x, ['state', 'expected', 'actual'], 'herdr version');
        oneOf(version.state, ['aligned', 'mismatch'] as const, 'herdr version state');
        const expected = obj(version.expected, ['version', 'protocol', 'revision'], 'herdr expected');
        match(expected.version, VERSION_TEXT, 'herdr expected version');
        whole(expected.protocol, 'herdr expected protocol');
        match(expected.revision, HERDR_REVISION_TEXT, 'herdr expected revision');
        const actual = obj(version.actual, ['version', 'protocol'], 'herdr actual');
        nullable(actual.version, y => match(y, VERSION_TEXT, 'herdr actual version'));
        nullable(actual.protocol, y => whole(y, 'herdr actual protocol'));
        return version;
      });
    }
    const snapshot = section(herdr.snapshot, 'herdr snapshot', ['value'], ['herdr_not_running', 'herdr_version_mismatch', 'herdr_snapshot_failed']);
    if (snapshot.value !== undefined) {
      const value = obj(snapshot.value, ['workspaces', 'tabs', 'panes', 'agents'], 'herdr snapshot value');
      for (const key of ['workspaces', 'tabs', 'panes'] as const) whole(value[key], `herdr ${key}`);
      for (const raw of array(value.agents, 'herdr agents')) {
        const agent = obj(raw, ['pane_id', 'agent', 'name', 'agent_status', 'bot'], 'herdr agent');
        match(agent.pane_id, HERDR_ID_TEXT, 'herdr pane_id');
        nullable(agent.agent, x => match(x, NAME_TEXT, 'herdr agent kind'));
        nullable(agent.name, x => match(x, HERDR_AGENT_TEXT, 'herdr agent name'));
        oneOf(agent.agent_status, ['idle', 'working', 'blocked', 'done', 'unknown'] as const, 'herdr agent_status');
        attribution(agent.bot, 'herdr agent bot');
      }
    }
  }

  const notify = section(v.notify, 'notify', ['status', 'channels', 'deliveries'], ['notify_status_pending', ...NOTIFY_UNAVAILABLE_REASONS]);
  if (notify.status !== undefined) {
    // Checked in place, like every other section: the decoder returns `value`, so a key it does not name must fail here.
    const status = obj(notify.status, ['protocol', 'kind', 'plugin_id', 'linked', 'enabled', 'config', 'last_delivery', 'observed_at'], 'notify status');
    if (status.protocol !== 1) fail('notify status protocol');
    oneOf(status.kind, ['operator_notify_status'] as const, 'notify status kind');
    oneOf(status.plugin_id, [NOTIFY_PLUGIN_ID] as const, 'notify plugin_id');
    oneOf(status.linked, ['linked', 'missing'] as const, 'notify linked');
    oneOf(status.enabled, ['enabled', 'disabled', 'missing'] as const, 'notify enabled');
    for (const presence of Object.values(obj(status.config, NOTIFY_STATUS_KEYS, 'notify config'))) oneOf(presence, ['configured', 'missing'] as const, 'notify config presence');
    const last = obj(status.last_delivery, ['at', 'result'], 'notify last_delivery');
    nullable(last.at, x => match(x, ISO_TIME, 'notify last_delivery at'));
    oneOf(last.result, DELIVERY_STATES, 'notify last_delivery result');
    match(status.observed_at, ISO_TIME, 'notify observed_at');
    const channels = obj(notify.channels, NOTIFY_CHANNELS, 'notify channels');
    for (const presence of Object.values(channels)) oneOf(presence, ['configured', 'missing'] as const, 'notify channel');
    const deliveries = obj(notify.deliveries, NOTIFY_CHANNELS, 'notify deliveries');
    for (const raw of Object.values(deliveries)) {
      const delivery = obj(raw, ['at', 'result'], 'notify delivery');
      nullable(delivery.at, x => match(x, ISO_TIME, 'notify delivery at'));
      oneOf(delivery.result, DELIVERY_STATES, 'notify delivery result');
    }
  }
  return value as BotAccessSnapshotV1;
}
