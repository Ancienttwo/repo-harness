# Plan: Sprint strict-queue enforcement before EPC

> **Status**: Draft
> **Created**: 20260721-1743
> **Slug**: sprint-strict-queue-enforcement
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: conversation:2026-07-21-graph-engineering-strict-queue
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Targeted sprint-backlog behavior and projection-parity tests, generated-repo checks, root required checks, and strict contract verification.
> **Rollback Surface**: Revert the single strict-queue PR; no persisted schema or data migration, and in-flight marker format remains unchanged.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260721-1743-sprint-strict-queue-enforcement.contract.md`
> **Task Review**: `tasks/reviews/20260721-1743-sprint-strict-queue-enforcement.review.md`
> **Implementation Notes**: `tasks/notes/20260721-1743-sprint-strict-queue-enforcement.notes.md`

## Agentic Routing
- Selected route: parent-agent:geju
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: conversation:2026-07-21-graph-engineering-strict-queue
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Scheduled plan (not active): `plans/plan-20260721-1743-sprint-strict-queue-enforcement.md`; it was captured with `--no-active` because HRD-08/09 own the current execution sequence.
- Sprint contract: `tasks/contracts/20260721-1743-sprint-strict-queue-enforcement.contract.md`
- Sprint review: `tasks/reviews/20260721-1743-sprint-strict-queue-enforcement.review.md`
- Implementation notes: `tasks/notes/20260721-1743-sprint-strict-queue-enforcement.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260721-1743-sprint-strict-queue-enforcement.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260721-1743-sprint-strict-queue-enforcement.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260721-1743-sprint-strict-queue-enforcement.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260721-1743-sprint-strict-queue-enforcement.contract.md`
- Review file: `tasks/reviews/20260721-1743-sprint-strict-queue-enforcement.review.md`
- Implementation notes file: `tasks/notes/20260721-1743-sprint-strict-queue-enforcement.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260721-1743-sprint-strict-queue-enforcement.contract.md --strict`
- Active plan rule: this Draft intentionally writes neither `.ai/harness/active-plan` nor `.ai/harness/active-worktree`. After HRD-09 merges, implementation still requires explicit owner approval and `repo-harness run plan-to-todo --plan plans/plan-20260721-1743-sprint-strict-queue-enforcement.md` in its isolated worktree.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260721-1743-sprint-strict-queue-enforcement.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single strict-queue PR; no persisted schema or data migration, and in-flight marker format remains unchanged.
- **Verification boundary**: Targeted sprint-backlog behavior and projection-parity tests, generated-repo checks, root required checks, and strict contract verification.
- **Review/acceptance boundary**: `tasks/reviews/20260721-1743-sprint-strict-queue-enforcement.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260721-1743-sprint-strict-queue-enforcement.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260721-1743-sprint-strict-queue-enforcement.contract.md`, `tasks/reviews/20260721-1743-sprint-strict-queue-enforcement.review.md`, and `tasks/notes/20260721-1743-sprint-strict-queue-enforcement.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260721-1743-sprint-strict-queue-enforcement.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single strict-queue PR; no persisted schema or data migration, and in-flight marker format remains unchanged.

## Captured Planning Output

# Sprint Strict-Queue Enforcement Before EPC

## Thesis

A machine-operated serial Sprint is a one-slot state machine: the first
unchecked backlog row is the sole execution head, and row order is the sole
dependency authority. Delete the current "walk the queue" behavior. Do not
add a DAG schema until an approved Sprint has a real need for more than one
simultaneously ready row.

Confidence is high for the current product contract. The only meaningful
uncertainty is future partial-order execution; that possibility is a deferred
authority cutover, not a reason to weaken today's serial queue.

## Geju Frame

- **Inherited trap**: treating "next pending row not already in flight" as the
  scheduler's goal because the implementation already does so.
- **Constraint status**: row order is real, not legacy inertia. The canonical
  template calls the backlog an ordered execution queue and requires rows to
  stay in dependency order.
- **Zero-legacy result**: if this serial Sprint mechanism were designed today,
  it would expose exactly one startable row. It would not search for another
  row while the head is running.
- **Concept to kill**: "next available row" in a serial Sprint. Availability
  does not imply readiness.
- **Non-negotiable principles**:
  1. one dependency authority;
  2. fail closed before any successor side effect;
  3. no hidden order bypass through `--force`;
  4. self-host and distributed assets remain byte-identical;
  5. no compatibility reader, schema alias, or semantic fallback.

## Problem and Evidence

Baseline inspected for this plan:

- repository: `/Users/kito/Projects/repo-harness`;
- baseline: `main@e1fce20a73bea1df197ac5dba3270fbf43eb26b3`, equal to
  `origin/main` when this plan was written;
- HRD-08 is actively owned by
  `/Users/kito/Projects/repo-harness/.ai/harness/worktrees/hrd-08-event-telemetry-and-benchmark`;
- the primary worktree has no active-plan, active-worktree, or active-sprint
  marker and contains the user-owned untracked `HANDOFF.md`, which remains
  untouched.

The contract and runtime currently disagree:

1. `scripts/sprint-backlog.sh` describes Sprints as ordered execution
   backlogs, and its generated template says to keep rows in dependency order.
2. `backlog_rows()` preserves table order and `next_pending_row()` returns the
   first unchecked row.
3. `cmd_start_task()` then discards that authority for auto-selection: it
   iterates every unchecked row, skips an in-flight row, and reserves the next
   one.
4. A named `--task` can select any unchecked successor without proving that
   earlier rows are complete.
5. The current regression test explicitly expects a second invocation to
   start `task-b` while `task-a` is in flight.
6. The active HRD Sprint says every successor pins the live `origin/main`
   produced by its predecessor and names stale-base authority as a risk.

Concrete failure: if HRD-08 is in flight and another caller invokes
`start-task` against the same Sprint, the current auto-selector can reserve
HRD-09 before HRD-08 merges. HRD-09 can then capture a plan or open a worktree
from a base that cannot contain HRD-08, violating the Sprint's own authority.

## P1: Architecture Map

### Authority and projections

- **Dependency authority**: backlog row order inside the Sprint's `## Backlog`
  table.
- **Completion authority**: each row's `[ ]` / `[x]` status as back-filled by
  `complete-task` after the work-package closeout path.
- **Reservation state**: ignored
  `.ai/harness/sprint/in-flight/<normalized-task>` markers.
- **Concurrency boundary**: ignored
  `.ai/harness/sprint/.backlog-lock`, held across marker pruning, head
  selection, validation, and reservation.
- **Self-host helper**: `scripts/sprint-backlog.sh`.
- **Distributed helper authority/projection pair**:
  `assets/templates/helpers/sprint-backlog.sh` and the self-host copy, guarded
  by byte-parity tests.
- **Template pair**: `assets/templates/sprint.template.md` and
  `.claude/templates/sprint.template.md`.
- **Reference-contract pair**:
  `assets/reference-configs/sprint-contracts.md` and
  `docs/reference-configs/sprint-contracts.md`.
- **Primary behavior tests**: `tests/sprint-backlog.test.ts`.
- **Installation/parity verification**:
  `tests/scaffold-parity.test.ts`, `tests/workflow-contract.test.ts`, and
  `tests/create-project-dirs.runtime.test.ts`.

### Ownership boundary

The installable helper/template/reference files belong to the
`workflow-engine-contract-assets` capability. The Bash self-host copy is a
byte projection of the packaged helper. This package does not change policy,
workflow-contract helper inventory, hook routing, contract-worktree closeout,
or any HRD/EPC runtime module.

### Strong and weak dependencies

- Strong: row order, checkbox status, in-flight marker, backlog lock,
  capture-plan invocation, and helper/template/reference parity.
- Weak: human prose in individual historical Sprint Architecture Notes. It
  can explain a future partial graph but does not currently drive the machine
  selector.
- Out of scope: historical task-card `depends_on` fields, old completed Sprint
  diagrams, Claude Dynamic Workflows, and user-level `ultracode.md` rules.

## P2: Concrete Trace

### Current failing path

1. Caller invokes `sprint-backlog start-task`, optionally naming a task.
2. The helper resolves the active or explicitly selected Sprint and requires
   `Approved` or `Executing`.
3. It acquires the backlog lock and removes markers only for rows that no
   longer exist or are already complete.
4. With no `--task`, it scans all unchecked rows and selects the first one
   without a marker. With `--task`, it resolves that row directly.
5. It records an in-flight marker, releases the lock, and captures or appends
   the plan material.
6. Therefore a second serialized caller can observe row 1 in flight, skip it,
   reserve row 2, and produce a second execution authority.

### Target path

1. Resolve and validate the Sprint exactly as today.
2. Under the existing backlog lock, prune markers exactly as today.
3. Resolve `queue_head` once as the first unchecked row.
4. If no unchecked row exists, preserve the existing no-task outcome.
5. For auto-selection, target only `queue_head`; never scan later rows.
6. For named selection, require the resolved target to equal `queue_head`
   before examining its in-flight marker. A later row fails with no tracked
   write, marker, plan capture, worktree, or command side effect.
7. If the head is already in flight:
   - auto-selection reports that the ordered queue is busy and exits without
     starting a successor;
   - named head without `--force` preserves the duplicate-start rejection;
   - named head with `--force` preserves the existing same-row restart path.
8. Record the head marker while still holding the lock, then release the lock
   before the potentially long capture-plan operation exactly as today.
9. `complete-task` remains a truth-recording/back-fill command. It does not
   become an execution-permission authority and is not redesigned here.

### Async and failure boundaries

- The lock serializes competing selectors; the head marker makes the result
  visible after the lock is released.
- Capture-plan failure continues to clear only the target head's marker.
- A surviving marker after a crashed owner intentionally blocks successors.
  Recovery is to inspect/restart the named head, not to infer that a successor
  is safe.
- Any order rejection occurs before `record_in_flight`, body-file creation,
  capture-plan, active-plan mutation, or worktree execution.

## P3: Design Decision

Implement a strict total-order head gate and nothing more.

Row order already encodes a full dependency chain, serves both humans and the
machine parser, and is sufficient for the active HRD and upcoming EPC Sprints.
Adding `depends_on` now would either create two dependency authorities or
force a repository-wide authority cutover with no active partial-order
consumer. Reusing `--force` to skip predecessors would create an unaudited
contract bypass. Both are rejected.

At 10x concurrent callers, the first pressure point is not graph evaluation;
it is ensuring every caller serialized by the existing lock sees the same
head reservation. The strict selector plus the existing marker is sufficient:
one caller reserves the head, every later caller observes that head as busy,
and none can walk to a successor.

## CLI Contract

| State | Invocation | Result |
|---|---|---|
| Head pending, no marker | `start-task` | Start the head |
| Head pending, no marker | `start-task --task <head>` | Start the head |
| Head in flight | `start-task` | No successor; report busy/no startable row |
| Head in flight | `start-task --task <head>` | Reject duplicate and name the restart command |
| Head in flight | `start-task --task <head> --force` | Restart the same head only |
| Earlier row incomplete | `start-task --task <successor>` | Reject as out of order |
| Earlier row incomplete | `start-task --task <successor> --force` | Still reject; force cannot bypass order |
| Any queue state | `start-task --force` without `--task` | Usage error; force requires a named head |
| No unchecked row | `start-task` | Preserve no-task exit behavior |
| Head is `inline` | Any start form | Same ordering rules; mode is not a dependency signal |
| Explicit `--sprint` | Any start form | Same strict ordering inside the selected Sprint |

User-facing failures must name the blocking head and requested successor when
one was supplied. Tests should assert stable semantic substrings rather than
the entire prose message.

`status` and `next` continue to report the first unchecked row. They expose
the queue head, not permission to start another row. This package does not add
a readiness schema or change their output shape.

## Detailed Change Set

| File | Action | Decision-complete change |
|---|---|---|
| `scripts/sprint-backlog.sh` | Modify | Replace scan-for-first-free auto-selection with one `queue_head`; reject named successors; preserve same-head restart; require `--force` to be paired with `--task`; update usage/template prose. |
| `assets/templates/helpers/sprint-backlog.sh` | Modify | Byte-identical product projection of the self-host helper change. |
| `.claude/templates/sprint.template.md` | Modify | State that row order is the dependency authority, an in-flight head blocks successors, and force cannot skip rows. |
| `assets/templates/sprint.template.md` | Modify | Byte-identical distributed template projection. |
| `docs/reference-configs/sprint-contracts.md` | Modify | Document the strict total-order execution semantics and future one-shot DAG cutover boundary. |
| `assets/reference-configs/sprint-contracts.md` | Modify | Byte-identical distributed reference projection. |
| `tests/sprint-backlog.test.ts` | Modify | Replace the test that blesses queue walking; add head-busy, named-successor, force-boundary, inline-after-predecessor, and parity assertions. |
| `tasks/todos.md` | Modify during execution only | Add the deferred partial-order authority-cutover goal after HRD-09 has merged, using the latest remote-main ledger rather than editing the HRD-08-owned copy. |
| Workflow plan/contract/review/notes and `tasks/current.md` | Lifecycle only | Create/project only after implementation approval and through the normal work-package flow. |

No change is allowed to `.ai/harness/policy.json`, either workflow-contract
manifest, Sprint table columns, `check-task-workflow.sh`,
`contract-worktree.sh`, hook code, or user-level Claude/Codex rules.

## Deferred Partial-Order Cutover

During implementation, append one row to `tasks/todos.md` with this semantic
content:

- **Goal**: promote Sprint scheduling from total-order rows to an explicit DAG
  only when an Approved, machine-operated Sprint requires more than one
  simultaneously ready row.
- **Why deferred**: current active consumers are serial; adding edges now
  expands authority without changing a required behavior.
- **Tradeoff**: disjoint or read-only Sprint rows remain serialized until the
  cutover is justified.
- **Revisit trigger**: an approved Sprint demonstrates two rows that must be
  startable concurrently and proves their read-only or non-overlapping write
  boundaries. The same work-package must then make explicit edges the sole
  dependency authority, demote row order to display only, reject missing
  references/cycles, and teach both strict validation and scheduling the new
  readiness model. No dual-authority transition window is allowed.

Historical ESA partial-order prose and the older draft MCP task-card
`depends_on` fields prove that the use case can exist; they are not current
machine consumers and therefore do not satisfy this trigger by themselves.

## Test Plan

### Regression proof

1. Start `task-a` and confirm its in-flight marker exists.
2. Invoke auto `start-task` again.
3. Assert non-success, a message naming `task-a` as the blocking head, no
   `task-b` marker, no `task-b` plan, and no inline checklist append.
4. Explicitly request `task-b`, first without and then with `--force`; both
   must fail before side effects.
5. Restart `task-a` with named `--force`; this remains successful.
6. Complete `task-a`, then prove `task-b` becomes the head and starts normally.

### Existing-fixture corrections

- The contract/inline start test must complete row 1 before starting row 2;
  it must no longer rely on out-of-order execution to exercise inline mode.
- Rename the current "auto-select skips in-flight rows" fixture so its name
  states the new invariant.
- Preserve draft-Sprint, duplicate task/index, marker cleanup, lock timeout,
  stale-lock reclaim, `--sprint` confinement, session-context, and asset parity
  coverage.

### Verification commands

Run cheap, targeted evidence first and full evidence once after code freeze:

1. `bun test tests/sprint-backlog.test.ts`
2. `bun test tests/workflow-contract.test.ts tests/scaffold-parity.test.ts tests/create-project-dirs.runtime.test.ts`
3. `cmp scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh`
4. `cmp .claude/templates/sprint.template.md assets/templates/sprint.template.md`
5. `cmp docs/reference-configs/sprint-contracts.md assets/reference-configs/sprint-contracts.md`
6. `bun scripts/capability-resolver.ts validate --format text`
7. `git diff --check`
8. Root required checks: `bun test`, deploy SQL order, architecture sync, task
   sync, strict task workflow, project-state inspection, and adoption dry-run.
9. `repo-harness run verify-contract --contract <strict-queue-contract> --strict`

If the known unrelated state-concurrency fixture flakes during the full suite,
classify it against current evidence and rerun only enough to prove identity;
do not silently waive an unknown failure or manufacture a green result.

## Acceptance Criteria

- A second invocation while the queue head is in flight cannot reserve,
  capture, append, or start any successor.
- A named successor is rejected while any earlier row remains unchecked,
  regardless of `--force`.
- Named `--force` still restarts the same in-flight head and has no other
  meaning; force without a named task fails usage validation.
- After the head is marked complete, the next row becomes startable without
  manual marker surgery.
- Contract and inline rows obey identical ordering semantics.
- The order gate and marker reservation remain within the existing backlog
  lock; capture-plan stays outside the long-held lock.
- Self-host/distributed helper, template, and reference pairs are byte-identical.
- Generated-repo fixture and adoption dry-run retain the same helper inventory
  and install shape.
- The deferred DAG goal is recorded once with a concrete revisit trigger.
- No table column, policy field, graph parser, compatibility alias, semantic
  fallback, new dependency, or user-level host rule is introduced.
- Targeted tests, root required checks, strict contract verification, review,
  and canonical acceptance all pass against one frozen subject before merge.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| A crashed owner leaves the head blocked | Medium | Medium | Intentional fail-closed behavior; inspect and restart the named head with existing force semantics rather than skipping it. |
| `--force` becomes an accidental order bypass | Medium | High | Require a named task, compare it to the head first, and test successor-plus-force rejection. |
| Existing tests or docs encode queue walking | High | Medium | Update the explicit regression and both authoritative projection pairs in the same package. |
| Historical partial-order Sprint is run with the strict helper | Low | Medium | Only current Approved/Executing machine operation matters; a future real consumer triggers the one-shot DAG authority cutover. |
| HRD-08/09 ownership overlaps `tasks/todos.md` | High before HRD close | High | Do not implement now; start from post-HRD-09 remote main and add the deferred row only in the isolated strict-queue worktree. |
| Main/generated helper drift | Medium | High | Byte-parity tests, scaffold tests, and adoption dry-run. |

## Rejected Alternatives

| Option | Why rejected now |
|---|---|
| Add a `depends_on` column while retaining row-order semantics | Creates two authored dependency authorities that can drift. |
| One-shot DAG schema cutover now | Clean in isolation but unjustified: no active Sprint requires multiple ready rows, and the added parser/validator/scheduler surface does not solve a current additional need. |
| Keep queue walking and document that rows may run concurrently | Contradicts the current ordered Sprint contract and stale-base invariant. |
| Let `--force` start a successor | Makes a safety invariant agent-bypassable without a separate approved deviation contract. |
| Infer independence from `Mode`, paths, acceptance prose, or task names | Creates heuristic/shadow authority and can silently start unsafe work. |
| Add a compatibility mode for legacy queue walking | Preserves the defect and creates dual semantics; prohibited. |

## First Proof Point and Falsifier

The cheapest proof point is one regression fixture: row 1 in flight, row 2
pending, second auto-start fails with zero row-2 side effects. It directly
reproduces the observed failure and proves the smallest fix.

The thesis is falsified if, before implementation begins, a currently
Approved and machine-operated Sprint requires two simultaneously startable
rows and has authoritative evidence that their work is read-only or their
write scopes are disjoint. In that case stop this package and design the
one-shot explicit-edge cutover; do not weaken strict queue with exceptions.

## Sequencing and Ownership

1. **Now through HRD-09**: do not edit files owned by the active HRD worktree.
   Operationally, do not invoke `start-task` for a successor while an earlier
   HRD row is in flight.
2. **Start gate**: HRD-09 is merged and pushed; `origin/main` is fetched and
   pinned; no active worktree owns any strict-queue allowed path; the latest
   `tasks/todos.md` is read from that base.
3. **Promotion**: owner explicitly approves implementation; promote this Draft
   through `repo-harness run plan-to-todo`, creating one isolated
   `codex/sprint-strict-queue-enforcement` contract worktree.
4. **Implementation**: freeze the regression first, then change selector,
   projections, docs, and the deferred ledger row as one coherent package.
5. **Evidence**: freeze code, run targeted checks, then root checks once;
   review and acceptance bind the exact subject.
6. **Closeout**: merge the independent PR only with separate authorization,
   clean its worktree, then pin the new `origin/main` before EPC starts.

## Promotion Gate

- **Artifact level**: work-package.
- **Reason**: `risk_boundary`; this changes the scheduler's execution
  authority and concurrency behavior.
- **Merge/PR unit**: one strict-queue PR, separate from HRD and EPC.
- **Rollback**: revert the single PR; there is no persisted schema or data
  migration. Ignored in-flight marker format remains unchanged.
- **Verification boundary**: targeted queue/parity tests plus root required
  checks and strict contract verification.
- **Review boundary**: Waza `/check`-style review against the frozen subject,
  followed by canonical AcceptanceReceipt or an explicit user waiver;
  merge authorization remains separate.
- **Why not an inline checklist row**: the selector authority, distributed
  helper projection, and concurrency regression form an independently
  reviewable and revertible behavior boundary.

## Evidence Contract

- **State/progress path**: this plan; its future contract, notes, and review;
  the deferred `tasks/todos.md` row; `tasks/current.md` at closeout; and the
  post-merge EPC start gate.
- **Runtime evidence**: targeted test output, byte-parity checks,
  `.ai/harness/checks/latest.json`, and bounded run snapshots.
- **Evaluator rubric**: no successor side effect under an in-flight head;
  same-head force remains; all projections are byte-identical; no new
  dependency authority exists.
- **Stop conditions**: stop before implementation if the falsifier is met,
  HRD-09 is not merged, another worktree owns an allowed path, the contract
  cannot express the exact file scope, or any required check reveals an
  unexplained failure.

## Task Breakdown

- [ ] After HRD-09 merges, fetch and pin exact `origin/main`; prove no active worktree owns the strict-queue paths.
- [ ] Capture a failing head-in-flight/successor-pending regression with zero-successor-side-effect assertions.
- [ ] Implement head-only selection and same-head-only force semantics in the self-host and distributed helper pair.
- [ ] Update Sprint template/reference pairs and record the deferred one-shot DAG cutover trigger in `tasks/todos.md`.
- [ ] Run targeted queue/parity/generated-repo checks, then root required checks once after code freeze.
- [ ] Complete the contract, review, canonical acceptance, separately authorized merge, worktree cleanup, and post-merge EPC start proof.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] After HRD-09 merges, fetch and pin exact `origin/main`; prove no active worktree owns the strict-queue paths.
- [ ] Capture a failing head-in-flight/successor-pending regression with zero-successor-side-effect assertions.
- [ ] Implement head-only selection and same-head-only force semantics in the self-host and distributed helper pair.
- [ ] Update Sprint template/reference pairs and record the deferred one-shot DAG cutover trigger in `tasks/todos.md`.
- [ ] Run targeted queue/parity/generated-repo checks, then root required checks once after code freeze.
- [ ] Complete the contract, review, canonical acceptance, separately authorized merge, worktree cleanup, and post-merge EPC start proof.
