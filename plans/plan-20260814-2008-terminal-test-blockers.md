# Plan: terminal-test-blockers

> **Status**: Completed
> **Created**: 2026-08-14 20:08
> **Slug**: terminal-test-blockers
> **Task Profile**: bugfix
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Restore deterministic terminal exit for the closeout process guardrail file and the immutable benchmark artifact reuse test, then prove the full suite can reach a terminal summary.
> **Rollback Surface**: Revert the bounded process/test-harness changes without touching hook-effect product code.
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260814-deepseek-harness-spatiotemporal-composability.md`
> **Task Contract**: `tasks/contracts/20260814-2008-terminal-test-blockers.contract.md`
> **Task Review**: `tasks/reviews/20260814-2008-terminal-test-blockers.review.md`
> **Implementation Notes**: `tasks/notes/20260814-2008-terminal-test-blockers.notes.md`

## Agentic Routing

- Selected route: two independent root-cause proofs, then one bounded implementation and gatekeeper review.
- Routing reason: both symptoms are terminal-process failures outside the active hook-effect contract and require bugfix evidence before edits.
- Due diligence:
  - P1 map: Bun test runner -> process/benchmark test -> process supervisor or isolated global install -> terminal exit.
  - P2 trace: reproduce each failing test alone, inspect the exact child/process-group or install lifecycle, and capture pre-fix exit evidence.
  - P3 decision rationale: fix the first production/test boundary that violates deterministic completion; do not raise timeouts or weaken cleanup assertions.

## Scope

- In scope: the two named failing tests, their directly owned process-runner/supervisor/launcher and benchmark producer paths, contract evidence, and full-suite verification.
- Out of scope: hook effect semantics, architecture projection content, product feature behavior, global installer compatibility, unrelated timing tests, and release/ship.
- Stop condition: revise this plan before touching any file not listed below; after three disproved hypotheses, hand back with evidence.

## File Changes

| File | Action | Purpose |
|---|---|---|
| `tests/unit/closeout-runner-guardrails.test.ts` | Test/fix if proven | Pin the process-group terminal-exit regression. |
| `src/effects/process-runner.ts` | Edit only if proven | Correct parent-side supervised process cleanup. |
| `src/effects/process-supervisor.ts` | Edit only if proven | Correct signal/group lifecycle ownership. |
| `src/effects/process-group-launcher.ts` | Edit only if proven | Correct launcher/target process-group behavior. |
| `tests/harness-benchmark-matrix.test.ts` | Test/fix if proven | Pin immutable artifact reuse terminal behavior. |
| `scripts/run-harness-profile-benchmark.ts` | Edit only if proven | Correct benchmark artifact/install lifecycle. |
| `tasks/contracts/20260814-2008-terminal-test-blockers.contract.md` | Add/update | Bugfix authority and root-cause evidence. |
| `tasks/notes/20260814-2008-terminal-test-blockers.notes.md` | Add | Decisions and deviations. |
| `tasks/reviews/20260814-2008-terminal-test-blockers.review.md` | Add | Acceptance projection. |
| `tasks/todos.md` / `tasks/current.md` | Update | Workflow projection. |

## Task Breakdown

- [x] Capture non-zero pre-fix artifacts for both isolated repros.
- [x] Prove one falsifiable root-cause sentence for each blocker.
- [x] Add regression guards that fail on the unfixed code.
- [x] Apply the smallest coherent fixes and run red-green.
- [x] Run focused tests, required repo gates, and the hermetic full suite.
- [x] Record review evidence and hand the hook-effect contract a terminal verification result.

## Acceptance Criteria

1. `closeout-runner-guardrails.test.ts` prints a normal Bun summary and exits 0; no descendant survives and no unrelated process group is signalled.
2. The benchmark artifact reuse test completes two isolated installs inside its bound and preserves both artifact and source authority.
3. No timeout increase, skipped assertion, compatibility fallback, network dependency, or cleanup weakening is used as the fix.
4. Root Cause Evidence contains the exact pre-fix repro, regression guard, and non-zero artifact for both symptoms.
5. Full hermetic `bun test` reaches a terminal summary.
