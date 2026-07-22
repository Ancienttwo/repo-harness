# Plan: EPC-07: Recovery-View Inventory and Minimal Cutover

> **Status**: Executing
> **Created**: 20260722-2246
> **Slug**: epc-07-recovery-view-cutover
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-07
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Phase A inventory with file:line evidence reconciling frozen D9 verdicts recorded before edits; red-first projection-drift and no-independent-authoring suites; Stop external semantics unchanged; live Stop dogfood materializes handoff/resume from the last checkpoint byte-deterministically; full bun test green
> **Rollback Surface**: Revert the single PR: restores the retired writers (bash handoff assembly, resume/packet authoring) and removes the recovery materializer + Stop internal swap; tracked tasks/current.md content untouched
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md`
> **Task Review**: `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md`
> **Implementation Notes**: `tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-07
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-2246-epc-07-recovery-view-cutover.md`
- Sprint contract: `tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md`
- Sprint review: `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md`
- Implementation notes: `tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-2246-epc-07-recovery-view-cutover.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-2246-epc-07-recovery-view-cutover.md`.

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
- Contract file: `tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md`
- Review file: `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md`
- Implementation notes file: `tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-2246-epc-07-recovery-view-cutover.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: restores the retired writers (bash handoff assembly, resume/packet authoring) and removes the recovery materializer + Stop internal swap; tracked tasks/current.md content untouched
- **Verification boundary**: Phase A inventory with file:line evidence reconciling frozen D9 verdicts recorded before edits; red-first projection-drift and no-independent-authoring suites; Stop external semantics unchanged; live Stop dogfood materializes handoff/resume from the last checkpoint byte-deterministically; full bun test green
- **Review/acceptance boundary**: `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-2246-epc-07-recovery-view-cutover.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-2246-epc-07-recovery-view-cutover.contract.md`, `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md`, and `tasks/notes/20260722-2246-epc-07-recovery-view-cutover.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-2246-epc-07-recovery-view-cutover.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: restores the retired writers (bash handoff assembly, resume/packet authoring) and removes the recovery materializer + Stop internal swap; tracked tasks/current.md content untouched

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-07 implements Sprint C backlog row 11: recovery-view inventory and
minimal cutover. Phase A completes the evidence-cited consumer inventory
over the four recovery views (handoff `current.md`, `resume.md`, tracked
`tasks/current.md`, Codex-global task-handoff) — every writer, every
reader, every trigger — and reconciles it against the frozen D9
preliminary verdicts (handoff KEEP / resume MERGE / tasks-current KEEP
with existing single materializer / task-handoff MERGE payload + RETIRE
writer). A verdict that reality contradicts is revised in this package's
contract with rationale (D9 explicitly assigns revision here, never ad
hoc). Phase B executes the cutover: surviving views get exactly one
materializer each, sourced from the EPC-06 checkpoint (machine projection)
plus the minimal workflow-artifact context a recovery view legitimately
needs; retired independent writers are deleted same-package (R5);
projection-drift and no-independent-authoring tests pass. Base SHA pinned
per R1 at fresh fetch: `e5fb55e11863fa51a6945f411327be3cb5bd4c50`
(post-EPC-06 merge + row flip).

## Why

Four independent writers author recovery state today; the audit's finding
is that a hand-written or divergent recovery projection can silently
steer a fresh session. With the checkpoint (EPC-06) as the canonical
evidence snapshot, recovery views can finally be deterministic
projections with D8 provenance, and the writers that made them shadow
authorities can be deleted rather than papered over.

## Goal

1. Phase A inventory (recorded in the contract + notes, file:line
   evidence): for each of the four views — every writer (including the
   TS Stop handler's `StopProjectionBatch` handoff/resume targets, the
   bash `workflow_write_handoff`, `codex-handoff-resume.sh`,
   `refresh-current-status.sh`, `prepare-codex-handoff.sh`, and any
   undeclared fifth writer found), every reader/consumer (session
   resume prompts, hooks, docs contracts), and every trigger. Reconcile
   with the frozen D9 verdicts; record confirmations/revisions with
   rationale in the contract before Phase B edits begin.
2. Phase B cutover per the reconciled verdicts:
   - One recovery materializer (`src/effects/evidence/recovery-materializer.ts`)
     renders the surviving handoff view and the merged resume view from
     the last-published checkpoint (via the EPC-06 reader, fail-closed)
     plus the minimal live workflow context a recovery view needs
     (active plan/contract identifiers and exact-next-step pointers) —
     each output carrying a D8 provenance block (nulls per the
     ratified not-applicable idiom; discriminate on schema, not
     nullness). Deterministic: same checkpoint + same workflow context
     ⇒ byte-identical views.
   - The Stop path keeps its frozen HRD shape (one projection batch,
     same target counts, one state resolution — the stop-handler suite
     must stay green unmodified unless an assertion characterizes the
     deleted assembly internals, in which case minimal updates are
     documented); internally the handoff/resume content now comes from
     the recovery materializer.
   - Retired writers deleted same-package: the bash
     `workflow_write_handoff` assembly (canonical `assets/hooks` source
     + `.ai/hooks` projection + digest), `codex-handoff-resume.sh`'s
     independent resume authoring, and `prepare-codex-handoff.sh`'s
     independent packet authoring — each either fully deleted or
     reduced to a thin invoker of the single materializer with zero
     independent content assembly (choice per view documented; a thin
     invoker keeps public command names stable where hosts call them,
     which is not a compatibility shim — the authority moves, the
     entrypoint stays).
   - `tasks/current.md`: existing `refresh-current-status.sh` is
     confirmed as the view's single materializer (tracked projection);
     add the projection-drift check (regenerate → byte-compare) to the
     test surface; no rewiring beyond what the inventory proves
     necessary.
3. Tests red-first: projection-drift (hand-edited handoff/resume is
   fully overwritten by the next materialization; regenerated
   tasks/current matches tracked content); no-independent-authoring
   (grep/behavioral: no writer of the surviving view files outside
   their single materializers); determinism; checkpoint-missing
   fail-degrade (no checkpoint ⇒ views render a typed minimal state,
   never fabricate evidence claims); Stop-path integration (counts
   unchanged).
4. All root required checks green; full `bun test` green; one
   independent PR on `codex/epc-07-recovery-view-cutover`.

## P1: Architecture Map

- Design authority: frozen D9 (verdict framework + preliminary
  verdicts), D8 (provenance), R5 (same-package deletion); EPC-06
  checkpoint reader is the canonical evidence source; EPC-01..05
  surfaces read-only.
- The recovery views are allowed to include non-evidence workflow
  context (active plan/contract, next step) — recovery is about where
  work stands, not only what was proven; but every evidence CLAIM in a
  view must trace to the checkpoint (no view may re-derive evidence
  from `checks/*` or the ledger directly — single hop:
  checkpoint → view).
- Mirrors: any curated/projected file touched follows the EPC-05
  precedent (canonical source + projection + digest; sync:hooks /
  sync:helpers; byte-identical proof).

## P2: Concrete Trace

EPC-06 merges -> `main` at `e5fb55e1` -> EPC-07 fresh-fetches, pins it
(R1) -> worktree opens on `codex/epc-07-recovery-view-cutover` -> Phase A
inventory lands in contract/notes with file:line evidence and reconciled
verdicts -> Phase B: recovery materializer + Stop internal swap + writer
deletions/reductions + tasks-current drift check -> red-first suites
green -> live dogfood: a real Stop in the worktree materializes
handoff/resume from the last checkpoint, readback shows provenance and
byte-determinism -> full suite green -> receipt via worktree scripts ->
one PR merges -> EPC-08 pins its base.

## P3: Design Decision

- Inventory-before-edit is mandatory sequencing, not ceremony: the
  Stop handler's TS projection batch and the bash writers overlap in
  unknown ways until cited; cutting blind would risk the HRD-frozen
  Stop surface.
- Thin-invoker reduction (where chosen) keeps host-facing command
  names while moving all content authority into the materializer —
  the authority cutover is real (independent assembly deleted), and
  no dual read/write path survives.
- Views may carry minimal live workflow context: a recovery packet
  that only restated evidence would not let a fresh session resume;
  the boundary is that evidence claims come from the checkpoint only.
- Checkpoint-missing renders a typed minimal state rather than
  failing the Stop path: recovery views must exist even before the
  first evidence lands; fabricating nothing, claiming nothing.

## Task Breakdown

- [x] Verify fresh fetch equals pinned base `e5fb55e1`; fill contract.
- [x] Phase A inventory with file:line evidence; reconcile D9 verdicts
      in the contract.
- [x] Recovery materializer (red-first) + Stop internal swap.
- [x] Writer deletions/reductions with mirrors + digests.
- [x] tasks/current drift check; projection-drift +
      no-independent-authoring suites.
- [ ] Required checks; live Stop dogfood readback; commit; receipt via
      worktree scripts; PR.
      (Required checks green, live dogfood passed, and the single commit
      landed on this branch; acceptance receipt and PR are the next
      orchestrator/gatekeeper step, not part of this execution dispatch.)

## Scope

- In scope: `src/effects/evidence/recovery-materializer.ts` (new);
  `src/cli/hook/stop-handler.ts` (internal content-source swap only);
  the four writers' files as the inventory verdicts require —
  `.ai/hooks/lib/workflow-state.sh` + `assets/hooks/lib/workflow-state.sh`
  + `.ai/hooks/.projection.json`, `scripts/codex-handoff-resume.sh`,
  `scripts/prepare-codex-handoff.sh`, `scripts/refresh-current-status.sh`
  (drift-check wiring only) and their `assets/templates/helpers/`
  mirrors; `tests/evidence-recovery-materializer.test.ts`; existing
  characterization files ONLY where they assert deleted assembly
  internals (each touched assertion documented); this package's
  plan/contract/review/notes; `tasks/todos.md` projection;
  `.ai/harness/worktrees/epc-07-recovery-view-cutover.json`.
- Out of scope: Context Packet / SessionStart (EPC-08); checks/latest
  materializer, verify producer, importers (EPC-02..05 surfaces);
  EPC-01 store/fold; EPC-06 checkpoint modules (consumed read-only);
  `tasks/current.md` content itself; the sprint document; any new npm
  dependency.
- Non-goals: redesigning view content beyond what materialization
  requires; retiring `post-bash-latest.json`; downstream helper
  deployment (EPC-09 release scope).

## Stop Conditions

- Stop if `origin/main` moves past `e5fb55e1` before worktree creation.
- Stop if the inventory finds a consumer whose cutover would require
  editing a surface outside this scope (e.g. SessionStart reader
  internals beyond a filename) — report for a scope ruling.
- Stop if the Stop handler cannot keep its frozen external semantics
  under the internal swap.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if a surviving recovery view cannot be rendered
deterministically from checkpoint + minimal workflow context (i.e. a
view genuinely needs an independent observation channel), or if
deleting the writers breaks a host entrypoint the inventory failed to
map. Cheapest proof: live Stop dogfood produces byte-deterministic
views whose evidence claims all resolve to the checkpoint, with the
full characterization suite green.

## Cheapest Sufficient Proof

- Fresh fetch equals `e5fb55e1` at pin time; contract records it.
- Phase A inventory recorded with file:line citations; verdicts
  reconciled in the contract before Phase B commits.
- Red-first suites green; full `bun test` green; root checks green.
- Live dogfood readback: handoff/resume materialized from the last
  checkpoint with provenance; hand-edits overwritten; drift check
  green for tasks/current.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Verify fresh fetch equals pinned base `e5fb55e1`; fill contract.
- [x] Phase A inventory with file:line evidence; reconcile D9 verdicts
- [x] Recovery materializer (red-first) + Stop internal swap.
- [x] Writer deletions/reductions with mirrors + digests.
- [x] tasks/current drift check; projection-drift +
- [ ] Required checks; live Stop dogfood readback; commit; receipt via
