## Project Structure

```
{{PROJECT_STRUCTURE}}
```

### Tech Stack

| Layer | Technology |
|-------|------------|
{{TECH_STACK_TABLE}}

{{#IF WEBAPP_RENDERING_MODEL_ENABLED}}
### Webapp Rendering Model

{{WEBAPP_RENDERING_MODEL_SUMMARY}}

| Boundary | Default |
|----------|---------|
{{WEBAPP_RENDERING_TECH_STACK_TABLE}}

{{/IF}}
{{#IF AI_NATIVE_PROFILE_ENABLED}}
### AI-Native Profile

{{AI_NATIVE_PROFILE_SUMMARY}}

| Layer | Technology |
|-------|------------|
{{AI_NATIVE_TECH_STACK_TABLE}}

{{/IF}}
---

## Workflow Rules

- Prefer modifying existing files over adding new files.
- {{RUNTIME_MODE}} by default for file mutations.
- Primary worktree warns by default; enforce via `.claude/.require-worktree`.
- Commit explicitly after green checks; no automatic checkpoint hook in the shared preset.
- Keep stable product truth in `docs/spec.md`.
- Keep sprint done definitions in `tasks/contracts/`, `tasks/reviews/`, and task-local implementation notes in `tasks/notes/`.
- Keep resumable state in `.ai/harness/handoff/current.md`.
- Treat `_ref/` as an occasional ignored external reference checkout cache; read or refresh it for comparison, but keep it out of commits and cite repo+commit/tag+path in `tasks/notes/` or `docs/researches/` when it influences a decision.
- Treat `deploy/` as the trackable deployment and operations surface for runbooks, submission materials, release checklists, helper scripts, ordered SQL files under `deploy/sql/`, and env examples.
- Treat `_ops/` as ignored local operations state for secrets, real env files, provider state, artifacts, logs, and scratch files; do not commit or agent-edit `_ops/*`.
- Treat contract-level execution as worktree-first: `repo-harness run plan-to-todo --plan <approved-plan>` starts a linked `codex/<slug>` worktree when policy enables it, and `repo-harness run contract-worktree finish` merges back only after Waza `/check` and sprint verification pass.
- Capture decision-complete Codex Plan mode, Waza `/think`, or `repo-harness-plan` outputs with `repo-harness run capture-plan --slug <slug> --title <title>` so planning becomes a `plans/` artifact before implementation.
- Route product discovery to gstack `office-hours`, complex engineering plans to gstack `plan-eng-review`, design plans to gstack `plan-design-review`, and daily small/medium planning, bug hunts, and checks to Waza `/think`, `/hunt`, and `/check`.
- Route knowledge sync and handoff retrieval to `gbrain`.
- Register valuable repo-authored docs in `.ai/harness/brain-manifest.json` with `sync.direction=repo-to-brain`; `repo-harness run sync-brain-docs` and the PostEdit hook mirror only those explicit entries into the default brain vault.
- Codex automation profile is runtime-referenced, not vendored: required skills are `health`, `check`, and `mermaid` from `~/.codex/skills`.
- CodeGraph is required agent readiness for code navigation; keep `.codegraph/` ignored and use it for P1/P2 discovery, not hook correctness.
- Treat Waza as Codex-first: `~/.codex/skills` is the Codex runtime source; `~/.agents/skills` is skills CLI staging/cache only.
- Use `docs/reference-configs/agentic-development-flow.md` for routing details and `docs/reference-configs/external-tooling.md` plus `repo-harness run check-agent-tooling --host both --check-updates` for environment checks.
- If repo state conflicts with the task, use an isolated `codex/<task-slug>` worktree, validate with Waza `/check`, and merge back to `main` without unrelated dirty changes.
