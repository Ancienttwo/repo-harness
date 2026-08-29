# Plan: C0 collaboration/delivery two-plane authority freeze

> **Status**: Executing
> **Created**: 20260829-1853
> **Slug**: c0-two-plane-authority-freeze
> **Planning Source**: repo-harness-sprint
> **Orchestration Kind**: host-plan
> **Source Ref**: plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#C0
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Architecture request accepted; freeze record complete with admission decision table and baseline negative proof; baseline authority-enumeration contract test green; zero diff under src/
> **Rollback Surface**: Single revertable commit touching plans/, docs/architecture/requests/, docs/researches/, tasks/workstreams/, tasks/, and one new test file; no runtime code to roll back
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md`
> **Task Review**: `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md`
> **Implementation Notes**: `tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-sprint planning output.
- Source ref: plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#C0
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260829-1853-c0-two-plane-authority-freeze.md`
- Sprint contract: `tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md`
- Sprint review: `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md`
- Implementation notes: `tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260829-1853-c0-two-plane-authority-freeze.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260829-1853-c0-two-plane-authority-freeze.md`.

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
- Contract file: `tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md`
- Review file: `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md`
- Implementation notes file: `tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260829-1853-c0-two-plane-authority-freeze.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single revertable commit touching plans/, docs/architecture/requests/, docs/researches/, tasks/workstreams/, tasks/, and one new test file; no runtime code to roll back
- **Verification boundary**: Architecture request accepted; freeze record complete with admission decision table and baseline negative proof; baseline authority-enumeration contract test green; zero diff under src/
- **Review/acceptance boundary**: `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260829-1853-c0-two-plane-authority-freeze.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260829-1853-c0-two-plane-authority-freeze.contract.md`, `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md`, and `tasks/notes/20260829-1853-c0-two-plane-authority-freeze.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260829-1853-c0-two-plane-authority-freeze.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single revertable commit touching plans/, docs/architecture/requests/, docs/researches/, tasks/workstreams/, tasks/, and one new test file; no runtime code to roll back

## Captured Planning Output

# Goal

Freeze the collaboration/delivery two-plane authority boundary for
`capability.runtime-harness.collaboration` before any collaboration runtime code
exists. C0 is sprint row 1 of
`plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
and belongs entirely to Child PRD A
(`plans/prds/20260828-2321-collaboration-substrate.prd.md`).

C0 changes no runtime behavior. It produces an accepted architecture request for
the new capability, a durable freeze record, a durable capability workstream, and
one baseline contract test that only enumerates and asserts the existing
Task / Lease / Publication / Acceptance authority protocol versions and bytes.
Every downstream row (C1–C9) reads its frozen decisions from the freeze record
instead of re-deriving them.

## Context (P1 map / P2 trace, verified 2026-08-29 at main@a490a5ef)

### P1 — real components on the delivery plane

- Delivery authorities that must stay byte-identical:
  - Lease / coordination: `src/core/state/coordination-identity.ts:34`
    (`COORDINATION_PROTOCOL = 1`), `src/effects/state/coordination-lease-store.ts`,
    store root `repo-harness/coordination/v1`.
  - Task/Claim actor: `src/core/engineers/principal-claim.ts:7`
    (`ENGINEER_PRINCIPAL_PROTOCOL = 1`), receipt root
    `repo-harness/engineers/v1/claim-actors`.
  - Task offers / fleet board: `src/core/fleet/task-offer.ts:12,14`
    (`TASK_OFFER_PROTOCOL = 1`, `FLEET_OFFERS_PROTOCOL = 1`),
    `src/core/fleet/board.ts:8` (`FLEET_BOARD_PROTOCOL = 2`).
  - Publication: `src/core/publication/publication-receipt.ts:6`,
    `src/core/publication/publication-lifecycle.ts:14,16`,
    `src/core/publication/merge-readiness.ts:4`, store root
    `repo-harness/publications/v1`.
  - Acceptance: `src/core/integration/product-acceptance.ts:7`
    (`INTEGRATION_CONTRACT_PROTOCOL = 1`), evidence root
    `repo-harness/integration/v1`.
- Delegation plane the collaboration layer reuses without bumping:
  `src/core/engineers/delegation.ts:19` (`DELEGATION_PROTOCOL = 1`),
  `src/effects/engineers/delegated-run-store.ts`, store root
  `repo-harness/delegated-runs/v1`.
- Shared record mechanics every new protocol must reuse:
  `src/core/messages/mechanics.ts` (`assertMessageExactKeys`,
  `canonicalMessageBytes`, `canonicalMessageDigest`, `messageSha256`).
- Untrusted-injection precedent: `src/core/fleet/task-message.ts:17,19`
  (`[TaskInboxUntrustedPeerMessages]`) and
  `src/core/engineers/module-message.ts:21,23`
  (`[ModuleInboxUntrustedPeerMessage]`).
- Operator write surface: `src/effects/operator/server.ts:534-540` — POST is
  rejected for every path except the single task-message route.
- Out of scope for C0: every file under `src/` (no behavior change), the five
  program plan files, Review / Verification / Merge surfaces.

### P2 — traced paths

1. Work Graph -> `EngineerOfferV1`: `src/core/engineers/scheduling.ts:3,5`
   defines `WORK_GRAPH_PROTOCOL` and `ENGINEER_OFFER_PROTOCOL`; the offer carries
   its own `offer_revision`, which C6 must project verbatim.
2. `DelegationEnvelopeV1` -> `WorkerRunRefV1` -> `WorkerResultV1`:
   `admitReadOnlyDelegation()` (`src/effects/engineers/delegated-run-store.ts:692`)
   takes `AdmitReadOnlyDelegationInput` (`:149-160`), whose members are
   `repo_root`, `envelope`, `role_profile`, `capability`, `execution_packet`,
   `work_envelope`, `claim_actor_receipt`, `decided_at`, `validate_parent`.
   `ModuleEngineerProfileV1` is not among them, so `delegation_policy` is not
   read at admission time. `prepareDelegatedRun()` (`:731`) rejects when
   `envelope.execution_packet_sha256 !== input.context_packet_sha256`;
   `intentForDispatch()` (`:791`) rejects when
   `packet.packet_sha256 !== intent.context_packet_sha256`.
   `collectDelegatedRunResult()` (`:911`, input shape `:182-186`) builds exactly
   one immutable `WorkerResultV1` from persisted process-receipt evidence.
3. `TaskFreezeReceiptV1` -> release/takeover/acquire:
   `src/core/engineers/task-freeze.ts:3` (`TASK_FREEZE_PROTOCOL = 1`),
   `src/effects/engineers/task-freeze-store.ts` (freeze root
   `repo-harness/engineers/v1/task-freezes`) validates binding liveness and live
   Lease bytes before writing. It carries no successor field; execution transfer
   stays on `sprint release` / `fleet takeover` / `fleet acquire`.
4. Task/Module Message -> untrusted injection rendering: both message protocols
   cap the body at 8 KiB and wrap injected content in a fixed start/end marker
   pair with fixed warning copy. The collaboration packet adds a third marker
   pair and reuses that trust model unchanged.

### Baseline negative proof (recorded, not asserted as runtime behavior)

`rg -n 'delegation_policy|allowed_roles|max_parallel_readers' src/` returns hits
only in `src/core/engineers/profile-binding.ts` (`:39-44` type, `:241`, `:254-265`
exact-key validation, `:281-285` freeze). Zero hits in
`src/effects/engineers/delegated-run-store.ts` and zero hits anywhere on the
admission path. `max_parallel_readers` is a declared profile value today with no
admission-time enforcement. Real runtime rejection is produced by the C4 bridge;
C0 asserts no runtime rejection.

## Frozen decisions (P3)

1. **Two-plane boundary.** `CoordinationSignalV1`, `WorkStateHandoffV1`,
   `HandoffAdoptionReceiptV1`, participants and every projection derived from
   them hold zero Task, Lease, Publication or Acceptance authority. The
   collaboration plane never writes those stores. Adoption is non-exclusive and
   creates no Claim.
2. **`DelegatedRunIntentV1.context_packet_sha256` keeps ExecutionPacket
   semantics.** The two assertions at `delegated-run-store.ts:731` and `:791`
   stay unchanged. Collaboration provenance is additive only.
3. **`CollaborationRunContextBindingV1` is an additive record, not a protocol
   bump.** `DelegationEnvelopeV1` / `DELEGATION_PROTOCOL` stay at 1. From C6 the
   binding is a required dispatch gate for collaboration-mode delegated runs:
   missing or stale binding fails closed. It is not optional audit metadata.
4. **P0 actor support matrix.** `module_engineer` Supported (Binding + Principal
   are server-verifiable). `delegated_worker` Supported (`WorkerRunRefV1` +
   `DelegationAdmissionReceiptV1` give immutable run provenance).
   `human_operator` Deferred (no independent local-operator principal).
   `native_subagent` Unsupported (Host has no immutable run provenance). Deferred
   and Unsupported do not enter the wire union and get no placeholder branch.
5. **Delegation policy bridge design.** `CollaborationDelegationAdmissionV1`
   runs strictly before `admitReadOnlyDelegation()` and does not change its
   semantics: resolve profile/binding/principal from the parent
   `ClaimActorReceipt`, load the tracked `LogicalRoleProfile` and check it is
   allowed for collaboration, count active readers under a lock keyed by parent
   claim + `round_index`, enforce `active_readers < max_parallel_readers`, then
   delegate. Over-limit or unavailable role is a typed rejection that never
   reaches the existing admission.
6. **Admission decision table (model-layer freeze, `max_parallel_readers = 3`).**

   | # | Observed active readers | Reader state | Decision |
   |---|---|---|---|
   | A1 | 0 | all known-current | admit |
   | A2 | 1 | all known-current | admit |
   | A3 | 2 | all known-current | admit |
   | A4 | 3 | all known-current | reject (`max_parallel_readers_exceeded`) |
   | A5 | any | at least one reader observation stale | reject (fail closed) |
   | A6 | any | at least one reader state unknown/unreadable | reject (fail closed) |
   | A7 | any | `reconciliation_required` reader present | reject (fail closed) |
   | A8 | 3 with one reader completed and released | admit after release |
   | A9 | 3 with one reader failed and released | admit after release |

   Fail closed means: no seat is inferred as free, no healthy-empty fallback, and
   the count is never rounded down when a reader's state cannot be established.
   C0 freezes the table only; C4 owns the real runtime canary.
7. **`ArtifactRefV1` reuses `WorkerResultV1.evidence_refs`.** Same `{ ref, sha256 }`
   shape and the same validator. No second equivalent reference type.
8. **Store roots, lock strategy, canonical JSON.** Root
   `<git-common-dir>/repo-harness/collaboration/v1/` with subdirectories
   `signals/`, `handoffs/`, `adoptions/`, `context-packets/`,
   `contribution-commits/`, `run-context-bindings/`. This matches the existing
   convention (`repo-harness/<domain>/v1`) used by coordination, publications,
   integration, delegated-runs and engineers. Locking uses the existing
   `src/effects/locking/exclusive-directory-lock.ts` primitive, per-thread for
   signals and per-handoff for handoffs. Canonical JSON and digests reuse
   `src/core/messages/mechanics.ts`; no new serializer. Every store does
   lstat ancestor walks rejecting symlink and non-directory ancestors, immutable
   create plus fsync, exact protocol validation, explicit idempotency conflict,
   no path escape, and no healthy-empty fallback.
9. **Feature flags and degradation.** Program flags are
   `collaboration.mode = "off"`, `independent_review.mode = "off"`,
   `guarded_merge.mode = "disabled"`, `program_automation.mode = "disabled"`.
   Promotion is `off -> shadow -> active` with no skipped state. Degradation:
   collection-time change marks `changed_during_read`, unreadable shard marks
   `degraded`, and a non-`stable` `snapshot_consistency` makes consumers fail
   loud. C0 records these values; wiring them into any config surface belongs to
   C1 and later, so C0 leaves `.ai/harness/policy.json` untouched.
10. **No persistent multi-seat in P0.** One capability keeps one persistent
    Module Engineer and one writer. `EngineerSeatV2` is refused for P0 and can
    only be reconsidered through the C9-B repeated-evidence gate.
11. **Review and Merge are zero-change in this sprint.** No file under the
    Review, Verification or Merge surfaces is touched by C0–C9; Phase 2 and
    Phase 3 rows stay deferred and unassigned.

## Scope

Allowed surfaces for this work package:

- `plans/plan-*-c0-two-plane-authority-freeze.md` (this plan) and its contract,
  review and notes artifacts.
- `docs/architecture/requests/runtime-harness-collaboration.md` — the architecture
  request for the new capability, created through
  `scripts/architecture-event.ts` and resolved through
  `repo-harness run archive-architecture-request`.
- `docs/researches/*-collaboration-two-plane-authority-freeze.md` — the durable
  freeze record carrying P1/P2/P3, the decision table and the negative proof.
- `tasks/workstreams/runtime-harness/collaboration/` — durable capability
  workstream ledger.
- `tests/unit/collaboration-authority-baseline.test.ts` — the baseline contract
  test.
- `tasks/current.md` via `repo-harness run refresh-current-status --write`.

Forbidden: any change under `src/`; any edit to the five program plan files
(`plans/sprints/20260828-2321-*.sprint.md` and the four
`plans/prds/20260828-2321-*.prd.md`); `.ai/harness/policy.json`;
`.archcontext/model/nodes/*` (the capability node lands with C1's real source
files); anything not traceable to the task breakdown below.

## Oracles

- `bun test tests/unit/collaboration-authority-baseline.test.ts --timeout 60000`
- `bun test --timeout 60000`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bash scripts/check-task-sync.sh`
- `repo-harness run check-task-workflow --strict`
- `bash scripts/check-architecture-sync.sh`
- `git diff --name-only <base>..HEAD -- src/` prints nothing (no runtime change)

## Task Breakdown

- [ ] Record the baseline commit and the authority protocol inventory in the freeze research doc, including the verified `delegation_policy` negative proof.
- [ ] Create and accept the architecture request for `capability.runtime-harness.collaboration` under `docs/architecture/requests/`, then resolve it with the freeze artifacts.
- [ ] Write the durable freeze record under `docs/researches/` carrying P1 map, the four P2 traces, and frozen decisions 1-11 including the admission decision table and test vectors.
- [ ] Ensure the durable capability workstream ledger under `tasks/workstreams/runtime-harness/collaboration/`.
- [ ] Add `tests/unit/collaboration-authority-baseline.test.ts` asserting the enumerated authority protocol versions and the byte digests of the authority source files, with zero runtime behavior change.
- [ ] Run every oracle, refresh `tasks/current.md`, and confirm `src/` is untouched.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Record the baseline commit and the authority protocol inventory in the freeze research doc, including the verified `delegation_policy` negative proof.
- [ ] Create and accept the architecture request for `capability.runtime-harness.collaboration` under `docs/architecture/requests/`, then resolve it with the freeze artifacts.
- [ ] Write the durable freeze record under `docs/researches/` carrying P1 map, the four P2 traces, and frozen decisions 1-11 including the admission decision table and test vectors.
- [ ] Ensure the durable capability workstream ledger under `tasks/workstreams/runtime-harness/collaboration/`.
- [ ] Add `tests/unit/collaboration-authority-baseline.test.ts` asserting the enumerated authority protocol versions and the byte digests of the authority source files, with zero runtime behavior change.
- [ ] Run every oracle, refresh `tasks/current.md`, and confirm `src/` is untouched.
