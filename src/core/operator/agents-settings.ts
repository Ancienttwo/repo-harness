// Public contracts for the agent settings (G6, G9): the `agents` section of
// `~/.repo-harness/config.json`, the installation probe the setup collector
// runs, and GET/POST /api/v1/settings/agents. The server and the browser use
// these decoders; each one rejects unknown fields.

export const AGENT_USES = ['docs', 'review'] as const;
export type AgentUse = typeof AGENT_USES[number];

const RUNTIME_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const REVISION = /^(?:absent|sha256:[0-9a-f]{64})$/u;

/** The `agents` section. Absent means nothing is enabled. */
export interface AgentsConfigV1 {
  readonly enabled: readonly string[];
  readonly uses: { readonly docs: readonly string[]; readonly review: readonly string[] };
  readonly default_docs: string | null;
}

export const EMPTY_AGENTS_CONFIG: AgentsConfigV1 = Object.freeze({
  enabled: Object.freeze([]),
  uses: Object.freeze({ docs: Object.freeze([]), review: Object.freeze([]) }),
  default_docs: null,
});

/**
 * Where a runtime comes from. `default`: OAR's default registry. `community`:
 * a runtime the host adds to its own registry. `host_dependency`: a runtime
 * that needs an optional package repo-harness does not install.
 */
export const AGENT_RUNTIME_GROUPS = ['default', 'community', 'host_dependency'] as const;
export type AgentRuntimeGroup = typeof AGENT_RUNTIME_GROUPS[number];

/**
 * The public reading of OAR's `InstallationSnapshot`. The probed command path
 * and shadowed copies are never published. `dependency_missing` names the
 * optional package that is not installed; `host_setup_required` means the
 * runtime needs host-owned storage that repo-harness does not configure.
 */
export type AgentRuntimeInstallationV1 =
  | { readonly kind: 'available'; readonly via: 'executable' | 'bundled'; readonly version: string | null }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unsupported'; readonly reason: string }
  | { readonly kind: 'dependency_missing'; readonly package: string }
  | { readonly kind: 'host_setup_required' }
  | { readonly kind: 'probe_failed' };

export interface AgentRuntimeProbeEntryV1 {
  readonly id: string;
  readonly group: AgentRuntimeGroup;
  readonly installation: AgentRuntimeInstallationV1;
}

/** One probe cycle, written by the setup collector's probe child. */
export interface AgentRuntimeProbeV1 {
  readonly protocol: 1;
  readonly kind: 'agent_runtime_probe';
  readonly collected_at: string;
  readonly entries: readonly AgentRuntimeProbeEntryV1[];
}

/**
 * OAR decides steer and withdraw by the members of an open session, never by
 * runtime name, so before a session opens they are `session`. Every session
 * has `abort`, so stopping the turn is always `available`.
 */
export interface AgentRuntimeCapabilitiesV1 {
  readonly stop: 'available';
  readonly steer: 'session';
  readonly withdraw: 'session';
}

export const AGENT_RUNTIME_CAPABILITIES: AgentRuntimeCapabilitiesV1 = Object.freeze({ stop: 'available', steer: 'session', withdraw: 'session' });

export interface AgentRuntimeSettingsEntryV1 extends AgentRuntimeProbeEntryV1 {
  readonly review_supported: boolean;
  readonly capabilities: AgentRuntimeCapabilitiesV1;
}

export const AGENT_RUNTIMES_STATUSES = ['ready', 'stale', 'unavailable'] as const;
export type AgentRuntimesStatus = typeof AGENT_RUNTIMES_STATUSES[number];
export const AGENT_RUNTIMES_REASONS = ['collection_pending', 'probe_timeout', 'probe_failed', 'probe_invalid'] as const;
export type AgentRuntimesReason = typeof AGENT_RUNTIMES_REASONS[number];

/** The probe cache as the collector holds it: the last good probe, or why there is none. */
export type AgentRuntimesCacheV1 =
  | { readonly status: 'ready'; readonly probe: AgentRuntimeProbeV1 }
  | { readonly status: 'stale'; readonly reason: AgentRuntimesReason; readonly probe: AgentRuntimeProbeV1 }
  | { readonly status: 'unavailable'; readonly reason: AgentRuntimesReason };

/** GET /api/v1/settings/agents. */
export interface AgentsSettingsV1 {
  readonly protocol: 1;
  readonly kind: 'operator_agents_settings';
  readonly config: AgentsConfigV1 & { readonly revision: string };
  readonly runtimes: {
    readonly status: AgentRuntimesStatus;
    readonly reason: AgentRuntimesReason | null;
    readonly collected_at: string | null;
    readonly entries: readonly AgentRuntimeSettingsEntryV1[];
  };
}

/** One runtime's new state in a POST. `uses` replaces that runtime's uses. */
export interface AgentsSettingsChangeV1 {
  readonly runtime: string;
  readonly enabled: boolean;
  readonly uses: readonly AgentUse[];
}

/** POST /api/v1/settings/agents without `request_id`. Absent `default_docs_runtime` keeps the default; null clears it. */
export interface AgentsSettingsRequestV1 {
  readonly expected_revision: string;
  readonly changes: readonly AgentsSettingsChangeV1[];
  readonly default_docs_runtime?: string | null;
}

/** POST success. `changed_keys` names the config keys whose value changed. */
export interface AgentsSettingsResultV1 {
  readonly config_revision: string;
  readonly changed_keys: readonly string[];
}

function invalid(code: string): never {
  throw new Error(code);
}

function object(value: unknown, keys: readonly string[], optional: readonly string[] = [], code = 'agents_settings_invalid'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(code);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!keys.includes(key) && !optional.includes(key)) invalid(code);
  for (const key of keys) if (!(key in record)) invalid(code);
  return record;
}

function text(value: unknown, code: string): string {
  return typeof value === 'string' ? value : invalid(code);
}

function runtimeId(value: unknown, code: string): string {
  return typeof value === 'string' && RUNTIME_ID.test(value) ? value : invalid(code);
}

/** A sorted list of distinct runtime ids. Sorted order keeps the config bytes, and so the revision, stable. */
function runtimeIds(value: unknown, code: string): readonly string[] {
  if (!Array.isArray(value)) invalid(code);
  const ids = value.map(item => runtimeId(item, code));
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1]! >= id)) invalid(code);
  return ids;
}

/**
 * The stored `agents` section. Every runtime in `uses` is enabled, and the
 * default docs runtime is one of the docs runtimes. The review list is checked
 * where it is written, against the review host's list.
 */
export function decodeAgentsConfig(value: unknown): AgentsConfigV1 {
  const code = 'agents_config_invalid';
  const record = object(value, ['enabled', 'uses', 'default_docs'], [], code);
  const enabled = runtimeIds(record.enabled, code);
  const uses = object(record.uses, ['docs', 'review'], [], code);
  const docs = runtimeIds(uses.docs, code);
  const review = runtimeIds(uses.review, code);
  const defaultDocs = record.default_docs === null ? null : runtimeId(record.default_docs, code);
  if ([...docs, ...review].some(id => !enabled.includes(id))) invalid(code);
  if (defaultDocs !== null && !docs.includes(defaultDocs)) invalid(code);
  return { enabled, uses: { docs, review }, default_docs: defaultDocs };
}

function decodeInstallation(value: unknown): AgentRuntimeInstallationV1 {
  const code = 'agent_runtime_probe_invalid';
  const kind = object(value, ['kind'], ['via', 'version', 'reason', 'package'], code).kind;
  switch (kind) {
    case 'available': {
      const record = object(value, ['kind', 'via', 'version'], [], code);
      if (record.via !== 'executable' && record.via !== 'bundled') invalid(code);
      return { kind, via: record.via, version: record.version === null ? null : text(record.version, code) };
    }
    case 'unsupported':
      return { kind, reason: text(object(value, ['kind', 'reason'], [], code).reason, code) };
    case 'dependency_missing':
      return { kind, package: text(object(value, ['kind', 'package'], [], code).package, code) };
    case 'not_found':
    case 'host_setup_required':
    case 'probe_failed':
      object(value, ['kind'], [], code);
      return { kind };
    default:
      return invalid(code);
  }
}

function decodeProbeEntry(value: unknown, extra: readonly string[] = []): AgentRuntimeProbeEntryV1 & Record<string, unknown> {
  const code = 'agent_runtime_probe_invalid';
  const record = object(value, ['id', 'group', 'installation', ...extra], [], code);
  if (!AGENT_RUNTIME_GROUPS.includes(record.group as AgentRuntimeGroup)) invalid(code);
  return { ...record, id: runtimeId(record.id, code), group: record.group as AgentRuntimeGroup, installation: decodeInstallation(record.installation) };
}

function distinctIds(entries: readonly { readonly id: string }[], code: string): void {
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) invalid(code);
}

export function decodeAgentRuntimeProbe(value: unknown): AgentRuntimeProbeV1 {
  const code = 'agent_runtime_probe_invalid';
  const record = object(value, ['protocol', 'kind', 'collected_at', 'entries'], [], code);
  if (record.protocol !== 1 || record.kind !== 'agent_runtime_probe' || !Array.isArray(record.entries)) invalid(code);
  const entries = record.entries.map(entry => {
    const { id, group, installation } = decodeProbeEntry(entry);
    return { id, group, installation };
  });
  distinctIds(entries, code);
  return { protocol: 1, kind: 'agent_runtime_probe', collected_at: text(record.collected_at, code), entries };
}

export function decodeAgentsSettings(value: unknown): AgentsSettingsV1 {
  const code = 'agents_settings_invalid';
  const record = object(value, ['protocol', 'kind', 'config', 'runtimes'], [], code);
  if (record.protocol !== 1 || record.kind !== 'operator_agents_settings') invalid(code);
  const config = object(record.config, ['revision', 'enabled', 'uses', 'default_docs'], [], code);
  const revision = text(config.revision, code);
  if (!REVISION.test(revision)) invalid(code);
  const { revision: _revision, ...section } = config;
  const runtimes = object(record.runtimes, ['status', 'reason', 'collected_at', 'entries'], [], code);
  if (!AGENT_RUNTIMES_STATUSES.includes(runtimes.status as AgentRuntimesStatus)) invalid(code);
  if (runtimes.reason !== null && !AGENT_RUNTIMES_REASONS.includes(runtimes.reason as AgentRuntimesReason)) invalid(code);
  if ((runtimes.status === 'ready') !== (runtimes.reason === null)) invalid(code);
  if (runtimes.collected_at !== null && typeof runtimes.collected_at !== 'string') invalid(code);
  if (!Array.isArray(runtimes.entries)) invalid(code);
  const entries = runtimes.entries.map((entry) => {
    const decoded = decodeProbeEntry(entry, ['review_supported', 'capabilities']);
    if (typeof decoded.review_supported !== 'boolean') invalid(code);
    const capabilities = object(decoded.capabilities, ['stop', 'steer', 'withdraw'], [], code);
    if (capabilities.stop !== 'available' || capabilities.steer !== 'session' || capabilities.withdraw !== 'session') invalid(code);
    return { id: decoded.id, group: decoded.group, installation: decoded.installation, review_supported: decoded.review_supported, capabilities: AGENT_RUNTIME_CAPABILITIES };
  });
  distinctIds(entries, code);
  return {
    protocol: 1,
    kind: 'operator_agents_settings',
    config: { revision, ...decodeAgentsConfig(section) },
    runtimes: {
      status: runtimes.status as AgentRuntimesStatus,
      reason: runtimes.reason as AgentRuntimesReason | null,
      collected_at: runtimes.collected_at as string | null,
      entries,
    },
  };
}

/** The closed POST body without `request_id`. A runtime may appear in one change only. */
export function decodeAgentsSettingsRequest(fields: Readonly<Record<string, unknown>>): AgentsSettingsRequestV1 {
  const code = 'agents_settings_request_invalid';
  const record = object(fields, ['expected_revision', 'changes'], ['default_docs_runtime'], code);
  const expected = text(record.expected_revision, code);
  if (!REVISION.test(expected) || !Array.isArray(record.changes)) invalid(code);
  const changes = record.changes.map((value) => {
    const change = object(value, ['runtime', 'enabled', 'uses'], [], code);
    if (typeof change.enabled !== 'boolean' || !Array.isArray(change.uses)) invalid(code);
    const uses = change.uses.map(use => (AGENT_USES.includes(use as AgentUse) ? use as AgentUse : invalid(code)));
    if (new Set(uses).size !== uses.length) invalid(code);
    return { runtime: runtimeId(change.runtime, code), enabled: change.enabled, uses };
  });
  if (new Set(changes.map(change => change.runtime)).size !== changes.length) invalid(code);
  if (!('default_docs_runtime' in record)) return { expected_revision: expected, changes };
  const defaultDocs = record.default_docs_runtime === null ? null : runtimeId(record.default_docs_runtime, code);
  return { expected_revision: expected, changes, default_docs_runtime: defaultDocs };
}

export function decodeAgentsSettingsResult(value: unknown): AgentsSettingsResultV1 {
  const code = 'agents_settings_result_invalid';
  const record = object(value, ['config_revision', 'changed_keys'], [], code);
  const revision = text(record.config_revision, code);
  if (!REVISION.test(revision) || !Array.isArray(record.changed_keys)) invalid(code);
  return { config_revision: revision, changed_keys: record.changed_keys.map(key => text(key, code)) };
}
