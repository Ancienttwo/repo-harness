# Transactional Adoption Planner

> **Status**: Canonical apply authority
> **CLI Surface**: `repo-harness adopt [--dry-run] [--mode minimal|standard|self-host]`
> **Protocol**: `1`

## Authority

`src/core/adoption/standard-plan.ts` is the single repo-local mutation plan for
both `repo-harness adopt` and `runInit()`. `src/effects/fs-transaction.ts` is
the only executor. The former shell migration scripts and the experimental
apply flag have been removed; no fallback or alias may reintroduce them.

The planner reads canonical assets, target-repo state, and the workflow
contract before the executor writes. It represents standard scaffold, state,
hooks, templates, reference stubs, package scripts, legacy workflow
archives/moves, known-generated cleanup, deployment scaffold, and `.gitignore` updates as
one ordered operation list. User-authored files are preserved; malformed
managed JSON, unsafe paths, and ambiguous ownership stop planning.

## Runtime Trace

```text
adopt / runInit
  -> validate repo target
  -> planAdoption (pure, no writes)
  -> full transaction preflight
  -> fs transaction + manifest
  -> registry registration
  -> CodeGraph readiness
  -> handoff refresh
  -> strict workflow verification
```

The post-apply effects are explicit steps, not a fallback mutation route.
`self-host` currently fails before scaffold writes because its repo-pinned
hook/runtime review has not been made deterministic.

## Recovery

Before a non-dry-run attempt mutates the target, the planner requires a safe,
structurally usable manifest path under
`.ai/harness/backups/fs-transaction/<transaction>/manifest.json`; an unsafe or
blocked path fails without any target mutation. A later manifest persistence
failure is reported as a failed transaction, never as success. File replacement saves a backup and content hash; removes
move their target into the transaction directory; moves record source and
destination. `repo-harness adopt rollback --transaction <manifest>` reverses
only transaction-owned changes and refuses to overwrite post-apply user edits.
Git index changes restore only after the corresponding transaction-owned file
has been restored.

## Invariants

- One source of truth: assets and workflow contract provide canonical bytes and
  operation inventory; rendered plan, manifest, and registry are projections.
- No compatibility authority: no shell migration path, experimental flag,
  helper wrapper, or local script alias remains.
- Fail closed: symlinks, malformed managed JSON, unsupported self-host review,
  unsafe paths, and occupied move targets stop before standard writes.
- Preserve private ownership: `_ops/` and repo-local host adapter config are
  never moved, rewritten, or deleted by standard adoption; only byte-identical
  generated helpers qualify for cleanup.
- Reject `--reclaim-runtime` and `--compact` until those destructive changes
  can join the same planned transaction.
- Shared abstraction only protects the real two-consumer invariant: target
  validation is shared by `init` and `adopt`.

## Verification

- `bun test tests/cli/adoption-plan.test.ts`
- `bun test tests/cli/init.test.ts`
- `bun run check:type`
- `repo-harness run check-task-workflow --strict`
