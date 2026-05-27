# agentic-dev

Repo-local agentic development harness skill for Claude/Codex workflows.
Formerly `agentic-dev-skill` and `project-initializer`; legacy skill aliases and install paths stay valid during the compatibility rename.
Repository: `https://github.com/Ancienttwo/agentic-dev`

This repository now dogfoods its own tasks-first contract. It is both:

- the source repo for the `agentic-dev` skill
- a self-hosted example of the repo-local workflow it generates for other projects

## First 5 Minutes

This is the fastest path for an AI tooling owner evaluating whether the workflow is
safe to adopt in a real repo.

### Install or refresh the local skill

```bash
git clone https://github.com/Ancienttwo/agentic-dev.git ~/Projects/agentic-dev
cd ~/Projects/agentic-dev
bash scripts/sync-codex-installed-copies.sh
```

Local path model:

- Source repo: `~/Projects/agentic-dev`
- Claude skill aliases: `~/.claude/skills/agentic-dev`, `~/.claude/skills/project-initializer`
- Codex discoverable skill alias: `~/.codex/skills/agentic-dev`
- Codex legacy fallback aliases: `~/.codex/skills/agentic-dev-skill`, `~/.codex/skills/project-initializer`

The `~/Projects/agentic-dev` repo is the only editable source of truth. Local
Claude/Codex paths are symlink-backed runtime entrypoints. Only
`~/.codex/skills/agentic-dev` should expose `SKILL.md` and
`assets/skill-commands/`; the legacy Codex directories exist only so older
generated repos can still resolve upstream assets without duplicate command
discovery.

### Minimum prerequisites

- Git working tree
- `bash`
- `bun` for follow-up verification and template assembly
- `jq` is optional for `--dry-run`, but recommended when applying settings merges

### Start here

For an existing repo:

```bash
bash scripts/migrate-project-template.sh --repo . --dry-run
```

Apply only after the dry-run report looks correct:

```bash
bash scripts/migrate-project-template.sh --repo . --apply
```

For a new project or module, use the `agentic-dev-scaffold` command skill. For
an existing repo, use `agentic-dev-init`; it installs or refreshes the harness
without creating an application stack.

### Success looks like this

The command should end with `=== Migration Report ===` and summarize:

- `Project hooks synced from:` to show where generated hook behavior comes from
- `Team hook config targets: .claude/settings.json, .codex/hooks.json` to show the Claude and Codex adapter entries
- `Workflow migration:` to show the repo-local harness surfaces it will create or refresh
- `Helper scripts:` to show the operational toolchain you get after apply
- `--- External Tooling ---` to show default gstack/Waza/gbrain routing plus advisory install/update hints

### Next two commands

```bash
bash scripts/check-task-workflow.sh --strict
bun test
```

If the dry-run output looks wrong, stop there and inspect
[`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)
before applying anything.

## Hook Authority Map

- `.ai/hooks/` is the only shared hook implementation you should edit first.
- `.claude/settings.json` is the Claude adapter that dispatches into `.ai/hooks/run-hook.sh`.
- `.codex/hooks.json` is the Codex adapter that dispatches into `.ai/hooks/run-hook.sh`.
- Debug in this order: host adapter -> `run-hook.sh` -> `.ai/hooks/*`.

## Hook Failure Playbook

When a hook blocks work, start with the structured output in the terminal. The core
fields are `guard`, `reason`, `fix`, `failure_class`, and `run_id`.

- Failure log: `.ai/harness/failures/latest.jsonl`
- Trace log: `.claude/.trace.jsonl`
- Deep guide: [`docs/reference-configs/hook-operations.md`](docs/reference-configs/hook-operations.md)

Most common guards:

- `PlanStatusGuard`: no active plan, or the plan is not ready to execute
- `TodoGuard`: active plan changed but `tasks/todo.md` was not synchronized
- `ContractGuard`: completion was claimed before the task contract passed
- `WorktreeGuard`: writes were attempted in the primary worktree while linked worktrees are enforced

## Repo Workflow

- Root routing docs: `CLAUDE.md`, `AGENTS.md`
- Shared hook layer: `.ai/hooks/`
- Claude adapter layer: `.claude/settings.json`
- Codex adapter layer: `.codex/hooks.json`
- Active execution surface: `tasks/`
- Plan source of truth: `plans/`
- Durable progress: `tasks/workstreams/`
- Release history: `docs/CHANGELOG.md`

## Current Model (5.2.3)

- Question flow uses **12 grouped decision points** with harness defaults inferred first.
- Plan menu is tiered:
  - **Core Plans (A-F)** first.
  - **Custom Presets (G-K)** only when needed.
- Skill routing is inspection-first:
  - `scripts/inspect-project-state.ts`
  - `scripts/migrate-workflow-docs.ts`
  - `assets/workflow-contract.v1.json`
- Runtime mode is configurable with template vars:
  - `{{RUNTIME_MODE}}`
  - `{{RUNTIME_PROFILE}}`
  - `{{RECOVERY_PROFILE}}`
  - `{{STATE_PROFILE}}`
- Question-pack source of truth is in:
  - `assets/initializer-question-pack.v4.json`
- Generated repos default to the repo-local harness flow:
  - `docs/spec.md -> plans/ -> tasks/contracts/ -> tasks/reviews/ -> .ai/context/context-map.json -> .ai/harness/*`
- Generated and self-hosted repos install:
  - `.ai/harness/workflow-contract.json`
  - `.ai/harness/policy.json`
- Generated and migrated repos default `external_tooling` to:
  - `complex -> gstack`
  - `simple -> Waza` with Codex-first runtime copies in `~/.codex/skills`
  - `knowledge -> gbrain`
- External tooling stays advisory-only:
  - `bash scripts/check-agent-tooling.sh --host both --check-updates`
  - Waza update checks compare upstream `tw93/Waza` `SKILL.md` hashes without running `npx skills check`
  - no automatic global install, upgrade, daemon, sync, or MCP enablement
- Manual distillation stays repo-local:
  - repeated corrections -> `tasks/lessons.md`
  - deep findings and hidden contracts -> `tasks/research.md`
  - sprint verification evidence -> `tasks/reviews/*.review.md`
  - durable capability progress -> `tasks/workstreams/`
  - release history -> `docs/CHANGELOG.md`

## Action Command Skills

Source-owned command skill facades live in `assets/skill-commands/`. They keep
the public surface action-style while sharing the same router, contract, scripts,
and tests:

- Planning and review: `agentic-dev-plan`, `agentic-dev-review`, `agentic-dev-autoplan`
- Repo workflow actions: `agentic-dev-init`, `agentic-dev-migrate`, `agentic-dev-upgrade`, `agentic-dev-capability`, `agentic-dev-architecture`, `agentic-dev-handoff`, `agentic-dev-deploy`, `agentic-dev-repair`, `agentic-dev-check`
- Project creation: `agentic-dev-scaffold`

`agentic-dev-init` is for an existing repo; `agentic-dev-scaffold` creates a new
project or module scaffold. `hooks-init`, `docs-init`, and `create-project-dirs`
are internal steps, not public commands.

Use `agentic-dev-capability` when the harness already exists and only selected
capability boundaries should be added. It updates `.ai/context/capabilities.json`,
syncs the requested local `AGENTS.md` / `CLAUDE.md` contract files, and validates
the registry without running a full init, migrate, or upgrade pass.

Use `agentic-dev-architecture`, `agentic-dev-handoff`, and `agentic-dev-deploy`
for focused architecture documentation, rollover, and deploy/ops readiness
passes. These commands call existing repo-local helpers and keep their scope
narrow instead of refreshing the full harness.

Codex installed-copy rule: only `~/.codex/skills/agentic-dev` exposes the root
skill and `agentic-dev-*` command facades. Legacy compatibility directories
`~/.codex/skills/agentic-dev-skill` and `~/.codex/skills/project-initializer`
are runtime fallback bundles only; they must not contain `SKILL.md` files or
`assets/skill-commands/`.

After cloning or moving this source repo, rebuild the local runtime aliases with:

```bash
bash scripts/sync-codex-installed-copies.sh
```

By default, the script keeps local Claude/Codex runtime paths linked back to the
source repo. Set `AGENTIC_DEV_LINK_INSTALLED_COPIES=0` or `CODEX_SKILLS_ROOT`
for copy-based staging.

## Maintainer Reference

### Self-check this repository's workflow contract

```bash
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
```

### Explicit template assembly

```bash
bun scripts/assemble-template.ts --plan C --name "MyProject"
bun scripts/assemble-template.ts --target agents --plan C --name "MyProject"
```

### Local benchmark skeleton

```bash
bun run benchmark:skills --dry-run
```

### Run one eval across both Claude and Codex

```bash
bun run benchmark:skills --eval repair-agents-task-sync
```

## Key Files

- Skill spec: `SKILL.md`
- Root routing docs: `CLAUDE.md`, `AGENTS.md`
- Plan mapping: `assets/plan-map.json`
- Question-pack: `assets/initializer-question-pack.v4.json`
- Shared hooks: `assets/hooks/`
- Workflow contract: `assets/workflow-contract.v1.json`
- Hook operations reference: `docs/reference-configs/hook-operations.md`
- Template assembler: `scripts/assemble-template.ts`
- Question inference helper: `scripts/initializer-question-pack.ts`
- State inspector: `scripts/inspect-project-state.ts`
- Legacy-doc migrator: `scripts/migrate-workflow-docs.ts`
- External tooling detector: `scripts/check-agent-tooling.sh`
- Scaffolding scripts:
  - `scripts/init-project.sh`
  - `scripts/create-project-dirs.sh`

## Generated vs Self-Hosted Hook Parity

- Downstream hook behavior is defined by generated output from `assets/hooks/` plus
  `assets/reference-configs/`.
- This repo dogfoods the same contract, but self-host behavior is not magically in
  sync with generated repos unless a change explicitly updates both surfaces.
- Every hook change should say whether it affects `self-host`, `generated`, or `both`.

## Package Manager Defaults

- General default priority: `bun > pnpm > npm`
- **Plan G/H** (Python-centric) default to **`uv`** as primary package manager.

## Runtime Profiles

- `Plan-only (recommended)` (default)
- `Plan + Permissionless`
- `Standard (ask before each action)`

Configured in `assets/initializer-question-pack.v4.json` and consumed by `scripts/initializer-question-pack.ts`.

## Verification

```bash
bun test
bash scripts/check-task-sync.sh
bash scripts/check-task-workflow.sh --strict
bun scripts/inspect-project-state.ts --repo . --format text
bash scripts/migrate-project-template.sh --repo . --dry-run
bash scripts/check-agent-tooling.sh --host both --check-updates
bun run benchmark:skills --dry-run
```
