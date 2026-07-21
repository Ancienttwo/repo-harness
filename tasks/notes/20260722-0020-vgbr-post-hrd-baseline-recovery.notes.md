# Implementation Notes: vgbr-post-hrd-baseline-recovery

> **Status**: Active
> **Plan**: plans/plan-20260722-0020-vgbr-post-hrd-baseline-recovery.md
> **Contract**: tasks/contracts/20260722-0020-vgbr-post-hrd-baseline-recovery.contract.md
> **Review**: tasks/reviews/20260722-0020-vgbr-post-hrd-baseline-recovery.review.md
> **Last Updated**: 2026-07-22 06:02
> **Lifecycle**: notes

## Design Decisions

- Opened the orchestration worktree via a disposable control clone
  (`git clone --local` from the root checkout at
  `/private/tmp/repo-harness-vgbr-r2-control-20260722-0556`, origin
  repointed to `https://github.com/Ancienttwo/repo-harness.git`, fetched, and
  fast-forwarded to `origin/main`), rather than `repo-harness run
  plan-to-todo` / `contract-worktree start` against the root checkout. This
  matches the pattern already used for `vgbr-rf` and the first (voided)
  VGBR-R attempt, and keeps the root checkout's own `.git` free of any
  worktree registration for this package.
- Removed the new branch's auto-set upstream tracking
  (`git branch --unset-upstream`) immediately after `git worktree add
  -b codex/vgbr-r2-baseline-recovery origin/main`, since that call defaults
  to tracking `origin/main` — a foot-gun for an accidental bare `git push`.
  This package never pushes in Phase 1 regardless.
- `EXPECTED_SUBJECT_HASH` is left `null` in the Phase 1 attempt record per
  the resume authorization, computed instead by Phase 2's own preflight from
  the detached subject checkout immediately before invocation. (An earlier
  Phase-1 draft of this package had planned to pre-compute this hash in
  Phase 1 via `git ls-tree`; the resume authorization explicitly overrode
  that to null-until-Phase-2, which this package now follows.)
- Set `.ai/harness/active-plan`, `.ai/harness/active-worktree`, and
  `.ai/harness/worktrees/vgbr-r2-baseline-recovery.json` by hand (matching
  the shape `contract-worktree.sh`'s `write_start_metadata` produces) since
  this package did not go through that helper.
- Contract carries the full Program Rule R6 field set (Base SHA/target
  branch/PR unit, P1/P2/P3, Non-goals, Concurrency/Ownership,
  No-Compatibility Declaration, Forbidden Paths and Actions, Manual
  Acceptance) beyond the packaged contract template's default shape, per the
  sprint's R6 requirement for this row.

## Deviations From Plan Or Spec

- The sprint's Row 3 "Contract variables" list `EXPECTED_SUBJECT_HASH`
  alongside `EXPECTED_SUBJECT_SHA` as an attempt-record field to populate
  before invocation; this package's resume authorization instead left it
  `null` until Phase 2's own preflight computes it. Recorded here since the
  sprint text itself does not distinguish Phase 1 vs Phase 2 timing for that
  field — the resume authorization is the more specific instruction and
  governs.
- This package's very first fresh-fetch (captured in the plan's Phase 1,
  session earlier the same day) pinned `VGBR_BASELINE_SHA` at `0852e9ab...`
  before `vgbr-rf` merged, and was blocked by a stale worktree directory left
  over from the first (voided) invocation attempt plus the discovery that a
  runner-fix package was in flight but unmerged. That block was reported and
  resolved externally: `vgbr-rf` merged as PR #113, the voided attempt's
  branch/worktree/control-clone were deleted per user decision, and this
  package resumed with a fresh re-fetch, re-pin, and fresh branch name
  exactly as the sprint's Attempt ledger requires.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Reuse `plan-to-todo`/`contract-worktree start` against the root checkout | Rejected | Coordinator's resume instructions specify the disposable-control-clone pattern already used by sibling packages (`vgbr-rf`, the voided attempt); keeps the root checkout's `.git` free of extra worktree registrations |
| Compute `EXPECTED_SUBJECT_HASH` in Phase 1 (as originally drafted) | Rejected | Resume authorization explicitly leaves it `null` until Phase 2 preflight |
| Rename the plan/contract/review/notes file stems to match the new branch name | Rejected | The plan is already the tracked backlog-row-3 artifact on `origin/main` under the original `vgbr-post-hrd-baseline-recovery` stem; only the git branch name is fresh per the sprint's Attempt ledger, not the artifact filenames |

## Open Questions

- None blocking Phase 1. Phase 2 needs to confirm `origin/main` has not moved
  past `b32b328208da5b07418c4fd815491bcc3913ff9f` before invocation.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots / attempt record: `.ai/harness/runs/vgbr-r/`
- Control clone: `/private/tmp/repo-harness-vgbr-r2-control-20260722-0556`
- Detached subject checkout: `/Users/kito/Projects/repo-harness-vgbr-r2-subject`
- Report staging directory: `/Users/kito/Projects/repo-harness-vgbr-r2-stage`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
