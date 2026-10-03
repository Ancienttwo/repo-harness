# Plan: BRC14/15 text Connector activation

> **Status**: Executing
> **Created**: 20260909-1202
> **Slug**: brc1415-text-connector
> **Planning Source**: waza-think
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260909-1202-brc1415-text-connector.contract.md --strict`.
> **Rollback Surface**: Before execution remove `plans/plan-20260909-1202-brc1415-text-connector.md`; after execution revert branch `codex/brc1415-text-connector` or the explicitly reviewed diff.
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260909-1202-brc1415-text-connector.contract.md`
> **Task Review**: `tasks/reviews/20260909-1202-brc1415-text-connector.review.md`
> **Implementation Notes**: `tasks/notes/20260909-1202-brc1415-text-connector.notes.md`

## Agentic Routing
- Selected route: planning
- Routing reason: Captured from waza-think planning output.
- Source ref: (none)
- Due diligence:
  - P1 map: See captured planning output below.
  - P2 trace: See captured planning output below.
  - P3 decision rationale: See captured planning output below.

## Workflow Inventory
Complete this inventory before implementation. If any line is unknown, keep the plan in Draft and fill it before projection.

- Active plan: `plans/plan-20260909-1202-brc1415-text-connector.md`
- Sprint contract: `tasks/contracts/20260909-1202-brc1415-text-connector.contract.md`
- Sprint review: `tasks/reviews/20260909-1202-brc1415-text-connector.review.md`
- Implementation notes: `tasks/notes/20260909-1202-brc1415-text-connector.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260909-1202-brc1415-text-connector.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260909-1202-brc1415-text-connector.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260909-1202-brc1415-text-connector.md`.

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
- Contract file: `tasks/contracts/20260909-1202-brc1415-text-connector.contract.md`
- Review file: `tasks/reviews/20260909-1202-brc1415-text-connector.review.md`
- Implementation notes file: `tasks/notes/20260909-1202-brc1415-text-connector.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260909-1202-brc1415-text-connector.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260909-1202-brc1415-text-connector.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Before execution remove `plans/plan-20260909-1202-brc1415-text-connector.md`; after execution revert branch `codex/brc1415-text-connector` or the explicitly reviewed diff.
- **Verification boundary**: Commands named in the captured planning output plus `repo-harness run verify-contract --contract tasks/contracts/20260909-1202-brc1415-text-connector.contract.md --strict`.
- **Review/acceptance boundary**: `tasks/reviews/20260909-1202-brc1415-text-connector.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260909-1202-brc1415-text-connector.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260909-1202-brc1415-text-connector.contract.md`, `tasks/reviews/20260909-1202-brc1415-text-connector.review.md`, and `tasks/notes/20260909-1202-brc1415-text-connector.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260909-1202-brc1415-text-connector.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Before execution remove `plans/plan-20260909-1202-brc1415-text-connector.md`; after execution revert branch `codex/brc1415-text-connector` or the explicitly reviewed diff.

## Captured Planning Output

## Goal
Replace campaign UI app preselection with literal @github connector prompt activation, retaining real Connector history and exact-SHA acceptance. Owner explicitly approved this change after APP_SELECTION_UNVERIFIED prevented submission.
## P1 / P2 / P3
The four campaign calls use chatgptApp, which produces Oracle --browser-app and fails before submit. CampaignBrowserSession separately requires a composer pill. Replace the call transport with a shared literal mention and conversation capture. Validate invocation-owned provider history, latest completed turn, GitHub tool identity and successful tool status. Existing version decoder continues verifying exact raw GitHub resources and SHA. Existing immutable historical receipts retain their original meaning; new receipts use captured Connector calls. No Oracle edits, model overrides, fabricated evidence or budget reset.
## Scope
src/core/automation/campaign-browser-session.ts; four automation callers; affected session/authoring/adoption/revision/audit/step tests and shared fixtures; durable research. Recovery of the original failed revision observation is a subsequent bounded task and is not silently enabled by this transport change.
## Verification
Focused campaign tests, typecheck and six required repository integrity checks. No local full suite; mandatory CI remains required. Negative evidence includes no tool, forged text, wrong turn, wrong connector and tampered history. Freeze the code before final acceptance.
## Task Breakdown
- [ ] Change four campaign request paths and evidence reader.
- [ ] Verify positive text invocation and negative history boundaries.
- [ ] Record exact acceptance, PR, CI and merge; preserve real canary failure separately.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Change four campaign request paths and evidence reader.
- [ ] Verify positive text invocation and negative history boundaries.
- [ ] Record exact acceptance, PR, CI and merge; preserve real canary failure separately.
