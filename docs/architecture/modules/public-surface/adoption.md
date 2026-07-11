# Architecture Module: public-surface/adoption

> **Capability ID**: `public-surface-adoption`
> **Matched Prefixes**: `src/cli/commands/adopt-plan.ts`, `src/core/adoption`, `src/effects/fs-transaction.ts`, `src/effects/path-safety.ts`, `tests/cli/adoption-plan.test.ts`, `tests/fixtures/adoption`
> **Local Contracts**: `AGENTS.md`, `CLAUDE.md`

## P1 Map

The adoption capability plans and applies repo-harness changes to an existing repository.

- `src/core/adoption/` owns pure operation types, planning, rendering, rollback descriptions, and workflow-contract projections.
- `src/cli/commands/adopt-plan.ts` owns both the CLI-facing plan boundary and the canonical transaction result.
- `src/effects/fs-transaction.ts` and `src/effects/path-safety.ts` own atomic filesystem mutation and containment checks.
- `docs/architecture/transactional-adoption-planner.md` is the detailed human design source.

The capability shares one package and release with the CLI. A separate workspace package is not justified without a second independently released or deployed consumer.

## P2 Trace

Concrete route: inspected repository state -> pure adoption planner -> full preflight -> filesystem transaction -> backup manifest -> explicit registry, CodeGraph, handoff, and strict workflow effects. Planning code must not import effects; effects consume planned operations and preserve path-safety and rollback evidence.

Error paths fail before or within the transaction for unsafe paths, malformed managed JSON, stale preconditions, or write failures. No shell compatibility planner, experimental apply flag, or second apply authority is introduced by this boundary.

## P3 Decision

Keep the pure planner and filesystem effects direction explicit. Shared primitives belong in `src/core/adoption/` only when they serve multiple real consumers or protect a cross-module invariant. The first 10x pressure point is transaction size and rollback evidence, not package layout.

## Verification

- `bun test tests/cli/adoption-plan.test.ts`
- `bun run check:type`
