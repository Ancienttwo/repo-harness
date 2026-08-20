# Plan: MCP Workspace Cleanup Target Binding

> **Status**: Archived
> **Created**: 20260820-2054
> **Slug**: mcp-workspace-cleanup-target-binding
> **Planning Source**: user-approved-plan
> **Orchestration Kind**: parent-agent
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: risk_boundary
> **Verification Boundary**: Target-bound cleanup regression plus root required checks
> **Rollback Surface**: Workspace state target field, merge classifier, cleanup tests
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md`
> **Task Review**: `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md`
> **Implementation Notes**: `tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from user-approved-plan planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md`
- Sprint contract: `tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md`
- Sprint review: `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md`
- Implementation notes: `tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md`.

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
- Contract file: `tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md`
- Review file: `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md`
- Implementation notes file: `tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Workspace state target field, merge classifier, cleanup tests
- **Verification boundary**: Target-bound cleanup regression plus root required checks
- **Review/acceptance boundary**: `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: risk_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-2054-mcp-workspace-cleanup-target-binding.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-2054-mcp-workspace-cleanup-target-binding.contract.md`, `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md`, and `tasks/notes/20260820-2054-mcp-workspace-cleanup-target-binding.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-2054-mcp-workspace-cleanup-target-binding.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Workspace state target field, merge classifier, cleanup tests

## Captured Planning Output

## Goal

Bind managed MCP workspace cleanup to the integration target selected when the workspace is opened, so cleanup can never decide merge status from the source checkout's incidental `HEAD`.

## Success Criteria

- New managed workspaces persist a stable integration target ref; a requested `HEAD` is normalized to the current branch ref and detached `HEAD` fails closed.
- Cleanup evaluates the workspace branch against that persisted target through one typed merge decision that recognizes direct ancestry and squash absorption.
- Legacy, missing, floating, or unresolvable cleanup targets fail closed without removing the worktree, branch, or state row.
- CLI-visible workspace output exposes the bound integration target without changing unrelated coding-tool behavior.
- Focused regression tests and the repository required checks pass.

## Scope

- `src/cli/mcp/coding-workspaces.ts`
- MCP coding workspace cleanup/open contracts and their focused tests
- Required workflow artifacts and durable documentation only where the new safety invariant must be recorded

## Non-goals

- Initialize/session lease repair
- Health-path caching
- Stale workspace list isolation
- Native Windows helper portability
- Compatibility inference for old workspace records

## P1 Architecture Map

The workspace manager owns creation-time Git identity and persisted cleanup state. The CLI cleanup command delegates to `cleanupManagedCodingWorkspace`; Git refs are the merge authority, and filesystem deletion is the final safety sink.

## P2 Concrete Trace

`open_workspace(repo_id, base_ref)` resolves the requested commit, creates a managed branch/worktree, and persists its record. Later `workspace cleanup` loads that record, checks dirtiness, classifies the branch against the recorded integration target, and only then removes the worktree, branch, and state row. Any missing or ambiguous target stops before mutation.

## P3 Decision

Add a distinct persisted integration-target field rather than overloading `baseRef` or `baseSha`. Normalize symbolic `HEAD` at creation, preserve one merge-classification authority, and reject legacy records that lack the new contract. This is the smallest coherent change that protects the deletion invariant; at 10x scale Git process cost grows linearly, but correctness remains per-record and fail-closed.

## Task Breakdown

- [x] Add a red regression proving an unrelated source `HEAD` cannot authorize cleanup.
- [x] Persist and expose a stable integration target for newly opened managed workspaces.
- [x] Replace incidental-HEAD ancestry with typed target-bound direct/squash merge classification.
- [x] Add fail-closed and positive cleanup regression coverage.
- [ ] Run focused and repository verification, review the final diff, and close workflow artifacts.

## Verification

- `bun test tests/cli/mcp-coding-tools.test.ts --timeout 60000`
- Root required checks from `AGENTS.md`

## Rollback

Revert the workspace record field, target resolver, merge classifier, and tests as one unit. Existing legacy rows remain untouched on disk because the implementation rejects them before mutation.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Add a red regression proving an unrelated source `HEAD` cannot authorize cleanup.
- [x] Persist and expose a stable integration target for newly opened managed workspaces.
- [x] Replace incidental-HEAD ancestry with typed target-bound direct/squash merge classification.
- [x] Add fail-closed and positive cleanup regression coverage.
- [ ] Run focused and repository verification, review the final diff, and close workflow artifacts.
