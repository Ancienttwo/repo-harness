import { runMcpUninstall, type McpUninstallOptions } from '../mcp/uninstall';
import { Command } from 'commander';
import { execFileSync } from 'child_process';
import { startMcpHttp } from '../mcp/transports/http';
import { startMcpStdio } from '../mcp/transports/stdio';
import { cleanupManagedCodingWorkspace, listManagedCodingWorkspaces } from '../mcp/coding-workspaces';
import { setRepoHarnessAccessMode } from '../../effects/repo-registry';
import { mcpOAuthTokenStorePath } from '../mcp/auth';
import { resolveMcpRepoRoot } from '../mcp/repo';
import { McpOAuthTokenStore } from '../mcp/oauth';
import {
  runMcpDoctor,
  runMcpLiveDoctor,
  runMcpInstallSkill,
  runMcpMigrateScope,
  runMcpPrintGuide,
  runMcpSetupChatgpt,
  runMcpSetupCodex,
} from '../mcp/setup';

export interface McpServeOptions {
  repo?: string;
  transport: string;
  host: string;
  port: string;
  profile: string;
  auth?: string;
  enableReader?: boolean;
  allowRoot?: string[];
  enableChatgptBrowser?: boolean;
}

interface McpSetupChatgptOptions {
  repo?: string;
  host?: string;
  port?: string;
  endpoint?: string;
  serverName?: string;
  enableReader?: boolean;
  allowRoot?: string[];
  allowFullDiskRead?: boolean;
  profile?: string;
  grantReadWrite?: string[];
}

interface McpSetupCodexOptions {
  repo?: string;
  scope?: string;
  dryRun?: boolean;
}

interface McpInstallSkillOptions {
  repo?: string;
  overwrite?: boolean;
  dryRun?: boolean;
}

interface McpPrepareGoalOptions {
  repo?: string;
  issue: string;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid --port "${value}"`);
  }
  return port;
}

function collectOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

async function runMcpAction(action: () => void | Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(`repo-harness mcp: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

interface GithubIssueComment {
  author?: { login?: unknown } | null;
  body?: unknown;
  url?: unknown;
}

interface RawGithubIssue {
  number?: unknown;
  title?: unknown;
  body?: unknown;
  state?: unknown;
  url?: unknown;
  assignees?: unknown;
  comments?: unknown;
}

interface GithubIssueFields {
  number: number;
  title: string;
  body: string;
  state: string;
  url: string;
  assignees: string[];
  comments: Array<{ author: string; body: string; url: string }>;
}

function goalUnavailable(issueNumber: string, reason: string): never {
  throw new Error(`prepare-goal: issue ${issueNumber} is unavailable: ${reason}`);
}

function parseIssueNumber(value: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`prepare-goal: --issue requires a positive integer: ${value}`);
  }
  return number;
}

function readGithubIssue(repoRoot: string, issueNumber: number): GithubIssueFields {
  let stdout = '';
  try {
    stdout = execFileSync('gh', ['issue', 'view', String(issueNumber), '--json', 'number,title,body,state,url,assignees,comments'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error as NodeJS.ErrnoException & { stderr?: Buffer | string; killed?: boolean };
    if (detail.code === 'ENOENT') goalUnavailable(String(issueNumber), 'gh is required');
    if (detail.killed) goalUnavailable(String(issueNumber), 'gh timed out');
    const stderr = detail.stderr ? String(detail.stderr).trim() : '';
    goalUnavailable(String(issueNumber), stderr.split(/\r?\n/u)[0] || detail.message || 'gh issue view failed');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    goalUnavailable(String(issueNumber), 'invalid gh output');
  }
  const issue = parsed as RawGithubIssue;
  if (typeof issue.number !== 'number' || !Number.isInteger(issue.number) || issue.number <= 0
    || typeof issue.title !== 'string' || typeof issue.body !== 'string'
    || typeof issue.state !== 'string' || typeof issue.url !== 'string') {
    goalUnavailable(String(issueNumber), 'invalid gh output');
  }
  if (issue.state !== 'OPEN') goalUnavailable(String(issueNumber), `state ${issue.state}`);

  const assignees = Array.isArray(issue.assignees)
    ? issue.assignees
      .map((entry) => (entry && typeof entry === 'object' && typeof (entry as { login?: unknown }).login === 'string' ? (entry as { login: string }).login : ''))
      .filter((login) => login.length > 0)
    : [];
  const comments = Array.isArray(issue.comments)
    ? issue.comments
      .map((entry) => {
        const comment = entry as GithubIssueComment;
        const login = comment?.author && typeof comment.author === 'object' && typeof comment.author.login === 'string' ? comment.author.login : '';
        return {
          author: login || 'unknown',
          body: typeof comment?.body === 'string' ? comment.body : '',
          url: typeof comment?.url === 'string' ? comment.url : '',
        };
      })
      .filter((comment) => comment.body.length > 0 && comment.url.length > 0)
    : [];

  return {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    url: issue.url,
    assignees,
    comments,
  };
}

function activeClaim(issue: GithubIssueFields): string {
  const claims = issue.comments.filter((comment) => /^repo-harness issue claim\b/mu.test(comment.body));
  const latest = claims.at(-1);
  const statusText = latest?.body.match(/^Status:\s*(.+)$/imu)?.[1];
  const status = statusText?.split(';')[0]?.replace(/[\*_`]/gu, '').trim().toLowerCase();
  if (latest && (status === 'active' || status === 'blocked' || status === 'ready for review')) return `${latest.author} (${latest.url})`;
  if (latest && (status === 'released' || status === 'done')) {
    const assigneeList = issue.assignees.length > 0 ? issue.assignees.join(', ') : 'none';
    return `no active claim; assignees: ${assigneeList} (${issue.url})`;
  }
  if (latest) return `claim status unknown: ${statusText?.trim() ?? '(missing status)'} ${latest.author} (${latest.url})`;
  const assigneeList = issue.assignees.length > 0 ? issue.assignees.join(', ') : 'none';
  return `no active claim; assignees: ${assigneeList} (${issue.url})`;
}

function flattenMarkdown(text: string): string {
  return text.replace(/^\s*[-*]\s+/gmu, '').replace(/\s+/gu, ' ').trim();
}

function issueSection(body: string, headings: readonly string[]): string | undefined {
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gmu)];
  for (let index = 0; index < matches.length; index += 1) {
    if (!headings.includes(matches[index][1]!.trim().toLowerCase())) continue;
    const start = (matches[index].index ?? 0) + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1]!.index ?? body.length : body.length;
    const text = flattenMarkdown(body.slice(start, end));
    if (text) return text;
  }
  return undefined;
}

function firstBodyParagraph(body: string): string | undefined {
  return body.split(/\n\s*\n/u)
    .map((paragraph) => flattenMarkdown(paragraph))
    .find((paragraph) => paragraph.length > 0 && !paragraph.startsWith('#'));
}

function linkedPullRequest(body: string): string {
  return body.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/u)?.[0] ?? 'none yet';
}

function prepareGoalPrompt(repoRoot: string, issueInput: string): string {
  const issue = readGithubIssue(repoRoot, parseIssueNumber(issueInput));
  const scope = issueSection(issue.body, ['scope', '范围', '要做的', 'changes', 'what to do', 'implementation'])
    ?? firstBodyParagraph(issue.body)
    ?? 'the issue body';
  const nonGoals = issueSection(issue.body, ['non-goals', 'non goals', 'out of scope', '非目标', '不做']);
  const acceptance = issueSection(issue.body, ['acceptance', 'acceptance checks', 'acceptance criteria', '验收', '验收标准']);
  const stop = issueSection(issue.body, ['stop condition', 'stop', '停止条件']);

  return [
    '/goal',
    `Goal: ${flattenMarkdown(issue.title)}`,
    `Issue: ${issue.url}`,
    `PR: ${linkedPullRequest(issue.body)}`,
    `Claim: ${activeClaim(issue)}`,
    'Authority: the current GitHub issue and PR',
    `Planning references: issue #${issue.number} body`,
    `Scope: ${scope}`,
    `Non-goals: ${nonGoals ?? 'none stated in the issue'}`,
    "Preflight: re-read the issue, all claim comments and linked PRs before execution and on resume; follow the repository's issue-claim rules",
    `Acceptance checks: ${acceptance ?? 'the acceptance checks in the issue body'}`,
    `Stop condition: ${stop ?? 'verified completion, or evidence of a blocker or ownership conflict'}`,
    'Delegation: use only existing authorization; max 3 Codex subagents, depth 1, independent workstreams and separate write ownership',
    "Reporting: use the user's language unless repo-local instructions require otherwise; record the revision, changed files, checks and remaining blockers in the issue or PR",
  ].join('\n');
}

export function buildMcpCommand(): Command {
  const mcp = new Command('mcp').description('Run and configure the repo-harness MCP workflow sidecar');

  mcp
    .command('serve')
    .description('Start the repo-harness MCP server')
    .option('--repo <path>', 'Default repository/bootstrap context for workflow-scoped MCP tools', '.')
    .option('--transport <transport>', 'Transport: stdio|http', 'stdio')
    .option('--host <host>', 'HTTP bind host', '127.0.0.1')
    .option('--port <port>', 'HTTP bind port', '8765')
    .option('--profile <profile>', 'MCP profile: planner|executor|orchestrator|coding', 'planner')
    .option('--auth <mode>', 'HTTP auth mode: oauth|bearer|url-token', 'oauth')
    .option('--enable-reader', 'Force read-only workspace tools in this same MCP connector; registered adopted repos are included automatically')
    .option('--allow-root <path>', 'Additional non-repo local root for workspace reader/discovery tools; may be repeated', collectOption, [])
    .option('--enable-chatgpt-browser', 'Expose tools that operate the user logged-in ChatGPT Web browser session')
    .action(async (rawOpts: McpServeOptions) => {
      await runMcpAction(async () => {
        if (rawOpts.transport === 'stdio') {
          await startMcpStdio({
            repo: rawOpts.repo,
            profile: rawOpts.profile,
            enableReader: rawOpts.enableReader === true,
            allowedRoots: rawOpts.allowRoot,
            enableChatgptBrowser: rawOpts.enableChatgptBrowser === true,
          });
          return;
        }
        if (rawOpts.transport === 'http') {
          await startMcpHttp({
            repo: rawOpts.repo,
            profile: rawOpts.profile,
            enableReader: rawOpts.enableReader === true,
            allowedRoots: rawOpts.allowRoot,
            host: rawOpts.host,
            port: parsePort(rawOpts.port),
            auth: rawOpts.auth,
            enableChatgptBrowser: rawOpts.enableChatgptBrowser === true,
          });
          return;
        }
        throw new Error(`serve: invalid --transport "${rawOpts.transport}" (expected: stdio, http)`);
      });
    });

  mcp
    .command('doctor')
    .description('Check repo-harness MCP setup status')
    .option('--repo <path>', 'Repository root to inspect', '.')
    .option('--live', 'Probe endpoints and tools; can register and save an OAuth client and exchange tokens')
    .option('--json', 'Output JSON instead of human-readable text')
    .action((rawOpts: { repo?: string; json?: boolean; live?: boolean }) => {
      void runMcpAction(() => {
        if (rawOpts.live) {
          return runMcpLiveDoctor(rawOpts).then((result) => console.log(result.lines.join('\n')));
        }
        console.log(runMcpDoctor(rawOpts).lines.join('\n'));
      });
    });

  mcp
    .command('migrate-scope')
    .description('Migrate retired repo-scope MCP config to user-level storage, rotating credentials instead of relocating them')
    .option('--repo <path>', 'Repository root to migrate', '.')
    .action((rawOpts: { repo?: string }) => {
      void runMcpAction(() => {
        console.log(runMcpMigrateScope(rawOpts).lines.join('\n'));
      });
    });

  const access = new Command('access').description('Manage explicit user-scope MCP repo access');
  access
    .command('set')
    .requiredOption('--repo <path>', 'Adopted repository to authorize')
    .requiredOption('--mode <mode>', 'Access mode: read_only|read_write')
    .option('--json', 'Output JSON')
    .action((rawOpts: { repo: string; mode: string; json?: boolean }) => {
      void runMcpAction(() => {
        if (rawOpts.mode !== 'read_only' && rawOpts.mode !== 'read_write') throw new Error('access mode must be read_only or read_write');
        const result = setRepoHarnessAccessMode(rawOpts.repo, rawOpts.mode);
        if (!result.registered) throw new Error(result.reason ?? 'repo is not adopted');
        console.log(rawOpts.json ? JSON.stringify(result, null, 2) : `[repo-harness mcp] ${result.path}: ${result.accessMode} (authorization revision ${result.authorizationRevision})`);
      });
    });
  mcp.addCommand(access);

  const clients = new Command('clients').description('Inspect or revoke OAuth clients of the HTTP MCP server');
  clients
    .command('list')
    .option('--json', 'Output JSON')
    .action((rawOpts: { json?: boolean }) => {
      void runMcpAction(() => {
        const rows = new McpOAuthTokenStore(mcpOAuthTokenStorePath()).listClients();
        console.log(rawOpts.json ? JSON.stringify({ clients: rows }, null, 2) : rows.map((row) => [
          row.clientId,
          row.clientName ?? '-',
          row.issuedAt === null ? '-' : new Date(row.issuedAt * 1000).toISOString(),
          row.profiles.join(',') || '-',
          `${row.liveGrants} live grant(s)`,
        ].join('\t')).join('\n'));
      });
    });
  clients
    .command('revoke <client-id>')
    .description('Remove one client and invalidate its access and refresh tokens')
    .option('--json', 'Output JSON')
    .action((clientId: string, rawOpts: { json?: boolean }) => {
      void runMcpAction(() => {
        const result = new McpOAuthTokenStore(mcpOAuthTokenStorePath()).revokeClient(clientId);
        if (!result.revoked) throw new Error(`OAuth client ${clientId} is not registered`);
        console.log(rawOpts.json ? JSON.stringify({ clientId, ...result }, null, 2)
          : `[repo-harness mcp] revoked ${clientId}: ${result.accessTokens} access and ${result.refreshTokens} refresh token(s)`);
      });
    });
  mcp.addCommand(clients);

  const workspaces = new Command('workspaces').description('Inspect or clean locally managed coding worktrees');
  workspaces
    .command('list')
    .option('--json', 'Output JSON')
    .action((rawOpts: { json?: boolean }) => {
      void runMcpAction(() => {
        const rows = listManagedCodingWorkspaces();
        console.log(rawOpts.json ? JSON.stringify({ workspaces: rows }, null, 2) : rows.map((row) => {
          const worktreeState = row.stale_reason !== null ? 'stale' : (row.dirty ? 'dirty' : 'clean');
          return `${row.id}\t${row.branch}\t${worktreeState}\t${row.path_exists ? 'present' : 'missing'}`;
        }).join('\n'));
      });
    });
  workspaces
    .command('cleanup')
    .requiredOption('--workspace-id <id>', 'Managed workspace id')
    .option('--target <ref>', 'Explicit integration target for a legacy workspace that has no bound target')
    .option('--json', 'Output JSON')
    .action((rawOpts: { workspaceId: string; target?: string; json?: boolean }) => {
      void runMcpAction(async () => {
        const result = await cleanupManagedCodingWorkspace(rawOpts.workspaceId, process.env, { targetRef: rawOpts.target });
        console.log(rawOpts.json ? JSON.stringify(result, null, 2) : `[repo-harness mcp] Removed ${result.workspace_id} (${result.branch})`);
      });
    });
  mcp.addCommand(workspaces);

  mcp.command('uninstall')
    .description('Remove local MCP setup configuration while preserving workspaces and archives')
    .option('--repo <path>', 'Project whose Codex MCP registration to remove', '.')
    .option('--target <target>', 'codex|chatgpt|both', 'both')
    .option('--dry-run', 'Preview cleanup without filesystem writes')
    .option('--json', 'Output structured local cleanup result')
    .option('--services-stopped', 'Confirm all MCP HTTP services have been stopped before credential deletion')
    .option('--recover-interrupted', 'Restore recorded project fragments from an interrupted setup before uninstall')
    .action((opts: McpUninstallOptions & { json?: boolean }) => {
      void runMcpAction(() => {
        const result = runMcpUninstall(opts);
        console.log(opts.json ? JSON.stringify(result, null, 2) : [
          ...result.items.map((item) => `[${item.action}] ${item.path}: ${item.reason}`),
          ...result.retained.map((item) => `[preserve] ${item}`),
          ...result.externalActions.map((item) => `[external] ${item}`),
          `[mcp uninstall] ${result.status} (local configuration${result.dryRun ? ', dry-run' : ''})`,
        ].join('\n'));
        if (result.status === 'partial') process.exitCode = 1;
      });
    });

  const setup = new Command('setup').description('Generate MCP setup files for ChatGPT or Codex');

  setup
    .command('chatgpt')
    .description('Generate ChatGPT Connector local config and manual setup guide')
    .option('--repo <path>', 'Repository root to configure', '.')
    .option('--host <host>', 'Local MCP HTTP bind host')
    .option('--port <port>', 'Local MCP HTTP bind port')
    .option('--endpoint <url>', 'Stable public HTTPS /mcp endpoint to store in ignored local config')
    .option('--server-name <name>', 'ChatGPT Connector/MCP server name to record in ignored local config')
    .option('--profile <profile>', 'MCP profile to configure: planner|executor|orchestrator|coding')
    .option('--grant-read-write <path>', 'Explicitly grant one adopted repo read_write access for coding or orchestrator; may be repeated', collectOption, [])
    .option('--enable-reader', 'Enable read-only workspace tools in the same ChatGPT MCP Connector; registered adopted repos are included automatically')
    .option('--allow-root <path>', 'Additional non-repo local root for workspace reader/discovery tools; may be repeated', collectOption, [])
    .option('--allow-full-disk-read', 'Deprecated: use --enable-reader with explicit --allow-root paths')
    .action((rawOpts: McpSetupChatgptOptions) => {
      void runMcpAction(() => {
        const result = runMcpSetupChatgpt(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  setup
    .command('codex')
    .description('Patch Codex MCP config for repo-harness')
    .option('--repo <path>', 'Repository root to configure', '.')
    .option('--scope <scope>', 'Config scope: project|user', 'project')
    .option('--dry-run', 'Print planned changes without writing files')
    .action((rawOpts: McpSetupCodexOptions) => {
      void runMcpAction(() => {
        const result = runMcpSetupCodex(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  mcp.addCommand(setup);

  mcp
    .command('install-skill')
    .description('Install the repo-harness ChatGPT bridge Codex Skill')
    .option('--repo <path>', 'Repository root to configure', '.')
    .option('--overwrite', 'Replace an existing repo-local bridge Skill')
    .option('--dry-run', 'Print planned installation without writing files')
    .action((rawOpts: McpInstallSkillOptions) => {
      void runMcpAction(() => {
        const result = runMcpInstallSkill(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  mcp
    .command('prepare-goal')
    .description('Print a Goal prompt from an OPEN GitHub issue')
    .option('--repo <path>', 'Repository root to run gh in', '.')
    .requiredOption('--issue <number>', 'GitHub issue number to read')
    .action((rawOpts: McpPrepareGoalOptions) => {
      try {
        console.log(prepareGoalPrompt(resolveMcpRepoRoot(rawOpts.repo ?? '.'), rawOpts.issue));
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(2);
      }
    });

  mcp
    .command('print-chatgpt-guide')
    .description('Print the ChatGPT Connector setup guide')
    .option('--repo <path>', 'Repository root to inspect', '.')
    .option('--endpoint <url>', 'Public HTTPS /mcp endpoint to include in the guide')
    .option('--write', 'Write docs/repo-harness-chatgpt-mcp-setup.md')
    .action((rawOpts: { repo?: string; endpoint?: string; write?: boolean }) => {
      void runMcpAction(() => {
        const result = runMcpPrintGuide(rawOpts);
        console.log(result.lines.join('\n'));
      });
    });

  return mcp;
}
