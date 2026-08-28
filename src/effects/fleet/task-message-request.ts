import {
  buildTaskMessageEvent,
  TaskMessageError,
  type TaskMessageScope,
} from '../../core/fleet/task-message';
import { lookupCanonicalTask } from '../../core/state/coordination-identity';
import { readRepoHarnessRegistryStrictSnapshot } from '../repo-registry';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readCanonicalSprint, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readLease } from '../state/coordination-lease-store';
import { sendTaskMessage, TaskInboxError, type TaskInboxErrorCode } from './task-inbox';

/**
 * The single write the operator board is allowed to perform.
 *
 * The board never carries a repository root, a canonical sprint path, or a
 * lease generation across the HTTP boundary: it names a registered repository
 * and a canonical task, and this effect re-resolves every authority locally.
 * A message the operator sends is therefore fenced by the state the machine
 * observes now, not by the state the browser happened to render.
 */
export const OPERATOR_TASK_MESSAGE_SENDER_KIND = 'operator' as const;
export const OPERATOR_TASK_MESSAGE_SENDER_ID = 'control-board' as const;

export type OperatorTaskMessageErrorCode =
  | 'registry_unavailable'
  | 'repository_not_found'
  | 'repository_read_only'
  | 'canonical_sprint_unavailable'
  | 'task_not_found'
  | TaskInboxErrorCode;

export class OperatorTaskMessageError extends Error {
  constructor(
    readonly code: OperatorTaskMessageErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OperatorTaskMessageError';
  }
}

export interface SendOperatorTaskMessageInput {
  readonly env?: NodeJS.ProcessEnv;
  readonly repository_id: string;
  readonly task_id: string;
  readonly message_id: string;
  readonly scope: TaskMessageScope;
  readonly body: string;
}

export interface SendOperatorTaskMessageResult {
  readonly repository_id: string;
  readonly task_id: string;
  readonly message_id: string;
  readonly scope: TaskMessageScope;
  readonly target_claim_id: string | null;
  readonly target_generation: number | null;
  /** False when an identical message id was already stored: the retry is a no-op. */
  readonly created: boolean;
}

function registeredRepositoryRoot(input: SendOperatorTaskMessageInput): string {
  let repos: ReturnType<typeof readRepoHarnessRegistryStrictSnapshot>['repos'];
  try {
    repos = readRepoHarnessRegistryStrictSnapshot({ env: input.env, adoptedOnly: false }).repos;
  } catch (error) {
    throw new OperatorTaskMessageError('registry_unavailable', 'cannot read the fleet registry authority', error);
  }
  const repository = repos.find((candidate) => candidate.id === input.repository_id);
  if (repository === undefined) {
    throw new OperatorTaskMessageError('repository_not_found', `repository ${input.repository_id} is not registered`);
  }
  if (repository.accessMode !== 'read_write') {
    throw new OperatorTaskMessageError('repository_read_only', `repository ${input.repository_id} is registered read only`);
  }
  return repository.path;
}

interface CanonicalTaskContext {
  readonly source: { readonly targetRef: string; readonly sprintPath: string };
  readonly task_id: string;
  readonly task_revision: string;
}

function canonicalTaskContext(repoRoot: string, taskId: string): CanonicalTaskContext {
  const sprintPath = readActiveSprintPath(repoRoot);
  if (!sprintPath) {
    throw new OperatorTaskMessageError('canonical_sprint_unavailable', 'the repository has no active canonical sprint');
  }
  let targetRef: string;
  try {
    targetRef = readCanonicalTargetRef(repoRoot);
  } catch (error) {
    throw new OperatorTaskMessageError('canonical_sprint_unavailable', 'the workflow policy is unreadable', error);
  }
  const source = { targetRef, sprintPath };
  const canonical = readCanonicalSprint(repoRoot, source);
  if (!canonical.ok) {
    throw new OperatorTaskMessageError('canonical_sprint_unavailable', canonical.error);
  }
  const task = lookupCanonicalTask(
    { repoIdentity: resolveRepoIdentity(repoRoot), sprintPath, sprintText: canonical.text },
    taskId,
  );
  if (!task.ok) throw new OperatorTaskMessageError('task_not_found', task.error);
  return { source, task_id: task.task.task_id, task_revision: task.task.task_revision };
}

function asOperatorTaskMessageError(error: unknown, fallback: OperatorTaskMessageErrorCode): OperatorTaskMessageError {
  if (error instanceof OperatorTaskMessageError) return error;
  if (error instanceof TaskInboxError || error instanceof TaskMessageError) {
    return new OperatorTaskMessageError(error.code, error.message, error);
  }
  return new OperatorTaskMessageError(fallback, 'the task message could not be stored', error);
}

/**
 * Build and persist one operator-sent task message.
 *
 * `scope: 'claim'` is fenced twice: the current lease is read here to name the
 * recipient, and `sendTaskMessage` re-checks that same claim under the task
 * lock, so a lease that moves between the two reads fails closed with
 * `claim_mismatch` instead of addressing a session that no longer exists.
 */
export function sendOperatorTaskMessage(input: SendOperatorTaskMessageInput): SendOperatorTaskMessageResult {
  const repoRoot = registeredRepositoryRoot(input);
  const context = canonicalTaskContext(repoRoot, input.task_id);
  const owner = input.scope === 'claim' ? readLease(repoRoot, context.task_id).record : null;
  if (input.scope === 'claim' && owner === null) {
    throw new OperatorTaskMessageError('recipient_unavailable', `task ${context.task_id} has no current owner lease`);
  }
  try {
    const event = buildTaskMessageEvent({
      message_id: input.message_id,
      task_id: context.task_id,
      task_revision: context.task_revision,
      scope: input.scope,
      target_claim_id: owner === null ? null : owner.claim_id,
      target_generation: owner === null ? null : owner.generation,
      sender_kind: OPERATOR_TASK_MESSAGE_SENDER_KIND,
      sender_id: OPERATOR_TASK_MESSAGE_SENDER_ID,
      sender_trust: 'local_operator',
      audience: 'owner',
      body: input.body,
      created_at: new Date().toISOString(),
      in_reply_to: null,
    });
    const result = sendTaskMessage({ repo_root: repoRoot, canonical_source: context.source, event });
    return Object.freeze({
      repository_id: input.repository_id,
      task_id: event.task_id,
      message_id: event.message_id,
      scope: event.scope,
      target_claim_id: event.target_claim_id,
      target_generation: event.target_generation,
      created: result.created,
    });
  } catch (error) {
    throw asOperatorTaskMessageError(error, 'task_message_invalid');
  }
}
