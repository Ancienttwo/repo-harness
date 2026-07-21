# Plan: VGBR-R: Authoritative Baseline Recovery (Eval-Only)

> **Status**: Approved
> **Created**: 20260722-0020
> **Slug**: vgbr-post-hrd-baseline-recovery
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: One authoritative 3x9 (27-arm) profile benchmark invocation executed exactly once inside a detached clean subject checkout pinned at VGBR_BASELINE_SHA; validate-harness-profile-benchmark.ts --require-authoritative and tests/harness-benchmark-matrix.test.ts both pass before promotion into evals/harness/reports/*.
> **Rollback Surface**: Phase 1: revert only this package's local orchestration-worktree commits (never pushed) or remove the worktree; delete the ephemeral detached subject checkout and REPORT_STAGE_DIR (no git history). Phase 2: revert only the VGBR-R report PR; runtime, tests, and the benchmark runner/manifest remain unchanged.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md`
> **Task Review**: `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md`
> **Implementation Notes**: `tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md`
- Sprint contract: `tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md`
- Sprint review: `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md`
- Implementation notes: `tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md`.

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
- Contract file: `tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md`
- Review file: `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md`
- Implementation notes file: `tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Phase 1: revert only this package's local orchestration-worktree commits (never pushed) or remove the worktree; delete the ephemeral detached subject checkout and REPORT_STAGE_DIR (no git history). Phase 2: revert only the VGBR-R report PR; runtime, tests, and the benchmark runner/manifest remain unchanged.
- **Verification boundary**: One authoritative 3x9 (27-arm) profile benchmark invocation executed exactly once inside a detached clean subject checkout pinned at VGBR_BASELINE_SHA; validate-harness-profile-benchmark.ts --require-authoritative and tests/harness-benchmark-matrix.test.ts both pass before promotion into evals/harness/reports/*.
- **Review/acceptance boundary**: `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md`, `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md`, and `tasks/notes/20260722-0020-vgbr-post-hrd-baseline-recovery.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Phase 1: revert only this package's local orchestration-worktree commits (never pushed) or remove the worktree; delete the ephemeral detached subject checkout and REPORT_STAGE_DIR (no git history). Phase 2: revert only the VGBR-R report PR; runtime, tests, and the benchmark runner/manifest remain unchanged.

## Captured Planning Output

> **Task Profile**: eval-only

## Decision Summary

Recover one precise, current, verifiable authoritative benchmark baseline —
the runner-defined 3x9 (27-arm) matrix — at the exact commit
`VGBR_BASELINE_SHA` = `0852e9ab72f19b3794d5b8f9463a172e498686c7`, before EPC
begins. This package executes in two phases under separate authorization.
Phase 1 (this capture) opens the dual-checkout execution surface: orchestration
worktree, contract, detached subject checkout, report staging directory, and
attempt record. Phase 2 (separate authorization) runs the single authoritative
invocation, validates it, and promotes the report. Neither phase predicts or
writes its own merge SHA; the next Program package (EPC-00) fresh-fetches
`origin/main` after this package's report PR merges and pins that exact commit
as `POST_VGBR_SHA`.

## Why

`origin/main` has moved twice since the Hook Runtime Diet close-out
(`HRD_RUNTIME_SHA` = `b5a98c903d3728002d2f663ba7a1b421913e368f`): the
HRD-CLOSEOUT lifecycle merge, and the acknowledged parallel BDD2 followthrough
PR #109 (merge `9e9dce6e1f817b766d21436c0b69477f6c67ca20`), which touches
`src/cli` and `assets` — both benchmark subject inputs. `origin/main` has since
advanced again to `0852e9ab72f19b3794d5b8f9463a172e498686c7`. EPC cannot begin
against a stale or ambiguous benchmark baseline: the existing report at
`606b02c1...` is historical evidence only and satisfies nothing against the
current subject. Shipping wrong here means EPC-00..09 either inherit a
baseline that silently omits BDD2's subject-touching changes, or the Program
mislabels the recovered baseline as "pure post-HRD" when it is not. This
package's mandatory annotation is: the recovered baseline is the **current
pre-EPC baseline after HRD and acknowledged parallel changes (BDD2 PR #109)**
— it must never be described as a pure post-HRD baseline, in this plan, its
contract, its notes, or the eventual report.

## Goal

Phase 1 (this capture, executed now):

1. Author this work-package plan and its task contract carrying the full
   Program Rule R6 field set, projected from the sprint's Row 2 VGBR-R
   protocol.
2. Open the orchestration worktree `codex/vgbr-post-hrd-baseline-recovery`
   from the pinned `VGBR_BASELINE_SHA`, owning plan/contract/review/notes,
   the Program dependency annotation, the attempt record, and (later, Phase 2
   only) the three canonical report artifacts.
3. Create a detached, read-only subject checkout at exactly
   `VGBR_BASELINE_SHA`, outside both the root checkout and the orchestration
   worktree, and compute `EXPECTED_SUBJECT_HASH` — a reproducible content hash
   over exactly the benchmark subject inputs — from that checkout.
4. Create an empty `REPORT_STAGE_DIR` outside the subject checkout.
5. Write one attempt record before any invocation, with `outcome` null.
6. Pass contract preflight and the strict task-workflow gate.
7. Commit plan/contract/notes/attempt-record locally in the orchestration
   worktree. No push, no PR, no benchmark invocation in this phase.

Phase 2 (separate authorization, not executed by this capture):

1. Run the exactly-once authoritative invocation in the detached subject
   checkout.
2. Validate the report and the matrix test in the same checkout.
3. Copy validated artifacts into the orchestration worktree's canonical
   report paths and re-check byte binding there.
4. Record the attempt outcome, finish the contract worktree, open and merge
   the report PR carrying the mandatory pre-EPC-after-HRD-and-BDD2 annotation.

## P1: Architecture Map

- Effective State, Loop Semantics, and Hook Runtime Diet are frozen
  predecessor authorities; this package does not touch their surfaces.
- This package owns exactly one Program slice: authoritative baseline
  recovery. EPC-00..09 and SSD remain no-touch and unblocked by this
  package's existence, but `main` is frozen for benchmark-subject-touching
  PRs from the moment `VGBR_BASELINE_SHA` is pinned until the report PR
  merges (R3).
- Parallel programs (BDD2 or any other) may continue development in their
  own worktrees during the freeze but must not merge into `main` until this
  package's report PR lands.
- The runner, its manifest (`evals/harness/scenarios.json`), its fixture seed
  (`evals/fixtures/harness-matrix`), and the validator are frozen inputs for
  this package; none of them may be edited here.

## P2: Concrete Trace

`origin/main@0852e9ab` (fresh fetch, verified equal to local `main` HEAD) -->
this package pins it as `VGBR_BASELINE_SHA` and `EXPECTED_BASE_SHA` --> the
orchestration worktree `codex/vgbr-post-hrd-baseline-recovery` branches from
that exact commit --> a detached subject checkout at the same commit is
created outside both checkouts --> `EXPECTED_SUBJECT_HASH` is computed from
that checkout over exactly the benchmark subject inputs --> the attempt
record freezes `ATTEMPT_ID`, `EXPECTED_SUBJECT_SHA`, `EXPECTED_SUBJECT_HASH`,
`command_sha256`, `provider`, `provider_cli_version`, `outcome: null` -->
contract preflight and the strict workflow gate pass --> Phase 1 commits land
locally --> (separate authorization) Phase 2 runs the exactly-once
invocation in the detached checkout --> validator and matrix test pass -->
artifacts promote into the orchestration worktree's canonical report paths
--> the report PR merges into `main` carrying the mandatory annotation -->
EPC-00 fresh-fetches `origin/main` and pins `POST_VGBR_SHA`.

## P3: Design Decision

- Dual-checkout structure is mandatory (sprint Row 2): a single worktree
  cannot simultaneously hold uncommitted plan/contract files and present a
  clean checkout at the pinned SHA for the benchmark subject.
- `EXPECTED_SUBJECT_HASH` is computed as a git-blob-identity hash over exactly
  the benchmark subject inputs (`package.json`, `src/cli`, `assets`,
  `scripts/run-harness-profile-benchmark.ts`,
  `scripts/validate-harness-profile-benchmark.ts`,
  `evals/harness/scenarios.json`, `evals/fixtures/harness-matrix`) via
  `git ls-tree -r <sha> -- <paths> | sort | shasum -a 256`, independent of and
  in addition to the runner's own internal evidence hashes
  (`runner_sha256`/`scenario_manifest_sha256`/`fixture_set_sha256`/
  `install_profile_inputs_sha256`), so the frozen subject's integrity can be
  reverified between Phase 1 setup and Phase 2 invocation without rerunning
  anything.
- No compatibility, alias, dual authority, or steady-state shim: this
  package neither retires nor replaces anything; it only recovers evidence.
- The profile-base naming is fixed by the current runner
  (`no-harness` / `adaptive-lite` / `strict-harness`, `adaptive-lite`
  deploying the standard profile); this package restores that runner-defined
  baseline and does not redesign it. A four-arm Lite/Standard/Strict redesign
  is explicitly out of scope and would be a separate approved package.

## Scope

In scope:

- This package's own plan, contract, review, and notes files.
- The orchestration worktree's attempt record under
  `.ai/harness/runs/vgbr-r/`.
- (Phase 2 only) the three canonical report artifacts
  `evals/harness/reports/profile-comparison.{json,md,sha256.json}` and the
  Program dependency annotation recording the recovered baseline.

Out of scope:

- `scripts/run-harness-profile-benchmark.ts`,
  `scripts/validate-harness-profile-benchmark.ts`, the benchmark manifest,
  fixtures, and matrix test — frozen inputs, read-only.
- Any production `src/` path, any LSC/HRD/SSD artifact, any BDD2 artifact.
- Running the benchmark itself, or any `--profile`/`--scenario`/
  `--regrade-existing` flag, in Phase 1.
- A four-arm Lite/Standard/Strict benchmark redesign.
- Re-litigating the original VGBR ordering gap beyond the one annotation
  this package's Program dependency edit records.
- Push, PR open, or merge — Phase 1 ends with local commits only.

## Falsifier

The direction is wrong if recovering the baseline requires editing the
runner, manifest, fixtures, validator, or any production `src/` path, or if
the recovered baseline could be described as a pure post-HRD baseline without
the acknowledged BDD2 parallel-change annotation. Cheapest proof: diff the
detached subject checkout against `VGBR_BASELINE_SHA` after Phase 1 setup and
confirm it is byte-identical and untouched (`git status --porcelain` empty,
`git rev-parse HEAD` unchanged), and confirm the Program annotation text
contains the exact phrase "current pre-EPC baseline after HRD and
acknowledged parallel changes (BDD2 PR #109)" and never the phrase "pure
post-HRD".

## Cheapest Sufficient Proof

- `origin/main` fresh fetch equals local `main` HEAD equals
  `VGBR_BASELINE_SHA` at start.
- Orchestration worktree branch is exactly
  `codex/vgbr-post-hrd-baseline-recovery`, base commit exactly
  `VGBR_BASELINE_SHA`.
- Detached subject checkout: `git status --porcelain` empty, `git rev-parse
  HEAD` equals `VGBR_BASELINE_SHA`, no writes performed inside it.
- `REPORT_STAGE_DIR` exists and is empty.
- Attempt record exists with `outcome: null` and all seven Row-2 fields
  (`ATTEMPT_ID`, `EXPECTED_SUBJECT_SHA`, `EXPECTED_SUBJECT_HASH`,
  `started_at: null`, `command_sha256`, `provider`, `provider_cli_version`)
  populated per the sprint (the sprint's field list is authoritative over
  any narrower paraphrase).
- Contract preflight (`contract-run preflight --json`) and
  `check-task-workflow --strict` both pass.
- Every changed path in the Phase 1 commit is inside this contract's
  `allowed_paths`.

## Concurrency and Ownership

- This package owns exactly the paths listed in its contract's
  `allowed_paths`; it does not touch any other package's plan, contract,
  review, notes, or code surface.
- From the moment `VGBR_BASELINE_SHA` is pinned until this package's report
  PR merges, `main` is frozen for any PR touching the benchmark subject
  inputs (sprint R2/R3). Parallel programs may continue in their own
  worktrees but must not merge inside this window.
- If an out-of-band merge lands on `main` touching the benchmark subject
  during the freeze, the attempt is void: stop, re-audit, re-pin — never
  rebase silently and never reuse the stale attempt record.
- Stop if either the orchestration worktree or the detached subject checkout
  requires a file owned by another active package.

## Stop Conditions

- Stop and hand back to the parent if a required edit falls outside this
  contract's exact `allowed_paths`.
- Stop if `origin/main` has moved since the pinned `VGBR_BASELINE_SHA` before
  the orchestration worktree or subject checkout are created — re-fetch and
  re-audit, never silently rebase.
- Stop if the canonical tooling (`capture-plan`, `plan-to-todo`,
  `contract-worktree`) refuses or requires input this package cannot supply;
  report the exact error instead of hand-building a bypass.
- Stop if any Phase-1 step would require running the benchmark runner or
  validator, or passing `--profile`/`--scenario`/`--regrade-existing`.
- Stop after three fail-fix-reverify rounds for one preflight issue.

## Rollback

Phase 1 produces only local, unpushed commits in the orchestration worktree
plus two ephemeral sibling directories (the detached subject checkout and the
report staging directory) that carry no git history of their own. Rollback:
delete the orchestration worktree's local commits (`git reset` inside that
worktree only, never the root checkout) or discard the worktree entirely with
`git worktree remove`; remove the detached subject checkout with `git
worktree remove --force` (safe: it is read-only and clean by construction);
delete the empty `REPORT_STAGE_DIR`. The root checkout is untouched throughout
Phase 1 and requires no rollback action.

## Approved Execution Checklist

- [ ] Fresh-fetch `origin/main` and verify it equals `VGBR_BASELINE_SHA`
      (`0852e9ab72f19b3794d5b8f9463a172e498686c7`); stop and report if not.
- [ ] Capture this work-package plan (`Artifact Level: work-package`,
      `Promotion Reason: verification_boundary`).
- [ ] Open the orchestration worktree on branch
      `codex/vgbr-post-hrd-baseline-recovery` from the pinned SHA via the
      repo's canonical `plan-to-todo` / `contract-worktree start` tooling.
- [ ] Create the detached subject checkout at exactly `VGBR_BASELINE_SHA`
      outside both checkouts; verify clean and pinned; compute
      `EXPECTED_SUBJECT_HASH`.
- [ ] Create the empty `REPORT_STAGE_DIR` outside the subject checkout.
- [ ] Author the task contract in the orchestration worktree with the full
      Program Rule R6 field set, embedding the frozen machine acceptance
      rubric verbatim.
- [ ] Write the attempt record (`outcome: null`, `started_at: null`) in the
      orchestration worktree's run-evidence location.
- [ ] Run contract preflight and `check-task-workflow --strict`; fix only
      contract/plan formalities (at most three rounds) or report blocked.
- [ ] Commit plan/contract/notes/attempt-record locally in the orchestration
      worktree; do not push.
- [ ] (Phase 2, separate authorization) Run the exactly-once authoritative
      invocation in the detached subject checkout, validate it, promote the
      artifacts, record the outcome, and open the report PR carrying the
      mandatory pre-EPC-after-HRD-and-BDD2 annotation.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Fresh-fetch `origin/main` and verify it equals `VGBR_BASELINE_SHA` (`0852e9ab72f19b3794d5b8f9463a172e498686c7`); stop and report if not.
- [ ] Capture this work-package plan (`Artifact Level: work-package`, `Promotion Reason: verification_boundary`).
- [ ] Open the orchestration worktree on branch `codex/vgbr-post-hrd-baseline-recovery` from the pinned SHA via the repo's canonical `plan-to-todo` / `contract-worktree start` tooling.
- [ ] Create the detached subject checkout at exactly `VGBR_BASELINE_SHA` outside both checkouts; verify clean and pinned; compute `EXPECTED_SUBJECT_HASH`.
- [ ] Create the empty `REPORT_STAGE_DIR` outside the subject checkout.
- [ ] Author the task contract in the orchestration worktree with the full Program Rule R6 field set, embedding the frozen machine acceptance rubric verbatim.
- [ ] Write the attempt record (`outcome: null`, `started_at: null`) in the orchestration worktree's run-evidence location.
- [ ] Run contract preflight and `check-task-workflow --strict`; fix only contract/plan formalities (at most three rounds) or report blocked.
- [ ] Commit plan/contract/notes/attempt-record locally in the orchestration worktree; do not push.
- [ ] (Phase 2, separate authorization) Run the exactly-once authoritative invocation in the detached subject checkout, validate it, promote the artifacts, record the outcome, and open the report PR carrying the mandatory pre-EPC-after-HRD-and-BDD2 annotation.
