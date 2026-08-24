# Review: Persistent Module Engineer PRD Suite — GPT Git Connector Verdict

> **Status**: Request Changes
> **Reviewed At**: 2026-08-24T19:49:19+0800
> **Reviewer**: ChatGPT Pro through GitHub Connector
> **Repository**: `Ancienttwo/repo-harness`
> **Branch**: `codex/persistent-module-engineer-prd-review`
> **Subject Commit**: `d29ecce2cf064d65116fa999e642b99ea20014aa`
> **Compared Range**: `a3afa3c3..d29ecce2`
> **Source Chat**: `https://chatgpt.com/c/6a88a65f-c454-83e8-b633-9449596d418a`

## Verdict

```text
REQUEST CHANGES

Architecture: sound
PRD decomposition: sound
Implementation ordering: sound after amendments
First executable slice: ME-0A, but not yet Approved
```

The umbrella architecture remains Approved. All twelve child PRDs remain Draft and none is currently implementation-ready. No child PRD is Rejected. The sole first-order blocker is the missing closed, idempotent, crash-consistent publication protocol from `EngineerBindingEventV1` to `EngineerBindingCurrentV1` in ME-0A.

## Blocking Findings

### CRITICAL — ME-0A binding event/current publication protocol

Owning file: `plans/prds/20260824-1653-engineer-profile-binding-projection.prd.md`

The previous revision correctly closed genesis classification, transitive contract revision, current-pointer authority and active binding cardinality, but did not freeze:

- immutable `EngineerBindingEventV1` exact-key schema;
- transition/operation identity and idempotency key;
- operation fingerprint and same-key/different-payload conflict;
- expected current digest/generation;
- next current digest;
- event digest preimage;
- reuse of UUID/time fields across crash retry;
- explicit event-published/current-unpublished recovery action;
- every crash point before event, between event/current, and after current/before response.

Required publication order:

```text
persist immutable event
→ fsync event
→ CAS current pointer to the exact event digest
→ fsync directory
→ return success
```

### HIGH — Umbrella implementation status contradiction

Owning file: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`

The Quick-Read card says ME-0A is Draft and must not enter implementation, while Developer Handoff and Acceptance Script 4 still call it the only implementation-ready child. The umbrella must state that no child is currently implementation-ready and that ME-0A becomes first only after amendment and re-approval.

### HIGH — ME-0B ClaimActorReceipt contract mismatch

Owning file: `plans/prds/20260824-1653-engineer-binding-principal-claim-actor.prd.md`

- `authorization_revision` must be `number`, matching `WorkEnvelopeV1`, not SHA-256.
- `repository_id` must equal `WorkEnvelope.repo_id` exactly.
- `worktree_ref` must name one frozen meaning rather than leaving path-versus-digest mapping to implementers.
- The per-binding authenticated carrier and principal mapping/revocation store remain approval blockers.

### HIGH — ME-1A capability qualification authority

Owning file: `plans/prds/20260824-1653-engineer-scheduling-schema.prd.md`

The repository-qualified identity, scheduling revisions, dependency authority states and repo-only concurrency direction are accepted. Remaining gaps:

- `required_capabilities` has no qualification source because `ModuleEngineerProfileV1` currently owns one capability only.
- P0 must remain `scope: repo`; capability/fleet concurrency requires a separately Approved authority.

### HIGH — ME-1B binding state cannot represent unbound

Owning file: `plans/prds/20260824-1653-engineering-overlay-control-board.prd.md`

Optional sources correctly distinguish `unsupported|available|unreadable`, and the composite before/after join is accepted. The binding projection itself must also represent support/readability and `unbound|active|retired`; the existing non-null binding object cannot satisfy the no-active-binding scenario.

### HIGH — ME-1C delivery state conflict

Owning file: `plans/prds/20260824-1653-engineer-coordination-messages.prd.md`

The scenario says native failure leaves a durable message `pending` with an error observation, while the schema introduces a `failed` delivery state without transition semantics. The review recommends keeping delivery state as `pending|delivered|acknowledged|superseded`, representing failed attempts as immutable/revisioned observations with a closed error vocabulary.

### HIGH — ME-2A missing admission/run schemas

Owning file: `plans/prds/20260824-1653-read-only-delegation-admission.prd.md`

Define `DelegationAdmissionReceiptV1` and `WorkerRunRefV1`, including admission decision digest, sandbox policy digest and exact join to the observed `SubagentStart` identity.

### HIGH — ME-3 lost-ack idempotency protocol

Owning file: `plans/prds/20260824-1653-worker-host.prd.md`

Define immutable dispatch intent, previous revision/current pointer, operation fingerprint, same-key/different-payload conflict and provider-effect-success/receipt-publication-failure recovery. The current mutable `WorkerRuntimeReceiptV1` cannot by itself prove one Worker across a lost acknowledgement.

### HIGH — ME-2B writer-slot crash consistency

Owning file: `plans/prds/20260824-1653-writable-worker-grant.prd.md`

The Host-only writable policy is accepted, but a current writer-slot authority and cross-effect intermediate states are required:

```text
engineer_active
→ freezing_parent
→ worker_pending
→ worker_active
→ settling
→ engineer_restoring
→ engineer_active
```

Each crash point between Parent permission revocation, writer CAS, runtime grant activation, settlement and restoration must have one recovery rule.

### HIGH — ME-2C missing proposal/round/decision protocols

Owning file: `plans/prds/20260824-1653-verified-context-contracts.prd.md`

- Define `EngineerStepProposalV1` and `WorkerRoundReceiptV1`.
- Fence `DecisionRequestV1` with previous revision digest, transition lock, actor matrix and event/current crash publication semantics.
- Bind satisfied/unsatisfied/blocked constraints to canonical Contract constraint IDs rather than free strings.

### MEDIUM — ME-4C nonexistent publication revision

Owning file: `plans/prds/20260824-1653-integration-product-acceptance.prd.md`

Replace invented `publication_revision` with existing publication authorities:

```text
publication_id
receipt_sha256
current_publication_pointer_digest
publication_status_observation_digest
head_sha
tree_sha
```

## Accepted Decisions

- Umbrella authority map and identity separation are sound.
- The former composite PRDs were correctly split into ME-2A/2B, ME-2C/3 and ME-4A/4B/4C.
- No forward type dependency remains in `ME-0A → ME-0B → ME-2A → ME-2C → ME-3 → ME-2B`.
- ME-0A genesis versus missing-current, transitive contract revision, sole current pointer and `≤1` active binding are accepted.
- Scheduling repository namespace, work/graph revisions, closed dependency authorities and repo-only concurrency direction are accepted.
- Overlay composite marker join and optional source support states are accepted.
- Unmanaged Provider Sessions remain read-only; only Worker Host-controlled Parent/child runtimes may later receive a writable grant.
- ME-4A freeze/inspect/refuse boundary is safe; takeover remains undefined.
- Research remains architecture guidance with no implementation authority; `docs/spec.md` contains the correct authority invariants.

## Per-PRD Status

| PRD | Verdict | Remaining gate |
|---|---|---|
| Umbrella | Approved with amendment | remove stale implementation-ready wording |
| ME-0A Profile/Binding | Draft | closed event/current publication protocol |
| ME-0B Principal/Claim Actor | Draft | authenticated carrier, mapping/revocation, field fixes |
| ME-1A Scheduling | Draft | qualification authority and carrier/migration |
| ME-1B Overlay | Draft | binding support/state schema |
| ME-1C Messages | Draft | delivery observation state machine |
| ME-2A Read-only Delegation | Draft | admission/run schemas and Provider proof |
| ME-2C Verified Context | Draft | proposal/round/decision protocols |
| ME-3 Worker Host | Draft | dispatch intent and crash publication protocol |
| ME-2B Writable Grant | Draft | writer current authority and cross-effect transaction |
| ME-4A Freeze/Handoff | Draft | ME-0B fences and undefined takeover carrier |
| ME-4B Interface Change | Draft | projection and transition actor matrix |
| ME-4C Integration/Acceptance | Draft | candidate/Acceptance carrier and publication field fix |

## Absorption Decision

This review is accepted as the external architecture gate for commit `d29ecce2`. Exact contract mistakes and missing schemas are incorporated into their owning child PRDs. All child statuses remain Draft until a new external review explicitly approves them; documentation amendment alone does not self-promote implementation authority.
