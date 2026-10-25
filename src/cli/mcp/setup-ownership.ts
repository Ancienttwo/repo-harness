import { existsSync, mkdirSync, readFileSync, realpathSync } from 'fs';
import { join, resolve } from 'path';
import { acquireExclusiveDirectoryLock } from '../../effects/locking/exclusive-directory-lock';
import { repoHarnessHome, type RepoHarnessRegisteredRepo } from '../../effects/repo-registry';
import { assertConfigurationPath, writePrivateConfiguration } from '../installer/configuration-ownership';

export interface McpRegistryRestore {
  before: RepoHarnessRegisteredRepo | null;
  installed: RepoHarnessRegisteredRepo;
  active: boolean;
}
export const mcpRegistryReceiptPath = () => join(repoHarnessHome(), 'mcp-setup-restore.json');
export function assertMcpStoragePath(path: string): void {
  assertConfigurationPath(resolve(path), repoHarnessHome());
  // Also reject a redirected storage root; the root itself is a configuration surface.
  assertConfigurationPath(repoHarnessHome(), resolve(repoHarnessHome(), '..'));
}
export function withMcpSetupLock<T>(run: () => T): T {
  const root = repoHarnessHome();
  assertMcpStoragePath(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const lock = acquireExclusiveDirectoryLock(realpathSync(root), 'transactions/mcp-setup.lock', { reclaimStaleOwner: true });
  try { return run(); } finally { lock.release(); }
}
export function readMcpRegistryReceipt(): McpRegistryRestore[] {
  const path = mcpRegistryReceiptPath();
  assertMcpStoragePath(path);
  if (!existsSync(path)) return [];
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value?.protocol !== 1 || !Array.isArray(value.changes)) throw new Error('invalid MCP setup restoration receipt');
  const paths = new Set();
  for (const entry of value.changes) {
    if (!entry || typeof entry.active !== 'boolean' || !entry.installed || typeof entry.installed.path !== 'string'
      || (entry.before !== null && (!entry.before || entry.before.path !== entry.installed.path)) || paths.has(entry.installed.path)) {
      throw new Error('invalid MCP registry restoration entry');
    }
    paths.add(entry.installed.path);
  }
  return value.changes;
}
export function saveMcpRegistryReceipt(changes: McpRegistryRestore[]): void {
  assertMcpStoragePath(mcpRegistryReceiptPath());
  writePrivateConfiguration(mcpRegistryReceiptPath(), `${JSON.stringify({ protocol: 1, changes }, null, 2)}\n`, repoHarnessHome());
}
/** Called under setup lock and registry lock, before publishing the new registry. No credential bytes. */
export function recordMcpRegistryChanges(before: readonly RepoHarnessRegisteredRepo[], after: readonly RepoHarnessRegisteredRepo[]): void {
  const changes = readMcpRegistryReceipt();
  for (const installed of after) {
    const previous = before.find((row) => row.path === installed.path) ?? null;
    if (JSON.stringify(previous) === JSON.stringify(installed)) continue;
    const entry = changes.find((row) => row.installed.path === installed.path);
    if (entry?.active && JSON.stringify(previous) !== JSON.stringify(entry.installed) && JSON.stringify(previous) !== JSON.stringify(entry.before)) {
      entry.before = previous; // A new explicit setup starts ownership from the current user state.
    }
    if (entry) { if (!entry.active) entry.before = previous; entry.installed = installed; entry.active = true; }
    else changes.push({ before: previous, installed, active: true });
  }
  if (changes.length) saveMcpRegistryReceipt(changes);
}
