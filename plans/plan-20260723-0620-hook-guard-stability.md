# Plan: Hook guard: partition transient resolution instability from real blockers

> **Status**: Executing
> **Created**: 20260723-0620
> **Slug**: hook-guard-stability
> **Planning Source**: repo-harness-hunt
> **Orchestration Kind**: host-plan
> **Source Ref**: diagnosis:root-cause-prover-20260723
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260723-0620-hook-guard-stability.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260723-0620-hook-guard-stability.md`; after execution revert branch `codex/hook-guard-stability` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260723-0620-hook-guard-stability.contract.md`
> **Task Review**: `tasks/reviews/20260723-0620-hook-guard-stability.review.md`
> **Implementation Notes**: `tasks/notes/20260723-0620-hook-guard-stability.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-hunt planning output.
- Source ref: diagnosis:root-cause-prover-20260723
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260723-0620-hook-guard-stability.md`
- Sprint contract: `tasks/contracts/20260723-0620-hook-guard-stability.contract.md`
- Sprint review: `tasks/reviews/20260723-0620-hook-guard-stability.review.md`
- Implementation notes: `tasks/notes/20260723-0620-hook-guard-stability.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260723-0620-hook-guard-stability.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260723-0620-hook-guard-stability.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260723-0620-hook-guard-stability.md`.

## Approach
### Strategy
Use the captured planning output below as the execution source of truth.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Captured plan | Preserves the approved Codex Plan or Waza think decision | Requires the captured text to be concrete enough to execute | Use |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| See captured planning output | Follow | Implement only the approved scope named below |

### Code Snippets
See captured planning output.

### Data Flow
See captured planning output.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Captured plan lacks enough detail | Medium | Execution may need clarification | Stop before implementation if the captured output contradicts repo rules or lacks concrete file targets |

## Task Contracts
- Contract file: `tasks/contracts/20260723-0620-hook-guard-stability.contract.md`
- Review file: `tasks/reviews/20260723-0620-hook-guard-stability.review.md`
- Implementation notes file: `tasks/notes/20260723-0620-hook-guard-stability.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260723-0620-hook-guard-stability.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260723-0620-hook-guard-stability.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260723-0620-hook-guard-stability.md`; after execution revert branch `codex/hook-guard-stability` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260723-0620-hook-guard-stability.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260723-0620-hook-guard-stability.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260723-0620-hook-guard-stability.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260723-0620-hook-guard-stability.contract.md`, `tasks/reviews/20260723-0620-hook-guard-stability.review.md`, and `tasks/notes/20260723-0620-hook-guard-stability.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260723-0620-hook-guard-stability.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260723-0620-hook-guard-stability.md`; after execution revert branch `codex/hook-guard-stability` or the explicitly reviewed diff.

## Captured Planning Output

## Why

The PreEdit WorkflowProfileGuard blocks edits with one undifferentiated
banner ("Deterministic workflow profile resolution failed") for three
unrelated causes: a genuinely blocked effective state, an unsupported
profile, and — the defect — any exception thrown during resolution,
because `resolvePreEditEffectiveState` (src/cli/hook/runtime.ts:246-261)
collapses every throw into `null` via a catch-all. The dominant throw is
the stability contract in `resolveEffectiveState`
(src/effects/state/resolve-effective-state.ts:582-634): it re-reads all
workflow sources up to 4 times and throws "workflow authority changed
repeatedly" when `source_hashes` differ across reads — but the hash set
includes non-authority, high-churn surfaces (the full working-tree
`review_subject` diff fingerprint, `.ai/harness/checks/latest.json`,
`tasks/current.md`, handoff/resume), so ordinary concurrent work (bun
test, git commands, evidence-cache writes) makes an innocent Edit fail
closed. Root-cause diagnosis (2026-07-23, root-cause-prover) reproduced
this deterministically: 0/200 blocks at baseline, 30/30 blocks under
sustained working-tree churn with each resolution spending ~375 ms in
git subprocesses. A secondary same-shape path is the 5 s state-lock
timeout throw. The "No stderr output" variant is the same block after
the circuit breaker trips (stdout-only emission branch) and needs no
separate fix. Operationally this has cost every linked-worktree package
since EPC repeated false Edit/Write blocks worked around with heredoc.

## Goal

Partition the guard's failure modes so each gets truthful, distinct
handling, without weakening real-blocker enforcement:

1. Non-authority churn surfaces (`review_subject` diff fingerprint,
   checks/latest, tasks/current snapshot, handoff/resume projections) no
   longer participate in the stability-abort decision — instability of
   evidence caches or the working tree must not abort authority
   resolution. Authority surfaces (plan, contract, todos, policy,
   markers) keep the full stability contract.
2. The hook wrapper stops collapsing throws into `null`: resolution
   outcomes become typed (resolved | no-deterministic-profile |
   unstable/contended). Transient instability gets a bounded in-process
   retry; if still unstable, the guard STILL fails closed but with a
   distinct diagnostic naming concurrent-write instability and the
   retry, never the misleading "resolution failed" banner.
3. A genuinely blocked state (e.g. `conflict:plan_contract_relationship`)
   blocks exactly as today — byte-identical message and exit code,
   regression-guarded in both directions.
4. The circuit-breaker stdout-only emission branch is explicitly out of
   scope (it stops firing once transient blocks stop recurring).

## Root Cause Evidence

- root_cause: src/cli/hook/runtime.ts:246-261 catch-all converts the
  stability-contract throw from
  src/effects/state/resolve-effective-state.ts:582-634 (whose
  source_hashes at :482-501 include non-authority churn surfaces) into
  `null`, which mutation-guard.ts:398-406 cannot distinguish from a real
  blocker, so mutation-guard.ts:275-285 fails closed with the generic
  banner.
- repro: run resolveEffectiveState (or the verbatim hook-wrapper probe)
  in a loop while a concurrent writer churns the working tree /
  checks/latest.json; stability loop exhausts and throws (diagnosis
  probes: baseline 0/200 blocked, single-source churn 16/200 throws,
  git-churn 30/30 blocked; probe scripts and JSON results preserved in
  the package notes/run snapshots).
- regression_guard: tests/state/effective-state-stability.test.ts —
  injects a source mutation between stability re-reads (deterministic:
  flip one hashed source between reads) and asserts (a) resolution does
  not surface as the unresolvable-profile block for non-authority churn,
  (b) a real plan/contract conflict still blocks identically.
- pre_fix_failure_artifact: .ai/harness/runs/hook-guard-stability/
  pre-fix-regression.log (captured red run of the regression guard on
  unfixed code, PRE_FIX_EXIT non-zero, produced before the fix lands).

## Task Breakdown

- [ ] Add the regression guard red-first: deterministic instability
  injection into the stability loop; capture the pre-fix failure
  artifact with PRE_FIX_EXIT recorded.
- [ ] Partition `source_hashes`: stability-abort set restricted to
  workflow-authority surfaces; non-authority surfaces still read and
  reported (subject/evidence revisions in the output remain), but their
  churn cannot exhaust the stability loop.
- [ ] Type the hook wrapper's resolution outcome; bounded retry (2-3
  attempts) on unstable/contended; distinct fail-closed diagnostic for
  residual instability naming the mechanism and the retry; identical
  behavior and message for genuine blockers and unsupported profiles.
- [ ] Cover the state-lock-timeout throw with the same typed handling.
- [ ] Copy the diagnosis probe artifacts into the package's run
  snapshots; record design decisions in the notes file.
- [ ] Full verification: new regression guard green post-fix, real-
  blocker regression (Occurrence-A shape) green, focused state/hook
  suites, check:type, full bun test.

## Verification

```bash
bun test tests/state/effective-state-stability.test.ts
bun test tests/state/ tests/cli/
bun run check:type
bun test
```

## Non-goals

- No fail-open path: residual instability still blocks, only with a
  truthful diagnostic.
- No circuit-breaker emission changes.
- No change to blocker semantics, plan-transition rules, or any SSD
  surface (`src/core/skill-surface/`, installer, sync script).
- No global CLI refresh in this package (operator action after merge).

## Rollback Surface

Revert the single PR; the guard returns to the current
collapse-and-block behavior. No state artifacts or installed surfaces
are migrated.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Add the regression guard red-first: deterministic instability
- [ ] Partition `source_hashes`: stability-abort set restricted to
- [ ] Type the hook wrapper's resolution outcome; bounded retry (2-3
- [ ] Cover the state-lock-timeout throw with the same typed handling.
- [ ] Copy the diagnosis probe artifacts into the package's run
- [ ] Full verification: new regression guard green post-fix, real-
