# Task Review: ESA-01..05 + ESA-07 Effective State authority convergence

> **Status**: In Progress
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Contract**: tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md
> **Notes File**: tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 13:45 +0800
> **Recommendation**: pending
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: af6d5216c2cd5adf2f672636a8308a309f0f5adb

## Human Review Card

- Verdict: pending final benchmark and release gates.
- Change type: code-change / internal authority cutover / non-breaking `0.10.1` package surface.
- Intended files changed: ESA-01..05 / ESA-07 core, effects, adapters, public interface, generated helper/hook projections, tests, docs, release metadata, and workflow artifacts listed by the contract.
- Actual files changed: intended contract scope only; ESA-06 workflow-artifact writer is absent from the diff.
- Commands passed so far: typecheck; hook/helper/state-boundary projection gates; focused core/effects/concurrency/adapter/capability tests; original non-Git state-snapshot suite; packed tarball CLI startup/install smoke.
- Residual risks: final authoritative benchmark, release gate, exact final review subject, hosted CI, and PR merge remain pending. One non-blocking hook-only snapshot timing residual is recorded below.
- Reviewer action required: bind the final subject and benchmark evidence after workflow closeout, then pass strict gates.
- Rollback: revert this isolated branch; no persisted repository schema or protocol migration is involved.

## P1/P2/P3 Review

- P1: architecture now has one pure core authority, explicit state/review effects, and thin CLI/hook/MCP adapters. The public Effective State v1 contract is packed under `interfaces/`; adopted capability logic is a generated typed projection rather than a handwritten second implementation.
- P2: CLI risk input → repo lock → stable authority/source observation → pure projection → Git-common-dir version allocation → atomic cache → adapter projections. The lock and version paths have independent subprocess proofs for repo-level and linked-worktree concurrency.
- P3: public protocol/tool/command semantics remain stable, MCP additions are labeled and additive, and retired authoring paths are deleted without a compatibility shim. ESA-06 is deferred, so the release remains `0.10.1`.

## Findings And Closure

- P1 closed: linked worktrees previously had independent version owners. The owner and allocation lock now live in Git common-dir; twelve concurrent allocators across two worktrees return exactly `1..12`.
- P1 closed: flat-file stale reclaim had pathname TOCTOU and directory-token publication had empty/partial creator ABA windows. Unique per-attempt tokens, dead-PID validation, EPERM fail-closed, dir/owner inode checks, sole-token validation, and exact-token unlink close them. A delayed live partial publisher and twelve stale reclaimers prove max critical concurrency `1`; aged empty orphan recovery rechecks the same empty dir identity.
- P1 closed: state-snapshot non-Git fixtures regressed when read-only version lookup required a Git common-dir. Only owner-path resolution now returns baseline `0`; an existing corrupt owner still fails closed. Original suite: 7 pass.
- P1 closed: MCP had hidden cache/version effects. The tool now advertises `readOnlyHint: false`, and tests assert both writes while keeping product authority unchanged.
- P2 closed: boundary validation could execute a target-owned generator and missed actual legacy parser names. It is now static/source-hash only and adversarial fixtures cover target-script non-execution, Effects-to-CLI imports, and migrated names.
- P2 closed: generated Bun bundling erased the adopted helper type surface. The deterministic typed source projection is source-hash bound, directly typechecked, and packed-smoked.

## Verification Evidence To Date

- `bun run check:type`: pass.
- `bun run check:hooks`: 25-file projection pass, `sha256:a28c881fdbbff56ab039140c355bf468ca7b2451ae34a6a372d99972efc6f53f`.
- `bun run check:helpers`: 49-helper projection pass, `sha256:5b82b946bb37c6ce1ea69f8e1e117f849326ce55ec8bfa741f38c6f50c8edf08`.
- `bun run check:state-boundaries`: 102 TypeScript files checked.
- Focused combined matrix: the only first-pass failure was a legacy stale fixture using a non-production token name; after correcting that fixture and the independently found non-Git regression, `tests/cli/state-snapshot.test.ts`, `tests/effective-state.test.ts`, and `tests/state/state-effects.test.ts` pass 51/51.
- Lock/boundary delta: 29 pass, 0 fail; packed `repo-harness-0.10.1.tgz` installs and packaged CLI bins start.
- Final authoritative report freshness check: existing report subject `sha256:88a8a1086a5ccc4c6629c1bf134b6706b3051ec1944d900f9f51d30bb445cad3` does not match frozen current subject `sha256:e5151d781e7b99cb938a46ce7fdb9b932d4eb7056e577d16172d49eafbaccbd6`; one new 3x9 run is required after the checkpoint commit.

## External Acceptance Advice

> **External Acceptance**: pending
> **External Reviewer**: Codex architecture and security specialists
> **External Source**: codex-subagent:/root/final_architecture_review + codex-subagent:/root/final_security_review
> **External Started**: 2026-07-15 13:20 +0800
> **External Completed**: pending final subject
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: af6d5216c2cd5adf2f672636a8308a309f0f5adb
> **Benchmark Evidence SHA256**: pending

- Source-side architecture delta: pass with no P0-P2 finding after the non-Git repair.
- Security delta: pass; aged-empty reclaim, partial-token liveness, pre-run identity, helper generation, and MCP effect disclosure are closed.
- Final external acceptance remains intentionally pending until the benchmark and workflow artifacts bind the final normalized subject.

## Residual Risks / Follow-ups

- Non-blocking P3: legacy hook-only `StateSnapshot` facts (`spec`, `pending`, evidence, and contract path) are read after canonical Effective State stability. A concurrent edit can make those compatibility-only fields reflect the next instant; canonical plan/profile/blockers remain the shared stable state. Do not widen this cutover; bundle them into the same observation only if that compatibility contract is changed later.
- ESA-06 guarded workflow-artifact overwrite semantics remain explicitly deferred and unmodified.

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| functionality | pending | Final benchmark/release gates not yet recorded. |
| Product depth | 9/10 | Single authority reaches direct, CLI, hook, MCP, and adopted helper surfaces. |
| Design quality | 9/10 | Core/effects/adapters and two concurrency authorities are explicit and enforced. |
| code_quality | pending | Focused/package evidence is green; full release gate remains. |

## Failing Items

- Final subject-bound 3x9 benchmark and release/workflow/PR gates are pending by sequence, not currently failed.

## Retest Steps

- Validate or produce the frozen-subject benchmark, then run `bun run check:release`.
- Bind the current `repo-harness-hook review-subject --target origin/main --format json` result in both review headers.
- Run strict contract/sprint/workflow gates and merge only after hosted PR checks pass.

## Summary

- Source architecture and security deltas pass. Review remains pending until one code-frozen benchmark plus final release/workflow/PR evidence is bound.
