# Architecture Module: workflow-engine/inspection-migration

> **Capability ID**: `workflow-engine-inspection-migration`
> **Matched Prefixes**: `scripts/inspect-project-state.ts`, `scripts/migrate-project-template.sh`, `scripts/migrate-workflow-docs.ts`, `scripts/create-project-dirs.sh`, `scripts/init-project.sh`, `scripts/lib`
> **Local Contracts**: `scripts/AGENTS.md`, `scripts/CLAUDE.md`
> **Workstream**: `tasks/workstreams/workflow-engine/inspection-migration/20260703-inspection-migration.md`

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
policy generation and idempotency behavior. Helper implementations no longer
have two authoring surfaces: `assets/workflow-contract.v1.json` owns the
inventory, `scripts/` owns implementation bytes and modes, and
`assets/templates/helpers/` is a checked-in deterministic projection.

## P2 Trace

Concrete route: `bash scripts/migrate-project-template.sh --repo . --dry-run`
starts with `inspect-project-state.ts` -> syncs `.ai/hooks` from `assets/hooks`
-> routes legacy docs through `migrate-workflow-docs.ts` -> creates plans,
tasks, docs, harness dirs, deploy dirs, and ignored runtime state -> installs
templates, helper scripts, workflow contract, policy, context map, brain
manifest, and reference config stubs -> updates `.claude/.skill-version` ->
prints a migration report.

The helper projection route is
`assets/workflow-contract.v1.json#helpers.scripts` ->
`scripts/sync-helper-sources.ts` -> `src/core/source-projection.ts` ->
`assets/templates/helpers/`. `migrate-project-template.sh` is the only explicit
package delegate: the `scripts/` file remains the full implementation while the
package helper delegates to the package-local source tree or the checkout named
by `REPO_HARNESS_SOURCE_ROOT`.

The sync boundary is filesystem-first. Inputs are repo files and contract assets.
Outputs are repo-local Markdown, JSON, JSONL, shell, and TypeScript files. The
only async/external boundary is advisory external-tooling detection; it must not
install or upgrade tools automatically.

Error paths:

- Missing repo path exits before mutation.
- Missing inspector or migrator exits before a partial workflow claim.
- Missing or malformed workflow contracts fail before helper discovery; helper
  directories and filename extensions are never scanned or guessed.
- A source-checkout override must be an absolute `REPO_HARNESS_SOURCE_ROOT`
  containing the canonical contract and selected helper implementation.
- Apply mode runs strict workflow verification and fails the migration if it does not pass.

## P3 Decision

The engine preserves user content because generated workflow code is installed
into real product repos. The invariant is: archive uncertain legacy material,
delete only manifest-owned `known_generated` files, and preserve `_ref/`, `_ops/`,
secrets, local env, and custom hooks.

At 10x target repo variety, the first failure would be hard-coded shell lists
drifting from `assets/workflow-contract.v1.json`. The manifest-backed inventory
and deterministic projection make that drift a failing check. New helpers must
be added to the contract and `scripts/`; `bun run sync:helpers` produces the
package copy and `bun run check:helpers` verifies it. No compatibility directory,
home-directory search, legacy env alias, or extension fallback participates in
helper resolution.

## 2026-07-11 Helper Authority Closeout

- `src/core/source-projection.ts` is the shared filesystem projection primitive
  used by hook and helper projections; it preserves bytes and executable mode,
  rejects symlinks, and writes atomically.
- `scripts/sync-helper-sources.ts` reads the helper inventory only from the
  workflow contract, rejects unclassified package files, and preserves the one
  declared migration delegate.
- `src/cli/runtime/helper-runner.ts` resolves only contract-listed helpers from
  the package or an explicit source checkout. Missing contracts, malformed JSON,
  unsafe inventory entries, ambiguous helper IDs, and missing implementation
  files fail closed.
- `scripts/workflow-contract.ts` accepts the package-local contract, an installed
  target-repo contract, or an explicit source checkout. It no longer searches
  home directories or legacy skill roots.

## 2026-07-06 Delegation Policy Template Closeout

- `scripts/lib/project-init-lib.sh` now emits the same `delegation.mode=auto`
  policy explanation as the self-host `.ai/harness/policy.json`, so generated
  repos understand auto mode as install-time standing authorization for bounded
  Codex delegation.
- The change stays inside policy generation text. It does not alter migration
  ownership, helper installation, idempotency rules, or protected local runtime
  state.

## Optimization Backlog

- Reduce duplicated required-path lists that still exist across shell scripts.
