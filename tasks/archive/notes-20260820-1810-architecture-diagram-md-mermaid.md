> **Archived**: 2026-08-20 18:10
> **Related Plan**: (none)
> **Outcome**: Superseded
> **Lifecycle**: notes
> **Parent Run ID**: orphan-family-sweep

# Architecture Diagram Markdown Mermaid Notes

> **Date**: 2026-05-29
> **Slice**: architecture-diagram-md-mermaid

## Decision

Use Mermaid fenced blocks inside architecture Markdown as the semantic diagram
source. Keep `diagram-design` HTML under `docs/architecture/diagrams/` as an
optional human-readable rendering that links back to the Markdown source.

## Tradeoff

This avoids adding a second tracked source artifact such as `.mmd`, keeps LLM
reading and review diffs in the same Markdown document, and preserves existing
HTML diagram output for human review. The cost is that generated HTML cannot be
treated as authoritative; it must remain a rendering of the Markdown source.

## Verification Focus

- Contract blocks should expose both the semantic Markdown source and latest
  human HTML diagram.
- New architecture drift requests should tell agents to write Mermaid in
  Markdown first.
- Existing generated repo scaffolding should still create
  `docs/architecture/diagrams/` and keep `diagram-design` external.
- Full `bun test` also exposed a pre-existing CodeGraph generated-policy drift:
  generated defaults said `primary_host: both` while self-host policy and tests
  expect Codex-first. This slice normalizes the generated defaults back to
  `codex` and the Codex-specific readiness string so full verification can
  close.
