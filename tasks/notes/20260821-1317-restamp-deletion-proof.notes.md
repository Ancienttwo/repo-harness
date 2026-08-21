# Implementation Notes: restamp-deletion-proof

> **Status**: Active
> **Plan**: plans/plan-20260821-1317-restamp-deletion-proof.md
> **Contract**: tasks/contracts/20260821-1317-restamp-deletion-proof.contract.md
> **Review**: tasks/reviews/20260821-1317-restamp-deletion-proof.review.md
> **Last Updated**: 2026-08-21 13:51
> **Lifecycle**: notes

## Design Decisions

- Keep the provider result as the restamp classifier and strengthen only the Git byte-level publication proof from one named path to one modified path (`M`, manifest). This preserves the existing ownership boundary and makes deletion fail closed before `update-ref`.

## Deviations From Plan Or Spec

- None recorded.

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
- Full suite under the host environment: `bun test --timeout 60000` — 2789 pass, 1 skip, 2 fail. Both failures are in `tests/trace-observer.test.ts` and are caused by inherited `CODEX_SESSION_ID`/`CODEX_THREAD_ID` changing session persistence and host attribution; the same file passes 9/9 when those host variables are unset.
- Strict contract verification was started with the host variables unset and passed the preflight, focused test, typecheck, deploy-SQL, architecture-sync, task-sync, workflow, inspect-project-state, and init dry-run criteria before the long full-suite criterion; it was stopped before completion to avoid an unbounded wait. No commit, push, tag, npm publish, or external release action was performed.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
