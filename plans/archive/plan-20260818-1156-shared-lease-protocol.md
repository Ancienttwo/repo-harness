# Plan: WP1 shared lease protocol for cross-worktree sprint claims

> **Status**: Archived
> **Created**: 20260818-1156
> **Slug**: shared-lease-protocol
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: merge_boundary
> **Verification Boundary**: Concurrency harness racing real linked worktrees across claim/bind/release/steal/finish plus crash-window and cutover cases, with bun test and the mirror cmp checks
> **Rollback Surface**: One work package, one synthesized publication commit, one revert; quiescent cutover guarantees no in-flight lease state to translate back
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260818-1156-shared-lease-protocol.contract.md`
> **Task Review**: `tasks/reviews/20260818-1156-shared-lease-protocol.review.md`
> **Implementation Notes**: `tasks/notes/20260818-1156-shared-lease-protocol.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260818-1156-shared-lease-protocol.md`
- Sprint contract: `tasks/contracts/20260818-1156-shared-lease-protocol.contract.md`
- Sprint review: `tasks/reviews/20260818-1156-shared-lease-protocol.review.md`
- Implementation notes: `tasks/notes/20260818-1156-shared-lease-protocol.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260818-1156-shared-lease-protocol.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260818-1156-shared-lease-protocol.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260818-1156-shared-lease-protocol.md`.

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
- Contract file: `tasks/contracts/20260818-1156-shared-lease-protocol.contract.md`
- Review file: `tasks/reviews/20260818-1156-shared-lease-protocol.review.md`
- Implementation notes file: `tasks/notes/20260818-1156-shared-lease-protocol.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260818-1156-shared-lease-protocol.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260818-1156-shared-lease-protocol.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: One work package, one synthesized publication commit, one revert; quiescent cutover guarantees no in-flight lease state to translate back
- **Verification boundary**: Concurrency harness racing real linked worktrees across claim/bind/release/steal/finish plus crash-window and cutover cases, with bun test and the mirror cmp checks
- **Review/acceptance boundary**: `tasks/reviews/20260818-1156-shared-lease-protocol.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: merge_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260818-1156-shared-lease-protocol.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260818-1156-shared-lease-protocol.contract.md`, `tasks/reviews/20260818-1156-shared-lease-protocol.review.md`, and `tasks/notes/20260818-1156-shared-lease-protocol.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260818-1156-shared-lease-protocol.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: One work package, one synthesized publication commit, one revert; quiescent cutover guarantees no in-flight lease state to translate back

## Captured Planning Output

# WP1 — Shared Lease Protocol

Scope of this work package: make it impossible for two linked worktrees of one clone to
concurrently own the same sprint backlog row, and make every ownership transfer safe under
crash and race. Nothing else.

The read-only board, hook wiring, and worktree-metadata relocation are deliberately not
here. They are separate work packages with their own rollback and acceptance boundaries,
recorded in `tasks/todos.md`. This repo publishes one synthesized commit per work package
(`docs/architecture/modules/workflow-engine/contract-assets.md:151`), so a plan whose
phases each need an independent revert is not one work package.

## Problem

`scripts/sprint-backlog.sh:555` derives `in_flight_dir()` from `dirname "$marker_file"`, a
repo-relative path (`.ai/harness/sprint/in-flight`). Inside a linked worktree that resolves
to that worktree's own directory, so `task_in_flight()` (:563) only sees claims made from
the same working tree. `acquire_backlog_lock()` (:160) has the same scope bug: its
`.backlog-lock` mkdir mutex is per-worktree, so back-fill is not serialized across agents
either. The script's own comment at :576-577 records the blindness.

Contract mode compounds it: a claimed row deliberately stays `[ ]` until finish back-fills
it in the primary tree, so `[ ]`/`[x]` alone can never express global "doing" state.

The correct shared authority already exists and is proven here:
`scripts/contract-worktree.sh:513-537` elects closeout ownership with one atomic `mkdir`
under `$(git rev-parse --git-common-dir)/repo-harness/transactions/claims/`, shared by
every linked worktree of one clone.

## Authority split

| Datum | Sole authority |
| --- | --- |
| Task definition, acceptance, completion | tracked sprint row on the canonical target ref |
| Who currently owns execution of a task | common-dir lease owner record + fencing token |
| Whether a worktree exists | `git worktree list --porcelain` |
| A worktree's plan / base commit / branch | existing worktree-local metadata, unchanged in this WP |
| Whether work is progressing | attempt receipts — evidence only, never authority |

`tasks/current.md:16` already declares itself "not a live lock, not a kanban board, and not
an implementation gate". The lease plane holds the mirror boundary: it owns execution
ownership and never becomes a task authority.

## Task identity

```
task_id = git hash-object over:
  protocol version
  + repo identity
  + canonical sprint path
  + exact Task cell text
```

Row index is deliberately excluded. Including it means deleting or reordering row 1
rewrites the identity of every row below it, orphaning live leases into unreachable
directories while the same tasks become freshly claimable under new ids — which then needs
a second identity heuristic ("is this the same task text?") to repair.

`normalize_slug()` is likewise unsuitable as a shared key: it collapses "Fix auth bug" and
"Fix auth-bug" into one key, harmless for a per-worktree marker and fatal for a shared
lease. Sprint path in the digest gives cross-sprint isolation.

Invariants this requires, both already true or already enforced:

- The Task cell is unique within a sprint. `sprint-backlog.sh` task-ref resolution already
  refuses ambiguous references ("ambiguous (N backlog rows match)").
- A Task cell is immutable for the task's lifetime. Renaming a Task cell means deleting one
  task and creating another; the lease plane treats it that way and this WP does not try to
  follow renames.

Allowing renames later requires a genuinely immutable ID column on the sprint row. That is
a sprint-schema change, out of scope here, and recorded in `tasks/todos.md`.

## Revision granularity — the blocking correction

Binding a claim to a whole-sprint revision makes parallel execution impossible: completing
task A rewrites `[ ] -> [x]` in the same file, so any digest over the sprint blob or the
whole backlog changes, and every other in-flight claim would be invalidated as `drifted`.

This WP therefore defines and uses exactly one revision:

```
task_revision = hash over the semantic fields of THIS row only:
  task_id
  + Mode cell
  + Acceptance cell
```

The Status cell is excluded on purpose — a sibling row's completion, and this row's own
eventual completion, must not invalidate a live claim. A claim stores the `task_revision`
observed at claim time; only a change to this row's own semantic fields marks the claim
`drifted`.

A board-wide revision covering the whole sprint plus all coordination state is a diagnostic
concern for the read-only board, not a claim precondition. It belongs to the board work
package and is not defined here.

## Claim lifecycle

Claiming precedes worktree creation. `sprint-backlog.sh` start-task runs:

```
select row -> record_in_flight "capturing" (:736) -> release backlog lock
  -> capture-plan (with --execute, this runs contract-worktree start for minutes)
  -> record_in_flight "<plan_path>" (:838) or "inline:<sprint>#<index>" (:777)
```

The existing marker payload already carries a two-stage lifecycle (`capturing`, then the
resolved plan or inline ref). This WP formalizes that instead of inventing it, because the
lease owner record cannot name an execution worktree that does not exist yet:

```
available -> reserving -> bound -> completing -> released
```

First claim writes:

```json
{
  "protocol": 1,
  "kind": "repo-harness-lease-owner",
  "claim_id": "...",
  "task_id": "...",
  "task_revision": "...",
  "sprint_path": "...",
  "state": "reserving",
  "claimed_by": { "session_id": "...", "source_worktree": "..." },
  "execution_worktree": null,
  "branch": null,
  "unit_ref": null
}
```

After `contract-worktree start` succeeds:

```
repo-harness sprint bind --claim-id <id> --worktree <path> --branch <branch> --unit-ref <ref>
```

which moves the record to `bound` and fills `execution_worktree`, `branch`, and `unit_ref`.
If capture-plan or worktree creation fails, only the holder of the same `claim_id` may roll
the reservation back. A `reserving` record whose creating session is gone is not silently
reclaimable — it lands in `unknown` and needs explicit reconcile, because a reservation has
no worktree whose absence could prove death.

## Claim is a compare-and-swap, not a bare mkdir

1. Resolve the sprint from the explicit canonical target ref, not from the caller's local
   active-sprint marker. A worktree cut from an older commit must not claim against its own
   stale copy.
2. Verify the row is still pending.
3. Verify the caller's `--expected-task-revision` matches canonical.
4. Acquire the per-task transaction lock.
5. Atomic `mkdir` on the lease directory.
6. Write `owner.json` durably (temp + fsync + atomic rename).
7. Re-read canonical authority.
8. On any change: delete only the lease this call created, release the lock, fail closed.

Without steps 3 and 7 a shared plane only makes a wrong claim globally consistent rather
than preventing it.

## Fencing token and per-task transaction lock

Every successful claim mints a unique `claim_id`. Every ownership-mutating operation
compares it before mutating:

```
repo-harness sprint claim    --task-id <id> --expected-task-revision <rev>
repo-harness sprint bind     --claim-id <id> --worktree <path> --branch <branch>
repo-harness sprint release  --claim-id <id>
repo-harness sprint steal    --expected-claim-id <old-id> --reason <reason>
repo-harness sprint reconcile --task-id <id>
```

This closes the generation hazard: A claims, stalls, the orchestrator steals to B, A wakes
and calls release or complete. Without a token A deletes B's lease or completes B's task.
The existing `--force` on `start-task` (:655, :732) is retired here — as a shared-plane
operation it is unconditional preemption with no record of who took what from whom.

A token comparison alone is still a TOCTOU:

```
A reads owner = B
B is stolen, owner becomes C
A deletes based on its stale read
```

So compare-and-mutate is not enough; it must be serialized. Every mutation runs inside a
per-task lock:

```
$GIT_COMMON_DIR/repo-harness/coordination/v1/
├── leases/<task-id>/owner.json
├── locks/tasks/<task-id>.lock/
└── locks/backlog.lock/
```

```
acquire locks/tasks/<task-id>.lock   (atomic mkdir, stale reclaim as in acquire_backlog_lock)
read current owner
compare claim_id
write temp + fsync + atomic rename
release lock
```

The initial `mkdir` of the lease directory elects a first owner, but that is only the first
transition. `steal` is not a first election; `release` races `steal`; `complete` races
`steal`; and a crash between `mkdir` and the `owner.json` write leaves an empty lease
directory. An empty lease directory or a malformed / symlinked owner record is classified
`unknown` and requires explicit `reconcile`. It is never silently deleted.

`acquire_backlog_lock()` also moves to `locks/backlog.lock/` so back-fill actually
serializes across worktrees. Its existing stale-reclaim behaviour is preserved.

## Completion has two transaction boundaries, not one

A single `complete` command cannot cover both modes.

**Contract task.** The canonical row must not be flipped to `[x]` from inside the contract
worktree; that would break the existing finish publication transaction. Instead, finish
gains claim validation:

```
finish:
  verify claim_id
  verify the claim is bound to THIS worktree
  verify task_revision still matches canonical
  run verification / acceptance
  build the publication tree that includes the sprint back-fill
  publish
  then release the lease under the per-task lock, using the same claim_id
```

A crash after publication and before release leaves `canonical row = [x]` with a residual
lease. That state is legal and named: `reconcile` clears a residual lease whose canonical
row is complete. It is not an inconsistency to be prevented, because no single atomic
operation spans a git publication and a filesystem lease.

**Inline task.** Completes in the primary tree while holding the common backlog lock, then
releases the lease in the same critical section.

## Enforcement lives here, not in a later hook package

Because this WP introduces `steal`, it must also introduce the gate that makes stealing
meaningful. Finish-time claim validation above is the real publication gate: a stolen-from
agent cannot publish, regardless of whether any hook exists.

A `PreToolUse.edit` lease check is earlier, friendlier feedback and belongs to the hook work
package. It is not the enforcement boundary, and this WP does not depend on it.

## No blind claim-next

Backlog rows carry `# / Status / Task / Mode / Acceptance / Plan` — no `depends_on`, no
`parallel_group`, no `conflict_key`. `start-task` currently picks the next pending row after
skipping in-flight ones (:700-710), which is correct for one session and wrong as a
multi-agent scheduler: it treats "the next row" as "a row that may run concurrently".

This WP therefore ships exactly one rule:

> Every claim names `--task-id` explicitly. There is no automatic multi-agent claim-next.

Dependency declarations and parallel-safety marking would require new sprint columns, which
this WP explicitly does not change. Proposing `parallel-safe` or `depends_on` while also
promising not to touch the schema is incoherent; the eligibility work waits for a real
schema change and is recorded in `tasks/todos.md`.

Preventing duplicate claims is not the same as proving two tasks are safe to run in
parallel. This WP does only the first, and says so.

## Stall evidence stays conservative

`src/effects/state/attempt-ledger-store.ts:39-40` resolves the ledger as
`realpathSync(cwd)` + `.ai/harness/runs/continuation/attempts.jsonl`, so it is per-worktree
and not shared. `AttemptReceiptV1` (`src/core/state/types.ts:177-186`) carries `unit_ref`,
the two progress tokens, `outcome`, and `recorded_at` — no `task_id`, no `claim_id`, no
worktree id. Aggregating every worktree's ledger therefore cannot attribute a no-progress
receipt to a specific lease.

So this WP does not move, reshape, or reinterpret the ledger. It only stores `unit_ref` in
the owner record at `bind` time, so a later consumer can read the owning worktree's own
ledger and match on that one field. Receipts remain evidence: they may justify a human or
orchestrator decision to `steal`, and they never transfer ownership on their own.

A dedicated coordination receipt carrying `task_id` / `claim_id` / `worktree_id` may be
defined later. Silently widening `AttemptReceiptV1`'s meaning is not an option.

## Cutover is a migration, and is named as one

This relocates runtime state: marker location, owner record schema, lock location, and the
retirement of `--force`. Calling that "no migration" because no tracked file moves is wrong,
and the failure it hides is concrete — on upgrade with three active worktrees, the old
per-worktree markers still exist, the new system does not read them, and a new agent can
re-claim a task that is actively being worked.

Cutover is quiescent and fail-closed. Install/upgrade refuses to proceed when it detects:

- any per-worktree in-flight marker under any linked worktree, or
- any executing contract worktree, or
- any unfinished closeout journal entry.

The operator finishes or releases outstanding work first. This is chosen over a live
one-shot migration because mapping legacy markers to canonical tasks requires the same
identity derivation the new system is introducing; doing that translation on unverified
legacy state is exactly the kind of semantic re-derivation the repo's rules forbid. The
retired per-worktree path is deleted in this same work package — no fallback, no dual read.

## Deliberately not in this work package

- Worktree metadata relocation. `contract_worktree_metadata_select()`
  (`scripts/verify-sprint.sh:233`) is the declared "Sole selection authority" and its
  comment records the bug fixed on main: "An earlier version emitted every matching row and
  let each caller pick, which let an all-empty record satisfy the guard while the resolver
  walked past it to a stale one." Moving every worktree's record into one common-dir
  directory and globbing it reintroduces that bug on a larger corpus. Relocation is not
  required to fix duplicate claims, so it does not ride along with this fix.
- The read-only board projection.
- Any hook wiring.
- `allowed_paths` conflict detection.
- Lock-wait / merge-wait telemetry.

## Falsification tests

| Scenario | Must hold |
| --- | --- |
| two linked worktrees claim one task concurrently | exactly one succeeds |
| crash after lease mkdir, before owner.json write | classified `unknown`, never silently deleted |
| `release` and `steal` run concurrently | serialized by the per-task lock; no stale-read delete |
| `complete` and `steal` run concurrently | serialized; stolen-from agent cannot publish |
| stolen-from agent calls release | cannot delete the new lease |
| stolen-from agent calls finish | rejected on claim_id and on worktree binding |
| task A completes, changing the sprint file | claims on B and C do not drift |
| an unrelated row's Mode/Acceptance is edited | this task's `task_revision` is unchanged |
| this row's Acceptance is edited after claim | `drifted`; completion blocked |
| rows are reordered or a row is deleted | surviving tasks keep their `task_id` |
| two rows whose slugs normalize identically | no lease key collision |
| same Task cell text in two different sprints | leases isolated |
| claim succeeds, then worktree creation fails | only the same `claim_id` may roll back the reservation |
| a `reserving` record whose session is gone | `unknown`, not auto-reclaimed |
| finish publishes, then crashes before release | `done` with residual lease; reconcile clears it |
| agent process dies, worktree remains | no auto-reclaim |
| worktree formally removed | `orphaned`; reconcile is safe |
| detached HEAD or branch rename | not misjudged as dead |
| malformed, empty, or symlinked owner record | `unknown` + explicit reconcile |
| upgrade with legacy per-worktree markers present | cutover refuses, fail closed |
| crash between lock `mkdir` and token publish | the empty lock directory is preserved, never auto-reclaimed by the TS primitive, and every caller fails closed on the 5s timeout until an operator clears it |
| that wedge on `locks/backlog.lock/` | blast radius is clone-level, not one task: every linked worktree's back-fill blocks on the same directory, while a wedged `locks/tasks/<id>.lock/` stays bounded to its own task |
| `scripts/` vs `assets/templates/helpers/` | remain byte-identical |

`scripts/sprint-backlog.sh` and `scripts/contract-worktree.sh` are byte-identical to their
`assets/templates/helpers/` mirrors (verified with `cmp`, 2026-08-18); both sides change in
lockstep and the mirror check is required.

The concurrency tests race real linked worktrees, not mocked filesystems: every hazard above
is a filesystem-ordering hazard, and a mock would prove nothing about `mkdir` atomicity or
crash windows.

## Verification

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-architecture-sync.sh
repo-harness run check-task-workflow --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
cmp scripts/sprint-backlog.sh assets/templates/helpers/sprint-backlog.sh
cmp scripts/contract-worktree.sh assets/templates/helpers/contract-worktree.sh
```

Plus the concurrency harness covering every falsification row.

## Rollback

One work package, one synthesized publication commit, one revert. The coordination
directory is ignored runtime state under the git common dir; after a revert it is inert
because the restored code does not read it. Because cutover is quiescent, a revert lands on
a repo with no in-flight claims by construction, so no lease state needs translating back.

## Sources

- `scripts/sprint-backlog.sh:160,555,563,655,700-710,736,777,838` — per-worktree lock and in-flight scope, `--force`, auto-select, the existing two-stage marker payload
- `scripts/contract-worktree.sh:513-537` — proven atomic-mkdir claim on git-common-dir
- `scripts/verify-sprint.sh:233` — sole metadata selection authority and its recorded regression
- `src/effects/state/attempt-ledger-store.ts:30,39-40` — ledger is per-worktree
- `src/core/state/types.ts:177-186` — `AttemptReceiptV1` has no task/claim/worktree identity
- `src/core/state/project-continuation-envelope.ts:114-115` — versioned document envelope pattern
- `docs/architecture/modules/workflow-engine/contract-assets.md:151` — one synthesized publication commit per work package
- `tasks/current.md:16` — snapshot is not a kanban board
- `docs/researches/20260818-claude-code-agentic-swe-at-scale.md` sections 4 and 5

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Define the coordination types and identity derivation: `task_id` over `protocol + repo identity + canonical sprint path + exact Task cell` (no row index), `task_revision` over `task_id + Mode + Acceptance` (Status excluded), and the lease owner record schema with its `available/reserving/bound/completing/released` states.
- [x] Build the coordination plane primitives under `$GIT_COMMON_DIR/repo-harness/coordination/v1/`: per-task transaction lock with stale reclaim, durable owner write (temp + fsync + atomic rename), and the `unknown` classification for empty lease dirs and malformed/symlinked owner records.
- [x] Implement `sprint claim` as a compare-and-swap against the canonical target ref (verify pending, verify `--expected-task-revision`, lock, mkdir, write, re-read, roll back own lease on change), plus `bind`, `release`, `steal`, and `reconcile`, each gated on `claim_id` inside the per-task lock.
- [x] Integrate with `start-task`: replace `record_in_flight` with `claim` at the reserving stage, replace the post-capture marker rewrite with `bind`, move `acquire_backlog_lock()` to `locks/backlog.lock/`, retire `--force`, and require an explicit `--task-id` with no multi-agent claim-next.
- [x] Split completion by transaction boundary: contract finish validates `claim_id` + worktree binding + `task_revision` before building the publication tree and releases the lease after publishing; inline completion runs under the common backlog lock; `reconcile` clears a residual lease whose canonical row is already complete.
- [x] Ship the quiescent fail-closed cutover: install/upgrade refuses when any legacy per-worktree in-flight marker, executing contract worktree, or unfinished closeout journal entry exists; delete the retired per-worktree path in this same work package with no dual read.
- [x] Concurrency falsification harness over real linked worktrees covering every row of the falsification table, including the crash windows, the release/steal and complete/steal races, sibling-completion non-drift, and the legacy-marker cutover refusal.
- [x] Keep `scripts/` and `assets/templates/helpers/` byte-identical and assert it in tests.
