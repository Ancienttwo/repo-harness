# Implementation Notes: restamp-deletion-proof

> **Status**: Active
> **Plan**: plans/plan-20260821-1317-restamp-deletion-proof.md
> **Contract**: tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md
> **Review**: tasks/reviews/20260821-1317-restamp-deletion-proof.review.md
> **Last Updated**: 2026-08-21 15:15
> **Lifecycle**: notes

## Design Decisions

- Keep the provider result as the restamp classifier and strengthen only the Git byte-level publication proof from one named path to one modified path (`M`, manifest). This preserves the existing ownership boundary and makes deletion fail closed before `update-ref`.

## Deviations From Plan Or Spec

- The acceptance materializer refreshed the architecture projection manifest and the generated portion of `global-runtime-reconciliation.md`; both are included in closeout because `check-architecture-sync.sh` correctly rejects a stale or uncommitted projection.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Accept `A` as well as `M` | Rejected | A restamp updates an already tracked manifest; allowing creation would broaden product semantics without a migration contract. |
| Reject deletion in `evaluateRestampGate` | Rejected | The gate owns pre-staging repository facts; the synthesized commit proof is the authoritative place to validate the exact tree delta immediately before CAS publication. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Verification Record

- Focused publication suite: `bun test tests/architecture-restamp-publication.test.ts --timeout 60000` — 12 pass, 0 fail.
- Required local checks: `bun run check:type`, `bash scripts/check-deploy-sql-order.sh`, `bash scripts/check-architecture-sync.sh`, `bash scripts/check-task-sync.sh`, `repo-harness run check-task-workflow --strict`, `bun scripts/inspect-project-state.ts --repo . --format text`, and `bun src/cli/index.ts init --repo . --dry-run` — all passed.
- Clean-environment full suite after rebasing onto the final release commit: `bun test --timeout 60000` — 2802 pass, 1 skip, 0 fail, 21417 assertions across 206 files in 835.42 seconds.
- Commit `f6fee1cec2f034a4658a7253b8e7949004ecbd2c` was pushed to `main`; GitHub Actions run `32455887786` passed every required job for that exact revision.
- npm tarball readback for `repo-harness@0.16.1` matched local pack SHA-1 `2bcef1b751c66ad2ec7255f00912bab568184cdb` and integrity; clean install reported `0.16.1` and contained the guarded-write module.
- Annotated tag `v0.16.1` resolves to `f6fee1cec2f034a4658a7253b8e7949004ecbd2c`; GitHub release `repo-harness 0.16.1` is published from the changelog.
- Global Bun installation reports `repo-harness 0.16.1`; `doctor` reports 11 ok, 1 advisory warning, 0 failures. `check-release-published.sh 0.16.1` passed and emitted runtime-evidence receipt `sha256:688c037c8a66f99bfeb2494c9ec9f0fe452caac5f724f3f49765e104f4cabe72`.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
