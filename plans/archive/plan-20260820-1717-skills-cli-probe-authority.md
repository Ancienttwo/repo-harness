# Plan: skills_cli probe: resolved binary, honest missing

> **Status**: Archived
> **Created**: 20260820-1717
> **Slug**: skills-cli-probe-authority
> **Planning Source**: codex-plan-or-waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260820-1717-skills-cli-probe-authority.md`; after execution revert branch `codex/skills-cli-probe-authority` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md`
> **Task Review**: `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md`
> **Implementation Notes**: `tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md`

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

- Active plan: `plans/plan-20260820-1717-skills-cli-probe-authority.md`
- Sprint contract: `tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md`
- Sprint review: `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md`
- Implementation notes: `tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260820-1717-skills-cli-probe-authority.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260820-1717-skills-cli-probe-authority.md`.

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
- Contract file: `tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md`
- Review file: `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md`
- Implementation notes file: `tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260820-1717-skills-cli-probe-authority.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260820-1717-skills-cli-probe-authority.md`; after execution revert branch `codex/skills-cli-probe-authority` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260820-1717-skills-cli-probe-authority.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260820-1717-skills-cli-probe-authority.contract.md`, `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md`, and `tasks/notes/20260820-1717-skills-cli-probe-authority.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260820-1717-skills-cli-probe-authority.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260820-1717-skills-cli-probe-authority.md`; after execution revert branch `codex/skills-cli-probe-authority` or the explicitly reviewed diff.

## Captured Planning Output

## Goal
Close the last member of the former timing-flake ledger row: `scripts/check-agent-tooling.sh`'s `skills_cli` probe currently runs `bunx skills ls -g --json` under a 1500ms budget while the real command measures ~38s (25x over), making `runtime_capabilities.skills_cli.status` report `timed-out` for working installations in any non-stubbed environment. Replace the bunx invocation with direct resolution of the `skills` binary (PATH lookup); probe the resolved binary with a realistic budget (15000ms); when the binary is absent report an honest `missing` status instead of ever falling back to bunx. Update the stubbed test fixture and the `available` assertion accordingly, adjust the reported `command` string, and delete the closed ledger row from tasks/todos.md.

## Non-goals
No bunx fallback path (single probe authority, fail-closed); no change to other capability probes; no change to Waza skill inspection logic beyond the probe source; no CLAUDE.md/AGENTS.md edits.

## Task Breakdown
- [ ] Replace the bunx probe with resolved-binary probing and honest missing status in scripts/check-agent-tooling.sh; keep skill-item consumption intact.
- [ ] Update tests/check-agent-tooling.test.ts fixture (fake skills binary instead of fake bunx) and status assertions.
- [ ] Delete the closed ledger row; focused tests green; single commit through the contract gate.

## Verification Boundary
bun test tests/check-agent-tooling.test.ts; bash scripts/check-agent-tooling.sh --host both (smoke, real machine); check-task-sync; check-task-workflow --strict.

## Rollback Surface
Revert the single publication commit; no schema or external state.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Replace the bunx probe with resolved-binary probing and honest missing status in scripts/check-agent-tooling.sh; keep skill-item consumption intact.
- [ ] Update tests/check-agent-tooling.test.ts fixture (fake skills binary instead of fake bunx) and status assertions.
- [ ] Delete the closed ledger row; focused tests green; single commit through the contract gate.
