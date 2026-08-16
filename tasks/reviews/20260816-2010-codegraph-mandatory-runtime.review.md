# Task Review: codegraph-mandatory-runtime

> **Status**: Pass
> **Plan**: plans/plan-20260816-2010-codegraph-mandatory-runtime.md
> **Contract**: tasks/contracts/20260816-2010-codegraph-mandatory-runtime.contract.md
> **Notes File**: tasks/notes/20260816-2010-codegraph-mandatory-runtime.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-16 20:10
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:398bd2654f23db5bda3a55abe0a172440932142c01c62603ff293a66e73d153a
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7e9d5703c9b00cce0cd8f385aa09e5aa601e0220

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: dependency manifest/lock, CodeGraph CLI/runtime/init paths, tests, mirrored docs, architecture/workflow artifacts
- Actual files changed: matches the Change Assessment subject plus plan/contract/review/notes/todo workflow projections
- Commands passed: focused CodeGraph/CLI tests, typecheck, full suite, deploy/architecture/task/workflow gates, inspector, init dry-run
- Residual risks: production install size increases because CodeGraph carries a platform-native binary; removal of the opt-out is intentionally breaking
- Reviewer action required: none before commit review
- Rollback: revert the work-package commit as one unit

## Mode Evidence

- Selected route: approved work-package in isolated contract worktree
- P1/P2/P3 evidence: captured in the active plan and verified against package, CLI router, global runtime, init, and CodeGraph tooling owners
- Root cause or plan evidence: split dev/optional/init-skip semantics contradicted the user-approved mandatory runtime contract

## Verification Evidence

- Waza `/check` run: main-thread equivalent completed against the frozen Change Assessment subject
- Commands run: `bun run check:type`; `bun test`; all six required repo checks; focused CLI/CodeGraph tests
- Manual checks: npm registry latest `1.5.0`; public help has no `--no-codegraph` or `--sync-codegraph`; init remediation points to `repo-harness update`
- Supporting artifacts: `.ai/harness/checks/change-assessment.latest.json`
- Implementation notes reviewed: yes
- Run snapshot: full suite 2446 pass, 1 platform skip, 0 fail

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

- CodeGraph moves from exact devDependency to exact production dependency at the
  same registry-latest version `1.5.0`.
- Global install/update have no CodeGraph opt-out and always reconcile CLI/MCP.
- Applied init initializes and syncs the index, fails closed if CLI/index is not
  usable, and leaves dry-run/HOME boundaries intact.

## Residual Risks / Follow-ups

- Package install size grows substantially due to the platform-native CodeGraph
  artifact; this is accepted by the explicit hard-dependency requirement.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Mandatory global and repo-local paths are covered, including failure and idempotency. |
| Product depth | 9/10 | Install, update, init, package delivery, help, docs, and architecture agree. |
| Design quality | 10/10 | Global HOME ownership and repo-local index ownership remain separated. |
| Code quality | 9/10 | Small authority-preserving edits with focused regression coverage. |

## Failing Items

- None.

## Retest Steps

- Re-run: `bun test tests/cli/init.test.ts tests/cli/global-runtime-init.test.ts tests/tooling/codegraph-integration.test.ts`
- Re-check: `bun test` and the Required Checks in root `AGENTS.md`

## Summary

- PASS. The diff implements the mandatory CodeGraph contract without a
  compatibility fallback and preserves repo-init state boundaries.
