# Evaluation Playbook

Use this guide when iterating on `agentic-dev` with the local benchmark runner.
`project-initializer` and `agentic-dev-skill` remain legacy aliases only.

## When to run evals

Run the eval set when you change any of these:

- `SKILL.md` trigger description or routing logic
- template partials for `CLAUDE.md` or `AGENTS.md`
- generated repo contracts under `tasks/`, `plans/`, or `docs/reference-configs/`
- migration behavior in `scripts/migrate-project-template.sh`
- helper scripts that affect repo-local enforcement

If the change only affects wording in a non-routing reference file, a full eval pass is optional.

## Canonical eval asset

- Prompt set: `evals/evals.json`
- Runner config: `evals/benchmark.config.json`

Keep the prompt set realistic. Favor prompts that a user would actually type, not synthetic low-signal phrases.

## Local runner

Use the repo-owned runner when you want a lightweight local benchmark pass:

```bash
bun run benchmark:skills --dry-run
bun run benchmark:skills --eval repair-agents-task-sync
```

The runner:

- creates isolated iteration workspaces under the configured workspace root
- seeds each eval with tracked fixture repos from `evals/fixtures/`
- runs the selected agent/profile matrix
- writes raw artifacts outside the repo and refreshes `evals/benchmark.md`

## Workspace layout

Drive iterations from a sibling workspace directory:

```text
agentic-dev-workspace/
  iteration-1/
    eval-new-project/
      with_skill/
      without_skill/
    eval-fix-agents/
      with_skill/
      without_skill/
  iteration-2/
    ...
```

Use descriptive eval directory names instead of only numeric ids.

## Comparison model

For each eval, compare:

- `with_skill`: current `agentic-dev`
- `without_skill`: no skill, or an older snapshot when doing improvement comparisons

Capture enough output to judge:

- trigger quality
- plan quality
- generated file contract coverage
- whether the agent prefers repo-local enforcement over hook-only fixes

## What to grade

Use qualitative review plus light formal checks.

Good dimensions for this skill:

- Did the skill trigger at the right time?
- Did it select the correct workflow path: initialize, migrate, audit, or repair?
- Did it preserve a tasks-first repo contract?
- Did it correctly treat `docs/PROGRESS.md` as legacy migration input, with durable progress under `tasks/workstreams/`?
- Did it update templates, scripts, and tests together when the task required implementation?

## When to run migration audit

Run a migration-focused eval whenever you change:

- `scripts/migrate-project-template.sh`
- helper script installation
- version stamp semantics
- generated repo contract rules

## When to adjust only the description

If failures show under-triggering or wrong workflow selection, update:

- `SKILL.md` frontmatter `description`
- top-level routing language in `SKILL.md`

Do not change bundled scripts or templates unless the eval reveals a real behavior gap beyond triggering.
