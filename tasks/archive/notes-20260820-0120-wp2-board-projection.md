> **Archived**: 2026-08-20 01:20
> **Related Plan**: plans/archive/plan-20260819-2109-wp2-board-projection.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-0120

# Implementation Notes: wp2-board-projection

> **Status**: Active
> **Plan**: plans/plan-20260819-2109-wp2-board-projection.md
> **Contract**: tasks/contracts/20260819-2109-wp2-board-projection.contract.md
> **Review**: tasks/reviews/20260819-2109-wp2-board-projection.review.md
> **Last Updated**: 2026-08-19 23:55
> **Lifecycle**: notes

## T1 Doc Placement — Resolved

**Orchestrator verdict (2026-08-19, contract amended in `1bc19e32`)**: root
placement accepted — the document lives at
`docs/architecture/shared-coordination-plane.md`, beside
`effective-state-authority.md`. Minting a capability node was rejected for the
reason given below: the plane spans four top-level areas, not one
longest-prefix boundary. Goal, `allowed_paths`, and
`exit_criteria.files_exist` all carry the amended path plus a provenance note.

The analysis that produced the decision is kept below as the record of why the
originally frozen path could not work.

## Original Blocker (T1, doc half)

The contract froze the architecture doc at
`docs/architecture/modules/workflow-engine/shared-coordination-plane.md`
(Goal, `allowed_paths`, and `exit_criteria.files_exist`). That path cannot hold
a hand-written prose document, and the contradiction is mechanical rather than
stylistic:

- `docs/architecture/modules/<domain>/<name>.md` is a **derived** path owned 1:1
  by a capability node — `scripts/capability-config.ts:232-235` computes it from
  the capability's domain and name.
- `scripts/capability-resolver.ts:294-311` walks `docs/architecture/modules/`
  and reports `orphan architecture module: <path>` for any `.md` that is not
  some capability's `architecture_module`. That aborts
  `capability-resolver.ts export`, which `tests/capability-archcontext-export.test.ts`
  asserts exits 0.
- `tests/architecture-projection-e2e.test.ts:38-58` additionally pins the module
  count at exactly 11 and requires every module doc to be a generated ArchContext
  projection (two Mermaid blocks, `- Proof: \`proven\``, a `sequenceDiagram`).

So `exit_criteria.files_exist` and `exit_criteria.commands_succeed: bun test`
are internally contradictory for this one path — contract Stop Condition 3.
Legalizing it needs an edit outside `allowed_paths` (a new
`.archcontext/model/nodes/*.yaml` capability, or the two tests, or a different
doc path), and picking among those is an architecture-registry decision, not an
executor's.

The placement that needs no capability node, and the one the orchestrator took,
matches the existing local pattern: `effective-state-authority.md`,
`global-hook-runtime.md`, and `transactional-adoption-planner.md` are all
human-owned architecture prose directly under `docs/architecture/`. The
document was restored there verbatim from `a9f3210b` with its header rewritten
to the sibling shape, and `docs/architecture/index.md` now carries a one-line
link entry instead of duplicated inline prose.

The rejected alternative — minting a real
`workflow-engine/shared-coordination-plane` capability node — was the larger
call: the plane spans `src/core/state/`, `src/effects/state/`,
`src/effects/git/`, and `src/cli/commands/`, which is not a single
longest-prefix boundary, and the doc would then have to be an ArchContext
projection rather than prose.

## Design Decisions

### Verdict A — lease vocabulary passes through unchanged

`lease_state` is the store's own `LeaseClassification`
(`available | reserving | bound | completing | released | unknown`). `orphaned`
is not a persisted state and is not invented as one: it is a derivation over
`git worktree list` published as `diagnostics.orphan_reclaimable`, gated on
spec §11's shape (a `reserving`/`bound` record, its worktree absent from the
topology, and no stamped `finish_transaction_key`).

A residual `released` sits in `blocked` rather than `todo` because it genuinely
blocks: `claimSprintCommand` refuses anything whose classification is not
`available`, so a `released` record whose directory removal never completed is
an unclaimable row. Calling it `todo` would advertise work no agent can take.

### Verdict C — four dimensions plus a composite, worktree metadata excluded

`task_authority` / `coordination` / `topology` / `evidence`, each a digest over
the observed **bytes**, composed into one `board` digest that
`snapshot_consistency` compares. The four are published so a torn read can be
localized to a dimension instead of only reported as "something moved".

Digests hash bytes, not parsed objects — that is why T3 added `LeaseRead.raw`.
Two owner records that parse identically but were written by different owners at
different moments are exactly the tear the digest exists to expose, and parsing
erases the difference before the comparison can see it.

Worktree metadata is deliberately not an input. WP4 may relocate it; a board
read of it today would create the dependency that relocation has to be free to
move. The board also takes no task lock: an observer that locked would serialize
every agent behind every reader, and the honest price of holding no lock is a
`changed_during_read` report.

### Verdict D — conflict projection cut, fields absent not empty

`actual_path_overlap` / `scope_overlap` are omitted from `BoardDiagnosticsV1`
entirely. Emitting `[]` would assert "no overlap", which this projection cannot
prove: the changed-set authority is a cwd-bound bash function, and a TypeScript
re-derivation would be a shadow parser of the same semantic data. Absent means
"not computed", which is the only true statement available. Pinned by a test
(`tests/board-projection.test.ts`, "the cut conflict fields are absent from
diagnostics, not empty") and deferred with an observed-collision trigger in
`tasks/todos.md`.

## Deviations From Plan Or Spec

| Spec §10.3 shape | Landed shape | Reason |
|---|---|---|
| `claim.plan` | `card.plan` | The Plan cell is row data and exists whether or not a lease does; nesting it under `claim` would make it disappear for `todo` rows. `claim` stays purely lease-record derived. |
| `row_index: 2` (number) | `row_index: "1"` (string) | `BacklogRow.index` is the trimmed cell verbatim (`sprint-backlog-rows.ts:44`). Parsing it to a number would be a second grammar over the shell's authority. |
| `actions: {release, steal, reconcile}` | same three, no `claim` action | The plan's frozen action set. A `claim` action was considered and dropped as an unrequested extra under EXECUTION_BOUNDARY. |
| — | `TaskState: 'drifted'` also covers an unrecognized status cell | A status outside `[ ]` / `[x]` is neither claimable nor complete. It is the same class of fact as revision drift — the canonical definition is not what the protocol expects — so it reuses `definition_drift` instead of adding a fifth state or a second diagnostic. |
| — | `progress_state: 'unreadable'` does **not** block | Spec §10.5: evidence failure never transfers ownership. Only `stalled` moves a column; `not_observed`, `active`, and `unreadable` must agree, which is asserted directly. |

Two smaller ones:

- `state board` computes `snapshot_consistency` in `resolveBoard`, not in
  `projectBoard`; the pure projector always emits `stable` and the resolver
  replaces that one field by spread. Deciding consistency needs a second
  observation, which is an effect. This mirrors
  `projectContinuationEnvelope`'s documented circuit-breaker post-pass, and a
  test pins that only that field differs between a stable and a torn document.
- `collect-board-inputs.ts` carries its own small policy read for
  `worktree_strategy.merge_back.target`. The existing reader in
  `resolve-effective-state.ts:149` is private to that module and that file is
  outside `allowed_paths`. This is the same reason `mutation-guard.ts:861`,
  `mutation-observed.ts:478`, and `session-context.ts:264` each carry their own
  `policyGet`. It reads one field with one default and validates fail-closed.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Board input types in `types.ts` vs. in `project-board.ts` | `project-board.ts` | `BoardTaskInput` needs `AttemptLedgerRead`, and `attempt-ledger.ts` already imports `types.ts`. Putting inputs in `types.ts` would create a circular import for no gain. The contract only froze the **document** types into `types.ts`; `ContinuationEnvelopeInputs` lives beside its projector for the same reason. |
| `T9` as a literal 96-row expected-column table vs. invariants over the cross product | Invariants | A mirrored expectation table passes against any refactor that breaks both copies alike. "Done outranks everything" and "only `stalled` lets the evidence dimension move a column" are independent claims. The cross product is still enumerated and every triple asserted total. |
| Full 4x6x4 cross product vs. the constructible subset | Constructible subset (60 triples) | Progress evidence only exists for a lease that names an execution worktree, so `available`, `unknown`, and `reserving` can only be `not_observed`. Fabricating a `reserving` record with an execution worktree would test a state the protocol cannot reach. |
| Retry one moved dimension vs. discard the whole round | Discard the whole round | Patching one re-read dimension into an older observation publishes a document that never existed at any instant — the exact failure `changed_during_read` exists to surface. |
| `worktree_present` computed in the collector vs. in the projector | Collector | The comparison needs `realpath` on both sides (`safeRealpath` on the topology paths and on `execution_worktree`), which is IO. The projector gets a boolean and stays zero-IO. |
| Bind receipt: after the owner write vs. before | Before | Appending after leaves the window the receipt exists to close — a lease already `bound` while still carrying the previous claim's stall count. Append failure therefore fails the bind closed (lease stays `reserving`); the opposite residue, an orphan `resumed` receipt from a failed bind, only clears one stall count. |

## Falsifier Probe Result

Contract Falsifier: if the 20-run stability probe under 2-3 active worktrees
yields a `stable` ratio below ~80%, apply the pre-authorized ~15-line fallback
(drop `evidence` from the composite digest, mark the progress overlay
possibly-stale).

Measured, `tests/sprint-claim-concurrency.test.ts` ("twenty consecutive board
reads under active worktrees"), 3 real linked worktrees with 2 bound leases:

```text
[board stability probe] 3 worktrees, 2 active leases, 20 runs: stable 20/20 (100%)
```

**The fallback was not applied.** Honest scope of the number: the probe measures
read-side self-perturbation with active leases present — that the board's own
inputs (including `resolveEffectiveStateReadOnly` on each owner worktree) do not
move under a quiet plane. It does not measure convergence against concurrent
*writers*, because no such load generator exists yet. The cheaper earlier probe
the contract names also passed: two collections in an idle real repository
(`state board --json` on
`plans/sprints/20260803-1810-long-run-anti-drift.sprint.md`) returned `stable`,
proving the input set contains no self-perturbing state.

## Full-Suite Flake Record (ship gate, 2026-08-19/20)

Two non-deterministic full-suite failures were observed while gating this work
package. Both reproduce only under full `bun test` load, both pass in
isolation, and neither touches a surface this work package changes.

| Test | Full-suite | Isolated |
|---|---|---|
| `tests/check-agent-tooling.test.ts` `skills_cli.status` timeout | 1 fail (worker round), 3 pass since | 22/22 pass |
| `tests/architecture-projection-orchestration.test.ts:662` "default refresh runner checkpoints each successful action before the next deadline check" | run 1 pass, run 2 fail, run 3 pass | 30/30 pass |

Full-suite results over this branch's content:

- pre-rebase, base `e2a67b96`: 2667 pass / 1 skip / 0 fail
- post-rebase, base `39e359c2`, run 2: 2668 pass / 1 skip / 1 fail
- post-rebase, base `39e359c2`, run 3: 2669 pass / 1 skip / 0 fail

The `:662` failure expected `toThrow('timeout before canonical action')` and
received `architecture refresh architecture-queue failed with exit 1`. An
ambient-`REPO_HARNESS_CLI` explanation was proposed and then falsified: no
assignment to `process.env.REPO_HARNESS_CLI` exists anywhere in `tests/` or
`src/`, and the shell profile exports only `REPO_HARNESS_SOURCE_ROOT` and
`REPO_HARNESS_NODE_BIN`. The remaining explanation is load-dependent timing --
the test asserts the deadline check fires before the canonical action, and
under full-suite load that ordering inverts into the action-execution path.
The mechanism is unproven, is not owned by this work package, and is recorded
as a P3 finding on the acceptance receipt for a separate diagnostic pass.

## Open Questions

- None. The one open item (shared-coordination-plane doc placement) was decided
  by the orchestrator on 2026-08-19; see the resolution section above.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Architecture doc: `docs/architecture/shared-coordination-plane.md` (restored from `a9f3210b`, relocated per contract amendment `1bc19e32`)

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- `docs/architecture/modules/` is a closed, capability-derived set, not a
  general home for architecture prose. Two independent gates enforce it
  (`capability-resolver.ts` orphan check, `architecture-projection-e2e.test.ts`
  count + generated-shape assertions), and neither is obvious from the directory
  name. Hard to reverse (a plan froze the wrong path), surprising without local
  context, and a real trade-off exists (capability node vs. root-level prose) —
  meets the promotion filter for `tasks/lessons.md`; the orchestrator owns
  landing it there at closeout.
- The rest stays here: the A/C/D verdicts are recorded in the plan and this
  file, and the board's own contract is documented in the source headers.
