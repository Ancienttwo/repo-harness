# Plan: Retain failed criterion context comparisons

> **Status**: Executing
> **Created**: 20260905-1631
> **Planning Source**: codex-plan
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Workflow Profile**: standard
> **Base Revision**: `6c19234eb28e09b78614df47b8954c3e2e648414`
> **Substantive Change SHA256**: `sha256:ae117fed4ad3bbb0552469adeef1a73316082dbdd8a915d2a4e89e33d64dce8c`
> **Verification Boundary**: Named helper drift, normal acceptance and unavailable-context cases; helper projection and integrity checks; no full suite
> **Rollback Surface**: Revert only codex/verify-context-diagnostics

## Goal
The user approved retaining before/after criterion context and changed field names when verify-sprint rejects an execution-time authority mismatch. Implement failure diagnostics in the existing run snapshot and verify the original fail-closed behavior remains unchanged.

## P1 Map
scripts/verify-sprint.sh owns context sampling and the run trace; scripts/sync-helper-sources.ts projects it into assets/templates/helpers/verify-sprint.sh. tests/helper-scripts.test.ts copies the packaged helper into a real Git fixture. Existing retry_context remains the frozen authority consumed by verification.

## P2 Trace
write_criterion_context samples before and after verify-contract. cmp already rejects drift. The run trace currently preserves only the before snapshot and generic guard message; the EXIT trap deletes both temporary contexts. The existing intentional docs/spec.md mutation fixture proves rejection but cannot expose after-values. Add assertions to it before editing the helper.

## P3 Decision
Keep cmp as the admission authority. On a successfully captured mismatching context, augment retry_context_guard with the observed after-context and sorted changed field names; retain before-context at its existing retry_context location and include field names in the failure message. Record only existing context values (hashes, schema and root); do not log toolchain raw inputs or add a second authority, new knob, file store, parser, timeout, or scheduler. Successful and unavailable contexts retain their current trace shape. At 10x scale the extra diagnostic data is bounded to seven fields per failed run, with no extra process on successful runs.

## Scope
scripts/verify-sprint.sh; assets/templates/helpers/verify-sprint.sh; tests/helper-scripts.test.ts; this plan; docs/researches/20260905-agent-workflow-maintenance.md. The approved integration includes landing the completed verification-scope prerequisite separately before merging this patch into clean local main. Preserve unrelated working changes and the prior strict/Fleet branch. This isolated change covers failure reporting only, not the historical intermittent drift's unknown writer.

## Task Breakdown
- [x] Add actual failing assertions for after-context and changed field retention to the existing drift regression.
- [x] Add failure-only diagnostics at the owning comparison branch and regenerate its helper projection.
- [x] Verify drift, stable acceptance, unavailable identity, helper/package projection, and appropriate integrity checks.
- [x] Record root-cause evidence and validation, commit the bounded patch, and report the actual integration state.
- [x] Resolve the separately owned workflow-checker conflict and integrate into clean local main.
- [ ] Archive the fulfilled plan when the existing archive workflow supports standard single-plan completion; see Archive Boundary.

## Promotion Gate

- **Merge/PR unit**: one independently reviewable failure-diagnostic patch.
- **Rollback surface**: revert this branch without authority or persistence migration.
- **Verification boundary**: focused real Git fixtures execute the packaged helper.
- **Review/acceptance boundary**: Waza check-style review and evidence recorded in this plan.
- **High-risk surface**: preserve cmp, failure classification and the frozen retry identity.
- **Why not checklist row**: this approved slice has an independent verification and merge boundary from the prior strict/Fleet branch.

## Evidence Contract

- **State/progress path**: this plan's Task Breakdown.
- **Verification evidence**: Root Cause Evidence and Verification Results below, plus named raw logs.
- **Evaluator rubric**: failed comparisons preserve both contexts and exactly the changed fields; stable and unavailable comparisons retain their trace shape.
- **Stop condition**: implementation and focused verification pass; report any integration blockers without changing the gate.
- **Rollback surface**: revert only this branch's bounded patch.

## Verification Commands

```bash
bun test tests/helper-scripts.test.ts --test-name-pattern 'verify-sprint (rejects a criterion|composes executed|reports unavailable)' --timeout 60000
bun run check:helpers
bash -n scripts/verify-sprint.sh
bash scripts/check-deploy-sql-order.sh
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

Only shell failure reporting and its test change. No TypeScript production code, success-path semantics, authority contract or release behavior changes. Focused fixtures and projection checks cover this slice; an incomplete historical full run remains incomplete.

## Root Cause Evidence

- root_cause: verify-sprint's mismatch branch records only the before-context and generic message; EXIT deletes the after-context before later inspection.
- repro: the named drift test mutates docs/spec.md or its plan during verification.
- regression_guard: tests/helper-scripts.test.ts asserts rejection plus retained observed_context, exact changed_fields, unchanged remaining values and stderr field names.
- pre_fix_failure_artifact: /tmp/verify-context-diagnostics-red.log; two actual failures because changed_fields was undefined, PRE_FIX_EXIT=1. The goal-only expectation was subsequently corrected from source evidence: isOperationalReviewPath excludes plans from review subject, so only goal_sha256 changes. A combined source-and-goal case covers multiple changed fields.

## Workflow Decision

Current state resolution is standard. This plan is the single scope, progress and validation artifact. The original checker required a separate contract; the separately committed prerequisite now admits this state through the canonical resolver, and the merged strict workflow check passes.

## Verification Results

- Focused acceptance/drift/unavailable batch: 5 pass, 0 fail, 141 assertions, 42.77 seconds; `/tmp/verify-context-diagnostics-final.log`.
- Final `bun run check:type`: pass. The three drift cases were rerun after the test-only typing adjustment: 3 pass, 0 fail, 88 assertions, 17.18 seconds; `/tmp/verify-context-diagnostics-final-drift.log`. The unchanged success/unavailable cases reuse the passing batch evidence above.
- `bun run check:helpers`: 56 helper projections match. `bash -n scripts/verify-sprint.sh` and `git diff --check`: pass.
- Normal `npm pack` ran both prepack builds. The extracted tarball helper matches the canonical source byte-for-byte, SHA-256 `1e47dd631f22a2f01c58ecf311d44dd5e1f0ce9c5cc81f7b2c9d0a58d8e6e2ba`; its `--help` runs from the temporary extraction. Package: `/tmp/verify-context-package.Ky4bss/repo-harness-0.18.0.tgz`. No host installation or publication occurred.
- Deploy SQL, architecture sync, project-state inspection and init dry-run pass; init reports zero operations. Task-sync passes with the exact substantive digest recorded above.
- `bash scripts/check-task-workflow.sh --strict` reports the known missing-contract conflict for an active standard plan. Preserve this failed result; do not fabricate a contract or repair the separate workflow-checker task here.
- Review depth: quick; scope on target. Only the canonical comparison branch and its generated projection have this mismatch path. The no-jq report path cannot reach a valid context comparison and remains unchanged. Successful snapshots, comparison/exit decision, cache authority, timeouts and helper interfaces retain their existing behavior.
- No full suite was run. Named cases cover the isolated failure-reporting branch and its boundaries; unrelated interrupted-suite evidence remains incomplete.

## Integration Boundary

This branch starts at `78bb1716` and excludes the previous strict/Fleet branch. The user subsequently approved main integration, including landing the completed verification-scope dependency first as its own commit. Its owning task is completed; the 27 existing changed/untracked paths were copied into a full disposable clone and verified byte-for-byte against `/tmp/verify-context-integration-okcr7mzn/snapshot.json`. Preserve this dependency as a separate rollback unit; do not mix it into the diagnostics implementation commit.

The integration target advanced from `eb287895` to `9fd90f20` through a documentation-only commit. All 27 dependency paths remain identical to the frozen snapshot. Integration verification on the snapshot: 19 assembly/profile/worker-prompt tests and one missing-contract admission test pass; typecheck, helper/reference projections and state-boundaries pass. The primary workflow check also passes. Reuse the dependency's prior wider evidence for unchanged behavior and run the combined helper cases after the merge. No remote push, remote-main update, host installation or full-suite rerun is part of this integration.

The prerequisite landed as `6c19234e`, with all staged blobs verified against the frozen manifest immediately before commit. Merging it into diagnostics commit `be6e90f8` produced no conflicts; the shared helper test retains both the bounded-delta phase and the stable diagnostic-shape assertion.

- Combined helper command: `bun test tests/helper-scripts.test.ts --test-name-pattern 'verify-sprint (rejects a criterion|composes executed|reports unavailable)|check-task-workflow delegates missing-contract' --timeout 60000`.
- Result: 6 pass, 0 fail, 157 assertions, 35.42 seconds. Log: `/tmp/verify-context-integration-okcr7mzn/combined-helper.log`.
- Merged typecheck, 56 helper projections, 23 reference projections, shell syntax and whitespace: pass.
- Merged deploy SQL, strict workflow, project inspector and init dry-run: pass; no drift or planned init operations. Architecture sync passes with pending/running/dead-letters all zero.
- Task-sync comparison is bound to prerequisite `6c19234e` and the final substantive digest above. Earlier verification results retain their original scope; this combined run covers the actual overlapping test seam.
- Local main was checked clean at `6c19234e` immediately before a fast-forward to merge commit `a0bcf49d`. Both prerequisite `6c19234e` and diagnostics `be6e90f8` are ancestors of main; the post-merge worktree is clean. The only delta from the prerequisite is the five-path diagnostics patch and its evidence. Main integration is complete.

## Archive Boundary

`scripts/archive-workflow.sh:215` still requires an active contract, review and AcceptanceReceipt for every Completed archive; it has no standard single-plan branch. This standard task has no such artifacts. Do not fabricate them or bypass the gate. Main integration can complete independently; plan archival remains a bounded workflow compatibility gap.
