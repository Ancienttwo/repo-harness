# Plan: ME-2A Read-only Admission and Conditional ME-3B Adapter

> **Status**: Approved
> **Created**: 20260826-0257
> **Slug**: me2a-me3b-readonly-delegation
> **Planning Source**: codex-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Effective read-only sandbox, exact logical role profile, and at-most-once delegated run
> **Rollback Surface**: ME-2A/ME-3B schemas, stores, Codex CLI adapter, CLI, tests, PRDs, ArchContext
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md`
> **Task Review**: `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md`
> **Implementation Notes**: `tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md`
- Sprint contract: `tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md`
- Sprint review: `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md`
- Implementation notes: `tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md`.

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
- Contract file: `tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md`
- Review file: `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md`
- Implementation notes file: `tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: ME-2A/ME-3B schemas, stores, Codex CLI adapter, CLI, tests, PRDs, ArchContext
- **Verification boundary**: Effective read-only sandbox, exact logical role profile, and at-most-once delegated run
- **Review/acceptance boundary**: `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260826-0257-me2a-me3b-readonly-delegation.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260826-0257-me2a-me3b-readonly-delegation.contract.md`, `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md`, and `tasks/notes/20260826-0257-me2a-me3b-readonly-delegation.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260826-0257-me2a-me3b-readonly-delegation.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: ME-2A/ME-3B schemas, stores, Codex CLI adapter, CLI, tests, PRDs, ArchContext

## Captured Planning Output

## Decision Summary

Deliver the first supported read-only delegation path as two explicit control-plane boundaries: ME-2A admits an exact logical Role Profile and frozen Codex read-only capability receipt; conditional ME-3B performs exactly one `codex exec --sandbox read-only` subprocess effect behind an immutable intent. The current native `SubagentStart` path remains observable but is rejected for read-only admission because the real canary wrote a sentinel despite `sandbox_mode = "read-only"` in TOML. The Codex CLI canary is the supported proof carrier because Seatbelt denied the same mutation and left the protected repository unchanged.

## P1 Architecture Map

- Existing Task, Lease, WorkEnvelope, Engineer Binding and ClaimActorReceipt stores remain the only parent/ownership authorities.
- `.codex/agents/<role>.toml` is the exact logical Role Profile source. Its profile/config digest and rendered execution packet are admitted; the adapter must not claim that Provider-native `agent_type` ran.
- New pure delegation schemas own canonical bytes, digests, rejection reasons and state transitions only.
- New effect stores under the git common directory own immutable admission/intent/observation/result bytes and one current observation pointer per dispatch.
- Conditional ME-3B uses the existing bounded process supervisor pattern to invoke one external Codex CLI command. It does not implement a model loop, tool parser, history, compaction, scheduler, daemon, fallback or writable mode.
- Worker result/prose is untrusted evidence and has no Task, Lease, Publication or Acceptance mutation path.
- ME-2C, ME-4A/B and ME-2B are explicitly outside this work package.

## P2 Concrete Trace

1. The caller supplies exact canonical Task revision, current Lease claim/generation and WorkEnvelope digest plus current Engineer Binding and ClaimActorReceipt digest.
2. Admission re-reads every authoritative parent byte, loads one tracked read-only logical Role Profile, and joins it to one frozen Codex CLI capability receipt whose mutation matrix and protected-snapshot digests prove effective read-only enforcement.
3. Any stale parent, unavailable profile, non-read-only profile, stale CLI/version/template or unsupported sandbox scope produces a terminal rejected receipt and no subprocess intent.
4. An admitted envelope persists one content-addressed DelegatedRunIntent before effect. The adapter atomically claims launch, invokes exactly one `codex exec --sandbox read-only --ephemeral --ignore-user-config --json` action with an explicit model/profile packet, and records raw JSONL/stdout/stderr/exit/snapshot evidence.
5. If acknowledgement is lost after launch claim, reconciliation never respawns; it records `reconciliation_required`. The P0 guarantee is at-most-once host action, not exactly-once successful completion.
6. A completed run produces WorkerRunRef and WorkerResult bytes only after role-profile, capability, sandbox scope, process receipt and before/after protected snapshots revalidate. Result prose remains untrusted and cannot advance any authority.

## P3 Design Decision

The provider-native child path is rejected because observed role configuration is not effective permission evidence. A one-shot Codex CLI adapter is the smallest supported runtime boundary because it exposes an enforceable `read-only` sandbox while keeping the control plane out of Provider internals. Logical Role Profile identity is honest and verifiable from frozen TOML/SOP bytes; pretending the CLI run is a native `agent_type` would create false authority. At 10x scale, subprocess startup and protected-snapshot hashing fail first; bounded path manifests and explicit batch observation can optimize later without introducing a daemon or changing authority.

## Canary Evidence To Freeze

- Native child canary at main `03db824da319ece33155fcca1e08303da5751d36`: `explorer` ran exact `touch .me2a-native-readonly-canary`, exit 0, sentinel existed. The controlled sentinel was then removed; unrelated `docs/researches/20260824-TDD-audit.md` remained untouched.
- Codex CLI 0.147.0 canary: exact `touch .me2a-cli-readonly-canary` under `codex exec --sandbox read-only --ephemeral --ignore-user-config --json` produced Seatbelt `operation_not_permitted`, command exit 1, sentinel absent.

## Task Breakdown

- [ ] Amend ME-2A/ME-3B PRDs and research with the frozen canary evidence, logical Role Profile semantics, protected-snapshot scope and at-most-once lost-ACK contract; mark both Approved only after the schemas are decision-complete.
- [ ] Add closed ME-2A/ME-3B schemas, canonical validation/digests and fail-closed transition rules.
- [ ] Add immutable git-common-dir admission/run stores with symlink-safe write-once persistence, launch claim and observation reconciliation.
- [ ] Add Codex CLI capability receipt plus one-shot read-only adapter with exact executable/version/argv/profile/sandbox/snapshot evidence and no fallback.
- [ ] Add bounded CLI commands for capability/admit/dispatch/observe/collect/read; no Task/Lease/Publication/Acceptance mutation routes.
- [ ] Add deterministic fixtures for stale parent/profile/capability, native-path rejection, sandbox mutation denial, role mismatch, lost ACK, changed protected snapshot and untrusted WorkerResult.
- [ ] Register ArchContext capability/workstream and complete focused, full, architecture, workflow and exact-subject acceptance gates.

## Verification

- Focused ME-2A admission and ME-3B adapter/store/CLI suites using a deterministic fake Codex executable plus the frozen real canary evidence.
- Existing Lease, Engineer Binding, ClaimActorReceipt, SubagentStart observation, Provider-thread effect and process-supervisor regressions.
- Route inventory proves no daemon, generic Worker Host, Provider fallback, query loop, writable delegation or authority mutation.
- `bun run check:type`; full `bun test --timeout 60000`; deploy SQL, architecture sync, task sync, strict workflow, project-state inspection and init dry-run.
- Exact-subject Change Assessment and protocol-2 AcceptanceReceipt before merge.

## Rollback

Revert the single ME-2A/ME-3B publication commit. Immutable evidence has no mutable Task/Lease/Publication/Acceptance pointer; no runtime daemon or background process remains.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Amend ME-2A/ME-3B PRDs and research with the frozen canary evidence, logical Role Profile semantics, protected-snapshot scope and at-most-once lost-ACK contract; mark both Approved only after the schemas are decision-complete.
- [ ] Add closed ME-2A/ME-3B schemas, canonical validation/digests and fail-closed transition rules.
- [ ] Add immutable git-common-dir admission/run stores with symlink-safe write-once persistence, launch claim and observation reconciliation.
- [ ] Add Codex CLI capability receipt plus one-shot read-only adapter with exact executable/version/argv/profile/sandbox/snapshot evidence and no fallback.
- [ ] Add bounded CLI commands for capability/admit/dispatch/observe/collect/read; no Task/Lease/Publication/Acceptance mutation routes.
- [ ] Add deterministic fixtures for stale parent/profile/capability, native-path rejection, sandbox mutation denial, role mismatch, lost ACK, changed protected snapshot and untrusted WorkerResult.
- [ ] Register ArchContext capability/workstream and complete focused, full, architecture, workflow and exact-subject acceptance gates.
