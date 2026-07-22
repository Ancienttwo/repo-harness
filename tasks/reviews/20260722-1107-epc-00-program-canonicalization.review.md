# Task Review: epc-00-program-canonicalization

> **Status**: Reviewed
> **Plan**: plans/plan-20260722-1107-epc-00-program-canonicalization.md
> **Contract**: tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md
> **Notes File**: tasks/notes/20260722-1107-epc-00-program-canonicalization.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-22 12:05
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pass
- Change type: docs-only
- Intended files changed: package plan/contract/review/notes; `plans/sprints/20260722-0001-evidence-projection-convergence.sprint.md`; `tasks/todos.md` (projection line only)
- Actual files changed: exactly the intended set (6 files, single commit `848d7979` on base `ba0e3970`); `tasks/current.md`, `src/`, `scripts/`, `tests/`, `assets/`, `package.json`, `docs/researches/` untouched
- Commands passed: `contract-run preflight --json` (preflight_pass), `check-task-workflow --strict` ([workflow] OK), `bun test` (1680 pass / 0 fail / 1 skip), `check-deploy-sql-order.sh`, `check-architecture-sync.sh` (advisory, blocking=0), `check-task-sync.sh`, `inspect-project-state.ts` (no drift signals), `adopt --dry-run` (0 operations, self-host expected)
- Residual risks: D6 payload-cap attribution cites the PostBash offload precedent, which matches on line count (200) but not bytes (existing 32768 vs the frozen 8 KiB — the 8 KiB choice is explicit and deliberate); D9 verdicts are preliminary pending EPC-07's full consumer inventory
- Reviewer action required: none further — acceptance review completed by gatekeeper (read-only, fresh context) with verdict PASS
- Rollback: revert the single docs-only PR; no runtime, test, or production surface changes

## Mode Evidence

- Selected route: planning (captured work-package plan, docs-only profile)
- P1/P2/P3 evidence: plan Captured Planning Output sections P1/P2/P3; current-state anchors verified against `scripts/verify-sprint.sh:504`, `src/cli/hook/command-observed.ts:220`, `src/cli/hook/session-context-budget.ts:5,52`, `.ai/hooks/lib/workflow-state.sh:1771`
- Root cause or plan evidence: not a bugfix; design-freeze authorization package per sprint row 4

## Verification Evidence

- Waza `/check` run: acceptance review executed by gatekeeper agent (fresh context, read-only) — verdict PASS
- Commands run: see Human Review Card; all executed inside the contract worktree at `848d7979`
- Manual checks: sprint document contains R1 `POST_VGBR_SHA` pin, Program annotation, Row 4 frozen decisions D1–D9 with all sub-decisions closed, amended rows 12/13 acceptance cells, rows 5–13 machine-operability confirmation; "pure post-HRD" appears only inside the prohibition sentence; EPC-08 numbers in row 12 match the frozen confirmation text exactly
- Supporting artifacts: `.ai/harness/checks/latest.json`; gatekeeper verdict recorded in session
- Implementation notes reviewed: yes — four non-obvious decisions recorded
- Run snapshot: `.ai/harness/runs/`

## Manual Check Evidence

- [x] Sprint document contains R1 pin, Program annotation, Row 4 frozen decisions D1-D9, amended rows 12/13, rows 5-13 confirmation
  - Evidence: gatekeeper acceptance review (fresh context, read-only) verified in the worktree at `848d7979`: R1 section records `POST_VGBR_SHA = ba0e3970...` (sprint lines 84–87); `## Program annotation — VGBR baseline provenance (finalized by EPC-00)` present (lines 155–173) with "pure post-HRD" occurring only inside the prohibition sentence; `### Frozen decisions (EPC-00, 2026-07-22)` closes all D1–D9 sub-decisions; rows 12/13 acceptance cells amended; `### Rows 5–13 machine-operability confirmation (EPC-00)` present with EPC-08 numbers matching row 12 exactly.
- [x] PR diff confined to allowed_paths
  - Evidence: `git diff --name-only ba0e3970..HEAD` lists exactly the six files enumerated in this contract's `allowed_paths` (package plan/contract/review/notes, the sprint document, `tasks/todos.md`); no other path appears.
- [x] tasks/current.md untouched
  - Evidence: `git diff ba0e3970..HEAD -- tasks/current.md` is empty; `git status --porcelain` shows no entry for `tasks/current.md`.

## Acceptance Receipt Projection

> **Disposition**: unavailable
> **Reviewer**: unavailable
> **Source**: unavailable
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending
> **Verification Evidence SHA256**: pending
> **Issued At**: pending

- Summary: No AcceptanceReceipt has been recorded.
- Findings: none

## Behavior Diff Notes

- Docs-only: no runtime behavior changes. The sprint Program document gains normative design authority (frozen D1–D9) that rows 5–13 contracts will cite; rows 12/13 acceptance lines became machine-checkable.

## Residual Risks / Follow-ups

- D6 precedent-attribution wording ("PostBash offload precedent" matches line count only) — one-word clarification may ride a later sprint edit; not worth a re-spin (gatekeeper MEDIUM, non-blocking).
- Plan file carries a duplicated trailing `## Task Breakdown` fragment from the capture tool — cosmetic (gatekeeper LOW).
- If EPC-07's inventory finds a fifth recovery-view consumer, D9's merge/retire map is revised in EPC-07's contract.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Row-4 acceptance line fully satisfied; all sub-decisions closed |
| Product depth | 9/10 | Decisions grounded in verified current-state anchors |
| Design quality | 9/10 | Single design authority in the Program doc; no dual authority |
| Code quality | 9/10 | Docs-only; diff confined to allowed_paths; checks green |

## Failing Items

- none

## Retest Steps

- Re-run: `repo-harness run contract-run preflight --contract tasks/contracts/20260722-1107-epc-00-program-canonicalization.contract.md --repo . --json`; `repo-harness run check-task-workflow --strict`
- Re-check: sprint document sections (R1 pin, Program annotation, Frozen decisions, rows 12/13 cells) against the contract's manual checks

## Summary

- EPC-00 freezes D1–D9 with explicit closed sub-decisions in the sprint Program document, pins `POST_VGBR_SHA = ba0e3970`, records the finalized Program annotation, confirms rows 5–11 machine-operable as written, and amends rows 12/13 into machine-checkable acceptance lines. Gatekeeper acceptance verdict: PASS. Ready to ship as one docs-only PR.
