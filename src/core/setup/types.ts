// Public contract for GET /api/v1/setup. See
// plans/plan-20261010-0320-operator-console-kumo.md §8 for the authority table.
// Every value is a projection of one `repo-harness setup check` run (the
// `runInitHook` builder), the route registry, the skill catalog, or the
// packaged agent fleet. Values that have no authority are null; consumers must
// not infer them. Free text is redacted with `publicAgentConfigText`.

export const SETUP_PROJECTION = 'repo-harness.setup.v1' as const;

/** Same members and order as `RouteHost` (src/cli/hook/route-registry.ts). */
export const SETUP_HOSTS = ['claude', 'codex', 'pi'] as const;
export type SetupHost = typeof SETUP_HOSTS[number];
/** One value per host, always all three keys. */
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

export interface SetupHostFacts {
  host: SetupHost;
  /** False when setup check has no install check for this host (Pi today). Then every other field is null. */
  reported: boolean;
  /** Status of the `status.adapter.<host>` check. */
  adapter_check: SetupCheckStatus | null;
  /** The host was detected on this machine. */
  detected: boolean | null;
  /** Null when not reported or the host was not detected. */
  adapter: SetupAdapterFacts | null;
  /** Host CLI version only when setup check measured it (Codex today). */
  cli_version: string | null;
}

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
export const SETUP_HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SubagentStart', 'SubagentStop', 'Stop'] as const;
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

export interface SetupFleetRole {
  /** Frontmatter `name` of agents/fleet/<name>.md. */
  name: string;
  description: string | null;
  model: string | null;
  effort: string | null;
  /** From setup check `tooling.agent_fleet`; null when that host or role is not reported. */
  hosts: SetupPerHost<'installed' | 'missing' | null>;
}

export interface SetupSnapshotV1 {
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
  fleet: SetupFleetRole[];
}
