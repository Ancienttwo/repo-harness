> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260730-2346-mcp-allowed-root-canonicalization.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1619

# Task Review: mcp-allowed-root-canonicalization

> **Status**: Pending
> **Plan**: plans/plan-20260730-2346-mcp-allowed-root-canonicalization.md
> **Contract**: tasks/contracts/20260730-2346-mcp-allowed-root-canonicalization.contract.md
> **Notes File**: tasks/notes/20260730-2346-mcp-allowed-root-canonicalization.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-30 23:46
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
> **Reviewed Subject SHA256**: sha256:d1ae1e96b580e7adb53709ebc546cccfbbddd3aed0a7bc6c21fb701f63f8f247
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: bd2155da7854cbc2252feff8006070f9a0e3102b
> **Verification Evidence SHA256**: sha256:d59c107feb28a2e045b33b6a8616ac94793e3df7126bd4816b64c8d8e13f56dc
> **Issued At**: 2026-07-30T20:32:52.472Z

- Summary: gatekeeper PASS on both co-packaged production defects. Defect 1: src/cli/mcp/policy.ts sensitiveAllowedRootReason wrongly matched the realpath canonicalization prefix, falsely denying allowed roots under a shared TMPDIR; RED guard tests/cli/mcp-allowed-root-canonicalization.test.ts plus captured pre-fix artifact showing PRE_FIX_EXIT=1, GREEN after the prefix strip, falsifier exercised across 7 cases. Defect 2: ensure-task-workflow.sh wrote the resume packet before the current status snapshot, which the whole-second no-tolerance comparison in check-task-workflow read as a stale packet; reordered so the snapshot is written first, clearing the helper-scripts.test.ts:5267 failure 5/5. Full suite green under the gate-runner-equivalent TMPDIR=/tmp environment at 2097 pass 0 fail, and this run recorded 18/18 exit criteria with allowed_paths clean at 10 files.
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
