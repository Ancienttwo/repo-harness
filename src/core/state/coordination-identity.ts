/**
 * Pure coordination identity: sprint rows -> task identity and task revision.
 * No clock, PID, randomness, or filesystem input reaches this layer.
 *
 * Identity is read, not derived:
 *
 * - `task_id` is the backlog row's persisted `ID` cell, verbatim, validated
 *   against `TASK_DIGEST_PATTERN`. It was previously a digest of the exact Task
 *   cell text, which made a title clarification indistinguishable from deleting
 *   one task and creating another. Display text and identity are two data and
 *   no longer share one field. The row index is still not identity --
 *   reordering must not rewrite anything -- and neither is a slug, which
 *   collapses "Fix auth bug" and "Fix auth-bug".
 * - `task_revision = digest(task_id + Task cell + Mode cell + Acceptance cell)`.
 *   The Task cell is part of the preimage directly, so a title edit drifts the
 *   revision even though identity survives. The Status cell is excluded on
 *   purpose: a sibling row completing rewrites the sprint file, and a revision
 *   that moved with it would invalidate every other task's revision.
 *
 * The revision preimage carries `SPRINT_IDENTITY_PROTOCOL_V2`, a domain token
 * that separates schema 2 revision digests from every schema 1 digest.
 *
 * The digest is `sha256` hex with no `sha256:` prefix, unlike the house
 * `progress_token`/`state_revision` shape. `task_id` is used verbatim as a
 * single path component, and a bare 64-character hex string is a safe path
 * component on every filesystem this repo targets. `TASK_DIGEST_PATTERN` is
 * the validator the effects layer applies before any derived value reaches
 * `join()`.
 *
 * Schema 1 sprints carry no `ID` cell and therefore cannot mint identity here
 * at all. These records remain readable Markdown.
 */
import { createHash } from 'crypto';
import {
  SPRINT_BACKLOG_SCHEMA_V2,
  SprintSchemaError,
  backlogRows,
  sprintBacklogSchema,
  type BacklogRow,
} from './sprint-backlog-rows';

/** Domain token distinguishing schema-2 revision digests from every v1 digest. */
const SPRINT_IDENTITY_PROTOCOL_V2 = 'protocol-v2';

/** Shape every `task_id` and `task_revision` must have before it is trusted. */
export const TASK_DIGEST_PATTERN = /^[0-9a-f]{64}$/;

const TASK_REVISION_DOMAIN = 'repo-harness-task-revision';

/**
 * Domain-separated digest over an ordered field list. `JSON.stringify` of a
 * string array is the canonical encoding: every field is quoted and escaped,
 * so no field value can forge a separator into another field's position.
 */
function identityDigest(fields: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(fields), 'utf-8').digest('hex');
}

interface TaskRevisionInput {
  /** The row's persisted `ID` cell. */
  readonly taskId: string;
  /** The row's Task cell, verbatim and untransformed. */
  readonly taskCell: string;
  readonly modeCell: string;
  readonly acceptanceCell: string;
}

export function deriveTaskRevision(input: TaskRevisionInput): string {
  return identityDigest([
    TASK_REVISION_DOMAIN,
    SPRINT_IDENTITY_PROTOCOL_V2,
    input.taskId,
    input.taskCell,
    input.modeCell,
    input.acceptanceCell,
  ]);
}

/**
 * The refusal every identity-minting path returns for a schema 1 sprint. There
 * is no dual-read: a sprint that has not been migrated cannot mint identity,
 * because the only id it could produce is the derived-from-title id this
 * contract removed.
 */
export function unmigratedSprintRefusal(sprintPath: string): string {
  return `canonical sprint ${sprintPath} is still backlog schema 1 and cannot mint task identity; `
    + `run 'repo-harness sprint migrate-schema --sprint ${sprintPath} --target-ref <ref>' first`;
}

/**
 * The backlog row as a canonical task carries it: every cell except `id`.
 *
 * `id` is deliberately absent. It is the persisted identity, and the projection
 * already carries it once as `task_id`; embedding it again would put the same
 * datum in two places, so a reader could compare them, disagree, and have no
 * authority to resolve it. Dropping it also keeps the projected row shape
 * identical to schema 1's, which is what lets a byte-freeze over this
 * projection move for exactly one reason -- the revision -- rather than two.
 */
type CanonicalTaskRow = Omit<BacklogRow, 'id'>;

export interface CanonicalTask {
  readonly task_id: string;
  readonly task_revision: string;
  readonly sprint_path: string;
  readonly row: CanonicalTaskRow;
}

interface CanonicalSprintInput {
  readonly repoIdentity: string;
  readonly sprintPath: string;
  readonly sprintText: string;
}

/**
 * Every backlog row of one canonical sprint, in file order.
 *
 * Fails closed on a schema 1 sprint, on an `ID` cell that is not a bare
 * 64-character lowercase hex string, and on a duplicate id. A duplicate is the
 * copy-paste failure the contract names explicitly: two rows claiming one
 * identity would make every id-addressed read ambiguous, so the whole
 * projection is refused rather than one of the two rows being picked.
 */
export function projectCanonicalTasks(input: CanonicalSprintInput): CanonicalTask[] {
  if (sprintBacklogSchema(input.sprintText) !== SPRINT_BACKLOG_SCHEMA_V2) {
    throw new SprintSchemaError(unmigratedSprintRefusal(input.sprintPath));
  }
  const rows = backlogRows(input.sprintText);
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!TASK_DIGEST_PATTERN.test(row.id)) {
      throw new SprintSchemaError(
        row.id.length === 0
          ? `backlog row ${row.index} in ${input.sprintPath} has no persisted task id`
          : `backlog row ${row.index} in ${input.sprintPath} has a malformed task id: ${row.id}`,
      );
    }
    if (seen.has(row.id)) {
      throw new SprintSchemaError(
        `backlog row ${row.index} in ${input.sprintPath} repeats task id ${row.id}; ids must be unique within a sprint`,
      );
    }
    seen.add(row.id);
    // The rest spread drops `id` and preserves the remaining key order, so the
    // projected row is byte-identical in shape to the schema 1 row it replaced.
    const { id: persistedId, ...displayRow } = row;
    return {
      task_id: persistedId,
      task_revision: deriveTaskRevision({
        taskId: persistedId,
        taskCell: row.task,
        modeCell: row.mode,
        acceptanceCell: row.acceptance,
      }),
      sprint_path: input.sprintPath,
      row: displayRow,
    };
  });
}

/**
 * Prove that the live canonical Sprints have one owner for every task id.
 *
 * `projectCanonicalTasks` protects one file.  Callers that read a set of live
 * canonical Sprint carriers use this small composition guard before any
 * task-subject operation can address the id.  Completed rows remain in
 * their live Sprint on purpose: changing a row's status never releases its
 * persisted identity for another row to reuse.
 */
export function assertUniqueCanonicalTaskIds(inputs: readonly CanonicalSprintInput[]): void {
  const owners = new Map<string, string>();
  for (const input of inputs) {
    for (const task of projectCanonicalTasks(input)) {
      const owner = owners.get(task.task_id);
      if (owner !== undefined) {
        throw new SprintSchemaError(
          `task id ${task.task_id} is shared by live canonical sprints ${owner} and ${input.sprintPath}`,
        );
      }
      owners.set(task.task_id, input.sprintPath);
    }
  }
}
