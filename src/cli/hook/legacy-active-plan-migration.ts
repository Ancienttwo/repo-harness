import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { stripWrappingQuotes } from '../../core/state/artifact-parsers';
import { withStateLock } from '../../effects/state/state-lock';

const ACTIVE_PLAN_MARKER = '.ai/harness/active-plan';
const LEGACY_ACTIVE_PLAN_MARKER = '.claude/.active-plan';
const ACTIVE_WORKTREE_MARKER = '.ai/harness/active-worktree';

export interface LegacyActivePlanMigrationResult {
  readonly protocol: 1;
  readonly migrated: boolean;
  readonly legacy_path: typeof LEGACY_ACTIVE_PLAN_MARKER;
  readonly canonical_path: typeof ACTIVE_PLAN_MARKER;
  readonly plan: string | null;
}

function readMarker(cwd: string, relPath: string): string | null {
  try {
    const value = readFileSync(join(cwd, relPath), 'utf-8').trim();
    return value ? stripWrappingQuotes(value) : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Explicit one-shot migration; steady-state state resolution never reads legacy authority. */
export function migrateLegacyActivePlan(cwd = process.cwd()): LegacyActivePlanMigrationResult {
  return withStateLock(cwd, () => {
    const legacy = readMarker(cwd, LEGACY_ACTIVE_PLAN_MARKER);
    const canonical = readMarker(cwd, ACTIVE_PLAN_MARKER);
    if (!legacy) {
      return {
        protocol: 1,
        migrated: false,
        legacy_path: LEGACY_ACTIVE_PLAN_MARKER,
        canonical_path: ACTIVE_PLAN_MARKER,
        plan: canonical,
      };
    }

    const currentWorktree = canonicalPath(cwd);
    const owner = readMarker(cwd, ACTIVE_WORKTREE_MARKER);
    if (owner && canonicalPath(owner) !== currentWorktree) {
      throw new Error(`legacy active-plan migration blocked by foreign worktree owner: ${owner}`);
    }
    if (canonical && canonical !== legacy) {
      throw new Error(`legacy active-plan conflicts with canonical active-plan: ${legacy} != ${canonical}`);
    }
    if (!existsSync(join(cwd, legacy))) {
      throw new Error(`legacy active-plan points to missing plan: ${legacy}`);
    }

    mkdirSync(join(cwd, '.ai/harness'), { recursive: true });
    if (!canonical) {
      const target = join(cwd, ACTIVE_PLAN_MARKER);
      const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(temp, `${legacy}\n`);
      renameSync(temp, target);
    }
    if (!owner) writeFileSync(join(cwd, ACTIVE_WORKTREE_MARKER), `${currentWorktree}\n`);
    unlinkSync(join(cwd, LEGACY_ACTIVE_PLAN_MARKER));
    return {
      protocol: 1,
      migrated: true,
      legacy_path: LEGACY_ACTIVE_PLAN_MARKER,
      canonical_path: ACTIVE_PLAN_MARKER,
      plan: legacy,
    };
  });
}
