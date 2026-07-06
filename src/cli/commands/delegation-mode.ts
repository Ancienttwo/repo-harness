/**
 * Global Codex delegation-mode config — the write side of layer (1) in the
 * delegation-advisor hook's resolution order: (1) this file's
 * `delegation.mode` in `~/.repo-harness/config.json` wins; (2) repo
 * `.ai/harness/policy.json` `delegation.mode`; (3) default "explicit". This
 * module only owns persisting the user's global choice; the hook's read-side
 * resolution logic is owned elsewhere.
 *
 * Shares `~/.repo-harness/config.json` with brain-root.ts
 * (`repoHarnessConfigPath`), so every read/write here merges with unknown
 * top-level keys (e.g. `brainRoot`) and unknown keys nested inside an
 * existing `delegation` object — it never clobbers them.
 */

import * as fs from 'fs';
import { repoHarnessConfigPath } from './brain-root';
import { atomicWriteFileSync, deepEqual, formatJson, readJsonOrEmpty } from '../installer/shared';

export type DelegationMode = 'auto' | 'explicit';

export const VALID_DELEGATION_MODES: readonly DelegationMode[] = ['auto', 'explicit'];

export interface RepoHarnessUserConfigWithDelegation {
  delegation?: { mode?: DelegationMode; [key: string]: unknown };
  [key: string]: unknown;
}

export interface ConfigureDelegationModeResult {
  path: string;
  mode: DelegationMode;
  action: 'created' | 'updated' | 'unchanged';
}

function readUserConfig(env?: NodeJS.ProcessEnv): RepoHarnessUserConfigWithDelegation {
  try {
    const parsed = readJsonOrEmpty<RepoHarnessUserConfigWithDelegation>(repoHarnessConfigPath(env));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function existingDelegationObject(config: RepoHarnessUserConfigWithDelegation): Record<string, unknown> {
  const { delegation } = config;
  return delegation && typeof delegation === 'object' && !Array.isArray(delegation)
    ? (delegation as Record<string, unknown>)
    : {};
}

/** Currently persisted global mode, if any — used as the interactive prompt's default. */
export function configuredDelegationMode(env?: NodeJS.ProcessEnv): DelegationMode | undefined {
  const mode = existingDelegationObject(readUserConfig(env)).mode;
  return mode === 'auto' || mode === 'explicit' ? mode : undefined;
}

/**
 * Persist `delegation.mode`, merging with existing top-level keys (e.g.
 * `brainRoot`) and existing keys nested inside `delegation` itself. Reports
 * `unchanged` when the merged result matches what's already on disk, so
 * re-installs with the same choice don't churn the file.
 */
export function configureDelegationMode(
  mode: DelegationMode,
  env?: NodeJS.ProcessEnv,
): ConfigureDelegationModeResult {
  const configPath = repoHarnessConfigPath(env);
  const current = readUserConfig(env);
  const existed = fs.existsSync(configPath);
  const next: RepoHarnessUserConfigWithDelegation = {
    ...current,
    delegation: { ...existingDelegationObject(current), mode },
  };

  if (existed && deepEqual(current, next)) {
    return { path: configPath, mode, action: 'unchanged' };
  }
  atomicWriteFileSync(configPath, formatJson(next));
  return { path: configPath, mode, action: existed ? 'updated' : 'created' };
}
