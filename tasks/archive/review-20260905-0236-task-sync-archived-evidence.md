> **Archived**: 2026-09-05 02:36
> **Related Plan**: plans/archive/plan-20260905-0201-task-sync-archived-evidence.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260905-0236
> **Archive Projection V1**: `plans/plan-20260905-0201-task-sync-archived-evidence.md` => `plans/archive/plan-20260905-0201-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/notes/20260905-0201-task-sync-archived-evidence.notes.md` => `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0201-task-sync-archived-evidence.contract.md` => `tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0201-task-sync-archived-evidence.review.md` => `tasks/archive/review-20260905-0236-task-sync-archived-evidence.md`

# Task Review: task-sync-archived-evidence

> **Status**: Accepted
> **Plan**: plans/archive/plan-20260905-0201-task-sync-archived-evidence.md
> **Contract**: tasks/archive/contract-20260905-0236-task-sync-archived-evidence.md
> **Notes File**: tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-09-05 02:27
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:32fe5cb123d9b9158674178c970ff5f1c70ef07a2a459e4c01ad36824015921a
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 059a48cee2e53bfaaf5b4bda1a3cf28d342efbca

## Human Review Card

- Verdict: pass
- Change type: bugfix
- Intended files changed: source helper, packaged helper mirror, focused regression test, and workflow artifacts.
- Actual files changed: `scripts/check-task-sync.sh`, `assets/templates/helpers/check-task-sync.sh`, `tests/check-task-sync.test.ts`, plus the active plan/contract/review/notes projections.
- Commands passed: focused 25-test suite; full 4,152-test suite; mirror comparison; required deploy, architecture, task-sync, workflow, project-state, and init checks.
- Residual risks: none blocking; archive eligibility intentionally remains limited to destination paths absent at the effective base.
- Reviewer action required: none.
- Rollback: revert the classifier and two regression cases; no data migration exists.

## Mode Evidence

- Selected route: Waza `hunt` for diagnosis and red/green proof, then Waza `check` for final diff review.
- P1/P2/P3 evidence: the source helper owns self-host enforcement, the byte-identical asset helper owns downstream projection, and `tests/check-task-sync.test.ts` exercises the real shell entrypoint in disposable Git repositories. The traced failing route is closeout archive publication → CI base-range changed-path classification → empty `evidence_files` → false rejection. The chosen boundary admits only newly added canonical lifecycle archives and preserves rejection of historical edits.
- Root cause or plan evidence: `.ai/harness/runs/task-sync-archived-evidence/pre-fix.log` records the unfixed test failure with `PRE_FIX_EXIT=1`; `tasks/archive/notes-20260905-0236-task-sync-archived-evidence.md` binds the exact substantive digest.

## Verification Evidence

- Waza `/check` run: pass, Standard-depth review, on target, zero findings.
- Commands run: `bun test tests/check-task-sync.test.ts --timeout 60000`; `bun test --timeout 60000`; `cmp scripts/check-task-sync.sh assets/templates/helpers/check-task-sync.sh`; all repository Required Checks.
- Manual checks: read the complete classifier diff; checked NUL-delimited path handling, Bash 3.2-compatible arrays, Git rename-config independence, archive-family bounds, and exact-digest reuse.
- Supporting artifacts: `.ai/harness/runs/task-sync-archived-evidence/pre-fix.log`.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json`.

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Codex
> **Source**: codex-plugin
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:32fe5cb123d9b9158674178c970ff5f1c70ef07a2a459e4c01ad36824015921a
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 059a48cee2e53bfaaf5b4bda1a3cf28d342efbca
> **Verification Evidence SHA256**: sha256:9ba96c6efc4b54e5f04b5d5732525ea038913671ade7de9adb946b5bec10d077
> **Issued At**: 2026-09-04T18:36:14.424Z

- Summary: Task-sync admits exact-digest evidence only from newly added canonical archive artifacts; focused and full suites pass with historical archive edits still rejected.
- Findings: none

## Behavior Diff Notes

- Same-publication archived plan/contract/review/notes artifacts can now satisfy task-sync when they carry the exact substantive digest.
- Modified historical archives, todo archives, and generic archive files remain non-evidence.
- Source and packaged helpers remain byte-identical.

## Residual Risks / Follow-ups

- None. No new dependency, file format, public flag, or abstraction was introduced.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Red/green regression covers the observed CI route and the laundering negative case. |
| Product depth | 10/10 | Preserves the existing single-publication workflow and authority model. |
| Design quality | 9/10 | Small classifier extension; explicit `--no-renames` removes user-config variance. |
| Code quality | 9/10 | Bash 3.2-compatible and mirror-checked; bounded linear scans are negligible at workflow-artifact scale. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/check-task-sync.test.ts --timeout 60000`.
- Re-check: `cmp scripts/check-task-sync.sh assets/templates/helpers/check-task-sync.sh && bash scripts/check-task-sync.sh`.

## Summary

- PASS. The implementation fixes the observed CI false negative without allowing historical archive edits to become current workflow evidence.
