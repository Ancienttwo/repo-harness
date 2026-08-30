# Plan: R1 Provider-Neutral Agent Runtime

> **Status**: Executing
> **Created**: 20260830-1903
> **Slug**: r1-provider-neutral-agent-runtime
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#R1
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Protocol and V1 retirement fault matrix, exact receipt correlation, tmux/Codex canary, Fleet projection, full required checks, and fixed-point architecture acceptance.
> **Rollback Surface**: Before execution delete the captured plan; after execution set agent_runtime.mode=off and revert the unaccepted R1 branch while preserving immutable V2 journals.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md`
> **Task Review**: `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md`
> **Implementation Notes**: `tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: sprint:plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md#R1
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md`
- Sprint contract: `tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md`
- Sprint review: `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md`
- Implementation notes: `tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md`.

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
- Contract file: `tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md`
- Review file: `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md`
- Implementation notes file: `tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution delete the captured plan; after execution set agent_runtime.mode=off and revert the unaccepted R1 branch while preserving immutable V2 journals.
- **Verification boundary**: Protocol and V1 retirement fault matrix, exact receipt correlation, tmux/Codex canary, Fleet projection, full required checks, and fixed-point architecture acceptance.
- **Review/acceptance boundary**: `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260830-1903-r1-provider-neutral-agent-runtime.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260830-1903-r1-provider-neutral-agent-runtime.contract.md`, `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md`, and `tasks/notes/20260830-1903-r1-provider-neutral-agent-runtime.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260830-1903-r1-provider-neutral-agent-runtime.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution delete the captured plan; after execution set agent_runtime.mode=off and revert the unaccepted R1 branch while preserving immutable V2 journals.

## Captured Planning Output

## Goal

Replace the singleton Codex Provider Thread effect with one provider-neutral Agent Runtime Effect capability that can wake either a Codex App Thread or an already-bound tmux-hosted CLI Agent, while keeping Task/Module Inbox, Claim/Lease, Engineer Binding, Collaboration, Fleet and Acceptance authority unchanged.

This plan is the R1 work package from `plans/sprints/20260828-2321-collaborative-work-exchange-agent-succession.sprint.md`. The Human approved the Child PRD and this planning slice on 2026-08-30. Capturing this plan does not authorize implementation; execution starts only through a later explicit `plan-to-todo` invocation.

## Success Criteria

- One closed runtime-effect protocol supports only `codex-app-thread | tmux-cli-agent`.
- tmux receives only an opaque bounded inbox-control reference; no Task/Module message body enters argv, stdin, environment, pane output parsing or logs.
- A successful tmux command records only `effect_started`. Only an exact Task/Module receipt bound to the same message, recipient generation and effect may produce `observed_success`.
- Every Host action is admitted at most once. Lost or ambiguous acknowledgement becomes `reconciliation_required`; no retry or adapter fallback occurs.
- Task-scoped delivery is fenced by the exact Task revision, Claim ID, Lease generation and the ClaimActorReceipt-derived Engineer Binding endpoint. Module-scoped delivery is fenced by the exact Engineer Binding generation.
- Runtime reachability and delivery state are server-derived read-model fields. They never change Fleet's five Task columns, Claim/Lease state, writer identity, Collaboration records, Publication or Acceptance.
- The old Provider Thread runtime surface is retired in one bounded migration; no runtime aliases, dual readers or semantic shape guessing remain.
- One real already-bound tmux endpoint and one Codex App Thread control pass the canary with zero authority drift.

## Non-goals

- Automatic tmux session, window or pane creation.
- Agent installation, login-shell management, daemon ownership or remote tmux.
- Generic shell, arbitrary key injection, transcript exchange or pane-output semantic parsing.
- New Task acquire/release/takeover behavior, automatic reassignment or multi-writer execution.
- Provider/model routing, broadcast, load balancing or cross-adapter fallback.
- A `tmux_agent` Collaboration actor, a second endpoint-binding store or Board-owned status.
- C8 browser presentation beyond the server-owned DTO fields R1 must freeze for C8.

## P1: Architecture Map

### Existing boundary

- `src/core/engineers/provider-thread-effect.ts` owns the exact V1 Provider capability, intent, host action, observation and current schemas.
- `src/effects/engineers/provider-thread-effect-store.ts` owns the Git-common-dir effect journal, current Binding/message fences, persist-first start and exact ME-1C delivery projection.
- `src/core/engineers/profile-binding.ts` and `src/effects/engineers/binding-store.ts` are the endpoint identity authority. `provider`, `provider_thread_id`, `host_id`, `binding_id` and `binding_generation` already form the endpoint tuple.
- `src/core/fleet/task-message.ts` and `src/effects/fleet/task-inbox.ts` own Task message events and delivery receipts.
- `src/core/engineers/module-message.ts` and `src/effects/engineers/module-inbox.ts` own Module message events and delivery receipts.
- `src/core/engineers/principal-claim.ts` and its ClaimActorReceipt path prove that a Task Claim belongs to the exact Engineer Binding used as the runtime endpoint.
- `src/core/fleet/board.ts`, `src/effects/fleet/board.ts` and `src/core/operator/fleet-snapshot.ts` own server-side Fleet and browser-safe projection boundaries.
- `src/cli/commands/engineer.ts` exposes the Human/operator effect lifecycle; `src/cli/mcp/engineer-tools.ts` exposes authenticated read-only Engineer capability/status tools.
- At capture time, `.archcontext/model/nodes/capability.runtime-harness.provider-thread-effects.yaml`, its component node, relations and `docs/architecture/modules/runtime-harness/provider-thread-effects.md` were the architecture authority; the completed architecture-acceptance task below replaced them with the Agent Runtime Effects model and module before implementation activation.

### Target boundary

- Replace `capability.runtime-harness.provider-thread-effects` with `capability.runtime-harness.agent-runtime-effects`; do not retain a capability alias.
- Replace the primary component with `component.agent-runtime-effects.journal`; the component owns immutable intent/observation chains and the at-most-once Host-action admission fence.
- The capability owns closed adapter capability observation and execution for `codex-app-thread` and `tmux-cli-agent`. It does not own an Agent process, tmux session lifecycle, message body, identity or Task state.
- Rename product modules to `src/core/engineers/agent-runtime-effect.ts` and `src/effects/engineers/agent-runtime-effect-store.ts`; adapter-specific closed executors live under `src/effects/engineers/agent-runtime-adapters/`.
- Update outgoing architecture relations to Engineer Bindings, Engineer Messages and Fleet Task Inbox. Add read-only incoming relations from Engineering Overlay, MCP Sidecar and Fleet Board projection. Collaboration consumes only C8's later read model and gains no runtime writer import.
- Keep the completed ME-3A workstream as historical evidence. Create `tasks/workstreams/runtime-harness/agent-runtime-effects/r1-provider-neutral-agent-runtime.md` for R1; do not rewrite ME-3A history.

### Scale and ownership signals

- The current effect capability is two source files and roughly 1,000–2,000 lines. R1 crosses the two message authorities, Binding/Claim proof, CLI/MCP and Fleet projection, so it is a cross-module work package rather than a checklist row.
- At 10x endpoint count, Git-common-dir effect listing and per-effect filesystem reads fail before tmux addressing. R1 must keep reads bounded and aggregate delivery projection without scanning pane output.
- At 10x message rate to one endpoint, the endpoint's inbox/Binding lock is the intended serialization point. Adding a second runtime queue would only create drift.

## P2: Concrete Trace

### Module message to tmux endpoint

1. `ModuleMessageEventV1` and its pending delivery receipt already exist in ME-1C.
2. Prepare resolves the current `EngineerBindingV1`, verifies message target, Binding ID/generation, Engineer contract revision, host and adapter kind, and freezes a `module_message` runtime reference.
3. The store writes canonical intent plus initial `intent_persisted` observation under the V2 Git-common-dir root before returning or executing anything.
4. Start re-reads the exact Binding and capability observation, writes `effect_started`, then invokes the closed tmux executor once.
5. The tmux executor validates the already-bound endpoint and sends only `repo-harness-inbox:<effect_id>:<control_sha256>` using argv-safe tmux invocation. It receives no message body and returns only bounded process facts.
6. The target wrapper/hook reads Module Inbox through the existing authority, writes the ordinary delivery/acknowledgement receipt and emits its canonical digest.
7. Observe accepts positive delivery only when the exact receipt resolves and matches the effect's message digest, recipient Engineer, Binding generation and delivery attempt. It then writes `observed_success`; otherwise it records failure or `reconciliation_required`.
8. Fleet/Engineering read models project delivery/runtime state from the receipt plus effect current. No Task, Lease, Collaboration, Publication or Acceptance writer runs.

### Task message to current owner

1. A claim-scoped `TaskMessageEventV1` is already persisted against Task revision, Claim ID and Lease generation.
2. Prepare re-reads the bound Lease and the exact ClaimActorReceipt to derive the current Engineer ID and Binding endpoint; caller-supplied endpoint identity is forbidden.
3. Intent freezes both the `task_message` reference and the derived endpoint fence. Rotation of either Claim/Lease or Binding makes start fail before Host action.
4. The runtime wake is identical to the Module path, but positive observation resolves `TaskMessageDeliveryReceiptV1` and verifies its recipient Claim/generation.
5. The Board projects the receipt/effect state while retaining the existing card column and readiness classification.

### Exceptional paths

- Missing tmux, missing session/pane, unsupported operation or unverifiable capability: typed unavailable/unsupported failure; zero alternative adapter calls.
- Binding or Claim rotation between prepare and start: typed stale failure; zero Host calls.
- Process returns success but exact receipt is absent: remain `effect_started` until bounded observation ends, then `reconciliation_required`; action count stays one.
- Pane prints completion-like text: ignored; zero semantic record.
- Runtime process outcome is unknown after crash: `reconciliation_required`; no blind retry.
- V1 store contains a non-terminal effect during migration: migration fails closed before V2 activation.

## P3: Design Decisions

### D1 — Rename the capability, product protocol and command surface

The old name encodes one provider and one Thread carrier, while the new responsibility owns a provider-neutral runtime-effect contract and a bounded Host adapter. R1 replaces the architecture capability ID, source filenames, CLI `thread-effect` command and MCP `engineer_thread_effect_*` tools with Agent Runtime equivalents. No alias or fallback remains. Historical plans, archived architecture requests and ME-3A workstream are not rewritten.

### D2 — Reuse Engineer Binding as endpoint authority

`EngineerBindingV1.provider` becomes the closed adapter discriminator at the runtime boundary: only `codex-app-thread` and `tmux-cli-agent` are accepted by R1. `provider_thread_id` remains the opaque endpoint locator carried by the Binding; for tmux it is a Host-resolved endpoint token, not a caller-provided raw target. No second endpoint store is created.

The profile-binding schema itself is not widened in R1. A future explicit schema migration may rename those two historical fields, but doing so is not required to establish one source of truth and would enlarge this work package without changing safety.

### D3 — One message-reference union plus one endpoint fence

Freeze this exact semantic shape in the V2 protocol:

```yaml
RuntimeMessageRefV2:
  task_message:
    kind: task_message
    message_id: uuid
    message_event_digest: sha256
    task_id: sha256
    task_revision: sha256
    claim_id: uuid
    lease_generation: positive-integer
    delivery_attempt: positive-integer
  module_message:
    kind: module_message
    message_id: uuid
    message_event_digest: sha256
    engineer_id: engineer-id
    binding_id: uuid
    binding_generation: positive-integer
    engineer_contract_revision: sha256
    delivery_attempt: positive-integer

RuntimeEndpointFenceV2:
  engineer_id: engineer-id
  binding_id: uuid
  binding_generation: positive-integer
  engineer_contract_revision: sha256
  adapter_kind: codex-app-thread | tmux-cli-agent
  host_id: opaque
  endpoint_id: opaque
```

For Module messages, the endpoint fence and message Binding fields must be byte-equal. For Task messages, the Host derives the endpoint fence through the persisted ClaimActorReceipt and re-proves both Lease and Binding at start.

### D4 — Host action is a control reference, never content

Freeze `AgentRuntimeHostActionV2` with only protocol/kind, effect and intent digests, adapter kind, operation, host ID, opaque endpoint ID, message/event digest, delivery attempt, `control_ref`, `control_sha256` and action digest. `payload`, message body, prompt text, shell source, environment additions and free-form argv are forbidden fields.

Allowed P0 operation is `notify_inbox`. Codex App Thread may map that closed operation to its existing Host action; tmux maps it to one literal control line. `resume`, `observe` and `stop` are not exposed through the tmux adapter in R1 because they would broaden lifecycle ownership. Capability observation marks them unsupported rather than synthesizing behavior.

### D5 — Exact acknowledgement owns positive success

`AgentRuntimeEffectObservationV2` carries `receipt_kind`, `receipt_sha256` and a closed adapter observation. Positive success requires a canonical `TaskMessageDeliveryReceiptV1` or `ModuleMessageDeliveryReceiptV1` in delivered/acknowledged state whose exact identity matches the frozen reference and endpoint generation. Process exit, pane liveness, output, Provider prose and elapsed time can never close the effect.

### D6 — Server-owned delivery and reachability projection

Freeze closed values:

```yaml
RuntimeDeliveryState: pending | delivered | acknowledged | failed | reconciliation_required
RuntimeReachability: reachable | unavailable | unknown
```

`FleetBoardInboxSummaryV1` gains server-derived delivery state, reachability, effect digest and nullable bounded failure class. Fleet collection computes them from canonical receipt/effect reads under its existing double-read consistency window. Browser DTO validation accepts only these fields and performs no inference. R1 updates server DTO and fixtures; C8 owns presentation.

### D7 — Explicit one-shot V1 retirement

V2 uses a new `repo-harness/agent-runtime-effects/v2` Git-common-dir root and new digests/domains. Before V2 is enabled, `repo-harness engineer runtime-effect migrate-v1` performs one transaction:

- lock and validate the entire V1 store;
- refuse if any V1 current is `intent_persisted`, `effect_started` or `reconciliation_required`;
- compute the canonical V1 tree digest;
- atomically move the V1 root to an immutable archive path and write one migration receipt bound to that digest;
- create no V2 effect from historical V1 bytes;
- become idempotent only for the exact same receipt/archive digest.

Normal V2 readers never inspect V1 or the archive. A missing migration receipt with a present V1 root blocks V2 mutation. This is a bounded migration, not steady-state compatibility.

### D8 — Feature modes and rollback

`agent_runtime.mode` transitions only `off → shadow → active`. `off` allows read-only status and migration but no new effect. `shadow` records capability/preparation evidence but executes no Host action. `active` admits closed Host actions. `tmux-cli-agent` has its own disabled/enabled capability flag and never auto-enables because tmux is installed.

Rollback sets mode to off, preventing new actions while preserving V2 journals and ordinary Task/Module hook delivery. It does not revive the V1 Provider Thread command.

## Public Interface Changes

- CLI: replace `repo-harness engineer thread-effect` with `repo-harness engineer runtime-effect`; add `migrate-v1`; expose no raw tmux target or generic command option.
- Authenticated Engineer MCP: replace `engineer_thread_effect_capability/status` with `engineer_runtime_effect_capability/status`; keep them read-only. No MCP tool starts or executes Host actions.
- Policy: add the exact `agent_runtime.mode` and per-adapter enablement contract to policy/workflow manifests and generated templates.
- Architecture: replace capability/component nodes and update relations, domain index, architecture module, context projections and diagrams through the normal acceptance workflow.
- Board/operator DTO: bump its protocol exactly once for the new server-owned fields; no dual decoder.

## File and Ownership Plan

| Surface | Action | Ownership |
| --- | --- | --- |
| `src/core/engineers/provider-thread-effect.ts` | Replace with `agent-runtime-effect.ts` | V2 schema and transitions |
| `src/effects/engineers/provider-thread-effect-store.ts` | Replace with `agent-runtime-effect-store.ts` | journal, fences, migration, receipt correlation |
| `src/effects/engineers/agent-runtime-adapters/*` | Add | closed Codex/tmux Host executors; no message authority |
| `src/core/engineers/profile-binding.ts` | Validate closed adapter values at runtime boundary only | endpoint source of truth; no schema widening |
| Task/Module inbox modules | Extend read/correlation helpers only | existing event and receipt authority |
| principal/ClaimActorReceipt modules | Reuse proof path; add no Claim transition | Task-to-Binding derivation |
| Fleet/operator snapshot modules | Add server-owned projection fields and one protocol bump | read model only |
| engineer CLI/MCP/overlay | Replace runtime names and projections | command/read interfaces |
| policy/workflow manifests/templates | Add exact feature mode | configuration authority |
| `.archcontext/model/nodes/*`, architecture docs/diagrams | Replace capability identity and relations | architecture authority |
| tests | Replace ME-3A active-path tests and add migration/adapter/fault/canary coverage | acceptance evidence |

## Verification Plan

### Protocol and migration

- Canonical round trips and unknown-field rejection for both message-reference branches, endpoint fence, capability, intent, action, observation and current.
- V1 migration: terminal-only success, non-terminal refusal, crash boundaries, exact idempotency, no V2 record synthesis, no runtime V1 reader/import/command alias.

### Runtime safety

- Spy argv/stdin/env and prove zero message-body bytes, zero shell interpolation and one tmux process call.
- Rotate Claim, Lease and Binding at every prepare/start/observe boundary and prove zero stale Host action/positive receipt.
- Kill after intent fsync, started observation, Host process spawn and receipt write; prove action count at most one and unknown outcomes reconcile.
- Missing tmux, missing endpoint, unsupported operation and malformed capability all fail closed with zero fallback.
- Adversarial pane output and completion-like text produce zero Task, Collaboration, Publication or Acceptance mutation.

### Projection and compatibility removal

- Cover every delivery/reachability value and changed-during-read branch; prove Fleet column/readiness unchanged.
- Browser DTO rejects the previous protocol rather than guessing fields; route inventory still has only the existing task-message POST.
- Lexical/import scans prove old active-path capability, files, CLI/MCP names and protocol readers are absent outside historical artifacts and migration code.

### Commands

- Focused Agent Runtime, Task Inbox, Module Inbox, ClaimActorReceipt, Engineering Overlay, Fleet Board, Operator snapshot, CLI and MCP tests under 60 seconds.
- `bun run check:type`.
- One real already-bound tmux endpoint canary and one Codex App Thread control, including lost ACK and Binding rotation.
- All repository Required Checks from root `AGENTS.md`.
- Architecture model fixed-point projection, request resolution/archive and strict architecture gate.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| tmux process success mistaken for delivery | duplicate or false-positive work | exact receipt is the only positive evidence |
| raw tmux target becomes identity | endpoint hijack/stale delivery | derive opaque endpoint from current Binding and re-read before action |
| Task claim cannot prove a Binding | unsafe cross-plane routing | require exact ClaimActorReceipt; otherwise endpoint unavailable |
| protocol migration strands an in-flight effect | ambiguous retry | terminal-only migration and fail-closed reconciliation |
| capability rename breaks hidden consumers | partial dual authority | closed consumer inventory, one-shot removal, no aliases |
| Board semantics drift | runtime status changes scheduling | server projection tests assert original column/readiness bytes |
| tmux unavailable on a Host | dispatch stalls | typed unavailable state; ordinary inbox remains pending; no fallback |

## Promotion Gate

- **Merge/PR unit**: one atomic protocol/capability migration plus the two closed adapters, receipt correlation and server projection. Splitting before migration would leave dual active names or incomplete lost-ACK semantics.
- **Rollback surface**: `agent_runtime.mode=off`, revert the R1 branch before accepting the architecture projection; after acceptance, retain V2 journals and disable actions rather than restoring V1.
- **Verification boundary**: protocol/migration fault matrix, two-adapter canary, Board projection, full required checks and fixed-point architecture acceptance.
- **Review/acceptance boundary**: Waza `/check`-style review plus the archived architecture request must name the new Agent Runtime module.
- **High-risk surface**: subprocess addressing, cross-plane Task-to-Binding proof, at-most-once effects and one-shot runtime-store retirement.
- **Why not checklist row**: the change crosses a protocol/store migration, architecture capability identity, public CLI/MCP contract and independent real-runtime acceptance boundary.

## Evidence Contract

- **State/progress path**: this plan, its projected task contract/review/notes, the R1 Agent Runtime workstream and the R1 Sprint row.
- **Verification evidence**: canonical schema fixtures, fault injection and action-count evidence, exact receipt correlations, authority before/after digests, browser DTO tests, runtime canary records and root required checks.
- **Evaluator rubric**: PASS only if message bodies never enter tmux, every positive delivery has an exact receipt, unknown outcomes never retry, stale fences run zero Host actions, no fallback/alias remains and Task/Lease/Publication/Acceptance bytes stay unchanged.
- **Stop condition**: all tasks below complete, focused/full checks and canaries pass, architecture request is resolved/archive-linked to the new module, and independent review recommends PASS.
- **Rollback surface**: disable V2 actions with `agent_runtime.mode=off`; preserve immutable journals and ordinary inbox delivery; never re-enable V1 runtime behavior.

## Task Breakdown

- [x] Accept the pending Agent Runtime architecture request: replace the Provider Thread capability/component identity, relations, module and workstream boundary; freeze D1–D8 before source implementation.
- [x] Implement the V2 provider-neutral schemas, exact Task/Module references, endpoint fence and terminal-only V1 retirement transaction; remove V1 runtime readers and aliases.
- [x] Implement persist-first V2 storage, Task-to-Binding proof, Binding/Claim revalidation, exact receipt correlation and at-most-once lost-ACK reconciliation.
- [x] Implement closed `codex-app-thread` and `tmux-cli-agent` executors; tmux receives only the bounded control reference and never owns endpoint lifecycle or message content.
- [x] Replace CLI/MCP/Engineering Overlay names and add exact feature policy/manifests without fallback or dual decoding.
- [x] Add server-owned Fleet/operator delivery and reachability projection with one DTO protocol bump; preserve Task columns, readiness and browser mutation inventory.
- [x] Add canonical, migration, fault-injection, adversarial-output, projection and compatibility-removal tests; run focused type/test checks.
- [x] Run the full Required Checks, reach fixed-point architecture acceptance, pass the real local tmux control canary and sync workflow evidence.
- [ ] Run an explicitly authorized real Codex App Thread control canary, record semantic acceptance and archive the completed workflow.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->
