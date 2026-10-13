# Hooks Configuration Guide

This guide describes the typed host-event runtime and the operator-helper
library supplied by the installed package.

## Runtime Source of Truth

- Repo-local `tasks/` files are the primary cross-agent contract.
- Repo-local `plans/` files are the plan catalog; `.ai/harness/active-plan`
  selects the active plan.
- `src/cli/hook/route-registry.ts` is the route authority. Each
  `(event, routeId, matcher)` invokes exactly one typed handler in
  `src/cli/hook/handler-registry.ts`.
- User-level Claude and Codex adapters live in `~/.claude/settings.json` and
  `~/.codex/hooks.json`. Codex requires the latter to be trusted in Settings.
- Operator helpers run from the package through `repo-harness run <helper>`.
  No shell operator library ships. Init preserves old
  `.ai/hooks/lib/workflow-state.sh` copies. Doctor reports them with manual
  migration steps.
- Repo-local `.claude/settings.json` and `.codex/hooks.json` are user-owned
  legacy inputs and should be retired during migration.

The runtime is deterministic and fail-closed. Use hooks as advisory accelerators
and guards, not as a second source of workflow truth.

## Managed Routes and Profiles

The [Hook Operations Reference](../docs/reference-configs/hook-operations.md#hook-authority-map)
owns the route inventory. Claude installs five routes. Codex installs six.
Pi maps four routes. The minimal host profile installs four routes.
Use `repo-harness install --profile minimal|full` to select a profile.
Use `--no-hooks` to skip host adapter installation.

After a package upgrade, reinstall the adapters and trust the new Codex
command tuples once. Old adapters call removed routes and get exit 2.
Managed commands require `repo-harness-hook` on PATH in opted-in repositories.
All routes use a 30-second timeout.

## Operator Helpers and Migration

`repo-harness init` writes package helper guidance in `.ai/hooks/README.md`.
It does not copy `workflow-state.sh`. It preserves existing copies and edits.
Use `repo-harness run <helper>` to run packaged helpers. Change direct callers
of the legacy library to `repo-harness run <helper>`. Test them, back up the
legacy file, and remove it manually. Init removes retired generated entry
scripts by manifest ownership.
Run `repo-harness init --repo <repo> --dry-run` before applying a migration.

Generated `.claude/hooks/` shims are legacy cleanup targets. Custom
`.claude/hooks/custom-*.sh` files are user-owned and remain outside the typed
runtime contract.

## Customization Notes

- Keep durable shared policy in `CLAUDE.md`, workflow files, and reference
  configs rather than hidden runtime caches.
- Use `tasks/lessons.md` for repeated corrections and `docs/researches/*.md`
  for deep findings.
- Handler changes belong in `src/cli/hook/` with focused tests.

## Failure Logging

Blocking handlers emit structured JSON with `guard`, `action`, `reason`, `fix`,
`failure_class`, and `run_id`.

Failure classes are intentionally limited to:

- `missing_artifact`
- `state_violation`
- `contract_failure`
- `quality_gate`

Failures append JSONL records to `.ai/harness/failures/latest.jsonl`. Use
`repo-harness run summarize-failures` to aggregate the latest log, or add
`--run-id <id>` to inspect one run.
