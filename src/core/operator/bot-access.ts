// Bot access projections (PRD G29). Every function here takes raw local data
// and keeps only bounded, typed fields: no token, passphrase, webhook URL,
// absolute path, stderr or environment value can pass through. A field that
// does not match its grammar becomes null or drops the row; it is never echoed.

import type { NotifyPresence, NotifyStatusV1 } from './notify-status';

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

export interface OAuthClientProjection {
  readonly client_id: string;
  readonly issued_at: string | null;
  readonly profiles: readonly string[];
  /** The latest end of a live grant for this client: refresh expiry when present, else access expiry. */
  readonly expires_at: string | null;
}

export interface McpAuditProjection {
  readonly at: string;
  readonly tool: string;
  readonly status: 'ok' | 'blocked' | 'failed';
  readonly actor: string | null;
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
  readonly agents: readonly { readonly pane_id: string; readonly agent: string | null; readonly agent_status: HerdrAgentStatus }[];
}

export interface BotAccessSnapshotV1 {
  readonly protocol: 1;
  readonly kind: 'operator_bot_access';
  readonly observed_at: string;
  readonly mcp: { readonly state: 'ok'; readonly doctor: McpDoctorProjection } | BotAccessUnavailable<'mcp_doctor_failed' | 'mcp_doctor_timeout' | 'mcp_doctor_invalid'>;
  readonly oauth: { readonly state: 'ok'; readonly clients: readonly OAuthClientProjection[]; readonly unreadable_clients: number }
    | { readonly state: 'missing' } | BotAccessUnavailable<'oauth_unreadable'>;
  readonly registry: { readonly state: 'ok'; readonly authorization_revision: number; readonly registry_revision: string; readonly repos: readonly RegistryRepoProjection[] }
    | BotAccessUnavailable<'registry_unavailable' | 'registry_invalid'>;
  readonly herdr: {
    readonly session: string;
    readonly status: { readonly state: 'ok'; readonly value: HerdrStatusProjection } | BotAccessUnavailable<'herdr_status_failed' | 'herdr_status_invalid'>;
    readonly snapshot: { readonly state: 'ok'; readonly value: HerdrSnapshotProjection } | BotAccessUnavailable<'herdr_not_running' | 'herdr_version_mismatch' | 'herdr_snapshot_failed'>;
  };
  readonly notify: {
    readonly state: 'ok';
    readonly status: NotifyStatusV1;
    readonly channels: Readonly<Record<'webhook' | 'slack' | 'discord' | 'telegram', NotifyPresence>>;
  } | BotAccessUnavailable<'notify_status_failed'>;
}

const VERSION_TEXT = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const NAME_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CLIENT_ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROFILE_TEXT = /^[a-z][a-z0-9_-]{0,31}$/;
const TOOL_TEXT = /^[a-z][a-z0-9_.-]{0,63}$/;
const ACTOR_TEXT = /^mcp:[a-z][a-z0-9_-]{0,31}$/;
const HERDR_ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,63}$/;

type Json = Record<string, unknown>;
const object = (value: unknown): Json | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null;
const flag = (value: unknown): boolean => value === true;
const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const text = (value: unknown, grammar: RegExp): string | null => typeof value === 'string' && grammar.test(value) ? value : null;
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const one = <T extends string>(value: unknown, allowed: readonly T[]): T | null => allowed.includes(value as T) ? value as T : null;

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
export function projectOAuthClients(value: unknown, nowSeconds: number): { readonly clients: readonly OAuthClientProjection[]; readonly unreadable_clients: number } {
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
      issued_at: seconds(client.client_id_issued_at),
      profiles: [...entry?.profiles ?? []].sort(),
      expires_at: entry?.expires == null ? null : seconds(entry.expires),
    });
  }
  return { clients: clients.sort((a, b) => a.client_id.localeCompare(b.client_id)), unreadable_clients: unreadable };
}

/** One MCP audit JSONL row. Paths, hashes, errors and correlation ids are dropped. */
export function projectMcpAuditEntry(value: unknown): McpAuditProjection | null {
  const entry = object(value);
  const at = typeof entry?.timestamp === 'string' && !Number.isNaN(Date.parse(entry.timestamp)) ? new Date(entry.timestamp).toISOString() : null;
  const tool = text(entry?.tool, TOOL_TEXT);
  const status = one(entry?.status, ['ok', 'blocked', 'failed'] as const);
  if (at === null || tool === null || status === null) return null;
  return { at, tool, status, actor: text(entry?.actor, ACTOR_TEXT) };
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

/** `session.snapshot`. Only counts and agent pane states remain: no cwd, title, label or terminal text. */
export function projectHerdrSnapshot(value: unknown): HerdrSnapshotProjection {
  const snapshot = object(value);
  if (!snapshot || !['workspaces', 'tabs', 'panes', 'agents'].every(key => Array.isArray(snapshot[key]))) throw new Error('herdr_snapshot_invalid');
  const agents = (snapshot.agents as unknown[]).flatMap(raw => {
    const agent = object(raw), pane_id = text(agent?.pane_id, HERDR_ID_TEXT);
    if (pane_id === null) return [];
    return [{ pane_id, agent: text(agent?.agent, NAME_TEXT), agent_status: one(agent?.agent_status, ['idle', 'working', 'blocked', 'done', 'unknown'] as const) ?? 'unknown' }];
  });
  return {
    workspaces: (snapshot.workspaces as unknown[]).length,
    tabs: (snapshot.tabs as unknown[]).length,
    panes: (snapshot.panes as unknown[]).length,
    agents: agents.sort((a, b) => a.pane_id.localeCompare(b.pane_id)),
  };
}
