> **Archived**: 2026-08-12 14:42
> **Related Plan**: plans/archive/plan-20260812-1209-stop-diff-changed-set.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260812-1442

# Implementation Notes: stop-diff-changed-set

> **Status**: Active
> **Plan**: plans/plan-20260812-1209-stop-diff-changed-set.md
> **Contract**: tasks/contracts/20260812-1209-stop-diff-changed-set.contract.md
> **Review**: tasks/reviews/20260812-1209-stop-diff-changed-set.review.md
> **Last Updated**: 2026-08-12 12:09
> **Lifecycle**: notes

## Design Decisions

- Deletions stay in the cascade feed. The contract's secondary falsifier required checking `architecture-queue record --file <path>` against a path that no longer exists before wiring deletions in. `record_command` never stats the target: `repo_relative_path` delegates to `architecture-event repo-path` (pure string canonicalization) and `classify_change` is a lexical `case`/regex ladder, and `capability-resolver match` returns a normal unmatched-JSON payload for an absent path. Probed in a throwaway git fixture with `packages/gone/` deleted: `bash scripts/architecture-queue.sh record --file packages/gone/package.json` printed `[ArchitectureDrift] Request: docs/architecture/requests/root.md` with `severity=medium` and exit 0. The filter condition ("if and only if the script cannot classify them") is therefore not met, so deletions are fed to the cascade unchanged.
- `git status --porcelain` runs with `--untracked-files=all`. The default collapses a new directory into a single `dir/` row, which `classify_change` maps to `none unrelated` — that is exactly the byok-sdk `packages/cloud-postgres` package addition the goal names, so the collapsed form would have kept the reported symptom alive.
- The drift source event uses one constant `source_key` (`architecture-drift-cursor`) because the cursor is a single repo-level slot. `architectureProjectionDeadLetterForSourceKeys` then keeps a dead-lettered range blocking the lane until an operator retries it; a per-range key would let the next commit mint a fresh key and silently route around the failed range.
- `processArchitectureCascade` stays in `mutation-observed.ts` and is exported rather than moved next to the new changed-set module. It is the ported `post-edit-guard.sh` cascade command surface and shares `repoHarnessRunnerAvailable`/`runRepoHarnessHelper`/`commandAvailable` with the contract-verification port that still lives there; moving it would have exported three helpers in the opposite direction for no behavioral gain. What was retired is the journal's architecture *consumption* (the dirty bit and its branch), not this command port.
- The manual `architecture-projection drain` command no longer consumes the post-edit journal. Its journal consumption existed only for the architecture ack handshake; the remaining journal bits (contract-verification, minimal-change) belong to Stop. `sourceJournalPending` is kept in the output (schema unchanged) and now reports the journal depth Stop still owns.

## Deviations From Plan Or Spec

- T3 also removed `consumePendingPostEditEvents`'s `retainEventFiles` option, which the plan does not name alongside `skipArchitectureCascade`/`eventIds`. All three were one handshake: `retainEventFiles` existed only to keep an event file alive while a durable architecture job still owned its ack. With the architecture bit gone it had no caller and no meaning, so leaving it would have been a compatibility shim.

## Observed Consequences

- Cascade fan-out at Stop is now proportional to the uncommitted delta, and it is measurable. In the HRD-09 fixture repository, an uncommitted adoption transaction is 70 changed paths and one `bun src/cli/index.ts run architecture-queue record --file <path>` costs ~874 ms, so that single Stop spent ~61 s in the cascade and blew the test's 120 s budget (measured, `scratchpad/probe-fanout.ts`). The plan already named this as the first thing to fail at scale, with the cursor as the bound; the fixture now commits its adoption before exercising the routes (the realistic shape — adoption lands as a commit), which returns that test to 8.8 s. The product-side exposure that remains is a first Stop over a large uncommitted tree in a projection-disabled repository, against the host's 150 s Stop timeout. No cap or de-duplication was added: that would be new policy, not the frozen design.
- The LSC-01 loop-semantics characterization golden gained exactly three lines (`.ai/harness/state/architecture-drift-cursor.json` in the lite/standard/strict stop write sets). Regenerated with `UPDATE_LOOP_SEMANTICS_GOLDEN=1`, the documented update path for this fixture; the diff is delta-shaped with no other field touched.
- With projection disabled, the legacy cascade now re-runs `architecture-queue record` for every still-dirty working-tree path on every Stop, where the journal previously fired once per edit. `upsert-request` keeps the request card idempotent, but `.ai/harness/architecture/events.jsonl` gains one line per path per Stop until the paths are committed and the cursor moves past them. No de-duplication was added: the projection lane's receipt store already covers the enabled path, and inventing a second receipt store for the advisory lane is outside this work-package.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| ... | ... | ... |

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
