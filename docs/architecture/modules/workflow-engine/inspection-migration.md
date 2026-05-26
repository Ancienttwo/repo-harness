# Architecture Module: workflow-engine/inspection-migration

> **Capability ID**: `workflow-engine-inspection-migration`
> **Matched Prefixes**: `scripts/inspect-project-state.ts`, `scripts/migrate-project-template.sh`, `scripts/migrate-workflow-docs.ts`, `scripts/create-project-dirs.sh`, `scripts/init-project.sh`, `scripts/lib`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

The inspection and migration engine is the only layer that should decide how a
target repo moves between workflow states.

Authoritative entrypoints:

- `scripts/inspect-project-state.ts`: classifies initialize, migrate, audit, or repair state.
- `scripts/migrate-workflow-docs.ts`: preserves and normalizes legacy workflow docs.
- `scripts/migrate-project-template.sh`: orchestrates hooks, docs, workflow files, policy, helper installation, version stamp, and strict verification.
- `scripts/create-project-dirs.sh` and `scripts/init-project.sh`: scaffold paths that attach the same workflow contract.
- `scripts/lib/project-init-lib.sh`: shared install and policy generation library.

Scale signal: `migrate-project-template.sh` is about 900 lines and
`project-init-lib.sh` is about 1,879 lines, so drift risk is concentrated in
duplicated helper lists, policy generation, and idempotency behavior.

## P2 Trace

Concrete route: `bash scripts/migrate-project-template.sh --repo . --dry-run`
starts with `inspect-project-state.ts` -> syncs `.ai/hooks` from `assets/hooks`
-> routes legacy docs through `migrate-workflow-docs.ts` -> creates plans,
tasks, docs, harness dirs, deploy dirs, and ignored runtime state -> installs
templates, helper scripts, workflow contract, policy, context map, brain
manifest, and reference config stubs -> updates `.claude/.skill-version` ->
prints a migration report.

The sync boundary is filesystem-first. Inputs are repo files and contract assets.
Outputs are repo-local Markdown, JSON, JSONL, shell, and TypeScript files. The
only async/external boundary is advisory external-tooling detection; it must not
install or upgrade tools automatically.

Error paths:

- Missing repo path exits before mutation.
- Missing inspector or migrator exits before a partial workflow claim.
- Apply mode runs strict workflow verification and fails the migration if it does not pass.

## P3 Decision

The engine preserves user content because generated workflow code is installed
into real product repos. The invariant is: archive uncertain legacy material,
delete only manifest-owned `known_generated` files, and preserve `_ref/`, `_ops/`,
secrets, local env, and custom hooks.

At 10x target repo variety, the first failure would be hard-coded shell lists
drifting from `assets/workflow-contract.v1.json`. The current manifest-backed
helper inventory is the right direction; new helpers should be added through the
contract and mirrored tests, not one-off shell branches.

## Optimization Backlog

- Reduce duplicated helper and required-path lists that still exist across shell scripts.
- Consider a pure-shell or bundled JSON reader fallback only if generated repos often lack Node, Bun, and Python.
