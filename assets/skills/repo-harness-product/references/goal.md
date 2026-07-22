# Product Mode: Goal

Source facade: `assets/skill-commands/repo-harness-goal`.

Use when the user wants to start a bounded native `/goal` session in Codex or
Claude from repo-harness planning artifacts. This mode prepares the goal
prompt and acceptance contract; the host-native `/goal` feature owns
continuation. Run the shared preflight in `../SKILL.md` first, then also
read repo-local `AGENTS.md` or `CLAUDE.md` and the relevant `tasks/current.md`
projection when present.

## Protocol

1. Require detailed source context before starting `/goal`: a PRD under `plans/prds/*.prd.md`, a Sprint backlog under `plans/sprints/*.sprint.md`, or a pasted/attached document with equivalent problem, users, scope, non-goals, acceptance scenarios, backlog order, and verification criteria.
2. If the user did not attach or name a detailed PRD/Sprint document, stop and prompt them to attach one. The prompt must ask for the PRD/Sprint artifact, target repo/path, desired goal outcome, hard non-goals, and verification surface.
3. Read the PRD/Sprint enough to extract a single goal statement, bounded scope, non-goals, authoritative files, ordered tasks, acceptance checks, rollback or stop condition, and any explicit owner or dependency constraints.
4. Produce a host-ready `/goal` prompt that tells Codex or Claude to use the attached PRD/Sprint as source of truth, preserve repo-harness workflow gates, run one bounded goal, report checkpoints, and stop on verified completion or blocker evidence.
5. When a Sprint row is the source, include the sprint file path, row id or task label, acceptance line, and whether the work should proceed through `$think`, `repo-harness run capture-plan`, and the contract worktree flow before implementation.
6. When a PRD is the source but no Sprint exists, route to the Sprint mode's `from-prd` sub-route unless the requested goal is explicitly limited to PRD review, Sprint generation, or planning.
7. Verify the prepared goal contract against repo state before handing it to `/goal`: named files exist, acceptance checks are concrete, and the stop condition is testable.
8. For Codex goals, include explicit bounded delegation authorization: spawn no more than 3 subagents, max depth 1, only when the goal contains at least two independent workstreams, and never give overlapping write ownership.

## Goal Prompt Shape

Use this shape for the generated host-native `/goal` prompt:

```text
/goal
Goal: <one bounded outcome>
Source of truth: <attached PRD/Sprint path or pasted artifact name>
Scope: <included files/modules/tasks>
Non-goals: <explicit exclusions>
Execution route: <Sprint mode, PRD mode, or contract worktree path>
Acceptance checks: <commands or machine-checkable assertions>
Stop condition: <verified completion or blocker evidence>
Delegation: this goal explicitly authorizes bounded Codex subagents when at least two independent workstreams exist; max 3 agents, max depth 1, no overlapping write ownership; do not spawn for trivial or strictly sequential work
Reporting: use the user's language unless repo-local instructions require otherwise; include changed files, tradeoffs, checks, and next bottleneck only if verified
```

## Failure Modes

- If no detailed PRD/Sprint artifact is attached or named, stop and request it instead of inventing product intent from chat history.
- If the PRD and Sprint contradict each other, report the conflict and route to the Sprint or PRD mode for repair before starting `/goal`.
- If acceptance checks are subjective or missing, stop and ask for or derive machine-checkable acceptance from the PRD/Sprint before continuing.
- If an active contract worktree or active plan already owns the same scope, report that state and route through the existing artifact instead of starting a parallel goal.

## Boundaries

- Does not create, approve, or execute a Goal session without detailed PRD/Sprint context.
- Does not replace the PRD or Sprint modes; it only consumes their artifacts.
- Preserve host-native `/goal` ownership: repo-harness prepares the prompt and contract, while Codex or Claude owns continuation mechanics.
- Approval gating for this mode: see `../SKILL.md` Boundaries (never bypasses `$think`, capture-plan, contracts, or `/check`).
