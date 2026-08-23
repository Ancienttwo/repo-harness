/**
 * Turn-boundary Task Inbox adapter shared by Claude and Codex.
 *
 * This handler is intentionally a transport boundary only.  It resolves the
 * worktree-local claim token, asks the effect layer to revalidate canonical
 * task/lease facts and persist delivery before returning, then emits one
 * structured context envelope.  Message bodies are peer data: they are never
 * interpreted as prompt or workflow input by this route.
 */

import { readText } from '../../effects/state/collect-state-inputs';
import {
  findClaimTokenByUnitRef,
  type ClaimTokenRead,
} from '../../effects/state/coordination-claim-token';
import { readLease } from '../../effects/state/coordination-lease-store';
import { TaskInboxError, deliverTaskInbox, type TaskInboxDelivery } from '../../effects/fleet/task-inbox';
import {
  TASK_MESSAGE_CONTEXT_END,
  TASK_MESSAGE_CONTEXT_START,
  renderTaskMessageUntrustedContext,
} from '../../core/fleet/task-message';

const ACTIVE_PLAN_MARKER = '.ai/harness/active-plan';

export interface TaskInboxHandlerResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reason?: string;
}

export interface TaskInboxHandlerInput {
  readonly repoRoot: string;
  readonly input?: string | Buffer;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly dependencies?: TaskInboxHandlerDependencies;
}

export interface TaskInboxHandlerDependencies {
  readonly findClaimToken?: typeof findClaimTokenByUnitRef;
  readonly readOwnerLease?: typeof readLease;
  readonly deliver?: typeof deliverTaskInbox;
}

function result(
  exitCode: number,
  stdout = '',
  stderr = '',
  reason?: string,
): TaskInboxHandlerResult {
  return { exitCode, stdout, stderr, ...(reason ? { reason } : {}) };
}

function activePlanUnitRef(repoRoot: string): string | null {
  const marker = readText(repoRoot, ACTIVE_PLAN_MARKER);
  const value = marker?.trim() ?? '';
  return value.length > 0 ? value : null;
}

function tokenForCurrentWorktree(
  repoRoot: string,
  deps: TaskInboxHandlerDependencies,
): ClaimTokenRead {
  const unitRef = activePlanUnitRef(repoRoot);
  if (unitRef === null) return { outcome: 'none' };
  return (deps.findClaimToken ?? findClaimTokenByUnitRef)(repoRoot, unitRef);
}

function renderContext(deliveries: readonly TaskInboxDelivery[]): string {
  return renderTaskMessageUntrustedContext(deliveries.map((delivery) => delivery.event));
}

function structuredContext(context: string): string {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: context,
    },
  })}\n`;
}

function errorResult(error: unknown): TaskInboxHandlerResult {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof TaskInboxError ? error.code : 'task_message_unreadable';
  return result(1, '', `${JSON.stringify({ ok: false, error: code, message })}\n`, 'task-message-failed');
}

/**
 * Deliver pending owner messages for the exact claim represented by this
 * worktree.  A missing token is a normal no-op: it means this worktree is not
 * a task owner and therefore must not guess a task or recipient.
 */
export function runTaskInboxHandler(opts: TaskInboxHandlerInput): TaskInboxHandlerResult {
  const deps = opts.dependencies ?? {};
  const token = tokenForCurrentWorktree(opts.repoRoot, deps);
  if (token.outcome === 'none') return result(0);
  if (token.outcome === 'ambiguous') {
    return errorResult(new Error(`ambiguous claim token for active plan: ${token.matches.join(', ')}`));
  }

  try {
    const leaseRead = (deps.readOwnerLease ?? readLease)(opts.repoRoot, token.token.task_id);
    if (leaseRead.record === null) return result(0);
    const lease = leaseRead.record;
    // The effect owns canonical worktree comparison.  Do not compare a
    // symlinked host path here: macOS commonly exposes the same temp/repo path
    // as `/var/...` at the shell boundary and `/private/var/...` through
    // realpath, while the bound lease preserves the path written by bind.
    if (lease.claim_id !== token.token.claim_id) return result(0);
    const worktree = opts.repoRoot;

    const delivered = (deps.deliver ?? deliverTaskInbox)({
      repo_root: opts.repoRoot,
      task_id: token.token.task_id,
      canonical_source: {
        targetRef: lease.target_ref,
        sprintPath: lease.sprint_path,
      },
      recipient: {
        kind: 'claim',
        claim_id: lease.claim_id,
        generation: lease.generation,
      },
      execution_worktree: worktree,
      delivery_channel: 'hook_session',
      delivered_at: (opts.now ?? (() => new Date()))().toISOString(),
    });
    if (!delivered || !Array.isArray(delivered.deliveries) || delivered.deliveries.length === 0) return result(0);
    return result(0, structuredContext(renderContext(delivered.deliveries)));
  } catch (error) {
    return errorResult(error);
  }
}

export { TASK_MESSAGE_CONTEXT_START as TASK_INBOX_CONTEXT_START, TASK_MESSAGE_CONTEXT_END as TASK_INBOX_CONTEXT_END };
