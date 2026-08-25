# PRD: Delegated Run Adapter (ME-3B)

> **Status**: Approved
> **Slug**: `delegated-run-adapter`
> **Created**: 2026-08-25T15:51:15+0800
> **Updated**: 2026-08-26T02:57:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: decision-complete ME-2A admission schema and the frozen Codex read-only capability proof; ME-2C is not required to collect untrusted P0 results
> **Supersedes Part Of**: `plans/prds/20260824-1653-worker-host.prd.md`
> **Tier**: compact

## AI Quick-Read Card

- **Problem**: temporary Worker runtimes expose different dispatch、observe and collect semantics, but repo-harness should normalize only the admitted run boundary rather than build another Agent runtime；cancellation is unsupported in P0。
- **Users**: Module Engineer、ME-2A admission owner、runtime operator and verifier。
- **Platform**: Provider-native child was tested first and rejected for effective read-only；P0 is one `codex exec --sandbox read-only` subprocess action with content-addressed packet and runtime receipts。
- **P0 surface**: dispatch/observe/collect、intent-first idempotency、runtime identity/capability observation、result collection and reconciliation；cancel is explicitly unsupported in P0。
- **Core metric**: duplicate semantic run 0；unadmitted run 0；WorkerResult changing Task/Acceptance 0。
- **Hard constraint**: adapter does not implement model/tool loops、select its own model、widen the Contract、create a second Lease or infer semantic success from process exit。
- **Key risk**: a generic Worker Host becomes a scheduler、conversation manager and retry engine that duplicates Provider runtime。
- **Closed decisions**: native child canary wrote the repository sentinel；Codex CLI read-only canary was denied by Seatbelt；the missing effect boundary is therefore justified and limited to one subprocess action。
- **Acceptance scenarios**: exact admission、lost ACK、unknown cancel rejected before state lookup、restart reconciliation、result untrusted and no runtime implementation required when native child suffices。
- **Suggested next step**: implement the one-shot adapter and keep all unsupported lifecycle operations fail closed。

## Problem

ME-2A decides whether one temporary Worker role may run under an exact parent Claim and read-only policy. ME-3B exists only when executing that admitted envelope needs an effect adapter beyond the Provider's already-exposed native child operation.

### Product Direction

Prefer the platform capability in this order:

1. Provider-native child with observed role、identity、read-only permissions and structured result — tested and rejected for P0 because effective read-only was absent；
2. existing repo-harness process supervision around one exact Codex CLI read-only action — selected for P0；
3. a dedicated long-lived Host — rejected; no current evidence justifies it。

Every implementation consumes the same admitted `DelegationEnvelopeV1` and content-addressed context packet, then emits runtime observations and an untrusted `WorkerResultV1`. Runtime/model selection is derived from the Host-resolved Codex identity and exact tracked Role Profile；the caller and Worker cannot select、inject or fallback。A shared ExecutionPolicy schema remains out of scope until two real consumers and comparable evidence exist。

### Feasibility Boundary

- **Confirmed**: native Subagent role observation、content-addressed packets and immutable receipt stores have local precedents。
- **Confirmed**: the first-release logical read-only role requires a Codex CLI adapter because native child configuration did not enforce repository read-only while CLI Seatbelt did。
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

### Scenario 1: Native child is insufficient

The native child mutation canary succeeds, so ME-2A refuses native admission. The exact Codex CLI capability receipt admits only the one-shot logical Role Profile path；no native identity is fabricated。

### Scenario 2: Lost acknowledgement

Dispatch starts one admitted run but acknowledgement is lost. Exact observation/collection resumes that run or marks reconciliation required；it never creates a second run。

### Scenario 3: Unsupported cancellation

P0 exposes no cancel command or cancel message shape. An unknown CLI verb/input fails validation before state lookup and cannot guess a session、kill a process or create a second terminal authority；a collected result remains untrusted evidence and cannot mark the Task done。

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

Persist dispatch intent and an atomic launch claim；start at most one runtime effect；observe or collect only under the same adapter/run identity；unknown effects enter reconciliation。P0 does not retry, resume by `--last`, or cancel an unverified process identity。

### Module 3: Result Projection

Bind the immutable process receipt、before/after protected snapshots and receipt-derived evidence refs into `WorkerRunRefV1` and untrusted `WorkerResultV1`. No candidate or verifier claim is projected here；ME-2C separately owns candidate/verifier/decision checkpoint evidence。

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
  adapter_kind: codex_exec_read_only
  context_packet_sha256: sha256
  intent_sha256: sha256

DelegatedRunObservationV1:
  protocol: 1
  dispatch_id: sha256
  intent_sha256: sha256
  worker_run_ref: opaque|null
  runtime_principal_id: opaque|null
  state: intent_persisted|launch_claimed|running|collecting|completed|failed|reconciliation_required
  failure_class: none|admission|infrastructure|provider|sandbox_violation|protected_state_changed|unknown
  observed_capabilities_sha256: sha256
  previous_observation_sha256: sha256|null
  observation_sha256: sha256
```

Runtime/model observations never enter Task、Claim、candidate or Acceptance identity。Missing Provider-owned usage/model facts remain unavailable；repo-harness does not infer them。

The process receipt binds immutable refs to bounded/redacted stdout、stderr and error capture from the existing process runner. It is not an unbounded raw transcript. `allowed_read_paths` remains non-authorizing context metadata because Codex read-only mode has no read-path whitelist；effective P0 enforcement is write denial plus exact protected-path snapshots。

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Admission-to-intent overhead | ≤250 ms local | fixture benchmark | 2 s |
| Context packet | ≤32 KiB | packet fixture | overflow |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Native child effective read-only support | Would allow retiring the adapter later | Provider-issued sandbox receipt plus repeated mutation matrix | Runtime owner |
| Restart observation after launch claim | P0 outcome may remain unknown | fail closed as `reconciliation_required`; do not add daemon/retry | Adapter owner |
| Managed Parent revocation | Blocks ME-2B only | separate security canary；not part of read-only ME-3B approval | Security owner |

## Developer Handoff

The required native-child failure and Codex CLI success canaries are frozen. Implement only the missing one-shot effect boundary using existing bounded process supervision. Do not implement a daemon or generic Worker Host。

### Acceptance Scripts

1. Run ME-2A native-child fixture and record whether ME-3B implementation is required。
2. Reject stale admission、role mismatch and unprovable read-only policy before effect。
3. Lose dispatch acknowledgement and prove one semantic run。
4. Send an unknown cancel verb/input and prove it fails before state lookup；collect preserves the existing completed observation and never kills or creates another effect。
5. Change Worker prose/result and prove no Task、Lease、Publication or Acceptance transition。
6. Omit a policy/runtime capability and prove typed refusal rather than fallback。
