> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Command Surface Split Notes

## Decision

Add focused public command facades for architecture, handoff, and deploy/ops
work:

- `agentic-dev-architecture`
- `agentic-dev-handoff`
- `agentic-dev-deploy`

## Rationale

`agentic-dev-init` and `agentic-dev-upgrade` are intentionally broad harness
paths. Architecture docs, handoff packets, and deploy/ops readiness are common
follow-up capacities that users may request independently after the harness is
already installed.

## Contract

- `agentic-dev-architecture` routes to architecture index, drift requests,
  capability matching, request archiving, and `diagram-design` only when a
  diagram materially helps.
- `agentic-dev-handoff` routes to `prepare-codex-handoff.sh` and
  `codex-handoff-resume.sh`; it does not run `/check` by default.
- `agentic-dev-deploy` reads the operations policy and validates the
  `deploy/` versus `_ops/` boundary; it does not publish or deploy.
- None of these facades runs `scripts/migrate-project-template.sh --apply`.
