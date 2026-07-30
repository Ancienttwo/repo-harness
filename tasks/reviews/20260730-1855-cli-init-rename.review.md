# Task Review: cli-init-rename

> **Status**: Pending
> **Plan**: plans/plan-20260730-1855-cli-init-rename.md
> **Contract**: tasks/contracts/20260730-1855-cli-init-rename.contract.md
> **Notes File**: tasks/notes/20260730-1855-cli-init-rename.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-30 18:55
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
> **Reviewed Subject SHA256**: sha256:6dc987e60407399f97ed9a09a0f27ce84c7b3a742feadc646b6d34e2875ae191
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 4a795875ddccad7709115a8a20cff63cd06be1ae
> **Verification Evidence SHA256**: sha256:d885e7c3c31cf8fb8e052fd90f6ab972fd41d095d3c440f83c2d5c03b4a97c76
> **Issued At**: 2026-07-30T20:59:27.845Z

- Summary: gatekeeper PASS across all seven gates, with five deviations individually verified as intended rather than drift. The rename makes 'repo-harness install' the only global bootstrap and 'repo-harness init' the repo-local adoption command carrying the former 'adopt' implementation and flags unchanged; 'adopt' and the duplicate global 'init' block are removed fail-closed with no alias or stub. The at-rest protocol-1 manifest literal stays frozen at 'adopt' so previously adopted repos can still roll back, which the falsifier confirmed via tests/cli/adoption-plan.test.ts staying green unchanged. This run recorded 16/16 exit criteria green with allowed_paths clean across all 94 files, full suite 2097 pass 0 fail, and the three byte-identity diffs (CLAUDE/AGENTS pairs and the workflow contract mirror) all clean.
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
