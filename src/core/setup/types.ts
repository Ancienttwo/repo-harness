// Public contract for GET /api/v1/setup. See
// plans/plan-20261010-0320-operator-console-kumo.md §8 for the authority table.
// Every value is a projection of one `repo-harness setup check` run (the
// `runInitHook` builder), the route registry, the skill catalog, or the
// packaged agent fleet. Values that have no authority are null; consumers must
// not infer them. Free text is redacted with `publicAgentConfigText`.

export const SETUP_PROJECTION = 'repo-harness.setup.v2' as const;

/** Same members and order as `RouteHost` (src/cli/hook/route-registry.ts). */
export const SETUP_HOSTS = ['claude', 'codex', 'pi'] as const;
export type SetupHost = typeof SETUP_HOSTS[number];
/** One value per declared setup host. */
export type SetupPerHost<T> = { readonly [H in SetupHost]: T };

export const SETUP_SNAPSHOT_STATUSES = ['ready', 'stale', 'unavailable'] as const;
export type SetupSnapshotStatus = typeof SETUP_SNAPSHOT_STATUSES[number];

/**
 * Fixed reason codes. `collection_pending`: the first run has not finished.
 * The others name why the last run failed. A stale snapshot keeps the last
 * good data, and its `collected_at` gives the age of that data.
 */
export const SETUP_REASONS = ['collection_pending', 'setup_check_timeout', 'setup_check_failed', 'setup_check_invalid'] as const;
export type SetupReason = typeof SETUP_REASONS[number];

/** `InitHookCheckStatus` vocabulary. */
export const SETUP_CHECK_STATUSES = ['ok', 'warn', 'fail', 'na', 'needs_agent'] as const;
export type SetupCheckStatus = typeof SETUP_CHECK_STATUSES[number];
/** `InitHookStatus` vocabulary: the overall setup check result. */
export type SetupOverallStatus = 'ok' | 'attention' | 'blocked';

export interface SetupSummary {
  ok: number;
  warn: number;
  fail: number;
  na: number;
  needs_agent: number;
}

/** A setup check whose status is warn, fail or needs_agent (`ok` and `na` only count in the summary). */
export interface SetupCheck {
  /** Setup check id, e.g. `status.adapter.codex` or `doctor.skill-projection`. */
  id: string;
  status: 'warn' | 'fail' | 'needs_agent';
  /** The check title from setup check. */
  title: string;
  /** Redacted check detail. May be multi-line. */
  detail: string;
  /** Command of the agent action the builder attached to this check; null when none. The UI never runs it. */
  command: string | null;
}

/** `ManagedHookProjectionMismatchKind` and `ManagedHookProjectionField` vocabularies. Values are never exposed. */
export const SETUP_HOOK_MISMATCH_KINDS = ['missing', 'unexpected', 'duplicate', 'field-mismatch'] as const;
export const SETUP_HOOK_MISMATCH_FIELDS = ['event', 'matcher', 'type', 'command', 'timeout'] as const;
export interface SetupHookMismatch {
  kind: typeof SETUP_HOOK_MISMATCH_KINDS[number];
  event: string;
  route_id: string | null;
  field: typeof SETUP_HOOK_MISMATCH_FIELDS[number] | null;
}

/** Managed hook adapter facts from the setup check status report. */
export interface SetupAdapterFacts {
  /** repo-harness entries are present in the host config. */
  configured: boolean;
  managed_entries: number;
  expected_entries: number;
  /** Exact projection comparison; null when status did not inspect it. */
  projection: 'consistent' | 'drift' | null;
  mismatches: SetupHookMismatch[];
}

export type SetupHostFacts = {
  /** False when setup check has no install check for this host. Then every other field is null. */
  reported: boolean;
  /** Status of the `status.adapter.<host>` check. */
  adapter_check: SetupCheckStatus | null;
  /** The host was detected on this machine. */
  detected: boolean | null;
  /** Null when not reported or the host was not detected. */
  adapter: SetupAdapterFacts | null;
  /** Host CLI version only when setup check measured it. */
  cli_version: string | null;
} & ({ host: 'pi'; package_check: SetupCheckStatus | null } | { host: Exclude<SetupHost, 'pi'> });

/** The `skillProjectionState` vocabulary in src/cli/commands/doctor.ts. Link targets are never exposed. */
export const SKILL_PROJECTION_STATES = [
  'missing', 'dangling link', 'wrong link', 'ok link', 'invalid path type',
  'source missing', 'stale copy', 'unowned real directory', 'ok copy',
] as const;
export type SkillProjectionState = typeof SKILL_PROJECTION_STATES[number];

export interface SetupSkillHostRow {
  state: SkillProjectionState;
  /** False when the state is not an ok state or the install ledger records drift for this skill. */
  ok: boolean;
}

export interface SetupSkill {
  name: string;
  /** Catalog `summary` (assets/skill-commands/manifest.json); null when the catalog has no entry. */
  summary: string | null;
  /** Null when setup check has no expected projection of this skill on the host. */
  hosts: SetupPerHost<SetupSkillHostRow | null>;
}

/** `HookEvent` vocabulary, in route registry order. */
export const SETUP_HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'UserPromptSubmit', 'SubagentStart', 'Stop'] as const;
export type SetupHookEventName = typeof SETUP_HOOK_EVENTS[number];

export interface SetupHookRoute {
  route_id: string;
  /** Adapter tool matcher; null means every tool. */
  matcher: string | null;
  /** Hosts whose adapter installs this route. */
  hosts: SetupHost[];
}

/** Configured routes from `ROUTES`. Per-host managed entry status is `hosts[].adapter`. */
export interface SetupHookEvent {
  event: SetupHookEventName;
  routes: SetupHookRoute[];
}

/** Hook usage window: records older than this leave the counts. */
export const SETUP_HOOK_USAGE_WINDOW_HOURS = 24;
/** At most this many denials, newest first. */
export const SETUP_HOOK_DENIAL_LIMIT = 10;

/** Counts of one configured route on one host inside the usage window. */
export interface SetupHookRouteUsage {
  host: SetupHost;
  event: SetupHookEventName;
  route_id: string;
  calls: number;
  /** Calls that exited 2 or returned a deny decision. */
  blocked: number;
  last_blocked_at: string | null;
}

/** One guard denial from `.ai/harness/failures/latest.jsonl`. */
export interface SetupHookDenial {
  at: string;
  /** Guard name, e.g. `RepoScopeGuard`. */
  guard: string;
  /** Redacted denial reason. */
  reason: string;
}

/**
 * Hook usage of the collected repository from `.ai/harness/runs/hook-events.jsonl`
 * (counts) and `.ai/harness/failures/latest.jsonl` (denial text). Routes with no
 * call in the window are left out; records of routes the registry does not
 * declare are dropped.
 */
export interface SetupHookUsage {
  window_hours: typeof SETUP_HOOK_USAGE_WINDOW_HOURS;
  /** Route registry order, then host order. */
  routes: SetupHookRouteUsage[];
  recent_denials: SetupHookDenial[];
}

export interface SetupFleetRole {
  /** Frontmatter `name` of agents/fleet/<name>.md. */
  name: string;
  description: string | null;
  model: string | null;
  effort: string | null;
  /** From setup check `tooling.agent_fleet`; null when that host or role is not reported. */
  hosts: SetupPerHost<'installed' | 'missing' | null>;
}

export interface SetupSnapshotV2 {
  projection_version: typeof SETUP_PROJECTION;
  status: SetupSnapshotStatus;
  /** Null exactly when status is ready. */
  reason: SetupReason | null;
  /** When the shown data was collected; null when no run has succeeded. */
  collected_at: string | null;
  setup_status: SetupOverallStatus | null;
  summary: SetupSummary | null;
  checks: SetupCheck[];
  /** Always claude, codex, pi in that order when data is present. */
  hosts: SetupHostFacts[];
  /** Skills that setup check judged on at least one host, in setup check order. */
  skills: SetupSkill[];
  hooks: SetupHookEvent[];
  /** Null when there is no data, the collector found no repository root, or a hook log read failed. */
  hook_usage: SetupHookUsage | null;
  fleet: SetupFleetRole[];
}
