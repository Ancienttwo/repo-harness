# Task Review: ESA-01..05 + ESA-07 Effective State authority convergence

> **Status**: In Progress
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Contract**: tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md
> **Notes File**: tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 15:25 +0800
> **Recommendation**: pending
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: pending
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: af6d5216c2cd5adf2f672636a8308a309f0f5adb

## Human Review Card

- Verdict: pending final release gates and Claude subject binding.
- Change type: code-change / internal authority cutover / non-breaking `0.10.1` package surface.
- Intended files changed: ESA-01..05 / ESA-07 core, effects, adapters, public interface, generated helper/hook projections, tests, docs, release metadata, and workflow artifacts listed by the contract.
- Actual files changed: intended contract scope only; ESA-06 workflow-artifact writer is absent from the diff.
- Commands passed so far: typecheck; hook/helper/state-boundary projection gates; focused core/effects/concurrency/adapter/capability tests; non-Git state-snapshot suite; clean tarball/install smoke; final 100-resolution benchmark; and authoritative 3x9 validation.
- Residual risks: final release/workflow gates, exact Claude review subject, hosted CI, and PR merge remain pending. One non-blocking hook-only snapshot timing residual is recorded below.
- Reviewer action required: bind Claude acceptance to the final workflow subject and benchmark evidence, then pass strict gates.
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
- P2 closed in the third and final repair round: Win32 backslash traversal is rejected by dual-grammar containment; worktree/common-dir canonicalization errors fail closed; explicit non-Git metadata absence remains the only version-`0` degradation; the unused standalone cache writer is removed.
- P1 closed: state-snapshot non-Git fixtures regressed when read-only version lookup required a Git common-dir. Only owner-path resolution now returns baseline `0`; an existing corrupt owner still fails closed. Original suite: 7 pass.
- P1 closed: MCP had hidden cache/version effects. The tool now advertises `readOnlyHint: false`, and tests assert both writes while keeping product authority unchanged.
- P2 closed: boundary validation could execute a target-owned generator and missed actual legacy parser names. It is now static/source-hash only and adversarial fixtures cover target-script non-execution, Effects-to-CLI imports, and migrated names.
- P2 closed: generated Bun bundling erased the adopted helper type surface. The deterministic typed source projection is source-hash bound, directly typechecked, and packed-smoked.

## Verification Evidence To Date

- `bun run check:type`: pass.
- `bun run check:hooks`: 25-file projection pass, `sha256:a28c881fdbbff56ab039140c355bf468ca7b2451ae34a6a372d99972efc6f53f`.
- `bun run check:helpers`: 49-helper projection pass, `sha256:5b82b946bb37c6ce1ea69f8e1e117f849326ce55ec8bfa741f38c6f50c8edf08`.
- `bun run check:state-boundaries`: 102 TypeScript files checked.
- Pre-third-round relevant matrix: 167 pass, 0 fail, 1,500 assertions across all state tests plus Effective State, runtime-profile, capability, CLI state, and MCP public-path suites. Third-round focused verification passes 71/71 across Effective State, effects/transaction, and non-Git snapshot paths; type, boundary, and diff checks pass.
- Independent third-round exact-subject review passed with no P0-P2 at `sha256:b8036b345fb15826b6e49658e0660f412bc69669d9f8e50ac0a35d858e965120`, target `af6d5216c2cd5adf2f672636a8308a309f0f5adb`, overlap `0`; the reviewer independently reran 64 focused tests plus type/boundary checks.
- Type, hook/helper projection, state-boundary, and clean tarball/install gates pass on the final source commit.
- Final 100-resolution result is median `169.460 ms`, p95 `241.095 ms`, under the `297.648 ms` budget. The sole final 3x9 run passed all 27 arms and validates authoritative with benchmark subject `sha256:f7f7cebdb595359aff5a0639e490376bf1e7f8aa452b1d3284072304ce70be0b` and evidence `sha256:676fb10bb9012919baf96e7464e9e741cf4ec7c8eb36548036be105f33b28373`.

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

- Release/workflow/Claude/PR gates are pending by sequence, not currently failed; benchmark evidence is complete and must not be rerun.

## Retest Steps

- Run `bun run check:release` and the strict workflow finish gates without regenerating benchmark evidence.
- Bind the current `repo-harness-hook review-subject --target main --format json` result in both review headers; PR/merge comparison against `origin/main` is a separate merge gate.
- Run strict contract/sprint/workflow gates and merge only after hosted PR checks pass.

## Summary

- Source architecture, security, package, p95, and authoritative 3x9 evidence pass. Review remains pending only for final release/workflow/Claude/PR binding.
