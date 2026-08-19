> **Archived**: 2026-08-20 03:49
> **Related Plan**: plans/archive/plan-20260820-0159-wp3-hook-visibility.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260820-0349

# Task Review: wp3-hook-visibility

> **Status**: Complete
> **Plan**: plans/plan-20260820-0159-wp3-hook-visibility.md
> **Contract**: tasks/contracts/20260820-0159-wp3-hook-visibility.contract.md
> **Notes File**: tasks/notes/20260820-0159-wp3-hook-visibility.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-08-20 03:36
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:f57802705657ef553117f48489a450128d1ed142422d0601829ab632aa9b6d05
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 01e9bffdc7e2145ece728df21fe6bb03b9c96225

## Human Review Card

- Verdict: pass
- Change type: code-change
- Intended files changed: the 18 paths enumerated in the contract's `allowed_paths` (types/projector/collector/claim-token reader/renderer, three mounts inside existing handlers, three test files, two architecture docs, and the plan/contract/review/notes/todos workflow set)
- Actual files changed: 18 files, +2600 -32, every one inside `allowed_paths`; `git diff` against `route-registry.ts`, `scripts/`, `assets/`, `*.json` and the lockfiles is empty, and the `SendUserMessage` branch is byte-identical to base (1935 bytes each side under `cmp`)
- Commands passed: `bun test` 2703 pass / 0 fail / 1 skip across 199 files (exit 0); five targeted suites 102 pass / 0 fail / 787 expects; `tests/board-projection.test.ts` 22/22; `tests/board-slice.test.ts` 32/32; `bun run check:type` exit 0; `bash scripts/check-architecture-sync.sh` exit 0 (`blocking=0 dead_letters=0 uncommitted=0`); `cmp` parity clean for both `sprint-backlog.sh` and `contract-worktree.sh`; contract gate `total=12 failed=0 status=Fulfilled`
- Residual risks: claim-token GC gap (ledger row opened this slice); self-steal command wording (P3, pre-existing shared-board behaviour); armed lease gate consumes 11.4% of the measured `PreToolUse.edit` p50 budget
- Reviewer action required: none — acceptance gate closed with an `external_pass` AcceptanceReceipt
- Rollback: zero persistent writes, zero schema change, zero route change; reverting deletes three additive call sites inside existing handlers (<=35 lines each) and leaves the new files as dead code, with no migration, state cleanup, or lease impact

## Mode Evidence

- Selected route: gatekeeper acceptance review dispatched with zero side effects, then a separate orchestrator execution order for the ship path; the review pass touched nothing and recorded `git status` / `HEAD` before and after to prove it
- P1/P2/P3 evidence: P1 mapped the three mount points against the route table in `docs/architecture/global-hook-runtime.md` and confirmed the tuple order (Codex trust-hashes it) is unchanged; P2 traced one concrete path end to end — active-plan marker -> `findClaimTokenByUnitRef` -> double arming predicate -> `collectSliceInputs` -> `projectBoardSlice` -> `renderBoardSlice` -> both host wrappers — and separately traced the armed `PreToolUse.edit` path through all five ownership steps to their `exit(2)` sites; P3 verified the design constraint the shape encodes, namely that claim tokens have no GC path so arming binds `unit_ref` to the current active-plan marker rather than token existence
- Root cause or plan evidence: task profile is `code-change`, not `bugfix`, so the Root Cause Evidence Gate does not apply; the authority is the plan's T1-T8 with frozen verdicts A-H and the measured cost basis, all of which the delivery matches

## Verification Evidence

- Waza `/check` run: not used; the contract's own `exit_criteria` gate is the verification authority for this slice and it ran through `verify-sprint --prepare-acceptance`
- Commands run: `bun test` (full, 582.31s, 2703/0/1, exit 0); `bun test` on the five contract suites (102/0); `bun test tests/board-projection.test.ts` (22/0); `bun test tests/board-slice.test.ts` (32/0); `bun run check:type` (exit 0); `bash scripts/check-architecture-sync.sh` (exit 0, run outside the sandbox per the contract's `commands_succeed` comment, with `REPO_HARNESS_NODE_BIN` preserved); `cmp` x2; `repo-harness run verify-sprint --prepare-acceptance --contract ...` (`total=12 failed=0 status=Fulfilled`)
- Manual checks: independent cost reprobe (`git worktree list --porcelain` 6.20ms measured vs the 6.9ms claimed for `readWorktreeTopology`; `git show HEAD:<sprint>` 7.39ms) and re-derivation of all four regression percentages against the 256.2ms baseline; byte-level `cmp` of the `SendUserMessage` branch between base and HEAD; grep sweep proving zero non-comment occurrences of `resolveEffectiveStateReadOnly` / attempt-ledger reads in the new effects files; existence check for every `repo-harness sprint` subcommand named in the gate's fix strings
- Supporting artifacts: full-suite log at `/tmp/wp3-full-test.log`; prepare-acceptance log at `/tmp/wp3-prepare.log`; receipt at `/tmp/wp3-receipt.log`
- Implementation notes reviewed: `tasks/notes/20260820-0159-wp3-hook-visibility.notes.md`, including both cost-measurement methods and the falsifier probe outcome
- Run snapshot: `.ai/harness/runs/run-20260820T031816-27741-20260820-0159-wp3-hook-visibility.json`

## Acceptance Receipt Projection

> **Disposition**: external_pass
> **Reviewer**: Claude
> **Source**: claude-review
> **Actor**: not-applicable
> **Reviewed Subject SHA256**: sha256:f57802705657ef553117f48489a450128d1ed142422d0601829ab632aa9b6d05
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: 01e9bffdc7e2145ece728df21fe6bb03b9c96225
> **Verification Evidence SHA256**: sha256:8fd619ede0e9f115873d0d1d53e0f404d1b6b0f06a5242059a4f57b0e8ba9d42
> **Issued At**: 2026-08-19T19:36:16.651Z

- Summary: WP3 hook visibility gate review: PASS on all nine judgement points. A scope: 18 files (+2600 -32) all inside allowed_paths, zero route-tuple change, zero scripts/template/schema/lockfile change, SendUserMessage branch byte-identical (1935 bytes both sides via cmp). B frozen verdicts: progress_state/column/conflict fields structurally absent, pinned by six Object.hasOwn===false assertions; zero non-comment occurrences of resolveEffectiveStateReadOnly/attempt-ledger reads in the two new effects files; no caching; session-context-budget untouched; 2000-byte cap with two-stage deterministic truncation. C arming: cost-ordered double predicate (token scan before git rev-parse), stale-token and primary-tree cases assert collectCalls===0, inline: prefix disjoint by construction, ambiguity pinned at both reader and gate level. D fail semantics: eight distinct reason tokens across five steps, each exit(2)+contract_failure; pre-arming IO failure advisory+pass; no fail-closed dependency can escape as an exception (resolveBoardSliceBlock, resolveGitDir and the token read are each total or caught). E byte equality: Codex additionalContext vs Claude updatedInput.prompt marker block compared with toBe on one fixture, plus HOOK_HOST!==codex exactly-once reverse test; runReturnChannel dual-appendix refactor fixes the old marker early-exit that would have swallowed the slice. F cost: independently reprobed component magnitudes (git worktree list 6.20ms vs claimed 6.9ms) and re-derived all four percentages (0.028%/11.444% component, 1.19%/12.55% end-to-end) against the 256.2ms baseline; all within the <2%/<15% stop-condition budgets. G shared derivation: board-projection 22/22 pass proves the extraction is behaviour-neutral; worktree_missing rewrite proven logically equivalent under the tri-state narrowing; slice and board physically share deriveTaskState/deriveOwnershipDiagnostics/deriveColumn/deriveActions/deriveClaim so a classification fork is impossible. H self-steal UX recorded as the P3 finding above, non-blocking. I test honesty: five bodies spot-checked as behavioural; the zero-overhead spy is a real mock.module interception delegating to the real collector, not a stub. Verification re-run in the review session: bun test 2703 pass / 0 fail / 1 skip across 199 files (582.31s, exit 0; main baseline 2669/1/0, net +34, known flake pair not hit); five targeted suites 102 pass / 0 fail / 787 expects; board-projection 22/22; board-slice 32/32; bun run check:type exit 0; check-architecture-sync.sh exit 0 with blocking=0 dead_letters=0 uncommitted=0; cmp parity clean for sprint-backlog.sh and contract-worktree.sh. Hard-stop sweep clean: sprint bind/release/steal/reconcile all exist in src/cli/commands/sprint.ts, no dependency or lockfile change, no secrets, no sleeps, no stale generated output.
- Findings: P3: project-board.ts:299 deriveActions offers steal --expected-claim-id <own claim> on the slice self row, i.e. steal-from-self. Pre-existing shared board behaviour reused by the slice, not introduced by WP3; suppressing it only on the slice side would fork the derivation into dual authority. Fix path if pursued: add an explicit viewer parameter to deriveActions so both projections share one suppression rule.

## Behavior Diff Notes

- Spawn-time injection is new behaviour on two routes that previously carried no coordination context. Codex `SubagentStart.context` gains the block ahead of the long-command guardrail; Claude `PreToolUse.subagent` gains it on the `Task|Agent` branch only. Both are advisory: `resolveBoardSliceBlock` catches internally and returns null, so a resolution failure is silence rather than a failed spawn. A repository running no sprint resolves to null and sees no change at all.
- `runReturnChannel` changed shape. The old code returned early on `RETURN_CONTRACT_MARKER`, which was correct while the contract text was the only appendix and would have swallowed the slice once a second one existed. It now evaluates two independently marker-gated appendices and emits `updatedInput` whenever either changed the prompt. A fully-stamped prompt replays as a no-op; a prompt carrying only the return contract still receives the slice. The `SendUserMessage` branch and its deny semantics are untouched byte for byte.
- `PreToolUse.edit` gains `LeaseOwnershipGuard` between `mainLoopDispatchGuard` and the Effective State resolution, so ownership is adjudicated before scope. An unarmed tree is affected by nothing measurable (0.072ms, and the collector spy asserts zero invocations); an armed tree that passes every step is likewise affected by nothing. Only an armed tree that fails a step sees new behaviour, and it is always an explicit `exit(2)` carrying one of eight distinct reason tokens.
- `project-board.ts` internals were renamed and exported (`taskState` -> `deriveTaskState`, `projectDiagnostics` -> `deriveOwnershipDiagnostics`, `projectColumn`/`projectActions`/`projectClaim` -> `derive*`) and now consume a narrowed `BoardOwnershipInput`. The board's own output is unchanged: `tests/board-projection.test.ts` passes 22/22, and the one semantically live rewrite — `worktree_missing` moving from `evidence !== null && !evidence.worktree_present` to `worktree_present === false` — is logically equivalent under the tri-state narrowing.
- `BoardDiagnosticsV1` is now `BoardOwnershipDiagnosticsV1` plus `progress_unreadable_reason`. Existing consumers of `BoardDiagnosticsV1` see an unchanged field set.

## Residual Risks / Follow-ups

- Claim-token garbage collection (`scripts/sprint-backlog.sh:655` writes, only inline `release_task_lease:806` deletes): a contract-mode token outlives its lease forever. WP3's `unit_ref` binding makes a stale token inert **for this lease gate specifically**; it does not make stale tokens harmless repository-wide, and any future consumer reading a token without that binding inherits the original trap. Carried as a new `tasks/todos.md` row; closing it means changing the shell ownership verbs, which is a WP1-side authority change.
- Self-steal command wording (`src/core/state/project-board.ts:299`): `deriveActions` offers `steal --expected-claim-id <own claim>` on the slice's own `self` row. This is pre-existing shared board behaviour that the slice reuses, not something WP3 introduced, and suppressing it only on the slice side would fork one derivation into two authorities. If pursued, the fix is an explicit viewer parameter on `deriveActions` so both projections share one suppression rule. Recorded as the receipt's P3 finding.
- Cost headroom on the armed path: 29.3ms measured against a 256.2ms p50 baseline is 11.4% of a <15% budget. The margin is real but not large, and it is dominated by two git subprocesses (`readCanonicalSprint`, `readWorktreeTopology`). A canonical sprint that grows substantially, or a repository with many linked worktrees, is what would erode it first.
- The lease gate is early feedback, not publication authority. A `Bash` write bypasses it entirely; `start-task` claim, inline `complete-task`, and `contract-worktree finish` remain the real gates. Nothing in this slice relaxes them, and the guard's own module comment says so.

## Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Functionality | n/a | Numeric scoring withheld deliberately. The acceptance contract for this slice is binary and already enumerated: the contract's twelve `exit_criteria` items, the plan's frozen verdicts A-H, the two cost-regression thresholds, and the falsification-matrix rows WP3 owns. All are recorded as pass/fail with commands and measured numbers above; collapsing them into a score would replace verifiable constraints with an opinion. |
| Product depth | n/a | Same reason. What matters here is stated as invariants — structural absence of `progress_state`/`column`/conflict fields, one renderer for both hosts, one shared ownership derivation, arming bound to `unit_ref` — each of which is pinned by a named test rather than a rating. |
| Design quality | n/a | Same reason. The design constraints are recorded in `## Behavior Diff Notes` and `## Residual Risks / Follow-ups` as things that must stay true, which is the actionable form. |
| Code quality | n/a | Same reason. `bun run check:type` exit 0 and 2703 passing tests are the evidence; a number adds nothing a reviewer could act on. |

## Failing Items

- None. Twelve of twelve contract exit-criteria items passed (`[ContractVerify] total=12 failed=0 status=Fulfilled`), and the review pass found zero blocking issues across all nine judgement points. The single recorded finding is P3 and non-blocking.

## Retest Steps

- Re-run: `bun test` (expect 2703 pass / 0 fail / 1 skip across 199 files); `bun test tests/board-slice.test.ts tests/subagent-handler.test.ts tests/mutation-guard.test.ts tests/hook-protocol.test.ts tests/board-projection.test.ts` (expect 102 pass / 0 fail); `bun run check:type` (expect exit 0); `bash scripts/check-architecture-sync.sh` outside the sandbox with `REPO_HARNESS_NODE_BIN` preserved (expect exit 0, `blocking=0`)
- Re-check: `git diff <merge-base>...HEAD -- src/cli/hook/route-registry.ts` stays empty (route tuples are a Codex-trust-hashed public contract); the `SendUserMessage` branch of `runReturnChannel` stays byte-identical; `grep` finds no non-comment `resolveEffectiveStateReadOnly` or attempt-ledger read in `src/effects/state/collect-slice-inputs.ts`; the six `Object.hasOwn(...) === false` assertions in `tests/board-slice.test.ts:344-349` still hold; the collector spy still asserts `collectCalls === 0` on every unarmed case

## Summary

WP3 closes the coordination plane's last visibility gap: a freshly spawned subagent now reads its peers' live leases at spawn, and an agent editing under a lease it no longer holds is refused at the edit rather than at finish. Both arrive as additions inside three existing handler branches — no route added, none reordered.

The delivery's hard problem was arming. Claim tokens are write-only with no GC path, so the obvious "a token exists, therefore arm" predicate would permanently arm any tree that once ran an inline sprint task and block every later edit against a lease nobody holds. The implemented predicate binds the token's `unit_ref` to the current active-plan marker and additionally requires a linked worktree, evaluated in cost order so the unarmed path pays one filesystem scan (0.072ms) and never forks git. The stale-token and primary-tree regressions are both pinned with `collectCalls === 0`.

Everything else follows from two refusals to duplicate authority. The slice omits `progress_state`, `column`, and the conflict fields structurally rather than emitting degraded values, because a second quieter column rule would disagree with `state board --json` on exactly the `stalled` rows; and both projections call one extracted ownership derivation, so slice and board cannot classify the same lease differently. Cost stays inside budget on both measurement methods (0.028% / 11.444% by component isolation, 1.19% / 12.55% end to end, against <2% / <15%), and I independently reprobed the component magnitudes and re-derived every percentage rather than accepting the reported figures.

Accepted with one P3 finding on pre-existing self-steal command wording, and one new ledger row for the claim-token GC gap this slice deliberately did not close.
