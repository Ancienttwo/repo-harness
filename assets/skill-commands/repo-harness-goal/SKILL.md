---
name: repo-harness-goal
description: Goal-mode entrypoint for Codex and Claude native /goal sessions. Requires detailed PRD or Sprint context before starting bounded long-running execution.
when_to_use: "repo-harness-goal, repo-harness:goal, /goal, Codex goal, Claude goal, run goal from PRD, run goal from Sprint"
---

# repo-harness-goal

Use this command when the user wants to start a bounded native `/goal` session in Codex or Claude from repo-harness planning artifacts. The command prepares the goal prompt and acceptance contract; the host-native `/goal` feature owns continuation.

## Protocol

1. Confirm the working repo with `git rev-parse --show-toplevel`; read repo-local `AGENTS.md` or `CLAUDE.md`, `.ai/harness/policy.json`, and the relevant `tasks/current.md` projection when present.
2. Require detailed source context before starting `/goal`: a PRD under `plans/prds/*.prd.md`, a Sprint backlog under `plans/sprints/*.sprint.md`, or a pasted/attached document with equivalent problem, users, scope, non-goals, acceptance scenarios, backlog order, and verification criteria.
3. If the user did not attach or name a detailed PRD/Sprint document, stop and prompt them to attach one. The prompt must ask for the PRD/Sprint artifact, target repo/path, desired goal outcome, hard non-goals, and verification surface.
4. Read the PRD/Sprint enough to extract a single goal statement, bounded scope, non-goals, authoritative files, ordered tasks, acceptance checks, rollback or stop condition, and any explicit owner or dependency constraints.
5. Produce a host-ready `/goal` prompt that tells Codex or Claude to use the attached PRD/Sprint as source of truth, preserve repo-harness workflow gates, run one bounded goal, report checkpoints, and stop on verified completion or blocker evidence.
6. When a Sprint row is the source, include the sprint file path, row id or task label, acceptance line, and whether the work should proceed through `$think`, `capture-plan.sh`, and the contract worktree flow before implementation.
7. When a PRD is the source but no Sprint exists, route to `repo-harness-sprint from-prd <prd-file>` unless the requested goal is explicitly limited to PRD review, Sprint generation, or planning.
8. Verify the prepared goal contract against repo state before handing it to `/goal`: named files exist, acceptance checks are concrete, and the stop condition is testable.

## Goal Prompt Shape

Use this shape for the generated host-native `/goal` prompt:

```text
/goal
Goal: <one bounded outcome>
Source of truth: <attached PRD/Sprint path or pasted artifact name>
Scope: <included files/modules/tasks>
Non-goals: <explicit exclusions>
Execution route: <repo-harness-sprint row, repo-harness-plan, or contract worktree path>
Acceptance checks: <commands or machine-checkable assertions>
Stop condition: <verified completion or blocker evidence>
Reporting: use the user's language unless repo-local instructions require otherwise; include changed files, tradeoffs, checks, and next bottleneck only if verified
```

## Failure Modes

- If no detailed PRD/Sprint artifact is attached or named, stop and request it instead of inventing product intent from chat history.
- If the PRD and Sprint contradict each other, report the conflict and route to `repo-harness-sprint` or `repo-harness-prd` repair before starting `/goal`.
- If acceptance checks are subjective or missing, stop and ask for or derive machine-checkable acceptance from the PRD/Sprint before continuing.
- If an active contract worktree or active plan already owns the same scope, report that state and route through the existing artifact instead of starting a parallel goal.

## Boundaries

- Does not create, approve, or execute a Goal session without detailed PRD/Sprint context.
- Does not replace `repo-harness-prd` or `repo-harness-sprint`; it consumes their artifacts.
- Does not bypass `$think`, `capture-plan.sh`, task contracts, `/check`, external acceptance, or repo-harness verification gates.
- Never treats `tasks/todos.md` as the active goal backlog; it is only the deferred-goal ledger.
- Preserve host-native `/goal` ownership: repo-harness prepares the prompt and contract, while Codex or Claude owns continuation mechanics.
