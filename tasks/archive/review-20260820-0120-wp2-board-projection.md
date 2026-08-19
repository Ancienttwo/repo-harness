> **Archived**: 2026-08-20 01:20
> **Related Plan**: plans/archive/plan-20260819-2109-wp2-board-projection.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-0120

# Task Review: wp2-board-projection

> **Status**: Complete
> **Plan**: plans/plan-20260819-2109-wp2-board-projection.md
> **Contract**: tasks/contracts/20260819-2109-wp2-board-projection.contract.md
> **Notes File**: tasks/notes/20260819-2109-wp2-board-projection.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-20 01:12
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:1055aa0de86cee1bdba4e47dabb41c7e35522a160adb50367305fcb4f254ccb6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 39e359c28404250a1429cb87b623f5d69f436b76

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the 21 paths under the contract's amended `allowed_paths`
- Actual files changed: 19 files (+3087 -15) -- `docs/architecture/index.md`, `docs/architecture/shared-coordination-plane.md`, `plans/plan-20260819-2109-wp2-board-projection.md`, `src/cli/commands/sprint.ts`, `src/cli/commands/state.ts`, `src/core/state/project-board.ts`, `src/core/state/types.ts`, `src/effects/git/worktree-topology.ts`, `src/effects/state/collect-board-inputs.ts`, `src/effects/state/coordination-lease-store.ts`, `src/effects/state/resolve-board.ts`, the four `20260819-2109-wp2-board-projection` workflow artifacts, `tasks/todos.md`, and the four test files. `src/cli/index.ts` and `tests/continuation-attempt.test.ts` were allowed but not needed. Machine-checked: `allowed_paths_check.outside == []`.
- Commands passed: `bun run check:type` (0); `bash scripts/check-architecture-sync.sh` (0, `blocking=0`); targeted five suites (130 pass / 0 fail); full `bun test` (2669 pass / 1 skip / 0 fail); gate `verify-sprint --prepare-acceptance` (`total=12 failed=0 status=Fulfilled`)
- Residual risks: two P3 findings on the receipt, neither on a surface this work package owns; the lock-free consistency premise is measured only against read-side self-perturbation, not concurrent writers
- Reviewer action required: none
- Rollback: revert the publication commit -- pure additive surface, no disk-format, lease-schema, or protocol change; residual `resumed` receipts live in the ignored runtime ledger and only clear stall counts

## Mode Evidence

- Selected route: acceptance review of a delegated work package (gatekeeper), not a planning or bug-hunt route
- P1/P2/P3 evidence: not re-derived here -- P1/P2/P3 belong to the plan's captured planning output and `tasks/notes/...notes.md`; this review verifies the landed result against the plan's frozen verdicts A-H
- Root cause or plan evidence: `plans/plan-20260819-2109-wp2-board-projection.md` T1-T12 plus `## Design verdicts (frozen)`; contract amendments (doc root path, sandbox exit criteria) are orchestrator-authorized and recorded in the contract and notes

## Verification Evidence

- Waza `/check` run: not applicable -- gatekeeper acceptance ran the project's own required checks directly
- Commands run: `bun test` (targeted five suites, and full, four times over this branch's content); `bun test tests/architecture-projection-e2e.test.ts tests/capability-archcontext-export.test.ts` (7 pass / 0 fail); `bun run check:type`; `bash scripts/check-architecture-sync.sh`; `bun test tests/check-agent-tooling.test.ts` (22 pass) and `bun test tests/architecture-projection-orchestration.test.ts` (30 pass) in isolation for the two flakes
- Manual checks: grep-verified that `'orphaned'` has zero occurrences in `src/`, that `withTaskLock` and worktree-metadata reads have zero occurrences in the four board files, and that `actual_path_overlap` / `scope_overlap` are absent from `BoardDiagnosticsV1`; read `scripts/capability-resolver.ts:296` to confirm the orphan walk is scoped to `docs/architecture/modules/` so the root doc placement is outside it; replayed the `verify-sprint.sh:233` selector jq expression to confirm a unique `exact_worktree` metadata resolution at the rebased base
- Supporting artifacts: `.ai/harness/checks/latest.json`; the receipt above; the flake record in the notes file
- Implementation notes reviewed: yes -- `tasks/notes/20260819-2109-wp2-board-projection.notes.md`, including the T1 doc-placement resolution, the A/C/D verdicts, the deviation table, and the honest scoping of the stability probe
- Run snapshot: `.ai/harness/runs/run-20260820T005559-49019-20260819-2109-wp2-board-projection.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:1055aa0de86cee1bdba4e47dabb41c7e35522a160adb50367305fcb4f254ccb6
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 39e359c28404250a1429cb87b623f5d69f436b76
> **Verification Evidence SHA256**: sha256:2022fd6adece0528fcef39b71503160506d1dbff077b80123fba5e7054574cd6
> **Issued At**: 2026-08-19T17:10:14.873Z

- Summary: Gatekeeper acceptance for WP2 board projection. Scope: 19 files, all inside amended allowed_paths; zero scripts/, zero assets/templates/helpers/, no lease-schema or protocol change, coordination-identity.ts and coordination-canonical-source.ts untouched. Frozen verdicts verified: six-value lease vocabulary passed through unchanged, orphaned absent from the enum and derived into diagnostics.orphan_reclaimable, conflict fields absent from cards rather than empty, the board takes no task lock and reads no worktree metadata, digests hash raw bytes, column precedence done > blocked > doing > todo. T8 appends the resumed receipt before the owner write and fails the bind closed, pinned by two tests. The todos-addendum torn-snapshot scenario (sprint revision constant, owner A to B) yields changed_during_read, and a torn-then-settled round proves whole-round retry. Stability probe measured 20/20 stable across four independent runs, with the notes honestly scoping it to read-side self-perturbation rather than concurrent writers. Verification at base 39e359c2: bun run check:type exit 0, check-architecture-sync.sh exit 0 with blocking=0, targeted five suites 130 pass 0 fail, full bun test 2669 pass 1 skip 0 fail. Two P3 findings recorded, neither blocking.
- Findings: P3: tests/sprint-claim-concurrency.test.ts stability probe closes with expect(stable).toBeGreaterThanOrEqual(0), a tautological assertion. The per-run assertions (document shape, consistency vocabulary, card count, sha256 revision shape) carry the verification weight and plan T11 explicitly authorized assert-the-mechanism/log-the-ratio, so this is recorded rather than blocking.; P3: tests/architecture-projection-orchestration.test.ts:662 is timing-sensitive under full-suite load: 1 fail across 4 full runs of this branch content, 30/30 in isolation, on a surface this work package does not touch. An ambient REPO_HARNESS_CLI mechanism was proposed and falsified; root cause unproven and routed to a separate diagnostic pass.

## Behavior Diff Notes

- New read-only verb `repo-harness state board --json [--sprint <path>] [--target-ref <ref>]`. Exit 0 for a document (including `changed_during_read`), 1 operational, 2 invalid invocation or no sprint to project. No directory scan: `--sprint` falls back to the active sprint marker only.
- `bind` now appends a `resumed` attempt receipt to the execution worktree's ledger *before* writing the bound owner record. An append failure fails the bind closed, leaving the lease `reserving`. This changes stall accounting after a steal-then-rebind: the new generation no longer inherits the previous claim's no-progress receipts.
- `LeaseRead` gains a read-only `raw` field. Classification is byte-for-byte unchanged; nothing in the existing paths consults it.
- No change to lease schema, protocol, on-disk format, or any of the seven frozen `sprint` verbs' semantics.

## Residual Risks / Follow-ups

- The 20/20 stability measurement covers read-side self-perturbation with active leases, not convergence against concurrent writers; no load generator exists yet. The plan's pre-authorized fallback (drop `evidence` from the composite digest) remains available if real multi-writer load drops the ratio below ~80%.
- `tests/architecture-projection-orchestration.test.ts:662` is timing-sensitive under full-suite load (P3 on the receipt). Root cause unproven; an ambient `REPO_HARNESS_CLI` mechanism was proposed and falsified. Routed to a separate diagnostic pass.
- The stability probe's closing `expect(stable).toBeGreaterThanOrEqual(0)` is tautological (P3 on the receipt). The per-run assertions carry the verification weight.
- Deferred by design and already in `tasks/todos.md`: board conflict projection (`actual_path_overlap` / `scope_overlap`) with an observed-collision trigger.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | n/a | Numeric scores are not a contract. The binding statements are the exit criteria (`total=12 failed=0 status=Fulfilled`) and the frozen verdicts A-H, each verified against a named file/line or test. |
| Product depth | n/a | Same -- scope is fixed by the contract's `allowed_paths` and machine-checked (`outside == []`); depth beyond it would be an EXECUTION_BOUNDARY violation, not a higher score. |
| Design quality | n/a | Replaced by the invariants this review checked: lease vocabulary passed through unchanged, `orphaned` derived rather than persisted, conflict fields absent rather than empty, board holds no lock and reads no worktree metadata, digests over raw bytes, receipt-before-owner-write. |
| Code quality | n/a | Replaced by the verification surface: `bun run check:type` clean, full `bun test` green, and the T9/T10/T11 assertions checked for invariant form rather than mirrored expectation tables. |

## Failing Items

- None. Zero blocking findings; the two recorded findings are P3 and neither sits on a surface this work package changes.

## Retest Steps

- Re-run: `bun test tests/board-projection.test.ts tests/board-snapshot-consistency.test.ts tests/sprint-claim-concurrency.test.ts tests/coordination-lease-store.test.ts tests/continuation-attempt.test.ts`
- Re-check: `bun run check:type`; `bash scripts/check-architecture-sync.sh` (outside any bounded verifier); full `bun test`; and `repo-harness state board --json --sprint <path>` against a real sprint for a runtime smoke test

## Summary

- Pass. The delivery implements T1-T12 and every frozen verdict A-H, stays entirely inside the amended `allowed_paths`, and adds no unrequested surface. The two design claims that could have been faked -- the todos-addendum torn-snapshot constraint and the stall-reset on rebind -- are each pinned by a test that asserts behavior rather than implementation shape, and the T9 column table is written as invariants over the constructible cross product instead of a mirrored expectation table. The stability probe's scope is stated honestly in the notes rather than overclaimed. Verified at base `39e359c2`.
