import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync, appendFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, isAbsolute, join, resolve } from 'path';
import { isRegisteredRepoHarnessRoot, readRegisteredRepoHarnessRepos } from '../../effects/repo-registry';
import { runProcess } from '../../effects/process-runner';
import { runHelper } from '../runtime/helper-runner';
import { listSessions, openSession, readSession, runBrowserConsult, runBrowserFollowup } from '../chatgpt-browser/engine';
import type { BrowserProviderName, NativeBrowserChannel, ThinkingLevel } from '../chatgpt-browser/types';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { isPathInside, resolveMcpPath } from './paths';
import { buildReaderToolDefinitions, callReaderTool, createReaderToolContext, isReaderTool } from './reader-tools';
import { currentGitBranch, isRepoHarnessAdopted, resolveMcpRepoRoot } from './repo';
import { redactMcpText } from './redaction';
import type { McpAgentRunnerName, McpPolicy } from './types';
import type { WorkspaceManager } from './workspaces';

export interface McpToolContext {
  repoRoot: string;
  policy: McpPolicy;
  enableChatgptBrowser?: boolean;
  workspaceManager?: WorkspaceManager;
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
const DEFAULT_DISCOVERY_LIMIT = 12;
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
  const roots = ['docs/spec.md', 'plans', 'tasks/current.md', '.ai/harness/handoff', '.ai/harness/checks'];
  return {
    repoRoot,
    adopted: isRepoHarnessAdopted(repoRoot),
    branch: currentGitBranch(repoRoot),
    workflowRoots: roots.map((path) => ({ path, exists: existsSync(join(repoRoot, path)) })),
  };
}

function isFullDiskRead(ctx: McpToolContext): boolean {
  return ctx.policy.allowAbsoluteRead === true && ctx.policy.readGlobs.includes('**');
}

function isDiscoverableHarnessRepo(path: string): boolean {
  return existsSync(join(path, '.ai', 'harness', 'policy.json')) || existsSync(join(path, 'tasks', 'current.md'));
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

function discoverySortWeight(repoRoot: string): string {
  const home = homedir();
  const projects = join(home, 'Projects');
  if (repoRoot.startsWith(`${projects}/`) || repoRoot === projects) return `0:${repoRoot}`;
  if (repoRoot.startsWith(`${home}/`) || repoRoot === home) return `1:${repoRoot}`;
  if (repoRoot.startsWith('/Volumes/')) return `2:${repoRoot}`;
  if (repoRoot.startsWith('/tmp/') || repoRoot.startsWith('/private/tmp/')) return `9:${repoRoot}`;
  return `5:${repoRoot}`;
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
  if (isFullDiskRead(ctx)) return true;
  return authorizedDiscoveryRoots(ctx).some((authorized) => isPathInside(authorized, canonical));
}

function addDiscoveredRepo(ctx: McpToolContext, repos: Map<string, ReturnType<typeof repoSummary>>, repoRoot: string): void {
  const root = canonicalDirectory(resolveMcpRepoRoot(repoRoot));
  if (!root || !isRepoHarnessAdopted(root)) return;
  if (!repos.has(root)) repos.set(root, repoSummary(root));
  try {
    ctx.workspaceManager?.ensureAllowedRoot(root);
  } catch (_error) {
    // Discovery should report the repo even if a transient filesystem error
    // prevents opening it as a workspace in this session.
  }
}

function discoverHarnessRepos(ctx: McpToolContext, args: Record<string, unknown> = {}): { scannedRoots: string[]; repos: ReturnType<typeof repoSummary>[]; truncated: boolean } {
  const requestedRoots = stringArgList(args.roots);
  const roots = (requestedRoots.length > 0 ? requestedRoots : discoveryDefaultRoots(ctx))
    .map((path) => resolve(path))
    .filter((path) => existsSync(path))
    .filter((path) => isAuthorizedDiscoveryRoot(ctx, path));
  const maxDepth = numberArg(args.max_depth, DEFAULT_DISCOVERY_DEPTH, 1, 12);
  const limit = numberArg(args.limit, DEFAULT_DISCOVERY_LIMIT, 1, 100);
  const repos = new Map<string, ReturnType<typeof repoSummary>>();
  for (const entry of readRegisteredRepoHarnessRepos({ adoptedOnly: true })) {
    addDiscoveredRepo(ctx, repos, entry.path);
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
      addDiscoveredRepo(ctx, repos, current.path);
      continue;
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
    repos: Array.from(repos.values()).sort((a, b) => discoverySortWeight(a.repoRoot).localeCompare(discoverySortWeight(b.repoRoot))),
    truncated,
  };
}

function targetRepoRoot(ctx: McpToolContext, args: Record<string, unknown>): { ok: true; repoRoot: string } | { ok: false; result: CallToolResult } {
  const raw = typeof args.repo_path === 'string' ? args.repo_path.trim() : '';
  if (!raw) {
    return { ok: true, repoRoot: ctx.repoRoot };
  }
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
    'plans',
    'tasks',
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

function parseRunnerAgent(value: unknown): McpAgentRunnerName | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'codex' || normalized === 'claude' ? normalized : null;
}

function runnerGoalPath(args: Record<string, unknown>): string {
  return String(args.goal_path ?? '.ai/harness/handoff/codex-goal.md').trim();
}

function runnerTimeoutMs(ctx: McpToolContext, value: unknown): number {
  const requested = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(requested)) return ctx.policy.execution.runnerTimeoutMs;
  return Math.min(Math.max(Math.trunc(requested), 5_000), ctx.policy.execution.runnerTimeoutMs);
}

function runAgentGoal(ctx: McpToolContext, args: Record<string, unknown>): CallToolResult {
  if (!ctx.policy.execution.agentRunner || !ctx.policy.execution.codexRunner) {
    audit(ctx, 'run_agent_goal', 'blocked', args, undefined, 'dev runner is disabled');
    return errorResult('DEV_RUNNER_DISABLED', 'MCP dev runner is disabled. Start the orchestrator profile with an explicit dev-runner setting.');
  }

  const agent = parseRunnerAgent(args.agent);
  if (!agent) {
    audit(ctx, 'run_agent_goal', 'blocked', args, undefined, 'invalid agent');
    return errorResult('INVALID_AGENT', 'agent must be codex or claude');
  }
  if (!ctx.policy.execution.allowedAgents.includes(agent)) {
    audit(ctx, 'run_agent_goal', 'blocked', args, undefined, `agent is not allowed: ${agent}`);
    return errorResult('AGENT_DENIED', `agent is not enabled for this MCP dev runner: ${agent}`);
  }

  const goalPath = runnerGoalPath(args);
  const decision = resolveMcpPath(ctx.repoRoot, goalPath, ctx.policy, 'read');
  if (!decision.ok || !decision.absolutePath || !decision.relativePath) {
    audit(ctx, 'run_agent_goal', 'blocked', args, goalPath, decision.reason);
    return errorResult('POLICY_DENIED', decision.reason ?? 'goal path denied', { path: goalPath });
  }

  const fileStat = statSync(decision.absolutePath);
  if (!fileStat.isFile()) return errorResult('NOT_A_FILE', `goal path is not a file: ${decision.relativePath}`);
  if (fileStat.size > ctx.policy.maxFileBytes) return errorResult('FILE_TOO_LARGE', `goal exceeds ${ctx.policy.maxFileBytes} bytes`);

  const rawGoal = readFileSync(decision.absolutePath, 'utf-8');
  const redactedGoal = redactMcpText(rawGoal);
  const prompt = [
    'Execute this repo-harness dev-mode agent handoff from the local repository.',
    'Respect the goal text exactly. Do not reveal secrets or credentials in your final output.',
    '',
    redactedGoal.text,
  ].join('\n');
  const timeoutMs = runnerTimeoutMs(ctx, args.timeout_ms);
  const command = agent === 'codex'
    ? { bin: 'codex', args: ['exec', '--json', '--cd', ctx.repoRoot, prompt], preview: `codex exec --json --cd ${ctx.repoRoot} <goal>` }
    : { bin: 'claude', args: ['-p', prompt], preview: 'claude -p <goal>' };
  const result = runProcess(command.bin, command.args, {
    cwd: ctx.repoRoot,
    timeoutMs,
    maxOutputBytes: 128 * 1024,
  });
  const stdout = redactMcpText(result.stdout);
  const stderr = redactMcpText(result.stderr || result.error);
  audit(ctx, 'run_agent_goal', result.ok ? 'ok' : 'failed', args, decision.relativePath, stderr.text);
  return textResult({
    agent,
    goalPath: decision.relativePath,
    command: command.preview,
    exitCode: result.status,
    timedOut: result.timedOut,
    stdout: stdout.text,
    stderr: stderr.text,
    redactions: redactedGoal.redactions + stdout.redactions + stderr.redactions,
  });
}

function prdArtifactPath(slug: string): string {
  const normalized = slugify(slug);
  const prefixed = /^\d{8}-\d{4}-/.test(normalized) ? normalized : `${timestampPrefix()}-${normalized}`;
  return `plans/prds/${prefixed}.prd.md`;
}

function sprintArtifactPath(slug: string): string {
  const normalized = slugify(slug);
  const prefixed = /^\d{8}-\d{4}-/.test(normalized) ? normalized : `${timestampPrefix()}-${normalized}`;
  return `plans/sprints/${prefixed}.sprint.md`;
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

function writeMarkdownArtifact(
  ctx: McpToolContext,
  repoRoot: string,
  tool: string,
  relativePath: string,
  title: string,
  kind: string,
  body: string,
  overwrite: boolean,
  input: unknown,
  extra?: Record<string, unknown>,
): CallToolResult {
  const decision = resolveMcpPath(repoRoot, relativePath, ctx.policy, 'write');
  if (!decision.ok || !decision.absolutePath) {
    audit(ctx, tool, 'blocked', input, relativePath, decision.reason);
    return errorResult('POLICY_DENIED', decision.reason ?? 'path denied', { path: relativePath });
  }
  if (existsSync(decision.absolutePath) && !overwrite) {
    audit(ctx, tool, 'blocked', input, relativePath, 'target exists and overwrite was not requested');
    return errorResult('WOULD_OVERWRITE', `target already exists: ${relativePath}`);
  }
  mkdirSync(dirname(decision.absolutePath), { recursive: true });
  writeFileSync(decision.absolutePath, bodyWithFrontmatter(title, kind, body), 'utf-8');
  audit(ctx, tool, 'ok', input, relativePath);
  return textResult({ status: 'written', repoRoot, path: relativePath, ...(extra ?? {}) });
}

function validateGoal(body: string): string[] {
  return [
    '# Codex Goal',
    '## Source of truth',
    '## Role',
    '## Scope',
    '## Required workflow',
    '## Required checks',
    '## Done when',
  ].filter((section) => !body.includes(section));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0);
}

function taskObjects(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry));
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
    ...(success.length > 0 ? success.map((entry) => `- [ ] ${entry}`) : ['- [ ] The PRD can be converted into a checklist Sprint with staged verification gates.']),
    '',
    '## Workflow Contract',
    '',
    '- PRD is the source of product intent.',
    '- Sprint must be generated as ordered checklist task cards.',
    '- Codex execution must happen through a host-native `/goal` prompt or local Codex session, not through remote MCP execution.',
    '',
    '## Handoff Notes',
    '',
    notes || '- Generated from an idea through repo-harness MCP.',
  ].join('\n');
}

function renderChecklistSprintBody(args: Record<string, unknown>): string {
  const title = String(args.title ?? 'Checklist Sprint').trim() || 'Checklist Sprint';
  const prdPath = String(args.prd_path ?? '').trim();
  const tasks = taskObjects(args.tasks);
  const taskBlocks = tasks.length > 0 ? tasks.map((task, index) => {
    const taskTitle = String(task.title ?? `Task ${index + 1}`).trim() || `Task ${index + 1}`;
    const objective = String(task.objective ?? '').trim() || 'Complete the scoped implementation slice.';
    const files = stringList(task.files);
    const checks = stringList(task.checks);
    const stageGate = String(task.stage_gate ?? '').trim() || 'Update this checklist, run relevant checks, and stage the completed slice before continuing.';
    return [
      `### Task Card ${index + 1}: ${taskTitle}`,
      '',
      `- [ ] Objective: ${objective}`,
      `- [ ] Files/entrypoints: ${files.length > 0 ? files.map((entry) => `\`${entry}\``).join(', ') : 'TBD during execution'}`,
      `- [ ] Verification: ${checks.length > 0 ? checks.map((entry) => `\`${entry}\``).join(', ') : 'Focused check for this slice'}`,
      `- [ ] Stage gate: ${stageGate}`,
    ].join('\n');
  }) : [
    [
      '### Task Card 1: Plan the first implementation slice',
      '',
      '- [ ] Objective: Derive the first concrete implementation slice from the PRD.',
      '- [ ] Files/entrypoints: TBD during execution',
      '- [ ] Verification: Focused check for this slice',
      '- [ ] Stage gate: Update this checklist, run relevant checks, and stage the completed slice before continuing.',
    ].join('\n'),
  ];

  return [
    `# ${title}`,
    '',
    '> **Status**: Draft',
    '',
    '## Source',
    '',
    `- PRD: \`${prdPath || 'TBD'}\``,
    '',
    '## Execution Rule',
    '',
    '- Execute task cards in order.',
    '- Keep each task card reviewable as one staged slice.',
    '- After every completed phase, update the checklist and stage the result before continuing.',
    '- Do not treat unstaged work as a completed phase.',
    '',
    '## Checklist',
    '',
    ...taskBlocks.flatMap((block) => [block, '']),
    '## Final Acceptance',
    '',
    '- [ ] All task cards are checked.',
    '- [ ] Required checks pass.',
    '- [ ] Handoff explains staged state, residual risks, and next bottleneck if any.',
  ].join('\n').trimEnd() + '\n';
}

function renderCodexGoalFromSprint(args: Record<string, unknown>): { body: string; prompt: string } {
  const prdPath = String(args.prd_path ?? '').trim();
  const sprintPath = String(args.sprint_path ?? '').trim();
  const goalPrdPath = String(args.goal_prd_path ?? prdPath).trim() || prdPath;
  const goalSprintPath = String(args.goal_sprint_path ?? sprintPath).trim() || sprintPath;
  const referenceRepo = String(args.reference_repo ?? '').trim();
  const extraInstructions = String(args.extra_instructions ?? '').trim();
  const prompt = [
    '/goal',
    `Read: ${goalPrdPath}`,
    `Open or use a worktree and complete: ${goalSprintPath}`,
    'After each completed phase, stage the result before continuing.',
    'Use the user\'s language for status reports unless repo-local instructions require otherwise.',
    referenceRepo ? `Reference repo: ${referenceRepo}` : '',
  ].filter(Boolean).join('\n');
  const body = [
    '# Codex Goal',
    '',
    '## Source of truth',
    '',
    `- PRD: \`${goalPrdPath}\``,
    `- Checklist Sprint: \`${goalSprintPath}\``,
    ...(referenceRepo ? [`- Reference repo: \`${referenceRepo}\` (read-only comparison source)`] : []),
    '',
    '## Role',
    '',
    'Codex is the executor. ChatGPT/repo-harness may prepare planning artifacts, but implementation ownership stays in the local Codex session.',
    '',
    '## Scope',
    '',
    '- Open or use an isolated worktree for the sprint implementation.',
    '- Execute the checklist Sprint task cards in order.',
    '- Update the Sprint checklist as phases complete.',
    '- Stage each completed phase before continuing to the next phase.',
    '- Do not modify the reference repo or ignored secrets/ops state.',
    '',
    '## Required workflow',
    '',
    '1. Read the PRD and Sprint paths above before editing.',
    '2. Build the P1/P2/P3 map required by repo-local AGENTS.md for non-trivial changes.',
    '3. Execute one checklist task card at a time.',
    '4. After each phase, run the relevant focused checks, update the checklist, and stage the completed slice.',
    '5. Continue until the Sprint checklist is complete or a real blocker is reached.',
    '6. Leave a concise handoff with staged state and verification evidence.',
    ...(extraInstructions ? ['', extraInstructions] : []),
    '',
    '## Required checks',
    '',
    '- Run the checks named by the Sprint task card.',
    '- At sprint closeout, run repo-required checks unless the Sprint narrows the verification surface with a stated reason.',
    '',
    '## Done when',
    '',
    '- The checklist Sprint is complete.',
    '- Every completed phase is staged.',
    '- Checks pass or failures are documented with exact blocker evidence.',
    '- No commit is created unless the user explicitly asks for commit.',
    '',
    '## Host-native /goal prompt',
    '',
    '```text',
    prompt,
    '```',
  ].join('\n');
  return { body, prompt };
}

function parseThinking(value: unknown): ThinkingLevel | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'light' || value === 'standard' || value === 'extended' || value === 'heavy') return value;
  throw new Error(`invalid thinking level: ${String(value)}`);
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

export function buildMcpToolDefinitions(policy: McpPolicy, opts: { enableChatgptBrowser?: boolean } = {}): McpToolDefinition[] {
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
      overwrite: { type: 'boolean' },
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
      overwrite: { type: 'boolean' },
    },
    required: ['title', 'slug', 'idea'],
    additionalProperties: false,
  };
  const checklistSprintSchema = {
    type: 'object',
    properties: {
      repo_path: { type: 'string' },
      title: { type: 'string' },
      slug: { type: 'string' },
      prd_path: { type: 'string' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            objective: { type: 'string' },
            files: { type: 'array', items: { type: 'string' } },
            checks: { type: 'array', items: { type: 'string' } },
            stage_gate: { type: 'string' },
          },
          required: ['title', 'objective'],
          additionalProperties: false,
        },
      },
      overwrite: { type: 'boolean' },
    },
    required: ['title', 'slug', 'prd_path', 'tasks'],
    additionalProperties: false,
  };
  const goalFromSprintSchema = {
    type: 'object',
    properties: {
      repo_path: { type: 'string' },
      prd_path: { type: 'string' },
      sprint_path: { type: 'string' },
      goal_prd_path: { type: 'string' },
      goal_sprint_path: { type: 'string' },
      reference_repo: { type: 'string' },
      extra_instructions: { type: 'string' },
      overwrite: { type: 'boolean' },
    },
    required: ['prd_path', 'sprint_path'],
    additionalProperties: false,
  };
  const browserRunSchema = {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      title: { type: 'string' },
      files: { type: 'array', items: { type: 'string' } },
      model: { type: 'string' },
      thinking: { type: 'string', enum: ['light', 'standard', 'extended', 'heavy'] },
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
  const agentRunnerSchema = {
    type: 'object',
    properties: {
      agent: { type: 'string', enum: ['codex', 'claude'] },
      goal_path: { type: 'string', default: '.ai/harness/handoff/codex-goal.md' },
      timeout_ms: { type: 'number' },
    },
    required: ['agent'],
    additionalProperties: false,
  };

  const tools: McpToolDefinition[] = [
    { name: 'harness_status', description: 'Return repo-harness adoption and workflow status. Pass repo_path after discover_harness_repos when targeting another adopted repo.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'harness_doctor', description: 'Return compact MCP setup diagnostics.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'discover_harness_repos', description: 'Discover repo-harness adopted repositories from the global registry and explicit allowed discovery roots.', inputSchema: discoverySchema, annotations: readOnly },
    { name: 'list_workflow_files', description: 'List policy-readable workflow files. Pass repo_path to target a registered adopted repo.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'read_workflow_file', description: 'Read one policy-allowed workflow file path from the current or target registered repo.', inputSchema: stringPathSchema, annotations: readOnly },
    { name: 'latest_handoff', description: 'Return latest repo-harness handoff artifacts.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'latest_checks', description: 'Return latest repo-harness check artifacts.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'list_prds', description: 'List PRD artifacts under plans/prds.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'list_sprints', description: 'List sprint artifacts under plans/sprints.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'summarize_repo_harness_state', description: 'Return a compact planning state summary.', inputSchema: optionalRepoSchema, annotations: readOnly },
    { name: 'write_prd', description: 'Write a PRD under plans/prds/*.prd.md.', inputSchema: markdownWriterSchema, annotations: write },
    { name: 'write_prd_from_idea', description: 'Turn a product idea into a strict-compatible draft PRD under plans/prds/*.prd.md.', inputSchema: ideaPrdSchema, annotations: write },
    { name: 'write_sprint', description: 'Write a sprint under plans/sprints/*.sprint.md.', inputSchema: markdownWriterSchema, annotations: write },
    { name: 'write_checklist_sprint', description: 'Turn a PRD into an ordered checklist Sprint with per-phase staging gates.', inputSchema: checklistSprintSchema, annotations: write },
    { name: 'write_plan', description: 'Write an implementation plan under plans/plan-*.md.', inputSchema: markdownWriterSchema, annotations: write },
    { name: 'prepare_codex_goal_from_sprint', description: 'Prepare .ai/harness/handoff/codex-goal.md and a host-native /goal prompt from PRD + checklist Sprint.', inputSchema: goalFromSprintSchema, annotations: write },
    {
      name: 'write_codex_goal',
      description: 'Write .ai/harness/handoff/codex-goal.md after required section validation.',
      inputSchema: {
        type: 'object',
        properties: { repo_path: { type: 'string' }, body: { type: 'string' }, overwrite: { type: 'boolean' } },
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

  if (policy.execution.fixedWorkflowCheck) {
    tools.push({ name: 'run_workflow_check', description: 'Run the fixed repo-harness strict workflow check in the current or target registered repo.', inputSchema: optionalRepoSchema, annotations: write });
  }
  if (policy.capabilities.workspaceReader) {
    tools.push(...buildReaderToolDefinitions());
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
  if (policy.execution.agentRunner && policy.execution.codexRunner) {
    tools.push({
      name: 'run_agent_goal',
      description: 'Dev mode only: run the fixed Codex goal handoff through an explicitly enabled local Codex or Claude CLI.',
      inputSchema: agentRunnerSchema,
      annotations: write,
    });
  }
  return tools;
}

export async function callMcpTool(ctx: McpToolContext, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  try {
    if (isReaderTool(name)) {
      if (!ctx.policy.capabilities.workspaceReader) {
        return errorResult('TOOL_NOT_AVAILABLE', 'reader tools require the workspace reader capability to be enabled in MCP config.');
      }
      return callReaderTool(readerContext(ctx), name, args);
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
        const localConfig = existsSync(join(target.repoRoot, '.repo-harness', 'mcp.local.json'));
        const codexConfig = existsSync(join(target.repoRoot, '.codex', 'config.toml'));
        audit(ctx, name, 'ok', args);
        return textResult({
          status: isRepoHarnessAdopted(target.repoRoot) ? 'ready_local' : ctx.policy.allowAbsoluteRead ? 'ready_user' : 'not_adopted',
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
        const paths = ['.ai/harness/handoff/resume.md', '.ai/harness/handoff/codex-goal.md', '.ai/harness/handoff/chatgpt-plan.md'];
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
      case 'list_prds':
      case 'list_sprints': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const root = name === 'list_prds' ? 'plans/prds' : 'plans/sprints';
        const files: string[] = [];
        listFilesUnder(target.repoRoot, root, 200, files);
        audit(ctx, name, 'ok', args);
        return textResult({ files: files.map((path) => fileSummary(path, target.repoRoot)).filter(Boolean) });
      }
      case 'summarize_repo_harness_state': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const current = existsSync(join(target.repoRoot, 'tasks/current.md'))
          ? readFileSync(join(target.repoRoot, 'tasks/current.md'), 'utf-8').split(/\r?\n/).slice(0, 50).join('\n')
          : null;
        audit(ctx, name, 'ok', args);
        return textResult({
          status: {
            adopted: isRepoHarnessAdopted(target.repoRoot),
            branch: currentGitBranch(target.repoRoot),
            profile: ctx.policy.profile,
          },
          current: current ? redactMcpText(current).text : null,
        });
      }
      case 'write_prd': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        return writeMarkdownArtifact(ctx, target.repoRoot, name, prdArtifactPath(slug), title, 'prd', String(args.body ?? ''), args.overwrite === true, args);
      }
      case 'write_prd_from_idea': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        const body = renderPrdFromIdeaBody(args);
        return writeMarkdownArtifact(ctx, target.repoRoot, name, prdArtifactPath(slug), title, 'prd', body, args.overwrite === true, args);
      }
      case 'write_sprint': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        return writeMarkdownArtifact(ctx, target.repoRoot, name, sprintArtifactPath(slug), title, 'sprint', String(args.body ?? ''), args.overwrite === true, args);
      }
      case 'write_checklist_sprint': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        const prdPath = String(args.prd_path ?? '').trim();
        const prdDecision = resolveMcpPath(target.repoRoot, prdPath, ctx.policy, 'read');
        if (!prdDecision.ok || !prdDecision.absolutePath || !existsSync(prdDecision.absolutePath)) {
          audit(ctx, name, 'blocked', args, prdPath, prdDecision.reason ?? 'PRD path does not exist or is not readable');
          return errorResult('PRD_NOT_READABLE', 'PRD path does not exist or is not policy-readable.', { path: prdPath });
        }
        const body = renderChecklistSprintBody(args);
        return writeMarkdownArtifact(ctx, target.repoRoot, name, sprintArtifactPath(slug), title, 'sprint', body, args.overwrite === true, args);
      }
      case 'write_plan': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        return writeMarkdownArtifact(ctx, target.repoRoot, name, `plans/plan-${slug}.md`, title, 'plan', String(args.body ?? ''), args.overwrite === true, args);
      }
      case 'prepare_codex_goal_from_sprint': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const prdPath = String(args.prd_path ?? '').trim();
        const sprintPath = String(args.sprint_path ?? '').trim();
        const missingInputs = [
          { label: 'PRD', path: prdPath },
          { label: 'Sprint', path: sprintPath },
        ].filter((entry) => {
          const decision = resolveMcpPath(target.repoRoot, entry.path, ctx.policy, 'read');
          return !decision.ok || !decision.absolutePath || !existsSync(decision.absolutePath);
        });
        if (missingInputs.length > 0) {
          audit(ctx, name, 'blocked', args, missingInputs[0]?.path, `${missingInputs.map((entry) => entry.label).join(', ')} path does not exist or is not readable`);
          return errorResult('SOURCE_NOT_READABLE', 'PRD or Sprint path does not exist or is not policy-readable.', { missing: missingInputs });
        }
        const goal = renderCodexGoalFromSprint(args);
        const missing = validateGoal(goal.body);
        if (missing.length > 0) {
          audit(ctx, name, 'blocked', args, '.ai/harness/handoff/codex-goal.md', `missing required goal sections: ${missing.join(', ')}`);
          return errorResult('INVALID_GOAL', 'Generated Codex goal is missing required sections.', { missing });
        }
        return writeMarkdownArtifact(ctx, target.repoRoot, name, '.ai/harness/handoff/codex-goal.md', 'Codex Goal', 'codex-goal', goal.body, args.overwrite === true, args, {
          prompt: goal.prompt,
        });
      }
      case 'write_codex_goal': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const body = String(args.body ?? '');
        const missing = validateGoal(body);
        if (body.trim().length < 120 || missing.length > 0) {
          audit(ctx, name, 'blocked', args, '.ai/harness/handoff/codex-goal.md', `missing required goal sections: ${missing.join(', ')}`);
          return errorResult('INVALID_GOAL', 'Codex goal is missing required sections or is too small.', { missing });
        }
        return writeMarkdownArtifact(ctx, target.repoRoot, name, '.ai/harness/handoff/codex-goal.md', 'Codex Goal', 'codex-goal', body, args.overwrite === true, args);
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
      case 'run_workflow_check': {
        const target = targetRepoRoot(ctx, args);
        if (!target.ok) return target.result;
        const result = runHelper({
          helper: 'check-task-workflow',
          args: ['--strict'],
          cwd: target.repoRoot,
          stdio: 'pipe',
          timeoutMs: 60_000,
          maxOutputBytes: 96 * 1024,
        });
        const stdout = redactMcpText(result.stdout ?? '');
        const stderr = redactMcpText(result.stderr ?? '');
        audit(ctx, name, result.exitCode === 0 ? 'ok' : 'failed', args, undefined, stderr.text);
        return textResult({
          repoRoot: target.repoRoot,
          exitCode: result.exitCode,
          reason: result.reason,
          stdout: stdout.text,
          stderr: stderr.text,
          helper: result.resolved ? { source: result.resolved.source, fileName: basename(result.resolved.path) } : null,
        });
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
          thinking: parseThinking(args.thinking),
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
      case 'run_agent_goal':
        return runAgentGoal(ctx, args);
      default:
        return errorResult('UNKNOWN_TOOL', `unknown MCP tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audit(ctx, name, 'failed', args, undefined, message);
    return errorResult('TOOL_FAILED', message);
  }
}
