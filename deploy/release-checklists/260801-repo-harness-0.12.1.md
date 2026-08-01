# repo-harness 0.12.1 Release Filing

- Date: 2026-08-01
- Package: `repo-harness@0.12.1`
- Base release: `v0.12.0`
- Source range: `v0.12.0..candidate`
- Release scope: thread a single SessionStart-minted run identity through
  hook telemetry and evidence correlation via a new `run-identity.ts`
  mint/resolution authority that replaces each writer's own self-minted
  run id, restructure the five-language README suite into a
  get-started-first layout (872 to 451 lines on the English README, with
  deep-dive content relocated into `docs/reference-configs`), and refresh
  the `@colbymchenry/codegraph` dev dependency line from `1.4.1` to
  `1.5.0`.
- Publish status: **pending publish**. This filing does not claim npm, Git
  tag, or GitHub Release completion until the public readbacks below pass.

## Candidate Evidence

- `00a703e8` (PR #146) adds `run-identity.ts` as the single
  SessionStart-only mint and resolution authority (payload ->
  `HOOK_RUN_ID` -> `CODEX_RUN_ID` -> `CLAUDE_RUN_ID` -> session-state
  lookup -> null), storing one bounded `session-run-identity.json` slot,
  and wires `event-telemetry.ts` and `command-observed.ts` to the unified
  resolver instead of independent chains or self-minted `run-${Date.now()}`
  fallbacks, closing the gap where `hook-events.jsonl` `run_id` was always
  empty and never joined to evidence `correlation_run_id`.
- `629c9af6` (PR #145) rebuilds `README.md` as a codegraph-style layout
  (centered header, TOC, Get Started at line 40, key-features table),
  cutting it from 872 to 451 lines, relocates deep-dive content into
  `docs/reference-configs` (install profiles, general-repo MCP, harness
  overview, hook operations) before deletion so nothing is lost, rewrites
  the four translations (zh-CN, ja, fr, es) against the new 14-section
  structure with byte-identical code blocks and localized TOC anchors, and
  updates the `readme-dx` and install-script characterization tests to pin
  the new contract.
- `17b8d57b` bumps the `@colbymchenry/codegraph` dev dependency from
  `1.4.1` to `1.5.0` in `package.json` and `bun.lock`.
- Version sources and localized README projections are `0.12.1`; the
  generated stamp is `repo-harness@0.12.1+template@0.12.1`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm all GitHub CI jobs are green for the merged source commit.
- [ ] Run `bun run check:release` on that exact merged commit.
- [ ] Publish `repo-harness@0.12.1` to the official npm registry with `latest`.
- [ ] Create and push annotated tag `v0.12.1` at the published source commit.
- [ ] Create stable GitHub Release `repo-harness 0.12.1` from `v0.12.1` with no
      attached asset, matching the established release convention.
- [ ] Run `bash scripts/check-release-published.sh 0.12.1` and verify registry,
      dist-tag, tarball integrity, source tag, GitHub Release, and clean-room CLI.

## Candidate Verification Record

- This release-prep pass has no separate `tasks/reviews/*.review.md`
  artifact; the candidate's required checks (`bun test`,
  `check-deploy-sql-order.sh`, `check-architecture-sync.sh`,
  `check-task-sync.sh`, `check-task-workflow --strict`,
  `inspect-project-state.ts`, `cli init --dry-run`, and the
  `check:release` preflight) are run directly against this branch and
  reported in the release-prep task execution record.
- Hosted CI, exact-main release gate, npm publication, annotated tag, GitHub
  Release, and published-package readbacks remain mandatory release operations;
  no unchecked item above is represented as completed by this source filing.

## Rollback

- Before npm publication: revert or abandon the release-prep commits.
- After npm publication: never move/reuse `v0.12.1`; correct forward with a new
  patch release.
