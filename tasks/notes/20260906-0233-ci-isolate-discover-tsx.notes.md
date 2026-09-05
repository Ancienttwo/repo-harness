# Implementation Notes: ci-isolate-discover-tsx

> **Status**: Active
> **Plan**: plans/plan-20260906-0233-ci-isolate-discover-tsx.md
> **Contract**: tasks/contracts/20260906-0233-ci-isolate-discover-tsx.contract.md
> **Review**: tasks/reviews/20260906-0233-ci-isolate-discover-tsx.review.md
> **Last Updated**: 2026-09-06 02:33
> **Lifecycle**: notes

## Design Decisions

- The guard runs the loop from a throwaway `tests`-shaped root instead of the repo root: the library is sourced by absolute path (`REPO_HARNESS_CI_RUN_TESTS_LIB` already resolves it that way) while `find tests` resolves against the working directory, so discovery is observable without executing the repo's own suite.
- The discovery branch is reached only by leaving `BUN_TEST_FILES` empty. The existing cases pass an explicit file list, so the new case sets `BUN_TEST_FILES: ""` rather than relying on it being absent from the inherited environment.
- The readback compares the predicate's file count with the `across M files` figure from the full-suite run rather than executing `run_bun_tests` in isolate mode, which would re-run the whole suite file by file.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Widen the `find` predicate | Chosen | Smallest change that makes loop discovery equal bun's discovery |
| Delegate discovery to `bun test --list`-style enumeration | Rejected | Adds a second discovery authority and a bun-version dependency for no behaviour gain |

## Open Questions

- None.

## Evidence Links

- Pre-fix artifact: `.ai/harness/evidence/pre-fix/check-ci-isolate-discover-tsx.log` (`PRE_FIX_EXIT=1`); the path is under a gitignored root, so it exists only in this worktree.
- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
