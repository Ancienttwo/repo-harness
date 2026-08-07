# Task Review: mcp-oauth-client-ttl-active-token

> **Status**: Pending
> **Plan**: plans/plan-20260807-0850-mcp-oauth-client-ttl-active-token.md
> **Contract**: tasks/contracts/20260807-0850-mcp-oauth-client-ttl-active-token.contract.md
> **Notes File**: tasks/notes/20260807-0850-mcp-oauth-client-ttl-active-token.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-07 08:50
> **Recommendation**: fail
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: pending

## Human Review Card

- Verdict: pending
- Change type: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | frontend
- Intended files changed:
- Actual files changed:
- Commands passed:
- Residual risks:
- Reviewer action required: inspect diff and card
- Rollback:

## Mode Evidence

- Selected route:
- P1/P2/P3 evidence:
- Root cause or plan evidence:

## Verification Evidence

- Waza `/check` run:
- Commands run:
- Manual checks:
- Supporting artifacts:
- Implementation notes reviewed:
- Run snapshot:

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:21ef5ff66c50f75ac83af337d17fb8415c6d60dae7f897ae48c563e935bc913e
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 7e9d6361aed4bd05b706241a75b4b5a4f8ea4784
> **Verification Evidence SHA256**: sha256:7d6c962602516d147c2eb1c95cb73a0edcb309a5987de735fdf1f8a48aaf83db
> **Issued At**: 2026-08-07T02:18:40.339Z

- Summary: Gatekeeper acceptance for issue #161: cleanupExpiredClients() and load() share one isRemovableClient() predicate that exempts a past-TTL client only while it holds an unexpired access token, or an unexpired refresh token resolving to an access-token record it owns. Scope matches contract allowed_paths with no out-of-scope edits. Security boundary verified: /authorize is passphrase-gated (src/cli/mcp/transports/http.ts:680), so unauthenticated spam registrations never obtain tokens and are still cleaned at 30 days; zombie access+refresh pairs stay removable; malformed client_id_issued_at remains an unconditional delete. Pre-fix RED artifact shows PRE_FIX_EXIT=1 with only the two keep-alive cases failing. verify-sprint 16/16 Fulfilled, bun test 587922ms green, bun run check:type green.
- Findings: none

## Behavior Diff Notes

- ...

## Residual Risks / Follow-ups

- ...

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 0/10 | |
| Product depth | 0/10 | |
| Design quality | 0/10 | |
| Code quality | 0/10 | |

## Failing Items

- ...

## Retest Steps

- Re-run:
- Re-check:

## Summary

- ...
