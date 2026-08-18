/**
 * Pure continuation projection: `EffectiveState` + the active sprint's own
 * text -> one `ContinuationEnvelopeV1`.
 *
 * Route decision table (first match wins; every condition reads a field the
 * effective-state projector or the sprint file already publishes):
 *
 * | # | Route               | Condition                                            | Deriving field                     |
 * |---|---------------------|------------------------------------------------------|------------------------------------|
 * | 1 | halt                | any hard blocker                                     | `blockers`                         |
 * | 2 | halt                | active-plan marker points at a missing plan          | `stale_sources`                    |
 * | 3 | halt                | plan present, status not approved/executing          | `authoritative_plan.status`        |
 * | 4 | continue_active_plan| plan approved/executing with a next step             | `authoritative_plan`, `next_action`|
 * | 5 | verify_or_finish    | plan approved/executing, no next step left           | `authoritative_plan`, `next_action`|
 * | 6 | idle                | no plan and no active sprint                         | `active_sprint.path`               |
 * | 7 | halt                | sprint marker set but its file is not fresh          | `active_sprint.freshness`          |
 * | 8 | halt                | sprint status not Approved/Executing                 | sprint `> **Status**:` header      |
 * | 9 | halt                | backlog empty or carrying an unrecognized row status | sprint `## Backlog` rows           |
 * |10 | advance_sprint      | at least one `[ ]` backlog row                       | sprint `## Backlog` rows           |
 * |11 | complete            | every backlog row `[x]`                              | sprint `## Backlog` rows           |
 *
 * Rows 5 and 4 split on `next_action`, which is the effective-state
 * projector's single "next step inside the active plan" field (first open plan
 * task, else a fresh handoff's exact next step). Rows 8-11 are the only place
 * the sprint file is read at all: they read its status, whether any row is
 * still pending, and -- because `start-task` requires `--task` and never
 * selects a row itself -- the first pending row's Task cell, which the
 * `advance_sprint` command has to name.
 *
 * `verify_or_finish` (row 5) reuses the requirement-key vocabulary
 * `complete_approved_work_package` as its reason: the effective-state
 * projector already derives that exact evidence fact from the same condition.
 *
 * One post-pass runs after that table: the no-progress circuit breaker. When
 * (and only when) the table above yields an actionable route, the attempt
 * ledger's verdict may convert it to `halt` with reason `no_progress` or
 * `attempt_ledger_unreadable`. A `halt`, `complete`, or `idle` answer already
 * stops the loop, so the breaker never runs there, and an absent ledger leaves
 * every route byte-identical to the pre-breaker projection. Receipts influence
 * nothing else: they are not an input to `EffectiveState`, `state_revision`, or
 * `progress_token`, and `recorded_at` never reaches this document.
 */
import { evaluateAttemptStall, type AttemptLedgerRead } from './attempt-ledger';
import { markdownHeader } from './artifact-parsers';
import { backlogRows } from './sprint-backlog-rows';
import type {
  ContinuationEnvelopeV1,
  ContinuationRoute,
  EffectiveState,
} from './types';

/** Existing commands the envelope points at; never re-implemented here. */
const CONTINUE_COMMAND = 'repo-harness state resolve --json';
const VERIFY_COMMAND = 'repo-harness run verify-sprint';

/**
 * `sprint-backlog start-task` requires `--task`: it refuses to select a row
 * itself, because the backlog carries no dependency or parallel-safety column.
 * Naming the row is the caller's decision, and this projection is that caller
 * -- it names the first pending row's Task cell, which `backlogRows` already
 * publishes. The cell is free text, so it is single-quote escaped.
 */
function advanceCommand(task: string): string {
  return `repo-harness run sprint-backlog start-task --task '${task.replace(/'/g, "'\\''")}' --execute`;
}

const EXECUTABLE_PLAN_STATUS: ReadonlySet<string> = new Set(['approved', 'executing']);
const EXECUTABLE_SPRINT_STATUS: ReadonlySet<string> = new Set(['Approved', 'Executing']);
const PENDING_ROW = '[ ]';

/** Routes that hand the caller work to do, and so can be circuit-broken. */
const ACTIONABLE_ROUTES: ReadonlySet<ContinuationRoute> = new Set<ContinuationRoute>([
  'continue_active_plan',
  'advance_sprint',
  'verify_or_finish',
]);

export interface ContinuationEnvelopeInputs {
  readonly state: EffectiveState;
  /** The active sprint file's text, or null when it is absent or unreadable. */
  readonly sprintText: string | null;
  /** The attempt ledger's own parsed bytes; evidence only, never authority. */
  readonly attemptLedger: AttemptLedgerRead;
}

/**
 * Backlog row status cells, in file order. The grammar itself lives in
 * `sprint-backlog-rows.ts`, which is the single TypeScript projection of
 * `sprint-backlog.sh`'s `backlog_rows` scan; the mode, acceptance, and plan
 * cells stay `sprint-backlog`'s and the coordination plane's business.
 *
 * Still exported for the drift check in
 * `tests/sprint-backlog-grammar-drift.test.ts`, which runs this scan and the
 * live `backlog_rows` awk over one fixture corpus and fails when either
 * grammar moves alone.
 */
export function backlogRowStatuses(sprintText: string): string[] {
  return backlogRows(sprintText).map((row) => row.status);
}

/** The route table above, before the circuit breaker's post-pass. */
function projectRoutedEnvelope(
  input: ContinuationEnvelopeInputs,
): ContinuationEnvelopeV1 {
  const { state, sprintText } = input;
  const plan = state.authoritative_plan;
  const sprintPath = state.active_sprint.path;

  const envelope = (
    route: ContinuationRoute,
    unitRef: string | null,
    command: string | null,
    reason: string,
  ): ContinuationEnvelopeV1 => ({
    protocol: 1,
    kind: 'repo-harness-continuation-envelope',
    route,
    unit_ref: unitRef,
    authority_revision: state.authority_revision,
    progress_token: state.progress_token,
    command,
    reason,
  });

  if (state.blockers.length > 0) {
    return envelope('halt', plan?.path ?? sprintPath, null, `blockers:${state.blockers.join(',')}`);
  }
  if (state.stale_sources.includes('active_plan_marker')) {
    return envelope('halt', sprintPath, null, 'stale:active_plan_marker');
  }
  if (plan) {
    if (!EXECUTABLE_PLAN_STATUS.has(plan.status)) {
      return envelope('halt', plan.path, null, `plan_status:${plan.status}`);
    }
    return state.next_action === null
      ? envelope('verify_or_finish', plan.path, VERIFY_COMMAND, 'complete_approved_work_package')
      : envelope('continue_active_plan', plan.path, CONTINUE_COMMAND, `next_action:${state.next_action}`);
  }
  if (!sprintPath) {
    return envelope('idle', null, null, 'no_active_plan_or_sprint');
  }
  if (state.active_sprint.freshness !== 'fresh') {
    return envelope('halt', sprintPath, null, `active_sprint:${state.active_sprint.freshness}`);
  }

  // A fresh sprint whose text is unreadable lands in the same fail-closed
  // branch as an unapproved one: `sprint-backlog start-task` refuses anything
  // outside Approved/Executing, so the envelope must not name it.
  if (!sprintText) {
    return envelope('halt', sprintPath, null, 'sprint_status:unknown');
  }
  const sprintStatus = markdownHeader(sprintText, 'Status');
  if (!sprintStatus || !EXECUTABLE_SPRINT_STATUS.has(sprintStatus)) {
    return envelope('halt', sprintPath, null, `sprint_status:${sprintStatus ?? 'unknown'}`);
  }

  const rows = backlogRows(sprintText);
  if (rows.length === 0) {
    return envelope('halt', sprintPath, null, 'sprint_backlog:empty');
  }
  const pending = rows.find((row) => row.status === PENDING_ROW);
  if (pending) {
    return envelope('advance_sprint', sprintPath, advanceCommand(pending.task), 'sprint_backlog:pending');
  }
  // `[ ]` and `[x]` are the only statuses `sprint-backlog` writes (in-flight
  // work keeps its row pending and is recorded on the shared coordination
  // plane), so anything else is an unrecognized backlog state, never a
  // finished goal.
  if (!rows.every((row) => /^\[[xX]\]$/.test(row.status))) {
    return envelope('halt', sprintPath, null, 'sprint_backlog:unknown_row_status');
  }
  return envelope('complete', sprintPath, null, 'sprint_backlog:complete');
}

/**
 * Deterministic projection: no time, PID, locale, or filesystem input. Given
 * identical effective state, identical sprint text, and identical ledger bytes,
 * the output is byte-identical.
 */
export function projectContinuationEnvelope(
  input: ContinuationEnvelopeInputs,
): ContinuationEnvelopeV1 {
  const routed = projectRoutedEnvelope(input);
  if (!ACTIONABLE_ROUTES.has(routed.route)) return routed;

  const verdict = evaluateAttemptStall(
    input.attemptLedger,
    routed.unit_ref,
    routed.progress_token,
  );
  if (verdict === 'none') return routed;
  // Key order is preserved: only `route`, `command`, and `reason` are replaced.
  return { ...routed, route: 'halt', command: null, reason: verdict };
}
