# Plan: ESA-01..05 + ESA-07 Effective State authority convergence

> **Status**: Executing
> **Created**: 20260715-1109
> **Slug**: esa-01-freeze-effective-state-invariants-and-characterization-fixtures
> **Planning Source**: parent-agent-p1-p2-p3
> **Orchestration Kind**: sprint-task
> **Source Ref**: sprint:plans/sprints/20260714-effective-state-authority-convergence.sprint.md#`ESA-01` — Freeze Effective State invariants and characterization fixtures
> **Artifact Level**: work-package
> **Promotion Reason**: worktree_boundary
> **Verification Boundary**: Characterization/parity/fault tests, boundary and package gates, one subject-bound 3×9 benchmark, release validation, and strict workflow verification.
> **Rollback Surface**: Revert this isolated branch; the cutover is source-only, retains Effective State protocol `1`, and leaves ESA-06 writer semantics deferred.
> **Spec**: `docs/spec.md`
> **Research**: `docs/researches/20260715-archi-research.md`
> **Task Contract**: `tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md`
> **Task Review**: `tasks/reviews/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.review.md`
> **Implementation Notes**: `tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md`

## Goal

Freeze the current Effective State v1 behavior at baseline `82550779cdccf0575d674ae53bbc95ba63e44743` before any production movement. The slice delivers reusable fixture construction, full normalized CLI/state goldens for at least ten authority/risk/concurrency states, explicit lock/cache/source-mutation characterization, an authority ADR, and a 100-resolution baseline benchmark.

After ESA-01 acceptance, continue the approved ordered Sprint through ESA-02, ESA-03, ESA-04, ESA-05, and ESA-07 in this isolated branch. ESA-06 remains deferred intact. The combined closeout is required because the repository-wide authoritative Harness benchmark binds `src/cli` and must be produced once after the final production code freeze, not regenerated after each intermediate move.

## P1: Architecture Map

- `src/core/state`, `src/core/workflow`, and `src/core/capabilities` now own pure artifact semantics, Effective State projection, risk/profile policy, and capability matching.
- `src/effects/state` owns source collection, stability retries, canonical-ancestor directory-token locking, and one Git-common-dir transaction whose cache publication precedes the version-owner commit point; `src/effects/review` owns Git review-subject observation.
- `src/cli/commands/state.ts`, `src/cli/hook/state-snapshot.ts`, and `src/cli/mcp/state-tools.ts` are adapters. The hook is a compatibility projection; MCP materializes the canonical ignored read model and labels both its MCP policy and retained `tasks/current.md` preview authority.
- `interfaces/effective-state-v1.ts` is the packed public protocol surface. The standalone capability helper is a deterministic typed projection of the canonical core plus its CLI adapter.
- Repository artifacts remain authority. Cache, `tasks/current.md`, checks, handoff, and resume remain read models/evidence; ESA-06 writer semantics stay out of scope.

## P2: Concrete Trace

1. `repo-harness state resolve --json` parses CLI risk arguments in `src/cli/commands/state.ts`.
2. `resolveEffectiveState` resolves one canonical repository root, rejects symlink ancestors while creating the repo-local exclusive lock path, publishes one unique token file, then performs the bounded stability loop.
3. Effects read markers/artifacts, eagerly validate policy (including POSIX/Win32 containment for policy-owned paths), read the capability registry and Git review subject, and treat only explicit absence/non-Git state as degradable; other read/canonicalization failures abort. Every state-influencing file is source-hashed, so registry/policy mutation retries or fails before publication.
4. Pure core projects profile, phase, blockers, freshness, conflicts, next action, and protocol ordering.
5. A canonical Git-common-dir lock serializes linked worktrees. Stable state first atomically publishes the rollback-capable ignored cache, then commits the version owner as the sole authoritative commit point; failure before that point restores the exact prior cache bytes and consumes no version.
6. CLI renders the caller-requested risk policy, while hook and MCP deliberately use the default `inspect` policy. All three share repository authority fields; MCP returns the inspect compact projection plus explicitly non-authoritative preview metadata.

The pressure point is synchronous Git/source observation. Pure projection is not the scaling bottleneck; the 100-resolution benchmark guards the accepted +10% p95 envelope.

## P3: Decision Rationale

- Keep one implementation per semantic authority and one deterministic projection for packaged standalone code; no compatibility re-export, alternate parser, or feature flag remains.
- Preserve public protocol/tool/command names and make the only MCP 0.10.x changes additive. `current` remains a redacted preview and gains explicit non-authoritative labels.
- Use exclusive lock directories rather than flat lock files: stale reclaim deletes only the exact observed token filename, then `rmdir` fails closed if another entry exists. Empty pre-token directories and live/unknown PID identity are never auto-reclaimed; verified operator cleanup is the availability recovery path. Version publication has a separate common-dir lock because repo-local locks cannot serialize linked worktrees.
- Treat non-`ENOENT` authority reads and malformed policy metadata as errors. Cache/version publication occurs only after source stability, including policy and capability registry, and the version owner is committed last.
- Keep the helper projection typed and runnable by concatenating canonical core source with the stripped adapter import; `check:helpers`, typecheck, and packed-runtime smoke jointly prevent source, byte, runtime, or type drift.
- At 10x scale, repeated Git/source reads fail first; no speculative cache authority or broad framework is introduced.

## Scope

### In scope

- `tests/state/` fixture helper, golden matrix, concurrency/fault characterization, benchmark, and committed golden JSON.
- Minimal refactor of `tests/effective-state.test.ts` to consume the reusable helper.
- `docs/architecture/effective-state-authority.md` with the ten frozen invariants and dependency direction.
- Sprint, contract, review, notes, and derived workflow synchronization.
- ESA-02 core policy/public contract extraction.
- ESA-03 pure projection plus explicit state effects and shared Git common-dir version ownership.
- ESA-04 canonical capability registry with generated standalone helper projection.
- ESA-05 canonical CLI/hook/MCP adapter projection.
- ESA-07 boundary checker, packed-product smoke, documentation, one final authoritative benchmark, and release/merge validation.

### Out of scope

- ESA-06 workflow-artifact writer hardening and every unrelated writer.
- New fallback, compatibility path, feature flag, or alternate authority.

## File Changes

| File | Action | Purpose |
|---|---|---|
| `tests/state/effective-state-fixture.ts` | add | Reusable real-Git fixture construction and mutation helpers |
| `tests/effective-state.test.ts` | edit | Consume the shared fixture helper without changing assertions |
| `tests/state/cli-state-golden.test.ts` | add | Full normalized direct/CLI/hook goldens for 10+ states |
| `tests/state/state-concurrency.test.ts` | add | Live/stale lock and source-instability/cache publication characterization |
| `tests/state/benchmark-effective-state.ts` | add | 100-resolution median/p95 baseline harness |
| `tests/state/fixtures/*.json` | add | Committed golden outputs |
| `docs/architecture/effective-state-authority.md` | add | Authority/projection ADR and frozen invariants |
| workflow artifacts | edit | Decision, evidence, review, and closeout state |

## Acceptance

- ESA-01 golden CLI/state fixtures cover at least 10 authority/risk/concurrency states and retain the baseline protocol, field ordering, exit, blocker/reason, version, and hash contracts.
- Workflow policy and Effective State v1 types have one pure core owner; state parsing/projection and capability-registry rules have one canonical implementation each.
- Lock, Git-common-dir version ownership, cache publication, and source-stability effects are explicit and pass live/stale/malformed/token/ancestor/fault tests without partial authoritative publication.
- Direct resolver and CLI agree for the requested risk input; hook and MCP agree with a direct `inspect` resolution; all public paths agree on repository authority fields while the intentional adapter policy delta is named and tested. MCP no longer treats `tasks/current.md` as authority.
- Boundary, helper projection, full CI/release, tarball/install/adopted-helper smokes, strict workflow verification, and the final subject-bound 3×9 benchmark pass.
- Architecture/changelog/notes record the actual non-breaking `0.10.x` cutover; ESA-06 remains deferred with no compatibility shim.

## Verification

```bash
bun test tests/effective-state.test.ts
bun test tests/state/cli-state-golden.test.ts tests/state/state-concurrency.test.ts
bun tests/state/benchmark-effective-state.ts
bun run check:type
bash scripts/check-task-sync.sh
bash scripts/check-architecture-sync.sh
repo-harness run verify-contract --contract tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md --strict
```

## Promotion Gate

- Merge/PR unit: characterization, single-authority cutover, adapter convergence, boundary enforcement, package proof, and release evidence share one code-freeze/benchmark subject.
- Rollback surface: revert the isolated convergence commit; no persisted repository schema or public protocol migration is required.
- Verification boundary: exact fixtures, fault/parity/boundary/package gates, strict workflow checks, and subject-bound benchmark/review evidence must pass before finish.
- Review/acceptance boundary: stable public protocol/adapter semantics, one implementation per authority rule, no partial state publication, and no source-tree dependency in packed helpers.
- High-risk surface: state authority ownership moves across core/effects/adapters, so external acceptance and clean-checkout evidence bind the final content.
- Why not checklist row: the source cutover and its benchmark/package proof are one rollback and merge boundary.

## Evidence Contract

- **State/progress path**: this plan, its contract/review/notes, and sprint rows ESA-01..05 / ESA-07.
- **Verification evidence**: focused pure/effects/concurrency/adapter/capability/boundary suites, type/projection/package gates, root required checks, and strict contract/sprint verification.
- **Evaluator rubric**: functionality and code_quality at least 9/10, exact manual evidence, and external acceptance bound to the current normalized-final-content subject.
- **Stop condition**: stop before commit/merge if `verify-sprint` cannot bind current contract, review, external acceptance, allowed paths, or repository benchmark evidence.
- **Rollback surface**: discard or revert the isolated branch; all new runtime cache/run files are ignored evidence.

## Risks and Rollback

| Risk | Mitigation |
|---|---|
| Goldens normalize away semantics | Freeze stable hashes exactly; normalize only root-derived values and independently recompute file, authority, and state revisions |
| Concurrency test flakes | Use bounded real subprocess coordination and accept only the documented stable-or-fail-closed outcomes |
| Test helper refactor changes fixture meaning | Preserve byte-identical fixture content and rerun the existing suite first |
| Benchmark is host-noisy | Record evidence only; do not add a wall-clock CI gate in ESA-01 |

Rollback is a single branch revert; no artifact or protocol migration is needed.

## Task Breakdown

- [x] Extract and validate the reusable Effective State fixture helper.
- [x] Add and commit the 10+ scenario golden matrix.
- [x] Add lock/cache/source-instability characterization.
- [x] Add the authority ADR and 100-resolution benchmark harness.
- [x] Record benchmark/check evidence and obtain a current passing review.
- [x] Complete ESA-02 core policy/public-contract extraction.
- [x] Complete ESA-03 read/project/persist effects split and fault matrix.
- [x] Complete ESA-04 canonical capability registry and deterministic standalone projection.
- [x] Complete ESA-05 CLI/hook/MCP convergence and parity matrix.
- [ ] Complete ESA-07 boundaries, package/release proof, docs, review, PR/merge/push closeout.
