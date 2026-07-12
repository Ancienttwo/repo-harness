/**
 * Target abstraction for the repo-harness hook-runtime installer.
 *
 * Each host (Codex CLI, Claude Code) implements AgentTarget so the
 * installer orchestrator can write the right hook config without
 * baking host-specific paths into core code. Adding a new host =
 * one new file in targets/ + one entry in registry.ts.
 *
 * Modeled after _ref/codegraph/src/installer/targets/types.ts:15,51-62
 * but scoped to hook-runtime installation (Codex hooks.json + Claude
 * settings.json), not MCP server registration.
 */

export type Location = 'global' | 'local';

/**
 * Stable id for the --target CLI flag and registry lookup.
 * Phase 1 supports codex + claude only; more hosts can be added in
 * Phase 2+ by appending to this union and registry.ts.
 */
export type TargetId = 'codex' | 'claude';

export interface DetectionResult {
  installed: boolean;
  alreadyConfigured: boolean;
  /** Path inspected; surfaced in diagnostic / dry-run output. */
  configPath?: string;
}

/**
 * What target.install(location) actually changed on disk. The
 * orchestrator renders one log line per file using `action`.
 *
 * `unchanged` means the file content already matched what we'd write
 * — used for byte-identical idempotent re-runs.
 */
export interface WriteResult {
  files: Array<{
    path: string;
    action: 'created' | 'updated' | 'unchanged' | 'removed' | 'not-found' | 'kept';
  }>;
  /**
   * Optional short one-liner notes the orchestrator surfaces verbatim
   * — e.g. "Restart Codex to register the hook trust hash." Keep these
   * short; long-form goes in README / Phase 1E docs.
   */
  notes?: string[];
}

/**
 * Reserved for Phase 1B/1C install/migrate flags (dry-run, force, etc.).
 * Phase 1A keeps the parameter shape but ships no flags so call sites
 * don't have to change later.
 */
export interface InstallOptions {
  profile?: import('./install-profile').InstallProfile;
}

export interface AgentTarget {
  readonly id: TargetId;
  readonly displayName: string;
  readonly docsUrl?: string;
  /**
   * Whether this target supports the given install location. Codex
   * returns false for 'local' (no project-local hook concept verified
   * Phase 0 2026-05-28); Claude returns true for both.
   */
  supportsLocation(loc: Location): boolean;
  detect(loc: Location): DetectionResult;
  install(loc: Location, opts: InstallOptions): WriteResult;
  uninstall(loc: Location): WriteResult;
  /** Filesystem paths this target would write to at this location. */
  describePaths(loc: Location): string[];
}
