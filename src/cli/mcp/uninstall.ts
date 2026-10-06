import { existsSync, lstatSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { readRepoHarnessRegistryStrictSnapshot, restoreRepoHarnessRegistryEntries } from '../../effects/repo-registry';
import { assertConfigurationPath, readConfigurationFragment, readConfigurationReceipt, replaceConfigurationFragment, saveConfigurationReceipt, writePrivateConfiguration } from '../installer/configuration-ownership';
import { withRuntimeHostTransactionLock } from '../installer/runtime-host-lock';
import { mcpLocalConfigPath, mcpOAuthDoctorClientPath, mcpOAuthPath, mcpOAuthTokenStorePath, mcpStorageDir, mcpTokenPath } from './auth';
import { resolveMcpRepoRoot } from './repo';
import { assertMcpStoragePath, readMcpRegistryReceipt, saveMcpRegistryReceipt, withMcpSetupLock } from './setup-ownership';

export interface McpUninstallOptions {
  repo?: string;
  target?: string;
  dryRun?: boolean;
  servicesStopped?: boolean;
  recoverInterrupted?: boolean;
}
export interface McpUninstallResult {
  status: 'complete' | 'partial';
  scope: 'local_configuration';
  dryRun: boolean;
  items: { action: 'remove' | 'restore' | 'unresolved'; path: string; reason: string }[];
  retained: string[];
  externalActions: string[];
}

/** Offline cleanup: never infer service shutdown or remote credential revocation from disk removal. */
export function runMcpUninstall(opts: McpUninstallOptions): McpUninstallResult {
  const target = opts.target ?? 'both';
  if (!['both', 'codex', 'chatgpt'].includes(target)) throw new Error('target must be codex, chatgpt or both');
  const codex = target !== 'chatgpt', chatgpt = target !== 'codex';
  const repo = resolveMcpRepoRoot(opts.repo ?? '.');
  const result: McpUninstallResult = {
    status: 'complete', scope: 'local_configuration', dryRun: opts.dryRun === true, items: [],
    retained: ['repositories, managed workspaces and task state', 'archives, generated guides, bridge skill and restoration history'],
    externalActions: chatgpt ? ['Stop all MCP HTTP services before applying; live service state is not verified.', 'Remove the remote ChatGPT Connector and tunnel; remove externally supplied MCP credential environment variables.'] : [],
  };
  const unresolved = (path: string, reason: string) => { result.status = 'partial'; result.items.push({ action: 'unresolved', path, reason }); };
  if (chatgpt && !opts.dryRun && !opts.servicesStopped) {
    unresolved(mcpStorageDir(), 'Stop every MCP HTTP service first, then apply with --services-stopped; a running server can recreate deleted credentials.');
    return result;
  }
  const run = () => {
    const mutations: (() => void)[] = [];
    if (codex) {
      const env = { HOME: repo }, path = join(repo, '.codex/config.toml');
      assertConfigurationPath(path, env);
      const receipt = readConfigurationReceipt(env);
      let raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
      const original = raw;
      let receiptChanged = false;
      if (receipt.pending) {
        if (!opts.recoverInterrupted) throw new Error('interrupted project setup; use --recover-interrupted after previewing --dry-run');
        if (receipt.pending.before.some((row) => row.path !== path)) throw new Error('pending transaction includes other project host configuration; preserving it');
        for (const row of receipt.pending.before) {
          raw = replaceConfigurationFragment(path, raw, row.selector, row.value);
        }
        delete receipt.pending;
        receiptChanged = true;
      }
      const entry = receipt.changes.find((row) => row.path === path && row.selector === 'mcp_servers.repo_harness');
      const current = readConfigurationFragment(path, raw, 'mcp_servers.repo_harness');
      if (entry?.active) {
        if (current !== entry.installed && current !== entry.before) unresolved(path, 'MCP registration changed since setup; preserved');
        else {
          raw = replaceConfigurationFragment(path, raw, entry.selector, entry.before);
          entry.active = false;
          receiptChanged = true;
          result.items.push({ action: 'restore', path, reason: 'restore setup-owned MCP registration' });
        }
      } else if (current !== null && (!entry || current !== entry.before)) {
        unresolved(path, 'MCP registration has no active restoration receipt; preserved');
      }
      if (raw !== original) mutations.push(() => {
        assertConfigurationPath(path, env);
        if ((existsSync(path) ? readFileSync(path, 'utf8') : '') !== original) throw new Error(`project configuration changed during cleanup: ${path}`);
        if (raw.trim()) writePrivateConfiguration(path, raw, env);
        else unlinkSync(path);
      });
      if (receiptChanged) mutations.push(() => saveConfigurationReceipt(receipt, env));
    }
    if (chatgpt) {
      const files = [mcpLocalConfigPath(), mcpTokenPath(), mcpOAuthPath(), mcpOAuthDoctorClientPath(), mcpOAuthTokenStorePath()];
      for (const path of files) {
        assertMcpStoragePath(path);
        if (existsSync(path)) {
          if (!lstatSync(path).isFile()) throw new Error(`MCP configuration is not a regular file: ${path}`);
          result.items.push({ action: 'remove', path, reason: 'dedicated local MCP configuration or credentials; no secret backup' });
        }
      }
      const receipt = readMcpRegistryReceipt();
      const active = receipt.filter((row) => row.active);
      const preview = restoreRepoHarnessRegistryEntries(active, { dryRun: true });
      const snapshot = readRepoHarnessRegistryStrictSnapshot();
      for (const row of snapshot.repos) {
        if ((row.source === 'mcp-setup' || row.accessMode === 'read_write') && !receipt.some((entry) => entry.installed.path === row.path)) {
          unresolved(snapshot.registryPath, `registration has no setup ownership record: ${row.path}; preserved`);
        }
      }
      for (const path of preview.conflicts) unresolved(snapshot.registryPath, `registration changed since setup: ${path}; preserved`);
      for (const path of preview.restored) result.items.push({ action: 'restore', path: snapshot.registryPath, reason: `restore setup-owned registration: ${path}` });
      mutations.push(() => {
        const applied = restoreRepoHarnessRegistryEntries(active);
        for (const path of applied.conflicts.filter((path) => !preview.conflicts.includes(path))) unresolved(snapshot.registryPath, `registration changed during cleanup: ${path}; preserved`);
        for (const row of active) if (applied.restored.includes(row.installed.path)) row.active = false;
        if (active.length) saveMcpRegistryReceipt(receipt);
        for (const path of files) { assertMcpStoragePath(path); if (existsSync(path)) unlinkSync(path); }
      });
    }
    if (!opts.dryRun) for (const mutate of mutations) mutate();
  };
  try {
    if (opts.dryRun) run();
    else if (chatgpt) withMcpSetupLock(() => codex ? withRuntimeHostTransactionLock({ HOME: repo }, run) : run());
    else withRuntimeHostTransactionLock({ HOME: repo }, run);
  } catch (error) {
    unresolved(chatgpt ? mcpStorageDir() : repo, error instanceof Error ? error.message : String(error));
  }
  return result;
}
