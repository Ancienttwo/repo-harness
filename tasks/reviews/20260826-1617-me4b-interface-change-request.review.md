# Task Review: me4b-interface-change-request

> **Status**: Review
> **Plan**: plans/plan-20260826-1617-me4b-interface-change-request.md
> **Contract**: tasks/contracts/20260826-1617-me4b-interface-change-request.contract.md
> **Notes File**: tasks/notes/20260826-1617-me4b-interface-change-request.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-28 01:15
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: official Codex plugin found one P1 authority split in the frozen subject; the local correction is implemented and focused verification passes, but the corrected exact-subject Protocol-2 AcceptanceReceipt remains unavailable.
- Change type: code-change
- Intended files changed: ME-4B core/store, restricted Engineer MCP and Human CLI adapters, focused tests, architecture projection, PRD/research and workflow evidence.
- Actual files changed: 42 files relative to current main, 2,807 insertions and 76 deletions before final evidence closeout.
- Commands passed: focused ME-4B/MCP suite 27/27; typecheck; architecture projection suite 7/7; deploy SQL order; architecture sync; task sync; strict workflow; project-state inspection; init dry-run; CLI help; diff check.
- Residual risks: Protocol-2 acceptance is not yet issued. The corrected subject still requires the full root replay and a fresh exact-subject freeze before Human owner acceptance.
- Reviewer action required: after corrected-subject freeze, issue an exact-subject Human owner waiver; the one-semantic-review budget was consumed by the official plugin finding and must not be retried.
- Rollback: revert the ME-4B core/store/adapters/tests and capability projection plus the narrow scheduling validator export as one unit.

## Mode Evidence

- Selected route: code-change / shared authority and authentication boundary / deep review.
- P1/P2/P3 evidence: plan and implementation notes map the request authority, trace authenticated Engineer and Human transitions end to end, and preserve the existing Binding, Work Package, Git and Acceptance authorities.
- Root cause or plan evidence: the approved ME-4B PRD and Architecture Acceptance freeze the actor matrix and prohibit direct planning/product mutation.

## Verification Evidence

- Waza `/check` run: equivalent deep review and root checks executed directly; exact-subject verifier remains pending.
- Commands run: original subject checks plus corrected-path `bun run check:type` and 29 focused ME-1A/ME-4B/CLI/MCP tests.
- Manual checks: exact MCP inventory; Human CLI command inventory; no authorization ID in semantic records; no direct Task/Lease/Publication/Acceptance/architecture-event writer; no message-body transition; no compatibility fallback.
- Supporting artifacts: final Architecture Acceptance `changeset.docs-projection-6cd2b7682023a2b6` / `event.user-approval-20260828-me4b-codex-review-fix-architecture`; accepted apply receipt `sha256:1c587389fc7227dc2369b38dbc9761a772bc8d5db99c73ac6b828476e50e7627`; source-only fixed point `sha256:e0a4869379f4ff639a58ecb35b08177978fb94214338386d79ff1a01105e534c`.
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

- Summary: No exact-subject AcceptanceReceipt has been recorded for the corrected subject.
- Findings: official Codex plugin reported that local `projectedGraphAt` could accept a non-canonical commit with missing/stale referenced authorities. The correction removes that shadow projection, shares the ME-1A projection, and requires equality with the current canonical-target commit.

## Behavior Diff Notes

- Authenticated Engineer MCP adds exactly `propose`, `submit`, `cancel`, `materialize`, and `implemented`; the server derives the principal from the existing OAuth authorization carrier and the store revalidates the current Binding under lock.
- Human CLI owns only `accept`, `reject`, `cancel`, and `integrated` plus read/lookup. Acceptance writes an immutable Work Package projection but never edits Sprint or Work Graph bytes.
- `materialize` requires the exact current canonical-target commit and reuses the complete ME-1A Work Graph projection, including referenced-authority and capability validation; implementation and integration evidence remain separate actor-fenced transitions.
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

- Corrected: the official plugin P1 authority split in `interface-change-store.ts`; regression coverage now rejects non-canonical commits and stale referenced-authority bytes.
- Closeout-only: corrected exact-subject AcceptanceReceipt is unavailable.
- Verification-only: full strict replay must freeze the corrected subject.

## Retest Steps

- Re-run: `bun test tests/unit/me4b-interface-change-request.test.ts tests/cli/interface-change.test.ts tests/cli/mcp-engineer-tools.test.ts tests/cli/mcp-http.test.ts --timeout 60000`.
- Re-check: typecheck, root required checks, exact MCP/CLI inventory, architecture fixed point, branch ancestry and Protocol-2 receipt after final rebase.

## Summary

- The official semantic review correctly blocked the prior subject. Its P1 and the matching ArchContext selector are corrected; root replay, corrected-subject freeze and Human owner acceptance remain before merge.
