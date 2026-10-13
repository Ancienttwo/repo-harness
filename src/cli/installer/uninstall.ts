import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, rmdirSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { createHash } from 'crypto';
import { MANAGED_TAG, stripRepoHarnessManagedHooks } from '../../core/adoption/managed-hook-config';
import { deepEqual } from './shared';
import { installProfileStatePath, managedInstallSurfaceIsCurrent, readInstalledProfile, type ManagedInstallSurface } from './install-profile';
import { assertConfigurationPath, configurationPaths, configurationReceiptPath, readConfigurationFragment, readConfigurationReceipt, replaceConfigurationFragment, writePrivateConfiguration } from './configuration-ownership';

export interface UninstallOptions { target: 'codex' | 'claude' | 'both'; dryRun?: boolean; recoverInterrupted?: boolean; env?: NodeJS.ProcessEnv }
export interface UninstallItem { path: string; action: 'remove' | 'restore' | 'preserve' | 'unresolved'; reason: string }
export interface UninstallResult { exitCode: number; status: 'complete' | 'partial'; dryRun: boolean; items: UninstallItem[]; lines: string[] }

function selected(path: string, target: UninstallOptions['target'], home: string): boolean {
  if (target === 'both') return true;
  return path.startsWith(join(home, `.${target}`) + '/') || (target === 'claude' && path === join(home, '.claude.json'));
}
function fileExists(path: string): boolean {
  try { lstatSync(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
function fingerprint(path: string): string | null {
  if (!fileExists(path)) return null;
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return `link:${readlinkSync(path)}`;
  if (stat.isDirectory()) return `dir:${readdirSync(path).sort().map((name) => `${name}:${fingerprint(join(path, name))}`).join('|')}`;
  if (!stat.isFile()) throw new Error(`unsupported installed surface: ${path}`);
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function object(raw: string): Record<string, any> {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected JSON object');
  return parsed;
}

/** Plan completely before writing; dry-run neither takes a filesystem lock nor creates receipts. */
export function runUserUninstall(opts: UninstallOptions): UninstallResult {
  const env = opts.env ?? process.env;
  const home = env.HOME ?? homedir();
  const items: UninstallItem[] = [];
  const writes = new Map<string, string | null>();
  const originals = new Map<string, string | null>();
  const surfaceRemovals: ManagedInstallSurface[] = [];
  const removedSurfaces = new Set<ManagedInstallSurface>();
  const remember = (path: string): void => { if (!originals.has(path)) originals.set(path, fingerprint(path)); };
  const read = (path: string): string => writes.has(path) ? writes.get(path) ?? '' : existsSync(path) ? readFileSync(path, 'utf8') : '';
  const change = (path: string, value: string | null, reason: string, action: 'remove' | 'restore' = 'remove'): void => {
    remember(path); writes.set(path, value); items.push({ path, action, reason });
  };
  const unresolved = (path: string, reason: string): void => { items.push({ path, action: 'unresolved', reason }); };
  let state: ReturnType<typeof readInstalledProfile> = null;
  let receipt: ReturnType<typeof readConfigurationReceipt>;
  try {
    assertConfigurationPath(installProfileStatePath(env), env);
    state = readInstalledProfile(env);
    receipt = readConfigurationReceipt(env);
    if (receipt.pending && !opts.recoverInterrupted) throw new Error('interrupted configuration transaction; preview recovery with uninstall --recover-interrupted --dry-run, then apply --recover-interrupted to restore recorded fragments');
  } catch (error) { unresolved(configurationReceiptPath(env), String((error as Error).message)); return result(); }
  let recovered = false;
  if (receipt.pending) {
    try {
      if (receipt.pending.before.some((entry) => !selected(entry.path, opts.target, home))) throw new Error('recovery must include all pending host fragments; use --target both');
      for (const entry of receipt.pending.before) {
        assertConfigurationPath(entry.path, env);
        const next = replaceConfigurationFragment(entry.path, read(entry.path), entry.selector, entry.value);
        change(entry.path, next.trim() && next.trim() !== '{}' ? next : null, `explicit interrupted-setup recovery: ${entry.selector}`, 'restore');
        const previous = receipt.changes.find((change) => change.path === entry.path && change.selector === entry.selector);
        if (previous && !previous.active) { previous.before = entry.value; previous.installed = entry.value; }
        else if (!previous) receipt.changes.push({ path: entry.path, selector: entry.selector, before: entry.value, installed: entry.value, active: false });
      }
      delete receipt.pending;
      recovered = true;
    } catch (error) { unresolved(configurationReceiptPath(env), String((error as Error).message)); return result(); }
  }
  const remaining = [...receipt.changes];
  for (const entry of receipt.changes) {
    if (!entry.active || !selected(entry.path, opts.target, home)) continue;
    try {
      assertConfigurationPath(entry.path, env);
      const current = readConfigurationFragment(entry.path, read(entry.path), entry.selector);
      if (current === entry.before) { remaining.splice(remaining.indexOf(entry), 1); continue; }
      if (current !== entry.installed) { unresolved(entry.path, `user changed ${entry.selector}; preserved`); continue; }
      const next = replaceConfigurationFragment(entry.path, read(entry.path), entry.selector, entry.before);
      change(entry.path, next.trim() ? next : null, `restore installation change: ${entry.selector}`, entry.before === null ? 'remove' : 'restore');
      remaining.splice(remaining.indexOf(entry), 1);
    } catch (error) { unresolved(entry.path, String((error as Error).message)); }
  }

  for (const host of ['codex', 'claude'] as const) {
    if (opts.target !== 'both' && opts.target !== host) continue;
    const path = join(home, host === 'codex' ? '.codex/hooks.json' : '.claude/settings.json');
    try {
      assertConfigurationPath(path, env);
      if (read(path)) {
        const data = object(read(path));
        const cleaned = stripRepoHarnessManagedHooks(data.hooks).hooks;
        if (!deepEqual(cleaned, data.hooks ?? {})) {
          if (Object.keys(cleaned).length) data.hooks = cleaned; else delete data.hooks;
          change(path, Object.keys(data).length ? `${JSON.stringify(data, null, 2)}\n` : null, `${host} managed hooks`);
        }
      }
    } catch (error) { unresolved(path, String((error as Error).message)); }
    const contextPath = join(home, host === 'codex' ? '.codex/AGENTS.md' : '.claude/CLAUDE.md');
    try {
      assertConfigurationPath(contextPath, env);
      if (!existsSync(contextPath)) continue;
      const raw = read(contextPath);
      const begin = '<!-- BEGIN: repo-harness global-working-rules -->';
      const end = '<!-- END: repo-harness global-working-rules -->';
      const starts = raw.split(begin).length - 1;
      const ends = raw.split(end).length - 1;
      if (!starts && !ends) continue;
      if (starts !== 1 || ends !== 1 || raw.indexOf(end) < raw.indexOf(begin)) throw new Error('unbalanced managed global rules; preserved');
      const next = raw.slice(0, raw.indexOf(begin)) + raw.slice(raw.indexOf(end) + end.length);
      change(contextPath, next.trim() ? next : null, 'managed global working rules');
    } catch (error) { unresolved(contextPath, String((error as Error).message)); }
  }

  for (const surface of state?.ownership_manifest ?? []) {
    if (!selected(surface.path, opts.target, home)) continue;
    if (surface.managed_marker === MANAGED_TAG) {
      if (!items.some((item) => item.path === surface.path && item.action === 'unresolved')) removedSurfaces.add(surface);
      continue;
    }
    if (configurationPaths(env).includes(surface.path)) {
      // A restoration receipt owns these fragments; never also delete the projection.
      if (receipt.changes.some((entry) => entry.active && entry.path === surface.path && entry.selector !== 'default_mode_request_user_input')) {
        if (!remaining.some((entry) => entry.active && entry.path === surface.path && entry.selector !== 'default_mode_request_user_input')) removedSurfaces.add(surface);
        continue;
      }
    }
    if (!surface.path.startsWith(join(home, '.codex') + '/') && !surface.path.startsWith(join(home, '.claude') + '/')
      && !surface.path.startsWith(join(home, '.agents') + '/') && surface.path !== join(home, '.claude.json')) {
      items.push({ path: surface.path, action: 'preserve', reason: 'package-manager installation retained; remove separately after configuration cleanup' });
      continue;
    }
    try {
      // A receipt may own the final symlink, but never a symlinked parent directory.
      assertConfigurationPath(dirname(surface.path), env);
      if (!fileExists(surface.path)) { removedSurfaces.add(surface); continue; }
      if (!managedInstallSurfaceIsCurrent(surface)) { unresolved(surface.path, 'owned surface changed since installation; preserved'); continue; }
      if (surface.managed_marker === 'codegraph-config-projection') {
        assertConfigurationPath(surface.path, env);
        let next = read(surface.path);
        for (const selector of surface.path.endsWith('.toml') ? ['mcp_servers.codegraph'] : ['mcpServers.codegraph', 'allowedTools.codegraph']) {
          next = replaceConfigurationFragment(surface.path, next, selector, null);
        }
        change(surface.path, next.trim() && next.trim() !== '{}' ? next : null, 'transaction-owned CodeGraph projection');
      } else {
        remember(surface.path); surfaceRemovals.push(surface);
        items.push({ path: surface.path, action: 'remove', reason: 'unchanged transaction-owned surface' });
      }
      removedSurfaces.add(surface);
    } catch (error) { unresolved(surface.path, String((error as Error).message)); }
  }

  for (const path of configurationPaths(env)) {
    if (!selected(path, opts.target, home)) continue;
    try {
      assertConfigurationPath(path, env);
      if (!existsSync(path)) continue;
      const raw = read(path);
      const selectors = path.endsWith('.toml') ? ['default_mode_request_user_input', 'mcp_servers.codegraph'] : ['mcpServers.codegraph', 'allowedTools.codegraph'];
      for (const selector of selectors) {
        const previous = receipt.changes.find((entry) => entry.path === path && entry.selector === selector);
        if (previous?.active) continue;
        if (previous && readConfigurationFragment(path, raw, selector) === previous.before) continue;
        if ([...removedSurfaces].some((entry) => entry.path === path && entry.managed_marker === 'codegraph-config-projection') && selector !== 'default_mode_request_user_input') continue;
        if (readConfigurationFragment(path, raw, selector) !== null) unresolved(path, `no installation provenance for ${selector}; preserved`);
      }
      if (path.endsWith('.toml')) {
        const parsed = Bun.TOML.parse(raw) as Record<string, any>;
        if (parsed.hooks?.state && Object.keys(parsed.hooks.state).length) unresolved(path, 'host-owned hook trust entries have no verified command mapping; preserved');
      }
    } catch (error) { unresolved(path, String((error as Error).message)); }
  }

  if (opts.target === 'both') {
    const path = join(home, '.repo-harness/config.json');
    try {
      assertConfigurationPath(path, env);
      if (existsSync(path)) {
        const data = object(read(path));
        if ('brainRoot' in data || 'protectedHelperRuntime' in data || 'architecture' in data || 'refactor_recommendations' in data) {
          delete data.brainRoot; delete data.protectedHelperRuntime; delete data.architecture; delete data.refactor_recommendations;
          change(path, Object.keys(data).length ? `${JSON.stringify(data, null, 2)}\n` : null, 'repo-harness brain/helper/architecture configuration; data directories retained');
        }
      }
    } catch (error) { unresolved(path, String((error as Error).message)); }
    for (const name of ['agent-fleet-user-managed.json']) {
      const path = join(home, '.repo-harness', name);
      try { assertConfigurationPath(path, env); if (existsSync(path)) change(path, null, 'product configuration'); }
      catch (error) { unresolved(path, String((error as Error).message)); }
    }
  }

  // Only remove lock entries for staging skills actually removed in this operation.
  const staging = surfaceRemovals.filter((surface) => dirname(surface.path) === join(home, '.agents/skills')).map((surface) => surface.path.split('/').at(-1)!);
  const lockPath = join(home, '.agents/.skill-lock.json');
  if (staging.length && existsSync(lockPath)) {
    try {
      assertConfigurationPath(lockPath, env);
      const data = object(read(lockPath));
      if (!data.skills || typeof data.skills !== 'object' || Array.isArray(data.skills)) throw new Error('invalid skills lock; preserved');
      for (const name of staging) delete data.skills[name];
      change(lockPath, `${JSON.stringify(data, null, 2)}\n`, 'removed staging skill registrations');
    } catch (error) { unresolved(lockPath, String((error as Error).message)); }
  }

  const statePath = installProfileStatePath(env);
  if (state) {
    const pending = state.ownership_manifest.filter((surface) => !removedSurfaces.has(surface));
    if (opts.target === 'both' && !items.some((item) => item.action === 'unresolved')) change(statePath, null, 'installed profile retired');
    else if (removedSurfaces.size) change(statePath, `${JSON.stringify({ ...state, ownership_manifest: pending, previous: null }, null, 2)}\n`, 'retain remaining ownership for retry/other host');
  }
  const restored = receipt.changes.filter((entry) => entry.active && !remaining.includes(entry));
  if (restored.length || recovered) {
    const next = { ...receipt, changes: receipt.changes.map((entry) => restored.includes(entry) ? { ...entry, active: false } : entry) };
    change(configurationReceiptPath(env), `${JSON.stringify(next, null, 2)}\n`, 'deactivate restored ownership; retain static installation history', 'restore');
  }
  items.push({ path: join(home, '.repo-harness'), action: 'preserve', reason: 'archives, runtime history and independent MCP setup/workspaces retained; third-party packages/plugins retained' });

  if (!opts.dryRun) {
    try {
      for (const [path, expected] of originals) {
        assertConfigurationPath(dirname(path), env);
        if (fingerprint(path) !== expected) throw new Error(`configuration changed after preview: ${path}`);
      }
      for (const surface of surfaceRemovals) {
        rmSync(surface.path, { recursive: true, force: true });
      }
      for (const [path, content] of writes) {
        assertConfigurationPath(path, env);
        if (content === null) { if (existsSync(path)) unlinkSync(path); }
        else writePrivateConfiguration(path, content, env);
      }
      for (const path of [...originals.keys()]) {
        const parent = dirname(path);
        // Never remove a host root or history tree; only now-empty managed leaf containers.
        if (['skills', 'rules', 'agents'].includes(parent.split('/').at(-1) ?? '') && existsSync(parent) && readdirSync(parent).length === 0) rmdirSync(parent);
      }
    } catch (error) { unresolved(home, `uninstall incomplete: ${String((error as Error).message)}`); }
  }
  return result();
  function result(): UninstallResult {
    const partial = items.some((item) => item.action === 'unresolved');
    return { exitCode: partial ? 1 : 0, status: partial ? 'partial' : 'complete', dryRun: opts.dryRun === true, items,
      lines: [...items.map((item) => `[${item.action}] ${item.path}: ${item.reason}`), `[uninstall] ${partial ? 'partial' : 'complete'}${opts.dryRun ? ' (dry-run)' : ''}`] };
  }
}
