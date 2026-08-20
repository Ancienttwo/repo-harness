> **Archived**: 2026-08-20 16:19
> **Related Plan**: plans/archive/plan-20260731-0612-receipt-fingerprint-normalization.md
> **Outcome**: Superseded
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-1619

# Task Review: receipt-fingerprint-normalization

> **Status**: Pending
> **Plan**: plans/plan-20260731-0612-receipt-fingerprint-normalization.md
> **Contract**: tasks/contracts/20260731-0612-receipt-fingerprint-normalization.contract.md
> **Notes File**: tasks/notes/20260731-0612-receipt-fingerprint-normalization.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-31 06:12
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
> **Reviewed Subject SHA256**: sha256:d0e10026ccb39944974a12454b01dfd1efd682e3457013ebc1b45e1fc495b839
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 8b506da48fac02cb1a9e7134037cabd506636212
> **Verification Evidence SHA256**: sha256:a514df69e0c65923109a29f817f48c96d9fec7e92cf41d87b3edaaa179d24f53
> **Issued At**: 2026-07-31T00:54:45.603Z

- Summary: gatekeeper PASS with the Root Cause Evidence gate fully green. One-line fix at scripts/acceptance-receipt.ts:244 replacing sha256(JSON.stringify(canonical)) with sha256(stableJson(canonical)); stableJson already existed in the same file at :105-110 and was the local pattern for waiverGrantFingerprint at :274, so the fingerprint becomes key-order invariant with no new abstraction and no change to the evidence ledger storage layer. Root cause of the non-determinism: canonical.benchmark_evidence and canonical.commands are pass-through references into the parsed checks/latest.json, whose key order depends on whether the winning event stayed under the 8192-byte inline cap (producer order preserved) or was offloaded to the blob path (keys recursively sorted), so two semantically identical rematerializations could hash differently. Sealing this package required a bootstrap step, recorded in notes: merge-gate must run from the installed runtime, which still carried the pre-fix algorithm and therefore rejected a valid receipt, so the global install was replaced with a build of this tree under owner approval. The assets/templates/helpers mirror is byte-identical to the script and the falsifier was exercised in both directions. This run recorded 17/17 exit criteria green with allowed_paths clean and full suite green.
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
