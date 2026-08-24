# Plan: Verify-sprint incremental retry and expensive-run fuse

> **Status**: Archived
> **Created**: 20260824-2214
> **Slug**: verify-sprint-incremental-retry
> **Planning Source**: operator-closeout-handoff
> **Artifact Level**: work-package
> **Task Profile**: bugfix
> **Capability ID**: verification-evals-checks
> **Execution Mode**: contract-worktree
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: One frozen subject executes each expensive criterion at most once unless an explicit force reason is recorded.
> **Rollback Surface**: Revert the scheduler/cache change; existing verification semantics remain authoritative.

## Outcome

Prevent `verify-sprint --prepare-acceptance` from rerunning an already-passing full repository suite when only a cheap workflow/projection gate failed and the frozen subject has not changed.

This plan is a handoff for a new session. It is intentionally not the active plan.

## Observed Failure

On 2026-08-24, Operator closeout produced this exact sequence:

1. Run `.ai/harness/runs/run-20260824T213347-76409-20260824-1757-operator-connector-acceptance-repair.json` executed all 32 criteria. The full `bun test --timeout 60000` passed in `977844ms`; 31/32 criteria passed.
2. The sole failure was `bash scripts/check-task-sync.sh` in `53ms`. `verify-sprint` had materialized `docs/architecture/.projection-manifest.json` before verification, so the final sync check saw one substantive dirty projection without a dirty `tasks/` artifact.
3. After refreshing task evidence, `check-task-sync` and `check-architecture-sync` passed independently.
4. Because prepared evidence has no resume model, run `.ai/harness/runs/run-20260824T215306-81150-20260824-1757-operator-connector-acceptance-repair.json` executed the entire contract again. The same full suite passed again in `1069849ms`; 32/32 then passed.

The second 17.8-minute full-suite execution added no information. The valid retry surface was the failed 53ms sync gate.

## P1 Architecture Map

- `scripts/verify-sprint.sh` owns acceptance preparation, automatic architecture materialization, Change Assessment, evidence emission, and final receipt consumption.
- `scripts/verify-contract.sh` owns ordered execution of `tests_pass` and `commands_succeed`; it currently runs every declared criterion on every invocation.
- `scripts/run-bounded-verifier-command.ts` owns timeout-bounded command execution and timing evidence.
- `.ai/harness/runs/` and `.ai/harness/checks/latest.json` already retain ignored runtime evidence, but no authority consumes prior passing criteria for same-subject retry.
- `scripts/check-task-sync.sh` observes current worktree dirtiness; it cannot distinguish an automatic projection created inside the same acceptance transaction from an unsynchronized human code change.
- `scripts/acceptance-receipt.ts` must continue to bind exact normalized content, target revision, verification evidence, contract and goal authorities.
- Primary tests: `tests/helper-scripts.test.ts`; add smaller unit coverage only if the retry scheduler is extracted into TypeScript.

## P2 Concrete Trace

`verify-sprint --prepare-acceptance` currently follows this route:

1. Resolve immutable worktree base and active contract.
2. `materialize_automatic_architecture_projection` writes the projection manifest.
3. Freeze Change Assessment / normalized subject.
4. Invoke `verify-contract`, which runs all `tests_pass`, then every `commands_succeed` in contract order.
5. A late cheap command may fail after expensive commands passed.
6. Emit a failing run snapshot/checks projection.
7. Retry starts at step 1 and has no same-subject criterion reuse, so expensive commands run again.

Pressure point: verification evidence is all-or-nothing at the run level even though each guard already has a stable name, status, duration, command, exit code and frozen subject.

## P3 Decision

Preserve exact-subject correctness while making retries criterion-addressable.

### Required changes

1. Materialize automatic projections before all preflight checks and before computing the retry key.
2. Split criteria into:
   - preflight/cheap state gates, including architecture/task/workflow sync and scope checks;
   - expensive deterministic tests/runtime smoke;
   - final receipt-only projection.
3. Persist a criterion result keyed by at least:
   - normalized subject SHA256;
   - target revision;
   - contract and goal authority digests;
   - exact criterion kind/name/command;
   - relevant verification environment/toolchain fingerprint.
4. Reuse is opt-in through exact contract metadata; unknown or runtime/external-state criteria execute and are never cached by default.
5. On retry with an identical key, reuse only prior eligible `pass` results. Rerun failed, missing, timed-out, ineligible, or invalidated criteria.
6. Add an expensive-run fuse: a second execution of the same expensive criterion for the same key fails closed unless `--force-expensive-rerun --reason <non-empty>` is supplied and recorded in evidence.
7. The final AcceptanceReceipt must bind the composed evidence bundle and show which criterion results were executed, reused, or forced.

### Invariants

- Any source, contract, goal, target revision, command, toolchain, or automatic projection content change invalidates reuse.
- Never reuse failures, timeouts, unavailable results, or results from another repository/worktree authority.
- Do not weaken `check-task-sync`; fix transaction ordering and retry scheduling.
- Do not introduce a semantic fallback that marks unexecuted criteria as passing.

### 10x behavior

Without this change, full-suite cost grows linearly with every cheap closeout failure. At 10x suite duration, one projection ordering mistake consumes hours. With exact-key reuse, retry cost is proportional to failed criteria.

## Task Breakdown

- [x] Capture a pre-fix regression proving one automatic projection plus one late sync failure invokes the expensive runner twice across retry.
- [x] Extract or add a typed criterion-result identity and exact invalidation fingerprint.
- [x] Move automatic projection and cheap sync/scope gates ahead of expensive criteria.
- [x] Implement same-subject pass reuse and the explicit expensive-rerun fuse.
- [x] Emit executed/reused/forced provenance in run snapshots and checks projection.
- [x] Verify source/contract/goal/target/command/toolchain changes invalidate cached results.
- [x] Run the full suite once, then prove a same-subject retry does not invoke it again.

## Acceptance Tests

- Automatic projection changes the manifest before the retry key is frozen.
- An acceptance cheap-gate failure produces structured evidence with expensive invocation count `0`; after fixing only that gate, the expensive invocation count becomes `1`.
- A cheap-gate failure followed by correction reruns cheap preflight while keeping every prior eligible expensive pass monotonic.
- A passing `bun test --timeout 60000` is invoked once across same-subject retry.
- A source byte change invalidates the cached pass.
- Contract, goal, target revision, command, or toolchain fingerprint changes invalidate the cached pass.
- A timeout/failure is never reused.
- A criterion absent from explicit reuse metadata executes on every invocation and carries no cache key.
- A second identical expensive execution without explicit force reason is rejected before process spawn.
- Forced rerun evidence records the reason and does not alter AcceptanceReceipt subject semantics.

## Verification

- Focused `tests/helper-scripts.test.ts` regression suite.
- One disposable fixture proving the expensive command invocation count is exactly one across retry.
- Root required checks, with the root full suite invoked once for this work-package.

## Evidence Contract

- **State/progress path**: `plans/plan-20260824-2214-verify-sprint-incremental-retry.md` and its projected task contract.
- **Verification evidence**: focused `tests/helper-scripts.test.ts` regressions, `.ai/harness/runs/`, and the root required checks.
- **Evaluator rubric**: every cache identity dimension invalidates exactly, passing criteria carry executed/reused/forced provenance, and a same-key expensive pass cannot spawn twice without a recorded force reason.
- **Stop condition**: stop if exact-subject identity cannot bind repository, subject, target, contract, goal, command, and toolchain authorities without a semantic fallback.
- **Rollback surface**: revert the criterion scheduler/cache changes and their evidence fields; existing full-run verification remains the rollback behavior.

## Promotion Gate

- **Merge/PR unit**: one verification scheduler/cache change spanning `verify-sprint`, `verify-contract`, runtime evidence, and focused regressions.
- **Rollback surface**: criterion cache protocol, command ordering, force-rerun CLI, and executed/reused/forced evidence fields roll back together.
- **Verification boundary**: one frozen subject executes each expensive criterion at most once unless an explicit force reason is recorded.
- **Review/acceptance boundary**: exact subject and AcceptanceReceipt bindings remain unchanged while composed criterion evidence becomes reviewable.
- **High-risk surface**: stale pass reuse could falsely certify unexecuted code, so every declared authority and toolchain dimension must fail closed.
- **Why not checklist row**: this changes the shared verification contract and requires independent cache-invalidation and acceptance-evidence review.

## Non-scope

- Weakening exact-head/normalized-subject AcceptanceReceipt binding.
- Treating dirty workflow files as implicitly synchronized.
- Cross-subject or cross-repository test-result reuse.
- General-purpose remote build cache.
