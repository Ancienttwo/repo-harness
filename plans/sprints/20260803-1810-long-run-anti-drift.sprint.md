# Sprint: Long-Run Anti-Drift Loop

> **Status**: Done
> **Slug**: long-run-anti-drift
> **Created**: 2026-08-03 18:10
> **Updated**: 2026-08-03 22:00
> **Source Research**: `docs/researches/20260803-loopx-comparative-analysis.md` (dual-track LoopX comparison + round-2 convergence; the PRD of record for this program is the section below — deliberately not duplicated into `plans/prds/`)
> **Source Spec**: `docs/spec.md`
> **Goal Mode**: incremental

Give repo-harness long-run endurance as a **pull-based continuation protocol
over existing authority**: the host owns when to wake; repo-harness answers
what is next, executes one bounded unit, verifies and writes back, recovers
from crashes, and knows when to stop. Authority stays exactly PRD → Sprint →
Plan → Contract → Checks/Review. The sprint adds three explicitly
non-authority surfaces — `ContinuationEnvelopeV1` (read-only projection),
`CloseoutJournalV1` (operation phases + recovery material), `AttemptReceiptV1`
(ignored liveness evidence) — and builds no LoopX machinery: no scheduler, no
quota ledger, no lease layer, no second state authority.

## PRD

### Problem

Long tasks drift when chat context becomes the de-facto authority: after
compaction or session restart the agent continues from a degraded memory of
the goal. The durable frontier already exists (PRD → sprint → plan → contract,
`sprint-backlog.sh` `cmd_next` selects the next pending row deterministically,
`progress_token` is a pure material-progress hash —
`project-effective-state.ts:266`), but three endurance pieces are missing:

- No canonical tick entry composes those surfaces into one deterministic
  "what is next" answer; agents stitch state commands together conversationally.
- Nothing detects a stalled loop (turns completing with no material progress).
- Closeout is not crash-durable: the finish snapshot lives in `mktemp -d` and
  `original_head` in a shell variable, recoverable only via an EXIT trap
  (`contract-worktree.sh:459-509`); ship pushes before creating the PR
  (`ship-worktrees.sh:491`), so an interrupt between push and PR leaves an
  external effect with no phase receipt. Verified defect: a half-completed
  state with **no discoverable recovery entry** — permanent loss is unproven
  (temp dirs and git objects usually survive), which is why WP1's acceptance
  is per-phase fault injection, not assumption.

### Users

- An operator who states a direction, gets it decomposed into an Approved
  Sprint, and delegates multi-turn execution to a host loop (Claude Code
  `/loop`, Codex Goal mode, cron, or manual ticks).
- Agents that must fetch an authoritative per-turn brief instead of trusting
  session memory.
- Maintainers who need an interrupted closeout to be inspectable and
  recoverable instead of a half-mutated repo.

### Success Criteria

- `repo-harness state next --json` returns a `ContinuationEnvelopeV1`:
  `{protocol, kind, route, unit_ref, authority_revision, progress_token,
  command, reason}` with `route ∈ {continue_active_plan, advance_sprint,
  verify_or_finish, halt, complete, idle}`. No `ask`/`wait` semantics —
  blocked and needs-user states are `halt`, with reasons carried by existing
  `blockers`/`next_action`/contract Stop Conditions/handoff. Identical repo
  bytes yield byte-identical output; the command is read-only and never
  creates plans/contracts/worktrees or advances the sprint; row selection
  stays with `sprint-backlog` (the envelope returns the exact command to run).
- Closeout (finish and ship) journals every phase to
  `<git-common-dir>/repo-harness/transactions/<operation>/<transaction-key>/`
  with temp-file + fsync + atomic-rename durability; normal commands fail
  closed on an `in_progress` journal; recovery is explicit
  (`recover inspect|abort|reconcile`, abort only before merge/push,
  reconcile after external effects verifies and completes without rolling
  back the remote). Effective State, `progress_token`, and the state
  collector provably never read the journal (test-enforced).
- Two consecutive completed turns on the same `unit_ref` with unchanged
  `progress_token` make the envelope return `halt:no_progress`; the counter
  resets on token change or explicit user resume. Attempt receipts live only
  in ignored `.ai/harness/runs/continuation/` and never feed Effective State.
- A conformance doc + disposable-repo acceptance proves the full loop without
  reading prior chat (see Acceptance Scenarios).

### Acceptance Scenarios

- Same repo bytes, `state next` twice → byte-identical JSON; each call
  returns exactly one unit or one halt.
- Disposable repo, Approved Sprint with two contract rows: a fresh session
  completes row 1 driven only by `state next`; closeout is SIGKILLed
  mid-transaction; journal is discoverable, original HEAD/snapshot locatable;
  explicit recover completes it without duplicate push/merge; row 2 completes;
  two no-progress turns then produce a stable `halt:no_progress`. At no point
  does the driver read prior chat to learn the next step.
- Fault injection covers SIGKILL at **every** journal phase, including
  between push and PR: rerun after recover must not re-push or re-merge, and
  must complete only the missing external step (`pr_observed`).

### Non-goals

- No scheduler, daemon, cron, or timer: wake-up time belongs to the host.
- No compute/quota/token budget ledger: stall detection covers the runaway
  case; a per-goal budget goes to `tasks/todos.md` on approval with revisit
  trigger "single goal runs unattended past one sprint AND cost becomes
  contested".
- No per-todo lease layer, no auto crash-resume (recovery is always
  explicit), no event-sourced todo migration, no interaction-decision model
  separate from Effective State, no goal/todo database.
- No quota/schedule/attempt-count input into `progress_token`.
- LoopX (or any external control plane) never reads `plans/`, `tasks/`, or
  `.ai/harness/*`; integration, if ever, is ID/receipt over subprocess only.
- Action-budget and `evals/` cleanup stay out of this program — independent
  maintainability work-packages, not endurance preconditions.

## Architecture Notes

### Capabilities Touched

- Closeout helpers (`assets/templates/helpers/contract-worktree.sh`,
  `ship-worktrees.sh`) + closeout fault-injection tests — WP1.
- `workflow-engine` state read model (`src/cli/commands/state.ts`,
  `src/effects/state/`, `src/core/state/`) — WP2/WP3.
- `docs/reference-configs/` + host Goal conformance — WP4.

### Dependency Order

- WP1 and WP2 are independent (disjoint file scopes) and may run as parallel
  contract worktrees.
- WP3 depends on WP2 (extends the envelope with receipt comparison).
- WP4 last; documents and proves the loop over the shipped rows.

### Risks

- **Journal metastasis** (highest): if any state resolver ever reads the
  closeout journal "for a recovery hint", it becomes a second authority —
  the exact LoopX dual-authority failure this program refuses. Mitigation:
  the no-read guard is itself a required test in WP1; the git-common-dir
  location keeps the journal outside every working tree.
- **Envelope authority creep**: `state next` must stay a projection; any
  route not derivable from Effective State + sprint marker, or any write, is
  a design regression rejected at review. Row selection authority stays in
  `sprint-backlog`.
- **Attempt-ledger authority creep**: receipts are liveness evidence only;
  the moment they answer "what is the goal/task/next step" the design has
  failed. They stay in ignored `runs/`, outside Effective State revisions.
- **progress_token falsification**: if real, valid code changes routinely
  fail to move `progress_token`, WP3's premise is falsified — fix the
  fingerprint recipe, do not add a parallel heuristic.
- **Pending policy request**: a high architecture request touching
  `.ai/harness/policy.json` is open; WP1/WP2 must not modify policy. If
  continuation config is later needed, handle that request explicitly inside
  that work-package.

### Work Package Specs

- **WP1 crash-durable closeout transaction** — `CloseoutJournalV1` under
  `<git-common-dir>/repo-harness/transactions/<operation>/<transaction-key>/`,
  key bound to (repo identity, worktree, operation, plan/contract, original
  HEAD, target/base SHA). Phases `prepared → implementation_committed →
  gate_sealed → lifecycle_applied → lifecycle_committed → merged|pushed →
  pr_observed → complete`, each persisted via temp file + fsync + atomic
  rename. Normal commands fail closed on `in_progress`; recovery is explicit:
  `recover inspect|abort|reconcile` (abort only pre-merge/push; reconcile
  after external effects verifies and completes, never rolling back the
  remote). Acceptance: fault injection SIGKILLs every phase — journal
  discoverable, original HEAD/snapshot locatable, rerun never duplicates
  push/merge, post-push interrupt completes only `pr_observed`; a test proves
  Effective State / `progress_token` / state collector never read the journal.
- **WP2 canonical continuation envelope** — `repo-harness state next --json`
  emitting `ContinuationEnvelopeV1` with routes `continue_active_plan |
  advance_sprint | verify_or_finish | halt | complete | idle`, composed only
  from existing Effective State + the sprint marker; read-only; returns the
  exact existing command (e.g. `sprint-backlog` next/start-task) instead of
  re-implementing row selection. Acceptance: byte-identical JSON for
  identical repo bytes; one unit or one halt per call; unit tests prove every
  route derives from `readiness`/`next_action`/sprint state; the command
  provably performs no writes.
- **WP3 no-progress circuit breaker** — `AttemptReceiptV1` (`unit_ref`,
  `before_progress_token`, `after_progress_token`, `outcome`, `timestamp`)
  appended to ignored `.ai/harness/runs/continuation/<run-id>.jsonl`; two
  consecutive completed turns with unchanged token on the same `unit_ref`
  make the envelope return `halt:no_progress`; counter resets on token change
  or explicit user resume. Acceptance: two-no-progress-turn fixture asserts
  `halt:no_progress`; token-change and user-resume fixtures assert reset; a
  test proves receipts never enter Effective State revision or
  `progress_token`.
- **WP4 host Goal conformance** — reference doc in `docs/reference-configs/`
  for the tick shape (`state next` → at most one bounded unit → targeted
  checks/gatekeeper → finish or record halt → attempt receipt → `state
  next`), plus the disposable-repo end-to-end acceptance from Acceptance
  Scenarios. Acceptance: doc names every route's host action and cross-links
  WP1-3 surfaces + source research; the disposable-repo scenario passes end
  to end without reading prior chat.

## Backlog

Ordered execution queue; keep rows in dependency order. Mode `contract` runs
the full plan -> contract -> worktree flow; `inline` allows primary-tree
execution for small tasks. Every row needs a concrete acceptance line.

| # | Status | Task | Mode | Acceptance | Plan |
|---|--------|------|------|------------|------|
| 1 | [x] | WP1 crash-durable closeout transaction | contract | Per-phase SIGKILL injection passes; no duplicate push/merge on rerun; state resolvers never read the journal (WP1 spec) | `plans/archive/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md` |
| 2 | [x] | WP2 canonical continuation envelope | contract | `state next --json` byte-identical, one unit or halt per call, read-only, routes derive from Effective State (WP2 spec) | `plans/archive/plan-20260803-1949-wp2-canonical-continuation-envelope.md` |
| 3 | [x] | WP3 no-progress circuit breaker | contract | Two no-progress turns yield halt:no_progress; receipts stay in ignored runs/ outside Effective State (WP3 spec) | `plans/archive/plan-20260803-2040-wp3-no-progress-circuit-breaker.md` |
| 4 | [x] | WP4 host Goal conformance | inline | Conformance doc lands; disposable-repo scenario passes without reading prior chat (WP4 spec) | (pending) |

## Execution Log

Keep this section last; `repo-harness run sprint-backlog complete-task` appends rows here.

| When | Task | Plan | Result |
|------|------|------|--------|
| 2026-08-03 19:30 | WP1 crash-durable closeout transaction | `plans/archive/plan-20260803-1824-wp1-crash-durable-closeout-transaction.md` | done |
| 2026-08-03 20:34 | WP2 canonical continuation envelope | `plans/archive/plan-20260803-1949-wp2-canonical-continuation-envelope.md` | done |
| 2026-08-03 21:26 | WP3 no-progress circuit breaker | `plans/archive/plan-20260803-2040-wp3-no-progress-circuit-breaker.md` | done |
| 2026-08-03 22:00 | WP4 host Goal conformance | (pending) | done |
