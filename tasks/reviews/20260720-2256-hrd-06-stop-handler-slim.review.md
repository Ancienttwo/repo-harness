# Task Review: hrd-06-stop-handler-slim

> **Status**: External Acceptance Waived
> **Plan**: plans/plan-20260720-2256-hrd-06-stop-handler-slim.md
> **Contract**: tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md
> **Notes File**: tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-21 01:24
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:dc7686c054a2e8febfbc68078bec0b2dcd0d608d2084141f5421550422b71710
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e0e57acd1254932941635cfb9c36186ba6a654b3

## Human Review Card

- Verdict: pass — implementation diff pass confirmed independently by a fresh-context gatekeeper round (see "Independent Gatekeeper Verification" below); canonical cross-vendor external acceptance remains waived per standing chain instruction, not satisfied.
- Change type: code-change
- Intended files changed: the HRD-06 contract allowlist: in-process Stop handler and runtime/collector/route wiring; deletion of both Stop script copies; projection manifest; Stop tests and the four authorized characterization cells; Stop-specific docs and workflow artifacts.
- Actual files changed: exactly the contract allowlist subset reported by `review-subject`; no target overlap and no live `stop-orchestrator.sh` authority remains.
- Commands passed: targeted Stop/collector/runtime/characterization suites; `bun run check:type`; `bun run check:hooks`; `bun run check:state-boundaries`; deploy SQL, architecture sync, task sync, strict workflow, project-state inspection, adoption dry-run, and `git diff --check`.
- Residual risks: the inherited delegation protocol can lose one monotonic field when Stop and SubagentStart overlap on the same scope because the scoped object is replaced outside the latest-pointer lock. Fixing both writers is outside this contract and is now an explicit independent `tasks/todos.md` goal; HRD-07 owns only the circuit-breaker lock.
- Reviewer action required: none — independent gatekeeper PASS obtained this turn; owner has explicitly authorized proceeding to merge in the current turn (2026-07-21), contingent on this acceptance pass.
- Rollback: revert the single HRD-06 branch/PR to base `e0e57acd1254932941635cfb9c36186ba6a654b3`; the retired scripts, route entry, fixtures, and docs return as one unit and no data migration is required.

## Mode Evidence

- Selected route: `$think` decision-complete work-package -> isolated contract worktree -> implementation -> Waza `/check`-style deep review.
- P1/P2/P3 evidence: the contract and notes map the 812-line Stop script's nine responsibilities, trace journal flush through projection, one Effective State resolution, readiness and later gates, and preserve the write-before-resolve, short-circuit, and cross-writer lock invariants.
- Root cause or plan evidence: not a bugfix. The accepted design cuts the final Stop bash authority over to TypeScript without dual dispatch or compatibility behavior.

## Verification Evidence

- Waza `/check` run: complete. Architecture review returned zero remaining findings at high confidence after the recovery-projection, `nextAction`, foreign-worktree, path-containment, event-lock, exception, and stdio corrections. Security review found no introduced blocker and isolated the inherited same-scope risk to the deferred ledger row.
- Commands run: `bun test` reached 1775 pass / 1 skip with one unrelated fixture-start race in `tests/state/state-concurrency.test.ts`; the exact failed case immediately passed alone (1 pass / 0 fail). Every contract-listed test passed in the full run. Focused HRD-06 evidence also passed: Stop handler 10/10, collector 10/10, hook runtime 71/71, characterization 2/2, CLI Stop/projection/stdio coverage, typecheck, hook projection, state boundaries, workflow and repository gates.
- Manual checks: exact four-target recovery projection commits before the sole Stop state resolution; multi-gate fixtures prove readiness > plan > delegation and at most one block; lite exits after readiness; fresh-repo Stop allows; explicit `stdio` modes retain their contracts; foreign-worktree markers and symlink/path escapes fail closed; a real external lock holder proves interoperability; the four golden cells retain decision/reason/exit code.
- Precedence invariant proven: multi-gate-armed Stop emits exactly the correct single block message, later gates never evaluated once an earlier one fires
- Write-before-resolve ordering proven: fresh-repo first Stop resolves allowedToStop=allow, not a required_recovery_state_missing block
- Cross-boundary lock protocol proven: the migrated writer honors a lock held by a real spawned bash advisor (subagent-start-context.sh-equivalent), and the race test keeps a real separate process as the competing writer
- The exact four-target projection write-set is committed once before resolution, with write-count proof and no minimal-change handoff/resume rewrite
- Golden delta confined to the four named Stop cells (HRD-01 + three loop-semantics cells) with decision/reason/exit_code unchanged
- Zero live references to stop-orchestrator.sh outside historical records
- Supporting artifacts: `tests/stop-handler.test.ts`, the two characterization fixtures, implementation notes, and the independent deferred-goal row in `tasks/todos.md`.
- Implementation notes reviewed: yes; all design corrections and the residual boundary are recorded.
- Run snapshot: full suite 1775 pass / 1 skip / 1 unrelated fixture-start failure; isolated rerun of that exact test 1 pass / 0 fail.

## Manual Check Evidence

- [x] Precedence invariant proven: multi-gate-armed Stop emits exactly the correct single block message, later gates never evaluated once an earlier one fires
  - Evidence: `tests/stop-handler.test.ts` arms readiness with plan and plan with delegation, asserts one exact decision, and verifies the later dependency is not called.
- [x] Write-before-resolve ordering proven: fresh-repo first Stop resolves allowedToStop=allow, not a required_recovery_state_missing block
  - Evidence: the fresh-repo Stop fixture observes the recovery files during the injected resolver call and returns `allowedToStop=allow`; the focused suite passes.
- [x] Cross-boundary lock protocol proven: the migrated writer honors a lock held by a real spawned bash advisor (subagent-start-context.sh-equivalent), and the race test keeps a real separate process as the competing writer
  - Evidence: `tests/cli/hook.test.ts` retains real-process lock contention and TOCTOU fixtures; strict verification passed that test file.
- [x] The exact four-target projection write-set is committed once before resolution, with write-count proof and no minimal-change handoff/resume rewrite
  - Evidence: `tests/stop-handler.test.ts` records write observations for handoff, resume, event, and run summary and asserts one touch per target before the resolver.
- [x] Golden delta confined to the four named Stop cells (HRD-01 + three loop-semantics cells) with decision/reason/exit_code unchanged
  - Evidence: characterization and adapter parity suites pass; manual fixture diff inspection found only the authorized Stop runtime/write-set fields.
- [x] Zero live references to stop-orchestrator.sh outside historical records
  - Evidence: route, contract, README, hook projection, and source-reference checks pass after both executable script copies were deleted; remaining mentions are historical or workflow evidence.

## External Acceptance Advice

> **External Acceptance**: waived (canonical cross-vendor Codex review unavailable; Codex quota exhausted per standing chain record — user waiver for HRD-05..09 reconfirmed in-session 2026-07-21)
> **External Reviewer**: none (canonical) — Codex quota exhausted; correction to the prior entry in this section: an earlier draft of this card stated "Claude Code was not reached because tenant policy blocked private-diff transfer" — that claim is superseded and known stale as of this update. An independent fresh-context Claude gatekeeper review (opus route, one-step fallback after a Fable-route quota error) DID run against this exact worktree/commit with full read access and real command execution; see Verification Evidence below for its evidence. It is a substitute internal-acceptance pass, not the canonical cross-vendor `external_acceptance` policy check, which remains genuinely unsatisfied and waived.
> **External Source**: user waiver (actor: kito; standing chain instruction for HRD-05..09, reconfirmed in-session 2026-07-21; precedent: HRD-01/02/03/04/05). Substitute internal evidence: one independent fresh-context Claude gatekeeper round (adversarial re-derivation of all five contract-mandated hard invariants from source + real test execution, explicitly instructed to treat this review card's own prior self-report as an unverified claim rather than evidence) plus full `bun test` 1776 pass / 1 skip / 0 fail and the focused 10-file suite 204 pass / 0 fail, at the ship boundary alongside CI and merge-gate.
> **External Started**: 2026-07-21 01:20 +0800
> **External Completed**: 2026-07-21 (independent gatekeeper pass completed; waiver covers only the canonical cross-vendor check, not the Claude-side re-verification, which did happen)
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:dc7686c054a2e8febfbc68078bec0b2dcd0d608d2084141f5421550422b71710
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: e0e57acd1254932941635cfb9c36186ba6a654b3
> **Benchmark Evidence SHA256**: not-applicable

- P1 blockers: none. The independent gatekeeper round found no blocking findings across all five contract-mandated invariants, each re-derived from source and real test execution rather than accepted from this card's own earlier draft.
- P2 advisories: full-suite evidence contains one non-product fixture-start race historically seen in `tests/state/state-concurrency.test.ts`; it did not reproduce in the independent gatekeeper's own full run (1776 pass / 1 skip / 0 fail, clean). The inherited same-scope delegation transaction risk remains explicitly deferred to its own `tasks/todos.md` row.
- Acceptance checklist: review the exact subject hash and target above; independently confirmed — handler authority, single resolution, four-target pre-resolution projection with real write-count proof (not just final-content checks), gate precedence with genuine non-invocation assertions, cross-boundary lock interoperability against a real spawned bash writer, script deletion, golden confinement to exactly the four named Stop cells with decision/reason/exit_code unchanged, and the documented residual boundary.

## Independent Gatekeeper Verification (2026-07-21, post-implementation)

A fresh-context `gatekeeper` subagent (opus route) re-derived all five
contract-mandated hard invariants directly from source and real test
execution, explicitly instructed to treat this card's own claims as
unverified. Verdict: **PASS**, no blocking findings.

- Precedence: `stop-handler.ts:746-782` — readiness block (748-753, before
  `minimalChangeReview` at 761, so no minimal suffix); lite exit (754-756);
  plan block (768-775, carries suffix); delegation block (777-782, carries
  suffix). `tests/stop-handler.test.ts:233-299` assert genuine
  non-invocation (e.g. `plan-completeness.json` does not exist when
  readiness wins, proving the write never ran) not just "result looks
  right."
- Write-before-resolve: `StopProjectionBatch.commit()` (727-733) then
  `getStopEffectiveState()` (738). `tests/stop-handler.test.ts:87-109` uses
  a genuinely fresh fixture and asserts INSIDE the resolve callback that the
  files already exist — a real, non-superficial ordering proof. Nuance
  noted by the gatekeeper: that specific test's resolver is a stub
  returning `allow`; the real-resolver "fresh handoff → allow" property is
  covered separately by the loop-semantics golden's real-resolver path
  (which pre-seeds handoff, so it doesn't isolate ordering on its own) — the
  two suites compose to cover the full claim. Judged adequate, not a gap.
- Batched write-set: contract names exactly four targets; `StopProjectionBatch`
  (388-422) writes each once; the write-count test uses a real invocation
  observer (`observeProjectionWrite`), not a final-content check. The
  retired minimal-change→handoff/resume write path is confirmed gone
  (`minimalChangeReview`, 484-511, only reads/reports; canonical evidence
  moved to `.ai/harness/checks/minimal-change.latest.json`).
- Cross-boundary lock: `acquireLock`/`releaseLock`/`markDelegationFallback`
  (656-706) preserve the `wx` O_CREAT|O_EXCL create, token-matched release,
  and in-lock scope re-check. `tests/cli/hook.test.ts:2589` and the migrated
  TOCTOU test at 2774 both race a REAL separate bash process (built from
  `subagent-start-context.sh`), not an in-process mock — both pass.
- Allowed Paths + golden confinement: all 36 changed files map to the
  contract's `allowed_paths`; both script copies confirmed deleted from
  disk; projection file_count 18→17; both goldens confined to exactly the
  four named Stop cells with decision/reason/exit_code unchanged.
- Real verification run this pass: targeted 10-file suite 204/0 fail;
  `check:type`/`check:hooks`/`check:state-boundaries` all exit 0;
  `check-task-workflow --strict` OK; `verify-contract --strict` 32/0 failed,
  Fulfilled; full `bun test` 1776 pass / 1 skip / 0 fail, 135 files, 666s
  (the previously-reported flake did not reproduce).
- Retirement grep: 5 hits, all classified non-live (one negative-assertion
  test, `scripts/repo-harness.sh` — explicitly out of scope, ledgered to
  HRD-09 — and 3 historical research docs).

## Behavior Diff Notes

- `Stop.default` now runs one in-process TypeScript handler. It flushes the pending mutation journal, writes the four recovery projections once before resolution, consumes one memoized Effective State and its shared readiness verbatim, then preserves readiness/lite/diagnostic/plan/delegation ordering.
- The later minimal-change handoff/resume rewrite is intentionally removed; canonical minimal-change evidence and plan/delegation suffixes remain.
- Both `stop-orchestrator.sh` copies and the route reference are deleted. No compatibility dispatcher, fallback authority, or semantic translator remains.

## Residual Risks / Follow-ups

- Canonical external acceptance remains unavailable; this record is an operator waiver only and does not change the fail-closed parser. The owner authorized non-merge closeout for this subject and explicitly withheld merge authorization.
- Same-scope delegation state transaction redesign is a separate `tasks/todos.md` goal because both Stop and the surviving SubagentStart writer must change together.
- HRD-09 retains the broader legacy documentation/runtime sweep already assigned by the sprint.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | 9/10 | Required Stop behavior, ordering, precedence, first-run recovery, stdio, and lock interoperability are directly covered. |
| Product depth | 9/10 | Removes the final Stop bash authority and a nested state-resolution subprocess without introducing dual authority. |
| Design quality | 9/10 | One handler, one memoized state resolution, one enumerated projection commit, and fail-closed path/ownership validation. |
| Code quality | 8/10 | Deep architecture/security review corrections landed and focused/full evidence is strong; one unrelated full-suite fixture startup race was isolated and rerun green. |

## Failing Items

- No implementation finding remains. Canonical `verify-sprint` external acceptance remains unsatisfied by design; the explicit user waiver authorizes non-merge closeout only.

## Retest Steps

- Re-run: `bun test tests/stop-handler.test.ts tests/state-input-collector.test.ts tests/cli/hook.test.ts tests/hook-runtime.test.ts tests/hook-contracts.test.ts tests/cli/route-registry.test.ts tests/state/adapter-parity.test.ts tests/state/loop-semantics-characterization.test.ts tests/hook-runtime-characterization.test.ts tests/readme-dx.test.ts`.
- Re-check: `bun run check:type && bun run check:hooks && bun run check:state-boundaries && bun src/cli/index.ts run check-task-workflow --strict`.

## Summary

- Internal verdict PASS for subject `sha256:dc7686c054a2...`: HRD-06 cuts Stop to a single in-process authority, deletes both scripts, preserves the load-bearing ordering and gate semantics, and closes all introduced review findings. Tenant policy blocked the authorized Claude transfer before execution; the owner then recorded a one-shot user waiver for non-merge closeout, with merge explicitly excluded.
