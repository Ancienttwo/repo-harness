import { EngineerPrincipalError } from '../../core/engineers/principal-claim';
import { EngineerSchedulingError } from '../../core/engineers/scheduling';
import {
  InterfaceChangeError,
  buildInterfaceChangeRequest,
  type InterfaceChangeTransition,
} from '../../core/engineers/interface-change';
import { WorkDemandError, buildWorkDemand, type WorkDemandTransition } from '../../core/engineers/work-demand';
import {
  ModuleMessageError,
  buildModuleMessageEvent,
  type ModuleMessageResourceRefV1,
  type ModuleMessageScope,
  type ModuleMessageSubjectRefV1,
  type ModuleMessageType,
} from '../../core/engineers/module-message';
import {
  AgentRuntimeEffectError,
  type AgentRuntimeAdapterKind,
} from '../../core/engineers/agent-runtime-effect';
import {
  ModuleInboxError,
  acknowledgeModuleMessage,
  receiveModuleInbox,
  sendModuleMessage,
} from '../../effects/engineers/module-inbox';
import { readEngineerBindingStatus } from '../../effects/engineers/binding-store';
import { loadEngineerProfile } from '../../effects/engineers/profile-store';
import {
  AgentRuntimeEffectStoreError,
  observeAgentRuntimeEffectStatus,
  observeAgentRuntimeEffects,
  agentRuntimeCapabilityStatusFor,
} from '../../effects/engineers/agent-runtime-effect-store';
import { resolveEngineerPrincipal, type EngineerPrincipalFences } from '../../effects/engineers/principal';
import { collectEngineerOffers } from '../../effects/engineers/scheduling';
import { acquireScheduledEngineerTask } from '../../effects/engineers/scheduling-acquire';
import { acquireNextScheduledEngineerTask } from '../../effects/engineers/scheduling-acquire-next';
import {
  InterfaceChangeStoreError,
  readInterfaceChangeStatus,
  transitionInterfaceChangeRequest,
} from '../../effects/engineers/interface-change-store';
import { WorkDemandStoreError, readWorkDemandStatus, transitionWorkDemand } from '../../effects/engineers/work-demand-store';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { redactMcpText } from './redaction';

export const ENGINEER_MCP_TOOL_NAMES = [
  'engineer_status',
  'engineer_offers',
  'engineer_acquire',
  'engineer_acquire_next',
  'engineer_messages',
  'engineer_message_send',
  'engineer_message_ack',
  'engineer_runtime_effect_capability',
  'engineer_runtime_effect_status',
  'engineer_interface_change_propose',
  'engineer_interface_change_transition',
  'engineer_work_demand_propose',
  'engineer_work_demand_transition',
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
  engineer_acquire_next: [
    'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision',
    'idempotency_key', 'capability_id', 'minimum_priority', 'max_selection_attempts',
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
  engineer_runtime_effect_capability: [
    'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision',
  ],
  engineer_runtime_effect_status: [
    'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'effect_id',
  ],
  engineer_interface_change_propose: [
    'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision',
    'request_id', 'source_capability_id', 'target_capability_id', 'target_engineer_id',
    'interface_ref', 'proposed_change', 'compatibility_impact', 'idempotency_key',
  ],
  engineer_interface_change_transition: [
    'repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision',
    'request_id', 'transition', 'idempotency_key', 'expected_current_digest',
    'materialization_commit', 'evidence_sha256',
  ],
  engineer_work_demand_propose: ['repo_id','engineer_id','binding_id','binding_generation','engineer_contract_revision','demand_id','idempotency_key','source_capability_id','target_capability_id','target_engineer_id','problem','desired_outcome','contract_escape_reason','resource_refs','requested_urgency','dependency_hints','created_at'],
  engineer_work_demand_transition: ['repo_id','engineer_id','binding_id','binding_generation','engineer_contract_revision','demand_id','transition','idempotency_key','expected_current_digest'],
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
      name: 'engineer_acquire_next',
      description: 'Select the first canonical current Engineer offer and acquire it with a stable retry key.',
      inputSchema: {
        type: 'object',
        properties: {
          ...principalFenceProperties,
          idempotency_key: { type: 'string', minLength: 1, maxLength: 512 },
          capability_id: { type: 'string', pattern: '^capability\\.[a-z0-9][a-z0-9.-]*$' },
          minimum_priority: { type: 'number', minimum: 0, maximum: 100 },
          max_selection_attempts: { type: 'number', minimum: 1, maximum: 16 },
        },
        required: ['repo_id', 'engineer_id', 'binding_id', 'binding_generation', 'engineer_contract_revision', 'idempotency_key'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
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
      name: 'engineer_runtime_effect_capability',
      description: 'Read the operator-observed Agent Runtime capability for this exact current Engineer Binding.',
      inputSchema: {
        type: 'object',
        properties: { ...principalFenceProperties },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_runtime_effect_status',
      description: 'Read immutable Agent Runtime effect intent/current observations for this Engineer; never starts or observes an effect.',
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
    {
      name: 'engineer_interface_change_propose',
      description: 'Persist one source-Engineer-fenced ME-4B request without mutating planning, code, Task, Lease, Publication or Acceptance.',
      inputSchema: {
        type: 'object',
        properties: {
          ...principalFenceProperties,
          request_id: { type: 'string', format: 'uuid' },
          source_capability_id: { type: 'string', pattern: '^capability\\.[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9-]*$' },
          target_capability_id: { type: 'string', pattern: '^capability\\.[a-z0-9][a-z0-9-]*\\.[a-z0-9][a-z0-9-]*$' },
          target_engineer_id: { type: 'string' },
          interface_ref: { type: 'string', maxLength: 2048 },
          proposed_change: { type: 'string', maxLength: 16384 },
          compatibility_impact: { type: 'string', maxLength: 16384 },
          idempotency_key: { type: 'string', maxLength: 512 },
        },
        required: ['request_id', 'source_capability_id', 'target_capability_id', 'target_engineer_id', 'interface_ref', 'proposed_change', 'compatibility_impact', 'idempotency_key'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_interface_change_transition',
      description: 'Apply one authenticated ME-4B Engineer transition: submit, cancel, materialize or implemented.',
      inputSchema: {
        type: 'object',
        properties: {
          ...principalFenceProperties,
          request_id: { type: 'string', format: 'uuid' },
          transition: { type: 'string', enum: ['submit', 'cancel', 'materialize', 'implemented'] },
          idempotency_key: { type: 'string', maxLength: 512 },
          expected_current_digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' },
          materialization_commit: { type: ['string', 'null'], pattern: '^[0-9a-f]{40,64}$' },
          evidence_sha256: { type: ['string', 'null'], pattern: '^sha256:[0-9a-f]{64}$' },
        },
        required: ['request_id', 'transition', 'idempotency_key', 'expected_current_digest', 'materialization_commit', 'evidence_sha256'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'engineer_work_demand_propose', description: 'Persist one exact Binding-fenced Agent WorkDemand; it creates no Task, Claim, Lease or offer.',
      inputSchema: { type:'object', properties:{...principalFenceProperties,demand_id:{type:'string',format:'uuid'},idempotency_key:{type:'string',maxLength:512},source_capability_id:{type:'string'},target_capability_id:{type:'string'},target_engineer_id:{type:['string','null']},problem:{type:'string',maxLength:16384},desired_outcome:{type:'string',maxLength:16384},contract_escape_reason:{type:'string',maxLength:16384},resource_refs:{type:'array'},requested_urgency:{type:'string',enum:['low','normal','high','urgent']},dependency_hints:{type:'array',items:{type:'string'}},created_at:{type:'string'}},required:['demand_id','idempotency_key','source_capability_id','target_capability_id','target_engineer_id','problem','desired_outcome','contract_escape_reason','resource_refs','requested_urgency','dependency_hints','created_at'],additionalProperties:false},
      annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
    },
    {
      name:'engineer_work_demand_transition',description:'Submit or cancel an existing WorkDemand as its exact current requester Engineer.',
      inputSchema:{type:'object',properties:{...principalFenceProperties,demand_id:{type:'string',format:'uuid'},transition:{type:'string',enum:['submit','cancel']},idempotency_key:{type:'string',maxLength:512},expected_current_digest:{type:'string',pattern:'^sha256:[0-9a-f]{64}$'}},required:['demand_id','transition','idempotency_key','expected_current_digest'],additionalProperties:false},
      annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
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

function acquireNextAsEngineer(
  ctx: EngineerMcpToolContext,
  args: Record<string, unknown>,
  principal: ReturnType<typeof resolvePrincipal>,
): EngineerMcpToolResult {
  const result = acquireNextScheduledEngineerTask({
    repo_root: ctx.repoRoot,
    principal,
    idempotency_key: requiredString(args, 'idempotency_key'),
    filters: {
      capability_id: optionalString(args, 'capability_id'),
      minimum_priority: optionalInteger(args, 'minimum_priority', 0),
    },
    max_selection_attempts: optionalInteger(args, 'max_selection_attempts', 1),
  });
  audit(ctx, 'engineer_acquire_next', result.ok ? 'ok' : 'failed', args, result.ok ? undefined : result.message);
  return result.ok ? textResult(result) : errorResult(result.error, result.message);
}

function interfaceActor(principal: ReturnType<typeof resolvePrincipal>) {
  return Object.freeze({
    kind: 'engineer' as const,
    principal: Object.freeze({
      engineer_id: principal.engineer_id,
      binding_id: principal.binding_id,
      binding_generation: principal.binding_generation,
      engineer_contract_revision: principal.engineer_contract_revision,
    }),
  });
}

function proposeInterfaceChangeAsEngineer(
  ctx: EngineerMcpToolContext,
  args: Record<string, unknown>,
  principal: ReturnType<typeof resolvePrincipal>,
): EngineerMcpToolResult {
  const request = buildInterfaceChangeRequest({
    repository_id: principal.repository_id,
    request_id: requiredString(args, 'request_id'),
    source_capability_id: requiredString(args, 'source_capability_id'),
    target_capability_id: requiredString(args, 'target_capability_id'),
    requester_fence: interfaceActor(principal).principal,
    target_engineer_id: requiredString(args, 'target_engineer_id'),
    interface_ref: requiredString(args, 'interface_ref'),
    proposed_change: requiredString(args, 'proposed_change'),
    compatibility_impact: requiredString(args, 'compatibility_impact'),
  });
  const result = transitionInterfaceChangeRequest({
    repo_root: ctx.repoRoot,
    request,
    idempotency_key: requiredString(args, 'idempotency_key'),
    transition: 'propose',
    expected_current_digest: null,
    actor: interfaceActor(principal),
    planning_projection: null,
    materialization_commit: null,
    evidence_sha256: null,
  });
  audit(ctx, 'engineer_interface_change_propose', 'ok', args);
  return textResult(result);
}

function transitionInterfaceChangeAsEngineer(
  ctx: EngineerMcpToolContext,
  args: Record<string, unknown>,
  principal: ReturnType<typeof resolvePrincipal>,
): EngineerMcpToolResult {
  const transition = requiredString(args, 'transition') as InterfaceChangeTransition;
  if (!['submit', 'cancel', 'materialize', 'implemented'].includes(transition)) {
    throw new EngineerMcpError('INVALID_ARGUMENT', 'Engineer interface transition must be submit, cancel, materialize or implemented');
  }
  const status = readInterfaceChangeStatus(ctx.repoRoot, requiredString(args, 'request_id'));
  const result = transitionInterfaceChangeRequest({
    repo_root: ctx.repoRoot,
    request: status.request,
    idempotency_key: requiredString(args, 'idempotency_key'),
    transition,
    expected_current_digest: requiredString(args, 'expected_current_digest'),
    actor: interfaceActor(principal),
    planning_projection: null,
    materialization_commit: requiredNullableString(args, 'materialization_commit'),
    evidence_sha256: requiredNullableString(args, 'evidence_sha256'),
  });
  audit(ctx, 'engineer_interface_change_transition', 'ok', args);
  return textResult(result);
}

function demandActor(principal:ReturnType<typeof resolvePrincipal>){return {kind:'engineer' as const,principal:{engineer_id:principal.engineer_id,binding_id:principal.binding_id,binding_generation:principal.binding_generation,engineer_contract_revision:principal.engineer_contract_revision}};}
function proposeWorkDemandAsEngineer(ctx:EngineerMcpToolContext,args:Record<string,unknown>,principal:ReturnType<typeof resolvePrincipal>):EngineerMcpToolResult{
  if(!Array.isArray(args.resource_refs)||!Array.isArray(args.dependency_hints))throw new EngineerMcpError('INVALID_ARGUMENT','resource_refs and dependency_hints must be arrays');
  const demand=buildWorkDemand({repository_id:principal.repository_id,demand_id:requiredString(args,'demand_id'),idempotency_key:requiredString(args,'idempotency_key'),source_engineer:demandActor(principal).principal,source_capability_id:requiredString(args,'source_capability_id'),target_capability_id:requiredString(args,'target_capability_id'),target_engineer_id:requiredNullableString(args,'target_engineer_id'),problem:requiredString(args,'problem'),desired_outcome:requiredString(args,'desired_outcome'),contract_escape_reason:requiredString(args,'contract_escape_reason'),resource_refs:args.resource_refs as never,requested_urgency:requiredString(args,'requested_urgency') as never,dependency_hints:args.dependency_hints as string[],created_at:requiredString(args,'created_at')});
  const result=transitionWorkDemand({repo_root:ctx.repoRoot,demand,idempotency_key:requiredString(args,'idempotency_key'),transition:'propose',expected_current_digest:null,actor:demandActor(principal),acceptance:null,materialization_receipt:null});audit(ctx,'engineer_work_demand_propose','ok',args);return textResult(result);
}
function transitionWorkDemandAsEngineer(ctx:EngineerMcpToolContext,args:Record<string,unknown>,principal:ReturnType<typeof resolvePrincipal>):EngineerMcpToolResult{const transition=requiredString(args,'transition') as WorkDemandTransition;if(transition!=='submit'&&transition!=='cancel')throw new EngineerMcpError('INVALID_ARGUMENT','Engineer WorkDemand transition must be submit or cancel');const status=readWorkDemandStatus(ctx.repoRoot,requiredString(args,'demand_id'));const result=transitionWorkDemand({repo_root:ctx.repoRoot,demand:status.demand,idempotency_key:requiredString(args,'idempotency_key'),transition,expected_current_digest:requiredString(args,'expected_current_digest'),actor:demandActor(principal),acceptance:null,materialization_receipt:null});audit(ctx,'engineer_work_demand_transition','ok',args);return textResult(result);}

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
    throw new EngineerPrincipalError('engineer_principal_stale', 'current Agent Runtime Binding no longer matches authenticated principal');
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
    if (name === 'engineer_acquire_next') return acquireNextAsEngineer(ctx, args, principal);
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
    if (name === 'engineer_runtime_effect_capability') {
      const binding = currentBindingForPrincipal(ctx, principal);
      if (binding.provider !== 'codex-app-thread' && binding.provider !== 'tmux-cli-agent') {
        throw new EngineerPrincipalError('engineer_principal_mismatch', 'current Binding does not name an Agent Runtime adapter');
      }
      const result = agentRuntimeCapabilityStatusFor(ctx.repoRoot, binding.host_id, binding.provider as AgentRuntimeAdapterKind);
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    if (name === 'engineer_runtime_effect_status') {
      const effectId = optionalString(args, 'effect_id');
      if (effectId === undefined) {
        const result = observeAgentRuntimeEffects(ctx.repoRoot, principal.engineer_id);
        audit(ctx, name, 'ok', args);
        return textResult(result);
      }
      const result = observeAgentRuntimeEffectStatus(ctx.repoRoot, effectId);
      if (result.intent.endpoint_fence.engineer_id !== principal.engineer_id) {
        throw new EngineerPrincipalError('engineer_principal_mismatch', 'effect does not belong to authenticated Engineer');
      }
      audit(ctx, name, 'ok', args);
      return textResult(result);
    }
    if (name === 'engineer_interface_change_propose') return proposeInterfaceChangeAsEngineer(ctx, args, principal);
    if (name === 'engineer_interface_change_transition') return transitionInterfaceChangeAsEngineer(ctx, args, principal);
    if (name === 'engineer_work_demand_propose') return proposeWorkDemandAsEngineer(ctx,args,principal);
    if (name === 'engineer_work_demand_transition') return transitionWorkDemandAsEngineer(ctx,args,principal);
    return messageSendAsEngineer(ctx, args, principal);
  } catch (error) {
    const code = error instanceof EngineerPrincipalError || error instanceof EngineerMcpError
      || error instanceof EngineerSchedulingError || error instanceof ModuleMessageError
      || error instanceof ModuleInboxError
      || error instanceof AgentRuntimeEffectError || error instanceof AgentRuntimeEffectStoreError
      || error instanceof InterfaceChangeError || error instanceof InterfaceChangeStoreError
      || error instanceof WorkDemandError || error instanceof WorkDemandStoreError
      ? error.code
      : 'ENGINEER_TOOL_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    audit(ctx, name, code === 'INVALID_ARGUMENT' ? 'blocked' : 'failed', args, message);
    return errorResult(code, message);
  }
}
