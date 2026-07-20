# Plan: HRD-07 circuit oscillation and shared lock

> **Status**: Review
> **Created**: 20260721-0218
> **Slug**: hrd-07-circuit-oscillation-and-shared-lock
> **Planning Source**: waza-think
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-07-circuit-oscillation-and-shared-lock
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: HRD-07 detector/lock fixtures, live caller regression tests, root required checks, and strict contract verification.
> **Rollback Surface**: Revert branch `codex/hrd-07-circuit-oscillation-and-shared-lock`; runtime circuit state is ignored and may be removed after confirming no hook process owns its lock.
> **Task Contract**: `tasks/contracts/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.contract.md`
> **Task Review**: `tasks/reviews/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.review.md`
> **Implementation Notes**: `tasks/notes/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.notes.md`

## Goal and Success Criteria

Extend `recordCircuitAttempt()` from exact full-key counting into one bounded,
progress-aware detector that:

1. counts an exact action repeated without progress;
2. recognizes `A -> B -> A` oscillation;
3. prevents unchanged blockers from escaping through reason/path/fingerprint
   rendering churn;
4. resets only when the existing LSC-04 `progressToken` changes; and
5. serializes the state read-modify-write through
`withExclusiveDirectoryLock(..., { reclaimStaleOwner: false })` while
   preserving the breaker's two-second bounded wait and operator-cleanup
   posture.

Success requires positive and negative fixtures for all four detector cases,
the existing concurrent-process cap fixture, a no-stale-reclaim fixture for
the shared directory lock, and no new global lock or caller-side progress
heuristic.

## Agentic Routing and Due Diligence

- Selected route: `$think` followed by an isolated contract worktree.
- Execution base: `origin/main@3776fb7dc2ddb5cd2602e45a37ee0f64c319856b`.
- Branch/worktree: `codex/hrd-07-circuit-oscillation-and-shared-lock` at
  `/Users/kito/Projects/repo-harness-wt-hrd-07-circuit-oscillation-and-shared-lock`.

### P1: Architecture Map

- Runtime authority: `src/cli/hook/circuit-breaker.ts`; all shell and
  in-process callers already supply `kind`, `guard`, `reason`,
  `pathOrAction`, `progressToken`, and `fingerprint`.
- Progress authority: the LSC-04 Effective State `progress_token`, a hash of
  subject/evidence revisions, completed tasks, hard blockers, and allowed-path
  coverage. HRD-07 consumes it verbatim and does not reconstruct it.
- Lock authority: `src/effects/locking/exclusive-directory-lock.ts`; current
  wrapper consumers are repository-local locks, not a global mutex.
- Persisted surface: ignored
  `.ai/harness/state/circuit-breaker.json` plus its sibling lock path.
- Live verification surfaces: `tests/harness-circuit-breakers.test.ts`,
  `tests/mutation-guard.test.ts`, `tests/cli/hook.test.ts`, and
  `tests/hook-runtime-characterization.test.ts`.
- Out of scope: HRD-06 delegation-state locking, caller schema redesign,
  progress-token wiring, hook shell projection, HRD-08 telemetry, HRD-09
  migration, and any compatibility reader for the retired breaker state
  schema.

### P2: Concrete Trace

1. A hook caller supplies an attempt and the Effective State progress token.
2. `recordCircuitAttempt()` validates the stable caller contract.
3. It selects the action stream by `kind`, derives a stable blocker key from
   `kind + guard`, and derives a render key from
   `reason + pathOrAction + fingerprint`.
4. Under the breaker-specific shared directory lock, it reads protocol-2
   state, compares the stored progress token, classifies the attempt from the
   current blocker/render and last two blocker observations, updates the
   capped no-progress count, and atomically replaces the state file.
5. A changed progress token replaces that kind stream's history with count
   one. Under an unchanged token, the same blocker increments for exact or
   superficial churn; `A -> B -> A` trips immediately; a genuinely different
   non-oscillating blocker begins a new streak at one.
6. The existing per-kind/profile limit turns the count into the unchanged
   `CircuitDecision` allow/trip result.
7. The lock releases only its own token; stale/live owners are never reclaimed
   by this caller and contention fails closed after two seconds.

### P3: Design Decision

Use `kind` as the bounded action stream and `hash(kind + guard)` as the stable
blocker key within it. `reason`, path, and the current caller-defined
fingerprint are rendering/action data: mutation guard fingerprints already
embed the proposed fix/path, so including them in the blocker key would
preserve the known churn bypass. The existing progress token is the only
semantic progress signal; detection never crosses a token boundary.

Persist the current blocker streak, current render key, and last two blocker
keys. The same blocker/render is `exact-repeat`; the same blocker with a new
render is `superficial-churn`; recent blockers `A,B` followed by `A` are
`oscillation` and force `repeat_count = limit + 1`; a different non-cycling
blocker starts at one. Persist the latest classification for inspection, but
keep the public `CircuitDecision` shape unchanged. A protocol-2 state replaces
protocol 1 in one cutover: protocol-1 runtime state is ignored and the first
new attempt starts at one. Only a missing state file or a structurally valid
protocol-1 envelope may start a fresh epoch; malformed state, unknown/future
protocols, and read errors fail closed without overwriting the evidence. There
is no dual semantic reader or migration shim.

The shared lock wrapper gains one options parameter and forwards it to
`acquireExclusiveDirectoryLock`; the options surface also admits a bounded
wait override so the breaker keeps its documented two-second limit while
other consumers retain the five-second default.

At 10x attempt volume, state remains bounded by the five circuit kinds and two
blocker hashes per kind. The first pressure point remains lock contention on
this one breaker state file, not unbounded history or a global lock.

## Detailed Design

### State Model

Protocol-2 state contains at most one entry per `kind`:

```ts
{
  progress_token: string;
  blocker_key: string;
  count: number;
  render_key: string;
  recent_blockers: readonly string[]; // at most two SHA-256 values
  last_pattern: 'initial' | 'real-progress-reset' | 'exact-repeat'
    | 'new-blocker' | 'oscillation' | 'superficial-churn';
}
```

Classification is deterministic:

- no prior stream: `initial`, count 1;
- different progress token: `real-progress-reset`, count 1, old history
  replaced;
- same token and blocker/render equal the latest values: `exact-repeat`;
- same token and blocker equal but render differs: `superficial-churn`;
- same token with recent blockers `A,B` and current blocker `A`, where
  `A != B`: `oscillation`, immediately forcing the capped tripped count;
- every other blocker change: `new-blocker`, count 1.

Exact repeat and superficial churn increment the current blocker streak,
capped at `circuitLimit(attempt) + 1` as today. Oscillation immediately uses
that capped tripped count. `limit === 0` still trips on the first observation.

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/cli/hook/circuit-breaker.ts` | Modify | Replace full-key protocol-1 counters and bespoke file lock with protocol-2 blocker streams, bounded action history, real-progress reset, and the shared lock wrapper. |
| `src/effects/locking/exclusive-directory-lock.ts` | Modify | Forward explicit options through `withExclusiveDirectoryLock` and support a validated wait-time override while preserving existing defaults. |
| `tests/harness-circuit-breakers.test.ts` | Modify | Add positive/negative detector fixtures; update lock fixtures to the shared directory-owner protocol; preserve concurrency and real-caller coverage. |
| HRD-07 plan/contract/notes/review | Modify | Record the frozen design, evidence, review subject, and closeout. |
| Sprint/current status | Modify at closeout | Project verified completion only after acceptance and merge boundaries are satisfied. |

### Rejected Alternatives

| Option | Rejection reason |
|--------|------------------|
| Keep the full existing key | Path/fingerprint churn still creates fresh counters and cannot catch A-B-A. |
| Add task/action/blocker fields to every caller | Current inputs already provide stable guard class plus authoritative progress; widening shell and TS callers adds authority without evidence. |
| Infer progress from paths, output text, timestamps, or local regexes | Creates a forbidden shadow authority and can reset on cosmetic churn. |
| Retain protocol 1 with optional history fields | Shallow old-state parsing would accept incomplete entries and create two semantic shapes. |
| Reclaim stale breaker locks | Changes the accepted fail-closed operator boundary and can race a live owner. |
| Introduce one global harness lock | Serializes unrelated state surfaces and violates the sprint acceptance. |

## Fragile Assumption and Falsifier

The fragile assumption is that each live `guard` denotes one stable blocker
class within its `kind`, while `progressToken` changes whenever its semantic
blocker set or authority revision changes. The cheapest falsifier is a live
caller that intentionally reuses one guard for unrelated blockers under an
unchanged progress token. If found, stop before implementation and add one
explicit authoritative blocker identifier across all callers; do not parse
or normalize reason/path strings locally. The enumerated current callers do
not falsify the assumption.

## Verification

Freeze code before producing final evidence.

1. Narrow behavior: `bun test tests/harness-circuit-breakers.test.ts`.
2. Live callers: `bun test tests/mutation-guard.test.ts tests/cli/hook.test.ts tests/hook-runtime-characterization.test.ts`.
3. Type and diff hygiene: `bun run check:type` and `git diff --check`.
4. Root required checks: `bun test`; deploy SQL order; architecture sync;
   task sync; strict task workflow; project-state inspection; adoption dry-run.
5. Contract gate: `repo-harness run verify-contract --contract tasks/contracts/20260721-0218-hrd-07-circuit-oscillation-and-shared-lock.contract.md --strict`.
6. Record a normalized review subject and obtain canonical external acceptance
   or a fresh user waiver before closeout. Merge requires separate explicit
   authorization.

## Promotion Gate

- **Merge/PR unit**: this HRD-07 branch is one independent detector/lock PR;
  it does not combine HRD-08 telemetry or HRD-09 migration.
- **Rollback surface**: revert the HRD-07 commit/PR; ignored protocol-2 state
  and the breaker-local lock may be operator-removed only after confirming no
  live owner.
- **Verification boundary**: freeze code, run detector/lock fixtures and live
  caller regressions, then run root required checks and strict contract
  verification exactly once for final evidence.
- **Review/acceptance boundary**: the review file must recommend pass for the
  normalized current subject, followed by canonical external acceptance or a
  fresh explicit user waiver; merge requires separate authorization.
- **High-risk surface**: progress-reset authority, A-B-A false positives,
  concurrent lost increments, and stale/live lock-owner preservation.
- **Why not checklist row**: the state protocol and lock-carrier cutover form
  an independent PR, rollback, verification, and acceptance boundary.

## Evidence Contract

- **State/progress path**: the plan Task Breakdown, protocol-2 ignored breaker
  state, HRD-07 contract/notes/review, sprint row 7, and `tasks/current.md` at
  closeout.
- **Verification evidence**: `.ai/harness/checks/latest.json`, bounded run
  snapshots, named tests/commands, normalized subject hash, and merge-gate
  receipt.
- **Evaluator rubric**: the review must score functionality at least 9/10 and
  code quality at least 8/10 with zero introduced blocker.
- **Stop condition**: implementation and all frozen-scope checks pass, review
  recommends pass, acceptance is canonical or explicitly waived, and the
  authorized PR boundary is complete.
- **Rollback surface**: revert the single HRD-07 PR and, after confirming no
  owner, clear only ignored breaker runtime state if required.

## Task Breakdown

- [x] Run `$think`, enumerate callers/locks/tests, and freeze P1/P2/P3.
- [x] Implement protocol-2 progress-aware blocker streams and shared lock use.
- [x] Add positive/negative detector, state-failure, and lock-semantics fixtures.
- [x] Run narrow and full verification after code freeze.
- [x] Complete internal review, record the explicit external-acceptance waiver,
  verify the contract, and project sprint row 7 complete.
- [ ] Merge and clean the worktree only after separate explicit authorization.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Session handoff: `.ai/harness/handoff/current.md`
- Preserve the main worktree's user-owned untracked `HANDOFF.md`.
