> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Capability Command Notes

## Decision

Add `agentic-dev-capability` as a narrow public command for selected capability
boundaries.

## Rationale

`agentic-dev-init` intentionally installs or refreshes the full repo-local
harness through `migrate-project-template.sh --apply`. That is too broad when a
repo already has the harness and the user only wants specific subfolder
`AGENTS.md` / `CLAUDE.md` contracts plus capability routing.

## Contract

- `scripts/capability-config.ts add --prefix <path>` updates
  `.ai/context/capabilities.json`.
- The command reuses `scripts/context-contract-sync.sh` for local contract files
  and `.ai/context/context-map.json`.
- The command validates through `scripts/capability-resolver.ts validate`.
- It does not run `scripts/migrate-project-template.sh --apply`.
