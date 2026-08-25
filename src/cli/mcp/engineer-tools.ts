import { EngineerPrincipalError } from '../../core/engineers/principal-claim';
import { EngineerSchedulingError } from '../../core/engineers/scheduling';
import { resolveEngineerPrincipal, type EngineerPrincipalFences } from '../../effects/engineers/principal';
import { collectEngineerOffers } from '../../effects/engineers/scheduling';
import { acquireScheduledEngineerTask } from '../../effects/engineers/scheduling-acquire';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { redactMcpText } from './redaction';

export const ENGINEER_MCP_TOOL_NAMES = ['engineer_status', 'engineer_offers', 'engineer_acquire'] as const;
export type EngineerMcpToolName = typeof ENGINEER_MCP_TOOL_NAMES[number];

const PARAMETER_NAMES: Readonly<Record<EngineerMcpToolName, readonly string[]>> = Object.freeze({
  engineer_status: ['repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision'],
  engineer_offers: ['repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision'],
  engineer_acquire: [
    'repo_id',
    'engineer_id',
    'binding_id',
    'binding_generation',
    'engineer_contract_revision',
    'work_package_id',
    'work_package_revision',
    'work_graph_revision',
    'task_id',
    'task_revision',
    'offer_revision',
    'dependency_revision',
    'concurrency_revision',
    'fleet_offer_revision',
    'authorization_revision',
    'max_attempts',
  ],
});

export interface EngineerMcpToolContext {
  readonly repoRoot: string;
  readonly authorizationId?: string;
}

export interface EngineerMcpToolDefinition {
  readonly name: EngineerMcpToolName;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, unknown>;
}

export interface EngineerMcpToolResult {
  readonly content: Array<{ readonly type: 'text'; readonly text: string }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

class EngineerMcpError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'EngineerMcpError';
  }
}

const principalFenceProperties = {
  repo_id: { type: 'string', pattern: '^repo_[0-9a-f]{16}$' },
  engineer_id: { type: 'string' },
  binding_id: { type: 'string', format: 'uuid' },
  binding_generation: { type: 'number', minimum: 1 },
  engineer_contract_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
};

export function buildEngineerToolDefinitions(): EngineerMcpToolDefinition[] {
  return [
    {
      name: 'engineer_status',
      description: 'Resolve this authenticated authorization to the exact current Module Engineer Binding.',
      inputSchema: {
        type: 'object',
        properties: principalFenceProperties,
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_offers',
      description: 'Project deterministic Work Package offers for this exact authenticated Module Engineer.',
      inputSchema: {
        type: 'object',
        properties: principalFenceProperties,
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_acquire',
      description: 'Acquire one exact Engineer Work Package offer and publish immutable claim provenance.',
      inputSchema: {
        type: 'object',
        properties: {
          ...principalFenceProperties,
          work_package_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,127}$' },
          work_package_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          work_graph_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          task_id: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          task_revision: { type: 'string', pattern: '^[0-9a-f]{64}$' },
          offer_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          dependency_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          concurrency_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          fleet_offer_revision: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          authorization_revision: { type: 'number', minimum: 0 },
          max_attempts: { type: 'number', minimum: 1, maximum: 16 },
        },
        required: [
          'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision',
          'work_package_id', 'work_package_revision', 'work_graph_revision', 'task_id', 'task_revision',
          'offer_revision', 'dependency_revision', 'concurrency_revision', 'fleet_offer_revision',
          'authorization_revision',
        ],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

export function isEngineerTool(name: string): name is EngineerMcpToolName {
  return (ENGINEER_MCP_TOOL_NAMES as readonly string[]).includes(name);
}

function textResult(value: unknown): EngineerMcpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function errorResult(code: string, message: string): EngineerMcpToolResult {
  const value = { error: { code, message: redactMcpText(message).text } };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

function audit(
  ctx: EngineerMcpToolContext,
  tool: EngineerMcpToolName,
  status: 'ok' | 'blocked' | 'failed',
  input: unknown,
  error?: string,
): void {
  tryWriteMcpAuditEntry(ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool,
    status,
    inputHash: hashMcpInput(input),
    error,
  });
}

function rejectUnknown(name: EngineerMcpToolName, args: Record<string, unknown>): void {
  const unknown = Object.keys(args).filter((key) => !PARAMETER_NAMES[name].includes(key)).sort();
  if (unknown.length > 0) {
    throw new EngineerMcpError('INVALID_ARGUMENT', `${name} does not accept unknown parameter${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`);
  }
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') throw new EngineerMcpError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
  return value.trim();
}

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = optionalString(args, name);
  if (value === undefined) throw new EngineerMcpError('INVALID_ARGUMENT', `${name} is required`);
  return value;
}

function optionalInteger(args: Record<string, unknown>, name: string, minimum: number): number | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < minimum) throw new EngineerMcpError('INVALID_ARGUMENT', `${name} must be an integer greater than or equal to ${minimum}`);
  return value as number;
}

function requiredInteger(args: Record<string, unknown>, name: string, minimum: number): number {
  const value = optionalInteger(args, name, minimum);
  if (value === undefined) throw new EngineerMcpError('INVALID_ARGUMENT', `${name} is required`);
  return value;
}

function resolvePrincipal(ctx: EngineerMcpToolContext, args: Record<string, unknown>) {
  if (!ctx.authorizationId) throw new EngineerMcpError('ENGINEER_AUTHORIZATION_MISSING', 'verified Engineer authorization identity is missing');
  const fences: EngineerPrincipalFences = {
    engineer_id: optionalString(args, 'engineer_id'),
    binding_id: optionalString(args, 'binding_id'),
    binding_generation: optionalInteger(args, 'binding_generation', 1),
    engineer_contract_revision: optionalString(args, 'engineer_contract_revision'),
  };
  const principal = resolveEngineerPrincipal({
    repo_root: ctx.repoRoot,
    authorization_id: ctx.authorizationId,
    fences,
  });
  const repoId = optionalString(args, 'repo_id');
  if (repoId !== undefined && repoId !== principal.repository_id) {
    throw new EngineerPrincipalError('engineer_principal_mismatch', 'repo_id fence does not match authenticated principal');
  }
  return principal;
}

function acquireAsEngineer(
  ctx: EngineerMcpToolContext,
  args: Record<string, unknown>,
  principal: ReturnType<typeof resolvePrincipal>,
): EngineerMcpToolResult {
  const maxAttempts = optionalInteger(args, 'max_attempts', 1);
  if (maxAttempts !== undefined && maxAttempts > 16) {
    throw new EngineerMcpError('INVALID_ARGUMENT', 'max_attempts must be an integer from 1 through 16');
  }
  const result = acquireScheduledEngineerTask({
    repo_root: ctx.repoRoot,
    principal,
    assertion: {
      offer_revision: requiredString(args, 'offer_revision'),
      work_package_id: requiredString(args, 'work_package_id'),
      work_package_revision: requiredString(args, 'work_package_revision'),
      work_graph_revision: requiredString(args, 'work_graph_revision'),
      task_id: requiredString(args, 'task_id'),
      task_revision: requiredString(args, 'task_revision'),
      dependency_revision: requiredString(args, 'dependency_revision'),
      concurrency_revision: requiredString(args, 'concurrency_revision'),
      binding_id: requiredString(args, 'binding_id'),
      binding_generation: requiredInteger(args, 'binding_generation', 1),
      engineer_contract_revision: requiredString(args, 'engineer_contract_revision'),
      fleet_offer_revision: requiredString(args, 'fleet_offer_revision'),
      authorization_revision: requiredInteger(args, 'authorization_revision', 0),
    },
    max_attempts: maxAttempts,
  });
  audit(ctx, 'engineer_acquire', result.ok ? 'ok' : 'failed', args, result.ok ? undefined : result.message);
  return result.ok ? textResult(result) : errorResult(result.error, result.message);
}

export function callEngineerTool(
  ctx: EngineerMcpToolContext,
  name: EngineerMcpToolName,
  args: Record<string, unknown> = {},
): EngineerMcpToolResult {
  try {
    rejectUnknown(name, args);
    const principal = resolvePrincipal(ctx, args);
    if (name === 'engineer_status') {
      const result = { ok: true, principal };
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    if (name === 'engineer_offers') {
      const result = collectEngineerOffers({ repo_root: ctx.repoRoot, principal });
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    return acquireAsEngineer(ctx, args, principal);
  } catch (error) {
    const code = error instanceof EngineerPrincipalError || error instanceof EngineerMcpError || error instanceof EngineerSchedulingError
      ? error.code
      : 'ENGINEER_TOOL_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    audit(ctx, name, code === 'INVALID_ARGUMENT' ? 'blocked' : 'failed', args, message);
    return errorResult(code, message);
  }
}
