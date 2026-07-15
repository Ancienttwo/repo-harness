# Implementation Notes: ESA-01..05 + ESA-07 Effective State authority convergence

> **Status**: Executing
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Contract**: tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md
> **Review**: tasks/reviews/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.review.md
> **Last Updated**: 2026-07-15 15:25 +0800
> **Lifecycle**: notes

## P1/P2/P3 Decisions

- P1: pure artifact, state, workflow-profile, and capability-registry rules now live under `src/core`; repository/Git/lock/version/cache operations live under `src/effects`; CLI, hook, and MCP surfaces are adapters. Repository artifacts remain authority; cache and `tasks/current.md` remain replaceable projections.
- P2: risk input enters the CLI adapter, the effectful resolver locks and collects an exact source-hash set, pure core projects state, and a second read proves stability. A Git-common-dir lock then covers the entire publication transaction: publish the rollback-capable cache first and commit the version owner last. CLI follows requested risk; hook/MCP follow fixed inspect policy while sharing repository authority.
- P3: preserve protocol `1`, command/tool names, CLI ordering/exits, and 0.10.x compatibility; remove the retired authoring paths in the same cutover. No feature flag, dual parser, semantic fallback, or alternate authority was added. ESA-06 writer semantics remain deferred.

## Authority And Packaging Decisions

- `interfaces/effective-state-v1.ts` is the packed protocol boundary; `interfaces/types.ts` re-exports it.
- Workflow profile moved from the hook adapter to `src/core/workflow/profile.ts` with no compatibility re-export.
- Capability-registry parsing, validation, diagnostics, normalization, and longest-prefix matching have one canonical core owner. The adopted helper is generated as a typed standalone source projection with a canonical source hash; the checker never executes target-owned scripts.
- `src/cli/hook/state-snapshot.ts` is a compatibility projection only. Git review-subject observation moved to `src/effects/review/diff-fingerprint.ts`, with a CLI runner at `src/cli/hook/review-subject.ts`; the boundary gate rejects Effects-to-CLI reverse imports.
- MCP uses the canonical effectful resolver. Its tool annotation is `readOnlyHint: false` because exact durable `state_version` parity materializes ignored cache/version read models. The retained redacted `tasks/current.md` preview and MCP policy profile are explicitly labeled non-authoritative/additive.

## Concurrency Invariants

- Repository-local resolution uses an exclusive lock directory and a newly generated token filename for each acquisition attempt. Reclaim observes one exact token, confirms stale/dead ownership, rechecks directory and token inode identity, unlinks only that filename, then relies on `rmdir` to fail closed if another token appeared.
- Repository and Git-common-dir roots are canonical real directories. Every intermediate lock ancestor is created one level at a time, rejected if it is a symlink/non-directory, and bound by `dev/ino`; ancestors are rechecked before token publication and before `run()`.
- A live or unknown token is never reclaimed: malformed fallback parses the PID from the production token filename and reclaims only a confirmed-dead PID; `EPERM` is treated as alive. Before `run()`, the acquirer rechecks the original directory `dev/ino`, sole token filename, and owner inode.
- An empty directory cannot distinguish a crashed creator from a live creator paused between `mkdir` and token publication. It is therefore never auto-reclaimed, regardless of mtime; timeout plus verified operator cleanup is the explicit availability recovery path.
- `state_version` ownership and its allocation lock live in the Git common-dir. A repo-local resolver lock is deliberately not used as the linked-worktree serialization authority.
- Subprocess proofs cover both invariants: twelve simultaneous stale reclaimers never exceed one critical owner; an aged empty pre-token creator completes before the contender enters; a production-shaped live/reused-PID token reaches the real 5-second fail-closed timeout without deletion; twelve publishers split across linked worktrees return versions `1..12` and leave one common-dir owner at `12`.

## Characterization And Fault Evidence

- Twelve full normalized golden records retain stable source hashes and Git revisions exactly. Tests independently derive file hashes, `authority_revision`, and `state_revision`. Real CLI subprocesses match requested-risk resolution; real hook subprocess and MCP public dispatch match direct inspect resolution; repository authority fields remain identical across the intentional policy delta.
- Non-`ENOENT` authority reads fail closed. Fault tests cover plan/policy/registry `EACCES`, malformed and parseable-invalid policy, authoritative paths that become directories, cache temp/publish failure, owner temp/publish failure, symlink ancestors, token replacement, dead/malformed/live owners, deleted/corrupt cache, and continuous capability-registry mutation.
- Policy and capability-registry files participate in `source_hashes`; resolver-owned policy fields are eagerly validated even for clean inspect/no-target calls. Sequential mutation advances revision/version, while continuous mutation or any cache/owner fault publishes no partial authority and consumes no version.
- The third and final repair round closes the remaining platform/error-boundary gaps: policy-owned paths must be contained under both POSIX and Win32 grammars, `safeRealpath` degrades only explicit `ENOENT`, Git version reads return `0` only when discovery metadata is actually absent, and the unused standalone cache-writer export is removed so fault injection uses the resolver transaction seam.
- The ESA-01 baseline benchmark at `main@82550779cdccf0575d674ae53bbc95ba63e44743` recorded median `223.197 ms` and p95 `270.589 ms`, giving a +10% p95 budget of `297.648 ms`. On clean source commit `26dd6e88ea7c5fcf1a80439044283e98d892da41`, the single final 100-resolution run recorded median `169.460 ms` and p95 `241.095 ms`: p95 is 10.900% below baseline and 56.553 ms inside the budget. The earlier 170.305/215.574 calibration remains invalid pre-freeze evidence.

## Focused Verification To Date

- `bun run check:type`: pass.
- Pre-third-round relevant matrix: `bun test tests/state tests/effective-state.test.ts tests/runtime-profile-enforcement.test.ts tests/capabilities tests/cli/state-command.test.ts tests/cli/state-snapshot.test.ts tests/cli/mcp-tools.test.ts`: 167 pass, 0 fail, 1,500 assertions across 12 files in 89.39 seconds; it is not the final source evidence after the last narrow delta.
- Third-round focused matrix: `bun test tests/effective-state.test.ts tests/state/state-effects.test.ts tests/cli/state-snapshot.test.ts`: 71 pass, 0 fail, 251 assertions. Windows traversal, worktree-owner `ELOOP`, explicit non-Git version `0`, corrupt Git discovery fail-closed, transaction faults, and baseline snapshot behavior pass.
- Earlier unified repair subset: `bun test tests/effective-state.test.ts tests/state/state-effects.test.ts tests/state/state-concurrency.test.ts`: 72 pass, 0 fail after the second repair round.
- `bun test tests/effective-state.test.ts tests/state/state-effects.test.ts tests/state/state-concurrency.test.ts tests/state/adapter-parity.test.ts tests/cli/state-command.test.ts tests/cli/state-snapshot.test.ts`: 97 pass, 0 fail before the final eager-policy and evidence-hardening delta; every changed subset was subsequently reverified. A separate 86/86 checkpoint preceded one test-fixture correction and is not final evidence.
- `bun test tests/runtime-profile-enforcement.test.ts -t "patch spanning two capability prefixes"`: pass after replacing an obsolete simplified registry fixture with a valid canonical registry record.
- `bun run check:hooks`, `bun run check:helpers`, and `bun run check:state-boundaries`: pass; projection hashes remain `sha256:a28c881fdbbff56ab039140c355bf468ca7b2451ae34a6a372d99972efc6f53f` and `sha256:5b82b946bb37c6ce1ea69f8e1e117f849326ce55ec8bfa741f38c6f50c8edf08`, with 102 TypeScript files checked. `git diff --check`, architecture sync, and task sync also pass.
- Earlier frozen slices: state core 27 pass; adapter/golden/CLI 33 pass; effective-state integration 35 pass; capability/config/architecture 27 pass; helper/boundary 13 pass; generated hook/helper drift checks pass.
- On clean source commit `26dd6e88`, packed `repo-harness-0.10.1.tgz` installs and its packaged CLI bins start.
- The only final authoritative Harness run completed all 27 arms (3 profile bases x 9 scenarios) with 27 pass / 0 fail. Report validation returns `authoritative=true`, benchmark subject `sha256:f7f7cebdb595359aff5a0639e490376bf1e7f8aa452b1d3284072304ce70be0b`, and report evidence `sha256:676fb10bb9012919baf96e7464e9e741cf4ec7c8eb36548036be105f33b28373`; the report source commit is `26dd6e88ea7c5fcf1a80439044283e98d892da41`.
- The pre-refactor full suite recorded 1493 pass, 1 skip, 0 fail. It is historical characterization, not final release evidence.

## Review Findings Closed

- Closed linked-worktree lost updates by moving version ownership and allocation locking to the Git common-dir.
- Closed static ancestor redirection and flat-file pathname TOCTOU with canonical roots, stepwise no-symlink ancestors, directory-token ownership, exact-token deletion, inode checks, liveness checks, and pre-run exclusivity validation.
- Closed the unsafe empty-directory reclaim rule by preserving every pre-token empty directory fail-closed; PID reuse remains an explicit manual-recovery availability condition rather than an invented cross-platform identity heuristic.
- Closed version/cache partial publication with a common-lock transaction, cache rollback, and version-owner-last commit point; cold/warm and linked-worktree fault injection proves no consumed version.
- Closed plan/policy/registry fail-open reads: only `ENOENT` means absent, resolver-owned policy metadata is eagerly validated, and permission/malformed inputs publish neither cache nor owner.
- Replaced injected adapter "parity" with real CLI/hook/MCP public paths and named the intentional requested-risk versus fixed-inspect policy boundary.
- Closed Win32 backslash traversal in policy-owned paths, worktree/common-dir error swallowing, and the zero-caller standalone cache publication bypass; direct cache fault tests now exercise only the resolver transaction seam.
- Closed hidden MCP mutation by advertising the actual effectful contract and testing cache/version materialization.
- Closed arbitrary target-script execution in the boundary checker; it performs static/source-hash validation only.
- Closed Effects-to-CLI reverse dependency and expanded the durable checker to reject the actual migrated legacy artifact-authority names.

## Deviations And Tradeoffs

- The approved Sprint proposed `0.11.0` only if ESA-06 mandatory overwrite preconditions shipped. ESA-06 remains deferred, so this cutover is the non-breaking `0.10.1` release surface and is not published or tagged by this task.
- The standalone helper changed from a runtime Bun bundle to a deterministic typed source projection because bundling erased the public type surface needed by adopted repositories. It remains a generated projection of one canonical implementation.
- Exact MCP `state_version` parity cannot be guaranteed by a number-only read without materializing the durable read model. The MCP tool therefore declares the write accurately instead of introducing a speculative counter or compatibility shape.
- Final release/workflow gates, Claude review binding, PR, merge, and remote-main verification remain pending. The one permitted 3x9 benchmark and the final 100-resolution evidence are complete; no benchmark rerun is allowed for this subject.

## Deferred Scope

- ESA-06 guarded workflow-artifact writer and overwrite-precondition semantics remain unmodified and unclaimed.
- PID reuse can make a genuinely stale token look live to `kill(pid, 0)`. This is fail-closed mutual-exclusion behavior with a bounded timeout and verified manual cleanup requirement, not an automatic liveness guarantee; no FFI/native runtime dependency was added.
- Active hostile rename of a validated ancestor after the final `lstat` remains outside the portable Node/Bun proof because the runtime exposes no `openat`/dirfd primitive. The accepted threat boundary requires canonical ancestors not be actively renamed during a held lock; static/intermediate symlink redirection is rejected and regression-tested.
- Non-blocking P3: legacy hook-only `StateSnapshot` facts (`spec`, `pending`, evidence, and contract path) are read after canonical Effective State stability is established, so a concurrent edit can make those compatibility-only fields reflect the next instant. Canonical plan/profile/blockers remain shared-state projections. If the snapshot contract is changed later, bundle these facts into the same stable observation rather than widening this cutover.
- The untracked Skill Surface and Harness Loop artifacts in the main checkout are outside this work-package and remain no-touch.
