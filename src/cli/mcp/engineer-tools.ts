import { EngineerPrincipalError } from '../../core/engineers/principal-claim';
import { EngineerSchedulingError } from '../../core/engineers/scheduling';
import {
  ModuleMessageError,
  buildModuleMessageEvent,
  type ModuleMessageResourceRefV1,
  type ModuleMessageScope,
  type ModuleMessageSubjectRefV1,
  type ModuleMessageType,
} from '../../core/engineers/module-message';
import {
  ProviderThreadEffectError,
  type ProviderThreadOperation,
} from '../../core/engineers/provider-thread-effect';
import {
  ModuleInboxError,
  acknowledgeModuleMessage,
  receiveModuleInbox,
  sendModuleMessage,
} from '../../effects/engineers/module-inbox';
import { readEngineerBindingStatus } from '../../effects/engineers/binding-store';
import { loadEngineerProfile } from '../../effects/engineers/profile-store';
import {
  ProviderThreadEffectStoreError,
  listProviderThreadEffects,
  providerThreadCapabilityStatusFor,
  readProviderThreadEffectStatus,
} from '../../effects/engineers/provider-thread-effect-store';
import { resolveEngineerPrincipal, type EngineerPrincipalFences } from '../../effects/engineers/principal';
import { collectEngineerOffers } from '../../effects/engineers/scheduling';
import { acquireScheduledEngineerTask } from '../../effects/engineers/scheduling-acquire';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { redactMcpText } from './redaction';

export const ENGINEER_MCP_TOOL_NAMES = [
  'engineer_status',
  'engineer_offers',
  'engineer_acquire',
  'engineer_messages',
  'engineer_message_send',
  'engineer_message_ack',
  'engineer_thread_effect_capability',
  'engineer_thread_effect_status',
] as const;
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
  engineer_messages: ['repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision'],
  engineer_message_send: [
    'repo_id',
    'engineer_id',
    'binding_id',
    'binding_generation',
    'engineer_contract_revision',
    'message_id',
    'capability_id',
    'target_engineer_id',
    'scope',
    'target_binding_id',
    'target_binding_generation',
    'target_engineer_contract_revision',
    'message_type',
    'subject_ref',
    'resource_refs',
    'body',
    'created_at',
  ],
  engineer_message_ack: [
    'repo_id',
    'engineer_id',
    'binding_id',
    'binding_generation',
    'engineer_contract_revision',
    'message_id',
  ],
  engineer_thread_effect_capability: [
    'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'operation',
  ],
  engineer_thread_effect_status: [
    'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'effect_id',
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
    {
      name: 'engineer_messages',
      description: 'Consume durable Module Engineer messages for this exact current Binding and persist delivery before returning.',
      inputSchema: {
        type: 'object',
        properties: principalFenceProperties,
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_message_send',
      description: 'Persist one closed Module or assignment message before any optional transport.',
      inputSchema: {
        type: 'object',
        properties: {
          ...principalFenceProperties,
          message_id: { type: 'string', format: 'uuid' },
          capability_id: { type: 'string', pattern: '^capability\\.[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9-]*$' },
          target_engineer_id: { type: 'string' },
          scope: { type: 'string', enum: ['module', 'assignment'] },
          target_binding_id: { type: ['string', 'null'], format: 'uuid' },
          target_binding_generation: { type: ['number', 'null'], minimum: 1 },
          target_engineer_contract_revision: { type: ['string', 'null'], pattern: '^sha256:[0-9a-f]{64}$' },
          message_type: {
            type: 'string',
            enum: ['work_request', 'status_update', 'blocker', 'decision_request', 'review_request', 'handoff', 'integration_ready', 'incident', 'subject_notification'],
          },
          subject_ref: { type: ['object', 'null'] },
          resource_refs: { type: 'array', maxItems: 8 },
          body: { type: 'string', maxLength: 8192 },
          created_at: { type: 'string' },
        },
        required: [
          'message_id', 'capability_id', 'target_engineer_id', 'scope', 'target_binding_id',
          'target_binding_generation', 'target_engineer_contract_revision', 'message_type',
          'subject_ref', 'resource_refs', 'body', 'created_at',
        ],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_message_ack',
      description: 'Acknowledge one delivered message only after every typed resource matches its declared digest.',
      inputSchema: {
        type: 'object',
        properties: { ...principalFenceProperties, message_id: { type: 'string', format: 'uuid' } },
        required: ['message_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_thread_effect_capability',
      description: 'Read the operator-observed Provider Thread capability for this exact current Engineer Binding.',
      inputSchema: {
        type: 'object',
        properties: {
          ...principalFenceProperties,
          operation: { type: 'string', enum: ['send', 'resume', 'observe', 'stop'] },
        },
        required: ['operation'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_thread_effect_status',
      description: 'Read immutable Provider Thread effect intent/current observations for this Engineer; never starts or observes an effect.',
      inputSchema: {
        type: 'object',
        properties: {
          ...principalFenceProperties,
          effect_id: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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

function requiredNullableString(args: Record<string, unknown>, name: string): string | null {
  if (!(name in args)) throw new EngineerMcpError('INVALID_ARGUMENT', `${name} is required`);
  if (args[name] === null) return null;
  return requiredString(args, name);
}

function requiredNullableInteger(args: Record<string, unknown>, name: string): number | null {
  if (!(name in args)) throw new EngineerMcpError('INVALID_ARGUMENT', `${name} is required`);
  if (args[name] === null) return null;
  return requiredInteger(args, name, 1);
}

function messageSendAsEngineer(
  ctx: EngineerMcpToolContext,
  args: Record<string, unknown>,
  principal: ReturnType<typeof resolvePrincipal>,
): EngineerMcpToolResult {
  if (!Array.isArray(args.resource_refs)) throw new EngineerMcpError('INVALID_ARGUMENT', 'resource_refs must be an array');
  if (args.subject_ref !== null && (typeof args.subject_ref !== 'object' || Array.isArray(args.subject_ref))) {
    throw new EngineerMcpError('INVALID_ARGUMENT', 'subject_ref must be an object or null');
  }
  const event = buildModuleMessageEvent({
    message_id: requiredString(args, 'message_id'),
    capability_id: requiredString(args, 'capability_id'),
    target_engineer_id: requiredString(args, 'target_engineer_id'),
    scope: requiredString(args, 'scope') as ModuleMessageScope,
    target_binding_id: requiredNullableString(args, 'target_binding_id'),
    target_binding_generation: requiredNullableInteger(args, 'target_binding_generation'),
    target_engineer_contract_revision: requiredNullableString(args, 'target_engineer_contract_revision'),
    message_type: requiredString(args, 'message_type') as ModuleMessageType,
    subject_ref: args.subject_ref as ModuleMessageSubjectRefV1 | null,
    resource_refs: args.resource_refs as readonly ModuleMessageResourceRefV1[],
    sender: {
      kind: 'engineer',
      principal_ref: principal.engineer_id,
      binding_generation: principal.binding_generation,
    },
    body: requiredString(args, 'body'),
    created_at: requiredString(args, 'created_at'),
  });
  const result = sendModuleMessage({ repo_root: ctx.repoRoot, event });
  audit(ctx, 'engineer_message_send', 'ok', args);
  return textResult(result);
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

function currentBindingForPrincipal(
  ctx: EngineerMcpToolContext,
  principal: ReturnType<typeof resolvePrincipal>,
) {
  const profile = loadEngineerProfile(ctx.repoRoot, principal.engineer_id);
  const status = readEngineerBindingStatus(ctx.repoRoot, principal.engineer_id, profile.engineer_contract_revision);
  const binding = status.binding;
  if (!binding || binding.state !== 'active' || status.current.state !== 'active'
    || binding.binding_id !== principal.binding_id
    || binding.binding_generation !== principal.binding_generation
    || binding.engineer_contract_revision !== principal.engineer_contract_revision) {
    throw new EngineerPrincipalError('engineer_principal_stale', 'current Provider Thread Binding no longer matches authenticated principal');
  }
  return binding;
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
    if (name === 'engineer_acquire') return acquireAsEngineer(ctx, args, principal);
    if (name === 'engineer_messages') {
      const result = receiveModuleInbox({ repo_root: ctx.repoRoot, principal });
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    if (name === 'engineer_message_ack') {
      const result = acknowledgeModuleMessage({
        repo_root: ctx.repoRoot,
        principal,
        message_id: requiredString(args, 'message_id'),
      });
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    if (name === 'engineer_thread_effect_capability') {
      const binding = currentBindingForPrincipal(ctx, principal);
      const operation = requiredString(args, 'operation') as ProviderThreadOperation;
      const result = providerThreadCapabilityStatusFor(ctx.repoRoot, binding.host_id, operation);
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    if (name === 'engineer_thread_effect_status') {
      const effectId = optionalString(args, 'effect_id');
      if (effectId === undefined) {
        const result = listProviderThreadEffects(ctx.repoRoot, principal.engineer_id);
        audit(ctx, name, 'ok', args);
        return textResult(result);
      }
      const result = readProviderThreadEffectStatus(ctx.repoRoot, effectId);
      if (result.intent.engineer_id !== principal.engineer_id) {
        throw new EngineerPrincipalError('engineer_principal_mismatch', 'effect does not belong to authenticated Engineer');
      }
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    return messageSendAsEngineer(ctx, args, principal);
  } catch (error) {
    const code = error instanceof EngineerPrincipalError || error instanceof EngineerMcpError
      || error instanceof EngineerSchedulingError || error instanceof ModuleMessageError
      || error instanceof ModuleInboxError
      || error instanceof ProviderThreadEffectError || error instanceof ProviderThreadEffectStoreError
      ? error.code
      : 'ENGINEER_TOOL_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    audit(ctx, name, code === 'INVALID_ARGUMENT' ? 'blocked' : 'failed', args, message);
    return errorResult(code, message);
  }
}
