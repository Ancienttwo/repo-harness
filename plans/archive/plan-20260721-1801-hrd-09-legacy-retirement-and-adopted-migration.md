# Plan: HRD-09 legacy retirement and adopted migration

> **Status**: Archived
> **Created**: 20260721-1801
> **Slug**: hrd-09-legacy-retirement-and-adopted-migration
> **Planning Source**: waza-think
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260719-1531-hook-runtime-diet.sprint.md#hrd-09-legacy-retirement-and-adopted-migration
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: One typed runtime cutover, one atomic adopted-repo migration fixture, projection parity, targeted behavior tests, and the root required checks form one independently reviewable PR.
> **Rollback Surface**: Revert the HRD-09 PR; the adoption transaction already records rollback metadata and no compatibility runtime is retained.
> **Spec**: `docs/spec.md`
> **Research**: `plans/sprints/20260715-harness-loop-audit-and-optimization.md`
> **Task Contract**: `tasks/contracts/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.contract.md`
> **Task Review**: `tasks/reviews/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.review.md`
> **Implementation Notes**: `tasks/notes/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.notes.md`

## Goal

Finish Hook Runtime Diet with one runtime authority. Port the seven remaining route state machines and their route-only shell helpers into typed in-process handlers, make all eleven public routes execute without a Bash route step, remove the old first- and second-level dispatchers, and prove through one canonical adoption transaction plus strict event telemetry that an adopted downstream fixture has no dual dispatch or legacy invocation.

The eleven public `(event, routeId, matcher, hosts)` tuples, host output behavior, decisions, durable effects, and current route order remain unchanged. `user_waiver`/acceptance and merge authorization remain unrelated to this runtime package.

## P1: Architecture Map

- `src/cli/installer/managed-entries.ts` generates the direct host commands. They invoke `repo-harness-hook <Event> --route <id>` with a `repo-harness hook` executable fallback; neither modern command needs a repo-local dispatcher.
- `src/cli/hook-entry.ts` enters `src/cli/hook/runtime.ts#runHook`, the single event boundary and the sole HRD-08 event telemetry writer.
- Four routes are already in-process: SessionStart, PreEdit, PostEdit, and Stop. Seven routes still resolve `route.scripts` and `spawnSync('bash', ...)`: PreToolUse.subagent, PostToolUse.bash, PostToolUse.always, UserPromptSubmit.default/delegation, SubagentStart.context, and SubagentStop.quality.
- Those seven scripts source or invoke `hook-input.sh`, `changelog-guard.sh`, `first-principles-guard.sh`, `anti-simplification.sh`, `lib/session-state.sh`, and `lib/minimal-change.sh`. They are state machines or route adapters, not operator-only helpers.
- `assets/hooks/` is canonical and `.ai/hooks/` is its generated projection. `lib/workflow-state.sh` remains because operator-invoked workflow helpers consume it; no host event may dispatch a shell asset after this cutover.
- `scripts/hook-shim.sh` and `scripts/repo-harness.sh` are the obsolete first-level Bash prototype. `assets/hooks/run-hook.sh` is the obsolete second-level dispatcher. Tarball smoke and old tests still make that dead chain reachable.
- `src/core/adoption/standard-plan.ts` plus `src/effects/fs-transaction.ts` is the canonical, atomic adopted-repo migration path. Repo-local host adapters and generated retired hook files must be removed there without deleting custom hooks.
- `src/cli/commands/migrate.ts`, installer cleanup, adoption, and the retired runtime-reclaim prototype duplicate managed-command detection. HRD-09 leaves one pure detector/stripper for the supported install/migrate/adopt surfaces and removes the prototype executor.

## P2: Concrete Trace

1. Before migration, the adopted fixture contains legacy project adapter entries that execute `.ai/hooks/run-hook.sh`, generated copies of the seven route scripts and route-only helpers, plus one custom sibling hook.
2. One `repo-harness adopt --repo <fixture>` transaction reads the structured workflow manifest, validates exact known-generated fingerprints, removes only matching retired files and repo-harness-managed adapter entries, preserves the custom hook, installs current workflow state, and emits rollback evidence.
3. After migration, a generated modern host command enters `repo-harness-hook` directly and `runHook` resolves the same public route.
4. `runHook` calls one typed handler selected by `(event, routeId)`. The handler parses the host payload once, preserves current decision/stdout/stderr/effects, and records an `in_process` telemetry step. It never consults `route.scripts` and never launches a route shell.
5. Eleven route invocations produce eleven unique valid HRD-08 event records with `runtime_entries: 1`, no `subprocess` step, no opaque step, no retired basename, and unchanged public route identities.
6. The final product tree has no Bash dispatch chain: the route type has no `scripts` property, the retired assets/projection and Bash prototype are deleted, and `bun run check:hooks` proves exact projection parity.

Pressure point: deleting only `run-hook.sh` would leave seven opaque route state machines and non-empty registry references, so telemetry could not prove zero legacy execution. Conversely, deleting generated files by path alone could destroy a user-modified hook. Both conditions must be solved in this single package.

## P3: Design Decision

### Typed handler boundaries

- `prompt-handler.ts` owns UserPromptSubmit.default orchestration and consumes the existing prompt router/decision/minimal-change/review helpers directly.
- `command-observed.ts` owns PostToolUse.bash, including bounded output evidence and changelog advice. `trace-observer.ts` owns PostToolUse.always trace projection.
- `subagent-handler.ts` owns PreToolUse.subagent, UserPromptSubmit.delegation, SubagentStart.context, and SubagentStop.quality. Shared return-channel/context/quality semantics live here once.
- A small typed hook-input module may be added only if at least two handlers consume it; invalid payloads preserve the current fail-open/fail-closed result for that route and are not reinterpreted by regex fallbacks.
- `handler-contract.ts` and `handler-registry.ts` define the one handler input/result/effect boundary and the exhaustive route-to-handler mapping. `runtime.ts` owns host-output routing and event finalization; handlers must not write directly to host file descriptors or create a second telemetry record.

### Authority cutover and deletion

Delete the `Route.scripts` property itself while keeping the public tuple fields byte-stable. An empty compatibility field is not retained. Delete the seven route scripts, `run-hook.sh`, their route-only helper scripts/libs, `scripts/hook-shim.sh`, and `scripts/repo-harness.sh` in the same work-package. Keep only shell that is independently operator-invoked or required by workflow helpers, currently `assets/hooks/lib/workflow-state.sh` and its projection.

There is no runtime fallback to the removed scripts, no dual dispatch, no release-line window, and no hidden call to a retired shell from the typed handlers. Existing one-shot legacy recognition in migration is permitted only as operator-invoked removal logic and must not be reachable from host event execution.

### Atomic adopted migration

Create one pure managed-hook command detector/stripper shared by installer cleanup, `migrate`, and adoption. Delete `reclaim-runtime.ts` and its archive rollback surface so the canonical adoption transaction is the only runtime-retirement writer. The canonical adoption plan removes repo-harness-managed entries from repo-local `.claude/settings.json` and `.codex/hooks.json` while preserving every sibling field and custom hook.

Add a structured manifest action for the retired `.ai/hooks` files with exact SHA-256 fingerprints. The adoption planner removes a path only when its current bytes match the declared known-generated fingerprint; absent files are no-ops and mismatched files are preserved with no semantic guess. The filesystem transaction remains the only writer and supplies rollback metadata.

### Evidence

The complete disposable fixture must exercise the real adoption operation model, then invoke all eleven modern routes. It proves:

- one transaction and no second migration pass;
- custom adapter entries and modified unknown hook files survive;
- every exact generated retired file and managed legacy entry is gone;
- no removed dispatcher can be executed;
- eleven unique telemetry records contain only in-process steps, no opaque steps, and no retired script names;
- provider call count is zero and no expensive evidence is reproduced before code freeze.

### Trade-offs and scale

| Option | Decision | Reason |
|---|---|---|
| Delete only `run-hook.sh` | Reject | Seven opaque Bash state machines and registry refs remain, contradicting HRD-08/09 acceptance. |
| Keep Bash wrappers around typed functions | Reject | Still dual dispatch and opaque process cost. |
| Remove legacy files by pathname | Reject | Cannot distinguish generated bytes from user-modified hooks. |
| Fingerprinted one-shot migration | Use | Safe, fail-closed, operator-invoked, and removes the old runtime in the same package. |
| Add a compatibility release window | Reject | Explicitly forbidden by sprint and repo rules. |

At 10x event volume, handler-internal synchronous `git`/filesystem work becomes the first pressure point, especially prompt and subagent context assembly. This package removes dispatch/process duplication but does not invent caches or weaken gates; HRD-08 telemetry remains the measurement authority.

## File Plan

| Surface | Change |
|---|---|
| `src/cli/hook/{prompt-handler,command-observed,trace-observer,subagent-handler}.ts` | Typed ports of the seven remaining route state machines. |
| `src/cli/hook/{handler-contract,handler-registry}.ts`, `runtime.ts`, `route-registry.ts` | One exhaustive typed dispatch authority, no script field, one in-process telemetry step per route. |
| `scripts/hook-dispatch-diet-report.ts` | Replace script projection with handler identity and zero-opaque runtime evidence. |
| `src/core/adoption/standard-plan.ts`, managed-hook config authority, workflow manifest | Atomic fingerprinted retirement and repo-local adapter cleanup. |
| `assets/hooks/`, `.ai/hooks/`, `scripts/hook-shim.sh`, `scripts/repo-harness.sh` | Delete runtime shell authority and re-sync projection. |
| Runtime/adoption/installer/projection tests and HRD-09 fixture | Freeze behavior, migration safety, route tuples, telemetry, and absence of dual dispatch. |
| Runtime architecture/reference docs and workflow artifacts | Record the final authority and close Sprint B. |

## Risks and Falsifiers

| Risk / falsifier | Cheapest proof | Response |
|---|---|---|
| A typed port changes a route decision, output channel, or side effect | Existing route tests plus focused handler fixture before shared integration | Stop and fix the port; do not keep the shell as fallback. |
| A route still emits an opaque/subprocess telemetry step | Eleven-route fixture | Treat as incomplete cutover; no acceptance. |
| Adoption would delete modified user content | Mismatched-fingerprint fixture | Preserve and report; never remove by path alone. |
| A repo-local adapter and user-level adapter can both fire | Seeded legacy adapter fixture plus sentinel | Canonical transaction must strip only managed legacy entries. |
| `lib/workflow-state.sh` becomes unreachable to operator helpers | Root helper/closeout tests | Keep this explicit operator helper; it is outside host-event dispatch. |

## Promotion Gate

- **Merge/PR unit**: all seven typed ports, dispatcher removal, adopted migration, projection sync, tests, and docs are one authority cutover and cannot land separately.
- **Rollback surface**: revert the HRD-09 PR; downstream adoption transactions use their recorded rollback manifest.
- **Verification boundary**: focused handler tests, full eleven-route fixture, adoption transaction fixture, projection/tarball checks, full Bun suite, root required checks, strict contract verification, and one semantic acceptance.
- **Review/acceptance boundary**: no public tuple drift, behavior parity, zero opaque/legacy event steps, exact-fingerprint preservation, no runtime shim, and no duplicate semantic reviewer.
- **High-risk surface**: prompt/subagent workflow gates and destructive-looking generated-file migration; both are bounded by behavior fixtures and fail-closed ownership checks.
- **Why not checklist row**: this removes the last runtime authority and migration path as one independently reversible PR.

## Evidence Contract

- **State/progress path**: this plan, its contract/review/notes bundle, the Hook Runtime Diet sprint row, and `tasks/current.md`.
- **Verification evidence**: targeted handler/adoption/runtime tests, the eleven-route telemetry fixture, full Bun suite, root required checks, strict contract verification, and one AcceptanceReceipt.
- **Evaluator rubric**: exact public route tuple parity; no route Bash execution; one event record per route; one atomic migration; user-owned content preservation; no compatibility path.
- **Stop condition**: stop if any route requires an unapproved semantic change, any generated file cannot be distinguished from user-owned bytes, any public tuple changes, or a required check cannot run.
- **Rollback surface**: revert the PR and use per-transaction downstream rollback manifests; do not restore a compatibility dispatcher.

## Task Breakdown

- [x] Complete P1/P2/P3 exploration and resolve the seven-script scope ambiguity.
- [x] Freeze this decision-complete plan and exact contract before code edits.
- [x] Port prompt, command/trace, and subagent route groups with focused parity tests.
- [x] Integrate the exhaustive handler registry, remove the route script field, and prove one in-process step per route.
- [x] Add the single managed-adapter detector and fingerprinted one-shot adoption cleanup.
- [x] Delete the Bash prototype, second-level dispatcher, route scripts, and route-only helpers; sync projection.
- [x] Add the complete adopted-fixture + eleven-route telemetry proof and update stale tests/docs, including the triggered Stop/SubagentStart cross-writer transaction closure.
- [x] Freeze code, run targeted checks once, then the full root verification set once.
- [ ] Record exactly one semantic acceptance or contract-authorized typed owner waiver, seal, PR, CI, merge, and cleanup.

## Acceptance

- All eleven public route tuples are unchanged and the `Route` contract has no `scripts` property.
- The seven previously opaque routes preserve decisions, host stdout/stderr shape, ordering, and durable effects through typed handlers.
- `assets/hooks` and `.ai/hooks` contain no host-event script or dispatcher; `scripts/hook-shim.sh` and `scripts/repo-harness.sh` are absent.
- One canonical adoption transaction removes exact generated retired files and repo-harness-managed local adapters, preserves custom/mismatched content, and emits rollback evidence.
- Eleven modern route invocations write eleven valid unique event records with no subprocess step, opaque step, retired basename, or second runtime entry.
- `bun run check:hooks`, targeted tests, full `bun test`, root required checks, strict contract verification, and the single acceptance authority pass.

## Handoff

- Checks cache: `.ai/harness/checks/latest.json`
- Runtime samples: `.ai/harness/runs/hook-events.jsonl`
- Session handoff: `.ai/harness/handoff/current.md`
- Scope authority: `tasks/contracts/20260721-1801-hrd-09-legacy-retirement-and-adopted-migration.contract.md`
