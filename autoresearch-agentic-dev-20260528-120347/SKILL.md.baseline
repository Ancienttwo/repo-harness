---
name: agentic-dev
description: installs, migrates, audits, and repairs repo-local agentic development harnesses
when_to_use: "agentic-dev, agentic-dev-skill, project-initializer, initialize repo-local agentic development harness, migrate repo-local agentic development harness, audit repo-local agentic development harness, repair repo-local agentic development harness"
---

# agentic-dev

`agentic-dev` is the repo-local agentic development harness skill, formerly `agentic-dev-skill` and `project-initializer`.
It is a thin router over a versioned workflow engine.

Compatibility boundary:

- internal engine: tasks-first harness
- contract ID: tasks-first-harness-v1
- legacy aliases: `agentic-dev-skill`, `project-initializer`
- legacy install paths remain valid for this release cycle

The skill should not carry the whole workflow contract in prose. It should:

1. inspect the repository
2. classify the workflow state
3. choose the correct path
4. rely on the repo contract, migration scripts, and tests for enforcement

## When to use

- initialize a new repo with Codex/Codex-compatible workflow scaffolding
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

## Action Command Surface

The public command skills live in `assets/skill-commands/` as thin facades over
the same engine. Use action-style names for discoverability:

- `agentic-dev-plan`: interactive planning; no repo mutation by default
- `agentic-dev-review`: plan review across product, engineering, design, and DevEx
- `agentic-dev-autoplan`: automatic plan -> review -> decision summary pipeline
- `agentic-dev-init`: install or refresh the harness in an existing repo
- `agentic-dev-scaffold`: create a new project or module scaffold, then attach the harness
- `agentic-dev-migrate`: migrate legacy workflow docs and stale harness artifacts
- `agentic-dev-upgrade`: refresh an installed harness through manifest-owned upgrade actions
- `agentic-dev-capability`: add selected capability boundaries without running full init/migrate/upgrade
- `agentic-dev-architecture`: resolve architecture drift requests and update docs or diagrams without harness refresh
- `agentic-dev-handoff`: prepare or resume Codex handoff packets for long-task rollover
- `agentic-dev-deploy`: check deploy and private operations configuration without publishing or deploying
- `agentic-dev-repair`: repair broken task sync, hook routing, handoff, context, policy, or helpers
- `agentic-dev-check`: run verification gates and report release or pre-merge readiness

Internal steps such as `hooks-init`, `docs-init`, and `create-project-dirs` are
not public commands. They stay behind `init`, `scaffold`, `migrate`, and
`upgrade` so users choose intent instead of implementation details.

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
- archive legacy `docs/PROGRESS.md` content; do not regenerate it as a default workflow surface
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
- `tasks/workstreams/` stores durable capability progress
- `docs/CHANGELOG.md` stores release history
- `.ai/hooks/` is the shared hook source of truth
- `.claude/settings.json` is the Claude adapter surface; `.codex/hooks.json` is the Codex adapter surface; repo-local `.claude/hooks/` is not generated by default

## Output Ownership

This skill may create or update:

- `AGENTS.md`
- `AGENTS.md`
- `.ai/hooks/*`
- `.claude/settings.json`
- `.codex/hooks.json`
- `.claude/templates/*`
- `docs/spec.md`
- `docs/reference-configs/*.md`
- `tasks/todo.md`
- `tasks/lessons.md`
- `tasks/research.md`
- `tasks/contracts/*`
- `tasks/reviews/*`
- `tasks/workstreams/*`
- `deploy/README.md`
- `deploy/sql/*` for ordered deployment SQL files
- `.ai/harness/*`
- helper scripts under `scripts/`

## Verification

When changing the engine, migration path, contract manifest, or self-hosted workflow, run:

```bash
bun test
bash scripts/check-deploy-sql-order.sh
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
