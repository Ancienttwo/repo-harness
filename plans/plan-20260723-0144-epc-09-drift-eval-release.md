# Plan: EPC-09: Drift Check, Matched Post-Eval, Release Closeout

> **Status**: Executing
> **Created**: 20260723-0144
> **Slug**: epc-09-drift-eval-release
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-09
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Cross-package projection-drift suite green (every canonical projection recomputes identically); residue scan zero hits against the checked-in retired-surfaces list; one matched post-EPC benchmark invocation under the frozen VGBR-R rubric with attempt record and validator + matrix test passing before promotion; changelog + closeout research doc merged; full bun test green
> **Rollback Surface**: Revert the single PR: removes drift/residue suites, the residue list, the post-EPC report triplet, changelog entry, closeout doc, and sprint closeout edits; the pre-EPC baseline triplet and all EPC-01..08 runtime surfaces are untouched either way
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md`
> **Task Review**: `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md`
> **Implementation Notes**: `tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: sprint:plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md#epc-09
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260723-0144-epc-09-drift-eval-release.md`
- Sprint contract: `tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md`
- Sprint review: `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md`
- Implementation notes: `tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260723-0144-epc-09-drift-eval-release.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260723-0144-epc-09-drift-eval-release.md`.

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
- Contract file: `tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md`
- Review file: `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md`
- Implementation notes file: `tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260723-0144-epc-09-drift-eval-release.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the single PR: removes drift/residue suites, the residue list, the post-EPC report triplet, changelog entry, closeout doc, and sprint closeout edits; the pre-EPC baseline triplet and all EPC-01..08 runtime surfaces are untouched either way
- **Verification boundary**: Cross-package projection-drift suite green (every canonical projection recomputes identically); residue scan zero hits against the checked-in retired-surfaces list; one matched post-EPC benchmark invocation under the frozen VGBR-R rubric with attempt record and validator + matrix test passing before promotion; changelog + closeout research doc merged; full bun test green
- **Review/acceptance boundary**: `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260723-0144-epc-09-drift-eval-release.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md`, `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md`, and `tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the single PR: removes drift/residue suites, the residue list, the post-EPC report triplet, changelog entry, closeout doc, and sprint closeout edits; the pre-EPC baseline triplet and all EPC-01..08 runtime surfaces are untouched either way

## Captured Planning Output

> **Task Profile**: code-change

## Decision Summary

EPC-09 implements Sprint C backlog row 13 (acceptance line as amended by
EPC-00): the Program closeout. Four deliverables: (1) a cross-package
projection-drift check proving every canonical projection (materialized
`checks/latest`, checkpoint machine+human views, recovery views, tracked
`tasks/current.md`) recomputes identically from its sources; (2) a
deprecation residue scan against a checked-in retired-paths/symbols list
(the union of EPC-05/07/08 deletions) with zero hits; (3) one matched
post-EPC benchmark under the VGBR-R protocol — same runner, manifest,
three profile bases, provider/CLI, acceptance rubric; frozen post-EPC
subject; exactly one invocation; attempt record with no-auto-rerun; the
before/after comparison reported as descriptive evidence only (the runner
does not pin the provider model) — with the frozen fallback if the run
cannot execute (relabel the VGBR report `descriptive pre-EPC baseline
only`, no benchmark-improvement claim, as a checked closeout assertion);
(4) release notes in the changelog per `docs/reference-configs/changelog-versioning.md`
(no version bump) plus the Program closeout: sprint header to Done and the
accumulated closeout obligations recorded. Base SHA pinned per R1 at fresh
fetch: `196e787a0ffe15eea4da0a2e50b4f0e04f99a666` (post-EPC-08 merge + row
flip). The benchmark subject SHA is pinned at the same commit
(`POST_EPC_SUBJECT_SHA = 196e787a`): EPC-09's own changes touch no
benchmark subject input (R2 list), so the subject is exactly the
post-EPC-01..08 state.

## Why

The Program deleted shadow authorities across five cutover packages; the
closeout must prove nothing drifted and nothing retired survived, measure
what the convergence cost or bought against the recovered pre-EPC
baseline, and record the intermediate states the cutovers accepted
(downstream availability, local legacy CLI, guarded seeds) where the next
consumer will look — release notes, not tribal memory.

## Goal

1. Cross-package projection-drift check
   (`tests/evidence-projection-drift.test.ts` + a runnable entry if
   needed): for each canonical projection, recompute from its declared
   sources and byte/hash-compare — checkpoint machine/human views
   (re-fold + re-render), recovery views (re-materialize from the same
   checkpoint + context), materialized `checks/latest` (re-select via
   D7 from the same ledger; provenance `content_hash` self-consistent),
   `tasks/current.md` (double regeneration comparison per the EPC-07
   precedent). Green = zero drift.
2. Residue list + scan: checked-in
   `evals/harness/epc-retired-surfaces.json` enumerating the retired
   paths/symbols — the verify-sprint direct `cp` authoring, the
   workflow-state `{}` checks bootstrap, the mutation-observed
   checks-file target, the bash `workflow_write_handoff` assembly, the
   independent resume/packet authoring in `codex-handoff-resume.sh` /
   `prepare-codex-handoff.sh`, the `workflow_ensure_harness_surface`
   placeholder bootstrap, and the `resumeAvailable` marker string-scan —
   each with the exact pattern that must return zero hits and its
   allowed exceptions (e.g. the writer's own marker constant, test
   fixtures, this list itself). `tests/evidence-residue-scan.test.ts`
   runs the scan; zero hits.
3. Matched post-EPC benchmark (VGBR-R protocol, Phase-2-style):
   - Dual checkout: this contract worktree orchestrates; a detached,
     clean, read-only subject checkout at exactly
     `POST_EPC_SUBJECT_SHA = 196e787a`; `REPORT_STAGE_DIR` outside it.
   - Attempt record before invocation (`.ai/harness/runs/epc-09-post-eval/`):
     `ATTEMPT_ID = post-epc-196e787a-20260723-a01`,
     `EXPECTED_SUBJECT_SHA`, `EXPECTED_SUBJECT_HASH` (computed at
     preflight via the same git-blob-identity hash over the frozen
     subject inputs), `command_sha256`, `provider`,
     `provider_cli_version`. Outcome exactly one of
     `accepted | failed_before_provider | failed_during_run |
     invalid_report | cancelled`; any non-accepted outcome: no automatic
     rerun, no `--regrade-existing`, no narrowed flags — report back for
     a new run-decision.
   - Invocation exactly once in the detached checkout:
     `bun scripts/run-harness-profile-benchmark.ts --require-authoritative
     --provider codex --manifest evals/harness/scenarios.json --report
     "$REPORT_STAGE_DIR/profile-comparison.json"`. Forbidden flags:
     `--profile`, `--scenario`, `--regrade-existing`. Runner wall budget
     is the sole hard limit.
   - Validation in the same checkout: the validator with
     `--require-authoritative`, then `bun test
     tests/harness-benchmark-matrix.test.ts`. Frozen rubric identical to
     VGBR-R's (authoritative true; source_commit == subject SHA; subject
     hash matches; three profile bases; 9 scenarios / 27 records unique;
     isolation; byte binding; no drift; no second invocation).
   - Promotion: canonical post-EPC report artifacts at
     `evals/harness/reports/profile-comparison-post-epc.{json,md,sha256.json}`
     (the pre-EPC triplet is immutable history); descriptive delta
     (per-profile pass counts, durations, tokens vs the pre-EPC
     baseline) recorded in the closeout research doc and cited in the
     release notes — descriptive evidence, never causal proof.
   - Subject freeze (R2/R3): from pin until this package's PR merges, no
     benchmark-subject-touching PR merges to `main`.
   - Fallback (only if the run cannot execute or self-classifies
     non-accepted): the VGBR report is relabeled `descriptive pre-EPC
     baseline only` and the closeout asserts no benchmark-improvement
     claim — as a checked assertion in the closeout artifacts.
4. Release notes + Program closeout: changelog entry per
   `docs/reference-configs/changelog-versioning.md` (no version bump)
   covering the EPC behavior changes (checks/latest materialized-only;
   recovery views single-materializer; Context Packet projection-sourced;
   redaction typed-field exemption) and the accepted intermediate states
   (downstream adopters lack ledger tooling until the next release;
   globally installed pre-cutover CLI is a live legacy writer until
   refreshed — with the standard-profile refresh instruction; guarded
   only-if-absent `{}` seeds in plan-to-todo/ensure-task-workflow remain
   non-ledger first-writers, fail-closed); a closeout research doc
   (`docs/researches/20260723-epc-program-closeout.research.md`) with
   the drift/residue/benchmark results; sprint header Status -> Done and
   the Program annotation extended with the closeout facts. SSD stays
   no-touch (its activation contract pins `POST_EPC_SHA` itself, per R1
   — this package records only that EPC-09 merged).

## P1: Architecture Map

- Frozen inputs: EPC-00 decisions, the amended row-13 line, the VGBR-R
  protocol (sprint Row 3) reused verbatim for the matched run, the
  pre-EPC baseline triplet (immutable), the R2 subject-input list.
- New surfaces: drift/residue tests, the residue list JSON, the post-EPC
  report triplet, the attempt record, changelog entry, closeout research
  doc, sprint closeout edits.
- Read-only: every EPC-01..08 module (the drift check imports their
  public readers/renderers); runner/validator/manifest/fixtures (frozen
  benchmark subject).

## P2: Concrete Trace

EPC-08 merges -> `main` at `196e787a` -> EPC-09 fresh-fetches, pins base
and `POST_EPC_SUBJECT_SHA` = `196e787a` (R1; no subject input touched by
this package) -> drift check + residue scan land red-first-where-feasible
and go green -> detached subject checkout + attempt record -> one
invocation -> validator + matrix test pass -> artifacts promote to the
post-EPC triplet -> descriptive delta recorded -> changelog + closeout
research doc + sprint Done -> full suite green -> receipt via worktree
scripts -> one PR merges -> Sprint C complete; SSD activation is a user
decision outside this Program.

## P3: Design Decision

- The post-EPC report lives beside (never over) the pre-EPC triplet:
  both baselines are immutable evidence; the delta is a separate
  descriptive document.
- The subject SHA equals this package's base: EPC-09 touches no subject
  input, so a separate freeze commit would manufacture a difference
  that does not exist; the detached checkout still guarantees a clean
  frozen subject regardless of orchestration-worktree state.
- Residue list as tracked JSON + test reader (not hardcoded greps): the
  EPC-00-amended line demands a checked-in list; the test consumes it so
  list and scan cannot drift apart.
- No version bump: row 13 requires release notes and closeout merged,
  not a release; cutting a version is an explicit user decision
  (anti-pattern 12).

## Task Breakdown

- [ ] Verify fresh fetch equals pinned base `196e787a`; fill contract
      (subject freeze note; attempt-record protocol).
- [ ] Drift check + residue list/scan (red-first where feasible).
- [ ] Detached subject checkout + attempt record; ONE invocation;
      validate; promote post-EPC triplet; descriptive delta.
- [ ] Changelog entry + closeout research doc + sprint Done edits.
- [ ] Required checks; commit; receipt via worktree scripts; PR.

## Scope

- In scope: `tests/evidence-projection-drift.test.ts`,
  `tests/evidence-residue-scan.test.ts`,
  `evals/harness/epc-retired-surfaces.json`,
  `evals/harness/reports/profile-comparison-post-epc.{json,md,sha256.json}`,
  `.ai/harness/runs/epc-09-post-eval/`, `docs/CHANGELOG.md` (per
  convention doc), `docs/researches/20260723-epc-program-closeout.research.md`,
  `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`
  (closeout edits: header Done, annotation extension), this package's
  plan/contract/review/notes, `tasks/todos.md` projection,
  `.ai/harness/worktrees/epc-09-drift-eval-release.json`; the detached
  subject checkout and `REPORT_STAGE_DIR` as ephemeral directories.
- Out of scope: every EPC-01..08 module (read-only imports only);
  runner/validator/manifest/fixtures (frozen); `package.json`/version;
  SSD plan (no-touch); `tasks/current.md`; any new npm dependency.
- Non-goals: causal benchmark claims; four-arm redesign; downstream
  helper deployment (release execution is a separate user decision);
  SSD activation.

## Stop Conditions

- Stop if `origin/main` moves past `196e787a` before worktree creation.
- Stop if the attempt self-classifies any non-`accepted` outcome — no
  rerun; report for a new run-decision (the fallback relabel path then
  needs an explicit orchestrator ruling).
- Stop if the drift check finds real drift (that is a defect of an
  earlier package — fixed by a follow-up to that package's surface, per
  R5, not silently here).
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if any canonical projection cannot be recomputed
identically (drift), if a retired surface still has live hits, or if the
matched run cannot satisfy the frozen rubric on the post-EPC subject.
Cheapest proof: drift + residue suites green, and the validator +
matrix test passing over the staged post-EPC report before promotion.

## Cheapest Sufficient Proof

- Fresh fetch equals `196e787a` at pin time; contract records it.
- Drift + residue suites green; full `bun test` green; root checks
  green.
- Attempt record shows exactly one invocation with outcome `accepted`;
  post-EPC triplet byte-bound and validator-clean; descriptive delta
  recorded.
- Changelog + closeout doc merged; sprint header Done.
- `git diff --name-only <base>..HEAD` ⊆ `allowed_paths`.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Verify fresh fetch equals pinned base `196e787a`; fill contract
- [ ] Drift check + residue list/scan (red-first where feasible).
- [ ] Detached subject checkout + attempt record; ONE invocation;
- [ ] Changelog entry + closeout research doc + sprint Done edits.
- [ ] Required checks; commit; receipt via worktree scripts; PR.
