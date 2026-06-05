---
name: repo-harness-autoplan
description: Full repo-harness workflow orchestrator. Reads repo state, drafts a plan, self-reviews twice, executes the approved plan, runs review/check gates, and delegates final PR closeout to repo-harness-ship.
when_to_use: "repo-harness-autoplan, auto plan repo-harness work, automatic review harness plan, run all repo-harness reviews, make the workflow planning decisions, full repo-harness workflow"
---

# repo-harness-autoplan

Use this command when the user wants the whole repo-harness workflow handled automatically.

## Protocol

1. Confirm the working repo and inspect state with `bun scripts/inspect-project-state.ts --repo <repo> --format text` when available.
2. Draft the action plan with `repo-harness-plan` rules.
3. Run self-review 1, the completeness pass: goal, scope, P1/P2/P3, interfaces, tests, rollback, no placeholders.
4. Revise the plan once from the completeness findings.
5. Run self-review 2, the adversarial and shipability pass: failing gates, unsafe automation, permission boundaries, 10x breakpoints, and PR closeout readiness.
6. Execute the approved plan without re-litigating decisions unless live repo drift makes it unsafe.
7. Run Waza `/check` semantics and record the sprint review, external acceptance, and `verify-sprint` evidence.
8. Call `repo-harness-ship` for the final default PR closeout.

## Reusable Workflow Packaging Rubric

When the user wants to package repeated work into a skill, subagent, automation,
or existing command extension:

1. Build a compact shortlist before recommending creation.
2. Use evidence in this order: current repo docs and task files, recent sessions
   or task summaries, Memories and rollout summaries, Chronicle for discovery
   only, then existing skills, custom agents, and automations.
3. For each candidate, report the repeated workflow, evidence and dates,
   frequency/confidence, recommended form, and why to create, extend, or skip it.
4. Act only on high-confidence missing items: repeated at least twice or clearly
   recurring and costly, stable inputs, repeatable procedure, clear output or
   stopping condition, and not already adequately covered.
5. Prefer extending an existing skill, command, subagent, or automation before
   creating a new one.

## CHECKPOINTS

- CHECKPOINT: stop only when live repo drift changes product intent, safety boundaries, or ship mode.

## Failure Modes

- If inspection cannot classify the repo, stop before mutation and report the missing state.
- If either self-review finds a blocking issue, revise once before execution.
- If `/check`, external acceptance, or `verify-sprint` fails, do not call `repo-harness-ship`.

## Boundaries

- Mutates repo files by default only after the user explicitly invokes `repo-harness-autoplan`.
- Runs exactly two plan self-review passes; do not recurse into open-ended self critique.
- Stops for the user only when the remaining ambiguity would change product intent, safety boundaries, or ship mode.
- Never aborts into a long interactive review unless the repo state makes automatic workflow execution unsafe.
- Surfaces only decisions that materially change scope, risk, or command selection.
- Does not create skills, subagents, automations, or command assets until the
  user approves the plan.
- Delegates default branch push and PR creation to `repo-harness-ship`; `repo-harness-autoplan` does not merge PRs or publish releases.
