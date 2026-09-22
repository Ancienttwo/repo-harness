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

The owner approved this worktree existing local CodeGraph index. Canonical verification, one independent semantic acceptance and stage PR remain outstanding. Runtime installation and main merge are outside this slice.

## Frozen upstream integration

P1: repository snapshot23fab610 is canonically verified22/22 and under its single semantic review; accepted context/activity and protected communication are upstream inputs. P2: selected repository scope crosses strict IPC, original Fleet/automation readers, registry recheck and closed browser projection while retaining one exit-held collector. P3: preserve protocol2 cutover and original source validators; integrate only frozen upstream source and archive evidence, then regenerate deterministic proof. No native admission or authorization is inferred from observed records. At10x source history, explicit count/byte/deadline bounds refuse unavailable observations. Upstream acceptance/archive must be integrated before this slice closeout.

## Corrected snapshot integration

P1: #442 frozen12518117 adds a generic private process supervisor, shared by Fleet and task context/activity; canonical25/25 is green while owner acceptance and hosted CI are pending. P2: protocol2 Fleet decoder returns snapshot plus original automation; its wrapper must adapt that validated result before generic supervision, while task readers retain their own protocol1 DTO. P3: preserve upstream process-tree cleanup and separate admission pools; resolve only the Fleet wrapper type/protocol/decoder boundary and regenerate provider metadata. At10x read volume the existing bounded queues reject busy before provider amplification. Integrating source does not grant upstream acceptance; do not close this package before #442 acceptance.
