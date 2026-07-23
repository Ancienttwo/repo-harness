> **Archived**: 2026-07-24 06:28
> **Related Plan**: plans/archive/plan-20260724-0427-codex-native-profile-aware-status.md
> **Outcome**: Completed
> **Lifecycle**: notes
> **Parent Run ID**: run-20260724-0628

# Implementation Notes: codex-native-profile-aware-status

> **Status**: Active
> **Plan**: plans/plan-20260724-0427-codex-native-profile-aware-status.md
> **Contract**: tasks/contracts/20260724-0427-codex-native-profile-aware-status.contract.md
> **Review**: tasks/reviews/20260724-0427-codex-native-profile-aware-status.review.md
> **Last Updated**: 2026-07-24 06:24
> **Lifecycle**: notes

## Design Decisions

- Steady-state install vocabulary is exactly `minimal|full`. Minimal reuses
  the former 7-hook standard component baseline; full is the deterministic
  union of former product-planning and strict surfaces with 11 Codex hooks.
  Fresh global bootstrap and adapter-only install default to full.
- Installed state protocol 2 is the only steady-state authority. Protocol 1
  remains readable only through `--migrate-profile-state`, because its
  `minimal` value meant the retired 5-hook projection. The migration action is
  explicit; its target profile defaults to full when omitted.
- `runStatus()` delegates expected route membership to
  `buildManagedHooks(recordedProfile)` and owns no count table. Missing state
  uses the full-registry diagnostic baseline without fabricating a profile.
- Invalid state is typed as `legacy_protocol` only when the dedicated legacy
  parser fully validates it. Corrupt JSON, malformed legacy state, and invalid
  protocol-2 state are `corrupt_current`; setup offers no command that is
  guaranteed to fail for those states.
- Adapter-only install validates recorded state before any mutation but does
  not inherit its profile. This preserves the user-selected default-full rule;
  a deliberately minimal host must pass `--profile minimal`.
- Migration and profile switches snapshot every host mutation path, including
  install state, hooks, agent files, profile-owned Skills, and the external
  skill lock. The failure regression proves the legacy state and removed
  surfaces are restored byte-for-byte.
- The benchmark harness profiles remain `adaptive-lite|strict-harness`, but
  their installed runtime projection now maps to `minimal|full`; repository
  workflow profiles and adoption modes remain a separate unchanged axis.

## Deviations From Plan Or Spec

- No product-scope deviation.
- Codex `apply_patch` hooks resolve repository state from the task's primary
  checkout even when the approved contract lives in a sibling worktree. An
  absolute worktree target was rejected as `capability_registry:invalid`.
  Edits therefore used a temporary `.codex-task-wt` symlink in the primary
  checkout so the native edit event remained inspectable and the bytes landed
  in the approved worktree. The link is local-only and must be removed before
  closeout.
- The linked worktree does not inherit the primary checkout's `.codegraph/`
  index or `node_modules`. CodeGraph correctly reported the worktree as
  unindexed; targeted verification used a local `node_modules` symlink to the
  same checkout dependencies.
- The required full suite exposed the existing retired-name scan's fixed
  5-second budget as load-sensitive: the suite reached 2059 pass / 1 skip
  before that single test timed out at 5.123 seconds, while isolated runs
  passed at roughly 5.0 seconds. Because this directly blocked `bun test`, the
  one allowed out-of-scope blocking fix raised only that test's budget to 10
  seconds; its post-change isolated run passed 5/5 in 5.17 seconds. The
  nine-minute full matrix was not reproduced after a timeout-only test change.

## Tradeoffs Considered

| Option | Decision | Reason |
|--------|----------|--------|
| Compare every install with `routesForHost(host).length` | Reject | Confuses registry coverage with the selected install projection and creates false repair actions. |
| Add literal 5/7/7/11 expected-count constants in status | Reject | Duplicates installer policy and will drift as route membership changes. |
| Count `buildManagedHooks(host, recordedProfile)` | Use | Reuses the installation projection and keeps one authority for profile membership. |
| Change invalid/missing state to `expectedEntryCount: null` | Reject for this slice | Broadens the public status schema; explicit profile diagnostics plus the existing registry baseline preserve current no-state behavior without fabricating a profile. |
| Infer a migration command for every invalid state | Reject | Only a fully valid protocol-1 state is migratable; corrupt state requires manual authority recovery. |
| Preserve old profile names as aliases | Reject | Would retain dual semantic authority and silently reinterpret old `minimal`. |

## Open Questions

- None.

## Evidence Links

- Checks: `.ai/harness/checks/latest.json`
- Run snapshots: `.ai/harness/runs/`
- Red-first migration failure:
  `.ai/harness/runs/20260724-0427-codex-native-profile-aware-status/profile-migration-red.txt`
- Disposable-HOME characterization:
  `.ai/harness/runs/20260724-0427-codex-native-profile-aware-status/profile-migration-characterization.txt`
- Focused regression after final review fixes:
  `bun test tests/cli/status.test.ts tests/cli/init-hook.test.ts tests/cli/install.test.ts tests/install-profiles.test.ts tests/harness-benchmark-matrix.test.ts`
  (118 pass, 0 fail).
- Typecheck: `bun run check:type` (pass).
- Root adoption drift probe:
  `bun src/cli/index.ts adopt --repo . --dry-run` (pass, 0 planned
  operations). It is intentionally not a contract `commands_succeed` item
  because strict contract verification classifies adoption commands as
  forbidden evidence producers.
- Sol Max reviews found and then verified fixes for adapter-only legacy-state
  bypass, mixed-state setup health, migration compensation coverage, invalid
  state discrimination, and adapter-only documentation.
- Strict contract verification: 28/28 criteria passed and the contract was
  materialized as `Fulfilled`.
- Required checks passed: deploy SQL order, architecture sync, task sync,
  source workflow strict gate, project-state inspection, source adoption
  dry-run, typecheck, and diff whitespace check. The installed package helper
  is intentionally not refreshed in this no-HOME-mutation slice; binding the
  installed CLI to this checkout with `REPO_HARNESS_SOURCE_ROOT="$PWD"` makes
  its strict workflow check pass.
- Review subject:
  `sha256:4e0b7b062cb57f8b7c794b4b29032b967194ce67fcff55da5d69c68ff8b66234`
  against `main@71a52dde5e8476308bf74f8ada8bdf752b7cbe7b`.
- Main advanced after the worktree fork and overlaps only
  `tests/skill-surface/retired-names-scan.test.ts`: main adds two provenance
  allowlist entries while this slice raises the scan timeout. Git closeout
  preserved both changes and the combined test passes 5/5. After merging
  `main@71a52dde`, the contract rollback checkpoint was advanced from the
  original fork point `96c908f7` to that frozen target revision so
  allowed-path verification compares only this package rather than
  reclassifying already-landed mainline changes.

## Promotion Filter

Promote a candidate to `tasks/lessons.md`, `docs/researches/`, or harness asset files only when all three hold: hard to reverse, surprising without local context, and a real trade-off existed. If any one is missing, keep it in this notes file instead.

## Promotion Candidates

- The profile-relative adapter conclusion is promoted directly into
  `docs/researches/20260716-gpt-5-6-prompt-guidance-harness-audit.md`.
- The primary-checkout versus contract-worktree edit-event root mismatch is a
  candidate for the subsequent Codex-native event-ingestion slice, but is not
  promoted to a general lesson until reproduced outside this task.
