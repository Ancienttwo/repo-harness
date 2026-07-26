# Plan: Make SessionStart Effective State authority in-process and observable

> **Status**: Archived
> **Created**: 20260725-2254
> **Slug**: session-state-authority-inprocess
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: byte-stable healthy SessionStart output/evidence, deterministic resolver-failure coverage, and proof that the route-runtime child metric keeps its existing meaning
> **Rollback Surface**: revert the bounded source/test package and its failure-only optional evidence field; no migration, protocol bump, or external side effect
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md`
> **Task Review**: `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md`
> **Implementation Notes**: `tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md`

## Agentic Routing
- Selected route: hunt
- Routing reason: Defect-driven bounded package with confirmed root-cause evidence, not open design space.
- Source ref: `docs/researches/20260725-context-kernal.research.md` (review pass; its own prescription is not adopted)
- Due diligence:
  - P1 map: Hook runtime `src/cli/hook/` typed handlers and handler contract; state authority `src/effects/state/resolve-effective-state.ts`; SessionStart assembly `session-context.ts` -> `session-context-budget.ts`; telemetry `event-telemetry.ts`. Full map in the captured output below.
  - P2 trace: SessionStart -> `runHook` (`runtime.ts:306`) -> `effectiveStateSessionSection` (`runtime.ts:179`) -> `spawnSync` self-CLI (`runtime.ts:185`) -> JSON round-trip -> mandatory `SessionContextSection` -> budgeter. Pressure point: two silent `null` exits at `runtime.ts:184` and `runtime.ts:241-243` discard a mandatory section, 24 lines above a sibling resolver that already handles the same failure class correctly.
  - P3 decision rationale: The subprocess predates HRD-04 (`4d24a01b`) and has since been acting as an unintended fault boundary for the two documented transient throw signatures (`runtime.ts:247-266`). Preserve both invariants — SessionStart never becomes `handler-failed`, and a resolution failure never masquerades as a legitimate non-actionable `null` — by extracting the existing file-local bounded-retry mechanism for its two real consumers. This is not a new protocol or cross-module authority. Full rationale in the captured output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260725-2254-session-state-authority-inprocess.md`
- Sprint contract: `tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md`
- Sprint review: `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md`
- Implementation notes: `tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260725-2254-session-state-authority-inprocess.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260725-2254-session-state-authority-inprocess.md`.

## Approach
### Strategy
Finish the HRD-04 in-process consolidation for the one section it missed, and convert every silent
failure on that path into evidence. The package is content-neutral by construction: it changes how
the authoritative state section is obtained and how failures are reported, never what guidance the
model receives on a healthy resolve. The behaviour-parity fixture it needs for its own verification
doubles as the measurement baseline for the deferred root-context diet, so that later package can
attribute its token delta to itself rather than to this one.

### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Keep `spawnSync`, only add a diagnostic | Smallest diff; the accidental fault boundary stays intact | Two authorities for the same state in one file persist; subprocess latency, double serialization, and env/cwd drift risk all remain; `existsSync -> null` still fails open for any non-`src/` distribution | Reject |
| Direct `resolveEffectiveState` call with an independent local `try/catch` loop | Removes the subprocess | Re-implements the transient-instability partition that `runtime.ts:262-292` already owns; a third copy of the same retry semantics is exactly the duplication this package exists to remove | Reject |
| Extract the existing loop into one file-local `resolveEffectiveStateWithTransientRetry(resolveAttempt)` helper; preserve PreEdit's adapter semantics and add a SessionStart adapter plus pure projector | One retry mechanism for two real consumers; the projector owns no fields so no second state type appears; each caller still decides how residual/non-transient failure maps to its own safety contract | Small internal refactor of the PreEdit path is required even though its observable behavior must remain byte-for-byte unchanged | **Use** |
| Delete the `child_processes` metric | Removes a reading that is structurally 0 after HRD-09 | The field is schema-validated and is a frozen HRD-08 benchmark axis | Reject |
| Wire `recordDirectChildProcess()` around `mutation-observed.ts` / `prompt-handler.ts` Git/Bun/helper invocations | Counts every internal helper process | Violates the frozen metric definition: `docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.md:14` says this field counts direct **route-runtime children**, not internal Git/Bun plumbing; Stop may execute several helpers and would destroy comparability with the `at_most 1` target | Reject |
| Retain `child_processes` unchanged and separately prove the SessionStart self-CLI authority call is gone | Keeps the protocol and HRD-08/09 benchmark semantics; a focused source/fixture assertion proves the actual defect is removed without redefining the metric | Requires two evidence statements instead of overloading one metric | **Use** |
| Land the root-context diet in the same PR | One review pass | The diet's token delta becomes unattributable, because this package also changes SessionStart output shape | Reject; diet is a separate package gated on this fixture |

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|
| `src/cli/hook/runtime.ts` | Modify | Extract the existing retry loop for PreEdit + SessionStart, split state resolution from projection, add the bounded unavailable projection, pass the diagnostic sink to the budgeter, and delete the `PACKAGE_ROOT`/`fileURLToPath` CLI probe, `spawnSync`, and anonymous JSON round trip |
| `src/cli/hook/handler-contract.ts` | Modify | Add one optional SessionStart diagnostic observer to the existing handler dependency bag; do not add a second result/envelope protocol |
| `src/cli/hook/handler-registry.ts` | Modify | Pass the SessionStart diagnostic observer into the existing section builder |
| `src/cli/hook/session-context.ts` | Modify | `safely()` (`:1304`) gains a stable provider id and diagnostic sink; update the eight call sites at `:1332-1339` |
| `src/cli/hook/session-context-budget.ts` | Modify | Own the bounded diagnostic shape/normalizer and add a failure-only optional `provider_diagnostics` field to protocol 1 evidence; healthy evidence serialization remains unchanged |
| `tests/fixtures/session-start/state-authority-baseline.json` | Add | Pre-change deterministic healthy fixture: exact additional context, section ids, bytes/tokens, included/dropped, evidence, explicit-root identity, and route-runtime child metric |
| `tests/session-state-authority.test.ts` | Add | Actionable/non-actionable/blocked resolution, transient retry matrix, residual/non-transient failure, host-success fail-closed projection, and no self-CLI authority call |
| `tests/session-context.test.ts` | Modify | Eight provider ids, advisory throw omission, and diagnostic emission/order |
| `tests/harness-context-budget.test.ts` | Modify | Optional diagnostic persistence, zero-section diagnostic persistence, and healthy protocol-1 evidence byte parity |
| `tests/hook-runtime-characterization.test.ts` | Modify | Keep the post-HRD-09 `child_processes: 0` route-runtime assertion and document why internal helper processes are excluded |

### Code Snippets
```ts
function resolveSessionEffectiveState(
  repoRoot: string,
  nowMs: number,
  resolve: EffectiveStateResolver = resolveEffectiveState,
): SessionStateResolution {
  // CLI-equivalent resolve (no operation override) through the shared
  // file-local retry helper.
  // `nowMs` and `resolve` make the logical snapshot deterministic in tests.
  // Do not consume hook profile env: the retired CLI command did not pass a
  // --profile override.
  // Never re-throws into SessionStart.
}

function projectEffectiveStateSessionSection(
  state: EffectiveState,
): SessionContextSection | null {
  // pure: the existing runtime.ts:210-240 actionable test and compact projection,
  // reading typed EffectiveState fields instead of a re-parsed anonymous shape.
  // `null` retains exactly one legitimate meaning here: not actionable.
}
```

The projector owns no fields. It stays a projection of `EffectiveStateV1`, which is why this package
introduces no envelope type and no second authority.

### Resolution outcomes and exact failure contract

`resolveSessionEffectiveState` returns one discriminated outcome; callers must exhaustively handle
all three values:

- `resolved_actionable`: carries `EffectiveState`; the pure projector emits the existing
  `[HarnessState]` section byte-for-byte.
- `resolved_non_actionable`: resolution succeeded but the existing actionable predicate is false;
  this is the **only** legitimate state-path omission and emits neither section nor diagnostic.
- `unavailable`: resolution threw. `state_resolution_unstable` is used only after all three
  transient attempts; `state_resolution_failed` is used for a non-transient throw and does not
  retry.

The unavailable outcome creates one bounded diagnostic object and projects it twice: once to local
budget evidence, once to the model-facing mandatory section. It must not synthesize task, phase,
scope, blockers, or permissions:

```text
id=effective-state
priority=2
mandatory=true
actionable=true
reference="repo-harness state resolve --json"
content=[HarnessStateUnavailable] {
  "fail_closed":true,
  "reason_code":"state_resolution_unstable|state_resolution_failed",
  "error_hash":"sha256:...",
  "guidance":"Do not infer task, scope, or edit permission.",
  "required_action":"repo-harness state resolve --json"
}
```

The failure prefix is deliberately **not** `[HarnessState]`: an unavailable authority must not
masquerade as a synthetic `EffectiveState`. If mandatory content ever overflows, the existing
unstructured-mandatory branch converts it to `[HarnessContextOverflow]` with the same required
action. The hook result remains success (`exitCode: 0`, reason `ok`) with structured SessionStart
context; the authority failure is fail-closed data, not a generic `handler-failed`.

### Retry ownership

Move the loop currently embedded in `resolvePreEditEffectiveState` into one file-local helper that
accepts a `resolveAttempt` closure. Non-transient errors are re-thrown immediately; the last
transient error is re-thrown after three attempts. The adapters retain ownership of policy:

- PreEdit keeps today's exact partition: non-transient -> `null`; residual transient -> re-throw so
  mutation guard renders its existing distinct block.
- SessionStart maps either throw class to the unavailable outcome above.
- Stop remains unchanged and out of scope.

This extraction has two observed consumers and removes duplicated retry authority; it is not a new
cross-module abstraction. SessionStart captures one `nowMs` for the logical snapshot and reuses it
across retries. PreEdit keeps its existing clock behavior so this package cannot alter edit-gate
semantics.

Unit cases inject the resolver argument directly. The full `runHook` failure case uses Bun's existing
`mock.module` pattern in an isolated test process; do not add a test-only dependency to
`RunHookOptions`.

### Diagnostic carrier

The budget module owns one bounded structural type:

```ts
interface SessionContextProviderDiagnostic {
  readonly provider_id:
    | 'effective-state'
    | 'resume'
    | 'capability-context-pending'
    | 'architecture-queue-pending'
    | 'pending-plan-capture'
    | 'current-status-snapshot'
    | 'active-sprint'
    | 'tooling-update-advisory'
    | 'codex-delegation-auto';
  readonly reason_code:
    | 'state_resolution_unstable'
    | 'state_resolution_failed'
    | 'provider_threw';
  readonly error_hash: `sha256:${string}`;
  readonly required_action?: string;
}
```

Raw exception messages, stacks, absolute paths, and provider output never enter context or persisted
evidence. `error_hash` is derived from the error name/message only and validated as
`^sha256:[0-9a-f]{64}$`. `runHook` owns one per-event
sink; the state resolver and the eight advisory providers write to that sink, the handler dependency
bag passes it across the existing boundary, and `hostOutput` supplies it to
`budgetSessionContext`.

Provider ids are frozen in current composition order:
`resume`, `capability-context-pending`, `architecture-queue-pending`,
`pending-plan-capture`, `current-status-snapshot`, `active-sprint`,
`tooling-update-advisory`, `codex-delegation-auto`. Normalize to at most one entry per provider
(`effective-state` first, then composition order), so one event persists at most nine diagnostics.

`provider_diagnostics` is optional and emitted only when non-empty. It does not participate in the
context `content_hash` or dedupe decision: it is evidence about production of the context, not model
content. `hostOutput` must still invoke the budgeter when `sections.length === 0` but diagnostics
exist, so an all-provider failure cannot disappear before evidence is written. With no failures the
field is absent, preserving the exact protocol-1 evidence bytes captured by the fixture.

### Data Flow
Before:

```
SessionStart -> runHook -> effectiveStateSessionSection
  -> spawnSync(src/cli/index.ts state resolve --json)
  -> child resolves EffectiveState -> stdout JSON -> JSON.parse -> compact
  -> SessionContextSection{ mandatory: true } -> budgetSessionContext()

failure: child throws -> empty stdout -> return null -> mandatory section silently absent
```

After:

```
SessionStart -> runHook -> resolveSessionEffectiveState (in-process, bounded retry)
  -> success              -> projectEffectiveStateSessionSection(state)
  -> successful/no action -> no section, no diagnostic
  -> residual instability -> HarnessStateUnavailable (mandatory/actionable) + diagnostic
  -> any other throw      -> HarnessStateUnavailable (mandatory/actionable) + diagnostic
  -> budgetSessionContext()
```

No failure path returns a bare `null`. A missing section means only that typed resolution succeeded
and the existing actionable predicate returned false.

### Verification matrix

| Fixture | Attempts | Required result |
|---|---:|---|
| actionable resolved state | 1 | Exact pre-change `[HarnessState]`, section order, context bytes, evidence bytes, root identity, and included/dropped lists |
| non-actionable resolved state | 1 | No effective-state section and no provider diagnostic |
| blocked but successfully resolved state | 1 | Normal `[HarnessState]` with blockers; never misclassified as unavailable |
| stability signature then success | 2 | Normal state projection, no diagnostic |
| lock-timeout signature then success | 2 | Normal state projection, no diagnostic |
| either transient signature three times | 3 | `HarnessStateUnavailable`, `state_resolution_unstable`, one bounded diagnostic, host result `ok` |
| non-transient throw | 1 | `HarnessStateUnavailable`, `state_resolution_failed`, one bounded diagnostic, host result `ok` |
| one advisory provider throws | n/a | That advisory block is omitted, ordered diagnostic is persisted, unrelated sections survive |
| healthy providers | n/a | `provider_diagnostics` absent and persisted protocol-1 evidence byte-identical |

Root parity has two assertions: the resolver unit runs while process `cwd` is repo A but receives
repo B and must return repo B's distinguishable task id; the `runHook` integration runs from a nested
directory inside repo B with `HOOK_REPO_ROOT=repo B`, satisfying the runtime's intentional
cross-repository mismatch guard.

### `child_processes` semantic adjudication

Keep the metric and do not add observers around internal Git/Bun/helper calls. HRD-08 froze its
meaning as direct route-runtime dispatch children; HRD-09 retired that layer and its characterization
correctly expects zero. The SessionStart self-CLI defect is proven separately by removing
`spawnSync`/`PACKAGE_ROOT` from `runtime.ts`, exercising the injected in-process resolver, and
retaining `child_processes: 0` in the route characterization. This avoids silently changing a
benchmark definition inside an unrelated correctness fix.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Direct resolver call surfaces stability throws the subprocess used to swallow | High | SessionStart could become a generic handler failure | Shared bounded retry plus deterministic injected resolver; assert host result remains `ok` for both transient exhaustion and non-transient throw |
| `HOOK_REPO_ROOT` was passed to the child (`runtime.ts:189`); in-process resolution may resolve a different root | Medium | A wrong repo root silently changes resolved state | Resolver unit distinguishes process cwd repo A from argument repo B; runHook separately preserves its cross-repo mismatch guard |
| The fail-closed state-unavailable section consumes mandatory budget and displaces other sections | Medium | Context content drift under contention | Fixture asserts an unchanged section set on the healthy path; assert the unavailable path only under injected instability |
| Additive diagnostics accidentally alter healthy evidence or dedupe | Medium | The claimed content-neutral boundary becomes false | Field is failure-only and excluded from `content_hash`; fixture compares serialized healthy evidence, not only selected fields |
| Internal helper spawns are counted as route-runtime children | Medium | HRD-08/09 benchmark becomes incomparable and Stop can exceed its target | Do not wire them; retain the documented direct-route-runtime definition and focused characterization |
| Raw resolver/provider exceptions leak local paths | Low | Runtime evidence exposes machine-local details | Persist only stable reason code + hash; test rejects raw message, stack, and repo root |
| Scope creep into the root-context diet | Medium | The diet's token delta becomes unattributable | Diet is a separate package by construction; this package asserts content neutrality |

## Contract projection requirements

`plan-to-todo` must keep `allowed_paths` to the five source files and four focused test surfaces in
the File Changes table, the baseline fixture, and generated contract/review/notes artifacts. In
particular, it must not authorize `event-telemetry.ts`, `mutation-observed.ts`, `prompt-handler.ts`,
root agent files, `context-map.json`, `tasks/current.md`, or `tasks/todos.md`. Any discovered need to
cross that boundary returns the plan to Draft rather than being treated as an implementation extra.

## Task Contracts
- Contract file: `tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md`
- Review file: `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md`
- Implementation notes file: `tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260725-2254-session-state-authority-inprocess.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert the bounded source/test package and failure-only optional evidence field; no migration, protocol bump, or external side effect
- **Verification boundary**: byte-stable healthy SessionStart output/evidence, deterministic resolver-failure coverage, and preserved route-runtime child metric semantics
- **Review/acceptance boundary**: `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: `src/cli/hook/runtime.ts` SessionStart state path and the diagnostic handoff through `handler-contract.ts` -> `session-context-budget.ts`. The state path supplies the only mandatory context section carrying task, phase, allowed paths, and blockers; a regression here degrades every downstream gate's input. Risk owner: the review must assert healthy-path context/evidence byte parity, failure-path `ok` + mandatory unavailable output, no raw-error leakage, and unchanged HRD-08/09 metric meaning.
- **Why not checklist row**: verification_boundary — the fixture parity proof plus focused hook-runtime regression is an independent verification unit, and it must be captured before the deferred root-context diet changes SessionStart content.

## Evidence Contract

- **State/progress path**: `plans/plan-20260725-2254-session-state-authority-inprocess.md` task breakdown, `tasks/contracts/20260725-2254-session-state-authority-inprocess.contract.md`, `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md`, and `tasks/notes/20260725-2254-session-state-authority-inprocess.notes.md`. Deferred notes below are not projected to `tasks/todos.md` unless separately promoted and approved.
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, plus `bun test`; `bun test tests/session-state-authority.test.ts tests/session-context.test.ts tests/harness-context-budget.test.ts tests/hook-runtime-characterization.test.ts tests/unit/hrd-08-event-telemetry-and-benchmark.test.ts tests/hook-dispatch-diet-report.test.ts`; `bun run check:type`; the pre/post fixture comparison; `bash scripts/check-deploy-sql-order.sh`; `bash scripts/check-architecture-sync.sh`; `bash scripts/check-task-sync.sh`; `repo-harness run check-task-workflow --strict`; `bun scripts/inspect-project-state.ts --repo . --format text`; `bun src/cli/index.ts adopt --repo . --dry-run`
- **Evaluator rubric**: `tasks/reviews/20260725-2254-session-state-authority-inprocess.review.md` must record a passing Waza /check style recommendation against seven conditions — no `spawnSync`, `PACKAGE_ROOT`, or self-CLI JSON round trip remains in the SessionStart state path; the healthy context and protocol-1 evidence are byte-identical; a successful non-actionable resolve is the only no-section state outcome; every resolver/provider throw leaves bounded evidence; resolver failure returns structured mandatory context with hook result `ok`; raw errors/paths do not leak; `child_processes` retains the documented route-runtime-child meaning and remains zero for the typed characterization
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert the bounded source/test package and failure-only optional evidence field; no migration, protocol bump, or external side effect

## Captured Planning Output

## Goal

Remove the last out-of-process Effective State resolution in the hook runtime, and stop the
SessionStart context pipeline from dropping sections without evidence.

Content-neutral by intent: this package changes how the authoritative state section is obtained
and how provider failures are reported. It does not change what guidance the model receives on a
healthy resolve.
The behaviour-parity fixture built here becomes the measurement baseline for the deferred
root-context diet, so that package can attribute its token delta to itself.

## Scope

- Replace `effectiveStateSessionSection`'s `spawnSync` self-CLI call with an in-process resolve
  that reuses the existing transient-instability partition.
- Split that function into a resolver and a pure projector.
- Give `safely()` a provider id and a diagnostic sink; carry diagnostics in the existing budget
  evidence shape.
- Preserve the frozen route-runtime meaning of `child_processes`; do not count internal helper
  plumbing, and prove the SessionStart self-CLI removal separately.
- Add the SessionStart output fixture this package needs to prove parity.

Out of scope, each deferred with its own gate below: root context file diet, `tasks/current.md`
demotion, delegation writer ownership, splitting the eight string providers into typed sections.

## Root Cause Evidence

- `src/cli/hook/runtime.ts:11` already imports `resolveEffectiveState`, and `runtime.ts:277,297`
  call it directly for the PreEdit and Stop paths. Only `runtime.ts:185` still goes out-of-process
  for the same authority, inside the same file.
- Origin: introduced by `640b0918`. HRD-04 (`4d24a01b`, "consolidate SessionStart into the
  in-process session-context builder") consolidated the rest of SessionStart and left this section
  behind. The subprocess is migration residue, not a deliberate isolation boundary.
- `runtime.ts:184` (`if (!fs.existsSync(cli)) return null`) and `runtime.ts:241-243`
  (`catch { return null }`) drop a section declared `mandatory: true` (`runtime.ts:237`) with zero
  diagnostic, bypassing the budgeter's `mandatory-overflow` / `required_action` machinery
  (`session-context-budget.ts:29,37,40,166-243`).
- Eight advisory provider calls in `session-context.ts:1332-1339` pass through `safely()`
  (`session-context.ts:1304`), which converts any throw to `null`; a failed provider is therefore
  indistinguishable from a provider that legitimately had nothing to say.
- Checked and discarded: zero `recordDirectChildProcess()` call sites are **not** proof that
  surviving internal helper processes should be counted. The metric's frozen HRD-08 definition
  (`docs/researches/20260721-hrd08-hook-runtime-baseline-vs-target.md:14`) is direct route-runtime
  children, explicitly excluding internal Git/Bun plumbing. HRD-09 retired the route subprocess and
  now asserts zero. Keep the field and its meaning; prove removal of this self-CLI call separately.

## Due Diligence

### P1 map

- Hook runtime: `src/cli/hook/` typed handlers, selected by `route-registry.ts` /
  `handler-registry.ts` behind the user-level `repo-harness-hook` binary.
- State authority: `src/effects/state/resolve-effective-state.ts` (`EffectiveStateV1`), the single
  owner of task/phase/scope truth.
- SessionStart assembly: `session-context.ts` (eight Markdown providers, 1405 lines) feeding
  `session-context-budget.ts` (`SESSION_CONTEXT_TOKEN_BUDGET = 1_500`).
- Handler boundary: `handler-contract.ts` / `handler-registry.ts`, which carry the existing
  dependency bag from `runHook` to the SessionStart builder.
- Telemetry: `event-telemetry.ts`; its metric set is schema-validated and the direct-route-child
  meaning is frozen by the HRD-08 report and HRD-09 characterization.
- Authoritative for this package: `runtime.ts`, `handler-contract.ts`, `handler-registry.ts`,
  `session-context.ts`, `session-context-budget.ts`.
- Explicitly out of scope: `event-telemetry.ts`, internal spawn sites in `mutation-observed.ts` /
  `prompt-handler.ts`, `subagent-handler.ts`, `mutation-guard.ts`, `circuit-breaker.ts`,
  `CLAUDE.md`/`AGENTS.md`, `scripts/context-contract-sync.sh`, `.ai/context/context-map.json`.

### P2 trace

SessionStart host event -> `repo-harness-hook` -> `route-registry` -> `runHook` (`runtime.ts:306`)
-> `effectiveStateSessionSection` (`runtime.ts:179`) -> `spawnSync(process.execPath, [src/cli/index.ts,
state, resolve, --json])` (`runtime.ts:185`) -> child process resolves `EffectiveState` -> JSON on
stdout -> parent `JSON.parse` (`runtime.ts:193`) -> re-typed as a 14-field anonymous shape ->
`compact` projection (`runtime.ts:214-232`) -> `SessionContextSection{ id: 'effective-state',
priority: 2, mandatory: true }` -> `budgetSessionContext()`.

Pressure point: two silent exits on that path (`runtime.ts:184`, `runtime.ts:241-243`) discard a
mandatory section, while the sibling PreEdit resolver 24 lines below (`runtime.ts:268-292`) already
implements the correct treatment for the same failure class.

### P3 decision rationale

Why the current shape exists: the subprocess predates the in-process consolidation, and it has
since been doing unintended work as a fault boundary. `resolveEffectiveState` can throw two
documented transient signatures (`runtime.ts:247-266`): the stability contract's re-read exhaustion
and the exclusive state-lock timeout. Today a throw dies inside the child, the parent sees empty
stdout, and SessionStart survives with the section missing. A naive direct call would propagate
that throw into SessionStart.

Invariants to preserve: SessionStart must never crash the host hook, and a section declared
`mandatory` must never vanish without evidence.

Tradeoff taken: extract the existing PreEdit loop into one file-local helper accepting a
`resolveAttempt` closure. It has two real consumers and removes retry-authority duplication without
adding a type/protocol outside `runtime.ts`. PreEdit preserves its current adapter semantics;
SessionStart maps both throw classes to bounded unavailability evidence. The retry budget is the
honest cost — a CLI-equivalent SessionStart resolve can now spend up to three read attempts where it
previously spent one subprocess.

What fails first at 10x: the retry budget. More concurrent writers means more authority churn, so
residual instability at SessionStart becomes the visible failure mode. That is the correct place for
it to surface, and it is the empirical trigger for the deferred writer-ownership package.

Note checked and discarded: `tasks/current.md` is already excluded from the stability contract's
authority hash set (`resolve-effective-state.ts:227-233`, landed in `32da5923`), so demoting it
would not reduce stability throws. That argument does not belong to any package here.

## Deferred, each with its gate

These are non-authoritative sequencing notes with evidence gates, not approved goals. Do **not**
project them to `tasks/todos.md` from this Draft. A row enters the ledger only if a later
human-approved package promotes it; none belongs in this package's breakdown or allowed paths.

- Root context diet. Both host root files shrink together through `scripts/context-contract-sync.sh`
  rather than by hand, because the Architecture Contract / Active Workstreams / Current Session
  Projection blocks are generated and would be regenerated over a manual edit. Byte parity between
  `CLAUDE.md` and `AGENTS.md` must hold: `.ai/context/context-map.json` assigns them
  `target_agent: claude` / `codex`, and `scripts/inspect-project-state.ts:185,212` reports
  `root-agent-context-divergent` on divergence. Neither file is redundant; deleting either breaks one
  host and trips the checker. Also fold in the two competing `root_context_files` shapes
  (`src/core/adoption/standard-plan.ts:789` writes eight entries;
  `scripts/context-contract-sync.sh:303` and `scripts/architecture-event.ts:558` write two).
  Gate: this package's fixture baseline exists, so the diet's token delta is attributable.
- `tasks/current.md` demotion to a discoverable recovery reference.
  `currentStatusSnapshotContext` (`session-context.ts:836`) never parses the file's own
  `stale_after`; it prints `updated=` verbatim plus prose telling the model to verify staleness
  itself. It returns `null` on target branch with `Status: Idle` (`session-context.ts:851`), which is
  today's state, and emits regardless of age when `branch !== target` — that is, on the `codex/*`
  contract worktrees where work actually happens. Gate: decide parse-and-enforce versus demote before
  touching the provider.
- Delegation single-writer ownership. `allow_parallel_writers` (`subagent-handler.ts:280`) has zero
  readers in `src/`; `max_depth` (`:279`) has zero enforcement readers; `max_agents` (`:278`) is read
  once at `session-context.ts:1258` only to render more prose; `circuitLimit()`
  (`circuit-breaker.ts:68-77`) returns hardcoded 2/3 for `subagent` without consulting policy;
  `mutation-guard.ts` has no actor concept at all. The `sharedRules` prose at
  `subagent-handler.ts:316` is therefore the only existing control, and must not be deleted before a
  hard enforcement replaces it. Gate: a fixture proving `SubagentStart` `agent_id`/`turn_id`
  correlates stably with the actor identity of a `PreToolUse` edit event. If it does not correlate,
  the deliverable is the finding plus read-only native subagents, not an ownership struct.
- Splitting the eight string providers into eight existing `SessionContextSection` values, so
  ordering, dropping, and diagnostics become per-section. No new envelope type, no compiler. Gate:
  measurement from the two packages above shows end-of-pipeline truncation actually costs something.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Capture the deterministic pre-change healthy fixture (exact context/evidence bytes, section set, bytes/tokens, included/dropped, distinguishable explicit-root identity, route-runtime child metric).
- [x] Extract the existing file-local transient retry helper and prove PreEdit's non-transient/residual-transient behavior did not change.
- [x] Split SessionStart resolution from pure projection; remove `spawnSync`/`PACKAGE_ROOT`/JSON round trip; implement the three-outcome contract and bounded `HarnessStateUnavailable`.
- [x] Add the event-scoped diagnostic sink across the existing handler dependency boundary; give all eight advisory calls stable ids; persist failure-only optional diagnostics without raw errors.
- [x] Cover the full resolution/provider verification matrix, including host `ok`, retry counts, zero-section diagnostic persistence, and blocked-state non-misclassification.
- [x] Preserve the HRD-08/09 `child_processes` definition and typed-route zero; record separate proof that the SessionStart self-CLI call is absent.
- [x] Re-run the fixture and confirm exact healthy context **and evidence** parity.
- [x] Run the required checks and record the review.
