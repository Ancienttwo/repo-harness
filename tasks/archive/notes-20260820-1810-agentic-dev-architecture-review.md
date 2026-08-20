> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# agentic-dev Architecture Review Notes

> **Date**: 2026-05-25
> **Slice**: plugin-wide architecture ledger backfill

## Decision

Update architecture truth before changing engine behavior. The current inspector,
strict workflow gate, and regression suite were healthy, but `docs/architecture/*`
had no capability-level map after the `agentic-dev` rename.

## Tradeoffs

- Added explicit capability registry entries for the real ownership surfaces
  instead of relying on root fallback matching.
- Replaced the legacy `project-initializer` diagram with a canonical
  `agentic-dev` diagram while preserving legacy names as compatibility aliases
  in prose.
- Left `.codex/hooks.json` untracked and removed it from the committed
  architecture contract because this repo only has evidence for global
  `~/.codex` runtime state, not a native repo-local `.codex/` surface.
  Superseded on 2026-05-26 by `tasks/notes/codex-hook-adapter.notes.md` after
  local Codex 0.130.0 evidence confirmed repo-local `.codex/hooks.json`
  support.

## Verification Plan

- `bun scripts/capability-resolver.ts validate --format text`
- `bash scripts/check-task-workflow.sh --strict`
- `bash scripts/check-task-sync.sh`
- `bun scripts/inspect-project-state.ts --repo . --format text`
- `bash scripts/migrate-project-template.sh --repo . --dry-run`
- `bun test`
