# Implementation Notes: e1-campaign-membership

> **Status**: Active
> **Plan**: plans/plan-20261002-0033-e1-campaign-membership.md
> **Contract**: tasks/contracts/20261002-0033-e1-campaign-membership.contract.md
> **Review**: tasks/reviews/20261002-0033-e1-campaign-membership.review.md
> **Last Updated**: 2026-10-02 00:33
> **Lifecycle**: notes

## Design Decisions

- Retain protocol-2 receipts and existing scope keys; campaign R2 binds owner manifest/current grant-policy context while plain stays R1. R1 completion cannot impersonate R2 under the same logical key.
- Keep owner guards and trusted callback outside unchanged admission. Precise fresh-callback compensation checks authenticated stored ClaimActor and exact Lease tuple inside the existing Task lock.
- Final validateHandoff is report-only even for a fresh claim after callback completion; retain bound/undispatched Lease and completed receipts for operator handling.
- Post-reservation owner refusal retains reservation and pending evidence without usage; reconcile before same-key retry or choosing another key. New-key guard refusals can consume additional reservations.
- AcceptanceReceipt：owner(Aimpact) 豁免，未生成 receipt。This records the explicit owner decision, not a typed receipt, verdict or Recommendation.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add a second schema migration / compatibility producer | Rejected | R2 changes semantic identity using the same receipt/scope schema; old same-key evidence conflicts. |
| Move campaign authority into lower admission | Rejected | Campaign owner retains scope/callback/budget authority; lower A and its assertion/revision remain unchanged. |
| Compensate after final handoff validation fails | Report-only, per owner | Completed transactions may already be consumed by replay; keep Lease/receipt evidence and require operator handling. |
| Retry post-reservation refusal with a new key | Reconcile first, per owner | Pending/reservation evidence is not a new-transaction proof; independent keys can accumulate reservations. |
| Claim universal lock coverage | Rejected | Task-lock check/release protection requires cooperating writers; publication/Git writers do not share a complete admission mutex. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.

## Frozen decisions

- Owner-approved design is the primary uncommitted responsibility trace (source hash in plan). No new planning question remains. Plain R1 remains unchanged; campaign uses R2, seven scope keys and protocol-2 receipts without another migration. Context revision binds current grant/policy, manifest digest remains exact.
- Campaign authority/manifest reads are sampled pre/post; campaign/planning/Task/capacity/publication locks are separate. Publication/Git writer coverage is not complete; no claim-instant membership guarantee. Precise compensation uses existing release command and revalidates the full acquired Lease identity through its readLease port inside the Task lock.
- Typed cutover-required refusal is implemented/tested before R2 changes, per owner instruction. Existing MCP class mapping propagates the new ledger code without a parallel translator.

## Concrete boundary proof

- Root source trace: campaign-acquisition → budgetedAcquisition (campaign mutation lock) → inner C (key lock) → before_acquire on exact offer → unchanged scheduled A → trusted callback → inner/outer result → idempotent usage → handoff validation. R2 scope authorization_revision hashes grant SHA/current policy; manifest digest is unchanged in meaning. No new scope keys or migration.
- Issue publication at issue-batch-publication.ts:71 uses withIssueBatchPublicationLock; issue-batch-store.ts:209 uses its own store lock. Neither is the campaign mutation nor Task lock. Canonical refs also have external Git writers. Claim-instant membership is NOT proved: current guards sample before/after and report drift; the actual canonical-manifest test writes while acquisition is in progress and proves exact own compensation.
- releaseSprintCommand → withOwnedLease → withTaskLock → lockedRecord calls the supplied coordination.readLease port inside that lock. The S3 port checks exact acquired Task/claim/generation/bound state/worktree/branch/unit and authenticated stored ClaimActor identity before the existing release transition. Unknown, rotated, same-token/new-generation or receipt mismatch are preserved with rollback_failed; no foreign/unknown cleanup.
- Off-owner/pre-effect tests inject the existing trusted authority/acquire ports, using an actual ready Engineer offer; they do not claim a new production selected route. The post-effect manifest and compensation tests use real scheduled admission, Lease store, ClaimActor and release operations. No full deployment or uncooperative filesystem writer guarantee.
- Initial typed cutover/MCP focused run: 48 pass, 0 fail, 283 expects. Campaign focused owner/budget/pending/replay run before final actor proof: 17 pass, 0 fail, 122 expects. Final real manifest/receipt-mismatch compensation proof: 2 pass, 0 fail, 13 expects; remaining cases are canonical Verification Plan authority. Typecheck passes after literal-limit and renamed-symbol corrections; no failed result is treated as passing evidence.
- capture-plan changed only the deferred ledger Updated header as a projection side effect; that owned timestamp was restored because S3 adds no deferred goal. Primary checkout and user dirty files remain outside this worktree's mutation scope.

> **Substantive Change SHA256**: `sha256:70ed29fa25d8ff7b75e52bfa670ae8d4f50b86b0c11758a17d64445c133cd828`

Execution-owner audit preserved the old callback end-of-envelope policy check as a full R2 context/membership recheck. The new targeted fixture changes owner context on the fifth read (after real envelope validation), requiring compensation before inner completion rather than only a later completed-replay rejection. Campaign check is classified expensive for its real fixture duration (~5 minutes); current_exact remains required.

Final post-envelope context guard boundary:

> **Substantive Change SHA256**: `sha256:060466c22684d0504da2197e19a738ca35688b18c7b4e3306c10679bec37d0d5`

## Owner decision after gatekeeper PASS on fb95297c

AcceptanceReceipt：owner(Aimpact) 豁免，未生成 receipt。

This authorized follow-up changes only operator documentation, notes/review execution materials and a cooperating-writer qualification in a comment. It does not alter acquisition behavior or issue a typed waiver/receipt/verdict/Recommendation. Owner explicitly authorizes Ready and full CI after verification/push, while merge and S4 remain unauthorized. Ignore recovered duplicate S3 start prompts; continue this existing work-package only.

Current CI boundary, merge-base origin/main (dba184d9):

> **Substantive Change SHA256**: `sha256:d7e1fe67a36b556307d0039fbbfb05ada7d9ba268bbaf847b9695d0e69d5a954`

Owner follow-up patch against fb95297c:

> **Substantive Change SHA256**: `sha256:f7c77cdf56d40bb67fb9be839bb76a89f66556ed7e512ea7ead8a125145c85f8`
