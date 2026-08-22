> **Archived**: 2026-08-23 01:45
> **Related Plan**: plans/archive/plan-20260822-2240-merge-readiness-v1.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260823-0145

# Implementation Notes: merge-readiness-v1

> **Status**: Active
> **Plan**: plans/plan-20260822-2240-merge-readiness-v1.md
> **Contract**: tasks/contracts/20260822-2240-merge-readiness-v1.contract.md
> **Review**: tasks/reviews/20260822-2240-merge-readiness-v1.review.md
> **Last Updated**: 2026-08-22 22:40
> **Lifecycle**: notes

## Design Decisions

- Readiness is a read-time proof. `--publication-id` reads the immutable cache and current reviewing pointer; explicit `--pr` decodes the live full-payload marker in memory and never invokes receipt rebuild/write paths.
- Provider observation is one bounded `identity -> facts -> identity` round. A torn round is discarded wholesale and retried once; a second tear returns `changed_during_read`.
- Required CI comes from `gh pr checks --required`; exit 8 is valid pending data. Review threads use one bounded GraphQL page and fail `provider_data_incomplete` if pagination is not exhausted.
- Local proof compares the exact checks and merge-seal digests carried by the receipt, uses `resolveEffectiveStateReadOnly`, and includes local evidence plus lease/board revisions in its before/after token.
- Integration classification calls `scripts/worktree-merge-lib.sh` only after proving both commit objects exist; only `unmerged` may be ready.
- `fleet ready` derives current reviewing pointers from the existing stable board in canonical row order. Each publication failure is typed and isolated so later rows are still returned.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse `rebuildPublicationReceipt` for `--pr` | Reject | It writes the receipt cache and applies initial-publication live-evidence rules, violating the pure readiness boundary. |
| Treat local `origin/main` as provider base | Reject | Receipt base and stable live provider base are the only readiness fence; no implicit fetch or local-ref freshness is assumed. |
| Persist a `ready` flag | Reject | It creates a stale second authority; the verdict remains a per-invocation projection. |

## Open Questions

- Provider merge-queue delegation for base movement remains disabled because no existing repo policy field proves that authority.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Independent gate: focused 13/13, related publication/state 93/93, typecheck and diff-check passed.
- Full-suite closeout: the first run hit the existing `sprint-backlog` 30-second timeout under load; the exact test passed alone in 2.2 seconds, and the frozen `03abdac2` candidate subsequently passed all 2,876 tests in 999.6 seconds.
- Automatic acceptance projection restamped `docs/architecture/.projection-manifest.json`; this note is the synchronized task-side closeout for that generated publication output.
- After `origin/main` advanced to the independently published Bun 1.4.0 floor, the WP1 branch was rebased onto `765db35b`; readiness evidence must therefore be frozen again against that exact target revision.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
