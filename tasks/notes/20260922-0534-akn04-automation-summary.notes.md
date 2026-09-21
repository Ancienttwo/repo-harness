# Implementation Notes: akn04-automation-summary

> **Status**: Active
> **Plan**: plans/plan-20260922-0534-akn04-automation-summary.md
> **Contract**: tasks/contracts/20260922-0534-akn04-automation-summary.contract.md
> **Review**: tasks/reviews/20260922-0534-akn04-automation-summary.review.md
> **Last Updated**: 2026-09-22 05:34
> **Lifecycle**: notes

## Design Decisions

The summary preserves separate source observations and original digests instead of synthesizing a repository-wide last decision or running flag. Controller and budget attention owners retain their native vocabularies. Campaign latest receipt selection refuses an ambiguous timestamp tie. The original Campaign journal snapshot helper takes a lock, so the existing private receipt parser was exported and reused without that helper. Budget board reads explicitly receive the request environment.

## Deviations From Plan Or Spec

No product deviation. Repository envelope and collector start advance to protocol2 in the same package. Native admission/turn authority, Campaign typed reason and Campaign attention owner remain unavailable because existing original records do not provide them.

## Corrections

The initial Campaign receipt test compared the API result wrapper with the stored receipt; it was corrected to result.step_receipt, preserving the owner schema. Typed count/range checks and original contract_less enum were lifted from source authority.

## Open Questions

This worktree has no local CodeGraph index authorization. Canonical verification, one independent semantic acceptance and stage PR remain outstanding. Runtime installation and main merge are outside this slice.
