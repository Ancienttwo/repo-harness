# Plan: SubagentStart long-command guardrail advisory

> **Status**: Archived
> **Created**: 20260819-0049
> **Slug**: subagent-long-command-guardrail
> **Planning Source**: repo-harness-plan
> **Orchestration Kind**: host-plan
> **Source Ref**: (none)
> **Artifact Level**: work-package
> **Promotion Reason**: verification_boundary
> **Verification Boundary**: bun test subagent-handler + tsc + full bun test
> **Rollback Surface**: revert subagent-handler.ts, one test file, one doc
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md`
> **Task Review**: `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md`
> **Implementation Notes**: `tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md`

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

- Active plan: `plans/plan-20260819-0049-subagent-long-command-guardrail.md`
- Sprint contract: `tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md`
- Sprint review: `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md`
- Implementation notes: `tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md`
- Deferred-goal ledger: `tasks/todos.md`
- Current checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Scope authority: `tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md` `allowed_paths`
- Concurrency rule: `.ai/harness/active-plan` selects the active plan for this worktree when present; `.ai/harness/active-worktree` records the owning worktree. If another worktree already owns active work, open or switch to the matching worktree instead of serializing unrelated plans.
- Execution isolation: approved contract-level work projects through `repo-harness run plan-to-todo --plan plans/plan-20260819-0049-subagent-long-command-guardrail.md` and may start `repo-harness run contract-worktree start --plan plans/plan-20260819-0049-subagent-long-command-guardrail.md`.

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
- Contract file: `tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md`
- Review file: `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md`
- Implementation notes file: `tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md`
- Template: `.claude/templates/contract.template.md`
- Verification command: `repo-harness run verify-contract --contract tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md --strict`
- Active plan rule: this captured plan is written to `.ai/harness/active-plan` and the owning worktree is written to `.ai/harness/active-worktree` unless --no-active is used. Do not infer active execution from the latest non-archived plan.

## Handoff

- Checks file: `.ai/harness/checks/latest.json`
- Session handoff: `.ai/harness/handoff/current.md`

## Promotion Gate

- **Merge/PR unit**: Captured plan `plans/plan-20260819-0049-subagent-long-command-guardrail.md` is the proposed mergeable execution unit; revise before execute if this is only a checklist step.
- **Rollback surface**: revert subagent-handler.ts, one test file, one doc
- **Verification boundary**: bun test subagent-handler + tsc + full bun test
- **Review/acceptance boundary**: `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md` must record pass against the captured acceptance criteria.
- **High-risk surface**: Risks named in captured planning output; keep the plan Draft if risk ownership is not concrete.
- **Why not checklist row**: verification_boundary

## Evidence Contract

- **State/progress path**: `plans/plan-20260819-0049-subagent-long-command-guardrail.md` task breakdown, `tasks/todos.md` deferred-goal ledger, `tasks/contracts/20260819-0049-subagent-long-command-guardrail.contract.md`, `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md`, and `tasks/notes/20260819-0049-subagent-long-command-guardrail.notes.md`
- **Verification evidence**: `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, and the commands named in the captured planning output
- **Evaluator rubric**: `tasks/reviews/20260819-0049-subagent-long-command-guardrail.review.md` must record a passing Waza /check style recommendation
- **Stop condition**: all task breakdown items are complete, sprint verification passes, and the review recommends pass
- **Rollback surface**: revert subagent-handler.ts, one test file, one doc

## Captured Planning Output

## Goal

Subagent handoff gains an advisory guardrail for long-running commands: SubagentStart context injects one standing line telling delegated workers not to foreground-wait verification/test commands expected to exceed 5 minutes — hand the command back to the orchestrator as BLOCKED (or run it backgrounded with log polling) because the host stream watchdog kills agents after 600s of stream silence. The convention is also recorded in docs/reference-configs/sprint-contracts.md next to the existing 600-second verify budget note.

## Why

2026-08-18 evidence: three consecutive delegated workers died to the 600s host watchdog while waiting on verify-sprint/full-test gates, even when instructed to poll with logs. The host watchdog cannot be fixed repo-side; the effective mitigation is workers refusing long foreground waits and returning control. The injected line's purpose is refusal/hand-back, not teaching polling (polling instructions demonstrably failed).

## Task Breakdown

- [ ] `src/cli/hook/subagent-handler.ts`: add a `LONG_COMMAND_GUARDRAIL` constant (pattern-match `RETURN_CONTRACT_MARKER`/`RETURN_CONTRACT_TEXT` at :86-87) with marker `[repo-harness:long-command-guardrail]`; inject it wherever RETURN_CONTRACT_TEXT is appended to SubagentStart context, guarded by the same dedupe (marker-presence check).
- [ ] `tests/subagent-handler.test.ts`: assert SubagentStart context contains the marker exactly once and the text names the hand-back-as-BLOCKED default; assert no duplicate injection when the marker is already present.
- [ ] `docs/reference-configs/sprint-contracts.md`: one short subsection near the 600-second verify budget note recording the convention: long gate commands run from the orchestrator main loop (backgrounded); delegated workers hand back instead of waiting.

## Out of Scope

- No harness-side watchdog/retry machinery (host-owned; compensating complexity).
- No change to RETURN_CONTRACT_TEXT semantics, delegation state, or role routing.
- No App Thread or reasoning-effort readback work.

## Verification

- `bun test tests/subagent-handler.test.ts`
- `node node_modules/typescript/bin/tsc --noEmit`
- `bun test`

## Rollback

Single revert; advisory text only, no state or schema surface.

## Annotations
<!-- [NOTE]: prefixed inline. Claude processes all and revises. -->

## Task Breakdown
- [ ] `src/cli/hook/subagent-handler.ts`: add a `LONG_COMMAND_GUARDRAIL` constant (pattern-match `RETURN_CONTRACT_MARKER`/`RETURN_CONTRACT_TEXT` at :86-87) with marker `[repo-harness:long-command-guardrail]`; inject it wherever RETURN_CONTRACT_TEXT is appended to SubagentStart context, guarded by the same dedupe (marker-presence check).
- [ ] `tests/subagent-handler.test.ts`: assert SubagentStart context contains the marker exactly once and the text names the hand-back-as-BLOCKED default; assert no duplicate injection when the marker is already present.
- [ ] `docs/reference-configs/sprint-contracts.md`: one short subsection near the 600-second verify budget note recording the convention: long gate commands run from the orchestrator main loop (backgrounded); delegated workers hand back instead of waiting.
