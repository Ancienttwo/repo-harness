# Task Review: ESA-01..05 + ESA-07 Effective State authority convergence

> **Status**: In Progress
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Contract**: tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md
> **Notes File**: tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 14:45 +0800
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
- Commands passed so far: typecheck; hook/helper/state-boundary projection gates; focused core/effects/concurrency/adapter/capability tests; and the original non-Git state-snapshot suite. The pre-thaw tarball proof is stale and is not current evidence.
- Residual risks: final authoritative benchmark, release gate, exact final review subject, hosted CI, and PR merge remain pending. One non-blocking hook-only snapshot timing residual is recorded below.
- Reviewer action required: bind the final subject and benchmark evidence after workflow closeout, then pass strict gates.
- Rollback: revert this isolated branch; no persisted repository schema or protocol migration is involved.

## P1/P2/P3 Review

- P1: architecture now has one pure core authority, explicit state/review effects, and thin CLI/hook/MCP adapters. The public Effective State v1 contract is packed under `interfaces/`; adopted capability logic is a generated typed projection rather than a handwritten second implementation.
- P2: CLI risk input → canonical repo lock → stable authority/source observation → pure projection → Git-common-dir transaction (rollback-capable cache first, owner commit last) → adapter projections. Lock, pre-token, PID residual, publication fault, and linked-worktree paths have real-process proofs.
- P3: public protocol/tool/command semantics remain stable, MCP additions are labeled and additive, and retired authoring paths are deleted without a compatibility shim. ESA-06 is deferred, so the release remains `0.10.1`.

## Findings And Closure

- P1 closed: linked worktrees previously had independent version owners. The owner and allocation lock now live in Git common-dir; twelve concurrent allocators across two worktrees return exactly `1..12`.
- P1 closed: flat-file stale reclaim and symlink ancestors could split lock authority. Canonical roots, stepwise no-symlink ancestor validation, unique token files, dead-PID validation, inode checks, and exact-token unlink close the portable scope. Empty pre-token directories and live/unknown PID identity remain fail-closed for verified manual recovery.
- P1 closed: allocating the shared version before cache publication exposed an owner-only partial commit. The common-dir lock now covers candidate selection, cache publication, rollback, and owner-last commit; cache/owner fault injection and linked-worktree retry prove no version is consumed on failure.
- P1 closed: plan `EACCES` and malformed/unreadable policy metadata could be interpreted as absent. Only `ENOENT` now means absence, resolver-owned policy fields validate eagerly even on clean inspect, and registry read/malformed behavior is fail-closed.
- P1 test evidence closed: CLI and hook run through real subprocesses and MCP through public dispatch. Authority fields agree across adapters; CLI follows requested risk while hook/MCP deliberately follow fixed inspect policy.
- P1 closed: state-snapshot non-Git fixtures regressed when read-only version lookup required a Git common-dir. Only owner-path resolution now returns baseline `0`; an existing corrupt owner still fails closed. Original suite: 7 pass.
- P1 closed: MCP had hidden cache/version effects. The tool now advertises `readOnlyHint: false`, and tests assert both writes while keeping product authority unchanged.
- P2 closed: boundary validation could execute a target-owned generator and missed actual legacy parser names. It is now static/source-hash only and adversarial fixtures cover target-script non-execution, Effects-to-CLI imports, and migrated names.
- P2 closed: generated Bun bundling erased the adopted helper type surface. The deterministic typed source projection is source-hash bound, directly typechecked, and packed-smoked.

## Verification Evidence To Date

- `bun run check:type`: pass.
- `bun run check:hooks`: 25-file projection pass, `sha256:a28c881fdbbff56ab039140c355bf468ca7b2451ae34a6a372d99972efc6f53f`.
- `bun run check:helpers`: 49-helper projection pass, `sha256:5b82b946bb37c6ce1ea69f8e1e117f849326ce55ec8bfa741f38c6f50c8edf08`.
- `bun run check:state-boundaries`: 102 TypeScript files checked.
- Final pre-freeze relevant matrix: 167 pass, 0 fail, 1,500 assertions across all state tests plus Effective State, runtime-profile, capability, CLI state, and MCP public-path suites. The earlier repair subset passed 72/72 after eager policy validation and deterministic pre-token/PID proofs.
- Type, hook/helper projection, and state-boundary gates pass; the pre-thaw packed tarball proof is stale and will be regenerated only after clean freeze.
- Existing report subject `sha256:88a8a1086a5ccc4c6629c1bf134b6706b3051ec1944d900f9f51d30bb445cad3`, the pre-freeze `170.305/215.574` calibration, and the aborted run on commit `8916cb43` are invalid for the current source. One new 3x9 run is permitted only after clean freeze and cheap gates/review.

## External Acceptance Advice

> **External Acceptance**: pending
> **External Reviewer**: Codex architecture and security specialists
> **External Source**: codex-subagent:/root/final_architecture_review + codex-subagent:/root/lock_invariant_review + codex-subagent:/root/state_transaction_review
> **External Started**: 2026-07-15 13:20 +0800
> **External Completed**: pending final subject
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: af6d5216c2cd5adf2f672636a8308a309f0f5adb
> **Benchmark Evidence SHA256**: pending

- Adapter/source architecture delta: pass with no P0-P2; public-path evidence distinguishes authority parity from the fixed-inspect policy delta.
- Lock/security delta: pass with no P0-P2 after ancestor, empty-window, exact-token, and PID residual proofs.
- Publication/policy delta: pass with no P0-P2 after eager policy validation and cache-first/owner-last transaction faults.
- Final external acceptance remains intentionally pending until the benchmark and workflow artifacts bind the final normalized subject.

## Residual Risks / Follow-ups

- Non-blocking P3: legacy hook-only `StateSnapshot` facts (`spec`, `pending`, evidence, and contract path) are read after canonical Effective State stability. A concurrent edit can make those compatibility-only fields reflect the next instant; canonical plan/profile/blockers remain the shared stable state. Do not widen this cutover; bundle them into the same observation only if that compatibility contract is changed later.
- PID reuse is a fail-closed availability residual requiring verified manual cleanup after timeout; automatic incarnation detection would require unapproved host-native APIs. Active hostile ancestor rename after validation similarly requires dirfd/openat primitives outside this portable TypeScript scope.
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
- Bind the current `repo-harness-hook review-subject --target main --format json` result in both review headers; PR/merge comparison against `origin/main` is a separate merge gate.
- Run strict contract/sprint/workflow gates and merge only after hosted PR checks pass.

## Summary

- Source architecture and security deltas pass. Review remains pending until one code-frozen benchmark plus final release/workflow/PR evidence is bound.
