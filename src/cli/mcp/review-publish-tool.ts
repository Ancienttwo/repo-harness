import { isAbsolute, resolve } from 'path';

import { publishReview, ReviewPublishError } from '../../effects/review/review-publish';
import { currentMcpActor, hashMcpInput, tryWriteMcpAuditEntry } from './audit';
import { FleetMcpError, resolveGrantedWriteTarget } from './fleet-tools';
import { redactMcpText } from './redaction';
import type { McpPolicy } from './types';

/** Orchestrator-only: the executor owns publication, so the orchestrator owns review publication. */
export const REVIEW_PUBLISH_TOOL_NAME = 'review_publish';

export interface ReviewPublishToolDefinition {
  readonly name: typeof REVIEW_PUBLISH_TOOL_NAME;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: Record<string, unknown>;
}

export interface ReviewPublishToolContext {
  readonly repoRoot: string;
  readonly policy: McpPolicy;
}

export interface ReviewPublishToolResult {
  readonly content: Array<{ readonly type: 'text'; readonly text: string }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}

class ReviewPublishToolError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ReviewPublishToolError';
  }
}

function textResult(value: unknown): ReviewPublishToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}

function errorResult(code: string, message: string, details?: unknown): ReviewPublishToolResult {
  return { ...textResult({ error: { code, message: redactMcpText(message).text, details } }), isError: true };
}

export function buildReviewPublishToolDefinitions(): ReviewPublishToolDefinition[] {
  return [{
    name: REVIEW_PUBLISH_TOOL_NAME,
    description: 'Publish one gatekeeper review receipt to a GitHub pull request: an acceptance claim comment, exactly one COMMENT review with one inline thread per P0/P1/P2 finding and NITs only in the review body, then an acceptance record comment. It requires the orchestrator profile and an adopted repository with an explicit read_write grant. It posts nothing when the receipt is invalid or its subject SHA is not the PR head, and it reports an unknown write outcome for inspection instead of retrying.',
    inputSchema: {
      type: 'object',
      properties: {
        repo_path: { type: 'string' },
        pr_number: { type: 'number', minimum: 1 },
        receipt_path: { type: 'string' },
      },
      required: ['pr_number', 'receipt_path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }];
}

export function callReviewPublishTool(ctx: ReviewPublishToolContext, args: Record<string, unknown> = {}): ReviewPublishToolResult {
  try {
    if (ctx.policy.profile !== 'orchestrator') throw new ReviewPublishToolError('TOOL_NOT_AVAILABLE', 'review_publish is only available in the orchestrator profile');
    const keys = Object.keys(args).sort();
    if (keys.some((key) => !['repo_path', 'pr_number', 'receipt_path'].includes(key))) throw new ReviewPublishToolError('INVALID_ARGUMENT', 'unknown review_publish argument');
    if (typeof args.pr_number !== 'number' || !Number.isSafeInteger(args.pr_number) || args.pr_number < 1) throw new ReviewPublishToolError('INVALID_ARGUMENT', 'pr_number must be a positive integer');
    if (args.repo_path !== undefined && typeof args.repo_path !== 'string') throw new ReviewPublishToolError('INVALID_ARGUMENT', 'repo_path must be a string');
    if (typeof args.receipt_path !== 'string' || !args.receipt_path.trim()) throw new ReviewPublishToolError('INVALID_ARGUMENT', 'receipt_path is required');
    const repoRoot = resolveGrantedWriteTarget(ctx, { repo_path: args.repo_path }, REVIEW_PUBLISH_TOOL_NAME).repoRoot;
    const receiptPath = isAbsolute(args.receipt_path) ? args.receipt_path : resolve(repoRoot, args.receipt_path);
    const result = publishReview({ repoRoot, prNumber: args.pr_number, receiptPath });
    tryWriteMcpAuditEntry(repoRoot, {
      timestamp: new Date().toISOString(),
      tool: REVIEW_PUBLISH_TOOL_NAME,
      status: 'ok',
      actor: currentMcpActor(),
      inputHash: hashMcpInput(args),
      pr_number: result.pr,
      head_sha: result.head_sha,
      outcome: 'published',
    });
    return textResult(result);
  } catch (error) {
    const code = error instanceof ReviewPublishError ? error.code
      : error instanceof FleetMcpError || error instanceof ReviewPublishToolError ? error.code : 'TOOL_FAILED';
    const details = error instanceof ReviewPublishError
      ? {
          exit_code: error.exitCode,
          posted: error.posted,
          ...(error.code === 'review_publish_unknown' ? { inspect_required: true, confirmed_urls: error.posted } : {}),
        }
      : error instanceof FleetMcpError && error.details !== undefined ? error.details : undefined;
    tryWriteMcpAuditEntry(ctx.repoRoot, {
      timestamp: new Date().toISOString(),
      tool: REVIEW_PUBLISH_TOOL_NAME,
      status: 'failed',
      actor: currentMcpActor(),
      inputHash: hashMcpInput(args),
      error: error instanceof Error ? error.message : String(error),
      errorCode: code,
    });
    return errorResult(code, error instanceof Error ? error.message : String(error), details);
  }
}
