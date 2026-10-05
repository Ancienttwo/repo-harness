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
- `repo-harness hook-lib path` locates the package operator library.
  Init preserves old `.ai/hooks/lib/workflow-state.sh` copies.
  Doctor reports them with manual migration steps.
- Repo-local `.claude/settings.json` and `.codex/hooks.json` are user-owned
  legacy inputs and should be retired during migration.

The runtime is deterministic and fail-closed. Use hooks as advisory accelerators
and guards, not as a second source of workflow truth.

## Managed Routes

| Event and route | Typed handler | Purpose |
| --- | --- | --- |
| `SessionStart.default` | `session-context` | Bounded resume, sprint, and security context. |
| `PreToolUse.edit` | `mutation-guard` | Worktree and plan/contract readiness before edits. |
| `PreToolUse.subagent` | `subagent` | Delegated return-channel enforcement. |
| `PostToolUse.edit` | `mutation-observed` | Edit journal and controlled-file observations. |
| `PostToolUse.bash` | `command-observed` | Command result and verification evidence. |
| `PostToolUse.always` | `trace-observer` | Low-noise tool trace. |
| `UserPromptSubmit.default` | `prompt` | Prompt intent and file-backed workflow guidance. |
| `UserPromptSubmit.delegation` | `subagent` | Explicit Codex delegation authorization. |
| `SubagentStart.context` / `SubagentStop.quality` | `subagent` | Delegation context and report quality. |
| `Stop.default` | `stop` | Flush observations and finalize the handoff projection. |

## Presets

### A) Balanced Shared Guardrails (recommended)

- `PreToolUse.edit`: `mutation-guard` with worktree and plan/contract checks.
- `PostToolUse.edit`: `mutation-observed` with the optional minimal-change
  observer.
- `PostToolUse.bash`: `command-observed` for command evidence.
- `PostToolUse.always`: `trace-observer` for the structured tool trace.
- `UserPromptSubmit.default`: `prompt` for plan sync and workflow guidance.
- `Stop.default`: `stop` for handoff and completion readiness.

### B) Balanced + Release Guard

Use preset A and the explicit release command for changelog checks. Release
checks are not implemented as a second hook runtime.

### C) Balanced + Advisory Extras

Use preset A and enable the declared policy observers. Additional advisory work
must run from explicit CLI commands and must not add another route authority.

### D) Minimal

Install `UserPromptSubmit.default` only.

### E) No Hooks

Skip host adapter configuration.

### F) Custom

Define explicit matcher and command sets in the user-level adapter while keeping
the route tuple and typed handler registry unchanged.

## Operator Helpers and Migration

`repo-harness init` writes package helper guidance in `.ai/hooks/README.md`.
It does not copy `workflow-state.sh`. It preserves existing copies and edits.
Use `repo-harness run <helper>` to run packaged helpers. Change direct callers
to the package path from `repo-harness hook-lib path`. Test them, back up the
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
- Handler changes belong in `src/cli/hook/` with focused tests; update the
  declared asset projection with `bun run sync:hooks`.

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
