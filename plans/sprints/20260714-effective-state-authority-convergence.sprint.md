# Sprint: Effective State Authority Convergence

> **Status**: Approved
> **Slug**: `effective-state-authority-convergence`
> **Created**: 2026-07-14
> **Updated**: 2026-07-15 15:26
> **Audit baseline**: `main@82550779cdccf0575d674ae53bbc95ba63e44743`
> **Source Spec**: `docs/spec.md`
> **Goal Mode**: incremental
> **Target duration**: 10 working days
> **Recommended staffing**: 2 engineers
> **Risk**: high
> **Proposed release**: `0.11.0` only when MCP overwrite preconditions become mandatory; otherwise retain a non-breaking `0.10.x` release and defer that behavior change.

Program-level Sprint container. This Sprint does not redesign repo-harness. It performs one public-contract-preserving vertical convergence: make Effective State a single deterministic authority shared by CLI, hooks, and MCP; remove a handwritten capability-registry shadow implementation; correct review-proven fail-open authority/locking/publication faults; and harden one bounded workflow-artifact write path when that separately versioned row is staffed.

## Sprint Goal

By the end of the Sprint:

1. Effective State domain rules no longer live under a CLI/hook adapter.
2. CLI, hook projection, and MCP state summary derive their core fields from the same resolver.
3. Capability-registry parsing, validation, and path matching have one source implementation.
4. When ESA-06 is staffed, workflow artifact creation uses a guarded atomic writer and optimistic overwrite enforcement is either shipped as an explicitly versioned `0.11.0` change or deferred without a silent compatibility fallback. In the approved single-engineer scope, ESA-06 moves intact to the next Sprint and this goal is satisfied by that explicit deferral.
5. Public CLI command names, MCP tool names, repository artifact authority, and Effective State protocol `1` remain stable unless a separately approved release gate says otherwise.

The architectural rule established by this Sprint is:

> Pure rules live in `src/core`; filesystem/Git/lock/cache execution lives in `src/effects`; CLI, MCP, and hooks only adapt, render, trigger, or guard those capabilities. Skills remain workflow/knowledge packages and do not reimplement these rules.

## PRD

### Problem

The product architecture already treats repository artifacts as authority and hooks as accelerators/guardrails, but the implementation boundary has drifted:

- `src/cli/hook/state-snapshot.ts` is effectively an application kernel. It owns public state types, Markdown parsing, risk/profile calculation, Git state-version allocation, file locking, cache persistence, legacy migration, and compatibility projection.
- `src/cli/hook/workflow-profile.ts` is deterministic domain policy but is located under an adapter.
- `src/cli/commands/state.ts` mixes Commander wiring, process lifecycle, rendering, field projection, and exit semantics.
- `src/cli/mcp/tools.ts` computes `summarize_repo_harness_state` independently from `tasks/current.md`, even though that file is a non-authoritative orientation snapshot.
- Effective State carries a handwritten subset of capability-registry validation that explicitly mirrors `scripts/capability-resolver.ts`.
- MCP workflow-artifact writes use direct `writeFileSync`, while stronger path safety, precondition, durable atomic write, lock, backup, and rollback behavior already exists elsewhere in the codebase.
- `interfaces/types.ts` is still a placeholder rather than a stable protocol boundary.

This is not primarily a feature deficit. It is capability ownership fragmentation. Continued feature growth will otherwise create multiple state authorities and multiple mutation semantics.

### Users

- Maintainers evolving repo-harness behavior without creating adapter drift.
- CLI agents resolving workflow state through Shell.
- MCP hosts resolving the same state through structured tools.
- Hook adapters enforcing the same risk and workflow decisions.
- Downstream adopted repositories that depend on stable helper projections and protocol compatibility.

### Success Criteria

- One Effective State projection algorithm and one workflow-profile policy implementation.
- One capability-registry parser/validator/matcher source.
- No MCP state calculation based only on `tasks/current.md`.
- CLI/Hook/MCP parity tests prove agreement on authority-sensitive fields.
- State cache remains a read model, never an authority input.
- `state_version` remains monotonic and `state_revision` remains content-derived.
- Existing public CLI JSON and exit behavior remain compatible.
- State resolution performance does not regress by more than 10% at p95 on the repository fixture benchmark.
- The code boundary is enforced in CI, not merely documented.

### Acceptance Scenarios

1. Given the same adopted repository fixture, the CLI matches direct resolution for its requested risk input, hook and MCP match a direct `inspect` resolution, and every public path agrees on protocol/kind, task, authoritative plan/contract, stale/conflicting sources, revision, and version. Phase, blockers, workflow profile, risk floor, reasons, guidance, and next action may differ only as projections of that named requested-versus-inspect policy input.
2. Given a stale or manually edited `tasks/current.md`, authority revision, task selection, and authoritative plan/contract remain unchanged. Its observed source hash/freshness may legitimately change `state_revision`/`state_version`, `stale_sources`, and an explicitly labeled non-authoritative MCP preview.
3. Given a corrupt, unsupported-version, or malformed declared capability registry, all adapters fail closed with the same canonical reason.
4. Given a deleted or corrupt Effective State cache, resolution reconstructs state from authoritative artifacts and preserves monotonic version semantics.
5. Given a live state lock, a second resolver waits or fails according to the existing timeout contract; given a stale dead-owner lock, it safely reclaims it.
6. Given sources that change during resolution, the resolver retries until stable or fails without publishing a mixed snapshot.
7. If ESA-06 is staffed, given two concurrent workflow-artifact overwrites, a stale expected revision cannot silently win; otherwise ESA-06 remains explicitly deferred with no claimed writer change.
8. If ESA-06 is staffed, given a simulated workflow-artifact write failure, no partial final file or leaked temporary file remains; otherwise this scenario is not claimed by the single-engineer closeout.

### Non-goals

- No complete rewrite or arbitrary split of `src/cli/mcp/tools.ts`.
- No unification of every mutation path in adoption, coding, general repo access, source projection, and handoff append.
- No redesign of install/adopt behavior.
- No renaming of public CLI commands or MCP tools.
- No blanket reduction of Skill count.
- No generic, metadata-heavy “Capability Registry framework” that generates every product surface.
- No change to the authority hierarchy of plan, contract, review, checks, handoff, and repository artifacts.
- No new state protocol version unless a real public schema change is approved.
- No long-lived compatibility implementation that leaves both the old and new resolver active.

## Audit Findings That Drive Scope

| Finding | Current surface | Consequence | Sprint response |
|---|---|---|---|
| Effective State is monolithic and adapter-owned | `src/cli/hook/state-snapshot.ts` | Domain, effects, and adapter concerns cannot evolve independently | Split read → pure project → persist, preserving behavior |
| Risk policy is pure but misplaced | `src/cli/hook/workflow-profile.ts` | Other adapters import hook-owned policy | Move to `src/core/workflow/profile.ts` |
| CLI controls process directly | `src/cli/commands/state.ts` | Harder unit tests and host reuse | Return a structured command outcome; Commander renders/exits |
| MCP has a second state summary | `src/cli/mcp/tools.ts` | `tasks/current.md` can be mistaken for authority | Delegate to the canonical resolver |
| Capability validation is mirrored | Effective State + `scripts/capability-resolver.ts` | Silent rule drift remains possible despite parity tests | Establish one canonical source and generate/project standalone helper code |
| Workflow writes are weaker than existing mutation primitives | `writeMarkdownArtifact` | Non-atomic overwrite and lost-update risk | Migrate a bounded writer slice to guarded atomic write |
| Shared protocol types are not established | `interfaces/types.ts` | Adapter-owned DTOs become de facto contracts | Introduce explicit Effective State v1 exports |
| Existing tests are strong but adapter-coupled | `tests/effective-state.test.ts` | Refactor safety exists, but ownership remains frozen in old path | Characterization first, then direct core/effects and parity tests |

## Architecture Notes

### Invariants to Freeze Before Refactoring

1. Markdown/repository artifacts remain human-editable authority.
2. `.ai/harness/state/effective.json` remains a replaceable read model and never feeds authority back into resolution.
3. Effective State `protocol: 1` and `kind: "repo-harness-effective-state"` remain stable.
4. `state_revision` is a deterministic content revision over sorted source hashes.
5. `state_version` is durable and monotonic across cache deletion/corruption and linked worktrees.
6. Workflow profile resolution remains deterministic and fail-closed when required risk signals are unavailable or invalid.
7. Workflow-surface-only edits do not accidentally inflate implementation risk.
8. Plan/contract relationship conflicts and foreign worktree ownership continue to block exactly as before.
9. CLI exit behavior remains:
   - `0`: resolved and not blocked;
   - `1`: resolved but blocked, or operational failure where currently defined;
   - `2`: usage/unknown-field failure where currently defined.
10. A compatibility projection may exist, but a second authority implementation may not.

### Target Dependency Direction

```text
skills / agents / humans
          |
          v
CLI adapter   MCP adapter   Hook adapter
      \          |          /
       \         |         /
        v        v        v
       src/effects/state/resolve-effective-state.ts
              |             |
              v             v
    source collection    lock/version/cache
              \             /
               \           /
                v         v
        src/core/state/project-effective-state.ts
                  |
                  +--> src/core/workflow/profile.ts
                  +--> src/core/capabilities/registry.ts
                  +--> src/core/state/artifact-parsers.ts
```

Rules:

- New files under `src/core/state`, `src/core/workflow`, and `src/core/capabilities` may not import `fs`, `path`, `child_process`, Commander, or MCP SDK packages.
- Adapters may call the shared resolver; they may not parse authoritative workflow artifacts or recompute workflow risk.
- Effect modules may perform I/O but may not define competing business policy.
- Standalone downstream helpers are generated/projected artifacts. Their source of truth remains canonical TypeScript source, not a handwritten second implementation.

### Proposed File Layout

```text
interfaces/
  effective-state-v1.ts
  types.ts                         # re-export stable public interfaces

src/core/
  state/
    types.ts
    artifact-parsers.ts
    project-effective-state.ts
  workflow/
    profile.ts
  capabilities/
    registry.ts

src/effects/
  state/
    collect-state-inputs.ts
    resolve-effective-state.ts
    git-state-version-store.ts
    state-cache.ts
    state-lock.ts
  guarded-file-write.ts

src/cli/
  commands/
    state.ts                       # thin Commander adapter
  hook/
    state-snapshot.ts              # compatibility projection only
    legacy-active-plan-migration.ts
  mcp/
    state-tools.ts
    workflow-artifact-writer.ts
    tools.ts                       # registration/routing, imports handlers

tests/
  state/
    artifact-parsers.test.ts
    project-effective-state.test.ts
    state-effects.test.ts
    adapter-parity.test.ts
    fixtures/
  capabilities/
    registry.test.ts
  mcp/
    workflow-artifact-writer.test.ts
```

This layout follows the repository’s existing `core → effects → CLI` direction. It deliberately avoids adding a broad dependency-injection framework. Only four small seams are needed:

```ts
interface StateSourceCollector {
  collect(repoRoot: string, nowMs: number, risk?: EffectiveStateRiskInput): EffectiveStateInputs;
}

interface StateVersionStore {
  current(revision: string): number;
  allocate(revision: string): number;
}

interface StatePersistence {
  readLock(): StateLockRecord | null;
  writeCache(state: EffectiveStateV1): void;
}

interface Clock {
  now(): number;
}
```

Concrete functions are preferable where interfaces do not improve testing.

### Dependency Order

Critical path:

```text
ESA-01 → ESA-02 → ESA-03 → ESA-05 → ESA-07
                   ↘
                     ESA-04 ───────↗
ESA-02 → ESA-06 ───────────────────↗
```

- `ESA-04` can run in parallel with the latter half of `ESA-03`.
- `ESA-06` can run in parallel with adapter convergence, but it must not delay the state-authority cutover.
- For a single-engineer Sprint, defer `ESA-06` rather than reducing characterization or parity coverage.

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---:|---:|---|
| State JSON ordering/hash drift | Medium | High | Golden fixtures before movement; normalize only truly nondeterministic values |
| Git worktree version-store regression | Medium | High | Linked-worktree tests against Git common-dir semantics |
| Lock behavior changes under contention | Medium | High | Multi-process tests for live, stale, reclaimed, and token-mismatch locks |
| Source changes produce mixed snapshots | Low | Critical | Preserve multi-read stabilization loop and fault-inject source mutation |
| Standalone helper stops working downstream | Medium | High | Bundle/generate the canonical registry implementation; tarball + adopted-repo smoke |
| MCP clients break on changed summary shape | Medium | High | Preserve tool name; make new fields additive; document compact v1 projection |
| Mandatory revision precondition is breaking | High | Medium | Ship only under `0.11.0`; otherwise deliver atomic writes and revision return first |
| Scope expands into all mutation systems | High | High | Restrict ESA-06 to common workflow-artifact writer; append/coding/general-repo/adoption stay out |
| Refactor adds unnecessary abstractions | Medium | Medium | Prefer pure functions and four small I/O seams; no service container |
| Recent 0.10.0 changes are destabilized | Medium | High | No install/adopt/source-package redesign in this Sprint |

## Backlog

Ordered execution queue. Every row has a machine-checkable acceptance line.

| # | Status | Task | Mode | Acceptance | Plan |
|---:|:---:|---|---|---|---|
| 1 | [ ] | `ESA-01` — Freeze Effective State invariants and characterization fixtures | contract | Golden CLI/state fixtures cover at least 10 authority/risk/concurrency states and pass against `main@8255077` before production movement | pending |
| 2 | [x] | `ESA-02` — Extract workflow policy and Effective State v1 contracts | contract | New core modules have zero forbidden runtime imports; existing workflow-profile matrix and public protocol snapshots remain unchanged | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` |
| 3 | [x] | `ESA-03` — Split Effective State read → project → persist pipeline | contract | Hook adapter owns no authority parsing, Git version allocation, lock, or cache code; all state characterization and fault tests pass | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` |
| 4 | [x] | `ESA-04` — Single-source capability-registry validation and matching | contract | Exactly one handwritten source implementation owns version/shape/semantic/matching rules; projected helper drift fails CI | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` |
| 5 | [x] | `ESA-05` — Converge CLI, hook, and MCP state adapters | contract | CLI matches requested-risk resolution; hook/MCP match direct inspect resolution; repository authority fields agree for every parity fixture | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` |
| 6 | [ ] | `ESA-06` — Guard and atomically write workflow artifacts | contract | Migrated writes leave no partial file, return a revision, and reject a stale overwrite when the versioned precondition mode is enabled | pending |
| 7 | [x] | `ESA-07` — Enforce boundaries, package/release verification, and documentation | contract | Boundary checker, full CI/release checks, tarball smoke, architecture docs, changelog, and handoff evidence all pass | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` |

Committed scope for two engineers: 34 SP.  
Single-engineer committed scope: ESA-01 through ESA-05 plus ESA-07; ESA-06 moves intact to the next Sprint.

## Detailed Task Contracts

### ESA-01 — Freeze Effective State Invariants and Characterization Fixtures

**Intent**

Create a behavioral safety net before moving code. This task must not change production behavior.

**Primary files**

```text
tests/effective-state.test.ts
tests/state/fixtures/*
tests/state/cli-state-golden.test.ts
docs/architecture/effective-state-authority.md
```

**Implementation steps**

1. Record the audited baseline commit in the test/notes metadata.
2. Extract reusable repository-fixture builders from the existing Effective State test without changing assertions.
3. Add a golden fixture matrix:
   - idle/inspect;
   - executing with fresh plan/contract/review/checks;
   - missing contract blocker;
   - foreign worktree owner;
   - stale current/checks/handoff;
   - invalid declared capability registry;
   - strict override below risk floor;
   - deleted/corrupt cache;
   - live and stale state locks;
   - source mutation during resolution.
4. Capture:
   - full Effective State JSON;
   - selected `--field` output;
   - CLI exit code;
   - legacy hook snapshot projection;
   - source hashes/revision after stable normalization.
5. Write the authority ADR with the ten frozen invariants above.
6. Add a micro-benchmark harness for 100 repeated resolutions over a representative fixture. Record baseline median and p95; do not make it a flaky wall-clock CI gate yet.

**Acceptance**

- Production source diff is empty except comments required to expose an existing test seam.
- All new fixtures pass against the pre-refactor implementation.
- Golden snapshots normalize timestamps/temp roots only; blockers, reasons, paths, hashes, versions, and ordering remain asserted.
- The ADR explicitly says `tasks/current.md` and Effective State cache are projections, not authority.
- Baseline benchmark evidence is checked into task notes.

**Rollback**

Delete only the new fixtures/ADR; no production behavior is affected.

---

### ESA-02 — Extract Workflow Policy and Effective State v1 Contracts

**Intent**

Move deterministic rules and public data contracts out of adapter ownership without changing behavior.

**Primary moves**

```text
src/cli/hook/workflow-profile.ts
  → src/core/workflow/profile.ts

EffectiveState and related types
  → src/core/state/types.ts
  → interfaces/effective-state-v1.ts for the stable public projection
```

**Implementation steps**

1. Move workflow-profile types, constants, strict-token detection, medium-scope/cross-capability floor logic, and `resolveWorkflowProfile` to core.
2. Preserve all current reasons/error codes and ordering exactly.
3. Move state DTOs and source/freshness/risk types to `src/core/state/types.ts`.
4. Define the public protocol export as `EffectiveStateV1`; keep `protocol: 1` and the existing JSON shape.
5. Make `interfaces/types.ts` re-export the explicit public contract rather than remaining an empty placeholder.
6. Update imports in tests and adapters.
7. A temporary re-export from the old path is allowed only inside this PR and must be removed before merge.

**Acceptance**

- `src/core/workflow/profile.ts` and `src/core/state/types.ts` import no filesystem/process/CLI/MCP modules.
- Existing workflow profile tests pass without changed expected outcomes.
- A schema/snapshot test proves the public Effective State JSON shape is unchanged.
- `rg "export interface EffectiveState" src/cli src/effects` returns no adapter-owned definition.
- `rg "resolveWorkflowProfile" src/cli/hook` finds usage/import only, not an implementation.
- Type check passes.

**Rollback**

The change is path-only and can be reverted without artifact migration.

---

### ESA-03 — Split Effective State Read → Project → Persist Pipeline

**Intent**

Turn the current monolith into one pure projection surrounded by explicit effects, while preserving every safety property.

**Proposed modules**

```text
src/core/state/artifact-parsers.ts
src/core/state/project-effective-state.ts
src/effects/state/collect-state-inputs.ts
src/effects/state/git-state-version-store.ts
src/effects/state/state-cache.ts
src/effects/state/state-lock.ts
src/effects/state/resolve-effective-state.ts
src/cli/hook/state-snapshot.ts
src/cli/hook/legacy-active-plan-migration.ts
```

**Data flow**

```ts
const inputs = collectStateInputs(repoRoot, nowMs, risk);
const draft = projectEffectiveState(inputs);
const revision = contentRevision(inputs.sourceHashes);
const version = versionStore.allocate(revision);
const state = finalizeEffectiveState(draft, version, revision);
stateCache.write(state);
return state;
```

The actual resolver must still collect/compare source hashes around projection and retry when authority changes during a read.

**Implementation steps**

1. Move pure Markdown/JSON interpretation into `artifact-parsers.ts`:
   - plan status and artifact stem;
   - task ID;
   - plan/contract relationship;
   - allowed paths;
   - first open task;
   - review/check/acceptance freshness fields;
   - active sprint/worktree/handoff/resume/current references.
2. Define `EffectiveStateInputs` containing already-read content, stats, source hashes, Git-derived observations, current time, and requested risk input.
3. Implement `projectEffectiveState(inputs)` with no I/O.
4. Move Git path/version-owner behavior into a dedicated version store.
5. Move lock acquisition/reclamation/token ownership into `state-lock.ts`.
6. Move atomic cache replacement into `state-cache.ts`.
7. Keep the stability loop in a single effectful resolver:
   - lock;
   - collect A;
   - project;
   - collect/verify B;
   - retry on mismatch;
   - allocate version and publish only after stability.
8. Move legacy active-plan migration into a separate adapter/effect path; it must not be part of steady-state projection.
9. Reduce `state-snapshot.ts` to compatibility projection only.

**Acceptance**

- `state-snapshot.ts` is at most 200 logical lines and contains no authority Markdown parser, Git process invocation, state lock, monotonic version store, or cache writer.
- Pure projector tests cover every phase, blocker, freshness, conflict, profile, and next-action branch.
- Existing Effective State integration tests remain green.
- Cache deletion/corruption cannot change authority output and does not reset durable version semantics.
- Linked worktrees share the intended Git-backed version owner.
- Live lock, stale lock, dead owner, malformed lock, and token mismatch are tested.
- Source mutation during resolution either stabilizes within the existing retry envelope or fails without cache/version publication.
- Fault injection at temp write, rename, and cache publication leaves no partial authority read model.
- p95 fixture benchmark is within +10% of ESA-01 baseline, or a measured exception is documented and approved.

**Rollback**

The resolver export can be reverted as one PR. Do not retain both resolver implementations behind a feature flag.

---

### ESA-04 — Single-source Capability-registry Validation and Matching

**Intent**

Remove the explicitly mirrored, handwritten subset of capability-registry validation.

**Canonical module**

```text
src/core/capabilities/registry.ts
```

**Canonical responsibilities**

- parse JSON;
- enforce exact supported version;
- validate registry/entry shape needed by runtime;
- validate identifiers and prefixes;
- detect duplicate IDs/prefixes where applicable;
- perform deterministic longest-prefix matching;
- report `valid | absent | invalid`;
- return unmapped paths and structured diagnostics.

**Packaging constraint**

`assets/templates/helpers/capability-resolver.ts` must remain runnable in adopted repositories without importing repo-harness internals. Therefore:

1. Source/package code imports the canonical module directly.
2. `sync:helpers` bundles or generates a standalone projection from canonical source.
3. A hash/projection check fails when generated helper output is stale.
4. The generated helper is never edited manually.

**Implementation steps**

1. Lift shared parse/validate/match behavior into the canonical pure module.
2. Replace Effective State’s `capabilityIdsForPaths` handwritten rules with the canonical API.
3. Refactor `scripts/capability-resolver.ts` to consume the canonical implementation in source development.
4. Update helper projection tooling to emit a standalone downstream helper.
5. Retain parity tests as public-surface compatibility tests, not as compensation for two source authorities.
6. Add fixtures for:
   - missing undeclared registry;
   - missing declared registry;
   - corrupt JSON;
   - unsupported version;
   - non-array capabilities;
   - empty/non-string ID;
   - empty/non-array prefixes;
   - non-string prefix;
   - duplicate IDs/prefixes;
   - longest-prefix ties;
   - unmapped implementation paths;
   - path normalization/traversal rejection where required.

**Acceptance**

- `rg "mirrored from|reciprocal comment|parity with capability-resolver" src scripts` contains no statement describing two handwritten validators.
- One canonical source file owns the rules.
- Effective State and helper-facing results match on all fixtures.
- `bun run sync:helpers` is deterministic.
- `bun run check:helpers` fails after intentionally modifying generated output, then passes after regeneration.
- A packed tarball and a clean adopted-repository fixture can run the projected standalone helper without source-tree imports.

**Rollback**

Revert the canonicalization PR as a unit. Do not retain a generated helper whose source revision is unknown.

---

### ESA-05 — Converge CLI, Hook, and MCP State Adapters

**Intent**

Make all state-facing adapters project the same authority without forcing every client to consume the full internal object.

**CLI**

Introduce a testable command function:

```ts
interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly stdout: string;
  readonly stderr: string;
}

function resolveStateCommand(
  options: StateCommandOptions,
  deps: { repoRoot: string; nowMs: number; resolve: ResolveEffectiveState }
): CommandOutcome;
```

Commander wiring should only parse options, call the function, write streams, and set the process exit code.

**Hook**

Keep `StateSnapshot` only as a compatibility projection from `EffectiveStateV1`. It must not independently inspect authority files.

**MCP**

Move the state tool to `src/cli/mcp/state-tools.ts`. Preserve the public tool name:

```text
summarize_repo_harness_state
```

Its compact result should derive from Effective State and contain at least:

```text
protocol
kind
task_id
phase
state_version
state_revision
workflow_profile
requested_workflow_profile
risk_floor
profile_reasons
authoritative_plan
contract
blockers
stale_sources
conflicting_sources
next_action
```

`current_preview` may remain only as an explicitly labeled, redacted, non-authoritative convenience field. The MCP policy profile must not be presented as the workflow profile.

**Implementation steps**

1. Extract CLI outcome/render logic and inject repo root/clock/resolver.
2. Preserve `--json`, `--field`, blocker, unknown-field, and exit semantics.
3. Make hook snapshot a pure projection from resolved state.
4. Replace MCP’s `tasks/current.md`-only summary with canonical resolution.
5. Add compact MCP serializer separate from resolver logic.
6. Add one adapter-parity test matrix over all ESA-01 fixtures.
7. Move only state registration/dispatch out of `tools.ts`; do not split unrelated tools during this task.

**Acceptance**

- Same fixture produces identical repository authority fields through direct resolver, CLI JSON, hook-derived snapshot, and MCP compact state. CLI follows its requested risk input; hook and MCP follow their fixed `inspect` contract and are compared to a direct inspect resolution rather than to a feature/security request.
- MCP state summary no longer reads or parses `tasks/current.md` as authority.
- Public CLI command names, options, JSON protocol, and exit codes remain unchanged.
- Public MCP tool name remains unchanged.
- MCP schema/result changes are additive unless explicitly released under a new minor line.
- No CLI/MCP/hook file computes risk floor or workflow profile independently.
- CLI command function unit tests run without `process.exit`.
- `tools.ts` no longer contains the state summary implementation.

**Rollback**

Revert adapter cutover as one PR. Do not reintroduce an alternate summary parser; return temporarily to the prior adapter only through a source revert.

---

### ESA-06 — Guard and Atomically Write Workflow Artifacts

**Intent**

Apply existing safety patterns to one bounded MCP workflow-writer path. This is not the all-system mutation convergence Sprint.

**In scope**

The common writer used by:

```text
write_prd
write_prd_from_idea
write_sprint
write_checklist_sprint
write_plan
prepare_codex_goal_from_sprint
write_codex_goal
```

`append_handoff_note` is out of scope because append concurrency and record framing require a separate design.

**Proposed API**

```ts
type GuardedWritePrecondition =
  | { readonly kind: "absent" }
  | { readonly kind: "content-sha256"; readonly expected: string }
  | { readonly kind: "legacy-overwrite" }; // temporary, only if compatibility gate retains it

interface GuardedWriteResult {
  readonly path: string;
  readonly previousSha256: string | null;
  readonly sha256: string;
  readonly mutationId: string;
}
```

**Safety behavior**

- repository containment and policy authorization;
- no symlink traversal/escape;
- regular-file validation;
- create uses expected-absent semantics;
- overwrite uses expected content revision when versioned behavior is enabled;
- write temp file in target directory;
- preserve or explicitly set mode;
- fsync file;
- rename atomically;
- fsync parent directory;
- clean temporary file on every exception;
- return before/after revision;
- audit structured result/error.

**Release gate**

- If `expected_sha256` becomes mandatory for overwrite, release as `0.11.0` and document the MCP behavior change.
- If the release must remain non-breaking, ship atomic durable writes plus returned revisions in `0.10.x`, keep current overwrite input temporarily, and create a dated follow-up task to enforce optimistic concurrency. Never silently ignore a supplied expected hash.

**Canonical errors**

```text
WOULD_OVERWRITE
REVISION_CONFLICT
PATH_OUTSIDE_REPO
SYMLINK_ESCAPE
NOT_A_REGULAR_FILE
WRITE_FAILED
```

**Acceptance**

- No direct `writeFileSync` remains in the migrated workflow-artifact write path.
- Two concurrent writes with the same stale expected hash result in one success and one `REVISION_CONFLICT`.
- Create against an existing path returns `WOULD_OVERWRITE`.
- Symlink escape and path traversal fail closed.
- Injected failure before rename leaves original file unchanged.
- Injected failure after temp creation leaks no temp file.
- Success returns SHA-256 and mutation ID and records audit data.
- Existing frontmatter/body rendering remains byte-compatible apart from deliberately documented timestamp behavior.
- Append, coding, general-repo, adoption, and source-projection writers are untouched.

**Rollback**

Atomic-write refactor can be reverted independently. A released mandatory precondition must not be silently rolled back; it requires an explicit compatibility release decision.

---

### ESA-07 — Boundary Gate, Verification, Documentation, and Release

**Intent**

Make the new architecture durable and prove the packed product still works.

**Boundary checker**

Add a focused checker, not a global clean-architecture rewrite:

```text
scripts/check-state-boundaries.ts
```

Rules:

1. `src/core/state/**`, `src/core/workflow/**`, and `src/core/capabilities/**` cannot import Node filesystem/path/process execution, Commander, or MCP SDK.
2. CLI/MCP/hook adapters cannot define the canonical artifact parsers, capability validator, or workflow profile resolver.
3. There is one canonical capability-registry source implementation.
4. Generated helper projections carry a source hash and fail on drift.
5. A temporary adapter-path re-export is forbidden at Sprint close.

Wire the checker into `check:ci`.

**Required verification**

```bash
bun run check:type
bun test tests/effective-state.test.ts
bun test tests/state
bun test tests/capabilities
bun test tests/mcp
bun test
bun run check:hooks
bun run check:helpers
bun run check:task-workflow
bun run check:architecture-sync
bun run check:ci
bun run check:release
```

Also run:

- clean `npm pack`/tarball smoke;
- fresh CLI state resolution from the packed artifact;
- hook runtime smoke from projected assets;
- MCP state-summary parity smoke;
- adopted-repository standalone capability-helper smoke;
- repeated resolution benchmark.

**Documentation**

Update:

```text
docs/architecture/effective-state-authority.md
docs/architecture/mcp.md or the current MCP architecture guide
docs/CHANGELOG.md
tasks/notes/effective-state-authority-convergence.notes.md
```

Document:

- authority versus projection;
- core/effects/adapter dependency direction;
- Effective State v1 contract;
- CLI exit semantics;
- MCP compact state projection;
- helper source/projection ownership;
- writer compatibility/version gate;
- known limitations and next Sprint.

**Acceptance**

- Boundary checker reports zero violations.
- All required verification commands pass from a clean checkout.
- Packed artifact smoke passes without source-tree imports.
- Benchmark p95 stays within the agreed budget.
- Changelog and migration/release note match actual shipped behavior.
- Task notes contain commands, exit codes, fixture revisions, and any accepted deviations.
- No old/new dual resolver remains.

## Day-by-day Execution Plan

### Day 1 — Freeze authority and behavior

- Land ESA-01 characterization fixtures.
- Record baseline JSON/exit codes and benchmark.
- Approve invariants and release decision criteria.
- Output: ADR, fixtures, benchmark note.

### Day 2 — Move pure contracts and workflow policy

- Land ESA-02.
- Establish `EffectiveStateV1`.
- Update imports without behavioral edits.
- Output: core types/profile modules and protocol tests.

### Day 3 — Extract artifact parsers and input model

- Begin ESA-03.
- Move pure parsing functions.
- Build `EffectiveStateInputs` fixtures.
- Output: parser tests and pure input bundles.

### Day 4 — Build pure Effective State projector

- Complete phase/blocker/freshness/risk projection.
- Run old/new differential tests against every fixture.
- Output: pure projector with branch-complete matrix.

### Day 5 — Extract lock/version/cache and stabilize resolver

- Complete effect modules and stability loop.
- Run linked-worktree, lock, cache, source-mutation, and fault tests.
- Mid-Sprint gate: no adapter cutover until differential parity is exact.

### Day 6 — Single-source capability registry

- Land ESA-04.
- Update helper projection tooling.
- Run clean packed/adopted helper smoke.
- Output: canonical registry module and deterministic projection.

### Day 7 — CLI and hook cutover

- Land CLI outcome function and compatibility hook projection.
- Preserve exit codes and JSON.
- Output: thin CLI/hook adapters and parity tests.

### Day 8 — MCP state cutover

- Move state tool handler.
- Replace `tasks/current.md` summary authority.
- Complete full adapter parity matrix.
- Output: canonical MCP compact state.

### Day 9 — Workflow writer hardening or contingency buffer

Two-engineer plan:

- Complete ESA-06 atomic/guarded writer and concurrency/fault tests.

Single-engineer plan:

- Use Day 9 for state/capability hardening and defer ESA-06 intact.

### Day 10 — Boundary/release gate and handoff

- Land ESA-07.
- Run full test, CI, release, tarball, hook, MCP, and helper smokes.
- Update architecture/changelog/task notes.
- Produce review package and rollback notes.

## Parallel Ownership Plan

For two engineers:

| Owner | Primary stream | Secondary review |
|---|---|---|
| Engineer A | ESA-01, ESA-02, ESA-03, CLI/hook portion of ESA-05 | Capability projection and writer API |
| Engineer B | ESA-04, MCP portion of ESA-05, ESA-06, boundary tooling | State effects/concurrency tests |
| Both | ESA-07, differential review, release gate | Cross-adapter parity |

Working agreements:

- Work in progress limit: two production PRs.
- Characterization PR lands first.
- No PR mixes mechanical movement with intentional semantic change.
- Every semantic change has an explicit release note and new acceptance scenario.
- Reviews focus first on authority, fail-closed behavior, and rollback—not LOC reduction.

## PR Sequence

1. **PR 1 — Characterization only**  
   ADR, fixtures, golden CLI/state outputs, benchmark. No production behavior change.

2. **PR 2 — Pure contracts and workflow policy**  
   Move types/profile with exact behavior.

3. **PR 3 — Effective State core/effects split**  
   Pure parsers/projector plus lock/version/cache/collector; retain existing public export until cutover.

4. **PR 4 — Capability registry single source**  
   Canonical rules and standalone projection pipeline.

5. **PR 5 — Adapter cutover and parity**  
   CLI, hook, MCP call the shared resolver; delete old authority implementation in the same PR.

6. **PR 6 — Guarded workflow writer**  
   Independent, bounded mutation hardening; may be deferred for one-engineer capacity.

7. **PR 7 — Boundary/release closeout**  
   CI gate, docs, changelog, task notes, package smoke.

PR rules:

- Prefer fewer than 500 effective changed lines per PR; split PR 3 by pure/effects only when both halves remain reviewable and no dual steady-state authority is merged.
- Temporary re-exports are removed before their PR merges.
- Feature flags may not preserve two independent state algorithms.
- Generated files are reviewed separately from canonical source.
- Every PR records targeted checks and the full check required before final merge.

## Quality and Outcome Metrics

### Architectural metrics

- `src/cli/hook/state-snapshot.ts`: target ≤200 logical lines and ≥75% responsibility reduction.
- Canonical workflow profile implementations: exactly 1.
- Canonical capability registry parse/validate/match implementations: exactly 1 handwritten source.
- Adapters independently parsing state authority: 0.
- MCP state summary reads of `tasks/current.md` as authority: 0.
- Long-lived old-path compatibility re-exports: 0.
- New boundary violations: 0.

### Behavioral metrics

- Golden fixture drift: 0 unapproved differences.
- CLI command/tool name changes: 0.
- Effective State protocol version changes: 0.
- Adapter parity fixture failures: 0.
- Lost-update concurrency tests: 0 silent overwrites in guarded mode.
- Partial-file fault tests: 0.
- State resolver p95 regression: ≤10%.
- Full CI/release/package smoke failures at close: 0.

### Test targets

- Pure workflow profile/projector/registry branch coverage: target 95%+, with 100% coverage of fail-closed branches and risk-floor transitions.
- Every canonical error/reason has at least one fixture.
- Multi-process tests cover real lock contention, not only mocked locks.
- At least one linked-worktree integration test verifies version ownership.
- At least one differential test compares old baseline fixture output to the new resolver.

## Definition of Done

This Sprint is complete only when:

- [ ] Effective State public behavior is frozen by characterization fixtures.
- [ ] Workflow profile policy and state DTOs are no longer adapter-owned.
- [ ] Effective State resolution is split into pure projection and explicit effects.
- [ ] Cache remains a non-authoritative read model.
- [ ] State lock, monotonic version, linked-worktree, and source-stability behavior are preserved.
- [ ] Capability registry rules have one canonical source and downstream helper projection is deterministic.
- [ ] CLI, hook, and MCP use the shared resolver.
- [ ] MCP state summary no longer treats `tasks/current.md` as authority.
- [ ] Adapter parity tests cover all authority-sensitive fields.
- [ ] CLI JSON protocol and exit semantics remain compatible.
- [ ] The bounded workflow writer is atomic and revision-aware, or ESA-06 is explicitly deferred without weakening state convergence.
- [ ] Boundary checks are part of CI.
- [ ] Full test/check/release/tarball smoke passes from a clean checkout.
- [ ] Architecture docs, changelog, task notes, and release compatibility notes are complete.
- [ ] No dual resolver, manual shadow validator, or temporary re-export remains.

## Rollback Strategy

- Each PR is independently revertible by layer.
- Keep Effective State protocol `1` and existing cache/version paths, so no data migration is required.
- A failed MCP cutover is reverted at the adapter PR; do not add an alternate resolver toggle.
- A failed helper projection is reverted as canonical source plus generated artifact together.
- A writer precondition already released as mandatory is not silently relaxed; compatibility requires an explicit release decision.
- If performance exceeds the budget, first eliminate repeated source reads by collecting an immutable input bundle; do not reintroduce cache-as-authority.
- Record rollback commands and affected artifact revisions in Sprint task notes.

## Deferred Follow-up Sprints

### Sprint 2 — Mutation Kernel Convergence

Unify typed mutation result/error and guarded write semantics across:

- MCP workflow writer;
- coding tools;
- general repo access;
- adoption transactions;
- source projection.

Split large mutation/read/router modules only along tested capability seams. Design append semantics separately.

### Sprint 3 — Capability Surface and Skill Discovery

After execution authority is stable:

- define a lightweight capability metadata catalog;
- generate compatible CLI help, MCP schema fragments, and Skill capability references where useful;
- classify current Skill packages into canonical workflow skills, domain skills, and host command facades;
- remove only duplicate trigger/prose surfaces, not legitimate workflow/domain knowledge.

This order is intentional: first establish one capability implementation and one state authority; only then optimize how capabilities are exposed and discovered.

## Execution Log

| When | Task | Plan | Result |
|---|---|---|---|
| pending | ESA-01 | pending | pending |
| 2026-07-15 15:26 | `ESA-02` — Extract workflow policy and Effective State v1 contracts | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` | done |
| 2026-07-15 15:26 | `ESA-03` — Split Effective State read → project → persist pipeline | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` | done |
| 2026-07-15 15:26 | `ESA-04` — Single-source capability-registry validation and matching | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` | done |
| 2026-07-15 15:26 | `ESA-05` — Converge CLI, hook, and MCP state adapters | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` | done |
| 2026-07-15 15:26 | `ESA-07` — Enforce boundaries, package/release verification, and documentation | `plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md` | done |
