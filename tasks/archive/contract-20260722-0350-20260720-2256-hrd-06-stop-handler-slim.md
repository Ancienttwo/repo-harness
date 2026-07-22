# Task Contract: hrd-06-stop-handler-slim

> **Status**: Fulfilled
> **Plan**: plans/plan-20260720-2256-hrd-06-stop-handler-slim.md
> **Task Profile**: code-change
> <!-- legal values: code-change | docs-only | ledger-closeout | migration | eval-only | delegated-run | bugfix (omit for legacy passthrough); see docs/reference-configs/sprint-contracts.md -->
> **Owner**: kito
> **Capability ID**: root
> **Last Updated**: 2026-07-21 01:10 (implementation and internal verification complete; external acceptance pending)
> **Predecessors**: HRD-03 (#97, mutation-guard pattern), HRD-04 (#98, session-context pattern), HRD-05 (#99, mutation-observed journal pattern)
> **HRD-06 Execution Base**: `origin/main@e0e57acd1254932941635cfb9c36186ba6a654b3` (post-HRD-05 full closeout; this branch's fork point)
> **Review File**: `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md`
> **Notes File**: `tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md`
> **Exemplar**: `docs/reference-configs/contract-brief-example.md`

## Why

Stop is the last host event still dispatched to a bash script. Today it runs
two-step (`src/cli/hook/runtime.ts:422-448`): the TS layer unconditionally
calls `consumePendingPostEditEvents()` (HRD-05's journal flush, deliberately
excluded from `scriptsRun`/telemetry to keep the golden byte-stable), then the
generic script loop spawns the 812-line `stop-orchestrator.sh`, which
re-resolves Effective State via its own CLI subprocess and scatters writes
across the handoff file, the resume packet, the minimal-change review section,
a plan-completeness signature file, and delegation state — each via its own
`mkdir`+`mktemp`+`mv`. If this ships wrong in either direction: (a) collapsing
the writes into a single end-of-handler commit without preserving today's
write-before-resolve ordering silently reintroduces a false `block` on a
repo's first-ever Stop (no prior handoff — see Falsifier); or (b) porting the
three block gates (readiness / plan-completeness / delegation) as a flat
sequence instead of the bash script's strict short-circuit precedence changes
which block message a multi-condition Stop actually returns, a real behavior
regression the golden's single no-gate-fires fixture scenario cannot catch.

## Goal

`Stop.default` runs a single in-process handler
(`src/cli/hook/stop-handler.ts`) that: consumes one memoized Stop-shaped
Effective State resolution from a new `StateInputCollector` getter (no second
resolution, no second `evaluateReadiness()` call — reads `state.readiness`
verbatim); flushes the pending PostEdit journal (reusing HRD-05's
`consumePendingPostEditEvents`, now invoked from inside the handler instead of
as a separate pre-step); reproduces the bash script's exact gate precedence
(readiness-block > plan-completeness-block > delegation-block, each an
immediate single-block-JSON exit, later gates never evaluated once an earlier
one fires) and its lite-profile short-circuit (readiness gate only, then
exit); collapses the recovery projection into a named, enumerable write-set
committed by one `StopProjectionBatch`-style call before resolution, each
target written at most once and replaced atomically per-file (no new
cross-file/EPC-scoped checkpoint mechanism). The script's later
minimal-change append into handoff and resume is retired as an explicit
projection-only delta: canonical evidence remains in
`.ai/harness/checks/minimal-change.latest.json` and its existing
plan/delegation block suffixes and diagnostics remain, but it does not trigger
a second recovery projection rewrite. The handler preserves
the write-before-resolve ordering that keeps `durable_recovery_state`
satisfied on a fresh repo's first Stop. `stop-orchestrator.sh` is deleted from
both `assets/hooks/` and `.ai/hooks/` in the same package with the projection
manifest re-synced, and the HRD-01 golden's `Stop.default` cell plus the
LSC-06/07 loop-semantics characterization's three Stop cells are regenerated
once under the runtime-shape-plus-write-set delta policy (decision, reason,
and exit_code stay byte-identical for every fixture scenario already
captured).

## Scope

- In scope:
  - PRE-ENUMERATION GATE: already run this session (read-only `explorer`
    sweep, `FINDINGS: COMPLETE`, cited in
    `tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md` once the
    worker transcribes it) — every reference to `stop-orchestrator.sh` across
    `src/ scripts/ tests/ docs/ README* assets/ .ai/hooks/` classified live vs
    historical. The ~68-reference live surface is pre-enumerated into
    Allowed Paths below; anything live found outside it during
    implementation is a Stop Condition, not a silent edit.
  - New `src/cli/hook/stop-handler.ts`: the in-process handler. Consumes a
    NEW memoized `getStopEffectiveState()` getter added to
    `StateInputCollector`/`createStateInputCollector`
    (`src/effects/loop/state-input-collector.ts`) plus a
    `resolveStopEffectiveState` dependency wired in `runtime.ts` using
    `operationKind: "inspect"` — do NOT reuse `getSessionEffectiveState()`:
    verified this session that its concrete SessionStart wiring
    (`runtime.ts:116-178`'s `effectiveStateSessionSection`) returns a
    `SessionContextSection`-shaped rendering, not a full `EffectiveState`;
    `session-context.ts:201-206`'s own doc comment confirms the SessionStart
    collector interface intentionally excludes any Effective State getter.
  - **Precedence invariant (hard requirement, not an implementation detail)**:
    the handler evaluates readiness-block, then (if not blocked)
    plan-completeness-block, then (if not blocked) delegation-block, in that
    exact order, emitting AT MOST ONE `{decision:"block"}` per Stop and
    skipping every later gate once an earlier one fires — ported verbatim
    from `stop-orchestrator.sh:774-812`'s `stop_maybe_block_on_readiness &&
    exit 0` / plan-completeness `emit...; exit 0` / delegation
    `emit_stop_block_json` sequence. Under the `lite` profile, only the
    readiness gate runs before exit (script lines 774-777) — minimal-change,
    plan-completeness, and delegation checks do not run at all. The three
    block paths' reason strings are NOT interchangeable: the readiness block
    fires before the minimal-change review step (script line 782), so it
    never carries a `minimal_change_reason_suffix`; the plan-completeness and
    delegation blocks fire after that step and do carry it when non-empty —
    port this exact conditional suffix behavior per block path, not a
    uniform one.
  - **Write-before-resolve ordering invariant (hard requirement — the
    sharpest finding from this row's review)**: `refresh_handoff()` (writing
    the handoff+resume pair) runs unconditionally BEFORE `stop_resolve_state()`
    in the base script (lines 768 then 769). This ordering is load-bearing:
    `durable_recovery_state` is a `required` stop key in all three workflow
    profiles (`artifact-requirement-policy.ts:86,98,113`), satisfied only
    when neither handoff nor resume freshness is `missing`
    (`project-effective-state.ts:327`). The new handler MUST write (or
    otherwise ensure on-disk) the handoff+resume pair before its single Stop
    Effective State resolution runs, so a repo's first-ever Stop (no
    pre-existing handoff files) still resolves `allowedToStop: allow` exactly
    as the bash version does, not a false `[ReadinessGate]
    required_recovery_state_missing` block the bash version never emits.
  - **Batched-commit write-set definition**: the handler's single projection
    commit owns exactly four targets: `.ai/harness/handoff/current.md`,
    `.ai/harness/handoff/resume.md`, the configured workflow handoff-refresh
    event stream, and the configured run summary. Prove each target is
    written at most once per Stop via a write-count assertion. The former
    later minimal-change append to handoff/resume is deliberately retired;
    its canonical report, diagnostics, and plan/delegation reason suffixes
    remain. Per-file atomic replace (temp file + rename) stays the mechanism;
    do not invent an EPC-scoped cross-file checkpoint authority to make
    "batched" literal.
  - **Cross-boundary lock-protocol invariant**: `delegation_should_block` /
    `delegation_mark_fallback_used` write `.ai/harness/delegation/latest.json`
    under a lock (`${latest}.lock`) shared with TWO scripts that SURVIVE this
    cutover as bash: `subagent-start-context.sh` and
    `codex-delegation-advisor.sh` (not touched by this row). The ported
    writer must honor the identical lock protocol: `wx` (O_CREAT|O_EXCL)
    create, `{pid,token,acquired_at}` marker, in-lock `scope_id` re-check in
    BOTH the scoped and unscoped-collapsed branches
    (`stop-orchestrator.sh:531-593`), release-only-if-token-matches, ~2s
    bounded retry and no stale reclaim, and reproduce
    `delegationScope`/`firstString` derivation byte-for-byte (`turn_id` >
    `run_id` > `session_id` > `sha1(trim(transcript_path))` > env). The
    existing cross-writer compatibility test
    (`tests/cli/hook.test.ts:2491`, an external lock holder built from
    `subagent-start-context.sh` asserting the Stop writer skips its shared
    write) must keep passing, now proving the TS writer honors a bash-held
    lock.
  - **Race-test migration**: `tests/cli/hook.test.ts:2677-2777`'s TOCTOU race
    test currently splices a literal bash-source anchor string
    (`state.updated_at = state.fallback_used_at;`) to inject a pause; this
    technique has no target once the script is deleted. Replace it with an
    injectable dependency seam in the handler around the delegation
    fallback's read → acquire-lock → scope-revalidation → update sequence
    that a test can set a barrier on before lock acquisition. The seam must
    be a no-op observation point in production — it must not alter the
    actual read/lock/recheck/write order or weaken the bounded-retry/
    no-stale-reclaim semantics. The migrated test must keep racing against a
    REAL separate process (a spawned bash advisor, e.g.
    `subagent-start-context.sh` or an equivalent harness), not an in-process
    mock — the original test's entire point is proving cross-process
    concurrency safety, which an in-process double cannot prove.
  - Docstring fix: `src/core/workflow/operation-readiness.ts:19-20`'s module
    docstring still says "No consumer imports this module yet: LSC-07 (Stop)
    and LSC-08 (adapter parity) cut consumers over separately" — false today
    (`project-effective-state.ts:10,330` already imports and calls
    `evaluateReadiness`). Correct this comment only; no behavior change.
  - Journal flush: move the `consumePendingPostEditEvents()` call from
    `runtime.ts`'s separate pre-step into the new handler, still excluded
    from `scriptsRun`/telemetry per HRD-05's existing golden-stability
    reasoning (verify this exclusion still holds once the call site moves).
  - Route re-pin: `Stop.default` in `src/cli/hook/route-registry.ts` (lines
    140-144) moves from `scripts: ['stop-orchestrator.sh']` to `scripts: []`
    with an explanatory comment, matching the HRD-03/04/05 precedent shape.
  - Script retirement, same package: delete both
    `assets/hooks/stop-orchestrator.sh` and `.ai/hooks/stop-orchestrator.sh`
    (confirmed byte-identical, 812 lines), re-sync the projection manifest
    (`bun scripts/sync-hook-sources.ts --write`; digest/file_count 18→17,
    same mechanism as HRD-05).
  - Golden regeneration, ONCE, confined to Stop: the HRD-01 golden's
    `Stop.default` cell in `tests/fixtures/loop-runtime/characterization.json`
    (currently `scripts_run: ["stop-orchestrator.sh"]`,
    `child_invocations: {git:28, bun_cli:2, bun_generic:2}`) — runtime-shape
    fields and write_set may move, decision/reason/exit_code must not; AND
    the three Stop cells in
    `tests/state/fixtures/loop-semantics/characterization.json`
    (`lite.stop.handoff-only-allows`,
    `standard.stop.stale-review-warns-allows`,
    `strict.stop.not-ready-to-ship-still-allows`) whose `entrypoint` field
    and `ordering` source-string markers need the same kind of migration
    HRD-03's `mutation-guard`/`editProfileSource()` companion already
    established as precedent. No cell outside these four moves.
  - New tests required beyond the golden regen: `tests/stop-handler.test.ts`
    (new) must include at minimum (a) `allowedToStop: block` with
    plan-completeness also armed → only `[ReadinessGate]` emitted, no
    `[PlanCompletenessGate]`; (b) plan-completeness and delegation both
    armed → only `[PlanCompletenessGate]` emitted; (c) `lite` profile with
    delegation armed → no `[DelegationFallback]` at all; (d) exact reason
    string assertions proving the readiness block carries no minimal-change
    suffix while plan/delegation blocks do when non-empty; (e) a fresh-repo
    (no pre-existing handoff files) first Stop resolves `allowedToStop:
    allow`, not a `required_recovery_state_missing` block.
  - Test migration: every direct-dispatch/source-splice/source-string-marker
    test enumerated by this row's pre-enumeration sweep
    (`tests/cli/hook.test.ts`, `tests/hook-runtime.test.ts`,
    `tests/hook-contracts.test.ts`, `tests/cli/route-registry.test.ts`,
    `tests/state/adapter-parity.test.ts`,
    `tests/state/loop-semantics-characterization.test.ts`,
    `tests/readme-dx.test.ts`) migrates to dispatch the in-process handler
    instead of spawning bash, preserving each test's original assertion
    intent (not just making it pass against the new code).
  - Doc ripple, Stop-specific lines only: five README translations'
    `Stop.default` row (`README.md:34,572` +
    `README.{zh-CN,ja,fr,es}.md`), `docs/reference-configs/hook-operations.md`
    + `assets/` mirror, `docs/reference-configs/minimal-change-hooks.md` +
    `assets/` mirror, `docs/architecture/index.md`'s LSC-08 parity paragraph,
    and `docs/architecture/modules/runtime-harness/hook-adapters.md`'s
    Stop-specific prose paragraph + its one Mermaid edge
    (`Stop --> StopOrchestrator["stop-orchestrator.sh"]`) — update only the
    Stop-related lines in that last file; its other, already-stale
    pre-HRD-03/04/05 content is a pre-existing gap out of this row's scope
    (see Out of scope).
  - Taste constraints: every precedence/ordering/lock invariant above must
    cite the base-script line numbers it ports, condition by condition, in
    notes — same discipline as HRD-05's dirty-bit derivation table.
- Out of scope:
  - Delegation scoped-state transaction redesign. This row keeps the existing
    bounded-retry/no-reclaim latest-pointer lock semantics as-is, just ported;
    the distinct same-scope lost-update risk is owned by the explicit deferred
    goal in `tasks/todos.md`. HRD-07 covers only the circuit-breaker lock.
  - HRD-08 event telemetry/benchmark; HRD-09 adopted migration.
  - `scripts/repo-harness.sh`: its Stop-related comment header and JSON
    hook-adapter template are already stale for HRD-03/04/05's retired
    scripts too — `tasks/todos.md` already ledgers this file as flagged
    historical residue assigned to HRD-09's terminal sweep; do not touch it
    here. The current global `repo-harness-hook` version-drift warning is
    likewise not a compatibility shim to build — verification uses only the
    worktree's own `bun src/cli/index.ts`.
  - `docs/architecture/modules/runtime-harness/hook-adapters.md`'s broader
    pre-existing staleness beyond the Stop-specific paragraph/edge (still
    describes several already-retired HRD-03/04/05 scripts as live) — a
    pre-existing gap from prior rows, not this row's to fix; note it for
    HRD-09's sweep instead of drive-by cleaning it.
  - EPC's canonical checkpoint artifact / Evidence Ledger schema / checks
    materializer — do not build a cross-file atomic-transaction mechanism to
    satisfy "batched"; see the Batched-commit write-set definition above.
  - Any compatibility shim, dual dispatch, or fallback that keeps
    `stop-orchestrator.sh` reachable.

## Stop Conditions

- Stop and hand back if anything live sits outside the pre-enumerated
  Allowed Paths.
- Stop if the ported handler cannot preserve the exact readiness >
  plan-completeness > delegation short-circuit precedence, or emits more
  than one block JSON, or evaluates a later gate after an earlier one fired.
- Stop if the write-before-resolve ordering cannot be preserved without
  reintroducing a second Effective State resolution — report the conflict
  rather than silently picking one invariant over the other.
- Stop if the delegation lock port cannot preserve compatibility with the
  two surviving bash writers (`subagent-start-context.sh`,
  `codex-delegation-advisor.sh`) sharing the same lock file.
- Stop if the golden regeneration shifts any cell other than the four named
  Stop cells (one in the HRD-01 golden, three in the loop-semantics golden),
  or shifts any of those four cells' decision/reason/exit_code.
- Stop after three fail -> fix -> reverify rounds for the same issue.

## Falsifier

The single-handler port is falsified if any of: (a) a Stop where both the
plan-completeness and delegation gates are armed emits more than one block
message, or emits the wrong one — cheapest proof point: the
`tests/stop-handler.test.ts` two-gates-armed fixture named above; (b) a
fresh worktree's first-ever Stop (no prior `.ai/harness/handoff/*`) blocks
with `required_recovery_state_missing` — cheapest proof point: the
fresh-repo fixture named above, run BEFORE trusting any other Stop behavior
claim; (c) the migrated cross-writer lock test
(`tests/cli/hook.test.ts:2491`-equivalent) fails once the writer is
in-process, proving the lock protocol diverged from the two surviving bash
writers. If any of these reproduce, STOP and report — the ordering/
precedence design, not incidental code, needs the fix.

## Root Cause Evidence

Not applicable: `code-change` cutover package, not a bugfix.

- root_cause: (not applicable)
- repro: (not applicable)
- regression_guard: (not applicable)
- pre_fix_failure_artifact: (not applicable)

## Workflow Inventory

- Source audit: `plans/sprints/20260715-harness-loop-audit-and-optimization.md` (LOOP-05/LOOP-12)
- Source sprint: `plans/sprints/20260719-1531-hook-runtime-diet.sprint.md` (row 6)
- Frozen baselines: `tests/fixtures/loop-runtime/characterization.json` (Stop.default cell, one-shot authorized incl. write_set), `tests/state/fixtures/loop-semantics/characterization.json` (three Stop cells, one-shot authorized)
- Ported authority: `assets/hooks/stop-orchestrator.sh` (base SHA state, 812 lines)
- Precedents: HRD-03 mutation-guard, HRD-04 session-context, HRD-05 mutation-observed journal + single-round ripple discipline
- Independent design input: Codex P1-P3 proposal (architecture + four design decisions) plus an orchestrator-dispatched `deep-reasoner` (Opus) adversarial review that surfaced the five invariants folded into this Scope/Falsifier — both records to be preserved verbatim in notes' "Pre-Enumeration + Design Review" section.
- Active plan: `plans/plan-20260720-2256-hrd-06-stop-handler-slim.md`
- Review file: `tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md`
- Notes file: `tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md`
- Checks file: `.ai/harness/checks/latest.json` (ignored runtime evidence)
- Base/branch/WT: `e0e57acd1254932941635cfb9c36186ba6a654b3` /
  `codex/hrd-06-stop-handler-slim` /
  `/Users/kito/Projects/repo-harness-wt-hrd-06-stop-handler-slim`
- Scope gate: edit only paths listed under `allowed_paths`; update this
  contract before widening scope.
- Completion gate: `repo-harness run verify-sprint` must see this contract
  pass, the review recommend pass, and canonical `## External Acceptance
  Advice` record `pass` for the current review subject and benchmark evidence.
- CLI note: `bun src/cli/index.ts` / `bun test` only.

## Allowed Paths

```yaml
allowed_paths:
  - plans/plan-20260720-2256-hrd-06-stop-handler-slim.md
  - plans/sprints/20260719-1531-hook-runtime-diet.sprint.md
  - tasks/current.md
  - tasks/todos.md
  - tasks/contracts/20260720-2256-hrd-06-stop-handler-slim.contract.md
  - tasks/reviews/20260720-2256-hrd-06-stop-handler-slim.review.md
  - tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md
  - src/cli/hook/stop-handler.ts
  - src/cli/hook/runtime.ts
  - src/cli/hook/route-registry.ts
  - src/cli/hook/mutation-observed.ts
  - src/effects/loop/state-input-collector.ts
  - src/core/workflow/operation-readiness.ts
  - assets/hooks/stop-orchestrator.sh
  - .ai/hooks/stop-orchestrator.sh
  - assets/hooks/run-hook.sh
  - .ai/hooks/run-hook.sh
  - .ai/hooks/.projection.json
  - assets/hooks/projection.json
  - tests/stop-handler.test.ts
  - tests/state-input-collector.test.ts
  - tests/cli/hook.test.ts
  - tests/cli/route-registry.test.ts
  - tests/hook-contracts.test.ts
  - tests/hook-protocol.test.ts
  - tests/hook-runtime.test.ts
  - tests/hook-runtime-characterization.test.ts
  - tests/fixtures/loop-runtime/characterization.json
  - tests/state/adapter-parity.test.ts
  - tests/state/loop-semantics-characterization.test.ts
  - tests/state/fixtures/loop-semantics/characterization.json
  - tests/readme-dx.test.ts
  - README.md
  - README.zh-CN.md
  - README.ja.md
  - README.fr.md
  - README.es.md
  - docs/reference-configs/hook-operations.md
  - assets/reference-configs/hook-operations.md
  - docs/reference-configs/minimal-change-hooks.md
  - assets/reference-configs/minimal-change-hooks.md
  - docs/architecture/index.md
  - docs/architecture/modules/runtime-harness/hook-adapters.md
  # --- Amendment budget: this row's pre-enumeration sweep found ~68 live
  #     references; if the worker finds a live reference not covered above,
  #     hand back for one amendment round per HRD-04/05 discipline rather
  #     than editing outside this list. ---
```

## Evidence Requirements

```yaml
evidence_requirements:
  # Set benchmark to required when this contract consumes the harness profile benchmark matrix.
  benchmark: not_applicable
```

## Delegation Contract

```yaml
delegation:
  budget:
    tokens: null
    runner_invocations: null
    wall_time_minutes: null
  permission_scope:
    mode: inherit_allowed_paths
    writable_paths: []
    network: inherited
  roles:
    parent:
      mode: narrate_and_gatekeep
      purpose: approval_checkpoint_owner
    explorer:
      mode: read_only
      purpose: codebase_research
    worker:
      mode: edit_within_allowed_paths
      purpose: implementation
    verifier:
      mode: read_only
      purpose: exit_criteria_review
  runner:
    preferred:
      - subagent
      - codex-exec
      - main-thread
    fallback: main-thread
    brief_is_authoritative: true
```

## Exit Criteria (Machine Verifiable)

```yaml
exit_criteria:
  files_exist:
    - src/cli/hook/stop-handler.ts
    - tests/stop-handler.test.ts
  files_not_exist:
    - assets/hooks/stop-orchestrator.sh
    - .ai/hooks/stop-orchestrator.sh
  artifacts_exist:
    - .ai/harness/checks/latest.json
    - tasks/notes/20260720-2256-hrd-06-stop-handler-slim.notes.md
  tests_pass:
    - path: tests/stop-handler.test.ts
    - path: tests/state-input-collector.test.ts
    - path: tests/cli/hook.test.ts
    - path: tests/hook-runtime.test.ts
    - path: tests/hook-contracts.test.ts
    - path: tests/cli/route-registry.test.ts
    - path: tests/state/adapter-parity.test.ts
    - path: tests/state/loop-semantics-characterization.test.ts
    - path: tests/hook-runtime-characterization.test.ts
    - path: tests/readme-dx.test.ts
  commands_succeed:
    - bun run check:type
    - bun run check:hooks
    - bun run check:state-boundaries
    - bash scripts/check-architecture-sync.sh
    - bash scripts/check-task-sync.sh
    - bun src/cli/index.ts run check-task-workflow --strict
  qa_scores:
    - dimension: functionality
      min: 7
  manual_checks:
    - "Evaluator review file recommends pass"
    - "Precedence invariant proven: multi-gate-armed Stop emits exactly the correct single block message, later gates never evaluated once an earlier one fires"
    - "Write-before-resolve ordering proven: fresh-repo first Stop resolves allowedToStop=allow, not a required_recovery_state_missing block"
    - "Cross-boundary lock protocol proven: the migrated writer honors a lock held by a real spawned bash advisor (subagent-start-context.sh-equivalent), and the race test keeps a real separate process as the competing writer"
    - "The exact four-target projection write-set is committed once before resolution, with write-count proof and no minimal-change handoff/resume rewrite"
    - "Golden delta confined to the four named Stop cells (HRD-01 + three loop-semantics cells) with decision/reason/exit_code unchanged"
    - "Zero live references to stop-orchestrator.sh outside historical records"
```

## Acceptance Notes (Human Review)

- Functional behavior: qualifying Stop events run one in-process handler;
  gate precedence and write-before-resolve ordering match the bash baseline
  exactly; journal flush happens inside the handler; delegation lock stays
  interoperable with the two surviving bash writers.
- Edge cases: fresh repo first Stop (no prior handoff); multiple gates armed
  simultaneously; lite profile with an armed delegation/plan-completeness
  condition that must NOT fire; concurrent lock contention with a real bash
  writer.
- Regression risks: false-block on fresh repos if write/resolve ordering
  inverts (Falsifier b); wrong or duplicate block message if precedence
  isn't preserved (Falsifier a); lock incompatibility with surviving bash
  writers (Falsifier c); unbounded scope creep if a live reference is found
  outside the pre-enumerated Allowed Paths mid-implementation.

## Rollback Point

- Commit / checkpoint: branch fork point `e0e57acd1254932941635cfb9c36186ba6a654b3`
- Revert strategy: revert the single PR; script, route list, both goldens,
  and the journal-flush call-site move restore as one unit. Journal schema
  itself is unchanged by this row — no data migration needed on revert.
