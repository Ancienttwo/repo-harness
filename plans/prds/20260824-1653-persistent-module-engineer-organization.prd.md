# PRD: Persistent Module Engineer Organization

> **Status**: Approved
> **Slug**: `persistent-module-engineer-organization`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T19:49:19+0800
> **Source Spec**: `docs/spec.md`
> **Related Research**: `docs/researches/20260824-persistent-module-engineer-organization.md`
> **Tier**: standard
> **Artifact Role**: umbrella architecture; not a single implementation Sprint
> **Target Baseline**: `main@75f50b909d50e980f8a372208f55aa42665a2db9`

## AI Quick-Read Card

- **Problem**: repo-harness 有 canonical Task、Lease、WorkEnvelope、Publication、Acceptance 与临时 fleet roles，但没有跨 Session 持续存在的模块工程师岗位、可信 Session binding、父 Claim 内 delegation、verified-context inner loop 和组织级 read model。
- **Users**: Maintainer、Program Orchestrator、Module Engineer、临时 Worker、独立 Acceptance Plane。
- **Platform**: repo-harness CLI/MCP、git-common-dir coordination plane、Codex/Claude Provider adapters、本地 Worker Host；远端访问延后。
- **P0 surface**: 先批准 Profile/Binding read model，再交付 Binding authority/principal；随后按独立 rollback boundary 推进 scheduling core、overlay、messages、read-only delegation、verified context、Worker Host、writer grant、freeze/handoff、interface change 和 integration。
- **Core metric**: Engineer 岗位、SOP 与 repo-grounded knowledge 跨 Session/Provider 延续，同时 task identity、Lease、Publication、Acceptance 与 Human merge 权威完全不变。
- **Hard constraint**: Capability、Engineer、Binding、Claim、Delegation、Acceptance 六种身份不得合并；任何 Session、Memory、Worker result 或 UI projection 都不能成为 task/merge authority。
- **Key risk**: 只有可信 principal、Claim actor receipt 和 mutation-time writer grant 能把“旧 Session 不再有权”“同一 worktree 只有一个 writer”从提示词变成技术事实。
- **Unknowns**: 当前 MCP OAuth authorization 不能证明 Provider Thread identity；具体 binding principal carrier 必须在 ME-0B canary 中冻结。
- **Acceptance scenarios**: 单 active binding、旧 principal 拒绝、Claim actor 可追溯、无第二 Lease、单 writer actor、persist-first message、verified-only next context、Fleet column 不受 runtime state 影响。
- **Suggested next step**: ME-0A 暂时保持 Draft；closed event/current publication semantics 已吸收，下一步只做外部 schema/fixture 复审，未明确恢复 Approved 前不进入实施。

## Problem

当前控制面可以把一次性 Agent 带到正确的 task/worktree，并在独立 gate 后发布候选；缺失的是长期逻辑岗位及其运行时组织协议。直接把 Session 当 Engineer 会导致 Session liveness、Provider history 与 task ownership 混为一体；直接给 Profile 写 paths 会制造第二权限源；直接让 Subagent 共用 worktree 会制造未受控的第二 writer。

### Product Direction

稳定组织关系：

```text
ArchContext Capability
  → ModuleEngineerProfile
  → EngineerBinding authority + authenticated EngineerPrincipal
  → canonical Task Claim + ClaimActorReceipt
  → DelegationEnvelope / optional DelegatedMutationGrant
  → WorkerResult / WorkerRoundReceipt
  → independent AcceptanceReceipt
  → Human merge
```

Hard Constraints:

- `.archcontext/model/nodes/*.yaml` 是唯一 capability/module boundary；不新增 `ModuleGraphV1`。
- Profile 只引用 capability、SOP 与 delegation policy；不复制 paths、interfaces、entrypoints 或 checks authority。
- Binding 只授权 engineer-scoped runtime command；不授权 task claim transfer、publication、acceptance 或 merge。
- Engineer principal 由 authenticated runtime boundary 派生；caller-supplied identity 字段不构成权限。
- Task execution authority 仍是 Lease claim/generation；ClaimActorReceipt 只记录 actor provenance。
- 一个 claimed worktree 的 `writer_actor` 同时覆盖 Parent Engineer 和 Worker。
- Native messaging 只是 delivery accelerator；durable event 必须先持久化。
- Formal Gatekeeper 位于独立 Acceptance Plane，不继承 Engineer 的自我结论或写权限。
- Verified context 只消费 continuous evidence-bound `SemanticVerificationAssertion` chain；Worker prose 与 Provider transcript 默认不可信。

Recommended Defaults:

- 2 个 canary Engineer，每个最多 1 active claim；
- read-only delegation 先于 writable delegation；
- binding rotation 默认只允许无 active claim；
- active bound dirty task 没有 handoff receipt 时阻塞 mutation handoff；
- SessionStart capsule 与现有 mandatory sections 合计不超过 1,500 estimated tokens；
- 本地单机、linked worktrees、CLI/MCP first、Codex first、Claude second。

Freedoms:

- Profile/SOP 的文案结构可按 capability 调整；
- Provider adapter 可不同，但必须产出相同 typed observations；
- Human Board 的视觉实现可变化，但只能消费稳定 read models。

### Authority Map

| Datum | Sole authority |
|---|---|
| Capability boundary、source prefixes、entrypoints、verification | ArchContext capability node + architecture docs |
| Engineer behavior contract | Tracked Profile/SOP referencing canonical capability |
| Current engineer runtime authorization | git-common-dir EngineerBinding current record under per-engineer lock |
| Trusted engineer caller | Server-derived EngineerPrincipal |
| Canonical task identity/completion | Sprint row + task revision |
| Temporary task execution right | Lease claim ID + lease generation |
| Claim-to-engineer provenance | Immutable ClaimActorReceipt |
| Child read/write permission | DelegationEnvelope + optional active DelegatedMutationGrant |
| Candidate/publication | PublicationReceipt + current-publication pointer |
| Acceptance | Existing typed independent gates |
| Provider facts | Provider API/runtime observation |
| Kanban column | FleetBoardSnapshot pure projection |
| Engineer/session/worker display | EngineeringOverlaySnapshot pure projection |
| Durable knowledge | Existing architecture/research/lessons/workstream/notes files |
| Engineer memory | Rebuildable index over durable knowledge |

### Feasibility Boundary

- **Confirmed**: git-common-dir stores, per-task locks, atomic rename patterns, exact task/Lease fences, Codex native role observation, 1,500-token SessionStart budget and MCP authorization-scoped runtimes already exist as reusable precedent.
- **[UNKNOWN]**: whether Codex/Claude expose a stable Provider Thread identity to the local command boundary. MCP session ID and OAuth authorization ID alone do not prove a Provider Thread.
- **[UNVERIFIED]**: production-quality per-binding credential injection for manually created Provider Sessions. ME-0B must select and verify one server-derived carrier before approval.

## Users

### Primary Users

- **Maintainer**: defines profiles/SOPs, binds or retires Sessions, reviews attention and remains the authority for waiver/merge.
- **Module Engineer**: receives capability-compatible work, coordinates bounded Workers and submits candidates without self-acceptance.
- **Program Orchestrator**: plans Work Packages and dependencies, sends durable requests and coordinates integration without owning task Leases.

### Secondary Users

- **Temporary Worker**: receives one closed delegation contract and returns evidence.
- **Gatekeeper/Harness Evaluator**: independently freezes and evaluates an exact subject, read-only.

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Simultaneous active binding per Engineer | ≤1 | N-way CAS race and unbound/retired fixtures | any duplicate |
| Retired binding engineer mutation | 0 successes | stale principal test | any success |
| Task/Lease bytes changed by binding rotation | 0 | byte comparison | any change |
| Native send without durable event | 0 | provider failure fixtures | any occurrence |
| Second canonical Lease created by delegation | 0 | lease-store inspection | any occurrence |
| Parent and Worker simultaneous write authority | 0 | writer-actor race test | any overlap |
| WorkerResult changing task/acceptance | 0 | transition tests | any transition |
| Stale knowledge injected as normative | 0 | index invalidation fixtures | any stale injection |
| SessionStart context | ≤1,500 estimated tokens | budget evidence | overflow |
| Overlay for 10 Engineers | p95 ≤3 s local | projection benchmark | 10 s |

## Acceptance Scenarios

### Scenario 1: Stable role, replaceable binding

- **Given**: one capability-backed Engineer and active binding generation N with no active claim.
- **When**: operator retires it and binds a new Provider Session.
- **Then**: generation becomes N+1, profile/SOP remain stable, old binding cannot become current, and no task/Lease bytes change.
- **Machine-checkable evidence**: binding event/current records, CAS race result and Lease digest equality.

### Scenario 2: Trusted principal, not self-declared identity

- **Given**: current binding B2 and a request carrying B2 fields from a connection authenticated as retired B1.
- **When**: an engineer-scoped command executes.
- **Then**: server derives principal B1 and refuses the command; request fields cannot override it.
- **Machine-checkable evidence**: typed `binding_stale` refusal and no store mutation.

### Scenario 3: Bound dirty task does not transparently move

- **Given**: current Engineer owns a bound claim whose worktree has dirty or unverified state.
- **When**: rotation is requested while ME-4A execution takeover remains disabled.
- **Then**: rotation may be recommended, but mutation handoff is blocked and no release/reacquire is synthesized.
- **Machine-checkable evidence**: typed refusal, unchanged Lease and preserved worktree topology.

### Scenario 4: One writer actor

- **Given**: Parent Engineer is current worktree writer.
- **When**: a writable Worker grant is requested.
- **Then**: parent authority is frozen before Worker becomes writer; a second writer request fails closed; publication is blocked until settlement.
- **Machine-checkable evidence**: writer actor transitions, mutation-guard fixtures and host-observed Git diff.

### Scenario 5: Runtime state does not move Kanban

- **Given**: Fleet task is Working because a Lease is bound.
- **When**: Session becomes unreachable or Worker crashes.
- **Then**: Fleet column is unchanged; only overlay and organization attention change.
- **Machine-checkable evidence**: byte-identical Fleet card plus changed overlay fixture.

## Non-goals

- A second Module Graph, task database, Lease, Publication, Acceptance or Kanban authority.
- Provider transcript or memory as durable truth.
- Transparent transfer of an active dirty bound task in the first release.
- Writable Worker before trusted child identity, writer actor and sandbox enforcement exist.
- Automatic Session creation/rotation in ME-0A.
- Multi-machine claim protocol, recursive delegation, GUI/computer-use runtime or automatic final merge.
- Cross-device Cloudflare/Remote MCP until the local authority and read models pass canary.

## Module Behaviors (P0)

| Order | Child PRD | Boundary |
|---:|---|---|
| 0A | `20260824-1653-engineer-profile-binding-projection.prd.md` | Capability-backed Profile/SOP, shared binding store, operator-only CAS, read-only status/bootstrap |
| 0B | `20260824-1653-engineer-binding-principal-claim-actor.prd.md` | Authenticated principal, old-binding rejection, ClaimActorReceipt |
| 1A | `20260824-1653-engineer-scheduling-schema.prd.md` | repository-qualified Work Package identity, scheduling revisions, dependency states and repo-scoped concurrency |
| 1B | `20260824-1653-engineering-overlay-control-board.prd.md` | read-only capability-bearing engineering/attention projections; composite Board later |
| 1C | `20260824-1653-engineer-coordination-messages.prd.md` | shared message mechanics, closed event/receipt/transition schemas, binding-fenced delivery |
| 2A | `20260824-1653-read-only-delegation-admission.prd.md` | exact parent fences, native role admission, read-only proof and WorkerResult |
| 2C | `20260824-1653-verified-context-contracts.prd.md` | verified evidence chain, DecisionRequest lifecycle and context compiler |
| 3 | `20260824-1653-worker-host.prd.md` | Provider process lifecycle, runtime adapters, receipts, retry/cancel/collect |
| 2B | `20260824-1653-writable-worker-grant.prd.md` | host-enforced Parent freeze, exclusive writer actor, sandbox and settlement |
| 4A | `20260824-1653-bound-task-freeze-handoff.prd.md` | freeze/inspect/refuse unsafe dirty-bound rotation; takeover remains disabled |
| 4B | `20260824-1653-interface-change-request.prd.md` | interface request authority, transitions and Work Package projection |
| 4C | `20260824-1653-integration-product-acceptance.prd.md` | exact combined candidate, requirement authority and independent product gate |

Each table row is one child PRD and one separate rollback/verification boundary. Draft children cannot be pulled into a Sprint merely because this umbrella is Approved. ME-2B depends on ME-3; no writable worker may be enabled before the Host can enforce Parent freeze, runtime identity and sandbox policy.

## Data Model

Identity domains remain distinct:

```text
capability_id
engineer_id
binding_id + binding_generation
task_id + task_revision
claim_id + lease_generation
delegation_id + worker_run_id
acceptance subject/receipt identity
```

No digest preimage may silently add engineer, binding or Provider identity to current task identity. Shared runtime records use git-common-dir, closed schemas, exact-key validation, atomic writes and explicit locks. Tracked Profile/SOP changes use Git review.

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Binding CAS/status | ≤250 ms local | concurrent store test | 2 s |
| Binding rotation without active claim | ≤3 s local | operator canary | 10 s |
| Read-only delegation admission | ≤2 s local | native role canary | 10 s |
| Durable message persist | ≤100 ms local | store benchmark | 1 s |
| Engineering overlay, 10 Engineers | p95 ≤3 s local | fixture benchmark | 10 s |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Trusted per-Provider Session principal carrier | Blocks engineer-scoped mutation | ME-0B Provider/MCP canary; fail closed until selected | Runtime maintainer |
| Managed Parent and child identity at every mutation boundary | Blocks writable delegation | ME-3 Host plus ME-2B sandbox canary | Delegation owner |
| Active dirty task takeover semantics | Blocks transparent rotation | ME-4A keeps takeover disabled pending carrier/election PRD | State owner |
| Cross-repo stable Work Package identity | Scheduling schema migration | ME-1A content/identity tests | Planning owner |
| Independent semantic verifier cost | Inner-loop budget | ME-2C measured policy tiers | Verification owner |

## Developer Handoff

This umbrella is architecture authority, not an implementation task.

- **Build first**: no child is currently implementation-ready. After its closed event/current publication protocol is externally re-reviewed and its status becomes Approved, ME-0A is the first implementation slice.
- **Do not reinterpret**: no new Module Graph; no Session self-declared principal; no writer based on prompt-only paths; no active dirty-task transparent transfer; no UI-owned status.
- **Promotion rule**: a child PRD becomes Approved only after its authority, principal, state transitions, failure paths and acceptance evidence are decision-complete.
- **Verify with**: child-specific tests plus `repo-harness run check-task-workflow --strict`, architecture sync and task sync.

### Acceptance Scripts

1. Validate every child PRD filename/status/required sections through the strict workflow check.
2. Confirm no proposed tracked path creates a second capability or memory authority.
3. Confirm the ordered dependency graph contains no forward type dependency.
4. Confirm no child is currently implementation-ready; ME-0A is first in ordering but remains blocked while Draft, and all other unknown-bearing children remain Draft.

## Adjacent Patterns

- Existing Lease/task message stores provide git-common-dir, lock, immutable event, receipt and atomic-write precedents.
- Existing Codex `SubagentStart` routing provides exact role-observation and fail-closed precedent.
- `docs/researches/20260824-persistent-module-engineer-organization.md` records Provider capability evidence and the detailed authority analysis.
