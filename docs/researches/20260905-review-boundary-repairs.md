# Execution boundaries and Stop completion

Scope: review repairs based on `41f52197`, integrated with main `11a2a6fb`. This document records durable invariants and verified limits, not a release verdict.

## P1: Authority map

CLI adapters parse requests; core modules validate protocol shapes; effect stores own durable identity, authorization and Git publication. ArchContext owns recommendation meaning. repo-harness owns Task/Claim/Engineer joins, execution receipts and workflow transitions. Stop is an in-process route but launches local provider/helper children.

Root agent files, bootstrap (`scripts/lib/project-init-lib.sh`), Claude/Codex partials and the packaged check command all influence verification selection. Fixing only root AGENTS.md leaves generated consumers and command instructions inconsistent.

## P2: Repaired paths

- `stepAutomationController` reads the acquired attempt and the immutable dispatch authority, joins Task/revision, Claim/generation, WorkEnvelope and Engineer Binding/generation, then reserves budget and starts an attempt. Mismatches fail before host action or outcome attribution.
- Refactor materialization validates every bound accepted Recommendation payload. The existing `begin_plan` event binds the immutable Program digest. Candidate verification persists its receipt; execution binding reads it back and requires the same PR head. Final-main measurement is separate from each merge commit's ancestry. A Board digest includes its measured HEAD.
- WorkDemand builds Sprint and Work Graph in one Git tree, fsyncs an exact publication intent/receipt, and performs CAS. Recovery recognizes either the expected old head or the exact journaled new commit. Any other head is rejected.
- Canonical Sprint readers enumerate live carriers at one fixed commit using policy's Sprint directory. Missing or invalid Status metadata is rejected, not classified as inactive. Proposed materialization substitutes its candidate content into that same namespace check. Completed rows in a live Sprint retain IDs; archived Sprints do not block live allocation. The existing schema-1 migration/reconciliation raw-read window remains available, but cannot mint execution identity; migration validates its rewritten schema-2 candidate before writing.
- Campaign start retries without an explicit timestamp reuse the first immutable definition. Journal reads and terminal/reconciliation operations do not require fresh execution authority. Execution operations, including Issue authoring before intent persistence or browser dispatch, still do. Expiration recording requires the exact immutable grant and actual expiry, but permits a moved target. Issue follow-up resolves its source session from the same immutable intent's existing session records before contacting the browser.
- Candidate verification validates the live Sprint namespace at the exact candidate commit before contract/provider verification and receipt creation; downstream receipts cannot substitute for this identity admission check.

## P3: Decisions and limits

No new dependencies, inferred provider semantics, compatibility readers or parallel authority registries were added. Publication replay needs a new intent record because Git CAS and workflow receipt storage are separate durability boundaries. The global Task-ID check is a shared pure invariant over existing parsers, not a second parser.

At 10x volume, cross-store identity errors and multiple sequential merges are more consequential than local computation. Canonical uniqueness currently costs one tree listing and one read per live Sprint, not a process per row. Stop must not multiply a full provider timeout by changed-path count.

### Running hook evidence

A read-only two-day telemetry pass collected 358 `Stop.default` and 102 `SubagentStop.quality` completions. Stop p50 was 706.88 ms, p95 15.381 s, maximum 64.165 s; SubagentStop maximum was 9.78 ms. The longest observed Stop ran 2026-09-05 03:47:59–03:49:03 HKT. Terminal Working duration is cumulative turn time, not this route's elapsed time.

The long Stop synchronously invoked Archctx automatic projection and recorded an ENOENT while statting a plan under the independently edited BRC4 worktree. The installed hook matched the inspected source. CodeGraph respected `.gitignore` and had no nested BRC4 rows. The failing package path is Archctx 0.5.6 `planUpdate → openSession → bindRepository → computeWorktreeDigest2`: its generic digest runs before the projection-specific profile that excludes `.ai/harness`.

Consumer mitigation shares a 20-second deadline across deferred architecture/journal work, honors the caller deadline in the projection orchestrator, and supervises child process groups. Host time-slice exhaustion retains the job without spending a business retry. This is not a claim that all synchronous filesystem operations or the entire Stop route have a hard 20-second bound; child cleanup has a bounded grace period. Explicit drain retains the longer policy budget, and strict gates remain enforced.

The shipped single-file hook reenters its own supervisor and launcher through explicit internal flags selected by the existing build define. Source execution keeps its source entrypoints. Real bundle tests cover both successful child execution and TERM-resistant descendant cleanup; a source-only test would miss the absent companion-file failure in a packed bundle.

Upstream repair remains: projection `openSession` must use the projection digest profile before scanning. The package exposes no consumer option to exclude nested worktrees from its generic digest. A CodeGraph configuration change or local node_modules patch would not be an appropriate repair.

### Unresolved authority contracts

- Campaign has no typed Campaign-to-owned-publication proof. Post-merge continuation remains fail-closed; ancestry alone is insufficient ownership evidence.
- Accepted Recommendation payload mirrors are validated, but providerStage and routeReasonCodes lack complete scan-assessment provenance. They do not affect route/activation permission. Current provider readback has no assessment-digest lookup carrying scaleReasonCodes; do not reconstruct those semantics locally.
- Installed hook deployment and architecture acceptance must be verified separately from source regression tests. Neither is satisfied by a passing unit suite.

### Verification selection

Docs/ledger-only changes require diff/link/path and affected workflow checks. Isolated code requires its regression and impacted suites plus appropriate static checks. Shared-contract, auth, publication, migrations, hooks/runtime, cross-module and release changes require full verification; uncertain impact escalates. Explicit contract and CI requirements stay stronger. A later docs-only closeout does not invalidate passing executable-source evidence by itself.

## Campaign browser composition boundary

The Campaign CLI now supplies readBrowserBinding, runBrowserConsult and runBrowserFollowup to the authoring effect. The effect requires those capabilities instead of importing CLI modules or selecting defaults. It continues to validate campaign and profile authority before persistence, persists the immutable intent before browser dispatch, and records the exact returned session fields. Generic result preservation avoids projecting away browser output fields. No dependencies or files were added for this repair.

The injected-binding regression failed on the old source with issue_authoring_profile_mismatch, then passed after inversion. Both authoring/CLI suites passed (11 tests), TypeScript passed, and the repository-wide state-boundaries guard changed from three EFFECTS_REVERSE_IMPORT violations to zero. The guard is now an explicit final contract criterion; a full Bun test pass alone is insufficient evidence for this layer invariant.
