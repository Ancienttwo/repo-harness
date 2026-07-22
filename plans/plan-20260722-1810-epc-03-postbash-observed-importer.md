# Plan: EPC-03: PostBash Observed Importer

> **Status**: Executing
> **Created**: 20260722-1810
> **Slug**: epc-03-postbash-observed-importer
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-03
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Red-first fixtures prove: observed trust class only, observed-only ledger leaves machine gates unsatisfied (authoritative filter empty), malformed input fails closed, idempotent re-import, unbound vs bound contract fields; full bun test and root required checks green
> **Rollback Surface**: Revert the single PR: new importer module + test suite plus one wiring edit in src/cli/hook/command-observed.ts; post-bash-latest.json writer and all other surfaces unchanged
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md`
> **Task Review**: `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md`
> **Implementation Notes**: `tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-03
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-1810-epc-03-postbash-observed-importer.md`
- Sprint contract: `tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md`
- Sprint review: `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md`
- Implementation notes: `tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-1810-epc-03-postbash-observed-importer.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-1810-epc-03-postbash-observed-importer.md`.

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
- Contract file: `tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md`
- Review file: `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md`
- Implementation notes file: `tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-1810-epc-03-postbash-observed-importer.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: new importer module + test suite plus one wiring edit in src/cli/hook/command-observed.ts; post-bash-latest.json writer and all other surfaces unchanged
- **Verification boundary**: Red-first fixtures prove: observed trust class only, observed-only ledger leaves machine gates unsatisfied (authoritative filter empty), malformed input fails closed, idempotent re-import, unbound vs bound contract fields; full bun test and root required checks green
- **Review/acceptance boundary**: `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-1810-epc-03-postbash-observed-importer.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-1810-epc-03-postbash-observed-importer.contract.md`, `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md`, and `tasks/notes/20260722-1810-epc-03-postbash-observed-importer.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-1810-epc-03-postbash-observed-importer.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: new importer module + test suite plus one wiring edit in src/cli/hook/command-observed.ts; post-bash-latest.json writer and all other surfaces unchanged

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-03 implements Sprint C backlog row 7: the PostBash observed importer.
PostBash command observations are imported into the EPC-01 ledger as
`observed` trust-class events only; an observed-only ledger provably leaves
machine gates unsatisfied (D4). Emission is additive: the existing
`checks/post-bash-latest.json` write is untouched (pre-epoch legacy surface
per D2; no cutover assigned to this row). This package runs as a two-package
parallel wave with EPC-04 under R4: their contracts jointly prove frozen
schema/trust/idempotency (EPC-00 freeze + merged EPC-01/02), exactly
disjoint `allowed_paths`, disjoint test fixtures, no shared barrel, no
shared store writer, no shared projection writer. Base SHA pinned per R1 at
fresh fetch: `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` (post-EPC-02 merge).

## Why

The trust matrix (D4) is only meaningful if the `observed` class exists in
practice: rows 9–12 must demonstrate that ubiquitous low-trust telemetry
(every Bash command) flows into the same ledger yet can never satisfy a
gate. Importing PostBash observations now — while gates still read
`checks/latest` — proves the trust boundary with fixtures before any
cutover depends on it.

## Goal

1. `src/effects/evidence/post-bash-importer.ts`: imports one PostBash
   observation as ONE `observed` event via the EPC-01 writer, genesis via
   `LEDGER_EPOCH_START_SHA` (EPC-02's epoch constant, imported read-only).
   - Trust class is hard-coded `observed`; the module exposes no way to
     emit any other class.
   - Subject identity: computed from repo state where available
     (`base_commit`, `target_commit`); contract-derived fields
     (`authority_commit`, `scope_hash`, `contract_hash`) use the active
     contract when one exists and is committed-clean, else the literal
     sentinel `unbound`. The sentinel is legal ONLY for `observed` events
     (importer-level restriction documented in the module); `observed`
     never satisfies gates, so unbound identity is safe by construction.
   - Payload: structured summary only (command hash, exit code, duration,
     repo-relative raw-output path reference) — no raw output bytes
     inline (EPC-01 redaction/cap discipline).
2. Wire `src/cli/hook/command-observed.ts`: after the existing
   `post-bash-latest.json` write, import the same observation into the
   ledger. Failure semantics MATCH the existing post-bash write path's
   failure behavior exactly (no new fallback, no new severity) — document
   the observed existing behavior in notes.
3. `tests/evidence-post-bash-importer.test.ts` fixtures prove: import
   yields `observed` trust class with the D3 field set (sentinel rules
   honored); an observed-only ledger leaves machine gates unsatisfied —
   filtering the accepted fold for `authoritative_machine` returns empty;
   malformed observation input fails closed (nothing appended); repeat
   import of the identical observation dedups via idempotency key;
   unclean/absent contract produces `unbound` contract fields while a
   clean committed contract produces bound ones.
4. All root required checks green; one independent PR on
   `codex/epc-03-postbash-observed-importer`.

## P1: Architecture Map

- Design authority: frozen D2–D6; EPC-01 store API and EPC-02 epoch
  constant are read-only imports; no EPC-01/EPC-02 file may be modified.
- Wiring surface: `src/cli/hook/command-observed.ts` only — disjoint from
  EPC-04's `scripts/acceptance-receipt.ts` (R4 wave layer-1 proof).
- `checks/post-bash-latest.json` writer stays: it is pre-epoch legacy
  (D2), not a projection this row retires; the EPC-09 residue scan
  targets only EPC-05/07/08 deletions.

## P2: Concrete Trace

EPC-02 merges -> `main` advances (row-6 flip) -> EPC-03 fresh-fetches,
pins `8861b40dd85c0f7faabe8eecd217baf5528a7f3c` (R1) -> worktree opens on
`codex/epc-03-postbash-observed-importer` in parallel with EPC-04's
disjoint worktree -> importer + wiring + tests land -> fixtures prove the
observed-only-gates-unsatisfied property -> required checks green ->
receipt -> one PR merges (wave PRs merge serially in backlog order) ->
EPC-05 pins its base per R1 after both wave rows merge.

## P3: Design Decision

- `unbound` sentinel instead of refusing emission when no clean contract
  exists: PostBash telemetry must not vanish outside contract execution;
  refusing would silently drop the observation (a availability fallback in
  disguise). The sentinel is honest labeling, restricted to `observed`,
  and gates can never accept it (D4). The verify producer (EPC-02) keeps
  its stricter committed-authority rule — the two rules are per-trust-
  class by design, not a contradiction.
- Failure semantics mirror the existing post-bash write path rather than
  inventing stricter ones: this hook runs in every session; a new
  hard-fail would couple session stability to a telemetry surface without
  a row mandating it.
- One event per observation (no batching): append-position ordering is
  the total order; batching would create artificial ordering ties.

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base; fill contract (with R4 wave
      disjointness proof section shared verbatim with EPC-04).
- [ ] `post-bash-importer.ts` (observed-only, sentinel rules).
- [ ] Wire `command-observed.ts` (matching failure semantics).
- [ ] Tests red-first for every Goal-3 fixture.
- [ ] Required checks; commit; receipt; PR.

## Scope

- In scope: `src/effects/evidence/post-bash-importer.ts`,
  `src/cli/hook/command-observed.ts` (wiring edit only),
  `tests/evidence-post-bash-importer.test.ts`, this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-03-postbash-observed-importer.json`.
- Out of scope: every EPC-01/EPC-02 file, `scripts/acceptance-receipt.ts`
  (EPC-04's surface), `checks/latest` or `post-bash-latest` composition,
  any gate logic, handoff writers, `tasks/current.md`, the sprint
  document, any new npm dependency.
- Non-goals: retiring `post-bash-latest.json`; subject-strict binding for
  observed events; gate cutover.

## Stop Conditions

- Stop if `origin/main` moves past the pinned base before worktree
  creation.
- Stop if wiring would require modifying an EPC-01/02 module or touching
  EPC-04's surface — report, never widen.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if observed import cannot reuse the EPC-01 writer
without schema changes, or if the observed-only-unsatisfied fixture
cannot be expressed with the existing fold primitives. Cheapest proof:
the fixture filtering accepted events for `authoritative_machine` over an
observed-only ledger returns empty, and the full suite stays green.

## Cheapest Sufficient Proof

- Fresh fetch equals pinned base at pin time; contract records it.
- New suite green red-first; full `bun test` green; root checks green.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`; zero overlap
  with EPC-04's `allowed_paths`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch equals pinned base; fill contract (with R4 wave
- [ ] `post-bash-importer.ts` (observed-only, sentinel rules).
- [ ] Wire `command-observed.ts` (matching failure semantics).
- [ ] Tests red-first for every Goal-3 fixture.
- [ ] Required checks; commit; receipt; PR.
