# Implementation Notes: luna-xhigh-fast-worker

> **Status**: Complete
> **Plan**: user-approved direct configuration change
> **Contract**: (none)
> **Review**: deterministic installer and projection tests
> **Last Updated**: 2026-07-12
> **Lifecycle**: configuration notes

## Decision

- Map upstream `sonnet` / `max` frontmatter to Codex `gpt-5.6-luna` with
  `xhigh` reasoning. `fast-worker` remains the only generated role using the
  existing `workspace-write` sandbox.
- Keep the upstream Claude source unchanged: it is the external authority for
  provider frontmatter; the local installer owns only the Codex projection.
- Update the generated golden TOML, template projection, mapping reference, and
  assertions together so no second model mapping can drift.

## Evidence

- Local Codex 0.144.1 advertises `gpt-5.6-luna` with `xhigh` support.
- `bun test tests/install-agent-fleet.test.ts tests/bootstrap-files.test.ts`
  passed (33 tests).
- `bun test` passed (1111 pass / 1 skipped / 0 fail).
- `bun scripts/sync-helper-sources.ts --check` and `bun run check:helpers`
  passed.
