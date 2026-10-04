# Root Reference: Reusable Workflow Packaging Rubric

This reference preserves the reusable workflow packaging rubric.
The old autoplan facade is retired. It has no replacement.
Root `execute` follows Effective State and the existing workflow commands.

## Rubric

When the user wants to package repeated work into a skill, subagent,
automation, or existing command extension:

1. Build a compact shortlist before recommending creation.
2. Use evidence in this order: current repo docs and task files, recent sessions or task summaries, Memories and rollout summaries, Chronicle for discovery only, then existing skills, custom agents, and automations.
3. For each candidate, report the repeated workflow, evidence and dates, frequency/confidence, recommended form, and why to create, extend, or skip it.
4. Act only on high-confidence missing items: repeated at least twice or clearly recurring and costly, stable inputs, repeatable procedure, clear output or stopping condition, and not already adequately covered.
5. Prefer extending an existing skill, command, subagent, or automation before creating a new one.
