# Plan: ME-0A Engineer Profile and Shared Binding

> **Status**: Archived
> **Created**: 20260824-2126
> **Slug**: me0a-engineer-profile-binding
> **Planning Source**: codex-plan
> **Orchestration Kind**: user-approved-plan
> **Source Ref**: plans/prds/20260824-1653-engineer-profile-binding-projection.prd.md
> **Artifact Level**: work-package
> **Promotion Reason**: rollback_boundary
> **Verification Boundary**: Closed schema fixtures, real linked-worktree race/crash tests, CLI/token-budget tests, full repository checks, and independent acceptance on the exact final diff.
> **Rollback Surface**: Revert the isolated ME-0A core/effects/CLI/canary/architecture patch; the new engineers/v1 store has no migration into existing Task, Lease, Publication, or Acceptance authorities.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md`
> **Task Review**: `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md`
> **Implementation Notes**: `tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: plans/prds/20260824-1653-engineer-profile-binding-projection.prd.md
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260824-2126-me0a-engineer-profile-binding.md`
- Sprint contract: `tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md`
- Sprint review: `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md`
- Implementation notes: `tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260824-2126-me0a-engineer-profile-binding.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260824-2126-me0a-engineer-profile-binding.md`.

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
- Contract file: `tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md`
- Review file: `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md`
- Implementation notes file: `tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260824-2126-me0a-engineer-profile-binding.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Revert the isolated ME-0A core/effects/CLI/canary/architecture patch; the new engineers/v1 store has no migration into existing Task, Lease, Publication, or Acceptance authorities.
- **Verification boundary**: Closed schema fixtures, real linked-worktree race/crash tests, CLI/token-budget tests, full repository checks, and independent acceptance on the exact final diff.
- **Review/acceptance boundary**: `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: rollback_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260824-2126-me0a-engineer-profile-binding.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260824-2126-me0a-engineer-profile-binding.contract.md`, `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md`, and `tasks/notes/20260824-2126-me0a-engineer-profile-binding.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260824-2126-me0a-engineer-profile-binding.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Revert the isolated ME-0A core/effects/CLI/canary/architecture patch; the new engineers/v1 store has no migration into existing Task, Lease, Publication, or Acceptance authorities.

## Captured Planning Output

> **Task Profile**: code-change
> **Capability ID**: runtime-harness-engineer-bindings
> **Execution Surface**: contract-worktree

## Goal

Implement the externally Approved ME-0A slice: capability-backed Module Engineer Profile/SOP records, a crash-consistent Git-common-directory binding event/current store, operator-only CLI/read projection, bounded bootstrap prompts, and two tracked canary Engineers. No Session-authenticated mutation or task authority is introduced.

## Success Criteria

- Exact-key validators and canonical bytes exist for `ModuleEngineerProfileV1`, `EngineerBindingV1`, `EngineerBindingEventV1`, and `EngineerBindingCurrentV1`; stale or extra fields and stale digests fail closed.
- `engineer_contract_revision` changes when canonical Profile bytes, SOP bytes, or the validated canonical capability record changes, and Profile fields cannot copy capability paths, entrypoints, checks, or interfaces.
- All linked worktrees resolve one `<git-common-dir>/repo-harness/engineers/v1/` authority; generation-0 genesis is distinct from events plus missing/corrupt current.
- An N-way bind race produces exactly one generation-1 current binding and one immutable winning event; losers receive typed stale refusal.
- Same key plus same semantic request resumes byte-identically; same key plus different request returns `idempotency_conflict`; crash before event, after durable event/before current, and after durable current/before response each have one result.
- `profile list/show`, `binding bind/status/retire`, and `bootstrap-prompt` are local operator CLI surfaces only; bootstrap output contains no credential, Claim, Lease, Publication, or Acceptance authority and stays within the ME-0A 400-token target.
- Binding rotation changes no coordination Lease bytes.
- Two tracked canary Profile/SOP pairs validate against `capability.verification.evals-checks` and `capability.workflow-engine.contract-assets`.

## Scope

- Add a dedicated runtime-harness Engineer Bindings capability node, component relation, architecture module, and durable ME-0A workstream so new source prefixes have one owner; keep the one-line `src/cli/index.ts` registration under its existing global-runtime capability.
- Add `src/core/engineers/profile-binding.ts` for closed schemas, validation, canonicalization, digests, transition/current builders, and typed error vocabulary.
- Add `src/effects/engineers/profile-store.ts` to load tracked Profile/SOP files, read ArchContext nodes, reuse `capabilityRegistryFromArchcontextNodes`, select the exact capability record, and derive the transitive contract revision.
- Add `src/effects/engineers/binding-store.ts` for safe Git-common-directory paths, per-engineer exclusive lock, exact state classification, immutable event create-if-absent, durable current publication, explicit idempotent recovery, and read-only status.
- Add `src/cli/commands/engineer.ts` and register `engineer` in `src/cli/index.ts`; expose only the Approved operator commands.
- Add the two canary JSON Profiles and Markdown SOPs under `agents/engineers/`.
- Add focused core, effects/concurrency/crash, and CLI tests plus the workflow artifacts required by this work-package.

## Non-scope

- No `EngineerPrincipal`, authenticated per-Session carrier, Session-originated mutation, `ClaimActorReceipt`, or old-Thread technical fencing.
- No Task, Lease, WorkEnvelope, Publication, Acceptance, Fleet column, or Human Board schema change.
- No delegation, messaging, Worker Host, writable grant, Provider Session create/send/stop, active-task handoff, remote access, or GUI.
- No copied capability paths, entrypoints, interfaces, checks, or second Module Graph in Profile files.
- No time-based dangling-event scan, newest-event recovery, auto-promotion, semantic fallback, legacy wire shape, or best-effort reconstruction.

## P1: Architecture Map

- `src/core/engineers/profile-binding.ts` owns pure protocol values. It depends only on canonical JSON and the existing capability/identity primitives, never on filesystem or Provider APIs.
- `src/effects/engineers/profile-store.ts` owns tracked Profile/SOP and ArchContext reads. `.archcontext/model/nodes/*.yaml` remains sole capability authority; `capabilityRegistryFromArchcontextNodes` remains the only semantic parser.
- `src/effects/engineers/binding-store.ts` owns the shared mutable datum below the Git common directory. It reuses `resolveGitCommonDirectory`, `withExclusiveDirectoryLock`, durable file writes, `O_EXCL|O_NOFOLLOW`, rename and directory fsync precedents.
- `src/cli/commands/engineer.ts` converts local operator intent to typed core/effect calls and emits JSON/human projections. It is not an MCP or Session authorization boundary.
- `agents/engineers/profiles/*.json` and `agents/engineers/sops/*.md` are tracked behavior contracts; they reference but do not duplicate two existing capability nodes.
- Focused tests own protocol, store, linked-worktree, crash-injection, CLI and token-budget evidence. Existing coordination/publication code is read-only precedent and remains out of scope.
- Scale signal: the reused lock/store/CLI precedents span roughly 4,100 lines across seven principal files; ME-0A adds one isolated core module, two effect modules, one command module, four canary artifacts and three focused test files rather than extending the 902-line Fleet CLI or 1,070-line lease-store test.

## P2: Concrete Trace

`repo-harness engineer binding bind` parses an explicit `engineer_id`, stable `idempotency_key`, Provider/thread/host values and expected current fences. The Profile store requires the exact Profile and SOP paths to be members of the Git index, validates the selected full ArchContext node through the canonical schema and semantic parser, and derives `engineer_contract_revision`. The binding store hashes `engineer_id` into a safe path component, acquires the per-engineer lock, classifies genesis/current, validates expected digest/generation/binding/contract fences, and derives `transition_id` from protocol plus engineer plus key. If the event exists, only the same client-authored operation fingerprint may reuse its frozen binding ID/timestamps/revision and resume; a later server-derived Profile revision does not rewrite that immutable request. Otherwise it writes one immutable event with `O_EXCL|O_NOFOLLOW`, fsyncs the event and events directory, revalidates the exact current bytes, writes and fsyncs a temporary current, atomically renames it, fsyncs the engineer directory, and returns the published current. A retry after the current fsync recognizes the same transition/event and returns it without another event or generation. `status` always trusts `current.json` and its referenced event; absent current plus any event is corruption. `bootstrap-prompt` joins the validated Profile/SOP revision with read-only current status and refuses a stale binding revision instead of inventing compatible context.

Error paths are closed and typed: invalid Profile/schema, unsafe/symlink path, malformed or missing-current state, stale current/generation/binding/contract fence, idempotency conflict, and lock contention never synthesize a current state. The sync boundary is local filesystem publication under one lock; there is no Provider or network effect in ME-0A.

## P3: Design Decision

Use a new isolated Engineer Bindings subsystem instead of extending Fleet messages, Lease storage, Session context hooks, or Publication lifecycle. Those systems are useful precedents but own different authorities; sharing their state machines would merge identities the umbrella explicitly separates. Reuse the existing canonical JSON parser, capability semantic parser, Git common-dir resolver and exclusive lock primitive, while keeping new protocol and store ownership explicit.

The event file is made durable as both file contents and directory entry before current publication; current is then written temp+fsync+rename and its directory is fsynced. This is the smallest implementation that actually preserves the Approved event-before-current invariant across two directories. The extra event-directory fsync strengthens durability without changing the frozen wire protocol.

At 10x scale, Profile/node scanning and one directory per Engineer fail first, not lock correctness. Two canaries and bounded local lists make that acceptable in P0; do not add an index, database, cache authority, background repairer, or batch protocol without measured pressure.

## Closed Protocol Decisions

- Engineer path key: lowercase SHA-256 hex of exact UTF-8 `engineer_id`; user input never becomes a path component.
- Canonical digests use the existing `sha256:<64 lowercase hex>` shape and canonical JSON.
- Capability revision is the digest of the complete schema-valid selected ArchContext node; the canonical semantic parser remains the selection authority.
- Contract revision is the digest of a canonical object containing exact Profile canonical bytes, exact SOP UTF-8 bytes, and capability revision.
- “Tracked Profile/SOP” means exact Git-index membership; filesystem presence alone is rejected.
- First event creation freezes generated `binding_id`, binding timestamps, target contract revision and event `created_at`. The operation fingerprint covers client-authored request fields but excludes that server-derived target revision, so an exact retry can recover the frozen event after Profile evolution while a changed Provider/thread/host request still conflicts.
- Retire keeps generation N and the retired binding ID as current history; the next bind creates generation N+1. Bind against an active current is `replace` only when all expected current fences match; the replace event retires `previous_binding_id` at `created_at`, while older event snapshots remain state-at-event records.
- Genesis is a synthesized generation-0 unbound projection with no persisted current/event. Any persisted event requires a valid current.
- Core error codes: `engineer_profile_invalid`, `engineer_binding_invalid`, `binding_state_corrupt`, `binding_stale`, `idempotency_conflict`, `binding_lock_timeout`, `unsafe_engineer_path`.
- Test-only crash hooks may stop at the three Approved publication boundaries but cannot alter production transition semantics. Engineer acquisition also opts into stale empty-directory recovery so a process death between lock-directory creation and owner-token publication cannot wedge the Engineer forever; the shared lock primitive remains fail-closed by default for all other callers.

## File Changes

| Path | Action | Responsibility |
|---|---|---|
| `.archcontext/model/nodes/capability.runtime-harness.engineer-bindings.yaml` | add | stable capability/source ownership |
| `.archcontext/model/nodes/component.engineer-bindings.primary.yaml` | add | semantic component and store relation |
| `.archcontext/model/relations/relation.engineer-bindings.primary.yaml` | add | declared capability-to-store call relation required by P1 proof |
| `.archcontext/model/flows/flow.engineer-bindings.primary.yaml` | add | declared operator-to-store success/error flow required by P2 proof |
| `docs/architecture/modules/runtime-harness/engineer-bindings.md` | generate/amend | P1/P2/P3 human architecture entrypoint |
| `docs/architecture/modules/workflow-engine/contract-assets.md` | regenerate | deterministic projection of the ArchContext-node source-set size bucket |
| `tasks/workstreams/runtime-harness/engineer-bindings/me0a-profile-binding.md` | add | durable capability progress |
| `src/core/engineers/profile-binding.ts` | add | exact schemas and pure transitions |
| `src/effects/engineers/profile-store.ts` | add | Profile/SOP/capability validation and revision |
| `src/effects/engineers/binding-store.ts` | add | shared event/current authority |
| `src/effects/locking/exclusive-directory-lock.ts` | amend | opt-in stale ownerless-lock recovery with inode/emptiness fencing |
| `src/cli/commands/engineer.ts` | add | operator commands and projections |
| `src/cli/index.ts` | amend | register the `engineer` command only |
| `agents/engineers/profiles/*.json` | add two | canary Profiles |
| `agents/engineers/sops/*.md` | add two | canary SOPs |
| `tests/unit/engineer-profile-binding-v1.test.ts` | add | schema/digest/transition contract |
| `tests/unit/engineer-binding-store.test.ts` | add | store/race/crash/linked-worktree contract |
| `tests/cli/engineer.test.ts` | add | public CLI and budget surface |
| `tests/capability-archcontext-export.test.ts` | amend | self-host capability count after adding Engineer Bindings |
| `tests/architecture-projection-e2e.test.ts` | amend | deterministic capability/module/target projection counts |
| plan/contract/review/notes/current workflow artifacts | amend | execution and acceptance evidence |

## Fragile Assumptions and Cheapest Falsifiers

- Bun YAML plus `capabilityRegistryFromArchcontextNodes` produces the same selected capability record as `scripts/capability-resolver.ts`; falsify first with a parity fixture for both canary IDs before building the store.
- A durable event needs an events-directory fsync before a current in the parent directory can safely reference it; falsify with injected crash/reopen fixtures, not timing sleeps.
- Commander can keep retry identity explicit without exposing generated binding IDs/timestamps as required user flags; falsify with a lost-response CLI retry fixture using only the same idempotency key and semantic options.
- Linked worktrees share the same resolved Git common directory; reuse the repository's real linked-worktree fixture rather than mocking this claim.

## Verification

- `bun test tests/unit/engineer-profile-binding-v1.test.ts tests/unit/engineer-binding-store.test.ts tests/cli/engineer.test.ts --timeout 60000`
- `bun run check:type`
- `bun test --timeout 60000`
- `bash scripts/check-deploy-sql-order.sh`
- `bash scripts/check-architecture-sync.sh`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bun src/cli/index.ts init --repo . --dry-run`
- Byte-compare Lease coordination root before/after bind/retire fixtures.
- Independently review the exact final diff and record the AcceptanceReceipt required by the contract workflow before closeout.

## Rollback and Failure Handling

Revert the single ME-0A implementation unit: new Engineer capability/model/docs, core/effects/CLI modules, canary artifacts, tests and workflow records. The store is versioned under a previously nonexistent `engineers/v1` root; rollback never migrates or rewrites Lease/Task/Publication data. Failed writes leave either no event, a validated dangling event that only the same request can resume, or an already-published current. No cleanup command is added in ME-0A.

## Task Breakdown

- [x] Freeze the ME-0A contract, exact allowed paths, architecture capability and parity falsifier.
- [x] Implement and test Profile/Binding schemas, canonical digests and transitive contract revision.
- [x] Implement and test shared store classification, lock/CAS publication, idempotency and all crash/race fixtures.
- [x] Implement and test operator CLI, bootstrap projection and two canary Profile/SOP pairs.
- [ ] Run focused/full verification, complete independent review/acceptance evidence, and close the contract worktree.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Freeze the ME-0A contract, exact allowed paths, architecture capability and parity falsifier.
- [x] Implement and test Profile/Binding schemas, canonical digests and transitive contract revision.
- [x] Implement and test shared store classification, lock/CAS publication, idempotency and all crash/race fixtures.
- [x] Implement and test operator CLI, bootstrap projection and two canary Profile/SOP pairs.
- [ ] Run focused/full verification, complete independent review/acceptance evidence, and close the contract worktree.
