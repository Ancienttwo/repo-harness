// Bot access projections (PRD G29). Every function here takes raw local data
// and keeps only bounded, typed fields: no token, passphrase, webhook URL,
// absolute path, stderr or environment value can pass through. A field that
// does not match its grammar becomes null or drops the row; it is never echoed.

import { decodeReaders } from '../evidence/decode-readers';
import { HC_VERSION_TEXT, type HcVersionCheck } from '../terminal/herdr-pin';
import { NOTIFY_CHANNELS } from '../decision/notify-relay-record';
import { NOTIFY_STATUS_KEYS, NOTIFY_UNAVAILABLE_REASONS, type NotifyChannelDeliveriesV1, type NotifyDeliveryState, type NotifyPresence, type NotifyStatusV1, type NotifyUnavailableReason } from './notify-status';

export type BotAccessUnavailable<Reason extends string> = { readonly state: 'unavailable'; readonly reason: Reason };

export interface McpDoctorProjection {
  readonly status: 'ready_local' | 'ready_user' | 'not_adopted';
  readonly package_version: string | null;
  readonly config_version_ok: boolean;
  readonly capabilities: {
    readonly workspace_reader: boolean;
    readonly workflow_planner: boolean;
    readonly workflow_executor: boolean;
  };
  readonly registered_repo_count: number;
  readonly allowed_root_count: number;
  readonly unsafe_allowed_root_count: number;
  readonly legacy_full_disk_read: boolean;
}

/**
 * The registered Bots that attribution reads (PRD G30). A record attributes
 * an audit row to a Bot; it never grants access.
 */
export interface BotIdentity {
  readonly bot_id: string;
  readonly name: string;
  readonly host: string;
  readonly slack_bot_id: string | null;
  readonly herdr_agent: string | null;
}

export type BotDirectory = { readonly state: 'ok'; readonly bots: readonly BotIdentity[] } | { readonly state: 'unavailable' };

/** `unregistered` matches no registered Bot; `unavailable` means the registry could not be read, so no answer is known. */
export type BotAttribution = { readonly state: 'registered'; readonly bot_id: string } | { readonly state: 'unregistered' } | { readonly state: 'unavailable' };

export type BotProjection = BotIdentity;

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

export type HcTerminalStatus = 'idle' | 'working' | 'blocked' | 'done' | 'error' | 'unknown';

/** One repo-harness task-session terminal: its hc address, name and status word. No cwd, title, argv or terminal text. */
export interface HcTerminalProjection { readonly address: string; readonly name: string | null; readonly status: HcTerminalStatus }

export type HcSectionReason = 'hc_missing' | 'hc_unreachable';

export interface BotAccessSnapshotV1 {
  readonly protocol: 2;
  readonly kind: 'operator_bot_access';
  readonly observed_at: string;
  readonly bots: { readonly state: 'ok'; readonly bots: readonly BotProjection[] } | BotAccessUnavailable<'bot_registry_invalid'>;
  readonly mcp: { readonly state: 'ok'; readonly doctor: McpDoctorProjection } | BotAccessUnavailable<'mcp_doctor_failed' | 'mcp_doctor_timeout' | 'mcp_doctor_invalid'>;
  readonly registry: { readonly state: 'ok'; readonly authorization_revision: number; readonly registry_revision: string; readonly repos: readonly RegistryRepoProjection[] }
    | BotAccessUnavailable<'registry_unavailable' | 'registry_invalid'>;
  /** The core that the server's environment selects. A core below the pin answers, but its terminals are not read. */
  readonly hc: {
    readonly state: 'ok';
    readonly version: { readonly state: 'ok'; readonly value: HcVersionCheck };
    /** Herdr.app has no pin yet. */
    readonly herdr_app: { readonly state: 'not_pinned' };
    readonly terminals: { readonly state: 'ok'; readonly value: readonly HcTerminalProjection[] }
      | BotAccessUnavailable<'hc_version_mismatch' | 'hc_terminals_failed'>;
  } | BotAccessUnavailable<HcSectionReason>;
  readonly notify: {
    readonly state: 'ok';
    readonly status: NotifyStatusV1;
    readonly channels: Readonly<Record<'webhook' | 'slack' | 'discord' | 'telegram', NotifyPresence>>;
    readonly deliveries: NotifyChannelDeliveriesV1;
  } | BotAccessUnavailable<'notify_status_pending' | NotifyUnavailableReason>;
}

const VERSION_TEXT = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const NAME_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TOOL_TEXT = /^[a-z][a-z0-9_.-]{0,63}$/;
const BOT_ID_TEXT = /^[a-z][a-z0-9-]{0,62}$/;
const HERDR_AGENT_TEXT = /^[a-z][a-z0-9_-]{0,31}$/;
/** hc's terminal address on one core (see `herdr-core.ts`). */
const HC_ADDRESS_TEXT = /^t[1-9][0-9bcdfghjkmnpqrstvwxyz]{0,6}$/;
const HC_STATUSES: readonly HcTerminalStatus[] = ['idle', 'working', 'blocked', 'done', 'error', 'unknown'];

type Json = Record<string, unknown>;
const object = (value: unknown): Json | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : null;
const flag = (value: unknown): boolean => value === true;
const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const text = (value: unknown, grammar: RegExp): string | null => typeof value === 'string' && grammar.test(value) ? value : null;
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const one = <T extends string>(value: unknown, allowed: readonly T[]): T | null => allowed.includes(value as T) ? value as T : null;

/** The Bot whose `field` equals `value`. The registry keeps each identity on at most one Bot. */
export function attributeBot(directory: BotDirectory, field: 'bot_id', value: string | null): BotAttribution {
  if (directory.state !== 'ok') return { state: 'unavailable' };
  const bot = value === null ? undefined : directory.bots.find(entry => entry[field] === value);
  return bot ? { state: 'registered', bot_id: bot.bot_id } : { state: 'unregistered' };
}

export function projectBots(directory: BotDirectory & { readonly state: 'ok' }): readonly BotProjection[] {
  return directory.bots.map(bot => ({
    bot_id: bot.bot_id, name: bot.name, host: bot.host, slack_bot_id: bot.slack_bot_id, herdr_agent: bot.herdr_agent,
  })).sort((a, b) => a.bot_id.localeCompare(b.bot_id));
}

/** `repo-harness mcp doctor --json` output. Paths, endpoints and root lists are dropped; roots are counted. */
export function projectMcpDoctor(value: unknown): McpDoctorProjection {
  const report = object(value);
  const mcp = object(report?.mcp);
  const status = one(report?.status, ['ready_local', 'ready_user', 'not_adopted'] as const);
  if (!report || !mcp || status === null) throw new Error('mcp_doctor_invalid');
  const permissions = object(mcp.permissions), capabilities = object(mcp.capabilities);
  return {
    status,
    package_version: text(mcp.packageVersion, VERSION_TEXT),
    config_version_ok: flag(mcp.configVersionOk),
    capabilities: {
      workspace_reader: flag(capabilities?.workspaceReader),
      workflow_planner: flag(capabilities?.workflowPlanner),
      workflow_executor: flag(capabilities?.workflowExecutor),
    },
    registered_repo_count: count(permissions?.registeredRepoCount),
    allowed_root_count: count(permissions?.allowedRootCount),
    unsafe_allowed_root_count: Array.isArray(permissions?.unsafeAllowedRoots) ? permissions.unsafeAllowedRoots.length : 0,
    legacy_full_disk_read: flag(permissions?.legacyFullDiskReadDetected),
  };
}

/**
 * One MCP audit JSONL row. Paths, hashes, errors and correlation ids are
 * dropped. Only rows written before #1354 carry `botId` (resolved from an
 * HTTP OAuth client); a row without one, or whose Bot is no longer
 * registered, is unregistered. A row marked `botLookup: unavailable` is
 * unavailable.
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

/** A task-session terminal from hc. A status word outside hc's five, or no status report, is unknown. */
export function projectHcTerminal(terminal: { readonly address: string; readonly name: string | null; readonly status: { readonly state: string } | null }): HcTerminalProjection {
  return { address: terminal.address, name: text(terminal.name, NAME_TEXT),
    status: one(terminal.status?.state, ['idle', 'working', 'blocked', 'done', 'error'] as const) ?? 'unknown' };
}

const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const SLACK_BOT_ID_TEXT = /^[A-Z][A-Z0-9]{2,31}$/u;
const BOT_HOST_TEXT = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/u;
const REPO_ID_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const REVISION_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const DELIVERY_STATES: readonly NotifyDeliveryState[] = ['succeeded', 'failed', 'unavailable', 'missing'];

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
  // `obj` returns `Json` and fails with a bare `what`; `oneOf` has no string
  // check, so both stay local.
  const { array, match, nullable, bool } = decodeReaders(fail);
  const oneOf = <T extends string>(v: unknown, values: readonly T[], what: string): T => (values.includes(v as T) ? v as T : fail(what));
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

  const v = obj(value, ['protocol', 'kind', 'observed_at', 'bots', 'mcp', 'registry', 'hc', 'notify'], 'snapshot');
  if (v.protocol !== 2 || v.kind !== 'operator_bot_access') fail('protocol');
  match(v.observed_at, ISO_TIME, 'observed_at');

  const bots = section(v.bots, 'bots', ['bots'], ['bot_registry_invalid']);
  if (bots.bots !== undefined) {
    for (const raw of array(bots.bots, 'bots')) {
      const bot = obj(raw, ['bot_id', 'name', 'host', 'slack_bot_id', 'herdr_agent'], 'bot');
      match(bot.bot_id, BOT_ID_TEXT, 'bot_id');
      if (typeof bot.name !== 'string' || bot.name.length === 0 || bot.name.length > 64 || bot.name.trim() !== bot.name || /[\x00-\x1f\x7f]/u.test(bot.name)) fail('bot name');
      match(bot.host, BOT_HOST_TEXT, 'bot host');
      nullable(bot.slack_bot_id, x => match(x, SLACK_BOT_ID_TEXT, 'bot slack_bot_id'));
      nullable(bot.herdr_agent, x => match(x, HERDR_AGENT_TEXT, 'bot herdr_agent'));
    }
  }

  const mcp = section(v.mcp, 'mcp', ['doctor'], ['mcp_doctor_failed', 'mcp_doctor_timeout', 'mcp_doctor_invalid']);
  if (mcp.doctor !== undefined) {
    const d = obj(mcp.doctor, ['status', 'package_version', 'config_version_ok', 'capabilities', 'registered_repo_count',
      'allowed_root_count', 'unsafe_allowed_root_count', 'legacy_full_disk_read'], 'doctor');
    oneOf(d.status, ['ready_local', 'ready_user', 'not_adopted'] as const, 'doctor status');
    nullable(d.package_version, x => match(x, VERSION_TEXT, 'doctor package_version'));
    for (const key of ['config_version_ok', 'legacy_full_disk_read'] as const) bool(d[key], `doctor ${key}`);
    for (const key of ['registered_repo_count', 'allowed_root_count', 'unsafe_allowed_root_count'] as const) whole(d[key], `doctor ${key}`);
    const capabilities = obj(d.capabilities, ['workspace_reader', 'workflow_planner', 'workflow_executor'], 'doctor capabilities');
    for (const flagValue of Object.values(capabilities)) bool(flagValue, 'doctor capability');
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

  const hc = section(v.hc, 'hc', ['version', 'herdr_app', 'terminals'], ['hc_missing', 'hc_unreachable']);
  if (hc.version !== undefined) {
    // The floor ships in the package, so the version section has no unavailable reason.
    const check = obj(section(hc.version, 'hc version', ['value'], []).value, ['state', 'expected', 'actual'], 'hc version value');
    const state = oneOf(check.state, ['aligned', 'mismatch'] as const, 'hc version state');
    match(obj(check.expected, ['min_version'], 'hc expected').min_version, HC_VERSION_TEXT, 'hc min_version');
    match(obj(check.actual, ['version'], 'hc actual').version, HC_VERSION_TEXT, 'hc actual version');
    if (obj(hc.herdr_app, ['state'], 'herdr_app').state !== 'not_pinned') fail('herdr_app state');
    const terminals = section(hc.terminals, 'hc terminals', ['value'], ['hc_version_mismatch', 'hc_terminals_failed']);
    // Terminals are read only from a core at or above the pin; each unavailable reason names one version state.
    const expected = { aligned: 'hc_terminals_failed', mismatch: 'hc_version_mismatch' }[state];
    if (terminals.value !== undefined ? state !== 'aligned' : object(hc.terminals)?.reason !== expected) fail('hc terminals state');
    if (terminals.value !== undefined) {
      for (const raw of array(terminals.value, 'hc terminals value')) {
        const terminal = obj(raw, ['address', 'name', 'status'], 'hc terminal');
        match(terminal.address, HC_ADDRESS_TEXT, 'hc terminal address');
        nullable(terminal.name, x => match(x, NAME_TEXT, 'hc terminal name'));
        oneOf(terminal.status, HC_STATUSES, 'hc terminal status');
      }
    }
  }

  const notify = section(v.notify, 'notify', ['status', 'channels', 'deliveries'], ['notify_status_pending', ...NOTIFY_UNAVAILABLE_REASONS]);
  if (notify.status !== undefined) {
    // Checked in place, like every other section: the decoder returns `value`, so a key it does not name must fail here.
    const status = obj(notify.status, ['protocol', 'kind', 'relay', 'config', 'last_delivery', 'observed_at'], 'notify status');
    if (status.protocol !== 2) fail('notify status protocol');
    oneOf(status.kind, ['operator_notify_status'] as const, 'notify status kind');
    oneOf(status.relay, ['live'] as const, 'notify relay');
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
