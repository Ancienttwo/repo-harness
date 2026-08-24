# PRD: Verified Context Inner Loop and Worker Host (ME-2C/ME-3)

> **Status**: Draft
> **Slug**: `verified-context-worker-host`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T16:53:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Depends On**: approved read-only delegation; writable rounds additionally require ME-2B
> **Tier**: standard

## AI Quick-Read Card

- **Problem**: 持久 Engineer 若不断消费自己的历史总结，会把未验证 Worker prose 和 trajectory 变成下一轮事实；当前没有 bounded round、verified delta、decision stop 和 recoverable Worker Host contracts。
- **Users**: Module Engineer、temporary Worker、semantic verifier、Maintainer。
- **Platform**: canonical Task Contract、Verified Context Compiler、PersistentThreadTransport、WorkerRuntimeAdapter、本地 Worker Host。
- **P0 surface**: canonical Contract 内 `TaskSemanticContractV1` section、`EngineerStepProposalV1`、`WorkerRoundReceiptV1`、evidence-bound `VerifiedStateDeltaV1`、`DecisionRequestV1`、runtime failure/budget、separate adapters。
- **Core metric**: 下一轮 trusted context 中 unverified Worker claims 0；每轮只有一个 dominant bounded change；crash 可从 repo/evidence 重建。
- **Hard constraint**: semantic contract is part of canonical Contract/revision, not a second task authority；VerifiedStateDelta is evidence assertion, never completion/Acceptance authority。
- **Key risk**: independent semantic verifier 在同一 reporting line 或没有 exact candidate/check digests 时成为橡皮图章。
- **Unknowns**: verifier cost policy、Provider adapter lifecycle and retry semantics require measured canary。
- **Acceptance scenarios**: failed claim excluded、decision stops guessing、runtime crash recovery、adapter separation、formal gate remains existing Acceptance Plane。
- **Suggested next step**: first approve pure inner-loop contracts and one read-only round fixture；Worker Host process orchestration follows separately inside this PRD’s ordered modules。

## Problem

Long-horizon correctness depends on shrinking the next round to stable contract plus independently verified state. Full transcripts, previous Executor prose and stale memory are evidence at most, not context authority.

### Product Direction

```text
canonical Contract + latest valid VerifiedStateDelta + selected fresh refs
  → EngineerStepProposal (one bounded change)
  → Worker execution
  → deterministic checks
  → independent semantic verification
  → WorkerRoundReceipt
  → VerifiedStateDelta or DecisionRequest/RuntimeFailure
  → next round or formal module gate
```

- `TaskSemanticContractV1` is a typed section of the canonical Task Contract or a content-addressed artifact referenced by and included in task revision.
- Delta binds task/revision/claim/lease generation, exact before/after subject, candidate/check evidence and verifier identity.
- Delta may assert completed/incomplete/blockers but cannot alter Sprint completion, Lease, Publication or Acceptance.
- PersistentThreadTransport handles binding conversation lifecycle; WorkerRuntimeAdapter handles native bounded Workers. Neither chooses authority or role policy.
- Runtime retry distinguishes infrastructure failure from semantic failure and is bounded/idempotent.

### Feasibility Boundary

- **Confirmed**: WorkEnvelope, repo evidence, checks, Acceptance and SessionStart budget exist.
- **[UNKNOWN]**: independent semantic verifier model/cost tier and Provider lifecycle observation.
- **[UNVERIFIED]**: max useful rounds and no-progress thresholds; initial canary caps at 3 rounds.

## Users

### Primary Users

- **Module Engineer**: proposes one bounded step and consumes only verified next-state projections.
- **Maintainer**: answers DecisionRequest and sees round/evidence timeline.

### Secondary Users

- **Semantic verifier**: read-only, exact subject, cannot repair Candidate.
- **Formal Gatekeeper**: runs only after candidate freeze through existing Acceptance Plane.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Unverified claim in trusted bundle | 0 | bundle inspection | any claim |
| Round dominant changes | 1 | proposal schema/fixtures | >1 unrelated goal |
| Missing decision guessed | 0 | blocking fixtures | any synthesized answer |
| Context capsule | total SessionStart ≤1,500 estimated tokens | budget evidence | overflow |
| Crash recovery from repo/evidence | 100% canary runs | restart tests | unrecoverable run |

## Acceptance Scenarios

### Scenario 1: Failed Worker claim

- **Given**: Worker says done but deterministic checks fail.
- **When**: RoundReceipt and next context are built.
- **Then**: claim remains untrusted; previous valid delta stays current; failure evidence is bounded and labeled.
- **Machine-checkable evidence**: context canonical bytes contain no trusted completion assertion.

### Scenario 2: Human decision required

- **Given**: Contract lacks a blocking product choice.
- **When**: Engineer proposes a step requiring that choice.
- **Then**: DecisionRequest is persisted and loop halts; no fallback value or local heuristic is used.
- **Machine-checkable evidence**: zero candidate mutation and typed blocking state.

### Scenario 3: Runtime restart

- **Given**: Worker Host crashes after RoundReceipt persistence but before next dispatch.
- **When**: host restarts.
- **Then**: it rebuilds from Contract, current Lease, receipts and evidence; it does not consume transcript as truth or duplicate a settled round.
- **Machine-checkable evidence**: idempotent run/round IDs and byte-identical context projection.

## Non-goals

- Replacing canonical Contract, task completion or AcceptanceReceipt.
- Full raw transcript/trajectory injection.
- Unlimited autonomous rounds or retries.
- GUI/computer-use runtime, multi-machine Worker Host or automatic final merge.
- Bound-task execution takeover; owned by ME-4.

## Module Behaviors (P0)

### Module 1: Verified Context Contracts (ME-2C)

- semantic contract fields: final-state carrier, authoritative inputs, state-production process, persistence boundary, contamination risks, acceptance constraints and blocking conditions;
- one bounded StepProposal with preconditions, role/mode, paths, acceptance and budget;
- RoundReceipt binds before/after subject, WorkerResult, checks, verifier result and runtime outcome;
- only valid Delta enters next trusted packet.

### Module 2: Local Worker Host (ME-3)

- acquire/dispatch/observe/cancel/collect loop under current Claim;
- Provider failure taxonomy: timeout, model unavailable, auth, quota, rate, network, provider, sandbox, contract, repeated no progress;
- explicit bounded retry and terminal receipt;
- Codex adapter first, Claude second; no alternate runner on role mismatch.

## Data Model

```yaml
VerifiedStateDeltaV1:
  protocol: 1
  task_id: sha256
  task_revision: sha256
  claim_id: uuid
  lease_generation: integer
  semantic_contract_revision: sha256
  before_subject_sha256: sha256
  after_subject_sha256: sha256
  completed: []
  incomplete: []
  blockers: []
  integrity: clean|suspect|violation
  contract_alignment: aligned|needs_revision|invalid
  untrusted_do_not_reuse: []
  check_receipt_refs: []
  evidence_refs: []
  verifier_identity: string
  recorded_at: datetime
```

`WorkerRoundReceiptV1` additionally binds run/round ID, StepProposal digest, WorkerResult digest, runtime outcome and failure classification. `EngineerContextPacketV1` is a rebuildable projection, not stored workflow authority.

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Context packet default | ≤32 KiB on-demand; SessionStart capsule remains within 1,500-token global budget | byte/token fixture | 128 KiB |
| Round recovery | ≤5 s local excluding provider | restart benchmark | 30 s |
| Max canary rounds | 3 | host policy | >3 without decision |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Independent verifier tier/cost | runtime budget | measured canary by risk tier | Verification owner |
| Provider lifecycle parity | adapter behavior | separate Codex/Claude fixtures | Runtime owner |
| Semantic no-progress threshold | halt policy | three-round canary evidence | Maintainer |

## Developer Handoff

Keep this PRD Draft until the canonical semantic-contract carrier and verifier policy are frozen.

- **Build first after approval**: pure contracts/context compiler and read-only fixture, then RoundReceipt/Delta, then Codex Worker Host, Claude adapter last.
- **Do not reinterpret**: Delta is evidence, not task state; verifier cannot edit; Provider history is cache; retries are explicit and bounded.
- **Verify with**: failed-claim exclusion, decision blocking, subject/check digest mismatch, crash recovery and existing formal Acceptance gates.

### Acceptance Scripts

1. Run a failed Worker claim and prove it does not enter trusted context.
2. Generate a DecisionRequest and prove the candidate remains unchanged.
3. Persist/restart at every round boundary and prove idempotent recovery.
4. Mismatch subject/check/contract digest and reject Delta.
5. Freeze candidate and run existing independent Gatekeeper/Acceptance path.

## Backend Perspective

Core owns contracts, canonicalization, validation and pure context projection. Effects own Provider/thread/process lifecycle, checks/evidence reads and run receipts. PersistentThreadTransport and WorkerRuntimeAdapter are separate interfaces with no shared `spawnSubagent` method.

