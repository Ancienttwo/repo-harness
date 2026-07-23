---
name: repo-harness
description: Route explicit repo-harness setup, planning, execution, verification, and handoff actions through deterministic repository state.
when_to_use: "Use for explicit repo-harness commands or an active repo-harness task; do not use for ordinary questions, explanations, workflow discussion, quoted reports, or general product work."
---

# repo-harness

Use only for an explicit repo-harness action or an active task. Ordinary questions, reviews, explanations, plan discussion, and quoted historical text bypass it.

Start with:

```bash
repo-harness state resolve --json
```

Treat that JSON as the state authority; read Plan, Contract, checks, handoff, or architecture files only when it points to them.

## Actions

1. **setup** — install, adopt, migrate, repair, or scaffold the harness. Use `repo-harness-setup`; inspect first with `repo-harness adopt --repo . --dry-run`, or run `repo-harness docs show harness-overview` when detail is needed.
2. **plan** — create or capture a decision-complete plan. Use `repo-harness-plan`; run `repo-harness docs show agentic-development-flow` for promotion boundaries.
3. **execute** — continue the active task via its resolved profile and allowed paths: Lite (brief → edit → test), Standard (plan → edit → verify → one review), Strict (Contract/worktree/checks/external-acceptance).
4. **verify** — run targeted tests and the profile-required gates. Use `repo-harness-check`; never infer provider-owned evidence.
5. **handoff** — refresh compact recovery state via `repo-harness run prepare-codex-handoff`/`codex-handoff-resume`; see `references/handoff.md`. Inject references and deltas, not full copies.

Safety boundaries (scope, worktree ownership, secrets, destructive commands, high-risk paths, checks freshness, review fingerprints) are deterministic and fail closed; a profile override may raise, never lower, the risk floor.

Command catalogs, scaffold presets, migration, deployment, hook debugging, and other integrations load on demand.
