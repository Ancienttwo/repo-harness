# Sprint Contracts

Sprint contracts are the repo-local agreement between planner, generator, and evaluator.

## Two-Layer Glossary

The word "sprint" historically named a single execution slice in this harness. With the program layer added, the vocabulary is exactly two layers:

| Term | Layer | Artifact | Owner |
|------|-------|----------|-------|
| **Sprint** | Program level | `tasks/sprints/<stamp>-<slug>.sprint.md` (PRD + Architecture Notes + ordered Backlog + Execution Log) | PM + architect planning |
| **Task Contract** | Execution slice | `tasks/contracts/<plan-stem>.contract.md` plus its review/notes trio | One plan, one worktree |

- A Sprint decomposes `docs/spec.md` intent into an ordered backlog; each backlog task executes as one task-contract slice through the existing plan -> contract -> worktree -> verify flow.
- `tasks/todo.md` stays the deferred-goal ledger; it never carries the sprint backlog or any active checklist.
- Legacy naming: "Sprint Contract" / "Sprint Review" headings and the `verify-sprint.sh` / `new-sprint.sh` filenames predate the program layer and refer to the execution slice. The filenames are kept for downstream compatibility; read them as task-contract verification.
- Sprint lifecycle: `Draft -> Approved -> Executing -> Done -> Archived`, tracked in the sprint file's `> **Status**:` line. Where the sprint layer is installed, `scripts/sprint-backlog.sh` (init/status/next/complete-task) operates the backlog and `.ai/harness/sprint/active-sprint` (runtime state, not committed) marks the single active sprint; harness installs predating the sprint layer do not ship the helper, so check for the script before invoking it. `check-task-workflow.sh` rejects Approved/Executing sprints whose PRD is placeholder-only or whose backlog rows lack a concrete acceptance line.

## Inventory First

- Every execution-ready `plans/plan-*.md` should name the active plan, owning worktree, expected contract, review, notes file, deferred-goal ledger, `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, scope authority, plan switching rule, and worktree isolation path.
- Every `tasks/contracts/*.contract.md` should repeat the source plan, deferred-goal ledger, review, notes, checks, run snapshots, scope gate, and completion gate.
- If the inventory is incomplete, keep the plan in Draft or revise the contract before editing implementation files.

## Required Sections

- Goal
- Scope and non-goals
- Delegation fields (`budget`, `permission_scope`, `roles`)
- Allowed paths
- Exit criteria
- Verification commands
- Risks and rollback point

## Delegation Fields (κ)

- `budget` is an optional upper-bound hint for child-agent execution. Supported
  keys are `tokens`, `tool_calls`, and `wall_time_minutes`; `null` means the
  runner should inherit repo or caller defaults.
- `permission_scope` describes the child-agent authority envelope. The default
  `filesystem: allowed_paths` means the contract's `allowed_paths` remain the
  hard edit scope; `network: none` and `approvals: owner` are conservative
  defaults until a later runner explicitly widens them.
- `roles` names the intended separation of responsibility. The default parent
  role is `narrate_only`, the worker role is `implement_within_contract`, and
  the verifier role is `verify_exit_criteria`. Verifier rubrics must not exceed
  or replace the contract exit criteria.
- These fields are metadata for future delegation. `verify-contract.sh` remains backward compatible and continues to gate on the `exit_criteria` YAML block, so contracts without `delegation` still verify.

## Status Rules

- `Pending`: drafted but not approved for execution
- `Active`: approved for implementation
- `Blocked`: waiting on a missing dependency or decision
- `Verified`: all machine checks passed; awaiting or holding review
- `Archived`: sprint is complete or superseded

## Review Coupling

- A contract is not truly done until the matching review file records a passing recommendation.
- `tasks/reviews/<plan-stem>.review.md` should be filled from Waza `/check` after verification and cite the contract, implementation notes, checks file, run snapshot, `## External Acceptance Advice`, and any manual observations.
- `tasks/notes/<plan-stem>.notes.md` captures task-local decisions and should be archived or promoted deliberately, not left as hidden long-term memory.

## Worktree Lifecycle

- When `.ai/harness/policy.json` has `worktree_strategy.auto_for_contract_tasks: true`, `scripts/plan-to-todo.sh --plan <approved-plan>` starts a linked `codex/<slug>` worktree instead of mutating the primary tree.
- Execute the sprint in that linked worktree. The primary worktree remains a merge target and must stay clean before merge-back.
- After implementation, run Waza `/check` so the review file recommends pass, record passing `## External Acceptance Advice` from the peer reviewer or a concrete manual override, then run `scripts/contract-worktree.sh finish`. The finish command gates on external acceptance before `verify-sprint.sh`, commits the branch, and fast-forwards the target branch only when the target worktree is clean.
