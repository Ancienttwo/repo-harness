# Plan: {{TITLE}}

> **Status**: Draft
> **Created**: {{TIMESTAMP}}
> **Slug**: {{SLUG}}
> **Artifact Level**: work-package
> **Promotion Reason**:
> **Verification Boundary**:
> **Rollback Surface**:
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`

## Agentic Routing
- Selected route:
- Routing reason:

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Optional plan: `{{PLAN_FILE}}`
- Verification: declare and execute a non-empty Verification Plan. Select its native report explicitly.
- Run snapshots: `.ai/harness/runs/`
- Scope authority: the active approved admission and its `allowed_paths`; this plan only proposes scope.
- Concurrency rule: use the current admitted task/session and immutable claim. Preserve the owning Git worktree and do not infer execution ownership from planning files.
- Planning export: `repo-harness run plan-to-todo --plan {{PLAN_FILE}}` prints this plan for a delegation brief or PR description; it does not activate work or create approval artifacts.
- Execution isolation: `repo-harness run contract-worktree start --plan {{PLAN_FILE}}` can create an isolated Git worktree. Worktree creation does not replace task/session admission.

## Approach
### Strategy
### Trade-offs
| Option | Pros | Cons | Decision |
|--------|------|------|----------|

## Detailed Design
### File Changes
| File | Action | Description |
|------|--------|-------------|

### Code Snippets
### Data Flow

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|

## Verification
- Verification command: `repo-harness run verification-plan execute --repo . --repository-id <repository-id> --issue-id <issue-id> --campaign-id <campaign-id> --grant-sha256 <approved-grant-sha256> --policy-sha256 <policy-sha256> --actor <actor-id> --report-file .ai/harness/runs/{{ARTIFACT_STEM}}.report.json`
- Planning selection is metadata only. Do not infer active execution from an active-plan marker or the latest non-archived plan.

## Handoff

- Verification: declare and execute a non-empty Verification Plan. Select its native report explicitly.
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**:
- **Rollback surface**:
- **Verification boundary**:
- **Review/acceptance boundary**:
- **High-risk surface**:
- **Why not checklist row**:

## Evidence Contract

- **State/progress path**:
- **Verification evidence**:
- **Evaluator rubric**:
- **Stop condition**:
- **Rollback surface**:

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] ...
