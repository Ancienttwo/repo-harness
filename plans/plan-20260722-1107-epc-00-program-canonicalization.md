# Plan: EPC-00: Program Reconciliation and Design Freeze (Docs-Only)

> **Status**: Executing
> **Created**: 20260722-1107
> **Slug**: epc-00-program-canonicalization
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-00
> **Artifact Level**: work-package
> **Promotion Reason**: human_decision_boundary
> **Verification Boundary**: Docs-only design freeze: contract preflight, check-task-workflow --strict, and root required checks pass in the contract worktree; the PR diff is confined to allowed_paths; every rows-5-13 design term resolves to a frozen D-decision
> **Rollback Surface**: Revert the single docs-only PR; no runtime, test, or production surface changes; the sprint document returns to its pre-freeze state
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md`
> **Task Review**: `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md`
> **Implementation Notes**: `tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-00
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-1107-epc-00-program-canonicalization.md`
- Sprint contract: `tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md`
- Sprint review: `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md`
- Implementation notes: `tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-1107-epc-00-program-canonicalization.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-1107-epc-00-program-canonicalization.md`.

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
- Contract file: `tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md`
- Review file: `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md`
- Implementation notes file: `tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-1107-epc-00-program-canonicalization.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single docs-only PR; no runtime, test, or production surface changes; the sprint document returns to its pre-freeze state
- **Verification boundary**: Docs-only design freeze: contract preflight, check-task-workflow --strict, and root required checks pass in the contract worktree; the PR diff is confined to allowed_paths; every rows-5-13 design term resolves to a frozen D-decision
- **Review/acceptance boundary**: `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: human_decision_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-1107-epc-00-program-canonicalization.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md`, `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md`, and `tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single docs-only PR; no runtime, test, or production surface changes; the sprint document returns to its pre-freeze state

## Captured Planning Output

> **Task Profile**: docs-only

## Decision Summary

EPC-00 is the Program reconciliation and design-freeze package for Sprint C
(Evidence & Projection Convergence), backlog row 4. It is docs-only: it pins
`POST_VGBR_SHA = ba0e3970e733b34306a2c16cec31547483a2c648` (fresh fetch
verified equal to `origin/main` at pin time, the VGBR-R PR #115 row-flip
commit), freezes all nine design decisions D1–D9 with explicit choices and
rationale in the sprint Program document, records the finalized Program
annotation (original VGBR ordering gap, post-HRD recovery decision,
acknowledged BDD2 parallel change PR #109), confirms backlog rows 5–13
machine-operable (rows 5–11 as written; rows 12–13 minimally clarified), and
defines the EPC-08 Context Packet token/p95 acceptance numbers from the
audit's LOOP-12 targets. No production code, no `tasks/current.md`, no
LSC/HRD semantics are touched. Freezing these decisions is the activation
authorization for EPC-01.

## Why

Sprint C rows 5–13 (EPC-01..09) implement an EvidenceEvent ledger, trust
matrix, materializers, and recovery-view cutover. The sprint's Row 4 section
lists recommended defaults but leaves sub-decisions open (retention,
event-id scheme, payload caps, selection rule details, provenance fields,
view verdicts). Starting EPC-01 without freezing these would push design
authority into implementation packages, violating R6 and the Program's
no-dual-authority rule. EPC-00 closes every open sub-decision in the Program
document so each later row's contract can cite frozen decisions instead of
re-deciding them.

## Goal

1. Pin `POST_VGBR_SHA = ba0e3970e733b34306a2c16cec31547483a2c648` in this
   package's contract (R1) after fresh-fetch verification.
2. Freeze D1–D9 in the sprint Program document under Row 4 as
   "Frozen decisions (EPC-00, 2026-07-22)": confirm D1/D3/D4/D7/D8 defaults
   with closed sub-decisions; replace/concretize D2/D5/D6/D9.
3. Insert the finalized Program annotation (VGBR ordering gap, post-HRD
   recovery decision, acknowledged BDD2 parallel change) into the sprint
   document.
4. Replace backlog row 12's acceptance line with the machine-checkable
   EPC-08 token gate (27-state Authority×Profile panel, every sample
   `estimated_tokens <= 1500` with `within_budget == true`, panel
   `p95(estimated_tokens) <= 700`, method `utf8_bytes_div_4`).
5. Amend backlog row 13's acceptance line: residue scan runs against a
   checked-in retired-paths/symbols list (zero hits), and the
   cannot-execute fallback (relabel VGBR report `descriptive pre-EPC
   baseline only`, no benchmark-improvement claim) becomes a checked
   closeout assertion.
6. Record the rows 5–13 machine-operability confirmation and re-affirm the
   Row 13 matched post-eval decision in the sprint document.
7. Pass contract preflight, `check-task-workflow --strict`, and the root
   required checks; ship as one independent docs-only PR on branch
   `codex/epc-00-program-canonicalization`.

## P1: Architecture Map

- The sprint document `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`
  is the Program's normative authority (rules R1–R6, row protocols); the
  frozen decisions live there so EPC-01..09 contracts consume one source.
- ESA, LSC 8/8, HRD-01..09, `vgbr-rf`, and the VGBR-R baseline are frozen
  predecessor authorities; EPC-00 cites them and touches none of their
  surfaces.
- Current-state anchors grounding the freeze: `verify-sprint` writes
  `.ai/harness/checks/latest.json` (scripts/verify-sprint.sh:504); the
  PostBash importer writes `checks/post-bash-latest.json` with
  `source: "post-bash"` (src/cli/hook/command-observed.ts:220); four
  independent recovery-view writers exist (`workflow_write_handoff` in
  .ai/hooks/lib/workflow-state.sh:1771, scripts/codex-handoff-resume.sh:215,
  scripts/refresh-current-status.sh:391, scripts/prepare-codex-handoff.sh:139);
  the Context Packet budget is `SESSION_CONTEXT_TOKEN_BUDGET = 1500` with
  estimator `ceil(utf8_bytes/4)` (src/cli/hook/session-context-budget.ts:5,52);
  the p95 harness is scripts/hook-dispatch-diet-report.ts (percentile at
  :182, token SLO at :24). The repo's uniform hash algorithm is sha256.

## P2: Concrete Trace

VGBR-R report PR #115 merges -> `main` advances to `ba0e3970` (row-3 flip,
quiescence lifted) -> EPC-00 fresh-fetches `origin/main`, verifies it equals
local `main` HEAD at `ba0e3970`, and pins it as `POST_VGBR_SHA` in this
contract -> contract worktree opens on `codex/epc-00-program-canonicalization`
from that exact commit -> the sprint document receives: R1 pin note, Program
annotation, Row 4 frozen decisions, row 12/13 acceptance-line amendments,
rows 5–13 confirmation -> preflight + strict workflow check + root required
checks pass in the worktree -> review + acceptance receipt recorded
immediately after evidence (no intervening commit) -> one docs-only PR opens
and merges -> row 4 flips `[x]` -> EPC-01 fresh-fetches and pins its own
base per R1.

## P3: Design Decision

- The frozen decisions live in the sprint Program document, not a separate
  research file: the sprint already carries normative rules R1–R6 and row
  protocols, and later rows' contracts cite it; a second design doc would be
  a dual authority.
- D1/D3/D4/D7/D8 confirm the sprint defaults with sub-decisions closed;
  D2/D5/D6/D9 replace open defaults with concrete mechanics (successor-pinned
  epoch rule; ULID event-id + content-hash idempotency + append-position
  ordering; 200-line/8-KiB inline cap with sha256 blobs and
  deny-by-construction redaction; preliminary keep/merge/retire verdicts for
  the four recovery views). Full text and rationale are in the sprint edit
  this package ships.
- Rows 12 and 13 get minimal acceptance-line amendments (numbers and a
  defined residue-scan target) — clarifications, not scope changes; rows
  5–11 are confirmed as written.
- `ledger_epoch_start_sha` is deliberately a rule, not a literal: EPC-01's
  genesis record captures its own R1-pinned base SHA; EPC-00 cannot know it.

## Task Breakdown

- [ ] Verify fresh fetch: `origin/main == local main == ba0e3970`; pin
      `POST_VGBR_SHA` in the contract.
- [ ] Fill the contract from the template (docs-only profile, allowed
      paths, exit criteria, machine gates per R6).
- [ ] Apply the sprint-document edits: R1 pin, Program annotation, Row 4
      frozen decisions D1–D9, row 12/13 acceptance amendments, rows 5–13
      confirmation, Row 13 re-affirmation.
- [ ] Run contract preflight, `check-task-workflow --strict`, and root
      required checks in the worktree.
- [ ] Record notes; complete review; prepare acceptance evidence and record
      the receipt immediately (no commit in between).
- [ ] Open, merge the docs-only PR; flip row 4; refresh derived status.

## Scope

- In scope: this package's plan/contract/review/notes; the sprint document
  `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`;
  the worktree state file `.ai/harness/worktrees/epc-00-program-canonicalization.json`;
  `tasks/todos.md` only if the projection machinery rewrites it.
- Out of scope: all production `src/`, `scripts/`, `tests/`, `assets/`
  paths; `tasks/current.md`; any LSC/HRD/SSD/BDD2/VGBR artifact beyond the
  sprint document itself; `docs/researches/20270721-EPC.research.md`
  (including its known filename year typo — recorded, not fixed here); any
  EPC-01..09 implementation.
- Non-goals: implementing any part of the evidence ledger; re-verifying
  frozen predecessor semantics; renaming or re-scoping backlog rows beyond
  the two acceptance-line amendments; changing `tasks/current.md`.

## Stop Conditions

- Stop if `origin/main` moves past `ba0e3970` before the worktree is
  created — re-fetch and re-audit, never silently re-pin.
- Stop if any required edit falls outside the contract's `allowed_paths`.
- Stop if canonical tooling refuses or requires input this package cannot
  supply; report the exact error.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if freezing D1–D9 requires touching any production
code path, `tasks/current.md`, or LSC/HRD semantics, or if any later row
would still need to make a design decision EPC-00 claims to have frozen.
Cheapest proof: the PR diff touches only the allowed docs/workflow paths,
and each of rows 5–13's acceptance lines resolves every design term it uses
to a frozen D-decision by citation.

## Cheapest Sufficient Proof

- Fresh fetch shows `origin/main == ba0e3970` at pin time; contract records
  it as `POST_VGBR_SHA`.
- Sprint document contains: R1 pin note, Program annotation, Row 4 frozen
  decisions with all sub-decisions closed, amended rows 12/13, rows 5–13
  confirmation.
- `contract-run preflight --json` passes; `check-task-workflow --strict`
  passes; root required checks pass in the worktree.
- PR diff ⊆ `allowed_paths`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch: `origin/main == local main == ba0e3970`; pin
- [ ] Fill the contract from the template (docs-only profile, allowed
- [ ] Apply the sprint-document edits: R1 pin, Program annotation, Row 4
- [ ] Run contract preflight, `check-task-workflow --strict`, and root
- [ ] Record notes; complete review; prepare acceptance evidence and record
- [ ] Open, merge the docs-only PR; flip row 4; refresh derived status.
