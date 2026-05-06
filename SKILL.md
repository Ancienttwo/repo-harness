---
name: project-initializer
description: Use when initializing, migrating, auditing, or repairing AI-assisted project scaffolding such as CLAUDE.md, AGENTS.md, tasks/, hooks, and repo-local contracts. Route through repo inspection first, then run initialize, migrate, audit, or repair workflows. Not for runtime debugging or generic non-AI setup.
---

# Project Initializer

`project-initializer` is now a thin router over a versioned workflow engine.

The skill should not carry the whole workflow contract in prose. It should:

1. inspect the repository
2. classify the workflow state
3. choose the correct path
4. rely on the repo contract, migration scripts, and tests for enforcement

## When to use

- initialize a new repo with Claude/Codex-compatible workflow scaffolding
- migrate an older repo to the current tasks-first harness
- audit drift between prompts, hooks, scripts, and repo-local contract files
- repair broken task-sync, workflow-contract, or handoff surfaces

## When not to use

- runtime bug debugging inside an already healthy AI workflow
- generic project scaffolding unrelated to AI routing or repo-local workflow contracts
- ordinary product feature work

## Router Protocol

Always start with structured inspection, not prompt guessing.

### Step 1. Inspect first

Run:

- `bun scripts/inspect-project-state.ts --repo <path> --format text`
  - fallback: `node --experimental-strip-types scripts/inspect-project-state.ts --repo <path> --format text`

Read the result fields:

- `mode`
- `legacy_contract_version`
- `drift_signals`
- `required_decisions`
- `safe_defaults`

### Step 2. Choose one path

1. **Initialize**
   - use when the repo has no meaningful tasks-first workflow yet
2. **Migrate**
   - use when the repo has legacy workflow docs, missing contract manifest, or stale harness artifacts
3. **Audit**
   - use when the repo mostly works but the user wants drift analysis and enforcement review
4. **Repair**
   - use when the repo has a current contract surface but broken task-sync, hooks, or handoff behavior
### Step 3. Prefer engine actions over prompt-only fixes

Default order:

1. migrate legacy docs if needed
2. install or refresh workflow contract artifacts
3. sync hooks, helpers, and templates
4. merge the guidance-only `external_tooling` profile into `.ai/harness/policy.json`
5. verify the repo-local contract

Do not treat hooks as the primary source of truth. The repo contract lives in repo files.

## Core Engine Surfaces

The single machine-readable contract source is:

- `assets/workflow-contract.v1.json`

The installed runtime copy inside a repo is:

- `.ai/harness/workflow-contract.json`

The main engine entrypoints are:

- `scripts/inspect-project-state.ts`
- `scripts/migrate-workflow-docs.ts`
- `scripts/migrate-project-template.sh`
- `scripts/check-agent-tooling.sh`
- `scripts/check-task-workflow.sh`
- `scripts/create-project-dirs.sh`

## Plan Index

The router should still respect the canonical plan catalog in `assets/plan-map.json`:

Core Plans (A-F):
- Plan A: Remix
- Plan B: UmiJS + Ant Design Pro
- Plan C: Vite + TanStack Router
- Plan D: Bun + Turborepo
- Plan E: Astro landing page
- Plan F: Expo + NativeWind

Custom Presets (G-K):
- Plan G: AI quantitative trading
- Plan H: Financial trading / FIX / RFQ
- Plan I: Web3 DApp
- Plan J: AI coding agent / TUI
- Plan K: Fully custom configuration

## Migration Rules

For legacy repos, migrate old document surfaces before refreshing templates.

Legacy paths include:

- `docs/plan.md`
- `docs/TODO.md`
- `docs/PROGRESS.md`
- `docs/contract.md`
- `docs/review.md`
- `docs/handoff.md`
- `HANDOFF.md`

Use:

- `bun scripts/migrate-workflow-docs.ts --repo <path> --dry-run`
- `bun scripts/migrate-workflow-docs.ts --repo <path> --apply`

Migration defaults:

- preserve user-authored content
- archive uncertain legacy content instead of guessing
- remove repo-local Skill Factory and auto-memory surfaces when present
- normalize `docs/PROGRESS.md` to milestone-only usage
- keep `tasks/todo.md` limited to the active execution checklist
- move hidden contracts and deep findings into `tasks/research.md`
- distill repeated corrections into `tasks/lessons.md`
- merge missing `external_tooling` defaults into `.ai/harness/policy.json` without overwriting explicit user values
- keep gstack/Waza/gbrain detection advisory-only; do not auto-install, auto-upgrade, auto-sync, or auto-enable MCP
- treat Waza as Codex-first: `~/.codex/skills` is the Codex runtime source, `~/.agents/skills` is only skills CLI staging/cache, and updates require stage -> copy to Codex -> `cmp` verification

## Repo-Local Contract

Preserve these semantics:

- `plans/` is the active plan source of truth
- `tasks/todo.md` is the active execution checklist
- `tasks/lessons.md` stores correction-derived rules
- `tasks/research.md` stores deep repo findings and hidden contracts
- `tasks/contracts/` and `tasks/reviews/` are completion gates
- `docs/PROGRESS.md` is milestone-only
- `.ai/hooks/` is the shared hook source of truth
- `.claude/hooks/` is a compatibility shim layer

## Output Ownership

This skill may create or update:

- `CLAUDE.md`
- `AGENTS.md`
- `.ai/hooks/*`
- `.claude/hooks/*`
- `.claude/settings.json`
- `.claude/templates/*`
- `docs/spec.md`
- `docs/PROGRESS.md`
- `docs/reference-configs/*.md`
- `tasks/todo.md`
- `tasks/lessons.md`
- `tasks/research.md`
- `tasks/contracts/*`
- `tasks/reviews/*`
- `.ai/harness/*`
- helper scripts under `scripts/`

## Verification

When changing the engine, migration path, contract manifest, or self-hosted workflow, run:

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bash scripts/migrate-project-template.sh --repo . --dry-run
```

For migration-focused work, also inspect and dry-run legacy doc migration explicitly:

```bash
bun scripts/inspect-project-state.ts --repo . --format text
bun scripts/migrate-workflow-docs.ts --repo . --dry-run
```

## Iteration Notes

- Keep this file short; detailed policy belongs in `docs/reference-configs/`
- Keep stack-specific detail in assets and references, not in this skill body
- If the router changes, update `evals/evals.json`
- If the contract changes, update templates, migration, checks, and tests together
