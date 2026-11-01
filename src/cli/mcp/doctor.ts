import { existsSync, readFileSync, realpathSync, statSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { hostSkillRoot } from '../../effects/host-skill-roots';
import { readRegisteredRepoHarnessRepos } from '../../effects/repo-registry';
import { assertNoLegacyRepoScopeMcpConfig, loadMcpLocalConfig, mcpLocalConfigPath, mcpStorageDir } from './auth';
import { sensitiveAllowedRootReason } from './policy';
import { resolveMcpRepoRoot } from './repo';
import { repoHarnessPackageVersion } from './version';

export interface McpDoctorResult {
  status: 'ok';
  repoRoot: string;
  lines: string[];
}

export const RETIRED_CHATGPT_STATE_FINDING = 'retired_chatgpt_state';

const RETIRED_CODEX_MCP_BLOCK = '[mcp_servers.repo_harness]';

function displayMcpPath(path: string): string {
  const home = process.env.HOME;
  if (home && path === home) return '~';
  if (home && path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}

/**
 * Files that the removed ChatGPT, HTTP, OAuth and Codex MCP surface wrote
 * (#1354). No reader is left, and nothing deletes them: the doctor names each
 * one that exists so the user can remove it by hand.
 */
function retiredChatgptState(repoRoot: string): { path: string; remove: string }[] {
  const home = process.env.HOME ?? homedir();
  const files = [
    ...['mcp.tokens.json', 'mcp.oauth.json', 'mcp.oauth-tokens.json', 'mcp.oauth-doctor-client.json'].map((name) => join(mcpStorageDir(), name)),
    join(repoRoot, '.repo-harness', 'chatgpt-browser.local.json'),
    join(repoRoot, '.ai', 'harness', 'handoff', 'chatgpt-plan.md'),
  ];
  const directories = [
    join(repoRoot, '.ai', 'harness', 'chatgpt', 'sessions'),
    join(repoRoot, '.agents', 'skills', 'repo-harness-chatgpt-bridge'),
    join(hostSkillRoot(home, 'claude'), 'repo-harness-chatgpt'),
    join(hostSkillRoot(home, 'codex'), 'repo-harness-chatgpt'),
    join(hostSkillRoot(home, 'pi'), 'repo-harness-chatgpt'),
  ];
  const found = [
    ...files.filter((path) => existsSync(path)).map((path) => ({ path, remove: `rm ${path}` })),
    ...directories.filter((path) => existsSync(path)).map((path) => ({ path, remove: `rm -r ${path}` })),
  ];
  const codexConfig = join(repoRoot, '.codex', 'config.toml');
  if (existsSync(codexConfig) && readFileSync(codexConfig, 'utf-8').includes(RETIRED_CODEX_MCP_BLOCK)) {
    found.push({ path: codexConfig, remove: `delete the ${RETIRED_CODEX_MCP_BLOCK} block from ${codexConfig}` });
  }
  return found;
}

export function runMcpDoctor(opts: { repo?: string; json?: boolean }): McpDoctorResult {
  const repoRoot = resolveMcpRepoRoot(opts.repo ?? '.');
  assertNoLegacyRepoScopeMcpConfig(repoRoot);
  const localConfig = loadMcpLocalConfig();
  const registeredRepoCount = readRegisteredRepoHarnessRepos({ adoptedOnly: true }).length;
  const configuredAllowedRoots = localConfig?.permissions?.allowedRoots ?? [];
  const allowedRootReports = configuredAllowedRoots.map((rawRoot) => {
    const absolutePath = resolve(rawRoot);
    try {
      const fileStat = statSync(absolutePath);
      return {
        path: absolutePath,
        exists: true,
        readable: fileStat.isDirectory(),
        canonicalPath: fileStat.isDirectory() ? realpathSync(absolutePath) : undefined,
      };
    } catch (_error) {
      return { path: absolutePath, exists: false, readable: false };
    }
  });
  const home = realpathSync(homedir());
  const unsafeAllowedRoots = allowedRootReports
    .filter((entry) => entry.canonicalPath === '/' || entry.canonicalPath === home || (
      entry.canonicalPath !== undefined && sensitiveAllowedRootReason(entry.canonicalPath) !== undefined
    ))
    .map((entry) => entry.path);
  const retiredState = retiredChatgptState(repoRoot);
  const status = existsSync(join(repoRoot, '.ai', 'harness', 'policy.json'))
    ? 'ready_local'
    : localConfig ? 'ready_user' : 'not_adopted';
  const report = {
    status,
    repo: repoRoot,
    mcp: {
      packageVersion: repoHarnessPackageVersion(),
      storageDir: mcpStorageDir(),
      configVersion: localConfig?.version,
      configVersionOk: localConfig?.version === 3,
      localConfig: Boolean(localConfig),
      permissions: {
        fullDiskRead: false,
        allowedRootCount: localConfig?.permissions?.allowedRoots?.length ?? 0,
        allowedRoots: allowedRootReports,
        unsafeAllowedRoots,
        registeredRepoCount,
        legacyFullDiskReadDetected: localConfig?.permissions?.fullDiskRead === true || localConfig?.permissions?.legacyFullDiskReadDetected === true,
      },
      capabilities: {
        workspaceReader: localConfig?.capabilities?.workspaceReader === true || localConfig?.capabilities?.reader === true,
        workflowPlanner: localConfig?.capabilities?.workflowPlanner !== false,
        workflowExecutor: localConfig?.capabilities?.workflowExecutor === true,
      },
    },
    findings: retiredState.length > 0
      ? [{ code: RETIRED_CHATGPT_STATE_FINDING, paths: retiredState.map((entry) => entry.path), remove: retiredState.map((entry) => entry.remove) }]
      : [],
  };
  return {
    status: 'ok',
    repoRoot,
    lines: opts.json === true ? [JSON.stringify(report, null, 2)] : [
      `[repo-harness mcp] Repo: ${repoRoot}`,
      `[repo-harness mcp] Status: ${report.status}`,
      `[repo-harness mcp] Package version: ${report.mcp.packageVersion}`,
      `[repo-harness mcp] Config: ${displayMcpPath(mcpLocalConfigPath())} (version: ${report.mcp.configVersion ?? 'missing'})`,
      `[repo-harness mcp] Reader capability: ${report.mcp.capabilities.workspaceReader ? `enabled (${report.mcp.permissions.registeredRepoCount} registered repos, ${report.mcp.permissions.allowedRootCount} explicit roots)` : 'disabled'}`,
      ...(report.mcp.permissions.allowedRoots.length > 0 ? [`[repo-harness mcp] Allowed roots: ${report.mcp.permissions.allowedRoots.map((entry) => `${entry.readable ? 'ok' : 'bad'}:${entry.path}`).join(', ')}`] : []),
      ...(report.mcp.permissions.unsafeAllowedRoots.length > 0 ? [`[repo-harness mcp] Unsafe allowed roots: ${report.mcp.permissions.unsafeAllowedRoots.join(', ')}`] : []),
      ...(report.mcp.permissions.legacyFullDiskReadDetected ? ['[repo-harness mcp] Legacy full-disk read: detected; serve with --enable-reader --allow-root <path>'] : []),
      ...retiredState.map((entry) => `[repo-harness mcp] ${RETIRED_CHATGPT_STATE_FINDING}: ${displayMcpPath(entry.path)} has no reader; remove it by hand: ${entry.remove}`),
    ],
  };
}
