/**
 * MCP transport adapters for the fleet/publication effects.
 *
 * This module intentionally owns no task, lease, receipt, or publication
 * authority.  It validates the MCP envelope, resolves the registered-repo
 * authorization boundary for mutations, and delegates the operation to the
 * same effects used by the CLI.
 */

import { realpathSync } from 'fs';
import { resolve } from 'path';

import { MergeReadinessError, assertLocalPullRequestRepository, collectPullRequestMergeReadiness } from '../../effects/publication/merge-readiness';
import { executePublicationMerge } from '../../effects/publication/merge-executor';
import { readRepoHarnessRegistrySnapshot, type RepoHarnessRegisteredRepo, type RepoHarnessRegistrySnapshot } from '../../effects/repo-registry';
import { currentMcpActor, hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { redactMcpText } from './redaction';
import type { McpPolicy } from './types';

export const FLEET_MCP_TOOL_NAMES = [
  'publication_readiness',
] as const;

export type FleetMcpToolName = typeof FLEET_MCP_TOOL_NAMES[number];

/** Granted only by the publicationMerge capability; listing and dispatch both check it. */
export const PUBLICATION_MERGE_TOOL_NAME = 'merge_pull_request';

const PULL_REQUEST_SELECTION_PARAMETERS = ['repo_id', 'repo_path', 'repository', 'provider_repository_id', 'pr_number', 'expected_head_sha', 'expected_base_sha'];

const FLEET_MCP_PARAMETER_NAMES: Readonly<Record<FleetMcpToolName | typeof PUBLICATION_MERGE_TOOL_NAME, readonly string[]>> = Object.freeze({
  publication_readiness: PULL_REQUEST_SELECTION_PARAMETERS,
  merge_pull_request: PULL_REQUEST_SELECTION_PARAMETERS,
});

export interface FleetMcpToolDefinition {
  readonly name: FleetMcpToolName | typeof PUBLICATION_MERGE_TOOL_NAME;
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
  /** An explicit repo_id/repo_path selects the publication repository. */
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

const optionalRepoProperties = {
  repo_id: { type: 'string' },
  repo_path: { type: 'string' },
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


function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new FleetMcpError('INVALID_ARGUMENT', `${name} must be a non-empty string`);
  }
  return value.trim();
}

function requiredString(args: Record<string, unknown>, name: string): string {
  const value = optionalString(args, name);
  if (value === undefined) throw new FleetMcpError('INVALID_ARGUMENT', `${name} is required`);
  return value;
}

function positiveInteger(args: Record<string, unknown>, name: string): number {
  const value = args[name];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new FleetMcpError('INVALID_ARGUMENT', `${name} must be a positive integer`);
  }
  return value;
}


/** Validate the actual MCP call envelope; inputSchema is only documentation. */
export function fleetToolArgumentError(name: FleetMcpToolName | typeof PUBLICATION_MERGE_TOOL_NAME, args: Record<string, unknown>): string | undefined {
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

function publicationEnvironment(): {
  readonly gh_bin?: string;
  readonly git_bin?: string;
} {
  return {
    gh_bin: process.env.REPO_HARNESS_GH_BIN,
    git_bin: process.env.REPO_HARNESS_GIT_BIN,
  };
}

function callPublicationReadiness(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetMcpToolResult {
  const target = targetFromArgs(ctx, args);
  const repository = requiredString(args, 'repository');
  try { assertLocalPullRequestRepository(target.repoRoot, repository); }
  catch (error) { throw new FleetMcpError('REPO_NOT_ALLOWED', error instanceof Error ? error.message : String(error)); }
  const result = collectPullRequestMergeReadiness({ ...publicationEnvironment(), repo_root: target.repoRoot,
    ...pullRequestSelection(args) });
  audit(ctx, 'publication_readiness', 'ok', args);
  return textResult(result);
}

function pullRequestSelection(args: Record<string, unknown>) {
  return {
    repository: requiredString(args, 'repository'),
    provider_repository_id: requiredString(args, 'provider_repository_id'),
    pr_number: positiveInteger(args, 'pr_number'),
    expected_head_sha: requiredString(args, 'expected_head_sha'),
    expected_base_sha: requiredString(args, 'expected_base_sha'),
  };
}

/** The same executor as `repo-harness publication merge`, bound to a read_write granted checkout of the repository. */
function callPublicationMerge(ctx: FleetMcpToolContext, args: Record<string, unknown>): FleetMcpToolResult {
  const target = targetFromArgs(ctx, args);
  if (target.registeredRepo?.accessMode !== 'read_write') {
    throw new FleetMcpError('REPO_NOT_ALLOWED', 'merge_pull_request requires an adopted repo with an explicit read_write grant');
  }
  const selection = pullRequestSelection(args);
  try { assertLocalPullRequestRepository(target.repoRoot, selection.repository); }
  catch (error) { throw new FleetMcpError('REPO_NOT_ALLOWED', error instanceof Error ? error.message : String(error)); }
  const result = executePublicationMerge({ ...publicationEnvironment(), repo_root: target.repoRoot, ...selection });
  const merged = result.exit_code === 0;
  const outcome = result.exit_code === 0 ? 'merged' : result.document.error;
  const audited = tryWriteMcpAuditEntry(ctx.repoRoot, {
    timestamp: new Date().toISOString(),
    tool: PUBLICATION_MERGE_TOOL_NAME,
    status: merged ? 'ok' : result.exit_code === 3 || result.exit_code === 4 ? 'blocked' : 'failed',
    actor: currentMcpActor(),
    repoId: target.registeredRepo.id,
    inputHash: hashMcpInput(args),
    pr_number: selection.pr_number,
    head_sha: selection.expected_head_sha,
    base_sha: selection.expected_base_sha,
    outcome,
    ...(result.exit_code === 0 ? { merge_commit_sha: result.document.merge_commit_sha } : { errorCode: outcome }),
  });
  // A merged PR stays merged when its audit row cannot be written; the merge is never retried.
  const auditFlag = audited ? {} : { audit_write_failed: true };
  if (result.exit_code === 0) return textResult({ ...result.document, ...auditFlag });
  return errorResult(result.document.error, result.document.message, {
    exit_code: result.exit_code,
    ...(result.document.blockers ? { blockers: result.document.blockers } : {}),
    ...auditFlag,
  });
}

export function buildPublicationMergeToolDefinitions(): FleetMcpToolDefinition[] {
  return [{
    name: PUBLICATION_MERGE_TOOL_NAME,
    description: 'Squash-merge one same-repository PR into the default branch through the repo-harness publication merge executor. It merges only when publication.acceptance_merge is "on" in the policy at the PR base, branch protection requires strict checks and enforce_admins, readiness has no blockers, and closing references match.',
    inputSchema: pullRequestSelectionSchema(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }];
}

/** Merge tool dispatch. The caller checks the publicationMerge capability first. */
export function callPublicationMergeTool(ctx: FleetMcpToolContext, args: Record<string, unknown> = {}): FleetMcpToolResult {
  try {
    const argumentError = fleetToolArgumentError(PUBLICATION_MERGE_TOOL_NAME, args);
    if (argumentError !== undefined) throw new FleetMcpError('INVALID_ARGUMENT', argumentError);
    return callPublicationMerge(ctx, args);
  } catch (error) {
    tryWriteMcpAuditEntry(ctx.repoRoot, {
      timestamp: new Date().toISOString(),
      tool: PUBLICATION_MERGE_TOOL_NAME,
      status: isBlocked(error) ? 'blocked' : 'failed',
      actor: currentMcpActor(),
      inputHash: hashMcpInput(args),
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof FleetMcpError ? { errorCode: error.code } : {}),
    });
    return errorFromUnknown(error);
  }
}

function errorFromUnknown(error: unknown): FleetMcpToolResult {
  if (error instanceof FleetMcpError) return errorResult(error.code, error.message, error.details);
  if (error instanceof MergeReadinessError) return errorResult(error.code, error.message);
  if (error instanceof Error) return errorResult('TOOL_FAILED', error.message);
  return errorResult('TOOL_FAILED', String(error));
}

function isBlocked(error: unknown): boolean {
  return error instanceof FleetMcpError && [
    'INVALID_ARGUMENT',
    'POLICY_DENIED',
    'REPO_NOT_ALLOWED',
    'REPO_TARGET_MISMATCH',
    'WRITE_DISABLED',
    'AUTHORIZATION_STALE',
  ].includes(error.code);
}

function pullRequestSelectionSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      ...optionalRepoProperties,
      repository: { type: 'string' }, provider_repository_id: { type: 'string' },
      expected_head_sha: { type: 'string' }, expected_base_sha: { type: 'string' },
      pr_number: { type: 'number', minimum: 1 },
    },
    required: ['repository', 'provider_repository_id', 'pr_number', 'expected_head_sha', 'expected_base_sha'],
    additionalProperties: false,
  };
}

export function buildFleetToolDefinitions(): FleetMcpToolDefinition[] {
  return [
    {
      name: 'publication_readiness',
      description: 'Return one explicit provider PullRequestReadinessV2 verdict.',
      inputSchema: pullRequestSelectionSchema(),
      annotations: READ_ONLY_ANNOTATIONS,
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
      case 'publication_readiness': return callPublicationReadiness(ctx, args);
    }
    return errorResult('UNKNOWN_TOOL', `unknown fleet MCP tool: ${name}`);
  } catch (error) {
    audit(ctx, name, isBlocked(error) ? 'blocked' : 'failed', args, error instanceof Error ? error.message : String(error));
    return errorFromUnknown(error);
  }
}
