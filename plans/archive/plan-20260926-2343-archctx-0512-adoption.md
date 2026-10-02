> **Archived**: 2026-09-28 00:16
> **Related Plan**: plans/archive/plan-20260926-2343-archctx-0512-adoption.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260928-0016
> **Archive Projection V1**: `plans/plan-20260926-2343-archctx-0512-adoption.md` => `plans/archive/plan-20260926-2343-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/notes/20260926-2343-archctx-0512-adoption.notes.md` => `tasks/archive/notes-20260928-0016-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/contracts/20260926-2343-archctx-0512-adoption.contract.md` => `tasks/archive/contract-20260928-0016-archctx-0512-adoption.md`
> **Archive Projection V1**: `tasks/reviews/20260926-2343-archctx-0512-adoption.review.md` => `tasks/archive/review-20260928-0016-archctx-0512-adoption.md`

# Plan: ArchContext 0.5.12 candidate adoption

> **Status**: Archived
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Registry-backed dependency closure, one canonical release gate, exact-subject AcceptanceReceipt and normal consumer readback.
> **Rollback Surface**: Revert this adoption branch's dependency/default-version changes and validated Bun handoff together; preserve upstream publication and other worktrees.
> **Task Contract**: tasks/archive/contract-20260928-0016-archctx-0512-adoption.md

## P1 map
Projection and refactor share one package-local archctx producer. Runtime required-version constants, package dependencies, generated policy defaults and validation fixtures must agree. Global projection configuration intentionally cannot override the version.

## P2 trace
Installed repo-harness -> global projection config -> ARCHCTX_REQUIRED_VERSION -> package-local binary/capabilities -> daemon-owned ADR renderer. Version 0.5.11 renders ADR headings/paths incorrectly; real 0.5.12 source already reads frontmatter and computes index-relative links. A tarball override alone fails the strict version handshake.

## P3 decision
Upgrade the consumer dependency declarations, both existing strict constants, policy seeds and their matching tests to 0.5.12. Use isolated candidate file-tarball installation for verification until both upstream packages exist in the registry. Preserve all version refusals and the green PR #454. Executable AXR runner fixtures track the new consumer pin; recorded historical AXR evidence stays unchanged. No product fallback. Owner subsequently approved normal downstream adoption on 2026-09-27. Both packages are now published and bun.lock records their actual registry integrities.

## Scope
Parent owns the enumerated contract paths in this isolated worktree. No subagent writes; preserve concurrent worktrees. Publication/merge is approved; installed-candidate evidence remains distinct from registry and normal-runtime evidence.

## Task Breakdown
- [x] Align current consumer version pins and tests.
- [x] Build/install a real consumer candidate with both real producer tarballs.
- [x] Restore ArchContext ADR projections through the installed daemon and verify links/titles.
- [x] Record validation and the registry lock/adoption boundary.

- [x] Fix and review validated Bun handoff (26423656); preserve standalone runtime discovery.
- [x] Regenerate real registry lock after producer publication (2026-09-27).
- [x] Repair plan admission, bind the candidate CLI, refresh indexed projection and reconcile the exact proof-only signal.
- [ ] Complete canonical release verification and bind final AcceptanceReceipt (first execution stopped after four failures in three existing test files).
- [ ] Merge, publish 0.19.3 and verify normal downstream adoption.

Registry publication is now verified and bun.lock regenerated from npm. The validated launcher fix is already present. Final consumer release verification and acceptance remain open; no publication result is inferred from dependency installation.

## Current verification boundary (2026-09-27)
Published dependencies are installed and locked. Plan admission now passes; the worktree-local CodeGraph index is initialized and the package-owned daemon was upgraded from 0.5.10 to 0.5.12. Indexed projection preserves model/flow-proof digests and updates only its manifest. Proof-only reconciliation and final frozen verification determine readiness; main and global CLI installation remain unchanged until those gates pass.

## Promotion Gate

- **Merge/PR unit**: The ArchContext 0.5.12 consumer adoption branch, including the already reviewed validated Bun handoff.
- **Rollback surface**: Revert the adoption dependency/default pins and launcher handoff together; never alter upstream publication or unrelated worktrees.
- **Verification boundary**: Execute the contract Verification Plan once after projection reconciliation and registry lock freeze; retain existing focused evidence as historical context.
- **Review/acceptance boundary**: One exact-subject typed AcceptanceReceipt under the existing contract policy before merge.
- **High-risk surface**: Package-local executable identity, strict projection/refactor capability admission and installed runtime handoff.
- **Why not checklist row**: The paired producer dependency closure has an independently verifiable installation and rollback boundary.

## Evidence Contract

- **State/progress path**: This plan's Task Breakdown and tasks/archive/contract-20260928-0016-archctx-0512-adoption.md; task notes and review share the same stem.
- **Verification evidence**: .ai/harness/checks/latest.json and .ai/harness/runs/ retain canonical Verification Plan execution and acceptance inputs.
- **Evaluator rubric**: Registry pins, installed capabilities and strict runtime constants agree; canonical checks and exact-subject acceptance pass without semantic fallback.
- **Stop condition**: Approved adoption is merged and normal consumer readback passes; final release/publication remains subject to its existing canonical gates.
- **Rollback surface**: Revert the bounded adoption diff while preserving registry artifacts and concurrent WIP.

## Approved acceptance unblock (2026-09-27)

Owner approved resolving the current proof-only candidate and plan admission, then completing verification and integration. P1: architecture projection runtime owns its candidate/receipts, CodeGraph owns source proof, and this plan owns workflow admission. P2: prepare-acceptance invokes automatic projection; the unindexed worktree produced only verified-flow-proof-changed, which reconciliation can retire only after a CodeGraph-ready empty noop. P3: initialize the worktree-local index via the supported ensure command, let the producer regenerate projection-owned artifacts, then reconcile the exact signal. Do not create semantic nodes, forge approval, delete candidates or bypass strict gates. At 10x source size indexing/proof time dominates; no new abstraction is needed. Projection-owned docs are allowed only when this accepted proof refresh generates them.

## Release verification blocker

Original plan/projection blockers are resolved. The frozen release gate is failed/incomplete after multiple subprocess deadline/process-tree failures in architecture-drift, architecture-projection-continuation and architecture-projection-provider tests. See the existing notes for exact evidence and the bounded serial diagnosis slice. External acceptance, merge and publication remain pending.

## Serial diagnosis result

- [x] Replay the three failed files serially and compare still-failing cases against the pre-adoption baseline.
- Outcome: 61 pass / 2 fail. CLI drain timeout reproduces on baseline 0.5.11; the process-tree case passes in isolated baseline and candidate runs but fails in the complete file. No behavior or assertions changed. Next bounded investigation is the deterministic disabled-provider CLI cascade timeout; release acceptance remains pending.

## Verified environment correction

- [x] Trace the stable CLI drain timeout and validate the unchanged case with controlled temporary storage.
- Three relevant files pass: 63 tests / 411 assertions. Use the already-declared TMPDIR input with an isolated /private/tmp directory for the next canonical release execution. Source, assertions and deadlines remain unchanged; durable diagnosis is in docs/researches/20260927-bun-temporary-directory-startup.md.
