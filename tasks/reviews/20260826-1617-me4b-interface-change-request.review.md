# Task Review: me4b-interface-change-request

> **Status**: Review
> **Plan**: plans/plan-20260826-1617-me4b-interface-change-request.md
> **Contract**: tasks/contracts/20260826-1617-me4b-interface-change-request.contract.md
> **Notes File**: tasks/notes/20260826-1617-me4b-interface-change-request.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-27 03:05
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: local implementation review passes; the exact-subject Protocol-2 AcceptanceReceipt remains unavailable.
- Change type: code-change
- Intended files changed: ME-4B core/store, restricted Engineer MCP and Human CLI adapters, focused tests, architecture projection, PRD/research and workflow evidence.
- Actual files changed: 42 files relative to current main, 2,807 insertions and 76 deletions before final evidence closeout.
- Commands passed: focused ME-4B/MCP suite 27/27; typecheck; architecture projection suite 7/7; deploy SQL order; architecture sync; task sync; strict workflow; project-state inspection; init dry-run; CLI help; diff check.
- Residual risks: Protocol-2 acceptance is not yet issued. The pre-rebase full suite reached 3,173 pass / 2 skip / 2 timeout failures; ME-2A passed 9/9 in isolation, and the independent HRD-09 fix is now on main and passes its isolated 234-expectation test after rebase. Final full-suite replay remains part of subject freeze.
- Reviewer action required: review the frozen final subject through the official Codex plugin or issue an exact-subject Human waiver.
- Rollback: revert the ME-4B core/store/adapters/tests and capability projection plus the narrow scheduling validator export as one unit.

## Mode Evidence

- Selected route: code-change / shared authority and authentication boundary / deep review.
- P1/P2/P3 evidence: plan and implementation notes map the request authority, trace authenticated Engineer and Human transitions end to end, and preserve the existing Binding, Work Package, Git and Acceptance authorities.
- Root cause or plan evidence: the approved ME-4B PRD and Architecture Acceptance freeze the actor matrix and prohibit direct planning/product mutation.

## Verification Evidence

- Waza `/check` run: equivalent deep review and root checks executed directly; exact-subject verifier remains pending.
- Commands run: focused tests, `bun run check:type`, architecture projection tests, every root required check, full suite, and isolated reruns of both timed-out test files.
- Manual checks: exact MCP inventory; Human CLI command inventory; no authorization ID in semantic records; no direct Task/Lease/Publication/Acceptance/architecture-event writer; no message-body transition; no compatibility fallback.
- Supporting artifacts: original Architecture Acceptance `changeset.docs-projection-ec265ab39ad694a4` / `event.user-approval-20260827-me4b-architecture-codefacts`; post-rebase Acceptance `changeset.docs-projection-7c52cca5ad375013` / `event.user-approval-20260827-me4b-post-rebase-architecture`; accepted apply receipt `sha256:01458ca92f7ef20e49774c861b68ae4e2ec351f19b9b87af1b08ca4a3ec669ef`.
- Implementation notes reviewed: yes.
- Run snapshot: `.ai/harness/checks/latest.json` plus command output captured during this review.

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

- Summary: No exact-subject AcceptanceReceipt has been recorded.
- Findings: none in the ME-4B implementation diff.

## Behavior Diff Notes

- Authenticated Engineer MCP adds exactly `propose`, `submit`, `cancel`, `materialize`, and `implemented`; the server derives the principal from the existing OAuth authorization carrier and the store revalidates the current Binding under lock.
- Human CLI owns only `accept`, `reject`, `cancel`, and `integrated` plus read/lookup. Acceptance writes an immutable Work Package projection but never edits Sprint or Work Graph bytes.
- `materialize` reads one exact Git commit and reuses ME-1A Work Graph projection; implementation and integration evidence remain separate actor-fenced transitions.
- Malformed Human CLI input now reports `cli_argument_invalid`, domain errors retain their own codes, and unexpected failures report `internal_error`.

## Residual Risks / Follow-ups

- Reverse lookup is an O(n) deterministic scan. It is correct at the current scale; at 10x request volume it is the first likely pressure point and can later gain a rebuildable index without changing semantic records.
- Exact-subject Protocol-2 review/waiver and merge are deliberately still gated.
- The branch is rebased onto the completed HRD-09 repair at `main@7c8aa24e`; no HRD-09 product or workflow bytes are part of the ME-4B diff.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 10/10 | Actor matrix, stale CAS, exact materialization and separate integration are covered. |
| Product depth | 9/10 | Negative authority paths and crash/idempotency boundaries are covered without a generic mutation surface. |
| Design quality | 9/10 | One authority per datum; ME-1A wire bytes and Human planning boundary remain unchanged. |
| Code quality | 9/10 | Closed validators, canonical bytes, typed failures and focused CLI/MCP tests are green. |

## Failing Items

- No finding in the ME-4B implementation diff.
- Closeout-only: exact-subject AcceptanceReceipt is unavailable.
- Verification-only: final post-rebase full-suite replay is still pending; both prior timeout sites pass when run against their corrected isolated conditions.

## Retest Steps

- Re-run: `bun test tests/unit/me4b-interface-change-request.test.ts tests/cli/interface-change.test.ts tests/cli/mcp-engineer-tools.test.ts tests/cli/mcp-http.test.ts --timeout 60000`.
- Re-check: typecheck, root required checks, exact MCP/CLI inventory, architecture fixed point, branch ancestry and Protocol-2 receipt after final rebase.

## Summary

- Deep review verdict PASS for the implementation diff. ME-4B is rebased and Architecture-Accepted; exact-subject freeze plus policy-bound external acceptance remain before merge.
