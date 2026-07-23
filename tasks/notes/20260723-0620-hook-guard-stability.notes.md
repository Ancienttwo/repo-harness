# Implementation Notes: hook-guard-stability

> **Status**: Active
> **Plan**: plans/plan-20260723-0620-hook-guard-stability.md
> **Contract**: tasks/contracts/20260723-0620-hook-guard-stability.contract.md
> **Review**: tasks/reviews/20260723-0620-hook-guard-stability.review.md
> **Last Updated**: 2026-07-23 06:59
> **Lifecycle**: notes

## Design Decisions

- **Authority-set membership** (`src/effects/state/resolve-effective-state.ts`):
  classified the stability contract's `source_hashes` keys by EXCLUSION —
  everything is authority except the five keys the Root Cause Evidence
  names explicitly: `review_subject` (working-tree diff fingerprint,
  additionalHashes key), `CHECKS_PATH` (`.ai/harness/checks/latest.json`),
  `CURRENT_SNAPSHOT_PATH` (`tasks/current.md`), `HANDOFF_PATH`
  (`.ai/harness/handoff/current.md`), `RESUME_PATH`
  (`.ai/harness/handoff/resume.md`). Everything else stays authority:
  `ACTIVE_PLAN_MARKER`, `ACTIVE_WORKTREE_MARKER`, `POLICY_PATH`,
  `CAPABILITY_REGISTRY_PATH`, the dynamic `planPath`/`contractPath`, the
  dynamic `reviewPath` (the review **file's own content hash** — distinct
  from the `review_subject` diff-fingerprint key, and not named as
  non-authority anywhere in the diagnosis), `ACTIVE_SPRINT_MARKER`, the
  dynamic `sprintPath`, and `authority_revision` (itself a pure function of
  the other authority keys, so its bucket placement doesn't change
  comparison behavior, but semantically belongs there). Chose an exclusion
  list (`NON_AUTHORITY_SOURCE_HASH_KEYS`) rather than enumerating inclusion
  because the excluded set is small, fixed, and literally named by the
  diagnosis, whereas the authority set has several repo-dependent dynamic
  path values. The plan's Goal prose also says "todos" as an authority
  example, but `tasks/todos.md` is not and never was one of the hashed
  `source_hashes` keys (confirmed by grep) — that's a loose gloss in the
  prose, not a literal key to add; adding it would violate Scope's "output
  fields... keep their current shape and content."
- **Both stability-comparison call sites partitioned, not just the loop.**
  `resolveStableEffectiveState`'s 3-attempt re-read loop is the named
  "stability contract," but `resolveAndCommitEffectiveState`'s
  `confirmSnapshot` callback (the version-lock's post-stabilization re-check)
  does the exact same `JSON.stringify(source_hashes) === JSON.stringify(...)`
  comparison and, on two consecutive mismatches, throws the identical
  `'workflow authority changed repeatedly...'` message via
  `StateVersionConfirmMismatchError` conversion. Partitioning only the loop
  and leaving this second comparison on the full map would leave the exact
  same bug reachable through a different door under sustained non-authority
  churn (the confirm-window re-read would keep seeing it "change"). Root
  Cause Evidence's own cited line range (582-634) spans both call sites'
  surrounding code, and the Falsifier's "resolved output stays byte-identical
  for a quiescent repo" holds unchanged either way (this only touches the
  retry/throw DECISION, never what `resolveEffectiveStateUnlocked` computes
  or returns). Both sites now call the same `authoritySourceHashes()`
  projection — one source of truth for "what counts as authority" within
  this file.
- **Bounded retry count: 3 total attempts** (1 initial + 2 retries) in
  `resolvePreEditEffectiveState` (`src/cli/hook/runtime.ts`). The task's
  "2-3 attempts" band is read here as total attempts (the upper end),
  bounding added PreToolUse latency to roughly 3x a single resolution's
  diagnosed ~375ms (git-subprocess-heavy) cost — about 1.1s worst case —
  rather than stacking a fourth. If the intended reading was "2-3 retries
  beyond the first" this is a documented interpretation choice within the
  named numeric envelope, not a silent deviation.
- **Signal shape: re-throw, not a new return type.** `MutationGuardCollector.
  getPreEditEffectiveState` and the underlying `resolvePreEditEffectiveState`
  dep type are constrained to `EffectiveState | null` by files OUTSIDE this
  package's allowed_paths (`src/cli/hook/handler-contract.ts` pins
  `StateInputCollector<..., EffectiveState | null, ...>` on
  `HookHandlerContext.collector`; `handler-registry.ts` passes that same
  typed collector straight into `runMutationGuard`). A three-member
  discriminated-union return type was therefore not reachable without
  editing forbidden files. Implemented the typed outcome as: resolved ->
  return the `EffectiveState`; any non-instability throw -> catch and
  return `null` (today's exact behavior, zero retries, byte-unchanged);
  recognized instability with retries exhausted -> re-throw the original
  error instead of collapsing to null. `mutation-guard.ts` wraps its single
  `getPreEditEffectiveState()` call site in try/catch and renders the new
  diagnostic on catch. This works because, by construction, the only thing
  that can throw through that call site in production or in any existing
  test's wiring is this one recognized-instability re-throw (every other
  exception is caught-and-nulled inside the same function before it ever
  reaches the collector boundary) — verified by grep across `tests/` for
  every existing `resolvePreEditEffectiveState` mock (all use their own
  inline catch-to-null, never exercising this code path) plus the full
  `bun test` run. No new export or cross-file import was added between
  `runtime.ts` and `mutation-guard.ts` to keep this signal (avoids a
  `runtime.ts` -> `handler-registry.ts` -> `mutation-guard.ts` ->
  `runtime.ts` import cycle, since `mutation-guard.ts` is otherwise a leaf
  relative to `runtime.ts`/`handler-registry.ts`).
- **Instability recognition is two literal message patterns**, local to
  `runtime.ts`: exact match on `'workflow authority changed repeatedly while
  resolving effective state'` (the stability throw) and a prefix match on
  `'timed out waiting for exclusive lock '` (the exclusive-lock timeout,
  `src/effects/locking/exclusive-directory-lock.ts`, per the plan's
  "cover the state-lock-timeout throw with the same typed handling").
  Anything else is caught immediately with zero retries, preserving today's
  behavior exactly for every other throw origin (malformed policy JSON,
  unsafe path validation, etc.) — none of those are diagnosed as
  concurrency, so none get relabeled as "unstable."
- **Diagnostic wording** (`mutation-guard.ts`, new
  `WorkflowResolutionUnstableGuard` guard tag — distinct from
  `WorkflowProfileGuard` so operators can tell "transient churn, retry"
  from "unresolvable, go fix your plan/contract" at a glance): stdout —
  `Workflow resolution stayed unstable for <path> after bounded retries.`;
  structuredError reason — `Concurrent workflow-state writes kept resolution
  unstable for <path>; bounded retries were exhausted.`; fix — `Retry the
  edit once concurrent workflow-state writes settle.`. Names the mechanism
  (concurrent workflow-state writes) and that retries were exhausted, one
  line each, `failure_class: state_violation` (same class the existing
  `WorkflowProfileGuard` banner uses). Still fails closed (`exit(2)`) — no
  fail-open path.
- **Existing tests touched: zero.** Only
  `tests/state/effective-state-stability.test.ts` was added; no existing
  test file was modified. `bun test` (full suite) confirms nothing else
  needed a behavior-pinning update.

## Deviations From Plan Or Spec

- None recorded.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Discriminated-union return type for the typed resolution outcome vs. re-throw on residual instability | Re-throw | The union's return type is externally pinned to `EffectiveState \| null` by out-of-scope files (`handler-contract.ts`, `handler-registry.ts`); re-throwing communicates the third outcome without touching them |
| Shared exported predicate for "is this instability" (in `resolve-effective-state.ts`, imported by both `runtime.ts` and `mutation-guard.ts`) vs. keeping recognition local to `runtime.ts` only | Local to `runtime.ts` only | `mutation-guard.ts`'s single call site can only ever see this one recognized re-throw in practice (every other throw origin is already caught-and-nulled inside `runtime.ts`), so no second recognition check is needed; keeps the diff smaller and avoids a new cross-file coupling |
| Partition only `resolveStableEffectiveState`'s loop vs. also `resolveAndCommitEffectiveState`'s confirmSnapshot re-check | Both | The confirmSnapshot callback does the identical full-map comparison and throws the identical message; leaving it unpartitioned would keep the diagnosed bug reachable through the version-commit path |
| Retry count 3 (1 initial + 2 retries) vs. 4 (1 initial + 3 retries) | 3 | Upper end of the named "2-3 attempts" band read as total attempts; bounds worst-case added PreToolUse latency given the diagnosed ~375ms/resolution cost |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- Promote to `tasks/lessons.md` only after a repeated correction or failure pattern.
- Promote to `docs/researches/` only when it is durable repo knowledge with evidence.
- Promote to harness asset files only after verification across more than one task or fixture.
