> **Archived**: 2026-09-13 19:01
> **Related Plan**: plans/archive/plan-20260913-1843-architecture-agent-guidance.md
> **Outcome**: Completed
> **Lifecycle**: plan
> **Parent Run ID**: run-20260913-1901
> **Archive Projection V1**: `plans/plan-20260913-1843-architecture-agent-guidance.md` => `plans/archive/plan-20260913-1843-architecture-agent-guidance.md`
> **Archive Projection V1**: `tasks/notes/20260913-1843-architecture-agent-guidance.notes.md` => `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`
> **Archive Projection V1**: `tasks/contracts/20260913-1843-architecture-agent-guidance.contract.md` => `tasks/archive/contract-20260913-1901-architecture-agent-guidance.md`
> **Archive Projection V1**: `tasks/reviews/20260913-1843-architecture-agent-guidance.review.md` => `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`

# Plan: Architecture coverage guidance for Agents

> **Status**: Archived
> **Created**: 20260913-1843
> **Slug**: architecture-agent-guidance
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: SessionStart evidence-based guidance and Agent ChangeSet procedure
> **Rollback Surface**: SessionStart advice and architecture skill
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/archive/contract-20260913-1901-architecture-agent-guidance.md`
> **Task Review**: `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`
> **Implementation Notes**: `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from repo-harness-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/archive/plan-20260913-1843-architecture-agent-guidance.md`
- Sprint contract: `tasks/archive/contract-20260913-1901-architecture-agent-guidance.md`
- Sprint review: `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`
- Implementation notes: `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/archive/contract-20260913-1901-architecture-agent-guidance.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/archive/plan-20260913-1843-architecture-agent-guidance.md` and may start `repo-harness run contract-worktree start --plan plans/archive/plan-20260913-1843-architecture-agent-guidance.md`.

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
- Contract file: `tasks/archive/contract-20260913-1901-architecture-agent-guidance.md`
- Review file: `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`
- Implementation notes file: `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/archive/contract-20260913-1901-architecture-agent-guidance.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/archive/plan-20260913-1843-architecture-agent-guidance.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: SessionStart advice and architecture skill
- **Verification boundary**: SessionStart evidence-based guidance and Agent ChangeSet procedure
- **Review/acceptance boundary**: `tasks/archive/review-20260913-1901-architecture-agent-guidance.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/archive/plan-20260913-1843-architecture-agent-guidance.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/archive/contract-20260913-1901-architecture-agent-guidance.md`, `tasks/archive/review-20260913-1901-architecture-agent-guidance.md`, and `tasks/archive/notes-20260913-1901-architecture-agent-guidance.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/archive/review-20260913-1901-architecture-agent-guidance.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: SessionStart advice and architecture skill

## Captured Planning Output

## Why

init enables global projection but projection only consumes declared nodes; the session advice pipeline only sees already matched drift. An empty or umbrella-only model therefore gives the Agent no registration guidance.

## Goal

Automatically give the Agent concrete model coverage observations at SessionStart when globally enabled, and a documented existing archctx ChangeSet route for Agent-owned boundary decisions and registration.

## P1 Architecture Map

Global architecture config owns enablement. Repository policy selects model authority; capability-resolver reads node YAML and owns prefix matching. SessionStart already delivers bounded actionable advice. archctx owns ChangeSet model writes and architecture projections. Repository models stay project-local.

## P2 Concrete Trace

init writes the global architecture settings, then a normal Agent SessionStart reads them and the repository model. Today only pending requests surface and unregistered areas never produce requests. Add read-only coverage observations to this existing context path: empty model, missing declared module docs, and tracked package manifests sharing only an ancestor capability or having no match. Agent inspects sources, decides semantic boundaries, plans/applies a ChangeSet, validates and runs the existing projection.

## P3 Decision

Reuse global enablement, the capability parser/matcher, SessionStart advice and the architecture skill. A package is an observation unit, never a generated semantic capability. No new queue, model writer, LLM runner, dependency, config flag or local runtime authority. Bound Git discovery by timeout/output cap and rendered examples; malformed model/config reports failure instead of inventing suggestions. At 10x repository size the Git index observation reaches its explicit bound first; no whole source scan in a hook.

## Scope

SessionStart coverage advice, its existing tests/provider diagnostics, architecture skill procedure and mirrored operator docs. No global tool upgrades, publishing, unrelated queue repair, automatic semantic synthesis, or target repository changes.

## Approved recovery extension

User approved resolving task-sync recovery. The helper already accepts exact bound evidence before requesting a profile. On resolver exit 1 it hides the digest needed to reach that existing path. Preserve fail-closed profile behavior and expose the exact required binding; test failed invocation followed by exact binding and successful recovery without altering failed evidence or resolver status.

## Task Breakdown

- [x] Implement globally gated coverage observations in the existing session context path.
- [x] Document Agent decision and ChangeSet authoring workflow in the architecture skill and mirrored reference docs.
- [x] Fix task-sync recovery diagnostics and prove exact-binding recovery.
- [x] Verify focused fixture behavior and required repository checks, review once and close the local contract without merge.

## Verification

Existing session-context tests cover empty model, shared ancestor mapping, unmapped package, missing docs, healthy silence, global disable, malformed authority, and no model mutations. Required repository integrity checks remain in the contract Verification Plan. Dry-run only; adoption transaction is unchanged.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Approved recovery extension

User approved resolving task-sync recovery. The helper already accepts exact bound evidence before requesting a profile. On resolver exit 1 it hides the digest needed to reach that existing path. Preserve fail-closed profile behavior and expose the exact required binding; test failed invocation followed by exact binding and successful recovery without altering failed evidence or resolver status.

## Task Breakdown
- [x] Implement globally gated coverage observations in the existing session context path.
- [x] Document Agent decision and ChangeSet authoring workflow in the architecture skill and mirrored reference docs.
- [x] Fix task-sync recovery diagnostics and prove exact-binding recovery.
- [x] Verify focused fixture behavior and required repository checks, review once and close the local contract without merge.
