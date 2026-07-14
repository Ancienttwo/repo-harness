# Task Review: verifier-evidence-lifecycle-cutover

> **Status**: Pending
> **Plan**: plans/plan-20260714-0421-verifier-evidence-lifecycle-cutover.md
> **Contract**: tasks/contracts/20260714-0421-verifier-evidence-lifecycle-cutover.contract.md
> **Notes File**: tasks/notes/20260714-0421-verifier-evidence-lifecycle-cutover.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-14 20:24
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:54d9bd38f9806e6b95100c8510a55da19ba5f70875b38e27102e7e23747c3fbf
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d5a8027959a991c1a0c23cad7923bab8bbe77731

## Human Review Card

- Verdict: fail — implementation evidence passes, but full external acceptance is unavailable
- Change type: code-change
- Intended files changed: verifier, review-subject/acceptance, benchmark producer/validator, synchronized projections, tests, and workflow artifacts named by the contract
- Actual files changed: intended contract scope only; benchmark reports are excluded from review-subject freshness and bound separately by report evidence
- Commands passed: focused merged 241-test suite; typecheck; hook/helper projection checks; required repository checks; GitHub Test and MCP matrices; final Codex 3x9 matrix 27/27
- External acceptance: unavailable; maintainer explicitly instructed the merge workflow to skip `claude-review`
- Residual risks: independent full-scope external acceptance was skipped, so no canonical pass is claimed
- Reviewer action required: none for this maintainer-authorized PR merge; if canonical acceptance is required later, reuse the frozen matrix and review the recorded subject
- Rollback: revert the ordered work-package commits; no external runtime or deployment state was mutated

## Mode Evidence

- Selected route: work-package implementation plus artifact-only closeout
- P1/P2/P3 evidence: implementation notes and `docs/architecture/modules/verification/evals-checks.md`
- Root cause or plan evidence: `docs/researches/20260714-gpt-review.md` and the active plan's captured output

## Verification Evidence

- Waza `/check` run: source-equivalent focused gate passed; final contract gate intentionally remains blocked on this review recommendation
- Commands run: merged 241-test focused surface; `bun run check:type`; hook/helper projection checks; task/workflow/architecture/deploy/adopt/inspection checks; benchmark validator; GitHub CI
- Manual checks: report protocol v2, authoritative=true, 3 bases, 27 arms, 27 passed, sidecar SHA verified
- Supporting artifacts: `evals/harness/reports/profile-comparison.{json,md,sha256.json}`
- Implementation notes reviewed: yes
- Run snapshot: benchmark run `5829bad5-7d59-4698-913f-1eaad8a5813b`

## External Acceptance Advice

> **External Acceptance**: unavailable
> **External Reviewer**: Claude Sonnet via claude-review
> **External Source**: claude-review read-only CLI
> **External Started**: 2026-07-14 09:06:12 +0800
> **External Completed**: 2026-07-14 10:03:00 +0800
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:54d9bd38f9806e6b95100c8510a55da19ba5f70875b38e27102e7e23747c3fbf
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: d5a8027959a991c1a0c23cad7923bab8bbe77731
> **Benchmark Evidence SHA256**: sha256:98dae1f5d54eb8d74b278ee9e13e3d60135049c1ce18b05820389734154a4f4e

- P1 blockers: full external review was explicitly skipped by the maintainer; this remains unavailable rather than being converted into acceptance
- P2 advisories: the completed review-subject chunk initially reported two findings, then withdrew both after being shown the approved no-manual-override and content-subject constraints (`Recommendation: pass`)
- Acceptance checklist: subject and benchmark hashes recorded; source/reviewer recorded; full-scope verdict still unavailable

## Behavior Diff Notes

- Verifier changes production into artifact consumption and rejects forbidden producer/install commands before execution.
- Review/acceptance removes the retired fallback paths in one cutover; target ancestry is provenance rather than content authority.
- Benchmark production retains 27 writable arms but reduces setup authority to three immutable bases under a bounded two-worker producer.

## Residual Risks / Follow-ups

- Canonical external acceptance remains unavailable by explicit maintainer instruction; this is an operator merge waiver, not a product-level fallback or parser exception.
- Full `bun test --max-concurrency 4` previously produced 1388 pass, 1 skip, and one pre-existing `check-agent-tooling` 15-second timeout; focused changed-path tests are green.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Deterministic gates and authoritative 27/27 matrix pass; external acceptance is not functionality evidence. |
| Product depth | 9/10 | Producer/consumer lifecycle, evidence binding, and workflow projections are coherent. |
| Design quality | 9/10 | One authority per datum; no compatibility reader or fallback acceptance remains. |
| Code quality | 9/10 | Focused regression covers timeout descendants, subjects, setup/isolation, and acceptance parsing. |

## Failing Items

- Canonical external acceptance did not complete for the full authority surface.

## Retest Steps

- Optional future canonical review: inspect subject `sha256:54d9bd38f9806e6b95100c8510a55da19ba5f70875b38e27102e7e23747c3fbf`
- Re-check: validate existing benchmark evidence `sha256:98dae1f5d54eb8d74b278ee9e13e3d60135049c1ce18b05820389734154a4f4e`; do not rerun the matrix for unchanged subject

## Summary

- Implementation, current-main integration, GitHub CI, and frozen-subject benchmark production are complete. Recommendation remains fail solely because canonical external acceptance was skipped by maintainer instruction; the PR merge waiver is recorded without changing product authority.
