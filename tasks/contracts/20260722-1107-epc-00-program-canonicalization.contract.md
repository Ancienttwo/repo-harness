# Task Contract: epc-00-program-canonicalization

> **Status**: Active
> **Plan**: plans/plan-20260722-1107-epc-00-program-canonicalization.md
> **Task Profile**: docs-only
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `ba0e3970e733b34306a2c16cec31547483a2c648` (this is the Program's `POST_VGBR_SHA` pin, R1: pinned by the EPC-00 contract after VGBR-R merged — the VGBR-R PR #115 row-flip commit — fresh-fetch verified equal to `origin/main` and local `main` HEAD at pin time)
> **Target Branch**: main (via one independent docs-only PR)
> **Working Branch**: `codex/epc-00-program-canonicalization`
> **PR Unit**: one docs-only PR carrying the sprint design freeze plus this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-22 11:07
> **Review File**: `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md`
> **Notes File**: `tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

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
   contract (R1) after fresh-fetch verification.
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
   cannot-execute fallback (relabel the VGBR report `descriptive pre-EPC
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
  frozen decisions live there so EPC-01..09 contracts consume one source —
  this contract is not a second design authority.
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

## Scope

- In scope: this package's plan/contract/review/notes; the sprint document
  `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`;
  the worktree state file `.ai/harness/worktrees/epc-00-program-canonicalization.json`;
  `tasks/todos.md` only if the projection machinery rewrites it.
- Out of scope: all production `src/`, `scripts/`, `tests/`, `assets/`
  paths; `package.json`; `tasks/current.md`; `docs/researches/`; `evals/`;
  any LSC/HRD/SSD/BDD2/VGBR artifact beyond the sprint document itself; the
  known filename year typo in `docs/researches/20270721-EPC.research.md`
  (recorded, not fixed here); any EPC-01..09 implementation.
- Non-goals: implementing any part of the evidence ledger; re-verifying
  frozen predecessor semantics; renaming or re-scoping backlog rows beyond
  the two acceptance-line amendments; changing `tasks/current.md`.
- Taste constraints: apply the sprint-document edit package's five edits
  verbatim, de-indented to normal Markdown level — no paraphrase, no
  re-derivation; smallest diff that satisfies the freeze.

## Stop Conditions

- Stop and hand back to the parent if `origin/main` has moved past
  `ba0e3970e733b34306a2c16cec31547483a2c648` before this package's worktree
  was created — re-fetch and re-audit, never silently re-pin.
- Stop and hand back to the parent if a required edit falls outside this
  contract's exact `allowed_paths`.
- Stop if canonical tooling refuses or requires input this package cannot
  supply; report the exact error instead of hand-building a bypass.
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

## Concurrency and Ownership

- This package owns exactly the paths in `allowed_paths` below; it does not
  touch any other package's plan, contract, review, notes, or code surface,
  including the not-yet-opened EPC-01..09 worktrees and the closed
  `vgbr-rf`/`vgbr-r` worktrees.
- Per sprint R2 Layer 2, this package makes no benchmark-subject-touching
  change, so it holds no subject freeze and does not participate in one; the
  VGBR-R subject quiescence window (R3) already closed when PR #115 merged.
- If an out-of-band merge lands on `main` touching this package's
  `allowed_paths` — the sprint document above all — before this package's PR
  merges, stop, re-fetch, and re-derive the edit against the new state;
  never force-push over it.

## No-Compatibility Declaration

This package introduces no alias, dual read/write path, semantic fallback,
or steady-state migration shim. It does not retire or replace any existing
authority; it freezes design decisions that EPC-01..09 will each implement
as a one-shot cutover, retiring its own predecessor writer in the same
package (sprint R5). EPC-00 itself executes no code path and creates no
compatibility surface of its own.

## Workflow Inventory

- Source plan: `plans/plan-20260722-1107-epc-00-program-canonicalization.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md`
- Notes file: `tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one
  typed AcceptanceReceipt under the frozen policy below, then run
  `verify-sprint`; review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260722-1107-epc-00-program-canonicalization.md
  - tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md
  - tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md
  - tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md
  - plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md
  - .ai/harness/worktrees/epc-00-program-canonicalization.json
  - tasks/todos.md
```

## Forbidden Paths and Actions

```yaml
forbidden:
  paths:
    - src/
    - scripts/
    - tests/
    - assets/
    - package.json
    - tasks/current.md
    - docs/researches/
    - evals/
    - any EPC-01..09 implementation artifact
  flags:
    - any git --force flag
  actions:
    - push in this step (local commit only; no push, no PR open, no merge)
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Docs-only design freeze; consumes no benchmark subject.
  benchmark: not_required
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - plans/plan-20260722-1107-epc-00-program-canonicalization.md
    - tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md
    - tasks/reviews/20260722-1107-epc-00-program-canonicalization.review.md
    - tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md
  tests_pass:
  commands_succeed:
    - bash scripts/check-task-workflow.sh --strict
  manual_checks:
    - "Sprint document contains R1 pin, Program annotation, Row 4 frozen decisions D1-D9, amended rows 12/13, rows 5-13 confirmation"
    - "PR diff confined to allowed_paths"
    - "tasks/current.md untouched"
```

## Manual Acceptance

- Reviewer (`Claude`, per Acceptance Policy) confirms: the sprint document
  contains the R1 pin note, Program annotation, Row 4 frozen decisions
  D1–D9 with all sub-decisions closed, the amended row 12/13 acceptance
  lines, and the rows 5–13 confirmation, each matching the edit package
  verbatim; the PR diff is confined to `allowed_paths`; `tasks/current.md`
  is untouched; no production `src/`, `scripts/`, `tests/`, `assets/`, or
  `docs/researches/` path changed.

## Acceptance Notes (Human Review)

- Functional behavior: docs-only; no runtime, benchmark, or production
  behavior changes; freezes design decisions that EPC-01..09 will cite
  rather than re-decide.
- Edge cases: `origin/main` moving past the pinned base before this
  package's PR merges (see Concurrency and Ownership); D9's verdicts are
  explicitly preliminary pending EPC-07's own consumer inventory.
- Regression risks: none in this package (no code path executes); the risk
  surface is a later EPC-0N contract mis-citing a frozen D-decision, guarded
  by requiring exact citation (Falsifier).

## Rollback

Revert the single docs-only PR; no runtime, test, or production surface
changes; the sprint document returns to its pre-freeze state. Before any PR
opens, this package's local worktree commit can also be discarded outright
via `git worktree remove` (run from outside the worktree), with no effect on
the root checkout or `main`.
