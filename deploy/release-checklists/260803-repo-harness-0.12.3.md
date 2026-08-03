# repo-harness 0.12.3 Release Filing

- Date: 2026-08-03
- Package: `repo-harness@0.12.3`
- Base release: `v0.12.2`
- Source range: `v0.12.2..candidate`
- Release scope: add an opt-in Claude-host main-loop dispatch guard that denies
  orchestrator code edits with a dispatch-to-subagent instruction while leaving
  subagent edits and non-code paths untouched, and make Claude-host hook
  fixtures hermetic against that guard's environment key.
- Publish status: **pending publish**. This filing does not claim npm, Git tag,
  or GitHub Release completion until the public readbacks below pass.

## Candidate Evidence

- `b039a99a` adds `MainLoopDispatchGuard` to `src/cli/hook/mutation-guard.ts`.
  It arms only on `REPO_HARNESS_MAIN_LOOP_EDIT_GUARD=1|true` together with
  `HOOK_HOST=claude`, treats an absent payload `agent_id`/`agent_type` pair as
  the orchestrator thread, and denies `Edit`/`Write` on code-extension paths
  with a dispatch instruction. It is a strong boundary evaluated per path and
  independent of plan state, spec presence, and workflow-profile resolution, so
  the dispatch instruction precedes any plan advisory. Product default is off.
- The same commit makes the Claude-host fixture boundary hermetic: fixtures
  pinning `HOOK_HOST=claude` in `tests/session-state-authority.test.ts` and
  `tests/state/loop-semantics-characterization.test.ts` strip the new
  environment key so an armed operator shell cannot flip frozen
  characterization goldens. `tests/mutation-guard.test.ts` covers the armed and
  unarmed paths, subagent pass-through, and non-code pass-through.
- `36fa86df` projects the acceptance receipt into the review artifact and
  `c8ffee7b` archives the fulfilled main-loop-dispatch-guard workflow package;
  neither adds product compatibility paths.
- Version sources and localized README projections are `0.12.3`; the generated
  stamp is `repo-harness@0.12.3+template@0.12.3`.

## Required Release Sequence

- [ ] Merge the release-candidate changes to `main` without unrelated files.
- [ ] Confirm all GitHub CI jobs are green for the merged source commit.
- [ ] Run `bun run check:release` on that exact merged commit.
- [ ] Publish `repo-harness@0.12.3` to the official npm registry with `latest`.
- [ ] Create and push annotated tag `v0.12.3` at the published source commit.
- [ ] Create stable GitHub Release `repo-harness 0.12.3` from `v0.12.3` with no
      attached asset, matching the established release convention.
- [ ] Run `bash scripts/check-release-published.sh 0.12.3` and verify registry,
      dist-tag, tarball integrity, source tag, GitHub Release, and clean-room CLI.

## Candidate Verification Record

- The release gate is run on the release-prep branch before merge and again on
  the exact merged `main` commit before publication.
- Hosted CI, exact-main release gate, npm publication, annotated tag, GitHub
  Release, and published-package readbacks remain mandatory release operations;
  no unchecked item above is represented as completed by this source filing.

## Rollback

- Before npm publication: revert or abandon the release-prep commit.
- After npm publication: never move or reuse `v0.12.3`; correct forward with a
  new patch release.
