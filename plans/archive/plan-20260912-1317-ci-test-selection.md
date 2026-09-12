> **Archived**: 2026-09-12 15:31
> **Related Plan**: plans/archive/plan-20260912-1317-ci-test-selection.md
> **Outcome**: Superseded
> **Lifecycle**: plan
> **Parent Run ID**: run-20260912-1531
> **Archive Projection V1**: `plans/plan-20260912-1317-ci-test-selection.md` => `plans/archive/plan-20260912-1317-ci-test-selection.md`

# Plan: CI test selection and draft lifecycle

> **Status**: Archived
> **Substantive Change SHA256**: `sha256:dd0b8fa46c1072b22b3da6d52f75e0d3a178bc3cfcd8b15f6385901a54ce0c4e`
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Git event fixtures and the actual workflow aggregate shell.
> **Rollback Surface**: Workflow, selector, focused tests and documentation only.

## Promotion Gate

- **Merge/PR unit**: One independently reviewable CI scheduling change.
- **Rollback surface**: Revert this slice, with no runtime state migration.
- **Verification boundary**: Event/diff fixtures, workflow assertions and repository integrity.
- **Review/acceptance boundary**: Local validation recorded here; hosted execution remains separately identified.
- **High-risk surface**: Stable Required / CI must reject missing coverage; Governance remains independent.
- **Why not checklist row**: An independent CI gate change outside the policy-only slice in the other worktree.

## Evidence Contract

- **State/progress path**: This plan's Task Breakdown.
- **Verification evidence**: Focused tests and required integrity command results recorded here.
- **Evaluator rubric**: Actual workflow shell accepts only the expected successful coverage for the selected mode.
- **Stop condition**: Scope implemented and checks pass, or verified external blockers reported.
- **Rollback surface**: This slice's declared files only.

## Decision

P1: `.github/workflows/ci.yml` owns scheduling; `scripts/check-ci.sh` owns independent governance and functional lanes. `scripts/select-ci-coverage.ts` owns path classification and the pure coverage decision. The documentation consumer scanner derives whole test files from checkout-bound document reads; the workflow's file list is a checked projection, not another authoring source.

P2: The thin selector shell reads event/env and a complete Git raw diff. `selectCoverage({ eventName, event, headSha, actualHead, diffRaw })` has no I/O; the independent replay feeds first-parent Git history directly to it. Required / CI rejects missing coverage, cancelled/failed or unexpectedly skipped jobs and deferred drafts. The documentation drift test checks the complete inferred file inventory against the workflow.

P3: Expand docs coverage to tasks/**, plans/**, docs/**/*.md, docs/architecture/.projection-manifest.json, .ai/harness/handoff/** and README.md. Keep docs/reference-configs/**, .archcontext/**, policy/config, deploy, root AGENTS/CLAUDE, source and unknown paths full. Preserve nonregular-file, endpoint, checkout and diff guards. Keep Governance independent: the owner explicitly withdrew serial scheduling because it contradicts the incident-derived lesson. Document its measured cost as a deferred goal. No production replay bypass, new runtime dependency, fixture optimization, or runner change. At 10x scale, code-change full jobs remain the first cost limit.

## Scope

Same branch and work-package. Replace Python with TS selector/replay, add the documentation consumer scanner and drift guard, update the existing CI job-split tests, workflow, verification architecture document and deferred goal ledger. If measured docs-lane tests exceed 180 seconds, move document assertions from the pulled-in heavy files into small dedicated test coverage within this slice. No changes to scripts/lib/ci-run-tests.sh or the policy WIP in the other worktree. No commit, push, rebase or PR until the follow-up gatekeeper result and owner's ship instruction.

## Verification

Run the actual selected documentation whole-file set and report elapsed time, targeted selector/aggregate/drift tests, typecheck and the nine repository-integrity commands. Bind task-sync against origin/main merge-base as requested. Replay first-parent history since 2026-08-29, recording the pinned ref SHA, mode/reason statistics and remaining document-heavy full selections. No full local suite: no functional runner or product code change. Gatekeeper consumes canonical execution output and checks remaining gaps without repeating unchanged expensive evidence.

## Task Breakdown

- [x] Replace Python with pure TS decision, thin shell and independent historical replay.
- [x] Derive documentation whole-file inventory and enforce workflow projection drift.
- [x] Measure docs lane and historical hit rate; split heavy document assertions only if the 180-second threshold is exceeded.
- [x] Complete focused, type and repository-integrity verification; record the final diff digest.
- [x] Receive gatekeeper acceptance on the frozen rework.

## Verification Results

- Initial candidate was rejected: an independent replay of 249 first-parent commits selected docs zero times. Previous local green tests established scheduling correctness but did not establish savings. That candidate's evidence is not final rework acceptance.
- Local base is d94ec3c7517230b361f1354805ab3d4a364a045a; origin/main has advanced. Work remains isolated in codex/ci-test-selection, without rebasing or importing the root policy WIP.
- Historical replay: `bun scripts/replay-ci-coverage.ts --since 2026-08-29` pinned origin/main to `3108aa435a8d5655622446881dc77a61e2aa6d9f`, using an explicit UTC midnight boundary. 251 first-parent commits: docs 65 (25.90%), full 186; reasons: documentation-only 65, unclassified-path 164, non-document-file-mode 22. Per-commit output is `/tmp/rh-ci-coverage-replay.tsv`; the command regenerates it from Git and the pure selector without a production bypass.
- Reproduced the audit's 63 workflow-only direct-commit cohort: one parent, no changed path matching `^(src/|tests/|scripts/|assets/|package\.json|bun\.lock|bunfig|tsconfig|\.github/)`. 56/63 (88.89%) select docs. Remaining seven full selections are listed below; this cohort is broader than semantically pure prose.
- Initial conservative 29-file documentation lane passed in 499.15 seconds (`/tmp/rh-documentation-lane.log`). After distinguishing explicitly authored fixture documents and moving the browser's 16 documentation assertions unchanged to `tests/cli/documentation-contracts.test.ts`, the final 22-file lane (309 passed tests) passed in 79.69 seconds. Whole-file isolation uses the existing `scripts/lib/ci-run-tests.sh`; no name filtering, fixture or runner change was used. Final output: `/tmp/rh-documentation-final.log` and `/tmp/rh-documentation-final-result.json`.
- `bun test tests/check-ci-job-split.test.ts tests/ci-documentation-consumers.test.ts --timeout 60000`: 9 passed, 193 expectations, 8.56 seconds (`/tmp/rh-ci-rework-final-focused.log`). Includes the actual aggregate's 521 combinations, real Git event/CLI/replay cases and scanner provenance/projection guards. The browser's remaining functional tests passed in the initial lane; only the already-verified document block was subsequently moved.
- `bun run check:type`, hook/helper/reference projection checks, deploy SQL order, architecture sync, project inspection and init dry-run passed (`/tmp/rh-ci-integrity-0.log` through `-7.log`). Init planned zero operations. Final `REPO_HARNESS_DIFF_BASE=origin/main REPO_HARNESS_DIFF_MODE=merge-base bash scripts/check-task-sync.sh` and `bash scripts/check-task-workflow.sh --strict` passed against the digest above; `git diff --check` passed. Logs: `/tmp/rh-ci-rework-task-sync.log` and `/tmp/rh-ci-rework-workflow.log`.

- Local gatekeeper verdict: PASS after reviewing all 11 changed files and consuming the matching execution logs without rerunning expensive checks. No proved blocker remained. This is a local rework verdict only; HEAD remained d94ec3c7 and origin/main was ten commits ahead. No commit, push, rebase or hosted run was performed. The next boundary remains the owner-directed ship sequence below.

### Remaining workflow-only direct commits selecting full

| Commit | Reason | Retained full-coverage input |
| --- | --- | --- |
| b4b0a372 | unclassified-path | deploy/release-checklists/260829-repo-harness-0.18.0.md |
| 37b9f479 | unclassified-path | .archcontext model YAML plus root AGENTS.md/CLAUDE.md |
| 1037d92d | unclassified-path | architecture.likec4, architecture.mmd and architecture.structurizr.json |
| 4fcf8ae1 | unclassified-path | architecture.likec4, architecture.mmd and architecture.structurizr.json |
| ded35086 | unclassified-path | root AGENTS.md/CLAUDE.md |
| da39e03e | non-document-file-mode | install.sh |
| 7a272b8e | unclassified-path | deploy/release-checklists/260910-repo-harness-0.19.0.md |

## Hosted Acceptance Boundary

No hosted success is claimed. After gatekeeper PASS, the owner controls ship: refresh/rebase against origin/main, bind the new digest, observe a draft PR's non-mergeable Required / CI result, then ready_for_review full execution. This workflow-changing PR cannot demonstrate docs mode itself. After merge, read back the first qualifying documentation/tasks change for mode=docs, Test skipped and Required / CI success.

## Authorized Ship Progress

- Owner approved ship after the local gatekeeper PASS. The reviewed slice was committed locally and rebased without conflicts onto `3108aa435a8d5655622446881dc77a61e2aa6d9f`; the other worktree policy WIP remains separate.
- Base delta changes initialization defaults and existing repository documents, with no selector/workflow/runner changes. Revalidate the selected docs lane for its real-repository fixture consumers, selector/drift and digest binding. Prior local evidence remains a baseline for its recorded subject.
- Rebased candidate verification: whole documentation lane passed (22 files, 309 tests, 75.86 seconds); selector/drift passed (9 tests, 193 expectations, 9.22 seconds); typecheck and all nine repository-integrity commands passed. Logs: `/tmp/rh-ci-ship-docs.log`, `/tmp/rh-ci-ship-focused.log`, `/tmp/rh-ci-ship-integrity-{0..9}.log`. `git range-diff` confirms the rebased implementation patch is unchanged; only this evidence entry and its base-bound digest changed.
- Draft PR #415 was created at `30027569`. During creation, #414 advanced main to `a2c241813ab2eb4188d4a6682633cf87873cc64d`; draft run `34679218915` correctly deferred all expensive lanes, but Governance additionally rejected the old base-bound digest. Integrated that non-overlapping architecture/lifecycle-only base with a normal merge and rebound the digest. No product, test, runner or selector implementation changed; retain the 75.86-second docs lane as baseline and use targeted drift checks for this delta.

## Hosted acceptance

- Draft run `34679218915` (head `30027569`, mode=draft): Test, matrix and documentation jobs skipped; `Required / CI` failed by design because a draft PR defers expensive lanes.
- Ready-for-review run `34679383556` (head `60092a0f`, mode=full): all six jobs green.
- Post-merge run `34680455754` on main, pure `tasks/` direct commit `e90c6569` (mode=docs): Test and matrix skipped, documentation job passed, `Required / CI` success, whole run 105 seconds. This is the read-back that closes the hosted acceptance boundary above.

## Archive Note

Archived as Superseded: delivered via PR #415 merged at 969a7fe5; hosted acceptance recorded in plan; no AcceptanceReceipt sealed.
