# Implementation Notes: issue-282-automation-budget

> **Status**: Active
> **Plan**: plans/plan-20260903-0437-issue-282-automation-budget.md
> **Contract**: tasks/contracts/20260903-0437-issue-282-automation-budget.contract.md
> **Review**: tasks/reviews/20260903-0437-issue-282-automation-budget.review.md
> **Last Updated**: 2026-09-03 05:20
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:fcb49dc560aac7f09826877c9220fbc57719f5a0b28c79f2cb1bce23eed9cc2f`

## Design Decisions

### PRD schema mapping

The plan's hard constraint is that the budget schema is the guarded-merge PRD's
`ProgramAuthorizationV1` / `ProgramBudgetLimitV1`, not a new shape.
`src/core/automation/budget.ts` implements both verbatim and makes
`AutomationBudgetV1` a thin projection that *embeds* one exact grant rather than
restating it: the grant stays the single authorization authority, and the budget
adds only the run-scoped bindings the grant does not carry — `automation_run_id`,
`goal_id` / `goal_revision`, `contract_sha256` plus the composed
`contract_limits`, `metric_support` (the provider capability revision),
`effective_limits` with `limit_derivations`, the frozen `deadline_at`,
`created_by` / `created_at`, and `revision` / `supersedes_sha256`.

Three fields were added to `ProgramBudgetLimitV1` and the PRD block was updated
to match (`plans/prds/20260828-2321-guarded-merge-unattended-automation.prd.md`):
`max_successful_acquisitions`, `max_runner_invocations`,
`max_consecutive_no_progress_steps`. Issue #282's five v1 metrics do not fit the
merge program's turn / failure / cycle triple, and the alternative — a second
budget type beside the PRD's — is exactly the duplicated authority the plan
forbids. Extending the shared type keeps one host-owned limit schema for both
the repair campaign and the controller.

The usage event keeps the PRD wire kind `repo-harness-program-budget-event`.
`AutomationUsageEventV1` is `ProgramBudgetEventV1` plus the ledger bindings the
merge program has no use for (`automation_run_id`, `budget_sha256`,
`reservation_sha256`, `idempotency_key`, `step_index`, the additive `consumed`
vector, `usage_attribution`, `resolution`, `evidence_refs`). One consumption
event on the wire, not two.

`engineer_id` and `claim_id` are typed nullable slots. Task identity (#283),
lease liveness (#286), and attempt receipts (#287) are landing in parallel
worktrees; binding them here would have minted a fourth opinion about identities
this slice does not own.

### Store layout

`<git-common-dir>/repo-harness/automation-budget/v1/`:

```
budgets/<budget_sha256>.json                     immutable, create-once
runs/<automation_run_id>/current.json            mutable, rewritten under the run lock
runs/<automation_run_id>/reservations/<sha256(idempotency_key)>.json
runs/<automation_run_id>/events/<reservation_sha256>.json
runs/<automation_run_id>/reconciliations/<reservation_sha256>.json
runs/<automation_run_id>/stop-receipt.json       immutable, create-once
locks/<automation_run_id>.lock
```

The Git common directory is the point: every linked worktree of one clone shares
one budget, which is the scope a per-worktree file would lack. `automation_run_id`
is a bare 64-hex digest so it is a safe single path component. Reservations are
keyed by the digest of the idempotency key and usage events by the reservation
digest, so create-once `O_EXCL` writes are what make replay idempotent — there
is no read-then-decide window in the charging path.

`current.json` is the only mutable record, is rewritten only inside the run's
`withExclusiveDirectoryLock`, and chains through `previous_current_sha256`. The
ledger digest chains as `sha256(previous + newline + event_sha256)`, so an event
can be appended but no earlier one can be edited out.

Only one reservation may be open per run. That is a deliberate v1 invariant, not
an oversight: it is what makes "a crash between reservation and usage append
blocks further spending" a single-condition check rather than a per-reservation
expiry sweep, and a controller is a sequential stepper by construction.

### The trust boundary

The budget store's caller -- any controller, the CLI, a campaign -- is
**untrusted for every decision input**. The host process is the only trusted
source: its clock, its filesystem, and the repository's canonical authorities.
A caller names what it wants to do and reports what happened; it never states
what that costs or when it happened.

Concretely, these are derived by the store and have no key on any public input:

| Decision | Derived from |
|----------|--------------|
| now | the host clock (`src/effects/automation/clock.ts`), never a parameter |
| the reserved vector | `automationOperationReservation(operation, …)` |
| the charge | the reservation plus the outcome the host observed |
| token/cost usage | nothing -- refused at preflight until a provider authority is wired |
| the task contract's limits | the contract's own bytes, read and digested from the repository |
| effective limits, derivations, deadline | recomputed from the grant and the contract on every read |

The compile-time checks in `tests/unit/issue-282-automation-budget-store.test.ts`
fail the build if any of those keys is ever reintroduced to a public input, and
the end-to-end controller fixture drives the store through the public inputs
only, so it is itself the proof that a controller cannot influence a decision.

### The store owns the clock

The frozen deadline is only worth what the time source behind it is worth. A
caller-supplied `reserved_at` / `observed_at` was being used as the decision
time, so a controller could backdate a call past the deadline and still be
granted a reservation. The mutating verbs therefore take **no timestamp at
all**: `AutomationClock` (`() => Date`) is a store dependency defaulting to the
host clock, tests inject a deterministic one, and every record is stamped from
it. A caller-supplied time is a claim, not a fact, so there is nowhere to put
one.

On top of that the store refuses a clock that runs backwards over its own
durable records: `assertClockNotRegressed` compares store now against
`current.updated_at` on the fast path, and against the newest `reserved_at` /
`observed_at` among the records during a repair. A regression is a typed
`automation_budget_clock_regression` carrying refusal code `clock_regression`;
it never seals a stop receipt, because a clock fault is not exhaustion. The
consequence is deliberate: concurrent controllers must share one monotonic time
source, which the contention fixture makes explicit.

`readAutomationBudgetBoardSlice` still takes an `observedAt` view time for the
wall-clock row, but drift -- which decides the state the slice renders -- is
measured on the store clock, so asking about the past cannot hide an exhausted
run.

The test seam is deliberately not an input. `__setAutomationClockForTests` lives
in `clock.ts`, is re-exported only through `budget-store.internal.ts` (which
nothing on the public surface re-exports), and refuses to install anything
unless the process opted in with `REPO_HARNESS_TEST_CLOCK_SEAM=1`. The repo had
no prior seam convention -- existing modules take a `now?: () => Date` option,
which is exactly the shape this finding rejected -- so this is the first one.

A second guard bounds a clock that is merely slow rather than malicious: the
filesystem is host-trusted, so the newest inode timestamp among the run's
durable records is a floor the store clock may not sit below. It is skipped
while a test clock is installed, because a fake clock and real inode timestamps
are two different clocks; the comparison itself is a pure function
(`clockIsBelowFilesystemFloor`) so it stays testable.

### The task contract is read, never summarised

`contract_limits` is no longer an input. `ProgramAuthorizationV1` carries a
closed `contract_scope` (`task_contract` | `contract_less`) with a
`contract_path` that the pairing rule requires or forbids, and the store reads
those bytes from the repository, digests them against `contract_sha256`, and
parses `delegation.budget` itself. A run with no task contract is not the
default; it is a grant the human issuer had to make. A caller that summarises a
contract as looser than it is gets refused by re-reading the contract, which is
the only check a self-consistent digest cannot pass.

### Token and cost limits are fail-closed

Enforcing them needs two authorities the store does not have in this slice:
metric support read from the provider capability store by revision, and a
charge that references a provider-attested usage record the store re-reads. A
caller-asserted token number is a self-asserted limit, which is worse than no
limit, so `assertTokenLimitsUnenforceable` refuses a configured hard token or
cost limit -- and a `metric_support` that claims verified metrics -- at
publish and at read. `tasks/todos.md` carries the enabling trigger.

### Effective limits are re-derived, never trusted

`deriveAutomationLimits` is the single derivation of every enforced number from
the two authorities that may set one, and both `buildAutomationBudget` and
`validateAutomationBudget` call it. The digest only proves an object is
self-consistent; a forged budget that raises `max_runner_invocations` and
recomputes its own digest used to publish and then be enforced. The validator
now recomputes `effective_limits`, `limit_derivations` and `deadline_at` from
`authorization.budget` plus `contract_limits` and compares them field by field,
so the derivation recorded in the digest is a verifiable derivation rather than
a decoration.

### One recovery for a record `current.json` does not list

Post-merge review found two faces of one structural gap. Every record except
`current.json` is create-once and fsynced *before* the projection is renamed, so
a crash can leave the projection behind the durable records but never ahead of
them:

- crash between the reservation write and the `current.json` rename leaves a
  durable reservation the projection does not list. The old code let a
  *different* key reserve the same headroom, and then rejected the orphan's
  usage forever -- one authorized provider call permanently unbilled;
- crash between the usage-event write and the same rename leaves a charge the
  projection has not folded in. Replaying the append returned the stored event
  against a stale projection, losing the charge and leaving the reservation open
  forever.

- consumption that exactly reaches a hard limit is charged before the receipt is
  sealed, so a crash between them leaves counts that agree with each other, no
  receipt, and a run that is over but says it is active. This is the one face
  with no record of its own: `unsealed_exhaustion` is detected by recomputing
  `exhaustionRefusal` from the counts, and the repair seals the receipt.
- crash between the stop-receipt write and the same rename leaves a receipt on
  disk with `current.stop_receipt_sha256 === null`. This one is invisible to the
  entry counts of `events/` and `reservations/`, so it has to be probed on its
  own; before the fix `readAutomationBudgetStatus` hard-failed on the mismatch
  and every verb plus the read-only operator slice threw
  `automation_budget_store_invalid` forever.

Immutable records are also published atomically: each is written and fsynced
under a temporary name that no scan reads, then linked onto its final path.
`link` is atomic and fails `EEXIST` exactly like `O_EXCL`, so create-once still
holds while "the file exists" now means "its content is complete". Creating the
final path directly made a record visible before its bytes were durable, so a
crash could leave an empty `.json` that no repair could parse and no same-key
retry could replace. A leftover temporary file is garbage that no scan counts.

The chosen recovery is one rule, not two guards: **`current.json` is a derived
projection of all three durable record kinds -- `reservations/`, `events/` and
`stop-receipt.json` -- and every mutating verb re-derives it under the run lock
before deciding.** `detectAutomationCurrentDrift` probes the receipt and
compares directory entry counts (one `existsSync` plus two `readdir` calls on
the healthy path);
`repairCurrentFromDurableRecords` runs only after a crash and rebuilds consumed,
the no-progress streak, the ledger chain, the step index and the open
reservation from the immutable records themselves. Nothing is re-minted and no
metric is assumed to be zero.

The alternative -- re-registering the orphan ad hoc inside `replay()` -- was
rejected because it repairs one field on one code path and leaves the mirror
case (`unfolded_event`) unhandled. Re-derivation states the invariant once and
covers both. `replay()` now classifies a stored reservation as closed (an event
exists), open (the repaired projection lists it), or neither -- and the third
case fails closed instead of re-minting.

A repaired run whose reservation is still open is marked
`reconciliation_required`, which is exactly the refusal an open reservation
already produces, so the next operation is blocked until the interrupted one is
appended or reconciled. A repaired run whose receipt was unadopted becomes
`budget_exhausted`, so the next verb refuses instead of re-opening a stopped
run.

The read path is deliberately asymmetric: `readAutomationBudgetStatus`, the CLI
`automation budget show` and the board slice **report** drift and never repair
it, because a read-only surface must not write. They also never throw on a
crash window -- `AutomationBudgetBoardSliceV1.projection_stale` says the
counters are the last ones the projection managed to write, and the rendered
state is the durable truth (a receipt on disk means `budget_exhausted` whatever
the projection still says). Only a projection claiming a record the disk does
not have -- which no write ordering can produce -- stays fail-closed.

For the same reason, **a budget revision is refused while a reservation is
open**. A reservation carries the exact revision that authorized it, so
publishing over an in-flight operation would strand a charge that can never
land. Requiring the run to be quiescent avoids inventing cross-revision charging
semantics; the ledger itself stays revision-independent, so consumption already
recorded survives the revision.

### Reconciliation rules

An interrupted reservation is resolved only from exact evidence, never from an
assumption. Every resolution requires at least one `evidence_ref`; a
reconciliation with none fails with
`automation_budget_reconciliation_evidence_missing`.

- `reconciled_observed` — the real usage is recoverable. Token and cost figures
  still need `usage_attribution` bound to the exact capability revision the
  budget was minted against.
- `reconciled_reserved` — the real usage is not recoverable, so the full
  reserved upper bound is charged. Losing an observation costs the worst case,
  never nothing.
- `reconciled_not_started` — evidence proves the operation never began; the
  charge must be exactly zero on every reserved metric, and any other vector is
  rejected.

There is no `charge_zero` path that a caller can reach by omitting evidence.

### Composition with contract runner budgets

`composeAutomationLimits` takes the strictest applicable value per metric and
records the derivation for every enforced metric, so the derivation is inside
`budget_sha256` rather than a comment. The task contract's
`delegation.budget.runner_invocations` bounds `max_runner_invocations` and
`wall_time_minutes` bounds `max_wall_clock_seconds`. A contract that declares
`delegation.budget.tokens` is rejected: `scripts/contract-run.ts` already refuses
a non-null token budget as unenforceable, so accepting one here would invent a
second meaning for a field the runner treats as invalid.

The grant's `expires_at` clamps the frozen deadline; when it does, the
`wall_clock_seconds` derivation records `authorization_expiry` as its source.

### Operator projection

`projectAutomationBudgetSlice` is the read model: per-metric limit / consumed /
reserved / remaining, the state, the frozen deadline, and the stop receipt's own
facts. It carries no provider identity, no usage attribution and no evidence
refs. The surface is `repo-harness automation budget show --run <id>`; the
end-to-end test asserts the CLI and the direct read produce the same
`slice_sha256`.

The operator HTTP server was deliberately not extended. Its read routes are
worker-backed, cancellable, fleet-wide observations keyed by `repository_id`,
and an automation run has no registry identity yet — that binds through the
Engineer identity slot left open for #283. Adding a fourth route with that
machinery for a synchronous local-store read would be compensation for a shape
this slice does not have.

## Deviations From Plan Or Spec

- Architecture acceptance: the new capability node `capability.runtime-harness.automation-budget`
  is an `unresolved-major-change` (`node-added`). The orchestrator approved it as
  `event.orchestrator-approval-20260903-issue-282-automation-budget`; the accepted signal was
  `sha256:756564a6671d47dc3d834b6f32e1c4ac6aeb0cfbf9ac3ae253006698bc906f31`.
  `architecture-projection accept` exited 1 with `applied-reconcile-required` after writing all
  eight projection files (post-apply `worktreeDigest` diverges from the accepted snapshot because
  the write itself changes the tree), the ordinary `apply` then converged to `applied`, and
  `check` is `noop` with no human actions or refresh signals. Same shape as #278/#284.
- The first flow proof was unprovable and blocked the approval regardless of the approval itself:
  archctx proves a P2 step only from a *direct* call edge between the declared source symbol and
  the sink symbol. The original node declared `reserveAutomationBudget -> sealAutomationStopReceipt`
  and `appendAutomationUsage -> sealAutomationUsageEvent`, both of which are indirect (through
  `persistStopReceipt` and `commitUsage`). The node and flow now name the function that actually
  makes each call, which is also the more honest description of the code.
- BRC0 campaign negative freeze narrowed with the campaign owner's approval:
  `tests/characterization/repair-campaign-authority-freeze.test.ts` asserted that four
  paths do not exist yet, two of which are directory-level (`src/core/automation`,
  `src/effects/automation`) and collide with this branch's budget module. Only those two
  rows were deleted; `src/cli/commands/campaign.ts`, `src/core/automation/development-campaign.ts`,
  the policy `development_campaign` key and the `.archcontext` development-campaign node
  negatives are untouched, so the campaign capability is still frozen at file level.
  `automation/` is now a shared namespace, which is what the directory assertions could no
  longer express.
- The plan's task-breakdown order was TDD per module rather than one global
  red phase: the core module and its tests landed together, then the store,
  then contention, then the end-to-end fixture. Each module's tests were run
  and failing behaviour corrected before the next module started (two real
  defects were caught this way: a self-referential `event_id` digest, and a
  replay path that let an exhausted run re-grant a stored reservation).

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| A second `ControllerAuthorization` / budget type beside the PRD's | Rejected | Two authorization shapes for one host-owned grant is duplicated authority; extending `ProgramBudgetLimitV1` keeps one schema for the campaign and the controller |
| Post-hoc accounting (sum the ledger after each provider call) | Rejected | Cannot stop the next claim or dispatch; only reserve-before-act can |
| Many concurrent open reservations per run with per-reservation expiry | Rejected for v1 | Adds a sweep and an expiry policy to buy parallelism a sequential controller does not use; one open reservation makes the crash rule a single condition |
| Treat a contract `delegation.budget.tokens` as an automation token limit | Rejected | The contract runner rejects that field as unenforceable; reusing it would be a second meaning for the same datum |
| Add an operator HTTP route for the budget slice | Deferred | Needs a repository-scoped run identity that binds through #283; the CLI projection is the same read model and the same digest |

## Open Questions

- The architecture projection for the new `capability.runtime-harness.automation-budget`
  node returns `human-action-required` (`unresolved-major-change`, reason
  `node-added`). Approval is the orchestrator's call; see the report for the
  exact `architecture-projection accept` invocation and signal id.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
