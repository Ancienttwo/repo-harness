import { join } from 'path';

/**
 * Host skill root rules. Every host skill writer derives its root here:
 * scripts/sync-codex-installed-copies.sh (through skill-surface-select.ts
 * profile-projection), the bundled and staged skill projections, the Herdr
 * skill, the Strategy and ChatGPT Skills, and install ownership.
 */
export type SkillHost = 'claude' | 'codex';

export function hostSkillRoot(home: string, host: SkillHost): string {
  return join(home, `.${host}`, 'skills');
}

/** The Skills CLI staging root. Host roots link staged skills from here. */
export function stagedSkillRoot(home: string): string {
  return join(home, '.agents', 'skills');
}

export interface SyncSkillRoots {
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
    return { codex: withoutTrailingSlash(env.CODEX_SKILLS_ROOT), claude: claudeOverride, overridden: true };
  }
  return { codex: hostSkillRoot(home, 'codex'), claude: claudeOverride ?? hostSkillRoot(home, 'claude'), overridden: false };
}
