# Implementation Notes: e1-observation-prepare

> **Status**: Active
> **Plan**: plans/plan-20260930-1842-e1-observation-prepare.md
> **Contract**: tasks/contracts/20260930-1842-e1-observation-prepare.contract.md
> **Review**: tasks/reviews/20260930-1842-e1-observation-prepare.review.md
> **Last Updated**: 2026-09-30 18:42
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:e9b4ef97e0ae33421fab329492d092ae25133b1b335ba965d4c369f12efe0ca8`

## Design Decisions

- S1 adds producer/reader in existing scheduling-acquire-next module; no new source file, dependency or abstraction. Canonical JSON/digests, existing locks and durable-create/fsync primitives are reused.

## Deviations From Plan Or Spec

- Existing HTTP inventory required one additive tool-name entry, and designer feedback justified a real collectEngineerOffers composition proof in the existing ME-1A fixture; contract allowed_paths were narrowed to those exact files before editing.
- S0 is still Draft #467, so its byte-identical test was run from a temporary overlay importing S1 source; the S0 checkout was not modified.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Durable staged create + hardlink publication | Selected | Complete bytes are flushed before exclusive publication; existing refs cannot be replaced. Temporary links are removed, then parent directory fsynced. |

## Open Questions

- Draft-only publication constraint: repeated prepare calls can create unbounded evidence; before publishing an exposed write surface, decide retention/reference ownership or postpone exposure. S1 adds no GC or quota.
- Frozen now_ms reaches Fleet board/lease liveness and workflow state (src/effects/fleet/acquire.ts:220; src/effects/state/collect-board-inputs.ts:153,234). S2 must audit those consumers before admission integration; S1 is evidence only.
- S0/S1 touch shared imports in the acquire fixture: reconcile the two Draft branches before merge without duplicating observeRetryEligibility.
- 30-second freshness is a design limit, not measured host latency/SLO or mutation-time TTL.
- Store assumes a trusted repository OS owner; hashes/path checks detect modified known refs, not hostile privileged writers. No GC or ledger/admission integration in S1.
- Crash between hardlink publication and unlink/fsync can leave unavailable evidence; reader refuses multiple links rather than admitting partial evidence. Prepare has no claim side effect.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
