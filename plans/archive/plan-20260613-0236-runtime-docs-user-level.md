# Plan: Runtime Docs User-Level Externalization

> **Status**: Archived
> **Created**: 20260613-0236
> **Slug**: runtime-docs-user-level
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: chat:runtime-docs-user-level
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Sprint Contract**: `tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md`
> **Sprint Review**: `tasks/reviews/20260613-0236-runtime-docs-user-level.review.md`
> **Implementation Notes**: `tasks/notes/20260613-0236-runtime-docs-user-level.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: chat:runtime-docs-user-level
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260613-0236-runtime-docs-user-level.md`
- Sprint contract: `tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md`
- Sprint review: `tasks/reviews/20260613-0236-runtime-docs-user-level.review.md`
- Implementation notes: `tasks/notes/20260613-0236-runtime-docs-user-level.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree; `.claude/.active-plan` is a legacy fallback during transition. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan plans/plan-20260613-0236-runtime-docs-user-level.md` and may start `scripts/contract-worktree.sh start --plan plans/plan-20260613-0236-runtime-docs-user-level.md`.

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
- Contract file: `tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md`
- Review file: `tasks/reviews/20260613-0236-runtime-docs-user-level.review.md`
- Implementation notes file: `tasks/notes/20260613-0236-runtime-docs-user-level.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan`, the owning worktree is written to `.ai/harness/active-worktree`, and the plan is mirrored to `.claude/.active-plan` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Evidence Contract

- **State/progress path**: `plans/plan-20260613-0236-runtime-docs-user-level.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260613-0236-runtime-docs-user-level.contract.md`, `tasks/reviews/20260613-0236-runtime-docs-user-level.review.md`, and `tasks/notes/20260613-0236-runtime-docs-user-level.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260613-0236-runtime-docs-user-level.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: before execution remove `plans/plan-20260613-0236-runtime-docs-user-level.md`; after execution revert branch `codex/runtime-docs-user-level` or the generated task artifacts

## Captured Planning Output

# Runtime Docs User-Level Externalization

## Goal
Move generic repo-harness runtime documentation to user-level/package authority while keeping repo-local `.ai/` as the source of truth for each repository's policy, workflow contract, context registry, checks, runs, handoff, events, security, and helper runtime snapshot.

## Scope
- Add a `repo-harness docs` CLI surface to list and resolve bundled runtime/reference documentation.
- Convert installed `docs/reference-configs/*.md` in generated/migrated repos from full document copies into short pointer stubs.
- Preserve repo-local artifacts and helper runtime behavior under `.ai/harness/`.
- Update workflow contract, policy, init/migrate/scaffold helpers, checks, tests, README, and changelog to reflect the externalized docs boundary.

## Non-Scope
- Do not migrate `.ai/harness/runs`, `.ai/harness/checks`, `.ai/harness/handoff`, `.ai/harness/events.jsonl`, `.ai/harness/security`, `.ai/harness/policy.json`, `.ai/harness/workflow-contract.json`, or `.ai/context/*` to user-level state.
- Do not remove `.ai/harness/scripts` or convert helper runtime execution to pure user-level in this slice.
- Do not overwrite user-authored project-specific reference docs unless they match repo-harness managed content.

## Approach
Implement a minimal CLI docs resolver over the existing package reference docs. Init and migrate continue creating `docs/reference-configs/`, but write deterministic stubs with doc id, package version, and `repo-harness docs path <doc-id>` instructions. Strict workflow checks validate the stub shape rather than requiring full bundled prose in every target repo.

## Acceptance
- `repo-harness docs list` prints bundled runtime docs.
- `repo-harness docs path harness-overview` resolves the package/user-level source path.
- New scaffolds and migrated repos keep `docs/reference-configs/*.md` pointer stubs for required docs.
- Existing repo-local `.ai/harness/*` artifacts remain untouched.
- Focused tests and root workflow checks pass.

## Verification
- bun test tests/cli/docs.test.ts tests/workflow-contract.test.ts tests/bootstrap-files.test.ts tests/create-project-dirs.runtime.test.ts tests/migration-script.test.ts tests/readme-dx.test.ts
- bash scripts/check-task-workflow.sh --strict
- bash scripts/migrate-project-template.sh --repo . --dry-run

## Rollback
Revert the CLI/docs/stub changes and rerun `repo-harness update` to restore full `docs/reference-configs/*` copies. No external service or data rollback is needed.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [x] Execute captured plan: Runtime Docs User-Level Externalization
