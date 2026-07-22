# Plan: EPC-04: Manual/External Attested Import

> **Status**: Executing
> **Created**: 20260722-1810
> **Slug**: epc-04-manual-external-attested-import
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-04
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Red-first fixtures prove: closed trust mapping (external_pass->external_attested, user_waiver->human_acceptance, else fail closed), required trust/actor/reason/subject fields fail closed when absent, attested-only ledger yields empty authoritative filter (default-deny), idempotent re-import; dogfood: this package's own receipt appears as an accepted external_attested event; full bun test and root required checks green
> **Rollback Surface**: Revert the single PR: new import module + test suite plus one wiring edit in scripts/acceptance-receipt.ts; receipt JSON/projection flow and all other surfaces unchanged
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md`
> **Task Review**: `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md`
> **Implementation Notes**: `tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-04
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-1810-epc-04-manual-external-attested-import.md`
- Sprint contract: `tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md`
- Sprint review: `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md`
- Implementation notes: `tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-1810-epc-04-manual-external-attested-import.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-1810-epc-04-manual-external-attested-import.md`.

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
- Contract file: `tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md`
- Review file: `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md`
- Implementation notes file: `tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-1810-epc-04-manual-external-attested-import.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: new import module + test suite plus one wiring edit in scripts/acceptance-receipt.ts; receipt JSON/projection flow and all other surfaces unchanged
- **Verification boundary**: Red-first fixtures prove: closed trust mapping (external_pass->external_attested, user_waiver->human_acceptance, else fail closed), required trust/actor/reason/subject fields fail closed when absent, attested-only ledger yields empty authoritative filter (default-deny), idempotent re-import; dogfood: this package's own receipt appears as an accepted external_attested event; full bun test and root required checks green
- **Review/acceptance boundary**: `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-1810-epc-04-manual-external-attested-import.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-1810-epc-04-manual-external-attested-import.contract.md`, `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md`, and `tasks/notes/20260722-1810-epc-04-manual-external-attested-import.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-1810-epc-04-manual-external-attested-import.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: new import module + test suite plus one wiring edit in scripts/acceptance-receipt.ts; receipt JSON/projection flow and all other surfaces unchanged

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-04 implements Sprint C backlog row 8: manual/external attested import.
Recording an AcceptanceReceipt imports it into the EPC-01 ledger as an
attested event: disposition `external_pass` -> trust `external_attested`,
disposition `user_waiver` -> trust `human_acceptance` (D4). Attested events
require trust, actor, reason, and subject fields; malformed imports fail
closed. `external_attested` satisfies gates only where the active
contract's Acceptance Policy explicitly enumerates it (D4 default-deny) —
this package proves the property with fold-level fixtures; the actual gate
selection ships in EPC-05. Runs as a two-package parallel wave with EPC-03
under R4 (jointly proven disjointness; see Concurrency). Base SHA pinned
per R1 at fresh fetch: `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` (post-EPC-02 merge).

## Why

The acceptance flow is the Program's only legitimate source of
human/external trust. Today the receipt is a standalone JSON plus a
Markdown projection; nothing ties it into the evidence authority rows
9–12 will select from. Importing at record time — with the receipt's own
subject binding — makes attested trust a first-class ledger fact instead
of a parallel shadow authority.

## Goal

1. `src/effects/evidence/attested-import.ts`: imports one recorded
   receipt as ONE attested event via the EPC-01 writer, genesis via
   `LEDGER_EPOCH_START_SHA` (EPC-02 epoch constant, read-only import).
   - Trust mapping is closed: `external_pass` -> `external_attested`;
     `user_waiver` -> `human_acceptance`; any other disposition -> fail
     closed. No API path emits `authoritative_machine` or `observed`.
   - Required fields, fail-closed if absent/empty: trust (from the
     mapping), actor (receipt reviewer; plus `actor` field when present),
     reason (receipt summary), and the full D3 subject identity taken
     from the receipt's own binding (`subject_sha256` ->
     `subject_hash`, `target_revision` -> `base_commit`, worktree HEAD ->
     `target_commit`, contract file hash -> `contract_hash`, ordered
     `allowed_paths` -> `scope_hash`, last commit touching the contract ->
     `authority_commit`, recording host identity -> `env_provider_id`).
   - Payload: structured (disposition, reviewer, source, summary,
     findings count, receipt hash reference) — no long free text inline.
2. Wire `scripts/acceptance-receipt.ts`: at the end of a successful
   `record`, import the just-recorded receipt into the ledger; import
   failure fails the record command (fail closed — an acceptance that
   cannot enter the evidence authority must not report success).
3. `tests/evidence-attested-import.test.ts` fixtures prove: `external_pass`
   maps to `external_attested` and `user_waiver` to `human_acceptance`;
   missing actor or reason or subject fields fail closed (nothing
   appended); unknown disposition fails closed; the accepted fold shows
   attested events are NOT `authoritative_machine` (filtering for
   authoritative over an attested-only ledger returns empty — default-
   deny holds at the trust level); re-import of the identical receipt
   dedups via idempotency key.
4. All root required checks green; one independent PR on
   `codex/epc-04-manual-external-attested-import`.

## P1: Architecture Map

- Design authority: frozen D2–D6; EPC-01 store API and EPC-02 epoch
  constant are read-only imports; no EPC-01/EPC-02 file modified.
- Wiring surface: `scripts/acceptance-receipt.ts` only — disjoint from
  EPC-03's `src/cli/hook/command-observed.ts` (R4 wave layer-1 proof).
- The receipt JSON/projection flow itself is unchanged (its cutover, if
  any, belongs to later rows); import is additive at record time.
- Where a contract's Acceptance Policy enumerates `external_attested`,
  EPC-05's selection will admit it; this package only guarantees the
  trust labeling and the default-deny property at fold level.

## P2: Concrete Trace

EPC-02 merges -> EPC-04 fresh-fetches, pins `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` (R1)
-> worktree opens on `codex/epc-04-manual-external-attested-import` in
parallel with EPC-03's disjoint worktree -> import module + wiring +
tests land -> this package's own acceptance run dogfoods the path: its
`acceptance-receipt record` call imports its own receipt as an
`external_attested` event -> required checks green -> PR merges (wave PRs
merge serially in backlog order) -> EPC-05 pins its base after both wave
rows merge.

## P3: Design Decision

- Import at record time (inside `acceptance-receipt.ts record`) rather
  than a separate import command: a separate command a caller may skip
  would be exactly the skippable-sanitize anti-pattern D6 forbids for the
  writer; binding import to record makes attested trust
  by-construction.
- Record fails closed on import failure: a receipt that exists outside
  the ledger would be a new shadow authority — the precise thing this
  sprint deletes elsewhere.
- Subject identity comes from the receipt's own binding, not recomputed
  fresh: the receipt already froze subject/target at record time; a
  fresh recompute could silently diverge from what the reviewer
  accepted.
- Trust mapping is a closed two-entry table: any future disposition must
  arrive with its own approved package, not a default branch.

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base; fill contract (R4 wave
      disjointness proof section shared verbatim with EPC-03).
- [ ] `attested-import.ts` (closed trust mapping, required-field
      fail-closed).
- [ ] Wire `acceptance-receipt.ts` record path (fail-closed).
- [ ] Tests red-first for every Goal-3 fixture.
- [ ] Required checks; commit; receipt (dogfoods the new path); PR.

## Scope

- In scope: `src/effects/evidence/attested-import.ts`,
  `scripts/acceptance-receipt.ts` (wiring edit only),
  `tests/evidence-attested-import.test.ts`, this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-04-manual-external-attested-import.json`.
- Out of scope: every EPC-01/EPC-02 file, `src/cli/hook/command-observed.ts`
  (EPC-03's surface), `verify-sprint.sh`, `checks/latest` composition,
  gate selection logic (EPC-05), handoff writers, `tasks/current.md`,
  the sprint document, any new npm dependency.
- Non-goals: gate cutover; receipt schema changes; retiring the receipt
  JSON or its Markdown projection.

## Stop Conditions

- Stop if `origin/main` moves past the pinned base before worktree
  creation.
- Stop if wiring would require modifying an EPC-01/02 module or touching
  EPC-03's surface — report, never widen.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if the receipt's existing binding cannot populate
the D3 identity without schema changes, or if record-time import breaks
the receipt flow's staleness invariant (record must still immediately
follow evidence preparation). Cheapest proof: this package's own
acceptance flow records its receipt successfully AND the worktree ledger
then contains exactly one accepted `external_attested` event referencing
that receipt.

## Cheapest Sufficient Proof

- Fresh fetch equals pinned base at pin time; contract records it.
- New suite green red-first; full `bun test` green; root checks green.
- Dogfood: this package's own receipt appears as an accepted
  `external_attested` event in the worktree ledger.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`; zero overlap
  with EPC-03's `allowed_paths`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch equals pinned base; fill contract (R4 wave
- [ ] `attested-import.ts` (closed trust mapping, required-field
- [ ] Wire `acceptance-receipt.ts` record path (fail-closed).
- [ ] Tests red-first for every Goal-3 fixture.
- [ ] Required checks; commit; receipt (dogfoods the new path); PR.
