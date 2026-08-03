> **Archived**: 2026-08-03 21:26
> **Related Plan**: plans/archive/plan-20260803-2040-wp3-no-progress-circuit-breaker.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260803-2126

# Implementation Notes: wp3-no-progress-circuit-breaker

> **Status**: Active
> **Plan**: plans/plan-20260803-2040-wp3-no-progress-circuit-breaker.md
> **Contract**: tasks/contracts/20260803-2040-wp3-no-progress-circuit-breaker.contract.md
> **Review**: tasks/reviews/20260803-2040-wp3-no-progress-circuit-breaker.review.md
> **Last Updated**: 2026-08-03 20:40
> **Lifecycle**: notes

## Design Decisions

- **Falsifier gate ran first, before any implementation.** In a fixture repo,
  checking off the open plan task moved the envelope `progress_token`
  (`sha256:e057b151...` -> `sha256:303e1fc7...`) and the route moved
  `continue_active_plan` -> `verify_or_finish`; a rendering-only write to
  `.ai/harness/handoff/current.md` left the token unchanged. The token is
  therefore a valid stall signal and no heuristic was needed.
- **"flock" is the repository's exclusive-directory lock, not `flock(2)`.**
  Neither Bun nor Node expose `flock`, macOS ships no `flock(1)`, and the
  contract forbids new dependencies. `appendAttemptReceipt` serializes with
  `withExclusiveDirectoryLock` (the primitive `state-lock`,
  `git-state-version-store`, and the hook circuit breaker already use) around
  `appendLineDurably`, which is the house whole-line `O_APPEND` + `fsync`
  append. Eight parallel recorders yield eight intact lines
  (`tests/continuation-attempt.test.ts`).
- **The breaker is a post-pass gated on actionable routes.** `halt`,
  `complete`, and `idle` already stop the loop, so the ledger verdict is
  consulted only after the WP2 route table yields
  `continue_active_plan`/`advance_sprint`/`verify_or_finish`. This is what
  makes "absent ledger -> byte-identical to WP2" true for every route rather
  than only for the actionable ones, and it applies to
  `attempt_ledger_unreadable` as well: an already-halted repo does not get its
  reason rewritten.
- **A `halted` receipt also resets the count.** The spec names token change and
  `resumed` as the resets; `halted` follows from the rule actually implemented
  ("trailing consecutive *completed* receipts"), and is covered by a test so
  the behavior is stated rather than incidental.
- **The recorder validates framing, not the token recipe.** `unit_ref`, both
  tokens, and `recorded_at` must be non-empty and free of `\r`, `\n`, `\0`.
  The `sha256:` prefix is deliberately not checked: the recorder must not
  couple itself to the `progress_token` formula it merely transports.
- **`state attempt` exit codes.** A rejected claim (unknown outcome, missing
  token for `completed`/`halted`) exits 2 with the reason on stderr and appends
  nothing; an IO failure exits 1; success exits 0 and echoes the appended
  receipt, matching the sibling `state` subcommands' `--json` shape.
- **A receipt stays out of `progress_token` through two independent mechanisms,
  and either one alone suffices.** The receipt path is both gitignored (the
  `.ai/harness/runs/` rule) and classified operational by
  `isOperationalReviewPath` (`src/effects/review/diff-fingerprint.ts:367`, the
  `.ai/harness/runs/` prefix at line 382). The earlier claim that the ignore rule was
  necessary — that a tracked `.ai/harness/runs/` would move `subject_revision`
  and `progress_token` and silently disarm the breaker — was falsified by the
  acceptance gate: with the ignore rule removed, the token stayed stable and the
  breaker still tripped, because the operational classifier alone keeps the
  receipt out of the review subject. `tests/continuation-attempt.test.ts` still
  applies the ignore rule to its own fixture instance (`withLedgerRepo`) for
  fixture realism — every real repo-harness repository ignores that directory,
  so a fixture without the rule tests a repository shape that does not exist.
  The shared fixture cannot carry it, because
  `tests/state/cli-state-golden.test.ts` hashes the fixture tree and adding the
  line to `effective-state-fixture.ts` broke 12 goldens.

## Deviations From Plan Or Spec

- None. Both parent-level decisions frozen in the contract (single
  `attempts.jsonl` with no run-id sharding; corrupt line -> fail-closed
  `halt:attempt_ledger_unreadable`) are implemented as written.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Skip unparseable ledger lines vs fail closed | Fail closed (`attempt_ledger_unreadable`) | Skipping can hide the exact stall the breaker exists to catch; the contract fixes this at parent level |
| Add `.ai/harness/runs/` to the shared fixture vs per-test | Per-test (`withLedgerRepo`) | The rule is fixture realism, not a correctness requirement (the operational classifier alone keeps receipts out of the subject); the shared fixture's tree is hashed by committed goldens, and a one-line change there failed 12 baseline characterizations for no gain |
| Real `flock` via a native dependency vs the house lock | House exclusive-directory lock | No new dependencies allowed, no `flock` binding available, and the existing primitive already serializes every other harness append |
| Persist a stall counter vs recompute from the ledger | Recompute | A counter file is a second authority and an explicit contract Stop Condition; the trailing-run walk needs no persisted derived state |

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
