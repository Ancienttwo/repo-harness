---
name: repo-harness
description: Route explicit repo-harness setup, planning, execution, verification, and handoff actions through deterministic repository state.
when_to_use: "Use for explicit repo-harness commands or an active repo-harness task; do not use for ordinary questions, explanations, workflow discussion, quoted reports, or general product work."
---

# repo-harness

Use this Skill only for an explicit repo-harness action or to continue an active task. Ordinary questions, reviews, explanations, plan discussion, and quoted historical text bypass it.

Start with:

```bash
repo-harness state resolve --json
```

Treat that JSON as the state authority. Read Plan, Contract, checks, handoff, architecture, or reference files only when the resolved state points to them.

## Actions

1. **setup** — install, adopt, migrate, repair, or scaffold the harness. Inspect first with `repo-harness adopt --repo . --dry-run`; run `repo-harness docs show harness-overview` when setup detail is needed.
2. **plan** — create or capture a decision-complete plan. Use `repo-harness-plan`; run `repo-harness docs show agentic-development-flow` for promotion boundaries.
3. **execute** — continue the active task using its resolved profile and allowed paths. Lite uses brief → edit → targeted test; Standard uses plan → edit → verify → at most one review; Strict follows the Contract/worktree/checks/external-acceptance chain.
4. **verify** — run targeted tests and the profile-required gates. Use `repo-harness-check`; never infer provider-owned evidence.
5. **handoff** — refresh compact recovery state with `repo-harness-handoff`; inject references and deltas, not full artifact copies.

Safety boundaries are deterministic: scope, worktree ownership, secrets, destructive commands, high-risk paths, checks freshness, and review fingerprints fail closed. A user profile override may raise but never lower the computed risk floor.

Detailed command catalogs, scaffold presets, architecture, migration, deployment, hook debugging, and external integrations are on-demand references, not default routing context.
