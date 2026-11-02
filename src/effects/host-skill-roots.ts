import { join } from 'path';
import { piAgentDir } from './pi-agent-dir';

/**
 * Host skill root rules. Every host skill writer derives its root here:
 * scripts/sync-codex-installed-copies.sh (through skill-surface-select.ts
 * profile-projection), the bundled and staged skill projections, the Herdr
 * skill, the Strategy Skill, and install ownership.
 */
export const SKILL_HOSTS = ['claude', 'codex', 'pi'] as const;
export type SkillHost = (typeof SKILL_HOSTS)[number];

export function hostSkillRoot(home: string, host: SkillHost, env: Readonly<Record<string, string | undefined>> = process.env): string {
  if (host === 'pi') return join(piAgentDir(home, env), 'skills');
  return join(home, `.${host}`, 'skills');
}

/** The Skills CLI staging root. Host roots link staged skills from here. */
export function stagedSkillRoot(home: string): string {
  return join(home, '.agents', 'skills');
}

/**
 * The Skills CLI global lock, by the provider's own rule (skills 1.7.4
 * getSkillLockPath): a non-empty XDG_STATE_HOME moves the lock out of
 * ~/.agents. Install snapshot, rollback, profile switch and uninstall use
 * this one path.
 */
export function providerSkillLockPath(home: string, env: Readonly<Record<string, string | undefined>>): string {
  return env.XDG_STATE_HOME ? join(env.XDG_STATE_HOME, 'skills', '.skill-lock.json') : join(home, '.agents', '.skill-lock.json');
}

export interface SyncSkillRoots {
  readonly pi: string | null;
  readonly codex: string;
  /** Null when an explicit CODEX_SKILLS_ROOT comes without CLAUDE_SKILLS_ROOT. */
  readonly claude: string | null;
  /** An explicit CODEX_SKILLS_ROOT selects copy mode unless the caller sets a mode. */
  readonly overridden: boolean;
}

function withoutTrailingSlash(root: string): string {
  return root.endsWith('/') ? root.slice(0, -1) : root;
}

/** The roots that the shell skill sync writes. An empty variable counts as unset. */
export function syncSkillRoots(env: Readonly<Record<string, string | undefined>>, home: string): SyncSkillRoots {
  const claudeOverride = env.CLAUDE_SKILLS_ROOT ? withoutTrailingSlash(env.CLAUDE_SKILLS_ROOT) : null;
  if (env.CODEX_SKILLS_ROOT) {
    return { codex: withoutTrailingSlash(env.CODEX_SKILLS_ROOT), claude: claudeOverride, pi: null, overridden: true };
  }
  return { codex: hostSkillRoot(home, 'codex'), claude: claudeOverride ?? hostSkillRoot(home, 'claude'), pi: env.REPO_HARNESS_INCLUDE_PI === '0' ? null : hostSkillRoot(home, 'pi', env), overridden: false };
}
