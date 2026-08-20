> **Archived**: 2026-08-20 22:11
> **Related Plan**: plans/archive/plan-20260820-2049-coordination-wait-metrics.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260820-2211

# Implementation Notes: coordination-wait-metrics

> **Status**: Active
> **Plan**: plans/plan-20260820-2049-coordination-wait-metrics.md
> **Contract**: tasks/contracts/20260820-2049-coordination-wait-metrics.contract.md
> **Review**: tasks/reviews/20260820-2049-coordination-wait-metrics.review.md
> **Last Updated**: 2026-08-20 21:05
> **Lifecycle**: notes

## Design Decisions

- Emission points, `scripts/sprint-backlog.sh`:
  - `acquire_backlog_lock()` takes the calling verb as `$1`; the two call sites
    (`cmd_complete_task`, `cmd_start_task`) pass `complete-task` / `start-task`.
  - One `backlog_lock_wait` record per acquisition: `acquired` immediately after
    the `release_backlog_lock` trap is armed, `timeout` immediately before the
    pre-existing `exit 1`. The `acquired` emission sits behind the trap on
    purpose: it spawns a node process for `now_ms`, and emitting first would
    hold the lock dir for one extra spawn with no release trap installed. The
    `ms` bracket is unaffected — `started_ms` is still read before the acquire
    loop, so the value still measures time to acquisition.
  - `reclaimed_stale` flips true in the stale-reclaim branch of the loop, so a
    reclaim is visible in the record instead of only in stderr.
- Emission points, `scripts/contract-worktree.sh`:
  - `finish_attempt_started_ms` / `_slug` / `_frozen_base` are set at
    `finish_worktree()` entry, at the slug derivation, and right after
    `refresh_and_freeze_base`.
  - `emit_finish_attempt` clears `finish_attempt_started_ms` after writing, so
    the post-gate refusal site — which emits `refused_stale_fork` and then calls
    `finish_transaction_abort` — cannot double-count, and an abort reached
    outside a finish attempt emits nothing.
  - Four sites: the pre-transaction stale-fork refusal, the post-gate stale-fork
    refusal, the top of `finish_transaction_abort` (covers every abort caller
    including the EXIT trap), and immediately before the success `Merged ...`
    line, which runs before the worktree cleanup subprocess.
  - `--no-merge` emits nothing: its outcome is none of the three frozen values.
- Ledger safety: `coordination_wait_emit` returns 0 on every failure path
  (no git dir, mkdir failure, append failure), so instrumentation cannot change
  a host command's exit status. Call sites additionally append `|| true`.
- No new shared helper file. `json_escape` / `now_ms` /
  `coordination_waits_file` / `coordination_wait_emit` are duplicated locally in
  each script, matching how `json_escape` and `now_ms` already exist separately
  in `scripts/contract-worktree.sh` and `scripts/verify-contract.sh`.
- `now_ms` copies `scripts/verify-contract.sh:17-25` verbatim (node -> bun ->
  whole-second fallback) rather than `date +%s%3N`, which is GNU-only.
- **Measured floor on `ms`.** bash 3.2 (the macOS system shell this repo
  targets) has no `EPOCHREALTIME`, so every `now_ms` call is a node/bun process
  spawn. An uncontended acquisition therefore never reports 0: its `ms` is
  dominated by a constant ~25-60ms spawn overhead of `now_ms` itself, not by
  lock waiting. Readers must subtract that floor before treating a value as
  wait time. The contention signal survives it: real waiting arrives in
  multiples of the 0.1s (`REPO_HARNESS_BACKLOG_LOCK_SLEEP_SECONDS`) retry
  sleep, so a genuinely contended record sits well outside the floor band and
  stays distinguishable from an uncontended one.

## Deviations From Plan Or Spec

- **Ledger root.** Frozen decision 1 names the path
  `.ai/harness/runs/coordination/waits.jsonl` but not the root it resolves
  against. Resolving it repo-relative is wrong here: `contract-worktree finish`
  deletes its own linked worktree on the success path (see the comment at
  `tests/contract-worktree-single-publication.test.ts:56-62`), so the `merged`
  record would be destroyed microseconds after being written, making contract
  Exit Criterion 1 unsatisfiable. Both scripts therefore root the sink at the
  primary worktree — `dirname` of `git rev-parse --git-common-dir` — which is
  the same rationale already written into `coordination_root()`
  (`scripts/sprint-backlog.sh:154-164`): one clone owns one coordination
  surface, and a per-worktree path scatters it. The path string is unchanged and
  stays covered by the `.ai/harness/runs/` gitignore entry.
- Test coverage adds a `timeout` assertion to the pre-existing
  "a non-empty stale lock times out instead of hot-looping" test. The contract
  named only the `acquired` case, but the timeout emission is named in the Goal,
  so it is guarded rather than left unasserted.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Repo-relative ledger path in each worktree | Rejected | The `merged` record does not survive finish's own worktree cleanup |
| Locked append (flock / lock dir) | Rejected | Frozen decision 1 picked the lock-free `workstream-sync.sh:304-305` idiom; a torn record loses one measurement, never a host command |
| `date +%s%3N` for epoch ms | Rejected | GNU-only; BSD `date` on this platform returns the literal `%3N` |
| Emit `finish_attempt` only inside `finish_transaction_abort` | Rejected | The pre-transaction stale-fork refusal exits before any transaction exists |

## Open Questions

- None.

## Extra Work Discovered (not done, out of scope)

- `finish_worktree`'s `--no-merge` return path and the several non-stale-fork
  `exit 1` gates (dirty target worktree, empty publication, gpgsign misconfig)
  produce no record, so the ledger under-counts total finish attempts. Widening
  the outcome vocabulary is a frozen-decision change, not an implementation
  detail.
- A whole gate-failure class is also silent, beyond those `exit 1` gates:
  `verify_acceptance_receipt`, `check_architecture_freshness`, and the
  `verify-sprint.sh` run (`scripts/contract-worktree.sh:1809-1811`) all fail
  under `set -e` before the EXIT trap that would call
  `finish_transaction_abort` is installed, so a failed gate round produces zero
  records. Stated plainly for any future reader: **the ledger has no
  total-attempt denominator.** Do not compute refusal rates, merge ratios, or
  any other "X out of all finishes" statistic from it; it counts only the
  outcomes it names, never the attempts it missed.
- No reader/aggregator exists (frozen decision 4). Reading at decision time is
  `jq` over the JSONL.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Sample records from fixture runs (2026-08-20):

```
{"protocol":1,"kind":"backlog_lock_wait","at":"2026-08-20T21:01:34+0800","verb":"start-task","ms":63,"attempts":0,"reclaimed_stale":false,"outcome":"acquired"}
{"protocol":1,"kind":"backlog_lock_wait","at":"2026-08-20T21:01:34+0800","verb":"complete-task","ms":164,"attempts":3,"reclaimed_stale":false,"outcome":"timeout"}
{"protocol":1,"kind":"finish_attempt","at":"2026-08-20T21:01:52+0800","slug":"demo","ms":2983,"outcome":"merged","frozen_base":"4cd68e1ec5f8e9aff901ad41fe3f3c4414d5b14b","publication":"20cbaf3a2ef0ae645df7ce347642362185e377e2"}
{"protocol":1,"kind":"finish_attempt","at":"2026-08-20T21:01:57+0800","slug":"demo","ms":1209,"outcome":"refused_stale_fork","frozen_base":"eb6899edc26184e61b2b93d1694d95b97f190157","publication":null}
```

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
