// Pure projection of one setup check build into the public setup snapshot.
// Callers supply already-read inputs; this module has no filesystem or process
// access. Machine-state text (check title, detail, command, hook mismatch
// event) passes through `publicAgentConfigText`. Package-owned text (catalog
// summaries, fleet frontmatter, route ids and matchers) is public and is copied
// verbatim; the decoder still rejects a path-like value there.

import { publicAgentConfigText } from '../operator/agent-config';
import {
  SETUP_HOOK_EVENTS,
  SETUP_HOSTS,
  SETUP_PROJECTION,
  type SetupCheck,
  type SetupCheckStatus,
  type SetupFleetRole,
  type SetupHookEvent,
  type SetupHookMismatch,
  type SetupHost,
  type SetupHostFacts,
  type SetupOverallStatus,
  type SetupSkill,
  type SetupSnapshotV1,
  type SetupSummary,
  type SkillProjectionState,
} from './types';

export interface SetupRawCheck {
  readonly id: string;
  readonly title: string;
  readonly status: SetupCheckStatus;
  readonly detail: string;
}

/** One `StatusReport.targets` entry. */
export interface SetupRawAdapter {
  readonly id: string;
  readonly installed: boolean;
  readonly alreadyConfigured: boolean;
  readonly managedEntryCount: number;
  readonly expectedEntryCount: number;
  readonly projection?: {
    readonly status: 'consistent' | 'drift';
    readonly mismatches: readonly { readonly kind: SetupHookMismatch['kind']; readonly event: string; readonly routeId?: string; readonly field?: SetupHookMismatch['field'] }[];
  };
}

export interface SetupRawSkillRow {
  readonly host: SetupHost;
  readonly name: string;
  readonly state: SkillProjectionState;
  readonly ok: boolean;
}

/** One `ROUTES` entry. */
export interface SetupRawRoute {
  readonly event: string;
  readonly routeId: string;
  readonly matcher?: string;
  readonly hosts?: readonly SetupHost[];
}

/** `parseFrontmatter` output of one agents/fleet/*.md file. */
export interface SetupRawFleetRole {
  readonly name: string | undefined;
  readonly description: string | undefined;
  readonly model: string | undefined;
  readonly effort: string | undefined;
}

export interface SetupProjectionInput {
  readonly collected_at: string;
  readonly setup_status: SetupOverallStatus;
  readonly summary: SetupSummary;
  readonly checks: readonly SetupRawCheck[];
  /** Check id -> command of the action the builder attached to it. */
  readonly check_commands: ReadonlyMap<string, string | undefined>;
  readonly adapters: readonly SetupRawAdapter[];
  readonly cli_versions: Partial<Record<SetupHost, string>>;
  /** Null when the skill projection check produced no judgments. */
  readonly skill_rows: readonly SetupRawSkillRow[] | null;
  readonly skill_summaries: ReadonlyMap<string, string>;
  readonly routes: readonly SetupRawRoute[];
  readonly fleet_roles: readonly SetupRawFleetRole[];
  /** `tooling.tools.agent_fleet.hosts` exactly as the tooling report gave it. */
  readonly fleet_hosts: unknown;
}

const redact = (text: string): string => publicAgentConfigText(text);
/** Package-owned text: verbatim, trimmed, null when absent. */
const packageText = (text: string | undefined): string | null =>
  (text === undefined || text.trim() === '' ? null : text.trim());

function hostFacts(host: SetupHost, input: SetupProjectionInput, checks: ReadonlyMap<string, SetupRawCheck>): SetupHostFacts {
  const check = checks.get(`status.adapter.${host}`);
  const entry = input.adapters.find(adapter => adapter.id === host);
  if (check === undefined || entry === undefined) {
    return { host, reported: false, adapter_check: null, detected: null, adapter: null, cli_version: null };
  }
  return {
    host,
    reported: true,
    adapter_check: check.status,
    detected: entry.installed,
    adapter: entry.installed
      ? {
        configured: entry.alreadyConfigured,
        managed_entries: entry.managedEntryCount,
        expected_entries: entry.expectedEntryCount,
        projection: entry.projection?.status ?? null,
        mismatches: (entry.projection?.mismatches ?? []).map(mismatch => ({
          kind: mismatch.kind,
          event: redact(mismatch.event),
          route_id: mismatch.routeId ?? null,
          field: mismatch.field ?? null,
        })),
      }
      : null,
    cli_version: input.cli_versions[host] ?? null,
  };
}

function skills(input: SetupProjectionInput): SetupSkill[] {
  const byName = new Map<string, { -readonly [H in SetupHost]: SetupSkill['hosts'][H] }>();
  for (const row of input.skill_rows ?? []) {
    const hosts = byName.get(row.name) ?? { claude: null, codex: null, pi: null };
    hosts[row.host] = { state: row.state, ok: row.ok };
    byName.set(row.name, hosts);
  }
  return [...byName].map(([name, hosts]) => ({ name, summary: packageText(input.skill_summaries.get(name)), hosts }));
}

function hooks(routes: readonly SetupRawRoute[]): SetupHookEvent[] {
  return SETUP_HOOK_EVENTS
    .map(event => ({
      event,
      routes: routes.filter(route => route.event === event).map(route => ({
        route_id: route.routeId,
        matcher: route.matcher ?? null,
        hosts: SETUP_HOSTS.filter(host => route.hosts === undefined || route.hosts.includes(host)),
      })),
    }))
    .filter(event => event.routes.length > 0);
}

/** Reads `{ <host>: { installed_agents: string[], missing_agents: string[] } }`; anything else reports nothing for that host. */
function fleetMembership(value: unknown): Map<SetupHost, { installed: Set<string>; missing: Set<string> }> {
  const out = new Map<SetupHost, { installed: Set<string>; missing: Set<string> }>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const strings = (list: unknown): string[] | null =>
    (Array.isArray(list) && list.every(item => typeof item === 'string') ? list as string[] : null);
  for (const host of SETUP_HOSTS) {
    const entry = (value as Record<string, unknown>)[host];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const installed = strings((entry as Record<string, unknown>).installed_agents);
    const missing = strings((entry as Record<string, unknown>).missing_agents);
    if (installed !== null && missing !== null) out.set(host, { installed: new Set(installed), missing: new Set(missing) });
  }
  return out;
}

function fleet(input: SetupProjectionInput): SetupFleetRole[] {
  const membership = fleetMembership(input.fleet_hosts);
  const seen = new Set<string>();
  const roles: SetupFleetRole[] = [];
  for (const role of input.fleet_roles) {
    if (role.name === undefined || seen.has(role.name)) continue;
    seen.add(role.name);
    const state = (host: SetupHost): 'installed' | 'missing' | null => {
      const facts = membership.get(host);
      if (facts?.installed.has(role.name!)) return 'installed';
      if (facts?.missing.has(role.name!)) return 'missing';
      return null;
    };
    roles.push({
      name: role.name,
      description: packageText(role.description),
      model: packageText(role.model),
      effort: packageText(role.effort),
      hosts: { claude: state('claude'), codex: state('codex'), pi: state('pi') },
    });
  }
  return roles;
}

export function projectSetupSnapshot(input: SetupProjectionInput): SetupSnapshotV1 {
  const checks = new Map(input.checks.map(check => [check.id, check]));
  const problems: SetupCheck[] = [];
  for (const check of input.checks) {
    if (check.status === 'ok' || check.status === 'na') continue;
    const command = input.check_commands.get(check.id);
    problems.push({
      id: check.id,
      status: check.status,
      title: redact(check.title),
      detail: redact(check.detail),
      command: command === undefined || command.trim() === '' ? null : redact(command.trim()),
    });
  }
  return {
    projection_version: SETUP_PROJECTION,
    status: 'ready',
    reason: null,
    collected_at: input.collected_at,
    setup_status: input.setup_status,
    summary: { ...input.summary },
    checks: problems,
    hosts: SETUP_HOSTS.map(host => hostFacts(host, input, checks)),
    skills: skills(input),
    hooks: hooks(input.routes),
    fleet: fleet(input),
  };
}
