# PRD: Engineer Profile and Shared Binding Projection (ME-0A)

> **Status**: Draft
> **Slug**: `engineer-profile-binding-projection`
> **Created**: 2026-08-24T16:53:00+0800
> **Updated**: 2026-08-24T18:30:00+0800
> **Source Spec**: `docs/spec.md`
> **Parent PRD**: `plans/prds/20260824-1653-persistent-module-engineer-organization.prd.md`
> **Related Research**: `docs/researches/20260824-persistent-module-engineer-organization.md`
> **Tier**: compact
> **Target Baseline**: `main@75f50b909d50e980f8a372208f55aa42665a2db9`

## AI Quick-Read Card

- **Problem**: Module Engineer 目前没有 capability-backed Profile/SOP，也没有所有 linked worktrees 共享的 current Session binding read model。
- **Users**: Maintainer 和只读观察 Engineer 组织的 Program Orchestrator。
- **Platform**: tracked `agents/engineers/` artifacts、git-common-dir binding store、operator-only CLI、compact bootstrap capsule。
- **P0 surface**: `ModuleEngineerProfileV1`、两个 canary Profile/SOP、`EngineerBindingV1` store/events/lock、bind/status/retire/bootstrap-prompt。
- **Core metric**: N 个 worktrees 对同一 Engineer 只看到 0 或 1 个 current binding；Profile 不复制 capability 权威。
- **Hard constraint**: 本切片不开放任何 Session 发起的 engineer-scoped mutation，也不声称旧 Thread 已被技术 fencing。
- **Key risk**: 把 read-only manual canary 误报成 authenticated authorization。
- **Unknowns**: genesis/current corruption、transitive revision 与 event publication semantics 已在本修订冻结；重新批准仍需 schema/fixture review。
- **Acceptance scenarios**: Profile 引用 canonical capability、N-way binding CAS 只有一个 winner、genesis 与 missing-current 可判定、dangling event 不成为 current、所有 worktrees 读到同一 current。
- **Suggested next step**: 先实现纯 schema/fixture proof 并重新审阅本 PRD；未恢复 Approved 前不得进入 Sprint。

## Problem

当前 capability authority 已存在，但没有稳定 Engineer behavior contract 和共享 Session binding。若把 binding 写进 worktree-local `.ai/harness/state`，linked worktrees 可以各自声称 active；若立即让 Session 执行 mutation，又会在没有可信 principal 时制造伪 fencing。

### Product Direction

- Profile 是 tracked behavior/routing contract，引用 ArchContext `capability_id`、SOP 和 delegation policy。
- Binding current/event/lock 位于 `<git-common-dir>/repo-harness/engineers/v1/`。
- 所有 bind/retire 操作由本地 Human operator CLI 发起，并使用 expected binding ID/generation/engineer contract revision CAS。
- Session 只接收 bootstrap capsule 并读取 status；没有 engineer mutation command。

Hard Constraints:

- 不创建 `ModuleGraphV1`、`engineering/modules/` 或 copied `owned_paths`。
- 一个 Engineer 最多一个 current active binding。
- no events + no current 是 generation 0 genesis/unbound；有 events + missing/corrupt current fail closed；不得从 Provider history 或 newest event 自动重建 active binding。
- Binding rotation 不修改 Lease、Claim token、Publication 或 task rows。
- `binding_generation` 与 Lease `generation` 永远是不同字段。

### Feasibility Boundary

- **Confirmed**: git-common-dir resolution、exclusive directory lock、atomic temp+rename 和 exact schema validation 已有 repo precedent。
- **[UNKNOWN]**: none for read-only projection.
- **[UNVERIFIED]**: Provider Session 是否仍可达只作为 observation；不可用于 takeover 或 task state。

## Users

### Primary Users

- **Maintainer**: 创建/审查 Profile/SOP，显式 bind/retire，并看到 CAS 结果。
- **Program Orchestrator**: 读取 Engineer、capability、profile revision 和 current binding，不执行 mutation。

### Secondary Users

- **Provider Session**: 读取 bootstrap capsule，不能以自报身份调用 engineer mutation。

## Success Criteria

| Metric | Target | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Active binding per Engineer | exactly 0 or 1 | N-way CAS test | >1 |
| Cross-worktree current consistency | 100% | linked-worktree fixture | any disagreement |
| Profile capability validity | 100% | ArchContext resolver validation | invalid accepted |
| Binding rotation Lease mutation | 0 bytes | lease tree digest | any change |
| Bootstrap capsule | ≤400 estimated tokens before shared SessionStart sections | token fixture | >600 |

## Acceptance Scenarios

### Scenario 1: Capability-backed profile

- **Given**: Profile references `capability.verification.evals-checks`.
- **When**: profile validation and bootstrap projection run.
- **Then**: responsibility/paths/check pointers come from the canonical node/architecture context, not copied Profile fields.
- **Machine-checkable evidence**: exact-key schema test and resolver fixture.

### Scenario 2: Binding CAS race

- **Given**: no active binding and N operators race with the same expected empty generation.
- **When**: bind executes under the per-engineer lock.
- **Then**: one record becomes current generation 1; all losers receive typed stale refusal.
- **Machine-checkable evidence**: one current record, one immutable winning event and N-1 refusal results.

### Scenario 3: Read-only canary does not overclaim fencing

- **Given**: binding B1 is retired and B2 becomes current.
- **When**: old Provider Thread resumes.
- **Then**: status shows B1 retired, but the product makes no mutation-fencing claim because no Session mutation command exists.
- **Machine-checkable evidence**: CLI surface inventory contains no engineer mutation route.

## Non-goals

- Authenticated EngineerPrincipal or per-binding credentials.
- Task acquire, ClaimActorReceipt, delegation, messaging, Worker Host or Human Board.
- Automatic Provider Session create/send/stop.
- Active bound-task handoff.

## Module Behaviors (P0)

### Module 1: Profile/SOP

- **Purpose**: define stable Engineer behavior without duplicating capability authority.
- **Normal path**: validate Profile → resolve capability revision → hash canonical Profile bytes + SOP bytes + capability revision into `engineer_contract_revision` → produce compact bootstrap refs.
- **Failure path**: missing capability, invalid role, missing SOP or digest mismatch fails closed.
- **Dependencies**: ArchContext resolver and tracked Git files.

### Module 2: Shared Binding Store

- **Purpose**: maintain one current binding across linked worktrees.
- **Normal path**: lock Engineer → classify genesis/current → validate expected current and contract revision → append immutable event → atomically replace current pointer.
- **Failure path**: stale expectation, symlink, malformed file, lock timeout, events-without-current or current/event digest mismatch produces typed refusal.
- **States**: `active → retiring → retired`; a new active generation requires the old current to be retired in the same locked transition.
- **Current authority**: `current.json` is the only current-state authority. Events are immutable audit history; a future/dangling event is never auto-promoted or selected by timestamp.
- **Genesis rule**: no engineer directory or no events plus no current means generation 0 `unbound`; any events plus missing current is corruption and fails closed.
- **Crash/retry rule**: crash after event append but before pointer replacement leaves a diagnosable unpublished event. Retry reuses the same deterministic event digest when transition inputs are identical; otherwise it creates a new event, but neither is current until pointer CAS publishes it.

### Module 3: Operator/Projection Surface

- **Purpose**: expose `profile list/show`, `binding bind/status/retire`, and `bootstrap-prompt`.
- **Hard constraint**: commands are operator actions; bootstrap output carries no bearer credential or task authority.

## Data Model

```yaml
ModuleEngineerProfileV1:
  protocol: 1
  kind: repo-harness-module-engineer-profile
  engineer_id: engineer:capability.verification.evals-checks
  capability_id: capability.verification.evals-checks
  sop_ref: agents/engineers/sops/verification-evals-checks.md
  delegation_policy:
    allowed_roles: [explorer, root-cause-prover, fast-worker, deep-worker]
    max_depth: 1
    max_parallel_readers: 3
    max_parallel_writers: 1
  max_active_claims: 1
  escalation_policy:
    cross_capability_change: interface_request
    acceptance: independent_plane

EngineerBindingV1:
  protocol: 1
  kind: repo-harness-engineer-binding
  binding_id: uuid
  engineer_id: engineer:capability.verification.evals-checks
  binding_generation: 1
  provider: codex
  provider_thread_id: opaque
  host_id: local
  engineer_contract_revision: sha256:...
  state: active
  previous_binding_id: null
  bound_at: datetime
  retired_at: null

EngineerBindingCurrentV1:
  protocol: 1
  kind: repo-harness-engineer-binding-current
  engineer_id: engineer:capability.verification.evals-checks
  binding_generation: 0
  state: unbound|active|retired
  current_binding_id: null
  current_event_digest: null
  engineer_contract_revision: sha256:...
```

Store:

```text
<git-common-dir>/repo-harness/engineers/v1/
  locks/<engineer-key>.lock/
  <engineer-key>/current.json
  <engineer-key>/events/<event-digest>.json
```

## Performance Targets

| Target | Number | Measurement Method | Degradation Threshold |
|---|---:|---|---:|
| Bind/retire CAS | ≤250 ms local | store benchmark | 2 s |
| Status projection | ≤100 ms local | fixture benchmark | 1 s |
| Bootstrap capsule | ≤400 estimated tokens | budget fixture | 600 |

## Known Unknowns

| Item | Impact | Resolution Path | Owner |
|---|---|---|---|
| Provider reachability observation accuracy | Display only | keep `unknown` and never infer liveness | Runtime owner |
| ME-0A approval after amendment | Blocks implementation | schema review plus crash/genesis fixture evidence | Maintainer |

## Developer Handoff

- **Build first**: pure schemas/canonical bytes, git-common-dir paths, lock/CAS store, then CLI/projection and two canary profiles/SOPs.
- **Do not reinterpret**: no Session mutation, no self-declared principal, no copied paths/checks, no automatic Session lifecycle, no reconstruction of current from the newest event.
- **You may improve**: operator text rendering and Profile/SOP prose without changing closed schemas.
- **Verify with**: unit schema/store tests, linked-worktree race fixtures, bootstrap budget fixture, Lease digest equality and repo required checks.

### Acceptance Scripts

1. Validate both canary capabilities and transitive engineer contract revisions.
2. Race N binds from generation 0; assert exactly one current binding and explicit unbound genesis before the race.
3. Read current from two linked worktrees; assert canonical bytes match.
4. Retire/rebind; assert generation increments and Lease tree digest is unchanged.
5. Remove current with no events and assert genesis/unbound; remove current with events and assert corruption/fail-closed.
6. Crash after event append; assert current remains authoritative, dangling event is diagnostic only, and deterministic retry publishes exactly one transition.
7. Change only SOP bytes and then only capability revision; assert `engineer_contract_revision` changes and stale expected revision loses CAS.

## Backend Perspective

Core owns closed schemas, canonicalization and transitions. Effects own Git common-dir resolution, lock, safe paths and atomic files. CLI owns operator intent only; no Provider adapter is introduced in ME-0A.
