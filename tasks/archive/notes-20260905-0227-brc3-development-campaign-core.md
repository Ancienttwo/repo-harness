> **Archived**: 2026-09-05 02:27
> **Related Plan**: plans/archive/plan-20260905-0119-brc3-development-campaign-core.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260905-0227
> **Archive Projection V1**: `plans/plan-20260905-0119-brc3-development-campaign-core.md` => `plans/archive/plan-20260905-0119-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/notes/20260905-0119-brc3-development-campaign-core.notes.md` => `tasks/archive/notes-20260905-0227-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/contracts/20260905-0119-brc3-development-campaign-core.contract.md` => `tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md`
> **Archive Projection V1**: `tasks/reviews/20260905-0119-brc3-development-campaign-core.review.md` => `tasks/archive/review-20260905-0227-brc3-development-campaign-core.md`

# Implementation Notes: brc3-development-campaign-core

> **Status**: Active
> **Plan**: plans/archive/plan-20260905-0119-brc3-development-campaign-core.md
> **Contract**: tasks/archive/contract-20260905-0227-brc3-development-campaign-core.md
> **Review**: tasks/archive/review-20260905-0227-brc3-development-campaign-core.md
> **Last Updated**: 2026-09-05 01:19
> **Lifecycle**: notes
> **Substantive Change SHA256**: `sha256:b6133f562d5626300ecf780cd4b9a2d3f9ccbd9f57dccf361e3107ad3c91e6e3`

## Design Decisions

- `ProgramAuthorizationV1.campaign` is a required `ProgramAuthorizationCampaignV1 | null`. This keeps one exact authorization protocol: non-campaign grants say `null`, campaign grants bind the closed payload into the existing digest, and missing legacy fields fail closed.
- `development_campaign.mode` is `off | shadow | active`; the PRD's `active/manual` rung is represented by `mode=active` plus the existing required `merge_mode=manual` grant field.
- Every mutation re-reads the host grant and target-revision policy. Startup additionally requires target-revision `external_sources.mode != off`; no working-tree policy can widen limits.
- The store uses the existing exclusive directory lock and canonical message mechanics. Event and transition paths are SHA-256 keys, while the exact caller key remains inside the canonical event bytes.
- A mutation repairs only a provably lagging `current.json` that equals an exact event-chain prefix. Invalid or non-prefix projections remain `campaign_reconciliation_required`.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| New `DevelopmentCampaignAuthorizationV1` | Reject | Duplicates host authority and violates the PRD. |
| Optional campaign payload | Reject | Creates two accepted ProgramAuthorization shapes and a permanent compatibility branch. |
| Required nullable campaign payload | Use | One exact schema; non-campaign intent is explicit and digest-bound. |
| Read current candidate policy | Reject | Lets the candidate relax its own limits. |
| Read policy at authorized target revision | Use | Preserves the host grant and target-base ceiling. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused campaign suite: 44 passed, 0 failed.
- Related automation/refactor suite: 144 passed, 0 failed.
- Architecture/helper regression suite after inventory projection: 173 passed, 0 failed.
- Full repository suite: 4160 passed, 4 skipped, 0 failed across 4164 tests.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
