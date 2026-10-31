import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, isAbsolute, join, resolve } from 'path';
import { isRegisteredRepoHarnessRoot, readRegisteredRepoHarnessRepos } from '../../effects/repo-registry';
import { listSessions, openSession, readSession, runBrowserConsult, runBrowserFollowup } from '../chatgpt-browser/engine';
import type { BrowserProviderName, NativeBrowserChannel } from '../chatgpt-browser/types';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { loadMcpLocalConfig } from './auth';
import { guardedWriteFile } from './guarded-write';
import { isPathInside, resolveMcpPath } from './paths';
import { buildReaderToolDefinitions, callReaderTool, createReaderToolContext, isReaderTool } from './reader-tools';
import { buildCodingToolDefinitions, callCodingTool, isCodingTool, type CodingToolContext } from './coding-tools';
import type { CodingWorkspaceManager } from './coding-workspaces';
import type { GeneralRepoCodeGraphAdapter } from './codegraph-adapter';
import type { McpProcessSessionManager } from './process-sessions';
import { currentGitBranch, isRepoHarnessAdopted, resolveMcpRepoRoot } from './repo';
import { redactMcpText } from './redaction';
import { buildStateToolDefinitions, callStateTool, isStateTool } from './state-tools';
import {
  PUBLICATION_MERGE_TOOL_NAME,
  buildFleetToolDefinitions,
  buildPublicationMergeToolDefinitions,
  callFleetTool,
  callPublicationMergeTool,
  fleetToolArgumentError,
  isFleetTool,
} from './fleet-tools';
import { buildHerdrToolDefinitions, callHerdrTool, isHerdrTool } from './herdr-tools';
import { REVIEW_PUBLISH_TOOL_NAME, buildReviewPublishToolDefinitions, callReviewPublishTool } from './review-publish-tool';
import type { McpPolicy } from './types';
import type { WorkspaceManager } from './workspaces';

export interface McpToolContext {
  repoRoot: string;
  policy: McpPolicy;
  enableChatgptBrowser?: boolean;
  /**
   * The local config records the publicationMerge consent of this profile.
   * Set by `createMcpToolContext`; `false` hides the merge tool from listing
   * and refuses its call, so a grant that predates the capability cannot use
   * it without rerunning setup. Test-built contexts without the field follow
   * the policy capability alone.
   */
  publicationMergeConsented?: boolean;
  workspaceManager?: WorkspaceManager;
  codingWorkspaceManager?: CodingWorkspaceManager;
  processManager?: McpProcessSessionManager;
  sessionOwnerId?: string;
  codeGraphAdapter?: GeneralRepoCodeGraphAdapter;
}

function codingContext(ctx: McpToolContext): CodingToolContext {
  if (!ctx.codingWorkspaceManager || !ctx.processManager || !ctx.sessionOwnerId) {
    throw new Error('coding MCP runtime is not initialized');
  }
  return {
    repoRoot: ctx.repoRoot,
    policy: ctx.policy,
    ownerId: ctx.sessionOwnerId,
    workspaceManager: ctx.codingWorkspaceManager,
    processManager: ctx.processManager,
    codeGraphAdapter: ctx.codeGraphAdapter,
  };
}

function readerContext(ctx: McpToolContext) {
  const reader = createReaderToolContext(ctx.repoRoot, ctx.policy, ctx.workspaceManager);
  ctx.workspaceManager = reader.workspaceManager;
  return reader;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

const DEFAULT_DISCOVERY_DEPTH = 7;
const DEFAULT_DISCOVERY_LIMIT = 25;
const DISCOVERY_SKIP_DIRS = new Set([
  '.bun',
  '.codegraph',
  '.local',
  '.Trash',
  '.worktrees',
  '.cache',
  '.git',
  '.npm',
  '.pnpm-store',
  '.repo-harness',
  '.rustup',
  'Applications',
  'Caches',
  'Library',
  'Movies',
  'Music',
  'Pictures',
  'System',
  'Volumes',
  'bin',
  'build',
  'coverage',
  'codex-backups',
  'dev',
  'dist',
  'node_modules',
  'private',
  'proc',
  'sbin',
  'usr',
]);

function textResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
    structuredContent: typeof value === 'string' ? undefined : value,
  };
}

function errorResult(code: string, message: string, details?: unknown): CallToolResult {
  return textResult({ error: { code, message: redactMcpText(message).text, details } });
}

function audit(ctx: McpToolContext, tool: string, status: 'ok' | 'blocked' | 'failed', input: unknown, targetPath?: string, error?: string): void {
  tryWriteMcpAuditEntry(ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool,
    status,
    targetPath,
    inputHash: hashMcpInput(input),
    error,
  });
}

function repoSummary(repoRoot: string): { repoRoot: string; adopted: boolean; branch: string | null; workflowRoots: Array<{ path: string; exists: boolean }> } {
  const roots = ['docs/spec.md', 'docs/prds', '.ai/harness/handoff', '.ai/harness/checks'];
  return {
    repoRoot,
    adopted: isRepoHarnessAdopted(repoRoot),
    branch: currentGitBranch(repoRoot),
    workflowRoots: roots.map((path) => ({ path, exists: existsSync(join(repoRoot, path)) })),
  };
}

function isDiscoverableHarnessRepo(path: string): boolean {
  return isRepoHarnessAdopted(path);
}

function normalizeRepoSearchTerm(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\/+/g, '/')
    .toLowerCase();
  if (normalized === '.' || normalized === '..') return '';
  return normalized;
}

function repoMatchesQuery(repoRoot: string, query: string): boolean {
  const normalizedQuery = normalizeRepoSearchTerm(query);
  if (!normalizedQuery) return true;
  const normalizedRoot = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const repoName = basename(repoRoot).toLowerCase();
  return repoName === normalizedQuery ||
    repoName.includes(normalizedQuery) ||
    normalizedRoot === normalizedQuery ||
    normalizedRoot.endsWith(`/${normalizedQuery}`) ||
    normalizedRoot.includes(`/${normalizedQuery}/`) ||
    normalizedRoot.includes(normalizedQuery);
}

function repoMatchesAliasExactly(repoRoot: string, query: string): boolean {
  const normalizedQuery = normalizeRepoSearchTerm(query);
  if (!normalizedQuery) return false;
  const normalizedRoot = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return basename(repoRoot).toLowerCase() === normalizedQuery ||
    normalizedRoot === normalizedQuery ||
    normalizedRoot.endsWith(`/${normalizedQuery}`);
}

function discoveryDefaultRoots(ctx: McpToolContext): string[] {
  const configured = [...(ctx.policy.discoveryRoots ?? []), ...(ctx.policy.allowedRoots ?? [])]
    .map((path) => resolve(path))
    .filter((path) => existsSync(path));
  if (configured.length > 0) return Array.from(new Set(configured));
  if (ctx.repoRoot !== '/') return [ctx.repoRoot];
  const home = homedir();
  const candidates = [
    join(home, 'Projects'),
    join(home, 'Documents'),
    join(home, 'Developer'),
    home,
    '/Users',
    '/Volumes',
    '/opt',
    '/tmp',
  ];
  return Array.from(new Set(candidates.map((path) => resolve(path)))).filter((path) => existsSync(path));
}

function discoverySortWeight(repoRoot: string, query = ''): string {
  const normalizedQuery = normalizeRepoSearchTerm(query);
  const repoName = basename(repoRoot).toLowerCase();
  const normalizedRoot = repoRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const queryWeight = !normalizedQuery
    ? '0'
    : repoName === normalizedQuery || normalizedRoot.endsWith(`/${normalizedQuery}`)
      ? '0'
      : repoName.startsWith(normalizedQuery)
        ? '1'
        : repoName.includes(normalizedQuery)
          ? '2'
          : normalizedRoot.includes(normalizedQuery)
            ? '3'
            : '4';
  const home = homedir();
  const projects = join(home, 'Projects');
  const locationWeight = repoRoot.startsWith(`${projects}/`) || repoRoot === projects
    ? '0'
    : repoRoot.startsWith(`${home}/`) || repoRoot === home
      ? '1'
      : repoRoot.startsWith('/Volumes/')
        ? '2'
        : repoRoot.startsWith('/tmp/') || repoRoot.startsWith('/private/tmp/')
          ? '9'
          : '5';
  return `${queryWeight}:${locationWeight}:${repoRoot}`;
}

function numberArg(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function stringArgList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function canonicalDirectory(path: string): string | null {
  const absolute = resolve(path);
  try {
    if (!statSync(absolute).isDirectory()) return null;
    return realpathSync(absolute);
  } catch (_error) {
    return null;
  }
}

function authorizedDiscoveryRoots(ctx: McpToolContext): string[] {
  return Array.from(new Set([
    ...(isRepoHarnessAdopted(ctx.repoRoot) ? [ctx.repoRoot] : []),
    ...(ctx.policy.discoveryRoots ?? []),
    ...(ctx.policy.allowedRoots ?? []),
  ].map((path) => canonicalDirectory(path)).filter((path): path is string => path !== null)));
}

function isAuthorizedDiscoveryRoot(ctx: McpToolContext, root: string): boolean {
  const canonical = canonicalDirectory(root);
  if (!canonical) return false;
  return authorizedDiscoveryRoots(ctx).some((authorized) => isPathInside(authorized, canonical));
}

function addDiscoveredRepo(ctx: McpToolContext, repos: Map<string, ReturnType<typeof repoSummary>>, repoRoot: string, query = ''): void {
  const root = canonicalDirectory(resolveMcpRepoRoot(repoRoot));
  if (!root || !isRepoHarnessAdopted(root)) return;
  if (!repoMatchesQuery(root, query)) return;
  if (!repos.has(root)) repos.set(root, repoSummary(root));
  try {
    ctx.workspaceManager?.ensureAllowedRoot(root);
  } catch (_error) {
    // Discovery should report the repo even if a transient filesystem error
    // prevents opening it as a workspace in this session.
  }
}

function discoverHarnessRepos(ctx: McpToolContext, args: Record<string, unknown> = {}): { scannedRoots: string[]; query: string | null; repos: ReturnType<typeof repoSummary>[]; truncated: boolean } {
  const query = normalizeRepoSearchTerm(args.query) || normalizeRepoSearchTerm(args.name) || normalizeRepoSearchTerm(args.repo_path);
  const requestedRoots = stringArgList(args.roots);
  const roots = (requestedRoots.length > 0 ? requestedRoots : discoveryDefaultRoots(ctx))
    .map((path) => resolve(path))
    .filter((path) => existsSync(path))
    .filter((path) => isAuthorizedDiscoveryRoot(ctx, path));
  const maxDepth = numberArg(args.max_depth, DEFAULT_DISCOVERY_DEPTH, 1, 12);
  const limit = numberArg(args.limit, DEFAULT_DISCOVERY_LIMIT, 1, 100);
  const repos = new Map<string, ReturnType<typeof repoSummary>>();
  for (const entry of readRegisteredRepoHarnessRepos({ adoptedOnly: true })) {
    addDiscoveredRepo(ctx, repos, entry.path, query);
    if (repos.size >= limit) break;
  }
  const queue = roots.map((path) => ({ path, depth: 0 }));
  let truncated = false;

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (!current) continue;
    if (repos.size >= limit) {
      truncated = true;
      break;
    }
    let currentStat;
    try {
      currentStat = statSync(current.path);
    } catch (_error) {
      continue;
    }
    if (!currentStat.isDirectory()) continue;
    if (isDiscoverableHarnessRepo(current.path)) {
      addDiscoveredRepo(ctx, repos, current.path, query);
      if (!query) continue;
    }
    if (current.depth >= maxDepth) continue;
    let entries;
    try {
      entries = readdirSync(current.path, { withFileTypes: true });
    } catch (_error) {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || DISCOVERY_SKIP_DIRS.has(entry.name)) continue;
      queue.push({ path: join(current.path, entry.name), depth: current.depth + 1 });
    }
  }

  return {
    scannedRoots: roots,
    query: query || null,
    repos: Array.from(repos.values()).sort((a, b) => discoverySortWeight(a.repoRoot, query).localeCompare(discoverySortWeight(b.repoRoot, query))),
    truncated,
  };
}

function resolveAuthorizedRepoAlias(ctx: McpToolContext, raw: string): { ok: true; repoRoot: string } | { ok: false; result: CallToolResult } | null {
  const rawSegments = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  if (isAbsolute(raw) || rawSegments.includes('.') || rawSegments.includes('..')) return null;
  const candidate = resolve(ctx.repoRoot, raw);
  if (existsSync(candidate)) return null;
  const query = normalizeRepoSearchTerm(raw);
  if (!query) return null;
  const discovery = discoverHarnessRepos(ctx, { query, limit: 10 });
  const exact = discovery.repos.filter((repo) => repoMatchesAliasExactly(repo.repoRoot, query));
  const candidates = exact.length > 0 ? exact : discovery.repos;
  if (candidates.length === 1) {
    return { ok: true, repoRoot: candidates[0].repoRoot };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      result: errorResult(
        'REPO_ALIAS_AMBIGUOUS',
        'repo_path matched multiple adopted repositories; call discover_harness_repos with query and pass an exact repo_path.',
        { repo_path: raw, matches: candidates.map((repo) => repo.repoRoot) },
      ),
    };
  }
  return null;
}

function targetRepoRoot(ctx: McpToolContext, args: Record<string, unknown>): { ok: true; repoRoot: string } | { ok: false; result: CallToolResult } {
  const raw = typeof args.repo_path === 'string' ? args.repo_path.trim() : '';
  if (!raw) {
    return { ok: true, repoRoot: ctx.repoRoot };
  }
  const alias = resolveAuthorizedRepoAlias(ctx, raw);
  if (alias) return alias;
  const candidate = isAbsolute(raw) ? raw : resolve(ctx.repoRoot, raw);
  const repoRoot = canonicalDirectory(resolveMcpRepoRoot(candidate)) ?? resolveMcpRepoRoot(candidate);
  const currentRoot = canonicalDirectory(ctx.repoRoot) ?? ctx.repoRoot;
  if (repoRoot === currentRoot) {
    return { ok: true, repoRoot };
  }
  const registered = isRegisteredRepoHarnessRoot(repoRoot);
  const explicitlyAuthorized = isRepoHarnessAdopted(repoRoot) &&
    authorizedDiscoveryRoots(ctx).some((root) => isPathInside(root, repoRoot));
  if (!registered && !explicitlyAuthorized) {
    return {
      ok: false,
      result: errorResult(
        'POLICY_DENIED',
        'repo_path must target a repo-harness adopted repo registered in ~/.repo-harness/registered-repos.json, or an adopted repo under an explicit allowed discovery root.',
        { repo_path: raw },
      ),
    };
  }
  if (!isRepoHarnessAdopted(repoRoot)) {
    return { ok: false, result: errorResult('REPO_NOT_ADOPTED', 'repo_path is not a repo-harness adopted repository.', { repo_path: raw }) };
  }
  try {
    ctx.workspaceManager?.ensureAllowedRoot(repoRoot);
  } catch (_error) {
    // Workflow tools can still use policy-scoped files even if the workspace
    // reader cannot open the root in this session.
  }
  return { ok: true, repoRoot };
}

function isProbablyBinary(bytes: Buffer): boolean {
  return bytes.subarray(0, Math.min(bytes.length, 8000)).includes(0);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fileSummary(path: string, repoRoot: string): { path: string; size: number; modifiedAt: string } | null {
  try {
    const fileStat = statSync(join(repoRoot, path));
    if (!fileStat.isFile()) return null;
    return { path, size: fileStat.size, modifiedAt: fileStat.mtime.toISOString() };
  } catch (_error) {
    return null;
  }
}

function listFilesUnder(repoRoot: string, root: string, maxFiles: number, out: string[]): void {
  if (out.length >= maxFiles) return;
  const absoluteRoot = join(repoRoot, root);
  if (!existsSync(absoluteRoot)) return;
  const rootStat = statSync(absoluteRoot);
  if (rootStat.isFile()) {
    out.push(root);
    return;
  }
  if (!rootStat.isDirectory()) return;
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (out.length >= maxFiles) return;
    const child = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      listFilesUnder(repoRoot, child, maxFiles, out);
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      out.push(child);
    }
  }
}

function workflowFileCandidates(repoRoot: string): string[] {
  const roots = [
    'AGENTS.md',
    'CLAUDE.md',
    'SKILL.md',
    'docs/spec.md',
    'docs/reference-configs',
    'docs/prds',
    'tasks/lessons.md',
    '.ai/context',
    '.ai/harness/handoff',
    '.ai/harness/checks',
  ];
  const files: string[] = [];
  for (const root of roots) {
    const rootFiles: string[] = [];
    listFilesUnder(repoRoot, root, 700, rootFiles);
    files.push(...rootFiles);
  }
  return Array.from(new Set(files)).sort();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'artifact';
}

function timestampPrefix(date = new Date()): string {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function prdArtifactPath(slug: string): string {
  const normalized = slugify(slug);
  const prefixed = /^\d{8}-\d{4}-/.test(normalized) ? normalized : `${timestampPrefix()}-${normalized}`;
  return `docs/prds/${prefixed}.prd.md`;
}

function frontmatter(title: string, kind: string): string {
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `kind: ${JSON.stringify(kind)}`,
    `created_at: ${JSON.stringify(new Date().toISOString())}`,
    `source: "repo-harness-mcp"`,
    '---',
    '',
  ].join('\n');
}

function bodyWithFrontmatter(title: string, kind: string, body: string): string {
  return body.trimStart().startsWith('---') ? body.trimEnd() + '\n' : `${frontmatter(title, kind)}${body.trimEnd()}\n`;
}

/**
 * The workflow-artifact write tools. Each one commits through
 * `guardedWriteFile` and accepts `expected_sha256` as its revision
 * precondition. `append_handoff_note` is deliberately not a member: append
 * concurrency is a separate design.
 */
const GUARDED_WRITE_TOOLS: readonly string[] = [
  'write_prd',
  'write_prd_from_idea',
  'write_task_goal',
];

/**
 * Parameters removed from the write surface, mapped to their replacement.
 * `server.ts` dispatches through the low-level SDK path, so per-tool
 * `inputSchema` is advisory and a retired key would otherwise be silently
 * ignored — which is exactly the last-writer-wins behavior this release
 * removes. Bounded migration window: rejected through 0.16.x, this table is
 * deleted at 0.17.0.
 */
const RETIRED_WRITE_PARAMETERS: Record<string, string> = {
  overwrite: 'expected_sha256',
};

function expectedSha256Arg(args: Record<string, unknown>): string | undefined {
  return typeof args.expected_sha256 === 'string' ? args.expected_sha256 : undefined;
}

function checkWriteToolParameters(ctx: McpToolContext, tool: string, args: Record<string, unknown>): CallToolResult | null {
  const definition = buildMcpToolDefinitions(ctx.policy).find((entry) => entry.name === tool);
  const properties = (definition?.inputSchema as { properties?: Record<string, unknown> } | undefined)?.properties;
  if (!properties) return null;
  const allowed = Object.keys(properties);
  const supplied = Object.keys(args);

  const retired = supplied.find((key) => !allowed.includes(key) && RETIRED_WRITE_PARAMETERS[key] !== undefined);
  if (retired !== undefined) {
    const replacement = RETIRED_WRITE_PARAMETERS[retired];
    audit(ctx, tool, 'blocked', args, undefined, `retired parameter: ${retired}`);
    return errorResult(
      'RETIRED_PARAMETER',
      `${retired} was removed from the repo-harness MCP workflow write tools in 0.16.1; pass ${replacement} instead. Read the target with read_workflow_file and send its sha256 as ${replacement} to replace an existing file, or omit ${replacement} to create a new one.`,
      { retired, replacement, version: '0.16.1' },
    );
  }

  const unknown = supplied.filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    audit(ctx, tool, 'blocked', args, undefined, `unknown parameters: ${unknown.join(', ')}`);
    return errorResult('UNKNOWN_PARAMETER', `unknown parameter for ${tool}: ${unknown.join(', ')}`, { unknown, allowed });
  }
  return null;
}

function writeMarkdownArtifact(
  ctx: McpToolContext,
  repoRoot: string,
  tool: string,
  relativePath: string,
  title: string,
  kind: string,
  body: string,
  expectedSha256: string | undefined,
  input: unknown,
  extra?: Record<string, unknown>,
): CallToolResult {
  const decision = resolveMcpPath(repoRoot, relativePath, ctx.policy, 'write');
  if (!decision.ok || !decision.absolutePath) {
    audit(ctx, tool, 'blocked', input, relativePath, decision.reason);
    return errorResult('POLICY_DENIED', decision.reason ?? 'path denied', { path: relativePath });
  }
  const outcome = guardedWriteFile(decision.absolutePath, relativePath, bodyWithFrontmatter(title, kind, body), expectedSha256);
  if (!outcome.ok) {
    audit(ctx, tool, outcome.code === 'WRITE_FAILED' ? 'failed' : 'blocked', input, relativePath, outcome.code);
    return errorResult(outcome.code, outcome.message, outcome.details);
  }
  audit(ctx, tool, 'ok', input, relativePath);
  return textResult({
    status: 'written',
    repoRoot,
    path: relativePath,
    sha256: outcome.sha256,
    previousSha256: outcome.previousSha256,
    ...(extra ?? {}),
  });
}

// Canonical anti-extras clause injected into every runner-reachable surface (this
// task-goal path, the native child context,
// and subagent start context). Keep the first sentence byte-identical across all
// sources; a parity test asserts they never drift apart.
const EXECUTION_BOUNDARY = [
  'Execution boundary: implement exactly the Goal, In scope items, Allowed Paths, and Exit Criteria in this brief. Treat absent requirements as forbidden design space, not as permission to improve.',
  '',
  'Do not add optional features, alternate UX, extra integrations, migration paths, compatibility behavior, fallback behavior, telemetry, broad cleanup, refactors, new abstractions, extra docs, or polish unless that work is explicitly listed under In scope or required by Exit Criteria.',
  '',
  'If you discover useful additional work, record it under Out of scope / Future work in the notes or review artifact. Do not implement it. Do not end with unsolicited offers to do more work.',
  '',
  'If the requested outcome cannot be completed without expanding scope, fail closed: stop, name the missing decision, and cite the exact file/section that blocks execution.',
].join('\n');

function withExecutionBoundary(body: string): string {
  const firstSentence = EXECUTION_BOUNDARY.split('\n', 1)[0]!;
  if (body.includes(firstSentence)) return body;
  const heading = '## Execution boundary';
  const headingAt = body.indexOf(heading);
  if (headingAt < 0) return body;
  const insertAt = headingAt + heading.length;
  return `${body.slice(0, insertAt)}\n\n${EXECUTION_BOUNDARY}${body.slice(insertAt)}`;
}

function validateGoal(body: string): string[] {
  return [
    '# Task Goal',
    '## Source of truth',
    '## Role',
    '## Scope',
    '## Execution boundary',
    '## Required workflow',
    '## Required checks',
    '## Done when',
  ].filter((section) => !body.includes(section));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
}

function renderPrdFromIdeaBody(args: Record<string, unknown>): string {
  const title = String(args.title ?? 'Untitled PRD').trim() || 'Untitled PRD';
  const idea = String(args.idea ?? '').trim();
  const problem = String(args.problem ?? '').trim() || 'TBD: clarify the concrete user or workflow pain.';
  const users = stringList(args.users);
  const goals = stringList(args.goals);
  const nonGoals = stringList(args.non_goals);
  const success = stringList(args.success_criteria);
  const notes = String(args.notes ?? '').trim();
  return [
    `# ${title}`,
    '',
    '> **Status**: Draft',
    '',
    '## Idea',
    '',
    idea || 'TBD: summarize the originating idea.',
    '',
    '## Problem',
    '',
    problem,
    '',
    '## Users',
    '',
    ...(users.length > 0 ? users.map((entry) => `- ${entry}`) : ['- TBD']),
    '',
    '## Goals',
    '',
    ...(goals.length > 0 ? goals.map((entry) => `- ${entry}`) : ['- Turn the idea into a reviewable repo-harness PRD.']),
    '',
    '## Non-goals',
    '',
    ...(nonGoals.length > 0 ? nonGoals.map((entry) => `- ${entry}`) : ['- Directly executing implementation work from ChatGPT.']),
    '',
    '## Acceptance Criteria',
    '',
    ...(success.length > 0 ? success.map((entry) => `- [ ] ${entry}`) : ['- [ ] The PRD states reviewable acceptance criteria.']),
    '',
    '## Workflow Contract',
    '',
    '- PRD is the source of product intent.',
    '- The GitHub issue owns task identity and execution scope.',
    '- Codex execution must happen through a host-native `/goal` prompt or local Codex session, not through remote MCP execution.',
    '',
    '## Handoff Notes',
    '',
    notes || '- Generated from an idea through repo-harness MCP.',
  ].join('\n');
}

function parseBrowserProvider(value: unknown): BrowserProviderName | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'oracle' || value === 'native') return value;
  throw new Error(`invalid browser provider: ${String(value)}`);
}

function parseNativeBrowserChannel(value: unknown): NativeBrowserChannel | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'chrome' || value === 'chrome-beta' || value === 'chrome-dev' || value === 'chrome-canary') return value;
  throw new Error(`invalid browser channel: ${String(value)}`);
}

/**
 * The listing surface of one context. A grant that predates the
 * publicationMerge capability hides the merge tool here as well as at call
 * time, so tools/list cannot advertise a merge the consent never covered.
 */
export function visibleMcpToolDefinitions(ctx: McpToolContext): McpToolDefinition[] {
  const definitions = buildMcpToolDefinitions(ctx.policy, { enableChatgptBrowser: ctx.enableChatgptBrowser === true });
  if (ctx.policy.capabilities.publicationMerge && ctx.publicationMergeConsented === false) {
    return definitions.filter((definition) => definition.name !== PUBLICATION_MERGE_TOOL_NAME);
  }
  return definitions;
}

export function buildMcpToolDefinitions(policy: McpPolicy, opts: { enableChatgptBrowser?: boolean } = {}): McpToolDefinition[] {
  const mergeTools = policy.capabilities.publicationMerge ? buildPublicationMergeToolDefinitions() : [];
  // The dispatch surface is exclusive: a task-dispatch token reaches no workflow, file or shell tool.
  const reviewPublishTools = policy.profile === 'orchestrator' ? buildReviewPublishToolDefinitions() : [];
  if (policy.capabilities.taskDispatch) return [...buildHerdrToolDefinitions(), ...reviewPublishTools, ...mergeTools];
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, openWorldHint: false, destructiveHint: false };
  const optionalRepoSchema = {
    type: 'object',
    properties: { repo_path: { type: 'string' } },
    additionalProperties: false,
  };
  const discoverySchema = {
    type: 'object',
    properties: {
      query: { type: 'string' },
      name: { type: 'string' },
      repo_path: { type: 'string' },
      roots: { type: 'array', items: { type: 'string' } },
      max_depth: { type: 'number' },
      limit: { type: 'number' },
    },
    additionalProperties: false,
  };
  const stringPathSchema = {
    type: 'object',
    properties: { path: { type: 'string' }, repo_path: { type: 'string' } },
    required: ['path'],
    additionalProperties: false,
  };
  const markdownWriterSchema = {
    type: 'object',
    properties: {
      repo_path: { type: 'string' },
      title: { type: 'string' },
      slug: { type: 'string' },
      body: { type: 'string' },
      expected_sha256: { type: 'string' },
    },
    required: ['title', 'slug', 'body'],
    additionalProperties: false,
  };
  const ideaPrdSchema = {
    type: 'object',
    properties: {
      repo_path: { type: 'string' },
      title: { type: 'string' },
      slug: { type: 'string' },
      idea: { type: 'string' },
      problem: { type: 'string' },
      users: { type: 'array', items: { type: 'string' } },
      goals: { type: 'array', items: { type: 'string' } },
      non_goals: { type: 'array', items: { type: 'string' } },
      success_criteria: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
      expected_sha256: { type: 'string' },
    },
    required: ['title', 'slug', 'idea'],
    additionalProperties: false,
  };
  const browserRunSchema = {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      title: { type: 'string' },
      files: { type: 'array', items: { type: 'string' } },
      model: { type: 'string' },
      thinking: {
        type: 'string',
        description: 'Thinking level passed to Oracle (validated by Oracle; e.g. light|standard|extended|extra-high|pro|heavy or UI alias instant|medium|high|xhigh)',
      },
      provider: { type: 'string', enum: ['oracle', 'native'] },
      browserChannel: { type: 'string', enum: ['chrome', 'chrome-beta', 'chrome-dev', 'chrome-canary'] },
      followups: { type: 'array', items: { type: 'string' } },
      writeOutput: { type: 'string' },
      overwriteOutput: { type: 'boolean' },
      timeoutMs: { type: 'number' },
      dryRun: { type: 'boolean' },
    },
    required: ['prompt'],
    additionalProperties: false,
  };
  const browserSessionSchema = {
    type: 'object',
    properties: { sessionId: { type: 'string' } },
    required: ['sessionId'],
    additionalProperties: false,
  };
  const tools: McpToolDefinition[] = [
    { name: 'harness_status', description: 'Return repo-harness adoption and workflow status. Pass repo_path after discover_harness_repos when targeting another adopted repo.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'harness_doctor', description: 'Return compact MCP setup diagnostics.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'discover_harness_repos', description: 'Discover repo-harness adopted repositories from the global registry and explicit allowed discovery roots. Pass query, name, or repo_path for repo-like user inputs such as "my-app/".', inputSchema: discoverySchema, annotations: readOnly },
    { name: 'list_workflow_files', description: 'List policy-readable workflow files. Pass repo_path to target a registered adopted repo.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'read_workflow_file', description: 'Read one policy-allowed workflow file path from the current or target registered repo.', inputSchema: stringPathSchema, annotations: readOnly },
    { name: 'latest_handoff', description: 'Return latest repo-harness handoff artifacts.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'latest_checks', description: 'Return latest repo-harness check artifacts.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'list_prds', description: 'List PRD artifacts under docs/prds.', inputSchema: optionalRepoSchema, annotations: readOnly },
    ...buildStateToolDefinitions(),
    ...buildFleetToolDefinitions(),
    ...mergeTools,
    { name: 'write_prd', description: 'Write a PRD under docs/prds/*.prd.md.', inputSchema: markdownWriterSchema, annotations: write },
    { name: 'write_prd_from_idea', description: 'Turn a product idea into a strict-compatible draft PRD under docs/prds/*.prd.md.', inputSchema: ideaPrdSchema, annotations: write },
    {
      name: 'write_task_goal',
      description: 'Write .ai/harness/handoff/task-goal.md after required section validation.',
      inputSchema: {
        type: 'object',
        properties: { repo_path: { type: 'string' }, body: { type: 'string' }, expected_sha256: { type: 'string' } },
        required: ['body'],
        additionalProperties: false,
      },
      annotations: write,
    },
    {
      name: 'append_handoff_note',
      description: 'Append a timestamped planner handoff note.',
      inputSchema: {
        type: 'object',
        properties: { repo_path: { type: 'string' }, actor: { type: 'string' }, body: { type: 'string' } },
        required: ['body'],
        additionalProperties: false,
      },
      annotations: write,
    },
  ];

  if (policy.capabilities.workspaceReader) {
    tools.push(...buildReaderToolDefinitions(policy));
  }
  if (policy.capabilities.workspaceCoder && policy.execution.codingShell) {
    tools.push(...buildCodingToolDefinitions());
  }
  if (opts.enableChatgptBrowser === true) {
    tools.push(
      {
        name: 'run_chatgpt_browser_consult',
        description: 'Run a local ChatGPT Web browser consult through repo-harness. This may create a real ChatGPT Web conversation unless dryRun is true.',
        inputSchema: browserRunSchema,
        annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
      },
      {
        name: 'read_chatgpt_browser_session',
        description: 'Read a saved repo-harness ChatGPT browser consult session.',
        inputSchema: browserSessionSchema,
        annotations: readOnly,
      },
      {
        name: 'list_chatgpt_browser_sessions',
        description: 'List saved repo-harness ChatGPT browser consult sessions.',
        inputSchema: {
          type: 'object',
          properties: { limit: { type: 'number' } },
          additionalProperties: false,
        },
        annotations: readOnly,
      },
      {
        name: 'open_chatgpt_browser_session',
        description: 'Return the ChatGPT conversation URL for a saved browser session. The MCP tool does not launch the local browser.',
        inputSchema: browserSessionSchema,
        annotations: readOnly,
      },
      {
        name: 'continue_chatgpt_browser_session',
        description: 'Create a follow-up ChatGPT browser consult record linked to an existing session.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            prompt: { type: 'string' },
            dryRun: { type: 'boolean' },
          },
          required: ['sessionId', 'prompt'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
      },
    );
  }
  return tools;
}

export async function callMcpTool(ctx: McpToolContext, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  try {
    if (name === PUBLICATION_MERGE_TOOL_NAME) {
      if (ctx.publicationMergeConsented === false) {
        audit(ctx, name, 'blocked', args, undefined, 'TOOL_NOT_AVAILABLE');
        return errorResult('TOOL_NOT_AVAILABLE', `${name} requires rerunning setup for the ${ctx.policy.profile} profile: the recorded grant predates the publicationMerge capability.`);
      }
      if (!ctx.policy.capabilities.publicationMerge) {
        audit(ctx, name, 'blocked', args, undefined, 'TOOL_NOT_AVAILABLE');
        return errorResult('TOOL_NOT_AVAILABLE', `${name} is not available in the ${ctx.policy.profile} profile.`);
      }
      return callPublicationMergeTool({ repoRoot: ctx.repoRoot, policy: ctx.policy }, args);
    }
    if (name === REVIEW_PUBLISH_TOOL_NAME) {
      if (ctx.policy.profile !== 'orchestrator') {
        audit(ctx, name, 'blocked', args, undefined, 'TOOL_NOT_AVAILABLE');
        return errorResult('TOOL_NOT_AVAILABLE', `${name} is only available in the orchestrator profile.`);
      }
      return callReviewPublishTool({ repoRoot: ctx.repoRoot, policy: ctx.policy }, args);
    }
    if (ctx.policy.capabilities.taskDispatch) {
      if (isHerdrTool(name)) return await callHerdrTool({ repoRoot: ctx.repoRoot }, name, args);
      audit(ctx, name, 'blocked', args, undefined, 'TOOL_NOT_AVAILABLE');
      return errorResult('TOOL_NOT_AVAILABLE', `${name} is not available in the ${ctx.policy.profile} profile.`);
    }
    if (name === 'prepare_codex_goal_from_sprint' || name === 'write_codex_goal') {
      return errorResult('TOOL_RETIRED', `Upgrade to write_task_goal or repo-harness mcp prepare-goal --issue <n>; the retired tool has no alias.`);
    }
    if (isCodingTool(name) && ctx.policy.capabilities.workspaceCoder) {
      return callCodingTool(codingContext(ctx), name, args);
    }
    if (isReaderTool(name, ctx.policy)) {
      if (!ctx.policy.capabilities.workspaceReader) {
        return errorResult('TOOL_NOT_AVAILABLE', 'reader tools require the workspace reader capability to be enabled in MCP config.');
      }
      return callReaderTool(readerContext(ctx), name, args);
    }
    if (isStateTool(name)) {
      const target = targetRepoRoot(ctx, args);
      if (!target.ok) return target.result;
      const result = callStateTool({
        repoRoot: target.repoRoot,
        mcpPolicyProfile: ctx.policy.profile,
      }, name);
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    if (isFleetTool(name)) {
      const argumentError = fleetToolArgumentError(name, args);
      if (argumentError !== undefined) return errorResult('INVALID_ARGUMENT', argumentError);
      return callFleetTool({ repoRoot: ctx.repoRoot, policy: ctx.policy }, name, args);
    }
    if (GUARDED_WRITE_TOOLS.includes(name)) {
      // The low-level SDK dispatch does not enforce per-tool inputSchema, so an
      // undeclared or retired key must be rejected here, before any repo is
      // targeted or any path is resolved.
      const rejected = checkWriteToolParameters(ctx, name, args);
      if (rejected) return rejected;
    }
    switch (name) {
      case 'harness_status': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const summary = repoSummary(target.repoRoot);
        audit(ctx, name, 'ok', args);
        return textResult({
          repoRoot: summary.repoRoot,
          adopted: summary.adopted,
          profile: ctx.policy.profile,
          branch: summary.branch,
          workflowRoots: summary.workflowRoots,
        });
      }
      case 'harness_doctor': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        // MCP config has one storage authority (~/.repo-harness, or
        // REPO_HARNESS_HOME); it is not per-repo, so this must not probe the
        // retired <repo>/.repo-harness path. Same shape as runMcpDoctor.
        const localConfig = Boolean(loadMcpLocalConfig());
        const codexConfig = existsSync(join(target.repoRoot, '.codex', 'config.toml'));
        audit(ctx, name, 'ok', args);
        return textResult({
          status: isRepoHarnessAdopted(target.repoRoot) ? 'ready_local' : 'not_adopted',
          repo: target.repoRoot,
          profile: ctx.policy.profile,
          mcp: {
            localConfig,
            policy: 'builtin',
            deniedPaths: ctx.policy.denyGlobs.length,
          },
          codex: {
            configured: codexConfig,
            fix: codexConfig ? null : 'repo-harness mcp setup codex --repo . --scope project',
          },
          chatgpt: {
            localEndpoint: 'http://127.0.0.1:8765/mcp',
            manualStepsRequired: true,
            guide: 'docs/repo-harness-chatgpt-mcp-setup.md',
          },
        });
      }
      case 'discover_harness_repos': {
        const discovery = discoverHarnessRepos(ctx, args);
        audit(ctx, name, 'ok', args);
        return textResult(discovery);
      }
      case 'list_workflow_files': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const files = workflowFileCandidates(target.repoRoot)
          .filter((path) => resolveMcpPath(target.repoRoot, path, ctx.policy, 'read').ok)
          .map((path) => fileSummary(path, target.repoRoot))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .filter((entry) => entry.size <= ctx.policy.maxFileBytes);
        audit(ctx, name, 'ok', args);
        return textResult({ files });
      }
      case 'read_workflow_file': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const path = typeof args.path === 'string' ? args.path : '';
        const decision = resolveMcpPath(target.repoRoot, path, ctx.policy, 'read');
        if (!decision.ok || !decision.absolutePath || !decision.relativePath) {
          audit(ctx, name, 'blocked', args, path, decision.reason);
          return errorResult('POLICY_DENIED', decision.reason ?? 'path denied', { path });
        }
        const fileStat = statSync(decision.absolutePath);
        if (!fileStat.isFile()) return errorResult('NOT_A_FILE', `path is not a file: ${decision.relativePath}`);
        if (fileStat.size > ctx.policy.maxFileBytes) return errorResult('FILE_TOO_LARGE', `file exceeds ${ctx.policy.maxFileBytes} bytes`);
        const bytes = readFileSync(decision.absolutePath);
        if (isProbablyBinary(bytes)) return errorResult('BINARY_FILE', 'binary files are not supported');
        const raw = bytes.toString('utf-8');
        const redacted = redactMcpText(raw);
        audit(ctx, name, 'ok', args, decision.relativePath);
        return textResult({
          path: decision.relativePath,
          size: fileStat.size,
          sha256: sha256(raw),
          redactions: redacted.redactions,
          content: redacted.text,
        });
      }
      case 'latest_handoff': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const paths = ['.ai/harness/handoff/resume.md', '.ai/harness/handoff/task-goal.md', '.ai/harness/handoff/chatgpt-plan.md'];
        const handoff = paths.map((path) => {
          const decision = resolveMcpPath(target.repoRoot, path, ctx.policy, 'read');
          if (!decision.ok || !decision.absolutePath || !existsSync(decision.absolutePath)) return { path, exists: false };
          const content = redactMcpText(readFileSync(decision.absolutePath, 'utf-8')).text;
          return { path, exists: true, preview: content.split(/\r?\n/).slice(0, 10).join('\n').slice(0, 1600) };
        });
        audit(ctx, name, 'ok', args);
        return textResult({ handoff });
      }
      case 'latest_checks': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const files = workflowFileCandidates(target.repoRoot)
          .filter((path) => path.startsWith('.ai/harness/checks/'))
          .filter((path) => resolveMcpPath(target.repoRoot, path, ctx.policy, 'read').ok)
          .map((path) => fileSummary(path, target.repoRoot))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
          .slice(0, 20);
        audit(ctx, name, 'ok', args);
        return textResult({ files });
      }
      case 'list_prds': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const files: string[] = [];
        listFilesUnder(target.repoRoot, 'docs/prds', 200, files);
        audit(ctx, name, 'ok', args);
        return textResult({ files: files.map((path) => fileSummary(path, target.repoRoot)).filter(Boolean) });
      }
      case 'write_prd': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        return writeMarkdownArtifact(ctx, target.repoRoot, name, prdArtifactPath(slug), title, 'prd', String(args.body ?? ''), expectedSha256Arg(args), args);
      }
      case 'write_prd_from_idea': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        const body = renderPrdFromIdeaBody(args);
        return writeMarkdownArtifact(ctx, target.repoRoot, name, prdArtifactPath(slug), title, 'prd', body, expectedSha256Arg(args), args);
      }
      case 'write_task_goal': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const body = withExecutionBoundary(String(args.body ?? ''));
        const missing = validateGoal(body);
        if (body.trim().length < 120 || missing.length > 0) {
          audit(ctx, name, 'blocked', args, '.ai/harness/handoff/task-goal.md', `missing required goal sections: ${missing.join(', ')}`);
          return errorResult('INVALID_GOAL', 'task goal is missing required sections or is too small.', { missing });
        }
        return writeMarkdownArtifact(ctx, target.repoRoot, name, '.ai/harness/handoff/task-goal.md', 'Task Goal', 'task-goal', body, expectedSha256Arg(args), args);
      }
      case 'append_handoff_note': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const path = '.ai/harness/handoff/chatgpt-plan.md';
        const decision = resolveMcpPath(target.repoRoot, path, ctx.policy, 'write');
        if (!decision.ok || !decision.absolutePath) return errorResult('POLICY_DENIED', decision.reason ?? 'path denied');
        mkdirSync(dirname(decision.absolutePath), { recursive: true });
        const actor = String(args.actor ?? 'chatgpt-planner').trim() || 'chatgpt-planner';
        const body = String(args.body ?? '').trim();
        const block = [``, `## ${new Date().toISOString()}`, ``, `Actor: ${actor}`, ``, body, ``].join('\n');
        appendFileSync(decision.absolutePath, block, 'utf-8');
        audit(ctx, name, 'ok', args, path);
        return textResult({ status: 'appended', repoRoot: target.repoRoot, path });
      }
      case 'run_chatgpt_browser_consult': {
        if (ctx.enableChatgptBrowser !== true) return errorResult('TOOL_DISABLED', 'ChatGPT browser tools require repo-harness mcp serve --enable-chatgpt-browser');
        const result = await runBrowserConsult({
          repoRoot: ctx.repoRoot,
          title: typeof args.title === 'string' ? args.title : undefined,
          prompt: String(args.prompt ?? ''),
          files: stringList(args.files).map((path) => ({ path })),
          followups: stringList(args.followups),
          model: typeof args.model === 'string' ? args.model : undefined,
          thinking: typeof args.thinking === 'string' ? args.thinking : undefined,
          provider: parseBrowserProvider(args.provider),
          browserChannel: parseNativeBrowserChannel(args.browserChannel),
          writeOutput: typeof args.writeOutput === 'string' ? args.writeOutput : undefined,
          writeOutputPolicy: 'mcp',
          overwriteOutput: args.overwriteOutput === true,
          timeoutMs: typeof args.timeoutMs === 'number' ? args.timeoutMs : undefined,
          dryRun: args.dryRun === true,
        });
        audit(ctx, name, result.error ? 'failed' : 'ok', args, result.meta.output.outputPath, result.error?.message);
        return textResult({
          sessionId: result.sessionId,
          status: result.status,
          output: result.output,
          conversationUrl: result.conversationUrl,
          paths: {
            sessionDir: result.paths.sessionDir,
            output: result.paths.output,
            transcript: result.paths.transcript,
          },
          dryRun: result.dryRun,
          error: result.error,
        });
      }
      case 'read_chatgpt_browser_session': {
        if (ctx.enableChatgptBrowser !== true) return errorResult('TOOL_DISABLED', 'ChatGPT browser tools require repo-harness mcp serve --enable-chatgpt-browser');
        const sessionId = String(args.sessionId ?? '').trim();
        const session = readSession(ctx.repoRoot, sessionId);
        audit(ctx, name, 'ok', args);
        return textResult({
          meta: session.meta,
          output: session.output,
          transcript: session.transcript,
        });
      }
      case 'list_chatgpt_browser_sessions': {
        if (ctx.enableChatgptBrowser !== true) return errorResult('TOOL_DISABLED', 'ChatGPT browser tools require repo-harness mcp serve --enable-chatgpt-browser');
        const limit = typeof args.limit === 'number' && Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 20;
        const sessions = listSessions(ctx.repoRoot, limit);
        audit(ctx, name, 'ok', args);
        return textResult({ sessions });
      }
      case 'open_chatgpt_browser_session': {
        if (ctx.enableChatgptBrowser !== true) return errorResult('TOOL_DISABLED', 'ChatGPT browser tools require repo-harness mcp serve --enable-chatgpt-browser');
        const sessionId = String(args.sessionId ?? '').trim();
        const result = openSession(ctx.repoRoot, sessionId, false);
        audit(ctx, name, 'ok', args);
        return textResult({ sessionId, url: result.url, launched: false });
      }
      case 'continue_chatgpt_browser_session': {
        if (ctx.enableChatgptBrowser !== true) return errorResult('TOOL_DISABLED', 'ChatGPT browser tools require repo-harness mcp serve --enable-chatgpt-browser');
        const sessionId = String(args.sessionId ?? '').trim();
        const prompt = String(args.prompt ?? '').trim();
        const result = await runBrowserFollowup({
          repoRoot: ctx.repoRoot,
          sessionId,
          title: `followup ${sessionId}`,
          prompt,
          dryRun: args.dryRun === true,
        });
        audit(ctx, name, result.error ? 'failed' : 'ok', args, result.meta.output.outputPath, result.error?.message);
        return textResult({
          sourceSessionId: sessionId,
          sessionId: result.sessionId,
          status: result.status,
          output: result.output,
          paths: {
            output: result.paths.output,
            transcript: result.paths.transcript,
          },
          error: result.error,
        });
      }
      default:
        return errorResult('UNKNOWN_TOOL', `unknown MCP tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audit(ctx, name, 'failed', args, undefined, message);
    return errorResult('TOOL_FAILED', message);
  }
}