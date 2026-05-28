# Plan: {{TITLE}}

> **Status**: Draft
> **Created**: {{TIMESTAMP}}
> **Slug**: {{SLUG}}
> **Spec**: `docs/spec.md`
> **Research**: See `tasks/research.md`
> **Sprint Contract**: `tasks/contracts/{{SLUG}}.contract.md`
> **Sprint Review**: `tasks/reviews/{{SLUG}}.review.md`
> **Implementation Notes**: `tasks/notes/{{SLUG}}.notes.md`

## Agentic Routing
- Selected route:
- Routing reason:
- Due diligence:
  - P1 map:
  - P2 trace:
  - P3 decision rationale:

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `{{PLAN_FILE}}`
- Sprint contract: `tasks/contracts/{{SLUG}}.contract.md`
- Sprint review: `tasks/reviews/{{SLUG}}.review.md`
- Implementation notes: `tasks/notes/{{SLUG}}.notes.md`
- Todo projection: `tasks/todo.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/{{SLUG}}.contract.md` `allowed_paths`
- Concurrency rule: `.claude/.active-plan` selects the active plan when present; use `scripts/switch-plan.sh --plan {{PLAN_FILE}}` when multiple plans exist.
- Execution isolation: approved contract-level work projects through `scripts/plan-to-todo.sh --plan {{PLAN_FILE}}` and may start `scripts/contract-worktree.sh start --plan {{PLAN_FILE}}`.

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

## Task Contracts
- Contract file: `tasks/contracts/{{SLUG}}.contract.md`
- Review file: `tasks/reviews/{{SLUG}}.review.md`
- Implementation notes file: `tasks/notes/{{SLUG}}.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `bash scripts/verify-contract.sh --contract tasks/contracts/{{SLUG}}.contract.md --strict`
- Active plan rule: `.claude/.active-plan` is authoritative when present; latest non-archived `plans/plan-*.md` is a compatibility fallback only.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

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
