> **Archived**: 2026-08-26 22:40
> **Related Plan**: plans/archive/plan-20260826-1558-archctx-v2-provider-acceptance.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260826-2240

# Implementation Notes: archctx-v2-provider-acceptance

> **Status**: Active
> **Plan**: plans/plan-20260826-1558-archctx-v2-provider-acceptance.md
> **Contract**: tasks/contracts/20260826-1558-archctx-v2-provider-acceptance.contract.md
> **Review**: tasks/reviews/20260826-1558-archctx-v2-provider-acceptance.review.md
> **Last Updated**: 2026-08-26 17:25
> **Lifecycle**: notes

## Design Decisions

- Keep `ProjectionResultV2` as the signed upstream value. Provider-local mismatch evidence is emitted through a typed diagnostic callback and projected into drain output; it is never added to the upstream result or receipt digest.
- `applied-reconcile-required` is a committed semantic state, not a failed apply. The first provider call returns it without refresh consumption; retry uses the same accepted change with a freshly captured non-owned snapshot so ArchContext can consume its durable apply receipt.
- Preserve upstream stderr in the typed provider diagnostic and durable `reconcile-pending` error. The signed v2 result remains unchanged, while the concrete concurrent non-owned mutation reason survives provider and job boundaries.
- After publication, move every live package, policy, generated-template and fixture authority to exact 0.4.5 in the same unit. The provider remains package-local and no overlay or PATH fallback is permitted.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Add provider fields to ProjectionResultV2 | Rejected | Unsigned local fields would contaminate or ambiguate the upstream receipt authority. |
| Ignore the post-write snapshot mismatch | Rejected | The concurrent non-owned mutation is required evidence and must remain visible. |
| Accept v1 and v2 | Rejected | The upstream contract explicitly removes the compatibility fallback. |

## Open Questions

- None in the integration scope.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Local tarball: `/private/tmp/archctx-v2-provider-artifacts/archctx-0.4.4.tgz`, SHA-256 `16fa6ba0c9b61f3f1dabc6bcfc5961ebccf243a591f737bffc988c94b866556b`.
- Real provider acceptance: `/private/tmp/archctx-v2-provider-real-acceptance.json`.
- Published-package provider acceptance: `/private/tmp/archctx-v2-provider-published-acceptance.json`.
- Registry readback: `archctx@0.4.5` SHA-256 `152143cb6a623f882dd88be7a73d22327dece0b2772d4f828e5748fcbafcd467`, SHA-1 `3cc40fdf48111f845d1603baa929e54bbaf76582`; `archctx-contracts@0.4.5` SHA-256 `dcb81e40451e21687569959aacf437a219bea4cc37d334bfbc9a68943239fe17`, SHA-1 `4a0ceca9c8a61d13ff688659c35b76e9525c55c8`.
- ArchContext release commits: packaging `b1b4543994c54fc65d22e2107d27b31bb856780e`; final publication/readback `f3fa7fff44425abeaf69a504d3f55f33c56e3d30`.
- Selector proof source test: `packages/local-runtime/codegraph-adapter/test/capability-projection-inputs.test.ts` in the ArchContext acceptance worktree.

## Verified Acceptance Trace

1. A current apply request wrote owned projection files once; an injected README mutation forced `applied-reconcile-required`, returned a durable `applyId`, delivered zero refresh signals, and retained both `worktreeDigest` mismatch and ArchContext's concurrent-mutation warning.
2. A fresh-snapshot retry with the same accepted change returned `applied` and the original single refresh signal without a second owned write or second Human acceptance.
3. `consumeArchitectureRefreshSignals` was invoked twice for that signal but ran its action once; the next provider retry returned `noop` with zero signals.
4. A distinct pre-write stale request returned `AC_PRECONDITION_FAILED`, emitted no reconciliation diagnostic, and left projection-owned manifest bytes unchanged.
5. The exact selector suite proved digest stability at 5 versus 500 unrelated calls, missing and multi-identity fail-closed behavior, and a real CodeGraph call-site of `src/main.ts:4`.

## Verification Results

- `bun test tests/architecture-projection-provider.test.ts tests/architecture-projection-orchestration.test.ts --timeout 60000`: 52 pass, 0 fail.
- Seven modified projection/restamp/runtime files: 123 pass, 0 fail.
- ArchContext selector proof suite: 7 pass, 0 fail, including the real indexed repository.
- `bun run check:type`, `git diff --check`, deploy SQL, task sync, project inspection, and init dry-run: pass.
- Registry-installed 0.4.5 real provider trace: `applied-reconcile-required` / `applied` / `noop`, refresh action exactly once, pre-write stale fail-closed with no diagnostics and unchanged owned bytes.
- `bash scripts/check-architecture-sync.sh` without an overlay: pass, provider state `ready`, no pending/running/dead-letter/Human-action/blocking items.
- `bun run check:archctx-integration -- --arch-context-root /Users/ancienttwo/Projects/arch-context-wt-projection-proof-apply-reconcile`: pass against release commit `b1b4543`; clean-room capabilities report projection-result/v2 and both receipt/protocol v2 features.
- Published-pin focused suite: 52 pass; related package/policy/runtime suite: 128 pass; typecheck, helper sync, deploy SQL, task sync/workflow, project inspection and init dry-run pass.
- `repo-harness run verify-contract --strict --read-only`: 11/11 criteria pass against the published exact pins.
- Acceptance materialization first restamped only `docs/architecture/.projection-manifest.json` after the isolated worktree received its repo-approved CodeGraph index, then the provider's legacy non-accepted restamp post-check reported `worktreeDigest`; the next run was a stable `noop` and reached the contract gate. This is outside the accepted-change receipt path validated by this work-package and remains visible rather than being suppressed.
- Full `bun test --timeout 60000`: 3136 pass, 2 skip, 1 unrelated timeout in `tests/unit/hrd-09-legacy-retirement-and-adopted-migration.test.ts`; the same test times out standalone at its existing 120-second bound.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
