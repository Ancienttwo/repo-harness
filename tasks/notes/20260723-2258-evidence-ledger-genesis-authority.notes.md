# Implementation Notes: evidence-ledger-genesis-authority

> **Status**: Active
> **Plan**: plans/plan-20260723-2258-evidence-ledger-genesis-authority.md
> **Contract**: tasks/contracts/20260723-2258-evidence-ledger-genesis-authority.contract.md
> **Review**: tasks/reviews/20260723-2258-evidence-ledger-genesis-authority.review.md
> **Last Updated**: 2026-07-23 22:58
> **Lifecycle**: notes

## Design Decisions

- Root cause: `checks-materializer.ts` re-derived a contract slug as
  `worktree_id`, contradicting the immutable genesis authority established by
  `event-log.ts`. PostBash can legitimately win genesis with `ws-<hash>`, and
  all later producers preserve that returned identity.
- `MaterializeChecksLatestInput.worktreeId` is now explicit and required for
  the pure builder. The disk writer obtains it only from
  `readAcceptedEvents(...).genesis`; missing genesis throws before writing.
- Active-contract isolation uses exact equality with the already-existing pair:
  `subject_identity.contract_hash` for active contract bytes and
  `run_trace.contract.file` for its repo-relative path. The path half was added
  after architecture review demonstrated that content hash alone cannot
  distinguish byte-identical copied contracts. No schema field, alias,
  fallback identity, or ledger rewrite was added.

## Deviations From Plan Or Spec

- Added `tests/evidence-projection-drift.test.ts` to Allowed Paths because it
  is an existing direct typed caller of `buildChecksLatestProjection` and must
  provide the now-explicit genesis identity. This is a mechanically required
  call-site update, not a scope expansion into recovery behavior.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Rewrite PostBash genesis to the contract slug | Reject | PostBash has no guaranteed active contract, and immutable genesis is explicitly first-writer authoritative. |
| Accept both workspace hashes and contract slugs | Reject | Creates a steady-state compatibility path and still conflates worktree and contract identities. |
| Add a new `contract_id` event field | Reject | Unnecessary schema change; exact `contract_hash` already exists on every subject identity. |
| Genesis worktree ID + existing contract hash-and-path pair | Use | Restores the actual authorities and distinguishes byte-identical contracts without a schema change. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Pre-fix regression: `.ai/harness/runs/evidence-ledger-genesis-authority.pre-fix.log`
- Focused tests: `bun test tests/evidence-checks-materializer.test.ts tests/evidence-projection-drift.test.ts` — 28 pass.
- Full suite: `bun test` — 2044 pass, 1 skip, 0 fail across 161 files.
- Typecheck: `bun run check:type` — pass after linking the worktree to the
  primary checkout's existing ignored `node_modules`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
