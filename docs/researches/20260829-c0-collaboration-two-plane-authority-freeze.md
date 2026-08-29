# C0 — Collaboration / Delivery Two-Plane Authority Freeze

> **Last Updated**: 2026-08-30
> **Scope**: `capability.runtime-harness.collaboration` boundary against the existing Task / Lease / Publication / Acceptance delivery authorities
> **Baseline**: `main@a490a5ef76b439228a4b3282934c29ba15090cdf`
> **Sprint row**: C0 of `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`
> **Source PRD**: `plans/prds/20260828-2321-collaboration-substrate.prd.md` (Child A)
> **Architecture request**: `docs/architecture/requests/archive/2026/runtime-harness-collaboration.md` (Resolved)
> **Durable ledger**: `tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md` (moved out of this document by C1)
> **Machine guard**: `tests/unit/collaboration-authority-baseline.test.ts`
> **Usage**: This is the frozen record C1–C9 read from. Do not re-derive these decisions per row; supersede this document instead of silently editing it.

C0 changes no runtime behavior. It fixes the boundary between the collaboration
plane and the delivery plane before any collaboration store exists, so that every
later row inherits a decided boundary instead of negotiating one.

## Codebase Map

### Delivery-plane authorities (must stay byte-identical through C1–C9)

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/core/state/coordination-identity.ts` | Lease identity and the four-state machine | `COORDINATION_PROTOCOL = 1`, `LEASE_OWNER_KIND` |
| `src/effects/state/coordination-lease-store.ts` | Lease persistence | `COORDINATION_ROOT_RELATIVE_PATH = 'repo-harness/coordination/v1'` |
| `src/core/engineers/principal-claim.ts` | Engineer principal and Claim actor receipt | `ENGINEER_PRINCIPAL_PROTOCOL = 1`, `ENGINEER_PRINCIPAL_KIND`, `ENGINEER_PRINCIPAL_MAPPING_KIND`, `CLAIM_ACTOR_RECEIPT_KIND` |
| `src/core/engineers/scheduling.ts` | Work Graph and Engineer offers | `WORK_GRAPH_PROTOCOL = 1`, `ENGINEER_OFFER_PROTOCOL = 1`, `WORK_GRAPH_KIND`, `ENGINEER_OFFER_KIND`, `ENGINEER_OFFERS_KIND` |
| `src/core/state/project-board.ts` | Canonical board projection: task state, lease state, claim, offered actions; `classifyTaskOffer` reads its cards | `BOARD_PROTOCOL = 1` (no `*_KIND`; the document carries no wire envelope) |
| `src/core/fleet/task-offer.ts` | Task offers | `TASK_OFFER_PROTOCOL = 1`, `FLEET_OFFERS_PROTOCOL = 1`, `TASK_OFFER_KIND`, `FLEET_OFFERS_KIND` |
| `src/core/fleet/board.ts` | Fleet board read model | `FLEET_BOARD_PROTOCOL = 2`, `FLEET_BOARD_KIND` |
| `src/core/engineers/task-freeze.ts` | Exact bound-executor state freeze | `TASK_FREEZE_PROTOCOL = 1`, `TASK_FREEZE_KIND` |
| `src/core/publication/publication-receipt.ts` | Publication receipt | `PUBLICATION_RECEIPT_PROTOCOL = 1`, `PUBLICATION_RECEIPT_KIND`, `PUBLICATION_CREATE_INTENT_KIND`, `PUBLICATION_PREPARE_KIND` |
| `src/core/publication/publication-lifecycle.ts` | Publication lineage and integration observation | `PUBLICATION_LINEAGE_PROTOCOL = 1`, `PUBLICATION_INTEGRATION_OBSERVATION_PROTOCOL = 1` |
| `src/core/publication/merge-readiness.ts` | Merge readiness projection | `MERGE_READINESS_PROTOCOL = 1`, `MERGE_READINESS_KIND` |
| `src/core/integration/product-acceptance.ts` | Product acceptance authority | `INTEGRATION_CONTRACT_PROTOCOL = 1`, `INTEGRATION_CONTRACT_KIND`, `INTEGRATION_ENVELOPE_KIND`, `ACCEPTANCE_MATRIX_KIND`, `PRODUCT_ACCEPTANCE_PROJECTION_KIND` |

### Delegation plane the collaboration layer reuses without bumping

| File | Purpose | Key Exports |
|------|---------|-------------|
| `src/core/engineers/delegation.ts` | Read-only delegation protocol records | `DELEGATION_PROTOCOL = 1`, `LOGICAL_ROLE_PROFILE_KIND`, `CODEX_READ_ONLY_CAPABILITY_KIND`, `EXECUTION_PACKET_KIND`, `DELEGATION_ENVELOPE_KIND`, `DELEGATION_ADMISSION_RECEIPT_KIND`, `DELEGATED_RUN_INTENT_KIND`, `DELEGATED_RUN_LAUNCH_CLAIM_KIND`, `DELEGATED_RUN_OBSERVATION_KIND`, `WORKER_RUN_REF_KIND`, `WORKER_RESULT_KIND`, `CODEX_READ_ONLY_ADAPTER_KIND` |
| `src/effects/engineers/delegated-run-store.ts` | Admission, intent, dispatch, collection | `admitReadOnlyDelegation`, `prepareDelegatedRun`, `collectDelegatedRunResult`, `DELEGATED_RUN_STORE_RELATIVE_ROOT = 'repo-harness/delegated-runs/v1'` |
| `src/core/engineers/profile-binding.ts` | Engineer profile, binding, `delegation_policy` | `ENGINEER_PROFILE_PROTOCOL = 1`, `ENGINEER_PROFILE_KIND`, `ENGINEER_BINDING_KIND`, `ENGINEER_BINDING_EVENT_KIND`, `ENGINEER_BINDING_CURRENT_KIND`, `ENGINEER_DELEGATION_ROLES` |
| `src/core/messages/mechanics.ts` | Shared exact-key, bounded-UTF-8, canonical-bytes and digest mechanics | `assertMessageExactKeys`, `assertMessageBoundedUtf8`, `canonicalMessageBytes`, `canonicalMessageDigest`, `messageSha256` |
| `src/core/fleet/task-message.ts` / `src/core/engineers/module-message.ts` | Untrusted-injection precedent | `TASK_MESSAGE_CONTEXT_START/END`, `MODULE_MESSAGE_CONTEXT_START/END`, both body limits `8 * 1024`, `MODULE_MESSAGE_RESOURCE_MAX_COUNT = 8` |
| `src/effects/operator/server.ts` | Operator write surface | POST accepted on the task-message route only (`:534-540`) |

### 納入判據與排除清單

The two tables above are not a curated shortlist. At `main@a490a5ef` exactly 23
modules under `src/core/**` export a `*_PROTOCOL` constant
(`rg -n '^export const [A-Z0-9_]*_PROTOCOL' src/core`). Thirteen of them are
inventoried in `tests/unit/collaboration-authority-baseline.test.ts`; the other
ten are excluded, and each exclusion is adjudicated below against one criterion
stated once and applied uniformly.

**Inclusion criterion.** A `src/core/**` module enters `AUTHORITY_SOURCE_MODULES`
if and only if **both** clauses hold.

- **C-1 — plane.** The module owns a wire identity on one of the five planes C0
  froze: Task/Claim, Lease, Publication, Acceptance, or the reused read-only
  Delegation plane. Messaging, Verification, Review, Merge, release evidence,
  provider/host thread effects, and the module-engineering program are other
  planes; D12 puts Review, Verification and Merge explicitly outside C0–C9.
- **C-2 — cross-agent authority.** Its bytes decide, for another agent, who owns
  work or what has been published or accepted on that plane. Concretely: an
  admission, claim, publication, or acceptance decision reads them; **or** an
  inventoried authority is derived from them; **or** they are republished
  verbatim as a machine-readable document on a cross-agent surface (an HTTP
  route or a `--json` CLI document). Advisory prompt context, attention and
  priority hints, message payloads that are framed as untrusted data, and
  records whose only reader is their own writer do not qualify.

A module failing either clause is excluded, and gets one row below naming the
clause it fails.

**Adjudication of the ten excluded modules.**

| Module | Fails | Evidence |
|---|---|---|
| `src/core/engineers/engineering-overlay.ts` | C-1 and C-2 | Module-engineering attention plane; a derived overlay with no store, no reader but `engineer overlay` output, and an attention payload that asserts no ownership |
| `src/core/engineers/interface-change.ts` | C-1 | Module-engineering interface-change plane; its work-package projection is downstream of `scheduling.ts` and no Work Graph, offer, claim, or lease reads it back |
| `src/core/engineers/module-message.ts` | C-2 | Message payload framed as untrusted data (`[ModuleInboxUntrustedPeerMessage]`), never instruction or authority; C0 freezes its markers and byte caps as the injection precedent, not its wire identity |
| `src/core/engineers/provider-thread-effect.ts` | C-1 | Provider/host thread-effect plane; `src/effects/engineers/delegated-run-store.ts` imports nothing from it, so no admission decision reads a provider thread effect |
| `src/core/engineers/verified-context.ts` | C-1 (D12) | Verification plane — semantic contract projection, step proposal, round receipt, verification assertion, decision request; consumers are its own store and the `verified-context` CLI only |
| `src/core/fleet/task-message.ts` | C-2 | Same as `module-message.ts`: untrusted peer payload under `[TaskInboxUntrustedPeerMessages]`; the operator POST route names its recipient from `readLease`, not from a message |
| `src/core/publication/feedback.ts` | C-1 (D12) | Review/repair loop despite the `publication/` directory; `merge-readiness.ts` imports only `publication-receipt`, and no publication or merge decision reads a feedback event — the fleet board consumes it as a display summary |
| `src/core/release/runtime-evidence.ts` | C-1 (D12) | Release/verification plane; exports no `*_KIND` at all and has one consumer, `src/effects/release/runtime-evidence.ts` |
| `src/core/review/change-assessment.ts` | C-1 (D12) | Review plane; one consumer, `src/effects/review/change-assessment.ts` |
| `src/core/state/project-board-slice.ts` | C-2 | Advisory host-context projection: it derives nothing itself (every ownership decision is imported from `project-board.ts`), has no store and no `--json` surface, and its only consumer renders prompt text that "never blocks a spawn, never fails a hook, and never carries a decision" |

**`project-board.ts` vs `fleet/board.ts`.** Both are Task/Lease-plane read
models, and both are inventoried; the earlier split between them had no stated
basis and is resolved here by including `src/core/state/project-board.ts`.
`fleet/board.ts` satisfies C-2 through the republication limb: `FleetBoardCardV1`
carries `claim_id`, `generation`, `lease_state` and `column` verbatim and is
served at `/api/v1/fleet/snapshot` and `repo-harness fleet board --json`.
`project-board.ts` satisfies C-2 through the stronger derivation limb:
`collectRepoTaskOffers()` (`src/effects/fleet/acquire.ts:200-236`) builds every
`TaskOfferV1` from its cards, passing `card.task_state`, `card.lease_state`,
`card.mode`, `board.snapshot_consistency` and `board.canonical_target` into
`classifyTaskOffer()`, whose `execution_readiness` is what
`selectExecutionReadyOffer()` filters on before `fleet acquire` claims a row. A
change to this projection changes which row another agent may claim. Its
inventory entry carries `kinds: []` — that is a fact, not an omission: the board
document has no `kind` field, and `BOARD_PROTOCOL` is a field of the composite
revision preimage rather than a wire envelope.

**Closed scan — deferred by C0, landed in C1.** C0 enforced the criterion by
hand: the adjudication above is exhaustive over the 23 modules, and the digest
table plus the frozen inventory digest make any inventoried module's drift loud.
The mechanical form was deliberately not added in C0, which writes no `src/`, so
the assertion would have restated the same split against zero new samples.

C1 introduced `src/core/collaboration/` and closed the scan in
`tests/unit/collaboration-authority-baseline.test.ts` (`C1 closed inclusion
scan`): it sweeps `src/core/**` for `*_PROTOCOL` exports and asserts the result
equals `AUTHORITY_SOURCE_MODULES` united with an explicit `DELIBERATELY_EXCLUDED`
list, each excluded row naming the clause it fails and its evidence. The ten
rows above are that list's seed; the eleventh is C1's own module, adjudicated
below. A companion assertion pins D1's direction by proving that no
delivery-plane module imports the collaboration plane.

| Module | Fails | Evidence |
|---|---|---|
| `src/core/collaboration/common.ts` | C-1 and C-2 | Collaboration plane, which D1 fixes as additive and non-authoritative rather than one of the five planes C0 froze; a signal's bytes grant no Claim, move no Lease generation, and reach any reader inside an untrusted wrapper, so no admission, claim, publication or acceptance decision reads them |

### Baseline source digests at `main@a490a5ef`

Recorded as the C0 source-byte baseline for the sprint row's 「现有 authority bytes
不变」 clause. A digest change on any of these files during C1–C9 must be justified
in the row that changed it. This table does not satisfy the Program Verification
Matrix's authority-preservation row: that row asks for before/after **store**
digests and is owned by the first row that writes a collaboration store (C1).

| File | sha256 |
|---|---|
| `src/core/state/coordination-identity.ts` | `sha256:d630d266e55a8cce8a92a88acb7577b8e7d44f7abd2b7d4829c69fabb3a81aaf` |
| `src/effects/state/coordination-lease-store.ts` | `sha256:d70aa2913ec30aeb696dfc331b950d3ad11a2328079f888a6e0e895e5eb717d9` |
| `src/core/engineers/principal-claim.ts` | `sha256:2de353cd5faaa223a044a0cb7a736cd0bbfd5060982830a22fc8c0709d5a2323` |
| `src/core/engineers/scheduling.ts` | `sha256:85961c14a77f86b3c1bde42ac58ad4b7baf687d1973aa7082a2afdcdea89515a` |
| `src/core/state/project-board.ts` | `sha256:574ff25a5ceb8c1080b6686a117a33d52826d880a59ac1397454d0545d0b66ff` |
| `src/core/fleet/task-offer.ts` | `sha256:32b2844835e9750441705a313b556e35851b9bface391b17f8dcd9927333730c` |
| `src/core/fleet/board.ts` | `sha256:8b1e983c926df4b48985bc966a5e75dee1be9e49156525cb82e948f0a0fb3799` |
| `src/core/engineers/task-freeze.ts` | `sha256:73e5b1248471d54cc9ecf38f98d1aa4373d8b5b3409c7d7984a664da5c18daa0` |
| `src/core/publication/publication-receipt.ts` | `sha256:8025a121f27266256910956ac712e10eee233af316fb3fa99ffa8df76c80bc76` |
| `src/core/publication/publication-lifecycle.ts` | `sha256:a47f4cc1902a08ee1e24e8d2e1d684fc82c5d7b1438f5062f37918cfedb636d5` |
| `src/core/publication/merge-readiness.ts` | `sha256:7c269ea5ce75138cf74612d49484afd6ce5c0eb862d1d0ad8e7e236db4f91e5c` |
| `src/core/integration/product-acceptance.ts` | `sha256:a5034e330e8f8b307ccb77a0d26891ea5283de15db25a6f3205b015283a1edca` |
| `src/core/engineers/profile-binding.ts` | `sha256:02c854aada5d18a2fc52ef922c2cd8ac0a866a815a9cd0026694b37b7e9a0218` |
| `src/core/engineers/delegation.ts` | `sha256:1ba766c087f40263e017693ea5e5b05994813c62d015db76a55e4ae16d825523` |
| `src/effects/engineers/delegated-run-store.ts` | `sha256:33102aaab80af4666c1cb430c963b84476ee240e10de69e6be852c8387a7ee90` |

Every module the frozen inventory draws a constant from is required to appear in
this table; `tests/unit/collaboration-authority-baseline.test.ts` asserts that
membership, so the table cannot silently fall behind the inventory.

Two rows have moved since this baseline was taken. In C1 commit `06999700`,
`src/core/engineers/delegation.ts` went from
`sha256:1ba766c087f40263e017693ea5e5b05994813c62d015db76a55e4ae16d825523` to
`sha256:06b447ad7477759bcbbaa893fffb011b52c43b1a05c85049383337a0482d1b1d`. The
change is an extract-and-export refactor: the evidence-ref validation that was
inline in `buildWorkerResult()` became the exported
`validateWorkerEvidenceRefs()`, which D8 requires so `ArtifactRefV1` reuses the
same validator instead of a second copy. The wire shape, `DELEGATION_PROTOCOL`,
`WORKER_RESULT_KIND` and every emitted byte are unchanged, so
`FROZEN_INVENTORY_SHA256` is unaffected and stays
`sha256:6a49057e17a921e78773f358e31b487c9402c9f828f14480ef705c5ac96fcb64`.
`tests/unit/me2a-me3b-readonly-delegation.test.ts` is the byte guard.

In C4, `src/effects/engineers/delegated-run-store.ts` went from
`sha256:33102aaab80af4666c1cb430c963b84476ee240e10de69e6be852c8387a7ee90` to
`sha256:789eb7aa6f80897fce285c7b0d82fecc941f12fcc618f4b51f9b778a257d75d3`. Two
changes, both inside `collectDelegatedRunResult()`; the admission path named by
D7 is untouched, and no wire byte moves.

- `CollectDelegatedRunInput` gains a required `contribution_refs` field, appended
  to the evidence refs the function already assembles. Child PRD A freezes
  "`WorkerResultV1` is constructed exactly once and references the commit", and
  `collaboration-authority-baseline.test.ts` forbids a delivery-plane module from
  importing the collaboration plane, so the reference cannot be derived here and
  has to arrive as an input. It is required rather than optional so every call
  site states whether its run produced one; the CLI collect path passes `[]`
  because wiring the CLI to the collaboration plane is C7's row.
  `WorkerResultV1.evidence_refs[].ref` was already a free printable string, so
  `DELEGATION_PROTOCOL`, `WORKER_RESULT_KIND` and the emitted bytes are unchanged
  and `FROZEN_INVENTORY_SHA256` is unaffected.
- The same function now refuses to persist a second result for a run when one
  with different bytes already exists. Results are content-addressed, so without
  this two results for one run would land at two paths and `status()` would
  silently return whichever sorted first. This makes "exactly once" a machine
  property rather than a convention; collecting the same run twice with the same
  inputs stays idempotent.

`tests/effects/collaboration-contribution-collector.test.ts` is the guard for
both, and `tests/unit/me2a-me3b-readonly-delegation.test.ts` still pins the
unchanged evidence-ref bytes for a run with no contribution.

The digest table is a human baseline. The machine guard is the frozen inventory
digest in `tests/unit/collaboration-authority-baseline.test.ts`,
`sha256:6a49057e17a921e78773f358e31b487c9402c9f828f14480ef705c5ac96fcb64`, which
is computed from the live exported constants rather than from file bytes: it goes
red on real authority drift and stays green through comment or refactor churn.

The inventory is not maintained by hand against the source. Each inventoried
module is also imported as a namespace, and the test asserts set equality between
the module's exported `*_KIND` constants and the kinds the inventory declares for
that module, plus multiset equality on its exported `*_PROTOCOL` values. Adding a
new wire identity to any module below turns the test red until the inventory,
this table and the digest above are all updated together.

## Architecture Observations

### P1 — module boundaries

Two planes, one direction of dependency.

```text
delivery plane (authoritative)
  Work Graph -> EngineerOffer -> Claim/Lease -> WorkEnvelope
  -> Publication -> Acceptance
       ^
       | read-only projection only
       |
collaboration plane (non-authoritative, additive)
  CoordinationSignal / WorkStateHandoff / HandoffAdoptionReceipt
  -> thread + hotspot projection -> CollaborationContextPacket
  -> CollaborationRunContextBinding -> existing read-only delegated run
```

The collaboration plane reads the delivery plane and never writes it. There is no
edge back. Every collaboration record is content-addressed and append-only;
revision happens only through `supersedes_*`.

### P2 — traced paths

**1. Work Graph -> `EngineerOfferV1`.** `src/core/engineers/scheduling.ts:3-7`
defines `WORK_GRAPH_PROTOCOL`, `ENGINEER_OFFER_PROTOCOL` and their kinds. The
offer carries its own `offer_revision`. C6's
`ExistingEngineerOfferProjection` must carry the offer payload and revision
verbatim and must not re-interpret readiness; hotspot score never enters Work
Graph priority, dependency, Task state or Lease eligibility.

**2. `DelegationEnvelopeV1` -> `WorkerRunRefV1` -> `WorkerResultV1`.**
`admitReadOnlyDelegation()` (`src/effects/engineers/delegated-run-store.ts:692`)
consumes `AdmitReadOnlyDelegationInput` (`:149-160`), whose members are exactly
`repo_root`, `envelope`, `role_profile`, `capability`, `execution_packet`,
`work_envelope`, `claim_actor_receipt`, `decided_at`, `validate_parent`.
`ModuleEngineerProfileV1` is absent, so `delegation_policy` is not consulted at
admission time. `prepareDelegatedRun()` (`:731`) fails
`delegated_run_admission_rejected` when
`envelope.execution_packet_sha256 !== input.context_packet_sha256`.
`intentForDispatch()` (`:791`) fails `delegated_run_conflict` when
`packet.packet_sha256 !== intent.context_packet_sha256`, and in the same
predicate pins `packet.max_turns !== 1`. `collectDelegatedRunResult()` (`:911`,
input shape `:182-186` = `{ repo_root, dispatch_id, untrusted_claims }`)
assembles evidence refs from the persisted process receipt and constructs exactly
one immutable `WorkerResultV1`.

**Pressure point.** The collaboration context must reach the Worker without
changing what `context_packet_sha256` means. Both assertions above bind that
field to the `DelegationExecutionPacketV1` digest, so collaboration provenance
cannot ride on it. It must be a separate additive record.

**3. `TaskFreezeReceiptV1` -> `sprint release` / `fleet takeover` / `fleet acquire`.**
`src/core/engineers/task-freeze.ts:3-4` defines the protocol and kind;
`src/effects/engineers/task-freeze-store.ts` writes under
`repo-harness/engineers/v1/task-freezes` and refuses to freeze when the Engineer
Binding is not active (`task_freeze_binding_stale`), when the claim actor does not
match the current binding, when the bound worktree root or Git common directory
mismatches, or when live Lease bytes are unavailable
(`task_freeze_state_unavailable`). The receipt has no successor field.

**Pressure point.** Knowledge handoff and execution handoff must stay separate.
A `WorkStateHandoffV1` adoption records who received a context; it never elects a
successor and never mutates Lease generation. Writing still requires the existing
release/takeover/acquire lifecycle.

**4. Task/Module Message -> untrusted injection rendering.**
`src/core/fleet/task-message.ts:14,17,19` and
`src/core/engineers/module-message.ts:17,18,21,23` fix an 8 KiB body cap, an 8-ref
cap, and a start/end marker pair with fixed warning copy. Injected peer content is
data, never instruction or authority.

**Pressure point.** The collaboration packet adds a third marker pair,
`[CoordinationContextUntrusted]` / `[/CoordinationContextUntrusted]`, reusing the
same shape and warning convention. No new prompt-trust model is invented.

### Implicit contracts inherited by the collaboration plane

- Exact-key validation with explicit rejection of unknown fields.
- Content-addressed identity: same bytes, same digest, everywhere.
- Immutable create plus fsync; append-only with supersede for revision.
- No healthy-empty fallback: an unreadable store is loud, never an empty result.
- Server-derived identity: callers never assert who they are.
- `repo-harness/<domain>/v1` under `$(git rev-parse --git-common-dir)`.

## Frozen decisions

### D1 — Two-plane authority boundary

`CoordinationSignalV1`, `WorkStateHandoffV1`, `HandoffAdoptionReceiptV1`,
`CollaborationContextPacketV1`, `CollaborationRunContextBindingV1`,
`CollaborationContributionDraftV1`, `CollaborationContributionCommitV1`,
participant projections, thread snapshots and hotspot scores hold **zero** Task,
Lease, Publication and Acceptance authority. The collaboration plane performs no
write to any delivery store. Handoff adoption is non-exclusive, creates no Claim
and does not change Lease generation. Only the current Lease owner is a writer.

### D2 — `DelegatedRunIntentV1.context_packet_sha256` keeps ExecutionPacket semantics

Frozen as the `DelegationExecutionPacketV1.packet_sha256` carrier. The two
assertions at `delegated-run-store.ts:731` and `:791` are unchanged by this
program. Collaboration provenance is additive only.

### D3 — `CollaborationRunContextBindingV1` is additive, and it is a gate

`DelegationEnvelopeV1` and `DELEGATION_PROTOCOL` stay at 1; P0 does not bump them.
The binding records `dispatch_id`, `delegated_run_intent_sha256`,
`execution_packet_sha256`, `collaboration_context_packet_sha256`,
`rendered_context_sha256`, `base_goal_sha256`, `composed_goal_sha256`,
`binding_sha256`.

From C6 onward the binding is a **required dispatch gate** for collaboration-mode
delegated runs, not optional audit metadata. Before dispatch the Host verifies the
binding exists, matches the current intent and execution packet, references the
collaboration packet, and that `rendered_context_sha256` agrees with the composed
goal. Missing or stale binding fails closed.

### D4 — P0 actor support matrix

| Actor kind | Status | Basis |
|---|---|---|
| `module_engineer` | Supported | Binding + Principal are already server-verifiable identity |
| `delegated_worker` | Supported | `WorkerRunRefV1` + `DelegationAdmissionReceiptV1` give immutable run provenance |
| `human_operator` | Deferred | No independent local-operator principal exists |
| `native_subagent` | Unsupported | Host has no immutable run provenance for it |

Deferred and Unsupported do not enter the wire union and receive no
"add later" placeholder branch. Both may still appear as read-only participants on
the Operator Board. Each is re-evaluated separately once it has its own immutable
server/Host-side provenance.

### D5 — Delegation policy bridge design

> **C4 addendum (2026-08-30).** The bridge as shipped keeps this sequence and
> extends the critical section one step past `admitReadOnlyDelegation()` through
> `prepareDelegatedRun()`. A seat is only observable once an intent exists, so
> ending the section at the admission would leave a window in which the seat just
> granted is invisible, and four concurrent requests at `max_parallel_readers = 3`
> could each observe an empty window and all four be admitted. Counting a seat
> and creating it are one critical section. The ordering below is unchanged; the
> section is longer, not reordered. The nested dispatch lock is a different lock
> file and the admission lock is always the outer one, so the ordering is total.


`CollaborationDelegationAdmissionV1` runs strictly **before**
`admitReadOnlyDelegation()` and leaves its semantics untouched:

```text
resolve ModuleEngineerProfile from the parent ClaimActorReceipt
-> read the current Binding and Principal
-> load the tracked LogicalRoleProfile and check it is allowed for collaboration
-> under a lock keyed by parent claim + round_index, count active readers
-> enforce active_readers < max_parallel_readers
-> call admitReadOnlyDelegation()
```

An open `logical_role` string is not authorization: a tracked
`LogicalRoleProfile`, role instructions, model, capability receipt, exact
admission, and the live parent Claim and Binding are all still required. Exceeding
`max_parallel_readers` or an unavailable role is a typed rejection that never
reaches the existing admission. The bridge lives in a new file under
`src/effects/collaboration/`; it does not edit the existing admission path.

### D6 — Admission decision table and test vectors (model-layer freeze)

Frozen for `max_parallel_readers = 3`. C0 freezes the table only. C4 owns the real
runtime canary; C0 asserts no runtime rejection.

| # | Active readers observed | Reader state | Decision | Reason code |
|---|---|---|---|---|
| A1 | 0 | all known-current | admit | — |
| A2 | 1 | all known-current | admit | — |
| A3 | 2 | all known-current | admit | — |
| A4 | 3 | all known-current | reject | `max_parallel_readers_exceeded` |
| A5 | any | at least one reader observation stale | reject | fail closed |
| A6 | any | at least one reader state unknown or unreadable | reject | fail closed |
| A7 | any | a `reconciliation_required` reader is present | reject | fail closed |
| A8 | 3, one reader completed and released | seat released | admit | — |
| A9 | 3, one reader failed and released | seat released | admit | — |

Fail closed means: a seat is never inferred free, the active count is never
rounded down when a reader's state cannot be established, and an unreadable
reader shard never degrades to an empty set. The counting window is
`parent claim + round_index`, taken inside the lock.

### D7 — Baseline negative proof (recorded, not asserted as behavior)

`rg -n 'delegation_policy|allowed_roles|max_parallel_readers' src/` at
`main@a490a5ef` returns hits only in `src/core/engineers/profile-binding.ts`:
`:39-44` (type), `:241` (profile exact keys), `:254-265` (`delegation_policy`
exact-key and integer validation), `:281-285` (freeze). There are **zero** hits in
`src/effects/engineers/delegated-run-store.ts` and zero on the admission path.

Therefore `max_parallel_readers` is today a declared profile value with no
admission-time enforcement. Any claim that repo-harness currently limits parallel
readers at runtime is false. Real runtime rejection is produced by the C4 bridge.
`tests/unit/collaboration-authority-baseline.test.ts` pins this negative proof so
that C4's bridge cannot be smuggled into the existing admission path.

> **C4 result (2026-08-30).** The bridge shipped in
> `src/effects/collaboration/admission-bridge.ts`. This negative proof is still
> true of the file it names — `tests/effects/collaboration-admission-bridge.test.ts`
> asserts that `delegated-run-store.ts` contains none of `delegation_policy`,
> `allowed_roles` or `max_parallel_readers`, and that the bridge contains the
> last two. The repository-level claim is now false in exactly the intended way:
> three real parallel readers in separate operating-system processes were
> admitted and a fourth real request was rejected with
> `max_parallel_readers_exceeded`.

### D8 — `ArtifactRefV1` reuses the `WorkerResult` evidence-ref shape

`ArtifactRefV1` is the existing `WorkerResultV1.evidence_refs` `{ ref, sha256 }`
shape validated by the same validator. No second equivalent reference type is
introduced. This is decided here and is not reopened in C1.

### D9 — Store roots, lock strategy, canonical JSON

Root: `$(git rev-parse --git-common-dir)/repo-harness/collaboration/v1/`, matching
the existing `repo-harness/<domain>/v1` convention used by coordination,
publications, integration, delegated-runs and engineers.

```text
<git-common-dir>/repo-harness/collaboration/v1/
  signals/<signal-id>.json
  handoffs/<handoff-id>.json
  adoptions/<sha256>.json
  context-packets/<sha256>.json
  contribution-commits/<sha256>.json
  run-context-bindings/<sha256>.json
```

Locking uses the existing `src/effects/locking/exclusive-directory-lock.ts`
primitive: per-thread for signal append, per-handoff for handoff publish and
adoption. Canonical JSON, digesting and bounded-UTF-8 checks reuse
`src/core/messages/mechanics.ts`; no second serializer is written.

**D9 lock ledger.**

| Row | Deviation | Resolution |
|---|---|---|
| C3 | Handoff publish took `('thread', thread_key)`, not a per-handoff lock, and a comment in `record-store.ts` claimed that was D9 as frozen | Resolved in C4, not ledgered as a permanent deviation. D9 froze a per-handoff lock; C3 deviated in both code and comment; C4 corrected both. Handoff publish now takes `('handoff', handoff_id)`. The C3-recorded safety analysis was re-verified before splitting and holds: nothing needed a signal write and a handoff write to be mutually exclusive, because records publish through a staged write plus `link` so no reader observes a torn one, and handoff publish reads the signal store inside its lock only to prove cited signals resolve — a signal appearing mid-check can only turn a failing check into a passing one, and a persisted signal is immutable so it can never turn a passing check into a failing one. |
| C4 | Two lock domains exist that D9's prose does not name | Recorded as an extension, not a deviation. `('contribution', worker_run_ref_sha256)` scopes one delegated run's whole contribution transaction, and `('delegation-admission', <claim_id>#<round_index>)` scopes the admission counting window D6 froze. Both are per-subject locks in the same shape D9 fixed; neither changes an existing domain. |

**D9 shard ledger.** C4 adds `contribution-commits/`, which is already on the
frozen shard list above. It adds no other shard: `CollaborationDelegationAdmissionV1`
is a returned decision document rather than a persisted record, and the
contribution draft is not persisted because it is a pure function of the stdout
blob the `WorkerResultV1` evidence refs already pin — the commit's `draft_sha256`
is reproducible from that blob, which binds it more tightly than a second copy
that could drift from its own preimage.

Every store: lstat ancestor walk rejecting symlink and non-directory ancestors;
canonical JSON; immutable create plus fsync; exact protocol validation; explicit
idempotency conflict on same id with different payload; no path escape; no
healthy-empty fallback.

P0 does not persist a thread projection. Threads are computed from committed
signals. A future cache must bind the digest of its source set, recompute on
mismatch, and must never be authoritative.

### D10 — Feature flags and degradation

```jsonc
{
  "collaboration": { "mode": "off" },
  "independent_review": { "mode": "off" },
  "guarded_merge": { "mode": "disabled" },
  "program_automation": { "mode": "disabled" }
}
```

Promotion is `off -> shadow -> active` with no skipped state.
`independent_review` and `guarded_merge` stay default-off and unwired for the
whole sprint.

Degradation: a change observed during collection marks `changed_during_read`; an
unreadable shard marks `degraded`; a `snapshot_consistency` other than `stable`
makes consumers fail loud rather than serve a partial snapshot as healthy.

C0 records these values only. Wiring them into any configuration surface belongs
to C1 and later, so C0 leaves `.ai/harness/policy.json` untouched.

### D11 — No persistent multi-seat in P0

One capability keeps one persistent Module Engineer and one writer. Additional
same-capability participants are read-only delegated Workers using the existing
five-value `ENGINEER_DELEGATION_ROLES` closed set. `EngineerSeatV2` is refused for
P0 and can only be reconsidered through the C9-B repeated-evidence gate; a single
C9-A pass is not sufficient.

### D12 — Review and Merge are zero-change in this sprint

No Review, Verification or Merge surface is touched by C0–C9. Child PRD B
(Phase 2) and Child PRD C (Phase 3) rows stay deferred, carry no plan pointer,
and enter no active backlog.

## Non-mutation assertion inventory

Frozen list of what "zero authority write" means for this program.

| Plane | Authority | Store root | Collaboration-plane permission |
|---|---|---|---|
| Task / Claim | `ClaimActorReceipt`, Engineer principal mapping | `repo-harness/engineers/v1/claim-actors` | read only |
| Engineer identity | module engineer profile, binding, binding event, current binding | `repo-harness/engineers/v1` | read only |
| Task / Lease board | `BoardDocumentV1` (protocol 1) — the projection `classifyTaskOffer` derives `execution_readiness` from | canonical board read model, no store | read only, verbatim projection |
| Fleet board | `FleetBoardSnapshot` (protocol 2) | fleet read model | read only, verbatim projection |
| Lease | coordination lease, four-state machine | `repo-harness/coordination/v1` | read only |
| Task offers | `TaskOfferV1`, `FleetOffersV1`, `EngineerOfferV1` | fleet/scheduling projections | read only, verbatim projection |
| Task freeze | `TaskFreezeReceiptV1` | `repo-harness/engineers/v1/task-freezes` | read only; C5 may require one to exist, never writes a successor field |
| Publication | `PublicationReceiptV1`, lineage, integration observation, merge readiness | `repo-harness/publications/v1` | read only |
| Acceptance | integration contract, envelope, acceptance matrix, product acceptance projection | `repo-harness/integration/v1` | read only |
| Delegation | logical role profile, read-only capability, execution packet, envelope, admission receipt, run intent, run launch claim, run observation, worker run ref, worker result, `codex_exec_read_only` adapter | `repo-harness/delegated-runs/v1` | consumed as-is; no protocol bump; bridge is a pre-step only |
| Operator routes | task-message POST | `src/effects/operator/server.ts:534-540` | the sprint adds no POST route |

## Technical Debt / Risks

- The collaboration store degenerating into a second scheduler. Mitigated by D1
  and by the hotspot boundary assertion required in C2.
- Hotspot heat leaking into canonical priority. Mitigated by the explicit C2
  assertion that hotspot never touches Work Graph priority, dependency, Task state
  or Lease eligibility.
- Signal signal-to-noise on real tasks is unmeasured. C9 records the never-read
  signal rate; it is not assumed here.
- Single-round (`max_turns = 1`) contribution depth is unmeasured. C4 and C9
  observe whether multi-round accumulation compensates; `max_turns` is not
  relaxed.

## Research Conclusions

### What to preserve

The two `context_packet_sha256` assertions, `DELEGATION_PROTOCOL = 1`,
`max_turns = 1`, `max_depth = 0`, `mode = 'read_only'`, the five-value
`ENGINEER_DELEGATION_ROLES` closed set, the 8 KiB message body cap, the
untrusted-injection marker convention, the single Operator POST route, and every
delivery-plane protocol version enumerated above.

### What to change

Nothing in C0. C1 introduces `src/core/collaboration/common.ts` as the exclusive
owner of the shared schema mechanics (actor union, scope refs, evidence refs, IDs,
timestamps, digest helper) built on `src/core/messages/mechanics.ts`.

### Open questions carried forward (not blockers for C1)

| Item | Resolution owner |
|---|---|
| Real-task signal noise ratio | C9 measurement |
| Single-round contribution depth | C4 / C9 observation |
| Real provider throughput at `max_parallel_readers = 3` | C9; C4's canary proved the admission limit under real concurrent processes, not provider throughput |
| Long-run hotspot weight stability | C9 observation |
| 60/40 exploitation/exploration split | C9 tuning, determinism preserved |

## Program Slice Ledger

Moved. Durable C0-C9 progress lives in
`tasks/workstreams/runtime-harness/collaboration/collaboration-substrate-program.md`.

C0 kept the ledger here because the capability registry rejects a workstream
directory that no declared capability owns (`scripts/capability-resolver.ts:306,326`)
and a capability node needs prefixes that exist (`:285-288`) — neither was
available in a row that writes no source. C1 created `src/core/collaboration/`,
registered `capability.runtime-harness.collaboration` as an archcontext node with
its primary component, and moved the ledger through
`repo-harness run workstream-sync ensure`. Update slice status there, not here.

## Handoff Notes

### Evidence to carry forward

- Baseline commit `main@a490a5ef76b439228a4b3282934c29ba15090cdf`.
- The authority digest table and the frozen inventory digest in
  `tests/unit/collaboration-authority-baseline.test.ts`.
- D6's decision table is the acceptance source for C4's runtime canary; C4 must
  not re-derive it.
- D7's negative proof is the reason C4 adds a new bridge file instead of editing
  `admitReadOnlyDelegation()`.

### Risks to re-check

- If any file in the digest table changes during C1–C9, the changing row must
  state why and confirm the wire shape is unchanged.
- If C4's canary shows `max_parallel_readers = 3` is not reachable under a real
  provider, D6 stays frozen and the sprint records a measurement result; the table
  is not retro-fitted to the observation.
