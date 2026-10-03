# Plan: Repair task-agent exited-process identity polling

> **Status**: Executing
> **Created**: 20261001-0329
> **Slug**: task-session-exit-state-identity
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Held-zombie regression and identical zero-model lifecycle before/after
> **Rollback Surface**: Single processProofAlive predicate and regression guard
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md`
> **Task Review**: `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md`
> **Implementation Notes**: `tasks/notes/20261001-0329-task-session-exit-state-identity.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from codex-plan-or-waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20261001-0329-task-session-exit-state-identity.md`
- Sprint contract: `tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md`
- Sprint review: `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md`
- Implementation notes: `tasks/notes/20261001-0329-task-session-exit-state-identity.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20261001-0329-task-session-exit-state-identity.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20261001-0329-task-session-exit-state-identity.md`.

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
- Contract file: `tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md`
- Review file: `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md`
- Implementation notes file: `tasks/notes/20261001-0329-task-session-exit-state-identity.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20261001-0329-task-session-exit-state-identity.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Single processProofAlive predicate and regression guard
- **Verification boundary**: Held-zombie regression and identical zero-model lifecycle before/after
- **Review/acceptance boundary**: `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20261001-0329-task-session-exit-state-identity.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20261001-0329-task-session-exit-state-identity.contract.md`, `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md`, and `tasks/notes/20261001-0329-task-session-exit-state-identity.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20261001-0329-task-session-exit-state-identity.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Single processProofAlive predicate and regression guard

## Captured Planning Output

# task-session exited-process identity repair

## Goal

Fix normal close/cancel misclassifying an unreaped owned zombie as a reused live process, without changing persisted identity strings, ownership proofs, or signalling authority.

## P1 / P2 / P3

- Map: task-session exports processIdentity/assertProcessProof/processProofAlive; task-agent CLI/MCP and Claude reviewer share these primitives. Herdr supplies pane/terminal/agent identity; ps supplies process birth and exit state. E/canary, user configurations, default session and existing processes are out of scope.
- Trace: start commits provider identity; cancel verifies ownership and binding, sends SIGTERM, then processProofAlive polls kill(0)+ps. A zombie still satisfies kill(0) while comm changes; strict identity rejects it before parent reaps. PID/start mismatch must remain a hard refusal.
- Decision: first deterministically hold an unreaped owned child and capture old failure; measure real Codex/Claude8+8 before changing source. Treat only observed same-PID/same-lstart exit states as no longer alive inside processProofAlive. No persisted schema change, no retry/sleep/fallback/new abstraction.

## Workflow Inventory

This plan/contract/review/notes are owned by codex/task-session-exit-state-identity in /Users/chris/Projects/repo-harness-wt-task-session-exit-state-identity from origin/main281e6555. tasks/todos.md remains deferred-only; .ai/harness/runs/exit-state-identity is ignored evidence, checks/latest is cache. Source scope is src/effects/terminal/task-session.ts and the existing owning test. User authorized implementation and zero-model measurement, but gatekeeper PASS must precede commit/PR; no push/merge authorized.

## Verification Boundary

Deterministic real process guard must fail before production change and pass after; real provider lifecycle measured before/after without prompts. No claim that GO117 itself was observed as a zombie; advisor experiment and new direct sampling distinguish mechanism from inference.

## Rollback Surface

Single isolated processProofAlive/source+test/workflow package; revert after drain if eventually merged. No compatibility branch or other ownership changes.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] P0: deterministic pre-fix held-zombie regression and failure artifact;8+8 real zero-prompt pre-measurement with5ms ps sampler.
- [x] P1: minimal processProofAlive exit-state fix plus genuine PID/lstart mismatch guard; report all callers.
- [x] P2: identical8+8 post-measurement; related existing tests and Required Checks, platform limits.
- [ ] P3: external advisor/gatekeeper acceptance; implementation remains uncommitted, no push/PR/merge before explicit authorization.
