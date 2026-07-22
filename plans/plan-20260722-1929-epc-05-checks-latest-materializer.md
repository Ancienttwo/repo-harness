# Plan: EPC-05: checks/latest Materializer and First Authority Cutover

> **Status**: Executing
> **Created**: 20260722-1929
> **Slug**: epc-05-checks-latest-materializer
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-05
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Red-first D7/D8 materializer fixtures; no-independent-authoring test proves no writer outside the materializer; hand-edited checks/latest is overwritten with provenance; the package's own acceptance flow runs end-to-end on materialized evidence; full bun test green with only deleted-mechanics characterization updates
> **Rollback Surface**: Revert the single PR: restores the direct cp authoring and {} bootstrap, removes the materializer and payload upgrade; consumers never changed so no consumer rollback needed
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md`
> **Task Review**: `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md`
> **Implementation Notes**: `tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-05
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-1929-epc-05-checks-latest-materializer.md`
- Sprint contract: `tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md`
- Sprint review: `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md`
- Implementation notes: `tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-1929-epc-05-checks-latest-materializer.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-1929-epc-05-checks-latest-materializer.md`.

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
- Contract file: `tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md`
- Review file: `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md`
- Implementation notes file: `tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-1929-epc-05-checks-latest-materializer.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: restores the direct cp authoring and {} bootstrap, removes the materializer and payload upgrade; consumers never changed so no consumer rollback needed
- **Verification boundary**: Red-first D7/D8 materializer fixtures; no-independent-authoring test proves no writer outside the materializer; hand-edited checks/latest is overwritten with provenance; the package's own acceptance flow runs end-to-end on materialized evidence; full bun test green with only deleted-mechanics characterization updates
- **Review/acceptance boundary**: `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-1929-epc-05-checks-latest-materializer.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-1929-epc-05-checks-latest-materializer.contract.md`, `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md`, and `tasks/notes/20260722-1929-epc-05-checks-latest-materializer.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-1929-epc-05-checks-latest-materializer.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: restores the direct cp authoring and {} bootstrap, removes the materializer and payload upgrade; consumers never changed so no consumer rollback needed

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-05 implements Sprint C backlog row 9: the `checks/latest` materializer
and the Program's first authority cutover. After this package,
`.ai/harness/checks/latest.json` is a deterministic materialization of the
evidence ledger via the frozen D7 selection predicate, carrying the frozen
D8 provenance block — and every direct authoring path is deleted in this
same package (R5): the `cp` at the end of `scripts/verify-sprint.sh`
(formerly line ~504) and the `{}` bootstrap in
`.ai/hooks/lib/workflow-state.sh`. A no-independent-authoring test proves
no other writer exists. Consumers (acceptance-receipt, prompt-handler,
merge-gate readers) keep reading the same file path and schema — the file's
*content authority* changes, not its consumer contract. Base SHA pinned per
R1 at fresh fetch: `822153362d008dc2f4418903711f85e9e8266207` (post-wave:
EPC-03 PR #119 + EPC-04 PR #120 + row flips).

## Why

`checks/latest` is today authored by whichever writer runs last — the
audit's core "shadow authority" finding. With EPC-01..04 merged, every
trust class now flows into the ledger (authoritative verify events,
observed PostBash, attested receipts), so the file can finally become what
D4 requires: a projection carrying no independent trust. Deleting the
direct authoring in the same package (R5) is what prevents a dual
authority from surviving the transition.

## Goal

1. `src/effects/evidence/checks-materializer.ts` (new): implements the
   frozen D7 selection predicate over the per-worktree ledger —
   worktree_id == current, contract_id == active contract, subject_hash
   exact equality, trust_class ∈ {authoritative_machine} plus
   `human_acceptance`/`external_attested` only where the active
   contract's Acceptance Policy enumerates them (D4), supersedes
   excluded, winner = highest append position (never mtime) — and
   renders `checks/latest.json` deterministically with the frozen D8
   provenance block (`schema_version`, `generated_at`,
   `materializer_version`, `source_event_ids`, `source_checkpoint_id`
   (null), `subject_hash`, `content_hash`, `worktree_id`,
   `contract_id`). No exact subject match ⇒ `status: "unsatisfied"`
   (fail closed; never a stale or different-subject event).
2. Verify-event payload upgrade (same-package, EPC-02 surface now owned
   here): the verify producer's event must carry everything the
   materialized checks file needs — the full finalized run-trace content
   moves into a content-addressed blob (D6 binary/overflow discipline)
   referenced from the event; small structured fields stay inline. The
   producer's construction invariants (subject binding, fail-closed
   classes, exit-code contract) are unchanged.
3. Cutover in `scripts/verify-sprint.sh` (+ mirror via sync:helpers):
   after emitting the authoritative event, the script invokes the
   materializer to produce `checks/latest.json` FROM the ledger; the
   direct `cp` authoring path is deleted in this package. The
   `--prepare-acceptance` freeze and finalize semantics (frozen
   review_subject binding, receipt pending→pass flow) must behave
   identically from every consumer's point of view.
4. Delete the `{}` bootstrap authoring of `checks/latest` in
   `.ai/hooks/lib/workflow-state.sh`; a missing file is now represented
   by the materializer's `unsatisfied` rendering or by genuine absence —
   consumers' existing missing-file handling governs, no new fallback.
5. No-independent-authoring test: a test that fails if any source file
   outside the materializer writes `checks/latest.json` (e.g. grep-based
   over `scripts/`, `src/`, `.ai/hooks/`, excluding the materializer
   module and its single call site), plus a behavior test proving a
   hand-edited `checks/latest.json` is fully overwritten by the next
   materialization and carries provenance for drift detection.
6. Acceptance-receipt compatibility: `acceptance-receipt record/verify`
   must still find the verification evidence it binds to
   (`verification_evidence_sha256` semantics preserved against the
   materialized file); the receipt flow's staleness invariant (record
   immediately after prepare, no commit between) is unchanged.
7. All characterization suites green (updated only where they asserted
   the deleted direct-authoring mechanics — the sanctioned semantic
   change of this row); full `bun test` green; one independent PR on
   `codex/epc-05-checks-latest-materializer`.

## P1: Architecture Map

- Design authority: frozen D4/D7/D8 (sprint Frozen decisions). The named
  deletion targets come from EPC-00's rows 5–13 confirmation: the
  verify-sprint `cp` and the workflow-state `{}` bootstrap.
- Owned surfaces this package: new materializer module; verify-producer
  payload upgrade; verify-sprint.sh + mirror; workflow-state.sh (the one
  bootstrap site); tests. EPC-01 store/fold stay read-only.
- Consumers NOT owned here (must stay green unmodified):
  `scripts/acceptance-receipt.ts` (reads checks file),
  `src/cli/hook/prompt-handler.ts`, `scripts/merge-gate.ts`,
  `scripts/verify-contract.sh`. If a consumer cannot stay green without
  modification, STOP and report (scope decision needed).
- EPC-04 residual note applies: the ledger, not the receipt file, is the
  authority the materializer consults for attested trust.

## P2: Concrete Trace

Wave merges (PR #119/#120) -> `main` at `82215336` -> EPC-05
fresh-fetches, pins it (R1) -> worktree opens on
`codex/epc-05-checks-latest-materializer` -> materializer + payload
upgrade + cutover land; direct authoring deleted same-package ->
no-independent-authoring and D7/D8 fixtures green red-first -> this
package's own acceptance run dogfoods the full cutover: prepare emits the
event, materializes checks/latest from the ledger, records the receipt
against materialized evidence, finalize re-materializes -> full suite
green -> receipt -> one PR merges -> EPC-06 pins its base per R1.

## P3: Design Decision

- The run-trace content rides a D6 blob rather than inflating inline
  payload: traces exceed the 8-KiB inline cap and contain long paths the
  redaction pass would mangle; a content-addressed blob preserves bytes
  exactly and the event stays small.
- The materialized file keeps the existing consumer-facing schema
  (`repo-harness-run-trace.v1` fields) with the D8 provenance block
  added — consumers keep working, drift becomes provable, and no
  consumer rewrite is smuggled into this row (EPC-07/08 own their own
  cutovers).
- `unsatisfied` rendering vs deleting the file on no-match: rendering a
  typed `unsatisfied` file preserves atomic-read semantics for existing
  consumers whose missing-file branches differ; both paths are
  fail-closed (no gate passes on `unsatisfied`).
- Characterization updates are confined to assertions about the deleted
  authoring mechanics; assertions about consumer-visible behavior stay
  untouched to prove the cutover is invisible to consumers.

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base `82215336`; fill contract.
- [ ] Materializer module (D7 predicate + D8 provenance, red-first).
- [ ] Verify-producer payload upgrade (blob-carried trace).
- [ ] verify-sprint.sh cutover + mirror; workflow-state.sh bootstrap
      deletion.
- [ ] No-independent-authoring + hand-edit-overwrite tests.
- [ ] Full-suite green incl. characterization updates; commit; receipt
      (dogfoods the cutover); PR.

## Scope

- In scope: `src/effects/evidence/checks-materializer.ts`,
  `src/effects/evidence/verify-producer.ts` (payload upgrade only),
  `scripts/emit-verify-evidence.ts` (if the payload upgrade needs new
  args), `scripts/verify-sprint.sh` + `assets/templates/helpers/verify-sprint.sh`,
  `.ai/hooks/lib/workflow-state.sh` (the `{}` bootstrap site only),
  `tests/evidence-checks-materializer.test.ts`, existing test files ONLY
  where they characterize the deleted authoring mechanics
  (`tests/helper-scripts.test.ts`, `tests/prompt-handler.test.ts`,
  `tests/acceptance-receipt.test.ts` — minimal assertions updates), this
  package's plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-05-checks-latest-materializer.json`.
- Out of scope: EPC-01 store/fold modules; `post-bash-importer.ts`;
  `attested-import.ts`; consumer logic in `acceptance-receipt.ts`,
  `prompt-handler.ts`, `merge-gate.ts`, `verify-contract.sh`;
  checkpoint/handoff/current writers (EPC-06/07); Context Packet
  (EPC-08); `tasks/current.md`; the sprint document; any new npm
  dependency.
- Non-goals: checkpoint materialization; recovery-view cutover; retiring
  `post-bash-latest.json`.

## Stop Conditions

- Stop if `origin/main` moves past `822153362d...` before worktree
  creation.
- Stop if a consumer (acceptance-receipt/prompt-handler/merge-gate/
  verify-contract) cannot stay green without modifying it — that is a
  scope decision for the orchestrator, not a silent widening.
- Stop if the receipt staleness invariant cannot be preserved (record
  immediately after prepare) under the materialized flow.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if materializing from the ledger cannot reproduce
a consumer-equivalent `checks/latest.json` (i.e. any consumer needs a
rewrite to stay green), or if deleting the direct authoring breaks the
frozen prepare/record/finalize acceptance flow. Cheapest proof: this
package's own acceptance flow completes end-to-end on the materialized
file, and the full characterization suite passes with only
deleted-mechanics assertions updated.

## Cheapest Sufficient Proof

- Fresh fetch equals `82215336` at pin time; contract records it.
- Red-first materializer suite green; no-independent-authoring test
  green; hand-edit-overwrite test green; full `bun test` green.
- Dogfood: the package's own acceptance evidence in
  `checks/latest.json` carries the D8 provenance block whose
  `source_event_ids` resolve to accepted ledger events.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`; the deleted
  `cp` and `{}` bootstrap no longer exist anywhere.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch equals pinned base `82215336`; fill contract.
- [ ] Materializer module (D7 predicate + D8 provenance, red-first).
- [ ] Verify-producer payload upgrade (blob-carried trace).
- [ ] verify-sprint.sh cutover + mirror; workflow-state.sh bootstrap
- [ ] No-independent-authoring + hand-edit-overwrite tests.
- [ ] Full-suite green incl. characterization updates; commit; receipt
