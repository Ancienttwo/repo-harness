import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { runHelper } from '../runtime/helper-runner';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { resolveMcpPath } from './paths';
import { currentGitBranch, isRepoHarnessAdopted } from './repo';
import { redactMcpText } from './redaction';
import type { McpPolicy } from './types';

export interface McpToolContext {
  repoRoot: string;
  policy: McpPolicy;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

interface CallToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const EMPTY_SCHEMA = { type: 'object', additionalProperties: false };

function textResult(value: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
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
  tool: string,
  relativePath: string,
  title: string,
  kind: string,
  body: string,
  overwrite: boolean,
  input: unknown,
  extra?: Record<string, unknown>,
): CallToolResult {
  const decision = resolveMcpPath(ctx.repoRoot, relativePath, ctx.policy, 'write');
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
  return textResult({ status: 'written', path: relativePath, ...(extra ?? {}) });
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
    `阅读： ${goalPrdPath}`,
    `开worktree完整执行：${goalSprintPath}`,
    '完成阶段性任务，要staging再继续',
    referenceRepo ? `参考repo: ${referenceRepo}` : '',
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

export function buildMcpToolDefinitions(policy: McpPolicy): McpToolDefinition[] {
  const readOnly = { readOnlyHint: true, openWorldHint: false };
  const write = { readOnlyHint: false, openWorldHint: false, destructiveHint: false };
  const stringPathSchema = {
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
    additionalProperties: false,
  };
  const markdownWriterSchema = {
    type: 'object',
    properties: {
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

  const tools: McpToolDefinition[] = [
    { name: 'harness_status', description: 'Return repo-harness adoption and workflow status.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'harness_doctor', description: 'Return compact MCP setup diagnostics.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'list_workflow_files', description: 'List policy-readable workflow files.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'read_workflow_file', description: 'Read one policy-allowed workflow file by repo-relative path.', inputSchema: stringPathSchema, annotations: readOnly },
    { name: 'latest_handoff', description: 'Return latest repo-harness handoff artifacts.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'latest_checks', description: 'Return latest repo-harness check artifacts.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'list_prds', description: 'List PRD artifacts under plans/prds.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'list_sprints', description: 'List sprint artifacts under plans/sprints.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
    { name: 'summarize_repo_harness_state', description: 'Return a compact planning state summary.', inputSchema: EMPTY_SCHEMA, annotations: readOnly },
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
        properties: { body: { type: 'string' }, overwrite: { type: 'boolean' } },
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
        properties: { actor: { type: 'string' }, body: { type: 'string' } },
        required: ['body'],
        additionalProperties: false,
      },
      annotations: write,
    },
  ];

  if (policy.execution.fixedWorkflowCheck) {
    tools.push({ name: 'run_workflow_check', description: 'Run the fixed repo-harness strict workflow check.', inputSchema: EMPTY_SCHEMA, annotations: write });
  }
  return tools;
}

export async function callMcpTool(ctx: McpToolContext, name: string, args: Record<string, unknown> = {}): Promise<CallToolResult> {
  try {
    switch (name) {
      case 'harness_status': {
        const roots = ['docs/spec.md', 'plans', 'tasks/current.md', '.ai/harness/handoff', '.ai/harness/checks'];
        audit(ctx, name, 'ok', args);
        return textResult({
          repoRoot: ctx.repoRoot,
          adopted: isRepoHarnessAdopted(ctx.repoRoot),
          profile: ctx.policy.profile,
          branch: currentGitBranch(ctx.repoRoot),
          workflowRoots: roots.map((path) => ({ path, exists: existsSync(join(ctx.repoRoot, path)) })),
        });
      }
      case 'harness_doctor': {
        const localConfig = existsSync(join(ctx.repoRoot, '.repo-harness', 'mcp.local.json'));
        const codexConfig = existsSync(join(ctx.repoRoot, '.codex', 'config.toml'));
        audit(ctx, name, 'ok', args);
        return textResult({
          status: isRepoHarnessAdopted(ctx.repoRoot) ? 'ready_local' : 'not_adopted',
          repo: ctx.repoRoot,
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
      case 'list_workflow_files': {
        const files = workflowFileCandidates(ctx.repoRoot)
          .filter((path) => resolveMcpPath(ctx.repoRoot, path, ctx.policy, 'read').ok)
          .map((path) => fileSummary(path, ctx.repoRoot))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .filter((entry) => entry.size <= ctx.policy.maxFileBytes);
        audit(ctx, name, 'ok', args);
        return textResult({ files });
      }
      case 'read_workflow_file': {
        const path = typeof args.path === 'string' ? args.path : '';
        const decision = resolveMcpPath(ctx.repoRoot, path, ctx.policy, 'read');
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
        const paths = ['.ai/harness/handoff/resume.md', '.ai/harness/handoff/codex-goal.md', '.ai/harness/handoff/chatgpt-plan.md'];
        const handoff = paths.map((path) => {
          const decision = resolveMcpPath(ctx.repoRoot, path, ctx.policy, 'read');
          if (!decision.ok || !decision.absolutePath || !existsSync(decision.absolutePath)) return { path, exists: false };
          const content = redactMcpText(readFileSync(decision.absolutePath, 'utf-8')).text;
          return { path, exists: true, preview: content.split(/\r?\n/).slice(0, 24).join('\n') };
        });
        audit(ctx, name, 'ok', args);
        return textResult({ handoff });
      }
      case 'latest_checks': {
        const files = workflowFileCandidates(ctx.repoRoot)
          .filter((path) => path.startsWith('.ai/harness/checks/'))
          .filter((path) => resolveMcpPath(ctx.repoRoot, path, ctx.policy, 'read').ok)
          .map((path) => fileSummary(path, ctx.repoRoot))
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
          .slice(0, 20);
        audit(ctx, name, 'ok', args);
        return textResult({ files });
      }
      case 'list_prds':
      case 'list_sprints': {
        const root = name === 'list_prds' ? 'plans/prds' : 'plans/sprints';
        const files: string[] = [];
        listFilesUnder(ctx.repoRoot, root, 200, files);
        audit(ctx, name, 'ok', args);
        return textResult({ files: files.map((path) => fileSummary(path, ctx.repoRoot)).filter(Boolean) });
      }
      case 'summarize_repo_harness_state': {
        const current = existsSync(join(ctx.repoRoot, 'tasks/current.md'))
          ? readFileSync(join(ctx.repoRoot, 'tasks/current.md'), 'utf-8').split(/\r?\n/).slice(0, 50).join('\n')
          : null;
        audit(ctx, name, 'ok', args);
        return textResult({
          status: {
            adopted: isRepoHarnessAdopted(ctx.repoRoot),
            branch: currentGitBranch(ctx.repoRoot),
            profile: ctx.policy.profile,
          },
          current: current ? redactMcpText(current).text : null,
        });
      }
      case 'write_prd': {
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        return writeMarkdownArtifact(ctx, name, prdArtifactPath(slug), title, 'prd', String(args.body ?? ''), args.overwrite === true, args);
      }
      case 'write_prd_from_idea': {
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        const body = renderPrdFromIdeaBody(args);
        return writeMarkdownArtifact(ctx, name, prdArtifactPath(slug), title, 'prd', body, args.overwrite === true, args);
      }
      case 'write_sprint': {
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        return writeMarkdownArtifact(ctx, name, sprintArtifactPath(slug), title, 'sprint', String(args.body ?? ''), args.overwrite === true, args);
      }
      case 'write_checklist_sprint': {
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        const prdPath = String(args.prd_path ?? '').trim();
        const prdDecision = resolveMcpPath(ctx.repoRoot, prdPath, ctx.policy, 'read');
        if (!prdDecision.ok || !prdDecision.absolutePath || !existsSync(prdDecision.absolutePath)) {
          audit(ctx, name, 'blocked', args, prdPath, prdDecision.reason ?? 'PRD path does not exist or is not readable');
          return errorResult('PRD_NOT_READABLE', 'PRD path does not exist or is not policy-readable.', { path: prdPath });
        }
        const body = renderChecklistSprintBody(args);
        return writeMarkdownArtifact(ctx, name, sprintArtifactPath(slug), title, 'sprint', body, args.overwrite === true, args);
      }
      case 'write_plan': {
        const title = String(args.title ?? '').trim();
        const slug = slugify(String(args.slug ?? title));
        return writeMarkdownArtifact(ctx, name, `plans/plan-${slug}.md`, title, 'plan', String(args.body ?? ''), args.overwrite === true, args);
      }
      case 'prepare_codex_goal_from_sprint': {
        const prdPath = String(args.prd_path ?? '').trim();
        const sprintPath = String(args.sprint_path ?? '').trim();
        const missingInputs = [
          { label: 'PRD', path: prdPath },
          { label: 'Sprint', path: sprintPath },
        ].filter((entry) => {
          const decision = resolveMcpPath(ctx.repoRoot, entry.path, ctx.policy, 'read');
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
        return writeMarkdownArtifact(ctx, name, '.ai/harness/handoff/codex-goal.md', 'Codex Goal', 'codex-goal', goal.body, args.overwrite === true, args, {
          prompt: goal.prompt,
        });
      }
      case 'write_codex_goal': {
        const body = String(args.body ?? '');
        const missing = validateGoal(body);
        if (body.trim().length < 120 || missing.length > 0) {
          audit(ctx, name, 'blocked', args, '.ai/harness/handoff/codex-goal.md', `missing required goal sections: ${missing.join(', ')}`);
          return errorResult('INVALID_GOAL', 'Codex goal is missing required sections or is too small.', { missing });
        }
        return writeMarkdownArtifact(ctx, name, '.ai/harness/handoff/codex-goal.md', 'Codex Goal', 'codex-goal', body, args.overwrite === true, args);
      }
      case 'append_handoff_note': {
        const path = '.ai/harness/handoff/chatgpt-plan.md';
        const decision = resolveMcpPath(ctx.repoRoot, path, ctx.policy, 'write');
        if (!decision.ok || !decision.absolutePath) return errorResult('POLICY_DENIED', decision.reason ?? 'path denied');
        mkdirSync(dirname(decision.absolutePath), { recursive: true });
        const actor = String(args.actor ?? 'chatgpt-planner').trim() || 'chatgpt-planner';
        const body = String(args.body ?? '').trim();
        const block = [``, `## ${new Date().toISOString()}`, ``, `Actor: ${actor}`, ``, body, ``].join('\n');
        appendFileSync(decision.absolutePath, block, 'utf-8');
        audit(ctx, name, 'ok', args, path);
        return textResult({ status: 'appended', path });
      }
      case 'run_workflow_check': {
        const result = runHelper({
          helper: 'check-task-workflow',
          args: ['--strict'],
          cwd: ctx.repoRoot,
          stdio: 'pipe',
          timeoutMs: 60_000,
          maxOutputBytes: 96 * 1024,
        });
        const stdout = redactMcpText(result.stdout ?? '');
        const stderr = redactMcpText(result.stderr ?? '');
        audit(ctx, name, result.exitCode === 0 ? 'ok' : 'failed', args, undefined, stderr.text);
        return textResult({
          exitCode: result.exitCode,
          reason: result.reason,
          stdout: stdout.text,
          stderr: stderr.text,
          helper: result.resolved ? { source: result.resolved.source, fileName: basename(result.resolved.path) } : null,
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
