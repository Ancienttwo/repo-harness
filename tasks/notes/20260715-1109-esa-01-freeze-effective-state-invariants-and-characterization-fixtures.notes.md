# Implementation Notes: ESA-01..05 + ESA-07 Effective State authority convergence

> **Status**: Executing
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Contract**: tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md
> **Review**: tasks/reviews/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.review.md
> **Last Updated**: 2026-07-15 13:36 +0800
> **Lifecycle**: notes

## P1/P2/P3 Decisions

- P1: pure artifact, state, workflow-profile, and capability-registry rules now live under `src/core`; repository/Git/lock/version/cache operations live under `src/effects`; CLI, hook, and MCP surfaces are adapters. Repository artifacts remain authority; cache and `tasks/current.md` remain replaceable projections.
- P2: risk input enters the CLI adapter, the effectful resolver locks and collects an exact source-hash set, pure core projects state, a second read proves stability, the Git-common-dir owner serializes version allocation, and the cache is published atomically. CLI, hook, and MCP then project the same canonical state.
- P3: preserve protocol `1`, command/tool names, CLI ordering/exits, and 0.10.x compatibility; remove the retired authoring paths in the same cutover. No feature flag, dual parser, semantic fallback, or alternate authority was added. ESA-06 writer semantics remain deferred.

## Authority And Packaging Decisions

- `interfaces/effective-state-v1.ts` is the packed protocol boundary; `interfaces/types.ts` re-exports it.
- Workflow profile moved from the hook adapter to `src/core/workflow/profile.ts` with no compatibility re-export.
- Capability-registry parsing, validation, diagnostics, normalization, and longest-prefix matching have one canonical core owner. The adopted helper is generated as a typed standalone source projection with a canonical source hash; the checker never executes target-owned scripts.
- `src/cli/hook/state-snapshot.ts` is a compatibility projection only. Git review-subject observation moved to `src/effects/review/diff-fingerprint.ts`, with a CLI runner at `src/cli/hook/review-subject.ts`; the boundary gate rejects Effects-to-CLI reverse imports.
- MCP uses the canonical effectful resolver. Its tool annotation is `readOnlyHint: false` because exact durable `state_version` parity materializes ignored cache/version read models. The retained redacted `tasks/current.md` preview and MCP policy profile are explicitly labeled non-authoritative/additive.

## Concurrency Invariants

- Repository-local resolution uses an exclusive lock directory and a newly generated token filename for each acquisition attempt. Reclaim observes one exact token, confirms stale/dead ownership, rechecks directory and token inode identity, unlinks only that filename, then relies on `rmdir` to fail closed if another token appeared.
- A live partial token is never reclaimed: malformed fallback parses the PID from the production token filename and reclaims only a confirmed-dead PID; `EPERM` is treated as alive. Before `run()`, the acquirer rechecks the original directory `dev/ino`, sole token filename, and owner inode.
- An aged empty directory left by a crash before token publication is recoverable only after the same `dev/ino` is observed again and the directory is still empty. A paused creator whose directory was replaced cannot pass the pre-run identity check.
- `state_version` ownership and its allocation lock live in the Git common-dir. A repo-local resolver lock is deliberately not used as the linked-worktree serialization authority.
- Subprocess proofs cover both invariants: twelve simultaneous stale reclaimers never exceed one critical owner; a delayed live partial-token publisher never overlaps its contender; twelve allocators split across linked worktrees return versions `1..12` and leave one common-dir owner at `12`.

## Characterization And Fault Evidence

- Twelve full normalized golden records retain stable source hashes and Git revisions exactly. Tests independently derive file hashes, `authority_revision`, and `state_revision`, and require direct/CLI/hook/MCP parity on the approved canonical fields.
- Non-`ENOENT` authority reads fail closed. Fault tests cover authoritative paths that become directories, legacy-marker read faults, cache temp-write/rename failure, symlink lock paths, token replacement, dead/malformed/live owners, deleted/corrupt cache, and continuous capability-registry mutation.
- Policy and capability-registry files participate in `source_hashes`; sequential mutation advances revision/version, while continuous mutation publishes neither cache nor version.
- The ESA-01 baseline benchmark at `main@82550779cdccf0575d674ae53bbc95ba63e44743` recorded median `223.197 ms` and p95 `270.589 ms`, giving a +10% p95 budget of `297.648 ms`. A later 170.305/215.574 calibration predates the final lock subject and is not release evidence. The final 100-resolution result will be recorded once after code freeze and fingerprint freshness verification.

## Focused Verification To Date

- `bun run check:type`: pass.
- `bun test tests/state/state-effects.test.ts tests/state/state-concurrency.test.ts tests/check-state-boundaries.test.ts`: 29 pass, 0 fail after the final lock/boundary repair round.
- `bun test tests/cli/state-snapshot.test.ts tests/effective-state.test.ts tests/state/state-effects.test.ts`: 51 pass, 0 fail after restoring the baseline non-Git read-only version value without swallowing corrupt owner records.
- Earlier frozen slices: state core 27 pass; adapter/golden/CLI 33 pass; effective-state integration 35 pass; capability/config/architecture 27 pass; helper/boundary 13 pass; generated hook/helper drift checks pass.
- Packed `repo-harness-0.10.1.tgz` installs and its packaged CLI bins start on the final source tree.
- The pre-refactor full suite recorded 1493 pass, 1 skip, 0 fail. It is historical characterization, not final release evidence.

## Review Findings Closed

- Closed linked-worktree lost updates by moving version ownership and allocation locking to the Git common-dir.
- Closed flat-file pathname TOCTOU and stale-reclaimer ABA with directory-token ownership, exact-token deletion, inode checks, liveness checks, and pre-run exclusivity validation.
- Closed hidden MCP mutation by advertising the actual effectful contract and testing cache/version materialization.
- Closed arbitrary target-script execution in the boundary checker; it performs static/source-hash validation only.
- Closed Effects-to-CLI reverse dependency and expanded the durable checker to reject the actual migrated legacy artifact-authority names.
- Restored crash recovery for an aged empty directory without reopening the live-creator race.

## Deviations And Tradeoffs

- The approved Sprint proposed `0.11.0` only if ESA-06 mandatory overwrite preconditions shipped. ESA-06 remains deferred, so this cutover is the non-breaking `0.10.1` release surface and is not published or tagged by this task.
- The standalone helper changed from a runtime Bun bundle to a deterministic typed source projection because bundling erased the public type surface needed by adopted repositories. It remains a generated projection of one canonical implementation.
- Exact MCP `state_version` parity cannot be guaranteed by a number-only read without materializing the durable read model. The MCP tool therefore declares the write accurately instead of introducing a speculative counter or compatibility shape.
- Final authoritative 3x9 benchmark, release gates, review binding, PR, merge, and remote-main verification remain pending; implementation source is not considered frozen until both specialist delta reviews pass.

## Deferred Scope

- ESA-06 guarded workflow-artifact writer and overwrite-precondition semantics remain unmodified and unclaimed.
- Non-blocking P3: legacy hook-only `StateSnapshot` facts (`spec`, `pending`, evidence, and contract path) are read after canonical Effective State stability is established, so a concurrent edit can make those compatibility-only fields reflect the next instant. Canonical plan/profile/blockers remain shared-state projections. If the snapshot contract is changed later, bundle these facts into the same stable observation rather than widening this cutover.
- The untracked Skill Surface and Harness Loop artifacts in the main checkout are outside this work-package and remain no-touch.
