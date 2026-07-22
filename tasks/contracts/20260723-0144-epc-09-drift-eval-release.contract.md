# Task Contract: epc-09-drift-eval-release

> **Status**: Active
> **Plan**: plans/plan-20260723-0144-epc-09-drift-eval-release.md
> **Task Profile**: code-change
> **Owner**: kito
> **Reviewer**: Claude
> **Waiver Policy**: user_waiver allowed, owner kito only, per Acceptance Policy below
> **Base SHA**: `196e787a0ffe15eea4da0a2e50b4f0e04f99a666` (pinned per R1 post-EPC-08: fresh worktree branched from `origin/main` after EPC-08 merged (PR #124) plus its row-flip commit; verified equal to this worktree's HEAD at task start -- `git rev-parse HEAD` = `196e787a...`). Also recorded as `POST_EPC_SUBJECT_SHA = 196e787a0ffe15eea4da0a2e50b4f0e04f99a666`: this package's own changes (tests, a checked-in retired-surfaces list, docs, a post-EPC report triplet, sprint closeout edits) touch none of the R2 benchmark-subject inputs (`package.json`, `src/cli`, `assets`, the runner/validator scripts, `evals/harness/scenarios.json`, benchmark fixtures), so the matched post-EPC benchmark subject is exactly this package's own pinned base -- no separate freeze commit would create a real difference.
> **Target Branch**: main (via one independent PR)
> **Working Branch**: `codex/epc-09-drift-eval-release`
> **PR Unit**: one PR carrying the cross-package projection-drift suite, the checked-in retired-surfaces list and residue scan, the matched post-EPC report triplet and its attempt record, the changelog entry, the closeout research doc, the sprint closeout edits, and this package's workflow artifacts
> **Capability ID**: root
> **Last Updated**: 2026-07-23 01:44
> **Review File**: `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md`
> **Notes File**: `tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Sprint C (Evidence & Projection Convergence) deleted shadow authorities across
five cutover packages (EPC-01/02/03/04 built the ledger and importers;
EPC-05/06/07/08 cut checks/latest, checkpoints, recovery views, and the
Context Packet over to materialized projections, deleting the retired direct
writers in the same package as each cutover, per R5). Sprint backlog row 13
(amended by EPC-00) is the Program closeout: prove nothing drifted between
every canonical projection and the sources it claims to recompute from, prove
none of the retired writers came back (the residue scan), measure what the
convergence cost or bought against the recovered pre-EPC baseline
(`VGBR_BASELINE_SHA = b32b3282`, 27/27 arms), and record the release notes and
accepted intermediate states in the one place the next consumer will actually
look. Shipping this wrong means either a silent drift between a published
projection and its declared source (defeating the entire Program's premise),
an undetected revival of a deleted shadow-authority writer, or a Program that
closes without ever telling downstream adopters what changed.

## Goal

1. **Cross-package projection-drift check**
   (`tests/evidence-projection-drift.test.ts`): for each canonical
   projection, recompute from its declared sources and byte/hash-compare
   against the published artifact -- checkpoint machine/human views
   (re-fold the accepted event set + re-render, byte-compare against the
   store reader's resolved output over a fixture ledger, AND over this
   worktree's own live checkpoint state when one is present); recovery
   views (re-materialize from the same checkpoint + context, byte-compare);
   materialized `checks/latest` (re-select via the materializer's pure
   builder from the same ledger; provenance `content_hash` self-consistent
   both on a fixture and, when this worktree's own `checks/latest.json`
   carries real materialized content, on the live file); `tasks/current.md`
   (double-regeneration comparison per the EPC-07 precedent, non-mutating).
   Green = zero drift.
2. **Deprecation residue scan**: a checked-in
   `evals/harness/epc-retired-surfaces.json` enumerating the eight retired
   writers/placeholders (the union of EPC-05/07/08 deletions) -- the
   verify-sprint direct `cp` authoring, the workflow-state `{}` checks
   bootstrap, the mutation-observed checks-file target redirect, the bash
   `workflow_write_handoff` content assembly, the independent
   `codex-handoff-resume.sh` resume assembly, the independent
   `prepare-codex-handoff.sh` global-packet assembly, the
   `workflow_ensure_harness_surface` handoff/resume placeholder bootstrap,
   and the `resumeAvailable` marker/header string-scan -- each with the exact
   grep pattern(s) that must return zero hits and its allowed exceptions
   (the writer's own constants, test fixtures, this list itself, docs/notes).
   `tests/evidence-residue-scan.test.ts` consumes the JSON and asserts zero
   unexcepted hits across `src/`, `scripts/`, `.ai/hooks/`, `assets/`.
3. **Matched post-EPC benchmark** (VGBR-R protocol, reused verbatim for the
   matched run): a detached, clean subject checkout at exactly
   `POST_EPC_SUBJECT_SHA = 196e787a`, one attempt record written before
   invocation, exactly one authoritative invocation in that checkout
   (`--require-authoritative --provider codex --manifest
   evals/harness/scenarios.json`, no `--profile`/`--scenario`/
   `--regrade-existing`), validation in the same checkout (validator +
   `tests/harness-benchmark-matrix.test.ts`), promotion of the validated
   triplet to `evals/harness/reports/profile-comparison-post-epc.*`
   (the pre-EPC triplet stays immutable history, never overwritten), and a
   descriptive (never causal) delta against the pre-EPC baseline.
4. **Release notes + Program closeout**: a `docs/CHANGELOG.md` entry per
   `docs/reference-configs/changelog-versioning.md` (unreleased section, no
   version bump) covering the EPC behavior changes and the accepted
   intermediate states with operator guidance; a closeout research doc
   (`docs/researches/20260723-epc-program-closeout.research.md`) recording
   the Program summary, drift/residue results, the matched-run facts and
   delta, the D8 self-reference ratification, and carried-forward items;
   sprint document closeout edits (header -> Done, Program annotation
   extended with the post-EPC subject facts) -- row 13's own checkbox stays
   unflipped, the orchestrator flips it post-merge with the PR number.

## P1: Architecture Map

- Frozen inputs: EPC-00's D1-D9 decisions and Program annotation; the
  amended row-13 acceptance line; the VGBR-R protocol (sprint Row 3), reused
  verbatim for this matched run; the pre-EPC baseline triplet
  (`evals/harness/reports/profile-comparison.{json,md,sha256.json}`,
  immutable); the R2 benchmark-subject-input list; the EPC-05/07/08 Phase-A
  inventories and notes files naming the exact retired writers.
- New surfaces (this package only): the drift test suite, the residue list
  JSON + its scan test, the post-EPC report triplet, the attempt record, the
  changelog entry, the closeout research doc, the sprint closeout edits.
- Read-only, never edited: every EPC-01..08 module (the drift check imports
  only their existing public readers/pure builders --
  `buildCheckpointProjection`/`renderCheckpointMarkdown`
  (`src/core/evidence/checkpoint.ts`), `resolveLastPublishedCheckpoint`
  (`src/effects/evidence/checkpoint-store.ts`), `resolveRecoveryEvidence`/
  `buildRecoveryContext`/`renderRecoveryHandoff`/`renderRecoveryResume`
  (`src/effects/evidence/recovery-materializer.ts`),
  `buildChecksLatestProjection` (`src/effects/evidence/checks-materializer.ts`),
  `readAcceptedEvents`/`appendEvidenceEvent`/`appendGenesisRecord`
  (`src/effects/evidence/event-log.ts`)); the benchmark runner, validator,
  manifest, and fixtures (frozen subject); `scripts/refresh-current-status.sh`
  (invoked as a subprocess, never edited).

## P2: Concrete Trace

EPC-08 merges -> `main` at `196e787a` (PR #124 + its row-flip commit) ->
this worktree branches from it, verified equal -> Goal 1's drift suite and
Goal 2's residue list/scan land red-first where the retired code's absence
is directly checkable, then green against the current cut-over code ->
detached subject checkout created at `196e787a` outside this worktree and
the root repo, verified clean and pinned -> `REPORT_STAGE_DIR` created empty
-> `bun install --frozen-lockfile` in the subject checkout (environment prep;
re-verified clean and pinned after) -> attempt record written with
`outcome: null` -> exactly one invocation in the detached checkout -> the
validator and `tests/harness-benchmark-matrix.test.ts` pass in that same
checkout -> subject re-verified porcelain-clean and pinned -> the validated
triplet is copied into this worktree's `evals/harness/reports/
profile-comparison-post-epc.*`, re-checked for byte binding at the
destination -> attempt outcome recorded `accepted` with `finished_at` ->
descriptive delta computed against the pre-EPC triplet -> changelog +
closeout research doc + sprint closeout edits land -> full required-checks
suite green -> one commit -> PR opens (by the orchestrator, not this
contract) -> Sprint C completes; SSD activation is a separate later user
decision this package does not make.

## P3: Design Decision

- The residue list is a checked-in, tracked JSON consumed by the scan test
  (not a hardcoded regex sweep duplicated ad hoc), so the enumerated surface
  and the scan that checks it cannot silently drift apart -- matching the
  EPC-00-amended row-13 acceptance line's explicit demand for a "checked-in
  retired-paths/symbols list."
- The post-EPC report lives beside, never over, the pre-EPC triplet: both
  are immutable evidence at different points in the Program; the delta is a
  separate descriptive document, never a causal claim (the runner does not
  pin the provider model across the two runs).
- `POST_EPC_SUBJECT_SHA` equals this package's own pinned base rather than a
  separately-pinned commit: EPC-09 touches no R2 subject input, so a
  distinct freeze commit would manufacture a difference that does not exist;
  the detached checkout still independently guarantees a clean, frozen
  subject regardless of this orchestration worktree's own state.
- No version bump: row 13 requires release notes and Program closeout
  merged, not a package release; cutting a version is a separate, explicit
  user decision (anti-pattern 12), so `package.json` stays untouched.

## Scope

- In scope: `tests/evidence-projection-drift.test.ts` (new);
  `tests/evidence-residue-scan.test.ts` (new);
  `evals/harness/epc-retired-surfaces.json` (new);
  `evals/harness/reports/profile-comparison-post-epc.json`,
  `evals/harness/reports/profile-comparison-post-epc.md`,
  `evals/harness/reports/profile-comparison-post-epc.sha256.json` (new,
  promoted post-EPC triplet); `.ai/harness/runs/epc-09-post-eval/` (attempt
  record); `docs/CHANGELOG.md` (per convention doc, unreleased section);
  `docs/researches/20260723-epc-program-closeout.research.md` (new);
  `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`
  (closeout edits: header -> Done, Program annotation extension only -- row
  13's own checkbox stays unflipped); this package's own
  plan/contract/review/notes; `tasks/todos.md` projection;
  `.ai/harness/worktrees/epc-09-drift-eval-release.json`. Outside the repo:
  the detached subject checkout and `REPORT_STAGE_DIR` as ephemeral working
  directories with no git history of their own (not repo-relative paths, so
  not listed under `allowed_paths` below).
- Out of scope: every EPC-01..08 module (`src/effects/evidence/*`,
  `src/core/evidence/*`, `src/cli/hook/{stop-handler,mutation-observed,
  session-context}.ts`, `scripts/recovery-view-cli.ts`,
  `.ai/hooks/lib/workflow-state.sh` + canonical mirror,
  `scripts/{codex-handoff-resume,prepare-codex-handoff,verify-sprint,
  emit-verify-evidence}.*` -- read-only, consumed only via their existing
  public exports); `scripts/run-harness-profile-benchmark.ts`,
  `scripts/validate-harness-profile-benchmark.ts`,
  `evals/harness/scenarios.json`, `evals/fixtures/harness-matrix` (frozen
  benchmark subject); `package.json` / any version field; the SSD plan
  (`plans/plan-20260715-1140-skill-surface-discovery-convergence.md`,
  no-touch); `tasks/current.md` content and
  `scripts/refresh-current-status.sh` code (invoked read-only, never
  edited); the pre-EPC report triplet
  (`evals/harness/reports/profile-comparison.{json,md,sha256.json}`, never
  overwritten); any new npm dependency.
- Non-goals: causal (rather than descriptive) benchmark-improvement claims;
  a four-arm benchmark redesign; downstream helper deployment (a separate
  release-execution decision); SSD activation (a separate later user
  decision, gated on `POST_EPC_SHA` being pinned by the SSD activation
  contract itself, per R1 -- this package records only that EPC-09 merged).
- Taste constraints: match the sprint's Row 3 VGBR-R protocol text verbatim
  where it specifies exact commands, rubric lines, or forbidden flags;
  smallest change that satisfies each Goal item.

## Stop Conditions

- Stop and hand back to the parent if a required edit falls outside this
  contract's exact `allowed_paths`.
- Stop if `origin/main` has moved past `196e787a0ffe15eea4da0a2e50b4f0e04f99a666`
  before the detached subject checkout is created -- re-fetch and re-audit,
  never silently rebase or re-pin without reporting.
- Stop if the drift check finds a real, reproducible drift between a
  published projection and its declared sources -- that is a defect of an
  earlier package (EPC-05/06/07/08), fixed by a follow-up to that package's
  own surface per R5, never patched silently here.
- Stop if the attempt self-classifies any non-`accepted` outcome -- no
  automatic rerun, no `--regrade-existing`, no narrowed `--profile`/
  `--scenario` backfill; report for a new run-decision (the frozen fallback
  -- relabel the VGBR report "descriptive pre-EPC baseline only" -- then
  needs an explicit orchestrator ruling, not a unilateral one here).
- Stop if `check-architecture-sync` BLOCKS (not merely advises) on the
  changed capability surfaces -- report rather than editing `.ai/context/`
  or architecture files.
- Stop after three fail-fix-reverify rounds on one issue.

## Falsifier

The direction is wrong if any canonical projection cannot be recomputed
identically from its declared sources (real drift), if a retired surface
still has a live, unexcepted hit, or if the matched run cannot satisfy the
frozen VGBR-R rubric on the post-EPC subject. Cheapest proof: the drift and
residue suites green, and the validator + matrix test passing over the
staged post-EPC report before any promotion into tracked paths.

## Root Cause Evidence

Not applicable: Task Profile is `code-change`, not `bugfix`.

## Concurrency and Ownership

- **R2 Layer 1 (repository ownership):** this package's changed paths (see
  Scope) intersect no other active package's `allowed_paths` -- EPC-08 is
  Done/merged and no later Sprint C row has started; the SSD plan stays
  Draft/no-touch throughout.
- **R2 Layer 2 / R3 (verification-subject freeze):** this package pins
  `POST_EPC_SUBJECT_SHA = 196e787a` (equal to its own base) and holds it
  frozen as a verification subject for its own matched benchmark run, from
  the moment the detached subject checkout is created until this package's
  PR merges to `main`. During that window, no PR whose changed paths
  intersect the R2 benchmark-subject inputs (`package.json`, `src/cli`,
  `assets`, the runner/validator scripts, `evals/harness/scenarios.json`,
  benchmark fixtures) may merge to `main` (R2/R3). Parallel programs may
  continue in their own worktrees but must not merge a subject-touching
  change inside this window. **The orchestrator is the only merger** --
  this contract's own execution never pushes, opens, or merges a PR; it
  only prepares the single local commit.
- If an out-of-band merge lands on `main` touching the benchmark subject
  during the freeze, the attempt is void: stop, re-audit, re-pin -- never
  rebase silently and never reuse the stale attempt record.
- This package's own diff touches no R2 subject input (Scope), so the freeze
  it holds is a pure evaluation-integrity guarantee for the matched run, not
  a self-imposed block on its own progress.

## No-Compatibility Declaration

This package introduces no alias, dual read/write path, semantic fallback,
or steady-state migration shim. It retires nothing further and adds no new
runtime authority -- it only proves (drift/residue), measures (matched
benchmark), and records (release notes, closeout doc). Every EPC-01..08
authority cutover already deleted its own retired writer in its own package
(R5); any residue this package's scan finds is a defect of that earlier
package's surface, reported for a follow-up there, never patched here.

## Workflow Inventory

- Source plan: `plans/plan-20260723-0144-epc-09-drift-eval-release.md`
- Deferred-goal ledger: `tasks/todos.md`
- Review file: `tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md`
- Notes file: `tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md`
- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots / attempt record: `.ai/harness/runs/epc-09-post-eval/`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: run `verify-sprint --prepare-acceptance`, record one typed
  AcceptanceReceipt under the frozen policy below, then run `verify-sprint`;
  review Markdown is projection only.

## Acceptance Policy

```json
{"protocol":1,"reviewer":"Claude","user_waiver":"allowed"}
```

## Allowed Paths

```yaml
allowed_paths:
  - tests/evidence-projection-drift.test.ts
  - tests/evidence-residue-scan.test.ts
  - evals/harness/epc-retired-surfaces.json
  - evals/harness/reports/profile-comparison-post-epc.json
  - evals/harness/reports/profile-comparison-post-epc.md
  - evals/harness/reports/profile-comparison-post-epc.sha256.json
  - .ai/harness/runs/epc-09-post-eval/
  - docs/CHANGELOG.md
  - docs/researches/20260723-epc-program-closeout.research.md
  - plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md
  - plans/plan-20260723-0144-epc-09-drift-eval-release.md
  - tasks/contracts/20260723-0144-epc-09-drift-eval-release.contract.md
  - tasks/reviews/20260723-0144-epc-09-drift-eval-release.review.md
  - tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md
  - tasks/todos.md
  - .ai/harness/worktrees/epc-09-drift-eval-release.json
```

## Forbidden Paths and Actions

```yaml
forbidden:
  paths:
    - scripts/run-harness-profile-benchmark.ts
    - scripts/validate-harness-profile-benchmark.ts
    - evals/harness/scenarios.json
    - evals/fixtures/harness-matrix
    - evals/harness/reports/profile-comparison.json
    - evals/harness/reports/profile-comparison.md
    - evals/harness/reports/profile-comparison.sha256.json
    - package.json
    - src/effects/evidence/
    - src/core/evidence/
    - src/cli/hook/stop-handler.ts
    - src/cli/hook/mutation-observed.ts
    - src/cli/hook/session-context.ts
    - scripts/recovery-view-cli.ts
    - .ai/hooks/lib/workflow-state.sh
    - assets/hooks/lib/workflow-state.sh
    - scripts/codex-handoff-resume.sh
    - scripts/prepare-codex-handoff.sh
    - scripts/verify-sprint.sh
    - scripts/refresh-current-status.sh
    - tasks/current.md
    - plans/plan-20260715-1140-skill-surface-discovery-convergence.md
  flags:
    - --profile
    - --scenario
    - --regrade-existing
    - any git --force flag
  actions:
    - a second benchmark invocation after the first attempt reaches a
      terminal outcome
    - overwriting the pre-EPC report triplet
    - flipping sprint backlog row 13's own checkbox (orchestrator-only,
      post-merge)
    - push, PR open, or merge
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Amended (2026-07-23, orchestrator ruling, gatekeeper round-1 finding 3):
  # the matched benchmark was attempted exactly once and self-classified
  # failed_during_run; its evidence lives entirely in the immutable attempt
  # record (.ai/harness/runs/epc-09-post-eval/
  # attempt-post-epc-196e787a-20260723-a01.json). The ruled frozen fallback
  # branch (row 13's cannot-execute path, ## Row 13 -- EPC-09 matched
  # post-eval decision in the sprint document) requires no benchmark
  # artifact binding -- see tasks/notes/
  # 20260723-0144-epc-09-drift-eval-release.notes.md's "Gatekeeper round-1
  # corrections" section.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: 1
    wall_time_minutes: 40
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

> **Amendment note (2026-07-23, orchestrator ruling, gatekeeper round-1
> finding 3)**: these exit criteria are amended to the ruled fallback
> branch pre-acceptance -- the matched benchmark's success-path artifacts
> (the post-EPC report triplet) were never produced (attempt
> `failed_during_run`) and are removed below; the frozen fallback branch
> (row 13's cannot-execute path) was executed instead, with machine-checked
> closeout assertions substituting for triplet promotion. Full rationale in
> `tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md`'s
> "Gatekeeper round-1 corrections" section.

```yaml
exit_criteria:
  files_exist:
    - tests/evidence-projection-drift.test.ts
    - tests/evidence-residue-scan.test.ts
    - evals/harness/epc-retired-surfaces.json
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260723-0144-epc-09-drift-eval-release.notes.md
    - .ai/harness/runs/epc-09-post-eval/attempt-post-epc-196e787a-20260723-a01.json
    - evals/harness/epc-retired-surfaces.json
    - docs/researches/20260723-epc-program-closeout.research.md
  tests_pass:
    - path: tests/evidence-projection-drift.test.ts
    - path: tests/evidence-residue-scan.test.ts
  commands_succeed:
    - bun run check:type
    - bun test tests/harness-benchmark-matrix.test.ts
  manual_checks:
    - "Attempt record shows exactly one invocation, outcome failed_during_run, no forbidden flags; frozen fallback branch executed with machine-checked closeout assertions"
    - "Pre-EPC triplet bytes untouched with byte-binding verified; no post-EPC triplet produced (ruled fallback branch)"
    - "Drift + residue suites green; residue list covers the EPC-05/07/08 deletion union"
    - "tasks/current.md untouched"
```

## Acceptance Notes (Human Review)

- Functional behavior:
- Edge cases:
- Regression risks:

## Rollback Point

- Commit / checkpoint: the single commit on `codex/epc-09-drift-eval-release` before it merges.
- Revert strategy: revert the single PR -- removes the drift/residue test
  suites, the retired-surfaces list, the post-EPC report triplet, the
  attempt record, the changelog entry, the closeout research doc, and the
  sprint closeout edits. The pre-EPC baseline triplet and every EPC-01..08
  runtime surface are untouched either way (this package never edited
  them), so reverting cannot regress any of them.
