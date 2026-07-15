> **Archived**: 2026-07-16 00:22
> **Related Plan**: plans/archive/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Outcome**: Completed
> **Lifecycle**: review
> **Parent Run ID**: run-20260716-0022

# Task Review: ESA-01..05 + ESA-07 Effective State authority convergence

> **Status**: Reviewed
> **Plan**: plans/plan-20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.md
> **Contract**: tasks/contracts/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.contract.md
> **Notes File**: tasks/notes/20260715-1109-esa-01-freeze-effective-state-invariants-and-characterization-fixtures.notes.md
> **Checks File**: .ai/harness/checks/latest.json
> **Last Updated**: 2026-07-15 22:53 +0800
> **Recommendation**: pass
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:efd70940ebccd448141477864a6615a86cb0a9a5b93f6be16e9c2b2eae300003
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: af6d5216c2cd5adf2f672636a8308a309f0f5adb

## Human Review Card

- Verdict: pass
- Change type: code-change / internal authority cutover / non-breaking `0.10.1` package surface.
- Intended files changed: ESA-01..05 / ESA-07 core, effects, adapters, public interface, generated helper/hook projections, tests, docs, release metadata, and workflow artifacts listed by the contract.
- Actual files changed: intended contract scope only; ESA-06 workflow-artifact writer is absent from the diff.
- Commands passed so far: typecheck; hook/helper/state-boundary projection gates; focused core/effects/concurrency/adapter/capability tests; non-Git state-snapshot suite; the full release/package gate; clean tarball/install smoke; the final 100-resolution benchmark; the topology regression; and the current authoritative 3x9 validator.
- Residual risks: strict workflow finish, hosted CI, and PR merge remain pending. One non-blocking hook-only snapshot timing residual and one benchmark fingerprint debt are recorded below.
- Reviewer action required: none in the reviewed subject; proceed through strict workflow and remote gates.
- Rollback: revert this isolated branch; no persisted repository schema or protocol migration is involved.

## P1/P2/P3 Review

- P1: architecture now has one pure core authority, explicit state/review effects, and thin CLI/hook/MCP adapters. The public Effective State v1 contract is packed under `interfaces/`; adopted capability logic is a generated typed projection rather than a handwritten second implementation.
- P2: CLI risk input → canonical repo lock → stable authority/source observation → pure projection → Git-common-dir transaction (rollback-capable cache first, owner commit last) → adapter projections. Lock, pre-token, PID residual, publication fault, and linked-worktree paths have real-process proofs.
- P3: public protocol/tool/command semantics remain stable, MCP additions are labeled and additive, and retired authoring paths are deleted without a compatibility shim. ESA-06 is deferred, so the release remains `0.10.1`.

## Findings And Closure

- P1 evaluator topology closed: the grader workspace is now precreated as a linked worktree for both Adaptive Lite and Strict. Runtime promotion therefore cannot redirect provider output into an ungraded second-level worktree; No Harness and Strict-only projection semantics remain unchanged.
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

- Benchmark topology pre-fix: 24 pass / 1 fail, with the sole failure proving Adaptive Lite remained a primary workspace. Post-fix: 25/25 pass, 141 assertions; type, architecture sync, task sync, strict workflow, and diff checks pass.
- First final release-gate attempt: 1,590 pass / 1 skip / 1 fail. The sole failure was the pre-ESA-04 helper byte-identity assertion; the product projection gate and standalone resolver suite passed. The bounded repair adds only `capability-resolver.ts` to the test's explicit intentional-divergence list and leaves source/report bytes untouched.
- Bounded helper-contract reverify: the exact helper assertion, 9 standalone resolver tests, and the 49-helper projection/hash gate pass. The second full `bun run check:release` passes 1,591 tests with 1 skip, 0 failures, and 14,048 assertions; `[ci] OK`, `[release] OK`, tarball install, and packaged CLI startup all pass.
- `bun run check:type`: pass.
- `bun run check:hooks`: 25-file projection pass, `sha256:a28c881fdbbff56ab039140c355bf468ca7b2451ae34a6a372d99972efc6f53f`.
- `bun run check:helpers`: 49-helper projection pass, `sha256:5b82b946bb37c6ce1ea69f8e1e117f849326ce55ec8bfa741f38c6f50c8edf08`.
- `bun run check:state-boundaries`: 102 TypeScript files checked.
- Pre-third-round relevant matrix: 167 pass, 0 fail, 1,500 assertions across all state tests plus Effective State, runtime-profile, capability, CLI state, and MCP public-path suites. Third-round focused verification passes 71/71 across Effective State, effects/transaction, and non-Git snapshot paths; type, boundary, and diff checks pass.
- Independent third-round exact-subject review passed with no P0-P2 at `sha256:b8036b345fb15826b6e49658e0660f412bc69669d9f8e50ac0a35d858e965120`, target `af6d5216c2cd5adf2f672636a8308a309f0f5adb`, overlap `0`; the reviewer independently reran 64 focused tests plus type/boundary checks.
- Type, hook/helper projection, state-boundary, and clean tarball/install gates pass on the final source commit.
- Final 100-resolution result is median `169.460 ms`, p95 `241.095 ms`, under the `297.648 ms` budget. The `26dd6e88` 3x9 run passed 27/27 with benchmark subject `sha256:f7f7cebdb595359aff5a0639e490376bf1e7f8aa452b1d3284072304ce70be0b` and evidence `sha256:676fb10bb9012919baf96e7464e9e741cf4ec7c8eb36548036be105f33b28373`; it is historical and cannot satisfy the current frozen subject.
- Final authoritative run `c88767c6-bf6e-4425-be8b-02e275141d8b` started from clean frozen HEAD `606b02c17348dfb2085575d136fae1d38ea5728d` and passed all 27 structured Codex provider executions and graders. The report records the same `source_commit`, benchmark subject `sha256:c2c55a74bcb67448451f57fa10a8c6f2fe8f195992d2969b153781ce89e0d640`, and byte-bound evidence `sha256:4dc0944c44d337948ae98a59710ea982810af47c00813a99937ebd2300572658`; only the three allowed report artifacts changed during production.

## Manual Check Evidence

- [x] Golden matrix contains at least ten named scenarios
  - Evidence: `tests/state/fixtures/` contains 12 named normalized scenario records, and the final release run passed the CLI/state golden suite.
- [x] 100-resolution benchmark p95 remains within 10 percent of the ESA-01 baseline
  - Evidence: final p95 is `241.095 ms`, below the `297.648 ms` baseline-plus-10-percent budget by `56.553 ms`.
- [x] CLI matches requested-risk resolution; hook/MCP match inspect resolution; repository authority fields agree across every parity fixture
  - Evidence: the 12-scenario real CLI subprocess, hook subprocess, and public MCP dispatch matrix passes while explicitly separating requested-risk policy from fixed-inspect policy.
- [x] Generated capability helper is standalone and bound to the canonical source hash
  - Evidence: all 9 standalone resolver tests, the 49-helper projection check, direct typecheck, and packed tarball smoke pass at helper projection hash `sha256:5b82b946bb37c6ce1ea69f8e1e117f849326ce55ec8bfa741f38c6f50c8edf08`.
- [x] Authoritative 3x9 benchmark validates against the frozen final subject
  - Evidence: run `c88767c6-bf6e-4425-be8b-02e275141d8b` passed 27/27 at actual source commit `606b02c17348dfb2085575d136fae1d38ea5728d`; repo-local validation returns subject `sha256:c2c55a74bcb67448451f57fa10a8c6f2fe8f195992d2969b153781ce89e0d640` and evidence `sha256:4dc0944c44d337948ae98a59710ea982810af47c00813a99937ebd2300572658`.
- [x] Adaptive Lite and Strict providers, guards, focused checks, and graders observe the same precreated linked workspace; No Harness remains a plain isolated clone
  - Evidence: the topology regression passes 25/25, then the final matrix passes all Adaptive Lite and Strict cross-capability arms while No Harness retains primary-clone topology.
- [x] Evaluator review and external acceptance recommend pass for the final subject
  - Evidence: the top-level Recommendation and Human Review Card are `pass`, and Claude `claude-review` External Acceptance returned exact verdict `No findings.` for the bound normalized subject.

## External Acceptance Advice

> **External Acceptance**: pass
> **External Reviewer**: Claude
> **External Source**: claude-review
> **External Started**: 2026-07-15T22:48:23.286+0800
> **External Completed**: 2026-07-15T22:52:42.592+0800
> **Review Rubric Version**: 2
> **Reviewed Subject SHA256**: sha256:efd70940ebccd448141477864a6615a86cb0a9a5b93f6be16e9c2b2eae300003
> **Reviewed Subject Scope**: normalized-final-content
> **Reviewed Target Revision**: af6d5216c2cd5adf2f672636a8308a309f0f5adb
> **Benchmark Evidence SHA256**: sha256:4dc0944c44d337948ae98a59710ea982810af47c00813a99937ebd2300572658

- Adapter/source architecture delta: pass with no P0-P2; public-path evidence distinguishes authority parity from the fixed-inspect policy delta.
- Lock/security delta: pass with no P0-P2 after ancestor, empty-window, exact-token, and PID residual proofs.
- Publication/policy delta: pass with no P0-P2 after eager policy validation and cache-first/owner-last transaction faults.
- P1 blockers: none
- P2 advisories: none. The first bounded closeout review found one evidence-ordering P2; round two returned `No findings.` after the ordering repair, metadata session `bb03e338-6ea1-4ca7-a561-1c8ae9d70061` passed after expanding invalid directory criteria and adding exact manual evidence, budget-only session `2548e5ac-7997-4ad1-baae-2e61f6a8eb67` passed after the initial duplicate removal, and final single-authority session `9e0f1459-cd9e-4e50-8634-b02db425620d` returned exact output `No findings.` after retaining only the full release gate while moving required test identities to `files_exist`.
- Acceptance checklist: pass — the post-`2ca691ae` topology/test delta, helper-test contract, final contract metadata, workflow evidence, exact subject, and benchmark evidence are bound without reopening the already accepted source foundation.

## Residual Risks / Follow-ups

- Non-blocking P3: legacy hook-only `StateSnapshot` facts (`spec`, `pending`, evidence, and contract path) are read after canonical Effective State stability. A concurrent edit can make those compatibility-only fields reflect the next instant; canonical plan/profile/blockers remain the shared stable state. Do not widen this cutover; bundle them into the same observation only if that compatibility contract is changed later.
- PID reuse is a fail-closed availability residual requiring verified manual cleanup after timeout; automatic incarnation detection would require unapproved host-native APIs. Active hostile ancestor rename after validation similarly requires dirfd/openat primitives outside this portable TypeScript scope.
- ESA-06 guarded workflow-artifact overwrite semantics remain explicitly deferred and unmodified.
- Benchmark subject fingerprinting under-binds transitive `src/effects` runtime bytes. Current acceptance compensates by proving report `source_commit == frozen HEAD`, a clean checkout before execution, unchanged source HEAD during execution, and only the three expected report artifacts afterward; durable fingerprint repair remains outside this bounded slice.

## Scorecard

| Dimension | Score | Notes |
|---|---:|---|
| functionality | 9/10 | Final benchmark, release/package, public-path, concurrency, and fault gates pass. |
| Product depth | 9/10 | Single authority reaches direct, CLI, hook, MCP, and adopted helper surfaces. |
| Design quality | 9/10 | Core/effects/adapters and two concurrency authorities are explicit and enforced. |
| code_quality | 9/10 | Core/effects/adapters boundaries, generated-projection drift gates, and full release checks pass. |

## Failing Items

- None in the reviewed subject. Strict workflow, hosted CI, and PR merge remain operational gates.

## Retest Steps

- Run the strict workflow finish gates without regenerating successful benchmark evidence.
- Preserve the current exact-subject binding unless a normalized-subject file changes; PR/merge comparison against `origin/main` is a separate merge gate.
- Run strict contract/sprint/workflow gates and merge only after hosted PR checks pass.

## Summary

- Source architecture, security, package/release, p95, topology, current-subject 3x9 evidence, and independent exact-subject review pass. Strict workflow and remote PR gates remain.
