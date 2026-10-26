/**
 * Herdr task dispatch for the orchestrator profile.
 *
 * A pane is in scope only when its working directory belongs to a registered
 * read_write repo. Prompt and read re-check scope against a fresh
 * `herdr agent list` and refuse before they run any command on the pane.
 */

import { realpathSync } from 'fs';
import { isAbsolute } from 'path';
import { resolveGitCommonDirectory } from '../../effects/git/common-directory';
import { readRegisteredRepoHarnessRepos } from '../../effects/repo-registry';
import { herdrCommand, herdrMutation, herdrResult, spawnHerdr, type HerdrEndpoint, type HerdrSpawn } from '../../effects/terminal/herdr';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { redactMcpText } from './redaction';

export const HERDR_TOOL_NAMES = ['list_task_agents', 'prompt_task_agent', 'read_task_agent'] as const;
export type HerdrToolName = typeof HERDR_TOOL_NAMES[number];

export const MAX_TASK_PROMPT_BYTES = 16 * 1024;
export const DEFAULT_TASK_READ_LINES = 120;
export const MAX_TASK_READ_LINES = 400;
const GIT_PROBE_TIMEOUT_MS = 5_000;
const PANE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;

const PARAMETERS: Readonly<Record<HerdrToolName, readonly string[]>> = Object.freeze({
  list_task_agents: [],
  prompt_task_agent: ['pane_id', 'text'],
  read_task_agent: ['pane_id', 'lines'],
});

export interface HerdrToolDefinition {
  readonly name: HerdrToolName;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, unknown>;
}

export interface HerdrToolContext {
  /** Owner of the MCP audit log. */
  readonly repoRoot: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly spawn?: HerdrSpawn;
}

export interface HerdrToolResult {
  readonly content: Array<{ readonly type: 'text'; readonly text: string }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

export interface TaskAgent {
  readonly pane_id: string;
  readonly name: string | null;
  readonly agent: string | null;
  readonly agent_status: string | null;
  readonly repo_id: string;
  readonly title: string | null;
}

class HerdrToolError extends Error {
  constructor(readonly code: string, message: string, readonly repoId?: string) {
    super(message);
    this.name = 'HerdrToolError';
  }
}

const readOnly = Object.freeze({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
const paneIdSchema = { type: 'string', description: 'pane_id from list_task_agents.' };

export function buildHerdrToolDefinitions(): HerdrToolDefinition[] {
  return [
    {
      name: 'list_task_agents',
      description: 'List Claude and Codex agent panes in local Herdr whose working directory is in a read_write granted repo.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: readOnly,
    },
    {
      name: 'prompt_task_agent',
      description: `Submit a prompt to one in-scope agent pane. The call returns after submission and does not wait for the agent. Text is limited to ${MAX_TASK_PROMPT_BYTES} bytes.`,
      inputSchema: {
        type: 'object',
        properties: { pane_id: paneIdSchema, text: { type: 'string' } },
        required: ['pane_id', 'text'],
        additionalProperties: false,
      },
      // The agent acts with the local OS user's authority inside its repo.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    {
      name: 'read_task_agent',
      description: `Read recent terminal output of one in-scope agent pane. Secrets are redacted. lines defaults to ${DEFAULT_TASK_READ_LINES}, maximum ${MAX_TASK_READ_LINES}.`,
      inputSchema: {
        type: 'object',
        properties: { pane_id: paneIdSchema, lines: { type: 'integer', minimum: 1, maximum: MAX_TASK_READ_LINES } },
        required: ['pane_id'],
        additionalProperties: false,
      },
      annotations: readOnly,
    },
  ];
}

export function isHerdrTool(name: string): name is HerdrToolName {
  return (HERDR_TOOL_NAMES as readonly string[]).includes(name);
}

function textResult(value: unknown): HerdrToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function errorResult(code: string, message: string): HerdrToolResult {
  const value = { error: { code, message: redactMcpText(message).text } };
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value, isError: true };
}

function endpoint(ctx: HerdrToolContext): HerdrEndpoint {
  return { session: (ctx.env ?? process.env).HERDR_SESSION || 'default' };
}

function runHerdr(ctx: HerdrToolContext, args: readonly string[]) {
  return herdrCommand(endpoint(ctx), args, 'herdr', ctx.spawn ?? spawnHerdr);
}

function commonDirectory(path: string): string | null {
  if (!isAbsolute(path)) return null;
  try {
    return resolveGitCommonDirectory(realpathSync(path), undefined, GIT_PROBE_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/** Git common directory of each read_write repo. Linked worktrees share it with their primary checkout. */
function readWriteRepoIndex(): Map<string, string> {
  const index = new Map<string, string>();
  for (const repo of readRegisteredRepoHarnessRepos({ adoptedOnly: true })) {
    if (repo.accessMode !== 'read_write') continue;
    const commonDir = commonDirectory(repo.path);
    if (commonDir !== null) index.set(commonDir, repo.id);
  }
  return index;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function listTaskAgents(ctx: HerdrToolContext): TaskAgent[] {
  const response = herdrResult(runHerdr(ctx, ['agent', 'list']));
  if (!Array.isArray(response.agents)) throw new HerdrToolError('HERDR_UNAVAILABLE', 'herdr agent list returned no agent array');
  const index = readWriteRepoIndex();
  if (index.size === 0) return [];
  const commonDirs = new Map<string, string | null>();
  const agents: TaskAgent[] = [];
  for (const raw of response.agents as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const entry = raw as Record<string, unknown>;
    const paneId = nonEmptyString(entry.pane_id);
    const cwd = nonEmptyString(entry.foreground_cwd) ?? nonEmptyString(entry.cwd);
    if (paneId === null || cwd === null) continue;
    if (!commonDirs.has(cwd)) commonDirs.set(cwd, commonDirectory(cwd));
    const commonDir = commonDirs.get(cwd);
    const repoId = commonDir ? index.get(commonDir) : undefined;
    if (repoId === undefined) continue;
    const title = nonEmptyString(entry.terminal_title_stripped);
    agents.push({
      pane_id: paneId,
      name: nonEmptyString(entry.name),
      agent: nonEmptyString(entry.agent),
      agent_status: nonEmptyString(entry.agent_status),
      repo_id: repoId,
      title: title === null ? null : redactMcpText(title).text,
    });
  }
  return agents;
}

function scopedTarget(ctx: HerdrToolContext, args: Record<string, unknown>): TaskAgent {
  const paneId = args.pane_id;
  if (typeof paneId !== 'string' || !PANE_ID.test(paneId)) {
    throw new HerdrToolError('INVALID_ARGUMENT', 'pane_id must be a pane id from list_task_agents');
  }
  const target = listTaskAgents(ctx).find((agent) => agent.pane_id === paneId);
  if (!target) throw new HerdrToolError('PANE_NOT_IN_SCOPE', `pane ${paneId} is not an agent in a read_write granted repo`);
  return target;
}

function promptText(args: Record<string, unknown>): string {
  const text = args.text;
  if (typeof text !== 'string' || text.trim().length === 0) throw new HerdrToolError('INVALID_ARGUMENT', 'text must be a non-empty string');
  if (Buffer.byteLength(text, 'utf8') > MAX_TASK_PROMPT_BYTES) {
    throw new HerdrToolError('INVALID_ARGUMENT', `text exceeds ${MAX_TASK_PROMPT_BYTES} bytes`);
  }
  return text;
}

function readLines(args: Record<string, unknown>): number {
  const lines = args.lines ?? DEFAULT_TASK_READ_LINES;
  if (typeof lines !== 'number' || !Number.isInteger(lines) || lines < 1 || lines > MAX_TASK_READ_LINES) {
    throw new HerdrToolError('INVALID_ARGUMENT', `lines must be an integer from 1 to ${MAX_TASK_READ_LINES}`);
  }
  return lines;
}

function audit(ctx: HerdrToolContext, tool: string, status: 'ok' | 'blocked' | 'failed', args: unknown, repoId?: string, error?: string): void {
  tryWriteMcpAuditEntry(ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool,
    status,
    repoId,
    inputHash: hashMcpInput(args),
    error,
  });
}

function run(ctx: HerdrToolContext, name: HerdrToolName, args: Record<string, unknown>): { readonly value: unknown; readonly repoId?: string } {
  if (name === 'list_task_agents') return { value: { agents: listTaskAgents(ctx) } };
  // Validate the arguments before the scope probe so a malformed call runs no herdr command.
  const text = name === 'prompt_task_agent' ? promptText(args) : undefined;
  const lines = name === 'read_task_agent' ? readLines(args) : undefined;
  const target = scopedTarget(ctx, args);
  if (text !== undefined) {
    try {
      herdrMutation(runHerdr(ctx, ['agent', 'prompt', target.pane_id, text]));
    } catch (error) {
      throw new HerdrToolError('HERDR_UNAVAILABLE', error instanceof Error ? error.message : String(error), target.repo_id);
    }
    return { value: { pane_id: target.pane_id, repo_id: target.repo_id, submitted: true }, repoId: target.repo_id };
  }
  const result = runHerdr(ctx, ['agent', 'read', target.pane_id, '--source', 'recent-unwrapped', '--lines', String(lines)]);
  if (result.error || result.status !== 0 || result.signal) throw new HerdrToolError('HERDR_UNAVAILABLE', 'herdr_command_failed', target.repo_id);
  const output = redactMcpText(result.stdout.toString('utf8'));
  return {
    value: { pane_id: target.pane_id, repo_id: target.repo_id, lines, text: output.text, redactions: output.redactions },
    repoId: target.repo_id,
  };
}

export function callHerdrTool(ctx: HerdrToolContext, name: HerdrToolName, args: Record<string, unknown>): HerdrToolResult {
  const unknown = Object.keys(args).filter((key) => !PARAMETERS[name].includes(key));
  if (unknown.length > 0) {
    audit(ctx, name, 'blocked', args, undefined, `unknown parameter: ${unknown.join(', ')}`);
    return errorResult('INVALID_ARGUMENT', `${name} does not accept: ${unknown.join(', ')}`);
  }
  try {
    const { value, repoId } = run(ctx, name, args);
    audit(ctx, name, 'ok', args, repoId);
    return textResult(value);
  } catch (error) {
    const known = error instanceof HerdrToolError;
    const code = known ? error.code : 'HERDR_UNAVAILABLE';
    const message = error instanceof Error ? error.message : String(error);
    audit(ctx, name, known && code !== 'HERDR_UNAVAILABLE' ? 'blocked' : 'failed', args, known ? error.repoId : undefined, message);
    return errorResult(code, message);
  }
}
