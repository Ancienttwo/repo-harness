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
 * the sprint file is read at all, and they read exactly two predicates from it
 * -- its status and whether any row is still pending. Which row runs next stays
 * `sprint-backlog`'s decision; this projection only names the command.
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
import type {
  ContinuationEnvelopeV1,
  ContinuationRoute,
  EffectiveState,
} from './types';

/** Existing commands the envelope points at; never re-implemented here. */
const CONTINUE_COMMAND = 'repo-harness state resolve --json';
const VERIFY_COMMAND = 'repo-harness run verify-sprint';
const ADVANCE_COMMAND = 'repo-harness run sprint-backlog start-task --execute';

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
 * Backlog row status cells, in file order. Mirrors `sprint-backlog.sh`'s
 * `backlog_rows` scan (rows between `## Backlog` and the next `## ` heading,
 * `| <index> | <status> | ...`) but reads only the status cell -- the task,
 * mode, acceptance, and plan cells stay `sprint-backlog`'s business.
 *
 * Exported for the drift check in `tests/sprint-backlog-grammar-drift.test.ts`,
 * which runs this scan and the live `backlog_rows` awk over one fixture corpus
 * and fails when either grammar moves alone.
 */
export function backlogRowStatuses(sprintText: string): string[] {
  const statuses: string[] = [];
  let inSection = false;
  for (const line of sprintText.split(/\r?\n/)) {
    if (/^## Backlog[ \t]*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^## /.test(line)) break;
    if (!/^\|[ \t]*[0-9]+[ \t]*\|/.test(line)) continue;
    statuses.push((line.split('|')[2] ?? '').trim());
  }
  return statuses;
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

  const rows = backlogRowStatuses(sprintText);
  if (rows.length === 0) {
    return envelope('halt', sprintPath, null, 'sprint_backlog:empty');
  }
  if (rows.some((status) => status === PENDING_ROW)) {
    return envelope('advance_sprint', sprintPath, ADVANCE_COMMAND, 'sprint_backlog:pending');
  }
  // `[ ]` and `[x]` are the only statuses `sprint-backlog` writes (in-flight
  // work keeps its row pending and lives in a separate marker directory), so
  // anything else is an unrecognized backlog state, never a finished goal.
  if (!rows.every((status) => /^\[[xX]\]$/.test(status))) {
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
