# Plan: ME-1 acceptance follow-up fixes

> **Status**: Archived
> **Created**: 20260826-2233
> **Slug**: me1-acceptance-followup
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: Focused ME-1 oracles plus typecheck and task-sync green before merge
> **Rollback Surface**: Per-part commits on one revertable branch
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md`
> **Task Review**: `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md`
> **Implementation Notes**: `tasks/notes/20260826-2233-me1-acceptance-followup.notes.md`

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

- Active plan: `plans/plan-20260826-2233-me1-acceptance-followup.md`
- Sprint contract: `tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md`
- Sprint review: `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md`
- Implementation notes: `tasks/notes/20260826-2233-me1-acceptance-followup.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260826-2233-me1-acceptance-followup.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260826-2233-me1-acceptance-followup.md`.

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
- Contract file: `tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md`
- Review file: `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md`
- Implementation notes file: `tasks/notes/20260826-2233-me1-acceptance-followup.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260826-2233-me1-acceptance-followup.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: Per-part commits on one revertable branch
- **Verification boundary**: Focused ME-1 oracles plus typecheck and task-sync green before merge
- **Review/acceptance boundary**: `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260826-2233-me1-acceptance-followup.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260826-2233-me1-acceptance-followup.contract.md`, `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md`, and `tasks/notes/20260826-2233-me1-acceptance-followup.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260826-2233-me1-acceptance-followup.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: Per-part commits on one revertable branch

## Captured Planning Output

## Goal

Close the ME-1 acceptance round findings: fix the two runtime defects (ME-1B degraded-path asymmetry, ME-1C rotation stranding), sweep the two remaining error-code whitelist gaps (sprint.ts, MCP ModuleMessageError), deliver the missing contract-promised tests (ME-1A concurrency/MCP/blockers, ME-1B Fleet isolation/three-view), and complete the stranded ME-1C closeout.

## Context

Gatekeeper acceptance of ME-1A (a8a0c983), ME-1B (e0dab6f6), ME-1C (6aeb9346) returned FAIL each. User approved all three fix slices on 2026-08-26.

## Scope

Part 1 — runtime defect fixes:
- `src/effects/engineers/engineering-overlay.ts` first-read profiles failure must converge to `degraded` (empty engineers projection) instead of throwing `engineering_overlay_invalid`; regression test for the first-read direction.
- `src/effects/engineers/module-inbox.ts` assignment-scope `delivered` receipts must be superseded on binding rotation (fence check before the early return); regression test "receive then rotate".
- `src/cli/commands/sprint.ts` error layering per the engineer.ts whitelist pattern (domain codes pass through, `invalid_argument`, `internal_error`); tests assert the `error` field.
- `src/cli/mcp/engineer-tools.ts` add `ModuleMessageError` to the MCP error whitelist; test asserting `module_message_invalid` for an invalid `message_type` via `engineer_message_send`.

Part 2 — contract-promised test debt:
- ME-1A: N-way concurrency election test (real or truly serializing lock, exactly one ME-0B acquire call), `engineer_offers` MCP protocol tests (offers shape + missing-fence INVALID_ARGUMENT + stale offer), three blocker-branch fixtures (profile_capability_mismatch, binding_inactive, dependency_not_ready), generic-v1 effects-level exclusion test.
- ME-1B: real Fleet isolation test (same fixture repo, Fleet bytes unchanged across binding rotation), single-fixture three-view semantic-independence test, route-inventory assertion (no mutation routes registered).

Part 3 — ME-1C closeout and archiver hygiene:
- Record the typed AcceptanceReceipt for the ME-1C contract and archive its plan/contract/review/notes; add the canary research doc to its allowed_paths first.
- Fix the review header/receipt sync and internal-pointer rewrite in the archive tooling per the todos ledger entry (projectAcceptance header sync or a strict check), smallest coherent change.

Out of scope: ME-1B binding observation producer (needs ME-3A wiring decision), ME-1A cross-repo topology narrowing, listModuleInbox removal beyond a mechanical delete, PRD text fixes beyond the two safe_auto items, any push.

## Verification Boundary

Focused oracles below green on the combined change before merge; no full-suite runs (user cost constraint).

## Rollback Surface

Per-part commits on one branch; revert of the branch merge restores prior behavior.

## Oracles

- `bun test tests/unit/me1b-engineering-overlay.test.ts tests/unit/me1c-module-inbox.test.ts tests/cli/sprint.test.ts tests/cli/mcp-engineer-tools.test.ts --timeout 60000`
- `bun test tests/unit/me1a-engineer-scheduling-schema.test.ts tests/unit/me1a-engineer-scheduling.test.ts tests/unit/me1a-engineer-scheduling-acquire.test.ts --timeout 60000`
- `bun run check:type`
- `bash scripts/check-task-sync.sh`

## Task Breakdown

- [ ] Part 1: fix the four runtime/error-code defects with regression tests.
- [ ] Part 2: deliver the ME-1A and ME-1B contract-promised tests.
- [ ] Part 3: ME-1C acceptance receipt + archive, and archiver header/pointer hygiene fix.
- [ ] Run focused oracles, gatekeeper review, merge to main without push.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] Part 1: fix the four runtime/error-code defects with regression tests.
- [ ] Part 2: deliver the ME-1A and ME-1B contract-promised tests.
- [ ] Part 3: ME-1C acceptance receipt + archive, and archiver header/pointer hygiene fix.
- [ ] Run focused oracles, gatekeeper review, merge to main without push.
