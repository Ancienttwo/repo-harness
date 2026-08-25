# PRD: Delegated Run Adapter (ME-3B)

> **Status**: Draft
> **Slug**: `delegated-run-adapter`
> **Created**: 2026-08-25T15:51:15+0800
> **Updated**: 2026-08-25T15:51:15+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: Approved ME-2A read-only admission and narrowed ME-2C evidence context projection; activation additionally requires evidence that Provider-native child execution cannot satisfy the admitted run contract directly
> **Supersedes Part Of**: `plans/prds/20260824-1653-worker-host.prd.md`
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: temporary Worker runtimes expose different dispatch、observe、cancel and collect semantics, but repo-harness should normalize only the admitted run boundary rather than build another Agent runtime。
- **Users**: Module Engineer、ME-2A admission owner、runtime operator and verifier。
- **Platform**: Provider-native child first；optional process/SDK adapter only when a real role requires it；content-addressed packet retrieval and runtime receipts。
- **P0 surface**: dispatch/observe/cancel/collect、intent-first idempotency、runtime identity/capability observation、result collection and reconciliation。
- **Core metric**: duplicate semantic run 0；unadmitted run 0；WorkerResult changing Task/Acceptance 0。
- **Hard constraint**: adapter does not implement model/tool loops、select its own model、widen the Contract、create a second Lease or infer semantic success from process exit。
- **Key risk**: a generic Worker Host becomes a scheduler、conversation manager and retry engine that duplicates Provider runtime。
- **Unknowns**: no P0 implementation is justified until native child canaries show a concrete missing lifecycle or recovery capability。
- **Acceptance scenarios**: exact admission、lost ACK、collect/cancel race、restart reconciliation、result untrusted and no runtime implementation required when native child suffices。
- **Suggested next step**: run the ME-2A native-child fixture first；keep this PRD Draft if it satisfies dispatch/observe/collect without a new adapter process。

## Problem

ME-2A decides whether one temporary Worker role may run under an exact parent Claim and read-only policy. ME-3B exists only when executing that admitted envelope needs an effect adapter beyond the Provider's already-exposed native child operation.

### Product Direction

Prefer the platform capability in this order:

1. Provider-native child with observed role、identity、read-only permissions and structured result；
2. existing repo-harness process supervision when the Provider requires an external CLI/SDK boundary；
3. a dedicated long-lived Host only after restart/reconciliation measurements prove it necessary。

Every implementation consumes the same admitted `DelegationEnvelopeV1` and content-addressed context packet, then emits runtime observations and an untrusted `WorkerResultV1`. Runtime/model selection is an explicit admitted caller choice；the Worker cannot self-select or fallback。A shared ExecutionPolicy schema remains out of scope until two real consumers and comparable evidence exist。

### Feasibility Boundary

- **Confirmed**: native Subagent role observation、content-addressed packets and immutable receipt stores have local precedents。
- **[UNKNOWN]**: whether any first-release role actually needs a new process/SDK adapter after ME-2A canary。
- **Fail closed**: unsupported role、identity、sandbox、budget or result carrier rejects dispatch；no substitution or fallback runner。

## Users

### Primary Users

- Module Engineer dispatching one admitted bounded run。
- Runtime operator reconciling an unknown effect。

### Secondary Users

- Independent verifier consuming result/evidence without trusting Worker prose。

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Duplicate semantic run | 0 | lost-ack fixture | any |
| Dispatch without exact admission | 0 | stale/missing receipt fixtures | any |
| WorkerResult task/acceptance transition | 0 | transition inventory | any |
| Unrequested adapter/daemon implementation | 0 | native-child capability decision record | any |

## Acceptance Scenarios

### Scenario 1: Native child is sufficient

ME-2A proves exact role、read-only permissions、runtime observation and structured collection. ME-3B records no product implementation requirement；the native operation remains behind ME-2A admission。

### Scenario 2: Lost acknowledgement

Dispatch starts one admitted run but acknowledgement is lost. Exact observation/collection resumes that run or marks reconciliation required；it never creates a second run。

### Scenario 3: Cancellation race

Cancel and collect race under one run identity. Exactly one terminal observation becomes current；a completed result remains untrusted evidence and cannot mark the Task done。

### Scenario 4: Unsupported constraint

The selected runtime cannot prove read-only filesystem policy or required role identity. Dispatch fails before effect；another role/runtime is not substituted。

## Non-goals

- Persistent Engineer Thread delivery; ME-3A owns that separate effect family。
- Agent query loop、tool-call parser、streaming、history、compaction or Provider retry policy。
- Scheduler、Task/Lease/Claim、Acceptance、Publication、merge or model gateway。
- Writable delegation；ME-2B remains a later independent security boundary。
- Recursive delegation or automatic Provider fallback。

## Module Behaviors (P0)

### Module 1: Capability and Admission Join

Join one exact ME-2A admission receipt with observed runtime capabilities and the requested immutable packet. Any stale digest or unsupported dimension fails before effect。

### Module 2: Run Effects

Persist dispatch intent；start at most one runtime effect；observe、cancel or collect only under the same adapter/run identity；unknown effects enter reconciliation。

### Module 3: Result Projection

Bind runtime receipt、before/after state、candidate/evidence refs and result bytes into `WorkerRoundReceiptV1`. Preserve Worker prose as untrusted until ME-2C verifier checkpoint or existing deterministic checks bind it to an exact candidate。

## Data Model

```yaml
DelegatedRunIntentV1:
  protocol: 1
  kind: repo-harness-delegated-run-intent
  dispatch_id: sha256(adapter_kind + idempotency_key)
  idempotency_key: bounded-opaque
  operation_fingerprint: sha256
  delegation_id: uuid
  admission_receipt_sha256: sha256
  round_index: integer
  adapter_kind: closed-enum
  context_packet_sha256: sha256
  intent_sha256: sha256

DelegatedRunObservationV1:
  protocol: 1
  dispatch_id: sha256
  intent_sha256: sha256
  worker_run_ref: opaque|null
  runtime_principal_id: opaque|null
  state: intent_persisted|running|collecting|completed|cancelled|failed|reconciliation_required
  failure_class: none|admission|infrastructure|provider|cancelled|unknown
  observed_capabilities_sha256: sha256
  previous_observation_sha256: sha256|null
  observation_sha256: sha256
```

Runtime/model observations never enter Task、Claim、candidate or Acceptance identity。Missing Provider-owned usage/model facts remain unavailable；repo-harness does not infer them。

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Admission-to-intent overhead | ≤250 ms local | fixture benchmark | 2 s |
| Context packet | ≤32 KiB | packet fixture | overflow |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Need for a product adapter beyond native child | May eliminate ME-3B implementation | ME-2A canary on real Work Packages | Runtime owner |
| Restart observation | Determines sidecar/Host shape | fault canary after a concrete adapter is selected | Adapter owner |
| Managed Parent revocation | Blocks ME-2B only | separate security canary；not part of read-only ME-3B approval | Security owner |

## Developer Handoff

Do not implement a daemon or generic Worker Host from this PRD alone. First prove a real admitted role cannot be served by Provider-native child execution；then implement only the missing effect boundary and reuse existing process supervision where possible。

### Acceptance Scripts

1. Run ME-2A native-child fixture and record whether ME-3B implementation is required。
2. Reject stale admission、role mismatch and unprovable read-only policy before effect。
3. Lose dispatch acknowledgement and prove one semantic run。
4. Race cancel/collect and prove one terminal observation。
5. Change Worker prose/result and prove no Task、Lease、Publication or Acceptance transition。
6. Omit a policy/runtime capability and prove typed refusal rather than fallback。
