# Task Contracts and Sprint Backlogs

Task contracts are the repo-local agreement between planner, generator, and evaluator.
Sprint backlogs are the ordered program layer that expands into task contracts.

## Three-Layer Glossary

The word "sprint" historically named a single execution slice in this harness. The current vocabulary is exactly three layers:

| Term | Layer | Artifact | Owner |
|------|-------|----------|-------|
| **PRD** | Product planning | `plans/prds/<stamp>-<slug>.prd.md` using `.claude/templates/prd.template.md`; lifecycle `Draft -> Approved -> Superseded` | PM + architect planning |
| **Sprint** | Program execution backlog | `plans/sprints/<stamp>-<slug>.sprint.md` (Source PRD + Architecture Notes + ordered Backlog + Execution Log) | PM + architect planning |
| **Task Contract** | Execution slice | `tasks/contracts/<plan-stem>.contract.md` plus its review/notes trio | One plan, one worktree |

- A PRD decomposes `docs/spec.md` intent into product direction, users, success criteria, acceptance scenarios, module behavior, data model, performance targets, and developer handoff. `repo-harness-prd` writes PRDs with compact/standard tiers and evidence rules for `[UNKNOWN]` / `[UNVERIFIED]` facts.
- A Sprint decomposes a PRD or `docs/spec.md` into an ordered backlog; each backlog task executes as one task-contract slice through the existing plan -> contract -> worktree -> verify flow.
- `tasks/todos.md` stays the deferred-goal ledger; it never carries the sprint backlog or any active checklist.
- Legacy filenames: `verify-sprint.sh` and `new-sprint.sh` predate the program layer and are kept for downstream compatibility. Read them as task-contract verification helpers. New generated artifact headings and plan metadata should use **Task Contract** and **Task Review**.
- Sprint lifecycle: `Draft -> Approved -> Executing -> Done -> Archived`, tracked in the sprint file's `> **Status**:` line. Where the sprint layer is installed, `scripts/sprint-backlog.sh` is the compatibility command and delegates to the installed helper runtime under `.ai/harness/scripts/`; `.ai/harness/sprint/active-sprint` (runtime state, not committed) marks the single active sprint. Harness installs predating the sprint layer do not ship the helper, so check for the script before invoking it. `check-task-workflow.sh` rejects Approved/Executing sprints whose PRD/source section is placeholder-only or whose backlog rows lack a concrete acceptance line.

## Inventory First

- Every execution-ready `plans/plan-*.md` should name the active plan, owning worktree, expected contract, review, notes file, deferred-goal ledger, `.ai/harness/checks/latest.json`, `.ai/harness/runs/`, scope authority, plan switching rule, and worktree isolation path.
- Every `tasks/contracts/*.contract.md` should repeat the source plan, deferred-goal ledger, review, notes, checks, run snapshots, scope gate, and completion gate.
- If the inventory is incomplete, keep the plan in Draft or revise the contract before editing implementation files.

## Required Sections

- Goal
- Scope and non-goals
- Allowed paths
- Task Profile
- Delegation contract
- Exit criteria
- Verification commands
- Risks and rollback point

## Task Profiles

New task contracts should declare `> **Task Profile**:` before ownership
metadata. The profile sets the default human expectation for writable scope and
review focus.

| Profile | Default expectation |
|---|---|
| `code-change` | Runtime behavior may change within the contract's explicit allowed paths. |
| `docs-only` | Documentation, plans, notes, and reviews only; `src/` and `tests/` are not allowed by default. |
| `ledger-closeout` | Close already-landed workflow evidence only; runtime source, tests, and hook paths are not allowed by default. |
| `migration` | Scripts, templates, assets, docs, and tests may change; preserve user-authored files. |
| `eval-only` | Eval, fixture, run, docs, and review surfaces only; runtime `src/` is not allowed by default. |
| `delegated-run` | Worker edits only contract-defined paths; parent remains the gate owner. |

Older contracts without `Task Profile` remain valid as legacy contracts, but
new generated contracts should include the field.

## Delegation Contract Fields

New contracts include a `## Delegation Contract` YAML block between allowed paths and exit criteria. This block is the forward-compatible contract-kappa surface for future delegated execution; it is metadata unless a runner such as `contract-run` consumes it.

- `budget`: optional limits for `tokens`, `tool_calls`, and `wall_time_minutes`. `null` means the current session/default command limits apply; explicit numbers are hard limits only where the runner can enforce them and otherwise advisory in the run manifest.
- `permission_scope`: the execution permission model. The default `mode: inherit_allowed_paths` means worker edits are limited by the contract `allowed_paths`; `writable_paths: []` means no narrower override; `network: inherited` means no new network permission is granted by the contract itself.
- `roles`: named responsibilities for `parent`, `explorer`, `worker`, and `verifier`. The parent remains the approval/checkpoint owner; explorer and verifier are read-only; worker may edit only within `allowed_paths` or a narrower `writable_paths` list. The verifier rubric is exactly the contract `exit_criteria`.

Existing contracts without this block remain valid. `.ai/harness/scripts/verify-contract.sh` continues to evaluate only the `exit_criteria` YAML block, so adding delegation metadata must not make old or new contracts fail verification.

## Verification Execution Boundary

`verify-contract.sh --read-only` is read-only for contract state writes only: it does not rewrite the contract `> **Status**:` line. It still executes `tests_pass` with Bun and `commands_succeed` in a non-login Bash with `BASH_ENV` unset so hook-driven done gates can verify the same exit criteria as an explicit maintainer run without sourcing host shell profiles. Do not put mutating commands in `commands_succeed` unless the contract deliberately treats that side effect as part of verification.

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

- When `.ai/harness/policy.json` has `worktree_strategy.auto_for_contract_tasks: true`, `.ai/harness/scripts/plan-to-todo.sh --plan <approved-plan>` starts a linked `codex/<slug>` worktree instead of mutating the primary tree.
- Execute the sprint in that linked worktree. The primary worktree remains a merge target and must stay clean before merge-back.
- After implementation, run Waza `/check` so the review file recommends pass, record passing `## External Acceptance Advice` from the peer reviewer or a concrete manual override, then run `.ai/harness/scripts/contract-worktree.sh finish`. The finish command gates on external acceptance before `verify-sprint.sh`, commits the branch, and fast-forwards the target branch only when the target worktree is clean.
