/**
 * MCP transport adapters for the fleet/publication effects.
 *
 * This module intentionally owns no task, lease, receipt, or publication
 * authority.  It validates the MCP envelope, resolves the registered-repo
 * authorization boundary for mutations, and delegates the operation to the
 * same effects used by the CLI.
 */

import { randomUUID } from 'crypto';
import { realpathSync } from 'fs';
import { resolve } from 'path';

import {
  acquireFleetTask,
  collectFleetOffers,
  FleetOffersError,
} from '../../effects/fleet/acquire';
import {
  MergeReadinessError,
  resolvePublicationReadiness,
} from '../../effects/publication/merge-readiness';
import {
  reopenPublication,
  takeoverPublication,
} from '../../effects/publication/publication-lifecycle';
import { PublicationLifecycleError } from '../../core/publication/publication-lifecycle';
import {
  readRepoHarnessRegistrySnapshot,
  type RepoHarnessRegisteredRepo,
  type RepoHarnessRegistrySnapshot,
} from '../../effects/repo-registry';
import { hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { redactMcpText } from './redaction';
import type { McpPolicy } from './types';

export const FLEET_MCP_TOOL_NAMES = [
  'fleet_offers',
  'fleet_acquire',
  'publication_readiness',
  'publication_reopen',
  'publication_takeover',
] as const;

export type FleetMcpToolName = typeof FLEET_MCP_TOOL_NAMES[number];

const FLEET_MCP_PARAMETER_NAMES: Readonly<Record<FleetMcpToolName, readonly string[]>> = Object.freeze({
  fleet_offers: ['repo_id', 'repo_path'],
  fleet_acquire: ['repo_id', 'repo_path', 'task_id', 'offer_revision', 'session_id', 'max_attempts', 'authorization_revision'],
  publication_readiness: ['repo_id', 'repo_path', 'publication_id', 'pr_number'],
  publication_reopen: ['repo_id', 'repo_path', 'task_id', 'claim_id', 'expected_generation', 'publication_id', 'expected_head_sha', 'authorization_revision'],
  publication_takeover: ['repo_id', 'repo_path', 'task_id', 'expected_claim_id', 'expected_generation', 'publication_id', 'expected_head_sha', 'reason', 'session_id', 'authorization_revision'],
});

export interface FleetMcpToolDefinition {
  readonly name: FleetMcpToolName;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, unknown>;
}

export interface FleetMcpToolContext {
  readonly repoRoot: string;
  readonly policy: McpPolicy;
}

export interface FleetMcpToolResult {
  readonly content: Array<{ readonly type: 'text'; readonly text: string }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

interface FleetTarget {
  readonly repoRoot: string;
  readonly registeredRepo?: RepoHarnessRegisteredRepo;
  /** Only an explicit repo_id/repo_path narrows fleet offers to one repo. */
  readonly repoId?: string;
  readonly registry: RepoHarnessRegistrySnapshot;
}

class FleetMcpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'FleetMcpError';
  }
}

const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const MUTATION_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
});

const optionalRepoProperties = {
  repo_id: { type: 'string' },
  repo_path: { type: 'string' },
};

const authorizationProperty = {
  authorization_revision: { type: 'number', minimum: 0 },
};

function textResult(value: unknown): FleetMcpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  };
}

function errorResult(code: string, message: string, details?: unknown): FleetMcpToolResult {
  const value = {
    error: {
      code,
      message: redactMcpText(message).text,
      ...(details === undefined ? {} : { details }),
    },
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: true,
  };
}

function audit(
  ctx: FleetMcpToolContext,
  tool: string,
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

function canonicalPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function nonEmptyString(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FleetMcpError('INVALID_ARGUMENT', `${name} is required`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FleetMcpError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
  }
  return value.trim();
}

function positiveInteger(args: Record<string, unknown>, name: string): number {
  const value = args[name];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new FleetMcpError('INVALID_ARGUMENT', `${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(args: Record<string, unknown>, name: string): number {
  const value = args[name];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new FleetMcpError('INVALID_ARGUMENT', `${name} must be a non-negative integer`);
  }
  return value;
}

/** Validate the actual MCP call envelope; inputSchema is only documentation. */
export function fleetToolArgumentError(name: FleetMcpToolName, args: Record<string, unknown>): string | undefined {
  const allowed = FLEET_MCP_PARAMETER_NAMES[name];
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key)).sort();
  if (unknown.length === 0) return undefined;
  return `${name} does not accept unknown parameter${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}`;
}

function targetFromArgs(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetTarget {
  const registry = readRepoHarnessRegistrySnapshot({ adoptedOnly: true });
  const requestedId = optionalString(args, 'repo_id');
  const requestedPath = optionalString(args, 'repo_path');
  const explicitTarget = requestedId !== undefined || requestedPath !== undefined;
  const registeredRepo = requestedId === undefined
    ? undefined
    : registry.repos.find((repo) => repo.id === requestedId);

  if (requestedId !== undefined && registeredRepo === undefined) {
    throw new FleetMcpError('REPO_NOT_ALLOWED', 'repo_id is not in the adopted repo registry', { repo_id: requestedId });
  }

  const pathTarget = requestedPath === undefined
    ? undefined
    : canonicalPath(requestedPath.startsWith('/') ? requestedPath : resolve(ctx.repoRoot, requestedPath));
  const repoRoot = pathTarget ?? (registeredRepo ? canonicalPath(registeredRepo.path) : canonicalPath(ctx.repoRoot));

  if (pathTarget !== undefined && registeredRepo !== undefined && pathTarget !== canonicalPath(registeredRepo.path)) {
    throw new FleetMcpError('REPO_TARGET_MISMATCH', 'repo_id and repo_path resolve to different repositories', {
      repo_id: requestedId,
      repo_path: requestedPath,
    });
  }

  const matchingRepo = registeredRepo ?? registry.repos.find((repo) => canonicalPath(repo.path) === repoRoot);
  if (explicitTarget && matchingRepo === undefined) {
    throw new FleetMcpError('REPO_NOT_ALLOWED', 'repo_path must target an adopted repository in the MCP registry', {
      repo_path: requestedPath,
    });
  }
  return {
    repoRoot,
    registeredRepo: matchingRepo,
    repoId: explicitTarget ? matchingRepo?.id : undefined,
    registry,
  };
}

function publicationAuthorizationFence(
  repo: RepoHarnessRegisteredRepo,
  expectedRevision: number,
): () => void {
  return () => {
    const current = readRepoHarnessRegistrySnapshot({ adoptedOnly: true });
    const currentRepo = current.repos.find((entry) => entry.id === repo.id);
    const details = {
      repo_id: repo.id,
      expected_revision: String(expectedRevision),
      current_revision: String(current.authorizationRevision),
    };
    if (currentRepo === undefined || currentRepo.path !== repo.path) {
      throw new PublicationLifecycleError(
        'publication_claim_mismatch',
        'publication authorization target is no longer in the adopted repo registry',
        undefined,
        details,
      );
    }
    if (currentRepo.accessMode !== 'read_write') {
      throw new PublicationLifecycleError(
        'publication_claim_mismatch',
        'publication authorization target is no longer read_write',
        undefined,
        details,
      );
    }
    if (current.authorizationRevision !== expectedRevision) {
      throw new PublicationLifecycleError(
        'publication_claim_mismatch',
        'publication authorization revision changed before mutation',
        undefined,
        details,
      );
    }
  };
}

function assertMutationAuthorization(
  ctx: FleetMcpToolContext,
  target: FleetTarget,
  args: Record<string, unknown>,
): () => void {
  if (ctx.policy.profile !== 'coding' || !ctx.policy.capabilities.workspaceCoder || !ctx.policy.execution.codingShell) {
    throw new FleetMcpError('POLICY_DENIED', 'fleet/publication mutations require the coding MCP profile');
  }
  if (target.registeredRepo === undefined) {
    throw new FleetMcpError('REPO_NOT_ALLOWED', 'mutation target must be an adopted registered repository');
  }
  if (target.registeredRepo.accessMode !== 'read_write') {
    throw new FleetMcpError('WRITE_DISABLED', 'mutation target is read_only; explicit read_write authorization is required', {
      repo_id: target.registeredRepo.id,
      access_mode: target.registeredRepo.accessMode,
    });
  }
  const expectedRevision = nonNegativeInteger(args, 'authorization_revision');
  if (expectedRevision !== target.registry.authorizationRevision) {
    throw new FleetMcpError('AUTHORIZATION_STALE', 'authorization_revision is stale; re-read fleet_offers or the repo capabilities and retry', {
      expected_revision: expectedRevision,
    });
  }
  return publicationAuthorizationFence(target.registeredRepo, expectedRevision);
}

function publicationEnvironment(): {
  readonly gh_bin?: string;
  readonly git_bin?: string;
  readonly merge_seal_path?: string;
  readonly checks_path?: string;
} {
  return {
    gh_bin: process.env.REPO_HARNESS_GH_BIN,
    git_bin: process.env.REPO_HARNESS_GIT_BIN,
    merge_seal_path: process.env.REPO_HARNESS_PUBLICATION_SEAL_PATH,
    checks_path: process.env.REPO_HARNESS_PUBLICATION_CHECKS_PATH,
  };
}

function callFleetOffers(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetMcpToolResult {
  const target = targetFromArgs(ctx, args);
  const result = collectFleetOffers({
    env: process.env,
    repo_id: target.repoId,
  });
  audit(ctx, 'fleet_offers', 'ok', args);
  return textResult(result);
}

function callPublicationReadiness(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetMcpToolResult {
  const target = targetFromArgs(ctx, args);
  const publicationId = optionalString(args, 'publication_id');
  const prNumber = args.pr_number === undefined ? undefined : positiveInteger(args, 'pr_number');
  const result = resolvePublicationReadiness({
    ...publicationEnvironment(),
    repo_root: target.repoRoot,
    publication_id: publicationId,
    pr_number: prNumber,
  });
  audit(ctx, 'publication_readiness', 'ok', args);
  return textResult(result);
}

function callPublicationReopen(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetMcpToolResult {
  const target = targetFromArgs(ctx, args);
  const authorizationFence = assertMutationAuthorization(ctx, target, args);
  const record = reopenPublication({
    ...publicationEnvironment(),
    repo_root: target.repoRoot,
    task_id: nonEmptyString(args, 'task_id'),
    claim_id: nonEmptyString(args, 'claim_id'),
    expected_generation: positiveInteger(args, 'expected_generation'),
    publication_id: nonEmptyString(args, 'publication_id'),
    expected_head_sha: nonEmptyString(args, 'expected_head_sha'),
    authorization_fence: authorizationFence,
  });
  audit(ctx, 'publication_reopen', 'ok', args);
  return textResult({ ok: true, lease: record });
}

function callPublicationTakeover(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetMcpToolResult {
  const target = targetFromArgs(ctx, args);
  const authorizationFence = assertMutationAuthorization(ctx, target, args);
  const record = takeoverPublication({
    ...publicationEnvironment(),
    repo_root: target.repoRoot,
    task_id: nonEmptyString(args, 'task_id'),
    expected_claim_id: nonEmptyString(args, 'expected_claim_id'),
    expected_generation: positiveInteger(args, 'expected_generation'),
    publication_id: nonEmptyString(args, 'publication_id'),
    expected_head_sha: nonEmptyString(args, 'expected_head_sha'),
    reason: nonEmptyString(args, 'reason'),
    session_id: nonEmptyString(args, 'session_id'),
    new_claim_id: randomUUID(),
    source_worktree: target.repoRoot,
    authorization_fence: authorizationFence,
  });
  audit(ctx, 'publication_takeover', 'ok', args);
  return textResult({ ok: true, lease: record });
}

/** The MCP adapter passes assertions through to the canonical acquire effect. */
function callFleetAcquire(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetMcpToolResult {
  const target = targetFromArgs(ctx, args);
  assertMutationAuthorization(ctx, target, args);
  const repoId = target.registeredRepo?.id;
  const taskId = optionalString(args, 'task_id');
  const offerRevision = optionalString(args, 'offer_revision');
  const authorizationRevision = nonNegativeInteger(args, 'authorization_revision');
  const sessionId = optionalString(args, 'session_id');
  const maxAttempts = args.max_attempts === undefined ? undefined : positiveInteger(args, 'max_attempts');
  const result = acquireFleetTask({
    env: process.env,
    repo_id: repoId,
    session_id: sessionId,
    max_attempts: maxAttempts,
    assertion: {
      repo_id: repoId,
      ...(taskId === undefined ? {} : { task_id: taskId }),
      ...(offerRevision === undefined ? {} : { offer_revision: offerRevision }),
      authorization_revision: authorizationRevision,
    },
  });
  audit(ctx, 'fleet_acquire', result.ok ? 'ok' : 'failed', args, result.ok ? undefined : result.message);
  return textResult(result);
}

function errorFromUnknown(error: unknown): FleetMcpToolResult {
  if (error instanceof FleetMcpError) return errorResult(error.code, error.message, error.details);
  if (error instanceof FleetOffersError) return errorResult(error.code, error.message, { repo_id: error.repo_id });
  if (error instanceof MergeReadinessError) return errorResult(error.code, error.message);
  if (error instanceof PublicationLifecycleError) return errorResult(error.code, error.message, error.details);
  if (error instanceof Error) return errorResult('TOOL_FAILED', error.message);
  return errorResult('TOOL_FAILED', String(error));
}

function isBlocked(error: unknown): boolean {
  if (error instanceof PublicationLifecycleError) return true;
  return error instanceof FleetMcpError && [
    'INVALID_ARGUMENT',
    'POLICY_DENIED',
    'REPO_NOT_ALLOWED',
    'REPO_TARGET_MISMATCH',
    'WRITE_DISABLED',
    'AUTHORIZATION_STALE',
  ].includes(error.code);
}

export function buildFleetToolDefinitions(): FleetMcpToolDefinition[] {
  const offersSchema = {
    type: 'object',
    properties: { ...optionalRepoProperties },
    additionalProperties: false,
  };
  const acquireSchema = {
    type: 'object',
    properties: {
      ...optionalRepoProperties,
      task_id: { type: 'string' },
      offer_revision: { type: 'string' },
      session_id: { type: 'string' },
      max_attempts: { type: 'number', minimum: 1, maximum: 16 },
      ...authorizationProperty,
    },
    required: ['authorization_revision'],
    additionalProperties: false,
  };
  const readinessSchema = {
    type: 'object',
    properties: {
      ...optionalRepoProperties,
      publication_id: { type: 'string' },
      pr_number: { type: 'number', minimum: 1 },
    },
    additionalProperties: false,
  };
  const reopenSchema = {
    type: 'object',
    properties: {
      ...optionalRepoProperties,
      task_id: { type: 'string' },
      claim_id: { type: 'string' },
      expected_generation: { type: 'number', minimum: 1 },
      publication_id: { type: 'string' },
      expected_head_sha: { type: 'string' },
      ...authorizationProperty,
    },
    required: ['task_id', 'claim_id', 'expected_generation', 'publication_id', 'expected_head_sha', 'authorization_revision'],
    additionalProperties: false,
  };
  const takeoverSchema = {
    type: 'object',
    properties: {
      ...optionalRepoProperties,
      task_id: { type: 'string' },
      expected_claim_id: { type: 'string' },
      expected_generation: { type: 'number', minimum: 1 },
      publication_id: { type: 'string' },
      expected_head_sha: { type: 'string' },
      reason: { type: 'string' },
      session_id: { type: 'string' },
      ...authorizationProperty,
    },
    required: ['task_id', 'expected_claim_id', 'expected_generation', 'publication_id', 'expected_head_sha', 'reason', 'session_id', 'authorization_revision'],
    additionalProperties: false,
  };
  return [
    {
      name: 'fleet_offers',
      description: 'Return the deterministic FleetOffersV1 projection from the registry and canonical task boards.',
      inputSchema: offersSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    {
      name: 'fleet_acquire',
      description: 'Acquire one execution-ready task through the fleet acquisition effect and return WorkEnvelopeV1.',
      inputSchema: acquireSchema,
      annotations: MUTATION_ANNOTATIONS,
    },
    {
      name: 'publication_readiness',
      description: 'Return one fenced MergeReadinessV1 verdict using the publication readiness effect.',
      inputSchema: readinessSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    {
      name: 'publication_reopen',
      description: 'Reopen one reviewing publication through the task-locked publication lifecycle effect.',
      inputSchema: reopenSchema,
      annotations: MUTATION_ANNOTATIONS,
    },
    {
      name: 'publication_takeover',
      description: 'Take over one reviewing publication through the task-locked publication lifecycle effect.',
      inputSchema: takeoverSchema,
      annotations: MUTATION_ANNOTATIONS,
    },
  ];
}

export function isFleetTool(name: string): name is FleetMcpToolName {
  return (FLEET_MCP_TOOL_NAMES as readonly string[]).includes(name);
}

export function callFleetTool(
  ctx: FleetMcpToolContext,
  name: FleetMcpToolName,
  args: Record<string, unknown> = {},
): FleetMcpToolResult {
  try {
    const argumentError = fleetToolArgumentError(name, args);
    if (argumentError !== undefined) throw new FleetMcpError('INVALID_ARGUMENT', argumentError);
    switch (name) {
      case 'fleet_offers': return callFleetOffers(ctx, args);
      case 'fleet_acquire': return callFleetAcquire(ctx, args);
      case 'publication_readiness': return callPublicationReadiness(ctx, args);
      case 'publication_reopen': return callPublicationReopen(ctx, args);
      case 'publication_takeover': return callPublicationTakeover(ctx, args);
    }
    return errorResult('UNKNOWN_TOOL', `unknown fleet MCP tool: ${name}`);
  } catch (error) {
    audit(ctx, name, isBlocked(error) ? 'blocked' : 'failed', args, error instanceof Error ? error.message : String(error));
    return errorFromUnknown(error);
  }
}
