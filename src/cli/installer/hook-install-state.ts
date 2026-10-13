import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { assertConfigurationPath, writePrivateConfiguration } from './configuration-ownership';
import { isManagedEntry } from './managed-entries';
import type { InstallProfile } from './install-profile';
import type { TargetId } from './types';

export interface HookOrderMigration {
  version: 1;
  profile: InstallProfile;
  events: string[];
  started_at: string;
  completed_at?: string;
  codex_trust_acknowledged_at?: string;
}

export interface HookInstallState {
  protocol: 1;
  order_migrations: Partial<Record<TargetId, HookOrderMigration>>;
}

export const CODEX_HOOK_TRUST_STEP = 'Start interactive codex, enter /hooks, and review the hooks marked for review. Trust only the hooks you recognise.';
export const CODEX_HOOK_TRUST_ACK = 'repo-harness install --acknowledge-codex-hook-trust';

export function hookInstallStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.HOME ?? homedir(), '.repo-harness', 'hook-install-state.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function readHookInstallState(env: NodeJS.ProcessEnv = process.env): HookInstallState {
  const file = hookInstallStatePath(env);
  assertConfigurationPath(file, env);
  if (!existsSync(file)) return { protocol: 1, order_migrations: {} };
  const invalid = () => new Error(`invalid hook install state: ${file}`);
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw invalid();
  }
  if (!isRecord(raw) || raw.protocol !== 1 || !isRecord(raw.order_migrations)) throw invalid();
  for (const [host, migration] of Object.entries(raw.order_migrations)) {
    if (!['codex', 'claude'].includes(host) || !isRecord(migration) || migration.version !== 1
      || !['minimal', 'full'].includes(migration.profile as string)
      || !Array.isArray(migration.events) || migration.events.length === 0
      || migration.events.some(event => typeof event !== 'string' || !event)
      || new Set(migration.events).size !== migration.events.length || !timestamp(migration.started_at)
      || (migration.completed_at !== undefined && !timestamp(migration.completed_at))
      || (migration.codex_trust_acknowledged_at !== undefined && (host !== 'codex'
        || !timestamp(migration.completed_at) || !timestamp(migration.codex_trust_acknowledged_at)))) throw invalid();
  }
  return raw as unknown as HookInstallState;
}

function writeState(state: HookInstallState, env: NodeJS.ProcessEnv): void {
  writePrivateConfiguration(hookInstallStatePath(env), `${JSON.stringify(state, null, 2)}\n`, env);
}

/** Detect positions that the managed-first write moves, including mixed blocks. */
export function oldHookOrderEvents(hooks: unknown): string[] {
  if (!isRecord(hooks)) return [];
  const events: string[] = [];
  for (const [event, blocks] of Object.entries(hooks)) {
    if (!Array.isArray(blocks)) continue;
    let userBlockSeen = false;
    for (const block of blocks) {
      const commands = isRecord(block) && Array.isArray(block.hooks) ? block.hooks : [];
      const owned = commands.filter(hook => isManagedEntry({ hooks: [hook] }));
      const hasUser = owned.length !== commands.length || owned.length === 0;
      if (owned.length > 0 && (userBlockSeen || hasUser)) {
        events.push(event);
        break;
      }
      if (hasUser) userBlockSeen = true;
    }
  }
  return events;
}

/** Persist intent before either host writes. A retry can finish this same intent. */
export function prepareHookOrderMigration(
  host: TargetId, hooks: unknown, profile: InstallProfile = 'full', env: NodeJS.ProcessEnv = process.env,
): HookOrderMigration | null {
  const state = readHookInstallState(env);
  const prior = state.order_migrations[host];
  const events = oldHookOrderEvents(hooks);
  if (events.length === 0) return prior && !prior.completed_at ? prior : null;
  const migration: HookOrderMigration = {
    version: 1, profile,
    events: [...new Set([...(!prior?.completed_at ? prior?.events ?? [] : []), ...events])],
    started_at: prior && !prior.completed_at ? prior.started_at : new Date().toISOString(),
  };
  state.order_migrations[host] = migration;
  writeState(state, env);
  return migration;
}

/** Called only after the adapter write succeeded, or an identical write was observed. */
export function completeHookOrderMigration(
  host: TargetId, migration: HookOrderMigration | null, env: NodeJS.ProcessEnv = process.env,
): string[] {
  if (!migration) return [];
  const state = readHookInstallState(env);
  const current = state.order_migrations[host];
  if (!current || current.started_at !== migration.started_at || current.completed_at) {
    throw new Error('hook order migration intent changed; rerun the hook install');
  }
  current.completed_at = new Date().toISOString();
  writeState(state, env);
  const notice = `Managed hooks now run before user hooks for ${current.events.join(', ')}. Migration recorded at ${hookInstallStatePath(env)}.`;
  return host === 'codex'
    ? [notice, `Pending Codex trust re-approval. ${CODEX_HOOK_TRUST_STEP} Then run ${CODEX_HOOK_TRUST_ACK}. This records your acknowledgement; it does not grant Codex trust.`]
    : [notice];
}

export function codexOrderMigration(env: NodeJS.ProcessEnv = process.env): HookOrderMigration | null {
  const migration = readHookInstallState(env).order_migrations.codex;
  if (!migration) return null;
  const file = join(env.HOME ?? homedir(), '.codex', 'hooks.json');
  assertConfigurationPath(file, env);
  if (!existsSync(file)) return null;
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isRecord(data) || !isRecord(data.hooks)) throw new Error(`invalid Codex hook config: ${file}`);
  return Object.values(data.hooks).some(blocks => Array.isArray(blocks) && blocks.some(isManagedEntry)) ? migration : null;
}

/** Operator input only. Codex remains the authority for the actual trust decision. */
export function acknowledgeCodexHookTrust(env: NodeJS.ProcessEnv = process.env): string {
  const migration = codexOrderMigration(env);
  if (!migration?.completed_at) throw new Error('no completed Codex hook order migration to acknowledge; finish the hook install first');
  const file = join(env.HOME ?? homedir(), '.codex', 'hooks.json');
  const data = JSON.parse(readFileSync(file, 'utf8')) as { hooks?: unknown };
  if (oldHookOrderEvents(data.hooks).length > 0) {
    throw new Error(`Codex hook config changed; run repo-harness install --target codex --location global --profile ${migration.profile}, then review /hooks before acknowledgement`);
  }
  if (migration.codex_trust_acknowledged_at) return 'Codex hook order migration already acknowledged by operator.';
  const state = readHookInstallState(env);
  state.order_migrations.codex!.codex_trust_acknowledged_at = new Date().toISOString();
  writeState(state, env);
  return 'Codex hook order migration acknowledged by operator. Codex still owns hook trust.';
}
