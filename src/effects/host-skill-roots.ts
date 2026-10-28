import { join } from 'path';

/**
 * Host skill root rules. Every host skill writer derives its root here:
 * scripts/sync-codex-installed-copies.sh (through skill-surface-select.ts
 * profile-projection), the bundled and staged skill projections, the Herdr
 * skill, the Strategy and ChatGPT Skills, and install ownership.
 */
export type SkillHost = 'claude' | 'codex' | 'pi';

type SkillRootEnv = Readonly<Record<string, string | undefined>>;

/**
 * Pi reads user skills from `<agent-dir>/skills`. `PI_CODING_AGENT_DIR` is
 * Pi's own agent directory setting; an empty variable counts as unset.
 */
export function hostSkillRoot(home: string, host: SkillHost, env: SkillRootEnv): string {
  if (host === 'pi') return join(env.PI_CODING_AGENT_DIR || join(home, '.pi', 'agent'), 'skills');
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
  /** Null when an explicit CODEX_SKILLS_ROOT comes without PI_CODING_AGENT_DIR. */
  readonly pi: string | null;
  /** An explicit CODEX_SKILLS_ROOT selects copy mode unless the caller sets a mode. */
  readonly overridden: boolean;
}

function withoutTrailingSlash(root: string): string {
  return root.endsWith('/') ? root.slice(0, -1) : root;
}

/** The roots that the shell skill sync writes. An empty variable counts as unset. */
export function syncSkillRoots(env: SkillRootEnv, home: string): SyncSkillRoots {
  const claudeOverride = env.CLAUDE_SKILLS_ROOT ? withoutTrailingSlash(env.CLAUDE_SKILLS_ROOT) : null;
  const piRoot = hostSkillRoot(home, 'pi', env);
  if (env.CODEX_SKILLS_ROOT) {
    return {
      codex: withoutTrailingSlash(env.CODEX_SKILLS_ROOT),
      claude: claudeOverride,
      pi: env.PI_CODING_AGENT_DIR ? piRoot : null,
      overridden: true,
    };
  }
  return {
    codex: hostSkillRoot(home, 'codex', env),
    claude: claudeOverride ?? hostSkillRoot(home, 'claude', env),
    pi: piRoot,
    overridden: false,
  };
}
