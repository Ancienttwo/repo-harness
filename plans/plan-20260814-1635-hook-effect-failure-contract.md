# Plan: Hook Effect Failure Contract and Confluence Proof

> **Status**: Executing
> **Created**: 20260814-1635
> **Slug**: hook-effect-failure-contract
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: docs/researches/20260814-deepseek-harness-spatiotemporal-composability.md
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Per-phase fault injection proves baseline-versus-retry terminal-state equivalence for mutation-observed and Stop; focused hook tests, type checking, workflow gates, and the full repository suite must pass.
> **Rollback Surface**: Single revert of the hook effect-contract work package; no schema migration or external-state cleanup.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md`
> **Task Review**: `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md`
> **Implementation Notes**: `tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: docs/researches/20260814-deepseek-harness-spatiotemporal-composability.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260814-1635-hook-effect-failure-contract.md`
- Sprint contract: `tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md`
- Sprint review: `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md`
- Implementation notes: `tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260814-1635-hook-effect-failure-contract.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260814-1635-hook-effect-failure-contract.md`.

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
- Contract file: `tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md`
- Review file: `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md`
- Implementation notes file: `tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260814-1635-hook-effect-failure-contract.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revert of the hook effect-contract work package; no schema migration or external-state cleanup.
- **Verification boundary**: Per-phase fault injection proves baseline-versus-retry terminal-state equivalence for mutation-observed and Stop; focused hook tests, type checking, workflow gates, and the full repository suite must pass.
- **Review/acceptance boundary**: `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260814-1635-hook-effect-failure-contract.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260814-1635-hook-effect-failure-contract.contract.md`, `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md`, and `tasks/notes/20260814-1635-hook-effect-failure-contract.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260814-1635-hook-effect-failure-contract.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revert of the hook effect-contract work package; no schema migration or external-state cleanup.

## Captured Planning Output

# Hook Effect Failure Contract and Confluence Proof

## Goal

Make partial durable effects from typed hook handlers explicit when execution
fails after one or more writes have committed. Preserve the static
`(event, route_id) -> one typed handler` authority and the stable public
`RunHookResult` success/failure vocabulary. Do not introduce Cordis, dynamic
handler loading, a generic transaction framework, or guessed rollback.

The first proof surface is limited to the two handlers for which the runtime
already claims complete write telemetry:

- `mutation-observed`: zero-or-one post-edit journal transaction;
- `stop`: the bounded stop projection transaction and its ordered durable
  targets.

Success means a thrown handler can no longer collapse "nothing committed" and
"some durable effects committed" into the same unqualified internal failure,
and fault-injection tests prove that a fresh retry either reaches the same
terminal repository state as the no-fault baseline or returns an explicit
reconcile-required result.

## Planning Decisions

- [ASSUMED] The existing hook event telemetry protocol remains additive v1.
  A typed effect observation is present only for handlers with an explicit
  effect contract; absence means uninstrumented, never zero effects. This
  avoids a mixed-protocol migration for ignored runtime evidence while keeping
  consumers fail-closed.
- [ASSUMED] Exception-path observability is diagnostic, not recovery authority.
  The durable journal/projection artifacts remain the recovery source of truth;
  telemetry must never make a safety decision or pretend to roll back an
  external emission.
- [ASSUMED] Retry convergence is the preferred recovery policy for these two
  handlers. If the Stop fault matrix proves a non-idempotent phase, fix only
  that phase with a stable operation key or handler-local receipt; do not add a
  cross-handler transaction abstraction.
- [UNKNOWN] A process can still die after a durable filesystem commit but
  before the observer callback runs. The effect state must represent this as
  `unknown_partial`, and the restart/retry proof—not in-memory telemetry—must
  establish safety.

Common failure mode: recording only the observer callbacks that happened and
then treating the resulting count as a complete effect receipt. A missing
callback after a thrown write is uncertainty, not proof that the write did not
land.

## P1: Architecture Map

### System boundary

- Routing authority: `src/cli/hook/route-registry.ts` and
  `src/cli/hook/handler-registry.ts`.
- Handler contract: `src/cli/hook/handler-contract.ts`.
- Runtime execution and exception boundary: `src/cli/hook/runtime.ts`.
- Non-authoritative observation record: `src/cli/hook/event-telemetry.ts` and
  `src/core/loop/loop-event-protocol.ts`.
- Durable mutation authority: the post-edit journal written by
  `src/cli/hook/mutation-observed.ts`.
- Durable Stop authority: handoff, resume, event, and run-summary projections
  written by `src/cli/hook/stop-handler.ts`.
- Semantic architecture owner:
  `docs/architecture/modules/runtime-harness/hook-adapters.md`.
- Research input:
  `docs/researches/20260814-deepseek-harness-spatiotemporal-composability.md`.

The current hook registry has eight handler IDs. This work package does not
claim that all eight are effect-free or fully observed. Only handlers that
declare a contract may produce typed effect completeness. Existing handlers
without a contract remain explicitly outside that claim.

### Strong dependencies

- Handler effect declarations must agree with the observer calls made after
  durable commits.
- Runtime failure shaping must agree with event telemetry validation and its
  semantic fingerprint.
- Confluence tests must compare durable repository artifacts, not telemetry
  alone.

### Weak dependencies

- Diet/benchmark consumers may display the additive effect observation but
  must not use it as workflow authority.
- Architecture documentation projects the accepted contract; it does not
  define runtime behavior independently.

### Out of scope

- MCP session reaping, shutdown reporting, workspace binding, or authorization
  lease work.
- `RuntimeProviderLease` and the current global-runtime reconciliation WIP.
- Prompt/AgentSurface assembly or skill/tool scope inheritance.
- `subagent`, `prompt`, `command-observed`, `trace-observer`,
  `session-context`, or `mutation-guard` effect-semantic migrations.
- Cordis dependency, dynamic provider replacement, disposer APIs, hot unload,
  plugin registry changes, generic `EffectSink`, or generic transaction journal.
- Reversing Git, network, PR, release, or other external emissions.

## P2: Concrete Traces

### Trace A: mutation-observed

```text
PostToolUse/edit
  -> route registry selects mutation-observed
  -> runMutationObserved qualifies an in-repo path
  -> writeOrCoalesceJournalEvent commits zero or one journal transaction
  -> observeJournalWrite reports the committed target
  -> runtime finalizes telemetry and host output
```

Failure pressure point: the journal transaction may already be durable when an
observer or later handler step throws. Today `runtime.ts` returns generic
`handler-failed`; the handler contract does not state the planned effect,
committed effect, last known phase, or retry policy.

### Trace B: Stop projection

```text
Stop/default
  -> route registry selects stop
  -> stop handler materializes handoff/resume/event/run-summary content
  -> projection writer commits ordered durable targets
  -> per-target and transaction observers update runtime telemetry
  -> runtime finalizes telemetry and host output
```

Failure pressure point: a throw after target N leaves a prefix of the
projection durable. Retry rewrites deterministic projections, but the append
event must be proven idempotent or receive a handler-local stable operation key.
The fault matrix, not design intuition, decides whether that repair is needed.

### Error and restart semantics

- A normal handler error keeps the public result `handler-failed`.
- Internal telemetry records the declared contract, known committed targets,
  last observed phase, and one of `none_committed`, `unknown_partial`,
  `committed_partial`, or `committed_complete`.
- `unknown_partial` and `committed_partial` are blocked diagnostic states; they
  never authorize cleanup or rollback.
- A fresh retry is the recovery operation. Its durable terminal state must
  equal the no-fault baseline after normalizing timestamps and other explicitly
  non-semantic evidence fields.
- Production adds no active retry driver: a fresh retry means the next
  host-delivered event on the same route—the next `PostToolUse/edit` for
  mutation-observed or the next `Stop/default` for Stop—and tests model that
  host behavior with a new handler invocation.
- If retry cannot converge, the handler returns or records
  `reconcile_required`; implementation stops at the handler boundary and does
  not synthesize output.

## P3: Design Decision

### Contract shape

Add a narrow optional effect contract to `TypedHookHandler`. Optional means
"no completeness claim", not "no effects". The contract declares only the
bounded properties needed by the runtime:

```ts
interface HookEffectContract {
  readonly contractId: string;
  readonly boundary: 'durable-emission';
  readonly cardinality: 'zero-or-one' | 'bounded-sequence';
  readonly recovery: 'retry-converges' | 'reconcile-required';
  readonly completeMetrics: readonly HookEventTelemetryMetric[];
}
```

The runtime owns an invocation-local tracker populated by existing post-commit
observers. The tracker is included in additive event telemetry and semantic
fingerprinting. Metric completeness is derived from the effect contract and
successful completion; remove the current handler-ID conditionals from
`runtime.ts`. A thrown handler never receives complete write metrics merely
because the known counter is zero.

Do not expose effect details through the public host protocol in this slice.
The public hook result remains stable; the typed observation belongs to ignored
runtime evidence and tests.

### Fault-injection rule

Use injected observer/test seams, not production environment flags. Inject a
throw immediately after each named durable phase, start a fresh invocation,
and compare terminal artifacts with a no-fault baseline.

The fault matrix must include:

1. mutation-observed after journal commit;
2. Stop after handoff commit;
3. Stop after resume commit;
4. Stop after event append;
5. Stop after run-summary commit;
6. failure before the first observed commit;
7. successful no-op mutation-observed path.

If Stop's append phase duplicates a semantic event after retry, introduce the
smallest Stop-local idempotency mechanism keyed by the existing stable run/
operation identity. Do not create a general journal unless a separate plan
proves at least one additional independently meaningful consumer.

### Invariants

- One route maps to exactly one static typed handler.
- Telemetry remains non-authoritative and cannot change hook safety.
- Durable filesystem facts outrank in-memory effect observations.
- Missing effect observations fail closed as unknown, never zero/pass.
- Public hook output and exit vocabulary remain unchanged.
- No rollback is attempted for an effect whose inverse is not already an
  authoritative handler-local operation.
- Existing metric-completeness claims for mutation-observed and Stop remain
  true on success and become explicitly incomplete on partial failure.

### 10x behavior

At higher event volume, synchronous append contention remains the first
runtime pressure point. This slice adds bounded in-memory tracking and a small
additive telemetry object per invocation; it must not add another filesystem
write on the success path. Any Stop-local idempotency read/write introduced by
the fault proof must be bounded by stable operation identity and garbage-
collectable through the existing run/evidence lifecycle.

## File Surface

| File | Action | Responsibility |
|---|---|---|
| `src/cli/hook/handler-contract.ts` | Edit | Define the narrow effect contract and observation types. |
| `src/cli/hook/handler-registry.ts` | Edit | Declare contracts only for mutation-observed and Stop. |
| `src/cli/hook/runtime.ts` | Edit | Track committed phases, shape partial failure, and derive completeness without handler-ID conditionals. |
| `src/cli/hook/event-telemetry.ts` | Edit | Add and validate the additive typed effect observation and include it in the fingerprint. |
| `src/core/loop/loop-event-protocol.ts` | Edit | Own the shared telemetry type extension. |
| `src/cli/hook/mutation-observed.ts` | Edit if required | Expose the post-commit observation seam without changing journal semantics. |
| `src/cli/hook/stop-handler.ts` | Edit if required | Expose named post-commit phases; add only a Stop-local idempotency fix if the fault matrix proves it necessary. |
| `tests/hook-runtime.test.ts` | Edit | Freeze runtime failure shaping, completeness, and public result stability. |
| `tests/mutation-observed.test.ts` | Edit | Prove commit-then-throw retry convergence and no-op behavior. |
| `tests/stop-handler.test.ts` | Edit | Run the per-phase fault matrix and compare durable terminal state. |
| `tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts` | Edit | Freeze additive telemetry validation/fingerprint behavior. |
| `docs/architecture/modules/runtime-harness/hook-adapters.md` | Edit | Record effect boundary, failure state, recovery, and proof obligations. |
| `docs/architecture/.projection-manifest.json` | Generated | Refresh only through the configured architecture projection command. |

Any newly discovered implementation file is forbidden until the plan is
revised and the contract `allowed_paths` is updated. Runtime cache under
`.ai/harness/runs/` is verification evidence, not a commit surface.

## Task Breakdown

- [x] Freeze the two-handler effect contract and additive telemetry schema with
      red tests; prove absent observation means uninstrumented, not zero effects.
- [x] Replace runtime handler-ID completeness conditionals with contract-driven
      tracking while preserving public hook result behavior.
- [x] Add mutation-observed commit-then-throw retry-convergence coverage.
- [x] Add Stop per-phase fault injection and baseline-versus-retry terminal-state
      comparison; apply only the bounded Stop-local idempotency repair proven
      necessary by the red test.
- [ ] Update the hook-adapters architecture acceptance clauses and regenerate
      its projection manifest through the canonical projection route.
- [x] Run focused tests, type checking, architecture/task gates, and the full
      repository suite; record unrelated pre-existing global-runtime failures
      separately rather than weakening this contract.

## Acceptance Criteria

1. `TypedHookHandler` can declare a bounded durable-effect contract without
   changing the static route registry or public host protocol.
2. Mutation-observed and Stop success events carry validated effect observation
   data and retain their existing complete metric claims.
3. A thrown targeted handler produces incomplete/partial effect state; it never
   reports false zero/pass completeness.
4. Every named fault phase is covered. Fresh retry either reaches the normalized
   no-fault terminal state or fails closed with explicit reconcile-required
   evidence.
5. Stop event append does not produce duplicate semantic events after a tested
   commit-then-fail retry.
6. No new production fault flag, generic transaction abstraction, disposer,
   dynamic provider, compatibility parser, or fallback path exists.
7. Architecture documentation states the boundary and tests as future adapter
   acceptance obligations.
8. The current unrelated WIP is neither modified nor absorbed into this plan's
   commit.

## Verification

Focused red-green and contract checks:

```bash
bun test tests/hook-runtime.test.ts tests/mutation-observed.test.ts tests/stop-handler.test.ts tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts
bun run check:type
bash scripts/check-architecture-sync.sh
bash scripts/check-task-sync.sh
repo-harness run check-task-workflow --strict
```

Repository acceptance:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
bun scripts/inspect-project-state.ts --repo . --format text
bun src/cli/index.ts init --repo . --dry-run
```

If the full suite still reports the previously observed ArchContext/global-
runtime fixture failures, do not call the work package green. Verify whether
the owning WIP has landed, then rerun from the isolated contract worktree.

## Execution Isolation

The current primary checkout contains unrelated research, architecture,
global-runtime, planning-skill, and test WIP, including overlapping edits to
`hook-adapters.md` and the architecture projection manifest. This plan must not
be activated or executed in the current dirty checkout.

After the owning WIP is committed or otherwise given a stable base:

1. recapture/review this Draft against that base if line-level assumptions
   changed;
2. mark the plan Approved;
3. run `repo-harness run plan-to-todo --plan <this-plan>` so the configured
   contract-worktree flow owns implementation;
4. set `allowed_paths` to exactly the File Surface above;
5. merge only after focused/full checks and a Waza `/check`-style review pass.

## Rollback and Stop Conditions

- Rollback is a single revert of the hook effect-contract work package. The
  additive telemetry field has no migration authority and runtime evidence may
  be regenerated.
- Stop if fault injection exposes a required repair outside mutation-observed or
  Stop, if retry identity is not stable, or if an effect cannot be classified
  without changing another handler's product semantics. Revise the plan rather
  than adding a fallback or expanding allowed paths.
- Stop if the isolated worktree cannot distinguish this slice from the current
  global-runtime/architecture WIP.

## Next Action

`repo-harness-check`: review this Draft against the stable post-WIP base. Do not
run `plan-to-todo` until implementation is explicitly approved.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
