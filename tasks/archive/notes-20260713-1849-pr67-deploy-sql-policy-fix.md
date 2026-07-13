> **Archived**: 2026-07-13 18:49
> **Related Plan**: plans/archive/plan-20260713-1413-pr67-deploy-sql-policy-fix.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260713-1849

# Implementation Notes: pr67-deploy-sql-policy-fix

> **Status**: Active
> **Plan**: plans/plan-20260713-1413-pr67-deploy-sql-policy-fix.md
> **Contract**: tasks/contracts/20260713-1413-pr67-deploy-sql-policy-fix.contract.md
> **Review**: tasks/reviews/20260713-1413-pr67-deploy-sql-policy-fix.review.md
> **Last Updated**: 2026-07-13 17:28
> **Lifecycle**: notes

## Design Decisions

- Preserve `--root deploy/sql` as an existing assertion-only command contract. It cannot select a different root and therefore does not become a second authority or compatibility fallback.
- Keep the inline Bun parser and shell helper. Strictly validate control characters and canonical paths instead of adding JSON transport tooling or a dependency.
- In configured multi-root mode, invariant coverage requires each full repo-relative migration path. Default single-root mode retains the existing basename-or-path coverage contract.
- Reject SQL symlinks explicitly before naming or invariant validation; do not follow them.
- Rebuild from current main and exclude `3bf58a8` entirely rather than trying to merge or normalize its unrelated workflow artifacts.
- The final rebuilt branch is one commit on `origin/main` `f248e76f`; the rebase preserved PR #68's native-role hook runtime and regenerated the hook projection from merged canonical assets.

## Deviations From Plan Or Spec

- The hook source sync deterministically refreshed `.ai/hooks/.projection.json`; the contract was widened to include that generated parity manifest before integration closeout.
- Refreshing `tasks/current.md` made the tracked handoff/resume projection stale, so the contract was widened for the two canonical handoff files before refreshing them through the packaged helpers.
- The first external acceptance correctly rejected the implementation for literal-path regex injection, directory-symlink omission, unchecked enumeration failures, overwritten invalid `--root` occurrences, and stale base integration. The checker now uses literal boundary matching, rejects SQL directory links, captures the enumerator pipeline status once, validates every `--root` occurrence immediately, and is rebased onto current `origin/main` `f248e76f` pending final verification.
- The second adversarial acceptance rejected newline-delimited `find -print` output because a directory symlink containing a newline could split into two non-symlink records. Enumeration now captures `find -print0` into a checked temporary snapshot, performs byte-safe NUL-record sorting, and consumes it with `read -d ''`; the exact newline directory-symlink bypass is a regression fixture.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Structured JSON bridge between Bun and Bash | Reject | Control-character validation plus a default naming failure closes the observed injection without a new protocol layer. |
| Remove `--root` | Reject in this slice | The flag is already public and its only accepted value is the canonical default; silent removal is unrelated breaking behavior. |
| Global basename uniqueness across roots | Reject | Full-path invariant coverage in configured mode is simpler and does not constrain valid root-local naming. |
| Follow SQL symlinks | Reject | A deployment validation gate should classify committed migration content directly and fail closed on indirection. |
| Keep per-loop `find` process substitutions | Reject | Their exit status is invisible to the parent shell; one checked, sorted deployment-surface snapshot is the fail-closed authority for later checks. |
| Keep newline-delimited `find` records | Reject | Repository pathnames may contain newlines; NUL-delimited snapshot and consumption are required for a security boundary. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Focused integration suite: contract test files passed after source/helper and distribution slices were combined.
- Full suite after `bun install --frozen-lockfile`: `1241 pass`, `1 skip`, `0 fail` across 110 files.
- Projection/type/architecture checks: `check:type`, `check:hooks`, `check:helpers`, deploy-SQL self-check, and architecture sync all exited 0.
- Native strict workflow currently stops only on three pre-existing external Brain vault mirror drifts; no changed file in this work-package owns those sources or vault targets.
- CI-equivalent no-vault gate: `REPO_HARNESS_BRAIN_ROOT=/private/tmp/repo-harness-pr67-ci-no-vault bash scripts/check-ci.sh` passed end to end, including `1241 pass / 1 skip / 0 fail`, strict workflow, inspection, adoption dry-run, package dry-run, and tarball install smoke.
- Installed configured-root smoke: a freshly packed `repo-harness-0.9.2.tgz` accepted a `timestamp14` root plus required invariant through `repo-harness run check-deploy-sql-order --root deploy/sql`.
- Post-rebase full CI-equivalent verification passed `REPO_HARNESS_BRAIN_ROOT=/private/tmp/repo-harness-pr67-ci-no-vault bash scripts/check-ci.sh`, including full tests, type/projection/workflow checks, inspection, adoption dry-run, package dry-run, and tarball install smoke.
- The first strict contract run passed all 26 automatable criteria and failed only because the contract had modeled the GitHub PR state as an unsupported machine `manual_checks` entry. That entry was removed from the machine verifier; remote mergeability and checks remain mandatory in the plan/review acceptance boundary and are verified through GitHub after push.
- PR #67 was merged at `2026-07-13T09:19:22Z` as merge commit `4e3e76a29409199c8073a42001285d23927f1676`. Remote `main` resolved to that exact commit, and post-merge GitHub Actions run `29238650018` completed successfully across the Test job plus Linux, macOS, and Windows MCP path matrices.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
