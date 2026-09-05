import {
  buildTaskMessageEvent,
  TaskMessageError,
  type TaskMessageScope,
} from '../../core/fleet/task-message';
import { lookupCanonicalTask } from '../../core/state/coordination-identity';
import {
  withRepoHarnessRegistryAuthorizationLock,
  type RepoHarnessRegistryStrictSnapshot,
} from '../repo-registry';
import { readActiveSprintPath, readCanonicalTargetRef } from '../state/collect-board-inputs';
import { readCanonicalSprint, resolveRepoIdentity } from '../state/coordination-canonical-source';
import { readLease } from '../state/coordination-lease-store';
import { sendTaskBoardMessage, TaskInboxError, type TaskInboxErrorCode } from './task-inbox';

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
  /** The task revision the operator board observed when it opened the draft. */
  readonly expected_task_revision: string;
  /** Null is the explicit task-scoped absence of a claim fence. */
  readonly expected_claim_id: string | null;
  /** Null is the explicit task-scoped absence of a generation fence. */
  readonly expected_generation: number | null;
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

function registeredRepositoryRoot(
  input: SendOperatorTaskMessageInput,
  snapshot: RepoHarnessRegistryStrictSnapshot,
): string {
  const repository = snapshot.repos.find((candidate) => candidate.id === input.repository_id);
  if (repository === undefined) {
    throw new OperatorTaskMessageError('repository_not_found', `repository ${input.repository_id} is not registered`);
  }
  if (repository.accessMode !== 'read_write') {
    throw new OperatorTaskMessageError('repository_read_only', `repository ${input.repository_id} is registered read only`);
  }
  return repository.path;
}

/**
 * The task lock stays outside this lock, and this lock covers exactly the
 * re-check plus the write.
 *
 * Nesting is safe in one direction only. `withRepoHarnessRegistryAuthorizationLock`
 * has one product caller (this file), and nothing `src/effects/repo-registry.ts`
 * runs under that lock acquires a task lock: it imports no lease, inbox, or
 * coordination module, and the only caller-supplied hook under it
 * (`applyRepoHarnessRegistryBatch`'s `beforeCommit`, used by `src/cli/mcp/setup.ts`)
 * writes a config file. So no path holds the registry lock and then waits for a
 * task lock, and task -> registry cannot close a cycle.
 */
function withRegistryAuthorizedPublication<T>(
  input: SendOperatorTaskMessageInput,
  expectedRepoRoot: string,
  publish: () => T,
): T {
  return withRepoHarnessRegistryAuthorizationLock({ env: input.env }, (snapshot) => {
    if (registeredRepositoryRoot(input, snapshot) !== expectedRepoRoot) {
      throw new OperatorTaskMessageError('repository_not_found', `repository ${input.repository_id} moved since the board snapshot`);
    }
    return publish();
  });
}

interface CanonicalTaskContext {
  readonly source: { readonly targetRef: string; readonly sprintPath: string };
  readonly task_id: string;
  readonly task_revision: string;
}

function canonicalTaskContext(
  repoRoot: string,
  taskId: string,
  expectedTaskRevision: string,
): CanonicalTaskContext {
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
  if (task.task.task_revision !== expectedTaskRevision) {
    throw new OperatorTaskMessageError('task_revision_mismatch', 'the canonical task revision changed since the board snapshot');
  }
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
  try {
    if (input.scope === 'task' && (input.expected_claim_id !== null || input.expected_generation !== null)) {
      throw new OperatorTaskMessageError('task_message_invalid', 'task-scoped messages cannot carry a claim fence');
    }
    if (input.scope === 'claim' && (input.expected_claim_id === null || input.expected_generation === null)) {
      throw new OperatorTaskMessageError('task_message_invalid', 'claim-scoped messages require a claim fence');
    }
    // Resolving and authorizing one registered repository is all this first
    // critical section does. Holding the registry lock across this
    // repository's canonical reads and its per-task lock blocked every other
    // repository's registry work for as long as one task lock stayed
    // contended; the authority is re-proved, under the same lock, around the
    // write itself.
    const repoRoot = withRepoHarnessRegistryAuthorizationLock(
      { env: input.env },
      (snapshot) => registeredRepositoryRoot(input, snapshot),
    );
    const context = canonicalTaskContext(repoRoot, input.task_id, input.expected_task_revision);
    const owner = input.scope === 'claim' ? readLease(repoRoot, context.task_id).record : null;
    if (input.scope === 'claim' && owner === null) {
      throw new OperatorTaskMessageError('recipient_unavailable', `task ${context.task_id} has no current owner lease`);
    }
    if (input.scope === 'claim'
      && (owner!.claim_id !== input.expected_claim_id || owner!.generation !== input.expected_generation)) {
      throw new OperatorTaskMessageError('claim_mismatch', `task ${context.task_id} owner changed since the board snapshot`);
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
      const result = sendTaskBoardMessage({
        repo_root: repoRoot,
        canonical_source: context.source,
        event,
        with_registry_authority: (publish) => withRegistryAuthorizedPublication(input, repoRoot, publish),
      });
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
  } catch (error) {
    if (error instanceof OperatorTaskMessageError) throw error;
    throw asOperatorTaskMessageError(error, 'registry_unavailable');
  }
}
