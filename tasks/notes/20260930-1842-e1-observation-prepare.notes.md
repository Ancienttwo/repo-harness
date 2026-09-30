# Implementation Notes: e1-observation-prepare

> **Status**: Active
> **Plan**: plans/plan-20260930-1842-e1-observation-prepare.md
> **Contract**: tasks/contracts/20260930-1842-e1-observation-prepare.contract.md
> **Review**: tasks/reviews/20260930-1842-e1-observation-prepare.review.md
> **Last Updated**: 2026-09-30 18:42
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:8892051e9c286dd7c0e912ec5b71576da8172e2b17096c2b5e2fff2804350cff`

## Design Decisions

- S1 adds producer/reader in existing scheduling-acquire-next module; no new source file, dependency or abstraction. Canonical JSON/digests, existing locks and durable-create/fsync primitives are reused.

## Deviations From Plan Or Spec

- Existing HTTP inventory required one additive tool-name entry, and designer feedback justified a real collectEngineerOffers composition proof in the existing ME-1A fixture; contract allowed_paths were narrowed to those exact files before editing.
- Before S0 merged, its byte-identical test was run from a temporary overlay importing S1 source; the S0 checkout was not modified. S0 is now in main as 2dd9ae01; current verification runs S0 and S1 together in the actual rebased checkout.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Durable staged create + hardlink publication | Selected | Complete bytes are flushed before exclusive publication; existing refs cannot be replaced. Temporary links are removed, then parent directory fsynced. |

## Open Questions

- Draft-only publication constraint: repeated prepare calls can create unbounded evidence; before publishing an exposed write surface, decide retention/reference ownership or postpone exposure. S1 adds no GC or quota.
- Frozen now_ms reaches Fleet board/lease liveness and workflow state (src/effects/fleet/acquire.ts:220; src/effects/state/collect-board-inputs.ts:153,234). S2 must audit those consumers before admission integration; S1 is evidence only.
- 30-second freshness is a design limit, not measured host latency/SLO or mutation-time TTL.
- Store assumes a trusted repository OS owner; hashes/path checks detect modified known refs, not hostile privileged writers. No GC or ledger/admission integration in S1.
- Crash between hardlink publication and unlink/fsync can leave unavailable evidence; reader refuses multiple links rather than admitting partial evidence. Prepare has no claim side effect.

## Gatekeeper Follow-up

- Gatekeeper found two TS2345 errors in the original S1 firstOffer closure; the non-null assertion fixed them in eb76e286. After rebasing onto merged S0, S1 removes that closure and reuses the existing offer(observedAt) fixture instead.
- Existing issue-280 cases now assert authority paths/names, file bytes and metadata remain unchanged after successful prepare and refusal. New absent/seeded-store cases reach snapshot ownership refusal (producer and reader with self-consistent digest) and policy rotation between collection and publication. No claim/lease/acquire-next evidence is created, rewritten or removed.
- Verification Plan adds check:type to the original 16 checks; formal re-acceptance remains pending. Finding 2 is resolved by the owner-approved rebase and shared fixture; findings 4 and 6 remain deferred by owner direction.

## Rebase onto Merged S0

- Base: origin/main 2dd9ae01. Rebase completed without a textual conflict, so the duplicate observeRetryEligibility import required an explicit semantic correction.
- Keep the one import and offer(observedAt) from S0. Remove S1 firstOffer and its dedicated canonical hash import; current=null timing and trusted-receipt composition use the same fixture as S0.
- Run check:type and the complete 17-check Verification Plan on the actual rebased tree; no overlay or separate-branch result substitutes for this verification. Evidence binds both the local follow-up and full PR boundaries.

Rebase follow-up diff:

> **Substantive Change SHA256**: `sha256:3ee118904f7dff0aed6a20c21795486603efd8e246502b56fdcc6152b91f3004`

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
